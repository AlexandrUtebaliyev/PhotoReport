// Проверка на реальной таблице: node tools/live-check.mjs
import { MONTHS } from '../js/config.js';
import { loadSheet, summarize } from '../js/data.js';

globalThis.localStorage = undefined; // без кэша
let all = 0;
for (const m of MONTHS) {
  try {
    const d = await loadSheet(m.sheet, { current: m.current });
    const s = summarize(d.entries);
    all += s.total;
    const noW = d.entries.filter((e) => e.weight == null).length;
    console.log(`${m.sheet.padEnd(10)} записей ${String(s.count).padStart(4)}  сумма ${String(s.total).padStart(8)} кг  итог в заголовке ${d.headerTotal ?? '—'}  без веса ${noW}  заказчиков ${s.clients.length}`);
  } catch (e) { console.log(m.sheet, 'ОШИБКА', e.message); }
}
console.log('Всего, т:', (all / 1000).toFixed(1));
