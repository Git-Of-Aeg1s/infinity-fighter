// 07-player：玩家武器 / 僚机逻辑 / 受伤与无敌 / 拾取 / 高能爆弹 / 清弹
'use strict';

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
  let delayedShots = [];

  function fireWeapon() {
    // 每发伤害按火力等级倍率缩放（WEAPON_LEVELS.dmgMul），使 Lv1~Lv4 的 DPS 构成 80% 等比链
    const dmg = PLAYER.bulletDamage * (WEAPON_LEVELS[player.weapon].dmgMul || 1);
    const r = 3;
    for (const [ox, oy] of WEAPON_LINES[player.weapon]) {
      pBullets.push({ x: player.x + ox, y: player.y + oy, vx: 0, vy: -PLAYER.bulletSpeed, r, dmg, color: currentPlane.bulletColor });
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
      pBullets.push({ x: s.x - 10, y: s.y - 18, vx: 0, vy: -PLAYER.bulletSpeed, r: s.r, dmg: s.dmg, color: currentPlane.bulletColor });
      pBullets.push({ x: s.x + 10, y: s.y - 18, vx: 0, vy: -PLAYER.bulletSpeed, r: s.r, dmg: s.dmg, color: currentPlane.bulletColor });
    }
  }

  // 暴走（Lv5）：十射线双连发（5 个位置各打两遍），3 倍宽度 + 高低错落，射速/单发伤害大幅提升（×dmgMul=2）
  function fireWeaponBerserk() {
    const dmg = PLAYER.bulletDamage * BERSERK.dmgMul;
    const r = 3 * BERSERK.rMul;
    const lines = [
      [-27, -6], [-27, -6], [-15, -14], [-15, -14], [0, -22],
      [0, -22], [15, -14], [15, -14], [27, -6], [27, -6],
    ];
    for (const [ox, oy] of lines) {
      pBullets.push({ x: player.x + ox, y: player.y + oy, vx: 0, vy: -PLAYER.bulletSpeed * BERSERK.spdMul, r, dmg, color: currentPlane.berserkColor, berserk: true });   // berserk: 暴走弹标记，渲染时附尾焰与光晕
    }
  }

  // ---------- 群星之杀：空间斩击武器 ----------
  // 机头直射一条淡白锁定光束（不造成伤害），选中最靠近玩家的主目标；
  // 每隔一段时间召唤一道空间斩击：以主目标为中心的矩形判定区，主目标全额、其余敌人 80%。
  // 斩击方向：与竖直方向夹角 5~20° 随机，左下→右上 / 右下→左上 逐次交替。
  // 暴走（Lv5）：每次连续斩击 3 下（间隔 slashGap），攻击间隔略微降低。
  let slashSeq = 0;   // 斩击方向交替计数（奇偶决定左候/右候）
  let beamSparkT = 0;   // 光束命中粒子节流计时

  function pickSlashTarget() {
    let best = null, bestD = Infinity;
    for (const e of enemies) {
      // 群星之杀无视敌方虚化护盾：虚化敌人同样可被锁定为主目标（不再按 e.phase 跳过）
      if (e.y + e.h / 2 < 0 || e.y - e.h / 2 > CANVAS_H) continue;   // 屏幕外（尚未入场/已离场）的敌人不可锁定
      if (e.y >= player.y) continue;                   // 仅选中机头上方的敌人
      if (Math.abs(e.x - player.x) > e.w / 2 + STARSLAYER.selectHalfW) continue;   // 光束走廊内
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  // 对主目标及其矩形斩击区内敌人结算一次斩击伤害（复用 enemyDamageMul 修正链）
  function doSlash(lvl) {
    const t = player.slashTarget;
    if (!t) return;
    const cx = t.x, cy = t.y, R = lvl.slashR;
    // 斩击方向：与竖直方向夹角 5~20° 随机；奇偶交替（首次 rot>0 左下→右上，次之 rot<0 右下→左上）
    const deg = STARSLAYER.slashAngleMin + Math.random() * (STARSLAYER.slashAngleMax - STARSLAYER.slashAngleMin);
    const sign = (slashSeq++ % 2 === 0) ? 1 : -1;
    const rot = sign * deg * Math.PI / 180;
    const halfLen = R * STARSLAYER.slashLenMul;   // 沿斩击方向半长
    const halfW = R * STARSLAYER.slashWMul;       // 垂直斩击方向半宽
    const berserk = player.weapon === 5;
    // 斩击特效（顶部尖角、底宽、底边凹弧的斩痕 + 突然出现 + 空间扭曲 + 被切中敌机闪白，短暂存留渐隐）
    const fx = { x: cx, y: cy, rot, halfLen, halfW, t: STARSLAYER.slashFxTime, max: STARSLAYER.slashFxTime, berserk, hits: [] };
    slashFx.push(fx);
    // 命中反馈：中心火花迸发（不抖屏；空间扭曲由 drawSlashFx 绘制）
    spawnParticles(cx, cy, berserk ? '#d9ccff' : '#cfe0ff', 16, 280);
    // 旋转到斩击局部坐标：local = R(-rot)·world；长轴=localY、宽轴=localX
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const killed = [];
    for (const e of enemies) {
      // 群星之杀无视敌方虚化护盾：虚化敌人同样受斩击伤害（不再按 e.phase 跳过）
      const isMain = (e === t);
      if (!isMain) {
        const dx = e.x - cx, dy = e.y - cy;
        const lx = dx * cosR + dy * sinR;     // 宽轴
        const ly = -dx * sinR + dy * cosR;    // 长轴
        if (Math.abs(ly) > halfLen + e.h / 2) continue;
        if (Math.abs(lx) > halfW + e.w / 2) continue;
      }
      const dmg = lvl.dmg * (isMain ? 1 : STARSLAYER.splashMul) * enemyDamageMul(e, false);
      e.hp -= dmg;
      spawnParticles(e.x, e.y, isMain ? '#ffffff' : '#cbb8ff', 8, 190);
      if (e.hp <= 0) killed.push(e);          // 被击杀：走 killEnemy 爆炸，不附加闪白
      else fx.hits.push({ ref: e, main: isMain, rad: Math.max(e.w, e.h) * 0.5 + 8 });   // 幸存被切中：附加闪白反馈
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (killed.indexOf(enemies[i]) >= 0) killEnemy(i);
    }
  }

  function updateStarslayer(dt) {
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

  // 僚机射速增益：斗志昂扬期间翻倍；群星之杀在非 boss 战时额外 ×wingmanHaste（补偿清杂弱）
  function wingmanHasteMul() {
    let m = hasteMul();
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
    // 站位偏移按当前僚机类型驱动（钢铁壁垒前侧 offsetY<0；群星允诺后侧）
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
      // 钢铁壁垒：初始化常时被动白盾折线（每帧在 updateWingmen 重算）
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
      // 目标位置：主机两侧（暴走时略外扩，增强气势）
      const spread = player.weapon === 5 ? 1.18 : 1;
      const tx = player.x + w.side * offX * spread;
      const ty = player.y + offY + (player.weapon === 5 ? 4 : 0);
      const k = Math.min(1, WINGMAN.followLerp * dt);   // 指数平滑跟随
      w.x += (tx - w.x) * k;
      w.y += (ty - w.y) * k;
      // 钢铁壁垒：每帧重算白盾世界折线（供挡弹与渲染共用）；盾面命中高光逐帧衰减
      if (wpn.kind === 'fan') { computeShieldSegs(w); if (w.shieldFlash > 0) w.shieldFlash = Math.max(0, w.shieldFlash - dt * 3); }
      if (!player.alive || locked || state.mode !== 'playing') { w.burst = null; w.cooldown = 0; continue; }

      // ---- fan 模型（钢铁壁垒）：错序扇形发射，最前方（0°）先发 ----
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
  //   Lv5 leadExtra：在 Lv4 的 8 发扇形（0,17.14,…,120°）序列最前插入一发 17.14° 新弹（该方向双发、新弹领头）
  function buildFanAngles(wpn, level) {
    const cfg = wpn.levels[level] || wpn.levels[1];
    const spreadMax = wpn.spreadMax;
    const angles = [];
    if (cfg.leadExtra) {
      const baseCount = cfg.count - 1;               // Lv4 的 8 发
      const step = spreadMax / (baseCount - 1);      // 120/7 ≈ 17.14°
      angles.push(step);                             // 领头新弹（17.14°）最先射
      for (let i = 0; i < baseCount; i++) angles.push(i * step);   // 0,17.14,…,120
      return angles;
    }
    const step = spreadMax / (cfg.count - 1);
    for (let i = 0; i < cfg.count; i++) angles.push(i * step);     // 0→spreadMax 均分、0° 先发
    return angles;
  }

  // 钢铁壁垒单发扇形弹：椭圆长条（oval），速度 bulletSpeed×(Lv5 speedMul)，伤害取 weapon.levels[lv].dmg
  function fireWingmanFanShot(w, thetaDeg) {
    const wpn = currentWingman.weapon;
    const lv = wpn.levels[player.weapon] || wpn.levels[1];
    const up = -Math.PI / 2;
    const ang = up + w.side * (thetaDeg * Math.PI / 180);   // side 定向：右僚机朝 +x、左僚机朝 -x
    const speed = wpn.bulletSpeed * (lv.speedMul || 1);
    pBullets.push({
      x: w.x, y: w.y - 8,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      r: wpn.barR, dmg: lv.dmg,
      len: wpn.barLen, wing: true, oval: true, glow: !!lv.flame,
      colorTail: currentWingman.barTail, colorMid: currentWingman.barMid, colorHead: currentWingman.barHead,
    });
  }

  // 钢铁壁垒白盾世界折线：以僚机为圆心、BULWARK.radius 为半径，从 arcFrom→arcTo（相对竖直向上朝外侧）
  //   随 side 镜像、随 w.x/w.y 平移；shieldPts 供渲染画弧，shieldSegs 供挡弹扫掠相交/裁切
  function computeShieldSegs(w) {
    const R = BULWARK.radius, seg = BULWARK.segments, up = -Math.PI / 2;
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const theta = BULWARK.arcFrom + (BULWARK.arcTo - BULWARK.arcFrom) * (i / seg);
      const ang = up + w.side * (theta * Math.PI / 180);
      pts.push({ x: w.x + Math.cos(ang) * R, y: w.y + Math.sin(ang) * R });
    }
    w.shieldPts = pts;
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      segs.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y });
    }
    w.shieldSegs = segs;
  }

  // ---------- 钢铁壁垒白盾挡弹工具（供 08-entities / 06-enemy 复用；仅 fan 僚机持有 shieldSegs）----------
  // 当前是否为钢铁壁垒（持盾）僚机：拦截仅对非导弹直射弹生效（导弹/区域伤害天然绕过）
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

  // 白盾扫掠命中：弹体从 (px,py) 移动到 (x,y) 的线段与任一僚机盾折线相交，返回最靠近弹尾(起点)的交点
  //   用于吸收普通直射弹 / 正方体；命中时点亮该僚机盾面高光
  function shieldSweepHit(px, py, x, y) {
    let best = null, bestT = Infinity;
    for (const w of wingmen) {
      const segs = w.shieldSegs;
      if (!segs || !segs.length) continue;
      for (const s of segs) {
        const hit = segIntersect(px, py, x, y, s.x1, s.y1, s.x2, s.y2);
        if (hit && hit.t < bestT) { bestT = hit.t; best = { x: hit.x, y: hit.y, w }; }
      }
    }
    if (best) best.w.shieldFlash = 1;
    return best;
  }

  // 激光/风条截断裁切：弹体轴线（尾端 tx,ty 沿单位向量 ux,uy 延伸 len）与盾折线相交，返回最靠近尾端的交点及沿轴距离 d
  //   用于激光 clipLen（不 splice、继续生长/推进）与风条“磨短”；无相交返回 null
  function clipAgainstShield(tx, ty, ux, uy, len) {
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
    if (best) best.w.shieldFlash = 1;
    return best;
  }

  // 僚机单轮齐射：n 发长条弹幕，绕竖直向上方向对称展开，相邻夹角 spreadDeg 度
  function fireWingmanVolley(w, n, spreadDeg) {
    const berserk = player.weapon === 5;
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
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        r: WINGMAN.barR, dmg,
        len: WINGMAN.barLen, wing: true, glow: berserk,
        colorTail: currentWingman.barTail, colorMid: currentWingman.barMid, colorHead: currentWingman.barHead,
      });
    }
  }
function updatePlayer(dt) {
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
      const pspd = PLAYER.speed * playerFrostMoveMul();   // 寒霜光圈内移动速度 -35%
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
    if (state.bossStage === 'none' || state.bossStage === 'wait') return false;
    if (state.bossStage === 'warn') return true;   // 警报阶段一律锁定（暴风之眼汇聚入场短于警报剩余时间，不能仅靠 combatReady）
    return !enemies.some(e => e.type === 'boss' && e.combatReady);
  }

  function respawnPlayer() {
    player.alive = true;
    player.hp = PLAYER.maxHp;
    player.x = CANVAS_W / 2;
    player.y = CANVAS_H - 90;
    player.invuln = 2;
    player.invulnBlink = false;   // 登场/重生无敌不闪动（机体保持完整可见）
    player.weapon = (state.testBoss || state.challenge) ? 4 : 3;   // 复活后火力等级默认 Lv3（BOSS 试炼 / 图鉴挑战仍固定 Lv4，与 resetGame 一致）
    player.berserk = 0;
    player.shield = 0;
    player.hitCount = 0;
    player.slashCd = 0; player.slashTarget = null; player.slashQueued = 0; player.slashGapT = 0;   // 群星之杀斩击运行态重置
  }

  function damagePlayer(amount, invulnMul = 1, ignoreInvuln = false) {
    if (!player.alive) return false;
    if (!ignoreInvuln && player.invuln > 0) return false;   // 无敌帧内免疫（ignoreInvuln=true 时穿透无敌，如破片后两发导弹）
    if (player.shield > 0) return false;   // 护盾期间免疫碰撞伤害（无视无敌 ≠ 无视护盾）
    // 挑战模式：我方血量无限，仅播放受击特效，不扣血不掉命
    if (state.challenge) {
      player.invuln = PLAYER.invulnTime * invulnMul; player.invulnBlink = true;   // 受击无敌：闪动提示
      shake(3, 0.15);   // 受击震屏较弱
      spawnParticles(player.x, player.y, '#7ce7ff', 10, 160);
      return true;
    }
    player.hp -= amount;
    player.invuln = PLAYER.invulnTime * invulnMul; player.invulnBlink = true;   // 受击无敌：闪动提示
    shake(4, 0.2);   // 受击震屏较弱（掉命时的强震屏另行处理）
    spawnParticles(player.x, player.y, '#7ce7ff', 12, 180);
    // 被击中掉火力：常规累计受击 2 次掉一层，BOSS 战放宽到 3 次；暴走（Lv5）/护盾期间不计也不掉
    if (player.weapon < 5 && player.weapon > 1) {
      const dropHits = (state.bossStage === 'warn' || state.bossStage === 'fight') ? WEAPON_DROP_HITS_BOSS : WEAPON_DROP_HITS;
      player.hitCount++;
      if (player.hitCount >= dropHits) { player.weapon--; player.hitCount = 0; }
    }
    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
      state.lives--;
      spawnParticles(player.x, player.y, '#ff4d6d', 40, 320);
      shake(16, 0.6);
      if (state.lives <= 0) {
        setTimeout(() => endGame(), 700);
      } else {
        player.respawnTimer = PLAYER.respawnTime;
      }
    }
    return true;
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
    // 测试模式（图鉴挑战敌人 / BOSS 测试）：高能爆弹无限，不消耗库存
    const bossTest = state.challenge && state.challenge.kind === 'boss';
    if (!state.challenge) {
      if (state.bombs <= 0) return;
      state.bombs--;
    }
    shake(18, 0.6);
    // 白闪
    flash = 0.6;
    // 清空敌弹 + 导弹/预警线
    clearEnemyBullets();
    clearMissiles();
    // 高能爆弹：真实伤害（无视御4防御光环等一切减伤），对全场敌人造成 4000 + 目标最大血量10% 的伤害
    // BOSS 测试模式：改为每枚削减 BOSS 20% 最大生命（便于观察各血量阶段技能）
    // 虚化期间免疫
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.phase > 0) continue;   // 虚化期间免疫高能爆弹
      if (bossTest && e.type === 'boss') {
        // BOSS 测试：削减“测试血量基准”testHp 的 20%；削至 0 则真正击杀 BOSS 并退出测试
        // testHp 由 updateChallenge 每帧同步到 e.hp，故我方子弹伤害被抵消、仅高能爆弹能削血
        if (e.testHp == null) e.testHp = e.maxHp;
        e.testHp -= e.maxHp * 0.20;
        if (e.testHp <= 0) {
          e.hp = 0;
          killEnemy(i);   // 触发 BOSS 击杀流程：清场、退出测试、延迟返回主界面
        } else {
          e.hp = e.testHp;
          spawnParticles(e.x, e.y, '#ffffff', 16, 260);
        }
      } else if (state.challenge && !bossTest) {
        // 图鉴挑战（非 BOSS 测试页）：直接清屏秒杀 —— 测试模式下 updateChallenge 每帧回满血，
        // 常规 killEnemy 拒绝击杀，故以 force 强制走完整击杀流程（爆炸演出/亡语均正常触发，
        // 如增生侧翼艇分裂卫护飞船），随后由 updateChallenge 重新生成测试目标；虚化护盾（phase>0）无效
        killEnemy(i, true);
      } else {
        const dmg = BOMB_DAMAGE_BASE + e.maxHp * BOMB_DAMAGE_RATIO;
        e.hp -= dmg;
        spawnParticles(e.x, e.y, '#ffffff', 14, 240);
        if (e.hp <= 0) killEnemy(i);
      }
    }
  }

