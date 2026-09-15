/**
 * 大无垠战机 · Great Boundless Fighter
 * 一个纯 Canvas 2D 实现的雷霆战机风格 Demo。
 *
 * 操作：
 *   W/A/S/D  移动战机
 *   Space    释放炸弹（清屏 + 全体敌机 -30 HP）
 *   P        暂停 / 继续
 *   R        重新开始
 */

(() => {
  'use strict';

  // ---------- 常量 ----------
  const CANVAS_W = 480;
  const CANVAS_H = 720;

  const PLAYER = {
    w: 40,
    h: 44,
    speed: 260,          // px/s
    maxHp: 100,
    lives: 2,            // 初始两条命
    fireInterval: 0.16,  // s
    bulletSpeed: 780,
    bulletDamage: 12,
    invulnTime: 1.2,     // 受击后无敌
    respawnTime: 1.6,    // 掉命后重生延迟
    magnetRadius: 110,   // 水晶吸附半径
    hitRadius: 4,        // 判定点半径：仅机身中心小点被击中才算命中
  };

  // 火力 5 级：直射窄弹道，射线数递增；5 级攻速大幅提升且每发为双连发（主弹 + 尾随暗弹）
  // L4 的 7 条射线中 2 条与相邻重叠，不增加攻击宽度
  const WEAPON_LEVELS = [
    null,
    { name: 'Lv1', interval: 0.24 },   // 3 射线，射速稍慢
    { name: 'Lv2', interval: 0.19 },   // 4 射线
    { name: 'Lv3', interval: 0.14 },   // 5 射线，射速正常
    { name: 'Lv4', interval: 0.12 },   // 7 射线（含重叠）
    { name: 'Lv5', interval: 0.12 },   // 暴走：限时 6s，攻速同 Lv4，弹速提升
  ];
  const BERSERK = { interval: 0.12, dmgMul: 1.6, rMul: 1.4, duration: 6, spdMul: 1.6 };
  const SHIELD_DURATION = 8;   // 量子护盾持续时间

  // ---------- BOSS：旧日之歌 ----------
  // 第一个 BOSS：累计战斗约 60s 后登场，宽约 60% 屏宽，小幅左右巡航，仅 1 条命
  // 全局规则（适用于所有 BOSS）：技能乱序释放；若连续随机到同一技能，
  // 该技能结束后的冷却降为 20%（-80%）
  const BOSS_APPEAR_TIME = 60;   // 累计战斗时长（s）达到后出 BOSS
  const BOSS = {
    name: '旧日之歌',
    w: 288, h: 130,            // 宽度约 60% 屏宽
    hp: 30400,                 // 19000 × 1.6：首个 BOSS 血量上调 60%
    score: 5000,
    hoverY: 120,
    moveAmp: 78, moveSpeed: 0.55,   // 小幅左右巡航
    skillCd: 2.2,              // 技能间基础冷却（连中同技能 ×0.2）
    bulletDmg: 12, bigDmg: 14,
    longLen: 26,               // 长条弹长度：略短于 1 类敌机身长
    crashDmg: 50,
  };
  const BOSS_BULLET = { long: '#ff7a45', big: '#c9a0ff', arc: '#a5ffd6' };
  // long：普通长条弹（橙红，带描边）；big：技能2 大子弹；arc：技能5 双曲线弹流（特殊攻击保留幽绿色）

  // BOSS 注册表：测试模式按钮与警报演出由此生成；后续新 BOSS 在此追加
  const BOSSES = {
    song: { id: 'song', name: '旧日之歌', lv: 11 },
  };
  // 警报演出时长：横杠滑入 → 红色区域与名号展示 → 整体淡出
  const BOSS_WARN = { slide: 0.9, hold: 1.9, fade: 0.5 };
  const BOSS_WARN_TOTAL = BOSS_WARN.slide + BOSS_WARN.hold + BOSS_WARN.fade;

  // 战机注册表：后续新机在此追加，选机页自动生成卡片
  const PLANES = {
    chaos: {
      id: 'chaos',
      name: '混乱将至',
      desc: '直射弹道 · 3/4/5/7 条射线逐级加密<br />Lv5 双连发 + 高攻速',
      startWeapon: 3,   // 初始 Lv1 即 3 射线
      bulletColor: '#7ce7ff',
      trailColor: '#3d7d99',   // 双连发尾弹（颜色稍暗）
      berserkColor: '#ffb545',
      berserkTrail: '#8a6230',
    },
  };
  let currentPlane = PLANES.chaos;

  /**
   * 四类非 Boss 敌人：
   *   1类 side     侧上方斜插入场，血极低；多数无攻击，少数追踪射击 / 阵亡时向下垂直射击
   *   2类 striker  上方入场，血低；垂直向下直射，少部分追踪射击
   *   3类 gunship  上方入场，体型稍大血中；悬停上方，扇形 / 环形 / 双连炮多种弹幕
   *   4类 capital  上方居中入场，体型大血高；悬停上方，螺旋环 / 扇形齐射 / 环形爆发密集弹幕，
   *                 出场与在场期间由 1、2 类敌机护航
   */
  const ENEMY_TYPES = {
    side: {
      w: 34, h: 30, hp: 1,   score: 60,   color: '#8ce36b', drawScale: 1.4,
      bulletSpeed: 230, bulletR: 3, bulletDmg: 6, crashDmg: 12,
      fireInterval: [1.4, 2.2],
    },
    striker: {
      w: 46, h: 40, hp: 48,  score: 150,  color: '#ff8a5c', drawScale: 1.4,
      bulletSpeed: 280, bulletR: 4, bulletDmg: 8, crashDmg: 25,
      fireInterval: [1.1, 2.0],
    },
    gunship: {
      w: 76, h: 62, hp: 360,  score: 400,  color: '#c084fc', drawScale: 1.55,
      bulletSpeed: 250, bulletR: 4, bulletDmg: 8, crashDmg: 30,
      fireInterval: [1.8, 2.4],
    },
    capital: {
      w: 230, h: 160, hp: 2688, score: 1500, color: '#ff4d6d', drawScale: 2.4,
      bulletSpeed: 230, bulletR: 5, bulletDmg: 10, crashDmg: 40,
      fireInterval: [2.4, 2.8],
    },
    // 特殊3类：炮火先兆者（后排炮兵）—— 灰黑形体 + 红色充能核心，充满后召唤垂直落下的导弹
    harbinger: {
      w: 68, h: 68, hp: 300, score: 450, color: '#3a3f4a', drawScale: 1.4,
      bulletSpeed: 210, bulletR: 6, bulletDmg: 16, crashDmg: 12.5,   // 碰撞伤害为 2 类(25) 的 50%
      fireInterval: [4, 4],
    },
  };

  // 炮火先兆者参数
  const HARBINGER = {
    descend: 120,        // 进场/离场下降速度（比 2 类 160 更慢，无 3 类高速加成）
    charge: 4,           // 红色从中心扩展至通体红的充能时长
    cover: 2,            // 灰黑从中心覆盖红色的时长
    hold: 16,            // 就位停留时长（约导引 3 次导弹后开走）
    warnTime: 3,         // 导弹垂直预警线时长
    missileSpeed: 780,   // 导弹从上方下落速度（高速）
    missileR: 12,        // 导弹半径（宽于常规子弹）
    lowHpKill: 60,       // 玩家血量低于此值被导弹命中则直接击杀
  };

  /* ---------- 3/4 类变体：不同颜色 + 不同技能（weight 为出现权重） ----------
   * gunship 3类：紫(mixed 散射+追踪) / 红(aggressive 火力猛瞄准连射) / 金(ring 环形弹幕密集)
   * capital 4类：红(barrage 密集弹幕) / 蓝(lance 瞄准齐射+螺旋；出现时 20% 带护盾，前 6s 虚化不受伤害、炮弹穿过)
   */
  const VARIANTS = {
    gunship: [
      { id: 'violet',  color: '#c084fc', weight: 0.5, skill: 'mixed' },
      { id: 'crimson', color: '#ff5a5a', weight: 0.3, skill: 'aggressive' },
      { id: 'amber',   color: '#ffbf47', weight: 0.2, skill: 'ring' },
    ],
    capital: [
      { id: 'crimson', color: '#ff4d6d', weight: 0.6, skill: 'barrage' },
      { id: 'azure',   color: '#4d9fff', weight: 0.4, skill: 'lance' },
    ],
  };
  const PHASE_DURATION = 6;      // 蓝色4类护盾虚化时长
  const PHASE_CHANCE = 0.2;      // 蓝色4类带护盾概率

  // 按权重随机选取变体
  function pickVariant(type) {
    const list = VARIANTS[type];
    let r = Math.random();
    for (const v of list) {
      if (r < v.weight) return v;
      r -= v.weight;
    }
    return list[0];
  }

  const STAR_COUNT = 90;
  const MAX_BOMBS = 5;
  const BOMB_DAMAGE = 600;   // 高能爆弹对全场敌人造成的巨大伤害

  // ---------- DOM ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const hpFill = document.getElementById('hpFill');
  const hpText = document.getElementById('hpText');
  const scoreText = document.getElementById('scoreText');
  const levelText = document.getElementById('levelText');
  const bombText = document.getElementById('bombText');
  const livesText = document.getElementById('livesText');
  const weaponText = document.getElementById('weaponText');

  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayDesc = document.getElementById('overlayDesc');
  const startBtn = document.getElementById('startBtn');
  const planeSelect = document.getElementById('planeSelect');
  const planeGrid = document.getElementById('planeGrid');
  const bossTestRow = document.getElementById('bossTestRow');

  // ---------- 输入 ----------
  const keys = Object.create(null);
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      e.preventDefault();
    }
    if (k === 'p' && state.mode === 'playing') togglePause();
    if (k === 'r') resetGame(true, { keepTest: true });
    if (k === ' ' && state.mode === 'playing' && !state.paused) useBomb();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // ---------- 状态 ----------
  const state = {
    mode: 'idle',      // idle | playing | gameover
    paused: false,
    score: 0,
    level: 1,
    bombs: 1,
    lives: PLAYER.lives,
    time: 0,
    spawnTimer: 0,
    shakeTime: 0,
    shakeMag: 0,
    gunshipCd: 0,      // 3类炮艇出场冷却
    capitalCd: 0,      // 4类主力舰出场冷却
    harbingerIntro: false, // 本局是否已首次出场炮火先兆者（首次必定出场便于识别）
    bossTimer: 0,      // BOSS 登场倒计时（累计战斗时长）
    bossStage: 'none', // BOSS 流程：none | wait(等清场) | warn(警报演出) | fight(BOSS战)
    warnT: 0,          // 警报演出计时
    pendingBoss: 'song',   // 即将登场的 BOSS id
    testBoss: null,    // 测试模式：直接挑战的 BOSS id
  };

  const player = {
    x: CANVAS_W / 2,
    y: CANVAS_H - 90,
    w: PLAYER.w,
    h: PLAYER.h,
    hp: PLAYER.maxHp,
    cooldown: 0,
    invuln: 0,
    alive: true,
    weapon: 1,         // 火力等级 1~4
    berserkBanner: 0,  // “暴走”字样展示剩余时间（抵达 Lv5 时）
    berserk: 0,        // 暴走（Lv5）剩余持续时间，归零回落 Lv4
    shield: 0,         // 量子护盾剩余时间
    respawnTimer: 0,   // 掉命后重生倒计时
    hitCount: 0,       // 受击计数：累计两次才掉一层火力
  };

  /** @type {Array} */ let enemies = [];
  /** @type {Array} */ let pBullets = [];
  /** @type {Array} */ let eBullets = [];
  /** @type {Array} */ let particles = [];
  /** @type {Array} */ let powerups = [];
  /** @type {Array} */ let crystals = [];
  /** @type {Array} */ let missileWarns = [];   // 炮火先兆者导弹垂直预警线
  /** @type {Array} */ let missiles = [];       // 预警结束后从上方下落的导弹
  /** @type {Array} */ let stars = [];

  // ---------- 星空 ----------
  function initStars() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
        z: Math.random() * 0.8 + 0.2,   // 视深度：影响速度与亮度
      });
    }
  }

  function updateStars(dt) {
    for (const s of stars) {
      s.y += (30 + s.z * 140) * dt;
      if (s.y > CANVAS_H) {
        s.y = -2;
        s.x = Math.random() * CANVAS_W;
      }
    }
  }

  function drawStars() {
    for (const s of stars) {
      const a = 0.35 + s.z * 0.55;
      ctx.fillStyle = `rgba(200, 225, 255, ${a.toFixed(3)})`;
      const size = s.z > 0.7 ? 2 : 1;
      ctx.fillRect(s.x | 0, s.y | 0, size, size);
    }
  }

  // ---------- 工具 ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function spawnParticles(x, y, color, count = 14, speed = 180) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = rand(speed * 0.3, speed);
      particles.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: rand(0.3, 0.7),
        age: 0,
        color,
        size: rand(1.5, 3.5),
      });
    }
  }

  function shake(mag = 6, time = 0.25) {
    state.shakeMag = Math.max(state.shakeMag, mag);
    state.shakeTime = Math.max(state.shakeTime, time);
  }

  // ---------- 敌机 ----------
  /**
   * 创建敌机。behavior 决定移动 / 开火模式：
   *   side:     'pass'无攻击斜插 | 'shoot'追踪射击 | 'kamikaze'亡语垂直射击
   *   striker:  'straight'垂直直射 | 'track'追踪射击
   *   gunship:  pattern 0扇形 / 1环形 / 2双连炮 循环
   *   capital:  pattern 0双臂螺旋 / 1九连扇形齐射 / 2环形爆发 循环
   */
  function makeEnemy(type, x, y, opts = {}) {
    const cfg = ENEMY_TYPES[type];
    const hpBonus = (state.level - 1) * 6;
    // 3/4 类随机选取变体（不同颜色 + 不同技能）
    const variant = (type === 'gunship' || type === 'capital') ? pickVariant(type) : null;
    const e = {
      type,
      x, y,
      w: cfg.w, h: cfg.h,
      hp: cfg.hp + hpBonus,
      maxHp: cfg.hp + hpBonus,
      vx: 0, vy: 0,
      color: variant ? variant.color : cfg.color,
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
      fireTimer: opts.fireTimer != null ? opts.fireTimer : rand(cfg.fireInterval[0], cfg.fireInterval[1]),
      pattern: 0,
      burst: null,       // 多发连射状态（螺旋 / 双连炮）
      burstTimer: 0,
      deathShot: opts.deathShot || false,
      escortTimer: 0,    // 仅 capital：周期召唤护航
      leaving: false,        // 停留结束后停止攻击、以进场速度前开走
      chargeT: 0,            // 仅 harbinger：红/灰充能循环计时
      firedThisCycle: false, // 仅 harbinger：本轮是否已召唤导弹
      missilesGuided: 0,     // 仅 harbinger：已导引导弹数（上限 3）
    };
    // 蓝色4类：出现时 20% 概率带护盾，前 6s 虚化不会受伤
    if (variant && variant.id === 'azure' && Math.random() < PHASE_CHANCE) {
      e.shielded = true;
      e.phase = PHASE_DURATION;
    }
    enemies.push(e);
    return e;
  }
  
  // 1类：从侧上方斜插入场，少量成群，一碰就碎
  function spawnSideGroup() {
    const fromLeft = Math.random() < 0.5;
    const n = 1 + Math.floor(Math.random() * 2);   // 1~2 架
    for (let k = 0; k < n; k++) {
      const x = fromLeft ? -36 - k * 56 : CANVAS_W + 36 + k * 56;
      const y = rand(-60, 40) - k * 22;
      const vx = (fromLeft ? 1 : -1) * rand(150, 200);
      const vy = rand(90, 140);
      const r = Math.random();
      const behavior = r < 0.2 ? 'shoot' : r < 0.4 ? 'kamikaze' : 'pass';
      makeEnemy('side', x, y, {
        behavior,
        deathShot: behavior === 'kamikaze',
        fireTimer: rand(0.8, 1.6),
      })._sideVel = { vx, vy };
    }
  }
  
  // 2类：从上方入场，短暂停顿后向下前进
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
        holdTimer: rand(0.5, 1.1),   // 入场后先停顿
      });
    }
  }
  
  // 特殊编队：左右对称的 232232 横排（两个 3 稍慢）
  function spawnMirrorRow() {
    const seq = [2, 3, 2, 2, 3, 2];   // 回文对称
    const gap = 70;
    const x0 = (CANVAS_W - (seq.length - 1) * gap) / 2;
    for (let k = 0; k < seq.length; k++) {
      const x = x0 + k * gap;
      if (seq[k] === 2) {
        makeEnemy('striker', x, -50, {
          behavior: Math.random() < 0.25 ? 'track' : 'straight',
          holdTimer: rand(0.4, 0.8),
        });
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
    const startY = 58;                                 // 入场上缘高度
    for (const fromLeft of [true, false]) {
      const dirX = fromLeft ? 1 : -1;                  // 横向穿越方向
      const vx = dirX * rand(165, 195);                // 从一边扫向另一边
      const vy = rand(90, 115);                        // 同时下沉 → 落到较靠下的另一边
      const edgeX = fromLeft ? -30 : CANVAS_W + 30;    // 屏幕侧外入场
      for (let k = 0; k < count; k++) {
        const r = Math.random();
        const behavior = r < 0.15 ? 'shoot' : r < 0.3 ? 'kamikaze' : 'pass';
        // 后方跟随：队尾更靠外、更高，形成长队斜线
        const x = edgeX - dirX * k * gap;
        const y = startY - k * gap * 0.55;
        makeEnemy('side', x, y, {
          behavior,
          deathShot: behavior === 'kamikaze',
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

  // 对称编队：左右各一艘 3类炮艇压阵，中间 2类护航
  function spawnGunshipWings() {
    for (const sx of [-1, 1]) {
      makeEnemy('gunship', CANVAS_W / 2 + sx * 150, -60, {
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
    const n = 5;
    const stepX = fromLeft ? 62 : -62;
    const startX = fromLeft ? 60 : CANVAS_W - 60;
    for (let k = 0; k < n; k++) {
      const x = startX + k * stepX;
      const y = -40 - k * 40;                          // 阶梯式滞后 → 斜线
      if (k === 2) {
        makeEnemy('gunship', x, y - 20, { hoverY: rand(110, 155), holdTimer: 30, fireTimer: 1.3 });
      } else if (k % 2 === 0) {
        makeEnemy('side', x, y, { behavior: Math.random() < 0.3 ? 'shoot' : 'pass', fireTimer: rand(0.8, 1.5) })._sideVel = { vx: fromLeft ? 40 : -40, vy: rand(150, 185) };
      } else {
        makeEnemy('striker', x, y, { behavior: Math.random() < 0.25 ? 'track' : 'straight', holdTimer: rand(0.4, 0.9) });
      }
    }
  }

  // 波次调度：常规 1/2 类混合，达到一定关卡后穿插特殊编队
  function spawnWave() {
    // 2 关起，约 40% 概率触发特殊编队（对称/非对称混合）
    if (state.level >= 2 && Math.random() < 0.40) {
      const specials = [spawnMirrorRow, spawnSideSweep, spawnStrikerVee, spawnGunshipWings, spawnDiagonalRaid];
      specials[Math.floor(Math.random() * specials.length)]();
      return;
    }
    const r = Math.random();
    if (r < 0.45) spawnSideGroup();
    else if (r < 0.88) spawnStrikerGroup();
    else { spawnSideGroup(); spawnStrikerGroup(); }
  }
  
  // 3类：炮艇，上方悬停很久后才缓慢下压
  function spawnGunship() {
    makeEnemy('gunship', rand(110, CANVAS_W - 110), -60, {
      hoverY: rand(110, 170),
      holdTimer: 30,
      fireTimer: 1.2,
    });
  }
  
  // 特殊3类：炮火先兆者（后排炮兵）—— 缓慢就位于更高处，充能召唤导弹，约 16s（最多 3 发）后以进场速度前开走
  function spawnHarbinger() {
    makeEnemy('harbinger', rand(120, CANVAS_W - 120), -50, {
      hoverY: rand(75, 110),
      holdTimer: HARBINGER.hold,
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

  // ---------- BOSS：旧日之歌 ----------
  function spawnBoss(id) {
    const B = BOSSES[id] || BOSSES.song;
    enemies.push({
      type: 'boss', bossId: B.id, name: B.name, lv: B.lv,
      x: CANVAS_W / 2, y: -100,
      w: BOSS.w, h: BOSS.h,
      hp: BOSS.hp, maxHp: BOSS.hp,
      score: BOSS.score,
      phase: 'enter',        // enter 中速进场 | unfold 展开 | combat 战斗
      unfoldT: 0, scale: 0.5, combatReady: false,
      moveT: 0, t: 0,
      skill: null, skillCd: 1.4, // 展开完毕后首个技能前的短暂停顿
      lastSkill: -1, forced5: false, dropBerserk: false,
    });
    shake(8, 0.5);
  }

  function pushBossBullet(x, y, ang, speed, opts = {}) {
    eBullets.push({
      x, y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      ax: opts.ax || 0,          // 横向加速度（技能5 的 1/4 双曲线弹道）
      r: opts.r != null ? opts.r : 3.5,
      len: opts.len || 0,        // >0 为长条弹（胶囊体判定）
      dmg: opts.dmg != null ? opts.dmg : BOSS.bulletDmg,
      color: opts.color || BOSS_BULLET.long,
    });
  }

  function updateBoss(e, dt) {
    e.t += dt;

    // 阶段一：中速进场
    if (e.phase === 'enter') {
      e.y += 150 * dt;
      if (e.y >= BOSS.hoverY) { e.y = BOSS.hoverY; e.phase = 'unfold'; e.unfoldT = 0; }
      return;
    }
    // 阶段二：展开（放大到完整体型），完毕后解除玩家开火锁定并进入战斗
    if (e.phase === 'unfold') {
      e.unfoldT += dt;
      const p = clamp(e.unfoldT / 0.9, 0, 1);
      e.scale = 0.5 + 0.5 * (1 - Math.pow(1 - p, 3));
      if (p >= 1) {
        e.phase = 'combat';
        e.scale = 1;
        e.combatReady = true;
        e.skillCd = 1.0;
        spawnParticles(e.x, e.y, BOSS_BULLET.long, 26, 240);
        shake(8, 0.4);
      }
      return;
    }

    e.moveT += dt;
    // 技能1期间停止移动，其余时间小幅左右巡航
    if (!e.skill || e.skill.id !== 0) {
      e.x = CANVAS_W / 2 + Math.sin(e.moveT * BOSS.moveSpeed) * BOSS.moveAmp;
    }

    if (e.skill) runBossSkill(e, e.skill, dt);
    else {
      e.skillCd -= dt;
      if (e.skillCd <= 0) startBossSkill(e);
    }

    // 血量 66%：掉落一个暴走道具（一次性）
    if (!e.dropBerserk && e.hp <= e.maxHp * 0.66) {
      e.dropBerserk = true;
      spawnPowerup(e.x, e.y + 50, 'berserk', 15);
    }
  }

  function startBossSkill(e) {
    const ratio = e.hp / e.maxHp;
    let id;
    // 血量 ≤30%：下一个技能强制为技能5（双曲线弹流）
    if (ratio <= 0.30 && !e.forced5) {
      id = 4;
      e.forced5 = true;
    } else {
      id = Math.floor(Math.random() * 5);   // 乱序释放
    }
    // 全局规则：连续随机到同一技能 → 技能间冷却 -80%
    e.skillCd = id === e.lastSkill ? BOSS.skillCd * 0.2 : BOSS.skillCd;
    // 血量 <50%：技能释放间隔额外降低 50%
    if (e.hp / e.maxHp < 0.5) e.skillCd *= 0.5;
    e.lastSkill = id;

    switch (id) {
      case 0:   // 双管极快速连发长条弹（持续约 1s：弹柱长度 ≈ 1/3 屏高）
        e.skill = { id: 0, t: 0, dur: 1.0, fire: 0, alt: 0 };
        break;
      case 1:   // 散射几轮很大的子弹
        e.skill = { id: 1, t: 0, dur: 2.0, roundT: 0, rounds: 0 };
        break;
      case 2: { // 机体四个随机部位：标记玩家当前位置，三连发 × 三轮（不追踪）
        const parts = [];
        for (let k = 0; k < 4; k++) {
          parts.push({ dx: rand(-0.42, 0.42) * e.w, dy: rand(-0.30, 0.30) * e.h, timer: 0.2 + k * 0.25, shots: 0 });
        }
        e.skill = { id: 2, t: 0, dur: 2.8, parts, mark: { x: player.x, y: player.y } };
        break;
      }
      case 3:   // 双管乱射长条弹（频率低于技能1，方向随机不规律）
        e.skill = { id: 3, t: 0, dur: 3.8, next: 0.1 };
        break;
      case 4:   // 双管依次向两侧射 1/4 双曲线弹流
        e.skill = { id: 4, t: 0, dur: 3.4, pairT: 0, alt: 0 };
        break;
    }
  }

  function runBossSkill(e, s, dt) {
    s.t += dt;
    const lx = e.x - e.w * 0.22, rx = e.x + e.w * 0.22;
    const by = e.y + e.h * 0.5;

    if (s.id === 0) {
      // 技能1：停止移动，双管极快速连发长条弹（直向为主 + 极轻微散射，避免弹柱连成激光）
      s.fire -= dt;
      if (s.fire <= 0) {
        s.fire = 0.07;
        s.alt ^= 1;
        for (const bx of [lx, rx]) {
          const ang = Math.PI / 2 + rand(-0.03, 0.03);
          pushBossBullet(bx, by, ang, 250, { len: BOSS.longLen, dmg: BOSS.bulletDmg });
        }
      }
    } else if (s.id === 1) {
      // 技能2：朝玩家方向散射 3 轮很大的子弹（密度低、间隔大、每轮随机缺失 30%~50%）
      s.roundT -= dt;
      if (s.roundT <= 0 && s.rounds < 3) {
        s.roundT = 0.8;
        s.rounds++;
        const missRate = rand(0.30, 0.50);   // 本轮缺失比例
        const base = Math.atan2(player.y - e.y, player.x - e.x);
        const n = 6;
        for (let k = 0; k < n; k++) {
          if (Math.random() < missRate) continue;   // 子弹随机缺失
          pushBossBullet(e.x, by, base + (k - (n - 1) / 2) * 0.16, 185, { r: 13, dmg: BOSS.bigDmg, color: BOSS_BULLET.big });
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
            pushBossBullet(px, py, base + k * 0.12, 270, { len: BOSS.longLen, dmg: BOSS.bulletDmg });
          }
        }
      }
    } else if (s.id === 3) {
      // 技能4：双管乱射长条弹，间隔与方向均不规律；10% 概率双管齐指玩家当前方向
      s.next -= dt;
      if (s.next <= 0) {
        s.next = rand(0.20, 0.40);
        const aim = Math.random() < 0.10;
        for (const bx of [lx, rx]) {
          const ang = aim
            ? Math.atan2(player.y - by, player.x - bx)
            : rand(0.1, Math.PI - 0.1) + rand(-0.15, 0.15);   // 以下半球为主的随机方向
          pushBossBullet(bx, by, ang, rand(160, 300), { len: BOSS.longLen, dmg: BOSS.bulletDmg });
        }
      }
    } else {
      // 技能5：双管依次（左右交替）向两侧射出 1/4 双曲线弹流
      // 血量 ≥50%：左管向左弯、右管向右弯；<50%：反转交叉（左→右，右→左）
      s.pairT -= dt;
      if (s.pairT <= 0) {
        s.pairT = 0.13;
        const leftBarrel = s.alt === 0;
        s.alt ^= 1;
        const cross = (e.hp / e.maxHp) < 0.5;
        const curveDir = leftBarrel !== cross ? -1 : 1;   // -1 向左弯，+1 向右弯
        const bx = leftBarrel ? lx : rx;
        const ang = Math.PI / 2 + curveDir * 0.12;
        pushBossBullet(bx, by, ang, 230, { r: 4, dmg: BOSS.bulletDmg, ax: curveDir * 115, color: BOSS_BULLET.arc });
      }
    }

    if (s.t >= s.dur) e.skill = null;
  }

  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.type === 'boss') {
        updateBoss(e, dt);
        // 撞玩家（BOSS 不受撞击反伤）
        if (player.alive && player.invuln <= 0 &&
            Math.abs(e.x - player.x) < e.w / 2 && Math.abs(e.y - player.y) < e.h / 2) {
          damagePlayer(BOSS.crashDmg);
        }
        continue;
      }
      e.wobble += dt * 2;
      if (e.phase > 0) e.phase -= dt;   // 虚化倒计时，归零后可被伤害
      updateEnemyMovement(e, dt);
      updateEnemyFire(e, dt);
  
      // 4类在场期间周期召唤护航
      if (e.type === 'capital') {
        e.escortTimer -= dt;
        if (e.escortTimer <= 0 && e.arrived) {
          e.escortTimer = rand(5, 7);
          if (Math.random() < 0.5) spawnSideGroup();
          else spawnStrikerGroup();
        }
      }
  
      // 飞出屏幕（仅穿越型会触发）
      if (e.y - e.h / 2 > CANVAS_H || e.x < -120 || e.x > CANVAS_W + 120) {
        enemies.splice(i, 1);
        continue;
      }
  
      // 撞玩家（仅机身中心判定点）
      if (player.alive && player.invuln <= 0 &&
          Math.hypot(e.x - player.x, e.y - player.y) < PLAYER.hitRadius + Math.max(e.w, e.h) / 2) {
        damagePlayer(ENEMY_TYPES[e.type].crashDmg);
        e.hp -= 40;
        spawnParticles(e.x, e.y, e.color, 18, 220);
        shake(10, 0.35);
        if (e.hp <= 0) killEnemy(i);
      }
    }
  }
  
  function updateEnemyMovement(e, dt) {
    if (e.type === 'side') {
      // 斜插直线穿越，不反弹
      const v = e._sideVel;
      e.x += v.vx * dt;
      e.y += v.vy * dt;
      return;
    }
    if (e.type === 'striker') {
      // 短暂停顿在上方，随后向下前进
      if (e.holdTimer > 0) {
        e.holdTimer -= dt;
        if (e.y < 60) e.y += 120 * dt;   // 停顿前先入屏
        e.x += Math.sin(e.wobble) * 14 * dt;
        return;
      }
      e.y += (160 + (state.level - 1) * 8) * dt;
      e.x += Math.sin(e.wobble) * 30 * dt;
      return;
    }
    // gunship / capital / harbinger：下降到悬停高度 → 停留开火 → 停止攻击、以进场同速前开走（可能撞击玩家）
    const cruise = (e.type === 'capital' ? 260 : e.type === 'harbinger' ? HARBINGER.descend : 320) * e.speedMul;
    if (!e.arrived) {
      e.y += cruise * dt;
      if (e.y >= e.hoverY) { e.y = e.hoverY; e.arrived = true; }
      return;
    }
    if (e.holdTimer > 0) {
      e.holdTimer -= dt;
      // 悬停期间水平巡航
      if (e.type === 'capital') {
        e.x = clamp(e.x + Math.sin(e.wobble * 0.35) * 30 * dt, e.w / 2 + 6, CANVAS_W - e.w / 2 - 6);
      } else {
        // gunship / harbinger：轻幅左右巡航（先兆者幅度更小，稳居后排）
        e.x += Math.sin(e.wobble * 0.6) * (e.type === 'harbinger' ? 24 : 50) * e.speedMul * dt;
      }
      e.x = clamp(e.x, e.w / 2, CANVAS_W - e.w / 2);
      return;
    }
    // 停留结束：停止攻击，以进场同速向下开走，直至飞出屏幕
    e.leaving = true;
    e.y += cruise * dt;
  }
  
  function updateEnemyFire(e, dt) {
    if (e.y < 0) return;   // 未入场不开火
    // 炮火先兆者：独立充能循环，红色充满即召唤导弹预警（最多导引 3 次）
    if (e.type === 'harbinger') {
      if (!e.arrived) return;
      if (e.leaving && e.missilesGuided >= 3) return;
      e.chargeT += dt;
      if (!e.firedThisCycle && e.chargeT >= HARBINGER.charge && e.missilesGuided < 3) {
        e.firedThisCycle = true;
        e.missilesGuided++;
        summonMissile(e);
      }
      if (e.chargeT >= HARBINGER.charge + HARBINGER.cover) { e.chargeT = 0; e.firedThisCycle = false; }
      return;
    }
    // 其余悬停型：停留结束、前开走阶段停止攻击
    if (e.leaving) return;
  
    // 连射状态（螺旋 / 双连炮）优先
    if (e.burst) {
      e.burstTimer -= dt;
      if (e.burstTimer <= 0) {
        const b = e.burst;
        const cfg = ENEMY_TYPES[e.type];
        pushEBullet(e, b.baseAng + b.step * b.shots, b.speed, cfg);
        if (b.mirror) pushEBullet(e, Math.PI - (b.baseAng + b.step * b.shots), b.speed, cfg);
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
  
    if (e.type === 'side') {
      // 仅 'shoot' 变体追踪射击
      if (e.behavior === 'shoot') {
        pushEBullet(e, Math.atan2(player.y - e.y, player.x - e.x) + rand(-0.06, 0.06), cfg.bulletSpeed, cfg);
      }
      return;
    }
    if (e.type === 'striker') {
      if (e.behavior === 'track') {
        pushEBullet(e, Math.atan2(player.y - e.y, player.x - e.x) + rand(-0.08, 0.08), cfg.bulletSpeed, cfg);
      } else {
        pushEBullet(e, Math.PI / 2, cfg.bulletSpeed, cfg);   // 垂直直射
      }
      return;
    }
    if (e.type === 'gunship') {
      if (e.skill === 'aggressive') {
        // 红：火力猛 —— 瞄准三连射 / 瞄准直射交替
        switch (e.pattern % 2) {
          case 0:
            e.burst = { baseAng: Math.atan2(player.y - e.y, player.x - e.x), step: 0, count: 3, shots: 0, gap: 0.12, speed: cfg.bulletSpeed * 1.25, mirror: false };
            e.burstTimer = 0;
            break;
          case 1: {
            const base = Math.atan2(player.y - e.y, player.x - e.x);
            for (let k = -1; k <= 1; k++) pushEBullet(e, base + k * 0.1, cfg.bulletSpeed * 1.1, cfg);
            break;
          }
        }
      } else if (e.skill === 'ring') {
        // 金：环形弹幕密集 —— 大环 / 小环交替
        switch (e.pattern % 2) {
          case 0: {
            const off = Math.random() * Math.PI * 2;
            for (let k = 0; k < 13; k++) pushEBullet(e, off + k * Math.PI * 2 / 13, cfg.bulletSpeed * 0.9, cfg);
            break;
          }
          case 1: {
            const off = Math.random() * Math.PI * 2;
            for (let k = 0; k < 8; k++) pushEBullet(e, off + k * Math.PI / 4, cfg.bulletSpeed * 1.05, cfg);
            break;
          }
        }
      } else {
        // 紫 mixed：散射 + 追踪（%4 循环）
        switch (e.pattern % 4) {
          case 0: {   // 散射：固定下方 7 发宽扇形（不锁定玩家）
            for (let k = -3; k <= 3; k++) pushEBullet(e, Math.PI / 2 + k * 0.22, cfg.bulletSpeed, cfg);
            break;
          }
          case 1: {   // 散射：10 发环形爆发
            const off = Math.random() * Math.PI * 2;
            for (let k = 0; k < 10; k++) pushEBullet(e, off + k * Math.PI / 5, cfg.bulletSpeed * 0.85, cfg);
            break;
          }
          case 2: {   // 追踪：瞄准玩家双连炮
            e.burst = { baseAng: Math.atan2(player.y - e.y, player.x - e.x), step: 0, count: 2, shots: 0, gap: 0.18, speed: cfg.bulletSpeed * 1.15, mirror: false };
            e.burstTimer = 0;
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
    // capital：按变体技能循环弹幕
    if (e.skill === 'lance') {
      // 蓝：更聚焦玩家 —— 瞄准五连齐射 / 11 发瞄准扇形 / 双臂螺旋
      switch (e.pattern % 3) {
        case 0:
          e.burst = { baseAng: Math.atan2(player.y - e.y, player.x - e.x), step: 0, count: 5, shots: 0, gap: 0.14, speed: cfg.bulletSpeed * 1.2, mirror: false };
          e.burstTimer = 0;
          break;
        case 1: {
          const base = Math.atan2(player.y - e.y, player.x - e.x);
          for (let k = -5; k <= 5; k++) pushEBullet(e, base + k * 0.12, cfg.bulletSpeed * 1.05, cfg);
          break;
        }
        case 2:
          e.burst = { baseAng: Math.random() * Math.PI * 2, step: 0.4, count: 12, shots: 0, gap: 0.1, speed: cfg.bulletSpeed, mirror: true };
          e.burstTimer = 0;
          break;
      }
    } else {
      // 红 barrage：三种密集弹幕循环
      switch (e.pattern % 3) {
        case 0: {   // 双臂螺旋：两侧镜像旋转连射 14 发
          e.burst = { baseAng: Math.random() * Math.PI * 2, step: 0.42, count: 14, shots: 0, gap: 0.1, speed: cfg.bulletSpeed, mirror: true };
          e.burstTimer = 0;
          break;
        }
        case 1: {   // 9 发宽扇形齐射
          const base = Math.atan2(player.y - e.y, player.x - e.x);
          for (let k = -4; k <= 4; k++) pushEBullet(e, base + k * 0.16, cfg.bulletSpeed * 1.05, cfg);
          break;
        }
        case 2: {   // 20 发环形爆发
          const off = Math.random() * Math.PI * 2;
          for (let k = 0; k < 20; k++) pushEBullet(e, off + k * Math.PI / 10, cfg.bulletSpeed * 0.9, cfg);
          break;
        }
      }
    }
    e.pattern++;
  }
  
  function pushEBullet(e, ang, speed, cfg) {
    eBullets.push({
      x: e.x, y: e.y + e.h / 2,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      r: cfg.bulletR,
      dmg: cfg.bulletDmg,
      color: '#ffd166',
    });
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
    if (player.hp < HARBINGER.lowHpKill) {
      // 血量低于 60：直接击杀（走标准掉命/结束流程）
      damagePlayer(player.hp + 100);
    } else {
      // 血量 >= 60：失去 80% 当前血量 + 武器等级 -1
      player.hp = player.hp * 0.2;
      if (player.weapon > 1) player.weapon--;
      player.berserk = 0;
      player.invuln = PLAYER.invulnTime;
      shake(12, 0.5);
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
          Math.hypot(m.x - player.x, m.y - player.y) < PLAYER.hitRadius + m.r) {
        missileHitPlayer();
        missiles.splice(i, 1);
        continue;
      }
      if (m.y > CANVAS_H + 40) { missiles.splice(i, 1); continue; }
    }
  }

  // 高能爆弹等清场时一并清除导弹与预警线
  function clearMissiles() {
    missileWarns.length = 0;
    missiles.length = 0;
  }
  
  function killEnemy(index) {
    const e = enemies[index];
    // BOSS 击毁：单独结算
    if (e.type === 'boss') {
      state.score += e.score;
      spawnParticles(e.x, e.y, '#ffffff', 60, 380);
      spawnParticles(e.x, e.y, BOSS_BULLET.long, 40, 300);
      shake(22, 1.0);
      for (let k = 0; k < 16; k++) {
        const giant = Math.random() < 0.004;
        crystals.push({
          x: e.x + rand(-90, 90), y: e.y + rand(-20, 20),
          vx: 0, vy: rand(150, 200),
          r: giant ? 15 : 6, val: giant ? 500 : 10,
          giant, t: Math.random() * Math.PI * 2,
        });
      }
      // 击败 BOSS 25% 掉落高能爆弹
      if (Math.random() < 0.25) spawnPowerup(e.x, e.y, 'bomb', 12);
      state.bossStage = 'none';   // BOSS 流程结束，重新累计登场计时
      state.bossTimer = 0;
      enemies.splice(index, 1);
      return;
    }
    // 1类亡语 variants：阵亡时向下垂直射击
    if (e.deathShot) {
      const cfg = ENEMY_TYPES[e.type];
      pushEBullet(e, Math.PI / 2, cfg.bulletSpeed * 1.1, cfg);
    }
    spawnParticles(e.x, e.y, e.color, 22, 260);
    state.score += e.score;
    shake(4, 0.15);
    // 3 / 4 类击毁后进入下一轮出场冷却
    if (e.type === 'gunship' || e.type === 'harbinger') state.gunshipCd = rand(14, 20);
    if (e.type === 'capital') {
      state.capitalCd = rand(30, 40);
      spawnParticles(e.x, e.y, '#ffd166', 30, 340);
      shake(14, 0.5);
      // 高能爆弹：击败 4 类主力舰 7% 掉落（BOSS 为 25%，待 BOSS 加入后接入）
      if (Math.random() < 0.07) spawnPowerup(e.x, e.y, 'bomb', 12);
    }
    // 水晶掉落：大概率，数量随体型增加；直接垂直下坠，不乱飘
    const dropR = Math.random();
    const cCount =
      e.type === 'capital' ? 8 + Math.floor(Math.random() * 8) :
      e.type === 'gunship' || e.type === 'harbinger' ? 4 + Math.floor(Math.random() * 4) :
      1 + Math.floor(Math.random() * 3);
    if (dropR < (e.type === 'side' ? 0.55 : 0.8)) {
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
    // 升级套件 12% / 量子护盾 5% / 加血套件 2.4%
    // 注：高能爆弹不在此通用池，仅由 4 类（7%）与 BOSS（25%）掉落
    // 场上升级套件数 + 我方当前攻击等级 === 4 时，升级套件掉率减半（12%→6%）
    const kitOnField = powerups.reduce((n, p) => n + (p.kind === 'kit' ? 1 : 0), 0);
    const kitRate = (kitOnField + player.weapon) === 4 ? 0.06 : 0.12;
    const pr = Math.random();
    if (pr < kitRate) {
      // 升级套件；其中 5% 变为暴走道具（红橙大 S，吃到攻击等级立刻满级）
      if (Math.random() < 0.05) spawnPowerup(e.x, e.y, 'berserk', 15);
      else spawnPowerup(e.x, e.y, 'kit', 12);
    } else if (pr < kitRate + 0.05) {
      spawnPowerup(e.x, e.y, 'shield', 13);
    } else if (pr < kitRate + 0.074) {
      spawnPowerup(e.x, e.y, 'hp', 12);
    }
    enemies.splice(index, 1);
  }

  // ---------- 玩家 ----------
  // 直射弹道：各级射线 [x, y] 偏移（x 间距为原本 3 倍，y 高低错落成“矮中高中矮”）
  // y 越负 = 发射点越靠前（高）；机身已放大 1.5 倍，鼻在 -33 附近
  const WEAPON_LINES = {
    1: [[0, -22], [-18, -6], [18, -6]],                                          // 3 条：高矮矮
    2: [[-27, -6], [-9, -15], [9, -15], [27, -6]],                                // 4 条：矮中中矮
    3: [[-27, -6], [-15, -14], [0, -22], [15, -14], [27, -6]],                    // 5 条：矮中高中矮
    4: [[-24, -6], [-24, -6], [-9, -15], [0, -22], [9, -15], [24, -6], [24, -6]],  // 7 条（±24 重叠）
    5: [[-24, -6], [-24, -6], [-9, -15], [0, -22], [9, -15], [24, -6], [24, -6]],
  };

  function fireWeapon() {
    const dmg = PLAYER.bulletDamage;
    const r = 3;
    for (const [ox, oy] of WEAPON_LINES[player.weapon]) {
      pBullets.push({ x: player.x + ox, y: player.y + oy, vx: 0, vy: -PLAYER.bulletSpeed, r, dmg, color: currentPlane.bulletColor });
    }
  }

  // 暴走（Lv5）：十射线双连发，3 倍宽度 + 高低错落，射速/伤害大幅提升
  function fireWeaponBerserk() {
    const dmg = PLAYER.bulletDamage * BERSERK.dmgMul;
    const r = 3 * BERSERK.rMul;
    const lines = [
      [-27, -6], [-27, -6], [-15, -14], [-15, -14], [0, -22],
      [0, -22], [15, -14], [15, -14], [27, -6], [27, -6],
    ];
    for (const [ox, oy] of lines) {
      pBullets.push({ x: player.x + ox, y: player.y + oy, vx: 0, vy: -PLAYER.bulletSpeed * BERSERK.spdMul, r, dmg, color: currentPlane.berserkColor });
      pBullets.push({ x: player.x + ox, y: player.y + oy + 18, vx: 0, vy: -PLAYER.bulletSpeed * BERSERK.spdMul * 0.98, r, dmg: dmg * 0.6, color: currentPlane.berserkTrail });
    }
  }

  function updatePlayer(dt) {
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
      player.x += dx * PLAYER.speed * dt;
      player.y += dy * PLAYER.speed * dt;
    }
    player.x = clamp(player.x, player.w / 2, CANVAS_W - player.w / 2);
    player.y = clamp(player.y, player.h / 2, CANVAS_H - player.h / 2);

    // 自动开火（Lv5 即暴走：使用暴走弹道与射速）
    // BOSS 出场演出期间停止攻击，展开完毕后立即恢复
    const berserk = player.weapon === 5;
    player.cooldown -= dt;
    if (player.cooldown <= 0) {
      if (!playerFireLocked()) {
        player.cooldown = berserk ? BERSERK.interval : WEAPON_LEVELS[player.weapon].interval;
        if (berserk) fireWeaponBerserk();
        else fireWeapon();
      } else {
        player.cooldown = 0;   // 保持就绪，解除锁定后立即开火
      }
    }

    if (player.invuln > 0) player.invuln -= dt;
    if (player.berserkBanner > 0) player.berserkBanner -= dt;
    // 暴走（Lv5）限时：倒计时归零后回落至 Lv4
    if (player.weapon === 5) {
      player.berserk -= dt;
      if (player.berserk <= 0) {
        player.berserk = 0;
        player.weapon = 4;
        spawnParticles(player.x, player.y, '#7ce7ff', 16, 200);
      }
    }
    if (player.shield > 0) {
      player.shield -= dt;
      if (player.shield <= 0) {
        player.shield = 0;
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
    return !enemies.some(e => e.type === 'boss' && e.combatReady);
  }

  function respawnPlayer() {
    player.alive = true;
    player.hp = PLAYER.maxHp;
    player.x = CANVAS_W / 2;
    player.y = CANVAS_H - 90;
    player.invuln = 2;
    player.weapon = 1;
    player.berserk = 0;
    player.shield = 0;
    player.hitCount = 0;
  }

  function damagePlayer(amount) {
    if (player.invuln > 0 || !player.alive) return;
    if (player.shield > 0) return;   // 护盾期间免疫碰撞伤害
    player.hp -= amount;
    player.invuln = PLAYER.invulnTime;
    shake(8, 0.3);
    spawnParticles(player.x, player.y, '#7ce7ff', 12, 180);
    // 被击中掉火力：累计受击两次才掉一层；暴走（Lv5）/护盾期间不计也不掉
    if (player.weapon < 5 && player.weapon > 1) {
      player.hitCount++;
      if (player.hitCount >= 2) { player.weapon--; player.hitCount = 0; }
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
  }

  // 拾取升级套件：升火力；抵达 Lv5 即进入暴走
  function pickupKit() {
    state.score += 50;
    if (player.weapon < 5) {
      player.weapon++;
      if (player.weapon === 5) {
        // 抵达 Lv5 即暴走：限时 6s，结束后回落 Lv4
        player.berserk = BERSERK.duration;
        player.berserkBanner = 1.5;   // 机身上方展示“暴走”字样
        shake(10, 0.4);
        spawnParticles(player.x, player.y, '#ffb545', 26, 260);
      }
    }
    // 已处于暴走（Lv5）：仅加分，不再叠加
  }

  // 拾取暴走道具：攻击等级立刻升满级（Lv5 即暴走，限时 6s）
  function pickupBerserk() {
    state.score += 100;
    player.weapon = 5;
    player.berserk = BERSERK.duration;
    player.berserkBanner = 1.5;
    shake(12, 0.5);
    spawnParticles(player.x, player.y, '#ff5a1f', 34, 320);
  }

  function useBomb() {
    if (state.bombs <= 0) return;
    state.bombs--;
    shake(18, 0.6);
    // 白闪
    flash = 0.6;
    // 清空敌弹 + 导弹/预警线
    clearEnemyBullets();
    clearMissiles();
    // 高能爆弹：瞬间秒杀除 BOSS 外的所有敌人（直接置 0，无视血量与关卡加成）
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].phase > 0) continue;   // 虚化期间免疫高能爆弹
      if (enemies[i].type === 'boss') {
        enemies[i].hp -= BOMB_DAMAGE;   // BOSS 仅受巨额伤害，不被秒杀
        spawnParticles(enemies[i].x, enemies[i].y, '#ffffff', 16, 260);
        if (enemies[i].hp <= 0) killEnemy(i);
      } else {
        spawnParticles(enemies[i].x, enemies[i].y, '#ffffff', 14, 240);
        enemies[i].hp = 0;
        killEnemy(i);
      }
    }
  }

  // ---------- 子弹 ----------
  function updateBullets(dt) {
    for (let i = pBullets.length - 1; i >= 0; i--) {
      const b = pBullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < -10) { pBullets.splice(i, 1); continue; }

      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (e.phase > 0) continue;   // 虚化：炮弹穿过护盾，可打到后面的敌人
        if (Math.abs(b.x - e.x) < e.w / 2 + b.r && Math.abs(b.y - e.y) < e.h / 2 + b.r) {
          e.hp -= b.dmg;
          spawnParticles(b.x, b.y, '#ffffff', 4, 120);
          pBullets.splice(i, 1);
          if (e.hp <= 0) killEnemy(j);
          break;
        }
      }
    }

    for (let i = eBullets.length - 1; i >= 0; i--) {
      const b = eBullets[i];
      if (b.ax) b.vx += b.ax * dt;   // 弧线弹（BOSS 技能5 的 1/4 双曲线弹道）
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y > CANVAS_H + 20 || b.y < -40 || b.x < -20 || b.x > CANVAS_W + 20) {
        eBullets.splice(i, 1); continue;
      }
      // 护盾加持：碰到护盾气泡的敌弹直接消解
      if (player.shield > 0 && player.alive &&
          Math.hypot(b.x - player.x, b.y - player.y) < 36 + b.r) {
        spawnParticles(b.x, b.y, '#6fe3ff', 6, 140);
        eBullets.splice(i, 1);
        continue;
      }
      // 命中判定：长条弹按胶囊体（判定点到弹体线段的最近距离）计算，普通弹按圆计算
      let hitPlayer = false;
      if (player.alive && player.invuln <= 0) {
        if (b.len) {
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const ux = b.vx / sp, uy = b.vy / sp;
          const tproj = clamp((player.x - b.x) * ux + (player.y - b.y) * uy, -b.len / 2, b.len / 2);
          hitPlayer = Math.hypot(player.x - (b.x + ux * tproj), player.y - (b.y + uy * tproj)) < PLAYER.hitRadius + b.r;
        } else {
          hitPlayer = Math.hypot(b.x - player.x, b.y - player.y) < PLAYER.hitRadius + b.r;
        }
      }
      if (hitPlayer) {
        damagePlayer(b.dmg);
        eBullets.splice(i, 1);
      }
    }
  }

  // ---------- 道具 ----------
  const POWERUP_MAGNET_RADIUS = 170;   // 道具磁吸半径（比水晶 110 更大，更易被吸引吃到）

  // 生成道具（非水晶类通用）：缓慢下落 + 随机左右漂移（碰边反弹）+ 易被磁吸
  function spawnPowerup(x, y, kind, r) {
    powerups.push({ x, y, kind, r, vy: rand(40, 55), vx: rand(-46, 46) });
  }

  function updatePowerups(dt) {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      // 磁吸：比水晶更易被吸引（半径更大、拉力更强），吸附后直奔机身
      let magnetized = false;
      if (player.alive) {
        const dx = player.x - p.x;
        const dy = player.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < POWERUP_MAGNET_RADIUS && dist > 1) {
          magnetized = true;
          const pull = 520 + 640 * (1 - dist / POWERUP_MAGNET_RADIUS);
          p.vx = (dx / dist) * pull;
          p.vy = (dy / dist) * pull;
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
        if (p.kind === 'hp') {
          player.hp = clamp(player.hp + 40, 0, PLAYER.maxHp);
          spawnParticles(p.x, p.y, '#66e39a', 12, 160);
        } else if (p.kind === 'bomb') {
          state.bombs = Math.min(state.bombs + 1, MAX_BOMBS);
          spawnParticles(p.x, p.y, '#ffb545', 12, 160);
        } else if (p.kind === 'shield') {
          // 量子护盾：8 秒无敌，敌弹碰盾即消解，解除时清屏
          player.shield = SHIELD_DURATION;
          spawnParticles(p.x, p.y, '#6fe3ff', 18, 200);
        } else if (p.kind === 'berserk') {
          pickupBerserk();
        } else {
          pickupKit();
        }
        powerups.splice(i, 1);
      }
    }
  }

  // ---------- 水晶 ----------
  function updateCrystals(dt) {
    for (let i = crystals.length - 1; i >= 0; i--) {
      const c = crystals[i];
      c.t += dt * 4;
      // 磁吸：靠近玩家时被吸附（吸附后直奔机身中心判定点）
      if (player.alive) {
        const dx = player.x - c.x;
        const dy = player.y - c.y;
        const dist = Math.hypot(dx, dy);
        if (dist < PLAYER.magnetRadius && dist > 1) {
          const pull = 900 + 700 * (1 - dist / PLAYER.magnetRadius);
          c.vx = (dx / dist) * pull;
          c.vy = (dy / dist) * pull;
        }
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.y > CANVAS_H + 20) { crystals.splice(i, 1); continue; }
      if (player.alive &&
          Math.abs(c.x - player.x) < player.w / 2 + c.r &&
          Math.abs(c.y - player.y) < player.h / 2 + c.r) {
        state.score += c.val;
        spawnParticles(c.x, c.y, '#9be7ff', 5, 120);
        crystals.splice(i, 1);
      }
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
  let flash = 0;

  // 战机造型（关于原点严格对称）：主绘制与选机缩略图共用，确保两处一致
  // 蓝色机身 + 底部两个稍高的粉色(#FFC0CB)尾翼三角，粉与蓝之间做渐变衔接
  function paintShip(g) {
    // 机身主体：蓝色垂直渐变（顶亮 → 底深），非平涂
    const bodyGrd = g.createLinearGradient(0, -24, 0, 16);
    bodyGrd.addColorStop(0, '#f2fbff');
    bodyGrd.addColorStop(0.4, '#bfe6ff');
    bodyGrd.addColorStop(0.75, '#6fb6e8');
    bodyGrd.addColorStop(1, '#3f8fc4');
    g.fillStyle = bodyGrd;
    g.strokeStyle = '#8fd8ff';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(0, -24);       // 机头
    g.lineTo(6, -6);
    g.lineTo(22, 10);       // 右翼尖
    g.lineTo(8, 8);
    g.lineTo(5, 15);        // 右尾
    g.lineTo(0, 11);
    g.lineTo(-5, 15);       // 左尾
    g.lineTo(-8, 8);
    g.lineTo(-22, 10);      // 左翼尖
    g.lineTo(-6, -6);
    g.closePath();
    g.fill();
    g.stroke();

    // 底部两个粉色尾翼三角（稍高、伸出机身；顶端蓝 → 尖端粉，与机身蓝色渐变衔接）
    for (const sx of [-1, 1]) {
      const finGrd = g.createLinearGradient(sx * 3, 6, sx * 11, 23);
      finGrd.addColorStop(0, '#57d4ff');      // 靠机身：蓝
      finGrd.addColorStop(0.45, '#FFC0CB');   // 主体：粉
      finGrd.addColorStop(1, '#FFC0CB');      // 尖端：粉
      g.fillStyle = finGrd;
      g.beginPath();
      g.moveTo(sx * 3, 6);
      g.lineTo(sx * 11, 23);
      g.lineTo(sx * 3, 15);
      g.closePath();
      g.fill();
    }

    // 中央脊线高光：白 → 粉(#FFC0CB)渐变（对称菱形）
    const spineGrd = g.createLinearGradient(0, -20, 0, 12);
    spineGrd.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    spineGrd.addColorStop(0.55, 'rgba(255, 192, 203, 0.85)');
    spineGrd.addColorStop(1, 'rgba(255, 192, 203, 0)');
    g.fillStyle = spineGrd;
    g.beginPath();
    g.moveTo(0, -20);
    g.lineTo(3, 0);
    g.lineTo(0, 12);
    g.lineTo(-3, 0);
    g.closePath();
    g.fill();

    // 座舱：径向渐变（青白核 → 深蓝边），对称
    const cockGrd = g.createRadialGradient(0, -8, 1, 0, -6, 8);
    cockGrd.addColorStop(0, '#eaffff');
    cockGrd.addColorStop(0.5, '#57d4ff');
    cockGrd.addColorStop(1, '#1a6fa8');
    g.fillStyle = cockGrd;
    g.beginPath();
    g.ellipse(0, -6, 4, 8, 0, 0, Math.PI * 2);
    g.fill();
  }

  function drawPlayer() {
    if (!player.alive) return;
    const { x, y } = player;

    // 量子护盾气泡
    if (player.shield > 0) {
      const sp = 0.5 + Math.sin(state.time * 10) * 0.2;
      ctx.save();
      ctx.globalAlpha = player.shield < 2 ? sp * (player.shield / 2) : sp;   // 最后 2s 渐弱
      ctx.strokeStyle = '#6fe3ff';
      ctx.shadowColor = '#6fe3ff';
      ctx.shadowBlur = 16;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha *= 0.35;
      ctx.fillStyle = '#6fe3ff';
      ctx.fill();
      ctx.restore();
    }

    // 暴走光环（Lv5 即暴走）
    if (player.weapon === 5) {
      const pulse = 0.55 + Math.sin(state.time * 16) * 0.2;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#ffb545';
      ctx.shadowColor = '#ff4d6d';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, 30, 34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const blink = player.invuln > 0 && player.weapon !== 5 && Math.floor(player.invuln * 20) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(x, y);

    // 尾焰：粉(#FFC0CB) → 橙渐变（对称，动画）
    const flame = 9 + Math.sin(state.time * 30) * 3;
    const grd = ctx.createLinearGradient(0, 14, 0, 14 + flame + 12);
    grd.addColorStop(0, 'rgba(255, 192, 203, 0.95)');
    grd.addColorStop(0.5, 'rgba(255, 150, 190, 0.6)');
    grd.addColorStop(1, 'rgba(255, 90, 40, 0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(-5, 14);
    ctx.lineTo(0, 14 + flame + 12);
    ctx.lineTo(5, 14);
    ctx.closePath();
    ctx.fill();

    // 机身（与选机缩略图共用同一造型）
    paintShip(ctx);

    ctx.restore();

    // 判定点：机身中心发光小红点（不随机身放大，真实反映 4px 判定范围）
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#ff4d6d';
    ctx.shadowColor = '#ff4d6d';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // “暴走”字样（触发后短暂展示，不随机身闪烁隐藏）
    if (player.berserkBanner > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(player.berserkBanner, 0, 1);
      ctx.fillStyle = '#ff4d6d';
      ctx.shadowColor = '#ffb545';
      ctx.shadowBlur = 14;
      ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暴走', x, y - 42 - (1.5 - player.berserkBanner) * 14);
      ctx.restore();
    }
  }

  // 炮火先兆者形体：小圆 + 外环 + 左右两条横杠；中心红色随充能从中心扩展、随后灰黑从中心覆盖
  function drawHarbingerBody(e) {
    const TAU = Math.PI * 2;
    const R = 24, RIN = 19, RC = 9;
    const GRAY = '#3a3f4a', DARK = '#22262e', RED = '#ff2b2b';
    const shape = () => {
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.arc(0, 0, RIN, 0, TAU, true);
      ctx.moveTo(RC, 0); ctx.arc(0, 0, RC, 0, TAU);
      ctx.rect(-22, -2.6, 13, 5.2);
      ctx.rect(9, -2.6, 13, 5.2);
    };
    const cycle = HARBINGER.charge + HARBINGER.cover;
    const t = e.arrived ? (e.chargeT % cycle) : 0;
    const coverR = R + 8;
    let redR = 0, grayR = 0;
    if (e.arrived) {
      if (t < HARBINGER.charge) redR = (t / HARBINGER.charge) * coverR;   // 红色从中心扩展
      else { redR = coverR; grayR = ((t - HARBINGER.charge) / HARBINGER.cover) * coverR; }   // 灰黑从中心覆盖
    }
    // 基础灰黑
    shape();
    ctx.fillStyle = GRAY;
    ctx.fill();
    // 裁剪到形体，绘制从中心扩展的红色 / 覆盖的灰黑
    ctx.save();
    shape();
    ctx.clip();
    if (redR > 0) {
      ctx.fillStyle = RED;
      ctx.shadowColor = RED;
      ctx.shadowBlur = redR >= coverR ? 20 : 6;
      ctx.beginPath(); ctx.arc(0, 0, redR, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (grayR > 0) {
      ctx.fillStyle = GRAY;
      ctx.beginPath(); ctx.arc(0, 0, grayR, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // 描边勾勒形体
    shape();
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // 导弹垂直预警线：红↔橙闪动 + 顶部警告图标
  function drawMissileWarns() {
    for (const w of missileWarns) {
      const flash = Math.sin(state.time * 18) >= 0;
      const col = flash ? '#ff2b2b' : '#ff9a2b';
      const prog = clamp(w.t / w.dur, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 2 + prog * 3;
      ctx.beginPath();
      ctx.moveTo(w.x, 0);
      ctx.lineTo(w.x, CANVAS_H);
      ctx.stroke();
      ctx.globalAlpha = 0.1 + prog * 0.12;
      ctx.fillStyle = col;
      ctx.fillRect(w.x - 9, 0, 18, CANVAS_H);
      ctx.shadowBlur = 0;
      // 顶部警告图标（三角 + !）
      ctx.globalAlpha = 1;
      ctx.translate(w.x, 30);
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(0, -12); ctx.lineTo(11, 9); ctx.lineTo(-11, 9); ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#200000';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, 2);
      ctx.restore();
    }
  }

  // 下落导弹：宽于常规子弹，尖头朝下 + 向上尾焰
  function drawMissiles() {
    for (const m of missiles) {
      ctx.save();
      ctx.translate(m.x, m.y);
      const tg = ctx.createLinearGradient(0, -m.r * 4.5, 0, 0);
      tg.addColorStop(0, 'rgba(255,120,40,0)');
      tg.addColorStop(1, 'rgba(255,200,90,0.85)');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(-m.r * 0.6, 0);
      ctx.lineTo(m.r * 0.6, 0);
      ctx.lineTo(m.r * 0.3, -m.r * 4.5);
      ctx.lineTo(-m.r * 0.3, -m.r * 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff4d2b';
      ctx.shadowColor = '#ff4d2b';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(0, m.r * 1.7);
      ctx.lineTo(m.r, -m.r * 0.4);
      ctx.lineTo(m.r * 0.45, -m.r);
      ctx.lineTo(-m.r * 0.45, -m.r);
      ctx.lineTo(-m.r, -m.r * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    // 虚化（护盾期）：机身半透明闪烁
    if (e.phase > 0) ctx.globalAlpha = 0.45 + Math.sin(state.time * 9) * 0.12;
    ctx.scale(ENEMY_TYPES[e.type].drawScale, ENEMY_TYPES[e.type].drawScale);   // 体型放大
    ctx.fillStyle = e.color;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1.2;

    if (e.type === 'harbinger') {
      drawHarbingerBody(e);   // 自带填充与描边（圆环 + 横杠 + 红/灰充能核心）
    } else {
    if (e.type === 'side') {
      // 1类：小型三角箭镖，朝飞行方向倾斜
      const tilt = e._sideVel ? (e._sideVel.vx > 0 ? -0.35 : 0.35) : 0;
      ctx.rotate(tilt);
      ctx.beginPath();
      ctx.moveTo(0, 11);
      ctx.lineTo(11, -7);
      ctx.lineTo(0, -3);
      ctx.lineTo(-11, -7);
      ctx.closePath();
    } else if (e.type === 'striker') {
      // 2类：菱形战机
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.lineTo(15, -4);
      ctx.lineTo(0, -13);
      ctx.lineTo(-15, -4);
      ctx.closePath();
    } else if (e.type === 'gunship') {
      // 3类：宽体炮艇，双引擎短翼
      ctx.beginPath();
      ctx.moveTo(0, 20);
      ctx.lineTo(16, 10);
      ctx.lineTo(23, -2);
      ctx.lineTo(12, -6);
      ctx.lineTo(8, -17);
      ctx.lineTo(-8, -17);
      ctx.lineTo(-12, -6);
      ctx.lineTo(-23, -2);
      ctx.lineTo(-16, 10);
      ctx.closePath();
    } else {
      // 4类：主力舰，厚重舰体 + 两侧炮廓
      ctx.beginPath();
      ctx.moveTo(0, 34);
      ctx.lineTo(20, 24);
      ctx.lineTo(30, 8);
      ctx.lineTo(47, 2);
      ctx.lineTo(40, -16);
      ctx.lineTo(18, -22);
      ctx.lineTo(10, -34);
      ctx.lineTo(-10, -34);
      ctx.lineTo(-18, -22);
      ctx.lineTo(-40, -16);
      ctx.lineTo(-47, 2);
      ctx.lineTo(-30, 8);
      ctx.lineTo(-20, 24);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();

    // 座舱（体型越大座舱越大）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.arc(0, 0, e.type === 'capital' ? 7 : e.type === 'gunship' ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fill();

    // 4类额外细节：舰体中线与两侧炮口
    if (e.type === 'capital') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(-4, -28, 8, 52);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(-34, 0, 4, 0, Math.PI * 2);
      ctx.arc(34, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    }   // 结束 else（非 harbinger）

    // 切换到未缩放坐标系（血条 / 护盾气泡不随体型变粗）
    ctx.restore();
    ctx.save();
    ctx.translate(e.x, e.y);

    // 蓝色4类护盾：虚化期间显示能量护盾气泡（炮弹穿过、可打到后面的敌人）
    if (e.phase > 0) {
      const rr = Math.max(e.w, e.h) * 0.6;
      const a = 0.4 + Math.sin(state.time * 6) * 0.15;
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#6fe3ff';
      ctx.shadowColor = '#4d9fff';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, rr, rr * 0.82, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = a * 0.22;
      ctx.fillStyle = '#6fe3ff';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // 血条
    if (e.hp < e.maxHp) {
      const w = e.w;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(-w / 2, -e.h / 2 - 8, w, 3);
      ctx.fillStyle = '#66e39a';
      ctx.fillRect(-w / 2, -e.h / 2 - 8, w * (e.hp / e.maxHp), 3);
    }

    ctx.restore();
  }

  // BOSS：旧日之歌 —— 灰黑渐变舰体 + 流动彩色光泽 + 音核涟漪 + 双炮管
  function drawBoss(e) {
    // 顶部专用血条（进场阶段不显示）
    if (e.phase !== 'enter') {
      const bw = 320;
      const bx = (CANVAS_W - bw) / 2;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(bx - 2, 4, bw + 4, 14);
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, '#ff4d6d');
      g.addColorStop(1, '#ffb545');
      ctx.fillStyle = g;
      ctx.fillRect(bx, 6, bw * clamp(e.hp / e.maxHp, 0, 1), 10);
      ctx.fillStyle = '#dfe7ff';
      ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${BOSS.name} · ${Math.ceil(e.hp)} / ${e.maxHp}`, CANVAS_W / 2, 32);
    }

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(e.scale, e.scale);   // 进场/展开阶段的体型缩放
    const hue = (state.time * 36) % 360;   // 不断变换的色相

    // 舰体：灰黑垂直渐变，边缘泛流动彩光
    const pts = [[0, 62], [58, 52], [110, 30], [144, 4], [126, -26], [84, -46], [40, -62]];
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    for (let k = pts.length - 1; k >= 0; k--) ctx.lineTo(-pts[k][0], pts[k][1]);
    ctx.closePath();
    const body = ctx.createLinearGradient(0, -e.h / 2, 0, e.h / 2);
    body.addColorStop(0, '#4a4f57');
    body.addColorStop(0.5, '#1a1d22');
    body.addColorStop(1, '#05070b');
    ctx.fillStyle = body;
    ctx.strokeStyle = `hsla(${hue}, 60%, 62%, 0.9)`;
    ctx.lineWidth = 2;
    ctx.shadowColor = `hsla(${hue}, 70%, 60%, 0.8)`;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 流动彩色光泽：一条随时间左右游走的色带（裁剪在舰体内）
    ctx.save();
    ctx.clip();
    const sweep = Math.sin(state.time * 0.7) * 90;
    const sheen = ctx.createLinearGradient(sweep - 80, 0, sweep + 80, 0);
    sheen.addColorStop(0, `hsla(${hue}, 55%, 60%, 0)`);
    sheen.addColorStop(0.5, `hsla(${hue}, 55%, 60%, 0.30)`);
    sheen.addColorStop(1, `hsla(${(hue + 90) % 360}, 55%, 55%, 0)`);
    ctx.fillStyle = sheen;
    ctx.fillRect(-e.w / 2, -e.h / 2, e.w, e.h);
    ctx.restore();

    // 变形动画：展开阶段两侧翼板从舰体中段向外滑出，到位后保持展开态
    const up = e.phase === 'unfold' ? clamp(e.unfoldT / 0.9, 0, 1) : 1;
    const wingX = 30 + (e.w * 0.38 - 30) * (1 - Math.pow(1 - up, 3));
    for (const sx of [-1, 1]) {
      ctx.fillStyle = '#23272e';
      ctx.strokeStyle = `hsla(${hue}, 45%, 55%, 0.7)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx * (wingX - 18), -8);
      ctx.lineTo(sx * (wingX + 16), -20);
      ctx.lineTo(sx * (wingX + 20), 8);
      ctx.lineTo(sx * (wingX - 14), 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 技能3蓄能：未打完的四个发射部位紫光高亮
    if (e.skill && e.skill.id === 2) {
      const pulse = 0.45 + Math.sin(state.time * 12) * 0.3;
      for (const p of e.skill.parts) {
        if (p.shots >= 3) continue;   // 已打完的部位熄灭
        const pg = ctx.createRadialGradient(p.dx, p.dy, 1, p.dx, p.dy, 16);
        pg.addColorStop(0, `rgba(220, 150, 255, ${pulse.toFixed(3)})`);
        pg.addColorStop(1, 'rgba(150, 60, 255, 0)');
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(p.dx, p.dy, 16, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 双炮管
    for (const sx of [-1, 1]) {
      const bx = sx * e.w * 0.22;
      ctx.fillStyle = '#2a2e35';
      ctx.strokeStyle = '#565d68';
      ctx.lineWidth = 1.2;
      ctx.fillRect(bx - 8, 34, 16, 30);
      ctx.strokeRect(bx - 8, 34, 16, 30);
      ctx.fillStyle = BOSS_BULLET.long;
      ctx.shadowColor = BOSS_BULLET.long;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(bx, 66, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 音核：脉冲核心 + 三圈声波涟漪（呼应“旧日之歌”）
    const coreR = 16 + Math.sin(state.time * 5) * 3;
    const cg = ctx.createRadialGradient(0, -6, 2, 0, -6, coreR);
    cg.addColorStop(0, '#eaffff');
    cg.addColorStop(0.5, `hsla(${hue}, 70%, 60%, 0.9)`);
    cg.addColorStop(1, 'rgba(10, 14, 24, 0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, -6, coreR, 0, Math.PI * 2);
    ctx.fill();
    for (let k = 0; k < 3; k++) {
      const ph = (state.time * 0.8 + k / 3) % 1;
      ctx.globalAlpha = (1 - ph) * 0.35;
      ctx.strokeStyle = `hsla(${(hue + k * 60) % 360}, 70%, 65%, 1)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -6, 18 + ph * 46, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // 警报横杠：半透明红 + 暗红平行四边形装饰 + 上下亮边
  function drawWarnBar(x, y, w, h, dir) {
    ctx.fillStyle = 'rgba(205, 20, 45, 0.42)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(115, 6, 26, 0.85)';
    const step = 34;
    for (let px = x + 8; px + 16 < x + w - 6; px += step) {
      const sk = 7 * dir;
      ctx.beginPath();
      ctx.moveTo(px + sk, y);
      ctx.lineTo(px + 14 + sk, y);
      ctx.lineTo(px + 14 - sk, y + h);
      ctx.lineTo(px - sk, y + h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 96, 118, 0.9)';
    ctx.fillRect(x, y - 2, w, 2);
    ctx.fillRect(x, y + h, w, 2);
  }

  // BOSS 警报演出：双横杠滑入 → 中间红色区域 + Lv 徽标 + BOSS 名（流动渐变艺术字）→ 淡出
  function drawBossWarning(t) {
    const { slide, hold, fade } = BOSS_WARN;
    const B = BOSSES[state.pendingBoss] || BOSSES.song;
    const alpha = t > slide + hold ? clamp(1 - (t - slide - hold) / fade, 0, 1) : 1;
    const ease = (p) => 1 - Math.pow(1 - clamp(p, 0, 1), 3);
    const pz = ease((t - slide) / 0.35);   // 红色区域淡入进度

    ctx.save();
    ctx.globalAlpha = alpha;

    // 左侧偏上横杠从左向右滑入；右侧偏下横杠从右向左滑入（均贯穿全屏）
    const bw = CANVAS_W, bh = 16;
    const p = ease(t / slide);
    drawWarnBar(-bw - 20 + (bw + 20) * p, 296, bw, bh, 1);
    drawWarnBar(CANVAS_W + 20 - (CANVAS_W + 20) * p, 384, bw, bh, -1);

    // 两杠到位：中间红色区域淡入（半透明 + 描边）
    if (pz > 0) {
      ctx.save();
      ctx.globalAlpha = alpha * pz * 0.30;
      ctx.fillStyle = '#e01030';
      ctx.fillRect(56, 288, 368, 128);
      ctx.globalAlpha = alpha * pz * 0.85;
      ctx.strokeStyle = 'rgba(255, 96, 118, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(56, 288, 368, 128);
      ctx.restore();
    }

    // 横杠左侧：Lv 徽标
    const pLv = clamp((t - slide * 0.55) / 0.3, 0, 1);
    if (pLv > 0) {
      ctx.globalAlpha = alpha * pLv;
      ctx.fillStyle = '#ff8a9a';
      ctx.shadowColor = '#ff4d6d';
      ctx.shadowBlur = 10;
      ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Lv.${B.lv}`, 104, 342);
      ctx.shadowBlur = 0;
    }

    // BOSS 名：逐字入场（旋转缩放+辉光衰减）→ 落定冲击波/白闪 → 流动渐变艺术字
    const nameStart = slide + 0.15, nameDur = 0.55;
    const pn = clamp((t - nameStart) / nameDur, 0, 1);
    if (pn > 0) {
      const chars = B.name.split('');
      const cw = 52;   // 每字步进
      const hue = (state.time * 36) % 360;
      const impact = clamp((t - nameStart - nameDur) / 0.4, 0, 1);   // 落定冲击进度

      ctx.save();
      ctx.translate(CANVAS_W / 2, 358);
      ctx.font = '46px "华文行楷", "STXingkai", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 落定瞬间：一次性扩散光环 + 横向光刃
      if (impact > 0 && impact < 1) {
        ctx.globalAlpha = alpha * (1 - impact) * 0.7;
        ctx.strokeStyle = '#ffd9e0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 46 + impact * 150, 26 + impact * 60, 0, 0, Math.PI * 2);
        ctx.stroke();
        const sw = 40 + impact * 220;
        const sg = ctx.createLinearGradient(-sw / 2, 0, sw / 2, 0);
        sg.addColorStop(0, 'rgba(255, 255, 255, 0)');
        sg.addColorStop(0.5, 'rgba(255, 255, 255, 0.9)');
        sg.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.globalAlpha = alpha * (1 - impact) * 0.9;
        ctx.fillStyle = sg;
        ctx.fillRect(-sw / 2, -1.5, sw, 3);
      }

      // 逐字入场：从上方旋转坠落，缩放收拢，辉光由强到弱
      for (let i = 0; i < chars.length; i++) {
        const ci = clamp((pn - i * 0.10) / 0.45, 0, 1);
        if (ci <= 0) continue;
        const eo = 1 - Math.pow(1 - ci, 3);
        const scale = 1 + (1 - eo) * 1.5;
        const rot = (1 - eo) * (i % 2 === 0 ? -0.45 : 0.45);
        ctx.save();
        ctx.translate((i - (chars.length - 1) / 2) * cw, (1 - eo) * -26);
        ctx.rotate(rot);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha * ci;
        const g = ctx.createLinearGradient(-cw / 2, -30, cw / 2, 30);
        g.addColorStop(0, `hsl(${hue}, 22%, 84%)`);
        g.addColorStop(0.5, `hsl(${(hue + 80) % 360}, 45%, 62%)`);
        g.addColorStop(1, `hsl(${(hue + 160) % 360}, 22%, 84%)`);
        ctx.fillStyle = g;
        ctx.shadowColor = `hsla(${hue}, 70%, 55%, 0.9)`;
        ctx.shadowBlur = 18 + (1 - eo) * 26;
        ctx.fillText(chars[i], 0, 0);
        ctx.restore();
      }

      // 落定白闪：整名短暂泛白后回归流动渐变
      if (impact > 0 && impact < 1) {
        ctx.globalAlpha = alpha * (1 - impact) * 0.85;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = `hsla(${hue}, 70%, 60%, 1)`;
        ctx.shadowBlur = 22;
        ctx.fillText(B.name, 0, 0);
      }
      ctx.restore();
    }

    ctx.restore();
  }

  function drawBullets() {
    for (const b of pBullets) {
      const top = b.y - b.r * 3;
      const h = b.r * 6;
      const g = ctx.createLinearGradient(0, top, 0, top + h);
      g.addColorStop(0, '#ff6ec7');   // 上：粉色
      g.addColorStop(1, b.color);     // 下：本体色
      ctx.fillStyle = g;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 8;
      ctx.fillRect(b.x - b.r, top, b.r * 2, h);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';   // 描边
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x - b.r, top, b.r * 2, h);
    }
    for (const b of eBullets) {
      if (b.len) {
        // 长条弹：沿飞行方向的渐变胶囊体
        const ang = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(ang);
        const g = ctx.createLinearGradient(-b.len / 2, 0, b.len / 2, 0);
        g.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
        g.addColorStop(0.5, '#ffffff');
        g.addColorStop(1, b.color);
        ctx.fillStyle = g;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 9;
        ctx.fillRect(-b.len / 2, -b.r, b.len, b.r * 2);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 235, 220, 0.9)';   // 描边
        ctx.lineWidth = 1;
        ctx.strokeRect(-b.len / 2, -b.r, b.len, b.r * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        if (b.r >= 10) {
          // 很大的子弹：内圈高光
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r * 0.55, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    ctx.shadowBlur = 0;
  }

  function drawParticles() {
    for (const p of particles) {
      const t = 1 - p.age / p.life;
      ctx.globalAlpha = clamp(t, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawPowerups() {
    for (const p of powerups) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(state.time * 2);
      const isBerserk = p.kind === 'berserk';
      if (isBerserk) {
        // 暴走道具：红橙渐变 + 脉动强光，格外显眼
        const pulse = 16 + Math.sin(state.time * 10) * 8;
        const g = ctx.createLinearGradient(-p.r, -p.r, p.r, p.r);
        g.addColorStop(0, '#ff2d2d');
        g.addColorStop(1, '#ff8a00');
        ctx.fillStyle = g;
        ctx.shadowColor = '#ff4d1a';
        ctx.shadowBlur = pulse;
      } else {
        ctx.fillStyle = p.kind === 'hp' ? '#66e39a' : p.kind === 'bomb' ? '#ffb545' : p.kind === 'shield' ? '#6fe3ff' : '#ff5ea8';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 12;
      }
      ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = isBerserk ? '#fff3e0' : '#0b1224';
      ctx.font = isBerserk ? 'bold 20px sans-serif' : 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.rotate(-state.time * 2);
      const label = isBerserk ? 'S' : p.kind === 'hp' ? '+' : p.kind === 'bomb' ? 'B' : p.kind === 'shield' ? '◇' : '↑';
      ctx.fillText(label, 0, 1);
      ctx.restore();
    }
  }

  function drawCrystals() {
    for (const c of crystals) {
      ctx.save();
      ctx.translate(c.x, c.y);
      const s = 1 + Math.sin(c.t) * 0.15;
      ctx.scale(s, s);
      ctx.fillStyle = c.giant ? '#e08bff' : '#9be7ff';
      ctx.shadowColor = c.giant ? '#c04dff' : '#4dd0ff';
      ctx.shadowBlur = c.giant ? 16 : 8;
      ctx.beginPath();
      ctx.moveTo(0, -c.r);
      ctx.lineTo(c.r * 0.7, 0);
      ctx.lineTo(0, c.r);
      ctx.lineTo(-c.r * 0.7, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }

  function render() {
    // 抖动
    ctx.save();
    if (state.shakeTime > 0) {
      const m = state.shakeMag;
      ctx.translate(rand(-m, m), rand(-m, m));
    }

    // 背景
    const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    bg.addColorStop(0, '#0a1230');
    bg.addColorStop(1, '#050814');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    drawStars();
    drawMissileWarns();
    drawCrystals();
    drawPowerups();
    for (const e of enemies) {
      if (e.type === 'boss') drawBoss(e);
      else drawEnemy(e);
    }
    drawPlayer();
    drawBullets();
    drawMissiles();
    drawParticles();

    // BOSS 警报演出（全屏覆盖层）
    if (state.bossStage === 'warn') drawBossWarning(state.warnT);

    // 炸弹白闪
    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${clamp(flash, 0, 1) * 0.7})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    ctx.restore();

    // 暂停遮罩
    if (state.paused && state.mode === 'playing') {
      ctx.fillStyle = 'rgba(3, 6, 15, 0.6)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#7ce7ff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('已暂停 · 按 P 继续', CANVAS_W / 2, CANVAS_H / 2);
    }
  }

  // ---------- HUD ----------
  function updateHUD() {
    const ratio = player.hp / PLAYER.maxHp;
    hpFill.style.width = (ratio * 100) + '%';
    hpFill.classList.toggle('warn', ratio <= 0.55 && ratio > 0.25);
    hpFill.classList.toggle('danger', ratio <= 0.25);
    hpText.textContent = `${Math.ceil(player.hp)} / ${PLAYER.maxHp}`;
    scoreText.textContent = state.score;
    levelText.textContent = state.level;
    bombText.textContent = state.bombs;
    livesText.textContent = '♥'.repeat(Math.max(0, state.lives)) || '—';
    const berserkOn = player.weapon === 5;
    const shieldOn = player.shield > 0;
    weaponText.textContent = shieldOn
      ? `护盾 ${player.shield.toFixed(1)}s`
      : berserkOn
        ? `暴走 ${player.berserk.toFixed(1)}s`
        : `火力 Lv${player.weapon}/${WEAPON_LEVELS.length - 1}`;
    weaponText.classList.toggle('berserk', berserkOn && !shieldOn);
    weaponText.classList.toggle('shield', shieldOn);
  }

  // ---------- 主循环 ----------
  let lastTime = performance.now();

  function loop(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;

    if (state.mode === 'playing' && !state.paused) {
      state.time += dt;

      // 关卡推进：每 1500 分升一级
      const newLevel = 1 + Math.floor(state.score / 1500);
      if (newLevel !== state.level) {
        state.level = newLevel;
      }

      // BOSS 流程状态机：none → wait(等清场) → warn(警报演出) → fight(BOSS战) → none
      // 达到登场条件后不再出怪；场上清空后播放警报，演出结束 BOSS 中速进场并展开
      if (state.bossStage === 'none') {
        state.bossTimer += dt;
        if (state.bossTimer >= BOSS_APPEAR_TIME) state.bossStage = 'wait';
      } else if (state.bossStage === 'wait') {
        if (enemies.length === 0) {
          state.bossStage = 'warn';
          state.warnT = 0;
        }
      } else if (state.bossStage === 'warn') {
        state.warnT += dt;
        if (state.warnT >= BOSS_WARN_TOTAL) {
          spawnBoss(state.pendingBoss);
          state.bossStage = 'fight';
        }
      }

      if (state.bossStage === 'none') {
        // 敌机编队生成节奏（1 / 2 类常规波次）：前期节奏放缓，约 1.5 倍时间后才达到原密度
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          spawnWave();
          const base = Math.max(0.55, 2.1 - (state.level - 1) * 0.15);
          state.spawnTimer = rand(base * 0.7, base * 1.3);
        }

        // 3 / 4 类按冷却出场（同屏各限 1 架，冷却仅在其不在场时走动）
        const hasGunship = enemies.some(e => e.type === 'gunship' || e.type === 'harbinger');
        const hasCapital = enemies.some(e => e.type === 'capital');
        if (!hasGunship) state.gunshipCd -= dt;
        if (!hasCapital) state.capitalCd -= dt;
        if (state.level >= 2 && !hasGunship && state.gunshipCd <= 0) {
          // 3 类槽位：本局首次必定出场“炮火先兆者”（便于识别），之后约 30% 概率出场，否则普通炮艇
          if (!state.harbingerIntro) { state.harbingerIntro = true; spawnHarbinger(); }
          else if (Math.random() < 0.3) spawnHarbinger();
          else spawnGunship();
        }
        if (state.level >= 3 && !hasCapital && state.capitalCd <= 0) {
          spawnCapital();
        }
      }

      updatePlayer(dt);
      updateEnemies(dt);
      updateBullets(dt);
      updateMissiles(dt);
      updatePowerups(dt);
      updateCrystals(dt);
      updateParticles(dt);
      updateStars(dt);

      if (state.shakeTime > 0) {
        state.shakeTime -= dt;
        if (state.shakeTime <= 0) { state.shakeTime = 0; state.shakeMag = 0; }
      }
      if (flash > 0) flash = Math.max(0, flash - dt * 2);
    } else {
      updateStars(dt * 0.4);
      updateParticles(dt);
    }

    render();
    updateHUD();
    requestAnimationFrame(loop);
  }

  // ---------- 流程控制 ----------
  function resetGame(autoStart = false, opts = {}) {
    state.score = 0;
    state.level = 1;
    state.bombs = 1;
    state.lives = PLAYER.lives;
    state.spawnTimer = 1.2;
    state.time = 0;
    state.paused = false;
    state.shakeTime = 0;
    state.shakeMag = 0;
    state.gunshipCd = 12;
    state.capitalCd = 25;
    state.harbingerIntro = false;
    state.bossTimer = 0;
    state.bossStage = 'none';
    state.warnT = 0;
    // 测试模式：指定 BOSS 直接挑战；按 R 重开时保留测试目标，点“开始游戏”则清除
    state.testBoss = opts.testBoss !== undefined ? opts.testBoss
      : (opts.keepTest ? state.testBoss : null);
    state.pendingBoss = state.testBoss || 'song';
    if (state.testBoss) state.bossTimer = BOSS_APPEAR_TIME;   // 跳过等待，清场后进警报
    flash = 0;

    enemies = [];
    pBullets = [];
    eBullets = [];
    particles = [];
    powerups = [];
    crystals = [];
    missileWarns = [];
    missiles = [];

    player.x = CANVAS_W / 2;
    player.y = CANVAS_H - 90;
    player.hp = PLAYER.maxHp;
    player.cooldown = 0;
    player.invuln = 1.0;
    player.alive = true;
    player.weapon = state.testBoss ? 4 : 1;   // BOSS 试炼：默认火力 Lv4
    player.berserkBanner = 0;
    player.shield = 0;
    player.respawnTimer = 0;
    player.hitCount = 0;

    if (autoStart) {
      state.mode = 'playing';
      overlay.classList.add('hidden');
    } else {
      state.mode = 'idle';
      planeSelect.classList.remove('hidden');   // 标题页：展示选机卡片
      showOverlay('准备起飞', defaultDesc(), '开始游戏');
    }
  }

  function defaultDesc() {
    return `使用 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 操纵战机<br />
主炮自动开火，<kbd>Space</kbd> 释放炸弹清屏<br />
拾取水晶加分，升级套件提升火力（满级 Lv5 即暴走）<br />
<kbd>P</kbd> 暂停 · <kbd>R</kbd> 重新开始`;
  }

  function showOverlay(title, html, btnText) {
    overlayTitle.textContent = title;
    overlayDesc.innerHTML = html;
    startBtn.textContent = btnText;
    overlay.classList.remove('hidden');
  }

  // ---------- 选机页面 ----------
  function buildPlaneCards() {
    planeGrid.innerHTML = '';
    for (const id in PLANES) {
      const p = PLANES[id];
      const card = document.createElement('div');
      card.className = 'plane-card' + (p.id === currentPlane.id ? ' selected' : '');
      card.dataset.plane = p.id;

      // 缩略图：复用玩家战机造型
      const cvs = document.createElement('canvas');
      cvs.width = 56; cvs.height = 60;
      const c = cvs.getContext('2d');
      c.translate(28, 30);
      paintShip(c);   // 与游戏内战机同一造型，选机页同步更新

      const name = document.createElement('div');
      name.className = 'plane-card-name';
      name.textContent = p.name;
      const desc = document.createElement('div');
      desc.className = 'plane-card-desc';
      desc.innerHTML = p.desc;

      card.append(cvs, name, desc);
      card.addEventListener('click', () => {
        currentPlane = p;
        planeGrid.querySelectorAll('.plane-card').forEach(el =>
          el.classList.toggle('selected', el.dataset.plane === p.id));
      });
      planeGrid.appendChild(card);
    }
    // 占位：后续新机
    const soon = document.createElement('div');
    soon.className = 'plane-card plane-card-soon';
    soon.textContent = '更多战机 · 敬请期待';
    planeGrid.appendChild(soon);
  }

  function togglePause() {
    state.paused = !state.paused;
  }

  function endGame() {
    state.mode = 'gameover';
    planeSelect.classList.add('hidden');   // 结算页：隐藏选机，直接重开
    showOverlay(
      '战机陨落',
      `最终得分：<b style="color:#7ce7ff;font-size:18px">${state.score}</b><br />
       抵达关卡：<b style="color:#ffb545">${state.level}</b><br />
       剩余生命：<b style="color:#ff4d6d">${Math.max(0, state.lives)}</b><br /><br />
       按 <kbd>R</kbd> 或点击下方按钮再次出击`,
      '再来一局'
    );
  }

  startBtn.addEventListener('click', () => {
    resetGame(true);   // 正常开局（清除测试模式）
  });

  // BOSS 测试模式：选择 BOSS 直接挑战（按钮由 BOSSES 注册表自动生成）
  function buildBossTestButtons() {
    bossTestRow.innerHTML = '';
    for (const id in BOSSES) {
      const B = BOSSES[id];
      const btn = document.createElement('button');
      btn.className = 'boss-test-btn';
      btn.textContent = `BOSS 试炼 · ${B.name} (Lv.${B.lv})`;
      btn.addEventListener('click', () => {
        resetGame(true, { testBoss: id });
      });
      bossTestRow.appendChild(btn);
    }
  }

  // ---------- 启动 ----------
  initStars();
  buildPlaneCards();
  buildBossTestButtons();
  resetGame(false);
  requestAnimationFrame(loop);
})();
