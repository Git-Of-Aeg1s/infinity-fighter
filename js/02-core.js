// 02-core：画布与 DOM 引用 / 全局状态与实体数组 / 工具函数 / 星空星云
'use strict';

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
  const bombIcons = document.getElementById('bombIcons');
  const livesText = document.getElementById('livesText');
  const berserkBar = document.getElementById('berserkBar');
  const berserkFill = document.getElementById('berserkFill');
  const shieldBar = document.getElementById('shieldBar');
  const shieldFill = document.getElementById('shieldFill');

  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayDesc = document.getElementById('overlayDesc');
  const startBtn = document.getElementById('startBtn');
  const musicToggle = document.getElementById('musicToggle');
  const planeSelect = document.getElementById('planeSelect');
  const planeGrid = document.getElementById('planeGrid');
  const wingmanSelect = document.getElementById('wingmanSelect');
  const wingmanGrid = document.getElementById('wingmanGrid');
  const bossTestRow = document.getElementById('bossTestRow');
  const retrialBtn = document.getElementById('retrialBtn');   // 胜利结算页「再次挑战」（仅试炼/挑战模式显示）
  const pauseHomeBtn = document.getElementById('pauseHomeBtn');
  const pauseRetryBtn = document.getElementById('pauseRetryBtn');

  // 怪物图鉴 DOM
  const encyclopedia = document.getElementById('encyclopedia');
  const encyTabs = document.getElementById('encyTabs');
  const encyList = document.getElementById('encyList');
  const encyDetail = document.getElementById('encyDetail');
  const encyClose = document.getElementById('encyClose');

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
    waveSeq: 0,        // 波次序号：标记本波生成的敌人，上一波机动兵力清场后才放下一波
    shakeTime: 0,
    shakeMag: 0,
    lowPressureT: 0,   // 压力低于阈值累计时长（驱动刷新倒计时加速，回到阈值以上归零）
    specialIdleT: 0,   // 3类槽位空闲累计时长（高于压力阈值时超过上限仍会强制刷新特殊3类）
    capitalIdleT: 0,   // 4类槽位空闲累计时长（同上，上限更长）
    harbingerIntro: false, // 本局是否已首次出场炮火先兆者（仅第一轮首出必是；第二轮无强制）
    orangeBombUsed: false, // 本场战斗橙色敌人 1% 爆弹是否已触发（整场最多一次；不影响 4类/BOSS 掉落）
    crystalMagnetMul: 1,   // 水晶磁吸半径倍率（击败第一个 BOSS 后永久 ×1.35，重开归 1）
    bossTimer: 0,      // BOSS 登场倒计时（累计战斗时长）
    bossStage: 'none', // BOSS 流程：none | wait(等清场) | warn(警报演出) | fight(BOSS战)
    bossVictoryDelay: 0, // BOSS 击杀后延迟返回主界面
    postBossDelay: 0,    // BOSS 击败后到恢复刷怪的缓冲（2s，不计入关卡推进）
    postBossWaveT: 0,    // BOSS 后固定首波（1类长队）刷出起 4s 观察期，结束后恢复正常刷怪（不计入关卡推进）
    defeatedBossName: '', // 被击败的 BOSS 名称
    warnT: 0,          // 警报演出计时
    bossPhase: 0,      // 关卡阶段索引：0=首段刷怪(50s)→旧日之歌；1=二段刷怪(40s)→暴风之眼
        pendingBoss: 'song',   // 即将登场的 BOSS id
    testBoss: null,    // 测试模式：直接挑战的 BOSS id
    challenge: null,   // 图鉴挑战模式：{ kind:'enemy'|'boss', type, variant, behavior, bossId }，敌我血量无限、仅单个敌人
    hasteT: 0,         // 斗志昂扬增益：我方攻速 / 弹道飞行速度翻倍的剩余时间（击毁斗志昂扬后 8s）
    prevLevel: 1,      // 上一帧关卡等级：检测「关卡提升」以触发斗志昂扬 5% 出现
  };

  const player = {
    x: CANVAS_W / 2,
    y: CANVAS_H - 90,
    w: PLAYER.w,
    h: PLAYER.h,
    hp: PLAYER.maxHp,
    kbT: 0, kbVx: 0, kbVy: 0,   // 风暴风流/风柱命中的击退（短暂位移、快速衰减）
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
  /** @type {Array} */ let trailGhosts = [];   // 暗紫轨迹残影（部件球弹幕：帧间线段留存渐隐）
  /** @type {Array} */ let particles = [];
  /** @type {Array} */ let powerups = [];
  /** @type {Array} */ let crystals = [];
  /** @type {Array} */ let missileWarns = [];   // 炮火先兆者导弹垂直预警线
  /** @type {Array} */ let missiles = [];       // 预警结束后从上方下落的导弹
  /** @type {Array} */ let blBombs = [];        // 暴鸰投出的炸弹（预警 → 低速下坠 → 极速加速 → 爆炸）
  /** @type {Array} */ let popianMissiles = [];  // 破片三连发导弹（高速、不可击毁、条件性无视无敌）
  /** @type {Array} */ let zoneMarks = [];      // 暴风之眼：白色区域标记（风流/风柱打击预警：风流约 1.1s / 风柱 1.3s）
  /** @type {Array} */ let windFlows = [];      // 标记到期后沿曲线呼啸而至的风流
  /** @type {Array} */ let pillarStrikes = [];  // 标记到期后降下的垂直风柱打击
  /** @type {Object|null} */ let stormVortex = null;   // 暴风之眼：涡流风旋（技能7，自转喷出密集风条）
  /** @type {Array} */ let stars = [];
  /** @type {Array} */ let wingmen = [];   // 僚机（成对，跟随主机两侧，不可被击中）
  /** @type {Array} */ let douzhiFx = [];  // 斗志昂扬死亡演出（脱离渐隐的蓝盒 / 淡黄扩大光环 / 快速渐隐的本体）

  // ---------- 星空 ----------
  // 星星着色：多数蓝白，少量粉(#FFC0CB)/青(#39C5BB)，与星云雾霭共同营造"青粉丝域"
  const STAR_TINTS = [
    [200, 225, 255],   // 常规蓝白
    [255, 192, 203],   // 粉
    [120, 230, 220],   // 青
  ];

  function initStars() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      const roll = Math.random();
      const tint = roll < 0.76 ? 0 : (roll < 0.88 ? 1 : 2);   // 76% 蓝白 / 12% 粉 / 12% 青
      stars.push({
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
        z: Math.random() * 0.8 + 0.2,   // 视深度：影响速度与亮度
        tint,
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
      const [r, g, b] = STAR_TINTS[s.tint || 0];
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
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
      alpha: rand(0.16, 0.32),       // 提高不透明度：粉/青云雾在深蓝背景上清晰可见
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
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';   // 叠加发光：粉/青云雾在深蓝背景上真正可见
    for (const n of nebulae) {
      const [r, g, b] = n.color;
      const breath = 1 + Math.sin(n.pulse) * 0.15;   // 呼吸缩放
      const rad = n.r * breath;
      const a = n.alpha * (0.8 + Math.sin(n.pulse) * 0.2);
      const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, rad);
      grd.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${a.toFixed(4)})`);
      grd.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${(a * 0.55).toFixed(4)})`);
      grd.addColorStop(0.75, `rgba(${r}, ${g}, ${b}, ${(a * 0.18).toFixed(4)})`);
      grd.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(n.x - rad, n.y - rad, rad * 2, rad * 2);
    }
    ctx.restore();
  }

  // ---------- 工具 ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // 斗志昂扬增益倍率：击毁后 8s 内我方攻速 / 弹道飞行速度翻倍（hasteT > 0 时返回 2，否则 1）
  function hasteMul() { return state.hasteT > 0 ? DOUZHI.buffMul : 1; }

  // 按权重从池中随机取一个 id（weights 缺失的 id 视为 1）——BOSS 技能加权随机用
  function weightedPick(pool, weights) {
    let total = 0;
    for (const id of pool) total += (weights[id] != null ? weights[id] : 1);
    let r = Math.random() * total;
    for (const id of pool) {
      r -= (weights[id] != null ? weights[id] : 1);
      if (r <= 0) return id;
    }
    return pool[pool.length - 1];
  }

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

