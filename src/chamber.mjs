import { processGas } from './instruments.mjs';

export const CHAMBER = {
  width: 620, height: 465,
  left: 119, right: 479, top: 81, bottom: 397,
  plateLeft: 202, plateRight: 398, plateY: 135,
  targetLeft: 224, targetRight: 376,
  gunX: 185, gunY: 250,
  inletX: 149, inletY: 211,
};

export function sourceLevel(distance) {
  return 279 + 2.2 * distance;
}

function earth(x, y) {
  return `<path class="ground-wire" d="M${x} ${y}v6m-8 0h16m-12 4h8m-6 4h4"/>`;
}

function annotation(label, x, y, leader, { anchor = 'start', detail = '' } = {}) {
  return `<g class="chamber-annotation">
    <path class="annotation-arrow" d="${leader}"/>
    <text class="chamber-label minor" x="${x}" y="${y}" text-anchor="${anchor}">${label}</text>
    ${detail ? `<text class="chamber-label minor" x="${x}" y="${y + 13}" text-anchor="${anchor}">${detail}</text>` : ''}
  </g>`;
}

function supply(x, y, title, first, second, type, id = '', wiring = 'ground') {
  const ground = wiring === 'ground';
  const contacts = ground ? `<circle cx="${x}" cy="${y + 39}" r="3.3"/>
    <circle cx="${x + 80}" cy="${y + 70}" r="3.3"/>`
    : `<circle cx="${x + 27}" cy="${y + 70}" r="3.3"/><circle cx="${x + 75}" cy="${y + 70}" r="3.3"/>`;
  return `<g class="supply ${type}">
    <rect x="${x}" y="${y}" width="105" height="70" rx="8"/>
    <text class="supply-title" x="${x + 12}" y="${y + 22}">${title}</text>
    ${contacts}
    <text x="${x + 10}" y="${y + 44}" ${id ? `id="${id}"` : ''}>${first}</text>
    <text x="${x + 10}" y="${y + 63}">${second}</text>
  </g>${ground ? `<path class="ground-wire" d="M${x + 80} ${y + 73}v5"/>${earth(x + 80, y + 78)}` : ''}`;
}

function terminal(x, y, sign, type = 'voltage') {
  return `<g class="terminal ${type}"><circle cx="${x}" cy="${y}" r="10"/><text x="${x}" y="${y + 5.2}" text-anchor="middle">${sign}</text></g>`;
}

function circuitMarkup(config, method, y, preclean) {
  const biased = config.classic || config.arc;
  const groundedSubstrate = `<path class="ground-wire" d="M300 81V51h-67"/>${earth(233, 51)}
    <text class="chamber-label minor" x="202" y="58">0 V</text>`;
  const bias = `<path class="voltage-wire" d="M300 81V48h196v38h7"/>
    ${supply(503, 47, 'Substrate bias', '− Vₛ', '+ return', 'voltage', 'chamber-bias')}
    ${terminal(425, 135, '−')}`;
  const lid = `<g class="feedthrough"><rect x="287" y="65" width="26" height="17" rx="3"/><path d="M300 64v46"/></g>`;
  const shell = `<path class="ground-wire" d="M105 348H83"/>${earth(83, 348)}
    <text class="chamber-label minor" x="9" y="354">${config.diode ? 'Anode 0 V' : 'Wall 0 V'}</text>`;
  const yBox = 326;
  const yTop = yBox + 39;
  let source;
  if (config.family === 'sputtering' || config.arc) {
    const title = method === 'rf' ? 'RF supply' : method === 'pulsed' ? 'Pulsed DC' : config.arc ? 'Arc supply' : config.diode ? 'DC diode HV' : 'DC supply';
    const outgoing = method === 'rf'
      ? `<path class="voltage-wire" d="M300 ${y + 20}V416h109m13 0h75v-${416 - yTop}h6m-94 41v20m13-20v20"/>`
      : `<path class="voltage-wire" d="M300 ${y + 20}V416h197v-${416 - yTop}h6"/>`;
    source = `${outgoing}
      ${supply(503, yBox, title, method === 'rf' ? '~ 13.56 MHz' : config.diode ? '−2.5 kV' : '− cathode', method === 'rf' ? '0 V return' : '+ return', 'voltage')}
      ${terminal(398, y + 5, '−')}`;
  } else if (method === 'ebeam') {
    source = `<path class="voltage-wire" d="M400 ${y + 25}V416h97v-${416 - yTop}h6"/>
      <path class="ground-wire" d="M300 ${y + 15}v32"/>${earth(300, y + 47)}
      ${supply(503, yBox, 'E-beam HV', '− gun', '+ hearth', 'voltage')}
      ${terminal(413, y + 17, '−')}`;
  } else {
    const offset = method === 'radiant' ? 26 : 15;
    source = `<path class="heat-wire" d="M356 ${y + offset}V416h174v-20M244 ${y + offset}V430h334v-34"/>
      ${supply(503, yBox, preclean ? 'Heater off' : 'Heater DC', '+ lead', '− lead', 'heat', '', 'bottom')}`;
  }
  const gun = config.ibad
    ? `<path class="voltage-wire" d="M108 242h34l14 15"/><path class="ground-wire" d="M108 268h31"/>${earth(139, 268)}
       <g class="supply voltage"><rect x="9" y="218" width="99" height="67" rx="8"/><text class="supply-title" x="20" y="239">Ar⁺ gun</text><text x="20" y="260">+ source</text><text x="20" y="277">0 V grid</text></g>`
    : '';
  return `${biased ? bias : groundedSubstrate}${lid}${shell}${source}${gun}`;
}

function gasInlet(gas) {
  const duct = gas.gun ? '<path d="M130 211h31v28l9 13"/>' : '';
  return `<g class="gas-inlet">
    <g fill="none" stroke="#1b2b40" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"><path d="M17 211h118"/>${duct}</g>
    <g fill="none" stroke="#8ba9c0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 211h118"/>${duct}</g>
    ${gas.gun ? '<path id="gun-gas-path" d="M130 211h31v28l9 13" fill="none" stroke="#a9ebad" stroke-width="2" opacity="0"/>' : ''}
    <rect x="98" y="200" width="13" height="22" rx="2" fill="#546d86" stroke="#a4bfd4"/>
    <rect x="108" y="203" width="15" height="16" rx="2" fill="#557089" stroke="#abc2d7"/>
    ${gas.gun ? '' : '<path d="M130 205h12l6 3v6l-6 3h-12Z" fill="#68859d" stroke="#a6c2d8"/>'}
    <path d="M43 203l19 8-19 8Zm38 0-19 8 19 8Z" fill="#2b5670" stroke="#b2c9db"/>
    <path d="M62 205v-12m-7 0h14" fill="none" stroke="#b2c9db" stroke-width="2" stroke-linecap="round"/>
    <circle id="gas-valve-lamp" cx="18" cy="181" r="3" fill="#8a9eb4"/>
    <g class="chamber-annotation">
      <path class="annotation-arrow" d="M70 188l9 15"/>
      <text class="chamber-label minor" x="26" y="185" id="gas-species">${gas.label}</text>
    </g>
    <text class="gas-valve-state" x="14" y="${gas.gun ? 166 : 232}" id="gas-valve-state">Closed</text>
  </g>`;
}

const WAFER_VIEW = {
  silicon: { label: 'Si wafer', height: 7, edge: '#baccf1', stops: ['#909cbc', '#46546f', '#7584aa'], detail: 'M210 130h179' },
  borofloat: { label: 'Borosilicate glass', height: 10, edge: '#c4e6d9', stops: ['#b2e2d7', '#558f88', '#94c9b9'], detail: 'M205 127h186m-173 6h173' },
  silica: { label: 'Fused silica', height: 10, edge: '#d8f6ff', stops: ['#bce3f2', '#648eac', '#a8cddf'], detail: 'M206 127h186m-175 6h174' },
  steel: { label: '304 stainless steel', height: 8, edge: '#e3e7ed', stops: ['#e1e4e6', '#576878', '#a6b0bd'], detail: 'M212 129h181m-175 4h169' },
  polycarbonate: { label: 'Polycarbonate', height: 9, edge: '#e5e9d8', stops: ['#dce4d0', '#869485', '#b7c8b7'], detail: 'M208 128h182m-164 5h165' },
  kapton: { label: 'Kapton HN', height: 4, edge: '#ffd084', stops: ['#ffc075', '#ad602b', '#e7aa55'], detail: 'M206 133h182' },
};

function holderMarkup(wafer) {
  const y = CHAMBER.plateY - wafer.height;
  const element = 'M228 115h8l6 3 6-5 6 5 6-5 6 5 6-3h56l6 3 6-5 6 5 6-5 6 5 6-3h8';
  return `<g class="heated-holder" aria-hidden="true">
    <rect x="107" y="41" width="84" height="22" rx="5" fill="#322e35" stroke="#9e7d62"/>
    <text x="113" y="55" class="holder-controller">Holder heat</text>
    <text x="178" y="55" class="holder-controller">~</text>
    <rect x="158" y="65" width="29" height="18" rx="3" fill="#36506b" stroke="#9bb6d9"/>
    <path class="holder-wires" d="M165 63v33h53v20h13M180 63v27h63v20"/>
    <path d="M300 82v28" fill="none" stroke="#9bb6d9" stroke-width="6" stroke-linecap="round"/>
    <rect x="189" y="109" width="222" height="19" rx="4" fill="url(#steel)" stroke="#bed0df"/>
    <path d="M195 113h210M195 124h210" fill="none" stroke="#ddeaf4" stroke-opacity=".28"/>
    <rect x="226" y="111" width="149" height="10" rx="3" fill="#283142" stroke="#b3a27e"/>
    <path d="${element}" fill="none" stroke="#a7977e" stroke-width="1.6"/>
    <path id="holder-coil" d="${element}" fill="none" stroke="#ffc275" stroke-width="2.7" opacity="0"/>
    <path d="M194 124h17v5h-8v6h-6v-8h-3Zm212 0h-17v5h8v6h6v-8h3Z" fill="#8196ae" stroke="#bccde2"/>
    <rect x="202" y="${y}" width="196" height="${wafer.height}" rx="1.6" fill="url(#substrate-material)" stroke="${wafer.edge}"/>
    <path d="${wafer.detail}" fill="none" stroke="${wafer.edge}" opacity=".57"/>
  </g>`;
}

function chamberSensors(hasPlasma) {
  return `<g class="chamber-instruments">
    <path d="M104 108h16m-11-8v16m5-16v16" stroke="#91b4ca" stroke-width="3" fill="none"/>
    <rect x="10" y="76" width="94" height="55" rx="6" fill="#22364d" stroke="#94abc0"/>
    <text class="gauge-label" x="57" y="88" text-anchor="middle" id="chamber-gauge-type">Vacuum gauge</text>
    <rect x="16" y="94" width="82" height="28" rx="3" fill="#142b2e" stroke="#557575"/>
    <text class="gauge-digits" x="57" y="108" text-anchor="middle" id="chamber-pressure"></text>
    <text class="gauge-unit" x="57" y="118" text-anchor="middle">mbar</text>
    <g class="chamber-sensor">
      <path d="M439 106v46m-12 0h24" stroke="#91b4ca" stroke-width="2" fill="none"/>
      <rect x="428" y="152" width="22" height="8" rx="2" fill="#c6a674" stroke="#f1d398"/>
      <circle cx="282" cy="111" r="3.1" fill="#edb472"/>
      ${hasPlasma ? '<path d="M473 181h18v19h-18Z" fill="#535884" stroke="#bdafe4"/>' : ''}
    </g>
  </g>`;
}

function magnetronField(y) {
  const poles = [[240, 'S', '#385777'], [285, 'N', '#854452'], [330, 'S', '#385777']];
  const magnets = poles.map(([x, pole, fill]) => `<rect x="${x}" y="${y + 13}" width="30" height="19" rx="3" fill="${fill}" stroke="#a8bcd1"/>
    <text class="magnetron-pole" x="${x + 15}" y="${y + 27}" text-anchor="middle">${pole}</text>`).join('');
  return `<g class="magnetron">
    <g class="magnetic-field">
      <path d="M296 ${y - 1}C291 ${y - 50} 266 ${y - 61} 254 ${y - 47}S242 ${y - 18} 244 ${y - 1}"/>
      <path d="M304 ${y - 1}C309 ${y - 50} 334 ${y - 61} 346 ${y - 47}S358 ${y - 18} 356 ${y - 1}"/>
      <path d="M292 ${y - 1}C288 ${y - 29} 278 ${y - 41} 267 ${y - 37}S251 ${y - 17} 253 ${y - 1}"/>
      <path d="M308 ${y - 1}C312 ${y - 29} 322 ${y - 41} 333 ${y - 37}S349 ${y - 17} 347 ${y - 1}"/>
      <path class="field-arrow" d="M266 ${y - 54}l-9 5m5-7l-5 7 9-1m68-4l9 5m-5-7l5 7-9-1"/>
    </g>
    ${magnets}
    <path d="M245 ${y + 35}h110" stroke="#6986ab" stroke-width="3"/>
    ${annotation('Magnetic field B', 300, y - 69, `M300 ${y - 65}l22 16`, { anchor: 'middle' })}
    ${annotation('Magnetron', 215, y + 34, `M220 ${y + 31}l19-7`, { anchor: 'end' })}
  </g>`;
}

function sourceMarkup(config, method, y, colour) {
  if (config.family === 'sputtering') {
    return `<path d="M232 ${y + 8}h136l-13 30h-110Z" fill="#243956" stroke="#6986ab"/>
      ${config.magnetron ? magnetronField(y) : ''}
      <rect x="224" y="${y}" width="152" height="10" rx="2" fill="${colour}" stroke="#c1cfe0"/>`;
  }
  if (config.arc) {
    return `<path d="M243 ${y + 9}h114v17H243Z" fill="#30465e" stroke="#728dae"/>
      <rect x="224" y="${y}" width="152" height="11" rx="2" fill="${colour}" stroke="#c1cfe0"/>
      <path class="ground-wire" d="M450 ${y - 45}h30"/>
      <path d="M450 ${y - 66}v45" stroke="#8ca9ce" stroke-width="5"/>
      ${annotation('Anode 0 V', 446, y - 73, `M448 ${y - 70}l2 9`, { anchor: 'end' })}`;
  }
  if (method === 'filament') {
    const coil = `M244 ${y + 15}v-10h12l10-9 12 13 13-13 13 13 13-13 13 13 13-9h13v15`;
    return `<path d="${coil}" fill="none" stroke="#8fa3b5" stroke-width="5" stroke-linejoin="round"/>
      <path class="heat-active" d="${coil}" fill="none" stroke="#ffc47d" stroke-width="4" stroke-linejoin="round" opacity="0"/>`;
  }
  const heater = method === 'radiant' ? `<path d="M244 ${y + 26}h112" stroke="#8598af" stroke-width="4" stroke-dasharray="6 4"/>
    <path class="heat-active" d="M244 ${y + 26}h112" stroke="#ffc47d" stroke-width="4" stroke-dasharray="6 4" opacity="0"/>` : '';
  const gun = method === 'ebeam'
    ? `<rect x="386" y="${y + 19}" width="26" height="14" rx="3" fill="#5b6d84" stroke="#aabeD4"/>
       <path id="electron-guide" d="M399 ${y + 19}Q396 ${y - 60} 306 ${y - 1}" fill="none" stroke="#f3b77f" stroke-width="1.7" opacity="0"/>`
    : '';
  return `<path d="M236 ${y}h128l-15 17h-98Z" fill="#4a627e" stroke="#a5b8d2"/>
    <ellipse cx="300" cy="${y}" rx="51" ry="3.6" fill="${colour}"/>
    <ellipse class="heat-active" cx="300" cy="${y}" rx="51" ry="3.6" fill="#ffd39a" opacity="0"/>${heater}${gun}`;
}

export function chamberMarkup(config, method, settings, material, film) {
  const y = sourceLevel(settings.distance);
  const gas = processGas(config, settings);
  const hasPlasma = gas && !gas.gun;
  const wafer = WAFER_VIEW[settings.wafer] ?? WAFER_VIEW.silicon;
  const pumpY = config.ibad ? 300 : 269;
  const plasmaY = config.classic ? 175 : config.diode ? y - 99 : y - 52;
  const preclean = config.classic && settings.preclean;
  const substrate = config.classic || config.arc ? 'Negatively biased substrate' : 'Substrate holder at ground';
  const supply = method === 'rf' ? 'RF supply through a blocking capacitor to the target, with negative DC self-bias'
    : method === 'ebeam' ? 'High voltage from the negative gun to the grounded hearth'
    : config.arc || config.family === 'sputtering' ? 'Negative cathode with a grounded positive return'
    : config.ibad ? 'DC heater and ion gun with positive source and grounded extraction grid' : 'DC heater with positive and negative leads';
  const field = config.magnetron ? ' Permanent magnets and magnetic field B.' : '';
  return `<svg viewBox="0 0 620 465" role="img" aria-label="${config.hardware}. ${wafer.label} on a holder with an independent resistance heater. ${substrate}. ${supply}.${field}${preclean ? ' The evaporation source heater is off for plasma pre-cleaning.' : ''}">
    <defs>
      <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0V26" fill="none" stroke="#718aa9" stroke-opacity=".20"/></pattern>
      <radialGradient id="plasma"><stop stop-color="#b997ff" stop-opacity=".68"/><stop offset="1" stop-color="#9d6dec" stop-opacity="0"/></radialGradient>
      <radialGradient id="heat"><stop stop-color="#ffbe67" stop-opacity=".68"/><stop offset="1" stop-color="#ed783d" stop-opacity="0"/></radialGradient>
      <linearGradient id="steel" x2="0" y2="1"><stop stop-color="#a8bed6"/><stop offset="1" stop-color="#4f6b8c"/></linearGradient>
      <linearGradient id="substrate-material" x2="0" y2="1">${wafer.stops.map((colour, index) => `<stop offset="${[0,.62,1][index]}" stop-color="${colour}"/>`).join('')}</linearGradient>
      <clipPath id="chamber-interior"><rect x="119" y="81" width="360" height="316" rx="27"/></clipPath>
      <marker id="annotation-arrowhead" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L7 4L1 7Z" fill="#b6cbe2"/></marker>
    </defs>
    <rect width="620" height="465" fill="#14253d"/>
    <rect width="620" height="465" fill="url(#grid)"/>
    <path d="M65 ${pumpY}h57v22H65M58 ${pumpY - 3}v28h7v-28Z" fill="#304e70" stroke="#7998be" stroke-width="2"/>
    <rect x="106" y="68" width="386" height="342" rx="37" fill="#314b68" stroke="#94afd1" stroke-width="2"/>
    <rect x="119" y="81" width="360" height="316" rx="27" fill="#122137" stroke="#6b8aac" stroke-width="2"/>
    <g clip-path="url(#chamber-interior)">
      ${hasPlasma ? `<g id="plasma-glow" fill="url(#plasma)" opacity="0">${config.magnetron
        ? `<ellipse cx="263" cy="${y - 25}" rx="70" ry="38"/><ellipse cx="337" cy="${y - 25}" rx="70" ry="38"/>`
        : `<ellipse cx="300" cy="${plasmaY}" rx="${config.diode ? 181 : config.arc ? 115 : 149}" ry="${config.diode ? 120 : config.classic ? 100 : 63}"/>`}</g>` : ''}
      ${config.family !== 'sputtering' && !config.arc ? `<ellipse class="heat-active" cx="300" cy="${y + (method === 'radiant' ? 17 : 1)}" rx="96" ry="45" fill="url(#heat)" opacity="0"/>` : ''}
    </g>
    ${holderMarkup(wafer)}
    ${circuitMarkup(config, method, y, preclean)}
    ${config.classic ? '<path id="surface-residue" d="M203 137h194" stroke="#f4b280" stroke-width="3.5" stroke-dasharray="2 3" stroke-linecap="round"/>' : ''}
    <rect id="in-chamber-film" x="202" y="135" width="196" height="0" rx="2" fill="${film.colour}"/>
    ${chamberSensors(hasPlasma)}
    ${gas ? gasInlet(gas) : ''}
    ${sourceMarkup(config, method, y, material.colour)}
    ${config.ibad ? '<path d="m144 265 37-21 13 24-37 21Z" fill="#6c829f" stroke="#c2ace3"/><path d="m179 245 14 24" stroke="#c2ace3" stroke-width="2"/>' : ''}
    <foreignObject x="0" y="0" width="620" height="465" clip-path="url(#chamber-interior)" pointer-events="none">
      <canvas xmlns="http://www.w3.org/1999/xhtml" id="chamber-motion" width="1240" height="930"></canvas>
    </foreignObject>
    <path d="M461 146v${y - 154}m-5-${y - 154}h10m-10 ${y - 154}h10" stroke="#8ca9ce" stroke-width="1" fill="none"/>
    <text class="chamber-label minor" x="453" y="${(y + 146) / 2}" text-anchor="end">L</text>
    ${annotation('To pump', 16, pumpY + 42, `M65 ${pumpY + 37}l12-15`)}
    ${annotation('Substrate holder', 133, 156, 'M164 144l26-27')}
    ${annotation('Substrate', 318, 92, 'M431 94v18l-33 20', { detail: wafer.label })}
    ${annotation('TC', 266, 96, 'M270 96l11 12', { anchor: 'end' })}
    ${annotation('QCM', 439, 184, 'M439 172v-11', { anchor: 'middle' })}
    ${hasPlasma ? annotation('OES', 465, 204, 'M468 198l5-7', { anchor: 'end' }) : ''}
    ${config.family === 'sputtering' || config.arc
      ? annotation(config.arc ? 'Ti cathode' : 'Target', 150, y + 5, `M200 ${y + 1}l24 4`, { detail: method === 'rf' ? '− self-bias' : '' })
      : annotation(method === 'ebeam' ? 'Hearth' : 'Source', 151, y + 7, `M205 ${y + 3}l${method === 'filament' ? 39 : 31} 2`)}
    ${method === 'ebeam' ? annotation('E-gun', 427, y + 31, `M423 ${y + 28}h-11`) : ''}
    ${config.ibad ? annotation('Ion gun', 130, 300, 'M159 289l11-12') : ''}
    <g id="film-grain-inset" visibility="hidden">
      <rect x="502" y="158" width="106" height="136" rx="7" fill="#1e334d" stroke="#89aaca"/>
      <text class="grain-inset-text" x="555" y="175" text-anchor="middle">Film grains</text>
      <foreignObject x="511" y="181" width="88" height="88" pointer-events="none">
        <canvas xmlns="http://www.w3.org/1999/xhtml" id="chamber-grain-map" width="176" height="176" role="img" aria-label="Top view of the film grains"></canvas>
      </foreignObject>
      <text class="grain-inset-meta" x="555" y="284" text-anchor="middle" id="grain-inset-meta"></text>
    </g>
  </svg>`;
}
