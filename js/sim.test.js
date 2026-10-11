import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(new URL("./sim.js", import.meta.url), "utf8"), sandbox);
const {
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
  sandTarget,
  simulate,
  styleTotal,
  summarizeTrials,
} = sandbox.CrabSim;

test("grant matches the wiki rates", () => {
  const sand = grant("strength", 1, 0, 1);
  assert.equal(sand.strength, 4);
  assert.equal(sand.hitpoints, 4 / 3);

  const gem = grant("strength", 1, 0, GEM_XP_MULTIPLIER);
  assert.equal(gem.strength, 3.5);
  assert.ok(Math.abs(gem.hitpoints - 7 / 6) < 1e-12);

  const full = grant("strength", 15, 0, 1);
  assert.equal(full.strength, 60);
});

test("grant splits styles", () => {
  const controlled = grant("controlled", 3, 0, 1);
  assert.equal(controlled.attack, 4);
  assert.equal(controlled.strength, 4);
  assert.equal(controlled.defence, 4);
  assert.equal(controlled.hitpoints, 4);

  const magic = grant("magic", 3, 11.5, 1);
  assert.equal(magic.magic, 17.5);
  assert.equal(magic.hitpoints, 4);

  const splash = grant("magic", 0, 11.5, 1);
  assert.equal(splash.magic, 11.5);
  assert.equal(splash.hitpoints, 0);
});

test("accuracy against defence roll 640", () => {
  const got = crabAccuracy(99, 0, "strength", 1);
  assert.equal(got.effective, 107);
  assert.equal(got.attackRoll, 6848);
  assert.equal(got.defenceRoll, 640);
  const want = 1 - 642 / (2 * 6849);
  assert.ok(Math.abs(got.chance - want) < 1e-12);

  const low = crabAccuracy(1, 0, "strength", 1);
  assert.equal(low.attackRoll, 576);
  assert.ok(Math.abs(low.chance - 576 / (2 * 641)) < 1e-12);
});

test("expected kill hand cases", () => {
  let kill = expectedKill(1, 1, 1);
  assert.equal(kill.ok, true);
  assert.equal(kill.attacks, 2);
  assert.equal(kill.overkill, 0);

  kill = expectedKill(1, 2, 1);
  assert.ok(Math.abs(kill.attacks - 1.5) < 1e-9);
  assert.ok(Math.abs(kill.overkill - 0.5) < 1e-9);

  kill = expectedKill(2, 2, 1);
  assert.ok(Math.abs(kill.attacks - 2.25) < 1e-9);
  assert.ok(Math.abs(kill.overkill - 0.25) < 1e-9);

  kill = expectedKill(60, 1, 1);
  assert.equal(kill.overkill, 0);

  kill = expectedKill(60, 22, 1);
  assert.ok(Math.abs(kill.attacks - 6.09) < 0.02);
  assert.ok(Math.abs(kill.overkill - 7.01) < 0.02);

  const rolled = 60 + kill.overkill;
  const gemmed = styleTotal(grant("strength", rolled, 0, GEM_XP_MULTIPLIER));
  assert.ok(Math.abs(gemmed - 234.5) < 0.1);
  assert.equal(styleTotal(grant("strength", 60, 0, 1)), 240);
});

function scripted(rolls) {
  let n = 0;
  return () => {
    const roll = n < rolls.length ? rolls[n] : 0;
    n++;
    return roll;
  };
}

test("overkill caps sand crab XP", () => {
  const target = sandTarget(1, 0);
  const got = simulate(
    {
      maxHit: 50,
      attackSpeed: 4,
      accuracy: 1,
      style: "strength",
      spellXP: 0,
      ticks: 5,
      roll: scripted([50, 20]),
    },
    target,
    null,
  );
  assert.equal(got.attacks, 2);
  assert.equal(got.kills, 1);
  assert.equal(got.dealt, 60);
  assert.equal(got.overkill, 10);
  assert.equal(got.rollDamage, 70);
  assert.equal(got.xp.strength, 240);
  assert.equal(got.xpLost, 40);
  assert.equal(got.xpCut, 0);
});

test("two crabs are fought back to back", () => {
  const got = simulate(
    {
      maxHit: 60,
      attackSpeed: 4,
      accuracy: 1,
      style: "strength",
      spellXP: 0,
      ticks: 9,
      roll: scripted([60, 60]),
    },
    sandTarget(2, 0),
    null,
  );
  assert.equal(got.attacks, 2);
  assert.equal(got.kills, 2);
  assert.equal(got.dealt, 120);
  assert.equal(got.idleTicks, 1);
});

test("one crab waits out the respawn", () => {
  const target = sandTarget(1, 0);
  target.hitpoints = 10;
  const got = simulate(
    {
      maxHit: 10,
      attackSpeed: 4,
      accuracy: 1,
      style: "strength",
      spellXP: 0,
      ticks: 51,
      roll: scripted([10, 0]),
    },
    target,
    null,
  );
  assert.equal(got.attacks, 2);
  assert.equal(got.kills, 1);
  assert.equal(got.dealt, 10);
  assert.equal(got.overkill, 0);
  assert.equal(got.idleTicks, 46);
});

test("gemstone crab counts every point at 87.5%", () => {
  const got = simulate(
    {
      maxHit: 15,
      attackSpeed: 4,
      accuracy: 1,
      style: "strength",
      spellXP: 0,
      ticks: 9,
      roll: scripted([15, 15, 15]),
    },
    gemTarget(0),
    null,
  );
  assert.equal(got.dealt, 45);
  assert.equal(got.overkill, 0);
  assert.equal(got.kills, 0);
  assert.equal(got.attacks, 3);
  assert.ok(Math.abs(got.xp.strength - 157.5) < 1e-9);
  assert.ok(Math.abs(got.xp.hitpoints - 52.5) < 1e-9);
  assert.ok(Math.abs(got.xpCut - 22.5) < 1e-9);
  assert.equal(got.xpLost, 0);

  const splash = simulate(
    {
      maxHit: 1,
      attackSpeed: 1,
      accuracy: 1,
      style: "magic",
      spellXP: 11.5,
      ticks: 1,
      roll: () => 0,
    },
    gemTarget(0),
    null,
  );
  assert.ok(Math.abs(splash.xpCut - 11.5 / 8) < 1e-9);
});

test("ammonite crabs have 100 hitpoints and full XP", () => {
  const target = ammoniteTarget(1, 0);
  assert.equal(target.hitpoints, 100);
  assert.equal(target.xpMult, 1);
  assert.equal(target.respawn, 50);
  const got = simulate(
    {
      maxHit: 30,
      attackSpeed: 1,
      accuracy: 1,
      style: "strength",
      spellXP: 0,
      ticks: 4,
      roll: scripted([30, 30, 30, 30]),
    },
    target,
    null,
  );
  assert.equal(got.dealt, 100);
  assert.equal(got.overkill, 20);
  assert.equal(got.kills, 1);
  assert.equal(got.xp.strength, 400);
  assert.equal(got.xpLost, 80);
});

test("each spot can set its own reset window", () => {
  assert.equal(sandTarget(1, 4).activeTicks, 1000);
  const sand = sandTarget(1, 4, 6);
  assert.equal(sand.activeTicks, 6);
  assert.equal(sand.downTicks, 4);
  const ammo = ammoniteTarget(2, 3, 8);
  assert.equal(ammo.activeTicks, 8);
  assert.equal(ammo.hitpoints, 100);
  const gem = gemTarget(2, 5);
  assert.equal(gem.activeTicks, 5);
  assert.equal(gem.downTicks, 2);
  const got = simulate(
    {
      maxHit: 1,
      attackSpeed: 1,
      accuracy: 1,
      style: "strength",
      spellXP: 0,
      ticks: 10,
      roll: () => 1,
    },
    sand,
    null,
  );
  assert.equal(got.attacks, 6);
  assert.equal(got.idleTicks, 4);
});

test("each reset wanders inside its ± band", () => {
  const rolls = [0, 0, 0.9, 0.5];
  let n = 0;
  const rng = () => rolls[n++];
  const target = gemTarget(4, 10, 1, 1);
  assert.equal(target.activeJitter, 1);
  assert.equal(target.downJitter, 1);
  const got = simulate(
    {
      maxHit: 1,
      attackSpeed: 1,
      accuracy: 1,
      style: "strength",
      spellXP: 0,
      ticks: 27,
      roll: () => 1,
    },
    target,
    rng,
  );
  assert.equal(got.idleTicks, 7);
  assert.equal(got.attacks, 20);
  assert.equal(n, 4);
});

test("a skipped reset stays off when ± is set", () => {
  let calls = 0;
  const rng = () => {
    calls++;
    return 0;
  };
  const got = simulate(
    {
      maxHit: 1,
      attackSpeed: 1,
      accuracy: 1,
      style: "strength",
      spellXP: 0,
      ticks: 10,
      roll: () => 1,
    },
    gemTarget(0, 10, 5, 5),
    rng,
  );
  assert.equal(got.idleTicks, 0);
  assert.equal(got.attacks, 10);
  assert.equal(calls, 0);
});

test("reset jitter changes from one trial to the next", () => {
  const params = {
    maxHit: 1,
    attackSpeed: 1,
    accuracy: 1,
    style: "strength",
    spellXP: 0,
    ticks: 80,
  };
  const a = simulate(params, gemTarget(6, 12, 4, 3), mulberry32(1));
  const b = simulate(params, gemTarget(6, 12, 4, 3), mulberry32(2));
  const fixed = simulate(params, gemTarget(6, 12), mulberry32(1));
  const fixedAgain = simulate(params, gemTarget(6, 12), mulberry32(9));
  assert.notEqual(a.idleTicks, b.idleTicks);
  assert.equal(fixed.idleTicks, fixedAgain.idleTicks);
  assert.ok(a.idleTicks > 0);
});

test("downtime window", () => {
  const target = gemTarget(0);
  target.activeTicks = 10;
  target.downTicks = 5;
  const got = simulate(
    {
      maxHit: 1,
      attackSpeed: 1,
      accuracy: 1,
      style: "strength",
      spellXP: 0,
      ticks: 15,
      roll: () => 1,
    },
    target,
    null,
  );
  assert.equal(got.attacks, 10);
  assert.equal(got.idleTicks, 5);
  assert.equal(got.dealt, 10);
});

test("low max hit favours sand crabs and a high max hit favours the gemstone crab", () => {
  const run = (maxHit) => {
    const params = {
      maxHit,
      attackSpeed: 4,
      accuracy: 1,
      style: "strength",
      spellXP: 0,
      ticks: 60_000,
    };
    const gem = simulate(params, gemTarget(0), mulberry32(3 + maxHit));
    const sand = simulate(params, sandTarget(8, 0), mulberry32(9 + maxHit));
    return [gem.xp.strength, sand.xp.strength];
  };
  const [lowGem, lowSand] = run(1);
  assert.ok(lowSand > lowGem, `max hit 1 sand ${lowSand} gem ${lowGem}`);
  const [highGem, highSand] = run(40);
  assert.ok(highGem > highSand, `max hit 40 gem ${highGem} sand ${highSand}`);
});

test("compare sweep reuses the headline row and finishes quickly", () => {
  const start = performance.now();
  const report = compare({
    maxHit: 22,
    attackSpeed: 4,
    accuracy: 1,
    style: "strength",
    spellXP: 0,
    crabs: 3,
    ticks: 60_000,
    seed: 1,
    sandResetTicks: 25,
    gemMoveTicks: 10,
  });
  const ms = performance.now() - start;
  assert.ok(ms < 1500, `compare took ${ms.toFixed(0)}ms`);
  const star = report.sweep.find((row) => row.current);
  assert.equal(star.hit, 22);
  assert.equal(star.gemRate, styleTotal(report.gem.xp) * (6000 / 60_000));
  assert.ok(report.gem.idleTicks / report.gem.ticks > 0.008);
  assert.ok(report.gem.idleTicks / report.gem.ticks < 0.015);
  assert.ok(report.cross >= 20 && report.cross <= 30);
});

test("stepping a fight matches a batch simulation", () => {
  const params = {
    maxHit: 22,
    attackSpeed: 4,
    accuracy: 1,
    style: "strength",
    spellXP: 0,
    ticks: 2500,
  };
  const sandBatch = simulate(params, sandTarget(3, 25), mulberry32(1));
  const sandLive = createFight(params, sandTarget(3, 25), mulberry32(1));
  for (let i = 0; i < params.ticks; i++) sandLive.step();
  const sandDone = sandLive.finish();
  assert.equal(sandDone.dealt, sandBatch.dealt);
  assert.equal(sandDone.overkill, sandBatch.overkill);
  assert.equal(sandDone.kills, sandBatch.kills);
  assert.equal(sandDone.attacks, sandBatch.attacks);
  assert.equal(sandDone.idleTicks, sandBatch.idleTicks);
  assert.equal(sandDone.xp.strength, sandBatch.xp.strength);

  const gemBatch = simulate(params, gemTarget(10), mulberry32(1));
  const gemLive = createFight(params, gemTarget(10), mulberry32(1));
  let gained = 0;
  for (let i = 0; i < params.ticks; i++) gained += gemLive.step().xpStyle;
  const gemDone = gemLive.finish();
  assert.equal(gemDone.dealt, gemBatch.dealt);
  assert.equal(gemDone.xp.strength, gemBatch.xp.strength);
  assert.ok(Math.abs(gained - gemBatch.xp.strength) < 1e-6);
});

function monteOpts(extra) {
  return {
    maxHit: 1,
    attackSpeed: 4,
    accuracy: 1,
    style: "strength",
    spellXP: 0,
    crabs: 3,
    ammoCrabs: 3,
    sandResetTicks: 0,
    ammoResetTicks: 0,
    gemMoveTicks: 0,
    sandActiveTicks: 0,
    ammoActiveTicks: 0,
    gemActiveTicks: 0,
    ticks: 6000,
    trials: 40,
    seed: 7,
    ...extra,
  };
}

test("summarizeTrials reports spread and who led", () => {
  const report = summarizeTrials([
    { gem: 10, sand: 30, ammo: 20 },
    { gem: 12, sand: 28, ammo: 40 },
    { gem: 11, sand: 29, ammo: 21 },
  ]);
  assert.equal(report.trials, 3);
  assert.equal(report.gem.mean, 11);
  assert.equal(report.gem.stdev, 1);
  assert.equal(report.gem.min, 10);
  assert.equal(report.gem.max, 12);
  assert.equal(report.gem.p50, 11);
  assert.equal(report.leaders.sand, 2);
  assert.equal(report.leaders.ammo, 1);
  assert.equal(report.leaders.gem, 0);
  assert.equal(report.leaders.tie, 0);
});

test("a tie within half a percent is not a sole leader", () => {
  const report = summarizeTrials([
    { gem: 1000, sand: 1004, ammo: 900 },
  ]);
  assert.equal(report.leaders.tie, 1);
  assert.equal(report.leaders.gem, 0);
  assert.equal(report.leaders.sand, 0);
});

test("monte carlo mean sits on the gemstone steady rate", () => {
  const opts = monteOpts();
  const start = performance.now();
  const report = monteCarlo(opts);
  const ms = performance.now() - start;
  assert.ok(ms < 3000, `monte carlo took ${ms.toFixed(0)}ms`);
  assert.equal(report.trials, 40);
  assert.ok(Math.abs(report.expected.gem - 2625) < 1e-6);
  assert.ok(Math.abs(report.gem.mean - report.expected.gem) < 60, `gem mean ${report.gem.mean}`);
  assert.ok(report.gem.stdev > 0);
  assert.ok(Math.abs(report.sand.mean - report.expected.sand) < 80, `sand mean ${report.sand.mean}`);
  assert.equal(report.leaders.gem, 0);
  assert.equal(
    report.leaders.sand + report.leaders.ammo + report.leaders.tie,
    40,
  );
  const first = monteCarloTrial(opts, 0);
  assert.equal(report.samples.gem[0], first.gem);
  assert.equal(report.samples.sand[0], first.sand);
  assert.equal(report.samples.ammo[0], first.ammo);
  const again = monteCarlo(opts);
  assert.equal(again.gem.mean, report.gem.mean);
  assert.equal(again.samples.ammo[3], report.samples.ammo[3]);
});

test("monte carlo rejects an empty run", () => {
  assert.throws(() => monteCarlo(monteOpts({ trials: 0 })), /Trials/);
  assert.throws(() => monteCarlo(monteOpts({ ticks: 0 })), /Duration/);
});

test("github pages files stay relative", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /href="css\/style\.css"/);
  assert.match(html, /src="js\/sim\.js"/);
  assert.match(html, /src="js\/app\.js"/);
  assert.match(html, /id="tab-mc"/);
  assert.match(html, /id="panel-mc"/);
  assert.match(html, /id="mc-run"/);
  assert.equal(html.includes('src="/'), false);
  assert.equal(html.includes('href="/'), false);
  assert.equal(html.includes("type=\"module\""), false);
  assert.equal(fs.existsSync(new URL("../css/style.css", import.meta.url)), true);
  assert.equal(fs.existsSync(new URL("../js/app.js", import.meta.url)), true);
  assert.equal(fs.existsSync(new URL("../.nojekyll", import.meta.url)), true);
});
