// Настройки приложения. Здесь меняется всё, что не требует правки кода.

// ID Google-таблицы (часть ссылки между /d/ и /edit)
export const SHEET_ID = '1qlp65ur6bxked5niY2O0Zn1Awh7vHmdBSmIv20G93TE';

// Месяцы: новые сверху. sheet — имя листа в таблице, current — лист, куда бот пишет сейчас.
// Для текущего месяца берётся лист «Фото». Одноимённый месячный лист (November)
// сюда НЕ добавляем, чтобы строки не задвоились.
export const MONTHS = [
  { key: '2026-11', label: 'Ноябрь 2026',  sheet: 'Фото',      current: true },
  { key: '2026-10', label: 'Октябрь 2026', sheet: 'October' },
  { key: '2026-09', label: 'Сентябрь 2026', sheet: 'September' },
  { key: '2026-08', label: 'Август 2026',  sheet: 'August' },
  { key: '2026-07', label: 'Июль 2026',    sheet: 'July' },
  { key: '2026-06', label: 'Июнь 2026',    sheet: 'June' },
  { key: '2026-05', label: 'Май 2026',     sheet: 'May' },
  { key: '2026-04', label: 'Апрель 2026',  sheet: 'April' },
];

// Листы, которые приложение никогда не читает (справочно)
export const IGNORED_SHEETS = ['Copy of Фото', 'November'];

// Сведение вариантов написания заказчика к одному. Ключи сравниваются без регистра
// и без лишних пробелов.
export const CLIENT_ALIASES = {
  'Карер': 'Карьер Тургень',
  'Карьер': 'Карьер Тургень',
  'Тургень карьер': 'Карьер Тургень',
  'Карьер Тургень': 'Карьер Тургень',
  'Алишер физ': 'Алишер (физ. лицо)',
  'Алишер физ.лицо': 'Алишер (физ. лицо)',
  'Алишер Физ.лицо': 'Алишер (физ. лицо)',
  'Алишер физ. лицо': 'Алишер (физ. лицо)',
};

export const NO_CLIENT = 'Без заказчика';

// Сколько живёт кэш листа (мс)
export const CACHE_TTL_CURRENT = 60 * 1000;
export const CACHE_TTL_ARCHIVE = 24 * 60 * 60 * 1000;

// 'drive' — показывать фото по «Фото ID» из Google Drive, 'none' — только заглушки
export const PHOTO_MODE = 'drive';
export const PHOTO_URL = {
  thumb: (id) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w300`,
  full: (id) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`,
};

export const FIRST_RENDER_COUNT = 60;
