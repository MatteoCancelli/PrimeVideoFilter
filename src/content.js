// Marks cards with data-pvf="paid|included|unknown" and rows left with only
// paid cards with data-pvf-row="empty"; content.css hides them.
// Uses ANCHOR_SELECTOR, titleKey, findCard, classifyCard from classify.js.

// true = outline in red what would be hidden, instead of hiding it.
const DEBUG = false;

const ROW_HEADING = 'h2, h3, h4, [role="heading"]';
const ROW_STOP = 'html, body, main, [role="main"]';
const cardOf = new WeakMap(); // anchor -> card, so unchanged cards skip findCard

// The section around a card that has exactly one row heading (outside cards).
// null when the nearest section has several headings: hiding it could remove other rows.
function findRow(card, cache) {
  for (let el = card.parentElement; el && !el.matches(ROW_STOP); el = el.parentElement) {
    if (cache.has(el)) return cache.get(el);
    if (el.querySelector('h1')) return null;
    const headings = [...el.querySelectorAll(ROW_HEADING)].filter((h) => !h.closest('[data-pvf]'));
    if (headings.length) {
      const row = headings.length === 1 ? el : null;
      cache.set(el, row);
      return row;
    }
  }
  return null;
}

function scan() {
  // On amazon.* only the /gp/video/ pages are Prime Video (the SPA may navigate elsewhere).
  if (/(^|\.)amazon\./.test(location.hostname) && !location.pathname.includes('/gp/video/')) return;
  const pageKey = titleKey(location.pathname); // on a detail page, don't treat its own links as cards
  const cards = new Set();
  for (const a of document.querySelectorAll(ANCHOR_SELECTOR)) {
    const key = titleKey(a.getAttribute('href'));
    if (!key || key === pageKey) continue;
    let card = cardOf.get(a);
    if (!card || !card.contains(a) || card.dataset.pvfKey !== key) cardOf.set(a, (card = findCard(a)));
    if (!card || cards.has(card)) continue;
    cards.add(card);
    // Re-check "unknown" cards (labels may load later) and recycled nodes showing another title.
    if (card.dataset.pvfKey === key && card.dataset.pvf !== 'unknown') continue;
    card.dataset.pvf = classifyCard(card);
    card.dataset.pvfKey = key;
  }

  const rows = new Map(); // row -> every card in it is paid
  const cache = new Map();
  for (const card of cards) {
    const row = findRow(card, cache);
    if (row) rows.set(row, (rows.get(row) ?? true) && card.dataset.pvf === 'paid');
  }
  for (const [row, empty] of rows) {
    if (empty) row.dataset.pvfRow = 'empty';
    else delete row.dataset.pvfRow;
  }
}

if (DEBUG) document.documentElement.setAttribute('data-pvf-debug', '');

// SPA navigation and infinite scroll both show up as DOM insertions.
// Our own changes are attributes only, so they don't retrigger the observer.
let pending = 0;
new MutationObserver(() => {
  if (!pending) pending = setTimeout(() => { pending = 0; scan(); }, 150);
}).observe(document.documentElement, { childList: true, subtree: true });
scan();
