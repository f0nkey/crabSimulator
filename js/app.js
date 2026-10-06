(() => {
const {
  TICK_SECONDS,
  ammoniteTarget,
  crabAccuracy,
  createFight,
  gemTarget,
  mulberry32,
  sandTarget,
  styleTotal,
} = globalThis.CrabSim;

const STYLE_NAME = {
  attack: "Attack",
  strength: "Strength",
  defence: "Defence",
  controlled: "Melee",
  ranged: "Ranged",
  longrange: "Ranged + Defence",
  magic: "Magic",
  "defensive-magic": "Magic + Defence",
};

const LEVEL_WORD = {
  ranged: "Ranged",
  longrange: "Ranged",
  magic: "Magic",
  "defensive-magic": "Magic",
};

const $ = (id) => document.getElementById(id);

const CHART_COLOR = { gem: "#3ecfb4", sand: "#e2b15a", ammo: "#8ecae6" };
const SVG_NS = "http://www.w3.org/2000/svg";

let gemFight = null;
let sandFight = null;
let ammoFight = null;
let opts = null;
let samples = [];
let paused = false;
let speed = 10;
let acc = 0;
let last = 0;
let liveAt = 0;
let actorStyle = "";
let formTimer = 0;

function crabSVG(kind) {
  const palettes = {
    gem: ["#14786c", "#0e4f48", "#7af0dc"],
    sand: ["#e2b15a", "#c9843a", "#f3d7a1"],
    ammo: ["#7f97a6", "#4e6570", "#d5e6ee"],
  };
  const tone = palettes[kind] || palettes.sand;
  const body = tone[0];
  const claw = tone[1];
  const shine = tone[2];
  const mark = kind === "gem"
    ? `<polygon points="44,16 54,30 44,44 34,30" fill="#3ecfb4" stroke="#9af0e0" stroke-width="1.2"/>`
    : kind === "ammo"
      ? `<path d="M44 31c7 1 11 7 9 13-2 6-9 8-14 5-5-3-6-10-2-13 3-3 7-2 8 1" fill="none" stroke="${shine}" stroke-width="2.1" stroke-linecap="round"/>`
      : "";
  return `<svg viewBox="0 0 88 72" aria-hidden="true">
    <ellipse cx="44" cy="66" rx="24" ry="4" fill="rgba(0,0,0,.35)"/>
    <path d="M18 40 L6 30 M16 46 L4 48 M20 52 L8 62" stroke="${claw}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M70 40 L82 30 M72 46 L84 48 M68 52 L80 62" stroke="${claw}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="18" cy="36" rx="11" ry="8" fill="${claw}"/>
    <ellipse cx="70" cy="36" rx="11" ry="8" fill="${claw}"/>
    <ellipse cx="44" cy="44" rx="24" ry="16" fill="${body}"/>
    <ellipse cx="44" cy="40" rx="14" ry="8" fill="${shine}" opacity="0.35"/>
    ${mark}
    <circle cx="36" cy="42" r="2.2" fill="#1a1612"/>
    <circle cx="52" cy="42" r="2.2" fill="#1a1612"/>
    <circle cx="36.7" cy="41.3" r="0.7" fill="#fff"/>
    <circle cx="52.7" cy="41.3" r="0.7" fill="#fff"/>
  </svg>`;
}

function actorSVG(kind) {
  let weapon = "";
  if (kind === "bow") {
    weapon = `<path d="M48 16 Q64 32 48 50" stroke="#e6d3b0" stroke-width="3" fill="none"/>
      <path d="M50 18 L66 34" stroke="#f4f1ea" stroke-width="1.6"/>`;
  } else if (kind === "staff") {
    weapon = `<rect x="52" y="8" width="4" height="50" rx="2" fill="#6b4a2e"/>
      <circle cx="54" cy="10" r="6" fill="#3ecfb4"/>`;
  } else {
    weapon = `<path d="M44 30 L70 12" stroke="#d5dde4" stroke-width="4" stroke-linecap="round"/>
      <path d="M44 32 L38 38" stroke="#8a6a3b" stroke-width="4" stroke-linecap="round"/>`;
  }
  return `<svg viewBox="0 0 78 84" aria-hidden="true">
    <ellipse cx="30" cy="78" rx="16" ry="4" fill="rgba(0,0,0,.35)"/>
    ${weapon}
    <circle cx="28" cy="16" r="8" fill="#e6c2a0"/>
    <path d="M16 13 h24 l-2 10 H18 z" fill="#6e8c6a"/>
    <rect x="18" y="26" width="18" height="24" rx="5" fill="#3d5c4a"/>
    <rect x="16" y="48" width="8" height="18" rx="3" fill="#241c16"/>
    <rect x="30" y="48" width="8" height="18" rx="3" fill="#241c16"/>
    <circle cx="31" cy="15" r="1.2" fill="#1a1612"/>
  </svg>`;
}

function weaponKind(style) {
  if (style === "ranged" || style === "longrange") return "bow";
  if (style === "magic" || style === "defensive-magic") return "staff";
  return "sword";
}

function paintActors(style) {
  const html = actorSVG(weaponKind(style));
  $("gem-fighter").innerHTML = html;
  $("sand-fighter").innerHTML = html;
  $("ammo-fighter").innerHTML = html;
  actorStyle = style;
}

function makeMob(kind) {
  const el = document.createElement("div");
  el.className = "mob";
  el.innerHTML = `<div class="hp" aria-hidden="true"><span></span></div><div class="sprite">${crabSVG(kind)}</div><p class="timer"></p>`;
  return el;
}

function ensureMobs(rowId, count, kind) {
  const row = $(rowId);
  row.classList.toggle("crowded", count > 5);
  if (row.childElementCount === count && row.dataset.kind === kind) return;
  row.dataset.kind = kind;
  row.replaceChildren();
  for (let i = 0; i < count; i++) row.append(makeMob(kind));
}

function fightKey(value) {
  return JSON.stringify({
    maxHit: value.maxHit,
    attackSpeed: value.attackSpeed,
    accuracy: value.accuracy,
    style: value.style,
    spellXP: value.spellXP,
    crabs: value.crabs,
    ammoCrabs: value.ammoCrabs,
    sandResetTicks: value.sandResetTicks,
    ammoResetTicks: value.ammoResetTicks,
    gemMoveTicks: value.gemMoveTicks,
    sandActiveTicks: value.sandActiveTicks,
    ammoActiveTicks: value.ammoActiveTicks,
    gemActiveTicks: value.gemActiveTicks,
  });
}

function blankFrame() {
  return { gem: [], sand: [], ammo: [] };
}

function startFights(next) {
  const params = {
    maxHit: next.maxHit,
    attackSpeed: next.attackSpeed,
    accuracy: next.accuracy,
    style: next.style,
    spellXP: next.spellXP,
  };
  gemFight = createFight(params, gemTarget(next.gemMoveTicks, next.gemActiveTicks), mulberry32(1));
  sandFight = createFight(params, sandTarget(next.crabs, next.sandResetTicks, next.sandActiveTicks), mulberry32(2));
  ammoFight = createFight(params, ammoniteTarget(next.ammoCrabs, next.ammoResetTicks, next.ammoActiveTicks), mulberry32(3));
  opts = next;
  $("gem-floats").replaceChildren();
  $("sand-floats").replaceChildren();
  $("ammo-floats").replaceChildren();
  ensureMobs("sand-row", next.crabs, "sand");
  ensureMobs("ammo-row", next.ammoCrabs, "ammo");
  samples = [];
  if (actorStyle !== next.style) paintActors(next.style);
  acc = 0;
}

function init() {
  $("gem-boss").innerHTML = `<div class="sprite">${crabSVG("gem")}</div><p class="plaque">Does not die</p>`;
  const form = $("controls");
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", schedule);
  form.addEventListener("change", schedule);
  $("maxhitRange").addEventListener("input", () => {
    $("maxhit").value = $("maxhitRange").value;
  });
  $("maxhit").addEventListener("input", () => {
    const n = Number($("maxhit").value);
    if (n >= 1 && n <= 80) $("maxhitRange").value = String(n);
  });
  $("prayerPreset").addEventListener("change", () => {
    if ($("prayerPreset").value !== "custom") $("prayer").value = $("prayerPreset").value;
  });
  $("prayer").addEventListener("input", () => {
    const known = ["1", "1.15", "1.2", "1.25"];
    $("prayerPreset").value = known.includes($("prayer").value) ? $("prayer").value : "custom";
  });
  $("play").addEventListener("click", () => setPaused(!paused));
  $("step").addEventListener("click", stepOnce);
  $("restart").addEventListener("click", () => {
    if (!opts) return;
    startFights(opts);
    render(blankFrame());
  });
  $("simSpeed").addEventListener("input", () => setSpeed(Number($("simSpeed").value)));
  document.querySelector(".chips").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    setSpeed(Number(button.dataset.speed));
  });
  document.addEventListener("keydown", (event) => {
    if (event.code !== "Space") return;
    if (event.target.closest("input, select, textarea")) return;
    event.preventDefault();
    setPaused(!paused);
  });
  setSpeed(10);
  setPaused(false);
  applyForm();
  requestAnimationFrame(loop);
}

function schedule() {
  clearTimeout(formTimer);
  formTimer = setTimeout(applyForm, 80);
}

function setPaused(next) {
  paused = next;
  $("play").textContent = paused ? "Play" : "Pause";
  $("play").classList.toggle("resume", paused);
  document.body.classList.toggle("is-paused", paused);
  last = 0;
}

function setSpeed(value) {
  speed = clamp(Math.round(value), 1, 500);
  $("simSpeed").value = String(speed);
  $("speedReadout").textContent = `${speed}×`;
  $("speedNote").textContent = speedNote(speed);
  for (const button of document.querySelectorAll(".chips button")) {
    button.setAttribute("aria-pressed", String(Number(button.dataset.speed) === speed));
  }
  acc = 0;
}

function stepOnce() {
  if (!gemFight || !sandFight || !ammoFight) return;
  setPaused(true);
  render({
    gem: [gemFight.step()],
    sand: [sandFight.step()],
    ammo: [ammoFight.step()],
  });
}

function applyForm() {
  const parsed = readForm();
  reveal();
  if (!parsed.ok) {
    $("trouble").hidden = false;
    $("trouble").textContent = parsed.error;
    return;
  }
  $("trouble").hidden = true;
  $("accuracyNote").textContent = parsed.accuracyNote;
  if (opts && fightKey(opts) === fightKey(parsed.opts)) {
    opts = parsed.opts;
    render(blankFrame());
    return;
  }
  try {
    startFights(parsed.opts);
    render(blankFrame());
  } catch (err) {
    $("trouble").hidden = false;
    $("trouble").textContent = err.message;
  }
}

function loop(now) {
  if (!last) last = now;
  let frame = null;
  if (!paused && gemFight && sandFight && ammoFight) {
    acc += Math.min(250, now - last);
    const tickMs = (TICK_SECONDS * 1000) / speed;
    const gem = [];
    const sand = [];
    const ammo = [];
    let n = 0;
    while (acc >= tickMs && n < 80) {
      acc -= tickMs;
      gem.push(gemFight.step());
      sand.push(sandFight.step());
      ammo.push(ammoFight.step());
      n++;
    }
    if (n === 80) acc = 0;
    if (n > 0) frame = { gem, sand, ammo };
  }
  last = now;
  if (frame) render(frame);
  if (gemFight && now - liveAt > 1000) {
    liveAt = now;
    $("live").textContent = `${$("clock").textContent}. ${$("lead").textContent}`;
  }
  requestAnimationFrame(loop);
}

function render(frame) {
  if (!gemFight || !sandFight || !ammoFight || !opts) return;
  const gem = gemFight.snapshot();
  const sand = sandFight.snapshot();
  const ammo = ammoFight.snapshot();
  const name = STYLE_NAME[opts.style] || "XP";
  const gemRaw = styleTotal(gem.xp);
  const sandRaw = styleTotal(sand.xp);
  const ammoRaw = styleTotal(ammo.xp);
  const gemXP = Math.round(gemRaw);
  const sandXP = Math.round(sandRaw);
  const ammoXP = Math.round(ammoRaw);
  $("clock").textContent = formatClock(gem.tick);
  $("gem-xp").textContent = formatInt(gemXP);
  $("sand-xp").textContent = formatInt(sandXP);
  $("ammo-xp").textContent = formatInt(ammoXP);
  $("gem-hitpoints").textContent = formatInt(gem.xp.hitpoints);
  $("sand-hitpoints").textContent = formatInt(sand.xp.hitpoints);
  $("ammo-hitpoints").textContent = formatInt(ammo.xp.hitpoints);
  $("gem-rate").textContent = formatInt(rateOf(gemXP, gem.tick));
  $("sand-rate").textContent = formatInt(rateOf(sandXP, sand.tick));
  $("ammo-rate").textContent = formatInt(rateOf(ammoXP, ammo.tick));
  $("gem-dealt").textContent = formatInt(gem.dealt);
  $("gem-attacks").textContent = formatInt(gem.attacks);
  $("gem-idle").textContent = idleText(gem);
  $("sand-dealt").textContent = formatInt(sand.dealt);
  $("gem-cut").textContent = `XP reduced: ${formatPenalty(gem.xpCut)} XP`;
  $("sand-lost").textContent = `Overhit XP lost: ${formatPenalty(sand.xpLost)} XP`;
  $("ammo-lost").textContent = `Overhit XP lost: ${formatPenalty(ammo.xpLost)} XP`;
  $("sand-over").textContent = formatInt(sand.overkill);
  $("sand-kills").textContent = formatInt(sand.kills);
  $("sand-idle").textContent = idleText(sand);
  $("ammo-dealt").textContent = formatInt(ammo.dealt);
  $("ammo-over").textContent = formatInt(ammo.overkill);
  $("ammo-kills").textContent = formatInt(ammo.kills);
  $("ammo-idle").textContent = idleText(ammo);
  paintLead(
    [
      { arena: "arena-gem", bar: "race-gem", label: "Gemstone crab", singular: true, xp: gemXP },
      { arena: "arena-sand", bar: "race-sand", label: "Sand crabs", singular: false, xp: sandXP },
      { arena: "arena-ammo", bar: "race-ammo", label: "Ammonite crabs", singular: false, xp: ammoXP },
    ],
    name,
    gem.tick,
  );
  paintGoal($("gem-goal"), gemXP, gem.tick);
  paintGoal($("sand-goal"), sandXP, sand.tick);
  paintGoal($("ammo-goal"), ammoXP, ammo.tick);
  paintBanner($("gem-banner"), gem, "Following the burrow");
  paintBanner($("sand-banner"), sand, "Walking off to reset them");
  paintBanner($("ammo-banner"), ammo, "Walking off to reset them");
  paintMobs("sand-row", sand, frame.sand);
  paintMobs("ammo-row", ammo, frame.ammo);
  remember(gem.tick, gemRaw, sandRaw, ammoRaw);
  paintGraph(gem.tick, gemRaw, sandRaw, ammoRaw);
  const gemHit = frame.gem.some((event) => event.phase === "hit");
  const sandHit = frame.sand.some((event) => event.phase === "hit");
  const ammoHit = frame.ammo.some((event) => event.phase === "hit");
  pulse($("gem-fighter"), "swing", gemHit);
  pulse($("sand-fighter"), "swing", sandHit);
  pulse($("ammo-fighter"), "swing", ammoHit);
  pulse($("gem-boss"), "hit", gemHit);
  const gemHits = frame.gem.filter((event) => event.phase === "hit");
  if (gemHits.length) {
    $("gem-floats").replaceChildren();
    splash($("gem-floats"), gemHits[gemHits.length - 1], 70, 36);
  }
  const sandHits = frame.sand.filter((event) => event.phase === "hit" && event.crab >= 0);
  if (sandHits.length) {
    $("sand-floats").replaceChildren();
    const event = sandHits[sandHits.length - 1];
    const spot = crabAnchor(event.crab, sand.crabs.length);
    splash($("sand-floats"), event, spot.x, spot.y);
  }
  const ammoHits = frame.ammo.filter((event) => event.phase === "hit" && event.crab >= 0);
  if (ammoHits.length) {
    $("ammo-floats").replaceChildren();
    const event = ammoHits[ammoHits.length - 1];
    const spot = crabAnchor(event.crab, ammo.crabs.length);
    splash($("ammo-floats"), event, spot.x, spot.y);
  }
}

function paintLead(rows, name, ticks) {
  for (const row of rows) $(row.arena).classList.remove("ahead");
  const top = Math.max(...rows.map((row) => row.xp), 1);
  for (const row of rows) $(row.bar).style.width = `${(row.xp / top) * 100}%`;
  if (ticks <= 0) {
    $("lead").textContent = "All three fights are on the same clock.";
    return;
  }
  const best = Math.max(...rows.map((row) => row.xp));
  const tied = rows.filter((row) => best === 0 || (best - row.xp) / best < 0.005);
  if (tied.length === rows.length) {
    $("lead").textContent = `${name} XP is even right now.`;
    return;
  }
  for (const row of tied) $(row.arena).classList.add("ahead");
  const next = Math.max(...rows.filter((row) => !tied.includes(row)).map((row) => row.xp));
  const gap = formatInt(best - next);
  if (tied.length === 1) {
    const row = tied[0];
    $("lead").textContent = `${row.label} ${row.singular ? "is" : "are"} ahead by ${gap} ${name} XP.`;
    return;
  }
  $("lead").textContent = `${joinLabels(tied)} are ahead by ${gap} ${name} XP.`;
}

function joinLabels(rows) {
  const labels = rows.map((row) => row.label);
  if (labels.length < 2) return labels[0] || "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function remember(tick, gem, sand, ammo) {
  const point = { tick, gem, sand, ammo };
  if (samples.length === 0) {
    samples.push(point);
    return;
  }
  const prev = samples[samples.length - 1];
  if (tick <= prev.tick) {
    samples[samples.length - 1] = point;
    return;
  }
  const stride = Math.max(1, Math.floor(tick / 240));
  if (tick - prev.tick >= stride) samples.push(point);
  if (samples.length > 480) {
    const kept = [];
    for (let i = 0; i < samples.length; i += 2) kept.push(samples[i]);
    const last = samples[samples.length - 1];
    if (kept[kept.length - 1] !== last) kept.push(last);
    samples = kept;
  }
}

function paintGraph(tick, gem, sand, ammo) {
  const svg = $("chart");
  const tip = { tick, gem, sand, ammo };
  const series = samples.length && samples[samples.length - 1].tick === tick
    ? samples.slice()
    : samples.concat(tip);
  const width = 720;
  const height = 180;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 16;
  const maxX = Math.max(tick, 1);
  const maxY = Math.max(gem, sand, ammo, 1);
  const xOf = (t) => padL + (t / maxX) * (width - padL - padR);
  const yOf = (v) => padT + (1 - v / maxY) * (height - padT - padB);
  svg.replaceChildren();
  svg.append(chartLine(padL, yOf(0), width - padR, yOf(0), "rgba(244,241,234,.2)", "1"));
  svg.append(chartLine(padL, yOf(maxY / 2), width - padR, yOf(maxY / 2), "rgba(244,241,234,.1)", "1"));
  for (const key of ["gem", "sand", "ammo"]) {
    const poly = document.createElementNS(SVG_NS, "polyline");
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", CHART_COLOR[key]);
    poly.setAttribute("stroke-width", "2.5");
    poly.setAttribute("stroke-linejoin", "round");
    poly.setAttribute("stroke-linecap", "round");
    poly.setAttribute("points", series.map((point) => `${xOf(point.tick).toFixed(1)},${yOf(point[key]).toFixed(1)}`).join(" "));
    svg.append(poly);
    const end = series[series.length - 1];
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", xOf(end.tick).toFixed(1));
    dot.setAttribute("cy", yOf(end[key]).toFixed(1));
    dot.setAttribute("r", "3.5");
    dot.setAttribute("fill", CHART_COLOR[key]);
    svg.append(dot);
  }
  svg.setAttribute(
    "aria-label",
    `Style XP at ${formatClock(tick)}: gemstone ${formatInt(gem)}, sand ${formatInt(sand)}, ammonite ${formatInt(ammo)}`,
  );
}

function chartLine(x1, y1, x2, y2, stroke, width) {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("stroke", stroke);
  line.setAttribute("stroke-width", width);
  return line;
}

function paintGoal(el, xp, ticks) {
  if (!opts.goal) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const left = Math.max(0, opts.goal - xp);
  if (left === 0) {
    el.textContent = `Goal ${formatInt(opts.goal)} reached.`;
    return;
  }
  if (ticks <= 0 || xp <= 0) {
    el.textContent = `Goal ${formatInt(opts.goal)}.`;
    return;
  }
  el.textContent = `Goal in ${formatClock(left / (xp / ticks))}.`;
}

function paintBanner(el, snap, awayLabel) {
  if (snap.downLeft > 0) {
    el.hidden = false;
    el.textContent = `${awayLabel} · ${formatSeconds(snap.downLeft * TICK_SECONDS)}`;
    return;
  }
  const waiting = !snap.infinite && snap.crabs.length > 0 && snap.crabs.every((crab) => crab.hp <= 0);
  if (waiting) {
    el.hidden = false;
    el.textContent = "Waiting for a crab to dig out";
    return;
  }
  el.hidden = true;
}

function paintMobs(rowId, snap, events) {
  const hits = new Set();
  const kos = new Set();
  const overs = new Set();
  const rises = new Set();
  for (const event of events) {
    for (const index of event.respawned) rises.add(index);
    if (event.phase !== "hit" || event.crab < 0) continue;
    hits.add(event.crab);
    if (event.died) kos.add(event.crab);
    if (event.over > 0) overs.add(event.crab);
  }
  const mobs = $(rowId).children;
  for (let i = 0; i < snap.crabs.length; i++) {
    const mob = mobs[i];
    if (!mob) continue;
    const crab = snap.crabs[i];
    const dead = crab.hp <= 0;
    mob.classList.toggle("dead", dead);
    mob.classList.toggle("target", snap.focus === i && !dead);
    pulse(mob, "hit", hits.has(i));
    pulse(mob, "ko", kos.has(i));
    pulse(mob, "rise", rises.has(i));
    const bar = mob.querySelector(".hp span");
    const track = mob.querySelector(".hp");
    bar.style.width = dead ? "0%" : `${(crab.hp / snap.maxHp) * 100}%`;
    track.classList.toggle("over", overs.has(i));
    mob.querySelector(".timer").textContent = dead ? formatSeconds(crab.respawn * TICK_SECONDS) : "";
  }
}

function splash(layer, event, x, y) {
  const bits = [];
  if (event.dealt > 0) bits.push([String(event.dealt), "hit"]);
  if (event.over > 0) bits.push([`${event.over} wasted`, "over"]);
  if (event.dealt === 0 && event.over === 0) bits.push(["miss", "miss"]);
  if (event.xpStyle > 0) bits.push([`+${formatGain(event.xpStyle)}`, "xp"]);
  bits.forEach((bit, index) => spawn(layer, bit[0], bit[1], x, y - index * 7));
}

function spawn(layer, text, kind, x, y) {
  const el = document.createElement("span");
  el.className = `floater ${kind}`;
  el.textContent = text;
  el.style.left = `${x}%`;
  el.style.top = `${y}%`;
  layer.append(el);
  while (layer.childElementCount > 10) layer.firstElementChild.remove();
  setTimeout(() => el.remove(), 900);
}

function crabAnchor(index, count) {
  const cols = Math.min(5, Math.max(1, count));
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: 36 + ((col + 0.5) / cols) * 56,
    y: 68 + row * 12,
  };
}

function pulse(el, name, on) {
  el.classList.remove(name);
  if (!on) return;
  void el.offsetWidth;
  el.classList.add(name);
}

function reveal() {
  const mode = document.querySelector('input[name="accMode"]:checked').value;
  const style = $("style").value;
  $("accuracyCustom").hidden = mode !== "custom";
  const levels = mode === "levels";
  $("levelField").hidden = !levels;
  $("bonusField").hidden = !levels;
  $("prayerField").hidden = !levels;
  $("prayerNumberField").hidden = !levels;
  $("spellField").hidden = style !== "magic" && style !== "defensive-magic";
  $("levelLabel").textContent = `${LEVEL_WORD[style] || "Attack"} level`;
}

function readForm() {
  const maxHit = readNum("maxhit", 1, 200);
  const attackSpeed = readNum("weapon", 1, 10);
  const crabs = readNum("crabs", 1, 10);
  const ammoCrabs = readNum("ammoCrabs", 1, 10);
  const sandReset = readNum("sandReset", 0, 120);
  const ammoReset = readNum("ammoReset", 0, 120);
  const gemMove = readNum("gemMove", 0, 120);
  const sandEvery = readNum("sandEvery", 0, 120);
  const ammoEvery = readNum("ammoEvery", 0, 120);
  const gemEvery = readNum("gemEvery", 0, 120);
  const goal = readNum("goal", 0, 200_000_000);
  const spellXP = readNum("spellxp", 0, 500);
  const style = $("style").value;
  if (!STYLE_NAME[style]) return { ok: false, error: "Choose a combat style." };
  if (![maxHit, attackSpeed, crabs, ammoCrabs, sandReset, ammoReset, gemMove, sandEvery, ammoEvery, gemEvery, goal, spellXP].every((item) => item.ok)) {
    return { ok: false, error: "Enter numbers inside the allowed ranges." };
  }
  const mode = document.querySelector('input[name="accMode"]:checked').value;
  let accuracy = 1;
  let accuracyNote = "Accuracy 100%. All three crabs have defence roll 640.";
  if (mode === "custom") {
    const chance = readNum("accuracy", 0, 100);
    if (!chance.ok) return { ok: false, error: "Enter a hit chance from 0 to 100." };
    accuracy = chance.value / 100;
    accuracyNote = `Accuracy ${formatTenths(accuracy * 100)}%. All three crabs have defence roll 640.`;
  } else if (mode === "levels") {
    const level = readNum("level", 1, 125);
    const bonus = readNum("bonus", -63, 400);
    const prayer = readNum("prayer", 1, 2);
    if (!level.ok || !bonus.ok || !prayer.ok) {
      return { ok: false, error: "Enter a level, gear bonus, and prayer multiplier." };
    }
    const breakdown = crabAccuracy(level.value, bonus.value, style, prayer.value);
    accuracy = breakdown.chance;
    accuracyNote =
      `Accuracy ${formatTenths(breakdown.chance * 100)}% from level ${level.value}, ` +
      `gear bonus ${bonus.value}, style bonus ${signed(breakdown.styleBonus)}, prayer x${prayer.value.toFixed(2)}.`;
  }
  return {
    ok: true,
    accuracyNote,
    opts: {
      maxHit: maxHit.value,
      attackSpeed: attackSpeed.value,
      accuracy,
      style,
      spellXP: spellXP.value,
      crabs: crabs.value,
      ammoCrabs: ammoCrabs.value,
      sandResetTicks: secondsToTicks(sandReset.value),
      ammoResetTicks: secondsToTicks(ammoReset.value),
      gemMoveTicks: secondsToTicks(gemMove.value),
      sandActiveTicks: secondsToTicks(sandEvery.value * 60),
      ammoActiveTicks: secondsToTicks(ammoEvery.value * 60),
      gemActiveTicks: secondsToTicks(gemEvery.value * 60),
      goal: goal.value,
    },
  };
}

function secondsToTicks(seconds) {
  if (seconds <= 0) return 0;
  return Math.round(seconds / TICK_SECONDS);
}

function rateOf(xp, ticks) {
  if (ticks <= 0) return 0;
  return xp / ((ticks * TICK_SECONDS) / 3600);
}

function idleText(snap) {
  if (snap.tick <= 0) return "0%";
  return `${Math.round((snap.idleTicks / snap.tick) * 1000) / 10}%`;
}

function speedNote(mult) {
  if (mult === 1) return "1× real time. One game tick is 0.6 seconds. Space pauses.";
  const seconds = 3600 / mult;
  if (seconds >= 90) {
    const minutes = seconds / 60;
    const label = minutes >= 10 ? String(Math.round(minutes)) : String(Math.round(minutes * 10) / 10);
    return `${mult}×. One game hour takes ${label} min. Space pauses.`;
  }
  const label = seconds >= 10 ? String(Math.round(seconds)) : String(Math.round(seconds * 10) / 10);
  return `${mult}×. One game hour takes ${label} sec. Space pauses.`;
}

function formatClock(ticks) {
  const total = Math.max(0, Math.floor(ticks * TICK_SECONDS));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h >= 100) return `${h}h`;
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${m}:${ss}`;
}

function formatSeconds(seconds) {
  if (seconds >= 10) return `${Math.round(seconds)}s`;
  return `${Math.round(seconds * 10) / 10}s`;
}

function formatPenalty(value) {
  const tenths = Math.round(value * 10) / 10;
  if (Math.abs(tenths - Math.round(tenths)) < 0.05) return formatInt(tenths);
  const sign = tenths < 0 ? "-" : "";
  const abs = Math.abs(tenths);
  const whole = Math.floor(abs);
  const frac = Math.round((abs - whole) * 10);
  return `${sign}${formatInt(whole)}.${frac}`;
}

function formatGain(value) {
  if (Math.abs(value - Math.round(value)) < 0.05) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
}

function formatInt(value) {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatTenths(value) {
  return String(Math.round(value * 10) / 10);
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readNum(id, min, max) {
  const raw = $(id).value.trim();
  if (raw === "") return { ok: false };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) return { ok: false };
  return { ok: true, value };
}

init();
})();
