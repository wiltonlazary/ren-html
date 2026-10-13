// Records the role Chrome's accessibility tree gives each element of a views
// file, the oracle ren-json's test/roles.test.jsx checks its roles against:
// each view (ren-json's test/fixtures/roles-view.jsx: the elements ren-json
// gives a role by themselves, in the contexts that change it) rendered by
// ren-dom in Chrome, and for the element it probes (the one named "probe",
// or the table header whose text is "Probe") the role
// Accessibility.getPartialAXTree reads, null when the tree ignores it.
// Run it from ren-html under the machine-wide Chrome lock, the views file
// and the file to write as its arguments, and commit what it writes:
//   flock "$HOME/.cache/chrome-bench.lock" node scripts/roles-oracle.mjs ../../../ren-json/wtree/_repo_/test/fixtures/roles-view.jsx ../../../ren-json/wtree/_repo_/test/fixtures/roles.json
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
// ren-canv's recording Chrome, through ren-dom's link to it.
import { withChrome } from '../node_modules/ren-dom/node_modules/ren-canv/scripts/chrome.mjs';

const [views, out] = process.argv.slice(2);
if (views === undefined || out === undefined) throw new Error('usage: roles-oracle.mjs <views.jsx> <roles.json>');

const root = fileURLToPath(new URL('..', import.meta.url));
const page = `
import { Root } from 'ren-core';
import { $dom } from 'ren-dom';
import { views } from ${JSON.stringify(resolve(views))};
window.names = views.map(([name, View], i) => {
  const target = document.createElement('div');
  target.id = 'v' + i;
  document.body.appendChild(target);
  Root({ id: 'c' + i, target, renderer: $dom(document), children: View });
  const probe = target.querySelector('[name="probe"]') ?? [...target.querySelectorAll('th, td')].find(cell => cell.textContent === 'Probe');
  if (probe === undefined || probe === null) throw new Error(name + ': no probe');
  probe.setAttribute('data-probe', '');
  return name;
});
`;
const bundle = await build({ stdin: { contents: page, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, format: 'iife', jsx: 'automatic', jsxImportSource: 'ren-core', logLevel: 'error' });
const js = bundle.outputFiles[0].text;

await withChrome(async ({ send, evaluate, profile }) => {
  const file = join(profile, 'roles.html');
  // A page as an application's: its language and title.
  writeFileSync(file, `<!doctype html><html lang="en"><head><title>Roles</title></head><body><script>${js.replace(/<\/script/g, '<\\/script')}</script></body></html>`);
  await send('Page.navigate', { url: `file://${file}` });
  // The page is loaded once its script has run (withChrome's deadline ends a page that never does).
  while ((await evaluate('Array.isArray(window.names)')) !== true);
  const names = /** @type {string[]} */ (await evaluate('names'));
  await send('DOM.enable');
  await send('Accessibility.enable');
  const doc = (await send('DOM.getDocument', { depth: -1 })).result;
  const rows = [];
  for (let i = 0; i < names.length; i++) {
    const found = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: `#v${i} [data-probe]` });
    const { nodeId } = found.result;
    const tree = await send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    const node = tree.result.nodes[0];
    rows.push(JSON.stringify({ name: names[i], chrome: node.ignored ? null : (node.role?.value ?? null) }));
  }
  const recorded = await evaluate('navigator.userAgent.match(/Chrome\\/[\\d.]+/)[0]');
  // A case a line.
  writeFileSync(out, `{"recorded":${JSON.stringify(recorded)},"cases":[\n${rows.join(',\n')}\n]}\n`);
});
