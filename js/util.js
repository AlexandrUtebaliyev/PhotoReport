// Форматирование и мелкие помощники для экранов.
import { PHOTO_MODE, PHOTO_URL } from './config.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const NBSP = ' ';
export function fmtNum(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}
export const fmtKg = (n) => `${fmtNum(n)}${NBSP}кг`;
export function fmtT(kg, digits = 1) {
  return `${(kg / 1000).toFixed(digits).replace('.', ',')}${NBSP}т`;
}
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const p2 = (n) => String(n).padStart(2, '0');

export const fmtTime = (d) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
export const fmtDM = (d) => `${p2(d.getDate())}.${p2(d.getMonth() + 1)}`;
export const fmtDayTitle = (d) => `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${WEEKDAYS[d.getDay()]}`;
export const fmtFull = (d) => `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}, ${fmtTime(d)}`;
export const fmtStamp = (ms) => { const d = new Date(ms); return `${fmtTime(d)} ${fmtDM(d)}`; };

export const offlineText = (ms) => `Офлайн · данные на ${fmtStamp(ms)}`;
export function setBanner(text) {
  const el = document.getElementById('banner');
  if (el) el.innerHTML = text ? `<div class="banner">${esc(text)}</div>` : '';
}

/** Цвет заказчика по убыванию веса: 1-й, 2-й, остальные. */
export function clientColors(clients) {
  const map = new Map();
  clients.forEach((c, i) => map.set(c.name, i === 0 ? 'var(--client-1)' : i === 1 ? 'var(--client-2)' : 'var(--client-other)'));
  return map;
}

const SVG = (body) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const icons = {
  search: SVG('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  close: SVG('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: SVG('<path d="M15 5l-7 7 7 7"/>'),
  expand: SVG('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  photo: SVG('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10.5" r="1.8"/><path d="m21 16-5-5-9 8"/>'),
  feed: SVG('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  stats: SVG('<path d="M5 20V11M12 20V4M19 20v-6"/>'),
  archive: SVG('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>'),
  refresh: SVG('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
  chevron: SVG('<path d="m6 9 6 6 6-6"/>'),
  send: SVG('<path d="M21 4 3 11l6 2 2 6 3-4 4 3z"/>'),
};

/** Фото (миниатюра/полное) или штрихованная заглушка. */
export function photoHtml(entry, kind, cls = '') {
  if (PHOTO_MODE === 'drive' && entry.photoId) {
    const src = PHOTO_URL[kind](entry.photoId);
    return `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-photo>`;
  }
  return `<div class="ph ${cls}">${icons.photo}</div>`;
}

/** Если картинка не загрузилась — заменить заглушкой. */
export function bindPhotoFallback(root) {
  root.querySelectorAll('img[data-photo]').forEach((img) => {
    const fail = () => {
      const d = document.createElement('div');
      d.className = `ph ${img.className}`;
      d.innerHTML = icons.photo;
      img.replaceWith(d);
    };
    if (img.complete && img.naturalWidth === 0 && img.src) fail();
    else img.addEventListener('error', fail, { once: true });
  });
}
