import { makeMorphology } from './microstructure.mjs';
import { FILM_OPTICS, SUBSTRATE_OPTICS, stackColour, stackColourCSS } from './optics.mjs';

const FILM_COLOURS = {
  Silver: '#e1e6eb', Aluminium: '#c4ccd1', Gold: '#eec354', Chromium: '#adbabf',
  Copper: '#c98460', Titanium: '#949ba3', 'Titanium nitride': '#ce9e47',
  'Indium tin oxide': '#afc8bd', Silica: '#e3eceb',
};
const SUBSTRATE_FINISH = {
  silicon: ['#69748a', .36, .024, 0], borofloat: ['#8ca8a3', .08, .021, .92], silica: ['#b2c4cd', .03, .016, .94],
  steel: ['#a8b0b4', .75, .21, 0], polycarbonate: ['#b0bcb2', .07, .075, .87], kapton: ['#c77935', .03, .10, .45],
};
const TRANSPARENT_FILMS = new Set(['Indium tin oxide', 'Silica', 'Alumina']);

// Contours and tight bounds of the supplied FAU wordmark, in SVG units.
const FAU_WORDMARK = `M48.719,66.643l9.744-9.744  v176.95h-9.744V66.643z M77.95,58.462h116.925v-9.743H68.207v116.925h107.622v-9.744H77.95V58.462z M190.5,136.412H97.438V97.437  h79.588l9.744-9.744H97.438V77.95h97.438v-9.744H87.694v77.95h93.19L190.5,136.412z M68.207,233.85h9.743v-48.719h9.744v40.538  l9.743-9.744v-30.794h78.392v-9.744H68.207V233.85z M542.599,48.719v112.053c0,26.074-11.634,48.475-38.78,65.656l-0.219-0.287  c17.838-14.146,29.256-32.316,29.256-55.788V48.719h-9.744V170.19c0,34.979-28.356,61.223-63.334,61.223  s-63.334-26.244-63.334-61.223V56.899l-9.744,9.744v103.71c0,40.36,32.718,70.642,73.078,70.642c0.934,0,9.744,0,9.744,0  c39.742,0,82.821-29.35,82.821-80.08c0-0.048,0-112.196,0-112.196H542.599z M459.777,221.67c29.58,0,53.562-21.908,53.59-51.48l0,0  V56.899l-9.743,9.744v94.129c0,18.834-15.269,31.667-34.103,31.667c-18.834,0-34.103-12.833-34.103-31.667V48.719h-9.744v112.053  c0,24.216,19.631,41.411,43.847,41.411c9.902,0,21.922-4.892,30.085-13.503l0.22,0.287c-7.654,14.195-21.804,22.96-40.048,22.96  c-24.068,0-43.604-17.424-43.842-41.411h-0.005V48.719h-9.744v121.796h0.005C406.393,199.922,430.306,221.67,459.777,221.67z   M243.258,175.387l-24.64,58.463l9.745-0.001l-0.001,0.001h0.001l12.319-29.231h82.554l12.309,29.231h9.743l-16.41-38.976h-84.089  l4.106-9.743h85.624l20.513,48.719h9.743l-24.615-58.463H243.258z M257.595,48.719l-71.61,169.857l6.202,8.42l75.151-178.277  H257.595z M296.57,48.719l75.058,178.277l6.186-8.42L306.313,48.719H296.57z M237.601,165.643l-28.818,68.206h-9.743l73.17-173.562  l40.258,95.612h9.744L277.082,48.719h9.744l49.231,116.925H237.601z M281.978,106.629l-20.764,49.27h41.509L281.978,106.629z   M241.702,155.899h9.769l25.639-60.835l-4.879-11.588L241.702,155.899z`;
const FAU_MASK_WIDTH = .75;
let lightboxMask;
let lightboxMaskCanvas;

function lightboxMaskPath() {
  if (!lightboxMask) {
    const scale = 2 * FAU_MASK_WIDTH / (552.343 - 48.719);
    lightboxMask = new Path2D();
    lightboxMask.addPath(new Path2D(FAU_WORDMARK), {
      a: scale, d: scale, e: -scale * (48.719 + 552.343) / 2, f: -scale * (48.719 + 240.995) / 2,
    });
  }
  return lightboxMask;
}

function lightboxMaskImage() {
  if (!lightboxMaskCanvas) {
    lightboxMaskCanvas = document.createElement('canvas');
    lightboxMaskCanvas.width = lightboxMaskCanvas.height = 512;
    const half = lightboxMaskCanvas.width / 2;
    const ctx = lightboxMaskCanvas.getContext('2d');
    ctx.setTransform(half, 0, 0, half, half, half);
    ctx.fill(lightboxMaskPath());
  }
  return lightboxMaskCanvas;
}

export function lightboxFilmAppearance(profile, model) {
  const centre = Math.floor(profile.length / 2);
  const peak = Math.max(...profile);
  const bare = peak <= .001;
  const roughnessNm = bare ? 0 : (model?.roughnessNm ?? 0);
  const coverage = bare ? 0 : (model?.coverage ?? 1);
  const voidFraction = bare ? 0 : (model?.voidFraction ?? 0);
  // Map the teaching model's heights to perceptual roughness. The scale sets
  // the visual response and is not an optical fit or an absolute gloss value.
  const roughnessScale = (roughnessNm / 17) ** 1.35;
  const roughness = Math.min(.95, .012 + .82 * -Math.expm1(-roughnessScale)
    + .30 * voidFraction + .28 * (1 - coverage));
  const radialProfile = Uint8Array.from(profile.slice(centre), (right, index) => {
    const height = (right + profile[centre - index]) / 2;
    return peak ? Math.round(255 * height / peak) : 0;
  });
  return { bare, centre: profile[centre], edge: (profile[0] + profile.at(-1)) / 2,
    peak, coverage, voidFraction, roughnessNm, roughness, radialProfile };
}

const LIGHTBOX_VERTEX = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const LIGHTBOX_FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 viewport;
uniform vec4 rotation;
uniform sampler2D profileMap;
uniform sampler2D maskMap;
uniform float maskEnabled;
uniform vec2 profileRange;
uniform vec4 filmFinish;
uniform vec4 baseFinish;
uniform float substrateRoughness;
uniform vec4 filmState;
uniform float raking;
uniform float lightBackground;
uniform float baseTransmission;
uniform float zoom;
uniform vec3 filmOpticsN;
uniform vec3 filmOpticsK;
uniform vec3 substrateOpticsN;
uniform vec3 substrateOpticsK;
uniform float filmInterference;

const float RADIUS = 1.0;
const float HALF_THICKNESS = .040;

vec3 spinX(vec3 p, vec2 a) {
  return vec3(p.x, a.x*p.y - a.y*p.z, a.y*p.y + a.x*p.z);
}
vec3 spinY(vec3 p, vec2 a) {
  return vec3(a.x*p.x + a.y*p.z, p.y, -a.y*p.x + a.x*p.z);
}
vec3 local(vec3 p) { return spinX(spinY(p, vec2(rotation.x,-rotation.y)), vec2(rotation.z,-rotation.w)); }
vec3 world(vec3 p) { return spinY(spinX(p, rotation.zw), rotation.xy); }

float surfaceNoise(vec2 p) {
  vec3 q = fract(vec3(p.xyx)*.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y)*q.z);
}

// Exact normal-incidence reflectance of the air / film / substrate stack at
// the three display wavelengths (650, 550, 450 nm). Complex numbers travel as
// (re, im) vec3 pairs, one component per wavelength, matching src/optics.mjs.
void cmul(vec3 ar, vec3 ai, vec3 br, vec3 bi, out vec3 cr, out vec3 ci) {
  cr = ar*br - ai*bi;
  ci = ar*bi + ai*br;
}

vec3 interferenceReflectance(float d) {
  vec3 lambda = vec3(650., 550., 450.);
  vec3 nf = filmOpticsN, kf = filmOpticsK;
  vec3 ns = substrateOpticsN, ks = substrateOpticsK;
  vec3 den01 = (1.+nf)*(1.+nf) + kf*kf;
  vec3 r01r = (1. - nf*nf - kf*kf)/den01;
  vec3 r01i = 2.*kf/den01;
  vec3 den12 = (nf+ns)*(nf+ns) + (kf+ks)*(kf+ks);
  vec3 r12r = ((nf-ns)*(nf+ns) - (ks-kf)*(kf+ks))/den12;
  vec3 r12i = ((nf-ns)*(kf+ks) + (ks-kf)*(nf+ns))/den12;
  vec3 wAtt = exp(-12.56637*kf*d/lambda);
  vec3 wPh = 12.56637*nf*d/lambda;
  vec3 wR = wAtt*cos(wPh), wI = -wAtt*sin(wPh);
  vec3 q01r, q01i;
  cmul(r01r, r01i, r12r, r12i, q01r, q01i);
  vec3 w12r, w12i;
  cmul(r12r, r12i, wR, wI, w12r, w12i);
  vec3 tR = r01r + w12r, tI = r01i + w12i;
  vec3 uR, uI;
  cmul(q01r, q01i, wR, wI, uR, uI);
  uR = uR + 1.;
  vec3 den = uR*uR + uI*uI;
  vec3 rr = (tR*uR + tI*uI)/den;
  vec3 ri = (tI*uR - tR*uI)/den;
  return rr*rr + ri*ri;
}

// Reduced photometric conversion, mirroring displayTint in src/optics.mjs.
vec3 opticsTint(vec3 reflectance) {
  vec3 lin = min(vec3(1.), 1.6*reflectance/(1. + 0.6*reflectance));
  float luma = dot(lin, vec3(.2126, .7152, .0722));
  return clamp(vec3(luma) + 1.5*(lin - vec3(luma)), 0., 1.);
}

float panel(vec3 ray, vec3 aim, vec2 dimensions, float spread) {
  vec3 across = normalize(cross(vec3(0.,1.,0.), aim));
  vec3 up = cross(aim, across);
  float facing = dot(ray, aim);
  vec2 uv = abs(vec2(dot(ray,across), dot(ray,up))) / max(.12,facing);
  vec2 shape = 1. - smoothstep(dimensions, dimensions + spread, uv);
  return shape.x*shape.y*smoothstep(.15,.55,facing);
}

vec3 backdropAt(vec2 pixel) {
  vec2 field = pixel*vec2(.78,1.);
  float falloff = exp(-.82*dot(field,field));
  vec3 dark = mix(vec3(.085,.108,.133),vec3(.27,.31,.35),falloff);
  vec3 pale = mix(vec3(.74,.79,.84),vec3(.97,.98,.99),falloff);
  // The bands behind the sample make transmission easy to see.
  float band = abs(pixel.x + .26*pixel.y + .15);
  pale *= 1. - .18*(1. - smoothstep(.10,.125,band));
  vec2 shadow = (pixel + vec2(.00,.49))*vec2(1.48,5.5);
  return mix(dark,pale,lightBackground) * (1. - mix(.48,.16,lightBackground)*exp(-dot(shadow,shadow)));
}

void main() {
  vec2 pixel = (2.*gl_FragCoord.xy - viewport) / min(viewport.x, viewport.y);
  vec3 ray = normalize(vec3(pixel, -1.87*zoom));
  vec3 origin = local(vec3(0.,0.,3.34));
  vec3 direction = local(ray);
  float plane = direction.z < 0. ? HALF_THICKNESS : -HALF_THICKNESS;
  float depth = 1e3;
  vec3 normal = vec3(0.);
  bool top = false;
  if (abs(direction.z) > .0001) {
    float t = (plane - origin.z)/direction.z;
    vec2 p = origin.xy + t*direction.xy;
    float radius = length(p);
    if (t > 0. && radius <= RADIUS) {
      depth = t;
      float bevel = smoothstep(.967,1.,radius)*.58;
      normal = normalize(vec3(p*bevel, sign(plane)*(1.-bevel)));
      top = plane > 0.;
    }
  }
  float a = dot(direction.xy,direction.xy);
  float b = dot(origin.xy,direction.xy);
  float c = dot(origin.xy,origin.xy)-1.;
  float disc = b*b-a*c;
  if (a > .0001 && disc >= 0.) {
    float t = (-b - sqrt(disc))/a;
    vec3 side = origin + t*direction;
    if (t > 0. && t < depth && abs(side.z) <= HALF_THICKNESS) {
      depth = t;
      normal = normalize(vec3(side.xy, 10.*side.z));
      top = false;
    }
  }
  if (depth >= 1e3) {
    gl_FragColor = vec4(backdropAt(pixel),1.);
    return;
  }

  vec3 point = origin + depth*direction;
  float thickness = texture2D(profileMap, vec2(mix(profileRange.x,1.-profileRange.x,length(point.xy)),.5)).r * profileRange.y;
  float rough = filmState.x;
  float continuity = filmState.y;
  float porosity = filmState.z;
  vec2 cell = point.xy*47.;
  vec2 id = floor(cell);
  vec2 jitter = vec2(surfaceNoise(id+vec2(2.,21.)),surfaceNoise(id+vec2(32.,5.)))-.5;
  float hole = surfaceNoise(id);
  float patch = length(fract(cell)-.5-.46*jitter);
  float pinhole = (1.-step(min(.82,(1.-continuity)*1.8),hole)) * (1.-smoothstep(.15,.43,patch));
  pinhole = mix(step(continuity,hole),pinhole,smoothstep(.15,.55,continuity));
  float pit = (1.-step(porosity*.58,hole)) * (1.-smoothstep(.05,.22,patch));
  float mottling = surfaceNoise(floor(point.xy*17.));
  float metal = filmFinish.a;
  float opacity = (1.-exp(-thickness/mix(13.,6.,metal))) * (1.-pinhole);
  if (!top) opacity = 0.;
  else if (maskEnabled > .5) {
    // Wafer-local coordinates keep the uncoated area attached to the surface.
    opacity *= 1. - texture2D(maskMap, .5 + .5*vec2(point.x, -point.y)).a;
  }
  float localRoughness = mix(substrateRoughness, min(.98,rough + .22*pit), opacity);
  vec3 filmTint = filmFinish.rgb;
  vec3 throughTint = vec3(1.);
  if (filmInterference > .5 && opacity > .0005) {
    vec3 reflectance = interferenceReflectance(thickness);
    // Rough or islanded films scatter light away from the mirror reflection,
    // so the interference colour fades towards the painted finish there.
    float gate = opacity*(1. - smoothstep(.28,.60,localRoughness));
    vec3 interference = opticsTint(reflectance);
    filmTint = mix(filmTint, interference, gate);
    throughTint = mix(vec3(1.), opticsTint(vec3(1.) - reflectance), gate);
  }
  vec3 tint = mix(baseFinish.rgb, filmTint, opacity*mix(.20,1.,metal));
  float metallic = mix(baseFinish.a, metal, opacity);
  vec3 n = world(normal);
  float facing = max(0.,dot(n,-ray));
  vec3 reflection = reflect(ray,n);
  // Keep the clean mirror edge antialiased at the current pixel size.
  // Surface scatter broadens the analytic reflection without pixel noise.
  float spread = 1.8/min(viewport.x,viewport.y) + .47*pow(localRoughness,1.55);
  vec3 primaryAim = normalize(mix(vec3(-.38,.73,.60),vec3(-.92,.28,.39),raking));
  float key = panel(reflection,primaryAim,mix(vec2(.29,.145),vec2(.26,.06),raking),spread);
  float fill = panel(reflection,normalize(vec3(.67,-.23,.72)),vec2(.15,.42),spread*.9);
  float gloss = 1.-localRoughness;
  float sheen = gloss*gloss * (1.-.64*filmState.w*opacity);
  vec3 f0 = mix(vec3(.045),tint,metallic);
  vec3 fresnel = f0 + (1.-f0)*pow(1.-facing,5.);
  vec3 reflected = vec3(.17,.21,.26)
    + sheen*(key*vec3(3.1,3.0,2.77) + fill*vec3(1.28,1.45,1.72));
  float sideLight = .26+.56*max(0.,dot(n,primaryAim)) + .14*max(0.,n.z);
  vec3 diffuse = tint*sideLight*mix(.93,.31,metallic);
  float blemish = 1. - opacity*((.40+.14*raking)*pit + (.24*porosity + .16*rough*rough)*mottling);
  vec3 rgb = max(vec3(0.),(diffuse + reflected*fresnel)*blemish);
  rgb = rgb/(1.+.52*rgb);
  vec3 lit = pow(clamp(rgb,0.,1.),vec3(.4545));
  float transmission = baseTransmission * (1. - opacity*smoothstep(.15,.55,metal));
  if (transmission < .001) {
    gl_FragColor = vec4(lit,1.);
    return;
  }
  // With interference the film transmittance multiplies the substrate's own
  // transmission tint instead of reusing the reflected tint.
  vec3 filmFilter = filmInterference > .5
    ? pow(clamp(throughTint,0.,1.),vec3(.4545))*pow(clamp(baseFinish.rgb,0.,1.),vec3(.4545))
    : pow(clamp(tint,0.,1.),vec3(.4545));
  vec3 filterColour = mix(vec3(1.),filmFilter,.15+.09*opacity);
  vec3 throughSample = filterColour * backdropAt(pixel + .024*point.xy);
  float glare = max(key,fill)*sheen;
  float reflectedShare = max(fresnel.r,max(fresnel.g,fresnel.b));
  gl_FragColor = vec4(mix(lit,throughSample,transmission*(1.-reflectedShare)*(1.-.55*glare)),1.);
}
`;

function lightboxGL(canvas) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
  if (!gl) return null;
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, LIGHTBOX_VERTEX], [gl.FRAGMENT_SHADER, LIGHTBOX_FRAGMENT]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, Float32Array.of(-1,-1, 3,-1, -1,3), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lightboxMaskImage());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.uniform1i(gl.getUniformLocation(program, 'maskMap'), 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const uniforms = ['viewport','rotation','profileRange','filmFinish','baseFinish','substrateRoughness',
    'filmState','raking','lightBackground','baseTransmission','zoom','maskEnabled',
    'filmOpticsN','filmOpticsK','substrateOpticsN','substrateOpticsK','filmInterference'];
  return { gl, uniform: Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(program, name)])) };
}

function finishChannels(colour, metallic) {
  const channels = colour.slice(1).match(/.{2}/g).map((hex) => (parseInt(hex,16) / 255) ** 2.2);
  return [...channels, metallic];
}

function pointerSpan(pointers) {
  if (pointers.size !== 2) return 0;
  const [[ax,ay],[bx,by]] = pointers.values();
  return Math.hypot(ax - bx, ay - by);
}

export class FilmLightbox {
  constructor(canvas, status, workerCode, { shareCamera, pixelLimit, maskEnabled = true } = {}) {
    this.canvas = canvas;
    this.status = status;
    this.gpu = lightboxGL(canvas);
    this.ctx = this.gpu ? null : canvas.getContext('2d');
    this.worker = null;
    this.lighting = 'studio';
    this.background = 'dark';
    this.maskEnabled = maskEnabled;
    this.pointers = new Map();
    this.frame = 0;
    this.resetView();
    this.shareCamera = shareCamera;
    this.pixelLimit = pixelLimit;
    if (workerCode) try {
      const url = URL.createObjectURL(new Blob([workerCode], {type:'text/javascript'}));
      try { this.worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
      this.worker.onmessage = ({ data }) => this.accept(data);
      this.worker.onerror = () => {
        this.worker.terminate();
        this.worker = null;
        const request = this.queued ?? this.active;
        this.queued = undefined;
        this.active = undefined;
        this.start(request);
      };
    } catch { /* Offline fallback uses the same summary calculation. */ }
    this.resizeObserver = new ResizeObserver(() => this.schedule());
    this.resizeObserver.observe(canvas);
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || this.pointers.size >= 2) return;
      this.pointers.set(event.pointerId, [event.clientX, event.clientY]);
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      const position = this.pointers.get(event.pointerId);
      if (!position) return;
      const [x,y] = position;
      const span = pointerSpan(this.pointers);
      this.pointers.set(event.pointerId, [event.clientX, event.clientY]);
      if (this.pointers.size === 1) this.rotate((event.clientX - x) * .013, (event.clientY - y) * .013);
      else if (span > 1) this.zoomBy(pointerSpan(this.pointers) / span);
    });
    for (const event of ['pointerup','lostpointercapture','pointercancel']) {
      canvas.addEventListener(event, ({ pointerId }) => {
        if (this.pointers.delete(pointerId)) this.schedule();
      });
    }
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      this.zoomBy(Math.exp(-event.deltaY * unit * .002));
    }, { passive: false });
    canvas.addEventListener('keydown', (event) => {
      if (['+','=','-'].includes(event.key)) {
        event.preventDefault();
        this.zoomBy(event.key === '-' ? 1/1.15 : 1.15);
        return;
      }
      const step = { ArrowLeft: [-.14,0], ArrowRight: [.14,0], ArrowUp: [0,-.14], ArrowDown: [0,.14] }[event.key];
      if (!step) return;
      event.preventDefault();
      this.rotate(...step);
    });
  }

  resetView() {
    this.angles = [-.21,-.51];
    this.zoom = 1;
    this.viewChanged();
  }

  zoomBy(factor) {
    this.zoom = Math.max(.60, Math.min(3.2, this.zoom * factor));
    this.viewChanged();
  }

  rotate(yaw, pitch) {
    this.angles[0] = (this.angles[0] + yaw) % (2 * Math.PI);
    this.angles[1] = Math.max(-1.48, Math.min(1.48, this.angles[1] + pitch));
    this.viewChanged();
  }

  viewChanged() {
    this.schedule();
    this.shareCamera?.(this);
  }

  copyCamera(source) {
    this.angles = [...source.angles];
    this.zoom = source.zoom;
    this.schedule();
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.worker?.terminate();
    cancelAnimationFrame(this.frame);
    this.gpu?.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  request(request) {
    if (this.key === request.key) return;
    this.key = request.key;
    if (this.active) this.queued = request;
    else this.start(request);
  }

  start(request) {
    if (!request) return;
    this.active = request;
    if (Math.max(...request.profile) <= .001) { this.accept(null); return; }
    if (Object.hasOwn(request, 'model')) { this.accept(request.model); return; }
    if (this.worker) this.worker.postMessage(request.input);
    else setTimeout(() => this.accept(makeMorphology(request.input)), 0);
  }

  accept(model) {
    const { profile, film, wafer, name } = this.active;
    const appearance = lightboxFilmAppearance(profile, model);
    this.appearance = appearance;
    this.filmColour = FILM_COLOURS[film.name] ?? film.colour;
    this.opticsFilm = FILM_OPTICS[film.name] ? film.name : null;
    this.wafer = wafer;
    const transparent = TRANSPARENT_FILMS.has(film.name);
    const [substrateColour, substrateMetal, substrateRoughness, transmission] = SUBSTRATE_FINISH[wafer] ?? SUBSTRATE_FINISH.silicon;
    this.substrateColour = substrateColour;
    this.transmission = transmission;
    this.transparentFilm = transparent;
    const finish = appearance.bare ? 'Bare substrate'
      : `${film.formula ?? film.name} · ${appearance.centre.toFixed(1)} nm centre · ${appearance.edge.toFixed(1)} nm edge`;
    const surface = appearance.bare ? '' : ` · RMS ${appearance.roughnessNm.toFixed(1)} nm`;
    const defects = !appearance.bare && appearance.coverage < .995 ? ` · ${Math.round(100 * appearance.coverage)}% covered` : '';
    this.status.textContent = `${finish}${surface}${defects}`;
    this.canvas.setAttribute('aria-label', `${this.gpu ? 'Rotatable lightbox sample' : 'Lightbox illustration'}. ${name}. ${finish}.`);
    if (this.gpu) {
      const { gl, uniform } = this.gpu;
      const { radialProfile, roughness, coverage, voidFraction, roughnessNm, peak } = appearance;
      const scatter = (4 * Math.PI * roughnessNm / 550) ** 2;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, radialProfile.length, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, radialProfile);
      gl.uniform2f(uniform.profileRange, .5 / radialProfile.length, peak);
      gl.uniform4fv(uniform.filmFinish, finishChannels(this.filmColour, transparent ? .04 : .82));
      gl.uniform4fv(uniform.baseFinish, finishChannels(substrateColour, substrateMetal));
      const filmOptics = FILM_OPTICS[film.name] ?? SUBSTRATE_OPTICS.silicon;
      const substrateOptics = SUBSTRATE_OPTICS[wafer] ?? SUBSTRATE_OPTICS.silicon;
      gl.uniform3fv(uniform.filmOpticsN, Float32Array.from(filmOptics, ([n]) => n));
      gl.uniform3fv(uniform.filmOpticsK, Float32Array.from(filmOptics, ([, k]) => k));
      gl.uniform3fv(uniform.substrateOpticsN, Float32Array.from(substrateOptics, ([n]) => n));
      gl.uniform3fv(uniform.substrateOpticsK, Float32Array.from(substrateOptics, ([, k]) => k));
      gl.uniform1f(uniform.filmInterference, FILM_OPTICS[film.name] ? 1 : 0);
      gl.uniform1f(uniform.substrateRoughness, substrateRoughness);
      gl.uniform1f(uniform.baseTransmission, transmission);
      gl.uniform4f(uniform.filmState, roughness, coverage, voidFraction, -Math.expm1(-scatter));
    }
    this.schedule();
    this.active = undefined;
    if (this.queued) {
      const next = this.queued;
      this.queued = undefined;
      this.start(next);
    }
  }

  setLighting(lighting) {
    this.lighting = lighting;
    this.schedule();
  }

  setBackground(background) {
    this.background = background;
    this.canvas.dataset.background = background;
    this.schedule();
  }

  setMaskEnabled(enabled) {
    this.maskEnabled = enabled;
    this.schedule();
  }

  schedule() {
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); });
  }

  draw() {
    const { canvas, appearance } = this;
    if (!appearance || !canvas.clientWidth || !canvas.clientHeight) return;
    const moving = this.pointers.size > 0;
    const pixelLimit = Math.min(this.pixelLimit ?? Infinity, moving ? 260000 : 780000);
    const density = Math.min(moving ? 1.45 : 1.75, devicePixelRatio || 1, Math.sqrt(pixelLimit / (canvas.clientWidth * canvas.clientHeight)));
    const width = Math.max(1, Math.round(canvas.clientWidth * density));
    const height = Math.max(1, Math.round(canvas.clientHeight * density));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    if (!this.gpu) { this.drawIllustration(width,height); return; }
    const { gl, uniform } = this.gpu;
    gl.viewport(0,0,width,height);
    gl.uniform2f(uniform.viewport,width,height);
    const [yaw,pitch] = this.angles;
    gl.uniform4f(uniform.rotation,Math.cos(yaw),Math.sin(yaw),Math.cos(pitch),Math.sin(pitch));
    gl.uniform1f(uniform.raking, Number(this.lighting === 'raking'));
    gl.uniform1f(uniform.lightBackground, Number(this.background === 'light'));
    gl.uniform1f(uniform.zoom, this.zoom);
    gl.uniform1f(uniform.maskEnabled, Number(this.maskEnabled && !appearance.bare));
    gl.drawArrays(gl.TRIANGLES,0,3);
  }

  drawIllustration(width, height) {
    const ctx = this.ctx;
    if (!ctx) return;
    const [yaw,pitch] = this.angles;
    const roundness = Math.cos(yaw) * Math.cos(pitch);
    const radius = Math.min(width,height) * .30 * this.zoom;
    const colour = this.appearance.bare || roundness < 0 ? this.substrateColour : this.filmColour;
    ctx.fillStyle = this.background === 'light' ? '#e5ecef' : '#242d36';
    ctx.fillRect(0,0,width,height);
    if (this.background === 'light') {
      ctx.fillStyle = '#c1cdd7';
      ctx.fillRect(width/2 - height*.13,0,height*.12,height);
    }
    ctx.save();
    ctx.translate(width/2,height/2);
    ctx.rotate(.45*Math.sin(yaw));
    ctx.scale(1,Math.max(.06,Math.abs(roundness)));
    const gloss = 1 - this.appearance.roughness;
    const highlight = ctx.createLinearGradient(-radius,-radius,radius,radius);
    const centre = .5 + .29*Math.sin(yaw - pitch + (this.lighting === 'raking' ? .85 : 0));
    const spread = .009 + .32*this.appearance.roughness ** 1.35;
    highlight.addColorStop(0,colour);
    highlight.addColorStop(Math.max(.02,centre-spread),colour);
    highlight.addColorStop(centre,`rgba(255,255,255,${.23 + .60*gloss})`);
    highlight.addColorStop(Math.min(.98,centre+spread),colour);
    highlight.addColorStop(1,colour);
    let fillStyle = highlight;
    const { peak, radialProfile: rings } = this.appearance;
    if (!this.appearance.bare && this.opticsFilm && roundness > 0 && peak > 0) {
      // Interference rings keyed to the modelled radial thickness profile.
      const interference = ctx.createRadialGradient(0,0,0,0,0,radius);
      const stops = Math.min(rings.length, 24);
      for (let stop = 0; stop < stops; stop++) {
        const index = Math.round(stop * (rings.length - 1) / (stops - 1));
        const thickness = rings[index] / 255 * peak;
        interference.addColorStop(stop / (stops - 1),
          stackColourCSS(stackColour(this.opticsFilm, thickness, this.wafer)));
      }
      fillStyle = interference;
    }
    ctx.strokeStyle = '#b7c8d1';
    ctx.lineWidth = Math.max(1,radius*.025);
    const disk = new Path2D();
    disk.arc(0, 0, radius, 0, Math.PI * 2);
    const opaqueCoating = this.transparentFilm ? 0 : this.appearance.coverage * -Math.expm1(-this.appearance.peak / 6);
    const masked = this.maskEnabled && roundness > 0 && !this.appearance.bare;
    if (masked) {
      const bareArea = new Path2D();
      bareArea.addPath(lightboxMaskPath(), { a: radius, d: radius });
      ctx.fillStyle = this.substrateColour;
      ctx.globalAlpha = 1 - this.transmission * .78;
      ctx.fill(bareArea);
      const coatedArea = new Path2D(bareArea);
      coatedArea.addPath(disk);
      ctx.save();
      ctx.clip(coatedArea, 'evenodd');
    }
    ctx.fillStyle = fillStyle;
    ctx.globalAlpha = 1 - this.transmission * (1 - (roundness > 0 ? opaqueCoating : 0)) * .78;
    ctx.fill(disk);
    ctx.globalAlpha = 1;
    if (roundness > 0 && !this.appearance.bare) {
      const flaws = Math.round(100 * (1 - this.appearance.coverage + this.appearance.voidFraction));
      ctx.fillStyle = '#28333a90';
      for (let i = 0; i < flaws; i++) {
        const angle = 2.399963 * i;
        const r = radius * .95 * Math.sqrt((i + .5) / flaws);
        ctx.beginPath();
        ctx.arc(r * Math.cos(angle), r * Math.sin(angle), Math.max(1, radius * .019), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (masked) ctx.restore();
    ctx.globalAlpha = 1;
    ctx.stroke(disk);
    ctx.restore();
  }
}
