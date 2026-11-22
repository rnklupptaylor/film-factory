import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VARIANTS, controlGroups, newSettings } from '../src/content.mjs';
import { SUBSTRATES } from '../src/instruments.mjs';
import { MATERIALS, rates } from '../src/physics.mjs';
import { groupZoneModels, zoneDiagramMarkup, zoneModel } from '../src/zones.mjs';

function plotFor(method, symbol = VARIANTS[method].materials[0], changes = {}) {
  const config = VARIANTS[method];
  const settings = { ...newSettings(method, symbol), ...changes };
  return zoneModel(config, settings, rates(config, settings, MATERIALS[settings.symbol]));
}

test('all evaporator types use the deposited metal melting point', () => {
  for (const recipe of ['boat', 'filament', 'ebeam', 'radiant']) {
    const symbol = VARIANTS[recipe].materials[0];
    const model = plotFor(recipe, symbol, { substrate: 450, temperature: 1500 });
    assert.equal(model.kind, 'thermal');
    assert.equal(model.point[0], 450 / MATERIALS[symbol].melting);
    assert.equal(plotFor(recipe, symbol, { substrate: 450, temperature: 2000 }).point[0], model.point[0]);
  }
  assert.match(plotFor('boat', 'Ag', { substrate: 310, wafer: 'borofloat' }).context, /islands/);
  assert.equal(plotFor('boat', 'Ag', { substrate: 500, wafer: 'polycarbonate' }).hot, true);
});

test('metal sputtering compares argon pressure and distinguishes extrapolation', () => {
  const low = plotFor('dc', 'Cu', { pressure: -2.7 });
  const high = plotFor('dc', 'Cu', { pressure: -1.42 });
  assert.match(low.reading, /Zone T/);
  assert.match(high.reading, /Zone I/);
  assert.match(plotFor('dc', 'Cu', { pressure:-1 }).reading, /Outside/);
  const mixed = plotFor('reactive', 'Ti', { pressure: -2, nitrogen: 10 });
  assert.equal(mixed.kind, 'thornton');
  assert.equal(mixed.point[1], .9);
  assert.match(plotFor('diode').detail, /conventional DC diode/);
  assert.match(plotFor('rf', 'Cu').detail, /RF sputtering of metal/);
});

test('compound recipes report the relevant process axes without unsupported zone numbers', () => {
  const reactive = plotFor('reactive', 'Ti');
  assert.equal(reactive.kind, 'window');
  assert.match(reactive.y.label, /N₂ partial/);
  assert.match(reactive.detail, /at the film/);
  const ao = plotFor('itoReactive', 'InSn', { oxygen: 0 });
  assert.equal(ao.point[1], 0);
  assert.match(ao.reading, /In–Sn$/);
  assert.match(plotFor('itoCeramic').reading, /ITO$/);
  assert.match(plotFor('rf').reading, /Amorphous/);
});

test('ion assistance, arc study and pre-clean use different comparisons', () => {
  const idle = plotFor('ibad', 'Ag', { ionCurrent: 0 });
  const assisted = plotFor('ibad');
  assert.equal(idle.point[1], 0);
  assert.ok(assisted.point[1] > 0);
  assert.match(assisted.detail, /only the thermal part/);
  assert.match(plotFor('classic', 'Ag', { ionCurrent: 1, bias: 3000 }).reading, /Net removal/);
  assert.equal(plotFor('classic', 'Ag', { preclean: true }).kind, 'etch');
  const arc = plotFor('arc');
  assert.match(arc.operating, /Tₛ\/Tₘ = 0.208/);
  assert.match(zoneDiagramMarkup(arc), /Published sweep/);
});

test('comparison groups shared zone axes and keeps distinct study overlays separate', () => {
  const methods = ['classic', 'ibad', 'itoCeramic', 'itoReactive', 'dc', 'diode', 'boat'];
  const groups = groupZoneModels(methods.map((method) => ({ method, model: plotFor(method) })));
  assert.deepEqual(groups.map((group) => group.map(({ method }) => method)),
    [['classic', 'ibad'], ['itoCeramic'], ['itoReactive'], ['dc', 'diode'], ['boat']]);
});

test('comparison marks show coincident operating points together and preserve the original zone artwork', () => {
  const lower = plotFor('boat');
  const higher = plotFor('boat', 'Ag', { substrate: 500 });
  const markers = [lower, lower, higher].map((model, index) => ({
    point: model.point, label: index + 1, colour: '#2468ab', detail: model.operating,
  }));
  const plot = zoneDiagramMarkup(lower, markers);
  assert.match(plot, /3 selected operating points/);
  assert.match(plot, /comparison-point-number[^>]+>1\/2</);
  assert.match(plot, /comparison-point-number[^>]+>3</);
  assert.match(plot, /Zone III/);
  assert.doesNotMatch(plot, /zone-point-halo|NaN|undefined/);
});

test('every selectable method and control endpoint has a finite diagram position', () => {
  for (const [method, config] of Object.entries(VARIANTS)) {
    for (const symbol of config.materials) {
      for (const wafer of Object.keys(SUBSTRATES)) {
        const material = MATERIALS[symbol];
        for (const [key, , , low, high] of controlGroups(config, material).flat()) {
          for (const value of [low, high]) {
            const model = plotFor(method, symbol, { wafer, [key]: value });
            assert.ok(model.point.every(Number.isFinite), `${method}/${symbol}/${wafer}/${key}`);
            assert.doesNotMatch(zoneDiagramMarkup(model), /NaN|Infinity|undefined/);
          }
        }
      }
    }
  }
});
