import { POSITIONS, WAFER_RADIUS_CM } from './physics.mjs';
import { RUN_LENGTH } from './content.mjs';

const PALETTE = ['var(--plot)', 'var(--loss)'];
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const range = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
const noise = (i) => (Math.sin(i * 91.827 + 71.53) * 43758.5453) % 1 + .5;
const random = (i) => ((noise(i) % 1) + 1) % 1;
const decimal = (n, digits = 2) => Number(n.toFixed(digits)).toString().replace('-', '−');
export function sci(n, digits = 1) {
  const [mantissa, exponent] = n.toExponential(digits).split('e');
  const superscript = '-0123456789';
  return `${Number(mantissa)} × 10${String(Number(exponent)).split('').map((ch) => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'[superscript.indexOf(ch)]).join('')}`;
}

export function chamberMarkup(config, settings, material) {
  const { family } = config;
  const plating = family === 'plating';
  const sputtering = family === 'sputtering';
  const sourceY = 285 + settings.distance * 2.1;
  const gas = sputtering || (plating && !config.ibad);
  const gasLabel = config.arc ? 'N₂' : config.reactive ? 'Ar + N₂' : 'Ar';
  return `<svg viewBox="0 0 600 474" role="img" aria-label="${config.hardware}, substrate and particle paths">
    <defs>
      <pattern id="grid" width="27" height="27" patternUnits="userSpaceOnUse"><path d="M27 0H0V27" fill="none" stroke="#718aa9" stroke-opacity=".20"/></pattern>
      <linearGradient id="frame" x2="0" y2="1"><stop stop-color="#44668a"/><stop offset="1" stop-color="#2a435f"/></linearGradient>
      <radialGradient id="plasma"><stop stop-color="#967fd6" stop-opacity=".55"/><stop offset="1" stop-color="#8863d3" stop-opacity="0"/></radialGradient>
      <radialGradient id="heat"><stop stop-color="#ffbe67" stop-opacity=".67"/><stop offset="1" stop-color="#ef8c45" stop-opacity="0"/></radialGradient>
      <linearGradient id="steel" x2="0" y2="1"><stop stop-color="#a8bed6"/><stop offset=".48" stop-color="#6e89a8"/><stop offset="1" stop-color="#4f6b8c"/></linearGradient>
      <linearGradient id="film-color"><stop stop-color="#6198ec"/><stop offset=".5" stop-color="${material.colour}"/><stop offset="1" stop-color="#6198ec"/></linearGradient>
    </defs>
    <rect width="600" height="474" fill="#162944"/>
    <rect width="600" height="474" fill="url(#grid)"/>
    <g fill="#9db8d9" font-family="system-ui,sans-serif" font-size="16">
      <text x="30" y="42" letter-spacing="2">VACUUM CHAMBER</text>
      <text x="570" y="42" text-anchor="end" id="chamber-pressure"></text>
    </g>
    <path d="M282 67V58h36v9m171 192h49v22h-49" fill="#304e70" stroke="#7998be" stroke-width="2"/>
    <path d="M536 259h17v22h-17m-4-25v28" fill="none" stroke="#7998be" stroke-width="3"/>
    <rect x="106" y="67" width="385" height="343" rx="38" fill="url(#frame)" stroke="#94afd1" stroke-width="2"/>
    <rect x="119" y="80" width="359" height="317" rx="30" fill="#14253d" stroke="#6b8aac" stroke-width="2"/>
    <path d="M139 171V115q0-15 17-17h119M459 278v80q0 17-18 20h-45" fill="none" stroke="#b7cde6" opacity=".17" stroke-width="2" stroke-linecap="round"/>
    ${gas ? `<ellipse id="plasma-glow" cx="300" cy="${sputtering ? sourceY - 43 : 199}" rx="154" ry="${config.classic ? 115 : 68}" fill="url(#plasma)"/>` : ''}
    ${!sputtering ? `<ellipse id="heater-glow" cx="300" cy="${sourceY}" rx="90" ry="47" fill="url(#heat)"/>` : ''}
    <g stroke="#7296c9" stroke-opacity=".43" stroke-dasharray="4 7" fill="none">
      <path d="M280 ${sourceY} 209 140m80 ${sourceY - 3} 264 140m47 ${sourceY - 3} 311 140m5 ${sourceY - 3} 352 140m-32 ${sourceY - 3} 397 140"/>
    </g>
    <path d="M300 80v38m-106 0h212" fill="none" stroke="#9bb6d9" stroke-width="6" stroke-linecap="round"/>
    <rect x="202" y="121" width="196" height="14" rx="3" fill="url(#steel)" stroke="#becde0"/>
    <rect id="in-chamber-film" x="202" y="135" width="196" height="0" rx="2" fill="url(#film-color)"/>
    ${plating && !config.ibad ? '<circle cx="416" cy="127" r="13" fill="#623f82" stroke="#c89be8"/><text x="416" y="132" text-anchor="middle" fill="#fff" font-size="16">−</text>' : ''}
    ${gas ? `<path d="M70 213h72" stroke="#998acc" stroke-width="2" stroke-dasharray="4 4"/><text x="65" y="218" text-anchor="end" fill="#d2bbef" font-size="17">${gasLabel}</text>` : ''}
    ${sputtering ? `<path d="M238 ${sourceY + 9}h124l-13 22h-98Z" fill="#253b59" stroke="#6a89ad"/><path d="M255 ${sourceY + 8}q10-70 45 0q28-70 48 0" fill="none" stroke="#bd9ceb" stroke-width="1.5" stroke-dasharray="4 4" opacity=".67"/><rect x="223" y="${sourceY}" width="154" height="11" rx="2" fill="${material.colour}" stroke="#a8bad7"/><text x="395" y="${sourceY + 9}" fill="#d7bbf0" font-size="17">−</text>`
      : config.hardware === 'Directly heated Ti filament' ? `<path d="M237 ${sourceY + 20}v-18h14l10-9 12 13 13-13 13 13 13-13 13 13 13-8h24v22" fill="none" stroke="#ffc377" stroke-width="5" stroke-linejoin="round"/>`
      : `<path d="M238 ${sourceY}h124l-14 20h-96Z" fill="#435a76" stroke="#a5b8d2"/><ellipse cx="300" cy="${sourceY}" rx="50" ry="4" fill="${config.arc ? '#d2a3ff' : '#f6bc75'}" opacity=".9"/>`}
    ${config.hardware === 'E-beam hearth' ? `<path d="M400 ${sourceY + 25}q13-58-96-25" stroke="#edab62" stroke-width="2.5" stroke-dasharray="4 4" fill="none"/><rect x="388" y="${sourceY + 21}" width="27" height="13" rx="3" fill="#9f724b" stroke="#f3c27f"/>` : ''}
    ${config.hardware === 'Radiant heater and crucible' ? `<path d="M259 ${sourceY + 26}h82" stroke="#edab62" stroke-width="5" stroke-dasharray="5 6"/>` : ''}
    ${config.ibad ? '<path d="m144 265 37-21 13 24-37 21Z" fill="url(#steel)" stroke="#c2ace3"/><path d="m187 254 111-113" stroke="#c49af9" stroke-width="2" stroke-dasharray="4 5"/><text x="126" y="303" fill="#d8b8fb" font-size="16">Ar⁺ gun</text>' : ''}
    <g id="chamber-particles"></g>
    <g fill="#bdd0e9" font-family="system-ui,sans-serif" font-size="17">
      <path d="M407 117h35" stroke="#7894b9"/><text x="576" y="115" text-anchor="end">Substrate</text>
      <text x="300" y="444" text-anchor="middle">${config.hardware}</text>
      <text x="498" y="309" font-size="14">To pump</text>
    </g>
    <g stroke="#8ca9ce" stroke-width="1" opacity=".75"><path d="M449 147v${sourceY - 155}m-5-${sourceY - 155}h10m-10 ${sourceY - 155}h10"/></g>
    <text x="443" y="${(sourceY + 147) / 2}" text-anchor="end" fill="#c6d9f1" font-size="17">L</text>
  </svg>`;
}

export function particleMarkup(config, settings, sample, seconds, active) {
  const sourceY = 285 + settings.distance * 2.1;
  const motion = seconds * .34;
  const scattering = 1 - sample.ballistic;
  const count = sample.gross > 1e-5 ? clamp(Math.round(12 + 10 * Math.log10(1 + sample.gross * 20)), 12, 41) : 0;
  const vapour = range(count, (i) => {
    const z = (motion * (.6 + random(i + 8)) + random(i * 7)) % 1;
    const start = 250 + random(i * 5 + 2) * 100;
    const end = 158 + random(i * 17 + 3) * 284;
    const lateral = Math.sin(z * (5 + random(i + 50) * 13)) * 32 * scattering;
    const x = start + (end - start) * z + lateral;
    const y = sourceY + (139 - sourceY) * z;
    const r = 2.3 + random(i + 6) * 1.65;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#8fc8ff" opacity="${active ? .9 : .65}"/>`;
  });
  if (config.family === 'evaporation') return vapour.join('');
  const sputtering = config.family === 'sputtering';
  const ions = sputtering ? clamp(Math.round(7 + settings.current * 21), 7, 28)
    : Math.round(25 * Math.min(1, settings.ionCurrent * 2.7));
  const paths = range(ions, (i) => {
    const z = (motion * (1.2 + random(i + 92)) + random(i * 117 + 5)) % 1;
    const startX = config.ibad ? 185 : 192 + random(i * 47 + 4) * 216;
    const endX = 217 + random(i * 23 + 4) * 165;
    const startY = sputtering ? sourceY - 105 - 22 * random(i + 3) : config.ibad ? 257 : 221 + 80 * random(i + 2);
    const endY = sputtering ? sourceY : 140;
    const x = startX + (endX - startX) * z;
    const y = startY + (endY - startY) * z;
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" fill="#1c2b49" stroke="#d7abff" stroke-width="1.35"><circle r="4.3"/><path d="M-2 0h4m-2-2v4"/></g>`;
  });
  const removed = range(Math.min(17, Math.round(sample.loss * 7)), (i) => {
    const z = (motion * 1.1 + random(i * 35 + 60)) % 1;
    const x = 225 + random(i * 13 + 19) * 150 + (z - .5) * 65 * (random(i + 62) - .5);
    return `<circle cx="${x.toFixed(1)}" cy="${(143 + z * 95).toFixed(1)}" r="2.4" fill="#f3a681" opacity="${(1 - .6 * z).toFixed(2)}"/>`;
  });
  return [...vapour, ...paths, ...removed].join('');
}

function axisLabel(n) {
  if (n === 0) return '0';
  if (Math.abs(n) < .01 || Math.abs(n) >= 1e4) return n.toExponential(0).replace('e+', 'e');
  return decimal(n, Math.abs(n) < 1 ? 2 : 1);
}

function pointsPath(points, px, py) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${px(x).toFixed(1)} ${py(y).toFixed(1)}`).join(' ');
}

export function chartMarkup({ title, xLabel, yLabel, xDomain, yDomain, log = false, lines, marker, baseline }) {
  const x0 = 59, x1 = 365, y0 = 38, y1 = 244;
  const px = (x) => x0 + (x1 - x0) * (x - xDomain[0]) / (xDomain[1] - xDomain[0]);
  const py = (y) => y1 - (y1 - y0) * (y - yDomain[0]) / (yDomain[1] - yDomain[0]);
  const grid = range(5, (i) => {
    const y = yDomain[0] + (yDomain[1] - yDomain[0]) * i / 4;
    const x = xDomain[0] + (xDomain[1] - xDomain[0]) * i / 4;
    return `<path d="M${x0} ${py(y)}H${x1}M${px(x)} ${y0}V${y1}" fill="none" stroke="var(--grid)"/>
      <text x="${x0 - 8}" y="${py(y) + 4}" text-anchor="end">${log ? sci(10 ** y, 0) : axisLabel(y)}</text>
      <text x="${px(x)}" y="${y1 + 20}" text-anchor="middle">${axisLabel(x)}</text>`;
  }).join('');
  const curves = lines.map((line) => `<path d="${pointsPath(line.points, px, py)}" stroke="${PALETTE[line.colour ?? 0]}" stroke-width="${line.dashed ? 2 : 2.8}" ${line.dashed ? 'stroke-dasharray="6 5"' : ''} fill="none" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const cursor = marker ? `<path d="M${px(marker[0])} ${y0}V${y1}" stroke="var(--muted)" stroke-opacity=".5" stroke-dasharray="3 4"/><circle cx="${px(marker[0])}" cy="${py(marker[1])}" r="5" fill="var(--plot)" stroke="var(--surface)" stroke-width="2"/>` : '';
  return `<svg class="chart" viewBox="0 0 390 295" role="img" aria-label="${title}. ${yLabel} by ${xLabel}.">
    <text class="major" x="11" y="19">${yLabel}</text>${grid}
    ${baseline !== undefined ? `<path d="M${x0} ${py(baseline)}H${x1}" stroke="var(--muted)" stroke-dasharray="4 5" opacity=".55"/>` : ''}
    <path d="M${x0} ${y0}V${y1}H${x1}" stroke="var(--muted)" opacity=".55" fill="none"/>${curves}${cursor}
    <text class="major" x="212" y="286" text-anchor="middle">${xLabel}</text>
  </svg>`;
}

export function growthPlot(history, time, net) {
  const current = history.at(-1)[1];
  const remaining = RUN_LENGTH - time;
  const projected = [[time, current], [RUN_LENGTH, Math.max(0, current + net * remaining)]];
  if (net < 0 && current > 0 && current + net * remaining < 0) projected.splice(1, 0, [time - current / net, 0]);
  const lines = [{points: history}, { points: projected, dashed: true }];
  const max = Math.max(.02, ...history.map(p => p[1]), projected.at(-1)[1]);
  return chartMarkup({ title: 'Film growth at centre', xLabel: 'Time t (s)', yLabel: 'Thickness h (nm)', xDomain: [0,RUN_LENGTH], yDomain: [0,max * 1.13], lines, marker: [time,current] });
}

export function profilePlot(current, forecast) {
  const measured = POSITIONS.map((x, i) => [x * 10, current[i]]);
  const projected = POSITIONS.map((x, i) => [x * 10, forecast[i]]);
  return chartMarkup({ title: 'Wafer thickness profile', xLabel: 'Position x (mm)', yLabel: 'Thickness h (nm)', xDomain: [-10 * WAFER_RADIUS_CM, 10 * WAFER_RADIUS_CM],
    yDomain: [0, Math.max(.02, ...current, ...forecast) * 1.13], lines: [{points: projected, dashed: true}, {points: measured}] });
}

export function sectionMarkup(shape, h, colour) {
  const base = 214;
  const height = clamp(19 * Math.log10(1 + h * 4), 4, 109);
  const top = base - height;
  const grainCount = shape.type === 'dense' ? 34 : 18;
  const grains = range(grainCount, (i) => {
    const step = 320 / grainCount;
    const x = 35 + i * step;
    if (shape.type === 'equiaxial') {
      return range(3, (row) => {
        const cy = top + height * (row + .5) / 3;
        const r = Math.min(step / 2, height / 7);
        const cx = x + step * (.42 + .17 * random(i + row * 50));
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colour}" opacity="${.48 + random(i + row) * .49}"/>`;
      }).join('');
    }
    const nx = x + step * .14;
    const tilt = random(i + 12) * 7 - 3.5;
    const stem = shape.type === 'porous' ? .26 : .69;
    return `<path d="M${nx + step * .43} ${base}h${step * stem}L${nx + step + tilt} ${top + random(i + 6) * 8}L${nx + tilt} ${top + random(i) * 9}Z" fill="${colour}" opacity="${.52 + random(i) * .45}"/>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 390 285" role="img" aria-label="Schematic cross-section. ${shape.name}. Centre thickness ${decimal(h)} nanometres.">
    <text class="major" x="25" y="28">${shape.name}</text>
    <path d="M35 83V230M355 83V230" stroke="var(--grid)" stroke-dasharray="4 5"/>
    <rect x="35" y="${base}" width="320" height="29" rx="3" fill="var(--substrate)"/>
    ${h > .0001 ? (shape.type === 'plain' ? `<rect x="35" y="${top}" width="320" height="${height}" fill="${colour}"/>` : grains) : '<text x="195" y="163" text-anchor="middle">Bare substrate · run the deposition</text>'}
    <text x="195" y="267" text-anchor="middle">Substrate · schematic cross-section</text>
    <text x="35" y="57">Centre thickness ${decimal(h)} nm</text>
  </svg>`;
}
