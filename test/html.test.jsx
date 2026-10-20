// ren-html: one render to HTML, after the view's tasks settle. The markup
// must equal what ren-dom makes in a (happy-dom) browser document for the
// same view: primitives, HTML and SVG, lists, regions, Pending and text.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { Root, $keys, $scrolls, $read, $effect, $pending, $task, $settle, $dispose, $lookup, $context, $active, For, Show, Pending, Recover, View, Layout, Label, Action, Edit, Image, Shape, Props } from 'ren-core';
import { $dom } from 'ren-dom';
import { $html, Document, serialize } from 'ren-html';
import { parse } from 'parse5';

const Theme = $context('light');

/** A page with a bit of everything, and a part that loads. */
function Page() {
  const users = $task($active(), () => 1, (_, complete) => void setTimeout(() => complete({ ok: true, value: ['Ada', 'Grace'] }), 5)); // timer: feature: the task stands for slow I/O
  return (
    <View gap={8} pad={12}>
      <Label text={() => `hello ${$lookup(Props)?.name ?? 'nobody'} <&> "q"`} />
      <Layout layout="row" gap={4}>
        <Action text="Save" />
        <Edit label="Name" />
      </Layout>
      <Image source="/logo.png" label="logo" />
      <Shape shapes={[{ kind: 'rect', x: 0, y: 0, right: 10, bottom: 10, fill: 0xff123456 }]} width={10} height={10} />
      <ul class="list" style={{ marginTop: 4, color: 'red' }}>
        <For each={() => ['a', 'b', 'c']}>{item => <li data-item={item}>{item}</li>}</For>
      </ul>
      <input type="checkbox" disabled />
      <p>theme {() => $lookup(Theme)}</p>
      <Show when={() => true} fallback={<i>no</i>}>
        <b>shown</b>
      </Show>
      <Recover fallback={() => <p>failed</p>}>
        <Pending fallback={<p>loading…</p>}>
          <ol>
            <For each={() => $read(users)}>{name => <li>{name}</li>}</For>
          </ol>
        </Pending>
      </Recover>
    </View>
  );
}

/**
 * ren-html's markup less the inline prefixed declarations happy-dom's CSSOM
 * drops (a browser drops those it does not know; Safari knows all three),
 * which an application root's host element and an Edit write.
 * @param {string} html
 */
const known = html => html.replace(/ style="[^"]*"/g, style => style.replace(/ ?-webkit-(?:user-select|touch-callout|tap-highlight-color): [^;"]*;/g, ''));

/**
 * The same view in ren-dom on happy-dom, once settled: the host element's
 * HTML. The window closes after the test, so a failure midway still frees it;
 * node:test keeps every hook to the end of the run, so the hook holds the
 * window in a slot it clears once closed.
 * @param {import('node:test').TestContext} t @param {any} options @param {any} [view]
 */
async function inBrowser(t, options, view = () => <Page />) {
  const window = new Window();
  /** @type {{ window: Window | null }} */
  const slot = { window };
  t.after(() => {
    const open = slot.window;
    slot.window = null;
    return open?.happyDOM.close();
  });
  const document = window.document;
  const root = Root({ id: 'page', target: document.body, renderer: $dom(document), storage: null, locks: null, retire: false, sweep: false, ...options, children: view });
  await $settle(root);
  const html = document.body.innerHTML;
  $dispose(root);
  return html;
}

describe('ren-html', () => {
  it('renders the markup ren-dom makes in a browser, after the tasks settle', async (/** @type {import('node:test').TestContext} */ t) => {
    const options = { props: { name: 'server' }, provide: /** @type {any} */ ([[Theme, 'dark']]) };
    const html = await $html(() => <Page />, options);
    assert.ok(html.includes('<li>Ada</li><li>Grace</li>'), 'the async list was awaited');
    assert.ok(!html.includes('loading…'), 'no fallback left');
    assert.ok(html.includes('hello server &lt;&amp;&gt; "q"'), 'text escaped');
    assert.ok(html.includes('theme dark'));
    assert.ok(html.startsWith('<div data-ren-root="page"'), 'the root element with its id');
    assert.ok(html.includes('<style data-ren-style="page">'), 'the primitives\' scoped styles');
    assert.equal(known(html), await inBrowser(t, options), 'the same markup as ren-dom in a browser document');
  });

  it('writes styles, null props and boolean aria as ren-dom does: px but for unitless and prefixed keys, no attribute for null, "false"', async () => {
    const html = await $html(() => (
      <div>
        <p style={{ WebkitLineClamp: 2, borderWidth: 1, flexBasis: 100, columnCount: 2, 'margin-top': 4 }} />
        <View style={{ borderWidth: 2, columnCount: 3 }} />
        <a id={null} title={undefined} href={null} tabIndex={undefined} download={null}>f</a>
        <button aria-expanded={false} aria-hidden={true} />
        <View itemprop="gift" content={false} />
      </div>
    ), { styles: false });
    assert.ok(html.includes('<p style="-webkit-line-clamp: 2; border-width: 1px; flex-basis: 100px; column-count: 2; margin-top: 4px;"></p>'), html);
    assert.ok(/<div data-ren="View" style="[^"]*border-width: 2px; column-count: 3;"/.test(html), html);
    assert.ok(html.includes('<a>f</a>'), 'null and undefined write no attribute');
    assert.ok(html.includes('<button aria-expanded="false" aria-hidden="true"></button>'));
    assert.ok(html.includes('itemprop="gift" content="false"'));
  });

  it('renders hover, press and focus styles as ren-dom does in a browser', async (/** @type {import('node:test').TestContext} */ t) => {
    const view = () => (
      <View>
        <Action text="Go" style={{ hover: { background: 0xffff0000 } }} />
        <Action text="Push" style={{ press: { background: 0xff00ff00 } }} />
        <Edit label="Name" style={{ focus: { background: 0xff0000ff } }} />
      </View>
    );
    const html = await $html(view);
    assert.ok(html.includes('data-ren-state='), 'the state classes are in the markup');
    assert.equal(known(html), await inBrowser(t, {}, view));
  });

  it('renders a view that listens for keys and scrolls, as ren-dom does', async (/** @type {import('node:test').TestContext} */ t) => {
    const view = () => {
      $keys(() => {});
      $scrolls(() => {});
      return <Label text="k" />;
    };
    assert.equal(known(await $html(view)), await inBrowser(t, {}, view));
  });

  it("writes an application's behavior, prefixed for Safari too, and a page's none, as ren-dom's behavior option", async () => {
    const view = () => (
      <View>
        <Edit label="q" />
        <Label text="opted" style={{ select: 'text' }} />
      </View>
    );
    const app = await $html(view, { styles: false });
    assert.ok(app.includes('user-select: none; -webkit-user-select: none; cursor: default; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;'), app);
    assert.ok(/<input data-ren="Edit" [^>]*user-select: text; -webkit-user-select: text; cursor: text;/.test(app), 'an Edit is selectable with the I-beam');
    assert.ok(app.includes('user-select: text; -webkit-user-select: text; cursor: auto;'), "a style's select: 'text'");
    const page = await $html(view, { styles: false, behavior: 'page' });
    assert.ok(!/<div data-ren-root="page" [^>]*user-select/.test(page) && !page.includes('cursor: default') && !page.includes('touch-callout'), page);
    const select = await $html(view, { styles: false, behavior: { like: 'app', select: true } });
    assert.ok(!/<div data-ren-root="page" [^>]*user-select/.test(select) && select.includes('cursor: default;'), 'one switch on its own');
  });

  // A browser keeps these as properties, out of its markup; a static page
  // needs them in it.
  it('keeps a <style> after an svg whose children made nothing in HTML, its CSS raw', async () => {
    const Nothing = () => null;
    const html = await $html(() => <div><svg><Nothing /></svg><style>{'a > b { color: red }'}</style></div>, { styles: false });
    assert.ok(html.includes('<svg></svg><style>a > b { color: red }</style>'), html);
  });

  it('writes a primitive\'s tabIndex and inert as ren-dom does in a browser', async (/** @type {import('node:test').TestContext} */ t) => {
    const view = () => (
      <View tabIndex={-1} inert={false}>
        <View inert><Action text="off" tabIndex={0} /></View>
        <Action text="skip" tabIndex={-1} />
      </View>
    );
    const html = await $html(view);
    assert.ok(/<div data-ren="View" [^>]*tabindex="-1"/.test(html), html);
    assert.equal((html.match(/ inert=""/g) ?? []).length, 1, 'inert only while true');
    assert.equal(known(html), await inBrowser(t, {}, view), 'the same markup as ren-dom in a browser document');
  });

  it("writes a primitive's dir as ren-dom does in a browser", async (/** @type {import('node:test').TestContext} */ t) => {
    const view = () => (
      <View dir="rtl">
        <Label text={'שלום'} />
        <Edit dir="auto" />
        <Action text="ok" dir={null} />
      </View>
    );
    const html = await $html(view);
    assert.ok(/<div data-ren="View" [^>]*dir="rtl"/.test(html), html);
    assert.ok(/<input [^>]*dir="auto"/.test(html), html);
    assert.equal((html.match(/ dir="/g) ?? []).length, 2, 'written where given, inherited below');
    assert.equal(known(html), await inBrowser(t, {}, view), 'the same markup as ren-dom in a browser document');
  });

  it('keeps form values and flags in the markup', async () => {
    const html = await $html(() => (
      <form>
        <input name="q" value="ren & co" />
        <textarea value="line <1>" />
        <input type="checkbox" checked={true} />
        <select>
          <option selected>one</option>
        </select>
      </form>
    ), { styles: false });
    assert.match(html, /<input name="q" value="ren &amp; co">/);
    assert.match(html, /<textarea>line &lt;1&gt;<\/textarea>/);
    assert.match(html, /<input type="checkbox" checked="">/);
    assert.match(html, /<option selected="">one<\/option>/);
  });

  it('shows the Recover fallback of a failed task, and times out on one that never completes', async () => {
    const failing = await $html(() => {
      const t = $task($active(), () => 1, (_, complete) => void setTimeout(() => complete({ ok: false, error: new Error('down') }), 1)); // timer: feature: the task stands for slow I/O
      return (
        <Recover fallback={(/** @type {Error} */ e) => <p>failed: {e.message}</p>}>
          <p>{() => $read(t)}</p>
        </Recover>
      );
    }, { styles: false });
    assert.match(failing, /failed: down/);
    await assert.rejects(
      $html(() => {
        const t = $task($active(), () => 1, () => {});
        return <p>{() => $read(t)}</p>;
      }, { timeout: 30 }),
      /did not settle within 30 ms/,
    );
  });

  it("waits for a nested root's tasks too, and rejects with a nested root's failure", async () => {
    /** A nested root whose task completes after `ms`. @param {any} value @param {number} ms */
    const Inner = (value, ms) => () => {
      const t = $task($active(), () => 1, (_, complete) => void setTimeout(() => complete(value instanceof Error ? { ok: false, error: value } : { ok: true, value }), ms)); // timer: feature: the task stands for slow I/O
      return <p>{() => String($read(t))}</p>;
    };
    const html = await $html(
      () => (
        <section>
          <Root id="inner">{Inner('inner-done', 20)}</Root>
          <p>outer</p>
        </section>
      ),
      { styles: false },
    );
    assert.match(html, /<p>inner-done<\/p>/);
    await assert.rejects($html(() => <Root id="inner">{Inner(new Error('inner down'), 5)}</Root>, { styles: false }), /inner down/);
  });

  it('sets the theme as custom properties on the root element only', async () => {
    const html = await $html(() => <Label text="x" />, { theme: { accent: 0xff112233 } });
    assert.match(html, /^<div data-ren-root="page" style="[^"]*--ren-accent: rgba\(17, 34, 51, 1\);/);
  });

  it('marks the option of a select\'s value selected, as select.value does', async () => {
    const html = await $html(() => (
      <select name="size" value="m">
        <option selected>s</option>
        <optgroup label="more">
          <option value="m">medium</option>
          <option>l</option>
        </optgroup>
      </select>
    ), { styles: false });
    assert.match(html, /<select name="size"><option>s<\/option><optgroup label="more"><option value="m" selected="">medium<\/option><option>l<\/option><\/optgroup><\/select>/);
    const select = new Document().createElement('select');
    select.value = 'x';
    assert.equal(select.value, '', 'no option has the value');
    assert.equal(select.getAttribute('value'), null, 'no value attribute');
  });

  it('keeps a semicolon inside quotes or parentheses in its style declaration', async () => {
    const html = await $html(() => <p style={'background: url("data:image/png;base64,AAA") no-repeat; color: red'}>x</p>, { styles: false });
    assert.match(html, /<p style="background: url\(&quot;data:image\/png;base64,AAA&quot;\) no-repeat; color: red;">x<\/p>/);
  });

  it('drops an inline style declaration a browser\'s CSSOM drops, as ren-dom does there (security)', async (/** @type {import('node:test').TestContext} */ t) => {
    // A value that is not one declaration's would add declarations of its
    // own (a fixed overlay, a remote url); a browser's CSSOM drops it.
    /** @type {Record<string, Record<string, string>>} */
    const same = {
      'more declarations': { color: 'red; position: fixed; inset: 0; background: url(https://attacker.example/x)', margin: '1px' },
      'a brace': { color: 'red}', margin: '1px' },
      'a name that is none': { 'x}{': '1', color: 'blue' },
      'an open comment': { color: 'red /* x', margin: '1px' },
      'an open parenthesis': { width: 'calc(1px', margin: '1px' },
      'a newline': { color: 'red\nblue', margin: '1px' },
      'a priority in the value': { color: 'red !important', margin: '1px' },
      'a semicolon in a url string': { backgroundImage: 'url("a;b.png")' },
    };
    for (const [what, style] of Object.entries(same)) {
      const view = () => <p style={style}>x</p>;
      assert.equal(known(await $html(view)), await inBrowser(t, {}, view), what);
    }
    // A name that only ends in url (rurl(, #url(, @url() is a block to a browser, so a bracket in it is no url's;
    // escaped, it is the same name (#u\rl(, #u\72 l(), and its ';' is a block's.
    for (const value of ['rurl([)', '#url([)', '@url([)', '#u\\rl(x;y)', '@u\\72 l(x;y)', '#\\75rl(x;y)']) {
      const el = new Document().createElement('p');
      el.style.setProperty('--x', value);
      assert.equal(el.getAttribute('style'), null, value);
    }
    // A priority smuggled in by an escape (a browser reads !\important as !important): no
    // value takes a '!' outside a string, so it is dropped; a cssText priority stays one.
    for (const value of ['red !\\important', 'red !\\69mportant', 'red !i\\mportant', 'red !']) {
      const el = new Document().createElement('p');
      el.style.setProperty('color', value);
      assert.equal(el.getAttribute('style'), null, value);
      el.setAttribute('style', `color: ${value}; margin: 1px`);
      assert.equal(el.getAttribute('style'), 'margin: 1px;', value);
    }
    const kept = new Document().createElement('p');
    kept.setAttribute('style', 'color: red !important; margin: 1px ! important; content: "!"');
    assert.equal(kept.getAttribute('style'), 'color: red !important; margin: 1px ! important; content: "!";');
    kept.style.setProperty('color', 'red ! important');
    assert.equal(kept.style.getPropertyValue('color'), 'red !important', 'a priority in setProperty\'s value is none');
    // Where happy-dom keeps what a browser drops: a custom property's value
    // with a top-level ';', and an open string (dropped here, the safe way).
    const html = await $html(() => <p style={{ '--brand': 'x; position: fixed', fontFamily: '"abc', margin: '1px' }}>x</p>, { styles: false });
    assert.ok(html.includes('<p style="margin: 1px;">x</p>'), html);
    // Style strings a browser's CSS tokenizer reads as one declaration each (a
    // block, a comment, a string a newline ends): nothing of them may become a
    // declaration of its own. happy-dom's CSSOM reads the markup written, and
    // must find no declaration but the first's (its own reading of the first
    // string keeps position, as a browser does not, so it is no oracle for it).
    /** @type {{ window: Window | null }} */
    const slot = { window: new Window() };
    t.after(() => {
      const open = slot.window;
      slot.window = null;
      return open?.happyDOM.close();
    });
    const cssom = (/** @type {string} */ text) => {
      const el = /** @type {Window} */ (slot.window).document.createElement('p');
      el.setAttribute('style', text);
      return el.style.cssText;
    };
    for (const text of ['color: x{;position:fixed;inset:0}', 'color: red /*; position: fixed; */ x: y', 'color: [; position: fixed]', 'content: \"x\n; b: 1\"; position: fixed']) {
      const html = await $html(() => <p style={text}>x</p>, { styles: false });
      const written = /<p(?: style="([^"]*)")?>x<\/p>/.exec(html)?.[1] ?? '';
      const style = written.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      assert.ok(!/position/.test(cssom(style)), `${JSON.stringify(text)}: ${cssom(style)}`);
      assert.ok(cssom(style) === '' || /^(color|content): /.test(cssom(style)), `${JSON.stringify(text)}: ${cssom(style)}`);
    }
    // A style string, through cssText: each declaration checked on its own; a
    // '{' opens a block that runs to the end, as a browser's tokenizer reads it.
    const text = await $html(() => <p style={'color: red; background: url(a;b.png); width: calc(1px; x}{: 1; margin: 1px'}>x</p>, { styles: false });
    assert.ok(text.includes('<p style="color: red; background: url(a;b.png);">x</p>'), text);
  });

  it('refuses attribute and tag names that would break out of their tag', async () => {
    const invalid = { name: 'InvalidCharacterError' };
    await assert.rejects($html(() => <p {...{ 'x" onload="alert(1)': 'y' }}>x</p>), invalid);
    const document = new Document();
    for (const name of ['x" onload="alert(1)', 'a>b', 'a/b', 'a=b', "a'b", '']) assert.throws(() => document.createElement('p').setAttribute(name, ''), invalid, name);
    assert.throws(() => document.createElement('p onclick=x'), invalid);
    assert.throws(() => document.createElementNS('http://www.w3.org/2000/svg', 'g><script'), invalid);
    document.createElement('p').setAttribute('data-ok:x_1', '');
    // A tag starts with an ASCII letter, as a browser's createElement requires: `<!--x>` would open a comment
    // a later raw style could close, making its text markup.
    const tag = /^InvalidCharacterError: REN html: ".*" is not a valid tag name/;
    for (const name of ['!--x', '?x', '!x', '1x', '-x']) {
      assert.throws(() => document.createElement(name), tag, name);
      assert.throws(() => document.createElementNS('http://www.w3.org/2000/svg', name), tag, name);
    }
    const Tag = /** @type {any} */ ('!--x');
    await assert.rejects($html(() => <div><Tag /><style>{'--><img src=x onerror=alert(1)>'}</style></div>, { styles: false }), tag);
    // A C0 control (ESC could switch an ISO-2022-JP page) or DEL in a name is refused too.
    for (const name of ['a\x1b$B', 'a\x01', 'a\x7f']) {
      assert.throws(() => document.createElement('p').setAttribute(name, ''), invalid, JSON.stringify(name));
      assert.throws(() => document.createElement(`x${name}`), tag, JSON.stringify(name));
    }
    await assert.rejects($html(() => <p {...{ 'a\x1b$B': '1' }}>x</p>), invalid);
    document.createElement('x-1');
    document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
  });

  it('keeps style and script text from closing its element early', async () => {
    const html = await $html(() => (
      <div>
        <style>{'p { color: red } </style><img src=x onerror=alert(1)>'}</style>
        <script type="application/json">{'{"a": "</SCRIPT ><b>", "b": "</p>"}'}</script>
      </div>
    ), { styles: false });
    assert.match(html, /<style>p \{ color: red \} <\\\/style><img src=x onerror=alert\(1\)><\/style>/);
    assert.match(html, /<script type="application\/json">\{"a": "<\\\/SCRIPT ><b>", "b": "<\/p>"\}<\/script>/);
    assert.deepEqual(JSON.parse(/<script[^>]*>(.*)<\/script>/.exec(html)?.[1] ?? ''), { a: '</SCRIPT ><b>', b: '</p>' }, 'the same data to a script');
  });

  it('keeps the leading newline of a textarea, pre or listing through a parse', async () => {
    // The parser drops one newline right after these start tags: a text
    // starting with one is written with another before it.
    const html = await $html(() => (
      <div>
        <textarea value={'\nfirst'} />
        <pre>{'\nlead'}</pre>
        <listing>{'\n\ntwo'}</listing>
        <pre>none</pre>
        <pre><b>{'\nin b'}</b></pre>
      </div>
    ), { styles: false });
    assert.ok(html.includes('<textarea>\n\nfirst</textarea><pre>\n\nlead</pre><listing>\n\n\ntwo</listing><pre>none</pre><pre><b>\nin b</b></pre>'), JSON.stringify(html));
    // happy-dom's parser keeps that newline, unlike the HTML parser's rule and
    // a browser's, so the markup is checked as the parser needs it.
  });

  it('keeps <!-- in script text from swallowing the rest of the page', async () => {
    // `<!--<script` in a script puts the parser in its double-escaped state:
    // the script's end tag no longer ends it, and the page after is swallowed.
    const data = { '@type': 'Product', name: '<!--<script>', note: 'a <!-- b' };
    const html = await $html(() => (
      <div>
        <script type="application/ld+json">{JSON.stringify(data)}</script>
        <p>after</p>
      </div>
    ), { styles: false });
    assert.ok(!html.includes('<!--'), html);
    const text = /<script type="application\/ld\+json">(.*?)<\/script><p>after<\/p>/.exec(html)?.[1] ?? '';
    assert.equal(text, '{"@type":"Product","name":"\\u003C!--<script>","note":"a \\u003C!-- b"}');
    assert.deepEqual(JSON.parse(text), data, 'the same data to a JSON reader');
    assert.equal(new Function(`return ${text}`)().name, '<!--<script>', 'and to a script');
  });

  it('escapes style and script text under an element whose content a parser does not read as tags (security)', async () => {
    // Under each of these the parser's tokenizer is out of its data state
    // (raw text, RCDATA, plaintext) or its insertion mode ignores the tags
    // (in select): a style's raw text there could end the element and start
    // markup of its own.
    const img = '<img src=x onerror=alert(1)>';
    const esc = (/** @type {string} */ s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    /** @type {[string, () => any, string][]} */
    const shapes = [
      ['noscript', () => <noscript><style>{`</noscript>${img}`}</style></noscript>, `<noscript><style>${esc(`</noscript>${img}`)}</style></noscript>`],
      ['xmp', () => <xmp><style>{`</xmp>${img}`}</style></xmp>, `<xmp><style>${esc(`</xmp>${img}`)}</style></xmp>`],
      ['iframe', () => <iframe><script>{`</iframe>${img}`}</script></iframe>, `<iframe><script>${esc(`</iframe>${img}`)}</script></iframe>`],
      ['noembed', () => <noembed><style>{`</noembed>${img}`}</style></noembed>, `<noembed><style>${esc(`</noembed>${img}`)}</style></noembed>`],
      ['noframes', () => <noframes><style>{`</noframes>${img}`}</style></noframes>, `<noframes><style>${esc(`</noframes>${img}`)}</style></noframes>`],
      ['textarea', () => <textarea><style>{`</textarea>${img}`}</style></textarea>, `<textarea><style>${esc(`</textarea>${img}`)}</style></textarea>`],
      ['title', () => <title><script>{`</title>${img}`}</script></title>, `<title><script>${esc(`</title>${img}`)}</script></title>`],
      ['plaintext', () => <plaintext><style>{img}</style></plaintext>, `<plaintext><style>${esc(img)}</style></plaintext>`],
      ['select', () => <select><style>{`<script>alert(1)</script>`}</style></select>, `<select><style>${esc('<script>alert(1)</script>')}</style></select>`],
      ['select > option', () => <select><option><style>{img}</style></option></select>, `<select><option><style>${esc(img)}</style></option></select>`],
      ['select in a table', () => <table><tbody><tr><td><select><script>{`</script>${img}`}</script></select></td></tr></tbody></table>, `<select><script>${esc(`</script>${img}`)}</script></select>`],
    ];
    for (const [shape, view, markup] of shapes) {
      const html = await $html(() => <div>{view()}</div>, { styles: false });
      assert.ok(html.includes(markup), `${shape}: ${html.slice(html.indexOf('<div><') + 5, -6)}`);
      assert.ok(!html.includes('<img') && !html.includes('<script>alert'), `${shape}: no markup of the text's own`);
    }
  });

  it('refuses a prop named as a node\'s own field, as a browser\'s getter-only one does (security)', async () => {
    // ren-dom writes any prop that is `in` a node; a node's own fields are
    // getters with no setter, so the write throws instead of changing what
    // the serializer writes.
    const fields = ['localName', 'namespaceURI', 'nodeType', 'tagName', 'attributes', 'parentNode', 'firstChild', 'lastChild', 'nextSibling', 'previousSibling', 'ownerDocument', 'childNodes', 'outerHTML'];
    for (const field of fields) {
      const Tag = /** @type {any} */ ('div');
      await assert.rejects($html(() => <Tag {...{ [field]: 'img src=x onerror=alert(1)' }} />, { styles: false }), TypeError, field);
      assert.throws(() => (/** @type {any} */ (new Document().createElement('p')))[field] = 'x', TypeError, field);
    }
    for (const field of ['nodeType', 'defaultView', 'body']) assert.throws(() => (/** @type {any} */ (new Document()))[field] = 'x', TypeError, field);
    for (const field of ['nodeType', 'parentNode', 'nextSibling', 'ownerDocument']) assert.throws(() => (/** @type {any} */ (new Document().createTextNode('t')))[field] = 'x', TypeError, field);
    // The sweep's three: a live img from localName, markup from attributes, a crash from a string there.
    const Div = /** @type {any} */ ('div');
    await assert.rejects($html(() => <Div localName="img src=x onerror=alert(1)" />), TypeError);
    await assert.rejects($html(() => <Div attributes={[['x"><script>alert(1)</script', '']]} />), TypeError);
    await assert.rejects($html(() => <Div attributes="abc" />), TypeError);
    // The fields that are the markup's are not reachable as properties at all.
    const el = /** @type {any} */ (new Document().createElement('div'));
    for (const field of ['styles', 'choice', 'map', 'owner', 'attribute']) assert.equal(field in el, false, field);
    // A style string sets the style, as a browser's.
    el.style = 'color: red';
    assert.equal(el.getAttribute('style'), 'color: red;');
  });

  it('writes no event handler attribute from a string, as ren-dom in a browser does not (security)', async (/** @type {import('node:test').TestContext} */ t) => {
    // In a browser on* names are properties (GlobalEventHandlers,
    // WindowEventHandlers): ren-dom sets them, and a string there is null, so
    // no attribute is written. happy-dom has these, but for body's onload.
    const same = {
      onclick: () => <button onclick="alert(1)">x</button>,
      onerror: () => <img onerror="alert(1)" src="x" />,
      onfocus: () => <div onfocus="alert(1)" tabIndex={0} />,
      onpointerdown: () => <div onpointerdown="alert(1)">x</div>,
    };
    // Engine handler properties a browser has too (happy-dom lacks them): no attribute either.
    for (const name of ['onmousewheel', 'onsearch', 'onbeforecopy', 'onbeforecut', 'onbeforepaste', 'onbeforexrselect', 'oncontentvisibilityautostatechange', 'onscrollsnapchange', 'onscrollsnapchanging', 'onwebkitfullscreenchange', 'onwebkitfullscreenerror']) {
      const Tag = /** @type {any} */ ('div');
      const html = await $html(() => <Tag {...{ [name]: 'alert(1)' }} />, { styles: false });
      assert.ok(!html.includes('alert(1)'), `${name}: ${html}`);
    }
    for (const [name, view] of Object.entries(same)) {
      const html = await $html(view);
      assert.ok(!html.includes('alert(1)'), `${name}: ${html.slice(-80)}`);
      assert.equal(known(html), await inBrowser(t, {}, view), name);
    }
    // happy-dom lacks body's WindowEventHandlers; a browser writes none.
    const body = await $html(() => <body onload="alert(1)" onhashchange="alert(1)" class="k" />, { styles: false });
    assert.ok(body.includes('<body class="k"></body>'), body);
    const el = new Document().createElement('div');
    el.onclick = 'alert(1)';
    assert.equal(el.onclick, null);
    assert.equal(el.getAttribute('onclick'), null);
  });

  it('escapes style and script text in a tree that holds a frameset, parsed as a whole page (security)', async () => {
    // With no <body>, a frameset replaces the page's body; it, and the page
    // after it, ignore a style's or a script's start tag, so their raw text
    // would be tags: an <html> start tag there puts its attributes on the
    // page's own html element.
    const html = await $html(() => (
      <frameset>
        <style>{'<html onmouseover=alert(1)>'}</style>
      </frameset>
    ), { styles: false });
    const after = await $html(() => (
      <div>
        <frameset />
        <script>{'</frameset></html><html onload=alert(1)>'}</script>
      </div>
    ), { styles: false });
    assert.ok(html.includes('<frameset><style>&lt;html onmouseover=alert(1)&gt;</style></frameset>'), html);
    assert.ok(after.includes('<frameset></frameset><script>&lt;/frameset&gt;&lt;/html&gt;&lt;html onload=alert(1)&gt;</script>'), after);
    // A frameset in the SVG namespace, under a foreignObject, is HTML to a parser: it counts too.
    const document = new Document();
    const top = document.createElement('div');
    const svg = top.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const fo = svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject'));
    fo.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'frameset'));
    top.appendChild(document.createElement('style')).appendChild(document.createTextNode('<html onmouseover=alert(1)>'));
    const foreign = serialize(top);
    assert.ok(foreign.endsWith('<style>&lt;html onmouseover=alert(1)&gt;</style></div>'), foreign);
    for (const markup of [html, after, foreign]) {
      const page = parse(`<!doctype html>${markup}`, { scriptingEnabled: true });
      const root = /** @type {any} */ (page.childNodes.find((/** @type {any} */ n) => n.tagName === 'html'));
      assert.deepEqual(root.attrs.map((/** @type {any} */ a) => a.name), [], 'no attribute on the page\'s own html element');
    }
  });

  it('writes raw text only in HTML context, joined and escaped once (security)', async () => {
    // Cases a parse5-oracle fuzz of random svg, math and HTML nesting with
    // split hostile text found or guards (the serializer's contract).
    const img = '<img src=x onerror=alert(1)>';
    const esc = '&lt;img src=x onerror=alert(1)&gt;';
    /** @type {[string, () => any, string][]} */
    const table = [
      ['a math style is foreign: escaped', () => <math><style>{img}</style></math>, `<math><style>${esc}</style></math>`],
      ['a math script is foreign: escaped', () => <math><script>{img}</script></math>, `<math><script>${esc}</script></math>`],
      ['under a math integration point: escaped, the safe direction', () => <math><mi><style>{'a > b'}</style></mi></math>, '<math><mi><style>a &gt; b</style></mi></math>'],
      ['under an svg desc: escaped', () => <svg><desc><style>{'a > b'}</style></desc></svg>, '<svg><desc><style>a &gt; b</style></desc></svg>'],
      ['under an svg title: escaped', () => <svg><title><script>{img}</script></title></svg>, `<svg><title><script>${esc}</script></title></svg>`],
      ['a script end split across text children', () => <script>{'<'}{'/script>'}{img}</script>, `<script><\\/script>${img}</script>`],
      ['a style end split across text children', () => <style>{'</sty'}{'le>'}{img}</style>, `<style><\\/style>${img}</style>`],
      ['a script <!-- split across text children', () => <script>{'<!'}{'--<script>'}</script>, '<script>\\u003C!--<script></script>'],
      ['an HTML style stays raw', () => <style>{'a > b'}</style>, '<style>a > b</style>'],
      ['a textarea\'s leading CRLF', () => <textarea value={'\r\nfirst'} />, '<textarea>\n\r\nfirst</textarea>'],
      ['a pre\'s leading CR', () => <pre>{'\rlead'}</pre>, '<pre>\n\rlead</pre>'],
    ];
    for (const [name, view, markup] of table) {
      const html = await $html(() => <div>{view()}</div>, { styles: false });
      assert.ok(html.includes(`<div>${markup}</div>`), `${name}: ${JSON.stringify(html.slice(html.indexOf('<div><') + 5, -6))}`);
    }
  });

  it('escapes style and script text inside an svg, where the parser reads markup (security)', async () => {
    // Under <svg> the HTML parser reads a style's or a script's text as
    // markup: written raw, the img below would be a live element.
    const user = '<img src=x onerror=alert(1)>';
    const html = await $html(() => (
      <div>
        <svg>
          <style>{user}</style>
          <script>{user}</script>
          <g>
            <style>{'a > b {}'}</style>
          </g>
          <foreignObject>
            <style>{'a > b {}'}</style>
          </foreignObject>
        </svg>
      </div>
    ), { styles: false });
    const escaped = '&lt;img src=x onerror=alert(1)&gt;';
    assert.ok(html.includes(`<svg><style>${escaped}</style><script>${escaped}</script><g><style>a &gt; b {}</style></g>`), html);
    // Inside a foreignObject the content is HTML again, but the text is
    // escaped there too: the safe direction (the serializer's contract).
    assert.match(html, /<foreignObject><style>a &gt; b \{\}<\/style><\/foreignObject><\/svg>/i);
    assert.ok(!html.includes('<img'), 'no element a parser would make');
  });

  it('writes a no-break space as &nbsp; in text and attributes, as a browser does', async (/** @type {import('node:test').TestContext} */ t) => {
    const view = () => <p>{'x\u00a0y'}</p>;
    const html = await $html(view);
    assert.match(html, /<p>x&nbsp;y<\/p>/);
    assert.equal(known(html), await inBrowser(t, {}, view), 'the same markup as ren-dom in a browser document');
    // happy-dom leaves it raw in an attribute; browsers and the HTML
    // serialization algorithm write &nbsp; there too.
    assert.match(await $html(() => <p title={'a\u00a0b'}>x</p>, { styles: false }), /<p title="a&nbsp;b">x<\/p>/);
  });

  it('writes < and > as &lt; and &gt; in an attribute, as a browser does', async () => {
    // happy-dom leaves them raw in an attribute; current browsers write
    // &lt; and &gt; there (Chrome gives title="a&lt;b&gt;c&nbsp;d").
    assert.match(await $html(() => <p title={'a<b>c\u00a0d'}>x</p>, { styles: false }), /<p title="a&lt;b&gt;c&nbsp;d">x<\/p>/);
  });

  it('rejects with a failure a flush raises after a task completes', async () => {
    await assert.rejects($html(() => {
      const t = $task($active(), () => 1, (_, complete) => void Promise.resolve().then(() => complete({ ok: true, value: 5 })));
      $effect($active(), () => {
        if (!$pending(t) && $read(t) === 5) throw new Error('boom after load');
      });
      return null;
    }, { timeout: 500 }), /boom after load/);
  });

  it('writes an SVG attribute only under the name a parser reads back (security)', async () => {
    // An SVG attribute keeps its case, but the HTML parser lowercases a name
    // (adjusting the few SVG ones, viewBox): ONCLICK would come back a live
    // onclick, STYLE a style the inline checker never saw. Such a name is
    // inert in the DOM, so it is not written.
    const svg = 'http://www.w3.org/2000/svg';
    const document = new Document();
    const el = document.createElementNS(svg, 'svg');
    for (const [name, value] of [['ONCLICK', 'alert(1)'], ['STYLE', 'position: fixed'], ['Onload', 'alert(2)'], ['viewBox', '0 0 1 1'], ['VIEWBOX', '1'], ['fill', 'red'], ['preserveAspectRatio', 'none'], ['data-x', 'y']]) el.setAttribute(name, value);
    const markup = serialize(el);
    assert.equal(markup, '<svg viewBox="0 0 1 1" fill="red" preserveAspectRatio="none" data-x="y"></svg>');
    const back = parse(`<!doctype html><body>${markup}`);
    const names = [];
    const walk = (/** @type {any} */ n) => {
      if (n.tagName === 'svg') names.push(...n.attrs.map((/** @type {any} */ a) => a.name));
      for (const c of n.childNodes ?? []) walk(c);
    };
    walk(back);
    assert.deepEqual(names, ['viewBox', 'fill', 'preserveAspectRatio', 'data-x'], 'each read back under its own name');
    // Through a view too: the prop's case is kept on an SVG element, as ren-dom does.
    const html = await $html(() => <svg {...{ ONCLICK: 'alert(1)', STYLE: 'position: fixed' }} />, { styles: false });
    assert.ok(html.includes('<svg></svg>'), html);
  });

  it('writes no SVG attribute the parser reads back namespaced: xlink:href, xml:*, xmlns:* (security)', async () => {
    // ren-dom's xlink:href is a plain attribute of that name, inert; the parser
    // reads it back as the xlink href, a live link.
    const A = /** @type {any} */ ('a');
    const html = await $html(() => (
      <svg>
        <A {...{ 'xlink:href': 'javascript:alert(1)', 'xml:lang': 'en', 'xmlns:xlink': 'http://www.w3.org/1999/xlink', 'XLINK:HREF': 'javascript:alert(2)' }} href="/x">
          <text>x</text>
        </A>
      </svg>
    ), { styles: false });
    assert.ok(html.includes('<svg><a href="/x"><text>x</text></a></svg>'), html);
    const back = parse(`<!doctype html><body>${html}`);
    const links = [];
    const walk = (/** @type {any} */ n) => {
      if (n.tagName === 'a') links.push(...n.attrs.map((/** @type {any} */ a) => `${a.prefix ?? ''}:${a.name}=${a.value}`));
      for (const c of n.childNodes ?? []) walk(c);
    };
    walk(back);
    assert.deepEqual(links, [':href=/x']);
    // An integration point counts only under its own root: under svg an mi or mtext is SVG, under math a
    // foreignObject is MathML, an annotation-xml without an HTML encoding MathML: the link is still foreign.
    const X = /** @type {any} */ ('a');
    const Mi = /** @type {any} */ ('mi');
    const Mtext = /** @type {any} */ ('mtext');
    const Fo = /** @type {any} */ ('foreignObject');
    const Ann = /** @type {any} */ ('annotation-xml');
    const link = { 'xlink:href': 'javascript:alert(1)' };
    for (const view of [
      () => <svg><Mi><X {...link}>x</X></Mi></svg>,
      () => <svg><Mtext><X {...link}>x</X></Mtext></svg>,
      () => <math><Fo><X {...link}>x</X></Fo></math>,
      () => <math><Ann><X {...link}>x</X></Ann></math>,
      () => <math><Ann encoding="text/plain"><X {...link}>x</X></Ann></math>,
    ]) {
      const markup = await $html(view, { styles: false });
      assert.ok(!markup.includes('xlink:href'), markup.slice(markup.indexOf('<svg') < 0 ? markup.indexOf('<math') : markup.indexOf('<svg')));
    }
    // Its own root's point makes HTML again: an annotation-xml with an HTML encoding, an svg's foreignObject.
    const html3 = await $html(() => <math><Ann encoding="text/html"><div {...{ 'xml:lang': 'fr' }} /></Ann></math>, { styles: false });
    assert.ok(html3.includes('<math><annotation-xml encoding="text/html"><div xml:lang="fr"></div></annotation-xml></math>'), html3);
    // Outside foreign content (an HTML title, a div under a foreignObject) the parser reads them as they are.
    const html2 = await $html(() => <div><title {...{ 'xml:lang': 'fr' }}>t</title><svg><foreignObject><div {...{ 'xml:lang': 'fr' }} /></foreignObject></svg></div>, { styles: false });
    assert.ok(html2.includes('<div><title xml:lang="fr">t</title><svg><foreignObject><div xml:lang="fr"></div></foreignObject></svg></div>'), html2);
  });

  it('folds the case of names in ASCII only, as a browser does (security)', async (/** @type {import('node:test').TestContext} */ t) => {
    // The Kelvin sign (U+212A) lowercases to an ASCII k in Unicode: linK would
    // be a <link>, DATA-KEY data-key. A browser folds ASCII only. An on* name
    // given a string writes nothing, onclicK too (ren-dom refuses every on*
    // string, any case; this test wrote it before).
    const K = 'K';
    const Tag = /** @type {any} */ (`lin${K}`);
    const view = () => (
      <div>
        <p {...{ [`onclic${K}`]: 'alert(1)', [`DATA-${K}EY`]: '1' }}>x</p>
        <Tag rel="stylesheet" href="/x.css" />
      </div>
    );
    const html = await $html(view);
    assert.equal(known(html), await inBrowser(t, {}, view), 'the markup ren-dom makes in a browser');
    assert.ok(html.includes(`<p data-${K}ey="1">x</p><lin${K} rel="stylesheet" href="/x.css"></lin${K}>`), html);
    const page = parse(`<!doctype html><body>${html}`);
    const names = [];
    const walk = (/** @type {any} */ n) => {
      if (n.tagName !== undefined) names.push(n.tagName, ...n.attrs.map((/** @type {any} */ a) => a.name));
      for (const c of n.childNodes ?? []) walk(c);
    };
    walk(page);
    assert.ok(!names.some(name => /^on/i.test(name)) && !names.includes('link') && !names.includes('data-key'), names.join(' '));
    const el = new Document().createElement(`DIV${K}`);
    assert.equal(el.localName, `div${K}`);
    assert.equal(el.tagName, `DIV${K}`);
  });

  it('writes nothing for a property that does not reflect, and an output\'s default value as its text', async (/** @type {import('node:test').TestContext} */ t) => {
    const Div = /** @type {any} */ ('div');
    const Video = /** @type {any} */ ('video');
    const same = {
      'a checkbox\'s indeterminate': () => <input type="checkbox" {...{ indeterminate: true }} />,
      'a scrollTop': () => <Div scrollTop={10} scrollLeft={4} />,
      'a volume': () => <Video volume={0.5} currentTime={3} />,
    };
    for (const [what, view] of Object.entries(same)) assert.equal(known(await $html(view)), await inBrowser(t, {}, view), what);
    // happy-dom writes no text for an output's defaultValue, which a browser's sets (with no value set
    // over it). (A media element's muted is a flag, on purpose: see its own test.)
    const rate = await $html(() => <Video playbackRate={2} />, { styles: false });
    assert.ok(rate.includes('<video></video>'), rate);
    assert.ok((await $html(() => <output {...{ defaultValue: '5' }} />, { styles: false })).includes('<output>5</output>'));
  });

  it('writes an ariaX property as the aria-x attribute it reflects, as a browser does', async () => {
    // happy-dom has no ARIA reflection; a browser's ariaLabel property writes aria-label.
    const Div = /** @type {any} */ ('div');
    const html = await $html(() => <Div role="button" ariaLabel="Close" ariaPressed="true" ariaValueNow={3} ariaDescription={null} />, { styles: false });
    assert.ok(html.includes('<div role="button" aria-label="Close" aria-pressed="true" aria-valuenow="3"></div>'), html);
    const el = /** @type {any} */ (new Document().createElement('span'));
    el.ariaHidden = 'true';
    assert.equal(el.getAttribute('aria-hidden'), 'true');
    assert.equal(el.ariaHidden, 'true');
    el.ariaHidden = null;
    assert.equal(el.getAttribute('aria-hidden'), null);
  });

  it('has a property only on the elements that own it; elsewhere a prop is an attribute, as in a browser', async (/** @type {import('node:test').TestContext} */ t) => {
    // ren-dom sets a prop that is in the node as a property, and writes any
    // other as an attribute: a div has no disabled, checked or href, a span no type.
    const Div = /** @type {any} */ ('div');
    const Span = /** @type {any} */ ('span');
    const views = {
      'a div\'s disabled': () => <Div disabled="" role="button">b</Div>,
      'a div\'s checked': () => <Div checked="false" />,
      'a div\'s href': () => <Div href={true} />,
      'a span\'s type': () => <Span type={false} />,
      'a div\'s value': () => <Div value={true} />,
      'an input\'s own': () => <input disabled="" checked={false} type="checkbox" />,
    };
    for (const [what, view] of Object.entries(views)) assert.equal(known(await $html(view)), await inBrowser(t, {}, view), what);
  });

  it('writes an empty control for a null or undefined value, as ren-dom leaves it', async (/** @type {import('node:test').TestContext} */ t) => {
    const view = () => (
      <form>
        <input value={undefined} />
        <textarea value={undefined} />
        <output value={null} />
        <select value={undefined}><option>a</option><option>b</option></select>
      </form>
    );
    const html = await $html(view);
    assert.ok(html.includes('<form><input><textarea></textarea><output></output><select><option>a</option><option>b</option></select></form>'), html.slice(html.indexOf('<form')));
    assert.equal(known(html), await inBrowser(t, {}, view));
  });

  it('reads the boolean properties a browser has as flags, on the elements that own them', async (/** @type {import('node:test').TestContext} */ t) => {
    // A falsy value clears a flag (inert={0} is no inert="0"); style\'s disabled is the CSSOM\'s, no attribute.
    const Any = /** @type {any} */ ('div');
    const Video = /** @type {any} */ ('video');
    const Script = /** @type {any} */ ('script');
    const Form = /** @type {any} */ ('form');
    const Style = /** @type {any} */ ('style');
    const views = {
      inert: () => <Any inert={0}><Any inert={1}>x</Any></Any>,
      media: () => <Video autoplay={0} controls="" loop />,
      script: () => <Script async="" defer={0} noModule={1} />,
      form: () => <Form noValidate={0}><button {...{ formNoValidate: 1 }}>b</button><input {...{ formNoValidate: '' }} /></Form>,
      list: () => <ol {...{ reversed: 1 }}><li>a</li></ol>,
      track: () => <video><track {...{ default: true }} /></video>,
      img: () => <img {...{ isMap: 1 }} alt="" />,
      style: () => <Style disabled={true}>{'a{}'}</Style>,
      'a type': () => <a {...{ type: true }}>x</a>,
    };
    for (const [what, view] of Object.entries(views)) assert.equal(known(await $html(view)), await inBrowser(t, {}, view), what);
    // happy-dom has no playsInline or allowFullscreen; a browser's are flags.
    assert.ok((await $html(() => <Video playsInline={1} />, { styles: false })).includes('<video playsinline=""></video>'));
    assert.ok((await $html(() => <iframe {...{ allowFullscreen: 1 }} />, { styles: false })).includes('<iframe allowfullscreen=""></iframe>'));
  });

  it('writes a video\'s muted as a flag, as checked is, so a static page still autoplays muted', async (/** @type {import('node:test').TestContext} */ t) => {
    const Video = /** @type {any} */ ('video');
    for (const view of [() => <Video autoplay muted loop />, () => <Video {...{ defaultMuted: true }} />, () => <audio {...{ muted: false }} />]) assert.equal(known(await $html(view)), await inBrowser(t, {}, view));
    assert.ok((await $html(() => <Video autoplay muted />, { styles: false })).includes('<video autoplay="" muted=""></video>'));
  });

  it('keeps an empty value where a browser does, and writes a number\'s zero', async (/** @type {import('node:test').TestContext} */ t) => {
    // An empty value is kept on an option (a placeholder that must not pass required), a checkbox,
    // a submit, a hidden input, a button and data; li, meter and progress write their number, 0.
    const view = () => (
      <form>
        <select required><option value="">Pick</option><option value="a">A</option></select>
        <input type="checkbox" value="" />
        <input type="submit" value="" />
        <input type="hidden" value="" />
        <input type="text" value="" />
        <button value="">b</button>
        <data value="">d</data>
        <ol><li value="">a</li></ol>
        <progress value="" />
        <meter value="" />
      </form>
    );
    const html = await $html(view);
    assert.ok(html.includes('<option value="">Pick</option>') && html.includes('<input type="text">') && html.includes('<li value="0">'), html.slice(html.indexOf('<form')));
    assert.equal(known(html), await inBrowser(t, {}, view));
  });

  it('writes a negative progress value as 0, as Chrome\'s setter does, and a meter\'s as given', async () => {
    // Chrome 154 through ren-dom: a progress's value property writes max(value, 0); a meter's writes the value.
    /** @type {[() => any, string][]} */
    const table = [
      [() => <progress value={-3} />, '<progress value="0"></progress>'],
      [() => <progress value={-0} />, '<progress value="0"></progress>'],
      [() => <progress value={-0.5} max={2} />, '<progress value="0" max="2"></progress>'],
      [() => <progress value="-3" />, '<progress value="0"></progress>'],
      [() => <progress value={5} max={2} />, '<progress value="5" max="2"></progress>'],
      [() => <meter value={-3} min={-5} />, '<meter value="-3" min="-5"></meter>'],
    ];
    for (const [view, chrome] of table) {
      const html = await $html(view, { styles: false });
      assert.equal(html.slice(html.indexOf('>') + 1, html.lastIndexOf('</div>')), chrome);
    }
  });

  it('reflects every boolean flag a browser has, on its owners', () => {
    const document = new Document();
    /** @type {[string, string, string][]} */
    const table = [
      ['video', 'disablePictureInPicture', 'disablepictureinpicture'], ['audio', 'disableRemotePlayback', 'disableremoteplayback'],
      ['video', 'disableRemotePlayback', 'disableremoteplayback'], ['input', 'webkitdirectory', 'webkitdirectory'],
      ['hr', 'noShade', 'noshade'], ['td', 'noWrap', 'nowrap'], ['th', 'noWrap', 'nowrap'], ['ol', 'compact', 'compact'],
      ['ul', 'compact', 'compact'], ['dl', 'compact', 'compact'], ['menu', 'compact', 'compact'], ['frame', 'noResize', 'noresize'],
      ['area', 'noHref', 'nohref'], ['object', 'declare', 'declare'], ['template', 'shadowRootDelegatesFocus', 'shadowrootdelegatesfocus'],
      ['template', 'shadowRootClonable', 'shadowrootclonable'], ['template', 'shadowRootSerializable', 'shadowrootserializable'],
    ];
    for (const [tag, prop, attribute] of table) {
      const el = /** @type {any} */ (document.createElement(tag));
      assert.ok(prop in el, `${tag}.${prop}`);
      assert.equal(el[prop], false);
      el[prop] = 1;
      assert.equal(el.getAttribute(attribute), '', `${tag}.${prop}`);
      assert.equal(el[prop], true);
      el[prop] = 0;
      assert.equal(el.hasAttribute(attribute), false, `${tag}.${prop}`);
      // Elsewhere the name is no property.
      assert.equal(prop in document.createElement('div'), false, `div.${prop}`);
    }
    // A template's flags reflect, and a declarative shadow root is still refused.
    const template = /** @type {any} */ (document.createElement('template'));
    template.shadowRootClonable = true;
    assert.throws(() => (template.shadowRootMode = 'open'), /shadow roots are not rendered/);
    assert.throws(() => template.setAttribute('shadowrootmode', 'open'), /shadow roots are not rendered/);
  });

  it('writes text as the content of an a, option, script or title, and nothing for state a browser keeps out of the markup', async () => {
    const inner = (/** @type {string} */ html) => html.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '');
    const html = inner(await $html(() => (
      <div>
        <a href="/" text="Home" />
        <select selectedIndex={1}>
          <option text="One" />
          <option text="Two" />
        </select>
        <script text={'var a = "</script><b>"'} />
        <title text="T" />
        <dialog returnValue="r" />
      </div>
    ), { styles: false }));
    assert.equal(html, '<div><a href="/">Home</a><select><option>One</option><option>Two</option></select><script>var a = "<\\/script><b>"</script><title>T</title><dialog></dialog></div>');
    // A body's text is its obsolete text colour, an attribute.
    const body = /** @type {any} */ (new Document().createElement('body'));
    body.text = 'red';
    assert.equal(body.getAttribute('text'), 'red');
    const a = /** @type {any} */ (new Document().createElement('a'));
    a.text = 'x';
    assert.equal(a.text, 'x');
    assert.equal(a.hasAttribute('text'), false);
  });

  it('edits an absolute href by its URL parts, as a browser does, and writes nothing for a relative or missing one', () => {
    const document = new Document();
    /** @type {[string, string, string][]} */
    const table = [
      ['hash', '#h', 'https://u:p@x.example:8080/p?q=1#h'], ['search', 'z=2', 'https://u:p@x.example:8080/p?z=2#f'],
      ['pathname', '/n', 'https://u:p@x.example:8080/n?q=1#f'], ['host', 'y.example:9', 'https://u:p@y.example:9/p?q=1#f'],
      ['hostname', 'y.example', 'https://u:p@y.example:8080/p?q=1#f'], ['port', '443', 'https://u:p@x.example/p?q=1#f'],
      ['protocol', 'http', 'http://u:p@x.example:8080/p?q=1#f'], ['username', 'v', 'https://v:p@x.example:8080/p?q=1#f'],
      ['password', 'w', 'https://u:w@x.example:8080/p?q=1#f'],
    ];
    for (const tag of ['a', 'area']) {
      for (const [part, value, href] of table) {
        const el = /** @type {any} */ (document.createElement(tag));
        el.href = 'https://u:p@x.example:8080/p?q=1#f';
        el[part] = value;
        assert.equal(el.getAttribute('href'), href, `${tag}.${part}`);
        assert.equal(el.hasAttribute(part), false, `${tag}.${part} is no attribute`);
        const relative = /** @type {any} */ (document.createElement(tag));
        relative.href = '/p';
        relative[part] = value;
        assert.equal(serialize(relative), `<${tag} href="/p">${tag === 'a' ? `</${tag}>` : ''}`, `${tag}.${part} on a relative href`);
        const bare = /** @type {any} */ (document.createElement(tag));
        bare[part] = value;
        assert.equal(serialize(bare), `<${tag}>${tag === 'a' ? `</${tag}>` : ''}`, `${tag}.${part} without an href`);
      }
      const el = /** @type {any} */ (document.createElement(tag));
      el.href = 'https://x.example:8080/p?q=1#f';
      assert.deepEqual([el.protocol, el.host, el.hostname, el.port, el.pathname, el.search, el.hash, el.origin], ['https:', 'x.example:8080', 'x.example', '8080', '/p', '?q=1', '#f', 'https://x.example:8080']);
      // origin is read-only: assigning it throws in strict code, as ren-dom's write does in a browser.
      assert.throws(() => (el.origin = 'o'), TypeError);
      el.href = '/relative';
      assert.deepEqual([el.hash, el.host, el.origin], ['', '', '']);
    }
  });

  it('refuses what a browser refuses: read-only dataset and type, valueAsNumber and valueAsDate where they do not apply, an unparented outerText', () => {
    const document = new Document();
    const any = (/** @type {string} */ tag) => /** @type {any} */ (document.createElement(tag));
    // Getter-only: assigning throws in strict code, as ren-dom's write does in a browser.
    assert.throws(() => (any('div').dataset = 'd'), TypeError);
    for (const tag of ['textarea', 'select', 'output', 'fieldset']) assert.throws(() => (any(tag).type = 'email'), TypeError, tag);
    const select = any('select');
    assert.deepEqual([any('textarea').type, select.type, any('output').type, any('fieldset').type], ['textarea', 'select-one', 'output', 'fieldset']);
    select.multiple = true;
    assert.equal(select.type, 'select-multiple');
    // dataset still reads and writes the data-* attributes.
    const div = any('div');
    div.dataset.fooBar = 'x';
    assert.equal(div.getAttribute('data-foo-bar'), 'x');
    assert.equal(div.dataset.fooBar, 'x');
    assert.deepEqual(Object.keys(div.dataset), ['fooBar']);
    delete div.dataset.fooBar;
    assert.equal(div.hasAttribute('data-foo-bar'), false);
    // valueAsNumber: InvalidStateError where it does not apply, TypeError when infinite; else it sets the value.
    for (const type of [null, 'text', 'checkbox', 'email']) {
      const input = any('input');
      if (type !== null) input.type = type;
      assert.throws(() => (input.valueAsNumber = 5), { name: 'InvalidStateError' }, String(type));
    }
    /** @type {[string, number, string | null][]} */
    const table = [
      ['number', 5, '5'], ['NUMBER', 2.5, '2.5'], ['range', 3, '3'], ['number', NaN, null], ['date', 0, '1970-01-01'],
      ['date', Date.UTC(2024, 1, 29), '2024-02-29'], ['month', 1, '1970-02'], ['month', 12 * 54 + 11, '2024-12'], ['week', 0, '1970-W01'],
      ['week', Date.UTC(2021, 0, 3), '2020-W53'], ['time', 3723004, '01:02:03.004'], ['time', 3600000, '01:00'], ['time', 3601000, '01:00:01'],
      ['datetime-local', 86400000 + 60000, '1970-01-02T00:01'],
    ];
    for (const [type, value, want] of table) {
      const input = any('input');
      input.type = type;
      input.valueAsNumber = value;
      assert.equal(input.getAttribute('value'), want, `${type} ${value}`);
      // Read back, a week is its Monday's midnight: 1970-W01 began on 29 December 1969.
      if (want !== null) assert.equal(input.valueAsNumber, type === 'week' ? { '1970-W01': -259200000, '2020-W53': Date.UTC(2020, 11, 28) }[want] : value, `${type} ${value} read back`);
    }
    // Outside 0001-01-01..275760-09-13 (months and weeks likewise) a browser writes no value.
    const utc = (/** @type {number} */ y, /** @type {number} */ m, /** @type {number} */ d) => new Date(0).setUTCFullYear(y, m, d);
    /** @type {[string, number, string | null][]} */
    const edges = [
      ['date', 9e15, null], ['date', -1e14, null], ['date', 8.64e15, '275760-09-13'], ['date', 8.64e15 + 86400000, null],
      ['date', utc(1, 0, 1), '0001-01-01'], ['date', utc(1, 0, 1) - 1, null], ['date', utc(50, 5, 15), '0050-06-15'],
      ['week', -1e14, null], ['week', utc(1, 0, 1), '0001-W01'], ['datetime-local', 8.64e15, '275760-09-13T00:00'], ['datetime-local', 9e15, null],
      ['month', 1e12, null], ['month', (1 - 1970) * 12, '0001-01'], ['month', (1 - 1970) * 12 - 1, null],
      ['month', (275760 - 1970) * 12 + 8, '275760-09'], ['month', (275760 - 1970) * 12 + 9, null],
    ];
    for (const [type, value, want] of edges) {
      const input = any('input');
      input.type = type;
      input.valueAsNumber = value;
      assert.equal(input.getAttribute('value'), want, `${type} ${value}`);
      if (want !== null && type !== 'week') assert.equal(input.valueAsNumber, value, `${type} ${want} read back`);
    }
    for (const [type, date, want] of /** @type {[string, Date, string | null][]} */ ([['date', new Date(-1e14), null], ['month', new Date(utc(1, 0, 1)), '0001-01'], ['week', new Date(-1e14), null]])) {
      const input = any('input');
      input.type = type;
      input.valueAsDate = date;
      assert.equal(input.getAttribute('value'), want, `${type} valueAsDate ${date.getTime()}`);
    }
    const number = any('input');
    number.type = 'number';
    assert.throws(() => (number.valueAsNumber = Infinity), TypeError);
    // valueAsDate: on date, month, week and time only (not datetime-local, nor number); a non-Date throws TypeError.
    for (const type of [null, 'text', 'datetime-local', 'number']) {
      const input = any('input');
      if (type !== null) input.type = type;
      assert.throws(() => (input.valueAsDate = new Date(0)), { name: 'InvalidStateError' }, String(type));
      assert.equal(input.valueAsDate, null, `${type} reads null`);
    }
    /** @type {[string, Date | null, string | null, number | null][]} */
    const dates = [
      ['date', new Date(Date.UTC(2024, 1, 29, 13)), '2024-02-29', Date.UTC(2024, 1, 29)], ['DATE', new Date(0), '1970-01-01', 0],
      ['month', new Date(Date.UTC(2024, 11, 15)), '2024-12', Date.UTC(2024, 11, 1)], ['week', new Date(Date.UTC(2021, 0, 3)), '2020-W53', Date.UTC(2020, 11, 28)],
      ['time', new Date(3723004), '01:02:03.004', 3723004], ['time', new Date(Date.UTC(2000, 0, 1, 9, 30)), '09:30', Date.UTC(1970, 0, 1, 9, 30)],
      ['date', null, null, null], ['date', new Date(NaN), null, null],
    ];
    for (const [type, value, want, back] of dates) {
      const input = any('input');
      input.type = type;
      input.value = '2000-01-01';
      input.valueAsDate = value;
      assert.equal(input.getAttribute('value'), want, `${type} ${String(value)}`);
      assert.equal(input.valueAsDate?.getTime() ?? null, back, `${type} ${String(value)} read back`);
    }
    // undefined is null to an object? attribute (WebIDL): it clears the value, as null does.
    const cleared = any('input');
    cleared.type = 'date';
    cleared.value = '2000-01-01';
    cleared.valueAsDate = undefined;
    assert.equal(cleared.getAttribute('value'), null, 'valueAsDate = undefined clears');
    assert.throws(() => (any('input').valueAsDate = undefined), { name: 'InvalidStateError' }, 'undefined on a text input');
    const date = any('input');
    date.type = 'date';
    for (const bad of ['2024-01-01', 0, {}]) assert.throws(() => (date.valueAsDate = bad), TypeError, JSON.stringify(bad));
    // outerText replaces the element with its text (line breaks as <br>); with no parent a browser throws.
    assert.throws(() => (any('a').outerText = 'o'), { name: 'NoModificationAllowedError' });
    const parent = any('div');
    const span = any('span');
    parent.appendChild(span);
    span.outerText = 'a\nb';
    assert.equal(serialize(parent), '<div>a<br>b</div>');
  });

  it('forwards an assignment to classList, relList, sandbox, sizes, blocking, an output\'s htmlFor and style, as a browser does', () => {
    const document = new Document();
    const any = (/** @type {string} */ tag) => /** @type {any} */ (document.createElement(tag));
    /** @type {[string, string, string, string][]} */
    const table = [
      ['div', 'classList', 'class', 'a b'], ['a', 'relList', 'rel', 'noopener'], ['iframe', 'sandbox', 'sandbox', 'allow-forms'],
      ['link', 'sizes', 'sizes', '16x16'], ['script', 'blocking', 'blocking', 'render'], ['output', 'htmlFor', 'for', 'x y'],
    ];
    for (const [tag, prop, attribute, value] of table) {
      const el = any(tag);
      el[prop] = value;
      assert.equal(el.getAttribute(attribute), value, `${tag}.${prop}`);
      el[prop] = null;
      assert.equal(el.hasAttribute(attribute), false, `${tag}.${prop} = null removes it`);
    }
    const div = any('div');
    div.classList = 'a b';
    div.classList.add('c');
    assert.equal(div.classList.value, 'a b c');
    assert.equal(String(div.classList), 'a b c');
    div.style = 'color: red';
    assert.equal(div.getAttribute('style'), 'color: red;');
    div.style = null;
    assert.equal(div.hasAttribute('style'), false);
  });

  it('keeps a textarea\'s typed value over the children that come after it, as a browser does', async () => {
    const inner = (/** @type {string} */ html) => html.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '');
    // The value is dirty once set: text appended later is the default value, not what the field shows.
    assert.equal(inner(await $html(() => <textarea value="v">kid</textarea>, { styles: false })), '<textarea>v</textarea>');
    assert.equal(inner(await $html(() => <textarea value={'<b>&'}>kid</textarea>, { styles: false })), '<textarea>&lt;b&gt;&amp;</textarea>');
    assert.equal(inner(await $html(() => <textarea value={'\nx'} />, { styles: false })), '<textarea>\n\nx</textarea>');
    assert.equal(inner(await $html(() => <textarea defaultValue="d">kid</textarea>, { styles: false })), '<textarea>dkid</textarea>');
    const el = /** @type {any} */ (new Document().createElement('textarea'));
    el.appendChild(new Document().createTextNode('default'));
    assert.equal(el.value, 'default');
    el.value = 'typed';
    el.textContent = 'later';
    assert.deepEqual([el.value, el.defaultValue, serialize(el), serialize(el.cloneNode(true))], ['typed', 'later', '<textarea>typed</textarea>', '<textarea>typed</textarea>']);
  });

  it('writes a numeric reflected property as a browser converts it, by its IDL type', () => {
    // From the HTML standard's reflection rules: a long is ToInt32; an unsigned long ToUint32, set when
    // 0..2147483647 and else its default; limited to positive numbers, 0 throws IndexSizeError (with fallback, writes the default); limited
    // to non-negative numbers, a negative throws it. An iframe's, embed's or object's width is a string.
    const document = new Document();
    /** @type {[string, string, unknown, string | null][]} */
    const table = [
      ['div', 'tabIndex', 1.7, '1'], ['div', 'tabIndex', 'x', '0'], ['div', 'tabIndex', 2 ** 31, '-2147483648'],
      ['img', 'width', '50%', '0'], ['img', 'height', 'auto', '0'], ['img', 'width', 12.9, '12'], ['img', 'width', -1, '0'],
      ['canvas', 'width', 'x', '0'], ['canvas', 'width', -1, '300'], ['canvas', 'height', -1, '150'],
      ['video', 'width', '2e3', '2000'], ['input', 'height', 7.5, '7'], ['source', 'width', 3, '3'],
      ['td', 'colSpan', 2.5, '2'], ['td', 'colSpan', -1, '1'], ['th', 'rowSpan', 3, '3'], ['th', 'rowSpan', -1, '1'],
      ['textarea', 'rows', 5.9, '5'], ['textarea', 'rows', -1, '2'], ['textarea', 'cols', -1, '20'],
      // Limited to positive numbers with fallback: 0 writes the default, where an input's size throws.
      ['textarea', 'rows', 0, '2'], ['textarea', 'cols', 0, '20'],
      ['input', 'maxLength', 3.9, '3'], ['input', 'minLength', '2', '2'], ['textarea', 'maxLength', 0, '0'],
      ['input', 'size', 4, '4'], ['input', 'size', -1, '20'], ['select', 'size', 3, '3'], ['select', 'size', -1, '0'],
      ['ol', 'start', -3.5, '-3'], ['col', 'span', 2, '2'], ['colgroup', 'span', -1, '1'],
      ['iframe', 'width', '50%', '50%'], ['embed', 'height', 'auto', 'auto'], ['object', 'width', '10em', '10em'],
    ];
    for (const [tag, prop, value, want] of table) {
      const el = /** @type {any} */ (document.createElement(tag));
      el[prop] = value;
      assert.equal(el.getAttribute(prop === 'tabIndex' ? 'tabindex' : prop.toLowerCase()), want, `${tag}.${prop} = ${String(value)}`);
    }
    for (const [tag, prop, value] of /** @type {[string, string, number][]} */ ([['input', 'size', 0], ['input', 'maxLength', -1], ['textarea', 'minLength', -2]]))
      assert.throws(() => (/** @type {any} */ (document.createElement(tag)))[prop] = value, { name: 'IndexSizeError' }, `${tag}.${prop} = ${value}`);
    // Read back, each is the number its attribute holds, or its default.
    const read = /** @type {any} */ (document.createElement('td'));
    assert.deepEqual([read.colSpan, read.rowSpan, read.tabIndex], [1, 1, -1]);
    read.setAttribute('colspan', ' +5x');
    read.setAttribute('rowspan', '70000');
    assert.deepEqual([read.colSpan, read.rowSpan], [5, 65534]);
    const input = /** @type {any} */ (document.createElement('input'));
    assert.deepEqual([input.size, input.maxLength, input.tabIndex, input.width], [20, -1, 0, 0]);
    assert.equal((/** @type {any} */ (document.createElement('canvas'))).width, 300);
    assert.equal((/** @type {any} */ (document.createElement('iframe'))).width, '');
  });

  it('writes an li\'s value as the WebIDL long it is', async () => {
    const html = await $html(() => <ol>{[Infinity, 2 ** 31, 1e21, 1.7, -2.5, 'x'].map(v => <li value={/** @type {any} */ (v)}>a</li>)}</ol>, { styles: false });
    const values = [...html.matchAll(/<li value="([^"]*)">/g)].map(m => m[1]);
    assert.deepEqual(values, ['0', '-2147483648', String(1e21 | 0), '1', '-2', '0']);
  });

  it('writes an output\'s value as its text, as a browser does', async (/** @type {import('node:test').TestContext} */ t) => {
    const view = () => <form><output name="sum" value="42" /></form>;
    const html = await $html(view);
    assert.ok(html.includes('<output name="sum">42</output>'), html);
    assert.equal(known(html), await inBrowser(t, {}, view));
  });

  it('writes camelCase props under their HTML attribute names, as ren-dom does in a browser', async (/** @type {import('node:test').TestContext} */ t) => {
    const same = {
      inputMode: () => <input inputMode="numeric" enterKeyHint="go" />,
      dateTime: () => <time dateTime="2026-09-29">x</time>,
      crossOrigin: () => <img src="/a" crossOrigin="anonymous" />,
      noValidate: () => <form noValidate>x</form>,
      allowFullscreen: () => <iframe allowFullscreen />,
      contentEditable: () => <div contentEditable>x</div>,
      contentEditableFalse: () => <div contentEditable={false}>x</div>,
      contentEditablePlain: () => <div contentEditable="plaintext-only">x</div>,
      httpEquiv: () => <meta httpEquiv="refresh" content="5" />,
      svg: () => <svg viewBox="0 0 1 1"><path stroke-width="2" /></svg>,
    };
    for (const [name, view] of Object.entries(same)) assert.equal(known(await $html(view)), await inBrowser(t, {}, view), name);
    // An SVG attribute the parser would read back lowercased (strokeWidth as
    // strokewidth) is not written: ren-dom's browser markup keeps it, inert.
    assert.ok((await $html(() => <svg viewBox="0 0 1 1"><path strokeWidth="2" /></svg>)).includes('<svg viewBox="0 0 1 1"><path></path></svg>'));
    // happy-dom lacks these two; a browser writes accept-charset and lowercases a style property.
    const charset = await $html(() => <form acceptCharset="utf-8">x</form>);
    assert.ok(charset.includes('<form accept-charset="utf-8">x</form>'), charset);
    const style = await $html(() => <div style="COLOR: red; --Brand: x">x</div>);
    assert.ok(style.includes('<div style="color: red; --Brand: x;">x</div>'), style);
    // As in a browser, contentEditable takes only its own words.
    assert.throws(() => new Document().createElement('div').contentEditable = '', /SyntaxError/);
    const el = new Document().createElement('div');
    el.setAttribute('ARIA-Label', 'a');
    assert.equal(el.getAttribute('aria-label'), 'a');
    assert.ok(el.hasAttribute('Aria-label'));
    el.removeAttribute('ARIA-LABEL');
    assert.equal(el.getAttribute('aria-label'), null);
  });

  it('writes the default, flag and text props as ren-dom does in a browser', async (/** @type {import('node:test').TestContext} */ t) => {
    // Where happy-dom has the property as a browser does: compared with ren-dom on it.
    const same = {
      defaultValue: () => <input defaultValue="x" />,
      defaultValueText: () => <textarea defaultValue="x" />,
      defaultChecked: () => <input type="checkbox" defaultChecked />,
      innerText: () => <p innerText={'hi <b>\nthere'} />,
    };
    for (const [name, view] of Object.entries(same)) assert.equal(known(await $html(view)), await inBrowser(t, {}, view), name);
    // Where happy-dom lacks the property (it writes an attribute instead), the
    // browser's markup: defaultSelected is the selected attribute, spellcheck
    // and draggable are "true" or "false", translate "yes" or "no", autocorrect
    // "on" or "off", and hidden keeps "until-found".
    const browser = {
      '<select><option selected="">a</option><option>b</option></select>': () => <select><option defaultSelected>a</option><option>b</option></select>,
      '<textarea spellcheck="true"></textarea>': () => <textarea spellcheck />,
      '<textarea spellcheck="false"></textarea>': () => <textarea spellcheck={false} />,
      '<div draggable="true">d</div>': () => <div draggable>d</div>,
      '<div draggable="false">d</div>': () => <div draggable={false}>d</div>,
      '<div translate="yes">d</div>': () => <div translate>d</div>,
      '<div translate="no">d</div>': () => <div translate={false}>d</div>,
      '<div hidden="until-found">d</div>': () => <div hidden="until-found">d</div>,
      '<div hidden="">d</div>': () => <div hidden>d</div>,
      // A boolean property in Chrome 154 (its markup): any truthy value is "on", "off" too.
      '<textarea autocorrect="on"></textarea>': () => <textarea autocorrect="off" />,
      '<input autocorrect="on">': () => <input autocorrect />,
      '<input autocorrect="off">': () => <input autocorrect={false} />,
      // A form's encoding reflects enctype (Chrome 154's markup).
      '<form enctype="text/plain"></form>': () => <form encoding="text/plain" />,
    };
    for (const [markup, view] of Object.entries(browser)) {
      const html = await $html(view, { styles: false });
      assert.ok(html.includes(`>${markup}</div>`), `${markup} in ${html}`);
    }
    // Raw HTML is never written: innerHTML is refused, naming the package.
    await assert.rejects($html(() => <div innerHTML="<b>x</b>" />), /^Error: REN html: innerHTML is not rendered by \$html/);
  });

  it('writes a nonce as its attribute, on purpose: a page\'s CSP reads it from the markup', async () => {
    // ren-dom in Chrome writes none (the nonce is an internal slot there); the README lists the difference.
    const html = await $html(() => <div><script nonce="n1">{'1'}</script><style nonce="n2">{'.x{}'}</style></div>, { styles: false });
    assert.ok(html.includes('<div><script nonce="n1">1</script><style nonce="n2">.x{}</style></div>'), html);
  });

  it('writes no end tag for the legacy void elements, as a browser does', async () => {
    const html = await $html(() => <div><param /><keygen /><frame /><basefont /><bgsound /></div>, { styles: false });
    assert.ok(html.includes('<div><param><keygen><frame><basefont><bgsound></div>'), html);
  });

  it('writes a template as a browser serializes ren-dom\'s, and refuses a declarative shadow root', async () => {
    // ren-dom appends a template\'s children to the element, not its content, and a
    // browser serializes the content: empty. A shadowrootmode would make a page
    // parse attach a shadow root that hides the light children ren-dom shows.
    const Template = /** @type {any} */ ('template');
    const html = await $html(() => <div><Template><p>inert</p></Template><p>light</p></div>, { styles: false });
    assert.ok(html.includes('<div><template></template><p>light</p></div>'), html);
    const shadow = /^Error: REN html: shadow roots are not rendered by \$html; use \$dom$/;
    await assert.rejects($html(() => <div><Template shadowrootmode="open"><p>x</p></Template><p>light</p></div>), shadow);
    await assert.rejects($html(() => <div><Template {...{ shadowRootMode: 'open' }} /></div>), shadow);
    assert.throws(() => new Document().createElement('template').setAttribute('ShadowRootMode', 'closed'), shadow);
  });

  it('writes no raw escape character, which could switch a page decoded as ISO-2022-JP (security)', async () => {
    // ESC $B would turn what follows into two-byte text in a page read as ISO-2022-JP.
    const esc = '\x1b';
    const html = await $html(() => (
      <div>
        <p title={`a${esc}$Bb`}>{`x${esc}(By`}</p>
        <style>{`a::after{content:"${esc}"}`}</style>
        <script>{`let s = "${esc}";`}</script>
      </div>
    ), { styles: false });
    assert.ok(!html.includes(esc), JSON.stringify(html));
    assert.ok(html.includes('<p title="a&#x1B;$Bb">x&#x1B;(By</p>'), JSON.stringify(html));
    assert.ok(html.includes('<style>a::after{content:"\\1b "}</style><script>let s = "\\u001B";</script>'), JSON.stringify(html));
  });

  it('refuses a shadow root, naming the package', () => {
    assert.throws(() => new Document().createElement('div').attachShadow(), /^Error: REN html: shadow roots are not rendered by \$html; use \$dom$/);
  });

  // Values that tried to reach past their declaration in the state sheet's
  // text (ren-html's document has no CSSOM to drop them), and values alike that are safe. CSS reads CRLF, CR and form feed
  // as a newline, which ends a string.
  const ATTEMPTS = /** @type {[string, string, boolean][]} */ ([
    ['a form feed in a string', '"a\fb"', false],
    ['a line feed in a string', '"a\nb"', false],
    ['a carriage return in a string', '"a\rb"', false],
    ['a CRLF in a string', '"a\r\nb"', false],
    ['an escaped form feed in a string', '"a\\\fb"', false],
    ['a bare form feed', 'a\fb', false],
    ['an open double-quoted string', '"abc', false],
    ['an open single-quoted string', "'abc", false],
    ['a string whose end quote is escaped', '"abc\\"', false],
    ['a trailing backslash', 'a\\', false],
    ['a backslash before a form feed', 'a\\\f', false],
    ['a comment', 'a /* b', false],
    ['a closed comment', 'a /**/ b', false],
    ['an open parenthesis', 'calc(1px', false],
    ['an open bracket', '[a', false],
    ['a stray closer', 'a)', false],
    ['crossed brackets', '(a]', false],
    ['a brace', 'a}', false],
    ['a semicolon in a string', '"a;b"', false],
    ['a tag end', '"</style>"', false],
    ['an open url', 'url(x', false],
    ['a quote in an unquoted url', 'url(a"b)', false],
    ['a comment in an unquoted url', 'url(a/*)', false],
    ['an escaped url with a quote', 'u\\72l(x"a)")', false],
    ['a bracket in a name ending in url', 'rurl([)', false],
    ['a bracket after a hash named url', '#url([)', false],
    ['a bracket after an at-name url', '@url([)', false],
    ['a closed string', '"a b"', true],
    ['an escaped quote in a string', '"a\\"b"', true],
    ['an unquoted url', 'url(x.png)', true],
    ['a quoted url', 'url("a b")', true],
    ['nested parentheses', 'calc((1px + 2px) * 2)', true],
    ['an escaped brace', '\\7b', true],
  ]);
  for (const [what, value, kept] of ATTEMPTS)
    it(`${kept ? 'keeps' : 'refuses'} ${what} in a state value, the next rule intact`, async () => {
      const html = await $html(() => (
        <div>
          <View style={{ hover: { '--x': value } }} />
          <View style={{ background: 'rgb(0, 0, 255)', hover: { background: 'rgb(255, 0, 0)' } }} />
        </div>
      ));
      const sheet = html.match(/<style data-ren-states="">([^<]*)<\/style>/)?.[1] ?? '';
      const views = [...html.matchAll(/<div data-ren="View"[^>]*>/g)].map(([tag]) => tag.match(/data-ren-state="([^"]*)"/)?.[1] ?? null);
      assert.equal(views.length, 2, html);
      const [first, next] = views;
      assert.equal(first !== null && sheet.includes(`.${first}:hover { --x: `), kept, sheet);
      assert.match(sheet, new RegExp(`(^|\\n)\\.${next}:hover \\{ background: rgb\\(255, 0, 0\\) !important \\}\\n`), 'the next rule is whole');
    });
});
