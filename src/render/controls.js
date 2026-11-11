// Native controls let touch menus use screen pixels while combat stays on its pixel grid.
import { canvas, view } from "../engine/screen.js";
import { settings } from "../settings.js";
import { SKILLS, STAT_CARDS, MAX_SKILLS } from "../game/skills.js";
import { PAUSE_ITEMS } from "./screens.js";
import { appendBuild, skillIcon } from "./build.js";
import "./controls.css";

export const touchCards = () => view.touch && window.innerHeight > window.innerWidth;

export function createControls(actions) {
  const root = document.createElement("div");
  root.id = "game-controls";
  const shade = document.createElement("div");
  shade.className = "control-shade";
  const pause = document.createElement("button");
  pause.type = "button";
  pause.className = "touch-pause";
  pause.textContent = "暂停";
  pause.addEventListener("click", actions.pause);
  const panel = document.createElement("section");
  panel.hidden = true;
  panel.className = "control-panel";
  panel.setAttribute("aria-labelledby", "control-title");
  let modal = false;
  const focusable = () => [...panel.querySelectorAll("button:not(:disabled), summary")];
  // Native dialogs own Tab, while menus also keep the familiar arrow-key navigation.
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && modal) {
      const items = focusable(), current = items.indexOf(document.activeElement);
      e.preventDefault();
      e.stopPropagation();
      items[(current + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
      return;
    }
    if (!["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(e.code)) return;
    if (!document.activeElement?.matches(".control-menu button, .results-actions button")) return;
    const buttons = [...panel.querySelectorAll("button:not(:disabled)")];
    const current = buttons.indexOf(document.activeElement);
    if (current < 0) return;
    e.preventDefault();
    const dir = e.code === "ArrowUp" || e.code === "ArrowLeft" ? -1 : 1;
    buttons[(current + dir + buttons.length) % buttons.length].focus();
  });
  root.append(shade, pause, panel);
  document.body.append(root);
  document.addEventListener("focusin", (e) => {
    if (modal && !panel.contains(e.target)) focusable()[0]?.focus({ preventScroll: true });
  });

  let section = "main", previousType = null, previousKey = "", previousCards = null, previousGame = null;
  let buildFrom = null, returnFocus = null;
  let countdown = null;
  const button = (text, action, id) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.dataset.action = id;
    b.addEventListener("click", action);
    return b;
  };
  const menuItem = (id) => {
    const item = PAUSE_ITEMS.find((it) => it.id === id);
    return button(item.label(), () => actions.pauseAction(id), id);
  };

  return {
    get modalOpen() { return modal || !!buildFrom; },
    showBuild(from) { buildFrom = from; },
    back() {
      if (buildFrom) { buildFrom = null; returnFocus = "build"; return true; }
      if (section !== "main") { section = "main"; returnFocus = "settings"; return true; }
      return false;
    },
    update(state, game, blocked, resultsT = 0) {
      if ((buildFrom && state !== buildFrom) || game !== previousGame) buildFrom = null;
      const cs = game?.cards;
      const type = state === "load-error" ? "error" : buildFrom ? "build" : view.touch && state === "pause" ? "pause"
        : view.touch && state === "results" && resultsT >= 0.6 ? "results"
        : touchCards() && state === "play" && cs ? "cards" : null;
      pause.hidden = !view.touch || state !== "play" || blocked;
      pause.style.top = touchCards() ? "max(12px, env(safe-area-inset-top))" : `max(${Math.round(view.top + 40 * view.scale)}px, env(safe-area-inset-top))`;
      panel.hidden = !type || blocked;
      const belowFight = touchCards() && (type === "cards" || type === "results");
      shade.hidden = !type || belowFight || blocked;
      const wasModal = modal;
      modal = !!type && type !== "cards" && !blocked;
      canvas.inert = modal;
      pause.inert = modal;
      if (wasModal && !modal && panel.contains(document.activeElement)) canvas.focus({ preventScroll: true });
      root.style.setProperty("--cards-top", `${view.top + view.height + 12}px`);
      if (type !== previousType) section = "main";
      const labels = type === "pause" ? PAUSE_ITEMS.map((it) => it.label()).join("|") : "";
      const key = `${type}|${section}|${labels}|${cs?.chosen ?? -1}|${belowFight}`;
      if (key !== previousKey || game !== previousGame || (type === "cards" && cs !== previousCards)) {
        const focused = returnFocus ?? document.activeElement?.dataset.action;
        returnFocus = null;
        panel.replaceChildren();
        countdown = null;
        panel.className = `control-panel${type === "cards" ? " touch-cards" : ""}${type === "results" ? " result-panel" : ""}${belowFight ? " below-fight" : ""}${type === "build" ? " build-panel" : ""}`;
        panel.setAttribute("role", type === "cards" ? "region" : "dialog");
        if (type === "cards") panel.removeAttribute("aria-modal");
        else panel.setAttribute("aria-modal", "true");
        const heading = document.createElement("h2");
        heading.id = "control-title";
        heading.textContent = type === "error" ? "暂时无法开始" : type === "cards" ? "选择一项强化" : type === "build" ? "本局构筑"
          : type === "results" ? (game.result.won ? "胜利！" : "挑战结束") : section === "main" ? "暂停" : "游戏设置";
        panel.append(heading);
        if (type === "error") {
          const message = document.createElement("p");
          message.textContent = "游戏资源未能完整载入。请检查网络后重新加载。";
          panel.append(message, button("重新加载", () => location.reload(), "reload"));
        } else if (type === "pause") {
          const grid = document.createElement("div");
          grid.className = "control-menu";
          if (section === "main") {
            grid.append(menuItem("resume"), menuItem("mode"), menuItem("build"), button("游戏设置", () => { section = "settings"; }, "settings"), menuItem("restart"), menuItem("title"));
          } else {
            grid.append(button("返回暂停菜单", () => { section = "main"; returnFocus = "settings"; }, "back"));
            for (const id of ["autoPick", "shake", "flashes", "quality", "music", "sfx", "mute"]) grid.append(menuItem(id));
          }
          panel.append(grid);
          if (section === "main") {
            const hint = document.createElement("p");
            hint.textContent = settings.mode === "manual" ? "点英雄左右两侧攻击，上划跳跃；移动需连接键盘。" : "英雄自动战斗，你只需选择升级强化。";
            panel.append(hint);
          }
        } else if (type === "build") {
          panel.append(button(buildFrom === "pause" ? "返回暂停菜单" : "返回结算", () => { buildFrom = null; returnFocus = "build"; }, "back"));
          const result = state === "results" ? game.result : null;
          appendBuild(panel, result?.skills ?? game.skills.lv, result?.statLv ?? game.skills.statLv);
        } else if (type === "results") {
          const r = game.result, message = document.createElement("p");
          message.className = "result-message";
          message.textContent = r.won ? "虚空之眼已被击碎！" : `倒在了第 ${r.stage} 关`;
          const stats = document.createElement("dl");
          stats.className = "result-stats";
          const time = `${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, "0")}`;
          for (const [label, value] of [["用时", time], ["击杀", r.kills], ["等级", r.level], ["最高连击", r.combo], ["大招", r.ultimates], ["金币", r.coins]]) {
            const row = document.createElement("div"), term = document.createElement("dt"), val = document.createElement("dd");
            term.textContent = label; val.textContent = value;
            row.append(term, val); stats.append(row);
          }
          const buttons = document.createElement("div");
          buttons.className = "results-actions";
          buttons.append(button("再来一次", () => actions.result(0), "retry"), button("返回标题", () => actions.result(1), "title"), button("本局构筑", () => actions.result(2), "build"));
          panel.append(message, stats, buttons);
        } else if (type === "cards") {
          const slots = document.createElement("p");
          slots.className = "choice-slots";
          slots.textContent = `技能 ${game.skills.order.length}/${MAX_SKILLS} · 升级不占新槽位`;
          panel.append(slots);
          countdown = button("", () => actions.pauseAction("autoPick"), "autoPick");
          countdown.className = "choice-countdown";
          countdown.disabled = cs.chosen >= 0;
          panel.append(countdown);
          const choices = document.createElement("div");
          choices.className = "touch-choices";
          cs.list.forEach((c, i) => {
            const def = (c.skill ? SKILLS : STAT_CARDS)[c.id];
            const b = button("", () => actions.choose(i), `card-${i}`);
            b.className = "touch-choice";
            b.disabled = cs.chosen >= 0;
            b.classList.toggle("chosen", cs.chosen === i);
            b.style.setProperty("--skill-color", def.color);
            const pic = skillIcon(def);
            const copy = document.createElement("span"), name = document.createElement("strong"), desc = document.createElement("span");
            name.textContent = `${def.name} · ${c.lv ? `Lv${c.lv} → ${c.lv + 1}` : "新强化"}`;
            desc.textContent = def.desc[c.skill ? c.lv : 0];
            copy.append(name, desc);
            b.append(pic, copy);
            choices.append(b);
          });
          panel.append(choices);
          panel.scrollTop = 0;
        }
        if (modal) {
          const items = focusable();
          (items.find((b) => b.dataset.action === focused) ?? items[0])?.focus({ preventScroll: true });
        }
        if (type !== previousType) panel.scrollTop = 0;
        previousKey = key;
        previousCards = cs;
      }
      if (countdown) {
        const text = settings.autoPick ? `${Math.max(0, Math.ceil(6 - cs.t))} 秒后自动选择 · 点此关闭` : "自动选择已关闭 · 点此开启";
        if (countdown.textContent !== text) countdown.textContent = text;
      }
      previousType = type;
      previousGame = game;
    },
  };
}
