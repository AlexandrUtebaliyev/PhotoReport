// Экран 3 — Сводка
import { dayKey } from '../data.js';
import { state, selectedMonth, loadSelected } from '../state.js';
import { entryHref } from '../router.js';
import { esc, fmtKg, fmtT, fmtNum, fmtDM, plural, icons, setBanner, offlineText, photoHtml, bindPhotoFallback } from '../util.js';

export async function mount(root, route, isCurrent) {
  let seq = 0;
  root.innerHTML = `<header class="top"><div class="grow"><h1>Сводка</h1><p class="sub" id="sub">${esc(selectedMonth().label)}</p></div>
    <button class="icon-btn" id="refresh" aria-label="Обновить данные">${icons.refresh}</button></header><div class="pad" id="body"></div>`;
  const body = root.querySelector('#body');

  function render(d) {
    const dated = d.entries.filter((e) => e.date);
    const weighed = dated.filter((e) => e.weight != null);
    if (!weighed.length) {
      body.innerHTML = '<div class="empty"><h2>За этот месяц записей нет</h2><p>Когда бот добавит фото, сводка появится здесь.</p></div>';
      return;
    }
    const times = dated.map((e) => e.date.getTime());
    const first = new Date(Math.min(...times)), last = new Date(Math.max(...times));
    root.querySelector('#sub').textContent = `${d.month.label} · ${fmtDM(first)} – ${fmtDM(last)}`;
    const { summary, colors } = d;

    // по дням: от первого до последнего дня месяца, который есть в данных
    const byDay = new Map();
    for (const e of weighed) {
      const k = dayKey(e.date);
      const o = byDay.get(k) ?? { kg: 0, n: 0 };
      o.kg += e.weight; o.n++; byDay.set(k, o);
    }
    const days = [];
    const cur = new Date(first.getFullYear(), first.getMonth(), first.getDate());
    const end = new Date(last.getFullYear(), last.getMonth(), last.getDate());
    for (; cur <= end; cur.setDate(cur.getDate() + 1)) {
      const k = dayKey(cur);
      days.push({ key: k, date: new Date(cur), ...(byDay.get(k) ?? { kg: 0, n: 0 }) });
    }
    const peak = days.reduce((a, b) => (b.kg > a.kg ? b : a), days[0]);
    const step = days.length > 24 ? 3 : days.length > 12 ? 2 : 1;

    // по типам
    const types = new Map();
    for (const e of weighed) {
      const t = types.get(e.type) ?? { kg: 0, pcs: 0, n: 0 };
      t.kg += e.weight; t.n++; t.pcs += e.marks.reduce((s, m) => s + m.qty, 0);
      types.set(e.type, t);
    }
    const typeRows = [...types.entries()].sort((a, b) => b[1].kg - a[1].kg);
    const top = [...weighed].sort((a, b) => b.weight - a.weight).slice(0, 5);

    body.innerHTML = `
      <div class="tiles2">
        <div class="panel-card"><div class="lbl">Всего за месяц</div><div class="big">${fmtT(summary.total)}</div></div>
        <div class="panel-card"><div class="lbl">Записей с фото</div><div class="big">${fmtNum(d.entries.length)}</div></div>
      </div>
      <section class="panel-card"><h2>По заказчикам</h2>
        <div class="stack" role="img" aria-label="Доли заказчиков">${summary.clients.map((c) => `<i style="width:${(c.weight / summary.total * 100).toFixed(2)}%;background:${colors.get(c.name)}"></i>`).join('')}</div>
        <ul class="legend" style="padding:0;margin:0">${summary.clients.map((c) => `<li><span class="dot" style="background:${colors.get(c.name)}"></span><span class="n">${esc(c.name)}</span><span class="p">${Math.round(c.weight / summary.total * 100)}%</span><span class="kg">${fmtKg(c.weight)}</span></li>`).join('')}</ul>
      </section>
      <section class="panel-card"><h2>По дням, т</h2>
        <div class="peak">пик ${fmtDM(peak.date)} — ${fmtT(peak.kg)}</div>
        <div class="bars" id="bars" role="group" aria-label="Вес по дням">${days.map((x, i) => `<button class="bar ${x.kg ? '' : 'zero'}" data-i="${i}" aria-pressed="false" aria-label="${fmtDM(x.date)}: ${fmtT(x.kg)}, ${x.n} ${plural(x.n, 'запись', 'записи', 'записей')}"><i style="height:${x.kg ? Math.max(2, x.kg / peak.kg * 100) : 0}%"></i></button>`).join('')}</div>
        <div class="xaxis" aria-hidden="true">${days.map((x, i) => `<span>${i % step === 0 ? x.date.getDate() : ''}</span>`).join('')}</div>
        <div class="hint" style="margin-top:8px">Нажмите на столбец — сумма дня, дважды — открыть день в ленте.</div>
      </section>
      <section class="panel-card"><h2>Крупнейшие записи</h2>
        <ul class="rank">${top.map((e) => `<li><a href="${entryHref(e)}">${photoHtml(e, 'thumb', 'thumb')}<span class="t"><b>${esc(e.name)}</b><span>${esc(e.client)} · ${fmtDM(e.date)}</span></span><span class="w">${fmtKg(e.weight)}</span></a></li>`).join('')}</ul>
      </section>
      <section class="panel-card types"><h2>По типам конструкций</h2>
        ${typeRows.map(([name, t]) => `<div class="row"><span class="n">${esc(name)}</span><span class="c">${t.pcs ? `${fmtNum(t.pcs)} шт · ` : ''}${t.n} ${plural(t.n, 'запись', 'записи', 'записей')}</span><span class="kg">${fmtKg(t.kg)}</span></div>`).join('')}
      </section>`;
    bindPhotoFallback(body);
    // миниатюры в топе чуть меньше
    body.querySelectorAll('.rank .thumb').forEach((el) => { el.style.width = '44px'; el.style.height = '44px'; });
    bindBars(days);
  }

  function bindBars(days) {
    const bars = body.querySelector('#bars');
    let lastTap = 0, lastI = -1, tip = null;
    bars.addEventListener('click', (ev) => {
      const b = ev.target.closest('.bar');
      if (!b) return;
      const i = Number(b.dataset.i), x = days[i], now = Date.now();
      if (i === lastI && now - lastTap < 350) { state.day = x.key; state.client = 'all'; state.query = ''; location.hash = '#/'; return; }
      lastI = i; lastTap = now;
      bars.querySelectorAll('.bar').forEach((el) => el.setAttribute('aria-pressed', String(el === b)));
      tip?.remove();
      tip = document.createElement('div');
      tip.className = 'tip';
      tip.textContent = `${fmtDM(x.date)} · ${fmtT(x.kg)} · ${x.n} ${plural(x.n, 'запись', 'записи', 'записей')}`;
      bars.appendChild(tip);
      const r = bars.getBoundingClientRect(), br = b.getBoundingClientRect();
      const half = tip.offsetWidth / 2;
      tip.style.left = `${Math.min(r.width - half, Math.max(half, br.left - r.left + br.width / 2))}px`;
    });
  }

  async function load(force) {
    const my = ++seq;
    body.innerHTML = '<div class="skel" style="height:90px"></div><div class="skel" style="height:180px"></div><div class="skel" style="height:240px"></div>';
    let got = false;
    try {
      await loadSelected((d) => {
        if (my !== seq || !isCurrent()) return;
        got = true;
        setBanner(d.offline ? offlineText(d.time) : '');
        render(d);
      }, { force });
    } catch (err) {
      if (!got && my === seq) {
        body.innerHTML = `<div class="error"><h2>Не удалось загрузить данные</h2><button class="btn inline" id="retry">Повторить</button></div>`;
      }
    }
  }
  root.addEventListener('click', (ev) => {
    if (ev.target.closest('#refresh')) load(true);
    else if (ev.target.closest('#retry')) load(true);
  });
  await load(false);
  return () => setBanner('');
}
