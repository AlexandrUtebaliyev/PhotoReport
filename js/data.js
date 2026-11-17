// Загрузка листов Google-таблицы (CSV через gviz), разбор, нормализация, кэш.
import {
  SHEET_ID, CLIENT_ALIASES, NO_CLIENT, CACHE_TTL_CURRENT, CACHE_TTL_ARCHIVE,
} from './config.js';
import { parseMarks, constructionType } from './marks.js';

// ---------- CSV ----------

/** Разбор CSV с кавычками, экранированием "" и переводами строк внутри ячеек. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const s = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ---------- Поля ----------

/** «17.11.2026 09:17» → Date (локальное время) или null. */
export function parseDate(str) {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(String(str ?? ''));
  if (!m) return null;
  const [d, mo, y, h, mi] = m.slice(1).map((v) => Number(v ?? 0));
  const date = new Date(y, mo - 1, d, h, mi);
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** «1 820», «1820,5», «151039 кг» → число или null. */
export function parseWeight(str) {
  const s = String(str ?? '').replace(/ /g, ' ').trim();
  if (!s) return null;
  const m = /-?\d[\d\s]*(?:[.,]\d+)?/.exec(s);
  if (!m) return null;
  const n = Number(m[0].replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const ALIAS_MAP = new Map(Object.entries(CLIENT_ALIASES).map(([k, v]) => [norm(k).toLowerCase(), v]));

export function normalizeClient(raw) {
  const s = norm(raw);
  if (!s) return NO_CLIENT;
  return ALIAS_MAP.get(s.toLowerCase()) ?? s;
}

/** message_id — последний сегмент ссылки t.me/c/<chat>/<id>. */
export function messageIdFromLink(link) {
  const m = /t\.me\/c\/[^/]+\/(\d+)/.exec(String(link ?? ''));
  return m ? m[1] : '';
}

const HEADERS = [
  ['date', ['дата']],
  ['sender', ['кто отправил']],
  ['name', ['наименование', 'название']],
  ['client', ['заказчик']],
  ['weight', ['общий вес', 'вес']],
  ['link', ['ссылка']],
  ['photoId', ['фото id', 'фото_id', 'photo id']],
];

function mapColumns(headerRow) {
  const cols = {};
  headerRow.forEach((h, i) => {
    const t = norm(h).toLowerCase();
    for (const [field, prefixes] of HEADERS) {
      if (cols[field] === undefined && prefixes.some((p) => t.startsWith(p))) { cols[field] = i; break; }
    }
  });
  return cols;
}

/**
 * Превращает CSV листа в записи.
 * @returns {{entries: object[], headerTotal: number|null}}
 */
export function parseSheet(csvText, sheet) {
  const rows = parseCsv(csvText);
  if (!rows.length) return { entries: [], headerTotal: null };
  const cols = mapColumns(rows[0]);
  const weightHeader = cols.weight !== undefined ? rows[0][cols.weight] : '';
  const hm = /общий вес\s*([\d\s.,]+)/i.exec(weightHeader || '');
  const headerTotal = hm ? parseWeight(hm[1]) : null;
  const get = (r, f) => (cols[f] !== undefined ? (r[cols[f]] ?? '') : '');

  const entries = [];
  rows.slice(1).forEach((r, idx) => {
    if (r.every((c) => !norm(c))) return;                    // пустая строка
    if (norm(r[0]).toLowerCase().startsWith('дата')) return;  // повторный заголовок
    const dateStr = norm(get(r, 'date'));
    const name = norm(get(r, 'name'));
    const link = norm(get(r, 'link'));
    const messageId = messageIdFromLink(link);
    entries.push({
      sheet,
      id: messageId || `r${idx + 2}`,
      messageId,
      date: parseDate(dateStr),
      dateStr,
      sender: norm(get(r, 'sender')),
      name,
      client: normalizeClient(get(r, 'client')),
      weight: parseWeight(get(r, 'weight')),
      link: /^https?:\/\//.test(link) ? link : '',
      photoId: norm(get(r, 'photoId')),
      marks: parseMarks(name),
      type: constructionType(name),
    });
  });
  // Новые сверху; записи без даты — в конец
  entries.sort((a, b) => (b.date?.getTime() ?? -Infinity) - (a.date?.getTime() ?? -Infinity));
  return { entries, headerTotal };
}

/** Сводные числа по записям. Записи без веса или без даты в суммы не входят. */
export function summarize(entries) {
  let total = 0;
  const byClient = new Map();
  let withWeight = 0;
  for (const e of entries) {
    if (e.weight == null || !e.date) continue;
    total += e.weight;
    withWeight++;
    byClient.set(e.client, (byClient.get(e.client) ?? 0) + e.weight);
  }
  const clients = [...byClient.entries()].map(([name, weight]) => ({ name, weight }))
    .sort((a, b) => b.weight - a.weight);
  return { total, count: entries.length, withWeight, clients };
}

export function dayKey(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------- Загрузка и кэш ----------

const csvUrl = (sheet) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* квота/приватный режим */ } },
};
const cacheKey = (sheet) => `pr:csv:${sheet}`;

function build(csv, sheet) {
  const { entries, headerTotal } = parseSheet(csv, sheet);
  if (headerTotal != null) {
    const sum = summarize(entries).total;
    if (Math.abs(sum - headerTotal) > 1) {
      console.warn(`[${sheet}] сумма ${sum} кг расходится с итогом в заголовке ${headerTotal} кг`);
    }
  }
  return { entries, headerTotal };
}

const memory = new Map(); // sheet -> {entries, headerTotal, time}

export function getLoaded(sheet) { return memory.get(sheet) ?? null; }

/**
 * Stale-while-revalidate: сначала отдаёт кэш (onData с fromCache=true),
 * затем, если кэш устарел, обновляет с сети.
 * onData({entries, headerTotal, time, fromCache, offline})
 * Возвращает Promise, который завершается после попытки обновления.
 */
export async function loadSheet(sheet, { current = false, force = false, onData } = {}) {
  const ttl = current ? CACHE_TTL_CURRENT : CACHE_TTL_ARCHIVE;
  const cached = store.get(cacheKey(sheet));
  let have = false;
  if (cached && typeof cached.csv === 'string') {
    const data = { ...build(cached.csv, sheet), time: cached.time };
    memory.set(sheet, data);
    have = true;
    onData?.({ ...data, fromCache: true, offline: false });
    if (!force && Date.now() - cached.time < ttl) return data;
  }
  try {
    const res = await fetch(csvUrl(sheet), { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    const time = Date.now();
    store.set(cacheKey(sheet), { csv, time });
    const data = { ...build(csv, sheet), time };
    memory.set(sheet, data);
    onData?.({ ...data, fromCache: false, offline: false });
    return data;
  } catch (err) {
    if (have) {
      const data = memory.get(sheet);
      onData?.({ ...data, fromCache: true, offline: true });
      return data;
    }
    throw err;
  }
}

/** Выполняет задачи с ограничением параллельности. */
export async function runLimited(tasks, limit = 3) {
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      try { results[i] = await tasks[i](); } catch (e) { results[i] = { error: e }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}
