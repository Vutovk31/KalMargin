import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { XLSX } from '../../scripts/xlsx.js';
async function upload(page, name = 'synthetic-order.xlsx') {
  await page.locator('#file').setInputFiles('fixtures/' + name);
  await page.locator('#calc').click();
}
async function download(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  return readFile(await (await pending).path());
}
for (const ext of ['xlsx', 'xls']) test(`offline ${ext} import, typed XLSX, CSV and clipboard integer prices`, async ({ page, context }) => {
  const exceptions = [];
  page.on('pageerror', e => exceptions.push(e.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/');
  await expect(page.locator('#target')).toHaveValue('15');
  await upload(page, 'synthetic-order.' + ext);
  await expect(page.locator('#tbody tr')).toHaveCount(4);
  await expect(page.locator('#tbody tr').first().locator('td').nth(2)).toHaveText('583');
  await expect(page.locator('#warnings')).toContainText('Ниже цели: 2');
  await page.locator('#download').click();
  await expect(page.locator('#error')).toContainText('Подтвердите');
  await page.locator('#accept-risk').check();
  const bytes = await download(page, '#download');
  const wb = XLSX.read(bytes, { type: 'buffer' });
  const expected = [583, 100, 1, 80];
  for (let i = 0; i < 4; i++) {
    const cell = wb.Sheets['Результат']['B' + (i + 2)];
    expect(cell.t).toBe('n'); expect(cell.v).toBe(expected[i]); expect(Number.isSafeInteger(cell.v)).toBe(true);
  }
  expect(wb.Sheets['Результат'].A3.f).toBeUndefined();
  const csv = (await download(page, '#csv')).toString('utf8');
  for (const [i, line] of csv.split('\r\n').slice(1).entries()) expect(line.split(';')[1]).toBe('"' + expected[i] + '"');
  await page.locator('#copy').click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  for (const [i, line] of clipboard.split('\n').slice(1).entries()) expect(line.split('\t')[1]).toBe(String(expected[i]));
  expect(clipboard).toContain("'=SUM(1,2)");
  await page.locator('#search').fill('00123');
  await expect(page.locator('#tbody tr')).toHaveCount(1);
  await page.locator('#search').fill(''); await page.locator('#only-risk').check();
  await expect(page.locator('#tbody tr')).toHaveCount(2);
  await page.locator('summary').click();
  const report = JSON.parse((await download(page, '#report')).toString());
  expect(report.rows).toBeUndefined(); expect(report.file).toBeUndefined(); expect(report.processed).toBe(4);
  await page.locator('#commercial').check();
  const commercial = JSON.parse((await download(page, '#report')).toString());
  expect(commercial.rows[0].cost).toBe('495.123456');
  expect(exceptions).toEqual([]);
});
test('manual target retained on file selection; reset restores 15; template reimports', async ({ page }) => {
  await page.goto('/');
  await page.locator('#target').fill('20');
  await upload(page);
  await expect(page.locator('#target')).toHaveValue('20');
  await expect(page.locator('#tbody tr').first().locator('td').nth(2)).toHaveText('619');
  await page.locator('#reset').click();
  await expect(page.locator('#target')).toHaveValue('15');
  await expect(page.locator('#calc')).toBeDisabled();
  await expect(page.locator('#results')).toBeHidden();
  const template = await download(page, '#template');
  await page.locator('#file').setInputFiles({ name: 'template.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: template });
  await page.locator('#calc').click();
  await expect(page.locator('#tbody tr')).toHaveCount(1);
  await expect(page.locator('#tbody tr td').nth(2)).toHaveText('583');
});
test('invalid import and changed target invalidate previous exports; diagnostics without commercial data', async ({ page }) => {
  await page.goto('/'); await upload(page);
  await expect(page.locator('#results')).toBeVisible();
  await page.locator('#target').fill('99.999');
  await expect(page.locator('#results')).toBeHidden();
  await page.locator('#calc').click();
  await expect(page.locator('#error')).toContainText('Маржинальность');
  await page.locator('#target').fill('15');
  await upload(page, 'synthetic-invalid.xlsx');
  await expect(page.locator('#error')).toContainText('Ошибок: 2');
  await expect(page.locator('#results')).toBeHidden();
  await page.locator('summary').click();
  const report = JSON.parse((await download(page, '#report')).toString());
  expect(report.rejected).toBe(2); expect(report.errors[0].code).toBe('PRICE_BELOW_RUBLE');
  expect(report).not.toHaveProperty('rows');
  await page.locator('#file').setInputFiles({ name: 'bad.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('not excel') });
  await page.locator('#calc').click(); await expect(page.locator('#error')).toContainText('Не найдены колонки');
});
test('multiple sheets are explicit and formula cached values refused', async ({ page }) => {
  await page.goto('/'); await upload(page, 'synthetic-multiple.xlsx');
  await expect(page.locator('#sheet-field')).toBeVisible();
  await expect(page.locator('#results')).toBeHidden();
  await page.locator('#sheet').selectOption('Другой');
  await page.locator('#calc').click(); await expect(page.locator('#tbody')).toContainText('other');
  await upload(page, 'synthetic-formula.xlsx');
  await expect(page.locator('#error')).toContainText('FORMULA');
  await expect(page.locator('#results')).toBeHidden();
});
test('local module failure is recoverable', async ({ page }) => {
  let blocked = true;
  await page.route('**/vendor/xlsx-0.18.5.min.js', r => blocked ? r.abort() : r.continue());
  await page.goto('/'); await expect(page.locator('#retry')).toBeVisible();
  blocked = false; await page.locator('#retry').click();
  await expect(page.locator('#status')).toContainText('готов');
  await upload(page); await expect(page.locator('#results')).toBeVisible();
});
test('malicious-looking SKU and sheet name are rendered only as text', async ({ page }) => {
  const code = '<svg onload=alert(1)>';
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Код товара', 'Кол-во', 'Цена со скидкой', 'Закупочная цена товара'], [code, 1, 100, 50]]), '<img src=x onerror=alert(1)>');
  await page.goto('/');
  await page.locator('#file').setInputFiles({ name: 'safe.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })) });
  await page.locator('#calc').click();
  await expect(page.locator('#tbody')).toContainText(code);
  await expect(page.locator('#results svg, #results img')).toHaveCount(0);
});
test('stalled worker times out and allows a retry', async ({ page }) => {
  await page.clock.install();
  await page.route('**/src/import-worker.js', r => r.fulfill({ contentType: 'application/javascript', body: 'self.onmessage = () => {};' }));
  await page.goto('/'); await upload(page);
  await expect(page.locator('#calc')).toHaveText('Обработка…');
  await page.clock.fastForward(15001);
  await expect(page.locator('#error')).toContainText('Превышено время');
  await expect(page.locator('#calc')).toBeEnabled();
  await page.unroute('**/src/import-worker.js');
  await page.locator('#calc').click();
  await expect(page.locator('#results')).toBeVisible();
});
test('10,000-row workbook has bounded table rendering and full integer export', async ({ page }) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Код товара', 'Кол-во', 'Цена со скидкой', 'Закупочная цена товара'], ...Array.from({ length: 10000 }, (_, i) => ['sku-' + i, 1.5, 650.55, 495.123456])]), 'Large');
  await page.goto('/');
  await page.locator('#file').setInputFiles({ name: 'large.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })) });
  const started = Date.now();
  await page.locator('#calc').click();
  await expect(page.locator('#results')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#tbody tr')).toHaveCount(500);
  const bytes = await download(page, '#download');
  const out = XLSX.read(bytes, { type: 'buffer' }).Sheets['Результат'];
  expect(out['!ref']).toBe('A1:C10001');
  for (let r = 2; r <= 10001; r++) expect(out['B' + r].v).toBe(583);
  console.log('10,000-row import, render, export and read-back ms:', Date.now() - started);
});
