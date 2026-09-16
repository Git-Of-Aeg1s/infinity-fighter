// 08-entities：子弹 / 道具 / 水晶 / 粒子更新 + 全屏特效状态（flash / 冲击波）
'use strict';

  // ---------- 子弹 ----------
  function updateBullets(dt) {
    // 暗紫轨迹残影：留存一段时间后渐隐消失
    for (let i = trailGhosts.length - 1; i >= 0; i--) {
      trailGhosts[i].life -= dt;
      if (trailGhosts[i].life <= 0) trailGhosts.splice(i, 1);
    }
    for (let i = pBullets.length - 1; i >= 0; i--) {
      const b = pBullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < -10) { pBullets.splice(i, 1); continue; }

      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (e.phase > 0) continue;   // 虚化：炮弹穿过护盾，可打到后面的敌人
        if (Math.abs(b.x - e.x) < e.w / 2 + b.r && Math.abs(b.y - e.y) < e.h / 2 + b.r) {
          // 4类主力舰：对玩家 Lv4 / 暴走(Lv5) 火力减伤 15%；玩家 Lv1 时对 BOSS 武器伤害 +20%
          let dmg = b.dmg;
          // 御4防御光环：光环内敌人受到的非真实伤害 -30%（高能爆弹为真实伤害，在 useBomb 直接结算、不经过此处）
          dmg *= yu4AuraMul(e);
          // 暴鸰：玩家处于其炸弹爆圈内时对暴鸰增伤 35%（无论炸弹是否已投出）
          if (e.type === 'baoling' && player.alive &&
              Math.hypot(player.x - e.x, player.y - e.y) <= BAOLING.blastR) dmg *= 1 + BAOLING.vuln;
          if (e.type === 'harbinger' && b.wing) dmg *= (1 - HARBINGER.wingDR);   // 炮火先兆者：僚机弹幕减伤 25%
          if (e.type === 'tornado') dmg *= b.wing ? (1 + STORM.tornadoWingVuln) : (1 - STORM.tornadoMainDR);   // 风团：主武器减伤 50%、僚机伤害 +150%
          if (e.type === 'capital' && player.weapon >= 4) dmg *= (1 - CAPITAL_HIGHFIRE_DR);
          else if (e.type === 'boss' && player.weapon === 1) dmg *= (1 + BOSS_LOWFIRE_BONUS);
          e.hp -= dmg;
          spawnParticles(b.x, b.y, '#ffffff', 4, 120);
          pBullets.splice(i, 1);
          if (e.hp <= 0) killEnemy(j);
          break;
        }
      }
    }

    for (let i = eBullets.length - 1; i >= 0; i--) {
      const b = eBullets[i];
      if (b.ax) b.vx += b.ax * dt;   // 弧线弹（1/4 双曲线弹道）
      // 沿飞行方向加速：初速低、快速增长至上限（4类红技能3 的 '/||\' 弹幕）
      if (b.accel) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const nx = b.vx / sp, ny = b.vy / sp;
        let ns = sp + b.accel * dt;
        if (b.maxSpeed && ns > b.maxSpeed) ns = b.maxSpeed;
        b.vx = nx * ns; b.vy = ny * ns;
      }
      // 风条生长：刚射出时很短，沿飞行方向随时间迅速长到全长
      if (b.lenTarget && b.len < b.lenTarget) {
        b.len = Math.min(b.lenTarget, b.len + (b.growRate || 130) * dt);
      }
      // 分裂弹：飞行一段距离→短时间内减速到 0→分裂成 N 个小子弹（互相等角）
      if (b.split) {
        const s = b.split;
        if (!s.triggered) {
          b.traveled += Math.hypot(b.vx, b.vy) * dt;
          if (b.traveled >= s.dist) {
            s.triggered = true;
            s.baseSpeed = Math.hypot(b.vx, b.vy);   // 记录触发时速度，用于平滑减速
            s.decay = 0.3;                          // 减速到 0 所需时间（短时间，避免瞬停突兀）
            s.stopT = s.decay;
          }
        } else {
          s.stopT -= dt;
          const f = Math.max(0, s.stopT / s.decay);   // 1→0 线性衰减
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > 0.001) { const ns = s.baseSpeed * f; b.vx = b.vx / sp * ns; b.vy = b.vy / sp * ns; }
          if (s.stopT <= 0) {
            const base = Math.random() * Math.PI * 2;   // 随机基准方向，各子弹间隔 360/N
            for (let k = 0; k < s.count; k++) {
              const ang = base + k * (Math.PI * 2 / s.count);
              eBullets.push({
                x: b.x, y: b.y,
                vx: Math.cos(ang) * s.speed, vy: Math.sin(ang) * s.speed,
                ax: 0, accel: 0, maxSpeed: 0,
                r: s.r, len: s.len || 0, dmg: b.dmg, color: s.color, split: null, traveled: 0,
              });
            }
            spawnParticles(b.x, b.y, s.color, 12, 180);
            eBullets.splice(i, 1); continue;
          }
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.trail) {
        // 暗紫轨迹残影：记录帧间线段（中心黑、两边紫、随机位置星芒闪耀）
        if (b.px != null) {
          trailGhosts.push({
            x1: b.px, y1: b.py, x2: b.x, y2: b.y,
            life: 1.0, max: 1.0, r: b.r,
            seed: Math.random() * 10, spark: Math.random() < 0.2,
          });
        }
        b.px = b.x; b.py = b.y;
      }
      if (b.y > CANVAS_H + 20 || b.y < -40 || b.x < -20 || b.x > CANVAS_W + 20) {
        eBullets.splice(i, 1); continue;
      }
      // 护盾加持：碰到护盾气泡的敌弹直接消解
      if (player.shield > 0 && player.alive &&
          Math.hypot(b.x - player.x, b.y - player.y) < 36 + b.r) {
        spawnParticles(b.x, b.y, '#6fe3ff', 6, 140);
        eBullets.splice(i, 1);
        continue;
      }
      // 命中判定：长条弹按胶囊体（判定点到弹体线段的最近距离）计算，普通弹按圆计算
      let hitPlayer = false;
      if (player.alive && player.invuln <= 0) {
        if (b.len) {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const ux = b.vx / sp, uy = b.vy / sp;
          const py = player.y + PLAYER.hitOffsetY;
          const tproj = clamp((player.x - b.x) * ux + (py - b.y) * uy, -b.len / 2, b.len / 2);
          hitPlayer = Math.hypot(player.x - (b.x + ux * tproj), py - (b.y + uy * tproj)) < PLAYER.hitRadius + b.r;
        } else {
          hitPlayer = Math.hypot(b.x - player.x, b.y - (player.y + PLAYER.hitOffsetY)) < PLAYER.hitRadius + b.r;
        }
      }
      if (hitPlayer) {
        damagePlayer(b.dmg);
        eBullets.splice(i, 1);
      }
    }
  }

  // ---------- 道具 ----------
  const POWERUP_MAGNET_RADIUS = 170;   // 道具磁吸半径（比水晶 110 更大，更易被吸引吃到）

  // 生成道具（非水晶类通用）：下落 + 随机左右漂移（碰边反弹）+ 易被磁吸
  function spawnPowerup(x, y, kind, r) {
    powerups.push({ x, y, kind, r, vy: rand(72, 99), vx: rand(-46, 46) });   // 1.8x 原速(40~55)
  }

  function updatePowerups(dt) {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      // 磁吸：比水晶更易被吸引（半径更大、拉力更强），吸附后直奔机身
      // BOSS 掉落道具（absorbDelay）：先自由下落一小段，随后无视距离被战机吸收（同水晶）
      let magnetized = false;
      if (p.absorbDelay != null && p.absorbDelay > 0) {
        p.absorbDelay -= dt;   // 下坠阶段：保持初始 vx/vy 飘落
      } else if (player.alive) {
        const dx = player.x - p.x;
        const dy = player.y - p.y;
        const dist = Math.hypot(dx, dy);
        const bossPull = p.absorbDelay != null;   // BOSS 掉落道具下坠结束后强制吸收
        if (dist > 1 && (bossPull || dist < POWERUP_MAGNET_RADIUS)) {
          magnetized = true;
          const pull = bossPull ? 1150 : 520 + 640 * (1 - dist / POWERUP_MAGNET_RADIUS);
          p.vx = (dx / dist) * pull;
          p.vy = (dy / dist) * pull;
        }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // 未磁吸时随机左右漂移，碰到左右两边反弹
      if (!magnetized) {
        if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx); }
        else if (p.x > CANVAS_W - p.r) { p.x = CANVAS_W - p.r; p.vx = -Math.abs(p.vx); }
      }
      if (p.y > CANVAS_H + 20) { powerups.splice(i, 1); continue; }
      if (player.alive &&
          Math.abs(p.x - player.x) < player.w / 2 + p.r &&
          Math.abs(p.y - player.y) < player.h / 2 + p.r) {
        if (p.kind === 'hp') {
          player.hp = clamp(player.hp + 40, 0, PLAYER.maxHp);
          spawnParticles(p.x, p.y, '#66e39a', 12, 160);
        } else if (p.kind === 'bomb') {
          state.bombs = Math.min(state.bombs + 1, MAX_BOMBS);
          spawnParticles(p.x, p.y, '#ffb545', 12, 160);
        } else if (p.kind === 'shield') {
          // 量子护盾：6 秒无敌，敌弹碰盾即消解，解除时清屏
          player.shield = SHIELD_DURATION;
          spawnParticles(p.x, p.y, '#6fe3ff', 18, 200);
        } else if (p.kind === 'berserk') {
          pickupBerserk();
        } else {
          pickupKit();
        }
        powerups.splice(i, 1);
      }
    }
  }

  // ---------- 水晶 ----------
  function updateCrystals(dt) {
    // 有效磁吸半径：击败第一个 BOSS（旧日之歌）后永久 ×1.35（110 → 148.5）
    const magR = PLAYER.magnetRadius * (state.crystalMagnetMul || 1);
    for (let i = crystals.length - 1; i >= 0; i--) {
      const c = crystals[i];
      c.t += dt * 4;
      // 磁吸：靠近玩家时被吸附（吸附后直奔机身中心判定点）
      // BOSS 水晶（absorbDelay）：先自由下落一小段，随后无视距离被战机全部吸收
      if (c.absorbDelay != null && c.absorbDelay > 0) {
        c.absorbDelay -= dt;   // 下坠阶段：保持初始 vx/vy 四散飘落
      } else if (player.alive) {
        const dx = player.x - c.x;
        const dy = player.y - c.y;
        const dist = Math.hypot(dx, dy);
        const bossPull = c.absorbDelay != null;   // BOSS 水晶下坠结束后强制吸收
        if (dist > 1 && (bossPull || dist < magR)) {
          const pull = bossPull ? 1150 : 900 + 700 * (1 - dist / magR);
          c.vx = (dx / dist) * pull;
          c.vy = (dy / dist) * pull;
        }
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.y > CANVAS_H + 20) { crystals.splice(i, 1); continue; }
      if (player.alive &&
          Math.abs(c.x - player.x) < player.w / 2 + c.r &&
          Math.abs(c.y - player.y) < player.h / 2 + c.r) {
        state.score += c.val;
        spawnParticles(c.x, c.y, '#9be7ff', 5, 120);
        crystals.splice(i, 1);
      }
    }
  }

  // BOSS警报时立即收集场上所有水晶和道具
  function collectAllItems() {
    for (const c of crystals) {
      state.score += c.val;
      spawnParticles(c.x, c.y, '#9be7ff', 4, 100);
    }
    crystals.length = 0;
    for (const p of powerups) {
      if (p.kind === 'hp') {
        player.hp = clamp(player.hp + 40, 0, PLAYER.maxHp);
      } else if (p.kind === 'bomb') {
        state.bombs = Math.min(state.bombs + 1, MAX_BOMBS);
      } else if (p.kind === 'shield') {
        player.shield = SHIELD_DURATION;
      } else if (p.kind === 'berserk') {
        pickupBerserk();
      } else {
        pickupKit();
      }
      spawnParticles(p.x, p.y, '#ffffff', 6, 130);
    }
    powerups.length = 0;
  }

  // ---------- 粒子 ----------
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
  }

  // ---------- 绘制 ----------
  let flash = 0;

  // 护盾解除冲击波：从玩家位置迅速扩大到全屏，同时渐隐（视觉上解释为何清除全场敌弹）
  const shieldBurst = { active: false, t: 0, duration: 0.65, x: 0, y: 0 };

  // 暴走冲击波：粉橙双环自机体扩散（暴走触发的醒目特效，不遮挡画面）
  const berserkBurst = { active: false, t: 0, duration: 0.7, x: 0, y: 0, big: false };

