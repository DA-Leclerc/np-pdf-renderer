#!/usr/bin/env node
// Render the EN sample as page-by-page PNG screenshots for visual verification.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import Handlebars from 'handlebars';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const lang = process.argv[2] || 'en';
const exec = process.env.PUPPETEER_EXECUTABLE_PATH;
if (!exec) { console.error('Set PUPPETEER_EXECUTABLE_PATH'); process.exit(1); }

const sample = JSON.parse(await readFile(resolve(ROOT, `samples/radar.${lang}.json`), 'utf8'));
const tplSrc = await readFile(resolve(ROOT, `src/templates/radar/${lang}.hbs`), 'utf8');
const css = await readFile(resolve(ROOT, 'src/templates/radar/style.css'), 'utf8');

Handlebars.registerHelper('times', function(n, opts){ let s=''; for(let i=0;i<n;i++) s+=opts.fn(i); return s; });
Handlebars.registerHelper('repeat', function(n, opts){ let s=''; for(let i=0;i<n;i++) s+=opts.fn(i); return s; });
Handlebars.registerHelper('eq', (a,b)=>a===b);
Handlebars.registerHelper('gt', (a,b)=>a>b);
Handlebars.registerHelper('add', (a,b)=>Number(a)+Number(b));
Handlebars.registerHelper('pad2', n=>String(n).padStart(2,'0'));

const tpl = Handlebars.compile(tplSrc);

const npLogo = `data:image/png;base64,${(await readFile(resolve(ROOT, `src/templates/radar/assets/nord-paradigm-${lang.toUpperCase()}-horizontal.png`))).toString('base64')}`;
const radarLogo = `data:image/png;base64,${(await readFile(resolve(ROOT, `src/templates/radar/assets/radar-${lang.toUpperCase()}-horizontal.png`))).toString('base64')}`;

// Build context same as renderer does (mini-import would be cleaner, but copy the call)
const { buildRadarContext } = await import('../src/products/radar.js');
const ctx = buildRadarContext(sample);
const html = tpl({ ...ctx, assets: { npLogo, radarLogo }, __css: css });

const outDir = resolve(ROOT, 'out');
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({ executablePath: exec, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 }); // A4 @ 96dpi
await page.setContent(html, { waitUntil: ['load','networkidle0'] });
await page.evaluateHandle('document.fonts.ready');

// Screenshot each .page element
const pageCount = await page.evaluate(() => document.querySelectorAll('.page').length);
process.stderr.write(`found ${pageCount} pages\n`);
for (let i = 0; i < pageCount; i++) {
  const el = (await page.$$('.page'))[i];
  const png = await el.screenshot({ type: 'png' });
  await writeFile(resolve(outDir, `radar-${lang}-page-${String(i+1).padStart(2,'0')}.png`), png);
  process.stderr.write(`wrote page ${i+1}\n`);
}
await browser.close();
