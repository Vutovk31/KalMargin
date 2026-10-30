import { ValidationError } from './core.js';
export const LIMITS = { bytes: 5 * 1024 * 1024, rows: 10000, columns: 100, sheets: 20, milliseconds: 15000 };
const aliases = { code: ['кодтовара', 'код', 'артикул'], qty: ['колво', 'количество', 'количествотовара'], price: ['ценасоскидкой', 'ценапродажи', 'ценаитог'], cost: ['закупочнаяценатовара', 'ценазакупки', 'закупочнаяцена', 'себестоимость'] };
const norm = value => String(value ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[\s._–—()%№-]+/g, '');
const empty = value => value === '' || value === null || value === undefined;
export function locate(rows) {
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const map = {}, duplicates = [];
    (rows[r] || []).forEach((value, c) => {
      for (const [name, list] of Object.entries(aliases)) if (list.includes(norm(value))) {
        if (map[name] !== undefined) duplicates.push(name);
        map[name] = c;
      }
    });
    if (Object.keys(map).length === 4) {
      if (duplicates.length) throw new ValidationError('DUPLICATE_HEADER', 'Неоднозначные обязательные колонки: ' + duplicates.join(', '));
      return { row: r, map };
    }
  }
  return null;
}
export function readWorkbook(XLSX, buffer, selectedSheet) {
  if (buffer.byteLength > LIMITS.bytes) throw new ValidationError('FILE_SIZE', 'Максимальный размер файла — 5 МБ');
  const wb = XLSX.read(buffer, { type: 'array', cellFormula: true, cellHTML: false, cellStyles: false, sheetRows: LIMITS.rows + 26 });
  if (wb.SheetNames.length > LIMITS.sheets) throw new ValidationError('SHEET_LIMIT', 'Допускается не более 20 листов');
  const candidates = [];
  for (const name of wb.SheetNames) {
    const sh = wb.Sheets[name];
    const range = XLSX.utils.decode_range(sh['!fullref'] || sh['!ref'] || 'A1');
    if (range.e.r >= LIMITS.rows + 25 || range.e.c >= LIMITS.columns) throw new ValidationError('TABLE_LIMIT', 'Лист превышает предел 10 000 строк данных / 100 колонок');
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, raw: true, defval: '', range: { s: { r: 0, c: 0 }, e: range.e } });
    const position = locate(rows);
    if (position) candidates.push({ name, sh, rows, position });
  }
  if (!candidates.length) throw new ValidationError('HEADERS', 'Не найдены колонки: Код товара, Кол-во, Цена со скидкой, Закупочная цена товара (первые 25 строк)');
  const names = candidates.map(x => x.name);
  if (candidates.length > 1 && !selectedSheet) return { sheets: names };
  const chosen = selectedSheet ? candidates.find(x => x.name === selectedSheet) : candidates[0];
  if (!chosen) throw new ValidationError('SHEET', 'Выбранный лист не найден');
  const { name, sh, rows, position } = chosen;
  if (rows.length - position.row - 1 > LIMITS.rows) throw new ValidationError('ROW_LIMIT', 'Максимум 10 000 строк данных');
  for (const c of Object.values(position.map)) if (sh[XLSX.utils.encode_cell({ r: position.row, c })]?.f) throw new ValidationError('FORMULA_HEADER', 'Формулы в заголовках не поддерживаются');
  const records = [], errors = [], warnings = [], seen = new Set();
  const rejected = (record, errorCode, reason) => ({ sourceRow: record.sourceRow, code: record.code, input: { price: record.price, cost: record.cost, qty: record.qty }, errorCode, reason });
  for (let r = position.row + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every(empty)) continue;
    const record = { sourceRow: r + 1 };
    let formula = false;
    for (const [key, c] of Object.entries(position.map)) {
      const cell = sh[XLSX.utils.encode_cell({ r, c })];
      formula ||= !!cell?.f;
      record[key] = row[c];
      if (key === 'code' && cell?.t === 'n') record[key] = XLSX.utils.format_cell(cell);
    }
    record.code = String(record.code ?? '').trim();
    if (formula) { errors.push(rejected(record, 'FORMULA', 'Формула в обязательной колонке: замените проверенным значением')); continue; }
    if (/^(итого|всего|total)$/i.test(record.code) && empty(record.qty)) { warnings.push({ sourceRow: r + 1, reason: 'Итоговая строка исключена' }); continue; }
    if (record.code.length > 256) { errors.push(rejected(record, 'SKU_LENGTH', 'Код товара длиннее 256 символов')); continue; }
    if (!record.code) { errors.push(rejected(record, 'SKU', 'В непустой строке отсутствует код товара')); continue; }
    if (seen.has(record.code)) warnings.push({ sourceRow: r + 1, reason: 'Повторный код товара: ' + record.code });
    seen.add(record.code);
    records.push(record);
  }
  return { records, errors, warnings, sheet: name, sheets: names };
}
