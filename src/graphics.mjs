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
