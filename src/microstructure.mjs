import { SUBSTRATES } from './instruments.mjs';

const bounded = (x, min, max) => Math.min(max, Math.max(min, x));
const ADJACENT = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const CORNERS = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
const CUBE_EDGES = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
const SUBSTRATE_TAG = 65535;
export const SURFACE_VERTEX_STRIDE = 11;

export function grainColour(tag) {
  if (!tag || tag === SUBSTRATE_TAG) return [.23, .25, .28];
  if (tag === 1) return [.59, .63, .67];
  const hue = 6 * ((tag * .61803398875) % 1);
  const light = tag % 2 ? .91 : .78;
  return [5, 3, 1].map((shift) => {
    const channel = (shift + hue) % 6;
    return light * (1 - .63 * Math.max(0, Math.min(channel, 4 - channel, 1)));
  });
}

export function exposedGrains(voxels, tops) {
  const areas = new Map();
  const grainMap = Uint16Array.from(tops, (height, index) => {
    if (!height) return 0;
    const tag = voxels[index + (height - 1) * tops.length];
    if (tag > 1) areas.set(tag, (areas.get(tag) ?? 0) + 1);
    return tag;
  });
  const sorted = [...areas.values()].sort((a,b) => a - b);
  const diameter = (area) => 2 * Math.sqrt(area / Math.PI);
  const lower = sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
  const upper = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const medianDiameter = (diameter(lower) + diameter(upper)) / 2;
  return { grainMap, grainCount: sorted.length, medianDiameter };
}

export function growthConditions(config, settings, sample) {
  const support = SUBSTRATES[settings.wafer] ?? SUBSTRATES.silicon;
  const refractoryNitride = sample.film.name === 'Titanium nitride';
  const amorphous = sample.film.name === 'Silica';
  const theta = sample.film.melting ? settings.substrate / sample.film.melting : null;
  // For compounds without a bulk melting point in the materials table, use
  // teaching proxies only in the mobility expression, not a displayed Tₛ/Tₘ.
  const mobilityTemperature = theta ?? settings.substrate / (refractoryNitride ? 3000 : 2100);
  const gaps = settings.distance / (100 * sample.lambda);
  const scattered = 1 - Math.exp(-gaps / 2.8);
  const sputtered = config.family === 'sputtering';
  const arrivingEnergy = sputtered ? .04 + 3 * Math.exp(-gaps / 4) : .15;
  const dose = config.family === 'plating' ? sample.ionDose : 0;
  const thermal = .55 * Math.exp(6.6 - 1.65 / mobilityTemperature) / Math.sqrt(.50 + 1.6 * sample.gross);
  const hops = bounded(thermal + (sputtered ? .5 * arrivingEnergy : 0) + 10 * -Math.expm1(-dose / 30), .04, 17);
  const angularSpread = (sputtered ? .23 : .12) + .98 * scattered;
  const affinity = bounded(support.affinity - (support.oxide && /Silver|Gold/.test(sample.film.name) ? .22 : 0)
    + (amorphous ? .20 : 0), .12, .92);
  return { gross: sample.gross, loss: sample.loss, hops, angularSpread, affinity, amorphous, theta, dose };
}

function seeded() {
  let state = 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

class DepositLattice {
  constructor(size, depth, first) {
    this.size = size;
    this.area = size ** 2;
    this.depth = depth;
    this.voxels = new Uint16Array(this.area * depth);
    this.tops = new Uint8Array(this.area);
    this.random = seeded();
    this.highest = 0;
    this.count = 0;
    this.grain = 1;
    const seedCount = Math.round(13 + 19 / (1 + first.hops));
    const seeds = Array.from({ length: seedCount }, () => [Math.floor(this.random() * size), Math.floor(this.random() * size)]);
    this.nuclei = Array.from({ length: this.area }, (_, i) => {
      const x = i % size;
      const y = Math.floor(i / size);
      let nearest = 0, distance = Infinity;
      for (let j = 0; j < seeds.length; j++) {
        const [sx, sy] = seeds[j];
        const dx = Math.min(Math.abs(x - sx), size - Math.abs(x - sx));
        const dy = Math.min(Math.abs(y - sy), size - Math.abs(y - sy));
        if (dx ** 2 + dy ** 2 < distance) { distance = dx ** 2 + dy ** 2; nearest = j; }
      }
      return [...seeds[nearest], distance];
    });
  }

  column(x, y) {
    const n = this.size;
    return ((x + n * 4) % n) + ((y + n * 4) % n) * n;
  }

  film(x, y, z) {
    return z < 0 || z >= this.depth ? 0 : this.voxels[this.column(x,y) + z * this.area];
  }

  findLanding(spread) {
    const n = this.size;
    const angle = this.random() * Math.PI * 2;
    const slope = spread * Math.sqrt(-Math.log(Math.max(.004, this.random())));
    const dx = Math.cos(angle) * slope / 2;
    const dy = Math.sin(angle) * slope / 2;
    let x = this.random() * n, y = this.random() * n;
    let last = [Math.floor(x), Math.floor(y), this.highest + 1];
    for (let step = (this.highest + 1) * 2; step >= 0; step--) {
      const z = step >> 1;
      const ix = Math.floor(x), iy = Math.floor(y);
      if (this.film(ix,iy,z)) return last;
      last = [ix,iy,z];
      x = (x + dx + n) % n;
      y = (y + dy + n) % n;
    }
    return last;
  }

  attachment(x,y,z, affinity) {
    let neighbours = Number(z === 0) * (.2 + 1.5 * affinity);
    for (const [dx,dy,dz] of ADJACENT) neighbours += Number(this.film(x + dx,y + dy,z + dz) > 0);
    return neighbours;
  }

  deposit(conditions) {
    let [x,y,z] = this.findLanding(conditions.angularSpread);
    const col = this.column(x,y);
    if (z > 0 && this.attachment(x,y,z,0) === 0) z = this.tops[col];
    if (z === 0 && this.random() > conditions.affinity && this.attachment(x,y,z,0) < .3) {
      const [sx,sy,distance] = this.nuclei[col];
      const radius = 3.4 + .32 * conditions.hops + 2.2 * (1 - conditions.affinity);
      if (distance <= radius ** 2 && this.tops[this.column(sx,sy)] < this.depth) {
        x = sx; y = sy; z = this.tops[this.column(sx,sy)];
      }
    }
    // A landing site is relaxed through a bounded number of local trials.
    // More coordination and a smaller step height favour attachment.
    let score = this.attachment(x,y,z,conditions.affinity) - .10 * z;
    const attempts = Math.floor(conditions.hops + this.random());
    for (let i = 0; i < attempts; i++) {
      const [dx,dy] = ADJACENT[Math.floor(this.random() * 4)];
      const nx = x + dx, ny = y + dy;
      const nz = this.tops[this.column(nx,ny)];
      if (Math.abs(nz - z) > 2 || nz >= this.depth) continue;
      const next = this.attachment(nx,ny,nz,conditions.affinity) - .10 * nz;
      if (next >= score) { x = nx; y = ny; z = nz; score = next; }
    }
    if (z >= this.depth) return;
    const destination = this.column(x,y);
    let grain = this.film(x,y,z - 1);
    for (let i = 0; !grain && i < 4; i++) {
      const [dx,dy] = ADJACENT[i];
      grain = this.film(x + dx,y + dy,z);
    }
    this.voxels[destination + z * this.area] = conditions.amorphous ? 1 : grain || ++this.grain;
    this.tops[destination] = Math.max(this.tops[destination], z + 1);
    this.highest = Math.max(this.highest, z + 1);
    this.count++;
  }

  remove() {
    if (!this.count) return;
    let col = Math.floor(this.random() * this.area);
    // Prefer topmost exposed features. When a film is sparse, continue to
    // search its footprint rather than leaving a spurious residual island.
    for (let i = 0; i < 7; i++) {
      const candidate = Math.floor(this.random() * this.area);
      if (this.tops[candidate] > this.tops[col]) col = candidate;
    }
    if (!this.tops[col]) col = this.tops.findIndex(Boolean);
    let z = this.tops[col] - 1;
    this.voxels[col + z * this.area] = 0;
    while (z > 0 && !this.voxels[col + (z - 1) * this.area]) z--;
    this.tops[col] = z;
    this.count--;
  }
}

export function arealRmsHeight(heights, cellHeight) {
  const mean = heights.reduce((sum, height) => sum + height, 0) / heights.length;
  const variance = heights.reduce((sum, height) => sum + (height - mean) ** 2, 0) / heights.length;
  return Math.sqrt(variance) * cellHeight;
}

export function simulateMorphology(segments, reference = 0, size = 40) {
  const good = segments.filter((part) => part.duration > 0 && (part.gross > 0 || part.loss > 0));
  const arriving = good.reduce((sum, part) => sum + part.duration * part.gross, 0);
  const resolution = Math.max(.22, Math.max(reference, arriving) / 22);
  const lattice = new DepositLattice(size, 70, good.find(part => part.gross > 0) ?? {hops: 0});
  let residualIncoming = 0, residualRemoval = 0;
  for (const segment of good) {
    const scale = segment.duration * lattice.area / resolution;
    residualIncoming += segment.gross * scale;
    residualRemoval += segment.loss * scale;
    let incoming = Math.floor(residualIncoming);
    let removal = Math.floor(residualRemoval);
    residualIncoming -= incoming;
    residualRemoval -= removal;
    const remaining = Math.max(0, lattice.count + incoming - removal);
    if (remaining === 0) {
      lattice.voxels.fill(0);
      lattice.tops.fill(0);
      lattice.count = 0;
      lattice.highest = 0;
      continue;
    }
    while (incoming || (removal && lattice.count)) {
      if (incoming && (!removal || lattice.random() * (incoming + removal) < incoming)) {
        lattice.deposit(segment);
        incoming--;
      } else {
        lattice.remove();
        removal--;
      }
    }
    // Random interleaving can skip removals before any film is present.
    while (lattice.count > remaining) lattice.remove();
  }
  const envelope = lattice.tops.reduce((sum,h) => sum + h, 0);
  const covered = lattice.tops.reduce((sum,h) => sum + Number(h > 0), 0);
  const highest = lattice.tops.reduce((max,h) => Math.max(max,h), 0);
  return { size, resolution, highest, voxels: lattice.voxels, tops: lattice.tops,
    count: lattice.count, coverage: covered / lattice.area, voidFraction: envelope ? 1 - lattice.count / envelope : 0,
    roughnessNm: arealRmsHeight(lattice.tops, resolution) };
}

// Surface nets extracts the interface of the 3D occupancy field. One vertex
// per mixed cube averages its edge intersections, rounding voxel stair steps.
export function surfaceMesh(model) {
  const { size, highest, voxels } = model;
  const w = size + 2, slice = w * w, layers = highest + 5;
  const tags = new Uint16Array(slice * layers);
  const values = new Float32Array(tags.length);
  const indices = new Int32Array(tags.length).fill(-1);
  for (let z = 1; z < layers - 1; z++) {
    for (let y = 1; y <= size; y++) {
      for (let x = 1; x <= size; x++) {
        const film = z < 3 ? SUBSTRATE_TAG : voxels[x - 1 + (y - 1) * size + (z - 3) * size ** 2];
        tags[x + y*w + z*slice] = film;
      }
    }
  }
  const strides = [1,w,slice];
  for (let i = 0; i < tags.length; i++) {
    let neighbours = 0;
    for (const step of strides) neighbours += Number(Boolean(tags[i - step])) + Number(Boolean(tags[i + step]));
    values[i] = (tags[i] ? .6 : -.6) + .065 * (2 * neighbours - 6);
  }
  const vertex = [];
  const steps = CORNERS.map(([x,y,z]) => x + y*w + z*slice);
  for (let z = 0; z < layers - 1; z++) {
    for (let y = 0; y < w - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const i = x + y*w + z*slice;
        const f = steps.map(offset => values[i + offset]);
        const count = f.reduce((n,value) => n + Number(value > 0), 0);
        if (!count || count === 8) continue;
        let ax = 0, ay = 0, az = 0, edges = 0, gx = 0, gy = 0, gz = 0, tag = 0;
        for (const [a,b] of CUBE_EDGES) {
          if ((f[a] > 0) === (f[b] > 0)) continue;
          const ratio = f[a] / (f[a] - f[b]);
          ax += CORNERS[a][0] + (CORNERS[b][0] - CORNERS[a][0]) * ratio;
          ay += CORNERS[a][1] + (CORNERS[b][1] - CORNERS[a][1]) * ratio;
          az += CORNERS[a][2] + (CORNERS[b][2] - CORNERS[a][2]) * ratio;
          const occupied = tags[i + steps[f[a] > 0 ? a : b]];
          if (!tag || tag === SUBSTRATE_TAG) tag = occupied;
          edges++;
        }
        for (let c = 0; c < 8; c++) {
          gx += (CORNERS[c][0] ? -1 : 1) * f[c];
          gy += (CORNERS[c][1] ? -1 : 1) * f[c];
          gz += (CORNERS[c][2] ? -1 : 1) * f[c];
        }
        const length = Math.hypot(gx,gy,gz) || 1;
        const shade = tag === SUBSTRATE_TAG ? .48 : .76 + .16 * ((tag * .61803398875) % 1);
        indices[i] = vertex.length / 8;
        vertex.push(x + ax/edges - 1, y + ay/edges - 1, z + az/edges - 3, gx/length, gy/length, gz/length, shade, 1 - count / 17);
      }
    }
  }
  const triangles = [];
  const faceColours = [];
  const palette = new Map();
  for (let z = 0; z < layers - 1; z++) {
    for (let y = 0; y < w - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const i = x + y*w + z*slice;
        const coordinates = [x,y,z];
        for (let axis = 0; axis < 3; axis++) {
          if (!coordinates[(axis + 1) % 3] || !coordinates[(axis + 2) % 3]) continue;
          if ((values[i] > 0) === (values[i + strides[axis]] > 0)) continue;
          const a = strides[(axis + 1) % 3], b = strides[(axis + 2) % 3];
          const face = [indices[i],indices[i - a],indices[i - a - b],indices[i - b]];
          if (face.some(v => v < 0)) continue;
          triangles.push(face[0],face[1],face[2],face[0],face[2],face[3]);
          const tag = values[i] > 0 ? tags[i] : tags[i + strides[axis]];
          if (!palette.has(tag)) palette.set(tag, grainColour(tag));
          faceColours.push(palette.get(tag));
        }
      }
    }
  }
  const packed = new Float32Array(triangles.length * SURFACE_VERTEX_STRIDE);
  triangles.forEach((v,i) => {
    const start = i * SURFACE_VERTEX_STRIDE;
    for (let j = 0; j < 8; j++) packed[start + j] = vertex[v * 8 + j];
    packed.set(faceColours[Math.floor(i / 6)], start + 8);
  });
  return packed;
}

export function makeMorphology({ segments, reference }) {
  const { voxels, tops, ...stats } = simulateMorphology(segments, reference);
  return { ...stats, tops, ...exposedGrains(voxels, tops), mesh: surfaceMesh({ ...stats, voxels }) };
}
