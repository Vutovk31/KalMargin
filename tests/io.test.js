import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { XLSX } from '../scripts/xlsx.js';
import { calculate } from '../src/core.js';
import { readWorkbook, locate, LIMITS } from '../src/import.js';
import { csv, clipboard, resultBook, diagnostics, safeText } from '../src/export.js';
const input = name => readFileSync(new URL('../fixtures/' + name, import.meta.url));
for (const ext of ['xls', 'xlsx']) test('real binary synthetic ' + ext + ' import/export values and types', () => {
  const imported = readWorkbook(XLSX, input('synthetic-order.' + ext));
  assert.equal(imported.records.length, 4); assert.equal(imported.records[0].code, '00123');
  const state = calculate(imported.records, '15', imported);
  assert.equal(state.errors.length, 0);
  const wb = XLSX.read(XLSX.write(resultBook(XLSX, state), { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  for (let r = 2; r <= 5; r++) { const cell = wb.Sheets['Результат']['B' + r]; assert.equal(cell.t, 'n'); assert.ok(Number.isSafeInteger(cell.v) && cell.v >= 1); assert.equal(cell.v, state.out[r - 2].final); }
  assert.equal(wb.Sheets['Результат'].A3.t, 's'); assert.equal(wb.Sheets['Результат'].A3.f, undefined);
  assert.match(csv(state), /'=/); assert.match(clipboard(state), /'=/);
  for (const line of clipboard(state).split('\n').slice(1)) assert.match(line.split('\t')[1], /^[1-9]\d*$/);
  const privateReport = diagnostics(state);
  assert.ok(!privateReport.includes('495.123456')); assert.ok(!privateReport.includes('00123'));
  assert.match(diagnostics(state, { commercial: true }), /495.123456/);
});
test('multiple sheets require explicit selection and formulas are rejected', () => {
  const data = input('synthetic-multiple.xlsx');
  assert.equal(readWorkbook(XLSX, data).sheets.length, 2);
  assert.equal(readWorkbook(XLSX, data, 'Другой').records[0].code, 'other');
  assert.throws(() => readWorkbook(XLSX, data, 'missing'));
  assert.equal(readWorkbook(XLSX, input('synthetic-formula.xlsx')).errors[0].errorCode, 'FORMULA');
});
test('limits and duplicate headers', () => {
  assert.throws(() => readWorkbook(XLSX, { byteLength: LIMITS.bytes + 1 }), /5 МБ/);
  assert.throws(() => locate([['Код', 'Кол-во', 'Цена со скидкой', 'Закупочная цена', 'Цена продажи']]), /Неоднозначные/);
});
test('all output channels enforce integer prices and no stale computation', () => {
  const s = calculate([{ code: 'x', price: '10.99', cost: '8', qty: '1' }], '15');
  for (const bad of [0, 0.5, 11, NaN, Infinity]) {
    s.out[0].final = bad;
    for (const fn of [csv, clipboard, x => resultBook(XLSX, x), x => diagnostics(x, { commercial: true })]) assert.throws(() => fn(s));
  }
  for (const value of ['=cmd', ' +cmd', '\t-cmd', '@cmd', '\n=cmd']) assert.ok(safeText(value).includes("'"));
});
test('absolute source coordinates, leading zeros, duplicate SKU, totals and missing code', () => {
  const sh = XLSX.utils.aoa_to_sheet([
    ['Код товара', 'Кол-во', 'Цена со скидкой', 'Закупочная цена товара'],
    [123, 1, 100, 50], ['00123', 2, 200, 100], ['Итого', '', 500, ''], ['', 1, 5, 2]
  ], { origin: 'B5' });
  sh.B6.z = '00000';
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, sh, '<img src=x onerror=alert(1)>');
  const parsed = readWorkbook(XLSX, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  assert.equal(parsed.records[0].sourceRow, 6); assert.equal(parsed.records[0].code, '00123');
  assert.equal(parsed.warnings.length, 2); assert.equal(parsed.errors[0].sourceRow, 9);
});
test('range, sheet and data-row limits are enforced before conversion', () => {
  for (const ref of ['A1:C20000', 'A1:XFD2']) {
    const wb = XLSX.utils.book_new();
    const sh = { A1: { t: 's', v: 'x' }, '!ref': ref };
    XLSX.utils.book_append_sheet(wb, sh, 'Sheet');
    assert.throws(() => readWorkbook(XLSX, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })), /предел/);
  }
  const wb = XLSX.utils.book_new();
  for (let n = 0; n < 21; n++) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'S' + n);
  assert.throws(() => readWorkbook(XLSX, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })), /20 листов/);
});
test('rejected inputs are included only in commercial diagnostics', () => {
  const state = calculate([{ code: 'private-sku', sourceRow: 42, price: '0.99', qty: '1.125', cost: '0.123456' }], '15');
  const redacted = diagnostics(state);
  assert.ok(!redacted.includes('private-sku')); assert.ok(!redacted.includes('0.123456'));
  const full = JSON.parse(diagnostics(state, { commercial: true }));
  assert.equal(full.errors[0].input.cost, '0.123456'); assert.equal(full.errors[0].sku, 'private-sku');
});
