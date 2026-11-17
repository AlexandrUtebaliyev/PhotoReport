// Разбор названия конструкции: марки с количеством и тип.

const L = 'А-Яа-яЁёA-Za-z';
const MARK_RE = new RegExp(`(?<![${L}\\d])([${L}]{1,3})(\\d?)\\s*[-–—]\\s*(\\d+)(?!\\d)`, 'g');
const QTY_AFTER_RE = new RegExp(`^\\s*(\\d+)\\s*ш(?:т)?(?![${L}])`, 'i');
const QTY_BEFORE_RE = new RegExp(`(?<![${L}\\d])(\\d+)\\s*ш(?:т)?\\s*$`, 'i');

/** @returns {{mark:string, qty:number}[]} */
export function parseMarks(name) {
  const text = String(name ?? '');
  const found = [];
  let m;
  MARK_RE.lastIndex = 0;
  while ((m = MARK_RE.exec(text))) {
    found.push({
      mark: `${m[1]}${m[2]}-${m[3]}`.toUpperCase(),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  const result = [];
  let consumedUntil = 0; // конец последнего «съеденного» количества
  for (const f of found) {
    let qty = null;
    const after = QTY_AFTER_RE.exec(text.slice(f.end));
    if (after) {
      qty = Number(after[1]);
      consumedUntil = f.end + after[0].length;
    } else {
      const head = text.slice(consumedUntil, f.start);
      const before = QTY_BEFORE_RE.exec(head);
      if (before) {
        qty = Number(before[1]);
        consumedUntil = f.end;
      }
    }
    // Марка без количества — считаем одной штукой
    result.push({ mark: f.mark, qty: qty ?? 1 });
  }
  return result;
}

const TYPE_FIX = { колона: 'Колонна', колонна: 'Колонна', колон: 'Колонна', клона: 'Колонна', клонна: 'Колонна' };

/** Тип конструкции — первое слово названия («Колона» → «Колонна»). */
export function constructionType(name) {
  const first = String(name ?? '').trim().split(/\s+/)[0] || '';
  if (!first || /[\d]/.test(first) || /[-–—]/.test(first)) return 'Прочее';
  // латинские двойники букв → кириллица (частая опечатка при наборе)
  const LATIN = { a: 'а', c: 'с', e: 'е', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у', b: 'в', h: 'н' };
  const low = first.toLowerCase().replace(/[^а-яёa-z]/gi, '');
  if (!low) return 'Прочее';
  const fixed = TYPE_FIX[low.replace(/[a-z]/g, (c) => LATIN[c] ?? c)];
  if (fixed) return fixed;
  return low[0].toUpperCase() + low.slice(1);
}
