/**
 * 大无垠战机 · Big Infinity Fighter
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
    speed: 390,          // px/s (1.5x 原260)
    maxHp: 100,
    lives: 2,            // 初始两条命
    fireInterval: 0.16,  // s
    bulletSpeed: 780,
    bulletDamage: 12,
    invulnTime: 1.2,     // 受击后无敌
    respawnTime: 1.6,    // 掉命后重生延迟
    magnetRadius: 110,   // 水晶吸附半径
    hitRadius: 4,        // 判定点半径：仅机身中心小点被击中才算命中
    hitOffsetY: 4,       // 判定点下移偏移（与白点视觉位置一致）
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
    hp: 36888,                 // 19000 × 1.6：首个 BOSS 血量上调 60%
    score: 5000,
    hoverY: 120,
    moveAmp: 78, moveSpeed: 0.55,   // 小幅左右巡航
    skillCd: 2.2,              // 技能间基础冷却（连中同技能 ×0.2）
    bulletDmg: 14, bigDmg: 32, arcDmg: 18,   // 长条弹 / 大子弹 / 双曲线弹 伤害
    longLen: 26,               // 长条弹长度：略短于 1 类敌机身长
    crashDmg: 40,
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
  const BOSS_SPAWN_EARLY = 3;   // 旧日之歌独有：出场动画提前 3s（黑洞在警报文字展示期间就开始形成）

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
      w: 46, h: 40, hp: 48,  score: 150,  color: '#ff3b30', drawScale: 1.4,
      bulletSpeed: 280, bulletR: 4, bulletDmg: 8, crashDmg: 25,
      fireInterval: [1.1, 2.0],
    },
    gunship: {
      w: 76, h: 62, hp: 300,  score: 400,  color: '#c084fc', drawScale: 1.55,
      bulletSpeed: 250, bulletR: 4, bulletDmg: 8, crashDmg: 30,
      fireInterval: [1.8, 2.4],
    },
    capital: {
      w: 230, h: 160, hp: 4032, score: 1500, color: '#ff4d6d', drawScale: 2.4,
      bulletSpeed: 230, bulletR: 5, bulletDmg: 10, crashDmg: 40,
      fireInterval: [2.4, 2.8],
    },
    // 特殊3类：炮火先兆者（后排炮兵）—— 灰黑形体 + 红色充能核心，充满后召唤垂直落下的导弹
    harbinger: {
      w: 68, h: 68, hp: 540, score: 450, color: '#3a3f4a', drawScale: 1.4,
      bulletSpeed: 210, bulletR: 6, bulletDmg: 16, crashDmg: 12.5,   // 碰撞伤害为 2 类(25) 的 50%
      fireInterval: [4, 4],
    },
  };

  // 炮火先兆者参数
  const HARBINGER = {
    descend: 180,        // 进场/离场下降速度（提升 50%）
    charge: 3,           // 红色从中心扩展至通体红的充能时长
    cover: 2,            // 灰黑从中心覆盖红色的时长
    hold: 18,            // 就位停留时长（约导引 4 次导弹后开走）
    warnTime: 3,         // 导弹垂直预警线时长
    missileSpeed: 780,   // 导弹从上方下落速度（高速）
    missileR: 12,        // 导弹半径（宽于常规子弹）
    lowHpKill: 60,       // 玩家血量低于此值被导弹命中则直接击杀
  };

  // 2类（突击艇）前锋停留线：位于 3/4 类悬停高度（y≈110~170）的前方（更靠下），凸显其前锋定位
  const STRIKER_HOLD_Y = 210;

  /* ---------- 2/3/4 类变体：不同颜色 + 不同技能（weight 为出现权重） ----------
   * striker 2类：赤红(直射±10°、不追踪、首发+1s) / 烈橙(spread 前方双弹、夹角 50°/60°/70° 随机) / 幽蓝(homing 追踪弹、首发+1s、登场 10% 1s 或 10% 2s 虚化护盾) / 霜白(silent 不开火、到位停留 2s 再冲锋)；速度均 -30%
   * gunship 3类：紫(mixed 散射+追踪) / 红(aggressive 火力猛瞄准连射) / 金(ring 环形弹幕密集)
   * capital 4类：红(barrage 密集弹幕) / 蓝(lance 瞄准齐射+螺旋；出现时 20% 带护盾，前 6s 虚化不受伤害、炮弹穿过)
   */
  const VARIANTS = {
    striker: [
      { id: 'crimson', color: '#ff3b30', weight: 0.30, skill: 'straight', firstDelay: 1 },   // 赤红：直射 ±10° 偏差、不追踪、首发 +1s
      { id: 'amber',   color: '#ff8a5c', weight: 0.30, skill: 'spread' },                     // 烈橙：前方双弹，夹角 50°/60°/70° 随机
      { id: 'azure',   color: '#4d9fff', weight: 0.25, skill: 'homing', firstDelay: 1 },      // 幽蓝：追踪弹、首发 +1s、登场 10% 1s / 10% 2s 虚化护盾
      { id: 'white',   color: '#eaf1f8', weight: 0.15, skill: 'silent' },                     // 霜白：不开火，到位停留 2s 再冲锋
    ],
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
  const STRIKER_SPEED_MUL = 0.7;   // 2类突击艇速度降低 30%（赤红/烈橙均适用）

  /* ---------- 3/4 类舰常规子弹：橙红色长条弹 ---------- */
  const SHIP_BULLET_COLOR = '#ff4d2e';   // 橙红色
  const SHIP_BULLET_LEN = 22;            // 长条弹长度（略短于 BOSS 的 26）
  const SPLIT_RED = '#ff6f4d';           // 4类蓝分裂弹：淡橙红（大号母弹 + 6 小子弹）
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
  const BOMB_DAMAGE_BASE = 4000;   // 高能爆弹基础伤害
  const BOMB_DAMAGE_RATIO = 0.10;  // + 目标最大血量的 10%

  // 1类侧翼艇：三种行为对应三种颜色（与图鉴一致）
  //   pass(白)：无攻击斜插穿越 | shoot(黄)：追踪射击 | kamikaze(紫)：亡语垂直射击
  const SIDE_BEHAVIOR_COLORS = {
    pass:     '#f0f0f5',   // 白
    shoot:    '#ffd166',   // 黄
    kamikaze: '#c084fc',   // 紫
  };

  // ---------- DOM ----------
  const canvas = document.getElementById('game');
  let ctx = canvas.getContext('2d');   // 可在图鉴预览时临时切换到其它 canvas 上下文

  // 高 DPI 适配：按设备像素比放大画布内部分辨率，CSS 显示尺寸不变
  const DPR = window.devicePixelRatio || 1;
  canvas.width = CANVAS_W * DPR;
  canvas.height = CANVAS_H * DPR;
  ctx.scale(DPR, DPR);

  const hpFill = document.getElementById('hpFill');
  const hpText = document.getElementById('hpText');
  const scoreText = document.getElementById('scoreText');
  const levelText = document.getElementById('levelText');
  const bombText = document.getElementById('bombText');
  const livesText = document.getElementById('livesText');
  const weaponText = document.getElementById('weaponText');
  const berserkText = document.getElementById('berserkText');
  const shieldText = document.getElementById('shieldText');

  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayDesc = document.getElementById('overlayDesc');
  const startBtn = document.getElementById('startBtn');
  const planeSelect = document.getElementById('planeSelect');
  const planeGrid = document.getElementById('planeGrid');
  const bossTestRow = document.getElementById('bossTestRow');
  const pauseHomeBtn = document.getElementById('pauseHomeBtn');
  const pauseRetryBtn = document.getElementById('pauseRetryBtn');

  // 怪物图鉴 DOM
  const encyclopedia = document.getElementById('encyclopedia');
  const encyTabs = document.getElementById('encyTabs');
  const encyList = document.getElementById('encyList');
  const encyDetail = document.getElementById('encyDetail');
  const encyClose = document.getElementById('encyClose');

  // ---------- BGM ----------
  // 主界面：main_theme；常规战斗：battle_normal_1；BOSS 战（含警报演出）：battle_boss_1
  // battle_normal_2 / battle_boss_2 已就位，待后续扩展（如多阶段 BOSS、关卡切换）时使用
  const BGM_TRACKS = {
    main_theme:      './assets/audio/main_theme.mp4',
    battle_normal_1: './assets/audio/battle_normal_1.mp4',
    battle_normal_2: './assets/audio/battle_normal_2.mp4',
    battle_boss_1:   './assets/audio/battle_boss_1.mp4',
    battle_boss_2:   './assets/audio/battle_boss_2.mp4',
  };
  const BGM_VOLUME = 0.4;
  const bgmAudios = Object.create(null);
  let bgmCurrent = null;      // 当前应播放的曲目 key
  let bgmUnlocked = false;    // 浏览器自动播放限制：首次交互后解锁

  function initBGM() {
    for (const key in BGM_TRACKS) {
      const a = new Audio(BGM_TRACKS[key]);
      a.loop = true;
      a.volume = BGM_VOLUME;
      a.preload = 'auto';
      bgmAudios[key] = a;
    }
  }

  // 警报演出期间不播放任何 BGM（静默 + 警报音效营造紧张感）

  // 每帧根据状态决定应播放的曲目，并处理暂停/恢复
  function updateBGM() {
    let target;
    if (state.mode === 'playing') {
      if (state.bossStage === 'warn') {
        target = null;   // 警报演出期间：无BGM，纯警报音效
      } else if (state.bossStage === 'fight') {
        target = 'battle_boss_1';
      } else {
        target = 'battle_normal_1';
      }
    } else {
      // idle / gameover → 主界面曲
      target = 'main_theme';
    }
    if (bgmCurrent !== target) {
      if (bgmCurrent) {
        const prev = bgmAudios[bgmCurrent];
        prev.pause();
        prev.currentTime = 0;
      }
      bgmCurrent = target;
    }
    if (!bgmCurrent) {
      // 静默期（警报演出）不播放任何曲目，但警报音效需跟随暂停
      if (state.paused) {
        if (!alarmAudio.paused) alarmAudio.pause();
      } else if (alarmAudio.src && state.bossStage === 'warn' && alarmAudio.paused && alarmAudio.currentTime > 0) {
        alarmAudio.play().catch(() => {});
      }
      return;
    }
    const a = bgmAudios[bgmCurrent];
    if (!a || !bgmUnlocked) return;
    if (state.paused) {
      if (!a.paused) a.pause();
    } else if (a.paused) {
      a.play().catch(() => {});
    }
  }

  // ---------- BOSS 警报音效 ----------
  const alarmAudio = new Audio('./assets/audio/boss_alarm.mp3');
  alarmAudio.loop = false;
  alarmAudio.volume = 0.55;
  alarmAudio.preload = 'auto';

  function startAlarm() {
    alarmAudio.currentTime = 0;
    alarmAudio.play().catch(() => {});
  }

  function stopAlarm() {
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
  }

  function unlockBGM() {
    if (bgmUnlocked) return;
    bgmUnlocked = true;
    const a = bgmCurrent ? bgmAudios[bgmCurrent] : null;
    if (a && !state.paused) a.play().catch(() => {});
  }
  window.addEventListener('keydown', unlockBGM, { once: true });
  window.addEventListener('pointerdown', unlockBGM, { once: true });
  window.addEventListener('touchstart', unlockBGM, { once: true });

  initBGM();

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
    bossVictoryDelay: 0, // BOSS 击杀后延迟返回主界面
    defeatedBossName: '', // 被击败的 BOSS 名称
    warnT: 0,          // 警报演出计时
    pendingBoss: 'song',   // 即将登场的 BOSS id
    testBoss: null,    // 测试模式：直接挑战的 BOSS id
    challenge: null,   // 图鉴挑战模式：{ kind:'enemy'|'boss', type, variant, behavior, bossId }，敌我血量无限、仅单个敌人
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
    wingSpread: 0,     // 机翼展开动画进度（0=收起, 1=完全展开）
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

  // ---------- 星云（缓慢穿过背景的大块柔和光斑） ----------
  const NEBULA_COUNT = 4;
  const NEBULA_COLORS = [
    [255, 192, 203],   // #FFC0CB 粉色
    [57, 197, 187],    // #39C5BB 青绿
    [255, 182, 193],   // 偏暖粉
    [72, 210, 200],    // 偏亮青
  ];
  /** @type {Array} */ let nebulae = [];

  function makeNebula(startOffscreen) {
    const c = NEBULA_COLORS[Math.floor(Math.random() * NEBULA_COLORS.length)];
    return {
      x: rand(-60, CANVAS_W + 60),
      y: startOffscreen ? rand(-380, -120) : rand(-100, CANVAS_H + 100),
      r: rand(130, 320),             // 星云半径
      speed: rand(12, 32),           // 下漂速度（比星星慢很多）
      drift: rand(-8, 8),            // 横向微漂
      color: c,
      alpha: rand(0.04, 0.11),       // 低透明度，隐约可见
      pulse: rand(0, Math.PI * 2),   // 呼吸相位
      pulseSpd: rand(0.3, 0.8),      // 呼吸速度
    };
  }

  function initNebulae() {
    nebulae = [];
    for (let i = 0; i < NEBULA_COUNT; i++) nebulae.push(makeNebula(false));
  }

  function updateNebulae(dt) {
    for (let i = 0; i < nebulae.length; i++) {
      const n = nebulae[i];
      n.y += n.speed * dt;
      n.x += n.drift * dt;
      n.pulse += n.pulseSpd * dt;
      // 完全移出屏幕下方后重生于顶部
      if (n.y - n.r > CANVAS_H + 50) {
        nebulae[i] = makeNebula(true);
      }
    }
  }

  function drawNebulae() {
    for (const n of nebulae) {
      const [r, g, b] = n.color;
      const breath = 1 + Math.sin(n.pulse) * 0.15;   // 呼吸缩放
      const rad = n.r * breath;
      const a = n.alpha * (0.8 + Math.sin(n.pulse) * 0.2);
      const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, rad);
      grd.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${a.toFixed(4)})`);
      grd.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${(a * 0.6).toFixed(4)})`);
      grd.addColorStop(0.75, `rgba(${r}, ${g}, ${b}, ${(a * 0.2).toFixed(4)})`);
      grd.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(n.x - rad, n.y - rad, rad * 2, rad * 2);
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
    enemies.push(e);
    return e;
  }
  
  // 1类：从侧上方斜插入场，最少 3 个一组；编队形态随机（纵队/斜线/横排梯队/V字），一碰就碎
  // 行为概率：shoot 10% / kamikaze 20% / pass 70%；速度已降低 40%（×0.6）；整组同速以保持队形
  function spawnSideGroup() {
    const fromLeft = Math.random() < 0.5;
    const dirX = fromLeft ? 1 : -1;
    const n = 3 + Math.floor(Math.random() * 3);    // 3~5 架（最少三个一组）
    const vx = dirX * rand(90, 120);                // 原 150~200 × 0.6
    const vy = rand(54, 84);                         // 原 90~140 × 0.6
    const edgeX = fromLeft ? -36 : CANVAS_W + 36;   // 屏幕侧外入场
    const baseY = rand(-70, 10);                     // 入场上缘基准高度
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
      makeEnemy('side', x, y, {
        behavior,
        deathShot: behavior === 'kamikaze',
        fireTimer: rand(0.8, 1.6),
      })._sideVel = { vx, vy };
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
      const vx = dirX * rand(99, 117);                  // 原 165~195 × 0.6，从一边扫向另一边
      const vy = rand(54, 69);                           // 原 90~115 × 0.6，同时下沉
      const edgeX = fromLeft ? -30 : CANVAS_W + 30;    // 屏幕侧外入场
      for (let k = 0; k < count; k++) {
        const r = Math.random();
        const behavior = r < 0.10 ? 'shoot' : r < 0.30 ? 'kamikaze' : 'pass';
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
        makeEnemy('side', x, y, { behavior: Math.random() < 0.10 ? 'shoot' : 'pass', fireTimer: rand(0.8, 1.5) })._sideVel = { vx: fromLeft ? 24 : -24, vy: rand(90, 111) };
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
    const vx = dirX * rand(90, 120);                   // 与常规 1类同速（已×0.6）
    const vy = rand(54, 84);
    const edgeX = fromLeft ? -36 : CANVAS_W + 36;      // 屏幕侧外入场
    const startY = rand(-40, 30);                      // 入场上缘高度
    for (let k = 0; k < count; k++) {
      const r = Math.random();
      const behavior = r < 0.10 ? 'shoot' : r < 0.30 ? 'kamikaze' : 'pass';
      // 排成长队：队尾依次靠外、靠上，形成一列斜线
      const x = edgeX - dirX * k * gap;
      const y = startY - k * gap * 0.5;
      makeEnemy('side', x, y, {
        behavior,
        deathShot: behavior === 'kamikaze',
        fireTimer: rand(0.8, 1.6),
      })._sideVel = { vx, vy };
    }
  }

  // 波次调度：常规以 2 类为主，1 类成群（每组≥3）；小概率穿插 1 类长队；达关卡后穿插特殊编队
  function spawnWave() {
    // 2 关起，约 40% 概率触发特殊编队（对称/非对称混合）
    if (state.level >= 2 && Math.random() < 0.40) {
      const specials = [spawnMirrorRow, spawnSideSweep, spawnStrikerVee, spawnGunshipWings, spawnDiagonalRaid];
      specials[Math.floor(Math.random() * specials.length)]();
      return;
    }
    // 小概率：波次中间穿插一队 1 类长队（数艘排成一列斜插）
    if (Math.random() < 0.15) {
      spawnSideColumn();
      return;
    }
    // 常规波次：1 类成群生成（每组 3~5、形态随机），概率已降低（原 45%/12% → 20%/8%），以 2 类为主
    const r = Math.random();
    if (r < 0.20) spawnSideGroup();
    else if (r < 0.92) spawnStrikerGroup();
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
  
  // 特殊3类：炮火先兆者（后排炮兵）—— 缓慢就位于更高处，充能召唤导弹，约 18s（最多 4 发）后以进场速度前开走
  function spawnHarbinger(x) {
    makeEnemy('harbinger', x != null ? x : rand(120, CANVAS_W - 120), -50, {
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

  // ---------- 图鉴挑战模式 ----------
  // 生成挑战目标（单个敌人）；悬停型给极大 holdTimer 使其永驻场持续攻击
  function spawnChallengeTarget() {
    const ch = state.challenge;
    const cx = CANVAS_W / 2;
    switch (ch.type) {
      case 'side':
        // 侧翼艇：缓慢斜插（速度 ×0.6），飞出屏幕后由 updateChallenge 重新生成
        makeEnemy('side', cx - 130, -40, { behavior: ch.behavior || 'shoot', fireTimer: 1.0 })._sideVel = { vx: 33, vy: 42 };
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
      if (ch.kind === 'boss' && e.type === 'boss') {
        if (e.testHp == null) e.testHp = e.maxHp;
        e.hp = e.testHp;
      } else if (e.hp < e.maxHp) {
        e.hp = e.maxHp;
      }
      if (e.type === 'harbinger' && e.missilesGuided >= 4) {
        e.missilesGuided = 0; e.chargeT = 0; e.firedThisCycle = false;
      }
    }
  }

  // ---------- BOSS：旧日之歌 ----------
  function spawnBoss(id) {
    const B = BOSSES[id] || BOSSES.song;
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
      scale: 0, combatReady: false,
      moveT: 0, t: 0,
      skill: null, skillCd: 1.4,
      lastSkill: -1, skillStreak: 0, dropBerserk: false, summonHarb: false, harbT: 0,
      parts,
      unfoldT: 0,   // 兼容图鉴预览
    });
    shake(6, 0.6);
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
        spawnParticles(e.x, e.y, BOSS_BULLET.long, 30, 280);
        shake(10, 0.5);
      }
      return;
    }

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

    // 血量首次低于 70%：最左侧立即召唤炮火先兆者，1s 后右侧再召唤一个（正常出现、正常逻辑）
    if (!e.summonHarb && e.hp <= e.maxHp * 0.70) {
      e.summonHarb = true;
      spawnHarbinger(e.x - e.w / 2);   // 最左侧
      e.harbT = 1.0;                   // 1s 后右侧
    }
    if (e.summonHarb && e.harbT > 0) {
      e.harbT -= dt;
      if (e.harbT <= 0) {
        e.harbT = 0;
        spawnHarbinger(e.x + e.w / 2); // 右侧
      }
    }

    // 血量 70%：掉落一个暴走道具（一次性）
    if (!e.dropBerserk && e.hp <= e.maxHp * 0.70) {
      e.dropBerserk = true;
      spawnPowerup(e.x, e.y + 50, 'berserk', 15);
    }
  }

  function startBossSkill(e) {
    let id;
    if (e.lastSkill === -1) {
      // 旧日之歌第一次释放技能必定是技能1
      id = 0;
    } else {
      id = Math.floor(Math.random() * 4);   // 乱序释放（仅 4 个技能）
      // 全局规则：同一技能最多连续释放两次，禁止三连
      if (id === e.lastSkill && e.skillStreak >= 2) {
        const pool = [0, 1, 2, 3].filter(x => x !== e.lastSkill);
        id = pool[Math.floor(Math.random() * pool.length)];
      }
    }
    // 全局规则：连续随机到同一技能 → 技能间冷却 -80%，且本次技能弹速 +60%
    const repeat = id === e.lastSkill;
    e.skillStreak = repeat ? e.skillStreak + 1 : 1;   // 连续释放同技能的次数（上限 2）
    e.skillCd = repeat ? BOSS.skillCd * 0.2 : BOSS.skillCd;
    // 血量 <50%：技能释放间隔额外降低 50%
    if (e.hp / e.maxHp < 0.5) e.skillCd *= 0.5;
    e.lastSkill = id;
    const spMul = repeat ? 1.6 : 1.0;   // 连中同技能：本次弹速 ×1.6

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
      // 技能4：双管乱射长条弹，间隔与方向均不规律；10% 概率双管齐指玩家当前方向
      s.next -= dt;
      if (s.next <= 0) {
        s.next = rand(0.133, 0.267);
        const aim = Math.random() < 0.10;
        for (const bx of [lx, rx]) {
          const ang = aim
            ? Math.atan2(player.y - by, player.x - bx)
            : rand(0.1, Math.PI - 0.1) + rand(-0.15, 0.15);   // 以下半球为主的随机方向
          pushBossBullet(bx, by, ang, rand(160, 300) * sm, { len: BOSS.longLen, dmg: BOSS.bulletDmg });
        }
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
        if (e.escortTimer <= 0 && e.arrived && !state.challenge) {
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
          Math.hypot(e.x - player.x, e.y - (player.y + PLAYER.hitOffsetY)) < PLAYER.hitRadius + Math.max(e.w, e.h) / 2) {
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
    // gunship / capital / harbinger：下降到悬停高度 → 停留开火 → 停止攻击、以进场同速前开走（可能撞击玩家）
    const cruise = (e.type === 'capital' ? 260 : e.type === 'harbinger' ? HARBINGER.descend : 320) * e.speedMul;
    if (!e.arrived) {
      // 接近悬停高度时逐渐减速到 0（而非瞬间归零）
      if (e.vy == null) e.vy = cruise;
      const dist = e.hoverY - e.y;
      const targetVy = dist >= 90 ? cruise : cruise * Math.max(0.12, dist / 90);
      e.vy += (targetVy - e.vy) * Math.min(1, dt * 12);
      e.y += e.vy * dt;
      if (dist <= 1 || e.y >= e.hoverY) { e.y = e.hoverY; e.arrived = true; e.vy = 0; }
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
    // 挑战模式：不离开，持续悬停攻击（便于观察弹幕）
    if (state.challenge) { e.holdTimer = 2; return; }
    e.leaving = true;
    // 启动加速：较短时间内从 0 平滑加速到巡航速度（比减速过程更快）
    if (e.vy == null) e.vy = 0;
    e.vy += (cruise - e.vy) * Math.min(1, dt * 10);
    e.y += e.vy * dt;
  }
  
  function updateEnemyFire(e, dt) {
    if (e.y < 0) return;   // 未入场不开火
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
  
    if (e.type === 'side') {
      // 仅 'shoot' 变体追踪射击
      if (e.behavior === 'shoot') {
        pushEBullet(e, Math.atan2(player.y - e.y, player.x - e.x) + rand(-0.06, 0.06), cfg.bulletSpeed, cfg);
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
        // 红：火力猛 —— 瞄准三连射 / 左右同时双曲线（每侧6发） / 三方向四轮齐射
        switch (e.pattern % 3) {
          case 0:
            e.burst = { baseAng: Math.atan2(player.y - e.y, player.x - e.x), step: 0, count: 3, shots: 0, gap: 0.12, speed: cfg.bulletSpeed * 1.25, mirror: false };
            e.burstTimer = 0;
            break;
          case 1:
            // 左右两侧同时发射双曲线弹（mirrorAx 对称反转横向加速度），范围向两侧扩大
            e.burst = { baseAng: Math.PI / 2 - 0.18, step: 0, count: 6, shots: 0, gap: 0.085, speed: cfg.bulletSpeed * 1.05, mirror: true, mirrorAx: true, opts: { ax: 220 } };
            e.burstTimer = 0;
            break;
          case 2:
            // 技能三：垂直向下 + 下±20° 三方向，每方向快速射 2 发，连发 4 轮（轮间隔 0.5s）
            fireTriVolley(e, cfg);
            for (let r = 1; r < 4; r++) e.scheduled.push({ t: r * 0.5, fn: () => fireTriVolley(e, cfg) });
            break;
        }
      } else if (e.skill === 'ring') {
        // 金：'/\/\' 弹幕（快速2发+延迟1发） / 巨型橙红弹（单发） 交替
        switch (e.pattern % 2) {
          case 0:   // 技能1：'/\/\' 弹幕 —— 快速发射两发，隔一段时间再发射一次
            fireSlashPattern(e, cfg);
            e.scheduled.push({ t: 0.14, fn: () => fireSlashPattern(e, cfg) });
            e.scheduled.push({ t: 0.62, fn: () => fireSlashPattern(e, cfg) });
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
        case 1: {   // 技能2：从一侧朝斜下方射出 6 枚宽扇双曲线弹，短暂间隔后另一侧再射（先左先右随机）
          const firstSide = Math.random() < 0.5 ? -1 : 1;
          fireHyperbolaFan(e, cfg, firstSide);
          e.scheduled.push({ t: 0.55, fn: () => fireHyperbolaFan(e, cfg, -firstSide) });
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

  // 技能2：双曲线宽扇 —— 从一侧机翼朝正下方射出 6 枚弹，横向加速度(ax)递增，
  // 弹道弯成覆盖面极广的双曲线：最内侧近乎直射正下（偏该侧），最外侧弯到与水平约成 20°
  function fireHyperbolaFan(e, cfg, side) {
    // side = -1：左翼射出、子弹向右下弯；side = +1：右翼射出、向左下弯
    const wingX = e.w * 0.42;
    const spawnX = e.x + side * wingX;
    const speed = cfg.bulletSpeed;
    const axList = [0, 120, 240, 360, 480, 600];   // 递增横向加速度 → 宽扇双曲线（最外侧出射约与水平成 20°）
    for (let k = 0; k < axList.length; k++) {
      pushEBullet(e, Math.PI / 2, speed, cfg, { x: spawnX, ax: -side * axList[k] });
    }
  }

  // 技能3 笔画：同一射线连射 4 发不同初速的长条弹，沿射线拉开成“一笔画”；初速低→加速到 2×常规弹速
  function fireStroke(e, ang, spawnX, cfg, accel, maxSpeed) {
    for (const sp of [42, 97, 152, 207]) {   // 相邻间距较原来 +50%
      pushEBullet(e, ang, sp, cfg, { x: spawnX, accel, maxSpeed, color: SHIP_BULLET_COLOR, len: SHIP_BULLET_LEN });
    }
  }

  // 技能3 第一波：'/||\' —— / 与 | 夹角 30°，两个 | 之间留有横向距离
  function fireBarrageWide(e, cfg) {
    const down = Math.PI / 2, a30 = Math.PI / 6;
    const accel = 400, maxSpeed = cfg.bulletSpeed * 2, gap = 40;   // accel 降低 → 加速到满速时间增至 250%
    fireStroke(e, down + a30, e.x - gap, cfg, accel, maxSpeed);        // '/' 左外，向下偏左 30°
    fireStroke(e, down, e.x - gap * 0.35, cfg, accel, maxSpeed);       // '|' 左
    fireStroke(e, down, e.x + gap * 0.35, cfg, accel, maxSpeed);       // '|' 右
    fireStroke(e, down - a30, e.x + gap, cfg, accel, maxSpeed);        // '\' 右外，向下偏右 30°
  }

  // 技能3 第二波（随后）：'/|\' —— 夹角 45°，单 '|' 居中
  function fireBarrageNarrow(e, cfg) {
    const down = Math.PI / 2, a45 = Math.PI / 4;
    const accel = 400, maxSpeed = cfg.bulletSpeed * 2, gap = 34;   // accel 降低 → 加速到满速时间增至 250%
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
      player.invuln = PLAYER.invulnTime;
      shake(12, 0.5);
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
          Math.hypot(m.x - player.x, m.y - (player.y + PLAYER.hitOffsetY)) < PLAYER.hitRadius + m.r) {
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
    // 挑战模式：敌方血量无限，不可被击杀（回满血量并保留）
    // 例外——BOSS 测试中被高能爆弹削至 0 的 BOSS：真正击杀并退出测试（走下方 BOSS 结算流程）
    const bossTestKill = state.challenge && state.challenge.kind === 'boss' && e.type === 'boss' && e.hp <= 0;
    if (state.challenge && !bossTestKill) { e.hp = e.maxHp; return; }
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
      // 击败 BOSS 25% 掉落高能爆弹
      if (Math.random() < 0.25) spawnPowerup(e.x, e.y, 'bomb', 12);
      // BOSS 死亡：掉落一个暴走道具（短暂下坠后被战机立即吸收，同水晶）
      powerups.push({
        x: e.x, y: e.y, kind: 'berserk', r: 15,
        vx: rand(-60, 60), vy: rand(120, 180),
        absorbDelay: rand(0.4, 0.7),   // 稍微下落一段距离后再强制吸收
      });
      state.bossStage = 'none';   // BOSS 流程结束
      state.bossTimer = 0;
      state.bossVictoryDelay = 2.5;  // 延迟后返回主界面
      state.defeatedBossName = e.name;
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
    // 升级套件 12% / 量子护盾 2.5% / 加血套件 2.4%
    // 注：高能爆弹不在此通用池，仅由 4 类（7%）与 BOSS（25%）掉落
    // 场上升级套件数 + 我方当前攻击等级 === 4 时，升级套件掉率减半（12%→6%）
    const kitOnField = powerups.reduce((n, p) => n + (p.kind === 'kit' ? 1 : 0), 0);
    const kitRate = (kitOnField + player.weapon) === 4 ? 0.06 : 0.12;
    const pr = Math.random();
    if (pr < kitRate) {
      // 升级套件；其中 5% 变为暴走道具（红橙大 S，吃到攻击等级立刻满级）
      if (Math.random() < 0.05) spawnPowerup(e.x, e.y, 'berserk', 15);
      else spawnPowerup(e.x, e.y, 'kit', 12);
    } else if (pr < kitRate + 0.025) {
      spawnPowerup(e.x, e.y, 'shield', 13);
    } else if (pr < kitRate + 0.049) {
      spawnPowerup(e.x, e.y, 'hp', 12);
    }
    enemies.splice(index, 1);
  }

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

  function fireWeapon() {
    const dmg = PLAYER.bulletDamage;
    const r = 3;
    for (const [ox, oy] of WEAPON_LINES[player.weapon]) {
      pBullets.push({ x: player.x + ox, y: player.y + oy, vx: 0, vy: -PLAYER.bulletSpeed, r, dmg, color: currentPlane.bulletColor });
    }
    // Lv4：主弹射出后延迟半拍，在中间位置补射 2 发（视觉错开，全部直射）
    if (player.weapon === 4) {
      const px = player.x, py = player.y;
      setTimeout(() => {
        if (!player.alive || player.weapon !== 4) return;
        pBullets.push({ x: px - 10, y: py - 18, vx: 0, vy: -PLAYER.bulletSpeed, r, dmg, color: currentPlane.bulletColor });
        pBullets.push({ x: px + 10, y: py - 18, vx: 0, vy: -PLAYER.bulletSpeed, r, dmg, color: currentPlane.bulletColor });
      }, 25);
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
    // 挑战模式：我方血量无限，仅播放受击特效，不扣血不掉命
    if (state.challenge) {
      player.invuln = PLAYER.invulnTime;
      shake(6, 0.25);
      spawnParticles(player.x, player.y, '#7ce7ff', 10, 160);
      return;
    }
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

  // 拾取升级套件：升火力；抵达 Lv5 即进入暴走；暴走期间拾取重置倒计时
  function pickupKit() {
    state.score += 50;
    if (player.weapon < 5) {
      player.weapon++;
      if (player.weapon === 5) {
        // 抵达 Lv5 即暴走：限时 6s，结束后回落 Lv4
        player.berserk = BERSERK.duration;
        player.berserkBanner = 1.5;   // 机身上方展示"暴走"字样
        shake(10, 0.4);
        spawnParticles(player.x, player.y, '#ffb545', 26, 260);
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
    shake(alreadyBerserk ? 12 : 18, alreadyBerserk ? 0.4 : 0.7);
    // 多层粒子爆炸增强特效
    spawnParticles(player.x, player.y, '#ff5a1f', 40, 380);
    spawnParticles(player.x, player.y, '#ffb545', 28, 300);
    if (!alreadyBerserk) {
      spawnParticles(player.x, player.y, '#ffffff', 18, 240);
      flash = 0.35;   // 白闪
    }
  }

  function useBomb() {
    // 警报演出期间禁止使用爆弹
    if (playerFireLocked()) return;
    // BOSS 测试模式：高能爆弹无限，不消耗库存
    const bossTest = state.challenge && state.challenge.kind === 'boss';
    if (!bossTest) {
      if (state.bombs <= 0) return;
      state.bombs--;
    }
    shake(18, 0.6);
    // 白闪
    flash = 0.6;
    // 清空敌弹 + 导弹/预警线
    clearEnemyBullets();
    clearMissiles();
    // 高能爆弹：对全场敌人造成 4000 + 目标最大血量10% 的伤害
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
      } else {
        const dmg = BOMB_DAMAGE_BASE + e.maxHp * BOMB_DAMAGE_RATIO;
        e.hp -= dmg;
        spawnParticles(e.x, e.y, '#ffffff', 14, 240);
        if (e.hp <= 0) killEnemy(i);
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
      if (b.ax) b.vx += b.ax * dt;   // 弧线弹（1/4 双曲线弹道）
      // 沿飞行方向加速：初速低、快速增长至上限（4类红技能3 的 '/||\' 弹幕）
      if (b.accel) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const nx = b.vx / sp, ny = b.vy / sp;
        let ns = sp + b.accel * dt;
        if (b.maxSpeed && ns > b.maxSpeed) ns = b.maxSpeed;
        b.vx = nx * ns; b.vy = ny * ns;
      }
      // 分裂弹：飞行一段距离→短时间内减速到 0→分裂成 N 个小子弹（互相等角）
      if (b.split) {
        const s = b.split;
        if (!s.triggered) {
          b.traveled += Math.hypot(b.vx, b.vy) * dt;
          if (b.traveled >= s.dist) {
            s.triggered = true;
            s.baseSpeed = Math.hypot(b.vx, b.vy);   // 记录触发时速度，用于平滑减速
            s.decay = 0.3;                          // 减速到 0 所需时间（短时间，避免瞬停突兀）
            s.stopT = s.decay;
          }
        } else {
          s.stopT -= dt;
          const f = Math.max(0, s.stopT / s.decay);   // 1→0 线性衰减
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > 0.001) { const ns = s.baseSpeed * f; b.vx = b.vx / sp * ns; b.vy = b.vy / sp * ns; }
          if (s.stopT <= 0) {
            const base = Math.random() * Math.PI * 2;   // 随机基准方向，各子弹间隔 360/N
            for (let k = 0; k < s.count; k++) {
              const ang = base + k * (Math.PI * 2 / s.count);
              eBullets.push({
                x: b.x, y: b.y,
                vx: Math.cos(ang) * s.speed, vy: Math.sin(ang) * s.speed,
                ax: 0, accel: 0, maxSpeed: 0,
                r: s.r, len: s.len || 0, dmg: b.dmg, color: s.color, split: null, traveled: 0,
              });
            }
            spawnParticles(b.x, b.y, s.color, 12, 180);
            eBullets.splice(i, 1); continue;
          }
        }
      }
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
          const py = player.y + PLAYER.hitOffsetY;
          const tproj = clamp((player.x - b.x) * ux + (py - b.y) * uy, -b.len / 2, b.len / 2);
          hitPlayer = Math.hypot(player.x - (b.x + ux * tproj), py - (b.y + uy * tproj)) < PLAYER.hitRadius + b.r;
        } else {
          hitPlayer = Math.hypot(b.x - player.x, b.y - (player.y + PLAYER.hitOffsetY)) < PLAYER.hitRadius + b.r;
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

  // 生成道具（非水晶类通用）：下落 + 随机左右漂移（碰边反弹）+ 易被磁吸
  function spawnPowerup(x, y, kind, r) {
    powerups.push({ x, y, kind, r, vy: rand(72, 99), vx: rand(-46, 46) });   // 1.8x 原速(40~55)
  }

  function updatePowerups(dt) {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      // 磁吸：比水晶更易被吸引（半径更大、拉力更强），吸附后直奔机身
      // BOSS 掉落道具（absorbDelay）：先自由下落一小段，随后无视距离被战机吸收（同水晶）
      let magnetized = false;
      if (p.absorbDelay != null && p.absorbDelay > 0) {
        p.absorbDelay -= dt;   // 下坠阶段：保持初始 vx/vy 飘落
      } else if (player.alive) {
        const dx = player.x - p.x;
        const dy = player.y - p.y;
        const dist = Math.hypot(dx, dy);
        const bossPull = p.absorbDelay != null;   // BOSS 掉落道具下坠结束后强制吸收
        if (dist > 1 && (bossPull || dist < POWERUP_MAGNET_RADIUS)) {
          magnetized = true;
          const pull = bossPull ? 1150 : 520 + 640 * (1 - dist / POWERUP_MAGNET_RADIUS);
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
      // BOSS 水晶（absorbDelay）：先自由下落一小段，随后无视距离被战机全部吸收
      if (c.absorbDelay != null && c.absorbDelay > 0) {
        c.absorbDelay -= dt;   // 下坠阶段：保持初始 vx/vy 四散飘落
      } else if (player.alive) {
        const dx = player.x - c.x;
        const dy = player.y - c.y;
        const dist = Math.hypot(dx, dy);
        const bossPull = c.absorbDelay != null;   // BOSS 水晶下坠结束后强制吸收
        if (dist > 1 && (bossPull || dist < PLAYER.magnetRadius)) {
          const pull = bossPull ? 1150 : 900 + 700 * (1 - dist / PLAYER.magnetRadius);
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

  // BOSS警报时立即收集场上所有水晶和道具
  function collectAllItems() {
    for (const c of crystals) {
      state.score += c.val;
      spawnParticles(c.x, c.y, '#9be7ff', 4, 100);
    }
    crystals.length = 0;
    for (const p of powerups) {
      if (p.kind === 'hp') {
        player.hp = clamp(player.hp + 40, 0, PLAYER.maxHp);
      } else if (p.kind === 'bomb') {
        state.bombs = Math.min(state.bombs + 1, MAX_BOMBS);
      } else if (p.kind === 'shield') {
        player.shield = SHIELD_DURATION;
      } else if (p.kind === 'berserk') {
        pickupBerserk();
      } else {
        pickupKit();
      }
      spawnParticles(p.x, p.y, '#ffffff', 6, 130);
    }
    powerups.length = 0;
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

  // 护盾解除冲击波：从玩家位置迅速扩大到全屏，同时渐隐（视觉上解释为何清除全场敌弹）
  const shieldBurst = { active: false, t: 0, duration: 0.65, x: 0, y: 0 };

  // 战机造型（关于原点严格对称）：主绘制与选机缩略图共用，确保两处一致
  // 蓝色机身 + 底部两个稍高的粉色(#FFC0CB)尾翼三角，粉与蓝之间做渐变衔接
  // berserk=true 时机体展开变形（翼展加宽、尾翼延伸）
  function paintShip(g, spreadT = 0) {
    const wingSpread = 1 + spreadT * 0.2;   // 暴走时翼展加宽 20%（渐进）
    const finExtend = 1 + spreadT * 0.25;   // 暴走时尾翼延伸 25%（渐进）

    // 机身主体：蓝色垂直渐变（顶亮 → 底深），非平涂
    const bodyGrd = g.createLinearGradient(0, -24, 0, 16);
    bodyGrd.addColorStop(0, '#f2fbff');
    bodyGrd.addColorStop(0.35, '#d4eeff');
    bodyGrd.addColorStop(0.6, '#7cc4f0');
    bodyGrd.addColorStop(0.85, '#4a9fd8');
    bodyGrd.addColorStop(1, '#2e7ab8');
    g.fillStyle = bodyGrd;
    g.strokeStyle = '#a8e4ff';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, -24);       // 机头
    g.lineTo(6, -6);
    g.lineTo(22 * wingSpread, 10);       // 右翼尖
    g.lineTo(8, 8);
    g.lineTo(5, 15);        // 右尾
    g.lineTo(0, 11);
    g.lineTo(-5, 15);       // 左尾
    g.lineTo(-8, 8);
    g.lineTo(-22 * wingSpread, 10);      // 左翼尖
    g.lineTo(-6, -6);
    g.closePath();
    g.fill();
    g.stroke();

    // 机翼面板线（左右对称细线，增加机械感）
    g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    g.lineWidth = 0.6;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(sx * 7, -2);
      g.lineTo(sx * 18 * wingSpread, 9);
      g.stroke();
      // 翼根短横线
      g.beginPath();
      g.moveTo(sx * 9, 4);
      g.lineTo(sx * 14 * wingSpread, 7);
      g.stroke();
    }

    // 引擎喷口（左右各一个，深蓝色椭圆 + 内发光）
    for (const sx of [-1, 1]) {
      const engGrd = g.createRadialGradient(sx * 4, 14, 0.5, sx * 4, 14, 3.5);
      engGrd.addColorStop(0, '#ffffff');
      engGrd.addColorStop(0.3, '#8adcff');
      engGrd.addColorStop(1, '#1a4a6e');
      g.fillStyle = engGrd;
      g.beginPath();
      g.ellipse(sx * 4, 14, 2.8, 1.8, 0, 0, Math.PI * 2);
      g.fill();
    }

    // 底部两个粉色尾翼三角（稍高、伸出机身；蓝色快速过渡到粉色，粉色区域更大）
    for (const sx of [-1, 1]) {
      const finGrd = g.createLinearGradient(sx * 3, 6, sx * 11 * finExtend, 23 * finExtend);
      finGrd.addColorStop(0, '#57d4ff');      // 靠机身：蓝
      finGrd.addColorStop(0.2, '#FFC0CB');    // 更早过渡到粉色
      finGrd.addColorStop(1, '#ff8fa8');      // 尖端：深粉（更有层次）
      g.fillStyle = finGrd;
      g.strokeStyle = 'rgba(255, 192, 203, 0.5)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(sx * 3, 6);
      g.lineTo(sx * 11 * finExtend, 23 * finExtend);
      g.lineTo(sx * 3, 15);
      g.closePath();
      g.fill();
      g.stroke();
    }

    // 中央脊线高光：白 → 粉(#FFC0CB)渐变（对称菱形，粉色更浓）
    const spineGrd = g.createLinearGradient(0, -20, 0, 12);
    spineGrd.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
    spineGrd.addColorStop(0.3, 'rgba(255, 240, 245, 0.95)');
    spineGrd.addColorStop(0.55, 'rgba(255, 192, 203, 0.9)');
    spineGrd.addColorStop(1, 'rgba(255, 192, 203, 0)');
    g.fillStyle = spineGrd;
    g.beginPath();
    g.moveTo(0, -20);
    g.lineTo(3.2, -2);
    g.lineTo(2.5, 6);
    g.lineTo(0, 12);
    g.lineTo(-2.5, 6);
    g.lineTo(-3.2, -2);
    g.closePath();
    g.fill();

    // 座舱：白色核心 + 微黑外圈
    const cockGrd = g.createRadialGradient(0, -7, 0.5, 0, -7, 5);
    cockGrd.addColorStop(0, '#ffffff');
    cockGrd.addColorStop(0.45, '#ffffff');
    cockGrd.addColorStop(0.7, 'rgba(200, 200, 210, 0.9)');
    cockGrd.addColorStop(1, 'rgba(30, 20, 40, 0.95)');
    g.fillStyle = cockGrd;
    g.beginPath();
    g.arc(0, -7, 3.5, 0, Math.PI * 2);
    g.fill();
    // 座舱外圈黑色描边
    g.strokeStyle = 'rgba(20, 10, 30, 0.8)';
    g.lineWidth = 1;
    g.stroke();
    // 座舱玻璃反光点
    g.fillStyle = 'rgba(255, 255, 255, 0.95)';
    g.beginPath();
    g.ellipse(-0.8, -9, 0.9, 1.4, -0.2, 0, Math.PI * 2);
    g.fill();

    // 粉色机身装饰线（两侧对称，从机身向翼尖延伸）
    g.strokeStyle = 'rgba(255, 192, 203, 0.6)';
    g.lineWidth = 0.9;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(sx * 3, -2);
      g.lineTo(sx * 10 * wingSpread, 3);
      g.lineTo(sx * 17 * wingSpread, 8);
      g.stroke();
    }
    // 粉色机身点缀（小菱形光点）
    g.fillStyle = 'rgba(255, 160, 180, 0.7)';
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(sx * 6, 0);
      g.lineTo(sx * 7.5, 2);
      g.lineTo(sx * 6, 4);
      g.lineTo(sx * 4.5, 2);
      g.closePath();
      g.fill();
    }

    // 暴走时大型展开翼片：从机翼外缘向外展开的三角形能量片（左右各 4 片）
    // spreadT 控制展开程度：0=完全收起，1=完全展开
    if (spreadT > 0.01) {
      const alpha = spreadT * (0.7 + Math.sin(state.time * 10) * 0.1);
      g.shadowColor = '#ff69b4';
      g.shadowBlur = 6 * spreadT;
      for (const sx of [-1, 1]) {
        // 翼片 1（最外）：从翼尖向外上方展开（大三角）
        const tipX1 = sx * 22 * wingSpread;
        const extX1 = tipX1 + sx * 16 * spreadT;
        g.fillStyle = `rgba(255, 80, 160, ${(alpha * 0.8).toFixed(3)})`;
        g.beginPath();
        g.moveTo(tipX1, 4);
        g.lineTo(extX1, 2 - 4 * spreadT);
        g.lineTo(tipX1, 12);
        g.closePath();
        g.fill();

        // 翼片 2（中外）：从翼中外侧向外展开
        const tipX2 = sx * 18 * wingSpread;
        const extX2 = tipX2 + sx * 13 * spreadT;
        g.fillStyle = `rgba(255, 110, 180, ${(alpha * 0.7).toFixed(3)})`;
        g.beginPath();
        g.moveTo(tipX2, 6);
        g.lineTo(extX2, 10 + 2 * spreadT);
        g.lineTo(tipX2, 14);
        g.closePath();
        g.fill();

        // 翼片 3（中内）：从翼中部向外展开
        const tipX3 = sx * 14 * wingSpread;
        const extX3 = tipX3 + sx * 11 * spreadT;
        g.fillStyle = `rgba(255, 140, 200, ${(alpha * 0.65).toFixed(3)})`;
        g.beginPath();
        g.moveTo(tipX3, 7);
        g.lineTo(extX3, 13 + 3 * spreadT);
        g.lineTo(tipX3, 16);
        g.closePath();
        g.fill();

        // 翼片 4（最内）：从翼根外侧向外下方展开（稍小三角）
        const tipX4 = sx * 10 * wingSpread;
        const extX4 = tipX4 + sx * 9 * spreadT;
        g.fillStyle = `rgba(255, 160, 210, ${(alpha * 0.55).toFixed(3)})`;
        g.beginPath();
        g.moveTo(tipX4, 8);
        g.lineTo(extX4, 15 + 3 * spreadT);
        g.lineTo(tipX4, 17);
        g.closePath();
        g.fill();
      }
      g.shadowBlur = 0;
    }

    // 翼尖航行灯（左右各一个小亮点，红/绿）
    g.shadowBlur = 4;
    g.shadowColor = '#ff4444';
    g.fillStyle = '#ff6666';
    g.beginPath();
    g.arc(-21 * wingSpread, 10, 1.3, 0, Math.PI * 2);
    g.fill();
    g.shadowColor = '#44ff44';
    g.fillStyle = '#66ff66';
    g.beginPath();
    g.arc(21 * wingSpread, 10, 1.3, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;

    // 机头尖端高光
    g.fillStyle = 'rgba(255, 255, 255, 0.9)';
    g.beginPath();
    g.moveTo(0, -24);
    g.lineTo(1.5, -19);
    g.lineTo(0, -17);
    g.lineTo(-1.5, -19);
    g.closePath();
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

    // 暴走时翼尖微光（取代原来的金色光环，避免与护盾混淆）
    if (player.weapon === 5) {
      const pulse = 0.3 + Math.sin(state.time * 14) * 0.12;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.shadowColor = '#ff69b4';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ff69b4';
      // 两侧翼尖点状光芹
      ctx.beginPath();
      ctx.arc(x - 22, y + 8, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 22, y + 8, 2.5, 0, Math.PI * 2);
      ctx.fill();
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

    // 机身（与选机缩略图共用同一造型，传入展开进度 0~1）
    const spreadPulse = player.wingSpread > 0.9
      ? 1 + Math.sin(state.time * 10) * 0.02 : 1;   // 完全展开后微微脉动
    ctx.scale(spreadPulse, spreadPulse);
    paintShip(ctx, player.wingSpread);

    ctx.restore();

    // 判定点：机身中心发光白点（下移 4px，真实反映判定范围）
    ctx.save();
    ctx.translate(x, y + 4);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
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
      ctx.fillStyle = '#ff9500';
      ctx.fillRect(-w / 2, -e.h / 2 - 8, w * (e.hp / e.maxHp), 3);
    }

    ctx.restore();
  }

  // BOSS：旧日之歌 —— 灰黑渐变舰体 + 流动彩色光泽 + 音核涟漪 + 双炮管
  function drawBoss(e) {
    const isEntering = (e.phase === 'blackhole' || e.phase === 'emerge' || e.phase === 'assemble');

    // 顶部专用血条（仅战斗阶段显示）
    if (e.phase === 'combat') {
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

    // ---------- 黑洞特效（进场演出期间始终绘制） ----------
    if (isEntering) {
      const BH_DUR = 2.7, EM_DUR = 2.3, AS_DUR = 1.0;
      let bhScale = 1, bhAlpha = 1;
      if (e.phase === 'blackhole') {
        const p = clamp(e.phaseT / BH_DUR, 0, 1);
        bhScale = 0.2 + p * 0.8;   // 黑洞从小变大
        bhAlpha = clamp(p * 3, 0, 1);
      } else if (e.phase === 'emerge') {
        bhScale = 1.0;
        bhAlpha = 1.0;
      } else {
        // assemble：黑洞逐渐收缩消失
        const p = clamp(e.phaseT / AS_DUR, 0, 1);
        bhScale = 1.0 - p * 0.7;
        bhAlpha = 1.0 - p;
      }
      if (bhAlpha > 0.01) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.globalAlpha = bhAlpha;
        const bR = 120 * bhScale;
        // 外层吸积盘：紫色/橙色渐变旋转光环
        for (let ring = 0; ring < 3; ring++) {
          const rr = bR * (1.3 + ring * 0.35);
          const rot = state.time * (1.8 - ring * 0.4) * (ring % 2 === 0 ? 1 : -1);
          ctx.save();
          ctx.rotate(rot);
          ctx.globalAlpha = bhAlpha * (0.5 - ring * 0.12);
          const rg = ctx.createLinearGradient(-rr, 0, rr, 0);
          const hue1 = 270 + ring * 30;
          rg.addColorStop(0, `hsla(${hue1}, 80%, 50%, 0)`);
          rg.addColorStop(0.3, `hsla(${hue1}, 80%, 60%, 0.7)`);
          rg.addColorStop(0.5, `hsla(${hue1 + 40}, 90%, 70%, 0.9)`);
          rg.addColorStop(0.7, `hsla(${hue1}, 80%, 60%, 0.7)`);
          rg.addColorStop(1, `hsla(${hue1}, 80%, 50%, 0)`);
          ctx.strokeStyle = rg;
          ctx.lineWidth = 3 - ring * 0.6;
          ctx.beginPath();
          ctx.ellipse(0, 0, rr, rr * 0.35, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        // 内层漩涡粒子（12 个点绕中心旋转内缩）
        ctx.globalAlpha = bhAlpha * 0.8;
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2 + state.time * 3.5;
          const dist = bR * (0.4 + 0.5 * ((Math.sin(state.time * 2 + i * 1.3) + 1) / 2));
          const px = Math.cos(ang) * dist;
          const py = Math.sin(ang) * dist * 0.45;
          const sz = 2 + Math.sin(i + state.time * 5) * 1;
          ctx.fillStyle = i % 3 === 0 ? '#ff9040' : '#c070ff';
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 6;
          ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
        }
        ctx.shadowBlur = 0;
        // 中心纯黑洞口：径向渐变（全黑核 + 边缘微光）
        const coreG = ctx.createRadialGradient(0, 0, 0, 0, 0, bR);
        coreG.addColorStop(0, 'rgba(0, 0, 0, 1)');
        coreG.addColorStop(0.55, 'rgba(0, 0, 0, 0.95)');
        coreG.addColorStop(0.8, 'rgba(20, 5, 40, 0.6)');
        coreG.addColorStop(1, 'rgba(60, 20, 100, 0)');
        ctx.fillStyle = coreG;
        ctx.beginPath();
        ctx.arc(0, 0, bR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // ---------- 机体绘制（blackhole 阶段不显示，emerge/assemble 渐显） ----------
    if (e.phase === 'blackhole') return;

    ctx.save();
    ctx.translate(e.x, e.y);
    // emerge 阶段透明度渐增
    if (e.phase === 'emerge') {
      ctx.globalAlpha = clamp(e.phaseT / 1.0, 0, 1);
    }
    ctx.scale(e.scale, e.scale);
    const hue = (state.time * 36) % 360;

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

    // 翼板展开动画：emerge 收起，assemble 渐展开，combat 全展开
    const up = e.phase === 'emerge' ? 0
      : e.phase === 'assemble' ? clamp(e.phaseT / 0.9, 0, 1)
      : 1;
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

    // ---------- 组装阶段：飞行中的部件（世界坐标） ----------
    if (e.phase === 'assemble' && e.parts) {
      for (const pt of e.parts) {
        if (pt.attached) {
          // 已镶接：在机体上绘制装甲板高光闪烁（短暂）
          if (pt.flyT < 0.8) {
            const glow = 1 - (pt.flyT - 0.55) / 0.25;
            if (glow > 0) {
              ctx.save();
              ctx.globalAlpha = glow * 0.7;
              ctx.translate(e.x + pt.tx * e.scale, e.y + pt.ty * e.scale);
              ctx.fillStyle = '#c8b0ff';
              ctx.shadowColor = '#c8b0ff';
              ctx.shadowBlur = 12;
              ctx.beginPath();
              ctx.arc(0, 0, 8 * e.scale, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }
          continue;
        }
        if (e.phaseT < pt.delay) continue;   // 还没轮到
        // 绘制飞行中的部件：暗色装甲块 + 紫色尾焰
        const px = e.x + pt.x * e.scale;
        const py = e.y + pt.y * e.scale;
        ctx.save();
        ctx.translate(px, py);
        const flyAng = Math.atan2(pt.ty - pt.y, pt.tx - pt.x);
        ctx.rotate(flyAng);
        // 尾焰（朝后拖尾）
        const tGrd = ctx.createLinearGradient(-22, 0, 6, 0);
        tGrd.addColorStop(0, 'rgba(160, 80, 255, 0)');
        tGrd.addColorStop(1, 'rgba(200, 140, 255, 0.8)');
        ctx.fillStyle = tGrd;
        ctx.fillRect(-22, -3, 28, 6);
        // 装甲块本体
        ctx.fillStyle = '#2a2e35';
        ctx.strokeStyle = `hsla(${hue}, 50%, 60%, 0.8)`;
        ctx.lineWidth = 1.2;
        ctx.shadowColor = '#a060ff';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(3, -7);
        ctx.lineTo(-10, -5);
        ctx.lineTo(-10, 5);
        ctx.lineTo(3, 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }
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
      const impact = clamp((t - nameStart - nameDur) / 0.4, 0, 1);   // 落定冲击进度

      ctx.save();
      ctx.translate(CANVAS_W / 2, 358);
      ctx.font = '46px "华文行楷", "STXingkai", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 落定瞬间：一次性扩散光环 + 横向光刃
      if (impact > 0 && impact < 1) {
        ctx.globalAlpha = alpha * (1 - impact) * 0.7;
        ctx.strokeStyle = '#c8b0ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 46 + impact * 150, 26 + impact * 60, 0, 0, Math.PI * 2);
        ctx.stroke();
        const sw = 40 + impact * 220;
        const sg = ctx.createLinearGradient(-sw / 2, 0, sw / 2, 0);
        sg.addColorStop(0, 'rgba(180, 140, 255, 0)');
        sg.addColorStop(0.5, 'rgba(200, 180, 255, 0.9)');
        sg.addColorStop(1, 'rgba(180, 140, 255, 0)');
        ctx.globalAlpha = alpha * (1 - impact) * 0.9;
        ctx.fillStyle = sg;
        ctx.fillRect(-sw / 2, -1.5, sw, 3);
      }

      // 逐字入场：从上方旋转坠落，缩放收拢，辉光由强到弱
      // 颜色主题：灰→黑→深紫 流动渐变（与 BOSS 机身暗色风格统一）
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
        // 流动相位：每字略有偏移，产生波浪感
        const phase = state.time * 1.8 + i * 0.6;
        // 渐变起点随时间左右移动，产生流动效果
        const flowX = Math.sin(phase) * cw * 0.7;
        const g = ctx.createLinearGradient(-cw / 2 + flowX, -30, cw / 2 + flowX, 30);
        g.addColorStop(0, '#9898b4');     // 浅灰蓝
        g.addColorStop(0.3, '#3d1f6e');   // 深紫
        g.addColorStop(0.6, '#110d18');   // 近黑
        g.addColorStop(0.85, '#5a3080');  // 中紫
        g.addColorStop(1, '#808098');     // 灰
        ctx.fillStyle = g;
        ctx.shadowColor = `rgba(90, 40, 140, ${0.75 + Math.sin(phase) * 0.2})`;
        ctx.shadowBlur = 18 + (1 - eo) * 26;
        ctx.fillText(chars[i], 0, 0);
        ctx.restore();
      }

      // 落定白闪：整名短暂泛白后回归流动渐变
      if (impact > 0 && impact < 1) {
        ctx.globalAlpha = alpha * (1 - impact) * 0.85;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'hsla(275, 60%, 45%, 1)';
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
        // 圆弹：大子弹用径向渐变（白核 → 主色 → 暗边），小子弹平涂
        if (b.r >= 10) {
          const bg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
          bg.addColorStop(0, '#ffffff');
          bg.addColorStop(0.35, b.color);
          bg.addColorStop(1, 'rgba(180, 40, 0, 0.9)');
          ctx.fillStyle = bg;
        } else {
          ctx.fillStyle = b.color;
        }
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        if (b.r >= 10) {
          // 大子弹外圈发光描边
          ctx.strokeStyle = 'rgba(255, 200, 160, 0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
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
    drawNebulae();
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

    // 护盾解除冲击波：从玩家位置迅速扩大到全屏，渐隐消失
    if (shieldBurst.active) {
      const p = shieldBurst.t / shieldBurst.duration;   // 0→1
      const ease = 1 - Math.pow(1 - p, 3);              // easeOutCubic：初始快、末尾慢
      const maxR = 750;                                  // 覆盖全屏对角线
      const r = 36 + ease * maxR;
      const alpha = 1 - p;                               // 线性渐隐
      const lw = 12 * (1 - ease) + 2;                    // 环宽随扩张变细
      ctx.save();
      // 外环：青色发光扩散环
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = '#6fe3ff';
      ctx.shadowColor = '#6fe3ff';
      ctx.shadowBlur = 20 * alpha;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(shieldBurst.x, shieldBurst.y, r, 0, Math.PI * 2);
      ctx.stroke();
      // 内层白色细环（紧跟外环内侧，增加层次）
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, lw * 0.3);
      ctx.beginPath();
      ctx.arc(shieldBurst.x, shieldBurst.y, r * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      // 起始阶段：内部淡青色填充（快速衰减）
      if (p < 0.3) {
        ctx.globalAlpha = (1 - p / 0.3) * 0.25;
        ctx.fillStyle = '#6fe3ff';
        ctx.beginPath();
        ctx.arc(shieldBurst.x, shieldBurst.y, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();

    // 暂停遮罩（由 HTML overlay 接管）
  }

  // ---------- HUD ----------
  function updateHUD() {
    const ratio = player.hp / PLAYER.maxHp;
    hpFill.style.width = (ratio * 100) + '%';
    hpFill.classList.toggle('warn', ratio <= 0.55 && ratio > 0.25);
    hpFill.classList.toggle('danger', ratio <= 0.25);
    hpText.textContent = `${Math.ceil(player.hp)} / ${PLAYER.maxHp}`;
    // 测试情况（测试该敌人 / 测试BOSS）：隐藏积分计数器（.score-panel）
    scoreText.parentElement.style.display = state.challenge ? 'none' : '';
    scoreText.textContent = state.score;
    levelText.textContent = state.challenge ? '测试' : state.level;
    // BOSS 测试模式：高能爆弹无限，显示 ∞
    bombText.textContent = (state.challenge && state.challenge.kind === 'boss') ? '∞' : state.bombs;
    livesText.textContent = '♥'.repeat(Math.max(0, state.lives)) || '—';
    const berserkOn = player.weapon === 5;
    const shieldOn = player.shield > 0;
    // 火力等级始终显示（暴走时显示 Lv5）
    weaponText.textContent = `火力 Lv${player.weapon}`;
    weaponText.classList.remove('berserk', 'shield');
    // 暴走指示器（独立显示）
    if (berserkOn && player.berserk > 0) {
      berserkText.textContent = `暴走 ${player.berserk.toFixed(1)}s`;
      berserkText.classList.add('active');
    } else {
      berserkText.classList.remove('active');
    }
    // 护盾指示器（独立显示）
    if (shieldOn) {
      shieldText.textContent = `护盾 ${player.shield.toFixed(1)}s`;
      shieldText.classList.add('active');
    } else {
      shieldText.classList.remove('active');
    }
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
      if (state.challenge) {
        // 图鉴挑战模式：跳过常规出怪与 BOSS 计时，由 updateChallenge 单独驱动
        updateChallenge(dt);
      } else if (state.bossStage === 'none') {
        state.bossTimer += dt;
        if (state.bossTimer >= BOSS_APPEAR_TIME) state.bossStage = 'wait';
      } else if (state.bossStage === 'wait') {
        if (enemies.length === 0) {
          state.bossStage = 'warn';
          state.warnT = 0;
          collectAllItems();   // 警报开始时立即收集场上所有水晶和道具
          clearEnemyBullets(); clearMissiles();   // 警报触发：立刻清除全场所有弹幕
          startAlarm();
        }
      } else if (state.bossStage === 'warn') {
        state.warnT += dt;
        // 旧日之歌：提前 3s 生成（黑洞在警报背后形成）
        if (!enemies.some(en => en.type === 'boss') && state.warnT >= BOSS_WARN_TOTAL - BOSS_SPAWN_EARLY) {
          spawnBoss(state.pendingBoss);
        }
        if (state.warnT >= BOSS_WARN_TOTAL) {
          stopAlarm();
          state.bossStage = 'fight';
        }
      }

      if (!state.challenge && state.bossStage === 'none') {
        // 雷霆战机模式：等待上一波清完（或差不多）才出下一波
        const activeEnemies = enemies.filter(e => e.type !== 'boss').length;
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0 && activeEnemies <= 2) {
          spawnWave();
          const base = Math.max(0.55, 2.1 - (state.level - 1) * 0.15);
          state.spawnTimer = rand(base * 0.7, base * 1.3);
        }
      
        // 3 / 4 类按冷却出场（同屏各限 1 架，且场上敌机较少时才出场）
        const hasGunship = enemies.some(e => e.type === 'gunship' || e.type === 'harbinger');
        const hasCapital = enemies.some(e => e.type === 'capital');
        if (!hasGunship) state.gunshipCd -= dt;
        if (!hasCapital) state.capitalCd -= dt;
        if (state.level >= 2 && !hasGunship && state.gunshipCd <= 0 && activeEnemies <= 3) {
          // 3 类槽位：本局首次必定出场"炮火先兆者"（便于识别），之后约 30% 概率出场，否则普通炮艇
          if (!state.harbingerIntro) { state.harbingerIntro = true; spawnHarbinger(); }
          else if (Math.random() < 0.3) spawnHarbinger();
          else spawnGunship();
        }
        if (state.level >= 3 && !hasCapital && state.capitalCd <= 0 && activeEnemies <= 2) {
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
      updateNebulae(dt);

      if (state.shakeTime > 0) {
        state.shakeTime -= dt;
        if (state.shakeTime <= 0) { state.shakeTime = 0; state.shakeMag = 0; }
      }
      if (flash > 0) flash = Math.max(0, flash - dt * 2);
      if (shieldBurst.active) {
        shieldBurst.t += dt;
        if (shieldBurst.t >= shieldBurst.duration) shieldBurst.active = false;
      }

      // BOSS 击杀后延迟返回主界面
      if (state.bossVictoryDelay > 0) {
        state.bossVictoryDelay -= dt;
        if (state.bossVictoryDelay <= 0) {
          state.bossVictoryDelay = 0;
          state.mode = 'idle';
          victoryOverlayActive = true;
          planeSelect.classList.add('hidden');
          const encyBtnV = document.getElementById('encyEntryBtn');
          if (encyBtnV) encyBtnV.style.display = 'none';
          showOverlay(
            '胜利',
            `击坠 <b style="color:#ffb545">${state.defeatedBossName}</b>！<br /><br />` +
            (state.challenge ? '' : `最终得分：<b style="color:#7ce7ff;font-size:18px">${state.score}</b><br />`) +
            `抵达关卡：<b style="color:#ffb545">${state.level}</b>`,
            '返回主界面'
          );
        }
      }
    } else {
      updateStars(dt * 0.4);
      updateNebulae(dt * 0.4);
      updateParticles(dt);
    }

    render();
    updateHUD();
    updateBGM();
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
    pauseHomeBtn.classList.add('hidden');
    pauseRetryBtn.classList.add('hidden');
    state.shakeTime = 0;
    state.shakeMag = 0;
    state.gunshipCd = 12;
    state.capitalCd = 25;
    state.harbingerIntro = false;
    state.bossTimer = 0;
    state.bossStage = 'none';
    state.bossVictoryDelay = 0;
    state.defeatedBossName = '';
    victoryOverlayActive = false;
    state.warnT = 0;
    // 测试模式：指定 BOSS 直接挑战；按 R 重开时保留测试目标，点“开始游戏”则清除
    state.testBoss = opts.testBoss !== undefined ? opts.testBoss
      : (opts.keepTest ? state.testBoss : null);
    // 图鉴挑战模式：按 R 重开时保留，点“开始游戏”/返回主界面则清除
    state.challenge = opts.challenge !== undefined ? opts.challenge
      : (opts.keepTest ? state.challenge : null);
    const bossChallenge = state.challenge && state.challenge.kind === 'boss';
    state.pendingBoss = (bossChallenge ? state.challenge.bossId : null) || state.testBoss || 'song';
    if (bossChallenge || state.testBoss) state.bossStage = 'wait';   // 跳过等待，清场后进警报（直接 wait→warn，避免开场多打一发）
    flash = 0;
    shieldBurst.active = false;
    stopAlarm();

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
    player.weapon = (state.testBoss || state.challenge) ? 4 : 1;   // BOSS 试炼 / 图鉴挑战：默认火力 Lv4
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
      bossTestRow.style.display = 'none';   // BOSS 试炼已移入怪物图鉴
      showOverlay('准备起飞~', defaultDesc(), '开始游戏');
      // 图鉴入口按钮
      let encyBtn = document.getElementById('encyEntryBtn');
      if (!encyBtn) {
        const btn = document.createElement('button');
        btn.id = 'encyEntryBtn';
        btn.className = 'ency-entry-btn';
        btn.textContent = '怪物图鉴';
        btn.addEventListener('click', openEncyclopedia);
        startBtn.parentNode.insertBefore(btn, startBtn.nextSibling);
      } else {
        encyBtn.style.display = '';
      }
    }
  }

  function defaultDesc() {
    return `<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动 · <kbd>Space</kbd> 爆弹 · <kbd>P</kbd> 暂停 · <kbd>R</kbd> 重新开始`;
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

      // 缩略图：复用玩家战机造型（高 DPI 适配）
      const cvs = document.createElement('canvas');
      cvs.width = 56 * DPR; cvs.height = 60 * DPR;
      cvs.style.width = '56px'; cvs.style.height = '60px';
      const c = cvs.getContext('2d');
      c.scale(DPR, DPR);
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
    if (state.paused) {
      planeSelect.classList.add('hidden');
      bossTestRow.style.display = 'none';
      const encyBtn = document.getElementById('encyEntryBtn');
      if (encyBtn) encyBtn.style.display = 'none';
      showOverlay('已暂停', '按 <kbd>P</kbd> 继续游戏', '继续游戏');
      pauseHomeBtn.classList.remove('hidden');
      // 挑战模式（含 BOSS 试炼/测试）：额外显示“重新挑战”
      if (state.challenge || state.testBoss) pauseRetryBtn.classList.remove('hidden');
      else pauseRetryBtn.classList.add('hidden');
    } else {
      overlay.classList.add('hidden');
      pauseHomeBtn.classList.add('hidden');
      pauseRetryBtn.classList.add('hidden');
    }
  }

  pauseHomeBtn.addEventListener('click', () => {
    pauseHomeBtn.classList.add('hidden');
    resetGame(false);
  });

  // 重新挑战：保留当前挑战目标（等同按 R），重新开始同一挑战
  pauseRetryBtn.addEventListener('click', () => {
    pauseRetryBtn.classList.add('hidden');
    resetGame(true, { keepTest: true });
  });

  function endGame() {
    state.mode = 'gameover';
    planeSelect.classList.add('hidden');   // 结算页：隐藏选机，直接重开
    const encyBtn = document.getElementById('encyEntryBtn');
    if (encyBtn) encyBtn.style.display = 'none';
    showOverlay(
      '战机陨落',
      `最终得分：<b style="color:#7ce7ff;font-size:18px">${state.score}</b><br />
       抵达关卡：<b style="color:#ffb545">${state.level}</b><br />
       剩余生命：<b style="color:#ff4d6d">${Math.max(0, state.lives)}</b><br /><br />
       按 <kbd>R</kbd> 或点击下方按钮再次出击`,
      '再来一局'
    );
  }

  let victoryOverlayActive = false;

  startBtn.addEventListener('click', () => {
    if (state.paused) {
      togglePause();        // 暂停中点击“继续游戏”：恢复游戏
    } else if (victoryOverlayActive) {
      victoryOverlayActive = false;
      resetGame(false);   // 胜利后返回主界面
    } else {
      // 开局 / 再来一局：保留当前试炼/测试目标（与按 R 一致）；主界面时 testBoss/challenge 已为 null，故仍是正常开局
      resetGame(true, { keepTest: true });
    }
  });

  // ---------- 怪物图鉴 ----------
  const ENCY_GRADES = [
    { name: '虚像级', entries: ['side_pass', 'side_shoot', 'side_kamikaze'] },
    { name: '具象级', entries: ['striker_crimson', 'striker_amber', 'striker_azure', 'striker_white'] },
    { name: '真我级', entries: ['gunship_violet', 'gunship_crimson', 'gunship_amber', 'harbinger'] },
    { name: '诗篇级', entries: ['capital_crimson', 'capital_azure'] },
    { name: '长歌级', entries: ['boss'] },
  ];
  
  // 每种颜色变体独立成条目；type 用于绘制/生成，variant/behavior 用于强制指定变体/行为
  const ENCY_DATA = {
    side_pass: {
      name: '白影侧翼艇', type: 'side', behavior: 'pass', color: '#f0f0f5', hp: 1, score: 60,
      desc: '侧上方斜插穿越战场（速度已降低 40%），血量极低，一碰就碎。<b>无攻击行为</b>，以纯粋的障碍形式穿越。出现概率：<b>70%</b>。',
    },
    side_shoot: {
      name: '黄芒侧翼艇', type: 'side', behavior: 'shoot', color: '#ffd166', hp: 1, score: 60,
      desc: '侧上方斜插穿越战场（速度已降低 40%），血量极低。<b>会追踪玩家方向射击</b>，弹速 230、伤害 6。出现概率：<b>10%</b>（原 20%）。',
    },
    side_kamikaze: {
      name: '紫电侧翼艇', type: 'side', behavior: 'kamikaze', color: '#c084fc', hp: 1, score: 60,
      desc: '侧上方斜插穿越战场（速度已降低 40%），血量极低。<b>亡语：阵亡时向下垂直射击一发</b>（弹速 ×1.1）。出现概率：<b>20%</b>。',
    },
    striker_crimson: {
      name: '赤红突击艇', type: 'striker', variant: 'crimson', color: '#ff3b30', hp: 48, score: 150,
      desc: '上方入场，在前锋停留线短暂停顿后向下冲锋（速度已降低 30%）。<b>垂直向前直射、带 ±10° 随机偏差、不会追踪玩家</b>。<b>初次发射间隔额外 +1s</b>（首发更慢，后续按常规间隔）。出现概率：<b>30%</b>。',
    },
    striker_amber: {
      name: '烈橙突击艇', type: 'striker', variant: 'amber', color: '#ff8a5c', hp: 48, score: 150,
      desc: '上方入场，在前锋停留线短暂停顿后向下冲锋（速度已降低 30%）。<b>朝向前方对称射两发</b>，两枚子弹射线夹角在 <b>50°/60°/70° 间随机</b>（不追踪、不直射）；无赤红那样的初次发射 +1s 修正。出现概率：<b>30%</b>。',
    },
    striker_azure: {
      name: '幽蓝突击艇', type: 'striker', variant: 'azure', color: '#4d9fff', hp: 48, score: 150,
      desc: '上方入场，在前锋停留线短暂停顿后向下冲锋（速度已降低 30%）。移动逻辑与赤红相近，但<b>发射追踪玩家方向的子弹</b>；同样有 <b>初次发射间隔 +1s</b>。登场时 <b>10% 概率获得 1s 虚化护盾、10% 概率获得 2s 虚化护盾</b>（虚化期间不受伤害、我方炮弹会穿过护盾）。出现概率：<b>25%</b>。',
    },
    striker_white: {
      name: '霜白突击艇', type: 'striker', variant: 'white', color: '#eaf1f8', hp: 48, score: 150,
      desc: '上方入场，下降到前锋停留线后<b>停留 2s 再向下冲锋</b>（速度已降低 30%）。<b>不会发射任何子弹</b>，纯粹以机身作为压迫性障碍冲撞玩家。出现概率：<b>15%</b>。',
    },
    gunship_violet: {
      name: '紫晶炮艇', type: 'gunship', variant: 'violet', color: '#c084fc', hp: 300, score: 400,
      desc: '炮艇紫色变体。技能循环：<b>正下方同向双连射</b>（同一方向快速射出 2 发、间隔较小不连在一起，不锁定玩家）→ <b>8 发环形爆发</b> → <b>追踪±5°双弹</b>（朝玩家方向左右各 5° 一次性同时射出 2 发，仅一次） → <b>瞄准单发高速狙击</b>。常规子弹为<b>橙红色长条弹</b>。',
    },
    gunship_crimson: {
      name: '赤红炮艇', type: 'gunship', variant: 'crimson', color: '#ff5a5a', hp: 300, score: 400,
      desc: '炮艇红色变体，火力最猛。技能循环：<b>瞄准三连射</b>（锁定玩家连续三发）→ <b>左右同时·双曲线弹流</b>（左右两侧同时各连射 6 发，弹道呈 1/4 双曲线向两侧大幅外扩）→ <b>三方向四轮齐射</b>（垂直向下与下±20° 三方向，每方向快速射 2 发，连发 4 轮、轮间有间隔）。常规子弹为<b>橙红色长条弹</b>。',
    },
    gunship_amber: {
      name: '金曜炮艇', type: 'gunship', variant: 'amber', color: '#ffbf47', hp: 300, score: 400,
      desc: '炮艇金色变体。技能交替：<b>“八”字形斜弹幕</b>（左右两侧各射一组对称斜弹、与竖直方向夹角 10°；快速连发两次后隔一段时间再补一发）→ <b>瞄准单发巨型弹</b>（改用常规橙红配色、半径较原来缩小 30%、伤害更高，每次仅发射 1 发）。子弹均为<b>橙红色长条弹</b>。',
    },
    harbinger: {
      name: '炮火先兆者', type: 'harbinger', color: '#3a3f4a', hp: 540, score: 450,
      desc: '灰黑体+红核，上方极慢入场，悬停位置更靠上（后排）。不直接开火：核心红色从中心扩展 3s 充满后召唤垂直导弹（最多导引 4 次），随后 2s 灰黑覆盖循环。<br />导弹命中：<b>HP&lt;60 直接击杀</b>；HP≥60 失去 80% 当前血量 + 武器等级 -1。碰撞伤害仅为突击艇的 50%。',
    },
    capital_crimson: {
      name: '赤红主力舰', type: 'capital', variant: 'crimson', color: '#ff4d6d', hp: 4032, score: 1500,
      desc: '主力舰红色变体。技能循环：<b>双翼交叉矛</b>（发射点上移，左右翼各 3 发向内交叉成 X、飞抵下方时更分散）→ <b>双曲线宽扇</b>（从一侧机翼朝斜下方射出 6 枚弹、横向加速度递增弯成覆盖面极广的双曲线，最内侧近乎直射正下、最外侧弯到与水平约成 20°；一侧射完短暂间隔后另一侧再射，先左先右随机）→ <b>“/||\\”→“/|\\” 加速弹幕</b>（每笔画 4 发橙红长条弹、间距更大，初速极低但加速到常规弹速 2 倍、加速时间更长；先 30° 的 “/||\\”、随后 45° 的 “/|\\”）。常规子弹均为<b>橙红色长条弹</b>。居中快速入场，出场及在场期间由 1/2 类护航。',
    },
    capital_azure: {
      name: '苍蓝主力舰', type: 'capital', variant: 'azure', color: '#4d9fff', hp: 4032, score: 1500,
      desc: '主力舰蓝色变体，更聚焦玩家。技能循环：<b>瞄准六连齐射</b>（每发带 ±20° 随机偏差）→ <b>分裂橙红弹</b>（向前方发射大号淡橙红弹，飞行较短一段后在极短时间内平滑减速到 0、再分裂成 6 个小子弹、互相 60° 散开）→ <b>双臂螺旋 12 发</b>。出现时 <b>20% 概率带护盾</b>：前 6s 虚化不受伤害、我方炮弹会穿过护盾打到它后面的敌人。常规子弹为<b>橙红色长条弹</b>。',
    },
    boss: {
      name: '旧日之歌', type: 'boss', color: '#ff7a45', hp: 36888, score: 5000,
      desc: '宽约 60% 屏宽，小幅左右巡航。拥有 5 种技能乱序释放：<br />' +
        '<b>技能1</b> 双管极快连发长条弹 + 双曲线弹流（50%血以下两种曲线并存）<br />' +
        '<b>技能2</b> 散射大子弹（3 轮，随机缺失）<br />' +
        '<b>技能3</b> 四部位标记三连发<br />' +
        '<b>技能4</b> 双管乱射长条弹<br />' +
        '<b>技能5</b> 双曲线弹流<br />' +
        '血量 ≤30% 强制释放技能5；≤66% 掉落暴走道具；<50% 技能间隔减半。',
    },
  };

  let encyCurrentGrade = 0;

  function buildEncyclopedia() {
    encyTabs.innerHTML = '';
    ENCY_GRADES.forEach((g, i) => {
      const tab = document.createElement('button');
      tab.className = 'ency-tab';
      tab.textContent = g.name;
      tab.addEventListener('click', () => selectEncGrade(i));
      encyTabs.appendChild(tab);
    });
    selectEncGrade(0);
  }

  function selectEncGrade(idx) {
    encyCurrentGrade = idx;
    // 高亮 tab
    encyTabs.querySelectorAll('.ency-tab').forEach((t, i) => {
      t.classList.toggle('active', i === idx);
    });
    // 填充列表
    const grade = ENCY_GRADES[idx];
    encyList.innerHTML = '';
    grade.entries.forEach(entryId => {
      const data = ENCY_DATA[entryId];
      const card = document.createElement('div');
      card.className = 'ency-card';
      card.innerHTML = `<div class="ency-card-icon" style="background:${data.color}"></div><span class="ency-card-name">${data.name}</span>`;
      card.addEventListener('click', () => {
        encyList.querySelectorAll('.ency-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        showEncyDetail(entryId);
      });
      encyList.appendChild(card);
    });
    // 清空详情
    encyDetail.innerHTML = '<p class="ency-placeholder">← 选择一个敌人查看详情</p>';
  }

  function showEncyDetail(entryId) {
    const d = ENCY_DATA[entryId];
    const gradeName = ENCY_GRADES[encyCurrentGrade].name;
    const isBoss = d.type === 'boss';
    // BOSS 页面：试炼（正常战斗、双方不无敌）+ 测试该敌人（双方无敌、爆弹无限）
    // 普通敌人页面：仅测试该敌人（双方无敌）
    const actionHtml = isBoss
      ? `<button class="ency-challenge-btn boss" id="encyTrialBtn">⚔ BOSS 试炼</button>
         <button class="ency-challenge-btn" id="encyChallengeBtn">🔬 测试该敌人</button>
         <div class="ency-challenge-hint">BOSS 试炼：正常战斗，敌我均会受损、可被击坠<br />测试该敌人：双方无敌 · 高能爆弹无限 · 每枚爆弹削减 BOSS 20% 最大生命</div>`
      : `<button class="ency-challenge-btn" id="encyChallengeBtn">🔬 测试该敌人</button>
         <div class="ency-challenge-hint">测试模式：我方血量无限 · 敌方血量无限 · 仅单个敌人</div>`;
    encyDetail.innerHTML = `
      <div class="ency-detail-name" style="color:${d.color}">${d.name}</div>
      <div class="ency-detail-grade">${gradeName}</div>
      <canvas class="ency-detail-canvas" id="encyPreview" width="220" height="140"></canvas>
      <div class="ency-stats">
        <div class="ency-stat">HP<b>${d.hp}</b></div>
        <div class="ency-stat">分数<b>${d.score}</b></div>
      </div>
      <div class="ency-detail-desc">${d.desc}</div>
      ${actionHtml}
    `;
    // 绘制预览
    drawEncyPreview(d);
    if (isBoss) {
      document.getElementById('encyTrialBtn').addEventListener('click', () => startBossTrial());
    }
    document.getElementById('encyChallengeBtn').addEventListener('click', () => startChallenge(entryId));
  }

  // 从图鉴发起测试：敌我血量无限，仅生成单个目标敌人（BOSS 测试附带爆弹无限）
  function startChallenge(entryId) {
    const d = ENCY_DATA[entryId];
    const challenge = d.type === 'boss'
      ? { kind: 'boss', type: 'boss', bossId: 'song' }
      : { kind: 'enemy', type: d.type, variant: d.variant || null, behavior: d.behavior || null };
    closeEncyclopedia();
    resetGame(true, { challenge });
  }

  // BOSS 试炼：正常战斗模式（双方均不无敌，走 testBoss 流程直接进警报登场）
  function startBossTrial() {
    closeEncyclopedia();
    resetGame(true, { testBoss: 'song' });
  }

  // 图鉴预览：复用游戏内真实绘制逻辑（临时将全局 ctx 指向预览画布）
  function drawEncyPreview(d) {
    const cvs = document.getElementById('encyPreview');
    if (!cvs) return;
    // 高 DPI 适配：逻辑尺寸 220×140，物理像素按 DPR 放大
    const LW = 220, LH = 140;
    cvs.width = LW * DPR;
    cvs.height = LH * DPR;
    cvs.style.width = LW + 'px';
    cvs.style.height = LH + 'px';
    const pctx = cvs.getContext('2d');
    pctx.scale(DPR, DPR);
    pctx.clearRect(0, 0, LW, LH);
    const realCtx = ctx;
    ctx = pctx;
    try {
      if (d.type === 'boss') {
        const scale = Math.min(LW * 0.72 / BOSS.w, LH * 0.72 / (BOSS.h * 1.15));
        pctx.save();
        pctx.translate(LW / 2, LH / 2 + 6);
        pctx.scale(scale, scale);
        // phase:'preview' 跳过血条和黑洞特效，直接展示完整机体
        drawBoss({ type: 'boss', x: 0, y: 0, w: BOSS.w, h: BOSS.h, hp: BOSS.hp, maxHp: BOSS.hp, phase: 'preview', scale: 1, skill: null, unfoldT: 1, parts: [] });
        pctx.restore();
      } else {
        const et = ENEMY_TYPES[d.type];
        const scale = clamp(Math.min(LW * 0.7 / et.w, LH * 0.7 / et.h), 0.4, 1.7);
        pctx.save();
        pctx.translate(LW / 2, LH / 2);
        pctx.scale(scale, scale);
        drawEnemy({
          type: d.type, x: 0, y: 0, w: et.w, h: et.h,
          color: d.color, variant: d.variant || null, behavior: d.behavior || null,
          hp: et.hp, maxHp: et.hp, phase: 0, shielded: false,
          arrived: true, chargeT: HARBINGER.charge * 0.75, _sideVel: null,
        });
        pctx.restore();
      }
    } finally {
      ctx = realCtx;
    }
  }

  function openEncyclopedia() {
    encyclopedia.classList.remove('hidden');
    overlay.classList.add('hidden');
    buildEncyclopedia();
  }

  function closeEncyclopedia() {
    encyclopedia.classList.add('hidden');
    overlay.classList.remove('hidden');
  }

  encyClose.addEventListener('click', closeEncyclopedia);

  // ---------- 启动 ----------
  initStars();
  initNebulae();
  buildPlaneCards();
  resetGame(false);
  requestAnimationFrame(loop);
})();
