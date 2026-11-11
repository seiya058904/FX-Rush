// The in-fight interface, drawn at the game's own 320 x 180 pixel grid: compact bars in the corners, the skill
// rotation along the bottom, combo top-right, the boss bar when it matters, banners for big moments, and the
// level-up cards (the fight stays visible behind them). Everything uses one frame style and one pixel font.

import { drawText, measureText, wrapText } from "../engine/text.js";
import { cineK } from "../game/game.js";
import { icon } from "./icons.js";
import { SKILLS, STAT_CARDS, MAX_SKILLS } from "../game/skills.js";
import { W, H, FLOOR } from "../config.js";
import { view } from "../engine/screen.js";
import { settings } from "../settings.js";

const INK = "#05030a";
export const UI = {
  ink: INK, panel: "rgba(10,8,20,0.82)", line: "#3a2e54", lineHi: "#8a74c0", text: "#f4ecdc", dim: "#9a8eb0",
  hp: "#e8304a", hpHi: "#ff7a8a", hpLow: "#7a1020", xp: "#36d0a8", xpHi: "#b0ffe0", gold: "#ffd84a", rush: "#ff7a2a", rushHi: "#ffe27a", danger: "#ff2d5a",
};

export function rect(ctx, x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
/** A pixel frame: ink outline, a lit inner rim, notched corners. */
export function panel(ctx, x, y, w, h, o = {}) {
  const { fill = UI.panel, rim = UI.line, hi = null } = o;
  rect(ctx, x + 1, y, w - 2, h, INK);
  rect(ctx, x, y + 1, w, h - 2, INK);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, rim);
  rect(ctx, x + 2, y + 2, w - 4, h - 4, fill);
  if (hi) {
    rect(ctx, x + 2, y + 1, w - 4, 1, hi);
    rect(ctx, x + 1, y + 2, 1, 2, hi);
  }
}
function bar(ctx, x, y, w, h, frac, trail, c, cHi, cBack = "#1a1426") {
  rect(ctx, x, y, w, h, INK);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, cBack);
  const fw = Math.max(0, Math.round((w - 2) * Math.min(1, frac)));
  if (trail > frac) rect(ctx, x + 1 + fw, y + 1, Math.round((w - 2) * Math.min(1, trail)) - fw, h - 2, "#fff4dc");
  rect(ctx, x + 1, y + 1, fw, h - 2, c);
  rect(ctx, x + 1, y + 1, fw, 1, cHi);
}

const trails = { hp: 1, boss: 1 };
export function drawHud(ctx, g, dt) {
  const h = g.hero;
  if (g.mode === "over") return;
  ctx.save();
  // ---- top-left: health, level, xp
  const hpF = h.hp / h.maxHp;
  trails.hp = trails.hp > hpF ? Math.max(hpF, trails.hp - dt * 0.6) : hpF;
  panel(ctx, 3, 3, 104, 22);
  drawText(ctx, `Lv${g.level}`, 8, 7, { font: "big", color: UI.gold, shadow: INK });
  const lw = measureText(`Lv${g.level}`, { font: "big" });
  const bx = 12 + lw;
  bar(ctx, bx, 6, 100 - lw - 6, 8, hpF, trails.hp, hpF < 0.3 ? (Math.floor(g.realTime * 6) & 1 ? UI.hpHi : UI.hp) : UI.hp, UI.hpHi);
  drawText(ctx, `${Math.ceil(h.hp)}`, bx + 3, 7, { font: "mini", color: "#ffffff", shadow: INK });
  bar(ctx, bx, 16, 100 - lw - 6, 5, g.xp / g.xpNext, 0, UI.xp, UI.xpHi);

  // ---- top-center: stage progress or the boss
  const st = g.stage;
  if (g.boss && !g.boss.removed && g.boss.spawning <= 0 && !g.boss.dead) {
    const b = g.boss, f = Math.max(0, b.hp / b.maxHp);
    trails.boss = trails.boss > f ? Math.max(f, trails.boss - dt * 0.35) : f;
    panel(ctx, 110, 3, 150, 21, { rim: "#5a1a2a" });
    drawText(ctx, b.title.split(" · ")[0], 185, 5, { align: "center", color: "#ffd0d8", shadow: INK });
    bar(ctx, 114, 16, 142, 6, f, trails.boss, b.phase2 ? "#ff3a2a" : "#d02a48", "#ff8a9a");
    rect(ctx, 114 + 71, 16, 1, 6, INK);
  } else if (st && !g.cards) {
    const prog = g.phase === "boss" ? 1 : Math.min(1, g.stageT / st.length);
    panel(ctx, 112, 3, 96, 14);
    drawText(ctx, st.name, 117, 5, { color: UI.text, shadow: INK });
    const pw = 36, px = 166;
    rect(ctx, px, 8, pw, 4, INK);
    rect(ctx, px + 1, 9, Math.round((pw - 2) * prog), 2, "#c86aff");
    // a skull marks the boss at the end of the bar
    rect(ctx, px + pw + 1, 7, 4, 4, prog >= 1 ? UI.danger : "#6a5a80");
    rect(ctx, px + pw + 2, 11, 2, 1, prog >= 1 ? UI.danger : "#6a5a80");
  }

  // ---- top-right: combo
  if (g.combo.n >= 3) {
    const n = g.combo.n, s = 1 + (g.combo.pop > 0.6 ? 1 : 0);
    const col = n >= 100 ? "#ff7a2a" : n >= 50 ? "#ffd84a" : n >= 25 ? "#ffe9a8" : "#ffffff";
    drawText(ctx, String(n), W - 6, 5, { font: "big", scale: 2, color: col, outline: INK, align: "right" });
    drawText(ctx, "COMBO", W - 6, 21, { font: "mini", color: "#ffd0a0", outline: INK, align: "right" });
    const tw = Math.round(40 * Math.max(0, g.combo.t / 2.6));
    rect(ctx, W - 6 - tw, 28, tw, 1, col);
    void s;
  }
  drawText(ctx, `${g.stats.kills}`, W - 6, 32, { font: "mini", color: UI.dim, outline: INK, align: "right" });

  // ---- bottom-left: the skill rotation
  const order = g.skills.order;
  let x = 4;
  const y = H - 18;
  for (const id of order) {
    const s = SKILLS[id], lv = g.skills.level(id), cd = g.skills.cooldown(id);
    const casted = g.lastCast?.id === id && g.time - g.lastCast.t < 0.25;
    panel(ctx, x, y, 16, 16, { rim: casted ? s.color : UI.line, fill: casted ? "rgba(255,255,255,0.25)" : UI.panel });
    ctx.drawImage(icon(s.icon, s.color, cd > 0.02), x + 2, y + 2);
    if (cd > 0.02) {
      const hh = Math.round(12 * cd);
      ctx.fillStyle = "rgba(5,3,10,0.55)";
      ctx.fillRect(x + 2, y + 2, 12, hh);
    }
    for (let i = 0; i < lv; i++) rect(ctx, x + 2 + i * 2 + (i > 2 ? 0 : 0), y + 15, 1, 1, s.color);
    x += 17;
  }
  // ---- bottom-right: the rush meter
  const rw = 70, rx = W - rw - 5, ry = H - 11;
  const full = g.rushV >= 100;
  panel(ctx, rx - 2, ry - 4, rw + 4, 12, { rim: full ? UI.rushHi : UI.line });
  rect(ctx, rx + 1, ry - 1, rw - 2, 6, "#1a1426");
  const rf = Math.round((rw - 2) * (g.rushV / 100));
  rect(ctx, rx + 1, ry - 1, rf, 6, full ? (Math.floor(g.realTime * 10) & 1 ? UI.rushHi : UI.rush) : UI.rush);
  rect(ctx, rx + 1, ry - 1, rf, 1, UI.rushHi);
  drawText(ctx, full ? "RUSH!" : "RUSH", rx + 3, ry, { font: "mini", color: full ? "#ffffff" : "#ffd8b0", shadow: INK });

  // ---- touch: a big, quiet attack button
  if (view.touch && settings.mode === "manual") {
    ctx.globalAlpha = 0.35;
    rect(ctx, W - 40, H - 54, 32, 32, INK);
    rect(ctx, W - 39, H - 53, 30, 30, "#3a2e54");
    ctx.globalAlpha = 1;
    drawText(ctx, "攻", W - 24, H - 43, { align: "center", color: "#ffffff", alpha: 0.7 });
  }
  // pause hint
  if (!view.touch) drawText(ctx, "II", W - 6, 40, { font: "mini", color: "#6a5a80", align: "right" });
  ctx.restore();
}

/** World-space floating numbers and words (the light-weight fallback for PixelFX's number effects). */
export function drawFloats(ctx, g) {
  for (const f of g.floats) {
    const u = f.t / 0.9, sx = f.x - g.camX, sy = FLOOR + f.y - u * 18 - (f.kind === "crit" ? 4 : 0);
    const alpha = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
    if (f.kind === "dmg" || f.kind === "crit") {
      const col = f.kind === "crit" ? "#ffd84a" : f.el === "fire" ? "#ffb070" : f.el === "ice" ? "#b8ecff" : f.el === "shock" ? "#c8e8ff" : f.el === "poison" ? "#b8f070" : f.el === "arcane" ? "#e0b0ff" : "#fff4dc";
      drawText(ctx, f.text, sx, sy, { font: f.kind === "crit" ? "big" : "mini", color: col, outline: INK, align: "center", alpha });
    } else if (f.kind === "hurt") drawText(ctx, f.text, sx, sy, { font: "big", color: "#ff4060", outline: INK, align: "center", alpha });
    else {
      const col = f.kind === "heal" ? "#7ee88a" : f.kind === "warn" ? "#ff8a6a" : f.kind === "skill" ? "#ffe27a" : f.kind === "rush" ? "#ffb070" : "#e0d8f0";
      drawText(ctx, f.text, sx, sy, { color: col, outline: INK, align: "center", alpha });
    }
  }
}

/** An ultimate's show: bars close in top and bottom, the move's name slides across in its colour. */
export function drawCinema(ctx, g) {
  const c = g.cine;
  if (!c) return;
  const k = Math.max(0, cineK(c)), bar = Math.round(16 * k);
  ctx.fillStyle = "#05030a";
  ctx.fillRect(0, 0, W, bar);
  ctx.fillRect(0, H - bar, W, bar);
  const slide = Math.min(1, c.t / 0.3), x = Math.round(-120 + slide * 132);
  ctx.globalAlpha = k;
  ctx.fillStyle = "rgba(5,3,10,0.7)";
  ctx.fillRect(x - 4, 26, 132, 30);
  ctx.fillStyle = c.color;
  ctx.fillRect(x - 4, 26, 3, 30);
  ctx.fillRect(x - 4, 55, Math.round(132 * slide), 1);
  drawText(ctx, c.name, x + 4, 29, { scale: 2, color: c.color, outline: INK });
  drawText(ctx, `FX RUSH · ${c.en}`, x + 4, 47, { font: "mini", color: "#e8dcff", outline: INK });
  ctx.globalAlpha = 1;
}

export function drawBanner(ctx, g) {
  const b = g.banner;
  if (!b) return;
  const u = b.t / b.dur, inT = Math.min(1, b.t / 0.18), outT = u > 0.8 ? (u - 0.8) / 0.2 : 0;
  const y = b.small ? 48 : 58;
  const w = Math.round((b.small ? 200 : 320) * inT);
  ctx.globalAlpha = 1 - outT;
  rect(ctx, 160 - w / 2, y - 2, w, b.small ? 26 : 34, "rgba(5,3,10,0.72)");
  rect(ctx, 160 - w / 2, y - 2, w, 1, b.danger ? UI.danger : "#c8a8ff");
  rect(ctx, 160 - w / 2, y + (b.small ? 23 : 31), w, 1, b.danger ? UI.danger : "#c8a8ff");
  if (inT >= 1) {
    const isLatin = /^[\x00-\x7f]+$/.test(b.title);
    if (isLatin) drawText(ctx, b.title, 160, y + 1, { font: "big", scale: b.small ? 2 : 3, color: b.danger ? "#ff5a7a" : "#fff0c0", outline: INK, align: "center" });
    else drawText(ctx, b.title, 160, y + 1, { scale: 2, color: b.danger ? "#ff5a7a" : "#fff0c0", outline: INK, align: "center" });
    drawText(ctx, b.sub, 160, y + (b.small ? 15 : 23) - (isLatin ? 0 : 0), { color: "#d8c8f0", align: "center", shadow: INK });
  }
  ctx.globalAlpha = 1;
}

export function drawFlash(ctx, g) {
  const f = g.screenFlash;
  if (!f || !settings.flashes) return;
  ctx.globalAlpha = Math.min(0.3, (f.t / f.dur) * 0.3);
  ctx.fillStyle = f.color;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- level-up cards
export const CARD = { w: 92, h: 86, y: 54, gap: 8 };
export function cardRect(i) {
  const total = CARD.w * 3 + CARD.gap * 2, x0 = Math.round((W - total) / 2);
  return [x0 + i * (CARD.w + CARD.gap), CARD.y, CARD.w, CARD.h];
}
export function drawCards(ctx, g) {
  const cs = g.cards;
  if (!cs) return;
  const open = Math.min(1, cs.t / 0.22), closing = cs.chosen >= 0 ? 1 - Math.max(0, cs.closeT) / 0.28 : 0;
  ctx.fillStyle = `rgba(5,3,12,${0.36 * open * (1 - closing)})`;
  ctx.fillRect(0, 0, W, H);
  drawText(ctx, "LEVEL UP", 160, 10 - (1 - open) * 10, { font: "big", scale: 2, color: UI.gold, outline: INK, align: "center", alpha: 1 - closing });
  drawText(ctx, "选择一项强化", 160, 33, { color: "#e8dcff", align: "center", shadow: INK, alpha: open * (1 - closing) });
  drawText(ctx, `技能 ${g.skills.order.length}/${MAX_SKILLS} · 升级不占新槽位`, 160, 44, { color: UI.dim, align: "center", shadow: INK, alpha: open * (1 - closing) });
  cs.list.forEach((c, i) => {
    let [x, y, w, h] = cardRect(i);
    const def = c.skill ? SKILLS[c.id] : STAT_CARDS[c.id];
    const lvNow = c.skill ? g.skills.level(c.id) : g.skills.statLv[c.id] ?? 0;
    const hover = cs.hover === i && cs.chosen < 0, chosen = cs.chosen === i;
    const delay = Math.max(0, Math.min(1, (cs.t - i * 0.06) / 0.2));
    y += Math.round((1 - delay) * 40) - (hover ? 3 : 0);
    if (cs.chosen >= 0 && !chosen) ctx.globalAlpha = 1 - closing;
    if (chosen) y -= Math.round(closing * 8);
    panel(ctx, x, y, w, h, { rim: hover || chosen ? def.color : UI.line, fill: chosen ? "rgba(60,40,90,0.95)" : "rgba(12,9,24,0.9)", hi: hover ? "#ffffff" : null });
    // icon block
    rect(ctx, x + w / 2 - 14, y + 4, 28, 28, INK);
    rect(ctx, x + w / 2 - 13, y + 5, 26, 26, "#1a1430");
    ctx.drawImage(icon(def.icon, def.color), x + w / 2 - 12, y + 6, 24, 24);
    // new / level
    if (c.skill && !lvNow) drawText(ctx, "NEW", x + 5, y + 5, { font: "mini", color: "#3af0c0", outline: INK });
    drawText(ctx, def.name, x + w / 2, y + 34, { color: def.color, align: "center", outline: INK });
    // level pips
    const max = def.max, pw = max * 5 - 1;
    for (let k = 0; k < max; k++) {
      const filled = k < lvNow, next = k === lvNow;
      rect(ctx, x + w / 2 - pw / 2 + k * 5, y + 47, 4, 2, filled ? def.color : next ? (Math.floor(g.realTime * 4) & 1 ? "#ffffff" : def.color) : "#2a2240");
    }
    // what this level does
    const text = c.skill ? def.desc[Math.min(def.desc.length - 1, lvNow)] : def.desc[0];
    const lines = wrapText(text, w - 10);
    lines.slice(0, 2).forEach((ln, k) => drawText(ctx, ln, x + w / 2, y + 52 + k * 11, { color: UI.text, align: "center" }));
    drawText(ctx, `${i + 1}`, x + w / 2, y + h - 8, { font: "mini", color: hover ? "#ffffff" : "#6a5a80", align: "center" });
    ctx.globalAlpha = 1;
  });
  // the auto-pick countdown
  if (settings.autoPick && cs.chosen < 0) {
    const left = Math.max(0, 6 - cs.t);
    drawText(ctx, `${Math.ceil(left)}秒后自动选择`, 160, 146, { color: "#8a7ea8", align: "center", shadow: INK });
  }
}
