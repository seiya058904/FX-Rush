// Title, pause, results and loading screens, in the same pixel style as the HUD.

import { drawText, measureText } from "../engine/text.js";
import { panel, rect, UI } from "./hud.js";
import { icon } from "./icons.js";
import { SKILLS } from "../game/skills.js";
import { W, H } from "../config.js";
import { audioSettings } from "../engine/audio.js";
import { settings } from "../settings.js";

const INK = UI.ink;

export function drawLogo(ctx, t, y = 30) {
  const word = "FX RUSH", scale = 4, w = measureText(word, { font: "big", scale });
  const x = Math.round(160 - w / 2);
  // a hot shadow, the letters, then a bright top band: chunky, layered, still pixel-exact
  drawText(ctx, word, x, y + scale, { font: "big", scale, color: "#4a0a1a", outline: INK });
  drawText(ctx, word, x, y, { font: "big", scale, color: "#ff5a3a", outline: INK });
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y, W, scale * 3);
  ctx.clip();
  drawText(ctx, word, x, y, { font: "big", scale, color: "#ffd27a" });
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y, W, scale);
  ctx.clip();
  drawText(ctx, word, x, y, { font: "big", scale, color: "#fff8e0" });
  ctx.restore();
  // a glint sweeping across
  const gx = ((t * 120) % 520) - 100;
  ctx.save();
  ctx.beginPath();
  ctx.rect(gx, y - 2, 6, scale * 7 + 4);
  ctx.clip();
  drawText(ctx, word, x, y, { font: "big", scale, color: "#ffffff" });
  ctx.restore();
}

export function drawTitle(ctx, t, loading) {
  drawLogo(ctx, t, 26);
  drawText(ctx, "像素特效 · 爽快自动战斗", 160, 62, { color: "#f0e0ff", align: "center", outline: INK });
  if (loading < 1) {
    rect(ctx, 110, 132, 100, 5, INK);
    rect(ctx, 111, 133, Math.round(98 * loading), 3, "#c86aff");
    drawText(ctx, "载入特效库…", 160, 140, { color: UI.dim, align: "center", shadow: INK });
  } else if (Math.floor(t * 2.2) % 2 === 0) drawText(ctx, "点击 或 按空格/回车 开始", 160, 132, { color: "#ffffff", align: "center", outline: INK });
  // a dark strip so the controls stay legible over whatever the hero is showing off
  ctx.fillStyle = "rgba(5,3,10,0.62)";
  ctx.fillRect(0, 153, W, 27);
  ctx.fillStyle = "rgba(200,170,255,0.25)";
  ctx.fillRect(0, 153, W, 1);
  drawText(ctx, "自动战斗 · 点击任意处加速连击 · A/D 移动 · 空格 跳跃", 160, 156, { color: "#b8acd0", align: "center", shadow: INK });
  drawText(ctx, "Esc 暂停/设置 · M 静音", 160, 167, { color: "#8a7ea8", align: "center", shadow: INK });
}

export const PAUSE_ITEMS = [
  { id: "resume", label: () => "继续游戏" },
  { id: "restart", label: () => "重新开始" },
  { id: "shake", label: () => `震屏：${settings.shake >= 1 ? "强" : settings.shake > 0 ? "弱" : "关"}` },
  { id: "flashes", label: () => `闪光：${settings.flashes ? "开" : "关"}` },
  { id: "autoPick", label: () => `自动选卡：${settings.autoPick ? "开" : "关"}` },
  { id: "quality", label: () => `画质：${{ auto: "自动", high: "高", mid: "中", low: "低" }[settings.quality]}` },
  { id: "music", label: () => `音乐音量：${Math.round(audioSettings.music * 10)}` },
  { id: "sfx", label: () => `音效音量：${Math.round(audioSettings.sfx * 10)}` },
  { id: "mute", label: () => `声音：${audioSettings.muted ? "静音" : "开"}` },
  { id: "title", label: () => "返回标题" },
];
export function pauseRect(i) {
  return [110, 36 + i * 12, 100, 11];
}
export function drawPause(ctx, sel, fps) {
  ctx.fillStyle = "rgba(5,3,12,0.6)";
  ctx.fillRect(0, 0, W, H);
  panel(ctx, 100, 14, 120, 164, { hi: "#5a4a80" });
  drawText(ctx, "暂停", 160, 20, { color: UI.gold, align: "center", scale: 1, outline: INK });
  PAUSE_ITEMS.forEach((it, i) => {
    const [x, y, w, h] = pauseRect(i);
    if (i === sel) rect(ctx, x, y - 1, w, h, "#3a2e5a");
    drawText(ctx, it.label(), 160, y, { color: i === sel ? "#ffffff" : "#c8bce0", align: "center" });
  });
  if (fps) drawText(ctx, `${fps} FPS`, 214, 168, { font: "mini", color: "#6a5a80", align: "right" });
}

export function drawResults(ctx, g, t, sel) {
  const r = g.result;
  const open = Math.min(1, t / 0.4);
  ctx.fillStyle = `rgba(5,3,12,${0.55 * open})`;
  ctx.fillRect(0, 0, W, H);
  const y0 = Math.round(16 + (1 - open) * 20);
  panel(ctx, 40, y0, 240, 150, { rim: r.won ? "#c8a040" : "#5a2a3a", hi: r.won ? "#ffe9a8" : null });
  if (r.won) drawText(ctx, "VICTORY", 160, y0 + 6, { font: "big", scale: 3, color: "#ffd84a", outline: INK, align: "center" });
  else drawText(ctx, "DEFEATED", 160, y0 + 6, { font: "big", scale: 3, color: "#ff5a7a", outline: INK, align: "center" });
  drawText(ctx, r.won ? "虚空之眼已被击碎！" : `倒在了第 ${r.stage} 关`, 160, y0 + 30, { color: "#f0e0ff", align: "center", shadow: INK });
  const mm = Math.floor(r.time / 60), ss = Math.floor(r.time % 60);
  const rows = [
    ["用时", `${mm}:${String(ss).padStart(2, "0")}`],
    ["击杀", `${r.kills}`],
    ["等级", `${r.level}`],
    ["最高连击", `${r.combo}`],
    ["大招", `${r.ultimates}`],
    ["金币", `${r.coins}`],
  ];
  rows.forEach(([k, v], i) => {
    const cx = i < 3 ? 70 : 170, cy = y0 + 46 + (i % 3) * 13;
    drawText(ctx, k, cx, cy, { color: UI.dim });
    drawText(ctx, v, cx + 82, cy + 2, { font: "big", color: "#ffffff", align: "right" });
  });
  // the build
  const ids = Object.keys(r.skills);
  drawText(ctx, "本局技能", 160, y0 + 88, { color: UI.dim, align: "center" });
  const iw = ids.length * 18, ix = 160 - iw / 2;
  ids.forEach((id, i) => {
    const s = SKILLS[id];
    panel(ctx, ix + i * 18, y0 + 101, 16, 16, { rim: s.color });
    ctx.drawImage(icon(s.icon, s.color), ix + i * 18 + 2, y0 + 103);
    drawText(ctx, `${r.skills[id]}`, ix + i * 18 + 14, y0 + 112, { font: "mini", color: "#ffffff", outline: INK, align: "right" });
  });
  const btn = (i, label, x) => {
    const on = sel === i;
    panel(ctx, x, y0 + 126, 74, 16, { rim: on ? UI.gold : UI.line, fill: on ? "rgba(70,50,110,0.95)" : UI.panel });
    drawText(ctx, label, x + 37, y0 + 129, { color: on ? "#ffffff" : "#c8bce0", align: "center" });
  };
  btn(0, "再来一次", 82);
  btn(1, "返回标题", 164);
}
export function resultsButton(i, t) {
  const y0 = Math.round(16 + (1 - Math.min(1, t / 0.4)) * 20);
  return [i === 0 ? 82 : 164, y0 + 126, 74, 16];
}
