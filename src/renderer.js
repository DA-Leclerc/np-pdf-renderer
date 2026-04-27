// Core PDF rendering pipeline. Generic over template + payload.
//
// Spins headless Chromium, sets the rendered HTML, waits for fonts +
// network idle, captures the PDF as a Buffer.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = resolve(__dirname, 'templates');

// Cache compiled templates and the Chromium browser instance across
// invocations within the same Node process. Saves ~3-5s per render
// on warm serverless instances.
const templateCache = new Map();
let browserPromise = null;

// ── Handlebars helpers ─────────────────────────────────────────────────
// Each helper is registered once on first use.
let helpersRegistered = false;
function registerHelpers() {
  if (helpersRegistered) return;
  // {{#times n}}…{{/times}} — render block n times. Used for Loi 25 score pips.
  Handlebars.registerHelper('times', function (n, opts) {
    let acc = '';
    for (let i = 0; i < n; i++) acc += opts.fn(i);
    return acc;
  });
  // {{#repeat n}} — alias kept for clarity in some templates.
  Handlebars.registerHelper('repeat', function (n, opts) {
    let acc = '';
    for (let i = 0; i < n; i++) acc += opts.fn(i);
    return acc;
  });
  // {{eq a b}} — strict equality predicate.
  Handlebars.registerHelper('eq', (a, b) => a === b);
  // {{gt a b}} — used to gate "investigate" / pip-on / etc.
  Handlebars.registerHelper('gt', (a, b) => a > b);
  // {{add a b}} — page-number arithmetic.
  Handlebars.registerHelper('add', (a, b) => Number(a) + Number(b));
  // {{pad2 n}} — zero-pad single-digit page numbers ("01 / 07").
  Handlebars.registerHelper('pad2', (n) => String(n).padStart(2, '0'));
  helpersRegistered = true;
}

async function loadTemplate(product, language) {
  const key = `${product}:${language}`;
  if (templateCache.has(key)) return templateCache.get(key);
  registerHelpers();
  const tplPath = resolve(TEMPLATES_ROOT, product, `${language}.hbs`);
  const cssPath = resolve(TEMPLATES_ROOT, product, 'style.css');
  const [tpl, css] = await Promise.all([
    readFile(tplPath, 'utf8'),
    readFile(cssPath, 'utf8'),
  ]);
  const compiled = Handlebars.compile(tpl, { noEscape: false });
  const wrapped = (data) => compiled({ ...data, __css: css });
  templateCache.set(key, wrapped);
  return wrapped;
}

// Read an asset (PNG/SVG/etc) and return a data URI that can be
// inlined directly into <img src="..."> or background-image: url(...).
async function assetDataUri(product, name) {
  const path = resolve(TEMPLATES_ROOT, product, 'assets', name);
  const buf = await readFile(path);
  // PNG content-type for the cases we currently use
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function getBrowser({ executablePath } = {}) {
  if (browserPromise) return browserPromise;
  // Lazy-load the heavy deps so a consumer that never renders pays nothing.
  const puppeteer = (await import('puppeteer-core')).default;
  let exec = executablePath;
  if (!exec) {
    // In serverless: download Chromium via @sparticuz/chromium-min.
    // In local dev: callers should set PUPPETEER_EXECUTABLE_PATH or pass
    // executablePath explicitly so we don't pay the cold-start download.
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      exec = process.env.PUPPETEER_EXECUTABLE_PATH;
    } else {
      const chromium = (await import('@sparticuz/chromium-min')).default;
      // The pinned tarball URL — keep this in sync with the @sparticuz
      // version pinned in package.json.
      const tarballUrl = process.env.NP_PDF_CHROMIUM_TARBALL
        ?? 'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar';
      exec = await chromium.executablePath(tarballUrl);
    }
  }
  browserPromise = puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--font-render-hinting=none',
      '--disable-gpu',
    ],
    executablePath: exec,
    headless: true,
  });
  return browserPromise;
}

/**
 * Render an arbitrary product template to a PDF Buffer.
 *
 * @param {object} args
 * @param {string} args.product   - "radar" | "breach" | future
 * @param {string} args.language  - "en" | "fr"
 * @param {object} args.data      - template payload (Handlebars context)
 * @param {object} [args.opts]
 * @param {string} [args.opts.executablePath] - override Chromium path (local dev)
 * @returns {Promise<Buffer>}
 */
export async function renderPdf({ product, language, data, opts = {} }) {
  if (!product) throw new Error('renderPdf: product required');
  if (!language) throw new Error('renderPdf: language required');
  if (!data) throw new Error('renderPdf: data required');

  const tpl = await loadTemplate(product, language);

  // Inline asset data URIs by passing them into the data context.
  // Templates reference these as {{assets.npLogo}} etc.
  const assets = {
    npLogo: await assetDataUri(product, language === 'fr' ? 'nord-paradigm-FR-horizontal.png' : 'nord-paradigm-EN-horizontal.png'),
    radarLogo: await assetDataUri(product, language === 'fr' ? 'radar-FR-horizontal.png' : 'radar-EN-horizontal.png'),
  };
  const html = tpl({ ...data, assets });

  const browser = await getBrowser(opts);
  const page = await browser.newPage();
  try {
    // Load the HTML and wait for fonts + network to settle so Sora /
    // DM Sans / Source Serif fully render before the PDF snapshot.
    await page.setContent(html, { waitUntil: ['load', 'networkidle0'], timeout: 60_000 });
    await page.evaluateHandle('document.fonts.ready');
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    return buffer;
  } finally {
    await page.close();
  }
}

/**
 * Close the cached browser. Callers running in long-lived processes
 * (CLI scripts, dev servers) should invoke this on shutdown.
 * Serverless instances can ignore — the runtime tears down the process.
 */
export async function closeBrowser() {
  if (!browserPromise) return;
  const b = await browserPromise;
  await b.close();
  browserPromise = null;
}
