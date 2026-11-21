import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [page, pkg] = await Promise.all([read('src/index.html'), read('package.json')]);
const { version, teachingVersion = version } = JSON.parse(pkg);
const includes = ['style.css', 'physics.mjs', 'content.mjs', 'graphics.mjs', 'app.mjs'];
let html = page.replaceAll('%%VERSION%%', teachingVersion);
for (const name of includes) {
  const marker = `%%${name.toUpperCase()}%%`;
  if (!html.includes(marker)) continue;
  const source = await read(`src/${name}`);
  const bundled = source.replace(/^import\s+.*?\s+from\s+['"][^'"]+['"];\r?\n/gms, '').replace(/^export\s+(?=(?:const|function|class)\s)/gm, '');
  html = html.replace(marker, () => bundled);
}
const output = new URL('build/deploy/', root);
await mkdir(output, { recursive: true });
await writeFile(new URL('index.html', output), html);
console.log(`Built Coat of Atoms ${teachingVersion} → build/deploy/index.html`);
