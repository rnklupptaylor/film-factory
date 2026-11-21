export const KB = 1.380649e-23;
export const E = 1.602176634e-19;
const AVOGADRO = 6.02214076e23;
const ARGON_DIAMETER = 3.4e-10;
export const WAFER_RADIUS_CM = 5;
export const POSITIONS = Array.from({ length: 41 }, (_, i) => (i - 20) / 4);

// Pressure anchors in ascending order from 10⁻⁷ to 10⁻¹ mbar (MBE-Komponenten).
// Ar⁺ yield knots [eV, atoms/ion]: threshold and low-energy table, plus
// Angstrom Sciences (600 eV). Bulk constants are rounded RSC values.
export const MATERIALS = {
  Ag: { name: 'Silver', mass: 107.868, density: 10500, melting: 1235, vapour: [618,742,907,1135], yields: [[15,0],[60,.22],[100,.63],[200,1.58],[300,2.2],[600,3.4]], colour: '#b5c5d6' },
  Al: { name: 'Aluminium', mass: 26.982, density: 2700, melting: 933, vapour: [745,892,1087,1362], yields: [[13,0],[100,.11],[200,.35],[300,.65],[600,1.2]], colour: '#b9c9e6' },
  Au: { name: 'Gold', mass: 196.967, density: 19300, melting: 1337, vapour: [871,1034,1252,1558], yields: [[20,0],[100,.32],[200,1.07],[300,1.65],[600,2.8]], colour: '#ecc672' },
  Cr: { name: 'Chromium', mass: 51.996, density: 7150, melting: 2180, vapour: [899,1054,1256,1530], yields: [[22,0],[100,.30],[200,.67],[300,.87],[600,1.3]], colour: '#9eabc7' },
  Cu: { name: 'Copper', mass: 63.546, density: 8960, melting: 1358, vapour: [773,921,1117,1390], yields: [[17,0],[60,.10],[100,.48],[200,1.10],[300,1.59],[600,2.3]], colour: '#e5a678' },
  Ti: { name: 'Titanium', mass: 47.867, density: 4500, melting: 1941, vapour: [1134,1325,1576,1921], yields: [[20,0],[100,.081],[200,.22],[300,.33],[600,.6]], colour: '#aeb8d4' },
  SiO2: { name: 'Silica', mass: 60.084, density: 2200, colour: '#a3cddd' },
  TiN: { name: 'Titanium nitride', mass: 61.874, density: 5220, colour: '#e4ba65' },
};

function interpolate(points, x) {
  for (let i = 1; i < points.length; i++) {
    const [right, b] = points[i];
    if (x > right) continue;
    const [left, a] = points[i - 1];
    return a + (b - a) * (x - left) / (right - left);
  }
  return points.at(-1)[1];
}

export function vapourPressure(material, kelvin) {
  const points = material.vapour.map((celsius, i) => [-1 / (celsius + 273.15), -5 + 2 * i]);
  return 10 ** interpolate(points, Math.max(-1 / kelvin, points[0][0]));
}

export function sputterYield(material, energy) {
  if (energy <= material.yields[0][0]) return 0;
  return interpolate(material.yields, energy);
}

export function meanFreePath(pressureMbar) {
  return KB * 300 / (Math.SQRT2 * Math.PI * ARGON_DIAMETER ** 2 * pressureMbar * 100);
}

function volumePerParticle(material) {
  return material.mass * 1e-3 / (AVOGADRO * material.density);
}

function thicknessRate(flux, material) {
  return flux * volumePerParticle(material) * 1e9;
}

export function rates(config, settings, material) {
  const { distance, pressure, substrate } = settings;
  const gap = distance / 100;
  const lambda = meanFreePath(10 ** pressure);
  const ballistic = Math.exp(-gap / lambda);
  // An empirical survival factor represents collection after scattering. It
  // does not equate loss of line-of-sight transport with loss of all flux.
  const transmission = 1 / (1 + gap / (8 * lambda));
  const geometry = 1 / (Math.PI * gap ** 2);
  let gross, loss = 0, vapour, yieldValue, ionEnergy, ionDose, poisoning, film = material;

  if (config.family === 'evaporation') {
    vapour = vapourPressure(material, settings.temperature);
    const atomicMass = material.mass * 1e-3 / AVOGADRO;
    const flux = vapour / Math.sqrt(2 * Math.PI * atomicMass * KB * settings.temperature);
    gross = thicknessRate(flux * config.area * geometry * transmission, material);
  } else if (config.family === 'sputtering') {
    const ionCurrent = settings.current * (config.duty ? settings.duty / 100 : 1);
    if (material.yields) {
      yieldValue = sputterYield(material, settings.energy);
    } else {
      gross = .10 * (ionCurrent / .25) * (settings.energy / 350) ** .65 * (.085 / gap) ** 2 * transmission;
    }
    if (config.reactive) {
      const nitrogen = 10 ** pressure * 100 * settings.nitrogen / 100;
      const uptake = nitrogen / .20;
      poisoning = uptake / (uptake + ionCurrent / .25);
      yieldValue *= 1 - .63 * poisoning;
      film = nitrogen >= .15 ? MATERIALS.TiN : material;
    }
    if (material.yields) gross = thicknessRate(ionCurrent / E * yieldValue * geometry * transmission, film);
  } else {
    film = config.arc ? MATERIALS.TiN : material;
    const gapScale = (.14 / gap) ** 2;
    gross = settings.arrival * gapScale * transmission;
    // At collisional classic-plating pressures, the full bias drop is an
    // upper bound. This uses a fixed 6 mm illustrative sheath length.
    const sheathFactor = config.classic ? 1 / (1 + .006 / lambda) : 1;
    ionEnergy = config.ibad ? settings.bias : config.arc ? 20 + 1.5 * settings.bias : (settings.bias + 12) * sheathFactor;
    const ionFlux = settings.ionCurrent * 10 / E; // mA/cm² → A/m² → ions/(m² s), singly charged equivalent
    const equivalentYield = config.arc
      ? .45 * sputterYield(MATERIALS.Ti, ionEnergy)
      : sputterYield(material, Math.min(600, ionEnergy));
    loss = thicknessRate(ionFlux * equivalentYield, film);
    ionDose = gross > 0 ? ionEnergy * ionFlux * volumePerParticle(film) * 1e9 / gross : 0;
  }

  const theta = material.melting && film === material ? substrate / material.melting : undefined;
  const localGross = POSITIONS.map((x) => {
    const cosine = 1 / Math.hypot(1, x / distance);
    const direct = cosine ** 4;
    const scattered = config.family === 'evaporation' ? direct : .88 + .12 * direct;
    return gross * (direct * ballistic + scattered * (1 - ballistic));
  });
  return { gross, loss, net: gross - loss, localGross, vapour, yieldValue, ionEnergy, ionDose, poisoning, lambda, ballistic, film, theta };
}

export function advanceFilm(thickness, sample, seconds) {
  return thickness.map((value, i) => Math.max(0, value + (sample.localGross[i] - sample.loss) * seconds));
}

export function morphology(config, sample, pressure) {
  if (config.family === 'plating') {
    if (sample.net <= 0) return { name: 'Resputtering dominates', type: 'etch' };
    if (sample.ionDose < 5) return { name: 'Weak ion assistance', type: 'columnar' };
    if (sample.ionDose < 90) return { name: 'Ion-assisted growth', type: 'dense' };
    return { name: 'Strong bombardment', type: 'dense' };
  }
  if (sample.theta === undefined) return { name: 'Cross-section schematic', type: 'plain' };
  if (sample.theta >= .64) return { name: 'Zone 3 · Equiaxial', type: 'equiaxial' };
  if (config.family === 'evaporation') {
    if (sample.theta >= .32) return { name: 'Zone 2 · Columnar', type: 'columnar' };
  } else {
    const gasShift = .045 * (pressure + 3);
    if (sample.theta >= .42 + gasShift) return { name: 'Zone 2 · Columnar', type: 'columnar' };
    if (sample.theta >= .22 + gasShift) return { name: 'Zone T · Fibrous', type: 'dense' };
  }
  return { name: 'Zone 1 · Porous tapered grains', type: 'porous' };
}
