import { MATERIALS, POSITIONS, rates, advanceFilm, residueAfter } from './physics.mjs';
import { TECHNIQUES, VARIANTS, RUN_LENGTH, THEORY, controlGroups, newSettings, sourceChart } from './content.mjs';
import { sci, chartMarkup, growthPlot, profilePlot } from './graphics.mjs';
import { chamberMarkup } from './chamber.mjs';
import { ChamberTransport } from './transport.mjs';
import { SUBSTRATES, substrateStatus, crystalReading, crystalFrequencyShift, gasReadings, processGas, chamberPressure, pressureGauge } from './instruments.mjs';
import { growthConditions } from './microstructure.mjs';
import { FilmMicroscope } from './microscope.mjs';
import { FilmLightbox } from './lightbox.mjs';
import { zoneDiagramMarkup, zoneModel } from './zones.mjs';

const el = (id) => document.getElementById(id);
const option = (value, label) => `<option value="${value}">${label}</option>`;
const displaySymbol = (s) => MATERIALS[s].formula ?? s;
const number = (value, digits = 2) => Number(value.toFixed(digits)).toString().replace('-', '−');
const rateNumber = (value) => value !== 0 && Math.abs(value) < .01 ? sci(value) : number(value);
const waferCentre = (film) => film[(film.length - 1) / 2];
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const themePreference = matchMedia('(prefers-color-scheme: dark)');
const compactChamber = matchMedia('(max-width: 650px), (max-height: 525px)');
const standaloneSettings = matchMedia('(max-width: 479px) and (max-height: 740px)');
const transport = new ChamberTransport();
const bareFilm = POSITIONS.map(() => 0);

let page = 'home';
let family = 'evaporation';
let variant = 'boat';
let settings = newSettings(variant);
let config = VARIANTS[variant];
let material = MATERIALS[settings.symbol];
let sample = rates(config, settings, material);
let controlPage = 0;
let plot = 'growth';
let theoryPage = 0;
let experimentMode = 'preview';
let previewTime = Number(el('preview-time').value);
let running = false;
let gasLeadIn = 0;
let seconds = 0;
let thickness = bareFilm;
let history = [[0, 0]];
let residue = 1;
let residueHistory = [[0, 100]];
let lastFrame = 0;
let lastRender = 0;
let lastVacuumReadout = 0;
let frame = 0;
let manualTheme = false;
let chamber;
let microscope;
let lightbox;
let filmSurface;
let modelStyle = 'sem', sensorMode = 'qcm', tooling = 100;
let growthLog = [], growthDuration = 0, growthReference = 0, modelRun = 0;
let qcmMass = 0, qcmThickness = 0, qcmHistory = [[0,0]];
let growthInput = growthConditions(config, settings, sample);
let crystalInput = crystalReading(config, settings, sample);
const isPreclean = () => config.classic && settings.preclean;
const isPreview = () => experimentMode === 'preview';
const visibleProfile = () => isPreview() ? advanceFilm(bareFilm, sample, previewTime) : thickness;
const visibleResidue = () => isPreview() ? residueAfter(1, sample, previewTime) : residue;
const valveOpen = () => running && chamber.feed != null && (!chamber.feed.gun || settings.ionCurrent > 0);
const readPressure = () => chamberPressure(settings, chamber.feed, transport.fill);

function route() {
  page = location.hash === '#pvd' ? 'pvd' : 'home';
  el('home').hidden = page !== 'home';
  el('pvd').hidden = page !== 'pvd';
  if (page === 'home' && running) pause();
  renderThermalWarning();
  document.title = page === 'pvd' ? 'The Atom Shop (PVD) · Film Factory' : 'Film Factory';
}

function pressed(container, key, value) {
  container.querySelectorAll(`[data-${key}]`).forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset[key] === String(value)));
  });
}

function chooseTechnique(next) {
  if (family === next) return;
  family = next;
  chooseVariant(TECHNIQUES[family].options[0]);
}

function chooseVariant(next) {
  const wafer = settings.wafer;
  variant = next;
  config = VARIANTS[variant];
  settings = newSettings(variant);
  settings.wafer = config.wafer ?? wafer;
  material = MATERIALS[settings.symbol];
  controlPage = 0;
  transport.clear();
  resetRun();
  renderControls();
  compute(true);
}

function renderThermalWarning() {
  const status = substrateStatus(settings);
  const warning = el('thermal-warning');
  warning.hidden = page !== 'pvd' || !status.hot;
  warning.title = `${settings.substrate} K exceeds the ${Math.round(status.limit)} K reference for ${status.name}`;
  const limit = el('substrate-limit');
  if (limit) {
    limit.textContent = status.hot ? `Above thermal reference (${Math.round(status.limit)} K)` : `Thermal reference ${Math.round(status.limit)} K`;
    limit.classList.toggle('above-limit', status.hot);
  }
}

function showThermalDetails() {
  const status = substrateStatus(settings);
  el('dialog-title').textContent = 'Substrate thermal reference';
  el('dialog-content').innerHTML = `<p><strong>${status.name}</strong> at ${settings.substrate} K exceeds the selected ${Math.round(status.limit)} K reference.</p>
    <p>${status.basis}. The simulation still shows an intact substrate. Fixture limits, load, exposure time and grade can lower usable temperatures.</p>
    <a href="${status.url}" target="_blank" rel="noopener noreferrer">Material data</a>`;
  el('dialog-nav').hidden = true;
  el('dialog').showModal();
}

function chooseMaterial(symbol) {
  settings.symbol = symbol;
  material = MATERIALS[symbol];
  if (config.family === 'evaporation') settings.temperature = newSettings(variant, symbol).temperature;
  resetRun();
  renderControls();
  compute(true);
}

function controlValue(key, value, unit) {
  if (key === 'pressure') return `${sci(10 ** value)} ${unit}`;
  if (key === 'bias' && !config.ibad) return `${value ? '−' : ''}${value} ${unit}`;
  return `${number(value)} ${unit}`;
}

function renderControls() {
  const technique = TECHNIQUES[family];
  el('question').textContent = technique.question;
  el('summary').textContent = isPreclean() ? 'Ar⁺ bombards the negatively biased substrate with the evaporation source switched off.'
    : config.arc ? 'Ti vapour and ions leave the cathode. Nitrogen supplies the N in the TiN coating.'
    : config.ito === 'alloy' ? 'Argon ions eject In and Sn. Oxygen supplies the oxide in the growing ITO film.'
    : config.ito ? 'Argon ions sputter a conductive indium tin oxide ceramic target. A small oxygen addition is optional.'
    : technique.summary;
  pressed(el('techniques'), 'technique', family);
  el('variant').innerHTML = technique.options.map((id) => option(id, VARIANTS[id].name)).join('');
  el('variant').value = variant;
  el('material-label').textContent = config.family === 'sputtering' ? 'Target' : 'Coating material';
  el('material').innerHTML = config.materials.map((symbol) => option(symbol, `${displaySymbol(symbol)} · ${MATERIALS[symbol].name}`)).join('');
  el('material').value = settings.symbol;
  el('material').disabled = config.materials.length === 1;
  el('wafer').value = settings.wafer;
  el('hardware-note').textContent = config.hardware;
  for (const id of ['preclean', 'compact-preclean']) {
    const button = el(id);
    button.hidden = !config.classic;
    button.textContent = isPreclean() ? 'Deposit' : 'Pre-clean';
    button.title = isPreclean() ? 'Switch on the coating source for deposition' : 'Switch off the coating source for Ar⁺ pre-cleaning';
  }
  renderSliders();
}

function showWorkspace(view) {
  el('workspace').dataset.mobile = view;
  pressed(document.querySelector('.mobile-nav'), 'mobile', view);
}

function renderSliders() {
  const groups = controlGroups(config, material);
  const names = ['Source', 'Chamber'];
  el('control-pages').innerHTML = groups.map((_, i) => `<button type="button" data-group="${i}" aria-pressed="${i === controlPage}">${names[i]}</button>`).join('');
  const controls = groups[controlPage];
  el('sliders').innerHTML = controls.map(([key, label, symbol, min, max, step, unit]) => {
    const disabled = isPreclean() && key === 'arrival';
    const value = disabled ? 'Source off' : controlValue(key, settings[key], unit);
    return `<div class="slider"><label for="setting-${key}"><span>${label} <i>${symbol}</i></span><output id="value-${key}" for="setting-${key}">${value}</output></label>
      <input id="setting-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}" data-key="${key}" data-unit="${unit}" aria-valuetext="${value}" ${disabled ? 'disabled' : ''}></div>`;
  }).join('');
  renderThermalWarning();
}

function setupChamber() {
  const art = el('chamber-art');
  art.innerHTML = chamberMarkup(config, variant, settings, material, sample.film);
  const canvas = el('chamber-motion');
  const ctx = canvas.getContext('2d');
  ctx?.scale(2, 2);
  chamber = {
    svg: art.firstElementChild, ctx, power: el('chamber-power'),
    pressure: el('chamber-pressure'), gauge: el('chamber-gauge-type'), bias: el('chamber-bias'),
    film: el('in-chamber-film'), filmLabel: el('in-chamber-film-label'), residue: el('surface-residue'), heat: art.querySelectorAll('.heat-active'),
    plasma: el('plasma-glow'), beam: el('electron-guide'),
    coil: el('holder-coil'), valve: el('gas-valve-state'), lamp: el('gas-valve-lamp'),
    species: el('gas-species'), gunFeed: el('gun-gas-path'),
  };
  const hasIons = family !== 'evaporation';
  const ionText = config.arc ? 'Ti ions' : 'Ar⁺';
  el('legend').innerHTML = (isPreclean() ? '' : `<span><i class="atom"></i> ${config.arc ? 'Ti vapour' : 'Neutral vapour'}</span>`)
    + (hasIons ? `<span><i class="ion${config.arc ? ' metal-ion' : ''}">+</i> ${ionText}</span>` : '')
    + (variant === 'ebeam' ? '<span><i class="electron"></i> Electrons</span>' : '')
    + (family === 'plating' ? `<span><i class="removed"></i> ${isPreclean() ? 'Material removed' : 'Resputtered atoms'}</span>` : '')
    + (family === 'evaporation' ? '' : '<span id="gas-legend"></span>');
}

function renderChamber() {
  chamber.svg.setAttribute('viewBox', compactChamber.matches ? '5 39 609 404' : '0 30 620 422');
  chamber.feed = processGas(config, settings);
  if (chamber.feed) {
    chamber.species.textContent = chamber.feed.label;
    const swatches = { Ar: 'gas-argon', 'N₂': 'gas-nitrogen', 'O₂': 'gas-oxygen' };
    el('gas-legend').innerHTML = chamber.feed.species.filter(([,fraction]) => fraction > 0)
      .map(([name]) => `<span><i class="${swatches[name]}"></i> ${name} gas</span>`).join('');
  }
  if (chamber.bias) chamber.bias.textContent = `${settings.bias ? '−' : ''}${settings.bias} V`;
  drawChamberSurface();
  drawChamberMotion();
}

function drawChamberSurface() {
  const h = waferCentre(visibleProfile());
  const height = Math.min(19, 3 * Math.log1p(h));
  chamber.film.setAttribute('height', height);
  chamber.filmLabel?.setAttribute('visibility', h > .01 ? 'visible' : 'hidden');
  chamber.residue?.setAttribute('opacity', visibleResidue() * Math.max(0, 1 - height / 3.5));
}

function drawChamberMotion() {
  const { plasma, heat, beam, holder } = transport.power;
  chamber.plasma?.setAttribute('opacity', plasma);
  chamber.beam?.setAttribute('opacity', beam);
  chamber.heat.forEach((element) => element.setAttribute('opacity', heat));
  chamber.coil.setAttribute('opacity', holder);
  const pressure = readPressure();
  const digits = sci(pressure, 2);
  const gauge = pressureGauge(pressure) === 'Cold-cathode gauge' ? 'Cold cathode' : 'Capacitance';
  if (chamber.pressure.textContent !== digits) chamber.pressure.textContent = digits;
  if (chamber.gauge.textContent !== gauge) chamber.gauge.textContent = gauge;
  if (chamber.valve) {
    const open = valveOpen();
    const label = open ? 'Open · flowing' : 'Closed';
    if (chamber.valve.textContent !== label) {
      chamber.valve.textContent = label;
      chamber.valve.classList.toggle('open', open);
      chamber.lamp.classList.toggle('open', open);
      chamber.gunFeed?.setAttribute('opacity', Number(open));
    }
  }
  const powerText = running ? gasLeadIn ? 'Gas stabilising' : isPreclean() ? 'Pre-clean · source off' : 'Power on'
    : transport.visible ? 'Power off · fading' : isPreview() ? 'Preview' : 'Standby';
  if (chamber.power.textContent !== powerText) chamber.power.textContent = powerText;
  if (chamber.ctx) transport.draw(chamber.ctx);
}

function renderMetrics() {
  const h = waferCentre(visibleProfile());
  const lambda = sample.lambda;
  const lambdaLabel = lambda >= 1 ? [number(lambda, 1), 'm'] : lambda >= .012 ? [number(lambda * 100, 1), 'cm'] : [number(lambda * 1000, 1), 'mm'];
  const specific = family === 'evaporation'
    ? ['Vapour pressure pᵥ', sci(sample.vapour / 100), 'mbar']
    : family === 'sputtering'
      ? sample.yieldValue === undefined
        ? config.ito
          ? ['Nominal film', sample.film.formula, '']
          : ['Tₛ / nominal film', number(settings.substrate, 0), 'K · SiO₂']
        : ['Sputtering yield Y', number(sample.yieldValue), 'atoms/ion']
      : ['Substrate ion energy Eᵢ', number(sample.ionEnergy, 0), 'eV'];
  const values = [
    isPreclean() ? ['Incoming deposition', '0', 'nm/s'] : [family === 'plating' ? 'Net growth Rₙₑₜ' : 'Deposition rate R', rateNumber(sample.net), 'nm/s'],
    isPreclean() ? ['Surface residue', number(visibleResidue() * 100, 1), '%'] : ['Centre thickness h', h > 0 && h < .01 ? sci(h) : number(h, 1), 'nm'],
    ['Mean free path λ', ...lambdaLabel],
    specific,
  ];
  el('metrics').innerHTML = values.map(([label, value, unit]) => `<div class="metric"><dt>${label}</dt><dd>${value} <small>${unit}</small></dd></div>`).join('');
}

function renderSource() {
  const meta = sourceChart(config, settings, material);
  const [, , , min, max] = controlGroups(config, material).flat().find(([key]) => key === meta.control);
  const rows = Array.from({ length: 65 }, (_, i) => {
    const x = min + (max - min) * i / 64;
    return [x, rates(config, { ...settings, [meta.control]: x }, material)];
  });
  let graph, caption;
  if (family === 'evaporation') {
    const points = rows.map(([x, state]) => [x, Math.log10(state.vapour / 100)]);
    const phase = settings.temperature >= material.melting ? 'Liquid source' : 'Solid source';
    graph = { lines: [{ points }], yDomain: [Math.floor(points[0][1] + 1e-8), Math.ceil(points.at(-1)[1] - 1e-8)], log: true, marker: [settings.temperature, Math.log10(sample.vapour / 100)] };
    caption = `${phase} · bulk melting temperature Tₘ = ${material.melting} K.`;
  } else if (family === 'sputtering') {
    const points = rows.map(([x, state]) => [x, state.yieldValue ?? state.gross]);
    graph = { lines: [{ points }], yDomain: [0, Math.max(...points.map(([,y]) => y)) * 1.14], marker: [settings[meta.control], sample.yieldValue ?? sample.gross] };
    caption = config.ito === 'ceramic' ? 'Reference-scale rate. The conductive ceramic supplies indium, tin and oxygen. O₂ affects film properties, which this rate model leaves fixed.'
      : config.ito === 'alloy' ? `Modelled oxide coverage of the target ${number(sample.poisoning * 100, 0)}%. Nominal film ${sample.film.name}.`
      : config.reactive ? `Modelled target coverage by compound ${number(sample.poisoning * 100, 0)}%. Nominal film ${sample.film.name}.`
      : material.yields ? 'Approximate Ar⁺ yield for normal incidence on the selected metal.' : 'Effective rate model for an insulating silica target at 13.56 MHz.';
  } else if (isPreclean()) {
    const h = isPreview() ? 0 : waferCentre(thickness);
    const duration = isPreview() ? previewTime : RUN_LENGTH;
    const cleared = (conditions) => 100 * (1 - residueAfter(1, conditions, duration, h));
    const points = rows.map(([x, state]) => [x, cleared(state)]);
    graph = { lines: [{ points }], yDomain: [0,100], marker: [settings.bias, cleared(sample)] };
    caption = `Fraction of remaining residue cleared in a ${duration} s clean. Deposited film shields the substrate until removed.`;
  } else {
    const incoming = rows.map(([x, state]) => [x,state.gross]);
    const removal = rows.map(([x, state]) => [x,state.loss]);
    graph = { lines: [{points: incoming}, {points: removal, colour: 1}], yDomain: [0, Math.max(.02, sample.gross, ...removal.map(p => p[1])) * 1.14], marker: [settings.bias, sample.gross] };
    caption = 'Blue incoming deposition. Pink resputtering. Their difference gives net growth.';
  }
  return { title: meta.title, caption, markup: chartMarkup({ title: meta.title, xLabel: meta.x, yLabel: meta.y, xDomain: [min,max], ...graph }) };
}

function renderResiduePlot() {
  const points = isPreview()
    ? Array.from({ length: 41 }, (_, i) => {
        const time = previewTime * i / 40;
        return [time, 100 * residueAfter(1, sample, time)];
      })
    : [...residueHistory, [seconds, residue * 100]];
  return {
    title: 'Surface residue',
    markup: chartMarkup({
      title: 'Surface residue remaining at the centre', xLabel: 'Time t (s)', yLabel: 'Residue remaining (%)',
      xDomain: [0, isPreview() ? previewTime : RUN_LENGTH], yDomain: [0, 100], lines: [{ points }],
      marker: points.at(-1),
    }),
    caption: isPreview() ? 'Projected surface cleaning at the current bias and ion current.' : 'Surface residue at the centre during this run.',
  };
}

function surfaceInput() {
  if (isPreview()) return {
    key: `preview|${previewTime}|${JSON.stringify(growthInput)}`,
    segments: [{ ...growthInput, duration: previewTime }],
    reference: growthInput.gross * previewTime,
  };
  return {
    key: `growth|${modelRun}|${running ? Math.floor(growthDuration / 2) : growthDuration}`,
    segments: growthLog.map(({ input, ...part }) => part),
    reference: growthReference,
  };
}

function renderMorphology() {
  if (!microscope) {
    microscope = new FilmMicroscope(el('micrograph'), el('model-readout'), morphologyWorkerCode);
    microscope.setStyle(modelStyle);
    el('model-view').querySelectorAll('[data-camera]').forEach((button) => { button.disabled = !microscope.gpu; });
  }
  const { key, segments, reference } = surfaceInput();
  microscope.request(key, segments, reference);
  const theta = growthInput.theta == null ? '' : ` · Tₛ/Tₘ ${number(growthInput.theta)}`;
  el('plot-meta').textContent = `${isPreview() ? `${previewTime} s preview` : 'This run'}${theta}`;
  const details = modelStyle === 'grains'
    ? 'Colours mark individual grains. Diameter uses exposed area in grid cells.'
    : `${microscope.gpu ? 'Drag or use arrow keys to rotate.' : 'Surface height map.'} RMS roughness comes from modelled heights.`;
  el('plot-caption').textContent = substrateStatus(settings).hot
    ? 'Above the substrate thermal reference. The model still assumes an intact substrate.'
    : details;
}

function selectModelStyle(style) {
  modelStyle = style;
  pressed(el('model-view'), 'rendering', style);
  microscope.setStyle(style);
  renderPlot();
}

function renderLightbox() {
  if (!lightbox) lightbox = new FilmLightbox(el('film-lightbox'), el('lightbox-readout'), morphologyWorkerCode);
  const { key: surfaceKey, segments, reference } = surfaceInput();
  const film = isPreview() ? sample.film : filmSurface ?? sample.film;
  const key = `${surfaceKey}|${settings.wafer}|${film.name}`;
  const name = isPreview() ? `${previewTime} s preview` : 'This run';
  if (key !== lightbox.key) {
    lightbox.request({ key, profile: visibleProfile(), film, wafer: settings.wafer, name,
      input: { segments, reference, summaryOnly: true } });
  }
  el('plot-meta').textContent = name;
  el('plot-caption').textContent = lightbox.gpu ? 'Drag to rotate. Scroll or pinch to zoom.'
    : 'Simplified surface view. Drag to tilt. Scroll or pinch to zoom.';
}

function renderZoneModel() {
  const model = zoneModel(config, settings, sample);
  el('plot-meta').textContent = model.kind === 'thermal' || model.kind === 'thornton' ? 'Schematic zones'
    : model.kind === 'assist' || model.kind === 'etch' ? 'Projection' : 'Study comparison';
  el('zone-name').textContent = model.name;
  el('zone-subject').textContent = model.subject;
  el('zone-chart').innerHTML = zoneDiagramMarkup(model);
  el('zone-values').textContent = model.operating;
  el('zone-reading').textContent = model.reading;
  el('plot-caption').textContent = model.context;
}

function showZoneNotes() {
  const model = zoneModel(config, settings, sample);
  el('dialog-title').textContent = model.name;
  const sources = model.links.map(([label, url]) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`).join('');
  el('dialog-content').innerHTML = `<p><strong>${model.subject}</strong></p><p>${model.detail}</p><p>${model.context}</p>
    <p>The diagram marks the current recipe settings. In Growth mode, the morphology records changes during the run.</p>${sources}`;
  el('dialog-nav').hidden = true;
  el('dialog').showModal();
}

function instrumentCards(readings) {
  return `<dl class="sensor-grid">${readings.map(([label,value]) => `<div class="sensor-reading"><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

function renderInstruments() {
  const body = el('sensor-body');
  el('qcm-tooling').hidden = sensorMode !== 'qcm';
  if (sensorMode === 'qcm') {
    el('plot-meta').textContent = isPreview() ? `6 MHz quartz · ${previewTime} s preview` : '6 MHz quartz';
    const time = isPreview() ? previewTime : seconds;
    const mass = isPreview() ? crystalInput.massRate * time : qcmMass;
    const crystalHeight = isPreview() ? crystalInput.thicknessRate * time : qcmThickness;
    const shift = crystalFrequencyShift(mass);
    const points = [...(isPreview() ? [[0, 0]] : qcmHistory), [time, shift]];
    const ymin = Math.min(-1, ...points.map(point => point[1])) * 1.08;
    body.innerHTML = instrumentCards([
      ['Frequency shift Δf', `${number(shift, 1)} Hz`],
      ['Areal mass', `${number(mass * 1e5, 2)} µg/cm²`],
      ['QCM indicated h', `${number(crystalHeight * tooling / 100, 1)} nm`],
      ['Wafer net h', `${number(waferCentre(visibleProfile()), 1)} nm`],
    ]) + `<div class="graphic">${chartMarkup({ title:'Quartz frequency shift', xLabel:'Time t (s)', yLabel:'Δf (Hz)',
      xDomain:[0,isPreview() ? previewTime : RUN_LENGTH], yDomain:[ymin,0],
      lines:[{ points }], marker:[time,shift] })}</div>`;
    el('tooling-value').value = `${tooling}%`;
    el('plot-caption').textContent = Math.abs(shift) > 60000
      ? 'Heavy crystal loading. The linear Sauerbrey estimate is less reliable in this range.'
      : 'The shielded, off-axis crystal measures incoming mass. Tooling corrects geometry. The biased wafer can lose film by resputtering.';
    return;
  }
  if (sensorMode === 'vacuum') {
    const readout = gasReadings(config, settings, isPreview() ? 10 ** settings.pressure : readPressure());
    el('plot-meta').textContent = isPreview() ? 'Working conditions' : 'Chamber & holder';
    body.innerHTML = instrumentCards([
      [pressureGauge(readout.total), `${sci(readout.total, 2)} mbar`],
      ['Holder thermocouple', `${settings.substrate} K`],
      ...readout.gases.map(([gas, pressure]) => [`RGA · p(${gas})`, pressure ? `${sci(pressure)} mbar` : '0 mbar']),
    ]) + `<p class="instrument-note">${readout.gases.length ? 'Partial pressures use the selected gas mixture. An RGA at process pressure requires differential pumping.' : readout.localGas ?? 'Residual gas composition is unspecified for this preset.'}</p>`;
    el('plot-caption').textContent = 'Modelled gauge and thermocouple. The holder sensor follows the selected Tₛ.';
    return;
  }
  el('plot-meta').textContent = isPreview() ? 'Discharge at working conditions' : 'Discharge';
  const readings = [];
  const discharge = isPreview() || (running && !gasLeadIn);
  if (family === 'sputtering') readings.push(['Effective target ion current', `${number(discharge ? settings.current * (config.duty ? settings.duty / 100 : 1) : 0)} A`]);
  if (family === 'plating') readings.push(['Substrate ion current density', `${number(discharge ? settings.ionCurrent : 0)} mA/cm²`]);
  if (config.reactive) readings.push(['OES · Relative Ti emission', discharge ? `${number(100 * (1 - .63 * sample.poisoning), 1)}%` : 'Off']);
    body.innerHTML = instrumentCards(readings) + `<p class="instrument-note">${config.reactive
    ? 'The Ti emission proxy follows the modelled metal yield at fixed discharge conditions.'
    : family === 'evaporation' ? 'The evaporation preset has no plasma discharge.'
      : 'Select reactive Ti sputtering to monitor a modelled optical emission signal.'}</p>`;
  el('plot-caption').textContent = 'Optical emission spectroscopy (OES) looks through a viewport. The Ti reading is relative to the metallic target state.';
}

function renderPlot() {
  el('model-view').hidden = plot !== 'morphology';
  el('lightbox-view').hidden = plot !== 'lightbox';
  el('zone-view').hidden = plot !== 'zones';
  el('sensor-view').hidden = plot !== 'diagnostics';
  el('graphic').hidden = ['morphology', 'diagnostics', 'lightbox', 'zones'].includes(plot);
  if (plot === 'morphology') { renderMorphology(); return; }
  if (plot === 'lightbox') { renderLightbox(); return; }
  if (plot === 'zones') { renderZoneModel(); return; }
  if (plot === 'diagnostics') { renderInstruments(); return; }
  let view;
  if (plot === 'growth' && isPreclean()) {
    view = renderResiduePlot();
  } else if (plot === 'growth') {
    const h = waferCentre(visibleProfile());
    const points = isPreview() ? [[0, 0], [previewTime, h]] : [...history, [seconds, h]];
    view = { title: 'Centre', markup: growthPlot(points, isPreview() ? previewTime : RUN_LENGTH),
      caption: isPreview() ? 'Projected centre thickness at the current settings.' : 'Centre thickness as the settings change during this run.' };
  } else if (plot === 'profile') {
    const profile = visibleProfile();
    const centre = waferCentre(profile);
    const edge = centre > 0 ? `Edge / centre ${number(profile[0] / centre * 100, 0)}%.` : 'The wafer is bare.';
    view = { title: '100 mm wafer', markup: profilePlot(profile), caption: `${isPreview() ? `Profile after ${previewTime} s.` : 'Profile for this run.'} ${edge}` };
  } else {
    view = renderSource();
  }
  el('plot-meta').textContent = view.title;
  el('graphic').innerHTML = view.markup;
  el('plot-caption').textContent = view.caption;
}

function compute(rebuild = false) {
  const formerFilm = sample.film;
  sample = rates(config, settings, material);
  const conditions = growthConditions(config, settings, sample);
  if (JSON.stringify(growthInput) !== JSON.stringify(conditions)) growthInput = conditions;
  crystalInput = crystalReading(config, settings, sample);
  if (rebuild || formerFilm !== sample.film) setupChamber();
  renderChamber();
  renderThermalWarning();
  renderMetrics();
  renderPlot();
}

function renderClock() {
  el('progress').value = seconds;
  el('clock').textContent = `${Math.floor(seconds)} / ${RUN_LENGTH} s`;
}

function switchExperiment(next) {
  if (next === experimentMode) return;
  experimentMode = next;
  pressed(el('experiment-mode'), 'mode', next);
  el('preview-duration').hidden = !isPreview();
  el('growth-transport').hidden = isPreview();
  if (running) pause();
  else compute();
}

function setRunLabel(status, buttonText) {
  el('run-status').textContent = status;
  el('run').textContent = buttonText;
}

function restartTimeline() {
  running = false;
  gasLeadIn = 0;
  seconds = 0;
  lastRender = 0;
  history = [[0, waferCentre(thickness)]];
  residueHistory = [[0, residue * 100]];
  qcmHistory = [[0, crystalFrequencyShift(qcmMass)]];
  renderClock();
  setRunLabel('Ready', 'Run');
}

function resetRun() {
  thickness = bareFilm;
  residue = 1;
  growthLog = [];
  growthDuration = 0;
  growthReference = 0;
  filmSurface = undefined;
  modelRun++;
  qcmMass = qcmThickness = 0;
  restartTimeline();
  scheduleFrame();
}

function pause() {
  running = false;
  gasLeadIn = 0;
  compute();
  renderClock();
  setRunLabel('Paused', 'Resume');
  scheduleFrame();
}

function recordSample() {
  if (seconds <= history.at(-1)[0]) return;
  history.push([seconds, waferCentre(thickness)]);
  residueHistory.push([seconds, residue * 100]);
  qcmHistory.push([seconds, crystalFrequencyShift(qcmMass)]);
}

function trackFilm(elapsed, now) {
  const dt = Math.min(elapsed * 5, RUN_LENGTH - seconds);
  if (dt > 0) {
    let part = growthLog.at(-1);
    if (part?.input !== growthInput) {
      part = { input: growthInput, ...growthInput, duration: 0 };
      growthLog.push(part);
    }
    part.duration += dt;
    growthDuration += dt;
    if (!growthReference && growthInput.gross) growthReference = growthInput.gross * RUN_LENGTH;
    if (sample.net > 0) filmSurface = sample.film;
    qcmMass += dt * crystalInput.massRate;
    qcmThickness += dt * crystalInput.thicknessRate;
  }
  if (isPreclean()) residue = residueAfter(residue, sample, dt, waferCentre(thickness));
  thickness = advanceFilm(thickness, sample, dt);
  seconds += dt;
  if (seconds - history.at(-1)[0] >= .45) recordSample();
  if (seconds >= RUN_LENGTH) {
    running = false;
    setRunLabel('Complete', 'Run again');
    compute();
    renderClock();
    return;
  }
  if (now - lastRender > 70) {
    lastRender = now;
    renderClock();
    drawChamberSurface();
    renderMetrics();
    if (plot !== 'source' && plot !== 'zones' && (plot !== 'diagnostics' || sensorMode !== 'vacuum')) renderPlot();
  }
}

function animate(now) {
  frame = 0;
  const elapsed = lastFrame ? (now - lastFrame) / 1000 : 0;
  lastFrame = now;
  const dt = Math.min(.25, elapsed);
  if (running && gasLeadIn) {
    gasLeadIn = Math.max(0, gasLeadIn - dt);
    if (!gasLeadIn) setRunLabel('Running · 5×', 'Pause');
  } else if (running) trackFilm(dt, now);
  transport.update(Math.min(.05, elapsed), running && !gasLeadIn, config, variant, settings, sample,
    material.mass, waferCentre(thickness), motionPreference.matches, residue, valveOpen());
  if (plot === 'diagnostics' && sensorMode === 'vacuum' && (now - lastVacuumReadout > 100 || !transport.visible)) {
    lastVacuumReadout = now;
    renderInstruments();
  }
  drawChamberMotion();
  scheduleFrame();
}

function scheduleFrame() {
  if (!frame && (running || transport.visible)) frame = requestAnimationFrame(animate);
  if (!frame) lastFrame = 0;
}

function switchRun() {
  if (isPreview()) return;
  if (running) { pause(); return; }
  if (seconds >= RUN_LENGTH) resetRun();
  running = true;
  gasLeadIn = valveOpen() ? .65 : 0;
  setRunLabel(gasLeadIn ? 'Gas stabilising' : 'Running · 5×', 'Pause');
  if (plot === 'diagnostics') renderInstruments();
  scheduleFrame();
}

function switchPreclean() {
  if (!config.classic) return;
  recordSample();
  settings.preclean = !settings.preclean;
  if (seconds >= RUN_LENGTH) restartTimeline();
  if (plot !== 'zones') plot = 'growth';
  pressed(document.querySelector('.plot-nav'), 'plot', plot);
  renderControls();
  compute(true);
}

function openGuide() {
  el('dialog-title').textContent = 'Try it';
  el('dialog-content').innerHTML = `<p>${TECHNIQUES[family].summary}</p><p>${config.prompt}</p><p class="citation">Use Preview to see the estimated film at the selected time. Select Growth and press Run to watch the deposition and change settings as it proceeds.</p>`;
  el('dialog-nav').hidden = true;
  el('dialog').showModal();
}

function renderTheory() {
  const note = THEORY[theoryPage];
  const link = (label, href) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  el('dialog-title').textContent = note.title;
  el('dialog-content').innerHTML = `<p>${note.text}</p>`
    + (note.href ? link(note.label, note.href) : `<p class="citation">${note.note}</p>`)
    + (note.extra ?? []).map(([label, href]) => link(label, href)).join('');
  el('dialog-nav').hidden = false;
  el('page-count').textContent = `${theoryPage + 1} of ${THEORY.length}`;
  el('previous').disabled = theoryPage === 0;
  el('next').disabled = theoryPage === THEORY.length - 1;
}

function theme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  el('theme').setAttribute('aria-pressed', String(dark));
  el('theme').title = dark ? 'Light appearance' : 'Dark appearance';
}

el('techniques').innerHTML = Object.entries(TECHNIQUES).map(([id, value]) => `<button type="button" data-technique="${id}">${value.name}</button>`).join('');
el('techniques').addEventListener('click', (event) => {
  const target = event.target.closest('[data-technique]');
  if (target) chooseTechnique(target.dataset.technique);
});
el('variant').addEventListener('change', (event) => chooseVariant(event.target.value));
el('material').addEventListener('change', (event) => chooseMaterial(event.target.value));
el('wafer').innerHTML = Object.entries(SUBSTRATES).map(([id, substrate]) => option(id, substrate.name)).join('');
el('wafer').addEventListener('change', (event) => {
  settings.wafer = event.target.value;
  resetRun();
  compute(true);
});
el('control-pages').addEventListener('click', (event) => {
  const target = event.target.closest('[data-group]');
  if (!target) return;
  controlPage = Number(target.dataset.group);
  renderSliders();
  el('control-pages').querySelector(`[data-group="${controlPage}"]`).focus();
});
el('sliders').addEventListener('input', (event) => {
  const control = event.target;
  const { key, unit } = control.dataset;
  if (!key) return;
  recordSample();
  settings[key] = Number(control.value);
  const value = controlValue(key, settings[key], unit);
  el(`value-${key}`).value = value;
  control.setAttribute('aria-valuetext', value);
  compute(key === 'distance');
});
document.querySelector('.plot-nav').addEventListener('click', (event) => {
  const target = event.target.closest('[data-plot]');
  if (!target) return;
  plot = target.dataset.plot;
  pressed(event.currentTarget, 'plot', plot);
  renderPlot();
});
document.querySelector('.mobile-nav').addEventListener('click', (event) => {
  const target = event.target.closest('[data-mobile]');
  if (target) showWorkspace(target.dataset.mobile);
});
el('run').addEventListener('click', switchRun);
el('experiment-mode').addEventListener('click', (event) => {
  const { mode } = event.target.dataset;
  if (mode) switchExperiment(mode);
});
el('preview-time').addEventListener('input', (event) => {
  previewTime = Number(event.target.value);
  el('preview-time-value').value = `${previewTime} s`;
  event.target.setAttribute('aria-valuetext', `${previewTime} seconds`);
  drawChamberSurface();
  renderMetrics();
  renderPlot();
});
el('thermal-warning').addEventListener('click', showThermalDetails);
el('model-view').addEventListener('click', (event) => {
  if (event.target.dataset.rendering) selectModelStyle(event.target.dataset.rendering);
  if (event.target.dataset.camera) {
    microscope.setView(event.target.dataset.camera);
    pressed(el('model-view'), 'camera', event.target.dataset.camera);
  }
});
el('lightbox-view').addEventListener('click', (event) => {
  const { background, light } = event.target.dataset;
  if (background) {
    lightbox.setBackground(background);
    pressed(el('lightbox-view'), 'background', background);
  }
  if (light) {
    lightbox.setLighting(light);
    pressed(el('lightbox-view'), 'light', light);
  }
});
el('lightbox-reset').addEventListener('click', () => lightbox.resetView());
el('zone-notes').addEventListener('click', showZoneNotes);
el('chamber-labels').addEventListener('click', (event) => {
  const button = event.currentTarget;
  const show = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(show));
  el('chamber-art').classList.toggle('hide-labels', !show);
});
el('sensor-view').addEventListener('click', (event) => {
  if (!event.target.dataset.sensor) return;
  sensorMode = event.target.dataset.sensor;
  pressed(el('sensor-view'), 'sensor', sensorMode);
  renderInstruments();
});
el('tooling').addEventListener('input', (event) => {
  tooling = Number(event.target.value);
  renderInstruments();
});
el('reset').addEventListener('click', () => { resetRun(); compute(); });
el('guide').addEventListener('click', openGuide);
el('compact-guide').addEventListener('click', openGuide);
el('preclean').addEventListener('click', switchPreclean);
el('compact-preclean').addEventListener('click', switchPreclean);
el('enlarge-chamber').addEventListener('click', (event) => {
  const button = event.currentTarget;
  const expanded = button.getAttribute('aria-pressed') !== 'true';
  el('workspace').dataset.enlarged = String(expanded);
  button.setAttribute('aria-pressed', String(expanded));
  button.textContent = expanded ? 'Settings' : 'Expand';
});
el('theory').addEventListener('click', () => { renderTheory(); el('dialog').showModal(); });
el('close').addEventListener('click', () => el('dialog').close());
el('previous').addEventListener('click', () => { theoryPage--; renderTheory(); });
el('next').addEventListener('click', () => { theoryPage++; renderTheory(); });
el('theme').addEventListener('click', () => {
  manualTheme = true;
  theme(document.documentElement.dataset.theme !== 'dark');
});
themePreference.addEventListener('change', (event) => { if (!manualTheme) theme(event.matches); });
compactChamber.addEventListener('change', renderChamber);
standaloneSettings.addEventListener('change', () => {
  if (!standaloneSettings.matches && el('workspace').dataset.mobile === 'settings') showWorkspace('chamber');
});
window.addEventListener('hashchange', route);

theme(themePreference.matches);
renderControls();
compute(true);
route();
