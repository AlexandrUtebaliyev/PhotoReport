// Общее состояние: выбранный месяц, фильтры, загрузка текущего месяца.
import { MONTHS } from './config.js';
import { loadSheet, summarize } from './data.js';
import { clientColors } from './util.js';

export const state = { client: 'all', query: '', day: '' };

export const currentMonth = () => MONTHS.find((m) => m.current) ?? MONTHS[0];

/** Выбранный месяц читается из ?m=<лист>. */
export function selectedMonth() {
  const sheet = new URLSearchParams(location.search).get('m');
  return MONTHS.find((m) => m.sheet === sheet) ?? currentMonth();
}

export function selectMonth(month) {
  const url = new URL(location.href);
  if (month.current) url.searchParams.delete('m'); else url.searchParams.set('m', month.sheet);
  history.replaceState(null, '', url);
  state.client = 'all'; state.query = ''; state.day = '';
}

/** Загрузка выбранного месяца: onData вызывается с кэшем, затем со свежими данными. */
export function loadSelected(onData, opts = {}) {
  const month = selectedMonth();
  return loadSheet(month.sheet, { current: month.current, ...opts, onData: (d) => onData({ ...d, month, ...derive(d.entries) }) });
}

export function derive(entries) {
  const summary = summarize(entries);
  return { summary, colors: clientColors(summary.clients) };
}

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const normMark = (s) => s.toUpperCase().replace(/\s*[-–—]\s*/g, '-');

/** Фильтр записей по заказчику, дню и поисковой строке. */
export function applyFilters(entries, { client, query, day } = state) {
  const q = norm(query || '');
  const qm = normMark(q);
  return entries.filter((e) => {
    if (client !== 'all' && e.client !== client) return false;
    if (day && !(e.date && dayOf(e.date) === day)) return false;
    if (q && !(norm(e.name).includes(q) || e.marks.some((m) => m.mark.includes(qm)) || norm(e.client).includes(q))) return false;
    return true;
  });
}

function dayOf(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export { dayOf };
