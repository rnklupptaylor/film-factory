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
  assert.doesNotMatch(page, /%%[A-Z.]+%%|<script[^>]+src=|<link[^>]+stylesheet/i);
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
});
