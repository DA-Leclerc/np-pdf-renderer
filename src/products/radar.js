// Radar product wrapper.
//
// Adapts Radar's runtime data (results from scoring.js, contextAnswers,
// answers, eligibility output) into the Handlebars template payload
// the radar/{en,fr}.hbs templates expect.

import { renderPdf } from '../renderer.js';

// CQ value-code → human-readable label maps.
// Kept in lockstep with radar-app/src/data/contextQuestions.js. If those
// change, this map must too.
const REGION_LABELS = {
  en: { a: 'Quebec HQ', b: 'Other Canadian HQ', c: 'HQ outside Canada' },
  fr: { a: 'Siège au Québec', b: 'Siège canadien (hors Québec)', c: 'Siège hors Canada' },
};
const SIZE_LABELS = {
  en: { a: '1–10 employees', b: '11–50 employees', c: '51–250 employees', d: '251–500 employees', e: '500+ employees' },
  fr: { a: '1 à 10 employés', b: '11 à 50 employés', c: '51 à 250 employés', d: '251 à 500 employés', e: '500+ employés' },
};
const SECTOR_LABELS = {
  en: { a: 'Manufacturing', b: 'Financial services', c: 'Healthcare', d: 'Professional services', e: 'Technology', f: 'Retail', g: 'Public sector', h: 'Education', i: 'Construction', j: 'Other' },
  fr: { a: 'Fabrication', b: 'Services financiers', c: 'Santé', d: 'Services professionnels', e: 'Technologie', f: 'Commerce de détail', g: 'Secteur public', h: 'Éducation', i: 'Construction', j: 'Autre' },
};
const AI_USE_LABELS = {
  en: { a: 'Exploring AI', b: 'Basic AI use', c: 'Actively implementing AI', d: 'AI core to operations' },
  fr: { a: 'IA en exploration', b: 'IA de base', c: 'IA en mise en œuvre active', d: "IA au cœur des opérations" },
};

const EDITION_LABELS = {
  en: { smb: 'SMB Edition', itLeaders: 'IT Leaders Edition', compliance: 'Compliance Edition' },
  fr: { smb: 'Édition PME', itLeaders: 'Édition Leaders TI', compliance: 'Édition Conformité' },
};

const MATURITY_LABELS = {
  en: { unaware: 'Unaware', exploring: 'Exploring', developing: 'Developing', implementing: 'Implementing', optimizing: 'Optimizing' },
  fr: { unaware: 'Non sensibilisé', exploring: 'Exploration', developing: 'En développement', implementing: 'En implémentation', optimizing: 'En optimisation' },
};

// Maturity-scale band metadata (Fix 5). The thresholds below match the
// scoring engine in radar-app/src/utils/scoring.js getMaturityLevel().
// Five bands, each shown on the page-1 maturity scale strip.
const MATURITY_BANDS = [
  { key: 'unaware',      range: '0–20%' },
  { key: 'exploring',    range: '21–40%' },
  { key: 'developing',   range: '41–60%' },
  { key: 'implementing', range: '61–80%' },
  { key: 'optimizing',   range: '81–100%' },
];

const LOI25_BAND_LABELS = {
  en: {
    significantExposure: 'Significant exposure',
    awareButUnprepared: 'Aware but unprepared',
    partiallyPrepared: 'Partially prepared',
    operationallyReady: 'Operationally ready',
    auditReady: 'Audit-ready',
  },
  fr: {
    significantExposure: 'Exposition significative',
    awareButUnprepared: 'Conscient mais non préparé',
    partiallyPrepared: 'Partiellement préparé',
    operationallyReady: 'Opérationnellement prêt',
    auditReady: 'Prêt pour audit',
  },
};

// Maturity band → semantic chip class used by the template
// (controls chip background color).
function bandToClass(label) {
  // The CSS chip classes: developing, advanced, foundation, aware
  // Map our 5-level Radar bands to the design's 4-band palette.
  if (label === 'unaware') return 'foundation';      // rust
  if (label === 'exploring') return 'aware';         // ochre
  if (label === 'developing') return 'developing';   // ochre
  if (label === 'implementing') return 'advanced';   // teal
  if (label === 'optimizing') return 'advanced';     // teal
  return 'developing';
}

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDate(date, lang) {
  const d = date instanceof Date ? date : new Date(date);
  if (lang === 'fr') {
    return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  return d.toLocaleDateString('en-CA', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Generate a deterministic-looking report number from org name + date.
// Format: RD-YYYY-MMDD (the date encodes the day of generation).
function reportNumber(date, prefix = 'RD') {
  const d = date instanceof Date ? date : new Date(date);
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${prefix}-${yyyy}-${mm}${dd}`;
}

/**
 * Build the template context from Radar's runtime payload.
 *
 * @param {object} payload
 * @param {string} payload.language       - 'en' | 'fr'
 * @param {string} payload.edition        - 'smb' | 'itLeaders' | 'compliance'
 * @param {string} [payload.orgName]
 * @param {object} payload.contextAnswers - CQ1..CQ6 single-letter codes
 * @param {object} payload.results        - calculateAllScores output
 * @param {object} payload.answers        - { questionId: value }
 * @param {Array<{domainId,domainName,score,maturityLabel,recommendation}>} payload.priorityActions
 * @param {Array<{id,name,score,maturityLabel,iso,actions:[{tier,title,body,quickWin,iso}]}>} payload.domains
 * @param {object} [payload.loi25]        - calculateLoi25Score output, only when CQ1=Quebec
 * @param {Array<{id,questionText,shortLabel,article,score,responseText,nextStep}>} [payload.loi25Questions]
 * @returns {object} Handlebars template context
 */
export function buildRadarContext(payload) {
  const lang = payload.language === 'fr' ? 'fr' : 'en';
  const ctx = payload.contextAnswers || {};
  const today = new Date();

  const sectorBits = [
    REGION_LABELS[lang][ctx.CQ1],
    SIZE_LABELS[lang][ctx.CQ2],
  ].filter(Boolean).join(' · ');
  const sectorBits2 = [
    SECTOR_LABELS[lang][ctx.CQ6],
    AI_USE_LABELS[lang][ctx.CQ5],
  ].filter(Boolean).join(' · ');

  const editionLabel = EDITION_LABELS[lang][payload.edition] || EDITION_LABELS[lang].smb;
  const overallLabelKey = payload.results?.overallLabel || 'developing';
  const overallScore = Math.round(payload.results?.overallScore || 0);

  const domains = (payload.domains || []).map(d => ({
    name: d.name,
    score: Math.round(d.score),
    bandClass: bandToClass(d.maturityLabel),
    bandLabel: MATURITY_LABELS[lang][d.maturityLabel] || d.maturityLabel,
    iso: d.iso,
    actions: (d.actions || []).map(a => ({
      tier: a.tier,                        // 'now' | 'quarter' | 'phase' (Fix 1)
      tierLabel: a.tierLabel || tierLabelFor(a.tier, lang),
      tierHorizon: a.tierHorizon || tierHorizonFor(a.tier, lang),
      title: a.title,
      body: a.body,
      quickWin: a.quickWin,
      iso: a.iso,
    })),
  }));

  // Maturity scale (Fix 5): pass through 5 bands with localized labels and the
  // current band marked as "here". Falls back to "exploring" if overall label
  // is missing — matches the scoring engine's lowest non-null band.
  const hereKey = overallLabelKey;
  const maturityScale = MATURITY_BANDS.map(b => ({
    key: b.key,
    label: MATURITY_LABELS[lang][b.key] || b.key,
    range: b.range,
    here: b.key === hereKey,
  }));

  const priorities = (payload.priorityActions || []).map((p, idx) => ({
    num: idx + 1,
    domainName: p.domainName,
    domainScore: Math.round(p.score),
    actionTitle: p.recommendation?.headline || p.action || '',
    quickWin: p.recommendation?.quickWin || p.quickWin || '',
  }));

  const showLoi25 = !!payload.loi25 && ctx.CQ1 === 'a';
  let loi25 = null;
  if (showLoi25) {
    const bandKey = payload.loi25.maturityLabel;
    loi25 = {
      score: payload.loi25.score,
      scoreInt: Math.round(payload.loi25.score * 10) / 10,
      bandLabel: LOI25_BAND_LABELS[lang][bandKey] || bandKey,
      verdictBody: payload.loi25.verdictBody || '',
      questions: (payload.loi25Questions || []).map((q, idx) => ({
        num: `Q${idx + 1}`,
        shortLabel: q.shortLabel,
        title: q.title || q.shortLabel,
        article: q.article,
        score: q.score,
        scoreOnPips: q.score,                // for {{#times scoreOnPips}}
        scoreOffPips: 4 - q.score,           // for {{#times scoreOffPips}}
        responseText: q.responseText,
        nextStep: q.nextStep,
      })),
    };
  }

  // Strings that vary by language (everything else is static in the template
  // since the EN and FR templates are separate files).
  return {
    language: lang,
    meta: {
      reportNo: reportNumber(today),
      reportDate: formatDate(today, lang),
      editionLabel,
      clientName: (payload.orgName || (lang === 'fr' ? 'Votre organisation' : 'Your organization')).trim(),
      clientSectorLine1: sectorBits,
      clientSectorLine2: sectorBits2,
    },
    executive: {
      overallScoreLabel: `${overallScore}%`,
      overallScore,
      overallLabel: MATURITY_LABELS[lang][overallLabelKey] || overallLabelKey,
      strengthHeadline: payload.executive?.strengthHeadline || '',
      strengthBody: payload.executive?.strengthBody || '',
      introBody: payload.executive?.introBody || '',
    },
    domains,
    domainPairs: pairDomains(domains),       // [[d0,d1],[d2,d3],[d4,d5]] for the 3-page split
    priorities,
    maturityScale,                           // Fix 5: 5-band scale with current band marked
    loi25Show: showLoi25,
    loi25,
    pagesTotal: showLoi25 ? 6 : 5,           // page-counter total (cover not counted)
  };
}

function tierLabelFor(tier, lang) {
  // Time-horizon tiers (Fix 1) — primary set used by the report today.
  if (lang === 'fr') {
    if (tier === 'now') return 'Maintenant';
    if (tier === 'quarter') return 'Ce trimestre';
    if (tier === 'phase') return 'Prochaine phase';
    // Legacy tiers — kept so older payloads still render until callers migrate.
    if (tier === 'priority') return 'Priorité actuelle';
    if (tier === 'next') return 'Étape suivante';
    if (tier === 'foundation') return 'Fondation';
    return tier;
  }
  if (tier === 'now') return 'Now';
  if (tier === 'quarter') return 'This Quarter';
  if (tier === 'phase') return 'Next Phase';
  if (tier === 'priority') return 'Current Priority';
  if (tier === 'next') return 'Next Step';
  if (tier === 'foundation') return 'Foundation';
  return tier;
}

// Human-readable time horizon shown under the tier label (Fix 1).
function tierHorizonFor(tier, lang) {
  if (lang === 'fr') {
    if (tier === 'now') return '0–30 jours';
    if (tier === 'quarter') return '1–3 mois';
    if (tier === 'phase') return '3–6 mois';
    return null;
  }
  if (tier === 'now') return '0–30 days';
  if (tier === 'quarter') return '1–3 months';
  if (tier === 'phase') return '3–6 months';
  return null;
}

function pairDomains(domains) {
  const out = [];
  for (let i = 0; i < domains.length; i += 2) {
    out.push([domains[i], domains[i + 1] || null]);
  }
  return out;
}

/**
 * Render a Radar PDF.
 *
 * @param {object} payload  - see buildRadarContext for shape
 * @param {object} [opts]   - { executablePath } for local Chromium override
 * @returns {Promise<Buffer>}
 */
export async function renderRadarPdf(payload, opts = {}) {
  const lang = payload.language === 'fr' ? 'fr' : 'en';
  const data = buildRadarContext(payload);
  return renderPdf({ product: 'radar', language: lang, data, opts });
}
