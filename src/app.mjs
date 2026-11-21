import { MATERIALS, POSITIONS, rates, advanceFilm, residueAfter } from './physics.mjs';
import { TECHNIQUES, VARIANTS, RUN_LENGTH, THEORY, controlGroups, newSettings, sourceChart } from './content.mjs';
import { sci, chartMarkup, growthPlot, profilePlot } from './graphics.mjs';
import { chamberMarkup } from './chamber.mjs';
import { ChamberTransport } from './transport.mjs';
import { SUBSTRATES, substrateStatus, crystalReading, crystalFrequencyShift, gasReadings, pressureGauge } from './instruments.mjs';
import { growthConditions } from './microstructure.mjs';
import { FilmMicroscope } from './microscope.mjs';

const el = (id) => document.getElementById(id);
const option = (value, label) => `<option value="${value}">${label}</option>`;
const displaySymbol = (s) => s === 'SiO2' ? 'SiO₂' : s;
const number = (value, digits = 2) => Number(value.toFixed(digits)).toString().replace('-', '−');
const rateNumber = (value) => value !== 0 && Math.abs(value) < .01 ? sci(value) : number(value);
const waferCentre = (film) => film[(film.length - 1) / 2];
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const themePreference = matchMedia('(prefers-color-scheme: dark)');
const compactChamber = matchMedia('(max-width: 650px), (max-height: 525px)');
const transport = new ChamberTransport();

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
let running = false;
let seconds = 0;
let thickness = POSITIONS.map(() => 0);
let history = [[0, 0]];
let residue = 1;
let residueHistory = [[0, 100]];
let lastFrame = 0;
let lastRender = 0;
let frame = 0;
let manualTheme = false;
let chamber;
let microscope;
let modelMode = 'auto', sensorMode = 'qcm', tooling = 100;
let growthLog = [], growthDuration = 0, growthReference = 0, modelRun = 0;
let qcmMass = 0, qcmThickness = 0, qcmHistory = [[0,0]];
let growthInput = growthConditions(config, settings, sample);
let crystalInput = crystalReading(config, settings, sample);
const isPreclean = () => config.classic && settings.preclean;

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
  settings.wafer = wafer;
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
  el('summary').textContent = isPreclean() ? 'Ar⁺ bombards the negatively biased substrate with the evaporation source switched off.' : technique.summary;
  pressed(el('techniques'), 'technique', family);
  el('variant').innerHTML = technique.options.map((id) => option(id, VARIANTS[id].name)).join('');
  el('variant').value = variant;
  el('material-label').textContent = config.family === 'sputtering' ? 'Target' : 'Coating material';
  el('material').innerHTML = config.materials.map((symbol) => option(symbol, `${displaySymbol(symbol)} · ${MATERIALS[symbol].name}`)).join('');
  el('material').value = settings.symbol;
  el('material').disabled = config.materials.length === 1;
  el('hardware-note').textContent = config.hardware;
  for (const id of ['preclean', 'compact-preclean']) {
    const button = el(id);
    button.hidden = !config.classic;
    button.textContent = isPreclean() ? 'Deposit' : 'Pre-clean';
    button.title = isPreclean() ? 'Switch on the coating source for deposition' : 'Switch off the coating source for Ar⁺ pre-cleaning';
  }
  document.querySelector('[data-plot="growth"]').textContent = isPreclean() ? 'Residue' : 'Growth';
  renderSliders();
}

function renderSliders() {
  const groups = controlGroups(config, material);
  const thirdGroup = config.family === 'plating' ? 'Geometry' : config.duty ? 'Film & pulses' : config.reactive ? 'Film & gas' : 'Film';
  const names = ['Source', 'Chamber', thirdGroup];
  el('control-pages').innerHTML = groups.map((_, i) => `<button type="button" data-group="${i}" aria-pressed="${i === controlPage}">${names[i]}</button>`).join('');
  const controls = groups[controlPage];
  el('sliders').innerHTML = controls.map(([key, label, symbol, min, max, step, unit]) => {
    const disabled = isPreclean() && key === 'arrival';
    const value = disabled ? 'Source off' : controlValue(key, settings[key], unit);
    return `<div class="slider"><label for="setting-${key}"><span>${label} <i>${symbol}</i></span><output id="value-${key}" for="setting-${key}">${value}</output></label>
      <input id="setting-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}" data-key="${key}" data-unit="${unit}" aria-valuetext="${value}" ${disabled ? 'disabled' : ''}></div>`;
  }).join('') + (controls.some(([key]) => key === 'substrate')
    ? `<label class="wafer-control"><span>Substrate</span><select id="wafer" aria-describedby="substrate-limit">${Object.entries(SUBSTRATES).map(([id, substrate]) => option(id, substrate.name)).join('')}</select><span id="substrate-limit" class="wafer-limit"></span></label>`
    : '');
  if (el('wafer')) el('wafer').value = settings.wafer;
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
    film: el('in-chamber-film'), residue: el('surface-residue'), heat: art.querySelectorAll('.heat-active'),
    plasma: el('plasma-glow'), beam: el('electron-guide'),
  };
  const hasIons = family !== 'evaporation';
  const ionText = config.arc ? 'Ti ions' : 'Ar⁺';
  el('legend').innerHTML = (isPreclean() ? '' : '<span><i class="atom"></i> Neutral vapour</span>')
    + (hasIons ? `<span><i class="ion${config.arc ? ' metal-ion' : ''}">+</i> ${ionText}</span>` : '')
    + (variant === 'ebeam' ? '<span><i class="electron"></i> Electrons</span>' : '')
    + (family === 'plating' ? `<span><i class="removed"></i> ${isPreclean() ? 'Material removed' : 'Resputtered atoms'}</span>` : '');
}

function renderChamber() {
  chamber.svg.setAttribute('viewBox', compactChamber.matches ? '5 39 609 422' : '0 0 620 465');
  chamber.pressure.textContent = (10 ** settings.pressure).toExponential(2).replace('-', '−');
  chamber.gauge.textContent = pressureGauge(settings) === 'Cold-cathode gauge' ? 'Cold cathode' : 'Capacitance';
  if (chamber.bias) chamber.bias.textContent = `${settings.bias ? '−' : ''}${settings.bias} V`;
  drawChamberSurface();
  drawChamberMotion();
}

function drawChamberSurface() {
  const h = waferCentre(thickness);
  const height = Math.min(19, 3 * Math.log1p(h));
  chamber.film.setAttribute('height', height);
  chamber.residue?.setAttribute('opacity', residue * Math.max(0, 1 - height / 3.5));
}

function drawChamberMotion() {
  const { plasma, heat, beam } = transport.power;
  chamber.plasma?.setAttribute('opacity', plasma);
  chamber.beam?.setAttribute('opacity', beam);
  chamber.heat.forEach((element) => element.setAttribute('opacity', heat));
  const powerText = running ? isPreclean() ? 'Pre-clean · source off' : 'Power on'
    : transport.visible ? 'Power off · fading' : 'Standby';
  if (chamber.power.textContent !== powerText) chamber.power.textContent = powerText;
  if (chamber.ctx) transport.draw(chamber.ctx);
}

function renderMetrics() {
  const h = waferCentre(thickness);
  const lambda = sample.lambda;
  const lambdaLabel = lambda >= 1 ? [number(lambda, 1), 'm'] : lambda >= .012 ? [number(lambda * 100, 1), 'cm'] : [number(lambda * 1000, 1), 'mm'];
  const specific = family === 'evaporation'
    ? ['Vapour pressure pᵥ', sci(sample.vapour / 100), 'mbar']
    : family === 'sputtering'
      ? sample.yieldValue === undefined
        ? ['Tₛ / nominal film', number(settings.substrate, 0), 'K · SiO₂']
        : ['Sputtering yield Y', number(sample.yieldValue), 'atoms/ion']
      : ['Substrate ion energy Eᵢ', number(sample.ionEnergy, 0), 'eV'];
  const values = [
    isPreclean() ? ['Incoming deposition', '0', 'nm/s'] : [family === 'plating' ? 'Net growth Rₙₑₜ' : 'Deposition rate R', rateNumber(sample.net), 'nm/s'],
    isPreclean() ? ['Surface residue', number(residue * 100, 1), '%'] : ['Centre thickness h', h > 0 && h < .01 ? sci(h) : number(h, 1), 'nm'],
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
    graph = { lines: [{ points }], yDomain: [0, points.at(-1)[1] * 1.14], marker: [settings.energy, sample.yieldValue ?? sample.gross] };
    caption = config.reactive ? `Modelled target coverage by compound ${number(sample.poisoning * 100, 0)}%. Nominal film ${sample.film.name}.`
      : material.yields ? 'Approximate Ar⁺ yield for normal incidence on the selected metal.' : 'Effective rate model for an insulating silica target at 13.56 MHz.';
  } else if (isPreclean()) {
    const h = waferCentre(thickness);
    const cleared = (conditions) => 100 * (1 - residueAfter(1, conditions, RUN_LENGTH, h));
    const points = rows.map(([x, state]) => [x, cleared(state)]);
    graph = { lines: [{ points }], yDomain: [0,100], marker: [settings.bias, cleared(sample)] };
    caption = 'Projected fraction of remaining residue cleared in a 60 s clean. Any deposited film shields the substrate until removed.';
  } else {
    const incoming = rows.map(([x, state]) => [x,state.gross]);
    const removal = rows.map(([x, state]) => [x,state.loss]);
    graph = { lines: [{points: incoming}, {points: removal, colour: 1}], yDomain: [0, Math.max(.02, sample.gross, ...removal.map(p => p[1])) * 1.14], marker: [settings.bias, sample.gross] };
    caption = 'Blue incoming deposition. Pink resputtering. Their difference gives net growth.';
  }
  return { title: meta.title, caption, markup: chartMarkup({ title: meta.title, xLabel: meta.x, yLabel: meta.y, xDomain: [min,max], ...graph }) };
}

function renderResiduePlot() {
  const measured = [...residueHistory, [seconds, residue * 100]];
  const forecast = Array.from({ length: 41 }, (_, i) => {
    const dt = (RUN_LENGTH - seconds) * i / 40;
    return [seconds + dt, 100 * residueAfter(residue, sample, dt, waferCentre(thickness))];
  });
  return {
    title: 'Surface residue',
    markup: chartMarkup({
      title: 'Surface residue remaining at the centre', xLabel: 'Time t (s)', yLabel: 'Residue remaining (%)',
      xDomain: [0, RUN_LENGTH], yDomain: [0, 100], lines: [{ points: measured }, { points: forecast, dashed: true }],
      marker: measured.at(-1),
    }),
    caption: 'Modelled residue at the centre. The dashed curve projects the current bias and ion current.',
  };
}

function renderMorphology() {
  if (!microscope) {
    microscope = new FilmMicroscope(el('micrograph'), el('model-readout'), morphologyWorkerCode);
    el('model-view').querySelectorAll('[data-camera]').forEach((button) => { button.disabled = !microscope.gpu; });
  }
  const mode = modelMode === 'auto' ? (growthDuration ? 'actual' : 'preview') : modelMode;
  pressed(el('model-view'), 'model', mode);
  const preview = mode === 'preview';
  const key = preview ? `preview|${JSON.stringify(growthInput)}`
    : `actual|${modelRun}|${running ? Math.floor(growthDuration / 2) : growthDuration}`;
  const segments = preview ? [{ ...growthInput, duration: RUN_LENGTH }] : growthLog;
  const reference = preview ? growthInput.gross * RUN_LENGTH : growthReference;
  microscope.request(key, segments.map(part => ({...part})), reference);
  const theta = growthInput.theta == null ? '' : ` · Tₛ/Tₘ ${number(growthInput.theta)}`;
  el('plot-meta').textContent = `${preview ? '60 s forecast' : 'Accumulated film'}${theta}`;
  el('plot-caption').textContent = substrateStatus(settings).hot
    ? 'Above the substrate thermal reference. The model still assumes an intact substrate.'
    : `${microscope.gpu ? 'SEM-style contrast. Drag or use arrow keys to rotate.' : 'Surface height map. 3D rendering is unavailable on this device.'} Coarse model.`;
}

function instrumentCards(readings) {
  return `<dl class="sensor-grid">${readings.map(([label,value]) => `<div class="sensor-reading"><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

function renderInstruments() {
  const body = el('sensor-body');
  el('qcm-tooling').hidden = sensorMode !== 'qcm';
  if (sensorMode === 'qcm') {
    el('plot-meta').textContent = '6 MHz quartz';
    const shift = crystalFrequencyShift(qcmMass);
    const observed = [...qcmHistory, [seconds,shift]];
    const end = crystalFrequencyShift(qcmMass + crystalInput.massRate * (RUN_LENGTH - seconds));
    const ymin = Math.min(-1, shift, end, ...qcmHistory.map(point => point[1])) * 1.08;
    body.innerHTML = instrumentCards([
      ['Frequency shift Δf', `${number(shift, 1)} Hz`],
      ['Areal mass', `${number(qcmMass * 1e5, 2)} µg/cm²`],
      ['QCM indicated h', `${number(qcmThickness * tooling / 100, 1)} nm`],
      ['Wafer net h', `${number(waferCentre(thickness), 1)} nm`],
    ]) + `<div class="graphic">${chartMarkup({ title:'Quartz frequency shift', xLabel:'Time t (s)', yLabel:'Δf (Hz)',
      xDomain:[0,RUN_LENGTH], yDomain:[ymin,0],
      lines:[{points:observed},{points:[[seconds,shift],[RUN_LENGTH,end]],dashed:true}], marker:[seconds,shift] })}</div>`;
    el('tooling-value').value = `${tooling}%`;
    el('plot-caption').textContent = Math.abs(shift) > 60000
      ? 'Heavy crystal loading. The linear Sauerbrey estimate is less reliable in this range.'
      : 'The shielded, off-axis crystal measures incoming mass. Tooling corrects geometry. The biased wafer can lose film by resputtering.';
    return;
  }
  if (sensorMode === 'vacuum') {
    const readout = gasReadings(config, settings);
    el('plot-meta').textContent = 'Chamber & holder';
    body.innerHTML = instrumentCards([
      [pressureGauge(settings), `${sci(readout.total)} mbar`],
      ['Holder thermocouple', `${settings.substrate} K`],
      ...readout.gases.map(([gas, pressure]) => [`RGA · p(${gas})`, pressure ? `${sci(pressure)} mbar` : '0 mbar']),
    ]) + `<p class="instrument-note">${readout.gases.length ? 'Partial pressures follow the configured gas mix. Process pressures require a differentially pumped RGA inlet.' : readout.localGas ?? 'Residual gas composition is unspecified for this preset.'}</p>`;
    el('plot-caption').textContent = 'Ideal readouts. The thermocouple is attached to the holder and follows the selected Tₛ.';
    return;
  }
  el('plot-meta').textContent = 'Discharge';
  const readings = [];
  if (family === 'sputtering') readings.push(['Effective target ion current', `${number(running ? settings.current * (config.duty ? settings.duty / 100 : 1) : 0)} A`]);
  if (family === 'plating') readings.push(['Substrate ion current density', `${number(running ? settings.ionCurrent : 0)} mA/cm²`]);
  if (config.reactive) readings.push(['OES · Relative Ti emission', running ? `${number(100 * (1 - .63 * sample.poisoning), 1)}%` : 'Off']);
  body.innerHTML = instrumentCards(readings) + `<p class="instrument-note">${config.reactive
    ? 'The Ti emission proxy follows the modelled metal yield at fixed discharge conditions.'
    : family === 'evaporation' ? 'The evaporation preset has no plasma discharge.'
      : 'Select reactive Ti sputtering to monitor a modelled optical emission signal.'}</p>`;
  el('plot-caption').textContent = 'Optical emission spectroscopy (OES) looks through a viewport. The Ti reading is relative to the metallic target state.';
}

function renderPlot() {
  el('model-view').hidden = plot !== 'morphology';
  el('sensor-view').hidden = plot !== 'diagnostics';
  el('graphic').hidden = plot === 'morphology' || plot === 'diagnostics';
  if (plot === 'morphology') { renderMorphology(); return; }
  if (plot === 'diagnostics') { renderInstruments(); return; }
  let view;
  if (plot === 'growth' && isPreclean()) {
    view = renderResiduePlot();
  } else if (plot === 'growth') {
    view = { title: 'Centre', markup: growthPlot([...history, [seconds, waferCentre(thickness)]], seconds, sample.net),
      caption: seconds < RUN_LENGTH ? 'Solid line shows this run. Dashes project the current settings to 60 s.' : 'Finished run. The line records centre thickness as the settings changed.' };
  } else if (plot === 'profile') {
    const forecast = advanceFilm(thickness, sample, RUN_LENGTH - seconds);
    const centre = waferCentre(forecast);
    const edge = centre > 0 ? `Projected edge / centre ${number(forecast[0] / centre * 100, 0)}%.` : 'The projected wafer is bare.';
    view = { title: '100 mm wafer', markup: profilePlot(thickness, forecast), caption: seconds < RUN_LENGTH ? `Solid line shows the current film. ${edge}` : `Final thickness across the wafer. ${edge.replace('Projected edge', 'Edge')}` };
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

function setRunLabel(status, buttonText) {
  el('run-status').textContent = status;
  el('run').textContent = buttonText;
}

function restartTimeline() {
  running = false;
  seconds = 0;
  lastRender = 0;
  history = [[0, waferCentre(thickness)]];
  residueHistory = [[0, residue * 100]];
  qcmHistory = [[0, crystalFrequencyShift(qcmMass)]];
  renderClock();
  setRunLabel('Ready', 'Run');
}

function resetRun() {
  thickness = POSITIONS.map(() => 0);
  residue = 1;
  growthLog = [];
  growthDuration = 0;
  growthReference = 0;
  modelMode = 'auto';
  modelRun++;
  qcmMass = qcmThickness = 0;
  restartTimeline();
  scheduleFrame();
}

function pause() {
  running = false;
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
    if (plot !== 'source') renderPlot();
  }
}

function animate(now) {
  frame = 0;
  const elapsed = lastFrame ? (now - lastFrame) / 1000 : 0;
  lastFrame = now;
  if (running) trackFilm(Math.min(.25, elapsed), now);
  transport.update(Math.min(.05, elapsed), running, config, variant, settings, sample, material.mass, waferCentre(thickness), motionPreference.matches, residue);
  drawChamberMotion();
  scheduleFrame();
}

function scheduleFrame() {
  if (!frame && (running || transport.visible)) frame = requestAnimationFrame(animate);
  if (!frame) lastFrame = 0;
}

function switchRun() {
  if (running) { pause(); return; }
  if (seconds >= RUN_LENGTH) resetRun();
  running = true;
  setRunLabel('Running · 5×', 'Pause');
  if (plot === 'diagnostics') renderInstruments();
  scheduleFrame();
}

function switchPreclean() {
  if (!config.classic) return;
  recordSample();
  settings.preclean = !settings.preclean;
  if (seconds >= RUN_LENGTH) restartTimeline();
  plot = 'growth';
  pressed(document.querySelector('.plot-nav'), 'plot', plot);
  renderControls();
  compute(true);
}

function openGuide() {
  el('dialog-title').textContent = 'Try it';
  el('dialog-content').innerHTML = `<p>${TECHNIQUES[family].summary}</p><p>${config.prompt}</p><p class="citation">The sliders update the readings instantly. Run to build a film and compare the growth or wafer profile.</p>`;
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
el('sliders').addEventListener('change', (event) => {
  if (event.target.id !== 'wafer') return;
  settings.wafer = event.target.value;
  resetRun();
  compute();
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
  if (!target) return;
  el('workspace').dataset.mobile = target.dataset.mobile;
  pressed(event.currentTarget, 'mobile', target.dataset.mobile);
});
el('run').addEventListener('click', switchRun);
el('thermal-warning').addEventListener('click', showThermalDetails);
el('model-view').addEventListener('click', (event) => {
  if (event.target.dataset.model) {
    modelMode = event.target.dataset.model;
    renderMorphology();
  }
  if (event.target.dataset.camera) {
    microscope.setView(event.target.dataset.camera);
    pressed(el('model-view'), 'camera', event.target.dataset.camera);
  }
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
window.addEventListener('hashchange', route);

theme(themePreference.matches);
renderControls();
compute(true);
route();
