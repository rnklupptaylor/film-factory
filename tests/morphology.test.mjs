import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newSettings, VARIANTS } from '../src/content.mjs';
import { chamberPressure, crystalFrequencyShift, crystalReading, gasReadings, pressureGauge, processGas, substrateStatus } from '../src/instruments.mjs';
import { arealRmsHeight, growthConditions, simulateMorphology, surfaceMesh } from '../src/microstructure.mjs';
import { sci } from '../src/graphics.mjs';
import { MATERIALS, rates } from '../src/physics.mjs';

function recipe(id, changes = {}) {
  const config = VARIANTS[id];
  const settings = { ...newSettings(id), ...changes };
  const sample = rates(config, settings, MATERIALS[settings.symbol]);
  return { config, settings, sample, conditions: growthConditions(config, settings, sample) };
}

test('morphology responds to temperature, gas scattering, and ion bombardment', () => {
  assert.ok(recipe('boat', { substrate: 680 }).conditions.hops > recipe('boat').conditions.hops);
  assert.ok(recipe('dc', { pressure: -2 }).conditions.angularSpread > recipe('dc', { pressure: -3 }).conditions.angularSpread);
  assert.ok(recipe('classic', { ionCurrent: .2 }).conditions.hops > recipe('classic', { ionCurrent: 0 }).conditions.hops);
  for (const id of ['boat', 'dc', 'classic']) {
    const film = simulateMorphology([{ ...recipe(id).conditions, duration: 60 }], 0, 20);
    const mesh = surfaceMesh(film);
    assert.ok(film.coverage > .5 && film.voidFraction >= 0);
    assert.ok(mesh.length > 0 && mesh.every(Number.isFinite));
  }
});

test('3D occupancy follows net deposition and is cleared by sufficient resputtering', () => {
  const growth = { ...recipe('boat').conditions, duration: 8, gross: .4, loss: .1 };
  const film = simulateMorphology([growth], 0, 20);
  assert.ok(Math.abs(film.count * film.resolution / film.size ** 2 - 2.4) < .002);
  const stripped = simulateMorphology([growth, { ...growth, loss: 1 }], 0, 20);
  assert.equal(stripped.count, 0);
  assert.equal(stripped.coverage, 0);
  assert.equal(stripped.roughnessNm, 0);
  assert.ok(stripped.voxels.every((voxel) => voxel === 0));
});

test('areal RMS roughness is calculated in nanometres from deviations from the mean plane', () => {
  assert.equal(arealRmsHeight([2, 4, 2, 4], .5), .5);
  assert.equal(arealRmsHeight([0, 0, 2, 2], .5), .5);
  assert.equal(arealRmsHeight([5, 5, 5, 5], 2), 0);
  const film = simulateMorphology([{ ...recipe('boat').conditions, duration: 30 }], 0, 20);
  assert.ok(film.roughnessNm > 0);
  assert.equal(film.roughnessNm, arealRmsHeight(film.tops, film.resolution));
});

test('QCM follows incident mass and the substrate warning switches at the stated threshold', () => {
  const { config, settings, sample } = recipe('classic', { ionCurrent: 1, bias: 3000 });
  assert.ok(sample.net < 0 && crystalReading(config, settings, sample).massRate > 0);
  assert.ok(Math.abs(crystalFrequencyShift(1e-5) + 81.5) < .1);
  assert.equal(substrateStatus({ wafer: 'polycarbonate', substrate: 388.15 }).hot, false);
  assert.equal(substrateStatus({ wafer: 'polycarbonate', substrate: 389 }).hot, true);
});

test('the gauge and partial pressures reflect chamber filling and show pressure with a superscript', () => {
  const { config, settings } = recipe('reactive', { nitrogen: 20 });
  const gas = processGas(config, settings);
  const base = chamberPressure(settings, gas, 0);
  const working = chamberPressure(settings, gas, 1);
  const { total, gases } = gasReadings(config, settings, chamberPressure(settings, gas, .5));
  assert.ok(base < total && total < working);
  assert.ok(Math.abs(gases[1][1] / (total - base) - .2) < 1e-12);
  assert.equal(pressureGauge(base), 'Cold-cathode gauge');
  assert.equal(pressureGauge(working), 'Capacitance gauge');
  assert.equal(sci(3.55e-2, 2), '3.55 × 10⁻²');
});
