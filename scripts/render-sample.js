#!/usr/bin/env node
// Local rendering harness. Usage:
//   node scripts/render-sample.js radar en > out/radar-en.pdf
//   node scripts/render-sample.js radar fr > out/radar-fr.pdf
//
// Reads sample payload from samples/radar.<lang>.json, renders, writes PDF.
// Requires Chrome/Chromium installed locally; set PUPPETEER_EXECUTABLE_PATH
// or it will download the @sparticuz tarball (~80 MB).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderRadarPdf, closeBrowser } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const product = process.argv[2] || 'radar';
const language = process.argv[3] || 'en';
const outName = process.argv[4] || `${product}-${language}.pdf`;

const samplePath = resolve(ROOT, 'samples', `${product}.${language}.json`);
const outDir = resolve(ROOT, 'out');
const outPath = resolve(outDir, outName);

(async () => {
  await mkdir(outDir, { recursive: true });
  const sample = JSON.parse(await readFile(samplePath, 'utf8'));
  process.stderr.write(`rendering ${product}/${language}…\n`);
  const t0 = Date.now();
  let buf;
  try {
    buf = await renderRadarPdf(sample);
  } finally {
    await closeBrowser();
  }
  await writeFile(outPath, buf);
  const ms = Date.now() - t0;
  process.stderr.write(`wrote ${outPath} (${buf.length} bytes, ${ms} ms)\n`);
})().catch(err => {
  process.stderr.write(`ERROR: ${err.stack || err}\n`);
  process.exit(1);
});

// Renamed from src/index.js — re-export here so a direct import works
export { renderRadarPdf, closeBrowser };
