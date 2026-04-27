#!/usr/bin/env node
// Convert a PDF to per-page PNGs using Puppeteer + Chrome's built-in PDF viewer.
// Usage: PUPPETEER_EXECUTABLE_PATH=... node scripts/pdf-to-png.js <input.pdf> <out-dir>

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = dirname(fileURLToPath(import.meta.url));

const inputPdf = process.argv[2];
const outDir = process.argv[3] || resolve(__dirname, '..', 'out', 'inspect');
const exec = process.env.PUPPETEER_EXECUTABLE_PATH;

if (!inputPdf) { console.error('Usage: node scripts/pdf-to-png.js <input.pdf> [out-dir]'); process.exit(1); }
if (!exec) { console.error('Set PUPPETEER_EXECUTABLE_PATH'); process.exit(1); }

await mkdir(outDir, { recursive: true });

// Read PDF as base64 → use PDF.js via a tiny HTML page that renders each page to a canvas.
const pdfBytes = await readFile(inputPdf);
const pdfBase64 = pdfBytes.toString('base64');

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<script type="module">
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
const pdfData = atob('${pdfBase64}');
const arr = new Uint8Array(pdfData.length);
for (let i = 0; i < pdfData.length; i++) arr[i] = pdfData.charCodeAt(i);
const pdf = await pdfjsLib.getDocument({ data: arr }).promise;
window.__pageCount = pdf.numPages;
window.__pages = [];
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  document.body.appendChild(canvas);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  window.__pages.push(canvas.toDataURL('image/png'));
}
window.__ready = true;
</script>
<style>body{margin:0;padding:0;background:#888} canvas{display:block;margin:8px auto;box-shadow:0 0 8px #000}</style>
</head><body></body></html>`;

const browser = await puppeteer.launch({ executablePath: exec, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 2000 });
await page.setContent(html, { waitUntil: 'load' });

// Wait for PDF.js to render all pages
await page.waitForFunction(() => window.__ready === true, { timeout: 60_000 });
const pageCount = await page.evaluate(() => window.__pageCount);
process.stderr.write(`PDF has ${pageCount} pages\n`);

const dataUrls = await page.evaluate(() => window.__pages);
const baseName = basename(inputPdf, '.pdf');
for (let i = 0; i < dataUrls.length; i++) {
  const b64 = dataUrls[i].replace(/^data:image\/png;base64,/, '');
  const dst = resolve(outDir, `${baseName}-page-${String(i + 1).padStart(2, '0')}.png`);
  await writeFile(dst, Buffer.from(b64, 'base64'));
  process.stderr.write(`wrote ${dst}\n`);
}

await browser.close();
