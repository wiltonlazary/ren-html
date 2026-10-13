// ren-dom on happy-dom against $html, over many tags and props: each prop
// alone on each tag must write the same markup. Where they differ, the
// difference is listed below with its reason, and a listed one that no
// longer differs fails too, so the list stays true. The views are JSX with
// the tag in a variable, so both JSX passes run them; the URL parts also run
// on an absolute href, which they edit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Root, $dispose, Shape } from 'ren-core';
import { $dom } from 'ren-dom';
import { $html } from 'ren-html';

const TAGS = ['a', 'input', 'textarea', 'select', 'option', 'button', 'img', 'video', 'td', 'div', 'form', 'label', 'output', 'iframe', 'meter', 'progress', 'li', 'ol', 'details', 'dialog', 'link', 'meta', 'script', 'title', 'body'];
/** @type {Record<string, unknown>} */
const PROPS = {
  text: 'T', indeterminate: true, valueAsNumber: 5, valueAsDate: new Date(0), nonce: 'n1', slot: 's', part: 'p', popover: 'auto', autocorrect: 'off', selectedIndex: 0, outerText: 'o',
  noValidate: true, open: true, returnValue: 'r', currentTime: 3, volume: 0.5, muted: true, defaultMuted: true, playbackRate: 2, search: '?q', hash: '#h',
  pathname: '/p', origin: 'o', host: 'h.example', protocol: 'https:', username: 'u', password: 'pw', port: '8', hostname: 'x.example', dataset: 'd', htmlFor: 'f',
  className: 'c', type: 'email', ariaLabel: 'L', role: 'note', tabIndex: 2, max: 5, min: 1, step: 2, rows: 3, disabled: true, value: 'v', checked: true,
  selected: true, hidden: 'until-found', inert: true, translate: false, spellcheck: false, draggable: true, contentEditable: 'true', inputMode: 'numeric',
  enterKeyHint: 'go', autocapitalize: 'on', accessKey: 'k', lang: 'en', dir: 'rtl', title: 't', id: 'i', name: 'n', src: '/s', href: '/h', alt: 'a',
  download: 'f.txt', ping: '/p', crossOrigin: 'anonymous', loading: 'lazy', sizes: '1px', srcset: 'a 1x', relList: 'noopener', sandbox: 'allow-forms',
  allow: 'fullscreen', srcObject: null, formAction: '/f', label: 'lb', span: 2, colSpan: 2, headers: 'h1', scope: 'row', start: 3, reversed: true,
  defaultValue: 'dv', defaultChecked: true, defaultSelected: true, placeholder: 'p', pattern: '.*', size: 3, multiple: true, required: true, readOnly: true,
  autocomplete: 'off', accept: 'image/*', capture: 'user', width: 10, height: 20, poster: '/p.png', controls: true, loop: true, autoplay: true,
  playsInline: true, preload: 'none', content: 'c', httpEquiv: 'refresh', charset: 'utf-8', media: 'print', as: 'font', integrity: 'sha', blocking: 'render',
  fetchPriority: 'high', referrerPolicy: 'no-referrer', decoding: 'async', isMap: true, useMap: '#m', async: true, defer: true, noModule: true, event: 'e',
  closedBy: 'any', command: 'show-modal', commandFor: 'x', popoverTargetAction: 'show', formMethod: 'post', formEnctype: 'text/plain', formTarget: '_blank',
  formNoValidate: true, enctype: 'text/plain', method: 'post', action: '/a', target: '_blank', acceptCharset: 'utf-8', encoding: 'text/plain',
  dateTime: '2020', cite: '/c', low: 1, high: 4, optimum: 2, classList: 'a b', style: 'color: red',
};

/** An absolute href, for the URL parts to edit. */
const ABSOLUTE = 'https://u:p@x.example:8080/p?q=1#f';
/** The URL parts, and a value each, run again on an a and an area with ABSOLUTE as their href. @type {Record<string, string>} */
const PARTS = { hash: '#h', search: '?z=2', pathname: '/n', host: 'y.example:9', hostname: 'y.example', port: '443', protocol: 'http:', username: 'v', password: 'w' };

/**
 * Views with literal tags, props and children: the compiled pass compiles
 * them to templates (the sweep's `<Tag {...props} />` stays a call), so both
 * renderers must write the same markup from a template too. Their values are
 * ones happy-dom converts as a browser does (html.test.jsx and
 * reflected.test.js check the rest against the standard).
 * @type {Record<string, () => any>}
 */
const TEMPLATES = {
  nested: () => (
    <div class="c" title="t">
      <span>x</span>
      <b>y</b>
    </div>
  ),
  'URL part': () => (
    <a href="https://x.example/p" hash="#h">
      go
    </a>
  ),
  'text prop': () => <a href="/x" text="Docs" />,
  'content prop and children': () => <p textContent="T">child</p>,
  'textarea value and children': () => <textarea value="v">kid</textarea>,
  innerText: () => <p innerText={'a\nb'} />,
  'forwarded props': () => <div classList="a b" style="color: red" />,
  numbers: () => (
    <table>
      <tbody>
        <tr>
          <td colSpan={2} rowSpan={3}>
            c
          </td>
        </tr>
      </tbody>
    </table>
  ),
  list: () => (
    <ol start={3}>
      <li>one</li>
      <li value={7}>two</li>
    </ol>
  ),
  form: () => (
    <form action="/a" method="post">
      <label htmlFor="f">Name</label>
      <textarea id="f" rows={4} />
      <input type="number" min={1} max={9} step={2} />
      <button type="submit" disabled>
        Send
      </button>
    </form>
  ),
};

/** Shapes without a color or a radius, whose ink and rounding follow the theme (a style of their own). */
const SHAPES = {
  round: [{ kind: 'round', x: 0, y: 0, right: 10, bottom: 10 }],
  line: [{ kind: 'line', x: 0, y: 0, right: 10, bottom: 10 }],
  'open path': [{ kind: 'path', points: [0, 0, 5, 10, 10, 0] }],
  'stroked rect': [{ kind: 'rect', x: 0, y: 0, right: 10, bottom: 10, stroke: 2 }],
};

/** The known differences, by `tag.prop` (`*` for every tag), and why. @type {Record<string, string>} */
const KNOWN = {
  // happy-dom lacks what a browser has; ren-html writes the browser's markup (html.test.jsx asserts it).
  '*.translate': 'happy-dom has no translate property: a browser writes translate="no"',
  '*.spellcheck': 'happy-dom has no spellcheck property: a browser writes spellcheck="false"',
  '*.autocorrect': 'happy-dom has no autocorrect property: a browser\'s is a boolean, and "off" writes autocorrect="on"',
  '*.draggable': 'happy-dom writes draggable as a flag: a browser writes draggable="true"',
  '*.ariaLabel': 'happy-dom has no ARIA reflection: a browser writes aria-label',
  '*.accessKey': 'happy-dom has no accessKey property: a browser writes accesskey',
  '*.hidden': 'happy-dom writes hidden as a flag: a browser keeps hidden="until-found"',
  'form.relList': 'happy-dom has no form relList: a browser writes rel',
  'form.acceptCharset': 'happy-dom has no acceptCharset: a browser writes accept-charset',
  'form.encoding': 'happy-dom has no form encoding: a browser writes enctype',
  'script.htmlFor': 'happy-dom has no script htmlFor: a browser writes for',
  'option.defaultSelected': 'happy-dom has no defaultSelected: a browser writes selected',
  'output.defaultValue': 'happy-dom drops an output defaultValue: a browser writes it as the content',
  // ren-html writes state a static page must show, on purpose (README): a browser keeps it out of the markup.
  'input.value': 'a static page shows the value typed',
  'input.checked': 'a static page shows the check',
  'textarea.value': 'a static page shows the text typed',
  'option.selected': 'a static page shows the choice',
  'textarea.type': 'happy-dom lets a textarea\'s type be set: a browser\'s is read-only, and assigning it throws',
};

test('ren-dom on happy-dom and $html write each prop on each tag the same, but for the known differences', async t => {
  const window = new Window();
  /** @type {{ window: Window | null }} */
  const slot = { window };
  t.after(() => {
    const open = slot.window;
    slot.window = null;
    return open?.happyDOM.close();
  });
  const document = window.document;
  /** @type {string[]} */
  const unknown = [];
  const seen = new Set();
  /** @type {[string, string, unknown, Record<string, unknown>][]} */
  const runs = [];
  for (const tag of TAGS) for (const [prop, value] of Object.entries(PROPS)) runs.push([tag, prop, value, {}]);
  for (const tag of ['a', 'area']) for (const [prop, value] of Object.entries(PARTS)) runs.push([tag, prop, value, { href: ABSOLUTE }]);
  let edited = 0;
  for (const [tag, prop, value, before] of runs) {
      const Tag = /** @type {any} */ (tag);
      // The href first, then the part: a literal prop before a spread keeps its order in both passes.
      const view = () => <Tag href={before.href} {...{ [prop]: value }} />;
      let dom;
      try {
        const root = Root({ id: 'page', target: document.body, renderer: $dom(/** @type {any} */ (document), { styles: false }), storage: null, locks: null, children: view });
        dom = /** @type {Element} */ (document.body.querySelector('[data-ren-root]')).innerHTML;
        $dispose(root);
      } catch (error) {
        // happy-dom names some DOMExceptions DOMException (a browser's outerText throws NoModificationAllowedError):
        // a DOMException matches any DOMException, by its kind; html.test.jsx asserts the names.
        dom = `throws ${error instanceof window.DOMException ? 'DOMException' : /** @type {Error} */ (error).name}`;
      }
      document.body.innerHTML = '';
      let html;
      try {
        html = (await $html(view, { styles: false })).replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '');
      } catch (error) {
        html = `throws ${error instanceof DOMException ? 'DOMException' : /** @type {Error} */ (error).name}`;
      }
      if (dom === html) {
        if (before.href !== undefined && !html.includes(ABSOLUTE)) edited++;
        continue;
      }
      const key = KNOWN[`${tag}.${prop}`] !== undefined ? `${tag}.${prop}` : KNOWN[`*.${prop}`] !== undefined ? `*.${prop}` : null;
      if (key === null) unknown.push(`${tag}.${prop}=${JSON.stringify(value)}: ren-dom ${dom}, $html ${html}`);
      else seen.add(key);
    }
  for (const [name, view] of Object.entries(TEMPLATES)) {
    const root = Root({ id: 'page', target: document.body, renderer: $dom(/** @type {any} */ (document), { styles: false }), storage: null, locks: null, children: view });
    // A static page shows a textarea's typed value (README): the browser's markup, with that value as its text.
    for (const area of document.body.querySelectorAll('textarea')) if (area.value !== area.textContent) area.textContent = area.value;
    const dom = /** @type {Element} */ (document.body.querySelector('[data-ren-root]')).innerHTML;
    $dispose(root);
    document.body.innerHTML = '';
    const html = (await $html(view, { styles: false })).replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '');
    if (dom !== html) unknown.push(`template ${name}: ren-dom ${dom}, $html ${html}`);
  }
  for (const [name, list] of Object.entries(SHAPES)) {
    const view = () => <Shape shapes={list} width={10} height={10} />;
    const root = Root({ id: 'page', target: document.body, renderer: $dom(/** @type {any} */ (document), { styles: false }), storage: null, locks: null, children: view });
    const dom = /** @type {Element} */ (document.body.querySelector('[data-ren-root]')).innerHTML;
    $dispose(root);
    document.body.innerHTML = '';
    const html = (await $html(view, { styles: false })).replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '');
    if (dom !== html) unknown.push(`Shape ${name}: ren-dom ${dom}, $html ${html}`);
  }
  assert.deepEqual(unknown, []);
  assert.equal(edited, 2 * Object.keys(PARTS).length, 'every URL part edits the absolute href, in both');
  assert.deepEqual(Object.keys(KNOWN).filter(key => !seen.has(key)), [], 'a known difference that no longer differs');
});
