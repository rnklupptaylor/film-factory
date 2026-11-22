import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('build emits the self-contained app with its teaching version', () => {
  const root = new URL('../', import.meta.url);
  execFileSync(process.execPath, ['tools/build.mjs'], { cwd: root });
  const page = readFileSync(new URL('build/deploy/index.html', root), 'utf8');
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  assert.match(page, /Film Factory/);
  assert.ok(page.includes(pkg.teachingVersion ?? pkg.version));
  assert.doesNotMatch(page, /%%[A-Z.-]+%%|<script[^>]+src=|<link[^>]+stylesheet/i);
  assert.match(page, /<link rel="icon"[^>]+href="data:image\/svg\+xml,/);
  assert.match(page, /<main id="cvd"[\s\S]*?id="cvd-title"[^>]*>The Reaction Room \(CVD\)/);
  assert.match(page, /<main id="theory-page"/);
  for (const [, section] of page.matchAll(/href="#theory\/([a-z-]+)"/g)) {
    assert.ok(page.includes(`id="theory-${section}"`), `Missing Theory section: ${section}`);
  }
  const script = page.match(/<script>([\s\S]+)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script));
  const worker = JSON.parse(script.match(/^\s*const morphologyWorkerCode = (.+);$/m)[1]);
  let result;
  const scope = { postMessage: (model) => { result = model; } };
  new Function('self', worker)(scope);
  scope.onmessage({ data: { segments: [] } });
  assert.equal(result.coverage, 0);
  assert.equal(result.grainMap.length, 1600);
  assert.match(page, /id="chamber-labels"[^>]+aria-pressed="true"/);
  scope.onmessage({ data: { segments: [], summaryOnly: true } });
  assert.equal(result.roughnessNm, 0);
  assert.equal(result.mesh, undefined);
  assert.match(page, /id="film-lightbox"/);
  assert.match(page, /data-background="light"/);
  assert.deepEqual([...page.matchAll(/data-plot="(\w+)" aria-pressed/g)].map(([, view]) => view),
    ['source', 'growth', 'profile', 'diagnostics', 'zones', 'morphology', 'lightbox']);
  assert.match(page, /id="process-settings"[\s\S]*?id="variant"[\s\S]*?id="pressure-control"[\s\S]*?id="material"[\s\S]*?id="source-sliders"[\s\S]*?id="distance-control"[\s\S]*?id="wafer"[\s\S]*?id="substrate-temperature-control"/);
  assert.doesNotMatch(page, /id="control-pages"/);
  assert.match(page, /id="preview-time".*min="5" max="180" step="5" value="60"/);
  assert.match(page, /id="growth-transport" hidden/);
  assert.match(page, /id="stocker-link"[\s\S]*?id="theme"/);
  assert.match(page, /id="add-wafer"[^>]+>Add to Stocker</);
  assert.doesNotMatch(page, /id="chamber-grains"/);
});
