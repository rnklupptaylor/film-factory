import { MATERIALS, POSITIONS, rates, morphology, advanceFilm } from './physics.mjs';
import { TECHNIQUES, VARIANTS, RUN_LENGTH, THEORY, controlGroups, newSettings, sourceChart } from './content.mjs';
import { sci, chamberMarkup, particleMarkup, chartMarkup, growthPlot, profilePlot, sectionMarkup } from './graphics.mjs';

const el = (id) => document.getElementById(id);
const option = (value, label) => `<option value="${value}">${label}</option>`;
const displaySymbol = (s) => s === 'SiO2' ? 'SiO₂' : s;
const number = (value, digits = 2) => Number(value.toFixed(digits)).toString().replace('-', '−');
const rateNumber = (value) => value !== 0 && Math.abs(value) < .01 ? sci(value) : number(value);
const waferCentre = (film) => film[(film.length - 1) / 2];
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const themePreference = matchMedia('(prefers-color-scheme: dark)');
const compactChamber = matchMedia('(max-width: 650px), (max-height: 525px)');

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
let lastFrame = 0;
let lastRender = 0;
let frame = 0;
let manualTheme = false;

function route() {
  page = location.hash === '#pvd' ? 'pvd' : 'home';
  el('home').hidden = page !== 'home';
  el('pvd').hidden = page !== 'pvd';
  if (page === 'home' && running) pause();
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
  variant = next;
  config = VARIANTS[variant];
  settings = newSettings(variant);
  material = MATERIALS[settings.symbol];
  controlPage = 0;
  resetRun();
  renderControls();
  compute(true);
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
  el('summary').textContent = technique.summary;
  pressed(el('techniques'), 'technique', family);
  el('variant').innerHTML = technique.options.map((id) => option(id, VARIANTS[id].name)).join('');
  el('variant').value = variant;
  el('material-label').textContent = config.family === 'sputtering' ? 'Target' : 'Coating material';
  el('material').innerHTML = config.materials.map((symbol) => option(symbol, `${displaySymbol(symbol)} · ${MATERIALS[symbol].name}`)).join('');
  el('material').value = settings.symbol;
  el('material').disabled = config.materials.length === 1;
  el('hardware-note').textContent = config.hardware;
  renderSliders();
}

function renderSliders() {
  const groups = controlGroups(config, material);
  const thirdGroup = config.family === 'plating' ? 'Geometry' : config.duty ? 'Film & pulses' : config.reactive ? 'Film & gas' : 'Film';
  const names = ['Source', 'Chamber', thirdGroup];
  el('control-pages').innerHTML = groups.map((_, i) => `<button type="button" data-group="${i}" aria-pressed="${i === controlPage}">${names[i]}</button>`).join('');
  el('sliders').innerHTML = groups[controlPage].map(([key, label, symbol, min, max, step, unit]) => {
    const value = controlValue(key, settings[key], unit);
    return `<div class="slider"><label for="setting-${key}"><span>${label} <i>${symbol}</i></span><output id="value-${key}" for="setting-${key}">${value}</output></label>
      <input id="setting-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}" data-key="${key}" data-unit="${unit}" aria-valuetext="${value}"></div>`;
  }).join('');
}

function setupChamber() {
  el('chamber-art').innerHTML = chamberMarkup(config, settings, sample.film);
  const hasIons = family !== 'evaporation';
  const ionText = config.arc ? 'Positive ions' : 'Ar⁺';
  el('legend').innerHTML = '<span><i></i> Coating material</span>'
    + (hasIons ? `<span><i class="ion">+</i> ${ionText}</span>` : '')
    + (variant === 'ebeam' ? '<span><i class="electron"></i> Electron beam</span>' : '')
    + (family === 'plating' ? '<span><i class="electron"></i> Resputtered material</span>' : '');
}

function renderChamber() {
  el('chamber-art').firstElementChild.setAttribute('viewBox', compactChamber.matches ? '65 60 510 356' : '0 0 600 474');
  el('chamber-pressure').textContent = `p = ${sci(10 ** settings.pressure)} mbar`;
  el('chamber-particles').innerHTML = particleMarkup(config, settings, sample, motionPreference.matches ? 0 : seconds, running);
  const h = waferCentre(thickness);
  const film = el('in-chamber-film');
  film.setAttribute('height', h > 0 ? Math.min(19, 3 * Math.log1p(h)) : 0);
  const plasma = el('plasma-glow');
  if (plasma) plasma.setAttribute('opacity', Math.min(1, .34 + .4 * Math.max(0, settings.pressure + 3)));
  const heater = el('heater-glow');
  if (heater) heater.setAttribute('opacity', Math.min(1, .35 + .21 * Math.log1p(sample.gross * 9)));
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
    [family === 'plating' ? 'Net growth Rₙₑₜ' : 'Deposition rate R', rateNumber(sample.net), 'nm/s'],
    ['Centre thickness h', h > 0 && h < .01 ? sci(h) : number(h, 1), 'nm'],
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
  } else {
    const incoming = rows.map(([x, state]) => [x,state.gross]);
    const removal = rows.map(([x, state]) => [x,state.loss]);
    graph = { lines: [{points: incoming}, {points: removal, colour: 1}], yDomain: [0, Math.max(.02, sample.gross, ...removal.map(p => p[1])) * 1.14], marker: [settings.bias, sample.gross] };
    caption = 'Blue incoming deposition. Pink resputtering. Their difference gives net growth.';
  }
  return { title: meta.title, caption, markup: chartMarkup({ title: meta.title, xLabel: meta.x, yLabel: meta.y, xDomain: [min,max], ...graph }) };
}

function renderPlot() {
  let view;
  if (plot === 'growth') {
    view = { title: 'Centre', markup: growthPlot([...history, [seconds, waferCentre(thickness)]], seconds, sample.net),
      caption: seconds < RUN_LENGTH ? 'Solid line shows this run. Dashes project the current settings to 60 s.' : 'Finished run. The line records centre thickness as the settings changed.' };
  } else if (plot === 'profile') {
    const forecast = advanceFilm(thickness, sample, RUN_LENGTH - seconds);
    const centre = waferCentre(forecast);
    const edge = centre > 0 ? `Projected edge / centre ${number(forecast[0] / centre * 100, 0)}%.` : 'The projected wafer is bare.';
    view = { title: '100 mm wafer', markup: profilePlot(thickness, forecast), caption: seconds < RUN_LENGTH ? `Solid line shows the current film. ${edge}` : `Final thickness across the wafer. ${edge.replace('Projected edge', 'Edge')}` };
  } else if (plot === 'source') {
    view = renderSource();
  } else {
    const shape = morphology(config, sample, settings.pressure);
    const label = sample.theta === undefined ? sample.film.name : `Tₛ/Tₘ = ${number(sample.theta)}`;
    view = { title: label, markup: sectionMarkup(shape, waferCentre(thickness), sample.film.colour),
      caption: family === 'plating' ? `${number(sample.ionDose, 1)} eV per arriving film unit. Current growth conditions, schematic.` : 'Schematic of the current growth conditions. Grain sizes are illustrative.' };
  }
  el('plot-meta').textContent = view.title;
  el('graphic').innerHTML = view.markup;
  el('plot-caption').textContent = view.caption;
}

function compute(rebuild = false) {
  const formerFilm = sample.film;
  sample = rates(config, settings, material);
  if (rebuild || formerFilm !== sample.film) setupChamber();
  renderChamber();
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

function resetRun() {
  cancelAnimationFrame(frame);
  running = false;
  seconds = 0;
  lastFrame = 0;
  lastRender = 0;
  thickness = POSITIONS.map(() => 0);
  history = [[0,0]];
  renderClock();
  setRunLabel('Ready', 'Run');
}

function pause() {
  cancelAnimationFrame(frame);
  running = false;
  lastFrame = 0;
  compute();
  setRunLabel('Paused', 'Resume');
}

function animate(now) {
  if (!running) return;
  const elapsed = lastFrame ? Math.min(.25, (now - lastFrame) / 1000) * 5 : 0;
  lastFrame = now;
  const dt = Math.min(elapsed, RUN_LENGTH - seconds);
  thickness = advanceFilm(thickness, sample, dt);
  seconds += dt;
  if (seconds - history.at(-1)[0] >= .45) history.push([seconds, waferCentre(thickness)]);
  if (seconds >= RUN_LENGTH) {
    running = false;
    setRunLabel('Complete', 'Run again');
    renderClock();
    compute();
    return;
  }
  if (now - lastRender > 70) {
    lastRender = now;
    renderClock();
    renderChamber();
    renderMetrics();
    if (plot !== 'source') renderPlot();
  }
  frame = requestAnimationFrame(animate);
}

function switchRun() {
  if (running) { pause(); return; }
  if (seconds >= RUN_LENGTH) resetRun();
  running = true;
  setRunLabel('Running · 5×', 'Pause');
  frame = requestAnimationFrame(animate);
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
  if (seconds > history.at(-1)[0]) history.push([seconds, waferCentre(thickness)]);
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
  if (!target) return;
  el('workspace').dataset.mobile = target.dataset.mobile;
  pressed(event.currentTarget, 'mobile', target.dataset.mobile);
});
el('run').addEventListener('click', switchRun);
el('reset').addEventListener('click', () => { resetRun(); compute(); });
el('guide').addEventListener('click', openGuide);
el('compact-guide').addEventListener('click', openGuide);
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
