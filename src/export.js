import { assertExport, assertPriceRows } from './core.js';
// Quoting alone does not prevent spreadsheet formulas. Also neutralize TSV separators.
export function safeText(value) {
  const text = String(value ?? '').replace(/[\t\r\n]/g, ' ');
  return /^[\s\uFEFF]*[=+\-@]/.test(text) ? "'" + text : text;
}
const quote = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
export function resultRows(state) {
  assertExport(state);
  return [['Код товара', 'Цена итог', 'Маржа итог (%)'], ...state.out.map(x => [safeText(x.code), x.final, x.finalMargin])];
}
export function csv(state) { return '\uFEFF' + resultRows(state).map(r => r.map(quote).join(';')).join('\r\n'); }
export function clipboard(state) { return resultRows(state).map(r => r.join('\t')).join('\n'); }
export function resultBook(XLSX, state) {
  assertExport(state);
  const rows = [['Код товара', 'Цена итог', 'Маржа итог (%)'], ...state.out.map(x => [x.code, x.final, x.finalMargin / 100])];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  for (let r = 1; r < rows.length; r++) {
    sheet[XLSX.utils.encode_cell({ r, c: 0 })].t = 's';
    sheet[XLSX.utils.encode_cell({ r, c: 0 })].z = '@';
    sheet[XLSX.utils.encode_cell({ r, c: 1 })].z = '0';
    sheet[XLSX.utils.encode_cell({ r, c: 2 })].z = '0.00%';
  }
  sheet['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 20 }];
  const summary = XLSX.utils.aoa_to_sheet([['Показатель', 'Значение (точное десятичное)'], ['Цель, %', state.target], ...Object.entries(state.summary)]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Результат');
  XLSX.utils.book_append_sheet(wb, summary, 'Сводка');
  return wb;
}
export function diagnostics(state, { commercial = false, filename = false } = {}) {
  if (!state) throw new Error('Нет отчёта');
  if (commercial && state.out?.length) assertPriceRows(state.out, state.target);
  return JSON.stringify({ version: state.version, rules: state.rules, time: state.time, sheet: commercial ? state.sheet : undefined,
    file: filename ? state.file : undefined, target: commercial ? state.target : undefined,
    processed: state.out?.length || 0, rejected: state.errors?.length || 0,
    errors: (state.errors || []).map(x => ({ row: x.sourceRow, code: x.errorCode, sku: commercial ? x.code : undefined, input: commercial ? x.input : undefined, reason: commercial ? x.reason : undefined })),
    warnings: (state.warnings || []).map(x => ({ row: x.sourceRow, reason: commercial ? x.reason : undefined })),
    rows: commercial ? (state.out || []).map(x => ({ ...x })) : undefined,
    summary: commercial ? state.summary : undefined }, null, 2);
}
