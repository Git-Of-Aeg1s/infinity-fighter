// 01-config：全部常量与注册表（画布/战机/僚机/敌机类型/BOSS/掉落率/压力权重）

  console.log('[InfinityFighter] JS build: 20260925-v035-1');   // 【临时】构建标记：验证浏览器缓存是否已刷新，确认后删除

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：02-achievements(15 名) 02-core(9 名) 04-spawn(49 名) 05-boss(24 名) 06-enemy(80 名) 07-player(35 名) 08-entities(32 名) 09-draw-ships(29 名) 10-draw-world(21 名) 11-draw-boss(23 名) 12-ui(33 名) 13-encyclopedia(42 名) 14-main(27 名)
  //


/**
 * 大无垠战机 · Big Infinity Fighter
 * 一个纯 Canvas 2D 实现的雷霆战机风格 Demo。
 *
 * 操作：
 *   W/A/S/D  移动战机
 *   Space/右Ctrl 释放高能爆弹（清空全部敌弹 + 全场敌人受 4000 + 最大血量10% 伤害）
 *   P        暂停 / 继续
 */

  // ---------- 常量 ----------
  const CANVAS_W = 480;
  const CANVAS_H = 792;   // 战场高度（原 720 增长 10%：上边界不动、下边界下移）
  // 主菜单攻击演示屏（画布逻辑坐标）：与主菜单 .demo-screen DOM 边框（top calc(15% - 10.4px) /
  // height calc(51% + 10.4px)，高度补回上移量、底边恒为 66%）严格对齐；演示实体层以此为裁剪矩形（10-draw-world render），
  // 弹道/特效不越出演示屏。上移量 10.4px = 左上角 ? 按钮（.help-entry-btn，26px 高）高度的 40%；改 CSS top 时必须同步此值
  const DEMO_TOP = Math.round(CANVAS_H * 0.15 - 10.4);
  const DEMO_BOTTOM = Math.round(CANVAS_H * 0.66);

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
    dodgeInvulnMul: 0.7, // 闪避触发（哈基米等）的无敌时长系数：正常受击无敌 ×70%
    respawnTime: 1.6,    // 掉命后重生延迟
    enterDur: 0.8,       // 主菜单开局飞入时长：从演示屏站位 smoothstep 滑向出战位（期间操控锁定，主炮照常）
    magnetRadius: 132,   // 水晶吸附半径（基础值；击败旧日之歌后另乘 crystalMagnetMul 1.5 → 198）
    hitRadius: 4,        // 判定点半径：仅机身中心小点被击中才算命中
    hitOffsetY: 4,       // 判定点下移偏移（与白点视觉位置一致）
  };

  // ---------- 水晶系统（掉落改版）：三档 + 巨型 ----------
  // 价值锚点：1 小水晶 = 10 分；中 / 大 / 巨型 = 6 / 36 / 72 单位（60 / 360 / 720 分）
  // r = 拾取判定半径（绘制走 09-draw-ships 的 3D 烘焙精灵，尺寸与 r 匹配）
  const CRYSTAL_TIERS = {
    small: { val: 10, r: 6 },
    mid: { val: 60, r: 10 },
    big: { val: 360, r: 13 },
    giant: { val: 720, r: 16 },
  };
  // 巨型转化概率（按转化前档位逐颗掷定）：小 0.3% / 中 1.8% / 大 10%
  const CRYSTAL_GIANT_CHANCE = { small: 0.003, mid: 0.018, big: 0.1 };
  // 萧杨专属（2026-10-01）：巨型（原石）转化概率额外提升 50%（相对 ×1.5——小 0.45% / 中 2.7% / 大 15%）；
  // 「额外」的 50% 部分转出的原石【不额外加分】：得分仍按转化前档位（不按 giant 720）。
  // 逐颗掷一次 random 三分支：r < base 常规转化（giant 分）/ base ≤ r < base×1.5 萧杨提升转化（原档分）/ 其余不转化。
  // 返回 { tier2, val, giant }：tier2=最终档位，val=该颗得分，giant=是否转化为巨型（原石，供 colorKey/成就/充能判定）。
  function rollCrystalGiant(tier) {
    const base = CRYSTAL_GIANT_CHANCE[tier];
    const r = Math.random();
    const xyBoost = hasPilot('xiaoyang') && r >= base && r < base * 1.5;   // 萧杨提升区间（hasPilot 为函数声明，运行时调用无初始化顺序问题）
    const giant = r < base || xyBoost;
    const t2 = giant ? 'giant' : tier;
    return { tier2: t2, val: CRYSTAL_TIERS[xyBoost ? tier : t2].val, giant };
  }
  // 水晶三色（原青 #39C5BB + 水蓝 #46AAFF + 粉 #FFC0CB；亮绿 / 深蓝已删，结构保留备用）：
  // 粉色仅 BOSS 掉落（2026-09-27 定稿：与部分子弹颜色相近，取消日常生成）——
  // CRYSTAL_COLORS 供 BOSS 掉落三色均分；CRYSTAL_COLORS_NORMAL 供普通掉落双色均分（粉不入池）；
  // 巨型双色（#39C5BB 青 / #FFC0CB 粉）：粉巨型同为 BOSS 专属，普通掉落转巨型固定青
  const CRYSTAL_COLORS = ['#39c5bb', '#46aaff', '#ffc0cb'];
  const CRYSTAL_COLORS_NORMAL = ['#39c5bb', '#46aaff'];
  const CRYSTAL_GIANT_COLORS = ['#39c5bb', '#ffc0cb'];
  // 掉落换算：原始数量 N → { small, mid, big }（价值守恒；巨型在生成时逐颗掷概率转化）——
  // N 每 6 个打包为中槽，2/3 转中（四舍五入，留中心不转化 → 留下的槽摊回 6 小）；
  // 中每 6 个打包为大槽，2/3 转大（留中心不转化 → 留下的中保留）
  // 例：N=110 → 12 中 + 38 小 → 1 大 + 6 中 + 38 小；N=50 → 5 中 + 20 小；N=10 → 1 中 + 4 小
  function convertCrystalDrop(n) {
    const slots = Math.floor(n / 6), rem = n % 6;
    const midSlots = Math.round(slots * 2 / 3);
    let small = rem + (slots - midSlots) * 6;
    let mid = midSlots;
    const bigSlots = Math.floor(mid / 6);
    const big = Math.round(bigSlots * 2 / 3);
    mid -= big * 6;
    return { small, mid, big };
  }

  // 火力 5 级：直射窄弹道，射线数递增；Lv4 为 5 射线 + 半拍后于中间补射 2 发（视觉错开，不增宽）
  // Lv5 即暴走：限时 6s，攻速同 Lv4、弹速大幅提升，十射线（5 个位置各双发）、伤害 ×2.4
  // dmgMul：每发子弹伤害倍率（乘 PLAYER_CFG.bulletDamage）。按各档目标 DPS 反推配平——
  //   攻击间隔 / 弹幕构成保持节奏不变，靠“单发更重”补足 DPS：主炮 DPS ≈ Lv1 420 / Lv2 560 / Lv3 720 / Lv4 960 / Lv5 2400。
  //   （2026-10-02 用户定稿：主炮取消穿透，DPS 上调 + 小怪特化增伤补偿，见 CHAOS_SMALL_DMG_MUL）
  const WEAPON_LEVELS = [
    null,
    { name: 'Lv1', interval: 0.24, dmgMul: 2.8 },      // 3 射线，射速稍慢；单发 33.6
    { name: 'Lv2', interval: 0.19, dmgMul: 2.2167 },   // 4 射线；单发 ≈26.60
    { name: 'Lv3', interval: 0.14, dmgMul: 1.68 },     // 5 射线，射速正常；单发 20.16
    { name: 'Lv4', interval: 0.12, dmgMul: 1.3714 },   // 5 射线 + 半拍补射 2 发；单发 ≈16.46
    { name: 'Lv5', interval: 0.12 },                   // 暴走：限时 6s，攻速同 Lv4，弹速提升，伤害走 BERSERK.dmgMul
  ];
  const CHAOS_SMALL_DMG_MUL = 1.8;   // 混乱将至主炮弹（mainShot）：对非 BOSS / 非 4S（四精英）敌人伤害 +80%（结算见 08-entities）
  const PIERCE_WEAKEN_MUL = 0.5;   // mainPierce 穿透弹（无衰减率弹，如副武器·极夜流光激光）穿透后的伤害倍率：减半（结算见 08-entities）
  const BERSERK = { interval: 0.12, dmgMul: 2.4, rMul: 1.4, duration: 6, spdMul: 1.6 };
  const SHIELD_DURATION = 6;   // 量子护盾持续时间

  // ---------- BOSS：旧日之歌 ----------
  // 第一个 BOSS：累计战斗约 60s 后登场，宽约 60% 屏宽，小幅左右巡航，仅 1 条命
  // 全局规则（适用于所有 BOSS）：技能乱序释放；若连续随机到同一技能，
  // 该技能结束后的冷却降为 20%（-80%）
  // ---------- 关卡流程：刷怪 50s → 旧日之歌 → 击败后 2s 缓冲 + 固定首波（1类长队）+ 4s 观察期 → 刷怪 50s → 黑暗之手 → 同上衔接 → 刷怪 50s → 暴风之眼 → 风暴编织者 → 胜利 ----------
  const BOSS_SEQUENCE = ['song', 'darkhand', 'storm'];   // BOSS 出场顺序（正常流程按序登场；风暴编织者由暴风之眼死后直接召唤，不经警报/刷怪——仍属第三轮，不单独占位）
  // 首轮 BOSS（每局第一个登场的 BOSS）名单：其掉落的水晶对七日澜心量表有额外加成（ARMOR_SKILLS.lanxin.firstBossBonus）。
  // 后续新增"可作为首轮"的 BOSS 时，把 bossId 加入本表即可（现在只有旧日之歌）
  const FIRST_ROUND_BOSSES = ['song'];

  // ---------- 【设计登记】5 轮 BOSS 轮次制（2026-09-29 定稿；第 1~3 轮已于 2026-10-08 按 BOSS_SEQUENCE 固定顺序接线：song / darkhand / storm→storm2，池内随机选取仍未实装） ----------
  // 目标流程：每局共 5 轮「普通敌人 + BOSS」——每轮刷怪 50s、+10 级（BOSS 依次登场于 Lv11 / 21 / 31 / 41 / 51）；
  // 每轮等清场后从该轮候选池随机抽取 1 个 BOSS（仅第 3 轮池内仅 1 个，无随机）；仅击败第五轮 BOSS 后通关。
  // 轮次绑定（待设计 BOSS 以 wip 登记，名字先行，ID 2026-09-29 定稿 / 2026-10-03 增补 5B 澄澈期许、5E 群星之音，晨星调整至 5A）：
  //   第1轮(5A) 旧日之歌(song，已实装) / 晨星(dawnstar) / 悲恸王大顺(griefking)
  //   第2轮(5B) 黑暗之手(darkhand) / 澄澈期许(clearwish)
  //   第3轮(5C) 暴风之眼(storm，已实装) —— 击败后直接召唤风暴编织者(storm2)：两阶段连续战斗，整体为一个轮次
  //   第4轮(5D) 归星(returnstar) / 颂歌(carol)
  //   第5轮(5E) 月亮领主(moonlord，最终 BOSS) / 群星之音(starsong)
  // 实装时：以本表为单一来源做随机选取、替换 BOSS_SEQUENCE 接线；SPAWN_PHASE_TIMES 扩为五段、
  //         SPAWN_PHASE_LEVEL 补至第五轮、胜利判定从 storm2 改到第五轮 BOSS。
  const BOSS_ROUNDS = [
    { round: 1, bossLv: 11, pool: ['song', 'dawnstar', 'griefking'] },
    { round: 2, bossLv: 21, pool: ['darkhand', 'clearwish'] },
    { round: 3, bossLv: 31, pool: ['storm'] },          // storm2 为 storm 的连续二阶段，不单独占轮
    { round: 4, bossLv: 41, pool: ['returnstar', 'carol'] },
    { round: 5, bossLv: 51, pool: ['moonlord', 'starsong'] },
  ];

  const SPAWN_PHASE_TIMES = [50, 50, 50];    // 各阶段刷怪时长（s）：三轮均为 50s（后续轮次与第一轮节奏一致）
  // 关卡由“非 BOSS 期间的有效刷怪时间”驱动（不再随分数增长，切断高分→怪多→更高分的正反馈）：
  // 出怪期间每 5s +1（50s 刷怪期恰好 +10 级）：第一轮 1 级起步 → 50s 后恰好 11 级（首个 BOSS 登场即 11 级）；
  // 第二轮 11 级衔接起步 → 50s 封顶 21 级（黑暗之手登场即 21 级）；第三轮 21 级衔接起步 → 50s 封顶 31 级（暴风之眼警报登场即 31 级）；
  // 停怪/警报/BOSS 战期间冻结，BOSS 后缓冲与首波观察期同样不计入
  const SPAWN_PHASE_LEVEL = [
    { base: 1, step: 5 },
    { base: 11, step: 5 },
    { base: 21, step: 5 },   // 第三阶段：21 级衔接起步，50s 封顶 31 级（暴风之眼轮）；第四阶段（风暴编织者）无刷怪期，越界时取末项兜底衔接
  ];
  const BOSS = {
    name: '旧日之歌',
    w: 288, h: 130,            // 宽度约 60% 屏宽
    hp: 36000,                 // 基准血量（具象；各难度见 hpByDiff）
    hpByDiff: { illusion: 30000, form: 36000, realme: 54000, poem: 82000 },   // 分难度血量表（虚象 / 具象 / 真我 / 诗篇；2026-09-29 已同步总表：第4行血量口径默认真我 54000、第5行诗篇血量 82000）
    score: 0,                  // 击杀分数 0：击杀奖励全部改为掉落 600 颗水晶（怪物属性总表 2026-09 批次）
    hoverY: 120,
    // 航点扫动移动（替代原 sin 定角速左右巡航，见 05-boss）：总体沿当前方向逐段横扫，
    // 接近一侧边界（机体边缘随机余量）后折返；纵向在停留点上下带内逐段随机取点。
    // 有限加速度分轴转向：速度跨段延续、转弯走弧线、抵点不刹停，段速/段加速度逐段随机
    move: {
      topPct: 0.03,              // 纵向活动带上界：停留点上方 3% 屏高（分 BOSS 定义：旧日之歌体型最大、带宽最窄）
      botPct: 0.03,              // 纵向活动带下界：停留点下方 3% 屏高（机体上缘额外钳制不出屏）
      base: 44,                  // 基准速度 px/s（原 sin 巡航峰值 ω·amp = 0.55×80）
      accelMul: 1.6,             // 段加速度 = 基准速度 × 此值 ×(0.75~1.35 随机)（px/s²，随段随机松紧）
      vSpdMul: 0.5,              // 纵轴期望速度 = 段速 × 此值：纵向带窄，纵向为微调轴、较横向放缓
      vAccMul: 0.5,              // 纵轴加速度 = 段加速度 × 此值：横/纵分轴独立计算再综合（防近距离换向卡顿）
      spdMin: 0.7, spdMax: 1.2,  // 每段速度 = 基准速度 × 70%~120%（快慢逐段随机）
      edgeMin: 0.02, edgeMax: 0.18,   // 折返时机体边缘距屏幕边界的随机余量（×屏宽）
      legMin: 0.30, legMax: 0.85,     // 每段推进量 = 剩余横扫距离的 30%~85%（不必然一跨到底）
      turnFrac: 0.35,            // 剩余横扫距离不足全跨度（屏宽 − 2×半宽）的该比例时，本段直奔折返点并换向
    },
    skillCd: 2.2,              // 技能间基础冷却（连中同技能 ×0.2）
    bulletDmg: 14, bigDmg: 32, arcDmg: 18,   // 长条弹 / 大子弹 / 双曲线弹 伤害
    longLen: 26,               // 长条弹长度：略短于 1 类敌机身长
    crashDmg: 60,              // 接触一次性伤害（受击无敌帧照常；暴风之眼走独立持续掉血模型）
  };
  const BOSS_BULLET = { long: '#ff7a45', big: '#c9a0ff', arc: '#a5ffd6' };
  // long：普通长条弹（橙红，带描边）；big：技能2 大子弹；arc：技能5 双曲线弹流（特殊攻击保留幽绿色）

  // ---------- BOSS2：暴风之眼（第二波；第一阶段为白色龙卷风暴） ----------
  const STORM = {
    name: '暴风之眼',
    w: 384, h: 384,            // 占屏宽 80%（CANVAS_W=480）
    hp: 50000,                 // 基准血量（具象；各难度见 hpByDiff）
    hpByDiff: { illusion: 42000, form: 50000, realme: 72000, poem: 120000 },   // 分难度血量表（虚象 / 具象 / 真我 / 诗篇；2026-09-29 已同步总表：真我 72000 / 诗篇 120000）
    score: 9000,               // 击杀分数 9000：本体不掉水晶（旧日之歌 600 / 风暴编织者 900 均为各自掉落，怪物属性总表 2026-09 批次）
    hoverY: 205,               // 风暴中心悬停高度
    skillCd: BOSS.skillCd * 0.5,   // 技能间基础冷却 = 旧日之歌常态间隔（2.2s）的 50%（连中同技能 ×0.2）
    windDmg: 28,               // 技能1 风波伤害（原 30）
    flowR: 18.2,               // （旧风流半宽，已弃用仅留参考）风波取其稍宽值，见 waveHalfW
    waveHalfW: 21,             // 风波竖直半厚（旧风流 18.2 的稍宽版）
    waveSagMin: 32,            // 风波下弯最小幅度（px：弯在下面，形似"（"逆时针旋转 90°，可不对称）
    waveSagMax: 68,            // 风波下弯最大幅度（px；曲率已增大）
    waveDur: 0.55,             // 风波显现后存留时长（瞬时降临、快速渐隐）
    tornadoDmg: 16,            // 风弹伤害（技能2/4/5/6）
    tornadoCrash: 42,          // 大型龙卷碰撞伤害
    pillarDmg: 22,             // 技能3 风柱伤害
    vortexDmg: 16,             // 技能7 涡流风旋碰撞伤害
    pillarW: 67,               // 风柱宽度 ≈ 10% 屏宽
    warnTime: 1.3,             // 区域标记倒计时
    // 技能4 转速浮动（全难度）：80%~120% 随机上下浮动；retarget = 重取目标间隔（s），smooth = 平滑逼近速率（1/s）
    s4SpinFluct: { min: 0.8, max: 1.2, retargetMin: 0.7, retargetMax: 1.3, smooth: 3 },
    tornadoDescend: 55,        // 大型龙卷缓慢下移速度
    tornadoMainDR: 0.5,        // 风团对主武器（主机弹幕）减伤 50%
    tornadoWingVuln: 1.5,      // 风团受到僚机伤害提高 150%（弱点：僚机火力）
  };
  const STORM_WIND = '#dff3ff';   // 风弹/风流配色（风白）

  // ---------- 真我难度：暴风之眼技能改版参数（具象不读取；04-spawn / 05-boss / 08-entities 经 isRealme() 门控） ----------
  // 技能1：脱离技能轮换——每 10~16s 独立释放一轮风波（单轮 3~4 道、随机一侧），不占用技能槽、不影响技能释放间隔
  // 技能2：大型龙卷血量 6000（具象 3600）；受到僚机伤害额外 +150%（与 tornadoWingVuln 1.5 加算，不乘算）
  // 技能3：共 6 轮射击（具象 5 次单发），每轮同时射出 2 个风柱、两者位置至少相差 10% 屏宽；轮间隔 +50%（0.32 → 0.48s）
  // 技能4：总时长 9s；持续期间自身减伤 25%；旋转速度 +40%（20%+20% 加算）、风弹射速 +60%（30%+30% 加算）、
  //   风弹长度 +30%；初始方向顺/逆时针随机，期间随机改变 2~3 次方向（相邻两次 ≥1s，首次改变不晚于前 5s）
  // 技能5：两轮风弹数量 14/11（具象 12/9）；普通风弹 20% 概率射速减慢 20%~50%（强化大风弹不减慢）
  // 技能6：三旋臂基础上追加一组镜像三旋臂——两射击点 35% / 65% 屏宽（关于竖直中轴镜像），初始射向镜像
  //   （armAng2 = π − armAng）且转向相反，任意时刻两组旋臂均关于竖直中轴精确镜像；转速与射击节奏与本体一致；
  //   两组旋臂初始转速 +30%（0.65→0.845、斜率 0.617→0.578），5s 末最大转速 3.735 rad/s 不变
  // 技能7：涡流风旋改为三旋臂（具象双旋臂）；风弹射速 +25%，风旋最大转速 2.3 rad/s（具象 2.625）
  // 技能8「双子旋臂」（仅真我技能池出场）：设风暴半径为 x——在距风暴中心 30%x~80%x 的环内随机选取 2 点
  //   （两点间距 ≥70px），两点绕风暴中心旋转（公转角速度 0.3 rad/s，恒与风暴自转同向）；每点各 50% 概率发出
  //   三旋臂（技能6 具象版：最大转速与射击频率 -20%）或四旋臂（技能4 具象版：中途改变一次转向，
  //   最大转速与射击频率 -30%），持续 6s；【旋臂自转】方向随机且两点独立
  const STORM_SHIP = {
    s1: { min: 10, max: 16 },                  // 技能1 独立释放间隔（s）
    s2: { hp: 6000, wingVulnAdd: 1.5 },        // 技能2 龙卷血量 / 僚机易伤追加（加算）
    s3: { rounds: 6, gap: 0.58, minSepF: 0.10 },   // 技能3 轮数 / 轮间隔（固定 0.58s）/ 每轮两柱最小间距（×屏宽）
    s4: {
      dur: 9, dr: 0.25,                        // 总持续时长（s）/ 持续期间自身减伤
      spinMul: 1.4, speedMul: 1.6, lenMul: 1.3,   // 旋转 +40%（20+20 加算）/ 弹速 +60%（30+30 加算）/ 弹长 +30%
      changesMin: 2, changesMax: 3,            // 持续期间随机改变方向次数
      changeGap: 1,                            // 相邻两次改变方向的最小间隔（s）
      firstChangeBy: 5,                        // 首次改变方向不晚于该时刻（s）
    },
    s5: { counts: [14, 11], slowChance: 0.20, slowMin: 0.5, slowMax: 0.8 },   // 两轮数量 / 减速概率与弹速倍率区间
    s6: { mirror: true, fx: [0.35, 0.65], spin0: 0.845, spinSlope: 0.578 },   // 技能6：追加镜像三旋臂 / 两射击点屏宽比例（左 35% / 右 65%，中轴镜像）/
      // 初始转速 +30%（0.65→0.845）、斜率 0.617→0.578——5s 末最大转速 3.735 rad/s 不变（本体与镜像臂共用）
    s7: { arms: 3, bulletSpdMul: 1.25, spinMax: 2.3 },   // 涡流风旋：三旋臂 / 风弹射速 +25% / 最大转速（具象 2.625）
    s8: {
      dur: 6,                                  // 持续时长（s）
      rMinF: 0.30, rMaxF: 0.80, sep: 70,       // 距风暴中心环带（×风暴半径）/ 两点最小间距（px，绝对值）
      followSpin: 0.3,                         // 绕风暴中心公转角速度（rad/s，恒与风暴自转同向；较风暴自转 1.4 大幅降低）
      // 三旋臂（技能6 具象版）：初始转速 0.65、转速斜率与射击频率 -20%（0.617→0.4936 / 0.10→0.125）
      triple: { fireInt: 0.125, spin0: 0.65, spinSlope: 0.4936 },
      // 四旋臂（技能4 具象版）：恒定转速 1.6 → 1.12（-30%）、射击间隔 0.11 → 0.157（-30%），
      //   中途在 1.5~4.5s 随机时刻改变一次转向
      quad: { fireInt: 0.157, spin: 1.12, changeAtMin: 1.5, changeAtMax: 4.5 },
    },
  };

  // ---------- BOSS3：风暴编织者（风暴消散后现身的雷电飞舰） ----------
  const STORM2 = {
    name: '风暴编织者',
    w: 168, h: 94,             // 判定箱（基础 ×1.2 整体扩大；仍刻意小于模型视觉约 208 ≈ 43% 屏宽）
    hp: 36000,                 // 基准血量（具象；各难度见 hpByDiff）
    hpByDiff: { illusion: 28000, form: 36000, realme: 45000, poem: 70000 },   // 分难度血量表（虚象 / 具象 / 真我 / 诗篇；2026-09-29 已同步总表：真我 45000 / 诗篇 70000）
    score: 0,                  // 击杀分数 0：击杀奖励全部改为掉落 900 颗水晶（怪物属性总表 2026-09 批次）
    hoverY: 150,               // 悬停高度（较风暴中心 205 更靠下，凸显机体形态）
    // 航点扫动移动（与旧日之歌同一系统，见 05-boss；基准速度更快以保持其高机动定位）
    move: {
      topPct: 0.07,              // 纵向活动带上界：停留点上方 7% 屏高（分 BOSS 定义：体型越小 / 机动越高，带越宽）
      botPct: 0.07,              // 纵向活动带下界：停留点下方 7% 屏高（机体上缘额外钳制不出屏）
      base: 181.5,               // 基准速度 px/s（原 sin 巡航峰值 ω·amp = 1.65×110）
      accelMul: 1.6,             // 段加速度 = 基准速度 × 此值 ×(0.75~1.35 随机)（px/s²，随段随机松紧）
      vSpdMul: 0.5,              // 纵轴期望速度 = 段速 × 此值：纵向带窄，纵向为微调轴、较横向放缓
      vAccMul: 0.5,              // 纵轴加速度 = 段加速度 × 此值：横/纵分轴独立计算再综合（防近距离换向卡顿）
      spdMin: 0.7, spdMax: 1.2,  // 每段速度 = 基准速度 × 70%~120%（快慢逐段随机）
      edgeMin: 0.02, edgeMax: 0.18,   // 折返时机体边缘距屏幕边界的随机余量（×屏宽）
      xHalf: 106,                // 横向软墙半宽（px）：模型视觉约 208 宽于 168 判定箱（半宽 104+臂部余量），
                                 // 机体与雷电臂不再微微出屏；未定义时按判定箱半宽（e.w/2）
      legMin: 0.30, legMax: 0.85,     // 每段推进量 = 剩余横扫距离的 30%~85%（不必然一跨到底）
      turnFrac: 0.35,            // 剩余横扫距离不足全跨度（屏宽 − 2×半宽）的该比例时，本段直奔折返点并换向
    },
    crashDmg: 72,              // 碰撞伤害（接触一次性，受击无敌帧照常）
    // ---- 登场动画（重制版）：暴风之眼轰然消散 → 中央雷电风暴轰鸣（电球凝聚）→ 现身汇入机体 ----
    entrance: { dissipate: 0.9, storm: 2.8, reveal: 0.7 },   // 消散 0.9s / 雷暴（电球+闪电）2.8s / 现身 0.7s；
    //   现身段与雷暴尾段重叠 0.7s（不额外占时）——电球+闪电风暴延长至血条展开动画出现时机
    //   （combat 起点，总长 0.9+2.8=3.7s 与旧版一致）；雷暴段 1.6 → 2.1 → 2.8s 的演变：
    //   BGM 在击败暴风之眼后 1.3s 从头重播（restartBGM 0.7/1.3），重播点落在雷暴段中段——
    //   延长雷暴让重播曲的前奏在密集落雷下充分展开，战斗开始（现身完毕）落在重播后 2.4s 的节奏点上
    // ---- 技能（实装：状态机见 05-boss，演出见 11-draw-boss）----
    skillCd: STORM.skillCd * 0.75,   // 技能释放间隔 = 暴风之眼的 75%（玩家暴走时再减半，见 updateBossStorm2）
    berserkDR: 0.30,                 // 受到暴走（Lv5）伤害 -30%（主炮/僚机/斩击经 enemyDamageMul 生效；爆弹为真实伤害不受影响）
    s1Charge: 1.0, s1R: 21, s1BeamDur: 0.9, s1Dmg: 60,   // 技能1：蓝色预警波收缩 0.8s + 0.2s 间隔 → 向下强力电弧激光（固定 60 伤害；光束宽度 +40%）
    s1RingR0: 300, s1RingDur: 0.8,   // 技能1 预警波：起始半径 300px / 收缩到中心用时（完成后再过 0.2s 发射）
    s2RingR0: 200, s2RingDur: 0.8,   // 技能2 同款预警波：起始半径 200px（蓄力 0.2s 后开始收缩，完成后再过 0.2s 发射）
    s2Charge: 1.2, s2Gap: 0.13, s2R: 7, s2BeamDur: 0.45, s2Dmg: 50,   // 技能2：四喷口激涌蓄力 → 随机序依次下射电弧激光
    s3Dmg: 25,                       // 技能3：斜下电弧光束（左右镜像对称，左右边界反弹，弹道呈"<"折线）
    s3SpdMul: 1.458, s3CdMul: 0.3,   // 技能3：弹速倍率（330 基速 ×1.458 ≈ 481，较原 1.8 累计 -19%）；释放后下一次技能释放间隔额外 ×0.3（-70%；真我改走 afterCdMul ×1.3）
    s3ConeHalf: 75 * Math.PI / 180,  // 技能3：朝下方 150° 锥角（竖直向下 ±75°）随机选定发射角
    s3MinSep: 15 * Math.PI / 180,    // 技能3：内外两对光束的最小角距
    s3Len: 268.8,                    // 技能3：光束长度（原 336 的 -20%）
    s4Dmg: 20,                       // 技能4：蛇形瞄准连射 / 雷环子弹（四喷口雷环始终释放，<70% 增至 6 圈；含技能5 打击外扩的雷环）
    s4Spd: 250,                      // 技能4：蛇形雷电长条弹基准速度（雷环爆开初速 = 此速度 × 60~80% 或 120~140% 随机档）
    s4LowShotsMul: 1.5,              // 技能4：70% 血以下蛇形雷条持续 +50%（子弹数 ×1.5）
    s4FlushBoost: 1.3,               // 技能4：射完时补齐/强爆的雷环初速与最终速度额外 +30%
    ringR: 5.4,                      // 雷电圆形子弹半径（带短拖尾）
    ringCruise: 250, ringDecel: 300,   // 雷环子弹：减速下限（初速低于巡航的慢档不再减速）
    s5Warn: 1.2, s5Dmg: 40, s5RMul: 0.8,   // 技能5：雷击预警时长 / 打击伤害 / 区域半径系数（×焦香螺旋桨火环 JIAOXIANG.auraR）
    s5RingDecelMul: 2.5,             // 技能5 落雷外扩雷环的减速倍率（加速度 +150%，更快减慢至巡航速度）
    s6Dmg: 28, s6R: 7,               // 技能6：臂向光束 / 重现光束伤害与半宽（重现光束与臂向光束同长）
    s6GrowDur: 1.333, s6ReplaySpdMul: 0.48,   // 技能6 光束自 0 增长至全长（640）的时间（增长速度 +25% 回调：1.667s → 1.333s）；重现光束发射初速倍率（0.6 → 0.48，-20%）
    s6SpdRampT: 2, s6SpdRampMul: 2,           // 重现光束加速：发射后 2s 内线性加速至初速的 2 倍（满速 0.96 基准 ≈ 原恒速 ×0.6）
    s6PairSep: 15 * Math.PI / 180,   // 技能6：每边同轮两条光束的最小夹角
    s6CdMul: 0.5,                    // 技能6：释放后下一次技能释放间隔 ×0.5（-50%）
  };

  // ---------- 真我难度：风暴编织者独特修正（具象 / 虚象不读取；05-boss 经 isRealme() 门控） ----------
  const STORM2_SHIP = {
    skillCdMul: 1.4,       // 技能释放间隔统一 ×1.4（+40%）：作用于入场后首发延迟与每次技能的基础间隔
                           // （连中同技能 ×0.2 / s2 未连携 ×0.1 / s3 ×0.3 / s6 ×0.5 等额外乘区在其上照常叠加，全体系同步 +40%）
    s1: {
      shots: 5,              // 激光连续射出次数
      beamDur: 0.6,          // 光束持续时长：具象 STORM2.s1BeamDur 0.9s → 0.6s
      fade: 0.15,            // 光束末段渐隐时长（s）：亮起 0.12s → 全亮保持至 0.45s → 0.15s 快速渐隐
                             //   （具象为全程线性衰减，全亮到熄灭等效 0.78s；真我改为短促利落的收束节奏）
      charge2: 0.6,          // 第 2~5 次预警时长（s）：与预警圈收缩时长（ring2Dur）一致——收缩到核心瞬间即发射
                             //   随光束缩短对齐收紧 0.8 → 0.6：须 > gapMax（0.5）保证预警在上一发射完前开始，
                             //   且 ≤ beamDur + gapMin（0.6 + 0.1 = 0.7）保证相邻预警圈互不重叠
      ring2R0: 300,          // 第 2~5 次预警圈起始半径（与首发一致，特效不减弱）
      ring2Dur: 0.6,         // 第 2~5 次预警圈收缩时长（与 charge2 一致；随光束缩短同步收紧）
      gapMin: 0.1, gapMax: 0.5,   // 上一发射完到下一发开火的间隔
    },
    s2: { linkS6Chance: 0.5, noLinkCdMul: 0.4, charge: 1.6, ringDur: 1.2, linkRounds: 1, linkDur: 1.5 },
    //   技能2：50% 同时释放技能6——仅 1 轮重现光束（连携时间轴 1.5s = 0.95 汇聚 + 0.45 预警 + 0.1 缓冲，不按独立释放 3 轮 4.6s 计）；
    //   未连携则下次技能间隔 ×0.4（-60%）；连携时蓄力延长至 1.6s，预警圈收缩时长对应 1.2s
    //   （"蓄力 0.2s 后开始收缩、完成后再过 0.2s 发射"的结构不变——收缩路程同为 200px、用时 0.8s→1.2s，速度变慢）
    s3: { secondMin: 1, secondMax: 1.5, afterCdMul: 1.3 },   // 技能3：第二回释放间隔 1~1.5s；释放结束后下次技能间隔 ×1.3（+30%，替代具象的 ×0.3 短冷却）
    s4: { rings: 8, ringGapMul: 0.6 },             // 技能4：雷环固定 8 圈；生成间隔 ×0.6（-40%）
    s5: { zoneTop: 0.40, volleyGapMul: 0.9 },      // 技能5：落点区域扩展到下方 60%（top = 0.40 屏高）；轰击错峰 ×0.9
    s6: { instantStrikes: 4, strikeDmgMul: 0.5, ringCntMul: 0.5 },   // 技能6：释放瞬间四个雷电喷口处瞬发雷霆打击（无预警、伤害/雷环子弹减半）
  };

  // ---------- 真我难度：旧日之歌技能改版参数（具象不读取；05-boss 经 isRealme() 门控） ----------
  // 技能1：恒 4 条旋转双曲线弹流（初始方向/角速度逐条随机；当前指向水平以上时角速度大幅增加、以下较为减小）；
  //   时长：≥70% 血 +25%、<70% 血 ×3；释放其他技能时概率连携技能1（≥70% 血 20% / <70% 血 30% / <35% 血 50%；
  //   连携不享时长加成，必定只出 2 条流且弧线弹寿命降至 linkedLife）
  // 技能2：7 轮大子弹散射（缺失 10%~20%）；首轮必定慢速，其余随机 3 轮快速（弹速 ×1.4~1.7）
  // 技能3：2 部位锁定标记点 + 2 部位持续追踪玩家（随机分配）；每轮射击间隔 0.9~1.3s 四部位独立随机
  // 技能4：以具象为基准（双管每轮各 1 发、10% 概率齐指玩家）——≥70% 血 270° 散射 + 射速 +100%（间隔 ×0.5）；
  //   <70% 血 360° 单发 + 射速 +200%（间隔 ÷3）+ 每 0.7~1.7s 向下扇形圆弹幕（8~14 发，
  //   弹速 = 乱射长条弹基准速度 ×(60%~90% 或 120%~150%)）
  // 技能5：任意位置可释放（不要求居中、无预约）。六发暗黑子弹全部锁定「玩家释放瞬间的竖直直线」（x = player.x）——
  //   三组（翼 0/1 中间 / 炮 2/3 下方 / 甲 4/5 上方，部件位左右成对）各取一个随机点、同组两颗共用：
  //   翼对 → 玩家高度 ±10% 屏高；炮对 → 玩家上方 10%~30% 屏高；甲对 → 玩家下方 10%~30% 屏高
  //   （上下两对与中间对高度交错，轨迹于玩家竖直线附近交叉成笼）
  // 技能6：预约制——仍仅在水平方向最中心释放（航点直指中线 + 提前计算重组动画启动时机，
  //   抵达中线后驻留至发射，见 startBossSkill / bossTimeToCenterCross）。
  //   三组各随机取偏角 θ ∈ ±75°（下方 150° 扇区），组内左右镜像（π/2∓θ）——左右严格对称；
  //   碰左右壁反弹（每颗最多 3 次，超过后不再反弹、直飞出屏）
  const SONG_SHIP = {
    skillCdMul: 0.55,          // 技能释放间隔 = 具象的 55%（原 40%）
    s1MoveSlow: 0.25,          // 技能1（主技能）释放期间移速 = 常态 ×25%（-75%）：不停顿持续移动，
                               // 减速/提速经转向加速度平滑过渡（具象/虚象与连携技能1仍为停移，见 05-boss）
    centerDeferMax: 2.2,       // 技能6 预约上限（s）：抽中后航点直指中线、直线航程（减去 preT）超过此值
                               //  则放弃预约改抽其余技能，避免技能间隔过长
    aimOffset: 10 * Math.PI / 180,   // 技能2/3 瞄准偏移角：每次瞄准在真实方向 ±10° 内随机偏移
    dark: {
      r: 7, dmg: 36, speed: 430, color: '#c084fc', trail: '#7c3aed', preT: 0.6,
      s5MidBand: 0.10,         // 技能5 翼对（中间一组）目标带：玩家高度 ±10% 屏高
      s5CrossMin: 0.10,        // 技能5 炮/甲对（上/下交叉组）目标带下限：玩家上/下方 10% 屏高
      s5CrossMax: 0.30,        // 技能5 炮/甲对（上/下交叉组）目标带上限：玩家上/下方 30% 屏高
      downSpread: 75 * Math.PI / 180,   // 技能6 射向扇区半角：竖直向下 ±75°（下方 150° 内随机，组内镜像）
      bounceMax: 3,            // 技能6 暗黑子弹墙壁反弹次数上限（超过后不再反弹）
      animR: 180,              // 技能5/6 重组动画：圆球起始半径（自机体四周随机角飞向镶接位）
      animStagger: 0.03,       // 逐球错峰起始（s）
      animDur: 0.42,           // 单球飞行时长（s）——末球 0.15+0.42=0.57s 内到位，早于 preT=0.6s 的发射时刻
    },
    s1: {
      durBase: 1.0,            // 基础时长（与具象一致）
      durHighHp: 1.25,         // ≥70% 血：时长 ×1.25（+25%）
      durLowHp: 3.0,           // <70% 血：时长 ×3（300%）
      streams: 4,              // 恒 4 条双曲线弹流
      emitGap: 0.24,           // 每条流的发射间隔（s）
      speed: 230, arcDmg: BOSS.arcDmg,
      life: 4.5,               // 旋转弧线弹寿命上限（s，主释放）：防止高速旋转弹长期滞留场上
      linkedLife: 3.2,         // 连携释放时的弧线弹寿命（s）：连携必 2 条流 + 短寿命，控制连携叠加的场上滞留量
      fadeTime: 0.28,          // 寿命到期后的消散期（s）：快速减速 + 渐隐 + 同色粒子特效（不再原地闪没）
      angSpread: 1.9,          // 初始方向 = 竖直向下 ± 此弧度（逐条随机）
      spinMin: 0.9, spinMax: 2.2,   // 角速度随机区间（rad/s，方向逐条随机）
      spinUpMul: 2.8,          // 当前指向水平以上（vy<0）：角速度大幅增加
      spinDownMul: 0.55,       // 水平以下：角速度较为减小
      link: { chance: 0.20, chanceLowHp: 0.30, chanceBelow35: 0.50 },   // 连携概率（≥70% / <70% / <35% 血）；连携必定 2 条流、寿命 linkedLife
    },
    s2: { rounds: 7, roundGap: 0.8, missMin: 0.10, missMax: 0.20, fastRounds: 3, fastMin: 1.4, fastMax: 1.7 },
    s3: {
      ivMin: 0.9, ivMax: 1.3,   // 每轮射击间隔（s）：2 锁定 + 2 追踪，四部位独立随机
    },
    s4: {
      fanGapMin: 0.7, fanGapMax: 1.7,     // 扇形圆弹幕间隔（s）
      fanMin: 8, fanMax: 14,   // 每次扇形弹幕发数（8~14）
      fanSlowMin: 0.6, fanSlowMax: 0.9,   // 扇形弹速 = 乱射长条弹基准速度 × 此区间（慢档）
      fanFastMin: 1.2, fanFastMax: 1.5,   // 或快档
    },
  };

  // 全难度通用：BOSS 战斗期间每 6~12s 强制刷新一波 1类（小组/长队各 50%）——
  // 不走压力系统、不受场上存怪影响；该波敌人道具掉率 ×0.3（见 04-spawn spawnBossMinionWave / 06-enemy rollItemDrops）
  const BOSS_MINION_WAVE = { min: 6, max: 12, dropMul: 0.30 };

  // 暴风之眼本体图（透明底台风云盘）：异步预加载，加载完成前矢量风暴照常绘制
  let stormEyeImg = null;
  const stormEyeLoader = new Image();
  stormEyeLoader.onload = () => { stormEyeImg = stormEyeLoader; };
  stormEyeLoader.src = 'assets/storm-eye.webp';

  // 电弧闪电素材组（透明底）：风暴编织者专用——
  //   lightning-1 主电弧（白热蓝辉纤细大闪电）：能量球表面电弧 / 球外放电
  //   lightning-2 细流光弧（纤细蓝弧）：周身闪电风暴的小闪电
  //   lightning-bolt 备用电弧（粗壮闪电）：与主电弧交替出现，避免重复感
  //   lightning-ring 雷电环（黑底蓝色环形雷电）：技能5 周身雷电环 / 雷击预警聚能 / 打击爆闪演出
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
  let lightningImgRing = null;
  const lightningLoaderRing = new Image();
  lightningLoaderRing.onload = () => { lightningImgRing = lightningLoaderRing; };
  lightningLoaderRing.src = 'assets/lightning-ring.webp';

  // 电球序列帧（黑底蓝色雷电球）：风暴编织者登场动画专用——
  //   energy-orb-sheet.webp 为 10×6 网格共 60 帧，运行时按图片实际宽高切分（无需物理拆分文件）；
  //   黑底经 lighter 混合融入画面，未加载完成时登场动画跳过电球层（其余演出照常）
  let energyOrbSheet = null;
  const energyOrbSheetLoader = new Image();
  energyOrbSheetLoader.onload = () => { energyOrbSheet = energyOrbSheetLoader; };
  energyOrbSheetLoader.src = 'assets/energy-orb-sheet.webp';
  const ENERGY_ORB = { cols: 10, rows: 6, frames: 60, fps: 24, baseD: 260, offX: -12, offY: 3 };   // 网格 / 帧率 / 基准直径 / 对齐偏移（素材球在帧内偏右，左移使其对准机体核心 RX=0,RY=3）

  // 依：镰刀清扫素材（透明底大镰刀）：计数充满自动召唤，绕机体旋转（绘制见 10-draw-world drawMeiScythes）；
  // 异步预加载，未加载完成时回退程序化长条镰刀形
  let scytheImg = null;
  const scytheLoader = new Image();
  scytheLoader.onload = () => { scytheImg = scytheLoader; };
  scytheLoader.src = 'assets/scythe_transparent.png';

  // 黑暗之手 BOSS 与四精英形象（透明底人物图）：图鉴预览专用（13-encyclopedia drawEncyPreview wip 分支）；
  // 实体技能未实装，游戏内仍为白色方块占位（WIP_PLACEHOLDER_TYPES）；异步预加载，未加载时图鉴回退白色方块
  let darkhandImg = null;
  const darkhandLoader = new Image();
  // 黑暗之手实心掩码（技能5 暗影导弹雨采样用，2026-10-02 用户定稿「子弹必须严格在贴图上」）：
  // 素材加载后降采样烘焙 alpha 实心网格（56×56，格内 α 均值近似），dhSampleSolid() 据此 rejection 采样
  const DH_SOLID_GRID = 56;
  let dhSolidMask = null;   // { grid, data: Uint8Array }——data[gy*grid+gx]=1 表示该格落在贴图不透明像素上
  darkhandLoader.onload = () => {
    darkhandImg = darkhandLoader;
    try {
      const N = DH_SOLID_GRID;
      const c = document.createElement('canvas');
      c.width = N; c.height = N;
      const g = c.getContext('2d');
      g.drawImage(darkhandLoader, 0, 0, N, N);   // 降采样：格内像素均值近似 α
      const d = g.getImageData(0, 0, N, N).data;
      const data = new Uint8Array(N * N);
      for (let i = 0; i < N * N; i++) data[i] = d[i * 4 + 3] > 110 ? 1 : 0;
      dhSolidMask = { grid: N, data };
    } catch (err) { dhSolidMask = null; }   // 烘焙失败：dhSampleSolid 回退中央躯干带
  };
  // 技能5 导弹生成点采样（返回机体比例位 x/y ∈ -0.5~0.5）：实心格 rejection 采样（≤10 次），
  // 掩码未就绪/连续失败回退中央躯干带（x ±14%、y ±36%，素材实心核心区）——保证技能始终可用
  function dhSampleSolid() {
    if (dhSolidMask) {
      const g = dhSolidMask.grid, d = dhSolidMask.data;
      for (let k = 0; k < 10; k++) {
        const gx = Math.floor(Math.random() * g), gy = Math.floor(Math.random() * g);
        if (d[gy * g + gx]) return { x: (gx + 0.5) / g - 0.5, y: (gy + 0.5) / g - 0.5 };
      }
    }
    return { x: (Math.random() * 2 - 1) * 0.14, y: (Math.random() * 2 - 1) * 0.36 };
  }
  darkhandLoader.src = 'assets/darkhand_transparent.png';
  let puxuefengImg = null;
  const puxuefengLoader = new Image();
  puxuefengLoader.onload = () => { puxuefengImg = puxuefengLoader; };
  puxuefengLoader.src = 'assets/piaoxuefeng_transparent.png';   // 素材文件名为 piaoxuefeng（朴姓读 Piáo），代码键名为 puxuefeng
  let hanxixianImg = null;
  const hanxixianLoader = new Image();
  hanxixianLoader.onload = () => { hanxixianImg = hanxixianLoader; };
  hanxixianLoader.src = 'assets/hanxixian_transparent.png';
  let xiayongImg = null;
  const xiayongLoader = new Image();
  xiayongLoader.onload = () => { xiayongImg = xiayongLoader; };
  xiayongLoader.src = 'assets/xiayong_transparent.png';
  let xinguodongImg = null;
  const xinguodongLoader = new Image();
  xinguodongLoader.onload = () => { xinguodongImg = xinguodongLoader; };
  xinguodongLoader.src = 'assets/xinguodong_transparent.png';

  // 黑暗之手弹幕贴图：素材库水彩风格蛋挞（tart_round_transparent.png 1024×1024 / tart_strip_transparent.png
  // 长条版 / tart_ultra_long_transparent.png 1964×200 超长版）——加载完成后绘制到离屏 canvas 做「绿幕抠绿」烘焙
  //（绿色占优度 → alpha 软阈值渐变，边缘不生硬），产出透明底 tartImg / tartStripImg / tartUltraImg
  // 供 10-draw-world / 11-draw-boss 蛋挞弹分支贴图；未加载/烘焙失败时回退常规渐变弹渲染。
  // （仅游戏运行域内 getImageData：本作经本地服务器运行，file:// 直开会因 ES modules 先行失败，无污染风险）
  function bakeGreenTart(src, onDone) {
    const loader = new Image();
    loader.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = loader.naturalWidth; c.height = loader.naturalHeight;
        const g2 = c.getContext('2d');
        g2.drawImage(loader, 0, 0);
        const im = g2.getImageData(0, 0, c.width, c.height);
        const d = im.data;
        for (let i = 0; i < d.length; i += 4) {
          const greenness = d[i + 1] - Math.max(d[i], d[i + 2]);   // 绿色占优度：>0 表示偏绿（绿幕）
          if (greenness > 42) d[i + 3] = 0;                        // 纯绿幕：全透明
          else if (greenness > 10) d[i + 3] = Math.round(d[i + 3] * (1 - (greenness - 10) / 32));   // 边缘过渡带：按占优度线性降 alpha（软边）
        }
        g2.putImageData(im, 0, 0);
        onDone(c);
      } catch (err) { onDone(null); }   // 烘焙失败回退常规弹渲染，不影响战斗
    };
    loader.src = src;
  }
  let tartImg = null;
  bakeGreenTart('assets/tart_round_transparent.png', img => { tartImg = img; });
  let tartStripImg = null;
  bakeGreenTart('assets/tart_strip_transparent.png', img => { tartStripImg = img; });
  let tartUltraImg = null;
  bakeGreenTart('assets/tart_ultra_long_transparent.png', img => { tartUltraImg = img; });   // 超长蛋挞（1964×200，黑暗之手技能4 爪翼毁灭蛋挞，2026-10-08）

  // BOSS 注册表：测试模式按钮与警报演出由此生成；后续新 BOSS 在此追加
  // wip=true：待设计 BOSS（轮次绑定见 BOSS_ROUNDS）——名字与预定登场登记先行，实体/技能未实装，当前流程不会抽取
  const BOSSES = {
    song: { id: 'song', name: '旧日之歌', lv: 11 },
    // 黑暗之手（2026-09-30 实装）：血量表迁入 DARKHAND 配置块（经 resolveBossHp 读取）——
    // 虚象 40000 / 具象 48000 / 真我 70000 / 诗篇 100000（2026-10-03 用户定稿调整：前三档上调、诗篇不变；待同步总表「黑暗之手」列）。
    // 常态技能：四管炮幕（对齐机制图鉴 t4DrawQuadCannon 演示：四管齐射 + 左右交替小偏角）+ 黑暗涟漪 + 巨大蛋挞；
    // 子弹为常规敌弹（2026-10-01 用户定稿改回；技能3 巨大蛋挞例外 = tartImg 贴图大弹自旋）；已按 BOSS_ROUNDS 接线为第二轮 BOSS（2026-10-08）
    darkhand: { id: 'darkhand', name: '黑暗之手', lv: 21 },
    dawnstar: { id: 'dawnstar', name: '晨星', lv: 21, wip: true },       // 第二轮候选
    storm: { id: 'storm', name: '暴风之眼', lv: 31 },                    // 第三轮（最终轮）BOSS：警报/登场等级 31（2026-10-08 轮次重排，原 21）
    storm2: { id: 'storm2', name: '风暴编织者', lv: 31 },                // 二阶段直召不经警报，lv 仅为登记展示（与暴风之眼同轮 31）
    returnstar: { id: 'returnstar', name: '归星', lv: 41, wip: true },   // 第四轮候选
    carol: { id: 'carol', name: '颂歌', lv: 41, wip: true },             // 第四轮候选
    moonlord: { id: 'moonlord', name: '月亮领主', lv: 51, wip: true },   // 第五轮最终 BOSS
  };
  // 警报演出时长：横杠滑入 → 红色区域与名号展示 → 整体淡出
  const BOSS_WARN = { slide: 0.9, hold: 1.9, fade: 0.5 };
  const BOSS_WARN_TOTAL = BOSS_WARN.slide + BOSS_WARN.hold + BOSS_WARN.fade;
  const BOSS_SPAWN_EARLY = 3;   // BOSS 出场动画提前 3s 开始（警报文字展示期间黑洞 / 风暴就开始形成）

  // 战机注册表：后续新机在此追加，选机页自动生成卡片
  // 绘制约定：核心（座舱白点）世界坐标统一 (0, -14)——僚机站位以 player 中心为锚，核心位置一致
  // 才能保证「核心 ↔ 僚机」相对位置跨机型一致；座舱局部坐标不同的机型【整体平移机体对齐】
  // （机体 + 核心一起动，不单独挪核心），见 09-draw-ships SHIP_CORE_Y / CHAOS_CORE_LOCAL_Y
  const PLANES = {
    chaos: {
      id: 'chaos',
      name: '混乱将至',
      desc: '直线弹道，猛烈输出',
      startWeapon: 1,   // 初始火力等级（Lv1 即三射线；开局 / 重生回落到此等级；BOSS 试炼 / 图鉴挑战固定 Lv4）
      drawScale: 1.15,  // 机体绘制放大 15%（座舱核心与判定点尺寸不变，见 paintShip 逆向补偿）
      coreY: -7,        // 视觉座舱核心相对机体的纵向偏移（混乱将至座舱位于 y-7；装甲环绕图标等对准用）
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
      coreY: -14,               // 视觉机头核心相对机体的纵向偏移（群星之杀核心位于 y-14；装甲环绕图标等对准用）
    },
  };
  let currentPlane = PLANES.starslayer;
  // 选机写入入口：currentPlane / currentWingman 是被全仓库读取的顶层 let，
  // 写操作必须经由本文件的 setter（并行修改约定 + ES modules 下导入绑定只读，均要求如此）
  function setPlane(p) { currentPlane = p; }
  function setWingman(w) { currentWingman = w; }

  // ---------- 难度注册表：虚象 / 具象 / 真我（+「诗篇」wip 占位） ----------
  // 三档难度共用同一套关卡流程与出怪框架，差异通过 mods 修正表落地（怪物数值/行动逻辑/BOSS 技能组等）。
  // 三档均已实装：具象（原基准 + 刷怪量 -20~25%）/ 真我（BOSS 血量 ×1.6 / 暴走减免 / BOSS 战 1类强制波；
  // 旧日之歌 / 暴风之眼技能组深度改版见 SONG_SHIP / STORM_SHIP）/ 虚象（休闲：刷怪 -50~60% 等全套减负规则）。
  // 「诗篇」为下个版本的更高难度占位（wip: true / mods: null）：主菜单展示但不可选，实装时仅需落地 mods 与数值。
  // mods 约定（后续设计按需增删键；所有消费方对缺省键回退基准值，绝不允许 null 直接参与乘算）：
  //   enemyHpMul             敌机（非BOSS）血量倍率
  //   enemyDmgMul            非BOSS敌人伤害倍率（弹幕/碰撞/导弹/灼烧/爆炸等全部结算入口；BOSS 伤害走 bossDmgMul）
  //   enemySpeedMul          敌机移速/弹速倍率
  //   scoreMul               击杀得分倍率
  //   spawnIntervalMul       波次刷新间隔倍率（>1 更稀疏，直接降低总刷怪量；另作用于 4类槽位与 BOSS 战强制波间隔）
  //   pressureCapacityMul    满场压力基准倍率（<1 使压力更早超阈值 → 更早进入慢速刷新，压低同屏数量）
  //   enemyFirstFireAdd      非BOSS首次攻击延迟额外秒数：[min, max] 区间（rand 取值）或固定秒数，0/缺省 = 不加
  //   enemyFireIntervalMul   非BOSS攻击间隔倍率（>1 攻击更稀疏）
  //   dropClassNoReduce      true：1/2类敌人道具掉率的额外减少修正（×0.5 / ×0.75）不再生效
  //   dropClassLowWeaken     true：低火力减免——掉落判定等级（攻击等级+场上升级套件数+4×场上暴走道具数）
  //                          为 1 时 1/2类掉率削减修正失效、为 2 时效果减弱 50%、≥3 不减免
  //                          （1类 ×0.5→×0.75 / 2类 ×0.75→×0.875；BOSS 战 1类波 ×0.3 削减不受影响）
  //   bossMinionDropNoReduce true：BOSS 战 1类强制波道具掉率降低修正（×0.30）不再生效
  //   bossDmgMul             BOSS 所有伤害倍率（含弹幕/接触/区域打击/导弹）
  //   bossFireIntervalMul    BOSS 技能释放间隔倍率（>1 技能更稀疏）
  //   bossNoRepeat           true：BOSS 不会连续释放两次同种技能
  //   invulnMul              玩家所有来源的无敌时间倍率
  //   missileFlatDmg         >0：导弹命中改为固定伤害（取消秒杀/80% 血量规则），null = 保留原规则
  //   missileDmgMin          导弹命中保底伤害（基准 HARBINGER.missileDmgMin = 60），null = 沿用基准（规则仍为 max(保底, 当前血量 80%)）
  //   noWeaponDropOnHit      true：受击不再降低武器等级
  //   bombStart              初始高能爆弹数（基准 1）
  //   bombCap                高能爆弹上限（基准 3 = MAX_BOMBS）
  //   bombBossDmgMul         高能爆弹对 BOSS 的伤害倍率（基准 1）
  //   bossSkillMods          BOSS 技能组修正（{ bossId: { skillId: {...} } }，交由 05-boss 解释）
  //   wip 难度 mods 保持 null——未实装的难度必须回退基准值，绝不允许 null 直接参与乘算。
  const DIFFICULTIES = {
    illusion: {
      id: 'illusion', name: '虚象',
      desc: '轻松难度<br>适合新玩家',   // 一句一行（<br> 分行；"设计中"由卡片角标展示）
      wip: false,
      // 虚象修正表：相对真我（刷怪框架同具象基准）总刷怪量/同屏数量约 -50~60%；
      // 非BOSS 血量 -20%、首次攻击延迟 +0.5~1.8s、攻击间隔 +25%；1/2类与 BOSS 战 1类波的掉率削减修正失效；
      // BOSS 伤害 -40%、技能间隔 +50%、不连发同种技能；玩家无敌 +50%、导弹固定 50 伤害、受击不掉武器等级；得分 ×0.8
      mods: {
        enemyHpMul: 0.8, enemyDmgMul: 1, enemySpeedMul: 1, scoreMul: 0.8, bossSkillMods: {},
        spawnIntervalMul: 2.3,
        pressureCapacityMul: 0.75,
        enemyFirstFireAdd: [0.5, 1.8],
        enemyFireIntervalMul: 1.25,
        dropClassNoReduce: true,
        bossMinionDropNoReduce: true,
        bossDmgMul: 0.6,
        bossFireIntervalMul: 1.5,
        bossNoRepeat: true,
        invulnMul: 1.5,
        missileFlatDmg: 50,
        noWeaponDropOnHit: true,
        bombStart: 1, bombCap: 3, bombBossDmgMul: 1,
      },
    },
    form: {
      id: 'form', name: '具象',
      desc: '挑战难度<br>适合飞机老资历',
      wip: false,
      // 具象修正表：原全 1 基准 + 刷怪减负——波次刷新间隔 ×1.3（总刷怪量/同屏数量约 -23%）
      mods: {
        enemyHpMul: 1, enemyDmgMul: 1, enemySpeedMul: 1, scoreMul: 1, bossSkillMods: {},
        spawnIntervalMul: 1.3,
        pressureCapacityMul: 1,
        enemyFirstFireAdd: 0,
        enemyFireIntervalMul: 1,
        dropClassNoReduce: false,
        dropClassLowWeaken: true,   // 掉落判定等级（攻击等级+场上套件+4×暴走道具）1：修正失效；2：减弱 50%
        bossMinionDropNoReduce: false,
        bossDmgMul: 1,
        bossFireIntervalMul: 1,
        bossNoRepeat: false,
        invulnMul: 1,
        missileFlatDmg: null,
        noWeaponDropOnHit: false,
        bombStart: 1, bombCap: 3, bombBossDmgMul: 1,
      },
    },
    realme: {
      id: 'realme', name: '真我',
      desc: '直面疯狂',
      wip: false,
      // 真我修正表：非BOSS敌人伤害 +35%（enemyDmgMul，覆盖弹幕/碰撞/破片三连发/法术正方体/暴鸰爆炸/焦香灼烧等非BOSS结算入口；
      // 炮火先兆者导弹不吃此加成，改为保底伤害 70——missileDmgMin，规则仍为 max(保底, 当前血量 80%)）；
      // 大型龙卷为暴风之眼召唤物、走 BOSS 侧伤害口径不参与；BOSS 血量 ×1.6；全体 BOSS 受到暴走伤害 -10%（与既有 BOSS 专属暴走减免叠加时取最高）；
      // 高能爆弹初始 0 枚、上限 2 枚、对 BOSS 伤害 -25%；刷怪框架与具象基准一致（spawnIntervalMul 1）；得分 ×1.2；
      // 加血套件节流：任意两次加血套件（普通敌人掉落）至少间隔 8s（hpKitGap）——冷却期内加血环节变为
      // 50%（hpKitBankChance）概率"预触发"（计数、敌人不掉落），冷却结束后击杀的第一个敌人必掉一个（计数清零）
      mods: {
        enemyHpMul: 1, enemyDmgMul: 1.35, enemySpeedMul: 1, scoreMul: 1.2, bossSkillMods: {},
        spawnIntervalMul: 1,
        pressureCapacityMul: 1,
        enemyFirstFireAdd: 0,
        enemyFireIntervalMul: 1,
        dropClassNoReduce: false,
        dropClassLowWeaken: true,   // 掉落判定等级（攻击等级+场上套件+4×暴走道具）1：修正失效；2：减弱 50%
        bossMinionDropNoReduce: false,
        bossDmgMul: 1,
        bossFireIntervalMul: 1,
        bossNoRepeat: false,
        invulnMul: 1,
        missileFlatDmg: null, missileDmgMin: 70,
        noWeaponDropOnHit: false,
        bombStart: 0, bombCap: 2, bombBossDmgMul: 0.75,
        bossHpMul: 1.6,
        bossBerserkDR: 0.10,
        hpKitGap: 8, hpKitBankChance: 0.5,
        princeGaugeFull: 36000,   // 天秀忧郁王子白色量表所需非水晶分数（基准 30000 的真我上浮）
      },
    },
    poem: {
      id: 'poem', name: '诗篇',
      desc: '更高难度<br>波次制刷怪',
      wip: false,
      // 诗篇难度：波次制刷怪（见 WAVE_POEM）+ 全敌人诗篇血量表（POEM_HP，绝对值覆盖）。
      // mods 暂为 null → diffMods() 回退具象基准（enemyHpMul 等不生效）；诗篇血量不走 enemyHpMul 乘区、
      // 由 makeEnemy 直接取 POEM_HP 绝对值。后续实装诗篇专属修正时落地本条目 mods（结构同真我）。
      // ★ 诗篇全部特殊修正的设计目标值与登记规则见仓库根目录《诗篇难度修正.md》——实装/修改诗篇时必须同步维护该文档。
      mods: null,
    },
  };
  let currentDifficulty = DIFFICULTIES.realme;   // 默认难度：真我（主页面与怪物图鉴的难度初始选中项）

  // ---------- 诗篇难度：波次制刷怪改版参数（登记于《诗篇难度修正.md》深度改版 #1） ----------
  // 设计目标值的单一数据源；游戏逻辑经 isPoem() 门控（模式同真我 STORM_SHIP + isRealme()）——
  // 诗篇 wip 不可选期间不生效，图鉴「怪物权重 · 诗篇波次」子页读取本表做设计展示。
  const WAVE_POEM = {
    wavesPerPhase: [10, 10, 10],   // 每阶段波次数（= 阶段内等级数）：第一轮 Lv1~10 / 第二轮 Lv11~20 / 第三轮 Lv21~30（Lv21~30 暂与 Lv20 同强度——常规波次设计进行中，2026-10-08 随 BOSS 轮次重排扩为三段），清完进 BOSS
    clearDelay: [1.2, 2.0],    // 上一波全部击毁/离场到下一波刷出的随机间隔（s）
    capitalWaveChance: 0.20,   // 4类随波附带概率（Lv5 起每波独立判定，走常规主力舰/法术阵列选取；4类槽位通道诗篇关闭）——待调参数，随强化参数批次定稿
    healWaveGap: 2,            // 加血套件波次节流：实际掉落后 N 波内不再掉（每 2 波限 1）
    healPct: 0.35,             // 加血套件回复量 = 当前血量上限 × 此值（四舍五入：陵落 60→21 / 铜皮夏勇 130→46）
    scoreMul: 2,               // 得分倍率（波次制总刷怪量大幅减少的补偿；实装时同步落地 DIFFICULTIES.poem.mods.scoreMul）
    harbingerExtra: [          // 波次附加炮火先兆者阈值表：取 ≤当前等级的最高档；先判 two 再判 one（互斥阶梯）
      { lv: 3,  one: 0.05, two: 0 },      // Lv3 起：5% 多刷 1 台
      { lv: 21, one: 0.10, two: 0 },      // Lv21 起：10% 多刷 1 台（2026-10-08 轮次重排后第三轮 Lv21~30 生效；强度暂与 Lv20 一致，波次设计进行中）
      { lv: 31, one: 0.10, two: 0.05 },   // Lv31 起：10% 多刷 1 台 + 5% 多刷 2 台
    ],
  };
  // 难度写入入口：与 setPlane/setWingman 同约定——顶层 let 的写操作必须经由 setter
  function setDifficulty(d) { currentDifficulty = d; }
  // 当前难度修正表：未实装难度（mods 为 null）回退具象基准，保证框架先行、行为不变。
  // 后续接入点示例：makeEnemy 血量 × diffMods().enemyHpMul、BOSS 技能参数经 diffMods().bossSkillMods 查表。
  function diffMods() { return currentDifficulty.mods || DIFFICULTIES.form.mods; }
  // BOSS 血量解析：优先按难度表 hpByDiff（illusion / form / realme），未配置的难度回退 基准 × 当前难度 bossHpMul
  function resolveBossHp(B) {
    const id = currentDifficulty.id;
    if (B.hpByDiff && B.hpByDiff[id] != null) return B.hpByDiff[id];
    const m = currentDifficulty.mods && currentDifficulty.mods.bossHpMul != null ? currentDifficulty.mods.bossHpMul : 1;
    return B.hp * m;
  }
  // 是否为虚象难度（2026-10-04 新增：黑暗之手技能数值虚象/具象分档经此门控——技能5 弹数等）
  function isIllusion() { return currentDifficulty.id === 'illusion'; }
  // 是否为真我难度（旧日之歌技能改版等深度改写经此门控；参数级修正走 diffMods()）
  function isRealme() { return currentDifficulty.id === 'realme'; }
  // 是否为诗篇难度（当前 wip 占位、不可选；诗篇专属数值分支经此门控）
  function isPoem() { return currentDifficulty.id === 'poem'; }
  // 是否为真我及更高难度档：按 DIFFICULTIES 键序（键序=难度顺序，后续新增更高难度（如下一档「诗篇」）排在真我之后自动归入）。
  // 用于「高难度保持满强度、低难度放宽」类门控（如群星守望低难度概率放宽，见 06-enemy killEnemy）
  function isHardTier() {
    const order = Object.keys(DIFFICULTIES);
    return order.indexOf(currentDifficulty.id) >= order.indexOf('realme');
  }
  // 玩家无敌时间难度倍率（虚象：所有来源的无敌时间 +50%；与装甲 invulnMul 乘算，见 ARMORS）
  function invulnDiffMul() {
    const m = diffMods().invulnMul;
    return (m != null ? m : 1) * (currentArmor.invulnMul || 1);
  }
  // BOSS 伤害难度倍率（虚象：BOSS 造成的所有伤害 -40%）
  function bossDmgMul() { const m = diffMods().bossDmgMul; return m != null ? m : 1; }
  // 非BOSS敌人伤害难度倍率（真我：所有非BOSS敌人伤害 +35%；大型龙卷按暴风之眼 BOSS 侧口径不吃此倍率）
  function enemyDmgMul() { const m = diffMods().enemyDmgMul; return m != null ? m : 1; }
  // 2类突击艇停留时长难度倍率（诗篇：默认档与全部编队档 ×2）——mods.strikerHoldMul，缺省回退 1
  function strikerHoldMul() { const m = diffMods().strikerHoldMul; return m != null ? m : 1; }
  // 2类「2*7」无停留直通：越过前锋停留线后的速度保留比例（基准 0.8；诗篇 0.6）——mods.strikerNoHoldSpdMul，缺省回退 0.8
  function strikerNoHoldSpdMul() { const m = diffMods().strikerNoHoldSpdMul; return m != null ? m : 0.8; }
  // （坚垒护卫艇能量盾减伤 strikerFortressDR 已于 2026-10-03 移除：改为单纯高血量（2026-10-08 用户定稿 HP 800，诗篇走 POEM_HP 独立覆盖），
  //   无常规/诗篇减伤；《诗篇难度修正.md》#4 条目同步标注废弃）
  // （warGhostFanRange 已删除：技能1 由扇形范围斩击改为双刃斩击（2026-10-02），扇形半径/诗篇修正失去对象——
  //   《诗篇难度修正.md》#6 条目同步标注废弃）

  // ---------- 装甲系统 ----------
  // 主界面选择、整场战斗生效的机体装甲。效果键位（按需扩展）：
  //   maxHpAdd     每条命 HP 加成（PLAYER_CFG.maxHp = 100 基准；resetGame / 重生结算）
  //   invulnMul    受击 / 重生无敌时间倍率（并入 invulnDiffMul，与难度倍率乘算——天枢圣卫）
  //   clearChance  击杀 1/2/3/4 类敌人时清除最近一颗敌弹的概率（群星守望；
  //                低难度概率 ×1.5 上限 100%，见 06-enemy killEnemy；无内置冷却）
  // 其余装甲效果（最终壁垒免死 / 祈星减伤 / 澄月暴走护盾 / 七日澜心量表技能）为行为型逻辑，
  // 分别挂钩 07-player（damagePlayer / pickupKit / pickupBerserk / updatePlayer）与 06-enemy（killEnemy / BOSS 接触）。
  // 新增装甲只需在注册表加条目：主界面卡片自动生成（12-ui buildArmorCards）。
  // brief  = 主菜单卡片的简短文案（玩家向）；desc = 数值与机制图鉴「护甲」页的详细数值文案
  // 条目顺序 = 展示顺序（主菜单卡片与图鉴护甲页均按注册表键序生成）：
  //   第一排：群星守望（默认，无脑最适合新人）/ 铜皮夏勇 / 祈星 / 洄
  //   第二排：七日澜心 / 最终壁垒 / 天枢圣卫 / 澄月；第三排：炽心
  const ARMORS = {
    watch:    { id: 'watch', name: '群星守望', glyph: '◈', color: '#7ce7ff',
      default: true,   // 默认装甲（图鉴「护甲」页据此标注"（默认）"；默认项经 currentArmor 初始化）
      clearChance: { 1: 0.05, 2: 0.08, 3: 0.15, 4: 0.50 },
      clearChanceBoss: { 1: 0.40, 2: 0.40, 3: 0.40, 4: 0.40 },   // BOSS 战期间的概率表，且改为清除该敌人发出的全部在场射弹
      brief: '击毁敌机时概率消除弹幕',
      desc: '击杀 1/2/3/4 类敌人时<br>5%/8%/15%/50% 立刻清除<br>一颗离自身最近的敌方子弹<br>BOSS 战期间：统一 40%，<br>且改为清除该敌人发出的全部在场射弹<br>真我以下难度：清除概率 ×1.5（上限 100%）' },
    tongpi:   { id: 'tongpi', name: '铜皮夏勇', glyph: '❖', color: '#66e39a',
      maxHpAdd: 30, brief: '夏勇皮糙肉厚战机血量提升',
      desc: '血量提高 30<br>（100 → 130）' },
    qixing:   { id: 'qixing', name: '祈星', glyph: '✧', color: '#b49bff',
      halveChance: 0.3, halveChanceBig: 0.6,   // 伤害减半判定概率（单次伤害 &gt;40 时用后者）
      brief: '受伤时概率使该次伤害减半',
      desc: '受到伤害时 30% 概率伤害减半<br>单次伤害 &gt;40 时概率提升到 60%' },
    hui:      { id: 'hui', name: '洄', glyph: '∞', color: '#39C5BB', sym: true,   // sym：∞ 字形换 Corbel 渲染（Segoe UI 下右环偏大）
      regenInterval: 2, regenHp: 1,   // 恢复间隔（s）/ 每次恢复量
      bossKillLostPct: 0.35,            // 击败 BOSS：回复 35% 已损失生命
      brief: '缓慢回复血量击败BOSS回血',
      desc: '每 2 秒恢复 1 生命<br>击败 BOSS 时回复 35% 已损失生命' },
    lanxin:   { id: 'lanxin', name: '七日澜心', glyph: '❀', color: '#FFC0CB',
      brief: '收集水晶以充能结晶护盾，按F释放',
      desc: '收集水晶填充左下角量表（按角度）<br>首轮 BOSS 掉落的水晶对量表收益 +700%<br>BOSS 战期间击杀敌人直接充能 1%~3%<br>按 F 触发：结晶护盾环绕自身 6s<br>（量子护盾样式+晶体网格，护盾期间量表停计<br>消失时清除周围 250px 内所有敌弹并发出小范围冲击波）' },
    bulwark:  { id: 'bulwark', name: '最终壁垒', glyph: '⛨', color: '#ffb545',
      brief: '受到致命伤害时不死且短暂无敌，仅一次',
      desc: '每条命一次：生命值减为 0 时不死<br>（含导弹等强制击杀）恢复 1 点生命、<br>获得 5s 无敌（淡金菱形环绕，不降低攻速）<br>触发瞬间核心处护甲图标扩散渐隐<br>无敌结束时清除周围 120px 内敌弹<br>菱形微微扩大渐隐并扩散金环' },
    tianshu:  { id: 'tianshu', name: '天枢圣卫', glyph: '⬡', color: '#4dd0ff',
      invulnMul: 1.6,   // 受击 / 重生等常规无敌时长倍率
      guardCycle: 20, guardWindow: 10,   // 圣守周期：无敌结束后起算每 20s 展开持续 10s 的「圣守窗口」；窗口内受击在结算前免除并触发常规受击无敌（窗口/无敌期间周期不计时，等效 30s 一轮）
      hexWhite: '#ffffff',   // 圣守窗口 ⬡ 环绕图标颜色：白色（窗口开启/过期/常驻环绕统一用色）
      brief: '无敌时间提升，周期免除一次伤害',
      desc: '从所有来源获得的无敌时间 +60%<br>无敌期间免疫破片导弹的<br>"无视无敌"穿透<br><hr>每 20s（无敌结束后起算）展开<br>持续 10s 的「圣守窗口」：窗口内<br>受到伤害时在结算前触发无敌<br>（常规受击无敌时长），该次伤害完全免除<br>窗口期间与无敌期间周期均不计时<br>（窗口关闭或触发消耗后重新计时）' },
    chengyue: { id: 'chengyue', name: '澄月', glyph: '◉', color: '#6fe3ff',   // ◉ 满月+光环（原☾月牙不对称，改为对称满月）
      chance: 0.15, bossChance: 0.40,   // 暴走触发（新触发）与暴走续时均判定一次
      shieldDur: 6,   // 护盾时长（s）：与通用量子护盾一致（不再缩短）
      brief: '触发暴走时概率获得量子护盾',
      desc: '触发暴走时 15% 概率获得量子护盾<br>暴走续时也判定一次<br>BOSS 战中概率提升到 40%<br>（每个 BOSS 限一次）<br>护盾时长与量子护盾一致（6s）' },
    chixin:   { id: 'chixin', name: '炽心', glyph: '❂', color: '#ff7a18',
      burnR: 108, burnDmg: 10, burnInterval: 0.125,   // 火环半径 / 每跳伤害 / 灼烧间隔（s）
      burnTagMul: 1.5,   // 灰色 / 黑色标记敌人（enemyColorTags 含 'gray'/'black'：灰黑系特殊无人机/炮兵、幽暮与黑色 BOSS）灼烧增伤倍率
      brief: '战机周身围绕火环，灼烧接近的敌人',
      desc: '自身环绕焦香同款火环（半径 108，淡）<br>免疫焦香火环伤害与寒霜减速<br>火环灼烧周围敌人：每 0.125s 10 伤害<br>对灰 / 黑标记敌人伤害 +50%' },
    standard: { id: 'standard', name: '标准护甲', glyph: '▣', color: '#9aa7b8', noEffect: true,
      brief: '标准制式护甲<br>无效果',
      desc: '标准护甲。<br>没有任何效果。' },
  };
  let currentArmor = ARMORS.watch;   // 默认装甲：群星守望（无按钮无资源管理、击杀即触发清弹，对新最无脑直观）
  // 装甲写入入口：与 setPlane/setWingman/setDifficulty 同约定——顶层 let 的写操作必须经由 setter
  function setArmor(a) { currentArmor = a; }
  // 装甲效果读取（键缺省安全回退；战斗逻辑经这些函数取值，不直接读 currentArmor 字段）
  function armorMaxHp() { return PLAYER_CFG.maxHp + (currentArmor.maxHpAdd || 0); }

  // 敌机类别映射（群星守望按击杀类别清除敌弹；未列出的类型——BOSS / 龙卷等——不触发）
  const ENEMY_CLASS = {
    side: 1, prolifera: 1, escort: 1,
    striker: 2, fashiA1: 2, fashiMatrix: 2, popian: 2, douzhi: 2,
    gunship: 3, harbinger: 3, hanshuang: 3, weilong: 3, yu4: 3, anvil: 3, baoling: 3, jiaoxiang: 3, fashiA2: 3,
    capital: 4, fashiArray: 4, warMatrix: 4,
    // 诗篇新敌占位（wip）：按其设计类别归入（黑暗之手四精英在 PILOTS.mei.elites 单独按 4 类计并 ×4）
    popianU: 2, sponsor: 2, sponsorDeluxe: 2,
    baolingG: 3, pulseMatrix: 3, unreal: 3,
    warGhost: 4, puxuefeng: 4, hanxixian: 4, xiayong: 4, xinguodong: 4,
  };

  // 怪物等级（类别 + 类内强度档 A~F，A 最弱）：为刷新波次重构打的元数据基础。
  //   key = 图鉴条目 id（与 13-encyclopedia ENCY_DATA 键一致，可区分同 type 不同涂装/变体）；
  //   首位类别数字必须与 ENEMY_CLASS 对应类型的类别一致（本表条目粒度、ENEMY_CLASS 为 type 粒度，两表靠本注释约束同步）。
  //   特殊档位：R=奖励机单列（无攻击功能怪，不入强度梯度）；
  //   BOSS 为 5 系列，轮次对应 BOSS_ROUNDES（五轮设计稿单一来源）——5A 第1轮 旧日之歌 / 5B 第2轮 黑暗之手·晨星 / 5C 第3轮 暴风之眼 /
  //   5D 第4轮 归星·颂歌 / 5E 第5轮 月亮领主（晨星/归星/颂歌/月亮领主未实装，实装时按此入表）/ 5S 被召唤（Summoned，风暴编织者由暴风之眼死后直接召唤）；
  //   4S=黑暗之手四精英 + 张华&张策（特殊精英档，与图鉴 desc 称谓一致；2026-10-05 由 4F 改 4S）。
  //   衍生条目（卫护飞船 escort / 大型龙卷 tornado）不设等级（无 key，图鉴自动不显示）。
  //   「倾向生成轮次」不进等级——那是波次编排数据，归刷新波次重构的波次表。
  const ENEMY_GRADES = {
    // 1类（虚象级）
    side_pass: '1A', side_shoot: '1A', side_moon: '1A', side_swirl: '1A',
    side_kamikaze: '1B', prolifera: '1B',
    // 2类（具象级）
    striker_crimson: '2A', striker_amber: '2A', striker_azure: '2A', striker_violet: '2A', striker_white: '2A', striker_fortress: '2A',
    striker_dusk: '2B', popian: '2B', fashiMatrix: '2B',
    fashiA1: '2C', popianU: '2C',
    // 奖励机单列档（R=Reward）
    douzhi: '2R', sponsor: '2R', sponsorDeluxe: '2R',
    // 3类（真我级）
    gunship_violet: '3A', gunship_crimson: '3A', gunship_amber: '3A', gunship_orange: '3A', gunship_cyan: '3A',
    harbinger: '3B', hanshuang: '3B', baoling: '3B', yu4: '3B', pulseMatrix: '3B',
    anvil: '3C', baolingG: '3C', jiaoxiang: '3C', fashiA2: '3C',
    unreal: '3D',
    weilong: '3C',
    // 4类（诗篇级）
    capital_crimson: '4A', capital_azure: '4A', capital_crgold: '4A',
    fashiArray: '4B',
    warMatrix: '4B',
    warGhost: '4C',
    puxuefeng: '4S', hanxixian: '4S', xiayong: '4S', xinguodong: '4S', zhangzhang: '4S',   // 黑暗之手麾下四精英 + 张华&张策：S 档（特殊精英强度，2026-09-30 由 D 档改 F 档、2026-10-05 由 F 档改 S 档——独立 4S 敌人，不再属衍生级）
    // BOSS（长歌级，5 系列，轮次对应 BOSS_ROUNDES）
    boss: '5A', boss_darkhand: '5B', boss_storm: '5C',
    boss_storm2: '5S',
  };
  // 等级查询：无 key 返回 null（escort / tornado 等衍生条目不设等级）
  function enemyGrade(entryId) { return ENEMY_GRADES[entryId] || null; }

  // 装甲技能（量表型，按 F 触发；后续新技能在此注册，逻辑见 07-player triggerArmorSkill）：
  //   label 计量表提示 / color 量表与护盾颜色 / dur 技能持续（s）/ clearR 结束消弹半径（px）
  //   gaugeCrystalScore 填满量表所需的水晶分数——量表按收集到的水晶【得分】等比填充：
  //   普通水晶 +10、巨型水晶 +500，后续水晶系统重构新增的水晶类型只需带各自 val，
  //   拾取处（08-entities armorSkillGain）自动按得分等比计入，无需改动
  const ARMOR_SKILLS = {
    // firstBossBonus：首轮 BOSS（见 FIRST_ROUND_BOSSES）掉落的水晶对量表的额外收益倍率（+700% → 总收益 ×8）
    // BOSS 战期间另有击杀充能（1%~3%/杀，见 06-enemy killEnemy），不依赖水晶拾取
    lanxin: { label: '澜心', color: '#FFC0CB', dur: 6, clearR: 250, gaugeCrystalScore: 5000, firstBossBonus: 8 },
  };

  // ---------- 群星之杀：空间斩击参数 ----------
  // 机头直射一条较细淡白锁定光束（不造成伤害），选中最靠近玩家的主目标；
  // 每隔 interval 秒召唤一道空间斩击：以主目标为中心的矩形判定区（沿斩击方向），
  // 区域内所有敌人受全额伤害（无主/副目标之分）。
  // 对 BOSS 伤害提升 bossBonus（无视主/副目标之分，命中几个 BOSS 各自加成）；
  // 单体斩击：本次斩击仅命中 1 个非 BOSS 敌人时，伤害提升 soloBonus（攻击间隔不受影响）。
  // 斩击方向：与竖直方向夹角 5~20° 随机，左下→右上 / 右下→左上 逐次交替。
  // 暴走（Lv5）：每次连续斩击 slashes 次（间隔 slashGap），攻击间隔略微降低。
  // DPS 配平（主目标）：Lv1 330 / Lv2 450 / Lv3 600 / Lv4 880 / Lv5 2200。
  const STARSLAYER = {
    beamHalfW: 4.4,          // 锁定光束半宽（稍宽）
    beamColor: '#eaf2ff',    // 淡白色
    selectHalfW: 26,         // 光束选中判定的水平半宽（机头正上方走廊）
    slashFxTime: 0.45,       // 单次斩击特效存留时长（扫 cut + 渐隐）
    slashGapBase: 0.10,      // 暴走三连斩每击间隔
    slashAngleMin: 5,        // 斩击与竖直方向夹角（度）随机下限
    slashAngleMax: 20,       // 夹角上限
    slashLenMul: 2.3,        // 矩形半长 = slashR × 此系数（沿斩击方向；Lv3/4/5 由 levels 表显式 halfLen 覆盖）
    slashWMul: 0.70,         // 矩形半宽 = slashR × 此系数（垂直斩击方向，"宽度较宽"；Lv3/4/5 由 levels 表显式 halfW 覆盖）
    bossBonus: 0.20,         // 对 BOSS 伤害 +20%
    soloBonus: 0.25,         // 单体斩击（仅命中 1 个非 BOSS 敌人）伤害 +25%
    levels: {
      1: { interval: 1.30, dmg: 429, slashR: 46 },               // 429/1.30 = 330（判定：2.3R × 0.7R = 105.8 × 32.2）
      2: { interval: 1.20, dmg: 540, slashR: 50 },               // 540/1.20 = 450（判定：115 × 35）
      3: { interval: 1.10, dmg: 660, slashR: 54, halfLen: 123, halfW: 37 },   // 660/1.10 = 600（判定显式给定）
      4: { interval: 1.00, dmg: 880, slashR: 58, halfLen: 130, halfW: 39 },   // 880/1.00 = 880（判定显式给定）
      5: { interval: 0.90, dmg: 660, slashR: 64, slashes: 3, halfLen: 144, halfW: 43 },   // 3×660/0.90 = 2200（判定显式给定）
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
      offsetX: 48, offsetY: -14,   // 前侧站位（外移加大横向距离，本体+盾整体往右上移动；微微下移 -20 → -14）
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

  // ---------- 副武器系统：注册表与参数 ----------
  // 副武器是主机体直接挂载的第二种武器（区别于僚机的独立机体）：主菜单选择、整场战斗生效，
  // 与主炮各自独立冷却、同时自动开火（BOSS 警报 / 入场演出等停火期一并锁住，见 07-player updateSubWeapon）。
  // 注册表键序 = 主菜单卡片展示顺序。brief = 主菜单卡片简短文案；desc = 数值与机制图鉴「副武器」页详细文案。
  // 数值定位：主炮 Lv4 裸 DPS ≈ 800~880、僚机双机合计 ≈ 140~230；副武器取 50~110 区间，
  // 以"弹道形状 / 发射方式"提供差异化手感，而非单纯堆数值。
  // fire.kind：jixing=极夜流光（标记直射激光）/ daodan=捣蛋来袭（大狗同款导弹）/ feijian=无界飞剑（全屏均分分裂连射）/ xinring=辛国栋之怒（恒速穿透灼烧火环）
  // 副武器矢量图标（iconSvg，同 PILOTS.higanbanaSvg 路线）：内联 SVG 字符串——
  // 渐变/配色在 SVG 内部固化（贴合弹体涂装），外层 span 的 currentColor（注册色）仅承担 .glyph-svg 辉光。
  let subGradSeq = 0;   // 渐变 id 计数：同一页面多处渲染图标时保证 defs id 唯一
  function flameRingSvg() {   // 辛国栋之怒「焰环」：环身焰舌，玫红→粉渐变贴合弹体涂装（用户 2026-09-27 定稿）
    const id = 'xrGrad' + (++subGradSeq);
    return '<svg viewBox="-20 -20 40 40" xmlns="http://www.w3.org/2000/svg">'
      + '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0" stop-color="#ff9ecf"/><stop offset="1" stop-color="#e63cbe"/></linearGradient></defs>'
      + '<circle cx="0" cy="3" r="10.5" fill="none" stroke="url(#' + id + ')" stroke-width="3.5"/>'
      + '<g fill="url(#' + id + ')">'
      + '<path d="M0,-7.5 C2.6,-10.5 2,-14 0,-17 C-2,-14 -2.6,-10.5 0,-7.5 Z"/>'
      + '<path d="M-6.5,-5.8 C-5.2,-9 -6.4,-11.6 -8.2,-13.2 C-9.3,-10.4 -8.8,-7.4 -6.5,-5.8 Z"/>'
      + '<path d="M6.5,-5.8 C5.2,-9 6.4,-11.6 8.2,-13.2 C9.3,-10.4 8.8,-7.4 6.5,-5.8 Z"/>'
      + '</g></svg>';
  }
  function dogMissileSvg() {   // 捣蛋来袭「狗耳导弹」：大狗同款导弹 + 折角狗耳（「捣蛋/导弹」谐音，用户 2026-09-27 定稿）；白蓝 #9fd0ff 同先兆者导弹涂装。
    // 整体 translate(0,-4.5)：弹体墨迹（耳 -8.4 ~ 焰尾 +17.5）视觉重心偏下 +4.5，上移后墨迹居中于 em 框（装备框 30px 对位校正）
    return '<svg viewBox="-20 -20 40 40" xmlns="http://www.w3.org/2000/svg">'
      + '<g transform="translate(0,-4.5)">'
      + '<g fill="currentColor">'
      + '<path d="M-3.2,-8.4 L-8,-6.4 L-4.4,-2.8 Z"/>'
      + '<path d="M3.2,-8.4 L8,-6.4 L4.4,-2.8 Z"/>'
      + '<rect x="-3.4" y="-6" width="6.8" height="13"/>'
      + '<circle cx="0" cy="-6" r="3.4"/>'
      + '<path d="M-3.4,4 L-8.2,11.5 L-3.4,9.4 Z"/>'
      + '<path d="M3.4,4 L8.2,11.5 L3.4,9.4 Z"/>'
      + '</g>'
      + '<path d="M0,12.5 L0,17.5" stroke="currentColor" stroke-width="2" opacity=".75" stroke-linecap="round" fill="none"/>'
      + '<circle cx="0" cy="-1.5" r="1.6" fill="#ffffff" opacity=".6"/>'
      + '</g></svg>';
  }

  function polarStarSvg() {   // 极夜流光「北极星」：四芒极星 + 地平弧——「极」之指向星，呼应标记锁定（用户 2026-09-27 选定 C）
    return '<svg viewBox="-20 -20 40 40" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M-13,11 A15,15 0 0,1 13,11" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".5" stroke-linecap="round"/>'
      + '<g fill="currentColor">'
      + '<path d="M0,-16 L1.7,-1.7 L16,0 L1.7,1.7 L0,16 L-1.7,1.7 L-16,0 L-1.7,-1.7 Z"/>'
      + '<path d="M0,-16 L1.7,-1.7 L16,0 L1.7,1.7 L0,16 L-1.7,1.7 L-16,0 L-1.7,-1.7 Z" transform="rotate(45) scale(.48)"/>'
      + '</g></svg>';
  }
  function swordSvg() {   // 无界飞剑「单剑」：按已定稿字形 † 转绘矢量（剑尖朝上 + 剑格 + 剑柄圆镡），统一四副武器矢量渲染口径（尺寸/对齐一致）
    return '<svg viewBox="-20 -20 40 40" xmlns="http://www.w3.org/2000/svg">'
      + '<g fill="currentColor">'
      + '<path d="M0,-18 C1.1,-13 1.6,-8 1.6,-2 L1.6,2 L-1.6,2 L-1.6,-2 C-1.6,-8 -1.1,-13 0,-18 Z"/>'
      + '<rect x="-6.5" y="2" width="13" height="2.2" rx="1.1"/>'
      + '<rect x="-1.2" y="4.4" width="2.4" height="7.6"/>'
      + '<circle cx="0" cy="14.4" r="2.4"/>'
      + '</g>'
      + '<path d="M0,-13.5 L0,0" stroke="#ffffff" stroke-width=".8" opacity=".45" fill="none"/>'
      + '</svg>';
  }

  const SUB_WEAPONS = {
    // 全部四款随火力等级缩放（fire.levels 按玩家火力 1~4 / 暴走 5 取参；数值与机制图鉴「副武器」页对比表格直接读取本表，
    // 调整数值只需改这里）。攻速远低于主炮（主炮 Lv4 间隔 0.12s，副武器间隔 1~3s）。
    jixing: {
      id: 'jixing', name: '极夜流光', glyph: '⭘', iconSvg: polarStarSvg(), color: '#6fb8ff',   // iconSvg = 北极星矢量（用户 2026-09-27 选定 C，渲染见 .glyph-svg）：四芒极星 + 地平弧——「极」之指向星呼应标记锁定；glyph ⭘ 保留作字形回退（原❄雪花与激光无关；⌖ 试行弃用）
      brief: '发射追踪激光',
      desc: '机体左右两个发射点各射出白色为主、淡蓝流动的粗激光<br>发射前标记目标位置后直射（飞行中不再改变方向）<br>非 BOSS 战：各发射点独立锁定离自己最近的敌人<br>BOSS 战：两点共同锁定 BOSS；无合格目标时朝正前方<br>可穿透 1 个非 BOSS 且非 4类敌人<br>对 4类敌人（主力舰 / 法术阵列）伤害 +50%<br>暴走（Lv5）：新增 2 条光束（生成点略外移）、金色流光<br>（具体数值见下方对比表格）',
      fire: {
        kind: 'jixing',
        // 出膛初速 = 300（基准速 600 的一半），0.1s 内加速至满速：满速 = 基准 × 1.84 ≈ 1102（原 2.16 上限再 -15%）
        // → accel = (1102 − 300) / 0.1s ≈ 8020；长度 115，出手初始光束长 40（二次缓动长到全长）；
        // 视觉宽度 ≈ 风暴编织者雷电长条弹 × 1.25（r 5.75 → 宽 11.5）
        speed: 600, accel: 8020, len: 115, r: 5.75, growDur: 0.25, growLen0: 40,
        capVuln: 1.5,   // 对 4类敌人（capital / fashiArray）的增伤倍率
        levels: {   // 单发伤害 = DPS × 间隔 ÷ 激光数（DPS 规格：120 / 150 / 180 / 220 / 440）
          1: { count: 2, interval: 1.07, dmg: 64.2 },
          2: { count: 2, interval: 1.0, dmg: 75 },
          3: { count: 2, interval: 0.86, dmg: 77.4 },
          4: { count: 2, interval: 0.71, dmg: 78.1 },
          5: { count: 4, interval: 0.5, dmg: 55 },   // 暴走：4 条激光（2 常规 ±16 + 2 外移 ±32）
        },
      },
    },
    daodan: {
      id: 'daodan', name: '捣蛋来袭', glyph: '▲', iconSvg: dogMissileSvg(), color: '#9fd0ff',   // iconSvg = 狗耳导弹矢量（用户 2026-09-27 定稿，渲染见 .glyph-svg；「捣蛋/导弹」谐音 + 大狗来源）；glyph ▲ 保留作字形回退（原☄不对称；✷与可莉✹同族，均弃用）
      brief: '向前直射导弹',
      desc: '自机体直射一枚大狗导弹雨同款导弹<br>（白蓝渐变先兆者同款；600 溅射 / 低区直击 200，<br>飞行与命中规则与大狗导弹完全一致）<br>每发发射后 10% 概率 0.3s 后连射一发<br>（连射弹同样有概率继续连射）<br>连射弹伤害一律为正常导弹的 60%（固定不递减）<br>开局需等待一个完整攻击间隔后才首次射击<br>仅发射间隔随火力等级提升<br>始终单发直射——暴走也不多发、不斜发（涂装变金红）',
      fire: {
        kind: 'daodan',
        levels: {   // 单发伤害恒为大狗导弹 600（表中 DPS = 600 ÷ 间隔）
          1: { interval: 3.3, dps: 180 },
          2: { interval: 3.0, dps: 200 },
          3: { interval: 2.7, dps: 220 },
          4: { interval: 2.5, dps: 240 },
          5: { interval: 1.3, dps: 460 },
        },
      },
    },
    feijian: {
      id: 'feijian', name: '无界飞剑', glyph: '†', iconSvg: swordSvg(), color: '#cfe0ff',   // iconSvg = 单剑矢量（按已定稿 † 造型转绘：剑尖朝上，统一四副武器矢量口径与尺寸）；glyph † 保留作字形回退（原⚔双剑交叉，与实际单把飞剑不符）
      glyphTransform: 'rotate(180deg) scaleX(1.5)',   // 字形倒转 180°（剑尖朝上）+ 横向加宽 1.5 倍（仅 glyph 回退路径使用；iconSvg 生效时忽略）
      glyphBold: true,   // 线条增粗：† 加粗渲染（仅 glyph 回退路径使用）
      brief: '释放分裂飞剑<br>多位置打击',
      desc: '自机体后方飞出一把飞剑，后移下沉<br>随后迅速左右分裂（渐显）为多把<br>各自滑入全屏均分的槽位，就位后中央先发依次前射<br>每把剑对命中的首个敌人造成伤害（常规不穿透）<br>装备驾驶员陵落时：飞剑带微弱追踪<br>暴走（Lv5）：射速与单发伤害大增、剑身边缘金红流动、<br>弹速 +40%、拖尾增长<br>每把剑 50% 概率可穿透一次<br>（具体数值见下方对比表格）',
      fire: {
        kind: 'feijian',
        sinkDist: 30,  // 尾部出现后微微后移（下移）距离（px）
        sinkT: 0.3,    // 后移下沉用时（s），到位即分裂
        splitT: 0.44,  // 分裂就位用时（s）：各剑自波次中心渐显滑入全屏均分槽位
        fireGap: 0.06, // 相邻发射序的间隔（s）：分裂后段（splitT×70%）即开始发射，无就位停顿
        speed: 900, len: 51, r: 5,   // 剑身长 +70%（30 → 51）、剑柄长 +50%（绘制见 paintFeijianSword）；剑体宽（2r）≈ 大狗导弹宽一半；暴走弹速 ×1.4
        levels: {   // 单发伤害 = DPS × 间隔 ÷ 剑数（攻击间隔自飞剑生成瞬间起算，动画时长不影响节奏）
          1: { count: 6, interval: 2.2, dmg: 66 },
          2: { count: 7, interval: 2.1, dmg: 63 },
          3: { count: 8, interval: 1.9, dmg: 57 },
          4: { count: 9, interval: 1.7, dmg: 52.9 },
          5: { count: 9, interval: 1.2, dmg: 74.7, pierceChance: 0.5 },   // 暴走：射速/伤害大增 + 50% 穿透一次
        },
      },
    },
    xinring: {
      id: 'xinring', name: '辛国栋之怒', glyph: '☲', iconSvg: flameRingSvg(), color: '#e63cbe',   // iconSvg = 焰环矢量（用户 2026-09-27 定稿，渲染见 .glyph-svg）：环身焰舌用玫红→粉渐变贴合弹体涂装，辉光仍走注册色 currentColor；glyph ☲ 保留作字形回退（原❂与炽心重复；➰ 试行弃用）
      brief: '发射火环<br>灼烧区域内敌机',
      desc: '向场上生命值最高的敌人发射空间系火环<br>（焦香螺旋桨同款造型，玫红→粉渐变流动，整体透明度 0.8）<br>发射时较快渐显；初速 180%：0.8s 衰减至巡航速度、<br>再 0.6s 衰减至 70% 巡航速度后恒速直线飞行<br>穿过路径上的所有敌人，每 0.1s 结算一次灼烧伤害<br>（对单个敌人的持续灼烧 DPS 见下表）<br>开局需等待一个完整攻击间隔后才首次发射<br>场上无合格目标时朝正前方发射<br>半径 / 灼烧 DPS 随火力等级提升，暴走（Lv5）大幅强化',
      fire: {
        kind: 'xinring',
        speed: 180,   // 火环巡航速度（初速 ×1.8：0.8s 衰减至巡航、再 0.6s 衰减至 70%——见 updateXinRings）
        tick: 0.1,    // 灼烧结算间隔（s）
        levels: {   // 发射间隔较初版 -20%（×1.25）
          1: { interval: 3.75, dps: 190, r: 50 },
          2: { interval: 3.5, dps: 220, r: 55 },
          3: { interval: 3.25, dps: 240, r: 60 },
          4: { interval: 3.0, dps: 260, r: 64 },
          5: { interval: 2.25, dps: 520, r: 80 },   // 暴走：大幅强化
        },
      },
    },
  };
  let currentSubWeapon = SUB_WEAPONS.daodan;   // 当前副武器配置（默认捣蛋来袭，用户 2026-10-02 指定；写操作经 setSubWeapon，同 currentArmor/currentWingman 约定）
  function setSubWeapon(w) { currentSubWeapon = w; }

  // ---------- 驾驶员系统 ----------
  // 主界面选择、整场战斗生效的驾驶员（战斗修正 + 装备连携）。注册表键序 = 主菜单卡片展示顺序。
  // brief = 主菜单卡片简短文案；desc = 数值与机制图鉴「驾驶员」页的详细机制文案。
  // 效果键（缺省安全回退，与 diffMods 同约定）：
  //   bombDmgMul    可莉：高能爆弹（绷绷炸弹）伤害倍率
  //   bombStartAdd  可莉：初始爆弹额外数量
  //   dashDur/dashLv 许凯狗：开场冲刺时长（s）/ 结束时跳到的关卡等级
//   speedFast/speedSlow 马兴犬：Shift 加速 / CapsLock 减速的移速倍率（同键再按恢复原速）
  //   chargeDur/scoreMul 埃逸：死亡蓄力自爆时长（s）/ 自爆击杀的得分倍率
  //   chargeBonus/secondCostMul 炼金璃：连携七日澜心的充能次数加成 / 持有第 1 个充能时第 2 次充能的水晶分数倍率
  //   layerMax/layerCap 叮咚鸡：计数表单层上限 / 最多持有层数
  //   missileCount/missileArc/missileSpeed/missileR/missileDmg 叮咚鸡：Q 导弹参数（发数 / 前向扇形角 / 弹速 / 弹体半径 / 直击伤害）
  //   berserkUpsMax 叮咚鸡：升级至暴走（4→5 级）的全局次数上限（4/5 级按技能均消耗机会）
  //   counterMax/killGain/bossKillMul/eliteKillMul/elites/bossTickGain 依：击杀计数上限 / 各类别击杀增量（1~5 类）/
  //     BOSS 战计数倍率 / 击败四精英的倍率与其类型清单 / BOSS 战每秒自然计数
  //   scytheR/scytheGripR/scytheTilt/scytheDur/scytheWidth/scytheBaseDmg/scytheHpPct/scytheHpPctCap 依：镰刀清扫参数
  //     （斩击半径=刀刃外圈 / 刀柄轨迹半径 / 刃尖弯钩偏角 / 斩击一圈时长 / 素材绘制高度 / 基础伤害 / 最大生命百分比 / 百分比部分封顶）
  //   gaugeFull/bossCharge/stormChargeMin~Max 天秀忧郁王子：量表所需非水晶分数（基准；真我/诗篇 mods.princeGaugeFull 覆盖）/
  //     BOSS 战每秒充能 / 暴风之眼战每秒充能（10%~16% 随机）
  //   stormDmgCut/stormCrashCut 天秀：来自暴风之眼的伤害削减（普通/碰撞）
  //   （原 otherDmgCut 暴风之眼战其余我方伤害削减已取消——2026-10-02 用户定稿：非风暴伤害不再削减，改为携带天秀时暴风之眼血量 ×2，见 05-boss spawnBoss）
  // 注册表键序 = 主菜单卡片展示顺序（none 除外，不展示）：
  //   主槽：大狗 / 许凯狗 / 埃逸 / 可莉 / 哈基米大王 / 马兴犬 / 温酒客 / 胡笛客
  //   副槽：小艺 / 大无垠之王 / 陵落 / 天秀忧郁王子 / 炼金璃 / 依 / 叮咚鸡 / 萧杨
  // 陵落「彼岸花」矢量图标（iconSvg）：内联 SVG 字符串——currentColor 继承注册色，
  // 辉光由 .glyph-svg 的 drop-shadow 提供（渲染点：主菜单驾驶员卡片 / 数值图鉴「驾驶员」页标题）。
  function higanbanaSvg() {
    let petals = '';
    for (let i = 0; i < 6; i++) {
      petals += '<path d="M0 -2.6 C3.2 -5.2 3.8 -10.5 1.4 -17.5 C0.5 -13.2 -0.5 -13.2 -1.4 -17.5 C-3.8 -10.5 -3.2 -5.2 0 -2.6 Z"'
        + (i ? ' transform="rotate(' + i * 60 + ')"' : '') + '/>';
    }
    return '<svg viewBox="-20 -20 40 40" xmlns="http://www.w3.org/2000/svg">'
      + '<g fill="currentColor" stroke="rgba(216,180,254,.5)" stroke-width=".8">' + petals + '</g>'
      + '<circle r="5.5" fill="none" stroke="rgba(233,213,254,.55)" stroke-width=".7"/>'
      + '<circle r="2.7" fill="#e9d5ff"/></svg>';
  }

  // 依「四瓣花」矢量图标（iconSvg）：内联 SVG 字符串——#FFC0CB → 白色线性渐变填充（注册色即渐变本体）
  function meiGlyphSvg() {
    let petals = '';
    for (let i = 0; i < 4; i++) {
      petals += '<path d="M0 -2.4 C2.8 -4.8 3.4 -9.6 1.2 -16 C0.4 -12 -0.4 -12 -1.2 -16 C-3.4 -9.6 -2.8 -4.8 0 -2.4 Z"'
        + (i ? ' transform="rotate(' + i * 90 + ')"' : '') + '/>';
    }
    return '<svg viewBox="-20 -20 40 40" xmlns="http://www.w3.org/2000/svg">'
      + '<defs><linearGradient id="yiGlyphGrad" x1="0" y1="1" x2="1" y2="0">'
      + '<stop offset="0" stop-color="#FFC0CB"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient></defs>'
      + '<g fill="url(#yiGlyphGrad)" stroke="rgba(255,192,203,.55)" stroke-width=".8">' + petals + '</g>'
      + '<circle r="5" fill="none" stroke="rgba(255,192,203,.6)" stroke-width=".7"/>'
      + '<circle r="2.4" fill="#fff"/></svg>';
  }

  // ── 体系级约定（设计新驾驶员必读）：许凯狗「高能冲刺」结束时（14-main 递减归零帧，仅一次）会调用
  // 07-player chargeAllGaugesOnDashEnd()，把当前驾驶员的全部技能计量表立刻充满——现有六张：
  // 炼金璃七日澜心持有充能 / 依击杀计数 / 陵落 Q 冷却 / 天秀白色量表 / 萧杨原石充能 / 叮咚鸡计数表。
  // 新驾驶员若引入技能计量表（冷却 / 充能 / 计数 / 层数等），必须同步在该函数登记充满逻辑，
  // 否则许凯狗冲刺结束后该表不回满（视为遗漏）。
  const PILOTS = {
    // 「无驾驶员」已不作为可选卡片（选择页移除）：仅作同名互斥时另一槽位的回退值与内部判定用
    none: {
      id: 'none', name: '无驾驶员', empty: true,
      desc: '不携带驾驶员出击。',
    },
    // 主槽：大狗 / 许凯狗 / 埃逸 / 可莉 / 马兴犬 / 温酒客 / 胡笛客
    dagou: {
      id: 'dagou', name: '大狗', glyph: '☄', color: '#7fb8ff', slot: 'main', default: true,   // ☄ 彗星拖尾 = 单枚导弹飞行（原⟰移交许凯狗；不与捣蛋来袭 ▲ 重复）；默认主驾驶员（与可莉互换，用户 2026-09-27 指定）
      // 导弹雨：waveIv 召唤间隔（s）/ count 每波数量 / dmg 对命中目标及小范围敌人的伤害（BOSS 不再减免，同 dmg）
      // blastR 溅射半径 / speed 上行速度 / launchGap 相邻两发的发射间隔（s，中间两发先出、向两侧两两错开）
      // 预警蓝光：warnLead 发射前渐显时长（s）/ warnPeak 峰值透明度 / warnFade 发射后快速渐隐时长（s）
      // warnH 光带高度（px，基准 130 + 10% 屏幕高度）
      waveIvMin: 10, waveIvMax: 22, count: 8,
      warnLead: 1.5, warnPeak: 0.3, warnFade: 0.35, warnH: 130 + Math.round(CANVAS_H * 0.1),
      blastR: 70, speed: 950, launchGap: 0.1, r: 10,
      // 连射链：每波发射后 chainChance 概率在 chainGap 秒后再来一波（连射波同样有概率继续连射）；
      //   连射波伤害一律 = 常规波 ×chainDmgMul（0.6，固定——任意连射深度不再逐波递减）
      chainChance: 0.10, chainGap: 0.3, chainDmgMul: 0.6,
      // 分区命中：下方 65% 区域（y > lowZonePct×屏高）首触不爆炸——对命中目标直击 directDmg 后穿透继续飞行；
      //   第二次命中（或下方未直击过、在上方 35% 线内首次命中）即爆炸：主目标 directDmg 直击 + splashDmg 溅射
      //   （合计 600）、爆点周围 blastR 内其他敌人受 splashDmg 溅射（连射链 dmgMul / 大无垠之王增伤两部分均乘算）
      lowZonePct: 0.35, directDmg: 200, splashDmg: 400,
      // 对 BOSS 伤害修正（2026-10-08 用户定稿）：仅驾驶员召唤的波雨弹（src='dagou'）对 BOSS ×bossDmgMul（-35%）——
      // 副武器捣蛋来袭（src='daodan'）/ 连发作弊模式（src='dagouCheat'）的导弹不受此修正（见 07-player dagouBossMul）
      bossDmgMul: 0.65,
      brief: '召唤导弹打击',
      desc: '大狗叫叫叫。每隔 10~22s 召唤一波 8 颗导弹雨<br>（均匀分布，中间两发先射出，随后向两侧<br>两两错峰发射）自下而上射出<br>发射前 1.5s 屏幕下方渐显蓝光预警<br>导弹为白蓝色渐变的先兆者同款<br>下方 65% 区域首触不爆炸：对命中目标<br>直击 200 后穿透继续飞行；第二次命中<br>（或进入上方 35% 线内首次命中）即爆炸：<br>主目标 200 直击 + 400 溅射（合计 600）、<br>爆点周围小范围敌人受 400 溅射<br>每波发射后有 10% 概率在 0.3s 后连射一波<br>（连射波同样有概率继续连射），<br>连射波伤害一律为正常波的 60%（固定不递减）<br><b>对 BOSS 的伤害 -35%</b><br>（副武器捣蛋来袭与作弊连发的导弹<br>不受此修正）',
    },
    xukaigou: {
      id: 'xukaigou', name: '许凯狗', glyph: '⟰', color: '#ffffff', slot: 'main',   // ⟰ 接手大狗原四重上射箭（原⇈双箭头弃用；颜色改白）
      dashDur: 7, dashLv: 8,
      dashEntry: 0.5,   // 冲刺入场时长（s）：从出发位置平滑升至摆动区，不瞬间闪现
      enemySpdMul: 1.65,   // 冲刺期间怪物移速倍率（+65%）：敌机更快冲入击杀窗口，营造迎面疾驰感
      dashTail: 1,     // 冲刺收尾时长（s）：最后 1s 流动特效/背景流速逐渐减速，机体平滑滑落至 70% 屏高
      brief: '开场高能冲刺',
      desc: '许凯狗元气磅礴。开场进行 7s 高能冲刺（期间无敌）<br>来袭敌人出场即被击溃（道具正常掉落）<br>升级时间缩短至 1s（每级刷怪量与正常一致）<br>冲刺结束时等级直接跳至 Lv8（全部技能计量表同时充满）',
    },
    aiyi: {
      id: 'aiyi', name: '埃逸', glyph: '✸', color: '#ff4d6d', slot: 'main',
      // 死亡蓄力自爆：chargeDur 非最后一条命蓄力（s）/ chargeDurFinal 最后一条命蓄力（s）
      // 蓄力期间收缩波向死亡地点汇聚（contractR 非最终起始半径 / contractRFinal 最终三道起始半径，初始较浅渐显）；
      // 结束产生扩散波波及全场（updateAiyiWaves）：
      // waveSpeed 扩散速度（px/s）/ finalWaveCount 最后一条命的扩散波道数（错峰 0.1s 释放、很快扫过全场）
      // bossDmg 非最后一条命自爆对 BOSS 的固定伤害（非 BOSS 敌人一律立刻击杀）
      chargeDur: 0.5, chargeDurFinal: 1.0, contractR: 300, contractRFinal: 460,
      waveSpeed: 1300, finalWaveCount: 3,
      scoreMul: 0.2, bossDmg: 6000,
      brief: '死亡时高能殉爆',
      desc: '埃逸能流奔涌。死亡时蓄力（0.5s，最后一条命 1s）——<br>一道/三道能流波自远处收缩汇聚后殉爆：<br>一道/数道极宽冲击波自死亡地点快速扩散至全场，<br>被波及的敌人立刻结算（<b>无视虚化护盾</b>）——<br>非最后一条命：非 BOSS 敌人立刻击杀、BOSS 受 6000 伤害<br>最后一条命：被波及的所有敌人（含 BOSS）立刻被击杀<br>击杀暴风之眼的同一次殉爆不会波及随后召唤的<br>风暴编织者（该批扩散波扫完后恢复正常判定）；<br>增生侧翼艇被波炸毁时不分裂卫护飞船<br>被殉爆击杀的敌人仅获得 20% 分数<br>最后一条命的殉爆击杀最终 BOSS 仍算作胜利<br>（结算标题"自爆成功"）',
    },
    keli: {
      id: 'keli', name: '可莉', glyph: '✹', color: '#ff7a45', slot: 'main',   // ✹ 绷绷火花（default 移交大狗，用户 2026-09-27 与大狗互换位置）
      bombDmgMul: 1.5, bombStartAdd: 1, bombIgnoreDiffCut: true,   // 绷绷炸弹：真我爆弹对 BOSS 的减伤减半（×0.75 → ×0.875）
      // aoeCut/missileCut：受到的瞬时区域伤害 / 导弹伤害削减
      // （瞬时区域 = 暴鸰爆炸 / 破片范围伤害 / 风暴编织者雷霆轰击 / 暴风之眼区域打击；
      //   导弹 = 先兆者导弹；长条激光 / 持续灼烧 / 撞击伤害不适用）
      aoeCut: 0.2, missileCut: 0.2,
      brief: '爆弹更加强力',
      desc: '可莉爱用绷绷炸弹。绷绷炸弹替代高能爆弹<br>伤害为高能爆弹的 150%<br>初始额外拥有 1 颗绷绷炸弹<br>真我难度的爆弹对 BOSS 伤害减少减半<br>（-25% → -12.5%）<br>受到的瞬时区域伤害 -20%<br>（暴鸰爆炸 / 破片范围伤害 / 雷霆轰击 /<br>暴风之眼区域打击）<br>受到的导弹伤害 -20%（先兆者导弹）<br>（长条激光 / 持续灼烧 / 撞击不适用）',
    },
    // 马兴犬：Shift 加速 / CapsLock（大写锁定键）减速（同键再按恢复原速）
    hajimi: {
      id: 'hajimi', name: '哈基米大王', glyph: 'ω', color: '#ff9ab5', slot: 'main',   // ω 猫嘴 :3（原「喵」文字占位）；2026-09-28 由副槽移至主槽（马兴犬前）
      dodgeBase: 0.35, dodgeBonusStep: 0.05, tailDur: 4,   // 暴走期闪避基础概率 / 失败累积步进 / 暴走结束后闪避存续时长（s）
      brief: '暴走时有概率闪避',
      desc: '哈基米大王狂暴出击。暴走期间 35% 概率闪避受到的伤害<br>（闪避不受伤害，无敌时长为正常的 70%）<br>未成功闪避时下一次概率 +5%（成功后清零）<br>闪避效果延长至暴走结束后 4s<br>（覆盖后暴走的最危险窗口；概率累积仅在暴走期间进行）<br>暴走结束时若仍有累积加成则保留，<br>下次暴走时继续生效',
    },
    maxingquan: {
      id: 'maxingquan', name: '马兴犬', glyph: '⇅', color: '#d9a066', slot: 'main',   // ⇅ 上/下双箭 = Shift 加速 / Caps 减速切换（🐾 emoji 自带色破坏单色风格弃用；Unicode 无单色狗形字符）
      speedFast: 1.25, speedSlow: 0.8,
      brief: 'Shift/Caps<br>切换移速',
      desc: '马兴犬下头至极。点击 <b>Shift</b> 切换加速 ×1.25<br><b>Caps</b>（大写锁定键）切换减速 ×0.8，<br>再次点击同键恢复原速',
    },
    wenjiuke: {
      id: 'wenjiuke', name: '温酒客', glyph: '☻', color: '#c9a0ff', slot: 'main',   // ☻ 醉笑圆脸（原「醉」文字占位）
      // 受伤提升效果（2026-09 由白板改为实战效果）：damagePlayer 统一乘区（1 + state.wenjiukeVuln）；
      // 每击败一个 BOSS 加成 -25 个百分点（06-enemy BOSS 击败结算处扣减），最低归零
      vulnDecay: 0.25,
      brief: '神秘效果',   // 选机卡片保持神秘文案；数值与机制图鉴（renderInfoPilots 用 desc）写明实际效果
      desc: '温酒客深藏不露。受到的所有伤害增加 100%<br>每击败一个 BOSS，该效果减少 25 个百分点<br>（+100% → +75% → +50% → +25% → +0%）<br>正常流程共三位 BOSS，最多减至 +25%',
    },
    hudike: {
      id: 'hudike', name: '胡笛客', glyph: 'ω', color: '#8a9bb0', slot: 'main', whiteboard: true,   // ω 与哈基米大王同字形（成对彩蛋），经 glyphTransform 倒转 180° 区分方向（独立字形 ɯ 弃用）
      glyphTransform: 'translateY(2.5px) rotate(180deg)',   // 哈基米 ω 倒转 180°（卡片/图鉴均应用；与 hajimi 仅方向不同，用户指定豁免重复）。ω 为小写 x 高度字形、墨迹压行框下半，旋转后翻至上半——translate 补 2.5px 下移回正（左置的 translate 在视觉空间最后应用）
      brief: '无效果',
      desc: '胡笛客卑鄙无耻。<br>没有任何效果。',
    },
    xiaoyi: {
      id: 'xiaoyi', name: '小艺', glyph: '❁', color: '#8ce36b', slot: 'sub', default: true,
      pickupHealPct: 0.05, pickupHealPctLow: 0.10, pickupHealHpGate: 60, pickupHealHpGateLow: 40,   // 拾取回复（×最大生命）/ 触发阈值（血量点数：低于 60 回 5% / 低于 40 回 10%；水晶不算）
      huiBossHealPct: 0.60,   // 与洄连携：击败 BOSS 立刻恢复 60% 生命（取代洄自身 35% 已损失口径）
      brief: '低血拾取回血，可与洄联动',
      desc: '小艺拥有森灵之力。血量低于 60 时拾取任意道具（水晶不算）<br>恢复 5% 生命；血量低于 40 时改为恢复 10% 生命<br>同时装备护甲「洄」时：<br>击败 BOSS 后立刻恢复 60% 生命（取代洄的 35% 已损失）',
    },
    king: {
      id: 'king', name: '大无垠之王', glyph: '♛', color: '#ffffff', slot: 'sub',   // ♛ 三尖王冠保留（⚔ 试行弃用），颜色 #ffd166 → 白色
      // dmgRate/takenRate：BOSS 战期间每秒累积的 造成伤害/受到伤害 提升（0.75%/s 与 0.5%/s）
      // dmgCap/takenCap：两项累积的上限（+120% / +80%）
      // phaseKeep：多阶段 BOSS 切换（暴风之眼→风暴编织者）时两项累积增伤的留存比例（-75%）
      dmgRate: 0.0075, takenRate: 0.005, dmgCap: 1.2, takenCap: 0.8, phaseKeep: 0.25,
      brief: 'BOSS战逐渐增伤',
      desc: '大无垠之王怒意蔓延。BOSS 战期间：每 1s 造成伤害 +0.75%（最多累积 +120%），<br>每 1s 受到伤害 +0.5%（最多累积 +80%）<br>多阶段 BOSS 切换时（暴风之眼→风暴编织者）<br>两项累积各减少 75%<br>BOSS 阶段结束时立刻失去全部累积',
    },
    lingluo: {
      id: 'lingluo', name: '陵落', glyph: '★', iconSvg: higanbanaSvg(), color: '#6a1b9a', slot: 'sub',   // iconSvg = 彼岸花矢量（用户 2026-09-27 定稿，渲染见 .glyph-svg；主菜单卡片 / 图鉴驾驶员页生效）；glyph ★ 保留作字形回退（⛧ 倒五芒、☠ 骷髅均弃用；颜色黑紫不变）
      // cd：Q 技能冷却（s，开局技力条为空）/ hpCost：每次触发同时扣除的生命上限与当前生命（下限 1）
      // maxHpRegen：生命上限恢复速率（每秒，不回当前血量；40 上限 ÷ 2/s = 恰好 20s 回满）
      cd: 40, hpCost: 40, maxHpRegen: 2,
      brief: '按Q烧血暴走',
      desc: '陵落掌控邪魔之力诡异无比。按 Q 触发暴走，同时扣除 40 生命上限<br>（血条缩短，下限 1）并至少扣除 40 当前生命<br>（不低于 1，超出新上限的部分裁剪）<br>生命上限随后每秒回复 2 点、20s 恰好回满 40<br>（不回当前血量，重生/重开即复原）<br>技能冷却 40s，开局技力条为空（不能立刻释放）<br>暴走期间再次触发：暴走时间重设为<br>默认持续 + y 秒（y = min{1, 剩余暴走时间}）',
    },
    tianxiu: {
      id: 'tianxiu', name: '天秀忧郁王子', short: '忧郁王子', glyph: '☯', color: '#dff3ff', slot: 'sub',   // ☯ 回调保留（⟳ 旋风试行后弃用）
      gaugeFull: 30000, bossCharge: 0.02, stormChargeMin: 0.10, stormChargeMax: 0.16,   // gaugeFull 基准；真我/诗篇 mods.princeGaugeFull=36000（diffMods 覆盖）
      stormDmgCut: 0.5, stormCrashCut: 0.6,
      // stormKillGain：友方大风暴（风弹 / 主体接触）击杀 1/2/3/4 类敌人时，量表立刻增加的百分比
      stormKillGain: { 1: 0.004, 2: 0.008, 3: 0.016, 4: 0.032 },
      brief: '按Q召唤风暴',
      desc: '天秀忧郁王子呼唤暴风。白色量表：非水晶得分 30000 充满<br>（真我 / 诗篇 36000；BOSS 战 +2%/s；<br>暴风之眼战 +10%~16%/s 随机）<br>友方大风暴击杀 1/2/3/4 类敌人时<br>量表立刻增加 0.4%/0.8%/1.6%/3.2%<br>满时按 Q：向前方召唤友方大风暴（并射出风弹）<br>来自暴风之眼的伤害 -50%（碰撞伤害 -60%）<br>暴风之眼战期间：友方大风暴伤害 ×3<br>（其余我方伤害不再削减，暴风之眼血量 ×2）',
    },
    lianjinLovely: {
      id: 'lianjinLovely', name: '炼金璃', glyph: '⊛', color: '#f5b8d0', slot: 'sub',   // ⊛ 圆环放射冲击波（⍟ 试行后回调；原⚔与武器无关）
      // 重做（2026-10-09 用户定稿）：无独立数值参数。
      // ① BOSS 战：BOSS 血量首次到达 70% 时额外掉落一个结晶护盾道具（每台 BOSS 一次，
      //    见 05-boss updateLovelyShieldMark / 08-entities applyPowerupPickup 'crystalShield'）；
      // ② 连携七日澜心：量表充能完毕的瞬间立刻释放淡粉特效并清除 250px 内敌弹（lovelyBurst），
      //    量表保持满格、按 F 照常开启结晶护盾（见 07-player updatePilotStatus）
      brief: 'BOSS战血量70%时掉落结晶护盾<br>连携澜心：量表充满即清弹',
      desc: '同时携带七日澜心时：<br>七日澜心量表<b>充能完毕</b>的瞬间，立刻释放<br>淡粉特效并清除 250px 内所有敌方子弹<br>（量表保持满格，按 F 照常开启结晶护盾）<br><b>BOSS 战</b>：BOSS 血量首次到达 <b>70%</b> 时<br>额外掉落一个<b>结晶护盾</b>（每台 BOSS 一次）',
    },
    mei: {
      id: 'mei', name: '依', glyph: '❁', color: '#FFC0CB', slot: 'sub',   // ❁ 四瓣花（iconSvg 渐变字形见 meiGlyphSvg：#FFC0CB → 白）
      // 击杀计数条（左下角可见）：counterMax 上限；killGain 击杀 1/2/3/4/5 类敌人的计数增量（5 类 = BOSS）；
      // bossKillMul BOSS 战期间击杀计数倍率；eliteKillMul 击败黑暗之手四精英的倍率（替换 BOSS 战 ×3）；
      // elites 四精英类型清单；bossTickGain BOSS 战每秒自然增加的计数；
      // 镰刀清扫（充满自动召唤，无需按键）：刀柄贴身绕转、刀刃扫至外圈——
      // scytheGripR 刀柄轨迹半径（刀柄绕机体公转的贴身距离，起扫时刀柄位于 scytheStart 方位 = 正左）/
      // scytheR 斩击半径（= 刀刃外圈距机体距离，伤害与消弹范围；刀身自刀柄轨迹圈径向延伸至 R）/
      // scytheDur 快速斩击一圈的时长（s，角速度 = 2π/scytheDur）/
      // scytheStart 起扫姿态角（π = 刀柄杆水平朝左；从该姿态顺时针扫一圈回到同姿态）/
      // scytheTilt 刃尖相对刀柄杆姿态角的固定弯钩偏角（rad，实测素材+SCX/SCY 变形后：杆水平时刃尖上翘 ≈ 43°；
      //   判定/拖尾/粒子均以「姿态角 + tilt」的刃尖方位为准，刀柄杆姿态不受影响）/
      // scytheWind 蓄力后拉时长（s，慢速倒转蓄势，段内不打伤害）/ scytheWindAng 后拉角度（rad；斩击总行程 2π+windAng，恰回正左）/
      // scytheWidth 仅作素材未加载回退长条的高度（正常绘制按素材「握把→杆顶→刃尖」锚定 + 素材系缩放 SCX/SCY
      // （见 10-draw-world drawMeiScythes 锚点注释）：杆轴水平朝外、握把贴机体、刃尖达 scytheR 外圈，
      // 尺寸由锚点决定；素材 1199×1754 竖构图）/
      // scytheBaseDmg + scytheHpPct×目标最大生命（20% 部分封顶 scytheHpPctCap）——每个敌人被刀刃扫过时受击一次
      counterMax: 122, killGain: { 1: 1, 2: 3, 3: 8, 4: 20, 5: 122 },
      bossKillMul: 3, eliteKillMul: 4, elites: ['puxuefeng', 'hanxixian', 'xiayong', 'xinguodong'],
      bossTickGain: 3,
      scytheR: 250, scytheGripR: 34, scytheDur: 0.55, scytheWidth: 220, scytheStart: Math.PI,
      scytheTilt: 0.75,
      scytheWind: 0.3, scytheWindAng: 0.35,
      scytheBaseDmg: 1500, scytheHpPct: 0.2, scytheHpPctCap: 2500,
      brief: '击杀积攒计数，满时召唤镰刀斩击一圈',
      desc: '缎带与镰刀的看板娘。左下角计数条：击杀敌人增加计数<br>（上限 <b>122</b>）——击杀 <b>1/2/3/4/5</b> 类敌人<br>分别增加 <b>1/3/8/20/122</b> 点；<br>BOSS 战期间击杀计数 <b>×3</b>，<br>击败朴学峰、夏勇、韩希先、辛国栋时改为 <b>×4</b>；<br>BOSS 战期间每秒额外 <b>+3</b> 计数<br>充满后自动召唤镰刀<b>快速斩击一圈</b>：<br>刀柄贴着机体、刀刃扫至 <b>250px</b> 外圈，<br>被扫中的敌人受 <b>1500 + 20% 最大生命</b> 伤害<br>（20% 生命部分最多 2500，各受击一次），<br>被扫中的敌方子弹一并摧毁，<br>并可斩碎<b>虚化护盾</b>与敌方<b>金环</b>',
    },
    dingdongji: {
      id: 'dingdongji', name: '叮咚鸡', glyph: '♪', color: '#ffcf4d', slot: 'sub',   // ♪ 叮咚音符合计（无单色鸡形字符）
      // 计数表（左下角可见）：layerMax 单层上限 / layerCap 最多持有层数；
      // 每次提升关卡等级掷增量（noteDdjLevelUp，01 值阶梯 70/10/6/3/1%）；
      // 任一层满按 Q：missileCount 发导弹在 missileArc 前向扇形均匀射出（missileSpeed 直线弹速 /
      // missileR 弹体半径 / missileDmg 直击伤害）→ 触发武器等级升级 → 消耗一层；
      // Q 技能全局初始仅能释放 useMax 次（2026-10-02 用户定稿：取代旧的「1~3 级不限按」）；
      // 击败 BOSS 掷骰提升上限（06-enemy killEnemy）：每次 25%，第 5/6 轮 BOSS（BOSS_ROUNDS 表轮次）100%
      // 升级至暴走（4→5 级）另受 berserkUpsMax 次限制：4/5 级时按技能均消耗机会，耗尽后 4/5 级无法再按
      layerMax: 8, layerCap: 3,
      missileCount: 4, missileArc: 120, missileSpeed: 520, missileR: 6, missileDmg: 400,
      berserkUpsMax: 3, useMax: 3,
      brief: '按Q升级武器（每局仅3次）',
      desc: '叮咚！左下角计数表（单层上限 <b>8</b>，最多积累 <b>3</b> 层）：<br>每次提升关卡等级掷一次——<b>70%</b> +1、<b>10%</b> +2、<br><b>6%</b> +3、<b>3%</b> +4、<b>1%</b> +8（其余不增加）<br>任一层计数满后按 <b>Q</b>：向前方 <b>120°</b> 范围<br>均匀射出 <b>4</b> 发叮咚鸡导弹（直击 400），<br>随后<b>触发武器等级升级</b>，然后消耗一层计数<br>Q 技能<b>全局初始仅能释放 3 次</b>（无论火力等级，<br>次数用完后层数再多也无法释放）；<br>每次<b>击败 BOSS</b> 有 <b>25%</b> 概率立即使释放上限 <b>+1</b><br>（第 <b>5、6</b> 轮 BOSS 概率提升至 <b>100%</b>）；<br>升级至<b>暴走</b>（4/5 级按技能）另计机会，<br>同样<b>全局仅 3 次</b>',
    },
    xiaoyang: {
      id: 'xiaoyang', name: '萧杨', glyph: '☘', color: '#228B22', slot: 'sub',   // ☘ 三叶草回调（🍀 emoji 自带色破坏单色风格弃用），深绿辉光保留
      brief: '收集原石<br>按Q抽卡',
      desc: '萧杨阴险狡诈——收集原石从不手软。<br>所有水晶转为原石的概率额外提升 <b>50%</b><br>（小 0.45% / 中 2.7% / 大 15%；提升部分转出的原石<br><b>不额外加分</b>，得分仍按转化前的水晶计算）。<br>每收集 <b>16</b> 颗原石，充满一次「哦哦！抽卡！」技能<br>（充满后按 <b>Q</b> 释放，可无限次；已充满时继续捡原石不计数）。<br>释放：<b>16</b> 颗原石自画面外四面八方随机先后汇集机体<br>（约 2.5s，期间<b>无敌</b>、我方输出 <b>-60%</b>），收束后清除<br>周身 <b>300px</b> 敌弹并抽卡——<b>70% 蓝 / 25% 紫 / 5% 金</b>：<br>场中巨影闪现，同色陨石轰击场心（蓝 <b>6000</b> / 紫 <b>16000</b><br>全场伤害；<b>金秒杀全场敌方单位</b>——埃逸殉爆同款：禁用<br>增生分裂 / 法术矩阵爆发等召唤型亡语；一次金陨<b>最多带走<br>一个 BOSS</b>——暴风之眼被秒后召唤的风暴编织者免疫本场<br>金陨，编织者单独在场时照常秒杀）。陨石同时清除全场敌我<br>弹幕与预警（辛国栋之怒火环、暴风之眼风波/风柱、风暴编织者<br>雷霆/激光预警；登场的战争幽灵直接被砸死）；黑暗之手连携<br>精英不被波及——本体若被击杀，精英立即终止技能迅速离场。',
    },
    niudan: {
      id: 'niudan', name: '牛蛋', glyph: '●', color: '#e6c86e', slot: 'sub', whiteboard: true,   // ● 圆蛋（肥嘟嘟造型意象）；白板副驾驶员（2026-10-03 用户新增），成就「无垠」白板判定与胡笛客同门
      brief: '无效果',
      desc: '牛蛋肥嘟嘟。<br>没有任何效果。',
    },

    // ── 特殊驾驶员（special: true = 特殊驾驶员，简称 sp；特殊装备约定见 specialGearActive）──────────
    // 排序约定（2026-10-08 用户定稿）：选择页 / 图鉴展示顺序 = 注册表键序，特殊驾驶员一律登记在
    // 全部常规驾驶员之后（本表末尾）——此后新增的特殊驾驶员均放此处，勿插入常规区段。
    // 天使璃：无限生命——三条死亡路径（damagePlayer / 暴风之眼持续接触 / 焦香灼烧）均不扣命数，
    // 死后照常 1.6s 重生，永不失败结算；左下角恒显 1 颗心（12-ui updateHUD 特判）；
    // 使用期间无法获得任何挑战成就（02-achievements 统一门控）；
    // 视觉：选择页卡片右上角青粉渐变三角角标（CSS .pilot-card.special，overflow 裁在边框内）+ 主页面驾驶员菱形框青粉渐变流光
    // 与双白芒绕框（CSS .pilot-diamond.special-pilot，refreshLoadout 切换）
    tianshiLovely: {
      id: 'tianshiLovely', name: '天使璃', glyph: '✧', color: '#ffb7d5', slot: 'main', special: true,   // ✧ 四芒星（天使辉光）
      brief: '无限生命',
      desc: '天使璃温柔守护。拥有无限条生命<br>被击坠后照常短暂无敌并重生<br>（命数永不减少，不会迎来失败终局）<br>左下角始终显示一颗心<br><b>特殊驾驶员</b>：使用期间无法获得<br>任何挑战成就（无伤系列等）',
    },
  };
  // ---------- 主/副驾驶员槽位 ----------
  // 每名驾驶员归属 slot（'main' 主驾驶员 / 'sub' 副驾驶员，暂定分野、可随设计调整）；
  // 可同时装备主副各一名，效果同时生效。战斗逻辑经 hasPilot(id) 判定（任一槽位命中即生效），
  // 不区分主副——待主/副差异设计明确后再在此扩展。
  let currentPilotMain = PILOTS.dagou;   // 主驾驶员（默认大狗，用户 2026-09-27 调整；写操作经 setPilotMain）
  let currentPilotSub = PILOTS.xiaoyi;  // 副驾驶员（默认小艺；写操作经 setPilotSub）
  function setPilotMain(p) { currentPilotMain = p; }
  function setPilotSub(p) { currentPilotSub = p; }
  // 当前是否装备了指定驾驶员（主副任一槽位命中即 true）
  function hasPilot(id) { return currentPilotMain.id === id || currentPilotSub.id === id; }
  // 当前生效驾驶员的注册表条目聚合（效果键读取用：任一槽位携带该键即生效，主槽优先）
  function pilotEntry(id) {
    if (currentPilotMain.id === id) return currentPilotMain;
    if (currentPilotSub.id === id) return currentPilotSub;
    return null;
  }
  // 可莉：绷绷炸弹伤害倍率 / 初始额外爆弹数
  function pilotBombDmgMul() { return (pilotEntry('keli') || {}).bombDmgMul || 1; }
  function pilotBombStartAdd() { return (pilotEntry('keli') || {}).bombStartAdd || 0; }
  // 大狗导弹雨间隔：连发模式 0.2~1s（按 9 切换），正常取注册表 10~22s
  function dagouWaveIv(rapid) {
    return rapid ? 0.2 + Math.random() * 0.8
      : PILOTS.dagou.waveIvMin + Math.random() * (PILOTS.dagou.waveIvMax - PILOTS.dagou.waveIvMin);
  }
  // ---------- 特殊装备标记（special，简称 sp）与挑战成就门控（2026-10-08 用户定稿） ----------
  // 约定：各装备注册表（PILOTS / ARMORS / PLANES / WINGMEN_CFG / SUB_WEAPONS……后续扩展）的条目
  // 可带 special: true 标记 = 特殊装备——使用期间无法获得任何挑战成就（ACHIEVEMENTS[x].challenge，
  // 02-achievements unlockAchievement 统一门控）。当前特殊装备：天使璃（tianshiLovely）。
  function specialGearActive() {
    return !!(currentPilotMain.special || currentPilotSub.special ||
      currentArmor.special || currentPlane.special || currentWingman.special || currentSubWeapon.special);
  }

  // 天秀忧郁王子：友方大风暴（大型龙卷（暴风之眼召唤物）同款风暴的我方版，按 Q 释放）
  //   风暴本体：dur 存留时长（s）/ riseSpd 向上推进速度 / r 判定与视觉半径
  //     （绘制复用大型龙卷 drawTornado，样式一致；自转为该绘制内置的时间驱动）
  //   主体接触伤害：tickDmg / tickIv（结算间隔）
  //   风弹（大型龙卷同款随机喷射）：bulletCount 每轮发数 / fireIvMin~fireIvMax 发射间隔（s，随机）/
  //     bulletSpeed0 初速 / bulletAccel 沿飞行方向加速度 / bulletMaxSpeed 弹速上限 /
  //     bulletR 弹体半径 / bulletLen0 出膛长度 / bulletLenMax 全长 / growRate 长度生长速率（px/s）
  //   天秀限定：风弹仅朝前方 240° 扇形发射（以竖直向上为中心 ±120°，正下方 ±60° 扇区不射）
  //   bulletDmg 风弹伤害 / stormFightDmgMul 暴风之眼战期间的伤害倍率（+200%）
  //     / bulletAlphaStormFight 暴风之眼战中我方风弹透明度（与敌弹样式相同，压透明度区分）
  const PRINCE_STORM = {
    dur: 7, riseSpd: 130, r: 110,
    tickDmg: 80, tickIv: 0.1,
    bulletCount: 2, fireIvMin: 0.20, fireIvMax: 0.30,
    bulletSpeed0: 190.4, bulletAccel: 100.625, bulletMaxSpeed: 816.2,
    bulletR: 5.6, bulletLen0: 14.4, bulletLenMax: 84, growRate: 150,
    bulletDmg: 100,
    stormFightDmgMul: 3, bulletAlphaStormFight: 0.35,
    dbgRiseSpdMul: 1.8,   // 按 8 连发模式期间发射的风暴：向上移速 ×1.8
  };

  // 守愿者白盾几何：以僚机为圆心的圆弧屏障，覆盖“前方 + 侧前方”（随 side 镜像到外侧）
  //   arcFrom/arcTo 为相对“竖直向上”朝外侧扫过的角度（度）；segments 为折线逼近段数（供扫掠相交/裁切）
  //   scale 为整体尺寸系数：绘制（机体/盾板/尾焰/辉光）与挡弹折线半径统一乘算，保证视觉与判定一致
  const BULWARK = {
    radius: 30, arcFrom: -10, arcTo: 100, thickness: 6, segments: 12,
    scale: 0.9,   // 整体缩小 10%
    color: '#eaf6ff', glow: '#bfe4ff',
  };

  // ---------- 守愿者白盾 × 射弹交互属性注册表（四类；新增射弹在此登记并按类实现）----------
  //   一类·截断（默认行为，无标注字段）：长条激光类射弹——被白盾截断 / 磨短 / 吸收。
  //     盾判定与其他射弹同一套白盾几何（无收窄；技能3 按弹体半径 / 技能6 按光束半宽 + 半盾厚）
  //     现役：法术大师A1/A2 激光（laser 弹，08-entities laser 分支）、风暴编织者技能3 "<"光束（beamTrail 分支）、
  //           风暴编织者技能6 电弧光束（s.beams clipD，见 05-boss runStorm2Skill）
  //   二类·穿透（c.swPen 标记）：白盾无法截断——触盾直接穿过并标记，此后命中玩家伤害 -50%。
  //     现役：法术矩阵射弹 / 法术阵列射弹 / 法术阵列分裂射弹（spellCubes，见 06-enemy updateSpellCubes / splitSpellCube）
  //   三类·反射（b.swRef 标记）：首次触盾按入射夹角镜像反弹（反射角=入射角，非原路弹回）；
  //     反弹后失去墙壁反弹能力（bounceX 清除）；同一射弹仅反弹一次，再次触盾白盾无任何效果（直接穿过、伤害不减）。
  //     现役：旧日之歌暗黑射弹（技能5/6 + 登场部件球弹幕，见 05-boss fireDarkSix / updateBoss；反弹见 08-entities swRef 分支）
  //   四类·免疫：白盾对其无任何影响——不截断、不吸收、无伤害损失。
  //     现役：风暴编织者技能1/2 激光（s.beams 专用光束，不经 eBullets；截断逻辑已移除，见 runStorm2Skill 技能1/2）

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
   *        prolifera  增生侧翼艇（1类特殊）：淡青绿、无攻击；阵亡分裂 0~3 个卫护飞船（escort），加血道具掉率 ×3
   *        escort     卫护飞船（增生侧翼艇衍生）：深蓝紫渐变小三角（边缘紫光）、无攻击、沿原航向漂移；碰撞伤/无敌时间 ×0.4；不掉落
   *   2类 striker  上方入场，血低；垂直向下直射，少部分追踪射击
   *   3类 gunship  上方入场，体型稍大血中；悬停上方，扇形 / 环形 / 双连炮多种弹幕
   *   4类 capital  上方居中入场，体型大血高；悬停上方，螺旋环 / 扇形齐射 / 环形爆发密集弹幕，
   *                 出场与在场期间由 1、2 类敌机护航
   */
  const ENEMY_TYPES = {
    side: {
      w: 34, h: 30, hp: 10,  score: 50,   color: '#8ce36b', drawScale: 1.4,   // 分数：白影/增生/黄芒/赤月 50；紫电 80（makeEnemy 按行为覆盖）
      bulletSpeed: 230, bulletR: 4, bulletDmg: 6, crashDmg: 15,
      fireInterval: [1.4, 2.2],
    },
    // 增生侧翼艇（1类特殊）：淡青绿 1类艇，无攻击；生命/碰撞伤害与白影侧翼艇一致；
    // 阵亡时分裂 0~3 个卫护飞船（均等随机，可能不分），加血道具掉率为常规的 3 倍
    prolifera: {
      w: 34, h: 30, hp: 10,  score: 50,   color: '#7fe8c9', drawScale: 1.4,
      crashDmg: 15,                // 与白影侧翼艇一致 15（怪物属性总表；2026-09 批次前误为 12）
      fireInterval: [1.4, 2.2],   // 无攻击，字段仅为 makeEnemy 取值完整性
    },
    // 卫护飞船（增生侧翼艇衍生）：小三角形（纯等腰三角、无核心），深蓝紫渐变（边缘紫光），无攻击，沿原航向继续飞行；
    // 撞击无敌时间为增生侧翼艇的 40%（0.48s）；不掉落任何水晶与道具
    escort: {
      w: 12, h: 14, hp: 1,   score: 20,   color: '#6a5ce0', drawScale: 1.25,   // 深蓝紫（与浅蓝水晶区分）
      crashDmg: 10,                // 绝对值（怪物属性总表 2026-09 批次）
      invulnMul: 0.4,             // 撞击造成的无敌时间同样为 40%（0.48s）
      fireInterval: [1.4, 2.2],   // 无攻击，字段仅为 makeEnemy 取值完整性
    },
    striker: {
      w: 46, h: 40, hp: 56,  score: 130,  color: '#ff3b30', drawScale: 1.4,
      bulletSpeed: 280, bulletR: 5, bulletDmg: 8, crashDmg: 28,
      fireInterval: [1.1, 2.0],
    },
    gunship: {
      w: 76, h: 62, hp: 400,  score: 350,  color: '#c084fc', drawScale: 1.55,   // 紫晶基准血量 400；赤红 400 / 金曜 420 见 VARIANTS（变体另带独立下降速度与首射延迟）
      bulletSpeed: 250, bulletR: 4, bulletDmg: 8, crashDmg: 36,
      firstFire: [1.2, 2.4],   // 出场后首次射击延迟随机区间（就位后计，与出场途径无关）；金曜走此默认，紫晶/赤红见 VARIANTS
      fireInterval: [1.8, 2.4],
    },
    capital: {
      w: 192, h: 134, hp: 4200, score: 1300, color: '#ff4d6d', drawScale: 2.0,   // 三变体同血量；下降速度按变体区分（250/220/280，见 updateEnemyMovement）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 10, crashDmg: 48,
      fireInterval: [2.4, 2.8],
    },
    // 特殊3类：炮火先兆者（后排炮兵）—— 灰黑形体 + 红色充能核心，充满后召唤垂直落下的导弹
    harbinger: {
      w: 82, h: 82, hp: 1000, score: 550, color: '#3a3f4a', drawScale: 1.68,   // 体型增大 20%（含碰撞盒同步）
      bulletSpeed: 210, bulletR: 6, bulletDmg: 16, crashDmg: 30,
      fireInterval: [4, 4],
    },
    // 特殊3类：威龙（高血量无人机）—— 俯视四旋翼无人机、橙黄渐变；蛇形巡航、朝玩家三连快弹（弹速 380）、攻击时停移
    weilong: {
      w: 76, h: 70, hp: 5000, score: 1100, color: '#ff9a1a', drawScale: 1.5,
      bulletSpeed: 230, bulletR: 5, bulletDmg: 12, crashDmg: 30,
      fireInterval: [1.91, 2.43],   // 攻击间隔在原 [1.47,1.87] 基础上 +30%（更稀疏）
    },
    // 特殊3类：寒霜（冰霜无人机）—— 俯视四旋翼无人机、灰黑渐变 + 天蓝霜纹边缘；
    // 不攻击：50% 顶部入场（初速+100%）/ 50% 侧翼斜向下入场，到 72%~82% 高度停留 20s；登场 1s 后展开寒霜光圈（减速见 HANSHUANG）
    hanshuang: {
      w: 61, h: 56, hp: 700, score: 500, color: '#8fd8ff', drawScale: 1.2,   // 机体缩小 20%（含碰撞盒同步）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 20,
      fireInterval: [1e9, 1e9],   // 不攻击：间隔天文数字，永不落入通用开火逻辑
    },
    // 特殊3类：御4（防御无人机）—— 俯视四旋翼无人机、介于圆与方之间的超椭圆暖灰渐变机体 + 金色 X 形条纹 + 四角风扇圆；
    // 不攻击：登场 0.5s 后展开金色六边力场（光环内敌人受到的非真实伤害 -30%），停留 22s；Lv11 前不出场
    yu4: {
      w: 53, h: 53, hp: 700, score: 500, color: '#d6c078', drawScale: 1.02,   // 机体缩小 15%（含碰撞盒同步：62→53、drawScale 1.2→1.02）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 20,
      fireInterval: [1e9, 1e9],   // 不攻击：间隔天文数字，永不落入通用开火逻辑
    },
    // 特殊3类：铁砧（治疗无人机）—— 菱形黑灰框架 + 中央灰黑正方形 + 上下左右横杠 + 中心朝下凸出白杠 + 正方形青绿治疗光环；
    // 不攻击：登场 0.5s 后展开治疗光环（圈内所有敌人含自身每秒回复 1% 最大生命 + 60），悬停于炮火先兆者前方，停留 22s；Lv11 前不出场
    anvil: {
      w: 70, h: 58, hp: 500, score: 500, color: '#8ce36b', drawScale: 1.44,   // 体型增大 20%（58×48 → 70×58；drawScale 同步 ×1.2 使视觉与碰撞盒一致）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 20,
      fireInterval: [1e9, 1e9],   // 不攻击：间隔天文数字，永不落入通用开火逻辑
    },
    // 特殊3类：暴鸰（自爆无人机）—— 白灰磨角方形机体（较威龙小 20%）+ 灰黑渐变横杠连四角风扇（淡黄桨心）
    // + 前挂黑色圆炸弹（红道 + 白骷髅）；不悬停直线下压，接近玩家停车投弹，投弹后提速俯冲离场
    baoling: {
      w: 56, h: 60, hp: 600, score: 500, color: '#e3e6ec', drawScale: 1.2,
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 24,
      fireInterval: [1e9, 1e9],   // 不攻击：投弹流程由移动状态机驱动
    },
    // 特殊3类：焦香螺旋桨（火焰灼烧无人机）—— 橙火红渐变环 + 黑色核心 + 白色圆 + 三根异速旋转白色横杠；
    // 无碰撞伤害、不攻击：登场后移动到场地 40% 以下位置绕大圈巡航；火焰光环持续灼烧我方战机（近本体翻倍）
    jiaoxiang: {
      w: 67, h: 54, hp: 1200, score: 600, color: '#ff7a18', drawScale: 1.36,   // 本体缩小 20%（w/h/drawScale 同步；原比 3 类炮艇大 10%）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 0,   // 无碰撞伤害
      fireInterval: [1e9, 1e9],   // 不攻击：间隔天文数字，永不落入通用开火逻辑
    },
    // 特殊2类：斗志昂扬（增益无人机）—— 造型类暴鸰（白灰磨角方形机体 + 四角风扇），中心为上扬双箭头标志；
    // 下方挂载较大蓝色盒子（盒上方淡黄色空心正方形图案），四轮中心红色间歇闪光；
    // 无碰撞、不攻击：升级时 4% 概率从左/右侧横穿（余弦上下浮动）；击毁后我方攻速/弹速翻倍 8s
    douzhi: {
      w: 56, h: 60, hp: 280, score: 100, color: '#c9d8ea', drawScale: 1.2,
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 0,   // 无碰撞伤害（与玩家互相穿过，见 updateEnemies）
      fireInterval: [1e9, 1e9],   // 不攻击
    },
    // 特殊2类：赞助无人机 / 豪华赞助无人机（诗篇新敌实装 2026-09-29）——造型/行动同斗志昂扬，
    // 击败后掉落奖励道具（普通/稀有，见 06-enemy grantRewardItem）；数值全部同斗志昂扬
    sponsor: {
      w: 56, h: 60, hp: 280, score: 100, color: '#f2f5fa', drawScale: 1.2,
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 0,   // 无碰撞伤害（与玩家互相穿过，见 updateEnemies）
      fireInterval: [1e9, 1e9],   // 不攻击
    },
    sponsorDeluxe: {
      w: 56, h: 60, hp: 280, score: 100, color: '#ffe9a8', drawScale: 1.2,
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 0,   // 无碰撞伤害（与玩家互相穿过，见 updateEnemies）
      fireInterval: [1e9, 1e9],   // 不攻击
    },
    // 特殊2类：法术大师A1（紫光激光无人机）—— 四角风扇圆 + 灰黑矩形机身(1:3:1 紫光条) + 底部深紫炮管；
    // 不停留：入场 1.2~3s 后开始攻击（停移射击），50% 概率横移再恢复下降；lv11 前低权重、lv11 起较多出现
    fashiA1: {
      w: 46, h: 40, hp: 80, score: 160, color: '#a855f7', drawScale: 1.4,
      bulletSpeed: 380, bulletR: 5, bulletDmg: 16, crashDmg: 24,   // 碰撞 24（2026-09 批次：取消分段）
      fireInterval: [1e9, 1e9],   // 攻击逻辑在移动状态机内处理，不走通用开火
    },
    // 特殊2类：破片（三连发导弹无人机）—— 造型类铁砧但更小、灰白金属主导（边框+核心）；中心两条黑杠（头部红、下方缩短）；
    // 下方两根黑色炮管（前部加粗、图层最底）；只沿直线飞到选定点后急停锁停（除非被击毁不再移动），停稳后才攻击；
    // 索敌范围 30% 屏高起步、每秒 +5%；攻击时玩家位置红圈预警 0.8s → 快速三连发不可击毁导弹（8/5/5，条件性无视无敌）；lv11 前低权重
    popian: {
      w: 55, h: 48, hp: 200, score: 160, color: '#cfd6e0', drawScale: 1.2,   // 体型同常规 2 类突击艇 ×1.2
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 24,   // 碰撞 24（2026-09 批次：取消分段）
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
    // 撞上守愿者白盾直接穿过（二类·穿透射弹，注册表见 BULWARK 注释）：无法被截断，穿盾后命中伤害 -50%；
    // 受主战机（非僚机）伤害 -30%；场上存在 3 类「法术阵列」(fashiArray) 时偏移角增至 ±25°、正方体速度 +25%（见 FASHI_MATRIX）
    fashiMatrix: {
      w: 27, h: 48, hp: 80, score: 160, color: '#ff5566', drawScale: 1.02,   // 竖菱形碰撞盒 h≈1.8w；整体缩小 30%（原 38×68 / drawScale 1.45）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 24,   // 碰撞伤害 24；正方体走独立 spellCubes 弹道，不用通用子弹字段
      fireInterval: [1e9, 1e9],   // 攻击逻辑在专属状态机内处理，不走通用开火
    },
    // 特殊4类：法术阵列（血红三菱法师母机）—— 三座法术矩阵样式的菱形 + 灰黑底座；
    // 体型/碰撞伤害等同炮火先兆者，整体移速为其 65%：匀速下降（无减速动作）到屏幕上方 20%~30% 后
    // 像法术矩阵一样胡乱移动（不脱离屏幕）并散发血红雾气，30s 后向上飞离战场；
    // 朝玩家发射法术矩阵同款但大一号的红色正方体（伤害 26、红光更强），
    // 飞行 30%~60% 射程时（提前 0.5s 红圈收缩预警）分裂为 3 枚常规正方体（1 同向 + 2 垂直，微弱冲击波）；
    // 就位 2.5s 后首次召唤、其后每 5s：闪动红光并在周围召唤一个法术矩阵（召唤体死亡不加分不掉水晶、
    // 1s 后开始攻击并随机移动），飞离期间不召唤；Lv11 前不出场（Lv11 起占 4 类槽位，见 spawnCapitalSlot）
    fashiArray: {
      w: 82, h: 82, hp: 3500, score: 1300, color: '#c22b3d', drawScale: 1.68,   // 体型同炮火先兆者；4 类级血量
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 40,
      fireInterval: [1e9, 1e9],   // 攻击逻辑在专属状态机内处理，不走通用开火
    },
    // 战争矩阵（诗篇级 4B，2026-10-03 占位待设计）：矩阵类敌人的诗篇级上位——战争主题的大型矩阵装置，
    // 具体机制/数值/外观待定；当前仅注册占位，不进入常规出怪（无权重、无生成调用），图鉴挑战模式经
    // spawnChallengeTargetOne 召唤（走 04-spawn spawnWarMatrix 占位函数，移动/开火/绘制待实装）
    warMatrix: {
      w: 90, h: 90, hp: 4500, score: 1300, color: '#7a3b2e', drawScale: 1.2,   // 血量 4500（2026-10-04 用户定稿：虚象/具象/真我 4500 用基准、诗篇 10000 走 POEM_HP.warMatrix 覆写；原 3600 占位作废）；其余数值占位待《怪物属性总表.xlsx》校准
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 40,
      fireInterval: [1e9, 1e9],   // 占位：不攻击，机制待设计
    },
    // 特殊敌机：暴风之眼技能2 召唤的大型龙卷（可击毁、缓慢下移直至脱离战场、随机 360° 射风弹）
    tornado: {
      w: 144, h: 144, hp: 3600, score: 0, color: '#eaf6ff', drawScale: 1,
      bulletSpeed: 170, bulletR: 5, bulletDmg: 16, crashDmg: 42,
      fireInterval: [0.2, 0.3],
    },

    // ---------- 诗篇难度新敌（2026-09-28 批次注册表，逐个实装中） ----------
    // 不进入常规出怪（无权重、无生成调用，诗篇接入另行批次）；已实装专属外观与技能的，
    // 从 WIP_PLACEHOLDER_TYPES 清单移除并挂接专属行为；未实装的数值为占位待定
    //（fireInterval 天文数字 = 不攻击）；图鉴挑战模式经 spawnChallengeTargetOne 召唤
    popianU: {          // 破片U型（2类，诗篇新敌）：破片升级版——入场无需锁停就位即可索敌攻击（数值/样式同破片，红色细节分叉见 drawPopianUBody 与 POPIAN_U）
      w: 55, h: 48, hp: 250, score: 220, color: '#cfd6e0', drawScale: 1.2,   // 体型/碰撞同破片；血量 250（破片 200）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 24,
      fireInterval: [1e9, 1e9],   // 攻击逻辑在移动/开火状态机内处理（同破片），不走通用开火
    },
    baolingG: {         // 暴鸰·G（3类）：暴鸰升级版——数值全部同暴鸰，仅 HP 800（移速/爆炸半径分叉见 BAOLING_G）
      w: 56, h: 60, hp: 800, score: 500, color: '#ffd8a8', drawScale: 1.2,
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 24,
      fireInterval: [1e9, 1e9],   // 不攻击：投弹流程由移动状态机驱动（同暴鸰）
    },
    warGhost: {         // 战争幽灵（4类，诗篇新敌）：风波预警极速入场冲撞 → 驻留中场技能循环 → 直线预警加速斩出；
                        // 光环强化破片系/铁砧、半血召唤（见 WAR_GHOST 与 06-enemy warGhost 分支）
      w: 98, h: 72, hp: 4200, score: 1300, color: '#ffd24a', drawScale: 1.28,   // 金黄渐变流动机体；2026-10-01 用户定稿整体缩小 25%（碰撞盒与绘制比例同 ×0.75，视觉/判定比例不变）
      bulletSpeed: 138, bulletR: 5, bulletDmg: 10, crashDmg: 40,   // bulletSpeed=技能3弹幕弹速（2026-10-03 用户定稿 +25% 110.4→138，回到 -20% 前基准）；bulletDmg=弹幕每发伤害；入场冲撞走 WAR_GHOST.entryDmg 50
      fireInterval: [1e9, 1e9],   // 攻击逻辑在专属状态机内处理（技能循环），不走通用开火
    },
    // 特殊3类：脉冲矩阵 —— 三座法术矩阵菱形「骑边拼合」成等边三角形（长对角线各骑一条边、中心=边中点，
    // 6 个长轴端点两两重合于三角形顶点）+ 中央暗红核心；五档充能张合（纯视觉：闭合→全开露核心按攻击周期循环）；
    // 周期性范围脉冲（伤害 30、半径同焦香火焰光环；释放前 0.6s 红圈收缩预警，参数见 PULSE_MATRIX）
    pulseMatrix: {
      w: 90, h: 90, hp: 800, score: 600, color: '#ff4d5e', drawScale: 1,   // 碰撞盒 ≈ 骑边拼合体外接方（外轮廓半径 44 = 三角形顶点距中心，外接 88 酌收）；诗篇血量 2400（POEM_HP.pulseMatrix，makeEnemy 按难度覆盖）；分数/水晶与焦香螺旋桨等同
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 24,
      fireInterval: [2.2, 2.2],   // 常规脉冲间隔（诗篇 1.9，见 PULSE_MATRIX；首次 2.1s 由出生参数指定）
    },
    unreal: {           // 虚幻（3类）：暴鸰同款机体的冰霜投弹型——各项数值与暴鸰等同（见 UNREAL），伤害为暴鸰 70%；
                        // 炸弹爆炸 / 殉爆原地留下寒冷区域（半径 100、持续 3~5s，效果与寒霜光圈同款）
      w: 56, h: 60, hp: 600, score: 500, color: '#cfe4ff', drawScale: 1.2,
      bulletSpeed: 230, bulletR: 5, bulletDmg: 0, crashDmg: 24,
      fireInterval: [1e9, 1e9],   // 不攻击：投弹流程由移动状态机驱动（同暴鸰）
    },
    // 黑暗之手麾下四精英（4S 敌人，2026-09-30 实装；不再属衍生敌人——独立图鉴条目入诗篇级分页，
    // 挑战召唤走 04-spawn spawnEliteMinion）：技能由专属状态机驱动（参数见 ELITES，逻辑见 06-enemy）。
    // 血量 1200 为实装占位值，待《怪物属性总表.xlsx》校准（本机无表，先按占位实装）
    puxuefeng: {        // 狞笑朴学峰（原名 狂笑朴学峰）：极速截击——流星穿刺 / 翼根连弩（两技 1↔2 交替）
      w: 110, h: 84, hp: 1200, score: 650, color: '#b21820', drawScale: 1.6,   // 四精英统一黑红（2026-10-02）
      bulletSpeed: 230, bulletR: 5, bulletDmg: 10, crashDmg: 40,
      fireInterval: [1e9, 1e9],
    },
    hanxixian: {        // 猩红韩希先（原名 韩希先）：三眼炮座——凝视锁定 / 旋眼火螺（两技循环）
      w: 110, h: 84, hp: 1200, score: 650, color: '#b21820', drawScale: 1.6,   // 四精英统一黑红
      bulletSpeed: 230, bulletR: 5, bulletDmg: 10, crashDmg: 40,
      fireInterval: [1e9, 1e9],
    },
    xiayong: {          // 铜皮夏勇（原名 夏勇）：重装壁垒——屏障 / 碎翼回旋刃 / 核心膨胀（暗壁 2026-10-03 移除；屏障同日新增）
      w: 110, h: 84, hp: 1200, score: 650, color: '#b21820', drawScale: 1.6,   // 四精英统一黑红
      bulletSpeed: 230, bulletR: 5, bulletDmg: 10, crashDmg: 40,
      fireInterval: [1e9, 1e9],
    },
    xinguodong: {       // 暴怒辛国栋（原名 辛国栋）：轰炸平台——地毯轰炸 / 十二连发
      w: 110, h: 84, hp: 1200, score: 650, color: '#b21820', drawScale: 1.6,   // 四精英统一黑红
      bulletSpeed: 230, bulletR: 5, bulletDmg: 10, crashDmg: 40,
      fireInterval: [1e9, 1e9],
    },
  };

  // ---------- 诗篇难度：全敌人血量表（单一数据源，2026-10-03 用户据《怪物属性总表.xlsx》第5行整理） ----------
  // 实装时 makeEnemy 按 isPoem() 门控覆盖（不经 enemyHpMul 乘区，为绝对值）；图鉴 showEncyDetail 同表展示。
  // key 规则：side 按行为（side_pass/shoot/kamikaze/swirl/moon）；striker/gunship/capital 按变体（如 striker_crimson）；
  // 其余按类型名。未列出的敌人诗篇不覆写血量（沿用基准）；4S 精英/张华&张策走机型级 hpByDiff（eliteHpOf）、BOSS 走 hpByDiff.poem。
  const POEM_HP = {
    side_pass: 40, side_shoot: 40, side_kamikaze: 40, side_swirl: 40, side_moon: 40,
    prolifera: 40, escort: 10,
    striker_crimson: 400, striker_amber: 400, striker_azure: 400, striker_violet: 400, striker_white: 400,
    striker_fortress: 3000, striker_dusk: 300,
    gunship_violet: 2000, gunship_crimson: 2000, gunship_amber: 2500, gunship_orange: 2000, gunship_cyan: 2000,
    capital_crimson: 9000, capital_azure: 9000, capital_crgold: 10000,
    harbinger: 3000, weilong: 9000, hanshuang: 2000, yu4: 2000, anvil: 2000,
    baoling: 1200, baolingG: 1400, unreal: 1200, jiaoxiang: 2800,
    douzhi: 400, sponsor: 400, sponsorDeluxe: 400,
    fashiA1: 360, popian: 500, popianU: 500, fashiMatrix: 360,
    fashiA2: 2400, fashiArray: 7000, warGhost: 7000, pulseMatrix: 2400,
    warMatrix: 10000,
  };
  // 诗篇血量取值入口：key 优先 变体 → 行为 → 类型
  function poemHpOf(type, variantId, behavior) {
    if (variantId) { const k = type + '_' + variantId; if (POEM_HP[k] != null) return POEM_HP[k]; }
    if (behavior)   { const k = type + '_' + behavior;  if (POEM_HP[k] != null) return POEM_HP[k]; }
    return POEM_HP[type];
  }

  // 诗篇占位敌人类型清单（10-draw-world drawEnemy 用）：占位阶段统一渲染白色方块造型，
  // 图鉴预览同规则（13-encyclopedia drawEncyPreview 按 d.wip 判定；例外：黑暗之手 / 四精英已导入
  // 素材形象，图鉴画真实形象、游戏内仍白色方块，见本文件顶部各 Img 加载器）；实装专属外观时逐个移除
  // （2026-09-30：四精英与黑暗之手均已实装专属外观与技能，从占位清单移除——清单暂空，保留结构供后续占位批次复用）
  const WIP_PLACEHOLDER_TYPES = [
    // 战争矩阵（诗篇级 4B，2026-10-03 占位）：专属外观未实装，白色方块占位；后续实装后移除
    'warMatrix',
    // （其余战争幽灵 / 四精英等已实装专属外观的类型逐批移除；后续占位批次在此追加）
  ];

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
    missileDmgMin: 60,   // 导弹伤害下限：实际伤害 = max(此值, 当前血量 80%)（低血保底，不再直接秒杀）
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
    entryBoost: 2.6,     // 入场移速倍率（260%），在 entryDecay 内线性衰减回 100%
    entryDecay: 1,       // 入场加成衰减时长（s）
    maxTurn: 3.2,        // 炮口最大转向角速度（rad/s，与破片 POPIAN.maxTurn 等同）；攻击窗口期间炮口锁死
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
    triggerDist: CANVAS_H * 0.4,   // 索敌半径：40% 屏高（原 1/3；进入后停车锁定投弹）
    warnTime: 0.35,      // 预警区显示时长（2026-09-29 起炸弹在停车锁定瞬间即脱离，预警倒计时与下坠并行；机体停车段）
    dropTimeMin: 0.6,    // 炸弹脱离后的低速下坠时长下限（逐弹随机 0.6~0.8s；2026-09-29 起锁定瞬间即投弹（起点提前 0.35s），时长两轮 +0.1s，原 0.8 固定值）
    dropTimeMax: 0.8,    // 低速下坠时长上限；结束后加速飞向预警区中心
    postThrowWait: 1.2,  // 投弹后原地停留时长（原 1.5 减少 0.3s），随后才继续俯冲
    dropSpeed: 70,       // 脱离/下坠初速（低速：不直接给高初速）
    strikeAccel: 4200,   // 飞向预警区中心的加速度（极强加速）
    blastR: 73,          // 爆炸半径（2026-09 批次 +10px；红色预警圈 / 玩家伤害半径）
    deathBlastR: 250,    // 亡语自爆（被击毁时原地爆炸）对周围敌方单位的波及半径（伴随扩散爆炸波）
    playerDmg: 40,       // 爆炸对玩家伤害
    enemyDmgBase: 600,   // 意外爆炸对敌人基础伤害
    enemyDmgRatio: 0.2,  // + 目标最大生命 20%
    enemyDmgCap: 2000,   // 对敌人伤害上限
    vuln: 0.35,          // 玩家处于爆圈内时对暴鸰的增伤（无论是否已投弹）
    crashDmg: 24,        // 碰撞伤害（结算走 ENEMY_TYPES.baoling.crashDmg，此处同步登记）
  };

  // 暴鸰·G 参数（特殊3类，诗篇新敌实装 2026-09-29）：全部数值与暴鸰一致，仅——
  //   移速 -15%（speedSlow / speedPost）、爆炸半径 +30%（blastR / deathBlastR）、HP 800（见 ENEMY_TYPES.baolingG）；
  // 其余字段全部引用 BAOLING 原值（BAOLING 数值调整时自动跟随；投弹时机等流程字段三机同规则，见 BAOLING / 06-enemy 状态机）
  const BAOLING_G = {
    speedSlow: BAOLING.speedSlow * 0.85,     // 投弹前下降速度（102 = 120 × 0.85）
    speedPost: BAOLING.speedPost * 0.85,     // 投弹后俯冲速度（204 = 240 × 0.85）
    blastR: BAOLING.blastR * 1.3,            // 爆炸半径（94.9 = 73 × 1.3；红色预警圈 / 玩家伤害半径）
    deathBlastR: BAOLING.deathBlastR * 1.3,  // 亡语自爆对周围敌方单位的波及半径（325 = 250 × 1.3）
    vuln: BAOLING.vuln,                      // 玩家处于爆圈内时对暴鸰·G 的增伤（同暴鸰 0.35）
  };

  // 虚幻参数（特殊3类冰霜投弹机，2026-09-29 实装）：机体与各项数值全部与暴鸰一致（引用 BAOLING 原值自动跟随），仅——
  //   全部伤害为暴鸰 70%（投弹爆炸对玩家 / 殉爆对敌人同比例）；炸弹为蓝/深蓝渐变矩形弹（圆柱弹体涂装）；
  //   炸弹爆炸落点 / 殉爆原地留下寒冷区域：半径 100、持续 3~5s（逐次随机），减速效果与寒霜光圈同款
  //   （圈内射速/移速 ×0.65，炽心装甲免疫同寒霜）——投掷炸弹的区域只对玩家生效、殉爆区域只对敌人生效；
  //   诗篇难度（isPoem）下两种寒冷区域均对双方生效；BOSS 受到寒冷区域减速/减移的效果减半（×bossResist）
  const UNREAL = {
    speedSlow: BAOLING.speedSlow,            // 投弹前下降速度（120，同暴鸰）
    speedPost: BAOLING.speedPost,            // 投弹后俯冲速度（240，同暴鸰）
    armDelay: BAOLING.armDelay,              // 登场后武装延时（同暴鸰）
    triggerDist: BAOLING.triggerDist,        // 索敌半径（40% 屏高，同暴鸰）
    warnTime: BAOLING.warnTime,              // 预警区出现 → 炸弹脱离间隔（同暴鸰）
    dropTimeMin: BAOLING.dropTimeMin, dropTimeMax: BAOLING.dropTimeMax,   // 低速下坠时长（同暴鸰）
    postThrowWait: BAOLING.postThrowWait,    // 投弹后停留时长（同暴鸰）
    dropSpeed: BAOLING.dropSpeed,            // 炸弹下坠速度（同暴鸰）
    strikeAccel: BAOLING.strikeAccel,        // 炸弹冲刺加速度（同暴鸰）
    blastR: BAOLING.blastR,                  // 爆炸半径 = 预警圈半径（73，同暴鸰）
    deathBlastR: BAOLING.deathBlastR,        // 殉爆对周围敌方单位的波及半径（250，同暴鸰）
    playerDmg: BAOLING.playerDmg * 0.7,      // 投弹爆炸对玩家伤害（28 = 40 × 70%）
    enemyDmgBase: BAOLING.enemyDmgBase * 0.7,    // 殉爆对敌人基础伤害（420 = 600 × 70%）
    enemyDmgRatio: BAOLING.enemyDmgRatio * 0.7,  // + 目标最大生命 14%（20% × 70%）
    enemyDmgCap: BAOLING.enemyDmgCap * 0.7,      // 对敌人伤害上限（1400 = 2000 × 70%）
    vuln: BAOLING.vuln,                      // 玩家处于爆圈内时对虚幻的增伤（同暴鸰 0.35）
    crashDmg: BAOLING.crashDmg,              // 碰撞伤害（同暴鸰 24，结算走 ENEMY_TYPES.unreal.crashDmg）
    frostR: 100,             // 寒冷区域半径（px）
    frostDurMin: 3,          // 寒冷区域最短持续（s）
    frostDurMax: 5,          // 寒冷区域最长持续（s）
    frostFireSlow: HANSHUANG.fireSlow,   // 寒冷区域内玩家射速倍率（×0.65，与寒霜光圈同款）
    frostMoveSlow: HANSHUANG.moveSlow,   // 寒冷区域内移速倍率（玩家移速 / 敌机移速通用，×0.65）
    bossResist: 0.5,         // BOSS 受到寒冷区域减速/减移的效果倍率（效果减半）
    flakeEveryMin: 0.35,     // 寒冷区域雪花特效间歇出现最短间隔（s）
    flakeEveryMax: 0.7,      // 寒冷区域雪花特效间歇出现最长间隔（s）
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
    buffDuration: 8,     // 击毁后我方攻速/弹速翻倍持续时长（s）；不可叠加，重复获得直接重置为满时长
    buffMul: 2,          // 翻倍倍率
    boxFade: 0.25,       // 蓝盒脱离并迅速渐隐时长（掉落速度 ×2；渐隐结束后触发光环/增益/本体渐隐）
    haloDur: 0.4,        // 淡黄色扩大光环特效时长（扩大速度 ×2）
    bodyFade: 0.35,      // 本体快速渐隐时长（蓝盒渐隐结束后开始）
    boxDetach: 34,       // 蓝盒脱离时向下漂离距离
  };

  // 赞助无人机 / 豪华赞助无人机参数（特殊2类奖励无人机，2026-09-29）：造型/行动基本同斗志昂扬，差异仅——
  //   移速 -20%、上下摆动幅度大幅降低（×0.35）、盒子高度 -15%；盒子颜色：赞助=白色 / 豪华赞助=淡黄色（斗志=蓝色）；
  //   击败后掉落奖励道具（sponsor 90% 普通 + 10% 稀有 / sponsorDeluxe 必定稀有），道具系统见 06-enemy grantRewardItem
  const SPONSOR = {
    speed: DOUZHI.speed * 0.8,     // 横穿速度（96 = 120 × 0.8）
    ampY: DOUZHI.ampY * 0.35,      // 上下余弦振幅（11.2 = 32 × 0.35，大幅降低）
    boxHMul: 0.85,                 // 盒子高度倍率（略微降低 15%）
  };

  // 奖励无人机刷新体系（2026-09-29）：虚象/具象/真我/诗篇难度下每次关卡等级提升，
  // 按 chances[难度] 概率刷新一架奖励无人机（每次至多一架），再按 weights 在三种中加权抽取；
  // （原 DOUZHI.spawnChance 单机概率体系废弃，斗志昂扬的出场并入本权重表）
  const REWARD_DRONES = {
    chances: { illusion: 0.12, form: 0.10, realme: 0.07, poem: 0.07 },
    weights: { douzhi: 5, sponsor: 4, sponsorDeluxe: 1 },
  };
  // 当前难度的奖励无人机刷新概率（未登记难度回退 0.07）
  function rewardDroneChance() {
    const c = REWARD_DRONES.chances[currentDifficulty.id];
    return c != null ? c : 0.07;
  }
  // 加权抽取本次刷新的奖励无人机类型（douzhi 5 / sponsor 4 / sponsorDeluxe 1）
  function pickRewardDroneType() {
    const total = REWARD_DRONES.weights.douzhi + REWARD_DRONES.weights.sponsor + REWARD_DRONES.weights.sponsorDeluxe;
    let r = Math.random() * total;
    for (const k of ['douzhi', 'sponsor', 'sponsorDeluxe']) {
      r -= REWARD_DRONES.weights[k];
      if (r <= 0) return k;
    }
    return 'douzhi';
  }

  // 法术大师A1 参数（特殊2类紫光激光无人机）：不停留、出场 1.2~3s 后停移射击、50% 横移再恢复下降；
  // 所有移动速度统一固定 160（原两段巡航 200/140 统一，2026-09 批次；平滑切换逻辑保留、两段同速等效恒速）
  const FASHI_A1 = {
    entrySpeed: 160,     // 上 25% 屏高线（y = CANVAS_H × 0.25）以上的巡航速度（统一 160）
    speed: 160,          // 越线后的下压巡航速度（统一 160）
    cruiseAccel: 3.5,    // 两段巡航切换的平滑率（1/s）——速度曲线连续、无瞬变
    accel: 14,           // 加速度系数（很大：停移/横移/恢复都极快但平滑）
    firstDelay: [1.2, 3],       // 登场后随机 1.2~3s 触发首次刹停攻击（每架独立随机，同 A2）
    fireInterval: [1.0, 1.5],   // 攻击间隔：随机 1~1.5s
    firePause: 0.25,     // 停稳后到发射的短暂停顿（视觉反馈）
    fireLingerAfter: 0.35, // 发射后继续静止时长（不移动，原 0.15 + 0.2）
    laserSpeed: 420,     // 激光射弹速度
    laserDmg: 16,        // 激光伤害
    laserLenPct: 0.4,    // （已废弃：激光无上限生长，直到尾端出界才消失）
    laserGrowRate: 117,  // 激光生长速率 px/s：无上限持续生长，直到尾端出界才消失（130 → 117，-10%）
    laserR: 5,           // 激光宽度（半径）
    strafeChance: 0.5,   // 攻击后 50% 概率朝斜下方（45°）移动
    strafeMin: 80,       // 斜移水平分量最小距离
    strafeMax: 160,      // 斜移水平分量最大距离
    strafeSpeed: 160,    // 横移速度（统一 160，原 192）
    spawnLowLv: 0,       // lv11 前替换概率（0 = 不替换，仅图鉴挑战可生成）
    spawnHighLv: 0.60,   // lv11 起替换概率（较多出现）
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
    maxTurn: 3.2,          // 最大转向角速度（rad/s）：抵达时刻的满角速度（减速段追踪玩家）
    brakeTurn0: 0.2,       // 开始减速瞬间的初始角速度（rad/s，极低）——减速段内随剩余距离线性加速到 maxTurn（恒角加速度）
    fireAlign: 0.35,       // 发射所需朝向对齐阈值（弧度，约 20°）：未朝向玩家时无法发起攻击
    spawnLowLv: 0.02,      // lv11 前替换概率（很低）
    spawnHighLv: 0.20,     // lv11 起替换概率
  };

  // 破片U型参数（诗篇新敌，特殊2类）：移动/攻击流程与破片同（06-enemy popian 分支 + spawnPopian），
  // 差异项在此覆盖——① 入场途中即旋转瞄准玩家（无需锁停就位即可索敌攻击，尾焰改随移动方向）；
  // ② 入场后 firstDelay 区间随机后才可射击（诗篇难度取 firstDelayPoem，登记《诗篇难度修正.md》）；
  // ③ 三连发导弹伤害各 +2（10/7/7）。其余（移速/停留区间/红圈预警/间隔/爆炸半径等）全部沿用 POPIAN
  const POPIAN_U = {
    firstDmg: 10,               // 首发导弹伤害（破片 8 +2）
    followDmg: 7,               // 后两发导弹伤害（破片 5 +2）
    firstDelay: [1.8, 2.0],     // 入场后可射击延迟（逐架随机，s）
    firstDelayPoem: [1.6, 2.0], // 诗篇难度同延迟
  };

  // 战争幽灵参数（特殊4类，诗篇新敌实装 2026-09-29）：白色风波预警 → 极速入场冲撞（50 伤害+强击退）→
  // 抵达演出 → 驻留中场技能循环（首个从{2,3}随机、之后固定 1→2→3）→ 驻留 30s 后直线预警加速斩出离场；
  // 驻留期间光环：场上破片/破片U型/铁砧移速与加速度 ×2（+100%，2026-09-29 由 ×3 下调）、破片无视攻击距离（作用点 06-enemy warGhostAura
  // 与 popian / anvil 分支）；半血一次性召唤：目标点在幽灵身侧略微后方（06-enemy）
  const WAR_GHOST = {
    // —— 入场 ——
    stayYPctMin: 0.50, stayYPctMax: 0.65,   // 停留点高度区间（占屏高比，从上往下）
    stayXPctMin: 0.15, stayXPctMax: 0.85,   // 停留点横向区间（占屏宽比）
    entryWarn: 2.667,      // 入场白色风波预警时长（s，两段式：前 55% 风波流带自屏外远端沿来向延伸而来（从远处出现），后 45% 停留点浮现与机体等大的预警圈）——2026-10-03 用户定稿「预警区域增长速度 -40%」：1.6/0.6 ≈ 2.667，两段内部 55/45 比例不变整体放慢，登场（出场）时间相应延后 ≈1.07s
    entrySpreadDeg: 60,    // 来向扇区半角（度）：以停留点正上方为轴 ±60° 内随机取来向
    entrySpeed: 1500,      // 入场冲刺巡航速度（px/s，屏外起点沿来向直冲）
    entryDecelK: 14,       // 临近停留点指数减速逼近率（1/s）：v = min(entrySpeed, k×剩余距离)，≈0.35s 平滑减速到 0（位置逐帧连续、无 snap）
    entryDmg: 50,          // 入场冲撞命中我方伤害（+强力击退，复用 05-boss knockbackPlayer；独立于 crashDmg）
    knockback: 700,        // 入场冲撞击退强度（击退初速 px/s，0.32s 指数衰减）
    arriveLeadDist: 240,   // 入场冲刺提前入演出的距离阈值（px）：剩余距离 ≤ 此值即转抵近滑行 + 扫斩演出——2026-10-02 用户定稿「碰触预警圈后就开始斩击」（预警圈半径 70×drawScale 1.28 ≈ 89.6px）；2026-10-03 定稿再提前 0.1s：90→240 = 预警圈半径 + 满速 1500px/s × 0.1s 提前冲程（240→89.6 段几乎全程满速，150px/1500 ≈ 0.100s）；冲刺末段不停顿、扫斩与滑行重叠
    arriveFxDur: 0.885,    // 抵达演出总时长（s）= 刃增长 0.10 + 扫斩 0.185 + 斩后停持 0.10 + 归鞘 0.50（2026-10-02 用户定稿四段；2026-10-03 定稿停持缩短 0.10s、扫斩提速 +70%）
    arriveGrowDur: 0.10,   // 抵达演出·刃增长段（s）：双刃 66→92 快速伸长（二次 easeOut），保持贴舷前指、不旋转——先增长、然后再斩击
    arriveSweepDur: 0.185, // 抵达演出·扫斩段（s）：角速度 0 起步（二次 easeIn 加速）→ 峰值 ≈1170°/s（2026-10-03 用户定稿最大角速度 +70%：曲线形状不变、总角 150° 不变，时长 0.315/1.7 ≈ 0.185 等比缩短，峰值 ≈688×1.7）→ 65% 行程后 smoothstep 减速到 0（快结束时开始减速）；扫转总角 150° 不变
    arriveHoldDur: 0.10,   // 抵达演出·斩后停持段（s）：扫斩结束后双刃在斩后位置（150° 全开）停留此时长，再开始归鞘（2026-10-03 用户定稿 0.40→0.15→0.10；技能1 同样适用——停持属扫斩后演出；扫斩特效在扫斩结束 0.06s 内快速消散，停持阶段不再有）
    // —— 驻留悬停摆动 ——（全部 sin 项 t=0 偏移 0 + 幅度缓入，与抵达瞬间位置/速度严格连续）
    wobAmpX: 14, wobAmpY: 10,   // 摆动振幅（px）
    wobRamp: 2.0,          // 摆动幅度缓入时长（s）
    wobFreqX: 0.9, wobFreqY: 1.2,   // 摆动角频率（rad/s，小幅低速）
    // —— 技能循环 ——
    skillGap: 2.2,         // 技能间隔（s）
    fanRange: 160,         // （已废弃：技能1 改两刃斩击后扇形判定删除，保留占位防外部引用；2026-10-02）
    fanWarn: 1.2,          // 技能1（两刃斩击）预警时长（s）：双刃自翼侧展开+扇面预警，随后复用抵达演出同款扫转动画（2026-10-02 用户定稿 +0.4s 0.8→1.2）
    fanDmg: 40,            // 技能1（两刃斩击）扫斩伤害（扫斩扇面覆盖窗口内对玩家一次性结算；2026-10-02 用户定稿登场两侧斩击动作命名为「两刃斩击」并入技能循环）
    sweepReach: 180,       // 技能1 扫斩判定半径（px，世界系）：基准 150（挂载点半径 25 + 刃长 92 = 117 局部 × drawScale 1.28 ≈ 150）×1.2（2026-10-02 用户定稿技能时斩击半径 +20%；渲染刃长同倍放大见 09-draw-ships arcR）
    entryDelay: 0.35,      // 入场登场延迟（s）：预警全部出现完毕后再停此时长才冲刺（2026-10-03 用户定稿 -0.1s：0.5→0.4，再 -0.05s：0.4→0.35）
    entryDelayRealme: 0.25, // 入场登场延迟 · 真我（s）（2026-10-03 用户定稿 -0.2s：0.5→0.3[此前真我与普通共用 0.5]，再 -0.05s：0.3→0.25）
    entryDelayPoem: 0.1,   // 入场登场延迟 · 诗篇（s）（2026-10-03 用户定稿 -0.25s：0.4→0.15，再 -0.05s：0.15→0.1）
    slashGap: 70,          // 技能2 双刃出射点间距（px，沿锁定方向法线两侧对称——左右翼位置两刃同出）
    slashTrack: 0.5,       // 技能2 双斩线跟随玩家时长（s）→ 锁定
    slashLockWarn: 0.85,   // 技能2 锁定后预警时长（s）→ 能量刃闪动发射斩击流（2026-10-03 用户定稿「停留瞄准时长 -0.15s」：1.0→0.85）
    slashDmg: 35,          // 技能2 斩击流伤害（每道）
    slashSpeed: 1456,      // 技能2 斩击流飞行速度（px/s，2026-10-02 用户定稿 -20% 1820→1456）
    barrageDirs: 3,        // 技能3 每波方向数：基准方向 + 与之夹 120° 的两方向（互成 120° 均布；2026-10-02 用户定稿）
    barragePerDir: 3,      // 技能3 每方向发数（同帧扇形齐射，非同向连射）
    barrageFanDeg: 20,     // 技能3 同方向相邻两发夹角（度，扇心对准方向）
    barrageWaveGap: 0.945, // 波间隔（s，2026-10-02 用户定稿 +40% 0.675→0.945）；连续三波：第2波整体旋转 60°、第3波与第1波同向，初始方向随机
    barrageRotDeg: 60,     // 第2波旋转角（度）
    barrageDmg: 10,        // 技能3 每发伤害
    barrageR: 10.2,        // 技能3 子弹半径（2026-10-02 用户定稿 +20% 8.5→10.2；黄红渐变渲染走 eBullet grad==='yr' 分支）
    // —— 离场 ——
    dwell: 30,             // 驻留时长（s，抵达演出结束后起算；挑战模式永驻不离场）
    exitWarn: 1.0,         // 离场直线预警时长（s，入场同款白色风波、纯直线无落点，预警出现瞬间锁定玩家方向）
    exitAccel: 5200,       // 离场斩击加速度（px/s²，速度从 0 平滑加速，≈0.46s 到满速）
    exitMaxSpeed: 2400,    // 离场速度上限（px/s，沿锁定直线斩出直到出界）
    // —— 光环 ——
    auraSpdMul: 2,         // 破片/破片U型/铁砧移速倍率（2026-09-29：3 → 2，即 +100%）
    auraAccMul: 2,         // 同三者加速度倍率（移速 ×2 时逼近率同步 ×2，防止高速下冲过停留锚点）
    // —— 半血召唤目标点 ——（2026-09-29：由屏幕两侧边缘改为幽灵身侧略微后方）
    summonSideGap: 70,     // 目标点距幽灵的横向间距（左右各一）
    summonBackY: 40,       // 目标点距幽灵的纵向靠后量（幽灵机头朝下→后方即上方）
  };

  // ---------- BOSS：黑暗之手（第二轮候选，2026-09-30 实装常态技能） ----------
  // 入场：黑洞形成（2.7s）→ 本体浮现放大（2.3s）→ 战斗（复用旧日之歌黑洞入场演出，无部件组装段）；
  // 战斗移动：航点扫动（同 05-boss bossMoveUpdate / BOSS.move 参数结构，见 move）；
  // 常态技能循环（首个随机、不连放同技，间隔 skillCd）：四管炮幕 / 黑暗涟漪 / 巨大蛋挞；
  // 子弹为常规敌弹（2026-10-01 用户定稿，弃用水彩蛋挞贴图——tart 渲染分支保留备用）；
  // 技能3 巨大蛋挞例外：水彩蛋挞贴图大弹（tartSpin 相位持续自旋，见 10-draw-world）
  const DARKHAND = {
    name: '黑暗之手',
    w: 375, h: 292,            // 体型（2026-10-02 用户定稿：整体再 +25%，300×234 → 375×292，宽近八成屏）；
                               // 入场冲刺的预警带与撞击判定不随体型（见 entrance.sweepHalfW / sweepHalfH 注释）
                               // 历史：240×150 → (2026-10-01 +25% 且纵向再拉伸) 300×234 → 现值
    hp: 48000,                 // 基准血量（具象；分难度表 hpByDiff，2026-10-03 用户定稿调整：虚象 40000 / 具象 48000 / 真我 70000、诗篇 100000 不变；待同步总表）
    hpByDiff: { illusion: 40000, form: 48000, realme: 70000, poem: 100000 },
    score: 0,                  // 击杀不掉分（同旧日之歌，奖励走水晶/掉落体系）
    hoverY: 151,               // 停留高度（2026-10-02 随体型 +25% 同步上移：半高 146，保证机顶不越出屏顶）
    crashDmg: 55,              // 接触一次性伤害（同量级于旧日之歌 60）
    // 技能间基础冷却（2026-10-01 用户定稿）：无连携精英 = 旧日之歌（BOSS.skillCd 2.2s）的 40%（≈0.88s）；
    // 有连携精英在场 = 旧日之歌的 120%（≈2.64s）——结算见 05-boss darkhandSkillCd（经 bossSkillIv 难度倍率）
    combatSpdMul: 0.5,         // 战斗阶段航点扫动移速倍率（-50%；登场飞掠/离场等演出速度不受影响）
    // 航点扫动（结构同 BOSS.move，注释见彼处）：体量稍小 → 活动带稍宽、基准速度稍高
    move: {
      topPct: 0.04, botPct: 0.04,
      base: 52, accelMul: 1.6, vSpdMul: 0.5, vAccMul: 0.5,
      spdMin: 0.7, spdMax: 1.2, edgeMin: 0.02, edgeMax: 0.18,
      legMin: 0.30, legMax: 0.85, turnFrac: 0.35,
    },
    // 技能1 四管炮幕（2026-10-01 对齐机制图鉴 t4DrawQuadCannon 演示）：每齐射间隔四门炮同时齐射各 1 发——
    // 炮位横向偏移 = 屏宽比 cannonXs（炮口在机体前缘 y = h×0.36，2026-10-03 用户定稿自 0.42 略微上移）；
    // 管间基准角差 cannonFanStep（≈10.3°，四管总张角约 ±27°）；整轮偏角 volleyBias（≈6.9°）奇偶轮左右交替；弹为常规敌弹
    // 轮数 / 间隔按难度（2026-10-04 用户定稿间隔再放缓，原 2026-10-03 的 0.75/0.65/0.6s）：
    // 普通 1s ×4 轮、真我 0.8s ×5 轮、诗篇 0.7s ×6 轮——诗篇首轮 6 发（四炮口喷 6 发，见 05-boss 技能1）；
    // 虚象/具象弹道水平分量压缩 vxMul（2026-10-04 用户定稿「水平位移减小一些」——弹道更竖直）
    s1: {
      shotIv: 0.5,         // 基准齐射间隔（s，同演示 0.5s；实际间隔 = shotIv × 难度倍率）
      baseIvMul: 2.0,      // 普通难度间隔倍率（→ 1s；2026-10-04 用户定稿，原 1.5）
      realmeIvMul: 1.6,    // 真我难度间隔倍率（→ 0.8s；2026-10-04 用户定稿，原 1.3）
      poemIvMul: 1.4,      // 诗篇难度间隔倍率（→ 0.7s；2026-10-04 用户定稿，原 1.2）
      rounds: 4,           // 普通难度轮数（4 轮 16 发）
      realmeRounds: 5,     // 真我难度轮数（5 轮 20 发）
      poemRounds: 6,       // 诗篇难度轮数（6 轮 = 首轮 6 发 + 后 5 轮 ×4 = 26 发，2026-10-04 用户定稿首轮 6 发）
      vxMul: 0.7,          // 虚象/具象：弹速水平分量 ×0.7（弹道更竖直，「水平位移减小一些」2026-10-04 用户定稿；真我/诗篇 1 不变）
      cannonXs: [-0.30, -0.10, 0.10, 0.30],   // 四炮横向槽位（×本体宽）
      cannonFanStep: 0.18, // 相邻炮管基准角差（rad，同演示 (i-1.5)×0.18）
      volleyBias: 0.12,    // 每轮整体偏角（rad，同演示 ±0.12，奇偶轮反号成左右交替）
      bulletSpeed: 250,    // 弹速（px/s）
      bulletR: 8,          // 弹判定半径
      dmg: 14,             // 每发伤害
    },
    // 技能2 黑暗涟漪：从本体中心向外扩散 rings 道错相位环形弹幕——每环 perRing 发弹，
    // 环间隔 ringGap，每环起始角整体偏移 ringRotDeg（错相位成漩涡状），环间弹速递增（内环慢外环快，
    // 2026-10-01 用户定稿：末环弹速显著增加，150 → 205 → 260）；
    // 环减速（2026-10-03 用户定稿）：每环随机带 speedDecayMax 以下的线性减速度（相对该环初速的 0%~30%/s，
    // 同环内所有弹一致、不同环各自随机；速度衰减到 spdFloor 为止不再减）
    s2: {
      rings: 3,            // 环数
      ringGap: 0.45,       // 相邻环释放间隔（s）
      perRing: 16,         // 每环弹数（360° 均分；虚象/具象——2026-10-04 用户定稿 18 → 16）
      realmePerRing: 18,   // 真我每环弹数（2026-10-04 用户定稿）
      poemPerRing: 20,     // 诗篇每环弹数（2026-10-04 用户定稿）
      ringRotDeg: 13,      // 相邻环起始角偏移（度）
      bulletSpeed: 150,    // 首环弹速（px/s），后续每环 +ringSpeedStep
      ringSpeedStep: 55,   // 环间弹速增量（末环 260）
      speedDecayMax: 0.3,  // 每环线性减速度上限（× 该环初速 /s，实际 0~上限随机——每轮一样、轮间不同）
      spdFloor: 100,       // 减速下限（px/s，防止弹幕停滞；2026-10-03 用户定稿 60 → 100）
      bulletR: 8,          // 弹判定半径
      dmg: 12,             // 每发伤害
      dur: 1.8,            // 技能总时长（≥ rings×ringGap，末环出膛后结束）
    },
    // 技能3 巨大蛋挞（2026-10-01 用户定稿）：向前方（玩家方向）直射一枚不停旋转的巨大蛋挞弹——
    // 判定半径与焦香螺旋桨火环保持一致（JIAOXIANG.auraR = 110），弹速慢；单发即结束，
    // 弹体携带 tartSpin 自旋相位（08-entities 逐帧推进）+ tart 贴图渲染（10-draw-world，直径 = 判定直径）；
    // 弹速按难度（2026-10-03 用户定稿）：普通 +40% = 168 / 真我 +10% = 132 / 诗篇不加 = 120；
    // 出生生长（2026-10-03 用户定稿）：蛋挞从小到大出现（growFrom 起步 = 很小）、growDur 内 easeOutCubic
    // 平滑放大，判定半径同步缩放（出生瞬间几乎无威胁，公平）；生长期间纯黑剪影 + 暗红辉光（对齐登场动画
    // 连携精英黑暗形态 = 辛国栋等机的颜色），后半段渐显真色（渲染见 10-draw-world 蛋挞分支）
    s3: {
      bulletSpeed: 168,        // 普通弹速（px/s，+40%；明显慢于炮幕 250 / 涟漪 150~260）
      realmeSpeed: 132,        // 真我弹速（+10%）
      poemSpeed: 120,          // 诗篇弹速（不加成，= 旧基准值）
      cdLag: 1.2,              // 释放结束的额外技能间隔（s，2026-10-04 用户定稿：蛋挞后下一技能更晚）
      cdLagRealme: 1.1,        // 真我额外间隔
      cdLagPoem: 1.0,          // 诗篇额外间隔
      r: JIAOXIANG.auraR,      // 判定半径 = 焦香螺旋桨火环半径（110）
      dmg: 35,                 // 单发直击伤害（大弹单发，待校准）
      spinSpd: 2.4,            // 自旋角速度（rad/s，≈2.6s 一圈）
      growDur: 1.4,            // 出生生长时长（s，0 → 全尺寸；虚象/具象——2026-10-04 用户定稿 +0.3s，原 1.1（2026-10-03 三轮定稿翻倍 0.55 → 1.1））
      realmeGrowDur: 1.1,      // 真我/诗篇生长时长（2026-10-04 用户定稿：仅虚象/具象 +0.3s，此两档维持 1.1）
      growNoHit: true,         // 虚象/具象：成型（生长）阶段不造成伤害——生成时打弹体标志 tartGrowNoHit、08-entities 碰撞跳过（2026-10-04 用户定稿）；真我/诗篇照常随缩放判定
      growFrom: 0.12,          // 出生初始缩放（×判定半径，刚开始很小）
      hitShudderT: 0.14,       // 被依的镰刀斩中后的颤动时长（s，2026-10-04 用户指定：颤动→碎裂→迅速渐隐）
      hitFadeT: 0.24,          // 颤动结束后的碎裂渐隐时长（s；期间弹体冻结——不再移动/自旋/判伤，08-entities 推进、10-draw-world 渲染）
    },
    // 技能4 爪翼毁灭蛋挞（2026-10-08 用户定稿：激光替换为超长蛋挞——原 2026-10-02「爪翼毁灭光束」改版）：
    // 三组依次释放——① 机头正前方预警 → 机头向正下方一枚；② 机头两侧两爪预警 → 各自沿爪朝向一枚（左右已互换修正：
    // 左爪朝右下、右爪朝左下，向屏内侧交叉）；③ 最侧边两后翼预警 → 各自沿翼朝向一枚（朝外斜下）。
    // 弹体 = 超长蛋挞（水彩贴图长条弹 tartUltraImg）：自发射点「从头开始」高速射出——头部沿朝向推进、
    // 身体各点沿头部轨迹历史等弧长回采样（列车出洞式逐节露出），出现期尾端锚定发射点并在露出处持续迸发红色
    // 粒子（emitIv 节奏）、全部露出后粒子停止、整条转为刚体平移；弹体带暖金拖尾（渲染见 11-draw-boss drawDhTart）。
    // 居中机制（2026-10-03 用户定稿）：释放技能瞬间本体以 smoothstep 剖面水平移向屏幕中线并停稳（moveDur 内完成、
    // 初速/末速均为 0 不瞬起瞬停）——第三轮发射时本体必定居中，双后翼蛋挞必然左右对称。
    // 释放期间常规移动（bossMoveUpdate）暂停、由技能内接管位置；技能收口清惯性（恢复后从静止平滑加速）。
    // 伤害同原光束（50 × bossDmgMul，命中一次，白盾无影响——免疫射弹）；发射点与朝向以发射瞬间机体快照。
    // 反弹（2026-10-08 用户定稿细化）：真我/诗篇命中左右屏幕边缘反弹——沿弹体逐节传递（头部撞壁折返写入轨迹
    // 历史，后续节段抵达折点才转向，非整条瞬弹）；反弹次数难度化沿袭原光束（2026-10-03 定稿）：真我 1 次、诗篇 2 次
    s4: {
      warnDur: 1.2,            // 每组预警总时长（s，2026-10-03 四轮定稿 0.9 → 1.2（+0.3s））——暗红虚线方向预警 + 端点光斑闪动（渲染见 11-draw-boss）
      warnGrow: 0.2,           // 预警线自发射点沿朝向逐段生长至出屏的时长（s，2026-10-08 用户定稿：0.6 → 0.2s 内伸满；easeOutCubic 减速伸长，< warnDur 余下时间整线常亮脉动）
      warnShrink: 0.35,        // 每段生成时「从大收缩到正常」的警示特效时长（s，2026-10-08 用户定稿：新段宽度 3.2× → 1× easeOut 收缩）
      gap: -0.08,              // 上一组发射 → 下一组预警的间隔（s；负值 = 预警结束即刻衔接下一组——组发射间隔 = warnDur 1.2s，预警期与上一组弹体尾段重叠）
      moveDur: 1.6,            // 释放后向屏幕中线水平移动并停稳的时长（s；< 第二轮发射 2.4s，第三轮发射 3.6s 时已居中静止）
      dmg: 50,                 // 单枚伤害（× bossDmgMul 同原光束；白盾存在时不判伤）
      reflect: true,           // 真我/诗篇难度（沿袭原光束 2026-10-03 定稿）：蛋挞命中左右屏幕边缘反弹（逐节传递，见块注释）
      bounceRealme: 1,         // 真我难度反弹次数（沿袭原光束：保持 1 次）
      bouncePoem: 2,           // 诗篇难度反弹次数（沿袭原光束：弹射 2 次）
      tartLen: 460,            // 蛋挞全长（px，≈贴图 1964×200 原生纵横比对应厚度 47；约占屏高 58%）
      tartW: 47,               // 蛋挞厚度（px；判定半宽 = 此值之半 + 玩家 hitRadius）
      tartSpeed: 1050,         // 头部推进速度（px/s；2026-10-08 用户定稿 +50%：700 → 1050（17.5px/帧）；全长露出 ≈0.44s）
      tartSeg: 23,             // 身体采样点间距（px，全长 ≈20 节；屏缘折返的转向粒度）
      trailLen: 130,           // 拖尾长度（px，尾端沿轨迹历史向后的渐隐彩带）
      trailN: 7,               // 拖尾采样段数
      emitIv: 0.012,           // 出现期粒子喷发间隔（s，2026-10-08 用户定稿大幅加密 0.04 → 0.012 × 每拍 2 粒 ≈167/s——「空间喷发召唤而出」；全部露出即停）
      groups: [                // 发射组（共 3 组按序释放；本体比例位 x/y 相对机体中心；oy = 纵向像素偏移（上移负）；ang 射出方向 rad）
        [{ x: 0, y: 0.42, ang: Math.PI / 2 }],                                   // ① 机头：正下
        [{ x: -0.27, y: 0.30, oy: -50, ang: Math.PI / 2 - 0.415 },              // ② 机头两侧双爪：沿爪朝向同时发射（左右互换修正——左爪朝右下/右爪朝左下，向屏内侧交叉；初始点上移 50px；2026-10-08 用户定稿：与竖直夹角 0.24 ≈13.7° → 0.415 ≈23.8°（+10°））
         { x: 0.27, y: 0.30, oy: -50, ang: Math.PI / 2 + 0.415 }],
        [{ x: -0.47, y: 0.02, ang: Math.PI / 2 + 0.88 },                        // ③ 最侧边双后翼：沿翼朝向同时发射（朝外斜下；本体已居中 → 左右必然对称）
         { x: 0.47, y: 0.02, ang: Math.PI / 2 - 0.88 }],
      ],
    },
    // 技能5 暗影导弹雨（2026-10-02 用户定稿 / 2026-10-03 重构 + 二轮定稿）：机体贴图实心区内随机位置出现黑红小型导弹
    //（dhDark 长条弹观感 + 红边 accent），出现时完全透明、fadeIn 秒内快速渐显；
    // 弹数/时长按难度（2026-10-04 用户定稿四档）：虚象 5s 30 发、具象 5s 40 发、真我 6s 70 发、诗篇 7s 90 发
    //（原 2026-10-03：虚象/具象共用 5s 50 发、真我 5s 65 发、诗篇 7s 90 发）；
    // 弹道分难度：普通 = 旧直落加速（低初速 accel 沿飞行方向加速至 maxSpeed）；
    // 真我/诗篇 = 抛物导弹（riseVy 向上初速 + accel 恒定向下重力 → 先上升 ≈90px 再下坠）+ 水平 S 剖面——
    // 水平加速度自 +A 线性过渡到 -A（ax(t) = A(1-2t/T)），水平速度先增后减、到达 50% 屏高处精确归 0；
    // 落点（2026-10-03 二轮定稿）：全屏宽度内均匀采样（含黑暗之手本体两侧的窄屏区，边缘各留 20px），
    // dx = 目标落点 - 出生点（取代旧 ±20% 屏宽位移限制——分布更均匀）；弹体始终竖直朝下不随飞行方向旋转；
    // 释放期间本体移速降至 slowMul（指数逼近平滑）
    s5: {
      illusionDur: 5, illusionCount: 30,   // 虚象：5s 内 30 发（2026-10-04 用户定稿）
      dur: 5, count: 40,       // 具象：5s 内 40 发（2026-10-04 用户定稿；原虚象/具象共用 5s 50 发）
      realmeDur: 6, realmeCount: 70,   // 真我：6s 内 70 发（2026-10-04 用户定稿，原 5s 65）
      poemDur: 7, poemCount: 90,   // 诗篇：7s 内 90 发
      speed0: 30,              // 普通弹道出现初速（px/s，低初速向下）
      accel: 221,              // 加速度（px/s²）：普通弹道沿飞行方向 / 抛物弹道恒定向下重力（2026-10-02 -35%：340 → 221）
      maxSpeed: 364,           // 普通弹道末速上限（px/s，2026-10-02 -35%：560 → 364；抛物弹道不受限自然加速）
      riseVy: 200,             // 抛物弹道向上初速（px/s，2026-10-03 二轮定稿 140 → 200：向上抛洒幅度增大，先上升 ≈90px 再下坠）
      slowMul: 0.2,            // 技能期间本体移速倍率（所有难度；指数逼近见 slowK）
      slowK: 5,                // 移速逼近率（1/s：≈0.6s 基本到位 / 恢复，速度曲线铁律——无瞬跳）
      len: 24, r: 4.5,         // 长条弹胶囊长 / 半宽（小型导弹观感）
      streak: 10,              // 简化拖尾长度（px，导弹尾迹）
      fadeIn: 0.2,             // 渐显时长（s）：出现完全透明 → 快速线性渐显（08-entities 推进 / 10-draw-world 渲染）
      dmg: 16,                 // 单发伤害（× bossDmgMul 统一难度倍率，pushBossBullet 内处理）
    },
    // 登场演出（2026-10-01 定稿，替换旧黑洞入场）：警报（与其他 BOSS 同红色制式——2026-10-04 用户定稿警报背景统一，字体仍为黑红专属变体，见 11-draw-boss drawBossWarning）→
    // 警报后期场中红色竖向预警 → // 警报结束黑色阴影从屏顶沿中线飞速掠过（命中玩家 = min(当前血量,100)×难度比例伤害 + 大幅击飞带旋转）
    // → 屏顶白主体红边轮廓浮现 → 快速渐变为真色 + 放出震荡波 → 血条出现、正式开始（combat）
    entrance: {
      sweepSpd: 2700,     // 阴影掠过速度 px/s（2026-10-01 用户定稿 +100%，原 1350；约 0.37s 横穿全场）
      sweepHalfW: 130,    // 掠过判定半宽（玩家需离开屏幕中线才能躲开；2026-10-02 用户定稿：不随体型，预警带宽度 150 同理固定）
      sweepHalfH: 117,    // 掠过判定半高（2026-10-02 用户定稿：固定 = 旧体型 234 之半，体型 +25% 后入场冲刺撞击区域不变）
      hitFrac: 0.3,       // 掠过命中伤害 = min(玩家当前血量, 100) × 比例（2026-10-04 用户定稿四难度 30/40/60/80%，原一律 80%）
      formHitFrac: 0.4, realmeHitFrac: 0.6, poemHitFrac: 0.8,   // 具象/真我/诗篇档（《诗篇难度修正.md》#33）
      kbT: 0.75,          // 击飞位移持续时长（s，复用 player.kbT 风暴击退通道，衰减率 exp(-7t)：总位移 ≈ v/7）
      kbVx: 420, kbVy: 1500,   // 击飞初速：横向推离中线（≈60px）+ 纵向大幅砸飞（≈214px），首帧步长 ≈25px（受击冲击，无 snap）
      spinDur: 0.85,      // 击飞旋转时长（s）——恰好旋转 1 整圈、easeOutCubic 收尾（终角 = 2π 整数倍，无 snap）
      outlineDelay: 0.9,  // 掠过出屏后的停顿时长（s，相位负值实现；2026-10-03 用户定稿 +0.3s = 0.6 → 0.9：冲刺掠过后再经过 0.3s 黑暗之手才从上方浮现）
      outlineT: 1.05,     // 白主体红边轮廓浮现时长（s，2026-10-01 用户定稿：×2.5 后再 -40% = ×1.5，原 0.7）
      revealT: 0.675,     // 轮廓 → 真色渐变时长（s，同 ×1.5，原 0.45）；结束时释放震荡波并进入 combat
                          //（登场蛋挞扇已删，2026-10-02 用户定稿；长条蛋挞贴图 tartStripImg 渲染分支保留为休眠能力）
      shockDur: 0.55,     // 震荡波扩散时长（s，纯演出：扩散环 + 震屏，无伤害）
    },
    // 连携召唤（2026-10-01 定稿）：血量降到 80/60/40/20% 阈值时各召唤一名精英（每轮随机、不重复）；
    // 场上有任意一名连携精英时，黑暗之手受到的普通伤害降低 guardDR（高能爆弹/绷绷炸弹为真实伤害不受此减免
    // 且正常波及连携精英——2026-10-04 用户定稿，结算点 08-entities enemyDamageMul）；
    // 本段击坠增伤（2026-10-08 用户定稿）：当前窗口精英在本段血量内（触发召唤阈值 → 再降 20%）被击坠——
    // 减伤撤销、受到的普通伤害额外 +100%（guardAmp，至本段结束/下一窗口召唤止；高能爆弹/绷绷炸弹同样不吃），
    // 且本体永久登记该精英对应「额外技能」（dhBonusSkills，整场战斗生效——技能本体待设计实装）；
    // 精英未被击杀而离场 → 不触发任何效果；此前窗口的精英（离场/返场后）被击坠只登记额外技能、不加伤
    //（其对应血量段已不存在）。登记统一走 02-core dhOnLinkedEliteKilled（06-enemy killEnemy 调用）；
    // 精英所在的 20% 血量窗口结束（下一个阈值触发 / 本体死亡）仍未被击杀 → 迅速离场并记录血量
    //（state.dhFledElites，第三轮刷怪期按 ELITE_REVIVE.levels 固定等级返场：14-main 触发 / 04-spawn spawnRevivedElite 生成，见 05-boss updateBossDarkhand）；
    // 本体死亡时连携精英同受秒杀类（金陨/埃逸殉爆）与高能爆弹/绷绷炸弹结算（2026-10-03 / 2026-10-04
    // 用户定稿，不再豁免；结算点 07-player）——秒杀类击杀时在场精英一同被砸死（不转离场），常规击杀时
    // 幸存精英立即终止当前技能并迅速离场（dhFleeLinkedElites）；未召唤精英按「此前有无逃走登记」归属
    // 满血返场/视作击杀触发张华&张策（见 06-enemy killEnemy）；离场期间照常参与撞机结算（06-enemy
    // 通用碰撞分支），已处离场相位（elPhase 2）者不被秒杀类追杀
    summon: {
      thresholds: [0.8, 0.6, 0.4, 0.2],   // 血量阈值（×maxHp），依次各召唤一名
      pairs: [                             // 召唤池两两分组（2026-10-03 五轮定稿）：前两轮从第一组组内随机排序召唤、后两轮从第二组组内随机排序——组内顺序随机、组间先后固定
        ['xiayong', 'puxuefeng'],
        ['hanxixian', 'xinguodong'],
      ],
      guardDR: 0.7,                        // 任意连携精英在场：受到的所有伤害 -70%（2026-10-03 五轮定稿 65% → 70%；2026-10-02 曾 -50% → -65%）
      guardAmp: 1.0,                       // 本段精英被击坠：减伤撤销 + 受到的普通伤害 +100%（2026-10-08 用户定稿；至本段结束止，高能爆弹/绷绷炸弹不吃）
    },
  };

  // ---------- 四精英参数（4S 敌人：狞笑朴学峰 / 猩红韩希先 / 铜皮夏勇 / 暴怒辛国栋，2026-09-30 实装） ----------
  // 共用移动骨架（04-spawn spawnEliteMinion 生成 / 06-enemy updateEnemyMovement 精英分支驱动）：
  //   顶部入场（恒速 entrySpeed 直冲 → 剩余刹车段内匀减速至 entryEndSpd 维持（不彻底刹停），切入驻留时摆动
  //   幅度以 wobRamp0 初值起步、速度大小连续无停顿，2026-10-02 速度曲线平滑化）→ 驻留悬停（sin 摆动 t=0 偏移 0 + 幅度缓入）→
  //   驻留 dwell 秒后加速下压离场（挑战模式永驻）。技能循环：首个随机、之后固定轮换
  //   （四精英均两技 1↔2——朴学峰残像换影 2026-10-02 并入冲③尾部、韩希先同日取消三眼齐光、
  //   夏勇 2026-10-03 删暗壁后改固定五步循环：屏障→大子弹→回旋刃→大子弹→回旋刃，屏障必定首发，
  //   见 xiayong 块注释），间隔 skillGap（1.2s，2026-10-01 用户定稿 = 原 2.0 × 60%；机型级覆盖：
  //   夏勇 1.56s = +30%（2026-10-03）、朴/韩/辛 1.8s = +50%（2026-10-04 用户定稿韩/辛与朴对齐））；
  //   技能全程走 e.elSkill 状态机（06-enemy startEliteSkill / advanceEliteSkill）；
  //   停留高度机型级固定覆盖（巡航线：朴/韩/辛 40%——2026-10-04 用户定稿韩/辛与朴对齐；夏 45%，
  //   见 04-spawn spawnEliteMinion），公共 14%~30% 带仅作缺省回退
  const ELITES = {
    entrySpeed: 430,       // 入场巡航速度（px/s）
    entryBrakeT: 1.0,      // 入场末段匀减速刹车时长（s）——减速度 a = v0/T，刹车路程 = (v0²-vEnd²)/2a ≈ 212px，
                           // 恒定减速度（替代旧指数逼近 entryDecelK=6 的「前猛后拖尾」，2026-10-02）
    entryEndSpd: 45,       // 入场末段维持速度（px/s）——不彻底刹停，保持 ≈摆动切入速度直到驻留点（2026-10-02
                           // 用户反馈「刹停再启动很奇怪」：与 wobRamp0 配对，45 ≈ 0.7×摆动合速峰值 63，速度大小全程连续）
    stayTopPct: 0.14,      // 停留点高度区间上界（×屏高）
    stayBotPct: 0.30,      // 停留点高度区间下界
    stayXMargin: 0.16,     // 停留点横向安全边距（×屏宽）
    // 驻留摆动（2026-10-02 用户指定增大）：范围横向 ±26px、纵向 = ±3% 场高；速度（角频率）×1.6/×1.54
    //（sin 项 t=0 偏移 0 + wobRamp 幅度缓入，参数增大不改连续性——驻留进入瞬间位置仍严格连续）
    wobAmpX: 26, wobAmpY: CANVAS_H * 0.03,   // 摆动振幅（px）
    wobRamp: 1.6,          // 摆动幅度缓入时长（s）
    wobRamp0: 0.7,         // 入场路径切入摆动的幅度初值（0~1）——摆动初速 ≈ 0.7×合速峰值 63 ≈ 44px/s，
                           // 与入场末段维持速度 entryEndSpd=45 匹配（速度大小连续、不停顿重启）；低/零速切入
                           // 的归位/轰炸收口路径仍从 0 缓入（06-enemy 各 elPhase=1 切入点分别设值）
    wobFreqX: 1.6, wobFreqY: 2.0,
    skillGap: 1.2,         // 技能间隔（s）（2026-10-01 用户定稿：四连携精英攻击间隔 = 原 2.0 × 60%；机型级覆盖见各精英块）
    // 驻留水平追踪速度（px/s，2026-10-04 用户指定）：朴/韩/辛驻留期尝试向玩家水平位置移动（夏勇走自身
    // trackK/trackMax 通道）；速度经 xyTrackV 低通（≈0.3s 过渡，速度曲线铁律），见 06-enemy 相位 1
    hTrackSpd: 20,
    dwell: 30,             // 驻留时长（s；挑战模式传 1e9 永驻）
    leaveAccel: 420,       // 离场下压加速度（px/s²，速度从 0 平滑积分）
    leaveMax: 460,         // 离场速度上限（px/s）
    // —— 狞笑朴学峰：极速截击 ——
    puxuefeng: {
      // 血量按难度（2026-10-04 用户定稿，取代原「黑暗之手血量 × 20%」派生；取值入口 eliteHpOf——
      // 生成 04-spawn spawnEliteMinion 与图鉴 13-encyclopedia showEncyDetail 统一走此表）
      hpByDiff: { illusion: 6000, form: 9000, realme: 12000, poem: 15000 },
      // 技能间隔 +50%（2026-10-04 用户定稿）：1.2 × 1.5 = 1.8s（机型级覆盖公共 skillGap，读取见 06-enemy eliteSkillGap）
      skillGap: 1.8,
      // 技能1 流星穿刺（三连冲：竖 → 横 → 斜，冲③尾部并入残像换影——2026-10-02 用户定稿两技 1↔2 交替）：
      //   冲①竖直：本体原地静驻，沿所在竖直线直接向下贯穿（不向玩家对齐），预警线 + 预警区域自上而下展开；
      //   冲②横向：从锁定玩家 y 的一侧贴屏边外贯穿（方向按玩家位置，几何在冲①出发瞬间锁定）；
      //   冲③斜向：起点固定在屏高 30%~50% 带的屏外贴边侧（起点侧随横穿方向衔接），终点固定为对侧底角
      //   （左下/右下角），行程 = 起点→底角直线距离（几何在预警②展开完成瞬间锁定）；
      //   预警链首尾相接：预警①展开完成 → 冲①出发 + 预警②立刻出现；预警②展开完成 → 预警③立刻出现
      //   （各预警区域展开后保持显示、随对应冲刺实时擦除——冲到哪哪段消失，全程稳定无闪烁）；冲刺链连发：
      //   每冲完毕 pierceGap 后立刻开始下一冲；贯穿全程机头转向冲刺方向（elRot 最短角差低通）；
      //   贯穿命中玩家 = 接触伤害（ENEMY_TYPES.puxuefeng.crashDmg）+ 沿冲刺方向击退（2026-10-02 用户定稿：
      //   是击退不是击飞、不旋转——复用 05-boss knockbackPlayer，同战争幽灵入场冲撞口径；本体不受撞机反伤）；
      //   冲③行进至 80% 行程处时在原位留下残像（朝向与冲刺一致；本体不隐匿、继续冲完全程 → 冲出屏底 →
      //   场地上方重入归位），残像上下左右微微闪动、透明度忽大忽小（绘制层双频 sin），afterT 后立刻自爆
      //   burstN 发短弹（advanceEliteMinions 推进爆开收口 = 流星穿刺技能收口点）
      pierceWarn: 0.7,       // 冲①预警时长（s）——首次冲刺触发 = pierceWarn + 首冲增量（按难度，下方 firstWarn*）
      firstWarnAdd: 0.3, formFirstWarnAdd: 0.2, realmeFirstWarnAdd: 0.1,   // 首冲预警增量（s，2026-10-04 用户指定四难度 +0.3/+0.2/+0.1/+0——诗篇不增加）
      pierceReWarn: 0.6,     // 冲②/③预警展开时长（s）
      pierceSpeed: 1107,     // 贯穿速度（px/s；低难度虚象/具象基准 = 1476 × 0.75，2026-10-03 用户定稿冲刺速度 -25%）
      realmePierceSpeed: 1476,   // 真我/诗篇贯穿速度（px/s；2026-10-02 用户指定 +80%，原 820；低难度减速仅虚象/具象）
      pierceGap: 0.2,        // 冲间间隔（s，上一冲完毕到下一冲出发）
      pierceBandHalfW: 66,   // 预警区域半宽（带状，覆盖机体 + 走位余量）
      dashKbV: 820,          // 冲刺贯穿击退初速（px/s，沿冲刺方向；knockbackPlayer 0.32s 窗口 + exp(-7t) 衰减，总位移 ≈ 105px）
      // 技能2 翼根连弩：朝玩家方向多段扇形连射（每段 segShots 发、段间隔 segGap），射完 reload 装填空档后技能结束
      //（段数/每段弹数/间隔按难度分支——2026-10-03 用户定稿：虚象/具象 2 段 × 5 发、段间隔 0.14（+40%）；
      // 真我 3 段 × 5 发、段间隔 0.12（+20%）；诗篇 3 段 × 6 发、段间隔 0.1（2026-10-04 二次定稿：诗篇
      // 每段回调 6 发——原统一 5 发改为诗篇 poemSegShots 6、真我维持 5，《诗篇难度修正.md》#13 修订）；
      // 段首锁定瞄准角、段内扇位固定展开——射击均匀不甩动）
      segShots: 5, poemSegShots: 6,
      segGap: 0.14, realmeSegGap: 0.12, poemSegGap: 0.1,
      segCount: 2, realmeSegCount: 3, segSpreadDeg: 26, poemSegSpreadDeg: 32.5, reload: 1.5,
      // poemSegSpreadDeg 32.5 = 2026-10-08 用户定稿：诗篇每两颗子弹的夹角与低难度一致（26/4 = 6.5°/颗 ×
      // 6 发 5 间隙 = 32.5°）——诗篇 6 发/段的散射总范围相应扩大（低难度 5 发仍 26°）
      bulletSpeed: 300, bulletR: 5, dmg: 10,   // 2026-10-08 用户定稿弹速定值 300（历史：300 → 2026-10-03 -15% → 255 → +30% 331.5 → 回归 300）
      // 冲③尾部残像参数（残像换影并入流星穿刺——2026-10-02，原独立技能3 取消）：
      afterT: 0.7, burstSpeed: 190, burstDmg: 10,
      // 残像自爆短弹发数按难度（2026-10-04 二次定稿 6/7/9/10——虚象/具象/真我/诗篇；真我 9 / 诗篇 10
      // 由 8/9 上调，《诗篇难度修正.md》#32 修订）
      burstN: 6, formBurstN: 7, realmeBurstN: 9, poemBurstN: 10,
      // 停留高度：固定屏高 40%（2026-10-02 用户定稿巡航线；机型级覆盖公共带，见 04-spawn spawnEliteMinion）
      stayTopPct: 0.40, stayBotPct: 0.40,
    },
    // —— 猩红韩希先：三眼炮座 ——（两技能循环 1↔2——2026-10-02 取消三眼齐光；编号重排）
    hanxixian: {
      // 血量按难度（2026-10-04 用户定稿，取代原「黑暗之手血量 × 20%」派生；取值入口 eliteHpOf）
      hpByDiff: { illusion: 8000, form: 10000, realme: 15000, poem: 20000 },
      // 技能1 凝视锁定：顶部大眼红细追踪线 trackT（0.5s 持续跟随）→ 锁定静止 holdT（0.5s 方向固定不开火，
      // 红细线保持指向）→ 粗激光 laserDur（方向固定，横移可扫空）——2026-10-02 用户定稿时序
      trackT: 0.5, holdT: 0.5, laserHalfW: 15, laserDmg: 45,
      // 粗激光持续时长按难度（2026-10-04 用户指定：较原 0.9s 减少 0.4/0.3/0.1/0——虚象/具象/真我/诗篇，诗篇不变）
      illusionLaserDur: 0.5, formLaserDur: 0.6, realmeLaserDur: 0.8, laserDur: 0.9,
      // 技能2 旋眼火螺：三炮塔环绕本体 orbitR 旋转 orbitDur，每眼每 fireIv 沿径向射一发长条弹
      //（fireIv 2026-10-02 用户指定 -40%：0.18 → 0.108；诗篇改加速长条弹：初速≈0 → 180% 弹速，
      // 登记《诗篇难度修正.md》），中途反转一次
      orbitR: 58, orbitDur: 3.0, orbitSpd: 2.4, turretN: 3, fireIv: 0.108,
      bulletSpeed: 210, bulletR: 5, dmg: 10,
      // 技能间隔：1.8s = 公共 1.2 × 1.5（与朴学峰一致，2026-10-04 用户定稿；机型级覆盖公共值，见 06-enemy eliteSkillGap）
      skillGap: 1.8,
      // 停留高度：固定屏高 40%（2026-10-04 用户定稿与朴学峰对齐，原 35%；机型级覆盖公共带，见 04-spawn spawnEliteMinion）
      stayTopPct: 0.40, stayBotPct: 0.40,
    },
    // —— 铜皮夏勇：重装壁垒 ——（固定五步技能循环 2026-10-03 用户定稿：屏障→大子弹→回旋刃→大子弹→回旋刃）
    xiayong: {
      // 血量按难度（2026-10-04 用户定稿，取代原「黑暗之手血量 × 25%」派生；取值入口 eliteHpOf）
      hpByDiff: { illusion: 10000, form: 12000, realme: 18000, poem: 25000 },
      // 固定五步循环（2026-10-03 用户定稿）：e.xyStep 推进 [屏障, 大子弹, 回旋刃, 大子弹, 回旋刃]——
      // 屏障必定首发、每两轮（大子弹+回旋镖一对）释放一次；不参与 elFirst/elNext 随机轮换。
      // 技能间隔 +30%（2026-10-03 用户定稿）：1.2 × 1.3 = 1.56s（机型级覆盖公共 skillGap，见 06-enemy eliteSkillGap）
      skillGap: 1.56,
      // 技能3 屏障（2026-10-03 用户新增，编号 3）：获得红色护盾吸收量 barHp（普通 2000 / 真我 2500 / 诗篇 3000），
      // 常规直击类伤害（弹幕/导弹直击/灼烧/镰刀/溅射）先扣屏障（xiayongBarAbsorb，01-config 底部）；
      // 秒杀类/全屏瞬发真实伤害（爆弹/陨石/埃逸/冲刺秒杀）按统一伤害规则惯例不经过吸收；
      // 重复释放刷新吸收量；期间移速不降低（2026-10-03 五轮定稿：原 -20% 减速已删）；
      // 视觉 = 红色护罩 + 顶部猩红光芒流动（10-draw-world drawEliteFx），低血量（<30%）闪烁加快
      barHp: 2000, realmeBarHp: 2500, poemBarHp: 3000,
      barGapMul: 1.7,   // 屏障施放后下一次技能的间隔倍率（2026-10-03 二轮定稿：+70%）
      // 驻留水平追踪（2026-10-03 用户定稿：始终尝试移动至玩家水平位置）：目标 = 玩家 x（限横向安全边距），
      // 速度 = clamp(trackK×剩余距离, 0, trackMax) 再经 xyTrackV 低通（≈0.3s 过渡，双重平滑无瞬跳）
      trackK: 2.2, trackMax: 100,   // trackMax 100 = 2026-10-03 四轮定稿：水平追踪移速再减（原 170 → 120 → 100）
      // 技能1 碎翼回旋刃（2026-10-03 用户定稿再改版）：施放后先显示预定轨迹预警 bladeWarn（轨道虚线 +
      // 迸出线，绘制层），随后双刃自本体中心迸出（bladeOut 内 smoothstep 飞至轨道锚点，outDur 按实际
      // 距离自适应——峰速恒 ≈10px/帧）→ 一正一反反向绕行至**第二次相撞**（各自行程 1.75π ≈1.575s，
      // 恒定角速度 2π/bladeDur，长轴端峰值 ≈11px/帧 < smoke 12 阈值）→ 在轨道下缘相撞点湮灭收口；
      // 轨道中心 = 施放瞬间本体位置下移 bladeCyOff、下缘掠过玩家高度带；刃体全程对玩家圆碰撞（bladeDmg，
      // 命中 0.6s 冷却）+ 暗黑拖尾（绘制层 trail 采样）
      bladeRx: 190, bladeRy: 64, bladeRyRand: 0.2, bladeCyOff: 150, bladeDur: 1.8, bladeR: 24, bladeDmg: 30,
      // bladeRyRand 0.2 = 2026-10-03 四轮定稿：每次施放时轨道纵向半径随机增长 0~0.2×屏高（e.elSkill.ry 施放期快照，预警椭圆/迸出/绕行/湮灭全同步）
      bladeWarn: 0.9, bladeOut: 0.35,   // bladeWarn 0.9 = 2026-10-03 三轮定稿：预警时长 +0.4s（原 0.5）
      // 技能2 核心膨胀：一次推出三颗缓慢膨胀黑红能量球（基准朝玩家方向、相邻夹角 60°，方向锁定施放瞬间
      // 玩家方位缓慢漂移不跟踪），飞行 orbDur 后各自原地爆散环形弹——分裂弹数按难度（2026-10-04 用户指定
      // 四难度）：6 / 7 / 8 / 10；移速 72 / 膨胀速率 9.2（体型不变：出生 14 / 上限 60，爆散时半径约 32）
      orbR: 60, orbSpd: 72, orbDur: 2.0, orbGrow: 9.2, ringN: 6, formRingN: 7, realmeRingN: 8, poemRingN: 10, ringSpeed: 200, ringDmg: 12,   // ringSpeed 200 = 2026-10-08 用户定稿定值 200（历史：原 200 → 2026-10-03 -30% → 140 → 短暂 196 → 回归 200）
      // —— 牛角减伤（被动常驻，2026-10-03 用户定稿，三轮改版：仅真我/诗篇难度 -20%，其余难度无减伤）——
      // 命中点落在两翼折角（牛角）头部时伤害 ×hornRealmeMul（真我/诗篇 0.8）——
      // 判定几何见 xiayongHornDmgMul()（u = 命中点横向半宽比例 / v = 纵向半高比例；牛角 ≈ 立绘横向最外端
      // 38% 带 × 纵向中带，对应立绘 x∈[0.02,0.20]、y∈[0.30,0.70] 的弯钩体量）
      hornRealmeMul: 0.8, hornU: 0.62, hornV0: -0.44, hornV1: 0.44,   // 牛角减伤 2026-10-03 三轮定稿：仅真我/诗篇 -20%（hornRealmeMul），其余难度无减伤（原全难度 ×0.5）
      // 停留高度：固定屏高 45%（2026-10-02 用户定稿巡航线；机型级覆盖公共带，见 04-spawn spawnEliteMinion）
      stayTopPct: 0.45, stayBotPct: 0.45,
    },
    // —— 暴怒辛国栋：轰炸平台 ——
    xinguodong: {
      // 血量按难度（2026-10-04 用户定稿，取代原「黑暗之手血量 × 20%」派生；取值入口 eliteHpOf；
      // 同日下调定稿 7000/9500/14000/17500）
      hpByDiff: { illusion: 7000, form: 9500, realme: 14000, poem: 17500 },
      // 技能1 地毯轰炸（2026-10-04 投掷逻辑改版）：
      //   虚象/具象 = 横向扫射：释放瞬间锁定玩家水平方向（sweepDir）与玩家竖直高度（lockY），本体以
      //     slideSpeed 匀速横移（6/s 低通起停），持续往[本体当前水平位置，锁定玩家竖直高度]投弹
      //     （2026-10-04 终版定稿：水平实时随本体、竖直锁定不变——横移沿路径铺弹成带），撞到屏幕边界收口（不限发数）；
      //   真我/诗篇 = 原对齐+定点连投逻辑（全程追踪玩家水平位置，对齐限 alignDur），发数/预警/半径按难度
      //     分叉：真我 6 发 / 预警 1.0s / 半径 60，诗篇 7 发 / 预警 0.9s / 半径 75（《诗篇难度修正.md》#12）；
      // 投弹特效 = 暴鸰同款脱离火星，落点圈预警 bombWarn 后爆炸（半径内 bombDmg），多弹错时落地成连锁爆炸带
      slideSpeed: 120, dropIv: 0.32,
      bombN: 8, realmeBombN: 6, poemBombN: 7,
      bombWarn: 0.8, realmeBombWarn: 1.0, poemBombWarn: 0.9,
      bombR: 73, realmeBombR: 60, poemBombR: 75, bombDmg: 30, bombBandPct: 0.72,
      alignDur: 1.0, alignK: 5,   // 对齐段超时（s）/ 刹车系数（速度 = alignK×剩余距离封顶）
      // 技能2 连发导弹（2026-10-04 改版）：每轮两批 × volleyN 发扇形轻追踪导弹（批间隔 volleyGap；发射瞬间按
      // 玩家方向预压恒定角速度形成弧线追踪）；轮数按难度：虚象/具象仅 1 轮（illusionBatches=2 批收口）、
      // 真我/诗篇 2 轮（4 批收口）；每批发数 4 发（诗篇 poemVolleyN 6 发——《诗篇难度修正.md》#31）；
      // 导弹弧线弧度按难度：虚象/具象 illusionMissileSpeed/illusionMissileTurn = 200/0.4（弹速与转向同步
      // 减小 → 曲线弧度更平，2026-10-04 用户指定），真我/诗篇维持 235/0.55；
      // 轮间随机 volleyRoundGapRange（诗篇 poemVolleyRoundGapRange，登记《诗篇难度修正.md》）；
      // 诗篇发射期间本体上移 poemRisePct×屏高（poemRiseK 低通 ≈0.3s 过渡，速度曲线铁律），
      // 两轮发射完毕收口后平滑回落，且下次技能间隔 +poemVolleyGapAdd
      volleyN: 4, poemVolleyN: 6, illusionBatches: 2, volleyGap: 0.5,
      volleyRoundGapRange: [1.2, 1.6], poemVolleyRoundGapRange: [1.0, 1.4],
      volleySpreadDeg: 64, missileSpeed: 235, missileTurn: 0.55,
      illusionMissileSpeed: 200, illusionMissileTurn: 0.4,
      poemRisePct: 0.1, poemRiseK: 1.5, poemVolleyGapAdd: 0.5,   // poemRiseK 1.5 = 2026-10-04 二次定稿：上移/回落均放缓（原 3，时间常数 ≈0.67s，10% 屏高 ≈2s 平滑完成）
      missileDmg: 14, missileR: 6,
      // 技能间隔：1.8s = 公共 1.2 × 1.5（与朴学峰一致，2026-10-04 用户定稿；机型级覆盖公共值，见 06-enemy eliteSkillGap）
      skillGap: 1.8,
      // 停留高度：固定屏高 40%（2026-10-04 用户定稿与朴学峰对齐，原 30%；机型级覆盖公共带，见 04-spawn spawnEliteMinion）
      stayTopPct: 0.40, stayBotPct: 0.40,
    },
  };

  // 张华&张策（4S 隐藏精英，待设计——仅登记血量）：按难度定值（2026-10-04 用户定稿），
  // 生成逻辑实装时经 eliteHpOf('zhangzhang') 取值，与四精英同口径；
  // 召唤时机已接线：黑暗之手战四精英全数击败 → 第三轮 Lv25（ELITE_REVIVE.zhangzhangLv，14-main 占位 TODO）
  const ZHANGZHANG = {
    hpByDiff: { illusion: 8000, form: 10000, realme: 20000, poem: 40000 },
  };

  // 4S 精英血量取值入口：按当前难度读机型级 hpByDiff（2026-10-04 用户定稿：四精英独立四难度血量，
  // 取代原「黑暗之手血量 × 继承比」派生；张华&张策同口径）。生成（04-spawn spawnEliteMinion）与
  // 图鉴展示（13-encyclopedia showEncyDetail）统一走此函数——单一真相源
  function eliteHpOf(type) {
    const h = (ELITES[type] || ZHANGZHANG).hpByDiff;
    if (!h) return null;
    return h[currentDifficulty.id] != null ? h[currentDifficulty.id] : h.form;   // 未配置难度回退具象基准
  }

  // ---------- 连携精英返场（黑暗之手战未被击败者，2026-10-08 用户定稿） ----------
  // 黑暗之手战因血量窗口结束 / 黑暗之手死亡而迅速离场的精英（state.dhFledElites 登记 { type, hp }）
  // 在第三轮刷怪期按固定等级返场（就算仅部分存活，各机登场等级也不变）：
  //   夏勇 Lv22 / 朴学峰 Lv24 / 韩希先 Lv26 / 辛国栋 Lv28（用户定稿顺序，非图鉴惯用排序）；
  // 返场时回复已损失生命值的 50%（相对离场登记血量）；四人全数击败则 Lv25 召唤张华&张策（实体待实装，
  // 触发标记 state.dhZhangPending，14-main 消费）。返场精英：不占在场压力权重（4S 类型不在 PRESSURE_W，
  // 张华&张策实装时同样不得加入）、不阻止诗篇波次刷新（elRevive 标记，14-main 诗篇分支排除）、
  // 不设驻留离场（holdTimer 1e9）、不因新的 4S 登场而离场——仅第三轮刷怪期结束（普通计时到 Lv31 /
  // 诗篇波次耗尽，即第三轮 BOSS 警报前清场）统一加速下压离场（02-core departRevivedElites）
  const ELITE_REVIVE = {
    healLostPct: 0.5,   // 返场回复比例：已损失生命值 × 此值
    levels: { xiayong: 22, puxuefeng: 24, hanxixian: 26, xinguodong: 28 },   // 各精英返场等级
    zhangzhangLv: 25,   // 四精英全数击败时张华&张策的召唤等级（实体待实装）
  };

  // 铜皮夏勇·牛角减伤判定（被动常驻，2026-10-03 用户定稿）：命中点 (hx, hy) 落在两翼折角（牛角）头部
  // 区域时返回 hornRealmeMul（真我/诗篇 0.8，其余难度 1——三轮定稿仅此两档减伤），其余返回 1。适用于「弹体直击类」伤害（主炮/僚机弹幕、副武器/驾驶员
  // 导弹直击——命中点 = 弹体位置，主弹经 08-entities enemyDamageMul 第 4/5 参传入）；空间斩击、镰刀、
  // 火环烧灼、爆弹/陨石等大范围·持续·真实·秒杀类伤害不判部位、不调本函数（不传 hx 即不判定）。
  // 立绘几何与 10-draw-world drawEliteBody 同式：宽适配 edw = w×1.15，等比 dh 封顶 h×1.35（封顶时 edw 反推）。
  function xiayongHornDmgMul(e, hx, hy) {
    if (!e || e.type !== 'xiayong' || hx == null) return 1;
    const c = ELITES.xiayong;
    const mul = (isRealme() || isPoem()) ? c.hornRealmeMul : 1;   // 2026-10-03 三轮定稿：牛角减伤仅真我/诗篇 -20%，其余难度无
    if (mul === 1) return 1;
    let edw = e.w * 1.15, edh = e.h;
    if (xiayongImg && xiayongImg.complete && xiayongImg.naturalWidth > 0) {
      let dh = edw * xiayongImg.naturalHeight / xiayongImg.naturalWidth;
      if (dh > e.h * 1.35) { dh = e.h * 1.35; edw = dh * xiayongImg.naturalWidth / xiayongImg.naturalHeight; }
      edh = dh;
    }
    const u = (hx - e.x) / (edw / 2), v = (hy - e.y) / (edh / 2);
    return (Math.abs(u) >= c.hornU && v >= c.hornV0 && v <= c.hornV1) ? mul : 1;
  }

  // 铜皮夏勇·屏障吸收（技能3，2026-10-03 用户定稿）：xyBarOn 且 xyBarHp > 0 时先吸收伤害，
  // 返回吸收后剩余伤害（0 = 完全抵挡）。适用于常规直击类伤害（弹幕 / 导弹直击 / 灼烧 / 镰刀 / 溅射）；
  // 秒杀类与全屏瞬发真实伤害（爆弹 / 陨石 / 埃逸 / 许凯狗冲刺秒杀）按统一伤害规则惯例不经过本函数。
  // 吸收至 0 的破盾检测与红色迸散特效在 06-enemy advanceEliteMinions（xyBarOn 复位 + 移速系数缓回 1）
  function xiayongBarAbsorb(e, dmg) {
    if (!e || e.type !== 'xiayong' || !e.xyBarOn || !(e.xyBarHp > 0)) return dmg;
    const absorbed = Math.min(e.xyBarHp, dmg);
    e.xyBarHp -= absorbed;
    return dmg - absorbed;
  }



  // 法术矩阵参数（特殊2类白红菱形法师无人机）：慢速下降到悬停带停稳 → 朝玩家左右 ±15° 发射发光正方体（独立 spellCubes 弹道）
  // 正方体限程后减速滑行（尾焰随速度收短），末段提前渐隐、速度归零时恰好消失；受主战机伤害 -30%；法术阵列在场时偏移角/速度增强
  const FASHI_MATRIX = {
    speed: 160,          // 常规移动速度
    entrySpeed: 240,     // 入场初速（怪物属性总表 2026-09 批次：320 → 280 → 240），随后在 entryDecay 内快速衰减到 speed
    entryDecay: 0.5,     // 入场初速衰减时长（s）
    accel: 12,           // 速度积分收敛率（下降/离场）
    dwell: 20,           // 到达目标区后「胡乱移动」持续时长，20s 后离场（挑战模式传 1e9 永驻）
    hoverTopPct: 0.30,   // 目标停留区上界 = 屏高 × 0.30（从上往下 30%；2026-09 批次：20% → 30%）
    hoverBotPct: 0.50,   // 目标停留区下界 = 屏高 × 0.50（从上往下 50%；2026-09 批次：40% → 50%）
    jitter: 300,         // OU 向量尺度（法术阵列的游走仍在用；矩阵已改带内目标点漫游、不再读取）
    jitterRate: 2.6,     // OU 漂移目标变化频率（法术阵列用）
    wanderSpd: 40,       // 抵达目标区后的乱动速度（恒定；带内随机目标点漫游）
    edgePull: 260,       // 软边界回拉强度（法术阵列游走用；矩阵游走改为带内目标点、不再读取）
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
    cubeTrailLen: 136,   // 大正方体光效拖尾长度（沿运动反方向的渐变光带；原 68 变长一倍）
    cubeTrailLenSmall: 116,   // 小正方体光效拖尾长度（136 等比缩短 15%，与 cubeR/cubeHalf 缩小同步；大正方体仍用 cubeTrailLen）
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
    dimRate: 0.55,       // 黯淡速率（较慢：保证减速滑行期间仍清晰可见）
    glowFloor: 0.35,     // 黯淡下限（不至于全黑）
    mainDR: 0.3,         // 受主战机（非僚机）伤害 -30%
    spawnLowLv: 0.02,    // lv11 前替换概率（很低）
    spawnHighLv: 0.30,   // lv11 起替换概率
  };

  // 脉冲矩阵参数（特殊3类）：三座暗红流光法术矩阵菱形「骑边拼合」成等边三角形 + 中央暗红核心；
  // 五档充能张合 + 周期性范围脉冲（半径较焦香火焰光环大 20%）
  const PULSE_MATRIX = {
    entrySpeed: 120,       // 登场横移初速（px/s），1s 内二次缓出衰减到巡航速（2026-10-02 移动逻辑改版）
    cruiseMin: 50,         // 巡航速下限（px/s，每台随机）
    cruiseMax: 60,         // 巡航速上限（px/s，每台随机）
    travelPct: 0.80,       // 累计走过屏宽比例（80%）后停驻
    brakeDist: 50,         // 停驻前刹停缓冲距离（px，速度线性归零、无突变）
    spawnBandPct: 0.20,    // 出现带：玩家当前竖直高度 ±20% 屏高
    spawnYMaxPct: 0.80,    // 出现带上限（屏高比例）；下限固定 60px 防出顶
    bobAmp: 7,             // 停驻后的上下摆动幅度（px，幅度随停驻时间渐显）
    bobFreq: 1.1,          // 上下摆动角频率（rad/s）
    dwell: 20,             // 登场存活阈值（s，自「登场」起算、全模式生效）：届满未被击杀 → 自爆模式
                           //   （下一波范围 selfDestructR、震波扩散完毕瞬间自身死亡并分裂三座法术矩阵；
                           //   17s/19s 起绘制层颤动预警；挑战/测试模式同样生效，2026-10-02 由停驻起算改此）
    selfDestructR: 160,    // 自爆波伤害半径（px，普通波为 pulseR 132）
    warnTime: 0.6,         // 释放脉冲前的红圈收缩预警时长（s）
    pulseR: 132,           // 脉冲伤害半径（2026-10-02 由 110 增至 132，较焦香火焰光环大 20%）
    pulseDmg: 30,          // 脉冲伤害
    pulseWaveDur: 0.45,    // 暗红冲击波扩散时长（s）
    smokeDur: 0.7,         // 释放后暗红烟雾残留时长（s，短命效果，比冲击波略长）
    scaleBump: 0.12,       // 释放瞬间自身放大动效幅度（×1.12，动效结束后回缩）
    scaleBumpDur: 0.3,     // 放大动效总时长（s）
    fireInterval: 2.2,     // 脉冲攻击间隔（s）
    fireIntervalPoem: 1.9, // 诗篇难度脉冲攻击间隔
    firstDelay: 2.1,       // 出生后到首次脉冲的间隔（s）
    firstDelayPoem: 1.9,   // 诗篇难度首次脉冲间隔
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
    summonFirst: 2.5,    // 首次召唤法术矩阵延迟（s，就位后计；原 4s 提前）
    summonInterval: 5,   // 后续召唤法术矩阵周期（s，红光闪动 + 周围生成）
    summonDistMin: 50,   // 召唤生成距离下限（px）
    summonDistMax: 120,  // 召唤生成距离上限（px）
    summonFlashDur: 0.3, // 召唤时周身红光闪动时长（s）
    cubeDmg: 26,         // 大正方体伤害（常规正方体已统一上调至 20）
    cubeSpeed: 400,      // 大正方体巡航速度（法术矩阵正方体 360 的提速版）
    cubeR: 23,           // 大正方体碰撞半径（不随小正方体缩小联动；原为矩阵 17 的约 1.35 倍）
    cubeHalf: 20,        // 大正方体绘制半边长（不随小正方体缩小联动；原为矩阵 15 的约 1.33 倍）
    cubeSpin: 1.5,       // 大正方体三轴翻滚基准角速度（rad/s；立体旋转，各轴异速叠加非二维自转）
    glowMul: 1.35,       // 大正方体红光增强倍率
    splitMin: 0.30,      // 分裂行程下限（占射程比例）
    splitMax: 0.60,      // 分裂行程上限（占射程比例）
    splitWarn: 0.5,      // 分裂预警时长（s，红圈收缩）
    slotChance: 0.50,    // Lv11 起 4 类槽位出场时替换主力舰的概率（其余为主力舰）
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
    pulseMatrix: 2,                         // 脉冲矩阵（停驻脉冲装置，同先兆者/寒霜计 2）
    // 暴鸰：另一分支已并入本文件（spawnBaoling），按权重正常生效
    baoling: 4,                             // 暴鸰
    unreal: 4,                              // 虚幻（同暴鸰口径）
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

  // 坚垒护卫艇（2类黄色变体，2026-09-28 新增）：机体为霜白突击艇上下倒置 + 前置能量盾（下方机体边框两条线增粗外移 + 流光，绘制见 09-draw-ships drawFortressStrikerBody）
  // 2026-10-03 起取消能量盾减伤机制，改为单纯高血量（HP 300），诗篇不再有额外减伤
  const STRIKER_FORTRESS = {
    hp: 300,          // 血量（VARIANTS.striker 条目同步定义 hp: 300）
    holdYOffset: 48,  // 停留位置较普通 2类前锋停留线（y 200~240）下移量（px）：更靠前、贴近玩家
    speedMul: 0.6,    // 移速为其他突击艇的 60% —— 落地方式：VARIANTS 条目 entry/charge 取全体基准 140/120 × 0.6 = 84/72
  };

  // 幽暮突击艇（2类黑色变体）参数：浮现(渐显) → 下移落点停驻 → 停 0.2s(白环预警) → 环射 6/8 发 → 随即下移同距渐隐离场
  // 图鉴挑战模式：离场消失后由 updateChallenge 自动重新生成（完整循环展示浮现→环射→离场）
  const DUSK = {
    hp: 64,          // 生命值（常规 2 类为 48）
    bulletStartSpeed: 140,   // 环射弹初速
    bulletMaxSpeed: 280,     // 环射弹末速（= 常规 2类弹速）
    bulletAccel: 466.67,     // 环射弹加速度：(280-140)/0.3 → 出膛后 0.3s 内从初速加速到末速
    shift: 72,       // 浮现点与落点的垂直距离（离场下移同距）
    fadeIn: 0.5,     // 浮现渐显时长
    moveDur: 1.3,    // 浮现点→落点下移时长（ease-out：峰值速度 = 3×shift/moveDur ≈ 166 px/s）；浮现→开火全程 = fadeIn+moveDur+aimWait = 2.0s
    aimWait: 0.2,    // 到位后开火前停顿（白环预警动画时长）
    exitDur: 1.8,    // 离场下移（同时渐隐）时长（ease-in：峰值速度 = 2×shift/exitDur = 80 px/s）
  };

  /* ---------- 2/3/4 类变体：不同颜色 + 不同技能（weight 为出现权重） ----------
   * striker 2类：赤红(直射±10°、不追踪) / 烈橙(spread 前方双弹、夹角 40°/50°/60° 随机) / 幽蓝(homing 追踪弹、登场 10% 1s 或 10% 2s 虚化护盾) / 霜白(silent 不开火、不停留直接冲锋) / 坚垒(fortress 黄色倒置机体+前置能量盾：不开火、移速 60%、停留更低、受伤 -20%) / 幽暮(dusk 黑色机白核：浮现→落点环射→渐隐离场)；入位/冲锋速度逐变体定义
   * gunship 3类：紫(mixed 散射+追踪) / 红(aggressive 火力猛瞄准连射) / 金(ring 环形弹幕密集)；血量/下降速度/首射延迟逐变体定义
   * capital 4类：红(barrage 密集弹幕) / 蓝(lance 瞄准齐射+螺旋；出现时 20% 带护盾，前 5s 虚化不受伤害、炮弹穿过) / 金(crgold 三技能)；下降速度逐变体定义
   */
  const VARIANTS = {
    striker: [
      // entry = 入位下降速度（px/s）；charge = 冲锋基准速度（冲锋速度 = charge + (关卡-1)×5）
      // 入位/冲锋已统一（怪物属性总表 2026-09 批次）：全体入位 140、冲锋基准 120——字段保留以便日后按变体再分化
      // firstDelay = 首次开火额外延迟（数值或 [min,max] 区间）；iv = 变体专属攻击间隔（缺省用注册表 fireInterval）
      { id: 'crimson', color: '#ff3b30', weight: 0.26, skill: 'straight', firstDelay: [0.2, 0.6], entry: 140, charge: 120 },   // 赤红：直射 ±10° 偏差、不追踪
      { id: 'amber',   color: '#ff8a5c', weight: 0.26, skill: 'spread', firstDelay: [0.4, 0.8], entry: 140, charge: 120, iv: [1.4, 2.4] },     // 烈橙：前方双弹，夹角 40°/50°/60° 随机（间隔独享 1.4~2.4s）
      { id: 'azure',   color: '#4d9fff', weight: 0.21, skill: 'homing', firstDelay: [0.5, 1], entry: 140, charge: 120 },        // 幽蓝：朝玩家 ±20° 随机偏转单发（蓝=盾+乱射）、登场 10% 1s / 10% 2s 虚化护盾
      { id: 'violet',  color: '#c084fc', weight: 0.21, skill: 'violet', firstDelay: [0.5, 1], entry: 140, charge: 120, iv: [1.4, 2.3] },     // 紫晶：单发精确追踪弹（紫=追踪）；间隔较幽蓝 +0.3s、无虚化护盾、首攻不额外延长
      { id: 'white',   color: '#eaf1f8', weight: 0.15, skill: 'silent', entry: 140, charge: 120 },                              // 霜白：不开火（停留规则与普通 2类一致）
      { id: 'fortress', color: '#ffd166', weight: 0.21, skill: 'fortress', hp: 800, entry: 84, charge: 72 },                    // 坚垒护卫艇：黄色倒置机体+前置能量盾（仅外观）；不开火、移速 60%（84/72）、停留位置下移 48px（STRIKER_FORTRESS）；高血量 HP 800 承担承伤职能（2026-10-03 取消减伤；2026-10-08 用户定稿 300→800，诗篇仍走 POEM_HP.striker_fortress = 3000 绝对覆盖）；出现权重同幽蓝（见 04-spawn STRIKER_VARIANT_TIERS）
      { id: 'dusk',    color: '#14161c', weight: 0.12, skill: 'dusk' },                       // 幽暮：黑色机白核；出现权重按关卡分档直接取值（Lv1~10 为 2 / Lv11~20 为 5，见 strikerVariantWeights）
    ],
    gunship: [
      // hp = 血量覆盖；speed = 下降/离场速度；firstFire = 首射延迟区间
      { id: 'violet',  color: '#c084fc', weight: 0.5, skill: 'mixed', hp: 400, speed: 300, firstFire: [1.1, 1.9] },
      { id: 'crimson', color: '#ff5a5a', weight: 0.3, skill: 'aggressive', hp: 400, speed: 270, firstFire: [1.0, 1.7] },
      { id: 'amber',   color: '#ffbf47', weight: 0.2, skill: 'ring', hp: 420, speed: 240, firstFire: [1.2, 2.4] },   // 金曜（黄）
      { id: 'orange',  color: '#ff7e2e', weight: 0.2, skill: 'orange', hp: 400, speed: 270, firstFire: [1.1, 1.9] },  // 橙焰（炽橙=大炮弹；主题色与威龙 #ff9a1a 区分）
      { id: 'cyan',    color: '#45e0e8', weight: 0.2, skill: 'cyan', hp: 400, speed: 270, firstFire: [1.1, 1.9] },   // 青时（青=召唤/屏障支援；主题色与增生侧翼艇 #7fe8c9 区分）
    ],
    capital: [
      // speed = 下降/离场速度；wLow/wHigh = 变体选取权重（Lv1~10 / Lv11~20 分档，见 pickVariant）
      { id: 'crimson', color: '#ff4d6d', wLow: 0.5, wHigh: 0.3, skill: 'barrage', speed: 250 },
      { id: 'azure',   color: '#4d9fff', wLow: 0.3, wHigh: 0.15, skill: 'lance', speed: 220 },   // 出现时 20% 带护盾（前 5s 虚化）
      { id: 'crgold',  color: '#ff9a1a', wLow: 0.3, wHigh: 0.15, skill: 'crgold', speed: 280, hp: 4600 },  // 赤金主力舰：橙黄舰体 + 旋转双环 + 三技能；血量 4600（其余主力舰 4200）
    ],
  };
  const STRIKER_SPEED_MUL = 0.7;   // （已废弃：2类入位/冲锋速度改由 VARIANTS.striker 逐变体 entry/charge 定义）
  // 1类虚象级（侧翼艇）两速体系：速度模长恒定、方向由生成点基值决定（生成时归一化写入 _sideVel）
  const SIDE_SPEED_FAST = 200;     // 快速：顶部入场（232111 / 图鉴挑战顶部斜插）；BOSS 战期间与 BOSS 后固定首波等特殊波次的 1类不限入场位置均为快速
  const SIDE_SPEED_SLOW = 150;     // 慢速：侧翼入场（常规编队 / 1类长队 / 侧翼斜扫 / 紫自爆流）
  const SIDE_ENTRY_BOOST = 1.6;    // 1类入场冲刺倍率：入场瞬间 ×1.6（快速 320 / 慢速 240），随后快速衰减
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
    orange:  { dark: '#5e1c06', base: '#ff7e2e', light: '#ffd9ae', accent: '#ffcf6b', glow: '#ff5a1a' },   // 橙焰：炽橙舰体 + 金色炮口饰环（呼应巨型黄弹）
    cyan:    { dark: '#0c3e46', base: '#45e0e8', light: '#d6fff9', accent: '#9ff0e0', glow: '#2ee8d8' },   // 青时：青色舰体 + 青白援护饰环（呼应支援弹/屏障）
  };

  /* ---------- 伤害类型 ----------
   * 普通伤害：我方主炮 / 僚机弹 / 撞机反伤等，可被御4防御光环、4类高火减伤、先兆者僚机减伤等乘区削减
   * 真实伤害：无视一切减伤乘区——目前仅高能爆弹，在 useBomb 中直接结算（不经过 updateBullets 的减伤链）
   */
  const STAR_COUNT = 90;
  const MAX_BOMBS = 3;             // 高能爆弹基准上限（真我经 mods.bombCap 降为 2；右上角以图标数量展示）
  const BOMB_DAMAGE_BASE = 4000;   // 高能爆弹基础伤害（真实伤害：无视御4防御光环等一切减伤）
  const BOMB_DAMAGE_RATIO = 0.10;  // + 目标最大血量的 10%
  const CAPITAL_HIGHFIRE_DR = 0.15;   // 4类主力舰：对玩家 Lv4 / 暴走(Lv5) 火力的减伤（受到伤害 ×0.85）
  const CAPITAL_DESCEND_DR = 0.20;    // 4类主力舰：俯冲减速前（距悬停高度 ≥90px、速度未明显衰减）的减伤（受到伤害 ×0.8）
  const BOSS_LOWFIRE_BONUS = 0.20;    // 玩家火力 Lv1 时对 BOSS 的武器伤害加成（BOSS 受到伤害 ×1.20，逆境补偿）
  const POPIAN_VULN_LV1 = 0.30;       // 火力 Lv1 时对破片的易伤（受到伤害 ×1.30，低火力补偿）
  const POPIAN_VULN_LV2 = 0.10;       // 火力 Lv2 时对破片的易伤（受到伤害 ×1.10）
  const WEAPON_DROP_HITS = 3;         // 统一：累计受击 3 次掉 1 级火力（全场景同规则；导弹命中不计入）

  /* ---------- 奖励道具池（赞助无人机掉落，击坠时立刻生效——道具槽已于 2026-10-01 取消） ----------
   * sponsor 90% 普通 / 10% 稀有、sponsorDeluxe 必稀有；同稀有度内等权随机抽 id（06-enemy grantRewardItem → 07-player applyRewardItem 直达结算）。
   * 绷绷背包一局限掉一次；「哦哦！抽卡！」带 noDrop 标记不入掉落池——原石为萧杨专属技能充能
   * （每 16 颗充满一次，按副驾驶员技能键 Q 释放，见 07-player noteGachaStone / triggerPilotSkill）；
   * 效果结算与图鉴文案见 07-player applyRewardItem / 13-encyclopedia 数值与机制「道具」页签。
   */
  const REWARD_ITEMS = {
    // ---- 普通（白色）----
    laodaDrink:   { id: 'laodaDrink',   rarity: 'normal', name: '牢大特饮', glyph: '🥤',
                    desc: '移速 +40%，持续 15s。饮用与结束均有加速过渡（非瞬间变速）。' },
    magnetShroom: { id: 'magnetShroom', rarity: 'normal', name: '磁力菇', glyph: '🍄',
                    desc: '水晶拾取半径 +40，持续一整局，可叠加。' },
    noLingluo:    { id: 'noLingluo',    rarity: 'normal', name: '不再陵落', glyph: '🗡',
                    desc: '持续 9s：以 32 发/s 向周身螺旋射出无界飞剑（起始朝上、每发顺时针偏转 25°，每圈自带 25° 偏移）；飞剑可穿透 2 个敌人，每次穿透伤害 -20%（100% → 80% → 64%，对 BOSS / 4类主力舰·法术阵列不穿透）；射出方向在水平线以下的飞剑对 BOSS 只造成 50% 伤害。' },
    frostGen:     { id: 'frostGen',     rarity: 'normal', name: '寒霜发生器', glyph: '❄',
                    desc: '周身 160px 寒霜力场（青白色半透明）：力场内敌机射速/移速与敌方子弹弹速 -60%，持续 12s；到期后力场朝正上方以 80px/s 发射离场。力场内焦香螺旋桨的火环失效，其机体在力场内每 0.1s 受 30 点灼烧（每次递增 1，离场重置）。' },
    xinguodongFury: { id: 'xinguodongFury', rarity: 'normal', name: '辛国栋大怒', glyph: '🔥',
                    desc: '以使用瞬间自身位置为中心生成一个不移动的辛国栋同款火环，半径持续扩大，6s 后几乎布满全屏并对全体敌人造成一次灼烧伤害，随后再持续 4s 渐隐消失。火环对辛国栋造成 5 倍伤害。' },
    honghongBomb: { id: 'honghongBomb', rarity: 'normal', name: '轰轰炸弹', glyph: '💣',
                    desc: '持续 20s：击败敌人后立刻对其周围一定距离内的敌人造成相当于该机最大生命值 20% 的伤害（红橙色冲击波），可连锁爆炸。1/2/3/4 类敌人的扩散距离分别为 40/50/60/70px；BOSS 战中 1 类敌人的伤害 ×10（即最大生命值 200%）；BOSS 本身不触发该效果。' },
    // ---- 稀有（金色）----
    bengbag:      { id: 'bengbag',      rarity: 'rare', name: '绷绷背包', glyph: '🎒',
                    desc: '高能爆弹 / 绷绷炸弹携带上限 +1 并立刻补充 1 枚，持续一整局；该道具一局限掉落一次。' },
    jiukeShadow:  { id: 'jiukeShadow',  rarity: 'rare', name: '酒客之影', glyph: '🍶',
                    desc: '机体透明化加深，30s 内获得 100% 闪避——但每成功闪避一次，闪避概率就减少 20%（100 → 80 → 60 → 40 → 20 → 0），直到归零或持续时间结束；闪避成功不掉血、不计受击，仅触发短暂受击无敌与受击反馈；闪避失败照常受伤（不解除效果、不扣概率）。' },
    gacha:        { id: 'gacha',        rarity: 'rare', name: '哦哦！抽卡！', glyph: '🎲', noDrop: true,
                    desc: '不入赞助无人机掉落池——原石（巨型水晶）为萧杨专属：萧杨每收集 16 颗原石充满一次该技能（击坠无人机获得的道具直接生效，无槽位概念），充满后按副驾驶员技能键 <b>Q</b> 释放（其他驾驶员不收集原石、无法使用）。<br>释放效果：16 颗原石自四面八方随机先后汇集机体（约 2.5s，期间无敌、我方输出 -60%），收束后清除周身 300px 敌弹并抽卡：70% 蓝 / 25% 紫 / 5% 金——场中巨影闪现，同色陨石轰击场心（蓝 6000 / 紫 16000 全场伤害；金秒杀全场敌方单位——与埃逸殉爆同款：禁用增生分裂 / 法术矩阵爆发等召唤型亡语、无法秒杀二阶段风暴编织者）；陨石同时清除全场敌我弹幕与预警（暴风之眼风波/风柱、风暴编织者雷霆/激光预警、战争幽灵登场——登场的战争幽灵直接被砸死）。' },
    bottleSpirit: { id: 'bottleSpirit', rarity: 'rare', name: '瓶中精灵', glyph: '🧪',
                    desc: '获得 50% 最大生命值的独立永久屏障（血条上青色段，位于普通屏障右侧；被动免死已于 2026-10-01 移除）。同时拥有屏障与永久屏障时优先消耗屏障；拥有屏障时被击中只要没掉血即算无伤；屏障到期消散不影响永久屏障；永久屏障具备抵御效果——若该次伤害大于永久屏障+屏障总量，仅扣除两个屏障、不扣血（吃掉一次溢出伤害）。' },
  };

  // 测试模式（图鉴挑战）：敌方不再无敌 —— 非 BOSS 单位统一血量 20000（BOSS 保持注册表血量）；
  // 持续刷怪测试（swarm）除外——按注册表正常血量（2026-10-01）
  const TEST_HP = 20000;              // 1~4 类全部敌机（含大型龙卷 / 法术矩阵等召唤物）

  /* ---------- 道具掉落规则（颜色标签驱动，见 enemyColorTags / rollItemDrops） ---------- */
  const DROP_KIT_RATE = 0.09;      // 升级套件基础掉率
  const DROP_KIT_RED = 1.5;        // 红色敌人套件倍率
  const DROP_KIT_PURPLE = 1.2;     // 紫色敌人套件倍率
  const DROP_KIT_YELLOW = 1.2;     // 黄色（含 3类金曜）敌人套件倍率
  const DROP_SHIELD_RATE = 0.02;   // 量子护盾基础掉率
  const DROP_SHIELD_BLUE = 0.06;   // 蓝色敌人护盾掉率
  const DROP_SHIELD_STACK = 0.35;  // 场上已有护盾道具或我方已带盾时的降率倍数
  const DROP_HP_BY_CLASS = { 1: 0.005, 2: 0.01, 3: 0.02, 4: 0.06 };   // 加血套件按敌机类别基础掉率（1类 0.5% / 2类 1% / 3类 2% / 4类 6%，2026-10-08 用户定稿）
  const DROP_HP_PROLIFERA = 0.04;  // 增生侧翼艇（淡青绿）加血掉率（固定值，不随类别表；2026-10-08 用户定稿 10%→4%）
  const DROP_HP_CYAN = 0.08;       // 青时炮艇（3类 cyan 变体，绿色标记）加血掉率（固定值；2026-10-08 用户定稿）
  const DROP_HP_GREEN = 0.10;      // 铁砧（治疗无人机，灰+绿标记）加血掉率（固定值，维持 10%）
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

  // 1类侧翼艇：五种行为对应五种颜色（与图鉴一致）
  //   pass(白)：无攻击斜插穿越 | shoot(黄)：追踪射击 | kamikaze(紫)：亡语垂直射击
  //   swirl(橙)：橙旋环绕弹（数值/权重/掉落规则与紫电一致，无亡语） | moon(红)：赤月定向单射
  const SIDE_BEHAVIOR_COLORS = {
    pass:     '#f0f0f5',   // 白
    shoot:    '#ffd166',   // 黄
    kamikaze: '#c084fc',   // 紫
    swirl:    '#ff8c1a',   // 橙（橙旋侧翼艇）
    moon:     '#ff3b30',   // 赤（赤月侧翼艇）
  };

  // 赤月侧翼艇（红色 1类）：机体为三角形、顶角指向当前航向；
  // 入场 1~2.5s 后随机时刻向顶角方向（航向正前方）发射一枚子弹，仅此一次；
  // 未发射即被击毁时 12% 概率触发亡语补射（同方向同弹速）
  const SIDE_MOON = {
    fireDelay: [0.8, 2.2],   // 入场后到发射的随机延时区间（s）（怪物属性总表 2026-09 批次：1.0~2.5 → 0.8~2.2）
    deathShotChance: 0.12,   // 未发射即被击毁时的亡语补射概率
  };

  // 橙旋侧翼艇（橙色 1类）：数值/权重/掉落规则与紫电（kamikaze）完全一致，但无亡语；
  // 技能：入场 0.8~1.5s 后在自身周围生成一颗环绕弹（紫电亡语弹同款：弹速/半径/伤害同 ENEMY_TYPES.side），
  // 绕自身公转（环绕半径 = 机体核心到机头距离再略远一点，逐颗随机取 dist × 倍率区间），
  // 自身被击坠或离场后环绕弹立刻消失（见 08-entities）
  const SIDE_SWIRL = {
    delay: [0.8, 1.5],       // 入场后到生成环绕弹的随机延时区间（s）
    dist: 20,                // 环绕基准半径（px）：三角箭镖机头距核心约 17（12.1 × drawScale 1.4），再远一点点
    distMul: [1.0, 1.4],     // 环绕半径随机倍率区间（具象基准；每颗环绕弹独立掷取）
    distMulPoem: [1.1, 1.5], // 诗篇难度的环绕半径随机倍率区间
    om: 2.6,                 // 公转角速度（rad/s，约 0.41 圈/s）
  };

  // 1类常规生成混合权重（按关卡分档，与「数值与机制图鉴-怪物权重」单一数据源同步）：
  //   low = Lv1~10 / high = Lv11~20；相对权重（非概率），由 pickSideSpawn 经 sideSpawnWeights(lv) 抽取
  // 注意：紫自爆流不混入增生（exclude）；BOSS 后固定首波不含紫电与橙旋（swirl 与 kamikaze 一并排除）
  const SIDE_SPAWN_W = {
    low:  { pass: 70, prolifera: 5, shoot: 15, kamikaze: 5, swirl: 5, moon: 20 },    // Lv1~10
    high: { pass: 60, prolifera: 10, shoot: 20, kamikaze: 10, swirl: 10, moon: 25 },  // Lv11~20
  };

  // 1类行为数值修正（makeEnemy 按行为覆盖）：黄芒（shoot）血量 10；
  // 分数：白影/增生/黄芒/赤月 50、紫电（kamikaze 自爆）与橙旋（swirl）80
  const SIDE_SHOOT_HP = 10;
  const SIDE_SCORE = 50;
  const SIDE_KAMIKAZE_SCORE = 80;

  // ---------- 成就系统：注册表与档位 ----------
  // ACHIEVEMENTS 注册表驱动（键序 = 结算页 / 数值图鉴「成就」页展示顺序，同难度内按用户给定顺序）：
  //   tier：'gray' 灰（普通）→ 'silver' 银 → 'gold' 金 → 'purple' 紫 → 'rainbow' 彩（最高稀有度）
  //   icon：徽章中央圆形内的具体图标字符
  //   desc：结算页悬停详情与数值图鉴「成就」页的描述文案
  //   holders：「无垠」专属——已完成者名单（x 与名单由维护者随版本手动更新）
  //   finalOnly：仅最终版本开放获得（受 ACHIEVEMENT_INFINITY_ENABLED 门控，当前恒不可获得）
  //   wipBoss：对应 BOSS 待实装占位（当前仅剩摘星者对应的「归星」；黑暗之手已于 2026-10-08 实装上线，
  //   唯我 / 光明之脚 / 内乱 / 铜皮太岁 / 酒客飞匕 5 条已正式开放获得）——解锁判定已在
  //   02-achievements achvOnBossKilled 预埋（实体实装后自动生效），展示处标注「对应 BOSS 待更新」
  //   challenge：挑战成就（2026-10-08 用户定稿）——全部无伤类成就标记为此；使用特殊装备（special: true，
  //   如天使璃）期间无法获得（02-achievements unlockAchievement 统一门控），悬停/图鉴页展示标注
  // 「无垠」的"无驾驶员效果"= 主/副槽均为 无驾驶员 或 whiteboard 白板驾驶员（当前为胡笛客/牛蛋；温酒客已实装受伤提升效果、萧杨已实装原石效果，均不再白板）；
  // "无护甲效果" = ARMORS 注册表中带 noEffect 标记的护甲（当前仅标准护甲）。
  // 难度门槛：「无垠」与 无垠战机 = 诗篇难度通关（isPoem）；如梦似幻 = 真我难度通关（isRealme）——见 02-achievements achvEvaluateVictory。
  const ACHIEVEMENT_INFINITY_ENABLED = false;   // 「无垠」获取开关：仅最终版本置 true
  const ACHIEVEMENT_TIERS = {
    gray:    { name: '虚象', color: '#aab3bf' },
    silver:  { name: '具象', color: '#d7dee7' },
    gold:    { name: '真我', color: '#ffd166' },
    purple:  { name: '诗篇', color: '#b28dff' },
    rainbow: { name: '长歌', color: '#7ef0ff' },
  };
  const ACHIEVEMENT_TIER_ORDER = ['gray', 'silver', 'gold', 'purple', 'rainbow'];
  const ACHIEVEMENTS = {
    // ── 灰（虚象）──
    deathBeforeBoss: { name: '至尊陨落', tier: 'gray', icon: '☄', desc: '在抵达首个BOSS前陨落。' },
    songDeath: { name: '往日梦魇', tier: 'gray', icon: '☾', desc: '被旧日之歌BOSS击坠。' },
    lowScoreDeath: { name: '答辩', tier: 'gray', icon: '⚠', desc: '陨落时分数不足1w。' },
    firstBossCrashDeath: { name: '冲锋！冲锋！', tier: 'gray', icon: '➤', desc: '被第一轮BOSS的碰撞伤害击坠。' },
    tongpiDeath: { name: '铜皮难顶', tier: 'gray', icon: '❖', desc: '装备铜皮夏勇护甲时，被击坠至少一次。' },
    chengyueDry6: { name: '非非', tier: 'gray', icon: '☾', desc: '装备澄月时，连续暴走6次都不触发护盾效果。' },
    xukaiPreBossDeath: { name: '萎靡不振', tier: 'gray', icon: '⇈', desc: '使用许凯狗时，在击败第一轮BOSS前被击坠。' },
    wenjiukeWin: { name: '九克之王', tier: 'gray', icon: '醉', desc: '大变革即将上演！使用温酒客通关' },
    lianjinLovelyAirClear: { name: '清除空气', tier: 'gray', icon: '⚔', desc: '使用炼金璃并触发清除弹幕时，没有任何子弹被消除掉。' },
    hajimiDodge60: { name: '哦非非', tier: 'gray', icon: '喵', desc: '哈基米大王的闪避概率到达60%。' },
    // ── 银（具象）──
    kill200: { name: '狂暴开杀', tier: 'silver', icon: '⚔', desc: '击坠 200 架敌机。' },
    pickup15: { name: 'UPUPUP', tier: 'silver', icon: '⬆', desc: '拾取 15 个道具。' },
    baoling3: { name: '砰砰', tier: 'silver', icon: '💣', desc: '暴鸰殉爆一次击坠至少3个敌人。' },
    missileDeath: { name: '打的准不如接得准', tier: 'silver', icon: '🚀', desc: '被导弹击坠。' },
    burnDeath: { name: '烫烫烫', tier: 'silver', icon: '🔥', desc: '被焦香螺旋桨烧坠。' },
    vortexPreDeath: { name: '哦呦', tier: 'silver', icon: '🌪', desc: '被暴风之眼发射的风旋在就位前击中。' },
    bulwark100: { name: '守愿加护', tier: 'silver', icon: '🛡', desc: '守愿者抵挡超过100发子弹。' },
    faceSong: { name: '昔字如烟', tier: 'silver', icon: '🎵', desc: '击坠旧日之歌。' },
    dagouHarbinger: { name: '叮咚', tier: 'silver', icon: '🔔', desc: '通过大狗召唤的导弹击坠至少一个炮火先兆者。' },
    keliBombBoss: { name: '轰轰火花', tier: 'silver', icon: '💥', desc: '使用可莉的绷绷炸弹击坠任意BOSS。' },
    qixuanwang: { name: '齐宣王', tier: 'silver', icon: '🧨', desc: '不使用绷绷炸弹或者高能爆弹，直到最终BOSS战时全部释放。' },
    zidianHits3: { name: '饿啊', tier: 'silver', icon: '💫', desc: '被紫电侧翼艇的亡语击中至少三次。' },
    stormCrashDeath: { name: '暴风陨落', tier: 'silver', icon: '🌀', desc: '被暴风之眼本体的碰撞伤害击坠。' },
    qixingBigHalve: { name: '繁星赐福', tier: 'silver', icon: '✧', desc: '装备祈星时，减半一次原伤害至少为50的攻击。' },
    maxinSlow30: { name: '鳖爬', tier: 'silver', icon: '🐢', desc: '使用马兴犬时，连续30s低速移动。' },
    hudikeWin: { name: '卑鄙笛客', tier: 'silver', icon: '笛', desc: '使用胡笛客通关。' },
    niudanWin: { name: '嘟嘟牛蛋', tier: 'silver', icon: '蛋', desc: '使用牛蛋通关。' },
    weiwo: { name: '唯我', tier: 'silver', icon: '👤', desc: '使用陵落击坠黑暗之手。' },
    neiluan: { name: '内乱', tier: 'silver', icon: '🗡', desc: '装备无界飞剑或辛国栋之怒击坠黑暗之手。' },
    tongpitasui: { name: '铜皮太岁', tier: 'silver', icon: '🧱', desc: '装备铜皮夏勇并击坠黑暗之手。' },
    guangmingzhijiao: { name: '光明之脚', tier: 'silver', icon: '🦶', desc: '不使用陵落的情况下，击坠黑暗之手。' },
    // ── 金（真我）──
    stormWithTianxiu: { name: '忧郁', tier: 'gold', icon: '🎹', desc: '使用天秀忧郁王子击坠暴风之眼。' },
    stormWithoutTianxiu: { name: '击坠风暴', tier: 'gold', icon: '🛩', desc: '不使用天秀忧郁王子的情况下，击坠暴风之眼。' },
    chixinBurnKill: { name: '烧烧烧', tier: 'gold', icon: '♨', desc: '使用炽心护甲的火环击坠至少一个寒霜或者焦香螺旋桨。' },
    defeatStorm2: { name: '风暴之终', tier: 'gold', icon: '⛈', desc: '击败风暴编织者。' },
    songPerfect: { name: '昨日，今日，明日', tier: 'gold', icon: '⏳', challenge: true, desc: '非诗篇难度下，无伤击坠旧日之歌。' },
    douzhi2: { name: '斗志非常昂扬', tier: 'gold', icon: '⏫', desc: '击坠两个及以上斗志昂扬。' },
    laserStorm2Death: { name: '极光陨落', tier: 'gold', icon: '⚡', desc: '被风暴编织者技能1的激光击坠。' },
    bossMarathon: { name: '持久战', tier: 'gold', icon: '⏱', desc: '胜利一场至少持续2分钟的BOSS战。' },
    watch60: { name: '群星不灭', tier: 'gold', icon: '✧', desc: '群星守望消除 60 颗敌弹。' },
    chixinClass1: { name: '飞蛾扑火', tier: 'gold', icon: '🦋', desc: '炽心灼烧击坠 20 个1类敌人。' },
    baoling5: { name: '砰砰礼物', tier: 'gold', icon: '🎁', desc: '暴鸰殉爆一次击坠至少6个敌人。' },
    lingluo3: { name: '疯狂杀戮', tier: 'gold', icon: '✵', desc: '陵落释放3次技能。' },
    forgotSkill: { name: '忘了', tier: 'gold', icon: '💤', desc: '选择带有技能的护甲或驾驶员，但整局都没有使用过其技能。' },
    huiHeal100: { name: '时流回溯', tier: 'gold', icon: '∞', desc: '通过洄至少恢复100血量。' },
    lanxinShield60: { name: '云心', tier: 'gold', icon: '❀', desc: '装备七日澜心时，在BOSS战中开启一个结晶护盾，并通过其消除60发子弹。' },
    maxinFast120: { name: '冲刺冲刺', tier: 'gold', icon: '💨', desc: '使用马兴犬时，连续120s高速移动。' },
    kingMad50: { name: '陷入疯狂', tier: 'gold', icon: '♛', desc: '大无垠之王的增伤累计至50%。' },
    lingluoHp1: { name: '命定之死', tier: 'gold', icon: '✵', desc: '使用陵落时，开启技能时使得血量降低为1。' },
    dagouCheat100: { name: '捣蛋来袭', tier: 'gold', icon: '🐶', desc: '开启大狗的导弹作弊模式。' },
    wanDaoFengLiu: { name: '万道风流', tier: 'gold', icon: '🎐', desc: '开启天秀忧郁王子的风暴作弊模式。' },
    inFieldKill12: { name: '其实是打不到', tier: 'gold', icon: '⚒', desc: '击坠 12 架处于御4力场或铁砧光圈范围内的敌机。' },
    lingqiaotuwei: { name: '灵巧突围', tier: 'gold', icon: '🧭', desc: '击坠 8 个炮火先兆者。' },
    jiukefeidi: { name: '酒客飞匕', tier: 'gold', icon: '🍶', challenge: true, desc: '非诗篇难度下，无伤击坠黑暗之手。' },
    // ── 紫（诗篇）──
    // 诗篇难度专属无伤击坠系列：与真我档无伤成就互斥（诗篇无伤只解锁本系列，非诗篇无伤走旧档；有伤击坠互不影响）
    wangXiNanYi: { name: '往昔难忆', tier: 'purple', icon: '🕰', challenge: true, desc: '诗篇难度下，无伤击坠旧日之歌。' },
    wuZhongChangGe: { name: '无终长歌', tier: 'purple', icon: '🎼', challenge: true, desc: '诗篇难度下，无伤击坠黑暗之手。' },
    fengYanWuLan: { name: '风眼无澜', tier: 'purple', icon: '◍', challenge: true, desc: '诗篇难度下，无伤击坠暴风之眼。' },
    zhiFengChengShi: { name: '织风成诗', tier: 'purple', icon: '🧵', challenge: true, desc: '诗篇难度下，无伤击坠风暴编织者。' },
    zhaiXingZhe: { name: '摘星者', tier: 'purple', icon: '✩', wipBoss: true, challenge: true, desc: '诗篇难度下，无伤击坠「归星」。' },
    stormPerfect: { name: '风暴航船', tier: 'purple', icon: '⛵', challenge: true, desc: '非诗篇难度下，无伤击坠暴风之眼。' },
    storm2Perfect: { name: '赫拉之神', tier: 'purple', icon: '👁', challenge: true, desc: '非诗篇难度下，无伤击坠风暴编织者。' },
    aiyiFinalBoss: { name: '！？爆爆？！', tier: 'purple', icon: '🎆', desc: '埃逸终极殉爆击毁最终BOSS。' },
    watchkeeper: { name: '守望者', tier: 'purple', icon: '⚜', challenge: true, desc: '使用守愿者无伤通关。' },
    rumengsihuan: { name: '如梦似幻', tier: 'purple', icon: '☁', challenge: true, desc: '无守愿者的情况下无伤通关真我难度。' },
    bulwarkLastBlow: { name: '最后一搏', tier: 'purple', icon: '⛨', desc: '装备最终壁垒时，在任意BOSS血量低于10%时，自身触发不死效果且最终击败该BOSS。' },
    dagouChain3: { name: '欧欧欧', tier: 'purple', icon: '🐕', desc: '大狗召唤的导弹两次连射3轮。' },
    kingMad80: { name: '彻底疯狂', tier: 'purple', icon: '👑', desc: '大无垠之王的增伤累计至80%。' },
    // ── 彩（长歌，最高稀有度）──
    infinityFighter: { name: '无垠战机', tier: 'rainbow', icon: '✈', challenge: true, desc: '无伤、无守愿者的情况下通关诗篇难度。' },
    dagouChain4: { name: '！？欧欧？！', tier: 'rainbow', icon: '🐾', desc: '大狗召唤的导弹连射4轮。' },
    goldLegend: { name: '金色传说', tier: 'rainbow', icon: '🌟', desc: '召集16颗原石并抽出金色传说。' },
    infinity: {
      name: '「无垠」', tier: 'rainbow', icon: '♾', finalOnly: true, holders: [], challenge: true,
      desc: '您的技术已登峰造极。无护甲效果、无驾驶员效果、无守愿者、不使用高能爆弹的情况下以诗篇难度无伤通关。',
    },
  };

  export {
    CANVAS_W, CANVAS_H, PLAYER_CFG, WEAPON_LEVELS, BERSERK, SHIELD_DURATION,
    BOSS_SEQUENCE, BOSS_ROUNDS, FIRST_ROUND_BOSSES, SPAWN_PHASE_TIMES, SPAWN_PHASE_LEVEL, ELITE_REVIVE, BOSS, BOSS_BULLET, STORM,
    STORM_WIND, STORM2, stormEyeImg, stormEyeLoader, energyOrbSheet, ENERGY_ORB, lightningImg, lightningImgAlt, lightningImgThin, lightningLoader, lightningLoaderAlt, lightningLoaderThin, lightningLoaderBig, lightningLoaderSmall, lightningImgBig, lightningImgSmall, lightningImgRing, BOSSES, BOSS_WARN, BOSS_WARN_TOTAL,
    BOSS_SPAWN_EARLY, PLANES, currentPlane, setPlane, setWingman, STARSLAYER,
    DIFFICULTIES, currentDifficulty, setDifficulty, diffMods, resolveBossHp, isIllusion, isRealme, isPoem, isHardTier, invulnDiffMul, bossDmgMul, enemyDmgMul, strikerHoldMul, strikerNoHoldSpdMul, xiayongHornDmgMul, xiayongBarAbsorb, SONG_SHIP, STORM2_SHIP, DARKHAND, BOSS_MINION_WAVE, STORM_SHIP, WAVE_POEM,
    DEMO_TOP, DEMO_BOTTOM,
    ARMORS, ARMOR_SKILLS, ENEMY_CLASS, ENEMY_GRADES, enemyGrade, currentArmor, setArmor, armorMaxHp,
    PILOTS, currentPilotMain, currentPilotSub, setPilotMain, setPilotSub, hasPilot, pilotEntry,
    dagouWaveIv, pilotBombDmgMul, pilotBombStartAdd, specialGearActive, PRINCE_STORM,
    WINGMEN_CFG, currentWingman, WINGMAN, BULWARK, WINGMAN_LEVELS, WINGMAN_SPREAD,
    SUB_WEAPONS, currentSubWeapon, setSubWeapon,
    ENEMY_TYPES, HARBINGER, WEILONG, HANSHUANG, YU4, ANVIL, ELITES, ZHANGZHANG,
    BAOLING, BAOLING_G, UNREAL, JIAOXIANG, DOUZHI, SPONSOR, REWARD_DRONES, rewardDroneChance, pickRewardDroneType, FASHI_A1, FASHI_A2, POPIAN, POPIAN_U, WAR_GHOST,
    FASHI_MATRIX, FASHI_ARRAY, PULSE_MATRIX, PRESSURE_W, PRESSURE_CAPACITY, SPAWN_SLOW_MUL, SPAWN_RUSH, SPAWN_RUSH_CAP,
    STRIKER_HOLD_Y, DUSK, STRIKER_FORTRESS, VARIANTS, STRIKER_SPEED_MUL, SIDE_SPEED_FAST, SIDE_SPEED_SLOW, SIDE_ENTRY_BOOST,
    SIDE_ENTRY_DECAY, SHIP_BULLET_COLOR, SHIP_BULLET_LEN, SPLIT_RED, PHASE_DURATION, PHASE_CHANCE,
    CAPITAL_PALETTE, GUNSHIP_PALETTE, STAR_COUNT, MAX_BOMBS, BOMB_DAMAGE_BASE, BOMB_DAMAGE_RATIO, REWARD_ITEMS,
    CAPITAL_HIGHFIRE_DR, CAPITAL_DESCEND_DR, BOSS_LOWFIRE_BONUS, POPIAN_VULN_LV1, POPIAN_VULN_LV2, WEAPON_DROP_HITS,
    CHAOS_SMALL_DMG_MUL, PIERCE_WEAKEN_MUL, DROP_KIT_RATE, DROP_KIT_RED, DROP_KIT_PURPLE, DROP_KIT_YELLOW, DROP_SHIELD_RATE,
    DROP_SHIELD_BLUE, DROP_SHIELD_STACK, DROP_HP_BY_CLASS, DROP_HP_PROLIFERA, DROP_HP_CYAN, DROP_HP_GREEN, DROP_HP_BOSS, DROP_HP_BOSS2,
    DROP_BOMB_ORANGE, DROP_KIT_BERSERK, SIDE_BEHAVIOR_COLORS, SIDE_MOON, SIDE_SPAWN_W, SIDE_SWIRL,
    TEST_HP, SIDE_SHOOT_HP, SIDE_SCORE, SIDE_KAMIKAZE_SCORE, WIP_PLACEHOLDER_TYPES, POEM_HP, poemHpOf, eliteHpOf, scytheImg, tartImg, tartStripImg, tartUltraImg, darkhandImg, dhSampleSolid, puxuefengImg, hanxixianImg, xiayongImg, xinguodongImg,
    BOSS_LOOT_KIT, BOSS_LOOT_SHIELD, BOSS_LOOT_BOTH,
    ACHIEVEMENTS, ACHIEVEMENT_TIERS, ACHIEVEMENT_TIER_ORDER, ACHIEVEMENT_INFINITY_ENABLED,
    CRYSTAL_TIERS, CRYSTAL_GIANT_CHANCE, CRYSTAL_COLORS, CRYSTAL_COLORS_NORMAL, CRYSTAL_GIANT_COLORS, convertCrystalDrop, rollCrystalGiant,
  };