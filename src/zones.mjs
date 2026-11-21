import { ITO_OXIDE_PA, TIN_NITROGEN_PA } from './physics.mjs';
import { processGas, substrateStatus } from './instruments.mjs';

const MOVCHAN = ['Movchan–Demchishin', 'https://jglobal.jst.go.jp/en/detail?JGLOBAL_ID=200902029851583157'];
const THORNTON = ['Thornton (1974)', 'https://doi.org/10.1116/1.1312732'];
const ANDERS = ['Anders (2010)', 'https://doi.org/10.1016/j.tsf.2009.10.145'];
const PETROV = ['Petrov et al.', 'https://doi.org/10.1116/1.1601610'];
const TIN_REFERENCE = ['NIST TiN data', 'https://janaf.nist.gov/tables/N-014.html'];
const TIN_MELTING_K = 3220;
const ZONE_ARGON_MASS = 39.95;
const COHESIVE_EV = { Silver: 2.95, Copper: 3.49, Aluminium: 3.39, Titanium: 4.85 };
const ZONE_NAMES = { one: 'Zone I', transition: 'Zone T', two: 'Zone II', three: 'Zone III' };
const ZONE_TEXTURE = {
  one: 'Open, tapered columns',
  transition: 'Dense fibrous transition',
  two: 'Columnar grains',
  three: 'Recrystallised, more equiaxed grains',
};

function axis(label, ticks, scale = (value) => value) {
  return { label, ticks, scale };
}

const THETA = axis('Tₛ / Tₘ', [0,.2,.4,.6,.8,1]);
const TEMPERATURE = axis('Tₛ (K)', [250,400,550,700,850,900]);
const ARGON_PRESSURE = axis('Ar pressure (Pa)', [.075,.13,.3,.6,1,2,4,10], Math.log10);

function thermalZones(theta) {
  const morph = theta < .25 ? ZONE_TEXTURE.one
    : theta <= .35 ? 'Zones I–II · transition band'
    : theta < .45 ? ZONE_TEXTURE.two
    : theta <= .55 ? 'Zones II–III · transition band' : ZONE_TEXTURE.three;
  return {
    name: 'Movchan–Demchishin',
    kind: 'thermal',
    x: THETA,
    point: [theta],
    operating: `Tₛ/Tₘ = ${theta.toFixed(3)}`,
    reading: theta < .25 ? `Zone I · ${morph}` : theta > .35 && theta < .45 ? `Zone II · ${morph}`
      : theta > .55 ? `Zone III · ${morph}` : morph,
    detail: 'Thermal evaporation trend from thick deposits. The bands around 0.3 and 0.5 mark approximate transitions.',
    links: [MOVCHAN],
  };
}

// An original teaching projection of Thornton's pressure trend. The bands
// preserve the widening of porous Zone 1 as pressure rises. They are not fits
// to this application's planar coaters.
function thorntonBoundaries(pressure) {
  const t = Math.max(0, Math.min(1, (pressure - .13) / (4 - .13)));
  return [.075 + .27*t, .38 + .13*t, .66 + .10*t];
}

function thorntonZones(config, theta, pressure) {
  const cuts = thorntonBoundaries(pressure);
  const zones = ['one','transition','two','three'];
  const index = cuts.findIndex((limit) => theta < limit);
  const selected = zones[index === -1 ? 3 : index];
  const near = cuts.findIndex((limit) => Math.abs(theta - limit) < .024);
  const covered = pressure >= .13 && pressure <= 4;
  const comparison = config.diode ? 'Analogy for conventional DC diode'
    : config.reactive ? 'Analogy for the nominal Ti branch'
    : config.duty ? 'Approximation for pulsed DC'
    : config.name.startsWith('RF') ? 'Analogy for RF sputtering of metal' : 'Schematic metal magnetron map';
  return {
    name: 'Thornton zone model',
    kind: 'thornton',
    x: THETA,
    y: ARGON_PRESSURE,
    point: [theta, pressure],
    operating: `Tₛ/Tₘ = ${theta.toFixed(3)} · p(Ar) = ${pressure.toPrecision(3)} Pa`,
    reading: !covered ? 'Outside Thornton’s plotted pressure range'
      : near >= 0 ? `${ZONE_NAMES[zones[near]]} → ${ZONE_NAMES[zones[near + 1]]} · near the schematic boundary`
      : `${ZONE_NAMES[selected]} · ${ZONE_TEXTURE[selected]}`,
    detail: `${comparison}. The original thick-coating map spans about 0.13–4 Pa Ar. Boundaries are approximate.`,
    links: [THORNTON],
  };
}

function compoundWindow(config, settings, film, pressure) {
  if (config.reactive) {
    const theta = settings.substrate / TIN_MELTING_K;
    return {
      name: 'Reactive TiN · process coordinates',
      kind: 'window',
      x: TEMPERATURE, y: axis('N₂ partial pressure (Pa)', [0,.05,.15,.5,1,2.5], (v) => Math.log1p(v / .05)),
      point: [settings.substrate, pressure],
      operating: `p(N₂) = ${pressure.toPrecision(3)} Pa · Tₛ/Tₘ = ${theta.toFixed(3)}`,
      cutoff: TIN_NITROGEN_PA,
      reading: 'Nominal TiN · substrate ion data needed for a zone',
      detail: 'Petrov’s TiN regimes require ion energy and ion-to-Ti flux at the film. The dotted line marks this simulator’s Ti/TiN composition threshold.',
      links: [PETROV, TIN_REFERENCE],
    };
  }
  if (config.ito) {
    const alloy = config.ito === 'alloy';
    const ticks = alloy ? [0,.01,.03,.1,.3,1,2.5] : [0,.01,.03,.1,.3,.5];
    return {
      name: alloy ? 'ITO · reactive alloy route' : 'ITO · ceramic target',
      kind: 'window',
      x: TEMPERATURE, y: axis('O₂ partial pressure (Pa)', ticks, (v) => Math.log1p(v / .01)),
      point: [settings.substrate, pressure],
      operating: `Tₛ = ${settings.substrate} K · p(O₂) = ${pressure.toPrecision(3)} Pa`,
      cutoff: alloy ? ITO_OXIDE_PA : undefined,
      reading: `Nominal film · ${film.formula}`,
      detail: alloy ? 'The line marks the simulator’s onset of nominal ITO. Crystallinity also depends on thickness and substrate.'
        : 'Temperature, oxygen and thickness affect ITO texture. Available data do not establish transferable zone boundaries for this recipe.',
      links: [['ITO structure on glass', 'https://www.sciencedirect.com/science/article/pii/S0022024803016233'],
        ['Pulsed DC target comparison', 'https://www.sciencedirect.com/science/article/pii/S0257897216308945']],
    };
  }
  return {
    name: 'Amorphous SiO₂ · process coordinates',
    kind: 'window',
    x: TEMPERATURE, y: ARGON_PRESSURE,
    point: [settings.substrate, pressure],
    operating: `Tₛ = ${settings.substrate} K · p(Ar) = ${pressure.toPrecision(3)} Pa`,
    reading: 'Amorphous growth · density and porosity can still change',
    detail: 'Crystalline grain zones are inapplicable to the amorphous silica in this RF recipe.',
    links: [['RF-sputtered amorphous SiO₂', 'https://www.sciencedirect.com/science/article/abs/pii/S0042207X02003883']],
  };
}

function netReading(sample) {
  if (sample.net < -.00001) return 'Net removal';
  if (sample.net > .00001) return 'Net deposition';
  return 'Growth and removal in balance';
}

function ionWindow(config, settings, sample, theta, pressure) {
  if (config.arc) {
    return {
      name: 'TiN · cathodic arc research comparison',
      kind: 'arc',
      x: axis('N₂ pressure (Pa)', [0,.25,.5,.75,1]), y: axis('|Vₛ| (V)', [0,100,200,300,450,600]),
      point: [pressure, settings.bias],
      operating: `p(N₂) = ${pressure.toPrecision(3)} Pa · |Vₛ| = ${settings.bias} V · Tₛ/Tₘ = ${theta.toFixed(3)}`,
      reading: `${netReading(sample)} · TiN`,
      detail: 'The study sweep used 693 K and WC–Co. Kameneva’s TiN zones also depend on heating history and arc geometry.',
      links: [['TiN bias sweep', 'https://doi.org/10.1016/S0257-8972(00)00884-7'],
        ['Kameneva’s TiN zones', 'https://doi.org/10.3103/S1067821213060096'], TIN_REFERENCE],
    };
  }
  if (!sample.gross) {
    return {
      name: 'Anders · plasma pre-clean',
      kind: 'etch',
      x: TEMPERATURE, y: axis('Substrate Eᵢ (eV)', [0,100,500,1000,2000,3500], (v) => Math.log1p(v / 125)),
      point: [settings.substrate, sample.ionEnergy],
      operating: `Tₛ = ${settings.substrate} K · Eᵢ ≈ ${Math.round(sample.ionEnergy)} eV`,
      reading: 'Source off · no film growth zone',
      detail: 'Operating point for the etching branch. An ion-to-film flux ratio is undefined with the coating source off.',
      links: [ANDERS],
    };
  }
  // ionDose = E_i * J_i / J_f. Classic and IBAD model distinct Ar+ and
  // evaporated metal fluxes. The energetic coordinate omits neutral kinetic
  // energy and treats ions as singly charged, as in the main physics model.
  const ratio = sample.ionEnergy > 0 ? sample.ionDose / sample.ionEnergy : 0;
  const energyProxy = (ratio / (1 + ratio)) * (sample.ionEnergy / COHESIVE_EV[sample.film.name])
    * (ZONE_ARGON_MASS / sample.film.mass);
  return {
    name: config.ibad ? 'Anders · ion beam assistance' : 'Anders · classic ion plating',
    kind: 'assist',
    x: THETA, y: axis('E* ion estimate', [0,.1,1,10,100,1000], (v) => Math.log1p(v / .1)),
    point: [theta, energyProxy],
    operating: `Tₛ/Tₘ = ${theta.toFixed(3)} · E* ≈ ${energyProxy.toPrecision(3)} · Jᵢ/Jfilm ≈ ${ratio.toPrecision(2)}`,
    reading: `${netReading(sample)} · thermal projection`,
    detail: 'E* includes Ar⁺ momentum transfer. Tₛ/Tₘ shows only the thermal part of T*. Full zone assignment needs the potential-energy term.',
    links: [ANDERS],
  };
}

export function zoneModel(config, settings, sample) {
  const film = sample.film;
  const substrate = substrateStatus(settings);
  const melting = film.formula === 'TiN' ? TIN_MELTING_K : film.melting;
  const theta = melting ? settings.substrate / melting : undefined;
  const fullPressure = 10 ** settings.pressure * 100;
  const species = processGas(config, settings)?.species ?? [];
  const partial = (name) => fullPressure * (species.find(([gas]) => gas === name)?.[1] ?? 0);
  let model;
  if (config.family === 'evaporation') model = thermalZones(theta);
  else if (config.family === 'plating') model = ionWindow(config, settings, sample, theta, fullPressure);
  else if (config.ito) model = compoundWindow(config, settings, film, partial('O₂'));
  else if (film.formula === 'TiN') model = compoundWindow(config, settings, film, partial('N₂'));
  else if (film.formula === 'SiO₂') model = compoundWindow(config, settings, film, partial('Ar'));
  else model = thorntonZones(config, theta, partial('Ar'));

  const label = film.formula ?? film.name;
  const subject = config.classic && settings.preclean ? substrate.name : `${label} on ${substrate.name}`;
  const island = substrate.oxide && /Silver|Gold/.test(film.name) && sample.gross > 0;
  const supportContext = {
    silicon: 'The model assumes a native oxide on silicon. Surface preparation can change nucleation.',
    borofloat: 'Early growth on glass depends on wetting and surface preparation.',
    silica: 'Fused silica is amorphous. Wetting and surface preparation influence early growth.',
    steel: 'Surface finish and oxide on stainless steel can influence nucleation.',
    polycarbonate: 'Polycarbonate surface treatment and temperature can change nucleation and adhesion.',
    kapton: 'Surface treatment of polyimide can change nucleation and adhesion.',
  };
  const context = substrate.hot ? 'Above the substrate thermal reference.'
    : island ? 'Ag or Au can nucleate as islands on oxide surfaces.'
    : supportContext[settings.wafer] ?? supportContext.silicon;
  if (island && !substrate.hot) model.links.push(['Island growth study', 'https://www.sciencedirect.com/science/article/pii/0169433286900590']);
  if (config.family === 'evaporation' && film.name === 'Aluminium' && substrate.oxide) {
    model.links.push(['Evaporated Al on glass and Si', 'https://doi.org/10.5755/j01.ms.18.4.3088']);
  }
  if (config.ito && settings.wafer === 'polycarbonate') model.links.push(['ITO on glass and polycarbonate', 'https://doi.org/10.3390/coatings11010092']);
  return { ...model, subject, context, hot: substrate.hot };
}

function axisPosition(scale, lo, hi) {
  const [min, max] = [scale.ticks[0], scale.ticks.at(-1)].map(scale.scale);
  return (value) => lo + (hi - lo) * (scale.scale(value) - min) / (max - min);
}

function thermalArtwork(x) {
  const strips = [
    [0,.25,'one'], [.25,.35,'blend'], [.35,.45,'two'], [.45,.55,'blend'], [.55,1,'three'],
  ];
  return strips.map(([start,end,style]) => `<rect class="zone-${style}" x="${x(start)}" y="41" width="${x(end)-x(start)}" height="90"/>`).join('')
    + Object.entries({ one: .125, two: .40, three: .775 }).map(([style, centre]) =>
      `<text class="zone-region-text" x="${x(centre)}" y="91" text-anchor="middle">${ZONE_NAMES[style]}</text>`).join('');
}

function thorntonArtwork(x,y) {
  const samples = [.13,.3,.6,1,2,3,4];
  const edges = samples.map((pressure) => [0, ...thorntonBoundaries(pressure), 1]);
  const style = ['one','transition','two','three'];
  const regions = style.map((zone,index) => {
    const points = samples.map((pressure,i) => [x(edges[i][index]),y(pressure)]);
    for (let i = samples.length - 1; i >= 0; i--) points.push([x(edges[i][index+1]),y(samples[i])]);
    return `<polygon class="zone-${zone}" points="${points.map(([a,b]) => `${a},${b}`).join(' ')}"/>`;
  }).join('');
  const labels = [0,...thorntonBoundaries(1.3),1];
  return regions + style.map((zone,i) =>
    `<text class="zone-region-text" x="${x((labels[i]+labels[i+1])/2)}" y="${y(1.3)}" text-anchor="middle">${ZONE_NAMES[zone]}</text>`).join('');
}

export function zoneDiagramMarkup(model) {
  const left = 64, right = 411, top = 18, bottom = 168;
  const x = axisPosition(model.x, left, right);
  const y = model.y ? axisPosition(model.y, bottom, top) : null;
  const [current, ordinate] = model.point;
  // The supported slider ranges are in view. Clamping protects the chart
  // if new recipe bounds are introduced before the diagram is extended.
  const cx = Math.max(left, Math.min(right, x(current)));
  const cy = y ? Math.max(top, Math.min(bottom, y(ordinate))) : 112;
  let artwork = model.kind === 'thermal' ? thermalArtwork(x) : '';
  if (model.kind === 'thornton') artwork = thorntonArtwork(x,y);
  if (model.kind === 'arc') {
    const a = x(.67);
    artwork = `<path class="zone-reference" d="M${a} ${y(40)}V${y(600)}"/><circle class="zone-reference-dot" cx="${a}" cy="${y(40)}" r="3.6"/>
      <text class="zone-reference-label" x="${a+8}" y="${top+13}">Published sweep</text>`;
  }
  if (model.cutoff !== undefined) artwork += `<path class="zone-reference" d="M${left} ${y(model.cutoff)}H${right}"/>`;
  const xGrid = model.x.ticks.map((value) => {
    const px = x(value);
    return `${y ? `<path class="zone-grid-line" d="M${px} ${top}V${bottom}"/>` : ''}
      <path class="zone-axis" d="M${px} ${bottom}v4"/><text class="zone-tick" x="${px}" y="${bottom+19}" text-anchor="middle">${value}</text>`;
  }).join('');
  const yGrid = y ? model.y.ticks.map((value) => {
    const py = y(value);
    return `<path class="zone-grid-line" d="M${left} ${py}H${right}"/><path class="zone-axis" d="M${left-4} ${py}h4"/>
      <text class="zone-tick" x="${left-7}" y="${py+4}" text-anchor="end">${value}</text>`;
  }).join('') : '';
  const tracer = `<path class="zone-cursor" d="M${cx} ${y ? top : 40}V${bottom}${y ? `M${left} ${cy}H${right}` : ''}"/>
    <circle class="zone-point-halo" cx="${cx}" cy="${cy}" r="8"/><circle class="zone-point" cx="${cx}" cy="${cy}" r="4.3"/>`;
  return `<svg class="zone-diagram" viewBox="0 0 428 216" role="img" aria-label="${model.name}. ${model.operating}. ${model.reading}.">
    ${artwork}${xGrid}${yGrid}
    <path class="zone-axis" d="M${left} ${bottom}H${right}${y ? `M${left} ${bottom}V${top}` : ''}"/>
    <text class="zone-axis-label" x="${(left+right)/2}" y="209" text-anchor="middle">${model.x.label}</text>
    ${y ? `<text class="zone-axis-label" x="14" y="${(top+bottom)/2}" text-anchor="middle" transform="rotate(-90 14 ${(top+bottom)/2})">${model.y.label}</text>` : ''}
    ${tracer}
  </svg>`;
}
