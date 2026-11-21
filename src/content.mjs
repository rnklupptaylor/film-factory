import { MATERIALS } from './physics.mjs';

export const TECHNIQUES = {
  evaporation: {
    name: 'Evaporation', question: 'How hot is hot enough?',
    summary: 'Heat the coating material. Vapour crosses the vacuum and condenses on the substrate.',
    options: ['boat', 'filament', 'ebeam', 'radiant'],
  },
  sputtering: {
    name: 'Sputtering', question: 'What knocks an atom loose?',
    summary: 'Ar⁺ bombards a cathode target. Ejected atoms travel to the substrate and form a film.',
    options: ['dc', 'pulsed', 'rf', 'reactive'],
  },
  plating: {
    name: 'Ion plating', question: 'When do ions help a film grow?',
    summary: 'Bombard the substrate as the coating grows. Strong bombardment can also remove coating material.',
    options: ['classic', 'arc', 'ibad'],
  },
};

export const VARIANTS = {
  boat: { family: 'evaporation', name: 'Indirect resistance heating', hardware: 'Heated boat', materials: ['Ag','Al','Au','Cu','Cr'], area: .00006, maxC: 1500, defaults: { temperature: 1373, distance: 18 }, prompt: 'With Ag selected, raise T through 1235 K. Can you get measurable growth while the source is still solid?' },
  filament: { family: 'evaporation', name: 'Direct resistance heating', hardware: 'Directly heated Ti filament', materials: ['Ti'], area: .00012, maxC: 1660, defaults: { temperature: 1860, distance: 15 }, prompt: 'The current passes through Ti itself. Look for appreciable vapour pressure below its melting point.' },
  ebeam: { family: 'evaporation', name: 'Electron beam heating', hardware: 'E-beam hearth', materials: ['Ti','Cr','Au','Cu','Al','Ag'], area: .00024, maxC: 2050, defaults: { distance: 20 }, prompt: 'Switch between Cr and Au. Compare their vapour-pressure curves and the source phase at useful rates.' },
  radiant: { family: 'evaporation', name: 'Radiation heating', hardware: 'Radiant heater and crucible', materials: ['Ag','Al'], area: .00007, maxC: 1250, defaults: { distance: 16 }, prompt: 'Heat reaches the charge from a separate hot filament. Compare the rate at a common T with the boat.' },
  dc: { family: 'sputtering', name: 'DC magnetron', hardware: 'DC magnetron cathode', materials: ['Cu','Ag','Al','Ti','Cr','Au'], defaults: { energy: 350, current: .35 }, prompt: 'Double the working pressure at fixed target current and energy. How do λ, rate and thickness profile respond?' },
  pulsed: { family: 'sputtering', name: 'Pulsed DC magnetron', hardware: 'Pulsed DC cathode', materials: ['Al','Ti','Cu','Cr','Ag','Au'], duty: true, defaults: { energy: 450, current: .42, duty: 70 }, prompt: 'Change the duty cycle while holding the on-current fixed. During the off interval, surface charge can clear.' },
  rf: { family: 'sputtering', name: 'RF magnetron · 13.56 MHz', hardware: 'RF cathode with DC self-bias', materials: ['SiO2','Al','Ti','Cu'], defaults: { energy: 350, current: .25 }, prompt: 'Select fused silica. RF coupling sustains sputtering of an insulating target. Compare its effective rate with that of a metal.' },
  reactive: { family: 'sputtering', name: 'Reactive magnetron · Ti + N₂', hardware: 'Reactive Ti cathode', materials: ['Ti'], reactive: true, defaults: { pressure: -1.4, energy: 450, current: .60, nitrogen: 6, substrate: 520 }, prompt: 'Sweep the N₂ fraction across 5–8% at about 4 Pa total pressure. Watch the target coverage rise and the effective yield fall.' },
  classic: { family: 'plating', name: 'Classic ion plating', hardware: 'Evaporation source', materials: ['Ag','Cu','Al','Ti'], classic: true, defaults: { pressure: -1.45, bias: 1600, ionCurrent: .14, arrival: 1.8 }, prompt: 'Raise ion current until resputtering overtakes incoming deposition. What happens to the film you already grew?' },
  arc: { family: 'plating', name: 'Arc ion plating · TiN', hardware: 'Ti cathodic arc in N₂', materials: ['Ti'], arc: true, defaults: { pressure: -2.35, bias: 100, ionCurrent: .65, arrival: 5.5, substrate: 520 }, prompt: 'Increase the negative bias and compare ion energy with net growth. The nitrogen-containing arc preset assumes a TiN film.' },
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
  return { ...BASE_SETTINGS[config.family], temperature, ...config.defaults, symbol };
}

export function controlGroups(config, material) {
  const pressureLimits = config.family === 'evaporation' ? [-7,-4]
    : config.ibad ? [-6,-3.3] : config.arc ? [-3.7,-2] : [-3,-1];
  const pressure = ['pressure', 'Chamber pressure', 'p', ...pressureLimits, .05, 'mbar'];
  const distance = ['distance', 'Source distance', 'L', 5, 35, .5, 'cm'];
  const substrate = ['substrate', 'Substrate temperature', 'Tₛ', 290, 880, 5, 'K'];
  if (config.family === 'evaporation') {
    const temperature = ['temperature', 'Source temperature', 'T', Math.ceil(material.vapour[0] + 273), Math.floor(Math.min(config.maxC, material.vapour[3]) + 273), 1, 'K'];
    return [[temperature, pressure], [distance, substrate]];
  }
  if (config.family === 'sputtering') {
    const energy = ['energy', 'Target ion energy', 'Eᵢ', 100, 600, 5, 'eV'];
    const current = ['current', config.duty ? 'Target on-current' : 'Target ion current', 'Iᵢ', .05, 1, .01, 'A'];
    const controls = [[energy, current], [pressure, distance, substrate]];
    if (config.duty) controls.push([['duty', 'Duty cycle', 'D', 20, 100, 1, '%']]);
    if (config.reactive) controls.push([['nitrogen', 'Nitrogen fraction', 'N₂', 0, 25, .5, '%']]);
    return controls;
  }
  const bias = config.ibad ? ['bias', 'Ion beam energy', 'Eᵢ', 20, 600, 5, 'eV']
    : ['bias', 'Negative substrate bias', '−Vₛ', 0, config.classic ? 3500 : 300, config.classic ? 25 : 5, 'V'];
  const ionCurrent = ['ionCurrent', 'Substrate ion current density', 'jᵢ', 0, config.arc ? 2 : 1, .01, 'mA/cm²'];
  return [[bias, ionCurrent], [['arrival', 'Incoming rate at reference gap', 'R₀', .1, 12, .1, 'nm/s'], pressure], [distance, substrate]];
}

export const RUN_LENGTH = 60;

export function sourceChart(config, settings, material) {
  if (config.family === 'evaporation') {
    return { title: 'Vapour pressure', x: 'Source temperature T (K)', y: 'pᵥ (mbar)', control: 'temperature', log: true };
  }
  if (config.family === 'sputtering') {
    return { title: material.yields ? 'Sputtering yield' : 'RF deposition rate', x: 'Target ion energy Eᵢ (eV)', y: material.yields ? 'Y (atoms/ion)' : 'R (nm/s)', control: 'energy' };
  }
  return { title: 'Deposition and resputtering', x: config.ibad ? 'Ion beam energy (eV)' : 'Bias magnitude |Vₛ| (V)', y: 'Rate (nm/s)', control: 'bias' };
}

export const THEORY = [
  { title: 'The three PVD routes', text: 'Start in the Chamber, choose a source and drag a setting. Run integrates the coating for 60 simulated seconds. The Growth plot records earlier settings and previews the remaining run at the current settings. Reset clears the film and keeps the settings.', label: 'Lecture terminology', note: 'Thin Film Processing, Prof. Robin N. Klupp Taylor, WS 2025–26, PVD I slides 13–30 and PVD II slides 36–44.' },
  { title: 'Transport through the chamber', text: 'The 300 K argon hard-sphere mean free path is λ = kᵦT/(√2 πd²p), with d = 0.34 nm. L is the source–substrate gap. The line-of-sight fraction is exp(−L/λ). Scattered collection uses 1/(1 + L/(8λ)), an illustrative transmission factor. The gap and wafer size set the geometric profile.', label: 'André Anders · plasma-assisted PVD foundations', href: 'https://doi.org/10.1088/1361-6595/AC7F53' },
  { title: 'Evaporation and vapour pressure', text: 'The Hertz–Knudsen source flux is pᵥ/√(2πmkᵦT). The model uses unit evaporation and sticking coefficients, a cosine emitter and effective source areas of 0.6–2.4 cm². It interpolates log₁₀ pᵥ against 1/T between tabulated points. The phase indicator uses the bulk melting point.', label: 'MBE-Komponenten · vapour-pressure anchors', href: 'https://www.mbe-komponenten.de/selection-guide/vapor-pressure/' },
  { title: 'A real silver evaporation', text: 'Kurt J. Lesker reports 0.1–0.5 nm/s at about 1373 K and a base pressure at or below 10⁻⁶ Torr. The Ag boat effective source area was chosen to give about 0.37 nm/s under comparable conditions. Actual rate depends strongly on geometry, source loading and tooling factor.', label: 'Kurt J. Lesker · silver evaporation', href: 'https://www.lesker.com/newweb/deposition_materials/deposition-materials-notes.cfm?pgid=ag1' },
  { title: 'Sputtering yield and current', text: 'Y is the number of target atoms ejected per incident Ar⁺. Piecewise linear curves use tabulated near-threshold and 100–600 eV metal yields. Ejection is IᵢY/e. RF uses effective ion energy/current. Silica uses an illustrative effective rate law, since compound sputtering needs a separate yield treatment.', label: 'Yamamura and Tawara · yield and energy reference', href: 'https://nifs-repository.repo.nii.ac.jp/record/2000175/files/NIFS-DATA-023.pdf', extra: [['Low-energy yield table', 'https://www.mse.nchu.edu.tw/uploads/bulletin_file/file/5f3615791d41c80133000036/2363_627c1fc0.pdf'], ['600 eV data', 'https://angstromsciences.com/sputtering-yields']] },
  { title: 'Reactive sputtering and TiN', text: 'A Ti target in Ar and N₂ can develop a compound-covered surface. The model balances nitrogen uptake against removal by ion current and assigns the compound-covered area 37% of the metal yield. It switches the nominal film to TiN above 0.15 Pa N₂. Composition, preferential sputtering and hysteresis require a calibrated reactor model.', label: 'Wa̧sniowski et al. · Ti poisoning in Ar/N₂', href: 'https://doi.org/10.1016/j.surfcoat.2006.08.111' },
  { title: 'Ion plating and ion assistance', text: 'The incident film rate is set independently at a 14 cm reference gap before gas attenuation. Classic plating uses a collisional 6 mm sheath estimate. Arc uses an effective charge of 1.5 and 20 eV initial energy. The model applies Ar⁺ metal yields as erosion proxies, including 45% of the Ti yield for TiN. Rₙₑₜ = Rᵢₙ − Rₗₒₛₛ.', label: 'Mattox · ion plating', href: 'https://doi.org/10.1016/S0257-8972(00)00922-1', extra: [['Ti arc data', 'https://www.sciencedirect.com/science/article/pii/0042207X94902615']] },
  { title: 'Reading the film', text: 'The profile is accumulated at 41 points across a 100 mm wafer. Thickness is dense-bulk equivalent. The cross-section shows current growth conditions schematically, with approximate zone boundaries using Tₛ/Tₘ and pressure for metals. Ion-assisted morphology uses indicative energy per arriving film unit. It does not predict adhesion, grain size or stress.', label: 'Thornton · sputter structure zones', href: 'https://doi.org/10.1116/1.1312732', extra: [['Anders · energetic deposition', 'https://doi.org/10.1016/j.tsf.2009.10.145'], ['RSC · bulk element data', 'https://periodic-table.rsc.org/']] },
];
