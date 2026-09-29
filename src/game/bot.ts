// Heuristic autoplay used for automated QA/balance runs (never in normal play).
// It plays like a cautious average player: keeps distance, shoots priority
// targets, jumps shockwaves/charges and dashes through close bullets.

import { ARENA_W, GROUND_Y } from '../core/constants';
import type { GameScene } from '../scenes/GameScene';
import type { Intent } from './player';
import type { Enemy } from './enemy';

let dashCd = 0;
let jumpHold = 0;

export function botIntent(g: GameScene, dt: number): Intent {
  const p = g.player;
  dashCd -= dt;
  jumpHold -= dt;
  const it: Intent = { move: 0, jumpPressed: false, jumpHeld: jumpHold > 0, dashPressed: false, fire: false, skill1: false, skill2: false, aimX: p.x + p.facing * 100, aimY: p.centerY };
  let target: Enemy | null = null;
  let best = Infinity;
  let close = 0;
  let push = 0;
  for (const e of g.enemies) {
    if (!e.alive || e.dying > 0 || !e.targetable) continue;
    const dx = e.x - p.x;
    const d = Math.hypot(dx, e.y - p.centerY);
    if (d < 120) close++;
    const threat = e.boss ? 260 : e.ai === 'summoner' ? 180 : e.ai === 'rift' ? 140 : e.ai === 'gunner' || e.ai === 'exploder' ? 110 : e.ai === 'charger' ? 60 : 0;
    const score = d - threat;
    if (score < best && g.onScreen(e.x, 10)) {
      best = score;
      target = e;
    }
    // repulsion from ground threats (stronger when close)
    if (!e.def.flying || e.ai === 'flyer') {
      // shotgun pellets only reach ~140px, so a shotgun player has to stay closer
      const range = e.boss ? (g.build.weapon.id === 'shotgun' ? 45 : 150) : e.ai === 'charger' ? 110 : 80;
      if (Math.abs(dx) < range && Math.abs(e.y - p.centerY) < 60) push -= Math.sign(dx || 1) * (1 - Math.abs(dx) / range);
    }
    // charging / diving straight at us: jump or dash
    if ((e.state === 'charge' || (e.boss && e.vx !== 0)) && Math.abs(dx) < 90 && Math.sign(-dx) === Math.sign(e.vx || -dx)) {
      if (dashCd <= 0) {
        it.dashPressed = true;
        it.move = Math.sign(dx) || 1;
        dashCd = 1;
      }
    }
  }
  if (target) {
    // aim at the weak point when it is easy
    it.aimX = target.x + target.vx * 0.08;
    it.aimY = target.def.weakTop > 0 ? target.y - target.hh * 0.7 : target.y;
    it.fire = true;
  }
  if (it.move === 0) {
    if (Math.abs(push) > 0.15) it.move = push > 0 ? 1 : -1;
    else {
      // drift toward the middle of the arena and toward loot
      const want = ARENA_W / 2 + Math.sin(g.run.time * 0.3) * 220;
      if (Math.abs(want - p.x) > 40) it.move = want > p.x ? 1 : -1;
    }
  }
  if (p.x < 30) it.move = 1;
  if (p.x > ARENA_W - 30) it.move = -1;
  // dodge bullets and shockwaves
  for (const s of g.eshots.list) {
    if (!s.active) continue;
    const dx = s.x - p.x;
    if (s.kind === 'wave') {
      if (Math.abs(dx) < 55 && Math.sign(-dx) === Math.sign(s.vx) && p.grounded) {
        it.jumpPressed = true;
        jumpHold = 0.35;
      }
      continue;
    }
    const dy = s.y - p.centerY;
    const closing = dx * s.vx + dy * s.vy < 0;
    if (closing && Math.abs(dx) < 46 && Math.abs(dy) < 36) {
      if (dashCd <= 0) {
        // dash *through* the bullet: the i-frames cover the overlap
        it.dashPressed = true;
        it.move = s.vx > 0 ? -1 : 1;
        dashCd = 0.8;
      } else if (p.grounded && dy > -30) {
        // no dash ready: hop over it
        it.jumpPressed = true;
        jumpHold = 0.25;
      }
    }
  }
  if (p.y < GROUND_Y) it.jumpHeld = it.jumpHeld || jumpHold > 0;
  if (close >= 4) it.skill1 = g.skills.cd[0] <= 0;
  if (close >= 3 || (target?.boss && g.skills.cd[1] <= 0)) it.skill2 = g.skills.cd[1] <= 0;
  return it;
}
