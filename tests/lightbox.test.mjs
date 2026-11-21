import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lightboxFilmAppearance } from '../src/lightbox.mjs';

test('whole-sample appearance uses the radial thickness profile', () => {
  const finish = lightboxFilmAppearance([8, 17, 25, 13, 12], { roughnessNm: .7, coverage: 1, voidFraction: 0 });
  assert.equal(finish.bare, false);
  assert.equal(finish.centre, 25);
  assert.equal(finish.edge, 10);
  assert.deepEqual([...finish.radialProfile], [255, 153, 102]);
  const bare = lightboxFilmAppearance([0, 0, 0], { roughnessNm: 15, coverage: .7, voidFraction: .2 });
  assert.equal(bare.bare, true);
  assert.equal(bare.coverage, 0);
  assert.deepEqual([...bare.radialProfile], [0, 0]);
});

test('roughness, incomplete coverage and pores each reduce the modelled gloss', () => {
  const profile = [84, 100, 84];
  const finish = (changes) => lightboxFilmAppearance(profile, { roughnessNm: .25, coverage: 1, voidFraction: 0, ...changes });
  const polished = finish({});
  assert.ok(polished.roughness < .02);
  assert.ok(finish({ roughnessNm: .7 }).roughness < .025);
  assert.ok(finish({ roughnessNm: 40 }).roughness > .7);
  assert.ok(finish({ coverage: .4 }).roughness > polished.roughness);
  assert.ok(finish({ voidFraction: .5 }).roughness > polished.roughness);
  assert.ok(finish({ roughnessNm: 200, coverage: .4, voidFraction: .5 }).roughness <= .95);
});
