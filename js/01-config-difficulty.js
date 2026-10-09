// 01-config-difficulty：难度系统（虚象/具象/真我/诗篇）+ 诗篇血量表 + BOSS/精英血量取值入口（《并行开发改造设计.md》批次 1c 自 01-config.js 拆出）

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：01-config-spawn(1 名) 02-achievements(2 名) 02-core(2 名) 04-spawn(9 名) 05-boss(7 名) 06-enemy(11 名) 07-player(4 名) 08-entities(7 名) 10-draw-world(3 名) 12-ui(4 名) 13-encyclopedia(8 名) 14-main(4 名)
  // 配置域群（01x）内部单向依赖：加载序见 index.html（core→loadout→enemies→boss→difficulty→spawn→achievements），对外只出不进

  import { xiayongImg } from './01-config-core.js';
  import { currentArmor } from './01-config-loadout.js';
  import { ELITES, ZHANGZHANG } from './01-config-enemies.js';


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

  // ---------- 加血套件等级窗口节流（2026-10-10 用户定稿，全难度） ----------
  // 虚象/具象/真我/诗篇下每 lv2/3/4/4 最多掉落 1 个加血套件（普通敌人掉落）：某级实际掉落后，
  // 窗口内后续等级不再掉落。不跨 BOSS 轮——清场/警报/BOSS 战（bossFlow.stage !== 'none'）期间的
  // 掉落与 BOSS 脚本化加血豁免（不判定也不登记），跨轮自然失效；判定与登记点在 06-enemy rollItemDrops
  //（state.hpKitLastLv / hpKitLastPhase 归域声明于 02-core）。真我 8s 节流（hpKitGap）与诗篇
  // 波次节流（WAVE_POEM.healWaveGap）叠加生效、互不替代。登记处：《诗篇难度修正.md》表 #34
  const HP_KIT_LV_WINDOW = { illusion: 2, form: 3, realme: 4, poem: 4 };
  // 当前难度加血窗口（未配置的难度/挑战分支回退 Infinity = 不限制）
  function hpKitLvWindow() {
    const w = HP_KIT_LV_WINDOW[currentDifficulty.id];
    return w != null ? w : Infinity;
  }
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
    fashiA2: 2400, fashiArray: 7000, warGhost: 7000, pulseMatrix: 4000,
    warMatrix: 10000,
    tornado: 4800,   // 大型龙卷（暴风之眼技能2 召唤物）：基准 3600 不覆写其余难度，诗篇 4800（2026-10-10 用户定稿）
  };
  // 诗篇血量取值入口：key 优先 变体 → 行为 → 类型
  function poemHpOf(type, variantId, behavior) {
    if (variantId) { const k = type + '_' + variantId; if (POEM_HP[k] != null) return POEM_HP[k]; }
    if (behavior)   { const k = type + '_' + behavior;  if (POEM_HP[k] != null) return POEM_HP[k]; }
    return POEM_HP[type];
  }

  // 4S 精英血量取值入口：按当前难度读机型级 hpByDiff（2026-10-04 用户定稿：四精英独立四难度血量，
  // 取代原「黑暗之手血量 × 继承比」派生；张华&张策同口径）。生成（04-spawn spawnEliteMinion）与
  // 图鉴展示（13-encyclopedia showEncyDetail）统一走此函数——单一真相源
  function eliteHpOf(type) {
    const h = (ELITES[type] || ZHANGZHANG).hpByDiff;
    if (!h) return null;
    return h[currentDifficulty.id] != null ? h[currentDifficulty.id] : h.form;   // 未配置难度回退具象基准
  }

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

  // 测试模式（图鉴挑战）：敌方不再无敌 —— 非 BOSS 单位统一血量 20000（BOSS 保持注册表血量）；
  // 持续刷怪测试（swarm）除外——按注册表正常血量（2026-10-01）
  const TEST_HP = 20000;              // 1~4 类全部敌机（含大型龙卷 / 法术矩阵等召唤物）

  export {
    DIFFICULTIES, currentDifficulty, WAVE_POEM, setDifficulty,
    diffMods, resolveBossHp, isIllusion, isRealme,
    isPoem, isHardTier, invulnDiffMul, bossDmgMul,
    enemyDmgMul, strikerHoldMul, strikerNoHoldSpdMul, POEM_HP,
    poemHpOf, eliteHpOf, xiayongHornDmgMul, xiayongBarAbsorb,
    hpKitLvWindow,
    TEST_HP,
  };
