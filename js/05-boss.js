// 05-boss：旧日之歌 + 暴风之眼（状态机 / 技能 / 区域标记 / 涡流风旋 / 击退）

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：04-spawn(1 名) 06-enemy(2 名) 11-draw-boss(2 名) 14-main(2 名)
  // 本文件写共享状态（state/bossFlow/levelFlow 属性赋值；新增属性先在 02-core 归域声明）：
  //   state.{flash, stormVortex}
  //
  import { BOSS, BOSS_LOOT_BOTH, BOSS_LOOT_KIT, BOSS_LOOT_SHIELD, BOSSES, BOSS_BULLET, CANVAS_H, CANVAS_W, JIAOXIANG, PLAYER_CFG, SONG_SHIP, STORM, STORM2, STORM_SHIP, STORM_WIND, diffMods, isShipian } from './01-config.js';
  import { clamp, ctx, eBullets, enemies, pillarStrikes, player, rand, shake, spawnParticles, state, weightedPick, windFlows, zoneMarks } from './02-core.js';
  import { makeEnemy, spawnHarbinger } from './04-spawn.js';
  import { missileHitPlayer } from './06-enemy.js';
  import { damagePlayer } from './07-player.js';
  import { spawnPowerup } from './08-entities.js';


  // ---------- BOSS：旧日之歌 ----------
  function spawnBoss(id) {
    // 进入 BOSS 战：火力不足 Lv3 时补到 Lv3；并重置受击掉火力的累计计数（正常 / 挑战模式通用）
    if (player.weapon < 3) player.weapon = 3;
    player.hitCount = 0;
    const B = BOSSES[id] || BOSSES.song;
    const hpMul = diffMods().bossHpMul || 1;   // 诗篇：全体 BOSS 血量 ×1.6（真我 ×1）
    // 暴风之眼：第一阶段为白色龙卷风暴（风暴之风汇聚成旋涡入场）
    if (B.id === 'storm') {
      enemies.push({
        type: 'boss', bossId: 'storm', name: B.name, lv: B.lv,
        x: CANVAS_W / 2, y: STORM.hoverY,
        w: STORM.w, h: STORM.h,
        hp: STORM.hp * hpMul, maxHp: STORM.hp * hpMul,
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
    // 风暴编织者：暴风之眼消散后电闪雷鸣中现身（入场：消散 0.8s → 雷鸣 1.2s → 现身 0.8s → 战斗）
    if (B.id === 'storm2') {
      enemies.push({
        type: 'boss', bossId: 'storm2', name: B.name, lv: B.lv,
        x: CANVAS_W / 2, y: STORM2.hoverY,
        w: STORM2.w, h: STORM2.h,
        hp: STORM2.hp * hpMul, maxHp: STORM2.hp * hpMul,
        score: STORM2.score,
        phase: 'entrance', phaseT: 0,
        bolts: [],             // 入场雷鸣：全屏闪电演出（11-draw-boss 绘制）
        barT: 0,               // 血条登场动画计时（仅 combat 阶段推进）
        hpTrail: STORM2.hp * hpMul,    // 血条残像：缓慢追赶 hp，形成受击白色余条
        scale: 0, combatReady: false,
        moveT: 0, t: 0, moveRate: 1,
        skill: null, skillCd: 1.0,   // 进战斗后 1.0s 释放首个技能（随机；间隔 = 暴风之眼的 75%，见 STORM2.skillCd）
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
      hp: BOSS.hp * hpMul, maxHp: BOSS.hp * hpMul,
      score: BOSS.score,
      phase: 'blackhole',    // blackhole → emerge → assemble → combat
      phaseT: 0,
      barT: 0,               // 血条登场动画计时（combat 阶段每帧累加）
      hpTrail: BOSS.hp * hpMul,      // 血条残像：缓慢追赶 hp，形成受击白色余条
      scale: 0, combatReady: false,
      moveT: 0, t: 0,
      skill: null, skillCd: 1.4 * (isShipian() ? SONG_SHIP.skillCdMul : 1),   // 诗篇：技能间隔 ×0.4
      lastSkill: -1, skillStreak: 0, dropBerserk: false, summonHarbL: false,
      parts,
      unfoldT: 0,   // 兼容图鉴预览
    });
    shake(6, 0.6);
  }

  // ---------- BOSS2：暴风之眼（第一阶段：白色龙卷风暴） ----------
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
        state.flash = Math.max(state.flash, 0.18);   // 青白爆闪（轻微，不刷屏）
        shake(10, 0.5);
        e.shock = { t: 0, dur: 0.55, hit: false };   // 收束后的震荡波：向外急速扩散并击退玩家
      }
      return;
    }

    // 战斗阶段：风暴巨大，仅小幅漂移
    e.moveT += dt;
    e.x = CANVAS_W / 2 + Math.sin(e.moveT * 0.22) * 25;
    e.y = STORM.hoverY + Math.sin(e.moveT * 0.43) * 15;

    // 诗篇：技能1（风波呼啸）脱离技能轮换，改为独立计时释放——每 10~16s 从随机一侧
    // 射入一轮 3~4 道风波（仅单轮）。独立于技能槽运行：不占用技能、不影响技能释放间隔
    if (isShipian()) {
      if (e.s1Next == null) e.s1Next = rand(STORM_SHIP.s1.min, STORM_SHIP.s1.max);
      e.s1T = (e.s1T || 0) + dt;
      if (e.s1T >= e.s1Next) {
        e.s1T = 0;
        e.s1Next = rand(STORM_SHIP.s1.min, STORM_SHIP.s1.max);
        pushWaveMarks(Math.random() < 0.5 ? 1 : -1, 3 + Math.floor(Math.random() * 2));
      }
    }

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

  // 技能3：随机位置布置一处垂直风柱标记（STORM.warnTime 后降下打击）
  function pushStormPillar() {
    zoneMarks.push({
      kind: 'pillar',
      x: clamp(rand(24, CANVAS_W - 24), STORM.pillarW / 2, CANVAS_W - STORM.pillarW / 2),
      t: 0, dur: STORM.warnTime,
    });
  }

  // 技能4（诗篇）：随机生成 1~3 个改变旋转方向的时刻——任意相邻两次间隔 ≥1s；
  // 若首次改变晚于 7s，则收紧到 7s（届时必定改变一次），并丢弃距 7s 不足 1s 的后续时刻
  function stormS4ChangeTimes() {
    const cfg = STORM_SHIP.s4;
    const count = cfg.changesMin + Math.floor(Math.random() * (cfg.changesMax - cfg.changesMin + 1));
    for (let tries = 0; tries < 50; tries++) {
      const ts = [];
      for (let i = 0; i < count; i++) ts.push(rand(cfg.changeGap + 0.2, cfg.dur - 0.4));
      ts.sort((a, b) => a - b);
      let ok = true;
      for (let i = 1; i < ts.length; i++) { if (ts[i] - ts[i - 1] < cfg.changeGap) { ok = false; break; } }
      if (!ok) continue;
      if (ts[0] > cfg.forceChangeAt) {
        ts[0] = cfg.forceChangeAt;
        return ts.filter((t, i) => i === 0 || t - ts[0] >= cfg.changeGap);
      }
      return ts;
    }
    return [rand(2, cfg.forceChangeAt)];   // 兜底：采样 50 次仍未满足间隔约束
  }

  // 技能1 波次生成：从 side 侧（1 = 右侧向左 / -1 = 左侧向右）射入 n 道风波标记——
  // 带体横贯全屏（两端出界），下弯随机（弯在下方、可不对称），在下方 60% 区域分布
  function pushWaveMarks(side, n) {
    const bandH = CANVAS_H * 0.60;
    const L = CANVAS_W + 130;   // 带长：超出屏宽，两端出界
    const x0 = side > 0 ? CANVAS_W + 40 : -40;   // 起点：入射侧外（左侧起点在屏左外 -40，向 +x 延伸 L 覆盖全屏；旧 -40-L 会使整条带落在屏左外而不可见）
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
      // 诗篇：技能1 脱离技能轮换（独立计时释放，见 updateBossStorm）
      if (isShipian()) pool = pool.filter(x => x !== 0);
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
        // 诗篇：射击 10 次，且第一次射击同时射出两处（共 11 道风柱）——技能时长随射击次数延长
        e.skill = { id: 2, t: 0, dur: isShipian() ? 2.0 + (STORM_SHIP.s3.shots - 5) * 0.32 : 2.0, count: 0, next: 0.15 };
        break;
      case 3:
        // 技能4：漩涡状弹幕（4 条臂），真我：前半程逆时针旋转、后半程顺时针旋转
        // 初始朝向完全随机（0~2π 任意角）：首轮子弹可能是「+」、「×」或任意中间朝向
        // 诗篇：总时长 9s；初始方向顺/逆时针随机，期间随机改变 1~3 次（间隔 ≥1s，7s 未变过则必变）；
        //   旋转速度 +20%、风弹射速 +30%；持续期间自身获得 25% 减伤（见 08-entities enemyDamageMul）
        e.skill = isShipian()
          ? { id: 3, t: 0, dur: STORM_SHIP.s4.dur, fire: 0, armAng: Math.random() * Math.PI * 2,
              dir: Math.random() < 0.5 ? 1 : -1, changes: stormS4ChangeTimes(), ci: 0, spMul }
          : { id: 3, t: 0, dur: 4.6, fire: 0, armAng: Math.random() * Math.PI * 2, spMul };
        break;
      case 4: {
        // 技能5：两轮乱射风条 + 中心一枚瞄准玩家；每轮射击时长 +60%（发射更稀疏），
        // 第二轮开火时刻不变（旧版第一轮射完 1.19s + 0.9s 间隔 ≈ 2.09s）→ 两轮间隔缩短至约 0.3s
        // 诗篇：两轮风弹数量 14/11（第二轮开火时刻随首轮最后一发顺延，保持约 0.3s 轮间隔）
        const n1 = isShipian() ? STORM_SHIP.s5.counts[0] : 12;
        const n2 = isShipian() ? STORM_SHIP.s5.counts[1] : 9;
        e.skill = { id: 4, t: 0, dur: 4.2, pts: stormSkill5Pts(n1), round: 1,
          round2At: isShipian() ? 0.2 + (n1 - 1) * 0.144 + 0.3 : 0.2 + 11 * 0.09 + 0.9,
          centerFired: false, n2, spMul };
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
      // 技能3：连续布置风柱标记（每 0.32s 一处，各 1.3s 后降下打击）
      // 诗篇：射击 10 次，且第一次射击同时射出两处（共 11 道风柱），射击间隔不变
      const shots = isShipian() ? STORM_SHIP.s3.shots : 5;
      s.next -= dt;
      while (s.next <= 0 && s.count < shots) {
        s.next += 0.32;
        s.count++;
        pushStormPillar();
        if (isShipian() && s.count === 1) pushStormPillar();   // 第一次射击射出两处
      }
    } else if (s.id === 3) {
      // 技能4：4 条臂漩涡弹幕——真我：前半程逆时针、后半程顺时针；
      // 诗篇：初始方向随机，期间按预定时刻改变 1~3 次方向（7s 未变过则 7s 必变，见 stormS4ChangeTimes）
      if (s.changes && s.ci < s.changes.length && s.t >= s.changes[s.ci]) {
        s.dir *= -1;
        s.ci++;
      }
      const dir = s.changes ? s.dir : (s.t < s.dur / 2 ? 1 : -1);
      // 诗篇：旋转速度 +20%、风弹射速 +30%
      const spinMul = s.changes ? STORM_SHIP.s4.spinMul : 1;
      const spdMul = s.changes ? STORM_SHIP.s4.speedMul : 1;
      s.armAng += dir * 1.6 * spinMul * dt;
      s.fire -= dt;
      if (s.fire <= 0) {
        s.fire = 0.11;
        for (let k = 0; k < 4; k++) {
          // 风条：椭圆形长条弹，初速低沿飞行方向加速；最大弹速 583（较上版 +50%）、加速度 143.75/s
          // 宽度 r=5.6，刚射出时长度 12、随时间以 150px/s 长到全长 70；伤害 18
          const ang = s.armAng + k * Math.PI / 2;
          pushBossBullet(e.x, e.y, ang, 56 * sm * spdMul,
            { r: 5.6, dmg: 18, color: STORM_WIND, len: 12, lenTarget: 70, growRate: 150, oval: true,
              accel: 143.75 * sm * spdMul, maxSpeed: 583 * sm * spdMul });
        }
      }
    } else if (s.id === 4) {
      // 技能5：两轮乱射（各 12/9 处风条 + 中心瞄准弹；诗篇 14/11）；每发风弹独立判定强化（15% +50% / 5% +100%）
      // 诗篇：普通风弹 20% 概率射速减慢 20%~50%（强化大风弹不受减速影响）
      let allFired = true;
      for (const p of s.pts) {
        p.delay -= dt;
        if (p.delay <= 0 && !p.fired) {
          p.fired = true;
          const ang = Math.PI / 2 + rand(-Math.PI / 6, Math.PI / 6);
          // 风条：初速低沿飞行方向加速至 874.5，长度 12 以 150px/s 长到 70，波动渲染；m 为强化倍率
          const m = stormSkill5Mul();
          const slow = (isShipian() && m === 1 && Math.random() < STORM_SHIP.s5.slowChance)
            ? rand(STORM_SHIP.s5.slowMin, STORM_SHIP.s5.slowMax) : 1;
          pushBossBullet(e.x + p.dx, e.y + p.dy, ang, 56 * sm * slow,
            { r: 5.6 * m, dmg: STORM.tornadoDmg * m, color: STORM_WIND, len: 12 * m, lenTarget: 70 * m, growRate: 150,
              oval: true, accel: 215.625 * sm * m * slow, maxSpeed: 874.5 * sm * m * slow });
          spawnParticles(e.x + p.dx, e.y + p.dy, '#ffffff', 4, 110);
        }
        if (!p.fired) allFired = false;
      }
      if (!s.centerFired && s.t >= 0.55) {
        s.centerFired = true;
        const m = stormSkill5Mul();
        const slow = (isShipian() && m === 1 && Math.random() < STORM_SHIP.s5.slowChance)
          ? rand(STORM_SHIP.s5.slowMin, STORM_SHIP.s5.slowMax) : 1;
        pushBossBullet(e.x, e.y, Math.atan2(player.y - e.y, player.x - e.x), 56 * sm * slow,
          { r: 5.6 * m, dmg: STORM.tornadoDmg * m, color: STORM_WIND, len: 12 * m, lenTarget: 70 * m, growRate: 150,
            oval: true, accel: 215.625 * sm * m * slow, maxSpeed: 874.5 * sm * m * slow });   // 中心弹同样参与强化判定
        spawnParticles(e.x, e.y, '#ffffff', 8, 140);
      }
      // 第二轮：开火时刻固定（round2At，真我 ≈ 2.09s / 诗篇随首轮最后一发顺延保持约 0.3s 轮间隔）——
      // 到点后重新随机点位进入第二轮（中心瞄准弹同样再来一枚）
      if (allFired && s.round === 1 && s.t >= s.round2At) {
        s.round = 2;
        s.pts = stormSkill5Pts(s.n2 || 9);
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
      if (!state.stormVortex) {
        state.stormVortex = { x: e.x, y: e.y, tx: CANVAS_W / 2, ty: CANVAS_H * 0.80,
          r: CANVAS_W * 0.04, phase: 'warn', t: 0, ang: Math.random() * Math.PI * 2,
          dir: Math.random() < 0.5 ? 1 : -1, emit: 0,
          arms: isShipian() ? STORM_SHIP.s7.arms : 2 };   // 诗篇：三旋臂（真我双旋臂）
      }
      const v = state.stormVortex;
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
          v.emit = 0.045;   // 密集喷射：每臂约 22 发/秒
          // 子弹呈旋臂状：同时射出沿圆周均布的 ARMS 发（真我 2 条旋臂相隔 180°；诗篇 3 条相隔 120°），
          // 随自转形成旋转风臂；加速度/最大速度 = 四旋臂（技能4）的 70%；长度 7.2→42（初始/最大长度均为标准风条的 60%）
          const ARMS = v.arms || 2;
          for (let k = 0; k < ARMS; k++) {
            const ea = v.ang + k * Math.PI * 2 / ARMS;
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
          state.stormVortex = null;
        }
      }
      // 风旋机体碰撞（预警阶段尚无实体，不判定）
      if (state.stormVortex && v.phase !== 'warn' && player.alive && player.invuln <= 0 &&
          Math.hypot(v.x - player.x, v.y - (player.y + PLAYER_CFG.hitOffsetY)) < v.r * 0.9 + PLAYER_CFG.hitRadius) {
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
        if (Math.abs((player.y + PLAYER_CFG.hitOffsetY) - c.y) < STORM.waveHalfW + PLAYER_CFG.hitRadius) {
          f.hit = true;   // 无敌期间处于带内同样消耗本次判定：风波掠过，不结算也不补判——
          // （否则无敌结束时会被"迟到"的风波命中：出现时无敌跳过判定、静止玩家在无敌结束后被判中）
          if (player.invuln <= 0) {
            damagePlayer(STORM.windDmg);
            // 击退：竖直推离风波带（玩家在带下方则下推、上方则上推）+ 向入射侧回推的固定分量
            // （不能用 player - 采样点：c.x 恒等于 player.x，会导致 dx=0、方向退化）
            const vdir = ((player.y + PLAYER_CFG.hitOffsetY) - c.y) >= 0 ? 1 : -1;
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
        if (Math.abs(player.x - p.x) < STORM.pillarW / 2 + PLAYER_CFG.hitRadius) {
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
      vx: opts.vx != null ? opts.vx : Math.cos(ang) * speed,
      vy: opts.vy != null ? opts.vy : Math.sin(ang) * speed,
      ax: opts.ax || 0,          // 横向加速度（技能5 的 1/4 双曲线弹道）
      accel: opts.accel || 0,    // 沿飞行方向加速度（初速低逐渐加速的风条等）
      maxSpeed: opts.maxSpeed || 0,
      // 旋转弹（诗篇·旧日之歌技能1）：速度方向按 angVel 逐帧旋转，水平以上/以下角速度乘 spinUp/spinDown；
      // life 为寿命上限（旋转弹可能长期滞留场上）
      angVel: opts.angVel || 0,
      spinUp: opts.spinUp, spinDown: opts.spinDown,
      life: opts.life != null ? opts.life : null,
      oval: opts.oval || false,  // 长条弹呈椭圆体（风条）
      lenTarget: opts.lenTarget || 0,   // 风条生长目标长度（>0 时从 len 起步随时间生长）
      growRate: opts.growRate || 0,     // 风条生长速率（px/s）
      r: opts.r != null ? opts.r : 3.5,
      len: opts.len || 0,        // >0 为长条弹（胶囊体判定）
      dmg: opts.dmg != null ? opts.dmg : BOSS.bulletDmg,
      color: opts.color || BOSS_BULLET.long,
      trail: opts.trail || null,   // 拖尾色（部件球弹幕等特殊弹）
      // ---- 风暴编织者专用 ----
      bolt: opts.bolt || false,        // 雷电光束弹（锯齿电弧内芯渲染，见 10-draw-world）
      beamTrail: opts.beamTrail || false,   // 折线光束：记录头部轨迹，光束沿轨迹从 0 增长、转折自然弯折（技能3）
      bounceX: opts.bounceX || false,  // 触左右边界反弹（技能3）
      seed: opts.seed != null ? opts.seed : ((Math.random() * 1e9) | 0),   // 电弧闪频种子（渲染步进用）
    });
  }

  // BOSS 血量阶段掉落：每当 BOSS 失去 20% 血量（跨过 80%/60%/40%/20% 线）判定一次，
  // 互斥三选一：升级套件 / 量子护盾 / 两个全掉（概率见 BOSS_LOOT_*，随火力等级修正：Lv4 减半、Lv5 ×0.3）。
  // 允许一次伤害跨过多条线（逐线补判）；血量回升不重复判定（lootMark 只增不减）；测试模式不掉落。
  // 调用点在 06-enemy 的 boss 通用分支（updateEnemies）——所有 BOSS（含今后新增）自动生效，无需各状态机单独接入
  function updateBossLootMarks(e) {
    if (state.challenge) return;
    const marks = Math.min(4, Math.floor((1 - Math.max(0, e.hp) / e.maxHp) / 0.2));
    if (e.lootMark == null) e.lootMark = 0;
    if (e.lootMark >= marks) return;
    const mul = player.weapon >= 5 ? 0.3 : player.weapon === 4 ? 0.5 : 1;
    const pBoth = BOSS_LOOT_BOTH * mul, pKit = BOSS_LOOT_KIT * mul, pShield = BOSS_LOOT_SHIELD * mul;
    while (e.lootMark < marks) {
      e.lootMark++;
      const r = Math.random();
      if (r < pBoth) { spawnPowerup(e.x, e.y, 'kit', 12); spawnPowerup(e.x, e.y, 'shield', 13); }
      else if (r < pBoth + pKit) spawnPowerup(e.x, e.y, 'kit', 12);
      else if (r < pBoth + pKit + pShield) spawnPowerup(e.x, e.y, 'shield', 13);
    }
  }

  // ---------- BOSS3：风暴编织者（雷电飞舰） ----------
  // 技能池（乱序，释放间隔 = 暴风之眼的 75%；玩家暴走期间间隔额外减半）：
  //   技能1 电弧球蓄力激光：停止移动，中心电弧球明显预警蓄力 1.4s → 向下强力电弧激光（伤害走导弹规则）
  //   技能2 四喷口激光：停止移动，喷口激涌蓄力 1.2s → 随机序依次向下电弧激光（50 伤害）
  //   技能3 斜下反弹光束：四喷口向斜下（左右对称两角度）发射电弧光束，触左右边界反弹（弹道呈"<"）
  //   技能4 蛇形雷条：能量球沿"先左后右、越摆越宽"的蛇形轨迹连续快速发射雷电长条弹；
  //         <70% 强化：四喷口外各现一圈 10~14 枚雷电子弹（停留原处 1s 后向对应方向爆开，高初速减速至巡航）
  //   技能5 雷霆打击：周身明亮雷电光环，下方 30% 区域随机 5 处依次雷击（40 伤害，雷电积聚预警 1.2s，
  //         区域半径 = 焦香螺旋桨火环 JIAOXIANG.auraR；击中中心外扩一圈 10~14 枚雷电子弹）
  //   技能6 重现光束：四喷口沿臂方向直射光束出屏 → 光束于机体上方左右两点重现，各点快速连射 2 次
  //         （<70% 3 次）；左点瞄准底边 25%~100%、右点对称 0~75%，同点落点间隔 ≥15% 屏宽
  //
  // 四臂/喷口几何：与 11-draw-boss drawStormBossII 的绘制常量保持一致（改动需双侧同步）
  const S2_ARM_ANG = [-150, -30, 150, 30];   // 四臂朝向（度）：左上 / 右上 / 左下 / 右下
  const S2_ARM_LEN = [63, 63, 96, 96];       // 臂长：上短下长
  const S2_HOOK_SIDE = [1, -1, 1, -1];       // 钩形尾镜像朝向
  // 第 i 臂雷电喷口（钩腹蓝色光圈）的世界坐标 + 臂伸出方向角（供技能 2/3/6 发射定位）
  function storm2Nozzle(e, i) {
    const ang = S2_ARM_ANG[i] * Math.PI / 180;
    const sway = Math.sin(e.t * 1.2 + i * 1.9) * 0.028;   // 嗡振（同绘制）
    const th = ang - Math.PI / 2 + sway;                  // 臂局部坐标系旋转
    const L = S2_ARM_LEN[i], ly = L - (L * 0.36) * 0.40;  // 喷口沿臂方向位置（钩腹中部）
    const lx = 12.5 * S2_HOOK_SIDE[i];                    // 喷口横向偏移（随钩形尾镜像）
    const S = 1.008 * (e.scale || 1);
    const ox = Math.cos(ang) * 15, oy = -4 + Math.sin(ang) * 15;   // 臂根（BX=0 / BY=-4 / ROOT_R=15）
    return {
      x: e.x + (ox + Math.cos(th) * lx - Math.sin(th) * ly) * S,
      y: e.y + (oy + Math.sin(th) * lx + Math.cos(th) * ly) * S,
      dir: ang + sway,   // 臂伸出方向（世界角）
    };
  }
  // 电弧能量球中心（凹槽 RY=3，同绘制）
  function storm2BallPos(e) {
    const S = 1.008 * (e.scale || 1);
    return { x: e.x, y: e.y + 3 * S };
  }

  function updateBossStorm2(e, dt) {
    e.t += dt;
    // 血条登场计时（仅战斗阶段推进，保留登场横向展开演出）+ 残血余像（hpTrail 缓慢追赶 hp）
    if (e.phase === 'combat') e.barT = (e.barT || 0) + dt;
    if (e.hpTrail == null) e.hpTrail = e.hp;
    e.hpTrail += (e.hp - e.hpTrail) * Math.min(1, dt * 2.2);

    // 入场演出：风暴消散(0.8s) → 电闪雷鸣(1.2s) → 现身(0.8s) → 进入战斗
    if (e.phase === 'entrance') {
      e.phaseT += dt;
      const p = e.phaseT;
      if (p < 0.8) {
        // 风暴残余消散：白雾自大范围向内飘散，画面青白微闪
        if (Math.random() < dt * 30) {
          const a = Math.random() * Math.PI * 2;
          const r0 = rand(120, 190);
          spawnParticles(e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0 * 0.7, '#eaf6ff', 3, 90);
          spawnParticles(e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0 * 0.7, '#ffffff', 2, 70);
        }
        state.flash = Math.max(state.flash, 0.10 + 0.08 * Math.sin(p * 12));
      } else if (p < 2.0) {
        // 电闪雷鸣：随机全屏落雷（lightning-4 素材绘制）+ 白闪 + 震屏，机体轮廓在闪电中若隐若现
        e.boltT = (e.boltT || 0) - dt;
        if (e.boltT <= 0) {
          e.boltT = rand(0.12, 0.22);
          e.bolts.push({ x: rand(50, CANVAS_W - 50), y: rand(30, CANVAS_H * 0.65), t: 0, dur: 0.28, seed: (Math.random() * 1e9) | 0 });
          state.flash = Math.max(state.flash, 0.28);
          shake(5, 0.18);
          if (Math.random() < 0.5) spawnParticles(e.x + rand(-70, 70), e.y + rand(-30, 30), '#bfe6ff', 8, 160);
        }
        e.scale = 0.10 + 0.14 * Math.abs(Math.sin(p * 9));   // 若隐若现
      } else if (p < 2.8) {
        // 现身：scale 0.1 → 1（easeOutBack 轻微过冲）+ 首帧白蓝爆闪
        const rp = clamp((p - 2.0) / 0.8, 0, 1);
        const c1 = 1.70158, c3 = c1 + 1;
        const back = 1 + c3 * Math.pow(rp - 1, 3) + c1 * Math.pow(rp - 1, 2);
        e.scale = 0.10 + 0.90 * back;
        if (!e.revealFlashed) { e.revealFlashed = true; state.flash = Math.max(state.flash, 0.35); }
      } else {
        // 就位：进入战斗
        e.phase = 'combat';
        e.phaseT = 0;
        e.scale = 1;
        e.combatReady = true;
        e.bolts = [];
        spawnParticles(e.x, e.y, '#bfe6ff', 26, 300);
        spawnParticles(e.x, e.y, '#eaf6ff', 16, 220);
        state.flash = Math.max(state.flash, 0.3);
        shake(9, 0.4);
      }
      // 入场闪电演出推进
      for (let i = e.bolts.length - 1; i >= 0; i--) {
        e.bolts[i].t += dt;
        if (e.bolts[i].t >= e.bolts[i].dur) e.bolts.splice(i, 1);
      }
      return;   // 入场期间不巡航、不释放技能
    }
    if (!e.combatReady) return;
    // 技能1/2 蓄力期停移：以较大加速度平滑减速至停（结束后再平滑加速回巡航），避免瞬停/瞬启
    const wantFreeze = !!(e.skill && (e.skill.id === 0 || e.skill.id === 1));
    if (e.moveRate == null) e.moveRate = 1;
    const rateAccel = wantFreeze ? 6 : 3;   // 减速加速度较大（≈0.17s 停稳），重新启动稍缓（≈0.33s 提速）
    if (wantFreeze) e.moveRate = Math.max(0, e.moveRate - rateAccel * dt);
    else e.moveRate = Math.min(1, e.moveRate + rateAccel * dt);
    e.moveT += dt * e.moveRate;
    e.x = CANVAS_W / 2 + Math.sin(e.moveT * STORM2.moveSpeed) * STORM2.moveAmp;
    e.y = STORM2.hoverY + Math.sin(e.moveT * STORM2.bobSpeed) * STORM2.bobAmp;

    if (e.skill) runStorm2Skill(e, e.skill, dt);
    else {
      // 玩家暴走：技能释放间隔额外减半（冷却计时 ×2 流逝）
      e.skillCd -= dt * (player.weapon === 5 ? 2 : 1);
      if (e.skillCd <= 0) startStorm2Skill(e);
    }

    // 血量 70%：掉落一个暴走道具（一次性，与其他 BOSS 一致）
    if (!e.dropBerserk && e.hp <= e.maxHp * 0.70) {
      e.dropBerserk = true;
      spawnPowerup(e.x, e.y + 50, 'berserk', 15);
    }
  }

  function startStorm2Skill(e) {
    // 全局机制：本局内从未释放过的技能，在其他技能被释放时权重 ×1.5
    if (!e.skillWeights) e.skillWeights = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
    if (!e.skillUseCount) e.skillUseCount = {};
    let pool = [0, 1, 2, 3, 4, 5];
    // 全局规则：同一技能最多连续释放两次，禁止三连
    if (e.skillStreak >= 2) pool = pool.filter(x => x !== e.lastSkill);
    const id = weightedPick(pool, e.skillWeights);
    // 全局规则：连续随机到同一技能 → 技能间冷却 -80%
    const repeat = id === e.lastSkill;
    e.skillStreak = repeat ? e.skillStreak + 1 : 1;
    e.skillCd = repeat ? STORM2.skillCd * 0.2 : STORM2.skillCd;
    e.lastSkill = id;
    const spMul = repeat ? 1.4 : 1.0;   // 连中同技能：弹速 ×1.4
    e.skillUseCount[id] = (e.skillUseCount[id] || 0) + 1;
    for (const k in e.skillWeights) {
      if (+k !== id && !e.skillUseCount[+k]) e.skillWeights[k] *= 1.5;
    }

    switch (id) {
      case 0:   // 技能1：电弧球蓄力 1.4s → 向下强力电弧激光（导弹级伤害）
        e.skill = { id: 0, t: 0, dur: STORM2.s1Charge + STORM2.s1BeamDur, fired: false };
        break;
      case 1: { // 技能2：喷口激涌蓄力 1.2s → 随机序依次下射（间隔 0.13s）
        const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
        e.skill = { id: 1, t: 0, dur: STORM2.s2Charge + 3 * STORM2.s2Gap + STORM2.s2BeamDur + 0.15,
          order, nextIdx: 0, nextT: STORM2.s2Charge, beams: [] };
        break;
      }
      case 2:   // 技能3：四喷口斜下电弧光束（左右对称，左右边界反弹）
        e.skill = { id: 2, t: 0, dur: 2.4, fired: false, spMul };
        break;
      case 3: { // 技能4：能量球连射（40~70 发、间隔 0.08s；瞄准点按蛇形曲线预采样）
        const shots = 40 + Math.floor(Math.random() * 31);   // 40~70 发
        const pathT = (CANVAS_H - STORM2.hoverY - 60) / 168; // 蛇形路径竖直跨度（悬停带 → 近底部）
        const offs = [];
        for (let k = 1; k <= shots; k++) {
          const t = (k / shots) * pathT;
          offs.push({ dx: Math.sin(Math.PI + 5.6 * t) * (24 + 62 * t), dy: 168 * t });   // 先向左摆、振幅随时间增大；甩动速率 5.6（约 5 个来回）
        }
        // <70% 强化：四喷口雷环依次浮现（间隔 0.8~1.5s）
        const ringTimes = [0.15];
        for (let k = 1; k < 4; k++) ringTimes.push(ringTimes[k - 1] + rand(0.8, 1.5));
        e.skill = { id: 3, t: 0, dur: Math.max(0.1 + shots * 0.08 + 1.6, ringTimes[3] + 0.3), shots, offs, fired: 0, next: 0.1, ringTimes, ringsSpawned: 0, spMul };
        break;
      }
      case 4: { // 技能5：雷电光环 + 下方 30% 区域 5 处依次雷击（各 1.2s 预警）
        const strikes = [];
        for (let k = 0; k < 5; k++) {
          strikes.push({ x: rand(60, CANVAS_W - 60), y: rand(CANVAS_H * 0.70, CANVAS_H - 40), t: -k * 0.9, fired: false, flash: 0 });
        }
        e.skill = { id: 4, t: 0, dur: STORM2.s5Warn + 4 * 0.9 + 0.7, strikes };
        break;
      }
      case 5:   // 技能6：臂向光束 → 左右边界重现慢速飞行光束（<70% 三连；轮次间隔 1.5s；1s 抵底；光束自 0 增长）
        e.skill = { id: 5, t: 0, dur: 6.8, armFired: false, beams: [], pointsAt: false, ptT: 0, shot: 0, targets: null, spMul };
        break;
    }
  }

  // 技能5 雷击区域半径：焦香螺旋桨火环的 80%（S5RMul）
  const S2_STRIKE_R = JIAOXIANG.auraR * STORM2.s5RMul;

  // 雷电子弹环（技能4 强化 / 技能5 打击外扩共用）：10~14 枚圆形雷电子弹（增大版 r=ringR，带短拖尾）
  //   hold>0：停留在生成位置（BOSS 移动也不跟随），1s 后向各自方向爆开（高初速 → 减速至巡航，见 08-entities decelTo）；
  //   hold=0：生成即爆开（直接携带初速，不经停留逻辑）；
  //   每圈爆开弹速独立浮动 80%~120%（同圈内全部一致）
  function spawnStorm2Ring(cx, cy, rr, hold, sm = 1) {
    const n = 10 + Math.floor(Math.random() * 5);   // 10~14 枚
    const spdMul = sm * rand(0.8, 1.2);   // 本圈爆开弹速浮动（80%~120%，同圈一致）
    for (let k = 0; k < n; k++) {
      const ba = (k / n) * Math.PI * 2 + Math.random() * 0.25;
      const base = {
        x: cx + Math.cos(ba) * rr, y: cy + Math.sin(ba) * rr,
        r: STORM2.ringR, dmg: STORM2.s4Dmg, color: '#9fd8ff',
        trail: true, trailCol: '159, 216, 255', trailLife: 0.16,   // 短拖尾（白蓝，0.16s）
        decelTo: STORM2.ringCruise, decelRate: STORM2.ringDecel,
      };
      if (hold > 0) {
        eBullets.push({ ...base, vx: 0, vy: 0, holdT: hold, burstAng: ba, v0: STORM2.ringV0 * spdMul });
      } else {
        eBullets.push({ ...base, vx: Math.cos(ba) * STORM2.ringV0 * spdMul, vy: Math.sin(ba) * STORM2.ringV0 * spdMul });
      }
    }
    spawnParticles(cx, cy, '#bfe6ff', 8, 120);
  }

  // 技能6 落点抽样：左侧点 n 个底边目标（25%~100%，同侧两点间隔 ≥25% 屏宽），右侧 = 左侧镜像（左右对称）
  function pickStorm2Aims(n) {
    const lo = CANVAS_W * 0.25, hi = CANVAS_W;
    const out = [];
    for (let k = 0; k < n; k++) {
      let v, guard = 0;
      do { v = rand(lo, hi); guard++; } while (guard < 80 && out.some(o => Math.abs(o - v) < CANVAS_W * 0.25));
      out.push(v);
    }
    return [out, out.map(x => CANVAS_W - x)];
  }

  function runStorm2Skill(e, s, dt) {
    s.t += dt;
    const sm = s.spMul || 1;
    const ball = storm2BallPos(e);

    if (s.id === 0) {
      // 技能1：蓄力（电弧球预警演出见 11-draw-boss）→ 向下强力电弧激光
      if (!s.fired) {
        if (s.t >= STORM2.s1Charge) {
          s.fired = true;
          spawnParticles(ball.x, ball.y, '#bfe6ff', 22, 260);
          shake(8, 0.4);
        }
      } else {
        // 激光竖直带：命中走导弹规则（HP<60 直接击杀 / ≥60 失去 80% 血量 + 武器等级 -1，与先兆者导弹一致）
        const life = s.t - STORM2.s1Charge;
        if (player.alive && player.invuln <= 0 && player.shield <= 0 &&
            strikeVis(life / STORM2.s1BeamDur, 0.12) >= 0.35 &&
            Math.abs(player.x - ball.x) < STORM2.s1R + PLAYER_CFG.hitRadius) {
          missileHitPlayer();
        }
      }
    } else if (s.id === 1) {
      // 技能2：随机序依次发射（一个先发，其余快速随机跟上），每道竖直激光命中一次
      s.nextT -= dt;
      while (s.nextIdx < 4 && s.nextT <= 0) {
        const nz = storm2Nozzle(e, s.order[s.nextIdx]);
        s.beams.push({ x: nz.x, y: nz.y, t: 0, dur: STORM2.s2BeamDur, hit: false });
        spawnParticles(nz.x, nz.y, '#bfe6ff', 10, 180);
        shake(5, 0.22);
        s.nextIdx++;
        s.nextT = STORM2.s2Gap;
      }
      for (const b of s.beams) {
        b.t += dt;
        if (!b.hit && b.t >= 0.05 && player.alive && player.invuln <= 0 && player.shield <= 0 &&
            strikeVis(b.t / b.dur, 0.10) >= 0.35 &&
            Math.abs(player.x - b.x) < STORM2.s2R + PLAYER_CFG.hitRadius) {
          b.hit = true;
          damagePlayer(STORM2.s2Dmg);
        }
      }
    } else if (s.id === 2) {
      // 技能3：仅在场地正中释放四道斜下电弧光束（左右镜像对称：内 ±26° / 外 ±49°），
      // 触左右边界反弹（弹道呈"<"形折线，25 伤害）
      if (!s.fired && s.t >= 0.15) {
        s.fired = true;
        const ox = CANVAS_W / 2, oy = e.y + 6;
        for (const [side, off] of [[1, 0.85], [-1, 0.85], [1, 0.45], [-1, 0.45]]) {
          // side=+1 朝左下、-1 朝右下（角度相对竖直向下）；光束长度为基础版的 400%，
          // 自头部轨迹从 0 增长而来（beamTrail），触壁转折时轨迹自然弯折而非整体转向
          pushBossBullet(ox, oy, Math.PI / 2 + side * off, 330 * sm, {
            r: 6, dmg: STORM2.s3Dmg, len: 336, color: '#9fd8ff', bolt: true, beamTrail: true, bounceX: true,
          });
        }
        spawnParticles(ox, oy, '#bfe6ff', 10, 150);
        shake(5, 0.22);
      }
    } else if (s.id === 3) {
      // 技能4：能量球连射雷电长条弹（40~70 发、间隔 0.08s）——每发均为直射弹、飞行中不扭动，
      //   仅朝向各不相同：按蛇形曲线（先左后右、越摆越宽）逐点采样瞄准方向，弹点集合整体呈现流线轨迹
      s.next -= dt;
      if (s.next <= 0 && s.fired < s.shots) {
        s.next = 0.08;
        const o = s.offs[s.fired];
        pushBossBullet(ball.x, ball.y, Math.atan2(o.dy, o.dx), 250 * sm, {
          r: 4.6, dmg: STORM2.s4Dmg, len: 34, color: '#9fd8ff', bolt: true,
        });
        s.fired++;
      }
      // <70% 强化：四喷口雷环依次浮现（间隔 0.8~1.5s，不再同时出现）——
      //   每圈停留在生成位置 1s 后爆开（BOSS 移动走子弹也不跟随），爆开弹速每圈独立浮动 80%~120%
      if ((e.hp / e.maxHp) < 0.70) {
        while (s.ringsSpawned < 4 && s.t >= s.ringTimes[s.ringsSpawned]) {
          const nz = storm2Nozzle(e, s.ringsSpawned);
          spawnStorm2Ring(nz.x, nz.y, 24, 1.0, sm);
          s.ringsSpawned++;
        }
      }
    } else if (s.id === 4) {
      // 技能5：雷电光环（演出见 11-draw-boss）+ 下方 30% 区域 5 处依次雷击：
      //   雷电积聚预警 1.2s → 落雷（区域 40 伤害）+ 中心外扩一圈雷电子弹
      for (const st of s.strikes) {
        st.t += dt;
        if (!st.fired && st.t >= STORM2.s5Warn) {
          st.fired = true;
          st.flash = 0.35;
          if (player.alive && player.invuln <= 0 && player.shield <= 0 &&
              Math.hypot(player.x - st.x, (player.y + PLAYER_CFG.hitOffsetY) - st.y) < S2_STRIKE_R) {
            damagePlayer(STORM2.s5Dmg);
          }
          spawnStorm2Ring(st.x, st.y, 6, 0, sm);   // 立即爆开的雷环
          spawnParticles(st.x, st.y, '#eaf6ff', 18, 260);
          shake(6, 0.25);
        }
      }
    } else if (s.id === 5) {
      // 技能6 阶段1：四喷口沿臂方向直射电弧光束（超出屏幕，0.5s 演出，28 伤害）
      if (!s.armFired && s.t >= 0.30) {
        s.armFired = true;
        for (let i = 0; i < 4; i++) {
          const nz = storm2Nozzle(e, i);
          s.beams.push({ x: nz.x, y: nz.y, ang: nz.dir, t: 0, dur: 0.5, hit: false });
        }
        spawnParticles(ball.x, ball.y, '#bfe6ff', 12, 200);
        shake(6, 0.25);
      }
      // 技能6 阶段2：光束于左右边界重现（0.3s 汇聚预兆），每点快速连射 2 次（<70% 3 次）：
      //   左点瞄准底边 25%~100%、右侧为其镜像（左右对称）；同点各发落点间隔 ≥25% 屏宽；
      //   重现光束与臂向光束同长（640），以约 1s 抵达底边的慢速沿瞄准方向飞行，命中一次
      const volleyN = (e.hp / e.maxHp) < 0.70 ? 3 : 2;
      if (!s.pointsAt && s.t >= 0.95) {
        s.pointsAt = true;
        s.ptT = 0.3;
        s.shot = 0;
        s.targets = pickStorm2Aims(volleyN);
      }
      if (s.pointsAt && s.shot < volleyN) {
        s.ptT -= dt;
        if (s.ptT <= 0) {
          s.ptT = 1.5;   // 两轮之间间隔 1.5s（预警 → 光束自 0 增长并飞抵 → 下一轮）
          const py = e.y - 26;
          for (let side = 0; side < 2; side++) {
            const px = side === 0 ? 10 : CANVAS_W - 10;
            const tx = s.targets[side][s.shot];
            const dist = Math.hypot((CANVAS_H + 60) - py, tx - px);
            const ang = Math.atan2((CANVAS_H + 60) - py, tx - px);
            const v = dist / 1.0;   // 约 1s 抵达底边
            s.beams.push({ x: px, y: py, ang, v, fly: true, t: 0, dur: (dist + 640) / v + 0.1, hit: false });
            spawnParticles(px, py, '#bfe6ff', 8, 150);
          }
          s.shot++;
        }
      }
      // 光束推进与命中判定（臂向 = 原地闪现；重现 = 沿瞄准方向慢速飞行；长度均自 0 增长至 640，≈0.29s 长满）
      for (let i = s.beams.length - 1; i >= 0; i--) {
        const b = s.beams[i];
        b.t += dt;
        b.len = Math.min(640, b.t * 2200);
        if (b.fly) { b.x += Math.cos(b.ang) * b.v * dt; b.y += Math.sin(b.ang) * b.v * dt; }
        if (b.t >= b.dur) { s.beams.splice(i, 1); continue; }
        if (!b.hit && b.len >= 30 && player.alive && player.invuln <= 0 && player.shield <= 0) {
          const ux = Math.cos(b.ang), uy = Math.sin(b.ang);
          const py2 = player.y + PLAYER_CFG.hitOffsetY;
          const tproj = clamp((player.x - b.x) * ux + (py2 - b.y) * uy, 0, b.len);
          if (Math.hypot(player.x - (b.x + ux * tproj), py2 - (b.y + uy * tproj)) < STORM2.s6R + PLAYER_CFG.hitRadius) {
            b.hit = true;
            damagePlayer(STORM2.s6Dmg);
          }
        }
      }
    }

    if (s.t >= s.dur) e.skill = null;
  }

  function updateBoss(e, dt) {
    e.t += dt;
    if (e.bossId === 'storm') { updateBossStorm(e, dt); return; }   // 暴风之眼走独立状态机
    if (e.bossId === 'storm2') { updateBossStorm2(e, dt); return; }   // 风暴编织者（雷电飞舰）

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
        e.skillCd = 1.0 * (isShipian() ? SONG_SHIP.skillCdMul : 1);
        if (isShipian()) {
          // 诗篇：登场部件球弹幕改为技能5 的登场变体——六发暗黑子弹共同瞄准玩家当前位置
          // （视为释放一次技能5，但不走技能池、不触发技能1连携）
          fireDarkSix(e, Array.from({ length: 6 }, () => ({ x: player.x, y: player.y })));
          shake(10, 0.5);
        } else {
          // 六个部件球化作弹幕：从镶接位置沿“部件—机体中轴连线”方向向外射出（暗紫轨迹、20 伤害）
          for (const pt of e.parts) {
            pushBossBullet(e.x + pt.tx, e.y + pt.ty, Math.atan2(pt.ty, pt.tx), 430,
              { r: 7, dmg: 20, color: '#c084fc', trail: '#7c3aed' });
          }
          spawnParticles(e.x, e.y, '#c8b0ff', 14, 240);   // 少量紫色粒子替代原炸开效果
          shake(10, 0.5);
        }
      }
      return;
    }

    // 血条登场计时 + 残血余像（hpTrail 缓慢追赶 hp，受击时白色余条缓慢消退）
    e.barT = (e.barT || 0) + dt;
    if (e.hpTrail == null) e.hpTrail = e.hp;
    e.hpTrail += (e.hp - e.hpTrail) * Math.min(1, dt * 2.2);

    // 技能1期间停止移动（主技能或连携技能1；moveT 同步冻结，避免技能结束后因 moveT 继续累加而瞬移），其余时间小幅左右巡航
    if ((!e.skill || e.skill.id !== 0) && (!e.link || e.link.id !== 0)) {
      e.moveT += dt;
      e.x = CANVAS_W / 2 + Math.sin(e.moveT * BOSS.moveSpeed) * BOSS.moveAmp;
    }

    if (e.skill) runBossSkill(e, e.skill, dt);
    else {
      e.skillCd -= dt;
      if (e.skillCd <= 0) startBossSkill(e);
    }
    // 诗篇连携：与主技能并行的技能1（由 startBossSkill 概率挂载）
    if (e.link) runBossSkill(e, e.link, dt);

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

  // ---------- 诗篇：旧日之歌技能改版辅助 ----------
  // 生成 n 条旋转双曲线弹流：初始方向与角速度逐条随机。
  // 2 条流（连携概率分支）：左右管各一条，向外/向内随机（左右对称）；4 条流：两管各二、方向完全随机
  function buildArcStreams(n) {
    const C = SONG_SHIP.s1;
    const mk = tube => ({
      tube,
      ang0: Math.PI / 2 + rand(-C.angSpread, C.angSpread),   // 初始方向随机
      spin: rand(C.spinMin, C.spinMax) * (Math.random() < 0.5 ? 1 : -1),   // 角速度随机（含方向）
    });
    if (n === 2) {
      const inward = Math.random() < 0.5;   // 各向内 / 各向外（对称）
      return [
        { ...mk(0), ang0: Math.PI / 2 + (inward ? -1 : 1) * rand(0.3, 0.8) },
        { ...mk(1), ang0: Math.PI / 2 + (inward ? 1 : -1) * rand(0.3, 0.8) },
      ];
    }
    const out = [];
    for (let k = 0; k < n; k++) out.push(mk(k % 2));   // 两管交替
    return out;
  }

  // 构建诗篇技能1：主释放（linked=false）享时长加成（≥70% 血 +25% / <70% 血 ×3）恒 4 条流；
  // 连携释放（linked=true）不享加成，且概率只出 2 条流（<70% 血概率降低）
  function buildSongSkill1(e, linked) {
    const C = SONG_SHIP.s1, L = C.link;
    const hpR = e.hp / e.maxHp;
    const s = { id: 0, t: 0, fire: 0, alt: 0, curveT: 0, spMul: 1, linked: !!linked };
    if (linked) {
      s.dur = C.durBase;
      s.streams = buildArcStreams(Math.random() < (hpR < 0.70 ? L.twoStreamChanceLowHp : L.twoStreamChance) ? 2 : C.streams);
    } else {
      s.dur = C.durBase * (hpR < 0.70 ? C.durLowHp : C.durHighHp);
      s.streams = buildArcStreams(C.streams);
    }
    return s;
  }

  // 诗篇技能2：随机选定 3 个快速轮次（0 为首轮慢速，1~6 中取 3）
  function pickFastRounds() {
    const idx = [1, 2, 3, 4, 5, 6];
    const set = new Set();
    while (set.size < SONG_SHIP.s2.fastRounds) set.add(idx.splice(Math.floor(Math.random() * idx.length), 1)[0]);
    return set;
  }

  // 六个部件位射出暗黑子弹（登场部件球弹幕同源；技能5/6 与诗篇登场变体共用）
  // targets：与 e.parts 等长的目标点数组，bounce 为 true 时子弹碰左右壁反弹
  function fireDarkSix(e, targets) {
    const D = SONG_SHIP.dark;
    e.parts.forEach((pt, k) => {
      const sx = e.x + pt.tx, sy = e.y + pt.ty, t = targets[k];
      pushBossBullet(sx, sy, Math.atan2(t.y - sy, t.x - sx), D.speed,
        { r: D.r, dmg: D.dmg, color: D.color, trail: D.trail, bounceX: !!t.bounce });
    });
    spawnParticles(e.x, e.y, '#c8b0ff', 14, 240);
    shake(6, 0.3);
  }

  // 技能5 目标点：玩家竖直近旁 ±10% 屏高带状区域内均匀布点（加少量抖动）
  function darkTargetsBand() {
    const D = SONG_SHIP.dark;
    const top = player.y - CANVAS_H * D.band, bot = player.y + CANVAS_H * D.band;
    const out = [];
    for (let k = 0; k < 6; k++) out.push({ x: player.x, y: top + (bot - top) * ((k + rand(0.15, 0.85)) / 6) });
    return out;
  }

  // 技能6 目标点：左右对称，只需确定左侧 3 发射向、右侧镜像——
  // wall 模式：左/右壁 [自身高度 - 20% 屏高, 屏幕底部] 区间各 3 点；bottom 模式：底部边缘左/右半边各 3 点
  function darkTargetsBounds(e, mode) {
    const D = SONG_SHIP.dark;
    const out = [];
    if (mode === 'wall') {
      const top = clamp(e.y - CANVAS_H * D.wallUp, 0, CANVAS_H - 20);
      for (const f of [0.2, 0.5, 0.8]) {
        const y = clamp(top + (CANVAS_H - top) * f + rand(-20, 20), 10, CANVAS_H - 10);
        out.push({ x: 0, y, bounce: true });
        out.push({ x: CANVAS_W, y, bounce: true });
      }
    } else {
      for (const f of [0.15, 0.32, 0.45]) {
        const x = CANVAS_W * f + rand(-20, 20);
        out.push({ x, y: CANVAS_H, bounce: true });
        out.push({ x: CANVAS_W - x, y: CANVAS_H, bounce: true });
      }
    }
    return out;
  }

  // 诗篇技能1 运行体：双管长条弹连发（同真我）+ 旋转双曲线弹流（逐流按各自初始方向/角速度发射）
  function runSongSkill1Ship(e, s, dt, lx, rx, by, sm) {
    const C = SONG_SHIP.s1;
    s.fire -= dt;
    if (s.fire <= 0) {
      s.fire = 0.07;
      s.alt ^= 1;
      for (const bx of [lx, rx]) {
        pushBossBullet(bx, by, Math.PI / 2 + rand(-0.03, 0.03), 250 * sm, { len: BOSS.longLen, dmg: BOSS.bulletDmg });
      }
    }
    s.curveT -= dt;
    if (s.curveT <= 0) {
      s.curveT = C.emitGap;
      for (const st of s.streams) {
        pushBossBullet(st.tube === 0 ? lx : rx, by, st.ang0, C.speed * sm,
          { r: 4, dmg: C.arcDmg, color: BOSS_BULLET.arc, angVel: st.spin, spinUp: C.spinUpMul, spinDown: C.spinDownMul, life: C.life });
      }
    }
  }

  function startBossSkill(e) {
    const ship = isShipian();
    // 全局机制：本局内从未释放过的技能，在其他技能被释放时权重 ×1.5（诗篇技能池 0~5）
    if (!e.skillWeights) e.skillWeights = ship ? { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 } : { 0: 1, 1: 1, 2: 1, 3: 1 };
    if (!e.skillUseCount) e.skillUseCount = {};
    let id;
    if (e.lastSkill === -1) {
      // 旧日之歌第一次释放技能必定是技能1
      id = 0;
    } else {
      // 加权随机释放；同一技能最多连续释放两次，禁止三连
      let pool = ship ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3];
      if (e.skillStreak >= 2) pool = pool.filter(x => x !== e.lastSkill);
      id = weightedPick(pool, e.skillWeights);
    }
    // 全局规则：连续随机到同一技能 → 技能间冷却 -80%，且本次技能弹速 +60%
    const repeat = id === e.lastSkill;
    e.skillStreak = repeat ? e.skillStreak + 1 : 1;   // 连续释放同技能的次数（上限 2）
    e.skillCd = repeat ? BOSS.skillCd * 0.2 : BOSS.skillCd;
    // 血量 <50%：技能释放间隔额外降低 50%
    if (e.hp / e.maxHp < 0.5) e.skillCd *= 0.5;
    // 诗篇：技能释放间隔 = 原有的 40%
    if (ship) e.skillCd *= SONG_SHIP.skillCdMul;
    e.lastSkill = id;
    const spMul = repeat ? 1.6 : 1.0;   // 连中同技能：本次弹速 ×1.6
    // 全局机制结算：记录本次使用，其他从未释放过的技能权重 ×1.5
    e.skillUseCount[id] = (e.skillUseCount[id] || 0) + 1;
    for (const k in e.skillWeights) {
      if (+k !== id && !e.skillUseCount[+k]) e.skillWeights[k] *= 1.5;
    }

    switch (id) {
      case 0:   // 技能1：双管长条弹连发 + 双曲线弹流。诗篇：恒 4 条旋转弧线流（时长 +25% / <70% 血 ×3）
        e.skill = ship ? buildSongSkill1(e, false)
          : { id: 0, t: 0, dur: 1.0, fire: 0, alt: 0, curveT: 0, spMul };
        break;
      case 1:   // 技能2：大子弹散射。诗篇：7 轮（缺失 10%~20%），首轮慢速、随机 3 轮快速（×1.4~1.7）
        e.skill = ship
          ? { id: 1, t: 0, dur: SONG_SHIP.s2.roundGap * SONG_SHIP.s2.rounds + 0.2, roundT: 0, rounds: 0, spMul, fastSet: pickFastRounds() }
          : { id: 1, t: 0, dur: 2.0, roundT: 0, rounds: 0, spMul };
        break;
      case 2: { // 技能3：四部位三连发。诗篇：2 部位锁定标记（间隔 ×1.8）+ 2 部位持续追踪玩家（间隔 ×1.4）
        const parts = [];
        const modes = ship ? ['lock', 'lock', 'track', 'track'].sort(() => Math.random() - 0.5) : null;
        for (let k = 0; k < 4; k++) {
          parts.push({ dx: rand(-0.42, 0.42) * e.w, dy: rand(-0.30, 0.30) * e.h, timer: 0.2 + k * 0.25, shots: 0, mode: modes ? modes[k] : null });
        }
        e.skill = { id: 2, t: 0, dur: ship ? 3.8 : 2.8, parts, mark: { x: player.x, y: player.y }, spMul };
        break;
      }
      case 3:   // 技能4：双管乱射。诗篇：≥70% 血 270° 双发同时；<70% 血 360° 单发 + 射速 ×3 + 定时向下扇形圆弹幕
        e.skill = ship
          ? { id: 3, t: 0, dur: 3.5, next: 0.1, fanT: rand(SONG_SHIP.s4.fanGapMin, SONG_SHIP.s4.fanGapMax), spMul }
          : { id: 3, t: 0, dur: 3.5, next: 0.1, spMul };
        break;
      case 4:   // 技能5（诗篇新增）：六发暗黑子弹瞄准玩家竖直近旁带状区域（登场变体见 updateBoss）
        e.skill = { id: 4, t: 0, dur: 0.7, fired: false };
        break;
      case 5:   // 技能6（诗篇新增）：六发暗黑子弹射向两侧边界（碰壁反弹），左右对称
        e.skill = { id: 5, t: 0, dur: 0.9, fired: false, mode: Math.random() < 0.5 ? 'wall' : 'bottom' };
        break;
    }
    // 诗篇连携：释放技能 2~6 时概率同时释放一次技能1（连携不享时长加成；2 条流概率见 SONG_SHIP.s1.link）
    if (ship && id !== 0) {
      const L = SONG_SHIP.s1.link;
      const ch = (e.hp / e.maxHp) < 0.70 ? L.chanceLowHp : L.chance;
      if (Math.random() < ch) e.link = buildSongSkill1(e, true);
    }
  }

  function runBossSkill(e, s, dt) {
    s.t += dt;
    const lx = e.x - e.w * 0.22, rx = e.x + e.w * 0.22;
    const by = e.y + e.h * 0.5;
    const sm = s.spMul || 1;   // 连中同技能时的弹速倍率（×1.6）

    if (s.id === 0) {
      if (isShipian()) {
        // 诗篇技能1：双管长条弹连发（同真我）+ 恒 4 条（连携可能 2 条）旋转双曲线弹流
        runSongSkill1Ship(e, s, dt, lx, rx, by, sm);
      } else {
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
      }
    } else if (s.id === 1) {
      if (isShipian()) {
        // 诗篇技能2：7 轮大子弹散射（缺失 10%~20%）；首轮必定慢速，其余随机 3 轮快速（弹速 ×1.4~1.7）
        s.roundT -= dt;
        if (s.roundT <= 0 && s.rounds < SONG_SHIP.s2.rounds) {
          s.roundT = SONG_SHIP.s2.roundGap;
          const round = s.rounds++;
          const missRate = rand(SONG_SHIP.s2.missMin, SONG_SHIP.s2.missMax);
          const base = Math.atan2(player.y - e.y, player.x - e.x);
          const fast = s.fastSet.has(round) ? rand(SONG_SHIP.s2.fastMin, SONG_SHIP.s2.fastMax) : 1;
          const n = 6;
          for (let k = 0; k < n; k++) {
            if (Math.random() < missRate) continue;   // 子弹随机缺失
            pushBossBullet(e.x, by, base + (k - (n - 1) / 2) * 0.16, 185 * sm * fast, { r: 13, dmg: BOSS.bigDmg, color: BOSS_BULLET.big });
          }
          shake(4, 0.2);
        }
      } else {
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
      }
    } else if (s.id === 2) {
      if (isShipian()) {
        // 诗篇技能3：lock 部位朝标记点（间隔 ×1.8）；track 部位始终瞄准玩家当前位置（间隔 ×1.4）
        for (const p of s.parts) {
          p.timer -= dt;
          if (p.timer <= 0 && p.shots < 3) {
            p.timer = 0.7 * (p.mode === 'lock' ? SONG_SHIP.s3.lockIntervalMul : SONG_SHIP.s3.trackIntervalMul);
            p.shots++;
            const px = e.x + p.dx, py = e.y + p.dy;
            const tx = p.mode === 'lock' ? s.mark.x : player.x;
            const ty = p.mode === 'lock' ? s.mark.y : player.y;
            const base = Math.atan2(ty - py, tx - px);
            for (let k = -1; k <= 1; k++) {
              pushBossBullet(px, py, base + k * 0.12, 270 * sm, { len: BOSS.longLen, dmg: BOSS.bulletDmg });
            }
          }
        }
      } else {
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
      }
    } else if (s.id === 3) {
      if (isShipian()) {
        // 诗篇技能4：≥70% 血——270° 双发同时乱射（各自独立随机角）；
        // <70% 血——360° 单发乱射 + 射速 ×3；且每 1~1.5s 向下扇形圆弹幕（8~10 发，
        // 弹速 = 乱射长条弹基准速度 ×(60%~90% 或 120%~150%)）
        const S4 = SONG_SHIP.s4;
        const low = (e.hp / e.maxHp) < 0.70;
        s.next -= dt;
        if (s.next <= 0) {
          s.next = low ? rand(0.133, 0.267) / S4.rateMul : rand(0.133, 0.267);
          if (low) {
            // 360° 单发乱射
            pushBossBullet(lx, by, rand(0, Math.PI * 2), rand(160, 300) * sm, { len: BOSS.longLen, dmg: BOSS.bulletDmg });
          } else {
            // 270° 双发同时（右上 45° → 下 → 左上 45°，避开正上方 90° 死角）
            for (let k = 0; k < 2; k++) {
              pushBossBullet(k ? rx : lx, by, rand(-Math.PI / 4, Math.PI * 1.25), rand(160, 300) * sm, { len: BOSS.longLen, dmg: BOSS.bulletDmg });
            }
          }
        }
        // 定时向下扇形圆弹幕
        s.fanT -= dt;
        if (s.fanT <= 0) {
          s.fanT = rand(S4.fanGapMin, S4.fanGapMax);
          const refSp = rand(160, 300) * sm;   // 乱射长条弹基准速度
          const mul = Math.random() < 0.5 ? rand(S4.fanSlowMin, S4.fanSlowMax) : rand(S4.fanFastMin, S4.fanFastMax);
          const n = S4.fanMin + Math.floor(Math.random() * (S4.fanMax - S4.fanMin + 1));   // 8~10 发
          const halfSpread = rand(0.55, 0.85);   // 扇形半张角（随机）
          for (let k = 0; k < n; k++) {
            const ang = Math.PI / 2 + (n === 1 ? 0 : ((k / (n - 1)) - 0.5) * 2 * halfSpread);
            pushBossBullet(e.x, by, ang, refSp * mul, { r: 5, dmg: BOSS.bulletDmg, color: BOSS_BULLET.long });
          }
          shake(3, 0.15);
        }
      } else {
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
    } else if (s.id === 4) {
      // 诗篇技能5：短暂聚能后，六发暗黑子弹瞄准玩家竖直近旁 ±10% 屏高带状区域的 6 个点（登场变体为全瞄准玩家，见 updateBoss）
      if (!s.fired && s.t >= SONG_SHIP.dark.preT) {
        s.fired = true;
        fireDarkSix(e, darkTargetsBand());
      }
    } else if (s.id === 5) {
      // 诗篇技能6：短暂聚能后，六发暗黑子弹射向两侧边界（左右对称，碰左右壁反弹）——
      // wall 模式：左右壁 [自身高度 - 20% 屏高, 屏幕底部]；bottom 模式：底部边缘左右半边
      if (!s.fired && s.t >= SONG_SHIP.dark.preT) {
        s.fired = true;
        fireDarkSix(e, darkTargetsBounds(e, s.mode));
      }
    }

    if (s.t >= s.dur) {
      // 到期清理：连携技能1 挂在 e.link 上，主技能挂在 e.skill 上
      if (e.link === s) e.link = null;
      else e.skill = null;
    }
  }

  export {
    spawnBoss, updateBossStorm, stormSkill5Pts, stormSkill5Mul, pushWaveMarks, startStormSkill,
    runStormSkill, strikeVis, knockbackPlayer, updateZoneMarks, stormWavePoint, stormWaveBand,
    pushBossBullet, updateBoss, startBossSkill, runBossSkill, updateBossLootMarks,
    updateBossStorm2, startStorm2Skill, runStorm2Skill, storm2Nozzle, storm2BallPos, spawnStorm2Ring, pickStorm2Aims, S2_STRIKE_R,
  };