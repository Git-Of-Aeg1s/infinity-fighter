// 13-encyclopedia：怪物图鉴数据 / UI / 形态预览绘制

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：12-ui(1 名) 14-main(1 名)
  //
  import { ARMORS, BERSERK, BOSS, BULWARK, CANVAS_H, CANVAS_W, DIFFICULTIES, DOUZHI, ENEMY_TYPES, FASHI_A1, FASHI_ARRAY, FASHI_MATRIX, HARBINGER, PILOTS, PLANES, PLAYER_CFG, POPIAN, STARSLAYER, STORM, STORM2, SUB_WEAPONS, VARIANTS, WAVE_POEM, WEAPON_LEVELS, WINGMAN, WINGMAN_LEVELS, WINGMEN_CFG, currentDifficulty, currentPlane, diffMods, resolveBossHp, setDifficulty } from './01-config.js';
  import { DPR, canvas, clamp, ctx, diffGrid, encyDetail, encyDiffGroup, encyList, encyTabs, encyclopedia, infoBody, infoClose, infoEntryBtn, infoModal, infoTabs, overlay, setCtx, state } from './02-core.js';
  import { SPECIAL3_POOL, WAVE_FORMATIONS, sideSpawnWeights, special3Weight, spawnDiagonalRaid, spawnGunshipWings, spawnMirrorRow, spawnSideColumn, spawnSideGroup, spawnSideKamikazeStream, spawnSideSweep, spawnStrikerGroup, spawnStrikerVee, strikerVariantWeights } from './04-spawn.js';
  import { WEAPON_LINES } from './07-player.js';
  import { crystal3DStarDraw, getCrystal3DSprite, paintShip, paintWingman, paintWingmanBulwark } from './09-draw-ships.js';
  import { drawEnemy } from './10-draw-world.js';
  import { drawBoss } from './11-draw-boss.js';
  import { resetGame } from './12-ui.js';
  import { renderInfoAchievements } from './02-achievements.js';



  // ---------- 怪物图鉴 ----------
  const ENCY_GRADES = [
    { name: '虚象级', entries: ['side_pass', 'side_shoot', 'side_kamikaze', 'side_moon', 'prolifera'] },
    { name: '具象级', entries: ['striker_crimson', 'striker_amber', 'striker_azure', 'striker_violet', 'striker_white', 'striker_dusk', 'douzhi', 'fashiA1', 'popian', 'fashiMatrix'] },
    { name: '真我级', entries: ['gunship_violet', 'gunship_crimson', 'gunship_amber', 'gunship_orange', 'gunship_cyan', 'harbinger', 'weilong', 'hanshuang', 'yu4', 'anvil', 'baoling', 'jiaoxiang', 'fashiA2'] },
    { name: '诗篇级', entries: ['capital_crimson', 'capital_azure', 'capital_crgold', 'fashiArray'] },

    { name: '长歌级', entries: ['boss', 'boss_storm', 'boss_storm2'] },

    // 衍生级（escort / tornado）不设标签页：无法从分页列表直接点击，仅经母体条目 desc 内的名称跳转进入
    // （跳转时不选中任何标签，见 jumpToEncyEntry；反向跳转见条目 parent 字段）
  ];
  
  // 每种颜色变体独立成条目；type 用于绘制/生成，variant/behavior 用于强制指定变体/行为
  // BOSS 条目的 bossId → 01-config 血量注册表（resolveBossHp 按当前难度解析 hpByDiff）
  const BOSS_HP_SRC = { song: BOSS, storm: STORM, storm2: STORM2 };
  const ENCY_DATA = {
    side_pass: {
      name: '白影侧翼艇', type: 'side', behavior: 'pass', color: '#f0f0f5', hp: 10, score: 50,
      desc: '从侧上方斜插穿越战场，血量极低、一碰即碎。<b>无攻击</b>。1类编队权重 <b>70</b>（约 61%；Lv11 起 60）。',
    },
    side_shoot: {
      name: '黄芒侧翼艇', type: 'side', behavior: 'shoot', color: '#ffd166', hp: 10, score: 50,
      desc: '从侧上方斜插穿越战场。<b>整场仅攻击一次</b>：入场 <b>1.2~2.8s</b> 后追踪玩家方向射出一发子弹（弹速 230、伤害 6）。1类编队权重 <b>15</b>（约 13%；Lv11 起 20）。',
    },
    side_kamikaze: {
      name: '紫电侧翼艇', type: 'side', behavior: 'kamikaze', color: '#c084fc', hp: 10, score: 80,
      desc: '从侧上方斜插穿越战场。<b>亡语：阵亡时向下垂直射出一发子弹</b>（弹速 ×1.1）。1类编队权重 <b>5</b>（约 4.3%；Lv11 起 10）。',
    },
    side_moon: {
      name: '赤月侧翼艇', type: 'side', behavior: 'moon', color: '#ff3b30', hp: 10, score: 50,
      desc: '从侧上方斜插穿越战场。入场 <b>1~2.5s</b> 后的随机时刻朝航向正前方发射一枚子弹（仅此一次，弹速 230、伤害 6）；<b>到死未发射则有 12% 概率在阵亡时补射</b>。1类编队权重 <b>20</b>（约 17.4%；Lv11 起 25）；掉落按红色标记结算（升级套件 ×1.5）。',
    },
    prolifera: {
      name: '增生侧翼艇', type: 'prolifera', color: '#7fe8c9', hp: 10, score: 50,
      // 衍生体（卫护飞船）为独立隐藏条目（不设标签页）：desc 内名称可点击跳转（互链见 escort.parent）
      desc: '从侧上方斜插穿越战场，<b>无攻击</b>。<b>击毁后分裂出 0~3 个<span class="ency-link" data-ency="escort">卫护飞船</span></b>沿原航向漂移；<b>加血套件掉率固定 10%</b>。1类编队权重 <b>5</b>（约 4.3%；Lv11 起 10）。',
    },
    striker_crimson: {
      name: '赤红突击艇', type: 'striker', variant: 'crimson', color: '#ff3b30', hp: 56, score: 130,
      desc: '上方入场，在前锋停留线短暂停顿后向下冲锋。<b>垂直直射</b>（±10° 偏差、不追踪），首次开火额外延迟 1s。出现概率：<b>约 23%</b>。',
    },
    striker_amber: {
      name: '烈橙突击艇', type: 'striker', variant: 'amber', color: '#ff8a5c', hp: 56, score: 130,
      desc: '上方入场，在前锋停留线短暂停顿后向下冲锋。<b>朝前方对称射两发</b>，夹角在 <b>40°/50°/60° 间随机</b>（不追踪）。出现概率：<b>约 23%</b>。',
    },
    striker_azure: {
      name: '幽蓝突击艇', type: 'striker', variant: 'azure', color: '#4d9fff', hp: 56, score: 130,
      desc: '上方入场，在前锋停留线短暂停顿后向下冲锋。<b>发射追踪玩家的子弹</b>，首次开火额外延迟 1s。登场 <b>10% 概率 1s / 10% 概率 2s 虚化护盾</b>（虚化期间不受伤害、我方炮弹穿过）。出现概率：<b>约 19%</b>（与紫晶相同）。',
    },
    striker_violet: {
      name: '紫晶突击艇', type: 'striker', variant: 'violet', color: '#c084fc', hp: 56, score: 130,
      desc: '上方入场，在前锋停留线短暂停顿后向下冲锋。<b>发射一枚精确追踪玩家的子弹</b>（紫=追踪定位）。<b>攻击间隔较幽蓝 +0.3s</b>、首攻不额外延长、无虚化护盾。出现概率：<b>约 19%</b>（与幽蓝相同）。',
    },
    striker_white: {
      name: '霜白突击艇', type: 'striker', variant: 'white', color: '#eaf1f8', hp: 56, score: 130,
      desc: '上方入场，在前锋停留线<b>停留 2s</b> 后向下冲锋，<b>完全不开火</b>，以机身撞击玩家。出现概率：<b>约 15%</b>。',
    },
    striker_dusk: {
      name: '幽暮突击艇', type: 'striker', variant: 'dusk', color: '#8f97ab', hp: 64, score: 130,
      desc: '在场地 30%~80% 高度的随机位置上方<b>渐显浮现</b>，下移停驻 <b>0.2s</b>（白环从核心掠过机体至边缘消失作预警），<b>白环散尽的同时</b>以随机方向为基准向四周<b>正六边形或正八边形（随机）</b>的均匀方向各射 1 发，随即下移同距<b>渐隐离场</b>（浮现到开火全程约 <b>2s</b>）。<b>无法碰撞</b>：与玩家互相穿过、不受撞机反伤。<b>80% 掉落 6~10 个水晶</b>。出现概率：Lv11 前 <b>约 1.9%</b>（权重 2/107）、Lv11 起 <b>12.5%</b>（权重 5/40）。',
    },
    gunship_violet: {
      name: '紫晶炮艇', type: 'gunship', variant: 'violet', color: '#c084fc', hp: 400, score: 350,
      desc: '技能循环：<b>两轮 6 发环形爆发</b>（随机方向、顺序随机，两轮间隔 ≈0.35s）→ <b>三发平行贴弹</b>（同时射出、同向平行、间距 17.6，中间弹出射点更靠前）→ <b>锁定侧扫</b>（向玩家方位左/右一侧 60° 区间依次均分 4 发<b>加速长条弹</b>，诗篇 5 发）。',
    },
    gunship_crimson: {
      name: '赤红炮艇', type: 'gunship', variant: 'crimson', color: '#ff5a5a', hp: 400, score: 350,
      desc: '火力最猛的炮艇。技能循环：<b>瞄准双连射 + 左右双曲线弹流</b>（同时发射：中间弹固定垂直向下不追踪，双曲线向两侧外扩）→ <b>反向双曲线弹流</b>（每侧 5 发，镜像对在<b>随机屏高 50%~100%</b> 处交汇）→ <b>三方向两轮齐射</b>（垂直向下与下±20°，每方向 2 发 ×2 轮、轮间隔 0.75s）。',
    },
    gunship_amber: {
      name: '金曜炮艇', type: 'gunship', variant: 'amber', color: '#ffbf47', hp: 420, score: 350,
      desc: '技能循环：<b>10 发环形爆发</b>（诗篇 12 发，加速长条弹）→ <b>双向 22222 加速长条弹</b>（360° 随机方向及其反方向各 10 发、前后 5 波每波 2 发，两发垂直错位不重叠；自机体核心快照点射出，后发不随机体移动漂移）→ <b>三方向 3×3 加速长条弹</b>（首轮竖直朝上或朝下随机、后续两轮依次旋转 60°，每发两发连射，出弹点以施放瞬间为准快照）。',
    },
    gunship_orange: {
      name: '橙焰炮艇', type: 'gunship', variant: 'orange', color: '#ff7e2e', hp: 400, score: 350,
      desc: '炽橙涂装重型炮艇。技能循环：<b>红橙巨型弹</b>（飞行 25% 屏高后减速滑行、临近停速时分裂 6 发均匀散射）→ <b>下方 150° 均匀 6 发</b> → <b>双轮 2×2 加速长条弹</b>（夹角 40°→60°，出弹点以施放瞬间为准快照）→ <b>下方 120° 均匀 4 发</b>。',
    },
    gunship_cyan: {
      name: '青时炮艇', type: 'gunship', variant: 'cyan', color: '#45e0e8', hp: 400, score: 350,
      desc: '青色涂装援护炮艇。技能循环：<b>两翼召唤增生侧翼艇</b>（先朝两侧再转向下飞；诗篇两波 4 个；召唤体与卫护飞船无奖励，召唤体带<b>次数盾</b>——常态 1 层、诗篇 2 层，单次伤害抵御一次，群星允诺暴走弹无视）→ <b>双发支援弹</b>（随机方向：命中敌机加 200 屏障、命中玩家机身加 24/诗篇 28 屏障，持续 10s 可刷新）→ <b>DNA 双螺旋四连弹</b>（朝玩家 2×2，全部自机头出膛；左右两束相位相反的加速蛇行弹持续交绕成双螺旋，摆幅 0.385 rad）。',
    },
    harbinger: {
      name: '炮火先兆者', type: 'harbinger', color: '#3a3f4a', hp: 1000, score: 550,
      lore: '炮舰术师操作的无人战舰，装甲厚重，材质坚实。正是他们引导了炮舰猛烈的导弹袭击。',
      desc: '较慢入场，悬停于后排。<b>不直接开火</b>：核心充能 <b>3s</b> 后召唤垂直落下的导弹（<b>最多导引 4 次</b>），随后循环；就位约 <b>18s</b> 后停火开走。<br />导弹命中：<b>max(60, 当前血量 80%)</b> 伤害——低血保底 60、不直接秒杀，且<b>武器等级 -1</b>（不计入常规受击计数）。护甲对<b>僚机弹幕减伤 25%</b>，碰撞 12.5。',
    },
    weilong: {
      name: '威龙', type: 'weilong', color: '#ff9a1a', hp: 5000, score: 1100,
      lore: '敌方人员操纵的无人战舰，某太空游戏的粉丝制作的外观，因此被称为威龙。装备有高射速的速射铳和远程操控施术单元，可能是由术师远程操作。优秀的攻击性能让其会对战机构成较大威胁。',
      desc: '从偏左/偏右半场出场，沿<b>蛇形路径</b>巡航（下降与横向靠边交替，途中停顿 2s 后向下离场），方向随出场侧镜像；<b>入场拥有 260% 移速</b>（1s 内线性衰减回常规）。炮口以<b>有限角速度（3.2 rad/s，同破片）平滑追踪</b>玩家，每隔一段时间沿炮口当前指向射 <b>5 枚无偏转快弹</b>——<b>攻击时停止移动、炮口锁死不再转向</b>。<b>血量 &lt;60% 后不计入场面压力</b>（≥60% 时拖慢敌方刷新）。<b>Lv11 起作为特殊 3 类槽位出场</b>。',
    },
    hanshuang: {
      name: '寒霜', type: 'hanshuang', color: '#8fd8ff', hp: 700, score: 500,
      lore: '敌方人员操纵的无人战舰，配备了额外护甲以致较难被击毁，其最初的原型由一个图像引擎工作室设计。能通过特殊的装置造成周围温度急剧下降，在此范围内我方战舰的攻速和移速会大幅度削减。',
      desc: '<b>不攻击</b>：<b>50% 概率顶部入场</b>（初速 +100%、1s 内衰减完毕）/<b>50% 概率从侧翼 25%~50% 高度入场</b>（斜向下飞向同半场落点、入场移速 -30%，左翼不越中线、右翼同理），到达 <b>72%~82%</b> 随机高度停留 <b>20s</b> 后离场。<b>入场未减速阶段判定箱略缩、受伤 -20%</b>。登场 1s 后展开<b>大范围冰蓝寒霜光圈</b>：圈内我方战机<b>顶部入场射速/移速 -35%、侧翼入场 -25%</b>（以核心位置判定）。<b>出厂随机携带虚化护盾</b>：顶部 30% 概率 1.5s / 20% 概率 2s / 10% 概率 2.5s / 5% 概率 5s；侧翼 35% 概率 1.5s / 20% 概率 2s / 10% 概率 2.5s（无 5s 档）。<b>Lv11 起作为特殊 3 类槽位出场</b>。优先击毁或撤离其光圈再输出。',
    },
    yu4: {
      name: '御4', type: 'yu4', color: '#d6c078', hp: 700, score: 500,
      lore: '敌方人员操纵的无人战舰，型号标记为御4。虽然本身不具有攻击能力，却能对敌方战舰进行支援，需要注意。',
      desc: '<b>不攻击</b>：登场 <b>0.5s</b> 后展开<b>金色六边力场</b>，力场内<b>所有敌人受到的非真实伤害降低 30%</b>（<b>高能爆弹为真实伤害</b>，无视力场）。下降较慢，停留 <b>25s</b> 后离场；碰撞 15。<b>Lv11 前不出场</b>。优先击毁以免其庇护友军。',
    },
    anvil: {
      name: '铁砧', type: 'anvil', color: '#8ce36b', hp: 500, score: 500,
      lore: '敌方的防御型空援无人战舰，将使范围内敌方单位的生命值缓慢恢复。',
      desc: '<b>不攻击</b>：登场 <b>0.5s</b> 后展开<b>正方形治疗光环</b>，光环内<b>所有敌人（含自身）每秒回复 1% 最大生命 + 60 生命</b>。悬停于炮火先兆者前方，停留 <b>25s</b> 后离场。<b>Lv11 前不出场</b>。优先击毁以免其持续治疗敌军。',
    },
    baoling: {
      name: '暴鸰', type: 'baoling', color: '#e3e6ec', hp: 550, score: 500,
      lore: '敌方人员操纵的无人战舰，飞行速度缓慢。携带有爆破弹头，将会在接近我方战机时投掷，并造成范围物理伤害。据说设计灵感来自某种幻想生物。虽然在投弹之后不再具有任何攻击性，但是因重量减轻而得以更快速地移动。',
      desc: '自爆无人机：<b>不悬停</b>、径直下压，进入<b>索敌半径（40% 屏幕高度）</b>即<b>停车锁定</b>——玩家位置浮现红色预警区，炸弹脱离后经 <b>0.4~0.6s（逐弹随机）</b>低速下坠再<b>极速加速</b>冲向预警区中心爆炸：<b>玩家 40 伤害</b>（不伤敌人）。<b>预警区形成前被击毁则原地自爆</b>（伴随红色扩散爆炸波，<b>不伤玩家</b>）：<b>周围 250px 内所有敌方单位</b>受 600 + 20% 最大生命伤害（封顶 2000，可连锁殉爆）；<b>预警区一旦形成，炸弹即视为脱离——击毁暴鸰也无法终止，炸弹仍将抵达目标位置并爆炸</b>。投弹后<b>停留 1.2s</b> 再俯冲离场；碰撞 <b>24</b>。<b>玩家处于爆圈内时对暴鸰增伤 35%</b>（无论是否已投弹）。普通炮艇 <b>1.5%</b> 概率替换出现（成对编队则两架均为暴鸰）；<b>Lv11 起也占特殊 3 类槽位权重</b>。',
    },

    jiaoxiang: {
      name: '焦香螺旋桨', type: 'jiaoxiang', color: '#ff7a18', hp: 1200, score: 600,
      lore: '“螺旋桨天堂”大量采用的升级版浮空动力装置，动力强劲，浮空稳定，甚至还额外附带了驱羽兽功能，堪称完美。<br />但它的散热问题反而更严重了。装载了它的浮空平台，一年四季都弥漫着恼人的焦香。',
      desc: '<b>无碰撞伤害、不攻击</b>：登场后<b>绕大圈巡航</b>——<b>圆心与半径逐次随机</b>（半径 150~200、圈底位于场地 <b>84%~94%</b> 高度、圆心 X 屏中心附近随机），轨迹含轻微漂移且<b>不出场边</b>；圈底最低时光环<b>可灼烧到屏幕最下方</b>。<b>35%</b> 概率从<b>侧翼</b>出现。登场 <b>0.8s</b>（侧翼 <b>1.2s</b>）后展开<b>火焰光环</b>：光环内我方战机<b>每秒 -22.5 血量</b>，接近本体（半径 55 内）<b>伤害翻倍（-45/s）</b>。<b>Lv11 前不出场</b>，击毁后掉落大量水晶。',
    },

    fashiA2: {
      name: '法术大师A2', type: 'fashiA2', color: '#c084fc', hp: 900, score: 600,
      lore: '敌方人员操纵的无人战舰，去掉部分飞行辅助模块，牺牲了飞行速度以换取装备更大型法术武器的空间。能进行远程法术攻击，需要特别小心。',
      desc: 'A1 的<b>强化版</b>：不停留、直接下压（可左右斜移），登场 <b>1.8~2.3s</b> 后进入攻击周期——<b>停移</b> → 朝玩家发射<b>紫色激光</b>（伤害 <b>32</b>，持续生长至出界）→ 攻击后 <b>50%</b> 概率朝<b>斜下方（45°）</b>移动（攻击间隔 <b>1.22~1.83s</b>）。斜移常在下一次攻击前未走完——照常刹停射击后<b>放弃剩余斜移、径直下降</b>。碰撞 35。<b>替换权重：Lv11 前 0% / Lv11 起 3 类槽位 30</b>。',
    },

    douzhi: {
      name: '斗志昂扬', type: 'douzhi', color: '#c9d8ea', hp: 280, score: 100,
      lore: '艾伦精选科技公司感谢您别出心裁的赞助！这架无人战舰将时刻为场上战舰播报商业联合会精选广告段落，刺激大家的神经，让竞赛现场更加燥热！',
      desc: '增益无人机：<b>无碰撞伤害、不攻击</b>（与玩家互相穿过）。<b>每次关卡提升时有 4% 概率</b>从屏幕<b>左侧或右侧</b>出现，朝另一侧横穿（沿余弦曲线小幅上下浮动）。<b>击毁时</b>：我方战机与僚机的<b>攻击速度、弹道飞行速度翻倍，持续 8s</b>（伴随蓝盒脱离、光环演出后本体渐隐）。',
    },

    fashiA1: {
      name: '法术大师A1', type: 'fashiA1', color: '#a855f7', hp: 80, score: 160,
      lore: '敌方人员操纵的无人战舰，飞行速度非常快，由某法术教育竞赛用无人战舰改装而来。其模块化设计使其能装备法术武器进行远程法术攻击，需要特别小心。',
      desc: '紫光激光无人机：<b>不停留</b>、匀速下降，入场 <b>1.2~3s</b> 后（每架独立随机）进入首次攻击周期——<b>停移</b> → 朝玩家发射<b>紫色激光</b>（伤害 16，逐渐生长）→ 攻击后 <b>50%</b> 概率<b>左右横移</b>一段随机距离（不飞出屏幕）→ 恢复下降。<b>入场下坠越过 10%~20% 屏高触发线时</b>（逐架随机）有 <b>60%</b> 概率先<b>水平横移一次</b>。碰撞为普通 2 类的 80%。<b>Lv11 前出现权重低，Lv11 起较多出现</b>（2 类替换 60）。',
    },
    
    popian: {
      name: '破片', type: 'popian', color: '#cfd6e0', hp: 200, score: 160,
      lore: '敌方的攻击型空援无人战舰，攻击造成范围性物理伤害。',
      desc: '三连发炮弹无人机：<b>只沿直线飞行</b>——出场选定一个随机点（停留于 <b>30%~80%</b> 屏高、<b>不进入两侧 15% 边缘区</b>，离自身近的高度概率更高），直飞到点后<b>急停锁停</b>，除非被击毁不再移动；停稳后才能攻击。<b>20%</b> 概率从<b>侧翼</b>入场。<b>索敌范围 30% 屏高、每秒 +5%</b>；玩家进入范围后在其位置<b>红圈预警 0.8s</b>，随后<b>快速三连发高速炮弹</b>（<b>不可被击毁</b>）：<b>首发 8 伤害</b>、后两发各 <b>5</b>；<b>若首发命中，则后两发炮弹无视玩家的无敌效果</b>，首发未命中而后两发命中则该次无敌时间 <b>-30%</b>。<b>碰撞伤害分段</b>：入场 0.5s 内无伤害、0.5~2s 为 20、2s 后为 37.5。<b>火力 Lv1 / Lv2 时受到 30% / 10% 易伤</b>。<b>Lv11 前出现权重极低，Lv11 起正常出现</b>。',
    },

    fashiMatrix: {
      name: '法术矩阵', type: 'fashiMatrix', color: '#ff5566', hp: 80, score: 160,
      desc: '白红菱形法师无人机：<b>竖菱形机体（高为宽 1.8 倍、本体自旋）</b>，入场<b>高速俯冲</b>（初速为常态 2 倍并快速衰减）降到<b>屏幕上方 20%~40% 区域</b>，随后<b>不规则地胡乱漂移</b>（不脱离战场），<b>约 18s 后加速离场</b>。移动期间朝玩家位置<b>左右 ±15° 以内</b>发射<b>通体白光的大正方体</b>（一个面恒朝玩家、边缘泛淡红光、带白光拖尾、发射后 0.5s 内由小长大）：正方体伤害 <b>20</b>、速度<b>略高于普通子弹</b>且平滑加速。<b>正方体射程有限</b>（随机为自身到玩家距离的 <b>70%~140% + 15% 屏高</b>）：抵达最大射程前<b>快速减速、光芒黯淡</b>（尾焰随减速迅速收短），末段<b>提前渐隐、速度归零时恰好消失</b>；<b>穿过守愿者白盾</b>：无法被白盾截断，穿盾后命中伤害 <b>-50%</b>。<b>法术阵列在场时</b>：偏移角增至 <b>±25°</b>、正方体速度 <b>+25%</b>。碰撞伤害 <b>18</b>。生命值 <b>80</b>，<b>受到来自主战机的伤害降低 30%</b>（僚机弹幕正常）。<b>Lv11 起才会出现</b>。',
    },

    fashiArray: {
      name: '法术阵列', type: 'fashiArray', color: '#c22b3d', hp: 3500, score: 1300,
      pvZoom: 1.45,   // 详情预览放大：三菱形+底座的视觉尺寸紧凑，按碰撞盒适配会显得偏小
      desc: '血红三菱法师母机（<b>4 类</b>）：三座<b>法术矩阵样式的菱形</b>架设在<b>灰黑底座</b>上——中央菱形较大、呈<b>血红色</b>并带<b>血红流动特效</b>，两侧菱形与中央成一定夹角。<b>入场与退场阶段</b>：底座散发出<b>诡异的浓厚黑雾</b>，机体伴有<b>极轻微的颤动</b>，到位后黑雾逐渐消散。体型、<b>碰撞伤害（12.5）等同炮火先兆者</b>，<b>整体移速为其 65%</b>：匀速下降到<b>屏幕上方 20%~30% 区域</b>后<b>像法术矩阵一样胡乱移动</b>（不脱离屏幕），并<b>周身散发血红雾气</b>；<b>30s 后向上飞离战场</b>。就位后 <b>0~1s</b> 内发起首次攻击：朝玩家发射<b>法术矩阵同款但大一号的红色正方体</b>（伤害 <b>26</b>、周围红光更明显，飞行中<b>三轴翻滚的立体旋转</b>），飞行至 <b>30%~60% 射程</b>时<b>分裂为 3 枚常规正方体</b>——1 枚沿原方向、另 2 枚垂直于原方向；<b>分裂前 0.5s</b> 正方体周围出现<b>红色收缩圈</b>预警，分裂瞬间伴随<b>微弱冲击波</b>。就位 <b>2.5s</b> 后首次召唤、其后<b>每 5s</b> 一次：<b>周身闪动红光</b>，并在周围一定范围<b>召唤一个法术矩阵</b>——生成位置光效闪动、<b>1s 后开始攻击并随机移动</b>，<b>该召唤体死亡不加分、不掉水晶</b>；<b>飞离期间不再召唤</b>。<b>在场时为法术矩阵提供加成：偏移角增至 ±25°、正方体速度 +25%</b>。<b>死亡时</b>：死亡爆发<b>震出一个法术矩阵</b>——<b>无盾</b>，<b>0.4s 内高速旋转随机 1~2 圈</b>（转速逐渐衰减），<b>1s 后开始攻击</b>，其余与常规法术矩阵一致。<b>Lv11 前不出场</b>（Lv11 起占 4 类槽位，出场时 <b>25%</b> 概率替换主力舰）。',
    },

    capital_crimson: {
      name: '赤红主力舰', type: 'capital', variant: 'crimson', color: '#ff4d6d', hp: 4200, score: 1300,
      desc: '技能循环：<b>双翼交叉矛</b>（左右翼各 3 发向内交叉成 X）→ <b>双曲线宽扇</b>（一侧 6 发弯向斜下、覆盖面极广，左右交替）→ <b>加速弹幕</b>（“/||\\”→“/|\\”，沿每条射线<b>每 0.09s 依次连发 4 发</b>同参加速长条弹——初速低、加速到常规弹速 <b>1.2~1.4 倍</b>（逐波随机），触顶后间距恒定均匀；<b>第二轮于第一轮末发出膛后 0.3s 开始</b>；两波<b>出弹点以施放瞬间为准快照</b>）。<b>对玩家 Lv4 / 暴走(Lv5) 火力减伤 15%</b>。居中快速入场，由 1/2 类护航。',
    },
    capital_azure: {
      name: '苍蓝主力舰', type: 'capital', variant: 'azure', color: '#4d9fff', hp: 4200, score: 1300,
      desc: '技能循环：<b>瞄准六连齐射</b>（±20° 偏差）→ <b>双巨弹</b>（向下方 <b>120° 扇区</b>两个随机方向、间隔 0.25s 先后各射一颗<b>橙焰炮艇同款巨型子弹</b>——飞行 25% 屏高减速滑行、临近停速分裂 6 发渐变小子弹）→ <b>双臂螺旋 12 发</b>（加速长条弹 180% 弹速，出弹点施放瞬间快照）。出场时 <b>20% 概率带护盾</b>：前 5s 虚化不受伤害、我方炮弹穿过。<b>对玩家 Lv4 / 暴走(Lv5) 火力减伤 15%</b>。',
    },
    capital_crgold: {
      name: '赤金主力舰', type: 'capital', variant: 'crgold', color: '#ff9a1a', hp: 4200, score: 1300,
      desc: '自带<b>两枚旋转环</b>。技能循环：<b>锁定玩家坐标的扇形连射</b>（首轮 5 发、随后 2/2 两轮，每次均为紧凑两连发）→ <b>金环扩散</b>：消耗一枚旋转环，<b>环带上所有子弹（敌我）瞬间消散</b>，<b>最多两次</b>（耗尽后退化为瞄准双发；<b>圆环被群星之杀斩击切断时立即失去清弹效果、从断口碎裂消散</b>）→ <b>停移</b>发射四组「左3右3」加速长条弹（初速≈0 加速至 <b>180% 弹速</b>，夹角依次 <b>75°/55°/35°/15°</b> 收窄）。两技能<b>出弹点均以施放瞬间为准快照</b>。<b>对玩家 Lv4 / 暴走(Lv5) 火力减伤 15%</b>。',
    },
    boss: {
      name: '旧日之歌', type: 'boss', color: '#e6d5ff', hp: 36000, score: 0, bossId: 'song',
      quote: '自往昔中浮现的梦魇',   // 图鉴引言（颜色与标题一致）
      desc: '宽约 60% 屏宽，小幅左右巡航。拥有 4 种技能乱序释放：<br />' +
        '<b>技能1</b> 双管极快连发长条弹 + 双曲线弹流（血量≤50% 时双管同时向内 / 向外双向发射）<br />' +
        '<b>技能2</b> 散射大子弹（3 轮，每轮随机缺失 20%~35%）<br />' +
        '<b>技能3</b> 四部位标记三连发（标记释放时锁定，不追踪）<br />' +
        '<b>技能4</b> 双管乱射长条弹（血量＞50% 为 270° 大范围散射、≤50% 收敛到下半球）<br />' +
        '血量 70%：在<b>最左侧</b>召唤一位炮火先兆者并掉落暴走道具（各一次）；<b>血量 40%</b>：在<b>最右侧</b>再召唤一位炮火先兆者（就位后同样固定靠边、不巡航）；&lt;50% 技能间隔减半。<br />' +
        '<b>击败掉落</b>：600 颗水晶（击杀得分 0，奖励全部走水晶）+ 20% 高能爆弹 + 必掉暴走道具，并参与通用道具掉落池（黑色标记：套件 / 护盾按基础值；加血独立判定 40% 掉 1 个 / 另有 10% 一次掉 2 个）。',
      // 分难度注解（具象为基准不显示；数据与 01-config DIFFICULTIES / SONG_SHIP 同步）
      diffNotes: {
        xuxiang: 'BOSS 伤害 <b>-40%</b>；技能释放间隔 <b>+50%</b>；<b>不会连续释放同种技能</b>。技能组与具象一致。',
        realme: '技能释放间隔 = 具象的 <b>55%</b>。<b>技能1</b>：恒 <b>4 条</b>旋转双曲线弹流（初始方向/角速度逐条随机，当前指向水平以上时角速度大幅增加、以下较为减小）；时长：≥70% 血 +25%、<70% 血 <b>×3</b>；释放其他技能时概率<b>连携技能1</b>（≥70% 血 20% / <70% 血 30% / <35% 血 50%，连携不享时长加成，<b>必定只出 2 条流</b>且双曲线弹寿命降至 <b>3.2s</b>——主释放 4.5s）。<b>技能2</b>：<b>7 轮</b>大子弹散射（缺失 10%~20%），首轮必定慢速、其余随机 3 轮快速（弹速 ×1.4~1.7）。<b>技能3</b>：<b>2 部位锁定标记 + 2 部位持续追踪</b>（随机分配，四部位射击间隔独立随机）。<b>技能4</b>：≥70% 血 270° 散射 + 射速 +100%；<70% 血 360° 单发 + 射速 +200%，并每 0.7~1.7s 向下扇形圆弹幕（8~14 发）。<b>技能5</b>：任意位置可释放——六发<b>暗黑子弹</b>全部锁定「玩家释放瞬间的竖直直线」，翼/炮/甲三组高度交错、轨迹交叉成笼。<b>技能6</b>：预约制——仅在中线过零前释放，三组各随机偏角 ±75°（下方 150° 扇区）、左右严格镜像对称，触壁反弹最多 3 次。',
      },
    },
boss_storm: {
      name: '暴风之眼', type: 'boss', color: '#dff3ff', hp: 50000, score: 9000, bossId: 'storm',
      quote: '天秀忧郁之风',   // 图鉴引言（颜色与标题一致）
      desc: '第二波 BOSS。第一阶段为占屏宽 80% 的白色龙卷风暴，逆时针旋转、小幅漂移，整个风暴区域均可受击。7 种技能乱序释放：<br />' +
        '<b>技能1</b> 风波呼啸：从一侧射入 3~4 道横向弯曲风波（弯在下方、可不对称，宽度较风流稍宽），标记约 1.1s 后<b>整条瞬时显现</b>，共两轮（第二轮换另一侧）；技能结束后下一次技能间隔 ×0.25。<b>28 伤害 + 击退</b><br />' +
        '<b>技能2</b> 蓄力后向正前方推出<b><span class="ency-link" data-ency="tornado">大型龙卷</span></b>（约占屏宽 30%，可击毁、缓慢下移，随机 360° 快速射出 16 伤害风弹，碰撞 32 伤害；<b>对主机弹幕减伤 50%、受僚机伤害 +150%</b>——僚机是其弱点）<br />' +
        '<b>技能3</b> 连续随机选定 5 处召唤<b>垂直风柱</b>（约 14% 屏宽，标记 1.3s 后落下，18 伤害 + 击退）<br />' +
        '<b>技能4</b> 漩涡状弹幕（4 条臂），前半程逆时针旋转、后半程顺时针旋转<br />' +
        '<b>技能5</b> 两轮乱射风条（首轮 12 处、次轮 9 处，下方 120° 区域）+ 每轮一枚中心瞄准玩家；部分风弹随机强化（尺寸 / 伤害提升）<br />' +
        '<b>技能6</b> 三旋臂漩涡弹幕：3 条旋臂风弹，随机顺 / 逆时针且全程不变，转速随时间越来越快，持续 5s<br />' +
        '<b>技能7</b> 涡流风旋：落点预警后自机体飞抵屏幕下方 80% 高度处，悬停自转 5s、双旋臂喷出密集风条后快速消散；风旋机体碰撞 12 伤害。预警期间落点处有<b>大范围快速收缩的淡红色圆圈</b>（周期性）反复提示。<br />' +
        '血量 70%：在最侧边召唤一位炮火先兆者并掉落暴走道具（各一次）。<br />' +
        '<b>击败后</b>：不掉落水晶、得分 9000；风暴轰然消散，直接召唤二阶段「风暴编织者」（20% 高能爆弹 + 必掉暴走道具 + 通用道具掉落池照常）。',
      // 分难度注解（具象为基准不显示；数据与 01-config DIFFICULTIES / STORM_SHIP 同步）
      diffNotes: {
        xuxiang: 'BOSS 伤害 <b>-40%</b>；技能释放间隔 <b>+50%</b>；<b>不会连续释放同种技能</b>。技能组与具象一致。',
        realme: '<b>技能1</b>：脱离技能轮换——每 10~16s <b>独立释放</b>一轮风波（单轮 3~4 道、随机一侧），不占用技能槽、不影响技能释放间隔。<b>技能2</b>：大型龙卷血量 <b>6000</b>（具象 3600），受僚机伤害加成额外 +150%（与基础加算、不乘算）。<b>技能3</b>：共 <b>6 轮</b>射击，每轮同时射出 <b>2 个风柱</b>（位置至少相差 10% 屏宽），轮间隔 +50%。<b>技能4</b>：总时长 <b>9s</b>，期间自身减伤 25%、旋转速度 +40%、风弹射速 +60%、风弹长度 +30%；初始方向顺/逆时针随机，期间随机改变 2~3 次方向。<b>技能5</b>：两轮风弹 <b>14/11</b> 发；普通风弹 20% 概率射速减慢 20%~50%（强化大风弹不减慢）。<b>技能6</b>：追加一组<b>镜像三旋臂</b>（两射击点关于竖直中轴精确镜像、转向相反，任意时刻保持镜像）。<b>技能7</b>：涡流风旋改为<b>三旋臂</b>，风弹射速 +25%、最大转速 2.3 rad/s（具象 2.625）。另有<b>技能8「双子旋臂」</b>加入技能池——距风暴中心 30%~80% 半径环内随机两点（间距 ≥70px）绕中心公转，各以 50% 概率发出三旋臂或四旋臂，持续 6s（旋臂自转方向随机且两点独立）。',
      },
    },
    boss_storm2: {
      name: '风暴编织者', type: 'boss', color: '#8fd4ff', hp: 36000, score: 0, bossId: 'storm2',
      quote: '雷霆织就的风暴之心',   // 图鉴引言（颜色与标题一致）
      desc: '一阶段「暴风之眼」的风暴血量归零后<b>轰然消散</b>，其中隐藏的雷电飞舰从中现身——此即二阶段本体。<br />' +
        '<b>造型</b>：X 形四臂——左上-右上、右下-左下夹角 <b>120°</b>，同侧上下臂夹角 <b>60°</b>，上臂较短、下臂较长；中央为<b>灰色装甲机体</b>，中下方镶嵌<b>白蓝 → 深蓝的电弧能量球</b>，雷电沿机体导管泵向四臂端头的发射缝隙。<br />' +
        '<b>数值</b>：HP <b>36000</b>（具象），尺寸约 <b>43% 屏宽</b>，碰撞伤害 <b>40</b>（接触一次性）；悬停移速显著高于旧日之歌，并伴有一定程度的上下浮动。<br />' +
        '<b>击败掉落</b>：900 颗水晶（击杀得分 0，奖励全部走水晶）+ 20% 高能爆弹 + 必掉暴走道具 + 通用道具掉落池（灰 + 蓝标记：护盾 6%；加血独立判定 40% 掉 1 个 / 另有 10% 一次掉 2 个）。击败后通关。<br />' +
        '概念：操纵雷电的飞舰搅动宇宙能量，卷起第一阶段的风暴。<b>6 种技能乱序释放</b>（间隔 = 暴风之眼的 75%；玩家暴走期间间隔额外减半；本机受到暴走伤害 -30%；血量 70% 掉落暴走道具；<b>技能3/6 光束可被守愿者白盾截断</b>，技能1/2 激光无视白盾）：<br />' +
        '<b>技能1</b> 停止移动，中心电弧球明显预警蓄力 <b>1.2s</b> 后向下发射强力电弧激光（<b>60 伤害</b>，虚象 -40%）；光束<b>宽大</b>、周身<b>电弧狂乱缠绕</b><br />' +
        '<b>技能2</b> 停止移动，四臂喷口<b>按发射顺序先后各现一圈收缩预警波</b>，激涌蓄力 1.2s 后向下发射电弧激光（随机一个先发射、随后快速随机跟上，<b>50 伤害</b>）<br />' +
        '<b>技能3</b> 仅在<b>场地正中</b>向斜下发射四道电弧光束（左右镜像对称，触左右边界<b>反弹</b>，弹道呈"&lt;"形折线，25 伤害，<b>弹速 +80%</b>，释放后下一次技能间隔<b>额外 -70%</b>）；光束沿头部轨迹<b>从 0 增长</b>至全长，转折处沿折线自然弯折<br />' +
        '<b>技能4</b> 中心能量球连续快速连射 <b>40~70</b> 发雷电长条弹——每发均为<b>直射弹</b>、飞行中不扭动，仅朝向逐发变化（按蛇形曲线采样），弹点集合整体呈"先左后右、越摆越宽"的流线轨迹；四喷口外<b>始终</b>各现一圈 <b>14~20</b> 枚雷电子弹（<b>间隔 0.8~1.5s 依次浮现</b>，停留原处 1s 后向对应方向爆开；<b>爆开初速为雷电长条弹速度的 60~80% 或 120~140% 随机取档，同圈一致</b>，20 伤害）；<b>70% 血以下强化</b>：蛇形雷条持续 <b>+50%</b>（多射 50%），雷环增至 <b>6 圈</b>——随机两个喷口各生成第二次；雷环<b>必然在蛇形雷条射完前全部爆开</b>，迟到的雷环立即补齐、并与在场未爆雷环一同立刻爆开（初速 / 最终速度 <b>+30%</b>）<br />' +
        '<b>技能5</b> 周身雷电环缠绕（缓慢旋转明灭），下方 30% 区域随机 5 处依次雷击（雷电环<b>恒定大小渐显聚能</b>——先慢后快，预警 1.2s、区域半径为焦香螺旋桨火环的 <b>80%</b>，<b>40 伤害</b>；落雷瞬间<b>白光与蓝点光爆闪</b>，击中中心外扩一圈 <b>14~20</b> 枚雷电子弹）<br />' +
        '<b>技能6</b> 四喷口沿臂方向直射电弧光束出屏 → 光束于<b>左右边界</b>重现（与臂向光束<b>同长</b>，预警后<b>自 0 增长</b>、增长较慢），以约 <b>1.7s 抵达底边</b>的速度射向目标，左右两侧<b>镜像对称</b>；<b>每边每轮 2 条</b>（同边两束夹角 ≥<b>15°</b>）、恒定 <b>3 轮</b>（<b>轮次间隔 1.5s</b>，不随血量变化）；释放后<b>下一次技能间隔 -50%</b>（28 伤害）<br />' +
        '<b>入场</b>：一阶段「暴风之眼」<b>轰然消散</b>（白雾爆发 + 双冲击波环外扩）→ <b>中央雷电风暴轰鸣</b>约 2.1s（落雷密集震屏，中央凝聚出电弧能量球）→ 电球骤亮收缩<b>汇入机体</b>，风暴编织者现身（全程约 3.7s，期间无敌、不释放技能）。',
      // 分难度注解（具象为基准不显示；数据与 01-config DIFFICULTIES / STORM2_SHIP 同步）
      diffNotes: {
        xuxiang: 'BOSS 伤害 <b>-40%</b>；技能释放间隔 <b>+50%</b>；<b>不会连续释放同种技能</b>。技能组与具象一致。',
        realme: '技能释放间隔统一 <b>×1.4</b>（+40%；连中同技能 ×0.2 / 技能3 / 技能6 等额外乘区在其上照常叠加）。<b>技能1</b> 释放期间不再停止移动，激光连续射出 <b>5 次</b>（上一发射完前即开始下次预警，射完随机 0.1~0.5s 后立刻射出下一发），自身移速与常态一致（无额外加速修正）；<b>技能2</b> 有 <b>50%</b> 概率同时释放技能6（连携时臂向光束<b>变淡</b>、臂向蓄力与汇聚预警时长 <b>+50%</b>，连携的技能6 随技能2收束无缝继续），<b>连携时蓄力延长至 1.6s</b>（预警圈收缩速度相应变慢），未连携则下一次技能间隔 <b>-60%</b>；<b>技能3</b> 连续快速释放<b>两次</b>（间隔 <b>1~1.5s</b>，第二轮重新随机角度，释放结束后下一次技能间隔 <b>+30%</b>）；<b>技能4</b> 雷环固定 <b>8 圈</b>（生成间隔 -40%）；<b>技能5</b> 落点扩展至<b>下方 60% 区域</b>、轰击错峰 -10%；<b>技能6</b> 释放瞬间<b>四个雷电喷口处</b>立即触发雷霆打击（无预警、伤害减半、外扩雷环子弹数减半）。',
      },
    },

    // ---------- 衍生级：由母体敌人产生 / 召唤，不独立入场 ----------
    // parent = 母体图鉴条目（详情页「母体」字样可点击跳回；母体 desc 内的本体名称反向跳转至此）
    escort: {
      name: '卫护飞船', type: 'escort', color: '#6a5ce0', hp: 1, score: 20,
      pvZoom: 0.6,   // 小体型衍生体：预览/缩略图按接近实机大小展示（默认 1.7 上限会放大到失真）
      parent: 'prolifera', derived: true,
      desc: '增生侧翼艇阵亡时分裂出的衍生体（每艘分裂 <b>0~3</b> 个）：<b>深蓝紫渐变小三角、边缘泛紫色光芒</b>（与水晶的浅蓝明显区分）。<b>无攻击</b>，沿母舰原航向漂移；碰撞 <b>10</b>、造成的无敌时间仅为常规的 <b>40%</b>（0.48s）。<b>不掉落任何水晶与道具</b>（守愿者弹对其无限穿透）。不计入场面压力。',
    },
    tornado: {
      name: '大型龙卷', type: 'tornado', color: '#eaf6ff', hp: 3600, score: 0,
      parent: 'boss_storm', derived: true,
      desc: '暴风之眼技能2 召唤的衍生体：蓄力后自机体前方推出，<b>约占屏宽 30%</b>，可击毁、<b>缓慢下移直至脱离战场</b>（轻微左右摇摆），随机 360° 快速射出 <b>16 伤害风条</b>，碰撞 <b>32</b> 伤害。<b>受到战机主武器伤害 -50%、受僚机伤害 +150%</b>（僚机是其弱点）；<b>守愿者弹每次命中判定两次伤害</b>。<b>不掉落水晶与道具</b>（真我难度血量 <b>6000</b>）。不计入场面压力。',
    },
  };

  let encyCurrentGrade = 0;
  let encySelectedEntry = null;   // 当前选中条目：图鉴内切换难度时重渲染其详情（BOSS 血量 / 技能组随难度变化）

  function buildEncyclopedia() {
    encyTabs.innerHTML = '';
    ENCY_GRADES.forEach((g, i) => {
      const tab = document.createElement('button');
      tab.className = 'ency-tab';
      tab.textContent = g.name;
      tab.addEventListener('click', () => selectEncGrade(i));
      encyTabs.appendChild(tab);
    });
    selectEncGrade(0);
  }

  function selectEncGrade(idx, selectId) {
    encyCurrentGrade = idx;
    encySelectedEntry = null;   // 分页切换未选中条目时清空（跳转路径稍后经卡片 click 重新写入）
    // 高亮 tab
    encyTabs.querySelectorAll('.ency-tab').forEach((t, i) => {
      t.classList.toggle('active', i === idx);
    });
    // 填充列表
    const grade = ENCY_GRADES[idx];
    encyList.innerHTML = '';
    grade.entries.forEach(entryId => {
      const data = ENCY_DATA[entryId];
      const card = document.createElement('div');
      card.className = 'ency-card';
      // 缩略图直接渲染敌人形态（复用 drawEncyPreview，小图模式按比例完整显示）
      card.innerHTML = `<canvas class="ency-card-icon"></canvas><span class="ency-card-name">${data.name}</span>`;
      drawEncyPreview(data, card.querySelector('canvas'), 44, 32, true);
      card.addEventListener('click', () => {
        encyList.querySelectorAll('.ency-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        encySelectedEntry = entryId;
        showEncyDetail(entryId);
      });
      encyList.appendChild(card);
    });
    // 清空详情
    encyDetail.innerHTML = '<p class="ency-placeholder">← 选择一个敌人查看详情</p>';
    // 跨条目跳转：指定条目时自动选中其卡片并展示详情
    if (selectId != null) {
      const i = grade.entries.indexOf(selectId);
      if (i >= 0) encyList.children[i].click();
    }
  }

  // 图鉴跨条目跳转（详情页 .ency-link 的点击入口）：常规条目定位所在分页并选中展示；
  // 衍生级条目不在任何分页（不可直达）——清除标签选中态与卡片选中态，仅展示详情
  function jumpToEncyEntry(entryId) {
    const gi = ENCY_GRADES.findIndex(g => g.entries.includes(entryId));
    if (gi >= 0) { selectEncGrade(gi, entryId); return; }
    encyTabs.querySelectorAll('.ency-tab').forEach(t => t.classList.remove('active'));
    encyList.querySelectorAll('.ency-card').forEach(c => c.classList.remove('selected'));
    showEncyDetail(entryId);
  }

  function showEncyDetail(entryId) {
    const d = ENCY_DATA[entryId];
    encySelectedEntry = entryId;   // 记录当前条目：图鉴内切换难度时重渲染（BOSS 血量 / 技能组随难度变化）
    // 衍生级条目不隶属任何分页：档位名固定展示「衍生级」（不读当前选中分页，跳转进入时无任何标签选中态）
    const gradeName = d.derived ? '衍生级' : ENCY_GRADES[encyCurrentGrade].name;
    const isBoss = d.type === 'boss';
    // BOSS 血量按当前难度解析（hpByDiff 分难度表，见 01-config resolveBossHp）
    const hp = isBoss ? resolveBossHp(BOSS_HP_SRC[d.bossId]) : d.hp;
    // 分难度注解：具象为基准不显示；虚象显示通用削弱；真我显示技能组改版（BOSS 专属）
    const diffNote = isBoss && d.diffNotes ? (d.diffNotes[currentDifficulty.id] || '') : '';
    // BOSS 页面：试炼（正常战斗）+ 测试该敌人（爆弹无限）；普通敌人页面：仅测试该敌人；
    // 衍生敌人（derived）：由母体产生 / 召唤，无法独立入场，不提供测试（也不显示提示文案）
    // （风暴编织者技能已实装：与其他 BOSS 一致提供试炼 / 测试入口；专属登场动画待单独设计）
    const actionHtml = isBoss
      ? `<button class="ency-challenge-btn boss" id="encyTrialBtn">⚔ BOSS 试炼</button>
         <button class="ency-challenge-btn" id="encyChallengeBtn">🔬 测试该敌人</button>
         <div class="ency-challenge-hint">BOSS 试炼：正常战斗，敌我均会受损、可被击坠<br />测试该敌人：1~5 切换火力等级 · 高能爆弹无限（直接击杀全场）<br />= 召唤 1 个 · Shift+= 召唤 10 个（场上仅 1 个目标时先清场）</div>`
      : d.derived
        ? ''
        : `<button class="ency-challenge-btn" id="encyChallengeBtn">🔬 测试该敌人</button>`;
    encyDetail.innerHTML = `
      <div class="ency-detail-name" style="color:${d.color}">${d.name}</div>
      ${d.quote ? `<div class="ency-detail-quote" style="color:${d.color}">${d.quote}</div>` : ''}
      <div class="ency-detail-grade">${gradeName}${d.parent ? ` · 母体：<span class="ency-link" data-ency="${d.parent}">${ENCY_DATA[d.parent].name}</span>` : ''}</div>
      <canvas class="ency-detail-canvas" id="encyPreview" width="220" height="140"></canvas>
      <div class="ency-stats">
        <div class="ency-stat">HP<b>${hp}</b></div>
        <div class="ency-stat">分数<b>${d.score}</b></div>
      </div>
      <div class="ency-detail-desc">${d.lore ? `<div class="ency-detail-lore">${d.lore}</div><div class="ency-lore-divider"></div>` : ''}${d.desc}${diffNote ? `<hr /><div class="ency-diff-note"><b>${currentDifficulty.name} · 技能组修正</b><br />${diffNote}</div>` : ''}</div>
      ${actionHtml}
    `;
    // 绘制预览（220×140 大图）
    drawEncyPreview(d, document.getElementById('encyPreview'));
    // 跨条目跳转链接（衍生级 ↔ 母体互链）：点击切换分页并选中目标条目
    encyDetail.querySelectorAll('.ency-link').forEach(el => {
      el.addEventListener('click', () => jumpToEncyEntry(el.dataset.ency));
    });
    const trialBtn = document.getElementById('encyTrialBtn');
    if (isBoss && !d.previewOnly && trialBtn) {
      trialBtn.addEventListener('click', () => startBossTrial(entryId));
    }
    const challengeBtn = document.getElementById('encyChallengeBtn');
    if (challengeBtn) {
      challengeBtn.addEventListener('click', () => startChallenge(entryId));
    }
  }

  // 从图鉴发起测试：单个目标敌人（BOSS 测试附带爆弹无限）
  function startChallenge(entryId) {
    const d = ENCY_DATA[entryId];
    const challenge = d.type === 'boss'
      ? { kind: 'boss', type: 'boss', bossId: d.bossId || 'song' }
      : { kind: 'enemy', type: d.type, variant: d.variant || null, behavior: d.behavior || null, name: d.name };
    closeEncyclopedia();
    resetGame(true, { challenge });
  }

  // 波次测试：从数值图鉴「怪物权重 · 波次」行发起——挑战对象为整个编队（无顶部血条）。
  // 引擎侧见 04-spawn updateChallenge（场上清空后自动补刷同编队）与 14-main（战斗中按 = 额外追加一整波）
  function startWaveTest(f) {
    const idx = WAVE_FORMATIONS.findIndex(w => w.fn === f.fn);
    if (idx < 0) return;
    closeInfoModal();
    resetGame(true, { challenge: { kind: 'wave', wave: idx, name: f.name } });
  }

  // BOSS 试炼：正常战斗模式（双方均不无敌，走 testBoss 流程直接进警报登场）
  // 传入的可能是图鉴条目 id（boss_storm）或 BOSS id（storm），统一解析为 BOSS id
  function startBossTrial(entryId) {
    closeEncyclopedia();
    const d = ENCY_DATA[entryId];
    resetGame(true, { testBoss: (d && d.bossId) || entryId || 'song' });
  }

  // 全局 ctx 临时切换：游戏内绘制函数均直接读写全局 ctx，预览渲染时将其短暂重指到目标画布，
  // 结束后必定还原。仅限同步的绘制调用（渲染主循环不会在切换期间插入执行）。
  // 写操作经由 02-core 的 setCtx 入口（modules 下导入绑定只读，且写权限收敛到所有者文件）。
  // 嵌套支持：drawEncyPreview 外层切到预览画布后，离屏渲染会嵌套二次切换（pctx → octx），
  // 内层还原时恢复的是外层的 ctx——同步嵌套是合法用法，用深度计数跟踪而非拦截。
  // （若预览路径混入异步/事件回调，破坏的是「同步完成」前提，须靠代码评审与 smoke 把关。）
  let previewCtxDepth = 0;
  function withPreviewCtx(pctx, fn) {
    previewCtxDepth++;
    const realCtx = ctx;
    setCtx(pctx);
    try {
      fn();
    } finally {
      setCtx(realCtx);
      previewCtxDepth--;
    }
  }

  // 图鉴预览：复用游戏内真实绘制逻辑（经 withPreviewCtx 临时将全局 ctx 指向目标画布）
  // 详情大图与列表缩略图共用；small = 缩略图模式：严格按比例完整显示（不设缩放上下限）
  function drawEncyPreview(d, cvs, LW = 220, LH = 140, small = false) {
    if (!cvs) return;
    // 高 DPI 适配：物理像素按 DPR 放大
    cvs.width = LW * DPR;
    cvs.height = LH * DPR;
    cvs.style.width = LW + 'px';
    cvs.style.height = LH + 'px';
    const pctx = cvs.getContext('2d');
    pctx.scale(DPR, DPR);
    pctx.clearRect(0, 0, LW, LH);
    withPreviewCtx(pctx, () => {
      if (d.type === 'boss') {
        // BOSS 预览：先按世界比例画到离屏画布，扫描不透明像素得到真实包围盒，
        // 再按包围盒居中并尽量放大贴入目标画布 —— 避免手工估算中心/缩放造成的偏移与偏小
        //（机体绘制中心与碰撞盒中心普遍不重合，且各 BOSS 视觉占比差异大；实测包围盒对所有 BOSS 通用，含今后新增）
        const spec = d.bossId === 'storm2'
          ? { bossId: 'storm2', w: 175, h: 78, fitMul: 0.7 }   // 风暴编织者本体较前两位 BOSS 小：预览在包围盒适配基础上整体再缩 30%
          : (d.bossId === 'storm' ? { bossId: 'storm', w: STORM.w, h: STORM.h } : { bossId: 'song', w: BOSS.w, h: BOSS.h });
        const gl = 1.7;   // 离屏覆盖的世界边长系数：max(w,h) × 1.7，为辉光外溢留边距
        const world = Math.max(spec.w, spec.h) * gl;
        const dim = Math.ceil(world * DPR);
        const off = document.createElement('canvas');
        off.width = dim; off.height = dim;
        const octx = off.getContext('2d');
        withPreviewCtx(octx, () => {
          octx.scale(DPR, DPR);
          octx.translate(dim / (2 * DPR), dim / (2 * DPR));
          if (spec.bossId === 'storm2') {
            drawBoss({ type: 'boss', bossId: 'storm2', x: 0, y: 0, w: spec.w, phase: 'preview', ency: true });
          } else {
            // phase:'preview' 跳过血条和黑洞特效，直接展示完整机体
            drawBoss({ type: 'boss', bossId: spec.bossId, x: 0, y: 0, w: spec.w, h: spec.h, hp: spec.w, maxHp: spec.w, phase: 'preview', scale: 1, skill: null, unfoldT: 1, parts: [], rot: 0, ency: true });
          }
        });
        // 扫描 alpha 包围盒（设备像素）
        const img = octx.getImageData(0, 0, dim, dim).data;
        let minX = dim, minY = dim, maxX = -1, maxY = -1;
        for (let y = 0; y < dim; y++) {
          for (let x = 0; x < dim; x++) {
            if (img[(y * dim + x) * 4 + 3] > 8) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) return;   // 离屏无内容（异常兜底）
        // 包围盒换算为 CSS 像素（相对画布中心的世界坐标）
        const bx0 = minX / DPR - world / 2, bx1 = (maxX + 1) / DPR - world / 2;
        const by0 = minY / DPR - world / 2, by1 = (maxY + 1) / DPR - world / 2;
        const bw = bx1 - bx0, bh = by1 - by0;
        const bcx = (bx0 + bx1) / 2, bcy = (by0 + by1) / 2;
        // 目标缩放：包围盒尽量占满画布（留 6% 边距），宽高取小者；缩略图同规则自动适配
        // fitMul：条目级二次缩放（风暴编织者本体较小，预览不再撑满，与前两位 BOSS 保持体量差）
        const s = Math.min(LW * 0.88 / bw, LH * 0.88 / bh) * (spec.fitMul || 1);
        pctx.save();
        pctx.imageSmoothingEnabled = true;
        pctx.imageSmoothingQuality = 'high';
        pctx.translate(LW / 2 - bcx * s, LH / 2 - bcy * s);
        pctx.scale(s, s);
        pctx.drawImage(off, -world / 2, -world / 2, world, world);
        pctx.restore();
      } else {
        const et = ENEMY_TYPES[d.type];
        const fit = Math.min(LW * 0.7 / et.w, LH * 0.7 / et.h);
        // 变体技能需一并传入（如幽暮的 dusk 专属绘制分支依赖 skill 路由，否则会按通用 2 类浅色菱形渲染）
        const sk = (spec) => (spec.variant && VARIANTS[spec.type]) ? ((VARIANTS[spec.type].find(v => v.id === spec.variant) || {}).skill || null) : null;
        // 离屏渲染：按“1 世界像素 = DPR 设备像素”的实战比例先画到临时画布，再整体缩放贴入目标画布。
        // 原因：canvas 的 shadowBlur 不随坐标变换缩放——直接在小画布上缩小绘制时，辉光占比会异常放大
        // （A2 等强发光敌人的缩略图会被辉光糊成一片白）；先大后小可让辉光/实体比例与游戏内完全一致。
        const drawOffscreen = (spec) => {
          const t = ENEMY_TYPES[spec.type];
          const gl = 1.9;   // 离屏边长 = max(w,h) × 1.9：为辉光外溢留边距
          const dim = Math.ceil(Math.max(t.w, t.h) * gl * DPR);
          const off = document.createElement('canvas');
          off.width = dim; off.height = dim;
          const octx = off.getContext('2d');
          withPreviewCtx(octx, () => {
            octx.scale(DPR, DPR);
            octx.translate(dim / (2 * DPR), dim / (2 * DPR));
            drawEnemy({
              type: spec.type, x: 0, y: 0, w: t.w, h: t.h,
              color: spec.color, variant: spec.variant || null, behavior: spec.behavior || null, skill: sk(spec),
              hp: t.hp, maxHp: t.hp, phase: 0, shielded: false,
              arrived: true, chargeT: HARBINGER.chargeFirst * 0.75, _sideVel: null,
            });
          });
          return { off, world: Math.max(t.w, t.h) * gl };   // world：离屏覆盖的世界边长（含辉光边距）
        };
        // 贴图辅助：把离屏画布缩放后居中贴到目标画布（cx, cy 为 CSS 像素中心，s 为世界→CSS 像素缩放）
        const blit = (img, cx, cy, s) => {
          const dw = img.world * s;
          pctx.imageSmoothingEnabled = true;
          pctx.imageSmoothingQuality = 'high';
          pctx.drawImage(img.off, cx - dw / 2, cy - dw / 2, dw, dw);
        };
        {
          const z = d.pvZoom || 1;   // 条目级预览缩放（法术阵列等视觉紧凑的敌机放大展示）
          // 缩略图：不设下限（4 类等大体型完整入图），上限与详情图一致（1.7）；pvZoom 仅允许缩小缩略图
          // （Math.min(1, z) 封顶——放大展示不作用于缩略图；卫护飞船等小体型衍生体则按实机大小展示）
          const scale = small ? Math.min(fit, 1.7) * Math.min(1, z) : clamp(fit * z, 0.4, 1.7 * z);
          blit(drawOffscreen(d), LW / 2, LH / 2, scale);
        }
      }
    });
  }

  // ---------- 快捷切换难度（图鉴头部，关闭按钮左侧） ----------
  // 四选一按钮组（静态标记于 index.html，始终渲染）：点击直接选中（与主界面「选择难度」卡片的选中态同步）。
  // 置灰/提示/选中态由 DIFFICULTIES 驱动；设计中（wip）难度不可点，实装后自动可选。
  // 难度在下一局开始时生效（选机页停留期间切换即为开局所选）。
  // 启动时调用一次：绑定点击 + 按 DIFFICULTIES 初始化按钮状态
  function initEncyDiffButtons() {
    encyDiffGroup.querySelectorAll('.ency-diff-btn').forEach(btn => {
      const d = DIFFICULTIES[btn.dataset.diff];
      if (!d) return;
      btn.disabled = !!d.wip;
      btn.title = d.desc;
      btn.addEventListener('click', () => {
        if (d.wip || d.id === currentDifficulty.id) return;
        setDifficulty(d);
        syncDifficultyUI();
        // 难度切换重渲染当前详情：BOSS 血量（hpByDiff）与技能组注解随难度变化
        if (encySelectedEntry) showEncyDetail(encySelectedEntry);
      });
    });
    syncDifficultyUI();
  }

  // 同步难度 UI：图鉴按钮组选中态 + 主界面难度卡片选中态（HUD 标签由 updateHUD 每帧自刷新，无需处理）
  function syncDifficultyUI() {
    encyDiffGroup.querySelectorAll('.ency-diff-btn').forEach(el =>
      el.classList.toggle('selected', el.dataset.diff === currentDifficulty.id));
    diffGrid.querySelectorAll('.diff-card').forEach(el =>
      el.classList.toggle('selected', el.dataset.diff === currentDifficulty.id));
  }

  function openEncyclopedia() {
    encyclopedia.classList.remove('hidden');
    overlay.classList.add('hidden');
    syncDifficultyUI();   // 打开时刷新选中态（难度可能经主界面卡片变更过）
    buildEncyclopedia();
  }

  function closeEncyclopedia() {
    encyclopedia.classList.add('hidden');
    // 仅战斗态遮罩（暂停 / 结算）需要恢复显示；主菜单（idle 且非胜利结算）本就无遮罩，
    // 关闭图鉴时不得把遮罩（含其初始占位文案「已暂停 / 继续游戏」）带到主菜单上
    if (state.mode !== 'idle' || state.victoryOverlay) overlay.classList.remove('hidden');
  }

  // ---------- 数值与机制图鉴 ----------
  // 开始界面卡片右下角 ⓘ 按钮进入：数值与机制的介绍图鉴
  let infoTab = 'weights';            // weights 怪物权重 | waves 特殊机制 | mods 特殊修正
  let infoWeightKind = 'side';        // weights 页子类型（按级别分组）：side 虚象级 | striker 具象级 | special3 真我级 | capital 诗篇级 | formation 波次

  // 等级分档：Lv1~10 一档，之后每 10 级一档（先做 5 档）；格内权重按各档起始等级计算
  const INFO_TIERS = [
    { label: 'Lv1',  lv: 1 },
    { label: 'Lv11', lv: 11 },
    { label: 'Lv21', lv: 21 },
    { label: 'Lv31', lv: 31 },
    { label: 'Lv41', lv: 41 },
  ];

  // 目前游戏等级范围内仅前两档（Lv1~20）实际生效，其后各档显示「—」
  const INFO_TIERS_LIVE = 2;
  // 档位遮罩：未生效档（Lv21 以上）显示「—」，其余保留（0 写作 0）
  const tierMask = cells => cells.map((c, i) => i >= INFO_TIERS_LIVE ? null : c);

  // 波次编队展示配置：name 展示名，ency 代表性图鉴条目（预览图）；权重数据取自 WAVE_FORMATIONS（单一数据源）
  //   sim 为编队演示数据（悬停弹出 mini 战场动画用）：返回代表性实例的单位列表（世界坐标，速度 px/s）——
  //   holdY 悬停高度（到达后停驻；holdDur 为停留时长，null=悬停不离场，数值=停留后以 chargeVy 冲锋）；
  //   note 构成说明；period 演示循环时长（s）。演示为代表性队形，实际入场侧 / 构成按权重随机
  const fu = (ency, x, y, vx, vy, extra) => ({ ency, x, y, vx, vy, ...(extra || {}) });
  const INFO_FORMATIONS = [
    {
      fn: spawnSideGroup, name: '1类小组', ency: 'side_pass', period: 6.5,
      note: '3~5 架 1类自单侧斜插穿越（队形随机：纵队 / 斜线 / 横排梯队 / V 字——图中为斜线队）',
      sim: () => {
        const y0 = CANVAS_H * 0.41;
        return [0, 1, 2, 3].map(k => fu('side_pass', -36 - k * 46, y0 - k * 30, 105, 69));
      },
    },
    {
      fn: spawnStrikerGroup, name: '22', ency: 'striker_crimson', period: 5.6,
      note: '「22」：固定 2 架 2类自上而下入场 → 停留 4~8s → 向下冲锋（演示中停留压缩为 1.2s）',
      sim: () => [
        fu('striker_crimson', CANVAS_W / 2 - 36, -50, 0, 120, { holdY: 110, holdDur: 1.2, chargeVy: 460 }),
        fu('striker_crimson', CANVAS_W / 2 + 36, -50, 0, 120, { holdY: 110, holdDur: 1.2, chargeVy: 460 }),
      ],
    },
    {
      fn: spawnSideColumn, name: '1类长队', ency: 'side_pass', period: 6.5,
      note: '4~7 架 1类排成长队自单侧斜插穿越（队尾依次靠外、靠上）',
      sim: () => {
        const y0 = CANVAS_H * 0.41;
        return [0, 1, 2, 3, 4, 5].map(k => fu('side_pass', -36 - k * 54, y0 - k * 27, 105, 69));
      },
    },
    {
      fn: spawnMirrorRow, name: '232232', ency: 'striker_crimson', period: 5.6,
      note: '「232232」对称横排：4 架 2类（短停留后冲锋）+ 2 架 3类炮艇（稍慢、悬停压阵）',
      sim: () => {
        const x0 = (CANVAS_W - 5 * 70) / 2, out = [];
        for (let k = 0; k < 6; k++) {
          if (k === 1 || k === 4) out.push(fu('gunship_violet', x0 + k * 70, -60, 0, 62, { holdY: 140 }));   // 3类：悬停不离场（「232232」的第 2/5 位）
          else out.push(fu('striker_crimson', x0 + k * 70, -50, 0, 120, { holdY: 100, holdDur: 0.9, chargeVy: 460 }));
        }
        return out;
      },
    },
    {
      fn: spawnSideSweep, name: '双侧对称斜扫', ency: 'side_pass', period: 6.5,
      note: '两队 1类（各 6~8 架）自左右两侧相向斜扫、交叉穿越',
      sim: () => {
        const y0 = CANVAS_H * 0.40, out = [];
        for (let k = 0; k < 7; k++) {
          out.push(fu('side_pass', -30 - k * 46, y0 - k * 25, 108, 61));
          out.push(fu('side_pass', CANVAS_W + 30 + k * 46, y0 - k * 25, -108, 61));
        }
        return out;
      },
    },
    {
      fn: spawnStrikerVee, name: '2*7', ency: 'striker_crimson', period: 5.6,
      note: '「2*7」：7 架 2类组成 V 字队形自上而下俯冲（顶点先行，两翼逐级滞后）',
      sim: () => {
        const cx = CANVAS_W / 2;
        const out = [fu('striker_crimson', cx, -46, 0, 120, { holdY: 105, holdDur: 0.7, chargeVy: 460 })];
        for (let k = 1; k <= 3; k++) {
          for (const sx of [-1, 1]) out.push(fu('striker_crimson', cx + sx * k * 56, -46 - k * 42, 0, 120, { holdY: 105, holdDur: 0.7, chargeVy: 460 }));
        }
        return out;
      },
    },
    {
      fn: spawnSideKamikazeStream, name: '紫自爆流', ency: 'side_kamikaze', period: 6.5,
      note: '两队各 7 架 1类纵列相向斜扫：紫电（亡语向下射一发）为主，本波 30%~60% 替换为白影',
      sim: () => {
        const y0 = CANVAS_H * 0.40, out = [];
        for (let k = 0; k < 7; k++) {
          out.push(fu(k % 2 ? 'side_pass' : 'side_kamikaze', -30 - k * 64, y0 - k * 35, 108, 61));
          out.push(fu(k % 2 ? 'side_pass' : 'side_kamikaze', CANVAS_W + 30 + k * 64, y0 - k * 35, -108, 61));
        }
        return out;
      },
    },
    {
      fn: spawnDiagonalRaid, name: '232111', ency: 'gunship_violet', period: 11,
      note: '「232111」：6 架混编沿对角线自上角斜插——2类领头、3类炮艇第二、2类第三、三个 1类殿后（1类近竖直下落、2类停留后冲锋、炮艇悬停）',
      sim: () => {
        const out = [];
        for (let k = 0; k < 6; k++) {
          const x = 60 + k * 62, y = -40 - k * 40;
          if (k === 3) out.push(fu('gunship_violet', x, y - 20, 0, 62, { holdY: 130 }));
          else if (k % 2 === 0) out.push(fu('side_pass', x, y, 24, 100));
          else out.push(fu('striker_crimson', x, y, 0, 120, { holdY: 110, holdDur: 0.8, chargeVy: 460 }));
        }
        return out;
      },
    },
    {
      fn: spawnGunshipWings, name: '32223', ency: 'gunship_violet', period: 5.6,
      note: '「32223」：左右各 1 艘 3类炮艇压阵（悬停）+ 中央 3 架 2类护航（短停留后冲锋）',
      sim: () => {
        const cx = CANVAS_W / 2, out = [];
        for (const sx of [-1, 1]) out.push(fu('gunship_violet', cx + sx * 150, -60, 0, 62, { holdY: 140 }));
        for (const k of [-1, 0, 1]) out.push(fu('striker_crimson', cx + k * 60, -50, 0, 120, { holdY: 105, holdDur: 0.9, chargeVy: 460 }));
        return out;
      },
    },
  ];

  // 虚象级（1类）展示配置（SIDE_SPAWN_W 分档权重：Lv1~10 / Lv11~20）
  const INFO_SIDE_KINDS = [
    { kind: 'pass',      name: '白影侧翼艇', ency: 'side_pass' },
    { kind: 'prolifera', name: '增生侧翼艇', ency: 'prolifera' },
    { kind: 'shoot',     name: '黄芒侧翼艇', ency: 'side_shoot' },
    { kind: 'kamikaze',  name: '紫电侧翼艇', ency: 'side_kamikaze' },
    { kind: 'moon',      name: '赤月侧翼艇', ency: 'side_moon' },
  ];

  // 诗篇级（4类）展示配置（VARIANTS.capital 变体选取概率，恒定）
  const INFO_CAPITAL_KINDS = [
    { id: 'crimson', name: '赤红主力舰', ency: 'capital_crimson' },
    { id: 'azure',   name: '苍蓝主力舰', ency: 'capital_azure' },
    { id: 'crgold',  name: '赤金主力舰', ency: 'capital_crgold' },
  ];

  // 权重格式化：整数不带小数、小数保留 1 位
  function fmtInfoW(w) { return Number.isInteger(w) ? String(w) : w.toFixed(1); }

  // 行首小预览图（复用怪物图鉴绘制，small 模式按比例完整显示）
  function infoShipCanvas(encyId) {
    const cvs = document.createElement('canvas');
    cvs.width = 40 * DPR; cvs.height = 28 * DPR;
    drawEncyPreview(ENCY_DATA[encyId], cvs, 40, 28, true);
    return cvs;
  }

  // ---------- 波次编队悬停演示（怪物权重 → 波次）----------
  // 悬停编队行：弹出 mini 战场动画浮层，按编队 sim 数据回放代表性入场 / 走位（虚线为路线，呼吸圈为悬停点）
  //   浮层挂载于 .info-modal 内（position:fixed 的包含块即 info-modal——其 backdrop-filter 建立），随 game-wrap
  //   整体 transform 一致缩放：鼠标视口坐标需除以整体缩放比换算回 modal 本地坐标后再定位
  const FORMATION_CW = 204, FORMATION_CH = Math.round(204 * CANVAS_H / CANVAS_W);   // mini 战场画布（全场地等比缩放）
  const formationSprites = new Map();   // encyId → { off, world }：离屏机体图（与怪物图鉴同源绘制，world 为覆盖的世界边长）
  const fPrev = {
    popup: null, titleEl: null, subEl: null, cvs: null, pctx: null,
    units: [], period: 6, t: 0, raf: 0, last: 0, hideTimer: null,
  };

  // 编队演示单位离屏图：同 drawEncyPreview 的离屏方案（先按实战比例大图绘制再整体 blit，保证辉光比例一致）
  function infoSprite(encyId) {
    if (formationSprites.has(encyId)) return formationSprites.get(encyId);
    const d = ENCY_DATA[encyId];
    const t = ENEMY_TYPES[d.type];
    const gl = 1.9;
    const dim = Math.ceil(Math.max(t.w, t.h) * gl * DPR);
    const off = document.createElement('canvas');
    off.width = dim; off.height = dim;
    const octx = off.getContext('2d');
    const sk = (d.variant && VARIANTS[d.type]) ? ((VARIANTS[d.type].find(v => v.id === d.variant) || {}).skill || null) : null;
    withPreviewCtx(octx, () => {
      octx.scale(DPR, DPR);
      octx.translate(dim / (2 * DPR), dim / (2 * DPR));
      drawEnemy({
        type: d.type, x: 0, y: 0, w: t.w, h: t.h,
        color: d.color, variant: d.variant || null, behavior: d.behavior || null, skill: sk,
        hp: t.hp, maxHp: t.hp, phase: 0, shielded: false,
        arrived: true, chargeT: HARBINGER.chargeFirst * 0.75, _sideVel: null,
      });
    });
    const s = { off, world: Math.max(t.w, t.h) * gl };
    formationSprites.set(encyId, s);
    return s;
  }

  function ensureFormationPopup() {
    if (fPrev.popup) return;
    const pop = document.createElement('div');
    pop.className = 'info-fpop hidden';
    const title = document.createElement('div');
    title.className = 'info-fpop-title';
    const cvs = document.createElement('canvas');
    cvs.width = FORMATION_CW * DPR; cvs.height = FORMATION_CH * DPR;
    cvs.style.width = FORMATION_CW + 'px'; cvs.style.height = FORMATION_CH + 'px';
    const sub = document.createElement('div');
    sub.className = 'info-fpop-sub';
    pop.append(title, cvs, sub);
    infoModal.appendChild(pop);
    pop.addEventListener('mouseenter', () => { if (fPrev.hideTimer) { clearTimeout(fPrev.hideTimer); fPrev.hideTimer = null; } });
    pop.addEventListener('mouseleave', hideFormationPreview);
    fPrev.popup = pop; fPrev.titleEl = title; fPrev.subEl = sub; fPrev.cvs = cvs;
    fPrev.pctx = cvs.getContext('2d');
    fPrev.pctx.scale(DPR, DPR);
  }

  // 浮层定位：跟随鼠标（视口坐标 → modal 本地坐标 ÷ 整体缩放比），优先右侧、放不下换左侧，双向夹紧不出 modal
  function moveFormationPopup(ev) {
    if (!fPrev.popup || fPrev.popup.classList.contains('hidden')) return;
    const mr = infoModal.getBoundingClientRect();
    const k = mr.width / (infoModal.offsetWidth || 1);   // game-wrap 整体 transform 缩放比
    const lx = (ev.clientX - mr.left) / k, ly = (ev.clientY - mr.top) / k;
    const pw = fPrev.popup.offsetWidth, ph = fPrev.popup.offsetHeight;
    let x = lx + 22;
    if (x + pw > infoModal.offsetWidth - 6) x = lx - pw - 22;
    x = clamp(x, 6, Math.max(6, infoModal.offsetWidth - pw - 6));
    const y = clamp(ly - ph / 2, 6, Math.max(6, infoModal.offsetHeight - ph - 6));
    fPrev.popup.style.left = x + 'px';
    fPrev.popup.style.top = y + 'px';
  }

  // 演示单位在时刻 t 的位置：直线飞行；holdY 到达后悬停（holdDur null=常驻 / 数值=停留后 chargeVy 冲锋）
  function formationUnitPos(u, t) {
    const tt = t - (u.t0 || 0);
    if (tt < 0) return null;
    if (u.holdY == null) return { x: u.x + u.vx * tt, y: u.y + u.vy * tt };
    const tHold = (u.holdY - u.y) / u.vy;
    if (tt < tHold) return { x: u.x + u.vx * tt, y: u.y + u.vy * tt };
    const xh = u.x + u.vx * tHold;
    if (u.holdDur == null || tt < tHold + u.holdDur) return { x: xh, y: u.holdY, hold: true };
    return { x: xh, y: u.holdY + (tt - tHold - u.holdDur) * (u.chargeVy || 460) };
  }

  function drawFormationFrame(ts) {
    fPrev.raf = 0;
    if (fPrev.popup.classList.contains('hidden')) return;
    fPrev.raf = requestAnimationFrame(drawFormationFrame);
    const dt = fPrev.last ? Math.min(0.05, (ts - fPrev.last) / 1000) : 0;
    fPrev.last = ts;
    fPrev.t = (fPrev.t + dt) % fPrev.period;
    const pctx = fPrev.pctx, W = CANVAS_W, H = CANVAS_H, s = FORMATION_CW / W;
    // mini 战场：底色 + 网格
    pctx.clearRect(0, 0, FORMATION_CW, FORMATION_CH);
    pctx.fillStyle = 'rgba(9, 13, 28, 0.92)';
    pctx.fillRect(0, 0, FORMATION_CW, FORMATION_CH);
    pctx.strokeStyle = 'rgba(120, 180, 255, 0.08)';
    pctx.lineWidth = 1;
    pctx.beginPath();
    for (let gx = 60; gx < W; gx += 60) { pctx.moveTo(gx * s, 0); pctx.lineTo(gx * s, FORMATION_CH); }
    for (let gy = 60; gy < H; gy += 60) { pctx.moveTo(0, gy * s); pctx.lineTo(FORMATION_CW, gy * s); }
    pctx.stroke();
    // 路线（虚线）：直线队画沿飞行方向的长线；悬停队画 下落→悬停点→冲锋方向
    pctx.strokeStyle = 'rgba(124, 231, 255, 0.30)';
    pctx.setLineDash([3, 5]);
    pctx.beginPath();
    for (const u of fPrev.units) {
      pctx.moveTo(u.x * s, u.y * s);
      if (u.holdY != null) {
        pctx.lineTo(u.x * s, u.holdY * s);
        pctx.lineTo(u.x * s, (u.holdY + 260) * s);   // 悬停型同样向下示意（离场方向）
      } else {
        pctx.lineTo((u.x + u.vx * 12) * s, (u.y + u.vy * 12) * s);
      }
    }
    pctx.stroke();
    pctx.setLineDash([]);
    // 玩家参考点（底部中央小三角）
    const px = W / 2 * s, py = (H - 90) * s;
    pctx.fillStyle = 'rgba(234, 246, 255, 0.45)';
    pctx.beginPath();
    pctx.moveTo(px, py - 7); pctx.lineTo(px - 5, py + 5); pctx.lineTo(px + 5, py + 5);
    pctx.closePath(); pctx.fill();
    // 单位：入场前不画、出界不画；悬停中画呼吸圈
    for (const u of fPrev.units) {
      const p = formationUnitPos(u, fPrev.t);
      if (!p || p.y < -46 || p.y > H + 46 || p.x < -60 || p.x > W + 60) continue;
      const dw = u.spr.world * s;
      if (p.hold) {
        pctx.strokeStyle = 'rgba(124, 231, 255, 0.4)';
        pctx.lineWidth = 1;
        pctx.beginPath();
        pctx.arc(p.x * s, p.y * s, (dw / 2 + 3) * (1 + 0.12 * Math.sin(fPrev.t * 5)), 0, Math.PI * 2);
        pctx.stroke();
      }
      pctx.drawImage(u.spr.off, p.x * s - dw / 2, p.y * s - dw / 2, dw, dw);
    }
  }

  function showFormationPreview(f, ev) {
    ensureFormationPopup();
    if (fPrev.hideTimer) { clearTimeout(fPrev.hideTimer); fPrev.hideTimer = null; }
    fPrev.units = f.sim().map(u => ({ ...u, spr: infoSprite(u.ency) }));
    fPrev.period = f.period;
    fPrev.t = 0; fPrev.last = 0;
    fPrev.titleEl.textContent = f.name + ' · 编队演示';
    fPrev.subEl.textContent = f.note;
    fPrev.popup.classList.remove('hidden');
    moveFormationPopup(ev);
    if (!fPrev.raf) fPrev.raf = requestAnimationFrame(drawFormationFrame);
  }

  // 延迟隐藏：留 120ms 缓冲供鼠标移入浮层（浮层 mouseenter 取消隐藏，可驻留观察）
  function hideFormationPreview() {
    if (!fPrev.popup || fPrev.popup.classList.contains('hidden')) return;
    if (fPrev.hideTimer) clearTimeout(fPrev.hideTimer);
    fPrev.hideTimer = setTimeout(() => {
      fPrev.hideTimer = null;
      fPrev.popup.classList.add('hidden');
      if (fPrev.raf) { cancelAnimationFrame(fPrev.raf); fPrev.raf = 0; }
    }, 120);
  }

  // 编队行悬停钩子（infoFormationRows → buildWeightTable 绑定）
  function formationHover(f) {
    return {
      enter: ev => showFormationPreview(f, ev),
      move: ev => moveFormationPopup(ev),
      leave: () => hideFormationPreview(),
    };
  }

  // 权重表构建：rows = [{ canvas, label, vals, fmt?, disp?, btn? }]，vals 为数值数组（null = 未解锁/未生效，显示「—」）
  // fmt 为该行数值格式化函数（默认 fmtInfoW）；disp 为可选自定义展示文本（波次行 a~b 区间）；
  // btn 为可选行尾按钮元素（波次行的「试波」），表头需同步补一列（见 renderInfoWeights 波次分支）
  function buildWeightTable(headers, rows) {
    const table = document.createElement('table');
    table.className = 'info-table';
    const thead = document.createElement('tr');
    for (const h of headers) {
      const th = document.createElement('th');
      th.textContent = h;
      thead.appendChild(th);
    }
    table.appendChild(thead);
    for (const r of rows) {
      const fmt = r.fmt || fmtInfoW;
      const tr = document.createElement('tr');
      if (r.hover) {
        // 编队行悬停演示：进场弹出 / 移动跟随 / 离场延迟隐藏
        tr.classList.add('hoverable');
        tr.addEventListener('mouseenter', ev => r.hover.enter(ev, tr));
        tr.addEventListener('mousemove', ev => r.hover.move(ev, tr));
        tr.addEventListener('mouseleave', ev => r.hover.leave(ev, tr));
      }
      const td0 = document.createElement('td');
      td0.className = 'info-ship-cell';
      td0.appendChild(r.canvas);
      const span = document.createElement('span');
      span.textContent = r.label;
      td0.appendChild(span);
      tr.appendChild(td0);
      for (let i = 0; i < r.vals.length; i++) {
        const td = document.createElement('td');
        const v = r.vals[i];
        if (v == null) { td.textContent = '—'; td.className = 'wlocked'; }
        else {
          td.textContent = (r.disp && r.disp[i] != null) ? r.disp[i] : fmt(v);   // disp：自定义展示文本（波次行 a~b 区间）
        }
        tr.appendChild(td);
      }
      if (r.btn) {
        const tdBtn = document.createElement('td');
        tdBtn.appendChild(r.btn);
        tr.appendChild(tdBtn);
      }
      table.appendChild(tr);
    }
    return table;
  }

  function infoAppendNote(text) {
    const note = document.createElement('p');
    note.className = 'info-note';
    note.innerHTML = text;
    infoBody.appendChild(note);
  }

  // 档位脚注公共段：列含义
  const INFO_TIER_NOTE = '各档代表 10 级区间（表头 Lv11 即 Lv11~20）。';

  // 虚象级（1类）行：权重按关卡分档（SIDE_SPAWN_W.low / high，Lv1~10 / Lv11~20）
  function infoSideRows() {
    return INFO_SIDE_KINDS.map(k => ({
      canvas: infoShipCanvas(k.ency),
      label: k.name,
      vals: tierMask(INFO_TIERS.map(t => sideSpawnWeights(t.lv)[k.kind])),
    }));
  }

  // 具象级（2类）行：变体权重（按关卡分档直接取值，Lv1~10 / Lv11~20）
  // + 法术大师A1 / 破片 / 法术矩阵（2类突击艇的出场替换概率）+ 斗志昂扬（升级触发概率）——此四行为概率
  function infoStrikerRows() {
    const rows = [];
    const nameOf = { crimson: '赤红突击艇', amber: '烈橙突击艇', azure: '幽蓝突击艇', violet: '紫晶突击艇', white: '霜白突击艇', dusk: '幽暮突击艇' };
    const encyOf = { crimson: 'striker_crimson', amber: 'striker_amber', azure: 'striker_azure', violet: 'striker_violet', white: 'striker_white', dusk: 'striker_dusk' };
    const weights = INFO_TIERS.map(t => strikerVariantWeights(t.lv));
    for (const v of VARIANTS.striker) {
      rows.push({
        canvas: infoShipCanvas(encyOf[v.id]),
        label: nameOf[v.id],
        vals: tierMask(weights.map(ws => ws.find(x => x.id === v.id).w)),
      });
    }
    // 替换/触发概率行：展示值与 Excel 一致（概率 ×100 显示为权重数字，去掉百分号）
    const rawFmt = v => String(v);
    rows.push({
      canvas: infoShipCanvas('fashiA1'),
      label: '法术大师A1（替换2类）',
      vals: tierMask(INFO_TIERS.map(t => t.lv < 11 ? Math.round(FASHI_A1.spawnLowLv * 100) : Math.round(FASHI_A1.spawnHighLv * 100))),
    });
    rows.push({
      canvas: infoShipCanvas('popian'),
      label: '破片（替换2类）',
      vals: tierMask(INFO_TIERS.map(t => t.lv < 11 ? Math.round(POPIAN.spawnLowLv * 100) : Math.round(POPIAN.spawnHighLv * 100))),
    });
    rows.push({
      canvas: infoShipCanvas('fashiMatrix'),
      label: '法术矩阵（替换2类）',
      vals: tierMask(INFO_TIERS.map(t => t.lv < 11 ? Math.round(FASHI_MATRIX.spawnLowLv * 100) : Math.round(FASHI_MATRIX.spawnHighLv * 100))),
    });
    rows.push({
      canvas: infoShipCanvas('douzhi'),
      label: '斗志昂扬（升级触发）',
      vals: tierMask(INFO_TIERS.map(() => DOUZHI.spawnChance)),
      fmt: rawFmt,   // Excel 原值为小数（0.04），原样展示
    });
    return rows;
  }

  // 真我级（3类）行：槽位权重（普通炮艇三色为独立条目，槽位抽取直接决定涂装；
  // 御4 Lv1~10 由 0→10 线性过渡，表中取各档起始等级值）；0 = 该阶段不出场
  function infoSpecial3Rows() {
    return SPECIAL3_POOL.map(it => ({
      canvas: infoShipCanvas(it.ency),
      label: it.name,
      vals: tierMask(INFO_TIERS.map(t => Math.round(special3Weight(it, t.lv)))),
    }));
  }

   // 诗篇级（4类）行：出场时的变体选取权重（按关卡分档，Lv1~10 wLow / Lv11~20 wHigh）+ 法术阵列的槽位替换权重（Lv11 前 0）
  //   展示值与 Excel 一致（权重数字，无百分号）
  function infoCapitalRows() {
    const rows = INFO_CAPITAL_KINDS.map(k => {
      const v = VARIANTS.capital.find(x => x.id === k.id);
      return {
        canvas: infoShipCanvas(k.ency),
        label: k.name,
        vals: tierMask(INFO_TIERS.map(t => Math.round((t.lv < 11 ? v.wLow : v.wHigh) * 100))),
      };
    });
    rows.push({
      canvas: infoShipCanvas('fashiArray'),
      label: '法术阵列（替换主力舰）',
      vals: tierMask(INFO_TIERS.map(t => t.lv < 11 ? 0 : Math.round(FASHI_ARRAY.slotChance * 100))),
    });
    return rows;
  }

  // 波次编队行：Lv1~10 由 w1→w10 线性过渡（B 档显示 a~b 区间），Lv11~20 恒定 wHigh
  //   disp 存单元格展示文本；hover：悬停行弹出编队演示（mini 战场动画回放入场 / 走位）；btn：整波实测按钮
  function infoFormationRows() {
    return INFO_FORMATIONS.map(f => {
      const cfg = WAVE_FORMATIONS.find(w => w.fn === f.fn);
      const vals = tierMask(INFO_TIERS.map((t, i) => i === 0 ? cfg.w1 : i === 1 ? cfg.wHigh : null));
      const disp = tierMask(INFO_TIERS.map((t, i) => {
        if (i === 0) return cfg.w1 === cfg.w10 ? fmtInfoW(cfg.w1) : fmtInfoW(cfg.w1) + '~' + fmtInfoW(cfg.w10);
        if (i === 1) return fmtInfoW(cfg.wHigh);
        return null;
      }));
      return { canvas: infoShipCanvas(f.ency), label: f.name, vals, disp, hover: formationHover(f), btn: infoWaveTestBtn(f) };
    });
  }

  // 波次行测试按钮（紧凑样式见 style.css .info-table .ency-challenge-btn.wave-test）
  function infoWaveTestBtn(f) {
    const b = document.createElement('button');
    b.className = 'ency-challenge-btn wave-test';
    b.textContent = '测试';
    b.title = '整波实测：场上清空后自动补刷同编队；战斗中按 = 额外追加一整波';
    b.addEventListener('click', ev => { ev.stopPropagation(); startWaveTest(f); });
    return b;
  }

  function renderInfoWeights() {
    hideFormationPreview();
    infoBody.innerHTML = '';
    const chips = document.createElement('div');
    chips.className = 'info-subtabs';
    const defs = [
      { id: 'side',      name: '虚象级' },
      { id: 'striker',   name: '具象级' },
      { id: 'special3',  name: '真我级' },
      { id: 'capital',   name: '诗篇级' },
      { id: 'formation', name: '波次' },
      { id: 'poemWave', name: '诗篇波次' },
    ];
    for (const d of defs) {
      const b = document.createElement('button');
      b.className = 'info-chip' + (infoWeightKind === d.id ? ' active' : '');
      b.textContent = d.name;
      b.addEventListener('click', () => { infoWeightKind = d.id; renderInfoWeights(); });
      chips.appendChild(b);
    }
    infoBody.appendChild(chips);
    const headers = ['飞船', ...INFO_TIERS.map(t => t.label)];

    if (infoWeightKind === 'side') {
      infoBody.appendChild(buildWeightTable(headers, infoSideRows()));
      infoAppendNote(INFO_TIER_NOTE + '常规 1类编队（小组 / 长队 / 斜扫 / 对角奇袭等）中每架按此相对权重抽取构成；权重按关卡分两档（Lv1~10 / Lv11~20）。<b>紫自爆流不混入增生</b>；BOSS 后固定首波不含紫电，其余按权重混入。');
    } else if (infoWeightKind === 'striker') {
      infoBody.appendChild(buildWeightTable(headers, infoStrikerRows()));
      infoAppendNote(INFO_TIER_NOTE + '2类突击艇出场时按变体权重选取涂装，权重按关卡分两档直接取值（Lv1~10：赤红30/烈橙30/幽蓝25/霜白20/幽暮2；Lv11~20：10/10/10/5/5）。法术大师A1 / 破片 / 法术矩阵为 2类突击艇的<b>出场替换概率</b>（判定顺序 A1 → 破片 → 法术矩阵）；斗志昂扬为<b>每次关卡提升</b>时的出现概率（非波次权重，击败 BOSS 的跳变升级不触发）。');
    } else if (infoWeightKind === 'special3') {
      infoBody.appendChild(buildWeightTable(headers, infoSpecial3Rows()));
      infoAppendNote(INFO_TIER_NOTE + '特殊3类<b>随常规波次登场</b>（每波 25% 概率附带一台，按表中权重抽取）。<b>0 表示该阶段不出场</b>；Lv11 以下仅三色炮艇（合计 260） / 先兆者出场，Lv11 起按高权重列抽取。<b>寒霜 / 御4 / 铁砧 同屏同种限 1</b>（场上已有同种则该次不生成），其余特殊3类不限数量。紫晶 / 赤红 / 金曜炮艇为<b>独立条目</b>（紫80 / 赤100 / 金80），抽取直接决定涂装。');
    } else if (infoWeightKind === 'capital') {
      infoBody.appendChild(buildWeightTable(headers, infoCapitalRows()));
      infoAppendNote(INFO_TIER_NOTE + '4类主力舰<b>同屏限 1</b>，由场面压力系统驱动出场，表中为出场时的<b>变体选取权重</b>（按关卡分两档）。苍蓝主力舰 20% 概率带护盾（前 5s 虚化不受伤害、炮弹穿过）。');
    } else if (infoWeightKind === 'poemWave') {
      // 诗篇波次（wip 设计展示）：单一数据源 WAVE_POEM（01-config），游戏逻辑实装后同表驱动（见《诗篇难度修正.md》深度改版 #1）
      const W = WAVE_POEM;
      const tb = document.createElement('table');
      tb.className = 'info-table';
      const mkRow = (k, vHtml) => {
        const tr = document.createElement('tr');
        const tdK = document.createElement('td');
        tdK.textContent = k;
        const tdV = document.createElement('td');
        tdV.innerHTML = vHtml;
        tr.appendChild(tdK); tr.appendChild(tdV);
        tb.appendChild(tr);
      };
      const pct = v => Math.round(v * 100) + '%';
      mkRow('刷怪模式', `每个等级只刷一波：上一波全部击毁/离场后 <b>${W.clearDelay[0]}~${W.clearDelay[1]}s</b> 才刷下一波（不走场面压力系统）；每阶段 <b>${W.wavesPerPhase[0]} 波</b>——第一轮 Lv1~10 → 旧日之歌 / 第二轮 Lv11~20 → 暴风之眼，清波后等级 +1；许凯狗冲刺期固定 <b>1s</b> 一波（冲死 6 波后衔接第 7 波）`);
      mkRow('编队构成', '与「波次」页同一编队权重表按当前等级抽取（组合波 / 特殊3类随波照常）；每波强化参数实装时登记');
      mkRow('4类主力舰', `Lv5 起每波 <b>${pct(W.capitalWaveChance)}</b> 概率随波附带（走常规主力舰/法术阵列选取规则），<b>不再单独槽位刷新</b>，属本波一部分须击毁/离场`);
      mkRow('先兆者附加', W.harbingerExtra.map(t => `Lv${t.lv} 起：<b>${pct(t.one)}</b> × 1 架${t.two ? ` ＋ <b>${pct(t.two)}</b> × 2 架` : ''}`).join('；') + '（互斥阶梯，屏幕靠左/靠右固定横位入场，属本波一部分）');
      mkRow('加血套件', `每 <b>${W.healWaveGap} 波</b>限 1 个；回复量 = 血量上限 <b>×${pct(W.healPct)}</b>（四舍五入：陵落 60→21 / 铜皮夏勇 130→46）`);
      mkRow('得分', `×${W.scoreMul}（波次制总刷怪量大幅减少的补偿）`);
      infoBody.appendChild(tb);
      infoAppendNote(INFO_TIER_NOTE + '诗篇难度当前为 <b>设计中（wip）</b>，本页为设计目标展示；数值登记于仓库根目录《诗篇难度修正.md》，实装时以该文档为准。');
    } else {
      infoBody.appendChild(buildWeightTable(['编队', ...INFO_TIERS.map(t => t.label), '测试'], infoFormationRows()));
      infoAppendNote(INFO_TIER_NOTE + '编队权重分两段：<b>Lv1~10 由 a→b 线性过渡</b>（B 档显示 a~b 区间），<b>Lv11~20 恒定</b>；0 = 该等级不出现。Lv5 起每波有概率追加一个编队（组合波，追加位不含炮艇编队；<b>Lv5~10 概率由 10%→30%、Lv11~20 由 10%→40%</b>），详见「特殊怪物波次」。<b>鼠标悬停编队行</b>可查看编队演示——mini 战场回放代表性入场与走位（实际入场侧 / 构成随机）。点击行内「<b>测试</b>」按钮可整波实测：场上清空后自动补刷同编队，战斗中按 <b>=</b> 额外追加一整波（不清场，可观察多波叠加）。');
    }
  }

  function renderInfoWaves() {
    infoBody.innerHTML = '';
    const cards = [
      // 难度修正：以具象为默认基准描述（数值与 01-config DIFFICULTIES mods 同步）；
      // BOSS 不写单技能细节——真我仅标注"技能加强"，统一修正单独成卡
      { h: '难度修正 · 具象', p: '<b>基准难度</b>。怪物数值、BOSS 与玩家规则均为基准值。<b>掉落判定等级</b>（攻击等级 + 场上升级套件数 + 4×场上暴走道具数）为 <b>1</b> 时：1/2 类道具掉率削减修正<b>失效</b>；判定等级为 <b>2</b> 时效果<b>减弱 50%</b>（1类 ×0.5→×0.75 / 2类 ×0.75→×0.875）；判定等级 ≥3 不减免（BOSS 战 1类波 ×0.3 照常）。' },
      { h: '难度修正 · 虚象', p: '总刷怪量 / 同屏数量约 <b>-50~60%</b>（波次刷新间隔约为具象 <b>×1.8</b>、满场压力基准 <b>×0.75</b>）；非 BOSS 敌机<b>血量 -20%</b>、首次攻击延迟 <b>+0.5~1.8s</b>、攻击间隔 <b>+25%</b>；1/2 类与 BOSS 战 1类波的道具掉率削减修正<b>失效</b>。<b>BOSS：伤害 -40%、技能释放间隔 +50%、不连发同种技能</b>（技能组同基准）。玩家侧：<b>无敌时间 +50%</b>、导弹命中改为<b>固定 50 伤害</b>（取消秒杀 / 80% 血量规则）、<b>受击不掉武器等级</b>、得分 <b>×0.8</b>。' },
      { h: '难度修正 · 真我', p: '<b>非 BOSS 敌人伤害 +35%</b>（弹幕 / 碰撞 / 破片三连发 / 法术正方体 / 暴鸰爆炸 / 焦香灼烧等非 BOSS 结算入口；大型龙卷为暴风之眼召唤物、走 BOSS 侧口径不参与）；<b>炮火先兆者导弹不吃此加成</b>，保底伤害提高至 <b>70</b>（规则仍为 max(保底, 当前血量 80%)）；<b>BOSS 血量 ×1.6</b>；全体 BOSS 受到<b>暴走(Lv5)伤害 -10%</b>（与 BOSS 专属减免取最高、不叠加）；<b>BOSS 技能加强</b>（旧日之歌 / 暴风之眼技能组深度改版，此处不展开）；得分 <b>×1.2</b>；波次刷新间隔约为具象 <b>×0.77</b>（刷怪更密集，总刷怪量约 <b>+30%</b>）。<b>高能爆弹：初始 0 枚、上限 2 枚、对 BOSS 伤害 -25%</b>。<b>掉落判定等级</b>（攻击等级 + 场上升级套件数 + 4×场上暴走道具数）为 <b>1</b> 时：1/2 类道具掉率削减修正<b>失效</b>；判定等级为 <b>2</b> 时效果<b>减弱 50%</b>；判定等级 ≥3 不减免（BOSS 战 1类波 ×0.3 照常）。' },
      { h: '加血套件节流（真我）', p: '任意两次<b>加血套件</b>（普通敌人掉落）之间至少间隔 <b>8s</b>。冷却期内掉落判定照常进行，但加血环节概率变为 <b>50%</b> 且敌人<b>不掉落</b>（改为"预触发"计数）；冷却结束后若预触发 ≥1，击杀的<b>第一个敌人必定掉落一个</b>加血套件（随后计数清零）。每次实际掉落（含 BOSS 战脚本化加血）都会重置 8s 计时。' },
      { h: 'BOSS 统一修正（全难度）', p: 'BOSS 战期间<b>每 6~12s 强制刷新一波 1类</b>（不走压力系统）：击杀<b>不加分、不掉水晶</b>、道具掉率 ×0.3（虚象下该削减失效）。玩家火力 <b>Lv1 对 BOSS 武器伤害 +20%</b>（逆境补偿，高能爆弹不受影响）；进入 BOSS 战<b>重置受击掉级计数</b>（掉级阈值全场景统一 3 次）。' },
      { h: '双编队组合波', p: '<b>Lv5 起</b>有概率在同一波内追加一个编队（追加位不含炮艇编队）：<b>Lv5~10 概率由 10% 线性升至 30%、Lv11~20 由 10% 线性升至 40%</b>。' },
      { h: '法术阵列不限台', p: '4类槽位中<b>主力舰同屏限 1</b>；<b>法术阵列不受限</b>——场上已有法术阵列时仍可继续生成 4 类，但只能生成法术阵列（最多同时 2 台，经慢速强制刷新 + 低概率补出，双阵列较少出现）。' },
      { h: 'BOSS 击败后固定首波', p: '击败 BOSS 后先缓冲 <b>2s</b>，随后固定刷出一波 <b>1类长队</b>——自左或右入场、横穿战场自另一侧离场，本波不含紫电；自首波刷新起 <b>4s</b> 观察期后恢复正常刷怪。2s 与 4s 均不计入关卡推进。' },
      { h: '紫自爆流', p: '左右两侧各 7 架纵列斜扫穿越，以紫电（亡语向下垂直射一发）为主，<b>每波 40%~60% 替换为白影</b>（无攻击）。' },
      { h: '斗志昂扬横穿', p: '每次<b>关卡提升</b>时 4% 概率自屏幕左/右侧横穿一架斗志昂扬（增益无人机，余弦上下浮动）；击毁后我方攻速/弹速翻倍 8s。击败 BOSS 引发的跳变升级不触发。' },
      { h: '闪避无敌衰减', p: '驾驶员的<b>闪避</b>（哈基米大王：暴走期间及结束后 4s 内）触发时<b>不受伤害</b>，但获得的<b>无敌时长仅为正常受击无敌的 70%</b>（具象基准 0.84s；虚象难度的无敌 +50% 加成同步放大）。受击反馈（震屏 / 闪白 / 红晕）照常触发，闪避成功即清零累积加成。' },
    ];
    for (const c of cards) {
      const div = document.createElement('div');
      div.className = 'info-wave-card';
      const h = document.createElement('h4');
      h.textContent = c.h;
      const p = document.createElement('p');
      p.innerHTML = c.p;
      div.append(h, p);
      infoBody.appendChild(div);
    }
  }

  // 特殊修正：受到伤害 / 造成影响的特殊乘区与结算规则（数据与战斗代码同步）
  function renderInfoMods() {
    infoBody.innerHTML = '';
    const cards = [
      { h: '大型龙卷（暴风之眼召唤）', p: '受到<b>战机主武器伤害 -50%</b>、<b>僚机伤害 +150%</b>（弱点：僚机火力）。<b>守愿者弹每次命中判定两次伤害</b>。' },
      { h: '破片', p: '玩家火力 <b>Lv1 / Lv2 时受到 30% / 10% 易伤</b>（受到伤害 ×1.30 / ×1.10，低火力补偿）；主武器与僚机弹均生效，<b>高能爆弹为真实伤害不加成</b>。' },
      { h: '焦香螺旋桨', p: '登场 <b>2s 内受到伤害 -30%</b>（入场保护，主武器与僚机弹幕均生效；高能爆弹为真实伤害不减免）。' },
      { h: '4类主力舰', p: '玩家火力 <b>Lv4 / 暴走(Lv5)</b> 时受到伤害 <b>-15%</b>；俯冲阶段（距悬停高度 ≥90px、速度未明显衰减）额外 <b>-20%</b>。' },
      { h: 'BOSS', p: '玩家火力 <b>Lv1</b> 时对 BOSS 的武器伤害 <b>+20%</b>（逆境补偿）。' },
      { h: '炮火先兆者', p: '护甲对<b>僚机弹幕 -25%</b>（僚机输出打在其身上大打折扣）。' },
      { h: '暴鸰', p: '玩家处于其<b>爆圈预警范围内</b>时，对暴鸰伤害 <b>+35%</b>（无论是否已投弹）。' },
      { h: '御4 金色六边力场', p: '力场内所有敌人受到的<b>非真实伤害 -30%</b>；高能爆弹为真实伤害，无视力场。' },
      { h: '寒霜 冰蓝光圈', p: '圈内玩家<b>射速 -35%、移动速度 -35%</b>（以战机核心位置判定）。' },
      { h: '破片 炮弹', p: '<b>若首发命中，则后两发炮弹无视玩家的无敌效果</b>；若首发未命中而后两发命中，该次无敌时间 -30%。' },
      { h: '导弹', p: '命中伤害：<b>max(60, 当前血量 80%)</b>——低血保底 60、不再直接秒杀，且<b>武器等级 -1</b>（不计入常规受击计数）。量子护盾可消解导弹；虚象难度固定 50 伤害；<b>真我不吃非BOSS增伤</b>，保底提高至 <b>70</b>。' },
      { h: '卫护飞船（增生侧翼艇衍生）', p: '撞击造成的无敌时间仅为常规的 <b>40%</b>（0.48s）。' },
      { h: '高能爆弹', p: '<b>真实伤害</b>：无视御4力场等一切减伤与易伤修正，直接结算；对全场敌人造成 4000 + 目标最大血量 10% 伤害。' },
      { h: '斗志昂扬（增益）', p: '<b>我方攻速 / 弹速翻倍 8s</b>（不可叠加，重复获得刷新时长）。' },
    ];
    for (const c of cards) {
      const div = document.createElement('div');
      div.className = 'info-wave-card';
      const h = document.createElement('h4');
      h.textContent = c.h;
      const p = document.createElement('p');
      p.innerHTML = c.p;
      div.append(h, p);
      infoBody.appendChild(div);
    }
  }

  // ---------- 战机 & 僚机：每秒平均伤害（DPS）表 ----------
  // 火力等级列（1~4 常规 + 5 暴走）；值 = 该等级持续输出 10s 的理论总伤 ÷ 10（即每秒平均伤害）
  const INFO_FIRE_LEVELS = [1, 2, 3, 4, 5];

  // 每秒平均伤害格式化（取整）
  function fmtDps(v) { return String(Math.round(v)); }

  // 战机主炮 DPS：暴走(Lv5) 十射线×双倍伤害；Lv4 含半拍补射 2 发；plane 可选（预留按机型倍率）
  function planeDps(level, plane) {
    // 群星之杀（斩击模型）：单目标 DPS = 每周期斩击次数 × 单击伤害 / 攻击间隔
    if (plane && plane.slashWeapon) {
      const sl = STARSLAYER.levels[level] || STARSLAYER.levels[1];
      return (sl.slashes || 1) * sl.dmg / sl.interval;
    }
    const lvl = WEAPON_LEVELS[level] || WEAPON_LEVELS[1];
    const interval = level === 5 ? BERSERK.interval : lvl.interval;
    let bullets;
    if (level === 5) bullets = 10;                                   // 暴走：十射线双连发
    else {
      bullets = (WEAPON_LINES[level] || WEAPON_LINES[1]).length;
      if (level === 4) bullets += 2;                                 // Lv4：半拍补射 2 发中间弹
    }
    // 单发伤害：常规级走 WEAPON_LEVELS.dmgMul（按各档目标 DPS 配平），暴走走 BERSERK.dmgMul
    const dmgPerBullet = PLAYER_CFG.bulletDamage * (level === 5 ? BERSERK.dmgMul : (lvl.dmgMul || 1));
    const mul = (plane && plane.dmgMulByLevel && plane.dmgMulByLevel[level]) || (plane && plane.dmgMul) || 1;
    return bullets * dmgPerBullet * mul / interval;
  }

  // 僚机 DPS（左右两架合计）：按“连射周期”折算——每周期发 sum(volleys) 发，周期 = 轮间隔 + 冷却
  function wingmanDps(level, wingman) {
    if (!wingman || wingman.empty) return 0;
    // fan 模型（守愿者）：错序扇形，周期=interval、周期内发 count 发；DPS = count*dmg/interval
    if (wingman.weapon && wingman.weapon.kind === 'fan') {
      const cfg = wingman.weapon.levels[level] || wingman.weapon.levels[1];
      return cfg.count * cfg.dmg / cfg.interval;
    }
    // volley 模型（群星允诺）：按“连射周期”折算——每周期发 sum(volleys) 发，周期 = 轮间隔 + 冷却
    const lv = WINGMAN_LEVELS[level] || WINGMAN_LEVELS[1];
    const perCycle = lv.volleys.reduce((a, b) => a + b, 0);
    const cycleTime = (lv.volleys.length - 1) * WINGMAN.volleyGap + lv.interval;
    const lvMul = (wingman.dmgMulByLevel && wingman.dmgMulByLevel[level]) || 1;   // 机型专属等级倍率（构成 80% 等比 DPS 链）
    const dmgPerBullet = WINGMAN.bulletDmg * (level === 5 ? 2 : 1) * lvMul;   // 暴走双倍
    return 2 * perCycle * dmgPerBullet / cycleTime;
  }

  // 行首小预览图：战机复用 paintShip、僚机复用 paintWingman / paintWingmanBulwark（与选机卡同一造型）
  // 全部走 still 静态帧：补画尾焰（游戏内由 drawPlayer / drawWingmen 外层绘制的部分在此静态补画）
  // 并冻结 state.time 驱动的动态特效（流光 / 脉动 / 巡游亮带等）——图鉴预览不应带战斗特效
  function infoFighterCanvas(kind, wingman, plane) {
    const S = 40;
    const cvs = document.createElement('canvas');
    cvs.width = S * DPR; cvs.height = S * DPR;
    cvs.style.width = S + 'px'; cvs.style.height = S + 'px';
    const c = cvs.getContext('2d');
    c.scale(DPR, DPR);
    c.translate(S / 2, S / 2);
    // 静态尾焰（固定长度静帧，配色取游戏内对应常态焰；先于机体绘制 = 与游戏内相同的图层关系）
    const flame = (cx, y0, len, fw, c0, c1, c2) => {
      const fg = c.createLinearGradient(0, y0, 0, y0 + len);
      fg.addColorStop(0, c0); fg.addColorStop(0.5, c1); fg.addColorStop(1, c2);
      c.fillStyle = fg;
      c.beginPath();
      c.moveTo(cx - fw, y0); c.lineTo(cx, y0 + len); c.lineTo(cx + fw, y0);
      c.closePath(); c.fill();
    };
    if (kind === 'plane') { c.scale(0.5, 0.5); paintShip(c, 0, plane || currentPlane, 0, true); }   // still：paintShip 内补画尾焰（原调用缺省 still=false：无尾焰，无垠战机还会吃到动态流光特效）
    else if (wingman && wingman.weapon && wingman.weapon.kind === 'fan') {
      // 守愿者：冷蓝机体 + 前方白盾（缩小以容纳盾）；左右反转与选机卡一致
      // 盾弧向外侧扫 110°（镜像后甩向一边），按盾+本体 bbox 平移回画布中心
      c.scale(-0.62 * BULWARK.scale, 0.62 * BULWARK.scale); c.translate(-13.6, 12.75);
      flame(3, 5, 16.6, 3, 'rgba(190, 225, 255, 0.9)', 'rgba(120, 185, 255, 0.5)', 'rgba(70, 140, 230, 0)');   // 壁垒常态焰：焰根对齐本体中线 x=+3
      paintWingmanBulwark(c, 1, false, 0.25, true);
    }
      else {
        c.scale(-0.95, 0.95);   // 左右反转，与选机卡一致
        flame(0, 8, 11, 3, 'rgba(190, 170, 255, 0.9)', 'rgba(140, 120, 255, 0.5)', 'rgba(110, 90, 230, 0)');   // 僚机常态紫焰
        paintWingman(c, 1, false, true);   // still 冻结相位（原调用误传第 5 参——签名仅 4 参，still 未生效）
      }
    return cvs;
  }

  // DPS 表构建（行首预览 + 名称，列为火力等级；canvas 可选——副武器参数表无预览图）
  function buildDpsTable(headers, rows) {
    const table = document.createElement('table');
    table.className = 'info-table';
    const thead = document.createElement('tr');
    for (const h of headers) {
      const th = document.createElement('th');
      th.textContent = h;
      thead.appendChild(th);
    }
    table.appendChild(thead);
    for (const r of rows) {
      const fmt = r.fmt || fmtDps;
      const tr = document.createElement('tr');
      const td0 = document.createElement('td');
      td0.className = 'info-ship-cell';
      if (r.canvas) td0.appendChild(r.canvas);
      const span = document.createElement('span');
      span.textContent = r.label;
      td0.appendChild(span);
      tr.appendChild(td0);
      for (const v of r.vals) {
        const td = document.createElement('td');
        td.textContent = v == null ? '—' : fmt(v);
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    return table;
  }

  function renderInfoPlanes() {
    infoBody.innerHTML = '';
    const headers = ['战机 / 僚机', ...INFO_FIRE_LEVELS.map(lv => lv === 5 ? 'Lv5 暴走' : 'Lv' + lv)];
    const rows = [];
    // 战机（主炮）：注册表驱动，新增机型自动追加行
    for (const id in PLANES) {
      const p = PLANES[id];
      rows.push({
        canvas: infoFighterCanvas('plane', null, p),
        label: p.name + '（主炮）',
        vals: INFO_FIRE_LEVELS.map(lv => planeDps(lv, p)),
      });
    }
    // 僚机（左右两架合计）：注册表驱动，新增僚机自动追加行
    for (const id in WINGMEN_CFG) {
      const wm = WINGMEN_CFG[id];
      if (wm.empty) continue;
      rows.push({
        canvas: infoFighterCanvas('wingman', wm),
        label: wm.name + '（双僚机）',
        vals: INFO_FIRE_LEVELS.map(lv => wingmanDps(lv, wm)),
      });
    }
    infoBody.appendChild(buildDpsTable(headers, rows));
    infoAppendNote('表中数值为<b>每秒平均伤害（DPS）</b> = 该火力等级下持续输出 10s 的理论总伤 ÷ 10。<b>战机</b>行为主炮单独输出，<b>僚机</b>行为左右两架合计；均为<b>裸伤</b>（不含敌方减伤 / 易伤、御4 力场、斗志昂扬攻速翻倍等战斗修正）。暴走（Lv5）为限时 6s 强化形态，此处按其伤害 / 射速持续计算。');
  }

  // ---------- 护甲：ARMORS 注册表驱动（desc 详细数值文案；与主菜单卡片简短文案 brief 区分） ----------
  function renderInfoArmors() {
    infoBody.innerHTML = '';
    for (const id in ARMORS) {
      const a = ARMORS[id];
      const div = document.createElement('div');
      div.className = 'info-wave-card';
      const h = document.createElement('h4');
      const glyph = document.createElement('span');
      if (a.sym) glyph.className = 'glyph-sym';   // ∞（洄）字形换 Corbel 修左右不对称
      glyph.textContent = a.glyph + ' ';
      glyph.style.color = a.color;
      h.append(glyph, document.createTextNode(a.name + (a.default ? '（默认）' : '')));
      const p = document.createElement('p');
      p.innerHTML = a.desc;
      div.append(h, p);
      infoBody.appendChild(div);
    }
  }

  // ---------- 副武器：SUB_WEAPONS 注册表驱动（desc 详细数值文案；与主菜单卡片简短文案 brief 区分） ----------
  // 副武器按火力等级取参（fire.levels 键控）
  function subWeaponLv(w, lv) {
    return w.fire.levels[lv] || w.fire.levels[1];
  }
  // 副武器裸 DPS：常规弹 = 弹数 × 单发伤害 ÷ 间隔；捣蛋来袭 / 辛国栋之怒 = 表内标注 DPS（灼烧按持续触及单一敌人计）
  function subWeaponDps(w, lv) {
    const c = subWeaponLv(w, lv);
    if (c.dps != null) return c.dps;
    return (c.count || 1) * c.dmg / c.interval;
  }
  // 关键参数行（字符串单元格；数值全部取自注册表，调整 01-config 即自动同步）
  function pushSubParamRows(rows, w) {
    const vals = sel => INFO_FIRE_LEVELS.map(lv => { const c = subWeaponLv(w, lv); return sel(c); });
    const fmt = v => v;
    const kind = w.fire.kind;
    if (kind === 'feijian') {
      rows.push({ label: w.name + '·单发伤害', fmt, vals: vals(c => String(c.dmg)) });
      rows.push({ label: w.name + '·剑数 / 间隔(s)', fmt, vals: vals(c => `${c.count} / ${c.interval}`) });
    } else if (kind === 'jixing') {
      rows.push({ label: w.name + '·单发伤害', fmt, vals: vals(c => String(c.dmg)) });
      rows.push({ label: w.name + '·激光数 / 间隔(s)', fmt, vals: vals(c => `${c.count} / ${c.interval}`) });
    } else if (kind === 'daodan') {
      // 与大狗导弹完全同款：直击 / 溅射 / 半径取 PILOTS.dagou，等级只改发射间隔；连射链与大狗同款（伤害逐波 ×chainDmgMul）
      const d = PILOTS.dagou;
      rows.push({ label: w.name + '·爆炸（直击+溅射） / 半径', fmt, vals: INFO_FIRE_LEVELS.map(() => `${d.directDmg}+${d.splashDmg} / ${d.blastR}（大狗同款）`) });
      rows.push({ label: w.name + '·发射间隔(s)', fmt, vals: vals(c => String(c.interval)) });
      rows.push({ label: w.name + '·连射链', fmt, vals: INFO_FIRE_LEVELS.map(() => `每发 ${Math.round(d.chainChance * 100)}% 概率 ${d.chainGap}s 后连射，伤害 ×${d.chainDmgMul}/波`) });
    } else if (kind === 'xinring') {
      rows.push({ label: w.name + '·灼烧 DPS', fmt, vals: vals(c => String(c.dps)) });
      rows.push({ label: w.name + '·半径 / 间隔(s)', fmt, vals: vals(c => `${c.r} / ${c.interval}`) });
    }
  }

  function renderInfoSubs() {
    infoBody.innerHTML = '';
    for (const id in SUB_WEAPONS) {
      const w = SUB_WEAPONS[id];
      const div = document.createElement('div');
      div.className = 'info-wave-card';
      const h = document.createElement('h4');
      const glyph = document.createElement('span');
      if (w.iconSvg) {
        glyph.className = 'glyph-svg';   // 矢量图标（焰环 / 狗耳导弹）：内联 SVG，辉光走注册色
        glyph.innerHTML = w.iconSvg;
      } else {
        glyph.textContent = w.glyph || '□';   // 标题空格移入下方文本节点：应用 glyphTransform 旋转时避免空格参与变形
        if (w.glyphTransform) { glyph.style.display = 'inline-block'; glyph.style.transform = w.glyphTransform; }   // 与主菜单卡片同形（† 倒转+加宽）
        if (w.glyphBold) glyph.style.fontWeight = '700';   // 无界飞剑：线条增粗
      }
      glyph.style.color = w.color || '#9fb4d8';
      h.append(glyph, document.createTextNode(' ' + w.name + (w.default ? '（默认）' : '')));
      const p = document.createElement('p');
      p.innerHTML = w.desc;
      div.append(h, p);
      infoBody.appendChild(div);
    }
    // ---------- 对比表格：裸 DPS（Lv1~Lv5）+ 关键参数（数值取自 SUB_WEAPONS 注册表，调整配置自动同步） ----------
    const headers = ['副武器', ...INFO_FIRE_LEVELS.map(lv => lv === 5 ? 'Lv5 暴走' : 'Lv' + lv)];
    const dpsRows = [];
    const paramRows = [];
    for (const id in SUB_WEAPONS) {
      const w = SUB_WEAPONS[id];
      dpsRows.push({ label: w.name, vals: INFO_FIRE_LEVELS.map(lv => subWeaponDps(w, lv)) });
      pushSubParamRows(paramRows, w);
    }
    infoBody.appendChild(buildDpsTable(headers, dpsRows));
    infoBody.appendChild(buildDpsTable(['副武器 / 参数', ...INFO_FIRE_LEVELS.map(lv => lv === 5 ? 'Lv5' : 'Lv' + lv)], paramRows));
    infoAppendNote('表中为<b>裸数值</b>（不含敌方减伤 / 易伤、大无垠之王增伤、极夜流光对 4类 +50% 增伤等战斗修正）。副武器攻速远低于主炮（主炮 Lv4 间隔 0.12s）。<b>辛国栋之怒</b>为恒速穿透灼烧：表中 DPS 为火环持续触及单个敌人时的每秒伤害（每 0.1s 结算一次）；<b>捣蛋来袭</b>与大狗导弹完全同款（600 溅射 / 低区直击 200，表中 DPS 按爆炸伤害折算；每发发射后 10% 概率 0.3s 后连射一发，连射弹同样可继续连射、伤害一律为正常导弹的 60%（固定不递减））；<b>极夜流光</b>激光可穿透 1 个非 BOSS / 非 4类敌人。<b>无界飞剑</b>发射位置均分屏幕宽度，每剑仅命中首个敌人（暴走 50% 概率穿透一次）。暴走（Lv5）为限时形态。');
  }

  // ---------- 驾驶员：PILOTS 注册表驱动（desc 详细机制文案；与主菜单卡片简短文案 brief 区分） ----------
  function renderInfoPilots() {
    infoBody.innerHTML = '';
    for (const id in PILOTS) {
      const p = PILOTS[id];
      if (p.empty) continue;   // 「无驾驶员」为同名互斥的内部回退值，不作条目展示
      const div = document.createElement('div');
      div.className = 'info-wave-card info-pilot-card';
      const h = document.createElement('h4');
      const glyph = document.createElement('span');
      if (p.iconSvg) {
        glyph.className = 'glyph-svg';   // 矢量图标（陵落彼岸花）：内联 SVG，currentColor 继承注册色
        glyph.innerHTML = p.iconSvg;
      } else {
        glyph.textContent = p.glyph;   // 空格不放 span 内：glyphTransform 旋转时避免空格参与变形（与副武器页同做法）
        if (p.glyphTransform) { glyph.style.display = 'inline-block'; glyph.style.transform = p.glyphTransform; }   // 胡笛客 ω 倒转 180°，与主菜单卡片同形
        if (p.glyphBold) glyph.style.fontWeight = '700';
      }
      glyph.style.color = p.color;
      h.append(glyph, document.createTextNode(' ' + p.name   // 字形与名称间留一个空格（与护甲页同格式）
        + (p.slot === 'main' ? '（主驾驶员' : '（副驾驶员')
        + (p.default ? '·默认）' : '）')));
      const body = document.createElement('p');
      body.innerHTML = p.desc;
      div.append(h, body);
      infoBody.appendChild(div);
    }
    infoAppendNote('主 / 副驾驶员各装备一名、效果同时生效（同名不可同时占据两槽）。默认主驾驶员大狗、副驾驶员小艺。天秀忧郁王子、陵落技能均按 <b>Q</b> 释放，左下角量表显示充能 / 冷却。');
  }

  // ---------- 测试1 页签（开发专用，数值与机制图鉴内）----------
  // 水晶样式定稿预览：雷译正视图（静态）+ 3D 旋转对照 + 原石（巨型改版）+ 压力实测（生产精灵路线）。
  // 并行约定：本窗口维护；动画仅在测试1 展示期间运行（切走 / 关弹窗即停排）。
  // 配色：三色体系（原青 #39C5BB + 水蓝 #46AAFF + 粉 #FFC0CB），巨型双色 #39C5BB / #FFC0CB。

  const THUNDER_BASES = ['#39c5bb', '#46aaff', '#ffc0cb'];
  const THUNDER_GLOWS = ['#4dd0ff', '#3a86f0', '#ff9fc8'];   // 各行光效色（青·原 / 水蓝·新 / 粉·新）——水蓝 2026-09-27 定稿调深（#6fb9ff → #3a86f0）
  const CRYSTAL3D_FRAMES_PREVIEW = 24;                 // 旋转对照的量化步进（24 帧/圈）
  let xtalSpinFrames = 24;                             // 顶部 chip 可切 24/16（16 = 22.5°/帧 粗糙对照）

  const XTAL_SPIN = Math.PI * 2;    // 自转角速度：1s 一整圈（360°/s）
  const xtalRgb = hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  function xtalShade(base, k, to) {   // 颜色向白（'w'）或黑（'b'）推进（返回 hex）
    const [r, g2, b] = xtalRgb(base);
    const t = to === 'w' ? 255 : 0;
    const m = v => Math.round(v + (t - v) * k);
    return '#' + [m(r), m(g2), m(b)].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function xtalMixHex(a, b, k) {   // 两个 hex 颜色插值（返回 hex）
    const A = xtalRgb(a), B = xtalRgb(b);
    return '#' + [0, 1, 2].map(i => Math.round(A[i] + (B[i] - A[i]) * k).toString(16).padStart(2, '0')).join('');
  }
  function xtalMix(lo, hi, k) {   // rgb 数组插值（返回 rgb() 字符串）
    return 'rgb(' + Math.round(lo[0] + (hi[0] - lo[0]) * k) + ',' + Math.round(lo[1] + (hi[1] - lo[1]) * k) + ',' + Math.round(lo[2] + (hi[2] - lo[2]) * k) + ')';
  }
  function xtalPolyPath(g, pts) {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
  }
  function xtalVGrad(g, r, c) {   // 面内纵向渐变（上亮下深）
    const gr = g.createLinearGradient(0, -r, 0, r);
    gr.addColorStop(0, c.hi);
    gr.addColorStop(1, c.lo);
    return gr;
  }

  // 雷译三档正面绘制核心（在原点作画，静态行 / 3D 旋转行共用；gk = 辉光呼吸系数）
  function paintThunderSmall(g, c, gk) {   // 小：尖顶六边形刻面宝石（中央刻面亮带、无描边）
    const H = c.r * 1.2, W = c.r * 0.58;
    const hex = [[0, -H], [W, -H * 0.45], [W, H * 0.45], [0, H], [-W, H * 0.45], [-W, -H * 0.45]];
    g.save();
    g.shadowColor = c.glow;
    g.shadowBlur = 12 * gk;
    g.fillStyle = xtalVGrad(g, H, c);
    xtalPolyPath(g, hex);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,0.35)';   // 中央刻面亮带
    xtalPolyPath(g, hex.map(p => [p[0] * 0.45, p[1] * 0.9]));
    g.fill();
    g.restore();
  }

  function paintThunderMedium(g, c, gk) {   // 中：偏白八角外框（白混本色 0.18，2026-09-27 减白避免过于显眼）+ 有色环带 + 竖长白芯（左上高光径向）
    const w0 = c.r * 0.78, hh0 = c.r, ch = c.r * 0.36;
    const fw = c.r * 0.27;
    const iw = w0 - fw, ihh = hh0 - fw, icc = Math.max(2.5, ch - fw * 0.7);
    const S = iw + ihh - icc;
    const cw = S / 3.0, chh = S / 2;   // 白芯宽度（2026-09-27 粉中定稿：S/2.9 回调至 S/3.0，仍大于原 S/3.1）
    const oct = (hw, hh, cc2) => [
      [-(hw - cc2), -hh], [hw - cc2, -hh], [hw, -(hh - cc2)], [hw, hh - cc2],
      [hw - cc2, hh], [-(hw - cc2), hh], [-hw, hh - cc2], [-hw, -(hh - cc2)],
    ];
    g.save();
    g.shadowColor = '#e8f4ff';
    g.shadowBlur = 10 * gk;
    g.fillStyle = xtalMixHex('#f4f8ff', c.base, 0.18);
    g.beginPath();
    oct(w0, hh0, ch).forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    oct(iw, ihh, icc).forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
    g.fill('evenodd');
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(150, 175, 210, 0.5)';
    g.lineWidth = 1;
    xtalPolyPath(g, oct(w0, hh0, ch)); g.stroke();
    xtalPolyPath(g, oct(iw, ihh, icc)); g.stroke();
    g.shadowColor = c.glow;
    g.shadowBlur = 9 * gk;
    g.fillStyle = xtalVGrad(g, ihh, c);
    g.beginPath();
    oct(iw, ihh, icc).forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.rect(-cw, -chh, cw * 2, chh * 2);
    g.closePath();
    g.fill('evenodd');
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,0.88)';
    g.fillRect(-cw, -chh, cw * 2, chh * 2);
    g.restore();
  }

  function paintThunderLarge(g, c, gk) {   // 大：近全白菱形外框（白混本色 0.12，仅略微偏色）+ 四向斜边梯形 + 白心减弱的正方形前面（2026-09-27 降亮显色）
    const R = c.r, a = R * 0.42, b = R * 0.16;
    const Rin = R * 0.875;
    const dia = r => [[0, -r], [r, 0], [0, r], [-r, 0]];
    // 板周 aura 垫层（2026-09-27：蓝色大档板周光效不明显，lighter 光晕按行光色提亮，各色通用）
    const gc = xtalRgb(c.glow);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const au = g.createRadialGradient(0, 0, a * 0.5, 0, 0, a * 2.1);
    au.addColorStop(0, `rgba(${gc[0]},${gc[1]},${gc[2]},0.5)`);
    au.addColorStop(0.55, `rgba(${gc[0]},${gc[1]},${gc[2]},0.28)`);
    au.addColorStop(1, `rgba(${gc[0]},${gc[1]},${gc[2]},0)`);
    g.fillStyle = au;
    g.fillRect(-a * 2.1, -a * 2.1, a * 4.2, a * 4.2);
    g.restore();
    g.save();
    g.shadowColor = c.glow;
    g.shadowBlur = 14 * gk;
    g.fillStyle = c.lo;
    for (let q = 0; q < 4; q++) {
      g.save();
      g.rotate(q * Math.PI / 2);
      xtalPolyPath(g, [[-a, -a], [a, -a], [a - b, -a - b], [-(a - b), -a - b]]);
      g.fill();
      g.restore();
    }
    g.shadowBlur = 0;
    g.shadowColor = c.glow;
    g.shadowBlur = 46 * gk;
    g.fillStyle = c.lo;
    g.fillRect(-a, -a, a * 2, a * 2);
    g.shadowBlur = 0;
    g.shadowColor = '#e8f4ff';
    g.shadowBlur = 10 * gk;
    g.fillStyle = xtalMixHex('#f4f8ff', c.base, 0.12);
    g.beginPath();
    dia(R).forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    dia(Rin).forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
    g.fill('evenodd');
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(150, 175, 210, 0.6)';
    g.lineWidth = 1;
    xtalPolyPath(g, dia(R)); g.stroke();
    xtalPolyPath(g, dia(Rin)); g.stroke();
    const wg = g.createRadialGradient(0, 0, 0, 0, 0, a * 1.35);
    wg.addColorStop(0, 'rgba(255,255,255,0.5)');
    wg.addColorStop(0.55, 'rgba(255,255,255,0.36)');
    wg.addColorStop(1, 'rgba(255,255,255,0.08)');
    g.fillStyle = wg;
    g.fillRect(-a, -a, a * 2, a * 2);
    g.restore();
  }

  // 三档 3D 实体（单位空间；小＝四棱锥+腰带+四棱锥，中＝长方体，大＝正方板；框体 strict 跳过质心翻向）
  const THUNDER_SOLIDS = {
    small: {
      verts: [
        [-0.58, -0.54, -0.25], [0.58, -0.54, -0.25], [0.58, -0.54, 0.25], [-0.58, -0.54, 0.25],
        [-0.58, 0.54, -0.25], [0.58, 0.54, -0.25], [0.58, 0.54, 0.25], [-0.58, 0.54, 0.25],
        [0, -1.2, 0], [0, 1.2, 0],
      ],
      scale: [1, 1, 1],
      faces: [
        [8, 0, 1], [8, 1, 2], [8, 2, 3], [8, 3, 0],
        [9, 5, 4], [9, 6, 5], [9, 7, 6], [9, 4, 7],
        [3, 2, 6, 7], [1, 0, 4, 5], [2, 1, 5, 6], [0, 3, 7, 4],
      ],
      strict: false,
    },
    mid: {
      verts: [
        [-0.56, -0.72, -0.225], [0.56, -0.72, -0.225], [0.56, 0.72, -0.225], [-0.56, 0.72, -0.225],
        [-0.56, -0.72, 0.225], [0.56, -0.72, 0.225], [0.56, 0.72, 0.225], [-0.56, 0.72, 0.225],
      ],
      scale: [1, 1, 1],
      faces: [
        [4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3], [4, 5, 1, 0],
      ],
      strict: false,
    },
    big: {
      verts: [
        [-0.42, -0.42, 0.25], [0.42, -0.42, 0.25], [0.42, 0.42, 0.25], [-0.42, 0.42, 0.25],
        [-0.42, -0.42, -0.25], [0.42, -0.42, -0.25], [0.42, 0.42, -0.25], [-0.42, 0.42, -0.25],
      ],
      scale: [1, 1, 1],
      faces: [
        [0, 1, 2, 3], [5, 4, 7, 6], [5, 1, 2, 6], [0, 4, 7, 3], [3, 2, 6, 7], [4, 5, 1, 0],
      ],
      strict: false,
    },
  };

  const THUNDER_WASHER = (() => {   // 大：菱形白框（外 1 / 内 0.8，厚 0.125 = 板厚 25%）
    const o = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const i = o.map(p => [p[0] * 0.8, p[1] * 0.8]);
    const t = 0.0625;
    const verts = [
      ...o.map(p => [p[0], p[1], t]), ...o.map(p => [p[0], p[1], -t]),
      ...i.map(p => [p[0], p[1], t]), ...i.map(p => [p[0], p[1], -t]),
    ];
    const faces = [];
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      faces.push([k + 4, k2 + 4, k2, k]);
      faces.push([8 + k, 8 + k2, 12 + k2, 12 + k]);
      faces.push([k, k2, 8 + k2, 8 + k]);
      faces.push([4 + k, 12 + k, 12 + k2, 4 + k2]);
    }
    return { verts, scale: [1, 1, 1], faces, strict: true };
  })();

  const THUNDER_WASHER_OCT = (() => {   // 中：八角白框（厚 = 核心厚 40%）
    const w0 = 0.78, hh0 = 1, ch = 0.36, s = 0.72, t = 0.09;
    const o = [
      [-(w0 - ch), -hh0], [w0 - ch, -hh0], [w0, -(hh0 - ch)], [w0, hh0 - ch],
      [w0 - ch, hh0], [-(w0 - ch), hh0], [-w0, hh0 - ch], [-w0, -(hh0 - ch)],
    ];
    const i = o.map(p => [p[0] * s, p[1] * s]);
    const verts = [
      ...o.map(p => [p[0], p[1], t]), ...o.map(p => [p[0], p[1], -t]),
      ...i.map(p => [p[0], p[1], t]), ...i.map(p => [p[0], p[1], -t]),
    ];
    const faces = [];
    for (let k = 0; k < 8; k++) {
      const k2 = (k + 1) % 8;
      faces.push([k + 8, k2 + 8, k2, k]);
      faces.push([16 + k, 16 + k2, 24 + k2, 24 + k]);
      faces.push([k, k2, 16 + k2, 16 + k]);
      faces.push([8 + k, 24 + k, 24 + k2, 8 + k2]);
    }
    return { verts, scale: [1, 1, 1], faces, strict: true };
  })();

  // 深度排序渲染：全部可见面按深度合并绘制（框与核心穿插处图层正确）
  function xtalDrawThunderSorted(g, solids, r, th, specs, glow, glowBlur) {
    const sn = Math.sin(th), cs = Math.cos(th);
    const L = [-0.4, -0.55, 0.75];
    const faces = [];
    solids.forEach((s, si) => {
      const spec = specs[si];
      const rot = s.verts.map(v => [v[0] * cs + v[2] * sn, v[1], -v[0] * sn + v[2] * cs]);
      const P = rot.map(p => {
        const pw = 1 / (1 - p[2] * 0.06);
        return [p[0] * pw * r, p[1] * pw * r];
      });
      for (let fi = 0; fi < s.faces.length; fi++) {
        const f = s.faces[fi];
        const a = rot[f[0]], b = rot[f[1]], cc = rot[f[2]];
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const e2 = [cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]];
        let nx = e1[1] * e2[2] - e1[2] * e2[1];
        let ny = e1[2] * e2[0] - e1[0] * e2[2];
        let nz = e1[0] * e2[1] - e1[1] * e2[0];
        const mx = (a[0] + b[0] + cc[0]) / 3, my = (a[1] + b[1] + cc[1]) / 3, mz = (a[2] + b[2] + cc[2]) / 3;
        if (!s.strict && nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        if (nz <= 0.02) continue;
        const nl = Math.hypot(nx, ny, nz) || 1;
        const shade = 0.38 + 0.62 * Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / nl);
        let fill;
        const fc = spec.faceColors ? spec.faceColors[fi] : null;
        if (fc && typeof fc === 'object' && fc.grad) fill = { grad: fc.grad, radial: fc.radial };
        else if (fc) fill = xtalMixHex(fc, '#000000', 0.08 - 0.08 * shade);
        else fill = xtalMix(spec.lo, spec.hi, shade);
        faces.push({ pts: f.map(idx => P[idx]), depth: f.reduce((acc, idx) => acc + rot[idx][2], 0) / f.length, fill, noShadow: spec.noShadow });
      }
    });
    faces.sort((p, q) => p.depth - q.depth);
    g.shadowColor = glow;
    for (const f of faces) {
      g.shadowBlur = f.noShadow ? 0 : glowBlur;
      if (f.fill && f.fill.grad) {
        const xs = f.pts.map(p => p[0]), ys = f.pts.map(p => p[1]);
        const gx0 = Math.min(...xs), gy0 = Math.min(...ys), gx1 = Math.max(...xs), gy1 = Math.max(...ys);
        let grd;
        if (f.fill.radial) {
          // 与 09 生产同步：radial true = 左上锚点；'center' = 面几何中心（大档板面纯白居中、四边均匀）
          const rkx = f.fill.radial === 'center' ? 0.5 : 0.3, rky = f.fill.radial === 'center' ? 0.5 : 0.26;
          const cxr = gx0 + (gx1 - gx0) * rkx, cyr = gy0 + (gy1 - gy0) * rky;
          grd = g.createRadialGradient(cxr, cyr, 0, cxr, cyr, Math.max(gx1 - gx0, gy1 - gy0) * 0.95);
        } else grd = g.createLinearGradient(gx0, gy0, gx1, gy1);
        for (const [o, c2] of f.fill.grad) grd.addColorStop(o, c2);
        g.fillStyle = grd;
      } else g.fillStyle = f.fill;
      g.beginPath();
      f.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.closePath();
      g.fill();
    }
    g.shadowBlur = 0;
  }

  // 雷译网格：3 色（行）× 3 档（列）＝ 9 格；tier = 列号
  function thunderGridCols(w, h, t, gridH) {
    const radii = [13, 19, 26];
    const names = ['小', '中', '大'];
    const vals = ['+10', '+60', '+360'];
    const colorNames = ['青·原', '水蓝·新', '粉·新'];
    const cols = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const base = THUNDER_BASES[row];
        cols.push({
          base,
          hi: xtalShade(base, 0.55, 'w'),
          lo: xtalShade(base, 0.18, 'b'),
          glow: THUNDER_GLOWS[row],
          solidLo: xtalShade(base, 0.15, 'b'),
          solidHi: xtalShade(base, 0.18, 'w'),
          label: names[col] + ' ' + vals[col] + ' · ' + colorNames[row],
          tier: col,
          r: radii[col],
          cx: (w * (col + 0.5)) / 3,
          cy: ((gridH || h) * (row * 2 + 1)) / 6 + Math.sin(t * 2 + (row + col) * 0.9) * 2,
        });
      }
    }
    return cols;
  }

  function thunderGridHeads(g, w, h) {   // 行首配色标注
    g.fillStyle = '#8fa2c0';
    g.font = '10px "Segoe UI", "Microsoft YaHei", sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('青 #39C5BB（原）', 8, h / 6);
    g.fillText('水蓝 #46AAFF（新）', 8, h * 0.5);
    g.fillText('粉 #FFC0CB（新）', 8, h * 5 / 6);
  }

  function thunderGridLabels(g, cols) {
    g.fillStyle = '#8fa2c0';
    g.font = '10px "Segoe UI", "Microsoft YaHei", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    for (const c of cols) g.fillText(c.label, c.cx, c.cy + c.r + 12);
  }

  // 静态正视图（3 色 × 3 档）
  function drawXtalThunder(g, w, h, t) {
    const cols = thunderGridCols(w, h, t);
    const painters = [paintThunderSmall, paintThunderMedium, paintThunderLarge];
    for (let i = 0; i < cols.length; i++) {
      g.save();
      g.translate(cols[i].cx, cols[i].cy);
      painters[cols[i].tier](g, cols[i], 0.78 + 0.22 * Math.sin(t * 2.4 + i * 0.7));
      g.restore();
    }
    thunderGridHeads(g, w, h);
    thunderGridLabels(g, cols);
  }

  function xtalRoundRectPath(g, x0, y0, x1, y1, rr) {   // 圆角矩形路径
    g.beginPath();
    g.moveTo(x0 + rr, y0);
    g.lineTo(x1 - rr, y0);
    g.arcTo(x1, y0, x1, y0 + rr, rr);
    g.lineTo(x1, y1 - rr);
    g.arcTo(x1, y1, x1 - rr, y1, rr);
    g.lineTo(x0 + rr, y1);
    g.arcTo(x0, y1, x0, y1 - rr, rr);
    g.lineTo(x0, y0 + rr);
    g.arcTo(x0, y0, x0 + rr, y0, rr);
    g.closePath();
  }

  function xtalConvexHull(pts) {   // 二维凸包（Andrew 单调链）——白框内孔投影裁剪用
    const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const pt of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], pt) <= 0) lo.pop(); lo.push(pt); }
    for (let i = p.length - 1; i >= 0; i--) { const pt = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], pt) <= 0) up.pop(); up.push(pt); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }

  // 3D 旋转对照（深度排序渲染；大档光效垫在实体之下：间隙强光 + 框内高亮 + 内孔柔光环）
  function drawXtalThunderSpin(g, w, h, t) {
    const cols = thunderGridCols(w, h, t, h * 0.66);
    const STEP = (Math.PI * 2) / xtalSpinFrames;
    const facePainters = [paintThunderSmall, paintThunderMedium, paintThunderLarge];
    const gks = [0.78 + 0.22 * Math.sin(t * 2.4), 0.78 + 0.22 * Math.sin(t * 2.4 + 1.1), 0.78 + 0.22 * Math.sin(t * 2.4 + 2.2)];
    for (let i = 0; i < cols.length; i++) {
      const tier = cols[i].tier;
      const col = i % 3;
      const c = cols[i];
      const th = Math.round(((t * XTAL_SPIN + i * 0.53) / STEP) % xtalSpinFrames) * STEP;
      const base = c.base;
      const wK = k => xtalMixHex(base, '#ffffff', k);
      const bK = k => xtalMixHex(base, '#000000', k);
      let solids, specs;
      if (tier === 0) {
        solids = [THUNDER_SOLIDS.small];
        specs = [{ faceColors: [wK(0.85), wK(0.35), wK(0.55), wK(0.35), bK(0.35), bK(0.12), bK(0.3), bK(0.12), wK(0.3), wK(0.22), bK(0.1), bK(0.16)] }];
      } else if (tier === 1) {
        solids = [THUNDER_WASHER_OCT, THUNDER_SOLIDS.mid];
        specs = [
          { lo: xtalRgb(xtalMixHex('#e8f0f8', base, 0.22)), hi: xtalRgb(xtalMixHex('#ffffff', base, 0.1)) },   // 与 09 同步：中档白框减白（0.05/0 → 0.22/0.1，2026-09-27 二次定稿避免过于显眼）
          { faceColors: [
            // 与 09 生产同步：白高光更多更亮（radial 白心 0.5 → 0.6、中心 0.92 → 0.96）；白心范围 0.6 → 0.64（2026-09-27 粉中定稿：0.68 回调）
            { grad: [[0, 'rgba(255,255,255,0.96)'], [0.64, xtalMixHex(base, '#ffffff', 0.3)], [1, xtalMixHex(base, '#000000', 0.28)]], radial: true },
            { grad: [[0, 'rgba(255,255,255,0.96)'], [0.64, xtalMixHex(base, '#ffffff', 0.3)], [1, xtalMixHex(base, '#000000', 0.28)]], radial: true },
            bK(0.12), bK(0.12), base, base,
          ] },
        ];
      } else {
        solids = [THUNDER_WASHER, THUNDER_SOLIDS.big];
        specs = [
          // 与 09 生产同步：大档白框近全白（混入本色 0.18/0.08，仅略微偏色；mid 保持原白）
          { lo: xtalRgb(xtalMixHex('#e8f0f8', base, 0.18)), hi: xtalRgb(xtalMixHex('#ffffff', base, 0.08)) },
          { noShadow: true, faceColors: [
            // 与 09 生产同步：板面降亮显色（白心 0.75、边缘露本色 0.18）、radial 居中锚点（四边均匀）
            { grad: [[0, 'rgba(255,255,255,0.75)'], [0.6, xtalMixHex(base, '#ffffff', 0.45)], [1, xtalMixHex(base, '#ffffff', 0.18)]], radial: 'center' },
            { grad: [[0, 'rgba(255,255,255,0.75)'], [0.6, xtalMixHex(base, '#ffffff', 0.45)], [1, xtalMixHex(base, '#ffffff', 0.18)]], radial: 'center' },
            xtalMixHex(base, '#ffffff', 0.18), xtalMixHex(base, '#ffffff', 0.18), xtalMixHex(base, '#ffffff', 0.18), xtalMixHex(base, '#ffffff', 0.18),
          ] },
        ];
      }
      g.save();
      g.translate(c.cx, c.cy);
      if (tier !== 2) {
        const gr2 = xtalRgb(c.glow);
        const auraR = c.r * (tier === 0 ? 1.7 : 1.45);
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.2 * gks[col];
        const ag = g.createRadialGradient(0, 0, 0, 0, 0, auraR);
        ag.addColorStop(0, `rgba(${gr2[0]},${gr2[1]},${gr2[2]},0.85)`);
        ag.addColorStop(0.55, `rgba(${gr2[0]},${gr2[1]},${gr2[2]},0.35)`);
        ag.addColorStop(1, `rgba(${gr2[0]},${gr2[1]},${gr2[2]},0)`);
        g.fillStyle = ag;
        g.fillRect(-auraR, -auraR, auraR * 2, auraR * 2);
        g.restore();
      }
      xtalDrawThunderSorted(g, solids, c.r, th, specs, c.glow, tier === 2 ? 5 : 8);   // 大档白框辉光调暗（与生产同步）
      if (tier === 2) {
        const cs = Math.cos(th), sn = Math.sin(th);
        const proj = v => {
          const X = v[0] * cs + v[2] * sn, Z = -v[0] * sn + v[2] * cs;
          const pw = 1 / (1 - Z * 0.06);
          return [X * pw * c.r, v[1] * pw * c.r];
        };
        const pv = THUNDER_SOLIDS.big.verts.map(proj);
        const x0 = Math.min(...pv.map(p => p[0])) - 5, x1 = Math.max(...pv.map(p => p[0])) + 5;
        const y0 = Math.min(...pv.map(p => p[1])) - 5, y1 = Math.max(...pv.map(p => p[1])) + 5;
        const rr = Math.min(x1 - x0, y1 - y0) * 0.32;
        const gr2 = xtalRgb(c.glow);
        const rgba = a => `rgba(${gr2[0]},${gr2[1]},${gr2[2]},${a})`;
        const hull = xtalConvexHull(THUNDER_WASHER.verts.slice(8).map(proj));
        const hullMax = Math.max(...hull.map(p => Math.hypot(p[0], p[1])));
        const traceHull = () => {
          g.beginPath();
          hull.forEach((p, i2) => (i2 ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
          g.closePath();
        };
        g.save();
        g.globalCompositeOperation = 'lighter';
        const outerHull = xtalConvexHull(THUNDER_WASHER.verts.slice(0, 8).map(proj));
        g.save();
        g.beginPath();
        outerHull.forEach((p, i2) => (i2 ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.closePath();
        g.clip();
        const rgGap = g.createRadialGradient(0, 0, c.r * 0.3, 0, 0, c.r * 1.05);
        rgGap.addColorStop(0, rgba('0'));
        rgGap.addColorStop(0.42, rgba((0.7 * gks[col]).toFixed(3)));    // 大档间隙光（用户定稿 2026-09-27：本体降亮、光效提亮 0.5 → 0.7）
        rgGap.addColorStop(0.62, rgba((0.45 * gks[col]).toFixed(3)));   // 0.3 → 0.45
        rgGap.addColorStop(1, rgba('0'));
        g.fillStyle = rgGap;
        g.fillRect(-c.r * 1.2, -c.r * 1.2, c.r * 2.4, c.r * 2.4);
        g.restore();
        g.save();
        traceHull();
        g.clip();
        xtalRoundRectPath(g, x0, y0, x1, y1, rr);
        const rg2 = g.createRadialGradient(0, 0, 0, 0, 0, hullMax * 1.02);
        rg2.addColorStop(0, rgba((0.3 * gks[col]).toFixed(3)));   // 框内孔高亮（2026-09-27 光效提亮 0.22 → 0.3）
        rg2.addColorStop(0.62, rgba((0.3 * gks[col]).toFixed(3)));   // 0.5 → 0.3
        rg2.addColorStop(1, rgba('0'));
        g.fillStyle = rg2;
        g.fill();
        g.restore();
        g.save();
        traceHull();
        g.strokeStyle = rgba((0.18 * gks[col]).toFixed(3));   // 内孔光环描边调暗：0.3 → 0.18
        g.lineWidth = 3.5;
        g.shadowColor = rgba('0.7');
        g.shadowBlur = 4;
        g.stroke();
        g.restore();
        g.restore();
      }
      g.restore();
    }
    // 原石（巨型改版）：四芒星双锥 ×2（g0 / g1 翻转配色）——预览走实时矢量绘制（烘焙位图放大发糊，用户反馈），
    // R=23：星尖 1.15×23 ≈ 26 与大型档列视觉一致；tw 传 t = 底光闪动；相位/翻转与烘焙帧口径一致
    const yH = h * 0.8;
    for (const [ck, cx2] of [['g0', w * 0.35], ['g1', w * 0.65]]) {
      g.save();
      g.translate(cx2, yH);
      crystal3DStarDraw(g, t * Math.PI * 2 + (ck === 'g1' ? Math.PI / 2 : 0), ck === 'g1', 23, t);
      g.restore();
    }
    g.fillStyle = '#8fa2c0';
    g.font = '10px "Segoe UI", "Microsoft YaHei", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText('原石（巨型改版 · 四芒星双锥 · 上粉下蓝）——左：g0 / 右：g1（翻转配色）', w / 2, h - 8);
    thunderGridHeads(g, w, h);
    thunderGridLabels(g, cols);
  }

  // ---------- 测试1 动画循环（rAF + 24fps 绘制节流；切走 / 关弹窗即停排）----------
  let testXtalRaf = 0;
  const testXtalItems = [];
  let testXtalT0 = 0;
  let testXtalLastRaf = 0;
  let testXtalLastDraw = 0;

  function startTestXtalLoop() {
    stopTestXtalLoop();
    testXtalT0 = performance.now();
    testXtalLastRaf = testXtalT0;
    testXtalLastDraw = testXtalT0;
    drawTestXtalFrame(testXtalT0);
    if (typeof requestAnimationFrame === 'function') testXtalRaf = requestAnimationFrame(stepTestXtal);
  }

  function stopTestXtalLoop() {
    if (testXtalRaf) { cancelAnimationFrame(testXtalRaf); testXtalRaf = 0; }
  }

  function stepTestXtal(now) {
    const rafDt = Math.min(1000, Math.max(0.5, now - testXtalLastRaf));
    testXtalLastRaf = now;
    for (const it of testXtalItems) it.fps = it.fps ? it.fps * 0.9 + (1000 / rafDt) * 0.1 : 1000 / rafDt;
    if (now - testXtalLastDraw >= 1000 / Math.min(24, xtalSpinFrames)) {
      testXtalLastDraw = now;
      if (!drawTestXtalFrame(now)) return;
    }
    testXtalRaf = requestAnimationFrame(stepTestXtal);
  }

  function drawTestXtalFrame(now) {
    if (infoTab !== 'test1' || infoModal.classList.contains('hidden')) return false;
    const t = (now - testXtalT0) / 1000;
    for (const it of testXtalItems) {
      if (it.cv.isConnected === false) return false;
      fitTestCanvas(it);
      it.g.setTransform(it.dpr, 0, 0, it.dpr, 0, 0);
      it.g.clearRect(0, 0, it.w, it.h);
      it.draw(it.g, it.w, it.h, t, it);
    }
    return true;
  }

  function fitTestCanvas(it) {
    const dpr = 1;
    const w = Math.max(120, Math.round(it.cv.clientWidth || it.cv.offsetWidth || 640));
    const h = Math.max(90, Math.round(it.cv.clientHeight || it.cv.offsetHeight || 150));
    if (it.w !== w || it.h !== h || it.dpr !== dpr) {
      it.w = w; it.h = h; it.dpr = dpr;
      it.cv.width = Math.round(w * dpr);
      it.cv.height = Math.round(h * dpr);
    }
  }

  // 压力实测：150 颗混合档位（生产烘焙精灵 1:1 贴图 + FPS 读数）
  let xtalStressCloud = null;
  function xtalStressItems() {
    if (!xtalStressCloud) {
      let s = 20260926;
      const rnd = () => {
        s |= 0; s = (s + 0x6D2B79F5) | 0;
        let r = Math.imul(s ^ (s >>> 15), 1 | s);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
      const arr = [];
      for (let i = 0; i < 150; i++) {
        const u = rnd();
        arr.push({
          tier: u < 0.55 ? 'small' : (u < 0.8 ? 'mid' : (u < 0.95 ? 'big' : 'giant')),
          fx: 0.04 + rnd() * 0.92,
          fy: 0.08 + rnd() * 0.8,
          phase: rnd(),
          bob: rnd() * Math.PI * 2,
        });
      }
      xtalStressCloud = arr;
    }
    return xtalStressCloud;
  }

  function xtalFpsLabel(g, it, count) {
    g.fillStyle = 'rgba(5, 8, 18, 0.55)';
    g.fillRect(6, 6, 118, 20);
    g.fillStyle = '#eaf2ff';
    g.font = '12px "Segoe UI", "Microsoft YaHei", sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(count + ' 颗 · FPS ' + it.fps.toFixed(1), 12, 16);
  }

  function drawXtalStress(g, w, h, t, it) {
    for (const s of xtalStressItems()) {
      const f = Math.floor((((t + s.phase) % 1) + 1) % 1 * 24) % 24;
      const spr = getCrystal3DSprite(s.tier, 'c0', (t + s.phase) % 1);
      if (!spr) continue;
      const x = Math.round(s.fx * w - spr.width / 2);
      const y = Math.round(s.fy * h + Math.sin(t * 2 + s.bob) * 3 - spr.height / 2);
      g.drawImage(spr, x, y);
    }
    xtalFpsLabel(g, it, 150);
  }

  // 「测试1」页签装配
  function renderInfoTest1() {
    stopTestXtalLoop();
    testXtalItems.length = 0;
    infoBody.innerHTML = '';
    renderInfoTestTop(infoBody);
    startTestXtalLoop();
  }

  function renderInfoTestTop(root) {
    const note = document.createElement('p');
    note.className = 'test-note';
    note.textContent = '水晶样式定稿预览（动画实时渲染）。雷译正视图：小 +10（六边形刻面）/ 中 +60（八角白框 + 有色环带 + 竖长白芯）/ 大 +360（菱形白框 + 正方板 + 近白方面）；行 = 颜色（青·原 / 水蓝·新 / 粉·新），列 = 档位。自旋 1s/圈、24 帧步进（chip 可切 16 帧粗糙对照）；末行为 ×150 颗生产精灵压力实测（FPS 读数）。';
    root.appendChild(note);
    const chips = document.createElement('div');
    chips.className = 'info-subtabs';
    for (const n of [24, 16]) {
      const b = document.createElement('button');
      b.className = 'info-chip' + (xtalSpinFrames === n ? ' active' : '');
      b.textContent = n + ' 帧/圈' + (n === 24 ? '（15°/帧）' : '（22.5°/帧）');
      b.addEventListener('click', () => {
        if (xtalSpinFrames === n) return;
        xtalSpinFrames = n;
        chips.querySelectorAll('.info-chip').forEach(x => x.classList.toggle('active', x === b));
      });
      chips.appendChild(b);
    }
    root.appendChild(chips);
    // 卡 1：静态正视图
    const staticCard = document.createElement('div');
    staticCard.className = 'test-card';
    const staticH3 = document.createElement('h3');
    staticH3.textContent = '雷译正视图 · 静态（3 色 × 3 档）';
    const staticDesc = document.createElement('p');
    staticDesc.className = 'test-desc';
    staticDesc.textContent = '小＝六边形刻面宝石（中央刻面亮带）；中＝白色八角外框 + 有色环带 + 竖长白芯（左上高光径向渐变，边缘不发白）；大＝白色菱形外框（带宽 = 板厚 25%）+ 四向斜边梯形 + 近白正方形前面（边缘浅色渐变、无边框）。';
    const staticCv = document.createElement('canvas');
    staticCv.className = 'test-canvas';
    staticCv.style.height = '300px';
    staticCard.append(staticH3, staticDesc, staticCv);
    root.appendChild(staticCard);
    testXtalItems.push({ cv: staticCv, g: staticCv.getContext('2d'), draw: drawXtalThunder, w: 0, h: 0, dpr: 0, fps: 60 });
    // 卡 2：3D 旋转对照
    const spinCard = document.createElement('div');
    spinCard.className = 'test-card';
    const spinH3 = document.createElement('h3');
    spinH3.textContent = '3D 旋转对照 · 真实建模（深度排序）';
    const spinDesc = document.createElement('p');
    spinDesc.className = 'test-desc';
    spinDesc.textContent = '小＝四棱锥+腰带+四棱锥（厚 0.5 ＜ 正面宽 1.16 → 侧转变扁）；中＝长方体核心 + 八角白框（框厚 40%，中央白高光占比减半）；大＝正方板 + 菱形白框（框厚 25%、中面重合，板面淡色玻璃感：中央白高光、边缘显色，框-板间隙光效环补色）。自旋 1s/圈、步进随顶部 chip。';
    const spinCv = document.createElement('canvas');
    spinCv.className = 'test-canvas';
    spinCv.style.height = '320px';
    spinCard.append(spinH3, spinDesc, spinCv);
    root.appendChild(spinCard);
    testXtalItems.push({ cv: spinCv, g: spinCv.getContext('2d'), draw: drawXtalThunderSpin, w: 0, h: 0, dpr: 0, fps: 60 });
    // 卡 3：压力实测（生产精灵）
    const stressCard = document.createElement('div');
    stressCard.className = 'test-card';
    const stressH3 = document.createElement('h3');
    stressH3.textContent = '压力实测 · 生产烘焙精灵 ×150';
    const stressDesc = document.createElement('p');
    stressDesc.className = 'test-desc';
    stressDesc.textContent = '与游戏内完全同源的 3D 烘焙精灵（24 帧、15°/帧）：运行时每颗每帧 1 次 drawImage 1:1 整数位贴图。加载后台已分块预烘焙全部帧；左上角 FPS 为实时渲染帧率。';
    const stressCv = document.createElement('canvas');
    stressCv.className = 'test-canvas';
    stressCard.append(stressH3, stressDesc, stressCv);
    root.appendChild(stressCard);
    testXtalItems.push({ cv: stressCv, g: stressCv.getContext('2d'), draw: drawXtalStress, w: 0, h: 0, dpr: 0, fps: 60 });
  }

  function buildInfoTabs() {
    infoTabs.innerHTML = '';
    const defs = [
      { id: 'weights',  name: '怪物权重' },
      { id: 'waves',    name: '特殊机制' },
      { id: 'mods',     name: '特殊修正' },
      { id: 'fighters', name: '战机&僚机' },
      { id: 'armors',   name: '护甲' },
      { id: 'subs',     name: '副武器' },
      { id: 'pilots',   name: '驾驶员' },
      { id: 'achievements', name: '成就' },
      { id: 'test1',    name: '测试1' },
      { id: 'test2',    name: '测试2' },
    ];
    for (const d of defs) {
      const b = document.createElement('button');
      b.className = 'info-tab' + (infoTab === d.id ? ' active' : '');
      b.textContent = d.name;
      b.addEventListener('click', () => { infoTab = d.id; hideFormationPreview(); buildInfoTabs(); });
      infoTabs.appendChild(b);
    }
    if (infoTab === 'weights') renderInfoWeights();
    else if (infoTab === 'waves') renderInfoWaves();
    else if (infoTab === 'fighters') renderInfoPlanes();
    else if (infoTab === 'armors') renderInfoArmors();
    else if (infoTab === 'subs') renderInfoSubs();
    else if (infoTab === 'pilots') renderInfoPilots();
    else if (infoTab === 'achievements') renderInfoAchievements();
    else if (infoTab === 'test1') renderInfoTest1();
    else if (infoTab === 'test2') renderInfoTest2();
    else renderInfoMods();
  }

  // ---------- 测试2 页签（开发专用）：图标定稿工作区 ----------
  // 经用户指定使用测试2 展示（原「窗口 B 预留」取消；窗口 B 如需工作区请另开测试3 页签）。
  // 现为「已实装矢量图标」预览区（全部走注册表 iconSvg，.glyph-svg 渲染，1em 与字符行框同尺寸）：
  // 极夜流光北极星 / 无界飞剑单剑 / 辛国栋之怒焰环 / 捣蛋来袭狗耳导弹 / 陵落彼岸花。
  // 静态展示、不接入测试1 动画循环；如需再开候选轮次，在此追加 DRAFTS 节即可。

  function drawIconRow(cv, sec) {
    const n = sec.items.length + 1;   // 首格 = 当前 glyph 对照
    const TILE = 76, GAP = 12, LEFT = 10, LABEL = 20;
    const W = LEFT * 2 + n * TILE + (n - 1) * GAP, H = 10 + TILE + LABEL;
    const cw = Math.max(320, cv.clientWidth || 704);
    const scale = cw / W;
    cv.width = Math.round(cw); cv.height = Math.round(H * scale);
    cv.style.height = Math.round(H * scale) + 'px';
    const g = cv.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.textAlign = 'center';
    const tileX = i => LEFT + i * (TILE + GAP);
    const drawTileBg = x => {
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.beginPath();
      const r = 8, x2 = x + TILE, y2 = 10 + TILE;
      g.moveTo(x + r, 10); g.lineTo(x2 - r, 10); g.quadraticCurveTo(x2, 10, x2, 10 + r);
      g.lineTo(x2, y2 - r); g.quadraticCurveTo(x2, y2, x2 - r, y2);
      g.lineTo(x + r, y2); g.quadraticCurveTo(x, y2, x, y2 - r);
      g.lineTo(x, 10 + r); g.quadraticCurveTo(x, 10, x + r, 10);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(120,200,255,0.22)'; g.lineWidth = 1; g.stroke();
    };
    // 首格：当前 glyph 对照（字形以注册色渲染 + 同款辉光）
    drawTileBg(tileX(0));
    g.save();
    g.translate(tileX(0) + TILE / 2, 10 + TILE / 2 - 2);
    const cur = sec.cur || '';
    g.fillStyle = sec.dark ? '#a855f7' : sec.color;
    g.shadowColor = g.fillStyle; g.shadowBlur = 12;
    g.font = '30px "Segoe UI Symbol", "Microsoft YaHei", sans-serif';
    g.fillText(cur, 0, 10);
    g.restore();
    g.fillStyle = '#8fa3bf'; g.font = '10px "Microsoft YaHei", sans-serif';
    g.fillText('当前 ' + cur, tileX(0) + TILE / 2, 10 + TILE + 14);
    // 候选格
    sec.items.forEach((it, i) => {
      const x = tileX(i + 1);
      drawTileBg(x);
      g.save();
      g.translate(x + TILE / 2, 10 + TILE / 2);
      it.fn(g, sec.dark ? '#a855f7' : sec.color);
      g.restore();
      g.fillStyle = '#8fa3bf'; g.font = '10px "Microsoft YaHei", sans-serif';
      g.fillText(it.k, x + TILE / 2, 10 + TILE + 14);
    });
  }

  function renderInfoTest2() {
    infoBody.innerHTML = '';
    const note = document.createElement('p');
    note.className = 'test-note';
    note.textContent = '已实装矢量图标预览：全部走注册表 iconSvg（.glyph-svg 渲染，1em = 字符行框同尺寸，矢量与字符混排大小一致）。如需微调图案或再开候选轮次随时说。';
    infoBody.appendChild(note);
    // 已实装矢量图标（注册表 iconSvg → .glyph-svg 渲染：主菜单卡片 / 装备框 / 数值图鉴页）
    const implemented = [
      { entry: SUB_WEAPONS.jixing, label: '北极星', color: '#6fb8ff', note: '极夜流光：四芒极星 + 地平弧——「极」之指向星呼应标记锁定（用户选定 C）；默认副武器。' },
      { entry: SUB_WEAPONS.feijian, label: '单剑', color: '#cfe0ff', note: '无界飞剑：按已定稿 † 造型转绘矢量（剑尖朝上 + 剑格剑柄），统一四副武器渲染口径与尺寸；原字形 † 保留作回退。' },
      { entry: PILOTS.lingluo, label: '彼岸花', color: '#a855f7', note: '陵落（驾驶员）：注册色黑紫 #6a1b9a，此处预览提亮。' },
      { entry: SUB_WEAPONS.xinring, label: '焰环', color: '#e63cbe', note: '辛国栋之怒：环身焰舌玫红→粉渐变贴合弹体涂装。' },
      { entry: SUB_WEAPONS.daodan, label: '狗耳导弹', color: '#9fd0ff', note: '捣蛋来袭：白蓝涂装同先兆者导弹，弹头折角狗耳。' },
    ];
    const head2 = document.createElement('h4');
    head2.className = 'info-achv-tier-head';
    head2.style.color = '#7ce7ff';
    head2.textContent = '已实装矢量图标';
    infoBody.appendChild(head2);
    for (const it of implemented) {
      const head3 = document.createElement('h4');
      head3.className = 'info-achv-tier-head';
      head3.style.color = it.color;
      head3.textContent = it.entry.name + ' · ' + it.label;
      infoBody.appendChild(head3);
      const pRow = document.createElement('div');
      pRow.style.cssText = 'display:flex;align-items:center;gap:14px;';
      const svg = document.createElement('span');
      svg.className = 'glyph-svg';
      svg.style.fontSize = '34px';
      svg.style.color = it.color;
      svg.innerHTML = it.entry.iconSvg;
      const pTxt = document.createElement('p');
      pTxt.className = 'test-note';
      pTxt.style.margin = '0';
      pTxt.textContent = it.note;
      pRow.append(svg, pTxt);
      infoBody.appendChild(pRow);
    }
    const tail = document.createElement('p');
    tail.className = 'test-note';
    tail.textContent = '五枚图标均已统一为矢量渲染（1em 行框尺寸 + currentColor 辉光）；如需微调任意图案或再开候选轮次随时说。';
    infoBody.appendChild(tail);
  }

  function openInfoModal() {
    infoModal.classList.remove('hidden');
    buildInfoTabs();
  }

  function closeInfoModal() {
    hideFormationPreview();
    infoModal.classList.add('hidden');
  }

  infoEntryBtn.addEventListener('click', openInfoModal);
  infoClose.addEventListener('click', closeInfoModal);

  export {
    ENCY_GRADES, ENCY_DATA, encyCurrentGrade, buildEncyclopedia, selectEncGrade, showEncyDetail, jumpToEncyEntry,
    startChallenge, startBossTrial, previewCtxDepth, withPreviewCtx, drawEncyPreview, openEncyclopedia,
    closeEncyclopedia, initEncyDiffButtons, infoTab, infoWeightKind, INFO_TIERS, INFO_TIERS_LIVE, tierMask,
    INFO_FORMATIONS, INFO_SIDE_KINDS, INFO_CAPITAL_KINDS, fmtInfoW, infoShipCanvas,
    buildWeightTable, infoAppendNote, INFO_TIER_NOTE, infoSideRows, infoStrikerRows, infoSpecial3Rows,
    infoCapitalRows, infoFormationRows, renderInfoWeights, renderInfoWaves, renderInfoMods, INFO_FIRE_LEVELS,
    fmtDps, planeDps, wingmanDps, infoFighterCanvas, buildDpsTable, renderInfoPlanes,
    buildInfoTabs, openInfoModal, closeInfoModal, renderInfoPilots,
  };