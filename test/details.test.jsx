// Which details a page leaves open, against Chrome
// (test/fixtures/details.json, recorded by scripts/details-oracle.mjs): for
// each case (open details of one name, names that differ, no name, one
// opened, closed or renamed later, an open one coming in, nested) ren-html
// writes the markup whose parse Chrome recorded, which leaves open the
// details ren-dom's view leaves open in Chrome: an open details of a name
// closes the others of that name in its tree, and one coming in open closes
// itself when another of its name is open there.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { markupOf } from './fixtures/details-markup.jsx';

/** @typedef {import('./fixtures/details-view.jsx').Case & { chrome: boolean[], html: string, parse: boolean[] }} Row */
const oracle = /** @type {{ recorded: string, cases: Row[] }} */ (JSON.parse(readFileSync(new URL('./fixtures/details.json', import.meta.url), 'utf8')));

describe(`ren html details, as ${oracle.recorded} opens them`, () => {
  it('writes the markup whose parse Chrome recorded, which leaves open the details the view leaves open', () => {
    for (const c of oracle.cases) {
      assert.equal(markupOf(c), c.html, `${c.name}: the markup Chrome parsed`);
      assert.deepEqual(c.parse, c.chrome, `${c.name}: parsed ${JSON.stringify(c.parse)}, live ${JSON.stringify(c.chrome)}`);
    }
  });
});
