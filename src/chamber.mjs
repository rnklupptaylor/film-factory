export const CHAMBER = {
  width: 620, height: 465,
  left: 119, right: 479, top: 81, bottom: 397,
  plateLeft: 202, plateRight: 398, plateY: 135,
  targetLeft: 224, targetRight: 376,
  gunX: 185, gunY: 250,
};

export function sourceLevel(distance) {
  return 279 + 2.2 * distance;
}

function earth(x, y) {
  return `<path class="ground-wire" d="M${x} ${y}v6m-8 0h16m-12 4h8m-6 4h4"/>`;
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
    ${terminal(410, 128, '−')}`;
  const lid = `<g class="feedthrough"><rect x="287" y="65" width="26" height="17" rx="3"/><path d="M300 64v54"/></g>`;
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
    const targetLabel = method === 'rf' ? '− self-bias' : config.arc ? '− Ti cathode' : '− target';
    source = `${outgoing}
      ${supply(503, yBox, title, method === 'rf' ? '~ 13.56 MHz' : config.diode ? '−2.5 kV' : '− cathode', method === 'rf' ? '0 V return' : '+ return', 'voltage')}
      <text class="electrode-label" x="386" y="${y + 9}">${targetLabel}</text>`;
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

function gasInlet(gasLabel) {
  return `<g class="gas-inlet">
    <path d="M17 211h118" stroke="#1b2b40" stroke-width="10" stroke-linecap="round"/>
    <path d="M17 211h118" stroke="#8ba9c0" stroke-width="5" stroke-linecap="round"/>
    <rect x="98" y="200" width="13" height="22" rx="2" fill="#546d86" stroke="#a4bfd4"/>
    <rect x="108" y="203" width="15" height="16" rx="2" fill="#557089" stroke="#abc2d7"/>
    <path d="M130 205h12l6 3v6l-6 3h-12Z" fill="#68859d" stroke="#a6c2d8"/>
    <path d="M43 203l19 8-19 8Zm38 0-19 8 19 8Z" fill="#2b5670" stroke="#b2c9db"/>
    <path d="M62 205v-12m-7 0h14" fill="none" stroke="#b2c9db" stroke-width="2" stroke-linecap="round"/>
    <text class="chamber-label minor" x="14" y="184">${gasLabel}</text>
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
      <text x="439" y="177" text-anchor="middle">QCM</text>
      <circle cx="251" cy="118" r="3.6" fill="#edb472"/>
      <path d="M251 115v-11h-15" stroke="#edb472" fill="none"/>
      <text x="234" y="108" text-anchor="end">TC</text>
      ${hasPlasma ? '<path d="M473 181h18v19h-18Z" fill="#535884" stroke="#bdafe4"/><text x="467" y="196" text-anchor="end">OES</text>' : ''}
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
    <text class="field-label" x="300" y="${y - 64}" text-anchor="middle">Magnetic field B</text>
    <text class="chamber-label minor" x="221" y="${y + 28}" text-anchor="end">Magnetron</text>
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
      <text class="chamber-label minor" x="445" y="${y - 72}" text-anchor="end">Anode 0 V</text>`;
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
  const gas = config.family === 'sputtering' || config.classic || config.arc;
  const gasLabel = config.arc ? 'N₂' : config.reactive ? 'Ar + N₂' : 'Ar';
  const plasmaY = config.classic ? 175 : config.diode ? y - 99 : y - 52;
  const preclean = config.classic && settings.preclean;
  const substrate = config.classic || config.arc ? 'Negatively biased substrate' : 'Substrate holder at ground';
  const supply = method === 'rf' ? 'RF supply through a blocking capacitor to the target, with negative DC self-bias'
    : method === 'ebeam' ? 'High voltage from the negative gun to the grounded hearth'
    : config.arc || config.family === 'sputtering' ? 'Negative cathode with a grounded positive return'
    : config.ibad ? 'DC heater and ion gun with positive source and grounded extraction grid' : 'DC heater with positive and negative leads';
  const field = config.magnetron ? ' Permanent magnets and magnetic field B.' : '';
  return `<svg viewBox="0 0 620 465" role="img" aria-label="${config.hardware}. ${substrate}. ${supply}.${field}${preclean ? ' The heater is off for plasma pre-cleaning.' : ''}">
    <defs>
      <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0V26" fill="none" stroke="#718aa9" stroke-opacity=".20"/></pattern>
      <radialGradient id="plasma"><stop stop-color="#b997ff" stop-opacity=".68"/><stop offset="1" stop-color="#9d6dec" stop-opacity="0"/></radialGradient>
      <radialGradient id="heat"><stop stop-color="#ffbe67" stop-opacity=".68"/><stop offset="1" stop-color="#ed783d" stop-opacity="0"/></radialGradient>
      <linearGradient id="steel" x2="0" y2="1"><stop stop-color="#a8bed6"/><stop offset="1" stop-color="#4f6b8c"/></linearGradient>
      <clipPath id="chamber-interior"><rect x="119" y="81" width="360" height="316" rx="27"/></clipPath>
    </defs>
    <rect width="620" height="465" fill="#14253d"/>
    <rect width="620" height="465" fill="url(#grid)"/>
    <text class="chamber-label" x="603" y="30" text-anchor="end" id="chamber-power">Standby</text>
    <path d="M65 269h57v22H65M58 266v28h7v-28Z" fill="#304e70" stroke="#7998be" stroke-width="2"/>
    <text class="chamber-label minor" x="16" y="311">To pump</text>
    <rect x="106" y="68" width="386" height="342" rx="37" fill="#314b68" stroke="#94afd1" stroke-width="2"/>
    <rect x="119" y="81" width="360" height="316" rx="27" fill="#122137" stroke="#6b8aac" stroke-width="2"/>
    <g clip-path="url(#chamber-interior)">
      ${gas ? `<g id="plasma-glow" fill="url(#plasma)" opacity="0">${config.magnetron
        ? `<ellipse cx="263" cy="${y - 25}" rx="70" ry="38"/><ellipse cx="337" cy="${y - 25}" rx="70" ry="38"/>`
        : `<ellipse cx="300" cy="${plasmaY}" rx="${config.diode ? 181 : config.arc ? 115 : 149}" ry="${config.diode ? 120 : config.classic ? 100 : 63}"/>`}</g>` : ''}
      ${config.family !== 'sputtering' && !config.arc ? `<ellipse class="heat-active" cx="300" cy="${y + (method === 'radiant' ? 17 : 1)}" rx="96" ry="45" fill="url(#heat)" opacity="0"/>` : ''}
    </g>
    ${circuitMarkup(config, method, y, preclean)}
    <path d="M300 82v35m-106 0h212" fill="none" stroke="#9bb6d9" stroke-width="5" stroke-linecap="round"/>
    <rect x="202" y="121" width="196" height="14" rx="3" fill="url(#steel)" stroke="#becde0"/>
    ${config.classic ? '<path id="surface-residue" d="M203 137h194" stroke="#f4b280" stroke-width="3.5" stroke-dasharray="2 3" stroke-linecap="round"/>' : ''}
    <rect id="in-chamber-film" x="202" y="135" width="196" height="0" rx="2" fill="${film.colour}"/>
    <text class="chamber-label" x="320" y="104">Substrate</text>
    ${chamberSensors(gas)}
    ${gas ? gasInlet(gasLabel) : ''}
    ${sourceMarkup(config, method, y, material.colour)}
    ${config.ibad ? '<path d="m144 265 37-21 13 24-37 21Z" fill="#6c829f" stroke="#c2ace3"/><path d="m179 245 14 24" stroke="#c2ace3" stroke-width="2"/>' : ''}
    <foreignObject x="0" y="0" width="620" height="465" clip-path="url(#chamber-interior)" pointer-events="none">
      <canvas xmlns="http://www.w3.org/1999/xhtml" id="chamber-motion" width="1240" height="930"></canvas>
    </foreignObject>
    <path d="M461 146v${y - 154}m-5-${y - 154}h10m-10 ${y - 154}h10" stroke="#8ca9ce" stroke-width="1" fill="none"/>
    <text class="chamber-label minor" x="453" y="${(y + 146) / 2}" text-anchor="end">L</text>
    <text class="chamber-label" x="300" y="452" text-anchor="middle">${config.hardware}</text>
  </svg>`;
}
