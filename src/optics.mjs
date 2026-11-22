// Reduced-order thin-film interference colours for the Lightbox.
//
// Each stack is air / film (complex index n - ik) / substrate at normal
// incidence, evaluated at three display wavelengths (650, 550, 450 nm) with
// dispersion ignored. The reflected amplitude sums the two interface
// reflections of the film,
//
//   r = (r01 + r12·e^(-2iδ)) / (1 + r01·r12·e^(-2iδ)),   δ = 2π·ñ·d/λ,   ñ = n - ik,
//
// with Fresnel amplitudes r0j = (ñ0 - ñj)/(ñ0 + ñj), so that e^(-2iδ) decays
// as exp(-4π·k·d/λ) inside an absorbing film. For metals the penetration depth
// is well under the phase thickness, so the colour settles rapidly at the
// film's intrinsic reflectance.
//
// Optical constants are single room-temperature values per wavelength,
// rounded from published data: Ag, Au and Cu from P. B. Johnson and
// R. W. Christy; Al, Cr, Ti, silicon, silica, alumina and stainless steel from
// the Palik-handbook values hosted on refractiveindex.info; TiN from
// representative sputtered-film measurements (≈1.5 - i2.5, gold-like);
// borofloat from the SCHOTT data sheet; polycarbonate from Sultanova et al.;
// polyimide (Kapton) from refractiveindex.info. Refractive values around
// silicon and borofloat dominate the visible colour cycling; a single value
// per wavelength cannot reproduce angular or spectral detail.
//
// The photometric conversion is a teaching approximation: each three-band
// reflectance passes through a gentle Reinhard-style shoulder, a fixed colour
// saturation emphasis around the luma (the three bands underestimate the
// perceived chroma of real spectra) and the 2.2 gamma. Colours are
// illustrative, not calibrated matches.

export const WAVELENGTHS_NM = [650, 550, 450];

// Wavelength-ordered constants [n, k] at 650, 550 and 450 nm.
export const FILM_OPTICS = {
  Silver: [[.15, 3.98], [.13, 3.35], [.08, 2.42]],
  Aluminium: [[1.30, 7.11], [.92, 6.24], [.59, 5.35]],
  Gold: [[.18, 3.30], [.47, 2.42], [1.38, 1.91]],
  Chromium: [[3.19, 4.30], [2.93, 3.71], [2.60, 3.30]],
  Copper: [[.27, 4.11], [.83, 2.54], [1.10, 2.30]],
  Titanium: [[3.39, 4.28], [3.04, 3.63], [2.53, 3.35]],
  'Titanium nitride': [[1.58, 3.30], [1.47, 2.89], [1.36, 2.05]],
  'Indium tin oxide': [[1.95, 0], [2.00, 0], [2.15, 0]],
  Silica: [[1.457, 0], [1.460, 0], [1.466, 0]],
  Alumina: [[1.754, 0], [1.770, 0], [1.790, 0]],
};

export const SUBSTRATE_OPTICS = {
  silicon: [[3.84, .015], [4.05, .055], [4.86, .14]],
  borofloat: [[1.470, 0], [1.473, 0], [1.478, 0]],
  silica: [[1.457, 0], [1.460, 0], [1.466, 0]],
  steel: [[2.65, 3.30], [2.60, 3.20], [2.55, 3.05]],
  polycarbonate: [[1.578, 0], [1.585, 0], [1.596, 0]],
  kapton: [[1.70, .024], [1.76, .093], [1.88, .27]],
};

const TWO_PI = 2 * Math.PI;
const SATURATION_EMPHASIS = 1.5;

function fresnelAmplitude(from, to) {
  // Complex Fresnel amplitude, complex numbers packed as [re, im].
  const dr = from[0] - to[0], di = from[1] - to[1];
  const sr = from[0] + to[0], si = from[1] + to[1];
  const modulus2 = sr * sr + si * si;
  return [(dr * sr + di * si) / modulus2, (di * sr - dr * si) / modulus2];
}

// Linear-light display tint of a three-band reflectance triple.
export function displayTint(reflectance) {
  const lin = reflectance.map((r) => Math.min(1, (1.6 * r) / (1 + 0.6 * r)));
  const luma = .2126 * lin[0] + .7152 * lin[1] + .0722 * lin[2];
  return lin.map((c) => Math.min(1, Math.max(0, luma + SATURATION_EMPHASIS * (c - luma))));
}

const gammaEncode = (x) => x ** (1 / 2.2);

function interfaceReflectance([n, k]) {
  const modulus2 = (1 + n) ** 2 + k * k;
  const re = (1 - n * n - k * k) / modulus2, im = 2 * k / modulus2;
  return re * re + im * im;
}

// Exact normal-incidence reflectance of air / film / substrate, [R650, R550, R450].
export function stackReflectance(film, thicknessNm, substrate) {
  const optics = FILM_OPTICS[film], base = SUBSTRATE_OPTICS[substrate] ?? SUBSTRATE_OPTICS.silicon;
  if (!optics) return base.map(interfaceReflectance);
  return optics.map(([n, k], index) => {
    const lambda = WAVELENGTHS_NM[index];
    const r01 = fresnelAmplitude([1, 0], [n, -k]);
    const r12 = fresnelAmplitude([n, -k], [base[index][0], -base[index][1]]);
    const phase = 2 * TWO_PI * (n * thicknessNm) / lambda;
    const decay = Math.exp(-4 * Math.PI * k * thicknessNm / lambda);
    const cosPhase = Math.cos(phase), sinPhase = Math.sin(phase);
    const wR = decay * cosPhase, wI = -decay * sinPhase;
    const tR = r01[0] + r12[0] * wR - r12[1] * wI;
    const tI = r01[1] + r12[0] * wI + r12[1] * wR;
    const q01 = r01[0] * r12[0] - r01[1] * r12[1], q02 = r01[0] * r12[1] + r01[1] * r12[0];
    const uR = 1 + q01 * wR - q02 * wI;
    const uI = q02 * wR + q01 * wI;
    const modulus2 = uR * uR + uI * uI;
    const rr = (tR * uR + tI * uI) / modulus2, ri = (tI * uR - tR * uI) / modulus2;
    return rr * rr + ri * ri;
  });
}

// Assumed energy conservation, T = 1 - R per wavelength. This is exact for
// non-absorbing films and a stated approximation where the substrate absorbs.
export function stackTransmittance(film, thicknessNm, substrate) {
  return stackReflectance(film, thicknessNm, substrate).map((r) => 1 - r);
}

// sRGB display colour, gamma encoded, as [r, g, b] in 0–1.
export function stackColour(film, thicknessNm, substrate) {
  return displayTint(stackReflectance(film, thicknessNm, substrate)).map(gammaEncode);
}

export function stackTransmissionColour(film, thicknessNm, substrate) {
  return displayTint(stackTransmittance(film, thicknessNm, substrate)).map(gammaEncode);
}

export function stackColourCSS(colour) {
  const channel = (x) => Math.round(255 * Math.min(1, Math.max(0, x)));
  return `rgb(${channel(colour[0])},${channel(colour[1])},${channel(colour[2])})`;
}
