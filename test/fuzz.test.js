// The serializer's class-level check: random views of HTML, svg and math
// (with their HTML integration points), style, script, textarea, title,
// noscript and pre, styles and scripts also inside the elements whose content
// a parser does not read as tags (noscript, textarea, title, xmp, iframe,
// noembed, noframes, plaintext, select and its options), their hostile text
// split at random across text children, are serialized and parsed back by
// parse5 (the HTML standard's parser), as a fragment and as a whole page,
// with and without a <body> start tag. Every element parsed must be one the
// view made, with its tag and namespace under the same parent (so none is
// made by text, and none moved); every element the view made outside those
// is parsed; and every text there is kept. Seeds are fixed: a failure names
// its seed and the smallest view that still fails, shrunk from the one found.
// A page's html, head and body must take no attribute from the view's text.
// A frameset (which replaces a page's body, and inside a body is dropped)
// keeps no structure to compare: its view must only make no element of its
// own text. A view with a tag name a browser refuses, or a prop named as a
// node's own field, must not build at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseFragment } from 'parse5';
import { Document, serialize } from 'ren-html';

const SVG = 'http://www.w3.org/2000/svg';
const MATHML = 'http://www.w3.org/1998/Math/MathML';
const HTML = 'http://www.w3.org/1999/xhtml';
/** Elements whose content a parser does not read as tags (the serializer's OPAQUE, less style and script). */
const OPAQUE = new Set(['noscript', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext', 'select', 'frameset']);
const SEEDS = [1, 2, 3, 4, 5];
const RUNS = 8000;

/** A node's own fields: a prop of one of these names must be refused (a browser's are getters only). */
const FIELDS = ['localName', 'namespaceURI', 'nodeType', 'tagName', 'attributes', 'parentNode', 'firstChild', 'lastChild', 'nextSibling', 'previousSibling', 'ownerDocument', 'childNodes', 'outerHTML'];

/** Tag names a browser's createElement refuses; the serializer's Document must refuse them too. */
const BAD = ['!--x', '?x', '!x', '/x', '1x', '-x', 'x y', 'x>', '', '\u212Abd', 'x\x1b$B', 'x\x7f'];

/** ASCII lowercase, as a parser folds names (a Unicode fold makes the Kelvin sign a k). @param {string} s */
const lower = s => s.replace(/[A-Z]+/g, c => c.toLowerCase());
/** The Kelvin sign: a name holding it must stay itself, never fold to an ASCII k. */
const K = '\u212A';

/** Style values that try to be more than one declaration's, or to leave something open. */
/** Style strings a CSS tokenizer reads as fewer declarations than a hand splitter would. */
const STYLE_TEXTS = ['color: x{;position:fixed;inset:0}', 'color: red /*; position: fixed */', 'color: [; position: fixed]', 'content: "x\n; b: 1"; position: fixed', 'color: red; margin: 1px', 'background: url(a;b.png); width: 1px'];
/** The attribute names the parser reads back namespaced in foreign content (the HTML standard's table, 13.2.6.5). */
const XML = new Set(['xlink:href', 'xlink:title', 'xml:lang', 'xml:space', 'xmlns:xlink', 'xmlns']);
/** A link a parser would read back as a live xlink one in foreign content. */
const linked = () => ({ props: { 'xlink:href': 'javascript:alert(1)', 'xml:lang': 'fr' } });

/** The SVG attribute names the parser gives back their case (the HTML standard's table, 13.2.6.5; a few of it). */
const SVG_NAMES = new Map(['viewBox', 'preserveAspectRatio', 'gradientUnits', 'stdDeviation'].map(name => [lower(name), name]));
/** The name an SVG attribute is read back under, by the HTML parser. @param {string} name */
const svgName = name => SVG_NAMES.get(lower(name)) ?? lower(name);

const STYLES = ['red; position: fixed; inset: 0', 'red}', 'url(x', 'url("a;b")', '"a;b"', 'a /* b', 'red !important', 'red\nblue', 'calc(1px', '"abc', '1px', 'rgb(1, 2, 3)'];

const HOSTILE = [
  '<html onmouseover=alert(1)>', '</frameset>', '</body>', '\x1b$B', '\x1b(B',
  '</style>', '</script>', '<!--', '-->', '<script>', '</STYLE ', '<img src=x onerror=alert(1)>', '</svg>', '</math>',
  '</textarea>', '</title>', '</noscript>', '&amp;', '&', '<', '>', ' ', '\r\n', '\r', '\n', 'a{}', 'x',
];

/**
 * A view: `[tag, namespace, ...children]`, a child a view or a text node's data.
 * A child may also be props, set as ren-dom sets them: a property where the
 * element has one, else an attribute.
 * @typedef {[string, string | null, ...(View | string | Props)[]]} View
 * A `style` prop is an object, set as ren-dom sets one: each key on the
 * element's style.
 * @typedef {{ props: Record<string, any> }} Props
 */

/** A seeded generator of views. @param {number} seed */
function views(seed) {
  let state = seed;
  // The product in 32-bit integer arithmetic (Math.imul): a float product loses its low bits and cycles within a few hundred views.
  const rand = () => (state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 4294967296;
  /** @template T @param {T[]} list @returns {T} */
  const pick = list => list[Math.floor(rand() * list.length)];
  const count = (/** @type {number} */ most) => 1 + Math.floor(rand() * most);
  /** Hostile text, split at random into text children (an empty one too). @returns {string[]} */
  const texts = () => {
    let s = '';
    for (let i = count(4); i > 0; i--) s += pick(HOSTILE);
    const cuts = Array.from({ length: Math.floor(rand() * 3) }, () => Math.floor(rand() * (s.length + 1))).sort((a, b) => a - b);
    const out = [];
    let at = 0;
    for (const cut of [...cuts, s.length]) {
      if (cut > at) out.push(s.slice(at, cut));
      at = cut;
    }
    return [...out, ''];
  };
  /** A style or a script, in the HTML namespace or the one around it (ren-dom makes either). @param {string | null} ns @returns {View} */
  const raw = ns => [pick(['style', 'script']), rand() < 0.5 ? null : ns, ...texts()];
  /** An element whose content a parser does not read as tags, holding styles and scripts (a select also options holding them). @returns {View} */
  const opaque = () => {
    const tag = pick([...OPAQUE]);
    const leaves = () => Array.from({ length: count(2) }, () => (rand() < 0.2 ? pick(HOSTILE) : raw(null)));
    if (tag === 'select') return ['select', null, ...Array.from({ length: count(2) }, () => (rand() < 0.5 ? ['option', null, ...leaves()] : raw(null)))];
    return [tag, null, ...leaves()];
  };
  /** @param {number} depth @returns {View} */
  const html = depth => {
    const tag = depth > 3 ? pick(['style', 'script', 'textarea', 'title', 'noscript', 'opaque']) : pick(['div', 'span', 'b', 'svg', 'math', 'style', 'script', 'textarea', 'title', 'noscript', 'pre', 'opaque']);
    if (tag === 'opaque') return opaque();
    // Now and then a declarative shadow root, which building must refuse (a page would attach it).
    if (rand() < 0.005) return ['template', null, { props: { [pick(['shadowrootmode', 'shadowRootMode', 'SHADOWROOTMODE'])]: pick(['open', 'closed']) } }, ...texts()];
    // Now and then a hostile tag name, which building must refuse.
    if (rand() < 0.01) return [pick(BAD), null, ...texts()];
    // Now and then props: a node's own field (to be refused) or a plain one with hostile text.
    if (rand() < 0.02) return ['div', null, { props: { [pick([...FIELDS, 'title', 'id', 'className', 'lang', 'data-x', `onclic${K}`, `onerro${K}`, 'data-\x1b$B'])]: pick(HOSTILE) } }, ...texts()];
    // Now and then a style: keys set as ren-dom sets them, values that try to add declarations.
    if (rand() < 0.01) return ['p', null, { props: { style: pick(STYLE_TEXTS) } }, ...texts()];
    if (rand() < 0.02) return ['p', null, { props: { style: { [pick(['color', 'backgroundImage', 'margin', '--x', 'x}{'])]: pick([...STYLES, ...HOSTILE]), [pick(['width', 'fontFamily'])]: pick(STYLES) } } }, ...texts()];
    // Now and then a tag holding the Kelvin sign, which must not become a link or a script.
    if (rand() < 0.01) return [pick([`lin${K}`, `scrip${K}`, `b${K}`]), null, ...texts()];
    if (tag === 'svg') return ['svg', SVG, ...Array.from({ length: count(3) }, () => svg(depth + 1))];
    if (tag === 'math') return ['math', MATHML, ...Array.from({ length: count(3) }, () => math(depth + 1))];
    if (tag === 'div' || tag === 'span' || tag === 'b') return [tag, null, ...Array.from({ length: count(3) }, () => html(depth + 1))];
    if (tag === 'pre') return ['pre', null, pick(['\nlead', '\r\nlead', '\rlead', 'lead'])];
    return [tag, null, ...texts()];
  };
  /** @param {number} depth @returns {View} */
  const svg = depth => {
    const tag = pick(depth > 3 ? ['style', 'script'] : ['g', 'svg', 'style', 'script', 'foreignObject', 'desc', 'title', 'cross', 'textarea']);
    if (tag === 'style' || tag === 'script') return raw(SVG);
    // An HTML textarea here is a foreign element to the parser: it drops no leading line break.
    if (tag === 'textarea') return ['textarea', null, pick(['\nx', '\r\nx', '\rx', 'x'])];
    // Another root's integration point is a plain element here: an svg's mi or mtext, its link still foreign.
    if (tag === 'cross') return [pick(['mi', 'mtext', 'annotation-xml']), rand() < 0.5 ? null : SVG, ['a', null, linked(), ...texts()]];
    // An integration point holds HTML.
    if (tag === 'foreignObject' || tag === 'desc' || tag === 'title') return [tag, SVG, ...Array.from({ length: count(2) }, () => (depth > 3 ? raw(null) : html(depth + 1)))];
    // Now and then attributes of any case: only those read back under their own name may be written.
    const props = rand() < 0.1 ? [{ props: { [pick(['ONCLICK', 'STYLE', 'Onload', 'viewBox', 'VIEWBOX', 'viewbox', 'fill', 'preserveAspectRatio', 'data-x', 'gradientUnits'])]: pick(HOSTILE), ...(rand() < 0.3 ? { style: pick(STYLE_TEXTS) } : {}) } }] : [];
    return [tag, SVG, ...props, ...Array.from({ length: count(3) }, () => svg(depth + 1))];
  };
  /** @param {number} depth @returns {View} */
  const math = depth => {
    const tag = pick(depth > 3 ? ['style', 'script'] : ['mrow', 'mi', 'mtext', 'style', 'script', 'cross', 'annotation', 'glyph', 'textarea', 'svgNote']);
    if (tag === 'style' || tag === 'script') return raw(MATHML);
    if (tag === 'textarea') return [pick(['mi', 'mrow']), MATHML, ['textarea', null, pick(['\nx', '\r\nx', 'x'])]];
    // An svg right inside an annotation-xml of any encoding is SVG: its foreignObject holds HTML again, whose pre
    // drops a leading line break.
    if (tag === 'svgNote') return ['annotation-xml', MATHML, ['svg', rand() < 0.5 ? null : SVG, ['foreignObject', SVG, [pick(['pre', 'textarea', 'listing']), null, pick(['\nx', '\r\nx', 'x'])]]]];
    // An mglyph or malignmark right inside a text integration point stays MathML: its link is foreign.
    if (tag === 'glyph') return [pick(['mi', 'mo', 'mn', 'ms', 'mtext']), MATHML, [pick(['mglyph', 'malignmark']), rand() < 0.5 ? null : MATHML, linked(), ...(rand() < 0.5 ? [raw(null)] : [])]];
    // An svg's integration point is a plain element here: a math's foreignObject, desc or title.
    if (tag === 'cross') return [pick(['foreignObject', 'desc', 'title']), rand() < 0.5 ? null : MATHML, ['a', null, linked(), ...texts()]];
    // annotation-xml holds HTML only with an HTML encoding.
    if (tag === 'annotation') {
      const encoding = pick(['text/html', 'application/xhtml+xml', 'TEXT/HTML', 'text/plain', null]);
      return ['annotation-xml', MATHML, ...(encoding === null ? [] : [{ props: { encoding } }]), ['a', null, linked(), ...texts()]];
    }
    if (tag === 'mi' || tag === 'mtext') return [tag, MATHML, ...Array.from({ length: count(2) }, () => (depth > 3 ? raw(null) : html(depth + 1)))];
    return [tag, MATHML, ...Array.from({ length: count(3) }, () => math(depth + 1))];
  };
  return () => html(0);
}

const doc = new Document();
/** @param {View | string} view @returns {any} */
function build(view) {
  if (typeof view === 'string') return doc.createTextNode(view);
  const [tag, ns, ...children] = view;
  const el = ns === null ? doc.createElement(tag) : doc.createElementNS(ns, tag);
  for (const child of children) {
    if (typeof child !== 'string' && !Array.isArray(child)) {
      for (const [name, value] of Object.entries(child.props))
        if (name === 'style' && typeof value === 'object') {
          for (const [key, v] of Object.entries(value)) if (key.includes('-')) el.style.setProperty(key, v);
          else el.style[key] = v;
        } else if (name in el && el.namespaceURI !== SVG) el[name] = value;
        else el.setAttribute(name, value);
    } else el.appendChild(build(child));
  }
  return el;
}

/**
 * An element of a tree: its tag (lowercase), namespace, parent's index (-1
 * for none), text when it holds text only, and, for the view's, whether the
 * parse must keep it (not under an element whose content is not read as
 * tags, nor after a plaintext, which nothing ends).
 * `style` is, for the view's, the property names its style prop set (a
 * string's by `names`; null when none), and for parse5's, the declarations'
 * names in its style attribute. `attrs` are the other attributes: for the
 * view's, those its props write, under the name a parser reads back; for
 * parse5's, those it read.
 * @typedef {{ tag: string, ns: string, parent: number, text: string | null, kept: boolean, style: string[] | null, attrs: Record<string, string> }} Node
 */

/**
 * The view's elements in document order, each in the namespace a parser puts
 * it in: an svg's or a math's children in theirs, but under an integration
 * point, which holds HTML.
 * @param {View} view @returns {Node[]}
 */
function elements(view) {
  /** @type {Node[]} */
  const out = [];
  let plain = false;
  /** @param {View} v @param {number} parent @param {string} around @param {boolean} kept @param {boolean} [point] right inside a MathML text integration point @param {boolean} [note] right inside a MathML annotation-xml */
  const walk = (v, parent, around, kept, point = false, note = false) => {
    const [tag, , ...children] = v;
    const name = lower(tag);
    // Right inside mi, mo, mn, ms or mtext an mglyph or a malignmark stays MathML (13.2.6, the dispatcher);
    // right inside an annotation-xml an svg is SVG, whatever the encoding (the views put an svg nowhere else in
    // MathML, where it would be a MathML element).
    const ns = name === 'svg' && (around !== MATHML || note) ? SVG : name === 'math' ? MATHML : point && (name === 'mglyph' || name === 'malignmark') ? MATHML : around;
    const here = out.length;
    // A plaintext's text runs to the end: its end tag, and all after it, are text too.
    const text = name !== 'plaintext' && children.every(c => typeof c === 'string' || !Array.isArray(c)) ? children.filter(c => typeof c === 'string').join('') : null;
    const props = /** @type {any} */ (children.find(c => typeof c !== 'string' && !Array.isArray(c)))?.props ?? {};
    const style = props.style;
    /** @type {Record<string, string>} */
    const attrs = Object.create(null);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'style' || (ns === SVG && lower(key) === 'style')) continue;
      // In foreign content an xlink:, xml: or xmlns: attribute is not written (the parser would read it back namespaced).
      if (XML.has(lower(key)) && ns !== HTML) continue;
      // An SVG attribute keeps its case, and is written only when read back under it; an HTML one is lowercased.
      if (ns === SVG) {
        if (svgName(key) === key) attrs[key] = String(value);
      } else attrs[key === 'className' ? 'class' : lower(key)] = String(value);
    }
    const declared = style === undefined ? null : typeof style === 'string' ? names(style) : Object.keys(style).map(k => (k.includes('-') ? k : k.replace(/[A-Z]/g, c => `-${lower(c)}`)));
    out.push({ tag: name, ns, parent, text, kept: kept && !plain, style: declared, attrs });
    if (name === 'plaintext') plain = true;
    const encoding = lower(String(props.encoding ?? ''));
    const inside =
      (ns === SVG && ['foreignobject', 'desc', 'title'].includes(name)) ||
      (ns === MATHML && (['mi', 'mo', 'mn', 'ms', 'mtext'].includes(name) || (name === 'annotation-xml' && (encoding === 'text/html' || encoding === 'application/xhtml+xml'))))
        ? HTML
        : ns;
    const textPoint = ns === MATHML && ['mi', 'mo', 'mn', 'ms', 'mtext'].includes(name);
    for (const c of children) if (Array.isArray(c)) walk(c, here, inside, kept && !(ns === HTML && OPAQUE.has(name)), textPoint, ns === MATHML && name === 'annotation-xml');
  };
  walk(view, -1, HTML, true);
  return out;
}
/**
 * parse5's elements in document order; a page's own html, head and body are
 * left out (what they hold is at the top), and any attribute on them is
 * reported in `page`; an event handler attribute (on and ASCII letters) on
 * any element is reported in `live`: no view sets one.
 * @param {any} node @param {string[]} [page] @param {string[]} [live] @returns {Node[]}
 */
function parsed(node, page, live = []) {
  /** @type {Node[]} */
  const out = [];
  /** @param {any} n @param {number} parent */
  const walk = (n, parent) => {
    let here = parent;
    for (const a of n.attrs ?? []) if (/^on[a-z]+$/.test(a.name)) live.push(`${n.tagName}[${a.name}]`);
    if (page !== undefined && n.namespaceURI === HTML && ['html', 'head', 'body'].includes(n.tagName)) {
      for (const a of n.attrs) page.push(`${n.tagName}[${a.name}]`);
    } else if (n.tagName !== undefined) {
      const kids = n.childNodes ?? [];
      here = out.length;
      const style = n.attrs.find((/** @type {any} */ a) => a.name === 'style')?.value;
      /** @type {Record<string, string>} */
      const attrs = Object.create(null);
      for (const a of n.attrs) if (a.name !== 'style') attrs[a.name] = a.value;
      out.push({ tag: lower(n.tagName), ns: n.namespaceURI, parent, text: kids.every((/** @type {any} */ c) => c.nodeName === '#text') ? kids.map((/** @type {any} */ c) => c.value).join('') : null, kept: true, style: style === undefined ? null : names(style), attrs });
    }
    for (const c of n.childNodes ?? []) walk(c, here);
  };
  walk(node, -1);
  return out;
}

/**
 * The property names of a style attribute's declarations, as a CSS parser
 * splits them: at a ';' outside strings, brackets and comments.
 * @param {string} text @returns {string[]}
 */
function names(text) {
  const out = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  const take = (/** @type {number} */ end) => {
    const part = text.slice(start, end);
    const bare = part.replace(/\/\*[\s\S]*?(\*\/|$)/g, ' ');
    const colon = bare.indexOf(':');
    if (bare.trim() !== '') out.push(lower((colon < 0 ? bare : bare.slice(0, colon)).trim()));
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote === '' && c === '/' && text[i + 1] === '*') {
      // A comment is nothing (its ';' ends no declaration).
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
    } else if (c === '\\') i++;
    else if (quote !== '') {
      if (c === quote || c === '\n') quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) {
      take(i);
      start = i + 1;
    }
  }
  take(text.length);
  return out;
}

/** CR and CRLF read as LF, as the parser's input stream does. @param {string} s */
const lines = s => s.replace(/\r\n?/g, '\n');
/** Text a parser read raw where it was escaped: shown with its entities, but the same text. @param {string} s */
const entities = s => s.replace(/&#x1B;/g, '\x1b').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
/** A style's or a script's own escapes: the same text to CSS, a script string and JSON. @param {string} s */
const escapes = s => s.replace(/<\\\//g, '</').replace(/\\u003C!--/g, '<!--').replace(/\\u001B/g, '\x1b').replace(/\\1b /g, '\x1b');

/** Why a view's markup does not parse back to it, or '' when it does. @param {View} view */
function fault(view) {
  const bad = hostile(view);
  let built;
  try {
    built = build(view);
  } catch (error) {
    return bad ? '' : `building threw: ${error}`;
  }
  if (bad) return 'a hostile tag name or a node field prop was accepted';
  const markup = serialize(built);
  const want = elements(view);
  // A frameset keeps no structure to compare (see above): only what the view made may be parsed.
  const loose = want.some(w => w.tag === 'frameset');
  if (loose) for (const w of want) w.kept = false;
  /** @type {string[]} */
  const live = [];
  const fragment = parsed(parseFragment(markup, { scriptingEnabled: true }), undefined, live);
  if (live.length > 0) return `live event handler attributes: ${live.join(' ')}; markup ${JSON.stringify(markup)}`;
  for (const [where, prefix] of [['page', '<!doctype html>'], ['page body', '<!doctype html><body>']]) {
    /** @type {string[]} */
    const page = [];
    const got = parsed(parse(prefix + markup, { scriptingEnabled: true }), page);
    if (page.length > 0) return `${where}: attributes made on the page's own elements: ${page.join(' ')}; markup ${JSON.stringify(markup)}`;
    const why = compare(want, got, markup, loose);
    if (why !== '') return `${where}: ${why}`;
  }
  return compare(want, fragment, markup, loose);
}

/** Whether a view holds a tag name or a prop the Document must refuse. @param {View} view @returns {boolean} */
function hostile(view) {
  const [tag, , ...children] = view;
  return BAD.includes(tag) || children.some(c => (Array.isArray(c) ? hostile(c) : typeof c !== 'string' && Object.keys(c.props).some(name => FIELDS.includes(name) || /[\0-\x1f\x7f]/.test(name) || (tag === 'template' && lower(name) === 'shadowrootmode'))));
}

/**
 * Why a parsed tree is not the view's, or ''.
 * @param {Node[]} want @param {Node[]} got @param {string} markup @param {boolean} loose parents not compared (a frameset's view)
 */
function compare(want, got, markup, loose) {
  const show = (/** @type {Node} */ n) => `${n.tag}(${n.ns.split('/').pop()}) under #${n.parent}`;
  // Each element parsed is the next one the view made with its tag and namespace, under the same parent.
  /** @type {number[]} */
  const to = [];
  let from = 0;
  for (const [i, g] of got.entries()) {
    const parent = g.parent < 0 ? -1 : to[g.parent];
    let j = from;
    while (j < want.length && !(want[j].tag === g.tag && want[j].ns === g.ns && (loose || want[j].parent === parent))) j++;
    if (j === want.length) return `element parsed that the view did not make there: ${show(g)} (parsed #${i}); markup ${JSON.stringify(markup)}`;
    to.push(j);
    from = j + 1;
    // A style attribute holds only declarations of the names the view set: none more (and none from text).
    const extra = (g.style ?? []).filter(name => !(want[j].style ?? []).includes(name));
    if (extra.length > 0) return `declarations the view did not set: ${extra.join(' ')} on ${show(g)}; markup ${JSON.stringify(markup)}`;
    // Its attributes are the view's, under the names a parser reads back, with their values.
    // (The parser reads CR and CRLF as LF, in values too.)
    const had = JSON.stringify(Object.entries(want[j].attrs).map(([k, v]) => [k, lines(v)]).sort());
    const got = JSON.stringify(Object.entries(g.attrs).sort());
    if (!loose && had !== got) return `attributes ${got} where the view made ${had} on ${show(g)}; markup ${JSON.stringify(markup)}`;
  }
  const found = new Set(to);
  for (const [j, w] of want.entries()) {
    if (w.kept && !found.has(j)) return `element lost: ${show(w)} (made #${j}); markup ${JSON.stringify(markup)}`;
    if (!w.kept || w.text === null) continue;
    const back = got[to.indexOf(j)].text ?? '';
    const same = [back, entities(back), escapes(back), lines(escapes(back))].includes(lines(w.text));
    if (!same) return `text of ${w.tag}: ${JSON.stringify(w.text)} parsed as ${JSON.stringify(back)}; markup ${JSON.stringify(markup)}`;
  }
  return '';
}

/**
 * The smallest view that still fails: a view replaced by one of its
 * children, children and text dropped, props dropped one at a time (a
 * style's keys too) and their text shortened, one at a time, while it does.
 * A child replaces the view only where the generator could make it at the
 * top: an HTML element, or an svg or math root. Another lifted out of its
 * context (a MathML malignmark alone, say) is a view the generator never
 * makes, which the model of the parse does not cover.
 * @param {View} view @returns {View}
 */
function shrink(view) {
  // The same failure, less its markup, the elements' indices and the texts it quotes (which a smaller view
  // changes), not another a smaller view happens to have: every page fault starts 'page:', so its first words
  // say nothing.
  const kind = (/** @type {string} */ why) => why.replace(/; markup .*$/s, '').replace(/#-?\d+/g, '#').replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const first = kind(fault(view));
  /** Props with one less (a style object's keys too), or one's text a character shorter. @param {Record<string, any>} props @returns {Record<string, any>[]} */
  const fewer = props => {
    /** @type {Record<string, any>[]} */
    const out = [];
    for (const [key, value] of Object.entries(props)) {
      const rest = Object.fromEntries(Object.entries(props).filter(([k]) => k !== key));
      if (Object.keys(props).length > 1) out.push(rest);
      if (typeof value === 'string' && value.length > 1) out.push({ ...props, [key]: value.slice(1) }, { ...props, [key]: value.slice(0, -1) });
      if (key === 'style' && value !== null && typeof value === 'object') for (const style of fewer(value)) out.push({ ...props, style });
    }
    return out;
  };
  for (let changed = true; changed; ) {
    changed = false;
    /** @param {View} v @returns {View[]} */
    const smaller = v => {
      const [tag, ns, ...children] = v;
      /** @type {View[]} */
      const out = [];
      children.forEach((c, i) => {
        // The child alone, in place of the view around it, where the generator could make it there.
        if (Array.isArray(c) && (c[1] === null || c[1] === HTML || c[0] === 'svg' || c[0] === 'math')) out.push(c);
        out.push([tag, ns, ...children.slice(0, i), ...children.slice(i + 1)]);
        if (typeof c === 'string' && c.length > 1) out.push([tag, ns, ...children.slice(0, i), c.slice(1), ...children.slice(i + 1)], [tag, ns, ...children.slice(0, i), c.slice(0, -1), ...children.slice(i + 1)]);
        if (Array.isArray(c)) for (const s of smaller(c)) out.push([tag, ns, ...children.slice(0, i), s, ...children.slice(i + 1)]);
        else if (typeof c !== 'string') for (const props of fewer(c.props)) out.push([tag, ns, ...children.slice(0, i), { props }, ...children.slice(i + 1)]);
      });
      return out;
    };
    for (const candidate of smaller(view))
      if (fault(candidate) !== '' && kind(fault(candidate)) === first) {
        view = candidate;
        changed = true;
        break;
      }
  }
  return view;
}

test('every view parses back to the same elements and text', { timeout: 30000 }, () => {
  for (const seed of SEEDS) {
    const next = views(seed);
    for (let run = 0; run < RUNS; run++) {
      const view = next();
      if (fault(view) === '') continue;
      const small = shrink(view);
      assert.fail(`seed ${seed}, run ${run}: ${fault(small)}\n  smallest failing view: ${JSON.stringify(small)}`);
    }
  }
});
