// 08-entities：子弹 / 道具 / 水晶 / 粒子更新 + 全屏特效状态（state.flash / 冲击波）

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：04-spawn(1 名) 05-boss(1 名) 06-enemy(1 名) 07-player(3 名) 10-draw-world(2 名) 12-ui(1 名) 14-main(7 名)
  // 本文件写共享状态（state/bossFlow/levelFlow 属性赋值；新增属性先在 02-core 归域声明）：
  //   state.{bombs, score}
  //
  import { BAOLING, BOSS_LOWFIRE_BONUS, BULWARK, CANVAS_H, CANVAS_W, CAPITAL_DESCEND_DR, CAPITAL_HIGHFIRE_DR, FASHI_MATRIX, HANSHUANG, HARBINGER, JIAOXIANG, MAX_BOMBS, PLAYER_CFG, POPIAN_VULN_LV1, POPIAN_VULN_LV2, SHIELD_DURATION, STORM } from './01-config.js';
  import { clamp, enemyOnScreen, crystals, eBullets, enemies, hasteMul, pBullets, particles, phaseFx, player, powerups, rand, spawnParticles, state, trailGhosts } from './02-core.js';
  import { yu4AuraMul } from './04-spawn.js';
  import { killEnemy } from './06-enemy.js';
  import { bulwarkActive, clipAgainstShield, damagePlayer, pickupBerserk, pickupKit, shieldSweepHit } from './07-player.js';


  // ---------- 敌人受伤修正链（主武器弹幕 / 僚机弹幕 / 空间斩击共用）----------
  // 返回对敌人 e 的伤害倍率；isWing 标识该伤害是否来自僚机弹幕。
  function enemyDamageMul(e, isWing) {
    let mul = 1;
    // 御4防御光环：光环内敌人受到的非真实伤害 -30%（高能爆弹为真实伤害，在 useBomb 直接结算、不经过此处）
    mul *= yu4AuraMul(e);
    // 暴鸰：玩家处于其炸弹爆圈内时对暴鸰增伤 35%（无论炸弹是否已投出）
    if (e.type === 'baoling' && player.alive &&
        Math.hypot(player.x - e.x, player.y - e.y) <= BAOLING.blastR) mul *= 1 + BAOLING.vuln;
    if (e.type === 'harbinger' && isWing) mul *= (1 - HARBINGER.wingDR);   // 炮火先兆者：僚机弹幕减伤 25%
    if (e.type === 'tornado') mul *= isWing ? (1 + STORM.tornadoWingVuln) : (1 - STORM.tornadoMainDR);   // 风团：主武器减伤 50%、僚机伤害 +150%
    // 4类主力舰：俯冲减速前（速度未明显衰减）20% 减伤；减速/展开/悬停后恢复常规
    if (e.type === 'capital' && !e.arrived && (e.hoverY - e.y) >= 90) mul *= (1 - CAPITAL_DESCEND_DR);
    if (e.type === 'capital' && player.weapon >= 4) mul *= (1 - CAPITAL_HIGHFIRE_DR);
    else if (e.type === 'boss' && player.weapon === 1) mul *= (1 + BOSS_LOWFIRE_BONUS);
    // 破片：火力 Lv1 / Lv2 时受到 30% / 10% 易伤（低火力补偿，主武器与僚机弹均生效；高能爆弹为真实伤害不加成）
    if (e.type === 'popian' && player.weapon <= 2) mul *= 1 + (player.weapon === 1 ? POPIAN_VULN_LV1 : POPIAN_VULN_LV2);
    // 法术矩阵：受到来自主战机（非僚机）的伤害 -30%（僚机弹幕正常）
    if (e.type === 'fashiMatrix' && !isWing) mul *= (1 - FASHI_MATRIX.mainDR);
    // 焦香螺旋桨：登场 2s 内受到的伤害 -30%（入场保护，主武器与僚机弹幕均生效）
    if (e.type === 'jiaoxiang' && (e.auraT || 0) < JIAOXIANG.entryDRT) mul *= (1 - JIAOXIANG.entryDR);
    // 寒霜：入场未减速阶段（距落点 ≥90px、未开始减速）受到的伤害 -20%（主武器与僚机弹幕均生效）
    if (e.type === 'hanshuang' && e.hsNoDecel) mul *= (1 - HANSHUANG.entryDR);
    return mul;
  }

  // ---------- 子弹 ----------
  function updateBullets(dt) {
    // 暗紫轨迹残影：留存一段时间后渐隐消失
    for (let i = trailGhosts.length - 1; i >= 0; i--) {
      trailGhosts[i].life -= dt;
      if (trailGhosts[i].life <= 0) trailGhosts.splice(i, 1);
    }
    // 碎盾特效推进：寿命尽即移除（独立于敌人存续，斩碎后敌人被毁仍继续播放）
    for (let i = phaseFx.length - 1; i >= 0; i--) {
      phaseFx[i].t -= dt;
      if (phaseFx[i].t <= 0) phaseFx.splice(i, 1);
    }
    // 斗志昂扬增益：期间我方（含僚机）弹道飞行速度翻倍 —— 作用于所有在飞子弹，增益结束即恢复常速
    const hm = hasteMul();
    for (let i = pBullets.length - 1; i >= 0; i--) {
      const b = pBullets[i];
      b.x += b.vx * hm * dt; b.y += b.vy * hm * dt;
      if (b.y < -10) { pBullets.splice(i, 1); continue; }

      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (!enemyOnScreen(e)) continue;   // 屏幕外敌人（尚未入场 / 已离场 / 侧翼界外）不受我方子弹伤害
        if (e.phase > 0) continue;   // 虚化：炮弹穿过护盾，可打到后面的敌人
        const hsE = (e.type === 'hanshuang' && e.hsNoDecel) ? HANSHUANG.entryHitScale : 1;   // 寒霜入场未减速：判定箱略缩
        if (Math.abs(b.x - e.x) < e.w / 2 * hsE + b.r && Math.abs(b.y - e.y) < e.h / 2 * hsE + b.r) {
          // 4类主力舰：对玩家 Lv4 / 暴走(Lv5) 火力减伤 15%；玩家 Lv1 时对 BOSS 武器伤害 +20%
          // 全部敌人减伤/易伤修正集中在 enemyDamageMul（与空间斩击共用）
          const dmg = b.dmg * enemyDamageMul(e, b.wing);
          e.hp -= dmg * (e.type === 'tornado' ? (b.tornadoHits || 1) : 1);   // 守愿者弹对大型龙卷（暴风之眼召唤的暴风）判定两次伤害
          spawnParticles(b.x, b.y, '#ffffff', 4, 120);
          // 守愿者弹：卫护飞船（escort）无限穿透——不销毁、不消耗次数；其余 1类（side / prolifera）穿透一次（每发限一次）
          let pierce = false;
          if (b.pierce != null && e.type === 'escort') pierce = true;
          else if (b.pierce > 0 && (e.type === 'side' || e.type === 'prolifera')) { pierce = true; b.pierce--; }
          if (!pierce) pBullets.splice(i, 1);
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
      // 激光（b.laser）：无上限持续生长，直到尾端出界才消失（尾端锢定于 b.x/b.y）
      if (b.laser) {
        b.len += (b.growRate || 130) * dt;
      } else if (b.lenTarget && b.len < b.lenTarget) {
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
      // 守愿者白盾拦截（位于玩家量子护盾之前：盾在主机前侧，直射弹先碰白盾）；仅非导弹直射弹生效
      if (bulwarkActive()) {
        if (b.laser) {
          // 激光：截断裁切——不 splice，继续按原逻辑生长/推进；本帧计算 clipLen（无相交置 null），渲染与命中判定按此截断
          //   pad 含弹体半径 + 盾厚一半（零厚度轴线会让擦盾弧端点的激光漏过）；
          //   粘滞阻挡：一旦被盾咬住（shieldHold 记录僚机与接触点本地偏移），即使追踪旋转 / 僚机随玩家闪避
          //   导致某帧轴线与盾折线失去交点，也按“锚定在僚机上的接触点”继续截断——被挡住的激光不会中途漏出盾外
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const ux = b.vx / sp, uy = b.vy / sp;
          const clip = clipAgainstShield(b.x, b.y, ux, uy, b.len, b.r + BULWARK.thickness / 2);
          if (clip) {
            b.clipLen = clip.d;
            b.shieldHold = true; b.shieldW = clip.w;
            b.shieldLX = clip.x - clip.w.x; b.shieldLY = clip.y - clip.w.y;
            if (Math.random() < 0.6) spawnParticles(clip.x, clip.y, '#eaf6ff', 2, 90);   // 交点节流迸火花
          } else if (b.shieldHold && b.shieldW && b.shieldW.shieldSegs && b.shieldW.shieldSegs.length) {
            const ax = b.shieldW.x + b.shieldLX, ay = b.shieldW.y + b.shieldLY;
            b.clipLen = clamp((ax - b.x) * ux + (ay - b.y) * uy, 0, b.len);
            if (Math.random() < 0.6) spawnParticles(ax, ay, '#eaf6ff', 2, 90);
          } else {
            b.clipLen = null;
          }
        } else if (b.len && b.oval) {
          // 椭圆风条：head 端先触盾，逐帧“磨短”（裁掉越盾部分、头端钉在盾面），尾端越盾（有效长度≤0）即消解
          //   pad 含弹体半径 + 盾厚一半（零厚度轴线会让擦盾弧端点的风条漏过）；
          //   粘滞阻挡：被盾咬住（shieldHold）的风条即使某帧轴线与盾折线失去交点（僚机随玩家闪避、
          //   尾端一帧跨过细折线、高速跳步），也按锚定接触点继续磨短——挡住一半的风条不会中途漏出盾面
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const ux = b.vx / sp, uy = b.vy / sp;
          const halfL = b.len / 2;
          const tx = b.x - ux * halfL, ty = b.y - uy * halfL;   // 尾端
          const clip = clipAgainstShield(tx, ty, ux, uy, b.len, b.r + BULWARK.thickness / 2);
          let d = clip ? clip.d : null, cx, cy;
          if (clip) {
            b.shieldHold = true; b.shieldW = clip.w;
            b.shieldLX = clip.x - clip.w.x; b.shieldLY = clip.y - clip.w.y;
            cx = clip.x; cy = clip.y;
          } else if (b.shieldHold && b.shieldW && b.shieldW.shieldSegs && b.shieldW.shieldSegs.length) {
            const ax = b.shieldW.x + b.shieldLX, ay = b.shieldW.y + b.shieldLY;
            d = clamp((ax - tx) * ux + (ay - ty) * uy, 0, b.len);
            cx = ax; cy = ay;
          }
          if (d != null) {
            spawnParticles(cx, cy, '#eaf6ff', 3, 110);
            if (d <= 0.5) { eBullets.splice(i, 1); continue; }   // 被吃完
            b.len = d;                                   // 收缩到盾面
            b.x = tx + ux * d / 2; b.y = ty + uy * d / 2;   // 尾端不动、中心回移
          }
        } else {
          // 普通直射弹：扫掠(prev→cur)与盾相交则吸收；长条弹以弹头前缘扫掠（判定贴合视觉，不再沉入盾面后才消失）
          const pxp = b.x - b.vx * dt, pyp = b.y - b.vy * dt;
          let sx1 = pxp, sy1 = pyp, sx2 = b.x, sy2 = b.y;
          if (b.len) {
            const sp = Math.hypot(b.vx, b.vy) || 1, half = b.len / 2;
            const hx = b.vx / sp * half, hy = b.vy / sp * half;
            sx1 = pxp + hx; sy1 = pyp + hy; sx2 = b.x + hx; sy2 = b.y + hy;
          }
          const hit = shieldSweepHit(sx1, sy1, sx2, sy2, b.r);
          if (hit) {
            spawnParticles(hit.x, hit.y, '#eaf6ff', 6, 150);
            eBullets.splice(i, 1); continue;
          }
        }
      }
      // 护盾加持：碰到护盾气泡的敌弹直接消解（激光穿透护盾，仅尾端出界才消失）
      if (!b.laser && player.shield > 0 && player.alive &&
          Math.hypot(b.x - player.x, b.y - player.y) < 36 + b.r) {
        spawnParticles(b.x, b.y, '#6fe3ff', 6, 140);
        eBullets.splice(i, 1);
        continue;
      }
      // 命中判定：长条弹按胶囊体（判定点到弹体线段的最近距离）计算，普通弹按圆计算
      let hitPlayer = false;
      if (player.alive && player.invuln <= 0) {
        if (b.laser) {
          // 激光尾端锢定：胶囊体从 (b.x, b.y) 到 (b.x + ux*b.len, b.y + uy*b.len)
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const ux = b.vx / sp, uy = b.vy / sp;
          const py = player.y + PLAYER_CFG.hitOffsetY;
          // 守愿者白盾截断：命中判定仅到 clipLen（盾前段），越盾部分不伤人
          const effLen = b.clipLen != null ? Math.min(b.len, b.clipLen) : b.len;
          const tproj = clamp((player.x - b.x) * ux + (py - b.y) * uy, 0, effLen);
          hitPlayer = Math.hypot(player.x - (b.x + ux * tproj), py - (b.y + uy * tproj)) < PLAYER_CFG.hitRadius + b.r;
        } else if (b.len) {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const ux = b.vx / sp, uy = b.vy / sp;
          const py = player.y + PLAYER_CFG.hitOffsetY;
          const tproj = clamp((player.x - b.x) * ux + (py - b.y) * uy, -b.len / 2, b.len / 2);
          hitPlayer = Math.hypot(player.x - (b.x + ux * tproj), py - (b.y + uy * tproj)) < PLAYER_CFG.hitRadius + b.r;
        } else {
          hitPlayer = Math.hypot(b.x - player.x, b.y - (player.y + PLAYER_CFG.hitOffsetY)) < PLAYER_CFG.hitRadius + b.r;
        }
      }
      if (hitPlayer) {
        damagePlayer(b.dmg);
        if (!b.laser) eBullets.splice(i, 1);   // 激光穿透：命中不消失，持续生长直到尾端出界
      }
    }
  }

  // ---------- 道具 ----------
  const POWERUP_MAGNET_RADIUS = 170;   // 道具磁吸半径（比水晶 110 更大，更易被吸引吃到）

  // 生成道具（非水晶类通用）：下落 + 随机左右漂移（碰边反弹）+ 易被磁吸
  function spawnPowerup(x, y, kind, r) {
    powerups.push({ x, y, kind, r, vy: rand(72, 99), vx: rand(-46, 46) });   // 1.8x 原速(40~55)
  }

  // 道具拾取结算（本体碰撞与强制吸收近距离直吸共用）
  function applyPowerupPickup(p) {
    if (p.kind === 'hp') {
      player.hp = clamp(player.hp + 40, 0, PLAYER_CFG.maxHp);
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
  }

  function updatePowerups(dt) {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      // 磁吸：比水晶更易被吸引（半径更大、拉力更强），吸附后直奔机身
      // 强制吸收（absorbDelay，BOSS 掉落 / 警报快速吸收）：先自由下落一小段，随后无视距离高速飞向战机
      let magnetized = false;
      if (p.absorbDelay != null && p.absorbDelay > 0) {
        p.absorbDelay -= dt;   // 下坠阶段：保持初始 vx/vy 飘落
      } else if (player.alive) {
        const dx = player.x - p.x;
        const dy = player.y - p.y;
        const dist = Math.hypot(dx, dy);
        const bossPull = p.absorbDelay != null;   // 下坠结束后强制吸收
        if (dist > 1 && (bossPull || dist < POWERUP_MAGNET_RADIUS)) {
          magnetized = true;
          const pull = bossPull ? (p.pullSpeed || 1150) : 520 + 640 * (1 - dist / POWERUP_MAGNET_RADIUS);
          p.vx = (dx / dist) * pull;
          p.vy = (dy / dist) * pull;
          // 近距直吸：本帧位移即可抵达玩家时直接结算（高速拉取一帧可能越过拾取窗口）
          if (bossPull && dist <= pull * dt + 8) {
            applyPowerupPickup(p);
            powerups.splice(i, 1);
            continue;
          }
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
        applyPowerupPickup(p);
        powerups.splice(i, 1);
      }
    }
  }

  // ---------- 水晶 ----------
  function updateCrystals(dt) {
    // 有效磁吸半径：击败第一个 BOSS（旧日之歌）后永久 ×1.5（基础 132 → 198）
    const magR = PLAYER_CFG.magnetRadius * (state.crystalMagnetMul || 1);
    for (let i = crystals.length - 1; i >= 0; i--) {
      const c = crystals[i];
      c.t += dt * 4;
      // 磁吸：靠近玩家时被吸附（吸附后直奔机身中心判定点）
      // 强制吸收（absorbDelay，BOSS 掉落 / 警报快速吸收）：先自由下落一小段，随后无视距离高速飞向战机
      if (c.absorbDelay != null && c.absorbDelay > 0) {
        c.absorbDelay -= dt;   // 下坠阶段：保持初始 vx/vy 四散飘落
      } else if (player.alive) {
        const dx = player.x - c.x;
        const dy = player.y - c.y;
        const dist = Math.hypot(dx, dy);
        const bossPull = c.absorbDelay != null;   // 下坠结束后强制吸收
        if (dist > 1 && (bossPull || dist < magR)) {
          const pull = bossPull ? (c.pullSpeed || 1150) : 900 + 700 * (1 - dist / magR);
          c.vx = (dx / dist) * pull;
          c.vy = (dy / dist) * pull;
          // 近距直吸：本帧位移即可抵达玩家时直接结算（高速拉取一帧可能越过拾取窗口）
          if (bossPull && dist <= pull * dt + 8) {
            state.score += c.val;
            spawnParticles(c.x, c.y, '#9be7ff', 5, 120);
            crystals.splice(i, 1);
            continue;
          }
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

  // BOSS 警报触发：场上所有水晶 / 道具进入「快速吸收」——0.35s 飘落后无视距离高速飞向战机
  // （拉速 1800 > BOSS 阵亡吸收的 1150）；拾取判定照常逐个结算，不再瞬间清空全场
  function collectAllItems() {
    for (const c of crystals) {
      if (c.absorbDelay == null) c.absorbDelay = 0.35;   // 飘落阶段：保留可感知的「飞向战机」过程
      c.pullSpeed = 1800;
    }
    for (const p of powerups) {
      if (p.absorbDelay == null) p.absorbDelay = 0.35;
      p.pullSpeed = 1800;
    }
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

  // 护盾解除冲击波：从玩家位置迅速扩大到全屏，同时渐隐（视觉上解释为何清除全场敌弹）
  const shieldBurst = { active: false, t: 0, duration: 0.65, x: 0, y: 0 };

  // 暴走冲击波：粉橙双环自机体扩散（暴走触发的醒目特效，不遮挡画面）
  const berserkBurst = { active: false, t: 0, duration: 0.7, x: 0, y: 0, big: false };

  // 高能爆弹火圈（测试模式）：自场地中心急速扩大至全场的橙黄色火环
  const bombBurst = { active: false, t: 0, duration: 0.55 };

  export {
    enemyDamageMul, updateBullets, POWERUP_MAGNET_RADIUS, spawnPowerup, applyPowerupPickup, updatePowerups,
    updateCrystals, collectAllItems, updateParticles, shieldBurst, berserkBurst, bombBurst,
  };