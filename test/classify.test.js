const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { classifyCard, findCard, titleKey } = require('../src/classify.js');

const dom = (html) => new JSDOM(`<body><main>${html}</main></body>`).window.document;
// Builds one card inside a row and returns it.
const card = (inner, href = '/detail/0ABC/ref=atv') => {
  const doc = dom(`<ul class="_x1"><li class="_q9z"><a href="${href}"><img alt="Some Title"></a>${inner}</li></ul>`);
  return doc.querySelector('li');
};

test('titleKey extracts the title id', () => {
  assert.equal(titleKey('/detail/0ABC123/ref=xyz'), '0ABC123');
  assert.equal(titleKey('https://www.amazon.it/gp/video/detail/B0XYZ?x=1'), 'B0XYZ');
  assert.equal(titleKey('/dp/B0XYZ'), 'B0XYZ');
  assert.equal(titleKey('/storefront/?benefitId=paramountplusit'), 'paramountplusit');
  assert.equal(titleKey('/settings'), null);
});

for (const [label, html] of [
  ['IT rent/buy', '<span>Noleggia o acquista</span>'],
  ['EN rent', '<div><span>Rent</span></div>'],
  ['EN buy price', '<span>Buy HD €9.99</span>'],
  ['IT price', '<span>Da 3,99 €</span>'],
  ['IT channel', '<p>Abbonati a Paramount+</p>'],
  ['EN channel', '<p aria-label="Subscribe to Apple TV+"></p>'],
  ['IT iscriviti', '<span>Iscriviti</span>'],
  ['IT pre-order', '<span>Disponibile per la prenotazione</span>'],
  ['IT trial', '<span>Prova gratis per 7 giorni</span>'],
  ['EN trial', '<span>Start your free trial</span>'],
  ['IT channels label', '<span title="Canali Prime Video"></span>'],
  ['EN channels label', '<img alt="Prime Video Channels" src="x.png">'],
  ['store icon', '<svg><title>Store</title></svg>'],
  ['unentitled attribute', '<div data-card-entitlement="Unentitled"></div>'],
  ['curly apostrophe/case', '<b>NOLEGGIA</b>'],
]) {
  test(`paid: ${label}`, () => assert.equal(classifyCard(card(html)), 'paid'));
}

test('paid: channel offer link', () => {
  assert.equal(classifyCard(card('', '/storefront/?benefitId=appletvplusit')), 'paid');
});

for (const [label, html] of [
  ['prime badge text', '<span>prime</span>'],
  ['prime badge alt', '<img alt="Prime" src="p.png">'],
  ['IT included', '<span>Incluso con Prime</span>'],
  ['EN included svg title', '<svg><title>Included with Prime</title></svg>'],
  ['split text', '<span>Incluso con <b>Prime</b></span>'],
  ['curly apostrophe', '<span>Incluso nell’abbonamento Prime</span>'],
  ['entitled attribute', '<div data-card-entitlement="Entitled"><span>Rent</span></div>'],
  ['prime wins over rent', '<span>Prime</span><span>Rent or buy</span>'],
  ['rented in continue watching', '<span>Il noleggio scade tra 2 giorni</span>'],
  ['purchased', '<span>Purchased</span>'],
]) {
  test(`included: ${label}`, () => assert.equal(classifyCard(card(html)), 'included'));
}

for (const [label, html] of [
  ['no badge', '<span>Drama · 2021</span>'],
  ['title called Rent', '<h3>Rent</h3>'],
  ['word inside other words', '<span>Current parent torrent buyer</span>'],
  ['synopsis mentioning rent', `<p>${'A struggling musician cannot pay the rent and has to move back home with his family. '.repeat(2)}</p>`],
  ['free with ads (Freevee)', '<span>Gratis con pubblicità</span>'],
]) {
  test(`unknown: ${label}`, () => assert.equal(classifyCard(card(html)), 'unknown'));
}

test('unknown: Prime benefit link is not a channel', () => {
  assert.equal(classifyCard(card('', '/storefront/?benefitId=primeit')), 'unknown');
});

test('unknown: poster alt equal to a paid word is a title', () => {
  const doc = dom('<ul><li><a href="/detail/1"><img alt="Buy"></a></li></ul>');
  assert.equal(classifyCard(doc.querySelector('li')), 'unknown');
});

test('findCard stops at the list item', () => {
  const doc = dom('<ul><li id="c"><div><a href="/detail/1">x</a></div><a href="/detail/1?autoplay=1">t</a></li><li><a href="/detail/2">y</a></li></ul>');
  assert.equal(findCard(doc.querySelector('a')).id, 'c');
});

test('findCard climbs divs but never into a container with other titles', () => {
  const doc = dom('<div id="row"><div id="c"><div><a href="/detail/1">x</a></div></div><div><a href="/detail/2">y</a></div></div>');
  assert.equal(findCard(doc.querySelector('a')).id, 'c');
});

test('findCard never returns main/body even for a lone link', () => {
  const doc = dom('<div id="wrap"><a href="/detail/1">x</a></div>');
  assert.equal(findCard(doc.querySelector('a')).id, 'wrap');
});

test('findCard does not climb into a block with an h1 (detail hero)', () => {
  const doc = dom('<section id="hero"><h1>Movie</h1><div id="c"><a href="/detail/1">x</a></div></section>');
  assert.equal(findCard(doc.querySelector('a')).id, 'c');
});

test('findCard ignores links without a title id', () => {
  const doc = dom('<a href="/settings">x</a>');
  assert.equal(findCard(doc.querySelector('a')), null);
});

test('findCard ignores site navigation links', () => {
  const doc = dom('<nav><a href="/storefront/?benefitId=channels">Canali</a></nav>');
  assert.equal(findCard(doc.querySelector('a')), null);
});

test('findCard takes single-child wrappers so no empty slot is left', () => {
  const doc = dom('<ul><li id="slot"><div><article data-testid="card"><a href="/detail/1">x</a></article></div></li><li><a href="/detail/2">y</a></li></ul>');
  assert.equal(findCard(doc.querySelector('a')).id, 'slot');
});

test('findCard does not take the list when it has a single card', () => {
  const doc = dom('<section><h2>R</h2><ul id="list"><li id="c"><a href="/detail/1">x</a></li></ul></section>');
  assert.equal(findCard(doc.querySelector('a')).id, 'c');
});

// Trimmed copy of a real card (primevideo.com, 20/10/2026), before any hover.
const realCard = (entitlement, title) => `<div class="_row"><div class="_slot"><article class="ulDoOY I3vXhO ae7h_p" data-card-title="${title}" data-card-entity-type="TV Show" data-card-entitlement="${entitlement}" data-card-position="1" data-card-can-hover="true" data-testid="card"><section class="qFCD8F Hbj8Gx" data-testid="card-section"><div class="BVySw9 jaSqrZ" data-testid="packshot"><button class="n17vJx" aria-label="${title}" aria-expanded="false"></button><a href="/detail/0SPIF${title.length}?jic=8&amp;ref_=atv_hm_hom_c_cjm7wb_2_2" class="zyfcZQ" tabindex="-1">${title}</a><div class="lz5SHd ITi_XJ"><picture><img alt="" data-testid="base-image" src="x.jpg"></picture></div></div><span data-testid="metadata-badge" aria-label="DI TENDENZA" role="img">DI TENDENZA</span><div class="MaQfAR OhaBAC" data-testid="card-overlay"><div class="U6kOYF"><svg role="img" aria-hidden="true"><title>Store Filled</title></svg></div></div></section></article></div><div class="_slot"><article data-testid="card"><a href="/detail/OTHER">Other</a></article></div></div>`;

test('real card: Unentitled is paid, and the whole slot is the card', () => {
  const doc = dom(realCard('Unentitled', 'Tenken - Reincarnato in una spada'));
  const c = findCard(doc.querySelector('a'));
  assert.equal(c.className, '_slot');
  assert.equal(classifyCard(c), 'paid');
});

test('real card: Entitled is included', () => {
  const doc = dom(realCard('Entitled', 'Arma letale 4').replace('<title>Store Filled</title>', ''));
  assert.equal(classifyCard(findCard(doc.querySelector('a'))), 'included');
});
