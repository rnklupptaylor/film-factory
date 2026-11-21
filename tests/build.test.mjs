import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('build emits the self-contained app with its teaching version', () => {
  const root = new URL('../', import.meta.url);
  execFileSync(process.execPath, ['tools/build.mjs'], { cwd: root });
  const page = readFileSync(new URL('build/deploy/index.html', root), 'utf8');
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  assert.match(page, /Coat of Atoms/);
  assert.ok(page.includes(pkg.teachingVersion ?? pkg.version));
  assert.doesNotMatch(page, /%%[A-Z.]+%%|<script[^>]+src=|<link[^>]+stylesheet/i);
});
