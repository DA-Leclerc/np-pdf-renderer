// Render a single PDF page at high resolution for visual inspection.
// Usage: node scripts/page-detail.mjs <pdf-path> <page-num> <out-png>
import puppeteer from 'puppeteer-core';
import { readFile, writeFile } from 'node:fs/promises';

const [pdfPath, pageNum = '1', outPath = 'out/page-detail.png'] = process.argv.slice(2);
const exec = process.env.PUPPETEER_EXECUTABLE_PATH;
const data = await readFile(pdfPath);
const b64 = data.toString('base64');

const browser = await puppeteer.launch({ executablePath: exec, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 2000, deviceScaleFactor: 1.5 });

const html = `<!DOCTYPE html><html><head><script type="module">
import * as pdfjs from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
const raw = atob('${b64}');
const arr = new Uint8Array(raw.length);
for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
const pdf = await pdfjs.getDocument({ data: arr }).promise;
const p = await pdf.getPage(${parseInt(pageNum, 10)});
const v = p.getViewport({ scale: 2.5 });
const cv = document.getElementById('c');
cv.width = v.width;
cv.height = v.height;
await p.render({ canvasContext: cv.getContext('2d'), viewport: v }).promise;
window.__ready = true;
</script></head><body style="margin:0;background:#888"><canvas id="c"></canvas></body></html>`;

await page.setContent(html, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, { timeout: 60000 });
const handle = await page.$('#c');
await handle.screenshot({ path: outPath });
await browser.close();
process.stderr.write(`wrote ${outPath}\n`);
