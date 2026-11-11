// The live run and its result share the same readable build, sourced from the card definitions.
import { SKILLS, STAT_CARDS, MAX_SKILLS } from "../game/skills.js";
import { icon } from "./icons.js";

export function skillIcon(def) {
  const pic = document.createElement("canvas");
  pic.width = pic.height = 12;
  pic.setAttribute("aria-hidden", "true");
  pic.getContext("2d").drawImage(icon(def.icon, def.color), 0, 0);
  return pic;
}

export function appendBuild(parent, skills, stats) {
  const title = document.createElement("h3");
  title.textContent = `技能 ${Object.keys(skills).length}/${MAX_SKILLS}`;
  const hint = document.createElement("p");
  hint.className = "build-hint";
  hint.textContent = "新技能占用槽位，升级不占新槽位。展开技能可查看已获得的升级。";
  parent.append(title, hint);
  const list = document.createElement("div");
  list.className = "build-list";
  for (const [id, lv] of Object.entries(skills)) {
    const def = SKILLS[id], item = document.createElement("details"), summary = document.createElement("summary");
    item.dataset.skill = id;
    const name = document.createElement("span");
    name.textContent = `${def.name} · Lv${lv}${lv === def.max ? " · 已满级" : ""}`;
    name.style.color = def.color;
    summary.append(skillIcon(def), name);
    const upgrades = document.createElement("ol");
    for (const desc of def.desc.slice(0, lv)) {
      const row = document.createElement("li");
      row.textContent = desc;
      upgrades.append(row);
    }
    item.append(summary, upgrades);
    list.append(item);
  }
  if (!Object.keys(skills).length) {
    const empty = document.createElement("p");
    empty.textContent = "尚未获得技能，升级时可选择。";
    list.append(empty);
  }
  parent.append(list);
  const statTitle = document.createElement("h3");
  statTitle.textContent = "属性强化";
  const statList = document.createElement("ul");
  statList.className = "build-stats";
  for (const [id, lv] of Object.entries(stats)) {
    const def = STAT_CARDS[id], row = document.createElement("li"), name = document.createElement("strong"), desc = document.createElement("span");
    row.dataset.stat = id;
    name.textContent = `${def.name} ×${lv}`;
    name.style.color = def.color;
    desc.textContent = `每次：${def.desc[0]}`;
    row.append(name, desc);
    statList.append(row);
  }
  parent.append(statTitle, statList);
  if (!Object.keys(stats).length) {
    const empty = document.createElement("p");
    empty.textContent = "尚未选择属性强化。";
    parent.append(empty);
  }
}
