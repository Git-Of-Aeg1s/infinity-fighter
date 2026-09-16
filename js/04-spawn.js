// 04-spawn：敌机工厂 / 编队与波次 / 场面压力刷新 / 特殊敌人生成 / 图鉴挑战模式
'use strict';

  // ---------- 敌机 ----------
  /**
   * 创建敌机。behavior / variant.skill 决定移动 / 开火模式：
   *   side:     'pass'无攻击斜插 | 'shoot'追踪射击 | 'kamikaze'亡语垂直射击
   *   striker:  变体技能 crimson/straight(直射±10°、首发+1s) | amber/spread(前方双弹) | azure/homing(追踪、首发+1s、概率虚化护盾) | white/silent(不开火、到位停 2s)
   *   gunship:  pattern 0扇形 / 1环形 / 2双连炮 循环
   *   capital:  pattern 0双臂螺旋 / 1九连扇形齐射 / 2环形爆发 循环
   */
  function makeEnemy(type, x, y, opts = {}) {
    const cfg = ENEMY_TYPES[type];
    const hpBonus = 0;   // 已取消关卡血量加成，所有敌机始终使用基础 HP
    // 2/3/4 类选取变体（不同颜色 + 不同技能）；opts.variant 可强制指定（图鉴挑战用）
    const variant = (type === 'striker' || type === 'gunship' || type === 'capital')
      ? (opts.variant ? (VARIANTS[type].find(v => v.id === opts.variant) || pickVariant(type)) : pickVariant(type))
      : null;
    // 初次发射间隔：赤红/幽蓝突击艇（firstDelay）首次开火额外 +1s（仅首发，后续按常规间隔）
    let initFire = opts.fireTimer != null ? opts.fireTimer : rand(cfg.fireInterval[0], cfg.fireInterval[1]);
    if (variant && variant.firstDelay) initFire += variant.firstDelay;
    const e = {
      type,
      x, y,
      w: cfg.w, h: cfg.h,
      hp: cfg.hp + hpBonus,
      maxHp: cfg.hp + hpBonus,
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
      wobble: Math.random() * Math.PI * 2,
      behavior: opts.behavior || 'pass',
      hoverY: opts.hoverY || 0,
      arrived: false,
      holdTimer: opts.holdTimer || 0,   // striker 短暂停顿 / gunship・capital 悬停时长
      speedMul: opts.speedMul != null ? opts.speedMul : 1,   // 移动/下落速度倍率（特殊编队用）
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
      firedThisCycle: false, // 仅 harbinger：本轮是否已召唤导弹
      missilesGuided: 0,     // 仅 harbinger：已导引导弹数（上限 4）
    };
    // 蓝色4类(capital azure)：出现时 20% 概率带护盾，前 6s 虚化不会受伤
    if (type === 'capital' && variant && variant.id === 'azure' && Math.random() < PHASE_CHANCE) {
      e.shielded = true;
      e.phase = PHASE_DURATION;
    }
    // 幽蓝2类(striker azure)：登场 10% 概率 1s 虚化护盾、10% 概率 2s 虚化护盾（复用 e.phase 通用虚化机制）
    if (type === 'striker' && variant && variant.id === 'azure') {
      const sr = Math.random();
      if (sr < 0.10) { e.shielded = true; e.phase = 1; }
      else if (sr < 0.20) { e.shielded = true; e.phase = 2; }
    }
    // 霜白2类(striker white)：到位后停留 2s 再冲锋（覆盖常规短停顿；挑战模式的超长停留不覆盖）
    if (variant && variant.skill === 'silent' && e.holdTimer < 2) e.holdTimer = 2;
    // 幽暮2类(striker dusk)：生命值 64；忽略编队入场点，改为在落点（场地 30%~80% 高度随机位置）正上方浮现，
    // 渐显后下移落点停驻、环射、渐隐离场 —— 状态机见 updateEnemyMovement 的 dusk 分支
    if (type === 'striker' && variant && variant.id === 'dusk') {
      e.hp = e.maxHp = DUSK.hp;
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
    // 黄色1类（shoot）：首次（也是唯一一次）攻击间隔扩大为当前的 180%~280%（每架独立随机），整场只攻击一次
    if (type === 'side' && e.behavior === 'shoot') {
      e.fireTimer = initFire * rand(1.8, 2.8);
    }
    // 卫护飞船（增生侧翼艇衍生）：出厂必带虚化护盾 —— 75% 0.1s / 22% 0.16s / 2% 0.2s / 1% 0.4s（时长全部翻倍：原 0.05/0.08/0.1/0.2）
    if (type === 'escort') {
      const pr = Math.random();
      e.shielded = true;
      if (pr < 0.75) e.phase = 0.1;
      else if (pr < 0.97) e.phase = 0.16;
      else if (pr < 0.99) e.phase = 0.2;
      else e.phase = 0.4;
    }
    // 暴鸰（自爆无人机）：0 巡航下压 / 1 停车锁定（预警倒计时）/ 2 投弹后原地停留 / 3 继续俯冲
    if (type === 'baoling') {
      e.blPhase = 0;
      e.blT = 0;           // 登场计时（armDelay 后才具备投弹判定）
      e.blThrown = false;  // 炸弹是否已脱离（未脱离时被击毁 → 原地爆炸）
      e.blWarn = null;     // 停车锁定阶段的预警区 { tx, ty, t }
      e.blWaitT = 0;       // 投弹后停留计时
    }
    enemies.push(e);
    return e;
  }
  
  // 1类单位统一入口：常规 1类按行为概率生成，另以 10% 概率替换为增生侧翼艇（淡青绿、无攻击、阵亡分裂卫护飞船）
  function spawnSideUnit(x, y, vel, behavior, fireTimer) {
    const e = Math.random() < 0.10
      ? makeEnemy('prolifera', x, y, { fireTimer })
      : makeEnemy('side', x, y, { behavior, deathShot: behavior === 'kamikaze', fireTimer });
    e._sideVel = vel;
    return e;
  }

  // 1类：从场地中部略偏上的两侧斜插窜出，最少 3 个一组；编队形态随机（纵队/斜线/横排梯队/V字），一碰就碎
  // 行为概率：shoot 10% / kamikaze 20% / pass 70%；速度基值已降 40%（×0.6），实际速度另乘 SIDE_SPEED_MUL；整组同速以保持队形
  function spawnSideGroup() {
    const fromLeft = Math.random() < 0.5;
    const dirX = fromLeft ? 1 : -1;
    const n = 3 + Math.floor(Math.random() * 3);    // 3~5 架（最少三个一组）
    const vx = dirX * rand(90, 120);                // 原 150~200 × 0.6（另乘 SIDE_SPEED_MUL）
    const vy = rand(54, 84);                         // 原 90~140 × 0.6（另乘 SIDE_SPEED_MUL）
    const edgeX = fromLeft ? -36 : CANVAS_W + 36;   // 屏幕侧外入场
    const baseY = rand(CANVAS_H * 0.36, CANVAS_H * 0.46);   // 入场基准高度：场地中部略偏上（两侧窜出）
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
        // V 字/箭头：中间领先，两侧后掠
        const off = Math.abs(k - mid);
        x = edgeX - dirX * off * 46;
        y = baseY - off * 38;
      }
      const r = Math.random();
      const behavior = r < 0.10 ? 'shoot' : r < 0.30 ? 'kamikaze' : 'pass';
      spawnSideUnit(x, y, { vx, vy }, behavior, rand(0.8, 1.6));
    }
  }
  
  // 2类：从上方入场，在指定位置停留8s后再向下冲锋
  function spawnStrikerGroup() {
    const n = 1 + Math.floor(Math.random() * 2);
    const vShape = Math.random() < 0.4;
    const gap = 72;
    const x0 = rand(70, CANVAS_W - 70 - (n - 1) * gap);
    for (let k = 0; k < n; k++) {
      const x = x0 + k * gap;
      const y = vShape ? -50 - Math.abs(k - (n - 1) / 2) * 40 : -50 - k * 16;
      makeEnemy('striker', x, y, {
        behavior: Math.random() < 0.25 ? 'track' : 'straight',
        holdTimer: 8,   // 停留8s后再冲锋
      });
    }
  }
  
  // 特殊编队：左右对称的 232232 横排（两个 3 稍慢）
  function spawnMirrorRow() {
    const seq = [2, 3, 2, 2, 3, 2];   // 回文对称
    const gap = 70;
    const x0 = (CANVAS_W - (seq.length - 1) * gap) / 2;
    // 两个 3 类：各 1.5% 判定替换为暴鸰；只要有一架被替换，两架都改为暴鸰（成对自爆突入）
    const blPair = seq.some(t => t === 3) && (rollBaoling() || rollBaoling());
    for (let k = 0; k < seq.length; k++) {
      const x = x0 + k * gap;
      if (seq[k] === 2) {
        makeEnemy('striker', x, -50, {
          behavior: Math.random() < 0.25 ? 'track' : 'straight',
          holdTimer: rand(0.4, 0.8),
        });
      } else if (blPair) {
        spawnBaoling(x);
      } else {
        // 3 类稍慢一点
        makeEnemy('gunship', x, -60, {
          hoverY: rand(120, 165),
          holdTimer: 30,
          fireTimer: 1.4,
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
      const vx = dirX * rand(99, 117);                  // 原 165~195 × 0.6（另乘 SIDE_SPEED_MUL），从一边扫向另一边
      const vy = rand(54, 69);                           // 原 90~115 × 0.6（另乘 SIDE_SPEED_MUL），同时下沉
      const edgeX = fromLeft ? -30 : CANVAS_W + 30;    // 屏幕侧外入场
      for (let k = 0; k < count; k++) {
        const r = Math.random();
        const behavior = r < 0.10 ? 'shoot' : r < 0.30 ? 'kamikaze' : 'pass';
        // 后方跟随：队尾更靠外、更高，形成长队斜线
        const x = edgeX - dirX * k * gap;
        const y = startY - k * gap * 0.55;
        spawnSideUnit(x, y, { vx, vy }, behavior, rand(0.8, 1.6));
      }
    }
  }

  // 特殊编队：左右两侧各依次出来七个 1 类紫（kamikaze 自爆），成纵列斜扫穿越（紫=亡语向下垂直射一发）
  function spawnSideKamikazeStream() {
    const count = 7;
    const gap = 64;                                    // 队列间距：保证依次入场
    const startY = CANVAS_H * 0.40;                    // 入场高度：场地中部略偏上（两侧窜出）
    for (const fromLeft of [true, false]) {
      const dirX = fromLeft ? 1 : -1;
      const vx = dirX * rand(99, 117);                 // 与侧翼斜扫同速（基值 ×0.6，另乘 SIDE_SPEED_MUL）
      const vy = rand(54, 69);
      const edgeX = fromLeft ? -30 : CANVAS_W + 30;
      for (let k = 0; k < count; k++) {
        // 后方跟随：队尾更靠外、更高，形成长队斜线依次入场
        const x = edgeX - dirX * k * gap;
        const y = startY - k * gap * 0.55;
        makeEnemy('side', x, y, {
          behavior: 'kamikaze',
          deathShot: true,
          fireTimer: rand(0.8, 1.6),
        })._sideVel = { vx, vy };
      }
    }
  }

  // 对称编队：2类组成箭头/V 字，从上方对称俯冲
  function spawnStrikerVee() {
    const cx = CANVAS_W / 2;
    makeEnemy('striker', cx, -46, { behavior: 'track', holdTimer: rand(0.4, 0.7) });   // 顶点
    const pairs = 3;
    for (let k = 1; k <= pairs; k++) {
      const dx = k * 56;
      const y = -46 - k * 42;                          // 逐级滞后 → V 字
      for (const sx of [-1, 1]) {
        makeEnemy('striker', cx + sx * dx, y, {
          behavior: Math.random() < 0.25 ? 'track' : 'straight',
          holdTimer: rand(0.4, 0.8),
        });
      }
    }
  }

  // 对称编队：左右各一艘 3类炮艇压阵，中间 2类护航（各 1.5% 独立判定替换为暴鸰）
  function spawnGunshipWings() {
    for (const sx of [-1, 1]) {
      const x = CANVAS_W / 2 + sx * 150;
      if (rollBaoling()) spawnBaoling(x);
      else makeEnemy('gunship', x, -60, {
        hoverY: rand(115, 160),
        holdTimer: 30,
        fireTimer: 1.3,
      });
    }
    for (let k = -1; k <= 1; k++) {
      makeEnemy('striker', CANVAS_W / 2 + k * 60, -50, {
        behavior: Math.random() < 0.3 ? 'track' : 'straight',
        holdTimer: rand(0.5, 1.0),
      });
    }
  }

  // 非对称编队：一列混编沿对角线从一个上角斜插入场
  function spawnDiagonalRaid() {
    const fromLeft = Math.random() < 0.5;
    const n = 6;
    const stepX = fromLeft ? 62 : -62;
    const startX = fromLeft ? 60 : CANVAS_W - 60;
    for (let k = 0; k < n; k++) {
      const x = startX + k * stepX;
      const y = -40 - k * 40;                          // 阶梯式滞后 → 斜线
      if (k === 3) {
        // 1.5% 概率被暴鸰替换
        if (rollBaoling()) spawnBaoling(x);
        else makeEnemy('gunship', x, y - 20, { hoverY: rand(110, 155), holdTimer: 30, fireTimer: 1.3 });
      } else if (k % 2 === 0) {   // k=0/2/4 → 1类（三个一组，满足≥3）
        spawnSideUnit(x, y, { vx: fromLeft ? 24 : -24, vy: rand(90, 111) }, Math.random() < 0.10 ? 'shoot' : 'pass', rand(0.8, 1.5));   // 基值 ×0.6，另乘 SIDE_SPEED_MUL
      } else {
        makeEnemy('striker', x, y, { behavior: Math.random() < 0.25 ? 'track' : 'straight', holdTimer: rand(0.4, 0.9) });
      }
    }
  }

  // 1类长队：单侧数艘排成一列斜插入场（波次中间小概率穿插，代替部分零散生成）
  function spawnSideColumn() {
    const fromLeft = Math.random() < 0.5;
    const count = 4 + Math.floor(Math.random() * 4);   // 数艘：4~7
    const gap = 54;                                    // 队列间距（沿行进反方向排开）
    const dirX = fromLeft ? 1 : -1;
    const vx = dirX * rand(90, 120);                   // 与常规 1类同速（基值 ×0.6，另乘 SIDE_SPEED_MUL）
    const vy = rand(54, 84);
    const edgeX = fromLeft ? -36 : CANVAS_W + 36;      // 屏幕侧外入场
    const startY = rand(CANVAS_H * 0.36, CANVAS_H * 0.46);  // 入场高度：场地中部略偏上（两侧窜出）
    for (let k = 0; k < count; k++) {
      const r = Math.random();
      const behavior = r < 0.10 ? 'shoot' : r < 0.30 ? 'kamikaze' : 'pass';
      // 排成长队：队尾依次靠外、靠上，形成一列斜线
      const x = edgeX - dirX * k * gap;
      const y = startY - k * gap * 0.5;
      spawnSideUnit(x, y, { vx, vy }, behavior, rand(0.8, 1.6));
    }
  }

  // BOSS 击败后的固定首波：一群 1类排成长队从左或从右入场、横穿战场自另一侧离场；
  // 本波不出现紫色（kamikaze）1类（仅 shoot 10% / pass 90%；增生侧翼艇 10% 混入规则照常）
  function spawnPostBossWave() {
    const fromLeft = Math.random() < 0.5;
    const count = 5 + Math.floor(Math.random() * 3);   // 5~7：长队
    const gap = 54;                                    // 队列间距（沿行进反方向排开）
    const dirX = fromLeft ? 1 : -1;
    const vx = dirX * rand(90, 120);                   // 与常规 1类同速（基值 ×0.6，另乘 SIDE_SPEED_MUL）
    const vy = rand(54, 84);
    const edgeX = fromLeft ? -36 : CANVAS_W + 36;      // 屏幕侧外入场
    const startY = rand(CANVAS_H * 0.36, CANVAS_H * 0.46);  // 入场高度：场地中部略偏上
    for (let k = 0; k < count; k++) {
      const behavior = Math.random() < 0.10 ? 'shoot' : 'pass';   // 固定首波无紫色
      // 排成长队：队尾依次靠外、靠上，形成一列斜线
      const x = edgeX - dirX * k * gap;
      const y = startY - k * gap * 0.5;
      spawnSideUnit(x, y, { vx, vy }, behavior, rand(0.8, 1.6));
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
    if (state.level < 10) return 0.20;
    return Math.min(0.30, 0.20 + (state.level - 10) * 0.01);
  }

  // 特殊3类槽位强制刷新上限（压力高时的最长槽位空闲等待，随等级缩短）：拖得太长仍会刷新
  function specialMaxWait() {
    return Math.max(4, 12 - (state.level - 2) * 0.6);   // Lv2 10.8s → Lv10 6s → Lv12+ 4s
  }

  // 4类主力舰强制刷新上限（同上，节奏更慢）
  function capitalMaxWait() {
    return Math.max(10, 34 - (state.level - 3) * 1.5);  // Lv3 34s → Lv10 23.5s → Lv16 14.5s
  }

  // 3类槽位抽取：本局首次（仅第一轮）必为炮火先兆者；之后按阶段权重抽取——
  // Lv10 以下（第一轮）：普通炮艇 80% / 先兆者 20%（寒霜、威龙、御4、暴鸰不出场）；
  // Lv10 起（实际仅第二轮出现）：炮艇 35 / 先兆者 20 / 寒霜 20 / 威龙 10 / 御4 15 / 暴鸰 10（总 110）
  // （暴鸰已实装：spawnBaoling 常驻可用，Lv10 起直接按权重参与抽取）
  function pickSpecial3Spawn() {
    const hiLv = state.level >= 10;
    const pool = [
      { fn: spawnGunship, w: hiLv ? 35 : 80 },
      { fn: spawnHarbinger, w: hiLv ? 20 : 20 },
      { fn: spawnHanshuang, w: hiLv ? 20 : 0 },
      { fn: spawnWeilong, w: hiLv ? 10 : 0 },
      { fn: spawnYu4, w: hiLv ? 15 : 0 },   // 御4：Lv10 前不出场
      { fn: spawnBaoling, w: hiLv ? 10 : 0 },   // 暴鸰
    ].filter(it => it.w > 0 && typeof it.fn === 'function');
    let total = 0;
    for (const it of pool) total += it.w;
    let r = Math.random() * total;
    for (const it of pool) { r -= it.w; if (r <= 0) return it.fn; }
    return pool[pool.length - 1].fn;
  }

  function spawnWave() {
    state.waveSeq++;
    const before = enemies.length;
    spawnWaveBody();
    for (let i = before; i < enemies.length; i++) enemies[i].waveTag = state.waveSeq;
  }

  // 编队权重表：每波按权重随机抽取编队；权重自 unlockLv 起随关卡线性增长、封顶 cap
  // 设计意图：基础编队权重恒定，总权重随关卡增大 → 基础编队占比稀释、特殊编队密度上升；
  // 威胁度越高越晚解锁、权重越低；占 3 类槽的编队（slotGunship：炮艇悬停 30s 冻结冷却槽）压到最低档
  const WAVE_FORMATIONS = [
    { fn: spawnSideGroup,          unlockLv: 1, w0: 18, growth: 0,   cap: 18 },  // 1类小组 3~5 架
    { fn: spawnStrikerGroup,       unlockLv: 1, w0: 30, growth: 0,   cap: 30 },  // 2类小组 1~2 架
    { fn: spawnSideColumn,         unlockLv: 1, w0: 8,  growth: 1,   cap: 12 },  // 1类长队 4~7 架
    { fn: spawnMirrorRow,          unlockLv: 2, w0: 10, growth: 3,   cap: 16 },  // 回文对称横排
    { fn: spawnSideSweep,          unlockLv: 2, w0: 10, growth: 3,   cap: 16 },  // 双侧对称斜扫
    { fn: spawnStrikerVee,         unlockLv: 2, w0: 10, growth: 3,   cap: 16 },  // 2类 V 字俯冲
    { fn: spawnSideKamikazeStream, unlockLv: 3, w0: 8,  growth: 3,   cap: 14 },  // 紫自爆流（压迫感强）
    { fn: spawnDiagonalRaid,       unlockLv: 3, w0: 6,  growth: 2.5, cap: 11, slotGunship: true },  // 对角奇袭（含炮艇）
    { fn: spawnGunshipWings,       unlockLv: 3, w0: 4,  growth: 2.5, cap: 9,  slotGunship: true },  // 双炮艇压阵
  ];

  // 按权重抽编队；excludeSlot 为 true 时排除占用 3 类槽的编队（组合波追加位不用）
  function pickFormation(excludeSlot) {
    let total = 0;
    const pool = [];
    for (const f of WAVE_FORMATIONS) {
      if (state.level < f.unlockLv) continue;
      if (excludeSlot && f.slotGunship) continue;
      const w = Math.min(f.cap, f.w0 + f.growth * (state.level - f.unlockLv)) *
              (state.bossPhase >= 1 && f.slotGunship ? 0.5 : 1);   // 第二轮：含炮艇编队（对角奇袭/双炮艇）权重减半，控制普通炮艇综合刷新率
      pool.push({ f, w });
      total += w;
    }
    let r = Math.random() * total;
    for (const it of pool) {
      r -= it.w;
      if (r <= 0) return it.f;
    }
    return pool[pool.length - 1].f;
  }

  function spawnWaveBody() {
    pickFormation(false).fn();
    // 组合波：Lv3 起有概率同波追加一个编队（追加位不占 3 类槽），概率随关卡增长（Lv7+ 封顶 30%）
    if (state.level >= 3 && Math.random() < Math.min(0.30, 0.15 + (state.level - 3) * 0.04)) {
      pickFormation(true).fn();
    }
  }
  
  // 3类：炮艇，上方悬停很久后才缓慢下压；1.5% 概率被暴鸰替换（Lv10 前暴鸰唯一出场途径）
  function spawnGunship() {
    if (Math.random() < BAOLING.replaceChance) return spawnBaoling();
    makeEnemy('gunship', rand(110, CANVAS_W - 110), -60, {
      hoverY: rand(110, 170),
      holdTimer: 30,
      fireTimer: 1.2,
    });
  }

  // 普通炮艇替换判定：1.5% 概率改为暴鸰
  function rollBaoling() {
    return Math.random() < BAOLING.replaceChance;
  }

  // 特殊3类：暴鸰 —— 自爆无人机：不悬停、以炮艇 40% 速度径直下压；登场 0.8s 后进入玩家距离内即
  // 停车锁定（玩家位置浮现红色预警区）→ 炸弹向下脱离（火星四溅）→ 1s 后极速加速冲向预警区中心爆炸（仅伤玩家）；
  // 投弹后以炮艇 110% 速度继续俯冲离场；被击毁时若炸弹尚未投出 → 原地爆炸（敌我通杀）
  function spawnBaoling(x) {
    return makeEnemy('baoling', x != null ? x : rand(110, CANVAS_W - 110), -60, {});
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

  // 4类：主力舰，居中悬停很久，出场即带 1/2 类护航
  function spawnCapital() {
    makeEnemy('capital', CANVAS_W / 2, -110, {
      hoverY: 140,
      holdTimer: 40,
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
    e.attackT = 0;     // 攻击窗口（>0 时停止移动）
    e.waypoints = buildWeilongPath(spawnX, mirror);
    shake(5, 0.35);
    return e;
  }

  // 特殊3类：寒霜 —— 不攻击，直线下移到场地 60%~80% 随机高度停留 20s 后向下离场；
  // 登场 1s 后周身渐显（0.8s 渐入）较大范围冰蓝寒霜光圈，圈内我方战机射速降低 35%（以核心位置判定）；
  // 出厂随机携带虚化盾：30% 概率 1.5s / 20% 概率 2s / 10% 概率 2.5s / 5% 概率 5s（虚化期间不受伤害、炮弹穿过）
  function spawnHanshuang() {
    const e = makeEnemy('hanshuang', rand(80, CANVAS_W - 80), -60, {});
    e.targetY = rand(CANVAS_H * 0.60, CANVAS_H * 0.80);   // 停留高度（从上往下 60%~80%）
    e.dwellT = HANSHUANG.dwell;   // 到位后停留倒计时
    e.auraT = 0;                  // 登场计时（超过 auraDelay 后光圈渐显）
    // 出厂虚化盾（复用 e.phase 通用虚化机制）：30% 概率 1.5s / 20% 概率 2s / 10% 概率 2.5s / 5% 概率 5s，其余 35% 不带盾
    const pr = Math.random();
    if (pr < 0.30) { e.shielded = true; e.phase = 1.5; }
    else if (pr < 0.50) { e.shielded = true; e.phase = 2; }
    else if (pr < 0.60) { e.shielded = true; e.phase = 2.5; }
    else if (pr < 0.65) { e.shielded = true; e.phase = 5; }
    shake(4, 0.3);
    return e;
  }

  // 寒霜光圈减速判定：玩家核心（判定点）位于任一已显现的寒霜光圈内时，冷却流速 ×0.65（射速 -35%）
  function playerFrostSlowMul() {
    for (const e of enemies) {
      if (e.type !== 'hanshuang' || e.auraT < HANSHUANG.auraDelay) continue;
      if (Math.hypot(player.x - e.x, player.y + PLAYER.hitOffsetY - e.y) <= HANSHUANG.auraR)
        return HANSHUANG.fireSlow;
    }
    return 1;
  }

  // 寒霜光圈移动减速：玩家核心位于光圈内时移动速度 ×0.75（-25%）
  function playerFrostMoveMul() {
    for (const e of enemies) {
      if (e.type !== 'hanshuang' || e.auraT < HANSHUANG.auraDelay) continue;
      if (Math.hypot(player.x - e.x, player.y + PLAYER.hitOffsetY - e.y) <= HANSHUANG.auraR)
        return HANSHUANG.moveSlow;
    }
    return 1;
  }

  // 特殊3类：御4 —— 防御型无人机：下降到与常规 3 类炮艇一致的悬停高度停留 25s（速度为其 80%）；
  // 登场 0.5s 后展开金色六边力场（光环内敌人受到的非真实伤害 -30%），不攻击
  function spawnYu4(holdTimer) {
    const e = makeEnemy('yu4', rand(110, CANVAS_W - 110), -60, {
      hoverY: rand(110, 170),   // 与常规 3 类炮艇相同的悬停带
      holdTimer: holdTimer != null ? holdTimer : YU4.dwell,
      fireTimer: 1.2,
    });
    e.auraT = 0;   // 登场计时（超过 auraDelay 后光环渐显）
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

  // ---------- 图鉴挑战模式 ----------
  // 生成挑战目标（单个敌人）；悬停型给极大 holdTimer 使其永驻场持续攻击
  function spawnChallengeTarget() {
    const ch = state.challenge;
    const cx = CANVAS_W / 2;
    switch (ch.type) {
      case 'side':
        // 侧翼艇：缓慢斜插（基值 ×0.6，另乘 SIDE_SPEED_MUL），飞出屏幕后由 updateChallenge 重新生成
        makeEnemy('side', cx - 130, -40, { behavior: ch.behavior || 'shoot', fireTimer: 1.0 })._sideVel = { vx: 33, vy: 42 };
        break;
      case 'prolifera':
        // 增生侧翼艇：同 1类缓慢斜插（挑战模式敌方不死，不会分裂）
        makeEnemy('prolifera', cx - 130, -40, { fireTimer: 1.0 })._sideVel = { vx: 33, vy: 42 };
        break;
      case 'striker':
        makeEnemy('striker', cx, -50, { behavior: 'track', holdTimer: 1e9, variant: ch.variant });
        break;
      case 'gunship':
        makeEnemy('gunship', cx, -60, { hoverY: 140, holdTimer: 1e9, fireTimer: 1.2, variant: ch.variant });
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
      case 'baoling':
        spawnBaoling(CANVAS_W / 2);   // 自爆突进；飞出屏幕后由 updateChallenge 重新生成
        break;
      case 'capital':
        makeEnemy('capital', cx, -110, { hoverY: 140, holdTimer: 1e9, fireTimer: 1.8, variant: ch.variant });
        break;
    }
  }

  // 挑战模式驱动：维持单个目标在场 + 敌方无限血量
  function updateChallenge(dt) {
    const ch = state.challenge;
    if (!ch) return;
    if (ch.kind === 'boss') {
      // 复用警报演出流程生成 BOSS（与旧 BOSS 试炼一致）
      if (state.bossStage === 'wait') {
        if (enemies.length === 0) { state.bossStage = 'warn'; state.warnT = 0; collectAllItems(); clearEnemyBullets(); clearMissiles(); startAlarm(); }
      } else if (state.bossStage === 'warn') {
        state.warnT += dt;
        // 旧日之歌：提前 3s 生成（黑洞在警报背后形成）
        if (!enemies.some(en => en.type === 'boss') && state.warnT >= BOSS_WARN_TOTAL - BOSS_SPAWN_EARLY) {
          spawnBoss(ch.bossId);
        }
        if (state.warnT >= BOSS_WARN_TOTAL) { stopAlarm(); state.bossStage = 'fight'; }
      } else if (state.bossStage === 'fight') {
        if (!enemies.some(e => e.type === 'boss')) state.bossStage = 'wait';   // 意外消失则重新登场
      }
    } else if (!enemies.some(e => e.type === ch.type)) {
      spawnChallengeTarget();
    }
    // 敌方无限血量：每帧回满；炮火先兆者导弹导引满后重置，循环召唤
    // 例外——BOSS 测试模式的 BOSS：e.hp 锁定到“测试血量基准”testHp，
    //   使我方子弹伤害被每帧覆盖抵消（BOSS 对炮火无敌），仅高能爆弹能削血（见 useBomb）
    for (const e of enemies) {
      if (ch.kind === 'boss') {
        // BOSS 测试：仅 BOSS 本体锁定 testHp（对炮火无敌）；其召唤的小怪（炮火先兆者）不回血，可被正常击杀
        if (e.type === 'boss') {
          if (e.testHp == null) e.testHp = e.maxHp;
          e.hp = e.testHp;
        }
      } else if (e.hp < e.maxHp) {
        e.hp = e.maxHp;
      }
      if (e.type === 'harbinger' && e.missilesGuided >= 4) {
        e.missilesGuided = 0; e.chargeT = 0; e.firedThisCycle = false;
      }
    }
  }

