// Records which details Chrome leaves open, the oracle test/details.test.jsx
// checks ren-html against: for each case (test/fixtures/details-view.jsx
// builds it: two or three open of one name, names that differ, no name, an
// empty name, a name given as a number, one opened, closed or renamed later,
// an open one coming in, in divs and nested, a tree of them coming in) the
// details ren-dom's view leaves open in Chrome after its steps, ren-html's
// markup for the case
// (test/fixtures/details-markup.jsx), and the details Chrome leaves open
// parsing that markup in the page. An open details of a name closes the
// others of that name in its tree; one coming in open closes itself when
// another of its name is open there (a details at a detached tree's root is
// in no group: Chrome's own rule).
// Each case's names end with its number, so no two cases share a group in
// the one page.
// Run it under the machine-wide Chrome lock and commit what it writes:
//   flock "$HOME/.cache/chrome-bench.lock" node --import ren-core/loader scripts/details-oracle.mjs test/fixtures/details.json
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import { markupOf } from '../test/fixtures/details-markup.jsx';
// ren-canv's recording Chrome, through ren-dom's link to it.
import { withChrome } from '../node_modules/ren-dom/node_modules/ren-canv/scripts/chrome.mjs';

/** A details `id` of group `name` (`o` open, `l` coming in later), holding `children`. @param {string} id @param {string | number | undefined} name @param {string} [flags] @param {any[]} [children] */
const d = (id, name, flags = '', children) => ({ id, details: true, ...(name === undefined ? {} : { name }), ...(flags.includes('o') ? { open: true } : {}), ...(flags.includes('l') ? { later: true } : {}), ...(children === undefined ? {} : { children }) });
/** A div (coming in later when `later`). @param {string} id @param {any[]} children @param {boolean} [later] */
const div = (id, children, later = false) => ({ id, div: true, children, ...(later ? { later: true } : {}) });

const cases = [
  { name: 'two open of one name', tree: [d('a', 'x', 'o'), d('b', 'x', 'o')] },
  { name: 'three open of one name', tree: [d('a', 'x', 'o'), d('b', 'x', 'o'), d('c', 'x', 'o')] },
  { name: 'two open of one name in divs', tree: [div('p', [d('a', 'x', 'o')]), div('q', [d('b', 'x', 'o')])] },
  { name: 'two open, names that differ', tree: [d('a', 'x', 'o'), d('b', 'y', 'o')] },
  { name: 'two open, names that differ in case', tree: [d('a', 'x', 'o'), d('b', 'X', 'o')] },
  { name: 'two open without a name', tree: [d('a', undefined, 'o'), d('b', undefined, 'o')] },
  { name: 'two open with an empty name', tree: [d('a', '', 'o'), d('b', '', 'o')] },
  { name: 'two open of one name, one in the other', tree: [d('a', 'x', 'o', [d('b', 'x', 'o')])] },
  { name: 'the second opened later', tree: [d('a', 'x', 'o'), d('b', 'x')], steps: [{ open: 'b' }] },
  { name: 'the first opened later', tree: [d('a', 'x'), d('b', 'x', 'o')], steps: [{ open: 'a' }] },
  { name: 'the open one closed, then the other opened', tree: [d('a', 'x', 'o'), d('b', 'x')], steps: [{ close: 'a' }, { open: 'b' }] },
  { name: 'an open one comes in later', tree: [d('a', 'x', 'o'), d('b', 'x', 'ol')], steps: [{ show: true }] },
  { name: 'an open one comes in before the open one', tree: [d('a', 'x', 'ol'), d('b', 'x', 'o')], steps: [{ show: true }] },
  { name: 'a div with an open one comes in later', tree: [d('a', 'x', 'o'), div('p', [d('b', 'x', 'o')], true)], steps: [{ show: true }] },
  { name: 'an open one renamed into the group', tree: [d('a', 'x', 'o'), d('b', 'y', 'o')], steps: [{ rename: 'b', to: 'x' }] },
  { name: 'a div with two open of one name comes in later', tree: [div('p', [d('a', 'x', 'o'), d('b', 'x', 'o')], true)], steps: [{ show: true }] },
  { name: 'one open in another of its name comes in later', tree: [d('a', 'x', 'ol', [d('b', 'x', 'o')])], steps: [{ show: true }] },
  { name: 'one opened later in an open one of its name', tree: [d('a', 'x', 'o', [d('b', 'x')])], steps: [{ open: 'b' }] },
  { name: 'a name given as a number', tree: [d('a', 7, 'o'), d('b', 7, 'o')] },
];

/** The case with its names ending with its number `k` (an empty one stays empty, a number a number). @param {any} c @param {number} k */
function numbered(c, k) {
  /** @param {string | number} s */
  const end = s => (s === '' ? '' : typeof s === 'number' ? Number(`${s}${k}`) : `${s}${k}`);
  /** @param {any} n @returns {any} */
  const node = n => ({ ...n, ...(n.name === undefined ? {} : { name: end(n.name) }), ...(n.children === undefined ? {} : { children: n.children.map(node) }) });
  return { ...c, tree: c.tree.map(node), ...(c.steps === undefined ? {} : { steps: c.steps.map((/** @type {any} */ s) => (s.to === undefined ? s : { ...s, to: `${s.to}${k}` })) }) };
}

const numberedCases = cases.map(numbered);
const markups = numberedCases.map(markupOf);

const root = fileURLToPath(new URL('..', import.meta.url));
const page = `
import { Root } from 'ren-core';
import { $flush } from 'rrx-core';
import { $dom } from 'ren-dom';
import { detailsCase } from './test/fixtures/details-view.jsx';
const cases = ${JSON.stringify(numberedCases)};
const markups = ${JSON.stringify(markups)};
const state = el => [...el.querySelectorAll('details')].map(d => d.open);
window.results = cases.map((c, i) => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const { View, apply } = detailsCase(c);
  const root = Root({ id: 'c' + i, target, renderer: $dom(document), children: View });
  for (const step of c.steps ?? []) {
    apply(step);
    $flush(root);
  }
  const live = state(target);
  target.remove();
  // Parsed in the page, as a page's markup is.
  const parsed = document.createElement('div');
  document.body.appendChild(parsed);
  parsed.innerHTML = markups[i];
  const parse = state(parsed);
  parsed.remove();
  return { live, parse };
});
`;
const bundle = await build({ stdin: { contents: page, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, format: 'iife', jsx: 'automatic', jsxImportSource: 'ren-core', logLevel: 'error' });
const js = bundle.outputFiles[0].text;

await withChrome(async ({ send, evaluate, profile }) => {
  const file = join(profile, 'details.html');
  writeFileSync(file, `<!doctype html><html><body><script>${js.replace(/<\/script/g, '<\\/script')}</script></body></html>`);
  await send('Page.navigate', { url: `file://${file}` });
  // The page is loaded once its script has run (withChrome's deadline ends a page that never does).
  while ((await evaluate('Array.isArray(window.results)')) !== true);
  const results = await evaluate('results');
  const recorded = await evaluate('navigator.userAgent.match(/Chrome\\/[\\d.]+/)[0]');
  // A case a line.
  const rows = numberedCases.map((c, i) => JSON.stringify({ ...c, chrome: results[i].live, html: markups[i], parse: results[i].parse }));
  const text = `{"recorded":${JSON.stringify(recorded)},"cases":[\n${rows.join(',\n')}\n]}\n`;
  for (const out of process.argv.slice(2)) writeFileSync(out, text);
});
