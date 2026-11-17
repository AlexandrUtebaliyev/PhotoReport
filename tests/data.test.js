import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseDate, parseWeight, normalizeClient, messageIdFromLink, parseSheet, summarize } from '../js/data.js';
import { parseMarks, constructionType } from '../js/marks.js';

const fmt = (name) => parseMarks(name).map((m) => `${m.mark}×${m.qty}`).join(', ');

test('parseMarks: обязательные кейсы', () => {
  assert.equal(fmt('Колона К-11 4шт К-1 2шт К-13 1шт К-5 1шт  К-3 1шт К-12 1шт'),
    'К-11×4, К-1×2, К-13×1, К-5×1, К-3×1, К-12×1');
  assert.equal(fmt('Балка Б1-24 9шт Б1-27 1шт'), 'Б1-24×9, Б1-27×1');
  assert.equal(fmt('Колона К-7 2ш К-10 1шт'), 'К-7×2, К-10×1');
  assert.equal(fmt('Связь Св-2 4ШТ'), 'СВ-2×4');
  assert.equal(fmt('Связь СВ -2 5шт'), 'СВ-2×5');
  assert.equal(fmt('Связь СГ-8 8шт СВ-1 8шт'), 'СГ-8×8, СВ-1×8');
  assert.equal(fmt('Балка 8шт Б-6'), 'Б-6×8');
  assert.deepEqual(parseMarks('Конвейер погрузочный'), []);
  assert.deepEqual(parseMarks('Ферма 1шт'), []);
});

test('constructionType', () => {
  assert.equal(constructionType('Колона К-11 4шт'), 'Колонна');
  assert.equal(constructionType('колона К-10 1шт'), 'Колонна');
  assert.equal(constructionType('Колонна К-1'), 'Колонна');
  assert.equal(constructionType('Балка Б-1'), 'Балка');
  assert.equal(constructionType('К-10 1шт'), 'Прочее');
});

test('parseCsv: кавычки, запятые, переводы строк', () => {
  assert.deepEqual(parseCsv('a,"b,c","d ""x"""\r\n1,"two\nlines",3\n'),
    [['a', 'b,c', 'd "x"'], ['1', 'two\nlines', '3']]);
  assert.deepEqual(parseCsv('a,b'), [['a', 'b']]);
});

test('parseDate', () => {
  const d = parseDate('17.11.2026 09:17');
  assert.equal(d.getFullYear(), 2026); assert.equal(d.getMonth(), 10);
  assert.equal(d.getDate(), 17); assert.equal(d.getHours(), 9); assert.equal(d.getMinutes(), 17);
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('31.02.2026 10:00'), null);
  assert.ok(parseDate('05.04.2026'));
});

test('parseWeight', () => {
  assert.equal(parseWeight('1820'), 1820);
  assert.equal(parseWeight('1 820,5'), 1820.5);
  assert.equal(parseWeight('Общий вес 151039 кг'), 151039);
  assert.equal(parseWeight(''), null);
  assert.equal(parseWeight('abc'), null);
});

test('normalizeClient', () => {
  for (const v of ['Карер', 'Карьер ', 'Тургень карьер', 'Карьер Тургень', '  карьер   тургень']) {
    assert.equal(normalizeClient(v), 'Карьер Тургень', v);
  }
  for (const v of ['Алишер физ', 'Алишер физ.лицо', 'Алишер Физ.лицо']) {
    assert.equal(normalizeClient(v), 'Алишер (физ. лицо)', v);
  }
  assert.equal(normalizeClient('Тараз  ПТ '), 'Тараз ПТ');
  assert.equal(normalizeClient(''), 'Без заказчика');
});

test('messageIdFromLink', () => {
  assert.equal(messageIdFromLink('https://t.me/c/3922821045/1807'), '1807');
  assert.equal(messageIdFromLink(''), '');
});

const CSV = [
  '"Дата","Наименование конструкции и изделий","Заказчик","Общий вес 3000 кг","Ссылка на фото","Фото ID"',
  '"03.11.2026 16:54","Колона К-11 4шт","КазАгроФуд","1 000","https://t.me/c/1/10","abc"',
  '"04.11.2026 08:11","Балка Б-10 1шт","Карер","2000","https://t.me/c/1/11","","лишнее"',
  '"","Ферма 1шт","КазАгроФуд","","https://t.me/c/1/12"',
  ',,,,',
  '"Дата","Наименование конструкции и изделий","Заказчик","Общий вес 3000 кг","Ссылка на фото"',
  '"05.11.2026 08:11","Связь СВ-2 2шт","Алишер физ","","https://t.me/c/1/13,40"',
].join('\n');

test('parseSheet: грязные данные', () => {
  const { entries, headerTotal } = parseSheet(CSV, 'Фото');
  assert.equal(headerTotal, 3000);
  assert.equal(entries.length, 4); // пустая и повторный заголовок пропущены
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  assert.equal(byId['10'].photoId, 'abc');
  assert.equal(byId['11'].client, 'Карьер Тургень');
  assert.equal(byId['12'].weight, null);
  assert.equal(byId['12'].date, null);
  assert.equal(byId['13'].weight, null);
  assert.equal(entries[0].id, '13'); // новые сверху
  assert.equal(entries.at(-1).id, '12'); // без даты — в конец
  const s = summarize(entries);
  assert.equal(s.total, 3000);
  assert.equal(s.count, 4);
  assert.equal(s.clients[0].name, 'Карьер Тургень');
});

test('parseSheet: старый лист с «Кто отправил» и «Вес»', () => {
  const csv = '"Дата","Кто отправил","Название","Заказчик","Вес","Ссылка на фото"\n' +
    '"01.04.2026 10:00","Иван (@i)","Балка Б-1 2шт","Карьер","500","https://t.me/c/1/5"';
  const { entries, headerTotal } = parseSheet(csv, 'April');
  assert.equal(headerTotal, null);
  assert.equal(entries[0].sender, 'Иван (@i)');
  assert.equal(entries[0].weight, 500);
  assert.equal(entries[0].client, 'Карьер Тургень');
});
