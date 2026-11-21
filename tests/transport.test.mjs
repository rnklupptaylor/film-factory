import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chamberMarkup, CHAMBER, sourceLevel } from '../src/chamber.mjs';
import { newSettings, VARIANTS } from '../src/content.mjs';
import { MATERIALS, rates } from '../src/physics.mjs';
import { ChamberTransport, displayFreePath } from '../src/transport.mjs';

function scene(method) {
  let seed = 7521;
  const motion = new ChamberTransport(() => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 2 ** 32;
  });
  const config = VARIANTS[method];
  const settings = newSettings(method);
  const material = MATERIALS[settings.symbol];
  const sample = rates(config, settings, material);
  const step = (active, frames, reduced = false) => {
    for (let i = 0; i < frames; i++) motion.update(1 / 60, active, config, method, settings, sample, material.mass, 3, reduced);
  };
  return { motion, config, settings, material, sample, step };
}

test('neutral transport responds to pressure and moves away from an evaporation source', () => {
  assert.ok(displayFreePath(10, 18) > displayFreePath(.008, 18));
  const boat = scene('boat');
  boat.step(true, 20);
  assert.ok(boat.motion.particles.length > 10);
  assert.ok(boat.motion.particles.every((p) => p.kind === 'atom' && p.vy <= 0));
  assert.ok(boat.motion.particles.some((p) => p.y < sourceLevel(boat.settings.distance) - 25));
});

test('sputtering emits neutrals after target impact and IBAD ions start at the independent gun', () => {
  const magnetron = scene('dc');
  magnetron.step(true, 10);
  assert.deepEqual(new Set(magnetron.motion.particles.map((p) => p.kind)), new Set(['argon']));
  magnetron.step(true, 40);
  assert.ok(magnetron.motion.particles.some((p) => p.kind === 'atom'));
  assert.ok(magnetron.motion.impacts.some((p) => p.kind === 'target'));
  const ibad = scene('ibad');
  ibad.step(true, 20);
  assert.ok(ibad.motion.particles.some((p) => p.kind === 'argon' && p.from[0] === CHAMBER.gunX));
});

test('every coater starts dark, glows in the appropriate mode, then clears and goes fully dark', () => {
  for (const [method, config] of Object.entries(VARIANTS)) {
    const { motion, step } = scene(method);
    step(false, 10);
    assert.equal(motion.visible, false, method);
    step(true, 60);
    const isPlasma = config.family === 'sputtering' || config.classic || config.arc;
    const key = isPlasma ? 'plasma' : 'heat';
    const lit = motion.power[key];
    assert.ok(lit > 0, method);
    step(false, 1);
    assert.ok(motion.power[key] < lit && motion.power[key] > 0, method);
    step(false, 130);
    assert.equal(motion.visible, false, method);
    assert.equal(motion.particles.length, 0, method);
  }
});

test('reduced motion retains the circuit and powered state without moving tracers', () => {
  const rf = scene('rf');
  rf.step(true, 60, true);
  assert.equal(rf.motion.particles.length, 0);
  assert.ok(rf.motion.power.plasma > 0);
  rf.step(false, 1, true);
  assert.equal(rf.motion.visible, false);
  const diagram = chamberMarkup(rf.config, 'rf', rf.settings, rf.material, rf.sample.film);
  assert.match(diagram, /blocking capacitor/);
  assert.match(diagram, /− self-bias/);
  assert.match(diagram, /0 V return/);
});
