// A minimal document for static rendering: the part of the DOM ren-dom uses
// (elements, text, attributes, styles, a few reflected properties, cloning,
// ranges), no layout, no events, no scripts, and an HTML serializer.
// Properties that a browser keeps out of the markup (`value`, `checked`,
// `selected`) are written to attributes here, so the static page shows them;
// a select's value marks its matching option selected.

const SVG = 'http://www.w3.org/2000/svg';
const MATHML = 'http://www.w3.org/1998/Math/MathML';
/**
 * The SVG attribute names the HTML parser gives back their case (the HTML
 * standard's "adjust SVG attributes", 13.2.6.5): it lowercases every other.
 */
const SVG_NAMES = new Map(
  [
    'attributeName', 'attributeType', 'baseFrequency', 'baseProfile', 'calcMode', 'clipPathUnits', 'diffuseConstant', 'edgeMode',
    'filterUnits', 'glyphRef', 'gradientTransform', 'gradientUnits', 'kernelMatrix', 'kernelUnitLength', 'keyPoints', 'keySplines',
    'keyTimes', 'lengthAdjust', 'limitingConeAngle', 'markerHeight', 'markerUnits', 'markerWidth', 'maskContentUnits', 'maskUnits',
    'numOctaves', 'pathLength', 'patternContentUnits', 'patternTransform', 'patternUnits', 'pointsAtX', 'pointsAtY', 'pointsAtZ',
    'preserveAlpha', 'preserveAspectRatio', 'primitiveUnits', 'refX', 'refY', 'repeatCount', 'repeatDur', 'requiredExtensions',
    'requiredFeatures', 'specularConstant', 'specularExponent', 'spreadMethod', 'startOffset', 'stdDeviation', 'stitchTiles',
    'surfaceScale', 'systemLanguage', 'tableValues', 'targetX', 'targetY', 'textLength', 'viewBox', 'viewTarget', 'xChannelSelector',
    'yChannelSelector', 'zoomAndPan',
  ].map(name => [name.toLowerCase(), name]),
);
/** The attribute names the HTML parser reads back namespaced in foreign content (13.2.6.5, "adjust foreign attributes"). */
const XML_NAMES = new Set(['xlink:actuate', 'xlink:arcrole', 'xlink:href', 'xlink:role', 'xlink:show', 'xlink:title', 'xlink:type', 'xml:lang', 'xml:space', 'xmlns', 'xmlns:xlink']);
/** The refusal of a shadow root, attached or declared. */
const SHADOW = 'REN html: shadow roots are not rendered by $html; use $dom';
/** The input types whose value is their value attribute (the HTML standard's value modes default and default/on). */
const ATTRIBUTE_VALUED = new Set(['hidden', 'checkbox', 'radio', 'submit', 'reset', 'button', 'image']);
/** Elements whose first newline the parser drops, right after the start tag. */
const LEADING = new Set(['textarea', 'pre', 'listing']);
/** Elements without an end tag. */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'param', 'keygen', 'frame', 'basefont', 'bgsound']);
/** The raw text elements ren-dom makes: their text is written unescaped in HTML context (see serialize). */
const RAW = new Set(['style', 'script']);
/**
 * The names that end a walk up for foreign content: svg and math, and the
 * HTML integration points inside them (svg's foreignObject, desc and title;
 * math's mi, mo, mn, ms, mtext and annotation-xml), all compared lowercase.
 */
const FOREIGN = new Set(['svg', 'math', 'foreignobject', 'desc', 'title', 'mi', 'mo', 'mn', 'ms', 'mtext', 'annotation-xml']);
/**
 * The HTML elements whose content a parser does not read as tags, from the
 * HTML standard's parsing section (13.2): those whose start tag switches the
 * tokenizer out of its data state, and those whose insertion mode ignores
 * most start tags.
 * - RAWTEXT (13.2.5.3): style, xmp, iframe, noembed, noframes, and noscript
 *   when scripting is on (13.2.6.4.4 "in head", 13.2.6.4.7 "in body").
 * - RCDATA (13.2.5.2): title, textarea (13.2.6.4.4, 13.2.6.4.7).
 * - Script data (13.2.5.4): script.
 * - PLAINTEXT (13.2.5.5): plaintext, which no end tag ends (13.2.6.4.7).
 * - "in select" and "in select in table" (13.2.6.4.16, 13.2.6.4.17): select,
 *   inside which a style's tag is ignored and its text read as the select's.
 * - "in frameset" (13.2.6.4.20): frameset, which ignores every start tag but
 *   frameset, frame and noframes, so a style's text there is tags (an `<html>`
 *   start tag in it puts its attributes on the page's own html element).
 *   "after frameset" and "after after frameset" (13.2.6.4.21, 13.2.6.4.23) do
 *   the same after it ends: a tree that holds a frameset has no raw text
 *   (`framed`).
 * The other modes that ignore some start tags read a style or a script as
 * such: "in table", "in table body", "in row" and "in column group" pass them
 * to "in head" (13.2.6.4.9, .12, .13, .14), "after body" reprocesses them "in
 * body" (13.2.6.4.22).
 */
const OPAQUE = new Set(['style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'title', 'textarea', 'plaintext', 'select', 'frameset']);
/** Boolean properties, reflected as present or absent attributes (property → attribute); a default is its attribute. */
const FLAGS = new Map([
  ['checked', 'checked'], ['disabled', 'disabled'], ['readOnly', 'readonly'], ['required', 'required'], ['selected', 'selected'],
  ['multiple', 'multiple'], ['autofocus', 'autofocus'], ['open', 'open'], ['defaultChecked', 'checked'], ['defaultSelected', 'selected'],
  // A media element's muted is written as a flag, as checked is: a static page's video then still autoplays.
  ['muted', 'muted'], ['defaultMuted', 'muted'],
  ['inert', 'inert'], ['async', 'async'], ['defer', 'defer'], ['noModule', 'nomodule'], ['controls', 'controls'], ['autoplay', 'autoplay'],
  ['loop', 'loop'], ['playsInline', 'playsinline'], ['noValidate', 'novalidate'], ['formNoValidate', 'formnovalidate'],
  ['reversed', 'reversed'], ['default', 'default'], ['isMap', 'ismap'], ['allowFullscreen', 'allowfullscreen'],
  ['disablePictureInPicture', 'disablepictureinpicture'], ['disableRemotePlayback', 'disableremoteplayback'],
  ['webkitdirectory', 'webkitdirectory'], ['noShade', 'noshade'], ['noWrap', 'nowrap'], ['compact', 'compact'],
  ['noResize', 'noresize'], ['noHref', 'nohref'], ['declare', 'declare'],
  ['shadowRootDelegatesFocus', 'shadowrootdelegatesfocus'], ['shadowRootClonable', 'shadowrootclonable'],
  ['shadowRootSerializable', 'shadowrootserializable'],
  ['headingReset', 'headingreset'], ['alpha', 'alpha'], ['trueSpeed', 'truespeed'],
]);
/** Boolean properties reflected as a word, as a browser writes them (property → [attribute, true word, false word]). */
const WORDS = new Map([
  ['spellcheck', ['spellcheck', 'true', 'false']], ['draggable', ['draggable', 'true', 'false']], ['translate', ['translate', 'yes', 'no']],
  // A boolean (Chrome's IDL too): autocorrect="off" is truthy, so Chrome writes "on", and false "off".
  ['autocorrect', ['autocorrect', 'on', 'off']],
]);
/** String properties reflected as attributes (property → attribute). */
const REFLECT = new Map([
  ['id', 'id'], ['title', 'title'], ['lang', 'lang'], ['dir', 'dir'], ['href', 'href'], ['src', 'src'], ['alt', 'alt'],
  ['type', 'type'], ['name', 'name'], ['placeholder', 'placeholder'], ['htmlFor', 'for'], ['tabIndex', 'tabindex'],
  ['rows', 'rows'], ['cols', 'cols'], ['min', 'min'], ['max', 'max'], ['step', 'step'], ['pattern', 'pattern'],
  ['action', 'action'], ['method', 'method'], ['target', 'target'], ['rel', 'rel'], ['width', 'width'], ['height', 'height'],
  ['colSpan', 'colspan'], ['rowSpan', 'rowspan'], ['maxLength', 'maxlength'], ['autocomplete', 'autocomplete'], ['role', 'role'],
  ['httpEquiv', 'http-equiv'], ['acceptCharset', 'accept-charset'], ['encoding', 'enctype'],
  ['minLength', 'minlength'], ['size', 'size'], ['start', 'start'], ['span', 'span'],
  // The rest the HTML standard's IDL reflects (test/fixtures/reflected.js); a DOMTokenList one (relList,
  // sizes, blocking, sandbox) is set through its value, a string.
  ['accessKey', 'accesskey'], ['writingSuggestions', 'writingsuggestions'], ['autocapitalize', 'autocapitalize'],
  ['enterKeyHint', 'enterkeyhint'], ['inputMode', 'inputmode'], ['headingOffset', 'headingoffset'],
  ['media', 'media'], ['integrity', 'integrity'], ['hreflang', 'hreflang'], ['imageSrcset', 'imagesrcset'], ['imageSizes', 'imagesizes'],
  ['content', 'content'], ['cite', 'cite'], ['download', 'download'], ['ping', 'ping'], ['dateTime', 'datetime'],
  ['srcset', 'srcset'], ['sizes', 'sizes'], ['useMap', 'usemap'], ['allow', 'allow'], ['data', 'data'], ['poster', 'poster'],
  ['srclang', 'srclang'], ['label', 'label'], ['coords', 'coords'], ['shape', 'shape'], ['headers', 'headers'], ['abbr', 'abbr'],
  ['accept', 'accept'], ['dirName', 'dirname'], ['formAction', 'formaction'], ['formTarget', 'formtarget'], ['command', 'command'],
  ['wrap', 'wrap'], ['closedBy', 'closedby'], ['shadowRootCustomElementRegistry', 'shadowrootcustomelementregistry'],
  ['crossOrigin', 'crossorigin'], ['referrerPolicy', 'referrerpolicy'], ['fetchPriority', 'fetchpriority'], ['decoding', 'decoding'],
  ['loading', 'loading'], ['kind', 'kind'], ['preload', 'preload'], ['scope', 'scope'], ['enctype', 'enctype'],
  ['formEnctype', 'formenctype'], ['formMethod', 'formmethod'], ['popoverTargetAction', 'popovertargetaction'],
  ['relList', 'rel'], ['blocking', 'blocking'], ['sandbox', 'sandbox'], ['low', 'low'], ['high', 'high'], ['optimum', 'optimum'],
  // Obsolete, still reflected.
  ['behavior', 'behavior'], ['bgColor', 'bgcolor'], ['direction', 'direction'], ['scrolling', 'scrolling'],
  ['frameBorder', 'frameborder'], ['longDesc', 'longdesc'], ['marginHeight', 'marginheight'], ['marginWidth', 'marginwidth'],
  ['charset', 'charset'], ['rev', 'rev'], ['text', 'text'], ['link', 'link'], ['vLink', 'vlink'], ['aLink', 'alink'],
  ['background', 'background'], ['clear', 'clear'], ['align', 'align'], ['ch', 'char'], ['chOff', 'charoff'], ['vAlign', 'valign'],
  ['color', 'color'], ['face', 'face'], ['version', 'version'], ['lowsrc', 'lowsrc'], ['border', 'border'], ['scheme', 'scheme'],
  ['archive', 'archive'], ['code', 'code'], ['standby', 'standby'], ['codeBase', 'codebase'], ['codeType', 'codetype'],
  ['valueType', 'valuetype'], ['event', 'event'], ['frame', 'frame'], ['rules', 'rules'], ['summary', 'summary'],
  ['cellPadding', 'cellpadding'], ['cellSpacing', 'cellspacing'], ['axis', 'axis'],
  ['hspace', 'hspace'], ['vspace', 'vspace'], ['scrollAmount', 'scrollamount'], ['scrollDelay', 'scrolldelay'],
]);

/**
 * @typedef {{ long?: boolean, double?: boolean, fallback?: number, positive?: boolean, withFallback?: boolean, nonNegative?: boolean, clamp?: [number, number] }} Numeric
 * How a numeric reflected property converts, per owner (`*` for every
 * element), as the HTML standard's IDL declares it: a long is ToInt32; an
 * unsigned long ToUint32, set when 0..2147483647 (1.. when limited to
 * positive numbers) and its default otherwise. Limited to positive numbers, 0
 * throws, and with fallback (`withFallback`: a textarea's rows and cols) 0
 * writes the default instead; limited to non-negative ones, a negative throws.
 * Clamped, it reads back within its range and writes as unclamped. A double is
 * written as JavaScript writes the number; a non-finite one throws, and one
 * limited to positive numbers is ignored unless above 0. An owner missing
 * here (an iframe's, embed's or object's width, a frameset's rows) is a DOMString.
 * @type {Map<string, Record<string, Numeric>>}
 */
const NUMERIC = new Map(Object.entries(/** @type {Record<string, Record<string, Numeric>>} */ ({
  // Read back, a tabIndex's default is 0 on the focusable elements and -1 elsewhere.
  tabIndex: Object.fromEntries([['*', -1], ...['a', 'area', 'button', 'frame', 'iframe', 'input', 'object', 'select', 'textarea'].map((tag) => [tag, 0])].map(([tag, fallback]) => [tag, { long: true, fallback: /** @type {number} */ (fallback) }])),
  start: { ol: { long: true, fallback: 1 } },
  maxLength: { input: { long: true, nonNegative: true, fallback: -1 }, textarea: { long: true, nonNegative: true, fallback: -1 } },
  minLength: { input: { long: true, nonNegative: true, fallback: -1 }, textarea: { long: true, nonNegative: true, fallback: -1 } },
  width: { img: {}, canvas: { fallback: 300 }, video: {}, input: {}, source: {}, ...Object.fromEntries(['pre', 'listing', 'xmp'].map((tag) => [tag, { long: true, fallback: 0 }])) },
  height: { img: {}, canvas: { fallback: 150 }, video: {}, input: {}, source: {} },
  colSpan: { td: { fallback: 1, clamp: [1, 1000] }, th: { fallback: 1, clamp: [1, 1000] } },
  rowSpan: { td: { fallback: 1, clamp: [0, 65534] }, th: { fallback: 1, clamp: [0, 65534] } },
  rows: { textarea: { positive: true, withFallback: true, fallback: 2 } },
  cols: { textarea: { positive: true, withFallback: true, fallback: 20 } },
  size: { input: { positive: true, fallback: 20 }, select: {} },
  span: { col: { fallback: 1, clamp: [1, 1000] }, colgroup: { fallback: 1, clamp: [1, 1000] } },
  headingOffset: { '*': { clamp: [0, 8] } },
  hspace: { img: {}, object: {}, marquee: {} },
  vspace: { img: {}, object: {}, marquee: {} },
  scrollAmount: { marquee: { fallback: 6 } },
  scrollDelay: { marquee: { fallback: 85 } },
  min: { meter: { double: true } },
  max: { meter: { double: true, fallback: 1 }, progress: { double: true, positive: true, fallback: 1 } },
  low: { meter: { double: true } },
  high: { meter: { double: true } },
  optimum: { meter: { double: true } },
})));
/** The integer an attribute holds, by the standard's rules for parsing integers, or null. @param {string | undefined} text */
function integer(text) {
  const match = text === undefined ? null : /^[\t\n\f\r ]*([+-]?)([0-9]+)/.exec(text);
  return match === null ? null : (match[1] === '-' ? -1 : 1) * Number(match[2]);
}
/** A numeric property's value, read from its attribute. @param {Numeric} rule @param {string | undefined} text */
function numberOf(rule, text) {
  if (rule.double) {
    const n = text === undefined ? NaN : Number.parseFloat(text);
    return Number.isFinite(n) && (!rule.positive || n > 0) ? n : (rule.fallback ?? 0);
  }
  const n = integer(text);
  if (rule.long) return n !== null && n >= (rule.nonNegative ? 0 : -2147483648) && n <= 2147483647 ? n : (rule.fallback ?? 0);
  // Non-negative integer parsing: a negative is an error.
  const min = rule.clamp ? rule.clamp[0] : rule.positive ? 1 : 0;
  const max = rule.clamp ? rule.clamp[1] : 2147483647;
  if (n !== null && n >= 0) {
    if (n >= min && n <= max) return n;
    if (rule.clamp) return n < min ? min : max;
  }
  return rule.fallback ?? min;
}
/** The attribute a numeric property writes for `value`, by its IDL conversion, or null to keep it. @param {Numeric} rule @param {unknown} value */
function attributeOf(rule, value) {
  if (rule.double) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new TypeError(`The provided double value is non-finite: ${String(value)}`);
    return rule.positive && n <= 0 ? null : String(n);
  }
  if (rule.long) {
    const n = Number(value) | 0;
    if (rule.nonNegative && n < 0) throw new DOMException(`The value provided (${n}) is negative.`, 'IndexSizeError');
    return String(n);
  }
  const u = Number(value) >>> 0;
  if (rule.positive && !rule.withFallback && u === 0) throw new DOMException('The value provided is 0, which is an invalid size.', 'IndexSizeError');
  return String(u >= (rule.positive ? 1 : 0) && u <= 2147483647 ? u : (rule.fallback ?? 0));
}

/**
 * The HTML elements that own a property, as a browser's interfaces do (the
 * others, id, title, tabIndex, the words and the flags every element has,
 * are on every element). Elsewhere the name is no property: ren-dom writes
 * the prop as an attribute, and so does ren-html.
 * @type {Record<string, string[]>}
 */
const OWNERS = Object.assign(Object.create(null), {
  href: ['a', 'area', 'link', 'base'],
  src: ['img', 'script', 'iframe', 'embed', 'audio', 'video', 'source', 'track', 'input', 'frame'],
  alt: ['img', 'area', 'input'],
  // Read-only on a textarea, select, output and fieldset: their kind.
  type: ['input', 'button', 'script', 'link', 'source', 'embed', 'object', 'ol', 'style', 'a', 'area', 'li', 'param', 'ul', 'textarea', 'select', 'output', 'fieldset'],
  name: ['input', 'button', 'select', 'textarea', 'form', 'iframe', 'map', 'meta', 'output', 'fieldset', 'object', 'slot', 'a', 'param', 'details', 'frame', 'embed', 'img'],
  placeholder: ['input', 'textarea'],
  htmlFor: ['label', 'output', 'template', 'script'],
  rows: ['textarea', 'frameset'],
  cols: ['textarea', 'frameset'],
  min: ['input', 'meter'],
  max: ['input', 'meter', 'progress'],
  step: ['input'],
  pattern: ['input'],
  action: ['form'],
  method: ['form'],
  target: ['a', 'area', 'base', 'form', 'link'],
  rel: ['a', 'area', 'link', 'form'],
  // A string on an iframe, embed, object and the obsolete owners (td, table, marquee...); a number elsewhere.
  width: ['img', 'canvas', 'iframe', 'embed', 'object', 'video', 'input', 'source', 'pre', 'listing', 'xmp', 'td', 'th', 'col', 'colgroup', 'hr', 'table', 'marquee'],
  height: ['img', 'canvas', 'iframe', 'embed', 'object', 'video', 'input', 'source', 'td', 'th', 'marquee'],
  colSpan: ['td', 'th'],
  rowSpan: ['td', 'th'],
  maxLength: ['input', 'textarea'],
  minLength: ['input', 'textarea'],
  size: ['input', 'select', 'font', 'hr'],
  start: ['ol'],
  span: ['col', 'colgroup'],
  autocomplete: ['input', 'form', 'select', 'textarea'],
  httpEquiv: ['meta'],
  acceptCharset: ['form'],
  checked: ['input'],
  defaultChecked: ['input'],
  disabled: ['button', 'input', 'select', 'textarea', 'optgroup', 'option', 'fieldset', 'link'],
  readOnly: ['input', 'textarea'],
  required: ['input', 'select', 'textarea'],
  selected: ['option'],
  defaultSelected: ['option'],
  multiple: ['input', 'select'],
  open: ['details', 'dialog'],
  value: ['input', 'select', 'textarea', 'option', 'button', 'output', 'li', 'data', 'param', 'meter', 'progress'],
  defaultValue: ['input', 'textarea', 'output'],
  indeterminate: ['input'],
  shadowRootMode: ['template'],
  valueAsNumber: ['input'],
  valueAsDate: ['input'],
  selectionStart: ['input', 'textarea'],
  selectionEnd: ['input', 'textarea'],
  selectionDirection: ['input', 'textarea'],
  volume: ['audio', 'video'],
  currentTime: ['audio', 'video'],
  muted: ['audio', 'video'],
  defaultMuted: ['audio', 'video'],
  async: ['script'],
  defer: ['script'],
  noModule: ['script'],
  controls: ['audio', 'video', 'img'],
  autoplay: ['audio', 'video'],
  loop: ['audio', 'video'],
  playsInline: ['video'],
  noValidate: ['form'],
  formNoValidate: ['button', 'input'],
  reversed: ['ol'],
  default: ['track'],
  isMap: ['img'],
  allowFullscreen: ['iframe'],
  disablePictureInPicture: ['video'],
  disableRemotePlayback: ['audio', 'video'],
  webkitdirectory: ['input'],
  noShade: ['hr'],
  noWrap: ['td', 'th'],
  compact: ['ol', 'ul', 'dl', 'menu', 'dir'],
  noResize: ['frame'],
  noHref: ['area'],
  declare: ['object'],
  // A template's other shadow-root flags only reflect: without shadowrootmode no parser attaches a root.
  shadowRootDelegatesFocus: ['template'],
  shadowRootClonable: ['template'],
  shadowRootSerializable: ['template'],
  // The rest the HTML standard's IDL reflects, obsolete ones included (test/fixtures/reflected.js).
  media: ['link', 'meta', 'style', 'source'],
  integrity: ['link', 'script'],
  hreflang: ['link', 'a', 'area'],
  imageSrcset: ['link'],
  imageSizes: ['link'],
  content: ['meta'],
  cite: ['blockquote', 'q', 'ins', 'del'],
  download: ['a', 'area'],
  ping: ['a', 'area'],
  dateTime: ['time', 'ins', 'del'],
  srcset: ['source', 'img'],
  sizes: ['source', 'img', 'link'],
  useMap: ['img', 'input', 'object'],
  allow: ['iframe'],
  data: ['object'],
  poster: ['video'],
  srclang: ['track'],
  label: ['track', 'optgroup', 'option'],
  coords: ['area', 'a'],
  shape: ['area', 'a'],
  headers: ['td', 'th'],
  abbr: ['td', 'th'],
  accept: ['input'],
  dirName: ['input', 'textarea'],
  formAction: ['input', 'button'],
  formTarget: ['input', 'button'],
  command: ['button'],
  wrap: ['textarea'],
  closedBy: ['dialog'],
  shadowRootCustomElementRegistry: ['template'],
  crossOrigin: ['link', 'img', 'audio', 'video', 'script'],
  referrerPolicy: ['link', 'a', 'img', 'iframe', 'area', 'script'],
  fetchPriority: ['link', 'img', 'script'],
  decoding: ['img'],
  loading: ['img', 'iframe', 'audio', 'video'],
  kind: ['track'],
  preload: ['audio', 'video'],
  scope: ['td', 'th'],
  enctype: ['form'],
  // A form's encoding is its enctype, as a browser's IDL reflects it.
  encoding: ['form'],
  formEnctype: ['input', 'button'],
  formMethod: ['input', 'button'],
  popoverTargetAction: ['button', 'input'],
  relList: ['link', 'a', 'area', 'form'],
  blocking: ['link', 'style', 'script'],
  sandbox: ['iframe'],
  low: ['meter'],
  high: ['meter'],
  optimum: ['meter'],
  behavior: ['marquee'],
  bgColor: ['marquee', 'body', 'table', 'td', 'th', 'tr'],
  direction: ['marquee'],
  scrolling: ['frame', 'iframe'],
  frameBorder: ['frame', 'iframe'],
  longDesc: ['frame', 'iframe', 'img'],
  marginHeight: ['frame', 'iframe'],
  marginWidth: ['frame', 'iframe'],
  charset: ['a', 'link', 'script'],
  rev: ['a', 'link'],
  // A body's text is its text colour; an a's, option's, script's or title's its content.
  text: ['body', 'a', 'option', 'script', 'title'],
  selectedIndex: ['select'],
  returnValue: ['dialog'],
  ...Object.fromEntries(['hash', 'search', 'pathname', 'host', 'hostname', 'port', 'protocol', 'username', 'password', 'origin'].map((part) => [part, ['a', 'area']])),
  link: ['body'],
  vLink: ['body'],
  aLink: ['body'],
  background: ['body'],
  clear: ['br'],
  align: ['caption', 'col', 'colgroup', 'div', 'embed', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'iframe', 'img', 'input', 'legend', 'object', 'p', 'table', 'thead', 'tbody', 'tfoot', 'td', 'th', 'tr'],
  ch: ['col', 'colgroup', 'thead', 'tbody', 'tfoot', 'td', 'th', 'tr'],
  chOff: ['col', 'colgroup', 'thead', 'tbody', 'tfoot', 'td', 'th', 'tr'],
  vAlign: ['col', 'colgroup', 'thead', 'tbody', 'tfoot', 'td', 'th', 'tr'],
  color: ['font', 'hr'],
  face: ['font'],
  version: ['html'],
  lowsrc: ['img'],
  border: ['img', 'object', 'table'],
  scheme: ['meta'],
  archive: ['object'],
  code: ['object'],
  standby: ['object'],
  codeBase: ['object'],
  codeType: ['object'],
  valueType: ['param'],
  event: ['script'],
  frame: ['table'],
  rules: ['table'],
  summary: ['table'],
  cellPadding: ['table'],
  cellSpacing: ['table'],
  axis: ['td', 'th'],
  hspace: ['marquee', 'img', 'object'],
  vspace: ['marquee', 'img', 'object'],
  scrollAmount: ['marquee'],
  scrollDelay: ['marquee'],
  alpha: ['input'],
  trueSpeed: ['marquee'],
  playbackRate: ['audio', 'video'],
  defaultPlaybackRate: ['audio', 'video'],
  srcObject: ['audio', 'video'],
});
/** Each owned property's accessor, for the prototypes of its owners. @type {Map<string, PropertyDescriptor>} */
const OWNED = new Map();
/** Each HTML tag's prototype: Element's, with the properties the tag owns. @type {Map<string, object>} */
const PROTOS = new Map();

/** A property on every element, or on its owners' prototypes only. @param {string} prop @param {PropertyDescriptor & ThisType<Element>} descriptor */
function property(prop, descriptor) {
  if (OWNERS[prop] === undefined) Object.defineProperty(Element.prototype, prop, descriptor);
  else OWNED.set(prop, descriptor);
}

/** The prototype of an HTML element named `tag`. @param {string} tag */
function protoOf(tag) {
  let proto = PROTOS.get(tag);
  if (proto === undefined) {
    proto = Object.create(Element.prototype);
    for (const [prop, descriptor] of OWNED) if (OWNERS[prop].includes(tag)) Object.defineProperty(proto, prop, descriptor);
    // A style's disabled turns its sheet off in a browser's CSSOM: it reflects no attribute.
    if (tag === 'style') Object.defineProperty(proto, 'disabled', { get: () => false, set: () => {} });
    PROTOS.set(tag, /** @type {object} */ (proto));
  }
  return /** @type {object} */ (proto);
}

/** The names the markup can hold: no whitespace, C0 control, DEL, quote, `<`, `>`, `/` or `=`. */
// No C0 control or DEL either: ESC could switch a page decoded as ISO-2022-JP.
const NAME = /^[^\s\0-\x1f\x7f"'<>/=]+$/;
/**
 * Refuses a name that would break out of its tag, as a browser's setAttribute
 * and createElement refuse invalid names (an InvalidCharacterError).
 * @param {string} name @returns {string}
 */
const named = name => {
  if (!NAME.test(name)) throw new DOMException(`"${name}" is not a valid name`, 'InvalidCharacterError');
  return name;
};
/** A tag name: an ASCII letter first, then no character a name may not hold. */
const TAG = /^[A-Za-z][^\s\0-\x1f\x7f"'<>/=]*$/;
/**
 * Refuses a tag name a browser's createElement refuses (an
 * InvalidCharacterError): one not starting with an ASCII letter would not be
 * a tag to a parser (`<!--x>` opens a comment a later raw style could close).
 * @param {string} tag @returns {string}
 */
const tagged = tag => {
  if (!TAG.test(tag)) throw new DOMException(`REN html: "${tag}" is not a valid tag name`, 'InvalidCharacterError');
  return tag;
};
/** @param {string} text */
// ESC (U+001B) is written as a reference: raw, it could switch a page decoded as ISO-2022-JP (with no declared
// charset) into two-byte text that swallows what follows.
const escapeText = text => text.replace(/&/g, '&amp;').replace(/\u00a0/g, '&nbsp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\x1b/g, '&#x1B;');
/** @param {string} text */
const escapeAttribute = text => text.replace(/&/g, '&amp;').replace(/\u00a0/g, '&nbsp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\x1b/g, '&#x1B;');
/**
 * ASCII lowercase, as a browser folds names: a Unicode fold would turn the
 * Kelvin sign (U+212A) into an ASCII k, making `onclicK` an onclick and
 * `linK` a link. @param {string} s
 */
const lower = s => s.replace(/[A-Z]+/g, c => c.toLowerCase());
/** ASCII uppercase, as a browser's tagName. @param {string} s */
const upper = s => s.replace(/[a-z]+/g, c => c.toUpperCase());
/** camelCase to kebab-case. @param {string} name */
const kebab = name => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

/**
 * The tree's own state, for this module only: every internal field is a
 * private one, read by the public getters (which, as a browser's, cannot be
 * assigned: ren-dom writes any prop that is `in` a node) and by these.
 */
/** @type {{ parent: (n: Node) => Element | null, setParent: (n: Node, v: Element | null) => void, next: (n: Node) => Node | null, setNext: (n: Node, v: Node | null) => void, prev: (n: Node) => Node | null, setPrev: (n: Node, v: Node | null) => void }} */
let N;

class Node {
  /** @type {Document} */ #doc;
  /** @type {Element | null} */ #parent = null;
  /** @type {Node | null} */ #next = null;
  /** @type {Node | null} */ #prev = null;
  static {
    N = {
      parent: n => n.#parent,
      setParent: (n, v) => void (n.#parent = v),
      next: n => n.#next,
      setNext: (n, v) => void (n.#next = v),
      prev: n => n.#prev,
      setPrev: (n, v) => void (n.#prev = v),
    };
  }
  /** @param {Document} doc */
  constructor(doc) {
    this.#doc = doc;
  }
  get ownerDocument() {
    return this.#doc;
  }
  get parentNode() {
    return this.#parent;
  }
  get nextSibling() {
    return this.#next;
  }
  get previousSibling() {
    return this.#prev;
  }
  /** Events do not happen in a static document. */
  addEventListener() {}
  removeEventListener() {}
}

/** @type {(t: Text) => string} */
let textOf;

export class Text extends Node {
  /** @type {string} */ #data;
  static {
    textOf = t => t.#data;
  }
  /** @param {Document} doc @param {string} data */
  constructor(doc, data) {
    super(doc);
    this.#data = String(data);
  }
  get nodeType() {
    return 3;
  }
  get data() {
    return this.#data;
  }
  set data(value) {
    this.#data = String(value ?? '');
  }
  get textContent() {
    return this.#data;
  }
  set textContent(value) {
    this.#data = String(value ?? '');
  }
  /** @param {boolean} _deep */
  cloneNode(_deep) {
    return new Text(this.ownerDocument, this.#data);
  }
}

/** A CSS property name, as ren-dom checks one: a custom property (`--x`) or a (vendor-prefixed) name. */
const PROPERTY = /^-{0,2}[a-zA-Z][-a-zA-Z0-9]*$/;

// The value tokenizer of ren-dom's state rules (its `sealed`), the same code: ren-dom exports
// no checker (its public contract is frozen), so the two are kept in step by hand and by the tests.
const HEX = /^[0-9a-fA-F]$/;
/** A code point that goes on a name: a letter, a digit, `_`, `-` or anything past ASCII. */
const NAME_CHAR = /^[-\w\u0080-\uffff]$/;
/** What an unquoted url may not hold (a bad url in CSS): a quote, a parenthesis, a non-printable. */
const BAD_URL = /^["'(\u0000-\u0008\u000b\u000e-\u001f\u007f]$/;

/**
 * Whether a value closes everything it opens, read by CSS Syntax's own
 * tokenizer: after its preprocessing (CRLF, CR and form feed are all a
 * newline), no string is left open or ended by a newline, no comment opens,
 * no bracket stays open, no escape is left dangling and no unquoted url goes
 * bad. Each of these reaches past the value in a stylesheet's text. A name
 * ending in `url` before `(` is read as a url too (a tokenizer may see one
 * there, and a name that only ends in it, `rurl(` or `#url(`, is a block),
 * so its contents must hold nothing a block would read differently: no
 * quote, parenthesis, bracket, comment or inner space.
 * @param {string} raw
 */
const sealed = raw => {
  const v = raw.replace(/\r\n?|\f/g, '\n');
  const n = v.length;
  /** @type {string[]} */
  const closers = [];
  /** The name just read, escapes decoded, or '' after anything else. */
  let name = '';
  let i = 0;
  /** Reads the escape at `i` (a backslash); `-1` when it is not a valid one. */
  const escape = () => {
    if (i + 1 >= n || v[i + 1] === '\n') return -1;
    let j = i + 1;
    let hex = '';
    while (j < n && hex.length < 6 && HEX.test(v[j])) hex += v[j++];
    if (hex === '') {
      name += v[i + 1];
      return i + 2;
    }
    if (j < n && (v[j] === ' ' || v[j] === '\t' || v[j] === '\n')) j++;
    const code = parseInt(hex, 16);
    name += code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? '\ufffd' : String.fromCodePoint(code);
    return j;
  };
  while (i < n) {
    const c = v[i];
    if (c === '\\') {
      i = escape();
      if (i < 0) return false;
      continue;
    }
    if (NAME_CHAR.test(c)) {
      name += c;
      i++;
      continue;
    }
    const before = name;
    name = '';
    if (c === '"' || c === "'") {
      for (i++; ; i++) {
        if (i >= n || v[i] === '\n') return false;
        if (v[i] === c) break;
        if (v[i] === '\\') {
          if (i + 1 >= n) return false;
          i++;
        }
      }
      i++;
    } else if (c === '/' && v[i + 1] === '*') return false;
    else if (c === '(' && lower(before).endsWith('url') && !/^[ \t\n]*["']/.test(v.slice(i + 1))) {
      for (i++; ; ) {
        if (i >= n) return false;
        const d = v[i];
        if (d === ')') break;
        // A bracket or a comment is nothing in a url, but a block (`rurl(`, `#url(`) would open or read it.
        if (BAD_URL.test(d) || d === '[' || d === ']' || (d === '/' && v[i + 1] === '*')) return false;
        if (d === ' ' || d === '\t' || d === '\n') {
          while (i < n && (v[i] === ' ' || v[i] === '\t' || v[i] === '\n')) i++;
          if (v[i] !== ')') return false;
          break;
        }
        if (d === '\\') {
          if (i + 1 >= n || v[i + 1] === '\n') return false;
          i += 2;
        } else i++;
      }
      i++;
    } else if (c === '(' || c === '[') {
      closers.push(c === '(' ? ')' : ']');
      i++;
    } else if (c === ')' || c === ']') {
      if (closers.pop() !== c) return false;
      i++;
    } else i++;
  }
  return closers.length === 0;
};


/**
 * Whether an inline style value is one declaration's value, as a browser's
 * CSSOM keeps one: `sealed` (nothing left open), no brace or newline, and no
 * `;` outside a string or an unquoted url, not even in brackets, where a
 * browser holds it but a lenient parser might start a declaration of its own.
 * A `;` or `<` inside a string stays (the attribute escapes it; a state
 * rule's stylesheet text is what refuses them there). No `!` either outside
 * a string: no property's value takes one, and an escaped `!\\important` is
 * read as a priority (a cssText priority is taken off before this check).
 * @param {string} value
 */
const declarable = value => {
  const { parts, bang } = scan(value, true);
  return sealed(value) && !/[{}\n\r\f]/.test(value) && parts.length === 1 && !bang;
};

/**
 * A declaration list split at its top-level semicolons, by CSS Syntax's
 * tokenizer (as `sealed` reads a value): a comment is nothing (a space
 * here), a string runs to its quote or, a bad string, to a newline; an
 * unquoted url runs to its `)`; a `()`, `[]` or `{}` block holds its
 * `;`s; only a `;` outside all of them ends a declaration. A browser reads a
 * style attribute so: a block (`x{;position:fixed}`, `[; … ]`), a comment
 * holding a `;` and a newline in a string never make a declaration of
 * their own.
 * With `inBlocks`, a `;` inside a block splits too (a value holds none there:
 * a lenient CSS parser might end a declaration at it).
 * @param {string} raw @param {boolean} [inBlocks] @returns {string[]}
 */
function declarations(raw, inBlocks = false) {
  return scan(raw, inBlocks).parts;
}

/**
 * The tokenizing `declarations` does: the parts, and whether a `!` delimiter
 * (outside strings, urls and comments, not escaped) was read.
 * @param {string} raw @param {boolean} [inBlocks] @returns {{ parts: string[], bang: boolean }}
 */
function scan(raw, inBlocks = false) {
  // CSS's preprocessing: CRLF, CR and form feed are a newline.
  const text = raw.replace(/\r\n?|\f/g, '\n');
  const n = text.length;
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  const closers = [];
  let cur = '';
  /** The name just read, its escapes decoded as `sealed` decodes them (for `url(`), or '' after anything else. */
  let name = '';
  /** Whether that name follows a `#` or an `@` (a hash or an at-keyword, never the ident url). */
  let hashed = false;
  /** The delimiter just read, or '' after anything else. */
  let last = '';
  /** Starts or continues the name with `add`. @param {string} add */
  const grow = add => {
    if (name === '') hashed = last === '#' || last === '@';
    name += add;
    last = '';
  };
  let bang = false;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      cur += ' ';
      name = '';
      last = '';
    } else if (c === '\\') {
      // An escape (its code point decoded into the name, as `sealed` does), or a lone backslash before a newline (a delim).
      if (i + 1 >= n || text[i + 1] === '\n') {
        cur += c;
        name = '';
        last = c;
        i++;
        continue;
      }
      let j = i + 1;
      let hex = '';
      while (j < n && hex.length < 6 && /[0-9a-fA-F]/.test(text[j])) hex += text[j++];
      if (hex === '') {
        grow(text[i + 1]);
        j = i + 2;
      } else {
        if (j < n && (text[j] === ' ' || text[j] === '\t' || text[j] === '\n')) j++;
        const code = parseInt(hex, 16);
        grow(code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? '\ufffd' : String.fromCodePoint(code));
      }
      cur += text.slice(i, j);
      i = j;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      for (; j < n; j++) {
        if (text[j] === c) {
          j++;
          break;
        }
        // A newline ends a bad string, and is read after it.
        if (text[j] === '\n') break;
        if (text[j] === '\\') j++;
      }
      cur += text.slice(i, j);
      i = j;
      name = '';
      last = '';
    } else if (c === '(' && lower(name) === 'url' && !hashed && !/^[ \t\n]*["']/.test(text.slice(i + 1))) {
      // An unquoted url (or a bad one): to its ')'. Only the ident url makes one, escaped or not; rurl(, #url( and @url( open a block.
      let j = i + 1;
      for (; j < n; j++) {
        if (text[j] === ')') {
          j++;
          break;
        }
        if (text[j] === '\\') j++;
      }
      cur += text.slice(i, j);
      i = j;
      name = '';
      last = '';
    } else if (/[-\w\u0080-\uffff]/.test(c)) {
      grow(c);
      cur += c;
      i++;
    } else {
      name = '';
      last = c;
      if (c === '!') bang = true;
      if (c === '(' || c === '[' || c === '{') closers.push(c === '(' ? ')' : c === '[' ? ']' : '}');
      else if (c === closers[closers.length - 1]) closers.pop();
      else if (c === ';' && (closers.length === 0 || inBlocks)) {
        out.push(cur);
        cur = '';
        i++;
        continue;
      }
      cur += c;
      i++;
    }
  }
  out.push(cur);
  return { parts: out, bang };
}

/**
 * Inline styles: kebab-case properties, set by name, camelCase or cssText.
 * The first write gives the element its style attribute where a browser
 * would: in attribute order at that moment.
 */
/** @type {(style: Style) => Map<string, string>} */
let mapOf;
/** Each style's proxy, to the style it stands for. @type {WeakMap<object, Style>} */
const targets = new WeakMap();

class Style {
  /** @type {Map<string, string>} */ #map = new Map();
  /** @type {Element} */ #owner;
  static {
    // A style is its proxy (see the constructor): the map is its target's.
    mapOf = style => (targets.get(style) ?? style).#map;
  }
  /** @param {Element} owner */
  constructor(owner) {
    this.#owner = owner;
    // camelCase properties (style.flexDirection = …) go through a proxy; its
    // own members are called on the style itself, whose fields are private.
    const proxy = new Proxy(this, {
      get(target, key) {
        if (typeof key !== 'string' || key in target) {
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }
        return target.#map.get(kebab(key)) ?? '';
      },
      set(target, key, value) {
        if (typeof key !== 'string' || key in target) return Reflect.set(target, key, value, target);
        target.setProperty(kebab(key), value);
        return true;
      },
    });
    targets.set(proxy, this);
    return proxy;
  }
  /** Takes the style attribute's place among the owner's attributes, once. */
  #placed() {
    const attributes = E.attrs(this.#owner);
    if (!attributes.has('style')) attributes.set('style', '');
  }
  /**
   * As a browser's CSSOM: a name that is not a property's, or a value that is
   * not one declaration's (`declarable`; a priority is setProperty's third
   * argument, never the value's), is dropped.
   * @param {string} name @param {string | null} value
   */
  setProperty(name, value) {
    if (value == null || value === '') this.#map.delete(name);
    else if (!PROPERTY.test(name) || !declarable(String(value)) || /!\s*important\s*$/i.test(String(value))) return;
    else {
      this.#map.set(name, String(value));
      this.#placed();
    }
  }
  /** @param {string} name */
  removeProperty(name) {
    this.#map.delete(name);
  }
  /** @param {string} name */
  getPropertyValue(name) {
    return this.#map.get(name) ?? '';
  }
  get cssText() {
    let out = '';
    for (const [name, value] of this.#map) out += `${out === '' ? '' : ' '}${name}: ${value};`;
    return out;
  }
  set cssText(text) {
    this.#map.clear();
    for (const part of declarations(String(text ?? ''))) {
      const colon = part.indexOf(':');
      if (colon <= 0) continue;
      // Property names are ASCII case-insensitive, but for custom properties (--Brand).
      const name = part.slice(0, colon).trim();
      const value = part.slice(colon + 1).trim();
      // As a browser's CSSOM: a declaration whose name or value is not one is dropped (a priority may end it).
      if (!PROPERTY.test(name) || value === '' || !declarable(value.replace(/!\s*important\s*$/i, ''))) continue;
      this.#map.set(name.startsWith('--') ? name : lower(name), value);
    }
    if (this.#map.size > 0) this.#placed();
  }
}

/** @type {{ attrs: (el: Element) => Map<string, string>, ns: (el: Element) => string | null, local: (el: Element) => string, first: (el: Element) => Node | null, setFirst: (el: Element, v: Node | null) => void, last: (el: Element) => Node | null, setLast: (el: Element, v: Node | null) => void, styles: (el: Element) => Style | null, setStyles: (el: Element, v: Style | null) => void, typed: (el: Element) => string | null, setTyped: (el: Element, v: string | null) => void }} */
let E;

export class Element extends Node {
  /** @type {string | null} */ #ns;
  /** @type {string} */ #local;
  /** @type {Map<string, string>} */ #attrs = new Map();
  /** @type {Node | null} */ #first = null;
  /** @type {Node | null} */ #last = null;
  /** @type {Style | null} */ #styles = null;
  /** A textarea's value once set (dirty): written in place of its text, which is then its default value only. @type {string | null} */ #typed = null;
  static {
    E = {
      attrs: el => el.#attrs,
      ns: el => el.#ns,
      local: el => el.#local,
      first: el => el.#first,
      setFirst: (el, v) => void (el.#first = v),
      last: el => el.#last,
      setLast: (el, v) => void (el.#last = v),
      styles: el => el.#styles,
      setStyles: (el, v) => void (el.#styles = v),
      typed: el => el.#typed,
      setTyped: (el, v) => void (el.#typed = v),
    };
  }
  /** @param {Document} doc @param {string} tag @param {string | null} namespace */
  constructor(doc, tag, namespace) {
    super(doc);
    this.#ns = namespace;
    this.#local = namespace === SVG ? tag : lower(tag);
  }
  get nodeType() {
    return 1;
  }
  get namespaceURI() {
    return this.#ns;
  }
  get localName() {
    return this.#local;
  }
  get tagName() {
    return this.#ns === SVG ? this.#local : upper(this.#local);
  }
  /** The attributes, as a browser's NamedNodeMap lists them: a copy of { name, value } each. */
  get attributes() {
    return Object.freeze([...this.#attrs].map(([name, value]) => Object.freeze({ name, value: name === 'style' ? (this.#styles?.cssText ?? '') : value })));
  }
  get firstChild() {
    return this.#first;
  }
  get lastChild() {
    return this.#last;
  }
  /** @returns {Style} */
  get style() {
    return (this.#styles ??= new Style(this));
  }
  /** As a browser's: assigning a string sets its text. @param {any} text */
  set style(text) {
    this.style.cssText = String(text ?? '');
  }
  /** @param {string} name @param {any} value */
  setAttribute(name, value) {
    name = attributeName(this, named(name));
    // A declarative shadow root: a page's parser would attach it (hiding the light children ren-dom shows).
    if (name === 'shadowrootmode' && this.#local === 'template' && this.#ns !== SVG && this.#ns !== MATHML) throw new Error(SHADOW);
    const had = this.#attrs.has(name);
    const before = name === 'id' ? this.#attrs.get('id') : undefined;
    if (name === 'style') this.style.cssText = String(value);
    else {
      this.#attrs.set(name, String(value));
      if (name === 'size' || (name === 'multiple' && !had)) shaped(this, false);
    }
    if (name === 'selected') selectedAttribute(this);
    else if (GROUPING.has(name)) grouped(this);
    else if (name === 'id') reidentified(this, before);
    if (name === 'open' && !had) opened(this);
    else if (name === 'name') exclusive(this);
  }
  /** @param {string} name */
  getAttribute(name) {
    name = attributeName(this, name);
    if (name === 'style') return this.#styles === null || mapOf(this.#styles).size === 0 ? null : this.#styles.cssText;
    return this.#attrs.get(name) ?? null;
  }
  /** @param {string} name */
  hasAttribute(name) {
    return this.getAttribute(name) !== null;
  }
  /** @param {string} name */
  removeAttribute(name) {
    name = attributeName(this, name);
    if (name === 'style') this.#styles = null;
    const before = name === 'id' ? this.#attrs.get('id') : undefined;
    const had = this.#attrs.delete(name);
    if (name === 'selected') selectedAttribute(this);
    else if (name === 'size' || (name === 'multiple' && had)) shaped(this, name === 'multiple');
    else if (GROUPING.has(name)) grouped(this);
    else if (name === 'id') reidentified(this, before);
  }
  /** Its own words only, as a browser's property: `true`, `false`, `plaintext-only`, or `inherit` (no attribute). */
  get contentEditable() {
    return this.#attrs.get('contenteditable') ?? 'inherit';
  }
  set contentEditable(value) {
    const word = lower(String(value));
    if (word === 'inherit') this.#attrs.delete('contenteditable');
    else if (word === 'true' || word === 'false' || word === 'plaintext-only') this.#attrs.set('contenteditable', word);
    else throw new DOMException(`The value provided ('${value}') is not one of 'true', 'false', 'plaintext-only', or 'inherit'.`, 'SyntaxError');
  }
  get className() {
    return this.#attrs.get('class') ?? '';
  }
  set className(value) {
    this.#attrs.set('class', String(value ?? ''));
  }
  /**
   * Assigning classList sets the class attribute, as a browser forwards it to its value (PutForwards);
   * null removes it, as ren-dom does.
   * @param {unknown} value
   */
  set classList(value) {
    if (value == null) this.#attrs.delete('class');
    else this.#attrs.set('class', String(value));
  }
  /** The class attribute as tokens, as a browser's classList (ren-dom's state classes use it). */
  get classList() {
    const attrs = this.#attrs;
    const tokens = () => (attrs.get('class') ?? '').split(/\s+/).filter(t => t !== '');
    /** @param {string[]} list */
    const write = list => {
      if (list.length > 0 || attrs.has('class')) attrs.set('class', list.join(' '));
    };
    const list = {
      get value() {
        return attrs.get('class') ?? '';
      },
      toString() {
        return attrs.get('class') ?? '';
      },
      /** @param {...string} names */
      add(...names) {
        const list = tokens();
        for (const n of names) if (!list.includes(n)) list.push(n);
        write(list);
      },
      /** @param {...string} names */
      remove(...names) {
        write(tokens().filter(t => !names.includes(t)));
      },
      /** @param {string} name */
      contains(name) {
        return tokens().includes(name);
      },
      /** @param {string} name @param {boolean} [force] */
      toggle(name, force) {
        const on = force ?? !tokens().includes(name);
        if (on) list.add(name);
        else list.remove(name);
        return on;
      },
    };
    return list;
  }
  /**
   * A form control's value: the attribute of an input, the text of a
   * textarea or an output, the selected option's of a select. Setting a
   * select's selects its first option of that value and no other (none when
   * no option has it), as a browser's select.value does.
   */
  get value() {
    if (this.localName === 'textarea') return this.#typed ?? this.textContent;
    if (this.localName === 'output') return this.textContent;
    if (this.localName === 'select') {
      const option = optionsOf(this).find(o => stateOf(o).picked);
      return option === undefined ? '' : optionValue(option);
    }
    return this.#attrs.get('value') ?? '';
  }
  set value(v) {
    // A textarea's value, once set, is its own (dirty), as a browser's: text appended after it is the
    // default value only, and the markup shows the value. An output's value is its text.
    if (this.localName === 'textarea') this.#typed = String(v ?? '');
    else if (this.localName === 'output') this.textContent = String(v ?? '');
    else if (this.localName === 'select') {
      const value = String(v);
      let found = false;
      for (const o of optionsOf(this)) {
        const state = stateOf(o);
        state.picked = !found && optionValue(o) === value;
        state.auto = false;
        if (state.picked) found = state.dirty = true;
      }
    }
    // null or undefined writes nothing, as ren-dom removes the attribute for one.
    else if (v == null) this.#attrs.delete('value');
    // li, meter and progress hold a number, as their property does: '' is 0.
    // An li's value is a WebIDL long: ToInt32 (Infinity is 0, 2**31 wraps to -2**31).
    else if (this.localName === 'li') this.#attrs.set('value', String(Number(v) | 0));
    else if (this.localName === 'meter' || this.localName === 'progress') {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new TypeError(`The provided double value is non-finite: ${String(v)}`);
      // A progress's setter writes no value below 0, as a browser's: -3 is 0.
      this.#attrs.set('value', String(this.localName === 'progress' ? Math.max(n, 0) : n));
    }
    // An empty value typed into a field (value mode "value") is its state, kept out of the markup, as a
    // browser's; elsewhere (a checkbox's, a button's, an option's) it is the value attribute, kept.
    else if (v === '' && this.localName === 'input' && !ATTRIBUTE_VALUED.has(lower(this.#attrs.get('type') ?? ''))) this.#attrs.delete('value');
    else this.#attrs.set('value', String(v));
  }
  get textContent() {
    let out = '';
    for (let c = this.firstChild; c !== null; c = c.nextSibling) out += /** @type {any} */ (c).textContent;
    return out;
  }
  set textContent(value) {
    while (this.firstChild !== null) this.removeChild(this.firstChild);
    const text = String(value ?? '');
    if (text !== '') this.appendChild(new Text(this.ownerDocument, text));
  }
  /** @param {Node} child */
  appendChild(child) {
    return this.insertBefore(child, null);
  }
  /** @param {Node} child @param {Node | null} before */
  insertBefore(child, before) {
    if (child instanceof Fragment) {
      while (child.firstChild !== null) this.insertBefore(child.firstChild, before);
      return child;
    }
    if (child.parentNode !== null) child.parentNode.removeChild(child);
    const prev = before === null ? this.#last : before.previousSibling;
    N.setParent(child, this);
    N.setNext(child, before);
    N.setPrev(child, prev);
    if (prev === null) this.#first = child;
    else N.setNext(prev, child);
    if (before === null) this.#last = child;
    else N.setPrev(before, child);
    if (child instanceof Element) {
      listed(this, child, true);
      // Its ids are the page's once it is in the page.
      const ids = IDS.get(this.ownerDocument);
      /** @type {string[]} */
      const come = [];
      if (ids !== undefined && rootOf(this) === this.ownerDocument.body) indexed(ids, child, true, come);
      // The checked radios coming in check alone in their groups, the last to join one the one left.
      if (RADIOS.has(this.ownerDocument)) arrive(child);
      // Then the page's radios whose form attribute names an id that came in, whose form owner may change.
      if (come.length > 0) reowned(this.ownerDocument, come);
      // The open details coming in close themselves where another of their name is open.
      if (OPENED.has(this.ownerDocument)) unfold(child);
    }
    return child;
  }
  /** @param {Node} child */
  removeChild(child) {
    const ids = child instanceof Element ? IDS.get(this.ownerDocument) : undefined;
    const paged = ids !== undefined && rootOf(this) === this.ownerDocument.body;
    const prev = child.previousSibling;
    const next = child.nextSibling;
    if (prev === null) this.#first = next;
    else N.setNext(prev, next);
    if (next === null) this.#last = prev;
    else N.setPrev(next, prev);
    N.setParent(child, null);
    N.setNext(child, null);
    N.setPrev(child, null);
    if (child instanceof Element) listed(this, child, false);
    if (paged) {
      // The page's radios whose form attribute names an id that left, whose form owner may change.
      /** @type {string[]} */
      const gone = [];
      indexed(/** @type {Map<string, Element[]>} */ (ids), /** @type {Element} */ (child), false, gone);
      if (gone.length > 0) reowned(this.ownerDocument, gone);
    }
    return child;
  }
  /** @param {boolean} deep */
  cloneNode(deep) {
    // A copy of the same kind: its tag's prototype, with the properties the tag owns.
    const copy = /** @type {Element} */ (Object.setPrototypeOf(new Element(this.ownerDocument, this.#local, this.#ns), Object.getPrototypeOf(this)));
    for (const [k, v] of this.#attrs) E.attrs(copy).set(k, v);
    const state = SELECTEDNESS.get(this);
    if (state !== undefined) SELECTEDNESS.set(copy, { ...state });
    E.setTyped(copy, this.#typed);
    if (this.#styles !== null) copy.style.cssText = this.#styles.cssText;
    if (deep) for (let c = this.firstChild; c !== null; c = c.nextSibling) copy.appendChild(/** @type {any} */ (c).cloneNode(true));
    return copy;
  }
  /** The children, for the few callers that want a list. */
  get childNodes() {
    const out = [];
    for (let c = this.firstChild; c !== null; c = c.nextSibling) out.push(c);
    return out;
  }
  get children() {
    return this.childNodes.filter(c => c instanceof Element);
  }
  get outerHTML() {
    return serialize(this);
  }
  get innerHTML() {
    frames = new WeakMap();
    return inner(this, undefined);
  }
  /** An element's content is never raw HTML: it would bypass escaping (and a browser would run it). An iframe's srcdoc is an attribute the application answers for. */
  set innerHTML(_value) {
    throw new Error('REN html: innerHTML is not rendered by $html; render the elements, or text');
  }
  get innerText() {
    return this.textContent;
  }
  /** Its text, each line break a <br>, as a browser's innerText. */
  set innerText(value) {
    while (this.firstChild !== null) this.removeChild(this.firstChild);
    String(value ?? '').split(/\r\n|\r|\n/).forEach((line, i) => {
      if (i > 0) this.appendChild(new Element(this.ownerDocument, 'br', null));
      if (line !== '') this.appendChild(new Text(this.ownerDocument, line));
    });
  }
  /** `until-found` is kept; any other truthy value is a flag, as a browser's hidden. */
  get hidden() {
    const word = this.#attrs.get('hidden');
    return word === undefined ? false : lower(word) === 'until-found' ? 'until-found' : true;
  }
  set hidden(value) {
    if (typeof value === 'string' && lower(value) === 'until-found') this.#attrs.set('hidden', 'until-found');
    else if (value) this.#attrs.set('hidden', '');
    else this.#attrs.delete('hidden');
  }
  /** An input's value attribute, a textarea's text. */
  get defaultValue() {
    return this.localName === 'textarea' || this.localName === 'output' ? this.textContent : (this.#attrs.get('value') ?? '');
  }
  set defaultValue(v) {
    // A textarea's and an output's default value is their text, as a browser's.
    if (this.localName === 'textarea' || this.localName === 'output') this.textContent = String(v ?? '');
    else this.#attrs.set('value', String(v ?? ''));
  }
  /** No shadow roots in a static page: ren-html renders the light DOM. */
  attachShadow() {
    throw new Error(SHADOW);
  }
}

// The value and defaultValue accessors are their owners' only.
for (const prop of ['value', 'defaultValue']) {
  property(prop, /** @type {PropertyDescriptor} */ (Object.getOwnPropertyDescriptor(Element.prototype, prop)));
  delete (/** @type {any} */ (Element.prototype))[prop];
}
// Reflected properties: `name in element` is true for them where a browser's is, on their owners.
// A numeric one converts as its IDL type does on its owner; null still removes it, as ren-dom does.
for (const [prop, attribute] of REFLECT) {
  const numeric = NUMERIC.get(prop);
  /** @param {Element} el */
  const ruleOf = (el) => (numeric === undefined ? undefined : (numeric[el.localName] ?? numeric['*']));
  property(prop, {
    get() {
      const rule = ruleOf(this);
      const text = E.attrs(this).get(attribute);
      return rule === undefined ? (text ?? '') : numberOf(rule, text);
    },
    set(value) {
      const rule = ruleOf(this);
      const before = attribute === 'id' ? E.attrs(this).get('id') : undefined;
      if (value == null) E.attrs(this).delete(attribute);
      else {
        const text = rule === undefined ? String(value) : attributeOf(rule, value);
        if (text !== null) E.attrs(this).set(attribute, text);
      }
      if (attribute === 'size') shaped(this, false);
      else if (GROUPING.has(attribute)) grouped(this);
      else if (attribute === 'id') reidentified(this, before);
      if (attribute === 'name') exclusive(this);
    },
  });
}
for (const [prop, attribute] of FLAGS) {
  property(prop, {
    get() {
      return E.attrs(this).has(attribute);
    },
    set(value) {
      const had = E.attrs(this).has(attribute);
      if (value) E.attrs(this).set(attribute, '');
      else E.attrs(this).delete(attribute);
      if (attribute === 'multiple' && had !== !!value) shaped(this, had);
      else if (attribute === 'checked' && value) grouped(this);
      else if (attribute === 'open' && value && !had) opened(this);
    },
  });
}
// An option's selected is its selectedness, as a browser's (dirty: its attribute no longer moves it); the
// attribute follows it too, so an option outside a select shows it. Its defaultSelected is the attribute.
property('selected', {
  get() {
    return stateOf(this).picked;
  },
  set(value) {
    if (value) E.attrs(this).set('selected', '');
    else E.attrs(this).delete('selected');
    const state = stateOf(this);
    state.picked = !!value;
    state.dirty = true;
    state.auto = false;
    const select = selectOf(this);
    if (select !== null) {
      if (state.picked && single(select)) only(select, this);
      reset(select);
    }
  },
});
property('defaultSelected', {
  get() {
    return E.attrs(this).has('selected');
  },
  set(value) {
    if (value) this.setAttribute('selected', '');
    else this.removeAttribute('selected');
  },
});
for (const [prop, [attribute, yes, no]] of WORDS) {
  Object.defineProperty(Element.prototype, prop, {
    get() {
      return E.attrs(this).get(attribute) === yes;
    },
    set(value) {
      E.attrs(this).set(attribute, value ? yes : no);
    },
  });
}

/**
 * Properties that reflect no attribute: a browser keeps their state out of
 * the markup, so ren-dom's writes to them show nothing, and here too (the
 * getter is their default).
 */
for (const [prop, none] of /** @type {[string, unknown][]} */ ([
  ['scrollTop', 0], ['scrollLeft', 0], ['indeterminate', false], ['selectionStart', null],
  ['selectionEnd', null], ['selectionDirection', null], ['volume', 1], ['currentTime', 0], ['playbackRate', 1],
  ['defaultPlaybackRate', 1], ['srcObject', null], ['returnValue', ''],
]))
  property(prop, {
    get() {
      return none;
    },
    set(_value) {},
  });

// A select's selectedIndex: its first selected option's place among its options (-1: none); setting it
// selects that option alone, as a browser's (ren-dom reads and sets it keeping a value for a later option).
property('selectedIndex', {
  get() {
    return optionsOf(this).findIndex(o => stateOf(o).picked);
  },
  set(value) {
    const at = Math.trunc(Number(value)) || 0;
    optionsOf(this).forEach((o, i) => {
      const state = stateOf(o);
      state.picked = i === at;
      state.auto = false;
      if (i === at) state.dirty = true;
    });
  },
});

// An a's, option's, script's or title's text is its content (a script's written as raw text); a body's
// reflects its text attribute.
{
  const color = /** @type {PropertyDescriptor} */ (OWNED.get('text'));
  property('text', {
    get() {
      return this.localName === 'body' ? color.get?.call(this) : this.textContent;
    },
    set(value) {
      if (this.localName === 'body') color.set?.call(this, value);
      else this.textContent = String(value);
    },
  });
}

// A textarea's, select's, output's and fieldset's type is read-only, their kind: assigning it throws in
// strict code, as ren-dom's write does in a browser.
{
  const reflected = /** @type {PropertyDescriptor} */ (OWNED.get('type'));
  /** @param {Element} el */
  const kind = (el) => (el.localName === 'select' ? (E.attrs(el).has('multiple') ? 'select-multiple' : 'select-one') : el.localName);
  const FIXED = new Set(['textarea', 'select', 'output', 'fieldset']);
  property('type', {
    get() {
      return FIXED.has(this.localName) ? kind(this) : reflected.get?.call(this);
    },
    set(value) {
      if (FIXED.has(this.localName)) throw new TypeError(`Cannot set property type of <${this.localName}>, which has only a getter`);
      reflected.set?.call(this, value);
    },
  });
}

/** A data-* attribute's name for a dataset key (fooBar is data-foo-bar). @param {string} key */
const dataName = (key) => `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
/** A dataset key for a data-* attribute's name (data-foo-bar is fooBar). @param {string} name */
const dataKey = (name) => name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
// dataset is read-only (a DOMStringMap over the data-* attributes): assigning it throws in strict code.
property('dataset', {
  get() {
    const el = this;
    const attrs = E.attrs(el);
    /** @param {string | symbol} key */
    const named = (key) => {
      if (typeof key !== 'string') return null;
      if (/-[a-z]/.test(key)) throw new DOMException(`'${key}' is not a valid dataset key`, 'SyntaxError');
      return dataName(key);
    };
    return new Proxy(Object.create(null), {
      get: (_, key) => (typeof key === 'string' && !/-[a-z]/.test(key) ? attrs.get(dataName(key)) : undefined),
      set(_, key, value) {
        const name = named(key);
        if (name !== null) el.setAttribute(name, String(value));
        return true;
      },
      has: (_, key) => typeof key === 'string' && !/-[a-z]/.test(key) && attrs.has(dataName(key)),
      deleteProperty(_, key) {
        if (typeof key === 'string' && !/-[a-z]/.test(key)) attrs.delete(dataName(key));
        return true;
      },
      ownKeys: () => [...attrs.keys()].filter((name) => name.startsWith('data-')).map(dataKey),
      getOwnPropertyDescriptor: (_, key) => (typeof key === 'string' && !/-[a-z]/.test(key) && attrs.has(dataName(key)) ? { value: attrs.get(dataName(key)), writable: true, enumerable: true, configurable: true } : undefined),
    });
  },
});

// outerText replaces the element with its text, each line break a <br>, as a browser's; an element with no
// parent (ren-dom sets props before it inserts) cannot be replaced, and a browser throws.
Object.defineProperty(Element.prototype, 'outerText', {
  get() {
    return this.textContent;
  },
  set(value) {
    const parent = this.parentNode;
    if (parent === null) throw new DOMException("Failed to set the 'outerText' property: this element has no parent", 'NoModificationAllowedError');
    String(value).split(/\r\n|\r|\n/).forEach((line, i) => {
      if (i > 0) parent.insertBefore(new Element(this.ownerDocument, 'br', null), this);
      if (line !== '') parent.insertBefore(new Text(this.ownerDocument, line), this);
    });
    parent.removeChild(this);
  },
  configurable: true,
});

/** The input types valueAsNumber applies to. */
const NUMBERED = new Set(['number', 'range', 'date', 'month', 'week', 'time', 'datetime-local']);
const pad = (/** @type {number} */ n, /** @type {number} */ width = 2) => String(n).padStart(width, '0');
/** A time of day, as a browser writes one: HH:MM, then :SS and .sss when not zero. @param {Date} d */
const clock = (d) => {
  const s = d.getUTCSeconds();
  const ms = d.getUTCMilliseconds();
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${s || ms ? `:${pad(s)}` : ''}${ms ? `.${pad(ms, 3)}` : ''}`;
};
const day = (/** @type {Date} */ d) => `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** The ISO week a UTC date falls in: [year, week]. @param {Date} d */
const isoWeek = (d) => {
  const t = new Date(utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const first = utc(t.getUTCFullYear(), 0, 1);
  return [t.getUTCFullYear(), Math.ceil(((t.getTime() - first) / 86400000 + 1) / 7)];
};
/** A UTC midnight's time, with the year as given (Date.UTC reads 0..99 as 1900..1999). @param {number} y @param {number} m @param {number} d */
const utc = (y, m, d) => new Date(0).setUTCFullYear(y, m, d);
/** The first and last days a date, week or datetime-local input holds, as times: 0001-01-01 and 275760-09-13, JavaScript's last. */
const DAYS = [utc(1, 0, 1), 8.64e15];
/** The first and last months a month input holds, counted from 1970-01: 0001-01 and 275760-09. */
const MONTHS = [(1 - 1970) * 12, (275760 - 1970) * 12 + 8];
/** A number as an input of `type` writes it, by the standard's conversions. @param {string} type @param {number} n */
function numberText(type, n) {
  if (type === 'number' || type === 'range') return String(n);
  if (type === 'month') {
    const m = Math.floor(n);
    if (m < MONTHS[0] || m > MONTHS[1]) return '';
    return `${pad(1970 + Math.floor(m / 12), 4)}-${pad((((m % 12) + 12) % 12) + 1)}`;
  }
  // A time of day is any number's; a date outside 0001-01-01..275760-09-13 has no value.
  if (type !== 'time' && (n < DAYS[0] || n > DAYS[1])) return '';
  const d = new Date(n);
  if (type === 'date') return day(d);
  if (type === 'time') return clock(new Date(((n % 86400000) + 86400000) % 86400000));
  if (type === 'week') {
    const [year, week] = isoWeek(d);
    return `${pad(year, 4)}-W${pad(week)}`;
  }
  return `${day(d)}T${clock(d)}`;
}
/** The number an input of `type` holds for `text`, or NaN. @param {string} type @param {string} text @returns {number} */
function textNumber(type, text) {
  if (type === 'number' || type === 'range') return /^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(text) ? Number(text) : NaN;
  let m;
  if (type === 'month' && (m = /^([0-9]{4,})-([0-9]{2})$/.exec(text))) return (Number(m[1]) - 1970) * 12 + Number(m[2]) - 1;
  if (type === 'date' && (m = /^([0-9]{4,})-([0-9]{2})-([0-9]{2})$/.exec(text))) return utc(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const time = (/** @type {string} */ t) => {
    const x = /^([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.([0-9]{1,3}))?)?$/.exec(t);
    return x === null ? NaN : ((Number(x[1]) * 60 + Number(x[2])) * 60 + Number(x[3] ?? 0)) * 1000 + Number((x[4] ?? '0').padEnd(3, '0'));
  };
  if (type === 'time') return time(text);
  if (type === 'datetime-local' && (m = /^([0-9]{4,}-[0-9]{2}-[0-9]{2})[T ](.+)$/.exec(text))) return textNumber('date', m[1]) + time(m[2]);
  if (type === 'week' && (m = /^([0-9]{4,})-W([0-9]{2})$/.exec(text))) {
    const jan4 = new Date(utc(Number(m[1]), 0, 4));
    return jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86400000 + (Number(m[2]) - 1) * 7 * 86400000;
  }
  return NaN;
}
// valueAsNumber: on the types it applies to, the value it writes (kept in the markup, as a value is); on
// the others a browser throws InvalidStateError, and on an infinite number TypeError.
property('valueAsNumber', {
  get() {
    const type = lower(E.attrs(this).get('type') ?? '');
    return NUMBERED.has(type) ? textNumber(type, this.value) : NaN;
  },
  set(value) {
    const n = Number(value);
    if (n === Infinity || n === -Infinity) throw new TypeError(`The provided double value is non-finite: ${String(value)}`);
    const type = lower(E.attrs(this).get('type') ?? '');
    if (!NUMBERED.has(type)) throw new DOMException('This input element does not support Number values.', 'InvalidStateError');
    this.value = Number.isNaN(n) ? '' : numberText(type, n);
  },
});

/** The input types valueAsDate applies to (not datetime-local, which has no Date of its own). */
const DATED = new Set(['date', 'month', 'week', 'time']);
// valueAsDate: on date, month, week and time, the value its Date converts to (kept in the markup, as a
// value is), null or an invalid Date clearing it; elsewhere a browser throws InvalidStateError, and on a
// value that is not a Date (a primitive, by its IDL type first) TypeError.
property('valueAsDate', {
  get() {
    const type = lower(E.attrs(this).get('type') ?? '');
    if (!DATED.has(type)) return null;
    const n = type === 'month' ? textNumber('date', `${this.value}-01`) : textNumber(type, this.value);
    return Number.isNaN(n) ? null : new Date(n);
  },
  set(value) {
    // undefined is null to an object? attribute (WebIDL).
    if (value != null && typeof value !== 'object' && typeof value !== 'function') throw new TypeError("Failed to set 'valueAsDate': the provided value is not of type 'object'");
    const type = lower(E.attrs(this).get('type') ?? '');
    if (!DATED.has(type)) throw new DOMException('This input element does not support Date values.', 'InvalidStateError');
    if (value != null && !(value instanceof Date)) throw new TypeError("Failed to set 'valueAsDate': the provided value is not a Date");
    const n = value == null ? NaN : value.getTime();
    if (Number.isNaN(n)) this.value = '';
    else if (type === 'month') this.value = numberText('month', (value.getUTCFullYear() - 1970) * 12 + value.getUTCMonth());
    else this.value = numberText(type, n);
  },
});

/** An absolute href's URL, or null for a relative or missing one (a static page has no base URL to resolve it by). @param {Element} el */
function hrefOf(el) {
  const href = E.attrs(el).get('href');
  if (href === undefined) return null;
  try {
    return new URL(href);
  } catch {
    return null;
  }
}
// The URL parts of an a or area edit its href, as a browser's do; with no absolute href they write nothing.
// origin is read-only.
for (const part of /** @type {const} */ (['hash', 'search', 'pathname', 'host', 'hostname', 'port', 'protocol', 'username', 'password'])) {
  property(part, {
    get() {
      return hrefOf(this)?.[part] ?? '';
    },
    set(value) {
      const url = hrefOf(this);
      if (url === null) return;
      url[part] = String(value);
      E.attrs(this).set('href', url.href);
    },
  });
}
property('origin', {
  get() {
    return hrefOf(this)?.origin ?? '';
  },
});

// A template's shadowRootMode reflects shadowrootmode: a declared shadow root, refused as attachShadow is.
property('shadowRootMode', {
  get() {
    return '';
  },
  set(value) {
    if (value != null && value !== '') throw new Error(SHADOW);
  },
});

/**
 * ARIA's reflection (the ARIAMixin every element has): ariaX is the aria-x
 * attribute, as a browser writes it; null removes it.
 */
const ARIA = [
  'Atomic', 'AutoComplete', 'BrailleLabel', 'BrailleRoleDescription', 'Busy', 'Checked', 'ColCount', 'ColIndex', 'ColIndexText', 'ColSpan',
  'Current', 'Description', 'Disabled', 'Expanded', 'HasPopup', 'Hidden', 'Invalid', 'KeyShortcuts', 'Label', 'Level', 'Live', 'Modal',
  'MultiLine', 'MultiSelectable', 'Orientation', 'Placeholder', 'PosInSet', 'Pressed', 'ReadOnly', 'Relevant', 'Required',
  'RoleDescription', 'RowCount', 'RowIndex', 'RowIndexText', 'RowSpan', 'Selected', 'SetSize', 'Sort', 'ValueMax', 'ValueMin',
  'ValueNow', 'ValueText',
];
for (const name of ARIA) {
  const attribute = `aria-${lower(name)}`;
  property(`aria${name}`, {
    get() {
      return E.attrs(this).get(attribute) ?? null;
    },
    set(value) {
      if (value == null) E.attrs(this).delete(attribute);
      else E.attrs(this).set(attribute, String(value));
    },
  });
}

/**
 * The event handler properties of the HTML standard's GlobalEventHandlers and
 * WindowEventHandlers (and the pointer, touch, animation and transition ones
 * browsers add). In a browser they are properties, which hold ren-dom's
 * function handlers (it writes no `on*` string anywhere). Here `name in
 * element` is true too, the getter is null and the setter does nothing: a
 * handler is no markup.
 */
const HANDLERS = [
  'abort', 'auxclick', 'beforeinput', 'beforematch', 'beforetoggle', 'blur', 'cancel', 'canplay', 'canplaythrough', 'change', 'click',
  'close', 'command', 'contextlost', 'contextmenu', 'contextrestored', 'copy', 'cuechange', 'cut', 'dblclick', 'drag', 'dragend',
  'dragenter', 'dragleave', 'dragover', 'dragstart', 'drop', 'durationchange', 'emptied', 'ended', 'error', 'focus', 'formdata',
  'input', 'invalid', 'keydown', 'keypress', 'keyup', 'load', 'loadeddata', 'loadedmetadata', 'loadstart', 'mousedown',
  'mouseenter', 'mouseleave', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'paste', 'pause', 'play', 'playing', 'progress',
  'ratechange', 'reset', 'resize', 'scroll', 'scrollend', 'securitypolicyviolation', 'seeked', 'seeking', 'select', 'slotchange',
  'stalled', 'submit', 'suspend', 'timeupdate', 'toggle', 'volumechange', 'waiting', 'webkitanimationend',
  'webkitanimationiteration', 'webkitanimationstart', 'webkittransitionend', 'wheel',
  // WindowEventHandlers (body and frameset's).
  'afterprint', 'beforeprint', 'beforeunload', 'hashchange', 'languagechange', 'message', 'messageerror', 'offline', 'online',
  'pagehide', 'pagereveal', 'pageshow', 'pageswap', 'popstate', 'rejectionhandled', 'storage', 'unhandledrejection', 'unload',
  // Pointer, touch, animation, transition and selection events.
  'pointerdown', 'pointerup', 'pointermove', 'pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'pointercancel',
  'pointerrawupdate', 'gotpointercapture', 'lostpointercapture', 'touchstart', 'touchend', 'touchmove', 'touchcancel',
  'animationstart', 'animationend', 'animationiteration', 'animationcancel', 'transitionstart', 'transitionend', 'transitionrun',
  'transitioncancel', 'selectstart', 'selectionchange', 'fullscreenchange', 'fullscreenerror',
  // Engine handler properties.
  'mousewheel', 'search', 'beforecopy', 'beforecut', 'beforepaste', 'beforexrselect', 'contentvisibilityautostatechange',
  'scrollsnapchange', 'scrollsnapchanging', 'webkitfullscreenchange', 'webkitfullscreenerror',
];
for (const name of HANDLERS)
  Object.defineProperty(Element.prototype, `on${name}`, {
    get() {
      return null;
    },
    set(_value) {},
  });

class Fragment extends Element {}

/** An attribute's name: lowercased on an HTML element, as a browser does; an SVG one keeps its case (viewBox). @param {Element} el @param {string} name */
const attributeName = (el, name) => (E.ns(el) === SVG ? name : lower(name));

/** An option's value: its value attribute, or its text with whitespace collapsed. @param {Element} option */
const optionValue = option => E.attrs(option).get('value') ?? option.textContent.replace(/[\t\n\f\r ]+/g, ' ').trim();

/**
 * Each option's selectedness, as a browser keeps it (the HTML standard's
 * selectedness and dirtiness, 4.10.10): ren-dom sets a select's value and
 * its options' selected, and inserts them, as in a browser document, and
 * the options a select shows follow the same steps here, so its markup marks
 * the options a browser shows selected. `auto`: chosen by a single select's
 * reset (its first enabled option), as a parser chooses it without a mark.
 * @type {WeakMap<Element, { picked: boolean, dirty: boolean, auto: boolean }>}
 */
const SELECTEDNESS = new WeakMap();

/** An option's selectedness, its selected attribute's until something sets it. @param {Element} option */
function stateOf(option) {
  let state = SELECTEDNESS.get(option);
  if (state === undefined) SELECTEDNESS.set(option, (state = { picked: E.attrs(option).has('selected'), dirty: false, auto: false }));
  return state;
}

/** Whether an element is HTML's (not SVG's or MathML's). @param {Element} el */
const isHtml = el => E.ns(el) !== SVG && E.ns(el) !== MATHML;
/** Whether `node` is an HTML element named `tag`. @param {Node | null} node @param {string} tag @returns {node is Element} */
const isTag = (node, tag) => node instanceof Element && isHtml(node) && E.local(node) === tag;

/**
 * The select an option is one of, and the optgroup it is in: its nearest
 * select ancestor, through any element but an option or a datalist, and
 * through one optgroup at most (an option in a nested optgroup is no
 * select's), as Chrome's select reads it.
 * @param {Element} option @returns {{ select: Element, group: Element | null } | null}
 */
function ownerOf(option) {
  /** @type {Element | null} */
  let group = null;
  for (let up = N.parent(option); up instanceof Element; up = N.parent(up)) {
    if (!isHtml(up)) continue;
    const tag = E.local(up);
    if (tag === 'select') return { select: up, group };
    if (tag === 'option' || tag === 'datalist' || tag === 'hr') return null;
    if (tag === 'optgroup') {
      if (group !== null) return null;
      group = up;
    }
  }
  return null;
}

/** The select an option is one of (see ownerOf), or null. @param {Element} option @returns {Element | null} */
const selectOf = option => ownerOf(option)?.select ?? null;

/**
 * A select's options, in tree order: its descendants whose select it is
 * (see ownerOf): through divs and one optgroup, not in a nested select, an
 * option, a datalist or an optgroup's optgroup.
 * @param {Element} select
 */
function optionsOf(select) {
  /** @type {Element[]} */
  const out = [];
  /** @param {Element} at @param {boolean} grouped */
  const walk = (at, grouped) => {
    for (let c = E.first(at); c !== null; c = N.next(c)) {
      if (!(c instanceof Element)) continue;
      const tag = isHtml(c) ? E.local(c) : '';
      if (tag === 'option') out.push(c);
      else if (tag === 'optgroup') {
        if (!grouped) walk(c, true);
      } else if (tag !== 'select' && tag !== 'datalist' && tag !== 'hr') walk(c, grouped);
    }
  };
  walk(select, false);
  return out;
}

/** Whether an option is disabled: itself, or by the optgroup it is in. @param {Element} option */
const disabled = option => E.attrs(option).has('disabled') || !!ownerOf(option)?.group && E.attrs(/** @type {Element} */ (ownerOf(option)?.group)).has('disabled');

/** Whether a select shows one option (not multiple). @param {Element} select */
const single = select => !E.attrs(select).has('multiple');
/**
 * Whether a single select is a drop-down, which always shows an option: its
 * size, by the rules for parsing non-negative integers, at most 1 (or none).
 * A list box (size 2 and more) may show none. @param {Element} select
 */
const dropDown = select => {
  const size = integer(E.attrs(select).get('size'));
  return single(select) && (size === null || size < 0 || size <= 1);
};

/** Selects `option` alone in its select (it stays a reset's choice if it was one: a copy of one comes in so). @param {Element} select @param {Element} option */
function only(select, option) {
  for (const o of optionsOf(select)) {
    const state = stateOf(o);
    state.picked = o === option;
    if (o !== option) state.auto = false;
  }
}

/**
 * A single select's reset, as a browser asks for one when its options
 * change: more than one selected, the last stays; none selected, a
 * drop-down's first enabled option is (none if all are disabled), and a list
 * box shows none.
 * @param {Element} select
 */
function reset(select) {
  if (!single(select)) return;
  const list = optionsOf(select);
  const on = list.filter(o => stateOf(o).picked);
  for (const o of on.slice(0, -1)) stateOf(o).picked = false;
  if (on.length > 0 || !dropDown(select)) return;
  const enabled = list.find(o => !disabled(o));
  if (enabled === undefined) return;
  const state = stateOf(enabled);
  state.picked = true;
  state.auto = true;
}

/**
 * A select's size or multiple changed, as a browser's select follows it: a
 * select no longer multiple keeps its first selected option only; a list box
 * or a multiple select keeps the option a drop-down picked by itself, now
 * shown as picked (a parser would not pick it); a drop-down with none picks
 * one.
 * @param {Element} select @param {boolean} unmultiplied its multiple went
 */
function shaped(select, unmultiplied) {
  if (!isTag(select, 'select')) return;
  const list = optionsOf(select);
  if (unmultiplied && single(select)) {
    const first = list.find(o => stateOf(o).picked);
    if (first !== undefined) only(select, first);
  }
  if (!dropDown(select)) for (const o of list) stateOf(o).auto = false;
  reset(select);
}

/** An option's selected attribute changed: its selectedness follows it until something set it. @param {Element} option */
function selectedAttribute(option) {
  if (!isTag(option, 'option')) return;
  const state = stateOf(option);
  if (state.dirty) return;
  state.picked = E.attrs(option).has('selected');
  state.auto = false;
  const select = selectOf(option);
  if (select === null) return;
  if (state.picked && single(select)) only(select, option);
  reset(select);
}

/**
 * An element went into or out of `parent`: the select it is in (its nearest
 * select ancestor) follows, as a browser's, when options went with it. An
 * option that comes in selected is the one a single select shows.
 * @param {Element} parent @param {Element} child @param {boolean} added
 */
function listed(parent, child, added) {
  /** @type {Element | null} */
  let select = null;
  for (let up = /** @type {Node | null} */ (parent); up instanceof Element; up = N.parent(up)) {
    if (!isHtml(up)) continue;
    const tag = E.local(up);
    if (tag === 'select') {
      select = up;
      break;
    }
    if (tag === 'option' || tag === 'datalist') return;
  }
  if (select === null) return;
  if (added && single(select))
    for (const o of optionsOf(select)) if (stateOf(o).picked && holds(child, o)) only(select, o);
  reset(select);
}

/** Whether `node` is `outer` or inside it. @param {Element} outer @param {Node} node */
function holds(outer, node) {
  for (let at = /** @type {Node | null} */ (node); at !== null; at = N.parent(at)) if (at === outer) return true;
  return false;
}

/** The attributes that check a radio or change its group: a checked radio then unchecks the rest of its group. */
const GROUPING = new Set(['checked', 'type', 'name', 'form']);
/** The documents that ever held a checked radio: only their insertions look for radios. @type {WeakSet<object>} */
const RADIOS = new WeakSet();

/**
 * The checked radios of a name grouped() has met, so a group is found among
 * them, not by walking the tree: by name, then by their nearest form (the
 * document for none). A radio is filed again whenever it is checked, named,
 * retyped or comes into a tree (each calls grouped), so an entry that no
 * longer fits is only dropped when met.
 * @type {WeakMap<object, Map<string, Map<object, Set<Element>>>>}
 */
const FILED = new WeakMap();
/**
 * Per document, the checked radios met with a form attribute, which may join
 * a form's group from anywhere: by name, and by the id their form attribute
 * names. As in FILED, an entry that no longer fits is dropped when met.
 * @type {WeakMap<object, { names: Map<string, Set<Element>>, ids: Map<string, Set<Element>> }>}
 */
const FORMED = new WeakMap();

/** Adds `el` to the set of `key` in `map`. @param {Map<string, Set<Element>>} map @param {string} key @param {Element} el */
function filed(map, key, el) {
  let set = map.get(key);
  if (set === undefined) map.set(key, (set = new Set()));
  set.add(el);
}

/**
 * Per document, the page's elements by id, so a form attribute finds its form
 * without walking the page: made when the page first looks one up, then kept
 * as elements come into the page, leave it or change their id.
 * @type {WeakMap<object, Map<string, Element[]>>}
 */
const IDS = new WeakMap();

/** Adds (or drops) `el` as an element of id `id` in `ids`. @param {Map<string, Element[]>} ids @param {string} id @param {Element} el @param {boolean} add */
function identified(ids, id, el, add) {
  const els = ids.get(id);
  if (add) {
    if (els === undefined) ids.set(id, [el]);
    else els.push(el);
  } else if (els !== undefined) {
    const at = els.indexOf(el);
    if (at >= 0) els.splice(at, 1);
    if (els.length === 0) ids.delete(id);
  }
}

/**
 * Adds (or drops) the ids of `el` and the elements in it to `ids`, each id
 * also to `met` when given.
 * @param {Map<string, Element[]>} ids @param {Element} el @param {boolean} add @param {string[]} [met]
 */
function indexed(ids, el, add, met) {
  const id = E.attrs(el).get('id');
  if (id !== undefined) {
    identified(ids, id, el, add);
    met?.push(id);
  }
  for (let c = E.first(el); c !== null; c = N.next(c)) if (c instanceof Element) indexed(ids, c, add, met);
}

/** Keeps the index of ids as an element in the page changes its id from `before`. @param {Element} el @param {string | undefined} before */
function reidentified(el, before) {
  const ids = IDS.get(el.ownerDocument);
  const after = E.attrs(el).get('id');
  if (ids === undefined || before === after || rootOf(el) !== el.ownerDocument.body) return;
  if (before !== undefined) identified(ids, before, el, false);
  if (after !== undefined) identified(ids, after, el, true);
  // The page's radios whose form attribute names either id, whose form owner may change.
  reowned(el.ownerDocument, [before, after].filter(id => id !== undefined));
}

/**
 * The page's checked radios whose form attribute names one of `ids`, after
 * an element of that id came into the page, left it or changed its id: each
 * whose form owner changed, in its new group, checks alone with the other
 * checked radio there, the later in tree order the one left, as Chrome
 * does (test/fixtures/radio.json). One whose owner is the same is alone
 * already.
 * @param {Document} doc @param {string[]} ids
 */
function reowned(doc, ids) {
  const formed = FORMED.get(doc);
  if (formed === undefined) return;
  for (const id of ids) {
    const set = formed.ids.get(id);
    if (set === undefined) continue;
    for (const r of [...set]) {
      // Met no longer a checked radio naming the id: dropped, as it is filed again once it fits.
      if (!radio(r) || !E.attrs(r).has('checked') || E.attrs(r).get('form') !== id) set.delete(r);
      else if (rootOf(r) === doc.body) {
        const others = groupOf(r);
        if (others === null || others.size === 0) continue;
        let last = r;
        for (const at of others) if (precedes(last, at)) last = at;
        for (const at of [r, ...others]) if (at !== last) E.attrs(at).delete('checked');
      }
    }
  }
}

/** Whether `a` comes before `b` in their tree's order (an element before the ones in it). @param {Node} a @param {Node} b */
function precedes(a, b) {
  /** @param {Node} n */
  const path = n => {
    /** @type {Node[]} */
    const out = [];
    for (let at = /** @type {Node | null} */ (n); at !== null; at = N.parent(at)) out.push(at);
    return out.reverse();
  };
  const pa = path(a);
  const pb = path(b);
  let i = 0;
  while (i < pa.length && i < pb.length && pa[i] === pb[i]) i++;
  if (i === pa.length) return i < pb.length;
  if (i === pb.length) return false;
  for (let at = N.next(pa[i]); at !== null; at = N.next(at)) if (at === pb[i]) return true;
  return false;
}

/** The first element in the page (in tree order) whose id is `id`, or null. @param {Document} doc @param {string} id @returns {Element | null} */
function pageById(doc, id) {
  let ids = IDS.get(doc);
  if (ids === undefined) {
    IDS.set(doc, (ids = new Map()));
    indexed(ids, doc.body, true);
  }
  const els = ids.get(id);
  if (els === undefined) return null;
  let first = els[0];
  for (let i = 1; i < els.length; i++) if (precedes(els[i], first)) first = els[i];
  return first;
}

/** Whether an element is a radio input. @param {Node} el @returns {el is Element} */
const radio = el => isTag(el, 'input') && lower(E.attrs(el).get('type') ?? '') === 'radio';

/** A radio's nearest form ancestor, or null. @param {Element} el */
function formAround(el) {
  for (let up = N.parent(el); up !== null; up = N.parent(up)) if (isTag(up, 'form')) return up;
  return null;
}

/**
 * Files a checked radio of a name (see FILED), and one with a form attribute
 * among its document's (FORMED).
 * @param {Element} el @param {string} name
 */
function file(el, name) {
  const doc = el.ownerDocument;
  let names = FILED.get(doc);
  if (names === undefined) FILED.set(doc, (names = new Map()));
  let forms = names.get(name);
  if (forms === undefined) names.set(name, (forms = new Map()));
  const key = formAround(el) ?? doc;
  let set = forms.get(key);
  if (set === undefined) forms.set(key, (set = new Set()));
  set.add(el);
  const form = E.attrs(el).get('form');
  if (form !== undefined) {
    let formed = FORMED.get(doc);
    if (formed === undefined) FORMED.set(doc, (formed = { names: new Map(), ids: new Map() }));
    filed(formed.names, name, el);
    filed(formed.ids, form, el);
  }
}

/**
 * The checked radios an insertion of `el` brings, and the page's radios
 * whose form attribute names a form it brings, each checking alone in its
 * group, the last to join it the one left, as a browser's insertion joins
 * them (Chrome's, recorded in test/fixtures/radio.json): in tree order, but
 * a radio in a form that came in with it is in that form's group already,
 * before the rest, and a radio whose form attribute names a form after it
 * joins that form's group when the form comes in, as the page's radios
 * naming it do. The order is read only where two joins may meet: radios of
 * one name, or a page's radio naming a form that came in (only a document
 * with radios that have a form attribute has those).
 * @param {Element} el
 */
function arrive(el) {
  /** @type {Element[]} */
  const checked = [];
  /** @type {Element[]} */
  const forms = [];
  const root = rootOf(el);
  const page = root === el.ownerDocument.body;
  const formed = page ? FORMED.get(el.ownerDocument) : undefined;
  const forming = formed !== undefined && formed.ids.size > 0;
  /** @param {Element} at */
  const scan = at => {
    if (radio(at) && E.attrs(at).has('checked')) checked.push(at);
    else if (forming && isTag(at, 'form') && (E.attrs(at).get('id') ?? '') !== '') forms.push(at);
    for (let c = E.first(at); c !== null; c = N.next(c)) if (c instanceof Element) scan(c);
  };
  scan(el);
  if (checked.length === 0 && forms.length === 0) return;
  // Filed where they are now, before any of them looks for its group.
  for (const r of checked) {
    const name = E.attrs(r).get('name') ?? '';
    if (name !== '') file(r, name);
  }
  // The page's checked radios naming a form that came in (the first of its id in the page).
  /** @type {Map<string, Element>} */
  const named = new Map();
  for (const form of forms) {
    const id = /** @type {string} */ (E.attrs(form).get('id'));
    if (!named.has(id) && pageById(el.ownerDocument, id) === form) named.set(id, form);
  }
  /** @type {Element[]} */
  const naming = [];
  for (const id of named.keys()) {
    const set = formed?.ids.get(id);
    if (set === undefined) continue;
    for (const r of set) {
      // Met no longer a checked radio naming the id: dropped, as it is filed again once it fits.
      if (!radio(r) || !E.attrs(r).has('checked') || E.attrs(r).get('form') !== id) set.delete(r);
      else if (rootOf(r) === root && !holds(el, r)) naming.push(r);
    }
  }
  // A radio grouped() leaves alone (no name) joins nothing; one alone with its name meets no other join.
  /** @type {Map<string, number>} */
  const names = new Map();
  for (const r of [...checked, ...naming]) {
    const name = E.attrs(r).get('name') ?? '';
    if (name !== '') names.set(name, (names.get(name) ?? 0) + 1);
  }
  let meet = false;
  for (const count of names.values()) if (count > 1) meet = true;
  if (!meet) {
    for (const r of [...checked, ...naming]) grouped(r);
    return;
  }
  // Each element's place: in the inserted tree, or in the whole tree when a radio outside it joins.
  /** @type {Map<Element, number>} */
  const place = new Map();
  /** @param {Element} at */
  const order = at => {
    place.set(at, place.size);
    for (let c = E.first(at); c !== null; c = N.next(c)) if (c instanceof Element) order(c);
  };
  order(naming.length > 0 && root instanceof Element ? root : el);
  /** @type {[number, number, Element][]} when each joins its group, then its place */
  const joins = [];
  for (const r of checked) {
    const owner = formOwner(r, root);
    const here = /** @type {number} */ (place.get(r));
    const around = formAround(r);
    if (owner !== null && owner === around && holds(el, owner)) joins.push([-1, here, r]);
    else if (owner !== null && holds(el, owner) && /** @type {number} */ (place.get(owner)) > here) joins.push([/** @type {number} */ (place.get(owner)), here, r]);
    else joins.push([here, here, r]);
  }
  for (const r of naming) {
    const form = /** @type {Element} */ (named.get(/** @type {string} */ (E.attrs(r).get('form'))));
    joins.push([/** @type {number} */ (place.get(form)), /** @type {number} */ (place.get(r)), r]);
  }
  joins.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  // The last to join first: it unchecks the rest of its group, which then check nothing.
  for (let i = joins.length - 1; i >= 0; i--) grouped(joins[i][2]);
}

/** The root of a node's tree: the document's body once it is in the page. @param {Node} node */
function rootOf(node) {
  let at = node;
  for (let up = N.parent(at); up !== null; up = N.parent(up)) at = up;
  return at;
}

/**
 * A form control's form owner, as the HTML standard resets it: in the page,
 * the form its `form` attribute names (none when that is no form, or the
 * attribute is empty), else its nearest form ancestor.
 * @param {Element} el @param {Node} root its tree's root
 */
function formOwner(el, root) {
  const id = E.attrs(el).get('form');
  if (id !== undefined && root === el.ownerDocument.body) {
    // An empty id names no element.
    const form = id === '' ? null : pageById(el.ownerDocument, id);
    return isTag(form, 'form') ? form : null;
  }
  for (let up = N.parent(el); up !== null; up = N.parent(up)) if (isTag(up, 'form')) return up;
  return null;
}

/**
 * A checked radio unchecks the rest of its group, as a browser's radio does
 * once checked, renamed, retyped, moved to another form or put in the page:
 * the radios of its name (not empty, compared exactly) and form owner, in
 * its tree, in the page when it has no form owner.
 * @param {Element} el
 */
function grouped(el) {
  const others = groupOf(el);
  if (others !== null) for (const at of others) E.attrs(at).delete('checked');
}

/**
 * The other checked radios of a checked radio's group (see grouped), filing
 * it; null when it is no checked radio, or is in no group.
 * @param {Element} el @returns {Set<Element> | null}
 */
function groupOf(el) {
  if (!radio(el) || !E.attrs(el).has('checked')) return null;
  RADIOS.add(el.ownerDocument);
  const name = E.attrs(el).get('name');
  if (name === undefined || name === '') return null;
  file(el, name);
  const root = rootOf(el);
  const owner = formOwner(el, root);
  if (owner === null && root !== el.ownerDocument.body) return null;
  /** @type {Set<Element>} */
  const others = new Set();
  const doc = el.ownerDocument;
  // Its group's radios are filed under its owner (or the document for none), or have a form attribute.
  const filed = /** @type {Map<string, Map<object, Set<Element>>>} */ (FILED.get(doc)).get(name);
  const near = filed?.get(owner ?? doc);
  const formed = FORMED.get(doc)?.names.get(name);
  for (const set of [near, formed]) {
    if (set === undefined) continue;
    for (const at of set) {
      if (at === el) continue;
      // Met no longer a checked radio, or filed where it no longer fits: dropped, as it is filed again once it fits.
      if (!radio(at) || !E.attrs(at).has('checked') || (set === formed && !E.attrs(at).has('form'))) {
        set.delete(at);
        continue;
      }
      if (E.attrs(at).get('name') !== name) {
        set.delete(at);
        continue;
      }
      if (set === near && (formAround(at) ?? doc) !== (owner ?? doc)) {
        set.delete(at);
        if (!E.attrs(at).has('form')) continue;
      }
      if (rootOf(at) === root && formOwner(at, root) === owner) others.add(at);
    }
  }
  return others;
}

/**
 * Per document, the open details of a name met (filed when opened, named or
 * come in), so a details finds its group among them, not by walking the
 * tree; an entry no longer open or so named is dropped when met.
 * @type {WeakMap<object, Map<string, Set<Element>>>}
 */
const OPENED = new WeakMap();

/** An open details's name: '' when it has none, or is no open details. @param {Node} el */
const openName = el => (isTag(el, 'details') && E.attrs(el).has('open') ? (E.attrs(el).get('name') ?? '') : '');

/** Files an open details of a name (see OPENED). @param {Element} el @param {string} name */
function fileOpen(el, name) {
  let names = OPENED.get(el.ownerDocument);
  if (names === undefined) OPENED.set(el.ownerDocument, (names = new Map()));
  let set = names.get(name);
  if (set === undefined) names.set(name, (set = new Set()));
  set.add(el);
}

/**
 * The other open details of a details's group, as Chrome finds them: of its
 * name (compared exactly), in its tree, below the tree's root (a details at
 * a detached tree's root is no member: its open details stay open, as
 * Chrome's, until the tree comes into one that holds it).
 * @param {Element} el @param {string} name
 */
function others(el, name) {
  const set = OPENED.get(el.ownerDocument)?.get(name);
  /** @type {Element[]} */
  const out = [];
  if (set === undefined) return out;
  const root = rootOf(el);
  for (const at of set) {
    if (openName(at) !== name) set.delete(at);
    else if (at !== el && at !== root && rootOf(at) === root) out.push(at);
  }
  return out;
}

/** A details opened (its open attribute added) closes the others of its group, as a browser's. @param {Element} el */
function opened(el) {
  const name = openName(el);
  if (name === '') return;
  fileOpen(el, name);
  for (const other of others(el, name)) E.attrs(other).delete('open');
}

/** An open details renamed, or come in, closes itself when another of its group is open, as a browser's. @param {Element} el */
function exclusive(el) {
  const name = openName(el);
  if (name === '') return;
  fileOpen(el, name);
  if (others(el, name).length > 0) E.attrs(el).delete('open');
}

/** An insertion's open details, filed first, then each closing itself where its group has another open, in tree order. @param {Element} el */
function unfold(el) {
  /** @type {[Element, string][]} */
  const open = [];
  /** @param {Element} at */
  const scan = at => {
    const name = openName(at);
    if (name !== '') open.push([at, name]);
    for (let c = E.first(at); c !== null; c = N.next(c)) if (c instanceof Element) scan(c);
  };
  scan(el);
  for (const [at, name] of open) fileOpen(at, name);
  for (const [at] of open) exclusive(at);
}

/** A range over siblings, for ren-dom's clear of a run of nodes. */
class Range {
  /** @type {Node | null} */ #start = null;
  /** @type {Node | null} */ #end = null;
  /** @param {Node} node */
  setStartBefore(node) {
    this.#start = node;
  }
  /** @param {Node} node */
  setEndAfter(node) {
    this.#end = node;
  }
  deleteContents() {
    let node = this.#start;
    const end = this.#end;
    while (node !== null) {
      const next = node.nextSibling;
      node.parentNode?.removeChild(node);
      if (node === end) break;
      node = next;
    }
  }
}

export class Document {
  /** @type {Element} */ #body;
  constructor() {
    this.#body = new Element(this, 'body', null);
  }
  get nodeType() {
    return 9;
  }
  get defaultView() {
    return null;
  }
  get body() {
    return this.#body;
  }
  /** Events do not happen in a static document. */
  addEventListener() {}
  removeEventListener() {}
  /** @param {string} tag */
  createElement(tag) {
    return /** @type {Element} */ (Object.setPrototypeOf(new Element(this, tagged(tag), null), protoOf(lower(tag))));
  }
  /** @param {string} namespace @param {string} tag */
  createElementNS(namespace, tag) {
    const el = new Element(this, tagged(tag), namespace);
    // An HTML element owns its tag's properties; an SVG or MathML one none of them.
    return namespace === null || namespace === 'http://www.w3.org/1999/xhtml' ? /** @type {Element} */ (Object.setPrototypeOf(el, protoOf(lower(tag)))) : el;
  }
  /** @param {string} data */
  createTextNode(data) {
    return new Text(this, String(data));
  }
  createDocumentFragment() {
    return new Fragment(this, '#fragment', null);
  }
  createRange() {
    return new Range();
  }
}

/**
 * Whether an element's raw text must be escaped: it is in the SVG or MathML
 * namespace, or has an svg or math element above it, or an HTML integration
 * point (foreignObject, desc, title; mi, mo, mn, ms, mtext, annotation-xml).
 * An integration point makes its content HTML again, but escaping there too is
 * the safe direction: it can only turn raw text into escaped text.
 * @param {Element} el
 */
function foreign(el) {
  for (let at = /** @type {Element | null} */ (el); at !== null; at = N.parent(at)) {
    if (E.ns(at) === SVG || E.ns(at) === MATHML || FOREIGN.has(lower(E.local(at)))) return true;
  }
  return false;
}

/**
 * Whether the parser reads an element's start tag in foreign content, where it
 * adjusts xlink:, xml: and xmlns: attributes. The parser's contexts are
 * followed from the top: an svg or math starts foreign content; its content
 * is HTML again only at its own root's integration points (an svg's
 * foreignObject, desc, title; a math's mi, mo, mn, ms, mtext, and
 * annotation-xml with an HTML encoding); an mi under svg or a foreignObject
 * under math is a plain foreign element. An SVG or MathML element counts as
 * foreign whatever its place (the safe direction).
 * @param {Element} el
 */
function parsedForeign(el) {
  return E.ns(el) === SVG || E.ns(el) === MATHML || parsedIn(el) !== 'html';
}

/**
 * The namespace the parser reads an element's start tag into, by its place
 * alone: 'html', 'svg' or 'math' (see parsedForeign). Right inside a MathML
 * text integration point (mi, mo, mn, ms, mtext) an mglyph or a malignmark
 * stays MathML, as the tree construction dispatcher reads them.
 * @param {Element} el @returns {string}
 */
function parsedIn(el) {
  /** @type {Element[]} */
  const chain = [];
  for (let at = N.parent(el); at !== null; at = N.parent(at)) if (at instanceof Element) chain.unshift(at);
  /** The context the next element is read in: 'html', 'svg' or 'math'. */
  let context = 'html';
  /** Whether the element before was a MathML text integration point. */
  let point = false;
  /** Whether the element before was a MathML annotation-xml, of any encoding: an svg right inside it is SVG. */
  let note = false;
  for (const at of [...chain, el]) {
    const name = lower(E.local(at));
    // The namespace the parser gives this element.
    /** @type {string} */
    const ns =
      context === 'html'
        ? name === 'svg' ? 'svg' : name === 'math' ? 'math' : point && (name === 'mglyph' || name === 'malignmark') ? 'math' : 'html'
        : note && name === 'svg' ? 'svg' : context;
    if (at === el) return ns;
    point = ns === 'math' && ['mi', 'mo', 'mn', 'ms', 'mtext'].includes(name);
    note = ns === 'math' && name === 'annotation-xml';
    // The context of its content.
    if (ns === 'svg') context = name === 'foreignobject' || name === 'desc' || name === 'title' ? 'html' : 'svg';
    else if (ns === 'math') {
      const encoding = lower(E.attrs(at).get('encoding') ?? '');
      context =
        ['mi', 'mo', 'mn', 'ms', 'mtext'].includes(name) || (name === 'annotation-xml' && (encoding === 'text/html' || encoding === 'application/xhtml+xml'))
          ? 'html'
          : 'math';
    } else context = 'html';
  }
  return 'html';
}

/**
 * A raw text element's whole text, escaped once: its own end tag is written
 * `<\/style`, `<\/script` (the same text to CSS, to a script string and to
 * JSON), and a script's `<!--` is written `\u003C!--`, so it cannot start the
 * parser's double-escaped state. Its text children are joined first: split
 * pieces (`<` and `/script>`) are escaped as the parser will read them.
 * @param {string} tag @param {string} text
 */
function rawText(tag, text) {
  const out = text.replace(new RegExp(`</(?=${tag})`, 'gi'), '<\\/');
  // ESC is escaped as the language escapes it, the same character to it (see escapeText).
  return tag === 'script' ? out.replace(/<!--/g, '\\u003C!--').replace(/\x1b/g, '\\u001B') : out.replace(/\x1b/g, '\\1b ');
}

/**
 * Whether an element's content is written as raw text: a style or a script
 * in HTML context, under no element whose content a parser does not read as
 * tags (`OPAQUE`): under one, its text is markup again once that element
 * ends, so it is escaped as any text.
 * @param {Element} el
 */
const raw = el => {
  if (!RAW.has(E.local(el)) || foreign(el)) return false;
  for (let at = N.parent(el); at !== null; at = N.parent(at)) if (OPAQUE.has(lower(E.local(at)))) return false;
  return !framed(el);
};

/** For one serialization: whether the tree at a top holds a frameset. @type {WeakMap<Element, boolean>} */
let frames = new WeakMap();

/**
 * Whether the tree an element is in holds a frameset anywhere: a frameset,
 * and "after frameset", ignore a style's or a script's start tag, so the
 * whole tree's raw text is escaped (the safe direction). Every element named
 * frameset counts, whatever its namespace: at an integration point a
 * parser reads an SVG or MathML one as HTML.
 * @param {Element} el
 */
function framed(el) {
  let top = el;
  for (let up = N.parent(top); up !== null; up = N.parent(up)) top = up;
  let holds = frames.get(top);
  if (holds === undefined) {
    holds = false;
    /** @type {Node[]} */
    const stack = [top];
    while (stack.length > 0 && !holds) {
      const n = /** @type {Element} */ (stack.pop());
      if (!(n instanceof Element)) continue;
      if (lower(E.local(n)) === 'frameset') holds = true;
      for (let c = E.first(n); c !== null; c = N.next(c)) stack.push(c);
    }
    frames.set(top, holds);
  }
  return holds;
}

/**
 * The HTML of a node, as a browser's outerHTML writes it: every attribute
 * with a quoted value (`disabled=""`), void elements without an end tag, and
 * a textarea's, pre's or listing's leading line break written twice (the
 * parser drops the first).
 *
 * The contract for text, so the markup parses back to the same tree:
 * - Text is escaped (`&`, `<`, `>`, no-break spaces), with one exception.
 * - Raw text: a `style` or `script` in HTML context is written unescaped, as
 *   CSS and scripts need, with all its text children joined and then escaped
 *   once (`rawText`), so no split can hide its end tag or a `<!--`.
 * - Under an element whose content a parser does not read as tags (`OPAQUE`,
 *   from the standard: raw text, RCDATA, script data, plaintext, in select),
 *   a style's or a script's text would be markup again once that element's
 *   own end tag (in its raw text) ends it, so there it is escaped as any text.
 * - In foreign content the parser reads a style's or a script's text as
 *   markup, so there it is escaped as any text: in the SVG or MathML
 *   namespace, under an svg or math, or under an HTML integration point in
 *   them (`foreign`; escaping at an integration point is the safe direction).
 * - Every other element whose text a parser reads raw (xmp, iframe, noembed,
 *   noframes, noscript, plaintext) or as escapable raw text (textarea, title)
 *   is escaped as any text, and so is the text of a style or script under
 *   it: no text makes a tag, so it is never unsafe, at worst shown with its
 *   entities.
 * @param {Node} node @param {Element | null} [parent]
 * @returns {string}
 */
export function serialize(node, parent = null) {
  frames = new WeakMap();
  return write(node, parent, undefined);
}

/**
 * @param {Node} node @param {Element | null} parent
 * @param {Map<Element, boolean> | undefined} chosen within a select, its options and whether it shows each selected (their selected attributes are not written: these are)
 * @returns {string}
 */
function write(node, parent, chosen) {
  if (node instanceof Text) {
    const within = parent ?? N.parent(node);
    return within !== null && raw(within) ? rawText(E.local(within), textOf(node)) : escapeText(textOf(node));
  }
  if (!(node instanceof Element)) throw new TypeError('REN html: only elements and text are serialized');
  const el = node;
  // The names again, on the way out (they were checked on the way in): no name can break out of its tag.
  const tag = tagged(E.local(el));
  let out = `<${tag}`;
  // The style attribute holds its place in the order; its text is the style's.
  const styles = E.styles(el);
  for (const [name, value] of E.attrs(el))
    if (name === 'style') {
      if (styles !== null && mapOf(styles).size > 0) out += ` style="${escapeAttribute(styles.cssText)}"`;
    } else if (XML_NAMES.has(lower(name)) && parsedForeign(el)) {
      // In foreign content the parser reads xlink:href, xml:lang or xmlns:xlink back namespaced (xlink:href a
      // live link); ren-dom's is a plain attribute of that name, inert, so it is not written.
    } else if (E.ns(el) === SVG && (SVG_NAMES.get(lower(name)) ?? lower(name)) !== name) {
      // An SVG attribute the parser would read back under another name (ONCLICK as onclick, STYLE as
      // style) is not written: inert in the DOM, read back it would be live, or a style no checker saw.
    } else if (name !== 'selected' || chosen === undefined || !chosen.has(el)) out += ` ${named(name)}="${escapeAttribute(value)}"`;
  if (chosen !== undefined && chosen.get(el) === true) out += ' selected=""';
  out += '>';
  if (VOID.has(tag) && E.ns(el) !== SVG) return out;
  // A template is written as a browser serializes it: its content, which the parser alone fills; the
  // children ren-dom appends to the element are not in it, so it is empty, as ren-dom's markup is.
  if (tag === 'template' && E.ns(el) !== SVG && E.ns(el) !== MATHML) return `${out}</template>`;
  const body = inner(el, chosen);
  // The parser drops a line break (CR and CRLF read as LF) right after these start tags: one that is content is written twice.
  // Only where the parser reads the tag as an HTML element, whatever the element's own namespace: a textarea
  // inside an svg or a math is foreign there.
  const lead = LEADING.has(tag) && parsedIn(el) === 'html' && /^[\r\n]/.test(body) ? '\n' : '';
  return `${out}${lead}${body}</${tag}>`;
}

/** An element's text, from its private tree. @param {Element} el @returns {string} */
function texts(el) {
  let out = '';
  for (let c = E.first(el); c !== null; c = N.next(c)) out += c instanceof Text ? textOf(c) : c instanceof Element ? texts(c) : '';
  return out;
}

/** The HTML of an element's children. @param {Element} el @param {Map<Element, boolean> | undefined} chosen */
function inner(el, chosen) {
  // Only an HTML textarea's value setter sets it.
  const typed = E.local(el) === 'textarea' ? E.typed(el) : null;
  if (typed !== null) return escapeText(typed);
  if (raw(el)) return rawText(E.local(el), texts(el));
  // A select marks the options it shows selected, but the one a parser picks by itself (a single select's
  // reset); an option that is not its own (in a nested optgroup) keeps its attribute.
  if (isTag(el, 'select')) chosen = new Map(optionsOf(el).map(o => [o, stateOf(o).picked && !stateOf(o).auto]));
  let out = '';
  for (let c = E.first(el); c !== null; c = N.next(c)) out += write(c, el, chosen);
  return out;
}
