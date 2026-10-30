import { calculate, assertExport, DEFAULT_TARGET, VERSION, RULES } from './core.js';
import { LIMITS } from './import.js';
import { csv, clipboard, resultBook, diagnostics } from './export.js';
const $ = id => document.getElementById(id);
let selected = null, state = null, worker = null, generation = 0, pendingReject = null;
const pct = v => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 }).format(v) + '%';
// Exact totals are strings; avoid rounding away fractional quantities or purchase costs.
const money = value => String(value).replace('.', ',') + ' ₽';
const empty = id => $(id).replaceChildren();
function error(message) { $('error').textContent = message; $('error').classList.remove('hidden'); }
function clearError() { $('error').classList.add('hidden'); }
function update() { $('calc').disabled = !selected || !window.XLSX || !!worker; }
function invalidate() {
  generation++;
  worker?.terminate(); worker = null;
  pendingReject?.(new Error('Операция отменена')); pendingReject = null;
  state = null; $('results').classList.add('hidden'); $('row-errors').classList.add('hidden'); $('accept-risk').checked = false;
  $('calc').textContent = 'Рассчитать маржинальность';
  update();
}
function ready() {
  const ok = !!window.XLSX;
  $('dot').className = 'dot ' + (ok ? 'ready' : 'error');
  $('status').textContent = ok ? 'Локальный модуль Excel готов. Файлы не отправляются на сервер.' : 'Модуль Excel недоступен. Повторите загрузку.';
  $('retry').classList.toggle('hidden', ok); update();
}
function choose(file) {
  invalidate(); clearError(); selected = null;
  empty('sheet'); $('sheet-field').classList.add('hidden');
  $('filename').textContent = 'Файл не выбран';
  if (!file) { update(); return; }
  if (!/\.(xls|xlsx)$/i.test(file.name)) error('Нужен файл .xls или .xlsx');
  else if (file.size > LIMITS.bytes) error('Максимальный размер файла — 5 МБ');
  else { selected = file; $('filename').textContent = file.name; }
  update();
}
function parse(buffer, sheet) {
  return new Promise((resolve, reject) => {
    worker = new Worker(new URL('./import-worker.js', import.meta.url));
    const active = worker;
    const timeout = setTimeout(() => finish(null, new Error('Превышено время обработки (15 секунд). Уменьшите файл.')), LIMITS.milliseconds);
    function finish(result, failure) {
      clearTimeout(timeout); active.terminate();
      if (worker === active) { worker = null; pendingReject = null; }
      if (failure) reject(failure); else resolve(result);
    }
    pendingReject = failure => finish(null, failure);
    active.onmessage = ({ data }) => data.error ? finish(null, Object.assign(new Error(data.error.message), { code: data.error.code })) : finish(data.result);
    active.onerror = () => finish(null, new Error('Не удалось запустить обработчик Excel. Повторите загрузку страницы.'));
    active.postMessage({ buffer, sheet }, [buffer]);
    update();
  });
}
async function run() {
  if (!selected || worker) return;
  const file = selected;
  invalidate(); clearError();
  const id = generation;
  $('calc').disabled = true; $('calc').textContent = 'Обработка…';
  try {
    // Validate target before allocating workbook memory.
    calculate([], $('target').value);
    const buffer = await file.arrayBuffer();
    if (id !== generation) return;
    const imported = await parse(buffer, $('sheet').value);
    if (id !== generation) return;
    if (!imported.records) {
      empty('sheet');
      const placeholder = new Option('Выберите лист…', '');
      $('sheet').add(placeholder);
      imported.sheets.forEach(name => $('sheet').add(new Option(name, name)));
      $('sheet-field').classList.remove('hidden');
      error('Найдено несколько подходящих листов. Выберите нужный и повторите расчёт.');
      return;
    }
    state = calculate(imported.records, $('target').value, { file: file.name, sheet: imported.sheet, warnings: imported.warnings });
    state.errors.push(...imported.errors);
    if (!state.out.length && !state.errors.length) state.errors.push({ errorCode: 'EMPTY', reason: 'Нет строк с товарами' });
    if (state.errors.length) {
      renderErrors();
      error('Экспорт заблокирован. Ошибок: ' + state.errors.length + '. ' + state.errors.slice(0, 30).map(x => `Строка ${x.sourceRow ?? '—'} [${x.errorCode}]: ${x.reason}`).join('\n') + (state.errors.length > 30 ? '\nПолный список — в диагностике.' : ''));
      return;
    }
    render();
  } catch (e) {
    if (id !== generation) return;
    state = { version: VERSION, rules: RULES, time: new Date().toISOString(), file: file.name, errors: [{ errorCode: e.code || 'IMPORT', reason: e.message }], out: [] };
    error(e.message);
  } finally { if (id === generation) { $('calc').textContent = 'Рассчитать маржинальность'; update(); } }
}
function renderErrors() {
  empty('error-list');
  const query = $('error-search').value.toLocaleLowerCase('ru-RU');
  const errors = (state?.errors || []).filter(x => [x.sourceRow, x.code, x.errorCode, x.reason].join(' ').toLocaleLowerCase('ru-RU').includes(query));
  for (const item of errors.slice(0, 100)) {
    const li = document.createElement('li');
    li.textContent = `Строка ${item.sourceRow ?? '—'} [${item.errorCode}]: ${item.reason}`;
    $('error-list').append(li);
  }
  $('error-count').textContent = `Найдено ${errors.length}; показано ${Math.min(errors.length, 100)}. Полный список доступен в диагностике.`;
  $('row-errors').classList.remove('hidden');
}
function renderTable() {
  empty('tbody');
  const search = $('search').value.toLocaleLowerCase('ru-RU');
  const rows = state.out.filter(x => x.code.toLocaleLowerCase('ru-RU').includes(search) && (!$('only-risk').checked || x.belowTarget));
  // Keep DOM work bounded; exports always include the entire validated result.
  for (const x of rows.slice(0, 500)) {
    const tr = document.createElement('tr');
    if (x.belowTarget) tr.className = 'risk';
    for (const value of [x.code, x.price, String(x.final), pct(x.currentMargin), pct(x.finalMargin), x.reason]) {
      const td = document.createElement('td'); td.textContent = value; tr.append(td);
    }
    $('tbody').append(tr);
  }
  $('visible-count').textContent = `Найдено ${rows.length}; показано ${Math.min(rows.length, 500)}. Экспорт содержит все ${state.out.length} позиций.`;
}
function render() {
  assertExport(state);
  const s = state.summary;
  $('sum').textContent = money(s.sum); $('cost').textContent = money(s.cost);
  $('profit').textContent = money(s.profit); $('margin').textContent = pct(s.margin);
  $('comparison').textContent = `До: сумма ${money(s.before)}, прибыль ${money(s.beforeProfit)}. После: сумма ${money(s.sum)}, прибыль ${money(s.profit)}.`;
  empty('pills');
  for (const label of ['Позиций: ' + state.out.length, 'Целевая маржа: ' + state.target + '%', 'Лист: ' + state.sheet]) {
    const span = document.createElement('span'); span.className = 'pill'; span.textContent = label; $('pills').append(span);
  }
  const risky = state.out.filter(x => x.belowTarget).length;
  const warnings = state.warnings || [];
  $('warnings').textContent = `Ниже цели: ${risky}. Повышение цены запрещено. ` + warnings.slice(0, 30).map(x => `Строка ${x.sourceRow}: ${x.reason}`).join('; ') + (warnings.length > 30 ? ' Остальные предупреждения — в диагностике.' : '');
  $('warnings').classList.toggle('hidden', !risky && !warnings.length);
  $('risk-control').classList.toggle('hidden', !risky && !warnings.length);
  renderTable(); $('results').classList.remove('hidden');
}
function authorize() {
  if (!state || state.errors?.length) throw new Error('Выполните корректный расчёт');
  if ((state.out.some(x => x.belowTarget) || state.warnings?.length) && !$('accept-risk').checked) throw new Error('Подтвердите экспорт с предупреждениями');
}
function save(data, type, name) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function action(fn) { return async () => { clearError(); try { await fn(); } catch (e) { error(e.message); } }; }
$('file').addEventListener('change', e => choose(e.target.files[0]));
$('calc').addEventListener('click', run);
$('target').addEventListener('input', invalidate);
$('sheet').addEventListener('change', invalidate);
$('error-search').addEventListener('input', renderErrors);
$('search').addEventListener('input', () => state && renderTable());
$('only-risk').addEventListener('change', () => state && renderTable());
$('download').addEventListener('click', action(() => { authorize(); window.XLSX.writeFile(resultBook(window.XLSX, state), 'KalMargin_result.xlsx'); }));
$('csv').addEventListener('click', action(() => { authorize(); save(csv(state), 'text/csv;charset=utf-8', 'KalMargin_result.csv'); }));
$('copy').addEventListener('click', action(async () => { authorize(); await navigator.clipboard.writeText(clipboard(state)); $('status').textContent = 'Результат скопирован'; }));
$('report').addEventListener('click', action(() => save(diagnostics(state, { commercial: $('commercial').checked, filename: $('include-file').checked }), 'application/json', 'KalMargin_diagnostics.json')));
$('template').addEventListener('click', action(() => {
  const wb = window.XLSX.utils.book_new();
  const sh = window.XLSX.utils.aoa_to_sheet([['Код товара', 'Кол-во', 'Цена со скидкой', 'Закупочная цена товара'], ['00123', 4, 650, 495]]);
  window.XLSX.utils.book_append_sheet(wb, sh, 'Товарная часть заказа');
  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet([['Целевая маржинальность по умолчанию, %'], [15]]), 'Инструкция');
  window.XLSX.writeFile(wb, 'KalMargin_template.xlsx');
}));
$('reset').addEventListener('click', () => {
  choose(null); $('target').value = DEFAULT_TARGET; $('file').value = ''; $('search').value = ''; $('error-search').value = '';
  $('only-risk').checked = false; $('commercial').checked = false; $('include-file').checked = false;
});
$('retry').addEventListener('click', () => {
  const script = document.createElement('script'); script.src = 'vendor/xlsx-0.18.5.min.js';
  script.onload = ready; script.onerror = ready; document.head.append(script);
});
for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) $('drop').addEventListener(type, e => {
  e.preventDefault(); $('drop').classList.toggle('over', type === 'dragenter' || type === 'dragover');
  if (type === 'drop') choose(e.dataTransfer.files[0]);
});
ready();
