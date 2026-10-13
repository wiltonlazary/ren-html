// ren-html's markup of a details case (test/fixtures/details-view.jsx),
// after its steps: ren-dom on ren-html's Document, as $html renders, the
// view's own element alone.

import { Root, $dispose } from 'ren-core';
import { $flush } from 'rrx-core';
import { $dom } from 'ren-dom';
import { Document, serialize } from 'ren-html';
import { detailsCase } from './details-view.jsx';

/** @param {import('./details-view.jsx').Case} c @returns {string} */
export function markupOf(c) {
  const document = new Document();
  const { View, apply } = detailsCase(c);
  const root = Root({ id: 'page', target: document.body, renderer: $dom(/** @type {any} */ (document), { styles: false }), storage: null, locks: null, retire: false, sweep: false, children: View });
  try {
    for (const step of c.steps ?? []) {
      apply(step);
      $flush(root);
    }
    return serialize(/** @type {any} */ (document.body.firstChild).firstChild);
  } finally {
    $dispose(root);
  }
}
