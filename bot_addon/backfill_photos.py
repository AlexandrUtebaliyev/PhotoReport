"""
Дозаполнение колонки «Фото ID» для старых записей.

Проходит по листам таблицы, для строк без «Фото ID» берёт message_id из ссылки
t.me/c/<chat>/<message_id>, ищет файл в SAVE_DIR бота (структура get_save_path:
<SAVE_DIR>/<chat_id>/<YYYY-MM-DD>/msg<message_id>_<file_unique_id>.jpg),
загружает его в Google Drive и записывает ID в таблицу.

Запускать из папки бота (рядом с config.py и sheets.py):
    python backfill_photos.py                  # --dry-run (по умолчанию): только отчёт
    python backfill_photos.py --apply          # загрузка и запись в таблицу
    python backfill_photos.py --apply --sheets Фото October
Лог: backfill_photos.log
"""

from __future__ import annotations

import argparse
import logging
import re
import sys
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials

from config import CHAT_CONFIG, GOOGLE_CREDENTIALS_FILE, SAVE_DIR

PHOTO_ID_HEADER = "Фото ID"
IGNORED_SHEETS = {"Copy of Фото"}
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
LINK_RE = re.compile(r"t\.me/c/(\d+)/(\d+)")

log = logging.getLogger("backfill")


def col_letter(n: int) -> str:
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def find_header(header: list[str], *prefixes: str) -> int | None:
    for i, h in enumerate(header):
        t = h.strip().lower()
        if any(t.startswith(p) for p in prefixes):
            return i
    return None


def find_local_file(save_dir: Path, chat_id: int, message_id: str) -> Path | None:
    """Файл фото по message_id; get_save_path кладёт его в <SAVE_DIR>/<chat_id>/<дата>/msg<id>_*.jpg."""
    base = save_dir / str(chat_id)
    if not base.exists():
        return None
    matches = sorted(base.rglob(f"msg{message_id}_*.jpg"))
    return matches[0] if matches else None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="только показать, что будет сделано (по умолчанию)")
    mode.add_argument("--apply", action="store_true", help="загрузить файлы и записать ID в таблицу")
    ap.add_argument("--sheets", nargs="*", help="имена листов (по умолчанию все, кроме служебных)")
    ap.add_argument("--save-dir", default=None, help="папка с фото (по умолчанию SAVE_DIR из config.py)")
    ap.add_argument("--spreadsheet", default=None, help="ID таблицы (по умолчанию первая из CHAT_CONFIG)")
    args = ap.parse_args()
    apply = args.apply

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.FileHandler("backfill_photos.log", encoding="utf-8"), logging.StreamHandler(sys.stdout)],
    )
    log.info("Режим: %s", "APPLY" if apply else "DRY-RUN")

    save_dir = Path(args.save_dir or SAVE_DIR)
    if not save_dir.is_absolute():
        save_dir = Path(__file__).resolve().parent / save_dir
    cfgs = {c["spreadsheet_id"]: chat for chat, c in CHAT_CONFIG.items()}
    spreadsheet_id = args.spreadsheet or next(iter(cfgs))
    chat_id = cfgs.get(spreadsheet_id)

    creds = Credentials.from_service_account_file(GOOGLE_CREDENTIALS_FILE, scopes=SCOPES)
    book = gspread.authorize(creds).open_by_key(spreadsheet_id)
    upload_photo = None
    if apply:
        from drive_upload import upload_photo  # noqa: F811  (OAuth только в режиме apply)

    stats = {"rows": 0, "have_id": 0, "uploaded": 0, "missing_file": 0, "no_link": 0}
    missing: list[str] = []

    for ws in book.worksheets():
        if ws.title in IGNORED_SHEETS or (args.sheets and ws.title not in args.sheets):
            continue
        values = ws.get_all_values()
        if not values:
            continue
        header = values[0]
        c_link = find_header(header, "ссылка")
        c_date = find_header(header, "дата")
        c_id = find_header(header, PHOTO_ID_HEADER.lower())
        if c_link is None:
            log.warning("[%s] нет колонки «Ссылка на фото», лист пропущен", ws.title)
            continue
        new_col = False
        if c_id is None:
            c_id = len(header)  # в конец (F для листа «Фото»)
            new_col = True
        updates: list[dict] = []
        for r, row in enumerate(values[1:], start=2):
            link = row[c_link] if c_link < len(row) else ""
            if not link.strip():
                continue
            stats["rows"] += 1
            if c_id < len(row) and row[c_id].strip():
                stats["have_id"] += 1
                continue
            m = LINK_RE.search(link)
            if not m:
                stats["no_link"] += 1
                continue
            mid = m.group(2)
            file_chat = chat_id if chat_id is not None else int(f"-100{m.group(1)}")
            path = find_local_file(save_dir, file_chat, mid)
            if not path:
                stats["missing_file"] += 1
                missing.append(f"{ws.title}!{r} message_id={mid}")
                log.info("[%s] строка %d: файл для message_id=%s не найден — пропуск", ws.title, r, mid)
                continue
            day = path.parent.name  # YYYY-MM-DD
            if not apply:
                log.info("[%s] строка %d: загрузил бы %s", ws.title, r, path)
                stats["uploaded"] += 1
                continue
            try:
                file_id = upload_photo(path, day, mid)
            except Exception as e:  # noqa: BLE001 — продолжаем со следующей строкой
                log.error("[%s] строка %d: ошибка загрузки %s: %s", ws.title, r, path, e)
                continue
            updates.append({"range": f"{col_letter(c_id + 1)}{r}", "values": [[file_id]]})
            stats["uploaded"] += 1
            log.info("[%s] строка %d: %s -> %s", ws.title, r, path.name, file_id)
        if apply and updates:
            if new_col:
                if c_id + 1 > ws.col_count:
                    ws.add_cols(c_id + 1 - ws.col_count)
                updates.append({"range": f"{col_letter(c_id + 1)}1", "values": [[PHOTO_ID_HEADER]]})
            ws.batch_update(updates, value_input_option="RAW")
            log.info("[%s] записано ID: %d", ws.title, len(updates) - (1 if new_col else 0))

    log.info("Итог: %s", stats)
    if missing:
        log.info("Не найден локальный файл (%d):\n  %s", len(missing), "\n  ".join(missing))
    return 0


if __name__ == "__main__":
    sys.exit(main())
