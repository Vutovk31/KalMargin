import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
for (const target of ['15', '0', '99.99']) test(`provided real workbook: independent Decimal/openpyxl oracle, target ${target}`, async ({ page }) => {
  test.skip(!process.env.KALMARGIN_REAL_SAMPLE, 'Private real workbook is supplied only in the acceptance environment');
  await page.goto('/');
  await page.locator('#target').fill(target);
  await page.locator('#file').setInputFiles(process.env.KALMARGIN_REAL_SAMPLE);
  await page.locator('#calc').click();
  await expect(page.locator('#results')).toBeVisible();
  if (await page.locator('#risk-control').isVisible()) await page.locator('#accept-risk').check();
  const pending = page.waitForEvent('download');
  await page.locator('#download').click();
  const path = await (await pending).path();
  const verification = spawnSync('python3', ['scripts/verify-workbook.py', process.env.KALMARGIN_REAL_SAMPLE, path, target], { encoding: 'utf8' });
  expect(verification.status, verification.stderr).toBe(0);
  expect(verification.stdout).toContain('verification passed');
});
