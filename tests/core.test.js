import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { decimal, exact, calculateRow, calculate, assertExport, DEFAULT_TARGET, targetValue } from '../src/core.js';
const row = (price = '650.55', cost = '495.123456', qty = '1.5') => ({ code: '001', sourceRow: 2, price, cost, qty });
test('default 15%; exact fractional cost, quantity and summaries', () => {
  assert.equal(DEFAULT_TARGET, '15');
  const s = calculate([row()], DEFAULT_TARGET);
  assert.equal(s.out[0].final, 583);
  assert.equal(s.out[0].cost, '495.123456');
  assert.equal(s.summary.sum, '874.5');
  assert.equal(s.summary.cost, '742.685184');
  assert.equal(s.summary.profit, '131.814816');
  assertExport(s);
});
test('whole-ruble boundaries, zero cost, equality, negative margin and extremes', () => {
  for (const [price, cost, target, final, risk] of [
    ['1.999999', '2', '0', 1, true], ['1', '0', '99.99', 1, false],
    ['650.55', '495', '15', 583, false], ['100', '85', '15', 100, false],
    ['80.99', '100', '15', 80, true], ['100', '85.000001', '15', 100, true],
    ['1000000000000', '100000000', '99.99', 1000000000000, false],
    ['100', '0.000001', '0', 1, false]
  ]) {
    const result = calculateRow(row(price, cost), target);
    assert.equal(result.final, final); assert.equal(result.belowTarget, risk);
  }
  assert.throws(() => calculateRow(row('0.999999', '0'), '15'), /ниже 1/);
});
test('blank, ambiguous and excessive precision numbers rejected, locale numbers accepted', () => {
  for (const bad of ['', ' ', null, undefined, NaN, Infinity, true, '1.2.3', '0x10', '1e2', '1,234,56', '1.0000001', '1000000000001']) assert.throws(() => decimal(bad));
  assert.equal(exact(decimal('1\u202f234,567890 ₽')), '1234.56789');
  assert.equal(exact(decimal(1e-6)), '0.000001');
  assert.throws(() => decimal(1e-7));
  for (const bad of ['100', '-1', '15.001', '', '99.999']) assert.throws(() => targetValue(bad));
  for (const values of [row('-1'), row('1', '-1'), row('1', '0', '0'), row('1', '0', '1000001')]) assert.throws(() => calculateRow(values, '15'));
});
test('property: exact no-increase, positive integer, feasibility, minimality and margin', () => {
  fc.assert(fc.property(fc.integer({ min: 1000000, max: 2000000000 }), fc.integer({ min: 0, max: 2000000000 }), fc.integer({ min: 0, max: 9999 }), (p, c, basis) => {
    const price = exact(BigInt(p)), cost = exact(BigInt(c));
    const result = calculateRow(row(price, cost), String(basis / 100));
    const denominator = 100000000n - BigInt(basis) * 10000n;
    assert.ok(Number.isSafeInteger(result.final) && result.final >= 1);
    assert.ok(BigInt(result.final) * 1000000n <= BigInt(p));
    const feasible = BigInt(Math.floor(p / 1000000)) * denominator >= BigInt(c) * 100n;
    assert.equal(result.belowTarget, !feasible);
    if (feasible) {
      assert.ok(BigInt(result.final) * denominator >= BigInt(c) * 100n);
      if (result.final > 1) assert.ok(BigInt(result.final - 1) * denominator < BigInt(c) * 100n);
    }
    assert.ok(Math.abs(result.finalMargin - (result.final - c / 1e6) / result.final * 100) < 1e-8);
  }), { numRuns: 10000, seed: 20261030 });
});
test('partial invalid results block exports; corrupted prices cannot escape', () => {
  const s = calculate([row(), row('0.99', '0')], '15');
  assert.equal(s.errors.length, 1); assert.throws(() => assertExport(s));
  for (const bad of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 651, 582]) {
    const state = calculate([row()], '15'); state.out[0].final = bad;
    assert.throws(() => assertExport(state));
  }
});
