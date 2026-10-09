// 01-config-loadout：玩家装备四件套（战机/装甲/驾驶员/僚机）+ 武器等级与爆弹参数（《并行开发改造设计.md》批次 1c 自 01-config.js 拆出）

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：01-config-difficulty(1 名) 01-config-spawn(1 名) 02-achievements(8 名) 02-core(3 名) 04-spawn(2 名) 05-boss(3 名) 06-enemy(6 名) 07-player(25 名) 08-entities(8 名) 09a-draw-loadout(6 名) 10-draw-world(3 名) 12-ui(26 名) 13-encyclopedia(13 名) 14-main(5 名)
  // 配置域群（01x）内部单向依赖：加载序见 index.html（core→loadout→enemies→boss→difficulty→spawn→achievements），对外只出不进

  import { CANVAS_H, dogMissileSvg, flameRingSvg, higanbanaSvg, polarStarSvg, swordSvg } from './01-config-core.js';



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

  // 火力 5 级：直射窄弹道，射线数递增；Lv4 为 5 射线 + 半拍后于中间补射 2 发（视觉错开，不增宽）
  // Lv5 即暴走：限时 4s（2026-10-10 用户定稿），攻速/弹速 +50%（interval 0.08 / 弹速 ×2.4），十射线（5 个位置各双发）、伤害 ×2.4
  // dmgMul：每发子弹伤害倍率（乘 PLAYER_CFG.bulletDamage）。按各档目标 DPS 反推配平——
  //   攻击间隔 / 弹幕构成保持节奏不变，靠“单发更重”补足 DPS：主炮 DPS ≈ Lv1 420 / Lv2 560 / Lv3 720 / Lv4 960 / Lv5 3000（2026-10-10 射速 +50% 由 2400 上调）。
  //   （2026-10-02 用户定稿：主炮取消穿透，DPS 上调 + 小怪特化增伤补偿，见 CHAOS_SMALL_DMG_MUL）
  const WEAPON_LEVELS = [
    null,
    { name: 'Lv1', interval: 0.24, dmgMul: 2.8 },      // 3 射线，射速稍慢；单发 33.6
    { name: 'Lv2', interval: 0.19, dmgMul: 2.2167 },   // 4 射线；单发 ≈26.60
    { name: 'Lv3', interval: 0.14, dmgMul: 1.68 },     // 5 射线，射速正常；单发 20.16
    { name: 'Lv4', interval: 0.12, dmgMul: 1.3714 },   // 5 射线 + 半拍补射 2 发；单发 ≈16.46
    { name: 'Lv5', interval: 0.12 },                   // 暴走：限时 4s，实际射速走 BERSERK.interval（0.08），弹速提升，伤害走 BERSERK.dmgMul
  ];
  // 2026-10-10 用户定稿：时长 6s→4s；射速 +50%（interval 0.12→0.08）；弹速 +50%（spdMul 1.6→2.4）；
  // 可与斗志昂扬叠加（昂扬 ×2 攻速/弹速照常作用：主炮冷却 tick 见 07-player，在飞弹速见 08-entities）
  // subRateMul / subSpdMul：暴走全局修正（2026-10-10 用户定稿）——僚机与副武器在各自 Lv5 配置之上
  //   射速 +50%（interval ÷subRateMul）、弹速 +50%（×subSpdMul）；
  // subDmgMul：辛国栋之怒 / 群星之杀（斩击）改走伤害 +50%，射速与弹速不再增加
  const BERSERK = { interval: 0.08, dmgMul: 2.4, rMul: 1.4, duration: 4, spdMul: 2.4, subRateMul: 1.5, subSpdMul: 1.5, subDmgMul: 1.5 };
  const SHIELD_DURATION = 6;   // 量子护盾持续时间

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
      starsSeries: true,   // 群星系列装备（三件套之一，见 starsSeriesCount）
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
    watch:    { id: 'watch', name: '群星守望', glyph: '◈', color: '#7ce7ff', starsSeries: true,   // 群星系列装备（三件套之一，见 starsSeriesCount）
      default: true,   // 默认装甲（图鉴「护甲」页据此标注"（默认）"；默认项经 currentArmor 初始化）
      clearChance: { 1: 0.05, 2: 0.08, 3: 0.15, 4: 0.50 },
      clearChanceBoss: { 1: 0.40, 2: 0.40, 3: 0.40, 4: 0.40 },   // BOSS 战期间的概率表，且改为清除该敌人发出的全部在场射弹
      brief: '击毁敌机时概率消除弹幕',
      desc: '击杀 1/2/3/4 类敌人时<br>5%/8%/15%/50% 立刻清除<br>一颗离自身最近的敌方子弹<br>BOSS 战期间：统一 40%，<br>且改为清除该敌人发出的全部在场射弹<br>真我以下难度：清除概率 ×1.5（上限 100%）<hr>群星系列套装（≥3 件：<br>群星之杀 / 群星守望 / 群星允诺）：<br>暴走状态击坠敌机时立刻清除<br>该敌机残留在场的所有弹幕<br>（含法术大师的激光；铁砧导弹 /<br>暴鸰·虚幻炸弹等范围伤害体<br>与寒冷区域不受影响）' },
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

  // 群星系列套装计数（2026-10-10 用户定稿）：当前装备中带 starsSeries 标记的件数——
  // 现役三件 = 机体群星之杀 / 装甲群星守望 / 僚机群星允诺；计数 ≥3（即全套齐备）时
  // 群星守望获得「暴走击坠清弹」额外效果（触发点见 06-enemy killEnemy）
  function starsSeriesCount() {
    return [currentPlane, currentArmor, currentPilotMain, currentPilotSub, currentWingman, currentSubWeapon]
      .filter(x => x && x.starsSeries).length;
  }

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
      5: { interval: 0.90, dmg: 660, slashR: 64, slashes: 3, halfLen: 144, halfW: 43 },   // 3×660/0.90 = 2200（判定显式给定）；暴走全局：伤害+50%（990/击）→ 3300，连斩节奏不变
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
      starsSeries: true,   // 群星系列装备（三件套之一，见 starsSeriesCount）
      desc: '多发散射，火力覆盖',
      barTail: '#ffbf47', barMid: '#ffd9a0', barHead: '#8a6bff',   // 尾橙黄 → 头蓝紫
      flame: '#9b7bff',
      // dmgMulByLevel：群星允诺每级每发伤害倍率。Lv5 暴走额外 ×2（公式内置），此处 lvMul 控制基础伤害。
      //   双僚机合计 DPS = Lv1 140 / Lv2 170 / Lv3 200 / Lv4 230 / Lv5 550（Lv5 另有暴走全局射速 +50% 修正 → 实际 825）。
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
      //   双僚机合计 DPS = Lv1 160 / Lv2 200 / Lv3 240 / Lv4 300 / Lv5 444（弹幕扩容后单发伤害按比例重配平，DPS 不变；Lv5 另有暴走全局射速 +50% 修正 → 实际 666）
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
          5: { count: 10, interval: 0.60, dmg: 26.667, speedMul: 2.5, flame: true, flameMul: 1 },   // 暴走：与 Lv4 同为 10 发（不再 +1 发）、弹速×2.5、尾焰最强(1.0)、间隔同 Lv4；全局：射速+50%（实际 0.40）、弹速再+50%
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
          5: { count: 4, interval: 0.5, dmg: 55 },   // 暴走：4 条激光（2 常规 ±16 + 2 外移 ±32）；全局：射速+50%（实际 0.33）、弹速+50% → DPS 660
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
          5: { interval: 1.3, dps: 460 },   // 暴走全局：射速+50%（实际 0.87）、弹速+50% → DPS 690
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
          5: { count: 9, interval: 1.2, dmg: 74.7, pierceChance: 0.5 },   // 暴走：射速/伤害大增 + 50% 穿透一次；全局：射速+50%（实际 0.8）、弹速×1.4×1.5=×2.1 → DPS 840
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
          5: { interval: 2.25, dps: 520, r: 80 },   // 暴走：大幅强化；全局：灼烧伤害+50%（实际 780），射速 / 弹速 / 半径不变
        },
      },
    },
  };
  let currentSubWeapon = SUB_WEAPONS.daodan;   // 当前副武器配置（默认捣蛋来袭，用户 2026-10-02 指定；写操作经 setSubWeapon，同 currentArmor/currentWingman 约定）
  function setSubWeapon(w) { currentSubWeapon = w; }

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
      // 击杀计数条（左下角可见）：counterMax 上限；killGain 击杀 1/2/3/4/5 类敌人的计数增量（5 类 = BOSS，
      // 2026-10-10 用户定稿：击杀 BOSS 不再加计数）；
      // bossKillMul BOSS 战期间击杀计数倍率；eliteKillMul 击败黑暗之手四精英的倍率（替换 BOSS 战 ×2）；
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
      counterMax: 122, killGain: { 1: 1, 2: 3, 3: 6, 4: 18, 5: 0 },   // 3/4 类 6/18、5 类 BOSS 归零（2026-10-10 用户定稿）
      bossKillMul: 2, eliteKillMul: 3, elites: ['puxuefeng', 'hanxixian', 'xiayong', 'xinguodong'],   // BOSS 战击杀 ×2 / 四精英 ×3（2026-10-10 用户定稿，原 ×3/×4+30 废止）
      bossTickGain: 3,
      scytheR: 250, scytheGripR: 34, scytheDur: 0.55, scytheWidth: 220, scytheStart: Math.PI,
      scytheTilt: 0.75,
      scytheWind: 0.3, scytheWindAng: 0.35,
      scytheBaseDmg: 1500, scytheHpPct: 0.2, scytheHpPctCap: 2500,
      brief: '击杀积攒计数，满时召唤镰刀斩击一圈',
      desc: '缎带与镰刀的看板娘。左下角计数条：击杀敌人增加计数<br>（上限 <b>122</b>）——击杀 <b>1/2/3/4</b> 类敌人<br>分别增加 <b>1/3/6/18</b> 点（BOSS 不计数）；<br>BOSS 战期间击杀计数 <b>×2</b>，<br>击败朴学峰、夏勇、韩希先、辛国栋时改为 <b>×3</b>；<br>BOSS 战期间每秒额外 <b>+3</b> 计数<br>充满后自动召唤镰刀<b>快速斩击一圈</b>：<br>刀柄贴着机体、刀刃扫至 <b>250px</b> 外圈，<br>被扫中的敌人受 <b>1500 + 20% 最大生命</b> 伤害<br>（20% 生命部分最多 2500，各受击一次），<br>被扫中的敌方子弹一并摧毁，<br>并可斩碎<b>虚化护盾</b>与敌方<b>金环</b>',
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
      brief: '无限重生',
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
    5: { volleys: [5, 5], spread: 8, interval: 0.34, flameMul: 1 },       // 暴走：5+5 发、发光，伤害走 ×2；尾焰最强(1.0)；全局：射速+50%（实际 0.23）
  };

  // 僚机单轮弹幕夹角(度)按“该轮发数”取值：2发20° / 3发10° / 4发6° / 5发8°（发数越多相邻夹角越小、弹幕更聚拢）
  // 2发相邻 20°：与 3 发（相邻 10° × 2 间隔 = 总夹角 20°）的最远两颗夹角相当；Lv1 两轮与 Lv2 第二轮（同为 2 发）自动同步受影响
  const WINGMAN_SPREAD = { 2: 20, 3: 10, 4: 6, 5: 8 };
  const MAX_BOMBS = 3;             // 高能爆弹基准上限（真我经 mods.bombCap 降为 2；右上角以图标数量展示）
  const BOMB_DAMAGE_BASE = 4000;   // 高能爆弹基础伤害（真实伤害：无视御4防御光环等一切减伤）
  const BOMB_DAMAGE_RATIO = 0.10;  // + 目标最大血量的 10%
  const WEAPON_DROP_HITS = 3;         // 统一：累计受击 3 次掉 1 级火力（全场景同规则；导弹命中不计入）

  export {
    PLAYER_CFG, WEAPON_LEVELS, BERSERK, SHIELD_DURATION,
    PLANES, currentPlane, setPlane, setWingman,
    ARMORS, currentArmor, setArmor, armorMaxHp, starsSeriesCount,
    ARMOR_SKILLS, STARSLAYER, WINGMEN_CFG, currentWingman,
    WINGMAN, SUB_WEAPONS, currentSubWeapon, setSubWeapon,
    PILOTS, currentPilotMain, currentPilotSub, setPilotMain,
    setPilotSub, hasPilot, pilotEntry, pilotBombDmgMul,
    pilotBombStartAdd, dagouWaveIv, specialGearActive, PRINCE_STORM,
    BULWARK, WINGMAN_LEVELS, WINGMAN_SPREAD, MAX_BOMBS,
    BOMB_DAMAGE_BASE, BOMB_DAMAGE_RATIO, WEAPON_DROP_HITS,
  };
