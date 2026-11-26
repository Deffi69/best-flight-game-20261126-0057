// Keyboard and mouse input. Held keys give a steering direction and a throttle
// nudge; one-shot presses (start, pause, boost, mute) are queued as bit flags and
// taken once by the loop, so a press between two frames is never lost and never
// counted twice. Moving the mouse steers too: the pointer's offset from centre is
// a stick the pilot can hold.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_BOOST = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'Equal', 'NumpadAdd']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'Minus', 'NumpadSubtract']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const RESTART = new Set(['KeyR']);

export function createInput(canvas) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let throttleUp = false;
  let throttleDown = false;
  let actions = 0;
  let boostHeld = false;
  /** Mouse stick: -1..1 on each axis, 0 when the mouse has not moved lately. */
  let mouseX = 0;
  let mouseY = 0;
  let mouseFresh = 0;

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (THROTTLE_UP.has(event.code)) throttleUp = true;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = true;
    else if (CONFIRM.has(event.code)) {
      boostHeld = true;
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (CONFIRM.has(event.code)) boostHeld = false;
    else if (THROTTLE_UP.has(event.code)) throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false; right = false; up = false; down = false;
    throttleUp = false; throttleDown = false; boostHeld = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    mouseFresh = 1;
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 0) actions |= ACTION_CONFIRM;
    if (event.button === 2) actions |= ACTION_BOOST;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** -1 left, 1 right, 0 neither or both; mouse stick wins when it moved lately. */
    steerX() {
      if (mouseFresh > 0) return Math.max(-1, Math.min(1, mouseX * 1.4));
      return (right ? 1 : 0) - (left ? 1 : 0);
    },
    /** -1 climb, 1 descend (screen sense); mouse stick wins when it moved lately. */
    steerY() {
      if (mouseFresh > 0) return Math.max(-1, Math.min(1, mouseY * 1.4));
      return (down ? 1 : 0) - (up ? 1 : 0);
    },
    /** Holding Space (or Enter) burns fuel for a burst of speed. */
    boost() {
      return boostHeld;
    },
    /** -1 throttle down, 1 throttle up, 0 neither or both. */
    throttle() {
      return (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0);
    },
    /** Age the mouse stick: it fades out a second after the last movement. */
    ageMouse(dt) {
      mouseFresh = Math.max(0, mouseFresh - dt);
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
