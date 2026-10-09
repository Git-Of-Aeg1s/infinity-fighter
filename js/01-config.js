// 01-config（拆分过渡壳）：《并行开发改造设计.md》批次 1c 逐域迁出后的剩余域；批次 1d 删除本壳（暂保留【临时】构建标记行）






  console.log('[InfinityFighter] JS build: 20260925-v035-1');   // 【临时】构建标记：验证浏览器缓存是否已刷新，确认后删除




  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：02-achievements(4 名) 04-spawn(2 名) 06-enemy(23 名) 07-player(1 名) 08-entities(2 名) 09-draw-ships(2 名) 13-encyclopedia(3 名) 14-main(10 名)

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
  const CHAOS_SMALL_DMG_MUL = 1.8;   // 混乱将至主炮弹（mainShot）：对非 BOSS / 非 4S（四精英）敌人伤害 +80%（结算见 08-entities）
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
    SPAWN_PHASE_TIMES, SPAWN_PHASE_LEVEL, ELITE_REVIVE, REWARD_DRONES,
    rewardDroneChance, pickRewardDroneType, PRESSURE_W, PRESSURE_CAPACITY,
    SPAWN_SLOW_MUL, SPAWN_RUSH, SPAWN_RUSH_CAP, REWARD_ITEMS,
    CHAOS_SMALL_DMG_MUL, PIERCE_WEAKEN_MUL, DROP_KIT_RATE, DROP_KIT_RED,
    DROP_KIT_PURPLE, DROP_KIT_YELLOW, DROP_SHIELD_RATE, DROP_SHIELD_BLUE,
    DROP_SHIELD_STACK, DROP_HP_BY_CLASS, DROP_HP_PROLIFERA, DROP_HP_CYAN,
    DROP_HP_GREEN, DROP_HP_BOSS, DROP_HP_BOSS2, DROP_BOMB_ORANGE,
    DROP_KIT_BERSERK, ACHIEVEMENTS, ACHIEVEMENT_TIERS, ACHIEVEMENT_TIER_ORDER,
    ACHIEVEMENT_INFINITY_ENABLED, CRYSTAL_TIERS, CRYSTAL_GIANT_CHANCE, CRYSTAL_COLORS,
    CRYSTAL_COLORS_NORMAL, CRYSTAL_GIANT_COLORS, convertCrystalDrop, rollCrystalGiant,
  };
