// 13-encyclopedia：怪物图鉴数据 / UI / 形态预览绘制

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：12-ui(1 名) 14-main(1 名)
  //
  import { ARMORS, BERSERK, BOSS, BULWARK, CANVAS_H, CANVAS_W, DIFFICULTIES, DOUZHI, ENEMY_TYPES, FASHI_A1, FASHI_ARRAY, FASHI_MATRIX, HARBINGER, PILOTS, PLANES, PLAYER_CFG, POPIAN, STARSLAYER, STORM, VARIANTS, WEAPON_LEVELS, WINGMAN, WINGMAN_LEVELS, WINGMEN_CFG, currentDifficulty, currentPlane, setDifficulty } from './01-config.js';
  import { DPR, canvas, clamp, ctx, diffGrid, encyDetail, encyDiffGroup, encyList, encyTabs, encyclopedia, infoBody, infoClose, infoEntryBtn, infoModal, infoTabs, overlay, setCtx, state } from './02-core.js';
  import { SPECIAL3_POOL, WAVE_FORMATIONS, sideSpawnWeights, special3Weight, spawnDiagonalRaid, spawnGunshipWings, spawnMirrorRow, spawnSideColumn, spawnSideGroup, spawnSideKamikazeStream, spawnSideSweep, spawnStrikerGroup, spawnStrikerVee, strikerVariantWeights } from './04-spawn.js';
  import { WEAPON_LINES } from './07-player.js';
  import { paintShip, paintWingman, paintWingmanBulwark } from './09-draw-ships.js';
  import { drawEnemy } from './10-draw-world.js';
  import { drawBoss } from './11-draw-boss.js';
  import { resetGame } from './12-ui.js';



  // ---------- 怪物图鉴 ----------
  const ENCY_GRADES = [
    { name: '虚象级', entries: ['side_pass', 'side_shoot', 'side_kamikaze', 'side_moon', 'prolifera'] },
    { name: '具象级', entries: ['striker_crimson', 'striker_amber', 'striker_azure', 'striker_white', 'striker_dusk', 'douzhi', 'fashiA1', 'popian', 'fashiMatrix'] },
    { name: '真我级', entries: ['gunship_violet', 'gunship_crimson', 'gunship_amber', 'harbinger', 'weilong', 'hanshuang', 'yu4', 'anvil', 'baoling', 'jiaoxiang', 'fashiA2'] },
    { name: '诗篇级', entries: ['capital_crimson', 'capital_azure', 'capital_crgold', 'fashiArray'] },

    { name: '长歌级', entries: ['boss', 'boss_storm', 'boss_storm2'] },
  ];
  
  // 每种颜色变体独立成条目；type 用于绘制/生成，variant/behavior 用于强制指定变体/行为
  const ENCY_DATA = {
    side_pass: {
      name: '白影侧翼艇', type: 'side', behavior: 'pass', color: '#f0f0f5', hp: 1, score: 50,
      desc: '从侧上方斜插穿越战场，血量极低、一碰即碎。<b>无攻击</b>。1类编队权重 <b>70</b>（约 61%；Lv11 起 60）。',
    },
    side_shoot: {
      name: '黄芒侧翼艇', type: 'side', behavior: 'shoot', color: '#ffd166', hp: 10, score: 50,
      desc: '从侧上方斜插穿越战场。<b>整场仅攻击一次</b>：入场 <b>1.2~2.8s</b> 后追踪玩家方向射出一发子弹（弹速 230、伤害 6）。1类编队权重 <b>15</b>（约 13%；Lv11 起 20）。',
    },
    side_kamikaze: {
      name: '紫电侧翼艇', type: 'side', behavior: 'kamikaze', color: '#c084fc', hp: 1, score: 80,
      desc: '从侧上方斜插穿越战场。<b>亡语：阵亡时向下垂直射出一发子弹</b>（弹速 ×1.1）。1类编队权重 <b>5</b>（约 4.3%；Lv11 起 10）。',
    },
    side_moon: {
      name: '赤月侧翼艇', type: 'side', behavior: 'moon', color: '#ff3b30', hp: 1, score: 50,
      desc: '从侧上方斜插穿越战场。入场 <b>1~2.5s</b> 后的随机时刻朝航向正前方发射一枚子弹（仅此一次，弹速 230、伤害 6）；<b>到死未发射则有 12% 概率在阵亡时补射</b>。1类编队权重 <b>20</b>（约 17.4%；Lv11 起 25）；掉落按红色标记结算（升级套件 ×1.5）。',
    },
    prolifera: {
      name: '增生侧翼艇', type: 'prolifera', color: '#7fe8c9', hp: 1, score: 50,
      // 衍生敌人无独立条目：卫护飞船连同图像一并在本条目中展示（详情大图右侧）
      child: { type: 'escort', color: '#6a5ce0' },
      desc: '从侧上方斜插穿越战场，<b>无攻击</b>。<b>击毁后分裂出 2~3 个卫护飞船</b>沿原航向漂移；<b>加血套件掉率固定 10%</b>。1类编队权重 <b>5</b>（约 4.3%；Lv11 起 10）。<hr /><b>衍生 · 卫护飞船</b>：<b>深蓝紫渐变机体、边缘泛紫色光芒</b>（与水晶的浅蓝明显区分）；<b>无攻击</b>，随母舰航向漂移；碰撞 4.8、造成无敌时间 0.48s。<b>出厂随机虚化护盾：80% 不带盾 / 15% 概率 0.1s / 4% 概率 0.15s / 1% 概率 0.25s</b>（虚化期间不受伤害、我方炮弹穿过）。击毁后 <b>80% 掉 1 个水晶、20% 掉 2 个</b>。',
    },
    striker_crimson: {
      name: '赤红突击艇', type: 'striker', variant: 'crimson', color: '#ff3b30', hp: 48, score: 150,
      desc: '上方入场，在前锋停留线短暂停顿后向下冲锋。<b>垂直直射</b>（±10° 偏差、不追踪），首次开火额外延迟 1s。出现概率：<b>约 29%</b>。',
    },
    striker_amber: {
      name: '烈橙突击艇', type: 'striker', variant: 'amber', color: '#ff8a5c', hp: 48, score: 150,
      desc: '上方入场，在前锋停留线短暂停顿后向下冲锋。<b>朝前方对称射两发</b>，夹角在 <b>50°/60°/70° 间随机</b>（不追踪）。出现概率：<b>约 29%</b>。',
    },
    striker_azure: {
      name: '幽蓝突击艇', type: 'striker', variant: 'azure', color: '#4d9fff', hp: 48, score: 150,
      desc: '上方入场，在前锋停留线短暂停顿后向下冲锋。<b>发射追踪玩家的子弹</b>，首次开火额外延迟 1s。登场 <b>10% 概率 1s / 10% 概率 2s 虚化护盾</b>（虚化期间不受伤害、我方炮弹穿过）。出现概率：<b>约 24%</b>。',
    },
    striker_white: {
      name: '霜白突击艇', type: 'striker', variant: 'white', color: '#eaf1f8', hp: 48, score: 150,
      desc: '上方入场，在前锋停留线<b>停留 2s</b> 后向下冲锋，<b>完全不开火</b>，以机身撞击玩家。出现概率：<b>约 17%</b>。',
    },
    striker_dusk: {
      name: '幽暮突击艇', type: 'striker', variant: 'dusk', color: '#8f97ab', hp: 64, score: 150,
      desc: '在场地 30%~80% 高度的随机位置上方<b>渐显浮现</b>，下移停驻 <b>0.2s</b>（白环从核心掠过机体至边缘消失作预警），<b>白环散尽的同时</b>以随机方向为基准向四周<b>正六边形或正八边形（随机）</b>的均匀方向各射 1 发，随即下移同距<b>渐隐离场</b>。<b>无法碰撞</b>：与玩家互相穿过、不受撞机反伤。<b>击毁必定掉落 2~3 个水晶</b>。出现概率：Lv11 前 <b>1.2%</b>、Lv11 起 <b>4.8%</b>。',
    },
    gunship_violet: {
      name: '紫晶炮艇', type: 'gunship', variant: 'violet', color: '#c084fc', hp: 350, score: 400,
      desc: '技能循环：<b>正下方同向双连射</b>（不锁定玩家）→ <b>8 发环形爆发</b> → <b>追踪±5°双弹</b>（一次同时两发）→ <b>瞄准单发高速狙击</b>。',
    },
    gunship_crimson: {
      name: '赤红炮艇', type: 'gunship', variant: 'crimson', color: '#ff5a5a', hp: 350, score: 400,
      desc: '火力最猛的炮艇。技能循环：<b>瞄准三连射 + 左右双曲线弹流</b>（同时发射，弹流向两侧大幅外扩）→ <b>反向双曲线弹流</b>（右侧弹往左扫、左侧弹往右扫、向内交叉）→ <b>三方向三段齐射</b>（垂直向下与下±20°，每方向 2 发 ×3 段，第三段射完才重计攻击间隔）。',
    },
    gunship_amber: {
      name: '金曜炮艇', type: 'gunship', variant: 'amber', color: '#ffbf47', hp: 400, score: 400,
      desc: '技能交替：<b>“八”字形斜弹幕</b>（左右各一组对称斜弹、与竖直夹角 10°，快速连发两次、短暂间隔后再两次）→ <b>瞄准单发巨型弹</b>（伤害更高）。',
    },
    harbinger: {
      name: '炮火先兆者', type: 'harbinger', color: '#3a3f4a', hp: 900, score: 600,
      lore: '炮舰术师操作的无人战舰，装甲厚重，材质坚实。正是他们引导了炮舰猛烈的导弹袭击。',
      desc: '较慢入场，悬停于后排。<b>不直接开火</b>：核心充能 <b>3s</b> 后召唤垂直落下的导弹（<b>最多导引 4 次</b>），随后循环；就位约 <b>18s</b> 后停火开走。<br />导弹命中：<b>max(60, 当前血量 80%)</b> 伤害——低血保底 60、不直接秒杀，且<b>武器等级 -1</b>（不计入常规受击计数）。护甲对<b>僚机弹幕减伤 25%</b>，碰撞 12.5。',
    },
    weilong: {
      name: '威龙', type: 'weilong', color: '#ff9a1a', hp: 4500, score: 1200,
      lore: '敌方人员操纵的无人战舰，某太空游戏的粉丝制作的外观，因此被称为威龙。装备有高射速的速射铳和远程操控施术单元，可能是由术师远程操作。优秀的攻击性能让其会对战机构成较大威胁。',
      desc: '从偏左/偏右半场出场，沿<b>蛇形路径</b>巡航（下降与横向靠边交替，途中停顿 2s 后向下离场），方向随出场侧镜像。每隔一段时间朝玩家射 <b>5 枚无偏转快弹</b>，<b>攻击时停止移动</b>。<b>血量 &lt;60% 后不计入场面压力</b>（≥60% 时拖慢敌方刷新）。<b>Lv11 起作为特殊 3 类槽位出场</b>。',
    },
    hanshuang: {
      name: '寒霜', type: 'hanshuang', color: '#8fd8ff', hp: 600, score: 500,
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
      name: '暴鸰', type: 'baoling', color: '#e3e6ec', hp: 500, score: 500,
      lore: '敌方人员操纵的无人战舰，飞行速度缓慢。携带有爆破弹头，将会在接近我方战机时投掷，并造成范围物理伤害。据说设计灵感来自某种幻想生物。虽然在投弹之后不再具有任何攻击性，但是因重量减轻而得以更快速地移动。',
      desc: '自爆无人机：<b>不悬停</b>、径直下压，进入<b>索敌半径（1/3 屏幕长度）</b>即<b>停车锁定</b>——玩家位置浮现红色预警区，炸弹脱离后经 0.8s 低速下坠再<b>极速加速</b>冲向预警区中心爆炸：<b>玩家 40 伤害</b>（不伤敌人）。<b>预警区形成前被击毁则炸弹原地爆炸</b>，对圈内<b>所有单位</b>造成伤害（玩家 40 / 敌人 600 + 20% 最大生命、封顶 2600，可连锁殉爆）；<b>预警区一旦形成，炸弹即视为脱离——击毁暴鸰也无法终止，炸弹仍将抵达目标位置并爆炸</b>。投弹后<b>停留 1.2s</b> 再俯冲离场；碰撞 12。<b>玩家处于爆圈内时对暴鸰增伤 35%</b>（无论是否已投弹）。普通炮艇 <b>1.5%</b> 概率替换出现（成对编队则两架均为暴鸰）；<b>Lv11 起也占特殊 3 类槽位权重</b>。',
    },

    jiaoxiang: {
      name: '焦香螺旋桨', type: 'jiaoxiang', color: '#ff7a18', hp: 1000, score: 600,
      lore: '“螺旋桨天堂”大量采用的升级版浮空动力装置，动力强劲，浮空稳定，甚至还额外附带了驱羽兽功能，堪称完美。<br />但它的散热问题反而更严重了。装载了它的浮空平台，一年四季都弥漫着恼人的焦香。',
      desc: '<b>无碰撞伤害、不攻击</b>：登场后<b>绕大圈巡航</b>——<b>圆心与半径逐次随机</b>（半径 150~200、圈底位于场地 <b>84%~94%</b> 高度、圆心 X 屏中心附近随机），轨迹含轻微漂移且<b>不出场边</b>；圈底最低时光环<b>可灼烧到屏幕最下方</b>。<b>35%</b> 概率从<b>侧翼</b>出现。登场 <b>0.8s</b>（侧翼 <b>1.2s</b>）后展开<b>火焰光环</b>：光环内我方战机<b>每秒 -22.5 血量</b>，接近本体（半径 55 内）<b>伤害翻倍（-45/s）</b>。<b>Lv11 前不出场</b>，击毁后掉落大量水晶。',
    },

    fashiA2: {
      name: '法术大师A2', type: 'fashiA2', color: '#c084fc', hp: 900, score: 600,
      lore: '敌方人员操纵的无人战舰，去掉部分飞行辅助模块，牺牲了飞行速度以换取装备更大型法术武器的空间。能进行远程法术攻击，需要特别小心。',
      desc: 'A1 的<b>强化版</b>：不停留、直接下压（可左右斜移），登场 <b>1.8~2.3s</b> 后进入攻击周期——<b>停移</b> → 朝玩家发射<b>紫色激光</b>（伤害 <b>32</b>，持续生长至出界）→ 攻击后 <b>50%</b> 概率朝<b>斜下方（45°）</b>移动（攻击间隔 <b>1.22~1.83s</b>）。斜移常在下一次攻击前未走完——照常刹停射击后<b>放弃剩余斜移、径直下降</b>。碰撞 35。<b>替换权重：Lv11 前 0% / Lv11 起 3 类槽位 30</b>。',
    },

    douzhi: {
      name: '斗志昂扬', type: 'douzhi', color: '#c9d8ea', hp: 250, score: 100,
      lore: '艾伦精选科技公司感谢您别出心裁的赞助！这架无人战舰将时刻为场上战舰播报商业联合会精选广告段落，刺激大家的神经，让竞赛现场更加燥热！',
      desc: '增益无人机：<b>无碰撞伤害、不攻击</b>（与玩家互相穿过）。<b>每次关卡提升时有 4% 概率</b>从屏幕<b>左侧或右侧</b>出现，朝另一侧横穿（沿余弦曲线小幅上下浮动）。<b>击毁时</b>：我方战机与僚机的<b>攻击速度、弹道飞行速度翻倍，持续 8s</b>（伴随蓝盒脱离、光环演出后本体渐隐）。',
    },

    fashiA1: {
      name: '法术大师A1', type: 'fashiA1', color: '#a855f7', hp: 70, score: 180,
      lore: '敌方人员操纵的无人战舰，飞行速度非常快，由某法术教育竞赛用无人战舰改装而来。其模块化设计使其能装备法术武器进行远程法术攻击，需要特别小心。',
      desc: '紫光激光无人机：<b>不停留</b>、匀速下降，入场 <b>1.2~3s</b> 后（每架独立随机）进入首次攻击周期——<b>停移</b> → 朝玩家发射<b>紫色激光</b>（伤害 16，逐渐生长）→ 攻击后 <b>50%</b> 概率<b>左右横移</b>一段随机距离（不飞出屏幕）→ 恢复下降。碰撞为普通 2 类的 80%。<b>Lv11 前出现权重低，Lv11 起较多出现</b>（2 类替换 60）。',
    },
    
    popian: {
      name: '破片', type: 'popian', color: '#cfd6e0', hp: 200, score: 180,
      lore: '敌方的攻击型空援无人战舰，攻击造成范围性物理伤害。',
      desc: '三连发炮弹无人机：<b>只沿直线飞行</b>——出场选定一个随机点（停留于 <b>30%~80%</b> 屏高、<b>不进入两侧 15% 边缘区</b>，离自身近的高度概率更高），直飞到点后<b>急停锁停</b>，除非被击毁不再移动；停稳后才能攻击。<b>20%</b> 概率从<b>侧翼</b>入场。<b>索敌范围 30% 屏高、每秒 +5%</b>；玩家进入范围后在其位置<b>红圈预警 0.8s</b>，随后<b>快速三连发高速炮弹</b>（<b>不可被击毁</b>）：<b>首发 8 伤害</b>、后两发各 <b>5</b>；<b>若首发命中，则后两发炮弹无视玩家的无敌效果</b>，首发未命中而后两发命中则该次无敌时间 <b>-30%</b>。<b>碰撞伤害分段</b>：入场 0.5s 内无伤害、0.5~2s 为 20、2s 后为 37.5。<b>火力 Lv1 / Lv2 时受到 30% / 10% 易伤</b>。<b>Lv11 前出现权重极低，Lv11 起正常出现</b>。',
    },

    fashiMatrix: {
      name: '法术矩阵', type: 'fashiMatrix', color: '#ff5566', hp: 80, score: 180,
      desc: '白红菱形法师无人机：<b>竖菱形机体（高为宽 1.8 倍、本体自旋）</b>，入场<b>高速俯冲</b>（初速为常态 2 倍并快速衰减）降到<b>屏幕上方 20%~40% 区域</b>，随后<b>不规则地胡乱漂移</b>（不脱离战场），<b>约 18s 后加速离场</b>。移动期间朝玩家位置<b>左右 ±15° 以内</b>发射<b>通体白光的大正方体</b>（一个面恒朝玩家、边缘泛淡红光、带白光拖尾、发射后 0.5s 内由小长大）：正方体伤害 <b>20</b>、速度<b>略高于普通子弹</b>且平滑加速。<b>正方体射程有限</b>（随机为自身到玩家距离的 <b>70%~140% + 15% 屏高</b>）：抵达最大射程前<b>快速减速、光芒黯淡</b>（尾焰随减速迅速收短），末段<b>提前渐隐、速度归零时恰好消失</b>；<b>穿过守愿者白盾</b>：无法被白盾截断，穿盾后命中伤害 <b>-50%</b>。<b>法术阵列在场时</b>：偏移角增至 <b>±25°</b>、正方体速度 <b>+25%</b>。碰撞伤害 <b>18</b>。生命值 <b>80</b>，<b>受到来自主战机的伤害降低 30%</b>（僚机弹幕正常）。<b>Lv11 起才会出现</b>。',
    },

    fashiArray: {
      name: '法术阵列', type: 'fashiArray', color: '#c22b3d', hp: 3000, score: 1500,
      pvZoom: 1.45,   // 详情预览放大：三菱形+底座的视觉尺寸紧凑，按碰撞盒适配会显得偏小
      desc: '血红三菱法师母机（<b>4 类</b>）：三座<b>法术矩阵样式的菱形</b>架设在<b>灰黑底座</b>上——中央菱形较大、呈<b>血红色</b>并带<b>血红流动特效</b>，两侧菱形与中央成一定夹角。<b>入场与退场阶段</b>：底座散发出<b>诡异的浓厚黑雾</b>，机体伴有<b>极轻微的颤动</b>，到位后黑雾逐渐消散。体型、<b>碰撞伤害（12.5）等同炮火先兆者</b>，<b>整体移速为其 65%</b>：匀速下降到<b>屏幕上方 20%~30% 区域</b>后<b>像法术矩阵一样胡乱移动</b>（不脱离屏幕），并<b>周身散发血红雾气</b>；<b>30s 后向上飞离战场</b>。就位后 <b>0~1s</b> 内发起首次攻击：朝玩家发射<b>法术矩阵同款但大一号的红色正方体</b>（伤害 <b>26</b>、周围红光更明显），飞行至 <b>30%~60% 射程</b>时<b>分裂为 3 枚常规正方体</b>——1 枚沿原方向、另 2 枚垂直于原方向；<b>分裂前 0.5s</b> 正方体周围出现<b>红色收缩圈</b>预警，分裂瞬间伴随<b>微弱冲击波</b>。就位 <b>4s</b> 后首次召唤、其后<b>每 5s</b> 一次：<b>周身闪动红光</b>，并在周围一定范围<b>召唤一个法术矩阵</b>——生成位置光效闪动、<b>1s 后开始攻击并随机移动</b>，<b>该召唤体死亡不加分、不掉水晶</b>；<b>飞离期间不再召唤</b>。<b>在场时为法术矩阵提供加成：偏移角增至 ±25°、正方体速度 +25%</b>。<b>死亡时</b>：死亡爆发<b>震出一个法术矩阵</b>——<b>无盾</b>，<b>0.4s 内高速旋转随机 1~2 圈</b>（转速逐渐衰减），<b>1s 后开始攻击</b>，其余与常规法术矩阵一致。<b>Lv11 前不出场</b>（Lv11 起占 4 类槽位，出场时 <b>25%</b> 概率替换主力舰）。',
    },

    capital_crimson: {
      name: '赤红主力舰', type: 'capital', variant: 'crimson', color: '#ff4d6d', hp: 4000, score: 1500,
      desc: '技能循环：<b>双翼交叉矛</b>（左右翼各 3 发向内交叉成 X）→ <b>双曲线宽扇</b>（一侧 6 发弯向斜下、覆盖面极广，左右交替）→ <b>加速弹幕</b>（“/||\\”→“/|\\”，初速极低、加速到常规弹速 2 倍）。<b>对玩家 Lv4 / 暴走(Lv5) 火力减伤 15%</b>。居中快速入场，由 1/2 类护航。',
    },
    capital_azure: {
      name: '苍蓝主力舰', type: 'capital', variant: 'azure', color: '#4d9fff', hp: 4000, score: 1500,
      desc: '技能循环：<b>瞄准六连齐射</b>（±20° 偏差）→ <b>分裂橙红弹</b>（大弹减速到 0 后裂成 6 个小子弹、60° 散开）→ <b>双臂螺旋 12 发</b>。出场时 <b>20% 概率带护盾</b>：前 5s 虚化不受伤害、我方炮弹穿过。<b>对玩家 Lv4 / 暴走(Lv5) 火力减伤 15%</b>。',
    },
    capital_crgold: {
      name: '赤金主力舰', type: 'capital', variant: 'crgold', color: '#ff9a1a', hp: 4000, score: 1500,
      desc: '自带<b>两枚旋转环</b>。技能循环：<b>锁定玩家坐标的扇形连射</b>（首轮 5 发、随后 2/2 两轮，每次均为紧凑两连发）→ <b>金环扩散</b>：消耗一枚旋转环，<b>环带上所有子弹（敌我）瞬间消散</b>，<b>最多两次</b>（耗尽后退化为瞄准双发；<b>圆环被群星之杀斩击切断时立即失去清弹效果、从断口碎裂消散</b>）→ <b>停移</b>发射四组「左3右3」加速长条弹（夹角依次 <b>75°/55°/35°/15°</b> 收窄）。<b>对玩家 Lv4 / 暴走(Lv5) 火力减伤 15%</b>。',
    },
    boss: {
      name: '旧日之歌', type: 'boss', color: '#e6d5ff', hp: 32000, score: 6000, bossId: 'song',
      quote: '自往昔中浮现的梦魇',   // 图鉴引言（颜色与标题一致）
      desc: '宽约 60% 屏宽，小幅左右巡航。拥有 4 种技能乱序释放：<br />' +
        '<b>技能1</b> 双管极快连发长条弹 + 双曲线弹流（血量≤50% 时双管同时向内 / 向外双向发射）<br />' +
        '<b>技能2</b> 散射大子弹（3 轮，每轮随机缺失 20%~35%）<br />' +
        '<b>技能3</b> 四部位标记三连发（标记释放时锁定，不追踪）<br />' +
        '<b>技能4</b> 双管乱射长条弹（血量＞50% 为 270° 大范围散射、≤50% 收敛到下半球）<br />' +
        '血量 70%：在<b>最左侧</b>召唤一位炮火先兆者并掉落暴走道具（各一次）；<b>血量 40%</b>：在<b>最右侧</b>再召唤一位炮火先兆者（就位后同样固定靠边、不巡航）；&lt;50% 技能间隔减半。<br />' +
        '<b>击败掉落</b>：48 颗水晶 + 20% 高能爆弹 + 必掉暴走道具，并参与通用道具掉落池（黑色标记：套件 / 护盾按基础值；加血独立判定 40% 掉 1 个 / 另有 10% 一次掉 2 个）。',
    },
boss_storm: {
      name: '暴风之眼', type: 'boss', color: '#dff3ff', hp: 46000, score: 9000, bossId: 'storm',
      quote: '天秀忧郁之风',   // 图鉴引言（颜色与标题一致）
      desc: '第二波 BOSS。第一阶段为占屏宽 80% 的白色龙卷风暴，逆时针旋转、小幅漂移，整个风暴区域均可受击。7 种技能乱序释放：<br />' +
        '<b>技能1</b> 风波呼啸：从一侧射入 3~4 道横向弯曲风波（弯在下方、可不对称，宽度较风流稍宽），标记约 1.1s 后<b>整条瞬时显现</b>，共两轮（第二轮换另一侧）；技能结束后下一次技能间隔 ×0.25。<b>28 伤害 + 击退</b><br />' +
        '<b>技能2</b> 蓄力后向正前方推出<b>大型龙卷</b>（约占屏宽 30%，可击毁、缓慢下移，随机 360° 快速射出 16 伤害风弹，碰撞 32 伤害；<b>对主机弹幕减伤 50%、受僚机伤害 +150%</b>——僚机是其弱点）<br />' +
        '<b>技能3</b> 连续随机选定 5 处召唤<b>垂直风柱</b>（约 14% 屏宽，标记 1.3s 后落下，18 伤害 + 击退）<br />' +
        '<b>技能4</b> 漩涡状弹幕（4 条臂），前半程逆时针旋转、后半程顺时针旋转<br />' +
        '<b>技能5</b> 两轮乱射风条（首轮 12 处、次轮 9 处，下方 120° 区域）+ 每轮一枚中心瞄准玩家；部分风弹随机强化（尺寸 / 伤害提升）<br />' +
        '<b>技能6</b> 三旋臂漩涡弹幕：3 条旋臂风弹，随机顺 / 逆时针且全程不变，转速随时间越来越快，持续 5s<br />' +
        '<b>技能7</b> 涡流风旋：落点预警后自机体飞抵屏幕下方 80% 高度处，悬停自转 5s、双旋臂喷出密集风条后快速消散；风旋机体碰撞 12 伤害。预警期间落点处有<b>大范围快速收缩的淡红色圆圈</b>（周期性）反复提示。<br />' +
        '血量 70%：在最侧边召唤一位炮火先兆者并掉落暴走道具（各一次）。<br />' +
        '<b>击败后</b>：不掉落水晶、得分 6000；风暴轰然消散，直接召唤二阶段「风暴编织者」（20% 高能爆弹 + 必掉暴走道具 + 通用道具掉落池照常）。',
    },
    boss_storm2: {
      name: '风暴编织者', type: 'boss', color: '#8fd4ff', hp: 32000, score: 6000, bossId: 'storm2',
      quote: '雷霆织就的风暴之心',   // 图鉴引言（颜色与标题一致）
      desc: '一阶段「暴风之眼」的风暴血量归零后<b>轰然消散</b>，其中隐藏的雷电飞舰从中现身——此即二阶段本体。<br />' +
        '<b>造型</b>：X 形四臂——左上-右上、右下-左下夹角 <b>120°</b>，同侧上下臂夹角 <b>60°</b>，上臂较短、下臂较长；中央为<b>灰色装甲机体</b>，中下方镶嵌<b>白蓝 → 深蓝的电弧能量球</b>，雷电沿机体导管泵向四臂端头的发射缝隙。<br />' +
        '<b>数值</b>：HP <b>32000</b>（真我），尺寸约 <b>43% 屏宽</b>，碰撞伤害 <b>40</b>（接触一次性）；悬停移速显著高于旧日之歌，并伴有一定程度的上下浮动。<br />' +
        '<b>击败掉落</b>：80 颗水晶（继承一阶段）+ 20% 高能爆弹 + 必掉暴走道具 + 通用道具掉落池（灰 + 蓝标记：护盾 6%；加血独立判定 40% 掉 1 个 / 另有 10% 一次掉 2 个）。击败后通关。<br />' +
        '概念：操纵雷电的飞舰搅动宇宙能量，卷起第一阶段的风暴。<b>6 种技能乱序释放</b>（间隔 = 暴风之眼的 75%；玩家暴走期间间隔额外减半；本机受到暴走伤害 -30%；血量 70% 掉落暴走道具；<b>技能3/6 光束可被守愿者白盾截断（盾判定箱收窄——仅真正触及盾面才被截断，擦盾掠过可穿过）</b>，技能1/2 激光无视白盾</b>）：<br />' +
        '<b>技能1</b> 停止移动，中心电弧球明显预警蓄力 <b>1.2s</b> 后向下发射强力电弧激光（<b>60 伤害</b>，具象 -40%）；光束<b>宽大</b>、周身<b>电弧狂乱缠绕</b><br />' +
        '<b>技能2</b> 停止移动，四臂喷口<b>按发射顺序先后各现一圈收缩预警波</b>，激涌蓄力 1.2s 后向下发射电弧激光（随机一个先发射、随后快速随机跟上，<b>50 伤害</b>）<br />' +
        '<b>技能3</b> 仅在<b>场地正中</b>向斜下发射四道电弧光束（左右镜像对称，触左右边界<b>反弹</b>，弹道呈"&lt;"形折线，25 伤害，<b>弹速 +80%</b>，释放后下一次技能间隔<b>额外 -70%</b>）；光束沿头部轨迹<b>从 0 增长</b>至全长，转折处沿折线自然弯折<br />' +
        '<b>技能4</b> 中心能量球连续快速连射 <b>40~70</b> 发雷电长条弹——每发均为<b>直射弹</b>、飞行中不扭动，仅朝向逐发变化（按蛇形曲线采样），弹点集合整体呈"先左后右、越摆越宽"的流线轨迹；四喷口外<b>始终</b>各现一圈 <b>14~20</b> 枚雷电子弹（<b>间隔 0.8~1.5s 依次浮现</b>，停留原处 1s 后向对应方向爆开；<b>爆开初速为雷电长条弹速度的 60~80% 或 120~140% 随机取档，同圈一致</b>，20 伤害）；<b>70% 血以下强化</b>：蛇形雷条持续 <b>+50%</b>（多射 50%），雷环增至 <b>6 圈</b>——随机两个喷口各生成第二次；雷环<b>必然在蛇形雷条射完前全部爆开</b>，迟到的雷环立即补齐、并与在场未爆雷环一同立刻爆开（初速 / 最终速度 <b>+30%</b>）<br />' +
        '<b>技能5</b> 周身雷电环缠绕（缓慢旋转明灭），下方 30% 区域随机 5 处依次雷击（雷电环<b>恒定大小渐显聚能</b>——先慢后快，预警 1.2s、区域半径为焦香螺旋桨火环的 <b>80%</b>，<b>40 伤害</b>；落雷瞬间<b>白光与蓝点光爆闪</b>，击中中心外扩一圈 <b>14~20</b> 枚雷电子弹）<br />' +
        '<b>技能6</b> 四喷口沿臂方向直射电弧光束出屏 → 光束于<b>左右边界</b>重现（与臂向光束<b>同长</b>，预警后<b>自 0 增长</b>、增长较慢），以约 <b>1.7s 抵达底边</b>的速度射向目标，左右两侧<b>镜像对称</b>；<b>每边每轮 2 条</b>（同边两束夹角 ≥<b>15°</b>）、恒定 <b>3 轮</b>（<b>轮次间隔 1.5s</b>，不随血量变化）；释放后<b>下一次技能间隔 -50%</b>（28 伤害）<br />' +
        '<b>诗篇难度独特修正</b>：<b>技能1</b> 释放期间不再停止移动，激光连续射出 <b>5 次</b>（上一发射完前即开始下次预警，射完随机 0.1~0.5s 后立刻射出下一发），首次蓄力起自身移速逐渐提升至 <b>200%</b>（加速度减半、约 2s 爬满）、5 次射完后快速衰减；<b>技能2</b> 有 <b>50%</b> 概率同时释放技能6（连携时臂向光束<b>变淡</b>、臂向蓄力与汇聚预警时长 <b>+50%</b>，连携的技能6 随技能2收束无缝继续），<b>连携时蓄力延长至 1.6s</b>（预警圈收缩速度相应变慢），未连携则下一次技能间隔 <b>-60%</b>；<b>技能3</b> 连续快速释放<b>两次</b>（间隔 <b>1~1.5s</b>，第二轮重新随机角度，释放结束后下一次技能间隔 <b>+30%</b>）；<b>技能4</b> 雷环固定 <b>8 圈</b>（生成间隔 -40%）；<b>技能5</b> 落点扩展至<b>下方 60% 区域</b>、轰击错峰 -10%；<b>技能6</b> 释放瞬间<b>四个雷电喷口处</b>立即触发雷霆打击（无预警、伤害减半、外扩雷环子弹数减半）。<br />' +
        '<b>入场</b>：一阶段「暴风之眼」<b>轰然消散</b>（白雾爆发 + 双冲击波环外扩）→ <b>中央雷电风暴轰鸣</b>约 2.1s（落雷密集震屏，中央凝聚出电弧能量球）→ 电球骤亮收缩<b>汇入机体</b>，风暴编织者现身（全程约 3.7s，期间无敌、不释放技能）。',
    },
  };

  let encyCurrentGrade = 0;

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

  function selectEncGrade(idx) {
    encyCurrentGrade = idx;
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
        showEncyDetail(entryId);
      });
      encyList.appendChild(card);
    });
    // 清空详情
    encyDetail.innerHTML = '<p class="ency-placeholder">← 选择一个敌人查看详情</p>';
  }

  function showEncyDetail(entryId) {
    const d = ENCY_DATA[entryId];
    const gradeName = ENCY_GRADES[encyCurrentGrade].name;
    const isBoss = d.type === 'boss';
    // BOSS 页面：试炼（正常战斗）+ 测试该敌人（爆弹无限）；普通敌人页面：仅测试该敌人
    // （风暴编织者技能已实装：与其他 BOSS 一致提供试炼 / 测试入口；专属登场动画待单独设计）
    const actionHtml = isBoss
      ? `<button class="ency-challenge-btn boss" id="encyTrialBtn">⚔ BOSS 试炼</button>
         <button class="ency-challenge-btn" id="encyChallengeBtn">🔬 测试该敌人</button>
         <div class="ency-challenge-hint">BOSS 试炼：正常战斗，敌我均会受损、可被击坠<br />测试该敌人：1~5 切换火力等级 · 高能爆弹无限（每枚炸掉 60% 最大血量）</div>`
      : `<button class="ency-challenge-btn" id="encyChallengeBtn">🔬 测试该敌人</button>`;
    encyDetail.innerHTML = `
      <div class="ency-detail-name" style="color:${d.color}">${d.name}</div>
      ${d.quote ? `<div class="ency-detail-quote" style="color:${d.color}">${d.quote}</div>` : ''}
      <div class="ency-detail-grade">${gradeName}</div>
      <canvas class="ency-detail-canvas" id="encyPreview" width="220" height="140"></canvas>
      <div class="ency-stats">
        <div class="ency-stat">HP<b>${d.hp}</b></div>
        <div class="ency-stat">分数<b>${d.score}</b></div>
      </div>
      <div class="ency-detail-desc">${d.lore ? `<div class="ency-detail-lore">${d.lore}</div><div class="ency-lore-divider"></div>` : ''}${d.desc}</div>
      ${actionHtml}
    `;
    // 绘制预览（220×140 大图）
    drawEncyPreview(d, document.getElementById('encyPreview'));
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
        if (d.child && !small) {
          // 含衍生敌人（详情大图）：主敌居左，衍生体居右下一同展示（衍生体无独立图鉴条目）
          // 衍生体沿用主敌的缩放并按游戏内 drawScale 比值折算，保证图中体型比例与实战一致
          const s1 = clamp(fit, 0.4, 1.7) * 0.78;
          const s2 = s1 * (ENEMY_TYPES[d.child.type].drawScale / et.drawScale);
          blit(drawOffscreen(d), LW * 0.35, LH * 0.46, s1);
          blit(drawOffscreen(d.child), LW * 0.75, LH * 0.60, s2);
        } else {
          const z = d.pvZoom || 1;   // 条目级预览缩放（法术阵列等视觉紧凑的敌机放大展示，缩略图不放大）
          const scale = small ? fit : clamp(fit * z, 0.4, 1.7 * z);   // 缩略图不设缩放上下限，保证 4 类等大体型完整入图
          blit(drawOffscreen(d), LW / 2, LH / 2, scale);
        }
      }
    });
  }

  // ---------- 快捷切换难度（图鉴头部，关闭按钮左侧） ----------
  // 三选一按钮组（静态标记于 index.html，始终渲染）：点击直接选中（与主界面「选择难度」卡片的选中态同步）。
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

  // 权重表构建：rows = [{ canvas, label, vals, fmt?, disp? }]，vals 为数值数组（null = 未解锁/未生效，显示「—」）
  // fmt 为该行数值格式化函数（默认 fmtInfoW）；disp 为可选自定义展示文本（波次行 a~b 区间）
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
    const nameOf = { crimson: '赤红突击艇', amber: '烈橙突击艇', azure: '幽蓝突击艇', white: '霜白突击艇', dusk: '幽暮突击艇' };
    const encyOf = { crimson: 'striker_crimson', amber: 'striker_amber', azure: 'striker_azure', white: 'striker_white', dusk: 'striker_dusk' };
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
  //   disp 存单元格展示文本；hover：悬停行弹出编队演示（mini 战场动画回放入场 / 走位）
  function infoFormationRows() {
    return INFO_FORMATIONS.map(f => {
      const cfg = WAVE_FORMATIONS.find(w => w.fn === f.fn);
      const vals = tierMask(INFO_TIERS.map((t, i) => i === 0 ? cfg.w1 : i === 1 ? cfg.wHigh : null));
      const disp = tierMask(INFO_TIERS.map((t, i) => {
        if (i === 0) return cfg.w1 === cfg.w10 ? fmtInfoW(cfg.w1) : fmtInfoW(cfg.w1) + '~' + fmtInfoW(cfg.w10);
        if (i === 1) return fmtInfoW(cfg.wHigh);
        return null;
      }));
      return { canvas: infoShipCanvas(f.ency), label: f.name, vals, disp, hover: formationHover(f) };
    });
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
    } else {
      infoBody.appendChild(buildWeightTable(['编队', ...INFO_TIERS.map(t => t.label)], infoFormationRows()));
      infoAppendNote(INFO_TIER_NOTE + '编队权重分两段：<b>Lv1~10 由 a→b 线性过渡</b>（B 档显示 a~b 区间），<b>Lv11~20 恒定</b>；0 = 该等级不出现。Lv5 起每波有概率追加一个编队（组合波，追加位不含炮艇编队；<b>Lv5~10 概率由 10%→30%、Lv11~20 由 10%→40%</b>），详见「特殊怪物波次」。<b>鼠标悬停编队行</b>可查看编队演示——mini 战场回放代表性入场与走位（实际入场侧 / 构成随机）。');
    }
  }

  function renderInfoWaves() {
    infoBody.innerHTML = '';
    const cards = [
      // 难度修正：以真我为默认基准描述（数值与 01-config DIFFICULTIES mods 同步）；
      // BOSS 不写单技能细节——诗篇仅标注"技能加强"，统一修正单独成卡
      { h: '难度修正 · 真我', p: '<b>基准难度</b>。怪物数值、BOSS 与玩家规则均为基准值。<b>火力 Lv1 时</b>：1/2 类道具掉率削减修正<b>失效</b>；<b>Lv2 时</b>效果<b>减弱 50%</b>（1类 ×0.5→×0.75 / 2类 ×0.75→×0.875；BOSS 战 1类波 ×0.3 照常）。' },
      { h: '难度修正 · 具象', p: '总刷怪量 / 同屏数量约 <b>-50~60%</b>（波次刷新间隔约为真我 <b>×1.8</b>、满场压力基准 <b>×0.75</b>）；非 BOSS 敌机<b>血量 -20%</b>、首次攻击延迟 <b>+0.5~1.8s</b>、攻击间隔 <b>+25%</b>；1/2 类与 BOSS 战 1类波的道具掉率削减修正<b>失效</b>。<b>BOSS：伤害 -40%、技能释放间隔 +50%、不连发同种技能</b>（技能组同基准）。玩家侧：<b>无敌时间 +50%</b>、导弹命中改为<b>固定 50 伤害</b>（取消秒杀 / 80% 血量规则）、<b>受击不掉武器等级</b>、得分 <b>×0.8</b>。' },
      { h: '难度修正 · 诗篇', p: '<b>BOSS 血量 ×1.6</b>；全体 BOSS 受到<b>暴走(Lv5)伤害 -10%</b>（与 BOSS 专属减免取最高、不叠加）；<b>BOSS 技能加强</b>（旧日之歌 / 暴风之眼技能组深度改版，此处不展开）；得分 <b>×1.2</b>；波次刷新间隔约为真我 <b>×0.77</b>（刷怪更密集，总刷怪量约 <b>+30%</b>）。<b>高能爆弹：初始 0 枚、上限 2 枚、对 BOSS 伤害 -25%</b>。<b>火力 Lv1 时</b>：1/2 类道具掉率削减修正<b>失效</b>；<b>Lv2 时</b>效果<b>减弱 50%</b>（BOSS 战 1类波 ×0.3 照常）。' },
      { h: '加血套件节流（诗篇）', p: '任意两次<b>加血套件</b>（普通敌人掉落）之间至少间隔 <b>8s</b>。冷却期内掉落判定照常进行，但加血环节概率变为 <b>50%</b> 且敌人<b>不掉落</b>（改为"预触发"计数）；冷却结束后若预触发 ≥1，击杀的<b>第一个敌人必定掉落一个</b>加血套件（随后计数清零）。每次实际掉落（含 BOSS 战脚本化加血）都会重置 8s 计时。' },
      { h: 'BOSS 统一修正（全难度）', p: 'BOSS 战期间<b>每 6~12s 强制刷新一波 1类</b>（不走压力系统）：击杀<b>不加分、不掉水晶</b>、道具掉率 ×0.3（具象下该削减失效）。玩家火力 <b>Lv1 对 BOSS 武器伤害 +20%</b>（逆境补偿，高能爆弹不受影响）；进入 BOSS 战<b>重置受击掉级计数</b>（掉级阈值全场景统一 3 次）。' },
      { h: '双编队组合波', p: '<b>Lv5 起</b>有概率在同一波内追加一个编队（追加位不含炮艇编队）：<b>Lv5~10 概率由 10% 线性升至 30%、Lv11~20 由 10% 线性升至 40%</b>。' },
      { h: '法术阵列不限台', p: '4类槽位中<b>主力舰同屏限 1</b>；<b>法术阵列不受限</b>——场上已有法术阵列时仍可继续生成 4 类，但只能生成法术阵列（最多同时 2 台，经慢速强制刷新 + 低概率补出，双阵列较少出现）。' },
      { h: 'BOSS 击败后固定首波', p: '击败 BOSS 后先缓冲 <b>2s</b>，随后固定刷出一波 <b>1类长队</b>——自左或右入场、横穿战场自另一侧离场，本波不含紫电；自首波刷新起 <b>4s</b> 观察期后恢复正常刷怪。2s 与 4s 均不计入关卡推进。' },
      { h: '紫自爆流', p: '左右两侧各 7 架纵列斜扫穿越，以紫电（亡语向下垂直射一发）为主，<b>每波 40%~60% 替换为白影</b>（无攻击）。' },
      { h: '斗志昂扬横穿', p: '每次<b>关卡提升</b>时 4% 概率自屏幕左/右侧横穿一架斗志昂扬（增益无人机，余弦上下浮动）；击毁后我方攻速/弹速翻倍 8s。击败 BOSS 引发的跳变升级不触发。' },
      { h: '闪避无敌衰减', p: '驾驶员的<b>闪避</b>（哈基米大王：暴走期间及结束后 4s 内）触发时<b>不受伤害</b>，但获得的<b>无敌时长仅为正常受击无敌的 70%</b>（真我基准 0.84s；具象难度的无敌 +50% 加成同步放大）。受击反馈（震屏 / 闪白 / 红晕）照常触发，闪避成功即清零累积加成。' },
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
      { h: '导弹', p: '命中伤害：<b>max(60, 当前血量 80%)</b>——低血保底 60、不再直接秒杀，且<b>武器等级 -1</b>（不计入常规受击计数）。量子护盾可消解导弹；具象难度固定 50 伤害。' },
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
    // 单发伤害：常规级走 WEAPON_LEVELS.dmgMul（构成 80% 等比 DPS 链），暴走走 BERSERK.dmgMul
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
  function infoFighterCanvas(kind, wingman, plane) {
    const S = 40;
    const cvs = document.createElement('canvas');
    cvs.width = S * DPR; cvs.height = S * DPR;
    cvs.style.width = S + 'px'; cvs.style.height = S + 'px';
    const c = cvs.getContext('2d');
    c.scale(DPR, DPR);
    c.translate(S / 2, S / 2);
    if (kind === 'plane') { c.scale(0.5, 0.5); paintShip(c, 0, plane || currentPlane); }
    else if (wingman && wingman.weapon && wingman.weapon.kind === 'fan') {
      // 守愿者：冷蓝机体 + 前方白盾（缩小以容纳盾）；左右反转与选机卡一致
      // 盾弧向外侧扫 110°（镜像后甩向一边），按盾+本体 bbox 平移回画布中心
      c.scale(-0.62 * BULWARK.scale, 0.62 * BULWARK.scale); c.translate(-13.6, 12.75); paintWingmanBulwark(c, 1, false, 0.25, true);
    }
      else { c.scale(-0.95, 0.95); paintWingman(c, 1, false, false, true); }   // 左右反转，与选机卡一致（still 冻结相位）
    return cvs;
  }

  // DPS 表构建（行首预览 + 名称，列为火力等级）
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
      td0.appendChild(r.canvas);
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
      glyph.textContent = p.glyph;   // 标题不加空格（长名 + 槽位标注需控制行宽）
      glyph.style.color = p.color;
      h.append(glyph, document.createTextNode(p.name
        + (p.slot === 'main' ? '（主驾驶员' : '（副驾驶员')
        + (p.default ? '·默认）' : '）')));
      const body = document.createElement('p');
      body.innerHTML = p.desc;
      div.append(h, body);
      infoBody.appendChild(div);
    }
    infoAppendNote('主 / 副驾驶员各装备一名、效果同时生效（同名不可同时占据两槽）。默认主驾驶员可莉、副驾驶员小艺。天秀忧郁王子、陵落技能均按 <b>Q</b> 释放，左下角量表显示充能 / 冷却。');
  }

  function buildInfoTabs() {
    infoTabs.innerHTML = '';
    const defs = [
      { id: 'weights',  name: '怪物权重' },
      { id: 'waves',    name: '特殊机制' },
      { id: 'mods',     name: '特殊修正' },
      { id: 'fighters', name: '战机&僚机' },
      { id: 'armors',   name: '护甲' },
      { id: 'pilots',   name: '驾驶员' },
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
    else if (infoTab === 'pilots') renderInfoPilots();
    else renderInfoMods();
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
    ENCY_GRADES, ENCY_DATA, encyCurrentGrade, buildEncyclopedia, selectEncGrade, showEncyDetail,
    startChallenge, startBossTrial, previewCtxDepth, withPreviewCtx, drawEncyPreview, openEncyclopedia,
    closeEncyclopedia, initEncyDiffButtons, infoTab, infoWeightKind, INFO_TIERS, INFO_TIERS_LIVE, tierMask,
    INFO_FORMATIONS, INFO_SIDE_KINDS, INFO_CAPITAL_KINDS, fmtInfoW, infoShipCanvas,
    buildWeightTable, infoAppendNote, INFO_TIER_NOTE, infoSideRows, infoStrikerRows, infoSpecial3Rows,
    infoCapitalRows, infoFormationRows, renderInfoWeights, renderInfoWaves, renderInfoMods, INFO_FIRE_LEVELS,
    fmtDps, planeDps, wingmanDps, infoFighterCanvas, buildDpsTable, renderInfoPlanes,
    buildInfoTabs, openInfoModal, closeInfoModal, renderInfoPilots,
  };