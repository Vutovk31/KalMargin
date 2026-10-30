import { writeFileSync, mkdirSync } from 'node:fs';
import { XLSX } from './xlsx.js';
mkdirSync('fixtures', { recursive: true });
const headers = ['Код товара', 'Кол-во', 'Цена со скидкой', 'Закупочная цена товара'];
export function workbook(rows, second = false) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Заказ');
  if (second) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ['other', 1, 100, 50]]), 'Другой');
  return wb;
}
for (const type of ['xlsx', 'xls']) writeFileSync(`fixtures/synthetic-order.${type}`, XLSX.write(workbook([
  ['00123', 1.5, 650.55, 495.123456], ['=SUM(1,2)', 2, 100, 90], ['zero-cost', 1, 1, 0], ['loss', 0.25, 80.99, 100]
]), { type: 'buffer', bookType: type === 'xls' ? 'biff8' : 'xlsx' }));
writeFileSync('fixtures/synthetic-invalid.xlsx', XLSX.write(workbook([['below-ruble', 1, 0.99, 0], ['empty-cost', 1, 20, '']]), { type: 'buffer', bookType: 'xlsx' }));
writeFileSync('fixtures/synthetic-multiple.xlsx', XLSX.write(workbook([['first', 1, 100, 50]], true), { type: 'buffer', bookType: 'xlsx' }));
const formula = workbook([['formula', 1, 100, 50]]);
formula.Sheets['Заказ'].D2 = { t: 'n', f: '25+25', v: 50 };
writeFileSync('fixtures/synthetic-formula.xlsx', XLSX.write(formula, { type: 'buffer', bookType: 'xlsx' }));
