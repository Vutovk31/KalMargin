import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const sandbox = { exports: {} };
vm.runInNewContext(readFileSync(new URL('../vendor/xlsx-0.18.5.min.js', import.meta.url), 'utf8'), sandbox);
export const XLSX = sandbox.exports;
