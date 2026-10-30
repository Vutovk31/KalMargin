export const VERSION = '1.0.0';
export const RULES = 'whole-ruble-no-increase-v1';
export const DEFAULT_TARGET = '15';
const SCALE = 1000000n;
const LIMIT = 1000000000000n * SCALE;
export class ValidationError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new ValidationError(code, message); };
// Six decimal places are accepted exactly, never silently rounded.
export function decimal(value) {
  if (typeof value !== 'string' && typeof value !== 'number') fail('NUMBER', 'Пустая или неверная числовая ячейка');
  if (typeof value === 'number' && !Number.isFinite(value)) fail('NUMBER', 'Число должно быть конечным');
  if (String(value).length > 128) fail('LIMIT', 'Слишком длинное числовое значение');
  let text = String(value).trim().replace(/[\s\u00a0\u202f]/g, '').replace(/₽$/, '').replace(',', '.');
  if (typeof value === 'number' && /e/i.test(text)) {
    const [mantissa, exponent] = text.toLowerCase().split('e');
    const sign = mantissa.startsWith('-') ? '-' : '';
    const clean = mantissa.replace('-', '');
    const [whole, fraction = ''] = clean.split('.');
    const digits = whole + fraction;
    const point = whole.length + Number(exponent);
    text = sign + (point <= 0 ? '0.' + '0'.repeat(-point) + digits : point >= digits.length ? digits + '0'.repeat(point - digits.length) : digits.slice(0, point) + '.' + digits.slice(point));
  }
  if (!/^[+-]?\d+(\.\d{1,6})?$/.test(text)) fail('PRECISION', 'Требуется десятичное число, не более 6 знаков после запятой');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace(/^[+-]/, '').split('.');
  const scaled = (BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'))) * (negative ? -1n : 1n);
  if (scaled > LIMIT || scaled < -LIMIT) fail('LIMIT', 'Число превышает предел 1 000 000 000 000');
  return scaled;
}
export function exact(value, places = 6) {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const scale = 10n ** BigInt(places);
  const fraction = String(abs % scale).padStart(places, '0').replace(/0+$/, '');
  return (negative ? '-' : '') + String(abs / scale) + (fraction ? '.' + fraction : '');
}
export function targetValue(value) {
  const target = decimal(value);
  if (target < 0n || target > 99990000n || target % 10000n !== 0n) fail('TARGET', 'Маржинальность: от 0 до 99,99%, не более двух знаков');
  return target;
}
export const validPrice = value => Number.isSafeInteger(value) && value >= 1;
export function calculateRow(input, target) {
  const t = targetValue(target);
  const price = decimal(input.price), cost = decimal(input.cost), qty = decimal(input.qty);
  if (price <= 0n || cost < 0n || qty <= 0n || qty > 1000000n * SCALE) fail('RANGE', 'Цена и количество должны быть положительными; закупка ≥ 0; количество ≤ 1 000 000');
  const cap = price / SCALE;
  if (cap < 1n) fail('PRICE_BELOW_RUBLE', 'Цена ниже 1 ₽: целая положительная цена без повышения невозможна');
  const denominator = 100n * SCALE - t;
  const numerator = cost * 100n;
  const required = (numerator + denominator - 1n) / denominator;
  const minimum = required < 1n ? 1n : required;
  const final = Number(minimum > cap ? cap : minimum);
  if (!validPrice(final)) fail('PRICE', 'Недопустимая итоговая цена');
  const belowTarget = BigInt(final) * denominator < numerator;
  return { ...input, code: String(input.code), price: exact(price), cost: exact(cost), qty: exact(qty), final,
    currentMargin: Number((price - cost)) / Number(price) * 100,
    finalMargin: Number(BigInt(final) * SCALE - cost) / (final * Number(SCALE)) * 100,
    changed: BigInt(final) * SCALE !== price, belowTarget,
    reason: belowTarget ? 'Цель недостижима без повышения исходной цены' : 'OK' };
}
export function calculate(records, target, metadata = {}) {
  targetValue(target);
  const out = [], errors = [];
  for (const record of records) {
    try { out.push(calculateRow(record, target)); }
    catch (error) { errors.push({ sourceRow: record.sourceRow, code: record.code, input: { price: record.price, cost: record.cost, qty: record.qty }, errorCode: error.code || 'CALCULATION', reason: error.message }); }
  }
  let sum = 0n, cost = 0n, before = 0n;
  for (const row of out) {
    const q = decimal(row.qty);
    sum += BigInt(row.final) * SCALE * q;
    cost += decimal(row.cost) * q;
    before += decimal(row.price) * q;
  }
  return { ...metadata, version: VERSION, rules: RULES, time: new Date().toISOString(), target: exact(targetValue(target)), out, errors,
    summary: { sum: exact(sum, 12), cost: exact(cost, 12), profit: exact(sum - cost, 12), before: exact(before, 12), beforeProfit: exact(before - cost, 12), margin: sum ? Number(sum - cost) / Number(sum) * 100 : 0 } };
}
export function assertPriceRows(rows, target) {
  for (const row of rows) {
    if (!validPrice(row.final) || BigInt(row.final) * SCALE > decimal(row.price)) fail('EXPORT_PRICE', 'Экспорт заблокирован: цена должна быть целой, положительной и не выше исходной');
    const verified = calculateRow(row, target);
    if (verified.final !== row.final || verified.finalMargin !== row.finalMargin || verified.belowTarget !== row.belowTarget) fail('EXPORT_STALE', 'Экспорт заблокирован: результат не соответствует исходным данным');
  }
  return rows;
}
export function assertExport(state) {
  if (!state || state.errors?.length || !state.out?.length) fail('EXPORT_BLOCKED', 'Экспорт заблокирован: исправьте ошибки и выполните расчёт заново');
  assertPriceRows(state.out, state.target);
  return state;
}
