// ren-html's markup of a select case (test/fixtures/select-view.jsx), after
// its steps: ren-dom on ren-html's Document, as $html renders, the select
// alone. A case the user picks in has none: a page has no user.

import { Root, $dispose } from 'ren-core';
import { $flush } from 'rrx-core';
import { $dom } from 'ren-dom';
import { Document, serialize } from 'ren-html';
import { selectCase } from './select-view.jsx';

/** @param {import('./select-view.jsx').Case} c @returns {string | null} */
export function markupOf(c) {
  if (c.steps?.some(s => s.pick !== undefined)) return null;
  const document = new Document();
  /** @type {any} */
  let select = null;
  const { View, apply } = selectCase(c, el => (select = el));
  const root = Root({ id: 'page', target: document.body, renderer: $dom(/** @type {any} */ (document), { styles: false }), storage: null, locks: null, retire: false, sweep: false, children: View });
  try {
    for (const step of c.steps ?? []) {
      apply(step);
      $flush(root);
    }
    return serialize(select);
  } finally {
    $dispose(root);
  }
}
