// Экран 1 — Лента
import { MONTHS, FIRST_RENDER_COUNT } from '../config.js';
import { summarize, dayKey, getLoaded } from '../data.js';
import { state, selectedMonth, selectMonth, loadSelected, applyFilters } from '../state.js';
import { entryHref } from '../router.js';
import {
  esc, fmtKg, fmtT, plural, fmtDayTitle, fmtTime, icons, photoHtml, bindPhotoFallback, setBanner, offlineText,
} from '../util.js';

let savedScroll = { key: '', y: 0 };

export async function mount(root, route, isCurrent) {
  let data = null;      // {entries, colors, summary, ...}
  let searchOpen = !!state.query;
  let shown = FIRST_RENDER_COUNT;
  let io = null;
  const month = () => selectedMonth();

  root.innerHTML = `
    <header class="top" id="top"></header>
    <section class="summary" id="sum"></section>
    <div class="chips" id="chips" role="group" aria-label="Фильтр по заказчику"></div>
    <div id="list"></div>`;
  const $ = (id) => root.querySelector(`#${id}`);

  function renderTop() {
    $('top').innerHTML = searchOpen
      ? `<label class="search-field">${icons.search}<span class="sr">Поиск по названию или марке</span>
           <input id="q" type="search" inputmode="search" enterkeyhint="search" placeholder="Название или марка, например К-10" value="${esc(state.query)}" autocomplete="off"></label>
         <button class="icon-btn" id="closeSearch" aria-label="Закрыть поиск">${icons.close}</button>`
      : `<div class="grow"><h1>Фотожурнал</h1><p class="sub">Готовая продукция · лист «${esc(month().sheet)}»</p></div>
         <button class="icon-btn" id="refresh" aria-label="Обновить данные">${icons.refresh}</button>
         <button class="icon-btn" id="openSearch" aria-label="Поиск">${icons.search}</button>`;
    if (searchOpen) $('q').focus();
  }

  function filtered() { return data ? applyFilters(data.entries) : []; }

  function renderSummary() {
    const list = filtered();
    const s = summarize(list);
    const m = month();
    $('sum').innerHTML = `
      <button class="month-btn" id="monthBtn" aria-haspopup="dialog">${esc(m.label)} ${icons.chevron}</button>
      <div class="total-row">
        <div class="total" aria-live="polite">${fmtKg(s.total)}</div>
        <div class="total-meta">${s.count} ${plural(s.count, 'запись', 'записи', 'записей')}<br>${s.clients.length} ${plural(s.clients.length, 'заказчик', 'заказчика', 'заказчиков')}</div>
      </div>
      ${state.day ? `<button class="chip" id="clearDay" style="margin-top:8px">День ${esc(state.day.split('-').reverse().slice(0, 2).join('.'))} ${icons.close.replace('width="24" height="24"', 'width="16" height="16"')}<span class="sr">сбросить день</span></button>` : ''}`;
  }

  function renderChips() {
    if (!data) { $('chips').innerHTML = ''; return; }
    const all = `<button class="chip" data-client="all" aria-pressed="${state.client === 'all'}">Все</button>`;
    $('chips').innerHTML = all + data.summary.clients.map((c) =>
      `<button class="chip" data-client="${esc(c.name)}" aria-pressed="${state.client === c.name}">${esc(c.name)} · ${fmtT(c.weight)}</button>`).join('');
  }

  function card(e) {
    const color = data.colors.get(e.client) ?? 'var(--client-other)';
    const w = e.weight == null ? '<div class="w none">вес не указан</div>' : `<div class="w">${fmtKg(e.weight)}</div>`;
    return `<a class="card" href="${entryHref(e)}">
      ${photoHtml(e, 'thumb', 'thumb')}
      <div class="body"><div class="name">${esc(e.name || 'Без названия')}</div>
        <div class="meta"><span class="dot" style="background:${color}"></span>${esc(e.client)}${e.date ? ` · ${fmtTime(e.date)}` : ''}</div></div>${w}</a>`;
  }

  function buildItems(list) {
    const items = [];
    let cur = null;
    for (const e of list) {
      const key = e.date ? dayKey(e.date) : 'none';
      if (!cur || cur.key !== key) {
        cur = { key, title: e.date ? fmtDayTitle(e.date) : 'Без даты', sum: 0, entries: [] };
        items.push(cur);
      }
      cur.entries.push(e);
      if (e.weight != null && e.date) cur.sum += e.weight;
    }
    return items;
  }

  function renderList(append = false) {
    const list = filtered();
    const el = $('list');
    if (!data) return;
    if (!list.length) {
      el.innerHTML = `<div class="empty"><h2>${data.entries.length ? 'Ничего не найдено' : 'За этот месяц записей нет'}</h2><p>${data.entries.length ? 'Попробуйте изменить фильтр или поиск.' : 'Когда бот добавит фото, они появятся здесь.'}</p></div>`;
      return;
    }
    const groups = buildItems(list);
    let n = 0, html = '';
    for (const g of groups) {
      if (n >= shown) break;
      const slice = g.entries.slice(0, shown - n);
      n += slice.length;
      html += `<div class="day-head"><b>${esc(g.title)}</b><span>${g.sum ? fmtKg(g.sum) : ''}</span></div>
        <div class="cards">${slice.map(card).join('')}</div>`;
    }
    el.innerHTML = html + (n < list.length ? '<div class="sentinel" id="sentinel"></div>' : '');
    bindPhotoFallback(el);
    io?.disconnect();
    const s = el.querySelector('#sentinel');
    if (s && 'IntersectionObserver' in window) {
      io = new IntersectionObserver((ents) => {
        if (ents.some((x) => x.isIntersecting)) { io.disconnect(); shown += FIRST_RENDER_COUNT; renderList(true); }
      }, { rootMargin: '600px' });
      io.observe(s);
    }
  }

  function renderAll() { renderSummary(); renderChips(); shown = FIRST_RENDER_COUNT; renderList(); }

  function openMonthSheet() {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    const cur = month();
    ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Выбор месяца"><h2>Месяц</h2>
      ${MONTHS.map((m) => {
        const d = getLoaded(m.sheet);
        const t = d ? fmtT(summarize(d.entries).total) : '';
        return `<button class="sheet-item" data-sheet="${esc(m.sheet)}" aria-current="${m.sheet === cur.sheet}">${esc(m.label)}<small>${t}</small></button>`;
      }).join('')}</div>`;
    document.body.appendChild(ov);
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-sheet]');
      if (b) { selectMonth(MONTHS.find((m) => m.sheet === b.dataset.sheet)); close(); load(); }
      else if (ev.target === ov) close();
    });
    ov.querySelector('[data-sheet][aria-current="true"]')?.focus();
  }

  function showError(err) {
    $('list').innerHTML = `<div class="error"><h2>Не удалось загрузить данные</h2><p>Проверьте соединение и попробуйте ещё раз.</p>
      <button class="btn inline" id="retry">Повторить</button><p class="hint">${esc(err?.message || '')}</p></div>`;
    $('sum').innerHTML = `<button class="month-btn" id="monthBtn">${esc(month().label)} ${icons.chevron}</button>`;
  }

  let loadSeq = 0;
  async function load(force = false) {
    const my = ++loadSeq;
    if (!getLoaded(month().sheet)) {
      $('list').innerHTML = '<div class="cards" style="padding-top:14px">' + Array.from({ length: 6 }, () => '<div class="skel" style="height:84px;border-radius:14px"></div>').join('') + '</div>';
    }
    try {
      await loadSelected((d) => {
        if (my !== loadSeq || !isCurrent()) return;
        data = d;
        setBanner(d.offline ? offlineText(d.time) : '');
        renderAll();
        if (savedScroll.key === month().sheet && savedScroll.y) { window.scrollTo(0, savedScroll.y); savedScroll.y = 0; }
      }, { force });
    } catch (err) {
      if (my === loadSeq && isCurrent() && !data) showError(err);
    }
  }

  // ----- события -----
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t.closest('#monthBtn')) return openMonthSheet();
    if (t.closest('#openSearch')) { searchOpen = true; renderTop(); return; }
    if (t.closest('#closeSearch')) { searchOpen = false; state.query = ''; renderTop(); renderAll(); return; }
    if (t.closest('#refresh')) { load(true); return; }
    if (t.closest('#retry')) { data = null; load(true); return; }
    if (t.closest('#clearDay')) { state.day = ''; renderAll(); return; }
    const chip = t.closest('[data-client]');
    if (chip) { state.client = chip.dataset.client; renderAll(); }
  });
  root.addEventListener('input', (ev) => {
    if (ev.target.id === 'q') { state.query = ev.target.value; renderSummary(); shown = FIRST_RENDER_COUNT; renderList(); }
  });

  renderTop();
  load();

  return () => {
    io?.disconnect();
    savedScroll = { key: month().sheet, y: window.scrollY };
    setBanner('');
  };
}
