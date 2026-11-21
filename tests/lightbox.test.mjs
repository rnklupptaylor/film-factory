import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FilmLightbox, lightboxFilmAppearance } from '../src/lightbox.mjs';

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

test('lightbox supports wheel and pinch zoom while retaining single-pointer rotation', (t) => {
  const originalObserver = globalThis.ResizeObserver;
  const originalAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.requestAnimationFrame = () => 1;
  t.after(() => {
    globalThis.ResizeObserver = originalObserver;
    globalThis.requestAnimationFrame = originalAnimationFrame;
  });
  const listeners = new Map();
  const canvas = {
    dataset: {},
    getContext: () => null,
    addEventListener: (type, handler) => listeners.set(type, handler),
    setPointerCapture() {},
  };
  const view = new FilmLightbox(canvas, {}, '');
  const emit = (type, event) => listeners.get(type)(event);
  const pointer = (pointerId, clientX) => ({ pointerId, clientX, clientY: 0, button: 0 });
  let wheelHandled = false;
  emit('wheel', { deltaY: -120, deltaMode: 0, preventDefault() { wheelHandled = true; } });
  assert.ok(wheelHandled && view.zoom > 1);
  view.resetView();
  const angles = [...view.angles];
  emit('pointerdown', pointer(1, 0));
  emit('pointerdown', pointer(2, 100));
  emit('pointermove', pointer(2, 150));
  assert.equal(view.zoom, 1.5);
  assert.deepEqual(view.angles, angles);
  emit('pointerup', pointer(2, 150));
  emit('pointermove', pointer(1, 1));
  assert.notDeepEqual(view.angles, angles);
  emit('wheel', { deltaY: 1e4, deltaMode: 0, preventDefault() {} });
  assert.equal(view.zoom, .6);
  view.setBackground('light');
  assert.equal(canvas.dataset.background, 'light');
  view.resetView();
  assert.equal(view.zoom, 1);
  assert.deepEqual(view.angles, angles);
});
