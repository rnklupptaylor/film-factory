import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MATERIALS, POSITIONS, advanceFilm, meanFreePath, rates, residueAfter, sputterYield, vapourPressure } from '../src/physics.mjs';
import { VARIANTS, controlGroups, newSettings } from '../src/content.mjs';

const check = (id, patch = {}) => {
  const settings = { ...newSettings(id), ...patch };
  return rates(VARIANTS[id], settings, MATERIALS[settings.symbol]);
};

test('argon mean free path scales as inverse chamber pressure in mbar', () => {
  assert.ok(Math.abs(meanFreePath(1e-2) - .00806) < .00004);
  assert.ok(Math.abs(meanFreePath(1e-6) / meanFreePath(1e-5) - 10) < 1e-10);
});

test('silver anchor pressures and practical evaporation reference are reproduced', () => {
  const anchors = MATERIALS.Ag.vapour;
  anchors.forEach((temperature, i) => {
    const expected = 10 ** (-5 + 2 * i);
    assert.ok(Math.abs(vapourPressure(MATERIALS.Ag, temperature + 273.15) / expected - 1) < 1e-9);
  });
  const basic = check('boat');
  assert.ok(basic.net >= .10 && basic.net <= .50);
  const solid = check('boat', { temperature: 1230 });
  assert.ok(solid.net > .005 && solid.net < basic.net);
  assert.ok(check('boat', {distance: 30}).gross < basic.gross);
});

test('target current, pulse duty, and reactive poisoning affect yield and rate', () => {
  assert.equal(sputterYield(MATERIALS.Ti, 20), 0);
  assert.equal(sputterYield(MATERIALS.Ti, 600), .6);
  assert.ok(Math.abs(check('dc', { current: .4 }).net / check('dc', { current: .2 }).net - 2) < 1e-9);
  assert.ok(Math.abs(check('pulsed', { duty: 60 }).net / check('pulsed', { duty: 30 }).net - 2) < 1e-9);
  assert.ok(check('reactive', { nitrogen: 10 }).yieldValue < check('reactive', {nitrogen: 0}).yieldValue);
  assert.equal(check('reactive', {nitrogen: 0}).film, MATERIALS.Ti);
  assert.equal(check('reactive', {nitrogen: 10}).film, MATERIALS.TiN);
  assert.equal(check('rf').yieldValue, undefined);
  assert.ok(check('rf').gross > 0);
});

test('ion bombardment can overcome growth and removes existing film without negative thickness', () => {
  const coating = check('classic', { ionCurrent: 0 });
  const etch = check('classic', { ionCurrent: 1, bias: 3000 });
  assert.ok(etch.net < 0 && coating.net > 0);
  const empty = POSITIONS.map(() => 0);
  const grown = advanceFilm(empty, coating, 8);
  assert.ok(grown[20] > grown[0]);
  assert.equal(grown[0], grown.at(-1));
  assert.ok(advanceFilm(grown, etch, .1)[20] < grown[20]);
  assert.deepEqual(advanceFilm(grown, etch, 60), empty);
  assert.equal(check('ibad', {bias: 200}).ionEnergy, 200);
});

test('classic pre-cleaning turns off deposition and clears exposed residue only with sufficient ion flux and energy', () => {
  const clean = check('classic', { preclean: true });
  assert.equal(clean.gross, 0);
  assert.ok(clean.loss > 0);
  assert.ok(clean.cleanRate > 0);
  assert.equal(residueAfter(1, check('classic'), 30), 1);
  assert.equal(residueAfter(1, check('classic', { preclean: true, ionCurrent: 0 }), 30), 1);
  assert.equal(residueAfter(1, check('classic', { preclean: true, bias: 0 }), 30), 1);
  assert.equal(residueAfter(1, clean, 30, clean.loss * 40), 1);
  assert.ok(Math.abs(residueAfter(1, clean, 30, clean.loss * 10) - residueAfter(1, clean, 20)) < 1e-12);
  assert.ok(residueAfter(1, clean, 30) < .20);
  assert.deepEqual(advanceFilm(POSITIONS.map(() => 0), clean, 30), POSITIONS.map(() => 0));
});

test('every selectable preset and control limit produces finite nonnegative flux', () => {
  for (const [id, config] of Object.entries(VARIANTS)) {
    for (const symbol of config.materials) {
      const material = MATERIALS[symbol];
      const settings = newSettings(id, symbol);
      for (const [key, , , min, max] of controlGroups(config, material).flat()) {
        assert.ok(settings[key] >= min && settings[key] <= max, `${id}/${symbol}/${key} preset is in bounds`);
        for (const value of [min, max]) {
          const result = rates(config, { ...settings, [key]: value }, material);
          assert.ok(result.localGross.every((v) => Number.isFinite(v) && v >= 0), `${id}/${symbol}/${key} flux`);
          assert.ok(Number.isFinite(result.net));
        }
      }
    }
  }
});
