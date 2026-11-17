// Экран 2 — Карточка записи
import { MONTHS, PHOTO_MODE, PHOTO_URL } from '../config.js';
import { loadSheet } from '../data.js';
import { state, applyFilters, derive } from '../state.js';
import { entryHref } from '../router.js';
import { esc, fmtKg, fmtFull, icons, setBanner, offlineText, bindPhotoFallback } from '../util.js';

export async function mount(root, route, isCurrent) {
  const month = MONTHS.find((m) => m.sheet === route.sheet);
  if (!month) { location.replace('#/'); return; }
  let nav = { prev: null, next: null };
  let cleanupViewer = null;

  const goBack = () => {
    if (history.length > 1) history.back(); else location.hash = '#/';
  };
  const go = (e) => { if (e) location.replace(entryHref(e)); };

  function render(d) {
    const entries = d.entries;
    const entry = entries.find((e) => e.id === route.id);
    if (!entry) {
      root.innerHTML = `<div class="top"><button class="icon-btn" id="back" aria-label="Назад">${icons.back}</button><h1>Запись не найдена</h1></div>
        <div class="empty"><p>Возможно, запись удалена из таблицы.</p><a class="btn inline" href="#/">К ленте</a></div>`;
      return;
    }
    let list = applyFilters(entries);
    let i = list.findIndex((e) => e.id === entry.id);
    if (i < 0) { list = entries; i = list.findIndex((e) => e.id === entry.id); }
    // список идёт от новых к старым: «предыдущая» — более ранняя запись
    nav = { prev: list[i + 1] ?? null, next: list[i - 1] ?? null };
    const color = derive(entries).colors.get(entry.client) ?? 'var(--client-other)';
    const hasPhoto = PHOTO_MODE === 'drive' && entry.photoId;
    const photo = hasPhoto
      ? `<img src="${esc(PHOTO_URL.full(entry.photoId))}" alt="Фото: ${esc(entry.name)}" referrerpolicy="no-referrer" data-photo>`
      : `<div class="ph">${icons.photo}</div>`;
    const marks = entry.marks.length
      ? `<div class="sec">МАРКИ В ЗАПИСИ</div><div class="marks">${entry.marks.map((m) => `<span class="mark"><b>${esc(m.mark)}</b> × ${m.qty} шт</span>`).join('')}</div>` : '';

    root.innerHTML = `
      <div class="hero" id="hero">${photo}
        <button class="icon-btn circle l" id="back" aria-label="Назад">${icons.back}</button>
        <button class="icon-btn circle r" id="full" aria-label="На весь экран" ${hasPhoto ? '' : 'disabled'}>${icons.expand}</button>
      </div>
      <section class="panel">
        <div class="when">${entry.date ? fmtFull(entry.date) : 'Дата не указана'}</div>
        <h1>${esc(entry.name || 'Без названия')}</h1>
        <div class="tiles">
          <div class="tile"><div class="k">Вес</div><div class="v">${entry.weight == null ? '<span style="font-size:14px;font-weight:500">вес не указан</span>' : fmtKg(entry.weight)}</div></div>
          <div class="tile"><div class="k">Заказчик</div><div class="v"><span class="dot" style="background:${color}"></span>${esc(entry.client)}</div></div>
        </div>
        ${entry.sender ? `<div class="sec">ОТПРАВИЛ</div><div>${esc(entry.sender)}</div>` : ''}
        ${marks}
        <div class="actions">
          <a class="btn" href="${esc(entry.link || '#')}" target="_blank" rel="noopener" ${entry.link ? '' : 'aria-disabled="true"'}>${icons.send} Открыть сообщение в Telegram</a>
          <div class="pager">
            <button class="btn secondary" id="prev" ${nav.prev ? '' : 'disabled'}>← Предыдущая</button>
            <button class="btn secondary" id="next" ${nav.next ? '' : 'disabled'}>Следующая →</button>
          </div>
          <div class="pos">${i + 1} из ${list.length}</div>
        </div>
      </section>`;
    bindPhotoFallback(root);
    root.querySelector('#full').addEventListener('click', () => openViewer(entry));
  }

  // ----- полноэкранный просмотр с pinch-zoom -----
  function openViewer(entry) {
    const v = document.createElement('div');
    v.className = 'viewer';
    v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'Фото на весь экран');
    v.innerHTML = `<button class="icon-btn" aria-label="Закрыть">${icons.close}</button><img src="${esc(PHOTO_URL.full(entry.photoId))}" alt="" referrerpolicy="no-referrer">`;
    document.body.appendChild(v);
    const img = v.querySelector('img');
    let scale = 1, tx = 0, ty = 0;
    const apply = () => { img.style.transform = `translate(-50%,-50%) translate(${tx}px,${ty}px) scale(${scale})`; };
    apply();
    const pts = new Map();
    let startDist = 0, startScale = 1, lastTap = 0;
    v.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('button')) return;
      v.setPointerCapture(ev.pointerId);
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; startDist = Math.hypot(a.x - b.x, a.y - b.y); startScale = scale; }
      if (pts.size === 1) {
        const now = Date.now();
        if (now - lastTap < 300) { scale = scale > 1 ? 1 : 2.5; if (scale === 1) { tx = 0; ty = 0; } apply(); }
        lastTap = now;
      }
    });
    v.addEventListener('pointermove', (ev) => {
      const p = pts.get(ev.pointerId);
      if (!p) return;
      if (pts.size === 2) {
        p.x = ev.clientX; p.y = ev.clientY;
        const [a, b] = [...pts.values()];
        scale = Math.min(6, Math.max(1, startScale * Math.hypot(a.x - b.x, a.y - b.y) / (startDist || 1)));
      } else if (scale > 1) {
        tx += ev.clientX - p.x; ty += ev.clientY - p.y;
      }
      p.x = ev.clientX; p.y = ev.clientY;
      if (scale === 1) { tx = 0; ty = 0; }
      apply();
    });
    const up = (ev) => { pts.delete(ev.pointerId); };
    v.addEventListener('pointerup', up); v.addEventListener('pointercancel', up);
    v.addEventListener('wheel', (ev) => { ev.preventDefault(); scale = Math.min(6, Math.max(1, scale * (ev.deltaY < 0 ? 1.15 : 0.87))); if (scale === 1) { tx = 0; ty = 0; } apply(); }, { passive: false });
    const close = () => { v.remove(); document.removeEventListener('keydown', onKey); cleanupViewer = null; };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    v.querySelector('button').addEventListener('click', close);
    v.querySelector('button').focus();
    cleanupViewer = close;
  }

  // ----- события -----
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t.closest('#back')) goBack();
    else if (t.closest('#prev')) go(nav.prev);
    else if (t.closest('#next')) go(nav.next);
  });
  let sx = 0, sy = 0, st = 0;
  const onStart = (ev) => { const t = ev.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); };
  const onEnd = (ev) => {
    const t = ev.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && Date.now() - st < 600) go(dx < 0 ? nav.next : nav.prev);
  };
  root.addEventListener('touchstart', onStart, { passive: true });
  root.addEventListener('touchend', onEnd, { passive: true });

  try {
    await loadSheet(month.sheet, {
      current: month.current,
      onData: (d) => {
        if (!isCurrent()) return;
        setBanner(d.offline ? offlineText(d.time) : '');
        render(d);
      },
    });
  } catch (err) {
    root.innerHTML = `<div class="error"><h2>Не удалось загрузить данные</h2><button class="btn inline" id="retry">Повторить</button></div>`;
    root.querySelector('#retry').addEventListener('click', () => location.reload());
  }
  window.scrollTo(0, 0);

  return () => { cleanupViewer?.(); setBanner(''); root.removeEventListener('touchstart', onStart); root.removeEventListener('touchend', onEnd); };
}
