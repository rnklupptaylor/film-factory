import { MATERIALS, POSITIONS, rates } from './physics.mjs';
import { hasAluminaRecipe } from './arcing.mjs';
import { SUBSTRATES, crystalFrequencyShift } from './instruments.mjs';
import { VARIANTS, controlGroups } from './content.mjs';
import { chartMarkup, sci } from './graphics.mjs';
import { makeMorphology } from './microstructure.mjs';
import { FilmLightbox } from './lightbox.mjs';
import { FilmMicroscope } from './microscope.mjs';
import { groupZoneModels, zoneDiagramMarkup, zoneModel } from './zones.mjs';
import { waferGraphAxes, waferGraphGroups, waferGraphRows, waferGraphDomain } from './wafer-graphs.mjs';
import { LIGHTBOX_COMPARE_LIMIT, WAFER_FILE_BYTES, WAFER_FILE_COUNT, readWaferFile, waferFile, waferFilename, waferClassification, waferCentre, waferIsClean, waferHasMixedFilm, waferMorphologyReason, waferOverheated } from './wafer-data.mjs';

const stockerStorage = 'film-factory-wafer-stocker-v1';
const stockerEl = (id) => document.getElementById(id);
const stockerDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const stockerColours = ['#408cef', '#e16e9d', '#36a580', '#e6984c', '#9d83df', '#8b9b37', '#c56f58', '#459da9'];
const morphologyPageSize = 4;
const shortWafer = (wafer) => wafer.id.slice(-5).toUpperCase();
const stockerMaterial = (key) => MATERIALS[key].formula ?? MATERIALS[key].name;
const stockerMode = (wafer) => `${wafer.mode === 'preview' ? 'Preview' : 'Growth'}${waferIsClean(wafer) ? ' · Pre-clean' : ''}`;
const stockerCentre = (wafer) => waferCentre(wafer.profile);
const stockerNum = (value, digits = 2) => value !== 0 && Math.abs(value) < 10 ** -digits
  ? sci(value, 1) : Number(value.toFixed(digits)).toString().replace('-', '−');
const stockerUniformity = (wafer) => stockerCentre(wafer) > 0 ? 100 * wafer.profile[0] / stockerCentre(wafer) : null;
const stockerLabel = (wafer) => `${wafer.profile.some((height) => height > 0) ? stockerMaterial(wafer.film) : 'Bare wafer'} · ${shortWafer(wafer)}`;
const stockerSettings = (wafer, settings = wafer.settings) => controlGroups(VARIANTS[wafer.variant], MATERIALS[settings.symbol]).flat();

function stockerSettingValue(config, settings, key, unit) {
  const value = settings[key];
  if (key === 'pressure') return `${sci(10 ** value)} ${unit}`;
  if (key === 'bias' && !config.ibad && value !== 0) return `−${value} ${unit}`;
  return `${stockerNum(value)} ${unit}`;
}

function stockerSourceSettings(wafer) {
  return controlGroups(VARIANTS[wafer.variant], MATERIALS[wafer.settings.symbol])[0].map(([key, , symbol, , , , unit]) =>
    `${symbol} ${stockerSettingValue(VARIANTS[wafer.variant], wafer.settings, key, unit)}`).join(' · ');
}

function stockerRecipeMarkup(wafer) {
  const config = VARIANTS[wafer.variant];
  let elapsed = 0;
  const common = stockerSettings(wafer).map(([key, label, , , , , unit]) =>
    `<div><dt>${label}</dt><dd>${stockerSettingValue(config, wafer.settings, key, unit)}</dd></div>`).join('');
  const steps = wafer.recipes.map(({ settings, duration, film }, index) => {
    const start = elapsed;
    elapsed += duration;
    const former = wafer.recipes[index - 1]?.settings;
    const values = stockerSettings(wafer, settings).filter(([key]) => former?.[key] !== settings[key])
      .map(([key, label, , , , , unit]) => `${label} ${stockerSettingValue(config, settings, key, unit)}`);
    if (!former || former.preclean !== settings.preclean) values.unshift(settings.preclean ? 'Pre-clean' : 'Deposition');
    return `<li><strong>${stockerNum(start, 1)}–${stockerNum(elapsed, 1)} s</strong> · ${film ? stockerMaterial(film) : 'Coating source off'} · ${values.join(' · ')}</li>`;
  }).join('');
  return `<dl class="wafer-settings">${common}</dl><p>Source and Zone model use the final settings. Time plots show the saved stage. The steps below include any preceding stages retained on this wafer.</p><ol class="wafer-steps">${steps}</ol>`;
}

const stockerColumns = [
  ['wafer', 'Wafer', stockerLabel],
  ['technique', 'Technique', (wafer) => waferClassification(wafer).technique],
  ['subtechnique', 'Subtechnique', (wafer) => waferClassification(wafer).subtechnique],
  ['variant', 'Method', (wafer) => waferClassification(wafer).method],
  ['target', 'Source / target', (wafer) => stockerMaterial(wafer.settings.symbol)],
  ['substrate', 'Substrate', (wafer) => SUBSTRATES[wafer.settings.wafer].name],
  ['mode', 'Mode', stockerMode],
  ['duration', 'Stage (s)', (wafer) => wafer.duration],
  ['centre', 'Centre h (nm)', stockerCentre, stockerNum],
  ['temperature', 'Tₛ (K)', (wafer) => wafer.settings.substrate],
  ['pressure', 'p (mbar)', (wafer) => 10 ** wafer.settings.pressure, (value) => sci(value)],
  ['gap', 'L (cm)', (wafer) => wafer.settings.distance],
  ['source', 'Source settings', stockerSourceSettings],
  ['gas', 'Reactive gas', (wafer) => VARIANTS[wafer.variant].arc ? 'N₂' : VARIANTS[wafer.variant].reactive
    ? `N₂ · ${wafer.settings.nitrogen}%` : VARIANTS[wafer.variant].ito
      || (wafer.settings.oxygen > 0 && hasAluminaRecipe(VARIANTS[wafer.variant], wafer.settings.symbol)) ? `O₂ · ${wafer.settings.oxygen}%` : '—'],
  ['created', 'Added', (wafer) => wafer.created, (value) => stockerDate.format(value)],
];

function stockerComparisonTable(wafers, rows) {
  return `<div class="stocker-table-wrap comparison-table" tabindex="0" role="region" aria-label="Comparison measurements">
    <table class="stocker-table"><thead><tr><th scope="col">Measurement</th>${wafers.map((wafer) => `<th scope="col">${stockerLabel(wafer)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([title, values]) => `<tr><th scope="row">${title}</th>${values.map((value) => `<td>${value}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function stockerOverlays(wafers, series) {
  if (wafers.length > stockerColours.length) return '<p class="stocker-note">Select up to eight wafers for readable plot overlays. The table includes every selected wafer.</p>';
  const plots = series.map(({ curves, ...axes }) => {
    const lines = curves.map((points, index) => ({ points, stroke: stockerColours[index], dashed: index % 2 !== 0 }));
    return `<figure class="comparison-chart"><figcaption>${axes.title}</figcaption>${chartMarkup({ ...axes, lines })}</figure>`;
  }).join('');
  const legend = wafers.map((wafer, index) => `<li><span style="--series:${stockerColours[index]}" class="${index % 2 ? 'dashed' : ''}"></span>${stockerLabel(wafer)}</li>`).join('');
  return `<ul class="comparison-legend" aria-label="Plot legend">${legend}</ul><div class="comparison-charts">${plots}</div>`;
}

function compareWaferThickness(wafers) {
  const clean = wafers.map(waferIsClean);
  const time = Math.max(...wafers.map((wafer) => wafer.duration));
  const rows = [
    ['Centre thickness (nm)', wafers.map((wafer) => stockerNum(stockerCentre(wafer)))],
    ['Edge thickness (nm)', wafers.map((wafer) => stockerNum(wafer.profile[0]))],
    ['Edge / centre (%)', wafers.map((wafer) => stockerUniformity(wafer) === null ? 'Bare at centre' : stockerNum(stockerUniformity(wafer), 1))],
    ['Stage duration (s)', wafers.map((wafer) => wafer.duration)],
    ['Average net rate, saved stage (nm/s)', wafers.map((wafer) => stockerNum((stockerCentre(wafer) - wafer.growth[0][1]) / wafer.duration))],
  ];
  const series = [{
    title: 'Thickness across the 100 mm wafer', xLabel: 'Position x (mm)', yLabel: 'Thickness h (nm)', xDomain: [-50, 50],
    yDomain: [0, Math.max(.02, ...wafers.map((wafer) => Math.max(...wafer.profile))) * 1.12],
    curves: wafers.map((wafer) => POSITIONS.map((x, i) => [x * 10, wafer.profile[i]])),
  }];
  const notes = [];
  if (clean.every(Boolean)) {
    rows.push(['Final surface residue (%)', wafers.map((wafer) => stockerNum(wafer.residue.at(-1)[1], 1))]);
    series.push({ title: 'Surface residue during pre-clean', xLabel: 'Stage time (s)', yLabel: 'Residue remaining (%)', xDomain: [0, time], yDomain: [0, 100],
      curves: wafers.map((wafer) => wafer.residue) });
  } else if (clean.some(Boolean)) {
    notes.push('The time plots use different quantities for pre-clean and deposition. Select only pre-cleans for residue, or only deposition stages for growth.');
  } else {
    series.push({ title: 'Centre thickness through the saved stage', xLabel: 'Stage time (s)', yLabel: 'Thickness h (nm)', xDomain: [0, time],
      yDomain: [0, Math.max(.02, ...wafers.map((wafer) => wafer.growth.reduce((peak, [, h]) => Math.max(peak, h), 0))) * 1.12],
      curves: wafers.map((wafer) => wafer.growth) });
  }
  if (wafers.some((wafer) => wafer.duration !== time || wafer.growth[0][1] > 0)) {
    notes.push('Different stage durations or starting thicknesses affect endpoint thickness. Compare the curves at a common time, or use the average net rates.');
  }
  return notes.map((note) => `<p class="stocker-note">${note}</p>`).join('') + stockerComparisonTable(wafers, rows) + stockerOverlays(wafers, series);
}

function compareWaferProcess(wafers) {
  const models = wafers.map((wafer) => rates(VARIANTS[wafer.variant], wafer.settings, MATERIALS[wafer.settings.symbol]));
  const rows = [
    ['Technique', wafers.map((wafer) => waferClassification(wafer).technique)],
    ['Subtechnique', wafers.map((wafer) => waferClassification(wafer).subtechnique)],
    ['Method', wafers.map((wafer) => waferClassification(wafer).method)],
    ['Substrate', wafers.map((wafer) => SUBSTRATES[wafer.settings.wafer].name)],
    ['Substrate temperature (K)', wafers.map((wafer) => wafer.settings.substrate)],
    ['Working pressure (mbar)', wafers.map((wafer) => sci(10 ** wafer.settings.pressure))],
    ['Source distance (cm)', wafers.map((wafer) => wafer.settings.distance)],
    ['Source settings', wafers.map(stockerSourceSettings)],
    ['Final incoming rate (nm/s)', models.map((model) => stockerNum(model.gross))],
    ['Final resputter rate (nm/s)', models.map((model) => stockerNum(model.loss))],
    ['QCM final shift (Hz)', wafers.map((wafer) => stockerNum(crystalFrequencyShift(wafer.qcm.mass), 1))],
    ['QCM areal mass (µg/cm²)', wafers.map((wafer) => stockerNum(wafer.qcm.mass * 1e5))],
    ['Tooling factor (%)', wafers.map((wafer) => wafer.qcm.tooling)],
  ];
  const notes = ['Rates and conditions describe each saved recipe at the end of the stage. QCM mass and frequency shift are cumulative.'];
  if (wafers.some((wafer) => wafer.qcm.tooling !== wafers[0].qcm.tooling || wafer.film !== wafers[0].film || waferHasMixedFilm(wafer))) {
    notes.push('QCM indicated thickness depends on the tooling factor and coating density. Use the same factor and a single common film material, or compare the raw mass and frequency shift instead.');
  } else {
    rows.push(['QCM indicated thickness (nm)', wafers.map((wafer) => stockerNum(wafer.qcm.height * wafer.qcm.tooling / 100))]);
  }
  if (models.every((model) => model.yieldValue !== undefined) && wafers.every((wafer) => wafer.settings.symbol === wafers[0].settings.symbol)) {
    rows.push(['Effective sputtering yield (atoms/ion)', models.map((model) => stockerNum(model.yieldValue))]);
  } else if (models.some((model) => model.yieldValue !== undefined)) {
    notes.push('Use sputtering recipes with the same target material to compare effective sputtering yields.');
  }
  if (models.every((model) => model.ionEnergy !== undefined)) {
    rows.push(['Final effective substrate ion energy (eV)', models.map((model) => stockerNum(model.ionEnergy, 1))]);
  }
  return notes.map((note) => `<p class="stocker-note">${note}</p>`).join('') + stockerComparisonTable(wafers, rows);
}

function compareWaferZones(wafers) {
  const entries = wafers.map((wafer, index) => {
    const config = VARIANTS[wafer.variant];
    const sample = rates(config, wafer.settings, MATERIALS[wafer.settings.symbol]);
    return { wafer, model: zoneModel(config, wafer.settings, sample), label: index + 1, colour: stockerColours[index % stockerColours.length] };
  });
  const groups = groupZoneModels(entries);
  const charts = groups.map((group) => {
    const model = group[0].model;
    const title = group.every((entry) => entry.model.name === model.name) ? model.name : 'Anders · ion-assistance projection';
    const markers = group.map(({ wafer, model, label, colour }) => ({
      point: model.point, label, colour, detail: `${stockerLabel(wafer)} · ${model.operating}`,
    }));
    return `<figure class="comparison-chart"><figcaption>${title}</figcaption>
      ${zoneDiagramMarkup({ ...model, name: title }, markers)}
      <ul class="comparison-zone-points" aria-label="Operating points">${group.map(({ wafer, model, label, colour }) =>
      `<li><span class="zone-legend-number" style="--series:${colour}">${label}</span>
        <div><strong>${stockerLabel(wafer)}</strong><span>${model.operating}</span><span>${model.reading}</span>
        <small>${model.detail} ${model.hot ? model.context : ''}</small></div></li>`).join('')}</ul></figure>`;
  }).join('');
  const scope = groups.length > 1 ? ' The selected recipes use different models or study ranges, so their points are grouped on separate diagrams.' : '';
  return `<p class="stocker-note">Points use each wafer’s final recorded settings. Coincident points share a marker.${scope}</p>
    <div class="comparison-charts comparison-zone-charts">${charts}</div>`;
}

function stockerSurfaceReadings(wafers, surfaces) {
  const reason = waferMorphologyReason(wafers, surfaces);
  const rows = [
    ['Modelled area covered (%)', surfaces.map((surface) => stockerNum(surface.coverage * 100, 1))],
    ['Voids in film envelope (%)', surfaces.map((surface) => !surface.count ? 'Bare' : stockerNum(surface.voidFraction * 100, 1))],
    ['Vertical model cell (nm)', surfaces.map((surface) => stockerNum(surface.resolution))],
  ];
  if (!reason) rows.push(['Modelled RMS roughness S<sub>q</sub> (nm)', surfaces.map((surface) => stockerNum(surface.roughnessNm))]);
  return stockerComparisonTable(wafers, rows) + (reason ? `<p class="stocker-note">${reason}</p>` : '');
}

function waferGraphOptions(selected) {
  return waferGraphGroups.map(([group, axes]) => `<optgroup label="${group}">${Object.entries(axes).map(([id, axis]) =>
    `<option value="${id}"${selected === id ? ' selected' : ''}>${axis.label}</option>`).join('')}</optgroup>`).join('');
}

function stockerGraphMarkup(wafers, xKey, yKey, surfaces) {
  const x = waferGraphAxes[xKey];
  const y = waferGraphAxes[yKey];
  const axes = [xKey, yKey];
  const format = (axis, value) => value === null ? '—' : axis.log ? sci(value, 3) : stockerNum(value, 3);
  const rows = waferGraphRows(wafers, xKey, yKey, surfaces).map((row, i) => ({
    ...row, index: i, label: i + 1, colour: stockerColours[i % stockerColours.length],
  }));
  const plotted = rows.filter((row) => row.x !== null && row.y !== null);
  const chart = plotted.length ? chartMarkup({
    title: 'Saved wafer measurements',
    xLabel: `${x.label}${x.log ? ' · log scale' : ''}`,
    yLabel: `${y.label}${y.log ? ' · log scale' : ''}`,
    xDomain: waferGraphDomain(plotted.map((row) => row.x), x.log),
    yDomain: waferGraphDomain(plotted.map((row) => row.y), y.log),
    xLog: x.log, log: y.log,
    dots: plotted.map((row) => ({
      point: [x.log ? Math.log10(row.x) : row.x, y.log ? Math.log10(row.y) : row.y],
      colour: row.colour, label: row.label,
      detail: `${stockerLabel(row.wafer)} · x ${format(x, row.x)} · y ${format(y, row.y)}`,
    })),
  }) : '';
  const notes = [];
  if (plotted.length < rows.length) {
    notes.push(`${plotted.length} of ${rows.length} wafers have both values. A dash marks an unavailable or inapplicable value.`);
  }
  if (axes.includes('roughness') && plotted.length > 1) {
    const reason = waferMorphologyReason(plotted.map((row) => row.wafer), plotted.map((row) => surfaces[row.index]));
    if (reason) notes.push(reason);
  }
  if (axes.some((key) => key === 'grainCount' || key === 'grainDiameter')) {
    notes.push('Grain readings describe exposed crystalline regions on the model grid. The lateral scale is uncalibrated.');
  }
  const plottedWafers = plotted.map((row) => row.wafer);
  if (axes.includes('qcmThickness') && plottedWafers.some((wafer) =>
    wafer.qcm.tooling !== plottedWafers[0].qcm.tooling || wafer.film !== plottedWafers[0].film || waferHasMixedFilm(wafer))) {
    notes.push('QCM indicated thickness depends on tooling and film density. Use areal mass or frequency shift to compare readings across different calibrations or materials.');
  }
  const plot = chart ? `<figure class="comparison-chart wafer-graph">
    ${chart}<figcaption>One point per saved wafer. Settings use the final recorded recipe.</figcaption></figure>`
    : '<p class="stocker-note">Choose another axis pair to plot these wafers.</p>';
  return notes.map((note) => `<p class="stocker-note">${note}</p>`).join('') + plot
    + `<div class="stocker-table-wrap comparison-table" tabindex="0" role="region" aria-label="Wafer graph values">
      <table class="stocker-table"><thead><tr><th scope="col">Wafer</th><th scope="col">x · ${x.label}</th><th scope="col">y · ${y.label}</th></tr></thead>
      <tbody>${rows.map((row) => `<tr><th scope="row"><span class="zone-legend-number" style="--series:${row.colour}">${row.label}</span> ${stockerLabel(row.wafer)}</th>
        <td>${format(x, row.x)}</td><td>${format(y, row.y)}</td></tr>`).join('')}</tbody></table></div>`;
}

class WaferSurfaceQueue {
  constructor(workerCode) {
    try {
      const url = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
      try { this.worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
      this.worker.onmessage = ({ data }) => this.done?.(data);
      this.worker.onerror = () => {
        this.worker.terminate();
        this.worker = undefined;
        this.calculateFallback();
      };
    } catch { /* Local fallback uses the same deposition model. */ }
  }

  measure(surface, summaryOnly = true) {
    this.input = { ...surface, summaryOnly, includeGrains: true };
    return new Promise((resolve) => {
      this.done = resolve;
      if (this.worker) this.worker.postMessage(this.input);
      else this.calculateFallback();
    });
  }

  calculateFallback() {
    this.timer = setTimeout(() => {
      if (this.done) this.done(makeMorphology(this.input));
    }, 0);
  }

  dispose() {
    this.worker?.terminate();
    clearTimeout(this.timer);
    this.done?.(null);
    this.done = undefined;
  }
}

export class WaferStocker {
  constructor({ inspect, finishInspection, restore, workerCode, version }) {
    this.callbacks = { inspect, finishInspection, restore };
    this.workerCode = workerCode;
    this.version = version;
    this.wafers = [];
    this.selected = new Set();
    this.sort = { key: 'created', direction: -1 };
    this.surfaces = new WeakMap();
    this.lightboxes = [];
    this.microscopes = [];
    this.graphAxes = { x: 'substrate', y: 'centre' };
    try {
      const saved = localStorage.getItem(stockerStorage);
      if (saved) this.wafers = readWaferFile(saved).wafers;
    } catch {
      this.notify('The browser stocker could not be read. You can reload a previously saved wafer file.');
    }

    this.table = stockerEl('wafer-rows');
    this.table.addEventListener('click', (event) => this.selectRow(event));
    this.table.addEventListener('dblclick', (event) => {
      const row = event.target.closest('tr[data-wafer-id]');
      if (row && !event.target.matches('input')) this.inspect(this.wafers.find((wafer) => wafer.id === row.dataset.waferId));
    });
    stockerEl('wafer-columns').addEventListener('click', (event) => {
      const button = event.target.closest('[data-sort]');
      if (!button) return;
      const key = button.dataset.sort;
      this.sort = { key, direction: key === this.sort.key ? -this.sort.direction : 1 };
      this.render();
      stockerEl('wafer-columns').querySelector(`[data-sort="${key}"]`).focus();
    });
    stockerEl('wafer-select-all').addEventListener('click', () => {
      this.selected = new Set(this.visible.map((wafer) => wafer.id));
      this.updateSelection();
    });
    stockerEl('wafer-select-none').addEventListener('click', () => {
      this.selected.clear();
      this.anchor = undefined;
      this.updateSelection();
    });
    stockerEl('wafer-inspect-button').addEventListener('click', () => this.inspect(this.selection()[0]));
    stockerEl('wafer-compare-button').addEventListener('click', () => this.compare(this.selection()));
    stockerEl('wafer-save').addEventListener('click', () => stockerEl('wafer-export').showModal());
    stockerEl('wafer-export-form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.save();
    });
    stockerEl('wafer-import').addEventListener('click', () => stockerEl('wafer-file').click());
    stockerEl('wafer-file').addEventListener('change', (event) => this.reload(event.target));
    stockerEl('wafer-remove').addEventListener('click', () => this.remove());
    stockerEl('wafer-inspector').addEventListener('close', finishInspection);
    stockerEl('wafer-restore').addEventListener('click', () => {
      stockerEl('wafer-inspector').close();
      restore(this.inspected);
    });
    stockerEl('wafer-comparison').addEventListener('close', () => this.clearComparison());
    stockerEl('wafer-compare-tabs').addEventListener('click', (event) => {
      const next = event.target.closest('[data-compare]')?.dataset.compare;
      if (next && next !== this.comparisonTab) this.showComparison(next);
    });
    document.querySelectorAll('[data-wafer-close]').forEach((button) => {
      button.addEventListener('click', () => button.closest('dialog').close());
    });
  }

  closeDialogs() {
    for (const id of ['wafer-inspector', 'wafer-comparison', 'wafer-export']) {
      const dialog = stockerEl(id);
      if (dialog.open) dialog.close();
    }
  }

  notify(message) {
    const status = stockerEl('wafer-notice');
    status.textContent = message;
    status.hidden = !message;
  }

  persist(message) {
    try {
      localStorage.setItem(stockerStorage, JSON.stringify(waferFile('Local wafer stocker', this.wafers)));
    } catch {
      this.notify(`${message} Browser storage is unavailable or full. Save selected wafers to keep a file copy.`);
      return;
    }
    this.notify(message);
  }

  add(wafer) {
    if (this.wafers.some(({ id }) => id === wafer.id)) return false;
    this.wafers.push(wafer);
    this.persist(`Added ${stockerLabel(wafer)}.`);
    return true;
  }

  render() {
    const { key, direction } = this.sort;
    const [, , valueFor] = stockerColumns.find(([id]) => id === key);
    this.visible = [...this.wafers].sort((a, b) => {
      const x = valueFor(a);
      const y = valueFor(b);
      return direction * (typeof x === 'number' ? x - y : x.localeCompare(y));
    });
    stockerEl('wafer-columns').innerHTML = `<tr><th scope="col"><span class="visually-hidden">Select</span></th>${stockerColumns.map(([id, name]) =>
      `<th scope="col"${id === key ? ` aria-sort="${direction === 1 ? 'ascending' : 'descending'}"` : ''}><button type="button" data-sort="${id}">${name}${id === key ? ` <span aria-hidden="true">${direction === 1 ? '↑' : '↓'}</span>` : ''}</button></th>`).join('')}</tr>`;
    this.table.innerHTML = this.visible.map((wafer) => `<tr data-wafer-id="${wafer.id}"><td><input type="checkbox" aria-label="Select ${stockerLabel(wafer)}"></td>
      ${stockerColumns.map(([id, , valueFor, format]) => {
        const value = valueFor(wafer);
        const text = format ? format(value) : value;
        return id === 'wafer' ? `<th scope="row">${text}</th>` : `<td>${text}</td>`;
      }).join('')}</tr>`).join('');
    stockerEl('wafer-table-wrap').hidden = !this.visible.length;
    stockerEl('wafer-empty').hidden = !!this.visible.length;
    this.updateSelection();
  }

  updateSelection() {
    for (const row of this.table.rows) {
      const selected = this.selected.has(row.dataset.waferId);
      row.classList.toggle('is-selected', selected);
      row.querySelector('input').checked = selected;
    }
    const count = this.selected.size;
    stockerEl('wafer-count').textContent = this.wafers.length ? `${count} selected · ${this.wafers.length} stored. Double-click a row to inspect it.` : '';
    stockerEl('wafer-inspect-button').hidden = count !== 1;
    stockerEl('wafer-compare-button').hidden = count < 2;
    stockerEl('wafer-select-all').disabled = count === this.wafers.length;
    for (const id of ['wafer-select-none', 'wafer-save', 'wafer-remove']) stockerEl(id).disabled = !count;
  }

  selectRow(event) {
    const row = event.target.closest('tr[data-wafer-id]');
    if (!row) return;
    const id = row.dataset.waferId;
    const modified = event.ctrlKey || event.metaKey;
    const from = this.visible.findIndex((wafer) => wafer.id === this.anchor);
    if (event.shiftKey && from >= 0) {
      const to = this.visible.findIndex((wafer) => wafer.id === id);
      if (!modified) this.selected.clear();
      for (const wafer of this.visible.slice(Math.min(from, to), Math.max(from, to) + 1)) this.selected.add(wafer.id);
    } else {
      if (modified || event.target.matches('input')) {
        if (this.selected.has(id)) this.selected.delete(id);
        else this.selected.add(id);
      } else {
        this.selected = new Set([id]);
      }
      this.anchor = id;
    }
    this.updateSelection();
  }

  selection() {
    return this.visible.filter((wafer) => this.selected.has(wafer.id));
  }

  inspect(wafer) {
    if (!wafer) return;
    this.inspected = wafer;
    stockerEl('wafer-inspector-title').textContent = stockerLabel(wafer);
    const warnings = [
      waferHasMixedFilm(wafer) ? 'Multiple coating compositions' : '',
      waferOverheated(wafer) ? 'Above substrate thermal reference during the run' : '',
      this.version === wafer.version ? '' : `Saved with v${wafer.version}. Reconstructed views use the current model.`,
    ].filter(Boolean);
    const { technique, subtechnique, method } = waferClassification(wafer);
    stockerEl('wafer-inspector-summary').textContent = [technique, subtechnique, method, SUBSTRATES[wafer.settings.wafer].name,
      `${wafer.duration} s ${stockerMode(wafer).toLowerCase()}`, ...warnings].join(' · ');
    stockerEl('wafer-recipe-body').innerHTML = stockerRecipeMarkup(wafer);
    stockerEl('wafer-inspector').showModal();
    this.callbacks.inspect(wafer);
  }

  remove() {
    const count = this.selected.size;
    if (!count || !confirm(`Remove ${count} selected ${count === 1 ? 'wafer' : 'wafers'} from this browser’s stocker?`)) return;
    this.wafers = this.wafers.filter((wafer) => !this.selected.has(wafer.id));
    this.selected.clear();
    this.anchor = undefined;
    this.persist(`Removed ${count} ${count === 1 ? 'wafer' : 'wafers'}.`);
    this.render();
  }

  save() {
    const input = stockerEl('wafer-collection-title');
    const title = input.value.trim();
    if (!title) {
      input.value = '';
      input.reportValidity();
      return;
    }
    const wafers = this.selection();
    const filename = waferFilename(title);
    const blob = new Blob([JSON.stringify(waferFile(title, wafers))], { type: 'application/json' });
    if (wafers.length > WAFER_FILE_COUNT || blob.size > WAFER_FILE_BYTES) {
      stockerEl('wafer-export').close();
      this.notify('The export is too large to reload. Save the selected wafers in smaller groups.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    stockerEl('wafer-export').close();
    input.value = '';
    this.notify(`Saved ${wafers.length} ${wafers.length === 1 ? 'wafer' : 'wafers'} as ${filename}.`);
  }

  async reload(input) {
    const file = input.files[0];
    if (!file) return;
    input.value = '';
    try {
      if (file.size > WAFER_FILE_BYTES) throw new Error('Wafer files must be 20 MB or smaller.');
      const { title, wafers } = readWaferFile(await file.text());
      const known = new Set(this.wafers.map((wafer) => wafer.id));
      let added = 0;
      for (const wafer of wafers) {
        if (known.has(wafer.id)) continue;
        known.add(wafer.id);
        this.wafers.push(wafer);
        added++;
      }
      this.persist(`Loaded ${added} of ${wafers.length} wafers from “${title}”.${added < wafers.length ? ' Duplicate wafers were skipped.' : ''}`);
      this.render();
    } catch (error) {
      this.notify(error instanceof SyntaxError ? 'The selected file is not valid JSON.' : error.message);
    }
  }

  compare(wafers) {
    if (wafers.length < 2) return;
    this.compared = wafers;
    stockerEl('wafer-comparison-summary').textContent = `${wafers.length} selected wafers`;
    stockerEl('wafer-comparison').showModal();
    this.showComparison('thickness');
  }

  clearComparison() {
    this.surfaceQueue?.dispose();
    this.surfaceQueue = undefined;
    for (const viewer of this.lightboxes) viewer.dispose();
    this.lightboxes = [];
    for (const viewer of this.microscopes) viewer.dispose();
    this.microscopes = [];
  }

  async showComparison(tab) {
    this.clearComparison();
    this.comparisonTab = tab;
    for (const button of stockerEl('wafer-compare-tabs').querySelectorAll('[data-compare]')) {
      button.setAttribute('aria-pressed', String(button.dataset.compare === tab));
    }
    const wafers = this.compared;
    const body = stockerEl('wafer-comparison-body');
    body.scrollTop = 0;
    if (tab === 'thickness' || tab === 'process') {
      body.innerHTML = tab === 'thickness' ? compareWaferThickness(wafers) : compareWaferProcess(wafers);
      return;
    }
    if (tab === 'zones') {
      body.innerHTML = compareWaferZones(wafers);
      return;
    }
    if (tab === 'graphs') {
      this.openGraphs(body, wafers);
      return;
    }
    if (tab === 'surface') {
      this.openMorphologyComparison(body, wafers);
      return;
    }
    if (wafers.length > LIGHTBOX_COMPARE_LIMIT) {
      body.innerHTML = `<p class="stocker-note">Select 2–${LIGHTBOX_COMPARE_LIMIT} wafers for a responsive Lightbox comparison. The other comparison views include all selected wafers.</p>`;
      return;
    }
    body.innerHTML = '<p class="stocker-note" role="status">Calculating saved film surfaces…</p>';
    const queue = new WaferSurfaceQueue(this.workerCode);
    this.surfaceQueue = queue;
    const surfaces = await this.measureComparison(wafers, queue);
    if (!surfaces || this.surfaceQueue !== queue) return;
    queue.dispose();
    this.surfaceQueue = undefined;
    this.renderLightboxes(body, wafers, surfaces);
  }

  async measureComparison(wafers, queue) {
    const surfaces = [];
    for (const wafer of wafers) {
      const surface = this.surfaces.get(wafer) ?? await queue.measure(wafer.surface);
      if (this.surfaceQueue !== queue || !surface) return;
      this.surfaces.set(wafer, surface);
      surfaces.push(surface);
    }
    return surfaces;
  }

  openGraphs(body, wafers) {
    body.innerHTML = `<div class="wafer-graph-axes">
      <label>Abscissa (x)<select data-wafer-axis="x">${waferGraphOptions(this.graphAxes.x)}</select></label>
      <label>Ordinate (y)<select data-wafer-axis="y">${waferGraphOptions(this.graphAxes.y)}</select></label>
    </div><div class="wafer-graph-body"></div>`;
    const plot = body.querySelector('.wafer-graph-body');
    body.querySelector('.wafer-graph-axes').addEventListener('change', (event) => {
      this.graphAxes[event.target.dataset.waferAxis] = event.target.value;
      this.renderGraph(plot, wafers);
    });
    this.renderGraph(plot, wafers);
  }

  async renderGraph(plot, wafers) {
    this.clearComparison();
    const { x, y } = this.graphAxes;
    let surfaces = [];
    if (waferGraphAxes[x].surface || waferGraphAxes[y].surface) {
      if (wafers.every((wafer) => this.surfaces.has(wafer))) {
        surfaces = wafers.map((wafer) => this.surfaces.get(wafer));
      } else {
        plot.innerHTML = '<p class="stocker-note" role="status">Calculating saved film surfaces…</p>';
        const queue = new WaferSurfaceQueue(this.workerCode);
        this.surfaceQueue = queue;
        surfaces = await this.measureComparison(wafers, queue);
        if (!surfaces || this.surfaceQueue !== queue) return;
        queue.dispose();
        this.surfaceQueue = undefined;
      }
    }
    plot.innerHTML = stockerGraphMarkup(wafers, x, y, surfaces);
  }

  openMorphologyComparison(body, wafers) {
    this.microscopeStyle = 'sem';
    this.microscopeView = 'tilt';
    const groups = Math.ceil(wafers.length / morphologyPageSize);
    const selector = groups > 1 ? `<label class="morphology-group">Wafer group <select data-morphology-group>
      ${Array.from({ length: groups }, (_, index) => {
        const first = index * morphologyPageSize + 1;
        const last = Math.min(first + morphologyPageSize - 1, wafers.length);
        return `<option value="${index}">${first === last ? first : `${first}–${last}`} of ${wafers.length}</option>`;
      }).join('')}</select></label>` : '';
    body.innerHTML = `<div class="stocker-buttons comparison-morph-tools">
      <nav class="seg" aria-label="Morphology appearance">
        <button type="button" data-morph-style="sem" aria-pressed="true">SEM</button>
        <button type="button" data-morph-style="grains" aria-pressed="false">Grains</button>
      </nav>
      <nav class="seg" aria-label="Morphology view">
        <button type="button" data-morph-view="tilt">Tilt</button>
        <button type="button" data-morph-view="top">Top</button>
      </nav>
      ${selector}</div>
      <p class="stocker-note">Drag any view to rotate all wafers in its group at the same grid scale. Grain colours are local to each wafer. Dimensions are in model cells.</p>
      <div id="comparison-microscopes"></div>
      <div id="comparison-morphology-readings" class="comparison-morphology-readings"></div>`;
    const tools = body.querySelector('.comparison-morph-tools');
    tools.addEventListener('click', (event) => {
      const { morphStyle, morphView } = event.target.dataset;
      if (morphStyle) {
        this.microscopeStyle = morphStyle;
        for (const button of tools.querySelectorAll('[data-morph-style]')) {
          button.setAttribute('aria-pressed', String(morphStyle === button.dataset.morphStyle));
        }
        for (const viewer of this.microscopes) viewer.setStyle(morphStyle);
      } else if (morphView) {
        this.microscopeView = morphView;
        this.microscopes[0]?.setView(morphView);
      }
    });
    tools.querySelector('[data-morphology-group]')?.addEventListener('change', (event) =>
      this.renderMicroscopeGroup(wafers, Number(event.target.value)));
    this.renderMicroscopeGroup(wafers, 0);
  }

  async renderMicroscopeGroup(wafers, page) {
    this.clearComparison();
    const start = page * morphologyPageSize;
    const group = wafers.slice(start, start + morphologyPageSize);
    const stage = stockerEl('comparison-microscopes');
    const readings = stockerEl('comparison-morphology-readings');
    stage.innerHTML = '<p class="stocker-note" role="status">Reconstructing saved micrographs…</p>';
    const queue = new WaferSurfaceQueue(this.workerCode);
    this.surfaceQueue = queue;
    const models = [];
    for (const wafer of group) {
      const model = await queue.measure(wafer.surface, false);
      if (this.surfaceQueue !== queue || !model) return;
      models.push(model);
      const { mesh, tops, grainMap, ...stats } = model;
      this.surfaces.set(wafer, stats);
    }
    this.renderMicroscopes(stage, group, models);
    if (!readings.hasChildNodes()) readings.innerHTML = '<p class="stocker-note" role="status">Calculating comparison measurements…</p>';
    const surfaces = await this.measureComparison(wafers, queue);
    if (this.surfaceQueue !== queue || !surfaces) return;
    queue.dispose();
    this.surfaceQueue = undefined;
    readings.innerHTML = stockerSurfaceReadings(wafers, surfaces);
  }

  renderMicroscopes(stage, group, models) {
    stage.innerHTML = `<div class="comparison-microscopes">${group.map((wafer) =>
      `<figure><figcaption>${stockerLabel(wafer)}</figcaption>
        <canvas tabindex="0" role="img"></canvas><p class="instrument-note"></p></figure>`).join('')}</div>`;
    const scaleHeight = Math.max(...models.map(({ highest }) => highest));
    this.microscopes = [...stage.querySelectorAll('figure')].map((figure, index) => {
      const viewer = new FilmMicroscope(figure.querySelector('canvas'), figure.querySelector('p'), null, {
        scaleHeight, pixelLimit: 135000, shareCamera: (source) => {
          for (const other of this.microscopes) if (other !== source) other.copyCamera(source);
        },
      });
      viewer.setStyle(this.microscopeStyle);
      viewer.setView(this.microscopeView);
      viewer.display(models[index]);
      return viewer;
    });
    const hasTilt = this.microscopes.some((viewer) => viewer.gpu);
    for (const button of stage.parentElement.querySelectorAll('[data-morph-view]')) {
      button.disabled = !hasTilt;
    }
    if (this.microscopes.some((viewer) => !viewer.gpu)) {
      stage.insertAdjacentHTML('beforeend', '<p class="stocker-note">Top-view maps are shown wherever WebGL is unavailable. Rotation applies to the 3D views.</p>');
    }
  }

  renderLightboxes(body, wafers, surfaces) {
    body.innerHTML = `<div class="stocker-buttons comparison-light-tools">
      <label>Lighting <select data-compare-light="lighting"><option value="studio">Studio</option><option value="raking">Raking</option></select></label>
      <label>Background <select data-compare-light="background"><option value="dark">Dark</option><option value="light">Light</option></select></label>
      <button class="button" type="button" data-compare-reset>Reset view</button></div>
      <p class="stocker-note">Drag or zoom any wafer to move all views together. Use the same background and lighting when judging the modelled finish.</p>
      <div class="comparison-lightboxes">${wafers.map((wafer) => `<figure><figcaption>${stockerLabel(wafer)}</figcaption>
        <canvas tabindex="0" role="img"></canvas><p class="instrument-note" role="status"></p></figure>`).join('')}</div>
      ${wafers.some((wafer) => wafer.settings.wafer !== wafers[0].settings.wafer) ? '<p class="stocker-note">Different substrates change reflections and transmission. Use a common substrate to isolate the coating’s appearance.</p>' : ''}
      ${wafers.some(waferHasMixedFilm) ? '<p class="stocker-note">For mixed-composition films, the Lightbox illustrates the final surface material. It does not model optical effects between layers.</p>' : ''}`;
    this.lightboxes = [...body.querySelectorAll('figure')].map((figure, index) => {
      const wafer = wafers[index];
      const viewer = new FilmLightbox(figure.querySelector('canvas'), figure.querySelector('p'), null, {
        pixelLimit: 110000, shareCamera: (source) => {
          for (const other of this.lightboxes) if (other !== source) other.copyCamera(source);
        },
      });
      viewer.request({ key: wafer.id, profile: wafer.profile, film: MATERIALS[wafer.film], wafer: wafer.settings.wafer,
        name: stockerLabel(wafer), model: surfaces[index] });
      return viewer;
    });
    body.querySelector('[data-compare-light="lighting"]').addEventListener('change', (event) => {
      for (const viewer of this.lightboxes) viewer.setLighting(event.target.value);
    });
    body.querySelector('[data-compare-light="background"]').addEventListener('change', (event) => {
      for (const viewer of this.lightboxes) viewer.setBackground(event.target.value);
    });
    body.querySelector('[data-compare-reset]').addEventListener('click', () => this.lightboxes[0]?.resetView());
  }
}
