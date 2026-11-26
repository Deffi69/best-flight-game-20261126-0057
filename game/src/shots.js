// The screenshot scenes behind ?shot=start|play|storm|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (aim at the next ring, climb or descend toward it, sidestep a storm
// puff in the way), so the frame is what a short game really looks like and the
// same seed always gives the same frame.
import { STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_COMPLETE, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 1.5;
const PLAY_SECONDS = 30;
const STORM_SECONDS = 24;
const END_LIMIT_SECONDS = 600;
const SAMPLE = STEP;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Steer toward the next unresolved ring, dodging any storm puff on the nose. */
function autopilot(state) {
  const plane = state.plane;
  const next = state.rings.find((ring) => !ring.passed && !ring.missed);
  if (!next) return { steerX: 0, steerY: 0, throttle: 0, boost: false };
  let targetX = next.x;
  let targetAlt = next.alt;
  // A storm puff within 600 ahead and near the line: sidestep it.
  for (const cloud of state.clouds) {
    if (cloud.hit || cloud.z < 0 || cloud.z > 600) continue;
    if (Math.abs(cloud.x - plane.x) < 110 && Math.abs(cloud.alt - plane.alt) < 900) {
      targetX = cloud.x > plane.x ? cloud.x - 190 : cloud.x + 190;
      targetAlt = cloud.alt > plane.alt ? cloud.alt - 1400 : cloud.alt + 1400;
    }
  }
  const steerX = clamp((targetX - plane.x) / 90, -1, 1);
  const steerY = clamp((plane.alt - targetAlt) / 700, -1, 1);
  const throttle = plane.throttle < 0.6 ? 1 : 0;
  return { steerX, steerY, throttle, boost: false };
}

function flyFor(world, seconds, horizon) {
  const limit = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < limit; i += 1) {
    if (world.step(SAMPLE, autopilot(world.state)) & EVENT_OVER) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: the title over a live sky. play: mid-sortie, rings and crates ahead.
 * storm: inside the storm sortie. end: a completed sortie (or a crash, honestly).
 */
export function stageShot(name, world) {
  world.reset(name === 'storm' ? 2 : name === 'play' ? 1 : 0);
  if (name === 'start') {
    flyFor(world, START_SECONDS);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    flyFor(world, PLAY_SECONDS);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'storm') {
    flyFor(world, STORM_SECONDS);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  // end: fly the whole first sortie on autopilot.
  flyFor(world, END_LIMIT_SECONDS);
  const over = world.state.status !== 'complete';
  return { screen: over ? SCREEN_OVER : SCREEN_COMPLETE, best: world.state.score };
}
