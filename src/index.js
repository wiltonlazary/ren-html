// ren-html: a view rendered once to HTML, for servers and static pages. No
// hydration: the page is markup and styles, and a client that needs the
// application renders it fresh (ren-dom).
//
// The view runs in an application root with ren-dom's $dom host over a small
// document of its own (document.js), so the markup is exactly the one
// ren-dom makes in a browser, primitives' scoped styles included. $html
// waits until every task the view started has settled ($settle), serializes
// the root's host element, and disposes the root.

import { Root, $settle, $dispose } from 'ren-core';
import { $dom } from 'ren-dom';
import { Document } from './document.js';

export { Document, serialize } from './document.js';

/**
 * @typedef {object} Options
 * @property {string=} id The root's id (`page`): its data-ren-root, storage keys and element ids.
 * @property {any=} props What the view reads with `$lookup(Props)`.
 * @property {[any, any][]=} provide Contexts passed in, as `Root`'s `provide`.
 * @property {import('ren-core/host').Tokens=} theme Theme overrides, as ren-dom's.
 * @property {(boolean | string)=} styles The primitives' scoped stylesheet (true), none (false), or extra CSS, as ren-dom's.
 * @property {string=} tag The host element's tag (`div`).
 * @property {number=} timeout Milliseconds to wait for tasks to settle (10,000; 0 waits forever).
 */

/**
 * Renders `view` once and returns its HTML, after its tasks settled.
 * @param {any} view a component (`App`), an element (`<App />`), or a function returning one
 * @param {Options} [options]
 * @returns {Promise<string>}
 */
export async function $html(view, options = {}) {
  const document = new Document();
  const root = Root({
    id: options.id ?? 'page',
    target: document.body,
    renderer: $dom(/** @type {any} */ (document), { theme: options.theme, styles: options.styles }),
    storage: null,
    locks: null,
    props: options.props,
    provide: options.provide,
    tag: options.tag,
    // Rendered once and disposed: no background disposal to schedule.
    retire: false,
    sweep: false,
    children: view,
  });
  try {
    await $settle(root, { timeout: options.timeout });
    return document.body.innerHTML;
  } finally {
    $dispose(root);
  }
}
