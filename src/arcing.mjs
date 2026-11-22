export const DEFAULT_PULSE_KHZ = 40;

export function hasAluminaRecipe(config, symbol) {
  return Boolean(config.arcing && symbol === 'Al');
}

// Approximate points from Belkind et al. (1998), Fig. 4(c), 9 A and 3 mTorr.
// The study current and charge balance are specific to its long racetrack.
// Use the measured shape with relative loading for the schematic source.
function referenceFrequency(reverseUs) {
  if (reverseUs < 1) return 40 / reverseUs;
  if (reverseUs < 2) return 40 - 10 * (reverseUs - 1);
  if (reverseUs < 3) return 30 - 25 * (reverseUs - 2);
  return 5;
}

export function sputterArcing(config, settings, oxideCoverage = 0) {
  if (!config.arcing) return null;
  // The pulse response is calibrated to insulating alumina patches.
  if ((config.reactive && settings.nitrogen > 0)
    || config.ito === 'ceramic' || (config.ito === 'alloy' && settings.oxygen > 0)) return null;
  const pressurePa = 100 * 10 ** settings.pressure;
  const relativeCurrent = settings.current / .35;
  const frequency = config.duty ? settings.frequency ?? DEFAULT_PULSE_KHZ : 0;
  const reverseUs = frequency ? 1000 * (1 - settings.duty / 100) / frequency : 0;
  const referencePressure = Math.max(.4, Math.min(1.33, pressurePa));
  const critical = reverseUs ? referenceFrequency(reverseUs) * relativeCurrent * (.4 / referencePressure) ** .25 : null;
  const retainedCharge = critical === null ? 1 : 1 / (1 + (frequency / critical) ** 4);
  // A low background means occasional arcs remain possible on nominally
  // clean metal. No material ranking is inferred for the pure-Ar presets.
  const background = .04 + .025 * relativeCurrent;
  const score = Math.min(1, background + oxideCoverage * relativeCurrent * retainedCharge);
  if (score < .16) return { severity: 'Low', flashRate: .075, reverseUs, score };
  if (score < .4) return { severity: 'Moderate', flashRate: .42, reverseUs, score };
  if (score < .7) return { severity: 'High', flashRate: 1.1, reverseUs, score };
  return { severity: 'Severe', flashRate: 2.8, reverseUs, score };
}
