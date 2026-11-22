// Depla et al., Table 3, 0.3 A and 0.3 Pa Ar. The second value is
// the estimated secondary-electron yield for the metallic target.
const magnetronReference = {
  Ag: [394.9, .081], Al: [376.4, .091], Au: [471.2, .047],
  Cr: [359.6, .102], Cu: [388.3, .084], Ti: [335.6, .118],
};

// Ball's DC diode operating points at 10 mTorr Ar. The zero-current
// intercept extends the measured range for this teaching source.
const diodeReference = [[0, 1100], [.023, 2000], [.049, 3000], [.076, 4000], [.1, 5000]];
const chargeExchangeArea = 5e-19;
const roomTemperatureEnergy = 1.380649e-23 * 300;

export const supplyNames = { powerW: 'Power', voltageV: 'Voltage', dischargeA: 'Current', ions: 'Ion settings' };

export function hasDcSupply(config) {
  return Boolean(config.diode || (config.arcing && !config.ito));
}

export function supplyControl(config, mode) {
  if (mode === 'powerW') return [mode, config.duty ? 'Average power' : 'Discharge power', config.duty ? 'P̄' : 'P', 20, config.diode ? 200 : 240, 1, 'W', 120];
  if (mode === 'voltageV') return [mode, config.duty ? 'On-voltage magnitude' : 'Target voltage magnitude', '|Vₜ|', ...(config.diode ? [1200, 4000, 10, 'V', 2000] : [200, 600, 1, 'V', 375])];
  return [mode, config.duty ? 'Discharge on-current' : 'Discharge current', 'I', ...(config.diode ? [.01, .10, .001, 'A', .05] : [.05, 1.2, .01, 'A', .30])];
}

function diodeVoltage(current, pressurePa) {
  const index = diodeReference.findIndex(([amps]) => amps >= current);
  const right = index < 0 ? diodeReference.length - 1 : Math.max(1, index);
  const [lo, loVoltage] = diodeReference[right - 1];
  const [hi, hiVoltage] = diodeReference[right];
  const value = loVoltage + (current - lo) / (hi - lo) * (hiVoltage - loVoltage);
  // Illustrative pressure scaling of the measured 10 mTorr characteristic.
  return value * Math.sqrt((10 / 7.50062) / pressurePa);
}

export function sputterDischarge(config, settings, coverageAtCurrent) {
  if (!hasDcSupply(config) || !settings.supplyMode || settings.supplyMode === 'ions') return null;
  const mode = settings.supplyMode;
  const requested = settings[mode];
  const pressurePa = 100 * 10 ** settings.pressure;
  const duty = config.duty ? settings.duty / 100 : 1;
  const [referenceVoltage, metalGamma] = magnetronReference[settings.symbol];
  const voltageLimit = config.diode ? 4000 : 600;
  const currentLimit = config.diode ? .1 : 1.2;
  // Westwood et al. report V₀ falling by about 150 V from 0.1 to 1 Pa,
  // and B rising from 50 to about 300 A/kV² over 0.1 to 10 Pa.
  const pressureTerm = -150 * Math.min(1, Math.log10(pressurePa / .1)) + 150 * Math.log10(3);
  const coefficient = (pressure) => 50 * (pressure / .1) ** (Math.log10(6) / 2);
  const referenceSlope = 1000 * Math.sqrt(.3 / coefficient(.3));
  const slope = 1000 / Math.sqrt(coefficient(pressurePa));
  const atIonCurrent = (ionOn) => {
    const coverage = coverageAtCurrent?.(ionOn * duty) ?? 0;
    const gamma = metalGamma + (.198 - metalGamma) * coverage;
    const currentOn = ionOn * (1 + gamma);
    const voltage = config.diode ? diodeVoltage(currentOn, pressurePa)
      : referenceVoltage + pressureTerm + slope * Math.sqrt(currentOn) - referenceSlope + (259.1 - 376.4) * coverage;
    return { voltage, currentOn, ionOn, power: voltage * currentOn * duty, coverage };
  };
  const value = ({ voltage, currentOn, power }) => mode === 'voltageV' ? voltage : mode === 'dischargeA' ? currentOn : power;
  const atZero = atIonCurrent(0);
  if (mode === 'voltageV' && requested <= atZero.voltage) {
    return { ...atZero, voltage: requested, ionEnergy: 0, ionAverage: 0, currentAverage: 0, status: 'Below sustaining voltage' };
  }
  // The target voltage, discharge current and average power are monotone
  // on this steady-state branch. Stop at the first setpoint or supply limit.
  let lo = 0, hi = currentLimit;
  for (let iteration = 0; iteration < 29; iteration++) {
    const middle = (lo + hi) / 2;
    const point = atIonCurrent(middle);
    if (value(point) > requested || point.currentOn > currentLimit || point.voltage > voltageLimit) hi = middle;
    else lo = middle;
  }
  const point = atIonCurrent(lo);
  const sheathWidth = config.diode ? .020 : .001;
  const opticalDepth = sheathWidth * pressurePa / roomTemperatureEnergy * chargeExchangeArea;
  // Constant-field last-collision estimate for singly charged Ar⁺.
  // The full sheath drop is approximated by the cathode-voltage magnitude.
  const ionEnergy = lo > 0 ? point.voltage * -Math.expm1(-opticalDepth) / opticalDepth : 0;
  const status = value(point) < requested * .999 ? 'Supply limit'
    : config.reactive && settings.nitrogen > 0 ? 'Argon electrical baseline' : '';
  return { ...point, ionEnergy, ionAverage: lo * duty, currentAverage: point.currentOn * duty, status };
}
