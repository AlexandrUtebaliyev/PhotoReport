# Публикация PhotoReport на GitHub Pages (Windows)

Итоговый адрес приложения: `https://<твой-логин>.github.io/PhotoReport/`

---

## 0. Один раз: подготовка

1. **Git.** Проверь, что он установлен: `git --version`. Если нет — поставь с https://git-scm.com/download/win (все настройки по умолчанию).
2. **Аккаунт GitHub** — https://github.com (если его ещё нет).
3. **GitHub CLI** (необязательно, но так проще): `winget install --id GitHub.cli`. Потом закрой и снова открой терминал и выполни:
   ```
   gh auth login
   ```
   Ответы на вопросы: GitHub.com → HTTPS → Login with a web browser.
4. Укажи имя для коммитов (если ещё не указывал):
   ```
   git config --global user.name "Alex"
   git config --global user.email "<почта от GitHub>"
   ```

---

## 1. Проверь, что секреты не попадут в репозиторий

Репозиторий будет **публичным**. Выполни в PowerShell из папки проекта:

```
cd C:\Users\utebaliyev.a\Documents\Projects\PhotoReport
git status
git grep -i "client_secret"
git grep -i "token.json"
```

`client_secret.json`, `token.json`, `credentials.json`, `.env` и `BOT_TOKEN` не должны отображаться в `git status` как файлы для коммита. Упоминания внутри `.gitignore` и README допустимы.

---

## 2. Создай репозиторий и загрузи код

### Вариант А — через GitHub CLI (одна команда)

```
cd C:\Users\utebaliyev.a\Documents\Projects\PhotoReport
gh repo create PhotoReport --public --source . --push
```

### Вариант Б — через сайт

1. https://github.com/new → Repository name: `PhotoReport` → **Public** → *не* ставь галочки README/.gitignore → Create repository.
2. В терминале:
   ```
   cd C:\Users\utebaliyev.a\Documents\Projects\PhotoReport
   git branch -M main
   git remote add origin https://github.com/<логин>/PhotoReport.git
   git push -u origin main
   ```

---

## 3. Включи GitHub Pages

### Через сайт
Репозиторий → **Settings** → **Pages** → в блоке *Build and deployment*:
- Source: **Deploy from a branch**
- Branch: **main**, папка **/ (root)** → **Save**

### Или через CLI
```
gh api -X POST repos/<логин>/PhotoReport/pages -f "source[branch]=main" -f "source[path]=/"
```

Через 1–2 минуты сайт появится по адресу `https://<логин>.github.io/PhotoReport/`. Статус публикации видно во вкладке **Actions** (задача *pages build and deployment*).

---

## 4. Установи на телефон

- **Android (Chrome):** открой адрес → меню ⋮ → **Добавить на главный экран / Установить приложение**.
- **iPhone (только Safari):** открой адрес → кнопка «Поделиться» → **На экран «Домой»**.

Скинь адрес ребятам в цехе — у них приложение ставится так же.

---

## 5. Как выкладывать обновления

После каждой доработки (своей или Claude Code):

```
cd C:\Users\utebaliyev.a\Documents\Projects\PhotoReport
git add .
git commit -m "Описание изменения"
git push
```

Сайт обновится через 1–2 минуты. Телефоны подхватят новую версию при следующем открытии. Если не подхватили — закрой приложение полностью и открой снова.

> Попроси Claude Code при каждом изменении поднимать версию кэша в `sw.js` (`CACHE_VERSION`). Иначе телефоны могут продолжать показывать старую версию.

**Данные публиковать не нужно:** приложение читает таблицу напрямую, и новые фото от бота появятся сами.

---

## 6. Кто может видеть данные — важно

- Сайт на GitHub Pages открыт **всем, у кого есть ссылка**. Пароля нет.
- ID таблицы лежит в публичном коде (`js/config.js`). Значит, любой, кто откроет репозиторий, сможет посмотреть таблицу (только просмотр — она и сейчас открыта по ссылке).
- Фото в папке Drive `ShopLogger_Фото` тоже доступны по ссылке.

Если для заказчиков и посторонних это неприемлемо, есть другие варианты. Приватный репозиторий с Pages требует платного плана, и сайт при этом всё равно остаётся публичным. Настоящая закрытость — через Cloudflare Pages + Cloudflare Access (вход по почте, бесплатно до 50 пользователей) или через Google Apps Script с доступом только для аккаунтов компании. Это можно сделать следующим шагом.

---

## 7. Если что-то не работает

| Симптом | Что сделать |
|---|---|
| 404 по адресу сайта | Подожди 2–3 минуты; проверь Settings → Pages (ветка `main`, папка `/`); адрес должен заканчиваться на `/PhotoReport/` |
| Страница открылась, но без стилей или пустая | В коде где-то абсолютный путь (`/js/...`). Попроси Claude Code сделать все пути относительными (`./js/...`) |
| «Не удалось загрузить таблицу» | Таблица → Настройки доступа → «Все, у кого есть ссылка» → **Читатель**; проверь имя листа в `config.js` |
| Нет кнопки «Установить» на Android | Открой сайт именно по https-адресу github.io, а не как локальный файл; DevTools → Application → Manifest покажет ошибку |
| На телефоне старая версия | Подними `CACHE_VERSION` в `sw.js` и запушь; на телефоне закрой приложение и открой снова |
| `git push` просит пароль | Пароль GitHub здесь не подходит. Выполни `gh auth login` или создай Personal Access Token: Settings → Developer settings → Tokens |
