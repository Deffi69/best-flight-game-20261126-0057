// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between six screens: title, briefing,
// play, paused, sortie complete and game over — plus the victory screen after the
// fifth sortie. ?seed=N fixes the course. ?shot=start|play|storm|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import { BEST_KEY, MISSION_KEY, MISSIONS, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_COMPLETE, EVENT_CRATE, EVENT_FUEL, EVENT_HIT, EVENT_LOW_FUEL, EVENT_OVER, EVENT_PERFECT, EVENT_RING } from './world.js';
import { createTerrain } from './terrain.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_BRIEF, SCREEN_COMPLETE, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed), 0);
let terrain = createTerrain(createRandom(seed + 101), MISSIONS[0]);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readNumber(key) {
  try {
    return Number.parseInt(window.localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}
function saveNumber(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  terrain = createTerrain(createRandom(seed + 101), world.state.mission);
  window.__game = { world, get screen() { return scene.screen; } };
  let painted = 0;
  const ui = { best: scene.best, messages: [], now: 12, muted: false, unlocked: 4, selectedMission: world.state.missionIndex };
  function paint() {
    renderer.draw(world.state, terrain, scene.screen, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readNumber(BEST_KEY);
  let unlocked = Math.min(MISSIONS.length - 1, readNumber(MISSION_KEY));
  let selectedMission = Math.min(unlocked, 0);
  let messages = [];
  let accumulator = 0;
  let last = performance.now();
  let nowSeconds = 0;
  let alarmAt = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each event.
  function announce(message) {
    status.textContent = message;
  }

  function flash(text, color) {
    messages.push({ text, color, life: 1.6 });
    if (messages.length > 4) messages.shift();
  }

  function startMission(index) {
    world.reset(index);
    terrain = createTerrain(createRandom(seed + 101 + index * 17), MISSIONS[index]);
    messages = [];
    accumulator = 0;
    screen = SCREEN_BRIEF;
    audio.unlock();
    audio.click();
    announce(`Sortie ${index + 1}: ${MISSIONS[index].name}. ${MISSIONS[index].brief}`);
  }

  function takeOff() {
    screen = SCREEN_PLAY;
    audio.unlock();
    announce(`Flying sortie ${world.state.missionIndex + 1}.`);
  }

  function endRun() {
    const score = world.state.score;
    if (score > best) {
      best = score;
      saveNumber(BEST_KEY, best);
    }
    if (world.state.status === 'complete') {
      const next = world.state.missionIndex + 1;
      if (next < MISSIONS.length && next > unlocked) {
        unlocked = next;
        saveNumber(MISSION_KEY, unlocked);
      }
      if (world.state.missionIndex === MISSIONS.length - 1) {
        screen = SCREEN_VICTORY;
        audio.victory();
        announce(`Grand tour complete! Final score ${score}.`);
      } else {
        screen = SCREEN_COMPLETE;
        audio.missionComplete();
        announce(`Sortie complete. Score ${score}.`);
      }
    } else {
      screen = SCREEN_OVER;
      audio.crash();
      announce(`Down. ${world.state.cause} Score ${score}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.unlock();
      const muted = audio.toggleMute();
      flash(muted ? 'Sound off' : 'Sound on', '#eaf6ff');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startMission(selectedMission);
      return;
    }
    if (screen === SCREEN_BRIEF) {
      if (actions & ACTION_CONFIRM) takeOff();
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_PAUSE) screen = SCREEN_PLAY;
      else if (actions & ACTION_RESTART) startMission(world.state.missionIndex);
      else if (actions & ACTION_CONFIRM) screen = SCREEN_PLAY;
      return;
    }
    if (screen === SCREEN_COMPLETE) {
      if (actions & ACTION_CONFIRM) {
        const next = world.state.missionIndex + 1;
        if (next < MISSIONS.length) startMission(next);
        else screen = SCREEN_TITLE;
      } else if (actions & ACTION_RESTART) startMission(world.state.missionIndex);
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM || actions & ACTION_RESTART) startMission(world.state.missionIndex);
      return;
    }
    if (screen === SCREEN_VICTORY) {
      if (actions & ACTION_CONFIRM) screen = SCREEN_TITLE;
    }
  }

  function handleEvents(events) {
    const state = world.state;
    if (events & EVENT_RING) {
      audio.ring(Boolean(events & EVENT_PERFECT));
      flash(events & EVENT_PERFECT ? `PERFECT! +${100 + Math.min(state.streak, 5) * 20 + 50}` : `RING! +${100 + Math.min(state.streak, 5) * 20}`, '#ffe066');
      announce(`Ring ${state.ringsPassed} of ${state.mission.rings}.`);
    }
    if (events & EVENT_CRATE) {
      audio.crate();
      flash('SUPPLY CRATE +50', '#7dff9a');
    }
    if (events & EVENT_FUEL) {
      audio.fuel();
      flash('REFUEL +25', '#3ddc78');
    }
    if (events & EVENT_HIT) {
      audio.hit();
      if (state.status === 'flying') flash('STORM HIT! Hull down', '#ff5a4e');
    }
    if (events & EVENT_LOW_FUEL) {
      audio.alarm();
      flash('LOW FUEL', '#ff5a4e');
    }
    if (events & EVENT_COMPLETE) {
      endRun();
      return;
    }
    if (events & EVENT_OVER) endRun();
  }

  function step() {
    if (screen === SCREEN_TITLE || screen === SCREEN_BRIEF) {
      // The title and briefing fly over a live sky: the world idles forward.
      // When the idle flight ends (out of rings or fuel), quietly restart it.
      if (world.state.status !== 'flying') world.reset(world.state.missionIndex);
      world.step(STEP, { steerX: 0, steerY: 0, throttle: 0, boost: false });
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const stick = {
      steerX: input.steerX(),
      steerY: input.steerY(),
      throttle: input.throttle(),
      boost: input.boost(),
    };
    input.ageMouse(STEP);
    const events = world.step(STEP, stick);
    audio.setFlight(world.state.plane.throttle, world.state.plane.speed, true);
    if (world.state.plane.fuel <= 20 && nowSeconds - alarmAt > 4) {
      alarmAt = nowSeconds;
      audio.alarm();
    }
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    nowSeconds = now / 1000;
    // Mission picker keys on the title screen.
    if (screen === SCREEN_TITLE) {
      // Number keys 1-5 pick a sortie (handled by keydown listener below).
    }
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_BRIEF) {
      accumulator += dt;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_BRIEF)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      audio.setFlight(0, 0, false);
    }
    for (const msg of messages) msg.life -= dt * 0.7;
    messages = messages.filter((msg) => msg.life > 0);
    const ui = {
      best,
      messages,
      now: nowSeconds,
      muted: audio.muted,
      unlocked,
      selectedMission,
    };
    renderer.draw(world.state, terrain, screen, ui);
  }

  // Number keys pick a sortie on the title screen.
  window.addEventListener('keydown', (event) => {
    if (screen !== SCREEN_TITLE) return;
    const n = Number.parseInt(event.code.replace('Digit', ''), 10);
    if (Number.isInteger(n) && n >= 1 && n <= MISSIONS.length && n - 1 <= unlocked) {
      selectedMission = n - 1;
      audio.click();
    }
  });

  // Leaving the tab pauses a running game rather than letting the plane fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // Expose the live state for playtesting (and the shot flag for screenshots).
  window.__game = { world, get screen() { return screen; } };
  announce('Sky Ring Runner. Choose a sortie, press Enter to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
