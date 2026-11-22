import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [page, theory, pkg] = await Promise.all([read('src/index.html'), read('src/theory.html'), read('package.json')]);
const { version, teachingVersion = version } = JSON.parse(pkg);
const includes = ['style.css', 'physics.mjs', 'instruments.mjs', 'content.mjs', 'graphics.mjs', 'chamber.mjs', 'transport.mjs', 'microstructure.mjs', 'microscope.mjs', 'lightbox.mjs', 'zones.mjs', 'app.mjs'];
const bundle = (source) => source.replace(/^import\s+.*?\s+from\s+['"][^'"]+['"];\r?\n/gms, '').replace(/^export\s+(?=(?:const|function|class)\s)/gm, '');
let html = page.replaceAll('%%VERSION%%', teachingVersion).replace('%%THEORY.HTML%%', () => theory);
for (const name of includes) {
  const marker = `%%${name.toUpperCase()}%%`;
  if (!html.includes(marker)) continue;
  const source = await read(`src/${name}`);
  html = html.replace(marker, () => bundle(source));
}
const kernel = bundle(await read('src/microstructure.mjs'));
const worker = `${kernel}\nself.onmessage = ({ data }) => {
  const model = makeMorphology(data);
  const transfer = model.mesh ? [model.mesh.buffer, model.tops.buffer, model.grainMap.buffer] : [];
  self.postMessage(model, transfer);
};`;
html = html.replace('%%MORPHOLOGY_WORKER%%', () => JSON.stringify(worker).replaceAll('<', '\\u003c'));
const output = new URL('build/deploy/', root);
await mkdir(output, { recursive: true });
await writeFile(new URL('index.html', output), html);
console.log(`Built Film Factory ${teachingVersion} → build/deploy/index.html`);
