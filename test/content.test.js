const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const SCRIPTS = [src('classify.js'), src('content.js')];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Loads the page and runs the content scripts as the extension would (same global scope).
function load(body, url = 'https://www.primevideo.com/storefront/home') {
  const { window } = new JSDOM(`<!doctype html><body>${body}</body>`, { url, runScripts: 'dangerously', pretendToBeVisual: true });
  for (const code of SCRIPTS) {
    const s = window.document.createElement('script');
    s.textContent = code;
    window.document.head.appendChild(s);
  }
  return window;
}
const tile = (id, label) => `<li class="_k3j"><a href="/detail/${id}/ref=x"><img alt="T${id}"></a><span class="_9f">${label}</span></li>`;
const row = (id, title, tiles) => `<section id="${id}" class="_r"><div><h2><span>${title}</span></h2></div><ul>${tiles.join('')}</ul></section>`;
const state = (w, sel) => w.document.querySelector(sel).getAttribute('data-pvf');

test('marks paid, included and unknown cards', () => {
  const w = load(row('r1', 'Popolari', [tile(1, 'prime'), tile(2, 'Noleggia'), tile(3, '')]));
  assert.equal(state(w, 'a[href^="/detail/1"]'), null); // the anchor is not the card
  assert.equal(w.document.querySelectorAll('li')[0].dataset.pvf, 'included');
  assert.equal(w.document.querySelectorAll('li')[1].dataset.pvf, 'paid');
  assert.equal(w.document.querySelectorAll('li')[2].dataset.pvf, 'unknown');
  assert.equal(w.document.getElementById('r1').dataset.pvfRow, undefined);
});

test('hides a row (with its heading) when all its cards are paid', () => {
  const w = load(row('r1', 'Store', [tile(1, 'Rent'), tile(2, 'Buy')]) + row('r2', 'Prime', [tile(3, 'prime')]));
  assert.equal(w.document.getElementById('r1').dataset.pvfRow, 'empty');
  assert.equal(w.document.getElementById('r2').dataset.pvfRow, undefined);
});

test('the hiding CSS applies to paid cards and empty rows', () => {
  const w = load(row('r1', 'Store', [tile(1, 'Rent')]) + row('r2', 'Mix', [tile(2, 'Rent'), tile(3, '')]));
  const style = w.document.createElement('style');
  style.textContent = src('content.css');
  w.document.head.appendChild(style);
  assert.equal(w.getComputedStyle(w.document.getElementById('r1')).display, 'none');
  assert.equal(w.getComputedStyle(w.document.querySelectorAll('#r2 li')[0]).display, 'none');
  assert.equal(w.getComputedStyle(w.document.querySelectorAll('#r2 li')[1]).display, 'list-item');
});

test('does not hide a section that holds several rows', () => {
  const w = load(`<div id="page">${row('r1', 'A', [tile(1, 'Rent')])}<h2>B</h2><ul>${tile(2, 'Buy')}</ul></div>`);
  assert.equal(w.document.getElementById('r1').dataset.pvfRow, 'empty');
  assert.equal(w.document.getElementById('page').dataset.pvfRow, undefined);
});

test('handles cards added later (infinite scroll / SPA)', async () => {
  const w = load(row('r1', 'Mix', [tile(1, 'prime')]));
  const ul = w.document.querySelector('#r1 ul');
  ul.insertAdjacentHTML('beforeend', tile(2, 'Acquista'));
  w.document.body.insertAdjacentHTML('beforeend', row('r2', 'Canali', [tile(3, 'Abbonati a Paramount+'), tile(4, 'Free trial')]));
  await wait(400);
  assert.equal(ul.children[1].dataset.pvf, 'paid');
  assert.equal(w.document.getElementById('r2').dataset.pvfRow, 'empty');
  assert.equal(w.document.getElementById('r1').dataset.pvfRow, undefined);
});

test('un-hides a row when a visible card arrives later', async () => {
  const w = load(row('r1', 'Store', [tile(1, 'Rent')]));
  assert.equal(w.document.getElementById('r1').dataset.pvfRow, 'empty');
  w.document.querySelector('#r1 ul').insertAdjacentHTML('beforeend', tile(2, 'Incluso con Prime'));
  await wait(400);
  assert.equal(w.document.getElementById('r1').dataset.pvfRow, undefined);
});

test('re-checks unknown cards whose labels load later', async () => {
  const w = load(row('r1', 'Mix', [tile(1, ''), tile(2, 'prime')]));
  const li = w.document.querySelector('li');
  assert.equal(li.dataset.pvf, 'unknown');
  li.insertAdjacentHTML('beforeend', '<span>Rent or buy</span>');
  await wait(400);
  assert.equal(li.dataset.pvf, 'paid');
});

test('reclassifies a recycled card that now shows another title', async () => {
  const w = load(row('r1', 'Mix', [tile(1, 'Rent'), tile(2, 'prime')]));
  const li = w.document.querySelector('li');
  assert.equal(li.dataset.pvf, 'paid');
  li.innerHTML = '<a href="/detail/9"><img alt="T9"></a><span>prime</span>';
  await wait(400);
  assert.equal(li.dataset.pvf, 'included');
});

test('re-checks an included card when hover adds a teaser label', async () => {
  const w = load(row('r1', 'Mix', [tile(1, 'prime'), tile(2, '')]));
  const li = w.document.querySelector('li');
  assert.equal(li.dataset.pvf, 'included');
  li.insertAdjacentHTML('beforeend', '<div><span>Primo episodio gratuito</span></div>');
  await wait(400);
  assert.equal(li.dataset.pvf, 'paid');
});

test('the CSS hides Unentitled cards before the script marks them', () => {
  const { window: w } = new JSDOM(`<style>${src('content.css')}</style><div id="slot"><article data-testid="card" data-card-entitlement="Unentitled"><a href="/detail/1">x</a></article></div>`);
  assert.equal(w.getComputedStyle(w.document.querySelector('article')).display, 'none');
});

test('on a detail page, the page title itself is never hidden', () => {
  const w = load(`<main><section><h1>Film</h1><div id="hero"><a href="/detail/1">Play</a><button>Rent HD €3.99</button></div></section>${row('r1', 'Simili', [tile(2, 'prime')])}</main>`,
    'https://www.primevideo.com/detail/1/ref=x');
  assert.equal(w.document.getElementById('hero').dataset.pvf, undefined);
});

test('does nothing on non-video amazon pages', () => {
  const w = load(row('r1', 'X', [tile(1, 'Buy')]), 'https://www.amazon.it/dp/B000');
  assert.equal(w.document.querySelector('li').dataset.pvf, undefined);
});

test('works on amazon.it/gp/video', () => {
  const w = load(row('r1', 'X', [tile(1, 'Buy'), tile(2, '')]), 'https://www.amazon.it/gp/video/storefront');
  assert.equal(w.document.querySelector('li').dataset.pvf, 'paid');
});

test('the mock page ends with only included/unknown cards visible', async () => {
  const file = path.join(__dirname, '..', 'mock', 'index.html');
  const html = fs.readFileSync(file, 'utf8').replace(/<script src="[^"]*"><\/script>/g, '');
  const { window: w } = new JSDOM(html, { url: 'file:///' + file.replace(/\\/g, '/'), runScripts: 'dangerously', pretendToBeVisual: true });
  for (const code of SCRIPTS) {
    const s = w.document.createElement('script');
    s.textContent = code;
    w.document.head.appendChild(s);
  }
  await wait(Number(w.document.body.dataset.settleMs) + 500);
  const expected = [...w.document.querySelectorAll('[data-expect]')];
  assert.ok(expected.length >= 20, 'mock has enough cases');
  for (const el of expected) {
    const isHidden = !!el.closest('[data-pvf="paid"], [data-pvf-row="empty"]');
    assert.equal(isHidden, el.dataset.expect === 'hide', `${el.dataset.expect}: ${el.textContent.trim().slice(0, 60)}`);
  }
  w.close();
});
