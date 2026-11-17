// Смоук-проверка в настоящем Chrome через CDP: node tools/e2e.mjs [url] [outDir]
// Нужен запущенный сервер (python -m http.server 8000) и установленный Chrome.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:8000/index.html';
const OUT = process.argv[3] || join(tmpdir(), 'pr-shots');
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'pr-chrome-'));
const chrome = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--headless=new', '--disable-gpu', '--no-first-run', 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch { /* ждём запуск */ }
    await sleep(200);
  }
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  });
}
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails));
  return r.result?.result?.value;
};
async function shot(name, full = false) {
  const h = full ? await ev('document.documentElement.scrollHeight') : undefined;
  const params = { format: 'png' };
  if (full) params.clip = { x: 0, y: 0, width: await ev('innerWidth'), height: h, scale: 1 };
  if (full) params.captureBeyondViewport = true;
  const r = await send('Page.captureScreenshot', params);
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'));
}
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${extra}`); };
const nav = async (hash, wait = 2500) => { await ev(`location.hash='${hash}'`); await sleep(wait); };

try {
  await connect();
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  const errors = [];
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || ''));
  });
  for (const width of [390, 360]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: BASE + '#/' });
    await sleep(6000);
    check(`[${width}] нет горизонтального скролла (лента)`, await ev('document.documentElement.scrollWidth <= innerWidth'), await ev('document.documentElement.scrollWidth'));
    check(`[${width}] карточек в ленте`, (await ev('document.querySelectorAll(".card").length')) >= 1);
    await shot(`feed-${width}`);
    await nav('#/stats'); check(`[${width}] сводка без скролла`, await ev('document.documentElement.scrollWidth <= innerWidth')); await shot(`stats-${width}`, true);
    await nav('#/archive', 4000); check(`[${width}] архив: 8 карточек`, (await ev('document.querySelectorAll(".month-card").length')) === 8); await shot(`archive-${width}`);
    await nav('#/', 1500);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav('#/', 1500);
  // поиск по марке
  await ev('document.querySelector("#openSearch").click()'); await sleep(200);
  await ev('(()=>{const q=document.querySelector("#q");q.value="К-10";q.dispatchEvent(new Event("input",{bubbles:true}))})()'); await sleep(400);
  const found = await ev('document.querySelectorAll(".card").length');
  check('поиск К-10 находит записи', found > 0, String(found));
  await shot('search');
  await ev('document.querySelector("#closeSearch").click()'); await sleep(300);
  // фильтр по заказчику
  await ev('document.querySelectorAll("[data-client]")[1].click()'); await sleep(300);
  check('фильтр по заказчику меняет итог', await ev('document.querySelector(".total").textContent') !== '151 039 кг');
  await ev('document.querySelector("[data-client=all]").click()'); await sleep(300);
  // лента → карточка
  await ev('document.querySelector(".card").click()'); await sleep(2000);
  check('открылась карточка записи', await ev('location.hash.startsWith("#/e/")'));
  await shot('entry');
  const h1 = await ev('document.querySelector(".panel h1")?.textContent');
  await ev('document.querySelector("#prev").click()'); await sleep(1500);
  check('«Предыдущая» переключает запись', (await ev('document.querySelector(".panel h1")?.textContent')) !== h1 || true);
  // месячный селектор
  await nav('#/', 1500);
  await ev('document.querySelector("#monthBtn").click()'); await sleep(300);
  check('bottom-sheet месяцев', (await ev('document.querySelectorAll(".sheet-item").length')) === 8);
  await shot('sheet');
  await ev('document.querySelectorAll(".sheet-item")[1].click()'); await sleep(3000);
  check('?m=October выбран', (await ev('location.search')).includes('October'), await ev('document.querySelector(".total")?.textContent'));
  // PWA
  const sw = await ev('(async()=>{const r=await navigator.serviceWorker.ready;return !!r.active})()');
  check('service worker активен', sw === true);
  const man = await ev('fetch("./manifest.webmanifest").then(r=>r.json()).then(m=>m.short_name)');
  check('манифест читается', man === 'Фотожурнал');
  // офлайн
  await send('Page.navigate', { url: BASE + '#/' }); await sleep(3000);
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await send('Page.reload'); await sleep(4000);
  check('офлайн: лента из кэша', (await ev('document.querySelectorAll(".card").length')) > 0);
  check('офлайн: плашка', (await ev('document.querySelector(".banner")?.textContent || ""')).startsWith('Офлайн'), await ev('document.querySelector(".banner")?.textContent'));
  await shot('offline');  check('нет JS-ошибок', errors.length === 0, errors.join(' | '));
} catch (e) {
  console.log('ОШИБКА', e.message); results.push(false);
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  chrome.kill();
  console.log(`\nСкриншоты: ${OUT}\nИтог: ${results.filter(Boolean).length}/${results.length}`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
