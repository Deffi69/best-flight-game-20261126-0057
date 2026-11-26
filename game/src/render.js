// The chase view: sky, sea and islands projected from the plane's nose, the
// aircraft drawn in frame banking with the stick, and the instruments lit on the
// HUD — altitude, speed and heading always on screen, a runway or a target ring
// always ahead. One file, one job: paint what the world holds.

import { ALT_SCALE } from './world.js';
import { CLOUD, CRATE, FIELD, FONT, FONT_MONO, MISSIONS, PALETTES, PLANE, RING, VIEW_DEPTH } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_BRIEF = 'brief';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_COMPLETE = 'complete';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

const FOCAL = 620;
const CX = FIELD.width / 2;

// ---- Colour helpers (paint only; no rule of the game reads these) ----

function rgbOf(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function css([r, g, b], alpha = 1) {
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Blend two palette hex colours; t=0 is the first, t=1 the second. */
function mixc(hexA, hexB, t, alpha = 1) {
  const a = rgbOf(hexA);
  const b = rgbOf(hexB);
  return css([
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ], alpha);
}

/** A palette colour at some opacity. */
function fade(hex, alpha) {
  return css(rgbOf(hex), alpha);
}

/** Deterministic 0..1 hash: texture speckle that never flickers between frames. */
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---- Cloud sprites ----
// One soft, shaded puff cluster is painted once per palette colour onto an
// offscreen canvas (radial-gradient puffs, lit from above, shaded underneath),
// then stamped with drawImage every frame: volumetric clouds at sprite cost.

const spriteCache = new Map();

function cloudSprite(color, stormy) {
  const key = `${color}|${stormy ? 'storm' : 'fair'}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 200;
  const g = c.getContext('2d');
  const cx = 160;
  const cy = 104;
  const unit = 54;
  const puffs = [
    [-0.98, 0.18, 0.78], [-0.5, -0.22, 0.95], [0.02, -0.46, 1.16], [0.55, -0.2, 0.96],
    [1.0, 0.2, 0.76], [0.08, 0.3, 0.92], [-0.52, 0.36, 0.74], [0.62, 0.38, 0.68],
  ];
  const shadeCol = stormy ? '#141a26' : '#5d7292';
  const litCol = stormy ? '#9aa7ba' : '#ffffff';
  // Underside shade: the same cluster pushed down, in slate, so the belly reads heavy.
  for (const [ox, oy, r] of puffs) {
    const rad = r * unit;
    const x = cx + ox * unit;
    const y = cy + oy * unit + rad * 0.34;
    const grad = g.createRadialGradient(x, y, rad * 0.1, x, y, rad * 1.02);
    grad.addColorStop(0, mixc(color, shadeCol, 0.72, 0.62));
    grad.addColorStop(1, mixc(color, shadeCol, 0.72, 0));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, rad * 1.02, 0, Math.PI * 2);
    g.fill();
  }
  // Lit bodies: bright core high in each puff, fading out at the rim.
  for (const [ox, oy, r] of puffs) {
    const rad = r * unit;
    const x = cx + ox * unit;
    const y = cy + oy * unit;
    const grad = g.createRadialGradient(x, y - rad * 0.38, rad * 0.08, x, y, rad * 1.04);
    grad.addColorStop(0, mixc(color, litCol, stormy ? 0.34 : 0.6, 0.96));
    grad.addColorStop(0.55, css(rgbOf(color), 0.92));
    grad.addColorStop(1, css(rgbOf(color), 0));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, rad * 1.04, 0, Math.PI * 2);
    g.fill();
  }
  spriteCache.set(key, c);
  return c;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = FIELD.width;
  let viewH = FIELD.height;

  // Lightweight screen-space particles (exhaust puffs, wingtip vapour): pure
  // decoration, spawned and aged here in the renderer; the world never sees them.
  let particles = [];
  let lastNow = null;

  function spawnParticle(x, y, vx, vy, life, size, color, alpha) {
    if (particles.length > 260) particles.shift();
    particles.push({ x, y, vx, vy, life, maxLife: life, size, color, alpha });
  }

  function stepParticles(dt) {
    if (dt <= 0) return;
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 26 * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  function drawParticles() {
    for (const p of particles) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = p.alpha * t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.6 - t * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    viewW = canvas.clientWidth || FIELD.width;
    viewH = canvas.clientHeight || FIELD.height;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    ctx.setTransform((canvas.width / FIELD.width), 0, 0, (canvas.height / FIELD.height), 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  /** Project a world point to the screen. Returns { x, y, scale } or null when behind. */
  function project(state, x, altFeet, z) {
    if (z < 24) return null;
    const scale = FOCAL / z;
    return {
      x: CX + (x - state.plane.x) * scale,
      y: FIELD.horizonY - ((altFeet - state.plane.alt) / ALT_SCALE) * scale,
      scale,
    };
  }

  function skyGradient(pal) {
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.horizonY + 40);
    g.addColorStop(0, pal.skyTop);
    g.addColorStop(0.38, mixc(pal.skyTop, pal.skyMid, 0.55));
    g.addColorStop(0.68, pal.skyMid);
    g.addColorStop(0.9, pal.skyLow);
    g.addColorStop(1, mixc(pal.skyLow, pal.sun, 0.35));
    return g;
  }

  function drawSky(state, terrain, pal, now) {
    ctx.fillStyle = skyGradient(pal);
    ctx.fillRect(0, 0, FIELD.width, FIELD.horizonY + 2);
    // The sun: terrain.sunX is an offset from screen centre. Three glow layers,
    // a bright core, and a thin horizontal flare so the light feels photographic.
    const sunX = CX + terrain.sunX;
    const sunY = terrain.sunY;
    for (const [radius, alpha] of [[300, 0.16], [170, 0.28], [96, 0.5]]) {
      const sg = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, radius);
      sg.addColorStop(0, fade(pal.sun, alpha));
      sg.addColorStop(1, fade(pal.sun, 0));
      ctx.fillStyle = sg;
      ctx.fillRect(sunX - radius, sunY - radius, radius * 2, radius * 2);
    }
    const core = ctx.createRadialGradient(sunX - 8, sunY - 8, 4, sunX, sunY, 36);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.55, pal.sun);
    core.addColorStop(1, mixc(pal.sun, pal.skyMid, 0.4));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
    ctx.fill();
    const flare = ctx.createLinearGradient(sunX - 340, 0, sunX + 340, 0);
    flare.addColorStop(0, fade(pal.sun, 0));
    flare.addColorStop(0.5, fade(pal.sun, 0.20));
    flare.addColorStop(1, fade(pal.sun, 0));
    ctx.fillStyle = flare;
    ctx.fillRect(sunX - 340, sunY - 2, 680, 4);
    // High cirrus streaks, drifting slowly, parallaxed a touch by the plane.
    ctx.fillStyle = mixc(pal.skyLow, '#ffffff', 0.5);
    for (let i = 0; i < 6; i += 1) {
      const y = 34 + hash(i * 3.3) * 150;
      const len = 200 + hash(i * 7.9) * 300;
      const x = ((hash(i * 5.1) * 1500 + now * (3 + i) - state.plane.x * 0.03) % 1500) - 110;
      ctx.globalAlpha = 0.07 + hash(i * 11.3) * 0.09;
      ctx.beginPath();
      ctx.ellipse(x, y, len / 2, 5 + hash(i * 13.7) * 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Distant birds: tiny two-arc silhouettes, wings beating slowly.
    ctx.strokeStyle = mixc(pal.skyTop, '#101828', 0.45, 0.55);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i += 1) {
      const bx = ((hash(i * 17.3) * 1400 + now * (7 + i * 2.5)) % 1420) - 70;
      const by = 84 + hash(i * 19.7) * 130 + Math.sin(now * 0.9 + i * 2) * 7;
      const flap = Math.sin(now * 5 + i * 1.7) * 5;
      ctx.beginPath();
      ctx.moveTo(bx - 9, by + flap);
      ctx.quadraticCurveTo(bx - 3, by - 4 - flap * 0.4, bx, by);
      ctx.quadraticCurveTo(bx + 3, by - 4 - flap * 0.4, bx + 9, by + flap);
      ctx.stroke();
    }
    // Mountain ridges on the horizon, parallaxed by the plane's lateral position.
    // Each silhouette gets a vertical light gradient, a lit cap, a sunlit left
    // facet and a shadowed right facet, so the range reads as rock, not paper.
    for (const ridge of terrain.ridges) {
      const shift = -state.plane.x * ridge.depth * 0.4;
      const base = ridge.depth < 0.4 ? pal.mountainFar : pal.mountainNear;
      const grad = ctx.createLinearGradient(0, FIELD.horizonY - 190, 0, FIELD.horizonY + 2);
      grad.addColorStop(0, mixc(base, '#ffffff', 0.30));
      grad.addColorStop(0.55, base);
      grad.addColorStop(1, mixc(base, '#060a18', 0.28));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-20, FIELD.horizonY + 2);
      for (const peak of ridge.peaks) {
        ctx.lineTo(peak.x + shift + peak.width / 2, FIELD.horizonY - peak.height * ridge.depth * 1.4);
        ctx.lineTo(peak.x + shift + peak.width, FIELD.horizonY + 2);
      }
      ctx.lineTo(FIELD.width + 20, FIELD.horizonY + 2);
      ctx.closePath();
      ctx.fill();
      for (const peak of ridge.peaks) {
        const apexX = peak.x + shift + peak.width / 2;
        const apexY = FIELD.horizonY - peak.height * ridge.depth * 1.4;
        if (apexX < -60 || apexX > FIELD.width + 60) continue;
        // Shadow facet on the right slope.
        ctx.fillStyle = 'rgba(8, 12, 30, 0.18)';
        ctx.beginPath();
        ctx.moveTo(apexX, apexY);
        ctx.lineTo(peak.x + shift + peak.width, FIELD.horizonY + 2);
        ctx.lineTo(apexX + peak.width * 0.16, FIELD.horizonY + 2);
        ctx.closePath();
        ctx.fill();
        // Sunlit facet on the left slope.
        ctx.fillStyle = 'rgba(255, 244, 214, 0.10)';
        ctx.beginPath();
        ctx.moveTo(peak.x + shift, FIELD.horizonY + 2);
        ctx.lineTo(apexX, apexY);
        ctx.lineTo(apexX - peak.width * 0.14, FIELD.horizonY + 2);
        ctx.closePath();
        ctx.fill();
        // Lit cap near the summit.
        const capDrop = Math.min(26, peak.height * ridge.depth * 0.32);
        ctx.fillStyle = mixc(base, '#ffffff', 0.5, 0.85);
        ctx.beginPath();
        ctx.moveTo(apexX, apexY);
        ctx.lineTo(apexX + peak.width * 0.075, apexY + capDrop);
        ctx.lineTo(apexX - peak.width * 0.075, apexY + capDrop);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Horizon haze melts the ridge bases into the sky.
    const haze = ctx.createLinearGradient(0, FIELD.horizonY - 52, 0, FIELD.horizonY + 2);
    haze.addColorStop(0, fade(pal.skyLow, 0));
    haze.addColorStop(1, fade(pal.skyLow, 0.55));
    ctx.fillStyle = haze;
    ctx.fillRect(0, FIELD.horizonY - 52, FIELD.width, 54);
  }

  function drawSea(state, terrain, pal, now) {
    const g = ctx.createLinearGradient(0, FIELD.horizonY, 0, FIELD.height);
    g.addColorStop(0, pal.seaFar);
    g.addColorStop(0.3, mixc(pal.seaFar, pal.sea, 0.5));
    g.addColorStop(0.68, pal.sea);
    g.addColorStop(1, mixc(pal.sea, '#02101f', 0.38));
    ctx.fillStyle = g;
    ctx.fillRect(0, FIELD.horizonY, FIELD.width, FIELD.height - FIELD.horizonY);
    // Melt the horizon: a breath of sky colour over the far water.
    const melt = ctx.createLinearGradient(0, FIELD.horizonY, 0, FIELD.horizonY + 26);
    melt.addColorStop(0, fade(pal.skyLow, 0.45));
    melt.addColorStop(1, fade(pal.skyLow, 0));
    ctx.fillStyle = melt;
    ctx.fillRect(0, FIELD.horizonY, FIELD.width, 26);
    // The sun's reflection: a soft bright pool on the water under the sun.
    const sunX = CX + terrain.sunX;
    const pool = ctx.createRadialGradient(sunX, FIELD.horizonY + 60, 10, sunX, FIELD.horizonY + 60, 300);
    pool.addColorStop(0, fade(pal.sun, 0.20));
    pool.addColorStop(1, fade(pal.sun, 0));
    ctx.fillStyle = pool;
    ctx.fillRect(sunX - 300, FIELD.horizonY, 600, FIELD.height - FIELD.horizonY);
    // Slow swell bands: broad light and shade rolling toward the viewer.
    for (let i = 0; i < 5; i += 1) {
      const t = ((now * 0.03 + i * 0.21) % 1);
      const y = FIELD.horizonY + 12 + t * t * (FIELD.height - FIELD.horizonY - 20);
      ctx.fillStyle = i % 2 ? 'rgba(255, 255, 255, 0.045)' : 'rgba(2, 12, 26, 0.06)';
      ctx.fillRect(0, y, FIELD.width, 5 + t * 15);
    }
    // Sun glitter: a shimmering lane under the sun.
    ctx.fillStyle = pal.seaGlitter;
    for (let i = 0; i < 14; i += 1) {
      const y = FIELD.horizonY + 14 + i * 26;
      const w = 60 + i * 22 + Math.sin(now * 1.3 + i * 2.1) * 18;
      const x = sunX + Math.sin(now * 0.7 + i) * 12 - w / 2;
      ctx.globalAlpha = 0.35 - i * 0.018;
      ctx.fillRect(x, y, w, 3);
    }
    ctx.globalAlpha = 1;
    // Sparkle field: hundreds of tiny twinkles, denser and longer near the viewer.
    ctx.fillStyle = mixc(pal.sea, '#ffffff', 0.6);
    for (let i = 0; i < 120; i += 1) {
      const t = hash(i * 3.71);
      const y = FIELD.horizonY + 5 + t * t * (FIELD.height - FIELD.horizonY - 12);
      const x = ((hash(i * 9.13) * 1460 + now * (5 + t * 22)) % 1420) - 70;
      const tw = 0.5 + 0.5 * Math.sin(now * (2 + t * 3.5) + i * 1.71);
      ctx.globalAlpha = (0.04 + t * 0.15) * (0.35 + 0.65 * tw);
      ctx.fillRect(x, y, 3 + t * 14, 1.6);
    }
    ctx.globalAlpha = 1;
  }

  function drawIslands(state, terrain, pal, now) {
    const list = terrain.islands
      .map((island) => ({ island, p: project(state, island.x, 0, island.z) }))
      .filter((item) => item.p && item.p.scale < 2.2)
      .sort((a, b) => b.island.z - a.island.z);
    for (const { island, p } of list) {
      const rx = island.radius * p.scale;
      const ry = Math.max(3, rx * 0.30);
      const lift = island.height * p.scale * 0.2;
      const topY = p.y - lift;
      // Water shadow and the shallow lagoon ring ground the island in the sea.
      ctx.fillStyle = mixc(pal.sea, '#02101f', 0.42, 0.30);
      ctx.beginPath();
      ctx.ellipse(p.x + rx * 0.05, p.y + ry * 0.34, rx * 1.16, ry * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = mixc(pal.sea, '#cfeef2', 0.45, 0.38);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx * 1.09, ry * 1.09, 0, 0, Math.PI * 2);
      ctx.fill();
      // Beach: warm sand lit from above, wet and darker at the waterline.
      const sand = ctx.createLinearGradient(0, p.y - ry, 0, p.y + ry);
      sand.addColorStop(0, mixc(pal.islandSand, '#ffffff', 0.28));
      sand.addColorStop(0.6, pal.islandSand);
      sand.addColorStop(1, mixc(pal.islandSand, '#7a5f30', 0.4));
      ctx.fillStyle = sand;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      // Foam at the waterline: one steady edge, one breathing ring.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = Math.max(1, 1.8 * p.scale);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx * 0.99, ry * 0.99, 0, 0, Math.PI * 2);
      ctx.stroke();
      const breathe = 1 + 0.035 * Math.sin(now * 1.4 + island.seed);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx * 1.05 * breathe, ry * 1.05 * breathe, 0, 0, Math.PI * 2);
      ctx.stroke();
      // The green mound: radial light from its crown, shade pooled at the rim,
      // and a darker crescent low on the right for the island's shoulder.
      const moundRx = rx * 0.86;
      const moundRy = ry * 0.86;
      const mound = ctx.createRadialGradient(
        p.x - moundRx * 0.18, topY - moundRy * 0.3, moundRx * 0.1,
        p.x, topY, moundRx * 1.05,
      );
      mound.addColorStop(0, mixc(pal.island, '#d2f7a0', 0.42));
      mound.addColorStop(0.55, pal.island);
      mound.addColorStop(1, mixc(pal.island, '#04331a', 0.42));
      ctx.fillStyle = mound;
      ctx.beginPath();
      ctx.ellipse(p.x, topY, moundRx, moundRy, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(p.x, topY, moundRx, moundRy, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(4, 40, 18, 0.20)';
      ctx.beginPath();
      ctx.ellipse(p.x + moundRx * 0.52, topY + moundRy * 0.55, moundRx * 0.72, moundRy * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 230, 0.13)';
      ctx.beginPath();
      ctx.ellipse(p.x - moundRx * 0.4, topY - moundRy * 0.5, moundRx * 0.55, moundRy * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Grass speckle: deterministic flecks of light and shade.
      if (p.scale > 0.16) {
        for (let i = 0; i < 14; i += 1) {
          const a = hash(island.seed * 3.1 + i * 7.7) * Math.PI * 2;
          const d = 0.25 + hash(island.seed * 5.3 + i * 3.9) * 0.6;
          ctx.fillStyle = i % 2
            ? mixc(pal.island, '#eaffb0', 0.35, 0.5)
            : mixc(pal.island, '#04331a', 0.4, 0.5);
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(a) * moundRx * d, topY + Math.sin(a) * moundRy * d, Math.max(1, 2.4 * p.scale), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      if (island.runway) drawRunway(state, island, p, pal);
      // Palms and houses that only read up close: real little palms (curved trunk,
      // five fronds) and cottages with roofs once the island is near enough.
      if (p.scale > 0.25) {
        for (let i = 0; i < island.palms; i += 1) {
          const a = (island.seed + i * 2.4) % (Math.PI * 2);
          const px = p.x + Math.cos(a) * rx * 0.5;
          const py = topY + Math.sin(a) * ry * 0.4;
          if (p.scale > 0.42 && rx > 30) {
            const h = 11 * p.scale;
            ctx.strokeStyle = '#6b4a26';
            ctx.lineWidth = Math.max(1, 1.6 * p.scale);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.quadraticCurveTo(px + 2 * p.scale, py - h * 0.6, px + 4 * p.scale, py - h);
            ctx.stroke();
            ctx.strokeStyle = '#1d6b32';
            for (let f = 0; f < 5; f += 1) {
              const fa = -0.4 - f * 0.55;
              ctx.beginPath();
              ctx.moveTo(px + 4 * p.scale, py - h);
              ctx.quadraticCurveTo(
                px + 4 * p.scale + Math.cos(fa) * h * 0.7, py - h + Math.sin(fa) * h * 0.7 - 2,
                px + 4 * p.scale + Math.cos(fa) * h * 1.05, py - h + Math.sin(fa) * h * 0.55 + h * 0.34,
              );
              ctx.stroke();
            }
          } else {
            ctx.fillStyle = '#1d5c2e';
            ctx.beginPath();
            ctx.arc(px, py, Math.max(1.5, 2.5 * p.scale), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        for (let i = 0; i < island.houses; i += 1) {
          const a = (island.seed * 2 + i * 3.1) % (Math.PI * 2);
          const hx = p.x + Math.cos(a) * rx * 0.4;
          const hy = topY + Math.sin(a) * ry * 0.3;
          if (p.scale > 0.42 && rx > 30) {
            const w = 7 * p.scale;
            const h = 5 * p.scale;
            ctx.fillStyle = '#f5ead0';
            ctx.fillRect(hx - w / 2, hy - h, w, h);
            ctx.fillStyle = '#b5502f';
            ctx.beginPath();
            ctx.moveTo(hx - w * 0.7, hy - h);
            ctx.lineTo(hx, hy - h - 3.4 * p.scale);
            ctx.lineTo(hx + w * 0.7, hy - h);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.fillStyle = '#f5ead0';
            ctx.fillRect(hx - 2, hy - 2, 4, 4);
          }
        }
      }
      if (island.lighthouse && p.scale > 0.3) {
        const lhBase = topY;
        const lhH = 26 * p.scale;
        // A soft pool of lamp glow, breathing with the beacon.
        const glowA = 0.16 + 0.10 * (0.5 + 0.5 * Math.sin(now * 2.2 + island.seed));
        const lg = ctx.createRadialGradient(p.x, lhBase - lhH, 2, p.x, lhBase - lhH, 30 * p.scale);
        lg.addColorStop(0, `rgba(255, 240, 170, ${glowA + 0.22})`);
        lg.addColorStop(1, 'rgba(255, 240, 170, 0)');
        ctx.fillStyle = lg;
        ctx.fillRect(p.x - 30 * p.scale, lhBase - lhH - 30 * p.scale, 60 * p.scale, 60 * p.scale);
        ctx.fillStyle = '#f2f2f2';
        ctx.fillRect(p.x - 3, lhBase - lhH, 6, lhH);
        ctx.fillStyle = '#e5534b';
        ctx.fillRect(p.x - 3, lhBase - lhH, 6, 6 * p.scale);
        ctx.fillRect(p.x - 3, lhBase - lhH * 0.45, 6, 5 * p.scale);
        ctx.fillStyle = '#ffe9a0';
        ctx.fillRect(p.x - 2, lhBase - lhH - 3 * p.scale, 4, 3 * p.scale);
      }
    }
  }

  /** The home runway, painted on the home island as a perspective strip. */
  function drawRunway(state, island, p, pal) {
    const half = 16;
    const zNear = island.z - 320;
    const zFar = island.z + 320;
    const near = project(state, island.x, 0, zNear);
    const far = project(state, island.x, 0, zFar);
    if (!near || !far) return;
    const nw = half * near.scale;
    const fw = half * far.scale;
    ctx.fillStyle = '#3a3f46';
    ctx.beginPath();
    ctx.moveTo(far.x - fw, far.y);
    ctx.lineTo(far.x + fw, far.y);
    ctx.lineTo(near.x + nw, near.y);
    ctx.lineTo(near.x - nw, near.y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes and threshold bars.
    ctx.fillStyle = '#f5f5f5';
    for (let i = 0; i < 5; i += 1) {
      const z = zNear + (i + 0.5) * ((zFar - zNear) / 5);
      const pt = project(state, island.x, 0, z);
      if (!pt) continue;
      const w = 3 * pt.scale;
      ctx.fillRect(pt.x - w / 2, pt.y - 2, w, 4);
    }
    ctx.fillStyle = pal.hud;
    ctx.font = `bold ${Math.max(10, 15 * near.scale)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('CORAL BAY 09', near.x, near.y + 26);
  }

  function drawClouds(state, terrain, pal, now) {
    // Fair-weather puffs, far to near so near ones overlap far ones. Each is the
    // shaded sprite: lit crown, heavy belly, soft rim — volume instead of blobs.
    const sprite = cloudSprite(pal.cloud, false);
    const list = terrain.clouds
      .map((cloud) => ({ cloud, p: project(state, cloud.x + Math.sin(now * 0.1 + cloud.seed) * 8, cloud.y * ALT_SCALE, cloud.z) }))
      .filter((item) => item.p && item.p.scale <= 2)
      .sort((a, b) => b.cloud.z - a.cloud.z);
    for (const { cloud, p } of list) {
      const s = Math.min(cloud.scale * p.scale * 34, 110);
      const w = s * 5.6;
      const h = w * (200 / 320) * (0.9 + hash(cloud.seed) * 0.25);
      ctx.globalAlpha = Math.min(0.96, 0.35 + p.scale * 0.55);
      if (hash(cloud.seed * 1.3) > 0.5) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(-1, 1);
        ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(sprite, p.x - w / 2, p.y - h / 2, w, h);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawRings(state, pal, now) {
    const list = state.rings
      .filter((ring) => !ring.passed && !ring.missed && ring.z > 0 && ring.z < VIEW_DEPTH)
      .sort((a, b) => b.z - a.z);
    for (const ring of list) {
      const p = project(state, ring.x, ring.alt, ring.z);
      if (!p) continue;
      const pulse = 1 + 0.028 * Math.sin(now * 3 + ring.z * 0.01);
      const r = RING.radius * p.scale * pulse;
      if (r < 2) continue;
      const col = ring.kind === 'fuel' ? '#3ddc78' : pal.ring;
      const glowA = 0.22 + 0.07 * Math.sin(now * 3 + ring.z * 0.01);
      const glow = ctx.createRadialGradient(p.x, p.y, r * 0.4, p.x, p.y, r * 1.6);
      glow.addColorStop(0, 'rgba(255, 255, 255, 0)');
      glow.addColorStop(1, ring.kind === 'fuel' ? `rgba(61, 220, 120, ${glowA + 0.03})` : `rgba(255, 181, 46, ${glowA})`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.6, 0, Math.PI * 2);
      ctx.fill();
      // Soft shadow pass, then the band itself with a lit gradient across it.
      ctx.lineWidth = Math.max(2, r * 0.14);
      ctx.strokeStyle = 'rgba(6, 20, 38, 0.20)';
      ctx.beginPath();
      ctx.arc(p.x + r * 0.05, p.y + r * 0.08, r, 0, Math.PI * 2);
      ctx.stroke();
      const band = ctx.createLinearGradient(p.x - r, p.y - r, p.x + r, p.y + r);
      band.addColorStop(0, mixc(ring.kind === 'fuel' ? '#3ddc78' : pal.ring, '#ffffff', 0.35));
      band.addColorStop(0.5, col);
      band.addColorStop(1, mixc(ring.kind === 'fuel' ? '#3ddc78' : pal.ring, '#7a4a00', 0.35));
      ctx.strokeStyle = band;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.strokeStyle = pal.ringInner;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      // Rotating tick marks ride the rim, so the ring feels alive and aimed.
      if (r > 9) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(now * 0.9 + ring.z * 0.005);
        ctx.strokeStyle = mixc(ring.kind === 'fuel' ? '#3ddc78' : pal.ring, '#ffffff', 0.55, 0.85);
        ctx.lineWidth = Math.max(1.4, r * 0.05);
        for (let k = 0; k < 4; k += 1) {
          ctx.beginPath();
          ctx.arc(0, 0, r * 1.14, k * Math.PI / 2, k * Math.PI / 2 + 0.5);
          ctx.stroke();
        }
        ctx.restore();
      }
      // Chevrons point the way through; a fuel ring wears a + sign.
      ctx.fillStyle = col;
      ctx.font = `bold ${Math.max(10, r * 0.5)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ring.kind === 'fuel' ? '+' : '›', p.x, p.y + 1);
      ctx.textBaseline = 'alphabetic';
      if (ring.z < 500) {
        ctx.fillStyle = pal.hud;
        ctx.font = `bold 13px ${FONT_MONO}`;
        ctx.fillText(`${Math.round(ring.z * 3.2)} m`, p.x, p.y + r + 18);
      }
    }
    // The next ring gets an edge arrow when it is off screen.
    const next = state.rings.find((ring) => !ring.passed && !ring.missed);
    if (next) {
      const p = project(state, next.x, next.alt, next.z);
      if (p && (p.x < 60 || p.x > FIELD.width - 60 || p.y < 60 || p.y > FIELD.height - 120)) {
        const ax = Math.max(40, Math.min(FIELD.width - 40, p.x));
        const ay = Math.max(90, Math.min(FIELD.height - 160, p.y));
        ctx.fillStyle = pal.ring;
        ctx.beginPath();
        ctx.moveTo(ax, ay - 14);
        ctx.lineTo(ax + 12, ay + 8);
        ctx.lineTo(ax - 12, ay + 8);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawCrates(state, pal, now) {
    for (const crate of state.crates) {
      if (crate.got || crate.z <= 0 || crate.z > VIEW_DEPTH) continue;
      const p = project(state, crate.x, crate.alt, crate.z);
      if (!p) continue;
      const r = CRATE.radius * p.scale;
      if (r < 2) continue;
      const bob = Math.sin(now * 2 + crate.z * 0.05) * r * 0.12;
      // A soft shadow floats under the crate, tightening as it bobs down.
      ctx.fillStyle = 'rgba(6, 24, 40, 0.22)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + r * 1.7, r * 1.05, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.rotate(Math.sin(now + crate.z) * 0.15);
      // A little wooden box with a lit top, a shaded side and strapped faces.
      ctx.fillStyle = '#a86f24';
      ctx.beginPath();
      ctx.moveTo(r, -r);
      ctx.lineTo(r * 1.28, -r * 0.62);
      ctx.lineTo(r * 1.28, r * 0.9);
      ctx.lineTo(r, r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e0aa4e';
      ctx.beginPath();
      ctx.moveTo(-r, -r);
      ctx.lineTo(r, -r);
      ctx.lineTo(r * 1.28, -r * 0.62);
      ctx.lineTo(-r * 0.72, -r * 0.62);
      ctx.closePath();
      ctx.fill();
      const face = ctx.createLinearGradient(0, -r, 0, r);
      face.addColorStop(0, '#d99b3a');
      face.addColorStop(1, '#b57a26');
      ctx.fillStyle = face;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeStyle = '#7a4d12';
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      ctx.beginPath();
      ctx.moveTo(-r, -r);
      ctx.lineTo(r, r);
      ctx.moveTo(r, -r);
      ctx.lineTo(-r, r);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 240, 200, 0.5)';
      ctx.lineWidth = Math.max(1, r * 0.07);
      ctx.beginPath();
      ctx.moveTo(-r, -r + r * 0.1);
      ctx.lineTo(r * 1.24, -r * 0.52);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawStorm(state, pal, now) {
    const sprite = cloudSprite(pal.storm, true);
    for (const cloud of state.clouds) {
      if (cloud.hit || cloud.z <= 0 || cloud.z > VIEW_DEPTH) continue;
      const p = project(state, cloud.x, cloud.alt, cloud.z);
      if (!p || p.scale > 2.2) continue;
      const r = Math.min(CLOUD.radius * p.scale, 130);
      if (r < 3) continue;
      const flicker = cloud.z < 700 && Math.sin(now * 9 + cloud.seed) > 0.86;
      // A lightning flash lights the cloud from inside before the bolt shows.
      if (flicker) {
        const fg = ctx.createRadialGradient(p.x, p.y, r * 0.1, p.x, p.y, r * 2.1);
        fg.addColorStop(0, 'rgba(255, 240, 160, 0.4)');
        fg.addColorStop(1, 'rgba(255, 240, 160, 0)');
        ctx.fillStyle = fg;
        ctx.fillRect(p.x - r * 2.1, p.y - r * 2.1, r * 4.2, r * 4.2);
      }
      const w = r * 4.4;
      const h = w * (200 / 320);
      ctx.globalAlpha = 0.94;
      ctx.drawImage(sprite, p.x - w / 2, p.y - h / 2, w, h);
      ctx.globalAlpha = 1;
      // Rain slanting out of the near thunderheads.
      if (cloud.z < 950 && r > 12) {
        ctx.strokeStyle = 'rgba(196, 220, 248, 0.30)';
        ctx.lineWidth = Math.max(1, r * 0.03);
        ctx.beginPath();
        for (let i = 0; i < 9; i += 1) {
          const rx = p.x + (hash(cloud.seed + i * 3.3) - 0.5) * r * 2.6;
          const fall = (now * 340 + i * 47 + cloud.seed * 10) % (r * 1.7);
          const ry = p.y + r * 0.5 + fall;
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 4, ry + 11);
        }
        ctx.stroke();
      }
      // Lightning flickers inside the nearest thunderheads.
      if (flicker) {
        ctx.strokeStyle = '#ffe95e';
        ctx.lineWidth = Math.max(2, r * 0.08);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - r * 0.2, p.y + r * 0.7);
        ctx.lineTo(p.x + r * 0.1, p.y + r * 1.1);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The aircraft, seen from behind and above, banking with the stick. */
  function drawPlane(state, now) {
    const plane = state.plane;
    const px = CX;
    const py = 468 + plane.pitch * 60;
    const bank = plane.bank;
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 14 : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 10 : 0;
    const cxp = px + shakeX;
    const cyp = py + shakeY;
    const scale = 1 + plane.speed / 900;
    // Decorative particles, emitted in screen space at the tail and wingtips.
    const rot = bank * 0.9;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const toScreen = (dx, dy) => [
      cxp + (dx * cos - dy * sin) * scale,
      cyp + (dx * sin + dy * cos) * scale,
    ];
    if (state.status === 'flying' && plane.throttle > 0.12 && hash(Math.floor(now * 30)) < plane.throttle) {
      const [ex, ey] = toScreen(0, 48);
      spawnParticle(ex + (hash(now * 91) - 0.5) * 6, ey, (hash(now * 57) - 0.5) * 8, 42 + hash(now * 71) * 26, 0.55 + hash(now * 43) * 0.4, 3.2, '#cfd6dd', 0.16);
    }
    if (state.status === 'flying' && Math.abs(bank) > 0.3) {
      for (const sgn of [-1, 1]) {
        const [tx, ty] = toScreen(sgn * 128, 40);
        spawnParticle(tx, ty, -sgn * 12, 34, 0.6, 3.8, '#ffffff', 0.30);
      }
    }
    ctx.save();
    ctx.translate(cxp, cyp);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    // Shadow on the sea far below, to sell the altitude: higher is fainter.
    const shA = Math.max(0.10, 0.30 - plane.alt / 17000);
    const shR = Math.max(34, 56 - plane.alt * 0.004);
    const shGrad = ctx.createRadialGradient(0, 150, 4, 0, 150, shR);
    shGrad.addColorStop(0, `rgba(8, 26, 44, ${shA})`);
    shGrad.addColorStop(1, 'rgba(8, 26, 44, 0)');
    ctx.fillStyle = shGrad;
    ctx.beginPath();
    ctx.ellipse(0, 150, shR, shR * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Main wings: a red gradient root-to-tip, a lit leading edge, aileron seams.
    const wingGrad = ctx.createLinearGradient(-128, 0, 128, 0);
    wingGrad.addColorStop(0, '#b03028');
    wingGrad.addColorStop(0.5, '#e05248');
    wingGrad.addColorStop(1, '#b03028');
    ctx.fillStyle = wingGrad;
    ctx.beginPath();
    ctx.moveTo(-14, 6);
    ctx.lineTo(-128, 34);
    ctx.lineTo(-128, 46);
    ctx.lineTo(-10, 22);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, 6);
    ctx.lineTo(128, 34);
    ctx.lineTo(128, 46);
    ctx.lineTo(10, 22);
    ctx.closePath();
    ctx.fill();
    // Wing shading and tips.
    ctx.fillStyle = '#a82e28';
    ctx.beginPath();
    ctx.moveTo(-128, 34);
    ctx.lineTo(-128, 46);
    ctx.lineTo(-10, 22);
    ctx.lineTo(-10, 16);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(128, 34);
    ctx.lineTo(128, 46);
    ctx.lineTo(10, 22);
    ctx.lineTo(10, 16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 235, 220, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, 6);
    ctx.lineTo(-128, 34);
    ctx.moveTo(14, 6);
    ctx.lineTo(128, 34);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60, 10, 8, 0.28)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-96, 27);
    ctx.lineTo(-94, 40);
    ctx.moveTo(96, 27);
    ctx.lineTo(94, 40);
    ctx.stroke();
    // Tailplane and fin.
    ctx.fillStyle = '#c23a32';
    ctx.beginPath();
    ctx.moveTo(-8, -52);
    ctx.lineTo(-52, -38);
    ctx.lineTo(-52, -30);
    ctx.lineTo(-6, -40);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8, -52);
    ctx.lineTo(52, -38);
    ctx.lineTo(52, -30);
    ctx.lineTo(6, -40);
    ctx.closePath();
    ctx.fill();
    const finGrad = ctx.createLinearGradient(0, -60, 0, -28);
    finGrad.addColorStop(0, '#e05248');
    finGrad.addColorStop(1, '#c23a32');
    ctx.fillStyle = finGrad;
    ctx.beginPath();
    ctx.moveTo(-6, -58);
    ctx.lineTo(6, -58);
    ctx.lineTo(10, -30);
    ctx.lineTo(-10, -30);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(-6, -58, 12, 4);
    // Fuselage: a tapered body with a cream stripe and a glass canopy.
    const body = ctx.createLinearGradient(-16, 0, 16, 0);
    body.addColorStop(0, '#e2d5bc');
    body.addColorStop(0.32, '#fffaf0');
    body.addColorStop(0.62, '#f7efdd');
    body.addColorStop(1, '#c9b894');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -72);
    ctx.quadraticCurveTo(15, -50, 16, -8);
    ctx.quadraticCurveTo(16, 34, 0, 44);
    ctx.quadraticCurveTo(-16, 34, -16, -8);
    ctx.quadraticCurveTo(-15, -50, 0, -72);
    ctx.fill();
    // Belly shade and panel seams, so the body reads round, not cut out.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, -72);
    ctx.quadraticCurveTo(15, -50, 16, -8);
    ctx.quadraticCurveTo(16, 34, 0, 44);
    ctx.quadraticCurveTo(-16, 34, -16, -8);
    ctx.quadraticCurveTo(-15, -50, 0, -72);
    ctx.clip();
    const belly = ctx.createLinearGradient(0, 6, 0, 46);
    belly.addColorStop(0, 'rgba(120, 90, 60, 0)');
    belly.addColorStop(1, 'rgba(120, 90, 60, 0.30)');
    ctx.fillStyle = belly;
    ctx.fillRect(-16, 6, 32, 40);
    ctx.strokeStyle = 'rgba(110, 88, 60, 0.30)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-15, -14);
    ctx.quadraticCurveTo(0, -10, 15, -14);
    ctx.moveTo(-16, 12);
    ctx.quadraticCurveTo(0, 16, 16, 12);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#d8433a';
    ctx.fillRect(-16, -6, 32, 7);
    ctx.fillStyle = '#f2b23e';
    ctx.fillRect(-16, 2, 32, 2);
    // Canopy: real glass — deep blue at the base, sky-bright at the crown.
    const glass = ctx.createRadialGradient(-3, -44, 2, 0, -32, 18);
    glass.addColorStop(0, '#f2fdff');
    glass.addColorStop(0.4, '#a8dcf2');
    glass.addColorStop(0.78, '#4a90bc');
    glass.addColorStop(1, '#26506e');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.ellipse(0, -34, 9, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(74, 52, 40, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(-3, -41, 2.8, 5.6, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // Spinning prop: a translucent disc, two blurred blade streaks, a spinner.
    const disc = ctx.createRadialGradient(0, -72, 4, 0, -72, 27);
    disc.addColorStop(0, 'rgba(60, 60, 70, 0.05)');
    disc.addColorStop(0.8, `rgba(60, 60, 70, ${0.14 + 0.05 * Math.sin(now * 40)})`);
    disc.addColorStop(1, 'rgba(60, 60, 70, 0.30)');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.ellipse(0, -72, 27, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(0, -72);
    ctx.rotate((now * 26) % Math.PI);
    ctx.fillStyle = 'rgba(40, 40, 48, 0.20)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 25, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const spinner = ctx.createRadialGradient(-1.5, -74, 0.5, 0, -72, 6);
    spinner.addColorStop(0, '#ffffff');
    spinner.addColorStop(1, '#c23a32');
    ctx.fillStyle = spinner;
    ctx.beginPath();
    ctx.arc(0, -72, 5, 0, Math.PI * 2);
    ctx.fill();
    // Navigation lights with real glow: red left, green right, strobing tail.
    for (const [lx, col] of [[-128, '#ff3b30'], [128, '#2ee66b']]) {
      const lg = ctx.createRadialGradient(lx, 40, 0.5, lx, 40, 11);
      lg.addColorStop(0, fade(col, 0.75));
      lg.addColorStop(1, fade(col, 0));
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(lx, 40, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(lx, 40, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (Math.sin(now * 6) > 0.55) {
      const sg2 = ctx.createRadialGradient(0, 44, 0.5, 0, 44, 10);
      sg2.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
      sg2.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = sg2;
      ctx.beginPath();
      ctx.arc(0, 44, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 44, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Speed streaks stream past when the plane is really moving.
    if (state.status === 'flying' && plane.speed > 195) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const sy = cyp - 60 + hash(i * 7.7 + Math.floor(now * 18)) * 130;
        const sx = cxp + (hash(i * 3.9 + Math.floor(now * 18)) - 0.5) * 420;
        if (Math.abs(sx - cxp) < 150) continue;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + (sx < cxp ? -34 : 34), sy);
      }
      ctx.stroke();
    }
  }

  // ---- HUD ----

  function panel(x, y, w, h, pal) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(18, 34, 54, 0.68)');
    g.addColorStop(1, 'rgba(6, 12, 22, 0.62)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 1.5);
    ctx.lineTo(x + w - 8, y + 1.5);
    ctx.stroke();
  }

  function drawCompass(state, pal) {
    const cx = FIELD.width / 2;
    const y = 26;
    panel(cx - 150, 8, 300, 40, pal);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cx - 150, 8, 300, 40, 8);
    ctx.clip();
    ctx.fillStyle = pal.hudDim;
    ctx.font = '11px ' + FONT_MONO;
    ctx.textAlign = 'center';
    for (let d = -60; d <= 60; d += 15) {
      const hdg = Math.round((state.plane.heading + d + 360) % 360);
      const x = cx + d * 2.2;
      ctx.fillRect(x, 14, 1, d % 45 === 0 ? 12 : 7);
      if (d % 30 === 0) ctx.fillText(String(hdg).padStart(3, '0'), x, 42);
    }
    ctx.restore();
    ctx.fillStyle = pal.hud;
    ctx.font = `bold 15px ${FONT_MONO}`;
    ctx.fillText(`HDG ${String(Math.round(state.plane.heading)).padStart(3, '0')}°`, cx, 66);
  }

  function drawTape(x, y, w, h, value, min, max, unit, label, pal, warnLow) {
    panel(x, y, w, h, pal);
    ctx.fillStyle = pal.hudDim;
    ctx.font = '11px ' + FONT_MONO;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + 15);
    ctx.fillStyle = warnLow ? pal.hudWarn : pal.hud;
    ctx.font = `bold 26px ${FONT_MONO}`;
    ctx.fillText(String(Math.round(value)), x + w / 2, y + 46);
    ctx.fillStyle = pal.hudDim;
    ctx.font = '11px ' + FONT_MONO;
    ctx.fillText(unit, x + w / 2, y + 64);
  }

  function drawArtificialHorizon(state, pal) {
    const cx = FIELD.width / 2;
    const cy = FIELD.height - 78;
    const r = 46;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(state.plane.bank);
    const pitchPx = Math.max(-30, Math.min(30, state.plane.pitch * 60));
    const ahSky = ctx.createLinearGradient(0, -r, 0, r);
    ahSky.addColorStop(0, '#63b2e8');
    ahSky.addColorStop(1, '#3f8fd2');
    ctx.fillStyle = ahSky;
    ctx.fillRect(-r, -r + pitchPx, r * 2, r - pitchPx);
    const ahGnd = ctx.createLinearGradient(0, 0, 0, r);
    ahGnd.addColorStop(0, '#8a683f');
    ahGnd.addColorStop(1, '#5f4525');
    ctx.fillStyle = ahGnd;
    ctx.fillRect(-r, pitchPx, r * 2, r - pitchPx + r);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, pitchPx);
    ctx.lineTo(r, pitchPx);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed wings marker.
    ctx.fillStyle = pal.hud;
    ctx.fillRect(cx - 34, cy - 2, 22, 3);
    ctx.fillRect(cx + 12, cy - 2, 22, 3);
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHUD(state, ui, pal) {
    const plane = state.plane;
    const mission = state.mission;
    // Mission + score, top left.
    panel(12, 8, 268, 76, pal);
    ctx.textAlign = 'left';
    ctx.fillStyle = pal.hud;
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillText(`SORTIE ${mission.id} · ${mission.name.toUpperCase()}`, 24, 30);
    ctx.fillStyle = pal.hudDim;
    ctx.font = '13px ' + FONT;
    ctx.fillText(`Rings ${state.ringsPassed}/${mission.rings}   Crates ${state.cratesGot}/${mission.crates}   ★ ${state.stars || '–'}`, 24, 52);
    ctx.fillStyle = pal.hud;
    ctx.font = `bold 17px ${FONT_MONO}`;
    ctx.fillText(`SCORE ${state.score}`, 24, 74);
    // Compass, top centre.
    drawCompass(state, pal);
    // Fuel + hull + clock, top right.
    panel(FIELD.width - 200, 8, 188, 76, pal);
    ctx.textAlign = 'left';
    ctx.fillStyle = pal.hudDim;
    ctx.font = '11px ' + FONT_MONO;
    ctx.fillText('FUEL', FIELD.width - 188, 28);
    ctx.fillStyle = plane.fuel <= 20 ? pal.hudWarn : pal.hudGood;
    ctx.fillRect(FIELD.width - 188, 34, 164 * (plane.fuel / PLANE.fuelMax), 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeRect(FIELD.width - 188, 34, 164, 10);
    ctx.fillStyle = pal.hudDim;
    ctx.fillText('HULL', FIELD.width - 188, 62);
    for (let i = 0; i < PLANE.hullMax; i += 1) {
      ctx.fillStyle = i < plane.hull ? pal.hudGood : 'rgba(255,90,78,0.35)';
      ctx.beginPath();
      ctx.arc(FIELD.width - 160 + i * 22, 58, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    if (mission.timeLimit > 0) {
      ctx.fillStyle = state.timeLeft < 30 ? pal.hudWarn : pal.hud;
      ctx.font = `bold 15px ${FONT_MONO}`;
      ctx.textAlign = 'right';
      ctx.fillText(`⏱ ${Math.ceil(state.timeLeft)}s`, FIELD.width - 24, 74);
      ctx.textAlign = 'left';
    }
    // Airspeed, altitude and throttle, bottom corners.
    const vs = Math.round(-state.plane.pitch * PLANE.climbSpeed * 6);
    drawTape(12, FIELD.height - 96, 110, 84, plane.speed, 0, 300, 'KT', 'AIRSPEED', pal, plane.speed < 100);
    drawTape(FIELD.width - 122, FIELD.height - 96, 110, 84, plane.alt, 0, 6000, 'FT', 'ALTITUDE', pal, plane.alt <= PLANE.minAlt + 100);
    panel(134, FIELD.height - 96, 60, 84, pal);
    ctx.fillStyle = pal.hudDim;
    ctx.font = '11px ' + FONT_MONO;
    ctx.textAlign = 'center';
    ctx.fillText('THR', 164, FIELD.height - 80);
    ctx.fillStyle = '#2a4a66';
    ctx.fillRect(156, FIELD.height - 68, 16, 46);
    ctx.fillStyle = pal.hudGood;
    ctx.fillRect(156, FIELD.height - 68 + 46 * (1 - plane.throttle), 16, 46 * plane.throttle);
    ctx.fillStyle = pal.hud;
    ctx.font = '11px ' + FONT_MONO;
    ctx.fillText(`${Math.round(plane.throttle * 100)}%`, 164, FIELD.height - 14);
    // Vertical speed, bottom right next to altitude.
    panel(FIELD.width - 246, FIELD.height - 96, 112, 84, pal);
    ctx.fillStyle = pal.hudDim;
    ctx.font = '11px ' + FONT_MONO;
    ctx.fillText('VERT SPD', FIELD.width - 190, FIELD.height - 80);
    ctx.fillStyle = vs < 0 ? pal.hudGood : vs > 0 ? pal.hudWarn : pal.hud;
    ctx.font = `bold 22px ${FONT_MONO}`;
    ctx.fillText(`${vs >= 0 ? '+' : ''}${vs}`, FIELD.width - 190, FIELD.height - 50);
    ctx.fillStyle = pal.hudDim;
    ctx.font = '11px ' + FONT_MONO;
    ctx.fillText('FT/MIN', FIELD.width - 190, FIELD.height - 30);
    drawArtificialHorizon(state, pal);
    // Next-ring distance, under the compass.
    const next = state.rings.find((ring) => !ring.passed && !ring.missed);
    if (next) {
      ctx.fillStyle = pal.hudDim;
      ctx.font = '12px ' + FONT_MONO;
      ctx.textAlign = 'center';
      ctx.fillText(next.kind === 'fuel' ? `NEXT: REFUEL RING · ${Math.round(next.z * 3.2)} m` : `NEXT RING · ${Math.round(next.z * 3.2)} m`, FIELD.width / 2, 86);
    }
    // Streak flame.
    if (state.streak >= 3) {
      ctx.fillStyle = pal.ring;
      ctx.font = 'bold 15px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(`🔥 STREAK ×${state.streak}`, FIELD.width / 2, 108);
    }
    // Warnings.
    ctx.textAlign = 'center';
    if (plane.fuel <= 20 && state.status === 'flying') {
      ctx.fillStyle = Math.sin(ui.now * 8) > 0 ? pal.hudWarn : pal.hud;
      ctx.font = 'bold 20px ' + FONT;
      ctx.fillText('⚠ LOW FUEL — FIND A GREEN RING', FIELD.width / 2, 150);
    } else if (plane.alt <= PLANE.minAlt + 60 && state.status === 'flying') {
      ctx.fillStyle = Math.sin(ui.now * 8) > 0 ? pal.hudWarn : pal.hud;
      ctx.font = 'bold 20px ' + FONT;
      ctx.fillText('⚠ TERRAIN — PULL UP', FIELD.width / 2, 150);
    }
    // Transient event messages.
    ctx.font = 'bold 22px ' + FONT;
    let my = 190;
    for (const msg of ui.messages) {
      ctx.globalAlpha = Math.max(0, Math.min(1, msg.life));
      ctx.fillStyle = msg.color;
      ctx.fillText(msg.text, FIELD.width / 2, my);
      my += 30;
    }
    ctx.globalAlpha = 1;
    // Mute + controls hint.
    ctx.fillStyle = pal.hudDim;
    ctx.font = '11px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillText(ui.muted ? 'M: sound off' : 'M: sound on · P: pause · Space: boost', FIELD.width - 12, FIELD.height - 8);
    ctx.textAlign = 'left';
  }

  // ---- Screens ----

  function dim(alpha) {
    ctx.fillStyle = `rgba(6, 12, 22, ${alpha})`;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function titleText(text, y, size, color, font = FONT) {
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillText(text, FIELD.width / 2, y);
  }

  function drawTitle(state, ui, pal) {
    dim(0.45);
    titleText('SKY RING RUNNER', 150, 64, '#ffffff');
    titleText('Archipelago Air Rally', 195, 26, pal.ringInner);
    ctx.fillStyle = pal.hud;
    ctx.font = '17px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('Five sorties over Coral Bay. Thread the rings, mind the fuel, beat the storm.', FIELD.width / 2, 240);
    ctx.fillText('Steer with ← → ↑ ↓ or the mouse · Shift: throttle · Space: boost · P: pause', FIELD.width / 2, 268);
    // Mission picker.
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillText('CHOOSE A SORTIE  (1–5)', FIELD.width / 2, 316);
    MISSIONS.forEach((mission, i) => {
      const y = 336 + i * 34;
      const locked = i > ui.unlocked;
      const selected = i === ui.selectedMission;
      if (selected) {
        ctx.fillStyle = 'rgba(255, 181, 46, 0.25)';
        ctx.beginPath();
        ctx.roundRect(FIELD.width / 2 - 250, y - 20, 500, 28, 8);
        ctx.fill();
      }
      ctx.fillStyle = locked ? 'rgba(255,255,255,0.35)' : selected ? pal.ring : pal.hud;
      ctx.font = `${selected ? 'bold ' : ''}16px ${FONT}`;
      ctx.fillText(`${locked ? '🔒' : `${i + 1}.`} ${mission.name} — ${mission.rings} rings${mission.timeLimit ? ` · ${mission.timeLimit}s` : ''}`, FIELD.width / 2, y);
    });
    titleText('Press ENTER or click to fly', 560, 20, pal.hudGood);
    if (ui.best > 0) titleText(`Best score ${ui.best}`, 592, 15, pal.hudDim);
  }

  function drawBrief(state, ui, pal) {
    dim(0.55);
    const mission = state.mission;
    titleText(`SORTIE ${mission.id} — ${mission.name.toUpperCase()}`, 220, 40, '#ffffff');
    ctx.fillStyle = pal.hud;
    ctx.font = '20px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(mission.brief, FIELD.width / 2, 280);
    ctx.font = '17px ' + FONT;
    ctx.fillStyle = pal.hudDim;
    ctx.fillText(
      `${mission.rings} rings · ${mission.crates} crates · ${mission.clouds} storm clouds · ${mission.fuelRings} refuel rings${mission.timeLimit ? ` · ${mission.timeLimit}s limit` : ''}`,
      FIELD.width / 2, 320,
    );
    titleText('Press ENTER to take off', 400, 22, pal.hudGood);
  }

  function drawPaused(state, ui, pal) {
    dim(0.6);
    titleText('PAUSED', 300, 48, '#ffffff');
    titleText('P or Esc to resume · R to restart the sortie', 360, 20, pal.hudDim);
  }

  function drawComplete(state, ui, pal) {
    dim(0.55);
    const last = state.mission.id === MISSIONS.length;
    titleText(last ? 'GRAND TOUR COMPLETE!' : 'SORTIE COMPLETE!', 210, 44, '#ffffff');
    const stars = '★'.repeat(state.stars) + '☆'.repeat(3 - state.stars);
    titleText(stars, 270, 40, pal.ring);
    ctx.fillStyle = pal.hud;
    ctx.font = '20px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(`Rings ${state.ringsPassed}/${state.mission.rings} · Perfect ${state.perfects} · Crates ${state.cratesGot}/${state.mission.crates}`, FIELD.width / 2, 330);
    ctx.fillText(`Score ${state.score}   ·   Best ${Math.max(ui.best, state.score)}`, FIELD.width / 2, 364);
    titleText(last ? 'You are the Archipelago Ace. Press ENTER for the title screen.' : 'Press ENTER for the next sortie · R to fly it again', 430, 20, pal.hudGood);
  }

  function drawOver(state, ui, pal) {
    dim(0.6);
    titleText(state.status === 'timeout' ? "TIME'S UP" : 'DOWN!', 210, 52, pal.hudWarn);
    ctx.fillStyle = pal.hud;
    ctx.font = '20px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(state.cause || 'The plane went down.', FIELD.width / 2, 280);
    ctx.fillText(`Rings ${state.ringsPassed}/${state.mission.rings} · Score ${state.score} · Best ${Math.max(ui.best, state.score)}`, FIELD.width / 2, 318);
    titleText('Press ENTER or R to fly again', 400, 20, pal.hudGood);
  }

  function drawVictory(state, ui, pal) {
    dim(0.5);
    titleText('🏆 ARCHIPELAGO ACE', 220, 48, pal.ring);
    ctx.fillStyle = pal.hud;
    ctx.font = '20px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('All five sorties flown. Coral Bay is yours, pilot.', FIELD.width / 2, 290);
    ctx.fillText(`Final score ${state.score} · Best ${Math.max(ui.best, state.score)}`, FIELD.width / 2, 324);
    titleText('Press ENTER for the title screen', 400, 20, pal.hudGood);
  }

  /** Paint one frame. `screen` is a SCREEN_* constant; `ui` carries best, messages, now, etc. */
  function draw(state, terrain, screen, ui) {
    const pal = PALETTES[state.mission.palette];
    const now = ui.now;
    ctx.clearRect(0, 0, FIELD.width, FIELD.height);
    drawSky(state, terrain, pal, now);
    drawSea(state, terrain, pal, now);
    drawIslands(state, terrain, pal, now);
    drawClouds(state, terrain, pal, now);
    drawStorm(state, pal, now);
    drawRings(state, pal, now);
    drawCrates(state, pal, now);
    // Age and paint the decorative particles, then the plane over them.
    const dt = lastNow === null ? 0 : Math.min(0.05, Math.max(0, now - lastNow));
    lastNow = now;
    stepParticles(dt);
    drawParticles();
    drawPlane(state, now);
    // A soft vignette seats the scene in the frame.
    const vg = ctx.createRadialGradient(CX, FIELD.height * 0.46, FIELD.height * 0.42, CX, FIELD.height * 0.46, FIELD.height * 0.98);
    vg.addColorStop(0, 'rgba(8, 10, 26, 0)');
    vg.addColorStop(1, 'rgba(8, 10, 26, 0.20)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHUD(state, ui, pal);
    if (screen === SCREEN_TITLE) drawTitle(state, ui, pal);
    else if (screen === SCREEN_BRIEF) drawBrief(state, ui, pal);
    else if (screen === SCREEN_PAUSED) drawPaused(state, ui, pal);
    else if (screen === SCREEN_COMPLETE) drawComplete(state, ui, pal);
    else if (screen === SCREEN_OVER) drawOver(state, ui, pal);
    else if (screen === SCREEN_VICTORY) drawVictory(state, ui, pal);
  }

  return { draw, resize };
}
