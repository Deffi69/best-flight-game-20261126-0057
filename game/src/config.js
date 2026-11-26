// Every tuning number, colour and mission in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below
// depends on the screen size. Speeds are in knots, altitudes in feet, distances
// in world units (1 unit = 10 ft of altitude, 1 unit of forward travel per step).

export const FIELD = { width: 1280, height: 720, horizonY: 330 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Forward view distance: objects spawn this far ahead and are culled behind the camera. */
export const VIEW_DEPTH = 2600;

export const PLANE = {
  /** Lateral flight corridor, in world units either side of the course line. */
  halfWidth: 260,
  minAlt: 150,
  maxAlt: 5200,
  /** Knots at idle / cruise / full throttle. */
  speedIdle: 90,
  speedCruise: 150,
  speedMax: 230,
  /** How fast the plane answers the stick, in world units per second. */
  lateralSpeed: 210,
  climbSpeed: 900,
  /** Throttle moves 0..1 at this rate per second. */
  throttleRate: 0.55,
  /** Fuel in units; cruise burn per second, full-throttle burn, boost burn. */
  fuelMax: 100,
  burnCruise: 0.85,
  burnFull: 1.7,
  burnBoost: 3.2,
  /** Hits a sortie survives before the plane goes down. */
  hullMax: 3,
  /** Seconds below minimum altitude before terrain claims the plane. */
  terrainGrace: 1.5,
};

export const RING = {
  radius: 46,
  /** Points for a clean pass; a streak multiplies it (see world.js). */
  points: 100,
  /** A pass inside this fraction of the radius is a PERFECT (bonus points). */
  perfectFraction: 0.45,
  perfectBonus: 50,
  /** Fuel a green refuel ring restores. */
  fuelRestore: 25,
};

export const CRATE = { radius: 26, points: 50 };

export const CLOUD = {
  /** Storm puffs drift across the course; a hit costs one hull and a shake. */
  radius: 70,
  drift: 26,
};

/** Five sorties, each with a different goal: the campaign's depth. */
export const MISSIONS = [
  {
    id: 1,
    name: 'First Flight',
    brief: 'Learn the sky. Fly through 8 sky rings over Coral Bay.',
    rings: 8,
    crates: 0,
    clouds: 2,
    fuelRings: 1,
    timeLimit: 0,
    palette: 'noon',
    wind: 0,
  },
  {
    id: 2,
    name: 'Island Hop',
    brief: 'Hop the isles: 10 rings, and catch 6 supply crates for the villages.',
    rings: 10,
    crates: 6,
    clouds: 4,
    fuelRings: 2,
    timeLimit: 0,
    palette: 'dawn',
    wind: 6,
  },
  {
    id: 3,
    name: 'Storm Front',
    brief: 'A storm sits over the strait. Thread 12 rings and mind the thunderheads.',
    rings: 12,
    crates: 4,
    clouds: 12,
    fuelRings: 2,
    timeLimit: 0,
    palette: 'storm',
    wind: 14,
  },
  {
    id: 4,
    name: 'Sunset Relay',
    brief: 'Race the sun: 14 rings before the 75-second clock runs out.',
    rings: 14,
    crates: 6,
    clouds: 6,
    fuelRings: 3,
    timeLimit: 75,
    palette: 'sunset',
    wind: 8,
  },
  {
    id: 5,
    name: 'Archipelago Grand Tour',
    brief: 'The grand tour at dusk: 16 rings, 8 crates, one storm, one legend.',
    rings: 16,
    crates: 8,
    clouds: 10,
    fuelRings: 3,
    timeLimit: 120,
    palette: 'dusk',
    wind: 10,
  },
];

/** One sky per mission: the whole game stays in one painted style per sortie. */
export const PALETTES = {
  noon: {
    skyTop: '#2f7fd0', skyMid: '#7ec3ee', skyLow: '#cfeefb',
    sun: '#fff3b0', sunGlow: 'rgba(255, 240, 170, 0.55)',
    sea: '#1d7fb8', seaFar: '#7cc4e8', seaGlitter: 'rgba(255,255,255,0.5)',
    island: '#3f9e4d', islandSand: '#e8d9a0', mountainFar: '#6f8fb5', mountainNear: '#4a6b8a',
    cloud: '#ffffff', storm: '#5a6274', ring: '#ffb52e', ringInner: '#fff0c0',
    hud: '#eaf6ff', hudDim: '#9fc4dd', hudWarn: '#ff5a4e', hudGood: '#7dff9a',
  },
  dawn: {
    skyTop: '#5a6fc0', skyMid: '#f2a56b', skyLow: '#ffe3b3',
    sun: '#ffd98a', sunGlow: 'rgba(255, 190, 110, 0.6)',
    sea: '#3a6ea8', seaFar: '#e8a06b', seaGlitter: 'rgba(255,220,160,0.6)',
    island: '#4a9a58', islandSand: '#ecd9a4', mountainFar: '#8a7ba8', mountainNear: '#5d5478',
    cloud: '#ffe9d2', storm: '#6a5a70', ring: '#ffb52e', ringInner: '#fff0c0',
    hud: '#fff2dd', hudDim: '#d8b48f', hudWarn: '#ff5a4e', hudGood: '#7dff9a',
  },
  storm: {
    skyTop: '#2c3442', skyMid: '#5d6b7d', skyLow: '#8b98a8',
    sun: '#dfe6ee', sunGlow: 'rgba(220, 228, 238, 0.25)',
    sea: '#24455e', seaFar: '#5d7285', seaGlitter: 'rgba(255,255,255,0.25)',
    island: '#2f7a44', islandSand: '#c9bd8f', mountainFar: '#4c5a6c', mountainNear: '#37434f',
    cloud: '#c8cfd8', storm: '#3c4350', ring: '#ffd23e', ringInner: '#fff6c8',
    hud: '#e8eef4', hudDim: '#93a2b2', hudWarn: '#ff5a4e', hudGood: '#7dff9a',
  },
  sunset: {
    skyTop: '#3c2a6e', skyMid: '#e2607a', skyLow: '#ffb36b',
    sun: '#ffcf7a', sunGlow: 'rgba(255, 170, 90, 0.65)',
    sea: '#4a3a78', seaFar: '#d96b6b', seaGlitter: 'rgba(255,200,130,0.6)',
    island: '#3d8a4e', islandSand: '#e5c795', mountainFar: '#7a5a8a', mountainNear: '#54446a',
    cloud: '#ffd9c2', storm: '#5a4a68', ring: '#ffe066', ringInner: '#fff8d0',
    hud: '#ffeedd', hudDim: '#d8a98f', hudWarn: '#ff5a4e', hudGood: '#7dff9a',
  },
  dusk: {
    skyTop: '#101a3a', skyMid: '#3a3a72', skyLow: '#c96a8a',
    sun: '#ffb37a', sunGlow: 'rgba(255, 150, 100, 0.45)',
    sea: '#1a2a52', seaFar: '#5a4a7a', seaGlitter: 'rgba(255,180,140,0.4)',
    island: '#2f7a44', islandSand: '#bfae82', mountainFar: '#3a3a62', mountainNear: '#2a2a48',
    cloud: '#b9a8c8', storm: '#2e2e44', ring: '#ffe066', ringInner: '#fff8d0',
    hud: '#e8ecff', hudDim: '#9aa0c8', hudWarn: '#ff5a4e', hudGood: '#7dff9a',
  },
};

/** Where the best score and furthest mission are kept between visits (this browser only). */
export const BEST_KEY = 'sky-ring-runner.best';
export const MISSION_KEY = 'sky-ring-runner.mission';

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_MONO = '"SF Mono", "Cascadia Mono", Consolas, monospace';
