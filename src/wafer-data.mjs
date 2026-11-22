import { MATERIALS, POSITIONS } from './physics.mjs';
import { SUBSTRATES, substrateStatus } from './instruments.mjs';
import { TECHNIQUES, VARIANTS, RUN_LENGTH, controlGroups, processConfig } from './content.mjs';
import { DEFAULT_PULSE_KHZ } from './arcing.mjs';
import { hasDcSupply, supplyNames } from './discharge.mjs';

export const STOCKER_FORMAT = 'film-factory-wafer-stocker';
export const STOCKER_SCHEMA = 3;
export const LIGHTBOX_COMPARE_LIMIT = 4;
export const WAFER_FILE_BYTES = 20 * 1024 * 1024;
export const WAFER_FILE_COUNT = 5000;

const knownWaferKey = /^[a-z0-9-]{8,48}$/i;
const stockerNumber = (value, min = 0, max = 1e9) => Number.isFinite(value) && value >= min && value <= max;
const stockerRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const stockerOwn = (object, key) => typeof key === 'string' && Object.hasOwn(object, key);

const legacySputterMethods = new Map([
  ['reactive', { variant: 'dc', symbol: 'Ti', gas: 'nitrogen' }],
  ['itoCeramic', { variant: 'pulsed', symbol: 'ITO', gas: 'oxygen' }],
  ['itoReactive', { variant: 'pulsed', symbol: 'InSn', gas: 'oxygen' }],
]);

function migrateLegacyWafer(wafer) {
  if (!stockerRecord(wafer) || !Array.isArray(wafer.recipes) || wafer.recipes.length > 12000) return wafer;
  const legacy = legacySputterMethods.get(wafer.variant);
  const variant = legacy?.variant ?? wafer.variant;
  if (!stockerOwn(VARIANTS, variant) || !VARIANTS[variant].arcing) return wafer;
  const convertSettings = (settings) => {
    if (!stockerRecord(settings) || (legacy && settings.symbol !== legacy.symbol)) return null;
    // Schema 1 stored N₂ = 6 even for argon-only DC and pulsed DC runs.
    return {
      ...settings,
      nitrogen: legacy?.gas === 'nitrogen' ? settings.nitrogen : 0,
      oxygen: legacy?.gas === 'oxygen' ? settings.oxygen : settings.oxygen ?? 0,
      ...(VARIANTS[variant].duty ? { frequency: settings.frequency ?? DEFAULT_PULSE_KHZ } : {}),
    };
  };
  return {
    ...wafer, variant, settings: convertSettings(wafer.settings),
    recipes: wafer.recipes.map((recipe) => stockerRecord(recipe)
      ? { ...recipe, settings: convertSettings(recipe.settings) } : recipe),
  };
}

function validWaferRecipe(variant, settings) {
  if (!stockerRecord(settings) || !VARIANTS[variant].materials.includes(settings.symbol) || !stockerOwn(SUBSTRATES, settings.wafer)) return false;
  const config = processConfig(variant, settings.symbol);
  if (settings.supplyMode !== undefined && (!hasDcSupply(config) || !stockerOwn(supplyNames, settings.supplyMode))) return false;
  return controlGroups(config, MATERIALS[settings.symbol], settings).flat().every(([key, , , min, max]) =>
    stockerNumber(settings[key], min - 1e-8, max + 1e-8))
    && (!config.classic || typeof settings.preclean === 'boolean');
}

function validWaferTrace(points, duration, low, high) {
  return Array.isArray(points) && points.length >= 2 && points.length <= 12000
    && points[0]?.[0] === 0 && Math.abs(points.at(-1)?.[0] - duration) < 1e-6
    && points.every((point, index) => Array.isArray(point) && point.length === 2
      && stockerNumber(point[0], points[index - 1]?.[0] ?? 0, duration + 1e-6)
      && stockerNumber(point[1], low, high));
}

export function validWafer(wafer) {
  if (!stockerRecord(wafer) || typeof wafer.id !== 'string' || !knownWaferKey.test(wafer.id)
    || !stockerNumber(wafer.created, 1, 8.64e15) || typeof wafer.version !== 'string' || wafer.version.length > 30
    || (wafer.technique !== undefined && wafer.technique !== 'pvd')
    || !stockerOwn(VARIANTS, wafer.variant) || !validWaferRecipe(wafer.variant, wafer.settings)
    || !['preview', 'growth'].includes(wafer.mode) || !stockerNumber(wafer.duration, 5, 180)
    || (wafer.mode === 'preview' ? wafer.duration % 5 !== 0 : wafer.duration !== RUN_LENGTH)
    || !stockerOwn(MATERIALS, wafer.film) || !Array.isArray(wafer.profile) || wafer.profile.length !== POSITIONS.length
    || !wafer.profile.every((value) => stockerNumber(value))) return false;
  const { duration, growth, residue, qcm, surface, recipes } = wafer;
  if (!validWaferTrace(growth, duration, 0, 1e9) || !validWaferTrace(residue, duration, 0, 100)
    || !stockerRecord(qcm) || !stockerNumber(qcm.mass) || !stockerNumber(qcm.height)
    || !stockerNumber(qcm.tooling, 50, 200) || !validWaferTrace(qcm.trace, duration, -1e9, 0)
    || !stockerRecord(surface) || !stockerNumber(surface.reference) || !Array.isArray(surface.segments)
    || !surface.segments.length || surface.segments.length > 12000
    || !surface.segments.every((part) => stockerRecord(part) && stockerNumber(part.duration, 0, 180)
      && stockerNumber(part.gross) && stockerNumber(part.loss) && stockerNumber(part.hops, 0, 100)
      && stockerNumber(part.angularSpread, 0, Math.PI) && stockerNumber(part.affinity, 0, 1)
      && typeof part.amorphous === 'boolean')) return false;
  return Array.isArray(recipes) && recipes.length > 0 && recipes.length <= 12000 && recipes.every((recipe) =>
    stockerRecord(recipe) && stockerNumber(recipe.duration, 0, 1e7)
    && (recipe.film === null || stockerOwn(MATERIALS, recipe.film)) && validWaferRecipe(wafer.variant, recipe.settings));
}

export function waferFile(title, wafers) {
  return { format: STOCKER_FORMAT, schema: STOCKER_SCHEMA, title, wafers };
}

export function readWaferFile(text) {
  const file = JSON.parse(text);
  if (!stockerRecord(file) || file.format !== STOCKER_FORMAT || ![1, 2, STOCKER_SCHEMA].includes(file.schema)
    || typeof file.title !== 'string' || file.title.length > 100 || !Array.isArray(file.wafers)
    || file.wafers.length > WAFER_FILE_COUNT) {
    throw new Error('This file does not contain a valid Film Factory wafer collection.');
  }
  const wafers = file.schema === 1 ? file.wafers.map(migrateLegacyWafer) : file.wafers;
  if (!wafers.every(validWafer)) {
    throw new Error('This file does not contain a valid Film Factory wafer collection.');
  }
  return waferFile(file.title, wafers);
}

export function waferFilename(title, date = new Date()) {
  const slug = title.normalize('NFKD').replace(/\p{Mark}/gu, '').toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-+|-+$/g, '');
  const short = [...slug].slice(0, 28).join('').replace(/-+$/g, '');
  return `wafers-${short || date.toISOString().slice(0, 10)}.json`;
}

export function waferMaterialId(film) {
  return Object.keys(MATERIALS).find((key) => MATERIALS[key] === film);
}

export function waferClassification(wafer) {
  const method = VARIANTS[wafer.variant];
  // v1.2 files hold a PVD method ID and have no explicit technique field.
  return { technique: (wafer.technique ?? 'pvd').toUpperCase(), subtechnique: TECHNIQUES[method.family].name, method: method.name };
}

export function waferCentre(profile) {
  return profile[(profile.length - 1) / 2];
}

export function waferIsClean(wafer) {
  return VARIANTS[wafer.variant].classic === true && wafer.settings.preclean === true;
}

export function waferOverheated(wafer) {
  return wafer.recipes.some((recipe) => substrateStatus(recipe.settings).hot);
}

export function waferHasMixedFilm(wafer) {
  return new Set(wafer.recipes.map(({ film }) => film).filter(Boolean)).size > 1;
}

export function waferMorphologyReason(wafers, surfaces) {
  if (wafers.some(waferOverheated)) return 'At least one run exceeded its substrate’s thermal reference. The model assumes an intact substrate, so a roughness comparison would be misleading.';
  if (surfaces.some((surface) => !surface.count)) return 'Film roughness cannot be compared when a wafer is bare.';
  if (surfaces.some((surface) => surface.coverage < .95)) return 'Compare film roughness once every wafer is at least 95% covered. Exposed substrate contributes to the RMS height.';
  if (wafers.some((wafer) => waferHasMixedFilm(wafer) || wafer.film !== wafers[0].film || wafer.settings.wafer !== wafers[0].settings.wafer)) {
    return 'Use the same coating material and substrate to compare modelled film roughness. Mixed-composition films also change the growth model.';
  }
  if (wafers.some((wafer) => wafer.version !== wafers[0].version)) return 'These wafers were saved in different app versions. Re-run them with a common model to compare film roughness.';
  const resolution = surfaces.map((surface) => surface.resolution);
  if (Math.max(...resolution) > 2 * Math.min(...resolution)) return 'The simulated height resolutions differ by more than a factor of two. Use similar film thicknesses to compare roughness.';
  return '';
}
