import { makeMorphology } from './microstructure.mjs';

const SEM_VERTEX = `
attribute vec3 position;
attribute vec3 normal;
attribute vec2 appearance;
uniform vec2 yaw;
uniform vec2 pitch;
uniform vec2 scale;
uniform vec3 centre;
varying vec3 surfaceNormal;
varying vec2 surface;
vec3 rotate(vec3 p) {
  vec3 r = vec3(yaw.x*p.x-yaw.y*p.y, yaw.y*p.x+yaw.x*p.y, p.z);
  return vec3(r.x, pitch.x*r.y + pitch.y*r.z, pitch.x*r.z-pitch.y*r.y);
}
void main() {
  vec3 p = rotate(position - centre);
  gl_Position = vec4(p.xy * scale, -p.z * min(scale.x,scale.y)*0.6, 1.);
  surfaceNormal = rotate(normal);
  surface = appearance;
}`;

const SEM_FRAGMENT = `
precision mediump float;
varying vec3 surfaceNormal;
varying vec2 surface;
void main() {
  vec3 n = normalize(surfaceNormal + vec3(0.,0.,0.00001));
  float facing = abs(n.z);
  float detector = max(0., dot(n, normalize(vec3(-0.65,0.66,0.40))));
  float edge = 0.21 * pow(1.-facing, 1.65);
  float noise = fract(sin(dot(mod(gl_FragCoord.xy,211.),vec2(12.9898,78.233)))*4375.5453)-0.5;
  float shade = (0.25 + 0.53*detector + edge + 0.26*facing) * surface.x * (0.41 + 0.64*surface.y);
  gl_FragColor = vec4(vec3(clamp(shade + 0.043*noise, 0.055, 0.95)),1.);
}`;

function microscopeGL(canvas) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: true });
  if (!gl) return null;
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, SEM_VERTEX], [gl.FRAGMENT_SHADER, SEM_FRAGMENT]]) {
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
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  for (const [name, length, offset] of [['position',3,0],['normal',3,12],['appearance',2,24]]) {
    const id = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(id);
    gl.vertexAttribPointer(id, length, gl.FLOAT, false, 32, offset);
  }
  const uniform = Object.fromEntries(['yaw','pitch','scale','centre'].map(name => [name, gl.getUniformLocation(program, name)]));
  gl.enable(gl.DEPTH_TEST);
  return { gl, uniform };
}

export class FilmMicroscope {
  constructor(canvas, status, workerCode) {
    this.canvas = canvas;
    this.status = status;
    this.rotation = [-.61, .83];
    this.key = '';
    this.busy = false;
    this.next = undefined;
    this.gpu = microscopeGL(canvas);
    this.ctx = this.gpu ? null : canvas.getContext('2d');
    this.model = null;
    this.worker = null;
    try {
      const url = URL.createObjectURL(new Blob([workerCode], {type:'text/javascript'}));
      try { this.worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
      this.worker.onmessage = ({ data }) => this.display(data);
      this.worker.onerror = () => {
        this.worker.terminate();
        this.worker = null;
        const request = this.next ?? this.active;
        this.busy = false;
        if (request) this.dispatch(request);
      };
    } catch { /* The same kernel can run in the page for offline restrictions. */ }
    new ResizeObserver(() => this.draw()).observe(canvas);
    canvas.addEventListener('pointerdown', (event) => {
      if (!this.gpu) return;
      this.drag = [event.clientX, event.clientY];
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.drag) return;
      const [x,y] = this.drag;
      this.rotate((event.clientX - x) * .013, (event.clientY - y) * .013);
      this.drag = [event.clientX, event.clientY];
    });
    for (const event of ['pointerup','lostpointercapture','pointercancel']) canvas.addEventListener(event, () => { this.drag = null; });
    canvas.addEventListener('keydown', (event) => {
      const adjustments = {ArrowLeft:[-.16,0], ArrowRight:[.16,0], ArrowUp:[0,-.16], ArrowDown:[0,.16]};
      if (!this.gpu || !adjustments[event.key]) return;
      event.preventDefault();
      this.rotate(...adjustments[event.key]);
    });
  }

  rotate(yaw, pitch) {
    this.rotation[0] += yaw;
    this.rotation[1] = Math.max(.03, Math.min(1.33, this.rotation[1] + pitch));
    this.draw();
  }

  setView(view) {
    this.rotation = view === 'top' ? [0,.03] : [-.61,.83];
    this.draw();
  }

  request(key, segments, reference) {
    if (this.key === key) return;
    this.key = key;
    const request = { segments, reference };
    if (this.busy) this.next = request;
    else this.dispatch(request);
  }

  dispatch(request) {
    this.active = request;
    this.busy = true;
    if (this.worker) this.worker.postMessage(request);
    else setTimeout(() => this.display(makeMorphology(request)), 0);
  }

  display(model) {
    this.model = model;
    this.busy = false;
    if (this.gpu) {
      const { gl } = this.gpu;
      gl.bufferData(gl.ARRAY_BUFFER, model.mesh, gl.DYNAMIC_DRAW);
    }
    const roughness = model.roughnessNm > 0 && model.roughnessNm < .1 ? '&lt; 0.1' : `≈ ${model.roughnessNm.toFixed(1)}`;
    this.status.innerHTML = model.count
      ? `${Math.round(model.coverage * 100)}% area covered · ${Math.round(model.voidFraction * 100)}% voids in envelope · <span class="roughness" title="Modelled areal RMS height relative to the mean plane">S<sub>q</sub> ${roughness} nm</span>`
      : 'Bare substrate';
    const rendering = this.gpu ? 'SEM-style 3D view' : '2D height fallback';
    this.canvas.setAttribute('aria-label', `${rendering}. ${this.status.textContent}.`);
    this.draw();
    if (this.next) {
      const request = this.next;
      this.next = undefined;
      this.dispatch(request);
    }
  }

  draw() {
    if (!this.model || !this.canvas.clientWidth || !this.canvas.clientHeight) return;
    const density = Math.min(2, devicePixelRatio);
    const w = Math.round(this.canvas.clientWidth * density);
    const h = Math.round(this.canvas.clientHeight * density);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    if (!this.gpu) { this.drawTop(w,h); return; }
    const { gl, uniform } = this.gpu;
    const { size, highest, mesh } = this.model;
    const [yaw,pitch] = this.rotation;
    const spanX = size * (Math.abs(Math.cos(yaw)) + Math.abs(Math.sin(yaw)));
    const spanY = spanX * Math.cos(pitch) + (highest + 3) * Math.sin(pitch);
    const unit = 1.69 * Math.min(w / spanX, h / spanY);
    gl.viewport(0,0,w,h);
    gl.clearColor(.078,.087,.10,1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform2f(uniform.yaw, Math.cos(yaw), Math.sin(yaw));
    gl.uniform2f(uniform.pitch, Math.cos(pitch), Math.sin(pitch));
    gl.uniform2f(uniform.scale, unit/w, unit/h);
    gl.uniform3f(uniform.centre, (size - 1)/2, (size - 1)/2, (highest - 3)/2);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.length / 8);
  }

  drawTop(w,h) {
    if (!this.ctx) return;
    const { size, tops, highest } = this.model;
    const step = Math.min(w,h) * .84 / size;
    const left = (w - step * size) / 2, top = (h - step * size) / 2;
    this.ctx.fillStyle = '#141619';
    this.ctx.fillRect(0,0,w,h);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const level = tops[x + y * size];
        const gray = level ? 85 + Math.round(153 * level / highest) : 53;
        this.ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
        this.ctx.fillRect(left + x*step, top + y*step, Math.ceil(step), Math.ceil(step));
      }
    }
  }
}
