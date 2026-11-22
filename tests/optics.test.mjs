import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FILM_OPTICS, SUBSTRATE_OPTICS, WAVELENGTHS_NM, displayTint, stackColour, stackColourCSS,
  stackReflectance, stackTransmissionColour, stackTransmittance } from '../src/optics.mjs';

const GREEN = WAVELENGTHS_NM[1];
const hueAngle = ([r, g, b]) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), span = max - min;
  if (span < 1e-9) return 0;
  const raw = max === r ? (g - b) / span % 6 : max === g ? (b - r) / span + 2 : (r - g) / span + 4;
  return (raw * 60 + 360) % 360;
};
const chromaAngle = ([r, g, b]) => {
  const total = r + g + b;
  return [r / total, g / total];
};
const chromaDrift = (a, b) => Math.hypot(chromaAngle(a)[0] - chromaAngle(b)[0], chromaAngle(a)[1] - chromaAngle(b)[1]);

test('optical tables cover the coatings and substrates with the documented band order', () => {
  for (const film of ['Silver', 'Aluminium', 'Gold', 'Chromium', 'Copper', 'Titanium',
    'Titanium nitride', 'Indium tin oxide', 'Silica', 'Alumina']) {
    const row = FILM_OPTICS[film];
    assert.equal(row.length, 3);
    for (const [n, k] of row) {
      assert.ok(n > 0 && n < 14, `${film} n = ${n}`);
      assert.ok(k >= 0 && k < 8, `${film} k = ${k}`);
    }
  }
  for (const substrate of ['silicon', 'borofloat', 'silica', 'steel', 'polycarbonate', 'kapton']) {
    assert.equal(SUBSTRATE_OPTICS[substrate].length, 3);
  }
});

test('silica on silicon cycles through the expected interference colour sequence', () => {
  const hueAt = (d) => hueAngle(stackColour('Silica', d, 'silicon'));
  // Gold-brown, violet/magenta, blue, green-grey, gold, orange, violet.
  const windows = [[60, [330, 70, true]], [90, [230, 330]], [120, [180, 260]], [180, [140, 220]],
    [210, [25, 90]], [250, [300, 60, true]], [274, [230, 330]]];
  for (const [d, [from, to, wrap]] of windows) {
    const hue = hueAt(d);
    const inside = wrap ? hue >= from || hue <= to : hue >= from && hue <= to;
    assert.ok(inside, `hue at ${d} nm is ${hue .toFixed(1)}°, expected near colourful slide`);
  }
});

test('the green-band period follows the optical thickness scale', () => {
  const period = GREEN / (2 * FILM_OPTICS.Silica[1][0]);
  const at = (d) => stackReflectance('Silica', d, 'silicon')[1];
  for (const d of [40, 100]) {
    assert.ok(Math.abs(at(d) - at(d + period)) < .01, `period mismatch at ${d} nm`);
  }
  assert.ok(Math.abs(period - 188.4) < 5);
});

test('green reflectance exceeds blue near the second-order gold band', () => {
  const [r650, r550, r450] = stackReflectance('Silica', 210, 'silicon');
  assert.ok(r550 > r450, `R550 ${r550.toFixed(3)} must exceed R450 ${r450.toFixed(3)}`);
});

test('alumina cycles its colour faster than silica at the same thickness', () => {
  const quarterWave = (n) => GREEN / (4 * n);
  const minAt550 = (film) => {
    let previous = 1;
    for (let d = 1; d < 300; d += .25) {
      const r = stackReflectance(film, d, 'silicon')[1];
      if (r > previous) return d - .25;
      previous = r;
    }
  };
  const silicaMin = minAt550('Silica'), aluminaMin = minAt550('Alumina');
  assert.ok(Math.abs(silicaMin - quarterWave(1.460)) < 3, `silica minimum ${silicaMin} nm`);
  assert.ok(Math.abs(aluminaMin - quarterWave(1.770)) < 3, `alumina minimum ${aluminaMin} nm`);
  assert.ok(aluminaMin < silicaMin);
});

test('silica on glass stays almost invisible in transmission while front-surface reflectance shifts', () => {
  const bare = stackTransmittance('Silica', 0, 'borofloat');
  const observed = new Set();
  for (const d of [20, 60, 100, 140, 188, 230, 274]) {
    const t = stackTransmittance('Silica', d, 'borofloat');
    for (const value of t) assert.ok(value > .955, `transmission ${value} fell below bare glass at ${d} nm`);
    observed.add(t.map((x) => x.toFixed(4)).join('/'));
  }
  const bareAirGlass = stackReflectance('Silica', 0, 'borofloat');
  const coated = stackReflectance('Silica', 188, 'borofloat');
  assert.ok(Math.abs(coated[2] - bareAirGlass[2]) > 1e-4, 'front-surface reflectance should still shift');
});

test('metallic films keep their intrinsic tint once optically opaque', () => {
  for (const film of ['Silver', 'Aluminium', 'Gold', 'Chromium', 'Copper', 'Titanium', 'Titanium nitride']) {
    // Below roughly 30 nm the bulk constants describe a translucent islanded
    // film; the lightbox opacity model governs that regime instead.
    const thin = stackColour(film, 40, 'silicon');
    const thick = stackColour(film, 274, 'silicon');
    const drift = chromaDrift(thin, thick);
    assert.ok(drift < .05, `${film} chromaticity drift ${drift.toFixed(3)} from 40 nm to 274 nm`);
  }
  const gold = stackColour('Gold', 274, 'silicon');
  assert.ok(gold[0] > gold[1] && gold[1] > gold[2], 'gold stays warm');
  const silver = stackColour('Silver', 274, 'silicon');
  const spread = Math.max(...silver) - Math.min(...silver);
  assert.ok(spread < .05, 'silver stays neutral');
});

test('thin absorbing films never cycle through interference colours', () => {
  for (const film of ['Gold', 'Silver', 'Copper', 'Titanium nitride']) {
    let drift = 0;
    for (let d = 10; d <= 274; d += 22) {
      for (let e = 10; e <= 274; e += 22) {
        drift = Math.max(drift, chromaDrift(stackColour(film, d, 'silicon'), stackColour(film, e, 'silicon')));
      }
    }
    assert.ok(drift < .09, `${film} chromaticity spread ${drift.toFixed(3)} too wide`);
  }
});

test('ITO on glass tints the backdrop while index-matched silica does not', () => {
  const bare = stackColour('Silica', 0, 'borofloat');
  let itoShift = 0;
  for (const d of [50, 100, 150, 200, 274]) {
    const tinted = stackTransmissionColour('Indium tin oxide', d, 'borofloat');
    itoShift = Math.max(itoShift, chromaDrift(tinted, bare));
  }
  assert.ok(itoShift > .02, `ITO transmission shift ${itoShift.toFixed(3)} too small`);
  let silicaShift = 0;
  for (const d of [50, 100, 150, 200, 274]) {
    const tinted = stackTransmissionColour('Silica', d, 'borofloat');
    silicaShift = Math.max(silicaShift, chromaDrift(tinted, bare));
  }
  assert.ok(silicaShift < .01, `silica transmission shift ${silicaShift.toFixed(3)} too large`);
});

test('transmittance conserves energy with the stated approximation', () => {
  for (const d of [40, 130, 210]) {
    const [r, t] = [stackReflectance('Silica', d, 'borofloat'), stackTransmittance('Silica', d, 'borofloat')];
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(r[i] + t[i] - 1) < 1e-12);
  }
});

test('the Lightbox shader mirror matches the reference optics model', () => {
  // Hand-ported from interferenceReflectance and opticsTint in src/lightbox.mjs.
  const v3 = (a) => Float64Array.from(a);
  const cmul = (ar, ai, br, bi) => [
    v3([ar[0]*br[0] - ai[0]*bi[0], ar[1]*br[1] - ai[1]*bi[1], ar[2]*br[2] - ai[2]*bi[2]]),
    v3([ar[0]*bi[0] + ai[0]*br[0], ar[1]*bi[1] + ai[1]*br[1], ar[2]*bi[2] + ai[2]*br[2]]),
  ];
  const shaderReflectance = (filmRow, baseRow, d) => {
    const nf = filmRow.map(([n]) => n), kf = filmRow.map(([, k]) => k);
    const ns = baseRow.map(([n]) => n), ks = baseRow.map(([, k]) => k);
    const lambda = WAVELENGTHS_NM;
    const den01 = nf.map((_, i) => (1 + nf[i]) ** 2 + kf[i] ** 2);
    const r01r = nf.map((_, i) => (1 - nf[i] ** 2 - kf[i] ** 2) / den01[i]);
    const r01i = kf.map((x, i) => 2 * x / den01[i]);
    const den12 = nf.map((_, i) => (nf[i] + ns[i]) ** 2 + (kf[i] + ks[i]) ** 2);
    const r12r = nf.map((_, i) => ((nf[i] - ns[i]) * (nf[i] + ns[i])
      - (ks[i] - kf[i]) * (kf[i] + ks[i])) / den12[i]);
    const r12i = nf.map((_, i) => ((nf[i] - ns[i]) * (kf[i] + ks[i])
      + (ks[i] - kf[i]) * (nf[i] + ns[i])) / den12[i]);
    const wAtt = kf.map((x, i) => Math.exp(-12.56637 * x * d / lambda[i]));
    const wPh = nf.map((x, i) => 12.56637 * x * d / lambda[i]);
    const wR = wAtt.map((x, i) => x * Math.cos(wPh[i])), wI = wAtt.map((x, i) => -x * Math.sin(wPh[i]));
    const [q01r, q01i] = cmul(v3(r01r), v3(r01i), v3(r12r), v3(r12i));
    const [w12r, w12i] = cmul(v3(r12r), v3(r12i), v3(wR), v3(wI));
    let [tR, tI] = cmul(v3(r01r.map((x, i) => x + w12r[i])), v3(r01i.map((x, i) => x + w12i[i])), [1, 1, 1], [0, 0, 0]);
    let [uR, uI] = cmul(v3(q01r), v3(q01i), v3(wR), v3(wI));
    uR = uR.map((x) => x + 1);
    const rr = tR.map((x, i) => (x * uR[i] + tI[i] * uI[i]) / (uR[i] ** 2 + uI[i] ** 2));
    const ri = tI.map((x, i) => (x * uR[i] - tR[i] * uI[i]) / (uR[i] ** 2 + uI[i] ** 2));
    return rr.map((x, i) => x * x + ri[i] * ri[i]);
  };
  const shaderTint = (reflectance) => {
    const lin = reflectance.map((r) => Math.min(1, (1.6 * r) / (1 + 0.6 * r)));
    const luma = .2126 * lin[0] + .7152 * lin[1] + .0722 * lin[2];
    return lin.map((c) => Math.min(1, Math.max(0, luma + 1.5 * (c - luma))));
  };
  for (const film of ['Silica', 'Alumina', 'Indium tin oxide', 'Gold', 'Titanium nitride']) {
    for (const substrate of ['silicon', 'borofloat', 'steel']) {
      for (const d of [5, 60, 120, 210, 274]) {
        const reference = displayTint(stackReflectance(film, d, substrate));
        const mirrored = shaderTint(shaderReflectance(FILM_OPTICS[film], SUBSTRATE_OPTICS[substrate], d));
        for (let i = 0; i < 3; i++) {
          assert.ok(Math.abs(reference[i] - mirrored[i]) < 1e-6,
            `${film} on ${substrate} at ${d} nm: ${reference[i]} vs ${mirrored[i]}`);
        }
      }
    }
  }
});

test('sRGB colours are encoded and bracketed for CSS output', () => {
  const colour = stackColour('Silica', 210, 'silicon');
  for (const channel of colour) {
    assert.ok(channel > 0 && channel <= 1);
  }
  assert.match(stackColourCSS(colour), /^rgb\(\d+,\d+,\d+\)$/);
  assert.equal(stackColourCSS([2, 1.4, -1]), 'rgb(255,255,0)');
});
