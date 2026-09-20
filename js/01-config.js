// 01-config：全部常量与注册表（画布/战机/僚机/敌机类型/BOSS/掉落率/压力权重）

console.log('[InfinityFighter] JS build: 20260919-bulwark-hex-fix-5');   // 【临时】构建标记：验证浏览器缓存是否已刷新，确认后删除

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：02-core(5 名) 04-spawn(25 名) 05-boss(8 名) 06-enemy(43 名) 07-player(16 名) 08-entities(14 名) 09-draw-ships(16 名) 10-draw-world(5 名) 11-draw-boss(7 名) 12-ui(17 名) 13-encyclopedia(18 名) 14-main(14 名)
  //


/**
 * 大无垠战机 · Big Infinity Fighter
 * 一个纯 Canvas 2D 实现的雷霆战机风格 Demo。
 *
 * 操作：
 *   W/A/S/D  移动战机
 *   Space    释放高能爆弹（清空全部敌弹 + 全场敌人受 4000 + 最大血量10% 伤害）
 *   P        暂停 / 继续
 *   R        重新开始
 */

  // ---------- 常量 ----------
  const CANVAS_W = 480;
  const CANVAS_H = 792;   // 战场高度（原 720 增长 10%：上边界不动、下边界下移）

  const PLAYER_CFG = {
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
    magnetRadius: 132,   // 水晶吸附半径（基础值；击败旧日之歌后另乘 crystalMagnetMul 1.5 → 198）
    hitRadius: 4,        // 判定点半径：仅机身中心小点被击中才算命中
    hitOffsetY: 4,       // 判定点下移偏移（与白点视觉位置一致）
  };

  // 火力 5 级：直射窄弹道，射线数递增；Lv4 为 5 射线 + 半拍后于中间补射 2 发（视觉错开，不增宽）
  // Lv5 即暴走：限时 6s，攻速同 Lv4、弹速大幅提升，十射线（5 个位置各双发）、伤害 ×2
  // dmgMul：每发子弹伤害倍率（乘 PLAYER_CFG.bulletDamage）。用于把各级“每秒平均伤害(DPS)”压成等比链——
  //   Lv3 = Lv4×80%、Lv2 = Lv3×80%、Lv1 = Lv2×80%（以 Lv4 为基准，暴走 Lv5 独立走 BERSERK.dmgMul）。
  //   低级弹少且慢，故靠“单发更重”补足 DPS：主炮 DPS ≈ Lv1 358 / Lv2 448 / Lv3 560 / Lv4 700 / Lv5 2000。
  const WEAPON_LEVELS = [
    null,
    { name: 'Lv1', interval: 0.24, dmgMul: 2.3893 },   // 3 射线，射速稍慢；单发 ≈28.67
    { name: 'Lv2', interval: 0.19, dmgMul: 1.7733 },   // 4 射线；单发 ≈21.28
    { name: 'Lv3', interval: 0.14, dmgMul: 1.3067 },   // 5 射线，射速正常；单发 ≈15.68
    { name: 'Lv4', interval: 0.12, dmgMul: 1 },        // 5 射线 + 半拍补射 2 发；单发 12（基准）
    { name: 'Lv5', interval: 0.12 },                   // 暴走：限时 6s，攻速同 Lv4，弹速提升，伤害走 BERSERK.dmgMul
  ];
  const CHAOS_PIERCE_DMG_MUL = 0.5;   // 混乱将至主炮弹穿透后的伤害倍率：每发可穿透 1 个非 BOSS/4类敌人，穿透后伤害减半（结算见 08-entities，美术见 10-draw-world）
  const BERSERK = { interval: 0.12, dmgMul: 2, rMul: 1.4, duration: 6, spdMul: 1.6 };
  const SHIELD_DURATION = 6;   // 量子护盾持续时间

  // ---------- BOSS：旧日之歌 ----------
  // 第一个 BOSS：累计战斗约 60s 后登场，宽约 60% 屏宽，小幅左右巡航，仅 1 条命
  // 全局规则（适用于所有 BOSS）：技能乱序释放；若连续随机到同一技能，
  // 该技能结束后的冷却降为 20%（-80%）
  // ---------- 关卡流程：刷怪 50s → 旧日之歌 → 击败后 2s 缓冲 + 固定首波（1类长队）+ 4s 观察期 → 刷怪 50s → 暴风之眼 → 风暴编织者 → 胜利 ----------
  const BOSS_SEQUENCE = ['song', 'storm', 'storm2'];   // BOSS 出场顺序（正常流程按序登场；风暴编织者由暴风之眼死后直接召唤，不经警报/刷怪）
  const SPAWN_PHASE_TIMES = [50, 50];        // 各阶段刷怪时长（s）：两轮均为 50s（第二轮与第一轮节奏一致）
  // 关卡由“非 BOSS 期间的有效刷怪时间”驱动（不再随分数增长，切断高分→怪多→更高分的正反馈）：
  // 出怪期间每 5s +1（50s 刷怪期恰好 +10 级）：第一轮 1 级起步 → 50s 后恰好 11 级（首个 BOSS 登场即 11 级）；
  // 第二轮 11 级衔接起步 → 50s 封顶 21 级；停怪/警报/BOSS 战期间冻结，BOSS 后缓冲与首波观察期同样不计入
  const SPAWN_PHASE_LEVEL = [
    { base: 1, step: 5 },
    { base: 11, step: 5 },
    { base: 21, step: 5 },   // 第三阶段（风暴编织者）：无刷怪期，仅保持 21 级衔接（阶段连续不回退）
  ];
  const BOSS = {
    name: '旧日之歌',
    w: 288, h: 130,            // 宽度约 60% 屏宽
    hp: 32000,                 // 首个 BOSS 血量
    score: 6000,
    hoverY: 120,
    moveAmp: 80, moveSpeed: 0.55,   // 小幅左右巡航
    skillCd: 2.2,              // 技能间基础冷却（连中同技能 ×0.2）
    bulletDmg: 14, bigDmg: 32, arcDmg: 18,   // 长条弹 / 大子弹 / 双曲线弹 伤害
    longLen: 26,               // 长条弹长度：略短于 1 类敌机身长
    crashDmg: 50,              // 接触一次性伤害（受击无敌帧照常；暴风之眼走独立持续掉血模型）
  };
  const BOSS_BULLET = { long: '#ff7a45', big: '#c9a0ff', arc: '#a5ffd6' };
  // long：普通长条弹（橙红，带描边）；big：技能2 大子弹；arc：技能5 双曲线弹流（特殊攻击保留幽绿色）

  // ---------- BOSS2：暴风之眼（第二波；第一阶段为白色龙卷风暴） ----------
  const STORM = {
    name: '暴风之眼',
    w: 384, h: 384,            // 占屏宽 80%（CANVAS_W=480）
    hp: 45000,                 // 一阶段血量
    score: 6000,               // 击杀分数（原 9000 降为 6000：水晶掉落移交给二阶段）
    hoverY: 205,               // 风暴中心悬停高度
    skillCd: BOSS.skillCd * 0.5,   // 技能间基础冷却 = 旧日之歌常态间隔（2.2s）的 50%（连中同技能 ×0.2）
    windDmg: 28,               // 技能1 风波伤害（原 30）
    flowR: 18.2,               // （旧风流半宽，已弃用仅留参考）风波取其稍宽值，见 waveHalfW
    waveHalfW: 21,             // 风波竖直半厚（旧风流 18.2 的稍宽版）
    waveSagMin: 32,            // 风波下弯最小幅度（px：弯在下面，形似"（"逆时针旋转 90°，可不对称）
    waveSagMax: 68,            // 风波下弯最大幅度（px；曲率已增大）
    waveDur: 0.55,             // 风波显现后存留时长（瞬时降临、快速渐隐）
    tornadoDmg: 16,            // 风弹伤害（技能2/4/5/6）
    tornadoCrash: 32,          // 大型龙卷碰撞伤害
    pillarDmg: 22,             // 技能3 风柱伤害
    vortexDmg: 16,             // 技能7 涡流风旋碰撞伤害
    pillarW: 67,               // 风柱宽度 ≈ 10% 屏宽
    warnTime: 1.3,             // 区域标记倒计时
    tornadoDescend: 55,        // 大型龙卷缓慢下移速度
    tornadoMainDR: 0.5,        // 风团对主武器（主机弹幕）减伤 50%
    tornadoWingVuln: 1.5,      // 风团受到僚机伤害提高 150%（弱点：僚机火力）
  };
  const STORM_WIND = '#dff3ff';   // 风弹/风流配色（风白）

  // ---------- 诗篇难度：暴风之眼技能改版参数（真我不读取；04-spawn / 05-boss / 08-entities 经 isShipian() 门控） ----------
  // 技能1：脱离技能轮换——每 10~16s 独立释放一轮风波（单轮 3~4 道、随机一侧），不占用技能槽、不影响技能释放间隔
  // 技能2：大型龙卷血量 6000（真我 3200）；受到僚机伤害额外 +150%（与 tornadoWingVuln 1.5 加算，不乘算）
  // 技能3：风柱射击 10 次（真我 5），第一次射击同时射出两处（共 11 道风柱），射击间隔不变
  // 技能4：总时长 9s；持续期间自身减伤 25%；旋转速度 +20%、风弹射速 +30%；初始方向顺/逆时针随机，
  //   期间随机改变 1~3 次方向（相邻两次 ≥1s；7s 仍未改变过则 7s 必定改变一次）
  // 技能5：两轮风弹数量 14/11（真我 12/9）；普通风弹 20% 概率射速减慢 20%~50%（强化大风弹不减慢）
  // 技能7：涡流风旋改为三旋臂（真我双旋臂）
  const STORM_SHIP = {
    s1: { min: 10, max: 16 },                  // 技能1 独立释放间隔（s）
    s2: { hp: 6000, wingVulnAdd: 1.5 },        // 技能2 龙卷血量 / 僚机易伤追加（加算）
    s3: { shots: 10, firstDouble: true },      // 技能3 射击次数 / 首次射击两处
    s4: {
      dur: 9, dr: 0.25,                        // 总持续时长（s）/ 持续期间自身减伤
      spinMul: 1.2, speedMul: 1.3,             // 旋转速度 +20% / 风弹射速 +30%
      changesMin: 1, changesMax: 3,            // 持续期间随机改变方向次数
      changeGap: 1,                            // 相邻两次改变方向的最小间隔（s）
      forceChangeAt: 7,                        // 届时仍未改变过方向 → 此刻必定改变一次（s）
    },
    s5: { counts: [14, 11], slowChance: 0.20, slowMin: 0.5, slowMax: 0.8 },   // 两轮数量 / 减速概率与弹速倍率区间
    s7: { arms: 3 },                           // 涡流风旋旋臂数
  };

  // ---------- BOSS3：风暴编织者（风暴消散后现身的雷电飞舰） ----------
  const STORM2 = {
    name: '风暴编织者',
    w: 168, h: 94,             // 判定箱（基础 ×1.2 整体扩大；仍刻意小于模型视觉约 208 ≈ 43% 屏宽）
    hp: 25000,                 // 二阶段血量
    score: 6000,
    hoverY: 150,               // 悬停高度（较风暴中心 205 更靠下，凸显机体形态）
    moveSpeed: 1.65,           // 水平巡航角速度：旧日之歌 0.55 的 3 倍（悬停移速显著更高）
    moveAmp: 110,              // 水平巡航幅度
    bobAmp: 22,                // 上下浮动幅度（一定程度的上下移动）
    bobSpeed: 0.9,             // 上下浮动角速度
    crashDmg: 40,              // 碰撞伤害（接触一次性，受击无敌帧照常）
    // ---- 技能（实装：状态机见 05-boss，演出见 11-draw-boss）----
    skillCd: STORM.skillCd * 0.75,   // 技能释放间隔 = 暴风之眼的 75%（玩家暴走时再减半，见 updateBossStorm2）
    berserkDR: 0.30,                 // 受到暴走（Lv5）伤害 -30%（主炮/僚机/斩击经 enemyDamageMul 生效；爆弹为真实伤害不受影响）
    s1Charge: 1.2, s1R: 15, s1BeamDur: 0.9,   // 技能1：电弧球蓄力 → 向下强力电弧激光（伤害走导弹规则，见 runStorm2Skill）
    s2Charge: 1.2, s2Gap: 0.13, s2R: 7, s2BeamDur: 0.45, s2Dmg: 50,   // 技能2：四喷口激涌蓄力 → 随机序依次下射电弧激光
    s3Dmg: 25,                       // 技能3：场地正中释放斜下电弧光束（左右镜像对称，左右边界反弹，弹道呈"<"折线）
    s4Dmg: 20,                       // 技能4：蛇形瞄准连射 / 雷环子弹（含技能5 打击外扩的雷环）
    ringR: 5.4,                      // 雷电圆形子弹半径（带短拖尾）
    ringV0: 470, ringCruise: 205, ringDecel: 300,   // 雷环子弹：初速较高 → 减速至巡航速度
    s5Warn: 1.2, s5Dmg: 40, s5RMul: 0.8,   // 技能5：雷击预警时长 / 打击伤害 / 区域半径系数（×焦香螺旋桨火环 JIAOXIANG.auraR）
    s6Dmg: 28, s6R: 7,               // 技能6：臂向光束 / 重现光束伤害与半宽（重现光束与臂向光束同长）
  };

  // ---------- 诗篇难度：旧日之歌技能改版参数（真我不读取；05-boss 经 isShipian() 门控） ----------
  // 技能1：恒 4 条旋转双曲线弹流（初始方向/角速度逐条随机；当前指向水平以上时角速度大幅增加、以下较为减小）；
  //   时长：≥70% 血 +25%、<70% 血 ×3；释放其他技能时概率连携技能1（连携不享时长加成，2 条流概率见 link）
  // 技能2：7 轮大子弹散射（缺失 10%~20%）；首轮必定慢速，其余随机 3 轮快速（弹速 ×1.4~1.7）
  // 技能3：2 部位锁定标记点（间隔 ×1.8）+ 2 部位持续追踪玩家（间隔 ×1.4）
  // 技能4：≥70% 血 270° 双发同时乱射；<70% 血 360° 单发乱射 + 射速 ×3 + 每 1~1.5s 向下扇形圆弹幕（8~10 发，
  //   弹速 = 乱射长条弹基准速度 ×(60%~90% 或 120%~150%)）
  // 技能5/6：暗黑子弹（登场部件球弹幕同源）——技能5 瞄准玩家竖直近旁 ±10% 屏高带状区域；
  //   技能6 射向两侧边界（[自身高度-20% 屏高, 屏幕底部] 或底部左右边缘，二选一），碰左右壁反弹，左右对称
  const SONG_SHIP = {
    skillCdMul: 0.4,           // 技能释放间隔 = 原有的 40%
    dark: { r: 7, dmg: 20, speed: 430, color: '#c084fc', trail: '#7c3aed', preT: 0.25, band: 0.10, wallUp: 0.20 },
    s1: {
      durBase: 1.0,            // 基础时长（与真我一致）
      durHighHp: 1.25,         // ≥70% 血：时长 ×1.25（+25%）
      durLowHp: 3.0,           // <70% 血：时长 ×3（300%）
      streams: 4,              // 恒 4 条双曲线弹流
      emitGap: 0.24,           // 每条流的发射间隔（s）
      speed: 230, arcDmg: BOSS.arcDmg,
      life: 4.5,               // 旋转弧线弹寿命上限（s）：防止高速旋转弹长期滞留场上
      angSpread: 1.9,          // 初始方向 = 竖直向下 ± 此弧度（逐条随机）
      spinMin: 0.9, spinMax: 2.2,   // 角速度随机区间（rad/s，方向逐条随机）
      spinUpMul: 2.8,          // 当前指向水平以上（vy<0）：角速度大幅增加
      spinDownMul: 0.55,       // 水平以下：角速度较为减小
      link: { chance: 0.18, chanceLowHp: 0.22, twoStreamChance: 0.60, twoStreamChanceLowHp: 0.40 },
    },
    s2: { rounds: 7, roundGap: 0.8, missMin: 0.10, missMax: 0.20, fastRounds: 3, fastMin: 1.4, fastMax: 1.7 },
    s3: { lockIntervalMul: 1.8, trackIntervalMul: 1.4 },
    s4: {
      rateMul: 3,              // <70% 血乱射射速 ×3
      fanGapMin: 1.0, fanGapMax: 1.5,   // 扇形圆弹幕间隔（s）
      fanMin: 8, fanMax: 10,   // 每次扇形弹幕发数（8~10）
      fanSlowMin: 0.6, fanSlowMax: 0.9,   // 扇形弹速 = 乱射长条弹基准速度 × 此区间（慢档）
      fanFastMin: 1.2, fanFastMax: 1.5,   // 或快档
    },
  };

  // 暴风之眼本体图（透明底台风云盘）：异步预加载，加载完成前矢量风暴照常绘制
  let stormEyeImg = null;
  const stormEyeLoader = new Image();
  stormEyeLoader.onload = () => { stormEyeImg = stormEyeLoader; };
  stormEyeLoader.src = 'assets/storm-eye.webp';

  // 电弧闪电素材组（透明底）：风暴编织者专用——
  //   lightning-1 主电弧（白热蓝辉纤细大闪电）：能量球表面电弧 / 球外放电
  //   lightning-2 细流光弧（纤细蓝弧）：周身闪电风暴的小闪电
  //   lightning-bolt 备用电弧（粗壮闪电）：与主电弧交替出现，避免重复感
  // 异步预加载，未加载时能量球 / 风暴回退为程序化弧线
  let lightningImg = null;
  const lightningLoader = new Image();
  lightningLoader.onload = () => { lightningImg = lightningLoader; };
  lightningLoader.src = 'assets/lightning-1.png';
  let lightningImgAlt = null;
  const lightningLoaderAlt = new Image();
  lightningLoaderAlt.onload = () => { lightningImgAlt = lightningLoaderAlt; };
  lightningLoaderAlt.src = 'assets/lightning-bolt.png';
  let lightningImgThin = null;
  const lightningLoaderThin = new Image();
  lightningLoaderThin.onload = () => { lightningImgThin = lightningLoaderThin; };
  lightningLoaderThin.src = 'assets/lightning-2.png';
  let lightningImgBig = null;
  const lightningLoaderBig = new Image();
  lightningLoaderBig.onload = () => { lightningImgBig = lightningLoaderBig; };
  lightningLoaderBig.src = 'assets/lightning-4.png';
  let lightningImgSmall = null;
  const lightningLoaderSmall = new Image();
  lightningLoaderSmall.onload = () => { lightningImgSmall = lightningLoaderSmall; };
  lightningLoaderSmall.src = 'assets/lightning-5.png';

  // BOSS 注册表：测试模式按钮与警报演出由此生成；后续新 BOSS 在此追加
  const BOSSES = {
    song: { id: 'song', name: '旧日之歌', lv: 11 },
    storm: { id: 'storm', name: '暴风之眼', lv: 21 },
    storm2: { id: 'storm2', name: '风暴编织者', lv: 21 },
  };
  // 警报演出时长：横杠滑入 → 红色区域与名号展示 → 整体淡出
  const BOSS_WARN = { slide: 0.9, hold: 1.9, fade: 0.5 };
  const BOSS_WARN_TOTAL = BOSS_WARN.slide + BOSS_WARN.hold + BOSS_WARN.fade;
  const BOSS_SPAWN_EARLY = 3;   // BOSS 出场动画提前 3s 开始（警报文字展示期间黑洞 / 风暴就开始形成）

  // 战机注册表：后续新机在此追加，选机页自动生成卡片
  const PLANES = {
    chaos: {
      id: 'chaos',
      name: '混乱将至',
      desc: '直线弹道，猛烈输出',
      startWeapon: 1,   // 初始火力等级（Lv1 即三射线；开局 / 重生回落到此等级；BOSS 试炼 / 图鉴挑战固定 Lv4）
      bulletColor: '#7ce7ff',
      trailColor: '#3d7d99',   // 双连发尾弹（颜色稍暗）
      berserkColor: '#ffb545',
      berserkTrail: '#8a6230',
    },
    starslayer: {
      id: 'starslayer',
      name: '群星之杀',
      desc: '空间斩击，高额爆发',
      startWeapon: 1,
      bulletColor: '#eaf2ff',   // 淡白锁定光束 / 斩击主色
      trailColor: '#9fb4d8',
      berserkColor: '#c9b6ff',  // 暴走：紫白能量
      berserkTrail: '#6a5a99',
      slashWeapon: true,        // 走斩击模型（不发射普通子弹）
      wingmanHaste: 1.2,        // 非 boss 战时僚机射速 ×1.2（补偿清杂弱）
    },
  };
  let currentPlane = PLANES.starslayer;
  // 选机写入入口：currentPlane / currentWingman 是被全仓库读取的顶层 let，
  // 写操作必须经由本文件的 setter（并行修改约定 + ES modules 下导入绑定只读，均要求如此）
  function setPlane(p) { currentPlane = p; }
  function setWingman(w) { currentWingman = w; }

  // ---------- 难度注册表：具象 / 真我 / 诗篇 ----------
  // 三档难度共用同一套关卡流程与出怪框架，差异通过 mods 修正表落地（怪物数值/行动逻辑/BOSS 技能组等）。
  // 当前「真我」（全部数值与机制的基准，mods 全 1）与「诗篇」（BOSS 血量 ×1.6 / 暴走减免 / BOSS 战 1类强制波；
  // 旧日之歌 / 暴风之眼技能组深度改版见 SONG_SHIP / STORM_SHIP）已实装；
  // 「具象」为占位（wip=true，主界面展示但不可选择），待后续设计填充 mods 后再开放。
  // mods 约定（后续设计按需增删键）：
  //   enemyHpMul     敌机血量倍率
  //   enemyDmgMul    敌方弹幕/碰撞伤害倍率
  //   enemySpeedMul  敌机移速/弹速倍率
  //   scoreMul       击杀得分倍率
  //   bossSkillMods  BOSS 技能组修正（{ bossId: { skillId: {...} } }，交由 05-boss 解释）
  //   wip 难度 mods 保持 null——未实装的难度必须回退基准值，绝不允许 null 直接参与乘算。
  const DIFFICULTIES = {
    juxiang: {
      id: 'juxiang', name: '具象',
      desc: '正常难度<br>适合所有玩家',   // 一句一行（<br> 分行；"设计中"由卡片角标展示）
      wip: true, mods: null,
    },
    zhenwo: {
      id: 'zhenwo', name: '真我',
      desc: '挑战难度<br>适合飞机老资历',
      wip: false,
      mods: { enemyHpMul: 1, enemyDmgMul: 1, enemySpeedMul: 1, scoreMul: 1, bossSkillMods: {} },
    },
    shipian: {
      id: 'shipian', name: '诗篇',
      desc: '直面疯狂',
      wip: false,
      // 诗篇修正表：BOSS 血量 ×1.6；全体 BOSS 受到暴走伤害 -10%（与既有 BOSS 专属暴走减免叠加时取最高）；
      // BOSS 战期间每 6~12s 强制刷新 1类小组/长队（不受场上压力影响），该波敌人道具掉率 ×0.3
      mods: {
        enemyHpMul: 1, enemyDmgMul: 1, enemySpeedMul: 1, scoreMul: 1, bossSkillMods: {},
        bossHpMul: 1.6,
        bossBerserkDR: 0.10,
        bossMinionWave: { min: 6, max: 12, dropMul: 0.30 },
      },
    },
  };
  let currentDifficulty = DIFFICULTIES.zhenwo;   // 默认（也是当前唯一实装的）难度：真我
  // 难度写入入口：与 setPlane/setWingman 同约定——顶层 let 的写操作必须经由 setter
  function setDifficulty(d) { currentDifficulty = d; }
  // 当前难度修正表：未实装难度（mods 为 null）回退真我基准，保证框架先行、行为不变。
  // 后续接入点示例：makeEnemy 血量 × diffMods().enemyHpMul、BOSS 技能参数经 diffMods().bossSkillMods 查表。
  function diffMods() { return currentDifficulty.mods || DIFFICULTIES.zhenwo.mods; }
  // 是否为诗篇难度（旧日之歌技能改版等深度改写经此门控；参数级修正走 diffMods()）
  function isShipian() { return currentDifficulty.id === 'shipian'; }

  // ---------- 群星之杀：空间斩击参数 ----------
  // 机头直射一条较细淡白锁定光束（不造成伤害），选中最靠近玩家的主目标；
  // 每隔 interval 秒召唤一道空间斩击：以主目标为中心的矩形判定区（沿斩击方向），
  // 区域内所有敌人受全额伤害（无主/副目标之分）。
  // 对 BOSS 伤害提升 bossBonus（无视主/副目标之分，命中几个 BOSS 各自加成）；
  // 单体斩击：本次斩击仅命中 1 个非 BOSS 敌人时，伤害提升 soloBonus（攻击间隔不受影响）。
  // 斩击方向：与竖直方向夹角 5~20° 随机，左下→右上 / 右下→左上 逐次交替。
  // 暴走（Lv5）：每次连续斩击 slashes 次（间隔 slashGap），攻击间隔略微降低。
  // DPS 配平（主目标）：Lv1 300 / Lv2 400 / Lv3 600 / Lv4 900 / Lv5 2500。
  const STARSLAYER = {
    beamHalfW: 4.4,          // 锁定光束半宽（稍宽）
    beamColor: '#eaf2ff',    // 淡白色
    selectHalfW: 26,         // 光束选中判定的水平半宽（机头正上方走廊）
    slashFxTime: 0.45,       // 单次斩击特效存留时长（扫 cut + 渐隐）
    slashGapBase: 0.10,      // 暴走三连斩每击间隔
    slashAngleMin: 5,        // 斩击与竖直方向夹角（度）随机下限
    slashAngleMax: 20,       // 夹角上限
    slashLenMul: 2.3,        // 矩形半长 = slashR × 此系数（沿斩击方向）
    slashWMul: 0.70,         // 矩形半宽 = slashR × 此系数（垂直斩击方向，“宽度较宽”）
    bossBonus: 0.20,         // 对 BOSS 伤害 +20%
    soloBonus: 0.25,         // 单体斩击（仅命中 1 个非 BOSS 敌人）伤害 +25%
    levels: {
      1: { interval: 1.36, dmg: 408, slashR: 46 },
      2: { interval: 1.22, dmg: 488, slashR: 50 },
      3: { interval: 1.09, dmg: 654, slashR: 54 },
      4: { interval: 0.95, dmg: 855, slashR: 58 },
      5: { interval: 0.90, dmg: 750, slashR: 64, slashes: 3 },   // 3×750/0.90 ≈ 2500
    },
  };

  // ---------- 僚机系统：注册表与参数 ----------
  // 僚机成对出现（主机左右各一），不可被击中，拥有独立武器；两僚机合计伤害约为主机 30~40%
  const WINGMEN_CFG = {
    none: {
      id: 'none', name: '无僚机', empty: true,
      desc: '不携带僚机，独自出击。',
    },
    stars: {
      id: 'stars', name: '群星允诺',
      desc: '多发散射，火力覆盖',
      barTail: '#ffbf47', barMid: '#ffd9a0', barHead: '#8a6bff',   // 尾橙黄 → 头蓝紫
      flame: '#9b7bff',
      // dmgMulByLevel：群星允诺每级每发伤害倍率。Lv5 暴走额外 ×2（公式内置），此处 lvMul 控制基础伤害。
      //   双僚机合计 DPS = Lv1 140 / Lv2 170 / Lv3 200 / Lv4 230 / Lv5 550。
      dmgMulByLevel: { 1: 2.6542, 2: 2.0683, 3: 1.75, 4: 1.3964, 5: 1.0313 },
      offsetX: 46, offsetY: 16,    // 后侧站位（沿用通用参数值）
      weapon: { kind: 'volley' },  // 对称双 volley 模型（走 WINGMAN_LEVELS + dmgMulByLevel）
    },
    bulwark: {
      id: 'bulwark', name: '守愿者',
      desc: '坚盾护体，侧向打击',
      barTail: '#3b7de8', barMid: '#6dc4f8', barHead: '#b0e8ff',   // 尾中蓝 → 头浅天蓝（天蓝占比更大）
      flame: '#8fd8ff',
      offsetX: 41, offsetY: -20,   // 前侧站位（稍微靠近主机，本体+盾整体往右上移动）
      // 防御辅助型：前方连体白盾消解非导弹直射弹（详见 BULWARK 与挡弹系统）
      // 武器：一侧扇形错序发射（最前方先发）——0°（竖直向上）→90°（水平）均布，另有一发 105°（水平朝下 15°）压轴
      //   双僚机合计 DPS = Lv1 160 / Lv2 200 / Lv3 240 / Lv4 300 / Lv5 444（弹幕扩容后单发伤害按比例重配平，DPS 不变）
      weapon: {
        kind: 'fan',
        spreadMax: 105,          // 相对竖直向上、朝外侧的最大夹角（度）：最外侧一发为 90°+15°=105°（水平朝下 15°）
        staggerGap: 0.05,        // 错序发射每发间隔（秒）
        bulletSpeed: 600,        // 基准弹速；Lv1~4 ×1.17=702（+30% 后再 -10%），Lv5 ×2.5=1500
        speedGrad: 0.6,          // 扇形速度梯度：最前方（0°）子弹 +60%、最低（最外侧 spreadMax°）无加成，中间各发线性递减；暴走 Lv5 不生效
        barLen: 40, barR: 5.4,   // 椭圆长条弹尺寸（加长加大；弹长 +25%，32 → 40）
        pierceOnce: 1,           // 击中 1类敌人（side / prolifera）可穿透一次：该次命中不销毁子弹、继续飞行；卫护飞船（escort）无限穿透
        tornadoHits: 2,          // 对暴风之眼召唤的大型龙卷（tornado）每次命中造成两次伤害判定
        berserk: {               // 暴走（Lv5）弹幕外观：弹长在常规基础上再 ×1.35、金红渐变配色
          lenMul: 1.35,          // 40 → 54
          colorTail: '#e6392a', colorMid: '#ff8b3d', colorHead: '#ffd257',   // 尾红 → 中橙 → 头金
        },
        levels: {
          1: { count: 6, interval: 0.96, dmg: 25.6, speedMul: 1.17, flameMul: 0.35 },     // 0~90° 均布 5 发（相邻夹角 90/4=22.5°）+ 105° 压轴；尾焰随等级增长（flameMul 0~1）
          2: { count: 7, interval: 0.84, dmg: 24.0, speedMul: 1.17, flameMul: 0.5 },      // 0~90° 均布 6 发（相邻夹角 90/5=18°）+ 105° 压轴
          3: { count: 8, interval: 0.72, dmg: 21.6, speedMul: 1.17, flameMul: 0.65 },     // 0~90° 均布 7 发（相邻夹角 90/6=15°）+ 105° 压轴
          4: { count: 10, interval: 0.60, dmg: 18.0, speedMul: 1.17, flameMul: 0.8 },     // 0~90° 均布 9 发（相邻夹角 90/8=11.25°）+ 105° 压轴
          5: { count: 10, interval: 0.60, dmg: 26.667, speedMul: 2.5, flame: true, flameMul: 1 },   // 暴走：与 Lv4 同为 10 发（不再 +1 发）、弹速×2.5、尾焰最强(1.0)、间隔同 Lv4
        },
      },
    },
  };
  let currentWingman = WINGMEN_CFG.bulwark;   // 当前僚机配置（写操作经 setWingman）

  // 僚机通用参数（伤害/射速均可调；总体占主机 30~40%）
  const WINGMAN = {
    offsetX: 46, offsetY: 16, followLerp: 12,   // 相对主机偏移 + 跟随平滑系数
    bulletSpeed: 640, bulletDmg: 6,             // 长条弹幕速度 / 单发伤害
    barLen: 26, barR: 3.4,                      // 长条弹长度 / 半宽
    volleyGap: 0.11,                            // 一轮内两 volley 间隔（连续发射两次）
    flameLenMul: 0.65,                          // Lv1~4 尾焰长度系数（-35%，仅长度、亮度不变）；Lv5 暴走不受影响
  };

  // 守愿者白盾几何：以僚机为圆心的圆弧屏障，覆盖“前方 + 侧前方”（随 side 镜像到外侧）
  //   arcFrom/arcTo 为相对“竖直向上”朝外侧扫过的角度（度）；segments 为折线逼近段数（供扫掠相交/裁切）
  const BULWARK = {
    radius: 30, arcFrom: -10, arcTo: 100, thickness: 6, segments: 12,
    color: '#eaf6ff', glow: '#bfe4ff',
  };

  // 各火力等级僚机弹幕：volleys=[第一轮发数, 第二轮发数]，interval=启动连射的冷却
  // 夹角不再按等级固定，而是由“单轮发数”决定（见 WINGMAN_SPREAD）；level.spread 仅作缺省回退
  // 每级每发伤害倍率见各僚机自身的 dmgMulByLevel
  // flameMul=尾焰强度（0~1）：Lv1~4 随等级增长，Lv5 暴走最强（1.0），低等级永不超越（绘制见 10-draw-world）
  const WINGMAN_LEVELS = {
    1: { volleys: [2, 2], spread: 10, interval: 0.80, flameMul: 0.35 },   // Lv1：2+2 发、射速慢
    2: { volleys: [3, 2], spread: 10, interval: 0.62, flameMul: 0.5 },    // Lv2：3+2 发
    3: { volleys: [3, 3], spread: 10, interval: 0.52, flameMul: 0.65 },   // Lv3：3+3 发
    4: { volleys: [3, 4], spread: 10, interval: 0.40, flameMul: 0.8 },    // Lv4：3+4 发（第二轮 4 发、6°）、恢复正常射速
    5: { volleys: [5, 5], spread: 8, interval: 0.34, flameMul: 1 },       // 暴走：5+5 发、发光，伤害走 ×2；尾焰最强(1.0)
  };

  // 僚机单轮弹幕夹角(度)按“该轮发数”取值：2发20° / 3发10° / 4发6° / 5发8°（发数越多相邻夹角越小、弹幕更聚拢）
  // 2发相邻 20°：与 3 发（相邻 10° × 2 间隔 = 总夹角 20°）的最远两颗夹角相当；Lv1 两轮与 Lv2 第二轮（同为 2 发）自动同步受影响
  const WINGMAN_SPREAD = { 2: 20, 3: 10, 4: 6, 5: 8 };

  /**
   * 四类非 Boss 敌人：
   *   1类 side     从场地中部略偏上的两侧斜插窜出，血极低；多数无攻击，少数追踪射击 / 阵亡时向下垂直射击
   *        prolifera  增生侧翼艇（1类特殊）：淡青绿、无攻击；阵亡分裂 2~3 个卫护飞船（escort），加血道具掉率 ×3
   *        escort     卫护飞船（增生侧翼艇衍生）：深蓝紫渐变小三角（边缘紫光）、无攻击、沿原航向漂移；碰撞伤/无敌时间 ×0.4；仅掉水晶
   *   2类 striker  上方入场，血低；垂直向下直射，少部分追踪射击
   *   3类 gunship  上方入场，体型稍大血中；悬停上方，扇形 / 环形 / 双连炮多种弹幕
   *   4类 capital  上方居中入场，体型大血高；悬停上方，螺旋环 / 扇形齐射 / 环形爆发密集弹幕，
   *                 出场与在场期间由 1、2 类敌机护航
   */
  const ENEMY_TYPES = {
    side: {
      w: 34, h: 30, hp: 1,   score: 50,   color: '#8ce36b', drawScale: 1.4,   // 分数：白影/增生/黄芒/赤月 50；紫电 80（makeEnemy 按行为覆盖）
      bulletSpeed: 230, bulletR: 4, bulletDmg: 6, crashDmg: 12,
      fireInterval: [1.4, 2.2],
    },
    // 增生侧翼艇（1类特殊）：淡青绿 1类艇，无攻击；生命/碰撞伤害与白影侧翼艇一致；
    // 阵亡时分裂 2~3 个卫护飞船，加血道具掉率为常规的 3 倍
    prolifera: {
      w: 34, h: 30, hp: 1,   score: 50,   color: '#7fe8c9', drawScale: 1.4,
      crashDmg: 12,
      fireInterval: [1.4, 2.2],   // 无攻击，字段仅为 makeEnemy 取值完整性
    },
    // 卫护飞船（增生侧翼艇衍生）：小三角形（纯等腰三角、无核心），深蓝紫渐变（边缘紫光），无攻击，沿原航向继续飞行；
    // 撞击无敌时间为增生侧翼艇的 40%（0.48s）；出厂随机虚化护盾；仅掉水晶
    escort: {
      w: 12, h: 14, hp: 1,   score: 20,   color: '#6a5ce0', drawScale: 1.25,   // 深蓝紫（与浅蓝水晶区分）
      crashDmg: 6,                // 增生侧翼艇（12）的 50%
      invulnMul: 0.4,             // 撞击造成的无敌时间同样为 40%（0.48s）
      fireInterval: [1.4, 2.2],   // 无攻击，字段仅为 makeEnemy 取值完整性
    },
    striker: {
      w: 46, h: 40, hp: 48,  score: 150,  color: '#ff3b30', drawScale: 1.4,
      bulletSpeed: 280, bulletR: 5, bulletDmg: 8, crashDmg: 25,
      fireInterval: [1.1, 2.0],
    },
    gunship: {
      w: 76, h: 62, hp: 350,  score: 400,  color: '#c084fc', drawScale: 1.55,   // 紫晶基准血量 350；赤红 350 / 金曜 400 见 VARIANTS（变体另带独立下降速度与首射延迟）
      bulletSpeed: 250, bulletR: 4, bulletDmg: 8, crashDmg: 30,
      firstFire: [1.2, 2.4],   // 出场后首次射击延迟随机区间（就位后计，与出场途径无关）；金曜走此默认，紫晶/赤红见 VARIANTS
      fireInterval: [1.8, 2.4],
    },
    capital: {
      w: 192, h: 134, hp: 4000, score: 1500, color: '#ff4d6d', drawScale: 2.0,   // 三变体同血量；下降速度按变体区分（250/220/280，见 updateEnemyMovement）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 10, crashDmg: 40,
      fireInterval: [2.4, 2.8],
    },
    // 特殊3类：炮火先兆者（后排炮兵）—— 灰黑形体 + 红色充能核心，充满后召唤垂直落下的导弹
    harbinger: {
      w: 82, h: 82, hp: 900, score: 600, color: '#3a3f4a', drawScale: 1.68,   // 体型增大 20%（含碰撞盒同步）
      bulletSpeed: 210, bulletR: 6, bulletDmg: 16, crashDmg: 16,
      fireInterval: [4, 4],
    },
    // 特殊3类：威龙（高血量无人机）—— 俯视四旋翼无人机、橙黄渐变；蛇形巡航、朝玩家三连快弹（弹速 380）、攻击时停移
    weilong: {
      w: 76, h: 70, hp: 4500, score: 1200, color: '#ff9a1a', drawScale: 1.5,
      bulletSpeed: 230, bulletR: 5, bulletDmg: 12, crashDmg: 32,
      fireInterval: [1.91, 2.43],   // 攻击间隔在原 [1.47,1.87] 基础上 +30%（更稀疏）
    },
    // 特殊3类：寒霜（冰霜无人机）—— 俯视四旋翼无人机、灰黑渐变 + 天蓝霜纹边缘；
    // 不攻击：50% 顶部入场（初速+100%）/ 50% 侧翼斜向下入场，到 72%~82% 高度停留 20s；登场 1s 后展开寒霜光圈（减速见 HANSHUANG）
    hanshuang: {
      w: 61, h: 56, hp: 600, score: 500, color: '#8fd8ff', drawScale: 1.2,   // 机体缩小 20%（含碰撞盒同步）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 20,
      fireInterval: [1e9, 1e9],   // 不攻击：间隔天文数字，永不落入通用开火逻辑
    },
    // 特殊3类：御4（防御无人机）—— 俯视四旋翼无人机、介于圆与方之间的超椭圆暖灰渐变机体 + 金色 X 形条纹 + 四角风扇圆；
    // 不攻击：登场 0.5s 后展开金色六边力场（光环内敌人受到的非真实伤害 -30%），停留 22s；Lv10 前不出场
    yu4: {
      w: 53, h: 53, hp: 700, score: 500, color: '#d6c078', drawScale: 1.02,   // 机体缩小 15%（含碰撞盒同步：62→53、drawScale 1.2→1.02）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 20,
      fireInterval: [1e9, 1e9],   // 不攻击：间隔天文数字，永不落入通用开火逻辑
    },
    // 特殊3类：铁砧（治疗无人机）—— 菱形黑灰框架 + 中央灰黑正方形 + 上下左右横杠 + 中心朝下凸出白杠 + 正方形青绿治疗光环；
    // 不攻击：登场 0.5s 后展开治疗光环（圈内所有敌人含自身每秒回复 1% 最大生命 + 60），悬停于炮火先兆者前方，停留 22s；Lv10 前不出场
    anvil: {
      w: 70, h: 58, hp: 500, score: 500, color: '#8ce36b', drawScale: 1.44,   // 体型增大 20%（58×48 → 70×58；drawScale 同步 ×1.2 使视觉与碰撞盒一致）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 20,
      fireInterval: [1e9, 1e9],   // 不攻击：间隔天文数字，永不落入通用开火逻辑
    },
    // 特殊3类：暴鸰（自爆无人机）—— 白灰磨角方形机体（较威龙小 20%）+ 灰黑渐变横杠连四角风扇（淡黄桨心）
    // + 前挂黑色圆炸弹（红道 + 白骷髅）；不悬停直线下压，接近玩家停车投弹，投弹后提速俯冲离场
    baoling: {
      w: 56, h: 60, hp: 500, score: 500, color: '#e3e6ec', drawScale: 1.2,
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 20,
      fireInterval: [1e9, 1e9],   // 不攻击：投弹流程由移动状态机驱动
    },
    // 特殊3类：焦香螺旋桨（火焰灼烧无人机）—— 橙火红渐变环 + 黑色核心 + 白色圆 + 三根异速旋转白色横杠；
    // 无碰撞伤害、不攻击：登场后移动到场地 40% 以下位置绕大圈巡航；火焰光环持续灼烧我方战机（近本体翻倍）
    jiaoxiang: {
      w: 67, h: 54, hp: 1000, score: 600, color: '#ff7a18', drawScale: 1.36,   // 本体缩小 20%（w/h/drawScale 同步；原比 3 类炮艇大 10%）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 0,   // 无碰撞伤害
      fireInterval: [1e9, 1e9],   // 不攻击：间隔天文数字，永不落入通用开火逻辑
    },
    // 特殊2类：斗志昂扬（增益无人机）—— 造型类暴鸰（白灰磨角方形机体 + 四角风扇），中心为上扬双箭头标志；
    // 下方挂载较大蓝色盒子（盒上方淡黄色空心正方形图案），四轮中心红色间歇闪光；
    // 无碰撞、不攻击：升级时 4% 概率从左/右侧横穿（余弦上下浮动）；击毁后我方攻速/弹速翻倍 8s
    douzhi: {
      w: 56, h: 60, hp: 250, score: 100, color: '#c9d8ea', drawScale: 1.2,
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 0,   // 无碰撞伤害（与玩家互相穿过，见 updateEnemies）
      fireInterval: [1e9, 1e9],   // 不攻击
    },
    // 特殊2类：法术大师A1（紫光激光无人机）—— 四角风扇圆 + 灰黑矩形机身(1:3:1 紫光条) + 底部深紫炮管；
    // 不停留：入场 1.2~3s 后开始攻击（停移射击），50% 概率横移再恢复下降；lv10 前低权重、lv10 后较多出现
    fashiA1: {
      w: 46, h: 40, hp: 70, score: 180, color: '#a855f7', drawScale: 1.4,
      bulletSpeed: 380, bulletR: 5, bulletDmg: 16, crashDmg: 20,   // 碰撞伤害 = 普通2类(25) × 80%
      fireInterval: [1e9, 1e9],   // 攻击逻辑在移动状态机内处理，不走通用开火
    },
    // 特殊2类：破片（三连发导弹无人机）—— 造型类铁砧但更小、灰白金属主导（边框+核心）；中心两条黑杠（头部红、下方缩短）；
    // 下方两根黑色炮管（前部加粗、图层最底）；只沿直线飞到选定点后急停锁停（除非被击毁不再移动），停稳后才攻击；
    // 索敌范围 30% 屏高起步、每秒 +5%；攻击时玩家位置红圈预警 0.8s → 快速三连发不可击毁导弹（8/5/5，条件性无视无敌）；lv10 前低权重
    popian: {
      w: 55, h: 48, hp: 200, score: 180, color: '#cfd6e0', drawScale: 1.2,   // 体型同常规 2 类突击艇 ×1.2
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 20,   // 碰撞伤害按登场时间分段覆盖（见 updateEnemies）：0.5s 内 0 / 0.5~2s 2类×40% / 2s 后 2类×80%
      fireInterval: [1e9, 1e9],   // 攻击逻辑在移动/开火状态机内处理，不走通用开火
    },
    // 特殊3类：法术大师A2（紫白激光无人机）—— 法术大师A1 的强化版：体型较威龙 +30%、血量 900；
    // 移动/攻击逻辑与 A1 一致（不停留下降、停移射击、50% 横移），但速度较慢
    // ——横移常在下一次攻击触发前未走完，此时照常停移射击，射击完毕后放弃剩余横移、径直下降；
    // 激光伤害 32（A1 ×2）、更亮更粗；四角风扇圆心为紫色（A1 为黑色）
    fashiA2: {
      w: 99, h: 91, hp: 900, score: 600, color: '#c084fc', drawScale: 3.0,   // 体型 = 威龙(76×70) × 1.3；局部造型沿用 A1 小坐标 → drawScale 3.0 使视觉尺寸与碰撞盒匹配（A1 为 1.4/盒46）
      bulletSpeed: 470, bulletR: 6, bulletDmg: 32, crashDmg: 30,   // 激光弹速与 FASHI_A2.laserSpeed 一致
      fireInterval: [1e9, 1e9],   // 攻击逻辑在移动状态机内处理，不走通用开火
    },
    // 特殊2类：法术矩阵（白红菱形法师无人机）—— 竖菱形机体（高为宽 1.8 倍）+ 白红渐变核心 + 一圈很细的黑色菱形环 + 环外仍白红；
    // 慢速下降到悬停带（约常规 2 类入位速一半），停稳后朝玩家左右 ±15° 发射「发白光的正方体」（每条边发红光，走独立 spellCubes 弹道）；
    // 正方体限程（自身→玩家距离 70%~140% + 15% 屏高）：到射程后减速滑行，末段提前渐隐、速度归零时恰好消失；
    // 撞上守愿者白盾被阻挡：撞击特效 + 尾焰快速衰减后消散（不瞬间消失）；
    // 受主战机（非僚机）伤害 -30%；场上存在 3 类「法术阵列」(fashiArray) 时偏移角增至 ±25°、正方体速度 +25%（见 FASHI_MATRIX）
    fashiMatrix: {
      w: 27, h: 48, hp: 80, score: 180, color: '#ff5566', drawScale: 1.02,   // 竖菱形碰撞盒 h≈1.8w；整体缩小 30%（原 38×68 / drawScale 1.45）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 18,   // 碰撞伤害 18；正方体走独立 spellCubes 弹道，不用通用子弹字段
      fireInterval: [1e9, 1e9],   // 攻击逻辑在专属状态机内处理，不走通用开火
    },
    // 特殊4类：法术阵列（血红三菱法师母机）—— 三座法术矩阵样式的菱形 + 灰黑底座；
    // 体型/碰撞伤害等同炮火先兆者，整体移速为其 65%：匀速下降（无减速动作）到屏幕上方 20%~30% 后
    // 像法术矩阵一样胡乱移动（不脱离屏幕）并散发血红雾气，30s 后向上飞离战场；
    // 朝玩家发射法术矩阵同款但大一号的红色正方体（伤害 26、红光更强），
    // 飞行 30%~60% 射程时（提前 0.5s 红圈收缩预警）分裂为 3 枚常规正方体（1 同向 + 2 垂直，微弱冲击波）；
    // 就位 4s 后首次召唤、其后每 5s：闪动红光并在周围召唤一个法术矩阵（召唤体死亡不加分不掉水晶、
    // 1s 后开始攻击并随机移动），飞离期间不召唤；Lv10 前不出场（Lv10 起占 4 类槽位，见 spawnCapitalSlot）
    fashiArray: {
      w: 82, h: 82, hp: 3000, score: 1500, color: '#c22b3d', drawScale: 1.68,   // 体型同炮火先兆者；4 类级血量
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 26,
      fireInterval: [1e9, 1e9],   // 攻击逻辑在专属状态机内处理，不走通用开火
    },
    // 特殊敌机：暴风之眼技能2 召唤的大型龙卷（可击毁、缓慢下移直至脱离战场、随机 360° 射风弹）
    tornado: {
      w: 144, h: 144, hp: 3200, score: 0, color: '#eaf6ff', drawScale: 1,
      bulletSpeed: 170, bulletR: 5, bulletDmg: 16, crashDmg: 32,
      fireInterval: [0.2, 0.3],
    },
  };

  // 炮火先兆者参数
  const HARBINGER = {
    descend: 180,        // 进场/离场下降速度（提升 50%）
    wingDR: 0.25,        // 对僚机弹幕减伤 25%（装甲针对僚机火力）
    // 首波充能：1.5s 变红（充满即召唤首发）+ 3s 灰黑覆盖（无静止保持段）
    chargeFirst: 1.5,    // 首波：红色从中心扩展至通体红的时长
    coverFirst: 3,       // 首波：灰黑从中心覆盖红色的时长（chargeFirst+coverFirst = 4.5s）
    // 后续每波充能：2s 变红（充满即召唤）+ 1s 复位（灰黑覆盖红）+ 1.5s 保持全灰黑
    charge: 2,           // 后续波：红色扩展时长
    reset: 1,            // 后续波：灰黑复位（覆盖红）时长
    grayHold: 1.5,       // 后续波：保持全灰黑静止时长（charge+reset+grayHold = 4.5s）
    cycle: 4.5,          // 每波固定时长（首波与后续波均为 4.5s）
    maxMissiles: 5,      // 入场即充能：首发在 1.5s，后续每波红相 2s 召唤，共 1+4=5 发（末发约 20s 后离场）
    hold: 30,            // 就位停留兑底上限（实际由充能序列驱动离场：第 5 发召唤后置 holdTimer=0）
    warnTime: 3,         // 导弹垂直预警线时长
    missileSpeed: 1400,  // 导弹从上方下落速度（高速）
    missileR: 12,        // 导弹半径（宽于常规子弹）
    lowHpKill: 60,       // 玩家血量低于此值被导弹命中则直接击杀
  };

  // 威龙参数（特殊3类无人机）
  const WEILONG = {
    speed: 60,           // 巡航速度
    hoverY: 96,          // 首段下降到约炮火先兆者停留高度
    segDown: 100,        // 蛇形路径每段向下前进距离
    margin: 46,          // “走到靠边”时与墙壁的间距
    dwell: 2,            // 末段（1/3 处）停顿时长
    burstCount: 5,       // 每次朝玩家射 5 枚
    burstGap: 0.09,      // 连发间隔
    bulletSpeedMul: 1.652, // 弹速（230 × 1.652 ≈ 380）
    lowHpRatio: 0.7,     // 血量低于此比例后压力权重记 0（不再拖慢敌方刷新，见 PRESSURE_W）
  };

  // 寒霜参数（特殊3类冰霜无人机）
  const HANSHUANG = {
    speed: 180,          // 下降/离场速度（等同炮火先兆者进场速度 HARBINGER.descend）
    entryBoost: 2,       // 顶部入场初速倍率（+100%），在 entryDecay 内线性衰减回 1×；侧翼入场无加成
    entryDecay: 1,       // 顶部入场初速衰减时长（s）
    flankChance: 0.5,    // 侧翼入场概率（其余从顶部直线下移入场）
    flankSpeedMul: 0.80, // 侧翼入场移速倍率（-20%，仅入场阶段；停留/离场速度不受影响）
    flankTopPct: 0.25,   // 侧翼入场高度下限（占屏高比，从上往下 25%）
    flankBotPct: 0.50,   // 侧翼入场高度上限（从上往下 50%）
    flankHalfMin: 0.10,  // 侧翼落点 X 范围下限（同半场约束：左翼 10%~42% / 右翼镜像 58%~90%，绝不飞越中线）
    flankHalfMax: 0.42,  // 侧翼落点 X 范围上限
    auraDelay: 1.0,      // 登场后光圈显现延迟
    auraFadeIn: 0.8,     // 光圈渐显时长（延迟后从透明淡入到完全体）
    auraR: 160,          // 寒霜光圈半径（较大范围，以玩家核心位置判定）
    dwell: 20,           // 到位后停留时长
    fireSlow: 0.65,      // 顶部入场光圈内玩家射速倍率（-35%：冷却流速乘 0.65）
    moveSlow: 0.65,      // 顶部入场光圈内玩家移动速度倍率（-35%）
    fireSlowFlank: 0.75, // 侧翼入场光圈内玩家射速倍率（-25%）
    moveSlowFlank: 0.75, // 侧翼入场光圈内玩家移动速度倍率（-25%）
    entryDR: 0.20,       // 入场未减速阶段（距落点 ≥90px、未开始减速）受伤 -20%
    entryHitScale: 0.85, // 入场未减速阶段碰撞判定箱缩小倍率（略微缩小）
  };

  // 御4参数（特殊3类防御无人机）
  const YU4 = {
    speed: 240,          // 下降/离场速度
    auraDelay: 0.5,      // 登场后防御光环显现延迟
    auraFadeIn: 0.6,     // 光环渐显时长（延迟后从透明淡入到完全体）
    auraR: 160,          // 防御光环半径（覆盖悬停带内相邻敌人）
    dmgReduce: 0.30,     // 光环内敌人受到的非真实伤害降低 30%
    dwell: 22,           // 到位后停留时长（22s）
  };

  // 铁砧参数（特殊3类治疗无人机）：登场后展开正方形淡青绿治疗光环，圈内所有敌人（含自身）每秒回复
  const ANVIL = {
    speed: 240,          // 下降/离场速度（同御4）
    auraDelay: 0.5,      // 登场后治疗光环显现延迟
    auraFadeIn: 0.6,     // 光环渐显时长（延迟后从透明淡入到完全体）
    auraR: 150,          // 治疗光环半径（正方形半边长，覆盖悬停带内相邻敌人）
    healInterval: 1,     // 治疗触发间隔（每秒一次）
    healRatio: 0.01,     // 每次回复目标最大生命的 1%
    healFlat: 60,        // 每次额外回复固定 60 生命
    dwell: 22,           // 到位后停留时长（22s，同御4）
  };

  // 暴鸰参数（特殊3类自爆无人机）
  const BAOLING = {
    speedSlow: 120,      // 投弹前下降速度
    speedPost: 240,      // 投弹后俯冲速度
    armDelay: 0.8,       // 登场后武装延时（此后才具备投弹判定）
    triggerDist: CANVAS_H / 3,   // 索敌半径：1/3 屏幕长度（进入后停车锁定投弹）
    warnTime: 0.35,      // 预警区出现 → 炸弹脱离的间隔
    dropTime: 0.8,       // 炸弹脱离后的低速下坠时长（原 1.0 的 -20%），随后加速飞向预警区中心
    postThrowWait: 1.2,  // 投弹后原地停留时长（原 1.5 减少 0.3s），随后才继续俯冲
    dropSpeed: 70,       // 脱离/下坠初速（低速：不直接给高初速）
    strikeAccel: 4200,   // 飞向预警区中心的加速度（极强加速）
    blastR: 63,          // 爆炸半径（原 90 缩小 30%，红色预警圈）
    playerDmg: 40,       // 爆炸对玩家伤害
    enemyDmgBase: 600,   // 意外爆炸对敌人基础伤害
    enemyDmgRatio: 0.2,  // + 目标最大生命 20%
    enemyDmgCap: 2600,   // 对敌人伤害上限
    vuln: 0.35,          // 玩家处于爆圈内时对暴鸰的增伤（无论是否已投弹）
    crashDmg: 12,        // 碰撞伤害 = 炮艇 30 × 40%
    replaceChance: 0.015, // 普通炮艇被替换为暴鸰的概率（Lv10 前唯一出场途径）
  };

  // 焦香螺旋桨参数（特殊3类火焰灼烧无人机）：登场后绕大圈巡航，火焰光环持续灼烧我方战机
  const JIAOXIANG = {
    speed: 120,            // 巡航速度
    entryBoost: 1.5,       // 就位前（非侧翼入场）移速加成倍率（150%）；侧翼入场无此加成
    entryBoostDecayDist: 140,   // 距目标点小于此值时，加成按剩余距离线性衰减，到位（entryReach）降回 100%
    turnRate: 3.0,         // 转向速率（速度向量朝期望方向插值速率；越大转弯越急，保证速度曲线连贯无突变）
    entryReach: 26,        // 入场到达判定距离（距目标点小于此值即切入绕圈；速度向量保留，无位置重置）
    leadAngle: 1.0,        // 绕圈引导点领先角度（rad）：追踪圆周上领先此角度的点，形成大致圆形轨迹
    orbitSpeedMul: 0.667,  // 绕圈阶段速度倍率（巡航 120 的 66.7% ≈ 80）
    jitter: 90,            // 绕圈随机漂移幅度（相干随机游走的目标速度）：90 → 半径晃动 std≈±5px/极差≈22px，明显可见
    jitterRate: 2.5,       // 漂移游走速率（越大漂移方向变化越快；相干噪声不被转向平滑抵消，故"乱动"可见）
    auraDelay: 0.8,        // 顶部登场后火焰光环显现延迟
    auraDelayFlank: 1.2,   // 侧翼登场后火焰光环显现延迟（多 0.4s）
    auraFadeIn: 0.6,       // 光环渐显时长
    auraR: 110,            // 火焰光环半径（世界坐标）
    nearR: 55,             // 近本体判定半径（圈内灼烧翻倍）
    burnDps: 22.5,         // 光环内每秒灼烧伤害（近本体 ×2 = 45）
    entryDR: 0.30,         // 入场保护：登场后 entryDRT 秒内受到伤害 -30%
    entryDRT: 2,           // 入场保护持续时长（s，自登场计时 auraT 起算；主武器与僚机弹幕均生效）
    flankChance: 0.35,     // 侧翼出场概率
    orbitRMin: 150,        // 绕圈半径随机下限（逐次出场随机；受屏宽约束，半径越大圆心 X 越贴近中线）
    orbitRMax: 200,        // 绕圈半径随机上限
    orbitBottomMin: 0.84,  // 圈底位置随机下限（占屏高比——决定火焰光环可灼烧的最低区域）
    orbitBottomMax: 0.94,  // 圈底位置随机上限（圈底最低时光环可烧到屏幕最下方）
    orbitMargin: 46,       // 圆心/半径的边框安全余量（机体半宽 + 漂移量）；配合绕圈阶段出界硬 clamp 保证轨迹不出边框
    spinA: 0.5,            // 横杠 A（直径杠）旋转角速度 rad/s（方向独立随机）
    spinB: 0.9,            // 横杠 B 旋转角速度 rad/s（B/C 方向一致随机）
    spinC: 0.6,            // 横杠 C 旋转角速度 rad/s（与 B 同向）
    armB: 15,              // 横杠 B 长度（局部坐标，从白圆边缘算起）
    armC: 10.5,            // 横杠 C 长度（较短）
  };

  // 斗志昂扬参数（特殊2类增益无人机）：升级时 4% 概率从左/右侧横穿（余弦上下浮动）；
  // 击毁后进入死亡演出：蓝盒脱离迅速渐隐 → 淡黄光环扩大 → 我方攻速/弹速翻倍 8s → 本体快速渐隐
  const DOUZHI = {
    speed: 120,          // 横穿速度
    ampY: 32,            // 上下余弦振幅（小幅浮动）
    freqY: 1.6,          // 上下余弦角频率（rad/s）
    spawnChance: 0.04,   // 每次关卡提升时的出现概率
    buffDuration: 8,     // 击毁后我方攻速/弹速翻倍持续时长（s）；不可叠加，重复获得直接重置为满时长
    buffMul: 2,          // 翻倍倍率
    boxFade: 0.25,       // 蓝盒脱离并迅速渐隐时长（掉落速度 ×2；渐隐结束后触发光环/增益/本体渐隐）
    haloDur: 0.4,        // 淡黄色扩大光环特效时长（扩大速度 ×2）
    bodyFade: 0.35,      // 本体快速渐隐时长（蓝盒渐隐结束后开始）
    boxDetach: 34,       // 蓝盒脱离时向下漂离距离
  };

  // 法术大师A1 参数（特殊2类紫光激光无人机）：不停留、出场 1s 后停移射击、50% 横移再恢复下降
  const FASHI_A1 = {
    entrySpeed: 200,     // 入场初速
    entryDecay: 0.5,     // 入场后从 entrySpeed 快速衰减到 speed 的时长
    speed: 150,          // 最大下降速度
    accel: 14,           // 加速度系数（很大：停移/横移/恢复都极快但平滑）
    firstDelay: [1.2, 3],       // 登场后随机 1.2~3s 触发首次刹停攻击（每架独立随机，同 A2）
    fireInterval: [1.0, 1.5],   // 攻击间隔：随机 1~1.5s
    firePause: 0.25,     // 停稳后到发射的短暂停顿（视觉反馈）
    fireLingerAfter: 0.35, // 发射后继续静止时长（不移动，原 0.15 + 0.2）
    laserSpeed: 420,     // 激光射弹速度
    laserDmg: 16,        // 激光伤害
    laserLenPct: 0.4,    // （已废弃：激光无上限生长，直到尾端出界才消失）
    laserGrowRate: 130,  // 激光生长速率 px/s：无上限持续生长，直到尾端出界才消失
    laserR: 5,           // 激光宽度（半径）
    strafeChance: 0.5,   // 攻击后 50% 概率朝斜下方（45°）移动
    strafeMin: 80,       // 斜移水平分量最小距离
    strafeMax: 160,      // 斜移水平分量最大距离
    strafeSpeed: 192,    // 横移速度（原 320 × 0.6 = 降 40%）
    spawnLowLv: 0,       // lv10 前替换概率（0 = 不替换，仅图鉴挑战可生成）
    spawnHighLv: 0.60,   // lv10 后替换概率（较多出现）
    maxTurn: 10,         // 最大转向角速度（rad/s，很大）：炮管始终对准玩家，几乎实时转向但仍有可见转动过程
    exitTurn: 2.5,       // 下压超过屏高 80% 后炮管缓慢转向正下方的角速度（rad/s；约 1.2s 转完 180°）
  };

  // 法术大师A2 参数（特殊3类紫白激光无人机）：法术大师A1 强化版——移动/攻击逻辑一致，
  // 但下降速度较慢（78 ≈ 威龙 48 的 1.63 倍，仍慢于 A1 的 147）→ 斜下 45° 移动（80~160px 水平分量）常在下一次攻击触发前未走完：
  // 此时照常停移射击，射击完毕后放弃剩余斜移、径直下降直到下次攻击
  const FASHI_A2 = {
    entrySpeed: 100,     // 入场初速
    entryDecay: 0.5,     // 入场后从 entrySpeed 快速衰减到 speed 的时长
    speed: 80,           // 最大下降速度
    accel: 14,           // 加速度系数（同 A1：停移/横移/恢复都极快但平滑）
    firstDelay: [1.8, 2.3],       // 登场后随机 1.8~2.3s 触发首次刹停（每架独立随机）
    fireInterval: [1.22, 1.83],   // 攻击间隔：随机 1.22~1.83s（上一版 1.35~2.03 × 0.9）
    firePause: 0.25,     // 停稳后到发射的短暂停顿（视觉反馈）
    fireLingerAfter: 0.35, // 发射后继续静止时长
    laserSpeed: 470,     // 激光射弹速度
    laserDmg: 32,        // 激光伤害（A1 16 的 2 倍）
    laserGrowRate: 170,  // 激光生长速率（无上限持续生长，直到尾端出界才消失）
    laserR: 6,           // 激光宽度（A1 5 → 略粗）
    strafeChance: 0.5,   // 攻击后 50% 概率朝斜下方（45°）移动
    strafeMin: 80,       // 斜移水平分量最小距离
    strafeMax: 160,      // 斜移水平分量最大距离
    strafeSpeed: 101,    // 斜下 45° 移动速度（81 × 1.25；慢于 A1 → 斜移常被攻击打断）
    maxTurn: 10,         // 最大转向角速度（同 A1）
    exitTurn: 2.5,       // 下压超过屏高 80% 后炮管回正转向下方的角速度（同 A1）
  };

  // 破片参数（特殊2类三连发导弹无人机）：直线飞到选定点急停锁停 → 索敌范围随时间增长 → 红圈预警 → 三连发不可击毁导弹
  const POPIAN = {
    speed: 180,            // 直线飞行速度
    crashImmune: 0.5,      // 入场 0.5s 内无碰撞伤害
    crashLowEnd: 2,        // 0.5~2s 碰撞伤害为 2类(25) 的 40%；2s 后为 80%
    crashLowMul: 0.4,
    crashHighMul: 0.8,
    flankChance: 0.20,     // 20% 概率从侧翼入场
    stopTopY: 0.30,        // 停留区上界（从上往下 30% 屏高）
    stopBotY: 0.80,        // 停留区下界（80% 屏高）；停留点落在此区间、近处概率高
    stopMarginX: 0.15,     // 停留点与左右边缘的最小距离（占屏宽比）：不停留在两侧 15% 边缘区域内
    moveMin: 120,          // 最小移动距离（防止出场就停）
    moveMax: 420,          // 最大移动距离（防止飞跃整屏）
    nearBias: 1.8,         // 选点距离偏向近处的指数（random^nearBias：越大越偏向近距离）
    detectBase: 0.30,      // 初始索敌半径 = 30% 屏高
    detectGrow: 0.05,      // 每秒 +5% 屏高（攻击范围增大）
    detectMax: 1.2,        // 索敌半径上限（120% 屏高，防无限增长）
    warnTime: 0.8,         // 发射前红圈预警时长（0.5 +0.3s）
    warnOffset: 26,        // 红圈中心相对玩家位置的少量随机偏移上限
    blastR: 44.2,          // 红圈预警半径 / 导弹抵达小范围爆炸半径（原34扩大30%）
    burstCount: 3,         // 三连发
    burstGap: 0.09,        // 三发间隔（快速连发）
    missileSpeed: 880,     // 导弹速度（较快）
    missileR: 5,           // 导弹半径
    firstDmg: 8,           // 首发导弹伤害
    followDmg: 5,          // 后两发导弹伤害
    invulnCutMul: 0.7,     // 首发未命中/玩家无敌时，后两发命中带来的无敌时间 -30%
    firstDelay: 0.4,       // 停稳后首次攻击延迟
    fireInterval: [1.6, 2.4],   // 停稳后攻击间隔
    maxTurn: 3.2,          // 最大转向角速度（rad/s）：飞行倾斜与就位追踪玩家共用，转向有可见过程
    fireAlign: 0.35,       // 发射所需朝向对齐阈值（弧度，约 20°）：未朝向玩家时无法发起攻击
    spawnLowLv: 0.02,      // lv10 前替换概率（很低）
    spawnHighLv: 0.20,     // lv10 后替换概率
  };

  // 法术矩阵参数（特殊2类白红菱形法师无人机）：慢速下降到悬停带停稳 → 朝玩家左右 ±15° 发射发光正方体（独立 spellCubes 弹道）
  // 正方体限程后减速滑行（尾焰随速度收短），末段提前渐隐、速度归零时恰好消失；受主战机伤害 -30%；法术阵列在场时偏移角/速度增强
  const FASHI_MATRIX = {
    speed: 160,          // 常规移动速度
    entrySpeed: 320,     // 入场初速 = speed × 2，随后在 entryDecay 内快速衰减到 speed
    entryDecay: 0.5,     // 入场初速衰减时长（s）
    accel: 12,           // 速度积分收敛率（下降/离场）
    dwell: 20,           // 到达目标区后「胡乱移动」持续时长，20s 后离场（挑战模式传 1e9 永驻）
    hoverTopPct: 0.20,   // 目标停留区上界 = 屏高 × 0.20（从上往下 20%）
    hoverBotPct: 0.40,   // 目标停留区下界 = 屏高 × 0.40（从上往下 40%）
    jitter: 200,         // OU 相干随机游走幅度（胡乱移动的期望速度量级；由 110 提高使随机移动更明显）
    jitterRate: 2.6,     // OU 漂移目标变化频率（控晃动节奏；由 2.0 提高）
    turnRate: 3.6,       // 速度平滑转向率（低通滤波 → 轨迹连贯不卡顿；由 3.0 提高使游走更活泛）
    edgePull: 260,       // 软边界回拉强度（接近活动区边缘时叠加朝内速度，避免贴边卡顿）
    exitMul: 1.5,        // 离场向下加速倍率
    firstDelay: 0.9,     // 就位后首次攻击延迟
    fireInterval: [2.18, 3.36],   // 攻击间隔（由 [1.56, 2.4] 增大 40%）
    cubeDmg: 20,         // 正方体伤害（由 16 统一上调至 20）
    cubeSpeed: 360,      // 正方体巡航速度（最大速度）
    cubeAccel: 6,        // 平滑加速率（spd 向 cruise 收敛，形成平滑速度曲线）
    cubeR: 14.5,         // 正方体碰撞半径（最大尺寸；由 17 缩小 15%）
    cubeHalf: 12.8,      // 正方体绘制半边长（最大尺寸；由 15 缩小 15%）
    cubeGrowFrom: 0.5,   // 发射瞬间尺寸 = 最大 × 0.5
    cubeGrowTime: 0.5,   // 从 50% 成长到最大尺寸的时长（s）
    cubeTrailLen: 136,   // 光效拖尾长度（原 68 变长一倍；沿运动反方向的渐变光带）
    bodySpinMin: 0.3,    // 机体本体自旋角速度下限（rad/s，方向随机）
    bodySpinMax: 0.7,    // 机体本体自旋角速度上限（rad/s）
    offsetDeg: 15,       // 常规发射左右偏移角上限（度）
    offsetDegArray: 25,  // 法术阵列在场时偏移角上限（度）
    cubeSpeedMulArray: 1.1,    // 法术阵列在场时正方体速度倍率（+10%）
    rangeMin: 0.7,       // 射程下限 = 到玩家距离 × 0.7
    rangeMax: 1.4,       // 射程上限 = 到玩家距离 × 1.4
    rangeScreen: 0.15,   // 额外 + 15% 屏高
    brakeDist: 46,       // 到达「最大射程 - brakeDist」时进入减速段
    brakeRate: 4,        // 减速段收敛率（原 8 减半：减速度减半，临射程前滑行更远）
    fadeTime: 0.35,      // 减速末段渐隐窗口（s）：滑行末段才提前渐隐，速度归零时恰好消失
    shieldDie: 0.22,     // 撞上守愿者被阻挡后的消散时长（s）：撞击特效 + 尾焰快速衰减，不瞬间消失
    dimRate: 0.55,       // 黯淡速率（较慢：保证减速滑行期间仍清晰可见）
    glowFloor: 0.35,     // 黯淡下限（不至于全黑）
    mainDR: 0.3,         // 受主战机（非僚机）伤害 -30%
    spawnLowLv: 0.02,    // lv10 前替换概率（很低）
    spawnHighLv: 0.30,   // lv10 后替换概率
  };

  // 法术阵列参数（特殊3类血红三菱法师母机）：移速/碰撞同炮火先兆者；发射法术矩阵同款但大一号的红色正方体，
  // 飞行 30%~60% 射程时分裂为 3 枚常规正方体（1 同向 + 2 垂直）；在场时法术矩阵偏移角/速度增强（见 fireMatrixCube）
  // 法术阵列参数（特殊4类血红三菱法师母机）：整体移速为炮火先兆者基准的 65%（speedMul 0.65）；
  // 发射法术矩阵同款但大一号的红色正方体，飞行 30%~60% 射程时分裂为 3 枚常规正方体（1 同向 + 2 垂直）；
  // 每 4s 闪动红光并在周围召唤一个法术矩阵（召唤体无奖励）；在场时法术矩阵偏移角/速度增强（见 fireMatrixCube）
  const FASHI_ARRAY = {
    descend: 220,        // 进场下降速度（无减速动作）
    hoverTopPct: 0.20,   // 停驻区上界 = 屏高 × 0.20
    hoverBotPct: 0.30,   // 停驻区下界 = 屏高 × 0.30
    hold: 30,            // 停驻时长（30s 后向上飞离战场）
    firstDelay: [0, 1],  // 就位后首次攻击延迟区间（s，随机 0~1）
    fireInterval: [2.76, 3.84],   // 大正方体攻击间隔（由 [2.3, 3.2] 增大 20%）
    summonFirst: 4,      // 首次召唤法术矩阵延迟（s，就位后计）
    summonInterval: 5,   // 后续召唤法术矩阵周期（s，红光闪动 + 周围生成）
    summonDistMin: 50,   // 召唤生成距离下限（px）
    summonDistMax: 120,  // 召唤生成距离上限（px）
    summonFlashDur: 0.3, // 召唤时周身红光闪动时长（s）
    cubeDmg: 26,         // 大正方体伤害（常规正方体已统一上调至 20）
    cubeSpeed: 400,      // 大正方体巡航速度（法术矩阵正方体 360 的提速版）
    cubeR: 23,           // 大正方体碰撞半径（法术矩阵的约 1.35 倍）
    cubeHalf: 20,        // 大正方体绘制半边长（法术矩阵 15 的约 1.33 倍）
    glowMul: 1.35,       // 大正方体红光增强倍率
    splitMin: 0.30,      // 分裂行程下限（占射程比例）
    splitMax: 0.60,      // 分裂行程上限（占射程比例）
    splitWarn: 0.5,      // 分裂预警时长（s，红圈收缩）
    slotChance: 0.50,    // Lv10 起 4 类槽位出场时替换主力舰的概率（其余为主力舰）
    doubleChance: 0.25,  // 场上已有 1 台法术阵列时，慢速强制刷新路径上再补 1 台的概率（双法术阵列较少出现）
  };

  /* ---------- 场面压力权重刷新系统（替代固定冷却：gunshipCd / capitalCd / 清场门槛） ----------
   * 场上每种敌人有一个"压力权重"（仅用于刷新节流判定，与得分/难度无关）；
   * 压力比 = 场上敌人权重和 / 满场基准（PRESSURE_CAPACITY）。
   * 压力低于阈值 → 直接刷新 / 刷新倒计时快速加速直到刷新；高于阈值 → 刷新较慢（间隔有限，拖得太长仍会刷新）。
   * 阈值随关卡提升：Lv10 以下 20%，Lv10→Lv20 线性升至 30%。
   */
  const PRESSURE_W = {
    side: 1, striker: 2,                    // 1类侧翼艇 / 2类突击艇
    prolifera: 1,                           // 增生侧翼艇（同 1类计 1；其衍生的卫护飞船不计入压力）
    gunship: 4, capital: 10,                // 3类普通炮艇 / 4类主力舰
    harbinger: 2, hanshuang: 2, weilong: 2, // 炮火先兆者 / 寒霜 / 威龙（威龙血量<60%记 0）
    yu4: 3,                                 // 御4
    anvil: 3,                               // 铁砧（悬停治疗无人机，同御4 计 3）
    // 暴鸰：另一分支已并入本文件（spawnBaoling），按权重正常生效
    baoling: 4,                             // 暴鸰
    jiaoxiang: 5,                           // 焦香螺旋桨（持续灼烧威胁，高权重）
    fashiA1: 2,                             // 法术大师A1（同 2类突击艇权重）
    popian: 2,                              // 破片（同 2类突击艇权重）
    fashiA2: 4,                             // 法术大师A2（高血量激光无人机，介于威龙与暴鸰之间）
    fashiMatrix: 2,                         // 法术矩阵（同 2类突击艇权重）
    fashiArray: 10,                         // 法术阵列（特殊4类，同主力舰权重）
  };
  const PRESSURE_CAPACITY = 25;   // 满场压力基准（权重和 ÷ 25 = 压力比）
  const SPAWN_SLOW_MUL = 2.5;     // 高于压力阈值时的波次刷新间隔倍率（较慢）
  const SPAWN_RUSH = 5;           // 低于压力阈值时的刷新倒计时加速（/s）：间隔快速缩短直到刷新
  const SPAWN_RUSH_CAP = 4;       // 加速倍率上限

  // 2类（突击艇）前锋停留线：位于 3/4 类悬停高度（y≈110~170）的前方（更靠下），凸显其前锋定位
  const STRIKER_HOLD_Y = 210;

  // 幽暮突击艇（2类黑色变体）参数：浮现(渐显) → 下移落点停驻 → 停 0.2s(白环预警) → 环射 6/8 发 → 随即下移同距渐隐离场
  // 图鉴挑战模式：离场消失后由 updateChallenge 自动重新生成（完整循环展示浮现→环射→离场）
  const DUSK = {
    hp: 64,          // 生命值（常规 2 类为 48）
    bulletStartSpeed: 140,   // 环射弹初速
    bulletMaxSpeed: 280,     // 环射弹末速（= 常规 2类弹速）
    bulletAccel: 466.67,     // 环射弹加速度：(280-140)/0.3 → 出膛后 0.3s 内从初速加速到末速
    shift: 72,       // 浮现点与落点的垂直距离（离场下移同距）
    fadeIn: 0.5,     // 浮现渐显时长
    moveDur: 1.543,  // 浮现点→落点下移时长（ease-out：峰值速度 = 3×shift/moveDur ≈ 140 px/s）
    aimWait: 0.2,    // 到位后开火前停顿（白环预警动画时长）
    exitDur: 1.8,    // 离场下移（同时渐隐）时长（ease-in：峰值速度 = 2×shift/exitDur = 80 px/s）
  };

  /* ---------- 2/3/4 类变体：不同颜色 + 不同技能（weight 为出现权重） ----------
   * striker 2类：赤红(直射±10°、不追踪) / 烈橙(spread 前方双弹、夹角 40°/50°/60° 随机) / 幽蓝(homing 追踪弹、登场 10% 1s 或 10% 2s 虚化护盾) / 霜白(silent 不开火、不停留直接冲锋) / 幽暮(dusk 黑色机白核：浮现→落点环射→渐隐离场)；入位/冲锋速度逐变体定义
   * gunship 3类：紫(mixed 散射+追踪) / 红(aggressive 火力猛瞄准连射) / 金(ring 环形弹幕密集)；血量/下降速度/首射延迟逐变体定义
   * capital 4类：红(barrage 密集弹幕) / 蓝(lance 瞄准齐射+螺旋；出现时 20% 带护盾，前 5s 虚化不受伤害、炮弹穿过) / 金(crgold 三技能)；下降速度逐变体定义
   */
  const VARIANTS = {
    striker: [
      // entry = 入位下降速度（px/s）；charge = 冲锋基准速度（冲锋速度 = charge + (关卡-1)×5）
      // firstDelay = 首次开火额外延迟（数值或 [min,max] 区间）
      { id: 'crimson', color: '#ff3b30', weight: 0.26, skill: 'straight', firstDelay: [0.2, 0.6], entry: 140, charge: 100 },   // 赤红：直射 ±10° 偏差、不追踪
      { id: 'amber',   color: '#ff8a5c', weight: 0.26, skill: 'spread', firstDelay: [0.4, 0.8], entry: 160, charge: 120 },     // 烈橙：前方双弹，夹角 40°/50°/60° 随机
      { id: 'azure',   color: '#4d9fff', weight: 0.21, skill: 'homing', firstDelay: [0.5, 1], entry: 120, charge: 80 },        // 幽蓝：追踪弹、登场 10% 1s / 10% 2s 虚化护盾
      { id: 'white',   color: '#eaf1f8', weight: 0.15, skill: 'silent', entry: 120, charge: 80 },                              // 霜白：不开火、不停留直接冲锋
      { id: 'dusk',    color: '#14161c', weight: 0.12, skill: 'dusk' },                       // 幽暮：黑色机白核；出现权重按关卡分档直接取值（Lv1~10 为 2 / Lv11~20 为 5，见 strikerVariantWeights）
    ],
    gunship: [
      // hp = 血量覆盖；speed = 下降/离场速度；firstFire = 首射延迟区间
      { id: 'violet',  color: '#c084fc', weight: 0.5, skill: 'mixed', hp: 350, speed: 300, firstFire: [1.1, 1.9] },
      { id: 'crimson', color: '#ff5a5a', weight: 0.3, skill: 'aggressive', hp: 350, speed: 270, firstFire: [1.0, 1.7] },
      { id: 'amber',   color: '#ffbf47', weight: 0.2, skill: 'ring', hp: 400, speed: 240, firstFire: [1.2, 2.4] },   // 金曜（黄）
    ],
    capital: [
      // speed = 下降/离场速度；wLow/wHigh = 变体选取权重（Lv1~10 / Lv11~20 分档，见 pickVariant）
      { id: 'crimson', color: '#ff4d6d', wLow: 0.5, wHigh: 0.3, skill: 'barrage', speed: 250 },
      { id: 'azure',   color: '#4d9fff', wLow: 0.3, wHigh: 0.15, skill: 'lance', speed: 220 },   // 出现时 20% 带护盾（前 5s 虚化）
      { id: 'crgold',  color: '#ff9a1a', wLow: 0.3, wHigh: 0.15, skill: 'crgold', speed: 280 },  // 赤金主力舰：橙黄舰体 + 旋转双环 + 三技能
    ],
  };
  const STRIKER_SPEED_MUL = 0.7;   // （已废弃：2类入位/冲锋速度改由 VARIANTS.striker 逐变体 entry/charge 定义）
  const SIDE_SPEED_MUL = 1.56;     // 1类虚象级（侧翼艇）全体速度倍率：所有生成点基值（×0.6）再统一乘此倍率，改一处即影响全部（1.3 → ×1.2 = 1.56，净速度约为原始基准的 94%）
  const SIDE_ENTRY_BOOST = 2.2;    // 1类入场冲刺倍率：入场瞬间速度更快，随后快速衰减
  const SIDE_ENTRY_DECAY = 5;      // 入场冲刺指数衰减系数（/s）：约 0.7s 内衰减至常规速度

  /* ---------- 3/4 类舰常规子弹：橙红色长条弹 ---------- */
  const SHIP_BULLET_COLOR = '#ff4d2e';   // 橙红色
  const SHIP_BULLET_LEN = 22;            // 长条弹长度（略短于 BOSS 的 26）
  const SPLIT_RED = '#ff6f4d';           // 4类蓝分裂弹：淡橙红（大号母弹 + 6 小子弹）
  const PHASE_DURATION = 5;      // 蓝色4类护盾虚化时长
  const PHASE_CHANCE = 0.2;      // 蓝色4类带护盾概率

  // 4类主力舰精细化配色（按变体区分：舰体暗→亮渐变 + 专属强调色/辉光，避免“仅换色”的草率感）
  const CAPITAL_PALETTE = {
    crimson: { dark: '#5e0c22', base: '#ff4d6d', light: '#ffb3bd', accent: '#ffb545', glow: '#ff3355' },
    azure:   { dark: '#0d2f5e', base: '#4d9fff', light: '#b3d9ff', accent: '#7ce7ff', glow: '#3399ff' },
    crgold:  { dark: '#5e3a06', base: '#ff9a1a', light: '#ffe2a8', accent: '#ffd166', glow: '#ffaa22' },   // 赤金：橙黄舰体 + 金色饰带/双环
  };

  // 3类炮艇精细化配色（按变体区分：舰体暗→亮渐变 + 专属强调色/辉光，与 4 类涂装同规格）
  const GUNSHIP_PALETTE = {
    violet:  { dark: '#3b1a63', base: '#c084fc', light: '#e9d5ff', accent: '#7ce7ff', glow: '#a855f7' },
    crimson: { dark: '#5e0c14', base: '#ff5a5a', light: '#ffc9c9', accent: '#ffb545', glow: '#ff3344' },
    amber:   { dark: '#5e3a06', base: '#ffbf47', light: '#ffeab3', accent: '#fff2c9', glow: '#ffaa22' },
  };

  /* ---------- 伤害类型 ----------
   * 普通伤害：我方主炮 / 僚机弹 / 撞机反伤等，可被御4防御光环、4类高火减伤、先兆者僚机减伤等乘区削减
   * 真实伤害：无视一切减伤乘区——目前仅高能爆弹，在 useBomb 中直接结算（不经过 updateBullets 的减伤链）
   */
  const STAR_COUNT = 90;
  const MAX_BOMBS = 3;             // 高能爆弹上限（右上角以图标数量展示）
  const BOMB_DAMAGE_BASE = 4000;   // 高能爆弹基础伤害（真实伤害：无视御4防御光环等一切减伤）
  const BOMB_DAMAGE_RATIO = 0.10;  // + 目标最大血量的 10%
  const CAPITAL_HIGHFIRE_DR = 0.15;   // 4类主力舰：对玩家 Lv4 / 暴走(Lv5) 火力的减伤（受到伤害 ×0.85）
  const CAPITAL_DESCEND_DR = 0.20;    // 4类主力舰：俯冲减速前（距悬停高度 ≥90px、速度未明显衰减）的减伤（受到伤害 ×0.8）
  const BOSS_LOWFIRE_BONUS = 0.20;    // 玩家火力 Lv1 时对 BOSS 的武器伤害加成（BOSS 受到伤害 ×1.20，逆境补偿）
  const POPIAN_VULN_LV1 = 0.30;       // 火力 Lv1 时对破片的易伤（受到伤害 ×1.30，低火力补偿）
  const POPIAN_VULN_LV2 = 0.10;       // 火力 Lv2 时对破片的易伤（受到伤害 ×1.10）
  const WEAPON_DROP_HITS = 3;         // 统一：累计受击 3 次掉 1 级火力（全场景同规则；导弹命中不计入）

  // 测试模式（图鉴挑战）：敌方不再无敌 —— 按 1~4 类统一血量（BOSS 与大型龙卷等召唤物保持注册表血量）
  const TEST_HP_CLASS1 = 4000;        // 1类：侧翼艇 / 增生侧翼艇 / 卫护飞船
  const TEST_HP_CLASS234 = 10000;     // 2/3/4类：其余全部敌机

  /* ---------- 道具掉落规则（颜色标签驱动，见 enemyColorTags / rollItemDrops） ---------- */
  const DROP_KIT_RATE = 0.09;      // 升级套件基础掉率
  const DROP_KIT_RED = 1.5;        // 红色敌人套件倍率
  const DROP_KIT_PURPLE = 1.2;     // 紫色敌人套件倍率
  const DROP_KIT_YELLOW = 1.2;     // 黄色（含 3类金曜）敌人套件倍率
  const DROP_SHIELD_RATE = 0.02;   // 量子护盾基础掉率
  const DROP_SHIELD_BLUE = 0.06;   // 蓝色敌人护盾掉率
  const DROP_SHIELD_STACK = 0.35;  // 场上已有护盾道具或我方已带盾时的降率倍数
  const DROP_HP_RATE = 0.018;      // 加血套件基础掉率
  const DROP_HP_GREEN = 0.10;      // 增生侧翼艇（淡青绿）加血掉率（固定值）
  const DROP_HP_BOSS = 0.40;       // BOSS 加血：40% 掉 1 个
  const DROP_HP_BOSS2 = 0.10;      // BOSS 加血：另有 10% 一次掉 2 个
  const DROP_BOMB_ORANGE = 0.005;  // 橙色敌人爆弹掉率（整场战斗最多触发一次，不影响 4类 5% 与 BOSS 20%）
  const DROP_KIT_BERSERK = 0.05;   // 升级套件变为暴走道具的概率

  // BOSS 血量阶段掉落：每当 BOSS 失去 20% 血量（跨过 80%/60%/40%/20% 线）判定一次，
  // 三个结果互斥：掉升级套件 10% / 掉量子护盾 5% / 两个全掉 5%；
  // 火力等级修正：Lv4 三个概率减半（×0.5）、Lv5 减少 70%（×0.3）、Lv1~3 无修正
  const BOSS_LOOT_KIT = 0.10;
  const BOSS_LOOT_SHIELD = 0.05;
  const BOSS_LOOT_BOTH = 0.05;

  // 1类侧翼艇：四种行为对应四种颜色（与图鉴一致）
  //   pass(白)：无攻击斜插穿越 | shoot(黄)：追踪射击 | kamikaze(紫)：亡语垂直射击 | moon(红)：赤月定向单射
  const SIDE_BEHAVIOR_COLORS = {
    pass:     '#f0f0f5',   // 白
    shoot:    '#ffd166',   // 黄
    kamikaze: '#c084fc',   // 紫
    moon:     '#ff3b30',   // 赤（赤月侧翼艇）
  };

  // 赤月侧翼艇（红色 1类）：机体为三角形、顶角指向当前航向；
  // 入场 1~2.5s 后随机时刻向顶角方向（航向正前方）发射一枚子弹，仅此一次；
  // 未发射即被击毁时 12% 概率触发亡语补射（同方向同弹速）
  const SIDE_MOON = {
    fireDelay: [1.0, 2.5],   // 入场后到发射的随机延时区间（s）
    deathShotChance: 0.12,   // 未发射即被击毁时的亡语补射概率
  };

  // 1类常规生成混合权重（按关卡分档，与「数值与机制图鉴-怪物权重」单一数据源同步）：
  //   low = Lv1~10 / high = Lv11~20；相对权重（非概率），由 pickSideSpawn 经 sideSpawnWeights(lv) 抽取
  // 注意：紫自爆流不混入增生（exclude）；BOSS 后固定首波不含紫电
  const SIDE_SPAWN_W = {
    low:  { pass: 70, prolifera: 5, shoot: 15, kamikaze: 5, moon: 20 },    // Lv1~10
    high: { pass: 60, prolifera: 10, shoot: 20, kamikaze: 10, moon: 25 },  // Lv11~20
  };

  // 1类行为数值修正（makeEnemy 按行为覆盖）：黄芒（shoot）血量 10；
  // 分数：白影/增生/黄芒/赤月 50、紫电（kamikaze 自爆）80
  const SIDE_SHOOT_HP = 10;
  const SIDE_SCORE = 50;
  const SIDE_KAMIKAZE_SCORE = 80;

  export {
    CANVAS_W, CANVAS_H, PLAYER_CFG, WEAPON_LEVELS, BERSERK, SHIELD_DURATION,
    BOSS_SEQUENCE, SPAWN_PHASE_TIMES, SPAWN_PHASE_LEVEL, BOSS, BOSS_BULLET, STORM,
    STORM_WIND, STORM2, stormEyeImg, stormEyeLoader, lightningImg, lightningImgAlt, lightningImgThin, lightningLoader, lightningLoaderAlt, lightningLoaderThin, lightningLoaderBig, lightningLoaderSmall, lightningImgBig, lightningImgSmall, BOSSES, BOSS_WARN, BOSS_WARN_TOTAL,
    BOSS_SPAWN_EARLY, PLANES, currentPlane, setPlane, setWingman, STARSLAYER,
    DIFFICULTIES, currentDifficulty, setDifficulty, diffMods, isShipian, SONG_SHIP, STORM_SHIP,
    WINGMEN_CFG, currentWingman, WINGMAN, BULWARK, WINGMAN_LEVELS, WINGMAN_SPREAD,
    ENEMY_TYPES, HARBINGER, WEILONG, HANSHUANG, YU4, ANVIL,
    BAOLING, JIAOXIANG, DOUZHI, FASHI_A1, FASHI_A2, POPIAN,
    FASHI_MATRIX, FASHI_ARRAY, PRESSURE_W, PRESSURE_CAPACITY, SPAWN_SLOW_MUL, SPAWN_RUSH, SPAWN_RUSH_CAP,
    STRIKER_HOLD_Y, DUSK, VARIANTS, STRIKER_SPEED_MUL, SIDE_SPEED_MUL, SIDE_ENTRY_BOOST,
    SIDE_ENTRY_DECAY, SHIP_BULLET_COLOR, SHIP_BULLET_LEN, SPLIT_RED, PHASE_DURATION, PHASE_CHANCE,
    CAPITAL_PALETTE, GUNSHIP_PALETTE, STAR_COUNT, MAX_BOMBS, BOMB_DAMAGE_BASE, BOMB_DAMAGE_RATIO,
    CAPITAL_HIGHFIRE_DR, CAPITAL_DESCEND_DR, BOSS_LOWFIRE_BONUS, POPIAN_VULN_LV1, POPIAN_VULN_LV2, WEAPON_DROP_HITS,
    CHAOS_PIERCE_DMG_MUL, DROP_KIT_RATE, DROP_KIT_RED, DROP_KIT_PURPLE, DROP_KIT_YELLOW, DROP_SHIELD_RATE,
    DROP_SHIELD_BLUE, DROP_SHIELD_STACK, DROP_HP_RATE, DROP_HP_GREEN, DROP_HP_BOSS, DROP_HP_BOSS2,
    DROP_BOMB_ORANGE, DROP_KIT_BERSERK, SIDE_BEHAVIOR_COLORS, SIDE_MOON, SIDE_SPAWN_W,
    TEST_HP_CLASS1, TEST_HP_CLASS234, SIDE_SHOOT_HP, SIDE_SCORE, SIDE_KAMIKAZE_SCORE,
    BOSS_LOOT_KIT, BOSS_LOOT_SHIELD, BOSS_LOOT_BOTH,
  };