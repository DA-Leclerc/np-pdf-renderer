# @nordparadigm/pdf-renderer

Shared PDF rendering pipeline for Nord Paradigm's product suite (Radar, Brèche, future).

Pure HTML → PDF via headless Chromium. Real web fonts, vector text, gradient fidelity, A4 print-ready output. Same architecture pattern as Brèche; first product wired in is Radar.

## Pipeline

```
caller
  ↓ renderRadarPdf({ ...payload })
templates/radar/{en|fr}.hbs   ←  Handlebars compile + render
  ↓
puppeteer-core + @sparticuz/chromium-min   ←  spin Chromium, await fonts
  ↓
page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
  ↓
Buffer (caller streams to client / writes to disk)
```

## Quick start

```js
import { renderRadarPdf } from '@nordparadigm/pdf-renderer';

const pdfBuffer = await renderRadarPdf({
  language: 'en',
  meta: { /* ... */ },
  executive: { /* ... */ },
  domains: [ /* 6 entries */ ],
  priorities: [ /* 3 entries */ ],
  funding: { eligible: [...], investigate: [...] },
  loi25: { show: true, /* ... */ }
});
```

## Templates

- `templates/radar/en.hbs` + `templates/radar/fr.hbs`
- `templates/radar/style.css` (inlined into the rendered HTML at build time)
- `templates/radar/assets/` — logos as base64-encoded PNGs

Add new product templates under `templates/<product>/{en,fr}.hbs`.

## Local rendering test

```
npm install
node scripts/render-sample.js radar en > out/radar-en.pdf
node scripts/render-sample.js radar fr > out/radar-fr.pdf
```

## Vercel / serverless deployment

Caller's serverless function should declare:

```js
// /api/pdf.js
export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};
```

`@sparticuz/chromium-min` downloads Chromium from a CDN at cold start (~13 MB). Bundle stays under Vercel's 50 MB function size limit.

## Privacy posture

The renderer is stateless. The caller's serverless function receives a payload, renders, returns a Buffer, exits. **No persistence, no logs of payload data.** The payload only travels:

1. Client → caller's `/api/pdf` (over TLS)
2. Caller → in-memory Chromium → PDF Buffer
3. Buffer → client (over TLS)

Callers are responsible for any privacy-banner copy adjustment to acknowledge that user input is sent server-side at PDF generation time.
