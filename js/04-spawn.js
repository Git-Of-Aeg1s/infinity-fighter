  // 2类变体出现权重：按关卡分档直接取值（Lv1~10 / Lv11~20，与「数值与机制图鉴-怪物权重」单一数据源同步）

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：05-boss(4 名) 06-enemy(8 名) 07-player(3 名) 08-entities(1 名) 13-encyclopedia(14 名) 14-main(15 名)
  // 本文件写共享状态（state/bossFlow/levelFlow 属性赋值；新增属性先在 02-core 归域声明）：
  //   levelFlow.{poemWaveIdx, waveSeq, hpKitWaveCd}  bossFlow.{stage, warnT}
  //
  import { CANVAS_H, CANVAS_W } from './01-config-core.js';
  import { PLAYER_CFG, currentArmor } from './01-config-loadout.js';
  import { ANVIL, DUSK, ELITES, ENEMY_TYPES, FASHI_A1, FASHI_A2, FASHI_ARRAY, FASHI_MATRIX, HANSHUANG, HARBINGER, JIAOXIANG, PHASE_CHANCE, PHASE_DURATION, POPIAN, POPIAN_U, PULSE_MATRIX, SIDE_BEHAVIOR_COLORS, SIDE_KAMIKAZE_SCORE, SIDE_MOON, SIDE_SPAWN_W, SIDE_SCORE, SIDE_SHOOT_HP, SIDE_SPEED_FAST, SIDE_SPEED_SLOW, SIDE_SWIRL, STRIKER_FORTRESS, UNREAL, VARIANTS, WAR_GHOST, WEILONG, YU4 } from './01-config-enemies.js';
  import { BOSS_SPAWN_EARLY, BOSS_WARN_TOTAL, STORM_SHIP } from './01-config-boss.js';
  import { eliteHpOf, isPoem, isRealme, poemHpOf, TEST_HP, WAVE_POEM, diffMods, strikerHoldMul, strikerNoHoldSpdMul } from './01-config-difficulty.js';
  import { ELITE_REVIVE, PRESSURE_W } from './01-config.js';
  import { bossFlow, clamp, enemies, frostZones, levelFlow, player, rand, shake, state } from './02-core.js';
  import { startAlarm, stopAlarm } from './03-audio.js';
  import { spawnBoss, spawnStormGhost } from './05-boss.js';
  import { clearMissiles } from './06-enemy.js';
  import { clearEnemyBullets } from './07-player.js';
  import { collectAllItems } from './08-entities.js';

  // 返回 [{ id, w }]，w 为原始权重（pickVariant 内按总和归一）——与「数值与机制图鉴」共用
  const STRIKER_VARIANT_TIERS = {
    low:  { crimson: 30, amber: 30, azure: 25, violet: 25, white: 20, fortress: 25, dusk: 2 },   // Lv1~10
    high: { crimson: 10, amber: 10, azure: 10, violet: 10, white: 5, fortress: 10, dusk: 5 },    // Lv11~20
  };
  function strikerVariantWeights(lv) {
    const tier = lv < 11 ? STRIKER_VARIANT_TIERS.low : STRIKER_VARIANT_TIERS.high;
    return VARIANTS.striker.map(v => ({ id: v.id, w: tier[v.id] }));
  }

  // 非BOSS敌人首攻延迟的难度加成（虚象：初始攻击间隔 +0.5~1.8s）——
  // mods.enemyFirstFireAdd 为 [min, max] 秒区间（rand 取值）或固定秒数，0/缺省 = 不加；
  // 覆盖全部非BOSS敌人：makeEnemy 的 fireTimer 与不走 fireTimer 的状态机型（法术大师A1/A2 的 firstAt、破片的 atkT）
  function firstFireAdd() {
    const a = diffMods().enemyFirstFireAdd;
    if (!a) return 0;
    return Array.isArray(a) ? rand(a[0], a[1]) : a;
  }

  // 按权重随机选取变体
  // 幽暮突击艇出现率（按分档权重表归一）：Lv11 前权重 2/107 ≈ 1.9%，Lv11 起权重 5/40 = 12.5%
  function pickVariant(type) {
    if (type === 'striker') {
      // 分档原始权重（Lv1~10 / Lv11~20），按总和归一后抽取
      const ws = strikerVariantWeights(levelFlow.level);
      const total = ws.reduce((s, it) => s + it.w, 0);
      let r = Math.random() * total;
      for (const it of ws) {
        r -= it.w;
        if (r <= 0) return VARIANTS.striker.find(v => v.id === it.id);
      }
      return VARIANTS.striker[0];
    }
    const list = VARIANTS[type];
    // 4类主力舰：变体权重按关卡分档（Lv1~10 wLow / Lv11~20 wHigh）
    const wk = type === 'capital' ? (levelFlow.level < 11 ? 'wLow' : 'wHigh') : 'weight';
    const total = list.reduce((s, v) => s + v[wk], 0);
    let r = Math.random() * total;
    for (const v of list) {
      r -= v[wk];
      if (r <= 0) return v;
    }
    return list[0];
  }


﻿// 04-spawn：敌机工厂 / 编队与波次 / 场面压力刷新 / 特殊敌人生成 / 图鉴挑战模式

  // ---------- 敌机 ----------
  /**
   * 创建敌机。behavior / variant.skill 决定移动 / 开火模式：
   *   side:     'pass'无攻击斜插 | 'shoot'追踪射击 | 'kamikaze'亡语垂直射击 | 'swirl'橙旋环绕弹（无亡语）
   *   striker:  变体技能 crimson/straight(直射±10°、首发+1s) | amber/spread(前方双弹) | azure/homing(追踪、首发+1s、概率虚化护盾) | white/silent(不开火、到位停 2s) | fortress(坚垒护卫艇：不开火、移速 60%、停留位置下移、受伤 -20%)
   *   gunship:  pattern 0扇形 / 1环形 / 2双连炮 循环
   *   capital:  pattern 0双臂螺旋 / 1九连扇形齐射 / 2环形爆发 循环
   */
  function makeEnemy(type, x, y, opts = {}) {
    const cfg = ENEMY_TYPES[type];
    const diff = diffMods();
    // 血量难度倍率（虚象：所有非BOSS怪物血量 -20%）；不再有关卡血量加成
    const hpMul = diff.enemyHpMul != null ? diff.enemyHpMul : 1;
    // 首次攻击延迟难度加成（虚象：所有非BOSS怪物初始攻击间隔 +0.5~1.8s，见 firstFireAdd）
    const ffa = firstFireAdd();
    // 2/3/4 类选取变体（不同颜色 + 不同技能）；opts.variant 可强制指定（图鉴挑战用）
    const variant = (type === 'striker' || type === 'gunship' || type === 'capital')
      ? (opts.variant ? (VARIANTS[type].find(v => v.id === opts.variant) || pickVariant(type)) : pickVariant(type))
      : null;
    // 初次发射延迟：优先取调用方 fireTimer；否则用变体专属首射（如炮艇三变体），再回落 cfg.firstFire / fireInterval（变体 iv 优先）
    const firstFire = (variant && variant.firstFire) || cfg.firstFire;
    const baseIv = (variant && variant.iv) || cfg.fireInterval;
    let initFire = opts.fireTimer != null ? opts.fireTimer
      : firstFire ? rand(firstFire[0], firstFire[1])
      : rand(baseIv[0], baseIv[1]);
    if (variant && variant.firstDelay) initFire += Array.isArray(variant.firstDelay) ? rand(variant.firstDelay[0], variant.firstDelay[1]) : variant.firstDelay;
    initFire += ffa;
    const e = {
      type,
      x, y,
      w: cfg.w, h: cfg.h,
      hp: cfg.hp * hpMul,
      maxHp: cfg.hp * hpMul,
      vx: 0, vy: 0,
      // 1类依行为上色（pass/shoot/kamikaze）；2/3/4类依变体上色；其余用默认色
      color: type === 'side'
        ? (SIDE_BEHAVIOR_COLORS[opts.behavior] || cfg.color)
        : (variant ? variant.color : cfg.color),
      variant: variant ? variant.id : null,
      skill: variant ? variant.skill : null,
      phase: 0,          // >0 时虚化：不受伤害，炮弹穿过、可打到后面的敌人
      shielded: false,   // 蓝色4类：是否带护盾
      score: cfg.score,
      wobble: opts.wobble != null ? opts.wobble : Math.random() * Math.PI * 2,   // 通用入口：可传入固定相位（当前无人使用）
      behavior: opts.behavior || 'pass',
      hoverY: opts.hoverY || 0,
      arrived: false,
      // striker 未显式给停留时长时的默认档（5~6s ×诗篇倍率）：应对日后单独刷新的场合；其余类型 0
      holdTimer: opts.holdTimer != null ? opts.holdTimer
        : (type === 'striker' ? rand(5, 6) * strikerHoldMul() : 0),
      vNoHold: !!opts.vNoHold,             // 「2*7」无停留直通：越过前锋停留线后平滑衰减到入位速度 × vNoHoldSpdMul
      vNoHoldSpdMul: opts.vNoHoldSpdMul,   // 速度保留比例（基准 0.8 / 诗篇 0.6，取值见 strikerNoHoldSpdMul）
      speedMul: opts.speedMul != null ? opts.speedMul : 1,   // 移动/下落速度倍率（特殊编队用）
      speedMulBase: opts.speedMul != null ? opts.speedMul : 1,   // speedMul 出生基准（每帧重算用：寒冷区域减速乘回，见 updateEnemies）
      staticX: opts.staticX || false,   // 悬停期间固定水平位置、不左右巡航（BOSS 召唤的先兆者用）
      fireTimer: initFire,
      pattern: 0,
      burst: null,       // 多发连射状态（螺旋 / 双连炮）
      burstTimer: 0,
      scheduled: [],     // 定时子射击队列（{ t, fn }）：双侧弹幕 / 多轮齐射 / 第二波等
      deathShot: opts.deathShot || false,
      escortTimer: 0,    // 仅 capital：周期召唤护航
      leaving: false,        // 停留结束后停止攻击、以进场速度前开走
      chargeT: 0,            // 仅 harbinger：红/灰充能循环计时
      chargeWave: 0,         // 仅 harbinger：充能波序号（0=首波 1.5s红+3s灰；≥1=后续波 2s红+1s复位+1.5s灰）
      firedThisCycle: false, // 仅 harbinger：本轮是否已召唤导弹
      missilesGuided: 0,     // 仅 harbinger：已导引导弹数（上限 5）
    };
    // 变体血量覆盖（炮艇三变体独立血量 350/350/400 覆盖注册表基准；幽暮的血量在其后单独处理）
    if (variant && variant.hp != null) e.hp = e.maxHp = variant.hp * hpMul;
    // 变体专属攻击间隔（烈橙 1.4~2.4s）：首射后经 updateEnemyFire 使用
    if (variant && variant.iv) e.fireIv = variant.iv;
    // 1类行为数值修正：黄芒（shoot）血量 10；分数 白影/增生/黄芒/赤月 50、紫电（kamikaze）/橙旋（swirl）80
    if (type === 'side') {
      if (e.behavior === 'shoot') e.hp = e.maxHp = SIDE_SHOOT_HP * hpMul;
      e.score = (e.behavior === 'kamikaze' || e.behavior === 'swirl') ? SIDE_KAMIKAZE_SCORE : SIDE_SCORE;
    } else if (type === 'prolifera') {
      e.score = SIDE_SCORE;
    }
    // 真我：暴风之眼技能2 召唤的大型龙卷血量 6000（具象基准 3600）
    if (type === 'tornado' && isRealme()) e.hp = e.maxHp = STORM_SHIP.s2.hp;
    // 2类变体移动数据：入位速度 / 冲锋基准（冲锋 = charge + (关卡-1)×5）与前锋停留线（y 200~240 逐架随机；
    // 2*7 经 opts.holdY 传入"全波统一基准 − 出生偏移"的差异化值 → 行程相等、同时到位、阵型保持；幽暮走独立状态机不适用）
    if (type === 'striker' && variant) {
      if (variant.entry != null) e.entrySpd = variant.entry;
      if (variant.charge != null) e.chargeBase = variant.charge;
      if (variant.id !== 'dusk') e.holdY = opts.holdY != null ? opts.holdY : rand(200, 240);
      // 坚垒护卫艇（fortress）：停留位置较前锋停留线整体下移 48px（更靠下、贴近玩家；
      // 「2*7」等统一 holdY 波次同样生效——阵型内若全为坚垒则按同值平移、阵型保持）
      if (variant.id === 'fortress' && e.holdY != null) e.holdY += STRIKER_FORTRESS.holdYOffset;
    }
    // 蓝色4类(capital azure)：出现时 20% 概率带护盾，前 5s 虚化不会受伤
    if (type === 'capital' && variant && variant.id === 'azure' && Math.random() < PHASE_CHANCE) {
      e.shielded = true;
      e.phase = PHASE_DURATION;
    }
    // 赤金主力舰(capital crgold)：旋转双环 ×2 —— 技能「金环扩散」每施放消耗一枚，全场最多两次
    if (type === 'capital' && variant && variant.id === 'crgold') {
      e.ringsLeft = 2;
      e.ringT = 0;        // 双环显现计时（机翼展开完成后渐显）
      e.crgoldHold = 0;   // 技能3 停移倒计时
    }
    // 幽蓝2类(striker azure)：登场 10% 概率 1s 虚化护盾、10% 概率 2s 虚化护盾（复用 e.phase 通用虚化机制）
    if (type === 'striker' && variant && variant.id === 'azure') {
      const sr = Math.random();
      if (sr < 0.10) { e.shielded = true; e.phase = 1; }
      else if (sr < 0.20) { e.shielded = true; e.phase = 2; }
    }
    // 幽蓝(azure) / 霜白(silent) 的停留时长额外修正已取消：与普通 2类一致（走编队统一值）
    // 幽暮2类(striker dusk)：生命值 64；忽略编队入场点，改为在落点（场地 30%~80% 高度随机位置）正上方浮现，
    // 渐显后下移落点停驻、环射、渐隐离场 —— 状态机见 updateEnemyMovement 的 dusk 分支
    if (type === 'striker' && variant && variant.id === 'dusk') {
      e.hp = e.maxHp = DUSK.hp * hpMul;
      e.duskTY = rand(CANVAS_H * 0.30, CANVAS_H * 0.80);   // 落点高度（从上往下 30%~80%）
      e.x = rand(60, CANVAS_W - 60);                        // 落点水平位置（随机）
      e.y = e.duskTY - DUSK.shift;                          // 浮现点：落点正上方 shift 距离
      e.duskSY = e.y;
      e.duskPhase = 0;   // 0 渐显浮现 / 1 下移落点 / 2 瞄准停顿（末尾开火）/ 4 渐隐离场（发射一轮即走）
      e.duskT = 0;       // 当前阶段计时
      e.duskFade = 0;    // 当前透明度（浮现 0→1，离场 1→0，绘制时乘到 globalAlpha）
      e.duskN = 0;       // 环射弹数（开火时随机 6 或 8）
      e.duskBaseA = 0;   // 环射基准方向角（开火时随机）
    }
    // 黄色1类（shoot）：入场 1.2~2.8s 后首攻（每架独立随机），整场只攻击一次
    if (type === 'side' && e.behavior === 'shoot') {
      e.fireTimer = rand(1.2, 2.8);
    }
    // 赤月侧翼艇（红色 1类）：入场 1~2.5s 后随机时刻向顶角方向（航向正前方）发射一枚子弹，仅此一次；
    // 未发射即被击毁时另有 12% 概率亡语补射（见 killEnemy）
    if (type === 'side' && e.behavior === 'moon') {
      e.moonFireT = rand(SIDE_MOON.fireDelay[0], SIDE_MOON.fireDelay[1]);
      e.moonFired = false;
    }
    // 橙旋侧翼艇（橙色 1类）：入场 0.8~1.5s 后在自身周围生成一颗环绕弹（紫电亡语弹同款），无亡语（生成见 06-enemy）
    if (type === 'side' && e.behavior === 'swirl') {
      e.swirlT = rand(SIDE_SWIRL.delay[0], SIDE_SWIRL.delay[1]);
      e.swirlSpawned = false;
    }
    // 暴鸰 / 暴鸰·G / 虚幻（自爆无人机）：0 巡航下压 / 1 停车锁定（预警倒计时）/ 2 投弹后原地停留 / 3 继续俯冲
    if (type === 'baoling' || type === 'baolingG' || type === 'unreal') {
      e.blPhase = 0;
      e.blT = 0;           // 登场计时（armDelay 后才具备投弹判定）
      e.blThrown = false;  // 炸弹是否已脱离（未脱离时被击毁 → 原地爆炸）
      e.blWarn = null;     // 停车锁定阶段的预警区 { tx, ty, t }
      e.blWaitT = 0;       // 投弹后停留计时
    }
    // 斗志昂扬 / 赞助无人机 / 豪华赞助无人机（奖励无人机）：横向匀速穿越 + 余弦上下浮动；dirX/baseY/cosPhase 由 spawnDouzhi 按出场侧设定
    if (type === 'douzhi' || type === 'sponsor' || type === 'sponsorDeluxe') {
      e.dirX = 1;          // 横穿方向（1=左→右 / -1=右→左）
      e.baseY = y;         // 余弦轨迹基准高度
      e.cosPhase = 0;      // 上下浮动相位
    }
    // 3/4 类普通敌人：初始技能序号随机（释放队列任意起点起始）
    if (type === 'gunship' || type === 'capital') e.pattern = (Math.random() * 4) | 0;
    // 诗篇难度：全敌人血量按 POEM_HP 表绝对值覆盖（不经 enemyHpMul 乘区；4S 精英由黑暗之手血量派生、BOSS 走 hpByDiff.poem，不在此处理）
    if (isPoem()) {
      const ph = poemHpOf(type, variant ? variant.id : null, opts.behavior);
      if (ph != null) e.hp = e.maxHp = ph;
    }
    // 测试模式：敌方不再无敌 —— 非 BOSS 单位统一血量 20000（BOSS 保持注册表血量）；
    // 持续刷怪测试（swarm）除外——按注册表正常血量（2026-10-01）；置于诗篇血量之后以保证测试血量优先
    if (state.challenge && state.challenge.kind !== 'swarm' && type !== 'boss') {
      e.hp = e.maxHp = TEST_HP;
    }
    enemies.push(e);
    return e;
  }
  
  // 1类混合权重按关卡分档：Lv1~10 / Lv11~20 两档（SIDE_SPAWN_W，与「数值与机制图鉴」同步）
  function sideSpawnWeights(lv) { return lv < 11 ? SIDE_SPAWN_W.low : SIDE_SPAWN_W.high; }

  // 1类混合权重抽取：按关卡档位取权重（low：白影70/增生5/黄芒15/紫电5/橙旋5/赤月20；high：60/10/20/10/10/25）
  // exclude：排除特定类别（如 BOSS 后固定首波不含紫电与橙旋）
  function pickSideSpawn(exclude) {
    const W = sideSpawnWeights(levelFlow.level);
    let total = 0;
    const pool = [];
    for (const k in W) {
      if (exclude && exclude.includes(k)) continue;
      pool.push(k); total += W[k];
    }
    let r = Math.random() * total;
    for (const k of pool) { r -= W[k]; if (r <= 0) return k; }
    return pool[0];
  }

  // 1类两速体系：快速 200（SIDE_SPEED_FAST）/ 慢速 150（SIDE_SPEED_SLOW），方向取编队基值方向、模长归一。
  // 规则：顶部入场（232111 / 图鉴挑战顶部斜插）快速；侧翼入场（常规编队/长队/斜扫/紫自爆流）慢速；
  // BOSS 战期间（bossFlow.stage === 'fight'）不限入场位置一律快速；BOSS 后固定首波由调用方显式传 fast
  function sideVelocity(vx, vy, fast) {
    const spd = (fast || bossFlow.stage === 'fight') ? SIDE_SPEED_FAST : SIDE_SPEED_SLOW;
    const l = Math.hypot(vx, vy) || 1;
    return { vx: vx / l * spd, vy: vy / l * spd };
  }

  // 1类单位统一入口：kind 由 pickSideSpawn 按权重抽取（白影/增生/黄芒/紫电/橙旋/赤月），调用方也可强制指定（紫自爆流）；
  // fast：顶部入场 / BOSS 后固定首波等特殊波次传 true（BOSS 战期间的强制快速由 sideVelocity 内部判定）
  function spawnSideUnit(x, y, vel, kind, fireTimer, fast) {
    const e = kind === 'prolifera'
      ? makeEnemy('prolifera', x, y, { fireTimer })
      : makeEnemy('side', x, y, { behavior: kind, deathShot: kind === 'kamikaze', fireTimer });
    e._sideVel = sideVelocity(vel.vx, vel.vy, fast);
    return e;
  }

  // 1类：从场地中部略偏上的两侧斜插窜出，最少 3 个一组；编队形态随机（纵队/斜线/横排梯队/V字），一碰就碎
  // 侧翼入场 → 慢速 150：vx/vy 为方向基值（决定斜插角度，模长归一到两速体系）；整组同速以保持队形
  function spawnSideGroup() {
    const fromLeft = Math.random() < 0.5;
    const dirX = fromLeft ? 1 : -1;
    const n = 3 + Math.floor(Math.random() * 3);    // 3~5 架（最少三个一组）
    const vx = dirX * rand(90, 120);                // 方向基值：横快纵慢的斜插角
    const vy = rand(54, 84);
    const edgeX = fromLeft ? -36 : CANVAS_W + 36;   // 屏幕侧外入场
    const baseY = rand(CANVAS_H * 0.35, CANVAS_H * 0.45);   // 入场基准高度：场地中部略偏上（两侧窜出）
    const formation = Math.floor(Math.random() * 4); // 0 纵队 / 1 斜线 / 2 横排梯队 / 3 V 字
    const mid = (n - 1) / 2;
    for (let k = 0; k < n; k++) {
      let x, y;
      if (formation === 0) {
        // 纵队（排成队）：沿行进反方向排成一列，前后跟随
        x = edgeX - dirX * k * 50;
        y = baseY - k * 6;
      } else if (formation === 1) {
        // 斜线队：队尾依次靠外、靠上
        x = edgeX - dirX * k * 46;
        y = baseY - k * 30;
      } else if (formation === 2) {
        // 横排梯队：近乎并排、上下大幅错开
        x = edgeX - dirX * k * 18;
        y = baseY - k * 44;
      } else {
        // V 字/箭头：中间领先（顶点在最前），两侧沿竖直方向对称后掠张开——
        // 用有符号偏移让中心对称的两架分到上(-)/下(+)两臂，避免旧 |k-mid| 使二者 x、y 完全相同而像素级重叠
        const rel = k - mid;                 // 有符号：前半为负、后半为正
        const d = Math.abs(rel);             // 距中心档数（越大越靠后）
        const sgn = rel < 0 ? -1 : 1;        // 分到上(-)/下(+)两臂
        x = edgeX - dirX * d * 46;           // 沿行进反方向后掠
        y = baseY + sgn * d * 38;            // 两臂上下张开，形成 V/箭头
      }
      const r = Math.random();
      const behavior = pickSideSpawn();
      spawnSideUnit(x, y, { vx, vy }, behavior, rand(0.8, 1.6));
    }
  }
  
  // 2类「22」：从上方入场，波次统一停留 4~6s（诗篇 ×2）后向下冲锋（固定 2 架）
  function spawnStrikerGroup() {
    const n = 2;
    const vShape = Math.random() < 0.4;
    const gap = 72;
    const x0 = rand(70, CANVAS_W - 70 - (n - 1) * gap);
    const hold = rand(4, 6) * strikerHoldMul();   // 波次统一：本波两架停留完全一致
    for (let k = 0; k < n; k++) {
      const x = x0 + k * gap;
      const y = vShape ? -50 - Math.abs(k - (n - 1) / 2) * 40 : -50 - k * 16;
      if (rollFashiA1()) spawnFashiA1(x, y);
      else if (rollPopian()) spawnPopian(x, y);
      else if (rollFashiMatrix()) spawnFashiMatrix(x, y);
      else makeEnemy('striker', x, y, {
        behavior: Math.random() < 0.25 ? 'track' : 'straight',
        holdTimer: hold,
      });
    }
  }
  
  // 特殊编队「232232」：左右对称的 232232 横排（两个 3 稍慢）；2类波次统一停留 6~8s（诗篇 ×2）
  function spawnMirrorRow() {
    const seq = [2, 3, 2, 2, 3, 2];   // 回文对称
    const gap = 70;
    const x0 = (CANVAS_W - (seq.length - 1) * gap) / 2;
    const hold = rand(6, 8) * strikerHoldMul();   // 波次统一：本波 4 架 2类停留完全一致
    for (let k = 0; k < seq.length; k++) {
      const x = x0 + k * gap;
      if (seq[k] === 2) {
        if (rollFashiA1()) spawnFashiA1(x, -50);
        else if (rollPopian()) spawnPopian(x, -50);
        else if (rollFashiMatrix()) spawnFashiMatrix(x, -50);
        else makeEnemy('striker', x, -50, {
          behavior: Math.random() < 0.25 ? 'track' : 'straight',
          holdTimer: hold,
        });
      } else {
        // 3 类稍慢一点
        makeEnemy('gunship', x, -60, {
          hoverY: rand(120, 165),
          holdTimer: 30,
          speedMul: 0.6,
        });
      }
    }
  }

  // 特殊编队：1类长队从一侧斜扫到较靠下的另一侧（左右对称交叉）
  function spawnSideSweep() {
    const count = 6 + Math.floor(Math.random() * 3);   // 每队 6~8
    const gap = 46;                                    // 队列沿行进反方向排开
    const startY = CANVAS_H * 0.40;                    // 入场高度：场地中部略偏上（两侧窜出）
    for (const fromLeft of [true, false]) {
      const dirX = fromLeft ? 1 : -1;                  // 横向穿越方向
      const vx = dirX * rand(99, 117);                  // 方向基值：从一边扫向另一边（慢速 150 归一）
      const vy = rand(54, 69);                           // 同时下沉
      const edgeX = fromLeft ? -30 : CANVAS_W + 30;    // 屏幕侧外入场
      for (let k = 0; k < count; k++) {
        const r = Math.random();
        const behavior = pickSideSpawn();
        // 后方跟随：队尾更靠外、更高，形成长队斜线
        const x = edgeX - dirX * k * gap;
        const y = startY - k * gap * 0.55;
        spawnSideUnit(x, y, { vx, vy }, behavior, rand(0.8, 1.6));
      }
    }
  }

  // 特殊编队：左右两侧各依次出来七个 1 类（紫电 kamikaze 自爆为主，本波 30%~60% 替换为白影无攻击 1类），
  // 成纵列斜扫穿越（紫=亡语向下垂直射一发；白=无攻击）
  function spawnSideKamikazeStream() {
    const count = 7;
    const gap = 64;                                    // 队列间距：保证依次入场
    const startY = CANVAS_H * 0.40;                    // 入场高度：场地中部略偏上（两侧窜出）
    const whiteRatio = rand(0.40, 0.60);               // 本波白影替换比例 40%~60%（每架独立判定）
    for (const fromLeft of [true, false]) {
      const dirX = fromLeft ? 1 : -1;
      const vx = dirX * rand(99, 117);                 // 与侧翼斜扫同向（慢速 150 归一）
      const vy = rand(54, 69);
      const edgeX = fromLeft ? -30 : CANVAS_W + 30;
      for (let k = 0; k < count; k++) {
        // 后方跟随：队尾更靠外、更高，形成长队斜线依次入场
        const x = edgeX - dirX * k * gap;
        const y = startY - k * gap * 0.55;
        const white = Math.random() < whiteRatio;      // 白影 1类：无攻击、无亡语
        spawnSideUnit(x, y, { vx, vy }, white ? 'pass' : 'kamikaze', rand(0.8, 1.6));
      }
    }
  }

  // 2类「2*7」：7 架组成 V 字队形自上而下俯冲（顶点先行，两翼逐级滞后）。
  // 整队替换（互斥，先判先得）：0.6% 全波替换为 7 架破片（V 形停驻——停留点按出生偏移差异化、行程相等同时停稳；
  // 不掷侧翼入场）；Lv11 起 2.5% 全波替换为 7 架暴鸰（精英波——7 枚引导炸弹 + 潜在连锁殉爆）。
  // 正常波次二选一（全波一致）：90% 统一停留 4~7s（诗篇 ×2）后冲锋；10% 完全不停留——
  // 保持入位速度越过前锋停留线后，速度平滑衰减到入位速度 ×0.8（诗篇 ×0.6；指数逼近不瞬变，见 06-enemy vNoHold 分支）。
  // 阵型保持：全波统一基准前锋线 waveHoldY，每架 holdY = 基准 + 出生偏移（行程相等 → 下移时间一致、同时到位）；
  // 停留期横摆与常规 2类一致（逐架随机相位，无同相设定）；入位 / 冲锋 / 无停留直通全程无横移；
  // 单体替换不再包含破片（仅法术大师A1 / 法术矩阵按原概率替换单体）
  function spawnStrikerVee() {
    const cx = CANVAS_W / 2;
    // 0.6%：整波替换为 7 架破片——停留点呈 V 形（与突击艇同规则：基准前锋线 + 出生偏移），行程相等同时停稳
    if (Math.random() < 0.006) {
      const waveHoldY = rand(200, 240);
      const travel = waveHoldY + 46;   // 各架相同行程：tpY = 出生 y + travel
      spawnPopian(cx, -46, { tpX: cx, tpY: -46 + travel });
      for (let k = 1; k <= 3; k++) {
        const dx = k * 56;
        const y = -46 - k * 42;
        spawnPopian(cx - dx, y, { tpX: cx - dx, tpY: y + travel });
        spawnPopian(cx + dx, y, { tpX: cx + dx, tpY: y + travel });
      }
      return;
    }
    // Lv11 起 2.5% 概率：整支 V 字队替换为 7 架同排布的暴鸰（精英波——7 枚引导炸弹 + 潜在连锁殉爆，
    // 场面压力瞬时 +28，压力系统会自然放缓后续刷怪作为缓冲）
    if (levelFlow.level >= 11 && Math.random() < 0.025) {
      makeEnemy('baoling', cx, -46, {});
      for (let k = 1; k <= 3; k++) {
        const dx = k * 56;
        const y = -46 - k * 42;
        makeEnemy('baoling', cx - dx, y, {});
        makeEnemy('baoling', cx + dx, y, {});
      }
      return;
    }
    const holdWave = Math.random() < 0.9;          // 本波二选一（全波一致）：90% 停留 / 10% 无停留直通
    const hold = rand(4, 7) * strikerHoldMul();
    const noHoldMul = strikerNoHoldSpdMul();
    const waveHoldY = rand(200, 240);              // 全波统一基准前锋线（顶点目标；两翼按出生偏移上移）
    const mkStriker = (x, y, behavior) => {
      // holdY = 全波统一基准 + 出生偏移（y+46：顶点 0 / 两翼 −42~−126 → 两翼停得更高）；
      // 行程 = waveHoldY + 46 对所有架相等 → 下移时间一致、同时到位，V 字阵型全程保持
      const opts = { behavior, holdY: waveHoldY + (y + 46) };
      if (holdWave) opts.holdTimer = hold;
      else { opts.holdTimer = 0; opts.vNoHold = true; opts.vNoHoldSpdMul = noHoldMul; }
      return makeEnemy('striker', x, y, opts);
    };
    if (rollFashiA1()) spawnFashiA1(cx, -46);
    else if (rollFashiMatrix()) spawnFashiMatrix(cx, -46);
    else mkStriker(cx, -46, 'track');   // 顶点（停留时长与全波一致）
    const pairs = 3;
    for (let k = 1; k <= pairs; k++) {
      const dx = k * 56;
      const y = -46 - k * 42;                          // 逐级滞后 → V 字
      for (const sx of [-1, 1]) {
        if (rollFashiA1()) spawnFashiA1(cx + sx * dx, y);
        else if (rollFashiMatrix()) spawnFashiMatrix(cx + sx * dx, y);
        else mkStriker(cx + sx * dx, y, Math.random() < 0.25 ? 'track' : 'straight');
      }
    }
  }

  // 「32223」：左右各一艘 3类炮艇压阵（悬停），中央 3 架 2类护航——波次统一停留 4~8s（诗篇 ×2）
  function spawnGunshipWings() {
    const hold = rand(4, 8) * strikerHoldMul();   // 波次统一：本波 3 架 2类停留完全一致
    for (const sx of [-1, 1]) {
      const x = CANVAS_W / 2 + sx * 150;
      makeEnemy('gunship', x, -60, {
        hoverY: rand(115, 160),
        holdTimer: 30,
      });
    }
    for (let k = -1; k <= 1; k++) {
      const sx = CANVAS_W / 2 + k * 60;
      if (rollFashiA1()) spawnFashiA1(sx, -50);
      else if (rollPopian()) spawnPopian(sx, -50);
      else if (rollFashiMatrix()) spawnFashiMatrix(sx, -50);
        else makeEnemy('striker', sx, -50, {
          behavior: Math.random() < 0.3 ? 'track' : 'straight',
          holdTimer: hold,
        });
    }
  }

  // 「232111」：一列混编沿对角线从一个上角斜插入场——2类波次统一停留 4~6s（诗篇 ×2）
  function spawnDiagonalRaid() {
    const fromLeft = Math.random() < 0.5;
    const n = 6;
    const stepX = fromLeft ? 62 : -62;
    const startX = fromLeft ? 60 : CANVAS_W - 60;
    const hold = rand(4, 6) * strikerHoldMul();   // 波次统一：本波 2 架 2类停留完全一致
    for (let k = 0; k < n; k++) {
      const x = startX + k * stepX;
      const y = -40 - k * 40;                          // 阶梯式滞后 → 斜线
      if (k === 3) {
        makeEnemy('gunship', x, y - 20, { hoverY: rand(110, 155), holdTimer: 30 });
      } else if (k % 2 === 0) {   // k=0/2/4 → 1类（三个一组，满足≥3）
        // 顶部入场 → 快速 200：vx/vy 为方向基值（近垂直下插的斜插角），模长归一
        spawnSideUnit(x, y, { vx: fromLeft ? 24 : -24, vy: rand(90, 111) }, pickSideSpawn(), rand(0.8, 1.5), true);
      } else {
        if (rollFashiA1()) spawnFashiA1(x, y);
        else if (rollPopian()) spawnPopian(x, y);
        else if (rollFashiMatrix()) spawnFashiMatrix(x, y);
        else makeEnemy('striker', x, y, { behavior: Math.random() < 0.25 ? 'track' : 'straight', holdTimer: hold });
      }
    }
  }

  // 1类长队：单侧数艘排成一列斜插入场（波次中间小概率穿插，代替部分零散生成）
  function spawnSideColumn() {
    const fromLeft = Math.random() < 0.5;
    const count = 4 + Math.floor(Math.random() * 4);   // 数艘：4~7
    const gap = 54;                                    // 队列间距（沿行进反方向排开）
    const dirX = fromLeft ? 1 : -1;
    const vx = dirX * rand(90, 120);                   // 方向基值：与常规 1类同向（慢速 150 归一）
    const vy = rand(54, 84);
    const edgeX = fromLeft ? -36 : CANVAS_W + 36;      // 屏幕侧外入场
    const startY = rand(CANVAS_H * 0.35, CANVAS_H * 0.45);  // 入场高度：场地中部略偏上（两侧窜出）
    for (let k = 0; k < count; k++) {
      const r = Math.random();
      const behavior = pickSideSpawn();
      // 排成长队：队尾依次靠外、靠上，形成一列斜线
      const x = edgeX - dirX * k * gap;
      const y = startY - k * gap * 0.5;
      spawnSideUnit(x, y, { vx, vy }, behavior, rand(0.8, 1.6));
    }
  }

  // BOSS 战期间定时强制的 1类波次（小组 / 长队各 50%，全难度）——不走压力系统，场上存怪不影响刷新；
  // 本波敌人标记 minionDrop：击杀不加分、不掉水晶（增生侧翼艇分裂的卫护飞船随标记传播同样无奖励）；
  // 道具掉率 ×0.3 照常（结算见 06-enemy rollItemDrops）
  function spawnBossMinionWave() {
    const n0 = enemies.length;
    (Math.random() < 0.5 ? spawnSideGroup : spawnSideColumn)();
    for (let k = n0; k < enemies.length; k++) enemies[k].minionDrop = true;
  }

  // BOSS 击败后的固定首波：一群 1类排成长队从左或从右入场、横穿战场自另一侧离场；
  // 本波不出现紫电（kamikaze）与橙旋（swirl）1类（白影/增生/黄芒/赤月按权重混入）；
  // BOSS 战结束后 6s 内的特殊波次：不限入场位置一律快速 200（显式传 fast）
  function spawnPostBossWave() {
    const fromLeft = Math.random() < 0.5;
    const count = 5 + Math.floor(Math.random() * 3);   // 5~7：长队
    const gap = 54;                                    // 队列间距（沿行进反方向排开）
    const dirX = fromLeft ? 1 : -1;
    const vx = dirX * rand(90, 120);                   // 方向基值：与常规 1类同向（快速 200 归一）
    const vy = rand(54, 84);
    const edgeX = fromLeft ? -36 : CANVAS_W + 36;      // 屏幕侧外入场
    const startY = rand(CANVAS_H * 0.35, CANVAS_H * 0.45);  // 入场高度：场地中部略偏上
    for (let k = 0; k < count; k++) {
      const behavior = pickSideSpawn(['kamikaze', 'swirl']);   // 固定首波无紫电/橙旋
      // 排成长队：队尾依次靠外、靠上，形成一列斜线
      const x = edgeX - dirX * k * gap;
      const y = startY - k * gap * 0.5;
      spawnSideUnit(x, y, { vx, vy }, behavior, rand(0.8, 1.6), true);
      enemies[enemies.length - 1].postBossWave = true;   // 标记 BOSS 后固定首波：水晶必掉 + 掉量翻倍
    }
  }

  // 波次调度：全部编队进 WAVE_FORMATIONS 权重表，按关卡加权随机抽取；Lv3 起概率组合波
  // spawnWave 给本波敌人打上波次标记，主循环据此判断“上一波机动兵力已清场”才放下一波
  // ---------- 场面压力刷新：计算与决策 ----------
  // 场上压力权重和（BOSS 不计入；威龙血量 <60% 记 0，不再拖慢刷新）
  function fieldPressureW() {
    let w = 0;
    for (const e of enemies) {
      if (e.type === 'boss') continue;
      if (e.type === 'weilong' && e.hp < e.maxHp * WEILONG.lowHpRatio) continue;
      w += PRESSURE_W[e.type] || 0;
    }
    return w;
  }

  // 压力阈值：Lv10 以下 20%；Lv10→Lv20 线性升至 30%（Lv20+ 封顶）
  function spawnPressureThreshold() {
    if (levelFlow.level < 10) return 0.20;
    return Math.min(0.30, 0.20 + (levelFlow.level - 10) * 0.01);
  }

  // 4类主力舰强制刷新上限（同上，节奏更慢）；随难度刷怪间隔倍率同步放大（具象 ×1.3 / 虚象 ×2.3）
  function capitalMaxWait() {
    const sim = diffMods().spawnIntervalMul != null ? diffMods().spawnIntervalMul : 1;
    return Math.max(10, 34 - (levelFlow.level - 3) * 1.5) * sim;  // Lv3 34s → Lv10 23.5s → Lv16 14.5s
  }

  // 特殊3类随波生成概率：每波独立判定（特殊3类无单独生成逻辑，随常规波次登场）
  const SPECIAL3_WAVE_CHANCE = 0.25;
  // 同屏同种限 1 的特殊3类（仅限这三种；其余特殊3类不限）
  const SPECIAL3_SAME_TYPE_LIMIT = new Set(['hanshuang', 'yu4', 'anvil']);

  // 特殊3类权重表：随波生成抽取 与「数值与机制图鉴」共用（改数值只需改这里）
  // wLow = Lv11 以下权重 / wHigh = Lv11 起权重；配置 w1/w10 时 Lv1~10 由 w1→w10 线性过渡（优先于 wLow，同 waveFormationWeight）；
  // 0 = 该阶段不出场
  // 普通炮艇三色为独立条目：抽取直接决定涂装（紫80 / 赤100 / 金80，Lv11 起各 20）
  const SPECIAL3_POOL = [
    { name: '紫晶炮艇',     ency: 'gunship_violet',  type: 'gunship',  fn: () => spawnGunship('violet'),  wLow: 80,  wHigh: 20 },
    { name: '赤红炮艇',     ency: 'gunship_crimson', type: 'gunship',  fn: () => spawnGunship('crimson'), wLow: 100, wHigh: 20 },
    { name: '金曜炮艇',     ency: 'gunship_amber',   type: 'gunship',  fn: () => spawnGunship('amber'),   wLow: 80,  wHigh: 20 },
    { name: '橙焰炮艇',     ency: 'gunship_orange',  type: 'gunship',  fn: () => spawnGunship('orange'),  wLow: 70,  wHigh: 20 },
    { name: '青时炮艇',     ency: 'gunship_cyan',    type: 'gunship',  fn: () => spawnGunship('cyan'),    wLow: 60,  wHigh: 20 },
    
    { name: '炮火先兆者',   ency: 'harbinger',      type: 'harbinger', fn: spawnHarbinger, wLow: 30, wHigh: 30 },
    { name: '寒霜',         ency: 'hanshuang',      type: 'hanshuang', fn: spawnHanshuang, wLow: 0,  wHigh: 30 },
    { name: '威龙',         ency: 'weilong',        type: 'weilong',   fn: spawnWeilong,   wLow: 0,  wHigh: 15 },
    { name: '御4',          ency: 'yu4',            type: 'yu4',       fn: spawnYu4,       w1: 0, w10: 10, wHigh: 20 },
    { name: '铁砧',         ency: 'anvil',          type: 'anvil',     fn: spawnAnvil,     wLow: 0,  wHigh: 15 },
    { name: '暴鸰',         ency: 'baoling',        type: 'baoling',   fn: spawnBaoling,   wLow: 0,  wHigh: 25 },
    { name: '焦香螺旋桨',   ency: 'jiaoxiang',      type: 'jiaoxiang', fn: spawnJiaoxiang, wLow: 0,  wHigh: 25 },
    { name: '脉冲矩阵',     ency: 'pulseMatrix',    type: 'pulseMatrix', fn: spawnPulseMatrix, wLow: 0, wHigh: 15 },
    { name: '虚幻',         ency: 'unreal',         type: 'unreal',      fn: spawnUnreal,      wLow: 0, wHigh: 15 },
    { name: '法术大师A2',   ency: 'fashiA2',        type: 'fashiA2',   fn: spawnFashiA2,   wLow: 0,  wHigh: 30 },
  ];

  // 池条目在等级 lv 的权重：配置 w1/w10 时 Lv1~10 线性过渡（御4：Lv1 权重 0 → Lv10 权重 10），
  // 否则 Lv1~10 恒为 wLow；Lv11 起恒为 wHigh。与 waveFormationWeight 同一插值约定
  function special3Weight(it, lv) {
    if (lv <= 10) {
      if (it.w1 != null) return it.w1 + (it.w10 - it.w1) * (lv - 1) / 9;
      return it.wLow;
    }
    return it.wHigh;
  }

  // 特殊3类随波抽取：按阶段权重（Lv11 前：五色炮艇 390（紫80/赤100/金80/橙70/增60）/ 先兆者 30 / 御4 0→10 线性过渡；
  // Lv11 起：炮艇 100（各 20）/ 先兆者 30 / 寒霜 30 / 御4 20 / 法术大师A2 30 / 暴鸰 25 / 焦香螺旋桨 25 / 脉冲矩阵 15 / 虚幻 15 / 威龙 15 / 铁砧 15）。
  // 抽中 寒霜 / 御4 / 铁砧 时，若场上已有同种机体则本次跳过（同屏同种限 1）
  function spawnWaveSpecial3() {
    const lv = levelFlow.level;
    const pool = SPECIAL3_POOL
      .map(it => ({ it, w: special3Weight(it, lv) }))
      .filter(x => x.w > 0);
    let total = 0;
    for (const x of pool) total += x.w;
    let r = Math.random() * total;
    for (const x of pool) {
      r -= x.w;
      if (r <= 0) {
        if (SPECIAL3_SAME_TYPE_LIMIT.has(x.it.type) && enemies.some(e => e.type === x.it.type)) return;
        x.it.fn();
        return;
      }
    }
  }

  function spawnWave() {
    levelFlow.waveSeq++;
    if (isPoem() && !state.challenge) levelFlow.poemWaveIdx++;   // 诗篇波次制：本阶段波次计数（波 N = 等级 N，14-main 清场驱动）
    const before = enemies.length;
    spawnWaveBody();
    // 诗篇：波次附加炮火先兆者（阈值表 WAVE_POEM.harbingerExtra，取 ≤当前等级的最高档）——
    //   属本波一部分（打上 waveTag），须击毁/离场才放下一波
    if (isPoem() && !state.challenge) spawnPoemExtraHarbinger();
    for (let i = before; i < enemies.length; i++) enemies[i].waveTag = levelFlow.waveSeq;
    // 诗篇：加血套件每 N 波限 1——每波刷新递减节流计数（实际掉落时在 06-enemy 置满）
    if (isPoem() && levelFlow.hpKitWaveCd > 0) levelFlow.hpKitWaveCd--;
  }

  // 诗篇：波次附加炮火先兆者——取 ≤当前等级的最高阈值档（WAVE_POEM.harbingerExtra）；
  //   先判 two 再判 one（互斥阶梯：Lv31 起 5%×2 优先于 10%×1，任一命中本波至多多出 1~2 台）；
  //   入场位置为屏幕靠左/靠右（各 50%）边缘区顶部、固定横位（staticX），悬停高度与常规先兆者一致
  function spawnPoemExtraHarbinger() {
    let one = 0, two = 0;
    for (const t of WAVE_POEM.harbingerExtra) {
      if (levelFlow.level >= t.lv) { one = t.one; two = t.two; }
    }
    if (two > 0 && Math.random() < two) { spawnPoemSideHarbinger(); spawnPoemSideHarbinger(); return; }
    if (one > 0 && Math.random() < one) spawnPoemSideHarbinger();
  }

  function spawnPoemSideHarbinger() {
    const x = Math.random() < 0.5 ? rand(40, 130) : rand(CANVAS_W - 130, CANVAS_W - 40);
    spawnHarbinger(x, { staticX: true, hoverY: rand(75, 110) });
  }

  // 编队权重表：每波按权重随机抽取编队（与「数值与机制图鉴-怪物权重」单一数据源同步）
  //   w1 / w10 = Lv1 / Lv10 权重（Lv1~10 线性过渡）；wHigh = Lv11~20 恒定权重；0 = 该等级不出现
  // slotGunship 仅标记"含炮艇编队"：组合波追加位排除（避免同波两支炮艇编队），无其他特殊规则
  const WAVE_FORMATIONS = [
    { fn: spawnSideGroup,          w1: 10, w10: 5,  wHigh: 20, sideEntry: true },        // 1类小队 3~5 架（侧翼斜插）
    { fn: spawnStrikerGroup,       w1: 30, w10: 20, wHigh: 5  },                            // 2类小组 2 架
    { fn: spawnSideColumn,         w1: 5,  w10: 20, wHigh: 10, sideEntry: true },        // 1类长队 4~7 架（侧翼）
    { fn: spawnMirrorRow,          w1: 0,  w10: 30, wHigh: 40 },                            // 回文对称横排
    { fn: spawnSideSweep,          w1: 0,  w10: 10, wHigh: 10, sideEntry: true },        // 双侧斜扫
    { fn: spawnStrikerVee,         w1: 0,  w10: 30, wHigh: 30 },                            // 2类 V 字俯冲
    { fn: spawnSideKamikazeStream, w1: 0,  w10: 5,  wHigh: 15, sideEntry: true },        // 紫自爆流（两侧纵列）
    { fn: spawnDiagonalRaid,       w1: 5,  w10: 40, wHigh: 40, slotGunship: true, sideEntry: true },   // 232111（含炮艇）
    { fn: spawnGunshipWings,       w1: 0,  w10: 30, wHigh: 40, slotGunship: true },         // 双炮艇压阵
  ];

  // 编队在等级 lv 的权重：Lv1~10 由 w1→w10 线性过渡；Lv11~20 恒定 wHigh
  function waveFormationWeight(f, lv) {
    if (lv <= 10) return f.w1 + (f.w10 - f.w1) * (lv - 1) / 9;
    return f.wHigh;
  }

  // 按权重抽编队；excludeSlot 为 true 时排除含炮艇编队（组合波追加位不用）；
  // 许凯狗冲刺期间排除侧翼入场编队（sideEntry）——冲刺时两侧不会刷怪，全部改为顶部入场编队
  function pickFormation(excludeSlot) {
    const dashNoSide = state.pilotDashT > 0;
    let total = 0;
    const pool = [];
    for (const f of WAVE_FORMATIONS) {
      if (excludeSlot && f.slotGunship) continue;
      if (dashNoSide && f.sideEntry) continue;
      const w = waveFormationWeight(f, levelFlow.level);
      if (w <= 0) continue;   // 权重 0（如 Lv1 的双侧斜扫 / 紫自爆流 / 双炮艇）不入池
      pool.push({ f, w });
      total += w;
    }
    if (!pool.length) {
      // 池空回退：冲刺态取首个顶部入场编队，常态取首个编队
      const fb = WAVE_FORMATIONS.find(f => dashNoSide ? !f.sideEntry : true) || WAVE_FORMATIONS[0];
      return fb.fn;
    }
    let r = Math.random() * total;
    for (const it of pool) {
      r -= it.w;
      if (r <= 0) return it.f;
    }
    return pool[pool.length - 1].f;
  }

  // 组合波概率：Lv5~10 由 10%→30% 线性；Lv11~20 由 10%→40% 线性；Lv5 前不触发，Lv20+ 封顶 40%
  function comboWaveChance(lv) {
    if (lv < 5) return 0;
    if (lv <= 10) return 0.10 + (lv - 5) * 0.04;
    if (lv <= 20) return 0.10 + (lv - 11) * (0.30 / 9);
    return 0.40;
  }

  function spawnWaveBody() {
    pickFormation(false).fn();
    // 组合波：Lv5 起有概率同波追加一个编队（追加位不含炮艇编队）
    if (Math.random() < comboWaveChance(levelFlow.level)) {
      pickFormation(true).fn();
    }
    // 特殊3类随波登场：每波 SPECIAL3_WAVE_CHANCE 概率附带一台，按 SPECIAL3_POOL 权重抽取（寒霜/御4/铁砧 同种限 1）
    if (Math.random() < SPECIAL3_WAVE_CHANCE) spawnWaveSpecial3();
    // 诗篇：4类并入波次——Lv5 起每波 capitalWaveChance 概率随波附带（走常规主力舰/法术阵列槽位选取规则）；
    // 诗篇下 4类槽位通道关闭（14-main 门控），4类只随波出现，不再单独判定刷新（用户 2026-09-27 指定）
    if (isPoem() && levelFlow.level >= 5 && Math.random() < WAVE_POEM.capitalWaveChance) spawnCapitalSlot();
  }

  // 3类：炮艇，上方悬停很久后才缓慢下压
  //   variant：指定涂装（随波生成按三色独立权重 80/100/80 选取，见 SPECIAL3_POOL）；缺省走 makeEnemy 内变体抽取
  //   （暴鸰不再由炮艇替换产生：仅 Lv11 起随波按 SPECIAL3_POOL 权重登场）
  function spawnGunship(variant) {
    makeEnemy('gunship', rand(110, CANVAS_W - 110), -60, {
      hoverY: rand(110, 170),
      holdTimer: 30,
      ...(variant ? { variant } : {}),
    });
  }

  // 2类突击艇替换判定：lv11 前低概率替换为法术大师A1，lv11 起较多出现
  function rollFashiA1() {
    const chance = levelFlow.level < 11 ? FASHI_A1.spawnLowLv : FASHI_A1.spawnHighLv;
    return Math.random() < chance;
  }

  // 特殊2类：法术大师A1 —— 紫光激光无人机：不停留，入场 1.2~3s 后停移射击，50% 横移再恢复下降
  function spawnFashiA1(x, y) {
    const e = makeEnemy('fashiA1', x, y, {});
    e.fa1State = 'descend';
    e.fa1T = 0;
    e.fa1FirstAt = rand(FASHI_A1.firstDelay[0], FASHI_A1.firstDelay[1]) + firstFireAdd();   // 首次攻击时刻：入场后随机 1.2~3s（每架独立随机）+ 难度加成
    e.fa1FireTimer = 0;   // 到达首攻时刻后立刻刷停移射击（不占用 fireInterval）
    e.fa1Fired = false;
    e.entryT = 0;
    e.faceAng = 0;        // 机身朝向：炮管（局部 +y）以最大角速度平滑追踪玩家
    e.vx = 0;
    e.vy = FASHI_A1.entrySpeed;   // 入场初速（entrySpeed == speed 统一 160：等效恒速下降）
    e.strafeDir = 0;
    e.strafeDist = 0;
    e.strafeMoved = 0;
    // 入场横移：60% 概率在下坠越过触发线（10%~20% 屏高，逐架随机）时水平横移一次
    e.fa1EntryStrafe = Math.random() < 0.6;
    e.fa1EntryTrigY = CANVAS_H * rand(0.10, 0.20);
    e.fa1EntryDone = false;
    return e;
  }

  // 特殊3类：法术大师A2 —— A1 强化版（速度为威龙 130%、碰撞同威龙、体型 +30%）：不停留，出场 3s 后停移射击；
  // 斜下 45° 移动可能被下一次攻击打断：照常刹停射击后放弃剩余斜移、径直下降（strafeAbort 标记本次跳过斜移判定）
  function spawnFashiA2(x, y) {
    x = x != null ? x : rand(80, CANVAS_W - 80);
    y = y != null ? y : -70;
    const e = makeEnemy('fashiA2', x, y, {});
    e.fa2State = 'descend';
    e.fa2T = 0;
    e.fa2FireTimer = 0;   // 首次攻击：下降满随机首攻延时（1.8~2.3s）后立刻刹停射击
    e.fa2FirstAt = rand(FASHI_A2.firstDelay[0], FASHI_A2.firstDelay[1]) + firstFireAdd();
    e.fa2Fired = false;
    e.entryT = 0;
    e.faceAng = 0;        // 机身朝向：炮管（局部 +y）以最大角速度平滑追踪玩家
    e.vx = 0;
    e.vy = FASHI_A2.entrySpeed;   // 入场初速不变（0.5s 内快速衰减到 speed）
    e.strafeDir = 0;
    e.strafeDist = 0;
    e.strafeMoved = 0;
    e.strafeAbort = false;
    return e;
  }

  // 2类突击艇替换判定：lv11 前极低概率替换为破片，lv11 起正常出现（权重见 PRESSURE_W.popian）
  function rollPopian() {
    const chance = levelFlow.level < 11 ? POPIAN.spawnLowLv : POPIAN.spawnHighLv;
    return Math.random() < chance;
  }
  // 特殊2类：破片 —— 三连发导弹无人机：直线飞向选定点急停锁停（除非被击毁不再移动）→
  // 索敌范围内锁定玩家位置红圈预警 0.8s → 快速三连发不可击毁导弹（8/5/5，条件性无视无敌）；20% 概率侧翼入场。
  // o.tpX/tpY：强制停留点（2*7 整队替换用——V 形停驻、行程相等同时停稳），强制时不掷侧翼入场。
  // type='popianU'（破片U型，诗篇新敌）：同流程，差异见 POPIAN_U——首攻延迟改为入场后 1.8~2s 随机
  //（诗篇 1.6~2s，atkT 自入场即计时、无需锁停），攻击门控/途中瞄准在 06-enemy popian 分支按类型分叉
  function spawnPopian(x, y, o, type) {
    o = o || {};
    type = type || 'popian';
    const forced = o.tpX != null && o.tpY != null;
    const flank = !forced && Math.random() < POPIAN.flankChance;
    let sx, sy;

    if (flank) {
      const fromLeft = Math.random() < 0.5;
      sx = fromLeft ? -50 : CANVAS_W + 50;
      sy = rand(CANVAS_H * 0.08, CANVAS_H * 0.22);
    } else {
      sx = x != null ? x : rand(60, CANVAS_W - 60);
      sy = y != null ? y : -50;
    }
    const e = makeEnemy(type, sx, sy, {});
    // 停留点：强制优先；否则落在从上往下 30%~80% 屏高区间（nearBias 幂函数使靠近入场高度概率更高）
    if (forced) {
      e.tpX = o.tpX;
      e.tpY = o.tpY;
    } else {
      const t = Math.pow(Math.random(), POPIAN.nearBias);
      const ty = CANVAS_H * (POPIAN.stopTopY + (POPIAN.stopBotY - POPIAN.stopTopY) * t);
      // 水平落点：以入场 x 为中心随机横移（幅度受 moveMax 约束），且不落在两侧 15% 边缘区（stopMarginX 夹取）
      const tx = clamp(sx + rand(-1, 1) * POPIAN.moveMax * 0.5,
        CANVAS_W * POPIAN.stopMarginX, CANVAS_W * (1 - POPIAN.stopMarginX));
      e.tpX = tx;
      e.tpY = ty;
    }
    e.arrived = false;
    e.entryT = 0;
    e.faceAng = 0;
    e.detectR = CANVAS_H * POPIAN.detectBase;
    e.vx = 0; e.vy = 0;
    e.warn = null;
    e.popBurst = null;
    e.popBurstTimer = 0;
    // 破片：锁停后才计时（06-enemy 到位时重置）；U型：入场即计时，1.8~2s（诗篇 1.6~2s）后才能射击
    e.atkT = type === 'popianU'
      ? rand(...(isPoem() ? POPIAN_U.firstDelayPoem : POPIAN_U.firstDelay)) + firstFireAdd()
      : POPIAN.firstDelay + firstFireAdd();
    return e;
  }

  // 特殊2类：破片U型（诗篇新敌）—— 破片升级版：样式同破片（核心描边/双杠/炮口红色细节）、
  // 导弹 10/7/7；入场无需锁停就位、途中即旋转瞄准玩家，入场 1.8~2s（诗篇 1.6~2s）后才能射击。
  // 暂未接入常规出怪（诗篇出怪接入另行批次）；图鉴挑战召唤入口见 spawnChallengeTargetOne；
  // 战争幽灵半血召唤也经此入口（幽灵身侧横位、顶部入场，目标点为其身后水平线）
  function spawnPopianU(x, y, o) {
    return spawnPopian(x, y, o, 'popianU');
  }

  // 特殊4类：战争幽灵（诗篇新敌实装 2026-09-29）—— 白色风波预警 → 极速入场冲撞 → 抵达演出 →
  // 驻留中场技能循环 → 直线预警加速斩出离场（挑战模式传 forever 永驻不离场）。
  // 停留点（屏高 50%~65% / 屏宽 15%~85% 随机）与来向（停留点正上方 ±60° 扇区随机）在此抽取；
  // 预警期间本体静驻屏外起点（在通用出界移除边界内：|屏外 x| ≤ 430），预警结束沿来向冲刺、
  // 临近停留点指数减速（v = min(entrySpeed, k×剩余距离)，位置逐帧连续无 snap）；
  // 移动/技能/光环/半血召唤状态机见 06-enemy warGhost 分支
  function spawnWarGhost(forever) {
    const stayX = CANVAS_W * rand(WAR_GHOST.stayXPctMin, WAR_GHOST.stayXPctMax);
    const stayY = CANVAS_H * rand(WAR_GHOST.stayYPctMin, WAR_GHOST.stayYPctMax);
    // 来向：以停留点正上方为轴 ±60° 扇区内随机取一方向（upAng 相对竖直向上的偏角）
    const upAng = -Math.PI / 2 + rand(-1, 1) * WAR_GHOST.entrySpreadDeg * Math.PI / 180;
    const dir = { x: -Math.cos(upAng), y: -Math.sin(upAng) };   // 飞行方向（单位向量）：从来向指向停留点
    // 屏外起点：沿来向回退 D；D 受通用出界移除边界钳制（x ∈ [-430, W+430]），保证冲刺起点在屏外且不被当帧移除
    let D = CANVAS_H * 0.92;
    if (dir.x > 1e-6) D = Math.min(D, (stayX + 430) / dir.x);
    else if (dir.x < -1e-6) D = Math.min(D, (CANVAS_W + 430 - stayX) / -dir.x);
    const e = makeEnemy('warGhost', stayX - dir.x * D, stayY - dir.y * D, {});
    e.wgPhase = 0;             // 0=入场风波预警 1=入场冲刺 2=抵达演出 3=驻留（技能循环）4=离场直线预警 5=离场斩出
    e.wgStay = { x: stayX, y: stayY };
    e.wgDir = dir;
    e.wgWarnT = 0;             // 入场预警计时
    e.wgDelayT = 0;            // 入场登场延迟计时（预警全部出现完毕后停 entryDelay/真我 entryDelayRealme/诗篇 entryDelayPoem 再冲刺）
    e.wgSpd = 0;               // 当前冲刺速度（相位内积分，进入下相位清零）
    e.wgT = 0;                 // 相位通用计时（抵达演出/悬停摆动共用）
    e.wgDwellT = forever ? 1e9 : WAR_GHOST.dwell;   // 驻留时长（抵达演出结束后倒计时）
    e.wgExit = null;           // 离场方向（相位 4 锁定）
    e.wgFace = Math.atan2(dir.y, dir.x) - Math.PI / 2;   // 机体朝向（绘制约定同 faceAng：0 = 机头朝下）
    e.wgSkill = null;          // 进行中的技能（kind1 两刃斩击 { kind, t, hit, sweepT } / kind2 双斩流 { kind, t, ang, locked } / kind3 弹幕，见 06-enemy）
    e.wgSweepT = null;         // 技能1 扫斩同步时钟（渲染复用抵达演出扫转动画；仅扫斩期非 null，收口/离场清空）
    e.wgNext = null;           // 下一个待释放技能编号（null 时用 wgFirst；严格轮换 1→2→3，初始技能随机 2/3）
    e.wgFirst = Math.random() < 0.5 ? 2 : 3;   // 首个技能随机 2/3（避开与抵达演出同款的技能1 扫斩防视觉重复），之后严格 1→2→3 轮换
    e.wgGapT = 1.2;            // 驻留后到首个技能的间隔（s）
    e.wgSummoned = false;      // 半血召唤（一次性）
    return e;
  }

  // 4S 敌人：黑暗之手麾下四精英（狞笑朴学峰 / 猩红韩希先 / 铜皮夏勇 / 暴怒辛国栋，2026-09-30 实装）——
  // 共用移动骨架：顶部入场（随机水平位）指数减速到停留点（v = min(entrySpeed, k×剩余距离)，逐帧连续无 snap）
  // → 驻留悬停小幅摆动（sin 项 t=0 偏移 0 + 幅度缓入）→ dwell 秒后加速下压离场（挑战模式传 1e9 永驻）。
  // 技能循环（首个随机、之后固定两技 1↔2 轮换）与技能内移动（朴穿刺 / 辛横移）
  // 状态机见 06-enemy updateEnemyMovement / updateEnemyFire 的精英分支；参数见 01-config ELITES
  function spawnEliteMinion(type, holdTimer) {
    const g = ELITES;
    const tc = g[type];
    const stayX = CANVAS_W * rand(g.stayXMargin, 1 - g.stayXMargin);
    // 停留高度带：机型级覆盖（朴/韩/辛固定屏高 40%——2026-10-04 用户定稿韩/辛与朴对齐；夏勇 45%；其余用公共 14%~30% 带）
    const stayY = CANVAS_H * rand(
      tc.stayTopPct != null ? tc.stayTopPct : g.stayTopPct,
      tc.stayBotPct != null ? tc.stayBotPct : g.stayBotPct,
    );
    const e = makeEnemy(type, stayX, -70, {});
    // 四精英血量 = 机型级 hpByDiff 按难度取值（2026-10-04 用户定稿：四精英独立四难度血量，
    // 取代原「黑暗之手血量 × 继承比」派生；取值入口 eliteHpOf，与图鉴展示同源。
    // 朴 6000/9000/12000/15000 · 韩 8000/10000/15000/20000 · 夏 10000/12000/18000/25000 · 辛 8000/10000/15000/20000。
    // 覆盖 makeEnemy 默认表值，黑暗之手召唤与图鉴挑战两条入场路径统一生效）
    e.hp = e.maxHp = eliteHpOf(type);
    e.elPhase = 0;             // 0=入场 1=驻留 2=离场（10+ 为技能内移动相位，见 06-enemy）
    e.elStay = { x: stayX, y: stayY };
    e.elSpd = 0;               // 入场/离场当前速度（相位内积分）
    e.elT = 0;                 // 相位通用计时（摆动缓入等）
    e.elDwellT = holdTimer != null ? holdTimer : g.dwell;
    e.elSkill = null;          // 进行中的技能状态
    e.elFirst = 1 + Math.floor(Math.random() * 2);   // 首个技能随机（朴/韩/辛两技 1↔2 轮换；夏勇不走此字段，用 xyStep 固定五步循环）
    e.elNext = 0;              // 下一个技能序号（0 = 未定，用 elFirst）
    e.elGapT = 1.1;            // 驻留后到首个技能的间隔（s）
    e.elRemnant = null;        // 朴学峰残像 { x, y, t }（绘制 + 爆开弹幕）
    e.xyStep = 0;              // 夏勇固定五步循环游标（[屏障, 大子弹, 回旋刃, 大子弹, 回旋刃]，见 06-enemy startEliteSkill）
    e.xyTrackV = 0;            // 夏勇驻留水平追踪当前速度（低通状态，速度曲线铁律）
    e.xyBarOn = false;         // 夏勇屏障开关（技能3）
    e.xyBarHp = 0; e.xyBarMax = 0;   // 夏勇屏障吸收量当前/上限
    e.xyBlades = null;         // 夏勇碎翼回旋刃挂载（双刃数组，见 06-enemy startEliteSkill/advanceEliteMinions）
    e.xyOrbs = null;           // 夏勇核心膨胀能量球 ×3（数组，见 06-enemy startEliteSkill/advanceEliteMinions）
    e.xgBombs = [];            // 辛国栋地毯轰炸落点 { x, y, t }（预警 → 爆炸）
    return e;
  }

  // 连携精英返场（2026-10-08 用户定稿）：黑暗之手战离场登记（state.dhFledElites）的精英按 ELITE_REVIVE.levels
  // 固定等级重新登场——顶部标准入场（holdTimer 1e9 永驻，同图鉴挑战口径），血量 = 登记血量 + 已损失 × healLostPct；
  // 带 elRevive 标记：不占在场压力权重（4S 类型不在 PRESSURE_W）、不阻止诗篇波次刷新（14-main 诗篇分支排除）、
  // 不因新的 4S 登场而离场，仅第三轮刷怪期结束统一离场（02-core departRevivedElites）。
  // 张华&张策实装时走同通道（rec.hp 传全血 = 登记值即上限，全额入场）。14-main 于第三轮 phase===2 按等级触发
  function spawnRevivedElite(rec) {
    const el = spawnEliteMinion(rec.type, 1e9);
    el.elRevive = true;
    const max = el.maxHp;
    const recorded = Math.min(Math.max(0, rec.hp), max);
    el.hp = Math.max(1, Math.round(max - (max - recorded) * ELITE_REVIVE.healLostPct));   // 登记血量 + 已损失 × 50%
    return el;
  }

  // 2类突击艇替换判定：lv11 前不出现（spawnLowLv=0），lv11 起以 spawnHighLv 概率替换（权重见 PRESSURE_W.fashiMatrix）
  function rollFashiMatrix() {
    const chance = levelFlow.level < 11 ? FASHI_MATRIX.spawnLowLv : FASHI_MATRIX.spawnHighLv;
    return Math.random() < chance;
  }

  // 特殊2类：法术矩阵 —— 白红菱形法师无人机：入场下降（初速 2.3× 快速衰减）到 20%~40% 屏高目标区 →
  // OU 相干随机游走「胡乱移动」（不脱离战场）→ 18s 后加速向下离场；移动期间朝玩家左右 ±15° 发射发光正方体
  // （独立 spellCubes 弹道，见 updateSpellCubes）；受主战机伤害 -30%；法术阵列在场时偏移角/速度增强
  function spawnFashiMatrix(x, y, o) {
    o = o || {};
    const e = makeEnemy('fashiMatrix', x != null ? x : rand(110, CANVAS_W - 110), y != null ? y : -60, {
      hoverY: o.hoverY != null ? o.hoverY : rand(CANVAS_H * FASHI_MATRIX.hoverTopPct, CANVAS_H * FASHI_MATRIX.hoverBotPct),
      holdTimer: o.holdTimer != null ? o.holdTimer : FASHI_MATRIX.dwell,   // 胡乱移动持续时长（挑战模式传 1e9 永驻）
      fireTimer: FASHI_MATRIX.firstDelay,   // 就位后首攻延迟（覆盖注册表 fireInterval[1e9,1e9] 天文默认）
    });
    // 独立移动状态机（见 updateEnemyMovement 的 fashiMatrix 分支）：0=入场下降 1=胡乱移动（角度随机游走）2=离场
    e.mxPhase = 0;
    e.entryT = 0;
    e.wanderT = 0;
    e.vx = 0; e.vy = FASHI_MATRIX.entrySpeed; // 入场初速 2×（随后在 entryDecay 内快速衰减到 speed）
    // 机体本体自旋（菱形绕中心旋转）：方向随机、转速「有的慢有的一般」
    e.rot = Math.random() * Math.PI * 2;
    e.bodySpin = (Math.random() < 0.5 ? -1 : 1) * rand(FASHI_MATRIX.bodySpinMin, FASHI_MATRIX.bodySpinMax);
    return e;
  }

  // 特殊3类：脉冲矩阵 —— 三座暗红流光法术矩阵菱形「骑边拼合」成等边三角形 + 中央暗红核心；周期性范围脉冲
  // （攻击逻辑见 06-enemy updateEnemyFire / updateEnemyMovement 的 pulseMatrix 分支）；
  // 出生位置：玩家当前竖直高度 ±20% 屏高带内（不出顶 60px、不低 80% 屏高）；
  // 登场 120px/s、1s 内二次缓出衰减到随机 50~60px/s 巡航，持续向另一侧移动、累计走过 80% 屏宽后停驻（微摆）；
  // 出生即计攻击间隔（入场途中走完首脉冲延迟同样释放，见 updateEnemyFire）；
  // 登场 20s 未被击杀 → 自爆模式（全模式生效，17s/19s 颤动预警）：下一波 160px、波扩完自身死亡并分裂三座法术矩阵；
  // 本体自转转速与法术矩阵等同
  function spawnPulseMatrix(holdTimer) {
    const cfg = PULSE_MATRIX;
    const first = isPoem() ? cfg.firstDelayPoem : cfg.firstDelay;
    // holdTimer 形参保留兼容调用方（挑战模式传 1e9），但 2026-10-02 起自爆计时（登场 20s）全模式生效，永驻语义作废
    // 侧翼出生：从左/右侧屏外出生、向另一侧持续移动；出现高度 = 玩家竖直位置 ±20% 屏高（clamp 防出界）
    const fromLeft = Math.random() < 0.5;
    const startX = fromLeft ? -50 : CANVAS_W + 50;
    const y = clamp(player.y + CANVAS_H * rand(-cfg.spawnBandPct, cfg.spawnBandPct), 60, CANVAS_H * cfg.spawnYMaxPct);
    const e = makeEnemy('pulseMatrix', startX, y, { fireTimer: first });
    e.dirX = fromLeft ? 1 : -1;                        // 水平移动方向（朝另一侧）
    e.pmCruise = rand(cfg.cruiseMin, cfg.cruiseMax);   // 本台巡航速（50~60 随机）
    e.pmMoveT = 0;                                     // 登场减速计时（1s 内从 entrySpeed 缓出到巡航速）
    e.pmTravel = 0;                                    // 累计水平位移（达 travelPct×屏宽后停驻）
    e.pmBaseY = y;       // 停驻后以此 Y 为基准微微上下摆动
    e.pmBob = true;
    e.arrived = false;
    e.pmAgeT = 0;   // 登场存活计时（s，updateEnemyMovement 每帧累计；≥dwell 触发自爆，全模式生效）
    e.pmCycleIv = first;   // 首周期时长 = 首脉冲延迟（绘制层充能进度推导基准，闭合起步）
    // 本体自转：转速与法术矩阵等同（bodySpinMin~Max，方向随机）
    e.rot = Math.random() * Math.PI * 2;
    e.bodySpin = (Math.random() < 0.5 ? -1 : 1) * rand(FASHI_MATRIX.bodySpinMin, FASHI_MATRIX.bodySpinMax);
    return e;
  }

  // 特殊3类：暴鸰 —— 自爆无人机：不悬停、以炮艇 40% 速度径直下压；登场 0.8s 后进入玩家距离内即
  // 停车锁定（玩家位置浮现红色预警区）→ 炸弹向下脱离（火星四溅）→ 1s 后极速加速冲向预警区中心爆炸（仅伤玩家）；
  // 投弹后以炮艇 110% 速度继续俯冲离场；被击毁时若炸弹尚未投出 → 原地爆炸（敌我通杀）
  function spawnBaoling(x) {
    return makeEnemy('baoling', x != null ? x : rand(110, CANVAS_W - 110), -60, {});
  }
  function spawnBaolingG(x) {
    return makeEnemy('baolingG', x != null ? x : rand(110, CANVAS_W - 110), -60, {});
  }
  // 特殊3类：虚幻 —— 暴鸰同型冰霜投弹机：移动/投弹流程与暴鸰完全一致（见 06-enemy 状态机），数值全部同暴鸰、伤害 70%；
  // 炸弹爆炸 / 殉爆留下寒冷区域（见 UNREAL 与 06-enemy updateFrostZones / 09-draw-ships drawFrostZones）
  function spawnUnreal(x) {
    return makeEnemy('unreal', x != null ? x : rand(110, CANVAS_W - 110), -60, {});
  }
  
  // 特殊3类：炮火先兆者（后排炮兵）—— 缓慢就位于更高处，充能召唤导弹，约 18s（最多 4 发）后以进场速度前开走
  function spawnHarbinger(x, opts) {
    const o = opts || {};
    makeEnemy('harbinger', x != null ? x : rand(120, CANVAS_W - 120), -50, {
      hoverY: o.hoverY != null ? o.hoverY : rand(75, 110),
      holdTimer: HARBINGER.hold,
      staticX: o.staticX || false,
    });
  }

  // 特殊4类：法术阵列 —— 血红三菱法师母机：匀速下降（整体速度 = 先兆者基准 ×0.65），下降到屏幕上方 20%~30% 后
  // 像法术矩阵一样胡乱移动（不脱离屏幕）并散发血红雾气，朝玩家发射大号红色正方体（飞行途中分裂为 3 枚常规正方体），
  // 每 4s 闪动红光并在周围召唤一个法术矩阵（召唤体无奖励），30s 后下移离场（状态机见 updateEnemyMovement 的 fashiArray 分支）
  function spawnFashiArray() {
    const e = makeEnemy('fashiArray', rand(120, CANVAS_W - 120), -60, {
      hoverY: rand(CANVAS_H * FASHI_ARRAY.hoverTopPct, CANVAS_H * FASHI_ARRAY.hoverBotPct),
      holdTimer: FASHI_ARRAY.hold,
      fireTimer: rand(FASHI_ARRAY.firstDelay[0], FASHI_ARRAY.firstDelay[1]),   // 就位后首攻延迟（随机 0~1s，覆盖注册表天文默认）
    });
    e.wanderT = 0;     // 胡乱移动计时（OU 相干随机游走，同法术矩阵）
    e.wanderX = 0; e.wanderY = 0;
    e.auraT = 0;       // 血红雾气渐显计时（到达悬停位置后开始）
    e.mistI = 1;       // 黑雾强度：入场时即为 1，到位后 ~1.5s 内逐渐消散，退场时再起（见 updateEnemies / drawFashiArrayBody）
    e.summonTimer = FASHI_ARRAY.summonFirst;      // 首次召唤倒计时（2.5s；后续每 5s，见 updateEnemyFire）
    e.summonFlash = 0; // 召唤红光闪动剩余时长
    return e;
  }

  // 诗篇级 4B：战争矩阵（2026-10-03 占位待设计）——矩阵类敌人的诗篇级上位，机制/数值/外观待定。
  // 占位行为：入场下降到屏幕上方 20%~30% 悬停区后永驻场（不攻击、不召唤）；专属移动/开火/绘制待实装。
  function spawnWarMatrix() {
    const e = makeEnemy('warMatrix', rand(120, CANVAS_W - 120), -60, {
      hoverY: rand(CANVAS_H * 0.20, CANVAS_H * 0.30),
      holdTimer: 1e9,   // 占位：永驻场，机制待设计
    });
    return e;
  }

  // 4类槽位出场：Lv5 起 4类才会出现（由 14-main 的槽位通道门控）；Lv11 起有 slotChance 概率出场法术阵列（其余为主力舰）
  function spawnCapitalSlot() {
    if (levelFlow.level >= 11 && Math.random() < FASHI_ARRAY.slotChance) spawnFashiArray();
    else spawnCapital();
  }

  // 4类：主力舰，居中悬停很久，出场即带 1/2 类护航
  function spawnCapital() {
    makeEnemy('capital', CANVAS_W / 2, -110, {
      hoverY: 140,
      holdTimer: 35,
      fireTimer: 1.8,
      escortTimer: 5,
    });
    // 出场护航：两侧 1 类 + 2 类各一组
    spawnSideGroup();
    spawnStrikerGroup();
    shake(6, 0.4);
  }

  // 威龙蛇形巡航路径（航点序列）：从偏左/偏右半场出场，方向镜像
  // 左半场出场(mirror=false)：下降到先兆者高度 → 右靠边 → 下移一段 → 左靠边 → 下移一段 → 走到右侧距墙 1/3 处 → 停顿 2s → 向下离场
  // 右半场出场(mirror=true)：方向反之（停顿点在左侧距墙 1/3 处）
  function buildWeilongPath(spawnX, mirror) {
    const W = CANVAS_W, m = WEILONG.margin, d = WEILONG.segDown, y0 = WEILONG.hoverY;
    const rightEdge = W - m, leftEdge = m;
    const firstX = mirror ? leftEdge : rightEdge;    // 先走到的边
    const secondX = mirror ? rightEdge : leftEdge;   // 再走到的另一边
    const finalX = mirror ? W / 3 : W * 2 / 3;       // 停顿点：距“出发侧对侧”墙壁 1/3 屏宽处
    return [
      { x: spawnX, y: y0 },                              // 0 下降到约炮火先兆者停留高度
      { x: firstX, y: y0 },                              // 1 横向走到靠边
      { x: firstX, y: y0 + d },                          // 2 向下前进一段
      { x: secondX, y: y0 + d },                         // 3 横向走到另一边
      { x: secondX, y: y0 + d * 2 },                     // 4 再向下前进一段
      { x: finalX, y: y0 + d * 2, dwell: WEILONG.dwell },// 5 走到 1/3 处并停顿 2s
      { x: finalX, y: CANVAS_H + 140 },                  // 6 向下开走离场
    ];
  }

  // 特殊3类：威龙 —— 从偏左/偏右半场出场，沿蛇形路径巡航（攻击时停移），血量<60%后不计入场面压力
  function spawnWeilong() {
    const mirror = Math.random() < 0.5;   // true=偏右半场出场（路径方向镜像）
    const spawnX = mirror ? rand(CANVAS_W * 0.55, CANVAS_W - 60) : rand(60, CANVAS_W * 0.45);
    const e = makeEnemy('weilong', spawnX, -60, { fireTimer: rand(1.0, 1.6) });
    e.mirror = mirror;
    e.wpIdx = 0;       // 当前航点索引
    e.dwellT = 0;      // 航点停顿倒计时
    e.attackT = 0;     // 攻击窗口（>0 时停止移动、炮口锁死）
    e.muzzleAng = Math.PI / 2;   // 炮口指向（世界角；初始朝下，以最大角速度平滑追踪玩家）
    e.entryT = WEILONG.entryDecay;   // 入场 200% 移速加成倒计时（1s 线性衰减）
    e.waypoints = buildWeilongPath(spawnX, mirror);
    shake(5, 0.35);
    return e;
  }

  // 特殊3类：寒霜 —— 不攻击：50% 概率从顶部直线下移入场（初速 +100%、1s 内衰减完毕），
  // 50% 概率从左/右侧 25%~50% 屏高入场、斜向下飞向同半场落点（左翼不越中线、右翼同理）；
  // 到达场地 72%~82% 随机高度指定位置停留 20s 后向下离场（光圈半径 150 下缘几乎覆盖到战场底部）；
  // 登场 1s 后周身渐显（0.8s 渐入）较大范围冰蓝寒霜光圈：顶部入场圈内射速/移速 -35%、侧翼入场 -25%（以核心位置判定）；
  // 入场未减速阶段（距落点 ≥90px）判定箱略缩、受伤 -20%（见 06-enemy 移动 / 08-entities 伤害链）
  function spawnHanshuang() {
    // 许凯狗冲刺期间两侧不刷怪：寒霜强制顶部入场（原 50% 侧翼）
    const flank = Math.random() < HANSHUANG.flankChance && state.pilotDashT <= 0;
    let e;
    if (flank) {
      const fromLeft = Math.random() < 0.5;
      const sy = CANVAS_H * rand(HANSHUANG.flankTopPct, HANSHUANG.flankBotPct);
      e = makeEnemy('hanshuang', fromLeft ? -60 : CANVAS_W + 60, sy, {});
      e.hsFlank = true;
      e.hsFromLeft = fromLeft;
      // 落点 X 限定在同半场（左翼 10%~42% / 右翼 58%~90%），绝不飞越中线到对侧
      e.targetX = CANVAS_W * (fromLeft
        ? rand(HANSHUANG.flankHalfMin, HANSHUANG.flankHalfMax)
        : rand(1 - HANSHUANG.flankHalfMax, 1 - HANSHUANG.flankHalfMin));
    } else {
      e = makeEnemy('hanshuang', rand(80, CANVAS_W - 80), -60, {});
      e.hsFlank = false;
      e.targetX = e.x;   // 顶部入场仅竖直下移（落点 X = 入场 X）
    }
    e.targetY = rand(CANVAS_H * 0.72, CANVAS_H * 0.82);   // 停留高度（从上往下 72%~82%，光圈几乎覆盖到底部）
    e.dwellT = HANSHUANG.dwell;   // 到位后停留倒计时
    e.auraT = 0;                  // 登场计时（超过 auraDelay 后光圈渐显）
    // 出厂虚化盾（复用 e.phase 通用虚化机制）
    const pr = Math.random();
    if (e.hsFlank) {
      // 侧翼入场：35% 概率 1.5s / 20% 概率 2s / 10% 概率 2.5s（原 5% 概率 5s 档删除、其 5% 并入 1.5s 档），其余 35% 不带盾
      if (pr < 0.35) { e.shielded = true; e.phase = 1.5; }
      else if (pr < 0.55) { e.shielded = true; e.phase = 2; }
      else if (pr < 0.65) { e.shielded = true; e.phase = 2.5; }
    } else {
      // 顶部入场：30% 概率 1.5s / 20% 概率 2s / 10% 概率 2.5s / 5% 概率 5s，其余 35% 不带盾
      if (pr < 0.30) { e.shielded = true; e.phase = 1.5; }
      else if (pr < 0.50) { e.shielded = true; e.phase = 2; }
      else if (pr < 0.60) { e.shielded = true; e.phase = 2.5; }
      else if (pr < 0.65) { e.shielded = true; e.phase = 5; }
    }
    shake(4, 0.3);
    return e;
  }

  // 寒霜光圈减速判定：玩家核心（判定点）位于任一已显现的寒霜光圈内时，冷却流速按入场方式分流（顶部 ×0.65 / 侧翼 ×0.75）
  // 虚幻寒冷区域（对玩家生效的）：圈内冷却流速 ×frostFireSlow（同寒霜顶部档）；炽心装甲：免疫寒霜减速（寒冷区域同款豁免）
  function playerFrostSlowMul() {
    if (currentArmor.id === 'chixin') return 1;
    for (const e of enemies) {
      if (e.type !== 'hanshuang' || e.auraT < HANSHUANG.auraDelay) continue;
      if (Math.hypot(player.x - e.x, player.y + PLAYER_CFG.hitOffsetY - e.y) <= HANSHUANG.auraR)
        return e.hsFlank ? HANSHUANG.fireSlowFlank : HANSHUANG.fireSlow;
    }
    for (const z of frostZones) {
      if (!z.affectsPlayer) continue;
      if (Math.hypot(player.x - z.x, player.y + PLAYER_CFG.hitOffsetY - z.y) <= z.r)
        return UNREAL.frostFireSlow;
    }
    return 1;
  }

  // 寒霜光圈移动减速：玩家核心位于光圈内时按入场方式分流（顶部 ×0.65 / 侧翼 ×0.75）
  // 虚幻寒冷区域（对玩家生效的）：圈内移速 ×frostMoveSlow（同寒霜顶部档）；炽心装甲：免疫寒霜减速（寒冷区域同款豁免）
  function playerFrostMoveMul() {
    if (currentArmor.id === 'chixin') return 1;
    for (const e of enemies) {
      if (e.type !== 'hanshuang' || e.auraT < HANSHUANG.auraDelay) continue;
      if (Math.hypot(player.x - e.x, player.y + PLAYER_CFG.hitOffsetY - e.y) <= HANSHUANG.auraR)
        return e.hsFlank ? HANSHUANG.moveSlowFlank : HANSHUANG.moveSlow;
    }
    for (const z of frostZones) {
      if (!z.affectsPlayer) continue;
      if (Math.hypot(player.x - z.x, player.y + PLAYER_CFG.hitOffsetY - z.y) <= z.r)
        return UNREAL.frostMoveSlow;
    }
    return 1;
  }

  // 虚幻寒冷区域敌机减速：位于「对敌人生效」的寒冷区域内时移速 ×frostMoveSlow（×0.65；
  // 寒霜发生器已于 2026-10-01 统一增强至 -60%，两者倍率分道）；
  // BOSS 效果减半（×bossResist → ×0.825）；多区域取最强减速（最小倍率）。
  // 奖励道具·寒霜发生器：我方力场（state.frostField，160px）内敌机移速 -60%（×0.40，2026-10-01 统一增强，
  // 不再复用 UNREAL.frostMoveSlow——虚幻寒冷区域维持 -35% 分道）；BOSS 减半（×0.70）。
  // 调用点：06-enemy updateEnemies 每帧重算 e.speedMul = speedMulBase × 本函数；05-boss bossMoveUpdate 的 mul（BOSS 移速）
  function enemyFrostZoneMoveMul(e) {
    let mul = 1;
    for (const z of frostZones) {
      if (!z.affectsEnemies) continue;
      if (Math.hypot(e.x - z.x, e.y - z.y) > z.r) continue;
      const slow = e.type === 'boss'
        ? 1 - (1 - UNREAL.frostMoveSlow) * UNREAL.bossResist
        : UNREAL.frostMoveSlow;
      mul = Math.min(mul, slow);
    }
    const ff = state.frostField;
    if (ff && Math.hypot(e.x - ff.x, e.y - ff.y) <= ff.r) {
      const slow = e.type === 'boss' ? 0.70 : 0.40;
      mul = Math.min(mul, slow);
    }
    return mul;
  }

  // 特殊3类：御4 —— 防御型无人机：下降到与常规 3 类炮艇一致的悬停高度停留 25s（速度为其 80%）；
  // 登场 0.5s 后展开金色六边力场（光环内敌人受到的非真实伤害 -30%），不攻击
  function spawnYu4(holdTimer) {
    const e = makeEnemy('yu4', rand(110, CANVAS_W - 110), -60, {
      hoverY: rand(110, 170),   // 与常规 3 类炮艇相同的悬停带
      holdTimer: holdTimer != null ? holdTimer : YU4.dwell,
      // 不传 fireTimer：沿用注册表 fireInterval[1e9,1e9] 天文默认（此前误传 1.2s，导致登场后穿透通用开火
      // 逻辑放出一波默认弹幕——与铁砧同款问题，见 spawnAnvil 注释）
    });
    e.auraT = 0;   // 登场计时（超过 auraDelay 后光环渐显）
    return e;
  }

  // 铁砧：治疗无人机，悬停于炮火先兆者(75~110)前方一些（更靠下），停留 25s（同御4），0.5s 后展开正方形治疗光环；
  // edgeX / staticFix（战争幽灵半血召唤用）：指定入场横位（边缘区 40~130px）并固定横位不巡航（同 BOSS 召唤先兆者）
  function spawnAnvil(holdTimer, edgeX, staticFix) {
    const e = makeEnemy('anvil', edgeX != null ? edgeX : rand(110, CANVAS_W - 110), -60, {
      hoverY: rand(120, 165),   // 炮火先兆者停留位置前方（更靠下）
      holdTimer: holdTimer != null ? holdTimer : ANVIL.dwell,
      // 铁砧不攻击：不再传 fireTimer，沿用注册表 fireInterval[1e9,1e9] 的天文默认间隔；
      // （此前误传 1.2s 导致到场后穿透 updateEnemyFire 通用段、落到 capital 默认弹幕放出 6 枚扇形弹）
      staticX: !!staticFix,
    });
    e.auraT = 0;   // 登场计时（超过 auraDelay 后治疗光环渐显）
    e.healT = 0;   // 治疗节拍计时
    return e;
  }

  // 焦香螺旋桨：火焰灼烧无人机，登场后移动到场地 40% 以下位置绕大圈巡航；35% 概率从侧翼出场
  function spawnJiaoxiang() {
    // 圆心/半径逐次随机：半径 150~200、圈底 84%~94% 屏高（圈底越低，光环越接近乃至烧到屏幕最下方）；
    // 圆心 X 在屏中心附近随机（受边框余量收缩：半径越大越贴中线）；轨迹由绕圈阶段出界硬 clamp 兜底，绝不出边框
    const m = JIAOXIANG.orbitMargin;
    const R = rand(JIAOXIANG.orbitRMin, JIAOXIANG.orbitRMax);
    const bottom = CANVAS_H * rand(JIAOXIANG.orbitBottomMin, JIAOXIANG.orbitBottomMax);
    const cx = CANVAS_W / 2 + rand(-1, 1) * Math.max(0, CANVAS_W / 2 - R - m);
    const cy = clamp(bottom - R, R + m + 14, CANVAS_H - R - m);
    const flank = Math.random() < JIAOXIANG.flankChance;
    let e;
    if (flank) {
      // 侧翼出场：从左/右侧水平入场，无登场加速，光环延迟 1.2s
      const fromLeft = Math.random() < 0.5;
      const sx = fromLeft ? -60 : CANVAS_W + 60;
      e = makeEnemy('jiaoxiang', sx, cy, {});
      e.jxFlank = true;
      e.jxPhase = 0;         // 0=入场移动, 1=绕圈
      e.jxDir = fromLeft ? 1 : -1;   // 水平移动方向
      e.jxTargetX = fromLeft ? cx - R : cx + R;   // 入场目标点（圈边缘）
      e.jxTargetY = cy;
      e.jxOrbitDir = Math.random() < 0.5 ? e.jxDir : -e.jxDir;   // 绕圈方向：50% 与入场动量衔接（顺/逆时针各随侧翼）/ 50% 反向（改为往下方开始转）
      e.vx = e.jxDir * JIAOXIANG.speed;   // 初始速度：水平朝内（无加速）
      e.vy = 0;
    } else {
      // 顶部出场：就位前 150% 移速加成（到位前一段距离按剩余距离衰减），光环延迟 0.8s
      const sx = rand(80, CANVAS_W - 80);
      e = makeEnemy('jiaoxiang', sx, -60, {});
      e.jxFlank = false;
      e.jxPhase = 0;
      e.jxTargetX = cx;      // 入场目标点：圈顶
      e.jxTargetY = cy - R;
      e.jxOrbitDir = Math.random() < 0.5 ? 1 : -1;   // 绕圈方向随机
      // 初始速度：朝目标点方向，带 150% 入场加成（满值起步，随后按剩余距离衰减）
      const idx = e.jxTargetX - sx, idy = e.jxTargetY - (-60);
      const il = Math.hypot(idx, idy) || 1;
      const iv = JIAOXIANG.speed * JIAOXIANG.entryBoost;
      e.vx = idx / il * iv;
      e.vy = idy / il * iv;
    }
    e.jxCx = cx;             // 本体专属绕圈圆心 X（逐次随机）
    e.jxCy = cy;             // 本体专属绕圈圆心 Y（逐次随机）
    e.jxR = R;               // 本体专属绕圈半径（逐次随机）
    e.auraT = 0;             // 登场计时（超过 auraDelay 后火焰光环渐显）
    e.jxSpinA = Math.random() * Math.PI * 2;   // 三根横杠初始角（随机）
    e.jxSpinB = Math.random() * Math.PI * 2;
    e.jxSpinC = Math.random() * Math.PI * 2;
    // 旋转方向：B/C（白圆上的两根）方向一致随机，A（直径杠）独立随机
    const bcDir = Math.random() < 0.5 ? 1 : -1;
    const aDir = Math.random() < 0.5 ? 1 : -1;
    e.jxSpdA = JIAOXIANG.spinA * aDir;
    e.jxSpdB = JIAOXIANG.spinB * bcDir;
    e.jxSpdC = JIAOXIANG.spinC * bcDir;
    e.jxJitX = 0; e.jxJitY = 0;   // 绕圈相干随机漂移初值（OU 游走状态，见 updateEnemyMovement）
    return e;
  }

  // 御4防御光环减伤判定：目标敌机中心位于任一已显现的御4光环内时，受到的非真实伤害 ×0.70（-30%）
  // （真实伤害——高能爆弹——在 useBomb 直接结算，不经过此乘区）
  function yu4AuraMul(target) {
    for (const g of enemies) {
      if (g.type !== 'yu4' || g.auraT < YU4.auraDelay) continue;
      if (Math.hypot(target.x - g.x, target.y - g.y) <= YU4.auraR)
        return 1 - YU4.dmgReduce;
    }
    return 1;
  }

  // 特殊2类奖励无人机：斗志昂扬 / 赞助无人机 / 豪华赞助无人机 —— 每次关卡提升按难度概率刷新一架（每次至多一架，
  // 三种按 5/4/1 加权抽取，见 01-config REWARD_DRONES），从屏幕左/右侧出现朝对侧横穿（速度=威龙×1.5，赞助系 ×0.8），
  // 同时沿余弦曲线上下浮动；无碰撞、不攻击；击毁后：斗志触发攻速/弹速翻倍增益，赞助系掉落奖励道具（见 killEnemy / updateDouzhiFx）
  function spawnDouzhi(droneType = 'douzhi') {
    const fromLeft = Math.random() < 0.5;
    const dirX = fromLeft ? 1 : -1;
    const x = fromLeft ? -60 : CANVAS_W + 60;
    const y = rand(CANVAS_H * 0.22, CANVAS_H * 0.55);   // 入场高度：场地上半部
    const e = makeEnemy(droneType, x, y, {});
    e.dirX = dirX;         // 横穿方向（左→右 或 右→左）
    e.baseY = y;           // 余弦轨迹基准高度
    e.cosPhase = Math.random() * Math.PI * 2;   // 上下浮动初相位
    return e;
  }

  // ---------- 图鉴挑战模式 ----------
  // 生成挑战目标 count 个（Shift+= 群召 10 个用）；悬停型给极大 holdTimer 使其永驻场持续攻击
  function spawnChallengeTarget(count = 1) {
    for (let n = 0; n < count; n++) spawnChallengeTargetOne();
  }

  function spawnChallengeTargetOne() {
    const ch = state.challenge;
    const cx = CANVAS_W / 2;
    switch (ch.type) {
      case 'side':
        // 侧翼艇：50% 顶部斜插（232111 同款方向基值 ±24 / 90~111 → 快速 200）/ 50% 侧翼斜插——仅从左侧窜出（同常规 1类侧翼入场 → 慢速 150）；
        // 两速体系与正常游戏一致（含入场冲刺），飞出屏幕后由 updateChallenge 重新生成
        if (Math.random() < 0.5) {
          spawnSideUnit(-36, rand(CANVAS_H * 0.35, CANVAS_H * 0.45),
            { vx: rand(90, 120), vy: rand(54, 84) }, ch.behavior || 'shoot', 1.0);
        } else {
          makeEnemy('side', cx - 130, -40, { behavior: ch.behavior || 'shoot', fireTimer: 1.0 })._sideVel = sideVelocity(24, rand(90, 111), true);
        }
        break;
      case 'prolifera':
        // 增生侧翼艇：同 1类（50% 顶部斜插快速 / 50% 仅左侧侧翼入场慢速；挑战模式敌方不死，不会分裂）
        if (Math.random() < 0.5) {
          spawnSideUnit(-36, rand(CANVAS_H * 0.35, CANVAS_H * 0.45),
            { vx: rand(90, 120), vy: rand(54, 84) }, 'prolifera', 1.0);
        } else {
          makeEnemy('prolifera', cx - 130, -40, { fireTimer: 1.0 })._sideVel = sideVelocity(24, rand(90, 111), true);
        }
        break;
      case 'striker':
        makeEnemy('striker', rand(70, CANVAS_W - 70), -50, { behavior: 'track', holdTimer: 1e9, variant: ch.variant });   // 随机水平位置入场（不固定居中）
        break;
      case 'gunship':
        makeEnemy('gunship', rand(110, CANVAS_W - 110), -60, { hoverY: 140, holdTimer: 1e9, variant: ch.variant });   // 随机水平位置入场（不固定居中，同常规随波生成）
        break;
      case 'harbinger':
        makeEnemy('harbinger', cx, -50, { hoverY: 95, holdTimer: 1e9 });
        break;
      case 'weilong':
        spawnWeilong();   // 蛇形巡航；飞出屏幕后由 updateChallenge 重新生成
        break;
      case 'hanshuang':
        spawnHanshuang();   // 不攻击；光圈减速射速；挑战模式永驻场
        break;
      case 'yu4':
        spawnYu4(1e9);   // 不攻击；防御光环减伤；挑战模式永驻场
        break;
      case 'anvil':
        spawnAnvil(1e9);   // 不攻击；治疗光环；挑战模式永驻场
        break;
      case 'baoling':
        spawnBaoling();   // 自爆突进（随机水平位置入场）；飞出屏幕后由 updateChallenge 重新生成
        break;
      case 'baolingG':
        spawnBaolingG();   // 暴鸰·G：同暴鸰（移速 -15%、爆炸半径 +30%）；飞出屏幕后由 updateChallenge 重新生成
        break;
      case 'jiaoxiang':
        spawnJiaoxiang();   // 绕圈巡航 + 火焰灼烧；挑战模式永驻场
        break;
      case 'pulseMatrix':
        spawnPulseMatrix(1e9);   // 测试页召唤；2026-10-02 起登场 20s 自爆全模式生效（1e9 永驻语义已作废）
        break;
      case 'douzhi':
        spawnDouzhi();   // 横穿（余弦浮动）；飞出屏幕后由 updateChallenge 重新生成
        break;
      case 'sponsor':
      case 'sponsorDeluxe':
        spawnDouzhi(ch.type);   // 赞助无人机 / 豪华赞助无人机：同斗志昂扬行动（盒子样式/掉落不同）；飞出屏幕后由 updateChallenge 重新生成
        break;
      case 'fashiA1':
        spawnFashiA1(rand(80, CANVAS_W - 80), -50);   // 下降+停移射击（随机水平位置入场）；飞出屏幕后由 updateChallenge 重新生成
        break;
      case 'fashiA2':
        spawnFashiA2(rand(80, CANVAS_W - 80), -70);   // A1 强化版（随机水平位置入场）；飞出屏幕后由 updateChallenge 重新生成
        break;
      case 'popian':
        spawnPopian(cx, -50);   // 直线急停锁停后持续红圈预警三连发导弹；停稳后永驻场
        break;
      case 'popianU':
        spawnPopianU(cx, -50);   // 破片U型：同破片流程（途中即瞄准、入场 1.8~2s 后即可攻击）；停稳后永驻场
        break;
      case 'warGhost':
        spawnWarGhost(true);   // 战争幽灵：风波预警极速入场 → 驻留中场技能循环（技能1/2/3）；挑战模式永驻场（不离场、不触发离场斩）
        break;
      case 'puxuefeng':
      case 'hanxixian':
      case 'xiayong':
      case 'xinguodong': {
        const el = spawnEliteMinion(ch.type, 1e9);   // 4S 精英：减速入场 → 驻留技能循环（首个随机、之后固定轮换）；挑战模式永驻场（dwell 传 1e9 不离场）
        el.hp = el.maxHp = 60000;   // 测试页 4S 精英血量固定 6w（2026-10-03 用户定稿；对局内黑暗之手召唤仍按 eliteHpOf 分难度表）
        break;
      }
      case 'fashiMatrix':
        spawnFashiMatrix(rand(60, CANVAS_W - 60), -50, { holdTimer: 1e9 });   // 随机水平位置入场（测试页可观察左/右不同发射角度下的立体面）→ 目标区胡乱移动 + 持续发射发光正方体；挑战模式永驻场
        break;
      case 'fashiArray': {
        const e = spawnFashiArray();   // 停驻发射大号正方体（飞行途中分裂）；挑战模式永驻场
        e.holdTimer = 1e9;
        break;
      }
      case 'warMatrix':
        spawnWarMatrix();   // 战争矩阵（占位）：入场悬停永驻场，机制待设计
        break;
      case 'capital':
        makeEnemy('capital', cx, -110, { hoverY: 140, holdTimer: 1e9, fireTimer: 1.8, variant: ch.variant });
        break;
      default:
        // 诗篇占位敌人（wip，见 01-config ENEMY_TYPES 占位批次）等无专属生成入口的类型：
        // 通用入场——随机水平位置下降到悬停带停留（挑战模式永驻场、不攻击）
        makeEnemy(ch.type, rand(70, CANVAS_W - 70), -50, { hoverY: rand(110, 170), holdTimer: 1e9 });
        break;
    }
  }

  // 波次测试：整波生成（图鉴「怪物权重 · 波次」行测试按钮入口；WAVE_FORMATIONS 纯编队，不含特殊3类随波附赠）。
  // 两个入口：进页首刷 / 场上清空后自动补刷（updateChallenge）；按 = 额外刷出一整波（不清场，14-main）
  function spawnChallengeWave(ch) {
    const f = WAVE_FORMATIONS[ch.wave];
    if (f) f.fn();
  }

  // 测试目标匹配（类型 + 变体 + 行为）——顶部血条 drawChallengeBar 与 Shift+= 群召计数共用同规则；
  // 召唤物/衍生体类型不同自然排除（如法术阵列召唤的法术矩阵）
  function challengeTargets() {
    const ch = state.challenge;
    return (ch && ch.kind === 'enemy')
      ? enemies.filter(e =>
          e.type === ch.type &&
          (ch.variant == null || e.variant === ch.variant) &&
          (ch.behavior == null || e.behavior === ch.behavior))
      : [];
  }

  // 挑战模式驱动：维持单个目标在场 + 敌方无限血量
  function updateChallenge(dt) {
    const ch = state.challenge;
    if (!ch) return;
    if (ch.kind === 'boss') {
      // 复用警报演出流程生成 BOSS（与旧 BOSS 试炼一致）
      if (bossFlow.stage === 'wait') {
        if (enemies.length === 0) {
          collectAllItems(); clearEnemyBullets(); clearMissiles();
          if (ch.bossId === 'storm2') {
            // 风暴编织者：与正常流程一致（无警报）——先放暴风之眼残影轰然消散，二阶段登场动画接管
            spawnStormGhost();
            spawnBoss('storm2');
            bossFlow.stage = 'fight';
          } else {
            bossFlow.stage = 'warn'; bossFlow.warnT = 0; startAlarm();
          }
        }
      } else if (bossFlow.stage === 'warn') {
        bossFlow.warnT += dt;
        // 旧日之歌：提前 3s 生成（黑洞在警报背后形成）
        if (!enemies.some(en => en.type === 'boss') && bossFlow.warnT >= BOSS_WARN_TOTAL - BOSS_SPAWN_EARLY) {
          spawnBoss(ch.bossId);
        }
        if (bossFlow.warnT >= BOSS_WARN_TOTAL) { stopAlarm(); bossFlow.stage = 'fight'; }
      } else if (bossFlow.stage === 'fight') {
        if (!enemies.some(e => e.type === 'boss')) bossFlow.stage = 'wait';   // 意外消失则重新登场
      }
    } else if (ch.kind === 'wave') {
      // 波次测试：场上清空后自动补刷一整波；按 = 额外刷出一整波（不清场，14-main）
      if (enemies.length === 0) spawnChallengeWave(ch);
    } else if (ch.kind === 'swarm') {
      // 持续刷怪测试（图鉴「数值与机制」发起）：不走单目标补刷——正常刷怪循环接管
      //（14-main 锁 bossFlow.timer=0 / Lv20：stage 恒 'none' 持续出怪、永不进 BOSS；spawnTimer 驱动波次）
    } else if (!enemies.some(e => e.type === ch.type)) {
      spawnChallengeTarget();
    }
    // 测试模式改版：敌方真实血量（1类 4000 / 2~4类 10000，由 makeEnemy 在生成时覆盖），不再每帧回满、不再锁定 BOSS 测试血量；
    // 炮火先兆者导引导弹满一轮后重置充能循环，便于持续观察
    for (const e of enemies) {
      if (e.type === 'harbinger' && e.missilesGuided >= HARBINGER.maxMissiles) {
        e.missilesGuided = 0; e.chargeT = 0; e.chargeWave = 0; e.firedThisCycle = false;   // 导引满一轮后重置循环（回首波动画）
      }
    }
  }

  export {
    strikerVariantWeights, sideSpawnWeights, pickVariant, makeEnemy, pickSideSpawn, spawnSideUnit, spawnSideGroup,
    spawnStrikerGroup, spawnMirrorRow, spawnSideSweep, spawnSideKamikazeStream, spawnStrikerVee, spawnGunshipWings,
    spawnDiagonalRaid, spawnSideColumn, spawnPostBossWave, spawnBossMinionWave, fieldPressureW, spawnPressureThreshold,
    capitalMaxWait, SPECIAL3_POOL, special3Weight, spawnWave, WAVE_FORMATIONS, pickFormation,
    spawnWaveBody, spawnGunship, rollFashiA1, spawnFashiA1, spawnFashiA2,
    rollPopian, spawnPopian, rollFashiMatrix, spawnFashiMatrix, spawnBaoling, spawnHarbinger,
    spawnFashiArray, spawnWarMatrix, spawnCapitalSlot,
    spawnCapital, buildWeilongPath, spawnWeilong, spawnHanshuang, playerFrostSlowMul, playerFrostMoveMul,
    spawnUnreal, enemyFrostZoneMoveMul,
    spawnYu4, spawnAnvil, spawnJiaoxiang, yu4AuraMul, spawnDouzhi, spawnChallengeTarget, challengeTargets,
    spawnChallengeWave, spawnPopianU, spawnWarGhost, spawnEliteMinion, spawnRevivedElite, spawnPulseMatrix,
    updateChallenge,
  };