// The archipelago: islands, the home runway, distant mountain ridges and drifting
// fair-weather clouds, all generated from the mission seed so the same seed always
// builds the same world. Nothing here touches the canvas; the renderer reads these
// lists and projects them.

import { randFloat, randInt } from './random.js';

/** Build the terrain for one mission. `random` is the mission's seeded generator. */
export function createTerrain(random, mission) {
  // Islands: a chain down the course, each with a centre offset, size and height.
  // The home island (index 0) carries the runway the sortie starts over.
  const islands = [];
  const islandCount = 12;
  for (let i = 0; i < islandCount; i += 1) {
    const z = 300 + i * 520 + randFloat(random, -60, 60);
    islands.push({
      z,
      x: randFloat(random, -420, 420),
      radius: randFloat(random, 70, 180),
      height: randFloat(random, 20, 70),
      palms: randInt(random, 2, 7),
      houses: randInt(random, 0, 5),
      lighthouse: i === 5 || i === 10,
      runway: i === 0,
      seed: randFloat(random, 0, 1000),
    });
  }
  // Far mountain ridges: two parallax layers of peaks on the horizon.
  const ridges = [];
  for (let layer = 0; layer < 2; layer += 1) {
    const peaks = [];
    let x = -1400;
    while (x < 1400) {
      const width = randFloat(random, 180, 420);
      peaks.push({ x, width, height: randFloat(random, 40, 150) * (layer === 0 ? 1 : 1.7) });
      x += width * randFloat(random, 0.7, 1.1);
    }
    ridges.push({ depth: layer === 0 ? 0.25 : 0.5, peaks });
  }
  // Fair-weather clouds: soft puffs that drift slowly across the sky.
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    clouds.push({
      x: randFloat(random, -900, 900),
      y: randFloat(random, 60, 300),
      z: randFloat(random, 200, 2400),
      scale: randFloat(random, 0.7, 2.2),
      drift: randFloat(random, 4, 14) * (random() < 0.5 ? -1 : 1),
      seed: randFloat(random, 0, 1000),
    });
  }
  // The sun sits fixed in the sky for the mission's palette (dawn left, dusk right).
  const sunX = mission.palette === 'dawn' ? -420 : mission.palette === 'dusk' ? 430 : mission.palette === 'sunset' ? 380 : -260;
  const sunY = mission.palette === 'noon' ? 92 : mission.palette === 'storm' ? 120 : 150;
  return { islands, ridges, clouds, sunX, sunY, wind: mission.wind || 0 };
}
