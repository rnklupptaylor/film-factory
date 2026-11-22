import { makeMorphology } from './microstructure.mjs';

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
uniform vec2 profileRange;
uniform vec4 filmFinish;
uniform vec4 baseFinish;
uniform float substrateRoughness;
uniform vec4 filmState;
uniform float raking;
uniform float lightBackground;
uniform float baseTransmission;
uniform float zoom;

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
  float localRoughness = mix(substrateRoughness, min(.98,rough + .22*pit), opacity);
  vec3 tint = mix(baseFinish.rgb, filmFinish.rgb, opacity*mix(.20,1.,metal));
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
  vec3 filterColour = mix(vec3(1.),pow(clamp(tint,0.,1.),vec3(.4545)),.15+.09*opacity);
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
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const uniforms = ['viewport','rotation','profileRange','filmFinish','baseFinish','substrateRoughness',
    'filmState','raking','lightBackground','baseTransmission','zoom'];
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
  constructor(canvas, status, workerCode, { shareCamera, pixelLimit } = {}) {
    this.canvas = canvas;
    this.status = status;
    this.gpu = lightboxGL(canvas);
    this.ctx = this.gpu ? null : canvas.getContext('2d');
    this.worker = null;
    this.lighting = 'studio';
    this.background = 'dark';
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
    ctx.fillStyle = highlight;
    ctx.strokeStyle = '#b7c8d1';
    ctx.lineWidth = Math.max(1,radius*.025);
    ctx.beginPath();
    ctx.arc(0,0,radius,0,Math.PI*2);
    const opaqueCoating = this.transparentFilm ? 0 : this.appearance.coverage * -Math.expm1(-this.appearance.peak / 6);
    ctx.globalAlpha = 1 - this.transmission * (1 - (roundness > 0 ? opaqueCoating : 0)) * .78;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
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
    ctx.restore();
  }
}
