// Which radios a page checks, against Chrome (test/fixtures/radio.json,
// recorded by scripts/radio-oracle.mjs): for each case (two checked in a
// group, in a form or none, names that differ, no name, two forms, a form
// attribute, a radio checked, unchecked or renamed later, a checked one
// coming in, a form owner changing as a form goes or an id changes or comes
// in) ren-html writes the markup whose parse Chrome recorded, which
// checks the radios ren-dom's view checks in Chrome: a checked radio
// unchecks the rest of its group. ren-json's test/radio.test.jsx reads the
// same file.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { For } from 'ren-core';
import { $html } from 'ren-html';
import { markupOf } from './fixtures/radio-markup.jsx';

/** @typedef {import('./fixtures/radio-view.jsx').Case & { chrome: boolean[], html: string, parse: boolean[] }} Row */
const oracle = /** @type {{ recorded: string, cases: Row[] }} */ (JSON.parse(readFileSync(new URL('./fixtures/radio.json', import.meta.url), 'utf8')));

describe(`ren html radios, as ${oracle.recorded} checks them`, () => {
  it('writes the markup whose parse Chrome recorded, which checks the radios the view checks', () => {
    for (const c of oracle.cases) {
      assert.equal(markupOf(c), c.html, `${c.name}: the markup Chrome parsed`);
      assert.deepEqual(c.parse, c.chrome, `${c.name}: parsed ${JSON.stringify(c.parse)}, live ${JSON.stringify(c.chrome)}`);
    }
  });
});

describe('ren html radios, by the work they take', () => {
  it('groups the checked radios of a long list in work that grows with the list, not its square', async () => {
    // The work, not the time: the Map reads and writes a render makes (each element's attributes are a
    // Map), for a list of N rows and of 4N. Grown with the list, 4N takes about 4 times as many; walked
    // over the whole page on each row's insertion, as many as 16 times.
    // A row reads its index through For's accessor, so each row has its own name or id; the radios left
    // checked show it: every row's where each row is its own group, one where all rows are one group. A
    // row's radio with a form attribute finds its form by id, and may name a form after the list.
    /** @type {Record<string, [(i: () => number) => any, (n: number) => number, any?]>} */
    const rows = {
      'a radio of its own name a row': [i => <div><input type="radio" name={`g${i()}`} checked /></div>, n => n],
      'a form a row, its radio of one name': [i => <form id={`f${i()}`}><input type="radio" name="g" checked /></form>, n => n],
      'radios of one name, each checking alone': [() => <div><input type="radio" name="g" checked /></div>, () => 1],
      'a radio of its own name a row, naming the form after the list': [i => <div><input type="radio" name={`g${i()}`} form="f" checked /></div>, n => n, () => <form id="f" />],
      'radios of one name naming no form': [() => <div><input type="radio" name="g" form="none" checked /></div>, () => 1],
    };
    const { get, has, set } = Map.prototype;
    let work = 0;
    /** @param {(i: () => number) => any} row @param {number} n @param {any} [after] @returns {Promise<[number, number]>} the work, and the radios left checked */
    const measure = async (row, n, after) => {
      const each = Array.from({ length: n }, (_, i) => i);
      work = 0;
      Map.prototype.get = function (/** @type {any} */ k) { work++; return get.call(this, k); };
      Map.prototype.has = function (/** @type {any} */ k) { work++; return has.call(this, k); };
      Map.prototype.set = function (/** @type {any} */ k, /** @type {any} */ v) { work++; return set.call(this, k, v); };
      let html;
      try {
        html = await $html(() => <div><For each={each}>{row}</For>{after?.()}</div>, { styles: false });
      } finally {
        Object.assign(Map.prototype, { get, has, set });
      }
      return [work, (html.match(/checked=""/g) ?? []).length];
    };
    for (const [name, [row, checked, after]] of Object.entries(rows)) {
      const [small, smallChecked] = await measure(row, 300, after);
      const [large, largeChecked] = await measure(row, 1200, after);
      assert.deepEqual([smallChecked, largeChecked], [checked(300), checked(1200)], `${name}: the radios left checked`);
      assert.ok(large < 6 * small, `${name}: ${large} Map operations for 1200 rows, ${small} for 300`);
    }
  });
});
