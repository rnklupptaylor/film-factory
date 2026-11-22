import { MATERIALS } from './physics.mjs';
import { DEFAULT_PULSE_KHZ } from './arcing.mjs';
import { hasDcSupply, supplyControl } from './discharge.mjs';

export const TECHNIQUES = {
  evaporation: {
    name: 'Evaporation', title: 'Thermal evaporation',
    summary: 'Heat the coating material. Vapour crosses the vacuum and condenses on the substrate.',
    options: ['boat', 'filament', 'ebeam', 'radiant'],
  },
  sputtering: {
    name: 'Sputtering', title: 'Sputter deposition',
    summary: 'Ar⁺ bombards a cathode target. Ejected atoms travel to the substrate and form a film.',
    options: ['diode', 'dc', 'pulsed', 'rf'],
  },
  plating: {
    name: 'Ion plating', title: 'Ion plating and ion assistance',
    summary: 'Bombard the substrate as the coating grows. Strong bombardment can also remove coating material.',
    options: ['classic', 'arc', 'ibad'],
  },
};

export const VARIANTS = {
  boat: { family: 'evaporation', name: 'Indirect resistance heating', hardware: 'Heated boat', materials: ['Ag','Al','Au','Cu','Cr'], area: .00006, maxC: 1500, defaults: { temperature: 1373, distance: 18 }, prompt: 'With Ag selected, vary the source temperature across its 1235 K melting point. Compare vapour pressure and deposition rate with solid and liquid silver.' },
  filament: { family: 'evaporation', name: 'Direct resistance heating', hardware: 'Directly heated Ti filament', materials: ['Ti'], area: .00012, maxC: 1660, defaults: { temperature: 1860, distance: 15 }, prompt: 'The current passes through Ti itself. Look for appreciable vapour pressure below its melting point.' },
  ebeam: { family: 'evaporation', name: 'Electron beam heating', hardware: 'E-beam hearth', materials: ['Ti','Cr','Au','Cu','Al','Ag'], area: .00024, maxC: 2050, defaults: { distance: 20 }, prompt: 'Switch between Cr and Au. Compare their vapour-pressure curves and the source phase at useful rates.' },
  radiant: { family: 'evaporation', name: 'Radiation heating', hardware: 'Radiant heater and crucible', materials: ['Ag','Al'], area: .00007, maxC: 1250, defaults: { distance: 16 }, prompt: 'Heat reaches the charge from a separate hot filament. Compare the rate at a common T with the boat.' },
  diode: { family: 'sputtering', name: 'DC diode', hardware: 'DC diode cathode', materials: ['Cu','Ag','Al','Ti','Cr','Au'], diode: true, defaults: { pressure: -1.55, energy: 300, current: .06 }, prompt: 'Use Cu and 120 W near 2.8 × 10⁻² mbar. Add the preview to the Stocker, then use the same power, pressure and gap in DC magnetron. Compare target voltage, ion current and centre deposition per joule.' },
  dc: { family: 'sputtering', name: 'DC magnetron', hardware: 'DC magnetron cathode', materials: ['Cu','Ag','Al','Ti','Cr','Au'], magnetron: true, arcing: true, defaults: { energy: 350, current: .35 }, prompt: 'Compare the focused discharge with the DC diode at equal power, pressure and gap. Select Al for an optional oxygen feed or Ti for an optional nitrogen feed. At 0% the chamber runs in argon.' },
  pulsed: { family: 'sputtering', name: 'Pulsed DC magnetron', hardware: 'Pulsed DC cathode', materials: ['Al','Ti','Cu','Cr','Ag','Au','ITO','InSn'], magnetron: true, arcing: true, duty: true, defaults: { energy: 450, current: .42, duty: 70, frequency: DEFAULT_PULSE_KHZ }, prompt: 'Select Al, Ti, ITO or In–Sn to explore an optional reactive gas feed. At 0% the chamber runs in argon.' },
  rf: { family: 'sputtering', name: 'RF', hardware: 'RF magnetron · 13.56 MHz', materials: ['SiO2','Al','Ti','Cu'], magnetron: true, defaults: { energy: 350, current: .25 }, prompt: 'Select fused silica. RF coupling sustains sputtering of an insulating target. Compare its effective rate with that of a metal.' },
  classic: { family: 'plating', name: 'Classic ion plating', hardware: 'Evaporation source', materials: ['Ag','Cu','Al','Ti'], classic: true, defaults: { pressure: -1.45, bias: 1600, ionCurrent: .08, arrival: 2.8, preclean: false }, prompt: 'Select Pre-clean and run with the evaporation source off. Watch Ar⁺ bombard the negatively biased substrate. Switch to Deposit and compare the growth and residue plots.' },
  arc: { family: 'plating', name: 'Cathodic arc ion plating · TiN', hardware: 'Ti cathodic arc in N₂', materials: ['Ti'], arc: true, wafer: 'steel', defaults: { pressure: -2.35, bias: 100, ionCurrent: .65, arrival: 5.5, substrate: 670 }, prompt: 'Ti leaves the moving cathode spot as vapour and ions. The negative substrate bias attracts the ions. A continuous N₂ feed supplies nitrogen for the TiN layer. Increase bias and compare ion energy with net growth.' },
  ibad: { family: 'plating', name: 'Ion beam assisted deposition', hardware: 'Evaporation source + Ar⁺ gun', materials: ['Ag','Cu','Al','Ti'], ibad: true, defaults: { pressure: -4.7, bias: 150, ionCurrent: .25, arrival: .9 }, prompt: 'Sweep beam energy at fixed beam current. Compare the independent ion gun with the plasma sheath of classic ion plating.' },
};

const BASE_SETTINGS = {
  evaporation: { pressure: -5.9, distance: 18, substrate: 310 },
  sputtering: { pressure: -2.55, distance: 8.5, substrate: 350, nitrogen: 0, oxygen: 0 },
  plating: { distance: 14, substrate: 410 },
};

const sputterTargetRecipes = {
  Ti: { reactive: true, prompt: 'At about 4 × 10⁻² mbar total pressure, sweep N₂ from 0% to 8%. Watch the nominal film change from Ti to TiN and the effective target yield fall.' },
  ITO: { ito: 'ceramic', prompt: 'A conductive ITO ceramic target deposits ITO in pure argon. Small additions of O₂ can tune film properties. Compare with the In–Sn alloy target, where oxygen supplies the oxide.' },
  InSn: { ito: 'alloy', prompt: 'At about 2.2 × 10⁻³ mbar, compare 0% O₂ with 16% O₂. The nominal film changes from metallic In–Sn to ITO as the target oxidises.' },
};

export function processConfig(id, symbol) {
  const config = VARIANTS[id];
  if (!config.arcing) return config;
  if (symbol === 'Al') {
    const pulseComparison = config.duty ? ' At 40 kHz, compare 100% with 90% duty at 120 W average power. Then select Ion settings to repeat at fixed ion on-current.' : '';
    return { ...config, prompt: `Set the pressure to 4 × 10⁻³ mbar and increase O₂ from 0% to 25% to see how target oxide affects arcing.${pulseComparison}` };
  }
  const recipe = sputterTargetRecipes[symbol];
  return recipe ? { ...config, ...recipe } : config;
}

export function newSettings(id, symbol = VARIANTS[id].materials[0]) {
  const config = VARIANTS[id];
  const material = MATERIALS[symbol];
  const temperature = config.family === 'evaporation'
    ? { temperature: Math.min(config.maxC + 273, Math.round(material.vapour[3] + 240)) } : {};
  return { ...BASE_SETTINGS[config.family], ...temperature, ...config.defaults, symbol, wafer: config.wafer ?? 'silicon' };
}

export function controlGroups(config, material, settings) {
  const pressureLimits = config.family === 'evaporation' ? [-7,-4] : config.diode ? [-1.7,-1.4]
    : config.ibad ? [-6,-3.3] : config.arc ? [-3.7,-2] : [-3,-1];
  const pressure = ['pressure', 'Chamber pressure', 'p', ...pressureLimits, .05, 'mbar'];
  const distance = ['distance', 'Source–substrate distance', 'L', 5, 35, .5, 'cm'];
  const substrate = ['substrate', 'Substrate temperature', 'Tₛ', 290, 880, 5, 'K'];
  if (config.family === 'evaporation') {
    const temperature = ['temperature', 'Source temperature', 'T', Math.ceil(material.vapour[0] + 273), Math.floor(Math.min(config.maxC, material.vapour[3]) + 273), 1, 'K'];
    return [[temperature], [pressure, distance, substrate]];
  }
  if (config.family === 'sputtering') {
    const energy = ['energy', config.diode ? 'Effective target ion energy' : config.arcing ? 'Ion energy' : 'Target ion energy', 'Eᵢ', 100, 600, 5, 'eV'];
    const current = ['current', config.duty ? 'Ion on-current' : 'Target ion current', 'Iᵢ', config.diode ? .01 : .05, config.diode ? .10 : 1, .01, 'A'];
    const mode = settings?.supplyMode ?? 'ions';
    const source = hasDcSupply(config) && mode !== 'ions' ? [supplyControl(config, mode)] : [energy, current];
    const controls = [source, [pressure, distance, substrate]];
    if (config.duty) controls[0].push(['duty', 'Duty cycle', 'D', 20, 100, 1, '%']);
    if (config.duty) controls[0].push(['frequency', 'Frequency', 'f', 10, 100, 5, 'kHz']);
    if (config.reactive) controls[1].push(['nitrogen', 'Nitrogen fraction', 'N₂', 0, 25, .5, '%']);
    if (config.ito || (config.arcing && material === MATERIALS.Al)) controls[1].push(['oxygen', 'Oxygen fraction', 'O₂', 0, config.ito === 'ceramic' ? 5 : 25, .5, '%']);
    return controls;
  }
  const bias = config.ibad ? ['bias', 'Ion beam energy', 'Eᵢ', 20, 600, 5, 'eV']
    : ['bias', 'Substrate bias', 'Vₛ', 0, config.classic ? 3500 : 300, config.classic ? 25 : 5, 'V'];
  const ionCurrent = ['ionCurrent', 'Ion current density', 'jᵢ', 0, config.arc ? 2 : 1, .01, 'mA/cm²'];
  return [[['arrival', 'Incoming rate at 14 cm', 'R₀', .1, 12, .1, 'nm/s'], bias, ionCurrent], [pressure, distance, substrate]];
}

export const RUN_LENGTH = 60;

export function sourceChart(config, settings, material) {
  if (config.family === 'evaporation') {
    return { title: 'Vapour pressure', x: 'Source temperature T (K)', y: 'pᵥ (mbar)', control: 'temperature', log: true };
  }
  if (config.family === 'sputtering') {
    if (hasDcSupply(config) && settings.supplyMode && settings.supplyMode !== 'ions') {
      const [control, label, , , , , unit] = supplyControl(config, settings.supplyMode);
      return { title: 'Deposition rate', x: `${label} (${unit})`, y: 'R (nm/s)', control };
    }
    if (config.ito) return { title: 'Deposition rate', x: 'Oxygen fraction O₂ (%)', y: 'R (nm/s)', control: 'oxygen' };
    return { title: material.yields ? 'Sputtering yield' : 'RF deposition rate', x: 'Target ion energy Eᵢ (eV)', y: material.yields ? 'Y (atoms/ion)' : 'R (nm/s)', control: 'energy' };
  }
  if (config.classic && settings.preclean) {
    return { title: 'Pre-cleaning at current settings', x: 'Bias magnitude |Vₛ| (V)', y: 'Residue cleared (%)', control: 'bias' };
  }
  return { title: 'Deposition and resputtering', x: config.ibad ? 'Ion beam energy (eV)' : 'Bias magnitude |Vₛ| (V)', y: 'Rate (nm/s)', control: 'bias' };
}
