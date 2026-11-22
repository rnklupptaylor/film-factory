import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MATERIALS, POSITIONS, advanceFilm, rates } from '../src/physics.mjs';
import { VARIANTS, newSettings } from '../src/content.mjs';
import { crystalFrequencyShift, crystalReading } from '../src/instruments.mjs';
import { growthConditions, makeMorphology } from '../src/microstructure.mjs';
import { readWaferFile, validWafer, waferCentre, waferClassification, waferFile, waferFilename, waferMaterialId, waferMorphologyReason } from '../src/wafer-data.mjs';
import { waferGraphDomain, waferGraphRows } from '../src/wafer-graphs.mjs';

function exampleWafer(variant = 'boat', symbol = VARIANTS[variant].materials[0]) {
  const config = VARIANTS[variant];
  const settings = newSettings(variant, symbol);
  const material = MATERIALS[symbol];
  const sample = rates(config, settings, material);
  const duration = 60;
  const profile = advanceFilm(POSITIONS.map(() => 0), sample, duration);
  const { massRate, thicknessRate } = crystalReading(config, settings, sample);
  const mass = massRate * duration;
  const film = waferMaterialId(sample.film);
  return {
    id: '36a35f68-3cfa-4b71-9da7-2e5ad987efc3', created: 1, version: '1.2-dev', variant, settings,
    mode: 'preview', duration, film, profile,
    growth: [[0, 0], [duration, waferCentre(profile)]], residue: [[0, 100], [duration, 100]],
    qcm: { mass, height: thicknessRate * duration, tooling: 100, trace: [[0, 0], [duration, crystalFrequencyShift(mass)]] },
    surface: { reference: duration * sample.gross, segments: [{ ...growthConditions(config, settings, sample), duration }] },
    recipes: [{ settings, duration, film }],
  };
}

test('stocker files round-trip every selectable PVD recipe and material', () => {
  const wafers = Object.entries(VARIANTS).flatMap(([variant, config]) => config.materials.map((symbol) => exampleWafer(variant, symbol)));
  const file = readWaferFile(JSON.stringify(waferFile('Typical recipes', wafers)));
  assert.equal(file.title, 'Typical recipes');
  assert.equal(file.wafers.length, wafers.length);
  assert.deepEqual(file.wafers.map((wafer) => wafer.profile), wafers.map((wafer) => wafer.profile));
});

test('invalid recipes, malformed traces and foreign schema are rejected before import', () => {
  const wafer = exampleWafer();
  assert.equal(validWafer({ ...wafer, id: '<div>unsafe</div>' }), false);
  assert.equal(validWafer({ ...wafer, variant: 'constructor' }), false);
  assert.equal(validWafer({ ...wafer, growth: [[0, 1], [70, 5], [60, 7]] }), false);
  assert.equal(validWafer({ ...wafer, settings: { ...wafer.settings, distance: 0 } }), false);
  assert.throws(() => readWaferFile(JSON.stringify({ ...waferFile('Other', [wafer]), schema: 99 })), /valid Film Factory/);
});

test('new and previously saved wafers have the same technique, subtechnique and method', () => {
  for (const [variant, subtechnique] of [['boat', 'Evaporation'], ['diode', 'Sputtering'], ['classic', 'Ion plating']]) {
    const old = exampleWafer(variant);
    const current = { ...old, technique: 'pvd' };
    const { wafers } = readWaferFile(JSON.stringify(waferFile('Techniques', [old, current])));
    for (const wafer of wafers) assert.deepEqual(waferClassification(wafer), {
      technique: 'PVD', subtechnique, method: VARIANTS[variant].name,
    });
    assert.equal(validWafer({ ...old, technique: 'cvd' }), false);
  }
});

test('older pulsed aluminium wafers receive compatible arcing controls when reloaded', () => {
  const original = exampleWafer('pulsed', 'Al');
  delete original.settings.oxygen;
  delete original.settings.frequency;
  const { wafers: [wafer] } = readWaferFile(JSON.stringify(waferFile('Older wafers', [original])));
  assert.equal(wafer.settings.oxygen, 0);
  assert.equal(wafer.settings.frequency, 40);
  assert.equal(wafer.recipes[0].settings.frequency, 40);
  assert.deepEqual(wafer.profile, original.profile);
});

test('wafer export filenames are short and based on the collection title', () => {
  assert.equal(waferFilename('  Étude Ag / distance  '), 'wafers-etude-ag-distance.json');
  assert.ok(waferFilename('Very long series of thin film experiments for evaporation').length <= 40);
  assert.equal(waferFilename('銀の薄膜'), 'wafers-銀の薄膜.json');
  assert.equal(waferFilename('---', new Date('2026-01-02')), 'wafers-2026-01-02.json');
});

test('film roughness comparison rejects bare, incomplete or incompatible surfaces', () => {
  const ag = exampleWafer();
  const surface = { count: 1000, coverage: .99, resolution: 1 };
  assert.equal(waferMorphologyReason([ag, ag], [surface, surface]), '');
  assert.match(waferMorphologyReason([ag, ag], [surface, { ...surface, count: 0 }]), /bare/i);
  assert.match(waferMorphologyReason([ag, ag], [surface, { ...surface, coverage: .7 }]), /95%/);
  assert.match(waferMorphologyReason([ag, exampleWafer('arc')], [surface, surface]), /same coating/);
  assert.match(waferMorphologyReason([ag, ag], [surface, { ...surface, resolution: 3 }]), /resolution/);
  const overheated = { ...ag, recipes: [{ ...ag.recipes[0], settings: { ...ag.settings, wafer: 'polycarbonate', substrate: 450 } }] };
  assert.match(waferMorphologyReason([ag, overheated], [surface, surface]), /thermal reference/);
});

test('graph axes keep actual zero values distinct from quantities that do not apply', () => {
  const evaporation = exampleWafer('boat');
  const sputtering = exampleWafer('diode');
  const [a, b] = waferGraphRows([evaporation, sputtering], 'temperature', 'energy');
  assert.deepEqual([a.x, a.y, b.x, b.y], [evaporation.settings.temperature, null, null, sputtering.settings.energy]);
  const [bare] = waferGraphRows([{ ...evaporation, profile: POSITIONS.map(() => 0) }], 'centre', 'uniformity');
  assert.equal(bare.x, 0);
  assert.equal(bare.y, null);
});

test('wafer graph domains handle one value and pressure decades without degeneracy', () => {
  assert.deepEqual(waferGraphDomain([0, 0]), [0, 1]);
  assert.deepEqual(waferGraphDomain([1e-6, 1e-2], true), [-6, -2]);
  const samePressure = waferGraphDomain([1e-4, 1e-4], true);
  assert.ok(samePressure[0] < -4 && samePressure[1] > -4);
  assert.ok(waferGraphDomain([-10, -5])[1] < 0);
});

test('graph grain metrics match the microscopy model without building a mesh', () => {
  const wafer = exampleWafer();
  const summary = makeMorphology({ ...wafer.surface, summaryOnly: true, includeGrains: true });
  const full = makeMorphology(wafer.surface);
  assert.equal(summary.mesh, undefined);
  assert.ok(full.grainCount > 0);
  assert.equal(summary.grainCount, full.grainCount);
  const [row] = waferGraphRows([wafer], 'roughness', 'grainDiameter', [summary]);
  assert.equal(row.x, full.roughnessNm);
  assert.equal(row.y, full.medianDiameter);
});
