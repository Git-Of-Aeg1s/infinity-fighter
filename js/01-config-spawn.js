// 01-config-spawn：刷怪分段 / 压力权重 / 掉落率 / 奖励道具池 / 水晶体系（《并行开发改造设计.md》批次 1c 自 01-config.js 拆出）

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：04-spawn(2 名) 06-enemy(20 名) 07-player(1 名) 08-entities(2 名) 09c-draw-crystal(2 名) 12-ui(1 名) 13-encyclopedia(7 名) 14-main(14 名)
  // 配置域群（01x）内部单向依赖：加载序见 index.html（core→loadout→enemies→boss→difficulty→spawn→achievements），对外只出不进

  import { hasPilot } from './01-config-loadout.js';
  import { currentDifficulty } from './01-config-difficulty.js';






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
  const CHAOS_SMALL_DMG_MUL = 1.6;   // 混乱将至主炮弹（mainShot）：对非 BOSS / 非 4S（四精英）敌人伤害 +60%（2026-10-10 用户定稿由 +80% 下调；结算见 08-entities）
  const PIERCE_WEAKEN_MUL = 0.5;   // mainPierce 穿透弹（无衰减率弹，如副武器·极夜流光激光）穿透后的伤害倍率：减半（结算见 08-entities）

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

  // 奖励无人舰刷新体系（2026-09-29）：虚象/具象/真我/诗篇难度下每次关卡等级提升，
  // 按 chances[难度] 概率刷新一架奖励无人舰（每次至多一架），再按 weights 在三种中加权抽取；
  // （原 DOUZHI.spawnChance 单机概率体系废弃，斗志昂扬的出场并入本权重表）
  const REWARD_DRONES = {
    chances: { illusion: 0.12, form: 0.10, realme: 0.07, poem: 0.07 },
    weights: { douzhi: 5, sponsor: 4, sponsorDeluxe: 1 },
  };
  // 当前难度的奖励无人舰刷新概率（未登记难度回退 0.07）
  function rewardDroneChance() {
    const c = REWARD_DRONES.chances[currentDifficulty.id];
    return c != null ? c : 0.07;
  }
  // 加权抽取本次刷新的奖励无人舰类型（douzhi 5 / sponsor 4 / sponsorDeluxe 1）
  function pickRewardDroneType() {
    const total = REWARD_DRONES.weights.douzhi + REWARD_DRONES.weights.sponsor + REWARD_DRONES.weights.sponsorDeluxe;
    let r = Math.random() * total;
    for (const k of ['douzhi', 'sponsor', 'sponsorDeluxe']) {
      r -= REWARD_DRONES.weights[k];
      if (r <= 0) return k;
    }
    return 'douzhi';
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

  /* ---------- 奖励道具池（赞助无人舰掉落，击坠时立刻生效——道具槽已于 2026-10-01 取消） ----------
   * sponsor 90% 普通 / 10% 稀有、sponsorDeluxe 必稀有；同稀有度内等权随机抽 id（06-enemy grantRewardItem → 07-player applyRewardItem 直达结算）。
   * 绷绷背包一局限掉一次；「哦哦！抽卡！」带 noDrop 标记不入掉落池——原石为萧杨专属技能充能
   * （每 16 颗充满一次，按副驾驶员技能键 Q 释放，见 07-player noteGachaStone / triggerPilotSkill）；
   * 效果结算与图鉴文案见 07-player applyRewardItem / 13-encyclopedia 数值与机制「道具」页签。
   */
  const REWARD_ITEMS = {
    // ---- 普通（白色）----
    laodaDrink:   { id: 'laodaDrink',   rarity: 'normal', name: '牢大特饮', glyph: '🥤',
                    desc: '移速 +40%，持续 15s。' },
    magnetShroom: { id: 'magnetShroom', rarity: 'normal', name: '磁力菇', glyph: '🍄',
                    desc: '水晶拾取半径 +75，持续一整局，可叠加。' },
    noLingluo:    { id: 'noLingluo',    rarity: 'normal', name: '不再陵落', glyph: '🗡',
                    desc: '以 32 发/s 向周身螺旋射出无界飞剑，持续 9s；飞剑可穿透 2 个敌人，每次穿透伤害 -20%；射出方向在水平线以下的飞剑对 BOSS 只造成 50% 伤害。' },
    frostGen:     { id: 'frostGen',     rarity: 'normal', name: '寒霜发生器', glyph: '❄',
                    desc: '周身160px内围绕寒霜力场，力场内敌机射速/移速 -60%、敌方子弹弹速 -30%，持续 12s；到期后力场朝正上方以80px/s发射离场。力场内焦香螺旋桨的火环失效且持续受到伤害。' },
    xinguodongFury: { id: 'xinguodongFury', rarity: 'normal', name: '辛国栋大怒', glyph: '🔥',
                    desc: '以自身位置为中心生成一个辛国栋的怒意之环，半径持续扩大、6s 后达到最大，随后再持续6s。怒意之环持续灼烧所有敌人，且对暴怒辛国栋造成 5 倍伤害。' },
    honghongBomb: { id: 'honghongBomb', rarity: 'normal', name: '轰轰炸弹', glyph: '💣',
                    desc: '击败敌人后立刻对其周围一定距离内的敌人造成相当于该机最大生命值 20% 的伤害，可连锁爆炸，持续20s。1/2/3/4 类敌人的扩散距离分别为 40/50/60/70px；BOSS 战中 1 类敌人的伤害 ×10。' },
    // ---- 稀有（金色）----
    bengbag:      { id: 'bengbag',      rarity: 'rare', name: '绷绷背包', glyph: '🎒',
                    desc: '高能爆弹 / 绷绷炸弹携带上限 +1 并立刻补充 1 枚，持续一整局；该道具一局限掉落一次。' },
    jiukeShadow:  { id: 'jiukeShadow',  rarity: 'rare', name: '酒客之影', glyph: '🍶',
                    desc: '获得 100% 闪避，机体透明化加深，持续30s。但每成功闪避一次，闪避概率就减少 20%，直到归零或持续时间结束。' },
    gacha:        { id: 'gacha',        rarity: 'rare', name: '哦哦！抽卡！', glyph: '🎲', noDrop: true,
                    desc: '不入赞助无人舰掉落池——原石（巨型水晶）为萧杨专属：萧杨每收集 16 颗原石充满一次该技能（击坠无人机获得的道具直接生效，无槽位概念），充满后按副驾驶员技能键 <b>Q</b> 释放（其他驾驶员不收集原石、无法使用）。<br>释放效果：16 颗原石自四面八方随机先后汇集机体（约 2.5s，期间无敌、我方输出 -60%），收束后清除周身 300px 敌弹并抽卡：70% 蓝 / 25% 紫 / 5% 金——场中巨影闪现，同色陨石轰击场心（蓝 6000 / 紫 16000 全场伤害；金秒杀全场敌方单位——与埃逸殉爆同款：禁用增生分裂 / 法术矩阵爆发等召唤型亡语、无法秒杀二阶段风暴编织者）；陨石同时清除全场敌我弹幕与预警（暴风之眼风波/风柱、风暴编织者雷霆/激光预警、战争幽灵登场——登场的战争幽灵直接被砸死）。' },
    bottleSpirit: { id: 'bottleSpirit', rarity: 'rare', name: '瓶中精灵', glyph: '🧪',
                    desc: '获得 50% 最大生命值的独立永久屏障。同时拥有屏障与永久屏障时优先消耗屏障；屏障到期消散不影响永久屏障；永久屏障能够吸收溢出伤害。' },
  };

  /* ---------- 道具掉落规则（见 rollItemDrops；2026-10-12 用户定稿：套件/护盾不再吃颜色倍率，全敌人统一基础值） ---------- */
  const DROP_KIT_RATE = 0.09;      // 升级套件基础掉率（全敌人统一）
  const DROP_SHIELD_RATE = 0.02;   // 量子护盾基础掉率（全敌人统一）
  const DROP_SHIELD_STACK = 0.35;  // 场上已有护盾道具或我方已带盾时的降率倍数
  const DROP_HP_BY_CLASS = { 1: 0.005, 2: 0.01, 3: 0.02, 4: 0.06 };   // 加血套件按敌机类别基础掉率（1类 0.5% / 2类 1% / 3类 2% / 4类 6%，2026-10-08 用户定稿）
  const DROP_HP_PROLIFERA = 0.04;  // 增生侧翼艇（淡青绿）加血掉率（固定值，不随类别表；2026-10-08 用户定稿 10%→4%）
  const DROP_HP_CYAN = 0.08;       // 青时炮艇（3类 cyan 变体，绿色标记）加血掉率（固定值；2026-10-08 用户定稿）
  const DROP_HP_GREEN = 0.10;      // 铁砧（治疗无人机，灰+绿标记）加血掉率（固定值，维持 10%）
  const DROP_HP_ELITE = 0.10;      // 4S 精英（黑暗之手四连携精英 + 张华&张策）加血掉率（固定值；2026-10-10 用户定稿，取代类别表 4类 6%）
  const DROP_HP_BOSS = 0.40;       // BOSS 加血：40% 掉 1 个
  const DROP_HP_BOSS2 = 0.10;      // BOSS 加血：另有 10% 一次掉 2 个
  const DROP_BOMB_ORANGE = 0.005;  // 橙色敌人爆弹掉率（整场战斗最多触发一次，不影响 4类 5% 与 BOSS 20%）
  const DROP_KIT_BERSERK = 0.05;   // 升级套件变为暴走道具的概率

  // ---------- 刷怪权重（原「波次刷怪权重」，2026-10-12 用户定稿更名；诗篇波次制 · 规划数据，承接测试3各波次；自 13-encyclopedia 迁入 2026-10-12）----------
  // 每波按 1/2/3/4 类别设定职能池权重（池成员见 13-encyclopedia 怪物权重页职能表）：刷怪时按权重随机一个池，
  // 再在池内按职能表权重随机具体敌人。系统规则（2026-10-11 用户定稿）：
  //   ① 多个同类敌人的波次：整组先随机一个池（大类），该组同类敌人全部只从该池刷新；随后整组 8% 概率锁定为同一种具体敌人；
  //   ② 后波敌人停留线统一上移屏高 8%（不会导致出界或出场不完全）；
  //   ③ 生成回退：该类别所选池在当前等级均无权重 → 换一个大类刷新；全部大类均不可刷 → 固定生成
  //      赤月侧翼艇（1类）/ 赤红突击艇（2类）/ 赤红炮艇（3类）/ 赤红主力舰（4类）；
  //   ④ 未登记波次（WAVE_SPAWN_W 无条目）按该波出现的类别套用 WAVE_SPAWN_W_DEFAULT 默认权重。
  const WAVE_SPAWN_W_DEFAULT = {
    1: [['1类全部', 20]],
    2: [['2类攻击', 20], ['2类侧位', 1]],
    3: [['3类攻击', 25], ['3类攻击后位', 3], ['3类攻击压制', 2], ['3类增益辅助', 2], ['3类削弱辅助', 2]],
    4: [['4类攻击', 50], ['4类召唤', 10], ['4类突进', 5]],
  };
  const WAVE_SPAWN_W = {   // 已定权重波次（id → 类别 → [职能池, 权重]；未列出者走默认）
    '1111': { 1: [['1类全部', 10], ['1类普通', 20], ['1类攻击', 1], ['1类防御', 2]] },
    '1*6': { 1: [['1类全部', 20], ['1类普通', 10], ['1类攻击', 1], ['1类防御', 3]] },
    '121': { 1: [['1类普通', 20], ['1类防御', 1]], 2: [['2类攻击', 20], ['2类侧位', 1]] },
    '131': { 1: [['1类普通', 20], ['1类防御', 1]], 3: [['3类攻击', 25], ['3类攻击后位', 2], ['3类攻击压制', 2], ['3类增益辅助', 1]] },
    '22': { 2: [['2类攻击', 20], ['2类侧位', 1]] },
    '11': { 1: [['1类全部', 20]] },
    '1类小队': { 1: [['1类全部', 20]] },
    '2222': { 2: [['2类攻击', 20], ['2类侧位', 1], ['2类防御', 1]] },
    '11211': { 1: [['1类普通', 20], ['1类防御', 1]], 2: [['2类攻击', 20], ['2类侧位', 1]] },
    '232111': { 1: [['1类全部', 20], ['1类防御', 1]], 2: [['2类攻击', 20], ['2类侧位', 1]], 3: [['3类攻击', 25], ['3类攻击后位', 3], ['3类攻击压制', 1], ['3类增益辅助', 2], ['3类攻击重装', 1], ['3类削弱辅助', 2]] },
    '23': { 2: [['2类攻击', 20], ['2类侧位', 1]], 3: [['3类攻击', 25], ['3类攻击后位', 3], ['3类增益辅助', 3], ['3类攻击重装', 1]] },
    '12321': { 1: [['1类普通', 20], ['1类防御', 1]], 2: [['2类攻击', 20], ['2类侧位', 1]], 3: [['3类攻击', 25], ['3类攻击后位', 3], ['3类攻击压制', 1], ['3类增益辅助', 2], ['3类攻击重装', 1]] },
    '222': { 2: [['2类攻击', 20], ['2类侧位', 1]] },
    '22·22': { 2: [['2类攻击', 20]] },
    '2*5': { 2: [['2类攻击', 20], ['2类侧位', 3], ['2类防御', 5]] },
    '33': { 3: [['3类攻击', 25], ['3类攻击压制', 5], ['3类攻击重装', 1], ['3类削弱辅助', 5], ['3类增益辅助', 2]] },
    '3-2-3': { 2: [['2类攻击', 20], ['2类侧位', 1], ['2类防御', 1]], 3: [['3类攻击', 25], ['3类攻击后位', 3], ['3类增益辅助', 3], ['3类攻击重装', 1]] },
    '1*10': { 1: [['1类普通', 20], ['1类防御', 2], ['1类全部', 2]] },
    '1类长队': { 1: [['1类普通', 20], ['1类全部', 10]] },
    // —— 真我级 / 诗篇级（2026-10-11 第二批登记；「4 单舰压阵」未列 = 走 4类默认）——
    '2*7+3': { 2: [['2类攻击', 20], ['2类侧位', 1], ['2类防御', 3]], 3: [['3类攻击', 25], ['3类攻击后位', 5], ['3类攻击压制', 10]] },
    '2*7': { 2: [['2类攻击', 20], ['2类侧位', 1], ['2类防御', 1]] },
    '3223': { 2: [['2类攻击', 20], ['2类侧位', 1], ['2类防御', 1]], 3: [['3类攻击', 25], ['3类攻击压制', 3], ['3类削弱辅助', 3], ['3类攻击后位', 2]] },
    '333': { 3: [['3类攻击', 25], ['3类攻击压制', 2], ['3类攻击后位', 2], ['3类削弱辅助', 1]] },
    '4+1*4': { 4: [['4类攻击', 20], ['4类召唤', 10]] },   // 1类护卫位未列 → 走 1类默认
    '32223': { 2: [['2类攻击', 20], ['2类侧位', 1], ['2类防御', 5]], 3: [['3类攻击', 25], ['3类攻击压制', 2], ['3类削弱辅助', 3], ['3类攻击后位', 3], ['3类增益辅助', 2]] },
    '双侧斜扫': { 1: [['1类全部', 20], ['1类普通', 5], ['1类防御', 1]] },
    '2*10': { 2: [['2类攻击', 25], ['2类侧位', 1]] },
    '3*4': { 3: [['3类攻击', 20], ['3类攻击压制', 2]] },
    '3*5': { 3: [['3类攻击', 20], ['3类攻击压制', 1]] },
    '22422': { 2: [['2类攻击', 20], ['2类侧位', 4]], 4: [['4类攻击', 30], ['4类召唤', 10]] },
    '44': { 4: [['4类攻击', 10], ['4类召唤', 15], ['4类突进', 1]] },
    '1234321': { 1: [['1类全部', 10]], 2: [['2类全部', 10]], 3: [['3类全部', 10]], 4: [['4类全部', 10]] },
    // —— 第三批登记（2026-10-11 用户定稿：新波次示意卡；指定池波——z*8/y*/2R/w*1 为固定敌波不走职能池；h*1/h*2 走 3类攻击后位）——
    '2侧+1*2': { 1: [['1类全部', 1]], 2: [['2类侧位', 1]] },   // 具象侧辅：从一侧 1 个 2类侧位 + 2 个 1类
    '1*12防': { 1: [['1类防御', 1]] },                          // 具象前波：12 个增生依次快速下压
    '1*7攻': { 1: [['1类攻击', 1]] },                           // 具象前波：7 架紫电依次快速下压
    '2侧*2': { 2: [['2类侧位', 1]] },                           // 真我侧辅：两侧各 1 个 2类侧位
    '3侧': { 3: [['3类攻击压制', 10], ['3类削弱辅助', 25]] },   // 具象侧翼：1 个 3类（压制=暴鸰系 / 削弱辅助=交响系）
    '3侧*2': { 3: [['3类攻击压制', 10], ['3类削弱辅助', 25]] }, // 真我侧翼：2 个 3类（50% 同侧不同位 / 50% 异侧）
    'h*1': { 3: [['3类攻击后位', 1]] },                         // 额外特殊·单导弹：召唤 1 个 3类攻击后位（现池仅炮火先兆者）
    'h*2': { 3: [['3类攻击后位', 1]] },                         // 额外特殊·双导弹：召唤 2 个 3类攻击后位（现池仅炮火先兆者）
    // 特7~特10（2类直落系，2026-10-12 用户定稿）：职能池限定「2类突击」＝2类攻击组内 5 个突击艇变体
    //（赤红/烈橙/幽蓝/紫晶/霜白，按各自职能表档位权重抽取）——去掉法术矩阵 / 法术大师A1（组定义见 13-encyclopedia INFO_T1_GROUPS）
    '特7': { 2: [['2类突击', 20]] },
    '特8': { 2: [['2类突击', 20]] },
    '特9': { 2: [['2类突击', 20]] },
    '特10': { 2: [['2类突击', 20]] },
  };
  // 展示清单（与测试3波次同步维护；fixed = 不走职能池的固定敌波；classes = 该波刷新的类别，默认波按此套默认权重）
  const WAVE_SPAWN_LIST = [
    { id: '1111', name: '一字横排', tier: '虚象级', role: '前波', comp: '4×1类', classes: ['1'] },
    { id: '1*6', name: '横排六机', tier: '虚象级', role: '前波', comp: '6×1类', classes: ['1'] },
    { id: '11', name: '剪刀交叉', tier: '虚象级', role: '侧翼', comp: '4×1类', classes: ['1'] },
    { id: '121', name: '夹心品字', tier: '虚象级', role: '前后均可', comp: '1×2类+2×1类', classes: ['1', '2'] },
    { id: '131', name: '', tier: '虚象级', role: '后波', comp: '2×1类+1×3类', classes: ['1', '3'] },
    { id: '1类小队', name: '', tier: '虚象级', role: '侧翼', comp: '3~5×1类', classes: ['1'] },
    { id: '22', name: '', tier: '虚象级', role: '前后均可', comp: '2×2类', classes: ['2'] },
    { id: 'y*1', name: '单幽暮', tier: '特殊级', role: '特殊', comp: '1×幽暮', classes: ['y'], fixed: '固定敌人：幽暮×1（30%~70% 高度随机浮现）' },
    { id: '222', name: '三机横排', tier: '具象级', role: '前后均可', comp: '3×2类', classes: ['2'] },
    { id: '22·22', name: '双组错位', tier: '具象级', role: '前后均可', comp: '4×2类', classes: ['2'] },
    { id: '2*5', name: '波浪五机', tier: '具象级', role: '前波', comp: '5×2类', classes: ['2'] },
    { id: '23', name: '护航截击', tier: '具象级', role: '后波', comp: '2×2类+1×3类', classes: ['2', '3'] },
    { id: '33', name: '对称双艇', tier: '具象级', role: '前后均可', comp: '2×3类', classes: ['3'] },
    { id: '3-2-3', name: '品字炮阵', tier: '具象级', role: '前后均可', comp: '2×3类+1×2类', classes: ['2', '3'] },
    { id: '2222', name: '菱形四机', tier: '具象级', role: '前波', comp: '4×2类', classes: ['2'] },
    { id: '12321', name: '回文横排', tier: '具象级', role: '后波', comp: '2×1类+2×2类+1×3类', classes: ['1', '2', '3'] },
    { id: '11211', name: '中央铁芯', tier: '具象级', role: '前波', comp: '4×1类+1×2类', classes: ['1', '2'] },
    { id: '1*10', name: '单侧洪流', tier: '具象级', role: '侧翼', comp: '10×1类', classes: ['1'] },
    { id: '1类长队', name: '', tier: '具象级', role: '侧翼', comp: '4~7×1类', classes: ['1'] },
    { id: '2侧+1*2', name: '侧卫掩护', tier: '具象级', role: '侧翼', comp: '1×2类侧位+2×1类', classes: ['2', '1'] },
    { id: '3侧', name: '侧翼压制', tier: '具象级', role: '侧翼', comp: '1×3类', classes: ['3'] },
    { id: 'y*2', name: '双幽暮', tier: '特殊级', role: '特殊', comp: '2×幽暮', classes: ['y'], fixed: '固定敌人：幽暮×2（30%~70% 高度随机浮现）' },
    { id: '1*12防', name: '增生急行', tier: '具象级', role: '前波', comp: '12×1类防御', classes: ['1'] },
    { id: '1*7攻', name: '紫电急行', tier: '具象级', role: '前波', comp: '7×1类攻击', classes: ['1'] },
    { id: '232111', name: '', tier: '具象级', role: '前波', comp: '2×2类+1×3类+6×1类', classes: ['1', '2', '3'] },
    { id: '333', name: '三艇横阵', tier: '真我级', role: '前后均可', comp: '3×3类', classes: ['3'] },
    { id: '3223', name: '内收双艇', tier: '真我级', role: '后波', comp: '2×3类+2×2类', classes: ['2', '3'] },
    { id: '4', name: '单舰压阵', tier: '真我级', role: '前后均可', comp: '1×4类', classes: ['4'] },
    { id: '4+1*4', name: '舰载护卫', tier: '真我级', role: '前后均可', comp: '1×4类+4×1类', classes: ['1', '4'] },
    { id: '2*7+3', name: 'V字殿后', tier: '真我级', role: '前波', comp: '7×2类+1×3类', classes: ['2', '3'] },
    { id: '2*7', name: '', tier: '真我级', role: '前波', comp: '7×2类', classes: ['2'] },
    { id: '232232', name: '', tier: '真我级', role: '后波', comp: '4×2类+2×3类', classes: ['2', '3'] },
    { id: '双侧斜扫', name: '', tier: '真我级', role: '侧翼', comp: '两队各6~8×1类', classes: ['1'] },
    { id: '32223', name: '', tier: '真我级', role: '前后均可', comp: '2×3类+3×2类', classes: ['2', '3'] },
    { id: '2侧*2', name: '双侧破片', tier: '真我级', role: '侧翼', comp: '两侧各1×2类侧位', classes: ['2'] },
    { id: '3侧*2', name: '侧翼压制×2', tier: '真我级', role: '侧翼', comp: '2×3类', classes: ['3'], sideAmbig: true },
    { id: '2*10', name: '双V梯队', tier: '诗篇级', role: '前波', comp: '10×2类', classes: ['2'] },
    { id: '3*4', name: '四艇横阵', tier: '诗篇级', role: '前波', comp: '4×3类', classes: ['3'] },
    { id: '22422', name: '旗舰横阵', tier: '诗篇级', role: '后波', comp: '4×2类+1×4类', classes: ['2', '4'] },
    { id: '44', name: '双舰压阵', tier: '诗篇级', role: '后波', comp: '2×4类', classes: ['4'] },
    { id: '3*5', name: '五艇横阵', tier: '诗篇级', role: '前波', comp: '5×3类', classes: ['3'] },
    { id: '1234321', name: '金字塔横阵', tier: '诗篇级', role: '后波', comp: '2×1类+2×2类+2×3类+1×4类', classes: ['1', '2', '3', '4'] },
    { id: 'w*1', name: '战争幽灵', tier: '诗篇级', role: '前波', comp: '1×战争幽灵', classes: ['w'], fixed: '固定敌人：战争幽灵×1（目标点 50%~70% 高度随机）' },
    { id: 'z*8', name: '双侧自爆对冲', tier: '诗篇级', role: '侧翼', comp: '两侧各7~10×紫电/白影', classes: ['z'], fixed: '固定敌人：紫电7:白影3，两侧各7~10只，斜向对侧边缘偏下' },
    { id: 'y*4', name: '幽暮四角', tier: '特殊级', role: '特殊', comp: '4×幽暮', classes: ['y'], fixed: '固定敌人：幽暮×4（前两架 80% 高度、后两架 50%~60% 随机）' },
    { id: 'h*1', name: '单导弹', tier: '额外级', role: '特殊', prob: true, comp: '1×3类攻击后位', classes: ['3'] },
    { id: 'h*2', name: '双导弹', tier: '额外级', role: '特殊', prob: true, comp: '2×3类攻击后位', classes: ['3'] },
    { id: '2R', name: '增益无人舰', tier: '额外级', role: '特殊', prob: true, comp: '1×2R类', classes: ['r'], fixed: '固定敌人：斗志昂扬10 / 赞助无人舰8 / 豪华赞助无人舰2（侧翼横穿）' },
    { id: '特1', name: '单点1类', tier: '额外级', role: '特殊', comp: '1×1类', classes: ['1'] },
    { id: '特2', name: '双点1类', tier: '额外级', role: '特殊', comp: '2×1类', classes: ['1'] },
    { id: '特3', name: '五点均分', tier: '额外级', role: '特殊', comp: '5×1类', classes: ['1'] },
    { id: '特3.5', name: '鱼贯长队', tier: '额外级', role: '特殊', comp: '7×1类', classes: ['1'] },
    { id: '特4', name: '单点2类', tier: '额外级', role: '特殊', comp: '1×2类', classes: ['2'] },
    { id: '特5', name: '双点2类', tier: '额外级', role: '特殊', comp: '2×2类', classes: ['2'] },
    { id: '特6', name: '相邻双2', tier: '额外级', role: '特殊', comp: '2×2类', classes: ['2'] },
    { id: '特7', name: '2类直落', tier: '额外级', role: '特殊', comp: '1×2类', classes: ['2'] },
    { id: '特8', name: '双2直落', tier: '额外级', role: '特殊', comp: '2×2类', classes: ['2'] },
    { id: '特9', name: '连发双2直落', tier: '额外级', role: '特殊', comp: '2×2类', classes: ['2'] },
    { id: '特10', name: '连发三2直落', tier: '额外级', role: '特殊', comp: '3×2类', classes: ['2'] },
    { id: '特11', name: '单点3类', tier: '额外级', role: '特殊', comp: '1×3类', classes: ['3'] },
    { id: '特12', name: '双点3类', tier: '额外级', role: '特殊', comp: '2×3类', classes: ['3'] },
    { id: '特13', name: '相邻双3', tier: '额外级', role: '特殊', comp: '2×3类', classes: ['3'] },
  ];

  // 波次卡抽取权重（id → [Lv1, Lv11, Lv21, Lv31, Lv41]；0 = 该等级档不刷出）——
  // 「波次权重」子页展示 + 双消费端（2026-10-12 用户定稿，数值以桌面《波次权重填数表.xlsx》为准）：
  //   · 非诗篇：pickDesignedWaveCard 按当前等级档取列（替代 tier 硬门槛）；
  //   · 诗篇：主战卡（前波/后波/前后均可）主波抽取 + 侧翼/额外额外生成按档取列（见 pickPoemFlankCard / pickPoemExtraCard）。
  // 特殊级 = 幽暮系特殊波 y*1/y*2/y*4（原列虚象/具象/真我级，2026-10-12 用户定稿抽出为独立区块；role 仍为「特殊」，
  // 生成走诗篇额外波次通道——pickWaveCardByRole 只按 role 过滤、不受 tier 迁移影响）。
  // 诗篇仅三阶段（波 N = 等级 N：Lv1~10 / Lv11~20 / Lv21~30）→ 只填列 0~2，列 3/4 恒 0；
  // 概率卡（h*1/h*2/2R，prob: true）表内数值为「每波触发概率」而非权重——不入任何权重池（真额外三项，见 pickPoemTrueExtra）。
  const WAVE_SPAWN_DRAW_W = {
    // —— 虚象级 ——
    '1111': [5, 1, 1, 0, 0],
    '1*6': [5, 1, 1, 0, 0],
    '11': [5, 1, 1, 0, 0],
    '121': [10, 5, 5, 0, 0],
    '131': [10, 10, 10, 0, 0],
    '1类小队': [10, 5, 5, 0, 0],
    '22': [10, 10, 10, 0, 0],
    // —— 具象级 ——
    '222': [10, 2, 2, 0, 0],
    '22·22': [10, 2, 2, 0, 0],
    '2*5': [5, 10, 10, 0, 0],
    '23': [10, 3, 3, 0, 0],
    '33': [10, 5, 5, 0, 0],
    '3-2-3': [10, 10, 10, 0, 0],
    '2222': [10, 5, 5, 0, 0],
    '12321': [10, 10, 10, 0, 0],
    '11211': [20, 2, 1, 0, 0],
    '1*10': [5, 10, 10, 0, 0],
    '1类长队': [10, 20, 20, 0, 0],
    '2侧+1*2': [0, 20, 10, 0, 0],
    '3侧': [0, 10, 20, 0, 0],
    '1*12防': [0, 3, 5, 0, 0],
    '1*7攻': [0, 3, 5, 0, 0],
    '232111': [10, 10, 10, 0, 0],
    // —— 真我级 ——
    '333': [10, 10, 10, 0, 0],
    '3223': [10, 10, 10, 0, 0],
    '4': [10, 10, 10, 0, 0],
    '4+1*4': [10, 10, 10, 0, 0],
    '2*7+3': [5, 10, 10, 0, 0],
    '2*7': [10, 10, 10, 0, 0],
    '232232': [5, 10, 10, 0, 0],
    '双侧斜扫': [10, 20, 20, 0, 0],
    '32223': [10, 10, 10, 0, 0],
    '2侧*2': [0, 20, 10, 0, 0],
    '3侧*2': [0, 10, 20, 0, 0],
    // —— 诗篇级 ——
    '2*10': [10, 10, 10, 0, 0],
    '3*4': [10, 10, 8, 0, 0],
    '3*5': [2, 10, 10, 0, 0],
    '22422': [0, 8, 8, 0, 0],
    '44': [0, 8, 8, 0, 0],
    '1234321': [2, 10, 10, 0, 0],
    'w*1': [0, 0, 10, 0, 0],
    'z*8': [5, 5, 5, 0, 0],
    // —— 特殊级（幽暮系特殊波 y*1/y*2/y*4，原列虚象/具象/真我级，2026-10-12 用户定稿抽出；诗篇经额外波次通道生成）——
    'y*1': [2, 3, 1, 0, 0],
    'y*2': [0, 5, 3, 0, 0],
    'y*4': [0, 2, 5, 0, 0],
    // —— 额外级（特N = 权重；前三张 prob 卡 = 每波触发概率）——
    'h*1': [0.02, 0.02, 0, 0, 0],
    'h*2': [0, 0.03, 0.05, 0, 0],
    '2R': [0.06, 0.06, 0.06, 0, 0],
    '特1': [5, 3, 2, 0, 0],
    '特2': [5, 3, 2, 0, 0],
    '特3': [5, 3, 2, 0, 0],
    '特3.5': [5, 3, 2, 0, 0],
    '特4': [10, 8, 8, 0, 0],
    '特5': [10, 8, 8, 0, 0],
    '特6': [10, 8, 8, 0, 0],
    '特7': [3, 5, 7, 0, 0],
    '特8': [3, 5, 7, 0, 0],
    '特9': [3, 5, 7, 0, 0],
    '特10': [3, 5, 7, 0, 0],
    '特11': [5, 8, 10, 0, 0],
    '特12': [5, 8, 10, 0, 0],
    '特13': [5, 8, 10, 0, 0],
  };

  // ---------- 设计波次抽取（非诗篇替换旧编队系统，2026-10-12 用户定稿）----------
  // 刷怪权重表全部设计卡替换旧 WAVE_FORMATIONS 编队：场面压力节奏保留（spawnTimer / rush 不变），
  // 每次刷新从本表抽一张卡整波刷出（生成见 04-spawn spawnDesignedWave）。抽取规则：
  //   · 基础权重按当前等级档取 WAVE_SPAWN_DRAW_W（Lv1~10→列0 / Lv11~20→列1 / Lv21~30→列2 / Lv31~40→列3 / Lv41+→列4）；
  //     该档权重 0 = 不刷出（等级门槛由权重表表达，各档均有非零卡保证不空档）；
  //   · 剩余权重：卡刷过后进入恢复期（DW_RECOVER_T 秒线性恢复满），恢复期权重按剩余比例衰减——自然轮换不重复；
  //   · 角色平衡：与上次刷新同 role（后波/侧翼等）的卡权重 ×DW_SAME_ROLE_MUL——较少连刷后波/侧翼；
  //   · 恢复期保底 2% 基础权重参与抽取（等效「最久未刷优先」），抽取池永不空；
  //   · 许凯狗冲刺排除侧翼卡（冲刺两侧不刷怪，同旧 sideEntry 规则）；
  //   · 场上已有主力舰时排除含 4类卡（主力舰同屏限 1；44 双舰为卡内构成不受此限）。
  function dwTierIdx(lv) { return lv < 11 ? 0 : lv < 21 ? 1 : lv < 31 ? 2 : lv < 41 ? 3 : 4; }   // 抽取权重列号（同「波次权重」页 5 列）
  const DW_RECOVER_T = 16;        // 剩余权重恢复满所需秒数（≈8 波间隔，自然轮换）
  const DW_SAME_ROLE_MUL = 0.35;  // 与上次刷新同角色的卡权重乘数（角色平衡）
  const DW_LAST = new Map();      // 卡 id → 上次刷新时刻（state.time）
  let dwLastRole = '';            // 上次刷新卡的 role（角色平衡参照）
  function resetDesignedWaveState() {
    DW_LAST.clear();
    dwLastRole = '';
  }
  // 等级（tier）先行抽取权重（2026-10-12 用户定稿，诗篇主战 / 非诗篇主池共用）：
  // 先按阶段选 tier（虚象/具象/真我/诗篇），tier 内再按「波次权重」当前档列抽卡——
  //   Lv1~10 = 10/10/8/5   Lv11~20 = 5/10/15/8   Lv21~30 = 2/5/20/10；
  // 游戏等级上限 31（lv31 = 终局 BOSS 关）——Lv31 走兜底档（列 3 全零）+ 沿用 Lv21~30 行等级权重；Lv41+ 档不存在；
  // 特殊级（幽暮系）/ 额外级（特N + 概率卡）不经此通道：诗篇经额外波次/真额外概率通道生成（pickPoemExtraCard / pickPoemTrueExtra），
  // 非诗篇经升级判定走同款通道（14-main 关卡提升分支，概率/权重同诗篇）。
  const WAVE_TIER_STAGE_W = [
    [10, 10, 8, 5],
    [5, 10, 15, 8],
    [2, 5, 20, 10],
  ];
  const WAVE_TIER_NAMES = ['虚象级', '具象级', '真我级', '诗篇级'];

  // 单 tier 可刷卡池：过滤（prob/定位/4类）+ 权重（严格表或定位兜底）+ 恢复期衰减 + 同定位乘数
  function dwBuildTierPool(tier, col, hasW, opts, now) {
    const pool = [];
    for (const w of WAVE_SPAWN_LIST) {
      if (w.tier !== tier) continue;
      // 等权兜底按定位加权（2026-10-12 用户反馈真我刷怪总量大幅降低后调整）：
      // 主战卡（前波/后波/前后均可）1.2 / 侧翼 0.9 / 特殊 0.35——表填入非零后按表、不受此影响
      const baseW = hasW ? ((WAVE_SPAWN_DRAW_W[w.id] || [])[col] || 0)
        : (w.role === '特殊' ? 0.35 : w.role === '侧翼' ? 0.9 : 1.2);
      if (baseW <= 0) continue;   // 该等级档权重 0 = 不刷出
      if (w.prob) continue;   // 概率型真额外卡（单导弹/双导弹/增益无人舰）不入权重池（2026-10-12 用户定稿）
      if (opts.roles && !opts.roles.includes(w.role)) continue;   // 定位限定池：诗篇主波前波位 ['前波','前后均可'] / 后波位 ['后波','前后均可']（2026-10-12 用户定稿：每等级固定 1前波+1后波）
      if (opts.noSide && w.role === '侧翼') continue;
      if (opts.noCapital && w.classes && w.classes.includes('4')) continue;
      const last = DW_LAST.get(w.id);
      const rem = last == null ? 1 : Math.min(1, (now - last) / DW_RECOVER_T);
      const wt = baseW * (0.02 + 0.98 * rem) * (w.role === dwLastRole ? DW_SAME_ROLE_MUL : 1);
      pool.push({ w, wt });
    }
    return pool;
  }
  function pickDesignedWaveCard(now, lv, opts) {
    opts = opts || {};
    // 该等级档是否有任何非零权重：有 → 严格按表（0 = 不刷出）；全 0（数值待填占位）→ 等权 1 兜底不停摆
    const col = dwTierIdx(lv);
    let hasW = false;
    for (const w of WAVE_SPAWN_LIST) {
      if (((WAVE_SPAWN_DRAW_W[w.id] || [])[col] || 0) > 0) { hasW = true; break; }
    }
    // 等级先行（2026-10-12 用户定稿）：4 主战等级按阶段权重抽 tier，tier 内无可刷卡（全 0/被过滤）则该 tier 不参与抽取；
    // 非诗篇不限定位（无 1前1后配对要求——侧翼随池，冲刺期 noSide 排除）；诗篇主波 mainOnly 限主战卡
    const stage = Math.min(col, WAVE_TIER_STAGE_W.length - 1);   // 非诗篇 Lv31+ 沿用 Lv21~30 行
    const tierW = WAVE_TIER_STAGE_W[stage];
    const tierPool = [];
    let tierTotal = 0;
    for (let ti = 0; ti < WAVE_TIER_NAMES.length; ti++) {
      const pool = dwBuildTierPool(WAVE_TIER_NAMES[ti], col, hasW, opts, now);
      if (!pool.length) continue;
      tierPool.push({ pool, wt: tierW[ti] });
      tierTotal += tierW[ti];
    }
    if (!tierPool.length) return null;
    let tr = Math.random() * tierTotal;
    let sel = tierPool[tierPool.length - 1];
    for (const tp of tierPool) {
      tr -= tp.wt;
      if (tr <= 0) { sel = tp; break; }
    }
    // tier 内按卡权重抽取（池已含恢复期 2% 保底 + 同定位 ×0.35 衰减）
    let total = 0;
    for (const it of sel.pool) total += it.wt;
    let r = Math.random() * total;
    let pick = sel.pool[sel.pool.length - 1].w;
    for (const it of sel.pool) {
      r -= it.wt;
      if (r <= 0) { pick = it.w; break; }
    }
    DW_LAST.set(pick.id, now);
    dwLastRole = pick.role;
    return pick;
  }

  // ---------- 诗篇额外生成（2026-10-12 用户定稿，登记《诗篇难度修正.md》）----------
  // 诗篇三阶段（波 N = 等级 N）：Lv1~10 / Lv11~20 / Lv21~30 → 档位列 0/1/2（诗篇只填三列）。
  // 每波主战卡落地后依次独立掷三串（互不影响、均不推进 waveSeq/poemWaveIdx）：
  //   ①侧翼波次额外生成：先掷本波概率 → 按「等级权重」选 tier → tier 内「侧翼」定位卡按「波次权重」当前档列加权抽取 → 按卡构成出怪；
  //   ②额外波次生成：先掷本波概率 → 「特殊」定位全池（特N + 并入的幽暮系特殊波，权重不变）按当前档列求和抽取；
  //     ——原「特殊波次」生成类别（5%/8%/10%）随并入作废，之后不再有特殊波次生成通道；
  //   ③真额外三项（prob 卡）：单导弹/双导弹（互斥——单导弹命中则本波不再判双导弹）/ 增益无人舰，表内数值即每波触发概率，
  //     独立于①②，也不会被①②的权重池随机到（pickDesignedWaveCard / pickWaveCardByRole 均排除 prob 卡）。
  const POEM_FLANK_EXTRA = {
    chance: [0.50, 0.80, 0.80],   // 本波触发概率（Lv1~10 / Lv11~20 / Lv21~30 档）
    tierW: [                       // 等级（波次卡 tier）选择权重：虚象 / 具象 / 真我 / 诗篇
      [10, 5, 5, 1],               // Lv1~10 档
      [5, 10, 8, 5],               // Lv11~20 档
      [1, 10, 10, 5],              // Lv21~30 档
    ],
  };
  const POEM_EXTRA_CHANCE = [0.50, 1, 1];   // 额外波次本波触发概率（Lv1~10 / Lv11~20 / Lv21~30 档）
  const POEM_TIERS = ['虚象级', '具象级', '真我级', '诗篇级'];
  function poemStageIdx(lv) { return lv < 11 ? 0 : lv < 21 ? 1 : 2; }

  // 通用：限 tier（null = 全部）/ 限定位 / 限阶段列的波次卡加权抽取（0 = 不刷出；prob 卡排除；不触 DW_LAST 恢复期）
  function pickWaveCardByRole(tier, roles, stage) {
    let total = 0;
    const pool = [];
    for (const w of WAVE_SPAWN_LIST) {
      if (tier && w.tier !== tier) continue;
      if (!roles.includes(w.role)) continue;
      if (w.prob) continue;
      const base = ((WAVE_SPAWN_DRAW_W[w.id] || [])[stage] || 0);
      if (base <= 0) continue;
      pool.push({ w, wt: base });
      total += base;
    }
    if (!pool.length) return null;
    let r = Math.random() * total;
    for (const it of pool) {
      r -= it.wt;
      if (r <= 0) return it.w;
    }
    return pool[pool.length - 1].w;
  }

  // ①侧翼波次额外生成抽取：返回波次卡或 null（本波不触发 / 所选 tier 侧翼池为空）
  function pickPoemFlankCard(lv) {
    const s = poemStageIdx(lv);
    if (Math.random() >= POEM_FLANK_EXTRA.chance[s]) return null;
    const tw = POEM_FLANK_EXTRA.tierW[s];
    let total = 0;
    for (const w of tw) total += w;
    let r = Math.random() * total;
    let tier = POEM_TIERS[POEM_TIERS.length - 1];
    for (let i = 0; i < POEM_TIERS.length; i++) {
      r -= tw[i];
      if (r <= 0) { tier = POEM_TIERS[i]; break; }
    }
    return pickWaveCardByRole(tier, ['侧翼'], s);
  }

  // ②额外波次抽取：返回波次卡或 null
  function pickPoemExtraCard(lv) {
    const s = poemStageIdx(lv);
    if (Math.random() >= POEM_EXTRA_CHANCE[s]) return null;
    return pickWaveCardByRole(null, ['特殊'], s);
  }

  // ③真额外三项抽取：返回波次卡或 null（表内概率逐项独立掷，单/双导弹互斥）
  function pickPoemTrueExtra(lv) {
    const s = poemStageIdx(lv);
    const p1 = ((WAVE_SPAWN_DRAW_W['h*1'] || [])[s]) || 0;
    const p2 = ((WAVE_SPAWN_DRAW_W['h*2'] || [])[s]) || 0;
    const pr = ((WAVE_SPAWN_DRAW_W['2R'] || [])[s]) || 0;
    if (p1 > 0 && Math.random() < p1) return WAVE_SPAWN_LIST.find(w => w.id === 'h*1');
    if (p2 > 0 && Math.random() < p2) return WAVE_SPAWN_LIST.find(w => w.id === 'h*2');
    if (pr > 0 && Math.random() < pr) return WAVE_SPAWN_LIST.find(w => w.id === '2R');
    return null;
  }

  export {
    CRYSTAL_TIERS, CRYSTAL_GIANT_CHANCE, rollCrystalGiant, CRYSTAL_COLORS,
    CRYSTAL_COLORS_NORMAL, CRYSTAL_GIANT_COLORS, convertCrystalDrop, CHAOS_SMALL_DMG_MUL,
    PIERCE_WEAKEN_MUL, SPAWN_PHASE_TIMES, SPAWN_PHASE_LEVEL, REWARD_DRONES,
    rewardDroneChance, pickRewardDroneType, ELITE_REVIVE, PRESSURE_W,
    PRESSURE_CAPACITY, SPAWN_SLOW_MUL, SPAWN_RUSH, SPAWN_RUSH_CAP,
    REWARD_ITEMS, DROP_KIT_RATE, DROP_SHIELD_RATE, DROP_SHIELD_STACK,
    DROP_HP_BY_CLASS, DROP_HP_PROLIFERA, DROP_HP_CYAN, DROP_HP_GREEN,
    DROP_HP_ELITE, DROP_HP_BOSS, DROP_HP_BOSS2, DROP_BOMB_ORANGE, DROP_KIT_BERSERK,
    WAVE_SPAWN_W_DEFAULT, WAVE_SPAWN_W, WAVE_SPAWN_LIST, WAVE_SPAWN_DRAW_W,
    resetDesignedWaveState, pickDesignedWaveCard, pickPoemFlankCard, pickPoemExtraCard, pickPoemTrueExtra,
  };
