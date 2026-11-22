import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MATERIALS, rates } from '../src/physics.mjs';
import { VARIANTS, newSettings } from '../src/content.mjs';
import { processGas } from '../src/instruments.mjs';
import { CHAMBER, sourceLevel } from '../src/chamber.mjs';
import { ChamberTransport } from '../src/transport.mjs';

function argonAlumina(variant, changes = {}) {
  const config = VARIANTS[variant];
  const settings = { ...newSettings(variant, 'Al'), pressure: -2.4, current: .35, energy: 350, ...changes };
  return { config, settings, sample: rates(config, settings, MATERIALS[settings.symbol]) };
}

test('reactive aluminium raises arc risk and changes target yield and gas composition', () => {
  const clean = argonAlumina('dc');
  const oxidised = argonAlumina('dc', { oxygen: 25 });
  assert.equal(clean.sample.arcing.severity, 'Low');
  assert.equal(clean.sample.film, MATERIALS.Al);
  assert.equal(processGas(clean.config, clean.settings).label, 'Ar');
  assert.equal(oxidised.sample.arcing.severity, 'Severe');
  assert.equal(oxidised.sample.film, MATERIALS.Al2O3);
  assert.ok(oxidised.sample.yieldValue < clean.sample.yieldValue);
  assert.deepEqual(processGas(oxidised.config, oxidised.settings).species, [['Ar', .75], ['O₂', .25]]);
  const copper = argonAlumina('dc', { oxygen: 25, symbol: 'Cu' });
  assert.equal(copper.sample.arcing.severity, 'Low');
  assert.equal(processGas(copper.config, copper.settings).label, 'Ar');
  assert.equal(argonAlumina('diode').sample.arcing, null);
});

test('reverse duration and arc risk respond to real pulse settings', () => {
  const dc = argonAlumina('dc', { oxygen: 25 }).sample.arcing;
  const pulse = (duty, frequency = 40, current = .35) =>
    argonAlumina('pulsed', { oxygen: 25, duty, frequency, current }).sample.arcing;
  assert.deepEqual(pulse(100), dc);
  assert.ok(Math.abs(pulse(90).reverseUs - 2.5) < 1e-8);
  assert.equal(pulse(90).severity, 'Low');
  assert.ok(pulse(98).score > pulse(90).score);
  assert.notEqual(pulse(98, 20).reverseUs, pulse(98, 60).reverseUs);
  assert.ok(pulse(90, 40, .65).score > pulse(90).score);
  assert.ok(dc.flashRate > pulse(90).flashRate);
});

test('target flashes stay near the target and stop on pause or reduced motion', () => {
  const { config, settings, sample } = argonAlumina('dc', { oxygen: 25 });
  const transport = new ChamberTransport(() => .5, () => .001);
  const update = (active, reducedMotion = false) => transport.update(.02, active, config, 'dc', settings, sample,
    MATERIALS.Al.mass, 0, reducedMotion, 0);
  update(true);
  const arc = transport.targetArc;
  assert.ok(arc.x > CHAMBER.targetLeft && arc.x < CHAMBER.targetRight);
  assert.equal(arc.y, sourceLevel(settings.distance) - 1);
  update(true);
  assert.equal(transport.targetArc, arc);
  update(false);
  assert.equal(transport.targetArc, null);
  update(true);
  assert.ok(transport.targetArc);
  update(true, true);
  assert.equal(transport.targetArc, null);
});

test('severe recipes show visibly more flashes than low-risk recipes at a bounded cadence', () => {
  const countFlashes = (oxygen) => {
    let seed = 1153;
    const transport = new ChamberTransport(() => .5, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    });
    const { sample } = argonAlumina('dc', { oxygen });
    let count = 0, last = -Infinity;
    for (let frame = 0; frame < 3600; frame++) {
      const previous = transport.targetArc;
      transport.updateTargetArc(1 / 60, sample.arcing, 300, true);
      if (transport.targetArc && transport.targetArc !== previous) {
        assert.ok((frame - last) / 60 >= .5);
        last = frame;
        count++;
      }
    }
    return count;
  };
  assert.ok(countFlashes(25) > 5 * countFlashes(0));
});
