// Tick simulation of Old School RuneScape combat XP.
// Sand crabs pay only for hitpoints removed. The gemstone crab has infinite
// hitpoints and pays 87.5% of normal combat XP.

(() => {
const TICK_SECONDS = 0.6;
const TICKS_PER_HOUR = 6000;
const SAND_HITPOINTS = 60;
const AMMONITE_HITPOINTS = 100;
const SAND_RESPAWN_TICKS = 50;
const GEM_XP_MULTIPLIER = 7 / 8;
const AGGRESSION_TICKS = 1000;
const CRAB_DEFENCE_ROLL = 640;

const STYLE_BONUS = {
  attack: 3,
  strength: 0,
  defence: 0,
  controlled: 1,
  ranged: 3,
  longrange: 0,
  magic: 0,
  "defensive-magic": 0,
};

function styleAttackBonus(style) {
  return STYLE_BONUS[style] ?? 0;
}

function emptyXP() {
  return { attack: 0, strength: 0, defence: 0, ranged: 0, magic: 0, hitpoints: 0 };
}

function styleTotal(xp) {
  return xp.attack + xp.strength + xp.defence + xp.ranged + xp.magic;
}

function scaleXP(xp, factor) {
  return {
    attack: xp.attack * factor,
    strength: xp.strength * factor,
    defence: xp.defence * factor,
    ranged: xp.ranged * factor,
    magic: xp.magic * factor,
    hitpoints: xp.hitpoints * factor,
  };
}

function perHour(xp, ticks) {
  if (ticks <= 0) return emptyXP();
  return scaleXP(xp, TICKS_PER_HOUR / ticks);
}

// damage is hitpoints removed after the overkill cap. spellXP is awarded on
// every cast, including splashes. mult is 1 at sand crabs and 7/8 at the
// gemstone crab. Hitpoints XP is always 4/3 per damage.
function addGrant(xp, style, damage, spellXP, mult) {
  switch (style) {
    case "attack":
      xp.attack += damage * 4 * mult;
      break;
    case "strength":
      xp.strength += damage * 4 * mult;
      break;
    case "defence":
      xp.defence += damage * 4 * mult;
      break;
    case "controlled": {
      const share = (damage * 4) / 3 * mult;
      xp.attack += share;
      xp.strength += share;
      xp.defence += share;
      break;
    }
    case "ranged":
      xp.ranged += damage * 4 * mult;
      break;
    case "longrange": {
      const half = damage * 2 * mult;
      xp.ranged += half;
      xp.defence += half;
      break;
    }
    case "magic":
      xp.magic += (spellXP + damage * 2) * mult;
      break;
    case "defensive-magic":
      xp.magic += (spellXP + (damage * 4) / 3) * mult;
      xp.defence += (damage * 4) / 3 * mult;
      break;
    default:
      throw new Error(`Unknown style ${style}`);
  }
  xp.hitpoints += (damage * 4) / 3 * mult;
}

function grant(style, damage, spellXP, mult) {
  const xp = emptyXP();
  addGrant(xp, style, damage, spellXP, mult);
  return xp;
}

function crabAccuracy(level, bonus, style, prayer) {
  const styleBonus = styleAttackBonus(style);
  const effective = Math.floor(level * prayer) + styleBonus + 8;
  const attackRoll = effective * (bonus + 64);
  return {
    chance: hitChance(attackRoll, CRAB_DEFENCE_ROLL),
    effective,
    styleBonus,
    attackRoll,
    defenceRoll: CRAB_DEFENCE_ROLL,
  };
}

function hitChance(attackRoll, defenceRoll) {
  if (attackRoll <= 0) return 0;
  if (defenceRoll < 0) defenceRoll = 0;
  const a = attackRoll;
  const d = defenceRoll;
  if (attackRoll > defenceRoll) {
    return 1 - (d + 2) / (2 * (a + 1));
  }
  return a / (2 * (d + 1));
}

// Expected attacks and overkill damage to remove `hp` hitpoints.
// A landed hit is uniform on 0..maxHit. A miss deals 0. Damage above the
// hitpoints still left does not carry to the next crab.
function expectedKill(hp, maxHit, accuracy) {
  if (hp <= 0 || maxHit <= 0 || accuracy <= 0 || accuracy > 1) {
    return { attacks: 0, overkill: 0, ok: false };
  }
  const p = new Array(maxHit + 1);
  const landed = accuracy / (maxHit + 1);
  p[0] = 1 - accuracy + landed;
  for (let k = 1; k <= maxHit; k++) p[k] = landed;
  const denom = 1 - p[0];
  if (denom <= 0) return { attacks: 0, overkill: 0, ok: false };

  const expectAttacks = new Array(hp + 1).fill(0);
  const expectWaste = new Array(hp + 1).fill(0);
  for (let h = 1; h <= hp; h++) {
    let sumAttacks = 0;
    let sumWaste = 0;
    for (let k = 1; k < h && k <= maxHit; k++) {
      sumAttacks += p[k] * expectAttacks[h - k];
      sumWaste += p[k] * expectWaste[h - k];
    }
    for (let k = h; k <= maxHit; k++) {
      sumWaste += p[k] * (k - h);
    }
    expectAttacks[h] = (1 + sumAttacks) / denom;
    expectWaste[h] = sumWaste / denom;
  }
  return { attacks: expectAttacks[hp], overkill: expectWaste[hp], ok: true };
}

function resetTiming(activeTicks, downTicks, activeJitter = 0, downJitter = 0) {
  return {
    activeTicks,
    downTicks,
    activeJitter: activeJitter > 0 ? activeJitter : 0,
    downJitter: downJitter > 0 ? downJitter : 0,
  };
}

function sandTarget(crabs, resetTicks, activeTicks = AGGRESSION_TICKS, activeJitter = 0, downJitter = 0) {
  return {
    infinite: false,
    hitpoints: SAND_HITPOINTS,
    respawn: SAND_RESPAWN_TICKS,
    xpMult: 1,
    ...resetTiming(activeTicks, resetTicks, activeJitter, downJitter),
    crabs,
  };
}

function ammoniteTarget(crabs, resetTicks, activeTicks = AGGRESSION_TICKS, activeJitter = 0, downJitter = 0) {
  return {
    infinite: false,
    hitpoints: AMMONITE_HITPOINTS,
    respawn: SAND_RESPAWN_TICKS,
    xpMult: 1,
    ...resetTiming(activeTicks, resetTicks, activeJitter, downJitter),
    crabs,
  };
}

function gemTarget(moveTicks, activeTicks = AGGRESSION_TICKS, activeJitter = 0, downJitter = 0) {
  return {
    infinite: true,
    hitpoints: 0,
    respawn: 0,
    xpMult: GEM_XP_MULTIPLIER,
    ...resetTiming(activeTicks, moveTicks, activeJitter, downJitter),
    crabs: 0,
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function defaultRoll(maxHit, accuracy, rng) {
  if (accuracy <= 0) return 0;
  if (accuracy < 1 && rng() >= accuracy) return 0;
  return Math.floor(rng() * (maxHit + 1));
}

// Spread is in ticks. The result stays inside base ± spread, and never below 0.
// A base of 0 stays 0, so a skipped reset is not turned back on.
function varyTicks(base, spread, rng) {
  const start = base > 0 ? base : 0;
  const span = spread > 0 ? Math.round(spread) : 0;
  if (start === 0 || span === 0) return start;
  const delta = Math.floor(rng() * (span * 2 + 1)) - span;
  return Math.max(0, start + delta);
}

function assertFight(params, target, rng, checkTicks) {
  if (params.maxHit < 1) throw new Error("Max hit must be at least 1");
  if (params.attackSpeed < 1) throw new Error("Attack speed must be at least 1 tick");
  if (!(params.accuracy >= 0 && params.accuracy <= 1)) throw new Error("Accuracy must be from 0 to 1");
  if (checkTicks && !(params.ticks >= 1)) throw new Error("Duration must be at least 1 tick");
  if (!(params.spellXP >= 0)) throw new Error("Spell XP must be zero or positive");
  if (!target.infinite) {
    if (target.hitpoints < 1) throw new Error("Sand crab hitpoints must be at least 1");
    if (target.crabs < 1) throw new Error("Sand crab count must be at least 1");
    if (target.respawn < 1) throw new Error("Respawn must be at least 1 tick");
  }
  if (!params.roll && !rng) throw new Error("Missing random source");
}

// One running fight. step() advances a single game tick and returns what
// happened, so a live view can play both crabs on one clock.
function createFight(params, target, rng) {
  assertFight(params, target, rng, false);
  const { maxHit, attackSpeed, accuracy, style, spellXP } = params;
  const roll = params.roll || defaultRoll;
  const crabs = [];
  if (!target.infinite) {
    for (let i = 0; i < target.crabs; i++) crabs.push({ hp: target.hitpoints, respawn: 0 });
  }
  const xp = emptyXP();
  const stats = {
    attacks: 0,
    rollDamage: 0,
    dealt: 0,
    overkill: 0,
    kills: 0,
    idleTicks: 0,
    xpLost: 0,
    xpCut: 0,
  };
  let focus = 0;
  let cooldown = 0;
  let tick = 0;
  const resetsOn = target.activeTicks > 0 && target.downTicks > 0;
  let windowStart = 0;
  let windowActive = resetsOn ? varyTicks(target.activeTicks, target.activeJitter, rng) : 0;
  let windowDown = resetsOn ? varyTicks(target.downTicks, target.downJitter, rng) : 0;

  // Each reset rolls its own Every and Takes. Later calls for the same tick
  // reuse that roll, so the countdown and the fight agree.
  function advanceWindow(at) {
    if (!resetsOn) return;
    let guard = 0;
    while (at >= windowStart + windowActive + windowDown) {
      const next = windowStart + windowActive + windowDown;
      if (next <= windowStart) return;
      windowStart = next;
      windowActive = varyTicks(target.activeTicks, target.activeJitter, rng);
      windowDown = varyTicks(target.downTicks, target.downJitter, rng);
      if (++guard > at + 2) return;
    }
  }

  function downtimeLeft(nextTick) {
    advanceWindow(nextTick);
    if (windowDown <= 0 || windowActive <= 0) return 0;
    const pos = nextTick - windowStart;
    if (pos < windowActive) return 0;
    return windowActive + windowDown - pos;
  }

  function isDown(at) {
    advanceWindow(at);
    if (!resetsOn || windowDown <= 0 || windowActive <= 0) return false;
    return at >= windowStart + windowActive;
  }

  function step() {
    const t = tick++;
    const respawned = [];
    for (let i = 0; i < crabs.length; i++) {
      if (crabs[i].respawn > 0) {
        crabs[i].respawn--;
        if (crabs[i].respawn === 0) {
          crabs[i].hp = target.hitpoints;
          respawned.push(i);
        }
      }
    }
    const event = {
      tick: t,
      phase: "cooldown",
      respawned,
      crab: -1,
      roll: 0,
      dealt: 0,
      over: 0,
      died: false,
      xpStyle: 0,
      xpHp: 0,
    };
    if (isDown(t)) {
      stats.idleTicks++;
      cooldown = 0;
      event.phase = "down";
      return event;
    }
    if (cooldown > 0) {
      cooldown--;
      if (cooldown > 0) return event;
    }
    if (!target.infinite) {
      const idx = livingCrab(crabs, focus);
      if (idx < 0) {
        stats.idleTicks++;
        event.phase = "idle";
        return event;
      }
      focus = idx;
      const rollDamage = roll(maxHit, accuracy, rng);
      const hit = applyHit(crabs[idx], rollDamage, target.respawn);
      stats.attacks++;
      stats.rollDamage += rollDamage;
      stats.dealt += hit.dealt;
      stats.overkill += hit.over;
      const styleBefore = styleTotal(xp);
      const hpBefore = xp.hitpoints;
      addGrant(xp, style, hit.dealt, spellXP, target.xpMult);
      if (hit.died) {
        stats.kills++;
        focus = -1;
      }
      cooldown = attackSpeed;
      event.phase = "hit";
      event.crab = idx;
      event.roll = rollDamage;
      event.dealt = hit.dealt;
      event.over = hit.over;
      event.died = hit.died;
      event.xpStyle = styleTotal(xp) - styleBefore;
      event.xpHp = xp.hitpoints - hpBefore;
      if (hit.over > 0) stats.xpLost += styleTotal(grant(style, hit.over, 0, 1));
      return event;
    }
    const rollDamage = roll(maxHit, accuracy, rng);
    stats.attacks++;
    stats.rollDamage += rollDamage;
    stats.dealt += rollDamage;
    const styleBefore = styleTotal(xp);
    const hpBefore = xp.hitpoints;
    addGrant(xp, style, rollDamage, spellXP, target.xpMult);
    cooldown = attackSpeed;
    event.phase = "hit";
    event.roll = rollDamage;
    event.dealt = rollDamage;
    event.xpStyle = styleTotal(xp) - styleBefore;
    event.xpHp = xp.hitpoints - hpBefore;
    stats.xpCut += styleTotal(grant(style, rollDamage, spellXP, 1)) - event.xpStyle;
    return event;
  }

  function snapshot() {
    return {
      infinite: target.infinite,
      maxHp: target.hitpoints,
      tick,
      downLeft: downtimeLeft(tick),
      focus,
      cooldown,
      crabs: crabs.map((crab) => ({ hp: crab.hp, respawn: crab.respawn })),
      attacks: stats.attacks,
      dealt: stats.dealt,
      overkill: stats.overkill,
      xpLost: stats.xpLost,
      xpCut: stats.xpCut,
      kills: stats.kills,
      idleTicks: stats.idleTicks,
      xp: {
        attack: xp.attack,
        strength: xp.strength,
        defence: xp.defence,
        ranged: xp.ranged,
        magic: xp.magic,
        hitpoints: xp.hitpoints,
      },
    };
  }

  function finish() {
    return { ...stats, ticks: tick, xp };
  }

  return { step, snapshot, finish };
}

// AttackSpeed is the gap between swings. On a sand crab the hit is capped at
// the hitpoints left, then that crab waits `respawn` ticks. Another live crab
// in the spot is attacked on the next swing.
function simulate(params, target, rng) {
  if (params.maxHit < 1) throw new Error("Max hit must be at least 1");
  if (params.attackSpeed < 1) throw new Error("Attack speed must be at least 1 tick");
  if (!(params.accuracy >= 0 && params.accuracy <= 1)) throw new Error("Accuracy must be from 0 to 1");
  if (!(params.ticks >= 1)) throw new Error("Duration must be at least 1 tick");
  const fight = createFight(params, target, rng);
  for (let i = 0; i < params.ticks; i++) fight.step();
  return fight.finish();
}

function livingCrab(crabs, focus) {
  if (focus >= 0 && focus < crabs.length && crabs[focus].respawn === 0 && crabs[focus].hp > 0) {
    return focus;
  }
  for (let i = 0; i < crabs.length; i++) {
    if (crabs[i].respawn === 0 && crabs[i].hp > 0) return i;
  }
  return -1;
}

function applyHit(crab, roll, respawn) {
  if (roll < 0) roll = 0;
  if (roll >= crab.hp) {
    const dealt = crab.hp;
    const over = roll - crab.hp;
    crab.hp = 0;
    crab.respawn = respawn;
    return { dealt, over, died: true };
  }
  crab.hp -= roll;
  return { dealt: roll, over: 0, died: false };
}

function steadyXPPerHour(params, target) {
  const { maxHit, attackSpeed, accuracy, style, spellXP } = params;
  if (maxHit < 1 || attackSpeed < 1 || accuracy < 0 || accuracy > 1) return null;
  let uptime = 1;
  if (target.downTicks > 0 && target.activeTicks > 0) {
    uptime = target.activeTicks / (target.activeTicks + target.downTicks);
  }
  const attacksPerHour = (TICKS_PER_HOUR / attackSpeed) * uptime;
  if (target.infinite) {
    const mean = (accuracy * maxHit) / 2;
    return scaleXP(grant(style, mean, spellXP, target.xpMult), attacksPerHour);
  }
  const kill = expectedKill(target.hitpoints, maxHit, accuracy);
  if (!kill.ok) {
    return scaleXP(grant(style, 0, spellXP, target.xpMult), attacksPerHour);
  }
  const damagePerAttack = target.hitpoints / kill.attacks;
  return scaleXP(grant(style, damagePerAttack, spellXP, target.xpMult), attacksPerHour);
}

function crossoverMaxHit(opts) {
  const params = {
    attackSpeed: opts.attackSpeed,
    accuracy: opts.accuracy,
    style: opts.style,
    spellXP: opts.spellXP,
  };
  for (let hit = 1; hit <= 300; hit++) {
    params.maxHit = hit;
    const gem = steadyXPPerHour(params, gemTarget(opts.gemMoveTicks));
    const sand = steadyXPPerHour(params, sandTarget(opts.crabs, opts.sandResetTicks));
    if (!gem || !sand) continue;
    if (styleTotal(gem) > styleTotal(sand)) return hit;
  }
  return 0;
}

function sweepHits(maxHit) {
  const base = [1, 5, 10, 15, 20, 25, 30, 40, 50, 60, 80];
  const out = [];
  let found = false;
  for (const hit of base) {
    if (!found && maxHit < hit) {
      out.push(maxHit);
      found = true;
    }
    if (hit === maxHit) found = true;
    out.push(hit);
  }
  if (!found) out.push(maxHit);
  return out;
}

function ahead(gem, sand) {
  const den = Math.max(gem, sand);
  if (den === 0 || Math.abs(gem - sand) / den < 0.005) return "close";
  return gem > sand ? "gemstone" : "sand";
}

// Headline rates plus a max-hit sweep. The row for opts.maxHit reuses the
// headline simulation so the table matches the cards.
function compare(opts) {
  const params = {
    maxHit: opts.maxHit,
    attackSpeed: opts.attackSpeed,
    accuracy: opts.accuracy,
    style: opts.style,
    spellXP: opts.spellXP,
    ticks: opts.ticks,
  };
  const gem = simulate(params, gemTarget(opts.gemMoveTicks), mulberry32(opts.seed));
  const sand = simulate(params, sandTarget(opts.crabs, opts.sandResetTicks), mulberry32(opts.seed + 1));
  const kill = expectedKill(SAND_HITPOINTS, opts.maxHit, opts.accuracy);
  const hits = sweepHits(opts.maxHit);
  const sweep = hits.map((hit) => {
    let gemRes = gem;
    let sandRes = sand;
    if (hit !== opts.maxHit) {
      const rowParams = { ...params, maxHit: hit };
      gemRes = simulate(rowParams, gemTarget(opts.gemMoveTicks), mulberry32(opts.seed + hit * 2 + 1));
      sandRes = simulate(
        rowParams,
        sandTarget(opts.crabs, opts.sandResetTicks),
        mulberry32(opts.seed + hit * 2 + 2),
      );
    }
    const rowKill = expectedKill(SAND_HITPOINTS, hit, opts.accuracy);
    const gemRate = styleTotal(perHour(gemRes.xp, opts.ticks));
    const sandRate = styleTotal(perHour(sandRes.xp, opts.ticks));
    const overkillFraction = rowKill.ok ? rowKill.overkill / (SAND_HITPOINTS + rowKill.overkill) : null;
    return {
      hit,
      gemRate,
      sandRate,
      overkillFraction,
      leader: ahead(gemRate, sandRate),
      current: hit === opts.maxHit,
    };
  });
  return {
    gem,
    sand,
    kill,
    sweep,
    cross: crossoverMaxHit(opts),
    ticks: opts.ticks,
  };
}

// One trial is the three spots on one clock, each with its own hit rolls.
// Trial i uses seeds (seed + i*3), +1, and +2 so the spots stay independent.
function monteCarloTrial(opts, index) {
  const ticks = opts.ticks;
  const params = {
    maxHit: opts.maxHit,
    attackSpeed: opts.attackSpeed,
    accuracy: opts.accuracy,
    style: opts.style,
    spellXP: opts.spellXP,
    ticks,
  };
  const seed = ((opts.seed >>> 0) + index * 3) >>> 0;
  const gem = simulate(
    params,
    gemTarget(opts.gemMoveTicks, opts.gemActiveTicks, opts.gemActiveJitter, opts.gemDownJitter),
    mulberry32(seed),
  );
  const sand = simulate(
    params,
    sandTarget(opts.crabs, opts.sandResetTicks, opts.sandActiveTicks, opts.sandActiveJitter, opts.sandDownJitter),
    mulberry32(seed + 1),
  );
  const ammo = simulate(
    params,
    ammoniteTarget(opts.ammoCrabs, opts.ammoResetTicks, opts.ammoActiveTicks, opts.ammoActiveJitter, opts.ammoDownJitter),
    mulberry32(seed + 2),
  );
  return {
    gem: styleTotal(perHour(gem.xp, ticks)),
    sand: styleTotal(perHour(sand.xp, ticks)),
    ammo: styleTotal(perHour(ammo.xp, ticks)),
  };
}

function quantile(sorted, p) {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function summarizeSeries(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const n = sorted.length;
  let sum = 0;
  for (const value of sorted) sum += value;
  const mean = n ? sum / n : 0;
  let sq = 0;
  for (const value of sorted) {
    const delta = value - mean;
    sq += delta * delta;
  }
  return {
    n,
    mean,
    stdev: n > 1 ? Math.sqrt(sq / (n - 1)) : 0,
    min: n ? sorted[0] : 0,
    max: n ? sorted[n - 1] : 0,
    p05: quantile(sorted, 0.05),
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
  };
}

function ratesAreClose(value, best) {
  if (best === 0) return true;
  return (best - value) / best < 0.005;
}

function expectedStyleRates(opts) {
  const params = {
    maxHit: opts.maxHit,
    attackSpeed: opts.attackSpeed,
    accuracy: opts.accuracy,
    style: opts.style,
    spellXP: opts.spellXP,
  };
  const targets = {
    gem: gemTarget(opts.gemMoveTicks, opts.gemActiveTicks),
    sand: sandTarget(opts.crabs, opts.sandResetTicks, opts.sandActiveTicks),
    ammo: ammoniteTarget(opts.ammoCrabs, opts.ammoResetTicks, opts.ammoActiveTicks),
  };
  const rates = {};
  for (const key of ["gem", "sand", "ammo"]) {
    const xp = steadyXPPerHour(params, targets[key]);
    rates[key] = xp ? styleTotal(xp) : 0;
  }
  return rates;
}

function summarizeTrials(rows, opts) {
  const samples = { gem: [], sand: [], ammo: [] };
  const leaders = { gem: 0, sand: 0, ammo: 0, tie: 0 };
  for (const row of rows) {
    samples.gem.push(row.gem);
    samples.sand.push(row.sand);
    samples.ammo.push(row.ammo);
    const best = Math.max(row.gem, row.sand, row.ammo);
    const names = ["gem", "sand", "ammo"].filter((key) => ratesAreClose(row[key], best));
    if (names.length === 1) leaders[names[0]]++;
    else leaders.tie++;
  }
  return {
    trials: rows.length,
    gem: summarizeSeries(samples.gem),
    sand: summarizeSeries(samples.sand),
    ammo: summarizeSeries(samples.ammo),
    leaders,
    samples,
    expected: opts ? expectedStyleRates(opts) : null,
  };
}

function monteCarlo(opts) {
  if (!Number.isInteger(opts.trials) || opts.trials < 1) throw new Error("Trials must be at least 1");
  if (!Number.isInteger(opts.ticks) || opts.ticks < 1) throw new Error("Duration must be at least 1 tick");
  const rows = [];
  for (let i = 0; i < opts.trials; i++) rows.push(monteCarloTrial(opts, i));
  return { ticks: opts.ticks, ...summarizeTrials(rows, opts) };
}

globalThis.CrabSim = {
  TICK_SECONDS,
  GEM_XP_MULTIPLIER,
  compare,
  createFight,
  crabAccuracy,
  expectedKill,
  ammoniteTarget,
  gemTarget,
  grant,
  monteCarlo,
  monteCarloTrial,
  mulberry32,
  perHour,
  sandTarget,
  simulate,
  styleTotal,
  summarizeTrials,
};
})();
