// 05-boss：旧日之歌 + 暴风之眼（状态机 / 技能 / 区域标记 / 涡流风旋 / 击退）
'use strict';

  // ---------- BOSS：旧日之歌 ----------
  function spawnBoss(id) {
    // 进入 BOSS 战：火力不足 Lv3 时补到 Lv3；并重置受击掉火力的累计计数（正常 / 挑战模式通用）
    if (player.weapon < 3) player.weapon = 3;
    player.hitCount = 0;
    const B = BOSSES[id] || BOSSES.song;
    // 暴风之眼：第一阶段为白色龙卷风暴（风暴之风汇聚成旋涡入场）
    if (B.id === 'storm') {
      enemies.push({
        type: 'boss', bossId: 'storm', name: B.name, lv: B.lv,
        x: CANVAS_W / 2, y: STORM.hoverY,
        w: STORM.w, h: STORM.h,
        hp: STORM.hp, maxHp: STORM.hp,
        score: STORM.score,
        phase: 'gather',   // gather（风聚 2.7s）→ swirl（旋胀 2.3s）→ form（成形 1.0s）→ combat，总长 6.0s 与旧日之歌对齐
        phaseT: 0,
        scale: 0, combatReady: false,
        moveT: 0, t: 0, rot: 0,   // rot：风暴自转角（逆时针）
        skill: null, skillCd: 0.2,   // 进战斗后 0.2s 即释放首个技能（必为技能6）
        lastSkill: -1, skillStreak: 0, dropBerserk: false,
      });
      shake(6, 0.6);
      return;
    }
    // 部件组装数据：6 个组件从黑洞边缘飞出并镶接到机体
    const parts = [];
    const partDefs = [
      { dx: -0.38, dy: -0.1, ang: -2.4, label: '左翼' },
      { dx:  0.38, dy: -0.1, ang:  2.4, label: '右翼' },
      { dx: -0.22, dy:  0.35, ang: -1.8, label: '左炮' },
      { dx:  0.22, dy:  0.35, ang:  1.8, label: '右炮' },
      { dx: -0.10, dy: -0.40, ang: -0.6, label: '左甲' },
      { dx:  0.10, dy: -0.40, ang:  0.6, label: '右甲' },
    ];
    for (let i = 0; i < partDefs.length; i++) {
      const pd = partDefs[i];
      parts.push({
        // 目标位置（相对于 BOSS 中心）
        tx: pd.dx * BOSS.w, ty: pd.dy * BOSS.h,
        // 当前位置（初始在黑洞边缘，等组装时飞出）
        x: 0, y: 0,
        ang: pd.ang,
        attached: false,
        delay: i * 0.10,   // 每个部件间隔 0.10s 依次飞出（大量重叠，前一个未就位下一个已出发）
        flyT: 0,
        label: pd.label,
      });
    }
    enemies.push({
      type: 'boss', bossId: B.id, name: B.name, lv: B.lv,
      x: CANVAS_W / 2, y: BOSS.hoverY,
      w: BOSS.w, h: BOSS.h,
      hp: BOSS.hp, maxHp: BOSS.hp,
      score: BOSS.score,
      phase: 'blackhole',    // blackhole → emerge → assemble → combat
      phaseT: 0,
      barT: 0,               // 血条登场动画计时（combat 阶段每帧累加）
      hpTrail: BOSS.hp,      // 血条残像：缓慢追赶 hp，形成受击白色余条
      scale: 0, combatReady: false,
      moveT: 0, t: 0,
      skill: null, skillCd: 1.4,
      lastSkill: -1, skillStreak: 0, dropBerserk: false, summonHarbL: false,
      parts,
      unfoldT: 0,   // 兼容图鉴预览
    });
    shake(6, 0.6);
  }

  // ---------- BOSS2：暴风之眼 · 第一阶段（白色龙卷风暴） ----------
  // 出场三阶段（总长 6.0s，与旧日之歌等长）：风聚（2.7s）→ 旋胀（2.3s）→ 成形（1.0s）→ 战斗
  function updateBossStorm(e, dt) {
    e.t += dt;
    // 自转速度随阶段递增：风聚慢启 → 旋胀加速 → 成形急旋，战斗回归常态 1.4 rad/s
    const spin = e.phase === 'gather' ? 0.5 : e.phase === 'swirl' ? 1.2 : e.phase === 'form' ? 2.6 : 1.4;
    e.rot -= spin * dt;   // 逆时针旋转（canvas y 轴向下，角度递减为逆时针视觉）
    // 小风流层（12 道射入气流 + 白色风痕）自转：恒速 0.5 rad/s，不随阶段转速提升——
    // 避免旋胀阶段小风流转速突然变大造成的不协调（本体旋臂仍按 spin 正常加速）
    if (e.phase === 'gather' || e.phase === 'swirl') e.windRot = (e.windRot || 0) - 0.5 * dt;
    // 血条登场计时 + 残血余像：仅战斗阶段推进（若从汇聚阶段就累加，进战斗时登场动画已被跳过）
    if (e.phase === 'combat') {
      e.barT = (e.barT || 0) + dt;
      if (e.hpTrail == null) e.hpTrail = e.hp;
      e.hpTrail += (e.hp - e.hpTrail) * Math.min(1, dt * 2.2);
    }

    // 成形震荡波：白环自中心急速扩散，波前扫过玩家时将其击退（无伤害，纯推离）
    if (e.shock) {
      const sk = e.shock;
      sk.t += dt;
      const pr = sk.t / sk.dur;
      const waveR = e.w * 0.5 * (0.4 + clamp(pr, 0, 1) * 2.4);
      if (!sk.hit && pr > 0.04) {
        const dx = player.x - e.x, dy = player.y - e.y;
        const dist = Math.hypot(dx, dy);
        if (dist < waveR) {
          sk.hit = true;
          if (dist > 1) knockbackPlayer(dx, dy, 620);
          else knockbackPlayer(0, 1, 620);
        }
      }
      if (pr >= 1) e.shock = null;
    }

    if (e.phase === 'gather') {
      // 阶段1 风聚（2.7s，对应旧日之歌黑洞）：气流被吸入中心，风核自无到有
      e.phaseT += dt;
      const p = clamp(e.phaseT / 2.7, 0, 1);
      e.scale = 0.30 * (1 - Math.pow(1 - p, 2));   // easeOut：风核迅速显形后放缓
      if (p >= 1) { e.phase = 'swirl'; e.phaseT = 0; }
      return;
    }
    if (e.phase === 'swirl') {
      // 阶段2 旋胀（2.3s，对应浮现）：旋臂逐圈撑开，外围迸出白色风絮
      e.phaseT += dt;
      const p = clamp(e.phaseT / 2.3, 0, 1);
      e.scale = 0.30 + (0.78 - 0.30) * (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);   // easeInOut
      if (Math.random() < dt * 14) spawnParticles(e.x + rand(-1, 1) * e.w * 0.45, e.y + rand(-1, 1) * e.h * 0.45, '#ffffff', 2, 70);
      if (p >= 1) { e.phase = 'form'; e.phaseT = 0; }
      return;
    }
    if (e.phase === 'form') {
      // 阶段3 成形（1.0s，对应组装）：最后一撑带轻微过冲，风暴眼点亮进入战斗
      e.phaseT += dt;
      const p = clamp(e.phaseT / 1.0, 0, 1);
      const c1 = 1.70158, c3 = c1 + 1;             // easeOutBack：轻微过冲再回弹
      const back = 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
      e.scale = 0.78 + (1 - 0.78) * back;
      if (p >= 1) {
        e.phase = 'combat';
        e.phaseT = 0;
        e.scale = 1;
        e.combatReady = true;
        spawnParticles(e.x, e.y, '#ffffff', 46, 340);   // 风暴眼点亮：白色爆发
        spawnParticles(e.x, e.y, STORM_WIND, 26, 260);
        flash = Math.max(flash, 0.18);   // 青白爆闪（轻微，不刷屏）
        shake(10, 0.5);
        e.shock = { t: 0, dur: 0.55, hit: false };   // 收束后的震荡波：向外急速扩散并击退玩家
      }
      return;
    }

    // 战斗阶段：风暴巨大，仅小幅漂移
    e.moveT += dt;
    e.x = CANVAS_W / 2 + Math.sin(e.moveT * 0.22) * 26;
    e.y = STORM.hoverY + Math.sin(e.moveT * 0.43) * 14;

    if (e.skill) runStormSkill(e, e.skill, dt);
    else {
      e.skillCd -= dt;
      if (e.skillCd <= 0) startStormSkill(e);
    }

    // 血量首次低于 70%：掉落一个暴走道具（一次性）
    if (!e.dropBerserk && e.hp <= e.maxHp * 0.70) {
      e.dropBerserk = true;
      spawnPowerup(e.x, e.y + STORM.h * 0.40, 'berserk', 15);
    }
  }

  // 技能5：随机生成 count 处风弹点位（默认 9）（机体范围内、朝下方 120° 区域），两轮齐射各生成一批
  // 发射间隔 0.144s（原 0.09 × 1.6）：每轮射击时长 +60%，弹幕更稀疏
  function stormSkill5Pts(count = 9) {
    const pts = [];
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const rr = rand(24, STORM.w * 0.40);
      pts.push({ dx: Math.cos(a) * rr * 0.95, dy: Math.sin(a) * rr * 0.72, delay: 0.2 + k * 0.144, fired: false });
    }
    return pts;
  }

  // 技能5 风弹强化判定：每发独立——5% 概率全面强化 +100%，次 15% 概率 +50%，其余不变
  // （强化项：弹体尺寸/长度、加速度、最大速度、伤害，均乘同一倍率）
  function stormSkill5Mul() {
    const roll = Math.random();
    return roll < 0.05 ? 2.0 : roll < 0.20 ? 1.5 : 1.0;
  }

  // 技能1 波次生成：从 side 侧（1 = 右侧向左 / -1 = 左侧向右）射入 n 道风波标记——
  // 带体横贯全屏（两端出界），下弯随机（弯在下方、可不对称），在下方 60% 区域分布
  function pushWaveMarks(side, n) {
    const bandH = CANVAS_H * 0.60;
    const L = CANVAS_W + 130;   // 带长：超出屏宽，两端出界
    const x0 = side > 0 ? CANVAS_W + 40 : -40 - L;   // 起点：入射侧外
    const dirX = side > 0 ? -1 : 1;
    for (let k = 0; k < n; k++) {
      zoneMarks.push({
        kind: 'wave',
        x0, dirX, L,
        y0: CANVAS_H * 0.40 + (k + rand(0.1, 0.7)) * (bandH / n),   // 下方 60% 区域分布
        sag: rand(STORM.waveSagMin, STORM.waveSagMax),   // 下弯幅度（弯在下面，可不对称）
        t: 0, dur: STORM.warnTime * 0.85,   // 标记约 1.1s
      });
    }
  }

  function startStormSkill(e) {
    // 全局机制：本局内从未释放过的技能，在其他技能被释放时权重 ×1.5
    if (!e.skillWeights) e.skillWeights = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
    if (!e.skillUseCount) e.skillUseCount = {};
    let id;
    if (e.lastSkill === -1) {
      // 暴风之眼第一次释放技能必定是技能6（三旋臂风条）
      id = 5;
    } else {
      // 技能2（大型龙卷）不可连续释放：上一技能为龙卷时将其移出候选
      let pool = [0, 1, 2, 3, 4, 5, 6];
      if (e.lastSkill === 1) pool = pool.filter(x => x !== 1);
      // 全局规则：同一技能最多连续释放两次，禁止三连
      if (e.skillStreak >= 2) pool = pool.filter(x => x !== e.lastSkill);
      // 加权随机（全局机制：未释放过的技能权重更高）
      id = weightedPick(pool, e.skillWeights);
    }
    // 全局规则：连续随机到同一技能 → 技能间冷却 -80%
    const repeat = id === e.lastSkill;
    e.skillStreak = repeat ? e.skillStreak + 1 : 1;
    e.skillCd = repeat ? STORM.skillCd * 0.2 : STORM.skillCd;
    e.lastSkill = id;
    const spMul = repeat ? 1.4 : 1.0;   // 连中同技能：弹速/风流速度 ×1.4
    // 全局机制结算：记录本次使用，其他从未释放过的技能权重 ×1.5
    e.skillUseCount[id] = (e.skillUseCount[id] || 0) + 1;
    for (const k in e.skillWeights) {
      if (+k !== id && !e.skillUseCount[+k]) e.skillWeights[k] *= 1.5;
    }

    switch (id) {
      case 0: {
        // 技能1：风波呼啸——从一侧射入 3~4 道横向弯曲风波（弯在下方，形似"（"逆时针旋转 90°，可不对称），
        // 白色标记约 1.1s 后整条瞬时显现（无行进过程），共两轮（第二轮换另一侧）；
        // 本技能结束后：距下一次技能释放的间隔减少至 25%（覆盖普适的连发规则）
        const n = 3 + Math.floor(Math.random() * 2);
        const side = Math.random() < 0.5 ? 1 : -1;   // 首轮入射侧（1 = 右侧向左，-1 = 左侧向右）
        pushWaveMarks(side, n);
        e.skill = { id: 0, t: 0, dur: 1.7, side, round2Pushed: false };
        e.skillCd = STORM.skillCd * 0.25;
        break;
      }
      case 1:
        // 技能2：蓄力 0.7s 后向正前方（正下方）推出一个大型龙卷
        // （可击毁、缓慢下移直至脱离战场、随机 360° 快速射风弹，碰撞 32）
        e.skill = { id: 1, t: 0, dur: 1.1, charged: false, spMul };
        break;
      case 2:
        // 技能3：连续随机选定 5 处垂直风柱（每 0.32s 布置一处标记，各 1.3s 后落下，18 伤害 + 击退）
        e.skill = { id: 2, t: 0, dur: 2.0, count: 0, next: 0.15 };
        break;
      case 3:
        // 技能4：漩涡状弹幕（4 条臂），前半程逆时针旋转、后半程顺时针旋转
        // 初始朝向完全随机（0~2π 任意角）：首轮子弹可能是「+」、「×」或任意中间朝向
        e.skill = { id: 3, t: 0, dur: 4.6, fire: 0, armAng: Math.random() * Math.PI * 2, spMul };
        break;
      case 4: {
        // 技能5：两轮乱射风条 + 中心一枚瞄准玩家；每轮射击时长 +60%（发射更稀疏），
        // 第二轮开火时刻不变（旧版第一轮射完 1.19s + 0.9s 间隔 ≈ 2.09s）→ 两轮间隔缩短至约 0.3s
        e.skill = { id: 4, t: 0, dur: 4.2, pts: stormSkill5Pts(12), round: 1, round2At: 0.2 + 11 * 0.09 + 0.9, centerFired: false, spMul };
        break;
      }
      case 5:
        // 技能6：三旋臂漩涡弹幕——随机顺时针/逆时针（全程不变），风条连射形成 3 条臂，转速随时间越来越快，持续 5s
        e.skill = { id: 5, t: 0, dur: 5, fire: 0, armAng: Math.random() * Math.PI * 2, dir: Math.random() < 0.5 ? 1 : -1, spin: 0.65, spMul };
        break;
      case 6:
        // 技能7：涡流风旋——预警持续到飞抵，自转喷出浓白密集风条（玩家绕旋周旋），停射后快速消散
        e.skill = { id: 6, t: 0, dur: 7.3, spMul };
        break;
    }
  }

  function runStormSkill(e, s, dt) {
    s.t += dt;
    const sm = s.spMul || 1;

    if (s.id === 0) {
      // 技能1：第二轮——0.85s 后从另一侧再射入一波（标记独立计时，两轮错峰降临）
      if (!s.round2Pushed && s.t >= 0.85) {
        s.round2Pushed = true;
        pushWaveMarks(-s.side, 3 + Math.floor(Math.random() * 2));
      }
    } else if (s.id === 1) {
      // 技能2：蓄力完成后向正前方推出大型龙卷
      if (!s.charged && s.t >= 0.7) {
        s.charged = true;
        makeEnemy('tornado', e.x, e.y + e.h * 0.30);
        spawnParticles(e.x, e.y + e.h * 0.3, '#ffffff', 26, 260);
        shake(6, 0.3);
      }
    } else if (s.id === 2) {
      // 技能3：连续布置 5 处风柱标记（各 1.3s 后降下打击）
      s.next -= dt;
      while (s.next <= 0 && s.count < 5) {
        s.next += 0.32;
        s.count++;
        zoneMarks.push({
          kind: 'pillar',
          x: clamp(rand(24, CANVAS_W - 24), STORM.pillarW / 2, CANVAS_W - STORM.pillarW / 2),
          t: 0, dur: STORM.warnTime,
        });
      }
    } else if (s.id === 3) {
      // 技能4：4 条臂漩涡弹幕，前半程逆时针、后半程顺时针
      const dir = s.t < s.dur / 2 ? 1 : -1;
      s.armAng += dir * 1.6 * dt;
      s.fire -= dt;
      if (s.fire <= 0) {
        s.fire = 0.11;
        for (let k = 0; k < 4; k++) {
          // 风条：椭圆形长条弹，初速低沿飞行方向加速；最大弹速 583（较上版 +50%）、加速度 143.75/s
          // 宽度 r=5.6，刚射出时长度 12、随时间以 150px/s 长到全长 70；伤害 18
          const ang = s.armAng + k * Math.PI / 2;
          pushBossBullet(e.x, e.y, ang, 56 * sm,
            { r: 5.6, dmg: 18, color: STORM_WIND, len: 12, lenTarget: 70, growRate: 150, oval: true,
              accel: 143.75 * sm, maxSpeed: 583 * sm });
        }
      }
    } else if (s.id === 4) {
      // 技能5：两轮乱射（各 12/9 处风条 + 中心瞄准弹）；每发风弹独立判定强化（15% +50% / 5% +100%）
      let allFired = true;
      for (const p of s.pts) {
        p.delay -= dt;
        if (p.delay <= 0 && !p.fired) {
          p.fired = true;
          const ang = Math.PI / 2 + rand(-Math.PI / 6, Math.PI / 6);
          // 风条：初速低沿飞行方向加速至 874.5，长度 12 以 150px/s 长到 70，波动渲染；m 为强化倍率
          const m = stormSkill5Mul();
          pushBossBullet(e.x + p.dx, e.y + p.dy, ang, 56 * sm,
            { r: 5.6 * m, dmg: STORM.tornadoDmg * m, color: STORM_WIND, len: 12 * m, lenTarget: 70 * m, growRate: 150,
              oval: true, accel: 215.625 * sm * m, maxSpeed: 874.5 * sm * m });
          spawnParticles(e.x + p.dx, e.y + p.dy, '#ffffff', 4, 110);
        }
        if (!p.fired) allFired = false;
      }
      if (!s.centerFired && s.t >= 0.55) {
        s.centerFired = true;
        const m = stormSkill5Mul();
        pushBossBullet(e.x, e.y, Math.atan2(player.y - e.y, player.x - e.x), 56 * sm,
          { r: 5.6 * m, dmg: STORM.tornadoDmg * m, color: STORM_WIND, len: 12 * m, lenTarget: 70 * m, growRate: 150,
            oval: true, accel: 215.625 * sm * m, maxSpeed: 874.5 * sm * m });   // 中心弹同样参与强化判定
        spawnParticles(e.x, e.y, '#ffffff', 8, 140);
      }
      // 第二轮：开火时刻固定（round2At ≈ 2.09s，与旧版一致）——第一轮拉长后两轮间隔自动变短；
      // 到点后重新随机点位进入第二轮（中心瞄准弹同样再来一枚）
      if (allFired && s.round === 1 && s.t >= s.round2At) {
        s.round = 2;
        s.pts = stormSkill5Pts();
        s.centerFired = false;
      }
    } else if (s.id === 5) {
      // 技能6：3 条臂漩涡弹幕，方向固定（顺/逆时针随机），转速随时间越来越快
      // 角速度线性递增：初速 0.65 不变、斜率 0.617（原 0.7）→ 5s 末最大转速 4.15→3.735 rad/s（-10%），持续时长不变
      s.spin += 0.617 * dt;
      s.armAng += s.dir * s.spin * dt;
      s.fire -= dt;
      if (s.fire <= 0) {
        s.fire = 0.10;
        for (let k = 0; k < 3; k++) {
          // 风条（与技能4一致）：初速低、加速至 583、长度生长、波动渲染
          pushBossBullet(e.x, e.y, s.armAng + k * Math.PI * 2 / 3, 56 * sm,
            { r: 5.6, dmg: STORM.tornadoDmg, color: STORM_WIND, len: 12, lenTarget: 70, growRate: 150,
              oval: true, accel: 143.75 * sm, maxSpeed: 583 * sm });
        }
      }
    } else if (s.id === 6) {
      // 技能7：涡流风旋三阶段：预警（0.5s，原 1.1s 的 45%）→ 自机体飞抵（1.4s，easeInOut 速度曲线更流畅）
      // → 悬停自转喷风条（5s，白色缓慢变淡至 0.85，停射后 0.35s 快速消散）
      if (!stormVortex) {
        stormVortex = { x: e.x, y: e.y, tx: CANVAS_W / 2, ty: CANVAS_H * 0.80,
          r: CANVAS_W * 0.04, phase: 'warn', t: 0, ang: Math.random() * Math.PI * 2,
          dir: Math.random() < 0.5 ? 1 : -1, emit: 0 };
      }
      const v = stormVortex;
      v.t += dt;
      if (v.phase === 'warn') {
        if (v.t >= 0.5) { v.phase = 'move'; v.t = 0; }
      } else if (v.phase === 'move') {
        const mp = clamp(v.t / 1.4, 0, 1);
        // easeInOutCubic：起步缓、中途快、到位缓停，飞行全程无速度突跳
        const ease = mp < 0.5 ? 4 * mp * mp * mp : 1 - Math.pow(-2 * mp + 2, 3) / 2;
        v.x = e.x + (v.tx - e.x) * ease;
        v.y = e.y + (v.ty - e.y) * ease;
        v.ang += v.dir * 2.2 * dt;   // 飞行途中旋臂同步自转（衔接悬停段的自转）
        if (mp >= 1) {
          v.phase = 'spin'; v.t = 0;
          // 到位过渡：风屑迸散 + 柔和白雾，衔接「飞抵」与「悬停喷射」
          spawnParticles(v.x, v.y, '#ffffff', 14, 150);
          spawnParticles(v.x, v.y, '#eaf6ff', 10, 110);
        }
      } else if (v.phase === 'spin') {
        v.x = v.tx; v.y = v.ty;
        v.ang += v.dir * (1.1 + (v.t / 5) * 1.525) * dt;   // 自转由慢渐快（1.1 → 2.625 rad/s，最大转速较原值 -25%）
        v.emit -= dt;
        if (v.emit <= 0) {
          v.emit = 0.045;   // 密集喷射：双臂各约 22 发/秒
          // 子弹呈 2 条旋臂：每次同时射出相隔 180° 的对称两发，随自转形成两条旋转风臂；
          // 加速度/最大速度 = 四旋臂（技能4）的 70%；长度 7.2→42（初始/最大长度均为标准风条的 60%）
          for (let k = 0; k < 2; k++) {
            const ea = v.ang + k * Math.PI;
            pushBossBullet(v.x + Math.cos(ea) * v.r, v.y + Math.sin(ea) * v.r, ea, 56 * sm,
              { r: 5.6, dmg: STORM.tornadoDmg, color: STORM_WIND, len: 7.2, lenTarget: 42, growRate: 150,
                oval: true, accel: 100.625 * sm, maxSpeed: 408.1 * sm });
          }
        }
        if (v.t >= 5) {
          // 喷射停止：进入快速消散（0.35s 缩小渐隐），结束时迸散风屑并移除
          v.phase = 'fade'; v.t = 0;
        }
      } else if (v.phase === 'fade') {
        if (v.t >= 0.35) {
          spawnParticles(v.x, v.y, '#eaf6ff', 20, 240);
          spawnParticles(v.x, v.y, '#ffffff', 12, 160);
          stormVortex = null;
        }
      }
      // 风旋机体碰撞（预警阶段尚无实体，不判定）
      if (stormVortex && v.phase !== 'warn' && player.alive && player.invuln <= 0 &&
          Math.hypot(v.x - player.x, v.y - (player.y + PLAYER.hitOffsetY)) < v.r * 0.9 + PLAYER.hitRadius) {
        damagePlayer(STORM.vortexDmg);
      }
    }

    if (s.t >= s.dur) e.skill = null;
  }

  // 区域打击可视度（与绘制层透明度曲线一致：rise 段亮起、随后线性衰减）。
  // 命中判定按此门控——渐隐至 35% 以下即不再构成威胁，杜绝"风带看不见了却被命中"的莫名受击
  function strikeVis(life, rise) {
    return life < rise ? life / rise : 1 - (life - rise) / (1 - rise);
  }

  // 风暴风流/风柱命中的击退：短暂推开玩家（速度指数衰减）
  function knockbackPlayer(dirX, dirY, power) {
    const len = Math.hypot(dirX, dirY) || 1;
    player.kbVx = (dirX / len) * power;
    player.kbVy = (dirY / len) * power;
    player.kbT = 0.32;
  }

  // ---------- 暴风之眼：区域标记与打击（风波 / 风柱） ----------
  // 白色区域标记倒计时（风波约 1.1s / 风柱 1.3s）→ 风波瞬时降临 / 风柱降下
  function updateZoneMarks(dt) {
    // 标记倒计时
    for (let i = zoneMarks.length - 1; i >= 0; i--) {
      const z = zoneMarks[i];
      z.t += dt;
      if (z.t < z.dur) continue;
      zoneMarks.splice(i, 1);
      if (z.kind === 'wave') {
        windFlows.push({ wave: true, x0: z.x0, dirX: z.dirX, L: z.L, y0: z.y0, sag: z.sag, t: 0, dur: STORM.waveDur, hit: false });   // 风波整条瞬时显现（无行进过程）
        for (let p = 0; p < 3; p++) {
          const pp = stormWavePoint(z, z.x0 + z.dirX * z.L * (0.3 + p * 0.2));
          spawnParticles(pp.x, pp.y, '#dff3ff', 8, 190);
        }
        shake(4, 0.25);
      } else {
        pillarStrikes.push({ x: z.x, t: 0, dur: 0.45, hit: false });   // 风柱打击降下
        shake(4, 0.25);
      }
    }
    // 风波：横向弯曲风带整条瞬时显现（快速亮起后渐隐），按玩家横坐标采样中心线做纵向命中判定（每道一次）
    for (let i = windFlows.length - 1; i >= 0; i--) {
      const f = windFlows[i];
      f.t += dt;
      if (!f.hit && player.alive && strikeVis(f.t / f.dur, 0.18) >= 0.35) {
        const px = clamp(player.x, Math.min(f.x0, f.x0 + f.dirX * f.L), Math.max(f.x0, f.x0 + f.dirX * f.L));
        const c = stormWavePoint(f, px);
        if (Math.abs((player.y + PLAYER.hitOffsetY) - c.y) < STORM.waveHalfW + PLAYER.hitRadius) {
          f.hit = true;   // 无敌期间处于带内同样消耗本次判定：风波掠过，不结算也不补判——
          // （否则无敌结束时会被"迟到"的风波命中：出现时无敌跳过判定、静止玩家在无敌结束后被判中）
          if (player.invuln <= 0) {
            damagePlayer(STORM.windDmg);
            // 击退：竖直推离风波带（玩家在带下方则下推、上方则上推）+ 向入射侧回推的固定分量
            // （不能用 player - 采样点：c.x 恒等于 player.x，会导致 dx=0、方向退化）
            const vdir = ((player.y + PLAYER.hitOffsetY) - c.y) >= 0 ? 1 : -1;
            knockbackPlayer(-f.dirX * 0.30, vdir * 0.95, 520);
          }
        }
      }
      if (f.t >= f.dur) windFlows.splice(i, 1);
    }
    // 风柱：短暂存在的垂直打击光柱（每根命中一次）
    for (let i = pillarStrikes.length - 1; i >= 0; i--) {
      const p = pillarStrikes[i];
      p.t += dt;
      if (!p.hit && player.alive && strikeVis(p.t / p.dur, 0.25) >= 0.35) {
        if (Math.abs(player.x - p.x) < STORM.pillarW / 2 + PLAYER.hitRadius) {
          p.hit = true;   // 无敌期间处于柱内同样消耗本次判定：光柱掠过，不结算也不补判
          if (player.invuln <= 0) {
            damagePlayer(STORM.pillarDmg);
            knockbackPlayer(player.x - p.x, 0, 420);
          }
        }
      }
      if (p.t >= p.dur) pillarStrikes.splice(i, 1);
    }
  }

  // 风波中心线：三次贝塞尔——横向风带，弯在下方（形似"（"逆时针旋转 90° = "⌣"下拱，可不对称）：
  // 入射端平直、中后段下弯、远端略回勾；控制点 x 沿 dirX 单调，粗采样按目标 x 反解即可精确对位
  function stormWavePoint(w, xTarget) {
    const p0x = w.x0, p0y = w.y0;
    const p1x = w.x0 + w.dirX * w.L * 0.35, p1y = w.y0 + w.sag * 0.45;
    const p2x = w.x0 + w.dirX * w.L * 0.72, p2y = w.y0 + w.sag * 1.05;
    const p3x = w.x0 + w.dirX * w.L, p3y = w.y0 + w.sag * 0.5;
    let best = 0, bestDx = 1e9;
    for (let k = 0; k <= 32; k++) {
      const t = k / 32, u = 1 - t;
      const x = u * u * u * p0x + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * p3x;
      const d = Math.abs(x - xTarget);
      if (d < bestDx) { bestDx = d; best = t; }
    }
    const t = best, u = 1 - t;
    return {
      x: u * u * u * p0x + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * p3x,
      y: u * u * u * p0y + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * p3y,
    };
  }

  // 风波带多边形：沿中心线按竖直半厚展开（波带近水平，竖直偏移 ≈ 法向厚度）
  function stormWaveBand(w, halfW) {
    const N = 20;
    ctx.beginPath();
    for (let k = 0; k <= N; k++) {
      const p = stormWavePoint(w, w.x0 + w.dirX * w.L * (k / N));
      k === 0 ? ctx.moveTo(p.x, p.y - halfW) : ctx.lineTo(p.x, p.y - halfW);
    }
    for (let k = N; k >= 0; k--) {
      const p = stormWavePoint(w, w.x0 + w.dirX * w.L * (k / N));
      ctx.lineTo(p.x, p.y + halfW);
    }
    ctx.closePath();
  }

  function pushBossBullet(x, y, ang, speed, opts = {}) {
    eBullets.push({
      x, y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      ax: opts.ax || 0,          // 横向加速度（技能5 的 1/4 双曲线弹道）
      accel: opts.accel || 0,    // 沿飞行方向加速度（初速低逐渐加速的风条等）
      maxSpeed: opts.maxSpeed || 0,
      oval: opts.oval || false,  // 长条弹呈椭圆体（风条）
      lenTarget: opts.lenTarget || 0,   // 风条生长目标长度（>0 时从 len 起步随时间生长）
      growRate: opts.growRate || 0,     // 风条生长速率（px/s）
      r: opts.r != null ? opts.r : 3.5,
      len: opts.len || 0,        // >0 为长条弹（胶囊体判定）
      dmg: opts.dmg != null ? opts.dmg : BOSS.bulletDmg,
      color: opts.color || BOSS_BULLET.long,
      trail: opts.trail || null,   // 拖尾色（部件球弹幕等特殊弹）
    });
  }

  function updateBoss(e, dt) {
    e.t += dt;
    if (e.bossId === 'storm') { updateBossStorm(e, dt); return; }   // 暴风之眼走独立状态机

    // 新出场流程：黑洞形成 → 机体浮现 → 部件组装 → 战斗
    const BLACKHOLE_DUR = 2.7;
    const EMERGE_DUR = 2.3;
    const ASSEMBLE_DUR = 1.0;

    if (e.phase === 'blackhole') {
      e.phaseT += dt;
      // 黑洞从小变大，机体不可见
      const p = clamp(e.phaseT / BLACKHOLE_DUR, 0, 1);
      e.scale = 0;
      if (p >= 1) { e.phase = 'emerge'; e.phaseT = 0; }
      return;
    }
    if (e.phase === 'emerge') {
      e.phaseT += dt;
      // 机体从黑洞中心浮现，缩小状态逐渐放大
      const p = clamp(e.phaseT / EMERGE_DUR, 0, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      e.scale = 0.25 + ease * 0.6;   // 0.25 → 0.85
      if (p >= 1) { e.phase = 'assemble'; e.phaseT = 0; shake(5, 0.3); }
      return;
    }
    if (e.phase === 'assemble') {
      e.phaseT += dt;
      // 部件依次从黑洞边缘飞向机体
      let allAttached = true;
      for (const pt of e.parts) {
        if (pt.attached) continue;
        if (e.phaseT < pt.delay) { allAttached = false; continue; }
        pt.flyT += dt;
        const fp = clamp(pt.flyT / 0.40, 0, 1);   // 每个部件飞行 0.40s
        const fe = 1 - Math.pow(1 - fp, 4);        // easeOutQuart
        // 起始位置：黑洞边缘（半径 200）沿角度散开
        const startR = 200;
        const sx = Math.cos(pt.ang) * startR;
        const sy = Math.sin(pt.ang) * startR;
        pt.x = sx + (pt.tx - sx) * fe;
        pt.y = sy + (pt.ty - sy) * fe;
        if (fp >= 1) {
          pt.attached = true;
          pt.x = pt.tx; pt.y = pt.ty;
          // 镶接冲击波：粒子 + 微震屏
          spawnParticles(e.x + pt.tx, e.y + pt.ty, '#c8b0ff', 10, 160);
          shake(3, 0.15);
        } else {
          allAttached = false;
        }
      }
      // 机体继续微微放大
      const ap = clamp(e.phaseT / ASSEMBLE_DUR, 0, 1);
      e.scale = 0.85 + ap * 0.15;   // 0.85 → 1.0
      if (allAttached || e.phaseT >= ASSEMBLE_DUR) {
        // 所有部件就位，进入战斗
        e.phase = 'combat';
        e.phaseT = 0;
        e.scale = 1;
        e.combatReady = true;
        e.skillCd = 1.0;
        // 六个部件球化作弹幕：从镶接位置沿“部件—机体中轴连线”方向向外射出（暗紫轨迹、20 伤害）
        for (const pt of e.parts) {
          pushBossBullet(e.x + pt.tx, e.y + pt.ty, Math.atan2(pt.ty, pt.tx), 430,
            { r: 7, dmg: 20, color: '#c084fc', trail: '#7c3aed' });
        }
        spawnParticles(e.x, e.y, '#c8b0ff', 14, 240);   // 少量紫色粒子替代原炸开效果
        shake(10, 0.5);
      }
      return;
    }

    // 血条登场计时 + 残血余像（hpTrail 缓慢追赶 hp，受击时白色余条缓慢消退）
    e.barT = (e.barT || 0) + dt;
    if (e.hpTrail == null) e.hpTrail = e.hp;
    e.hpTrail += (e.hp - e.hpTrail) * Math.min(1, dt * 2.2);

    // 技能1期间停止移动（moveT 同步冻结，避免技能结束后因 moveT 继续累加而瞬移），其余时间小幅左右巡航
    if (!e.skill || e.skill.id !== 0) {
      e.moveT += dt;
      e.x = CANVAS_W / 2 + Math.sin(e.moveT * BOSS.moveSpeed) * BOSS.moveAmp;
    }

    if (e.skill) runBossSkill(e, e.skill, dt);
    else {
      e.skillCd -= dt;
      if (e.skillCd <= 0) startBossSkill(e);
    }

    // 血量首次低于 70%：在屏幕最左侧召唤一个炮火先兆者（staticX 固定靠边、不巡航，避免被 BOSS 机体挡住）
    if (!e.summonHarbL && e.hp <= e.maxHp * 0.70) {
      e.summonHarbL = true;
      spawnHarbinger(40, { staticX: true });
    }

    // 血量 70%：掉落一个暴走道具（一次性）
    if (!e.dropBerserk && e.hp <= e.maxHp * 0.70) {
      e.dropBerserk = true;
      spawnPowerup(e.x, e.y + 50, 'berserk', 15);
    }
  }

  function startBossSkill(e) {
    // 全局机制：本局内从未释放过的技能，在其他技能被释放时权重 ×1.5
    if (!e.skillWeights) e.skillWeights = { 0: 1, 1: 1, 2: 1, 3: 1 };
    if (!e.skillUseCount) e.skillUseCount = {};
    let id;
    if (e.lastSkill === -1) {
      // 旧日之歌第一次释放技能必定是技能1
      id = 0;
    } else {
      // 加权随机释放；同一技能最多连续释放两次，禁止三连
      let pool = [0, 1, 2, 3];
      if (e.skillStreak >= 2) pool = pool.filter(x => x !== e.lastSkill);
      id = weightedPick(pool, e.skillWeights);
    }
    // 全局规则：连续随机到同一技能 → 技能间冷却 -80%，且本次技能弹速 +60%
    const repeat = id === e.lastSkill;
    e.skillStreak = repeat ? e.skillStreak + 1 : 1;   // 连续释放同技能的次数（上限 2）
    e.skillCd = repeat ? BOSS.skillCd * 0.2 : BOSS.skillCd;
    // 血量 <50%：技能释放间隔额外降低 50%
    if (e.hp / e.maxHp < 0.5) e.skillCd *= 0.5;
    e.lastSkill = id;
    const spMul = repeat ? 1.6 : 1.0;   // 连中同技能：本次弹速 ×1.6
    // 全局机制结算：记录本次使用，其他从未释放过的技能权重 ×1.5
    e.skillUseCount[id] = (e.skillUseCount[id] || 0) + 1;
    for (const k in e.skillWeights) {
      if (+k !== id && !e.skillUseCount[+k]) e.skillWeights[k] *= 1.5;
    }

    switch (id) {
      case 0:   // 双管极快速连发长条弹（持续约 1s：弹柱长度 ≈ 1/3 屏高）
        e.skill = { id: 0, t: 0, dur: 1.0, fire: 0, alt: 0, curveT: 0, spMul };
        break;
      case 1:   // 散射几轮很大的子弹
        e.skill = { id: 1, t: 0, dur: 2.0, roundT: 0, rounds: 0, spMul };
        break;
      case 2: { // 机体四个随机部位：标记玩家当前位置，三连发 × 三轮（不追踪）
        const parts = [];
        for (let k = 0; k < 4; k++) {
          parts.push({ dx: rand(-0.42, 0.42) * e.w, dy: rand(-0.30, 0.30) * e.h, timer: 0.2 + k * 0.25, shots: 0 });
        }
        e.skill = { id: 2, t: 0, dur: 2.8, parts, mark: { x: player.x, y: player.y }, spMul };
        break;
      }
      case 3:   // 双管乱射长条弹（频率低于技能1，方向随机不规律）
        e.skill = { id: 3, t: 0, dur: 3.5, next: 0.1, spMul };
        break;
    }
  }

  function runBossSkill(e, s, dt) {
    s.t += dt;
    const lx = e.x - e.w * 0.22, rx = e.x + e.w * 0.22;
    const by = e.y + e.h * 0.5;
    const sm = s.spMul || 1;   // 连中同技能时的弹速倍率（×1.6）

    if (s.id === 0) {
      // 技能1：停止移动，双管极快速连发长条弹（直向为主 + 极轻微散射）
      // 同时附带双曲线弹流：双管交替射出
      s.fire -= dt;
      if (s.fire <= 0) {
        s.fire = 0.07;
        s.alt ^= 1;
        for (const bx of [lx, rx]) {
          const ang = Math.PI / 2 + rand(-0.03, 0.03);
          pushBossBullet(bx, by, ang, 250 * sm, { len: BOSS.longLen, dmg: BOSS.bulletDmg });
        }
      }
      // 双曲线弹流：独立计时器，每帧递减，间隔 0.14s（长条弹的 2 倍）
      s.curveT -= dt;
      if (s.curveT <= 0) {
        s.curveT = 0.14;
        const cross = (e.hp / e.maxHp) < 0.5;
        const arcAng = 0.35;   // 双曲线弹初始斜射角：出膛即向旁边斜（与弯曲方向一致，越早散开）
        if (cross) {
          // 50%血以下：两炮管同时双向发射（每管向内/向外各一条），左右完全对称
          for (const bx of [lx, rx]) {
            pushBossBullet(bx, by, Math.PI / 2 + arcAng, 230 * sm, { r: 4, dmg: BOSS.arcDmg, ax: -115, color: BOSS_BULLET.arc });
            pushBossBullet(bx, by, Math.PI / 2 - arcAng, 230 * sm, { r: 4, dmg: BOSS.arcDmg, ax: 115, color: BOSS_BULLET.arc });
          }
        } else {
          // 血量≥50%：左右管各发一条，向外对称弯曲（左管向左、右管向右）
          pushBossBullet(lx, by, Math.PI / 2 + arcAng, 230 * sm, { r: 4, dmg: BOSS.arcDmg, ax: -115, color: BOSS_BULLET.arc });
          pushBossBullet(rx, by, Math.PI / 2 - arcAng, 230 * sm, { r: 4, dmg: BOSS.arcDmg, ax: 115, color: BOSS_BULLET.arc });
        }
      }
    } else if (s.id === 1) {
      // 技能2：朝玩家方向散射 3 轮很大的子弹（密度低、间隔大、每轮随机缺失 20%~35%）
      s.roundT -= dt;
      if (s.roundT <= 0 && s.rounds < 3) {
        s.roundT = 0.8;
        s.rounds++;
        const missRate = rand(0.20, 0.35);   // 本轮缺失比例
        const base = Math.atan2(player.y - e.y, player.x - e.x);
        const n = 6;
        for (let k = 0; k < n; k++) {
          if (Math.random() < missRate) continue;   // 子弹随机缺失
          pushBossBullet(e.x, by, base + (k - (n - 1) / 2) * 0.16, 185 * sm, { r: 13, dmg: BOSS.bigDmg, color: BOSS_BULLET.big });
        }
        shake(4, 0.2);
      }
    } else if (s.id === 2) {
      // 技能3：四个部位朝“标记点”各射 3 轮 × 3 发长条弹（标记释放时锁定，不追踪）
      for (const p of s.parts) {
        p.timer -= dt;
        if (p.timer <= 0 && p.shots < 3) {
          p.timer = 0.7;
          p.shots++;
          const px = e.x + p.dx, py = e.y + p.dy;
          const base = Math.atan2(s.mark.y - py, s.mark.x - px);
          for (let k = -1; k <= 1; k++) {
            pushBossBullet(px, py, base + k * 0.12, 270 * sm, { len: BOSS.longLen, dmg: BOSS.bulletDmg });
          }
        }
      }
    } else if (s.id === 3) {
      // 技能4：双管乱射长条弹，间隔不规律；血量>50% 时 270° 大范围散射（避开正上方 90°，仍会往斜上方射，相当于削弱），≤50% 时收敛到下半球（满火力）；10% 概率双管齐指玩家
      s.next -= dt;
      if (s.next <= 0) {
        s.next = rand(0.133, 0.267);
        const aim = Math.random() < 0.10;
        const high = (e.hp / e.maxHp) > 0.5;   // 血量>50%：270° 散射（削弱）；≤50%：一律朝下
        for (const bx of [lx, rx]) {
          const ang = aim
            ? Math.atan2(player.y - by, player.x - bx)
            : (high ? rand(-Math.PI / 4, Math.PI * 1.25) : rand(0.2, Math.PI - 0.2));   // 270°：右上 45° → 下 → 左上 45°，避开正上方 90° 死角
          pushBossBullet(bx, by, ang, rand(160, 300) * sm, { len: BOSS.longLen, dmg: BOSS.bulletDmg });
        }
      }
    }

    if (s.t >= s.dur) e.skill = null;
  }
