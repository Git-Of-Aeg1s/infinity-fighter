// 01-config（拆分过渡壳）：《并行开发改造设计.md》批次 1c 逐域迁出后的剩余域；批次 1d 删除本壳（暂保留【临时】构建标记行）




  console.log('[InfinityFighter] JS build: 20260925-v035-1');   // 【临时】构建标记：验证浏览器缓存是否已刷新，确认后删除


  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：01-config-loadout(1 名) 02-achievements(7 名) 02-core(2 名) 04-spawn(14 名) 05-boss(20 名) 06-enemy(43 名) 07-player(6 名) 08-entities(14 名) 09-draw-ships(2 名) 10-draw-world(4 名) 11-draw-boss(7 名) 12-ui(4 名) 13-encyclopedia(15 名) 14-main(18 名)

  import { xiayongImg } from './01-config-core.js';
  import { currentArmor, hasPilot } from './01-config-loadout.js';
  import { ELITES, ZHANGZHANG, JIAOXIANG } from './01-config-enemies.js';



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
  const BOSS_LOWFIRE_BONUS = 0.20;    // 玩家火力 Lv1 时对 BOSS 的武器伤害加成（BOSS 受到伤害 ×1.20，逆境补偿）

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
    WAVE_POEM, REWARD_DRONES, rewardDroneChance, pickRewardDroneType,
    PRESSURE_W, PRESSURE_CAPACITY, SPAWN_SLOW_MUL, SPAWN_RUSH,
    SPAWN_RUSH_CAP, REWARD_ITEMS, BOSS_LOWFIRE_BONUS, CHAOS_SMALL_DMG_MUL,
    PIERCE_WEAKEN_MUL, DROP_KIT_RATE, DROP_KIT_RED, DROP_KIT_PURPLE,
    DROP_KIT_YELLOW, DROP_SHIELD_RATE, DROP_SHIELD_BLUE, DROP_SHIELD_STACK,
    DROP_HP_BY_CLASS, DROP_HP_PROLIFERA, DROP_HP_CYAN, DROP_HP_GREEN,
    DROP_HP_BOSS, DROP_HP_BOSS2, DROP_BOMB_ORANGE, DROP_KIT_BERSERK,
    TEST_HP, POEM_HP, poemHpOf, eliteHpOf,
    BOSS_LOOT_KIT, BOSS_LOOT_SHIELD, BOSS_LOOT_BOTH, ACHIEVEMENTS,
    ACHIEVEMENT_TIERS, ACHIEVEMENT_TIER_ORDER, ACHIEVEMENT_INFINITY_ENABLED, CRYSTAL_TIERS,
    CRYSTAL_GIANT_CHANCE, CRYSTAL_COLORS, CRYSTAL_COLORS_NORMAL, CRYSTAL_GIANT_COLORS,
    convertCrystalDrop, rollCrystalGiant,
  };
