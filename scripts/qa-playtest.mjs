// Automated play-test driver (Playwright + locally installed Edge/Chrome).
// Usage: node scripts/qa-playtest.mjs [scenario] [--url=http://localhost:5173]
// Scenarios: smoke | bot | boss | full | meta | retry | ui | cards | bossfight | ...
//   bot [--god] [--time=N]                 real-time autoplay with balance log
//   bossfight [--god] [--weapon=] [--zone=] [--level=] [--build=a,b]  time a boss fight
//   cards                                  level-up card families + rift event HUD
// Screenshots are written to qa-output/ at 960x540 (2x integer scale).

import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const scenario = args.find((a) => !a.startsWith('--')) ?? 'smoke';
const urlArg = args.find((a) => a.startsWith('--url='));
const base = urlArg ? urlArg.slice(6) : 'http://localhost:5173/';
const url = base + (base.includes('?') ? '&' : '?') + 'qa=1';
const outDir = path.resolve('qa-output');
fs.mkdirSync(outDir, { recursive: true });

const channels = ['msedge', 'chrome'];
let browser;
for (const channel of channels) {
  try {
    browser = await chromium.launch({ channel, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    break;
  } catch (e) {
    console.warn(`[qa] could not launch ${channel}: ${e.message.split('\n')[0]}`);
  }
}
if (!browser) throw new Error('No browser available');

const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const logs = [];
page.on('console', (m) => {
  const line = `[${m.type()}] ${m.text()}`;
  logs.push(line);
  if (m.type() === 'error' || m.type() === 'warning') console.log('  browser:', line);
});
page.on('pageerror', (e) => {
  logs.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`);
  console.log('  PAGE ERROR:', e.message, '\n', (e.stack ?? '').split('\n').slice(0, 6).join('\n'));
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let shot = 0;
async function snap(name) {
  shot++;
  const file = path.join(outDir, `${scenario}-${String(shot).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  screenshot ${path.basename(file)}`);
}
async function state() {
  return page.evaluate(() => (window.__RM ? window.__RM.state() : null));
}
async function rm(fn, ...a) {
  return page.evaluate(([f, aa]) => window.__RM && window.__RM[f](...aa), [fn, a]);
}
async function currentScenes() {
  return page.evaluate(() => {
    const g = window.__game;
    return g ? g.scene.getScenes(true).map((s) => s.scene.key) : [];
  });
}
async function waitScene(key, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await currentScenes();
    if (s.includes(key)) return true;
    await sleep(200);
  }
  throw new Error(`scene ${key} not reached; active: ${(await currentScenes()).join(',')}`);
}
async function clickGame(x, y) {
  // game is centred; logical 480x270 at zoom 2 => 960x540 fills the viewport
  await page.mouse.click(x * 2, y * 2);
}

console.log(`[qa] scenario=${scenario} url=${url}`);
await page.goto(url, { waitUntil: 'load' });
await waitScene('Title', 20000);
await sleep(600);
await snap('title-gate');
await clickGame(240, 135);
await sleep(700);
await snap('title-menu');

async function enterGame() {
  await page.keyboard.press('Enter');
  const s = await currentScenes();
  if (!s.includes('Game')) {
    await sleep(600);
    const s2 = await currentScenes();
    if (s2.includes('Hub')) {
      await page.keyboard.press('Enter');
    }
  }
  await waitScene('Game', 15000);
  await sleep(1200);
}

async function playFor(seconds, label, every = 5) {
  const t0 = Date.now();
  let n = 0;
  while (Date.now() - t0 < seconds * 1000) {
    await sleep(every * 1000);
    n++;
    const st = await state();
    if (!st) break;
    console.log(
      `  [${label} ${n * every}s] t=${st.time.toFixed(1)} zone=${st.zone} dir=${st.dir} zt=${st.zoneTime.toFixed(0)} lv=${st.level} hp=${st.hp}/${st.maxHp} kills=${st.kills} en=${st.enemies} shots=${st.shots} es=${st.eshots} parts=${st.particles} fps=${st.fps.toFixed(0)}${st.boss ? ` boss=${st.boss.id}:${st.boss.hp.toFixed(2)} ph${st.boss.phase}` : ''} hurt=[${st.hurt.join(',')}] build=${Object.entries(st.build).map(([k, v]) => k + v).join(',')}${st.event ? ` EVENT=${st.event}` : ''}${st.boss && st.bossDmg ? ` bossDmg=${JSON.stringify(st.bossDmg)}` : ''} xp=${Math.floor(st.xp ?? 0)}/${st.xpNext ?? '?'} offers=[${(st.offers ?? []).slice(-2).join(' ')}]`,
    );
    if (st.ended) break;
  }
}

try {
  if (scenario === 'smoke') {
    await enterGame();
    await snap('game-start');
    // manual controls: move, shoot, jump, dash
    await page.mouse.move(700, 380);
    await page.keyboard.down('d');
    await page.mouse.down();
    await sleep(900);
    await snap('moving-shooting');
    await page.keyboard.press('Space');
    await sleep(200);
    await snap('jump');
    await page.keyboard.press('Shift');
    await sleep(60);
    await snap('dash');
    await page.keyboard.up('d');
    await sleep(3000);
    await page.mouse.up();
    await snap('after-fight');
    await rm('bot', true);
    await playFor(20, 'bot', 5);
    await snap('bot-20s');
  } else if (scenario === 'bot') {
    await enterGame();
    await rm('bot', true);
    if (args.includes('--god')) await rm('god', true);
    const dur = Number(args.find((a) => a.startsWith('--time='))?.slice(7) ?? 120);
    for (let i = 0; i < dur / 30; i++) {
      await playFor(30, 'bot', 10);
      await snap(`bot-${(i + 1) * 30}s`);
      const st = await state();
      if (!st || st.ended) break;
    }
    await sleep(3500);
    await snap('end');
  } else if (scenario === 'boss') {
    await enterGame();
    await rm('bot', true);
    await rm('god', true);
    for (const id of ['multishot', 'multishot', 'pierce', 'crit', 'drone', 'drone']) await rm('give', id);
    await rm('skip', 160);
    await playFor(12, 'warn', 3);
    await snap('boss-intro');
    await playFor(20, 'boss', 5);
    await snap('boss-fight');
    await rm('bossHp', 0.45);
    await playFor(10, 'boss-p2', 5);
    await snap('boss-phase2');
    await rm('bossHp', 0.01);
    await playFor(12, 'boss-end', 3);
    await snap('zone-clear');
    await playFor(8, 'zone2', 4);
    await snap('zone2');
  } else if (scenario === 'full') {
    await enterGame();
    await rm('bot', true);
    await rm('god', true);
    for (let z = 0; z < 3; z++) {
      await playFor(20, `z${z}`, 10);
      await snap(`zone${z}-combat`);
      await rm('skip', 400);
      await playFor(14, `z${z}-end`, 7);
      await snap(`zone${z}-boss-or-finale`);
      await rm('bossHp', 0.3);
      await playFor(10, `z${z}-boss`, 5);
      await snap(`zone${z}-boss-late`);
      await rm('bossHp', 0.01);
      await rm('killAll');
      await playFor(14, `z${z}-clear`, 7);
    }
    await sleep(4000);
    await snap('result');
  } else if (scenario === 'gallery') {
    await enterGame();
    await rm('god', true);
    await sleep(2500);
    const ids = ['crawler', 'charger', 'gunner', 'flyer', 'watcher', 'shield', 'summoner', 'exploder'];
    await page.evaluate((list) => {
      const g = window.__game.scene.getScene('Game');
      list.forEach((id, i) => {
        const e = g.spawnEnemy(id, g.player.x + 60 + i * 42, id === 'flyer' || id === 'watcher' ? 120 : 216, i % 3 === 2 ? 'swift' : null);
        if (e) e.mem.spd = 0.0001;
      });
    }, ids);
    await sleep(500);
    await page.evaluate(() => window.__game.scene.pause('Game'));
    await sleep(200);
    await snap('enemies');
    await page.evaluate(() => window.__game.scene.resume('Game'));
    await rm('xp', 30);
    await sleep(1500);
    await snap('levelup');
    await page.keyboard.press('1');
    await sleep(800);
    await snap('after-pick');
    await page.keyboard.press('Escape');
    await sleep(500);
    await snap('pause');
    await page.keyboard.press('Escape');
    await sleep(300);
  } else if (scenario === 'showcase') {
    // mid/late-game build to review readability and juice
    await enterGame();
    await rm('god', true);
    await rm('bot', true);
    const build = (args.find((a) => a.startsWith('--build='))?.slice(8) ?? 'multishot,multishot,pierce,pierce,split,chain,chain,crit,crit,drone,drone,missile,missile,orbit,orbit,explosive').split(',');
    for (const id of build) await rm('give', id);
    const zone = Number(args.find((a) => a.startsWith('--zone='))?.slice(7) ?? 1);
    await page.evaluate((z) => {
      const g = window.__game.scene.getScene('Game');
      if (z > 0) g.warpToZone(z);
    }, zone);
    await sleep(3000);
    await rm('skip', 70);
    await playFor(12, 'show', 4);
    for (let i = 0; i < 4; i++) {
      await snap(`show-${i}`);
      await sleep(350);
    }
    await page.keyboard.press('q');
    await sleep(120);
    await snap('skill-q');
  } else if (scenario === 'bossfight') {
    // Balance probe: give a build, jump to the zone's end and time the boss
    // fight with the autoplay bot (add --god to ignore deaths).
    await enterGame();
    await rm('bot', true);
    if (args.includes('--god')) await rm('god', true);
    const weapon = args.find((a) => a.startsWith('--weapon='))?.slice(9);
    if (weapon) await rm('weapon', weapon);
    const buildArg = args.find((a) => a.startsWith('--build='))?.slice(8);
    for (const id of buildArg ? buildArg.split(',') : []) await rm('give', id);
    const zone = Number(args.find((a) => a.startsWith('--zone='))?.slice(7) ?? 0);
    if (zone > 0) {
      await page.evaluate((z) => window.__game.scene.getScene('Game').warpToZone(z), zone);
      await sleep(2500);
    }
    const lvl = Number(args.find((a) => a.startsWith('--level='))?.slice(8) ?? 0);
    if (lvl > 0) {
      const ok = await page.evaluate((n) => {
        const g = window.__game.scene.getScene('Game');
        if (!g || !g.run) return Object.keys(g ?? {}).slice(0, 12).join(',');
        g.run.level = n;
        // freeze levelling so the probe measures exactly the given build
        g.run.xpNext = 1e9;
        return 'ok';
      }, lvl);
      console.log('  set level:', ok, 'scenes:', (await currentScenes()).join(','));
    }
    // frame sampler: where does real time go (hit-stop / slow-mo / paused)?
    await page.evaluate(() => {
      const g = window.__game.scene.getScene('Game');
      const s = (window.__frames = { n: 0, stop: 0, slow: 0, paused: 0, lvl: 0 });
      // count spawned player shots by kind
      const spawned = (window.__spawned = {});
      const orig = g.shots.spawn.bind(g.shots);
      g.shots.spawn = (kind, ...rest) => {
        spawned[kind] = (spawned[kind] ?? 0) + 1;
        return orig(kind, ...rest);
      };
      const tick = () => {
        s.n++;
        if (g.hitstopT > 0) s.stop++;
        else if (g.slowT > 0) s.slow++;
        if (g.scene.isPaused()) s.paused++;
        if (window.__game.scene.isActive('LevelUp')) s.lvl++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await rm('skip', 400);
    const tReal = Date.now();
    let t0 = null;
    for (let i = 0; i < 60; i++) {
      await sleep(3000);
      const st = await state();
      if (!st) {
        console.log('  no state; scenes:', (await currentScenes()).join(','));
        break;
      }
      if (st.boss && t0 === null) t0 = st.time;
      const fr = await page.evaluate(() => {
        const f = { ...window.__frames };
        Object.assign(window.__frames, { n: 0, stop: 0, slow: 0, paused: 0, lvl: 0 });
        return f;
      });
      console.log(`  [fight] real=${((Date.now() - tReal) / 1000).toFixed(1)} t=${st.time.toFixed(1)} fps=${st.fps.toFixed(0)} frames=${fr.n} stop=${fr.stop} slow=${fr.slow} paused=${fr.paused} lvlup=${fr.lvl} dir=${st.dir} hp=${st.hp}/${st.maxHp}${st.boss ? ` boss=${st.boss.hp.toFixed(2)} ph${st.boss.phase}` : ''} hurt=[${st.hurt.slice(-4).join(',')}]`);
      if (t0 !== null && (!st.boss || st.boss.hp <= 0 || st.dir === 'clear' || st.dir === 'warp' || st.dir === 'victory')) {
        console.log(`  boss fight lasted ~${(st.time - t0).toFixed(1)}s (game time) dmg=${JSON.stringify(st.bossDmg)}`);
        console.log('  shots spawned:', JSON.stringify(await page.evaluate(() => window.__spawned)), 'build:', JSON.stringify(st.build));
        break;
      }
      if (st.ended || st.dead) {
        console.log(`  died after ${t0 === null ? '?' : (st.time - t0).toFixed(1)}s, boss at ${st.boss ? st.boss.hp.toFixed(2) : '-'} dmg=${JSON.stringify(st.bossDmg)}`);
        break;
      }
    }
    await snap('fight-end');
  } else if (scenario === 'cards') {
    // New card families + rift event HUD, captured for visual review.
    await enterGame();
    await rm('god', true);
    await sleep(1500);
    // first (start) pick may be pending: choose card 1
    if ((await currentScenes()).includes('LevelUp')) {
      await page.keyboard.press('1');
      await sleep(500);
    }
    await page.evaluate(() => (window.__game.scene.getScene('Game').run.level = 12));
    const sets = [
      ['awaken', 'execute', 'c_glass'],
      ['ov_power', 'ov_rate', 'ov_life'],
      ['sk_shock_plus', 'sentry', 'c_frenzy'],
    ];
    for (const [i, ids] of sets.entries()) {
      await rm('offer', ids);
      await sleep(900);
      await snap(`cards-${i}`);
      await page.keyboard.press('1');
      await sleep(900);
    }
    console.log('  build after picks:', JSON.stringify((await state()).build));
    await rm('bot', true);
    for (const ev of ['supply', 'bounty', 'surge', 'rain']) {
      await rm('event', ev);
      // the bot kills bounty targets fast, so capture that HUD early
      await sleep(ev === 'bounty' ? 1200 : 2600);
      await snap(`event-${ev}`);
      const st = await state();
      console.log(`  event ${ev}: active=${st.event} lv=${st.level} hp=${st.hp}/${st.maxHp} en=${st.enemies}`);
      await sleep(4000);
    }
  } else if (scenario === 'weapons') {
    await enterGame();
    await rm('god', true);
    await sleep(2500);
    await rm('skip', 60);
    for (const w of ['rail', 'beam', 'shotgun']) {
      await rm('weapon', w);
      await page.mouse.move(820, 330);
      await page.mouse.down();
      await sleep(w === 'beam' ? 1800 : 900);
      await snap(`weapon-${w}`);
      await page.mouse.up();
      await sleep(300);
    }
    await rm('skills', 'orbital', 'singularity');
    await page.mouse.move(760, 400);
    await page.keyboard.press('q');
    await sleep(700);
    await snap('skill-orbital');
    await page.keyboard.press('e');
    await sleep(900);
    await snap('skill-singularity');
    await sleep(1800);
    await snap('skill-singularity-boom');
    // boss visuals
    await rm('killAll');
    await rm('boss', 'warden');
    await rm('bot', true);
    await playFor(16, 'warden', 4);
    await snap('warden-1');
    await sleep(1500);
    await snap('warden-2');
    await sleep(1500);
    await snap('warden-3');
  } else if (scenario === 'orbis') {
    await enterGame();
    await rm('god', true);
    await page.evaluate(() => window.__game.scene.getScene('Game').warpToZone(2));
    await sleep(4000);
    await rm('bot', true);
    for (const id of ['multishot', 'multishot', 'pierce', 'crit', 'drone', 'drone', 'missile']) await rm('give', id);
    await rm('boss', 'orbis');
    await playFor(10, 'orbis', 5);
    await snap('orbis-p1');
    await rm('bossHp', 0.6);
    await playFor(8, 'orbis-p2', 4);
    await snap('orbis-p2');
    await sleep(1200);
    await snap('orbis-p2b');
    await rm('bossHp', 0.3);
    await playFor(8, 'orbis-p3', 4);
    await snap('orbis-p3');
    await sleep(1200);
    await snap('orbis-p3b');
  } else if (scenario === 'ui') {
    await enterGame();
    await rm('god', true);
    for (const id of ['pierce', 'crit', 'drone', 'barrier']) await rm('give', id);
    await sleep(2500);
    await page.keyboard.press('Escape');
    await sleep(600);
    await snap('pause');
    await clickGame(110, 106); // 설정
    await sleep(600);
    await snap('settings');
    await page.keyboard.press('Escape');
    await sleep(400);
    await page.keyboard.press('Escape');
    await sleep(600);
    console.log('  scenes after resume:', (await currentScenes()).join(','));
    await snap('resumed');
  } else if (scenario === 'retry') {
    // death -> result -> R -> fresh run, twice (checks scene restart hygiene)
    for (let i = 0; i < 2; i++) {
      if (i === 0) await enterGame();
      await sleep(1500);
      await rm('hurt', 99);
      await waitScene('Result', 12000);
      await sleep(1200);
      await page.keyboard.press('r');
      await waitScene('Game', 8000);
      await sleep(2500);
      const st = await state();
      console.log(`  retry ${i + 1}: time=${st.time.toFixed(1)} hp=${st.hp}/${st.maxHp} dead=${st.dead} enemies=${st.enemies} scenes=${(await currentScenes()).join(',')}`);
    }
    await snap('after-retry');
  } else if (scenario === 'art') {
    // Dump generated sprite sheets, upscaled, for visual review.
    const keys = (args.find((a) => a.startsWith('--keys='))?.slice(7) ?? 'hero_body,hero_head').split(',');
    const scale = Number(args.find((a) => a.startsWith('--scale='))?.slice(8) ?? 4);
    for (const key of keys) {
      const data = await page.evaluate(
        ([k, s]) => {
          const g = window.__game;
          const tex = g.textures.get(k);
          const src = tex.getSourceImage();
          const names = tex.getFrameNames();
          const frames = names.length ? names.map((n) => tex.get(n)) : [tex.get()];
          const fw = frames[0].width;
          const fh = frames[0].height;
          const perRow = Math.max(1, Math.floor(1800 / (fw * s + 4)));
          const rows = Math.ceil(frames.length / perRow);
          const c = document.createElement('canvas');
          c.width = Math.min(frames.length, perRow) * (fw * s + 4);
          c.height = rows * (fh * s + 4);
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#3a3450';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.imageSmoothingEnabled = false;
          frames.forEach((f, i) => {
            const x = (i % perRow) * (fw * s + 4);
            const y = Math.floor(i / perRow) * (fh * s + 4);
            ctx.drawImage(src, f.cutX, f.cutY, f.width, f.height, x, y, f.width * s, f.height * s);
          });
          return c.toDataURL('image/png');
        },
        [key, scale],
      );
      const file = path.join(outDir, `art-${key}.png`);
      fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
      console.log(`  wrote ${path.basename(file)}`);
    }
  } else if (scenario === 'meta') {
    // die -> result -> hub -> buy -> equip -> relaunch -> reload persistence
    await enterGame();
    await sleep(1500);
    await rm('hurt', 99);
    await waitScene('Result', 12000);
    await sleep(2500);
    await snap('result');
    await page.evaluate(() => {
      window.__store.data.shards += 200;
      window.__store.save();
    });
    await clickGame(240, 250); // 균열 공방
    await waitScene('Hub');
    await sleep(500);
    await snap('hub');
    await clickGame(438, 71); // buy first weapon (shotgun)
    await sleep(400);
    await clickGame(62, 76); // equip shotgun
    await sleep(300);
    await snap('hub-bought');
    const meta = await page.evaluate(() => ({ meta: window.__store.data.meta, weapon: window.__store.data.weapon, shards: window.__store.data.shards }));
    console.log('  store after buy:', JSON.stringify(meta));
    await page.keyboard.press('Enter');
    await waitScene('Game');
    await sleep(2500);
    await page.mouse.move(800, 400);
    await page.mouse.down();
    await sleep(700);
    await snap('shotgun');
    await page.mouse.up();
    const st = await state();
    console.log('  weapon in run:', await page.evaluate(() => window.__game.scene.getScene('Game').build.weapon.id), 'lv', st.level);
    // persistence across reload
    await page.reload({ waitUntil: 'load' });
    await waitScene('Title', 20000);
    const after = await page.evaluate(() => ({ meta: window.__store.data.meta, weapon: window.__store.data.weapon, runs: window.__store.data.stats.runs }));
    console.log('  store after reload:', JSON.stringify(after));
    await clickGame(240, 135);
    await sleep(600);
    await snap('title-after-reload');
    // corrupted save must not break boot
    await page.evaluate(() => localStorage.setItem('riftmaiden.save.v1', '{not json'));
    await page.reload({ waitUntil: 'load' });
    await waitScene('Title', 20000);
    console.log('  corrupted save recovered:', await page.evaluate(() => window.__store.recovered));
  }
} catch (e) {
  console.error('[qa] FAILED:', e.message);
  await snap('failure');
  process.exitCode = 1;
}

const errors = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
fs.writeFileSync(path.join(outDir, `${scenario}-console.log`), logs.join('\n'));
console.log(`[qa] done. console errors: ${errors.length}`);
if (errors.length) {
  console.log(errors.slice(0, 10).join('\n'));
  process.exitCode = 1;
}
await browser.close();
