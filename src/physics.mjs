import { hasAluminaRecipe, sputterArcing } from './arcing.mjs';
import { sputterDischarge } from './discharge.mjs';

export const KB = 1.380649e-23;
export const E = 1.602176634e-19;
const AVOGADRO = 6.02214076e23;
const ARGON_DIAMETER = 3.4e-10;
export const WAFER_RADIUS_CM = 5;
export const TIN_NITROGEN_PA = .15;
export const ITO_OXIDE_PA = .030;
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
  SiO2: { name: 'Silica', formula: 'SiO₂', mass: 60.084, density: 2200, colour: '#a3cddd' },
  Al2O3: { name: 'Alumina', formula: 'Al₂O₃', mass: 101.961, density: 3200, colour: '#c4d6e7' },
  TiN: { name: 'Titanium nitride', formula: 'TiN', mass: 61.874, density: 5220, colour: '#e4ba65' },
  // The sputtered tracer mass is representative of In-rich metal species.
  ITO: { name: 'Indium tin oxide', formula: 'ITO', mass: 114.8, density: 7140, colour: '#9ae1cf' },
  InSn: { name: 'Indium–tin alloy', formula: 'In–Sn', mass: 115.2, density: 7300, colour: '#b2c2d5' },
  InSnOx: { name: 'Partially oxidised In–Sn', formula: 'In–Sn–O', mass: 115.2, density: 7200, colour: '#9cbbc1' },
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

function aluminaCoverage(oxygenPressure, ionCurrent, oxideYield) {
  // A steady-state balance of chemisorbed oxygen and sputter removal.
  // O₂ supplies 4/3 Al-equivalents per sticking molecule for Al₂O₃.
  const oxygenMass = .031998 / AVOGADRO;
  const uptake = 4 / 3 * .015 * oxygenPressure / Math.sqrt(2 * Math.PI * oxygenMass * KB * 300);
  const removal = ionCurrent * oxideYield / (E * .0025);
  return uptake / (uptake + removal);
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
  let targetSupply, targetEnergy, targetIonOn, targetIonAverage;
  let cleanRate = 0;

  if (config.family === 'evaporation') {
    vapour = vapourPressure(material, settings.temperature);
    const atomicMass = material.mass * 1e-3 / AVOGADRO;
    const flux = vapour / Math.sqrt(2 * Math.PI * atomicMass * KB * settings.temperature);
    gross = thicknessRate(flux * config.area * geometry * transmission, material);
  } else if (config.family === 'sputtering') {
    const hasAlumina = hasAluminaRecipe(config, settings.symbol) && settings.oxygen > 0;
    const oxygenPa = 100 * 10 ** pressure * (settings.oxygen ?? 0) / 100;
    // Representative partial Al yield for a fully oxidised target.
    const oxideAlYield = .02;
    const coverage = hasAlumina ? (current) => aluminaCoverage(oxygenPa, current, oxideAlYield) : undefined;
    targetSupply = sputterDischarge(config, settings, coverage);
    targetEnergy = targetSupply?.ionEnergy ?? settings.energy;
    targetIonOn = targetSupply?.ionOn ?? settings.current;
    targetIonAverage = targetSupply?.ionAverage ?? targetIonOn * (config.duty ? settings.duty / 100 : 1);
    const ionCurrent = targetIonAverage;
    if (config.ito) {
      // Reference-scale thickness rate. The current and distance factors
      // normalise the schematic coater rather than specifying industrial power.
      const factor = (ionCurrent / (.35 * .70)) * (targetEnergy / 360) ** .65
        * (.085 / gap) ** 2 * transmission / (1 / (1 + .085 / (8 * meanFreePath(10 ** -2.65))));
      gross = (20 / 60) * factor;
      if (config.ito === 'alloy') {
        const uptake = oxygenPa / .013;
        poisoning = uptake / (uptake + ionCurrent / (.35 * .70));
        gross *= 1.65 * (1 - .55 * poisoning);
        film = oxygenPa === 0 ? MATERIALS.InSn : oxygenPa >= ITO_OXIDE_PA ? MATERIALS.ITO : MATERIALS.InSnOx;
      }
    } else if (material.yields) {
      yieldValue = sputterYield(material, targetEnergy);
    } else {
      gross = .10 * (ionCurrent / .25) * (targetEnergy / 350) ** .65 * (.085 / gap) ** 2 * transmission;
    }
    if (config.reactive) {
      const nitrogen = 10 ** pressure * 100 * settings.nitrogen / 100;
      const uptake = nitrogen / .20;
      poisoning = uptake > 0 ? uptake / (uptake + ionCurrent / .25) : 0;
      yieldValue *= 1 - .63 * poisoning;
      film = nitrogen >= TIN_NITROGEN_PA ? MATERIALS.TiN : material;
    }
    if (coverage) {
      poisoning = targetSupply?.coverage ?? coverage(ionCurrent);
      yieldValue = (1 - poisoning) * yieldValue + poisoning * Math.min(oxideAlYield, yieldValue);
      if (poisoning >= .6) film = MATERIALS.Al2O3;
    }
    if (material.yields) {
      const alAtomsPerUnit = film === MATERIALS.Al2O3 ? 2 : 1;
      gross = thicknessRate(ionCurrent / E * yieldValue / alAtomsPerUnit * geometry * transmission, film);
    }
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
    if (config.classic && settings.preclean) {
      gross = 0;
      // Illustrative surface residue index. This scale is not a measured
      // cleaning rate for an oxide, contaminant, or particular substrate.
      const effectiveness = Math.min(1, Math.max(0, (ionEnergy - 30) / 270));
      cleanRate = effectiveness * (ionFlux / 1e4) / 6e15;
    }
    ionDose = gross > 0 ? ionEnergy * ionFlux * volumePerParticle(film) * 1e9 / gross : 0;
  }

  const theta = material.melting && film === material ? substrate / material.melting : undefined;
  const localGross = POSITIONS.map((x) => {
    const cosine = 1 / Math.hypot(1, x / distance);
    const direct = cosine ** 4;
    const scattered = config.family === 'evaporation' ? direct : .88 + .12 * direct;
    return gross * (direct * ballistic + scattered * (1 - ballistic));
  });
  const arcing = targetIonOn === 0 ? null : sputterArcing(config, settings, poisoning, targetIonOn);
  return { gross, loss, net: gross - loss, localGross, vapour, yieldValue, ionEnergy, ionDose, poisoning, lambda, ballistic, film, theta, cleanRate,
    arcing, targetSupply, targetEnergy, targetIonOn, targetIonAverage };
}

export function residueAfter(fraction, sample, seconds, filmAtCentre = 0) {
  const delay = filmAtCentre > 0 ? filmAtCentre / sample.loss : 0;
  return fraction * Math.exp(-sample.cleanRate * Math.max(0, seconds - delay));
}

export function advanceFilm(thickness, sample, seconds) {
  return thickness.map((value, i) => Math.max(0, value + (sample.localGross[i] - sample.loss) * seconds));
}
