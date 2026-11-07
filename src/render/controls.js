// Native controls let touch menus use screen pixels while combat stays on its pixel grid.
import { view } from "../engine/screen.js";
import { settings } from "../settings.js";
import { SKILLS, STAT_CARDS } from "../game/skills.js";
import { PAUSE_ITEMS } from "./screens.js";
import { icon } from "./icons.js";
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
  panel.className = "control-panel";
  panel.setAttribute("aria-labelledby", "control-title");
  // Touch-capable laptops still need the game's familiar arrow-key menu navigation.
  panel.addEventListener("keydown", (e) => {
    if (!["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(e.code)) return;
    const buttons = [...panel.querySelectorAll("button:not(:disabled)")];
    const current = buttons.indexOf(document.activeElement);
    if (current < 0) return;
    e.preventDefault();
    const dir = e.code === "ArrowUp" || e.code === "ArrowLeft" ? -1 : 1;
    buttons[(current + dir + buttons.length) % buttons.length].focus();
  });
  root.append(shade, pause, panel);
  document.body.append(root);

  let section = "main", previousType = null, previousKey = "", previousCards = null;
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
    update(state, game, blocked) {
      const cs = game?.cards;
      const type = state === "load-error" ? "error" : view.touch && state === "pause" ? "pause"
        : touchCards() && state === "play" && cs ? "cards" : null;
      pause.hidden = !view.touch || state !== "play" || blocked;
      pause.style.top = touchCards() ? "max(12px, env(safe-area-inset-top))" : `max(${Math.round(view.top + 40 * view.scale)}px, env(safe-area-inset-top))`;
      panel.hidden = !type || blocked;
      shade.hidden = !type || type === "cards" || blocked;
      root.style.setProperty("--cards-top", `${view.top + view.height + 12}px`);
      if (type !== previousType) section = "main";
      const labels = type === "pause" ? PAUSE_ITEMS.map((it) => it.label()).join("|") : "";
      const key = `${type}|${section}|${labels}|${cs?.chosen ?? -1}`;
      if (key !== previousKey || (type === "cards" && cs !== previousCards)) {
        const focused = document.activeElement?.dataset.action;
        panel.replaceChildren();
        countdown = null;
        panel.className = `control-panel${type === "cards" ? " touch-cards" : ""}`;
        panel.setAttribute("role", type === "cards" ? "region" : "dialog");
        if (type === "cards") panel.removeAttribute("aria-modal");
        else panel.setAttribute("aria-modal", "true");
        const heading = document.createElement("h2");
        heading.id = "control-title";
        heading.textContent = type === "error" ? "暂时无法开始" : type === "cards" ? "选择一项强化" : section === "main" ? "暂停" : "游戏设置";
        panel.append(heading);
        if (type === "error") {
          const message = document.createElement("p");
          message.textContent = "游戏资源未能完整载入。请检查网络后重新加载。";
          panel.append(message, button("重新加载", () => location.reload(), "reload"));
        } else if (type === "pause") {
          const grid = document.createElement("div");
          grid.className = "control-menu";
          if (section === "main") {
            grid.append(menuItem("resume"), menuItem("mode"), button("游戏设置", () => { section = "settings"; }, "settings"), menuItem("restart"), menuItem("title"));
          } else {
            grid.append(button("返回暂停菜单", () => { section = "main"; }, "back"));
            for (const id of ["autoPick", "shake", "flashes", "quality", "music", "sfx", "mute"]) grid.append(menuItem(id));
          }
          panel.append(grid);
          if (section === "main") {
            const hint = document.createElement("p");
            hint.textContent = settings.mode === "manual" ? "点英雄左右两侧攻击，上划跳跃；移动需连接键盘。" : "英雄自动战斗，你只需选择升级强化。";
            panel.append(hint);
          }
        } else if (type === "cards") {
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
            const pic = document.createElement("canvas");
            pic.width = pic.height = 12;
            pic.setAttribute("aria-hidden", "true");
            pic.getContext("2d").drawImage(icon(def.icon, def.color), 0, 0);
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
        if (type === "pause" || type === "error") {
          const buttons = [...panel.querySelectorAll("button")];
          (buttons.find((b) => b.dataset.action === focused) ?? buttons[0])?.focus({ preventScroll: true });
        }
        previousKey = key;
        previousCards = cs;
      }
      if (countdown) {
        const text = settings.autoPick ? `${Math.max(0, Math.ceil(6 - cs.t))} 秒后自动选择 · 点此关闭` : "自动选择已关闭 · 点此开启";
        if (countdown.textContent !== text) countdown.textContent = text;
      }
      previousType = type;
    },
  };
}
