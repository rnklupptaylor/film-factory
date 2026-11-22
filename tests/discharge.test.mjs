import assert from 'node:assert/strict';
import { test } from 'node:test';
import { controlGroups, newSettings, processConfig, VARIANTS } from '../src/content.mjs';
import { hasDcSupply, supplyControl } from '../src/discharge.mjs';
import { MATERIALS, rates } from '../src/physics.mjs';
import { ChamberTransport } from '../src/transport.mjs';

function dischargeCase(method, symbol, changes) {
  const config = processConfig(method, symbol);
  const settings = { ...newSettings(method, symbol), supplyMode: 'powerW', powerW: 120, ...changes };
  const sample = rates(config, settings, MATERIALS[symbol]);
  return { config, settings, sample, point: sample.targetSupply };
}

test('the measured Cu magnetron reference is recovered in all three supply modes', () => {
  const pressure = Math.log10(.003);
  for (const [mode, value] of [['dischargeA', .3], ['voltageV', 388.3], ['powerW', 388.3 * .3]]) {
    const { point } = dischargeCase('dc', 'Cu', { pressure, supplyMode: mode, [mode]: value });
    assert.ok(Math.abs(point.voltage - 388.3) < 1e-5);
    assert.ok(Math.abs(point.currentOn - .3) < 1e-6);
    assert.ok(Math.abs(point.ionOn - .3 / 1.084) < 1e-6);
    assert.equal(point.status, '');
  }
});

test('at equal power and pressure the diode uses a higher voltage and yields less deposition', () => {
  const diode = dischargeCase('diode', 'Cu', { pressure: -1.55 });
  const magnetron = dischargeCase('dc', 'Cu', { pressure: -1.55 });
  assert.ok(Math.abs(diode.point.power - magnetron.point.power) < 1e-5);
  assert.ok(diode.point.voltage > 2000 && magnetron.point.voltage < 400);
  assert.ok(diode.point.ionEnergy < .2 * diode.point.voltage);
  assert.ok(magnetron.point.ionAverage > diode.point.ionAverage * 5);
  assert.ok(magnetron.sample.net > diode.sample.net * 5);
});

test('an unsustained voltage stops sputtering and plasma while preserving gas flow', () => {
  const { config, settings, sample, point } = dischargeCase('dc', 'Cu', { supplyMode: 'voltageV', voltageV: 200 });
  assert.equal(point.status, 'Below sustaining voltage');
  assert.equal(point.voltage, 200);
  assert.equal(point.power, 0);
  assert.equal(sample.net, 0);
  assert.equal(sample.arcing, null);
  const transport = new ChamberTransport();
  for (let i = 0; i < 60; i++) transport.update(1 / 60, true, config, 'dc', settings, sample, MATERIALS.Cu.mass, 0, true);
  assert.ok(transport.fill > 0);
  assert.equal(transport.power.plasma, 0);
  assert.equal(transport.particles.length, 0);
});

test('aluminium oxidation changes the load and pulse duty changes on-current at constant power', () => {
  const settings = { pressure: -2.4, frequency: 40, duty: 100 };
  const clean = dischargeCase('pulsed', 'Al', settings);
  const oxide = dischargeCase('pulsed', 'Al', { ...settings, oxygen: 25 });
  const pulsed = dischargeCase('pulsed', 'Al', { ...settings, oxygen: 25, duty: 90 });
  const limited = dischargeCase('pulsed', 'Al', { ...settings, oxygen: 25, duty: 20 });
  assert.ok(oxide.point.voltage < clean.point.voltage);
  assert.ok(oxide.point.currentOn > clean.point.currentOn);
  assert.equal(oxide.sample.poisoning, oxide.point.coverage);
  assert.equal(oxide.sample.arcing.severity, 'Severe');
  assert.equal(pulsed.sample.arcing.severity, 'Low');
  assert.ok(pulsed.point.ionOn > oxide.point.ionOn);
  assert.ok(Math.abs(pulsed.point.power - 120) < 1e-5);
  assert.equal(pulsed.point.ionAverage, pulsed.point.ionOn * .9);
  assert.equal(pulsed.point.currentAverage, pulsed.point.currentOn * .9);
  assert.equal(limited.point.status, 'Supply limit');
  assert.ok(limited.point.power < 120 && limited.point.currentOn <= 1.2);
});

test('each supply range and gas endpoint produces finite electrical and film results', () => {
  for (const method of ['diode', 'dc', 'pulsed']) {
    for (const symbol of VARIANTS[method].materials) {
      const config = processConfig(method, symbol);
      if (!hasDcSupply(config)) continue;
      const [pressure, , , gas] = controlGroups(config, MATERIALS[symbol])[1];
      for (const mode of ['powerW', 'voltageV', 'dischargeA']) {
        const [, , , min, max] = supplyControl(config, mode);
        for (const value of [min, max]) {
          for (const p of [pressure[3], pressure[4]]) {
            for (const duty of config.duty ? [20, 100] : [100]) {
              const { sample, point } = dischargeCase(method, symbol, { supplyMode: mode, [mode]: value, pressure: p, duty, ...(gas ? { [gas[0]]: gas[4] } : {}) });
              assert.ok([point.power, point.currentOn, point.voltage, point.ionEnergy, sample.net].every((v) => Number.isFinite(v) && v >= 0));
              const output = { powerW: point.power, voltageV: point.voltage, dischargeA: point.currentOn }[mode];
              assert.ok(output <= value + 1e-7);
            }
          }
        }
      }
    }
  }
});
