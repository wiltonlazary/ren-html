# ren-html

A view rendered once to HTML, for servers and static pages:

```js
import { $html } from 'ren-html';

const html = await $html(() => <App />, { id: 'home', props: { user }, theme: { accent: 0xff325842 } });
response.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`);
```

The package is published on npm as `@maxenve/ren-html` under the MIT license;
install it under its import name: `npm install ren-html@npm:@maxenve/ren-html`.

The page must declare UTF-8 (a `<meta charset="utf-8">` or a
`Content-Type: text/html; charset=utf-8` header): a browser guessing the
encoding may read the markup otherwise. ESC is written as `&#x1B;` (as
`\u001B` in a script, `\1b ` in a style), so no ISO-2022-JP switch reaches it.

There is no hydration. The page is markup and styles; a client that needs
the live application renders it fresh with ren-dom.

`$html(view, options)` starts an application root with ren-dom's `$dom` on
a small document of its own (`src/document.js`), waits until every task the
view started has settled, a nested `<Root>`'s included (ren-core's
`$settle`: Pending and Recover show their final content; a nested root's
failure rejects as the view's own), returns the root element's HTML and disposes the
root. The markup is exactly the one ren-dom makes in a browser, the
primitives' scoped `<style>` and the theme's custom properties included
(tested against ren-dom on happy-dom). One difference is on purpose: form
values and flags a browser keeps as properties (`value`, `checked`,
`selected`, a media element's `muted`, so a static `<video autoplay muted>`
still autoplays) are written as attributes, so the static page shows them; a
`<select>` marks `selected` the options a browser shows selected (its value's
match, an option that came in selected, as a browser's selectedness follows
ren-dom's steps; none for the first option a browser picks by itself, and a
drop-down select whose value no option has shows its first, where a list
box, `size` 2 and more, shows none: the split with ren-dom is on purpose,
since a live drop-down select whose value changes to one no
option has shows no option at all (its `selectedIndex` -1, blank), which
markup cannot say: no option marked `selected`, the static page shows its
first (`test/select.test.jsx` lists the case); its options are the ones Chrome's
select counts, in a `div` too but not in an optgroup's optgroup; a select
whose `multiple` goes keeps its first selected option), a checked radio
unchecks the rest of its group (its name and form owner, as a browser's:
the last checked, or the last to join the group, is the one written; a
radio whose `form` attribute names a form after it, or one coming in later,
joins that form's group when the form comes in, after the form's own
radios), an open `<details>` with a `name` closes the others of that name in
its tree, as a browser's (one coming in open closes itself where another is
open), and a
`<textarea>`'s `value`, once set, is its text in place of its children, as
the field a browser shows keeps the value typed over text appended later. A
`nonce` is written too, on purpose: a browser keeps it in an internal slot
and writes no attribute, but the page's Content Security Policy reads it
from the markup. The other difference is the
page's missing base URL: an `a`'s or `area`'s URL parts (`hash`, `host`,
`protocol` and the rest) edit an absolute `href` as a browser does, but on a
relative one they write nothing, where a browser resolves it against the
page's URL and writes the absolute URL.

| Option | Meaning |
| --- | --- |
| `id` | the root's id (`page`): its `data-ren-root`, storage keys and element ids |
| `props`, `provide` | as `Root`'s: what the view reads with `$lookup(Props)`, contexts passed in |
| `theme`, `styles` | as ren-dom's |
| `tag` | the host element's tag (`div`) |
| `timeout` | milliseconds to wait for the tasks (10,000; 0 waits forever); past it `$html` rejects |

The markup's structure is safe to send: no text or value makes a tag or an
attribute of its own, and it parses back to the elements the view made,
but where the view breaks HTML's content model, which the parser repairs
by moving elements (a `p` holding a `div`, an `a` inside an `a`, a `div`
inside a table or directly inside an `svg`, and a view's own `<body>` or
`<html>`, whose attributes, a `class` or a `lang`, move onto the page's
body or html element), or places an SVG tag outside an `<svg>` (ren-dom
makes it an SVG element anywhere; the parser reads it as HTML, so an
`image` becomes a void `img`, its children moved out after it and its `src`
loaded): ren-dom's DOM holds such a tree, markup cannot. ren-html writes
ren-dom's markup for it rather than refuse or rewrite it, since either
would part from ren-dom; put SVG content inside an `<svg>`. An
attribute name that would break out of its tag, or a tag name that does not
start with an ASCII letter, throws an `InvalidCharacterError`, as a browser's
`setAttribute` and `createElement` do. An event handler prop given a
string (any name starting `on`, in any ASCII case, on an HTML, SVG or
MathML element: `onclick`, `ONCLICK`, an `svg`'s `onload`) writes nothing,
as ren-dom writes none in a browser: a handler is a function, and a
function is no markup. An SVG attribute the parser would read
back under another name (`ONCLICK` as `onclick`, `STYLE` as `style`,
`strokeWidth` as `strokewidth`), or namespaced (`xlink:href`, `xml:lang`,
`xmlns:xlink`), is not written: inert in the DOM, it would be live, or
unchecked, once parsed. Attribute values are escaped
and otherwise written as given, but for what would run script, which
ren-dom never writes (its README, "What is never written"), so neither does
`$html`: a `javascript:` URL (any ASCII case, leading controls and spaces,
tabs and line breaks inside, as a browser's URL parser reads it) in any URL
attribute (`href`, `src`, `action`, `formaction`, `xlink:href`, `poster`,
`data`, `cite`, `background` and the rest), an href a URL part makes one,
an SVG `animate`'s or `set`'s `javascript:` value, and an iframe's
`srcdoc`, a document of markup: each removes its attribute, as null does,
and the rest of the view renders. A character reference in a value is
text, its `&` escaped, never a way around it. `Document` and `serialize`
are a browser's DOM and serializer: code that builds markup with them
directly answers for its own values. An inline style keeps only what a browser's CSSOM
keeps: a declaration whose name is not a property's, or whose value is not
one declaration's (a `;`, brace or newline outside a string, anything left
open), is dropped, so a value cannot add declarations of its own. Text is escaped, but for a `style` or `script` in HTML context, whose
text children are joined and escaped once: its own end tag is written
`<\/style`, `<\/script`, and a script's `<!--` is written `\u003C!--` (the
same text to a script string and to JSON-LD), so no split can close it early
or start the parser's double-escaped state. Under an `<svg>` or a `<math>`,
where a parser reads a style's or a script's text as markup, it is escaped as
any text, and so it is under their HTML integration points (the safe
direction) and under any element whose content a parser does not read as
tags (from the HTML standard: `noscript`, `xmp`, `iframe`, `noembed`,
`noframes`, `textarea`, `title`, `plaintext`, `select`, `frameset`), where its
text would be markup again once that element ended; a tree that holds a
`frameset` has no raw text at all, as a page ignores a style's or a script's
tag after one too. A textarea's, pre's or listing's leading line break is written
twice, as the parser drops the first. No raw HTML is written from an element's content (`srcdoc` is an
attribute's value, above): an `innerHTML` prop
rejects `$html` with `REN html: innerHTML is not rendered by $html` (render
the elements, or text; `innerText` sets text).

`Document` and `serialize` are exported for code that builds or reads the
same markup. Shadow roots are not rendered: `attachShadow` throws (use
`$dom`), and so does a template's `shadowrootmode`, a shadow root a page's
parser would attach. A template is written as a browser serializes
ren-dom's: its content, which only a parser fills, so it is empty.

Its dependencies are ren-core and ren-dom (install rrx-core, ren-core,
ren-canv and ren-dom first, in that order; happy-dom and parse5 are dev dependencies, for the parity test and the fuzz). Node
22.15 or later. Tests: `npm test` runs `test/html.test.jsx` (parity with
ren-dom in a browser document, form values and a select's value, style
declarations, names and raw text, failures and time-outs, the theme) in
both JSX passes, `test/select.test.jsx` (which options a select shows,
against Chrome: `test/fixtures/select.json`, recorded by
`scripts/select-oracle.mjs` under the Chrome lock, ren-dom's live select on
happy-dom and the parse of ren-html's markup; ren-json reads the same
file; `test/radio.test.jsx`, which radios a page checks, the same way:
`test/fixtures/radio.json`, recorded by `scripts/radio-oracle.mjs`, and
a long list's radios grouped in work that grows with it;
`test/details.test.jsx`, which details a page leaves open, the same way:
`test/fixtures/details.json`, recorded by `scripts/details-oracle.mjs`
(ren-json reads a copy);
`scripts/roles-oracle.mjs` records, the same way, the roles Chrome's
accessibility tree gives ren-dom's elements, ren-json's
`test/fixtures/roles.json`), `test/fuzz.test.js` (random svg, math and HTML nesting, styles and
scripts also inside noscript, textarea, title, xmp, iframe, noembed, noframes,
plaintext, select and frameset, hostile tag names that must be refused, with hostile text split across text children, 5 fixed
seeds × 8,000 views, parsed back by parse5 as a fragment and as a whole
page, with and without `<body>`: every element parsed is one the
view made, with its tag and namespace under the same parent, every element
outside those opaque ones is kept, and its text too, and the page's own
html, head and body take no attribute; each element's attributes are the
view's under the names a parser reads back, and its style holds only the
declarations the view set (read by a CSS tokenizer); a failure names its
seed and smallest view),
`test/state-fuzz.test.js` (random hover values, fixed seeds: the state
sheet written reads, by a CSS tokenizer, as its own rules and nothing else),
`test/reflected.test.js` (every reflected property of the HTML standard,
from the table in `test/fixtures/reflected.js`: a property on its owners,
converted by its IDL type and numeric rule),
`test/differential.test.jsx` (ren-dom on happy-dom against `$html`, each
prop on each tag, but for the differences it lists with their reasons),
`test/security.test.jsx` (what would run script, in every URL attribute
and the variants a browser's URL parser reads, a URL part, an animation,
`srcdoc`, `on*` strings in any case on HTML, SVG and MathML elements: the same markup as ren-dom's, and parse5 reads back none of it),
`test/forms.test.js` (the standard's 18 void elements, and the form value
conversions against `test/fixtures/forms.js`, a table ren-json shares),
`test/exports.test.js` (the export lock),
`test/timers.test.js` (the timers guard) and `test/types/html.tsx` (the
declarations, through `tsc`).
