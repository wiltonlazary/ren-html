// Records which radios Chrome checks, the oracle test/radio.test.jsx (and
// ren-json's, from the same file) checks ren-html and ren-json against: for
// each radio case (test/fixtures/radio-view.jsx builds it: two checked in a
// group, in a form or none, names that differ, no name, two forms, a form
// attribute, a radio checked, unchecked or renamed later, a checked one
// coming in, an empty form attribute, a form attribute naming a form after
// it, one coming in later, a name or form attribute given as a number,
// nested forms, a radio whose form owner changes as its form goes, its
// form's id changes or an element of that id comes in) the radios ren-dom's view checks in Chrome after its steps,
// ren-html's markup for the case (test/fixtures/radio-markup.jsx), and the
// radios Chrome checks parsing that markup in the page.
// Each case's names and ids end with its number, so no two cases share a
// group in the one page.
// Run it under the machine-wide Chrome lock and commit what it writes (the
// second file is ren-json's copy):
//   flock "$HOME/.cache/chrome-bench.lock" node --import ren-core/loader scripts/radio-oracle.mjs test/fixtures/radio.json ../../../ren-json/wtree/_repo_/test/fixtures/radio.json
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import { markupOf } from '../test/fixtures/radio-markup.jsx';
// ren-canv's recording Chrome, through ren-dom's link to it.
import { withChrome } from '../node_modules/ren-dom/node_modules/ren-canv/scripts/chrome.mjs';

/** A radio of value `id` in group `name` (`c` checked, `l` coming in later). @param {string} id @param {string | number | undefined} name @param {string} [flags] @param {string | number} [form] */
const r = (id, name, flags = '', form) => ({ id, ...(name === undefined ? {} : { name }), ...(flags.includes('c') ? { checked: true } : {}), ...(form === undefined ? {} : { form }), ...(flags.includes('l') ? { later: true } : {}) });
/** A form (coming in later when `later`). @param {string} id @param {any[]} children @param {boolean} [later] */
const form = (id, children, later = false) => ({ id, box: 'form', children, ...(later ? { later: true } : {}) });
/** A div (coming in later when `later`). @param {string} id @param {any[]} children @param {boolean} [later] */
const div = (id, children, later = false) => ({ id, box: 'div', children, ...(later ? { later: true } : {}) });

const cases = [
  { name: 'two checked in a form', tree: [form('f', [r('a', 'g', 'c'), r('b', 'g', 'c')])] },
  { name: 'two checked, no form', tree: [r('a', 'g', 'c'), r('b', 'g', 'c')] },
  { name: 'three checked, no form', tree: [r('a', 'g', 'c'), r('b', 'g', 'c'), r('c', 'g', 'c')] },
  { name: 'two checked in divs, no form', tree: [div('d', [r('a', 'g', 'c')]), div('e', [r('b', 'g', 'c')])] },
  { name: 'two checked, names that differ', tree: [r('a', 'g', 'c'), r('b', 'h', 'c')] },
  { name: 'two checked, names that differ in case', tree: [r('a', 'g', 'c'), r('b', 'G', 'c')] },
  { name: 'two checked without a name', tree: [r('a', undefined, 'c'), r('b', undefined, 'c')] },
  { name: 'two checked with an empty name', tree: [r('a', '', 'c'), r('b', '', 'c')] },
  { name: 'the same name in two forms', tree: [form('f', [r('a', 'g', 'c')]), form('k', [r('b', 'g', 'c')])] },
  { name: 'one in a form, one outside', tree: [form('f', [r('a', 'g', 'c')]), r('b', 'g', 'c')] },
  { name: 'a form attribute joins the form\'s group', tree: [form('f', [r('a', 'g', 'c')]), r('b', 'g', 'c', 'f')] },
  { name: 'a form attribute leaves the form around it', tree: [form('f', [r('a', 'g', 'c'), r('b', 'g', 'c', 'k')]), form('k', [])] },
  { name: 'a form attribute no form has', tree: [r('a', 'g', 'c'), r('b', 'g', 'c', 'none')] },
  { name: 'the first checked later', tree: [r('a', 'g'), r('b', 'g', 'c')], steps: [{ check: 'a' }] },
  { name: 'the first checked later, in a form', tree: [form('f', [r('a', 'g'), r('b', 'g', 'c')])], steps: [{ check: 'a' }] },
  { name: 'the checked one unchecked', tree: [r('a', 'g', 'c'), r('b', 'g')], steps: [{ uncheck: 'a' }] },
  { name: 'a checked radio comes in later', tree: [r('a', 'g', 'c'), r('b', 'g', 'cl')], steps: [{ show: true }] },
  { name: 'a checked radio comes in before the checked one', tree: [r('a', 'g', 'cl'), r('b', 'g', 'c')], steps: [{ show: true }] },
  { name: 'a checked radio renamed into the group', tree: [r('a', 'g', 'c'), r('b', 'h', 'c')], steps: [{ rename: 'b', to: 'g' }] },
  { name: 'the first checked, then the second', tree: [r('a', 'g'), r('b', 'g')], steps: [{ check: 'a' }, { check: 'b' }] },
  { name: 'an empty form attribute, a form with an empty id', tree: [form('', [r('a', 'g', 'c')]), r('b', 'g', 'c', '')] },
  { name: 'a form attribute names a form after it', tree: [r('b', 'g', 'c', 'k'), form('k', [r('a', 'g', 'c')])] },
  { name: 'a form attribute names a form coming in later', tree: [r('b', 'g', 'c', 'k'), form('k', [r('a', 'g', 'c')], true)], steps: [{ show: true }] },
  { name: 'form attributes name a form before and after them', tree: [r('b', 'g', 'c', 'k'), form('k', [r('a', 'g', 'c')]), r('c', 'g', 'c', 'k')] },
  { name: 'a name given as a number', tree: [r('a', 7, 'c'), r('b', 7, 'c')] },
  { name: 'a form attribute given as a number', tree: [form('7', [r('a', 'g', 'c')]), r('b', 'g', 'c', 7)] },
  { name: 'nested forms, a form attribute names the outer one', tree: [form('f', [form('k', [r('a', 'g', 'c', 'f'), r('c', 'g', 'c')]), r('b', 'g', 'c')])] },
  // A radio whose form owner changes while the radio stays as it is: its form goes, its form's id changes,
  // or an element of that id comes in before the form. The next step shows which radio the group kept.
  { name: 'the named form removed, then the radio naming it unchecked', tree: [r('a', 'g', 'c'), form('f', []), r('b', 'g', 'c', 'f')], steps: [{ removeBox: 'f' }, { uncheck: 'b' }] },
  { name: 'the named form removed, then the radio after it unchecked', tree: [r('b', 'g', 'c', 'f'), r('a', 'g', 'c'), form('f', [])], steps: [{ removeBox: 'f' }, { uncheck: 'a' }] },
  { name: 'the named form removed, then the radio naming it removed', tree: [r('a', 'g', 'c'), form('f', []), r('b', 'g', 'c', 'f')], steps: [{ removeBox: 'f' }, { remove: 'b' }] },
  { name: 'the named form\'s id changes away, then the radio naming it removed', tree: [r('p', 'g', 'c'), form('f', []), r('b', 'g', 'c', 'f')], steps: [{ reid: 'f', to: 'x' }, { remove: 'b' }] },
  { name: 'a form\'s id changes to the one named, then the radio naming it removed', tree: [form('x', [r('a', 'g', 'c')]), r('b', 'g', 'c', 'f')], steps: [{ reid: 'x', to: 'f' }, { remove: 'b' }] },
  { name: 'an element of the named id comes in before the form, then the radio naming it removed', tree: [div('f', [], true), r('p', 'g', 'c'), form('f', [r('a', 'g', 'c')]), r('b', 'g', 'c', 'f')], steps: [{ show: true }, { remove: 'b' }] },
];

/** The case with its names, ids and form references ending with its number `k` (an empty one stays empty, a number a number). @param {any} c @param {number} k */
function numbered(c, k) {
  /** @param {string | number} s */
  const end = s => (s === '' ? '' : typeof s === 'number' ? Number(`${s}${k}`) : `${s}${k}`);
  /** @param {any} n @returns {any} */
  const node = n => ('box' in n ? { ...n, id: end(n.id), children: n.children.map(node) } : { ...n, ...(n.name ? { name: end(n.name) } : {}), ...(n.form === undefined ? {} : { form: end(n.form) }) });
  // A box a step names (removed, or its id changed) is numbered as the box is.
  /** @param {any} s */
  const step = s => ({ ...s, ...(s.to === undefined ? {} : { to: `${s.to}${k}` }), ...(s.removeBox === undefined ? {} : { removeBox: end(s.removeBox) }), ...(s.reid === undefined ? {} : { reid: end(s.reid) }) });
  return { ...c, tree: c.tree.map(node), ...(c.steps === undefined ? {} : { steps: c.steps.map(step) }) };
}

const numberedCases = cases.map(numbered);
const markups = numberedCases.map(markupOf);

const root = fileURLToPath(new URL('..', import.meta.url));
const page = `
import { Root } from 'ren-core';
import { $flush } from 'rrx-core';
import { $dom } from 'ren-dom';
import { radioCase } from './test/fixtures/radio-view.jsx';
const cases = ${JSON.stringify(numberedCases)};
const markups = ${JSON.stringify(markups)};
const state = el => [...el.querySelectorAll('input')].map(i => i.checked);
window.results = cases.map((c, i) => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const { View, apply } = radioCase(c);
  const root = Root({ id: 'c' + i, target, renderer: $dom(document), children: View });
  for (const step of c.steps ?? []) {
    apply(step);
    $flush(root);
  }
  const live = state(target);
  target.remove();
  // Parsed in the page, as a page's markup is: its radios connected.
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
  const file = join(profile, 'radio.html');
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
