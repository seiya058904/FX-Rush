// Keyboard, mouse and touch, reduced to a handful of actions. Presses are latched until the game reads them,
// so a click that lands during a hit-stop or a slow frame is never lost.

import { canvas, toLogical, view, fit } from "./screen.js";

const KEYS = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  ArrowUp: "jump", KeyW: "jump", Space: "jump",
  ArrowDown: "down", KeyS: "down",
  Enter: "confirm", NumpadEnter: "confirm",
  Escape: "pause", KeyP: "pause",
  KeyM: "mute",
  Tab: "mode",
  Digit1: "pick1", Digit2: "pick2", Digit3: "pick3", Numpad1: "pick1", Numpad2: "pick2", Numpad3: "pick3",
  F3: "debug",
};

const held = new Set();
const latched = new Map(); // action -> count
const listeners = new Set();

export const pointer = { x: -1, y: -1, down: false, clicks: [], moved: false };

function press(action) {
  latched.set(action, (latched.get(action) ?? 0) + 1);
  lastInput = performance.now();
}
let lastInput = performance.now();
export const idleFor = () => (performance.now() - lastInput) / 1000;
export const touchInput = () => usedTouch;
let usedTouch = false;

window.addEventListener("keydown", (e) => {
  // Native buttons keep activation/navigation keys; game-wide shortcuts still work.
  if (e.target.closest?.("#game-controls button, #game-controls summary") && !["Escape", "KeyP", "KeyM", "F3", "Digit1", "Digit2", "Digit3", "Numpad1", "Numpad2", "Numpad3"].includes(e.code)) return;
  const a = KEYS[e.code];
  if (!a) return;
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "F3", "Tab"].includes(e.code)) e.preventDefault();
  if (!e.repeat) press(a);
  held.add(a);
  lastInput = performance.now();
});
window.addEventListener("keyup", (e) => {
  const a = KEYS[e.code];
  if (a) held.delete(a);
});
window.addEventListener("blur", () => {
  input.reset(true);
  for (const f of listeners) f("blur");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    input.reset(true);
    for (const f of listeners) f("hidden");
  }
});

// pointer: a click/tap is an attack in play and a button press in menus; the game decides which
let touchStart = null;
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const [x, y] = toLogical(e.clientX, e.clientY);
  pointer.x = x; pointer.y = y; pointer.down = true;
  if (e.pointerType === "touch") {
    usedTouch = true;
    view.touch = true;
    touchStart = { x, y, t: performance.now(), id: e.pointerId };
  }
  pointer.clicks.push({ x, y, button: e.button, touch: e.pointerType === "touch" });
  lastInput = performance.now();
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  const [x, y] = toLogical(e.clientX, e.clientY);
  pointer.x = x; pointer.y = y; pointer.moved = true;
  // a quick upward swipe is a jump on touch screens
  if (touchStart && e.pointerId === touchStart.id && touchStart.y - y > 18 && performance.now() - touchStart.t < 350) {
    press("jump");
    touchStart = null;
  }
});
const up = (e) => {
  pointer.down = false;
  if (touchStart && e.pointerId === touchStart.id) touchStart = null;
  // On a hybrid device, finish the first gesture before moving the canvas to its touch layout.
  if (e.pointerType === "touch") fit();
};
canvas.addEventListener("pointerup", up);
canvas.addEventListener("pointercancel", up);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

export const input = {
  held: (a) => held.has(a),
  /** Was it pressed since last asked? Consumes one press. */
  take(a) {
    const n = latched.get(a) ?? 0;
    if (!n) return false;
    if (n === 1) latched.delete(a);
    else latched.set(a, n - 1);
    return true;
  },
  peek: (a) => (latched.get(a) ?? 0) > 0,
  clear(a) {
    if (a) latched.delete(a);
    else latched.clear();
  },
  /** A new screen owns new presses. Held movement is separate from queued actions. */
  reset(releaseHeld = false) {
    latched.clear();
    pointer.clicks = [];
    pointer.moved = false;
    pointer.down = false;
    touchStart = null;
    if (releaseHeld) held.clear();
  },
  /** Pointer clicks since last asked. */
  takeClicks() {
    const c = pointer.clicks;
    pointer.clicks = [];
    return c;
  },
  press,
  onSystem(f) {
    listeners.add(f);
  },
};
