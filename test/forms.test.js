// Pins what ren-json mirrors from ren-html, so a change on either side shows:
// the void elements (the HTML standard's 18) and the valueAsNumber and
// valueAsDate conversions (test/fixtures/forms.js, the same table as ren-json's).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Document, serialize } from 'ren-html';
import { FORMS } from './fixtures/forms.js';

/** The HTML standard's void elements: the 13 of its syntax and the 5 its serializer writes without an end tag. */
const VOID = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'basefont', 'bgsound', 'frame', 'keygen', 'param'];
/** Near misses: elements that are not void. */
const NOT_VOID = ['image', 'menuitem', 'isindex', 'nextid', 'spacer', 'command', 'div', 'span', 'template', 'textarea', 'svg', 'math', 'object', 'iframe', 'video', 'picture'];

test('the void elements are the standard\'s 18: written without children or an end tag', () => {
  const document = new Document();
  for (const tag of [...VOID, ...NOT_VOID]) {
    const el = document.createElement(tag);
    el.appendChild(document.createTextNode('x'));
    const markup = serialize(el);
    if (VOID.includes(tag)) assert.equal(markup, `<${tag}>`, tag);
    else assert.ok(markup.endsWith(`</${tag}>`), `${tag}: ${markup}`);
  }
});

test('valueAsNumber and valueAsDate write the value the table gives', () => {
  const document = new Document();
  for (const [prop, type, given, want] of FORMS) {
    const el = /** @type {any} */ (document.createElement('input'));
    if (type !== '') el.setAttribute('type', type);
    let got;
    try {
      el[prop] = prop === 'valueAsDate' && given !== null ? new Date(given) : given;
      got = el.value;
    } catch (error) {
      got = `throws ${/** @type {Error} */ (error).name}`;
    }
    assert.equal(got, want, `${prop} ${type} ${given}`);
  }
});
