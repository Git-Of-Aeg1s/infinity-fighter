// 01-config-enemies：敌机注册表与调色（含 4S 精英 / 战争幽灵 / 法术阵列 / 炮艇变体 / 紫电系）（《并行开发改造设计.md》批次 1c 自 01-config.js 拆出）

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：01-config-boss(1 名) 01-config-difficulty(2 名) 02-achievements(1 名) 02-core(1 名) 04-spawn(32 名) 05-boss(4 名) 06-enemy(33 名) 07-player(2 名) 08-entities(4 名) 09b-draw-enemies(17 名) 10-draw-world(6 名) 11-draw-boss(1 名) 12-ui(1 名) 13-encyclopedia(10 名) 14-main(2 名)
  // 配置域群（01x）内部单向依赖：加载序见 index.html（core→loadout→enemies→boss→difficulty→spawn→achievements），对外只出不进

  import { CANVAS_H } from './01-config-core.js';


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
      w: 67, h: 54, hp: 1200, score: 500, color: '#ff7a18', drawScale: 1.36,   // 本体缩小 20%（w/h/drawScale 同步；原比 3 类炮艇大 10%）；分数 500（2026-10-10 按怪物属性总表同步，原 600）
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
    // 碰撞伤害原 42 已改持续掉血模型（06-enemy tornado 分支：每 0.1s 扣 4 血 / 诗篇 5，不触发无敌帧）——crashDmg 键已删
    tornado: {
      w: 144, h: 144, hp: 3600, score: 0, color: '#eaf6ff', drawScale: 1,
      bulletSpeed: 170, bulletR: 5, bulletDmg: 16,
      fireInterval: [0.2, 0.3],
      fireIntervalPoem: [0.14, 0.21],   // 诗篇射击间隔 = 基准 -30%（2026-10-10 用户定稿；06-enemy 开火处 isPoem() 取值，登记《诗篇难度修正.md》）
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
      w: 90, h: 90, hp: 2400, score: 600, color: '#ff4d5e', drawScale: 1,   // 碰撞盒 ≈ 骑边拼合体外接方（外轮廓半径 44 = 三角形顶点距中心，外接 88 酌收）；血量 2400（2026-10-10 用户定稿，原 800）；诗篇血量 4000（POEM_HP.pulseMatrix，makeEnemy 按难度覆盖）；分数/水晶与焦香螺旋桨等同
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
      w: 110, h: 84, hp: 1200, score: 1000, color: '#b21820', drawScale: 1.6,   // 四精英统一黑红（2026-10-02）；分数 1000（2026-10-10 按怪物属性总表同步，原 650）——朴学峰
      bulletSpeed: 230, bulletR: 5, bulletDmg: 10, crashDmg: 40, crashDmgPoem: 48,   // 冲撞贯穿伤害诗篇 48（2026-10-10 用户定稿；基准 40 不变——仅流星穿刺贯穿结算用，贴身通用碰撞仍走 crashDmg）
      fireInterval: [1e9, 1e9],
    },
    hanxixian: {        // 猩红韩希先（原名 韩希先）：三眼炮座——凝视锁定 / 旋眼火螺（两技循环）
      w: 110, h: 84, hp: 1200, score: 1000, color: '#b21820', drawScale: 1.6,   // 四精英统一黑红；分数 1000（2026-10-10 按总表同步）——韩希先
      bulletSpeed: 230, bulletR: 5, bulletDmg: 10, crashDmg: 40,
      fireInterval: [1e9, 1e9],
    },
    xiayong: {          // 铜皮夏勇（原名 夏勇）：重装壁垒——屏障 / 碎翼回旋刃 / 核心膨胀（暗壁 2026-10-03 移除；屏障同日新增）
      w: 110, h: 84, hp: 1200, score: 1000, color: '#b21820', drawScale: 1.6,   // 四精英统一黑红；分数 1000（2026-10-10 按总表同步）——夏勇
      bulletSpeed: 230, bulletR: 5, bulletDmg: 10, crashDmg: 40,
      fireInterval: [1e9, 1e9],
    },
    xinguodong: {       // 暴怒辛国栋（原名 辛国栋）：轰炸平台——地毯轰炸 / 十二连发
      w: 110, h: 84, hp: 1200, score: 1000, color: '#b21820', drawScale: 1.6,   // 四精英统一黑红；分数 1000（2026-10-10 按总表同步）——辛国栋
      bulletSpeed: 230, bulletR: 5, bulletDmg: 10, crashDmg: 40,
      fireInterval: [1e9, 1e9],
    },
  };

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
    entrySpeed: 200,     // 入场初速（2026-10-10 用户定稿 200），在 entryDecay 内线性衰减回 descend；离场仍为 descend
    entryDecay: 1,       // 入场初速衰减时长（s）
    // 首波充能：1.5~2.5s 变红（逐机随机，充满即召唤首发）+ 3s 灰黑覆盖（无静止保持段）
    chargeFirstMin: 1.5, // 首波：红色扩展时长下限（2026-10-10 用户定稿：首攻 1.5~2.5s 逐机随机；实值存 e.chargeFirstDur）
    chargeFirstMax: 2.5, // 首波：红色扩展时长上限（诗篇 BOSS 双召唤强制 1.5s / 2.5s 各一）
    coverFirst: 3,       // 首波：灰黑从中心覆盖红色的时长（与后续波复位同义，无静止保持段）
    // 后续每波充能：2s 变红（充满即召唤）+ 1s 复位（灰黑覆盖红）+ 1.5s 保持全灰黑
    charge: 2,           // 后续波：红色扩展时长
    reset: 1,            // 后续波：灰黑复位（覆盖红）时长
    grayHold: 1.5,       // 后续波：保持全灰黑静止时长（charge+reset+grayHold = 4.5s）
    cycle: 4.5,          // 每波固定时长（首波与后续波均为 4.5s）
    maxMissiles: 5,      // 入场即充能：首发 1.5~2.5s，后续每波红相 2s 召唤，共 1+4=5 发（末发约 20s 后离场）
    hold: 20,            // 就位停留时长（2026-10-10 用户定稿 20s 后离场；到期时若红相充能未释放，则释放完再走——见 06-enemy 移动分支）
    warnTime: 2,         // 导弹垂直预警线时长（2026-10-10 用户定稿：3s→2s 统一调整）
    missileSpeed: 1400,  // 导弹从上方下落速度（高速）
    missileR: 12,        // 导弹半径（宽于常规子弹）
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
    dwell: 20,           // 到位后停留时长（2026-10-10 用户定稿 22 → 20）
  };

  // 铁砧参数（特殊3类治疗无人机）：登场后展开正方形淡青绿治疗光环，圈内所有敌人（含自身）每秒回复
  // 1.5% 最大生命 + 固定生命（常规 50 / 诗篇 100——2026-10-10 用户定稿，原 1%+60 无诗篇分档；诗篇值登记《诗篇难度修正.md》）
  const ANVIL = {
    speed: 240,          // 下降/离场速度（同御4）
    auraDelay: 0.5,      // 登场后治疗光环显现延迟
    auraFadeIn: 0.6,     // 光环渐显时长（延迟后从透明淡入到完全体）
    auraR: 150,          // 治疗光环半径（正方形半边长，覆盖悬停带内相邻敌人）
    healInterval: 1,     // 治疗触发间隔（每秒一次）
    healRatio: 0.015,    // 每次回复目标最大生命的 1.5%（2026-10-10 用户定稿 1% → 1.5%）
    healFlat: 50,        // 每次额外回复固定 50 生命（2026-10-10 用户定稿 60 → 50）
    healFlatPoem: 100,   // 诗篇难度固定回复 100（2026-10-10 用户定稿，见 06-enemy anvilHealTick）
    dwell: 20,           // 到位后停留时长（2026-10-10 用户定稿 22 → 20，同御4）
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
    entrySpeed: 280,       // 顶部入场初速（2026-10-10 用户定稿 280），在 entryDecay 内线性衰减回巡航速；侧翼入场无加成
    entryDecay: 1,         // 入场初速衰减时长（s）
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
    speed: 180,            // 直线飞行速度（巡航）
    entrySpeed: 250,       // 入场初速（2026-10-10 用户定稿 250），在 entryDecay 内线性衰减回巡航速
    entryDecay: 1,         // 入场初速衰减时长（s）
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
      bulletSpeed: 300, bulletR: 5, dmg: 16, poemDmg: 22,   // 2026-10-10 用户定稿伤害 10→16 / 诗篇 22（弹速定值 300——历史见下）
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
      trackT: 0.5, holdT: 0.5, laserHalfW: 15, laserDmg: 45, poemLaserDmg: 55,   // 激光伤害诗篇 55（2026-10-10 用户定稿；基准 45 不变）
      // 粗激光持续时长按难度（2026-10-04 用户指定：较原 0.9s 减少 0.4/0.3/0.1/0——虚象/具象/真我/诗篇，诗篇不变）
      illusionLaserDur: 0.5, formLaserDur: 0.6, realmeLaserDur: 0.8, laserDur: 0.9,
      // 技能2 旋眼火螺：三炮塔环绕本体 orbitR 旋转 orbitDur，每眼每 fireIv 沿径向射一发长条弹
      //（fireIv 2026-10-02 用户指定 -40%：0.18 → 0.108；诗篇改加速长条弹：初速≈0 → 180% 弹速，
      // 登记《诗篇难度修正.md》），中途反转一次
      orbitR: 58, orbitDur: 3.0, orbitSpd: 2.4, turretN: 3, fireIv: 0.108,
      bulletSpeed: 210, bulletR: 5, dmg: 16, poemDmg: 22,   // 2026-10-10 用户定稿伤害 10→16 / 诗篇 22
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
      bladeRx: 190, bladeRy: 64, bladeRyRand: 0.2, bladeCyOff: 150, bladeDur: 1.8, bladeR: 24, bladeDmg: 30, poemBladeDmg: 36,   // 刃伤诗篇 36（2026-10-10 用户定稿；基准 30 不变）
      // bladeRyRand 0.2 = 2026-10-03 四轮定稿：每次施放时轨道纵向半径随机增长 0~0.2×屏高（e.elSkill.ry 施放期快照，预警椭圆/迸出/绕行/湮灭全同步）
      bladeWarn: 0.9, bladeOut: 0.35,   // bladeWarn 0.9 = 2026-10-03 三轮定稿：预警时长 +0.4s（原 0.5）
      // 技能2 核心膨胀：一次推出三颗缓慢膨胀黑红能量球（基准朝玩家方向、相邻夹角 60°，方向锁定施放瞬间
      // 玩家方位缓慢漂移不跟踪），飞行 orbDur 后各自原地爆散环形弹——分裂弹数按难度（2026-10-04 用户指定
      // 四难度）：6 / 7 / 8 / 10；移速 72 / 膨胀速率 9.2（体型不变：出生 14 / 上限 60，爆散时半径约 32）
      orbR: 60, orbSpd: 72, orbDur: 2.0, orbGrow: 9.2, orbDmg: 48, poemOrbDmg: 55, ringN: 6, formRingN: 7, realmeRingN: 8, poemRingN: 10, ringSpeed: 200, ringDmg: 16, poemRingDmg: 22,   // 能量球接触独立（2026-10-10 用户定稿 12→48 / 诗篇 55）；爆散环弹 12→16 / 诗篇 22（同日定稿）
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
      bombR: 73, realmeBombR: 60, poemBombR: 75, bombDmg: 30, poemBombDmg: 38, bombBandPct: 0.72,   // 爆炸伤害诗篇 38（2026-10-10 用户定稿；基准 30 不变）
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
      missileDmg: 20, poemMissileDmg: 26, missileR: 6,   // 2026-10-10 用户定稿 14→20 / 诗篇 26
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
    entrySpeed: 180,       // 登场横移初速（px/s，2026-10-10 用户定稿 120 → 180），1s 内二次缓出衰减到巡航速
    entrySpeedPoem: 240,   // 登场横移初速 · 诗篇难度（2026-10-10 用户定稿）
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

  // 2类（突击艇）前锋停留线：位于 3/4 类悬停高度（y≈110~170）的前方（更靠下），凸显其前锋定位
  const STRIKER_HOLD_Y = 210;

  // 3/4 类舰入场初速（2026-10-10 用户定稿）：登场以初速直冲、decay(s) 内线性衰减至各自巡航速（炮艇 270 / 主力舰 250）；
  // 诗篇难度用 poem 档。入场倒计时 e.entryT 在 06-enemy 共享下降分支懒初始化（挑战/BOSS 召唤体同样生效）
  const SHIP_ENTRY = {
    gunship: { v0: 320, poem: 360 },
    capital: { v0: 280, poem: 300 },
    decay: 1,
  };
  const STRIKER_POEM_ENTRY = 200;   // 2类突击艇诗篇难度入场速度（常规 160，2026-10-10 用户定稿）

  // 坚垒护卫艇（2类黄色变体，2026-09-28 新增）：机体为霜白突击艇上下倒置 + 前置能量盾（下方机体边框两条线增粗外移 + 流光，绘制见 09b-draw-enemies drawFortressStrikerBody）
  // 2026-10-03 起取消能量盾减伤机制，改为单纯高血量；2026-10-10 起移除移速 60% 负修正（入位/冲锋与全体突击艇同速）
  const STRIKER_FORTRESS = {
    hp: 300,          // 血量（VARIANTS.striker 条目同步定义 hp: 300）
    holdYOffset: 48,  // 停留位置较普通 2类前锋停留线（y 200~240）下移量（px）：更靠前、贴近玩家
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
      // 入位已统一（2026-10-10 用户定稿）：全体入位 160（诗篇 200，04-spawn makeEnemy 覆盖）、冲锋基准 120——字段保留以便日后按变体再分化
      // firstDelay = 首次开火额外延迟（数值或 [min,max] 区间）；iv = 变体专属攻击间隔（缺省用注册表 fireInterval）
      { id: 'crimson', color: '#ff3b30', weight: 0.26, skill: 'straight', firstDelay: [0.2, 0.6], entry: 160, charge: 120 },   // 赤红：直射 ±10° 偏差、不追踪
      { id: 'amber',   color: '#ff8a5c', weight: 0.26, skill: 'spread', firstDelay: [0.4, 0.8], entry: 160, charge: 120, iv: [1.4, 2.4] },     // 烈橙：前方双弹，夹角 40°/50°/60° 随机（间隔独享 1.4~2.4s）
      { id: 'azure',   color: '#4d9fff', weight: 0.21, skill: 'homing', firstDelay: [0.5, 1], entry: 160, charge: 120 },        // 幽蓝：朝玩家 ±20° 随机偏转单发（蓝=盾+乱射）、登场 10% 1s / 10% 2s 虚化护盾
      { id: 'violet',  color: '#c084fc', weight: 0.21, skill: 'violet', firstDelay: [0.5, 1], entry: 160, charge: 120, iv: [1.4, 2.3] },     // 紫晶：单发精确追踪弹（紫=追踪）；间隔较幽蓝 +0.3s、无虚化护盾、首攻不额外延长
      { id: 'white',   color: '#eaf1f8', weight: 0.15, skill: 'silent', entry: 160, charge: 120 },                              // 霜白：不开火（停留规则与普通 2类一致）
      { id: 'fortress', color: '#ffd166', weight: 0.21, skill: 'fortress', hp: 800, entry: 160, charge: 120 },                  // 坚垒护卫艇：黄色倒置机体+前置能量盾（仅外观）；不开火、移速与全体突击艇同速（2026-10-10 取消 60% 负修正）、停留位置下移 48px（STRIKER_FORTRESS）；高血量 HP 800 承担承伤职能（2026-10-03 取消减伤；2026-10-08 用户定稿 300→800，诗篇仍走 POEM_HP.striker_fortress = 3000 绝对覆盖）；出现权重同幽蓝（见 04-spawn STRIKER_VARIANT_TIERS）
      { id: 'dusk',    color: '#14161c', weight: 0.12, skill: 'dusk' },                       // 幽暮：黑色机白核；出现权重按关卡分档直接取值（Lv1~10 为 2 / Lv11~20 为 5，见 strikerVariantWeights）
    ],
    gunship: [
      // hp = 血量覆盖；speed = 下降/离场速度（2026-10-10 用户定稿：全体统一 270，入场初速 320/诗篇 360 见 SHIP_ENTRY）；firstFire = 首射延迟区间
      { id: 'violet',  color: '#c084fc', weight: 0.5, skill: 'mixed', hp: 400, speed: 270, firstFire: [1.1, 1.9] },
      { id: 'crimson', color: '#ff5a5a', weight: 0.3, skill: 'aggressive', hp: 400, speed: 270, firstFire: [1.0, 1.7] },
      { id: 'amber',   color: '#ffbf47', weight: 0.2, skill: 'ring', hp: 420, speed: 270, firstFire: [1.2, 2.4] },   // 金曜（黄）
      { id: 'orange',  color: '#ff7e2e', weight: 0.2, skill: 'orange', hp: 400, speed: 270, firstFire: [1.1, 1.9] },  // 橙焰（炽橙=大炮弹；主题色与威龙 #ff9a1a 区分）
      { id: 'cyan',    color: '#45e0e8', weight: 0.2, skill: 'cyan', hp: 400, speed: 270, firstFire: [1.1, 1.9] },   // 青时（青=召唤/屏障支援；主题色与增生侧翼艇 #7fe8c9 区分）
    ],
    capital: [
      // speed = 下降/离场速度（2026-10-10 用户定稿：全体统一 250，入场初速 280/诗篇 300 见 SHIP_ENTRY）；wLow/wHigh = 变体选取权重（Lv1~10 / Lv11~20 分档，见 pickVariant）
      { id: 'crimson', color: '#ff4d6d', wLow: 0.5, wHigh: 0.3, skill: 'barrage', speed: 250 },
      { id: 'azure',   color: '#4d9fff', wLow: 0.3, wHigh: 0.15, skill: 'lance', speed: 250 },   // 出现时 20% 带护盾（前 5s 虚化）
      { id: 'crgold',  color: '#ff9a1a', wLow: 0.3, wHigh: 0.15, skill: 'crgold', speed: 250, hp: 4600 },  // 赤金主力舰：橙黄舰体 + 旋转双环 + 三技能；血量 4600（其余主力舰 4200）
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

  export {
    ENEMY_CLASS, ENEMY_GRADES, enemyGrade, ENEMY_TYPES,
    WIP_PLACEHOLDER_TYPES, HARBINGER, WEILONG, HANSHUANG,
    YU4, ANVIL, BAOLING, BAOLING_G,
    UNREAL, JIAOXIANG, DOUZHI, SPONSOR,
    FASHI_A1, FASHI_A2, POPIAN, POPIAN_U,
    WAR_GHOST, ELITES, ZHANGZHANG, FASHI_MATRIX,
    PULSE_MATRIX, FASHI_ARRAY, STRIKER_HOLD_Y, STRIKER_FORTRESS,
    SHIP_ENTRY, STRIKER_POEM_ENTRY,
    DUSK, VARIANTS, STRIKER_SPEED_MUL, SIDE_SPEED_FAST,
    SIDE_SPEED_SLOW, SIDE_ENTRY_BOOST, SIDE_ENTRY_DECAY, SHIP_BULLET_COLOR,
    SHIP_BULLET_LEN, SPLIT_RED, PHASE_DURATION, PHASE_CHANCE,
    CAPITAL_PALETTE, GUNSHIP_PALETTE,
    SIDE_BEHAVIOR_COLORS, SIDE_MOON,
    SIDE_SWIRL, SIDE_SPAWN_W, SIDE_SHOOT_HP, SIDE_SCORE,
    SIDE_KAMIKAZE_SCORE,
  };
