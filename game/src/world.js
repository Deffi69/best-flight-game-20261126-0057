// The simulation: one sortie over the archipelago. The plane flies forward down a
// course line; the pilot steers laterally and climbs or descends while rings,
// supply crates, refuel rings and storm puffs stream toward the camera. Fuel,
// hull and the clock turn each sortie into decisions: throttle discipline, a
// straight line through the next ring, or a detour for a crate. Pure logic, no
// DOM, so Node can run it too (see the playtest in PLAN.md).

import { CLOUD, CRATE, MISSIONS, PLANE, RING, STEP, VIEW_DEPTH } from './config.js';
import { randFloat, randInt } from './random.js';

export const EVENT_RING = 1;
export const EVENT_PERFECT = 2;
export const EVENT_CRATE = 4;
export const EVENT_FUEL = 8;
export const EVENT_HIT = 16;
export const EVENT_OVER = 32;
export const EVENT_COMPLETE = 64;
export const EVENT_LOW_FUEL = 128;
export const EVENT_TIMEOUT = 256;

/** Forward speed in world units per second for a speed in knots. */
export function knotsToUnits(knots) {
  return knots * 2.2;
}

/** Feet of altitude per world unit of vertical projection. */
export const ALT_SCALE = 10;

export function createWorld(random, missionIndex) {
  const mission = MISSIONS[missionIndex];
  const state = {
    missionIndex,
    mission,
    status: 'flying',
    cause: '',
    elapsed: 0,
    timeLeft: mission.timeLimit,
    score: 0,
    streak: 0,
    ringsPassed: 0,
    ringsMissed: 0,
    cratesGot: 0,
    perfects: 0,
    stars: 0,
    shake: 0,
    lowFuelWarned: false,
    terrainTimer: 0,
    plane: {
      x: 0,
      alt: 1800,
      throttle: 0.55,
      speed: PLANE.speedCruise,
      heading: 90,
      bank: 0,
      pitch: 0,
      fuel: PLANE.fuelMax,
      hull: PLANE.hullMax,
    },
    rings: [],
    crates: [],
    clouds: [],
    distance: 0,
  };

  function buildCourse() {
    // NOTE: read the mission from state, not the construction-time closure:
    // reset() swaps missions and the course must follow the new one.
    const m = state.mission;
    const spacing = 1250;
    let z = 1100;
    let prevAlt = 1800;
    for (let i = 0; i < m.rings; i += 1) {
      const fuelRing = m.fuelRings > 0 && i > 0 && i % Math.max(3, Math.floor(m.rings / m.fuelRings)) === 0;
      // A random walk in altitude: each ring stays reachable from the last.
      prevAlt = Math.max(700, Math.min(4200, prevAlt + randFloat(random, -1200, 1200)));
      state.rings.push({
        z,
        x: randFloat(random, -220, 220),
        alt: prevAlt,
        kind: fuelRing ? 'fuel' : 'ring',
        passed: false,
        missed: false,
        perfect: false,
      });
      z += spacing + randFloat(random, -80, 120);
    }
    // Supply crates float between rings, slightly off the ring line.
    for (let i = 0; i < m.crates; i += 1) {
      const anchor = state.rings[Math.min(i, state.rings.length - 1)];
      state.crates.push({
        z: anchor.z + randFloat(random, -300, 300),
        x: anchor.x + randFloat(random, -90, 90),
        alt: anchor.alt + randFloat(random, -500, 500),
        got: false,
      });
    }
    // Storm puffs guard the course; more of them in the storm sortie.
    for (let i = 0; i < m.clouds; i += 1) {
      state.clouds.push({
        z: randFloat(random, 1400, 1400 + m.rings * spacing),
        x: randFloat(random, -240, 240),
        alt: randFloat(random, 600, 4200),
        drift: randFloat(random, -CLOUD.drift, CLOUD.drift),
        seed: randFloat(random, 0, 1000),
      });
    }
  }

  function reset(nextMissionIndex) {
    const next = MISSIONS[nextMissionIndex];
    state.missionIndex = nextMissionIndex;
    state.mission = next;
    state.status = 'flying';
    state.cause = '';
    state.elapsed = 0;
    state.timeLeft = next.timeLimit;
    state.score = 0;
    state.streak = 0;
    state.ringsPassed = 0;
    state.ringsMissed = 0;
    state.cratesGot = 0;
    state.perfects = 0;
    state.stars = 0;
    state.shake = 0;
    state.lowFuelWarned = false;
    state.terrainTimer = 0;
    state.plane.x = 0;
    state.plane.alt = 1800;
    state.plane.throttle = 0.55;
    state.plane.speed = PLANE.speedCruise;
    state.plane.heading = 90;
    state.plane.bank = 0;
    state.plane.pitch = 0;
    state.plane.fuel = PLANE.fuelMax;
    state.plane.hull = PLANE.hullMax;
    state.rings.length = 0;
    state.crates.length = 0;
    state.clouds.length = 0;
    state.distance = 0;
    buildCourse();
  }

  function finishComplete() {
    state.status = 'complete';
    const timeBonus = state.mission.timeLimit > 0 ? Math.max(0, Math.round(state.timeLeft)) * 10 : 500;
    const fuelBonus = Math.round(state.plane.fuel) * 5;
    state.score += timeBonus + fuelBonus;
    const ringRate = state.ringsPassed / state.mission.rings;
    state.stars = ringRate >= 1 && state.plane.hull === PLANE.hullMax ? 3 : ringRate >= 0.7 ? 2 : 1;
  }

  function finishCrash(cause) {
    state.status = 'crashed';
    state.cause = cause;
    state.shake = 1;
  }

  /**
   * Advance the world one fixed step. `stick` is { steerX (-1..1), steerY (-1..1),
   * throttle (-1..1), boost (bool) }. Returns an EVENT_* bitmask.
   */
  function step(dt, stick) {
    if (state.status !== 'flying') return 0;
    let events = 0;
    const plane = state.plane;
    state.elapsed += dt;
    if (state.mission.timeLimit > 0) {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        state.status = 'timeout';
        state.cause = 'Out of time — the sun set on the relay.';
        return events | EVENT_TIMEOUT | EVENT_OVER;
      }
    }

    // Throttle and speed: boost trades fuel for speed; an empty tank kills the engine.
    plane.throttle = Math.max(0, Math.min(1, plane.throttle + stick.throttle * 0.55 * dt));
    const targetSpeed = PLANE.speedIdle + plane.throttle * (PLANE.speedMax - PLANE.speedIdle);
    const boostSpeed = stick.boost && plane.fuel > 0 ? 45 : 0;
    plane.speed += (targetSpeed + boostSpeed - plane.speed) * Math.min(1, dt * 1.2);
    const forward = knotsToUnits(plane.speed);
    state.distance += forward * dt;

    // Steering: bank follows the stick, the nose follows the bank, wind pushes back.
    const targetBank = stick.steerX * 0.6;
    plane.bank += (targetBank - plane.bank) * Math.min(1, dt * 5);
    plane.x += (stick.steerX * PLANE.lateralSpeed - state.mission.wind) * dt;
    plane.x = Math.max(-PLANE.halfWidth, Math.min(PLANE.halfWidth, plane.x));
    const targetPitch = -stick.steerY * 0.35;
    plane.pitch += (targetPitch - plane.pitch) * Math.min(1, dt * 4);
    plane.alt += -stick.steerY * PLANE.climbSpeed * dt;
    plane.alt = Math.max(PLANE.minAlt - 60, Math.min(PLANE.maxAlt, plane.alt));
    plane.heading = (90 + plane.bank * 28 + plane.x * 0.03 + 360) % 360;

    // Fuel: cruise sips, full throttle and boost gulp. A dry tank glides the plane down.
    const burn = PLANE.burnCruise + plane.throttle * (PLANE.burnFull - PLANE.burnCruise)
      + (stick.boost ? PLANE.burnBoost : 0);
    plane.fuel = Math.max(0, plane.fuel - burn * dt);
    if (plane.fuel <= 20 && !state.lowFuelWarned) {
      state.lowFuelWarned = true;
      events |= EVENT_LOW_FUEL;
    }
    if (plane.fuel <= 0) {
      plane.alt -= 90 * dt;
      plane.speed = Math.max(60, plane.speed - 30 * dt);
    }

    // Terrain: below minimum altitude the ground is coming up fast.
    if (plane.alt <= PLANE.minAlt) {
      state.terrainTimer += dt;
      if (state.terrainTimer >= PLANE.terrainGrace) {
        finishCrash('Terrain! The plane struck the ground below minimum altitude.');
        return events | EVENT_HIT | EVENT_OVER;
      }
    } else {
      state.terrainTimer = 0;
    }

    // Stream the course toward the camera.
    for (const ring of state.rings) ring.z -= forward * dt;
    for (const crate of state.crates) crate.z -= forward * dt;
    for (const cloud of state.clouds) {
      cloud.z -= forward * dt;
      cloud.x += cloud.drift * dt;
      if (cloud.x > 300) cloud.x = 300;
      if (cloud.x < -300) cloud.x = -300;
    }
    state.shake = Math.max(0, state.shake - dt * 1.5);

    // Rings: resolve as they pass the nose.
    for (const ring of state.rings) {
      if (ring.passed || ring.missed) continue;
      if (ring.z > 0) continue;
      const dx = ring.x - plane.x;
      const dy = (ring.alt - plane.alt) / ALT_SCALE;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= RING.radius) {
        ring.passed = true;
        state.ringsPassed += 1;
        state.streak += 1;
        const perfect = dist <= RING.radius * RING.perfectFraction;
        if (perfect) {
          ring.perfect = true;
          state.perfects += 1;
        }
        const gained = RING.points + Math.min(state.streak, 5) * 20 + (perfect ? RING.perfectBonus : 0);
        state.score += gained;
        if (ring.kind === 'fuel') {
          plane.fuel = Math.min(PLANE.fuelMax, plane.fuel + RING.fuelRestore);
          events |= EVENT_FUEL;
        }
        events |= EVENT_RING | (perfect ? EVENT_PERFECT : 0);
      } else if (ring.z < -60) {
        ring.missed = true;
        state.ringsMissed += 1;
        state.streak = 0;
      }
    }
    // Crates: a near miss still counts when the plane brushes the crate.
    for (const crate of state.crates) {
      if (crate.got || crate.z > 0 || crate.z < -60) continue;
      const dx = crate.x - plane.x;
      const dy = (crate.alt - plane.alt) / ALT_SCALE;
      if (Math.sqrt(dx * dx + dy * dy) <= CRATE.radius + 14) {
        crate.got = true;
        state.cratesGot += 1;
        state.score += CRATE.points;
        events |= EVENT_CRATE;
      }
    }
    // Storm puffs: one hull per hit, plus a shake and a spin of the nose.
    for (const cloud of state.clouds) {
      if (cloud.z > 40 || cloud.z < -40 || cloud.hit) continue;
      const dx = cloud.x - plane.x;
      const dy = (cloud.alt - plane.alt) / ALT_SCALE;
      if (Math.sqrt(dx * dx + dy * dy) <= CLOUD.radius) {
        cloud.hit = true;
        plane.hull -= 1;
        state.shake = 1;
        state.streak = 0;
        events |= EVENT_HIT;
        if (plane.hull <= 0) {
          finishCrash('Caught by the storm — the plane broke apart in the thunderhead.');
          return events | EVENT_OVER;
        }
      }
    }

    // The sortie ends when every ring is resolved.
    if (state.ringsPassed + state.ringsMissed >= state.mission.rings) {
      finishComplete();
      events |= EVENT_COMPLETE;
    }
    return events;
  }

  buildCourse();
  return { state, step, reset };
}
