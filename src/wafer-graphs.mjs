import { MATERIALS, rates } from './physics.mjs';
import { hasAluminaRecipe } from './arcing.mjs';
import { VARIANTS } from './content.mjs';
import { crystalFrequencyShift } from './instruments.mjs';
import { waferCentre } from './wafer-data.mjs';

export const waferGraphGroups = [
  ['Process settings', {
    duration: { label: 'Stage duration (s)', value: ({ wafer }) => wafer.duration },
    substrate: { label: 'Substrate temperature (K)', value: ({ settings }) => settings.substrate },
    pressure: { label: 'Working pressure (mbar)', log: true, value: ({ settings }) => 10 ** settings.pressure },
    distance: { label: 'Source–substrate distance (cm)', value: ({ settings }) => settings.distance },
    temperature: { label: 'Source temperature (K)', value: ({ config, settings }) => config.family === 'evaporation' ? settings.temperature : null },
    energy: { label: 'Target ion energy (eV)', value: ({ config, settings }) => config.family === 'sputtering' ? settings.energy : null },
    current: { label: 'Effective target ion current (A)', value: ({ config, settings }) => config.family === 'sputtering'
      ? settings.current * (config.duty ? settings.duty / 100 : 1) : null },
    duty: { label: 'Duty cycle (%)', value: ({ config, settings }) => config.duty ? settings.duty : null },
    frequency: { label: 'Pulse frequency (kHz)', value: ({ config, settings }) => config.arcing && config.duty ? settings.frequency : null },
    nitrogen: { label: 'Nitrogen fraction (%)', value: ({ config, settings }) => config.arc ? 100 : config.reactive ? settings.nitrogen : null },
    oxygen: { label: 'Oxygen fraction (%)', value: ({ config, settings }) => config.ito || hasAluminaRecipe(config, settings.symbol) ? settings.oxygen : null },
    bias: { label: 'Substrate bias (V)', value: ({ config, settings }) => config.arc || config.classic ? -settings.bias : null },
    ionEnergy: { label: 'Effective substrate ion energy (eV)', value: ({ sample }) => sample.ionEnergy },
    ionCurrent: { label: 'Substrate ion current density (mA/cm²)', value: ({ config, settings }) => config.family === 'plating' ? settings.ionCurrent : null },
  }],
  ['Film and deposition', {
    centre: { label: 'Centre thickness (nm)', value: ({ centre }) => centre },
    edge: { label: 'Edge thickness (nm)', value: ({ wafer }) => wafer.profile[0] },
    uniformity: { label: 'Edge / centre thickness (%)', value: ({ wafer, centre }) => centre > 0 ? 100 * wafer.profile[0] / centre : null },
    averageRate: { label: 'Average net stage rate (nm/s)', value: ({ wafer, centre }) => (centre - wafer.growth[0][1]) / wafer.duration },
    netRate: { label: 'Final net rate (nm/s)', value: ({ sample }) => sample.net },
    incoming: { label: 'Final incoming rate (nm/s)', value: ({ sample }) => sample.gross },
    resputter: { label: 'Final resputter rate (nm/s)', value: ({ config, sample }) => config.family === 'plating' ? sample.loss : null },
    yield: { label: 'Effective sputtering yield (atoms/ion)', value: ({ sample }) => sample.yieldValue },
    residue: { label: 'Surface residue remaining (%)', value: ({ wafer }) => wafer.recipes.some((step) => step.settings.preclean === true)
      ? wafer.residue.at(-1)[1] : null },
  }],
  ['Sensors', {
    qcmShift: { label: 'QCM frequency shift (Hz)', value: ({ wafer }) => crystalFrequencyShift(wafer.qcm.mass) },
    qcmMass: { label: 'QCM areal mass (µg/cm²)', value: ({ wafer }) => wafer.qcm.mass * 1e5 },
    qcmThickness: { label: 'QCM indicated thickness (nm)', value: ({ wafer }) => wafer.qcm.height * wafer.qcm.tooling / 100 },
  }],
  ['Morphology', {
    roughness: { label: 'Modelled RMS roughness (nm)', surface: true, value: ({ surface }) => surface?.count ? surface.roughnessNm : null },
    coverage: { label: 'Modelled area covered (%)', surface: true, value: ({ surface }) => surface ? surface.coverage * 100 : null },
    porosity: { label: 'Voids in film envelope (%)', surface: true, value: ({ surface }) => surface?.count ? surface.voidFraction * 100 : null },
    grainCount: { label: 'Exposed crystalline grains', surface: true, value: ({ surface }) => surface?.grainCount || null },
    grainDiameter: { label: 'Median exposed grain diameter (cells)', surface: true, value: ({ surface }) => surface?.grainCount ? surface.medianDiameter : null },
  }],
];

export const waferGraphAxes = Object.assign({}, ...waferGraphGroups.map(([, axes]) => axes));

export function waferGraphRows(wafers, xKey, yKey, surfaces = []) {
  const x = waferGraphAxes[xKey];
  const y = waferGraphAxes[yKey];
  const value = (axis, data) => {
    const result = axis.value(data);
    return Number.isFinite(result) && (!axis.log || result > 0) ? result : null;
  };
  return wafers.map((wafer, index) => {
    const settings = wafer.settings;
    const config = VARIANTS[wafer.variant];
    let sample;
    const data = {
      wafer, config, settings, surface: surfaces[index], centre: waferCentre(wafer.profile),
      get sample() { return sample ??= rates(config, settings, MATERIALS[settings.symbol]); },
    };
    return { wafer, x: value(x, data), y: value(y, data) };
  });
}

export function waferGraphDomain(values, log = false) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (log) {
    const lower = Math.floor(Math.log10(min));
    const upper = Math.ceil(Math.log10(max));
    return lower === upper ? [lower - .5, upper + .5] : [lower, upper];
  }
  const padding = max === min ? (Math.abs(min) * .1 || 1) : Math.max((max - min) * .1, Math.max(Math.abs(min), Math.abs(max)) * .001);
  return [min >= 0 ? Math.max(0, min - padding) : min - padding, max <= 0 && min !== 0 ? Math.min(0, max + padding) : max + padding];
}
