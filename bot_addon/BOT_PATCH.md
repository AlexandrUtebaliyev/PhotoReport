# Патч бота ShopLogger: фото в Google Drive

Файлы `drive_upload.py`, `backfill_photos.py`, `requirements_addon.txt` скопируйте в папку бота (рядом с `bot.py`, `sheets.py`, `config.py`; на рабочем ПК это `D:\Documents\Projects\metal_bot`). Существующие файлы бота не переписываются — ниже 3–5 строк, которые вставляете сами.

Сверено с кодом бота в `C:\Users\utebaliyev.a\Documents\Projects\ShopLogger`: `get_save_path(chat_id, message_id, file_unique_id)` кладёт файл в `<SAVE_DIR>/<chat_id>/<YYYY-MM-DD>/msg<message_id>_<file_unique_id>.jpg`; `sheets.append_row(...)` пишет строку `[дата, поля…, ссылка]`.

## 0. Подготовка (один раз)

1. Google Cloud Console → тот же проект, что у бота → **APIs & Services → Library → Google Drive API → Enable**.
2. **Credentials → Create credentials → OAuth client ID → Application type: Desktop app**. Скачайте JSON, сохраните как `client_secret.json` рядом с `drive_upload.py`. (OAuth consent screen — «External», добавьте свой аккаунт в Test users.)
3. Установка (Python 3.11, Windows):
   ```
   venv\Scripts\activate
   pip install -r requirements_addon.txt
   python drive_upload.py
   ```
   Откроется браузер → войдите в аккаунт, на чьём Drive будут лежать фото → разрешите доступ. Появится `token.json` и папка **ShopLogger_Фото** (доступ «все, у кого есть ссылка — читатель»).
4. `client_secret.json` и `token.json` уже в `.gitignore` — не публикуйте их.

## 1. `sheets.py` — колонка «Фото ID» (F)

```python
# было
FIXED_END   = ["Ссылка на фото"]
# стало (только для новых листов; на существующем листе «Фото» впишите «Фото ID» в F1 руками или это сделает backfill)
FIXED_END   = ["Ссылка на фото", "Фото ID"]
```

В `append_row` добавьте параметр и колонку:

```python
def append_row(spreadsheet_id, sheet_name, fields, sender, values, photo_link, photo_id: str = "") -> None:
    ...
    row = ([datetime.now().strftime("%d.%m.%Y %H:%M")] + dynamic_values + [photo_link, photo_id])
```

## 2. `bot.py` — загрузка после сохранения фото

В начало файла:

```python
import asyncio
from drive_upload import upload_for_message
```

В `_write_to_sheets` внутри `try:` перед `sheets.append_row(...)` получите ID и передайте его:

```python
photo_id = ""
try:
    photo_id = await asyncio.to_thread(upload_for_message, SAVE_DIR, message.chat.id, photo_link)
except Exception as e:
    logger.error(f"Drive: не удалось загрузить фото: {e}")   # запись в таблицу не должна падать
```

и добавьте `photo_id=photo_id,` в вызов `sheets.append_row(...)`.

> Важно: в сценарии исправления подписи (`FixPhoto`) в `_write_to_sheets` приходит уже *другое* сообщение, поэтому `message.message_id` использовать нельзя — `upload_for_message` берёт `message_id` из `photo_link` (он всегда относится к сообщению с фото). `chat_id` одинаков для обоих сообщений. Если `SAVE_DIR` относительный (`photos`), бот должен запускаться из своей папки — как и сейчас.

## 3. `.gitignore` бота

```
client_secret.json
token.json
```

(Файл `.gitignore` в папке ShopLogger на этом ПК создан отдельно; на рабочем ПК добавьте строки, если репозиторий используется.)

## 4. Бэкфилл старых записей

```
venv\Scripts\activate
python backfill_photos.py            # пробный прогон (dry-run): что будет загружено, чего нет
python backfill_photos.py --apply    # загрузка + запись «Фото ID» в таблицу
```

- Листы по умолчанию — все, кроме `Copy of Фото`; можно ограничить: `--sheets Фото October`.
- Файлов, которых нет в `SAVE_DIR`, скрипт не трогает и перечисляет в конце отчёта. Лог — `backfill_photos.log`.
- Запускайте на ПК, где лежит папка `photos` бота (или передайте `--save-dir D:\путь\photos`).
- Повторный запуск безопасен: уже загруженные файлы находятся по имени `<дата>_<message_id>.jpg`.

После этого в PhotoReport миниатюры появятся сами (приложение читает колонку «Фото ID»).
