// Card detection and classification. No side effects: loaded before content.js
// in the extension, and require()-able from Node tests.

// Label dictionaries (IT + EN). Matching is case-insensitive, on whole words,
// against each text node, aria-label, title and alt inside a card.
// To support a new label, add it (lowercase) to the right list.
const LABELS = {
  // Evidence the user can watch the title. Wins over any paid label.
  included: {
    // Matched anywhere inside a single label (and in the card's full text).
    phrases: [
      'incluso con prime', 'included with prime',
      "incluso nell'abbonamento prime", 'included in prime', 'included with your prime membership',
      'guarda con prime', 'watch with prime',
      'disponibile con prime', 'available with prime', 'gratis con prime', 'free with prime',
      // Already rented/bought by the user (e.g. "Continua a guardare"): keep visible.
      'noleggiato', 'acquistato', 'rented', 'purchased', 'owned', 'di tua proprietà',
      'il noleggio scade', 'rental expires',
    ],
    // Matched only when the whole label is exactly this (e.g. the "prime" badge).
    exact: ['prime', 'incluso', 'included'],
  },
  // Evidence the title costs extra: rent, buy, or a paid channel subscription.
  paid: {
    phrases: [
      'noleggia', 'noleggio', 'rent', 'rental',
      'acquista', 'acquisto', 'buy', 'purchase',
      'noleggia o acquista', 'rent or buy',
      'abbonati', 'abbonarti', 'iscriviti', 'subscribe',
      'prenotazione', 'preordina', 'pre-ordina', 'pre-order', 'preorder',
      'prova gratis', 'prova gratuita', 'periodo di prova', 'free trial', 'start your free trial',
      'canali prime video', 'canale prime video', 'prime video channels', 'prime video channel',
    ],
    // The store entitlement icon tends to carry just this word.
    exact: ['store', 'negozio'],
  },
};

// A price on a card ("4,99 €", "€3.99", "$5.99", "£2.49") is paid evidence.
const PRICE_RE = /[€$£]\s?\d|\d(?:[.,]\d{2})?\s?(?:€|eur\b)/i;

// Links that identify a title (or a channel offer) and therefore a card.
const ANCHOR_SELECTOR = 'a[href*="/detail/"], a[href*="/dp/"], a[href*="benefitId="]';
// Elements that look like a card boundary: stop climbing there.
const CARD_HINT = 'li, article, [role="listitem"], [data-testid*="card" i]';
// Never treat these (or anything above them) as a card.
const CARD_STOP = 'html, body, main, [role="main"], header, nav, footer, h1';
const MAX_CARD_DEPTH = 10;
const MAX_CARD_NODES = 600;
const MAX_PAID_LABEL = 80;

function titleKey(href) {
  const m = /\/(?:detail|dp)\/([^/?#&]+)/.exec(href || '') || /[?&]benefitId=([^&#]+)/.exec(href || '');
  return m ? m[1] : null;
}

const wordRe = (s) => new RegExp(`(?<![\\p{L}\\p{N}])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u');
const compile = ({ phrases, exact }) => ({ phrases: phrases.map(wordRe), exact: new Set(exact) });
const MATCHERS = { included: compile(LABELS.included), paid: compile(LABELS.paid) };

const normalize = (s) => (s || '').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
const matches = (m, label) => m.exact.has(label) || m.phrases.some((re) => re.test(label));

// Climbs from a title link to its card: the largest ancestor that still
// contains links to this one title only, stopping at the first card-like element.
// Anti-over-hiding: never crosses body/main/nav/h1, MAX_CARD_DEPTH levels or MAX_CARD_NODES nodes.
function findCard(anchor) {
  const key = titleKey(anchor.getAttribute('href'));
  if (!key || anchor.closest('header, nav')) return null; // site menu, not a card
  let card = anchor;
  for (let el = anchor.parentElement, depth = 0; el && depth < MAX_CARD_DEPTH; el = el.parentElement, depth++) {
    if (card.matches(CARD_HINT) || el.matches(CARD_STOP) || el.querySelector('h1')) break;
    if (el.getElementsByTagName('*').length > MAX_CARD_NODES) break;
    if ([...el.querySelectorAll(ANCHOR_SELECTOR)].some((a) => titleKey(a.getAttribute('href')) !== key)) break;
    card = el;
  }
  // Also take single-child wrappers (but not a list or section), so hiding leaves no empty slot.
  for (let p = card.parentElement; p && p.childElementCount === 1 && !p.matches(`${CARD_STOP}, ul, ol, [role="list"], section`); p = p.parentElement) {
    card = p;
  }
  return card;
}

// Every short piece of visible/accessible text on the card, normalized.
function cardLabels(card) {
  const labels = [];
  const walker = card.ownerDocument.createTreeWalker(card, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement && n.parentElement.closest('script, style')) continue;
    labels.push(normalize(n.nodeValue));
  }
  for (const el of [card, ...card.querySelectorAll('[aria-label], [title], img[alt]')]) {
    for (const attr of ['aria-label', 'title', 'alt']) labels.push(normalize(el.getAttribute(attr)));
  }
  return labels.filter(Boolean);
}

// Returns "paid" | "included" | "unknown". Only "paid" leads to hiding.
function classifyCard(card) {
  // Entitlement data attributes, if Amazon exposes them (e.g. data-card-entitlement="Unentitled").
  let paidAttr = false;
  for (const el of [card, ...card.querySelectorAll('*')]) {
    for (const { name, value } of el.attributes) {
      if (!name.startsWith('data-') || !name.includes('entitle')) continue;
      const v = normalize(value);
      if (v === 'entitled' || v === 'true') return 'included';
      if (v === 'unentitled' || v === 'notentitled' || v === 'not_entitled' || v === 'false') paidAttr = true;
    }
  }

  const labels = cardLabels(card);
  const fullText = normalize(card.textContent);
  if (labels.some((l) => matches(MATCHERS.included, l)) || MATCHERS.included.phrases.some((re) => re.test(fullText))) {
    return 'included';
  }
  if (paidAttr) return 'paid';

  // Titles (alt of images inside links = posters, headings) are skipped so a movie called "Rent" is not hidden.
  const titles = new Set([...card.querySelectorAll('a img[alt], h1, h2, h3, h4, h5, h6')]
    .map((el) => normalize(el.getAttribute('alt') || el.textContent)));
  // Long labels are synopses ("...can't pay the rent...") and are ignored.
  const short = labels.filter((l) => l.length <= MAX_PAID_LABEL && !titles.has(l));
  if (short.some((l) => matches(MATCHERS.paid, l) || PRICE_RE.test(l))) return 'paid';

  // Link to a channel offer page (benefitId=paramountplusit, ...), unless it is Prime itself.
  const hrefs = [card, ...card.querySelectorAll('a[href]')].map((el) => el.getAttribute('href') || '');
  if (hrefs.some((h) => /[?&]benefitId=(?!prime)/i.test(h))) return 'paid';
  return 'unknown';
}

if (typeof module === 'object' && module.exports) {
  module.exports = { LABELS, ANCHOR_SELECTOR, titleKey, findCard, classifyCard };
}
