// What would run script is never in the markup (security), as ren-dom never
// writes it in a browser: a javascript: URL in any URL attribute (any case,
// leading controls and spaces, tabs and line breaks inside, as a browser's
// URL parser reads it), an href a URL part makes javascript:, an iframe's
// srcdoc, an SVG animation's javascript: value, and an event handler given
// as a string (any on* name, any case, on HTML, SVG and MathML elements).
// Each view's markup is ren-dom's on happy-dom (the two agree), and parse5
// reads it back as a browser's parser does: no attribute it reads runs
// script. A character reference in a value stays text: its & is escaped.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { parse } from 'parse5';
import { Root, $settle, $dispose } from 'ren-core';
import { $dom } from 'ren-dom';
import { $html } from 'ren-html';

/** Whether a URL is javascript: as a browser's URL parser reads it. @param {string} url */
const scripted = url => /^javascript:/i.test(url.replace(/^[\u0000- ]+/, '').replace(/[\t\n\r]/g, ''));

/** javascript: URLs as a browser's URL parser reads them. */
const SCRIPTED = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' \u0001javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)', 'java\rscript:alert(1)'];

const A = /** @type {any} */ ('a');
const Use = /** @type {any} */ ('use');
const Animate = /** @type {any} */ ('animate');
const SetTag = /** @type {any} */ ('set');
const MathTag = /** @type {any} */ ('math');
const Mi = /** @type {any} */ ('mi');

/** Views of each URL attribute given `url`. @type {((url: string) => any)[]} */
const LINKS = [
  url => <a href={url}>x</a>,
  url => <map><area href={url} /></map>,
  url => <link rel="stylesheet" href={url} />,
  url => <form action={url}><button formAction={url}>b</button><input type="submit" formaction={url} /></form>,
  url => <iframe src={url} />,
  url => <object data={url} codeBase={url} />,
  url => <video poster={url} src={url} />,
  url => <blockquote cite={url}>q</blockquote>,
  url => <table background={url} />,
  url => <svg><A href={url}><text>x</text></A><Use href={url} /></svg>,
  url => <svg><A {...{ 'xlink:href': url }}><text>x</text></A></svg>,
  url => <MathTag href={url}><Mi>x</Mi></MathTag>,
  url => <a {...{ HREF: url }}>x</a>,
];

/** Handlers given as strings, on every kind of element. */
const HANDLERS = () => (
  <div>
    <p onclick="alert(1)">a</p>
    <img onerror="alert(1)" src="x.png" />
    <p {...{ ONCLICK: 'alert(1)', Onmouseover: 'alert(2)', onfoo: 'x', 'onclicK': 'alert(3)' }}>b</p>
    <body onload="alert(1)" />
    <svg onload="alert(1)">
      <circle onclick="alert(1)" />
      <A {...{ onclick: 'alert(1)' }}>
        <text>x</text>
      </A>
    </svg>
    <MathTag onclick="alert(1)">
      <Mi onmouseover="alert(1)">x</Mi>
    </MathTag>
  </div>
);

/**
 * The view's markup from ren-dom on happy-dom: the host element's HTML.
 * @param {import('node:test').TestContext} t @param {any} view
 */
async function inBrowser(t, view) {
  const window = new Window();
  /** @type {{ window: Window | null }} */
  const slot = { window };
  t.after(() => {
    const open = slot.window;
    slot.window = null;
    return open?.happyDOM.close();
  });
  const document = window.document;
  const root = Root({ id: 'page', target: document.body, renderer: $dom(/** @type {any} */ (document), { styles: false }), storage: null, locks: null, retire: false, sweep: false, children: view });
  await $settle(root);
  const html = document.body.innerHTML;
  $dispose(root);
  return html;
}

/** Every attribute a browser's parser reads from the markup, as [element, name, value]. @param {string} html */
function attributes(html) {
  /** @type {[string, string, string][]} */
  const out = [];
  const walk = (/** @type {any} */ n) => {
    if (n.tagName !== undefined) for (const a of n.attrs) out.push([n.tagName, a.prefix ? `${a.prefix}:${a.name}` : a.name, a.value]);
    for (const c of n.childNodes ?? []) walk(c);
    if (n.content !== undefined) walk(n.content);
  };
  walk(parse(`<!doctype html><html><head></head><body>${html}</body></html>`));
  return out;
}

/** Fails when the markup holds what runs script once parsed. @param {string} html */
function inert(html) {
  for (const [tag, name, value] of attributes(html)) {
    assert.ok(!/^on/i.test(name), `${tag} ${name}="${value}": a handler in ${html}`);
    assert.ok(name !== 'srcdoc', `${tag} srcdoc in ${html}`);
    assert.ok(!value.split(';').some(scripted), `${tag} ${name}="${value}": a javascript: URL in ${html}`);
  }
}

describe('ren html security', () => {
  it('writes no javascript: URL in any URL attribute, as ren-dom writes none', async t => {
    for (const view of LINKS)
      for (const url of SCRIPTED) {
        const html = await $html(() => view(url), { styles: false });
        assert.equal(html, await inBrowser(t, () => view(url)), `ren-dom's markup: ${JSON.stringify(url)}`);
        inert(html);
        assert.ok(!/script:/i.test(html.replace(/[\t\n\r]/g, '')), html);
      }
    // What a browser does not read as javascript: is written as given; a character reference is text, its & escaped.
    for (const url of ['https://example.com/', '/javascript:x', ' javascript:x', '&#106;avascript:alert(1)', 'java&#x09;script:alert(1)']) {
      const html = await $html(() => <a href={url}>x</a>, { styles: false });
      // A browser serializes a no-break space as &nbsp;, happy-dom as itself.
      assert.equal(html.replace(/&nbsp;/g, '\u00a0'), await inBrowser(t, () => <a href={url}>x</a>));
      assert.deepEqual(attributes(html).find(([tag]) => tag === 'a'), ['a', 'href', url], 'read back as the text given');
      inert(html);
    }
  });

  it('drops an href a URL part makes javascript:, and writes no srcdoc', async t => {
    const view = () => (
      <div>
        <a href="mailto:alert(1)" protocol="javascript:">a</a>
        <map><area href="mailto:alert(1)" protocol="JavaScript:" /></map>
        <a href="https://example.com/p" pathname="/q">b</a>
        <iframe srcdoc="<script>alert(1)</script>" />
        <iframe {...{ SRCDOC: '<img src=x onerror=alert(1)>' }} />
      </div>
    );
    const html = await $html(view, { styles: false });
    assert.equal(html, await inBrowser(t, view));
    assert.ok(html.includes('<div><a>a</a><map><area></map><a href="https://example.com/q">b</a><iframe></iframe><iframe></iframe></div>'), html);
    inert(html);
  });

  it('writes no javascript: value of an SVG animation', async t => {
    const view = () => (
      <svg>
        <A href="#a">
          <Animate attributeName="href" values="#a;javascript:alert(1)" />
          <SetTag attributeName="href" to=" JavaScript:alert(1)" />
          <SetTag attributeName="href" to="#b" />
          <text>x</text>
        </A>
      </svg>
    );
    const html = await $html(view, { styles: false });
    assert.equal(html, await inBrowser(t, view));
    assert.ok(html.includes('<svg><a href="#a"><animate attributeName="href"></animate><set attributeName="href"></set><set attributeName="href" to="#b"></set><text>x</text></a></svg>'), html);
    inert(html);
  });

  it('writes no on* string, any case, on an HTML, SVG or MathML element', async t => {
    const html = await $html(HANDLERS, { styles: false });
    assert.equal(html, await inBrowser(t, HANDLERS));
    assert.ok(html.includes('<div><p>a</p><img src="x.png"><p>b</p><body></body><svg><circle></circle><a><text>x</text></a></svg><math><mi>x</mi></math></div>'), html);
    inert(html);
    // A function handler is no markup.
    const fns = await $html(() => <div><button onclick={() => {}}>b</button><svg><circle onclick={() => {}} /></svg></div>, { styles: false });
    assert.ok(fns.includes('<div><button>b</button><svg><circle></circle></svg></div>'), fns);
  });
});
