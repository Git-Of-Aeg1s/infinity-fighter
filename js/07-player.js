// 07-player：玩家武器 / 僚机逻辑 / 受伤与无敌 / 拾取 / 高能爆弹 / 清弹

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：04-spawn(1 名) 05-boss(1 名) 06-enemy(4 名) 08-entities(7 名) 12-ui(2 名) 13-encyclopedia(1 名) 14-main(7 名)
  // 本文件写共享状态（state/bossFlow/levelFlow 属性赋值；新增属性先在 02-core 归域声明）：
  //   state.{bombs, demo, flash, hurt, lives, score}
  //
  import { ARMOR_SKILLS, dagouWaveIv, BERSERK, BOMB_DAMAGE_BASE, BOMB_DAMAGE_RATIO, BULWARK, CANVAS_H, CANVAS_W, DEMO_BOTTOM, DEMO_TOP, ENEMY_CLASS, HANSHUANG, PILOTS, PLAYER_CFG, PRINCE_STORM, STARSLAYER, WEAPON_DROP_HITS, WEAPON_LEVELS, WINGMAN, WINGMAN_LEVELS, WINGMAN_SPREAD, armorMaxHp, currentArmor, currentPlane, currentSubWeapon, currentWingman, diffMods, hasPilot, invulnDiffMul, pilotBombDmgMul, pilotEntry, pilotHuiHealMul } from './01-config.js';
  import { bossEntranceActive, bossFlow, bulwarkBurst, clamp, clearEnemyBulletsNear, crystalBurst, dagouMissiles, eBullets, enemyOnScreen, enemies, feijianWaves, friendStorms, hasteMul, hpFill, keys, menuScreen, pBullets, particles, phaseFx, player, playerHitFx, rand, shake, slashFx, spawnArmorGlyphFx, spawnParticles, state, tryBulwarkCheatDeath, wingmen, xinRings } from './02-core.js';
  import { playerFrostMoveMul, playerFrostSlowMul, yu4AuraMul } from './04-spawn.js';
  import { clearMissiles, enemyColorTags, killEnemy } from './06-enemy.js';
  import { berserkBurst, bombBurst, enemyDamageMul, shieldBurst } from './08-entities.js';
  import { achvAddDagouCheat, achvClearKillSrc, achvNoteArmorSkillUsed, achvNoteDamage, achvNoteLingluoSkill, achvNotePilotSkillUsed, achvOnBombUsed, achvOnDeath, achvSetKillSrc } from './02-achievements.js';
  import { endGame } from './12-ui.js';


  // ---------- 玩家 ----------
  // 直射弹道：各级射线 [x, y] 偏移（x 间距为原本 3 倍，y 高低错落成“矮中高中矮”）
  // y 越负 = 发射点越靠前（高）；机身已放大 1.5 倍，鼻在 -33 附近
  // 射线布局：[ox, oy] 偏移
  const WEAPON_LINES = {
    1: [[0, -22], [-18, -6], [18, -6]],                                          // 3 条：高矮矮
    2: [[-27, -6], [-9, -15], [9, -15], [27, -6]],                                // 4 条：矮中中矮
    3: [[-27, -6], [-15, -14], [0, -22], [15, -14], [27, -6]],                    // 5 条：矮中高中矮
    4: [[-27, -6], [-15, -14], [0, -22], [15, -14], [27, -6]],                    // 5 条（同 Lv3）+ 延迟补射 2 发中间弹
    5: [[-27, -6], [-15, -14], [0, -22], [15, -14], [27, -6]],
  };

  // Lv4 半拍补射队列（游戏时间驱动：暂停自动冻结、重开自动清空，替代不响应暂停的 setTimeout）
  const delayedShots = [];

  function fireWeapon() {
    // 每发伤害按火力等级倍率缩放（WEAPON_LEVELS.dmgMul），使 Lv1~Lv4 的 DPS 构成 80% 等比链
    const dmg = PLAYER_CFG.bulletDamage * (WEAPON_LEVELS[player.weapon].dmgMul || 1);
    const r = 3;
    for (const [ox, oy] of WEAPON_LINES[player.weapon]) {
      pBullets.push({ x: player.x + ox, y: player.y + oy, vx: 0, vy: -PLAYER_CFG.bulletSpeed, r, dmg, color: currentPlane.bulletColor, lv: player.weapon, mainPierce: 1 });   // mainPierce：混乱将至主炮可穿透 1 个非 BOSS/4类敌人（结算见 08-entities）
    }
    // Lv4：主弹射出后延迟半拍，在中间位置补射 2 发（视觉错开，全部直射）
    if (player.weapon === 4) {
      delayedShots.push({ x: player.x, y: player.y, t: 0.025, r, dmg });
    }
  }

  // 补射队列推进：到点后按发射瞬间锁定的位置补 2 发中间弹（阵亡 / 掉级则作废，与旧 setTimeout 行为一致）
  function updateDelayedShots(dt) {
    for (let i = delayedShots.length - 1; i >= 0; i--) {
      const s = delayedShots[i];
      s.t -= dt;
      if (s.t > 0) continue;
      delayedShots.splice(i, 1);
      if (!player.alive || player.weapon !== 4) continue;
      pBullets.push({ x: s.x - 10, y: s.y - 18, vx: 0, vy: -PLAYER_CFG.bulletSpeed, r: s.r, dmg: s.dmg, color: currentPlane.bulletColor, lv: 4, mainPierce: 1 });
      pBullets.push({ x: s.x + 10, y: s.y - 18, vx: 0, vy: -PLAYER_CFG.bulletSpeed, r: s.r, dmg: s.dmg, color: currentPlane.bulletColor, lv: 4, mainPierce: 1 });
    }
  }

  // 暴走（Lv5）：十射线双连发（5 个位置各打两遍），3 倍宽度 + 高低错落，射速/单发伤害大幅提升（×dmgMul=2）
  function fireWeaponBerserk() {
    const dmg = PLAYER_CFG.bulletDamage * BERSERK.dmgMul;
    const r = 3 * BERSERK.rMul;
    const lines = [
      [-27, -6], [-27, -6], [-15, -14], [-15, -14], [0, -22],
      [0, -22], [15, -14], [15, -14], [27, -6], [27, -6],
    ];
    for (const [ox, oy] of lines) {
      pBullets.push({ x: player.x + ox, y: player.y + oy, vx: 0, vy: -PLAYER_CFG.bulletSpeed * BERSERK.spdMul, r, dmg, color: currentPlane.berserkColor, berserk: true, lv: 5, mainPierce: 1 });   // berserk: 暴走弹标记，渲染时附尾焰与光晕
    }
  }

  // ---------- 副武器：主机体挂载的第二种武器 ----------
  // 与主炮各自独立冷却、同时自动开火（updatePlayer / updateDemo 各自调用 updateSubWeapon）。
  // 胶囊体弹（diag / rail / homing）统一带 sub 标记 + colorTail/Mid/Head + len：复用 10-draw-world 的僚机胶囊体渲染分支（b.wing || b.sub）。
  // 新四款随火力等级缩放（fire.levels 按玩家火力 1~4 / 暴走 5 取参，见 subFireCfg）；
  // rail 弹走 mainPierce 穿透结算（穿透后伤害减半，见 08-entities）；homing 弹由 08-entities 逐帧索敌转向。
  // 取当前火力等级对应的副武器开火参数（levels 键控取参；无 levels 用固定 fire——燎原 / 贯川 / 追魂不随火力变化）
  function subFireCfg() {
    const f = currentSubWeapon.fire;
    if (!f) return null;
    return f.levels ? (f.levels[player.weapon] || f.levels[1]) : f;
  }

  // 开火：按 kind 分发；返回 false 表示本次未实际开火（如辛国栋之怒场上无目标），调用方将短冷却重试
  function fireSubWeapon() {
    const f = currentSubWeapon.fire;
    if (!f) return false;   // 标准挂架（noEffect）无 fire 字段：不开火
    const cfg = subFireCfg();
    if (f.kind === 'diag') {
      // 燎原双翼：两翼各一发斜射弹（±deg，出膛点取翼尖外侧）
      const a = f.deg * Math.PI / 180;
      const base = { r: f.r, dmg: cfg.dmg, len: f.len, colorTail: f.colorTail, colorMid: f.colorMid, colorHead: f.colorHead, flameMul: f.flameMul, sub: true };
      pBullets.push({ ...base, x: player.x - 20, y: player.y - 6, vx: -Math.sin(a) * f.speed, vy: -Math.cos(a) * f.speed });
      pBullets.push({ ...base, x: player.x + 20, y: player.y - 6, vx: Math.sin(a) * f.speed, vy: -Math.cos(a) * f.speed });
    } else if (f.kind === 'rail') {
      // 贯川重炮：机腹单发大口径重弹，直线飞行，可穿透 f.pierce 个敌人（mainPierce 结算，穿透后伤害减半）
      pBullets.push({ x: player.x, y: player.y - 24, vx: 0, vy: -f.speed, r: f.r, dmg: cfg.dmg, len: f.len,
                      colorTail: f.colorTail, colorMid: f.colorMid, colorHead: f.colorHead, flameMul: f.flameMul,
                      sub: true, mainPierce: f.pierce });
    } else if (f.kind === 'homing') {
      // 追魂导弹：左右各一枚，初始向斜上张开（spreadDeg），飞行中朝最近敌人限角速度转向（08-entities）
      const s = f.spreadDeg * Math.PI / 180;
      const base = { r: f.r, dmg: cfg.dmg, len: f.len, colorTail: f.colorTail, colorMid: f.colorMid, colorHead: f.colorHead, flameMul: f.flameMul, sub: true, homing: true, turnRate: f.turnRate };
      pBullets.push({ ...base, x: player.x - 16, y: player.y, vx: -Math.sin(s) * f.speed, vy: -Math.cos(s) * f.speed });
      pBullets.push({ ...base, x: player.x + 16, y: player.y, vx: Math.sin(s) * f.speed, vy: -Math.cos(s) * f.speed });
    } else if (f.kind === 'feijian') {
      // 无界飞剑：入列一波飞剑（尾部下沉 → 分裂为 cfg.count 把 → 中央先发、向两侧依次前射，推进见 updateFeijianWaves）
      const n = cfg.count;
      const swords = [];
      for (let i = 0; i < n; i++) {
        const off = i - (n - 1) / 2;   // 以槽位序计的偏移（中央 0，向两侧 ±0.5/±1.5…）
        swords.push({ ox: off * f.slotGap, at: f.sinkT + Math.abs(off) * f.fireGap, fired: false });
      }
      feijianWaves.push({ x: player.x, y0: player.y + 26, y: player.y + 26, t: 0, swords, f, dmg: cfg.dmg, pierceChance: cfg.pierceChance || 0 });
    } else if (f.kind === 'jixing') {
      // 极夜飞星：左右前方射出追踪激光（Lv5 每侧两条，内窄外宽）；穿透 1 个非 BOSS / 非 4类（mainPierce），
      // 对 4类敌人 +50%（capVuln，见 08-entities enemyDamageMul）；索敌优先级见 08-entities（subFirst）
      const a0 = 12 * Math.PI / 180;
      const angles = cfg.count >= 4 ? [-a0 * 0.4, a0 * 0.4, -a0 * 1.3, a0 * 1.3] : [-a0, a0];
      const base = { r: f.r, dmg: cfg.dmg, len: f.len, sub: true, homing: true, subFirst: true, laserBolt: true, turnRate: f.turnRate, capVuln: f.capVuln, mainPierce: 1 };
      for (const ang of angles) {
        const dir = ang < 0 ? -1 : 1;
        pBullets.push({ ...base, x: player.x + dir * 16, y: player.y - 20, vx: Math.sin(ang) * f.speed, vy: -Math.cos(ang) * f.speed });
      }
    } else if (f.kind === 'daodan') {
      // 捣蛋来袭：直射大狗导弹雨同款导弹（复用 dagouMissiles 数组，sub 标记走独立伤害/半径与倾斜弹道；
      // 主菜单演示屏不发射——dagouMissiles 由战斗循环推进，避免演示画面冻结残留）
      if (state.demo) return false;
      for (let i = 0; i < cfg.count; i++) {
        // Lv5 扇形：夹角 8~13° 随机（左 / 右 / 随机侧各一发）
        let deg = 0;
        if (cfg.count > 1) {
          const side = i === 0 ? -1 : i === 1 ? 1 : (Math.random() < 0.5 ? -1 : 1);
          deg = side * rand(cfg.spreadMin, cfg.spreadMax);
        }
        const a = deg * Math.PI / 180;
        dagouMissiles.push({
          x: player.x + (cfg.count > 1 ? (i - (cfg.count - 1) / 2) * 14 : 0), y: player.y - 14,
          vx: Math.sin(a) * f.speed, vy: -Math.cos(a) * f.speed, rot: a,
          r: f.r, sub: true, dmg: cfg.dmg, blastR: cfg.blastR,
        });
      }
    } else if (f.kind === 'xinring') {
      // 辛国栋之怒：锁定场上生命值最高的敌人（屏幕内、非濒死；虚化目标同样可锁定——火环持续存在，显形后照常灼烧）
      let tgt = null;
      for (const e of enemies) {
        if (!enemyOnScreen(e) || e.dying) continue;
        if (!tgt || e.hp > tgt.hp) tgt = e;
      }
      if (!tgt) return false;   // 场上无敌人：短冷却后重试
      xinRings.push({ x: tgt.x, y: tgt.y, follow: tgt, t: 0, dur: cfg.dur, r: cfg.r, dps: cfg.dmg, tick: f.tick, tickT: 0 });
    } else {
      return false;
    }
    return true;
  }

  // 副武器冷却推进：与主炮共用停火锁（警报演出 / BOSS 入场 / 冲刺等，playerFireLocked）；
  // 不受寒霜光圈 / 壁垒免死射速修正影响（两者只干涉主炮口径），斗志昂扬攻速翻倍照常生效
  function updateSubWeapon(dt) {
    const cfg = subFireCfg();
    if (!cfg) return;
    player.subCooldown -= dt * hasteMul();
    if (player.subCooldown <= 0) {
      if (playerFireLocked()) {
        player.subCooldown = 0;   // 保持就绪，解除锁定后立即开火（与主炮同策略）
        return;
      }
      if (fireSubWeapon()) player.subCooldown = cfg.interval;
      else player.subCooldown = 0.3;   // 本次未开火（如辛国栋之怒无目标）：稍后重试
    }
  }

  // 无界飞剑波次推进：整机尾部下沉（sinkT 内）→ 到位后各剑按发射序依次前射（常规不穿透；
  // 暴走每剑 pierceChance 概率穿透一次，走 mainPierce 结算）；全部射出后移除波次
  function updateFeijianWaves(dt) {
    for (let i = feijianWaves.length - 1; i >= 0; i--) {
      const w = feijianWaves[i];
      w.t += dt;
      w.y = w.y0 + Math.min(1, w.t / w.f.sinkT) * w.f.sinkDist;
      let allFired = true;
      for (const s of w.swords) {
        if (s.fired) continue;
        allFired = false;
        if (w.t >= s.at) {
          s.fired = true;
          const pierce = (w.pierceChance > 0 && Math.random() < w.pierceChance) ? 1 : 0;
          pBullets.push({ x: w.x + s.ox, y: w.y, vx: 0, vy: -w.f.speed, r: w.f.r, dmg: w.dmg, len: w.f.len, sword: true, sub: true, mainPierce: pierce });
        }
      }
      if (allFired) feijianWaves.splice(i, 1);
    }
  }

  // 辛国栋之怒火环推进：跟随目标敌人（目标消亡 / 离屏则停在最后位置）；按 tick 间隔对圈内敌人
  // 持续灼烧（伤害恒定，无焦香的"近核心翻倍"）；虚化（phase>0）与濒死敌人不结算
  function updateXinRings(dt) {
    for (let i = xinRings.length - 1; i >= 0; i--) {
      const g = xinRings[i];
      g.t += dt;
      if (g.t >= g.dur) { xinRings.splice(i, 1); continue; }
      if (g.follow && !g.follow.dying && enemyOnScreen(g.follow)) { g.x = g.follow.x; g.y = g.follow.y; }
      else g.follow = null;
      g.tickT += dt;
      if (g.tickT < g.tick) continue;
      g.tickT = 0;
      achvSetKillSrc('xinguodong');
      const killed = [];
      for (const e of enemies) {
        if (!enemyOnScreen(e) || e.dying || e.phase > 0) continue;
        if (Math.hypot(e.x - g.x, e.y - g.y) > g.r + Math.min(e.w, e.h) / 2) continue;
        e.hp -= g.dps * g.tick * kingDmgBonusMul();
        if (Math.random() < 0.3) spawnParticles(e.x + rand(-6, 6), e.y + rand(-6, 6), '#6fb8ff', 1, 60);
        if (e.hp <= 0) killed.push(e);
      }
      for (const t of killed) {
        const j = enemies.indexOf(t);
        if (j >= 0) killEnemy(j);
      }
      achvClearKillSrc();
    }
  }

  // ---------- 群星之杀：空间斩击武器 ----------
  // 机头直射一条淡白锁定光束（不造成伤害），选中最靠近玩家的主目标；
  // 每隔一段时间召唤一道空间斩击：以主目标为中心的矩形判定区，区域内所有敌人受全额伤害。
  // 对 BOSS 伤害 +20%；仅命中 1 个非 BOSS 敌人（单体斩击）时：伤害 +25%（攻击间隔不受影响）。
  // 斩击方向：与竖直方向夹角 5~20° 随机，左下→右上 / 右下→左上 逐次交替。
  // 暴走（Lv5）：每次连续斩击 3 下（间隔 slashGap），攻击间隔略微降低。
  let slashSeq = 0;   // 斩击方向交替计数（奇偶决定左候/右候）
  let beamSparkT = 0;   // 光束命中粒子节流计时

  function pickSlashTarget() {
    let best = null, bestD = Infinity;
    for (const e of enemies) {
      // 群星之杀无视敌方虚化护盾：虚化敌人同样可被锁定为主目标（不再按 e.phase 跳过）
      if (!enemyOnScreen(e)) continue;   // 屏幕外（尚未入场/已离场）的敌人不可锁定
      if (e.type === 'boss' && bossEntranceActive()) continue;   // 登场虚化 BOSS（警报/入场动画）不可锁定
      if (e.y >= player.y) continue;                   // 仅选中机头上方的敌人
      const hsE = (e.type === 'hanshuang' && e.hsNoDecel) ? HANSHUANG.entryHitScale : 1;   // 寒霜入场未减速：判定箱略缩
      if (Math.abs(e.x - player.x) > e.w / 2 * hsE + STARSLAYER.selectHalfW) continue;   // 光束走廊内
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  // 对主目标及其矩形斩击区内敌人结算一次斩击伤害（复用 enemyDamageMul 修正链）。
  // 区域内所有敌人受全额伤害；对 BOSS 伤害 +20%；
  // 仅命中 1 个非 BOSS 敌人（单体斩击）时：伤害 +25%（攻击间隔不受影响）
  function doSlash(lvl) {
    const t = player.slashTarget;
    if (!t) return false;
    player.bladeFlashT = 0.45;   // 双刃攻击闪光（paintStarslayer：白金过载 + 刃前斩动波）
    const cx = t.x, cy = t.y, R = lvl.slashR;
    // 斩击方向：与竖直方向夹角 5~20° 随机；奇偶交替（首次 rot>0 左下→右上，次之 rot<0 右下→左上）
    const deg = STARSLAYER.slashAngleMin + Math.random() * (STARSLAYER.slashAngleMax - STARSLAYER.slashAngleMin);
    const sign = (slashSeq++ % 2 === 0) ? 1 : -1;
    const rot = sign * deg * Math.PI / 180;
    const halfLen = R * STARSLAYER.slashLenMul;   // 沿斩击方向半长
    const halfW = R * STARSLAYER.slashWMul;       // 垂直斩击方向半宽
    const berserk = player.weapon === 5;
    // 斩击特效（顶部尖角、底宽、底边凹弧的斩痕 + 突然出现 + 空间扭曲 + 被切中敌机闪白，短暂存留渐隐）
    const fx = { x: cx, y: cy, rot, spinDir: sign, halfLen, halfW, t: STARSLAYER.slashFxTime, max: STARSLAYER.slashFxTime, berserk, hits: [] };
    slashFx.push(fx);
    // 命中反馈：中心火花迸发（不抖屏；空间扭曲由 drawSlashFx 绘制）
    spawnParticles(cx, cy, berserk ? '#ffe9a8' : '#cfe0ff', 16, 280);
    // 旋转到斩击局部坐标：local = R(-rot)·world；长轴=localY、宽轴=localX
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    // 先收集本次斩击命中的敌人（主目标 + 矩形判定区内），用于单体斩击判定
    const targets = [];
    for (const e of enemies) {
      // 群星之杀无视敌方虚化护盾：虚化敌人同样受斩击伤害（不再按 e.phase 跳过）
      if (!enemyOnScreen(e)) continue;   // 屏幕外敌人不受我方武器伤害
      if (e.type === 'boss' && bossEntranceActive()) continue;   // 登场虚化 BOSS：斩击穿透不结算
      const isMain = (e === t);
      if (!isMain) {
        const dx = e.x - cx, dy = e.y - cy;
        const lx = dx * cosR + dy * sinR;     // 宽轴
        const ly = -dx * sinR + dy * cosR;    // 长轴
        const hsE = (e.type === 'hanshuang' && e.hsNoDecel) ? HANSHUANG.entryHitScale : 1;   // 寒霜入场未减速：判定箱略缩
        if (Math.abs(ly) > halfLen + e.h / 2 * hsE) continue;
        if (Math.abs(lx) > halfW + e.w / 2 * hsE) continue;
      }
      targets.push({ e, isMain });
    }
    // 单体斩击：仅命中 1 个非 BOSS 敌人 → 本次伤害 +25%（测试模式不生效）
    // 测试模式（图鉴挑战）不生效：单体增强视为未触发，输出保持基准值
    const solo = targets.length === 1 && targets[0].e.type !== 'boss' && !state.challenge;
    const dmgMul = solo ? 1 + STARSLAYER.soloBonus : 1;
    const killed = [];
    for (const { e, isMain } of targets) {
      let dmg = lvl.dmg * dmgMul * enemyDamageMul(e, false) * princeOtherDmgMul(false);   // 天秀：暴风之眼战期间其余伤害 -50%（斩击属于"其余伤害"）
      if (e.type === 'boss') dmg *= 1 + STARSLAYER.bossBonus;   // 对 BOSS 伤害 +20%
      e.hp -= dmg;
      // 斩击击碎虚化护盾：护盾碎裂消散、立即恢复可伤（斩击本就无视虚化）
      if (e.phase > 0) {
        e.phase = 0;
        e.shielded = false;
        // 碎盾特效：白热闪核 + 三角碎片自机体中心加速迸射（带自旋，drawPhaseFx）
        const shards = [];
        for (let k = 0; k < 8; k++) shards.push({
          a: Math.random() * Math.PI * 2,
          w: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8),   // 自旋角速度（rad/s，随机方向）
          v0: 120 + Math.random() * 70,   // 迸射初速（px/s）
          acc: 425 + Math.random() * 225,   // 迸射加速度（px/s²）
        });
        phaseFx.push({ x: e.x, y: e.y, t: 0.5, max: 0.5, r: Math.max(e.w, e.h) * 0.5 + 6, shards });
        spawnParticles(e.x, e.y, '#bfe4ff', 14, 240);
        spawnParticles(e.x, e.y, '#eaf6ff', 8, 150);
      }
      spawnParticles(e.x, e.y, isMain ? '#ffffff' : '#cbb8ff', 8, 190);
      if (e.hp <= 0) killed.push(e);          // 被击杀：走 killEnemy 爆炸，不附加闪白
      else fx.hits.push({ ref: e, main: isMain, rad: Math.max(e.w, e.h) * 0.5 + 8 });   // 幸存被切中：附加闪白反馈
    }
    // 按对象身份逐个结算（killEnemy 内部按身份删除；连锁殉爆的嵌套结算会使数组索引错位，
    // 倒序按 index 遍历可能漏掉部分被斩杀的敌人）
    for (const t of killed) {
      const i = enemies.indexOf(t);
      if (i >= 0) killEnemy(i);
    }
    // 斩击切断「金环扩散」：圆环从被斩位置断开、失去清弹效果并快速碎裂消散
    for (const e of enemies) {
      const w = e.ringWave;
      if (!w || w.broken || !enemyOnScreen(e)) continue;
      const dx = e.x - cx, dy = e.y - cy;
      const ox = dx * cosR + dy * sinR, oy = -dx * sinR + dy * cosR;   // 环心在斩击局部坐标（宽轴/长轴）
      const band = 16;   // 环带判定厚度（与 06-enemy 扩环清弹一致）
      // 矩形-圆环相交：环心到矩形最近/最远距离与 [r-band, r+band] 有交集
      const dMin = Math.hypot(ox - clamp(ox, -halfW, halfW), oy - clamp(oy, -halfLen, halfLen));
      const dMax = Math.max(
        Math.hypot(ox - halfW, oy - halfLen), Math.hypot(ox + halfW, oy - halfLen),
        Math.hypot(ox - halfW, oy + halfLen), Math.hypot(ox + halfW, oy + halfLen));
      if (dMin > w.r + band || dMax < w.r - band) continue;
      // 断口 = 斩击长轴线与圆环的交点（长轴=局部 x=0，交点参数 oy±s；长轴未穿环时 s=0 收敛于最近点）
      const s = Math.sqrt(Math.max(0, w.r * w.r - ox * ox));
      const p1 = { x: cx - (oy - s) * sinR, y: cy + (oy - s) * cosR };
      const p2 = { x: cx - (oy + s) * sinR, y: cy + (oy + s) * cosR };
      const angA = Math.atan2(p1.y - e.y, p1.x - e.x);
      let span = Math.atan2(p2.y - e.y, p2.x - e.x) - angA;
      span -= Math.floor(span / (Math.PI * 2)) * (Math.PI * 2);   // 归一化到 [0, 2π)
      if (span < 0.05) span = 0.05;
      w.broken = true; w.fadeT = 0; w.fadeDur = 0.3; w.angA = angA; w.span = span;
      spawnParticles(p1.x, p1.y, '#ffd166', 12, 260);   // 断口两处迸出金色碎片
      spawnParticles(p2.x, p2.y, '#ffd166', 12, 260);
    }
  }

  function updateStarslayer(dt) {
    // 双刃攻击闪光衰减
    if (player.bladeFlashT > 0) player.bladeFlashT = Math.max(0, player.bladeFlashT - dt);
    // 每帧刷新选中目标（供光束渲染与斩击共用）
    player.slashTarget = player.alive ? pickSlashTarget() : null;
    // 光束命中粒子：锁定目标处持续迸发细小淡白火花（dt 节流；BOSS 同样有粒子）
    if (player.slashTarget && !playerFireLocked()) {
      beamSparkT -= dt;
      if (beamSparkT <= 0) {
        beamSparkT = 0.05;
        spawnParticles(player.slashTarget.x, player.slashTarget.y, '#eaf2ff', 2, 70);
      }
    } else {
      beamSparkT = 0;
    }
    const lvl = STARSLAYER.levels[player.weapon] || STARSLAYER.levels[1];
    const berserk = player.weapon === 5;

    // 暴走三连斩：队列推进（逐击重新锁定当前目标）
    if (player.slashQueued > 0) {
      player.slashGapT -= dt;
      if (player.slashGapT <= 0) {
        doSlash(lvl);
        player.slashQueued--;
        player.slashGapT = STARSLAYER.slashGapBase;
      }
      return;
    }

    player.slashCd -= dt * playerFrostSlowMul() * hasteMul() * bulwarkFireRateMul();   // 壁垒免死无敌期间斩击充能同样 ×0.5
    if (player.slashCd > 0) return;
    // 锁定中 / 无目标：保持就绪，解锁 / 出现目标后立即斩击
    if (playerFireLocked() || !player.slashTarget) { player.slashCd = 0; return; }
    player.slashCd = lvl.interval;
    doSlash(lvl);
    if (berserk && (lvl.slashes || 1) > 1) {
      player.slashQueued = lvl.slashes - 1;
      player.slashGapT = STARSLAYER.slashGapBase;
    }
  }

  // 僚机射速增益：斗志昂扬期间翻倍；群星之杀在非 boss 战时额外 ×wingmanHaste（补偿清杂弱）；
  // 寒霜光圈内随主机一并减速（×playerFrostSlowMul：顶部入场 ×0.65 / 侧翼 ×0.75——僚机成对跟随主机，主机在圈内僚机必在圈内）
  function wingmanHasteMul() {
    let m = hasteMul() * playerFrostSlowMul();
    if (currentPlane.wingmanHaste && !enemies.some(e => e.type === 'boss')) m *= currentPlane.wingmanHaste;
    return m;
  }

  // 斩击特效推进：存留时长递减，到期移除（暂停时不推进，重开时随数组清空）
  function updateSlashFx(dt) {
    for (let i = slashFx.length - 1; i >= 0; i--) {
      slashFx[i].t -= dt;
      if (slashFx[i].t <= 0) slashFx.splice(i, 1);
    }
  }

    // ---------- 僚机系统：跟随 / 开火 / 绘制 ----------
  // 初始化/重置僚机（成对：左右各一）；选择"无僚机"时数组为空
  function initWingmen() {
    // 保留旧位置：切换僚机类型时不瞬移，由 updateWingmen 平滑 lerp 到新偏移
    const oldPos = {};
    for (const w of wingmen) oldPos[w.side] = { x: w.x, y: w.y };
    wingmen.length = 0;
    if (!currentWingman || currentWingman.empty) return;
    // 站位偏移按当前僚机类型驱动（守愿者前侧 offsetY<0；群星允诺后侧）
    const offX = currentWingman.offsetX != null ? currentWingman.offsetX : WINGMAN.offsetX;
    const offY = currentWingman.offsetY != null ? currentWingman.offsetY : WINGMAN.offsetY;
    const isFan = currentWingman.weapon && currentWingman.weapon.kind === 'fan';
    for (const sx of [-1, 1]) {
      const prev = oldPos[sx];
      const w = {
        side: sx,                 // -1 左 / 1 右
        x: prev ? prev.x : player.x + sx * offX,
        y: prev ? prev.y : player.y + offY,
        cooldown: 0,              // 距下次启动连射的时间
        burst: null,              // volley:{volleys,spread,idx,gap} / fan:{angles,idx,gap}
        flameT: Math.random() * 10,
      };
      // 守愿者：初始化常时被动白盾折线（每帧在 updateWingmen 重算）
      if (isFan) { w.shieldPts = []; w.shieldSegs = []; w.shieldFlash = 0; computeShieldSegs(w); }
      wingmen.push(w);
    }
  }

  // 僚机跟随主机 + 开火（连续发射两轮）；不可被击中，故无碰撞逻辑
  function updateWingmen(dt) {
    if (!wingmen.length) return;
    const locked = playerFireLocked();
    const wpn = currentWingman.weapon || { kind: 'volley' };
    const offX = currentWingman.offsetX != null ? currentWingman.offsetX : WINGMAN.offsetX;
    const offY = currentWingman.offsetY != null ? currentWingman.offsetY : WINGMAN.offsetY;
    for (const w of wingmen) {
      w.flameT += dt;
      w.px = w.x; w.py = w.y;   // 上一帧盾心位置：白盾扫掠命中在盾参考系下做相对位移判定（盾与弹体都在动）
      // 目标位置：主机两侧（暴走时略外扩，增强气势）
      const spread = player.weapon === 5 ? 1.18 : 1;
      const tx = player.x + w.side * offX * spread;
      const ty = player.y + offY + (player.weapon === 5 ? 4 : 0);
      const k = Math.min(1, WINGMAN.followLerp * dt);   // 指数平滑跟随
      w.x += (tx - w.x) * k;
      w.y += (ty - w.y) * k;
      // 守愿者：每帧重算白盾世界折线（供挡弹与渲染共用）；盾面命中高光逐帧衰减
      if (wpn.kind === 'fan') {
        computeShieldSegs(w); if (w.shieldFlash > 0) w.shieldFlash = Math.max(0, w.shieldFlash - dt * 3);
        // 暴走过热：盾缘高频迸出白热火花（能量自装甲外泄；每次 2 颗、约 16 次/秒，确保醒目）
        if (player.weapon === 5 && player.alive && (state.mode === 'playing' || state.demo) && Math.random() < dt * 16) {
          const pts = w.shieldPts;
          if (pts && pts.length) { const pt = pts[(Math.random() * pts.length) | 0]; spawnParticles(pt.x, pt.y, '#ffffff', 2, 150); }
        }
      }
      if (!player.alive || locked || (state.mode !== 'playing' && !state.demo)) { w.burst = null; w.cooldown = 0; continue; }

      // ---- fan 模型（守愿者）：错序扇形发射，最前方（0°）先发 ----
      if (wpn.kind === 'fan') {
        if (w.burst) {
          w.burst.gap -= dt * wingmanHasteMul();
          if (w.burst.gap <= 0) {
            fireWingmanFanShot(w, w.burst.angles[w.burst.idx]);
            w.burst.idx++;
            if (w.burst.idx >= w.burst.angles.length) w.burst = null;
            else w.burst.gap = wpn.staggerGap;
          }
          continue;
        }
        w.cooldown -= dt * wingmanHasteMul();
        if (w.cooldown <= 0) {
          const lv = wpn.levels[player.weapon] || wpn.levels[1];
          w.burst = { kind: 'fan', angles: buildFanAngles(wpn, player.weapon), idx: 0, gap: 0 };
          w.cooldown = lv.interval;
        }
        continue;
      }

      // ---- volley 模型（群星允诺）：连续发射两轮 ----
      if (w.burst) {
        w.burst.gap -= dt * wingmanHasteMul();
        if (w.burst.gap <= 0) {
          fireWingmanVolley(w, w.burst.volleys[w.burst.idx], w.burst.spread);
          w.burst.idx++;
          if (w.burst.idx >= w.burst.volleys.length) w.burst = null;
          else w.burst.gap = WINGMAN.volleyGap;
        }
        continue;
      }
      // 冷却结束：启动一次"连续发射两次"（斗志昂扬增益期间僚机攻速翻倍）
      w.cooldown -= dt * wingmanHasteMul();
      if (w.cooldown <= 0) {
        const lv = WINGMAN_LEVELS[player.weapon] || WINGMAN_LEVELS[1];
        w.burst = { volleys: lv.volleys, spread: lv.spread, idx: 0, gap: 0 };
        w.cooldown = lv.interval;
      }
    }
  }

  // 构建错序扇形发射角度序列（度，相对竖直向上、朝外侧；按发射先后排序，0° 最前方先发）
  //   固定弹道：0°（竖直向上）与 90°（水平）为均布序列两端，必各有一发；
  //   另有一发 105°（水平朝下 15°）最后射出；其余各发在 0°~90° 间均布（各等级发数不变）
  function buildFanAngles(wpn, level) {
    const cfg = wpn.levels[level] || wpn.levels[1];
    const angles = [];
    const m = cfg.count - 1;                        // 0°~90° 均布弹数（含 0° 与 90° 两端）
    const step = 90 / (m - 1);
    for (let i = 0; i < m; i++) angles.push(i * step);   // 0 → 90 均分、0° 先发
    angles.push(105);                               // 105°：水平朝下 15°，压轴发射
    return angles;
  }

  // 守愿者单发扇形弹：椭圆长条（oval），速度 bulletSpeed×(Lv5 speedMul)×扇形梯度，伤害取 weapon.levels[lv].dmg
  //   扇形速度梯度（暴走 Lv5 不生效）：最前方（0°）子弹 +speedGrad（60%）、最低（最外侧 spreadMax°）无加成，中间各发按角度线性递减
  //   暴走（Lv5）：弹长 ×berserk.lenMul、金红渐变配色（普通时为僚机蓝系配色）；均随开火时刻的火力等级定格
  function fireWingmanFanShot(w, thetaDeg) {
    const wpn = currentWingman.weapon;
    const lv = wpn.levels[player.weapon] || wpn.levels[1];
    const bz = player.weapon === 5 && wpn.berserk;
    const up = -Math.PI / 2;
    const ang = up + w.side * (thetaDeg * Math.PI / 180);   // side 定向：右僚机朝 +x、左僚机朝 -x
    const gradT = wpn.spreadMax > 0 ? thetaDeg / wpn.spreadMax : 0;   // 0=最前方 → 1=最低（最外侧）
    const speed = wpn.bulletSpeed * (lv.speedMul || 1) * (bz ? 1 : 1 + (wpn.speedGrad || 0) * (1 - gradT));
    pBullets.push({
      x: w.x, y: w.y - 8,
      sx: w.x, sy: w.y - 8,   // 出舱点：尾焰随离舱距离渐入（避免新射出的弹把尾焰扫在僚机盾面/本体上）
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      r: wpn.barR, dmg: lv.dmg,
      len: wpn.barLen * (bz ? wpn.berserk.lenMul : 1), wing: true, oval: true, glow: !!lv.flame,
      flameMul: lv.flameMul != null ? lv.flameMul : (lv.flame ? 1 : 0),   // 尾焰强度：守愿者按等级 0.35~1（群星允诺同样分级，见 WINGMAN_LEVELS）
      pierce: wpn.pierceOnce || 0,   // 对 1类敌人穿透次数（见 08-entities 命中结算）
      tornadoHits: wpn.tornadoHits || 1,   // 对大型龙卷的每次命中判定次数（pierce 同理仅守愿者弹携带）
      berserkFire: !!bz,             // 暴走期发射：尾焰随配色金红化（10-draw-world）
      colorTail: bz ? wpn.berserk.colorTail : currentWingman.barTail,
      colorMid: bz ? wpn.berserk.colorMid : currentWingman.barMid,
      colorHead: bz ? wpn.berserk.colorHead : currentWingman.barHead,
    });
  }

  // 守愿者白盾世界折线：以僚机为圆心、BULWARK.radius 为半径，从 arcFrom→arcTo（相对竖直向上朝外侧）
  //   随 side 镜像、随 w.x/w.y 平移；shieldPts 供渲染画弧，shieldSegs 供激光/风条裁切，
  //   shieldLocalSegs 为以盾心为原点的本地折线（形状恒定）——盾与弹体均在运动，扫掠命中在盾参考系下判定
  function computeShieldSegs(w) {
    const R = BULWARK.radius * BULWARK.scale, seg = BULWARK.segments, up = -Math.PI / 2;   // 半径乘整体尺寸系数（与绘制一致）
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const theta = BULWARK.arcFrom + (BULWARK.arcTo - BULWARK.arcFrom) * (i / seg);
      const ang = up + w.side * (theta * Math.PI / 180);
      pts.push({ x: w.x + Math.cos(ang) * R, y: w.y + Math.sin(ang) * R });
    }
    w.shieldPts = pts;
    const segs = [], local = [];
    for (let i = 0; i < pts.length - 1; i++) {
      segs.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y });
      local.push({ x1: pts[i].x - w.x, y1: pts[i].y - w.y, x2: pts[i + 1].x - w.x, y2: pts[i + 1].y - w.y });
    }
    w.shieldSegs = segs;
    w.shieldLocalSegs = local;
  }

  // ---------- 守愿者白盾挡弹工具（供 08-entities / 06-enemy 复用；仅 fan 僚机持有 shieldSegs）----------
  // 当前是否为守愿者（持盾）僚机：拦截仅对非导弹直射弹生效（导弹/区域伤害天然绕过）
  function bulwarkActive() {
    return !!(currentWingman && currentWingman.weapon && currentWingman.weapon.kind === 'fan');
  }

  // 线段相交：返回交点参数 t（沿第一条线段 0→1）、u（沿第二条）与交点坐标；平行/不相交返回 null
  function segIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
    const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { t, u, x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  }

  // 两线段最近点：相交→{d:0, x, y}（交点）；否则取 4 端点投影的最小者（x/y 返回第二段上的对应点）
  function segSegClosest(ax, ay, bx, by, cx, cy, dx, dy) {
    const hit = segIntersect(ax, ay, bx, by, cx, cy, dx, dy);
    if (hit) return { d: 0, x: hit.x, y: hit.y };
    let best = { d: Infinity, x: 0, y: 0 };
    const proj = (ex, ey, x1, y1, x2, y2, onSecond) => {
      const vx = x2 - x1, vy = y2 - y1;
      const L2 = vx * vx + vy * vy;
      let t = L2 > 0 ? ((ex - x1) * vx + (ey - y1) * vy) / L2 : 0;
      t = clamp(t, 0, 1);
      const qx = x1 + vx * t, qy = y1 + vy * t;
      const d = Math.hypot(ex - qx, ey - qy);
      if (d < best.d) best = onSecond ? { d, x: qx, y: qy } : { d, x: ex, y: ey };
    };
    proj(ax, ay, cx, cy, dx, dy, true);
    proj(bx, by, cx, cy, dx, dy, true);
    proj(cx, cy, ax, ay, bx, by, false);
    proj(dx, dy, ax, ay, bx, by, false);
    return best;
  }

  // 白盾扫掠命中：盾与弹体均在运动，在盾参考系下做相对位移判定——
  //   弹体从 (px,py) 移动到 (x,y)，盾心本帧自 (w.px,w.py) 平移到 (w.x,w.y)；
  //   相对路径 A=(px-w.px,py-w.py) → B=(x-w.x,y-w.y) 与盾本地折线（形状恒定）判定，
  //   最近距离 ≤ br（弹体半径；长条弹可传入弹头前缘的扫掠段）即吸收——
  //   修复：此前只对世界坐标做点扫掠，盾移动时相对穿越会漏判、擦盾边缘的子弹也会漏过
  //   返回世界坐标命中点（盾面上距弹体最近点）用于粒子；命中时点亮该僚机盾面高光
  function shieldSweepHit(px, py, x, y, br = 0) {
    let best = null, bestD = Infinity;
    for (const w of wingmen) {
      const segs = w.shieldLocalSegs;
      if (!segs || !segs.length) continue;
      const pcx = w.px != null ? w.px : w.x, pcy = w.py != null ? w.py : w.y;
      const ax = px - pcx, ay = py - pcy, bx = x - w.x, by = y - w.y;
      for (const s of segs) {
        const h = segSegClosest(ax, ay, bx, by, s.x1, s.y1, s.x2, s.y2);
        if (h.d <= br && h.d < bestD) {
          bestD = h.d;
          best = { x: w.x + h.x, y: w.y + h.y, w };
        }
      }
    }
    if (best) best.w.shieldFlash = 1;
    return best;
  }

  // 特殊射弹反弹命中（三类·swRef，注册表见 01-config BULWARK 注释）：扫掠判定同 shieldSweepHit，
  //   另返回命中盾段的单位法线 nx/ny（取指向弹体来向的一侧）——供 08-entities 按入射夹角镜像反射（非原路弹回）
  function shieldReflectHit(px, py, x, y, br = 0) {
    let best = null, bestD = Infinity;
    for (const w of wingmen) {
      const segs = w.shieldLocalSegs;
      if (!segs || !segs.length) continue;
      const pcx = w.px != null ? w.px : w.x, pcy = w.py != null ? w.py : w.y;
      const ax = px - pcx, ay = py - pcy, bx = x - w.x, by = y - w.y;
      for (const s of segs) {
        const h = segSegClosest(ax, ay, bx, by, s.x1, s.y1, s.x2, s.y2);
        if (h.d <= br && h.d < bestD) {
          bestD = h.d;
          best = { x: w.x + h.x, y: w.y + h.y, w, sdx: s.x2 - s.x1, sdy: s.y2 - s.y1 };
        }
      }
    }
    if (!best) return null;
    best.w.shieldFlash = 1;
    const L = Math.hypot(best.sdx, best.sdy) || 1;
    let nx = -best.sdy / L, ny = best.sdx / L;
    if (nx * (x - px) + ny * (y - py) > 0) { nx = -nx; ny = -ny; }   // 法线取指向弹体来向的一侧
    return { x: best.x, y: best.y, w: best.w, nx, ny };
  }

  // 激光/风条截断裁切：弹体轴线（尾端 tx,ty 沿单位向量 ux,uy 延伸 len）与盾折线相交，返回最靠近尾端的交点及沿轴距离 d
  //   用于激光 clipLen（不 splice、继续生长/推进）与风条“磨短”；无相交返回 null
  //   pad 为弹体半径容差（弹体半径 + 盾厚一半）：轴线与折线无精确交点、但弹体边缘触及盾面（含擦盾弧端点掠过）时，
  //   以盾面最近接触点沿轴投影为截断点——零厚度轴线判定会让宽弹体擦盾漏过
  function clipAgainstShield(tx, ty, ux, uy, len, pad = 0) {
    const hx = tx + ux * len, hy = ty + uy * len;
    let best = null, bestD = Infinity;
    for (const w of wingmen) {
      const segs = w.shieldSegs;
      if (!segs || !segs.length) continue;
      for (const s of segs) {
        const hit = segIntersect(tx, ty, hx, hy, s.x1, s.y1, s.x2, s.y2);
        if (hit) { const d = hit.t * len; if (d < bestD) { bestD = d; best = { x: hit.x, y: hit.y, d, w }; } }
      }
    }
    if (!best && pad > 0) {
      for (const w of wingmen) {
        const segs = w.shieldSegs;
        if (!segs || !segs.length) continue;
        for (const s of segs) {
          const h = segSegClosest(tx, ty, hx, hy, s.x1, s.y1, s.x2, s.y2);
          if (h.d > pad) continue;
          // 盾面最近接触点沿轴投影（clamp 到 [0,len]）：接触点在尾端之后说明弹体已整体越过盾面 → 截断于尾端（d=0）
          const d = len > 0 ? clamp(((h.x - tx) * ux + (h.y - ty) * uy) / len, 0, 1) * len : 0;
          if (d < bestD) { bestD = d; best = { x: h.x, y: h.y, d, w }; }
        }
      }
    }
    if (best) best.w.shieldFlash = 1;
    return best;
  }

  // BOSS 光束截断专用（现仅技能6 使用，见 05-boss runStorm2Skill；技能1/2 为四类·免疫射弹不走此处）：
  //   盾弧 + 两盾内端点之间的“连体桥”——
  //   守愿者双盾分居主机两侧（offsetX ±41），盾弧内缘之间留有约 71px 空隙，竖直/近竖直向下的
  //   BOSS 光柱会从主机正上方空隙漏过。此处把两盾内端点连线一并纳入截断（即“白盾连成一面”），
  //   仅供 BOSS 光束裁切使用；普通子弹判定维持既有几何（shieldSweepHit / clipAgainstShield）不变
  function beamClipAgainstShield(tx, ty, ux, uy, len, pad = 0) {
    const clip = clipAgainstShield(tx, ty, ux, uy, len, pad);
    if (clip) return clip;
    if (uy < 0.25 || wingmen.length !== 2) return null;   // 仅朝下的光束参与桥截断（臂向外/向上的光束不受影响）
    const [a, b] = wingmen;
    if (!a.shieldSegs || !a.shieldSegs.length || !b.shieldSegs || !b.shieldSegs.length) return null;
    const pA = a.shieldPts[0], pB = b.shieldPts[0];   // 各盾内缘端点（computeShieldSegs 的 theta=arcFrom 端）
    if (!pA || !pB) return null;
    const hx = tx + ux * len, hy = ty + uy * len;
    const flashBoth = () => { a.shieldFlash = 1; b.shieldFlash = 1; };
    const hit = segIntersect(tx, ty, hx, hy, pA.x, pA.y, pB.x, pB.y);
    if (hit) { flashBoth(); return { x: hit.x, y: hit.y, d: hit.t * len, w: a }; }
    if (pad > 0) {
      const h = segSegClosest(tx, ty, hx, hy, pA.x, pA.y, pB.x, pB.y);
      if (h.d <= pad) {
        const d = clamp(((h.x - tx) * ux + (h.y - ty) * uy) / len, 0, 1) * len;
        flashBoth();
        return { x: h.x, y: h.y, d, w: a };
      }
    }
    return null;
  }

  // 僚机单轮齐射：n 发长条弹幕，绕竖直向上方向对称展开，相邻夹角 spreadDeg 度
  function fireWingmanVolley(w, n, spreadDeg) {
    const berserk = player.weapon === 5;
    const lvCfg = WINGMAN_LEVELS[player.weapon] || WINGMAN_LEVELS[1];   // 等级配置（尾焰强度 flameMul 随等级增长，暴走最强）
    const deg = WINGMAN_SPREAD[n] != null ? WINGMAN_SPREAD[n] : spreadDeg;   // 按单轮发数取夹角，回退到等级默认
    const spread = deg * Math.PI / 180;
    const up = -Math.PI / 2;   // 竖直向上
    const lvMul = (currentWingman.dmgMulByLevel && currentWingman.dmgMulByLevel[player.weapon]) || 1;   // 僚机专属等级伤害倍率（群星允诺以 Lv4×1.4 为基准构成 80% 等比 DPS 链）
    const dmg = WINGMAN.bulletDmg * (berserk ? 2 : 1) * lvMul;   // 暴走双倍伤害（所有僚机）
    const speed = WINGMAN.bulletSpeed * (berserk ? 1.15 : 1);
    for (let i = 0; i < n; i++) {
      const ang = up + (i - (n - 1) / 2) * spread;   // 对称展开（n 为奇数时含竖直一发）
      pBullets.push({
        x: w.x, y: w.y - 8,
        sx: w.x, sy: w.y - 8,   // 出舱点：尾焰随离舱距离渐入（同 fireWingmanFanShot）
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        r: WINGMAN.barR, dmg,
        len: WINGMAN.barLen, wing: true, glow: berserk,
        flameMul: lvCfg.flameMul != null ? lvCfg.flameMul : (berserk ? 1 : 0),   // 尾焰强度：群星允诺按等级 0.35~1（金橙尾焰），Lv5 暴走最强
        flameLenMul: berserk ? 1 : WINGMAN.flameLenMul,   // 尾焰长度系数：Lv1~4 收短 35%，暴走保持原长
        colorTail: currentWingman.barTail, colorMid: currentWingman.barMid, colorHead: currentWingman.barHead,
      });
    }
  }
  function updatePlayer(dt) {
    // 暴走刃帆变形进度（0=常态刃 1=暴走巨帆；进入/退出暴走平滑过渡，约 0.33s）
    const sailTarget = (player.weapon === 5 && player.berserk > 0) ? 1 : 0;
    if (player.berserkSpread < sailTarget) player.berserkSpread = Math.min(sailTarget, player.berserkSpread + dt * 3);
    else if (player.berserkSpread > sailTarget) player.berserkSpread = Math.max(sailTarget, player.berserkSpread - dt * 3);
    updateDelayedShots(dt);   // Lv4 半拍补射队列推进（暂停时不推进，重开时清空）
    // 掉命等待重生
    if (!player.alive) {
      // 埃逸：死亡蓄力自爆——蓄力粒子向机体汇聚，归零触发清屏自爆（含 BOSS；见 aiyiSelfDestruct）
      if (hasPilot('aiyi') && player.aiyiChargeT > 0) {
        player.aiyiChargeT = Math.max(0, player.aiyiChargeT - dt);
        if (Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2, d = rand(30, 70);
          particles.push({ x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d,
            vx: -Math.cos(a) * d * 3, vy: -Math.sin(a) * d * 3,
            life: 0.3, age: 0, color: '#ff4d6d', size: rand(1.5, 3) });
        }
        if (player.aiyiChargeT <= 0) aiyiSelfDestruct();
      }
      if (state.lives > 0) {
        player.respawnTimer -= dt;
        if (player.respawnTimer <= 0) respawnPlayer();
      }
      return;
    }

    // 开局飞入计时推进（许凯狗冲刺期间同样照常耗尽——冲刺自带入场缓动接管位移，
    // 冲刺结束后不得再由飞入缓动突然接管机体）
    if (player.enterT > 0) player.enterT = Math.max(0, player.enterT - dt);

    let dx = 0, dy = 0;
    if (state.pilotDashT > 0) {
      // 许凯狗冲刺：无法操控——机体水平居中，在屏高 20%~40% 之间大幅上下正弦摆动（约 3.8 个来回）；
      // 入场段（dashEntry 0.5s）：从出发位置平滑升至摆动区，不瞬间闪现；
      // 收尾段（dashTail 0.8s）：摆动幅度平滑衰减，机体滑落至 70% 屏高交还操控，不瞬间停顿
      const dashDur = PILOTS.xukaigou.dashDur;
      const elapsed = dashDur - state.pilotDashT;
      const dashPhase = elapsed / dashDur;
      player.x = CANVAS_W / 2;
      const oscAmp = CANVAS_H * 0.1;
      // 摆动相位偏移：入场结束瞬间恰好处于摆动中心点且向上运动（速度最大），
      // 机体爬升到位后无缝汇入摆动——否则入场终点落在摆动最高点，会出现"减速停顿-再加速"
      const swing = -Math.sin((elapsed - PILOTS.xukaigou.dashEntry) / dashDur * Math.PI * 2 * 3.8);
      const oscY = CANVAS_H * 0.3 + oscAmp * swing;
      if (player._dashStartY == null) player._dashStartY = player.y;   // 首帧记录出发位置
      const entry = Math.min(1, elapsed / PILOTS.xukaigou.dashEntry);
      const easeIn = entry * entry * (3 - 2 * entry);                  // smoothstep 入场缓动
      let ty = player._dashStartY + (oscY - player._dashStartY) * easeIn;
      const tail = PILOTS.xukaigou.dashTail;
      if (state.pilotDashT < tail) {
        const p = 1 - state.pilotDashT / tail;   // 收尾进度 0→1
        const ease = p * p * (3 - 2 * p);        // smoothstep 收尾缓动
        const cur = CANVAS_H * 0.3 + oscAmp * (1 - ease) * swing;
        ty = cur + (CANVAS_H * 0.7 - cur) * ease;
      }
      player.y = ty;
    } else {
      player._dashStartY = null;   // 非冲刺态清除出发位置记录
      if (player.enterT > 0) {
        // 主菜单开局飞入：从演示屏站位 smoothstep 滑向出战位（期间操控锁定，主炮照常自动开火）
        const p = 1 - player.enterT / PLAYER_CFG.enterDur;
        const ease = p * p * (3 - 2 * p);
        player.y = player.enterFromY + (CANVAS_H - 90 - player.enterFromY) * ease;
      } else {
        if (keys['a'] || keys['arrowleft']) dx -= 1;
        if (keys['d'] || keys['arrowright']) dx += 1;
        if (keys['w'] || keys['arrowup']) dy -= 1;
        if (keys['s'] || keys['arrowdown']) dy += 1;
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        dx /= len; dy /= len;
        const pspd = PLAYER_CFG.speed * playerFrostMoveMul() * state.maxinSpeedMul;   // 寒霜光圈内移动速度 -35%；马兴犬：Shift 加速 / CapsLock 减速
        player.x += dx * pspd * dt;
        player.y += dy * pspd * dt;
      }
      }
      // 击退位移（风暴风流/风柱命中）：随时间快速衰减
      if (player.kbT > 0) {
        player.kbT -= dt;
        const damp = Math.exp(-7 * dt);
        player.x += player.kbVx * dt;
        player.y += player.kbVy * dt;
        player.kbVx *= damp;
        player.kbVy *= damp;
      }
    }
    player.x = clamp(player.x, player.w / 2, CANVAS_W - player.w / 2);
    player.y = clamp(player.y, player.h / 2, CANVAS_H - player.h / 2);

    // 许凯狗：开场高能冲刺视觉——机身拖出金白色气浪（判定与无敌由 resetGame / 14-main 驱动）
    if (state.pilotDashT > 0) {
      for (let k = 0; k < 2; k++) {
        particles.push({
          x: player.x + rand(-14, 14), y: player.y + rand(-4, 30),
          vx: rand(-30, 30), vy: rand(120, 260),
          life: rand(0.25, 0.45), age: 0,
          color: Math.random() < 0.5 ? '#ffd166' : '#ffffff',
          size: rand(1.5, 3.2),
        });
      }
    }

    // 自动开火（Lv5 即暴走：使用暴走弹道与射速）
    // BOSS 出场演出期间停止攻击，展开完毕后立即恢复
    const berserk = player.weapon === 5;
    if (currentPlane.slashWeapon) {
      // 群星之杀：不发射普通子弹，改为锁定光束 + 周期性空间斩击
      updateStarslayer(dt);
    } else {
      player.cooldown -= dt * playerFrostSlowMul() * hasteMul() * bulwarkFireRateMul();   // 寒霜光圈内射速 -35%；斗志昂扬增益期间攻速翻倍；壁垒免死无敌期间 ×0.5
      if (player.cooldown <= 0) {
        if (!playerFireLocked()) {
          player.cooldown = berserk ? BERSERK.interval : WEAPON_LEVELS[player.weapon].interval;
          if (berserk) fireWeaponBerserk();
          else fireWeapon();
        } else {
          player.cooldown = 0;   // 保持就绪，解除锁定后立即开火
        }
      }
    }

    // 副武器：独立冷却的第二武器（标准挂架为无效果基准，无 fire 字段直接跳过）
    updateSubWeapon(dt);
    updateFeijianWaves(dt);   // 无界飞剑：待发射飞剑波推进（波次与火力等级无关，锁定入场时继续）
    updateXinRings(dt);       // 辛国栋之怒：灼烧火环推进

    if (player.invuln > 0) player.invuln -= dt;
    // 最终壁垒免死菱形演出：与无敌时长同步衰减；菱形开始消散（剩 0.3s，与绘制的淡出窗口一致）时
    // 才清除周围 250px 内敌弹并扩散金环（触发瞬间不清弹——演出后置到消散时刻）
    if (player.bulwarkFxT > 0) {
      const prevFx = player.bulwarkFxT;
      player.bulwarkFxT -= dt;
      if (prevFx > 0.3 && player.bulwarkFxT <= 0.3) {
        bulwarkBurst.active = true;
        bulwarkBurst.t = 0;
        bulwarkBurst.x = player.x;
        bulwarkBurst.y = player.y;
        clearEnemyBulletsNear(player.x, player.y, 250);
      }
      if (player.bulwarkFxT < 0) player.bulwarkFxT = 0;
    }
    if (player.hitFxT > 0) player.hitFxT -= dt;   // 受击闪白计时衰减
    if (player.berserkBanner > 0) player.berserkBanner -= dt;
    // 暴走机翼展开动画：平滑过渡 0↔1
    const wingTarget = (player.weapon === 5) ? 1 : 0;
    if (player.wingSpread < wingTarget) {
      player.wingSpread = Math.min(wingTarget, player.wingSpread + dt * 2.5);   // 0.4s 展开
    } else if (player.wingSpread > wingTarget) {
      player.wingSpread = Math.max(wingTarget, player.wingSpread - dt * 3.5);   // 0.29s 合拢
    }
    // 我方停止攻击期间（警报演出 + BOSS 出场未就绪）暂停暴走/护盾倒计时
    const pauseTimers = playerFireLocked();
    // 暴走（Lv5）限时：倒计时归零后回落至 Lv4
    if (player.weapon === 5 && !pauseTimers) {
      player.berserk -= dt;
      if (player.berserk <= 0) {
        player.berserk = 0;
        player.weapon = 4;
        spawnParticles(player.x, player.y, '#7ce7ff', 16, 200);
        // 哈基米大王：暴走结束后的 4s 内闪避仍然生效（覆盖后暴走的最危险窗口）
        if (hasPilot('hajimi')) state.hajimiTailT = PILOTS.hajimi.tailDur;
      }
    }
    if (player.shield > 0 && !pauseTimers) {
      player.shield -= dt;
      if (player.shield <= 0) {
        player.shield = 0;
        // 触发护盾冲击波特效：迅速扩大到全屏并渐隐
        shieldBurst.active = true;
        shieldBurst.t = 0;
        shieldBurst.x = player.x;
        shieldBurst.y = player.y;
        clearEnemyBullets();   // 护盾解除：清除场上一切敌弹
      }
    }
    // 七日澜心水晶护盾：倒计时；消失时清除周围 250px 内的所有敌弹
    // （演出：淡粉冲击波环自机体扩散，范围对应其 250px 消弹半径——样式同量子护盾冲击波但更小）
    if (player.crystalShield > 0 && !pauseTimers) {
      player.crystalShield -= dt;
      if (player.crystalShield <= 0) {
        player.crystalShield = 0;
        crystalBurst.active = true;
        crystalBurst.t = 0;
        crystalBurst.x = player.x;
        crystalBurst.y = player.y;
        clearEnemyBulletsNear(player.x, player.y, ARMOR_SKILLS.lanxin.clearR);
        spawnParticles(player.x, player.y, ARMOR_SKILLS.lanxin.color, 22, 220);
        shake(4, 0.2);
      }
    }
    // 炽心：火环持续灼烧周围敌人——每 0.125s 对火环半径内的敌人造成 10 伤害（BOSS 战演出停手期间同样暂停）
    if (currentArmor.id === 'chixin' && !pauseTimers) {
      player.chixinBurnT = (player.chixinBurnT || 0) + dt;
      if (player.chixinBurnT >= currentArmor.burnInterval) {
        player.chixinBurnT = 0;
        achvSetKillSrc('chixin');   // 成就：炽心火环击杀来源（烧烧烧——寒霜 / 焦香螺旋桨）
        for (let k = enemies.length - 1; k >= 0; k--) {
          const en = enemies[k];
          if (en.phase > 0) continue;   // 虚化护盾期间不受伤害
          if (en.type === 'boss' && bossEntranceActive()) continue;   // 登场虚化 BOSS：灼烧穿透
          const dx = en.x - player.x, dy = en.y - player.y;
          if (Math.hypot(dx, dy) > currentArmor.burnR + Math.max(en.w, en.h) / 2) continue;
          const etags = enemyColorTags(en);
          const tagMul = (etags.includes('gray') || etags.includes('black')) ? currentArmor.burnTagMul : 1;
          en.hp -= currentArmor.burnDmg * tagMul * yu4AuraMul(en);   // 普通伤害：灰/黑标记敌人增伤 burnTagMul，可被御4防御光环削减
          if (Math.random() < 0.3) spawnParticles(en.x + rand(-8, 8), en.y + rand(-8, 8), '#ff7a18', 1, 70);
          if (en.hp <= 0) killEnemy(k);
        }
        achvClearKillSrc();
      }
    }
    // 洄：每 2 秒恢复 1 生命（不超过当前装甲最大生命）；小艺连携：治疗效果 ×1.35（pilotHuiHealMul）
    if (currentArmor.id === 'hui') {
      player.regenT = (player.regenT || 0) + dt;
      if (player.regenT >= currentArmor.regenInterval) {
        player.regenT = 0;
        if (player.alive) player.hp = Math.min(player.maxHp, player.hp + currentArmor.regenHp * pilotHuiHealMul());
      }
    }
    // 天枢圣卫：圣守周期——无敌结束后开始 20s 计时，计满展开 10s「圣守窗口」；
    // 窗口内受击在伤害结算前免除（damagePlayer 拦截），窗口期间与无敌期间周期均不计时（等效 30s 一轮）
    if (currentArmor.id === 'tianshu') {
      if (player.tianshuArmedT > 0) {
        player.tianshuArmedT -= dt;
        if (player.tianshuArmedT < 0) player.tianshuArmedT = 0;   // 窗口关闭：本轮未触发即作废，周期重新计时
      } else if (player.invuln <= 0) {
        player.tianshuCycleT += dt;
        if (player.tianshuCycleT >= currentArmor.guardCycle) {
          player.tianshuCycleT = 0;
          player.tianshuArmedT = currentArmor.guardWindow;
          spawnArmorGlyphFx('⬡', currentArmor.color);   // 窗口开启提示：核心处 ⬡ 图标演出
          spawnParticles(player.x, player.y, currentArmor.color, 8, 140);
        }
      }
    }
  }

  // 清空场上所有敌弹（护盾解除 / 炸弹共用）
  function clearEnemyBullets() {
    for (const b of eBullets) spawnParticles(b.x, b.y, '#ffd166', 3, 100);
    eBullets.length = 0;
  }

  // 玩家开火锁定：许凯狗冲刺期间全程停火（主炮/僚机/斩击/爆弹统一锁定）；
  // 仅警报/进场/展开期间停止攻击；wait（等清场）阶段继续攻击残敌
  function playerFireLocked() {
    if (state.pilotDashT > 0) return true;   // 许凯狗：冲刺期间我方不会攻击
    if (bossFlow.stage === 'none' || bossFlow.stage === 'wait') return false;
    if (bossFlow.stage === 'warn') return true;   // 警报阶段一律锁定（暴风之眼汇聚入场短于警报剩余时间，不能仅靠 combatReady）
    return !enemies.some(e => e.type === 'boss' && e.combatReady);
  }

  // 最终壁垒免死无敌期间：自身射速倍率（普通弹 cooldown 与群星之杀 slashCd 同乘；倍率走注册表 invulnFireRateMul）
  function bulwarkFireRateMul() {
    return (player.bulwarkFxT > 0 && currentArmor.invulnFireRateMul) ? currentArmor.invulnFireRateMul : 1;
  }

  function respawnPlayer() {
    player.alive = true;
    player.maxHp = armorMaxHp();      // 重生复原生命上限（陵落上限债务随死亡清偿）
    player.lingluoMaxDebt = 0;
    player.hp = player.maxHp;   // 当前装甲下的每条命最大 HP
    player.x = CANVAS_W / 2;
    player.y = CANVAS_H - 90;
    player.invuln = 2 * invulnDiffMul();   // 具象：所有来源的无敌时间 +50%（含登场/重生保护）
    player.invulnBlink = false;   // 登场/重生无敌不闪动（机体保持完整可见）
    player.weapon = (state.testBoss || state.challenge) ? 4 : 3;   // 复活后火力等级默认 Lv3（BOSS 试炼 / 图鉴挑战仍固定 Lv4，与 resetGame 一致）
    player.berserk = 0;
    player.shield = 0;
    player.shieldMax = 0;         // 护盾读条分母复位
    player.bulwarkUsed = false;   // 最终壁垒：每条命一次，重生重置
    player.bulwarkFxT = 0;        // 最终壁垒：免死菱形环绕演出计时归零
    player.tianshuArmedT = 0; player.tianshuCycleT = 0;   // 天枢圣卫：圣守周期随重生重置
    player.hitCount = 0;
    player.hitFxT = 0;
    player.slashCd = 0; player.slashTarget = null; player.slashQueued = 0; player.slashGapT = 0;   // 群星之杀斩击运行态重置
    player.subCooldown = 0;      // 副武器冷却就绪
    feijianWaves.length = 0;     // 无界飞剑：未发射的飞剑波随重生清除（否则冻结在阵亡位置）
    xinRings.length = 0;         // 辛国栋之怒：灼烧火环随重生清除
  }

  // 受击计数推进（damagePlayer 与破片导弹"整轮仅计一次"共用）：非暴走时统一累计 3 次掉 1 级火力
  // 具象：受击不再降低武器等级——整个累计机制直接关闭
  function accumulateWeaponDropHit() {
    if (diffMods().noWeaponDropOnHit) return;
    if (player.weapon < 5 && player.weapon > 1) {
      player.hitCount++;
      if (player.hitCount >= WEAPON_DROP_HITS) { player.weapon--; player.hitCount = 0; }
    }
  }

  // 玩家受伤统一入口。src = 伤害来源标记（驾驶员效果挂点）：
  //   'storm'      来自暴风之眼的弹幕（风弹等投射物）
  //   'stormAoe'   来自暴风之眼的瞬时区域打击（风波 / 风柱）
  //   'stormCrash' 来自暴风之眼本体 / 其召唤的大型龙卷的碰撞伤害
  //   'aoe'        瞬时区域伤害（暴鸰爆炸 / 破片范围伤害 / 风暴编织者雷霆轰击）
  //   'missile'    导弹伤害（先兆者导弹）
  //   天秀忧郁王子：'storm'/'stormAoe' 削减 -50%、'stormCrash' -60%，受击触发增益（50% 闪避 + 攻速 +80% + 量表 +18%，5s）
  //   可莉：'aoe' / 'stormAoe' 瞬时区域伤害 -30%、'missile' 导弹伤害 -30%
    //   （长条激光 / 持续灼烧 / 撞击伤害不打标，天然不适用）；哈基米闪避对所有来源生效
  // cause = 成就系统死亡原因标记（02-achievements achvOnDeath；见该文件头部 cause 取值表），仅掉命时消费
  function damagePlayer(amount, invulnMul = 1, ignoreInvuln = false, isMissile = false, src = null, cause = null) {
    if (!player.alive) return false;
    if (!ignoreInvuln && player.invuln > 0) return false;   // 无敌帧内免疫（ignoreInvuln=true 时穿透无敌，如破片后两发导弹）
    // 天枢圣卫：无敌期间免疫破片导弹的"无视无敌"穿透（ignoreInvuln 仅破片后续导弹使用）
    if (ignoreInvuln && player.invuln > 0 && currentArmor.id === 'tianshu') return false;
    if (player.shield > 0 || player.crystalShield > 0) return false;   // 量子护盾 / 七日澜心结晶护盾期间免疫（无视无敌 ≠ 无视护盾）
    // 天枢圣卫：圣守窗口——窗口内受击在伤害结算前触发无敌，该次伤害完全免除；
    // 无敌为常规受击无敌（吃 invulnDiffMul × invulnMul，含天枢自身 +60% 与难度倍率），带受击反馈但不扣血、不计受击掉级数
    if (currentArmor.id === 'tianshu' && player.tianshuArmedT > 0) {
      player.tianshuArmedT = 0;   // 一次性消耗：窗口关闭
      player.tianshuCycleT = 0;   // 触发后等无敌结束再重新计时（updatePlayer 以 invuln<=0 门控）
      player.invuln = PLAYER_CFG.invulnTime * invulnDiffMul() * invulnMul; player.invulnBlink = true;
      spawnArmorGlyphFx('⬡', currentArmor.color);
      spawnParticles(player.x, player.y, currentArmor.color, 14, 190);
      shake(3, 0.15);
      return true;   // 镜像哈基米闪避：有受击反馈、无血量结算、不计入受击掉级计数
    }
    // 天秀忧郁王子：暴风之眼伤害削减（在任何结算前套用削减）
    const isStormSrc = src === 'storm' || src === 'stormAoe' || src === 'stormCrash';
    if (isStormSrc && hasPilot('tianxiu')) {
      amount *= 1 - (src === 'stormCrash' ? PILOTS.tianxiu.stormCrashCut : PILOTS.tianxiu.stormDmgCut);
    }
    // 可莉：瞬时区域伤害 / 导弹伤害削减（'stormAoe' 同时属于天秀与可莉的适用范围，两个乘区各自乘算）
    if (hasPilot('keli') && (src === 'aoe' || src === 'missile' || src === 'stormAoe')) {
      amount *= 1 - (src === 'missile' ? PILOTS.keli.missileCut : PILOTS.keli.aoeCut);
    }
    // 大无垠之王：BOSS 战累积的受到伤害提升（怒意的代价）
    if (hasPilot('king') && state.kingTaken > 0) amount *= 1 + state.kingTaken;
    // 哈基米大王：暴走期 35% 概率闪避（失败 +5% 累积、成功清零；加成跨暴走保留——只在成功时清零）。
    // 闪避效果延长至暴走结束后 4s（tailDur，覆盖后暴走的最危险窗口）；概率累积仅在暴走期间进行。
    // 闪避不受伤害，但触发受击无敌与受击反馈——无敌时长为正常受击的 70%（PLAYER_CFG.dodgeInvulnMul，全闪避统一）
    if (hasPilot('hajimi') && (player.weapon === 5 || state.hajimiTailT > 0)) {
      if (Math.random() < PILOTS.hajimi.dodgeBase + state.hajimiDodgeBonus) {
        state.hajimiDodgeBonus = 0;
        player.invuln = PLAYER_CFG.invulnTime * PLAYER_CFG.dodgeInvulnMul * invulnDiffMul() * invulnMul; player.invulnBlink = true;
        shake(3, 0.15);
        player.hitFxT = 0.28;
        state.hurt = Math.min(1, state.hurt + 0.3);
        playerHitFx.push({ x: player.x, y: player.y, t: 0, max: 0.4, r: 16, seed: Math.random() * 10 });
        spawnParticles(player.x, player.y, '#ff9ab5', 10, 170);
        return true;
      }
      if (player.weapon === 5) state.hajimiDodgeBonus += PILOTS.hajimi.dodgeBonusStep;
    }
    // 祈星：受到伤害时 30% 概率伤害减半，单次伤害 >40 时概率提升到 60%（概率走注册表）；触发时核心处图标演出
    if (currentArmor.id === 'qixing' && Math.random() < (amount > 40 ? currentArmor.halveChanceBig : currentArmor.halveChance)) {
      amount *= 0.5;
      spawnArmorGlyphFx('✧', currentArmor.color);
    }
    // 测试模式（图鉴挑战）：玩家不再无敌 —— 照常扣血，但不掉命、不掉武器等级；血量 ≤0 立刻重置为满（视为不死）
    if (state.challenge) {
      player.hp -= amount;
      player.invuln = PLAYER_CFG.invulnTime * invulnDiffMul() * invulnMul; player.invulnBlink = true;   // 受击无敌：闪动提示（具象：无敌时间 +50%）
      shake(3, 0.15);   // 受击震屏较弱
      player.hitFxT = 0.28;   // 机体受击闪白
      state.hurt = Math.min(1, state.hurt + 0.4);   // 屏幕边缘红晕（较弱）
      playerHitFx.push({ x: player.x, y: player.y, t: 0, max: 0.4, r: 16, seed: Math.random() * 10 });   // 闪核 + 冲击环 + 火花
      spawnParticles(player.x, player.y, '#7ce7ff', 10, 160);
      if (player.hp <= 0) {
        player.hp = player.maxHp || PLAYER_CFG.maxHp;   // 血量归零：立刻重置生命值为满，不死亡
        hpFillFastRefill();   // 血条回满动画提速 ×300%
      }
      return true;
    }
    player.hp -= amount;
    achvNoteDamage();   // 成就：本局已受伤（无伤成就 / BOSS 战无伤标记）
    player.invuln = PLAYER_CFG.invulnTime * invulnDiffMul() * invulnMul; player.invulnBlink = true;   // 受击无敌：闪动提示（具象：无敌时间 +50%）
    shake(4, 0.2);   // 受击震屏较弱（掉命时的强震屏另行处理）
    player.hitFxT = 0.28;   // 机体受击闪白
    state.hurt = Math.min(1, state.hurt + 0.6);   // 屏幕边缘红晕（叠加有上限）
    spawnParticles(player.x, player.y, '#7ce7ff', 12, 180);
    spawnParticles(player.x, player.y, '#ff6b81', 10, 240);   // 红色碎片
    spawnParticles(player.x, player.y, '#ffd166', 6, 200);    // 金色火花
    playerHitFx.push({ x: player.x, y: player.y, t: 0, max: 0.42, r: 18, seed: Math.random() * 10 });   // 白热闪核 + 红橙冲击环 + 迸溅火花线
    // 被击中掉火力：统一累计受击 3 次掉一层（BOSS 战同规则）；暴走（Lv5）/护盾期间不计也不掉；
    // 导弹命中不在此处计数（isMissile）：先兆者导弹自带"-1 级"结算、破片导弹整轮仅计一次（由 06-enemy 显式调 accumulateWeaponDropHit）
    if (!isMissile) accumulateWeaponDropHit();
    if (player.hp <= 0) {
      // 最终壁垒：每条命一次——致死伤害（含导弹等强制击杀）不死后恢复 1 点生命、3s 无敌、清除 250px 内敌弹
      if (tryBulwarkCheatDeath()) return true;
      player.hp = 0;
      player.alive = false;
      state.lives--;
      state.hurt = 1;   // 掉命：红晕拉满
      spawnParticles(player.x, player.y, '#ff4d6d', 40, 320);
      playerHitFx.push({ x: player.x, y: player.y, t: 0, max: 0.55, r: 26, seed: Math.random() * 10 });   // 掉命：更大的爆闪冲击环
      shake(16, 0.6);
      // 成就：掉命原因结算（cause 缺省时导弹伤害由 src='missile' 派生；finalDeath = 是否最后一命）
      achvOnDeath(cause || (src === 'missile' ? 'missile' : null), state.lives <= 0);
      handlePlayerDeath();
    }
    return true;
  }

  // 掉命后统一收尾（damagePlayer / 06-enemy BOSS 接触 / 焦香灼烧三条死亡路径共用）：
  //   常规：最后一条命 → 700ms 后失败结算；仍有余命 → 重生倒计时
  //   埃逸：任何掉命都先置蓄力自爆（updatePlayer 推进）；最后一条命不进失败结算——
  //         延后到自爆结算完成后，若自爆击杀 BOSS 带来胜利（bossFlow.victoryDelay）则跳过失败结算
  function handlePlayerDeath() {
    if (hasPilot('aiyi')) {
      player.aiyiChargeT = state.lives <= 0 ? PILOTS.aiyi.chargeDurFinal : PILOTS.aiyi.chargeDur;
      if (state.lives <= 0) state.aiyiFinalDeath = true;
    }
    if (state.lives <= 0) {
      if (!hasPilot('aiyi')) setTimeout(() => endGame(), 700);
    } else {
      player.respawnTimer = PLAYER_CFG.respawnTime;
    }
  }

  // 埃逸：死亡自爆——蓄力结束后的爆炸结算（蓄力期收缩波演出见 10-draw-world drawAiyiFx）：
  //   爆炸后一道（最后一条命：数道错峰）极宽冲击波自死亡地点快速扩散至全场，
  //   波前碰到的敌人立刻结算（见 updateAiyiWaves）：
  //   最后一条命（aiyiFinalDeath）：被波及的所有敌人（含 BOSS）立刻被击杀，可能带来胜利；
  //   非最后一条命：非 BOSS 敌人立刻击杀，BOSS 吃 bossDmg 固定伤害（若因此击杀走正常击毁流程）。
  // 被自爆击杀的敌人仅得 20% 分数（killEnemy 经 state.aiyiSelfDestruct 结算；扩散波存续期间保持置位）。
  // 最后一条命的死亡：爆炸后若自爆未带来胜利（无 victoryDelay），待波扫过全场再进失败结算
  function aiyiSelfDestruct() {
    const finalBlow = state.aiyiFinalDeath;   // 最后一条命：数道波、全场秒杀、超强演出
    spawnParticles(player.x, player.y, '#ffffff', finalBlow ? 96 : 50, finalBlow ? 600 : 420);
    spawnParticles(player.x, player.y, '#ff4d6d', finalBlow ? 80 : 40, finalBlow ? 540 : 380);
    spawnParticles(player.x, player.y, '#ffb545', finalBlow ? 60 : 30, finalBlow ? 480 : 320);
    if (finalBlow) {
      shake(30, 2.0);   // 最终自爆：震屏 2s（幅度随时间线性衰减，见 render 的 decay 折算）
      state.flash = 1.0;
    } else {
      shake(18, 0.8);
      state.flash = 0.5;
    }
    state.aiyiSelfDestruct = true;
    const maxR = Math.hypot(CANVAS_W, CANVAS_H) + 80;   // 自任意死亡点扩散均可覆盖全屏
    if (finalBlow) {
      for (let k = 0; k < PILOTS.aiyi.finalWaveCount; k++) {
        state.aiyiWaves.push({ x: player.x, y: player.y, r: 0, id: ++state.aiyiWaveSeq, final: true,
          speed: PILOTS.aiyi.waveSpeed * (1 + k * 0.12), delay: k * 0.10, maxR });   // 三道错峰 0.1s
      }
    } else {
      state.aiyiWaves.push({ x: player.x, y: player.y, r: 0, id: ++state.aiyiWaveSeq, final: false,
        speed: PILOTS.aiyi.waveSpeed, delay: 0, maxR });
    }
    if (state.aiyiFinalDeath) {
      state.aiyiFinalDeath = false;
      // 自爆未带来胜利：波扫过全场后进失败结算。判定放在回调内——扩散波需 ~0.4s 才触到 BOSS，
      // 引爆瞬间 victoryDelay 必为 0，提前判定会把「炸死 BOSS 的试炼/终局」误判成失败（战机陨落）
      setTimeout(() => {
        if (state.mode === 'playing' && state.lives <= 0 &&
            !bossFlow.victoryDelay && !state.selfDestructVictory) endGame();
      }, 800);
    }
  }

  // 埃逸扩散波推进：波半径快速扩张，波前触碰的敌人立刻结算（每道波对每个敌人仅一次，_sdWaveId 去重）——
  // 最后一条命：被波及者一律立刻击杀（含 BOSS，可能触发胜利）；非最后一条命：非 BOSS 击杀、BOSS 吃固定伤害。
  // 全部波扫出全场后复位 state.aiyiSelfDestruct（此后击杀恢复正常得分）
  function updateAiyiWaves(dt) {
    for (let i = state.aiyiWaves.length - 1; i >= 0; i--) {
      const w = state.aiyiWaves[i];
      if (w.delay > 0) { w.delay -= dt; continue; }
      w.r += w.speed * dt;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        // 无视虚化（phase > 0 的虚化护盾敌人照常结算）；BOSS 死亡召唤体（_sdImmune，如暴风之眼
        // 死后召唤的风暴编织者）不受波伤害——否则终局波秒掉暴风之眼会顺带秒掉本应登场的二阶段
        if (!enemyOnScreen(e) || e.dying || e._sdImmune) continue;
        if (e._sdWaveId === w.id) continue;   // 本道波已结算过该敌人
        if (Math.hypot(e.x - w.x, e.y - w.y) - Math.max(e.w, e.h) / 2 > w.r) continue;   // 波前未及
        e._sdWaveId = w.id;
        if (w.final) {
          killEnemy(j);
        } else if (e.type === 'boss') {
          e.hp -= PILOTS.aiyi.bossDmg;   // 指定伤害（真实结算；若因此击杀走正常击毁流程）
          spawnParticles(e.x, e.y, '#ffffff', 24, 280);
          if (e.hp <= 0) killEnemy(j);
        } else {
          killEnemy(j);
        }
      }
      if (w.r >= w.maxR) state.aiyiWaves.splice(i, 1);
    }
    if (!state.aiyiWaves.length) state.aiyiSelfDestruct = false;
  }

  // 测试模式（图鉴挑战）受伤入口：供绕过 damagePlayer 的持续伤害源使用（BOSS 接触 / 焦香灼烧 / 先兆者导弹）。
  // 照常扣血但不掉命、不掉武器等级；血量 ≤0 立刻重置为满（测试模式视为不死）；护盾期间免疫
  function testDamagePlayer(amount) {
    if (!player.alive || player.shield > 0 || player.crystalShield > 0) return false;
    // 祈星：同 damagePlayer（测试模式同样生效，概率走注册表）；触发时核心处图标演出
    if (currentArmor.id === 'qixing' && Math.random() < (amount > 40 ? currentArmor.halveChanceBig : currentArmor.halveChance)) {
      amount *= 0.5;
      spawnArmorGlyphFx('✧', currentArmor.color);
    }
    player.hp -= amount;
    if (player.hp <= 0) {
      player.hp = player.maxHp || PLAYER_CFG.maxHp;
      hpFillFastRefill();   // 血条回满动画提速 ×300%
    }
    return true;
  }

  // 测试模式血量回满：血条动画临时挂 fast 类（width 过渡 0.18s → 0.06s，速度 ×300%），过渡完成后恢复正常速度
  function hpFillFastRefill() {
    hpFill.classList.add('fast');
    clearTimeout(hpFillFastRefill.t);
    hpFillFastRefill.t = setTimeout(() => hpFill.classList.remove('fast'), 120);
  }

  // 澄月：触发暴走（新触发与暴走续时均判定一次）时概率获得量子护盾——
  // 常规 15% / BOSS 战 50%（每个 BOSS 限一次；时长 6s 与通用量子护盾一致，走注册表 ARMORS.chengyue.shieldDur）
  function tryChengyueShield() {
    if (currentArmor.id !== 'chengyue') return;
    const bossFight = bossFlow.stage === 'fight';
    const chance = bossFight ? currentArmor.bossChance : currentArmor.chance;
    if (Math.random() >= chance) return;
    if (bossFight) {
      const boss = enemies.find(en => en.type === 'boss');
      if (!boss || boss.chengyueUsed) return;
      boss.chengyueUsed = true;
    }
    player.shield = currentArmor.shieldDur || 6;
    player.shieldMax = player.shield;   // 读条分母同步（澄月 6s，与通用量子护盾一致）
    spawnArmorGlyphFx('☾', currentArmor.color);   // 核心处澄月图标演出（淡青☾渐显-放大-渐隐）
    spawnParticles(player.x, player.y, '#6fe3ff', 18, 200);
  }

  // ---------- 装甲技能（量表型，按 F 触发；注册表见 01-config ARMOR_SKILLS，后续新技能在此扩展实现） ----------

  // 收集水晶时填充当前装甲的技能量表（amount = 本颗水晶的分数；七日澜心填满需 gaugeCrystalScore 分）
  // firstBoss = 水晶是否来自首轮 BOSS（FIRST_ROUND_BOSSES）：对量表收益按 def.firstBossBonus 额外加成（+400% → ×5）
  // 结晶护盾持续期间（player.crystalShield > 0）量表停止累计（水晶得分与吸收入场照常）
  function armorSkillGain(amount, firstBoss = false) {
    const def = ARMOR_SKILLS[currentArmor.id];
    if (!def) return;
    if (player.crystalShield > 0) return;
    if (firstBoss && def.firstBossBonus) amount *= def.firstBossBonus;
    state.armorSkillGauge = Math.min(1, (state.armorSkillGauge || 0) + amount / def.gaugeCrystalScore);
  }

  // 按 F 触发装甲技能：量表满 1 时消耗并执行当前装甲的技能（七日澜心：水晶护盾环绕 3s）
  // 返回 true = 触发成功（14-main 的 F 键入口调用）
  function triggerArmorSkill() {
    if (state.mode !== 'playing' || state.paused) return false;
    const def = ARMOR_SKILLS[currentArmor.id];
    if (!def || (state.armorSkillGauge || 0) < 1) return false;
    state.armorSkillGauge = 0;
    achvNoteArmorSkillUsed();   // 成就：忘了——装甲技能已使用
    if (currentArmor.id === 'lanxin') {
      player.crystalShield = def.dur;
      spawnParticles(player.x, player.y, def.color, 20, 180);
      shake(3, 0.15);
    }
    return true;
  }

  // ---------- 天秀忧郁王子：暴风之眼对策 + 白色量表 + 友方大风暴 ----------

  // 生成一个友方大风暴（技能释放与调试连发共用）：机体前方、满存活期配置 + 入场粒子。
  // dbg：按 8 rapid 模式期间发射的风暴向上移速 ×dbgRiseSpdMul（出生时定格，早先发出的不受影响）
  function launchFriendStorm() {
    friendStorms.push({
      x: player.x, y: player.y - 58,
      t: 0, dur: PRINCE_STORM.dur,
      r: PRINCE_STORM.r,
      dbg: state.tianxiuDebugSpam,
      fireT: 0.3, hitT: PRINCE_STORM.tickIv,
    });
    spawnParticles(player.x, player.y, '#dff3ff', 26, 260);
  }

  // 当前是否处于暴风之眼 BOSS 战（本体存活、非渐隐演出期；不含风暴编织者）
  function stormBossFightActive() {
    return enemies.some(e => e.type === 'boss' && e.bossId === 'storm' && !e.dying);
  }

  // 暴风之眼伤害削减倍率（仅天秀忧郁王子生效）：kind='storm' 技能弹幕 -50% / 'stormCrash' 碰撞 -60%
  // 供 06-enemy 的暴风之眼接触持续掉血路径使用（弹幕路径在 damagePlayer 内部处理）
  function pilotStormContactMul(kind) {
    if (!hasPilot('tianxiu')) return 1;
    return 1 - (kind === 'stormCrash' ? PILOTS.tianxiu.stormCrashCut : PILOTS.tianxiu.stormDmgCut);
  }

  // 天秀忧郁王子：友方大风暴（风弹 / 主体接触）击杀 1/2/3/4 类敌人时量表立刻增加
  //（PILOTS.tianxiu.stormKillGain 注册表按敌人类别取值；BOSS / 无类别敌机不计）
  function princeStormKillGain(e) {
    const cls = ENEMY_CLASS[e.type];
    const gain = cls ? PILOTS.tianxiu.stormKillGain && PILOTS.tianxiu.stormKillGain[cls] : 0;
    if (gain) state.princeGauge = Math.min(1, (state.princeGauge || 0) + gain);
  }

  // 暴风之眼战期间我方其余伤害 -60%（友方大风暴及其风弹不受此削减、另享 ×3 加成）。
  // isStormBullet = 该伤害是否来自友方大风暴系统（风弹 / 主体接触）
  function princeOtherDmgMul(isStormBullet) {
    if (!hasPilot('tianxiu') || isStormBullet) return 1;
    return stormBossFightActive() ? (1 - PILOTS.tianxiu.otherDmgCut) : 1;
  }

  // 大无垠之王：BOSS 战累积的造成伤害倍率（怒意蔓延——主炮/僚机/斩击/爆弹/友方风暴均生效）
  function kingDmgBonusMul() {
    return (hasPilot('king') && state.kingDmg > 0) ? 1 + state.kingDmg : 1;
  }

  // 驾驶员逐帧状态推进（14-main 主循环调用，位于 updateCrystals 之后）：
  //   陵落：Q 技能冷却倒计时（开局技力条为空 = 冷却满值起步）
  //   大无垠之王：BOSS 战期间累积 造成伤害 +1%/2s、受到伤害 +1%/4s（多阶段切换 ×phaseKeep / 阶段结束清零见 06-enemy killEnemy）
  //   天秀：白色量表充能——非水晶得分差分（水晶得分经 princeCrystalGain 扣除）+ BOSS 战按秒充能
  //        （任意 BOSS 战 +2%/s；暴风之眼战 +6%/s）；闪避 / 攻速增益倒计时
  function updatePilotStatus(dt) {
    // 许凯狗冲刺：所有驾驶员计时表 / 量表冻结（大狗导弹雨不计时、陵落冷却不走、
    // 天秀量表不充能、凌漓计数不涨、哈基米存续不走等）；天秀得分差分账目照常结转（避免冲刺结束后一次性回填）
    const dashFrozen = state.pilotDashT > 0;
    // 陵落：生命上限债务恢复（每秒 +2，不回当前血量，回满即止——单次触发 40 ÷ 2/s = 恰好 20s）
    if (!dashFrozen && player.lingluoMaxDebt > 0) {
      const rec = Math.min(player.lingluoMaxDebt, PILOTS.lingluo.maxHpRegen * dt);
      player.maxHp += rec;
      player.lingluoMaxDebt -= rec;
    }
    // 哈基米大王：暴走结束后的闪避存续倒计时
    if (!dashFrozen && state.hajimiTailT > 0) state.hajimiTailT = Math.max(0, state.hajimiTailT - dt);
    if (!dashFrozen && hasPilot('lingluo') && state.lingluoCdT > 0) {
      state.lingluoCdT = Math.max(0, state.lingluoCdT - dt);
    }
    if (hasPilot('king') && bossFlow.stage === 'fight') {
      state.kingDmg += PILOTS.king.dmgRate * dt;
      state.kingTaken += PILOTS.king.takenRate * dt;
    }
    // 大狗：每隔 10~22s 召唤一波 8 颗导弹雨（自下而上，见 launchDagouWave）；
    // 召唤前 warnLead 秒屏幕下方渐显蓝光预警（绘制见 10-draw-world drawDagouWarn），发射后快速渐隐；
    // 连射链：每波发射后 chainChance 概率在 chainGap 秒后再来一波（连射波同样可继续连射），伤害逐波 ×chainDmgMul；
    // 警报 / BOSS 登场动画期间（BOSS 登场虚化窗口）与许凯狗冲刺期间计时暂停（连射链同样冻结）
    if (hasPilot('dagou')) {
      if (!bossEntranceActive() && !dashFrozen) {
        state.dagouMissT -= dt;
        if (state.dagouDebugRapid) achvAddDagouCheat(dt);   // 成就：捣蛋来袭——连发作弊累计时长
      }
      for (let i = state.dagouChains.length - 1; i >= 0; i--) {
        const c = state.dagouChains[i];
        if (!bossEntranceActive() && !dashFrozen) c.t -= dt;
        if (c.t <= 0) { state.dagouChains.splice(i, 1); launchDagouWave(c.lv); }
      }
      if (state.dagouWarnFadeT > 0) state.dagouWarnFadeT = Math.max(0, state.dagouWarnFadeT - dt);
      if (state.dagouMissT <= 0) {
        state.dagouMissT = dagouWaveIv(state.dagouDebugRapid);   // 连发模式 0.2~1s；正常 10~22s
        state.dagouWarnFadeT = PILOTS.dagou.warnFade;
        launchDagouWave(0);
      }
    }
    // 凌漓：隐藏计数表——填满 2400 分立刻清空并释放淡粉冲击波（清除 250px 内敌弹，不震屏）；
    // 连携七日澜心（同时装备该护甲）：澜心量表充满的瞬间（跨过 1）额外释放一次同款冲击波，
    // 且凌漓计数减少 1000（不足 1000 则减到负数）；冲刺期间量表冻结（快照照常结转，避免解冻后误判「充满瞬间」）
    if (hasPilot('lingli')) {
      if (!dashFrozen && state.lingliGauge >= PILOTS.lingli.gaugeFull) {
        state.lingliGauge = 0;
        lingliBurst();
      }
      const ag = state.armorSkillGauge || 0;
      if (!dashFrozen && currentArmor.id === 'lanxin' && state.lingliArmorGaugePrev < 1 && ag >= 1) {
        lingliBurst();
        state.lingliGauge -= PILOTS.lingli.lanxinDrain;
      }
      state.lingliArmorGaugePrev = ag;
    }
    if (!hasPilot('tianxiu')) return;
    if (!dashFrozen && bossFlow.stage === 'fight' && player.alive) {
      // 暴风之眼战：每秒充能 8%~12% 随机（逐帧按随机速率折算）；其他 BOSS 战固定 +2%/s
      const rate = stormBossFightActive() ? rand(PILOTS.tianxiu.stormChargeMin, PILOTS.tianxiu.stormChargeMax) : PILOTS.tianxiu.bossCharge;
      state.princeGauge = Math.min(1, state.princeGauge + rate * dt);
    }
    // 连发风暴（按 8 切换）：每 0.4~1.4s 向前发射一个友方大风暴（无视量表）；
    // 警报 / BOSS 登场动画期间与正常技能同样封锁，封锁解除瞬间立即补发第一个
    if (state.tianxiuDebugSpam && player.alive) {
      if (bossEntranceActive()) {
        state.tianxiuDebugSpamT = 0;
      } else {
        state.tianxiuDebugSpamT -= dt;
        if (state.tianxiuDebugSpamT <= 0) {
          state.tianxiuDebugSpamT = 0.4 + Math.random() * 1;
          launchFriendStorm();
        }
      }
    }
    const delta = state.score - state.princeScoreBase - state.princeCrystalGain;
    state.princeScoreBase = state.score;
    state.princeCrystalGain = 0;
    if (delta > 0 && !dashFrozen) state.princeGauge = Math.min(1, state.princeGauge + delta / PILOTS.tianxiu.gaugeFull);
  }

  // 驾驶员技能触发（14-main 键盘入口）：天秀忧郁王子、陵落均按 Q——天秀：友方大风暴（量表满）；陵落：强行暴走（冷却结束）
  function triggerPilotSkill(keyName = 'q') {
    if (state.mode !== 'playing' || state.paused) return false;
    // 警报 / BOSS 登场动画期间不可释放技能（入场演出收尾、battle 尚未正式展开）
    if (bossEntranceActive()) return false;
    // 天秀忧郁王子：量表满时向前方召唤友方大风暴——暴风之眼同款风暴的我方版
    if (hasPilot('tianxiu') && keyName === 'q') {
      if (state.princeGauge < 1) return false;
      state.princeGauge = 0;
      launchFriendStorm();
      shake(5, 0.25);
      achvNotePilotSkillUsed();   // 成就：忘了——天秀 Q 技能已使用
      return true;
    }
    // 陵落：按 Q 触发暴走——立刻损失 40 生命（不会致死）；冷却 40s（开局技力条为空不能释放）。
    // 暴走中再次触发（剩余 x 秒）：暴走时间重设为 默认持续 + y（y = min{1, x}），比单纯续时略多、不至溢出
    if (hasPilot('lingluo') && keyName === 'q') {
      if (!player.alive || state.lingluoCdT > 0) return false;
      state.lingluoCdT = PILOTS.lingluo.cd;
      achvNoteLingluoSkill();   // 成就：疯狂杀戮——陵落 Q 释放计数；忘了——技能已使用
      achvNotePilotSkillUsed();
      // 代价：扣除 40 生命上限（血条缩短，下限 1）并至少扣除 40 当前生命（不低于 1，
      // 超出新上限的部分裁剪）；上限随后每秒回 2（不回当前血量，重生/重开复原）
      const cut = Math.min(PILOTS.lingluo.hpCost, player.maxHp - 1);
      player.maxHp -= cut;
      player.lingluoMaxDebt += cut;
      player.hp = Math.max(1, Math.min(player.hp - PILOTS.lingluo.hpCost, player.maxHp));
      spawnParticles(player.x, player.y, '#ff4d6d', 20, 240);
      spawnParticles(player.x, player.y, '#c084fc', 16, 200);
      if (player.weapon === 5) {
        const y = Math.min(1, player.berserk);
        player.berserk = BERSERK.duration + y;
        player.berserkBanner = 1.0;
        tryChengyueShield();   // 澄月：暴走续时判定一次（与 pickupBerserk 同约定）
      } else {
        player.weapon = 5;
        player.berserk = BERSERK.duration;
        player.berserkBanner = 2.0;
        tryChengyueShield();   // 澄月：新触发暴走判定一次
        shake(5, 0.25);
        berserkBurst.active = true;
        berserkBurst.t = 0;
        berserkBurst.x = player.x;
        berserkBurst.y = player.y;
        berserkBurst.big = true;
      }
      return true;
    }
    return false;
  }

  // 凌漓：淡粉冲击波（七日澜心结晶护盾消失同款）——清除机体周围 250px 内所有敌方子弹。
  // 与澜心护盾消失的差异：不震屏（crystalBurst 冲击波环视觉完全一致）
  function lingliBurst() {
    crystalBurst.active = true;
    crystalBurst.t = 0;
    crystalBurst.x = player.x;
    crystalBurst.y = player.y;
    clearEnemyBulletsNear(player.x, player.y, 250);
    spawnParticles(player.x, player.y, '#FFC0CB', 20, 200);
  }

  // 大狗：召唤一波 8 颗导弹雨——均匀分布（屏宽 / count 等分），中间两发先射出、随后向两侧
  // 两两错峰（相邻两拍间隔 launchGap，很小）；导弹自下而上射出，白蓝渐变先兆者同款（绘制见 09-draw-ships）；
  // lv = 连射链层级（0/缺省 = 常规波）：发射后 chainChance 概率在 chainGap 秒后再来一波（lv+1），伤害按 chainDmgMul^lv 乘算
  function launchDagouWave(lv) {
    const cfg = PILOTS.dagou;
    const n = cfg.count;
    const dmgMul = Math.pow(cfg.chainDmgMul, lv || 0);
    for (let k = 0; k < n; k++) {
      const x = (k + 0.5) * CANVAS_W / n;
      // 发射序：按距屏幕中线的远近两两配对（k=3/4 → 第 0 拍，2/5 → 1，1/6 → 2，0/7 → 3）
      const order = Math.abs((n - 1) / 2 - k) - 0.5;
      dagouMissiles.push({ x, y: CANVAS_H + 24, vy: -cfg.speed, r: cfg.r, delay: order * cfg.launchGap, dmgMul });
    }
    if (cfg.chainChance && Math.random() < cfg.chainChance) {
      state.dagouChains.push({ t: cfg.chainGap, lv: (lv || 0) + 1 });
    }
    spawnParticles(CANVAS_W / 2, CANVAS_H - 8, '#9fd0ff', 14, 170);   // 底部少量水花粒子（无震屏：入场演出克制）
  }

  // 大狗导弹雨推进：发射延迟归零后上行飞行；命中首个敌人（含 BOSS）即小范围溅射并移除；
  //   下方低区（lowZonePct 屏高线以下）命中不爆炸——改为对命中目标直接造成 lowZoneDmg 伤害
  function updateDagouMissiles(dt) {
    const cfg = PILOTS.dagou;
    achvSetKillSrc('dagou');   // 成就：大狗导弹击杀来源（叮咚——炮火先兆者）
    for (let i = dagouMissiles.length - 1; i >= 0; i--) {
      const m = dagouMissiles[i];
      if (m.delay > 0) { m.delay -= dt; continue; }
      m.y += m.vy * dt;
      if (m.vx) m.x += m.vx * dt;   // 捣蛋来袭：斜向飞行的直射导弹
      if (Math.random() < 0.6) spawnParticles(m.x + rand(-2, 2), m.y + m.r * 2.5, '#9fd0ff', 1, 40);   // 尾焰余粒
      let hit = null;
      for (const e of enemies) {
        if (!enemyOnScreen(e) || e.dying || e.phase > 0) continue;
        if (e.type === 'boss' && bossEntranceActive()) continue;   // 登场虚化 BOSS：导弹雨穿透不命中
        if (Math.abs(m.x - e.x) < e.w / 2 + m.r && Math.abs(m.y - e.y) < e.h / 2 + m.r) { hit = e; break; }
      }
      if (hit) {
        if (m.sub) {
          // 捣蛋来袭（副武器直射弹）：无低区规则（自机体发射，永远低于低区线），命中即按自带伤害/半径爆炸
          dagouMissileBlast(m.x, m.y, m.dmg, m.blastR);
        } else if (m.y > CANVAS_H * cfg.lowZonePct) {
          // 低区直击：无爆炸无溅射，仅对命中目标结算（轻微粒子反馈）；击杀走完整流程
          spawnParticles(m.x, m.y, '#dff3ff', 6, 150);
          hit.hp -= cfg.lowZoneDmg * (m.dmgMul || 1) * kingDmgBonusMul();
          if (hit.hp <= 0) { const j = enemies.indexOf(hit); if (j >= 0) killEnemy(j); }
        } else {
          dagouMissileBlast(m.x, m.y, cfg.dmg * (m.dmgMul || 1), cfg.blastR);
        }
        dagouMissiles.splice(i, 1);
        continue;
      }
      if (m.y < -40 || m.x < -40 || m.x > CANVAS_W + 40) dagouMissiles.splice(i, 1);
    }
    achvClearKillSrc();
  }

  // 大狗导弹溅射：对命中点周围小范围内的敌人造成爆炸伤害（大狗雨 600 / 捣蛋来袭按弹体自带 dmg；
  // 大无垠之王累积增伤同样生效）
  function dagouMissileBlast(x, y, dmg, blastR) {
    spawnParticles(x, y, '#dff3ff', 20, 260);
    spawnParticles(x, y, '#7fb8ff', 14, 220);
    const killed = [];
    for (const e of enemies) {
      if (!enemyOnScreen(e) || e.dying || e.phase > 0) continue;
      if (e.type === 'boss' && bossEntranceActive()) continue;   // 登场虚化 BOSS：溅射伤害穿透
      if (Math.hypot(e.x - x, e.y - y) > blastR + Math.max(e.w, e.h) / 2) continue;
      e.hp -= dmg * kingDmgBonusMul();   // BOSS 不再减免（原 bossDmg 500 已移除）
      if (e.hp <= 0) killed.push(e);
    }
    for (const t of killed) {
      const j = enemies.indexOf(t);
      if (j >= 0) killEnemy(j);
    }
  }

  // 友方大风暴推进：向上缓慢推进；风暴本体绘制与大型龙卷（暴风之眼召唤物）一致（见 10-draw-world drawFriendStorms）；
  // 风弹走大型龙卷同款随机喷射——每 0.20~0.30s 自机体内随机点射出 2 发椭圆风条（低初速沿飞行方向加速至 408.1）；
  // 天秀限定：射弹仅朝前方 240° 扇形（以竖直向上为中心 ±120°，正下方 ±60° 扇区不射）；
  // 主体接触伤害按 tick 周期对范围内敌人结算。暴风之眼战期间伤害 ×stormFightDmgMul（+200%）
  function updateFriendStorms(dt) {
    const mul = stormBossFightActive() ? PRINCE_STORM.stormFightDmgMul : 1;
    for (let i = friendStorms.length - 1; i >= 0; i--) {
      const s = friendStorms[i];
      s.t += dt;
      s.y -= PRINCE_STORM.riseSpd * (s.dbg ? PRINCE_STORM.dbgRiseSpdMul : 1) * dt;
      // 风弹：大型龙卷同款随机喷射（发射点 = 体内随机点，比例同大型龙卷 w×0.2 / h×0.3）
      s.fireT -= dt;
      if (s.fireT <= 0 && s.t > 0.3) {
        s.fireT = rand(PRINCE_STORM.fireIvMin, PRINCE_STORM.fireIvMax);
        for (let k = 0; k < PRINCE_STORM.bulletCount; k++) {
          // 前方 240° 扇形内均匀取角：竖直向上（−π/2）±120° → [−7π/6, π/6]
          const ang = -Math.PI * 7 / 6 + Math.random() * Math.PI * 4 / 3;
          pBullets.push({
            x: s.x + rand(-s.r * 0.2, s.r * 0.2), y: s.y + rand(-s.r * 0.3, s.r * 0.3),
            vx: Math.cos(ang) * PRINCE_STORM.bulletSpeed0,
            vy: Math.sin(ang) * PRINCE_STORM.bulletSpeed0,
            r: PRINCE_STORM.bulletR, dmg: PRINCE_STORM.bulletDmg * mul, color: '#dff3ff',
            princeStorm: true, lv: 1,
            accel: PRINCE_STORM.bulletAccel, maxSpeed: PRINCE_STORM.bulletMaxSpeed,
            len: PRINCE_STORM.bulletLen0, lenTarget: PRINCE_STORM.bulletLenMax, growRate: PRINCE_STORM.growRate,
          });
        }
      }
      // 主体接触伤害（可被御4力场削减；虚化敌人不受影响）
      s.hitT -= dt;
      if (s.hitT <= 0) {
        s.hitT = PRINCE_STORM.tickIv;
        const killed = [];
        for (const e of enemies) {
          if (!enemyOnScreen(e) || e.dying || e.phase > 0) continue;
          if (e.type === 'boss' && bossEntranceActive()) continue;   // 登场虚化 BOSS：主体接触伤害穿透
          if (Math.hypot(e.x - s.x, e.y - s.y) > PRINCE_STORM.r + Math.max(e.w, e.h) / 2) continue;
          e.hp -= PRINCE_STORM.tickDmg * mul * yu4AuraMul(e) * kingDmgBonusMul();   // 大无垠之王：BOSS 战累积增伤同样生效于友方大风暴
          if (Math.random() < 0.4) spawnParticles(e.x + rand(-8, 8), e.y + rand(-8, 8), '#dff3ff', 1, 80);
          if (e.hp <= 0) killed.push(e);
        }
        for (const t of killed) {
          const j = enemies.indexOf(t);
          if (j >= 0) {
            princeStormKillGain(t);   // 天秀：风暴主体击杀 → 量表立刻充能
            killEnemy(j);
          }
        }
      }
      if (s.t >= s.dur || s.y < -PRINCE_STORM.r - 40) friendStorms.splice(i, 1);
    }
  }

  // 拾取升级套件：升火力；抵达 Lv5 即进入暴走；暴走期间拾取重置倒计时
  function pickupKit() {
    state.score += Math.round(50 * diffMods().scoreMul);
    if (player.weapon < 5) {
      player.weapon++;
      if (player.weapon === 5) {
        // 抵达 Lv5 即暴走：限时 6s，结束后回落 Lv4
        player.berserk = BERSERK.duration;
        tryChengyueShield();   // 澄月：暴走触发时概率获得量子护盾
        player.berserkBanner = 1.5;   // 机身上方展示"暴走"字样
        shake(5, 0.25);   // 暴走震屏减弱（以冲击波环为主要反馈）
        spawnParticles(player.x, player.y, '#ffb545', 26, 260);
        berserkBurst.active = true; berserkBurst.t = 0;
        berserkBurst.x = player.x; berserkBurst.y = player.y; berserkBurst.big = true;
      }
    } else if (player.weapon === 5) {
      // 已处于暴走：重置倒计时（续时同样判定澄月护盾）
      player.berserk = BERSERK.duration;
      tryChengyueShield();
      player.berserkBanner = 1.0;
      spawnParticles(player.x, player.y, '#ffb545', 16, 200);
    }
  }

  // 拾取暴走道具：攻击等级立刻升满级（Lv5 即暴走，限时 6s）；已暴走则重置倒计时
  function pickupBerserk() {
    state.score += Math.round(100 * diffMods().scoreMul);
    const alreadyBerserk = player.weapon === 5;
    player.weapon = 5;
    tryChengyueShield();   // 澄月：新触发与暴走续时均判定一次（已暴走续时也判定）
    player.berserk = BERSERK.duration;   // 重置倒计时
    player.berserkBanner = alreadyBerserk ? 1.0 : 2.0;
    shake(alreadyBerserk ? 5 : 8, alreadyBerserk ? 0.25 : 0.35);   // 暴走震屏减弱（以冲击波环为主要反馈）
    // 多层粒子爆炸增强特效
    spawnParticles(player.x, player.y, '#ff5a1f', 40, 380);
    spawnParticles(player.x, player.y, '#ffb545', 28, 300);
    if (!alreadyBerserk) spawnParticles(player.x, player.y, '#ffffff', 18, 240);
    // 暴走冲击波：粉橙双环扩散（替代原全屏白闪：不再闪动屏幕，特效更聚焦更明显）
    berserkBurst.active = true;
    berserkBurst.t = 0;
    berserkBurst.x = player.x;
    berserkBurst.y = player.y;
    berserkBurst.big = !alreadyBerserk;
  }

  function useBomb() {
    // 警报演出期间禁止使用爆弹
    if (playerFireLocked()) return;
    // 测试模式（图鉴挑战）：高能爆弹无限，不消耗库存
    if (!state.challenge) {
      if (state.bombs <= 0) return;
      state.bombs--;
      achvOnBombUsed();   // 成就：齐宣王 / 「无垠」用弹记录
    }
    // 震屏 / 白闪 / 火圈：统一采用测试模式的表现 —— 弱震屏 + 微白闪 + 自场地中心急速扩散至全场的橙黄火圈；
    // 可莉绷绷炸弹：短暂震屏更强（初始幅度更高 + 时长略增 + 线性衰减，见 render），扩散波大幅加宽（bombBurst.big）
    const klee = hasPilot('keli');
    shake(klee ? 13 : 4, klee ? 0.8 : 0.18);
    state.flash = 0.1;
    bombBurst.active = true;
    bombBurst.t = 0;
    bombBurst.big = klee;
    // 清空敌弹 + 导弹/预警线
    clearEnemyBullets();
    clearMissiles();
    if (klee) achvSetKillSrc('bomb-keli');   // 成就：绷绷炸弹击杀来源（轰轰火花——任意 BOSS）
    // 高能爆弹：真实伤害（无视御4防御光环等一切减伤、无视敌方虚化护盾），对全场敌人造成 4000 + 目标最大血量10% 的伤害
    // 测试模式：改为对每个敌方结算 60% 最大血量（不再清屏秒杀；BOSS 亦按 60% 结算、无 testHp 锁定）
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (!e) continue;   // 连锁结算（暴鸰殉爆 / 召唤体连带删除等）可能同帧收缩数组导致索引越界——与下方补扫循环同样跳过
      if (state.challenge) {
        e.hp -= e.maxHp * 0.60;
        spawnParticles(e.x, e.y, '#ffffff', 14, 240);
        if (e.hp <= 0) killEnemy(i);
      } else {
        let dmg = (BOMB_DAMAGE_BASE + e.maxHp * BOMB_DAMAGE_RATIO) * pilotBombDmgMul() * kingDmgBonusMul();   // 可莉：绷绷炸弹 ×1.5；大无垠之王：BOSS 战累积增伤
        // 诗篇：高能爆弹对 BOSS 伤害 -25%（mods.bombBossDmgMul，缺省不乘）；
        // 可莉：绷绷炸弹（bombIgnoreDiffCut）难度减伤减半——诗篇 ×0.75 → ×0.875
        const bbMul = diffMods().bombBossDmgMul;
        if (e.type === 'boss' && bbMul != null && bbMul !== 1) {
          const keli = pilotEntry('keli');
          dmg *= keli && keli.bombIgnoreDiffCut ? 1 - (1 - bbMul) / 2 : bbMul;
        }
        e.hp -= dmg;
        spawnParticles(e.x, e.y, '#ffffff', 14, 240);
        if (e.hp <= 0) killEnemy(i);
      }
    }
    // 安全清扫：暴鸰连锁殉爆的嵌套结算按对象身份删除，会使上面单轮遍历漏掉部分目标——补扫至无遗漏
    for (let pass = 0; pass < 4; pass++) {
      let swept = false;
      for (let i = enemies.length - 1; i >= 0; i--) {
        const t = enemies[i];
        if (!t || t.type === 'boss') continue;   // 嵌套结算可能清空数组导致越界
        if (!t._deathSettled && t.hp <= 0) { killEnemy(i); swept = true; }
      }
      if (!swept) break;
    }
    achvClearKillSrc();
  }

  // ---------- 主菜单攻击演示（idle 态主菜单页） ----------
  // 演示屏（DOM 边框 .demo-screen 与此严格对齐：上边界 15%-10.4px、下边界 66%，见 01-config DEMO_TOP）内展示当前选中的
  // 战机与僚机：位置固定居中、不可操控，仅自动循环攻击演示——
  //   Lv4 火力攻击 5s → 暴走(Lv5) 攻击 5s → 循环。
  // 暴走动画（粉橙冲击波 / 机翼展开 / 弹道暴走配色）与游戏内一致，但不显示“暴走”二字
  // （berserkBanner 恒 0）。弹道飞出演示屏边界即消失，呈现“屏幕”边框感。
  // 演示屏矩形 DEMO_TOP / DEMO_BOTTOM 见 01-config（与主菜单 .demo-screen DOM 边框对齐）
  const DEMO_PHASE_T = 5;   // 每个攻击阶段时长（s）
  let demoT = 0;            // 演示累计时间（相位 = floor(demoT / DEMO_PHASE_T) % 2）
  let demoPhase = -1;       // 当前相位（0=Lv4 / 1=暴走），-1 = 强制首帧初始化

  // 群星之杀演示斩击：演示屏内无敌人可锁定，对屏内上方固定演出点按真实节奏释放斩击特效
  // （方向角 / 交替 / 尺寸 / 暴走三连斩与 doSlash 同源，仅无伤害结算）
  function demoSlash(lvl) {
    player.bladeFlashT = 0.45;   // 双刃攻击闪光（paintStarslayer 读取）
    const cx = CANVAS_W / 2, cy = DEMO_TOP + Math.round((DEMO_BOTTOM - DEMO_TOP) * 0.3);   // 演示屏上方 30% 处
    const deg = STARSLAYER.slashAngleMin + Math.random() * (STARSLAYER.slashAngleMax - STARSLAYER.slashAngleMin);
    const sign = (slashSeq++ % 2 === 0) ? 1 : -1;
    const rot = sign * deg * Math.PI / 180;
    const berserk = player.weapon === 5;
    slashFx.push({
      x: cx, y: cy, rot, spinDir: sign,
      halfLen: lvl.slashR * STARSLAYER.slashLenMul, halfW: lvl.slashR * STARSLAYER.slashWMul,
      t: STARSLAYER.slashFxTime, max: STARSLAYER.slashFxTime, berserk, hits: [],
    });
    spawnParticles(cx, cy, berserk ? '#ffe9a8' : '#cfe0ff', 16, 280);
  }

  // 演示推进：由主循环 idle 分支每帧调用（14-main）。设置 state.demo 供僚机开火门控放宽；
  // 弹道位移由 14-main 在 idle 分支调 updateBullets 完成（此处只负责开火与出界清理）
  function updateDemo(dt) {
    state.demo = state.mode === 'idle' && !menuScreen.classList.contains('hidden');
    if (!state.demo) return;
    // 固定站位（不可操控）：战机位于演示屏底部 83% 处（原 88% 会让机体下缘出演示屏边界；
    // 弹幕向上穿越整个演示屏）；
    // 清掉开场无敌与任何残留闪白，避免演示机体闪烁
    player.x = CANVAS_W / 2;
    player.y = Math.round(DEMO_TOP + (DEMO_BOTTOM - DEMO_TOP) * 0.83);
    player.invuln = 0;
    player.berserkBanner = 0;   // 演示不显示“暴走”二字
    // 阶段循环：偶数 5s = Lv4 火力，奇数 5s = 暴走
    demoT += dt;
    const phase = Math.floor(demoT / DEMO_PHASE_T) % 2;
    if (phase !== demoPhase) {
      demoPhase = phase;
      const enteringBerserk = phase === 1;
      player.weapon = enteringBerserk ? 5 : 4;
      player.berserk = enteringBerserk ? BERSERK.duration : 0;
      player.cooldown = 0;
      player.slashQueued = 0;
      if (enteringBerserk) {
        // 暴走触发动画：粉橙双环冲击波 + 粒子（与 pickupBerserk 一致，省略震屏）
        berserkBurst.active = true;
        berserkBurst.t = 0;
        berserkBurst.x = player.x;
        berserkBurst.y = player.y;
        berserkBurst.big = false;
        spawnParticles(player.x, player.y, currentPlane.berserkColor || '#ffb545', 18, 220);
      } else {
        spawnParticles(player.x, player.y, '#7ce7ff', 12, 180);
      }
    }
    // 机翼展开动画（与 updatePlayer 同参数：0.4s 展开 / 0.29s 合拢）
    const wingTarget = (player.weapon === 5) ? 1 : 0;
    if (player.wingSpread < wingTarget) player.wingSpread = Math.min(wingTarget, player.wingSpread + dt * 2.5);
    else if (player.wingSpread > wingTarget) player.wingSpread = Math.max(wingTarget, player.wingSpread - dt * 3.5);
    if (player.bladeFlashT > 0) player.bladeFlashT = Math.max(0, player.bladeFlashT - dt);
    // 暴走刃帆变形进度：全机型统一驱动（与 updatePlayer 同参）——
    // 必须在机型分支之外：混乱将至不驱动会继承切机 / 上一局残留值，导致演示屏常驻金光与环绕光点
    const sailTargetDemo = (player.weapon === 5 && player.berserk > 0) ? 1 : 0;
    if (player.berserkSpread < sailTargetDemo) player.berserkSpread = Math.min(sailTargetDemo, player.berserkSpread + dt * 3);
    else if (player.berserkSpread > sailTargetDemo) player.berserkSpread = Math.max(sailTargetDemo, player.berserkSpread - dt * 3);
    // 攻击：斩击机型走演出斩击（无敌人），其余机型走真实弹道
    if (currentPlane.slashWeapon) {
      const lvl = STARSLAYER.levels[player.weapon] || STARSLAYER.levels[1];
      if (player.slashQueued > 0) {
        player.slashGapT -= dt;
        if (player.slashGapT <= 0) {
          demoSlash(lvl);
          player.slashQueued--;
          player.slashGapT = STARSLAYER.slashGapBase;
        }
      } else {
        player.slashCd -= dt;
        if (player.slashCd <= 0) {
          player.slashCd = lvl.interval;
          demoSlash(lvl);
          if (player.weapon === 5 && (lvl.slashes || 1) > 1) {
            player.slashQueued = lvl.slashes - 1;
            player.slashGapT = STARSLAYER.slashGapBase;
          }
        }
      }
    } else {
      player.cooldown -= dt;
      if (player.cooldown <= 0) {
        if (player.weapon === 5) { player.cooldown = BERSERK.interval; fireWeaponBerserk(); }
        else { player.cooldown = WEAPON_LEVELS[player.weapon].interval; fireWeapon(); }
      }
      updateSubWeapon(dt);   // 主菜单演示屏同步展示副武器弹道（弹体由演示屏裁剪边界回收；捣蛋来袭演示屏不发）
      updateFeijianWaves(dt);   // 无界飞剑：演示屏内同样完成下沉→分裂→依次前射演出
    }
    updateDelayedShots(dt);   // Lv4 半拍补射队列（演示与游戏共用逻辑）
    updateSlashFx(dt);        // 斩击特效存留衰减（演示屏内仅特效，无伤害结算）
    // 演示屏外清理（仅为回收内存：视觉边界由 10-draw-world 的演示屏裁剪保证，弹道飞出边框即被截断）
    for (let i = pBullets.length - 1; i >= 0; i--) {
      const b = pBullets[i];
      if (b.y < DEMO_TOP - 40 || b.y > DEMO_BOTTOM + 60 || b.x < -40 || b.x > CANVAS_W + 40) pBullets.splice(i, 1);
    }
  }

  export {
    WEAPON_LINES, delayedShots, fireWeapon, updateDelayedShots, fireWeaponBerserk, slashSeq,
    beamSparkT, pickSlashTarget, doSlash, updateStarslayer, wingmanHasteMul, updateSlashFx,
    initWingmen, updateWingmen, buildFanAngles, fireWingmanFanShot, computeShieldSegs, bulwarkActive,
    segIntersect, shieldSweepHit, shieldReflectHit, clipAgainstShield, beamClipAgainstShield, fireWingmanVolley, updatePlayer, clearEnemyBullets,
    playerFireLocked, respawnPlayer, damagePlayer, testDamagePlayer, pickupKit, pickupBerserk, useBomb,
    accumulateWeaponDropHit, tryChengyueShield, armorSkillGain, triggerArmorSkill, updateDemo,
    handlePlayerDeath, aiyiSelfDestruct, updateAiyiWaves, stormBossFightActive, pilotStormContactMul,
    princeOtherDmgMul, princeStormKillGain, updatePilotStatus, triggerPilotSkill, updateFriendStorms, kingDmgBonusMul,
    updateDagouMissiles,
  };