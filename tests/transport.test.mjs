import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chamberMarkup, CHAMBER, sourceLevel } from '../src/chamber.mjs';
import { newSettings, TECHNIQUES, VARIANTS } from '../src/content.mjs';
import { MATERIALS, rates } from '../src/physics.mjs';
import { ChamberTransport, displayFreePath } from '../src/transport.mjs';
import { SUBSTRATES } from '../src/instruments.mjs';

function scene(method, overrides = {}) {
  let seed = 7521;
  const motion = new ChamberTransport(() => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 2 ** 32;
  });
  const config = VARIANTS[method];
  const settings = { ...newSettings(method), ...overrides };
  const material = MATERIALS[settings.symbol];
  const sample = rates(config, settings, material);
  const step = (active, frames, reduced = false, thickness = 3, residue = 0, gasOpen = active) => {
    for (let i = 0; i < frames; i++) motion.update(1 / 60, active, config, method, settings, sample, material.mass, thickness, reduced, residue, gasOpen);
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

test('the default DC diode operates without magnets and magnetron diagrams show poles and field', () => {
  assert.equal(TECHNIQUES.sputtering.options[0], 'diode');
  for (const method of TECHNIQUES.sputtering.options) {
    const { config, settings, material, sample } = scene(method);
    const diagram = chamberMarkup(config, method, settings, material, sample.film);
    if (method === 'diode') {
      assert.doesNotMatch(diagram, /class="magnetron"|Magnetic field B/);
      assert.match(diagram, /−2.5 kV/);
      assert.ok(10 ** settings.pressure * 100 >= 2 && 10 ** settings.pressure * 100 <= 4);
    } else {
      assert.match(diagram, /Magnetic field B/);
      assert.match(diagram, /class="magnetron-pole"[^>]+>N</);
      assert.match(diagram, /class="magnetron-pole"[^>]+>S</);
    }
  }
});

test('Ar⁺ pre-cleaning runs with plasma and residue tracers but with no heater or vapour', () => {
  const clean = scene('classic', { preclean: true });
  clean.step(true, 90, false, 0, 1);
  assert.ok(clean.motion.power.plasma > 0);
  assert.equal(clean.motion.power.heat, 0);
  assert.ok(clean.motion.particles.some((p) => p.kind === 'argon'));
  assert.ok(clean.motion.particles.some((p) => p.kind === 'removed'));
  assert.ok(clean.motion.particles.every((p) => p.kind !== 'atom'));
  const diagram = chamberMarkup(clean.config, 'classic', clean.settings, clean.material, clean.sample.film);
  assert.match(diagram, /Heater off/);
  assert.match(diagram, /id="surface-residue"/);
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
  assert.equal(rf.motion.gasParticles.length, 0);
  assert.equal(rf.motion.fill, 1);
  assert.ok(rf.motion.power.plasma > 0);
  rf.step(false, 1, true);
  assert.equal(rf.motion.visible, false);
  const diagram = chamberMarkup(rf.config, 'rf', rf.settings, rf.material, rf.sample.film);
  assert.match(diagram, /blocking capacitor/);
  assert.match(diagram, /− self-bias/);
  assert.match(diagram, /0 V return/);
});

test('gas starts upstream of the discharge, continues during coating, and clears when the supply closes', () => {
  for (const [method, kind] of [['diode','gas-argon'], ['classic','gas-argon'], ['arc','nitrogen'], ['ibad','gas-argon']]) {
    const { motion, step } = scene(method, { preclean: method === 'classic' });
    step(false, 20, false, 0, 1, true);
    assert.ok(motion.fill > 0 && motion.gasParticles.length > 0, method);
    assert.ok(motion.gasParticles.every((gas) => gas.kind === kind), method);
    assert.ok(motion.gasParticles.some((gas) => gas.x >= (method === 'ibad' ? 191 : CHAMBER.inletX)), method);
    assert.equal(motion.power.plasma, 0);
    assert.equal(motion.particles.length, 0);
    step(true, 140);
    assert.ok(motion.gasParticles.some((gas) => gas.age < .05), method);
    step(false, 150);
    assert.equal(motion.gasParticles.length, 0);
    assert.equal(motion.fill, 0);
  }
  for (const run of [scene('boat'), scene('ibad', { ionCurrent: 0 })]) {
    run.step(true, 140);
    assert.equal(run.motion.fill, 0);
    assert.equal(run.motion.gasParticles.length, 0);
  }
});

test('the holder has its own heater and a distinct rendering for each substrate', () => {
  const substrates = new Set();
  for (const wafer of Object.keys(SUBSTRATES)) {
    const { config, settings, material, sample, motion, step } = scene('classic', { wafer, preclean: true, substrate: 510 });
    const diagram = chamberMarkup(config, 'classic', settings, material, sample.film);
    assert.match(diagram, /id="holder-coil"/);
    assert.match(diagram, /fill="url\(#substrate-material\)"/);
    substrates.add(diagram.match(/<linearGradient id="substrate-material"[^]*?<\/linearGradient>/)[0]);
    step(true, 20);
    assert.ok(motion.power.holder > 0 && motion.power.heat === 0);
  }
  assert.equal(substrates.size, Object.keys(SUBSTRATES).length);
});

test('chamber object names have leaders and the film grain inset starts hidden', () => {
  const { config, settings, material, sample } = scene('diode');
  const diagram = chamberMarkup(config, 'diode', settings, material, sample.film);
  const groups = [...diagram.matchAll(/<g class="chamber-annotation">([\s\S]*?)<\/g>/g)];
  for (const name of ['Substrate', 'Substrate holder', 'Target', 'To pump']) {
    const group = groups.find(([, content]) => content.includes(`>${name}</text>`));
    assert.ok(group && /class="annotation-arrow"/.test(group[1]), name);
  }
  assert.match(diagram, /id="film-grain-inset" visibility="hidden"/);
  assert.match(diagram, /id="chamber-grain-map"/);
});
