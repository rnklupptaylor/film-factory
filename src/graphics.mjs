import { POSITIONS, WAFER_RADIUS_CM } from './physics.mjs';

const PALETTE = ['var(--plot)', 'var(--loss)'];
const range = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
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

export function labelledPointsMarkup(markers, position, right, top) {
  const coincident = new Map();
  for (const marker of markers) {
    const [cx, cy] = position(marker.point);
    const key = `${cx.toFixed(1)}:${cy.toFixed(1)}`;
    if (!coincident.has(key)) coincident.set(key, { cx, cy, points: [] });
    coincident.get(key).points.push(marker);
  }
  return [...coincident.values()].map(({ cx, cy, points }) => {
    const symbols = points.slice(0, 3).map(({ colour }, i) =>
      `<circle class="comparison-point" cx="${cx}" cy="${cy}" r="${4 + 2.4 * i}" fill="${i ? 'none' : colour}" stroke="${i ? colour : 'var(--surface)'}"/>`).join('');
    const leftOfPoint = cx > right - 28;
    const number = points.length > 3 ? `${points.length} points` : points.map(({ label }) => label).join('/');
    const label = markers.length <= 12
      ? `<text class="comparison-point-number" x="${cx + (leftOfPoint ? -9 : 9)}" y="${cy + (cy < top + 12 ? 13 : -7)}" text-anchor="${leftOfPoint ? 'end' : 'start'}">${number}</text>` : '';
    const title = points.map(({ label, detail }) => `${label}. ${detail}`).join(' · ');
    return `<g><title>${title}</title>${symbols}${label}</g>`;
  }).join('');
}

export function chartMarkup({ title, xLabel, yLabel, xDomain, yDomain, log = false, xLog = false, lines = [], dots, marker, baseline }) {
  const x0 = 59, x1 = 365, y0 = 38, y1 = 244;
  const px = (x) => x0 + (x1 - x0) * (x - xDomain[0]) / (xDomain[1] - xDomain[0]);
  const py = (y) => y1 - (y1 - y0) * (y - yDomain[0]) / (yDomain[1] - yDomain[0]);
  const tickLabel = (value, logarithmic) => {
    if (logarithmic) return sci(10 ** value, 0);
    if (!dots || value === 0) return axisLabel(value);
    const magnitude = Math.abs(value);
    return magnitude < .001 || magnitude >= 1e4 ? sci(value, 2)
      : Number(value.toPrecision(4)).toString().replace('-', '−');
  };
  const grid = range(5, (i) => {
    const y = yDomain[0] + (yDomain[1] - yDomain[0]) * i / 4;
    const x = xDomain[0] + (xDomain[1] - xDomain[0]) * i / 4;
    return `<path d="M${x0} ${py(y)}H${x1}M${px(x)} ${y0}V${y1}" fill="none" stroke="var(--grid)"/>
      <text x="${x0 - 8}" y="${py(y) + 4}" text-anchor="end">${tickLabel(y, log)}</text>
      <text x="${px(x)}" y="${y1 + 20}" text-anchor="middle">${tickLabel(x, xLog)}</text>`;
  }).join('');
  const curves = lines.map((line) => `<path d="${pointsPath(line.points, px, py)}" stroke="${line.stroke ?? PALETTE[line.colour ?? 0]}" stroke-width="${line.dashed ? 2 : 2.8}" ${line.dashed ? 'stroke-dasharray="6 5"' : ''} fill="none" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const cursor = marker ? `<path d="M${px(marker[0])} ${y0}V${y1}" stroke="var(--muted)" stroke-opacity=".5" stroke-dasharray="3 4"/><circle cx="${px(marker[0])}" cy="${py(marker[1])}" r="5" fill="var(--plot)" stroke="var(--surface)" stroke-width="2"/>` : '';
  const points = dots ? labelledPointsMarkup(dots, ([x, y]) => [px(x), py(y)], x1, y0) : '';
  return `<svg class="chart" viewBox="0 0 390 295" role="img" aria-label="${title}. ${yLabel} by ${xLabel}.">
    <text class="major" x="11" y="19">${yLabel}</text>${grid}
    ${baseline !== undefined ? `<path d="M${x0} ${py(baseline)}H${x1}" stroke="var(--muted)" stroke-dasharray="4 5" opacity=".55"/>` : ''}
    <path d="M${x0} ${y0}V${y1}H${x1}" stroke="var(--muted)" opacity=".55" fill="none"/>${curves}${cursor}${points}
    <text class="major" x="212" y="286" text-anchor="middle">${xLabel}</text>
  </svg>`;
}

export function growthPlot(history, duration) {
  const max = Math.max(.02, ...history.map(p => p[1]));
  return chartMarkup({ title: 'Film growth at centre', xLabel: 'Time t (s)', yLabel: 'Thickness h (nm)', xDomain: [0,duration], yDomain: [0,max * 1.13],
    lines: [{ points: history }], marker: history.at(-1) });
}

export function profilePlot(profile) {
  const points = POSITIONS.map((x, i) => [x * 10, profile[i]]);
  return chartMarkup({ title: 'Wafer thickness profile', xLabel: 'Position x (mm)', yLabel: 'Thickness h (nm)', xDomain: [-10 * WAFER_RADIUS_CM, 10 * WAFER_RADIUS_CM],
    yDomain: [0, Math.max(.02, ...profile) * 1.13], lines: [{ points }] });
}
