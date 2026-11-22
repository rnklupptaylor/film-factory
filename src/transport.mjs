import { CHAMBER, sourceLevel } from './chamber.mjs';
import { processGas } from './instruments.mjs';

const TRACER_LIMIT = 190;
const ARGON_MASS = 39.95;
const GAS_TRACERS = { Ar: ['gas-argon', ARGON_MASS, '#a9ebad'], 'N₂': ['nitrogen', 28.01, '#f5cb91'], 'O₂': ['oxygen', 32, '#ffb2b9'] };
const TAU = 2 * Math.PI;
const ARC_FLASH_SECONDS = .16;
const uniform = (random, min, max) => min + random() * (max - min);
const opticalDepth = (random) => -Math.log(Math.max(1e-8, 1 - random()));
const fluxCount = (rate) => rate <= 0 ? 0 : Math.min(115, 34 * Math.log1p(40 * rate));

// Compress very short free flights for legibility in the gap. The numerical
// deposition model continues to use its unmodified mean free path.
export function displayFreePath(lambda, gapCm) {
  const unitsPerMetre = (sourceLevel(gapCm) - CHAMBER.plateY) / (gapCm / 100);
  return Math.max(12, lambda * unitsPerMetre);
}

function contact(particle, dt, sourceY) {
  const { x, y, vx, vy } = particle;
  const side = vx < 0 ? CHAMBER.left : CHAMBER.right;
  const wallX = vx ? (side - x) / vx : Infinity;
  const wallY = vy ? ((vy < 0 ? CHAMBER.top : CHAMBER.bottom) - y) / vy : Infinity;
  let time = Math.min(dt, wallX, wallY);
  let kind = wallX <= dt || wallY <= dt ? 'wall' : '';
  const plateTime = (CHAMBER.plateY - y) / vy;
  const plateX = x + vx * plateTime;
  if (vy < 0 && plateTime >= 0 && plateTime <= time && plateX >= CHAMBER.plateLeft && plateX <= CHAMBER.plateRight) {
    time = plateTime;
    kind = particle.kind === 'atom' ? 'deposit' : 'wall';
  }
  const sourceTime = (sourceY - y) / vy;
  const sx = x + vx * sourceTime;
  if (vy > 0 && sourceTime >= 0 && sourceTime <= time && sx > CHAMBER.targetLeft && sx < CHAMBER.targetRight) {
    time = sourceTime;
    kind = 'wall';
  }
  return { time, kind };
}

function scatter(particle, random) {
  // Elastic binary collision in the centre-of-mass frame, projected into
  // the diagram plane. A thermal velocity floor avoids frozen tracers.
  const angle = uniform(random, 0, TAU);
  const gasAngle = uniform(random, 0, TAU);
  const gasSpeed = 54 * Math.sqrt(opticalDepth(random));
  const gasX = gasSpeed * Math.cos(gasAngle);
  const gasY = gasSpeed * Math.sin(gasAngle);
  const collisionMass = particle.mass + ARGON_MASS;
  const relativeSpeed = Math.hypot(particle.vx - gasX, particle.vy - gasY);
  particle.vx = (particle.mass * particle.vx + ARGON_MASS * (gasX + relativeSpeed * Math.cos(angle))) / collisionMass;
  particle.vy = (particle.mass * particle.vy + ARGON_MASS * (gasY + relativeSpeed * Math.sin(angle))) / collisionMass;
  particle.depth = opticalDepth(random);
}

function neutralStep(particle, dt, meanPath, sourceY, random) {
  for (let remaining = dt, flight = 0; remaining > 1e-5 && flight < 8; flight++) {
    const speed = Math.hypot(particle.vx, particle.vy);
    if (speed < 1e-4) return 'wall';
    const collisionTime = particle.depth * meanPath / speed;
    const step = contact(particle, Math.min(remaining, collisionTime), sourceY);
    particle.x += step.time * particle.vx;
    particle.y += step.time * particle.vy;
    if (step.kind) return step.kind;
    remaining -= step.time;
    if (step.time < collisionTime) {
      particle.depth -= step.time * speed / meanPath;
      return '';
    }
    scatter(particle, random);
    particle.trail?.push([particle.x, particle.y]);
  }
  return '';
}

function guidedStep(particle, dt) {
  particle.u = Math.min(1, particle.u + dt / particle.duration);
  const { u, from, to, through, waypoints } = particle;
  if (waypoints) {
    const position = u * (waypoints.length - 1);
    const index = Math.min(waypoints.length - 2, Math.floor(position));
    const [x,y] = waypoints[index];
    const [nextX,nextY] = waypoints[index + 1];
    particle.x = x + (nextX - x) * (position - index);
    particle.y = y + (nextY - y) * (position - index);
  } else if (through) {
    const inv = 1 - u;
    particle.x = inv ** 2 * from[0] + 2 * u * inv * through[0] + u ** 2 * to[0];
    particle.y = inv ** 2 * from[1] + 2 * u * inv * through[1] + u ** 2 * to[1];
  } else {
    const sheath = Math.max(0, (u - .61) / .39);
    const progress = particle.beam ? u : .69 * u + .31 * sheath ** 2;
    particle.x = from[0] + (to[0] - from[0]) * progress;
    particle.y = from[1] + (to[1] - from[1]) * progress;
  }
  return u < 1 ? '' : particle.destination;
}

export class ChamberTransport {
  constructor(random = Math.random, arcRandom = Math.random) {
    this.random = random;
    this.arcRandom = arcRandom;
    this.clear();
  }

  clear() {
    this.particles = [];
    this.impacts = [];
    this.gasParticles = [];
    this.gasBudget = 0;
    this.fill = 0;
    this.budgets = {};
    this.clock = 0;
    this.darkTime = 1;
    this.clearTargetArc();
    this.power = { plasma: 0, heat: 0, beam: 0, holder: 0 };
  }

  get visible() {
    return this.particles.length > 0 || this.impacts.length > 0 || this.gasParticles.length > 0
      || this.fill > 0 || Object.values(this.power).some((power) => power > 0);
  }

  clearTargetArc() {
    this.targetArc = null;
    this.arcCooldown = 0;
  }

  updateTargetArc(dt, arcing, sourceY, pulse) {
    if (!arcing) {
      this.clearTargetArc();
      return;
    }
    if (this.targetArc && (this.targetArc.age += dt) >= ARC_FLASH_SECONDS) this.targetArc = null;
    this.arcCooldown = Math.max(0, this.arcCooldown - dt);
    if (this.arcCooldown > 0 || !pulse) return;
    const random = this.arcRandom;
    if (random() >= -Math.expm1(-arcing.flashRate * dt)) return;
    // The localised, time-stretched flashes are illustrative. Limit their
    // cadence and keep the high-contrast region close to the cathode face.
    this.arcCooldown = .52;
    const x = (random() < .5 ? 259 : 341) + uniform(random, -24, 24);
    this.targetArc = { x, y: sourceY - 1, age: 0, tilt: uniform(random, -5, 5) };
  }

  emit(kind, x, y, speed, direction, mass) {
    if (this.particles.length >= TRACER_LIMIT) return;
    const sine = uniform(this.random, -1, 1);
    this.particles.push({
      kind, x, y, vx: speed * sine, vy: direction * speed * Math.sqrt(1 - sine ** 2), mass,
      depth: opticalDepth(this.random), trail: [], age: 0, sinceTrail: 0,
    });
  }

  guide(kind, from, to, duration, destination, { through, beam, waypoints } = {}) {
    if (this.particles.length >= TRACER_LIMIT) return;
    this.particles.push({
      kind, from, to, x: from[0], y: from[1], duration, destination, through, beam, waypoints, u: 0,
      trail: [], age: 0, sinceTrail: 0,
    });
  }

  highlightCollectedVapour(dt, config, sample, sourceY) {
    // At collisional pressures most displayed flights disperse. Sample a
    // small number of trajectories conditioned on collection at the substrate.
    const rate = 19 * sample.gross / (.14 + sample.gross);
    const random = this.random;
    this.produce('collector', rate, dt, () => {
      const from = [uniform(random, 252, 348), sourceY - 2];
      const to = [uniform(random, 212, 388), CHAMBER.plateY];
      const segments = config.classic ? 6 : 1;
      const waypoints = [from];
      for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const x = from[0] + (to[0] - from[0]) * t + uniform(random, -28, 28);
        const y = from[1] + (to[1] - from[1]) * t + uniform(random, -11, 11);
        waypoints.push([x, y]);
      }
      waypoints.push(to);
      this.guide('atom', from, to, uniform(random, .80, 1.28), 'deposit', { waypoints });
    });
  }

  produce(key, rate, dt, spawn) {
    let budget = (this.budgets[key] ?? 0) + rate * dt;
    while (budget >= 1) {
      budget--;
      spawn();
    }
    this.budgets[key] = budget;
  }

  spawn(dt, config, method, settings, sample, mass, sourceY, pulse) {
    const random = this.random;
    const sputtering = config.family === 'sputtering';
    if (sputtering) {
      const current = sample.targetIonOn;
      this.produce('target', pulse ? 21 + 82 * current : 0, dt, () => {
        const x = config.diode ? uniform(random, CHAMBER.targetLeft + 2, CHAMBER.targetRight - 2)
          : (random() < .5 ? 259 : 341) + uniform(random, -22, 22);
        const origin = config.diode ? [x + uniform(random, -50, 50), sourceY - uniform(random, 70, 145)]
          : [x + uniform(random, -16, 16), sourceY - uniform(random, 24, 58)];
        const duration = config.diode ? uniform(random, .29, .55) : uniform(random, .19, .38);
        this.guide('argon', origin, [x, sourceY], duration * (350 / Math.max(50, sample.targetEnergy)) ** .25, 'target');
      });
      return;
    }
    const count = fluxCount(sample.gross);
    const width = method === 'ebeam' ? 14 : method === 'radiant' ? 33 : method === 'filament' ? 50 : 53;
    const thermalSpeed = 205 * Math.sqrt((settings.temperature ?? 1500) / 1400 * (100 / mass));
    this.produce('atom', count * (config.arc ? .48 : 1), dt, () => {
      const speed = Math.min(420, thermalSpeed * (.41 + .66 * Math.sqrt(opticalDepth(random))));
      this.emit('atom', 300 + uniform(random, -width, width), sourceY - 1, speed, -1, mass);
    });
    if (config.classic || config.ibad) this.highlightCollectedVapour(dt, config, sample, sourceY);
    if (method === 'ebeam') {
      this.produce('electron', 36, dt, () => {
        this.guide('electron', [399, sourceY + 19], [306, sourceY - 1], uniform(random, .25, .31), 'hearth',
          { through: [397 + uniform(random, -4, 4), sourceY - 60] });
      });
    }
    if (config.arc) {
      this.produce('arc', count * .70, dt, () => {
        const spot = 300 + 53 * Math.sin(2.4 * this.clock) + uniform(random, -9, 9);
        const landing = [spot + uniform(random, -43, 43), CHAMBER.plateY + 1];
        this.guide('metal-ion', [spot, sourceY - 1], landing, uniform(random, .50, .79), 'substrate');
      });
    } else if (config.classic || config.ibad) {
      const ionRate = 85 * Math.min(1, 2.8 * settings.ionCurrent);
      this.produce('substrate', ionRate, dt, () => {
        const x = uniform(random, 211, 389);
        const origin = config.ibad ? [CHAMBER.gunX, CHAMBER.gunY + uniform(random, -5, 6)]
          : [x + uniform(random, -19, 19), uniform(random, 164, 222)];
        const flight = uniform(random, .22, .45) * (150 / Math.max(25, sample.ionEnergy)) ** .18;
        this.guide('argon', origin, [x, CHAMBER.plateY + 1], flight, 'substrate', { beam: config.ibad });
      });
    }
  }

  registerImpact(particle, event, sample, mass, thickness, residue, active) {
    const { x, y } = particle;
    if (event === 'wall' || !active) return;
    const random = this.random;
    this.impacts.push({ x, y, kind: event, age: 0 });
    if (event === 'target') {
      // Only target hits create sputtered neutral tracers.
      const visualYield = Math.min(4, (sample.yieldValue ?? .65) * 1.65);
      const emitted = Math.floor(visualYield + random());
      for (let i = 0; i < emitted; i++) this.emit('atom', x, y - 1, uniform(random, 185, 395), -1, mass);
    }
    if (event === 'substrate') {
      const yieldProxy = thickness > .002 ? Math.min(.95, sample.loss / (sample.loss + .7))
        : residue * -Math.expm1(-12 * sample.cleanRate);
      if (random() < yieldProxy) this.emit('removed', x, y + 1, uniform(random, 135, 305), 1, mass);
    }
  }

  updateGas(dt, open, gas, settings, sample, reducedMotion, showParticles) {
    const target = Number(open);
    const fill = target + (this.fill - target) * Math.exp(-dt / (open ? .12 : .20));
    this.fill = reducedMotion ? target : fill < .0005 ? 0 : fill;
    if (!showParticles || !gas || !this.fill) { this.gasParticles = []; this.gasBudget = 0; return; }
    const sourceY = sourceLevel(settings.distance);
    const meanPath = displayFreePath(sample.lambda, settings.distance);
    this.gasParticles = this.gasParticles.filter((particle) => {
      particle.age += dt;
      return particle.age < 1.65 && !neutralStep(particle, dt, meanPath, sourceY, this.random);
    });
    if (!open) { this.gasBudget = 0; return; }
    // Sparse tracer count is for legibility. The simulator does not infer a
    // mass flow from pressure because pump speed and conductance are unspecified.
    const count = gas.gun ? 30 : Math.min(87, 48 + 14 * Math.max(0, settings.pressure + 3));
    this.gasBudget += count * dt;
    while (this.gasBudget >= 1) {
      this.gasBudget--;
      const [first, second] = gas.species;
      const [name] = second && this.random() >= first[1] ? second : first;
      const [kind, mass, colour] = GAS_TRACERS[name];
      const direction = (gas.gun ? -.48 : 0) + uniform(this.random, -.39, .39);
      const speed = uniform(this.random, 82, 166);
      this.gasParticles.push({
        kind, mass, colour,
        x: gas.gun ? 191 : CHAMBER.inletX, y: (gas.gun ? 254 : CHAMBER.inletY) + uniform(this.random, -2.6, 2.6),
        vx: speed * Math.cos(direction), vy: speed * Math.sin(direction),
        depth: .60 + opticalDepth(this.random), age: 0,
      });
    }
  }

  update(dt, active, config, method, settings, sample, mass, thickness, reducedMotion, residue = 0, gasOpen = active, showParticles = !reducedMotion) {
    active = active && sample.targetIonOn !== 0;
    this.clock += dt;
    this.darkTime = active ? 0 : this.darkTime + dt;
    const pulse = !config.duty || (this.clock % .62) / .62 < settings.duty / 100;
    const hasPlasma = config.family === 'sputtering' || config.classic || config.arc;
    const hasHeater = config.family !== 'sputtering' && !config.arc && !settings.preclean;
    const gas = processGas(config, settings);
    const sourceY = sourceLevel(settings.distance);
    this.updateTargetArc(dt, active && showParticles && !reducedMotion ? sample.arcing : null, sourceY, pulse);
    const flowing = gasOpen && gas != null && (!gas.gun || settings.ionCurrent > 0);
    this.updateGas(dt, flowing, gas, settings, sample, reducedMotion, showParticles);
    const targets = {
      plasma: active && hasPlasma && (reducedMotion || pulse) ? .56 + .4 * Math.min(1, (sample.targetIonOn ?? settings.ionCurrent + .35)) : 0,
      heat: active && hasHeater ? Math.min(1, .53 + .22 * Math.log1p(sample.gross * 5)) : 0,
      beam: active && method === 'ebeam' ? .9 : 0,
      holder: active || flowing ? .95 * -Math.expm1(-Math.max(0, settings.substrate - 295) / 170) : 0,
    };
    const decay = { plasma: .075, heat: .29, beam: .049, holder: .23 };
    for (const key of Object.keys(this.power)) {
      const target = targets[key];
      const time = target === 0 ? decay[key] : key === 'heat' ? .15 : .045;
      const value = reducedMotion ? target : target + (this.power[key] - target) * Math.exp(-dt / time);
      this.power[key] = value < .004 ? 0 : value;
    }
    if (!showParticles || (!active && this.darkTime >= .85)) {
      this.particles = [];
      this.impacts = [];
      this.budgets = {};
      return;
    }
    const meanPath = displayFreePath(sample.lambda, settings.distance);
    const current = this.particles;
    this.particles = [];
    this.impacts = this.impacts.filter((impact) => (impact.age += dt) < .20);
    for (const particle of current) {
      particle.age += dt;
      if (particle.age > 3.4) continue;
      particle.sinceTrail += dt;
      if (particle.sinceTrail >= .024) {
        particle.trail.push([particle.x, particle.y]);
        particle.sinceTrail = 0;
      }
      const event = particle.duration ? guidedStep(particle, dt) : neutralStep(particle, dt, meanPath, sourceY, this.random);
      particle.trail = particle.trail.slice(-5);
      if (event) this.registerImpact(particle, event, sample, mass, thickness, residue, active);
      else if (this.particles.length < TRACER_LIMIT) this.particles.push(particle);
    }
    if (active) this.spawn(dt, config, method, settings, sample, mass, sourceY, pulse);
    else this.budgets = {};
  }

  draw(ctx, showParticles = true) {
    ctx.clearRect(0, 0, CHAMBER.width, CHAMBER.height);
    if (!showParticles) return;
    for (const particle of this.gasParticles) {
      const { x, y, age, kind, colour } = particle;
      const molecule = kind !== 'gas-argon';
      ctx.globalAlpha = .85 * Math.min(1, (1.65 - age) * 2.4) * Math.min(1, this.fill * 2.2);
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(x, y, molecule ? 1.38 : 1.75, 0, TAU);
      if (molecule) {
        ctx.moveTo(x + 3.6, y + .7);
        ctx.arc(x + 2.2, y + .7, 1.38, 0, TAU);
      }
      ctx.fill();
    }
    const shades = { atom: '#8ccaff', argon: '#d9acff', 'metal-ion': '#7ee7f4', removed: '#ff9c6e', electron: '#ffd08a' };
    const fading = Math.max(0, 1 - this.darkTime / .85);
    for (const particle of this.particles) {
      const { x, y, kind, trail, waypoints } = particle;
      const charged = kind === 'argon' || kind === 'metal-ion';
      const collected = Boolean(waypoints) || kind === 'metal-ion';
      ctx.strokeStyle = ctx.fillStyle = waypoints ? '#a9e3ff' : shades[kind];
      ctx.lineWidth = collected ? 2 : charged ? 1.5 : 1.15;
      if (trail.length) {
        ctx.globalAlpha = (collected ? .57 : .23) * fading;
        ctx.beginPath();
        ctx.moveTo(...trail[0]);
        for (const point of trail.slice(1)) ctx.lineTo(...point);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.globalAlpha = .94 * fading;
      ctx.beginPath();
      ctx.arc(x, y, waypoints ? 3.1 : charged ? 3.9 : 2.45, 0, TAU);
      if (charged) {
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 1.8, y);
        ctx.lineTo(x + 1.8, y);
        ctx.moveTo(x, y - 1.8);
        ctx.lineTo(x, y + 1.8);
        ctx.stroke();
      } else {
        ctx.fill();
      }
    }
    for (const { x, y, kind, age } of this.impacts) {
      ctx.globalAlpha = .62 * (1 - age / .20) * fading;
      ctx.strokeStyle = kind === 'target' ? '#e5c4ff' : kind === 'hearth' ? shades.electron : '#9ad9ff';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(x, y, 2.5 + 28 * age, 0, TAU);
      ctx.stroke();
    }
    if (this.targetArc) this.drawTargetArc(ctx);
    ctx.globalAlpha = 1;
  }

  drawTargetArc(ctx) {
    const { x, y, age, tilt } = this.targetArc;
    const fade = (1 - age / ARC_FLASH_SECONDS) ** 1.5;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 16);
    glow.addColorStop(0, '#fff3d4');
    glow.addColorStop(.28, '#ffd28cdb');
    glow.addColorStop(1, '#ffb66100');
    ctx.globalAlpha = fade * .88;
    ctx.fillStyle = glow;
    ctx.fillRect(x - 16, y - 16, 32, 32);
    ctx.globalAlpha = fade;
    ctx.strokeStyle = '#fff7dd';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - 7, y);
    ctx.lineTo(x, y - 1);
    ctx.lineTo(x - 2 + tilt / 2, y - 5);
    ctx.lineTo(x + tilt, y - 12);
    ctx.moveTo(x, y - 1);
    ctx.lineTo(x + 7, y - 5);
    ctx.stroke();
  }
}
