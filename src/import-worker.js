/* global importScripts */
importScripts('../vendor/xlsx-0.18.5.min.js');
self.onmessage = async ({ data }) => {
  try {
    const { readWorkbook } = await import('./import.js');
    self.postMessage({ result: readWorkbook(self.XLSX, data.buffer, data.sheet) });
  } catch (error) { self.postMessage({ error: { code: error.code || 'WORKBOOK', message: error.message || 'Не удалось прочитать файл' } }); }
};
