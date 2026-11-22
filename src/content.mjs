import { MATERIALS } from './physics.mjs';

export const TECHNIQUES = {
  evaporation: {
    name: 'Evaporation', title: 'Thermal evaporation',
    summary: 'Heat the coating material. Vapour crosses the vacuum and condenses on the substrate.',
    options: ['boat', 'filament', 'ebeam', 'radiant'],
  },
  sputtering: {
    name: 'Sputtering', title: 'Sputter deposition',
    summary: 'Ar⁺ bombards a cathode target. Ejected atoms travel to the substrate and form a film.',
    options: ['diode', 'dc', 'pulsed', 'rf', 'reactive', 'itoCeramic', 'itoReactive'],
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
  diode: { family: 'sputtering', name: 'DC diode · conventional', hardware: 'DC diode cathode', materials: ['Cu','Ag','Al','Ti','Cr','Au'], diode: true, defaults: { pressure: -1.55, energy: 300, current: .06 }, prompt: 'Run the conventional DC diode, then select DC magnetron. Compare the spread of Ar⁺ impacts, working pressure and arrival of sputtered atoms.' },
  dc: { family: 'sputtering', name: 'DC magnetron', hardware: 'DC magnetron cathode', materials: ['Cu','Ag','Al','Ti','Cr','Au'], magnetron: true, defaults: { energy: 350, current: .35 }, prompt: 'Trace B from the centre N pole to the outer S poles. Compare the focussed discharge and target impacts with the conventional DC diode.' },
  pulsed: { family: 'sputtering', name: 'Pulsed DC magnetron', hardware: 'Pulsed DC cathode', materials: ['Al','Ti','Cu','Cr','Ag','Au'], magnetron: true, duty: true, defaults: { energy: 450, current: .42, duty: 70 }, prompt: 'Change the duty cycle while holding the on-current fixed. During the off interval, surface charge can clear.' },
  rf: { family: 'sputtering', name: 'RF magnetron · 13.56 MHz', hardware: 'RF cathode with DC self-bias', materials: ['SiO2','Al','Ti','Cu'], magnetron: true, defaults: { energy: 350, current: .25 }, prompt: 'Select fused silica. RF coupling sustains sputtering of an insulating target. Compare its effective rate with that of a metal.' },
  reactive: { family: 'sputtering', name: 'Reactive magnetron · Ti + N₂', hardware: 'Reactive Ti cathode', materials: ['Ti'], magnetron: true, reactive: true, defaults: { pressure: -1.4, energy: 450, current: .60, nitrogen: 6, substrate: 520 }, prompt: 'Sweep the N₂ fraction across 5–8% at about 4 Pa total pressure. Watch the target coverage rise and the effective yield fall.' },
  itoCeramic: { family: 'sputtering', name: 'Pulsed DC · ITO ceramic', hardware: 'Conductive ITO oxide target', materials: ['ITO'], magnetron: true, duty: true, ito: 'ceramic', wafer: 'borofloat', defaults: { pressure: -2.65, energy: 360, current: .35, oxygen: 1.5, substrate: 300 }, prompt: 'Sputter a conductive 90:10 by mass In₂O₃/SnO₂ ceramic target. Small additions of O₂ can tune film properties. Compare with the reactive alloy route, where oxygen supplies the oxide.' },
  itoReactive: { family: 'sputtering', name: 'Reactive pulsed DC · ITO', hardware: 'In–Sn alloy target in Ar + O₂', materials: ['InSn'], magnetron: true, duty: true, ito: 'alloy', wafer: 'borofloat', defaults: { pressure: -2.65, energy: 360, current: .35, oxygen: 16, substrate: 300 }, prompt: 'Reduce O₂ to zero to sputter metallic In–Sn. Increase it to grow nominal ITO and see the modelled rate fall as the cathode oxidises. The transition depends on the coater.' },
  classic: { family: 'plating', name: 'Classic ion plating', hardware: 'Evaporation source', materials: ['Ag','Cu','Al','Ti'], classic: true, defaults: { pressure: -1.45, bias: 1600, ionCurrent: .08, arrival: 2.8, preclean: false }, prompt: 'Select Pre-clean and run with the evaporation source off. Watch Ar⁺ bombard the negatively biased substrate. Switch to Deposit and compare the growth and residue plots.' },
  arc: { family: 'plating', name: 'Cathodic arc ion plating · TiN', hardware: 'Ti cathodic arc in N₂', materials: ['Ti'], arc: true, wafer: 'steel', defaults: { pressure: -2.35, bias: 100, ionCurrent: .65, arrival: 5.5, substrate: 670 }, prompt: 'Ti leaves the moving cathode spot as vapour and ions. The negative substrate bias attracts the ions. A continuous N₂ feed supplies nitrogen for the TiN layer. Increase bias and compare ion energy with net growth.' },
  ibad: { family: 'plating', name: 'Ion beam assisted deposition', hardware: 'Evaporation source + Ar⁺ gun', materials: ['Ag','Cu','Al','Ti'], ibad: true, defaults: { pressure: -4.7, bias: 150, ionCurrent: .25, arrival: .9 }, prompt: 'Sweep beam energy at fixed beam current. Compare the independent ion gun with the plasma sheath of classic ion plating.' },
};

const BASE_SETTINGS = {
  evaporation: { pressure: -5.9, distance: 18, substrate: 310 },
  sputtering: { pressure: -2.55, distance: 8.5, substrate: 350, duty: 70, nitrogen: 6 },
  plating: { distance: 14, substrate: 410 },
};

export function newSettings(id, symbol = VARIANTS[id].materials[0]) {
  const config = VARIANTS[id];
  const material = MATERIALS[symbol];
  const temperature = material.vapour ? Math.min(config.maxC + 273, Math.round(material.vapour[3] + 240)) : undefined;
  return { ...BASE_SETTINGS[config.family], temperature, ...config.defaults, symbol, wafer: config.wafer ?? 'silicon' };
}

export function controlGroups(config, material) {
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
    const energy = ['energy', config.diode ? 'Effective target ion energy' : 'Target ion energy', 'Eᵢ', 100, 600, 5, 'eV'];
    const current = ['current', config.duty ? 'Target on-current' : 'Target ion current', 'Iᵢ', config.diode ? .01 : .05, config.diode ? .10 : 1, .01, 'A'];
    const controls = [[energy, current], [pressure, distance, substrate]];
    if (config.duty) controls[0].push(['duty', 'Duty cycle', 'D', 20, 100, 1, '%']);
    if (config.reactive) controls[1].push(['nitrogen', 'Nitrogen fraction', 'N₂', 0, 25, .5, '%']);
    if (config.ito) controls[1].push(['oxygen', 'Oxygen fraction', 'O₂', 0, config.ito === 'ceramic' ? 5 : 25, .5, '%']);
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
    if (config.ito) return { title: 'Deposition rate', x: 'Oxygen fraction O₂ (%)', y: 'R (nm/s)', control: 'oxygen' };
    return { title: material.yields ? 'Sputtering yield' : 'RF deposition rate', x: 'Target ion energy Eᵢ (eV)', y: material.yields ? 'Y (atoms/ion)' : 'R (nm/s)', control: 'energy' };
  }
  if (config.classic && settings.preclean) {
    return { title: 'Pre-cleaning at current settings', x: 'Bias magnitude |Vₛ| (V)', y: 'Residue cleared (%)', control: 'bias' };
  }
  return { title: 'Deposition and resputtering', x: config.ibad ? 'Ion beam energy (eV)' : 'Bias magnitude |Vₛ| (V)', y: 'Rate (nm/s)', control: 'bias' };
}
