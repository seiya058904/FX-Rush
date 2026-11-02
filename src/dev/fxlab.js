// FX Lab: every PixelFX effect through the game's own loader. Preview any id (with its act), and self-test the
// whole library: loads, draws something, stays inside its canvas, ends (one-shots end empty, loops stop when
// told), and how long a frame costs. The report is the "previewable" column of the coverage audit.

import { loadFx, ALL_IDS, createFrame, clearFrame, createFx, createAct, composite, backdrop, stockActor, drawActor, painterFor } from "../engine/pfx.js";
import { FX, CATEGORIES } from "../fx/registry.gen.js";
import { USAGE } from "../fx/usage.js";

const $ = (s) => document.querySelector(s);
const cv = $("#cv"), ctx = cv.getContext("2d");
let current = null, raf = 0, report = null;

function renderList(filter = "") {
  const list = $("#list");
  list.innerHTML = "";
  for (const c of CATEGORIES) {
    const ids = ALL_IDS.filter((id) => id.startsWith(c.id + "/") && (!filter || id.includes(filter) || (USAGE[id]?.role ?? "").includes(filter)));
    if (!ids.length) continue;
    const h = document.createElement("div");
    h.className = "cat";
    h.textContent = `${c.name} (${ids.length})`;
    list.append(h);
    for (const id of ids) {
      const d = document.createElement("div");
      d.className = "item";
      d.dataset.id = id;
      const r = report?.results.find((x) => x.id === id);
      d.innerHTML = `<span>${id.split("/")[1]}</span><span class="tag ${r ? (r.status === "pass" ? "ok" : r.status === "warn" ? "warn" : "bad") : ""}">${r ? r.status : FX[id].loop ? "loop" : FX[id].duration + "s"}</span>`;
      d.onclick = () => preview(id);
      list.append(d);
    }
  }
}

async function preview(id) {
  cancelAnimationFrame(raf);
  document.querySelectorAll(".item.on").forEach((e) => e.classList.remove("on"));
  document.querySelector(`.item[data-id="${id}"]`)?.classList.add("on");
  const mod = await loadFx(id);
  const info = FX[id];
  if (!mod) {
    $("#info").innerHTML = `<span class="bad">加载失败</span> ${id}`;
    return;
  }
  const useAct = $("#act").checked && mod.act;
  const m = 40, w = info.w + m * 2 + (useAct ? 80 : 0), h = info.h + m * 2, scale = Math.max(1, Math.min(4, Math.floor(Math.min(900 / w, 560 / h))));
  cv.width = w;
  cv.height = h;
  cv.style.width = w * scale + "px";
  cv.style.height = h * scale + "px";
  const frame = createFrame(w, h, 0, 0), img = new ImageData(w, h), bg = backdrop($("#bg").value, w, h, info.oy + m);
  const ox = info.ox + m + (useAct ? 30 : 0), oy = info.oy + m;
  let inst = useAct ? createAct(mod, { x: ox, y: oy }) : createFx(mod, { x: ox, y: oy });
  let lastT = performance.now(), t = 0;
  const u = USAGE[id];
  $("#info").textContent = `${id}  ${info.loop ? "loop" : "one-shot"} ${info.duration}s  ${info.w}x${info.h}  ${info.actor ? "actor " : ""}${mod.act ? "act " : ""}\n${mod.meta.desc}\n\n游戏内用途：${u ? u.role : "（未登记）"}`;
  const tick = (now) => {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    t += dt;
    inst.update(dt);
    clearFrame(frame);
    if (useAct) inst.draw(frame);
    else {
      inst.draw(frame, "back");
      if (info.actor) drawActor(painterFor(frame).place(ox, oy), inst.options.actor ?? stockActor(2));
      inst.draw(frame, "front");
    }
    composite(frame, img.data, bg);
    ctx.putImageData(img, 0, 0);
    if (inst.done()) {
      inst = useAct ? createAct(mod, { x: ox, y: oy }) : createFx(mod, { x: ox, y: oy });
      t = 0;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  current = id;
}

/** Self-test one effect. */
async function test(id) {
  const r = { id, status: "pass", notes: [] };
  const t0 = performance.now();
  let mod;
  try {
    mod = await loadFx(id);
  } catch (e) {
    mod = null;
  }
  r.loadMs = +(performance.now() - t0).toFixed(1);
  if (!mod) return { ...r, status: "fail", notes: ["load failed"] };
  const info = FX[id], M = 24, w = info.w + M * 2, h = info.h + M * 2;
  const frame = createFrame(w, h, 0, 0);
  try {
    const inst = createFx(mod, { x: info.ox + M, y: info.oy + M });
    const fps = 30, n = Math.min(360, Math.ceil(info.duration * fps) + (info.loop ? 0 : 1));
    let drawn = 0, outside = 0, ms = 0, worst = 0;
    for (let i = 0; i < n; i++) {
      const a = performance.now();
      if (i) inst.update(1 / fps);
      clearFrame(frame);
      inst.draw(frame);
      const d = performance.now() - a;
      ms += d;
      worst = Math.max(worst, d);
      let any = false;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const j = y * w + x;
          if (!frame.color[j] && !(frame.light[j] & 0xffffff)) continue;
          any = true;
          if (x < M || y < M || x >= M + info.w || y >= M + info.h) outside++;
        }
      if (any) drawn++;
    }
    r.frames = n;
    r.drawnFrames = drawn;
    r.avgMs = +(ms / n).toFixed(3);
    r.worstMs = +worst.toFixed(2);
    r.outsidePx = outside;
    if (!drawn) (r.status = "fail"), r.notes.push("never draws anything");
    if (outside > 0) (r.status = r.status === "fail" ? "fail" : "warn"), r.notes.push(`${outside} px outside its canvas`);
    // endings: a loop must stop when told; a one-shot must report done
    if (info.loop) {
      inst.stop();
      for (let i = 0; i < 12; i++) inst.update(1 / 30);
      if (!inst.done()) (r.status = "fail"), r.notes.push("loop does not stop");
    } else {
      inst.update(info.duration);
      if (!inst.done()) (r.status = "fail"), r.notes.push("one-shot never ends");
    }
    if (r.avgMs > 6) (r.status = r.status === "fail" ? "fail" : "warn"), r.notes.push(`slow: ${r.avgMs} ms/frame`);
  } catch (e) {
    r.status = "fail";
    r.notes.push("error: " + String(e?.message ?? e).split("\n")[0]);
  }
  return r;
}

async function runAll() {
  cancelAnimationFrame(raf);
  $("#runAll").disabled = true;
  const results = [];
  const started = performance.now();
  for (let i = 0; i < ALL_IDS.length; i++) {
    const id = ALL_IDS[i];
    $("#summary").textContent = `自检中 ${i + 1}/${ALL_IDS.length}  ${id}`;
    results.push(await test(id));
    if (i % 6 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  const count = (s) => results.filter((r) => r.status === s).length;
  report = {
    when: new Date().toISOString(), ua: navigator.userAgent, total: ALL_IDS.length, seconds: +((performance.now() - started) / 1000).toFixed(1),
    pass: count("pass"), warn: count("warn"), fail: count("fail"), results,
  };
  window.__fxlabReport = report;
  $("#summary").innerHTML = `共 ${report.total}：<span class="ok">通过 ${report.pass}</span> · <span class="warn">警告 ${report.warn}</span> · <span class="bad">失败 ${report.fail}</span>（${report.seconds}s）`;
  const rows = results.filter((r) => r.status !== "pass").concat(results.filter((r) => r.status === "pass").sort((a, b) => b.avgMs - a.avgMs).slice(0, 12));
  $("#report").innerHTML = "<tr><th>id</th><th>状态</th><th>帧</th><th>平均ms</th><th>最慢ms</th><th>备注</th></tr>" + rows.map((r) => `<tr><td>${r.id}</td><td class="${r.status === "pass" ? "ok" : r.status === "warn" ? "warn" : "bad"}">${r.status}</td><td>${r.drawnFrames ?? "-"}/${r.frames ?? "-"}</td><td>${r.avgMs ?? "-"}</td><td>${r.worstMs ?? "-"}</td><td>${r.notes.join("; ")}</td></tr>`).join("");
  $("#dl").disabled = false;
  $("#runAll").disabled = false;
  renderList($("#q").value.trim());
}

$("#q").oninput = (e) => renderList(e.target.value.trim());
$("#runAll").onclick = runAll;
$("#dl").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 1)], { type: "application/json" }));
  a.download = "fxlab-report.json";
  a.click();
};
$("#bg").onchange = () => current && preview(current);
$("#act").onchange = () => current && preview(current);
renderList();
if (location.hash === "#run") runAll();
