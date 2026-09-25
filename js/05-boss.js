// 05-boss：旧日之歌 + 暴风之眼（状态机 / 技能 / 区域标记 / 涡流风旋 / 击退）

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：04-spawn(1 名) 06-enemy(2 名) 11-draw-boss(2 名) 14-main(2 名)
  // 本文件写共享状态（state/bossFlow/levelFlow 属性赋值；新增属性先在 02-core 归域声明）：
  //   state.{flash, stormVortex}
  //
  import { BOSS, BOSS_LOOT_BOTH, BOSS_LOOT_KIT, BOSS_LOOT_SHIELD, BOSSES, BOSS_BULLET, BULWARK, CANVAS_H, CANVAS_W, JIAOXIANG, PLAYER_CFG, SONG_SHIP, STORM, STORM2, STORM2_SHIP, STORM_SHIP, STORM_WIND, bossDmgMul, diffMods, isZhenwo, resolveBossHp } from './01-config.js';
  import { clamp, ctx, eBullets, enemies, pillarStrikes, player, rand, shake, spawnParticles, state, weightedPick, windFlows, zoneMarks } from './02-core.js';
  import { makeEnemy, spawnHarbinger } from './04-spawn.js';
  import { bulwarkActive, beamClipAgainstShield, damagePlayer } from './07-player.js';
  import { spawnPowerup } from './08-entities.js';
  import { achvNoteBossSpawned } from './02-achievements.js';

  // BOSS 技能释放间隔难度倍率（虚象：+50%，技能更稀疏）——覆盖三个 BOSS 的全部 skillCd 赋值点
  function bossSkillIv(base) { return base * (diffMods().bossFireIntervalMul != null ? diffMods().bossFireIntervalMul : 1); }


  // ---------- BOSS：旧日之歌 ----------
  function spawnBoss(id) {
    // 进入 BOSS 战：火力不足 Lv3 时补到 Lv3；并重置受击掉火力的累计计数（正常 / 挑战模式通用）
    if (player.weapon < 3) player.weapon = 3;
    player.hitCount = 0;
    const B = BOSSES[id] || BOSSES.song;
    achvNoteBossSpawned(B.id);   // 成就：登记当前 BOSS、开战计时与无伤标记（挑战 / 测试模式内部忽略）
    // 暴风之眼：第一阶段为白色龙卷风暴（风暴之风汇聚成旋涡入场）
    if (B.id === 'storm') {
      const hp = resolveBossHp(STORM);   // 分难度血量表（hpByDiff；旧配置回退 基准 × bossHpMul）
      enemies.push({
        type: 'boss', bossId: 'storm', name: B.name, lv: B.lv,
        x: CANVAS_W / 2, y: STORM.hoverY,
        w: STORM.w, h: STORM.h,
        hp, maxHp: hp,
        score: STORM.score,
        phase: 'gather',   // gather（风聚 2.7s）→ swirl（旋胀 2.3s）→ form（成形 1.0s）→ combat，总长 6.0s 与旧日之歌对齐
        phaseT: 0,
        scale: 0, combatReady: false,
        moveT: 0, t: 0, rot: 0,   // rot：风暴自转角（逆时针）
        skill: null, skillCd: bossSkillIv(0.2),   // 进战斗后 0.2s 即释放首个技能（必为技能6）
        lastSkill: -1, skillStreak: 0, dropBerserk: false,
      });
      shake(6, 0.6);
      return;
    }
    // 风暴编织者：暴风之眼消散后电闪雷鸣中现身（入场：轰然消散 → 雷暴轰鸣 → 现身 → 战斗）
    if (B.id === 'storm2') {
      const hp = resolveBossHp(STORM2);
      enemies.push({
        type: 'boss', bossId: 'storm2', name: B.name, lv: B.lv,
        x: CANVAS_W / 2, y: STORM2.hoverY,
        w: STORM2.w, h: STORM2.h,
        hp, maxHp: hp,
        score: STORM2.score,
        phase: 'entrance', phaseT: 0,
        bolts: [],             // 入场雷鸣：全屏闪电演出（11-draw-boss 绘制）
        barT: 0,               // 血条登场动画计时（仅 combat 阶段推进）
        hpTrail: hp,           // 血条残像：缓慢追赶 hp，形成受击白色余条
        scale: 0, combatReady: false,
        moveT: 0, t: 0, moveRate: 1,
        baseY: STORM2.hoverY,   // 航点扫动移动的纵向基准（停留点）
        wp: null, wpDir: 0, wpLimit: null,   // 航点状态：当前段目标 / 扫动方向(+1右 -1左) / 本轮折返点
        bvx: 0, bvy: 0, wpHold: false,   // 转向扫动速度向量 / 中线驻留标记（技能6 预约）
        skill: null, skillCd: bossSkillIv(1.0 * (isZhenwo() ? STORM2_SHIP.skillCdMul : 1)),   // 进战斗后 1.0s 释放首个技能（随机；间隔 = 暴风之眼的 75%，见 STORM2.skillCd；真我统一 ×1.4）
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
    const hp = resolveBossHp(BOSS);   // 分难度血量表（hpByDiff；旧配置回退 基准 × bossHpMul）
    enemies.push({
      type: 'boss', bossId: B.id, name: B.name, lv: B.lv,
      x: CANVAS_W / 2, y: BOSS.hoverY,
      w: BOSS.w, h: BOSS.h,
      hp, maxHp: hp,
      score: BOSS.score,
      phase: 'blackhole',    // blackhole → emerge → assemble → combat
      phaseT: 0,
      barT: 0,               // 血条登场动画计时（combat 阶段每帧累加）
      hpTrail: hp,           // 血条残像：缓慢追赶 hp，形成受击白色余条
      scale: 0, combatReady: false,
      moveT: 0, t: 0,
      baseY: BOSS.hoverY,   // 航点扫动移动的纵向基准（停留点）
      wp: null, wpDir: 0, wpLimit: null,   // 航点状态：当前段目标 / 扫动方向(+1右 -1左) / 本轮折返点
      bvx: 0, bvy: 0, wpHold: false,   // 转向扫动速度向量 / 中线驻留标记（技能6 预约）
      skill: null, skillCd: bossSkillIv(1.4 * (isZhenwo() ? SONG_SHIP.skillCdMul : 1)),   // 真我：技能间隔 ×0.4
      lastSkill: -1, skillStreak: 0, dropBerserk: false, summonHarbL: false, summonHarbR: false,
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

    // 真我：技能1（风波呼啸）脱离技能轮换，改为独立计时释放——每 10~16s 从随机一侧
    // 射入一轮 3~4 道风波（仅单轮）。独立于技能槽运行：不占用技能、不影响技能释放间隔
    if (isZhenwo()) {
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

  // 技能3（真我）：一轮同时布置两处风柱标记，两者位置至少相差 10% 屏宽
  function pushStormPillarPair() {
    const minSep = CANVAS_W * STORM_SHIP.s3.minSepF;
    const lo = STORM.pillarW / 2, hi = CANVAS_W - STORM.pillarW / 2;
    const x1 = rand(lo, hi);
    let x2 = rand(lo, hi);
    for (let tries = 0; tries < 50 && Math.abs(x2 - x1) < minSep; tries++) x2 = rand(lo, hi);
    if (Math.abs(x2 - x1) < minSep) x2 = clamp(x1 > CANVAS_W / 2 ? x1 - minSep : x1 + minSep, lo, hi);   // 兜底夹紧
    for (const x of [x1, x2]) {
      zoneMarks.push({ kind: 'pillar', x, t: 0, dur: STORM.warnTime });
    }
  }

  // 技能4（真我）：随机生成 2~3 个改变旋转方向的时刻——任意相邻两次间隔 ≥1s，且首次改变不晚于前 5s
  function stormS4ChangeTimes() {
    const cfg = STORM_SHIP.s4;
    const count = cfg.changesMin + Math.floor(Math.random() * (cfg.changesMax - cfg.changesMin + 1));
    for (let tries = 0; tries < 50; tries++) {
      const ts = [];
      for (let i = 0; i < count; i++) ts.push(rand(cfg.changeGap + 0.2, cfg.dur - 0.4));
      ts.sort((a, b) => a - b);
      let ok = ts[0] <= cfg.firstChangeBy;
      for (let i = 1; ok && i < ts.length; i++) { if (ts[i] - ts[i - 1] < cfg.changeGap) ok = false; }
      if (ok) return ts;
    }
    return [rand(1.2, cfg.firstChangeBy)];   // 兜底：采样 50 次仍未满足间隔约束（至少保证前 5s 内改变一次）
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
    if (!e.skillWeights) e.skillWeights = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 };
    if (!e.skillUseCount) e.skillUseCount = {};
    let id;
    if (e.lastSkill === -1) {
      // 暴风之眼第一次释放技能必定是技能6（三旋臂风条）
      id = 5;
    } else {
      // 技能2（大型龙卷）不可连续释放：上一技能为龙卷时将其移出候选
      let pool = [0, 1, 2, 3, 4, 5, 6, 7];
      // 真我：技能1 脱离技能轮换（独立计时释放，见 updateBossStorm）；技能8「双子旋臂」仅真我出场
      if (isZhenwo()) pool = pool.filter(x => x !== 0);
      else pool = pool.filter(x => x !== 7);
      if (e.lastSkill === 1) pool = pool.filter(x => x !== 1);
      // 全局规则：同一技能最多连续释放两次，禁止三连
      if (e.skillStreak >= 2) pool = pool.filter(x => x !== e.lastSkill);
      // 虚象：BOSS 不会连续释放两次同种技能——上一技能直接移出候选（repeat 恒 false）
      if (diffMods().bossNoRepeat) pool = pool.filter(x => x !== e.lastSkill);
      // 加权随机（全局机制：未释放过的技能权重更高）
      id = weightedPick(pool, e.skillWeights);
    }
    // 全局规则：连续随机到同一技能 → 技能间冷却 -80%
    const repeat = id === e.lastSkill;
    e.skillStreak = repeat ? e.skillStreak + 1 : 1;
    e.skillCd = bossSkillIv(repeat ? STORM.skillCd * 0.2 : STORM.skillCd);
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
        e.skillCd = bossSkillIv(STORM.skillCd * 0.25);
        break;
      }
      case 1:
        // 技能2：蓄力 0.7s 后向正前方（正下方）推出一个大型龙卷
        // （可击毁、缓慢下移直至脱离战场、随机 360° 快速射风弹，碰撞 32）
        e.skill = { id: 1, t: 0, dur: 1.1, charged: false, spMul };
        break;
      case 2:
        // 技能3：连续随机选定 5 处垂直风柱（每 0.32s 布置一处标记，各 1.3s 后落下，18 伤害 + 击退）
        // 真我：共 6 轮，每轮同时射出 2 个风柱（两者位置至少相差 10% 屏宽）；轮间隔固定 0.58s
        e.skill = { id: 2, t: 0,
          dur: isZhenwo() ? 0.15 + (STORM_SHIP.s3.rounds - 1) * STORM_SHIP.s3.gap + 0.57 : 2.0,
          count: 0, next: 0.15 };
        break;
      case 3:
        // 技能4：漩涡状弹幕（4 条臂），具象：前半程逆时针旋转、后半程顺时针旋转
        // 初始朝向完全随机（0~2π 任意角）：首轮子弹可能是「+」、「×」或任意中间朝向
        // 真我：总时长 9s；初始方向顺/逆时针随机，期间随机改变 2~3 次（间隔 ≥1s，首次不晚于前 5s）；
        //   旋转速度 +40%（20%+20% 加算）、风弹射速 +60%（30%+30% 加算）、风弹长度 +30%；
        //   持续期间自身获得 25% 减伤（见 08-entities enemyDamageMul）
        e.skill = isZhenwo()
          ? { id: 3, t: 0, dur: STORM_SHIP.s4.dur, fire: 0, armAng: Math.random() * Math.PI * 2,
              dir: Math.random() < 0.5 ? 1 : -1, changes: stormS4ChangeTimes(), ci: 0, spMul }
          : { id: 3, t: 0, dur: 4.6, fire: 0, armAng: Math.random() * Math.PI * 2, spMul };
        break;
      case 4: {
        // 技能5：两轮乱射风条 + 中心一枚瞄准玩家；每轮射击时长 +60%（发射更稀疏），
        // 第二轮开火时刻不变（旧版第一轮射完 1.19s + 0.9s 间隔 ≈ 2.09s）→ 两轮间隔缩短至约 0.3s
        // 真我：两轮风弹数量 14/11（第二轮开火时刻随首轮最后一发顺延，保持约 0.3s 轮间隔）
        const n1 = isZhenwo() ? STORM_SHIP.s5.counts[0] : 12;
        const n2 = isZhenwo() ? STORM_SHIP.s5.counts[1] : 9;
        e.skill = { id: 4, t: 0, dur: 4.2, pts: stormSkill5Pts(n1), round: 1,
          round2At: isZhenwo() ? 0.2 + (n1 - 1) * 0.144 + 0.3 : 0.2 + 11 * 0.09 + 0.9,
          centerFired: false, n2, spMul };
        break;
      }
      case 5: {
        // 技能6：三旋臂漩涡弹幕——随机顺时针/逆时针（全程不变），风条连射形成 3 条臂，转速随时间越来越快，持续 5s
        // 真我：追加一组镜像三旋臂——初始射击位置相反（相位差 π）、转向相反，转速与射击节奏与本体一致
        const s6 = { id: 5, t: 0, dur: 5, fire: 0, armAng: Math.random() * Math.PI * 2,
          dir: Math.random() < 0.5 ? 1 : -1, spin: 0.65, spMul };
        if (isZhenwo() && STORM_SHIP.s6.mirror) {
          s6.armAng2 = Math.PI - s6.armAng;   // 初始射向镜像（π − armAng）：配合转向相反，任意时刻两组旋臂关于竖直中轴镜像
          s6.fx1 = CANVAS_W * STORM_SHIP.s6.fx[0];   // 真我：本体三旋臂射击点移至屏宽 35% 处
          s6.fx2 = CANVAS_W * STORM_SHIP.s6.fx[1];   // 镜像三旋臂射击点移至屏宽 65% 处（与 35% 关于中轴镜像）
        }
        e.skill = s6;
        break;
      }
      case 6:
        // 技能7：涡流风旋——预警持续到飞抵，自转喷出浓白密集风条（玩家绕旋周旋），停射后快速消散
        e.skill = { id: 6, t: 0, dur: 7.3, spMul };
        break;
      case 7: {
        // 技能8「双子旋臂」（真我）：在距风暴中心 30%x~80%x（x = 风暴半径）环内随机取 2 点（间距 ≥70px），
        // 两点绕风暴中心旋转（公转角速度 0.3 rad/s，恒与风暴自转同向）；每点各 50% 概率发出三旋臂（技能6 具象版，
        // 最大转速/射击频率 -20%）或四旋臂（技能4 具象版，中途改变一次转向、最大转速/射击频率 -30%），持续 6s
        const cfg = STORM_SHIP.s8;
        const R = STORM.w / 2;
        const minSep = cfg.sep;
        const pickPt = () => ({ r: R * rand(cfg.rMinF, cfg.rMaxF), a: Math.random() * Math.PI * 2 });
        const q1 = pickPt();
        let q2 = pickPt();
        for (let tries = 0; tries < 60; tries++) {
          if (Math.hypot(q1.r * Math.cos(q1.a) - q2.r * Math.cos(q2.a),
              q1.r * Math.sin(q1.a) - q2.r * Math.sin(q2.a)) >= minSep) break;
          q2 = pickPt();
        }
        const mk = (q) => ({
          r: q.r, a: q.a,
          rev: 1,                                     // 公转方向恒与风暴自转同向（e.rot 递减 = 逆时针视觉，p.a 同步递减）
          mode: Math.random() < 0.5 ? 3 : 4,          // 三旋臂 / 四旋臂（各 50%）
          dir: Math.random() < 0.5 ? 1 : -1,          // 【旋臂自转】方向随机且两点独立
          armAng: Math.random() * Math.PI * 2,
          fire: 0, spin: 0,
          changeAt: null, changed: false,
        });
        const p1 = mk(q1), p2 = mk(q2);
        for (const p of [p1, p2]) {
          if (p.mode === 3) p.spin = cfg.triple.spin0;
          else p.changeAt = rand(cfg.quad.changeAtMin, cfg.quad.changeAtMax);
        }
        e.skill = { id: 7, t: 0, dur: cfg.dur, pts: [p1, p2], spMul };
        break;
      }
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
      // 技能3：连续布置风柱标记（具象：每 0.32s 一处，各 1.3s 后降下打击）
      // 真我：共 6 轮，每轮同时射出 2 个风柱（两者位置至少相差 10% 屏宽）；轮间隔固定 0.58s
      const rounds = isZhenwo() ? STORM_SHIP.s3.rounds : 5;
      s.next -= dt;
      while (s.next <= 0 && s.count < rounds) {
        s.next += isZhenwo() ? STORM_SHIP.s3.gap : 0.32;
        s.count++;
        if (isZhenwo()) pushStormPillarPair();
        else pushStormPillar();
      }
    } else if (s.id === 3) {
      // 技能4：4 条臂漩涡弹幕——具象：前半程逆时针、后半程顺时针；
      // 真我：初始方向随机，期间按预定时刻改变 2~3 次方向（首次不晚于前 5s，见 stormS4ChangeTimes）
      if (s.changes && s.ci < s.changes.length && s.t >= s.changes[s.ci]) {
        s.dir *= -1;
        s.ci++;
      }
      const dir = s.changes ? s.dir : (s.t < s.dur / 2 ? 1 : -1);
      // 真我：旋转速度 +40%（20%+20% 加算）、风弹射速 +60%（30%+30% 加算）、风弹长度 +30%
      const spinMul = s.changes ? STORM_SHIP.s4.spinMul : 1;
      const spdMul = s.changes ? STORM_SHIP.s4.speedMul : 1;
      const lenMul = s.changes ? STORM_SHIP.s4.lenMul : 1;
      // 转速随机浮动（全难度）：每 0.7~1.3s 重取 80%~120% 目标倍率，指数平滑逼近——连续变化、不跳变
      const fl = STORM.s4SpinFluct;
      if (s.spinCur == null) {
        s.spinCur = 1;
        s.spinTarget = rand(fl.min, fl.max);
        s.spinNext = rand(fl.retargetMin, fl.retargetMax);
      }
      s.spinNext -= dt;
      if (s.spinNext <= 0) {
        s.spinTarget = rand(fl.min, fl.max);
        s.spinNext = rand(fl.retargetMin, fl.retargetMax);
      }
      s.spinCur += (s.spinTarget - s.spinCur) * Math.min(1, dt * fl.smooth);
      s.armAng += dir * 1.6 * spinMul * s.spinCur * dt;
      s.fire -= dt;
      if (s.fire <= 0) {
        s.fire = 0.11;
        for (let k = 0; k < 4; k++) {
          // 风条：椭圆形长条弹，初速低沿飞行方向加速；最大弹速 583（较上版 +50%）、加速度 143.75/s
          // 宽度 r=5.6，刚射出时长度 12、随时间以 150px/s 长到全长 70（真我长度 ×1.3，生长速率同步放大）；伤害 18
          const ang = s.armAng + k * Math.PI / 2;
          pushBossBullet(e.x, e.y, ang, 56 * sm * spdMul,
            { r: 5.6, dmg: 18, color: STORM_WIND, len: 12 * lenMul, lenTarget: 70 * lenMul, growRate: 150 * lenMul, oval: true,
              accel: 143.75 * sm * spdMul, maxSpeed: 583 * sm * spdMul });
        }
      }
    } else if (s.id === 4) {
      // 技能5：两轮乱射（各 12/9 处风条 + 中心瞄准弹；真我 14/11）；每发风弹独立判定强化（15% +50% / 5% +100%）
      // 真我：普通风弹 20% 概率射速减慢 20%~50%（强化大风弹不受减速影响）
      let allFired = true;
      for (const p of s.pts) {
        p.delay -= dt;
        if (p.delay <= 0 && !p.fired) {
          p.fired = true;
          const ang = Math.PI / 2 + rand(-Math.PI / 6, Math.PI / 6);
          // 风条：初速低沿飞行方向加速至 874.5，长度 12 以 150px/s 长到 70，波动渲染；m 为强化倍率
          const m = stormSkill5Mul();
          const slow = (isZhenwo() && m === 1 && Math.random() < STORM_SHIP.s5.slowChance)
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
        const slow = (isZhenwo() && m === 1 && Math.random() < STORM_SHIP.s5.slowChance)
          ? rand(STORM_SHIP.s5.slowMin, STORM_SHIP.s5.slowMax) : 1;
        pushBossBullet(e.x, e.y, Math.atan2(player.y - e.y, player.x - e.x), 56 * sm * slow,
          { r: 5.6 * m, dmg: STORM.tornadoDmg * m, color: STORM_WIND, len: 12 * m, lenTarget: 70 * m, growRate: 150,
            oval: true, accel: 215.625 * sm * m * slow, maxSpeed: 874.5 * sm * m * slow });   // 中心弹同样参与强化判定
        spawnParticles(e.x, e.y, '#ffffff', 8, 140);
      }
      // 第二轮：开火时刻固定（round2At，具象 ≈ 2.09s / 真我随首轮最后一发顺延保持约 0.3s 轮间隔）——
      // 到点后重新随机点位进入第二轮（中心瞄准弹同样再来一枚）
      if (allFired && s.round === 1 && s.t >= s.round2At) {
        s.round = 2;
        s.pts = stormSkill5Pts(s.n2 || 9);
        s.centerFired = false;
      }
    } else if (s.id === 5) {
      // 技能6：3 条臂漩涡弹幕，方向固定（顺/逆时针随机），转速随时间越来越快
      // 角速度线性递增：初速 0.65 不变、斜率 0.617（原 0.7）→ 5s 末最大转速 4.15→3.735 rad/s（-10%），持续时长不变
      // 真我：同步追加一组镜像三旋臂（armAng2）——射击点 35% / 65% 屏宽、初始射向镜像（π − armAng）且转向相反，
      // 任意时刻两组旋臂关于竖直中轴精确镜像；转速与射击节奏与本体一致
      s.spin += 0.617 * dt;
      s.armAng += s.dir * s.spin * dt;
      if (s.armAng2 != null) s.armAng2 -= s.dir * s.spin * dt;
      s.fire -= dt;
      if (s.fire <= 0) {
        s.fire = 0.10;
        const x1 = s.fx1 ?? e.x, x2 = s.fx2 ?? e.x;   // 真我：40% / 60% 屏宽两处；具象均为风暴中心
        for (let k = 0; k < 3; k++) {
          // 风条（与技能4一致）：初速低、加速至 583、长度生长、波动渲染
          pushBossBullet(x1, e.y, s.armAng + k * Math.PI * 2 / 3, 56 * sm,
            { r: 5.6, dmg: STORM.tornadoDmg, color: STORM_WIND, len: 12, lenTarget: 70, growRate: 150,
              oval: true, accel: 143.75 * sm, maxSpeed: 583 * sm });
          if (s.armAng2 != null) {
            pushBossBullet(x2, e.y, s.armAng2 + k * Math.PI * 2 / 3, 56 * sm,
              { r: 5.6, dmg: STORM.tornadoDmg, color: STORM_WIND, len: 12, lenTarget: 70, growRate: 150,
                oval: true, accel: 143.75 * sm, maxSpeed: 583 * sm });
          }
        }
      }
    } else if (s.id === 6) {
      // 技能7：涡流风旋三阶段：预警（0.5s，原 1.1s 的 45%）→ 自机体飞抵（1.4s，easeInOut 速度曲线更流畅）
      // → 悬停自转喷风条（5s，白色缓慢变淡至 0.85，停射后 0.35s 快速消散）
      if (!state.stormVortex) {
        state.stormVortex = { x: e.x, y: e.y, tx: CANVAS_W / 2, ty: CANVAS_H * 0.80,
          r: CANVAS_W * 0.04, phase: 'warn', t: 0, ang: Math.random() * Math.PI * 2,
          dir: Math.random() < 0.5 ? 1 : -1, emit: 0,
          arms: isZhenwo() ? STORM_SHIP.s7.arms : 2 };   // 真我：三旋臂（具象双旋臂）
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
        // 自转由慢渐快（具象 1.1 → 2.625 rad/s；真我最大转速 2.3 rad/s，初速不变斜率收窄）
        const spinMax = isZhenwo() ? STORM_SHIP.s7.spinMax : 2.625;
        v.ang += v.dir * (1.1 + (v.t / 5) * (spinMax - 1.1)) * dt;
        v.emit -= dt;
        if (v.emit <= 0) {
          v.emit = 0.045;   // 密集喷射：每臂约 22 发/秒
          // 子弹呈旋臂状：同时射出沿圆周均布的 ARMS 发（具象 2 条旋臂相隔 180°；真我 3 条相隔 120°），
          // 随自转形成旋转风臂；加速度/最大速度 = 四旋臂（技能4）的 70%；长度 7.2→42（初始/最大长度均为标准风条的 60%）
          // 真我：风弹射速 +25%（初速/加速度/最大速度同步 ×1.25）
          const ARMS = v.arms || 2;
          const bMul = isZhenwo() ? STORM_SHIP.s7.bulletSpdMul : 1;
          for (let k = 0; k < ARMS; k++) {
            const ea = v.ang + k * Math.PI * 2 / ARMS;
            pushBossBullet(v.x + Math.cos(ea) * v.r, v.y + Math.sin(ea) * v.r, ea, 56 * sm * bMul,
              { r: 5.6, dmg: STORM.tornadoDmg, color: STORM_WIND, len: 7.2, lenTarget: 42, growRate: 150,
                oval: true, accel: 100.625 * sm * bMul, maxSpeed: 408.1 * sm * bMul });
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
        // src 'storm'：天秀忧郁王子暴风之眼伤害削减挂点；成就死因：就位前（fly 飞抵段）= vortexPre（哦呦）
        damagePlayer(STORM.vortexDmg * bossDmgMul(), 1, false, false, 'storm', v.phase === 'fly' ? 'vortexPre' : 'vortex');
      }
    } else if (s.id === 7) {
      // 技能8「双子旋臂」：两个环上弹幕点持续喷射旋臂风弹
      // 两点绕风暴中心旋转：公转角速度 0.3 rad/s（followSpin，恒与风暴自转同向——e.rot 递减 = 逆时针视觉）；
      // 【旋臂自转】方向随机且两点独立
      // 三旋臂 = 技能6 具象版（转速斜率/射击频率 -20%）；四旋臂 = 技能4 具象版（恒速/射击频率 -30%，中途改一次转向）
      const cfg = STORM_SHIP.s8;
      for (const p of s.pts) {
        p.a -= p.rev * cfg.followSpin * dt;
        const C = p.mode === 3 ? cfg.triple : cfg.quad;
        if (p.mode === 3) {
          p.spin += C.spinSlope * dt;
        } else {
          p.spin = C.spin;
          if (!p.changed && s.t >= p.changeAt) { p.dir *= -1; p.changed = true; }
        }
        p.armAng += p.dir * p.spin * dt;
        p.fire -= dt;
        if (p.fire <= 0) {
          p.fire = C.fireInt;
          const px = e.x + Math.cos(p.a) * p.r, py = e.y + Math.sin(p.a) * p.r;
          for (let k = 0; k < p.mode; k++) {
            const ea = p.armAng + k * Math.PI * 2 / p.mode;
            // 弹参数：三旋臂取技能6 具象口径（伤害 16）/ 四旋臂取技能4 具象口径（伤害 18），风条形态一致
            pushBossBullet(px, py, ea, 56 * sm,
              { r: 5.6, dmg: p.mode === 3 ? STORM.tornadoDmg : 18, color: STORM_WIND,
                len: 12, lenTarget: 70, growRate: 150, oval: true,
                accel: 143.75 * sm, maxSpeed: 583 * sm });
          }
          spawnParticles(px, py, '#ffffff', 3, 90);
        }
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
    // 命中带宽 = 预警/打击显示带宽（waveHalfW，不加班判定点半径）——杜绝"看着在带外却被判中"的体感偏差
    for (let i = windFlows.length - 1; i >= 0; i--) {
      const f = windFlows[i];
      f.t += dt;
      if (!f.hit && player.alive && strikeVis(f.t / f.dur, 0.18) >= 0.35) {
        const px = clamp(player.x, Math.min(f.x0, f.x0 + f.dirX * f.L), Math.max(f.x0, f.x0 + f.dirX * f.L));
        const c = stormWavePoint(f, px);
        if (Math.abs((player.y + PLAYER_CFG.hitOffsetY) - c.y) < STORM.waveHalfW) {
          f.hit = true;   // 无敌期间处于带内同样消耗本次判定：风波掠过，不结算也不补判——
          // （否则无敌结束时会被"迟到"的风波命中：出现时无敌跳过判定、静止玩家在无敌结束后被判中）
          if (player.invuln <= 0) {
            damagePlayer(STORM.windDmg * bossDmgMul(), 1, false, false, 'stormAoe');   // 瞬时区域打击：天秀 -50% / 可莉 -30% 挂点
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
            damagePlayer(STORM.pillarDmg * bossDmgMul(), 1, false, false, 'stormAoe');   // 瞬时区域打击：天秀 -50% / 可莉 -30% 挂点
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
      // 旋转弹（真我·旧日之歌技能1）：速度方向按 angVel 逐帧旋转，水平以上/以下角速度乘 spinUp/spinDown；
      // life 为寿命上限（旋转弹可能长期滞留场上）
      angVel: opts.angVel || 0,
      spinUp: opts.spinUp, spinDown: opts.spinDown,
      life: opts.life != null ? opts.life : null,
      lifeFade: opts.lifeFade != null ? opts.lifeFade : null,   // 寿命到期后的消散期时长（消散动画用，见 08-entities）
      bossRound: opts.bossRound || false,   // BOSS 圆形弹幕：白核→主色渐变渲染（见 10-draw-world）
      oval: opts.oval || false,  // 长条弹呈椭圆体（风条）
      lenTarget: opts.lenTarget || 0,   // 风条生长目标长度（>0 时从 len 起步随时间生长）
      growRate: opts.growRate || 0,     // 风条生长速率（px/s）
      r: opts.r != null ? opts.r : 3.5,
      len: opts.len || 0,        // >0 为长条弹（胶囊体判定）
      dmg: (opts.dmg != null ? opts.dmg : BOSS.bulletDmg) * bossDmgMul(),   // BOSS 弹幕伤害统一难度倍率（虚象 -40%）
      color: opts.color || BOSS_BULLET.long,
      streak: opts.streak || 0,    // 简化拖尾长度（px，沿速度方向渐隐线段；0 = 无。大子弹专用，见 10-draw-world）
      trail: opts.trail || null,   // 拖尾（轨迹残影系统，见 08-entities updateBullets；部件球弹幕 / 雷电子弹）
      swRef: opts.swRef || false,  // 三类·特殊射弹：白盾反弹属性（旧日之歌暗黑射弹；注册表见 01-config BULWARK 注释）
      bounceMax: opts.bounceMax != null ? opts.bounceMax : 0,   // 墙壁反弹次数上限（0 = 不限；技能6 暗黑子弹为 3）
      bounceN: 0,                // 已反弹次数（达到 bounceMax 后清除 bounceX，见 08-entities）
      // ---- 风暴编织者专用 ----
      bolt: opts.bolt || false,        // 雷电光束弹（锯齿电弧内芯渲染，见 10-draw-world）
      beamTrail: opts.beamTrail || false,   // 折线光束：记录头部轨迹，光束沿轨迹从 0 增长、转折自然弯折（技能3）
      bounceX: opts.bounceX || false,  // 触左右边界反弹（技能3）
      seed: opts.seed != null ? opts.seed : ((Math.random() * 1e9) | 0),   // 电弧闪频种子（渲染步进用）
      owner: opts.owner != null ? opts.owner : bossBulletOwner,   // 发射者归属（opts 显式指定优先，如大型龙卷；否则取 updateBoss 期间的 BOSS 标记）——天秀忧郁王子"来自暴风之眼的伤害"判定用
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
  //   技能1 电弧球蓄力激光：停止移动，中心电弧球明显预警蓄力 1.0s → 向下强力电弧激光（固定 60 伤害）
  //   技能2 四喷口激光：停止移动，喷口激涌蓄力 1.2s → 随机序依次向下电弧激光（50 伤害）；
  //         预警为四喷口各一圈收缩波，按发射顺序先后出现
  //   技能3 斜下反弹光束：四喷口向斜下（左右对称两角度）发射电弧光束，触左右边界反弹（弹道呈"<"）；
  //         弹速 ×1.8；释放后下一次技能释放间隔额外 ×0.3（-70%）
  //   技能4 蛇形雷条：能量球沿"先左后右、越摆越宽"的蛇形轨迹连续快速发射雷电长条弹；
  //         四喷口雷环始终释放（依次浮现，停留 1s 后爆开）；<70% 强化：增至 6 圈——随机两喷口生成第二次
  //   技能5 雷霆打击：周身雷电环演出，下方 30% 区域随机 5 处依次雷击（40 伤害，雷电积聚预警 1.2s，
  //         区域半径 = 焦香螺旋桨火环 JIAOXIANG.auraR；击中中心外扩一圈 14~20 枚雷电子弹）
  //   技能6 重现光束：四喷口沿臂方向直射光束出屏 → 光束于机体上方左右两点重现，每边每轮 2 条、恒定 3 轮
  //         （同边两束夹角 ≥15°，轮次间隔 1.5s；真我技能2 连携时仅 1 轮、时间轴 1.5s）；重现光束弹速 ×0.6；撞守愿者白盾被一次性咬合吃掉（盾移开不恢复）；
  //         技能本体 4.6s 收束，飞行光束存于 e.s6Beams 独立存活（不拖长技能间隔）
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
    // 现身扩散波计时：血条开始出现瞬间（电球缩没、进入战斗）放出，逐帧推进至结束
    if (e.revealRing) {
      e.revealRing.t += dt;
      if (e.revealRing.t >= e.revealRing.dur) e.revealRing = null;
    }

    // 入场演出（重制版）：轰然消散(0.9s) → 雷电风暴轰鸣(2.8s，中央电球凝聚+闪电持续) → 现身(0.7s，与雷暴尾段
    //   重叠：电球汇入机体) → 进入战斗。雷暴段延长至血条展开动画出现时机（combat 起点，总长 3.7s 不变）
    if (e.phase === 'entrance') {
      e.phaseT += dt;
      const p = e.phaseT;
      const EN = STORM2.entrance;
      // 机体显形：电球出现后不久（雷暴开始 0.3s 后）即开始 渐显 + 从小到大，
      //   生长窗口贯穿雷暴段与现身段（长渐显，突出"从风暴中钻出"）
      const growT = EN.dissipate + 0.3;
      const growEnd = EN.dissipate + EN.storm;   // combat / 血条展开动画时机（现身段与雷暴尾段重叠，不额外占时）
      const revealT = growEnd - EN.reveal;       // 现身段起点（雷暴尾段 0.7s 内）
      if (p < growT) e.scale = 0;
      else e.scale = 0.15 + 0.85 * (1 - Math.pow(1 - clamp((p - growT) / (growEnd - growT), 0, 1), 3));
      if (p < EN.dissipate) {
        // 暴风之眼轰然消散：白雾自中心向外爆发、双冲击波环外扩（绘制见 11-draw-boss），青白爆闪 + 震屏
        const dp = p / EN.dissipate;
        if (!e.entranceRings) {
          e.entranceRings = [
            { t: 0, dur: 0.75, r1: 26, r2: 300 },
            { t: 0.16, dur: 0.8, r1: 16, r2: 225 },
          ];
        }
        if (Math.random() < dt * 46) {
          const a = Math.random() * Math.PI * 2;
          const r0 = rand(8, 60) + 200 * dp;
          spawnParticles(e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0 * 0.72, '#eaf6ff', 3, 150);
          spawnParticles(e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0 * 0.72, '#ffffff', 2, 110);
        }
        state.flash = Math.max(state.flash, 0.38 - 0.28 * dp + 0.05 * Math.sin(p * 14));
        if (p < dt * 1.5) shake(7, 0.4);   // 消散瞬间的震屏（仅首帧触发；强度已调低）
      } else {
        // 雷电风暴轰鸣：中央雷暴（落雷更密、集中于机体上空区域，逐次震屏）+ 电弧球（energy-orb-sheet
        // 序列帧）自中心凝聚成形（easeOutCubic，见 11-draw-boss 电球绘制）——持续至 combat / 血条展开时机
        if (p < growEnd) {
          const sp = (p - EN.dissipate) / EN.storm;
          e.boltT = (e.boltT || 0) - dt;
          if (e.boltT <= 0) {
            e.boltT = rand(0.08, 0.16);
            e.bolts.push({
              x: clamp(e.x + rand(-130, 130), 40, CANVAS_W - 40),
              y: clamp(e.y + rand(-90, 140), 40, CANVAS_H * 0.7),
              t: 0, dur: 0.26, seed: (Math.random() * 1e9) | 0,
            });
            state.flash = Math.max(state.flash, 0.22);
            shake(2.5, 0.12);
            if (Math.random() < 0.6) spawnParticles(e.x + rand(-90, 90), e.y + rand(-50, 70), '#bfe6ff', 6, 170);
          }
          e.orbScale = 1 - Math.pow(1 - clamp(sp / 0.4, 0, 1), 3);   // 电球凝聚：前 40% 时长内成形
        }
        // 现身段（与雷暴尾段重叠）：电球骤亮收缩渐隐汇入机体（现身瞬间追加一道雷电冲击波——机身大落雷 + 外扩冲击环）
        // （机体缩放与渐显由上方统一的显形窗口驱动，贯穿雷暴段，无缩放起伏）
        if (p >= revealT && p < growEnd) {
          const rp = clamp((p - revealT) / EN.reveal, 0, 1);
          e.orbScale = (1 - rp) * (1 + 0.35 * Math.sin(rp * Math.PI));   // 先胀后收（覆盖凝聚值）
          e.orbFade = 1 - rp * rp;   // 渐隐汇入
          if (!e.revealFlashed) {
            e.revealFlashed = true;
            e.bolts.push({ x: e.x, y: e.y + 10, t: 0, dur: 0.32, seed: (Math.random() * 1e9) | 0 });   // 机身大落雷
            state.flash = Math.max(state.flash, 0.42);
            shake(7, 0.35);
            spawnParticles(e.x, e.y, '#bfe6ff', 24, 300);
          }
        }
        if (p >= growEnd) {
          // 就位：进入战斗——电球此刻恰好缩没、血条开始出现：放出扩散波（见 11-draw-boss 现身冲击波）
          e.phase = 'combat';
          e.phaseT = 0;
          e.scale = 1;
          e.combatReady = true;
          e.bolts = [];
          e.orbScale = 0;
          e.revealRing = { t: 0, dur: 0.55 };
          spawnParticles(e.x, e.y, '#bfe6ff', 26, 300);
          spawnParticles(e.x, e.y, '#eaf6ff', 16, 220);
          state.flash = Math.max(state.flash, 0.3);
          shake(9, 0.4);
        }
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
    // （真我：技能1 不再停移——连续移动射击，移速与常态一致、无额外加速修正）
    const wantFreeze = !!(e.skill && (e.skill.id === 1 || (e.skill.id === 0 && !isZhenwo())));
    if (e.moveRate == null) e.moveRate = 1;
    const rateAccel = wantFreeze ? 6 : 3;   // 减速加速度较大（≈0.17s 停稳），重新启动稍缓（≈0.33s 提速）
    if (wantFreeze) e.moveRate = Math.max(0, e.moveRate - rateAccel * dt);
    else e.moveRate = Math.min(1, e.moveRate + rateAccel * dt);
    // 航点扫动移动：moveRate 降档时期望速度上限随之归零（分轴转向曲线内平滑减速至停）
    if (e.skill && e.skill.id === 0 && e.s1LockY != null && e.wp) {
      // 技能1全程（蓄力+激光）：纵向锁定在起手高度、仅左右移动——激光竖直带随机体横向扫动，
      // 纵向漂移会让激光带高度变化、预警失真；覆盖航点 ty（含技能期间新取航点），换段照常
      e.wp.ty = e.s1LockY;
    }
    bossMoveUpdate(e, STORM2.move, dt, e.moveRate);

    if (e.skill) runStorm2Skill(e, e.skill, dt);
    else {
      // 玩家暴走：技能释放间隔额外减半（冷却计时 ×2 流逝）
      e.skillCd -= dt * (player.weapon === 5 ? 2 : 1);
      if (e.skillCd <= 0) startStorm2Skill(e);
    }
    if (e.s6Beams && e.s6Beams.length) updateS6Beams(e, dt);   // 技能6 重现光束（技能收束后继续存活）

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
    // 虚象：BOSS 不会连续释放两次同种技能——上一技能直接移出候选（repeat 恒 false）
    if (diffMods().bossNoRepeat) pool = pool.filter(x => x !== e.lastSkill);
    const id = weightedPick(pool, e.skillWeights);
    // 全局规则：连续随机到同一技能 → 技能间冷却 -80%
    const repeat = id === e.lastSkill;
    e.skillStreak = repeat ? e.skillStreak + 1 : 1;
    e.skillCd = bossSkillIv((repeat ? STORM2.skillCd * 0.2 : STORM2.skillCd) * (isZhenwo() ? STORM2_SHIP.skillCdMul : 1));   // 真我：技能间隔统一 ×1.4（+40%）
    e.lastSkill = id;
    const spMul = repeat ? 1.4 : 1.0;   // 连中同技能：弹速 ×1.4
    e.skillUseCount[id] = (e.skillUseCount[id] || 0) + 1;
    for (const k in e.skillWeights) {
      if (+k !== id && !e.skillUseCount[+k]) e.skillWeights[k] *= 1.5;
    }

    switch (id) {
      case 0:   // 技能1：电弧球蓄力 → 向下强力电弧激光；真我：移动中连续射出 5 次（预警跨发重叠，2~5 次预警圈与首发同规格）。
        //   起手锁定纵向高度（s1LockY）并清零纵向速度：激光竖直带随机体横向扫动——技能全程仅左右移动，纵向不飘
        e.s1LockY = e.y;
        e.bvy = 0;
        e.skill = isZhenwo()
          ? { id: 0, t: 0, dur: 1e9, zhenwo: true, shot: 0, st: 0, pt: 0, nextAt: 0, gap: 0, fired: false }
          : { id: 0, t: 0, dur: STORM2.s1Charge + STORM2.s1BeamDur, fired: false };
        break;
      case 1: { // 技能2：喷口激涌蓄力 1.2s → 随机序依次下射（间隔 0.13s）
        const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
        // 真我：50% 同时释放技能6（子状态随行推进；技能2收束时未放完则无缝转为独立技能6）——
        //   连携时蓄力延长至 1.6s（STORM2_SHIP.s2.charge），预警圈收缩时长对应 1.2s（ringDur，
        //   蓄力 0.2s 后开始收缩、完成后再过 0.2s 发射的结构不变 → 收缩速度变慢）；
        //   未连携则下一次技能释放间隔 ×0.4（-60%）
        const linked = isZhenwo() && Math.random() < STORM2_SHIP.s2.linkS6Chance;
        const charge = linked ? STORM2_SHIP.s2.charge : STORM2.s2Charge;
        e.skill = { id: 1, t: 0, dur: charge + 3 * STORM2.s2Gap + STORM2.s2BeamDur + 0.15,
          order, nextIdx: 0, nextT: charge, beams: [],
          charge, ringDur: linked ? STORM2_SHIP.s2.ringDur : STORM2.s2RingDur };
        if (isZhenwo()) {
          if (linked) {
            e.skill.s6 = { t: 0, armFired: false, pointsAt: false, ptT: 0, shot: 0, targets: null, linked: true };
          } else {
            e.skillCd *= STORM2_SHIP.s2.noLinkCdMul;
          }
        }
        break;
      }
      case 2:   // 技能3：四喷口斜下电弧光束（左右对称，左右边界反弹）；真我：连续快速两次（间隔 1~1.5s）
        e.skill = { id: 2, t: 0,
          dur: isZhenwo() ? 0.15 + rand(STORM2_SHIP.s3.secondMin, STORM2_SHIP.s3.secondMax) + 0.4 : 2.4,
          fired: false, second: false,
          secondAt: isZhenwo() ? 0.15 + rand(STORM2_SHIP.s3.secondMin, STORM2_SHIP.s3.secondMax) : Infinity,
          spMul };
        // 释放后下一次技能释放间隔修正：具象/虚象 ×0.3（-70%）；真我改为 ×1.3（+30%）
        e.skillCd *= isZhenwo() ? STORM2_SHIP.s3.afterCdMul : STORM2.s3CdMul;
        break;
      case 3: { // 技能4：能量球连射雷电长条弹（40~70 发、间隔 0.08s；70% 血以下持续 +50%）——瞄准点按蛇形曲线预采样
        const low = (e.hp / e.maxHp) < 0.70;
        const shots = Math.round((40 + Math.floor(Math.random() * 31)) * (low ? STORM2.s4LowShotsMul : 1));
        const pathT = (CANVAS_H - STORM2.hoverY - 60) / 168; // 蛇形路径竖直跨度（悬停带 → 近底部）
        const offs = [];
        for (let k = 1; k <= shots; k++) {
          const t = (k / shots) * pathT;
          offs.push({ dx: Math.sin(Math.PI + 5.6 * t) * (24 + 62 * t), dy: 168 * t });   // 先向左摆、振幅随时间增大；甩动速率 5.6（约 5 个来回）
        }
        // 雷环排程（具象：始终 4 圈、<70% 增至 6 圈，间隔 0.8~1.5s；真我：固定 8 圈、间隔 ×0.6）：
        //   硬性约束：所有雷环必须在蛇形雷条射完前全部爆开——生成时刻 ≤ 射完时刻 - 停留时长(1s)，
        //   随机排程超出deadline则整体等比压缩（射完后仍有兜底强爆，见 runStorm2Skill s.id===3）
        const ringCount = isZhenwo() ? STORM2_SHIP.s4.rings : 6;
        const ringGapBase = isZhenwo() ? STORM2_SHIP.s4.ringGapMul : 1;
        const ringNz = [0, 1, 2, 3];
        while (ringNz.length < ringCount) ringNz.push((Math.random() * 4) | 0);   // 真我：追加 4 圈随机喷口（可重复）
        const ringTimes = [0.15];
        for (let k = 1; k < ringNz.length; k++) ringTimes.push(ringTimes[k - 1] + rand(0.8, 1.5) * ringGapBase);
        const endTime = 0.1 + shots * 0.08;   // 最后一发蛇形雷条射出时刻
        const deadline = Math.max(0.2, endTime - 1.0);
        const lastRingT = ringTimes[ringNz.length - 1];
        if (lastRingT > deadline) {
          const k2 = (deadline - 0.15) / (lastRingT - 0.15);
          for (let k = 1; k < ringNz.length; k++) ringTimes[k] = 0.15 + (ringTimes[k] - 0.15) * k2;
        }
        e.skill = { id: 3, t: 0, dur: endTime + 1.6, shots, offs, fired: 0, next: 0.1, ringTimes, ringNz, ringsSpawned: 0, ringsFlushed: false, spMul };
        break;
      }
      case 4: { // 技能5：雷电光环 + 下方区域依次雷击（具象 30% 区域 / 真我 60%；各 1.2s 预警，错峰 0.9s / 真我 ×0.9）
        const gap5 = 0.9 * (isZhenwo() ? STORM2_SHIP.s5.volleyGapMul : 1);
        const strikes = pickS2StrikePoints(5).map((p, k) => ({ x: p.x, y: p.y, t: -k * gap5, fired: false, flash: 0 }));
        e.skill = { id: 4, t: 0, dur: STORM2.s5Warn + 4 * gap5 + 0.7, strikes };
        break;
      }
      case 5: { // 技能6：臂向光束 → 左右边界重现慢速飞行光束（每边每轮 2 条、恒定 3 轮；轮次间隔 1.5s；重现光束射速 ×0.6；自 0 增长）
        // 光束存于 e.s6Beams（BOSS 实体级）：技能本体 4.6s 收束，飞行中的光束独立存活至飞完/被盾吃完
        e.s6Beams = [];
        e.skill = { id: 5, t: 0, dur: 4.6, armFired: false, pointsAt: false, ptT: 0, shot: 0, targets: null, spMul };
        e.skillCd *= STORM2.s6CdMul;   // 释放后下一次技能释放间隔 -50%
        // 真我：释放瞬间四个雷电喷口处各触发一次雷霆打击——无预警、伤害减半、雷环子弹数减半
        if (isZhenwo()) {
          for (let i = 0; i < STORM2_SHIP.s6.instantStrikes; i++) {
            const nz = storm2Nozzle(e, i);
            fireS2Strike(nz.x, nz.y, STORM2_SHIP.s6.strikeDmgMul, STORM2_SHIP.s6.ringCntMul);
          }
        }
        break;
      }
    }
  }

  // 技能5 雷击区域半径：焦香螺旋桨火环的 80%（S5RMul）
  const S2_STRIKE_R = JIAOXIANG.auraR * STORM2.s5RMul;

  // 雷击落点抽样：n 处（具象：下方 30% 区域 / 真我：下方 60%，底边均留 40px）
  function pickS2StrikePoints(n) {
    const top = isZhenwo() ? STORM2_SHIP.s5.zoneTop : 0.70;
    const pts = [];
    for (let k = 0; k < n; k++) {
      pts.push({ x: rand(60, CANVAS_W - 60), y: rand(CANVAS_H * top, CANVAS_H - 40) });
    }
    return pts;
  }

  // 雷霆打击单次落雷（技能5 主释放与真我技能6 瞬发共用）：
  //   sm：连发弹速倍率；dmgMul：伤害倍率（真我瞬发 0.5）；cntMul：外扩雷环子弹数倍率（真我瞬发 0.5）
  function fireS2Strike(x, y, dmgMul, cntMul, sm = 1) {
    if (player.alive && player.invuln <= 0 && player.shield <= 0 &&
        Math.hypot(player.x - x, (player.y + PLAYER_CFG.hitOffsetY) - y) < S2_STRIKE_R) {
      damagePlayer(STORM2.s5Dmg * dmgMul * bossDmgMul(), 1, false, false, 'aoe');   // 雷霆轰击（瞬时区域伤害）：可莉 -30% 挂点
    }
    spawnStorm2Ring(x, y, 6, 0, sm, STORM2.s5RingDecelMul, 1, null, cntMul);
    spawnParticles(x, y, '#eaf6ff', 18, 260);
    spawnParticles(x, y, '#bfe6ff', 12, 200);   // 蓝点光（雷电轰击感，与爆闪演出叠加）
    shake(6, 0.25);
  }

  // 技能3 一轮齐射：场地正中四道斜下电弧光束（左右镜像对称，角度随机、触壁反弹）
  function fireS3Volley(e, sm) {
    const ox = CANVAS_W / 2, oy = e.y + 6;
    const C = STORM2.s3ConeHalf, minSep = STORM2.s3MinSep;
    const a1 = rand(0.12, C - minSep - 0.12);   // 内对半角
    const a2 = a1 + rand(minSep, C - a1);       // 外对半角（≤75°）
    for (const [side, off] of [[1, a2], [-1, a2], [1, a1], [-1, a1]]) {
      // side=+1 朝左下、-1 朝右下（角度相对竖直向下）；光束长度走 STORM2.s3Len（268.8，原 336 的 -20%），
      // 自头部轨迹从 0 增长而来（beamTrail），触壁转折时轨迹自然弯折而非整体转向
      pushBossBullet(ox, oy, Math.PI / 2 + side * off, 330 * STORM2.s3SpdMul * sm, {
        r: 6, dmg: STORM2.s3Dmg, len: STORM2.s3Len, color: '#9fd8ff', bolt: true, beamTrail: true, bounceX: true,
      });
    }
    spawnParticles(ox, oy, '#bfe6ff', 10, 150);
    shake(5, 0.22);
  }

  // 技能6 阶段逻辑（id 5 主释放 / 真我技能2 连携子状态共用）：p 携带 { t, armFired, pointsAt, ptT, shot, targets }；
  //   连携（p.linked）：臂向光束蓄力（延迟）与汇聚预警时长 ×1.5、臂向光束变淡（faint）、重现光束仅 1 轮；
  //   光束统一写入 e.s6Beams（BOSS 实体级，由 updateS6Beams 独立驱动推进/判定/绘制）
  function runS6Phase(e, p, sm, dt) {
    if (!e.s6Beams) e.s6Beams = [];
    const armAt = 0.30 * (p.linked ? 1.5 : 1);
    const warnDur = 0.30 * (p.linked ? 1.5 : 1);
    if (!p.warnDur) p.warnDur = warnDur;
    // 阶段1：四喷口沿臂方向直射电弧光束（超出屏幕，0.5s 演出，28 伤害；连携时延迟 ×1.5 且光束变淡）
    if (!p.armFired && p.t >= armAt) {
      p.armFired = true;
      for (let i = 0; i < 4; i++) {
        const nz = storm2Nozzle(e, i);
        e.s6Beams.push({ x: nz.x, y: nz.y, ang: nz.dir, t: 0, dur: 0.5, hit: false, faint: !!p.linked });
      }
      const ball = storm2BallPos(e);
      spawnParticles(ball.x, ball.y, '#bfe6ff', 12, 200);
      shake(6, 0.25);
    }
    // 阶段2：光束于左右边界重现（汇聚预兆，连携时 ×1.5），每边每轮 2 条（同边两束夹角 ≥15°）、恒定 3 轮（连携仅 1 轮，见下）：
    //   左右镜像对称；重现光束与臂向光束同长（640），以 ×0.48 初速发射、2s 内线性加速至 2 倍（≈0.96 基准）沿瞄准方向飞行，命中一次
    if (!p.pointsAt && p.t >= 0.95) {
      p.pointsAt = true;
      p.ptT = warnDur;
      p.shot = 0;
      const py0 = e.y - 26;
      p.targets = [pickStorm2Aims(py0), pickStorm2Aims(py0), pickStorm2Aims(py0)];   // 每轮各抽一对角度
    }
    //   连携（p.linked）仅 1 轮（STORM2_SHIP.s2.linkRounds），时间轴按 linkDur（1.5s）收束，不按 3 轮 4.6s 计
    const rounds = p.linked ? STORM2_SHIP.s2.linkRounds : 3;
    if (p.pointsAt && p.shot < rounds) {
      p.ptT -= dt;
      if (p.ptT <= 0) {
        p.ptT = 1.5;   // 两轮之间间隔 1.5s（预警 → 光束自 0 增长并飞抵 → 下一轮）
        const py = e.y - 26;
        const [a1, a2] = p.targets[p.shot];
        for (let side = 0; side < 2; side++) {
          const px = side === 0 ? 10 : CANVAS_W - 10;
          const sgn = side === 0 ? 1 : -1;
          for (const th of [a1, a2]) {
            const tx = px + sgn * Math.tan(th) * ((CANVAS_H + 60) - py);
            const dist = Math.hypot((CANVAS_H + 60) - py, tx - px);
            const ang = Math.atan2((CANVAS_H + 60) - py, tx - px);
            const v0 = dist / 1.0 * STORM2.s6ReplaySpdMul;   // 发射初速 ×0.48（-20%），2s 内线性加速至 2 倍
            // 飞行时长：分段积分 v(t)=v0(1+(m-1)t/T) 精确求尾端（+640 全长）飞出时刻（恒速公式会滞留）
            const m2 = STORM2.s6SpdRampMul, T2 = STORM2.s6SpdRampT;
            const sAll = dist + 640;
            const sAtT = v0 * T2 * (m2 + 1) / 2;   // 加速段结束时的行程
            const durT = sAll <= sAtT
              ? (Math.sqrt(T2 * T2 + 2 * (m2 - 1) * T2 * sAll / v0) - T2) / (m2 - 1)
              : T2 + (sAll - sAtT) / (v0 * m2);
            e.s6Beams.push({ x: px, y: py, ang, v0, fly: true, t: 0, dur: durT + 0.1, hit: false });
            spawnParticles(px, py, '#bfe6ff', 6, 130);
          }
        }
        p.shot++;
      }
    }
  }

  // 雷电子弹环（技能4 强化 / 技能5 打击外扩共用）：14~20 枚圆形雷电子弹（增大版 r=ringR，带短拖尾）
  //   hold>0：停留在生成位置（BOSS 移动也不跟随），hold 秒后向各自方向爆开；
  //   hold=0：生成即爆开（直接携带初速，不经停留逻辑）；
  //   爆开初速（同圈全部一致）：雷电长条弹速度（s4Spd×sm）的 60~80% 或 120~140% 随机取档，再乘 boost；
  //   减速下限 ringCruise 同乘 boost；decelMul：减速倍率（技能5 落雷外扩圈更快减慢）；
  //   tag：归属标记（技能4 传入技能状态对象，供"射完强爆"时识别本波雷环，见 runStorm2Skill s.id===3）
  function spawnStorm2Ring(cx, cy, rr, hold, sm = 1, decelMul = 1, boost = 1, tag = null, cntMul = 1) {
    const n = Math.max(4, Math.round((14 + Math.floor(Math.random() * 7)) * cntMul));   // 14~20 枚（真我瞬发 ×0.5 → 7~10）
    const mult = Math.random() < 0.5 ? rand(0.6, 0.8) : rand(1.2, 1.4);   // 本圈速度档（同圈一致）
    const v0 = STORM2.s4Spd * sm * mult * boost;
    const decelTo = STORM2.ringCruise * boost;
    for (let k = 0; k < n; k++) {
      const ba = (k / n) * Math.PI * 2 + Math.random() * 0.25;
      const base = {
        x: cx + Math.cos(ba) * rr, y: cy + Math.sin(ba) * rr,
        r: STORM2.ringR, dmg: STORM2.s4Dmg, color: '#9fd8ff',
        trail: true, trailCol: '159, 216, 255', trailLife: 0.16,   // 短拖尾（白蓝，0.16s）
        decelTo, decelRate: STORM2.ringDecel * decelMul, ringTag: tag,
      };
      if (hold > 0) {
        eBullets.push({ ...base, vx: 0, vy: 0, holdT: hold, burstAng: ba, v0 });
      } else {
        eBullets.push({ ...base, vx: Math.cos(ba) * v0, vy: Math.sin(ba) * v0, burstAng: ba, v0 });
      }
    }
    spawnParticles(cx, cy, '#bfe6ff', 8, 120);
  }

  // 技能6 落点抽样：每边每轮 2 条——左侧基准角 ∈ [minθ, maxθ-15°] 随机（θ 为发射点向底边的张角，
  //   范围对应底边 25%~100%），第二条 = 基准角 + rand(15°, maxθ-基准角)（同边两束夹角 ≥15°），右侧镜像对称
  function pickStorm2Aims(py) {
    const dy = (CANVAS_H + 60) - py;
    const maxTh = Math.atan((CANVAS_W - 20) / dy);
    const minTh = Math.atan(CANVAS_W * 0.25 / dy);
    const sep = STORM2.s6PairSep;
    const a1 = rand(minTh, Math.max(minTh, maxTh - sep - 0.02));
    const a2 = a1 + rand(sep, Math.max(sep, maxTh - a1));
    return [a1, a2];
  }

  function runStorm2Skill(e, s, dt) {
    s.t += dt;
    const sm = s.spMul || 1;
    const ball = storm2BallPos(e);

    if (s.id === 0) {
      if (s.zhenwo) {
        // 真我：移动中连续射出 5 次——预警在上一发射完前开始；射完随机 0.1~0.5s 后立刻射出下一发；
        //   第 2~5 次预警圈缩小（150）且预警时长缩短（0.55s，内含收缩 0.4s）
        const C1 = STORM2_SHIP.s1;
        if (s.st === 0) {
          s.pt += dt;
          const charge = s.shot === 0 ? STORM2.s1Charge : C1.charge2;
          if (s.pt >= charge) {
            s.st = 1; s.pt = 0;
            if (s.shot < C1.shots - 1) {
              s.gap = rand(C1.gapMin, C1.gapMax);
              s.nextAt = s.t + STORM2.s1BeamDur + s.gap;   // 下一发开火时刻（绝对时间）
            }
          }
        } else {
          s.pt += dt;
          // 激光竖直带：固定 60 伤害；机体移动中射击（激光随能量球横向扫动）
          if (player.alive && player.invuln <= 0 && player.shield <= 0 &&
              strikeVis(s.pt / STORM2.s1BeamDur, 0.12) >= 0.35 &&
              Math.abs(player.x - ball.x) < STORM2.s1R + PLAYER_CFG.hitRadius &&
              player.y + PLAYER_CFG.hitOffsetY > ball.y) {
            damagePlayer(STORM2.s1Dmg * bossDmgMul(), 1, false, false, null, 'laser:storm2');   // 成就死因：极光陨落
          }
          if (s.pt >= STORM2.s1BeamDur) {
            s.shot++;
            if (s.shot >= C1.shots) {
              s.dur = s.t;   // 5 发全部射完：立即收束（移速加成随后快速衰减）
            } else {
              s.st = 0;
              s.pt = s.t - (s.nextAt - C1.charge2);   // 预警在上一次发射期间已提前开始（pt 允许为负）
            }
          }
        }
      } else if (!s.fired) {
        // 技能1：蓄力（电弧球预警演出见 11-draw-boss）→ 向下强力电弧激光
        if (s.t >= STORM2.s1Charge) {
          s.fired = true;
          spawnParticles(ball.x, ball.y, '#bfe6ff', 22, 260);
          shake(8, 0.4);
        }
      } else {
        // 激光竖直带：固定 60 伤害（× bossDmgMul，虚象 -40%）——不再复用导弹规则
        // 四类·免疫射弹：守愿者白盾对其无任何影响——不截断、不吸收、无伤害损失（注册表见 01-config BULWARK 注释）
        const life = s.t - STORM2.s1Charge;
        const beamLen = CANVAS_H - ball.y + 30;
        const py = player.y + PLAYER_CFG.hitOffsetY;
        if (player.alive && player.invuln <= 0 && player.shield <= 0 &&
            strikeVis(life / STORM2.s1BeamDur, 0.12) >= 0.35 &&
            Math.abs(player.x - ball.x) < STORM2.s1R + PLAYER_CFG.hitRadius &&
            py > ball.y && py < ball.y + beamLen) {
          damagePlayer(STORM2.s1Dmg * bossDmgMul(), 1, false, false, null, 'laser:storm2');   // 成就死因：极光陨落
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
        // 四类·免疫射弹：守愿者白盾对其无任何影响——不截断、不吸收、无伤害损失（注册表见 01-config BULWARK 注释）
        const fullLen = CANVAS_H - b.y + 30;
        if (!b.hit && b.t >= 0.05 && player.alive && player.invuln <= 0 && player.shield <= 0 &&
            strikeVis(b.t / b.dur, 0.10) >= 0.35) {
          const py = player.y + PLAYER_CFG.hitOffsetY;
          if (Math.abs(player.x - b.x) < STORM2.s2R + PLAYER_CFG.hitRadius && py > b.y && py < b.y + fullLen) {
            b.hit = true;
            damagePlayer(STORM2.s2Dmg * bossDmgMul());
          }
        }
      }
      // 真我：连携的技能6 子状态随行推进（光束直接进 e.s6Beams；技能2收束时未放完则无缝转为独立技能6）
      if (s.s6) {
        s.s6.t += dt;
        runS6Phase(e, s.s6, sm, dt);
      }
    } else if (s.id === 2) {
      // 技能3：仅在场地正中释放四道斜下电弧光束（左右镜像对称，触左右边界反弹，弹道呈"<"折线，25 伤害）；
      // 真我：连续快速两次（间隔 1~1.5s，第二轮重新随机角度）
      if (!s.fired && s.t >= 0.15) {
        s.fired = true;
        fireS3Volley(e, sm);
      }
      if (isZhenwo() && !s.second && s.t >= s.secondAt) {
        s.second = true;
        fireS3Volley(e, sm);
      }
    } else if (s.id === 3) {
      // 技能4：能量球连射雷电长条弹（40~70 发、间隔 0.08s）——每发均为直射弹、飞行中不扭动，
      //   仅朝向各不相同：按蛇形曲线（先左后右、越摆越宽）逐点采样瞄准方向，弹点集合整体呈现流线轨迹
      s.next -= dt;
      if (s.next <= 0 && s.fired < s.shots) {
        s.next = 0.08;
        const o = s.offs[s.fired];
        pushBossBullet(ball.x, ball.y, Math.atan2(o.dy, o.dx), STORM2.s4Spd * sm, {
          r: 4.6, dmg: STORM2.s4Dmg, len: 34, color: '#9fd8ff', bolt: true,
        });
        s.fired++;
      }
      // 四喷口雷环依次浮现（间隔 0.8~1.5s）——每圈停留在生成位置 1s 后爆开（BOSS 移动走子弹也不跟随）；
      //   第 5/6 圈为强化圈：到点时血量 <70% 才释放（否则跳过）；雷环带 ringTag 供射完强爆识别
      while (s.ringsSpawned < s.ringNz.length && s.t >= s.ringTimes[s.ringsSpawned]) {
        if (isZhenwo() || s.ringsSpawned < 4 || (e.hp / e.maxHp) < 0.70) {
          const nz = storm2Nozzle(e, s.ringNz[s.ringsSpawned]);
          spawnStorm2Ring(nz.x, nz.y, 24, 1.0, sm, 1, 1, s);
        }
        s.ringsSpawned++;
      }
      // 蛇形雷条射完：雷环收尾兜底——补齐本该生成而未生成的雷环（第 5/6 圈仍按血量门控），
      //   并让所有已生成未爆开的雷环立刻爆开；补齐/强爆的雷环初速与最终速度额外 +30%
      if (s.fired >= s.shots && !s.ringsFlushed) {
        s.ringsFlushed = true;
        while (s.ringsSpawned < s.ringNz.length) {
          if (isZhenwo() || s.ringsSpawned < 4 || (e.hp / e.maxHp) < 0.70) {
            const nz = storm2Nozzle(e, s.ringNz[s.ringsSpawned]);
            spawnStorm2Ring(nz.x, nz.y, 24, 0, sm, 1, STORM2.s4FlushBoost, s);
          }
          s.ringsSpawned++;
        }
        for (const b of eBullets) {
          if (b.ringTag === s && b.holdT > 0) {
            b.v0 *= STORM2.s4FlushBoost;
            b.decelTo *= STORM2.s4FlushBoost;
            b.holdT = 0;
            b.vx = Math.cos(b.burstAng) * b.v0;
            b.vy = Math.sin(b.burstAng) * b.v0;
          }
        }
      }
    } else if (s.id === 4) {
      // 技能5：雷电光环（演出见 11-draw-boss）+ 下方 30% 区域 5 处依次雷击：
      //   雷电积聚预警 1.2s → 落雷（区域 40 伤害）+ 中心外扩一圈雷电子弹
      for (const st of s.strikes) {
        st.t += dt;
        if (st.flash > 0) st.flash -= dt;   // 打击爆闪衰减（见 11-draw-boss 外扩渐隐演出）
        if (!st.fired && st.t >= STORM2.s5Warn) {
          st.fired = true;
          st.flash = 0.35;
          fireS2Strike(st.x, st.y, 1, 1, sm);   // 落雷（区域 40 伤害）+ 中心外扩一圈雷电子弹
        }
      }
    } else if (s.id === 5) {
      // 技能6 阶段逻辑（臂向光束 + 左右重现轮次，光束写入 e.s6Beams；推进判定由 updateS6Beams 驱动）
      runS6Phase(e, s, sm, dt);
    }

    if (s.t >= s.dur) {
      // 真我：技能2 连携的技能6 未放完——随技能2收束无缝转为独立技能6（保留时间轴与轮次进度，不重置冷却）；
      //   连携仅 1 轮（linkDur 1.5s < 技能2 自身时长 2.19s），正常随技能2收束即结束、不再转入独立技能6
      if (s.id === 1 && s.s6) {
        const ld = s.s6.linked ? STORM2_SHIP.s2.linkDur : 4.6;
        if (s.s6.t < ld) {
          e.skill = { id: 5, t: s.s6.t, dur: ld, armFired: true, pointsAt: s.s6.pointsAt,
            ptT: s.s6.ptT, shot: s.s6.shot, targets: s.s6.targets, spMul: s.spMul || 1,
            linked: true, warnDur: s.s6.warnDur, carried: true };
        } else {
          e.skill = null;
        }
      } else {
        e.skill = null;
      }
    }
  }

  // 技能6 光束推进与命中判定（独立于技能状态：技能 4.6s 收束后，飞行中的重现光束继续存活，
  //   直至飞完 / 被守愿者白盾吃完；臂向光束为原地闪现演出）
  function updateS6Beams(e, dt) {
      for (let i = e.s6Beams.length - 1; i >= 0; i--) {
        const b = e.s6Beams[i];
        b.t += dt;
        if (!b.frozen) b.len = Math.min(640, b.t / STORM2.s6GrowDur * 640);   // 自 0 增长至全长（增长速度已回调 +25%）；被咬合解除后定型冻结（见下）
        // 飞行速度：重现光束（v0）自发射初速起 s6SpdRampT 内线性加速至 s6SpdRampMul 倍；臂向光束不飞行
        const spd = b.v0 != null
          ? b.v0 * (1 + (STORM2.s6SpdRampMul - 1) * Math.min(1, b.t / STORM2.s6SpdRampT))
          : (b.v || 0);
        if (b.fly) { b.x += Math.cos(b.ang) * spd * dt; b.y += Math.sin(b.ang) * spd * dt; }
        if (b.t >= b.dur) { e.s6Beams.splice(i, 1); continue; }
        const ux0 = Math.cos(b.ang), uy0 = Math.sin(b.ang);
        // 守愿者白盾截断（逐帧动态咬合 + 定型）：盾在光束轴线上即截断于盾位（盾面迸火花）；
        //   盾移开后光束**定型**——长度冻结为最近被咬合的可见长度，此后不再增长
        //   （臂向光束成为定长残段；重现光束以定长飞完剩余行程）；
        //   重现光束尾端持续推进——盾仍挡在轴线上时，尾端越过盾面即整条被"吃完"（移除）；
        //   盾判定与其他射弹同一套白盾几何（pad = 光束半宽 s6R + 半盾厚，无额外收窄）。
        //   b.blocked 仅作逐帧状态（上一帧是否被咬合）：正向射线未命中且上一帧被咬合时，用反向射线检测
        //   盾是否仍在轴线上（尾端已越过盾面 → 吃完）；反向亦未命中 = 盾已移开 → 定型
        let effLen = b.len;
        let eaten = false;
        if (bulwarkActive()) {
          const shieldPad = STORM2.s6R + BULWARK.thickness / 2 * BULWARK.scale;
          const clip = beamClipAgainstShield(b.x, b.y, ux0, uy0, b.len, shieldPad)
            ?? (b.blocked ? beamClipAgainstShield(b.x, b.y, -ux0, -uy0, 2000, shieldPad, true) : null);
          if (clip) {
            b.blocked = true;
            const d = (clip.x - b.x) * ux0 + (clip.y - b.y) * uy0;   // 盾位沿轴投影（负 = 已越过尾端）
            effLen = clamp(d, 0, b.len);
            if (d < 0 || effLen <= 4) eaten = true;   // 尾端越过盾面：整条被吃完
            else {
              b.lastEff = effLen;   // 最近被咬合的可见长度（解除咬合时的定型长度）
              if (Math.random() < 0.6) spawnParticles(clip.x, clip.y, '#eaf6ff', 2, 90);
            }
          } else {
            if (b.blocked) {   // 盾移开：光束定型——冻结为最近被咬合的可见长度
              b.frozen = true;
              b.len = b.lastEff != null ? Math.min(b.len, b.lastEff) : b.len;
            }
            b.blocked = false;
          }
        } else if (b.blocked) {   // 盾源消失（守愿者阵亡 / 卸下）：同样定型
          b.blocked = false;
          b.frozen = true;
          b.len = b.lastEff != null ? Math.min(b.len, b.lastEff) : b.len;
        }
        if (eaten) { e.s6Beams.splice(i, 1); continue; }
        b.effLen = effLen;
        if (!b.hit && b.len >= 30 && player.alive && player.invuln <= 0 && player.shield <= 0) {
          const py2 = player.y + PLAYER_CFG.hitOffsetY;
          const tproj = clamp((player.x - b.x) * ux0 + (py2 - b.y) * uy0, 0, effLen);
          if (Math.hypot(player.x - (b.x + ux0 * tproj), py2 - (b.y + uy0 * tproj)) < STORM2.s6R + PLAYER_CFG.hitRadius) {
            b.hit = true;
            damagePlayer(STORM2.s6Dmg * bossDmgMul());
          }
        }
      }
  }

  // 暴风之眼"残影"：图鉴挑战 / BOSS 试炼直接挑战风暴编织者时，正常流程中本应存在的暴风之眼
  //   并未登场——此处放入一个正在消散的风暴之眼实体（dying：不攻击 / 不碰撞 / 不受击，见
  //   06-enemy updateEnemies dying 分支），0.9s 渐隐与二阶段登场的"轰然消散"冲击波环同步
  function spawnStormGhost() {
    enemies.push({
      type: 'boss', bossId: 'storm', name: '暴风之眼',
      x: CANVAS_W / 2, y: STORM.hoverY,
      w: STORM.w, h: STORM.h,
      hp: 1, maxHp: 1, score: 0,
      phase: 'combat', phaseT: 0, barT: 1,
      combatReady: false,   // 不参与碰撞判定（dying 分支也不会执行战斗逻辑）
      scale: 1, rot: Math.random() * Math.PI * 2, t: 0,
      dying: { t: 0, dur: STORM2.entrance.dissipate },
    });
  }

  // ---------- BOSS 航点扫动移动（旧日之歌 / 风暴编织者；暴风之眼巨大体型不走此系统，仅小幅漂移） ----------
  // 总体沿当前方向逐段横扫：每段朝新航点转向——X 沿扫动方向推进剩余距离的随机比例、
  // Y 在停留点上下带内随机取点，段速 / 段加速度逐段随机（无固定快慢节奏）。
  // 有限加速度转向（steering）：速度向量跨段延续，转弯走弧线、抵点不刹停——连贯无停顿；
  // 活动带与屏幕边界为软墙（位置钳制 + 速度阻尼反弹），扫动惯性冲出边界时平滑折返
  function bossSweepLimit(e, M, dir) {
    const xHalf = M.xHalf != null ? M.xHalf : e.w / 2;   // 横向软墙半宽：默认判定箱半宽，可按模型视觉覆盖（如编织者雷电臂）
    const margin = rand(M.edgeMin, M.edgeMax) * CANVAS_W;
    return dir > 0 ? CANVAS_W - xHalf - margin : xHalf + margin;
  }

  function bossPickWaypoint(e, M) {
    if (!e.wpDir) e.wpDir = Math.random() < 0.5 ? 1 : -1;
    if (e.wpLimit == null) e.wpLimit = bossSweepLimit(e, M, e.wpDir);
    const topY = Math.max(e.baseY - CANVAS_H * M.topPct, e.h / 2);   // 机体上缘不出屏
    const botY = e.baseY + CANVAS_H * M.botPct;
    const remain = (e.wpLimit - e.x) * e.wpDir;
    // 最小段距：≥ 2×最高速捕获半径 + 50（捕获点会吃掉段尾，保证换点后有足够巡航距离，
    // 避免高频换点让纵向目标频繁变向）；同时不低于全跨度的 30%
    const capMax = M.base * M.spdMax * M.spdMax / (2 * M.accelMul) * 0.6;
    const minLeg = Math.max(90, capMax * 2 + 50, (CANVAS_W - e.w) * 0.30);
    let tx, flip = false;
    const straight = remain * rand(M.legMin, M.legMax);
    if (remain <= Math.max(minLeg, (CANVAS_W - e.w) * M.turnFrac) || straight >= remain) {
      tx = e.wpLimit; flip = true;   // 接近折返点（或推进量吃满剩余）：本段直奔折返点并换向
    } else {
      tx = e.x + e.wpDir * Math.max(straight, minLeg);
    }
    e.wp = { tx, ty: rand(topY, botY), spd: M.base * rand(M.spdMin, M.spdMax), acc: M.base * M.accelMul * rand(0.75, 1.35), vSpdMul: M.vSpdMul, vAccMul: M.vAccMul };
    if (flip) {
      e.wpDir *= -1;
      e.wpLimit = bossSweepLimit(e, M, e.wpDir);   // 下一段朝对侧扫动（余量重新随机）
    }
  }

  // 分轴转向：单轴速度以 acc 向「朝坐标侧、大小 want」逼近（有限加速度）
  function bossSteerAxis(v, d, want, acc, dt) {
    const target = d > 1e-6 ? want : (d < -1e-6 ? -want : 0);   // 坐标已对齐：该轴减速归零
    const dv = target - v;
    const maxD = acc * dt;
    if (Math.abs(dv) <= maxD) return target;
    return v + (dv > 0 ? maxD : -maxD);
  }

  // 单步转向运动学（横 / 纵分轴）：两轴各自独立计算期望速度与加速度，综合成移动方向——
  //   横轴（主扫动轴）：巡航段**不启用制动上限**——恒速扫过捕获点、无到点减速脉冲（卡顿主因）；
  //     仅驻留（技能6 中线保持，holdBrake）时启用 √(2·a·|d|) 制动，静停于中心；
  //   纵轴（微调轴，段速 × vSpdMul / 加速度 × vAccMul）：制动上限常开——纵向缓入缓出目标高度、无过冲振荡。
  // 航点切换时两轴速度各自平滑过渡、不再整矢急转。实际移动与真我技能6 中线预约仿真共用同一公式
  function bossStepToward(u, dt) {
    const wp = u.wp;
    const dx = wp.tx - u.x, dy = wp.ty - u.y;
    const capX = u.holdBrake ? Math.sqrt(2 * wp.acc * Math.abs(dx)) : Infinity;
    u.bvx = bossSteerAxis(u.bvx || 0, dx, Math.min(u.want, capX), wp.acc, dt);
    u.bvy = bossSteerAxis(u.bvy || 0, dy, Math.min(u.want * wp.vSpdMul, Math.sqrt(2 * wp.acc * wp.vAccMul * Math.abs(dy))), wp.acc * wp.vAccMul, dt);
    u.x += u.bvx * dt;
    u.y += u.bvy * dt;
  }

  // mul：移速倍率（风暴编织者停移平滑 moveRate / 旧日之歌真我技能1 减速 s1MoveSlow；其余恒 1）。
  // 转向扫动：期望速度 = 段速 × mul，分轴逼近航点——速度跨段延续、转弯走弧线、抵点不刹停；
  // wpHold（技能6 中线驻留）时靠分轴制动上限自然减速、静停于航点
  function bossMoveUpdate(e, M, dt, mul) {
    if (!e.wp) bossPickWaypoint(e, M);
    const dist = Math.hypot(e.wp.tx - e.x, e.wp.ty - e.y);
    if (e.wpHold && dist < 0.5) {   // 驻留：已抵达航点（中线），静停等发射
      e.x = e.wp.tx; e.y = e.wp.ty; e.bvx = 0; e.bvy = 0;
      return;
    }
    e.want = e.wp.spd * mul;
    e.holdBrake = !!e.wpHold;   // 驻留时横轴启用制动上限（静停于中线）；巡航段恒速扫过捕获点
    bossStepToward(e, dt);
    // 活动带 / 屏幕软墙：位置钳制 + 速度阻尼反弹（扫动惯性冲出边界时平滑折返，不硬撞）
    const topY = Math.max(e.baseY - CANVAS_H * M.topPct, e.h / 2);
    const botY = e.baseY + CANVAS_H * M.botPct;
    if (e.y < topY) { e.y = topY; if (e.bvy < 0) e.bvy *= -0.3; }
    else if (e.y > botY) { e.y = botY; if (e.bvy > 0) e.bvy *= -0.3; }
    const xLo = M.xHalf != null ? M.xHalf : e.w / 2, xHi = CANVAS_W - xLo;
    if (e.x < xLo) { e.x = xLo; if (e.bvx < 0) e.bvx *= -0.3; }
    else if (e.x > xHi) { e.x = xHi; if (e.bvx > 0) e.bvx *= -0.3; }
    // 捕获航点（半径 = 当前速度制动距离 × 0.6：速度快提前转弯）→ 取下一段
    if (!e.wpHold) {
      const cap = Math.max(10, (e.bvx * e.bvx + e.bvy * e.bvy) / (2 * e.wp.acc) * 0.6);
      if (Math.hypot(e.wp.tx - e.x, e.wp.ty - e.y) <= cap) bossPickWaypoint(e, M);
    }
  }

  // 当前航点段抵达屏幕水平中线的剩余时长（s）；本段不穿中线返回 null。
  // 驻留模式（wpHold）逐步仿真：与实际运动同公式/同步长（分轴制动上限生效、无捕获换段），
  // 供真我技能6 预约时提前计算重组动画启动时机——发射恰在中心
  function bossTimeToCenterCross(e, M) {
    if (!e.wp) return null;
    const mid = CANVAS_W / 2;
    const dxC = e.x - mid;
    if (Math.abs(dxC) < 1e-3) return 0;   // 恰在中线上：立即启动（驻留即中心）
    if (dxC * (e.wp.tx - mid) > 0) return null;   // 与目标同侧：本段不穿中线
    const sim = { x: e.x, y: e.y, bvx: e.bvx || 0, bvy: e.bvy || 0, wp: e.wp, want: e.wp.spd, holdBrake: true };
    const dt = 1 / 60;   // 与游戏帧步长一致，仿真轨迹与实际逐帧重合
    for (let i = 1; i <= 600; i++) {   // 仿真上限 10s（防御性）
      bossStepToward(sim, dt);
      const d = Math.hypot(sim.wp.tx - sim.x, sim.wp.ty - sim.y);
      if (d < 0.5) return i * dt;   // 已驻留航点（即中线）
      if (dxC > 0 ? sim.x <= mid : sim.x >= mid) return i * dt;
    }
    return null;
  }

  // BOSS 弹幕归属标记（驾驶员伤害来源判定用）：updateBoss 推进期间置为当前 BOSS 实体，
  // pushBossBullet 生成的弹携带 owner —— 08-entities 命中判定据此识别"来自暴风之眼的弹幕"（天秀忧郁王子）
  let bossBulletOwner = null;

  function updateBoss(e, dt) {
    const prevOwner = bossBulletOwner;
    bossBulletOwner = e;
    try { updateBossBody(e, dt); }
    finally { bossBulletOwner = prevOwner; }   // 无论分支如何返回都恢复：避免污染同帧后续 pushBossBullet（如大型龙卷开火）的归属
  }

  function updateBossBody(e, dt) {
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
        e.skillCd = bossSkillIv(1.0 * (isZhenwo() ? SONG_SHIP.skillCdMul : 1));
        if (isZhenwo()) {
          // 真我：登场部件球弹幕改为技能5 的登场变体——六发暗黑子弹共同瞄准玩家当前位置
          // （视为释放一次技能5，但不走技能池、不触发技能1连携）
          fireDarkSix(e, Array.from({ length: 6 }, () => ({ x: player.x, y: player.y })));
          shake(10, 0.5);
        } else {
          // 六个部件球化作弹幕：从镶接位置沿“部件—机体中轴连线”方向向外射出（暗紫轨迹、20 伤害）
          // 同为三类·特殊射弹（swRef，与暗黑子弹同源）
          for (const pt of e.parts) {
            pushBossBullet(e.x + pt.tx, e.y + pt.ty, Math.atan2(pt.ty, pt.tx), 430,
              { r: 7, dmg: 20, color: '#c084fc', trail: '#7c3aed', swRef: true });
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

    // 技能1（主技能或连携技能1）：具象/虚象与连携技能1期间停止移动（停移期间清零速度，
    // 技能结束从静止平滑加速）；真我主技能1不再停顿——移速 ×s1MoveSlow（-75%），期望速度
    // 经转向加速度平滑过渡，无骤降/骤停（航点保持原样，技能结束从当前位置继续当前段）
    const s1Main = !!(e.skill && e.skill.id === 0);
    const s1Link = !!(e.link && e.link.id === 0);
    if (s1Link || (s1Main && !isZhenwo())) {
      e.bvx = 0; e.bvy = 0;
    } else {
      bossMoveUpdate(e, BOSS.move, dt, s1Main ? SONG_SHIP.s1MoveSlow : 1);
    }
    // 技能6 预约（deferDark）/施放期间驻留中线航点（wpHold），其余时段恢复正常换段
    if (e.deferDark == null && !(e.skill && e.skill.id === 5)) e.wpHold = false;

    if (e.skill) runBossSkill(e, e.skill, dt);
    else {
      e.skillCd -= dt;
      if (e.skillCd <= 0) startBossSkill(e);
    }
    // 真我连携：与主技能并行的技能1（由 startBossSkill 概率挂载）
    if (e.link) runBossSkill(e, e.link, dt);

    // 血量首次低于 70%：在屏幕最左侧召唤一个炮火先兆者（staticX 固定靠边、不巡航，避免被 BOSS 机体挡住）
    if (!e.summonHarbL && e.hp <= e.maxHp * 0.70) {
      e.summonHarbL = true;
      spawnHarbinger(40, { staticX: true });
    }
    // 血量首次低于 40%：在屏幕最右侧再召唤一位（镜像 70% 召唤；入场下降约 1s 就位后，
    // 行动逻辑与 70% 召唤的那台一致——staticX 自生成即生效，下降段无横向移动）
    if (!e.summonHarbR && e.hp <= e.maxHp * 0.40) {
      e.summonHarbR = true;
      spawnHarbinger(CANVAS_W - 40, { staticX: true });
    }

    // 血量 70%：掉落一个暴走道具（一次性）
    if (!e.dropBerserk && e.hp <= e.maxHp * 0.70) {
      e.dropBerserk = true;
      spawnPowerup(e.x, e.y + 50, 'berserk', 15);
    }
  }

  // ---------- 真我：旧日之歌技能改版辅助 ----------
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

  // 构建真我技能1：主释放（linked=false）享时长加成（≥70% 血 +25% / <70% 血 ×3）恒 4 条流；
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

  // 真我技能2：随机选定 3 个快速轮次（0 为首轮慢速，1~6 中取 3）
  function pickFastRounds() {
    const idx = [1, 2, 3, 4, 5, 6];
    const set = new Set();
    while (set.size < SONG_SHIP.s2.fastRounds) set.add(idx.splice(Math.floor(Math.random() * idx.length), 1)[0]);
    return set;
  }

  // 六个部件位射出暗黑子弹（登场部件球弹幕同源；技能5/6 与真我登场变体共用）
  // targets：与 e.parts 等长的目标数组——点目标 {x,y}（按指向取射向）或角度目标 {ang}（直接指定射向）；
  //   t.bounce 为 true 时子弹碰左右壁反弹（次数上限 dark.bounceMax）
  // 三类·特殊射弹（swRef）：可被守愿者白盾按入射角反弹一次，反弹后失去墙壁反弹能力（见 08-entities swRef 分支）
  function fireDarkSix(e, targets) {
    const D = SONG_SHIP.dark;
    e.parts.forEach((pt, k) => {
      const sx = e.x + pt.tx, sy = e.y + pt.ty, t = targets[k];
      const ang = t.ang != null ? t.ang : Math.atan2(t.y - sy, t.x - sx);
      pushBossBullet(sx, sy, ang, D.speed,
        { r: D.r, dmg: D.dmg, color: D.color, trail: D.trail, bounceX: !!t.bounce, bounceMax: t.bounce ? D.bounceMax : 0, swRef: true });
    });
    spawnParticles(e.x, e.y, '#c8b0ff', 14, 240);
    shake(6, 0.3);
  }

  // 技能5/6 重组动画数据：六球自机体四周随机角、半径 animR 处飞向各自镶接位。
  // 纯演出——末球在 animStagger*5+animDur=0.57s 内到位，早于 preT=0.6s 的发射时刻，不影响攻击间隔
  function buildPartsAnim() {
    const D = SONG_SHIP.dark;
    const out = [];
    for (let k = 0; k < 6; k++) {
      const ang = Math.random() * Math.PI * 2;
      out.push({
        sx: Math.cos(ang) * D.animR, sy: Math.sin(ang) * D.animR,
        t0: k * D.animStagger, dur: D.animDur,
      });
    }
    return out;
  }

  // 推进技能5/6 的六球重组动画：按各球进度插值 pt.x/pt.y（e.partsAnim 置位供 11-draw-boss 绘制飞行球）
  function runPartsAnim(e, s) {
    e.partsAnim = true;
    for (let k = 0; k < e.parts.length; k++) {
      const pt = e.parts[k], a = s.anim[k];
      const p = clamp((s.t - a.t0) / a.dur, 0, 1);
      const fe = 1 - Math.pow(1 - p, 3);   // easeOutCubic（与登场组装一致的手感）
      pt.x = a.sx + (pt.tx - a.sx) * fe;
      pt.y = a.sy + (pt.ty - a.sy) * fe;
    }
  }

  // 动画结束：圆球归位镶接位、清除动画标记
  function endPartsAnim(e) {
    e.partsAnim = false;
    for (const pt of e.parts) { pt.x = pt.tx; pt.y = pt.ty; }
  }

  // 技能5 目标点（整体重做，任意位置可释放）：六发全部锁定「玩家释放瞬间的竖直直线」（x = player.x 快照）。
  // 三组（翼 0/1 / 炮 2/3 / 甲 4/5——部件位左右成对）各取一个随机点、同组两颗共用：
  //   翼（中间一对）→ 玩家高度 ±10% 屏高；炮（下方一对）→ 玩家上方 10%~30% 屏高；
  //   甲（上方一对）→ 玩家下方 10%~30% 屏高——上下两对与中间对交错，轨迹于玩家竖直线附近交叉成笼
  function darkTargetsBand() {
    const D = SONG_SHIP.dark;
    const px = player.x, py = player.y;
    const out = [];
    const midY = py + CANVAS_H * rand(-D.s5MidBand, D.s5MidBand);          // 翼对：±10%
    const upY = py - CANVAS_H * rand(D.s5CrossMin, D.s5CrossMax);          // 炮对：上方 10%~30%
    const dnY = py + CANVAS_H * rand(D.s5CrossMin, D.s5CrossMax);          // 甲对：下方 10%~30%
    out.push({ x: px, y: midY }, { x: px, y: midY },
      { x: px, y: upY }, { x: px, y: upY },
      { x: px, y: dnY }, { x: px, y: dnY });
    return out;
  }

  // 技能6 射向：三组（翼/炮/甲 左右成对）各随机取偏角 θ ∈ ±75°（下方 150° 扇区），
  // 组内两颗关于竖直方向镜像（左 π/2−θ / 右 π/2+θ）——左右严格对称（修复此前六发独立随机的乱射观感）；
  // 全部可碰左右壁反弹（每颗最多 dark.bounceMax 次，超过后不再反弹、直飞出屏）
  function darkTargetsDown() {
    const D = SONG_SHIP.dark;
    const out = [];
    for (let g = 0; g < 3; g++) {
      const th = rand(-D.downSpread, D.downSpread);
      out.push({ ang: Math.PI / 2 - th, bounce: true });   // 左侧部件（偶数位：翼/炮/甲）
      out.push({ ang: Math.PI / 2 + th, bounce: true });   // 右侧部件（奇数位：镜像角）
    }
    return out;
  }

  // 真我技能1 运行体：双管长条弹连发（同具象）+ 旋转双曲线弹流（逐流按各自初始方向/角速度发射）
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
          { r: 4, dmg: C.arcDmg, color: BOSS_BULLET.arc, angVel: st.spin, spinUp: C.spinUpMul, spinDown: C.spinDownMul,
            life: C.life, lifeFade: C.fadeTime });
      }
    }
  }

  function startBossSkill(e, excludeId) {
    const ship = isZhenwo();
    // 全局机制：本局内从未释放过的技能，在其他技能被释放时权重 ×1.5（真我技能池 0~5）
    if (!e.skillWeights) e.skillWeights = ship ? { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 } : { 0: 1, 1: 1, 2: 1, 3: 1 };
    if (!e.skillUseCount) e.skillUseCount = {};
    let id;
    if (e.lastSkill === -1) {
      // 旧日之歌第一次释放技能必定是技能1
      id = 0;
    } else if (e.deferDark != null) {
      // 真我技能6 预约到点：释放此前顺延的技能（此刻机体已抵达/即将抵达中线航点——
      // 重组动画 0.6s 播完时恰在最中心发射；驻留期间机体停于中线，见 wpHold）
      id = e.deferDark;
      e.deferDark = null;
    } else {
      // 加权随机释放；同一技能最多连续释放两次，禁止三连
      let pool = ship ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3];
      if (excludeId != null) pool = pool.filter(x => x !== excludeId);   // 技能6 预约超时放弃后重抽：排除技能6
      if (e.skillStreak >= 2) pool = pool.filter(x => x !== e.lastSkill);
      // 虚象：BOSS 不会连续释放两次同种技能——上一技能直接移出候选（repeat 恒 false）
      if (diffMods().bossNoRepeat) pool = pool.filter(x => x !== e.lastSkill);
      id = weightedPick(pool, e.skillWeights);
      // 真我技能6 预约制：航点直指水平中线（保持当前高度纯横移），并提前计算重组动画的
      // 启动时机（skillCd = 抵达中线剩余时长 − preT）——重组动画 0.6s 播完时恰在最中心发射；
      // 抵达中线后驻留（wpHold），早到/准时皆精确居中。直线航程超出 centerDeferMax 则放弃
      // 预约、还原航点并改抽其余技能。
      // 技能5 已改为任意位置可释放（玩家竖直线三对交叉锁定），不参与预约、抽中即放
      if (id === 5 && e.wp) {
        const savedTx = e.wp.tx, savedTy = e.wp.ty;
        e.wp.tx = CANVAS_W / 2;
        e.wp.ty = e.y;
        let tCross = bossTimeToCenterCross(e, BOSS.move);
        if (tCross == null) tCross = 0;   // 恰在中线上：立即启动（驻留即中心）
        if (tCross - SONG_SHIP.dark.preT <= SONG_SHIP.centerDeferMax) {
          e.deferDark = id;
          e.skillCd = Math.max(0, tCross - SONG_SHIP.dark.preT);
          e.wpHold = true;
          return;   // 仅预约时机，不结算任何技能状态（lastSkill / streak / 权重原样）
        }
        e.wp.tx = savedTx; e.wp.ty = savedTy;   // 放弃预约：还原航点
        pool = pool.filter(x => x !== id);
        id = weightedPick(pool, e.skillWeights);
      }
    }
    // 全局规则：连续随机到同一技能 → 技能间冷却 -80%，且本次技能弹速 +60%
    const repeat = id === e.lastSkill;
    e.skillStreak = repeat ? e.skillStreak + 1 : 1;   // 连续释放同技能的次数（上限 2）
    e.skillCd = bossSkillIv(repeat ? BOSS.skillCd * 0.2 : BOSS.skillCd);
    // 血量 <50%：技能释放间隔额外降低 50%
    if (e.hp / e.maxHp < 0.5) e.skillCd *= 0.5;
    // 真我：技能释放间隔 = 原有的 40%
    if (ship) e.skillCd *= SONG_SHIP.skillCdMul;
    e.lastSkill = id;
    const spMul = repeat ? 1.6 : 1.0;   // 连中同技能：本次弹速 ×1.6
    // 全局机制结算：记录本次使用，其他从未释放过的技能权重 ×1.5
    e.skillUseCount[id] = (e.skillUseCount[id] || 0) + 1;
    for (const k in e.skillWeights) {
      if (+k !== id && !e.skillUseCount[+k]) e.skillWeights[k] *= 1.5;
    }

    switch (id) {
      case 0:   // 技能1：双管长条弹连发 + 双曲线弹流。真我：恒 4 条旋转弧线流（时长 +25% / <70% 血 ×3）
        e.skill = ship ? buildSongSkill1(e, false)
          : { id: 0, t: 0, dur: 1.0, fire: 0, alt: 0, curveT: 0, spMul };
        break;
      case 1:   // 技能2：大子弹散射。真我：7 轮（缺失 10%~20%），首轮慢速、随机 3 轮快速（×1.4~1.7）
        e.skill = ship
          ? { id: 1, t: 0, dur: SONG_SHIP.s2.roundGap * SONG_SHIP.s2.rounds + 0.2, roundT: 0, rounds: 0, spMul, fastSet: pickFastRounds() }
          : { id: 1, t: 0, dur: 2.0, roundT: 0, rounds: 0, spMul };
        break;
      case 2: { // 技能3：四部位三连发。真我：2 部位锁定标记 + 2 部位持续追踪玩家（随机分配）；
        //        每轮射击间隔 0.9~1.3s 四部位独立随机（见 SONG_SHIP.s3）；所有瞄准部位带 ±10° 瞄准偏移
        const parts = [];
        const modes = ship ? ['lock', 'lock', 'track', 'track'].sort(() => Math.random() - 0.5) : null;
        for (let k = 0; k < 4; k++) {
          parts.push({ dx: rand(-0.42, 0.42) * e.w, dy: rand(-0.30, 0.30) * e.h, timer: 0.2 + k * 0.25, shots: 0, mode: modes ? modes[k] : null });
        }
        e.skill = { id: 2, t: 0, dur: ship ? 3.8 : 2.8, parts, mark: { x: player.x, y: player.y }, spMul };
        break;
      }
      case 3:   // 技能4：双管乱射。真我：≥70% 血 270° 双发同时；<70% 血 360° 单发 + 射速 ×3 + 定时向下扇形圆弹幕
        e.skill = ship
          ? { id: 3, t: 0, dur: 3.5, next: 0.1, fanT: rand(SONG_SHIP.s4.fanGapMin, SONG_SHIP.s4.fanGapMax), spMul }
          : { id: 3, t: 0, dur: 3.5, next: 0.1, spMul };
        break;
      case 4:   // 技能5（真我新增）：任意位置可释放（不要求居中）。六发暗黑子弹锁定「玩家释放瞬间的竖直直线」——
        //        三组（翼/炮/甲 左右成对）各取一个随机点、同组共用：翼对玩家高度 ±10% 屏高 / 炮对玩家上方
        //        10%~30% / 甲对玩家下方 10%~30%，上下交叉成笼。
        //        释放前先播六球重组动画（0~0.57s 内完成，preT=0.6s 准时发射；dur 含发射后 0.45s 恢复期，维持原节奏）
        e.skill = { id: 4, t: 0, dur: 1.05, fired: false, anim: buildPartsAnim() };
        break;
      case 5:   // 技能6（真我新增）：预约至中线过零前启动——三组暗黑子弹组内左右镜像（下方 150° 扇区随机偏角），
        //        碰左右壁反弹（每颗最多 3 次）；释放前播六球重组动画（发射后 0.65s 恢复期，维持原节奏）
        e.skill = { id: 5, t: 0, dur: 1.25, fired: false, anim: buildPartsAnim() };
        break;
    }
    // 真我连携：释放技能 2~6 时概率同时释放一次技能1——≥70% 血 20% / <70% 血 30% / <35% 血 50%
    // （连携不享时长加成；2 条流概率见 SONG_SHIP.s1.link）
    if (ship && id !== 0) {
      const L = SONG_SHIP.s1.link;
      const hpR = e.hp / e.maxHp;
      const ch = hpR < 0.35 ? L.chanceBelow35 : hpR < 0.70 ? L.chanceLowHp : L.chance;
      if (Math.random() < ch) e.link = buildSongSkill1(e, true);
    }
  }

  function runBossSkill(e, s, dt) {
    s.t += dt;
    const lx = e.x - e.w * 0.22, rx = e.x + e.w * 0.22;
    const by = e.y + e.h * 0.5;
    const sm = s.spMul || 1;   // 连中同技能时的弹速倍率（×1.6）

    if (s.id === 0) {
      if (isZhenwo()) {
        // 真我技能1：双管长条弹连发（同具象）+ 恒 4 条（连携可能 2 条）旋转双曲线弹流
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
      if (isZhenwo()) {
        // 真我技能2：7 轮大子弹散射（缺失 10%~20%）；首轮必定慢速，其余随机 3 轮快速（弹速 ×1.4~1.7）；
        // 每轮瞄准带 ±5° 偏移角
        s.roundT -= dt;
        if (s.roundT <= 0 && s.rounds < SONG_SHIP.s2.rounds) {
          s.roundT = SONG_SHIP.s2.roundGap;
          const round = s.rounds++;
          const missRate = rand(SONG_SHIP.s2.missMin, SONG_SHIP.s2.missMax);
          const base = Math.atan2(player.y - e.y, player.x - e.x) + rand(-SONG_SHIP.aimOffset, SONG_SHIP.aimOffset);
          const fast = s.fastSet.has(round) ? rand(SONG_SHIP.s2.fastMin, SONG_SHIP.s2.fastMax) : 1;
          const n = 6;
          for (let k = 0; k < n; k++) {
            if (Math.random() < missRate) continue;   // 子弹随机缺失
            pushBossBullet(e.x, by, base + (k - (n - 1) / 2) * 0.16, 185 * sm * fast,
              { r: 13, dmg: BOSS.bigDmg, color: BOSS_BULLET.big, streak: 39 });   // 大子弹拖尾长度（px，≈1.5× 直径——过短会被弹体辉光完全盖住）
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
            pushBossBullet(e.x, by, base + (k - (n - 1) / 2) * 0.16, 185 * sm,
              { r: 13, dmg: BOSS.bigDmg, color: BOSS_BULLET.big, streak: 39 });   // 大子弹拖尾长度（px，≈1.5× 直径——过短会被弹体辉光完全盖住）
          }
          shake(4, 0.2);
        }
      }
    } else if (s.id === 2) {
      if (isZhenwo()) {
        // 真我技能3：lock 部位朝标记点；track 部位始终瞄准玩家当前位置；
        // 每轮射击间隔 0.9~1.3s 四部位独立随机；所有瞄准均带 ±10° 偏移角
        for (const p of s.parts) {
          p.timer -= dt;
          if (p.timer <= 0 && p.shots < 3) {
            p.timer = rand(SONG_SHIP.s3.ivMin, SONG_SHIP.s3.ivMax);   // 部位独立随机间隔
            p.shots++;
            const px = e.x + p.dx, py = e.y + p.dy;
            const tx = p.mode === 'lock' ? s.mark.x : player.x;
            const ty = p.mode === 'lock' ? s.mark.y : player.y;
            const base = Math.atan2(ty - py, tx - px) + rand(-SONG_SHIP.aimOffset, SONG_SHIP.aimOffset);
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
      if (isZhenwo()) {
        // 真我技能4：以具象为基准（双管每轮各 1 发、10% 概率双管齐指玩家），获得以下修正——
        // ≥70% 血：270° 大范围散射 + 射速 +100%（间隔 ×0.5）；
        // <70% 血：360° 单发 + 射速 +200%（间隔 ÷3）+ 定时向下扇形圆弹幕（8~14 发，
        //   弹速 = 乱射长条弹基准速度 ×(60%~90% 或 120%~150%)，
        //   bossRound 标记 → 渲染走白核→主色径向渐变，与长条弹同色系不偏红）
        const S4 = SONG_SHIP.s4;
        const low = (e.hp / e.maxHp) < 0.70;
        s.next -= dt;
        if (s.next <= 0) {
          s.next = rand(0.133, 0.267) * (low ? 1 / 3 : 0.5);   // 具象基准间隔：射速 +200%（<70%）/ +100%（≥70%）
          const aim = Math.random() < 0.10;
          for (const bx of [lx, rx]) {   // 双管每轮各 1 发（同具象基准）
            const ang = aim
              ? Math.atan2(player.y - by, player.x - bx)
              : (low ? rand(0, Math.PI * 2) : rand(-Math.PI / 4, Math.PI * 1.25));   // <70%：360°；≥70%：270°（右上 45° → 下 → 左上 45°，避开正上方 90° 死角）
            pushBossBullet(bx, by, ang, rand(160, 300) * sm, { len: BOSS.longLen, dmg: BOSS.bulletDmg });
          }
        }
        // 定时向下扇形圆弹幕（仅 <70% 血阶段）
        if (low) {
          s.fanT -= dt;
          if (s.fanT <= 0) {
            s.fanT = rand(S4.fanGapMin, S4.fanGapMax);
            const refSp = rand(160, 300) * sm;   // 乱射长条弹基准速度
            const mul = Math.random() < 0.5 ? rand(S4.fanSlowMin, S4.fanSlowMax) : rand(S4.fanFastMin, S4.fanFastMax);
            const n = S4.fanMin + Math.floor(Math.random() * (S4.fanMax - S4.fanMin + 1));   // 8~14 发
            const halfSpread = rand(0.55, 0.85);   // 扇形半张角（随机）
            for (let k = 0; k < n; k++) {
              const ang = Math.PI / 2 + (n === 1 ? 0 : ((k / (n - 1)) - 0.5) * 2 * halfSpread);
              pushBossBullet(e.x, by, ang, refSp * mul, { r: 5, dmg: BOSS.bulletDmg, color: BOSS_BULLET.long, bossRound: true });
            }
            shake(3, 0.15);
          }
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
      // 真我技能5：先播六球重组动画（纯演出，末球 0.225s 内到位），到 preT 时刻准时发射——
      // 六发暗黑子弹锁定「玩家释放瞬间的竖直直线」：翼对 ±10% / 炮对上方 10%~30% / 甲对下方 10%~30%
      // （登场变体为全瞄准玩家，见 updateBoss）
      if (!s.fired) {
        runPartsAnim(e, s);
        if (s.t >= SONG_SHIP.dark.preT) {
          s.fired = true;
          endPartsAnim(e);
          fireDarkSix(e, darkTargetsBand());
        }
      }
    } else if (s.id === 5) {
      // 真我技能6：重组动画后准时发射——三组暗黑子弹组内左右镜像（下方 150° 扇区随机偏角），
      // 碰左右壁反弹（每颗最多 3 次，超过后不再反弹、直飞出屏）
      if (!s.fired) {
        runPartsAnim(e, s);
        if (s.t >= SONG_SHIP.dark.preT) {
          s.fired = true;
          endPartsAnim(e);
          fireDarkSix(e, darkTargetsDown());
        }
      }
    }

    if (s.t >= s.dur) {
      // 到期清理：连携技能1 挂在 e.link 上，主技能挂在 e.skill 上
      if (e.link === s) e.link = null;
      else e.skill = null;
    }
  }

  export {
    spawnBoss, spawnStormGhost, updateBossStorm, stormSkill5Pts, stormSkill5Mul, pushWaveMarks, startStormSkill,
    runStormSkill, strikeVis, knockbackPlayer, updateZoneMarks, stormWavePoint, stormWaveBand,
    pushBossBullet, updateBoss, startBossSkill, runBossSkill, updateBossLootMarks,
    updateBossStorm2, startStorm2Skill, runStorm2Skill, storm2Nozzle, storm2BallPos, spawnStorm2Ring, pickStorm2Aims, S2_STRIKE_R,
  };