// Records which options Chrome selects, the oracle test/select.test.jsx
// (and ren-json's, from the same file) checks ren-dom, ren-html and ren-json
// against: for each select case (test/fixtures/select-view.jsx builds it: a
// value before or after its options, options coming in later, selected
// options before and after the value's match, two selected in a single
// select, multiple selects, optgroups, disabled options, a value matched by
// text, '' and unmatched values, the user's pick then inserts, list boxes
// (a size above 1) and a size changed, options in a div or a nested
// optgroup, multiple set and removed) ren-dom's
// select in Chrome after its steps (its selectedIndex and each option's
// selected), ren-html's markup for the case, and the options Chrome selects
// parsing that markup.
// ren-html's markup comes from test/fixtures/select-markup.jsx.
// Run it under the machine-wide Chrome lock and commit what it writes (the
// second file is ren-json's copy):
//   flock -w 1800 "$HOME/.cache/chrome-bench.lock" node --import ren-core/loader scripts/select-oracle.mjs test/fixtures/select.json ../../../ren-json/wtree/_repo_/test/fixtures/select.json
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import { markupOf } from '../test/fixtures/select-markup.jsx';
// ren-canv's recording Chrome, through ren-dom's link to it.
import { withChrome } from '../node_modules/ren-dom/node_modules/ren-canv/scripts/chrome.mjs';

/** An option (`s` selected, `a` selected as an attribute, `d` disabled) of value and text `v`. @param {string} v @param {string} [flags] @param {string} [text] */
const o = (v, flags = '', text) => ({ id: v, value: v, ...(text === undefined ? {} : { text }), ...(flags.includes('s') ? { selected: true } : {}), ...(flags.includes('a') ? { attribute: true } : {}), ...(flags.includes('d') ? { disabled: true } : {}) });
/** An option with no value: its text is its value. @param {string} text @param {string} [id] */
const t = (text, id = text) => ({ id, text });
/** An optgroup. @param {string} label @param {any[]} options @param {boolean} [disabled] */
const g = (label, options, disabled) => ({ id: `g-${label}`, group: label, options, ...(disabled ? { disabled: true } : {}) });
/** A div around options or optgroups. @param {string} id @param {any[]} options */
const w = (id, options) => ({ id: `w-${id}`, wrap: true, options });

const cases = [
  { name: 'a selected option after the value\'s match', value: 'a', options: [o('a'), o('b', 's')] },
  { name: 'a selected option before the value\'s match', value: 'b', options: [o('a', 's'), o('b')] },
  { name: 'a selected attribute after the value\'s match', value: 'a', options: [o('a'), o('b', 'a')] },
  { name: 'a selected attribute before the value\'s match', value: 'b', options: [o('a', 'a'), o('b')] },
  { name: 'two selected in a single select', options: [o('a', 's'), o('b', 's'), o('c')] },
  { name: 'two selected attributes in a single select', options: [o('a', 'a'), o('b', 'a'), o('c')] },
  { name: 'two selected, the value matches the first', value: 'a', options: [o('a', 's'), o('b', 's')] },
  { name: 'two selected, the value matches the second', value: 'b', options: [o('a', 's'), o('b', 's'), o('c')] },
  { name: 'two selected around the value\'s match', value: 'b', options: [o('a', 's'), o('b'), o('c', 's')] },
  { name: 'a multiple select, two selected', multiple: true, options: [o('a', 's'), o('b'), o('c', 's')] },
  { name: 'a multiple select with a value', multiple: true, value: 'b', options: [o('a', 's'), o('b'), o('c', 's')] },
  { name: 'a multiple select with a value no option has', multiple: true, value: 'z', options: [o('a', 's'), o('b')] },
  { name: 'optgroups, the value in the second', value: 'd', options: [g('one', [o('a'), o('b')]), g('two', [o('c'), o('d')])] },
  { name: 'a selected option in an optgroup, the value\'s match after it', value: 'e', options: [g('one', [o('a'), o('b', 's')]), o('e')] },
  { name: 'a selected option in an optgroup and one after it', options: [g('one', [o('a', 's')]), o('b', 's')] },
  { name: 'a selected option after an optgroup holding the value\'s match', value: 'a', options: [g('one', [o('a')]), o('b', 's')] },
  { name: 'a disabled first option', options: [o('a', 'd'), o('b'), o('c')] },
  { name: 'every option disabled', options: [o('a', 'd'), o('b', 'd')] },
  { name: 'the value matches a disabled option', value: 'a', options: [o('a', 'd'), o('b')] },
  { name: 'a selected disabled option', options: [o('a'), o('b', 'sd')] },
  { name: 'a value matched by text', value: 'Two x', options: [t('One'), t(' Two \n x ', 'two'), t('Two x', 'again')] },
  { name: 'the value \'\' matches an empty option', value: '', options: [o('a'), o('', '', 'None')] },
  { name: 'the value \'\' and no empty option', value: '', options: [o('a'), o('b')] },
  { name: 'a value no option has', value: 'z', options: [o('a'), o('b')] },
  { name: 'a value no option has, a selected option', value: 'z', options: [o('a'), o('b', 's')] },
  { name: 'no value, nothing selected', options: [o('a'), o('b')] },
  { name: 'options coming in later hold the kept value', value: 'b', options: [], steps: [{ options: [o('a'), o('b'), o('c')] }] },
  { name: 'the kept value comes in an optgroup', value: 'd', options: [], steps: [{ options: [g('two', [o('c'), o('d')])] }] },
  { name: 'the value set after the options', options: [o('a'), o('b'), o('c')], steps: [{ value: 'c' }] },
  { name: 'the value changed to one no option has', value: 'a', options: [o('a'), o('b')], steps: [{ value: 'z' }] },
  { name: 'the value changed to one no option has, then it comes in', value: 'a', options: [o('a'), o('b')], steps: [{ value: 'q' }, { options: [o('a'), o('b'), o('q')] }] },
  { name: 'a selected option comes in after the value\'s match', value: 'a', options: [o('a')], steps: [{ options: [o('a'), o('b', 's')] }] },
  { name: 'a selected option comes in before the one selected', options: [o('a'), o('b', 's')], steps: [{ options: [o('x', 's'), o('a'), o('b', 's')] }] },
  { name: 'the selected option goes', options: [o('a'), o('b', 's')], steps: [{ options: [o('a')] }] },
  { name: 'the value\'s match goes', value: 'b', options: [o('a'), o('b'), o('c')], steps: [{ options: [o('a'), o('c')] }] },
  { name: 'an option comes in before the value\'s match', value: 'b', options: [o('a'), o('b')], steps: [{ options: [o('x'), o('a'), o('b')] }] },
  { name: 'a multiple select, its options later', multiple: true, value: 'b', options: [], steps: [{ options: [o('a'), o('b'), o('c')] }] },
  { name: 'the user picks, then the kept value comes in', value: 'z', options: [o('q'), o('a'), o('b')], steps: [{ pick: 2 }, { options: [o('q'), o('a'), o('b'), o('z')] }] },
  { name: 'the user picks, then options come in', value: 'a', options: [o('a'), o('b')], steps: [{ pick: 1 }, { options: [o('x'), o('a'), o('b')] }] },
  // A list box (size 2 and more) shows no option by itself.
  { name: 'a list box, nothing selected', size: 3, options: [o('a'), o('b')] },
  { name: 'a list box with a value no option has', size: 3, value: 'z', options: [o('a'), o('b')] },
  { name: 'a list box, a selected option', size: 3, options: [o('a'), o('b', 's')] },
  { name: 'a list box, two selected', size: 2, options: [o('a', 's'), o('b', 's'), o('c')] },
  { name: 'size 1, nothing selected', size: 1, options: [o('a'), o('b')] },
  { name: 'size 0, nothing selected', size: 0, options: [o('a'), o('b')] },
  { name: 'a list box, its options later', size: 3, value: 'z', options: [], steps: [{ options: [o('a'), o('b')] }] },
  { name: 'a list box whose selected option goes', size: 3, options: [o('a'), o('b', 's')], steps: [{ options: [o('a')] }] },
  { name: 'a list box becomes a drop-down, nothing selected', size: 3, options: [o('a'), o('b')], steps: [{ size: 1 }] },
  { name: 'a drop-down becomes a list box', size: 1, options: [o('a'), o('b')], steps: [{ size: 3 }] },
  // The options are the select's descendants whose nearest select it is: through a div, not in a nested optgroup.
  { name: 'a selected option in a div', options: [o('a'), w('one', [o('b', 's')])] },
  { name: 'the value\'s match in a div', value: 'b', options: [o('a'), w('one', [o('b')])] },
  { name: 'an optgroup in a div holds the value\'s match', value: 'b', options: [w('one', [g('one', [o('a'), o('b')])])] },
  { name: 'a div holding the value\'s match comes in later', value: 'b', options: [], steps: [{ options: [o('a'), w('one', [o('b')])] }] },
  { name: 'a div holding the selected option goes', options: [o('a'), w('one', [o('b', 's')])], steps: [{ options: [o('a')] }] },
  { name: 'the value\'s match in a nested optgroup', value: 'x', options: [o('a'), g('outer', [g('inner', [o('x')])])] },
  { name: 'a selected option in a nested optgroup', options: [o('a'), g('outer', [o('b'), g('inner', [o('x', 's')])])] },
  { name: 'a disabled optgroup first', options: [g('one', [o('a')], true), o('b')] },
  { name: 'a div in a disabled optgroup first', options: [g('one', [w('one', [o('a')])], true), o('b')] },
  // multiple set and removed.
  { name: 'multiple removed, two selected', multiple: true, options: [o('a', 's'), o('b'), o('c', 's')], steps: [{ multiple: false }] },
  { name: 'multiple removed, none selected', multiple: true, options: [o('a'), o('b')], steps: [{ multiple: false }] },
  { name: 'multiple removed from a list box, two selected', multiple: true, size: 3, options: [o('a'), o('b', 's'), o('c', 's')], steps: [{ multiple: false }] },
  { name: 'multiple set, the first picked by itself', multiple: false, options: [o('a'), o('b')], steps: [{ multiple: true }] },
  { name: 'multiple set, then a second selected comes in', multiple: false, options: [o('a'), o('b', 's')], steps: [{ multiple: true }, { options: [o('a'), o('b', 's'), o('c', 's')] }] },
];

const markups = cases.map(markupOf);

const root = fileURLToPath(new URL('..', import.meta.url));
const page = `
import { Root } from 'ren-core';
import { $flush } from 'rrx-core';
import { $dom } from 'ren-dom';
import { selectCase } from './test/fixtures/select-view.jsx';
const cases = ${JSON.stringify(cases)};
const markups = ${JSON.stringify(markups)};
const state = s => ({ index: s.selectedIndex, selected: [...s.options].map(o => o.selected) });
window.results = cases.map((c, i) => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  let select = null;
  const { View, apply } = selectCase(c, el => (select = el));
  const root = Root({ id: 'c' + i, target, renderer: $dom(document), children: View });
  for (const step of c.steps ?? []) {
    if (step.pick !== undefined) {
      select.selectedIndex = step.pick;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } else apply(step);
    $flush(root);
  }
  const out = { dom: state(select) };
  if (markups[i] !== null) {
    const parsed = document.createElement('div');
    parsed.innerHTML = markups[i];
    out.parse = state(parsed.querySelector('select'));
  }
  return out;
});
`;
const bundle = await build({ stdin: { contents: page, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, format: 'iife', jsx: 'automatic', jsxImportSource: 'ren-core', logLevel: 'error' });
const js = bundle.outputFiles[0].text;

await withChrome(async ({ send, evaluate, profile }) => {
  const file = join(profile, 'select.html');
  writeFileSync(file, `<!doctype html><html><body><script>${js.replace(/<\/script/g, '<\\/script')}</script></body></html>`);
  await send('Page.navigate', { url: `file://${file}` });
  // The page is loaded once its script has run (withChrome's deadline ends a page that never does).
  while ((await evaluate('Array.isArray(window.results)')) !== true);
  const results = await evaluate('results');
  const recorded = await evaluate('navigator.userAgent.match(/Chrome\\/[\\d.]+/)[0]');
  // A case a line.
  const rows = cases.map((c, i) => JSON.stringify({ ...c, chrome: results[i].dom, html: markups[i], parse: results[i].parse ?? null }));
  const text = `{"recorded":${JSON.stringify(recorded)},"cases":[\n${rows.join(',\n')}\n]}\n`;
  for (const out of process.argv.slice(2)) writeFileSync(out, text);
});
