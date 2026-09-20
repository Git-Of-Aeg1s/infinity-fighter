// 07-player：玩家武器 / 僚机逻辑 / 受伤与无敌 / 拾取 / 高能爆弹 / 清弹

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：04-spawn(1 名) 05-boss(1 名) 06-enemy(4 名) 08-entities(6 名) 12-ui(2 名) 13-encyclopedia(1 名) 14-main(5 名)
  // 本文件写共享状态（state/bossFlow/levelFlow 属性赋值；新增属性先在 02-core 归域声明）：
  //   state.{bombs, flash, hurt, lives, score}
  //
  import { BERSERK, BOMB_DAMAGE_BASE, BOMB_DAMAGE_RATIO, BULWARK, CANVAS_H, CANVAS_W, HANSHUANG, PLAYER_CFG, STARSLAYER, WEAPON_DROP_HITS, WEAPON_LEVELS, WINGMAN, WINGMAN_LEVELS, WINGMAN_SPREAD, currentPlane, currentWingman } from './01-config.js';
  import { bossFlow, clamp, eBullets, enemyOnScreen, enemies, hasteMul, hpFill, keys, pBullets, phaseFx, player, playerHitFx, shake, slashFx, spawnParticles, state, wingmen } from './02-core.js';
  import { playerFrostMoveMul, playerFrostSlowMul } from './04-spawn.js';
  import { clearMissiles, killEnemy } from './06-enemy.js';
  import { berserkBurst, bombBurst, enemyDamageMul, shieldBurst } from './08-entities.js';
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
      let dmg = lvl.dmg * dmgMul * enemyDamageMul(e, false);
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

    player.slashCd -= dt * playerFrostSlowMul() * hasteMul();
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
        if (player.weapon === 5 && player.alive && state.mode === 'playing' && Math.random() < dt * 16) {
          const pts = w.shieldPts;
          if (pts && pts.length) { const pt = pts[(Math.random() * pts.length) | 0]; spawnParticles(pt.x, pt.y, '#ffffff', 2, 150); }
        }
      }
      if (!player.alive || locked || state.mode !== 'playing') { w.burst = null; w.cooldown = 0; continue; }

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
    const R = BULWARK.radius, seg = BULWARK.segments, up = -Math.PI / 2;
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
      if (state.lives > 0) {
        player.respawnTimer -= dt;
        if (player.respawnTimer <= 0) respawnPlayer();
      }
      return;
    }

    let dx = 0, dy = 0;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      dx /= len; dy /= len;
      const pspd = PLAYER_CFG.speed * playerFrostMoveMul();   // 寒霜光圈内移动速度 -35%
      player.x += dx * pspd * dt;
      player.y += dy * pspd * dt;
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
    player.x = clamp(player.x, player.w / 2, CANVAS_W - player.w / 2);
    player.y = clamp(player.y, player.h / 2, CANVAS_H - player.h / 2);

    // 自动开火（Lv5 即暴走：使用暴走弹道与射速）
    // BOSS 出场演出期间停止攻击，展开完毕后立即恢复
    const berserk = player.weapon === 5;
    if (currentPlane.slashWeapon) {
      // 群星之杀：不发射普通子弹，改为锁定光束 + 周期性空间斩击
      updateStarslayer(dt);
    } else {
      player.cooldown -= dt * playerFrostSlowMul() * hasteMul();   // 寒霜光圈内射速 -35%；斗志昂扬增益期间攻速翻倍
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

    if (player.invuln > 0) player.invuln -= dt;
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
  }

  // 清空场上所有敌弹（护盾解除 / 炸弹共用）
  function clearEnemyBullets() {
    for (const b of eBullets) spawnParticles(b.x, b.y, '#ffd166', 3, 100);
    eBullets.length = 0;
  }

  // 玩家开火锁定：仅警报/进场/展开期间停止攻击；wait（等清场）阶段继续攻击残敌
  function playerFireLocked() {
    if (bossFlow.stage === 'none' || bossFlow.stage === 'wait') return false;
    if (bossFlow.stage === 'warn') return true;   // 警报阶段一律锁定（暴风之眼汇聚入场短于警报剩余时间，不能仅靠 combatReady）
    return !enemies.some(e => e.type === 'boss' && e.combatReady);
  }

  function respawnPlayer() {
    player.alive = true;
    player.hp = PLAYER_CFG.maxHp;
    player.x = CANVAS_W / 2;
    player.y = CANVAS_H - 90;
    player.invuln = 2;
    player.invulnBlink = false;   // 登场/重生无敌不闪动（机体保持完整可见）
    player.weapon = (state.testBoss || state.challenge) ? 4 : 3;   // 复活后火力等级默认 Lv3（BOSS 试炼 / 图鉴挑战仍固定 Lv4，与 resetGame 一致）
    player.berserk = 0;
    player.shield = 0;
    player.hitCount = 0;
    player.hitFxT = 0;
    player.slashCd = 0; player.slashTarget = null; player.slashQueued = 0; player.slashGapT = 0;   // 群星之杀斩击运行态重置
  }

  // 受击计数推进（damagePlayer 与破片导弹"整轮仅计一次"共用）：非暴走时统一累计 3 次掉 1 级火力
  function accumulateWeaponDropHit() {
    if (player.weapon < 5 && player.weapon > 1) {
      player.hitCount++;
      if (player.hitCount >= WEAPON_DROP_HITS) { player.weapon--; player.hitCount = 0; }
    }
  }

  function damagePlayer(amount, invulnMul = 1, ignoreInvuln = false, isMissile = false) {
    if (!player.alive) return false;
    if (!ignoreInvuln && player.invuln > 0) return false;   // 无敌帧内免疫（ignoreInvuln=true 时穿透无敌，如破片后两发导弹）
    if (player.shield > 0) return false;   // 护盾期间免疫碰撞伤害（无视无敌 ≠ 无视护盾）
    // 测试模式（图鉴挑战）：玩家不再无敌 —— 照常扣血，但不掉命、不掉武器等级；血量 ≤0 立刻重置为满（视为不死）
    if (state.challenge) {
      player.hp -= amount;
      player.invuln = PLAYER_CFG.invulnTime * invulnMul; player.invulnBlink = true;   // 受击无敌：闪动提示
      shake(3, 0.15);   // 受击震屏较弱
      player.hitFxT = 0.28;   // 机体受击闪白
      state.hurt = Math.min(1, state.hurt + 0.4);   // 屏幕边缘红晕（较弱）
      playerHitFx.push({ x: player.x, y: player.y, t: 0, max: 0.4, r: 16, seed: Math.random() * 10 });   // 闪核 + 冲击环 + 火花
      spawnParticles(player.x, player.y, '#7ce7ff', 10, 160);
      if (player.hp <= 0) {
        player.hp = PLAYER_CFG.maxHp;   // 血量归零：立刻重置生命值为 100，不死亡
        hpFillFastRefill();   // 血条回满动画提速 ×300%
      }
      return true;
    }
    player.hp -= amount;
    player.invuln = PLAYER_CFG.invulnTime * invulnMul; player.invulnBlink = true;   // 受击无敌：闪动提示
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
      player.hp = 0;
      player.alive = false;
      state.lives--;
      state.hurt = 1;   // 掉命：红晕拉满
      spawnParticles(player.x, player.y, '#ff4d6d', 40, 320);
      playerHitFx.push({ x: player.x, y: player.y, t: 0, max: 0.55, r: 26, seed: Math.random() * 10 });   // 掉命：更大的爆闪冲击环
      shake(16, 0.6);
      if (state.lives <= 0) {
        setTimeout(() => endGame(), 700);
      } else {
        player.respawnTimer = PLAYER_CFG.respawnTime;
      }
    }
    return true;
  }

  // 测试模式（图鉴挑战）受伤入口：供绕过 damagePlayer 的持续伤害源使用（BOSS 接触 / 焦香灼烧 / 先兆者导弹）。
  // 照常扣血但不掉命、不掉武器等级；血量 ≤0 立刻重置为满（测试模式视为不死）；护盾期间免疫
  function testDamagePlayer(amount) {
    if (!player.alive || player.shield > 0) return false;
    player.hp -= amount;
    if (player.hp <= 0) {
      player.hp = PLAYER_CFG.maxHp;
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

  // 拾取升级套件：升火力；抵达 Lv5 即进入暴走；暴走期间拾取重置倒计时
  function pickupKit() {
    state.score += 50;
    if (player.weapon < 5) {
      player.weapon++;
      if (player.weapon === 5) {
        // 抵达 Lv5 即暴走：限时 6s，结束后回落 Lv4
        player.berserk = BERSERK.duration;
        player.berserkBanner = 1.5;   // 机身上方展示"暴走"字样
        shake(5, 0.25);   // 暴走震屏减弱（以冲击波环为主要反馈）
        spawnParticles(player.x, player.y, '#ffb545', 26, 260);
        berserkBurst.active = true; berserkBurst.t = 0;
        berserkBurst.x = player.x; berserkBurst.y = player.y; berserkBurst.big = true;
      }
    } else if (player.weapon === 5) {
      // 已处于暴走：重置倒计时
      player.berserk = BERSERK.duration;
      player.berserkBanner = 1.0;
      spawnParticles(player.x, player.y, '#ffb545', 16, 200);
    }
  }

  // 拾取暴走道具：攻击等级立刻升满级（Lv5 即暴走，限时 6s）；已暴走则重置倒计时
  function pickupBerserk() {
    state.score += 100;
    const alreadyBerserk = player.weapon === 5;
    player.weapon = 5;
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
    }
    // 震屏 / 白闪 / 火圈：统一采用测试模式的表现 —— 弱震屏 + 微白闪 + 自场地中心急速扩散至全场的橙黄火圈
    shake(4, 0.18);
    state.flash = 0.1;
    bombBurst.active = true;
    bombBurst.t = 0;
    // 清空敌弹 + 导弹/预警线
    clearEnemyBullets();
    clearMissiles();
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
        const dmg = BOMB_DAMAGE_BASE + e.maxHp * BOMB_DAMAGE_RATIO;
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
  }

  export {
    WEAPON_LINES, delayedShots, fireWeapon, updateDelayedShots, fireWeaponBerserk, slashSeq,
    beamSparkT, pickSlashTarget, doSlash, updateStarslayer, wingmanHasteMul, updateSlashFx,
    initWingmen, updateWingmen, buildFanAngles, fireWingmanFanShot, computeShieldSegs, bulwarkActive,
    segIntersect, shieldSweepHit, clipAgainstShield, fireWingmanVolley, updatePlayer, clearEnemyBullets,
    playerFireLocked, respawnPlayer, damagePlayer, testDamagePlayer, pickupKit, pickupBerserk, useBomb,
    accumulateWeaponDropHit,
  };