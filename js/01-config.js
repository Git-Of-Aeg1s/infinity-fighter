// 01-config（拆分过渡壳）：《并行开发改造设计.md》批次 1c 逐域迁出后的剩余域；批次 1d 删除本壳（暂保留【临时】构建标记行）



  console.log('[InfinityFighter] JS build: 20260925-v035-1');   // 【临时】构建标记：验证浏览器缓存是否已刷新，确认后删除

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：02-achievements(8 名) 02-core(3 名) 04-spawn(45 名) 05-boss(21 名) 06-enemy(75 名) 07-player(8 名) 08-entities(26 名) 09-draw-ships(19 名) 10-draw-world(10 名) 11-draw-boss(7 名) 12-ui(5 名) 13-encyclopedia(25 名) 14-main(20 名)

  import { CANVAS_H, xiayongImg } from './01-config-core.js';
  import { currentArmor, hasPilot } from './01-config-loadout.js';


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
  const CHAOS_SMALL_DMG_MUL = 1.8;   // 混乱将至主炮弹（mainShot）：对非 BOSS / 非 4S（四精英）敌人伤害 +80%（结算见 08-entities）
  const PIERCE_WEAKEN_MUL = 0.5;   // mainPierce 穿透弹（无衰减率弹，如副武器·极夜流光激光）穿透后的伤害倍率：减半（结算见 08-entities）

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
  const CAPITAL_HIGHFIRE_DR = 0.15;   // 4类主力舰：对玩家 Lv4 / 暴走(Lv5) 火力的减伤（受到伤害 ×0.85）
  const CAPITAL_DESCEND_DR = 0.20;    // 4类主力舰：俯冲减速前（距悬停高度 ≥90px、速度未明显衰减）的减伤（受到伤害 ×0.8）
  const BOSS_LOWFIRE_BONUS = 0.20;    // 玩家火力 Lv1 时对 BOSS 的武器伤害加成（BOSS 受到伤害 ×1.20，逆境补偿）
  const POPIAN_VULN_LV1 = 0.30;       // 火力 Lv1 时对破片的易伤（受到伤害 ×1.30，低火力补偿）
  const POPIAN_VULN_LV2 = 0.10;       // 火力 Lv2 时对破片的易伤（受到伤害 ×1.10）

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
    BOSS_SEQUENCE, BOSS_ROUNDS, FIRST_ROUND_BOSSES, SPAWN_PHASE_TIMES,
    SPAWN_PHASE_LEVEL, ELITE_REVIVE, BOSS, BOSS_BULLET,
    STORM, STORM_WIND, STORM2, BOSSES,
    BOSS_WARN, BOSS_WARN_TOTAL, BOSS_SPAWN_EARLY, DIFFICULTIES,
    currentDifficulty, setDifficulty, diffMods, resolveBossHp,
    isIllusion, isRealme, isPoem, isHardTier,
    invulnDiffMul, bossDmgMul, enemyDmgMul, strikerHoldMul,
    strikerNoHoldSpdMul, xiayongHornDmgMul, xiayongBarAbsorb, SONG_SHIP,
    STORM2_SHIP, DARKHAND, BOSS_MINION_WAVE, STORM_SHIP,
    WAVE_POEM, ENEMY_CLASS, ENEMY_GRADES, enemyGrade,
    ENEMY_TYPES, HARBINGER, WEILONG, HANSHUANG,
    YU4, ANVIL, ELITES, ZHANGZHANG,
    BAOLING, BAOLING_G, UNREAL, JIAOXIANG,
    DOUZHI, SPONSOR, REWARD_DRONES, rewardDroneChance,
    pickRewardDroneType, FASHI_A1, FASHI_A2, POPIAN,
    POPIAN_U, WAR_GHOST, FASHI_MATRIX, FASHI_ARRAY,
    PULSE_MATRIX, PRESSURE_W, PRESSURE_CAPACITY, SPAWN_SLOW_MUL,
    SPAWN_RUSH, SPAWN_RUSH_CAP, STRIKER_HOLD_Y, DUSK,
    STRIKER_FORTRESS, VARIANTS, STRIKER_SPEED_MUL, SIDE_SPEED_FAST,
    SIDE_SPEED_SLOW, SIDE_ENTRY_BOOST, SIDE_ENTRY_DECAY, SHIP_BULLET_COLOR,
    SHIP_BULLET_LEN, SPLIT_RED, PHASE_DURATION, PHASE_CHANCE,
    CAPITAL_PALETTE, GUNSHIP_PALETTE, REWARD_ITEMS, CAPITAL_HIGHFIRE_DR,
    CAPITAL_DESCEND_DR, BOSS_LOWFIRE_BONUS, POPIAN_VULN_LV1, POPIAN_VULN_LV2,
    CHAOS_SMALL_DMG_MUL, PIERCE_WEAKEN_MUL, DROP_KIT_RATE, DROP_KIT_RED,
    DROP_KIT_PURPLE, DROP_KIT_YELLOW, DROP_SHIELD_RATE, DROP_SHIELD_BLUE,
    DROP_SHIELD_STACK, DROP_HP_BY_CLASS, DROP_HP_PROLIFERA, DROP_HP_CYAN,
    DROP_HP_GREEN, DROP_HP_BOSS, DROP_HP_BOSS2, DROP_BOMB_ORANGE,
    DROP_KIT_BERSERK, SIDE_BEHAVIOR_COLORS, SIDE_MOON, SIDE_SPAWN_W,
    SIDE_SWIRL, TEST_HP, SIDE_SHOOT_HP, SIDE_SCORE,
    SIDE_KAMIKAZE_SCORE, WIP_PLACEHOLDER_TYPES, POEM_HP, poemHpOf,
    eliteHpOf, BOSS_LOOT_KIT, BOSS_LOOT_SHIELD, BOSS_LOOT_BOTH,
    ACHIEVEMENTS, ACHIEVEMENT_TIERS, ACHIEVEMENT_TIER_ORDER, ACHIEVEMENT_INFINITY_ENABLED,
    CRYSTAL_TIERS, CRYSTAL_GIANT_CHANCE, CRYSTAL_COLORS, CRYSTAL_COLORS_NORMAL,
    CRYSTAL_GIANT_COLORS, convertCrystalDrop, rollCrystalGiant,
  };
