// 08-entities：子弹 / 道具 / 水晶 / 粒子更新 + 全屏特效状态（state.flash / 冲击波）

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：04-spawn(1 名) 05-boss(1 名) 06-enemy(1 名) 07-player(4 名) 10-draw-world(3 名) 12-ui(3 名) 14-main(9 名)
  // 本文件写共享状态（state/bossFlow/levelFlow 属性赋值；新增属性先在 02-core 归域声明）：
  //   state.{bombs, score}
  //
  import { BAOLING, BAOLING_G, BOSS_LOWFIRE_BONUS, BULWARK, CANVAS_H, CANVAS_W, CAPITAL_DESCEND_DR, CAPITAL_HIGHFIRE_DR, CHAOS_SMALL_DMG_MUL, DARKHAND, FASHI_MATRIX, HANSHUANG, HARBINGER, JIAOXIANG, MAX_BOMBS, PIERCE_WEAKEN_MUL, PILOTS, PLAYER_CFG, POPIAN_VULN_LV1, POPIAN_VULN_LV2, SHIELD_DURATION, STORM, STORM2, STORM_SHIP, UNREAL, WAVE_POEM, diffMods, enemyDmgMul, enemyGrade, hasPilot, isRealme, isPoem, xiayongBarAbsorb, xiayongHornDmgMul } from './01-config.js';
  import { bossEntranceActive, bossFlow, clamp, dashKillFx, dhGuardActive, enemyOnScreen, crystals, eBullets, enemies, hasteMul, pBullets, particles, phaseFx, player, powerups, rand, rewardOutMul, spawnParticles, state, trailGhosts } from './02-core.js';
  import { yu4AuraMul } from './04-spawn.js';
  import { killEnemy } from './06-enemy.js';
  import { armorSkillGain, currentBombCap, kingDmgBonusMul, noteGachaStone, princeStormKillGain } from './07-player.js';
  import { bulwarkActive, clipAgainstShield, damagePlayer, pickupBerserk, pickupKit, shieldReflectHit, shieldSweepHit } from './07-player.js';
  import { achvNoteGiantCrystal, achvNoteLanxinAbsorb, achvNotePickup, achvWingmanBlock, achvZidianHit } from './02-achievements.js';


  // ---------- 敌人受伤修正链（主武器弹幕 / 僚机弹幕 / 空间斩击共用）----------
  // 返回对敌人 e 的伤害倍率；isWing 标识该伤害是否来自僚机弹幕；
  // hitX/hitY = 弹体命中点坐标（可选——空间斩击等大范围伤害不传，不判部位）。
  function enemyDamageMul(e, isWing, capVuln, hitX, hitY) {
    let mul = 1;
    // 大无垠之王：BOSS 战累积的造成伤害提升（怒意蔓延，见 07-player updatePilotStatus 累积 / 06-enemy killEnemy 清算）
    mul *= kingDmgBonusMul();
    // 副武器·极夜流光：对 4类敌人（主力舰 / 法术阵列）增伤（capVuln 取自弹体 b.capVuln，注册表 1.5）
    if (capVuln && (e.type === 'capital' || e.type === 'fashiArray')) mul *= capVuln;
    // 御4防御光环：光环内敌人受到的非真实伤害 -30%（高能爆弹为真实伤害，在 useBomb 直接结算、不经过此处）
    mul *= yu4AuraMul(e);
    // 暴鸰 / 暴鸰·G / 虚幻：玩家处于其炸弹爆圈内时增伤 35%（无论炸弹是否已投出；暴鸰·G 爆圈半径 ×1.3）
    if ((e.type === 'baoling' || e.type === 'baolingG' || e.type === 'unreal') && player.alive) {
      const BLC = e.type === 'baolingG' ? BAOLING_G : e.type === 'unreal' ? UNREAL : BAOLING;
      if (Math.hypot(player.x - e.x, player.y - e.y) <= BLC.blastR) mul *= 1 + BLC.vuln;
    }
    if (e.type === 'harbinger' && isWing) mul *= (1 - HARBINGER.wingDR);   // 炮火先兆者：僚机弹幕减伤 25%
    if (e.type === 'tornado') {
      // 风团：主武器减伤 50%、僚机伤害 +150%（弱点：僚机火力）；真我：僚机易伤额外 +150%（加算，不乘算）
      mul *= isWing
        ? (1 + STORM.tornadoWingVuln + (isRealme() ? STORM_SHIP.s2.wingVulnAdd : 0))
        : (1 - STORM.tornadoMainDR);
    }
    // 4类主力舰：俯冲减速前（速度未明显衰减）20% 减伤；减速/展开/悬停后恢复常规
    if (e.type === 'capital' && !e.arrived && (e.hoverY - e.y) >= 90) mul *= (1 - CAPITAL_DESCEND_DR);
    if (e.type === 'capital' && player.weapon >= 4) mul *= (1 - CAPITAL_HIGHFIRE_DR);
    else if (e.type === 'boss' && player.weapon === 1) mul *= (1 + BOSS_LOWFIRE_BONUS);
    // 破片：火力 Lv1 / Lv2 时受到 30% / 10% 易伤（低火力补偿，主武器与僚机弹均生效；高能爆弹为真实伤害不加成）
    if (e.type === 'popian' && player.weapon <= 2) mul *= 1 + (player.weapon === 1 ? POPIAN_VULN_LV1 : POPIAN_VULN_LV2);
    // 法术矩阵：受到来自主战机（非僚机）的伤害 -30%（僚机弹幕正常）
    if (e.type === 'fashiMatrix' && !isWing) mul *= (1 - FASHI_MATRIX.mainDR);
    // BOSS 受到暴走（Lv5）伤害减免：风暴编织者专属 -30%；真我难度全体 BOSS -10%——
    // 同时存在多个暴走减免修正时取最高（不叠加）。主炮/僚机弹幕/空间斩击均生效；高能爆弹为真实伤害不经此处
    if (e.type === 'boss' && player.weapon >= 5) {
      let dr = e.bossId === 'storm2' ? STORM2.berserkDR : 0;
      const mod = diffMods().bossBerserkDR || 0;
      if (mod > dr) dr = mod;
      if (dr > 0) mul *= (1 - dr);
    }
    // 暴风之眼（真我）：技能4 漩涡弹幕持续期间自身减伤 25%（主武器/僚机/斩击均生效；高能爆弹真实伤害不经此处）
    if (e.type === 'boss' && e.bossId === 'storm' && isRealme() && e.skill && e.skill.id === 3) {
      mul *= (1 - STORM_SHIP.s4.dr);
    }
    // 焦香螺旋桨：登场 2s 内受到的伤害 -30%（入场保护，主武器与僚机弹幕均生效）
    if (e.type === 'jiaoxiang' && (e.auraT || 0) < JIAOXIANG.entryDRT) mul *= (1 - JIAOXIANG.entryDR);
    // 寒霜：入场未减速阶段（距落点 ≥90px、未开始减速）受到的伤害 -20%（主武器与僚机弹幕均生效）
    if (e.type === 'hanshuang' && e.hsNoDecel) mul *= (1 - HANSHUANG.entryDR);
    // 黑暗之手：场上存在任意一名连携精英（dhLink，80/60/40/20% 血量阈值召唤）时受到的普通伤害 -70%
    //（主武器/僚机弹幕/斩击；高能爆弹/绷绷炸弹为真实伤害不受此减免、连携精英亦同受爆弹伤害——2026-10-04 用户定稿；见 01-config DARKHAND.summon）
    if (e.type === 'boss' && e.bossId === 'darkhand' && dhGuardActive()) mul *= 1 - DARKHAND.summon.guardDR;
    // 铜皮夏勇·牛角减伤（被动常驻，2026-10-03 用户定稿）：命中点落在两翼折角（牛角）头部时 ×0.5——
    // 主炮/僚机弹幕传弹体坐标判定；空间斩击等大范围伤害不传命中点、不判部位（见 01-config xiayongHornDmgMul）
    mul *= xiayongHornDmgMul(e, hitX, hitY);
    return mul;
  }

  // ---------- 子弹 ----------
  function updateBullets(dt) {
  // 玩家屏障（青时炮艇支援弹）：持续 10s，末 1s 线性衰减至 0（可见的快速消散）；
  // 衰减按 Math.min 收敛——屏障被打掉的量不回填（衰减公式只封顶、不补偿），重复命中刷新由支援弹命中处重置
  if (player.barrierT > 0) {
    player.barrierT -= dt;
    player.barrier = Math.min(player.barrier,
      player.barrierT >= 1 ? player.barrierMax : player.barrierMax * Math.max(0, player.barrierT));
    if (player.barrierT <= 0) { player.barrier = 0; player.barrierMax = 0; }
  }
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
    // 许凯狗冲刺白光冲击推进：寿命尽即移除（生成于 14-main 冲刺秒杀循环）
    for (let i = dashKillFx.length - 1; i >= 0; i--) {
      dashKillFx[i].t += dt;
      if (dashKillFx[i].t >= dashKillFx[i].max) dashKillFx.splice(i, 1);
    }
    // 斗志昂扬增益：期间我方（含僚机）弹道飞行速度翻倍 —— 作用于所有在飞子弹，增益结束即恢复常速
    const hm = hasteMul();
    for (let i = pBullets.length - 1; i >= 0; i--) {
      const b = pBullets[i];
      b.x += b.vx * hm * dt; b.y += b.vy * hm * dt;
      // 沿飞行方向加速至上限（友方大风暴风弹：暴风之眼技能6 同款风条弹道；其他我方弹无此字段不受影响）
      if (b.accel) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const ns = Math.min(b.maxSpeed || Infinity, sp + b.accel * dt);
        b.vx *= ns / sp; b.vy *= ns / sp;
      }
      // 副武器·无界飞剑（装备陵落驾驶员时）的微弱追踪：朝最近的合格敌人限角速度转向（turnRate rad/s），
      // 无目标时保持直飞。索敌规则与主炮/僚机一致：屏幕外 / 虚化 / 濒死 / 登场虚化 BOSS 不索敌
      // （极夜流光已改为"发射前标记目标位置、直射不转向"，不再走此逻辑）
      if (b.homing) {
        let tgt = null, bestD = Infinity;
        for (const e of enemies) {
          if (!enemyOnScreen(e) || e.phase > 0 || e.dying) continue;
          if (e.type === 'boss' && bossEntranceActive()) continue;
          const dx = e.x - b.x, dy = e.y - b.y, d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; tgt = e; }
        }
        if (tgt) {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const cur = Math.atan2(b.vy, b.vx), want = Math.atan2(tgt.y - b.y, tgt.x - b.x);
          let diff = want - cur;
          if (diff > Math.PI) diff -= Math.PI * 2;
          else if (diff < -Math.PI) diff += Math.PI * 2;
          const maxTurn = b.turnRate * dt;
          const na = cur + clamp(diff, -maxTurn, maxTurn);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      // 风条生长：刚射出时很短，沿飞行方向随时间迅速长到全长
      if (b.lenTarget && b.len < b.lenTarget) b.len = Math.min(b.lenTarget, b.len + (b.growRate || 130) * dt);
      // 极夜流光出手生长：初始光束长 len0（40），以二次缓动（大加速度）在 growDur 内长到全长 lenFull
      if (b.growDur != null && b.growT < b.growDur) {
        b.growT += dt;
        const gp = clamp(b.growT / b.growDur, 0, 1);
        b.len = b.len0 + (b.lenFull - b.len0) * gp * gp;
      }
      // 极夜流光暴走：光束上金红光芒流动伴随的少量粒子撒落
      if (b.laserBolt && b.berserk && Math.random() < 0.25) {
        spawnParticles(b.x + rand(-4, 4), b.y + rand(-4, 4), Math.random() < 0.5 ? '#ffb060' : '#ff7a45', 1, 30);
      }
      // 警报 / BOSS 登场动画：飞行中的飞剑弹快速消散（常规位移照常，提前渐隐移除并停止命中）
      if (b.sword && b.dieT == null && (bossFlow.stage === 'warn' || bossEntranceActive())) b.dieT = 0.3;
      if (b.dieT != null) {
        b.dieT -= dt;
        if (b.dieT <= 0) pBullets.splice(i, 1);
        continue;   // 消散期间：跳过索敌与命中结算（常规位移已在上方完成）
      }
      // 出界移除：友方大风暴风弹可斜向/朝下方 240° 扇形内飞行，横向与下边界出界一并移除
      if (b.y < -10 || b.y > CANVAS_H + 10 || b.x < -20 || b.x > CANVAS_W + 20) { pBullets.splice(i, 1); continue; }
      // 消散中的飞剑弹不再命中敌人
      if (b.dieT != null) continue;

      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (!enemyOnScreen(e)) continue;   // 屏幕外敌人（尚未入场 / 已离场 / 侧翼界外）不受我方子弹伤害
        if (b.lastHit === e) continue;   // 穿透弹防同机重复结算（不再陵落飞剑：刚穿过的机体下一帧仍重叠）
        if (e.phase > 0) continue;   // 虚化：炮弹穿过护盾，可打到后面的敌人
        if (e.dying) continue;   // 渐隐消逝中的暴风之眼：死亡演出期间不再受击
        if (e.type === 'boss' && bossEntranceActive()) continue;   // BOSS 登场虚化：警报/入场动画期间射弹穿透不结算
        const hsE = (e.type === 'hanshuang' && e.hsNoDecel) ? HANSHUANG.entryHitScale : 1;   // 寒霜入场未减速：判定箱略缩
        if (Math.abs(b.x - e.x) < e.w / 2 * hsE + b.r && Math.abs(b.y - e.y) < e.h / 2 * hsE + b.r) {
          // 青时炮艇召唤体次数盾：单次伤害抵御一次（耗 1 层、弹体销毁——穿透类弹同样被挡）；
          // 群星允诺暴走弹（僚机 b.wing + b.glow，守愿者 oval 弹除外）无视次数盾直接伤害
          if ((e.chargeShield || 0) > 0 && !(b.wing && b.glow && !b.oval)) {
            e.chargeShield--;
            spawnParticles(b.x, b.y, '#ffffff', 6, 150);
            pBullets.splice(i, 1);
            break;
          }
          // 4类主力舰：对玩家 Lv4 / 暴走(Lv5) 火力减伤 15%；玩家 Lv1 时对 BOSS 武器伤害 +20%
          // 全部敌人减伤/易伤修正集中在 enemyDamageMul（与空间斩击共用）
          // mainPierce 穿透弱化：无衰减率弹（副武器·极夜流光激光）穿透后伤害减半（b.weakened 标记）
          // 混乱将至主炮（mainShot，2026-10-02 用户定稿：取消穿透改小怪特化）：对非 BOSS / 非 4S（四精英）敌人伤害 +80%
          // 奖励道具·哦哦！抽卡！：演出期间我方输出 -60%（主武器/僚机/副武器共用乘区）
          // 奖励道具·不再陵落：螺旋飞剑射出方向在水平线以下（lowArc）——对 BOSS 仅 50% 伤害
          let dmg = b.dmg * (b.weakened ? PIERCE_WEAKEN_MUL : 1) * enemyDamageMul(e, b.wing, b.capVuln)
            * (b.mainShot && e.type !== 'boss' && enemyGrade(e.type) !== '4S' ? CHAOS_SMALL_DMG_MUL : 1)
            * rewardOutMul();
          if (b.lowArc && e.type === 'boss') dmg *= 0.5;
          if (e.barrier > 0) {
            const abs = Math.min(e.barrier, dmg);
            e.barrier -= abs; dmg -= abs;   // 屏障优先吸收（dmg 需可变：吸收后余量继续扣血）
          }
          // 铜皮夏勇·屏障（技能3，2026-10-03 用户定稿）：常规直击伤害先被红色护盾吸收（秒杀类/爆弹等
          // 真实伤害不经此处；破盾检测在 06-enemy advanceEliteMinions）
          e.hp -= xiayongBarAbsorb(e, dmg * (e.type === 'tornado' ? (b.tornadoHits || 1) : 1));   // 守愿者弹对大型龙卷（暴风之眼召唤的暴风）判定两次伤害
          spawnParticles(b.x, b.y, '#ffffff', 4, 120);
          // 守愿者弹：卫护飞船（escort）无限穿透——不销毁、不消耗次数；其余 1类（side / prolifera）穿透一次（每发限一次）
          // mainPierce 结算（副武器激光弹 / 无界飞剑·暴走概率穿透 / 不再陵落螺旋飞剑）：对非 BOSS / 4类（主力舰・法术阵列）敌人穿透，
          // 不再陵落螺旋飞剑（mainPierce 2 + pierceDmgMul 自带衰减率）：每次穿透伤害 -20%（100% → 80% → 64%，
          // 衰减直接乘进 b.dmg，并记 lastHit 防同机重复结算）；无 pierceDmgMul 的弹穿透后伤害减半（b.weakened）
          let pierce = false;
          if (b.pierce != null && e.type === 'escort') pierce = true;
          else if (b.pierce > 0 && (e.type === 'side' || e.type === 'prolifera')) { pierce = true; b.pierce--; }
          else if (b.mainPierce > 0 && e.type !== 'boss' && e.type !== 'capital' && e.type !== 'fashiArray') {
            pierce = true; b.mainPierce--;
            if (b.pierceDmgMul != null) { b.dmg *= b.pierceDmgMul; b.lastHit = e; }
            else b.weakened = true;
          }
          if (!pierce) pBullets.splice(i, 1);
          if (e.hp <= 0) {
            if (b.princeStorm) princeStormKillGain(e);   // 天秀：风暴风弹击杀 → 量表立刻充能
            killEnemy(j);
          }
          break;
        }
      }
    }

    for (let i = eBullets.length - 1; i >= 0; i--) {
      const b = eBullets[i];
      // 战机陨落定格（2026-10-02 用户报 bug）：失败结算（mode='gameover'）后残留敌方弹幕整体冻结——
      // 位置 / 巨大蛋挞自旋 / 弧线 / 寿命全部停止推进，战场画面定格。根因：14-main idle/gameover 分支的
      // updateBullets 演示弹道共用路径会把场上残留敌弹（蛋挞）继续推下屏
      if (state.mode === 'gameover') break;
      // 蛋挞被依的镰刀斩中（2026-10-04 用户定稿）：颤动 hitShudderT → 碎裂（迸散粒子一次）→ 渐隐 hitFadeT → 移除；
      // 全程冻结移动 / 自旋 / 碰撞（continue 跳过本帧全部推进；颤动抖动与渐隐 alpha 由渲染端按 tartHitT 取值）
      if (b.tart && b.tartHitT != null) {
        b.tartHitT += dt;
        if (b.tartHitT < DARKHAND.s3.hitShudderT) continue;   // 颤动期：位置冻结
        if (!b.tartShattered) {   // 碎裂瞬间：迸散蛋挞碎屑（皮 + 芯双色）
          b.tartShattered = true;
          spawnParticles(b.x, b.y, '#c9a15a', 10, 200);
          spawnParticles(b.x, b.y, '#5a2d3a', 8, 240);
        }
        if (b.tartHitT < DARKHAND.s3.hitShudderT + DARKHAND.s3.hitFadeT) continue;   // 渐隐期
        eBullets.splice(i, 1);
        continue;
      }
      if (b.ax) b.vx += b.ax * dt;   // 弧线弹（1/4 双曲线弹道）
      if (b.tartSpin != null) {
        b.tartSpin += (b.tartSpinSpd || 0) * dt;   // 巨大蛋挞（黑暗之手技能3）：持续自旋相位（渲染用，见 10-draw-world）
        // 出生生长（2026-10-03 用户定稿）：从很小（tartFrom 缩放）easeOutCubic 平滑放大到全尺寸，
        // 判定半径同步缩放（b.r = tartR0 × 缩放——出生瞬间几乎无威胁、碰撞公平）；渲染黑紫剪影见 10-draw-world
        if (b.tartGrowDur) {
          b.tartGrow = Math.min(b.tartGrow + dt, b.tartGrowDur);
          const gp = b.tartGrow / b.tartGrowDur, eo = 1 - Math.pow(1 - gp, 3);
          b.r = b.tartR0 * (b.tartFrom + (1 - b.tartFrom) * eo);
        }
      }
      if (b.fadeIn > 0) b.fadeIn -= dt;   // 渐显剩余（技能5 暗影导弹雨：出现完全透明快速渐显，渲染端按 fadeIn0 比例取 alpha）
      // 黑暗之手技能5 抛物导弹（真我/诗篇，2026-10-03 用户定稿）：速度剖面每帧由解析式重算（不累加、无漂移）——
      // 垂直 = 向上初速 vy0 + 恒定向下重力 ay（先上升再下坠）；水平 = S 剖面 vx = A·t·(1-t/T)（线性变化的水平
      // 加速度 ax = A(1-2t/T)，速度先增后减、抵达 50% 屏高时刻 T 精确归 0 并保持；T/A 由 05-boss 发射时解出）
      if (b.dhMissile) {
        const m = b.dhMissile;
        m.t += dt;
        const tt = Math.min(m.t, m.T);
        b.vx = m.A * tt * (1 - tt / m.T);
        b.vy = m.vy0 + m.ay * m.t;
      }
      // 黑暗之手技能2 涟漪环减速（2026-10-03 用户定稿）：每秒线性减速 decay（该环初速的 0~30%，环级随机、
      // 同环所有弹一致），方向不变、衰减到 spdFloor 停（见 01-config DARKHAND.s2）
      if (b.decay) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const ns = Math.max(DARKHAND.s2.spdFloor, sp - b.decay * dt);
        b.vx *= ns / sp; b.vy *= ns / sp;
      }
      // 旋转弹（真我·旧日之歌技能1 旋转弧线流）：速度方向按角速度逐帧旋转——
      // 当前指向水平以上（屏幕坐标 vy<0）时角速度大幅增加、水平以下较为减小（倍率由弹体自带，缺省见下）
      if (b.angVel) {
        const w = b.angVel * (b.vy < 0 ? (b.spinUp || 2.8) : (b.spinDown || 0.55));
        const rc = Math.cos(w * dt), rs = Math.sin(w * dt);
        const nvx = b.vx * rc - b.vy * rs, nvy = b.vx * rs + b.vy * rc;
        b.vx = nvx; b.vy = nvy;
      }
      // 寿命上限（旋转弧线弹可能长期滞留场上）：到期进入消散期——快速减速 + 渐隐，
      // 消散开始瞬间迸出一次同色粒子；自然出界的子弹不经过此流程（无消失动画）
      if (b.life != null) {
        if (b.fadeT == null) {
          b.life -= dt;
          if (b.life <= 0) {
            b.fadeT = b.lifeFade != null ? b.lifeFade : 0.28;
            b.life = 0;
            spawnParticles(b.x, b.y, b.color || '#a5ffd6', 8, 130);
          }
        } else {
          b.fadeT -= dt;
          const decay = Math.exp(-8 * dt);
          b.vx *= decay; b.vy *= decay;
          if (b.fadeT <= 0) { eBullets.splice(i, 1); continue; }
        }
      }
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
      // 分裂弹：飞行一段距离→短时间内减速（可选 frac：剩余速度比例 ≤ frac 即提前分裂，"快没速度就炸"不必减为 0）→分裂成 N 个小子弹（互相等角）
      if (b.split) {
        const s = b.split;
        if (!s.triggered) {
          b.traveled += Math.hypot(b.vx, b.vy) * dt;
          if (b.traveled >= s.dist) {
            s.triggered = true;
            s.baseSpeed = Math.hypot(b.vx, b.vy);   // 记录触发时速度，用于平滑减速
            s.decay = s.decayDur || 0.3;            // 减速时长（默认 0.3s；橙焰巨型弹 0.7s"减速一段时间后才分裂"）
            s.stopT = s.decay;
          }
        } else {
          s.stopT -= dt;
          const f = Math.max(0, s.stopT / s.decay);   // 1→0 线性衰减
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > 0.001) { const ns = s.baseSpeed * f; b.vx = b.vx / sp * ns; b.vy = b.vy / sp * ns; }
          if (s.stopT <= s.decay * (1 - (s.frac || 0))) {
            const base = Math.random() * Math.PI * 2;   // 随机基准方向，各子弹间隔 360/N
            for (let k = 0; k < s.count; k++) {
              const ang = base + k * (Math.PI * 2 / s.count);
              eBullets.push({
                x: b.x, y: b.y,
                vx: Math.cos(ang) * s.speed, vy: Math.sin(ang) * s.speed,
                ax: 0, accel: 0, maxSpeed: 0,
                r: s.r, len: s.len || 0, dmg: b.dmg, color: s.color, split: null, traveled: 0,
                grad: !!s.grad,   // 径向渐变圆弹（白核→主色→暗橙红边，见 10-draw-world）
              });
            }
            spawnParticles(b.x, b.y, s.color, 12, 180);
            eBullets.splice(i, 1); continue;
          }
        }
      }
      // 蛇行弹（紫晶 DNA 双螺旋）：朝向绕出射基准角正弦摆动、恒速前进——左右两束相位相反，全程持续交绕
      if (b.weave) {
        b.age += dt;
        const wA = b.baseAng + b.weave.amp * Math.sin(b.weave.om * b.age + b.weave.ph);
        const wS = Math.hypot(b.vx, b.vy) || 1;
        b.vx = Math.cos(wA) * wS; b.vy = Math.sin(wA) * wS;
      }
      // 橙旋侧翼艇环绕弹：锚定宿主敌机公转（位置每帧由宿主实时推导，不自行位移）；
      // 宿主被击坠 / 离场（已不在 enemies 数组）→ 环绕弹立刻消失
      if (b.orbit) {
        const ow = b.orbit.owner;
        if (!ow || enemies.indexOf(ow) < 0) { eBullets.splice(i, 1); continue; }
        b.orbit.ang += b.orbit.om * dt;
        b.x = ow.x + Math.cos(b.orbit.ang) * b.orbit.dist;
        b.y = ow.y + Math.sin(b.orbit.ang) * b.orbit.dist;
      }
      // 风暴编织者雷环子弹：停留期原地不动（BOSS 移走也不跟随），到时向对应方向爆开（高初速 → 减速至巡航）
      else if (b.holdT != null && b.holdT > 0) {
        b.holdT -= dt;
        if (b.holdT <= 0) { b.vx = Math.cos(b.burstAng) * b.v0; b.vy = Math.sin(b.burstAng) * b.v0; }
      } else if (!b.shieldBlocked) {
        // 奖励道具·寒霜发生器：弹道位于我方力场（160px）内时位移流速 ×0.4（-60%，2026-10-01 统一增强）
        const ffd = state.frostField;
        const fm = (ffd && Math.hypot(b.x - ffd.x, b.y - ffd.y) <= ffd.r) ? 0.4 : 1;
        b.x += b.vx * fm * dt; b.y += b.vy * fm * dt;
      }
      // 反弹光束（技能3）/ 技能6 暗黑子弹：触左右边界反弹，实际弹道呈"<"形折线；
      // bounceMax > 0 时限制反弹次数（暗黑子弹每颗最多 3 次），达到上限后不再反弹、直飞出屏移除
      if (b.bounceX && ((b.x < b.r && b.vx < 0) || (b.x > CANVAS_W - b.r && b.vx > 0))) {
        b.vx *= -1;
        b.x = clamp(b.x, b.r, CANVAS_W - b.r);
        if (b.bounceMax && ++b.bounceN >= b.bounceMax) b.bounceX = false;
      }
      // 折线光束（技能3）：记录头部轨迹，光束沿轨迹从 0 增长至全长（b.len）；
      // 转折处轨迹自然弯折——头部转向后旧段仍沿原方向保留，随尾部裁剪逐段消失
      if (b.beamTrail) {
        if (!b.path) { b.path = [{ x: b.x, y: b.y }]; b.pathLen = 0; }
        const last = b.path[b.path.length - 1];
        const dseg = Math.hypot(b.x - last.x, b.y - last.y);
        if (dseg > 1) { b.path.push({ x: b.x, y: b.y }); b.pathLen += dseg; }
        while (b.path.length > 2 && b.pathLen > b.len) {
          const segLen = Math.hypot(b.path[1].x - b.path[0].x, b.path[1].y - b.path[0].y) || 1;
          if (b.pathLen - segLen <= 0) break;
          b.pathLen -= segLen;
          b.path.shift();
        }
      }
      // 减速子弹（雷环爆开）：初速较高，线性减速至巡航速度（不低于巡航）
      if (b.decelTo != null) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        if (sp > b.decelTo) {
          const ns = Math.max(b.decelTo, sp - (b.decelRate || 300) * dt);
          b.vx *= ns / sp; b.vy *= ns / sp;
        }
      }
      if (b.trail) {
        // 轨迹残影：记录帧间线段（缺省暗紫；b.trailCol 自定义色 + b.trailLife 短拖尾；
        // b.trailR 拖尾显示半径——大子弹等大弹径弹用较小半径绘制更纤细的锥形尾，缺省同弹体半径）
        if (b.px != null) {
          trailGhosts.push({
            x1: b.px, y1: b.py, x2: b.x, y2: b.y,
            life: b.trailLife || 1.0, max: b.trailLife || 1.0,
            r: b.trailR || b.r,
            seed: Math.random() * 10, spark: Math.random() < 0.2,
            col: b.trailCol || null,
          });
        }
        b.px = b.x; b.py = b.y;
      }
      // 出界移除：折线光束（beamTrail，技能3 "<"弹）的可见轨迹自头部向后延伸 b.len——
      // 头部出界后整条"<"轨迹继续滑出屏幕，直至尾端也越过边界才消失（不再头部一出界就整条闪没）
      const trailPad = b.beamTrail ? (b.len || 0) : 0;
      // 蛋挞弹弹体完全出界才移除（默认 pad 会在弹体半截时消失）：巨大蛋挞按判定半径、登场长条蛋挞按半长+半径
      const bigPad = b.tart ? (b.len ? b.len / 2 + b.r : b.r) : 0;
      if (b.y > CANVAS_H + 20 + trailPad + bigPad || b.y < -40 - trailPad - bigPad || b.x < -20 - bigPad || b.x > CANVAS_W + 20 + bigPad) {
        eBullets.splice(i, 1); continue;
      }
      // 青时炮艇支援弹：命中敌机 → 施加 200 屏障；命中玩家机身（全机身盒判定、无需核心）→ 加屏障 24（诗篇 28）持续 10s；对双方均无伤害
      if (b.support) {
        let hit = false;
        if (player.alive && Math.abs(b.x - player.x) < player.w / 2 + b.r && Math.abs(b.y - player.y) < player.h / 2 + b.r) {
          player.barrierMax = isPoem() ? 28 : 24;
          player.barrier = player.barrierMax; player.barrierT = 10;
          spawnParticles(b.x, b.y, '#9ff0e0', 10, 160);
          hit = true;
        }
        if (!hit) for (let j = enemies.length - 1; j >= 0; j--) {
          const en = enemies[j];
          if (en === b.owner || !enemyOnScreen(en) || en.dying) continue;
          if (Math.abs(b.x - en.x) < en.w / 2 + b.r && Math.abs(b.y - en.y) < en.h / 2 + b.r) {
            en.barrierMax = 200; en.barrier = 200;
            spawnParticles(b.x, b.y, '#9ff0e0', 10, 160);
            hit = true; break;
          }
        }
        if (hit) eBullets.splice(i, 1);
        continue;
      }
      // 守愿者白盾拦截（位于玩家量子护盾之前：盾在主机前侧，直射弹先碰白盾）；仅非导弹直射弹生效；
      // 蛋挞弹（b.tart：巨大蛋挞 tartSpin）豁免——白盾对其无任何影响（不截断不吸收，2026-10-04 二次定稿恢复原设定）
      if (bulwarkActive() && !b.tart) {
        if (b.laser) {
          // 激光：截断裁切——不 splice，继续按原逻辑生长/推进；本帧计算 clipLen（无相交置 null），渲染与命中判定按此截断
          //   pad 含弹体半径 + 盾厚一半（零厚度轴线会让擦盾弧端点的激光漏过）；
          //   粘滞阻挡：一旦被盾咬住（shieldHold 记录僚机与接触点本地偏移），即使追踪旋转 / 僚机随玩家闪避
          //   导致某帧轴线与盾折线失去交点，也按“锚定在僚机上的接触点”继续截断——被挡住的激光不会中途漏出盾外
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const ux = b.vx / sp, uy = b.vy / sp;
          const clip = clipAgainstShield(b.x, b.y, ux, uy, b.len, b.r + BULWARK.thickness / 2 * BULWARK.scale);
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
        } else if (b.beamTrail) {
          // 折线光束（技能3"<"弹）撞盾：头部钉在盾面被截断，尾端继续按原速前进逐帧"磨短"——
          //   光束整体缩向盾面后消散（修复：此前走普通弹吸收分支，整条"<"光束瞬间消失）；
          //   盾判定按弹体半径（b.r）：与其他射弹同一套白盾几何，无额外收窄
          if (!b.shieldBlocked) {
            const hit = shieldSweepHit(b.x - b.vx * dt, b.y - b.vy * dt, b.x, b.y, b.r);
            if (hit) {
              b.shieldBlocked = true; b.sbX = hit.x; b.sbY = hit.y;
              const over = Math.hypot(b.x - hit.x, b.y - hit.y);   // 本帧越过盾面的距离：从轨迹末端回退
              if (b.path && b.path.length > 1 && b.pathLen > over) b.pathLen -= over;
              b.x = hit.x; b.y = hit.y;
              if (b.path && b.path.length) b.path[b.path.length - 1] = { x: hit.x, y: hit.y };
            }
          }
          if (b.shieldBlocked) {
            const step = Math.hypot(b.vx, b.vy) * dt;
            const target = Math.max(0, b.pathLen - step);
            while (b.path.length > 1 && b.pathLen > target) {
              const segLen = Math.hypot(b.path[1].x - b.path[0].x, b.path[1].y - b.path[0].y) || 1;
              if (b.pathLen - segLen < target) break;
              b.pathLen -= segLen; b.path.shift();
            }
            if (b.path.length > 1 && b.pathLen > target) {
              const segLen = b.pathLen - target;   // 尾端点部分裁剪：精确磨到 target 长度
              const dx = b.path[1].x - b.path[0].x, dy = b.path[1].y - b.path[0].y;
              const L = Math.hypot(dx, dy) || 1;
              b.path[0] = { x: b.path[1].x - dx / L * segLen, y: b.path[1].y - dy / L * segLen };
              b.pathLen = target;
            }
            if (Math.random() < 0.5) spawnParticles(b.sbX, b.sbY, '#eaf6ff', 2, 90);   // 盾面节流迸火花
            if (b.pathLen <= 1 || b.path.length < 2) { eBullets.splice(i, 1); continue; }   // 被盾吃完
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
          const clip = clipAgainstShield(tx, ty, ux, uy, b.len, b.r + BULWARK.thickness / 2 * BULWARK.scale);
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
        } else if (b.swRef) {
          // 三类·特殊射弹（旧日之歌暗黑射弹，注册表见 01-config BULWARK 注释）：首次触盾按入射夹角镜像反弹
          //   （反射角=入射角，非原路弹回）；可墙壁反弹者（bounceX）反弹后失去该能力；
          //   同一射弹仅反弹一次，再次触盾白盾无任何效果（直接穿过、伤害不减）
          if (!b.swRefDone) {
            const pxp = b.x - b.vx * dt, pyp = b.y - b.vy * dt;
            const hit = shieldReflectHit(pxp, pyp, b.x, b.y, b.r);
            if (hit) {
              const vn = b.vx * hit.nx + b.vy * hit.ny;
              b.vx -= 2 * vn * hit.nx; b.vy -= 2 * vn * hit.ny;   // 关于盾面法线镜像反射
              b.swRefDone = true;
              b.bounceX = false;   // 反弹后失去墙壁反弹能力
              b.x = hit.x + b.vx * dt; b.y = hit.y + b.vy * dt;   // 置于盾面并沿反射方向推进，避免原地重复触盾
              spawnParticles(hit.x, hit.y, '#eaf6ff', 8, 170);
              spawnParticles(hit.x, hit.y, '#c8b0ff', 5, 130);
            }
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
            achvWingmanBlock();   // 成就：守愿加护——白盾挡弹计数
            eBullets.splice(i, 1); continue;
          }
        }
      }
      // 护盾加持：碰到护盾气泡的敌弹直接消解（激光穿透护盾，仅尾端出界才消失）
      // 七日澜心水晶护盾：同样消解气泡内敌弹（粉色迸散）——成就「云心」按结晶护盾期间的消解数计数
      if (!b.laser && player.alive &&
          Math.hypot(b.x - player.x, b.y - player.y) < 36 + b.r &&
          (player.shield > 0 || player.crystalShield > 0)) {
        if (player.crystalShield > 0) achvNoteLanxinAbsorb();
        spawnParticles(b.x, b.y, player.crystalShield > 0 ? '#FFC0CB' : '#6fe3ff', 6, 140);
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
        } else if (b.path && b.path.length > 1) {
          // 折线光束（技能3）：判定点到头部轨迹折线段集的最近距离
          const py = player.y + PLAYER_CFG.hitOffsetY;
          let best = Infinity;
          for (let k = 0; k < b.path.length - 1; k++) {
            const ax = b.path[k].x, ay = b.path[k].y;
            const dx = b.path[k + 1].x - ax, dy = b.path[k + 1].y - ay;
            const L2 = dx * dx + dy * dy || 1;
            const tt = clamp(((player.x - ax) * dx + (py - ay) * dy) / L2, 0, 1);
            const dd = Math.hypot(player.x - (ax + dx * tt), py - (ay + dy * tt));
            if (dd < best) best = dd;
          }
          hitPlayer = best < PLAYER_CFG.hitRadius + b.r;
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
      // 巨大蛋挞成型阶段免伤（2026-10-04 用户定稿：仅虚象/具象——生成时打 tartGrowNoHit 标志）：
      // 生长未完成 → 命中无效（不伤害、不消失，弹继续前进成型后再正常判定）
      if (hitPlayer && b.tartGrowNoHit && b.tartGrow < b.tartGrowDur) hitPlayer = false;
      if (hitPlayer) {
        // 伤害来源标记（驾驶员效果挂点）：暴风之眼本体弹幕 / 其召唤的大型龙卷风弹 → src 'storm'
        const src = (b.owner && (b.owner.type === 'tornado' ||
                    (b.owner.type === 'boss' && b.owner.bossId === 'storm'))) ? 'storm' : null;
        // 成就死因：BOSS 弹幕按 owner 归属（往日梦魇——旧日之歌弹幕击杀）
        const achvCause = (b.owner && b.owner.type === 'boss') ? ('boss:' + b.owner.bossId) : null;
        // BOSS 及其召唤物（大型龙卷）伤害在发射时已乘 bossDmgMul，不吃非BOSS敌人增伤
        const bossOwned = b.owner && (b.owner.type === 'boss' || b.owner.type === 'tornado');
        const tookHit = damagePlayer(b.dmg * (bossOwned ? 1 : enemyDmgMul()), 1, false, false, src, achvCause);
        // 成就：饿啊——被紫电侧翼艇亡语弹击中计数（仅实际造成伤害的命中）
        if (tookHit && b.owner && b.owner.deathShot) achvZidianHit();
        // 蛋挞弹（b.tart）穿透：击中我方战机不消失、继续前进（2026-10-04 用户定稿，与白盾豁免同口径）
        if (!b.laser && !b.tart) eBullets.splice(i, 1);   // 激光穿透：命中不消失，持续生长直到尾端出界
      }
    }
  }

  // ---------- 道具 ----------
  const POWERUP_MAGNET_RADIUS = 170;   // 道具磁吸半径（比水晶 110 更大，更易被吸引吃到）

  // 生成道具（非水晶类通用）：下落 + 随机左右漂移（碰边反弹）+ 易被磁吸
  function spawnPowerup(x, y, kind, r) {
    // 防御性守卫：非有限坐标的道具会在绘制端产生 NaN（真实画布静默不绘制 → 道具凭空消失），直接拒绝生成
    if (!Number.isFinite(x) || !Number.isFinite(y)) { console.error('spawnPowerup 拒绝非有限坐标：', kind, x, y); return; }
    powerups.push({ x, y, kind, r, vy: rand(72, 99), vx: rand(-46, 46) });   // 1.8x 原速(40~55)
  }

  // 道具拾取结算（本体碰撞与强制吸收近距离直吸共用）
  function applyPowerupPickup(p) {
    achvNotePickup();   // 成就：UPUPUP——道具拾取计数（水晶不走本路径不计）
    // 小艺：拾取任意道具（水晶不走本路径）恢复生命——血量低于 35% 时回复量提升（森灵之力）
    if (hasPilot('xiaoyi') && player.alive) {
      const maxHp = player.maxHp || PLAYER_CFG.maxHp;
      const heal = player.hp < maxHp * PILOTS.xiaoyi.pickupHealLowPct ? PILOTS.xiaoyi.pickupHealLow : PILOTS.xiaoyi.pickupHeal;
      player.hp = Math.min(maxHp, player.hp + heal);
      spawnParticles(player.x, player.y - 12, '#8ce36b', 6, 120);
    }
    if (p.kind === 'hp') {
      // 诗篇（WAVE_POEM.healPct）：回复量改为当前血量上限 ×35%（四舍五入：陵落 60→21 / 铜皮夏勇 130→46）；
      //   其他难度固定 +40。小艺拾取回血（上方）为独立机制不受影响
      const healPct = isPoem() ? WAVE_POEM.healPct : null;
      const heal = healPct != null ? Math.round((player.maxHp || PLAYER_CFG.maxHp) * healPct) : 40;
      player.hp = clamp(player.hp + heal, 0, player.maxHp || PLAYER_CFG.maxHp);   // 上限 = 当前装甲最大 HP
      spawnParticles(p.x, p.y, '#66e39a', 12, 160);
    } else if (p.kind === 'bomb') {
      state.bombs = Math.min(state.bombs + 1, currentBombCap());   // 真我上限 2（mods.bombCap）+ 绷绷背包 +1（bombCapAdd）
      spawnParticles(p.x, p.y, '#ffb545', 12, 160);
    } else if (p.kind === 'shield') {
      // 量子护盾：6 秒无敌，敌弹碰盾即消解，解除时清屏
      // 许凯狗冲刺期间不读条：仅吸收（无得分），护盾效果跳过
      if (state.pilotDashT <= 0) {
        player.shield = SHIELD_DURATION;
        player.shieldMax = SHIELD_DURATION;   // 读条分母同步
        spawnParticles(p.x, p.y, '#6fe3ff', 18, 200);
      }
    } else if (p.kind === 'berserk') {
      // 许凯狗冲刺期间不读条：仅吸收得分（+100），不进入暴走
      if (state.pilotDashT > 0) state.score += Math.round(100 * diffMods().scoreMul);
      else pickupBerserk();
    } else {
      pickupKit();
    }
  }

  function updatePowerups(dt) {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      // 许凯狗冲刺：道具无视距离立刻被自身吸收（量子护盾 / 暴走等读条效果在 applyPowerupPickup 内跳过）
      if (state.pilotDashT > 0 && player.alive) {
        applyPowerupPickup(p);
        powerups.splice(i, 1);
        continue;
      }
      // 磁吸：比水晶更易被吸引（半径更大、拉力更强），吸附后直奔机身
      // 强制吸收（absorbDelay，BOSS 清场道具 / 警报快速吸收）：先自由下落一小段，随后无视距离高速飞向战机
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
    // 有效磁吸半径：击败第一个 BOSS（旧日之歌）后永久 ×1.5（基础 132 → 198）；
    // 奖励道具·磁力菇：叠加固定加成 +40px/个（state.magnetBonus，一整局可叠加）
    const magR = PLAYER_CFG.magnetRadius * (state.crystalMagnetMul || 1) + (state.magnetBonus || 0);
    for (let i = crystals.length - 1; i >= 0; i--) {
      const c = crystals[i];
      c.t += dt * 4;
      // 许凯狗冲刺：水晶无视距离立刻被自身吸收（计入得分）；澜心 / 漓等量表冻结不计（见 updatePilotStatus）
      if (state.pilotDashT > 0 && player.alive) {
        state.score += Math.round(c.val * diffMods().scoreMul);
        state.princeCrystalGain += Math.round(c.val * diffMods().scoreMul);
        if (c.tier === 'giant') { achvNoteGiantCrystal(); noteGachaStone(); }   // 原石（巨型水晶）：成就计数 + 当局收集计数/16 颗里程碑
        spawnParticles(c.x, c.y, '#9be7ff', 5, 120);
        crystals.splice(i, 1);
        continue;
      }
      // 磁吸：靠近玩家时被吸附（吸附后直奔机身中心判定点）
      // 强制吸收（absorbDelay，警报快速吸收等）：先自由下落一小段，随后无视距离高速飞向战机
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
            state.score += Math.round(c.val * diffMods().scoreMul);
        state.princeCrystalGain += Math.round(c.val * diffMods().scoreMul);   // 天秀忧郁王子：水晶得分不计入白色量表（updatePilotStatus 差分时扣除）
            // 七日澜心：按水晶【得分】等比填充技能量表（普通 +10 / 巨型 +500）——
            // 水晶系统后续重构将新增多种水晶，均按各自 val 自动等比计入（见 ARMOR_SKILLS.gaugeCrystalScore），无需改动此处
            // （firstBoss：首轮 BOSS 掉落水晶，量表收益额外加成；护盾期间量表停计，见 armorSkillGain）
            armorSkillGain(c.val, c.firstBoss);
            if (c.tier === 'giant') { achvNoteGiantCrystal(); noteGachaStone(); }   // 原石（巨型水晶）：成就计数 + 当局收集计数/16 颗里程碑
            spawnParticles(c.x, c.y, '#9be7ff', 5, 120);
            crystals.splice(i, 1);
            continue;
          }
        }
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      // 左右边界回收：水晶不出两侧边界——贴边夹取位置并消去朝外的横向速度
      // （磁吸拉向玩家不会推出边界；只有坠出底边才移除，见下方 y 判定）
      if (c.x < c.r) { c.x = c.r; if (c.vx < 0) c.vx = 0; }
      else if (c.x > CANVAS_W - c.r) { c.x = CANVAS_W - c.r; if (c.vx > 0) c.vx = 0; }
      if (c.y > CANVAS_H + 20) { crystals.splice(i, 1); continue; }
      if (player.alive &&
          Math.abs(c.x - player.x) < player.w / 2 + c.r &&
          Math.abs(c.y - player.y) < player.h / 2 + c.r) {
        state.score += Math.round(c.val * diffMods().scoreMul);
        state.princeCrystalGain += Math.round(c.val * diffMods().scoreMul);   // 天秀忧郁王子：水晶得分不计入白色量表（updatePilotStatus 差分时扣除）
        // 七日澜心：按水晶【得分】等比填充技能量表（同上，后续新增水晶类型自动计入）
        armorSkillGain(c.val, c.firstBoss);
        if (c.tier === 'giant') { achvNoteGiantCrystal(); noteGachaStone(); }   // 原石（巨型水晶）：成就计数 + 当局收集计数/16 颗里程碑
        spawnParticles(c.x, c.y, '#9be7ff', 5, 120);
        crystals.splice(i, 1);
      }
    }
  }

  // BOSS 警报触发：场上所有水晶 / 道具进入「快速吸收」——0.35s 飘落后无视距离高速飞向战机
  // （拉速 1800）；拾取判定照常逐个结算，不再瞬间清空全场
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

  // 胜利结算前 0.8s 统一收集：场上全部未收集水晶（仅水晶、不含道具）——跳过 0.35s 飘落（absorbDelay = 0 直拉）、
  // 拉速 1500（2026-09-27 定稿放缓：典型距离 0.3~0.5s 抵达，最远 ≈0.75s 仍落在 0.8s 窗口内）；逐帧重复调用幂等
  function collectAllCrystals() {
    for (const c of crystals) {
      if (c.absorbDelay == null) c.absorbDelay = 0;
      c.pullSpeed = 1500;
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

  // 高能爆弹火圈：自场地中心急速扩大至全场的橙黄色火环（全部模式统一表现）
  const bombBurst = { active: false, t: 0, duration: 0.55, big: false };   // big：可莉绷绷炸弹——扩散波大幅加宽

  export {
    enemyDamageMul, updateBullets, POWERUP_MAGNET_RADIUS, spawnPowerup, applyPowerupPickup, updatePowerups,
    updateCrystals, collectAllItems, collectAllCrystals, updateParticles, shieldBurst, berserkBurst, bombBurst,
  };