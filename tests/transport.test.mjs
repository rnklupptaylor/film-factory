import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chamberMarkup, CHAMBER, sourceLevel } from '../src/chamber.mjs';
import { newSettings, processConfig, TECHNIQUES, VARIANTS } from '../src/content.mjs';
import { MATERIALS, rates } from '../src/physics.mjs';
import { ChamberTransport, displayFreePath } from '../src/transport.mjs';
import { SUBSTRATES } from '../src/instruments.mjs';

function scene(method, overrides = {}) {
  let seed = 7521;
  const motion = new ChamberTransport(() => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 2 ** 32;
  });
  const settings = { ...newSettings(method), ...overrides };
  const config = processConfig(method, settings.symbol);
  const material = MATERIALS[settings.symbol];
  const sample = rates(config, settings, material);
  const step = (active, frames, reduced = false, thickness = 3, residue = 0, gasOpen = active, showParticles = !reduced) => {
    for (let i = 0; i < frames; i++) motion.update(1 / 60, active, config, method, settings, sample, material.mass, thickness, reduced, residue, gasOpen, showParticles);
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
  assert.deepEqual(TECHNIQUES.sputtering.options, ['diode', 'dc', 'pulsed', 'rf']);
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

test('ion plating displays evaporation and metal-ion paths arriving at the substrate', () => {
  for (const method of ['classic', 'ibad']) {
    const { motion, step, settings } = scene(method);
    step(true, 120);
    const vapour = motion.particles.find((particle) => particle.waypoints && particle.u > .5);
    assert.ok(vapour, method);
    assert.equal(vapour.from[1], sourceLevel(settings.distance) - 2);
    assert.equal(vapour.to[1], CHAMBER.plateY);
    assert.ok(motion.impacts.some(({ kind }) => kind === 'deposit'), method);
  }
  const arc = scene('arc');
  arc.step(true, 120);
  assert.ok(arc.motion.particles.some((particle) => particle.kind === 'metal-ion' && particle.u > .5));
  assert.ok(arc.motion.particles.some((particle) => particle.kind === 'atom'));
  const diagram = chamberMarkup(arc.config, 'arc', arc.settings, arc.material, arc.sample.film);
  assert.match(diagram, />TiN film</);
  assert.match(diagram, />N₂</);
});

test('reactive ITO shows distinct argon and oxygen feed tracers', () => {
  const sputter = scene('pulsed', { symbol: 'InSn', pressure: -2.65, oxygen: 16 });
  sputter.step(true, 150);
  assert.ok(sputter.motion.gasParticles.some(({ kind }) => kind === 'oxygen'));
  assert.ok(sputter.motion.gasParticles.some(({ kind }) => kind === 'gas-argon'));
  const diagram = chamberMarkup(sputter.config, 'pulsed', sputter.settings, sputter.material, sputter.sample.film);
  assert.match(diagram, />Ar \+ O₂</);
  assert.match(diagram, />ITO film</);
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

test('particle visibility can change during a run while reduced motion still suppresses arc flashes', () => {
  const { motion, step, sample } = scene('dc', { symbol: 'Al', oxygen: 25, pressure: -2.4 });
  assert.equal(sample.arcing.severity, 'Severe');
  motion.arcRandom = () => 0;
  step(true, 60, true, 0, 0, true, true);
  assert.ok(motion.particles.length && motion.gasParticles.length);
  assert.equal(motion.targetArc, null);
  step(true, 1, false);
  assert.ok(motion.targetArc);
  const lit = motion.power.plasma;
  step(true, 1, false, 0, 0, true, false);
  assert.equal(motion.particles.length + motion.gasParticles.length + motion.impacts.length, 0);
  assert.equal(motion.targetArc, null);
  assert.ok(motion.power.plasma > 0);
  step(false, 1, false, 0, 0, false, false);
  assert.ok(motion.power.plasma > 0 && motion.power.plasma < lit);
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

test('chamber callouts lead to their components and the OES arrow stays outside the chamber', () => {
  const { config, settings, material, sample } = scene('diode');
  const diagram = chamberMarkup(config, 'diode', settings, material, sample.film);
  const groups = [...diagram.matchAll(/<g class="chamber-annotation">([\s\S]*?)<\/g>/g)];
  for (const name of ['Substrate', 'Substrate holder', 'Target', 'To pump', 'OES']) {
    const group = groups.find(([, content]) => content.includes(`>${name}</text>`));
    assert.ok(group && /class="annotation-arrow"/.test(group[1]), name);
  }
  const waferLabel = groups.find(([, content]) => content.includes('>Substrate</text>'))[1];
  assert.match(waferLabel, /y="190".*>Substrate<\/text>/);
  assert.match(waferLabel, /M396 186h12v-35l-10-19/);
  const oesLabel = groups.find(([, content]) => content.includes('>OES</text>'))[1];
  assert.match(oesLabel, /M515 191h-24/);
  assert.doesNotMatch(diagram, /film-grain-inset|chamber-grain-map/);
});

test('electrodes and supply labels follow the connected circuit', () => {
  const diagramOf = (method) => {
    const { config, settings, material, sample } = scene(method);
    return chamberMarkup(config, method, settings, material, sample.film);
  };
  assert.match(diagramOf('rf'), /~ RF<\/text>/);
  assert.match(diagramOf('rf'), /V425H442M454 425H530V396/);
  assert.match(diagramOf('dc'), /Target cathode feed/);
  assert.match(diagramOf('ebeam'), /Negative electron emitter/);
  assert.match(diagramOf('ebeam'), /Grounded hearth/);
  assert.match(diagramOf('arc'), /Arc anode return/);
  assert.match(diagramOf('classic'), /class="electrical-node voltage" cx="300" cy="109"/);
  assert.match(diagramOf('ibad'), /Negative acceleration grid/);
});
