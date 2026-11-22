import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MATERIALS, POSITIONS, advanceFilm, rates } from '../src/physics.mjs';
import { VARIANTS, newSettings } from '../src/content.mjs';
import { crystalFrequencyShift, crystalReading } from '../src/instruments.mjs';
import { growthConditions } from '../src/microstructure.mjs';
import { readWaferFile, validWafer, waferCentre, waferFile, waferFilename, waferMaterialId, waferMorphologyReason } from '../src/wafer-data.mjs';

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
