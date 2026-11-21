export const SUBSTRATES = {
  silicon: { name: 'Silicon wafer', limit: 1687, basis: 'Bulk melting point', affinity: .45, oxide: true, url: 'https://periodic-table.rsc.org/element/14/Silicon' },
  borofloat: { name: 'Borosilicate glass · BOROFLOAT 33', limit: 723.15, basis: 'Manufacturer long-term maximum, 450 °C. SCHOTT gives 500 °C for exposures under 10 hours', affinity: .36, oxide: true, url: 'https://www.schott.com/en-us/products/borofloat/technical-details' },
  silica: { name: 'Fused silica · HPFS 7980', limit: 1166.15, basis: 'Manufacturer strain point, 893 °C', affinity: .32, oxide: true, url: 'https://www.corning.com/media/worldwide/csm/documents/HPFS_Product_Brochure_All_Grades_2022_6.pdf' },
  steel: { name: '304 stainless steel', limit: 1673.15, basis: 'Bottom of the bulk melting range, approximately 1400 °C', affinity: .66, url: 'https://www.atimaterials.com/Products/Documents/datasheets/stainless-specialty-steel/austenitic/ati_302_304_304l_305_tds_en4_v1.pdf' },
  polycarbonate: { name: 'Polycarbonate · Makrolon 6487', limit: 388.15, basis: 'Tensile impact strength relative temperature index at 1.5 mm, 115 °C', affinity: .38, url: 'https://solutions.covestro.com/en/products/makrolon/makrolon-6487_000000000000952807' },
  kapton: { name: 'Polyimide film · Kapton HN', limit: 633.15, basis: 'Lower end of the manufacturer’s glass-transition range, 360 °C', affinity: .44, url: 'https://www.dupont.com/content/dam/dupont/amer/us/en/ei-transformation/public/documents/en/EI-10206-Kapton-HN-Data-Sheet.pdf' },
};

export function substrateStatus(settings) {
  const substrate = SUBSTRATES[settings.wafer] ?? SUBSTRATES.silicon;
  return { ...substrate, hot: settings.substrate > substrate.limit };
}

const CRYSTAL_OFFSET_CM = 6.5;
const F0 = 6e6;
const QUARTZ_DENSITY = 2648;
const QUARTZ_SHEAR = 2.947e10;

export function crystalReading(config, settings, sample) {
  const direct = (1 + (CRYSTAL_OFFSET_CM / settings.distance) ** 2) ** -2;
  const scattered = config.family === 'evaporation' ? direct : .88 + .12 * direct;
  const collection = sample.ballistic * direct + (1 - sample.ballistic) * scattered;
  const thicknessRate = sample.gross * collection;
  return { collection, thicknessRate, massRate: thicknessRate * sample.film.density * 1e-9 };
}

export function crystalFrequencyShift(mass) {
  return -2 * F0 ** 2 * mass / Math.sqrt(QUARTZ_DENSITY * QUARTZ_SHEAR);
}

export function gasReadings(config, settings) {
  const total = 10 ** settings.pressure;
  if (config.reactive) {
    const nitrogen = total * settings.nitrogen / 100;
    return { total, gases: [['Ar', total - nitrogen], ['N₂', nitrogen]] };
  }
  if (config.arc) return { total, gases: [['N₂', total]] };
  if (config.family === 'evaporation') return { total, gases: [] };
  if (config.ibad) return { total, gases: [], localGas: 'Ar is supplied to the ion gun.' };
  return { total, gases: [['Ar', total]] };
}

export function pressureGauge(settings) {
  return settings.pressure <= -3.4 ? 'Cold-cathode gauge' : 'Capacitance gauge';
}
