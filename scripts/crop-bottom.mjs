// Crop the bottom half of a PNG.
// Usage: node scripts/crop-bottom.mjs <in.png> <out.png>
import puppeteer from 'puppeteer-core';
import { readFile } from 'node:fs/promises';

const [inPath, outPath] = process.argv.slice(2);
const exec = process.env.PUPPETEER_EXECUTABLE_PATH;
const data = await readFile(inPath);
const b64 = data.toString('base64');
const browser = await puppeteer.launch({ executablePath: exec, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1800, height: 1400 });
await page.setContent(`<!DOCTYPE html><html><body style="margin:0">
<img id="img" src="data:image/png;base64,${b64}" onload="window.__r=true">
<script>
window.addEventListener('load', () => {
  const img = document.getElementById('img');
  const c = document.createElement('canvas');
  // Crop bottom half
  c.width = img.naturalWidth;
  c.height = Math.floor(img.naturalHeight / 2);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, -c.height);
  document.body.innerHTML = '';
  document.body.appendChild(c);
  c.id = 'out';
  window.__cropped = true;
});
</script>
</body></html>`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__cropped === true, { timeout: 30000 });
const handle = await page.$('#out');
await handle.screenshot({ path: outPath });
await browser.close();
process.stderr.write(`wrote ${outPath}\n`);
