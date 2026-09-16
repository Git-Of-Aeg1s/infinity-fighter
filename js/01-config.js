// 01-config：全部常量与注册表（画布/战机/僚机/敌机类型/BOSS/掉落率/压力权重）
'use strict';

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

  // 火力 5 级：直射窄弹道，射线数递增；Lv4 为 5 射线 + 半拍后于中间补射 2 发（视觉错开，不增宽）
  // Lv5 即暴走：限时 6s，攻速同 Lv4、弹速大幅提升，十射线（5 个位置各双发）、伤害 ×2
  const WEAPON_LEVELS = [
    null,
    { name: 'Lv1', interval: 0.24 },   // 3 射线，射速稍慢
    { name: 'Lv2', interval: 0.19 },   // 4 射线
    { name: 'Lv3', interval: 0.14 },   // 5 射线，射速正常
    { name: 'Lv4', interval: 0.12 },   // 5 射线 + 半拍后中间补射 2 发
    { name: 'Lv5', interval: 0.12 },   // 暴走：限时 6s，攻速同 Lv4，弹速提升
  ];
  const BERSERK = { interval: 0.12, dmgMul: 2, rMul: 1.4, duration: 6, spdMul: 1.6 };
  const SHIELD_DURATION = 6;   // 量子护盾持续时间

  // ---------- BOSS：旧日之歌 ----------
  // 第一个 BOSS：累计战斗约 60s 后登场，宽约 60% 屏宽，小幅左右巡航，仅 1 条命
  // 全局规则（适用于所有 BOSS）：技能乱序释放；若连续随机到同一技能，
  // 该技能结束后的冷却降为 20%（-80%）
  // ---------- 关卡流程：刷怪 50s → 旧日之歌 → 击败后 2s 缓冲 + 固定首波（1类长队）+ 4s 观察期 → 刷怪 50s → 暴风之眼 → 胜利 ----------
  const BOSS_SEQUENCE = ['song', 'storm'];   // BOSS 出场顺序（正常流程按序登场）
  const SPAWN_PHASE_TIMES = [50, 50];        // 各阶段刷怪时长（s）：两轮均为 50s（第二轮与第一轮节奏一致）
  // 关卡由“非 BOSS 期间的有效刷怪时间”驱动（不再随分数增长，切断高分→怪多→更高分的正反馈）：
  // 第一轮 1 级起步、每 10s +1（50s 刷怪期封顶 6 级）；第二轮 11 级起步、每 10s +1（50s 封顶 16 级）
  const SPAWN_PHASE_LEVEL = [
    { base: 1, step: 10 },
    { base: 11, step: 8 },
  ];
  const BOSS = {
    name: '旧日之歌',
    w: 288, h: 130,            // 宽度约 60% 屏宽
    hp: 32200,                 // 首个 BOSS 血量
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

  // ---------- BOSS2：暴风之眼（第二波；第一阶段为白色龙卷风暴） ----------
  const STORM = {
    name: '暴风之眼',
    w: 384, h: 384,            // 占屏宽 80%（CANVAS_W=480）
    hp: 45678,                 // 一阶段血量
    score: 8000,
    hoverY: 205,               // 风暴中心悬停高度
    skillCd: BOSS.skillCd * 0.5,   // 技能间基础冷却 = 旧日之歌常态间隔（2.2s）的 50%（连中同技能 ×0.2）
    windDmg: 30,               // 技能1 风流伤害
    flowR: 18.2,                // 风流半宽（已降 30%：26→18.2）
    tornadoDmg: 16,            // 风弹伤害（技能2/4/5/6）
    tornadoCrash: 32,          // 大型龙卷碰撞伤害
    pillarDmg: 18,             // 技能3 风柱伤害
    vortexDmg: 12,             // 技能7 涡流风旋碰撞伤害
    pillarW: 67,               // 风柱宽度 ≈ 10% 屏宽
    warnTime: 1.3,             // 区域标记倒计时
    tornadoDescend: 55,        // 大型龙卷缓慢下移速度
    tornadoMainDR: 0.5,        // 风团对主武器（主机弹幕）减伤 50%
    tornadoWingVuln: 1.5,      // 风团受到僚机伤害提高 150%（弱点：僚机火力）
  };
  const STORM_WIND = '#dff3ff';   // 风弹/风流配色（风白）

  // 暴风之眼本体图（透明底台风云盘）：异步预加载，加载完成前矢量风暴照常绘制
  let stormEyeImg = null;
  const stormEyeLoader = new Image();
  stormEyeLoader.onload = () => { stormEyeImg = stormEyeLoader; };
  stormEyeLoader.src = 'assets/storm-eye.png';

  // BOSS 注册表：测试模式按钮与警报演出由此生成；后续新 BOSS 在此追加
  const BOSSES = {
    song: { id: 'song', name: '旧日之歌', lv: 11 },
    storm: { id: 'storm', name: '暴风之眼', lv: 21 },
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
  };
  let currentPlane = PLANES.chaos;

  // ---------- 僚机系统：注册表与参数 ----------
  // 僚机成对出现（主机左右各一），不可被击中，拥有独立武器；两僚机合计伤害约为主机 30~40%
  const WINGMEN = {
    none: {
      id: 'none', name: '无僚机', empty: true,
      desc: '不携带僚机，独自出击。',
    },
    stars: {
      id: 'stars', name: '群星允诺',
      desc: '多发散射，火力覆盖',
      barTail: '#ffbf47', barMid: '#ffd9a0', barHead: '#8a6bff',   // 尾橙黄 → 头蓝紫
      flame: '#9b7bff',
      dmgMulByLevel: { 4: 1.4 },   // 群星允诺专属：Lv4 每发子弹伤害 ×1.4（其余等级缺省 1）
    },
  };
  let currentWingman = WINGMEN.stars;

  // 僚机通用参数（伤害/射速均可调；总体占主机 30~40%）
  const WINGMAN = {
    offsetX: 46, offsetY: 16, followLerp: 12,   // 相对主机偏移 + 跟随平滑系数
    bulletSpeed: 640, bulletDmg: 6,             // 长条弹幕速度 / 单发伤害
    barLen: 26, barR: 3.4,                      // 长条弹长度 / 半宽
    volleyGap: 0.11,                            // 一轮内两 volley 间隔（连续发射两次）
  };

  // 各火力等级僚机弹幕：volleys=[第一轮发数, 第二轮发数]，interval=启动连射的冷却
  // 夹角不再按等级固定，而是由“单轮发数”决定（见 WINGMAN_SPREAD）；level.spread 仅作缺省回退
  const WINGMAN_LEVELS = {
    1: { volleys: [2, 2], spread: 10, interval: 0.80 },   // Lv1：2+2 发、射速慢
    2: { volleys: [3, 2], spread: 10, interval: 0.62 },   // Lv2：3+2 发
    3: { volleys: [3, 3], spread: 10, interval: 0.52 },   // Lv3：3+3 发
    4: { volleys: [3, 4], spread: 10, interval: 0.40 },   // Lv4：3+4 发（第二轮 4 发、6°）、恢复正常射速
    5: { volleys: [5, 5], spread: 8, interval: 0.34 },    // 暴走：5+5 发、发光
  };

  // 僚机单轮弹幕夹角(度)按“该轮发数”取值：2发20° / 3发10° / 4发6° / 5发8°（发数越多相邻夹角越小、弹幕更聚拢）
  // 2发相邻 20°：与 3 发（相邻 10° × 2 间隔 = 总夹角 20°）的最远两颗夹角相当；Lv1 两轮与 Lv2 第二轮（同为 2 发）自动同步受影响
  const WINGMAN_SPREAD = { 2: 20, 3: 10, 4: 6, 5: 8 };

  /**
   * 四类非 Boss 敌人：
   *   1类 side     从场地中部略偏上的两侧斜插窜出，血极低；多数无攻击，少数追踪射击 / 阵亡时向下垂直射击
   *        prolifera  增生侧翼艇（1类特殊）：淡青绿、无攻击；阵亡分裂 2~3 个卫护飞船（escort），加血道具掉率 ×3
   *        escort     卫护飞船（增生侧翼艇衍生）：蓝色小三角、无攻击、沿原航向漂移；碰撞伤/无敌时间 ×0.4；仅掉水晶
   *   2类 striker  上方入场，血低；垂直向下直射，少部分追踪射击
   *   3类 gunship  上方入场，体型稍大血中；悬停上方，扇形 / 环形 / 双连炮多种弹幕
   *   4类 capital  上方居中入场，体型大血高；悬停上方，螺旋环 / 扇形齐射 / 环形爆发密集弹幕，
   *                 出场与在场期间由 1、2 类敌机护航
   */
  const ENEMY_TYPES = {
    side: {
      w: 34, h: 30, hp: 1,   score: 60,   color: '#8ce36b', drawScale: 1.4,
      bulletSpeed: 230, bulletR: 4, bulletDmg: 6, crashDmg: 12,
      fireInterval: [1.4, 2.2],
    },
    // 增生侧翼艇（1类特殊）：淡青绿 1类艇，无攻击；生命/碰撞伤害与白影侧翼艇一致；
    // 阵亡时分裂 2~3 个卫护飞船，加血道具掉率为常规的 3 倍
    prolifera: {
      w: 34, h: 30, hp: 1,   score: 60,   color: '#7fe8c9', drawScale: 1.4,
      crashDmg: 12,
      fireInterval: [1.4, 2.2],   // 无攻击，字段仅为 makeEnemy 取值完整性
    },
    // 卫护飞船（增生侧翼艇衍生）：小三角形（纯等腰三角、无核心），蓝色，无攻击，沿原航向继续飞行；
    // 碰撞伤害与撞击无敌时间均为增生侧翼艇的 40%；出厂随机虚化护盾；仅掉水晶
    escort: {
      w: 12, h: 14, hp: 1,   score: 20,   color: '#9cd6ff', drawScale: 1.25,
      crashDmg: 4.8,              // 增生侧翼艇（12）的 40%
      invulnMul: 0.4,             // 撞击造成的无敌时间同样为 40%（0.48s）
      fireInterval: [1.4, 2.2],   // 无攻击，字段仅为 makeEnemy 取值完整性
    },
    striker: {
      w: 46, h: 40, hp: 48,  score: 150,  color: '#ff3b30', drawScale: 1.4,
      bulletSpeed: 280, bulletR: 5, bulletDmg: 8, crashDmg: 25,
      fireInterval: [1.1, 2.0],
    },
    gunship: {
      w: 76, h: 62, hp: 300,  score: 400,  color: '#c084fc', drawScale: 1.55,
      bulletSpeed: 250, bulletR: 4, bulletDmg: 8, crashDmg: 30,
      fireInterval: [1.8, 2.4],
    },
    capital: {
      w: 192, h: 134, hp: 3939, score: 1500, color: '#ff4d6d', drawScale: 2.0,
      bulletSpeed: 230, bulletR: 5, bulletDmg: 10, crashDmg: 40,
      fireInterval: [2.4, 2.8],
    },
    // 特殊3类：炮火先兆者（后排炮兵）—— 灰黑形体 + 红色充能核心，充满后召唤垂直落下的导弹
    harbinger: {
      w: 82, h: 82, hp: 777, score: 450, color: '#3a3f4a', drawScale: 1.68,   // 体型增大 20%（含碰撞盒同步）
      bulletSpeed: 210, bulletR: 6, bulletDmg: 16, crashDmg: 12.5,   // 碰撞伤害为 2 类(25) 的 50%
      fireInterval: [4, 4],
    },
    // 特殊3类：威龙（高血量无人机）—— 俯视四旋翼无人机、橙黄渐变；蛇形巡航、朝玩家三连快弹（弹速 +60%）、攻击时停移
    weilong: {
      w: 76, h: 70, hp: 4567, score: 700, color: '#ff9a1a', drawScale: 1.5,
      bulletSpeed: 230, bulletR: 5, bulletDmg: 12, crashDmg: 35,
      fireInterval: [1.91, 2.43],   // 攻击间隔在原 [1.47,1.87] 基础上 +30%（更稀疏）
    },
    // 特殊3类：寒霜（冰霜无人机）—— 俯视四旋翼无人机、灰黑渐变 + 天蓝霜纹边缘；
    // 不攻击：直线下移到场地 60%~80% 随机高度停留 20s；登场 1s 后展开冰蓝寒霜光圈（圈内玩家射速 -35%）
    hanshuang: {
      w: 61, h: 56, hp: 555, score: 450, color: '#8fd8ff', drawScale: 1.2,   // 机体缩小 20%（含碰撞盒同步）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 25,
      fireInterval: [1e9, 1e9],   // 不攻击：间隔天文数字，永不落入通用开火逻辑
    },
    // 特殊3类：御4（防御无人机）—— 俯视四旋翼无人机、介于圆与方之间的超椭圆暖灰渐变机体 + 金色 X 形条纹 + 四角风扇圆；
    // 不攻击：登场 0.5s 后展开金色六边力场（光环内敌人受到的非真实伤害 -30%），停留 25s；Lv10 前不出场
    yu4: {
      w: 53, h: 53, hp: 500, score: 450, color: '#d6c078', drawScale: 1.02,   // 机体缩小 15%（含碰撞盒同步：62→53、drawScale 1.2→1.02）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 15,   // 碰撞伤害为常规 3 类炮艇(30) 的 50%
      fireInterval: [1e9, 1e9],   // 不攻击：间隔天文数字，永不落入通用开火逻辑
    },
    // 特殊3类：暴鸰（自爆无人机）—— 白灰磨角方形机体（较威龙小 20%）+ 灰黑渐变横杠连四角风扇（淡黄桨心）
    // + 前挂黑色圆炸弹（红道 + 白骷髅）；不悬停直线下压，接近玩家停车投弹，投弹后提速俯冲离场
    baoling: {
      w: 56, h: 60, hp: 500, score: 400, color: '#e3e6ec', drawScale: 1.2,
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 12,   // 碰撞伤害为常规 3 类炮艇(30) 的 40%
      fireInterval: [1e9, 1e9],   // 不攻击：投弹流程由移动状态机驱动
    },
    // 特殊敌机：暴风之眼技能2 召唤的大型龙卷（可击毁、缓慢下移直至脱离战场、随机 360° 射风弹）
    tornado: {
      w: 144, h: 144, hp: 3000, score: 0, color: '#eaf6ff', drawScale: 1,
      bulletSpeed: 170, bulletR: 5, bulletDmg: 16, crashDmg: 32,
      fireInterval: [0.2, 0.3],
    },
  };

  // 炮火先兆者参数
  const HARBINGER = {
    descend: 180,        // 进场/离场下降速度（提升 50%）
    wingDR: 0.25,        // 对僚机弹幕减伤 25%（装甲针对僚机火力）
    charge: 3,           // 红色从中心扩展至通体红的充能时长
    cover: 2,            // 灰黑从中心覆盖红色的时长
    hold: 18,            // 就位停留时长（约导引 4 次导弹后开走）
    warnTime: 3,         // 导弹垂直预警线时长
    missileSpeed: 1404,  // 导弹从上方下落速度（高速；原 780 提速 80%）
    missileR: 12,        // 导弹半径（宽于常规子弹）
    lowHpKill: 60,       // 玩家血量低于此值被导弹命中则直接击杀
  };

  // 威龙参数（特殊3类无人机）
  const WEILONG = {
    speed: 57.6,         // 巡航速度（原 48 提速 20%；历史：68 → 降30%得 47.6 取整 48 → ×1.2）
    hoverY: 96,          // 首段下降到约炮火先兆者停留高度
    segDown: 100,        // 蛇形路径每段向下前进距离
    margin: 46,          // “走到靠边”时与墙壁的间距
    dwell: 2,            // 末段（1/3 处）停顿时长
    burstCount: 5,       // 每次朝玩家射 5 枚
    burstGap: 0.09,      // 连发间隔
    bulletSpeedMul: 1.6, // 弹速较普通弹 +60%
    lowHpRatio: 0.6,     // 血量低于此比例后压力权重记 0（不再拖慢敌方刷新，见 PRESSURE_W）
  };

  // 寒霜参数（特殊3类冰霜无人机）
  const HANSHUANG = {
    speed: 180,          // 下降/离场速度（等同炮火先兆者进场速度 HARBINGER.descend）
    auraDelay: 1.0,      // 登场后光圈显现延迟
    auraFadeIn: 0.8,     // 光圈渐显时长（延迟后从透明淡入到完全体）
    auraR: 150,          // 寒霜光圈半径（较大范围，以玩家核心位置判定）
    dwell: 20,           // 到位后停留时长
    fireSlow: 0.65,      // 光圈内玩家射速倍率（-35%：冷却流速乘 0.65）
    moveSlow: 0.75,      // 光圈内玩家移动速度倍率（-25%）
  };

  // 御4参数（特殊3类防御无人机）
  const YU4 = {
    speed: 256,          // 下降/离场速度（常规3类炮艇 320 的 80%：降低 20%）
    auraDelay: 0.5,      // 登场后防御光环显现延迟
    auraFadeIn: 0.6,     // 光环渐显时长（延迟后从透明淡入到完全体）
    auraR: 160,          // 防御光环半径（覆盖悬停带内相邻敌人）
    dmgReduce: 0.30,     // 光环内敌人受到的非真实伤害降低 30%
    dwell: 25,           // 到位后停留时长（25s）
  };

  // 暴鸰参数（特殊3类自爆无人机）
  const BAOLING = {
    speedSlow: 128,      // 投弹前下降速度（常规3类炮艇 320 的 40%）
    speedPost: 224,      // 投弹后俯冲速度（常规3类炮艇的 70%）
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
    // 暴鸰：另一分支已并入本文件（spawnBaoling），按权重正常生效
    baoling: 4,                             // 暴鸰
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
    shift: 72,       // 浮现点与落点的垂直距离（离场下移同距；较初始 90 缩短 20%）
    fadeIn: 0.5,     // 浮现渐显时长（缩短渐显到开走的间隔，现身后更快开始下移）
    moveDur: 1.47,   // 浮现点→落点下移时长（ease-out：加速快、平滑减速停驻不瞬停；峰值速度 245→147 px/s，降 40% → 时长拉长）
    aimWait: 0.2,    // 到位后开火前停顿（白环预警动画时长）
    exitDur: 1.87,   // 离场下移（同时渐隐）时长（ease-in 峰值 129→77 px/s，降 40%）
  };

  /* ---------- 2/3/4 类变体：不同颜色 + 不同技能（weight 为出现权重） ----------
   * striker 2类：赤红(直射±10°、不追踪、首发+1s) / 烈橙(spread 前方双弹、夹角 50°/60°/70° 随机) / 幽蓝(homing 追踪弹、首发+1s、登场 10% 1s 或 10% 2s 虚化护盾) / 霜白(silent 不开火、到位停留 2s 再冲锋) / 幽暮(dusk 黑色机白核：浮现→落点环射→渐隐离场)；速度均 -30%
   * gunship 3类：紫(mixed 散射+追踪) / 红(aggressive 火力猛瞄准连射) / 金(ring 环形弹幕密集、初次开火准备 +0.4s)
   * capital 4类：红(barrage 密集弹幕) / 蓝(lance 瞄准齐射+螺旋；出现时 20% 带护盾，前 6s 虚化不受伤害、炮弹穿过)
   */
  const VARIANTS = {
    striker: [
      { id: 'crimson', color: '#ff3b30', weight: 0.26, skill: 'straight', firstDelay: 1 },   // 赤红：直射 ±10° 偏差、不追踪、首发 +1s
      { id: 'amber',   color: '#ff8a5c', weight: 0.26, skill: 'spread' },                     // 烈橙：前方双弹，夹角 50°/60°/70° 随机
      { id: 'azure',   color: '#4d9fff', weight: 0.21, skill: 'homing', firstDelay: 1 },      // 幽蓝：追踪弹、首发 +1s、登场 10% 1s / 10% 2s 虚化护盾
      { id: 'white',   color: '#eaf1f8', weight: 0.15, skill: 'silent' },                     // 霜白：不开火，到位停留 2s 再冲锋
      { id: 'dusk',    color: '#14161c', weight: 0.12, skill: 'dusk' },                       // 幽暮：黑色机白核；基础权重 0.12，实际出现率按关卡调整（Lv10 前 ×0.1 / Lv10 起 ×0.4，见 pickVariant）
    ],
    gunship: [
      { id: 'violet',  color: '#c084fc', weight: 0.5, skill: 'mixed' },
      { id: 'crimson', color: '#ff5a5a', weight: 0.3, skill: 'aggressive' },
      { id: 'amber',   color: '#ffbf47', weight: 0.2, skill: 'ring', firstDelay: 0.4 },   // 金曜（黄）：初次开火前准备 +0.4s（在常规首发间隔上叠加）
    ],
    capital: [
      { id: 'crimson', color: '#ff4d6d', weight: 0.6, skill: 'barrage' },
      { id: 'azure',   color: '#4d9fff', weight: 0.4, skill: 'lance' },
    ],
  };
  const STRIKER_SPEED_MUL = 0.7;   // 2类突击艇速度降低 30%（赤红/烈橙均适用）
  const SIDE_SPEED_MUL = 1.3;      // 1类虚像级（侧翼艇）全体速度倍率：所有生成点基值（×0.6）再统一乘此倍率，改一处即影响全部
  const SIDE_ENTRY_BOOST = 2.2;    // 1类入场冲刺倍率：入场瞬间速度更快，随后快速衰减
  const SIDE_ENTRY_DECAY = 5;      // 入场冲刺指数衰减系数（/s）：约 0.7s 内衰减至常规速度

  /* ---------- 3/4 类舰常规子弹：橙红色长条弹 ---------- */
  const SHIP_BULLET_COLOR = '#ff4d2e';   // 橙红色
  const SHIP_BULLET_LEN = 22;            // 长条弹长度（略短于 BOSS 的 26）
  const SPLIT_RED = '#ff6f4d';           // 4类蓝分裂弹：淡橙红（大号母弹 + 6 小子弹）
  const PHASE_DURATION = 6;      // 蓝色4类护盾虚化时长
  const PHASE_CHANCE = 0.2;      // 蓝色4类带护盾概率

  // 4类主力舰精细化配色（按变体区分：舰体暗→亮渐变 + 专属强调色/辉光，避免“仅换色”的草率感）
  const CAPITAL_PALETTE = {
    crimson: { dark: '#5e0c22', base: '#ff4d6d', light: '#ffb3bd', accent: '#ffb545', glow: '#ff3355' },
    azure:   { dark: '#0d2f5e', base: '#4d9fff', light: '#b3d9ff', accent: '#7ce7ff', glow: '#3399ff' },
  };

  // 3类炮艇精细化配色（按变体区分：舰体暗→亮渐变 + 专属强调色/辉光，与 4 类涂装同规格）
  const GUNSHIP_PALETTE = {
    violet:  { dark: '#3b1a63', base: '#c084fc', light: '#e9d5ff', accent: '#7ce7ff', glow: '#a855f7' },
    crimson: { dark: '#5e0c14', base: '#ff5a5a', light: '#ffc9c9', accent: '#ffb545', glow: '#ff3344' },
    amber:   { dark: '#5e3a06', base: '#ffbf47', light: '#ffeab3', accent: '#fff2c9', glow: '#ffaa22' },
  };

  // 按权重随机选取变体
  // 幽暮突击艇出现率按关卡调整：Lv10 前为基础权重（12%）的 10%，Lv10 起为 40%；
  // 缩减的概率按比例摊给其余变体，保证幽暮出现率精确达标
  function pickVariant(type) {
    const list = VARIANTS[type];
    const isDusk = v => type === 'striker' && v.id === 'dusk';
    const duskMul = state.level < 10 ? 0.10 : 0.40;
    const duskW = list.reduce((s, v) => s + (isDusk(v) ? v.weight : 0), 0) * duskMul;
    const otherW = list.reduce((s, v) => s + (isDusk(v) ? 0 : v.weight), 0);
    const scale = otherW > 0 ? (1 - duskW) / otherW : 1;
    let r = Math.random();
    for (const v of list) {
      const w = isDusk(v) ? duskW : v.weight * scale;
      if (r < w) return v;
      r -= w;
    }
    return list[0];
  }

  /* ---------- 伤害类型 ----------
   * 普通伤害：我方主炮 / 僚机弹 / 撞机反伤等，可被御4防御光环、4类高火减伤、先兆者僚机减伤等乘区削减
   * 真实伤害：无视一切减伤乘区——目前仅高能爆弹，在 useBomb 中直接结算（不经过 updateBullets 的减伤链）
   */
  const STAR_COUNT = 90;
  const MAX_BOMBS = 3;             // 高能爆弹上限（右上角以图标数量展示）
  const BOMB_DAMAGE_BASE = 4000;   // 高能爆弹基础伤害（真实伤害：无视御4防御光环等一切减伤）
  const BOMB_DAMAGE_RATIO = 0.10;  // + 目标最大血量的 10%
  const CAPITAL_HIGHFIRE_DR = 0.15;   // 4类主力舰：对玩家 Lv4 / 暴走(Lv5) 火力的减伤（受到伤害 ×0.85）
  const BOSS_LOWFIRE_BONUS = 0.20;    // 玩家火力 Lv1 时对 BOSS 的武器伤害加成（BOSS 受到伤害 ×1.20，逆境补偿）
  const WEAPON_DROP_HITS = 2;         // 常规：累计受击 2 次掉 1 级火力
  const WEAPON_DROP_HITS_BOSS = 3;    // BOSS 战：累计受击 3 次才掉 1 级火力（更宽松）

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

  // 1类侧翼艇：三种行为对应三种颜色（与图鉴一致）
  //   pass(白)：无攻击斜插穿越 | shoot(黄)：追踪射击 | kamikaze(紫)：亡语垂直射击
  const SIDE_BEHAVIOR_COLORS = {
    pass:     '#f0f0f5',   // 白
    shoot:    '#ffd166',   // 黄
    kamikaze: '#c084fc',   // 紫
  };

