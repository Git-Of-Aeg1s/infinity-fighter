// 13-encyclopedia：怪物图鉴数据 / UI / 形态预览绘制

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：12-ui(1 名) 14-main(2 名)
  //
  import { ARMORS, BERSERK, BOSS, BULWARK, CANVAS_H, CANVAS_W, DIFFICULTIES, DOUZHI, ENEMY_TYPES, FASHI_A1, FASHI_ARRAY, FASHI_MATRIX, HARBINGER, PILOTS, PLANES, PLAYER_CFG, POPIAN, REWARD_DRONES, REWARD_ITEMS, STARSLAYER, STORM, STORM2, SUB_WEAPONS, VARIANTS, WAVE_POEM, WEAPON_LEVELS, WINGMAN, WINGMAN_LEVELS, WINGMEN_CFG, currentDifficulty, currentPlane, darkhandImg, diffMods, hanxixianImg, puxuefengImg, resolveBossHp, rewardDroneChance, setDifficulty, xiayongImg, xinguodongImg } from './01-config.js';
  import { DPR, canvas, clamp, ctx, diffGrid, encyDetail, encyDiffGroup, encyList, encyTabs, encyclopedia, infoBody, infoClose, infoEntryBtn, infoModal, infoTabs, overlay, setCtx, state } from './02-core.js';
  import { SPECIAL3_POOL, WAVE_FORMATIONS, sideSpawnWeights, special3Weight, spawnDiagonalRaid, spawnGunshipWings, spawnMirrorRow, spawnSideColumn, spawnSideGroup, spawnSideKamikazeStream, spawnSideSweep, spawnStrikerGroup, spawnStrikerVee, strikerVariantWeights } from './04-spawn.js';
  import { WEAPON_LINES } from './07-player.js';
  import { paintShip, paintWingman, paintWingmanBulwark, paintWarGhostCandidate, paintDouzhiMark, paintDouzhiBox, paintMarkA, paintMarkB, paintMarkC, paintMarkD, paintMarkE, paintBoxMark1, paintBoxMark2, paintBoxMark3, paintBoxMark4, paintBoxMark5 } from './09-draw-ships.js';
  import { drawEnemy } from './10-draw-world.js';
  import { drawBoss } from './11-draw-boss.js';
  import { resetGame } from './12-ui.js';
  import { renderInfoAchievements } from './02-achievements.js';



  // ---------- 怪物图鉴 ----------
  const ENCY_GRADES = [
    { name: '虚象级', entries: ['side_pass', 'side_shoot', 'side_kamikaze', 'side_swirl', 'side_moon', 'prolifera'] },
    { name: '具象级', entries: ['striker_crimson', 'striker_amber', 'striker_azure', 'striker_violet', 'striker_white', 'striker_fortress', 'striker_dusk', 'douzhi', 'fashiA1', 'popian', 'fashiMatrix', 'popianU', 'sponsor', 'sponsorDeluxe'] },
    { name: '真我级', entries: ['gunship_violet', 'gunship_crimson', 'gunship_amber', 'gunship_orange', 'gunship_cyan', 'harbinger', 'weilong', 'hanshuang', 'yu4', 'anvil', 'baoling', 'jiaoxiang', 'fashiA2', 'baolingG', 'pulseMatrix', 'unreal'] },
    // 诗篇级：全部实装（法术阵列 / 战争幽灵，专属外观预览）
    // （黑暗之手四精英为衍生级条目：不入分页，仅经黑暗之手 desc 内名称点击跳转，见 jumpToEncyEntry）
    { name: '诗篇级', entries: ['capital_crimson', 'capital_azure', 'capital_crgold', 'fashiArray', 'warGhost'] },

    // 长歌级末位为诗篇 BOSS 占位（wip，素材形象预览）：黑暗之手
    { name: '长歌级', entries: ['boss', 'boss_storm', 'boss_storm2', 'boss_darkhand'] },

    // 衍生级（escort / tornado）不设标签页：无法从分页列表直接点击，仅经母体条目 desc 内的名称跳转进入
    // （跳转时不选中任何标签，见 jumpToEncyEntry；反向跳转见条目 parent 字段）
  ];
  
  // 每种颜色变体独立成条目；type 用于绘制/生成，variant/behavior 用于强制指定变体/行为
  // BOSS 条目的 bossId → 01-config 血量注册表（resolveBossHp 按当前难度解析 hpByDiff）
  const BOSS_HP_SRC = { song: BOSS, storm: STORM, storm2: STORM2 };
  const ENCY_DATA = {
    side_pass: {
      name: '白影侧翼艇', type: 'side', behavior: 'pass', color: '#f0f0f5', hp: 10, score: 50,
      desc: '从侧上方斜插穿越战场，血量极低、一碰即碎。<b>无攻击</b>。1类编队权重 <b>70</b>（约 58.3%；Lv11 起 60）。',
    },
    side_shoot: {
      name: '黄芒侧翼艇', type: 'side', behavior: 'shoot', color: '#ffd166', hp: 10, score: 50,
      desc: '从侧上方斜插穿越战场。<b>整场仅攻击一次</b>：入场 <b>1.2~2.8s</b> 后追踪玩家方向射出一发子弹（弹速 230、伤害 6）。1类编队权重 <b>15</b>（约 12.5%；Lv11 起 20）。',
    },
    side_kamikaze: {
      name: '紫电侧翼艇', type: 'side', behavior: 'kamikaze', color: '#c084fc', hp: 10, score: 80,
      desc: '从侧上方斜插穿越战场。<b>亡语：阵亡时向下垂直射出一发子弹</b>（弹速 ×1.1）。1类编队权重 <b>5</b>（约 4.2%；Lv11 起 10）。',
    },
    side_swirl: {
      name: '橙旋侧翼艇', type: 'side', behavior: 'swirl', color: '#ff8c1a', hp: 10, score: 80,
      desc: '从侧上方斜插穿越战场。入场 <b>0.8~1.5s</b> 后自身周围出现一颗环绕弹（与紫电亡语弹同款，弹速 230 同款弹体、伤害 6），<b>绕自身持续转圈</b>（环绕半径随机：约为基准半径的 <b>100%~140%</b>，<b>诗篇 110%~150%</b>）；<b>自身被击坠后环绕弹立刻消失</b>。<b>无亡语</b>。数值与紫电完全一致，1类编队权重 <b>5</b>（约 4.2%；Lv11 起 10，与紫电相同）。',
    },
    side_moon: {
      name: '赤月侧翼艇', type: 'side', behavior: 'moon', color: '#ff3b30', hp: 10, score: 50,
      desc: '从侧上方斜插穿越战场。入场 <b>1~2.5s</b> 后的随机时刻朝航向正前方发射一枚子弹（仅此一次，弹速 230、伤害 6）；<b>到死未发射则有 12% 概率在阵亡时补射</b>。1类编队权重 <b>20</b>（约 16.7%；Lv11 起 25）；掉落按红色标记结算（升级套件 ×1.5）。',
    },
    prolifera: {
      name: '增生侧翼艇', type: 'prolifera', color: '#7fe8c9', hp: 10, score: 50,
      // 衍生体（卫护飞船）为独立隐藏条目（不设标签页）：desc 内名称可点击跳转（互链见 escort.parent）
      desc: '从侧上方斜插穿越战场，<b>无攻击</b>。<b>击毁后分裂出 0~3 个<span class="ency-link" data-ency="escort">卫护飞船</span></b>沿原航向漂移；<b>加血套件掉率固定 10%</b>。1类编队权重 <b>5</b>（约 4.2%；Lv11 起 10）。',
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
    striker_fortress: {
      name: '坚垒护卫艇', type: 'striker', variant: 'fortress', color: '#ffd166', hp: 200, score: 130,
      desc: '黄色重型护卫艇：机体为霜白突击艇的<b>上下倒置</b>，机头前置<b>能量盾</b>（盾沿增粗外移、流光循环）。上方入场，在前锋停留线<b>更靠下的位置</b>（下移 48px）停留后向下冲锋，<b>完全不开火</b>，移速为其他突击艇的 <b>60%</b>。能量盾使<b>受到的伤害 -20%</b>（诗篇 <b>-35%</b>）。出现权重与幽蓝相同。',
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
      desc: '自爆无人机：<b>不悬停</b>、径直下压，进入<b>索敌半径（40% 屏幕高度）</b>即<b>停车锁定</b>——玩家位置浮现红色预警区（<b>0.35s</b>），<b>锁定瞬间炸弹即脱离</b>（预警与下坠并行），经 <b>0.6~0.8s（逐弹随机）</b>低速下坠再<b>极速加速</b>冲向预警区中心爆炸：<b>玩家 40 伤害</b>（不伤敌人）。<b>预警区形成前被击毁则原地自爆</b>（伴随红色扩散爆炸波，<b>不伤玩家</b>）：<b>周围 250px 内所有敌方单位</b>受 600 + 20% 最大生命伤害（封顶 2000，可连锁殉爆）；<b>预警区一旦形成，炸弹即视为脱离——击毁暴鸰也无法终止，炸弹仍将抵达目标位置并爆炸</b>。投弹后<b>停留 1.2s</b> 再俯冲离场；碰撞 <b>24</b>。<b>玩家处于爆圈内时对暴鸰增伤 35%</b>（无论是否已投弹）。普通炮艇 <b>1.5%</b> 概率替换出现（成对编队则两架均为暴鸰）；<b>Lv11 起也占特殊 3 类槽位权重</b>。',
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
      desc: '增益无人机：<b>无碰撞伤害、不攻击</b>（与玩家互相穿过）。属于<b>奖励无人机</b>之一——<b>每次关卡提升时按当前难度概率</b>（虚象 12% / 具象 10% / 真我与诗篇 7%）与赞助系三选一刷出，从屏幕<b>左侧或右侧</b>出现，朝另一侧横穿（沿余弦曲线小幅上下浮动）。<b>击毁时</b>：我方战机与僚机的<b>攻击速度、弹道飞行速度翻倍，持续 8s</b>（伴随蓝盒脱离、光环演出后本体渐隐）。',
    },

    fashiA1: {
      name: '法术大师A1', type: 'fashiA1', color: '#a855f7', hp: 80, score: 160,
      lore: '敌方人员操纵的无人战舰，飞行速度非常快，由某法术教育竞赛用无人战舰改装而来。其模块化设计使其能装备法术武器进行远程法术攻击，需要特别小心。',
      desc: '紫光激光无人机：<b>不停留</b>、匀速下降，入场 <b>1.2~3s</b> 后（每架独立随机）进入首次攻击周期——<b>停移</b> → 朝玩家发射<b>紫色激光</b>（伤害 16，逐渐生长）→ 攻击后 <b>50%</b> 概率<b>左右横移</b>一段随机距离（不飞出屏幕）→ 恢复下降。<b>入场下坠越过 10%~20% 屏高触发线时</b>（逐架随机）有 <b>60%</b> 概率先<b>水平横移一次</b>。碰撞为普通 2 类的 80%。<b>Lv11 前出现权重低，Lv11 起较多出现</b>（2 类替换 60）。',
    },
    
    popian: {
      name: '破片', type: 'popian', color: '#cfd6e0', hp: 200, score: 160,
      lore: '敌方的攻击型空援无人战舰，攻击造成范围性物理伤害。',
      desc: '三连发炮弹无人机：<b>只沿直线飞行</b>——出场选定一个随机点（停留于 <b>30%~80%</b> 屏高、<b>不进入两侧 15% 边缘区</b>，离自身近的高度概率更高），直飞到点后<b>急停锁停</b>，除非被击毁不再移动；停稳后才能攻击。<b>20%</b> 概率从<b>侧翼</b>入场。<b>索敌范围 30% 屏高起步、每秒 +5%</b>（<b>封顶 120% 屏高</b>——已超过屏幕对角线，约 18s 后覆盖全场，<b>等效无攻击范围限制</b>）；玩家进入范围后在其位置<b>红圈预警 0.8s</b>，随后<b>快速三连发高速炮弹</b>（<b>不可被击毁</b>）：<b>首发 8 伤害</b>、后两发各 <b>5</b>；<b>若首发命中，则后两发炮弹无视玩家的无敌效果</b>，首发未命中而后两发命中则该次无敌时间 <b>-30%</b>。<b>碰撞伤害 24</b>。<b>火力 Lv1 / Lv2 时受到 30% / 10% 易伤</b>。<b>Lv11 前出现权重极低，Lv11 起正常出现</b>。',
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
        illusion: 'BOSS 伤害 <b>-40%</b>；技能释放间隔 <b>+50%</b>；<b>不会连续释放同种技能</b>。技能组与具象一致。',
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
        illusion: 'BOSS 伤害 <b>-40%</b>；技能释放间隔 <b>+50%</b>；<b>不会连续释放同种技能</b>。技能组与具象一致。',
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
        illusion: 'BOSS 伤害 <b>-40%</b>；技能释放间隔 <b>+50%</b>；<b>不会连续释放同种技能</b>。技能组与具象一致。',
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

    // ---------- 新增敌人批次（逐个实装中）：已实装的移除 wip 并换专属外观/数值，未实装的仍为占位 ----------
    // wip: true → 图鉴预览统一白色方块（13-encyclopedia drawEncyPreview；例外：黑暗之手 / 四精英已导入素材形象，画真实形象）；实装时逐个替换专属外观与数值
    popianU: {
      name: '破片U型', type: 'popianU', color: '#cfd6e0', hp: 250, score: 220,
      desc: '<span class="ency-link" data-ency="popian">破片</span>的升级版（<b>2类</b>）：外形与破片一致，<b>核心描边与炮口为红色、菱形四角带红段，中心双杠为黑底红色能量流动</b>。与原版不同：<b>入场后无需锁停就位</b>——飞行途中即<b>旋转瞄准玩家</b>（尾焰始终朝向移动方向），<b>入场 1.8~2s</b>（诗篇 <b>1.6~2s</b>）后即可攻击：玩家处于索敌范围内时在其位置<b>红圈预警 0.8s</b>，随后<b>快速三连发高速炮弹</b>（<b>不可被击毁</b>）——<b>首发 10 伤害</b>、后两发各 <b>7</b>（破片 8/5 各 +2）；<b>若首发命中，后两发无视玩家的无敌效果</b>，首发未命中而后两发命中则该次无敌时间 <b>-30%</b>。移动/停留规则与碰撞伤害（<b>24</b>）同破片：直飞选定点后急停锁停、原地小幅漂移。<b>生命值 250</b>（破片 200）。<b>诗篇出怪接入待实装</b>（当前可经图鉴挑战召唤）。',
    },
    baolingG: {
      name: '暴鸰·G', type: 'baolingG', color: '#ffd8a8', hp: 800, score: 500,
      pvDy: -3.8,   // 预览垂直偏移：胶囊弹大且挂点靠下，构图包围盒中心比暴鸰低约 3.8 世界像素——上移对齐视觉中心
      desc: '<span class="ency-link" data-ency="baoling">暴鸰</span>的升级版（3类）：外观为暴鸰的<b>放大版（+5%）</b>，炸弹由圆形改为<b>胶囊形</b>（半圆+矩形+半圆，矩形段多道红色横杠）。攻击方式与暴鸰完全一致（索敌停车锁定 → 投弹 → 爆炸），差异：<b>HP 800</b>（暴鸰 550）、<b>移速 -15%</b>、<b>爆炸半径 +30%</b>（预警圈 / 玩家伤害半径 95、亡语自爆波及 325，均可连锁殉爆）；玩家处于爆圈内同样<b>增伤 35%</b>。',
    },
    sponsor: {
      name: '赞助无人机', type: 'sponsor', color: '#f2f5fa', hp: 280, score: 100,
      desc: '白色赞助无人机（2类）：造型与行动同<span class="ency-link" data-ency="douzhi">斗志昂扬</span>（左右横穿 + 上下浮动，无攻击、无碰撞、互相穿过），差异：盒子为<b>白色</b>且<b>高度略低（-15%）</b>、<b>移速 -20%</b>、<b>上下摆动幅度大幅降低</b>。<b>击毁后掉落一个奖励道具</b>：<b>90% 普通 / 10% 稀有</b>——道具显示在左下角道具槽（计数表样式），<b>按 E 使用</b>；<b>已有道具时无法获得</b>（不覆盖）。',
    },
    sponsorDeluxe: {
      name: '豪华赞助无人机', type: 'sponsorDeluxe', color: '#ffe9a8', hp: 280, score: 100,
      desc: '淡黄色豪华赞助无人机（2类）：<span class="ency-link" data-ency="sponsor">赞助无人机</span>的豪华版——造型与行动完全一致（同<span class="ency-link" data-ency="douzhi">斗志昂扬</span>横穿浮动，无攻击、无碰撞），仅盒子为<b>淡黄色</b>。<b>击毁后必定掉落一个稀有奖励道具</b>——道具显示在左下角道具槽（计数表样式），<b>按 E 使用</b>；<b>已有道具时无法获得</b>（不覆盖）。',
    },
    warGhost: {
      name: '战争幽灵', type: 'warGhost', color: '#ffd24a', hp: 4200, score: 1300,
      desc: '金黄渐变流动的突击驻留型 4 类舰，体量与<span class="ency-link" data-ency="harbinger">炮火先兆者</span>相当。<b>入场</b>：屏外白色风波预警 1s（停留点涟漪 + 来向路径流带）→ 极速冲刺入场，<b>冲撞命中 50 伤害 + 强力击退</b>；抵达时能量刃转一圈金色爆发，随后<b>驻留中场</b>小幅摆动（停留高度约 50%~65%）。<b>技能循环</b>（首个随机，之后固定 1→2→3，间隔 2.2s）：①<b>扇斩</b>——0.8s 扇形预警（锁定瞬间方向）后，对半径 160、90° 扇区内的玩家造成 40 伤害（诗篇半径 180）；②<b>双斩流</b>——双平行斩线跟随玩家 0.5s 后锁定 0.8s，射出两道高速斩击流（35 伤害 / 道）；③<b>环形弹幕</b>——三方向（互成 120°）各 3 连发、共三波（第 2 波旋转 60°、第 3 波同第 1 波），每发 10 伤害。<b>光环</b>：驻留期间场上<span class="ency-link" data-ency="popian">破片</span>、<span class="ency-link" data-ency="popianU">破片U型</span>、<span class="ency-link" data-ency="anvil">铁砧</span>移速与加速度 <b>+100%（×2）</b>、破片无视攻击距离。<b>半血召唤</b>：血量首次降至 50% 时于<b>自身左右身侧略微后方</b>（横向间距 70px、后方即上方 40px）召唤一座铁砧（固定横位）与一架破片U型（顶部入场、目标点同处后方水平线）。<b>离场</b>：驻留 30s 后瞄准玩家所在直线释放 1s 风波预警（纯直线、无落点），预警结束获得巨大加速度沿直线斩出，直到出界离开战场。',
    },
    boss_darkhand: {
      name: '黑暗之手', type: 'boss', bossId: 'darkhand', wip: true, previewOnly: true, color: '#b04ad4', hp: 39000, score: 0,   // 具象血量 39000（2026-09-29；四难度表见 01-config BOSSES.darkhand，已同步总表）
      desc: '【占位预告】第二轮登场的 BOSS。<b>能够召唤<span class="ency-link" data-ency="puxuefeng">朴学峰</span>、<span class="ency-link" data-ency="hanxixian">韩希先</span>、<span class="ency-link" data-ency="xiayong">夏勇</span>、<span class="ency-link" data-ency="xinguodong">辛国栋</span>等精英敌人协助攻击</b>——本体与召唤物协同构成多层次弹幕压力。<br /><i>（占位条目：形象取自素材图，BOSS 未实装，试炼 / 测试入口待实装后开放）</i>',
    },
    puxuefeng: {
      name: '朴学峰', type: 'puxuefeng', wip: true, color: '#c05a5a', hp: 1200, score: 650,
      parent: 'boss_darkhand', derived: true,
      desc: '【占位预告】<span class="ency-link" data-ency="boss_darkhand">黑暗之手</span>召唤的精英敌人之一（4类级随从）。专属技能待设计。<br /><i>（占位条目：形象取自素材图，技能未实装、数值待定）</i>',
    },
    hanxixian: {
      name: '韩希先', type: 'hanxixian', wip: true, color: '#5a7ac0', hp: 1200, score: 650,
      parent: 'boss_darkhand', derived: true,
      desc: '【占位预告】<span class="ency-link" data-ency="boss_darkhand">黑暗之手</span>召唤的精英敌人之一（4类级随从）。专属技能待设计。<br /><i>（占位条目：形象取自素材图，技能未实装、数值待定）</i>',
    },
    xiayong: {
      name: '夏勇', type: 'xiayong', wip: true, color: '#5ab07a', hp: 1200, score: 650,
      parent: 'boss_darkhand', derived: true,
      desc: '【占位预告】<span class="ency-link" data-ency="boss_darkhand">黑暗之手</span>召唤的精英敌人之一（4类级随从）。专属技能待设计。<br /><i>（占位条目：形象取自素材图，技能未实装、数值待定）</i>',
    },
    xinguodong: {
      name: '辛国栋', type: 'xinguodong', wip: true, color: '#b09a4a', hp: 1200, score: 650,
      parent: 'boss_darkhand', derived: true,
      desc: '【占位预告】<span class="ency-link" data-ency="boss_darkhand">黑暗之手</span>召唤的精英敌人之一（4类级随从）。专属技能待设计。<br /><i>（占位条目：形象取自素材图，技能未实装、数值待定）</i>',
    },
    pulseMatrix: {
      name: '脉冲矩阵', type: 'pulseMatrix', color: '#ff4d5e', hp: 800, score: 600,
      desc: '三座<span class="ency-link" data-ency="fashiMatrix">法术矩阵</span>（<b>不变形</b>）的<b>较长对角线互成 120°</b>、自机体中心向外放射（内端顶点在中心相连，外端顶点构成等边三角形，整体呈 Y 字拼合），中央嵌<b>较暗的暗红核心</b>，<b>本体自转</b>（转速与法术矩阵等同）。<b>周期性造成范围伤害</b>：入场后 <b>2.1s</b> 首次释放，此后每 <b>2.2s</b> 一次（诗篇 <b>1.9s</b>）；<b>释放前 0.6s 有微微红圈收缩预警</b>，收缩完毕后自身略微放大（动效）并爆出<b>暗红色冲击波</b>——半径内（<b>等同焦香螺旋桨火焰光环</b>）我方战机受 <b>30</b> 伤害。<b>60% 概率从侧翼入场</b>（朝另一侧横移 20%~60% 屏宽后停驻、微微上下摆动），<b>40% 从上方入场</b>（下移 60%~80% 屏高后停驻）；停驻 20s 后离场。血量 <b>800</b>（诗篇 <b>1000</b>）；<b>分数与水晶掉落与焦香螺旋桨等同</b>。<b>替换权重：Lv11 前 0% / Lv11 起 3 类槽位 15</b>。',
    },
    unreal: {
      name: '虚幻', type: 'unreal', color: '#bfe8ff', hp: 550, score: 500,
      desc: '<span class="ency-link" data-ency="baoling">暴鸰</span>的同型冰霜投弹机（3类）：外观同暴鸰机体——机身标识由骷髅换成<b>雪花</b>，挂载<b>青蓝渐变圆柱炸弹</b>（椭圆顶面、筒身两道半圆弧线均分）。<b>各项数值与暴鸰等同，全部伤害为暴鸰的 70%</b>：投弹流程完全一致（索敌停车锁定 → 投弹 → 爆炸，<b>玩家 28 伤害</b>），预警区为<b>深蓝色</b>；炸弹爆炸后原点留下<b>半径 100px 的寒冷区域</b>（持续 <b>3~5s</b>，间歇浮现雪花）：圈内我方战机<b>射速/移速 -35%</b>（寒霜同款）——<b>投掷出去的炸弹，其寒冷区域只对玩家生效</b>。<b>预警区形成前被击毁则原地殉爆</b>：周围 <b>250px</b> 内敌人受 <b>420 + 14% 最大生命</b>伤害（封顶 1400，可连锁殉爆），殉爆同样留下寒冷区域但<b>只对敌人生效</b>——圈内敌机<b>移速 -35%</b>（<b>BOSS 受到的减速/减移效果减半</b>）。<b>诗篇难度下，寒冷区域不论来源均对双方生效</b>。<b>玩家处于爆圈内时对虚幻增伤 35%</b>（无论是否已投弹）。<b>替换权重：Lv11 前 0% / Lv11 起 3 类槽位 15</b>。',
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
    // BOSS 血量按当前难度解析（hpByDiff 分难度表，见 01-config resolveBossHp）；
    // 占位 BOSS（previewOnly，如黑暗之手）无血量注册表 → 直接展示条目占位 hp
    const hp = isBoss ? (BOSS_HP_SRC[d.bossId] ? resolveBossHp(BOSS_HP_SRC[d.bossId]) : d.hp) : d.hp;
    // 分难度注解：具象为基准不显示；虚象显示通用削弱；真我显示技能组改版（BOSS 专属）
    const diffNote = isBoss && d.diffNotes ? (d.diffNotes[currentDifficulty.id] || '') : '';
    // BOSS 页面：试炼（正常战斗）+ 测试该敌人（爆弹无限）；普通敌人页面：仅测试该敌人；
    // 衍生敌人（derived）：由母体产生 / 召唤，无法独立入场，不提供测试（也不显示提示文案）
    // （风暴编织者技能已实装：与其他 BOSS 一致提供试炼 / 测试入口；专属登场动画待单独设计）
    const actionHtml = isBoss
      ? (d.previewOnly
          // 占位 BOSS（未实装）：不提供试炼 / 测试入口（生成逻辑尚未存在，避免误触回退到旧日之歌）
          ? `<div class="ency-challenge-hint">占位条目：该 BOSS 尚未实装，试炼 / 测试入口待实装后开放</div>`
          : `<button class="ency-challenge-btn boss" id="encyTrialBtn">⚔ BOSS 试炼</button>
         <button class="ency-challenge-btn" id="encyChallengeBtn">🔬 测试该敌人</button>
         <div class="ency-challenge-hint">BOSS 试炼：正常战斗，敌我均会受损、可被击坠<br />测试该敌人：1~5 切换火力等级 · 高能爆弹无限（直接击杀全场）<br />= 召唤 1 个 · Shift+= 召唤 10 个（场上仅 1 个目标时先清场）</div>`)
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
    if (d.type === 'boss' && d.previewOnly) return;   // 占位 BOSS：未实装，不发起挑战
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

  // 诗篇占位条目的素材形象（01-config 异步预加载的 Image）：图鉴预览用——
  // getter 在绘制时取值（import 为活绑定，模块加载期 img 尚为 null，不能把值拷进映射表）；
  // 键：BOSS 用 bossId（darkhand），四精英用 type；未命中 / 未加载完成时回退白色方块（见 drawEncyPreview d.wip 分支）
  const WIP_PREVIEW_IMG = {
    darkhand:   () => darkhandImg,
    puxuefeng:  () => puxuefengImg,
    hanxixian:  () => hanxixianImg,
    xiayong:    () => xiayongImg,
    xinguodong: () => xinguodongImg,
  };

  // 图鉴预览的贴图效果（键同 WIP_PREVIEW_IMG：BOSS 用 bossId / 其余用 type；无配置即原样贴图）
  // 黑暗之手：素材本体近黑——以 canvas filter 提亮 + 轻微对比度；不修改素材文件（无轮廓光晕，2026-09-29 应要求移除）
  const WIP_PREVIEW_FX = {
    // fit：预览框占用率（默认 0.66）——黑暗之手近黑且细节密集，放大至 0.82 更清晰
    darkhand: { brightness: 1.6, contrast: 1.08, fit: 0.82 },
  };

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
      // 占位条目（wip）：已导入素材形象的画真实形象（等比适配画布，如黑暗之手 / 四精英），
      // 其余统一白色方块预览（专属造型待实装；BOSS 占位用固定示意尺寸）
      if (d.wip) {
        const pvKey = d.type === 'boss' ? d.bossId : d.type;
        const pvGet = WIP_PREVIEW_IMG[pvKey];
        const pvImg = pvGet ? pvGet() : null;
        if (pvImg) {
          const fx = WIP_PREVIEW_FX[pvKey];
          const fit = (fx && fx.fit) || 0.66;   // 预览框占用率（黑暗之手放大到 0.82）
          const s = Math.min(LW * fit / pvImg.naturalWidth, LH * fit / pvImg.naturalHeight);
          const dw = pvImg.naturalWidth * s, dh = pvImg.naturalHeight * s;
          const dx = LW / 2 - dw / 2, dy = LH / 2 - dh / 2;
          pctx.imageSmoothingEnabled = true;
          pctx.imageSmoothingQuality = 'high';
          if (fx) {
            // 提亮 + 轻微对比度的本体（filter 只作用于本层；无轮廓光晕——2026-09-29 应要求移除）
            pctx.save();
            pctx.filter = 'brightness(' + fx.brightness + ') contrast(' + fx.contrast + ')';
            pctx.drawImage(pvImg, dx, dy, dw, dh);
            pctx.restore();
          } else {
            pctx.drawImage(pvImg, dx, dy, dw, dh);
          }
          return;
        }
        const t = d.type === 'boss' ? { w: 150, h: 110 } : ENEMY_TYPES[d.type];
        const s = Math.min(LW * 0.66 / t.w, LH * 0.66 / t.h);
        const sw = t.w * s, sh = t.h * s;
        pctx.fillStyle = '#ffffff';
        pctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        pctx.lineWidth = 1.2;
        pctx.fillRect(LW / 2 - sw / 2, LH / 2 - sh / 2, sw, sh);
        pctx.strokeRect(LW / 2 - sw / 2, LH / 2 - sh / 2, sw, sh);
        return;
      }
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
          // pvDy：条目级预览垂直偏移（世界像素，随 scale 缩放）——机身挂载大件炸弹的敌机（暴鸰·G）
          // 构图包围盒中心偏下，据此上移使视觉中心与暴鸰一致
          blit(drawOffscreen(d), LW / 2, LH / 2 + (d.pvDy || 0) * scale, scale);
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
      fn: spawnSideGroup, name: '1类小队', ency: 'side_pass', period: 6.5,
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
      fn: spawnSideSweep, name: '双侧斜扫', ency: 'side_pass', period: 6.5,
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
    { kind: 'swirl',     name: '橙旋侧翼艇', ency: 'side_swirl' },
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
    const nameOf = { crimson: '赤红突击艇', amber: '烈橙突击艇', azure: '幽蓝突击艇', violet: '紫晶突击艇', white: '霜白突击艇', fortress: '坚垒护卫艇', dusk: '幽暮突击艇' };
    const encyOf = { crimson: 'striker_crimson', amber: 'striker_amber', azure: 'striker_azure', violet: 'striker_violet', white: 'striker_white', fortress: 'striker_fortress', dusk: 'striker_dusk' };
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
      label: '奖励无人机（升级触发·当前难度）',
      // 奖励无人机体系（2026-09-29）：每次关卡提升按当前难度概率刷新一架（每次至多一架），
      // 三种按 斗志昂扬5 / 赞助无人机4 / 豪华赞助无人机1 加权抽取——表中为当前难度的触发概率（不随关卡档位变化）
      vals: tierMask(INFO_TIERS.map(() => rewardDroneChance())),
      fmt: rawFmt,   // 概率 ×100 显示为权重数字（小数原样：0.12 / 0.10 / 0.07）
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
      infoAppendNote(INFO_TIER_NOTE + '常规 1类编队（1类小队 / 1类长队 / 双侧斜扫 / 232111 等）中每架按此相对权重抽取构成；权重按关卡分两档（Lv1~10 / Lv11~20）。<b>紫自爆流不混入增生</b>；BOSS 后固定首波不含紫电与橙旋，其余按权重混入。');
    } else if (infoWeightKind === 'striker') {
      infoBody.appendChild(buildWeightTable(headers, infoStrikerRows()));
      infoAppendNote(INFO_TIER_NOTE + '2类突击艇出场时按变体权重选取涂装，权重按关卡分两档直接取值（Lv1~10：赤红30/烈橙30/幽蓝25/紫晶25/霜白20/坚垒25/幽暮2；Lv11~20：10/10/10/10/5/10/5）。法术大师A1 / 破片 / 法术矩阵为 2类突击艇的<b>出场替换概率</b>（判定顺序 A1 → 破片 → 法术矩阵）；<b>奖励无人机</b>（斗志昂扬 / 赞助无人机 / 豪华赞助无人机）为<b>每次关卡提升</b>时按当前难度概率刷新一架（每次至多一架，非波次权重，击败 BOSS 的跳变升级不触发），三种按 ' + REWARD_DRONES.weights.douzhi + '/' + REWARD_DRONES.weights.sponsor + '/' + REWARD_DRONES.weights.sponsorDeluxe + ' 加权抽取（触发概率：虚象 12% / 具象 10% / 真我与诗篇 7%）。');
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
      { h: 'BOSS 击败后固定首波', p: '击败 BOSS 后先缓冲 <b>2s</b>，随后固定刷出一波 <b>1类长队</b>——自左或右入场、横穿战场自另一侧离场，本波不含紫电与橙旋；自首波刷新起 <b>4s</b> 观察期后恢复正常刷怪。2s 与 4s 均不计入关卡推进。' },
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
      { id: 'items',    name: '道具' },
      { id: 'achievements', name: '成就' },
      { id: 'test1',    name: '测试1' },
      { id: 'test2',    name: '测试2' },
      { id: 'test3',    name: '测试3' },
      { id: 'test4',    name: '测试4' },
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
    else if (infoTab === 'items') renderInfoItems();
    else if (infoTab === 'achievements') renderInfoAchievements();
    else if (infoTab === 'test1') renderInfoTest1();
    else if (infoTab === 'test2') renderInfoTest2();
    else if (infoTab === 'test3') renderInfoTest3();
    else if (infoTab === 'test4') renderInfoTest4();
    else renderInfoMods();
  }

  // ---------- 道具：REWARD_ITEMS 注册表驱动（赞助无人机掉落的一次性道具，普通/稀有两档） ----------
  // 版式对齐成就页：每档一个大标题（info-achv-tier-head）分隔普通/稀有，标题色 = 档位色（白 / 金）
  function renderInfoItems() {
    infoBody.innerHTML = '';
    const groups = [
      { rarity: 'normal', label: '普通', color: '#ffffff' },
      { rarity: 'rare',   label: '稀有', color: '#ffd166' },
    ];
    for (const g of groups) {
      const head = document.createElement('h3');
      head.className = 'info-achv-tier-head';
      head.textContent = g.label;
      head.style.color = g.color;
      infoBody.appendChild(head);
      for (const id in REWARD_ITEMS) {
        const it = REWARD_ITEMS[id];
        if (it.rarity !== g.rarity) continue;
        const div = document.createElement('div');
        div.className = 'info-wave-card';
        const h = document.createElement('h4');
        h.style.color = g.color;
        const glyph = document.createElement('span');
        glyph.textContent = it.glyph || '□';
        h.append(glyph, document.createTextNode(' ' + it.name));
        const p = document.createElement('p');
        p.innerHTML = it.desc;
        div.append(h, p);
        infoBody.appendChild(div);
      }
    }
    infoAppendNote('道具由赞助无人机掉落：常规赞助 90% 普通 / 10% 稀有，豪华赞助必稀有；已有道具时再击坠不重复获得（绷绷背包一局限掉落一次）。道具按 <b>E</b> 使用（与驾驶员技能 Q 独立），左下角量表显示持有与稀有度。');
  }

  // ---------- 测试1：战争幽灵重绘候选（开发工作区）----------
  // 2026-09-29 二轮：能量刃已定稿（方案A巨镰形、基本垂直机头），本页改为评选 4 种机身
  // 动态预览（金白配色、机头朝下），绘制实现在 09-draw-ships.js paintWarGhostCandidate；选中编号后移植回 drawWarGhostBody。
  // 原 2026-09-28 水晶定稿预览内容已按用户要求清空（原实现见 git 历史或本窗口会话备份）。
  const wgCand = { raf: 0, last: 0, t: 0, items: [] };
  const WG_CAND_DEFS = [
    { name: '机身 A · 鹰翼「掠魂」', desc: '尖长机头 + 前掠双翼 + 双尾叉，空优战机轮廓；座舱菱形 + 翼骨流光线。' },
    { name: '机身 B · 重装「戍卫」', desc: '宽厚机身 + 两舷浮游炮舱（炮口白热点呼吸），重甲平台轮廓，装甲缝线。' },
    { name: '机身 C · 幽蝠「夜幕」', desc: '弧线连体弯翼（蝙蝠膜翅双凹）+ 膜凹节点亮点，幽灵感最强的圆润轮廓。' },
    { name: '机身 D · 棱晶「裂魂」', desc: '全直线折面棱角机身 + 面板分色 + 中轴裂纹光线闪烁，科幻晶体风。' },
  ];

  function renderInfoTest1() {
    infoBody.innerHTML = '';
    if (wgCand.raf) { cancelAnimationFrame(wgCand.raf); wgCand.raf = 0; }
    wgCand.items = [];
    for (let i = 0; i < WG_CAND_DEFS.length; i++) {
      const d = WG_CAND_DEFS[i];
      const card = document.createElement('div');
      card.className = 'info-wave-card';
      const h = document.createElement('h4');
      h.textContent = d.name;
      h.style.color = '#ffd166';
      const cv = document.createElement('canvas');
      cv.width = 240 * DPR; cv.height = 260 * DPR;
      cv.style.cssText = 'width:240px;height:260px;display:block;margin:6px auto;background:rgba(8,12,26,0.85);border:1px solid rgba(124,231,255,0.18);border-radius:8px;';
      const p = document.createElement('p');
      p.textContent = d.desc;
      p.style.cssText = 'font-size:12px;color:#9fb4d8;';
      card.append(h, cv, p);
      infoBody.appendChild(card);
      wgCand.items.push(cv);
    }
    infoAppendNote('<b>战争幽灵重绘候选</b>——能量刃已定稿（方案A巨镰形、基本垂直机头、微后掠），本页评选<b>机身</b>，均为动态预览。看中哪个把字母编号告知即可，我将该机身 + 垂直巨镰移植进正式机体 drawWarGhostBody。');
    wgCand.last = 0;
    wgCand.raf = requestAnimationFrame(wgCandFrame);
  }

  // 候选预览动画帧：canvas 被移出 DOM（切页签/清空）或图鉴关闭时自动停止
  function wgCandFrame(ts) {
    wgCand.raf = 0;
    const cv0 = wgCand.items[0];
    if (!cv0 || !cv0.isConnected || infoModal.classList.contains('hidden')) return;
    wgCand.raf = requestAnimationFrame(wgCandFrame);
    const dt = wgCand.last ? Math.min(0.05, (ts - wgCand.last) / 1000) : 0;
    wgCand.last = ts;
    wgCand.t += dt;
    for (let i = 0; i < wgCand.items.length; i++) {
      const c = wgCand.items[i].getContext('2d');
      c.setTransform(DPR, 0, 0, DPR, 0, 0);
      c.clearRect(0, 0, 240, 260);
      c.save();
      c.translate(120, 122);
      paintWarGhostCandidate(c, wgCand.t, i);
      c.restore();
    }
  }

  // ---------- 测试3：脉冲矩阵「三座菱形拼合」造型候选 ----------
  // 正确拓扑（用户 2026-09-29 定义）：
  //   一座法术矩阵 = 菱形，长对角线两端点称 A（2 个），短对角线两端点称 B（2 个）。
  //   三座矩阵组装一个等边三角形：每座的长对角线恰好骑在三角形的一条边上（矩阵中心=边中点），
  //   6 个 A 点两两重合于三角形的 3 个顶点（黑框连接点）；短轴沿边法线，一个 B 尖朝外鼓出、
  //   一个 B 尖朝内（原比例 13:24 下三座内 B 尖距中心≈1.4px，几乎交于一点，由暗红核心覆盖）。
  //   外轮廓 = 3 个三角形顶点(A点对) + 3 个外 B 尖交替的六角形。
  function renderInfoTest3() {
    infoBody.innerHTML = '';
    infoAppendNote('<b>脉冲矩阵造型候选 · P2 方向微调</b>——拓扑已定：三座菱形的长对角线各骑等边三角形的一条边，<b>6 个 A 点两两重合于三角形 3 个顶点</b>；方向与大小沿用 P2（一尖朝上、右下折角，R=44），本页仅逐档缩小短对角线。鼠标悬停放大，下方为草图对照。');

    // 单座矩阵几何：给定边中点方位 a（屏幕 y 向下，度）、三角形外接半径 R、长半轴 AH、短半轴 AW
    function matGeom(aDeg, R, AH, AW) {
      const a = aDeg * Math.PI / 180;
      const ux = Math.cos(a + Math.PI / 2), uy = Math.sin(a + Math.PI / 2); // 沿边切向（长轴）
      const vx = Math.cos(a), vy = Math.sin(a);                            // 边法线，朝三角形外（短轴）
      const cx = vx * R / 2, cy = vy * R / 2;                              // 矩阵中心 = 边中点（距中心 R/2）
      return {
        A1: [cx + ux * AH, cy + uy * AH],   // 长对角线端点 A（= 三角形顶点，当 L=边长 时）
        A2: [cx - ux * AH, cy - uy * AH],   // 长对角线端点 A
        Bo: [cx + vx * AW, cy + vy * AW],   // 短轴外端 B（朝三角形外鼓出）
        Bi: [cx - vx * AW, cy - vy * AW],   // 短轴内端 B（朝中心，三座近汇于一点）
        ring: [[cx + ux * AH * 0.5, cy + uy * AH * 0.5],
               [cx + vx * AW * 0.6, cy + vy * AW * 0.6],
               [cx - ux * AH * 0.5, cy - uy * AH * 0.5],
               [cx - vx * AW * 0.6, cy - vy * AW * 0.6]],
        gradIn: [cx - vx * AW, cy - vy * AW],
        gradOut: [cx + vx * AW, cy + vy * AW],
      };
    }

    function drawPulse(c, opt) {
      const { R = 44, ratio = 13 / 24, rot = 0, triColor = false, marks = false } = opt;
      const sideLen = Math.sqrt(3) * R;          // 等边三角形边长 = √3·R
      const L = sideLen;                         // 长对角线 = 边长（6 个 A 点恰好两两重合）
      const AH = L / 2, AW = AH * ratio;
      // 三条边的中点（外 B 尖）方位：上 / 右下 / 左下（屏幕 y 向下），整体再旋转 rot
      const EDGE = [-90, 30, 150].map(d => d + rot);
      const triColors = ['#4a96ff', '#3fd97a', '#ff5a4d'];   // 蓝（上）/ 绿（右下）/ 红（左下），对应三色草图
      const mats = EDGE.map(a => matGeom(a, R, AH, AW));
      const path = pts => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); };
      // 填充（沿内 B→外 B 渐变：内侧深红、外尖白亮）
      mats.forEach((m, i) => {
        path([m.A1, m.Bo, m.A2, m.Bi]);
        if (triColor) {
          // 三色示意（不打渐变，半透明以便看见拼合处重叠）
          const rgbaMap = { '#4a96ff': 'rgba(74,150,255,0.78)', '#3fd97a': 'rgba(63,217,122,0.78)', '#ff5a4d': 'rgba(255,90,77,0.78)' };
          c.fillStyle = rgbaMap[triColors[i]];
        } else {
          const grd = c.createLinearGradient(m.gradIn[0], m.gradIn[1], m.gradOut[0], m.gradOut[1]);
          grd.addColorStop(0, '#ff4d5e'); grd.addColorStop(0.5, '#ff9a9a'); grd.addColorStop(1, '#fff2f2');
          c.shadowColor = 'rgba(255,90,110,0.8)'; c.shadowBlur = 8;
          c.fillStyle = grd;
        }
        c.fill(); c.shadowBlur = 0;
      });
      // 白描边（内部棱边保留 → 读得出三座菱形）
      mats.forEach(m => { path([m.A1, m.Bo, m.A2, m.Bi]); c.strokeStyle = 'rgba(255,240,240,0.85)'; c.lineWidth = 1; c.stroke(); });
      // 内细黑菱形环（与法术矩阵同款，每座中心在边中点）
      mats.forEach(m => { path(m.ring); c.strokeStyle = 'rgba(12,7,9,0.92)'; c.lineWidth = 1.1; c.stroke(); });
      // 中央暗红核心（三座内 B 尖交汇处）
      const cg = c.createRadialGradient(0, 0, 0, 0, 0, 12);
      cg.addColorStop(0, '#7a1020'); cg.addColorStop(1, '#3a0810');
      c.shadowColor = '#a01828'; c.shadowBlur = 6; c.fillStyle = cg;
      c.beginPath(); c.arc(0, 0, 11, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0;

      if (marks) {
        // 等边三角形骨架（虚线）+ 3 个顶点黑框（= A 点两两重合的连接点，对应草图黑框）
        const VDEG = [-150, -30, 90].map(d => (d + rot) * Math.PI / 180);
        const V = VDEG.map(a => [Math.cos(a) * R, Math.sin(a) * R]);
        c.setLineDash([4, 4]); c.strokeStyle = 'rgba(160,200,255,0.55)'; c.lineWidth = 1;
        path(V); c.stroke(); c.setLineDash([]);
        // 6 个 A 点（黄点）：L=边长时每两个重合在顶点
        mats.forEach(m => [m.A1, m.A2].forEach(p => {
          c.fillStyle = '#ffd166'; c.beginPath(); c.arc(p[0], p[1], 2.4, 0, Math.PI * 2); c.fill();
        }));
        // 顶点黑框
        V.forEach(p => {
          c.strokeStyle = '#000'; c.lineWidth = 2;
          c.strokeRect(p[0] - 6, p[1] - 6, 12, 12);
        });
        // 外 B 尖标注（青色小点）
        mats.forEach(m => { c.fillStyle = '#5ae0ff'; c.beginPath(); c.arc(m.Bo[0], m.Bo[1], 2, 0, Math.PI * 2); c.fill(); });
      }
    }

    // 已定方向（用户 2026-09-30 选定 P2：R=44 / rot=0 一尖朝上偏右折角），本页只微调短对角线宽窄。
    // ratio=菱形短半轴/长半轴；0.45 为 P2 基准，以下逐档缩小短对角线。
    const cands = [
      { id: 'P2',   R: 44, ratio: 0.45, rot: 0, note: '基准（短/长=0.45）' },
      { id: 'P2-a', R: 44, ratio: 0.42, rot: 0, note: '短对角线微缩 0.42' },
      { id: 'P2-b', R: 44, ratio: 0.39, rot: 0, note: '短对角线缩小 0.39' },
      { id: 'P2-c', R: 44, ratio: 0.36, rot: 0, note: '更窄 0.36' },
      { id: 'P2-d', R: 44, ratio: 0.33, rot: 0, note: '最窄 0.33（内B尖间隙≈9.5px，仍被核心覆盖）' },
    ];

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;';
    infoBody.appendChild(row);
    cands.forEach(m => {
      const card = document.createElement('div');
      card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;';
      const cvs = document.createElement('canvas');
      cvs.width = 110; cvs.height = 110;
      cvs.style.cssText = 'width:110px;height:110px;border-radius:8px;background:#0a0f20;border:1px solid rgba(120,180,255,0.12);transition:transform 0.15s,border-color 0.15s;';
      cvs.addEventListener('mouseenter', () => { cvs.style.transform = 'scale(1.9)'; cvs.style.borderColor = 'rgba(255,209,102,0.5)'; cvs.style.zIndex = '5'; cvs.style.position = 'relative'; });
      cvs.addEventListener('mouseleave', () => { cvs.style.transform = ''; cvs.style.borderColor = 'rgba(120,180,255,0.12)'; cvs.style.zIndex = ''; });
      const c = cvs.getContext('2d');
      c.translate(55, 55);
      drawPulse(c, m);
      card.appendChild(cvs);
      const lbl = document.createElement('span');
      lbl.textContent = `${m.id} ${m.note}`;
      lbl.style.cssText = 'font-size:11px;color:#9fb4d8;max-width:130px;text-align:center;';
      card.appendChild(lbl);
      row.appendChild(card);
    });

    // 草图对照
    const refTitle = document.createElement('h3');
    refTitle.textContent = '草图对照';
    refTitle.style.cssText = 'margin:20px 0 8px;color:#ffd166;font-size:14px;';
    infoBody.appendChild(refTitle);
    const refRow = document.createElement('div');
    refRow.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;';
    infoBody.appendChild(refRow);
    [['草图1·线稿（三座菱形拼合的外轮廓）', 'assets/dev-ref/pulse-ref-line.png'],
     ['草图2·三色拼合点（黑框=A点两两连接）', 'assets/dev-ref/pulse-ref-tri.png']].forEach(([label, file]) => {
      const card = document.createElement('div');
      card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;';
      const img = document.createElement('img');
      img.src = file;
      img.style.cssText = 'width:200px;background:#fff;border-radius:8px;border:1px solid rgba(120,180,255,0.12);';
      card.appendChild(img);
      const lbl = document.createElement('span');
      lbl.textContent = label;
      lbl.style.cssText = 'font-size:11px;color:#9fb4d8;';
      card.appendChild(lbl);
      refRow.appendChild(card);
    });

    infoAppendNote('当前只调 <b>ratio</b>（短半轴/长半轴）：从 P2 基准 0.45 逐档缩小到 0.33，三座菱形越来越细长、内 B 尖离中心略远（最窄档约 9.5px，仍在 r11 暗红核心覆盖内，不会漏空）。告诉我看中的编号（如 P2-b）或具体数值，我据此实装到机体。');
  }

  // ---------- 测试4：黑暗之手 + 四连携随从 技能方案 / 效果演示（2026-09-29 设计工作区）----------
  // 动画为循环轻量模拟（188x246 竖版小场，蓝三角＝玩家，位置按 sin 规律横移），每个演示帧自检 isConnected：
  // 切走页签 / 关闭弹窗后 canvas 脱链、帧循环自动退出，无需外部注销。
  function renderInfoTest4() {
    infoBody.innerHTML = '';
    infoAppendNote('本页是 <b>黑暗之手</b>（第二轮 BOSS）与四个连携随从（朴学峰 / 韩希先 / 夏勇 / 辛国栋）的技能设计工作区：'
      + '先定 <b>整体战斗框架</b>（A/B/C，三选一或混搭），再从技能池里勾选。所有动画均为实装效果的等比模拟，循环播放。');

    // ── 一、战斗框架 ──
    infoBody.appendChild(t4Head('一、整体战斗框架（三选一 / 可混搭）'));
    [
      { name: '方案A · 五指序章（血量召唤）',
        desc: 'BOSS 血量 80% / 60% / 40% / 20% 时依次召唤一名随从（朴 → 韩 → 夏 → 辛），同时场上最多 1 随从；随从存活期间 BOSS 主动攻击频率降低，'
          + '每击败一名随从，BOSS 五指断一指、弹幕节奏随之改变；四随从全灭后进入最终阶段（纯 BOSS 弹幕连发）。'
          + '<b>优点</b>：节奏清晰、同屏实体少（低端机友好）、便于玩家逐个学习随从机制。' },
      { name: '方案B · 黑手议会（同场群战）',
        desc: '开战四随从全部登场、分列四角环绕 BOSS；每死一名随从，BOSS 将其「吸收」为黑手指节并永久获得该随从的一种弹幕碎片（技能池逐场扩张）。'
          + '<b>优点</b>：场面压迫感最强、最贴合「黑手」群像设定；<b>风险</b>：同屏实体多，需给弹幕总量设上限并做性能分级。' },
      { name: '方案C · 点名轮转（节奏博弈）',
        desc: '四随从轮转在场（同时 1~2 名），BOSS 每 10s <b>点名</b>一名随从（红色光束连线 + 音效）：被点名者伤害 ×1.6、但受伤 ×1.8，'
          + '玩家可选择强杀点名目标（快速减员）或避战拖时间；随从被击倒后 8s 补下一名。<b>优点</b>：博弈感强，战损节奏由玩家掌控。' },
    ].forEach(f => infoBody.appendChild(t4TextCard(f.name, f.desc, '#ff8a8a')));

    // ── 二、BOSS 技能池（动画候选）──
    infoBody.appendChild(t4Head('二、黑暗之手 · 技能池（动画演示为选中候选）'));
    t4DemoGrid([
      { title: '五指收束', sub: '五道刃光收束 · 指缝＝安全区', period: 4.2, draw: t4DrawFiveFingers },
      { title: '黑手之握', sub: '脚下手掌预警 · 合拢多段伤害', period: 3, draw: t4DrawGrasp },
      { title: '刃翼X斩', sub: '交叉刃气扫过全屏', period: 3.6, draw: t4DrawXSlash },
      { title: '黑暗涟漪', sub: '多层错相位环形弹幕', period: 3.8, draw: t4DrawRipples },
      { title: '四管炮幕', sub: '四门前炮交替扇形速射', period: 3, draw: t4DrawQuadCannon },
    ]);
    [
      ['黑羽散落（纯文字候选）', '双翼高频抖动，抖落大量不规则慢速黑羽弹向下飘落（封走位不封死），弹点随机、偶尔夹杂一枚红色加速羽；持续约 4s。'],
      ['夜幕降临（纯文字候选）', '背景骤然变暗、视野只剩玩家周围一小圈与红色弹道轨迹；BOSS 隐入黑暗 1.5s 后沿预警红线发动一次快速冲撞，贯穿全屏。'],
      ['暗影钩爪（纯文字候选）', '手掌钩爪沿直线快速射出，命中玩家造成伤害并向 BOSS 方向拖拽；未命中则钩在屏边，0.4s 后收回（收回路径同样有伤害）。'],
    ].forEach(([n, d]) => infoBody.appendChild(t4TextCard(n, d, '#dd8888')));

    // ── 三、四个随从 ──
    infoBody.appendChild(t4Head('三、四个连携随从 · 技能候选'));
    const MINION_T4 = [
      { name: '朴学峰', img: puxuefengImg, role: '定位：极速截击（高机动 / 穿刺）',
        demos: [{ title: '流星穿刺', sub: '预警线 → 高速贯穿 → 换线折返', period: 3.6, draw: t4DrawPierce }],
        cands: [
          ['翼根连弩', '肩部弹匣格逐格亮起，朝玩家方向三段扇形连射高速弹（每段 5 发、段间隔 0.25s）；射击结束后有 1.5s 装填空档（输出窗口）。'],
          ['残像换影', '高速移动中在原位留下暗影残像（持续 0.8s），残像消失时向四周爆开 12 发短弹；本体从另一侧斜角突入并刺击一次。'],
        ] },
      { name: '韩希先', img: hanxixianImg, role: '定位：三眼炮座（光束 / 锁定）',
        demos: [{ title: '三眼齐光', sub: '三眼蓄力 → 三道竖光 · 光间留缝', period: 4, draw: t4DrawThreeEyes }],
        cands: [
          ['凝视锁定', '顶部大眼发出红色细追踪线锁定玩家 1s（持续跟随转动），锁定完成后发射粗重持续激光 0.9s；保持横移可让激光扫空。'],
          ['旋眼火螺', '三座眼状炮塔脱离机体、环绕本体旋转，持续 3s 螺旋线弹幕（每眼每 0.18s 一发），旋转方向中途反转一次。'],
        ] },
      { name: '夏勇', img: xiayongImg, role: '定位：重装壁垒（护盾 / 重压）',
        demos: [
          { title: '重压坠击', sub: '影子锁定 → 重砸 + 冲击波环', period: 3.6, draw: t4DrawSlam },
          { title: '暗壁', sub: '护盾挡正面弹 · 绕背 / 爆弹可破', period: 3.5, draw: t4DrawShield },
        ],
        cands: [
          ['核心膨胀', '背部大核心过载，向玩家方向推出一颗缓慢膨胀的暗红能量球（最大半径 60，持续 5s 后原地爆散环形弹幕）；膨胀期间本体移速下降。'],
        ] },
      { name: '辛国栋', img: xinguodongImg, role: '定位：轰炸平台（导弹 / 地毯轰炸）',
        demos: [
          { title: '地毯轰炸', sub: '横移投弹 · 落点预警连锁爆炸', period: 4.2, draw: t4DrawBombs },
          { title: '十二连发', sub: '12 管两批扇形 · 轻追踪导弹', period: 4, draw: t4DrawMissiles },
        ],
        cands: [
          ['（分阶段备注）', '地毯轰炸与十二连发建议分阶段使用：常规阶段十二连发，血量 50% 后追加地毯轰炸；两技连放间隔不少于 5s，避免弹幕过密无处可走。'],
        ] },
    ];
    MINION_T4.forEach(m => {
      const hr = document.createElement('div');
      hr.style.cssText = 'display:flex;align-items:center;gap:10px;margin:16px 0 6px';
      if (m.img && m.img.src) {
        const im = document.createElement('img');
        im.src = m.img.src;
        im.style.cssText = 'width:54px;filter:brightness(1.45) contrast(1.05)';
        hr.appendChild(im);
      }
      const tx = document.createElement('div');
      const h = document.createElement('h4');
      h.style.cssText = 'color:#ffb0b0;margin:0';
      h.textContent = m.name;
      const sp = document.createElement('span');
      sp.style.cssText = 'font-size:11px;color:#9fb4d8';
      sp.textContent = m.role;
      tx.append(h, sp);
      hr.appendChild(tx);
      infoBody.appendChild(hr);
      if (m.demos) t4DemoGrid(m.demos);
      m.cands.forEach(([n, d]) => infoBody.appendChild(t4TextCard(n, d, '#e09a9a')));
    });

    infoAppendNote('<b>怎么用本页</b>：告诉我框架选哪个 + BOSS / 各随从技能勾哪几个（例如：「A 框架；BOSS 要五指收束 + 黑手之握 + 四管炮幕；朴学峰流星穿刺；韩希先三眼齐光；夏勇暗壁；辛国栋十二连发」），'
      + '我据此实装到 06-enemy / 09-draw-ships 等模块。动画里的尺寸 / 弹速 / 预警时长均为暂定，实装时再精调。');
  }

  // ── 测试4 公共小工具 ──
  function t4Head(text) {
    const h = document.createElement('h3');
    h.className = 'info-achv-tier-head';
    h.style.color = '#ff8585';
    h.textContent = text;
    return h;
  }
  function t4TextCard(title, desc, color) {
    const d = document.createElement('div');
    d.className = 'info-wave-card';
    const h = document.createElement('h4');
    h.style.color = color || '#ff9a9a';
    h.textContent = title;
    const p = document.createElement('p');
    p.innerHTML = desc;
    d.append(h, p);
    return d;
  }
  function t4DemoGrid(demos) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin:6px 0 14px';
    demos.forEach(d => row.appendChild(t4Demo(d)));
    infoBody.appendChild(row);
  }
  function t4Demo(opt) {
    const { title, sub, period = 4, draw } = opt;
    const card = document.createElement('div');
    card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px';
    const W = 188, H = 246, dpr = Math.min(2, window.devicePixelRatio || 1);
    const cvs = document.createElement('canvas');
    cvs.width = W * dpr; cvs.height = H * dpr;
    cvs.style.cssText = 'width:' + W + 'px;height:' + H + 'px;border-radius:8px;background:#070a13;border:1px solid rgba(255,90,90,0.16)';
    const c = cvs.getContext('2d');
    c.scale(dpr, dpr);
    const st = { bullets: [], flashes: [], misc: {} };
    let last = performance.now();
    function frame(now) {
      if (!cvs.isConnected) return;                 // 脱链即停（切页签 / 关弹窗）
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.1) dt = 0.1;
      const t = (now / 1000) % period;
      c.clearRect(0, 0, W, H);
      t4Field(c, W, H, t);
      draw(c, t, dt, W, H, st);
      const pp = t4PlayerPos(t, W, H);
      t4Player(c, pp[0], pp[1]);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    const lbl = document.createElement('div');
    lbl.style.cssText = 'text-align:center;font-size:11px;color:#9fb4d8;max-width:188px';
    lbl.innerHTML = '<b style="color:#e8c0c0">' + title + '</b><br>' + sub;
    card.append(cvs, lbl);
    return card;
  }
  // 背景星点（缓慢下移制造纵深感）
  function t4Field(c, W, H, t) {
    c.fillStyle = 'rgba(130,160,230,0.14)';
    for (let i = 0; i < 20; i++) {
      const x = (i * 53) % W, y = (i * 97 + t * 14) % H;
      c.fillRect(x, y, 1, 1);
    }
  }
  // 假玩家：规律横移的蓝白三角（所有演示共用，弹幕读起来有攻防关系）
  function t4PlayerPos(t, W, H) {
    return [W / 2 + Math.sin(t * 1.35) * W * 0.3, H - 28];
  }
  function t4Player(c, x, y) {
    c.save();
    c.fillStyle = '#8fd6ff'; c.strokeStyle = '#dff4ff'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y - 9); c.lineTo(x - 8, y + 8); c.lineTo(x + 8, y + 8);
    c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
  // BOSS 简形：黑甲棱体 + 红线 + 四管前炮
  function t4Boss(c, x, y, s) {
    c.save();
    c.translate(x, y); c.scale(s, s);
    c.fillStyle = '#161a23'; c.strokeStyle = 'rgba(255,70,70,0.8)'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, -14); c.lineTo(27, -2); c.lineTo(20, 12); c.lineTo(-20, 12); c.lineTo(-27, -2);
    c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,60,60,0.55)';
    [-14, -5, 5, 14].forEach(bx => { c.beginPath(); c.moveTo(bx, 10); c.lineTo(bx, 19); c.stroke(); });
    c.restore();
  }
  // 发光直线 / 虚线预警
  function t4Line(c, x1, y1, x2, y2, w, color, glow) {
    c.save();
    c.lineCap = 'round';
    if (glow) { c.shadowColor = color; c.shadowBlur = glow; }
    c.strokeStyle = color; c.lineWidth = w;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.restore();
  }
  function t4WarnLine(c, x1, y1, x2, y2, alpha) {
    c.save();
    c.setLineDash([6, 5]);
    c.strokeStyle = 'rgba(255,80,80,' + alpha + ')'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.restore();
  }
  // 随从简形：朴学峰（尖刺飞镖，dir：1 向下 / -1 向上）
  function t4Dart(c, x, y, dir) {
    c.save();
    c.translate(x, y);
    if (dir < 0) c.rotate(Math.PI);
    c.strokeStyle = 'rgba(255,90,90,0.3)';
    c.beginPath(); c.moveTo(0, -8); c.lineTo(0, -26); c.stroke();
    c.fillStyle = '#151923'; c.strokeStyle = 'rgba(255,70,70,0.9)'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, 13); c.lineTo(-9, -8); c.lineTo(0, -3); c.lineTo(9, -8);
    c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
  // 随从简形：夏勇（重装方甲 + 顶部核心环）
  function t4Heavy(c, x, y, s) {
    s = s || 1;
    c.save();
    c.translate(x, y); c.scale(s, s);
    c.fillStyle = '#151922'; c.strokeStyle = 'rgba(255,70,70,0.75)'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-18, -10); c.lineTo(18, -10); c.lineTo(14, 12); c.lineTo(-14, 12);
    c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,80,80,0.95)'; c.lineWidth = 2;
    c.beginPath(); c.arc(0, -10, 6, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#c23';
    c.beginPath(); c.arc(0, -10, 3, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  // 随从简形：辛国栋（宽翼轰炸机 + 中央大环）
  function t4Bomber(c, x, y, s) {
    s = s || 1;
    c.save();
    c.translate(x, y); c.scale(s, s);
    c.fillStyle = '#141821'; c.strokeStyle = 'rgba(255,70,70,0.7)'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-40, 4); c.lineTo(-14, -8); c.lineTo(14, -8); c.lineTo(40, 4); c.lineTo(24, 12); c.lineTo(-24, 12);
    c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,90,90,0.9)'; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.stroke();
    c.restore();
  }

  // ── 测试4 演示绘制：① 五指收束（五根顶部起点 → 向玩家活动带中心收束，指缝留安全道）──
  function t4DrawFiveFingers(c, t, dt, W, H, st) {
    t4Boss(c, W / 2, 24, 0.8);
    const cx = W / 2, cy = H * 0.68;
    let a;
    if (t < 2) a = 0.3 + 0.18 * Math.sin(t * 10);
    else if (t < 2.8) a = 1;
    else a = Math.max(0, 1 - (t - 2.8) / 0.6);
    for (let i = 0; i < 5; i++) {
      const x = W * (0.08 + i * 0.21);
      const ex = cx + (x - cx) * 0.3, ey = cy;
      if (t < 2) t4WarnLine(c, x, 34, ex, ey, a);
      else {
        t4Line(c, x, 34, ex, ey, 6.5 * a, 'rgba(255,60,60,' + 0.5 * a + ')', 8);
        t4Line(c, x, 34, ex, ey, 2.2 * a, 'rgba(255,232,232,' + a + ')', 0);
      }
    }
  }
  // ② 黑手之握（预警圆跟随玩家 → 五指收拢 → 掌心多段伤害）
  function t4DrawGrasp(c, t, dt, W, H, st) {
    t4Boss(c, W / 2, 24, 0.8);
    const pp = t4PlayerPos(t, W, H);
    let r, a = 1, fill = 0;
    if (t < 1.3) { r = 33; a = 0.55 + 0.3 * Math.sin(t * 12); }
    else if (t < 1.8) { const p = (t - 1.3) / 0.5; r = 33 * (1 - p) + 9; fill = p; }
    else { r = 9; fill = 0.9; a = 1 - Math.max(0, (t - 2.2) / 0.6); }
    c.save();
    c.translate(pp[0], pp[1]);
    if (fill > 0) {
      c.fillStyle = 'rgba(255,40,40,' + 0.35 * fill + ')';
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = 'rgba(255,70,70,' + a + ')'; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
    // 五个指尖沿上半弧排列
    for (let i = 0; i < 5; i++) {
      const ang = Math.PI + (i / 4) * Math.PI;
      c.fillStyle = 'rgba(255,90,90,' + a + ')';
      c.beginPath(); c.arc(Math.cos(ang) * r, Math.sin(ang) * r, 2.6, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
  // ③ 刃翼X斩（全屏交叉两条线预警 → 高亮刃气扫过）
  function t4DrawXSlash(c, t, dt, W, H, st) {
    t4Boss(c, W / 2, 24, 0.85);
    const L1 = [[2, H * 0.2], [W - 2, H * 0.94]], L2 = [[W - 2, H * 0.2], [2, H * 0.94]];
    if (t < 1.6) {
      [L1, L2].forEach(L => t4WarnLine(c, L[0][0], L[0][1], L[1][0], L[1][1], 0.35 + 0.2 * Math.sin(t * 9)));
    } else {
      const p = t < 2.4 ? 1 : Math.max(0, 1 - (t - 2.4) / 0.7);
      [L1, L2].forEach(L => {
        t4Line(c, L[0][0], L[0][1], L[1][0], L[1][1], 7 * p, 'rgba(255,60,60,' + 0.55 * p + ')', 10);
        t4Line(c, L[0][0], L[0][1], L[1][0], L[1][1], 2.4 * p, 'rgba(255,245,245,' + p + ')', 0);
      });
    }
  }
  // ④ 黑暗涟漪（三环错相位扩张，弹点随半径淡出）
  function t4DrawRipples(c, t, dt, W, H, st) {
    t4Boss(c, W / 2, 44, 0.8);
    const cx = W / 2, cy = 58, n = 16;
    for (let k = 0; k < 3; k++) {
      const r = 20 + ((t * 44 + k * 32) % 150);
      const fade = 1 - r / 150, off = t * 0.7 + k * 0.8;
      for (let i = 0; i < n; i++) {
        const ang = off + i / n * Math.PI * 2;
        c.fillStyle = 'rgba(255,80,80,' + 0.85 * fade + ')';
        c.beginPath(); c.arc(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 2.2, 0, Math.PI * 2); c.fill();
      }
    }
  }
  // ⑤ 四管炮幕（每 0.5s 四管齐射，左右交替小偏角）
  function t4DrawQuadCannon(c, t, dt, W, H, st) {
    t4Boss(c, W / 2, 36, 0.9);
    const cx = W / 2, muzz = [-20, -7, 7, 20];
    const tick = Math.floor(t / 0.5);
    if (st.misc.tick !== tick) {
      if (st.misc.tick === undefined || tick < st.misc.tick) st.bullets.length = 0;
      st.misc.tick = tick;
      const bias = tick % 2 ? 0.12 : -0.12;
      muzz.forEach((dx, i) => {
        st.bullets.push({ x: cx + dx, y: 50, vx: Math.sin((i - 1.5) * 0.18 + bias) * 95, vy: 150 });
      });
    }
    for (let i = st.bullets.length - 1; i >= 0; i--) {
      const b = st.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y > H + 4) { st.bullets.splice(i, 1); continue; }
      c.fillStyle = '#ff5a5a';
      c.beginPath(); c.arc(b.x, b.y, 2.5, 0, Math.PI * 2); c.fill();
    }
  }
  // ⑥ 朴学峰·流星穿刺（1 号线预警贯穿 → 2 号线折返）
  function t4DrawPierce(c, t, dt, W, H, st) {
    const x1 = W * 0.4, x2 = W * 0.62;
    if (t < 1.4) t4WarnLine(c, x1, 24, x1, H, 0.4 + 0.25 * Math.sin(t * 10));
    else if (t < 2.1) t4Dart(c, x1, 18 + (t - 1.4) / 0.7 * (H + 34), 1);
    if (t >= 2 && t < 2.25) t4WarnLine(c, x2, H, x2, 24, 0.5);
    if (t >= 2.25 && t < 3.0) t4Dart(c, x2, H + 12 - (t - 2.25) / 0.75 * (H + 24), -1);
  }
  // ⑦ 韩希先·三眼齐光（三眼充能 → 三道竖光，光间留两缝）
  function t4DrawThreeEyes(c, t, dt, W, H, st) {
    const xs = [0.3, 0.5, 0.7].map(v => v * W);
    c.fillStyle = '#141821';
    c.fillRect(W / 2 - 32, 16, 64, 22);
    xs.forEach(x => {
      const ch = t < 1.8 ? 2 + t / 1.8 * 4 : 6;
      c.fillStyle = 'rgba(255,60,60,0.9)';
      c.beginPath(); c.arc(x, 38, ch, 0, Math.PI * 2); c.fill();
      if (t < 1.8) t4WarnLine(c, x, 46, x, H, 0.35 + 0.2 * Math.sin(t * 10));
      else {
        const a = t < 2.7 ? 1 : Math.max(0, 1 - (t - 2.7) / 0.7);
        t4Line(c, x, 44, x, H, 8 * a, 'rgba(255,60,60,' + 0.5 * a + ')', 10);
        t4Line(c, x, 44, x, H, 2.4 * a, 'rgba(255,250,250,' + a + ')', 0);
      }
    });
  }
  // ⑧ 夏勇·重压坠击（影子跟随 → 锁定 → 重砸闪光 + 冲击环）
  function t4DrawSlam(c, t, dt, W, H, st) {
    const lockX = W / 2 + Math.sin(1.2 * 1.35) * W * 0.3;
    if (t < 1.2) {
      const pp = t4PlayerPos(t, W, H);
      c.save(); c.setLineDash([5, 4]); c.strokeStyle = 'rgba(255,90,70,' + (0.45 + 0.25 * Math.sin(t * 10)) + ')';
      c.beginPath(); c.ellipse(pp[0], H - 14, 22, 8, 0, 0, Math.PI * 2); c.stroke(); c.restore();
      t4Heavy(c, pp[0], 84, 0.9);
    } else if (t < 1.6) {
      const p = (t - 1.2) / 0.4;
      c.save(); c.setLineDash([5, 4]); c.strokeStyle = 'rgba(255,90,70,0.85)';
      c.beginPath(); c.ellipse(lockX, H - 14, 22, 8, 0, 0, Math.PI * 2); c.stroke(); c.restore();
      t4Heavy(c, lockX, 84 + p * 120, 0.9);
    } else {
      const p = t - 1.6;
      t4Heavy(c, lockX, H - 38, 0.9);
      const fr = Math.max(0, 1 - p / 0.22);
      if (fr > 0) {
        c.fillStyle = 'rgba(255,120,70,' + 0.5 * fr + ')';
        c.beginPath(); c.arc(lockX, H - 20, 26, 0, Math.PI * 2); c.fill();
      }
      if (p < 0.9) {
        c.strokeStyle = 'rgba(255,150,90,' + 0.8 * (1 - p / 0.9) + ')'; c.lineWidth = 3;
        c.beginPath(); c.arc(lockX, H - 20, p / 0.9 * 74, 0, Math.PI * 2); c.stroke();
      }
    }
  }
  // ⑨ 夏勇·暗壁（下方半圆护盾：中路弹被挡 → 蓝火花；两侧绕边弹命中本体 → 红火花）
  function t4DrawShield(c, t, dt, W, H, st) {
    const mx = W / 2, my = 112;
    t4Heavy(c, mx, my, 0.9);
    c.save();
    const grd = c.createRadialGradient(mx, my, 30, mx, my, 54);
    grd.addColorStop(0, 'rgba(120,180,255,0.02)');
    grd.addColorStop(1, 'rgba(140,200,255,0.2)');
    c.fillStyle = grd;
    c.beginPath(); c.arc(mx, my, 50, Math.PI * 0.12, Math.PI * 0.88); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(140,200,255,0.8)'; c.lineWidth = 2;
    c.beginPath(); c.arc(mx, my, 50, Math.PI * 0.12, Math.PI * 0.88); c.stroke();
    c.restore();
    const tick = Math.floor(t / 0.24);
    if (st.misc.tick !== tick) {
      if (st.misc.tick === undefined || tick < st.misc.tick) { st.bullets.length = 0; st.flashes.length = 0; }
      st.misc.tick = tick;
      st.bullets.push({ x: mx, y: H - 24, vx: 0, vy: 200, side: 0 });
      st.bullets.push({ x: 14, y: H - 24, vx: 92, vy: 180, side: -1 });
      st.bullets.push({ x: W - 14, y: H - 24, vx: -92, vy: 180, side: 1 });
    }
    for (let i = st.bullets.length - 1; i >= 0; i--) {
      const b = st.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      let hit = false;
      if (!b.side) {
        if (b.y <= my + 48) { st.flashes.push({ x: mx, y: my + 48, age: 0, cc: '150,200,255' }); hit = true; }
      } else {
        const dx = b.x - mx, dy = b.y - my;
        if (dx * dx + dy * dy < 26 * 26) { st.flashes.push({ x: b.x, y: b.y, age: 0, cc: '255,120,90' }); hit = true; }
      }
      if (hit || b.y < -12) st.bullets.splice(i, 1);
    }
    st.bullets.forEach(b => {
      c.fillStyle = b.side ? '#9fe0ff' : '#cfeaff';
      c.beginPath(); c.arc(b.x, b.y, 2.6, 0, Math.PI * 2); c.fill();
    });
    for (let i = st.flashes.length - 1; i >= 0; i--) {
      const f = st.flashes[i];
      f.age += dt;
      const a = 1 - f.age / 0.3;
      if (a <= 0) { st.flashes.splice(i, 1); continue; }
      c.strokeStyle = 'rgba(' + f.cc + ',' + a + ')'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(f.x, f.y, 3 + f.age * 42, 0, Math.PI * 2); c.stroke();
    }
  }
  // ⑩ 辛国栋·地毯轰炸（横移投弹 → 落点圈预警 → 橙闪连锁爆炸）
  function t4DrawBombs(c, t, dt, W, H, st) {
    const mx = W / 2 + Math.sin(t * 1.2) * 58, my = 32;
    t4Bomber(c, mx, my, 0.9);
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.beginPath(); c.moveTo(0, H - 14); c.lineTo(W, H - 14); c.stroke();
    const tick = Math.floor(t / 0.5);
    if (st.misc.tick !== tick) {
      if (st.misc.tick === undefined || tick < st.misc.tick) { st.bullets.length = 0; st.flashes.length = 0; }
      st.misc.tick = tick;
      st.bullets.push({ x: mx, y: my + 10 });
    }
    for (let i = st.bullets.length - 1; i >= 0; i--) {
      const b = st.bullets[i];
      b.y += 135 * dt;
      c.save(); c.setLineDash([3, 3]); c.strokeStyle = 'rgba(255,140,70,0.6)';
      c.beginPath(); c.arc(b.x, H - 16, 10, 0, Math.PI * 2); c.stroke(); c.restore();
      if (b.y >= H - 16) {
        st.flashes.push({ x: b.x, age: 0 });
        st.bullets.splice(i, 1);
        continue;
      }
      c.fillStyle = '#ff8a4d';
      c.beginPath(); c.arc(b.x, b.y, 3, 0, Math.PI * 2); c.fill();
    }
    for (let i = st.flashes.length - 1; i >= 0; i--) {
      const f = st.flashes[i];
      f.age += dt;
      const a = 1 - f.age / 0.35;
      if (a <= 0) { st.flashes.splice(i, 1); continue; }
      c.fillStyle = 'rgba(255,140,60,' + 0.5 * a + ')';
      c.beginPath(); c.arc(f.x, H - 16, 8 + f.age * 55, 0, Math.PI * 2); c.fill();
    }
  }
  // ⑪ 辛国栋·十二连发（两批各 12 发，轻追踪：vx 朝玩家位置缓慢修正）
  function t4DrawMissiles(c, t, dt, W, H, st) {
    t4Bomber(c, W / 2, 32, 0.95);
    [0.3, 1.7].forEach((vt, v) => {
      const key = 'v' + v;
      if (t < vt) { st.misc[key] = 0; return; }
      if (!st.misc[key]) {
        st.misc[key] = 1;
        for (let i = 0; i < 12; i++) {
          const x = W * (0.1 + 0.8 * i / 11);
          st.bullets.push({ x, y: 50, vx: (x - W / 2) * 0.9, vy: 70 });
        }
      }
    });
    if (t < 0.05) st.bullets.length = 0;
    const pp = t4PlayerPos(t, W, H);
    for (let i = st.bullets.length - 1; i >= 0; i--) {
      const b = st.bullets[i];
      b.vy = Math.min(160, b.vy + 130 * dt);
      b.vx += Math.max(-60, Math.min(60, (pp[0] - b.x) * 1.5)) * dt;
      const ox = b.x - b.vx * 0.05, oy = b.y - b.vy * 0.05;
      b.x += b.vx * dt; b.y += b.vy * dt;
      c.strokeStyle = 'rgba(255,90,70,0.5)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(ox, oy); c.lineTo(b.x, b.y); c.stroke();
      if (b.y > H + 4) { st.bullets.splice(i, 1); continue; }
      c.fillStyle = '#ff5a4d';
      c.beginPath(); c.arc(b.x, b.y, 2.4, 0, Math.PI * 2); c.fill();
    }
  }

  function renderInfoTest2() {
    infoBody.innerHTML = '';
    infoAppendNote('<b>赞助无人机图案备选</b>——核心标志（机体中心）与道具箱图案（盒子中心）分开评选。鼠标悬停可放大查看。');

    // ── 核心标志备选 ──
    const markTitle = document.createElement('h3');
    markTitle.textContent = '核心标志（机体中心）';
    markTitle.style.cssText = 'margin:16px 0 8px;color:#ffd166;font-size:14px;';
    infoBody.appendChild(markTitle);
    const markRow = document.createElement('div');
    markRow.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;';
    infoBody.appendChild(markRow);
    const marks = [
      { fn: paintDouzhiMark, label: '当前', name: '上扬双箭头' },
      { fn: paintMarkA, label: 'A', name: '交叉闪电' },
      { fn: paintMarkB, label: 'B', name: '六边形宝石' },
      { fn: paintMarkC, label: 'C', name: '五角星辉光' },
      { fn: paintMarkD, label: 'D', name: '菱形钻石' },
      { fn: paintMarkE, label: 'E', name: '礼物蝴蝶结' },
    ];
    marks.forEach(m => {
      const card = document.createElement('div');
      card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;';
      const cvs = document.createElement('canvas');
      cvs.width = 64; cvs.height = 64;
      cvs.style.cssText = 'width:64px;height:64px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(120,180,255,0.1);transition:transform 0.15s,border-color 0.15s;';
      cvs.addEventListener('mouseenter', () => { cvs.style.transform = 'scale(1.8)'; cvs.style.borderColor = 'rgba(255,209,102,0.5)'; });
      cvs.addEventListener('mouseleave', () => { cvs.style.transform = ''; cvs.style.borderColor = 'rgba(120,180,255,0.1)'; });
      const c = cvs.getContext('2d');
      c.translate(32, 32);
      // 用暗底色模拟机体背景
      c.fillStyle = '#1a1d23'; c.fillRect(-20, -20, 40, 40);
      withPreviewCtx(c, () => {
        m.fn(0, 0, 8, 0.5 + Math.sin(state.time * 2) * 0.5);
      });
      card.appendChild(cvs);
      const lbl = document.createElement('span');
      lbl.textContent = `${m.label} ${m.name}`;
      lbl.style.cssText = 'font-size:11px;color:#9fb4d8;';
      card.appendChild(lbl);
      markRow.appendChild(card);
    });

    // ── 道具箱图案备选 ──
    const boxTitle = document.createElement('h3');
    boxTitle.textContent = '道具箱图案（盒子中心标记）';
    boxTitle.style.cssText = 'margin:16px 0 8px;color:#ffd166;font-size:14px;';
    infoBody.appendChild(boxTitle);
    const boxRow = document.createElement('div');
    boxRow.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;';
    infoBody.appendChild(boxRow);
    // 用赞助无人机白盒样式画背景
    const boxColors = { mark: '#2b6fd6', light: '#ffffff', mid: '#dfe6ee', dark: '#aeb9c6', base: '#1a1d23' };
    const boxes = [
      { fn: paintBoxMark1, label: '1', name: '问号' },
      { fn: paintBoxMark2, label: '2', name: '小闪电' },
      { fn: paintBoxMark3, label: '3', name: '蝴蝶结' },
      { fn: paintBoxMark4, label: '4', name: '六角星' },
      { fn: paintBoxMark5, label: '5', name: '钻石切割' },
    ];
    // 当前图案（空心正方形）也展示对比
    const currentBox = document.createElement('div');
    currentBox.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;';
    const curCvs = document.createElement('canvas');
    curCvs.width = 64; curCvs.height = 64;
    curCvs.style.cssText = 'width:64px;height:64px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(120,180,255,0.1);transition:transform 0.15s,border-color 0.15s;';
    curCvs.addEventListener('mouseenter', () => { curCvs.style.transform = 'scale(1.8)'; curCvs.style.borderColor = 'rgba(255,209,102,0.5)'; });
    curCvs.addEventListener('mouseleave', () => { curCvs.style.transform = ''; curCvs.style.borderColor = 'rgba(120,180,255,0.1)'; });
    const cc = curCvs.getContext('2d');
    cc.translate(32, 32);
    cc.fillStyle = '#1a1d23'; cc.fillRect(-20, -20, 40, 40);
    withPreviewCtx(cc, () => {
      // 画白盒背景 + 当前空心正方形
      const hw = 10.5, hh = 8.6 * 0.85, r = 2.6;
      const rr = (x, y, w, h, rad) => { ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad); ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath(); };
      rr(-hw, -hh, hw * 2, hh * 2, r); ctx.fillStyle = boxColors.base; ctx.fill();
      const bg = ctx.createLinearGradient(-hw, -hh, hw, hh);
      bg.addColorStop(0, boxColors.light); bg.addColorStop(0.5, boxColors.mid); bg.addColorStop(1, boxColors.dark);
      rr(-hw, -hh, hw * 2, hh * 2, r); ctx.fillStyle = bg; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1; rr(-hw, -hh, hw * 2, hh * 2, r); ctx.stroke();
      // 当前图案：空心正方形
      ctx.strokeStyle = boxColors.mark; ctx.lineWidth = 1.6;
      ctx.strokeRect(-4.5, -4.5, 9, 9);
    });
    currentBox.appendChild(curCvs);
    const curLbl = document.createElement('span');
    curLbl.textContent = '当前 空心正方形';
    curLbl.style.cssText = 'font-size:11px;color:#9fb4d8;';
    currentBox.appendChild(curLbl);
    boxRow.appendChild(currentBox);

    boxes.forEach(b => {
      const card = document.createElement('div');
      card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;';
      const cvs = document.createElement('canvas');
      cvs.width = 64; cvs.height = 64;
      cvs.style.cssText = 'width:64px;height:64px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(120,180,255,0.1);transition:transform 0.15s,border-color 0.15s;';
      cvs.addEventListener('mouseenter', () => { cvs.style.transform = 'scale(1.8)'; cvs.style.borderColor = 'rgba(255,209,102,0.5)'; });
      cvs.addEventListener('mouseleave', () => { cvs.style.transform = ''; cvs.style.borderColor = 'rgba(120,180,255,0.1)'; });
      const c = cvs.getContext('2d');
      c.translate(32, 32);
      c.fillStyle = '#1a1d23'; c.fillRect(-20, -20, 40, 40);
      withPreviewCtx(c, () => {
        // 画白盒背景
        const hw = 10.5, hh = 8.6 * 0.85, r = 2.6;
        const rr = (x, y, w, h, rad) => { ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad); ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath(); };
        rr(-hw, -hh, hw * 2, hh * 2, r); ctx.fillStyle = boxColors.base; ctx.fill();
        const bg = ctx.createLinearGradient(-hw, -hh, hw, hh);
        bg.addColorStop(0, boxColors.light); bg.addColorStop(0.5, boxColors.mid); bg.addColorStop(1, boxColors.dark);
        rr(-hw, -hh, hw * 2, hh * 2, r); ctx.fillStyle = bg; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1; rr(-hw, -hh, hw * 2, hh * 2, r); ctx.stroke();
        // 候选图案
        b.fn(0, 0, 4.5, boxColors.mark);
      });
      card.appendChild(cvs);
      const lbl = document.createElement('span');
      lbl.textContent = `${b.label} ${b.name}`;
      lbl.style.cssText = 'font-size:11px;color:#9fb4d8;';
      card.appendChild(lbl);
      boxRow.appendChild(card);
    });

    infoAppendNote('选定后告知编号，我替换到机体/盒子上。核心标志颜色统一淡黄辉光（与斗志昂扬一致），道具箱图案颜色用盒子反差色（白盒→深蓝 / 淡黄盒→深金）。');
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