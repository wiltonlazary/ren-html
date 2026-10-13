// Every reflected property a browser's HTML elements have, from the table the
// HTML standard's IDL gives (test/fixtures/reflected.js): on each owner it is
// a property, as ren-dom finds it in a browser (`name in element`), and it
// writes its attribute converted as its IDL type does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Document } from 'ren-html';
import { REFLECTED } from './fixtures/reflected.js';

/** A value of each type, and the attribute a browser writes for it. @type {Record<string, [unknown, string][]>} */
const SAMPLES = {
  boolean: [[true, ''], ['x', '']],
  long: [[2.5, '2'], ['7', '7']],
  'unsigned long': [[2.5, '2'], ['7', '7']],
  double: [[1.5, '1.5']],
  DOMString: [['v x', 'v x']],
  enumerated: [['v x', 'v x']],
  DOMTokenList: [['v x', 'v x']],
};

test('every reflected property of the HTML standard is one, on its owners, by its IDL type', () => {
  const document = new Document();
  /** @type {string[]} */
  const missed = [];
  for (const [iface, prop, attribute, type, owners] of REFLECTED) {
    for (const tag of owners[0] === '*' ? ['div', 'span', 'section'] : owners) {
      const where = `${iface}.${prop} on ${tag}`;
      const el = /** @type {any} */ (document.createElement(tag));
      if (!(prop in el)) {
        missed.push(`${where}: no property`);
        continue;
      }
      // A declarative shadow root is refused: ren-html renders no shadow roots.
      if (prop === 'shadowRootMode') {
        assert.throws(() => (el[prop] = 'open'), /shadow roots are not rendered/, where);
        continue;
      }
      for (const [value, want] of SAMPLES[type]) {
        el[prop] = value;
        const got = el.getAttribute(attribute);
        if (got !== want) missed.push(`${where} = ${JSON.stringify(value)}: wrote ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
      }
      if (type === 'boolean') {
        el[prop] = false;
        if (el.hasAttribute(attribute)) missed.push(`${where} = false: kept the attribute`);
      }
    }
  }
  assert.deepEqual(missed, []);
});

test('every numeric reflected property follows its rule: its limit, range and default', () => {
  const document = new Document();
  /** @type {string[]} */
  const missed = [];
  for (const [iface, prop, attribute, type, owners, rule] of REFLECTED) {
    if (rule === undefined) continue;
    for (const tag of owners[0] === '*' ? ['div', 'span'] : owners) {
      const where = `${iface}.${prop} on ${tag}`;
      const fresh = () => /** @type {any} */ (document.createElement(tag));
      /** Writes `value` and says what the attribute holds after, or the error thrown. @param {unknown} value */
      const write = (value) => {
        const el = fresh();
        el.setAttribute(attribute, 'was');
        try {
          el[prop] = value;
          return el.getAttribute(attribute);
        } catch (error) {
          return /** @type {Error} */ (error).name;
        }
      };
      /** @param {string} what @param {unknown} got @param {unknown} want */
      const check = (what, got, want) => got === want || missed.push(`${where} ${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
      const min = rule.limit === 'positive' || rule.limit === 'positive-with-fallback' ? 1 : 0;
      // Read back with no attribute: the default, else the least allowed value.
      check('read without the attribute', fresh()[prop], rule.default ?? (rule.limit === 'clamped' ? /** @type {[number, number]} */ (rule.range)[0] : type === 'long' && rule.limit === 'non-negative' ? -1 : min));
      if (type === 'double') {
        if (rule.limit === 'positive') check('= 0', write(0), 'was');
        continue;
      }
      if (rule.limit === 'positive') check('= 0', write(0), 'IndexSizeError');
      else if (rule.limit === 'positive-with-fallback') check('= 0', write(0), String(rule.default));
      else check('= 0', write(0), '0');
      if (rule.limit === 'non-negative') check('= -1', write(-1), 'IndexSizeError');
      else if (type === 'unsigned long') check('= -1', write(-1), String(rule.default ?? min));
      else check('= -1', write(-1), '-1');
      if (rule.limit === 'clamped') {
        const [low, high] = /** @type {[number, number]} */ (rule.range);
        const el = fresh();
        el.setAttribute(attribute, String(high + 1));
        check('read above its range', el[prop], high);
        el.setAttribute(attribute, '99999999999');
        check('read far above its range', el[prop], high);
        if (low > 0) {
          el.setAttribute(attribute, '0');
          check('read below its range', el[prop], low);
        }
      }
    }
  }
  assert.deepEqual(missed, []);
});
