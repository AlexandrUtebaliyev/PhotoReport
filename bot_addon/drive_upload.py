"""
Загрузка фото в Google Drive от имени пользователя (OAuth).

У сервисного аккаунта нет своего места на Drive: загрузка от его имени падает
с storageQuotaExceeded, поэтому здесь используется OAuth пользователя.

Файлы рядом с модулем:
  client_secret.json — OAuth-клиент типа «Desktop app» (скачивается из Google Cloud Console)
  token.json         — создаётся при первом запуске через браузер

Оба файла НЕЛЬЗЯ коммитить (они в .gitignore).

Использование:
    from drive_upload import upload_photo
    file_id = upload_photo(path, date="2026-11-17", message_id=1807)

Функции синхронные; из async-кода вызывайте через asyncio.to_thread(...).
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/drive.file"]
FOLDER_NAME = "ShopLogger_Фото"

_BASE = Path(__file__).resolve().parent
CLIENT_SECRET_FILE = Path(os.getenv("DRIVE_CLIENT_SECRET", _BASE / "client_secret.json"))
TOKEN_FILE = Path(os.getenv("DRIVE_TOKEN", _BASE / "token.json"))

_lock = threading.Lock()
_service = None
_folder_id: str | None = None


def _credentials() -> Credentials:
    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if creds and creds.valid:
        return creds
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    else:
        if not CLIENT_SECRET_FILE.exists():
            raise FileNotFoundError(
                f"Не найден {CLIENT_SECRET_FILE}. Скачайте OAuth-клиент (Desktop app) "
                "из Google Cloud Console и положите рядом с drive_upload.py."
            )
        flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET_FILE), SCOPES)
        creds = flow.run_local_server(port=0)  # откроет браузер при первом запуске
    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    return creds


def get_service():
    global _service
    with _lock:
        if _service is None:
            _service = build("drive", "v3", credentials=_credentials(), cache_discovery=False)
        return _service


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def ensure_folder() -> str:
    """Находит или создаёт папку ShopLogger_Фото и открывает её «всем, у кого есть ссылка»."""
    global _folder_id
    if _folder_id:
        return _folder_id
    service = get_service()
    q = (
        f"name = '{_escape(FOLDER_NAME)}' and "
        "mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    )
    found = service.files().list(q=q, fields="files(id)", pageSize=1).execute().get("files", [])
    if found:
        folder_id = found[0]["id"]
    else:
        folder = service.files().create(
            body={"name": FOLDER_NAME, "mimeType": "application/vnd.google-apps.folder"},
            fields="id",
        ).execute()
        folder_id = folder["id"]
        logger.info("Создана папка Drive %s (%s)", FOLDER_NAME, folder_id)
    # «Все, у кого есть ссылка — читатель» (повторная выдача безопасна)
    service.permissions().create(
        fileId=folder_id, body={"type": "anyone", "role": "reader"}, fields="id"
    ).execute()
    _folder_id = folder_id
    return folder_id


def find_file(name: str) -> str | None:
    """ID уже загруженного файла с таким именем (для идемпотентности)."""
    service = get_service()
    q = f"name = '{_escape(name)}' and '{ensure_folder()}' in parents and trashed = false"
    files = service.files().list(q=q, fields="files(id)", pageSize=1).execute().get("files", [])
    return files[0]["id"] if files else None


def upload_photo(path: str | Path, date: str, message_id: int | str) -> str:
    """
    Загружает фото в папку ShopLogger_Фото под именем <дата>_<message_id>.jpg.
    :param date: дата в виде YYYY-MM-DD (как в имени папки бота)
    :return: ID файла Google Drive
    """
    path = Path(path)
    name = f"{date}_{message_id}.jpg"
    existing = find_file(name)
    if existing:
        return existing
    media = MediaFileUpload(str(path), mimetype="image/jpeg", resumable=False)
    created = get_service().files().create(
        body={"name": name, "parents": [ensure_folder()]}, media_body=media, fields="id"
    ).execute()
    logger.info("Фото загружено в Drive: %s -> %s", name, created["id"])
    return created["id"]


def upload_for_message(save_dir: str | Path, chat_id: int, photo_link: str) -> str:
    """
    Удобная обёртка для бота: находит сохранённый файл по ссылке t.me/c/<chat>/<message_id>
    (имя файла строит get_save_path: msg<message_id>_<file_unique_id>.jpg) и загружает его.
    Возвращает ID файла или пустую строку, если файла нет.
    """
    message_id = photo_link.rstrip("/").rsplit("/", 1)[-1]
    base = Path(save_dir) / str(chat_id)
    matches = sorted(base.rglob(f"msg{message_id}_*.jpg")) if base.exists() else []
    if not matches:
        logger.warning("Файл для message_id=%s не найден в %s", message_id, base)
        return ""
    path = matches[0]
    return upload_photo(path, path.parent.name, message_id)


if __name__ == "__main__":
    # python drive_upload.py — пройти авторизацию и создать папку
    logging.basicConfig(level=logging.INFO)
    print("Папка Drive:", ensure_folder())
