// 06-enemy：敌机更新（移动 / 开火 / 弹幕）+ 先兆者导弹 + 暴鸰炸弹 + 掉落 + killEnemy
'use strict';


  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.type === 'boss') {
        updateBoss(e, dt);
        // 撞玩家（BOSS 不受撞击反伤）：接触机体不再有无敌、不再一次性扣血，
        // 改为 1 血/0.03s 的持续掉血（无视无敌帧；护盾仍免疫；挑战模式不扣血）
        if (player.alive &&
            Math.abs(e.x - player.x) < e.w / 2 && Math.abs(e.y - player.y) < e.h / 2 &&
            player.shield <= 0 && !state.challenge) {
          player.hp -= dt / 0.03;   // ≈33.3 HP/s
          if (Math.random() < 0.5) spawnParticles(player.x + rand(-8, 8), player.y + rand(-8, 8), '#ff4d6d', 1, 70);
          if (player.hp <= 0) {
            player.hp = 0;
            player.alive = false;
            state.lives--;
            spawnParticles(player.x, player.y, '#ff4d6d', 40, 320);
            shake(16, 0.6);
            if (state.lives <= 0) setTimeout(() => endGame(), 700);
            else player.respawnTimer = PLAYER.respawnTime;
          }
        }
        continue;
      }
      e.wobble += dt * 2;
      if (e.phase > 0) e.phase -= dt;   // 虚化倒计时，归零后可被伤害
      if (e.unfoldT > 0) e.unfoldT -= dt;   // 4类就位展开动画计时
      if (e.type === 'yu4') e.auraT += dt;   // 御4：登场计时（超过 auraDelay 后防御光环渐显）
      updateEnemyMovement(e, dt);
      updateEnemyFire(e, dt);
  
      // 4类在场期间周期召唤护航
      if (e.type === 'capital') {
        e.escortTimer -= dt;
        if (e.escortTimer <= 0 && e.arrived && !state.challenge) {
          e.escortTimer = rand(5, 7);
          if (Math.random() < 0.5) spawnSideGroup();
          else spawnStrikerGroup();
        }
      }
  
      // 飞出屏幕（仅穿越型会触发）；横向边界 ±460：各长队编队（BOSS 后固定首波 / 1类长队 /
      // 紫自爆流等）队尾在屏外最深处约 -431，旧 ±120 边界会把尚未入场的队尾整排在第一帧就移除
      if (e.y - e.h / 2 > CANVAS_H || e.x < -460 || e.x > CANVAS_W + 460) {
        enemies.splice(i, 1);
        continue;
      }
  
      // 撞玩家（仅机身中心判定点）；幽暮突击艇无法碰撞：既不撞伤玩家、也不受撞机反伤，与玩家互相穿过
      if (!(e.type === 'striker' && e.skill === 'dusk') &&
          player.alive && player.invuln <= 0 &&
          Math.hypot(e.x - player.x, e.y - (player.y + PLAYER.hitOffsetY)) < PLAYER.hitRadius + Math.max(e.w, e.h) / 2) {
        // 卫护飞船（invulnMul 0.4）：撞击造成的无敌时间仅为常规的 40%
        damagePlayer(ENEMY_TYPES[e.type].crashDmg, ENEMY_TYPES[e.type].invulnMul || 1);
        e.hp -= 40 * yu4AuraMul(e);   // 撞机反伤为普通伤害，可被御4防御光环削减（真实伤害仅高能爆弹）
        spawnParticles(e.x, e.y, e.color, 18, 220);
        shake(6, 0.25);   // 撞机冲击震屏较弱（受击本体反馈见 damagePlayer）
        if (e.hp <= 0) killEnemy(i);
      }
    }
  }
  
  function updateEnemyMovement(e, dt) {
    if (e.type === 'tornado') {
      // 大型龙卷：缓慢垂直下移直至脱离战场（轻微左右摇摆）
      e.y += STORM.tornadoDescend * dt;
      e.x += Math.sin(e.wobble * 0.5) * 14 * dt;
      return;
    }
    if (e.type === 'side' || e.type === 'prolifera' || e.type === 'escort') {
      // 斜插直线穿越，不反弹；SIDE_SPEED_MUL 统一控制全部虚像级（1类）飞船实际移动速度；
      // 入场瞬间额外冲刺（_entryMul 初值 >1），随后按指数快速衰减回 1（整组同帧生成、同倍率衰减，队形不变）
      // 增生侧翼艇同 1类移动；卫护飞船继承母舰 _sideVel 沿原航向大致继续飞行（_entryMul 预置 1，无入场冲刺）
      const v = e._sideVel || { vx: 0, vy: 60 };
      if (e._entryMul === undefined) e._entryMul = SIDE_ENTRY_BOOST;
      else if (e._entryMul > 1) e._entryMul = Math.max(1, 1 + (e._entryMul - 1) * Math.exp(-SIDE_ENTRY_DECAY * dt));
      const mul = SIDE_SPEED_MUL * e._entryMul;
      e.x += v.vx * mul * dt;
      e.y += v.vy * mul * dt;
      return;
    }
    if (e.type === 'striker' && e.skill === 'dusk') {
      // 幽暮：浮现(渐显) → 下移落点(平滑减速停驻) → 停 0.2s → 随机基准角环射 6/8 发 → 停 0.5s → 下移同距渐隐离场
      // 不走通用前锋逻辑（不停留前锋线、不冲锋、不通用开火）
      e.duskT += dt;
      if (e.duskPhase === 0) {
        // 浮现渐显（原位淡入）
        e.duskFade = Math.min(1, e.duskT / DUSK.fadeIn);
        if (e.duskT >= DUSK.fadeIn) { e.duskPhase = 1; e.duskT = 0; }
      } else if (e.duskPhase === 1) {
        // 下移到落点：ease-out（初速即峰值、随后平滑减速到 0 —— 加速快、不瞬停）
        // 剩余距离与瞬时速度低于阈值即视为停稳（消除 ease-out 长尾造成的“已停但动画未开始”空档），
        // 贴齐落点后立刻进入白环预警（速度阈值 10px/s ≈ 0.16px/帧，肉眼不可辨，不违反“不瞬停”要求）
        const t = Math.min(1, e.duskT / DUSK.moveDur);
        const ease = 1 - Math.pow(1 - t, 3);
        e.y = e.duskSY + DUSK.shift * ease;
        const remain = DUSK.shift * (1 - ease);
        const vel = 3 * DUSK.shift * (1 - t) * (1 - t) / DUSK.moveDur;
        if (t >= 1 || (remain <= 1.5 && vel <= 10)) { e.y = e.duskTY; e.duskPhase = 2; e.duskT = 0; }
      } else if (e.duskPhase === 2) {
        // 瞄准停顿 0.2s，结束时开火：以随机方向为基准，向四周正六边形(6)或正八边形(8)的均匀方向各射 1 发
        if (e.duskT >= DUSK.aimWait) {
          e.duskN = Math.random() < 0.5 ? 6 : 8;
          e.duskBaseA = Math.random() * Math.PI * 2;
          const cfg = ENEMY_TYPES.striker;
          for (let k = 0; k < e.duskN; k++) {
            pushEBullet(e, e.duskBaseA + k * Math.PI * 2 / e.duskN, cfg.bulletSpeed, cfg, { x: e.x, y: e.y });
          }
          e.duskPhase = 4; e.duskT = 0;   // 发射一轮后随即离场
        }
      } else {
        // 渐隐离场：向下移动与浮现时相同的距离，透明度同步衰减（ease-in 加速离去）
        const t = Math.min(1, e.duskT / DUSK.exitDur);
        e.y = e.duskTY + DUSK.shift * (t * t);
        e.duskFade = 1 - t;
        if (t >= 1) e.y = CANVAS_H + e.h;   // 已完全渐隐，移出屏外交由通用出屏检测移除
      }
      return;
    }
    if (e.type === 'striker') {
      // 前锋定位：快速入位到 3/4 类前方（更靠下、更接近玩家）停留，随后向下冲锋（速度×0.7）
      const descend = 200 * STRIKER_SPEED_MUL;   // 入位下降速度
      // 霜白(silent)：下降到前锋线后才开始计停留时间（停留满 holdTimer 秒再冲锋）；其余变体沿用入位即计时
      const holdAfterArrival = (e.skill === 'silent');
      if (e.holdTimer > 0) {
        if (!holdAfterArrival || e.y >= STRIKER_HOLD_Y - 0.5) e.holdTimer -= dt;
        // 下降至前锋停留线：接近时逐渐减速到 0（而非瞬间归零）
        if (e.y < STRIKER_HOLD_Y) {
          if (e.vy == null) e.vy = descend;
          const dist = STRIKER_HOLD_Y - e.y;
          const targetVy = dist >= 70 ? descend : descend * Math.max(0.12, dist / 70);
          e.vy += (targetVy - e.vy) * Math.min(1, dt * 12);
          e.y += e.vy * dt;
          if (dist <= 1) { e.y = STRIKER_HOLD_Y; e.vy = 0; }
        }
        e.x += Math.sin(e.wobble) * 14 * dt;
        return;
      }
      // 冲锋启动：较短时间内从 0 平滑加速到冲锋速度
      const charge = (160 + (state.level - 1) * 8) * STRIKER_SPEED_MUL * e.speedMul;
      if (e.vy == null) e.vy = 0;
      e.vy += (charge - e.vy) * Math.min(1, dt * 10);
      e.y += e.vy * dt;
      e.x += Math.sin(e.wobble) * 30 * dt;
      return;
    }
    if (e.type === 'hanshuang') {
      // 寒霜：登场计时 → 直线下移到 60%~80% 随机高度 → 停留 20s → 向下离场（不攻击，不走通用逻辑）
      e.auraT += dt;
      const spd = HANSHUANG.speed * e.speedMul;
      if (!e.arrived) {
        e.y += spd * dt;
        if (e.y >= e.targetY) { e.y = e.targetY; e.arrived = true; }
      } else if (state.challenge) {
        // 图鉴挑战模式：永驻场，便于观察光圈减速效果
      } else if (e.dwellT > 0) {
        e.dwellT -= dt;
      } else {
        e.leaving = true;
        e.y += spd * dt;   // 停留结束向下离场，出屏后由通用检测移除
      }
      return;
    }
    if (e.type === 'weilong') {
      // 威龙：独立蛇形航点巡航（不走悬停/离场通用逻辑）
      updateWeilongMovement(e, dt);
      return;
    }
    if (e.type === 'baoling') {
      // 暴鸰：不悬停，径直下压；武装后进入索敌半径 → 停车锁定投弹；投弹后停留 1.5s 再以 70% 速继续俯冲
      e.blT += dt;
      if (e.blPhase === 0) {
        e.y += BAOLING.speedSlow * e.speedMul * dt;
        if (e.blT >= BAOLING.armDelay && player.alive && e.y < player.y &&
            Math.hypot(e.x - player.x, e.y - player.y) <= BAOLING.triggerDist) {
          e.blPhase = 1;
          e.blWarn = { tx: player.x, ty: player.y, t: 0 };   // 预警区锁定玩家当前位置（不再跟踪）
        }
        return;
      }
      if (e.blPhase === 1) {
        // 停车：预警倒计时，结束后炸弹向下脱离（火星特效），交由 blBombs 独立飞行
        e.blWarn.t += dt;
        if (e.blWarn.t >= BAOLING.warnTime) {
          blBombs.push({
            x: e.x, y: e.y + 18,
            tx: e.blWarn.tx, ty: e.blWarn.ty,
            phase: 'drop', t: 0, spd: BAOLING.dropSpeed, ux: 0, uy: 1,
          });
          spawnParticles(e.x, e.y + 16, '#ffd166', 12, 220);   // 脱离火星
          spawnParticles(e.x, e.y + 16, '#ff7a45', 8, 160);
          e.blThrown = true;
          e.blPhase = 2;
          e.blWaitT = 0;
        }
        return;
      }
      if (e.blPhase === 2) {
        // 投弹后原地多停留 1.5s，随后才继续俯冲
        e.blWaitT += dt;
        if (e.blWaitT >= BAOLING.postThrowWait) e.blPhase = 3;
        return;
      }
      e.y += BAOLING.speedPost * e.speedMul * dt;   // 投弹完毕：以炮艇 70% 速继续俯冲（出屏由通用检测移除）
      return;
    }
    // gunship / capital / harbinger / yu4：下降到悬停高度 → 停留开火 → 停止攻击、以进场同速前开走（可能撞击玩家）
    // 御4 与炮艇悬停位置/行为一致，但速度降低 20%（320 → 256）
    const cruise = (e.type === 'capital' ? 260 : e.type === 'harbinger' ? HARBINGER.descend : e.type === 'yu4' ? YU4.speed : 320) * e.speedMul;
    if (!e.arrived) {
      // 接近悬停高度时逐渐减速到 0（而非瞬间归零）
      if (e.vy == null) e.vy = cruise;
      const dist = e.hoverY - e.y;
      const targetVy = dist >= 90 ? cruise : cruise * Math.max(0.12, dist / 90);
      e.vy += (targetVy - e.vy) * Math.min(1, dt * 12);
      e.y += e.vy * dt;
      if (dist <= 1 || e.y >= e.hoverY) {
        e.y = e.hoverY; e.arrived = true; e.vy = 0;
        if (e.type === 'capital') {
          // 4类就位展开动画：0.55s 机翼从收拢完全弹出
          e.unfoldT = 0.55;
          spawnParticles(e.x, e.y + 20, '#ffb3bd', 16, 200);
        }
      }
      return;
    }
    if (e.holdTimer > 0) {
      e.holdTimer -= dt;
      // 悬停期间水平巡航
      if (e.type === 'capital') {
        e.x = clamp(e.x + Math.sin(e.wobble * 0.35) * 30 * dt, e.w / 2 + 6, CANVAS_W - e.w / 2 - 6);
      } else if (!e.staticX) {
        // gunship / harbinger：轻幅左右巡航（先兆者幅度更小，稳居后排）
        // staticX：BOSS 召唤的先兆者固定在最左/最右，不巡航，避免被 BOSS 机体挡住打不到
        e.x += Math.sin(e.wobble * 0.6) * (e.type === 'harbinger' ? 24 : 50) * e.speedMul * dt;
      }
      e.x = clamp(e.x, e.w / 2, CANVAS_W - e.w / 2);
      return;
    }
    // 停留结束：停止攻击，以进场同速向下开走，直至飞出屏幕
    // 挑战模式：不离开，持续悬停攻击（便于观察弹幕）
    if (state.challenge) { e.holdTimer = 2; return; }
    e.leaving = true;
    // 启动加速：较短时间内从 0 平滑加速到巡航速度（比减速过程更快）
    if (e.vy == null) e.vy = 0;
    e.vy += (cruise - e.vy) * Math.min(1, dt * 10);
    e.y += e.vy * dt;
  }

  // 威龙移动：沿蛇形航点路径巡航；攻击窗口内停止移动；到位航点可停顿（dwell）
  function updateWeilongMovement(e, dt) {
    // 攻击时停止移动（attackT 由 updateEnemyFire 在发起连射时设置）
    if (e.attackT > 0) { e.attackT -= dt; return; }
    const wps = e.waypoints;
    if (!wps || e.wpIdx >= wps.length) return;   // 路径走完（离场中），交由出屏检测移除
    // 航点停顿（如末段 2s）：停顿期间不推进
    if (e.dwellT > 0) {
      e.dwellT -= dt;
      if (e.dwellT <= 0) e.wpIdx++;
      return;
    }
    const wp = wps[e.wpIdx];
    const dx = wp.x - e.x, dy = wp.y - e.y;
    const dist = Math.hypot(dx, dy);
    const spd = WEILONG.speed * e.speedMul;
    if (dist <= spd * dt + 1.5) {
      // 抵达航点：吸附到精确位置，按需停顿或推进到下一航点
      e.x = wp.x; e.y = wp.y;
      if (wp.dwell) e.dwellT = wp.dwell;
      else e.wpIdx++;
    } else {
      e.x += dx / dist * spd * dt;
      e.y += dy / dist * spd * dt;
    }
  }
  
  function updateEnemyFire(e, dt) {
    if (e.y < 0 || e.x < -30 || e.x > CANVAS_W + 30) return;   // 未入场不开火（含横向尚未入场的长队队尾，避免屏外开火）
    // 幽暮突击艇：环射由移动状态机在“瞄准停顿”结束时触发，不走通用开火计时
    if (e.type === 'striker' && e.skill === 'dusk') return;
    // 大型龙卷：随机向 360° 快速射出风条（从机体内部随机点射出，与涡流风旋技能的风条完全一致）
    if (e.type === 'tornado') {
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        e.fireTimer = rand(0.20, 0.30);
        for (let k = 0; k < 2; k++) {
          // 风条：初速低沿飞行方向加速（100.625→408.1），长度 7.2 以 150px/s 长到 42，波动渲染
          pushBossBullet(e.x + rand(-e.w * 0.2, e.w * 0.2), e.y + rand(-e.h * 0.3, e.h * 0.3),
            Math.random() * Math.PI * 2, 56,
            { r: 5.6, dmg: STORM.tornadoDmg, color: STORM_WIND, len: 7.2, lenTarget: 42, growRate: 150,
              oval: true, accel: 100.625, maxSpeed: 408.1 });
        }
      }
      return;
    }
    // 炮火先兆者：独立充能循环，红色充满即召唤导弹预警（最多导引 4 次）
    if (e.type === 'harbinger') {
      if (!e.arrived) return;
      if (e.leaving && e.missilesGuided >= 4) return;
      e.chargeT += dt;
      if (!e.firedThisCycle && e.chargeT >= HARBINGER.charge && e.missilesGuided < 4) {
        e.firedThisCycle = true;
        e.missilesGuided++;
        summonMissile(e);
      }
      if (e.chargeT >= HARBINGER.charge + HARBINGER.cover) { e.chargeT = 0; e.firedThisCycle = false; }
      return;
    }
    // 威龙：每隔一段时间朝玩家射 5 枚无偏转快弹（弹速 +60%）；发起时设置攻击窗口（期间停止移动）
    // 自包含处理连发（不落入下方通用 burst 逻辑，避免 fireTimer 双重递减）
    if (e.type === 'weilong') {
      if (e.burst) {
        // 连发进行中：按间隔逐发射出（5 枚同向、无偏转）
        e.burstTimer -= dt;
        if (e.burstTimer <= 0) {
          const b = e.burst;
          pushEBullet(e, b.baseAng, b.speed, ENEMY_TYPES.weilong, b.opts);
          b.shots++;
          e.burstTimer = b.gap;
          if (b.shots >= b.count) e.burst = null;
        }
        return;
      }
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        const cfg = ENEMY_TYPES.weilong;
        e.fireTimer = rand(cfg.fireInterval[0], cfg.fireInterval[1]);
        e.burst = {
          baseAng: Math.atan2(player.y - e.y, player.x - e.x),   // 锁定玩家方向（无偏转）
          speed: cfg.bulletSpeed * WEILONG.bulletSpeedMul,       // 较普通弹快 60%
          count: WEILONG.burstCount, shots: 0, gap: WEILONG.burstGap,
          opts: { color: '#ffb42e', r: 5, dmg: cfg.bulletDmg },  // 橙黄能量弹
        };
        e.burstTimer = 0;   // 首立即发
        e.attackT = WEILONG.burstGap * (WEILONG.burstCount - 1) + 0.10;   // 攻击窗口：期间停止移动
      }
      return;
    }
    // 其余悬停型：停留结束、前开走阶段停止攻击
    if (e.leaving) return;

    // 定时子射击队列：每帧递减，到点执行（双侧双曲线 / 第二波弹幕 / 多轮齐射等）
    if (e.scheduled && e.scheduled.length) {
      for (let si = e.scheduled.length - 1; si >= 0; si--) {
        const sc = e.scheduled[si];
        sc.t -= dt;
        if (sc.t <= 0) { sc.fn(); e.scheduled.splice(si, 1); }
      }
    }
  
    // 连射状态（螺旋 / 双连炮 / 齐射）优先
    if (e.burst) {
      e.burstTimer -= dt;
      if (e.burstTimer <= 0) {
        const b = e.burst;
        const cfg = ENEMY_TYPES[e.type];
        const jit = b.jitter ? rand(-b.jitter, b.jitter) : 0;   // 每发随机角度偏差
        pushEBullet(e, b.baseAng + b.step * b.shots + jit, b.speed, cfg, b.opts || {});
        if (b.mirror) {
          const mAng = Math.PI - (b.baseAng + b.step * b.shots + jit);
          // mirrorAx：镜像弹反转横向加速度 → 左右对称的双曲线
          const mOpts = (b.opts && b.mirrorAx) ? Object.assign({}, b.opts, { ax: -(b.opts.ax || 0) }) : (b.opts || {});
          pushEBullet(e, mAng, b.speed, cfg, mOpts);
        }
        b.shots++;
        e.burstTimer = b.gap;
        if (b.shots >= b.count) e.burst = null;
      }
      return;
    }
  
    e.fireTimer -= dt;
    if (e.fireTimer > 0) return;
    const cfg = ENEMY_TYPES[e.type];
    e.fireTimer = rand(cfg.fireInterval[0], cfg.fireInterval[1]);
  
    if (e.type === 'side' || e.type === 'prolifera' || e.type === 'escort') {
      // 仅 side 的 'shoot' 行为追踪射击，且整场只攻击一次（首射后不再开火）；增生侧翼艇/卫护飞船无攻击
      if (e.type === 'side' && e.behavior === 'shoot' && !e.hasFired) {
        pushEBullet(e, Math.atan2(player.y - e.y, player.x - e.x) + rand(-0.06, 0.06), cfg.bulletSpeed, cfg);
        e.hasFired = true;
      }
      return;
    }
    if (e.type === 'striker') {
      if (e.skill === 'spread') {
        // 烈橙：朝向前方（向下）对称射两发，两弹射线夹角在 50°/60°/70° 间随机（不追踪、不直射）
        const face = Math.PI / 2;
        const spreadDeg = 50 + Math.floor(Math.random() * 3) * 10;   // 50 / 60 / 70
        const half = spreadDeg * Math.PI / 360;                       // 夹角一半（度→弧度）
        pushEBullet(e, face - half, cfg.bulletSpeed, cfg);
        pushEBullet(e, face + half, cfg.bulletSpeed, cfg);
      } else if (e.skill === 'homing') {
        // 幽蓝：追踪玩家方向射击（带极小偏差）
        pushEBullet(e, Math.atan2(player.y - e.y, player.x - e.x) + rand(-0.05, 0.05), cfg.bulletSpeed, cfg);
      } else if (e.skill === 'silent') {
        // 霜白：不开火
      } else {
        // 赤红：垂直向前直射，带 ±10° 随机偏差、不追踪
        pushEBullet(e, Math.PI / 2 + rand(-Math.PI / 18, Math.PI / 18), cfg.bulletSpeed, cfg);
      }
      return;
    }
    if (e.type === 'gunship') {
      if (e.skill === 'aggressive') {
        // 红：火力猛 —— 瞄准三连射+外扩双曲线（合并） / 内收双曲线 / 三方向三段齐射
        switch (e.pattern % 3) {
          case 0: {
            // 技能1（合并，两段弹幕同时发射）：瞄准三连射（锁定发射瞬间玩家方位）与左右双曲线外扩弹流并行
            const aimAng = Math.atan2(player.y - e.y, player.x - e.x);
            // 双曲线占用 burst 槽，立即开始（每侧6发、向两侧外扩）
            e.burst = { baseAng: Math.PI / 2 - 0.18, step: 0, count: 6, shots: 0, gap: 0.085, speed: cfg.bulletSpeed * 1.05, mirror: true, mirrorAx: true, opts: { ax: 220 } };
            e.burstTimer = 0;
            // 三连射不占 burst 槽，改走 scheduled 直射：第 1 发同帧立即出膛，与双曲线同步开火
            pushEBullet(e, aimAng, cfg.bulletSpeed * 1.25, cfg);
            e.scheduled.push({ t: 0.12, fn: () => pushEBullet(e, aimAng, cfg.bulletSpeed * 1.25, cfg) });
            e.scheduled.push({ t: 0.24, fn: () => pushEBullet(e, aimAng, cfg.bulletSpeed * 1.25, cfg) });
            break;
          }
          case 1:
            // 技能2：左右同时双曲线弹（每侧6发）——方向反转：右侧弹往左扫、左侧弹往右扫（向内交叉；主弹 ax 反向即得）
            e.burst = { baseAng: Math.PI / 2 - 0.18, step: 0, count: 6, shots: 0, gap: 0.085, speed: cfg.bulletSpeed * 1.05, mirror: true, mirrorAx: true, opts: { ax: -220 } };
            e.burstTimer = 0;
            break;
          case 2: {
            // 技能三：垂直向下 + 下±20° 三方向，每方向快速射 2 发，连发 3 段（段间隔 0.5s）；
            // 第三段发射完（段内第二发 t=1.11s 出膛）才重新计算攻击间隔，
            // 避免齐射未结束 fireTimer 就走完、下个技能提前插入打断节奏
            e.fireTimer = 1e9;   // 挂起攻击计时（触发分支前已被重置），由第三段结束的 scheduled 恢复
            fireTriVolley(e, cfg);
            e.scheduled.push({ t: 0.5, fn: () => fireTriVolley(e, cfg) });
            e.scheduled.push({ t: 1.0, fn: () => fireTriVolley(e, cfg) });
            e.scheduled.push({ t: 1.11, fn: () => { e.fireTimer = rand(cfg.fireInterval[0], cfg.fireInterval[1]); } });
            break;
          }
        }
      } else if (e.skill === 'ring') {
        // 金：'/\/\' 弹幕（快速2发×2组） / 巨型橙红弹（单发） 交替
        switch (e.pattern % 2) {
          case 0:   // 技能1：'/\/\' 弹幕 —— 快速发射两次，短暂间隔后再快速发射两次
            fireSlashPattern(e, cfg);
            e.scheduled.push({ t: 0.14, fn: () => fireSlashPattern(e, cfg) });
            e.scheduled.push({ t: 0.62, fn: () => fireSlashPattern(e, cfg) });
            e.scheduled.push({ t: 0.76, fn: () => fireSlashPattern(e, cfg) });
            break;
          case 1: {   // 技能2：向玩家发射一枚巨型橙红弹（常规配色、半径缩小30%、仅1发）
            const ang = Math.atan2(player.y - e.y, player.x - e.x);
            pushEBullet(e, ang, cfg.bulletSpeed * 0.85, cfg, { r: 13, len: 0, color: SHIP_BULLET_COLOR, dmg: cfg.bulletDmg * 1.4 });
            break;
          }
        }
      } else {
        // 紫 mixed：散射 + 追踪（%4 循环）
        switch (e.pattern % 4) {
          case 0:   // 散射：朝正下方同方向快速射出 2 发（间隔较小、不连在一起）
            e.burst = { baseAng: Math.PI / 2, step: 0, count: 2, shots: 0, gap: 0.13, speed: cfg.bulletSpeed, mirror: false };
            e.burstTimer = 0;
            break;
          case 1: {   // 散射：8 发环形爆发
            const off = Math.random() * Math.PI * 2;
            for (let k = 0; k < 8; k++) pushEBullet(e, off + k * Math.PI / 4, cfg.bulletSpeed * 0.85, cfg);
            break;
          }
          case 2: {   // 追踪：朝玩家方向 ±5° 一次性同时射出 2 发（只射一次）
            const ang = Math.atan2(player.y - e.y, player.x - e.x);
            const a5 = Math.PI / 36;   // 5°
            pushEBullet(e, ang - a5, cfg.bulletSpeed * 1.15, cfg);
            pushEBullet(e, ang + a5, cfg.bulletSpeed * 1.15, cfg);
            break;
          }
          case 3: {   // 追踪：瞄准玩家单发高速狙击
            pushEBullet(e, Math.atan2(player.y - e.y, player.x - e.x), cfg.bulletSpeed * 1.5, cfg);
            break;
          }
        }
      }
      e.pattern++;
      return;
    }
    // capital：按变体技能循环弹幕（3/4类常规子弹均为橙红色长条弹）
    if (e.skill === 'lance') {
      // 蓝：更聚焦玩家 —— 六连齐射(±20°随机偏差) / 大红弹飞行后分裂6小弹 / 双臂螺旋
      switch (e.pattern % 3) {
        case 0:   // 技能1：瞄准六连齐射，每发 ±20° 随机偏差
          e.burst = { baseAng: Math.atan2(player.y - e.y, player.x - e.x), step: 0, count: 6, shots: 0, gap: 0.13, speed: cfg.bulletSpeed * 1.2, mirror: false, jitter: Math.PI / 9 };
          e.burstTimer = 0;
          break;
        case 1: {   // 技能2：向前方发射大号红弹，飞行一段后停止→分裂成 6 个小红弹（互相 60°）
          const ang = Math.atan2(player.y - e.y, player.x - e.x);
          pushEBullet(e, ang, cfg.bulletSpeed * 0.9, cfg, {
            r: 15, len: 0, color: SPLIT_RED,
            split: { dist: 170, count: 6, speed: cfg.bulletSpeed * 1.15, r: 6, color: SPLIT_RED, len: 0 },
          });
          break;
        }
        case 2:   // 技能3（不变）：双臂螺旋 12 发
          e.burst = { baseAng: Math.random() * Math.PI * 2, step: 0.4, count: 12, shots: 0, gap: 0.1, speed: cfg.bulletSpeed, mirror: true };
          e.burstTimer = 0;
          break;
      }
    } else {
      // 红 barrage：三种设计化弹幕循环（交叉矛 / 弧线织网 / '/||\'→'/|\' 加速弹幕）
      switch (e.pattern % 3) {
        case 0:
          fireCrossLances(e, cfg);
          break;
        case 1: {   // 技能2：从一侧机翼依次射出 6 枚扇形弹（正下→水平向下 20°），短暂间隔后另一侧再射（先左先右随机）
          const firstSide = Math.random() < 0.5 ? -1 : 1;
          fireHyperbolaFan(e, cfg, firstSide);
          e.scheduled.push({ t: 0.62, fn: () => fireHyperbolaFan(e, cfg, -firstSide) });
          break;
        }
        case 2:
          fireBarrageWide(e, cfg);        // '/||\'（30°）
          e.scheduled.push({ t: 0.55, fn: () => fireBarrageNarrow(e, cfg) });   // 随后 '/|\'（45°）
          break;
      }
    }
    e.pattern++;
  }
  
  function pushEBullet(e, ang, speed, cfg, opts = {}) {
    // 3/4 类舰常规子弹：橙红色长条弹（可被 opts 覆盖）；1/2 类维持黄色圆弹
    const isShip = e.type === 'gunship' || e.type === 'capital';
    eBullets.push({
      x: opts.x != null ? opts.x : e.x,
      y: opts.y != null ? opts.y : e.y + e.h / 2,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      ax: opts.ax || 0,             // 横向加速度（1/4 双曲线弹道）
      accel: opts.accel || 0,       // 沿飞行方向的加速度（初速低、快速增长）
      maxSpeed: opts.maxSpeed || 0, // 加速上限（0 = 不限）
      r: opts.r != null ? opts.r : cfg.bulletR,
      len: opts.len != null ? opts.len : (isShip ? SHIP_BULLET_LEN : 0),
      dmg: opts.dmg != null ? opts.dmg : cfg.bulletDmg,
      color: opts.color || (isShip ? SHIP_BULLET_COLOR : '#ffd166'),
      split: opts.split || null,    // 分裂弹配置（飞行一段→停止→分裂）
      traveled: 0,
    });
  }

  /* ---------- 3类金/红（gunship）设计化弹幕 ---------- */
  // 金 技能1：'/\/\' 弹幕 —— 左右各一组 '/'+'\'，与竖直方向夹角 10°
  function fireSlashPattern(e, cfg) {
    const down = Math.PI / 2, a10 = Math.PI / 18, sideX = e.w * 0.42;
    pushEBullet(e, down + a10, cfg.bulletSpeed, cfg, { x: e.x - sideX });   // 左组 '/'
    pushEBullet(e, down - a10, cfg.bulletSpeed, cfg, { x: e.x - sideX });   // 左组 '\'
    pushEBullet(e, down + a10, cfg.bulletSpeed, cfg, { x: e.x + sideX });   // 右组 '/'
    pushEBullet(e, down - a10, cfg.bulletSpeed, cfg, { x: e.x + sideX });   // 右组 '\'
  }

  // 红 技能3：垂直向下 + 下±20° 三方向，每方向快速射 2 发（一轮，两发间隔 0.11s）
  function fireTriVolley(e, cfg) {
    const down = Math.PI / 2, a20 = Math.PI / 9;
    const dirs = [down - a20, down, down + a20];
    const speed = cfg.bulletSpeed * 1.05;
    for (const ang of dirs) pushEBullet(e, ang, speed, cfg);
    e.scheduled.push({ t: 0.11, fn: () => { for (const ang of dirs) pushEBullet(e, ang, speed, cfg); } });
  }

  /* ---------- 4类红（capital barrage）设计化弹幕 ---------- */
  // 技能1：双翼交叉矛 —— 左翼向右下、右翼向左下，各 3 发收拢交叉成 X
  function fireCrossLances(e, cfg) {
    const down = Math.PI / 2;
    const wingX = e.w * 0.38;
    const speed = cfg.bulletSpeed * 1.05;
    const spawnY = e.y - e.h * 0.3;   // 发射点上移：弹幕飞抵下方时更分散
    for (let k = 0; k < 3; k++) {
      const a = 0.34 + k * 0.16;   // 相对竖直的偏角（约 20°/29°/38°）
      pushEBullet(e, down - a, speed, cfg, { x: e.x - wingX, y: spawnY });   // 左翼 → 右下
      pushEBullet(e, down + a, speed, cfg, { x: e.x + wingX, y: spawnY });   // 右翼 → 左下
    }
  }

  // 技能2：方向扇形弹幕 —— 从一侧机翼逐发依次射出 6 枚弹，
  // 不再一次性齐射，而是从最下方（正下 π/2）逐发往上抬，至最上方一枚与水平方向向下成 20°，
  // 6 枚在 70° 跨度内均匀分布（相邻夹角 14°），朝场地中心一侧展开成宽扇
  function fireHyperbolaFan(e, cfg, side) {
    // side = -1：左翼射出、扇形向右（中心）展开；side = +1：右翼射出、向左（中心）展开
    const wingX = e.w * 0.42;
    const spawnX = e.x + side * wingX;
    const speed = cfg.bulletSpeed;
    const a20 = Math.PI / 9;                                   // 20°：最上方弹与水平向下的夹角
    const N = 6;                                               // 每次射出总数
    const gap = 0.07;                                          // 相邻两发射出间隔（从下往上依次）
    const topAng = Math.PI / 2 + side * (Math.PI / 2 - a20);   // 最上方弹方向（20° below horizontal，朝中心）
    for (let k = 0; k < N; k++) {
      // k=0 最下方（正下 π/2） → k=N-1 最上方（与水平向下成 20°）
      const ang = Math.PI / 2 + (topAng - Math.PI / 2) * (k / (N - 1));
      const fire = () => pushEBullet(e, ang, speed, cfg, { x: spawnX });
      if (k === 0) fire();
      else e.scheduled.push({ t: k * gap, fn: fire });
    }
  }

  // 技能3 笔画：同一射线连射 4 发不同初速的长条弹，沿射线拉开成“一笔画”；初速低→加速到最大弹速
  function fireStroke(e, ang, spawnX, cfg, accel, maxSpeed) {
    const spawnY = e.y - e.h * 0.1;   // 发射点（舰体中心略上方），弹幕飞抵下方时更分散
    for (const sp of [42, 97, 152, 207]) {   // 相邻间距较原来 +50%
      pushEBullet(e, ang, sp, cfg, { x: spawnX, y: spawnY, accel, maxSpeed, color: SHIP_BULLET_COLOR, len: SHIP_BULLET_LEN });
    }
  }

  // 技能3 第一波：'/||\' —— / 与 | 夹角 30°，两个 | 之间留有横向距离
  function fireBarrageWide(e, cfg) {
    const down = Math.PI / 2, a30 = Math.PI / 6;
    const accel = 240, maxSpeed = cfg.bulletSpeed * 1.2, gap = 40;   // accel 降 40%（400→240）、最大弹速降 40%（2×→1.2×）→ 加速更缓、笔画拉得更开
    fireStroke(e, down + a30, e.x - gap, cfg, accel, maxSpeed);        // '/' 左外，向下偏左 30°
    fireStroke(e, down, e.x - gap * 0.35, cfg, accel, maxSpeed);       // '|' 左
    fireStroke(e, down, e.x + gap * 0.35, cfg, accel, maxSpeed);       // '|' 右
    fireStroke(e, down - a30, e.x + gap, cfg, accel, maxSpeed);        // '\' 右外，向下偏右 30°
  }

  // 技能3 第二波（随后）：'/|\' —— 夹角 45°，单 '|' 居中
  function fireBarrageNarrow(e, cfg) {
    const down = Math.PI / 2, a45 = Math.PI / 4;
    const accel = 240, maxSpeed = cfg.bulletSpeed * 1.2, gap = 34;   // accel 降 40%（400→240）、最大弹速降 40%（2×→1.2×）→ 加速更缓、笔画拉得更开
    fireStroke(e, down + a45, e.x - gap, cfg, accel, maxSpeed);        // '/'
    fireStroke(e, down, e.x, cfg, accel, maxSpeed);                    // '|'
    fireStroke(e, down - a45, e.x + gap, cfg, accel, maxSpeed);        // '\'
  }

  // ---------- 炮火先兆者导弹 ----------
  // 召唤：锁定玩家当前 x，生成垂直预警线（3s 后导弹从上方高速下落）
  function summonMissile(e) {
    missileWarns.push({ x: clamp(player.x, 14, CANVAS_W - 14), t: 0, dur: HARBINGER.warnTime });
    spawnParticles(e.x, e.y, '#ff5a3c', 14, 200);
    shake(4, 0.2);
  }

  // 导弹命中玩家的特殊结算
  function missileHitPlayer() {
    // 挑战模式：我方血量无限，仅播放受击特效
    if (state.challenge) {
      player.invuln = PLAYER.invulnTime; player.invulnBlink = true;   // 受击无敌：闪动提示
      shake(8, 0.35);
      spawnParticles(player.x, player.y, '#ff5a3c', 26, 320);
      return;
    }
    if (player.hp < HARBINGER.lowHpKill) {
      // 血量低于 60：直接击杀（走标准掉命/结束流程）
      damagePlayer(player.hp + 100);
    } else {
      // 血量 >= 60：失去 80% 当前血量 + 武器等级 -1
      player.hp = player.hp * 0.2;
      if (player.weapon > 1) player.weapon--;
      player.berserk = 0;
      player.invuln = PLAYER.invulnTime; player.invulnBlink = true;   // 受击无敌：闪动提示
      shake(8, 0.35);
      spawnParticles(player.x, player.y, '#ff5a3c', 26, 320);
    }
  }

  function updateMissiles(dt) {
    // 预警线：到时转为下落导弹
    for (let i = missileWarns.length - 1; i >= 0; i--) {
      const w = missileWarns[i];
      w.t += dt;
      if (w.t >= w.dur) {
        missiles.push({ x: w.x, y: -30, vy: HARBINGER.missileSpeed, r: HARBINGER.missileR });
        missileWarns.splice(i, 1);
      }
    }
    // 下落导弹
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      m.y += m.vy * dt;
      // 护盾消解
      if (player.shield > 0 && player.alive &&
          Math.hypot(m.x - player.x, m.y - player.y) < 36 + m.r) {
        spawnParticles(m.x, m.y, '#6fe3ff', 16, 220);
        missiles.splice(i, 1);
        continue;
      }
      // 命中玩家判定点
      if (player.alive && player.invuln <= 0 &&
          Math.hypot(m.x - player.x, m.y - (player.y + PLAYER.hitOffsetY)) < PLAYER.hitRadius + m.r) {
        missileHitPlayer();
        missiles.splice(i, 1);
        continue;
      }
      if (m.y > CANVAS_H + 40) { missiles.splice(i, 1); continue; }
    }
  }

  // 高能爆弹等清场时一并清除导弹与预警线（含暴风之眼区域标记/风流/风柱）
  function clearMissiles() {
    missileWarns.length = 0;
    missiles.length = 0;
    zoneMarks.length = 0;
    windFlows.length = 0;
    pillarStrikes.length = 0;
    stormVortex = null;   // 涡流风旋（技能7）一并清除
  }
  
  // ---------- 暴鸰炸弹 ----------
  // 已投出的炸弹：低速下坠 dropTime → 沿固定方向极速加速冲向预警区中心 → 抵达即爆炸（仅伤玩家，不伤敌人）
  function updateBaolingBombs(dt) {
    for (let i = blBombs.length - 1; i >= 0; i--) {
      const b = blBombs[i];
      b.t += dt;
      if (b.phase === 'drop') {
        // 低速下坠（初速极低，无高初速）
        b.y += BAOLING.dropSpeed * dt;
        if (Math.random() < 0.35) spawnParticles(b.x, b.y, '#ffb545', 1, 40);   // 引信余火
        if (b.t >= BAOLING.dropTime) {
          b.phase = 'strike';
          const dx = b.tx - b.x, dy = b.ty - b.y;
          const d = Math.hypot(dx, dy) || 1;
          b.ux = dx / d; b.uy = dy / d;   // 目标为静止预警区中心：方向固定
        }
      } else {
        // 极强加速冲刺：初速延续下坠低速，随后爆发加速
        b.spd += BAOLING.strikeAccel * dt;
        const step = b.spd * dt;
        const dist = Math.hypot(b.tx - b.x, b.ty - b.y);
        if (step >= dist) {
          explodeBaolingBomb(b);
          blBombs.splice(i, 1);
          continue;
        }
        b.x += b.ux * step;
        b.y += b.uy * step;
        if (Math.random() < 0.6) spawnParticles(b.x, b.y, '#ff7a45', 1, 36);   // 高速尾焰
      }
    }
  }

  // 炸弹爆炸（投掷命中）：红色预警区中心爆开，仅对玩家结算伤害（范围内）
  function explodeBaolingBomb(b) {
    spawnParticles(b.tx, b.ty, '#ff5a3c', 30, 320);
    spawnParticles(b.tx, b.ty, '#ffb545', 18, 260);
    spawnParticles(b.tx, b.ty, '#ffffff', 10, 200);
    shake(11, 0.35);
    if (player.alive &&
        Math.hypot(player.x - b.tx, player.y - b.ty) <= BAOLING.blastR) {
      damagePlayer(BAOLING.playerDmg);
    }
  }

  // 暴鸰亡语：炸弹尚未投出即被击毁 → 原地爆炸，对爆圈内所有单位造成伤害
  // （玩家 40 / 敌人 600 + 20% 最大生命，敌人伤害封顶 2600；可连锁引爆其它未投弹暴鸰；不抖屏）
  function detonateBaoling(e) {
    spawnParticles(e.x, e.y, '#ff5a3c', 36, 360);
    spawnParticles(e.x, e.y, '#ffd166', 24, 300);
    spawnParticles(e.x, e.y, '#ffffff', 12, 240);
    if (player.alive &&
        Math.hypot(player.x - e.x, player.y - e.y) <= BAOLING.blastR) {
      damagePlayer(BAOLING.playerDmg);
    }
    for (const t of enemies) {
      if (t === e) continue;
      // 非真实伤害：可被御4防御光环削减；敌人伤害封顶 2600
      t.hp -= Math.min(BAOLING.enemyDmgCap, BAOLING.enemyDmgBase + t.maxHp * BAOLING.enemyDmgRatio) * yu4AuraMul(t);
    }
    // 结算被炸毁的敌人（倒序 splice 安全；排除自身避免递归引爆自己）
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i] !== e && enemies[i].hp <= 0) killEnemy(i);
    }
  }

  // 敌人颜色标记：决定道具掉落规则（1类按行为 / 2·3·4类按变体 / 特殊舰船与 BOSS 按固定标记）
  //   red=套件×1.5 | purple=套件×1.2 | yellow=套件×1.2（含金）| blue=护盾6% | green=加血10% | orange=爆弹1%（整场一次）
  //   gray / white / black 无专属掉落规则，仅作分类（gray=灰黑系特殊无人机/炮兵）
  function enemyColorTags(e) {
    switch (e.type) {
      case 'side':      // 1类：白=pass 无规则 / 黄=shoot / 紫=kamikaze
        return e.behavior === 'shoot' ? ['yellow'] : e.behavior === 'kamikaze' ? ['purple'] : [];
      case 'prolifera': // 增生侧翼艇（淡青绿）
        return ['green'];
      case 'striker':   // 赤红 / 烈橙 / 幽蓝（霜白、幽暮无规则）
        return e.variant === 'crimson' ? ['red'] : e.variant === 'amber' ? ['orange'] : e.variant === 'azure' ? ['blue'] : [];
      case 'gunship':   // 紫 / 红 / 金（金曜按黄色计）
        return e.variant === 'violet' ? ['purple'] : e.variant === 'crimson' ? ['red'] : e.variant === 'amber' ? ['yellow'] : [];
      case 'capital':   // 红 / 蓝
        return e.variant === 'crimson' ? ['red'] : e.variant === 'azure' ? ['blue'] : [];
      case 'harbinger': return ['gray', 'red'];      // 炮火先兆者：灰 + 红
      case 'weilong':   return ['orange', 'yellow']; // 威龙：橙 + 黄
      case 'hanshuang': return ['gray', 'blue'];     // 寒霜：灰 + 蓝
      case 'yu4':       return ['gray', 'blue'];     // 御4：灰 + 蓝
      case 'baoling':   return ['gray', 'red'];      // 暴鸰：灰 + 红
      case 'boss':      return e.bossId === 'storm' ? ['white', 'blue'] : ['black'];   // 暴风之眼：白 + 蓝 / 旧日之歌：黑
      default:          return [];
    }
  }

  // 通用道具掉落（普通敌人与 BOSS 共用；依 升级套件 → 量子护盾 → 加血 顺序互斥判定）
  // 高能爆弹不在此池：仅 4类（5%）与 BOSS（20%）固定掉落，另有橙色敌人 0.5%（整场最多一次）独立判定
  function rollItemDrops(e, x, y) {
    const tags = enemyColorTags(e);
    const isBoss = e.type === 'boss';
    // 升级套件：基础 9% → 红 ×1.5 / 紫 ×1.2 / 黄（含金）×1.2；
    // 再按「场上已有套件数 + 我方火力等级」统一降率：===4 全体 ×0.5、>=5 全体 ×0.3
    let kitRate = DROP_KIT_RATE;
    if (tags.includes('red')) kitRate *= DROP_KIT_RED;
    if (tags.includes('purple')) kitRate *= DROP_KIT_PURPLE;
    if (tags.includes('yellow')) kitRate *= DROP_KIT_YELLOW;
    const kitLoad = powerups.reduce((n, p) => n + (p.kind === 'kit' ? 1 : 0), 0) + player.weapon;
    if (kitLoad >= 5) kitRate *= 0.3;
    else if (kitLoad === 4) kitRate *= 0.5;
    // 量子护盾：基础 2% / 蓝色 6%；场上已有护盾道具或我方已带盾时 ×0.35
    let shieldRate = tags.includes('blue') ? DROP_SHIELD_BLUE : DROP_SHIELD_RATE;
    if (powerups.some(p => p.kind === 'shield') || player.shield > 0) shieldRate *= DROP_SHIELD_STACK;
    // 加血套件：普通敌人走互斥链（基础 1.8% / 增生侧翼艇固定 10%）；BOSS 在链外独立判定（40% 掉 1 / 另有 10% 一次掉 2）
    const hpRate = isBoss ? 0 : (tags.includes('green') ? DROP_HP_GREEN : DROP_HP_RATE);
    const pr = Math.random();
    if (pr < kitRate) {
      // 升级套件；其中 5% 变为暴走道具（红橙大 S，吃到攻击等级立刻满级）
      if (Math.random() < DROP_KIT_BERSERK) spawnPowerup(x, y, 'berserk', 15);
      else spawnPowerup(x, y, 'kit', 12);
    } else if (pr < kitRate + shieldRate) {
      spawnPowerup(x, y, 'shield', 13);
    } else if (pr < kitRate + shieldRate + hpRate) {
      spawnPowerup(x, y, 'hp', 12);
    }
    if (isBoss) {
      const hr = Math.random();
      if (hr < DROP_HP_BOSS) spawnPowerup(x, y, 'hp', 12);
      else if (hr < DROP_HP_BOSS + DROP_HP_BOSS2) { spawnPowerup(x, y, 'hp', 12); spawnPowerup(x, y, 'hp', 12); }
    }
    // 橙色敌人（烈橙突击艇 / 威龙）：0.5% 掉爆弹 —— 整场战斗最多触发一次（不影响 4类 5% 与 BOSS 20%）
    if (tags.includes('orange') && !state.orangeBombUsed && Math.random() < DROP_BOMB_ORANGE) {
      state.orangeBombUsed = true;
      spawnPowerup(x, y, 'bomb', 12);
    }
  }

  function killEnemy(index, force) {
    const e = enemies[index];
    // 挑战模式：敌方血量无限，不可被击杀（回满血量并保留）；force=true（高能爆弹清屏秒杀）除外
    // 例外——BOSS 测试中被高能爆弹削至 0 的 BOSS：真正击杀并退出测试（走下方 BOSS 结算流程）
    const bossTestKill = state.challenge && state.challenge.kind === 'boss' && e.type === 'boss' && e.hp <= 0;
    // BOSS 测试模式下召唤的小怪（非 BOSS）可被正常击杀，不进入无敌回血
    const bossTestMinion = state.challenge && state.challenge.kind === 'boss' && e.type !== 'boss';
    if (state.challenge && !force && !bossTestKill && !bossTestMinion) { e.hp = e.maxHp; return; }
    // BOSS 击毁：单独结算
    if (e.type === 'boss') {
      state.score += e.score;
      spawnParticles(e.x, e.y, '#ffffff', 60, 380);
      spawnParticles(e.x, e.y, BOSS_BULLET.long, 40, 300);
      shake(22, 1.0);
      clearEnemyBullets(); clearMissiles();   // BOSS 死亡：立刻清除全场所有弹幕
      // BOSS 死亡：大量水晶四散飘落，短暂下坠后被战机全部吸收
      for (let k = 0; k < 48; k++) {
        const giant = Math.random() < 0.004;
        crystals.push({
          x: e.x + rand(-200, 200), y: e.y + rand(-40, 40),
          vx: rand(-80, 80), vy: rand(120, 210),
          r: giant ? 15 : 6, val: giant ? 500 : 10,
          giant, t: Math.random() * Math.PI * 2,
          absorbDelay: rand(0.35, 0.7),   // 稍微下落一段距离后再全部吸收
        });
      }
      // 击败 BOSS 20% 掉落高能爆弹
      if (Math.random() < 0.20) spawnPowerup(e.x, e.y, 'bomb', 12);
      // BOSS 死亡：掉落一个暴走道具（短暂下坠后被战机立即吸收，同水晶）
      powerups.push({
        x: e.x, y: e.y, kind: 'berserk', r: 15,
        vx: rand(-60, 60), vy: rand(120, 180),
        absorbDelay: rand(0.4, 0.7),   // 稍微下落一段距离后再强制吸收
      });
      // BOSS 也参与通用道具掉落池（颜色标记：旧日之歌=黑 / 暴风之眼=白+蓝）；
      // 加血规则不同：40% 掉 1 个 / 另有 10% 一次掉 2 个（下方清场循环会为其补 absorbDelay 强制吸收）
      rollItemDrops(e, e.x, e.y);
      state.bossStage = 'none';   // BOSS 流程结束
      state.bossTimer = 0;
      // 击败第一个 BOSS（旧日之歌）：水晶磁吸半径永久 +35%（本场战斗持续生效，重开归 1）
      if (e.bossId === 'song') state.crystalMagnetMul = 1.35;
      // 阶段推进：还有下一个 BOSS → 重置计时进入新一轮刷怪；已是最终 BOSS（或测试 / 图鉴挑战）→ 延迟后胜利结算
      state.bossPhase++;
      if (state.bossPhase < BOSS_SEQUENCE.length && !state.testBoss && !state.challenge) {
        state.bossVictoryDelay = 0;
        state.postBossDelay = 2;   // 击败 BOSS 后 2s 再刷怪（不计入关卡推进；到时固定刷首波 1类长队）
      } else {
        state.bossVictoryDelay = 2.5;  // 延迟后返回主界面
        state.defeatedBossName = e.name;
      }
      enemies.splice(index, 1);
      // BOSS 被击败：强行击坠场上所有剩余敌方单位（小怪 / 护航 / 召唤物，含 BOSS 测试召唤物）
      // 倒序遍历逐个走 killEnemy 完整击杀演出（爆炸粒子 / 水晶 / 计分）
      // （增生侧翼艇被清场击毁时会分裂卫护飞船并追加到数组尾部，故循环至场上无残留为止）
      while (enemies.some(en => en.type !== 'boss')) {
        for (let i = enemies.length - 1; i >= 0; i--) {
          if (enemies[i] && enemies[i].type !== 'boss') killEnemy(i);
        }
      }
      // 清场击杀可能触发 1 类紫亡语射击，统一再清一次残留敌弹
      clearEnemyBullets();
      // 清场击杀掉落的水晶 / 道具：与 BOSS 掉落物一致，延迟一段后强制吸收
      // （BOSS 自身掉落物已带 absorbDelay 不受影响；胜利结算延迟 2.5s 内可全部吸完）
      for (const c of crystals) {
        if (c.absorbDelay == null) c.absorbDelay = rand(0.35, 0.7);
      }
      for (const p of powerups) {
        if (p.absorbDelay == null) p.absorbDelay = rand(0.35, 0.7);
      }
      return;
    }
    // 卫护飞船（增生侧翼艇衍生）：仅掉水晶 —— 80% 掉 1 个 / 20% 掉 2 个，不参与通用水晶/道具掉落池
    if (e.type === 'escort') {
      spawnParticles(e.x, e.y, e.color, 14, 200);
      state.score += e.score;
      const n = Math.random() < 0.8 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        crystals.push({
          x: e.x + rand(-8, 8), y: e.y + rand(-5, 5),
          vx: 0, vy: rand(150, 200),
          r: 6, val: 10, giant: false,
          t: Math.random() * Math.PI * 2,
        });
      }
      enemies.splice(index, 1);
      return;
    }
    // 1类亡语 variants：阵亡时向下垂直射击
    if (e.deathShot) {
      const cfg = ENEMY_TYPES[e.type];
      pushEBullet(e, Math.PI / 2, cfg.bulletSpeed * 1.1, cfg);
    }
    // 暴鸰亡语：炸弹尚未投出即被击毁 → 原地爆炸（敌我通杀）；已投出则无亡语
    if (e.type === 'baoling' && !e.blThrown) detonateBaoling(e);
    spawnParticles(e.x, e.y, e.color, 22, 260);
    state.score += e.score;
    // 非 4类/BOSS 敌机被击毁不再抖屏（仅保留 4 类与 BOSS 的击毁震屏）
    // 增生侧翼艇：击毁后分裂出 2~3 个卫护飞船（蓝色小三角，沿原航向大致继续飞行，出厂带随机虚化护盾）
    if (e.type === 'prolifera') {
      const n = 2 + Math.floor(Math.random() * 2);
      const base = e._sideVel || { vx: 0, vy: 60 };
      for (let k = 0; k < n; k++) {
        const esc = makeEnemy('escort', e.x + rand(-10, 10), e.y + rand(-8, 8), { fireTimer: 1e9 });
        esc._sideVel = { vx: base.vx + rand(-16, 16), vy: base.vy + rand(-10, 14) };   // 大致沿原路径，带小幅散布
        esc._entryMul = 1;   // 预置 1：无入场冲刺，平滑接续原航向
      }
      spawnParticles(e.x, e.y, '#9cd6ff', 10, 180);
    }
    // 3 / 4 类击毁后槽位释放，再次出场由场面压力刷新系统接管（无固定冷却）
    if (e.type === 'capital') {
      spawnParticles(e.x, e.y, '#ffd166', 30, 340);
      shake(14, 0.5);
      // 高能爆弹：击败 4 类主力舰 5% 掉落（BOSS 为 20%；橙色敌人另有 0.5%，整场最多一次，见 rollItemDrops）
      if (Math.random() < 0.05) spawnPowerup(e.x, e.y, 'bomb', 12);
    }
    // 威龙击毁：高血量精英，较大爆炸演出（不抖屏）
    if (e.type === 'weilong') {
      spawnParticles(e.x, e.y, '#ffd166', 26, 320);
      spawnParticles(e.x, e.y, '#ff7a18', 18, 260);
    }
    // 寒霜击毁：冰晶碎裂演出（不抖屏）
    if (e.type === 'hanshuang') {
      spawnParticles(e.x, e.y, '#cfeeff', 26, 300);
      spawnParticles(e.x, e.y, '#7fd4ff', 16, 240);
    }
    // 御4击毁：防御力场随之瓦解，金灰碎片演出（不抖屏）
    if (e.type === 'yu4') {
      spawnParticles(e.x, e.y, '#e8d28a', 22, 280);
      spawnParticles(e.x, e.y, '#8b95a3', 14, 220);
    }
    // 暴鸰击毁：机体爆碎演出（未投弹时 detonateBaoling 另有大型爆炸；不抖屏）
    if (e.type === 'baoling') {
      spawnParticles(e.x, e.y, '#ff7a45', 20, 280);
      spawnParticles(e.x, e.y, '#ffd166', 12, 220);
    }
    // 水晶掉落：大概率，数量随体型增加；直接垂直下坠，不乱飘
    // 幽暮突击艇：必定掉落 2~3 个水晶
    const isDusk = e.type === 'striker' && e.skill === 'dusk';
    const dropR = Math.random();
    const cCount =
      isDusk ? 2 + Math.floor(Math.random() * 2) :
      e.type === 'capital' ? 8 + Math.floor(Math.random() * 8) :
      e.type === 'weilong' ? 6 + Math.floor(Math.random() * 7) :
      e.type === 'hanshuang' ? 4 + Math.floor(Math.random() * 4) :
      e.type === 'baoling' ? 2 + Math.floor(Math.random() * 3) :
      e.type === 'gunship' || e.type === 'harbinger' || e.type === 'yu4' ? 4 + Math.floor(Math.random() * 4) :
      1 + Math.floor(Math.random() * 3);
    if (isDusk || dropR < ((e.type === 'side' || e.type === 'prolifera') ? 0.55 : 0.8)) {
      for (let k = 0; k < cCount; k++) {
        // 极小概率巨型水晶（0.4%）：体型稍大，价值 50 颗普通水晶
        const giant = Math.random() < 0.004;
        crystals.push({
          x: e.x + rand(-10, 10), y: e.y + rand(-6, 6),
          vx: 0, vy: rand(150, 200),
          r: giant ? 15 : 6, val: giant ? 500 : 10,
          giant,
          t: Math.random() * Math.PI * 2,
        });
      }
    }
    // 通用道具掉落（颜色标记驱动，见 rollItemDrops）：
    // 升级套件 9%（红×1.5 / 紫×1.2 / 黄×1.2，负载降率） / 量子护盾 2%（蓝 6%） / 加血套件 1.8%（绿 10%）
    // 注：高能爆弹不在此通用池，仅由 4 类（5%）与 BOSS（20%）掉落，另有橙色敌人 0.5%（整场最多一次，rollItemDrops 内判定）
    rollItemDrops(e, e.x, e.y);
    enemies.splice(index, 1);
  }

