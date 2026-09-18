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
    magnetRadius: 132,   // 水晶吸附半径（基础值；击败旧日之歌后另乘 crystalMagnetMul 1.5 → 198）
    hitRadius: 4,        // 判定点半径：仅机身中心小点被击中才算命中
    hitOffsetY: 4,       // 判定点下移偏移（与白点视觉位置一致）
  };

  // 火力 5 级：直射窄弹道，射线数递增；Lv4 为 5 射线 + 半拍后于中间补射 2 发（视觉错开，不增宽）
  // Lv5 即暴走：限时 6s，攻速同 Lv4、弹速大幅提升，十射线（5 个位置各双发）、伤害 ×2
  // dmgMul：每发子弹伤害倍率（乘 PLAYER.bulletDamage）。用于把各级“每秒平均伤害(DPS)”压成等比链——
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
    windDmg: 28,               // 技能1 风波伤害（原 30）
    flowR: 18.2,               // （旧风流半宽，已弃用仅留参考）风波取其稍宽值，见 waveHalfW
    waveHalfW: 21,             // 风波竖直半厚（旧风流 18.2 的稍宽版）
    waveSagMin: 32,            // 风波下弯最小幅度（px：弯在下面，形似"（"逆时针旋转 90°，可不对称）
    waveSagMax: 68,            // 风波下弯最大幅度（px；曲率已增大）
    waveDur: 0.55,             // 风波显现后存留时长（瞬时降临、快速渐隐）
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
  stormEyeLoader.src = 'assets/storm-eye.webp';

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

  // ---------- 群星之杀：空间斩击参数 ----------
  // 机头直射一条较细淡白锁定光束（不造成伤害），选中最靠近玩家的主目标；
  // 每隔 interval 秒召唤一道空间斩击：以主目标为中心的矩形判定区（沿斩击方向），
  // 主目标受全额伤害、区域内其余敌人降至 splashMul（80%）。
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
    splashMul: 0.8,          // 非主目标伤害降至 80%
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
      // dmgMulByLevel：群星允诺每级每发伤害倍率。Lv5 暴走额外 ×2（公式内置），此处 lvMul 控制基础伤害。
      //   双僚机合计 DPS = Lv1 140 / Lv2 170 / Lv3 200 / Lv4 230 / Lv5 550。
      dmgMulByLevel: { 1: 2.6542, 2: 2.0683, 3: 1.75, 4: 1.3964, 5: 1.0313 },
      offsetX: 46, offsetY: 16,    // 后侧站位（沿用通用参数值）
      weapon: { kind: 'volley' },  // 对称双 volley 模型（走 WINGMAN_LEVELS + dmgMulByLevel）
    },
    bulwark: {
      id: 'bulwark', name: '钢铁壁垒',
      desc: '坚盾护体，侧向打击',
      barTail: '#3b7de8', barMid: '#6dc4f8', barHead: '#b0e8ff',   // 尾中蓝 → 头浅天蓝（天蓝占比更大）
      flame: '#8fd8ff',
      offsetX: 41, offsetY: -20,   // 前侧站位（稍微靠近主机，本体+盾整体往右上移动）
      // 防御辅助型：前方连体白盾消解非导弹直射弹（详见 BULWARK 与挡弹系统）
      // 武器：一侧扇形（0→spreadMax 度）错序发射（最前方先发）
      //   双僚机合计 DPS = Lv1 160 / Lv2 200 / Lv3 240 / Lv4 300 / Lv5 500
      weapon: {
        kind: 'fan',
        spreadMax: 120,          // 相对竖直向上、朝外侧的最大夹角（度）
        staggerGap: 0.05,        // 错序发射每发间隔（秒）
        bulletSpeed: 600,        // 常规弹速；Lv5 ×speedMul
        barLen: 32, barR: 5.4,   // 椭圆长条弹尺寸（加长加大）
        levels: {
          1: { count: 5, interval: 0.96, dmg: 30.72 },
          2: { count: 6, interval: 0.84, dmg: 28.0 },
          3: { count: 7, interval: 0.72, dmg: 24.69 },
          4: { count: 8, interval: 0.60, dmg: 22.5 },   // 相邻夹角 120/7≈17.14°
          5: { count: 9, interval: 0.60, dmg: 33.33, speedMul: 2.5, flame: true, leadExtra: true },   // 暴走：+1发(领头17.14°)、弹速×2.5、加尾焰、间隔同 Lv4
        },
      },
    },
  };
  let currentWingman = WINGMEN.bulwark;

  // 僚机通用参数（伤害/射速均可调；总体占主机 30~40%）
  const WINGMAN = {
    offsetX: 46, offsetY: 16, followLerp: 12,   // 相对主机偏移 + 跟随平滑系数
    bulletSpeed: 640, bulletDmg: 6,             // 长条弹幕速度 / 单发伤害
    barLen: 26, barR: 3.4,                      // 长条弹长度 / 半宽
    volleyGap: 0.11,                            // 一轮内两 volley 间隔（连续发射两次）
  };

  // 钢铁壁垒白盾几何：以僚机为圆心的圆弧屏障，覆盖“前方 + 侧前方”（随 side 镜像到外侧）
  //   arcFrom/arcTo 为相对“竖直向上”朝外侧扫过的角度（度）；segments 为折线逼近段数（供扫掠相交/裁切）
  const BULWARK = {
    radius: 30, arcFrom: -10, arcTo: 100, thickness: 6, segments: 12,
    color: '#eaf6ff', glow: '#bfe4ff',
  };

  // 各火力等级僚机弹幕：volleys=[第一轮发数, 第二轮发数]，interval=启动连射的冷却
  // 夹角不再按等级固定，而是由“单轮发数”决定（见 WINGMAN_SPREAD）；level.spread 仅作缺省回退
  // 每级每发伤害倍率见各僚机自身的 dmgMulByLevel
  const WINGMAN_LEVELS = {
    1: { volleys: [2, 2], spread: 10, interval: 0.80 },   // Lv1：2+2 发、射速慢
    2: { volleys: [3, 2], spread: 10, interval: 0.62 },   // Lv2：3+2 发
    3: { volleys: [3, 3], spread: 10, interval: 0.52 },   // Lv3：3+3 发
    4: { volleys: [3, 4], spread: 10, interval: 0.40 },   // Lv4：3+4 发（第二轮 4 发、6°）、恢复正常射速
    5: { volleys: [5, 5], spread: 8, interval: 0.34 },    // 暴走：5+5 发、发光，伤害走 ×2
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
    // 卫护飞船（增生侧翼艇衍生）：小三角形（纯等腰三角、无核心），深蓝紫渐变（边缘紫光），无攻击，沿原航向继续飞行；
    // 碰撞伤害与撞击无敌时间均为增生侧翼艇的 40%；出厂随机虚化护盾；仅掉水晶
    escort: {
      w: 12, h: 14, hp: 1,   score: 20,   color: '#6a5ce0', drawScale: 1.25,   // 深蓝紫（与浅蓝水晶区分）
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
      firstFire: [1.2, 2.4],   // 出场后首次射击延迟随机区间（就位后计，与出场途径无关）
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
      w: 76, h: 70, hp: 4567, score: 1200, color: '#ff9a1a', drawScale: 1.5,
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
    // 特殊3类：铁砧（治疗无人机）—— 菱形黑灰框架 + 中央灰黑正方形 + 上下左右横杠 + 中心朝下凸出白杠 + 正方形青绿治疗光环；
    // 不攻击：登场 0.5s 后展开治疗光环（圈内所有敌人含自身每秒回复 1% 最大生命 + 60），悬停于炮火先兆者前方，停留 25s；Lv10 前不出场
    anvil: {
      w: 70, h: 58, hp: 600, score: 450, color: '#8ce36b', drawScale: 1.44,   // 体型增大 20%（58×48 → 70×58；drawScale 同步 ×1.2 使视觉与碰撞盒一致）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 30,   // 碰撞伤害等同常规 3 类炮艇(30)
      fireInterval: [1e9, 1e9],   // 不攻击：间隔天文数字，永不落入通用开火逻辑
    },
    // 特殊3类：暴鸰（自爆无人机）—— 白灰磨角方形机体（较威龙小 20%）+ 灰黑渐变横杠连四角风扇（淡黄桨心）
    // + 前挂黑色圆炸弹（红道 + 白骷髅）；不悬停直线下压，接近玩家停车投弹，投弹后提速俯冲离场
    baoling: {
      w: 56, h: 60, hp: 500, score: 400, color: '#e3e6ec', drawScale: 1.2,
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 12,   // 碰撞伤害为常规 3 类炮艇(30) 的 40%
      fireInterval: [1e9, 1e9],   // 不攻击：投弹流程由移动状态机驱动
    },
    // 特殊3类：焦香螺旋桨（火焰灼烧无人机）—— 橙火红渐变环 + 黑色核心 + 白色圆 + 三根异速旋转白色横杠；
    // 无碰撞伤害、不攻击：登场后移动到场地 40% 以下位置绕大圈巡航；火焰光环持续灼烧我方战机（近本体翻倍）
    jiaoxiang: {
      w: 67, h: 54, hp: 900, score: 600, color: '#ff7a18', drawScale: 1.36,   // 本体缩小 20%（w/h/drawScale 同步；原比 3 类炮艇大 10%）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 0,   // 无碰撞伤害
      fireInterval: [1e9, 1e9],   // 不攻击：间隔天文数字，永不落入通用开火逻辑
    },
    // 特殊2类：斗志昂扬（增益无人机）—— 造型类暴鸰（白灰磨角方形机体 + 四角风扇），中心为上扬双箭头标志；
    // 下方挂载较大蓝色盒子（盒上方淡黄色空心正方形图案），四轮中心红色间歇闪光；
    // 无碰撞、不攻击：升级时 5% 概率从左/右侧横穿（速度=威龙×1.5、余弦上下浮动）；击毁后我方攻速/弹速翻倍 8s
    douzhi: {
      w: 56, h: 60, hp: 250, score: 300, color: '#c9d8ea', drawScale: 1.2,
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 0,   // 无碰撞伤害（与玩家互相穿过，见 updateEnemies）
      fireInterval: [1e9, 1e9],   // 不攻击
    },
    // 特殊2类：法术大师A1（紫光激光无人机）—— 四角风扇圆 + 灰黑矩形机身(1:3:1 紫光条) + 底部深紫炮管；
    // 不停留：出场 1s 后开始攻击（停移射击），50% 概率横移再恢复下降；lv10 前低权重、lv10 后较多出现
    fashiA1: {
      w: 46, h: 40, hp: 99, score: 180, color: '#a855f7', drawScale: 1.4,
      bulletSpeed: 380, bulletR: 5, bulletDmg: 16, crashDmg: 20,   // 碰撞伤害 = 普通2类(25) × 80%
      fireInterval: [1e9, 1e9],   // 攻击逻辑在移动状态机内处理，不走通用开火
    },
    // 特殊2类：破片（三连发导弹无人机）—— 造型类铁砧但更小、灰白金属主导（边框+核心）；中心两条黑杠（头部红、下方缩短）；
    // 下方两根黑色炮管（前部加粗、图层最底）；只沿直线飞到选定点后急停锁停（除非被击毁不再移动），停稳后才攻击；
    // 索敌范围 30% 屏高起步、每秒 +5%；攻击时玩家位置红圈预警 0.8s → 快速三连发不可击毁导弹（8/5/5，条件性无视无敌）；lv10 前低权重
    popian: {
      w: 55, h: 48, hp: 200, score: 200, color: '#cfd6e0', drawScale: 1.2,   // 体型同常规 2 类突击艇 ×1.2
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 20,   // 碰撞伤害按登场时间分段覆盖（见 updateEnemies）：0.5s 内 0 / 0.5~2s 2类×80% / 2s 后 2类×150%
      fireInterval: [1e9, 1e9],   // 攻击逻辑在移动/开火状态机内处理，不走通用开火
    },
    // 特殊3类：法术大师A2（紫白激光无人机）—— 法术大师A1 的强化版：体型较威龙 +30%、血量 900；
    // 移动/攻击逻辑与 A1 一致（不停留下降、停移射击、50% 横移），但速度较慢（威龙 ×1.3=62.4，仍远慢于 A1 的 147）
    // ——横移常在下一次攻击触发前未走完，此时照常停移射击，射击完毕后放弃剩余横移、径直下降；
    // 激光伤害 32（A1 ×2）、更亮更粗；四角风扇圆心为紫色（A1 为黑色）
    fashiA2: {
      w: 99, h: 91, hp: 900, score: 450, color: '#c084fc', drawScale: 3.0,   // 体型 = 威龙(76×70) × 1.3；局部造型沿用 A1 小坐标 → drawScale 3.0 使视觉尺寸与碰撞盒匹配（A1 为 1.4/盒46）
      bulletSpeed: 472.5, bulletR: 6, bulletDmg: 32, crashDmg: 35,   // 激光弹速与 FASHI_A2.laserSpeed 一致；碰撞伤害与威龙一致
      fireInterval: [1e9, 1e9],   // 攻击逻辑在移动状态机内处理，不走通用开火
    },
    // 特殊2类：法术矩阵（白红菱形法师无人机）—— 竖菱形机体（高为宽 1.8 倍）+ 白红渐变核心 + 一圈很细的黑色菱形环 + 环外仍白红；
    // 慢速下降到悬停带（约常规 2 类入位速一半），停稳后朝玩家左右 ±15° 发射「发白光的正方体」（每条边发红光，走独立 spellCubes 弹道）；
    // 正方体限程（自身→玩家距离 70%~140% + 15% 屏高）：到射程前快速减速、缓慢黯淡，在末端原位置停留 0.4~0.8s（仍可伤害）后快速渐隐；
    // 受主战机（非僚机）伤害 -30%；场上存在 3 类「法术阵列」(fashiArray) 时偏移角增至 ±25°、正方体速度 +25%（见 FASHI_MATRIX）
    fashiMatrix: {
      w: 27, h: 48, hp: 80, score: 180, color: '#ff5566', drawScale: 1.02,   // 竖菱形碰撞盒 h≈1.8w；整体缩小 30%（原 38×68 / drawScale 1.45）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 18,   // 碰撞伤害 18；正方体走独立 spellCubes 弹道，不用通用子弹字段
      fireInterval: [1e9, 1e9],   // 攻击逻辑在专属状态机内处理，不走通用开火
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
    moveSlow: 0.65,      // 光圈内玩家移动速度倍率（-35%）
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

  // 铁砧参数（特殊3类治疗无人机）：登场后展开正方形淡青绿治疗光环，圈内所有敌人（含自身）每秒回复
  const ANVIL = {
    speed: 256,          // 下降/离场速度（同御4：常规3类炮艇 320 的 80%）
    auraDelay: 0.5,      // 登场后治疗光环显现延迟
    auraFadeIn: 0.6,     // 光环渐显时长（延迟后从透明淡入到完全体）
    auraR: 150,          // 治疗光环半径（正方形半边长，覆盖悬停带内相邻敌人）
    healInterval: 1,     // 治疗触发间隔（每秒一次）
    healRatio: 0.01,     // 每次回复目标最大生命的 1%
    healFlat: 60,        // 每次额外回复固定 60 生命
    dwell: 25,           // 到位后停留时长（25s，同御4）
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

  // 焦香螺旋桨参数（特殊3类火焰灼烧无人机）：登场后绕大圈巡航，火焰光环持续灼烧我方战机
  const JIAOXIANG = {
    speed: 108,            // 巡航速度（原 180 降低 40%）
    entryBoost: 1.5,       // 就位前（非侧翼入场）移速加成倍率（150%）；侧翼入场无此加成
    entryBoostDecayDist: 140,   // 距目标点小于此值时，加成按剩余距离线性衰减，到位（entryReach）降回 100%
    turnRate: 3.0,         // 转向速率（速度向量朝期望方向插值速率；越大转弯越急，保证速度曲线连贯无突变）
    entryReach: 26,        // 入场到达判定距离（距目标点小于此值即切入绕圈；速度向量保留，无位置重置）
    leadAngle: 1.0,        // 绕圈引导点领先角度（rad）：追踪圆周上领先此角度的点，形成大致圆形轨迹
    orbitSpeedMul: 0.75,   // 绕圈阶段速度倍率（巡航 speed 的 75%，即绕圈平均速度较入场降低 25%）
    jitter: 90,            // 绕圈随机漂移幅度（相干随机游走的目标速度）：90 → 半径晃动 std≈±5px/极差≈22px，明显可见
    jitterRate: 2.5,       // 漂移游走速率（越大漂移方向变化越快；相干噪声不被转向平滑抵消，故"乱动"可见）
    auraDelay: 0.8,        // 顶部登场后火焰光环显现延迟
    auraDelayFlank: 1.2,   // 侧翼登场后火焰光环显现延迟（多 0.4s）
    auraFadeIn: 0.6,       // 光环渐显时长
    auraR: 98,             // 火焰光环半径（世界坐标；原 85 扩大 15%）
    nearR: 55,             // 近本体判定半径（圈内灼烧翻倍）
    burnDps: 15,           // 光环内每秒灼烧伤害（近本体 ×2 = 30）
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

  // 斗志昂扬参数（特殊2类增益无人机）：升级时 5% 概率从左/右侧横穿（余弦上下浮动）；
  // 击毁后进入死亡演出：蓝盒脱离迅速渐隐 → 淡黄光环扩大 → 我方攻速/弹速翻倍 8s → 本体快速渐隐
  const DOUZHI = {
    speed: 86.4,         // 横穿速度 = 威龙巡航(57.6) ×1.5
    ampY: 26,            // 上下余弦振幅（小幅浮动）
    freqY: 1.6,          // 上下余弦角频率（rad/s）
    spawnChance: 0.05,   // 每次关卡提升时的出现概率
    buffDuration: 8,     // 击毁后我方攻速/弹速翻倍持续时长（s）；不可叠加，重复获得直接重置为满时长
    buffMul: 2,          // 翻倍倍率
    boxFade: 0.25,       // 蓝盒脱离并迅速渐隐时长（掉落速度 ×2；渐隐结束后触发光环/增益/本体渐隐）
    haloDur: 0.4,        // 淡黄色扩大光环特效时长（扩大速度 ×2）
    bodyFade: 0.35,      // 本体快速渐隐时长（蓝盒渐隐结束后开始）
    boxDetach: 34,       // 蓝盒脱离时向下漂离距离
  };

  // 法术大师A1 参数（特殊2类紫光激光无人机）：不停留、出场 1s 后停移射击、50% 横移再恢复下降
  const FASHI_A1 = {
    entrySpeed: 196,     // 入场初速（不变）：白色突击艇入位(200×0.7=140) × 1.4
    entryDecay: 0.5,     // 入场后从 entrySpeed 快速衰减到 speed 的时长
    speed: 147,          // 最大下降速度 = entrySpeed × 0.75（降 25%）
    accel: 14,           // 加速度系数（很大：停移/横移/恢复都极快但平滑）
    firstDelay: 1,       // 出场后 1s 才开始攻击
    fireInterval: [1.0, 1.5],   // 攻击间隔：随机 1~1.5s
    firePause: 0.25,     // 停稳后到发射的短暂停顿（视觉反馈）
    fireLingerAfter: 0.35, // 发射后继续静止时长（不移动，原 0.15 + 0.2）
    laserSpeed: 425.25,  // 激光射弹速度（= A2 472.5 × 0.9；原 350）
    laserDmg: 16,        // 激光伤害
    laserLenPct: 0.4,    // （已废弃：激光无上限生长，直到尾端出界才消失）
    laserGrowRate: 151.875, // 激光生长速率 px/s（= A2 168.75 × 0.9；原 150）：无上限持续生长，直到尾端出界才消失
    laserR: 5,           // 激光宽度（半径）
    strafeChance: 0.5,   // 攻击后 50% 概率朝斜下方（45°）移动
    strafeMin: 80,       // 斜移水平分量最小距离
    strafeMax: 160,      // 斜移水平分量最大距离
    strafeSpeed: 192,    // 横移速度（原 320 × 0.6 = 降 40%）
    spawnLowLv: 0,       // lv10 前替换概率（0 = 不替换，仅图鉴挑战可生成）
    spawnHighLv: 0.30,   // lv10 后替换概率（较多出现）
    maxTurn: 10,         // 最大转向角速度（rad/s，很大）：炮管始终对准玩家，几乎实时转向但仍有可见转动过程
    exitTurn: 2.5,       // 下压超过屏高 80% 后炮管缓慢转向正下方的角速度（rad/s；约 1.2s 转完 180°）
  };

  // 法术大师A2 参数（特殊3类紫白激光无人机）：法术大师A1 强化版——移动/攻击逻辑一致，
  // 但下降速度较慢（78 ≈ 威龙 48 的 1.63 倍，仍慢于 A1 的 147）→ 斜下 45° 移动（80~160px 水平分量）常在下一次攻击触发前未走完：
  // 此时照常停移射击，射击完毕后放弃剩余斜移、径直下降直到下次攻击
  const FASHI_A2 = {
    entrySpeed: 104,     // 入场初速 = speed / 0.75（同 A1 比例）
    entryDecay: 0.5,     // 入场后从 entrySpeed 快速衰减到 speed 的时长
    speed: 78,           // 最大下降速度 = 62.4 × 1.25（约威龙 48 的 1.63 倍，仍慢于 A1 的 147）
    accel: 14,           // 加速度系数（同 A1：停移/横移/恢复都极快但平滑）
    firstDelay: [1.8, 2.3],       // 登场后随机 1.8~2.3s 触发首次刹停（每架独立随机）
    fireInterval: [1.22, 1.83],   // 攻击间隔：随机 1.22~1.83s（上一版 1.35~2.03 × 0.9）
    firePause: 0.25,     // 停稳后到发射的短暂停顿（视觉反馈）
    fireLingerAfter: 0.35, // 发射后继续静止时长
    laserSpeed: 472.5,   // 激光射弹速度（525 × 0.9；A1 的 1.11 倍）
    laserDmg: 32,        // 激光伤害（A1 16 的 2 倍）
    laserGrowRate: 168.75, // 激光生长速率（187.5 × 0.9；无上限持续生长，直到尾端出界才消失）
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
    speed: 156.8,          // 直线飞行速度 = 白色2类炮艇入位(200×0.7=140) × 80% × 1.4（移速提高40%）
    crashImmune: 0.5,      // 入场 0.5s 内无碰撞伤害
    crashLowEnd: 2,        // 0.5~2s 碰撞伤害为 2类(25) 的 80%；2s 后为 150%
    crashLowMul: 0.8,
    crashHighMul: 1.5,
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
    missileSpeed: 868,     // 导弹速度（较快；原620提高40%）
    missileR: 5,           // 导弹半径
    firstDmg: 8,           // 首发导弹伤害
    followDmg: 5,          // 后两发导弹伤害
    invulnCutMul: 0.7,     // 首发未命中/玩家无敌时，后两发命中带来的无敌时间 -30%
    firstDelay: 0.4,       // 停稳后首次攻击延迟
    fireInterval: [1.6, 2.4],   // 停稳后攻击间隔
    maxTurn: 3.2,          // 最大转向角速度（rad/s）：飞行倾斜与就位追踪玩家共用，转向有可见过程
    fireAlign: 0.35,       // 发射所需朝向对齐阈值（弧度，约 20°）：未朝向玩家时无法发起攻击
    spawnLowLv: 0.04,      // lv10 前替换概率（很低）
    spawnHighLv: 0.08,     // lv10 后替换概率
  };

  // 法术矩阵参数（特殊2类白红菱形法师无人机）：慢速下降到悬停带停稳 → 朝玩家左右 ±15° 发射发光正方体（独立 spellCubes 弹道）
  // 正方体限程后快速减速、缓慢黯淡，末端原位置停留 0.4~0.8s（仍可伤害）再快速渐隐；受主战机伤害 -30%；法术阵列在场时偏移角/速度增强
  const FASHI_MATRIX = {
    speed: 158,          // 常规移动速度（原 126 再 +25%）
    entrySpeed: 316,     // 入场初速 = speed × 2，随后在 entryDecay 内快速衰减到 speed
    entryDecay: 0.5,     // 入场初速衰减时长（s）
    accel: 12,           // 速度积分收敛率（下降/离场）
    dwell: 18,           // 到达目标区后「胡乱移动」持续时长，18s 后离场（挑战模式传 1e9 永驻）
    hoverTopPct: 0.20,   // 目标停留区上界 = 屏高 × 0.20（从上往下 20%）
    hoverBotPct: 0.40,   // 目标停留区下界 = 屏高 × 0.40（从上往下 40%）
    jitter: 110,         // OU 相干随机游走幅度（胡乱移动的期望速度量级）
    jitterRate: 2.0,     // OU 漂移目标变化频率（控晃动节奏）
    turnRate: 3.0,       // 速度平滑转向率（低通滤波 → 轨迹连贯不卡顿）
    edgePull: 260,       // 软边界回拉强度（接近活动区边缘时叠加朝内速度，避免贴边卡顿）
    exitMul: 1.5,        // 离场向下加速倍率
    firstDelay: 0.9,     // 就位后首次攻击延迟
    fireInterval: [1.56, 2.4],   // 攻击间隔（原 [2.08, 3.2] 减少 25%）
    cubeDmg: 16,         // 正方体伤害
    cubeSpeed: 608,      // 正方体巡航速度（最大速度；原 434 再提高 40%）
    cubeAccel: 6,        // 平滑加速率（spd 向 cruise 收敛，形成平滑速度曲线）
    cubeR: 17,           // 正方体碰撞半径（最大尺寸；原 24 缩小 30%）
    cubeHalf: 15,        // 正方体绘制半边长（最大尺寸；原 21 缩小 30%）
    cubeGrowFrom: 0.5,   // 发射瞬间尺寸 = 最大 × 0.5
    cubeGrowTime: 0.5,   // 从 50% 成长到最大尺寸的时长（s）
    cubeTrailLen: 136,   // 光效拖尾长度（原 68 变长一倍；沿运动反方向的渐变光带）
    bodySpinMin: 0.5,    // 机体本体自旋角速度下限（rad/s，方向随机）
    bodySpinMax: 2.0,    // 机体本体自旋角速度上限（rad/s）
    offsetDeg: 15,       // 常规发射左右偏移角上限（度）
    offsetDegArray: 25,  // 法术阵列在场时偏移角上限（度）
    cubeSpeedMulArray: 1.25,   // 法术阵列在场时正方体速度倍率（+25%）
    rangeMin: 0.7,       // 射程下限 = 到玩家距离 × 0.7
    rangeMax: 1.4,       // 射程上限 = 到玩家距离 × 1.4
    rangeScreen: 0.15,   // 额外 + 15% 屏高
    brakeDist: 46,       // 到达「最大射程 - brakeDist」时进入减速段
    brakeRate: 8,        // 减速段收敛率（快速减慢）
    lingerMin: 0.4,      // 末端原位置停留时长下限
    lingerMax: 0.8,      // 末端原位置停留时长上限
    dimRate: 0.55,       // 黯淡速率（较慢：保证停留期间仍清晰可见）
    glowFloor: 0.35,     // 黯淡下限（不至于全黑）
    fadeTime: 0.18,      // 停留结束后快速渐隐时长
    mainDR: 0.3,         // 受主战机（非僚机）伤害 -30%
    spawnLowLv: 0,       // lv10 前不出现（0 = 不替换，仅图鉴挑战可生成；同 POPIAN）
    spawnHighLv: 0.15,   // lv10 后替换概率
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
   * gunship 3类：紫(mixed 散射+追踪) / 红(aggressive 火力猛瞄准连射) / 金(ring 环形弹幕密集)
    * capital 4类：红(barrage 密集弹幕) / 蓝(lance 瞄准齐射+螺旋；出现时 20% 带护盾，前 5s 虚化不受伤害、炮弹穿过)
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
      { id: 'amber',   color: '#ffbf47', weight: 0.2, skill: 'ring' },   // 金曜（黄）：与其它变体共用统一首射延迟
    ],
    capital: [
      { id: 'crimson', color: '#ff4d6d', weight: 0.5, skill: 'barrage' },
      { id: 'azure',   color: '#4d9fff', weight: 0.3, skill: 'lance' },
      { id: 'crgold',  color: '#ff9a1a', weight: 0.2, skill: 'crgold' },   // 赤金主力舰：橙黄舰体 + 旋转双环 + 三技能（锁定齐射 / 金环扩散清弹 / 双向加速弹幕）
    ],
  };
  const STRIKER_SPEED_MUL = 0.7;   // 2类突击艇速度降低 30%（赤红/烈橙均适用）
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

  // 2类变体出现权重（幽暮按关卡调整 + 其余变体等比缩放补足）：pickVariant 与「数值与机制图鉴」共用
  // 返回 [{ id, w }]，w 为概率（0~1，总和 1）
  function strikerVariantWeights(lv) {
    const list = VARIANTS.striker;
    const duskMul = lv < 10 ? 0.10 : 0.40;
    const duskW = (list.find(v => v.id === 'dusk') || { weight: 0 }).weight * duskMul;
    const otherW = list.reduce((s, v) => s + (v.id === 'dusk' ? 0 : v.weight), 0);
    const scale = otherW > 0 ? (1 - duskW) / otherW : 1;
    return list.map(v => ({ id: v.id, w: v.id === 'dusk' ? duskW : v.weight * scale }));
  }

  // 按权重随机选取变体
  // 幽暮突击艇出现率按关卡调整：Lv10 前为基础权重（12%）的 10%，Lv10 起为 40%；
  // 缩减的概率按比例摊给其余变体，保证幽暮出现率精确达标
  function pickVariant(type) {
    if (type === 'striker') {
      const ws = strikerVariantWeights(state.level);
      let r = Math.random();
      for (const it of ws) {
        if (r < it.w) return VARIANTS.striker.find(v => v.id === it.id);
        r -= it.w;
      }
      return VARIANTS.striker[0];
    }
    const list = VARIANTS[type];
    let r = Math.random();
    for (const v of list) {
      if (r < v.weight) return v;
      r -= v.weight;
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
  const CAPITAL_DESCEND_DR = 0.20;    // 4类主力舰：俯冲减速前（距悬停高度 ≥90px、速度未明显衰减）的减伤（受到伤害 ×0.8）
  const BOSS_LOWFIRE_BONUS = 0.20;    // 玩家火力 Lv1 时对 BOSS 的武器伤害加成（BOSS 受到伤害 ×1.20，逆境补偿）
  const POPIAN_VULN_LV1 = 0.30;       // 火力 Lv1 时对破片的易伤（受到伤害 ×1.30，低火力补偿）
  const POPIAN_VULN_LV2 = 0.10;       // 火力 Lv2 时对破片的易伤（受到伤害 ×1.10）
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

  // 1类侧翼艇：四种行为对应四种颜色（与图鉴一致）
  //   pass(白)：无攻击斜插穿越 | shoot(黄)：追踪射击 | kamikaze(紫)：亡语垂直射击 | moon(红)：赤月定向单射
  const SIDE_BEHAVIOR_COLORS = {
    pass:     '#f0f0f5',   // 白
    shoot:    '#ffd166',   // 黄
    kamikaze: '#c084fc',   // 紫
    moon:     '#ff3b30',   // 赤（赤月侧翼艇）
  };

  // 赤月侧翼艇（红色 1类）：机体为三角形、顶角指向当前航向；
  // 入场 1.8~2.8s 后随机时刻向顶角方向（航向正前方）发射一枚子弹，仅此一次；
  // 未发射即被击毁时 12% 概率触发亡语补射（同方向同弹速）
  const SIDE_MOON = {
    fireDelay: [1.8, 2.8],   // 入场后到发射的随机延时区间（s）
    deathShotChance: 0.12,   // 未发射即被击毁时的亡语补射概率
  };

  // 1类常规生成混合权重：白影 65 / 增生 8 / 黄芒 10 / 紫电 5 / 赤月 5
  // 注意：这是相对权重而非概率（总和 93），由 pickSideSpawn 抽取（各常规 1类编队场景共用）
  const SIDE_SPAWN_W = { pass: 65, prolifera: 8, shoot: 10, kamikaze: 5, moon: 5 };

