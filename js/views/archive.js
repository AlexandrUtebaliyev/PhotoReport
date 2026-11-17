// Экран 4 — Архив
import { MONTHS } from '../config.js';
import { loadSheet, summarize, runLimited } from '../data.js';
import { selectMonth } from '../state.js';
import { esc, fmtKg, fmtT, plural, setBanner } from '../util.js';

export async function mount(root, route, isCurrent) {
  const results = new Map(); // sheet -> {total,count} | {error}
  root.innerHTML = `<header class="top"><div class="grow"><h1>Архив</h1><p class="sub" id="sub">Загрузка…</p></div></header><div class="pad" id="list"></div>`;
  const list = root.querySelector('#list');

  function render() {
    const done = MONTHS.filter((m) => results.get(m.sheet)?.count != null);
    const max = Math.max(1, ...done.map((m) => results.get(m.sheet).total));
    const all = done.reduce((s, m) => s + results.get(m.sheet).total, 0);
    const oldest = MONTHS[MONTHS.length - 1].label.split(' ')[0], newest = MONTHS[0].label;
    root.querySelector('#sub').textContent = done.length ? `${oldest} – ${newest.toLowerCase()} · ${fmtT(all)}` : 'Загрузка…';
    list.innerHTML = MONTHS.map((m) => {
      const r = results.get(m.sheet);
      const badge = m.current ? '<span class="badge">текущий</span>' : '';
      if (!r) return `<div class="month-card"><div class="skel" style="height:20px;width:60%"></div><div class="skel" style="height:6px;margin:14px 0 10px"></div><div class="skel" style="height:14px;width:30%"></div></div>`;
      if (r.error) return `<button class="month-card" data-retry="${esc(m.sheet)}" style="width:100%;text-align:left"><div class="r1"><b>${esc(m.label)}${badge}</b></div><div class="hint" style="margin-top:6px">Не удалось загрузить. Нажмите, чтобы повторить.</div></button>`;
      return `<a class="month-card" href="#/" data-sheet="${esc(m.sheet)}"><div class="r1"><b>${esc(m.label)}${badge}</b><span class="wt">${fmtKg(r.total)}</span></div>
        <div class="progress" aria-hidden="true"><i style="width:${(r.total / max * 100).toFixed(1)}%"></i></div>
        <div class="lbl">${r.count} ${plural(r.count, 'запись', 'записи', 'записей')}</div></a>`;
    }).join('');
  }

  async function fetchMonth(m, force = false) {
    try {
      await loadSheet(m.sheet, {
        current: m.current, force,
        onData: (d) => {
          if (!isCurrent()) return;
          const s = summarize(d.entries);
          results.set(m.sheet, { total: s.total, count: d.entries.length });
          render();
        },
      });
    } catch (error) {
      if (!results.get(m.sheet)?.count && isCurrent()) { results.set(m.sheet, { error }); render(); }
    }
  }

  root.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-sheet]');
    if (a) { selectMonth(MONTHS.find((m) => m.sheet === a.dataset.sheet)); return; } // href="#/" откроет ленту
    const r = ev.target.closest('[data-retry]');
    if (r) { const m = MONTHS.find((x) => x.sheet === r.dataset.retry); results.delete(m.sheet); render(); fetchMonth(m, true); }
  });

  render();
  await runLimited(MONTHS.map((m) => () => fetchMonth(m)), 3);
  return () => setBanner('');
}
