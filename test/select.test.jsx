// Which options a select shows selected, against Chrome
// (test/fixtures/select.json, recorded by scripts/select-oracle.mjs): for
// each case (a value before or after its options, options coming in later,
// selected options before and after the value's match, two selected in a
// single select, multiple selects, optgroups, disabled options, a value
// matched by text, '' and unmatched values, the user's pick then inserts,
// list boxes and a size changed, options in a div or a nested optgroup,
// multiple set and removed) ren-dom's live select on happy-dom selects what ren-dom's selects in
// Chrome but where happy-dom's own select differs (HAPPY), and ren-html writes the markup whose parse Chrome recorded, which
// selects the same options but where KNOWN says why not. ren-json's
// test/select.test.jsx reads the same file.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { Root, $dispose } from 'ren-core';
import { $flush } from 'rrx-core';
import { $dom } from 'ren-dom';
import { selectCase } from './fixtures/select-view.jsx';
import { markupOf } from './fixtures/select-markup.jsx';

/** @typedef {{ index: number, selected: boolean[] }} Shown */
/** @typedef {import('./fixtures/select-view.jsx').Case & { chrome: Shown, html: string | null, parse: Shown | null }} Row */
const oracle = /** @type {{ recorded: string, cases: Row[] }} */ (JSON.parse(readFileSync(new URL('./fixtures/select.json', import.meta.url), 'utf8')));

/** Cases whose markup cannot select what the live select does, and why. */
const KNOWN = /** @type {Record<string, string>} */ ({
  'the value changed to one no option has': 'a single select shows no option only live: markup without a selected option shows its first',
  'the value\'s match in a nested optgroup': 'a nested optgroup is live only: the parser ends an optgroup at the next, so its options are the select\'s',
  'a selected option in a nested optgroup': 'a nested optgroup is live only: the parser ends an optgroup at the next, so its options are the select\'s',
});

/** Cases happy-dom's own select model answers otherwise than Chrome's, whatever ren-dom does, and how. */
const ARRIVES = 'happy-dom does not select an option that comes in selected';
const HAPPY = /** @type {Record<string, string>} */ ({
  'two selected around the value\'s match': ARRIVES,
  'a value no option has, a selected option': ARRIVES,
  'a selected option comes in after the value\'s match': ARRIVES,
  'a selected option comes in before the one selected': ARRIVES,
  'a multiple select, two selected': 'happy-dom\'s selectedIndex of a multiple select skips its selected options',
  'a multiple select with a value no option has': 'happy-dom\'s selectedIndex of a multiple select skips its selected options',
  'a value matched by text': 'happy-dom\'s option value keeps its text\'s whitespace',
  'an option comes in before the value\'s match': 'happy-dom\'s selectedIndex misses an option inserted before the selected one',
  'the user picks, then options come in': 'happy-dom\'s selectedIndex misses an option inserted before the selected one',
  'a list box, a selected option': 'happy-dom\'s selectedIndex of a list box skips its selected options',
  'size 0, nothing selected': 'happy-dom reads size 0 as a list box, where Chrome\'s is a drop-down',
  'a list box becomes a drop-down, nothing selected': 'happy-dom does not pick an option when a list box becomes a drop-down',
  'the value\'s match in a nested optgroup': 'happy-dom counts an option in a nested optgroup as the select\'s',
  'a selected option in a nested optgroup': 'happy-dom counts an option in a nested optgroup as the select\'s',
  'a div in a disabled optgroup first': 'happy-dom does not disable an option through a div in a disabled optgroup',
  'multiple removed, two selected': 'happy-dom keeps a select\'s selection when its multiple goes',
  'multiple removed, none selected': 'happy-dom keeps a select\'s selection when its multiple goes',
  'multiple removed from a list box, two selected': 'happy-dom keeps a select\'s selection when its multiple goes',
});

describe(`ren html select, as ${oracle.recorded} selects`, () => {
  /** @type {Window[]} */
  const windows = [];
  after(async () => {
    for (const window of windows.splice(0)) await window.happyDOM.close();
  });

  it('selects on the DOM what ren-dom\'s select does in Chrome', () => {
    const window = new Window();
    windows.push(window);
    const document = window.document;
    oracle.cases.forEach((c, i) => {
      const target = document.createElement('div');
      document.body.appendChild(target);
      /** @type {any} */
      let select = null;
      const { View, apply } = selectCase(c, el => (select = el));
      const root = Root({ id: `c${i}`, target, renderer: $dom(/** @type {any} */ (document)), children: View });
      for (const step of c.steps ?? []) {
        if (step.pick !== undefined) {
          select.selectedIndex = step.pick;
          select.dispatchEvent(new window.Event('input', { bubbles: true }));
          select.dispatchEvent(new window.Event('change', { bubbles: true }));
        } else apply(step);
        $flush(root);
      }
      const shown = { index: select.selectedIndex, selected: [...select.options].map((/** @type {any} */ o) => o.selected) };
      if (HAPPY[c.name] === undefined) assert.deepEqual(shown, c.chrome, c.name);
      else assert.notDeepEqual(shown, c.chrome, `${c.name}: happy-dom agrees now (${HAPPY[c.name]} no longer)`);
      $dispose(root);
    });
    for (const name in HAPPY) assert.ok(oracle.cases.some(c => c.name === name), `${name}: a case the table has`);
  });

  it('writes the markup whose parse Chrome recorded, which selects the same options', () => {
    for (const c of oracle.cases) {
      assert.equal(markupOf(c), c.html, `${c.name}: the markup Chrome parsed`);
      if (c.parse === null) continue;
      const same = JSON.stringify(c.parse) === JSON.stringify(c.chrome);
      assert.equal(same, KNOWN[c.name] === undefined, `${c.name}: ${KNOWN[c.name] ?? `parsed ${JSON.stringify(c.parse)}, live ${JSON.stringify(c.chrome)}`}`);
    }
    for (const name in KNOWN) assert.ok(oracle.cases.some(c => c.name === name), `${name}: a known case the table has`);
  });
});
