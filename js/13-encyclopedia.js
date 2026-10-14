// 13-encyclopedia：怪物图鉴数据 / UI / 形态预览绘制

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：12-ui(2 名) 14-main(5 名)
  //
  import { CANVAS_H, CANVAS_W, hanxixianImg, puxuefengImg, xiayongImg, xinguodongImg } from './01-config-core.js';
  import { ARMORS, BERSERK, BULWARK, PILOTS, PLANES, PLAYER_CFG, STARSLAYER, SUB_WEAPONS, WEAPON_LEVELS, WINGMAN, WINGMAN_LEVELS, WINGMEN_CFG, currentPlane } from './01-config-loadout.js';
  import { DOUZHI, ELITES, ENEMY_TYPES, FASHI_A1, FASHI_ARRAY, FASHI_MATRIX, HARBINGER, POPIAN, VARIANTS, enemyGrade } from './01-config-enemies.js';
  import { BOSS, DARKHAND, STORM, STORM2 } from './01-config-boss.js';
  import { DIFFICULTIES, currentDifficulty, diffMods, eliteHpOf, isPoem, poemHpOf, resolveBossHp, setDifficulty } from './01-config-difficulty.js';
  import { REWARD_DRONES, REWARD_ITEMS, rewardDroneChance, WAVE_SPAWN_DRAW_W, WAVE_SPAWN_LIST, WAVE_SPAWN_W, WAVE_SPAWN_W_DEFAULT } from './01-config-spawn.js';   // 刷怪权重（波次刷怪权重）/抽取权重数据自 2026-10-12 迁 01-config-spawn（供 04-spawn 抽取消费，13 单向引用展示）
  import { DPR, canvas, clamp, ctx, diffGrid, encyDetail, encyDiffGroup, encyList, encyTabs, encyclopedia, infoBody, infoClose, infoEntryBtn, infoModal, infoTabs, levelFlow, overlay, setCtx, state } from './02-core.js';   // encyDiffGroup：按钮组改全文档 querySelectorAll 后不再直接引用，保留占位（02-core 归域契约名，12-ui 同用）
  import { SPECIAL3_POOL, WAVE_FORMATIONS, sideSpawnWeights, special3Weight, spawnDiagonalRaid, spawnGunshipWings, spawnMirrorRow, spawnSideColumn, spawnSideGroup, spawnSideKamikazeStream, spawnSideSweep, spawnStrikerGroup, spawnStrikerVee, strikerVariantWeights } from './04-spawn.js';
  import { WEAPON_LINES } from './07-player.js';
  import { paintShip, paintWingman, paintWingmanBulwark } from './09a-draw-loadout.js';
  import { paintWarGhostCandidate } from './09b-draw-enemies.js';
  import { drawEnemy } from './10-draw-world.js';
  import { drawBoss } from './11-draw-boss.js';
  import { resetGame } from './12-ui.js';
  import { renderInfoAchievements } from './02-achievements.js';



  // ---------- 怪物图鉴 ----------
  const ENCY_GRADES = [
    // 排序规则（2026-10-03 用户定稿）：同类内先按机体颜色族排列（白红橙黄紫青/蓝……各档固定顺序），颜色族后按机型族分组；
    // 【登记规则】之后再新增某等级的新敌人时，图鉴位置**暂时放到该等级分页的最下方**（当前各档全等级齐备的排序为基准），
    // 下次整档重排时再归入颜色/机型序列
    { name: '虚象级', entries: ['side_moon', 'side_swirl', 'side_shoot', 'side_pass', 'side_kamikaze', 'prolifera'] },   // 赤月/橙旋/黄芒/白影（黄芒之下）/紫电 + 增生（青）
    { name: '具象级', entries: ['striker_crimson', 'striker_amber', 'striker_azure', 'striker_violet', 'striker_white', 'striker_fortress', 'striker_dusk', 'fashiMatrix', 'popian', 'popianU', 'fashiA1', 'douzhi', 'sponsor', 'sponsorDeluxe'] },   // 赤红/烈橙/幽蓝/紫晶/霜白（紫晶之下）/坚垒(黄)/幽暮(黑) + 矩阵/破片/破片U/A1/斗志/赞助/豪华
    { name: '真我级', entries: ['gunship_crimson', 'gunship_orange', 'gunship_amber', 'gunship_violet', 'gunship_cyan', 'harbinger', 'pulseMatrix', 'yu4', 'hanshuang', 'baoling', 'baolingG', 'weilong', 'anvil', 'jiaoxiang', 'fashiA2', 'unreal'] },   // 赤红/橙焰/金曜(黄)/紫晶/青时 + 先兆/脉冲/御4/寒霜/暴鸰/暴鸰G/威龙/铁砧/焦香/A2/虚幻
    // 诗篇级：张华&张策 = wip 白方块占位，其余全部实装（专属外观预览）；四精英顺序 = 朴→夏→韩→辛
    { name: '诗篇级', entries: ['capital_crimson', 'capital_crgold', 'capital_azure', 'fashiArray', 'warMatrix', 'warGhost', 'puxuefeng', 'xiayong', 'hanxixian', 'xinguodong', 'zhangzhang'] },   // 赤红/赤金(黄)/苍蓝 主力舰 + 法术阵列/战争矩阵/战争幽灵/四精英/张华&张策

    // 长歌级：黑暗之手紧跟旧日之歌下方（2026-10-01 用户定稿排序）
    { name: '长歌级', entries: ['boss', 'boss_darkhand', 'boss_storm', 'boss_storm2'] },

    // 衍生级（escort / tornado）不设标签页：无法从分页列表直接点击，仅经母体条目 desc 内的名称跳转进入
    // （跳转时不选中任何标签，见 jumpToEncyEntry；反向跳转见条目 parent 字段）
  ];
  
  // 每种颜色变体独立成条目；type 用于绘制/生成，variant/behavior 用于强制指定变体/行为
  // BOSS 条目的 bossId → 01-config 血量注册表（resolveBossHp 按当前难度解析 hpByDiff）
  const BOSS_HP_SRC = { song: BOSS, storm: STORM, storm2: STORM2, darkhand: DARKHAND };
  const ENCY_DATA = {
    side_pass: {
      name: '白影侧翼艇', type: 'side', behavior: 'pass', color: '#f0f0f5', hp: 10, score: 50,
      desc: '无攻击能力。<br>能从顶部入场，也能从侧翼突入战场。',
    },
    side_shoot: {
      name: '黄芒侧翼艇', type: 'side', behavior: 'shoot', color: '#ffd166', hp: 10, score: 50,
      desc: '入场 1.2~2.8s 后追踪玩家方向射出一发子弹。<br>能从顶部入场，也能从侧翼突入战场。',
    },
    side_kamikaze: {
      name: '紫电侧翼艇', type: 'side', behavior: 'kamikaze', color: '#c084fc', hp: 10, score: 80,
      desc: '被击坠时向下垂直射出一发子弹。<br>能从顶部入场，也能从侧翼突入战场。',
    },
    side_swirl: {
      name: '橙旋侧翼艇', type: 'side', behavior: 'swirl', color: '#ff8c1a', hp: 10, score: 80,
      desc: '入场 0.8~1.5s 后自身周围出现一颗环绕弹，绕自身持续旋转。<br>能从顶部入场，也能从侧翼突入战场。',
    },
    side_moon: {
      name: '赤月侧翼艇', type: 'side', behavior: 'moon', color: '#ff3b30', hp: 10, score: 50,
      desc: '入场 1~2.5s 后的随机时刻朝航向正前方发射一枚子弹。<br>若被击坠时还未发射，则有 12% 概率在阵亡时补射。<br>能从顶部入场，也能从侧翼突入战场。',
    },
    prolifera: {
      name: '增生侧翼艇', type: 'prolifera', color: '#7fe8c9', hp: 10, score: 50,
      // 衍生体（卫护飞船）为独立隐藏条目（不设标签页）：desc 内名称可点击跳转（互链见 escort.parent）
      desc: '无攻击能力。击毁后分裂出 0~3 个<span class="ency-link" data-ency="escort">卫护飞船</span>沿原航向漂移。<br>有 4% 概率掉落加血套件。<br>能从顶部入场，也能从侧翼突入战场。',
    },
    striker_crimson: {
      name: '赤红突击艇', type: 'striker', variant: 'crimson', color: '#ff3b30', hp: 56, score: 130,
      desc: '能朝下方直射子弹。',
    },
    striker_amber: {
      name: '烈橙突击艇', type: 'striker', variant: 'amber', color: '#ff8a5c', hp: 56, score: 130,
      desc: '能朝下方对称射出两发子弹，夹角在 40°/50°/60° 间随机。',
    },
    striker_azure: {
      name: '幽蓝突击艇', type: 'striker', variant: 'azure', color: '#4d9fff', hp: 56, score: 130,
      desc: '能朝玩家附近发射子弹。<br>登场 30% 概率拥有 0.5s 虚化护盾。',
    },
    striker_violet: {
      name: '紫晶突击艇', type: 'striker', variant: 'violet', color: '#c084fc', hp: 56, score: 130,
      desc: '能朝玩家发射子弹。',
    },
    striker_white: {
      name: '霜白突击艇', type: 'striker', variant: 'white', color: '#eaf1f8', hp: 56, score: 130,
      desc: '能朝下方直射子弹，射速很慢。',
    },
    striker_fortress: {
      name: '坚垒护卫艇', type: 'striker', variant: 'fortress', color: '#ffd166', hp: 800, score: 130,
      desc: '防御型战舰。其血量较高，停留线更靠下。<br>每5秒朝下发射一枚子弹。<br>登场后，每过 1s 受到的伤害 +10%，10s 起改为每秒 +20%。',
    },
    striker_dusk: {
      name: '幽暮突击艇', type: 'striker', variant: 'dusk', color: '#8f97ab', hp: 64, score: 130,
      desc: '能在场地 30%~80% 高度的随机位置上方浮现，下移一段距离后以随机方向为基准向四周正六边形或正八边形的均匀方向各射 出1 枚子弹，随后下移并离场。<br>无碰撞伤害。',
    },
    gunship_violet: {
      name: '紫晶炮艇', type: 'gunship', variant: 'violet', color: '#c084fc', hp: 400, score: 350,
      desc: '初始技能随机，技能循环如下：<br>①双向 22222 加速长条弹：锁定玩家当前位置方向及其反方向各 10 发、前后 5 波每波 2 发，两发垂直错位不重叠；自机体核心快照点射出，后发不随机体移动漂移。<br>②三发平行贴弹：同时射出、同向平行，中间弹出射点更靠前；共两轮，第一轮发射随机 0.2~0.4s 后发射第二轮。<br>③锁定侧扫：向玩家方位 60° 区间依次均分 4 发加速长条弹；诗篇改为 5 发且左右两侧同时对称扫射。',
    },
    gunship_crimson: {
      name: '赤红炮艇', type: 'gunship', variant: 'crimson', color: '#ff5a5a', hp: 400, score: 350,
      desc: '初始技能随机，技能循环如下：<br>①瞄准双连射 + 左右双曲线弹流：中间弹固定垂直向下不追踪，双曲线向两侧外扩。<br>②反向双曲线弹流：每侧发射 5 发，镜像对在随机屏高 50%~100% 处交汇。<br>③三方向两轮齐射：垂直向下与下±20°，每方向发射 2 发 ，共 2 轮、轮间隔 0.75s；诗篇改为加速长条弹，且第二轮扩为五方向。',
    },
    gunship_amber: {
      name: '金曜炮艇', type: 'gunship', variant: 'amber', color: '#ffbf47', hp: 420, score: 350,
      desc: '初始技能随机，技能循环如下：<br>①10 发环形爆发：诗篇改为加速长条弹且为 12 发。<br>②两轮 6 发环形爆发：选定两个随机方向、先后顺序随机各射一轮，两轮间隔 ≈0.35s。<br>③三方向 3×3 加速长条弹：首轮竖直朝上或朝下随机、后续两轮依次旋转 60°，每发两发连射，出弹点以施放瞬间为准快照；诗篇改为每波 5 方向均分整圆、波间依次旋转 180°，且首轮方向完全随机。',
    },
    gunship_orange: {
      name: '橙焰炮艇', type: 'gunship', variant: 'orange', color: '#ff7e2e', hp: 400, score: 350,
      desc: '初始技能随机，技能循环如下：<br>①发射一枚红橙巨型弹：飞行 25% 屏高后减速滑行、临近停速时分裂 6 发均匀散射。<br>②大范围散射：朝下方 150° 均匀发射 6 发子弹。<br>③双轮 2×2 加速长条弹：夹角 40°→60°，出弹点以施放瞬间为准快照。<br>④中范围散射：朝下方 120° 均匀发射 4 发子弹，诗篇改为 7 发。',
    },
    gunship_cyan: {
      name: '青时炮艇', type: 'gunship', variant: 'cyan', color: '#45e0e8', hp: 400, score: 350,
      desc: '初始技能随机，技能循环如下：<br>①召唤增生侧翼艇 ×3：两翼各 1 个 + 机头正下方 1 个；诗篇第二次及之后释放时连续召唤两波；召唤体与卫护飞船无分数和水晶奖励，且召唤体带有次数盾——常态 1 层、诗篇 2 层。<br>②支援弹：随机方向 2 发、诗篇 4 发：命中敌机加 200 屏障、命中玩家机身则施加持续10s的 24 屏障，诗篇屏障值改为28。<br>③DNA 双螺旋四连弹：朝玩家 2×2，全部自机头出膛；左右两束相位相反的加速蛇行弹持续交绕成双螺旋，摆幅 0.385 rad；诗篇改为六连弹——3 批×2 发。',
    },
    harbinger: {
      name: '炮火先兆者', type: 'harbinger', color: '#3a3f4a', hp: 1000, score: 550,
      lore: '炮舰术师操作的无人战舰，装甲厚重，材质坚实。正是他们引导了炮舰猛烈的导弹袭击。',
      desc: '核心充能循环召唤垂直落下的导弹，登场 1.5~2.5s 后首次召唤，后续每 4.5s 召唤一次。会停留在较靠后的位置。<br>导弹：召唤瞬间锁定玩家当前位置并出现持续2s的预警线，随后自屏顶以 1400px/s 垂直砸下。命中玩家时造成虚象 60 / 具象 60 / 真我 80 / 诗篇 95 伤害，且会使武器等级 -1、暴走中断，碰撞半径 12.5。',
    },
    weilong: {
      name: '威龙', type: 'weilong', color: '#ff9a1a', hp: 5000, score: 1100,
      lore: '敌方人员操纵的无人战舰，某太空游戏的粉丝制作的外观，因此被称为威龙。装备有高射速的速射铳和远程操控施术单元，可能是由术师远程操作。优秀的攻击性能让其会对战机构成较大威胁。',
      desc: '重型战舰，血量很厚。<br>沿蛇形路径巡航，能够朝玩家进行连射。',
    },
    hanshuang: {
      name: '寒霜', type: 'hanshuang', color: '#8fd8ff', hp: 700, score: 500,
      lore: '敌方人员操纵的无人战舰，配备了额外护甲以致较难被击毁，其最初的原型由一个图像引擎工作室设计。能通过特殊的装置造成周围温度急剧下降，在此范围内我方战舰的攻速和移速会大幅度削减。',
      desc: '不攻击。登场 1s 后展开范围冰蓝寒霜光圈：圈内我方战机顶部入场射速/移速 -35%。<br>出场时概率携带虚化护盾；会停留在较靠下的位置。<br>能从顶部和侧翼入场。',
    },
    yu4: {
      name: '御4', type: 'yu4', color: '#d6c078', hp: 700, score: 500,
      lore: '敌方人员操纵的无人战舰，型号标记为御4。虽然本身不具有攻击能力，却能对敌方战舰进行支援，需要注意。',
      desc: '不攻击。登场 0.5s 后展开金色六边力场，力场内所有敌人受到的非真实伤害降低 30%',
    },
    anvil: {
      name: '铁砧', type: 'anvil', color: '#8ce36b', hp: 500, score: 500,
      lore: '敌方的防御型空援无人战舰，将使范围内敌方单位的生命值缓慢恢复。',
      desc: '不攻击。登场 0.5s 后展开治疗光环，光环内所有敌人每秒恢复 1.5% 最大生命 + 50 生命值；诗篇难度下调整为 1.5% 最大生命 + 100 生命值。',
    },
    baoling: {
      name: '暴鸰', type: 'baoling', color: '#e3e6ec', hp: 600, score: 500,
      lore: '敌方人员操纵的无人战舰，飞行速度缓慢。携带有爆破弹头，将会在接近我方战机时投掷，并造成范围物理伤害。据说设计灵感来自某种幻想生物。虽然在投弹之后不再具有任何攻击性，但是因重量减轻而得以更快速地移动。',
      desc: '能够投掷一次自身携带的炸弹，造成范围伤害。<br>玩家进入索敌半径后，停止移动、在玩家位置浮现红色预警区，随后炸弹脱离，经 0.6~0.8s低速下坠再极速加速冲向预警区中心爆炸。<br>预警区形成前被击毁则原地殉爆，对周围 200px 内所有敌方单位造成 600 + 20% 最大生命伤害（至多 2000，可连锁殉爆）；预警区一旦形成，炸弹即视为脱离，击坠暴鸰也无法终止，炸弹仍将抵达目标位置并爆炸。<br>能从顶部和侧翼入场。',
    },

    jiaoxiang: {
      name: '焦香螺旋桨', type: 'jiaoxiang', color: '#ff7a18', hp: 1200, score: 500,
      lore: '“螺旋桨天堂”大量采用的升级版浮空动力装置，动力强劲，浮空稳定，甚至还额外附带了驱羽兽功能，堪称完美。<br />但它的散热问题反而更严重了。装载了它的浮空平台，一年四季都弥漫着恼人的焦香。',
      desc: '不攻击、无碰撞伤害。登场短时间后展开火焰光环，对进入的我方战机每秒造成 22.5 伤害，接近本体时伤害翻倍。<br>登场后绕大圈巡航。<br>能从顶部和侧翼入场。',
    },

    fashiA2: {
      name: '法术大师A2', type: 'fashiA2', color: '#c084fc', hp: 900, score: 600,
      lore: '敌方人员操纵的无人战舰，去掉部分飞行辅助模块，牺牲了飞行速度以换取装备更大型法术武器的空间。能进行远程法术攻击，需要特别小心。',
      desc: '重甲法术大师，血量较厚、体积较大，但移动速度较慢。<br>能够朝玩家发射逐渐变长的紫色激光，攻击时停止移动。<br>攻击后 50% 概率朝斜下方移动一段距离。<br>下坠超过80%屏高后不再瞄准射击。',
    },

    douzhi: {
      name: '斗志昂扬', type: 'douzhi', color: '#c9d8ea', hp: 280, score: 100,
      lore: '艾伦精选科技公司感谢您别出心裁的赞助！这架无人战舰将时刻为场上战舰播报商业联合会精选广告段落，刺激大家的神经，让竞赛现场更加燥热！',
      desc: '在波次等级升级时概率出现。<br>击坠后我方获得斗志昂扬BUFF：攻击速度、弹道飞行速度翻倍，持续 8s。<br>从侧方入场，会在一定幅度内上下移动。',
    },

    fashiA1: {
      name: '法术大师A1', type: 'fashiA1', color: '#a855f7', hp: 80, score: 160,
      lore: '敌方人员操纵的无人战舰，飞行速度非常快，由某法术教育竞赛用无人战舰改装而来。其模块化设计使其能装备法术武器进行远程法术攻击，需要特别小心。',
      desc: '轻甲法术大师，移速较快。<br>能够朝玩家发射逐渐变长的紫色激光，攻击时停止移动。<br>攻击后 50% 概率左右横移一段随机距离。<br>入场下坠越过 10%~20% 屏高触发线时有 60% 概率先水平横移一次。<br>下坠超过80%屏高后不再瞄准射击。',
    },
    
    popian: {
      name: '破片', type: 'popian', color: '#cfd6e0', hp: 200, score: 160,
      lore: '敌方的攻击型空援无人战舰，攻击造成范围性物理伤害。',
      desc: '入场后沿直线飞行至停留点，到达停留点后能锁定玩家位置发射三连发高速炮弹，造成范围伤害。前两发炮弹不会触发无敌。<br>能从顶部和侧翼入场。',
    },

    fashiMatrix: {
      name: '法术矩阵', type: 'fashiMatrix', color: '#ff5566', hp: 80, score: 160,
      desc: '能朝玩家附近发射正方体射弹。<br>到达停留点后会随机漂移。',
    },

    fashiArray: {
      name: '法术阵列', type: 'fashiArray', color: '#c22b3d', hp: 3500, score: 1200,   // 分数 1200（2026-10-13 用户定稿 1300→1200，总表待同步）
      pvZoom: 1.45,   // 详情预览放大：三菱形+底座的视觉尺寸紧凑，按碰撞盒适配会显得偏小
      desc: '能朝玩家附近发射旋转的大正方体射弹，飞行随机行程（射程的 30%~60%）后分裂为 3 枚正方体射弹（三枚夹角互为 120°、其中一枚沿原瞄准方向）。<br>就位后每5s在身侧召唤一个法术矩阵，首次召唤缩短为2.5s。<br>死亡时召唤一个法术矩阵。<br>在场时增强所有法术矩阵：偏移角增至 ±25°、正方体速度 +10%<br>到达停留点后会随机漂移。',
    },

    warMatrix: {
      name: '战争矩阵', type: 'warMatrix', color: '#7a3b2e', hp: 4500, score: 1200,   // 血量 4500（2026-10-04 用户定稿：虚象/具象/真我同基准、诗篇 10000 走 POEM_HP.warMatrix）；分数 1200（2026-10-13 用户定稿 1300→1200，总表待同步）
      wip: true,   // 未实装：图鉴预览白色方块占位（drawEncyPreview 兜底）；机制/数值/外观待设计
      desc: '大型矩阵装置，具体机制、外观待定。<br>当前仅注册占位，不进入常规出怪。',
    },

    capital_crimson: {
      name: '赤红主力舰', type: 'capital', variant: 'crimson', color: '#ff4d6d', hp: 4200, score: 1200,   // 分数 1200（2026-10-13 用户定稿 1300→1200，总表待同步）
      desc: '初始技能随机，技能循环如下：<br>①双翼交叉矛：左右翼各发射 3 发向内交叉成 X。<br>②双曲线宽扇：一侧发射 6 发弯向斜下、覆盖面极广，左右交替。<br>③加速弹幕：沿每条射线每 0.09s 依次连发 4 发同参加速长条弹，触顶后间距恒定均匀；第二轮于第一轮末发出膛后 0.3s 开始；两波出弹点以施放瞬间为准快照。',
    },
    capital_azure: {
      name: '苍蓝主力舰', type: 'capital', variant: 'azure', color: '#4d9fff', hp: 4200, score: 1200,   // 分数 1200（2026-10-13 用户定稿 1300→1200，总表待同步）
      desc: '初始技能随机，技能循环如下：<br>①瞄准六连齐射。<br>②双巨弹：向下方 120° 扇区两个随机方向、间隔 0.25s 先后各射一颗巨型子弹，飞行 25% 屏高后减速滑行、随后分裂为 6 发小型子弹。<br>③螺旋发射：双臂螺旋发射 12 发加速长条弹。<br>出场时 20% 概率拥有持续一定时间的虚化护盾。',
    },
    capital_crgold: {
      name: '赤金主力舰', type: 'capital', variant: 'crgold', color: '#ff9a1a', hp: 4600, score: 1200,   // 分数 1200（2026-10-13 用户定稿 1300→1200，总表待同步）
      desc: '自带两枚旋转环。初始技能随机，技能循环如下：<br>①扇形连射：首轮 5 发、随后 2/2 两轮，每次均为紧凑两连发。<br>②金环扩散：消耗一枚旋转环，环带上所有敌我子弹消散，圆环被可群星之杀斩击切断。<br>③夹击连射：停移发射四组加速长条弹，左侧3发右侧3发，夹角依次减小。',
    },
    boss: {
      name: '旧日之歌', type: 'boss', color: '#e6d5ff', hp: 44000, score: 3000, bossId: 'song',   // hp = 具象基准（2026-10-14 用户定稿 48000→44000，总表待同步；四难度表见 01-config BOSS.hpByDiff）
      quote: '自往昔中浮现的梦魇',   // 图鉴引言（颜色与标题一致）
      desc: '<b>第一轮BOSS。</b><br />' +
        '①双管极快连发长条弹 + 双曲线弹流（血量≤50% 时双管同时向内 / 向外双向发射；<br />' +
        '②散射大子弹3 轮，每轮随机缺失 20%~35%；<br />' +
        '③四部位标记三连发（标记释放时锁定，不追踪；<br />' +
        '④双管乱射长条弹（血量＞50% 为 270° 大范围散射、≤50% 收敛到下半球。<br />' +
        '血量 70%：在最左侧召唤一位炮火先兆者并掉落暴走道具（各一次）；血量 40%：在最右侧再召唤一位炮火先兆者（就位后同样固定靠边、不巡航）；诗篇：两个血量点均改为左右同时各召唤一位（首攻时间强制 1.5s / 2.5s 各一，随机分配左右）；&lt;50% 技能间隔减半。<br />' +
        '<b>真我&诗篇难度下有如下修正：</b><br />' +
        '技能释放间隔降低；<br />' +
        '①：双曲线弹流升级为4条旋转双曲线弹流，且释放其他技能时概率连携此技能。<br />' +
        '②：7 轮大子弹散射，缺失 10%~20%，首轮必定慢速、其余随机 3 轮快速。<br />' +
        '③：2 部位锁定标记 + 2 部位持续追踪。<br />' +
        '④：≥70% 血 270° 散射 + 射速 +100%；&lt;70% 血 360° 单发 + 射速 +200%，并每 0.7~1.7s 向下扇形圆弹幕（8~14 发）。<br />' +
        '<b>新增下列两个技能：</b><br />' +
        '⑤：发射六发暗黑子弹锁定玩家附近位置。<br />' +
        '⑥：朝下方随机方向发射六发暗黑子弹，子弹可以在左右边界反弹数次。<br />' +
        '击败掉落：300 颗水晶（击杀得分 3000）+ 20% 高能爆弹 + 必掉暴走道具，并参与通用道具掉落池（套件 / 护盾按基础值；加血独立判定 40% 掉 1 个 / 另有 10% 一次掉 2 个）。',
      // 分难度注解（具象为基准不显示；数据与 01-config DIFFICULTIES / SONG_SHIP 同步）
      diffNotes: {
        illusion: 'BOSS 伤害 <b>-40%</b>；技能释放间隔 <b>+50%</b>；<b>不会连续释放同种技能</b>。技能组与具象一致。',
        realme: '',   // 真我技能组修正已并入主 desc（2026-10-12 用户定稿：不再单独显示注解块）
        poem: '<b>技能组全套沿用真我改版</b>；技能释放间隔 = 具象的 <b>50%</b>。入场部件球弹幕同为六发暗黑子弹齐瞄玩家。<b>技能5 诗篇追加</b>：发射暗黑子弹的同时再射出 <b>4 发</b>——朝下方 150° 扇区逐发独立随机偏角（不必对称），可在左右边界各反弹 <b>1</b> 次。诗篇弹伤定值：长条弹 <b>24</b> / 弧线弹 <b>24</b> / 大子弹 <b>42</b> / 技能4 扇形圆弹幕 <b>24</b> / 暗黑子弹 <b>42</b>（具象基准 14 / 18 / 32 / 随长条弹 / 36）。',
      },
    },
boss_storm: {
      name: '暴风之眼', type: 'boss', color: '#dff3ff', hp: 56000, score: 9000, bossId: 'storm',   // hp = 具象基准（2026-10-12 用户定稿 50000→56000，总表待同步；四难度表见 01-config STORM.hpByDiff）
      quote: '天秀忧郁之风',   // 图鉴引言（颜色与标题一致）
      desc: '第三轮的首个BOSS。接触时每 0.1s对玩家造成伤害， （虚象 5 / 具象 5 / 真我 6 / 诗篇 7）且无视受击无敌帧。<br />' +
        '乱序释放以下技能：<br />' +
        '①风波呼啸：从一侧射入 3~4 道横向弯曲风波，标记约 1.1s 后整条显现、对玩家造成伤害并击退，共两轮。<br />' +
        '②<span class="ency-link" data-ency="tornado">大型龙卷</span>：蓄力后向正前方发射大型龙卷。大型龙卷可击毁、缓慢下移，随机 360° 快速射出 16 伤害风弹；碰撞为持续接触掉血；大型龙卷受主武器伤害 -50%、受僚机伤害 +150%。<br />' +
        '③垂直风柱：连续随机选定 5 处召唤垂直风柱，预警一段时间后出现，对玩家造成伤害并击退。<br />' +
        '④漩涡弹幕：以中心发射 4 条旋臂风弹，前半程逆时针旋转、后半程顺时针。<br />' +
        '⑤乱射风条：朝下方120度方向两轮乱射 12 / 9 枚风弹，每轮有一枚瞄准玩家。随机部分风弹的尺寸和伤害得到强化。<br />' +
        '⑥三旋臂漩涡：3 条旋臂风弹，随机顺 / 逆时针且全程不变，转速随时间越来越快，持续 5s；<br />' +
        '⑦涡流风旋：落点预警发射涡旋，飞抵屏幕下方 80% 高度处，并以双旋臂喷出密集风条，持续 5s。<br />' +
        '真我&诗篇难度下有如下修正：<br />' +
        '①风波呼啸：脱离技能轮换，每 10~16s 独立释放一轮3~4 道风波，不占用技能槽、不影响技能释放间隔。<br />' +
        '②大型龙卷：大型龙卷血量提升，受僚机伤害加成额外 +150%。<br />' +
        '③垂直风柱：共 6 轮射击，每轮同时射出 2 个风柱（位置至少相差 10% 屏宽），轮间隔 +50%。<br />' +
        '④漩涡弹幕：总时长 7s，旋转速度 +40%、风弹射速 +60%、风弹长度 +30%。初始方向顺 / 逆时针随机，期间必定改变 2 次方向（诗篇 3 次）。<br />' +
        '⑤乱射风条：两轮风弹 14/11 发；普通风弹 20% 概率射速减慢 20%~50%，强化大风弹不减速。<br />' +
        '⑥三旋臂漩涡：追加一组镜像三旋臂，两射击点关于竖直中轴精确镜像、转向相反，任意时刻保持镜像。<br />' +
        '⑦涡流风旋：涡流风旋改为三旋臂，风弹射速 +25%、但最大转速减小。<br />' +
        '新增下列技能：<br />' +
        '⑧双子旋臂：距风暴中心 30%~80% 半径环内随机间距 ≥70px 的两点绕中心公转，各以 50% 概率发出三旋臂或四旋臂，持续 6s。旋臂自转方向随机且两点独立。<br />' +
        '击败后召唤<span class="ency-link" data-ency="boss_storm2">风暴编织者</span>。',
      // 分难度注解（具象为基准不显示；数据与 01-config DIFFICULTIES / STORM_SHIP 同步）
      diffNotes: {
        illusion: 'BOSS 伤害 <b>-40%</b>；技能释放间隔 <b>+50%</b>；<b>不会连续释放同种技能</b>。技能组与具象一致。',
        realme: '',   // 真我技能组修正已并入主 desc（2026-10-12 用户定稿：不再单独显示注解块）
        poem: '<b>全套沿用真我改版</b>（技能1 独立释放 / 镜像旋臂 / 技能8 入池等，见正文真我修正），以下为诗篇覆盖值——<b>伤害定值</b>：风波 <b>36</b> / 风柱 <b>30</b> / 风弹 <b>28</b>（含技能4 旋涡弹与技能8 全部旋臂风条）/ 风旋碰撞 <b>30</b>；大型龙卷血量 <b>6800</b>、射击间隔 <b>-30%</b>、风弹 <b>28</b>、碰撞每 0.1s 扣 <b>5</b> 血。<b>技能4</b>「螺旋风暴」持续 <b>7.5s</b>、射击间隔 <b>-30%</b>（0.077s）。<b>技能5</b> 两轮风弹 <b>16/14</b> 发。<b>技能8</b> 三 / 四旋臂射击间隔 <b>0.12s / 0.14s</b>。<b>新增机制</b>：开始释放除技能3外的任意技能的瞬间，<b>10%</b> 概率在场上随机位置召唤一道风柱打击；血量 ≤70% 后概率提升至 <b>20%</b>（技能1 独立释放时同样判定）。',
      },
    },
    boss_storm2: {
      name: '风暴编织者', type: 'boss', color: '#8fd4ff', hp: 36000, score: 5000, bossId: 'storm2',
      quote: '雷霆织就的风暴之心',   // 图鉴引言（颜色与标题一致）
      desc: '第三轮的最终BOSS，暴风之眼被击坠后登场。<br />' +
        '乱序释放以下技能：<br />' +
        '①电弧激光：停止移动，中心电弧球预警蓄力 1.2s 后向下发射强力电弧激光。<br />' +
        '②四臂激涌：停止移动，四臂喷口先后各现一圈收缩预警波，蓄力 1.2s 后依次向下发射电弧激光。<br />' +
        '③折线光束：在场地正中向斜下发射四道电弧光束，光束碰到左右边界时能够反弹。<br />' +
        '④蛇形雷条 + 雷环：中心能量球以蛇形连续快速连射 40~70 发雷电长条弹。四喷口外出现数圈雷电子弹，每圈 14~20 枚，停留原处 1s 后向对应方向爆开；，爆开初速随机。70% 血以下时，雷条发射数与持续时间 +50%。雷环必然在雷条射完前全部爆开。<br />' +
        '⑤雷霆打击：在场地下方 30% 区域选定随机 5 处，依次召唤雷击，造成大量伤害，且击中中心会生成一圈往外扩散的 8~10 枚雷电子弹。<br />' +
        '⑥重现光束：四喷口沿臂方向直射电弧光束出屏，随后光束于左右边界重现，往下方射出，总共 3 轮，释放后下一次技能间隔 -40%。<br />' +
        '真我&诗篇难度下有如下修正：<br />' +
        '①电弧激光：释放期间不再停止移动，且激光连续射出 5 次。<br />' +
        '②四臂激涌：50% 概率同时连携技能6，连携时臂向光束变淡、臂向蓄力与汇聚预警时长 +50%、本体蓄力延长至 1.6s；未连携则下一次技能间隔 -60%。<br />' +
        '③折线光束：改为连续快速释放两次，释放结束后下一次技能间隔 +30%。<br />' +
        '④蛇形雷条 + 雷环：雷环圈数增加，且生成间隔 -40%。<br />' +
        '⑤雷霆打击：落点扩展至下方 60% 区域、轰击间隔 -10%、且外扩雷环的子弹数增加。<br />' +
        '⑥重现光束：释放瞬间四个雷电喷口处立即触发雷霆打击。<br />' +
        '该敌人为当前版本最终BOSS，正常游戏中将其击坠后即游戏胜利。',
      // 分难度注解（具象为基准不显示；数据与 01-config DIFFICULTIES / STORM2_SHIP 同步）
      diffNotes: {
        illusion: 'BOSS 伤害 <b>-40%</b>；技能释放间隔 <b>+50%</b>；<b>不会连续释放同种技能</b>。技能组与具象一致；<b>技能4</b> 雷环 <b>2 圈</b>（前 2 喷口各 1 圈——2026-10-12 用户定稿，原 4 圈）；<b>技能5</b> 外扩雷环 <b>6~8</b> 枚。',
        realme: '',   // 真我技能组修正已并入主 desc（2026-10-12 用户定稿：不再单独显示注解块）
        poem: '沿用主 desc「真我&诗篇」全套技能改版（技能1 连射 5 发 / 技能2 连携技能6 / 技能3 双发 / 技能5 60% 区域与错峰 -10% / 技能6 瞬发四喷口雷霆打击——2026-10-12 用户定稿补实装），并叠加下列诗篇专属数值：<b>技能伤害</b>整体上调：技能1 <b>90</b> / 技能2 <b>70</b> / 技能3 <b>40</b> / 技能4（蛇形雷条与雷环）<b>32</b> / 技能5 <b>60</b> / 技能6 <b>42</b>。<b>技能3</b> 发射角锥角扩至竖直向下 <b>±65°</b>；<b>技能4</b> 雷环 <b>9 圈</b>（前 4 喷口各 1 圈 + 5 圈随机喷口，生成间隔 <b>0.6~1.2s</b>——以此专属区间为准，不叠加真我 -40% 乘区）；<b>技能5</b> 外扩雷环 <b>15~20</b> 枚；<b>技能6</b> 轮次间隔缩短至 <b>0.8s</b>（技能本体 3.2s 收束）。',
      },
    },

    // ---------- 衍生级：由母体敌人产生 / 召唤，不独立入场 ----------
    // parent = 母体图鉴条目（详情页「母体」字样可点击跳回；母体 desc 内的本体名称反向跳转至此）
    escort: {
      name: '卫护飞船', type: 'escort', color: '#6a5ce0', hp: 1, score: 20,
      pvZoom: 0.6,   // 小体型衍生体：预览/缩略图按接近实机大小展示（默认 1.7 上限会放大到失真）
      parent: 'prolifera', derived: true,
      desc: '增生侧翼艇阵亡时分裂出的衍生体（每艘分裂 <b>0~3</b> 个）：深蓝紫小三角（与水晶的浅蓝明显区分）。<b>无攻击</b>，沿母舰原航向漂移；碰撞 <b>10</b>、造成的无敌时间仅为常规的 <b>40%</b>（0.48s）。<b>不掉落任何水晶与道具</b>（守愿者弹对其无限穿透）。不计入场面压力。',
    },
    tornado: {
      name: '大型龙卷', type: 'tornado', color: '#eaf6ff', hp: 3600, score: 0,
      parent: 'boss_storm', derived: true,
      desc: '暴风之眼技能2 召唤的衍生体：蓄力后自机体前方推出，<b>约占屏宽 30%</b>，可击毁、<b>缓慢下移直至脱离战场</b>，随机 360° 快速射出 <b>16 伤害风条</b>（诗篇 <b>28</b>），碰撞为<b>持续接触掉血</b>——每 <b>0.1s 扣 4 血</b>（诗篇 <b>5</b>）且<b>不触发受击无敌</b>。<b>受到战机主武器伤害 -50%、受僚机伤害 +150%</b>（僚机是其弱点）。<b>不掉落水晶与道具</b>（真我难度血量 <b>6000</b> / 诗篇 <b>6800</b>）。不计入场面压力。',
    },

    // ---------- 新增敌人批次（逐个实装中）：已实装的移除 wip 并换专属外观/数值，未实装的仍为占位 ----------
    // wip: true → 图鉴预览统一白色圆角方块（drawEncyPreview 开头兜底分支，先于 boss/敌机分支判断；
    // 2026-10-03 随张华&张策条目重建——旧兜底已随历史批次实装遗失）；实装时逐个替换专属外观与数值
    popianU: {
      name: '破片U型', type: 'popianU', color: '#cfd6e0', hp: 250, score: 220,
      lore: '敌方更先进的攻击型空援无人战舰，攻击造成更强的范围性物理伤害。',
      desc: '入场后沿直线飞行至停留点，到达停留点后能锁定玩家位置发射三连发高速炮弹，造成范围伤害。前两发炮弹不会触发无敌。<br>能从顶部和侧翼入场。',
    },
    baolingG: {
      name: '暴鸰·G', type: 'baolingG', color: '#ffd8a8', hp: 800, score: 500,
      lore: '敌方人员操纵的无人战舰，飞行速度缓慢。携带有大型爆破弹头，将会在接近我方战机时投掷，并造成群体物理伤害。据说设计灵感来自某种幻想生物。虽然在投弹之后不再具有任何攻击性，但是因重量减轻而得以更快速地移动。',
      desc: '能够投掷一次自身携带的高能炸弹，造成范围伤害。相比暴鸰，其弹头威力更大，且爆炸范围也更大。<br>玩家进入索敌半径后，停止移动、在玩家位置浮现红色预警区，随后炸弹脱离，经 0.6~0.8s低速下坠再极速加速冲向预警区中心爆炸。<br>预警区形成前被击毁则原地殉爆，对周围 200px 内所有敌方单位造成 600 + 20% 最大生命伤害（至多 2000，可连锁殉爆）；预警区一旦形成，炸弹即视为脱离，击坠暴鸰·G也无法终止，炸弹仍将抵达目标位置并爆炸。<br>能从顶部和侧翼入场。',
    },
    sponsor: {
      name: '赞助无人舰', type: 'sponsor', color: '#f2f5fa', hp: 280, score: 100,
      lore: '艾伦精选科技公司感谢您的赞助！这架迅速而廉价的无人舰将承载观众们的热情，为场上骑士战舰提供陷阱、炸药、药物或是膨化食品等任何道具！也许比赛的胜负就在您的手中！',
      desc: '在波次等级升级时概率出现。<br>击坠后触发一个道具效果，90%为普通道具，10%为稀有道具。<br>从侧方入场，会在一定幅度内上下移动。',
    },
    sponsorDeluxe: {
      name: '豪华赞助无人舰', type: 'sponsorDeluxe', color: '#ffe9a8', hp: 280, score: 100,
      lore: '艾伦精选科技公司感谢您慷慨的赞助！这架厚重而昂贵的无人舰将承载观众们的热情，为场上骑士战舰提供机关、装置、钓竿或是碳酸饮料等任何道具！也许比赛的胜负就在您的手中！',
      desc: '在波次等级升级时概率出现。<br>击坠后触发一个道具效果，100%为稀有道具。<br>从侧方入场，会在一定幅度内上下移动。',
    },
    warGhost: {
      name: '战争幽灵', type: 'warGhost', color: '#ffd24a', hp: 4200, score: 1400,   // 分数 1400（2026-10-13 用户定稿 1300→1400，总表待同步）
      lore: '“战争幽灵”曾是一支传奇雇佣舰队，在他们建立起血腥名号之后，雇佣兵和赏金猎人开始把那些强大、残酷、身经百战的战舰同样称作此名。其实力强大，且精于操纵多种空援无人战舰。',
      desc: '登场前屏幕外出现预警，一段时间后自身高速冲刺入场，对路径上的我方战机造成高伤害和强力击退。初始技能随机为②或③，技能循环如下：<br>①两刃斩击：正前方两侧各 150° 扇面预警，预警结束原地扫斩。<br>②双斩流：双斩线跟随玩家 0.4s 后锁定（锁定后机体停止转向）0.65s，随后两刃同出、共用锁定方向平行直射（1456px/s，35 伤害 / 道、每道命中一次）；<br>③环形弹幕：连续三波径向齐射。每波取随机基准方向及与之互成 120° 的三个方向，每方向齐射 3 发扇形加速大型子弹。<br>在场时，场上所有破片、破片U型、铁砧移速与加速度翻倍。<br>血量首次降至 50% 时于自身左右身侧略微后方召唤一架铁砧与一架破片U型。<br>驻留 30s 后瞄准玩家所在直线释放 1s 预警，随后高速斩出、冲刺离场。<br>技能释放间隔为 1.6s，真我/诗篇改为 1.3s；每释放一次技能，技能间隔就减少 0.1s，技能间隔不低于 0.3s；不会拥有驻留增压修正。',
    },
    boss_darkhand: {
      name: '黑暗之手', type: 'boss', bossId: 'darkhand', color: '#c22030', hp: 48000, score: 4000,   // 具象血量 48000（2026-10-03 用户定稿调整；2026-10-12 用户定稿虚象 40000→36000、诗篇 90000→80000；2026-10-14 用户定稿真我 70000→64000——36000/48000/64000/80000，总表待同步；四难度表见 01-config DARKHAND.hpByDiff）；主题色黑红化（2026-10-03，原紫 #b04ad4）；分数 4000（2026-10-10 按怪物属性总表同步，原 0）
      quote: '迪奥来袭',   // 图鉴引言（颜色与标题一致）
      desc: '<b>第二轮BOSS。</b><br>登场时冲撞并造成大量伤害。有连携精英在场时攻击间隔增大。<br>①<b>四管炮幕</b>——1s 同时齐射各 1 发，连射 4 轮，随难度增大，发射间隔减小、发射轮数增多；<br>②<b>黑暗涟漪</b>——从本体中心向外扩散 3 道环形弹幕，弹幕角度完全随机，每环弹数按难度递增；<br>③<b>巨大蛋挞</b>——向前方直射一枚不停旋转的巨大蛋挞；<br>④<b>爪翼毁灭蛋挞</b>——依次发射三轮超长蛋挞，真我/诗篇难度下蛋挞能在左右边界反弹1/2次；<br>⑤<b>暗影导弹雨</b>——机体发射大量黑红小型导弹，释放期间本体移速降至 20%；<br>⑥<b>双标记导弹</b>——该技能为真我/诗篇专属，仅当场上有连携精英时才会释放。标记玩家当前瞬时位置与其水平镜像位置，机体发射大量黑红小型导弹落到这两个标记位置。<br><b>连携召唤</b>：血量降至 80% / 60% / 40% / 20% 时依次召唤连携精英协战（前两名在<span class="ency-link" data-ency="xiayong">铜皮夏勇</span>/<span class="ency-link" data-ency="puxuefeng">狞笑朴学峰</span>中随机排序、后两名在<span class="ency-link" data-ency="hanxixian">猩红韩希先</span>/<span class="ency-link" data-ency="xinguodong">暴怒辛国栋</span>中随机排序）；<br>精英在其对应血量窗口内未被击杀则迅速离场，第三轮刷怪期按固定等级返场——先回复已损失生命值的 50%，随后当前生命与生命上限均翻倍。四人全数被击败则第三轮 Lv25 召唤张华&张策；<br>场上存在任一连携精英时，黑暗之手受到的伤害降低 65%；当前血量窗口的精英在本段血量内被击坠后，黑暗之手在本段血量内不再拥有减伤，且受到的普通伤害额外 +100%，随后黑暗之手永久获得该精英对应的额外技能（入池随机权重为基础技能的 2 倍）：<br>击坠<span class="ency-link" data-ency="xiayong">铜皮夏勇</span>获得<b>碎翼回旋镖</b>——左右前爪各射一枚夏勇同款回旋刃，轨道瞄准玩家当前位置并显示同款预警曲线（真我/诗篇难度下每爪快速连发两枚——两边各两枚、共四枚，单次释放）。<br>击坠<span class="ency-link" data-ency="puxuefeng">狞笑朴学峰</span>获得<b>翼根散射</b>——左右前爪各射两轮朴学峰同款扇形散射；<br>击坠<span class="ency-link" data-ency="hanxixian">猩红韩希先</span>获得<b>旋眼火螺</b>——本体两侧随机一侧释放同款三炮塔旋眼，真我/诗篇难度下两侧同时释放；<br>击坠<span class="ency-link" data-ency="xinguodong">暴怒辛国栋</span>获得<b>边界轰炸</b>——左右屏缘两列竖直依次投弹，同时本体中心竖直向下释放一轮辛国栋同款扇形轻追踪导弹；<br>如果黑暗之手死亡时有尚未召唤的精英：此前有精英逃走 → 视作未被击杀、血量仍为满；此前无任何逃走 → 视作被击杀，计入四精英全数击败。',
    },
    puxuefeng: {
      name: '狞笑朴学峰', type: 'puxuefeng', color: '#b21820', hp: 9000, score: 600,   // hp = 显示基准（具象）；实装随难度走机型级 hpByDiff（eliteHpOf，2026-10-04 用户定稿）；四精英统一黑红；分数 600（2026-10-13 用户定稿 1000→600，总表待同步）
      pvZoom: 0.6,   // 立绘按碰撞盒×1.15 + drawScale 1.6 放大（视觉约 181 世界像素高），超出预览框——缩小至完整入图
      desc: '驻留期尝试低速向玩家水平所在位置移动。<br>初始技能随机，技能循环如下：<br>①流星穿刺：三连冲击（竖 → 横 → 斜）。冲刺速度随难度提升而提升、冲刺间隔随难度提升而降低。第三次冲击后在 80% 行程处留下暗影残像，0.7s 后自爆，向四周爆开 6/7/9/10 发环形短弹；冲刺过程中，自身受到的伤害翻倍。<br>②翼根连弩：朝玩家方向扇形连射数轮子弹。轮数和弹数随难度提升而增加。<br>该敌人只能由黑暗之手召唤出现，如果未在黑暗之手战斗中被击坠，则会恢复50%已损失生命并于后续波次中再度出现。',
    },
    hanxixian: {
      name: '猩红韩希先', type: 'hanxixian', color: '#b21820', hp: 10000, score: 600,   // hp = 显示基准（具象）；实装随难度走机型级 hpByDiff（eliteHpOf，2026-10-04 用户定稿）；四精英统一黑红；分数 600（2026-10-13 用户定稿 1000→600，总表待同步）
      pvZoom: 0.6,   // 同四精英预览缩放（立绘放大后超出预览框）
      desc: '驻留期尝试低速向玩家水平所在位置移动。<br>初始技能随机，技能循环如下：<br>①凝视锁定：顶部大眼射出黑红细追踪线持续跟随玩家 0.5s，随后锁定静止 0.5s（方向固定、不开火），静止结束射出粗重黑红激光（持续时长按难度 0.5/0.6/0.8/0.9s；半宽 15px、45 伤害——诗篇 55，保持横移可让激光扫空）；<br>②旋眼火螺：召唤三座发射炮塔，旋转 3s 并持续沿径向射处子弹，构成螺旋线弹幕，旋转方向中途反转一次。诗篇难度改为射出加速长条弹。<br>该敌人只能由黑暗之手召唤出现，如果未在黑暗之手战斗中被击坠，则会恢复50%已损失生命并于后续波次中再度出现。',
    },
    xiayong: {
      name: '铜皮夏勇', type: 'xiayong', color: '#b21820', hp: 12000, score: 600,   // hp = 显示基准（具象）；实装随难度走机型级 hpByDiff（eliteHpOf，2026-10-04 用户定稿）；四精英统一黑红；分数 600（2026-10-13 用户定稿 1000→600，总表待同步）
      pvZoom: 0.6,   // 同四精英预览缩放（立绘放大后超出预览框）
      desc: '驻留期尝试以一定速度向玩家水平所在位置移动。<br>初始技能为屏障，技能循环如下：<br>①屏障：获得红色屏障，能够吸收 2000 / 真我 2500 / 诗篇 3000伤害。屏障技能每两次循环只能释放一次。<br>②碎翼回旋刃：施放后出现 0.9s 预警显示预定轨迹，随后两枚黑红回旋刃自本体中心迸出至椭圆轨道，第二次交汇时在轨道下缘相撞湮灭。<br>③核心膨胀：向玩家方向推出三颗大型低速黑红能量球，飞行 2s 后原地爆散为一圈环形弹，分裂弹数按难度提升而增加。',
    },
    xinguodong: {
      name: '暴怒辛国栋', type: 'xinguodong', color: '#b21820', hp: 9500, score: 600,   // hp = 显示基准（具象，2026-10-04 用户定稿下调）；实装随难度走机型级 hpByDiff（eliteHpOf，2026-10-04 用户定稿）；四精英统一黑红；分数 600（2026-10-13 用户定稿 1000→600，总表待同步）
      pvZoom: 0.6,   // 同四精英预览缩放（立绘放大后超出预览框）
      desc: '驻留期尝试低速向玩家水平所在位置移动。<br>初始技能随机，技能循环如下：<br>①地毯轰炸：<br>虚象/具象难度下，朝玩家所在水平方向移动并锁定玩家那一刻的竖直高度，横移途中持续往 [本体当前所在水平位置，锁定的玩家竖直高度] 投掷炸弹，直至本体撞到屏幕边界才收口。<br>真我/诗篇难度下，全程追踪玩家的水平位置，持续朝 [辛国栋正下方 × 投放瞬间玩家所在高度] 投掷6/7枚炸弹。<br>②连发导弹：<br>分批扇形发射轻追踪导弹，规模和弹道横向移动能力随难度提升而提升；诗篇难度下导弹发射期间本体上移约 10% 屏高、两轮发射完毕后回到此前高度。<br>该敌人只能由黑暗之手召唤出现，如果未在黑暗之手战斗中被击坠，则会恢复50%已损失生命并于后续波次中再度出现。',
    },
    zhangzhang: {
      name: '张华&张策', type: 'zhangzhang', color: '#b21820', hp: 10000, score: 600,   // hp = 显示基准（具象）；实装随难度走 hpByDiff（eliteHpOf，2026-10-04 用户定稿）；分数 600（2026-10-13 用户定稿 650→600，总表待同步）
      wip: true,   // 未实装：图鉴预览白色方块占位（drawEncyPreview 兜底）；登场条件先行登记（2026-10-03 用户定稿）
      desc: '若黑暗之手战斗中击杀了所有四名黑暗仆从，则张华&张策会在后续战斗波次中出现。<br>当前仅注册占位，不进入常规出怪。',
    },
    pulseMatrix: {
      name: '脉冲矩阵', type: 'pulseMatrix', color: '#ff4d5e', hp: 2400, score: 600,
      desc: '周期性产生暗红色宽幅震荡波，造成范围伤害。<br>登场 20s 后若未被击杀，则下一次攻击范围扩大至 160px，同时自身爆散死亡并召唤三座法术矩阵。<br>能从顶部和侧翼入场，从侧翼入场时走过 80% 屏宽后停驻并微微摆动。',
    },
    unreal: {
      name: '虚幻', type: 'unreal', color: '#bfe8ff', hp: 600, score: 500,
      lore: '敌方人员操纵的无人战舰，飞行速度缓慢。携带有特殊冰爆弹头，将会在接近我方战机时投掷，造成群体法术伤害以及寒冷效果。属于暴鸰的衍生机体，为了携带特殊弹头而失去了空载加速的能力。',
      desc: '能够投掷一次自身携带的寒霜炸弹，造成范围伤害并留下减速区域，使得范围内我方战机射速/移速 -35%。<br>玩家进入索敌半径后，停止移动、在玩家位置浮现蓝色预警区，随后炸弹脱离，经 0.6~0.8s低速下坠再极速加速冲向预警区中心爆炸。<br>预警区形成前被击毁则原地殉爆，对周围 200px 内所有敌方单位造成 420 + 14% 最大生命伤害（封顶 1400，可连锁殉爆），并留下一片只对敌人生效的寒冷区域；预警区一旦形成，炸弹即视为脱离，击坠虚幻也无法终止，炸弹仍将抵达目标位置并爆炸。<br>能从顶部和侧翼入场。',
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
    // 4S 精英/张华&张策走机型级 hpByDiff（eliteHpOf 按当前难度取值，2026-10-04 用户定稿，
    // 与 04-spawn spawnEliteMinion 生成覆写同源；原「黑暗之手血量 × 继承比」派生已作废）
    // 普通敌机：诗篇难度按 POEM_HP 表显示诗篇血量（绝对值，与 makeEnemy 覆盖一致），其余难度显示基准 hp
    const baseHp = d.hp;
    const poemHp = isPoem() ? poemHpOf(d.type, d.variant, d.behavior) : null;
    const eliteHp = (ELITES[d.type] || d.type === 'zhangzhang') ? eliteHpOf(d.type) : null;
    const hp = isBoss ? (BOSS_HP_SRC[d.bossId] ? resolveBossHp(BOSS_HP_SRC[d.bossId]) : d.hp)
      : eliteHp != null ? eliteHp
      : (poemHp != null ? poemHp : baseHp);
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
    // 等级（类别 + 类内强度档 A~F，权威表见 01-config ENEMY_GRADES）：仅普通敌机有条目 key；
    // BOSS（长歌级）/ 卫护飞船 escort / 龙卷 tornado 等衍生条目无 key → 名称行右侧不显示
    const gradeChip = (() => {
      const g = enemyGrade(entryId);
      return g ? `<span class="ency-name-grade">${g}</span>` : '';
    })();
    encyDetail.innerHTML = `
      <div class="ency-detail-name" style="color:${d.color}">${d.name}${gradeChip}</div>
      ${d.quote ? `<div class="ency-detail-quote" style="color:${d.color}">${d.quote}</div>` : ''}
      <div class="ency-detail-grade">${gradeName}${d.parent ? ` · 母体：<span class="ency-link" data-ency="${d.parent}">${(ENCY_DATA[d.parent] && ENCY_DATA[d.parent].name) || d.parent}</span>` : ''}</div>
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
    if (isBoss && trialBtn) {
      trialBtn.addEventListener('click', () => startBossTrial(entryId));
    }
    const challengeBtn = document.getElementById('encyChallengeBtn');
    if (challengeBtn) {
      challengeBtn.addEventListener('click', () => startChallenge(entryId));
    }
  }

  // 从图鉴发起测试：单个目标敌人（BOSS 测试附带爆弹无限）
  // 「返回上一步」来源快照：从图鉴（测试卡 / 挑战 / BOSS 试炼）进入测试前记录当前页签状态，
  // 暂停面板「返回上一步」据此跳回点击进入的那个页面（infoTab 本身在关弹窗时保留，这里仅作标记）。
  // from 区分来源弹窗：'ency'（怪物图鉴）→ 恢复原分页与原条目详情；'info'（数值与机制图鉴）→ 重开 info 弹窗
  let encReturn = null;

  function startChallenge(entryId) {
    encReturn = { from: 'ency', tab: infoTab, weight: infoWeightKind, entry: entryId };   // 记录来源弹窗 + 页签 + 条目（返回上一步用）
    const d = ENCY_DATA[entryId];
    const challenge = d.type === 'boss'
      ? { kind: 'boss', type: 'boss', bossId: d.bossId || 'song' }
      : { kind: 'enemy', type: d.type, variant: d.variant || null, behavior: d.behavior || null, name: d.name };
    closeEncyclopedia();
    resetGame(true, { challenge });
  }

  // 波次测试：从数值图鉴「旧怪物权重 · 波次」行发起——挑战对象为整个编队（无顶部血条）。
  // 引擎侧见 04-spawn updateChallenge（场上清空后自动补刷同编队）与 14-main（战斗中按 = 额外追加一整波）
  function startWaveTest(f) {
    const idx = WAVE_FORMATIONS.findIndex(w => w.fn === f.fn);
    if (idx < 0) return;
    closeInfoModal();
    resetGame(true, { challenge: { kind: 'wave', wave: idx, name: f.name } });
  }

  // 测试3 波次测试：从「测试3」卡片右上角「▶ 测试」发起（challenge.kind 'wave' + waveTest3 携带卡片数据；
  // 生成见 04-spawn spawnT3Wave 按 dots 铺阵，血量走 makeEnemy 测试环境 20000；按 = 立刻清场重刷——14-main）
  // ─── 测试3（波次示意）波次测试：按「刷怪权重」（原「波次刷怪权重」）抽取敌人清单（2026-10-11 用户定稿：测试按钮与正常抽取刷怪逻辑一致）───
  // 规则（与「权重-刷怪权重」页一致）：
  // 1) 每类别按表权重加权随机一个职能池（大类）——多槽同类整组共用这一次大类判定；池内按职能表「当前等级档」权重随机具体敌人
  // 2) 整组 8% 概率锁定为同一种具体敌人（如 2*7 的 7 架全部刷成赤红突击艇）
  // 3) 回退链：落到的池在当前等级档全无权重 → 按表权重序环形找下一个有权重的池；全部大类均不可刷 →
  //    固定生成 赤月侧翼艇（1类）/ 赤红突击艇（2类）/ 赤红炮艇（3类）/ 赤红主力舰（4类）
  // 「N类全部」池 = 该类全部职能组成员并集去重（排除 reserved 与奖励无人舰）；fixed 波（z*/y*/h*）不走抽取直接映射。
  // 抽取在图鉴侧完成（职能表 INFO_T1_GROUPS / 权重表 WAVE_SPAWN_W 在本模块，04-spawn 反向 import 会成环），
  // plan 元素 { type, variant, behavior } 直接喂给 04-spawn 的 spawnChallengeTargetOne(ovr) 正规骨架。
  const T3_POOL_FALLBACK = { 1: 'side_moon', 2: 'striker_crimson', 3: 'gunship_crimson', 4: 'capital_crimson' };
  function t3TierIdx() {
    const lv = levelFlow.level;
    return lv < 11 ? 0 : lv < 21 ? 1 : lv < 31 ? 2 : lv < 41 ? 3 : 4;
  }
  function t3ResolvePool(name, cls) {
    if (name !== cls + '类全部') return INFO_T1_GROUPS.find(g => g.name === name) || null;
    const members = [], seen = new Set();
    for (const g of INFO_T1_GROUPS) {
      if (!g.name.startsWith(cls)) continue;
      for (const m of g.members) {
        const key = m.ency || m.name;
        if (seen.has(key)) continue;
        seen.add(key);
        if (m.reserved || !m.ency) continue;
        const base = ENCY_DATA[m.ency];
        if (!base || base.type === 'douzhi' || base.type === 'sponsor' || base.type === 'sponsorDeluxe') continue;   // 奖励无人舰非波次敌人
        members.push(m);
      }
    }
    return { name, members };
  }
  function t3PickFromPool(pool, tier) {   // 池内按职能表档位权重随机成员 ency；全 0 → null
    let total = 0;
    for (const m of pool.members) total += ((m.w && m.w[tier]) || 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const m of pool.members) {
      r -= ((m.w && m.w[tier]) || 0);
      if (r <= 0) return m.ency;
    }
    return pool.members[pool.members.length - 1].ency;
  }
  function t3PoolHasWeight(pool, tier) {
    return pool.members.some(m => ((m.w && m.w[tier]) || 0) > 0);
  }
  function buildT3SpawnPlan(f) {
    // 档位按当前局内等级（t3TierIdx）——波次测试局已锁 Lv30（14-main 帧首覆盖）→ 恒 Lv21 档，
    // 正式非诗篇波次按实时等级档
    const tier = t3TierIdx();
    const slots = {};   // cls → 该类各槽位在 f.dots 中的索引（生成端按 dot 定位/定向：以预览图为标准）
    f.dots.forEach((d, i) => { (slots[d[2]] = slots[d[2]] || []).push(i); });
    const plan = [];
    for (const cls of Object.keys(slots)) {
      const n = slots[cls].length;
      let entries = null;
      if (cls === 'z') {
        // z*8 双侧自爆对冲（2026-10-11 用户改版）：两侧各随机 7~10 只、紫电7 / 白影3——dots 仅作预览示意，
        // 数量与侧别在此特判；生成端按 zSide 从所属侧屏外入场、斜向对侧边缘偏下位置
        for (const side of [-1, 1]) {
          const nSide = 7 + ((Math.random() * 4) | 0);   // 每侧 7~10
          const queue = Math.random() < 0.5;   // 50%：该侧单点排队——整侧同点出生、按 delay 依次延迟出场（不同时在同个位置出现）
          for (let k = 0; k < nSide; k++) {
            const kamikaze = Math.random() < 0.7;   // 紫电7 : 白影3
            plan.push({ type: 'side', variant: null, behavior: kamikaze ? 'kamikaze' : 'pass', cls, zSide: side, dot: slots.z[0], queue, delay: k * 0.22 });
          }
        }
        continue;   // 已直接入 plan，不走通用 entries 流程
      }
      if (cls === 'r') {
        // 2R 增益无人舰（额外级）：斗志昂扬10 / 赞助无人舰8 / 豪华赞助无人舰2（2026-10-11 用户定稿）
        entries = [];
        for (let k = 0; k < n; k++) {
          const r = Math.random() * 20;
          entries.push(r < 10 ? 'douzhi' : r < 18 ? 'sponsor' : 'sponsorDeluxe');
        }
      } else if (cls === 'w') entries = ['warGhost'];
      else if (cls === 'y') entries = Array(n).fill('striker_dusk');
      else if (cls === 'h') {
        // h*1/h*2（单导弹/双导弹）：召唤「3类攻击后位」池敌人（2026-10-12 用户定稿）——
        // 当前池仅炮火先兆者 → 实际生成不变；后续后位池扩员（如 3C 中枢炮火先兆者）自动跟上
        const pool = t3ResolvePool('3类攻击后位', 3);
        entries = [];
        for (let k = 0; k < n; k++) entries.push((pool && t3PickFromPool(pool, tier)) || 'harbinger');
      }
      else {
        const pools = (WAVE_SPAWN_W[f.id] && WAVE_SPAWN_W[f.id][cls]) || WAVE_SPAWN_W_DEFAULT[cls] || [];
        // 大类抽取：按表权重加权随机落点；落到的池当前档不可刷 → 从落点起按表权重序环形回退找下一个有权重的池
        const weighted = pools.filter(p => p[1] > 0);
        let pool = null;
        if (weighted.length) {
          let total = 0;
          for (const p of weighted) total += p[1];
          let r = Math.random() * total, first = weighted.length - 1;
          for (let i = 0; i < weighted.length; i++) { r -= weighted[i][1]; if (r <= 0) { first = i; break; } }
          for (let i = 0; i < weighted.length; i++) {
            const g = t3ResolvePool(weighted[(first + i) % weighted.length][0], cls);
            if (g && t3PoolHasWeight(g, tier)) { pool = g; break; }
          }
        }
        if (!pool) {
          entries = Array(n).fill(T3_POOL_FALLBACK[cls]);
        } else {
          const pick = t3PickFromPool(pool, tier);
          if (pick != null && Math.random() < 0.08) entries = Array(n).fill(pick);   // 8% 整组同一种
          else {
            entries = [];
            for (let k = 0; k < n; k++) entries.push(t3PickFromPool(pool, tier) || T3_POOL_FALLBACK[cls]);
          }
        }
      }
      for (let k = 0; k < entries.length; k++) {
        const ency = entries[k];
        const d = ENCY_DATA[ency] || {};
        plan.push({ type: d.type, variant: d.variant || null, behavior: d.behavior || null, cls, dot: slots[cls][k] });
      }
    }
    return plan;
  }

  function startT3WaveTest(f) {
    encReturn = { from: 'info', tab: infoTab, weight: infoWeightKind };   // 记录来源弹窗 + 页签（返回上一步用）
    closeInfoModal();
    resetGame(true, { challenge: { kind: 'wave', waveTest3: { f, roll: () => buildT3SpawnPlan(f) }, name: (f.id + (f.name ? ' · ' + f.name : '')) + '（波次示意）' } });
  }

  // 持续刷怪测试：从数值图鉴「旧怪物权重 · 波次」页发起——锁定 Lv20 强度无限刷怪（14-main 锁级 / 04-spawn swarm 分支），
  // 数字键 1~0 直接发放奖励道具（14-main SWARM_CHEAT_ITEMS）。challenge.kind==='swarm' 同样享受 testMode 门控（不加分不掉落）
  function startSwarmTest() {
    closeInfoModal();
    resetGame(true, { challenge: { kind: 'swarm', name: '持续刷怪测试' } });
  }

  // BOSS 试炼：正常战斗模式（双方均不无敌，走 testBoss 流程直接进警报登场）
  // 传入的可能是图鉴条目 id（boss_storm）或 BOSS id（storm），统一解析为 BOSS id
  function startBossTrial(entryId) {
    encReturn = { from: 'ency', tab: infoTab, weight: infoWeightKind, entry: entryId };   // 记录来源弹窗 + 页签 + 条目（返回上一步用）
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
    // 预览时间基准冻结（2026-10-03 修复：多次点击威龙预览图变化）——威龙旋翼相位 spin = state.time*26、
    // 脉动 glow 等绘制内读 state.time，单次渲染取点击时刻相位导致每次点击画面不同；
    // 预览统一固定 T=10 静态一帧（warGhost 分支显式取 t=1.2 静态帧同一思路），同步渲染先存后还原
    const timeSaved = state.time;
    state.time = 10;
    try {
    withPreviewCtx(pctx, () => {
      if (d.wip) {
        // wip 未实装条目：白色圆角方块占位（居中，占画布约 62%）——条目名字/数值已登记，实装后替换专属外观
        //（2026-10-03 重建兜底：zhangzhang 加入诗篇级时发现该分支曾随历史批次实装被移除、仅剩幽灵注释）
        pctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        pctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
        pctx.lineWidth = 1.5;
        const ws = Math.min(LW, LH) * 0.62;
        const wr = 7;
        pctx.beginPath();
        pctx.moveTo(LW / 2 - ws / 2 + wr, LH / 2 - ws / 2);
        pctx.arcTo(LW / 2 + ws / 2, LH / 2 - ws / 2, LW / 2 + ws / 2, LH / 2 + ws / 2, wr);
        pctx.arcTo(LW / 2 + ws / 2, LH / 2 + ws / 2, LW / 2 - ws / 2, LH / 2 + ws / 2, wr);
        pctx.arcTo(LW / 2 - ws / 2, LH / 2 + ws / 2, LW / 2 - ws / 2, LH / 2 - ws / 2, wr);
        pctx.arcTo(LW / 2 - ws / 2, LH / 2 - ws / 2, LW / 2 + ws / 2, LH / 2 - ws / 2, wr);
        pctx.closePath();
        pctx.fill();
        pctx.stroke();
        return;
      }
      if (d.type === 'boss') {
        // BOSS 预览：先按世界比例画到离屏画布，扫描不透明像素得到真实包围盒，
        // 再按包围盒居中并尽量放大贴入目标画布 —— 避免手工估算中心/缩放造成的偏移与偏小
        //（机体绘制中心与碰撞盒中心普遍不重合，且各 BOSS 视觉占比差异大；实测包围盒对所有 BOSS 通用，含今后新增）
        const spec = d.bossId === 'storm2'
          ? { bossId: 'storm2', w: 175, h: 78, fitMul: 0.7 }   // 风暴编织者本体较前两位 BOSS 小：预览在包围盒适配基础上整体再缩 30%
          : (d.bossId === 'darkhand' ? { bossId: 'darkhand', w: DARKHAND.w, h: DARKHAND.h }
          : (d.bossId === 'storm' ? { bossId: 'storm', w: STORM.w, h: STORM.h } : { bossId: 'song', w: BOSS.w, h: BOSS.h }));
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
      } else if (d.type === 'warGhost') {
        // 战争幽灵：测试1候选绘制器（B2 定稿图 paintWarGhostCandidate）+ alpha 包围盒自适应居中缩放（同 BOSS 法）。
        // 巨镰前指 66 / 四帆远扫 / 尾焰等绘制内容远超碰撞盒，按碰撞盒 fit 会裁切或偏小——按包围盒完整入图定大小；
        // 静态一帧取 t=1.2（流光行至中段、核脉动中等相位）；详情大图与列表缩略图共用本分支
        const world = 150;   // 离屏覆盖边长（±75）：候选形态绘制半径约 56（镰尖 54 / 帆 44 / 焰尾 46）+ 辉光外溢裕量
        const dim = Math.ceil(world * DPR);
        const off = document.createElement('canvas');
        off.width = dim; off.height = dim;
        const octx = off.getContext('2d');
        withPreviewCtx(octx, () => {
          octx.scale(DPR, DPR);
          octx.translate(dim / (2 * DPR), dim / (2 * DPR));
          paintWarGhostCandidate(octx, 1.2);
        });
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
        if (maxX < 0) return;
        const bx0 = minX / DPR - world / 2, bx1 = (maxX + 1) / DPR - world / 2;
        const by0 = minY / DPR - world / 2, by1 = (maxY + 1) / DPR - world / 2;
        const bw = bx1 - bx0, bh = by1 - by0;
        const bcx = (bx0 + bx1) / 2, bcy = (by0 + by1) / 2;
        const s = Math.min(LW * 0.88 / bw, LH * 0.88 / bh);
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
              arrived: true, chargeT: HARBINGER.chargeFirstMin * 0.75, _sideVel: null,
              // 赤金主力舰：旋转双环按 ringsLeft 绘制（10-draw-world crgold 分支，ringT≥0.8 全显现）——预览按满配置带双环（原缺两字段导致预览无环）
              ringsLeft: spec.variant === 'crgold' ? 2 : null, ringT: spec.variant === 'crgold' ? 1 : null,
              // 4S 精英（drawEnemy 精英绘制分支按 elPhase 路由）：预览按驻留相位走精英立绘（无技能状态、特效全空）
              elPhase: ['puxuefeng', 'hanxixian', 'xiayong', 'xinguodong'].includes(spec.type) ? 1 : null,
              encyPreview: true,   // 图鉴预览标记：辛国栋尾焰等动态机身特效在预览中不绘制（drawEliteBody 门控）
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
    } finally {
      state.time = timeSaved;
    }
  }

  // ---------- 快捷切换难度（图鉴头部，关闭按钮左侧） ----------
  // 四选一按钮组（静态标记于 index.html，始终渲染）：点击直接选中（与主界面「选择难度」卡片的选中态同步）。
  // 置灰/提示/选中态由 DIFFICULTIES 驱动；设计中（wip）难度不可点，实装后自动可选。
  // 难度在下一局开始时生效（选机页停留期间切换即为开局所选）。
  // 启动时调用一次：绑定点击 + 按 DIFFICULTIES 初始化按钮状态
  function initEncyDiffButtons() {
    // 数值与机制图鉴右上角同款按钮组（2026-10-11 用户定稿）：统一全文档管理两处 .ency-diff-btn（怪物图鉴 #encyDiffGroup + 数值图鉴 #infoDiffGroup）
    document.querySelectorAll('.ency-diff-btn').forEach(btn => {
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
        // 数值与机制图鉴开着 → 重渲染当前页（波次测试环境血量/诗篇修正注解等随难度变化）
        if (!infoModal.classList.contains('hidden')) buildInfoTabs();
      });
    });
    syncDifficultyUI();
  }

  // 同步难度 UI：两处图鉴按钮组选中态 + 主界面难度卡片选中态（HUD 标签由 updateHUD 每帧自刷新，无需处理）
  function syncDifficultyUI() {
    document.querySelectorAll('.ency-diff-btn').forEach(el =>
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
  let infoTab = 'weightGroup';        // weightGroup 权重（默认页；原顶级「旧怪物权重」现为组内外层子页签 oldWeights，2026-10-12 定稿） | waves 特殊机制 | mods 特殊修正
  let infoWeightKind = 'side';        // weights 页子类型（按级别分组）：side 虚象级 | striker 具象级 | special3 真我级 | capital 诗篇级 | formation 波次
  let infoWeightGroupKind = 'monster';   // weightGroup 权重页子页签：monster 怪物权重 | wave 波次权重 | waveSpawn 刷怪权重（原「波次刷怪权重」，2026-10-12 用户定稿更名） | t3 波次（原「波次示意」，2026-10-12 更名） | oldWeights 旧怪物权重（外层页签，2026-10-12 自波次权重等级行提升至「波次」右侧） | mechanics 刷怪机制
  let infoEquipKind = 'planes';       // equipment 装备页子页签：planes 战机&僚机 | armors 护甲 | subs 副武器 | pilots 驾驶员
  // 【测试/设计页签不放置说明文案】（2026-10-11 用户定稿）测试1~4 与「权重」组等设计工作区页签均为用户本人使用的
  // 草稿区——用户清楚各页用途，页面顶部不放说明性描述（本次已删 权重·怪物权重 / 测试3 / 测试4 三处顶部描述段；
  // 后续新增测试页签同样不加页顶说明）。
  // 【图鉴文案用户定稿】（2026-10-13 用户定稿）怪物/装备/驾驶员等条目 desc 与 lore 为用户逐字定稿的文案——
  // 后续窗口除非出现事实错误（与代码行为/数值不符），禁止改写措辞、增删「有的没的」无用描述或调整换行结构；
  // 用户交付的换行/分行结构属于文案原貌，<br> 接行照录；敌机特殊背景文案（lore，如斗志昂扬「艾伦精选科技公司感谢您……」）
  // 永不删改。

  // 等级分档：Lv1~10 一档，之后每 10 级一档（先做 5 档）；格内权重按各档起始等级计算
  const INFO_TIERS = [
    { label: 'Lv1',  lv: 1 },
    { label: 'Lv11', lv: 11 },
    { label: 'Lv21', lv: 21 },
    { label: 'Lv31', lv: 31 },
    { label: 'Lv41', lv: 41 },
  ];

  // 目前游戏等级范围内前三档（Lv1~30）实际生效——2026-10-08 轮次重排后第三轮 21 级起步、31 级迎战暴风之眼
  //（Lv21~30 权重暂与 Lv20 一致，波次设计进行中；Lv31/41 档仍待定稿显示「—」）
  const INFO_TIERS_LIVE = 3;
  // 档位遮罩：未生效档（Lv31 以上）显示「—」，其余保留（0 写作 0）
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
        arrived: true, chargeT: HARBINGER.chargeFirstMin * 0.75, _sideVel: null,
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
      label: '奖励无人舰（升级触发·当前难度）',
      // 奖励无人舰体系（2026-09-29）：每次关卡提升按当前难度概率刷新一架（每次至多一架），
      // 三种按 斗志昂扬5 / 赞助无人舰4 / 豪华赞助无人舰1 加权抽取——表中为当前难度的触发概率（不随关卡档位变化）
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
    ];
    for (const d of defs) {
      const b = document.createElement('button');
      b.className = 'info-chip' + (infoWeightKind === d.id ? ' active' : '');
      b.textContent = d.name;
      b.addEventListener('click', () => { infoWeightKind = d.id; renderInfoWeights(); });
      chips.appendChild(b);
    }
    // （旧怪物权重现为权重组外层页签，无需页内返回入口——2026-10-12 用户定稿）
    infoBody.appendChild(chips);
    const headers = ['飞船', ...INFO_TIERS.map(t => t.label)];

    if (infoWeightKind === 'side') {
      infoBody.appendChild(buildWeightTable(headers, infoSideRows()));
      infoAppendNote(INFO_TIER_NOTE + '常规 1类编队（1类小队 / 1类长队 / 双侧斜扫 / 232111 等）中每架按此相对权重抽取构成；权重按关卡分两档（Lv1~10 / Lv11~20）。<b>紫自爆流不混入增生</b>；BOSS 后固定首波不含紫电与橙旋，其余按权重混入。');
    } else if (infoWeightKind === 'striker') {
      infoBody.appendChild(buildWeightTable(headers, infoStrikerRows()));
      infoAppendNote(INFO_TIER_NOTE + '2类突击艇出场时按变体权重选取涂装，权重按关卡分两档直接取值（Lv1~10：赤红30/烈橙30/幽蓝25/紫晶25/霜白20/坚垒25/幽暮2；Lv11~20：10/10/10/10/5/10/5）。法术大师A1 / 破片 / 法术矩阵为 2类突击艇的<b>出场替换概率</b>（判定顺序 A1 → 破片 → 法术矩阵）；<b>奖励无人舰</b>（斗志昂扬 / 赞助无人舰 / 豪华赞助无人舰）为<b>每次关卡提升</b>时按当前难度概率刷新一架（每次至多一架，非波次权重，击败 BOSS 的跳变升级不触发），三种按 ' + REWARD_DRONES.weights.douzhi + '/' + REWARD_DRONES.weights.sponsor + '/' + REWARD_DRONES.weights.sponsorDeluxe + ' 加权抽取（触发概率：虚象 12% / 具象 10% / 真我与诗篇 7%）。');
    } else if (infoWeightKind === 'special3') {
      infoBody.appendChild(buildWeightTable(headers, infoSpecial3Rows()));
      infoAppendNote(INFO_TIER_NOTE + '特殊3类<b>随常规波次登场</b>（每波 25% 概率附带一台，按表中权重抽取）。<b>0 表示该阶段不出场</b>；Lv11 以下仅三色炮艇（合计 260） / 先兆者出场，Lv11 起按高权重列抽取。<b>寒霜 / 御4 / 铁砧 同屏同种限 1</b>（场上已有同种则该次不生成），其余特殊3类不限数量。紫晶 / 赤红 / 金曜炮艇为<b>独立条目</b>（紫80 / 赤100 / 金80），抽取直接决定涂装。');
    } else if (infoWeightKind === 'capital') {
      infoBody.appendChild(buildWeightTable(headers, infoCapitalRows()));
      infoAppendNote(INFO_TIER_NOTE + '4类主力舰<b>同屏限 1</b>，由场面压力系统驱动出场，表中为出场时的<b>变体选取权重</b>（按关卡分两档）。苍蓝主力舰 20% 概率带护盾（前 5s 虚化不受伤害、炮弹穿过）。');
    } else {
      infoBody.appendChild(buildWeightTable(['编队', ...INFO_TIERS.map(t => t.label), '测试'], infoFormationRows()));
      // 持续刷怪测试入口：Lv20 强度无限刷怪（不推进等级 / 永不进 BOSS），数字键改发奖励道具（见 startSwarmTest）
      const swarmBtn = document.createElement('button');
      swarmBtn.className = 'ency-challenge-btn';
      swarmBtn.textContent = '🔥 持续刷怪测试（Lv20）';
      swarmBtn.title = '锁定 Lv20 强度一直刷怪（不推进等级、永不进 BOSS）；敌方正常血量；数字键 1~0 发放奖励道具';
      swarmBtn.addEventListener('click', () => startSwarmTest());
      infoBody.appendChild(swarmBtn);
      infoAppendNote('持续刷怪测试：<b>锁定 Lv20 强度一直刷怪</b>——不推进等级、永不进警报 / BOSS，波次刷新与正常战斗一致（敌方按注册表<b>正常血量</b>，不加分、不掉水晶 / 道具）。页内常规作弊键（1~5 / 8 / 9）全部停用，数字键改为直接发放奖励道具（<b>立刻生效</b>）：<b>1</b> 牢大特饮 · <b>2</b> 磁力菇 · <b>3</b> 不再陵落 · <b>4</b> 寒霜发生器 · <b>5</b> 辛国栋大怒 · <b>6</b> 轰轰炸弹 · <b>8</b> 绷绷背包 · <b>9</b> 酒客之影 · <b>0</b> 瓶中精灵。');
      infoAppendNote(INFO_TIER_NOTE + '编队权重分两段：<b>Lv1~10 由 a→b 线性过渡</b>（B 档显示 a~b 区间），<b>Lv11~20 恒定</b>；0 = 该等级不出现。Lv5 起每波有概率追加一个编队（组合波，追加位不含炮艇编队；<b>Lv5~10 概率由 10%→30%、Lv11~20 由 10%→40%</b>），详见「特殊怪物波次」。<b>鼠标悬停编队行</b>可查看编队演示——mini 战场回放代表性入场与走位（实际入场侧 / 构成随机）。点击行内「<b>测试</b>」按钮可整波实测：场上清空后自动补刷同编队，战斗中按 <b>=</b> 额外追加一整波（不清场，可观察多波叠加）。');
    }
  }

  // ---------- 权重 · 波次权重子页（2026-10-12 用户定稿实装）：5 子页签对应 5 种波次等级 ----------
  // 每页一个表格：行 = 该等级的波次卡（波次 / 定位 / 构成），列 = Lv1/Lv11/Lv21/Lv31/Lv41——
  // 不同等级刷新该波次的权重（数据 WAVE_SPAWN_DRAW_W，刷怪抽取 pickDesignedWaveCard 按当前等级档取列消费；
  // 波内敌人怎么抽见「刷怪权重」子页职能池列（原「波次刷怪权重」更名）——两页互补：本页管「刷不刷这波」，那页管「这波刷什么」）。
  // 子页签为页内第二行 chips（外层四合一 chips 之下，sticky 叠位由 renderInfoWeightGroup secondRow 逻辑对齐）
  let waveWeightTab = '虚象级';   // 选中的波次等级子页签（模块级，页间切换保留）
  const WAVE_WEIGHT_TIERS = ['虚象级', '具象级', '真我级', '诗篇级', '特殊级', '额外级'];
  const WAVE_WEIGHT_TIER_COLOR = { '虚象级': '#7fe8c9', '具象级': '#ffd166', '真我级': '#ff5a5a', '诗篇级': '#c084fc', '特殊级': '#b7a3ff', '额外级': '#ff8ad8' };
  function renderWaveWeightsPage() {
    infoBody.innerHTML = '';
    const ROLE_ORDER = { '前波': 0, '后波': 1, '前后均可': 2, '侧翼': 3, '特殊': 4 };   // 行序（前波→后波→前后均可→侧翼→特殊 稳定排序）
    // 子页签行（6 种波次等级：五级 + 特殊级 = 幽暮系特殊波独立区块，2026-10-12 用户定稿）
    const tabs = document.createElement('div');
    tabs.className = 'info-subtabs';
    for (const t of WAVE_WEIGHT_TIERS) {
      const b = document.createElement('button');
      b.className = 'info-chip' + (waveWeightTab === t ? ' active' : '');
      b.textContent = t;
      b.style.color = WAVE_WEIGHT_TIER_COLOR[t];
      b.addEventListener('click', () => { waveWeightTab = t; renderInfoWeightGroup(); });
      tabs.appendChild(b);
    }
    infoBody.appendChild(tabs);
    // 标题
    const head = document.createElement('h3');
    head.className = 'info-achv-tier-head';
    head.textContent = waveWeightTab + ' · 波次抽取权重（' + WAVE_SPAWN_LIST.filter(w => w.tier === waveWeightTab).length + ' 波）';
    head.style.color = WAVE_WEIGHT_TIER_COLOR[waveWeightTab];
    infoBody.appendChild(head);
    // 表格：波次 | Lv1~Lv41 抽取权重（5 列；0 = 待填/该档不刷出，全部显示「—」）
    // 波次列显示名（2026-10-12 用户定稿）：额外级与字母代号卡（y*/w*/h*）显示语义名（单导弹/单幽暮/战争幽灵等），
    // 数字/算式代号本身表意（11211/2*7/1*12防/2侧+1*2 等）→ 只显示代号不再缀名；悬停行可看代号 id
    const list = WAVE_SPAWN_LIST.filter(w => w.tier === waveWeightTab)
      .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
    const table = document.createElement('table');
    table.className = 'info-table';
    const hr = document.createElement('tr');
    for (const h of ['波次', 'Lv1', 'Lv11', 'Lv21', 'Lv31', 'Lv41']) {
      const c = document.createElement('th');
      c.textContent = h;
      if (h.startsWith('Lv')) c.style.cssText = 'min-width:44px;';
      hr.appendChild(c);
    }
    table.appendChild(hr);
    for (const w of list) {
      const tr = document.createElement('tr');
      const tdId = document.createElement('td');
      tdId.className = 'info-ship-cell';
      tdId.style.cssText = 'text-align:left;white-space:normal;';
      tdId.title = w.id;
      tdId.textContent = (w.tier === '额外级' || /^[a-z]/.test(w.id)) ? w.name : w.id;
      tr.appendChild(tdId);
      const drawW = WAVE_SPAWN_DRAW_W[w.id] || [0, 0, 0, 0, 0];
      for (let i = 0; i < 5; i++) {
        const td = document.createElement('td');
        const v = drawW[i] || 0;
        td.style.cssText = v > 0 ? 'color:#e8f2ff;font-weight:bold;' : 'color:rgba(255,255,255,0.28);';
        td.textContent = v > 0 ? v : '—';
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    infoBody.appendChild(table);
    // 规则说明
    infoAppendNote('本页为<b>波次卡抽取权重</b>：刷怪按当前等级档（Lv1~10 / Lv11~20 / Lv21~30 / Lv31~40 / Lv41+）取对应列的权重，加权随机一张波次卡整波刷出——<b>— 表示该等级档不刷出此波</b>；Lv5 起有概率同波<b>追加第二张卡</b>（组合波，Lv11+ 约 10~40%）；刷过的卡 16s 内线性恢复（自然轮换），与上次同定位（后波/侧翼等）的卡权重 ×0.35（较少连刷同定位）。'
      + '<b>数值待填期间</b>（某等级档全列均为 —）该档按定位兜底抽取：主战卡（前波/后波/前后均可）1.2 / 侧翼 0.9 / 特殊 0.35，填入任一非零后该档即严格按表。'
      + '波内敌人构成与抽取规则见「<b>刷怪权重</b>」子页（类别 × 职能池权重）；波次卡编队示意见「<b>波次</b>」子页；'
      + '<b>特殊级</b>（单幽暮 / 双幽暮 / 幽暮四角，2026-10-12 自虚象/具象/真我级抽出）经诗篇<b>额外波次</b>通道生成，见「<b>刷怪机制</b>」子页；'
      + '诗篇主战/侧翼/额外/真额外生成体系见「<b>刷怪机制</b>」子页（2026-10-12 用户定稿）。');
  }

  // ---------- 权重 · 刷怪机制子页（2026-10-12 用户定稿）：诗篇主战 / 侧翼 / 额外 / 真额外生成体系说明 ----------
  // 数值唯一来源：桌面《波次权重填数表.xlsx》（权重/概率）+ 01-config-spawn POEM_FLANK_EXTRA / POEM_EXTRA_CHANCE（概率与等级权重）。
  // 本页为机制文档（图鉴文案权威），改机制时同步本页与《诗篇难度修正.md》。
  function renderSpawnMechanics() {
    infoBody.innerHTML = '';
    const mkTable = (headers, rows) => {
      const table = document.createElement('table');
      table.className = 'info-table';
      const hr = document.createElement('tr');
      for (const h of headers) {
        const c = document.createElement('th');
        c.textContent = h;
        hr.appendChild(c);
      }
      table.appendChild(hr);
      for (const row of rows) {
        const tr = document.createElement('tr');
        for (const v of row) {
          const td = document.createElement('td');
          td.textContent = v;
          td.style.cssText = 'text-align:center;';
          tr.appendChild(td);
        }
        table.appendChild(tr);
      }
      infoBody.appendChild(table);
    };
    const h = (t, color) => {
      const el = document.createElement('h3');
      el.className = 'info-achv-tier-head';
      el.textContent = t;
      if (color) el.style.color = color;
      infoBody.appendChild(el);
    };
    h('刷怪机制 · 诗篇波次生成体系（2026-10-12 用户定稿）', '#ffd166');
    // ① 主战波次
    h('① 主战波次', '#ff9a4d');
    mkTable(['阶段', '虚象级', '具象级', '真我级', '诗篇级'], [
      ['Lv1~10', '10', '10', '8', '5'],
      ['Lv11~20', '5', '10', '15', '8'],
      ['Lv21~30', '2', '5', '20', '10'],
    ]);
    infoAppendNote('诗篇<b>每级一波</b>（波 N = 等级 N，上一波清场后刷新；<b>场上仅剩威龙时不等待</b>——下一波照常刷新、威龙留场，2026-10-12 用户定稿；BOSS 触发前的清场不受此豁免）。<b>每等级固定刷 1 前波 + 1 后波</b>（2026-10-12 用户定稿）：前波位 / 后波位各自「等级先行」——先按上表「等级权重」选定 tier，再在 tier 内按「波次权重」表当前档列加权抽取（前波位抽「<b>前波 / 前后均可</b>」、后波位抽「<b>后波 / 前后均可</b>」）；<b>无「场上已有主力舰排除 4类卡」限制</b>（44 / 22422 等按表登场）；特殊3类随波附赠保留。<b>Lv5 及之前不刷「诗篇级」波次卡</b>（2026-10-13 用户定稿，Lv6 起恢复按表权重）。刷过卡的 16s 恢复期与同定位 ×0.35 规则同「波次权重」页。');
    // ② 侧翼波次额外生成
    h('② 侧翼波次额外生成', '#6fb4ff');
    mkTable(['阶段', '本波触发概率'], [['Lv1~10', '50%'], ['Lv11~20', '80%'], ['Lv21~30', '80%']]);
    mkTable(['阶段', '虚象级', '具象级', '真我级', '诗篇级'], [
      ['Lv1~10', '10', '5', '5', '1'],
      ['Lv11~20', '5', '10', '8', '5'],
      ['Lv21~30', '1', '10', '10', '5'],
    ]);
    infoAppendNote('每波主战卡落地后<b>独立掷概率</b>；命中后按上表「等级权重」选定从哪个等级生成，再在该等级的「<b>侧翼</b>」定位波次卡中按「波次权重」当前档列加权抽取（0 = 排除），按卡构成出怪。附加波<b>不占前/后波名额、不推进波次计数</b>；许凯狗冲刺期不生成（两侧不刷怪）。诗篇级侧翼池 = 双侧自爆对冲（2026-10-12 定位改侧翼）。<b>Lv5 及之前不生成诗篇级侧翼</b>（2026-10-13 用户定稿，与主战通道同口径）。');
    // ③ 额外波次生成
    h('③ 额外波次生成', '#9fe8a0');
    mkTable(['阶段', '本波触发概率'], [['Lv1~10', '50%'], ['Lv11~20', '100%'], ['Lv21~30', '100%']]);
    infoAppendNote('命中后把<b>所有「特殊」定位波</b>的权重加到一起，按「波次权重」当前档列加权抽取生成谁——池 = 额外级特1~特13 + <b>并入的特殊波</b>（单幽暮 / 双幽暮 / 幽暮四角，权重不变，现列「波次权重」页特殊级区块；2026-10-12 用户定稿：所有特殊波次均并入额外波次，<b>之后不再有特殊波次生成通道</b>，原特殊概率 5%/8%/10% 作废）。真额外三项（下条）不入本池。');
    // ④ 真额外三项
    h('④ 真额外三项（概率卡）', '#ff8ad8');
    mkTable(['波次', 'Lv1~10', 'Lv11~20', 'Lv21~30'], [
      ['单导弹', '2%', '2%', '—'],
      ['双导弹', '—', '3%', '5%'],
      ['增益无人舰', '6%', '6%', '6%'],
    ]);
    infoAppendNote('「波次权重」表中这三张卡填的是<b>每波触发概率</b>（非权重）：逐项独立掷取、与①②互不影响；<b>单导弹与双导弹互斥</b>（单导弹命中则本波不再判双导弹）；任何权重抽取（主战 / 侧翼 / 额外）都不会随机到这三张卡。');
    infoAppendNote('数值来源：桌面《波次权重填数表.xlsx》（2026-10-12 用户填写，以表为准）；机制登记见《诗篇难度修正.md》。非诗篇难度：主战波同走「等级权重 → tier 内按表抽卡」（<b>不限定位</b>——无 1前1后配对要求，侧翼随池、许凯狗冲刺仍排除侧翼；Lv5 起保留概率组合波），仍走场面压力系统（低于阈值加速召唤下一波）；<b>特殊级 / 额外级</b>改为<b>每次升级时判定</b>（概率/权重同诗篇额外通道：额外波次 50%/100%/100% + 真额外三项；BOSS 战/结算窗口内升级不判定）；游戏等级上限 31（终局 BOSS 关），Lv31 档沿用 Lv21~30 行等级权重。');
  }

  // 刷怪权重板块（权重 → 「刷怪权重」子页，原「波次刷怪权重」2026-10-12 用户定稿更名；承接测试3各波次，数据见 WAVE_SPAWN_W / WAVE_SPAWN_LIST）
  function renderWaveSpawnWeights() {
    infoBody.innerHTML = '';   // 独立子页：先清场（monster 子页切换残留）
    const ROLE_COLOR = { '前波': '#ff9a4d', '后波': '#6fb4ff', '前后均可': '#9fe8a0', '侧翼': '#ffd166', '特殊': '#ff8ad8' };   // 与测试3 T3_ROLE_COLOR 保持一致
    const ROLE_ORDER = { '前波': 0, '后波': 1, '前后均可': 2, '侧翼': 3, '特殊': 4 };   // 表格行序（2026-10-12 用户定稿：前波→后波→前后均可→侧翼→特殊；稳定排序保留同定位内定义序）
    const tiers = ['虚象级', '具象级', '真我级', '诗篇级', '特殊级', '额外级'];
    const tierColor = { '虚象级': '#7fe8c9', '具象级': '#ffd166', '真我级': '#ff5a5a', '诗篇级': '#c084fc', '特殊级': '#b7a3ff', '额外级': '#ff8ad8' };
    for (const tier of tiers) {
      const list = WAVE_SPAWN_LIST.filter(w => w.tier === tier).sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
      if (!list.length) continue;
      const th = document.createElement('h3');
      th.className = 'info-achv-tier-head';
      th.textContent = tier + '（' + list.length + ' 波）';
      th.style.color = tierColor[tier];
      infoBody.appendChild(th);
      const table = document.createElement('table');
      table.className = 'info-table';
      const hr = document.createElement('tr');
      for (const h of ['波次', '定位', '构成', '刷怪权重']) {
        const c = document.createElement('th');
        c.textContent = h;
        hr.appendChild(c);
      }
      table.appendChild(hr);
      for (const w of list) {
        const tr = document.createElement('tr');
        const tdId = document.createElement('td');
        tdId.className = 'info-ship-cell';
        tdId.style.cssText = 'text-align:left;white-space:normal;';
        tdId.textContent = w.id + (w.name ? ' · ' + w.name : '');
        tr.appendChild(tdId);
        const tdRole = document.createElement('td');
        const roleSpan = document.createElement('span');
        roleSpan.textContent = w.role;
        roleSpan.style.color = ROLE_COLOR[w.role] || '#fff';
        tdRole.appendChild(roleSpan);
        tr.appendChild(tdRole);
        const tdComp = document.createElement('td');
        tdComp.style.cssText = 'text-align:left;white-space:normal;font-size:11px;color:#9fb4d8;';
        tdComp.textContent = w.comp;
        tr.appendChild(tdComp);
        const tdW = document.createElement('td');
        tdW.style.cssText = 'text-align:left;white-space:normal;font-size:11px;line-height:1.55;min-width:180px;';
        if (w.fixed) {
          tdW.textContent = w.fixed;
        } else {
          const reg = WAVE_SPAWN_W[w.id];
          tdW.innerHTML = w.classes.map(cls => {
            const isDef = !(reg && reg[cls]);
            const pools = isDef ? WAVE_SPAWN_W_DEFAULT[cls] : reg[cls];
            return '<b>' + cls + '类</b>｜' + pools.map(p => p[0] + p[1]).join('、') + (isDef ? ' <span style="color:rgba(255,255,255,0.45)">(默认)</span>' : '');
          }).join('<br>');
        }
        tr.appendChild(tdW);
        table.appendChild(tr);
      }
      infoBody.appendChild(table);
    }
    // 标题 + 系统规则说明（2026-10-11 用户定稿：移到表格最底部）
    const head = document.createElement('h3');
    head.className = 'info-achv-tier-head';
    head.textContent = '刷怪权重（承接测试3 · 诗篇波次制规划）';
    head.style.color = '#7fb4ff';
    infoBody.appendChild(head);
    infoAppendNote('每个波次按 <b>1/2/3/4 类别</b>设定<b>职能池权重</b>（池成员见「怪物权重」页职能表）：刷怪时按权重随机一个职能池，再在池内按职能表权重随机具体敌人——如「3类攻击20、3类攻击后位2」＝ 20 权重从 3类攻击 随机、2 权重从 3类攻击后位 随机（<b>N类全部</b>＝该类「全部敌人」总表）。'
      + '<b>多个同类敌人</b>的波次：整组先随机一个池（大类），该组同类敌人全部只从该池刷新；随后整组 <b>8%</b> 概率锁定为<b>同一种</b>具体敌人（如 2*7 的 7 架全部刷成赤红突击艇）。'
      + '<b>前波敌人</b>停留线统一<b>下移屏高 8%</b>、<b>后波</b>统一<b>上移 8%</b>（「前后均可」每次刷新随机按其一；基于各敌人自身基准位置，不会导致出界或出场不完全）。'
      + '<b>生成回退</b>：该类别所选池在当前等级均无权重 → 换一个大类刷新；全部大类均不可刷 → 固定生成 <b>赤月侧翼艇</b>（1类）/ <b>赤红突击艇</b>（2类）/ <b>赤红炮艇</b>（3类）/ <b>赤红主力舰</b>（4类）。'
      + '表中标「默认」的波次尚未登记专属权重，按类别套用默认：<b>1类</b> 全部20；<b>2类</b> 攻击20、侧位1；<b>3类</b> 攻击25、攻击后位3、攻击压制2、增益辅助2、削弱辅助2；<b>4类</b> 攻击50、召唤10、突进5。'
      + '<b>适用难度</b>：本表波次构成适用于<b>全部难度</b>——仅诗篇为波次制（每等级固定刷前波 + 后波各一波），其他难度的波次刷新同样从本表抽取（2026-10-12 起替换旧编队系统）：场面压力节奏不变，每次刷新按<b>剩余权重</b>随机一张波次卡整波刷出（刷过的卡 16s 内线性恢复、自然轮换），并<b>倾向平衡</b>——与上次刷新同定位（后波 / 侧翼等）的卡权重 ×0.35，较少连续刷出同定位波次。波次卡抽取<b>等级先行</b>（2026-10-12 用户定稿）：先按「等级权重」选 tier（Lv1~10 = 虚象10/具象10/真我8/诗篇5、Lv11~20 = 5/10/15/8、Lv21~30+ = 2/5/20/10；<b>Lv5 及之前不抽「诗篇级」tier</b>——2026-10-13 用户定稿，Lv6 起恢复），再在 tier 内按本页上方各卡权重抽取；特殊级 / 额外级不经此通道——诗篇每波判定、非诗篇每次升级判定（概率/权重同诗篇额外通道）。'
      + '<b>特殊波（诗篇）</b>：不占前/后波名额，随机刷新于<b>前波之前 / 前后波之间 / 后波之后</b>——有停留的敌人停留线相应取<b>基准 +12% / 不变 / 基准 -4%</b>（不过界）。');
  }

  function renderInfoWaves() {
    infoBody.innerHTML = '';
    const cards = [
      // 难度卡：以具象为默认基准描述（数值与 01-config DIFFICULTIES mods 同步，2026-10-11 文案刷新）；
      // BOSS 不写单技能细节——真我仅标注"技能加强"，统一修正单独成卡
      { h: '难度 · 虚象', p: '<b>轻松难度</b>，得分 ×0.8。波次刷新间隔 ×2.3、约为具象 ×1.8；满场压力基准 ×0.75，总刷怪量 / 同屏数量约 -50~60%；非 BOSS 敌机血量 -20%、首次攻击延迟 +0~0.4s、攻击间隔 +25%；1/2 类道具掉率削减修正失效。BOSS：伤害 -40%、技能释放间隔 +50%、不连发同种技能。玩家侧：无敌时间 +50%、受击不掉武器等级、得分 ×0.8。高能爆弹：初始 1 枚、上限 2 枚。' },
      { h: '难度 · 具象', p: '<b>标准难度</b>。波次刷新间隔 ×1.3。掉落判定等级（攻击等级 + 场上升级套件数 + 4×场上暴走道具数）为 1 时：1/2 类道具掉率削减修正失效；判定等级为 2 时效果减弱 50%。随着难度增高，加血道具的掉落量会降低。高能爆弹：初始 1 枚、上限 2 枚。' },
      { h: '难度 · 真我', p: '<b>挑战难度</b>，得分 ×1.2。非 BOSS 敌人伤害 +60%；BOSS 技能加强；BOSS 技能释放间隔 ×0.7；波次刷新间隔约为具象 ×0.77。高能爆弹：初始 0 枚、上限 2 枚、对 BOSS 伤害 -25%。' },
      { h: '难度 · 诗篇', p: '<b>疯狂难度</b>，得分 ×2.2（+120%，2026-10-12 由 +100% 上调）。刷怪改波次制；敌人血量和伤害大幅提升；BOSS 技能再次加强。<b>高能爆弹初始 0 颗、携带上限 1 颗</b>：每局最多掉落 <b>2 颗</b>——掉过 1 颗<b>未使用（持有或掉落物未拾取）不再掉第 2 颗</b>；使用后其余掉落途径概率 <b>×0.35</b>（携带<b>可莉</b>不减；绷绷背包补弹不受以上限制）。Lv1~4 期间每波保底掉落 1 个升级套件（<b>低火力判定 ≤4 时生效</b>，见「升级套件保底」卡）——波内无套件掉落时最后一个被击坠的敌人必掉，离场则作废。' },
      { h: '升级套件保底（低火力补偿）', p: '判定口径：<b>火力等级 + 场上升级套件数 + 5×场上暴走道具数 ≤ 4</b>（场上的待捡道具也计入，捡了再算）。满足时两路保底：<b>① 进 BOSS 前末敌保底</b>——停怪 / 波次刷满等清场期间，清空场上的最后一杀必掉 <b>1 个升级套件</b>（全难度，含 5% 暴走变体）；<b>② 诗篇 Lv1~4 每波保底</b>——诗篇难度 Lv1~4 每波至少掉落 1 个升级套件，波内无套件掉落时最后一个被击坠的敌人必掉（最后一个敌人离场则本波作废）。图鉴挑战 / BOSS 试炼豁免。' },
      { h: '加血套件等级窗口（虚象/具象/真我/诗篇）', p: '每 <b>lv2 / 3 / 4 / 4</b>（虚象/具象/真我/诗篇）最多掉落 <b>1 个加血套件</b>（普通敌人掉落，<b>4S 精英掉率 10%</b> 同受约束）——某级实际掉落后，窗口内后续等级不再掉落（如诗篇 lv22 掉落，则 lv22/23/24/25 均不掉）。<b>不跨 BOSS 轮</b>：清场 / 警报 / BOSS 战期间的加血掉落（含 BOSS 战脚本化加血）不受窗口限制、也不登记窗口（如 lv29 掉落不会影响下一轮 lv31）；图鉴挑战 / BOSS 试炼豁免。诗篇难度下另与波次节流（每 2 波限 1）叠加生效。' },
      { h: 'BOSS 统一修正（全难度）', p: 'BOSS 战期间<b>每 6~12s 强制刷新一波 1类</b>（不走压力系统）：击杀<b>不加分、不掉水晶</b>（道具掉率走通用 1类修正链）。玩家火力 <b>Lv1/2/3 对 BOSS 与 4S 敌人武器伤害 +30%/+20%/+10%</b>（低火力补偿，2026-10-13 用户定稿改版——原仅 Lv1 对 BOSS +20%；高能爆弹不受影响）；进入 BOSS 战<b>重置受击掉级计数</b>（掉级阈值全场景统一 2 次，2026-10-13 由 3 次收紧）。同一技能连续释放：<b>弹速 ×1.4</b>、下一技能间隔 ×0.2（全 BOSS 统一；黑暗之手弹速 2026-10-12 起对齐，其个别技能不连放等例外见各 BOSS 条目）。' },
      { h: '双编队组合波', p: '<b>Lv5 起</b>有概率在同一波内追加一个编队（追加位不含炮艇编队）：<b>Lv5~10 概率由 10% 线性升至 30%、Lv11~20 由 10% 线性升至 40%</b>。' },
      { h: '开局缓冲与低级血量修正', p: '开始游戏后 <b>0.4s</b> 缓冲内不出怪（2026-10-13 用户定稿——诗篇波次制首波 0.4s 缓冲，非诗篇首波间隔本就 ≥0.4s）。<b>Lv1 / Lv2 期间刷新的敌人血量分别 ×0.70 / ×0.85</b>（-30% / -15%，Lv3 起恢复基准；诗篇波 N = 等级 N 同口径——第 1/2 波同享修正，BOSS 后各阶段等级 ≥11 不再触发）。' },
      { h: 'BOSS 击败后固定首波', p: '击败 BOSS 后先缓冲 <b>2s</b>，随后同侧同时刷出 <b>三条 1类长队</b>（每条 <b>5~7 架</b>；首条入场高度 ≈<b>30% 屏高</b>±8px 抖动、相邻条纵向间距<b>随机 50~100px</b>，三条共用同一速度基值——横穿全程平行、间距恒定）——自左或右<b>快速 200</b> 入场、横穿战场自另一侧离场，本波不含紫电与橙旋（白影/增生/黄芒/赤月按权重混入）；<b>本波敌机水晶必掉且掉量翻倍</b>；自首波刷新起 <b>4s</b> 观察期后恢复正常刷怪。2s 与 4s 均不计入关卡推进。' },
      { h: '驻留增压', p: '会停留的敌人登场一段时间后，攻击间隔减少 50%：2 类（突击艇 / 破片 / 法术矩阵等）登场 <b>6s</b> 后、3 类普通炮艇登场 <b>10s</b> 后、4 类（主力舰 / 法术阵列 / 战争幽灵等）登场 <b>14s</b> 后；<b>诗篇难度阈值缩短</b>：2 类 <b>5s</b> / 3 类 <b>7.5s</b> / 4 类 <b>10s</b>。战争幽灵技能间隔同按所属类别阈值加速。3 类仅普通炮艇纳入本效果（威龙 / 先兆者 / 脉冲矩阵 / 大型龙卷等其余 3 类不生效，之后新增的非炮艇 3 类同样如此）。2类防御（坚垒护卫艇）、不停留的敌人（法术大师 A1/A2）与 4S 精英不计入。' },
      { h: '成就', p: '挑战成就在使用特殊战机&僚机&护甲&副武器&驾驶员期间无法获得。右上角有青粉标识的为特殊装备。开启作弊模式后，无法正常获得绝大部分成就，仅能获得部分彩蛋成就。' },
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
      { h: '大型龙卷（暴风之眼召唤）', p: '受到<b>战机主武器伤害 -50%</b>、<b>僚机伤害 +150%</b>（弱点：僚机火力）。' },
      { h: '焦香螺旋桨', p: '登场 <b>2s 内受到伤害 -30%</b>（入场保护，主武器与僚机弹幕均生效；高能爆弹为真实伤害不减免）。' },
      { h: 'BOSS', p: '玩家火力 <b>Lv1/2/3</b> 时对 BOSS 与 <b>4S 敌人</b>的武器伤害 <b>+30% / +20% / +10%</b>（低火力补偿，2026-10-13 用户定稿改版——原仅 Lv1 对 BOSS +20%）。' },
      { h: 'BOSS 无伤通关奖励', p: '本场 BOSS 战全程未受任何伤害 → 击杀得分与掉落水晶单位数均 <b>+20%</b>（暴风之眼与风暴编织者为连续二阶段同一场战斗，两段均无伤才生效）。' },
      { h: '御4 减伤力场', p: '力场内所有敌人受到的<b>非真实伤害 -30%</b>；高能爆弹为真实伤害，无视力场。' },
      { h: '铁砧 治疗光环', p: '治疗光环内所有敌人每秒恢复 <b>1.5% 最大生命 + 50 生命值</b>；诗篇难度下调整为 <b>1.5% 最大生命 + 100 生命值</b>。' },
      { h: '坚垒护卫艇', p: '<b>登场后随时间易伤递增</b>：每过 <b>1s</b> 受到的伤害 <b>+10%</b>，<b>10s</b> 起改为每秒 <b>+20%</b>（无上限）；主武器、僚机弹幕与空间斩击均生效。' },
      { h: '寒霜 冰蓝光圈', p: '圈内玩家<b>射速 -35%、移动速度 -35%</b>（以战机核心位置判定）。' },
      { h: '破片 炮弹', p: '<b>若首发命中，则后两发炮弹无视玩家的无敌效果</b>；若首发未命中而后两发命中，该次无敌时间 -30%。' },
      { h: '导弹', p: '命中伤害按难度固定：<b>虚象 60 / 具象 60 / 真我 80 / 诗篇 95</b>，且<b>武器等级 -1</b>、<b>暴走中断</b>（不计入常规受击计数）。量子护盾可消解导弹。' },
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

  // ---------- 装备：战机&僚机 / 护甲 / 副武器 / 驾驶员 四合一（2026-10-10 用户定稿）----------
  // 子页签行格式对齐「旧怪物权重」页（info-subtabs + info-chip，同虚象级等档位 chips）。
  // chips 在子页内容渲染完成后插到 infoBody 顶部（四个子页渲染函数都会先清空 infoBody，故不能先插）；
  // chip 点击置 infoEquipKind 后整页重渲染。子页内容 = 原四页渲染函数直接复用（战机&僚机 DPS 表 /
  // 护甲 / 副武器 / 驾驶员注册表详情），本函数不复制任何内容逻辑
  function renderInfoEquipment() {
    hideFormationPreview();
    if (infoEquipKind === 'planes') renderInfoPlanes();
    else if (infoEquipKind === 'armors') renderInfoArmors();
    else if (infoEquipKind === 'subs') renderInfoSubs();
    else renderInfoPilots();
    const chips = document.createElement('div');
    chips.className = 'info-subtabs';
    const defs = [
      { id: 'planes', name: '战机&僚机' },
      { id: 'armors', name: '护甲' },
      { id: 'subs',   name: '副武器' },
      { id: 'pilots', name: '驾驶员' },
    ];
    for (const d of defs) {
      const b = document.createElement('button');
      b.className = 'info-chip' + (infoEquipKind === d.id ? ' active' : '');
      b.textContent = d.name;
      b.addEventListener('click', () => { infoEquipKind = d.id; renderInfoEquipment(); });
      chips.appendChild(b);
    }
    infoBody.insertBefore(chips, infoBody.firstChild);
  }

  // ---------- 战机 & 僚机：每秒平均伤害（DPS）表 ----------
  // 火力等级列（1~4 常规 + 5 暴走）；值 = 该等级持续输出 10s 的理论总伤 ÷ 10（即每秒平均伤害）
  const INFO_FIRE_LEVELS = [1, 2, 3, 4, 5];

  // 每秒平均伤害格式化（取整）
  function fmtDps(v) { return String(Math.round(v)); }

  // 战机主炮 DPS：暴走(Lv5) 十射线×2.4 伤害、interval 0.08（2026-10-10 射速 +50%，DPS 表自动 ×1.5）；Lv4 含半拍补射 2 发；plane 可选（预留按机型倍率）
  function planeDps(level, plane) {
    // 群星之杀（斩击模型）：DPS = 每轮命中目标的斩击次数 × 单击伤害 / 攻击间隔
    //（三线独立判定 2026-10-12 用户定稿；Lv5 列按三线全中同一目标口径 2026-10-13 用户定稿——中线 2 斩必中 +
    //  左右侧线走廊命中同一目标（BOSS 等大机体常见）×3 线；小怪单体实战仅中线命中时 = 表值 ÷3）
    if (plane && plane.slashWeapon) {
      const sl = STARSLAYER.levels[level] || STARSLAYER.levels[1];
      // 暴走（Lv5）全局修正：斩击伤害 +50%（subDmgMul），连斩节奏不变；三线全中 ×slashLines
      return (sl.slashes || 1) * sl.dmg / sl.interval * (level === 5 ? (sl.slashLines || 1) * BERSERK.subDmgMul : 1);
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
      return cfg.count * cfg.dmg / cfg.interval * (level === 5 ? BERSERK.subRateMul : 1);   // 暴走全局修正：射速 +50%（弹速 +50% 不影响 DPS）
    }
    // volley 模型（群星允诺）：按“连射周期”折算——每周期发 sum(volleys) 发，周期 = 轮间隔 + 冷却
    const lv = WINGMAN_LEVELS[level] || WINGMAN_LEVELS[1];
    const perCycle = lv.volleys.reduce((a, b) => a + b, 0);
    const cycleTime = (lv.volleys.length - 1) * WINGMAN.volleyGap + lv.interval;
    const lvMul = (wingman.dmgMulByLevel && wingman.dmgMulByLevel[level]) || 1;   // 机型专属等级倍率（构成 80% 等比 DPS 链）
    const dmgPerBullet = WINGMAN.bulletDmg * (level === 5 ? 2 : 1) * lvMul;   // 暴走双倍
    return 2 * perCycle * dmgPerBullet / cycleTime * (level === 5 ? BERSERK.subRateMul : 1);   // 暴走全局修正：射速 +50%（弹速 +50% 不影响 DPS）
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
        const sw = wingman.scale || 1;   // 群星允诺整体尺寸系数（与游戏内/选机卡同源 ×1.045）
        c.scale(-0.95 * sw, 0.95 * sw);   // 左右反转，与选机卡一致
        flame(0, 8, 11, 3, 'rgba(190, 170, 255, 0.9)', 'rgba(140, 120, 255, 0.5)', 'rgba(110, 90, 230, 0)');   // 僚机常态紫焰
        paintWingman(c, 1, false, true);   // still 冻结相位（第 5 参 spreadT=暴走展开进度，常态 berserk=false 不绘制；历史调用误传第 5 参问题已随签名扩展消解）
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
    infoAppendNote('表中数值为<b>每秒平均伤害（DPS）</b> = 该火力等级下持续输出 10s 的理论总伤 ÷ 10。<b>战机</b>行为主炮单独输出，<b>僚机</b>行为左右两架合计；均为<b>裸伤</b>（不含敌方减伤 / 易伤、御4 力场、斗志昂扬攻速翻倍等战斗修正）。<b>混乱将至</b>主炮弹<b>无穿透</b>，对<b>非 BOSS / 非 4S（黑暗之手四精英）</b>敌人伤害 <b>+60%</b>。暴走（Lv5）为限时 4s 强化形态，此处按其伤害 / 射速持续计算；<b>僚机</b>在等级配置之上叠加暴走全局修正——射速 +50%、弹速 +50%（Lv5 列已计入）；<b>群星之杀</b>常态瞄准线 1 条，暴走为 <b>3 条判定白线</b>（中线 + 左右刃中心各一）各自独立判定，每线<b>连斩 2 次</b>——同一攻击 6 斩按「中→左→右」排列依次释放（暴走每击间隔 0.05s / 非暴走 0.1s），相邻斩击（含跨线）与竖直方向夹角至少相差 20°；逐击重新锁定——两次斩击可落不同目标；判定矩形短边为半长 ×0.42 / 显式值 ×1.2；暴走斩击伤害 +50%，Lv5 列按<b>三线全中同一目标</b>口径（中线 2 斩必中 + 左右侧线走廊命中同一目标——BOSS 等大机体常见；小怪单体实战仅中线命中时为表值 ÷3）。<b>连斩不延长攻击周期</b>——首击瞬间即起算下一轮攻击间隔，连斩间隔与冷却并行流逝，总周期恒 = interval，表值即持续 DPS。');
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
  // 暴走（Lv5）全局修正：辛国栋之怒 = 灼烧伤害 +50%（subDmgMul）；其余 = 射速 +50%（subRateMul，弹速 +50% 不影响 DPS）——DPS 均为基准 ×1.5
  function subWeaponDps(w, lv) {
    const c = subWeaponLv(w, lv);
    const base = c.dps != null ? c.dps : (c.count || 1) * c.dmg / c.interval;
    if (lv === 5) return base * (w.fire.kind === 'xinring' ? BERSERK.subDmgMul : BERSERK.subRateMul);
    return base;
  }
  // 关键参数行（字符串单元格；数值全部取自注册表，调整 01-config 即自动同步）
  // 暴走（Lv5）列显示修正后有效值：射速 +50% 武器的间隔 ÷subRateMul（辛国栋之怒不适用，其灼烧 DPS ×subDmgMul）
  function pushSubParamRows(rows, w) {
    const vals = sel => INFO_FIRE_LEVELS.map(lv => { const c = subWeaponLv(w, lv); return sel(c, lv); });
    const fmt = v => v;
    const fmtN = v => String(Math.round(v * 100) / 100);
    const kind = w.fire.kind;
    const effIv = (c, lv) => (lv === 5 && kind !== 'xinring') ? c.interval / BERSERK.subRateMul : c.interval;
    if (kind === 'feijian') {
      rows.push({ label: w.name + '·单发伤害', fmt, vals: vals(c => String(c.dmg)) });
      rows.push({ label: w.name + '·剑数 / 间隔(s)', fmt, vals: vals((c, lv) => `${c.count} / ${fmtN(effIv(c, lv))}`) });
    } else if (kind === 'jixing') {
      rows.push({ label: w.name + '·单发伤害', fmt, vals: vals(c => String(c.dmg)) });
      rows.push({ label: w.name + '·激光数 / 间隔(s)', fmt, vals: vals((c, lv) => `${c.count} / ${fmtN(effIv(c, lv))}`) });
    } else if (kind === 'daodan') {
      // 与叮咚鸡导弹完全同款：直击 / 溅射 / 半径取 PILOTS.dagou，等级只改发射间隔；连射链与叮咚鸡同款（伤害逐波 ×chainDmgMul）
      const d = PILOTS.dagou;
      rows.push({ label: w.name + '·爆炸（直击+溅射） / 半径', fmt, vals: INFO_FIRE_LEVELS.map(() => `${d.directDmg}+${d.splashDmg} / ${d.blastR}（叮咚鸡同款）`) });
      rows.push({ label: w.name + '·发射间隔(s)', fmt, vals: vals((c, lv) => fmtN(effIv(c, lv))) });
      rows.push({ label: w.name + '·连射链', fmt, vals: INFO_FIRE_LEVELS.map(() => `每发 ${Math.round(d.chainChance * 100)}% 概率 ${d.chainGap}s 后连射，伤害 ×${d.chainDmgMul}/波`) });
    } else if (kind === 'xinring') {
      rows.push({ label: w.name + '·灼烧 DPS', fmt, vals: vals((c, lv) => String(lv === 5 ? Math.round(c.dps * BERSERK.subDmgMul) : c.dps)) });
      rows.push({ label: w.name + '·半径 / 间隔(s)', fmt, vals: vals(c => `${c.r} / ${c.interval}`) });   // 辛国栋之怒射速不变：间隔显示配置原值
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
        glyph.className = 'glyph-svg';   // 矢量图标（焰环 / 狗耳导弹）：内联 SVG，辉光走注册色；焰环为函数引用（每次渲染生成唯一渐变 defs id，防多挂载点重复 id 失效）
        glyph.innerHTML = typeof w.iconSvg === 'function' ? w.iconSvg() : w.iconSvg;
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
    infoAppendNote('表中为<b>裸数值</b>（不含敌方减伤 / 易伤、大无垠之王增伤、极夜流光对 4类 +50% 增伤等战斗修正）。副武器攻速远低于主炮（主炮 Lv4 间隔 0.12s）。<b>辛国栋之怒</b>为恒速穿透灼烧：表中 DPS 为火环持续触及单个敌人时的每秒伤害（每 0.1s 结算一次）；<b>捣蛋来袭</b>与叮咚鸡导弹完全同款（600 溅射 / 低区直击 200，表中 DPS 按爆炸伤害折算；每发发射后 10% 概率 0.3s 后连射一发，连射弹同样可继续连射、伤害一律为正常导弹的 60%（固定不递减））；<b>极夜流光</b>激光可穿透 1 个非 BOSS / 非 4类敌人。<b>无界飞剑</b>发射位置均分屏幕宽度，每剑仅命中首个敌人（暴走 50% 概率穿透一次）。暴走（Lv5）为限时 4s 形态，Lv5 列已含暴走全局修正：<b>捣蛋来袭 / 无界飞剑 / 极夜流光</b> = 射速 +50%、弹速 +50%（间隔行显示修正后有效值）；<b>辛国栋之怒</b> = 灼烧伤害 +50%（射速 / 弹速 / 半径不变，灼烧 DPS 行显示修正后值）。');
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
        glyph.className = 'glyph-svg';   // 矢量图标（迪奥彼岸花）：内联 SVG，currentColor 继承注册色（函数引用条目同副武器口径每次渲染调用）
        glyph.innerHTML = typeof p.iconSvg === 'function' ? p.iconSvg() : p.iconSvg;
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
    infoAppendNote('主 / 副驾驶员各装备一名、效果同时生效（同名不可同时占据两槽）。默认主驾驶员叮咚鸡、副驾驶员小艺。天秀忧郁王子、迪奥技能均按 <b>Q</b> 释放，左下角量表显示充能 / 冷却。');
  }

  function buildInfoTabs() {
    infoTabs.innerHTML = '';
    const defs = [
      { id: 'equipment', name: '装备' },
      { id: 'waves',    name: '特殊机制' },
      { id: 'mods',     name: '特殊修正' },
      { id: 'items',    name: '道具' },
      { id: 'achievements', name: '成就' },
      { id: 'weightGroup', name: '权重' },
      { id: 'test1',      name: '测试1' },
      { id: 'test2',      name: '测试2' },
      { id: 'test3',      name: '测试3' },
      { id: 'test4',      name: '测试4' },
      { id: 'copyright',  name: '版权声明' },
    ];
    for (const d of defs) {
      const b = document.createElement('button');
      b.className = 'info-tab' + (infoTab === d.id ? ' active' : '');
      b.textContent = d.name;
      b.addEventListener('click', () => { infoTab = d.id; hideFormationPreview(); buildInfoTabs(); });
      if (d.id === 'copyright') b.style.marginLeft = 'auto';   // 「版权声明」置于第二行居右：flex-wrap 下 margin-left:auto 吸收本行剩余空间（11 页签必折两行、本页签落第二行行尾）
      infoTabs.appendChild(b);
    }
    if (infoTab === 'weightGroup') renderInfoWeightGroup();
    else if (infoTab === 'waves') renderInfoWaves();
    else if (infoTab === 'items') renderInfoItems();
    else if (infoTab === 'achievements') renderInfoAchievements();
    else if (infoTab === 'equipment') renderInfoEquipment();
    else if (infoTab === 'test1') renderInfoBullets();
    else if (infoTab === 'test2') renderInfoTest2();
    else if (infoTab === 'test3') renderInfoTest3Empty();
    else if (infoTab === 'test4') renderInfoTest4();
    else if (infoTab === 'copyright') renderInfoCopyright();
    else renderInfoMods();
  }

  // ---------- 版权声明（2026-10-13 用户定稿新增页签，置于页签第二行居右） ----------
  // 纯静态文案：BGM / 敌人设计 / 代码生成的版权与致谢 + 仓库与联系邮箱（URL 渲染为可点击外链）
  function renderInfoCopyright() {
    infoBody.innerHTML = '';
    const paras = [
      '主页面BGM1、常规战斗BGM1&2、BOSS战斗BGM1&2的版权归属 @雷霆战机 和 @腾讯 所有。',
      '主页面BGM2、胜利BGM、失败BGM的版权归属 @QQ雷电 和 @腾讯 所有。',
      '部分敌人的设计参考了 @明日方舟 的敌人。',
      '本游戏的绝大多数代码由GLM-5.3-Flash生成，小部分由QWen3.8-Max生成。AI仅负责代码工作，具体装备&敌人&波次&机制&数值等各项策划均由作者一人完成，并始终在优化中。',
    ];
    for (const t of paras) {
      const p = document.createElement('p');
      p.style.margin = '0 0 12px';
      p.style.lineHeight = '1.7';
      p.textContent = t;
      infoBody.appendChild(p);
    }
    const p2 = document.createElement('p');
    p2.style.margin = '0';
    p2.style.lineHeight = '1.8';
    const a = document.createElement('a');
    a.href = 'https://github.com/Git-Of-Aeg1s/infinity-fighter';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'https://github.com/Git-Of-Aeg1s/infinity-fighter';
    a.style.color = 'var(--accent)';
    p2.append(
      document.createTextNode('欢迎访问 '),
      a,
      document.createTextNode(' 来获得最新版本。'),
      document.createElement('br'),
      document.createTextNode('如您有任何建议，欢迎发送邮件至 975586768@qq.com'),
      document.createElement('br'),
      document.createTextNode('感谢您的游玩！'),
    );
    infoBody.appendChild(p2);
  }

  // ---------- 道具：REWARD_ITEMS 注册表驱动（赞助无人舰掉落的一次性道具，普通/稀有两档） ----------
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
        if (it.noDrop) continue;   // 哦哦！抽卡！已移出道具池——萧杨专属驾驶技能，不作为道具展示
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
    infoAppendNote('道具由击坠赞助无人舰获得：常规赞助 90% 普通 / 10% 稀有，豪华赞助 100% 稀有；<b>获得瞬间立刻生效</b>。');
  }

  // ---------- 测试1：（空，待新内容）----------
  // 2026-10-10 用户清空：原「敌方子弹样式图鉴」（e95600a v0.3.11，drawOneEBullet + withPreviewCtx 实机弹体
  // 对比页：长条弹家族 / 圆弹家族 / 特殊弹体三节 + wgB 帧驱动动效）整体移除——需要找回时看 git 历史。
  // 页签保留，点击显示空白页。
  function renderInfoBullets() {
    infoBody.innerHTML = '';
  }

  // ---------- 测试3：（空，待新内容）----------
  // 2026-10-12 用户要求新增占位空页（原顶级「测试3 波次示意」已于 2026-10-11 迁入「权重」页子页签）——
  // 页签保留，点击显示空白页，后续填充新内容。
  function renderInfoTest3Empty() {
    infoBody.innerHTML = '';
  }

  // ---------- 权重：波次权重 / 刷怪权重 / 怪物权重 / 波次 / 旧怪物权重 / 刷怪机制 六合一（2026-10-11 四合一 + 2026-10-12 刷怪机制）----------
  // 子页签行格式对齐「装备」页（info-subtabs + info-chip）。chips 在子页内容渲染完成后插到 infoBody 顶部；
  // 「怪物权重」子页 = 原顶级「波次权重」页（renderInfoTest1，敌机类别 × 职能设计稿）整体迁入；
  // 「波次」子页 = 原顶级「测试3」页签（renderInfoTest3 波次编队设计画廊）迁入（2026-10-11；2026-10-12 用户定稿更名）；
  // 「刷怪机制」子页 = 诗篇主战/侧翼/额外/真额外生成机制说明（2026-10-12 用户定稿实装时新增）；
  // 「旧怪物权重」（renderInfoWeights，实装权威表）2026-10-12 用户定稿提升为外层页签、置于「波次」右侧
  // （原曾并入波次权重子页等级行末，同日回调；页内互切 chip 随之删除）
  function renderInfoWeightGroup() {
    hideFormationPreview();
    if (infoWeightGroupKind === 'monster') renderInfoTest1();
    else if (infoWeightGroupKind === 'waveSpawn') renderWaveSpawnWeights();   // 刷怪权重（原「波次刷怪权重」，承接测试3各波次：类别 × 职能池权重 + 系统规则说明）
    else if (infoWeightGroupKind === 't3') renderInfoTest3();                 // 波次（原顶级「测试3」页签迁入，2026-10-11 用户定稿；2026-10-12 更名）
    else if (infoWeightGroupKind === 'oldWeights') renderInfoWeights();       // 旧怪物权重（实装权威表，外层页签 2026-10-12 用户定稿）
    else if (infoWeightGroupKind === 'mechanics') renderSpawnMechanics();     // 刷怪机制（2026-10-12 用户定稿：诗篇额外生成体系说明）
    else renderWaveWeightsPage();   // 波次权重（六等级子页签，2026-10-12 用户定稿实装）
    const chips = document.createElement('div');
    chips.className = 'info-subtabs';
    const defs = [
      { id: 'wave',      name: '波次权重' },
      { id: 'waveSpawn', name: '刷怪权重' },   // 原「波次刷怪权重」，2026-10-12 用户定稿更名
      { id: 'monster',   name: '怪物权重' },   // 最右（2026-10-11 用户定稿）
      { id: 't3',        name: '波次' },       // 「波次示意」更名（2026-10-12 用户定稿；原顶级「测试3」迁入）
      { id: 'oldWeights', name: '旧怪物权重' }, // 「波次」右侧（2026-10-12 用户定稿：自波次权重子页等级行提升为外层页签）
      { id: 'mechanics', name: '刷怪机制' },   // 末位（2026-10-12 用户定稿：诗篇刷怪机制说明页）
    ];
    for (const d of defs) {
      const b = document.createElement('button');
      b.className = 'info-chip' + (infoWeightGroupKind === d.id ? ' active' : '');
      b.textContent = d.name;
      b.addEventListener('click', () => {
        infoWeightGroupKind = d.id;
        renderInfoWeightGroup();
      });
      chips.appendChild(b);
    }
    infoBody.insertBefore(chips, infoBody.firstChild);
    // 次行 sticky 贴首行下方：怪物权重子页有两行 chips（本组 chips + 类别 chips），二者同为 .info-subtabs sticky——
    // 首行贴 top:-12px、次行默认 top:0，滚动时叠位互盖（次行盖住首行一半，2026-10-11 用户反馈）。
    // 量取首行盒高把次行 inline top 定为首行底缘（首行贴顶位 -12px，故 = offsetHeight - 12），两行堆叠不重叠
    const secondRow = infoBody.children[1];
    if (secondRow && secondRow.classList.contains('info-subtabs')) {
      secondRow.style.top = (chips.offsetHeight - 12) + 'px';
    }
  }

  // ---------- 权重 · 怪物权重子页（原测试1 / 原顶级「波次权重」页）：敌机种类划分 + 权重设计工作区（2026-10-03 启用；2026-10-09 页签更名，测试1 让位给敌方子弹样式图鉴；2026-10-11 迁入「权重」页做子页签并更名「怪物权重」）----------
  // 用途：后续波次设计按本页「类别 × 职能」组织。顶部按敌人类别（1类/2类/3类/4类）切换；
  // 选中某类后，先展示该类「全部敌人」总表（去重后的完整花名册），再依次展示该类下各职能分组表。
  // 权重来源：桌面《敌机权重设计表_测试1.xlsx》（2026-10-03 填写 Lv30 前三档 = Lv1/Lv11/Lv21，
  // Lv31/Lv41 待定稿）。总表（INFO_T1_ROSTER_W）与职能表（member.w）为两套独立数值，按表如实同步；
  // 未填档位在页面显示「—」。本页为纯设计稿，不接入刷怪逻辑（实装权威表见本组「旧怪物权重」子页——原顶级页签 2026-10-12 迁入）。
  // 同一敌人可带多个职能标签而在多张表重复出现（炮火先兆者 = 3类攻击 + 3类攻击后位；
  // 暴鸰 / 暴鸰·G / 虚幻 = 3类攻击 + 3类攻击压制）——「全部敌人」表对重复敌人只列一次。
  const INFO_T1_CLASSES = ['1类', '2类', '3类', '4类'];
  let infoT1ClassIdx = 0;   // 选中的敌人类别（INFO_T1_CLASSES 下标，默认 1类）

  // 「全部敌人」总表权重（ency → [Lv1, Lv11, Lv21, Lv31, Lv41]；奖励无人舰 / 4S 四精英 Excel 未填 → null 待填）
  const INFO_T1_ROSTER_W = {
    side_moon: [10, 10, 10], side_swirl: [10, 10, 10], side_shoot: [10, 10, 10],
    side_pass: [20, 10, 2], side_kamikaze: [2, 20, 20], prolifera: [2, 20, 20],
    striker_crimson: [20, 20, 10], striker_amber: [20, 20, 10], striker_azure: [15, 10, 5],
    striker_violet: [15, 10, 5], striker_white: [15, 10, 5],
    fashiMatrix: [0, 80, 20], fashiA1: [0, 0, 140],   // fashiMatrix Lv11 90→80（2026-10-14 用户定稿，与职能表「2类攻击」同值对齐）
    striker_fortress: [10, 20, 20], striker_dusk: [0, 10, 20],
    popian: [0, 30, 20], popianU: [0, 0, 20],
    douzhi: null, sponsor: null, sponsorDeluxe: null,
    jiaoxiang: [0, 0, 15], hanshuang: [0, 10, 20], pulseMatrix: [0, 20, 5],
    yu4: [0, 5, 10], anvil: [0, 5, 10],
    gunship_violet: [20, 15, 15], gunship_crimson: [20, 15, 15], gunship_amber: [20, 15, 15],   // Lv21 10→15（2026-10-14 用户定稿，紫晶/赤红/金曜/橙焰四炮艇；青时不在此列）
    gunship_orange: [20, 15, 15], gunship_cyan: [15, 20, 30],   // 橙焰同改 Lv21 15（2026-10-14）/ 青 30 不变
    harbinger: [5, 20, 20], baoling: [0, 15, 10], baolingG: [0, 1, 5],
    fashiA2: [0, 0, 50], unreal: [0, 0, 1], weilong: [0, 5, 10],
    capital_crimson: [10, 10, 10], capital_crgold: [10, 10, 10], capital_azure: [10, 10, 10],
    warMatrix: [0, 30, 30], fashiArray: [0, 30, 30], warGhost: [0, 0, 80],
    puxuefeng: null, xiayong: null, hanxixian: null, xinguodong: null,
  };

  // 职能分组（展示顺序 1类 → 2类 → 3类 → 4类；members.ency = ENCY_DATA 条目；
  // w = [Lv1, Lv11, Lv21, ...] 职能表权重（未填档略写，渲染时补 null）；
  // reserved = 尚未实装的预留行，用虚线占位格而不是图鉴预览）
  const INFO_T1_GROUPS = [
    { name: '1类普通', members: [
      { ency: 'side_moon', w: [30, 20, 20] }, { ency: 'side_swirl', w: [10, 20, 20] },          // 红=赤月 / 橙=橙旋
      { ency: 'side_shoot', w: [20, 20, 20] }, { ency: 'side_pass', w: [50, 20, 2] },           // 黄=黄芒 / 白=白影
    ]},
    { name: '1类攻击', members: [{ ency: 'side_kamikaze', w: [10, 10, 10] }] },                  // 紫=紫电
    { name: '1类防御', members: [{ ency: 'prolifera', w: [10, 10, 10] }] },                      // 青=增生

    { name: '2类攻击', members: [
      { ency: 'striker_crimson', w: [20, 20, 10] }, { ency: 'striker_amber', w: [20, 20, 10] }, { ency: 'striker_azure', w: [15, 10, 5] },   // 红 / 橙 / 蓝
      { ency: 'striker_violet', w: [15, 10, 5] }, { ency: 'striker_white', w: [15, 10, 5] },     // 紫 / 白
      { ency: 'fashiMatrix', w: [0, 80, 20] }, { ency: 'fashiA1', w: [0, 0, 120] },
    ]},
    { name: '2类突击', members: [   // 2类攻击的纯突击艇子池（2026-10-12 用户定稿：特7~特10 直落系专用，去法术矩阵/法术大师A1）——权重同步自上方 2类攻击 组内突击艇条目
      { ency: 'striker_crimson', w: [20, 20, 10] }, { ency: 'striker_amber', w: [20, 20, 10] }, { ency: 'striker_azure', w: [15, 10, 5] },   // 红 / 橙 / 蓝
      { ency: 'striker_violet', w: [15, 10, 5] }, { ency: 'striker_white', w: [15, 10, 5] },     // 紫 / 白
    ]},
    { name: '2类防御', members: [{ ency: 'striker_fortress', w: [10, 10, 10] }] },               // 黄=坚垒
    { name: '2类突进', members: [{ ency: 'striker_dusk', w: [10, 10, 10] }] },
    { name: '2类侧位', members: [{ ency: 'popian', w: [10, 20, 10] }, { ency: 'popianU', w: [0, 1, 10] }] },
    { name: '2类奖励', members: [
      { ency: 'douzhi', w: [5, 5, 5, 5, 5] }, { ency: 'sponsor', w: [4, 4, 4, 4, 4] }, { ency: 'sponsorDeluxe', w: [1, 1, 1, 1, 1] },
    ]},

    { name: '3类削弱辅助', members: [
      { ency: 'jiaoxiang', w: [0, 0, 10] }, { ency: 'hanshuang', w: [0, 10, 15] }, { ency: 'pulseMatrix', w: [0, 20, 5] },
    ]},
    { name: '3类增益辅助', members: [{ ency: 'anvil', w: [0, 0, 10] }, { ency: 'yu4', w: [0, 10, 10] }] },
    { name: '3类攻击', members: [
      { ency: 'gunship_violet', w: [20, 15, 15] }, { ency: 'gunship_crimson', w: [20, 15, 15] }, { ency: 'gunship_amber', w: [20, 15, 15] },   // 5 种普通炮艇：紫 / 赤 / 金——Lv21 10→15（2026-10-14 用户定稿，紫晶/赤红/金曜/橙焰四艇）
      { ency: 'gunship_orange', w: [20, 15, 15] }, { ency: 'gunship_cyan', w: [15, 20, 30] },    // 橙（同改 Lv21 15）/ 青（30 不变）
      { ency: 'harbinger', w: [5, 20, 20] }, { ency: 'fashiA2', w: [0, 0, 50] },
      { ency: 'baoling', w: [0, 15, 10] }, { ency: 'baolingG', w: [0, 1, 5] }, { ency: 'unreal', w: [0, 0, 1] },
    ]},
    { name: '3类攻击后位', members: [{ ency: 'harbinger', w: [10, 10, 10] }] },
    { name: '3类攻击压制', members: [{ ency: 'baoling', w: [0, 10, 10] }, { ency: 'baolingG', w: [0, 1, 5] }, { ency: 'unreal', w: [0, 0, 1] }] },
    { name: '3类攻击重装', members: [{ ency: 'weilong', w: [10, 10, 10] }] },

    { name: '4类攻击', members: [
      { ency: 'capital_crimson', w: [10, 10, 10] }, { ency: 'capital_crgold', w: [10, 10, 10] }, { ency: 'capital_azure', w: [10, 10, 10] },   // 红 / 金 / 蓝
      { ency: 'warMatrix', name: '战争矩阵', reserved: true, w: [0, 30, 30] },                    // 预留
    ]},
    { name: '4类召唤', members: [{ ency: 'fashiArray', w: [0, 20, 10] }] },
    { name: '4类突进', members: [{ ency: 'warGhost', w: [0, 0, 10] }] },
    { name: '4类特殊', members: [                                                                 // 4S 黑暗之手麾下四精英（Excel 未填权重）
      { ency: 'puxuefeng' }, { ency: 'xiayong' }, { ency: 'hanxixian' }, { ency: 'xinguodong' },
    ]},
  ];

  // 刷怪权重数据（WAVE_SPAWN_W_DEFAULT / WAVE_SPAWN_W / WAVE_SPAWN_LIST，页名「波次刷怪权重」已于 2026-10-12 更名「刷怪权重」）已于 2026-10-12 整体迁 01-config-spawn.js
  // （本模块经 import 引用仅作图鉴展示；04-spawn 经 14-main 编排消费——13→04 单向依赖不可反向 import）

  // 预留行占位格（无机图鉴预览：与 infoShipCanvas 同尺寸的虚线小框）
  function infoT1ReservedCell() {
    const d = document.createElement('div');
    d.style.cssText =
      'width:40px;height:28px;flex:none;display:flex;align-items:center;justify-content:center;'
      + 'font-size:10px;color:rgba(255,255,255,0.35);border:1px dashed rgba(255,255,255,0.28);'
      + 'border-radius:4px;box-sizing:border-box;';
    d.textContent = '预留';
    return d;
  }

  function renderInfoTest1() {
    infoBody.innerHTML = '';

    // 敌人类别 chips（1类 / 2类 / 3类 / 4类）
    const chips = document.createElement('div');
    chips.className = 'info-subtabs';
    INFO_T1_CLASSES.forEach((cls, i) => {
      const b = document.createElement('button');
      b.className = 'info-chip' + (infoT1ClassIdx === i ? ' active' : '');
      b.textContent = cls;
      b.addEventListener('click', () => { infoT1ClassIdx = i; renderInfoWeightGroup(); });   // 经组页重渲染：否则 infoBody 清空会连带清掉顶部组 chips 行（2026-10-11 bug 修复）
      chips.appendChild(b);
    });
    infoBody.appendChild(chips);

    const cls = INFO_T1_CLASSES[infoT1ClassIdx];
    const groups = INFO_T1_GROUPS.filter(g => g.name.startsWith(cls));   // 当前类别的所有职能分组

    // 「全部敌人」总表：汇总当前类别所有分组的成员，按 ency（或 reserved.name）去重，保持首次出现顺序
    const seen = new Set();
    const allMembers = [];
    for (const g of groups) {
      for (const m of g.members) {
        const key = m.ency || m.name;
        if (seen.has(key)) continue;
        seen.add(key);
        allMembers.push(m);
      }
    }
    const headAll = document.createElement('h3');
    headAll.className = 'info-achv-tier-head';
    headAll.textContent = cls + ' · 全部敌人（共 ' + allMembers.length + ' 种）';
    infoBody.appendChild(headAll);
    infoBody.appendChild(buildWeightTable(['飞船', ...INFO_TIERS.map(t => t.label)], allMembers.map(m => {
      const rw = INFO_T1_ROSTER_W[m.ency];                                     // 总表权重（可能为 null = 未填）
      const vals = INFO_TIERS.map((_, i) => (rw && rw[i] != null) ? rw[i] : null);
      if (m.reserved) {
        const d0 = ENCY_DATA[m.ency];
        return { canvas: infoT1ReservedCell(), label: (d0 ? d0.name : m.name) + '（预留）', vals };
      }
      return { canvas: infoShipCanvas(m.ency), label: ENCY_DATA[m.ency].name, vals };
    })));

    // 职能分组表（当前类别下每个职能一张）
    for (const g of groups) {
      const head = document.createElement('h3');
      head.className = 'info-achv-tier-head';
      head.textContent = g.name;
      infoBody.appendChild(head);
      const rows = g.members.map(m => {
        const vals = INFO_TIERS.map((_, i) => (m.w && m.w[i] != null) ? m.w[i] : null);   // 未填档补 null → 「—」
        if (m.reserved) {
          const d0 = ENCY_DATA[m.ency];
          return { canvas: infoT1ReservedCell(), label: (d0 ? d0.name : m.name) + '（预留）', vals };
        }
        return { canvas: infoShipCanvas(m.ency), label: ENCY_DATA[m.ency].name, vals };
      });
      infoBody.appendChild(buildWeightTable(['飞船', ...INFO_TIERS.map(t => t.label)], rows));
    }
    infoAppendNote('同一敌人可拥有多个职能标签：<b>炮火先兆者</b>同时属于「3类攻击 / 3类攻击后位」；'
      + '<b>暴鸰 / 暴鸰·G / 虚幻</b>同时属于「3类攻击 / 3类攻击压制」，故在职能表中各出现一次，但「全部敌人」表只列一次。'
      + '<b>4类特殊</b>＝黑暗之手麾下 4S 四精英（狞笑朴学峰 / 铜皮夏勇 / 猩红韩希先 / 暴怒辛国栋）；'
      + '<b>战争矩阵</b>为未实装预留条目。');
  }

  // ---------- 测试3：波次编队设计画廊（诗篇波次制 · 统一实装规划稿） ----------
  // 设计背景：诗篇波次制——每个等级必定刷新 1 个前波 + 1 个后波，前波刷新后随机 1~2s、后波才进场（补位/收割）；
  // 侧翼与特殊波按概率触发、不占两波名额（该层级分组称「额外级」——「特殊」是与前波/侧翼同类的波次种类，
  // 额外级 = 特殊/侧翼等额外波的层级集合，每等级可触发——2026-10-11 用户定稿）。波次按难度层级分组：
  // 虚象级 / 具象级 / 真我级 / 诗篇级（替换旧「轻/中/重量级」分组），卡片定位五类：前波 / 后波 / 前后均可 / 侧翼 / 特殊。
  // 页面状态（2026-10-03 二次整理）：四级共 36 式候选稿/沿用稿；特殊组 4 式定稿（tag: '定稿待实装'）；
  // 7 式标注「当前实装」＝直接沿用现行标准编队。悬停任意卡片弹出 mini 战场演示（复用权重-波次页浮层）。
  // 页面状态（2026-10-10 三轮整理）：删除底部「特殊刷怪波次」概念稿板块；111 定位改侧翼；
  // 同等级内卡片自上而下按 前波→后波→前后均可→侧翼→特殊 稳定排序（T3_ROLE_ORDER）。
  // 页面状态（2026-10-10 四轮整理）：「3·单艇悬停」改「131」（中央 3类悬停 + 左右同步各 1 艘 1类直落）；
  // 特殊组追加 14 式单类散点刷新概念稿（特1~特13 含 3.5，对应 1/2/3 类单点/双点/相邻/连发/直落变体），特殊组合计 18 式。
  // dots：归一化坐标 [x,y,cls]（x 左→右 0~1、y 上→下 0~1）；arrows：[x1,y1,x2,y2] 同归一化（白色渐隐入场箭头），
  // 起点可为 0 或负值（画布外，超出部分自然裁掉）。cls：1/2/3/4=类别艇、z=紫电（自爆）、s=增生（分裂亡语）、
  // y=幽暮（无碰撞穿墙）、h=炮火先兆者（定点召唤导弹）、f=寒霜（减速光圈）。
  // sim：悬停演示数据（世界坐标代表性回放，格式同 INFO_FORMATIONS 的 sim，复用 showFormationPreview）。
  // 多批固定阵型停留线约定（2026-10-10 用户定稿）：同类敌机多批/多波登场时，把停留线卡在批次序列中间——
  // 早出的批停留线靠下（先到先压前）、晚出的批依次靠上（层距 30px ≈ 0.25s×120px/s），
  // 即早出批在线下方、晚出批在线上方，停留线恒位于批次序列的正中（偶数批=中间两批之间）。
  // ---------- 测试3 波次编队设计画廊 · 数据（2026-10-12 自 renderInfoTest3 提升模块级）----------
  // 14-main 非诗篇设计波次刷新经 t3SpawnCardById 按卡 id 取完整卡（含 dots 生成数据）；
  // 惰性单例：首次访问构建，渲染页与刷怪编排共享同一份数据（T3_ROLE_ORDER 排序为原地稳定排序，幂等）
  // 悬停演示单位快捷构造（复用模块级 fu(encyId, x, y, vx, vy, extra)，坐标为战场世界坐标）
  const S_dive = (ency, x, t0 = 0, holdY = 105, holdDur = 1.2) =>   // 下落 → 悬停 → 冲锋（2类骨架）
    fu(ency, x, -50, 0, 120, { holdY, holdDur, chargeVy: 460, t0 });
  const S_hover = (ency, x, t0 = 0, holdY = 140) =>   // 悬停不离场（3类骨架）
    fu(ency, x, -60, 0, 62, { holdY, t0 });
  const S_cap = (ency, x, t0 = 0) =>   // 4类主力舰缓入悬停
    fu(ency, x, -90, 0, 46, { holdY: 185, t0 });
  const S_fade = (ency, x, y, t0 = 0) =>   // 原地浮现（幽暮/先兆者等）
    fu(ency, x, y - 24, 0, 34, { holdY: y, t0 });

  let _t3GroupsCache = null;
  function t3GroupsAll() {
    if (_t3GroupsCache) return _t3GroupsCache;
    _t3GroupsCache = [
      { title: '虚象级（等级1 起 · 替换旧「轻量级」）', color: '#7fe8c9', items: [
        { id: '1111', name: '一字横排', comp: '4×1类', role: '前波', desc: '顶部横排同帧等速下压（一行同步，带 8~20° 向中线斜角）',
          dots: [[0.2, 0.35, '1'], [0.4, 0.35, '1'], [0.6, 0.35, '1'], [0.8, 0.35, '1']], arrows: [[0.5, -0.15, 0.5, 0.25]],
          period: 6, sim: () => [0.2, 0.4, 0.6, 0.8].map(k => fu('side_pass', k * CANVAS_W, -46, 0, 95)) },
        { id: '1*6', name: '横排六机', comp: '6×1类', role: '前波', desc: '单横排六机，同帧等速下压（一行同步）',
          dots: [[0.125, 0.4, '1'], [0.275, 0.4, '1'], [0.425, 0.4, '1'], [0.575, 0.4, '1'], [0.725, 0.4, '1'], [0.875, 0.4, '1']],
          arrows: [[0.5, -0.15, 0.5, 0.25]],
          period: 7.5, sim: () => { const t0 = [1, 0.5, 0, 0, 0.5, 1]; return [0.125, 0.275, 0.425, 0.575, 0.725, 0.875].map((k, i) => fu('side_pass', k * CANVAS_W, -46, 0, 95, { t0: t0[i] })); } },
        { id: '11', name: '剪刀交叉', comp: '4×1类', role: '侧翼', desc: '两侧翼各 2 机相向入场，交错换位',
          dots: [[0.18, 0.35, '1'], [0.18, 0.65, '1'], [0.82, 0.35, '1'], [0.82, 0.65, '1']],
          arrows: [[0.02, 0.5, 0.14, 0.5], [0.98, 0.5, 0.86, 0.5]],
          period: 7, sim: () => { const y0 = CANVAS_H * 0.45; return [fu('side_pass', -36, y0 - 30, 105, 40), fu('side_pass', -36, y0 + 30, 105, 40), fu('side_pass', CANVAS_W + 36, y0 - 30, -105, 40), fu('side_pass', CANVAS_W + 36, y0 + 30, -105, 40)]; } },
        { id: '121', name: '夹心品字', comp: '1×2类+2×1类', role: '前后均可', desc: '2类居中、两架 1类分列——三机同帧同步出现',
          dots: [[0.5, 0.35, '2'], [0.3, 0.35, '1'], [0.7, 0.35, '1']], arrows: [[0.5, -0.15, 0.5, 0.25]],
          period: 7, sim: () => [S_dive('striker_crimson', CANVAS_W / 2, 0, 110, 1.6), S_dive('side_pass', CANVAS_W / 2 - 72, 0.3, 135, 1.6), S_dive('side_pass', CANVAS_W / 2 + 72, 0.3, 135, 1.6)] },
        { id: '131', name: '', comp: '2×1类+1×3类', role: '后波', desc: '中央 3类炮艇先现，随后左右两架 1类同步斜向落穿越（8~20° 向中线）',
          dots: [[0.5, 0.3, '3'], [0.25, 0.22, '1'], [0.75, 0.22, '1']], arrows: [[0.25, -0.15, 0.25, 0.12], [0.75, -0.15, 0.75, 0.12]],
          period: 6, sim: () => [S_hover('gunship_violet', CANVAS_W * 0.5), fu('side_pass', CANVAS_W * 0.25, -46, 0, 95, { t0: 0.5 }), fu('side_pass', CANVAS_W * 0.75, -46, 0, 95, { t0: 0.5 })] },
        { id: '1类小队', name: '', comp: '3~5×1类', role: '侧翼', tag: '当前实装', desc: '现行标准编队：3~5 架 1类自单侧斜插穿越（队形随机）',
          dots: [[0.12, 0.24, '1'], [0.24, 0.31, '1'], [0.36, 0.38, '1'], [0.48, 0.45, '1']],
          arrows: [[0.0, 0.05, 0.2, 0.23]],
          period: 6.5, sim: () => { const y0 = CANVAS_H * 0.41; return [0, 1, 2, 3].map(k => fu('side_pass', -36 - k * 46, y0 - k * 30, 105, 69)); } },
        { id: '22', name: '', comp: '2×2类', role: '前后均可', tag: '当前实装', desc: '现行标准编队：固定 2 架 2类入场 → 停留 → 向下冲锋',
          dots: [[0.42, 0.3, '2'], [0.58, 0.3, '2']], arrows: [[0.5, -0.15, 0.5, 0.2]],
          period: 5.6, sim: () => [fu('striker_crimson', CANVAS_W / 2 - 36, -50, 0, 120, { holdY: 110, holdDur: 1.2, chargeVy: 460 }), fu('striker_crimson', CANVAS_W / 2 + 36, -50, 0, 120, { holdY: 110, holdDur: 1.2, chargeVy: 460 })] },
        { id: 'y*1', name: '单幽暮', comp: '1×幽暮', role: '特殊', tag: '定稿待实装', desc: '场地 30%~70% 高度随机位置浮现一架幽暮（无碰撞穿墙）',
          dots: [[0.5, 0.5, 'y']], arrows: [],
          period: 6, sim: () => [S_fade('striker_dusk', CANVAS_W * 0.5, CANVAS_H * 0.5)] },
      ]},
      { title: '具象级', color: '#ffd166', items: [
        { id: '222', name: '三机横排', comp: '3×2类', role: '前后均可', desc: '等距横排停留',
          dots: [[0.25, 0.4, '2'], [0.5, 0.4, '2'], [0.75, 0.4, '2']], arrows: [[0.5, -0.15, 0.5, 0.3]],
          period: 6.5, sim: () => [0.25, 0.5, 0.75].map(k => S_dive('striker_crimson', k * CANVAS_W, 0, 105, 1.5)) },
        { id: '22·22', name: '双组错位', comp: '4×2类', role: '前后均可', desc: '前后两排依次入场（前排先入、间隔约0.35s；早出靠下）',
          dots: [[0.25, 0.35, '2'], [0.25, 0.5, '2'], [0.75, 0.35, '2'], [0.75, 0.5, '2']],
          arrows: [[0.15, -0.1, 0.22, 0.2], [0.85, -0.1, 0.78, 0.2]],
          period: 8, sim: () => [[CANVAS_W * 0.25, 0, 120], [CANVAS_W * 0.75, 0, 120], [CANVAS_W * 0.25, 0.35, 90], [CANVAS_W * 0.75, 0.35, 90]].map(([x, t0, hy]) => S_dive('striker_crimson', x, t0, hy, 1.2)) },
        { id: '2*5', name: '波浪五机', comp: '5×2类', role: '前波', desc: '波浪队形：左侧三机先入、右侧两机 0.35s 后跟进（早出靠下）',
          dots: [[0.15, 0.5, '2'], [0.325, 0.3, '2'], [0.5, 0.5, '2'], [0.675, 0.3, '2'], [0.85, 0.5, '2']],
          arrows: [[0.5, -0.15, 0.5, 0.2]],
          period: 7.5, sim: () => [S_dive('striker_crimson', 0.125 * CANVAS_W, 0, 120, 1.0), S_dive('striker_crimson', 0.3125 * CANVAS_W, 0, 120, 1.0), S_dive('striker_crimson', 0.5 * CANVAS_W, 0, 120, 1.0), S_dive('striker_crimson', 0.6875 * CANVAS_W, 0.35, 90, 1.0), S_dive('striker_crimson', 0.875 * CANVAS_W, 0.35, 90, 1.0)] },
        { id: '23', name: '护航截击', comp: '2×2类+1×3类', role: '后波', desc: '2类先入扫场、炮艇约0.4s后跟进悬停',
          dots: [[0.35, 0.55, '2'], [0.65, 0.55, '2'], [0.5, 0.25, '3']],
          arrows: [[0.35, -0.15, 0.35, 0.45], [0.65, -0.15, 0.65, 0.45], [0.5, -0.15, 0.5, 0.15]],
          period: 8, sim: () => [S_dive('striker_crimson', CANVAS_W * 0.35, 0, 105, 1.5), S_dive('striker_crimson', CANVAS_W * 0.65, 0, 105, 1.5), S_hover('gunship_violet', CANVAS_W / 2, 0.35)] },
        { id: '33', name: '对称双艇', comp: '2×3类', role: '前后均可', desc: '左右对称位置各浮现 1 艘 3类炮艇',
          dots: [[0.3, 0.32, '3'], [0.7, 0.32, '3']], arrows: [],
          period: 6, sim: () => [S_hover('gunship_violet', CANVAS_W * 0.3, 0, 130), S_hover('gunship_violet', CANVAS_W * 0.7, 0, 130)] },
        { id: '3-2-3', name: '品字炮阵', comp: '2×3类+1×2类', role: '前后均可', desc: '3类上2类下品字悬停',
          dots: [[0.3, 0.3, '3'], [0.7, 0.3, '3'], [0.5, 0.6, '2']], arrows: [[0.5, -0.15, 0.5, 0.2]],
          period: 6.5, sim: () => [S_hover('gunship_violet', CANVAS_W * 0.3, 0, 120), S_hover('gunship_violet', CANVAS_W * 0.7, 0, 120), fu('striker_crimson', CANVAS_W / 2, -50, 0, 120, { holdY: 200 })] },
        { id: '2222', name: '菱形四机', comp: '4×2类', role: '前波', desc: '菱形自前向后依次入场：底点→两翼→顶点（早出靠下），停留线上下对称',
          dots: [[0.5, 0.3, '2'], [0.25, 0.46, '2'], [0.75, 0.46, '2'], [0.5, 0.62, '2']], arrows: [[0.5, -0.15, 0.5, 0.12]],
          period: 7, sim: () => [S_dive('striker_crimson', CANVAS_W / 2, 0, 135, 0.8), S_dive('striker_crimson', CANVAS_W / 2 - 80, 0.35, 105, 0.8), S_dive('striker_crimson', CANVAS_W / 2 + 80, 0.35, 105, 0.8), S_dive('striker_crimson', CANVAS_W / 2, 0.7, 75, 0.8)] },
        { id: '12321', name: '回文横排', comp: '2×1类+2×2类+1×3类', role: '后波', desc: '3类居中回文横排——整排同帧同步入场',
          dots: [[0.15, 0.4, '1'], [0.325, 0.4, '2'], [0.5, 0.4, '3'], [0.675, 0.4, '2'], [0.85, 0.4, '1']],
          arrows: [[0.5, -0.15, 0.5, 0.3]],
          period: 7, sim: () => [fu('side_pass', CANVAS_W * 0.15, -46, 0, 95), S_dive('striker_crimson', CANVAS_W * 0.325, 0, 105, 1.5), S_hover('gunship_violet', CANVAS_W * 0.5, 0, 130), S_dive('striker_crimson', CANVAS_W * 0.675, 0, 105, 1.5), fu('side_pass', CANVAS_W * 0.85, -46, 0, 95)] },
        { id: '11211', name: '中央铁芯', comp: '4×1类+1×2类', role: '前波', desc: '2类居中1类两翼',
          dots: [[0.15, 0.4, '1'], [0.325, 0.4, '1'], [0.5, 0.4, '2'], [0.675, 0.4, '1'], [0.85, 0.4, '1']],
          arrows: [[0.5, -0.15, 0.5, 0.3]],
          period: 6.5, sim: () => [0.15, 0.325, 0.675, 0.85].map(k => fu('side_pass', k * CANVAS_W, -46, 0, 95)).concat([S_dive('striker_crimson', CANVAS_W / 2, 0, 105, 1.5)]) },
        { id: '1*10', name: '单侧洪流', comp: '10×1类', role: '侧翼', desc: '单侧两列五行宽面方阵横扫（y 五档同帧分层，行序依次入场）',
          dots: [[0.2, 0.1, '1'], [0.2, 0.26, '1'], [0.2, 0.42, '1'], [0.2, 0.58, '1'], [0.2, 0.74, '1'],
                 [0.32, 0.1, '1'], [0.32, 0.26, '1'], [0.32, 0.42, '1'], [0.32, 0.58, '1'], [0.32, 0.74, '1']],
          arrows: [[0.05, 0.3, 0.12, 0.33]],
          period: 10, sim: () => { const y0 = CANVAS_H * 0.42, out = []; for (let k = 0; k < 10; k++) out.push(fu('side_pass', -36 - (k % 2) * 50, y0 - Math.floor(k / 2) * 26, 105, 69, { t0: k * 0.25 })); return out; } },
        { id: '1类长队', name: '', comp: '4~7×1类', role: '侧翼', tag: '当前实装', desc: '现行标准编队：4~7 架 1类长队自单侧斜插穿越，生成高度 40%~60% 随机（队尾依次靠外靠上）',
          dots: [[0.1, 0.5, '1'], [0.2, 0.44, '1'], [0.3, 0.38, '1'], [0.4, 0.32, '1'], [0.5, 0.26, '1'], [0.6, 0.2, '1']],
          arrows: [[0.02, 0.58, 0.1, 0.54]], sideY: [0.40, 0.60],
          period: 6.5, sim: () => { const y0 = CANVAS_H * 0.41; return [0, 1, 2, 3, 4, 5].map(k => fu('side_pass', -36 - k * 54, y0 - k * 27, 105, 69)); } },
        { id: '2侧+1*2', name: '侧卫掩护', comp: '1×2类侧位+2×1类', role: '侧翼', tag: '定稿待实装', desc: '从一侧刷新 1 个 2类侧位（破片系，侧翼进入后到锁停点）与 2 个 1类敌人，同侧进入',
          dots: [[0.62, 0.35, '2'], [0.55, 0.25, '1'], [0.68, 0.45, '1']], arrows: [[0.98, 0.35, 0.82, 0.35]],
          period: 6.5, sim: () => [S_dive('popian', CANVAS_W * 0.62, 0.3, 130, 1.4), fu('side_pass', -36, CANVAS_H * 0.25, 105, 69), fu('side_shoot', -36, CANVAS_H * 0.45, 105, 69)] },
        { id: '3侧', name: '侧翼压制', comp: '1×3类', role: '侧翼', tag: '定稿待实装', desc: '侧翼出现 1 个 3类敌人，从一侧屏外水平入场、横越全场直到自对侧离场（3类攻击压制权重10：暴鸰/暴鸰G/虚幻；3类削弱辅助权重25：交响/寒霜/脉冲矩阵，走各自默认入场）。暴鸰系侧翼生成时入场 1.2s（诗篇 1s）后才能开始投弹，投弹后的额外移速加成减少 50%',
          dots: [[0.35, 0.4, '3']], arrows: [[0.02, 0.4, 0.24, 0.4]],
          period: 6, sim: () => [fu('baoling', -46, CANVAS_H * 0.4, 120, 0)] },
        { id: 'y*2', name: '双幽暮', comp: '2×幽暮', role: '特殊', tag: '定稿待实装', desc: '场地 30%~70% 高度随机两位置各浮现一架幽暮（无碰撞穿墙）',
          dots: [[0.35, 0.5, 'y'], [0.65, 0.5, 'y']], arrows: [],
          period: 6, sim: () => [S_fade('striker_dusk', CANVAS_W * 0.35, CANVAS_H * 0.5), S_fade('striker_dusk', CANVAS_W * 0.65, CANVAS_H * 0.5, 0.5)] },
        { id: '1*12防', name: '增生急行', comp: '12×1类防御', role: '前波', tag: '定稿待实装', desc: '顶部随机位置快速连续出现 12 个增生侧翼艇（约 0.12s/架，位置随机可重叠，8~20° 向中线斜向下压）',
          dots: [[0.08, 0.3, '1'], [0.16, 0.3, '1'], [0.24, 0.3, '1'], [0.32, 0.3, '1'], [0.4, 0.3, '1'], [0.48, 0.3, '1'], [0.56, 0.3, '1'], [0.64, 0.3, '1'], [0.72, 0.3, '1'], [0.8, 0.3, '1'], [0.88, 0.3, '1'], [0.95, 0.3, '1']],
          arrows: [[0.5, -0.15, 0.5, 0.18]], stagger: 24, randX: true,
          period: 8, sim: () => [0.08, 0.24, 0.4, 0.56, 0.72, 0.88].map((k, i) => fu('prolifera', k * CANVAS_W, -46 - i * 36, 0, 200)) },
        { id: '1*7攻', name: '紫电急行', comp: '7×1类攻击', role: '前波', tag: '定稿待实装', desc: '顶部随机位置快速连续出现 7 架紫电侧翼艇（约 0.14s/架，位置随机可重叠，亡语向下射一发）',
          dots: [[0.12, 0.3, '1'], [0.24, 0.3, '1'], [0.36, 0.3, '1'], [0.48, 0.3, '1'], [0.6, 0.3, '1'], [0.74, 0.3, '1'], [0.88, 0.3, '1']],
          arrows: [[0.5, -0.15, 0.5, 0.18]], stagger: 28, randX: true,
          period: 7.5, sim: () => [0.12, 0.28, 0.48, 0.64, 0.88].map((k, i) => fu('side_kamikaze', k * CANVAS_W, -46 - i * 36, 0, 200)) },
        { id: '232111', name: '', comp: '2×2类+1×3类+6×1类', role: '前波', desc: '「232111」诗篇改版：232 三机在上方同时出现（位置随机、相对位置一定），111 三轮跟进——每轮左右各 1 架 1类同时斜向直落（8~20° 向中线，位置随机）',
          dots: [[0.15, 0.22, '2', 0], [0.27, 0.22, '3', 0], [0.39, 0.22, '2', 0],
                 [0.30, 0.45, '1', 1], [0.70, 0.45, '1', 1],
                 [0.30, 0.58, '1', 2], [0.70, 0.58, '1', 2],
                 [0.30, 0.71, '1', 3], [0.70, 0.71, '1', 3]],
          arrows: [[0.15, -0.1, 0.18, 0.08]], rowShift: 80,
          period: 10, sim: () => { const out = [S_dive('striker_crimson', 60, 0, 120, 1.2), S_hover('gunship_violet', 122, 0.2, 140), S_dive('striker_crimson', 184, 0.4, 120, 1.2)]; for (let k = 0; k < 3; k++) { out.push(fu('side_pass', 150, -46 - k * 44, 0, 100, { t0: 0.8 + k * 0.2 })); out.push(fu('side_pass', 330, -46 - k * 44, 0, 100, { t0: 0.8 + k * 0.2 })); } return out; } },
      ]},
      { title: '真我级', color: '#ff5a5a', items: [
        { id: '333', name: '三艇横阵', comp: '3×3类', role: '前后均可', desc: '等距横排悬停',
          dots: [[0.25, 0.35, '3'], [0.5, 0.35, '3'], [0.75, 0.35, '3']], arrows: [[0.5, -0.15, 0.5, 0.25]],
          period: 6, sim: () => [0.25, 0.5, 0.75].map(k => S_hover('gunship_violet', k * CANVAS_W, 0, 130)) },
        { id: '3223', name: '内收双艇', comp: '2×3类+2×2类', role: '后波', desc: '3类内收2类外侧补位',
          dots: [[0.35, 0.25, '3'], [0.65, 0.25, '3'], [0.2, 0.55, '2'], [0.8, 0.55, '2']], arrows: [[0.5, -0.15, 0.5, 0.15]],
          period: 6.5, sim: () => [S_hover('gunship_violet', CANVAS_W / 2 - 90, 0, 120), S_hover('gunship_violet', CANVAS_W / 2 + 90, 0, 120), S_dive('striker_crimson', CANVAS_W / 2 - 170, 0.2, 105, 1.2), S_dive('striker_crimson', CANVAS_W / 2 + 170, 0.2, 105, 1.2)] },
        { id: '4', name: '单舰压阵', comp: '1×4类', role: '前后均可', desc: '正面浮现 1 艘 4类主力舰（水平位置随机）',
          dots: [[0.62, 0.4, '4']], arrows: [], waveShift: 120,   // 波级随机偏移 ±120px：整波位置随机
          period: 7, sim: () => [S_cap('capital_crimson', CANVAS_W * 0.58)] },
        { id: '4+1*4', name: '舰载护卫', comp: '1×4类+4×1类', role: '前后均可', desc: '主力舰+环绕护卫',
          dots: [[0.5, 0.4, '4'], [0.3, 0.2, '1'], [0.7, 0.2, '1'], [0.3, 0.65, '1'], [0.7, 0.65, '1']],
          arrows: [[0.5, -0.15, 0.5, 0.1]], waveShift: 120,   // 波级随机偏移 ±120px：整队位置随机（队形不变）
          period: 8, sim: () => [S_cap('capital_crimson', CANVAS_W / 2), fu('side_pass', CANVAS_W / 2 - 90, -46, 0, 95, { t0: 0.4 }), fu('side_pass', CANVAS_W / 2 + 90, -46, 0, 95, { t0: 0.4 }), fu('side_pass', CANVAS_W / 2 - 150, -140, 0, 95, { t0: 0.8 }), fu('side_pass', CANVAS_W / 2 + 150, -140, 0, 95, { t0: 0.8 })] },
        { id: '2*7+3', name: 'V字殿后', comp: '7×2类+1×3类', role: '前波', desc: 'V字顶点先行，殿后3类与最后入场的两翼同时出现；2类停留线居第2/3波间（前3机线下、后4机线上）',
          dots: [[0.2, 0.29, '2'], [0.3, 0.36, '2'], [0.4, 0.43, '2'], [0.5, 0.50, '2'],
                 [0.6, 0.43, '2'], [0.7, 0.36, '2'], [0.8, 0.29, '2'], [0.5, 0.29, '3']],
          arrows: [],
          period: 8, sim: () => { const cx = CANVAS_W / 2, hy = [150, 120, 90, 60], out = [S_dive('striker_crimson', cx, 0, hy[0], 0.7)]; for (let k = 1; k <= 3; k++) for (const sx of [-1, 1]) out.push(S_dive('striker_crimson', cx + sx * k * 56, k * 0.25, hy[k], 0.7)); out.push(S_hover('gunship_violet', cx, 0.75, 140)); return out; } },
        { id: '2*7', name: '', comp: '7×2类', role: '前波', tag: '当前实装', desc: 'Λ 形梯队：中心（最前）先入停最低、两翼依次向上跟进（早出靠下；停留时长走正常默认）',
          dots: [[0.2, 0.29, '2'], [0.3, 0.36, '2'], [0.4, 0.43, '2'], [0.5, 0.50, '2'],
                 [0.6, 0.43, '2'], [0.7, 0.36, '2'], [0.8, 0.29, '2']],
          arrows: [],
          period: 7, sim: () => { const cx = CANVAS_W / 2, hy = [150, 120, 90, 60], out = [S_dive('striker_crimson', cx, 0, hy[0], 0.7)]; for (let k = 1; k <= 3; k++) for (const sx of [-1, 1]) out.push(S_dive('striker_crimson', cx + sx * k * 56, k * 0.25, hy[k], 0.7)); return out; } },
        { id: '232232', name: '', comp: '4×2类+2×3类', role: '后波', tag: '当前实装', desc: '现行标准编队：4 架 2类短停留冲锋 + 2 架 3类炮艇悬停压阵，对称横排',
          dots: [[0.125, 0.4, '2'], [0.275, 0.4, '3'], [0.425, 0.4, '2'], [0.575, 0.4, '2'], [0.725, 0.4, '3'], [0.875, 0.4, '2']],
          arrows: [[0.5, -0.15, 0.5, 0.3]],
          period: 5.6, sim: () => { const x0 = (CANVAS_W - 5 * 70) / 2, out = []; for (let k = 0; k < 6; k++) { if (k === 1 || k === 4) out.push(fu('gunship_violet', x0 + k * 70, -60, 0, 62, { holdY: 140 })); else out.push(fu('striker_crimson', x0 + k * 70, -50, 0, 120, { holdY: 100, holdDur: 0.9, chargeVy: 460 })); } return out; } },
        { id: '双侧斜扫', name: '', comp: '两队各6~8×1类', role: '侧翼', tag: '当前实装', desc: '现行标准编队：两队 1类 自左右两侧相向斜扫、交叉穿越',
          dots: [[0.12, 0.3, '1'], [0.12, 0.5, '1'], [0.12, 0.7, '1'], [0.88, 0.3, '1'], [0.88, 0.5, '1'], [0.88, 0.7, '1']],
          arrows: [[0.02, 0.5, 0.12, 0.5], [0.98, 0.5, 0.88, 0.5]],
          period: 6.5, sim: () => { const y0 = CANVAS_H * 0.40, out = []; for (let k = 0; k < 7; k++) { out.push(fu('side_pass', -30 - k * 46, y0 - k * 25, 108, 61)); out.push(fu('side_pass', CANVAS_W + 30 + k * 46, y0 - k * 25, -108, 61)); } return out; } },
        { id: '32223', name: '', comp: '2×3类+3×2类', role: '前后均可', tag: '当前实装', desc: '现行标准编队：左右各 1 艘 3类炮艇压阵（悬停）+ 中央 3 架 2类护航',
          dots: [[0.15, 0.4, '3'], [0.325, 0.4, '2'], [0.5, 0.4, '2'], [0.675, 0.4, '2'], [0.85, 0.4, '3']],
          arrows: [[0.5, -0.15, 0.5, 0.3]],
          period: 5.6, sim: () => { const cx = CANVAS_W / 2, out = []; for (const sx of [-1, 1]) out.push(fu('gunship_violet', cx + sx * 150, -60, 0, 62, { holdY: 140 })); for (const k of [-1, 0, 1]) out.push(fu('striker_crimson', cx + k * 60, -50, 0, 120, { holdY: 105, holdDur: 0.9, chargeVy: 460 })); return out; } },
        { id: '2侧*2', name: '双侧破片', comp: '两侧各1×2类侧位', role: '侧翼', tag: '定稿待实装', desc: '从两侧各刷新 1 个 2类侧位（破片系），对称进入',
          dots: [[0.25, 0.4, '2'], [0.75, 0.4, '2']], arrows: [[0.02, 0.4, 0.14, 0.4], [0.98, 0.4, 0.86, 0.4]],
          period: 6, sim: () => [S_dive('popian', CANVAS_W * 0.25, 0, 130, 1.4), S_dive('popianU', CANVAS_W * 0.75, 0.4, 130, 1.4)] },
        { id: '3侧*2', name: '侧翼压制×2', comp: '2×3类', role: '侧翼', tag: '定稿待实装', desc: '侧翼出现 2 个 3类敌人：50% 同侧（注意不在同一位置）/ 50% 异侧，权重与生成规则同「3侧」（3类攻击压制10 / 3类削弱辅助25；暴鸰系侧翼 1.2s（诗篇 1s）武装 + 投弹后额外移速加成减半）',
          dots: [[0.3, 0.35, '3'], [0.68, 0.55, '3']], arrows: [[0.02, 0.35, 0.2, 0.35], [0.98, 0.55, 0.8, 0.55]],
          period: 7, sim: () => [fu('baoling', -46, CANVAS_H * 0.35, 120, 0), fu('baolingG', CANVAS_W + 46, CANVAS_H * 0.55, -120, 0, { t0: 0.35 })] },
        { id: 'y*4', name: '幽暮四角', comp: '4×幽暮', role: '特殊', tag: '定稿待实装', desc: '四点浮现合围（无碰撞穿墙）：前两架位于 80% 高度，另两架 50%~60% 高度随机',
          dots: [[0.14, 0.8, 'y'], [0.86, 0.8, 'y'], [0.2, 0.55, 'y'], [0.8, 0.55, 'y']],
          arrows: [],
          period: 6, sim: () => [S_fade('striker_dusk', CANVAS_W * 0.14, CANVAS_H * 0.8), S_fade('striker_dusk', CANVAS_W * 0.86, CANVAS_H * 0.8), S_fade('striker_dusk', CANVAS_W * 0.2, CANVAS_H * 0.55, 0.4), S_fade('striker_dusk', CANVAS_W * 0.8, CANVAS_H * 0.55, 0.8)] },
      ]},
      { title: '诗篇级', color: '#c084fc', items: [
        { id: '2*10', name: '双V梯队', comp: '10×2类', role: '前波', desc: '双V阵：同层左右齐出、自前向后逐层推进（停留线居中层）',
          dots: [[0.2, 0.27, '2'], [0.3, 0.36, '2'], [0.4, 0.45, '2'], [0.3, 0.54, '2'], [0.2, 0.63, '2'],
                 [0.8, 0.27, '2'], [0.7, 0.36, '2'], [0.6, 0.45, '2'], [0.7, 0.54, '2'], [0.8, 0.63, '2']],
          arrows: [[0.3, -0.15, 0.3, 0.05], [0.7, -0.15, 0.7, 0.05]],
          period: 9, sim: () => { const xs = [0.2, 0.3, 0.4, 0.3, 0.2], out = []; for (let L = 0; L < 5; L++) for (const k of [xs[L], 1 - xs[L]]) out.push(S_dive('striker_crimson', k * CANVAS_W, L * 0.25, 105 + (2 - L) * 30, 0.7)); return out; } },
        { id: '3*4', name: '四艇横阵', comp: '4×3类', role: '前波', desc: '四艇均分横排弧形阵：中间两艇先出（靠下）、两翼随后，中央悬停更低',
          dots: [[0.2, 0.25, '3'], [0.4, 0.45, '3'], [0.6, 0.45, '3'], [0.8, 0.25, '3']], arrows: [[0.5, -0.15, 0.5, 0.25]],
          period: 7, sim: () => [0.2, 0.4, 0.6, 0.8].map((k, i) => S_hover('gunship_violet', k * CANVAS_W, (i === 1 || i === 2) ? 0 : 0.6, 130)) },
        { id: '22422', name: '旗舰横阵', comp: '4×2类+1×4类', role: '后波', desc: '横排[2,2,4,2,2]，中央4类旗舰压阵——整排同帧同步入场',
          dots: [[0.125, 0.4, '2'], [0.31, 0.4, '2'], [0.5, 0.4, '4'], [0.69, 0.4, '2'], [0.875, 0.4, '2']],
          arrows: [[0.5, -0.15, 0.5, 0.28]],
          period: 8, sim: () => [S_dive('striker_crimson', CANVAS_W * 0.2, 0, 105, 1.2), S_dive('striker_crimson', CANVAS_W * 0.35, 0, 105, 1.2), S_cap('capital_crimson', CANVAS_W * 0.5), S_dive('striker_crimson', CANVAS_W * 0.65, 0, 105, 1.2), S_dive('striker_crimson', CANVAS_W * 0.8, 0, 105, 1.2)] },
        { id: '44', name: '双舰压阵', comp: '2×4类', role: '后波', desc: '两艘4类主力舰并列压阵',
          dots: [[0.35, 0.32, '4'], [0.65, 0.32, '4']], arrows: [[0.35, -0.15, 0.35, 0.2], [0.65, -0.15, 0.65, 0.2]],
          period: 8, sim: () => [S_cap('capital_crimson', CANVAS_W * 0.35), S_cap('capital_azure', CANVAS_W * 0.65)] },
        { id: '3*5', name: '五艇横阵', comp: '5×3类', role: '前波', desc: '五艇横排弧形阵：中央先出、两侧依次外扩（靠下先入），中央悬停更低',
          dots: [[0.125, 0.2, '3'], [0.3125, 0.3, '3'], [0.5, 0.45, '3'], [0.6875, 0.3, '3'], [0.875, 0.2, '3']],
          arrows: [[0.5, -0.15, 0.5, 0.25]],
          period: 8, sim: () => { const t0 = [1, 0.5, 0, 0.5, 1]; return [0.125, 0.3125, 0.5, 0.6875, 0.875].map((k, i) => S_hover('gunship_violet', k * CANVAS_W, t0[i], 130)); } },
        { id: '1234321', name: '金字塔横阵', comp: '2×1类+2×2类+2×3类+1×4类', role: '后波', desc: '横排[1,2,3,4,3,2,1]，中央4类旗舰——整排同帧同步入场',
          dots: [[0.1, 0.4, '1'], [0.24, 0.4, '2'], [0.38, 0.4, '3'], [0.5, 0.38, '4'], [0.62, 0.4, '3'], [0.76, 0.4, '2'], [0.9, 0.4, '1']],
          arrows: [[0.5, -0.15, 0.5, 0.28]],
          period: 8, sim: () => [fu('side_pass', CANVAS_W * 0.1, -46, 0, 95), S_dive('striker_crimson', CANVAS_W * 0.24, 0, 105, 1.5), S_hover('gunship_violet', CANVAS_W * 0.38, 0, 130), S_cap('capital_crimson', CANVAS_W * 0.5), S_hover('gunship_violet', CANVAS_W * 0.62, 0, 130), S_dive('striker_crimson', CANVAS_W * 0.76, 0, 105, 1.5), fu('side_pass', CANVAS_W * 0.9, -46, 0, 95)] },
        { id: 'w*1', name: '战争幽灵', comp: '1×战争幽灵', role: '前波', tag: '定稿待实装', desc: '生成 1 个战争幽灵，目标点在场地 50%~70% 高度随机位置，风波预警极速入场',
          dots: [[0.5, 0.6, 'w']], arrows: [[0.5, -0.15, 0.5, 0.3]],
          period: 9, sim: () => [fu('warGhost', CANVAS_W * 0.5, -80, 0, 220, { holdY: CANVAS_H * 0.6 })] },
        { id: 'z*8', name: '双侧自爆对冲', comp: '两侧各7~10×紫电/白影', role: '侧翼', tag: '定稿待实装', desc: '两侧各随机 7~10 只（紫电7:白影3），自所属侧入场，斜向对侧边缘、较生成位置更靠下的方向对冲穿越',
          dots: [[0.2, 0.15, 'z'], [0.2, 0.38, 'z'], [0.2, 0.61, 'z'], [0.2, 0.84, 'z'],
                 [0.8, 0.15, 'z'], [0.8, 0.38, 'z'], [0.8, 0.61, 'z'], [0.8, 0.84, 'z']],
          arrows: [[0.02, 0.25, 0.92, 0.55], [0.98, 0.25, 0.08, 0.55]],
          period: 7, sim: () => { const out = []; for (let k = 0; k < 4; k++) { out.push(fu(k % 3 === 2 ? 'side_pass' : 'side_kamikaze', -36, 100 + k * 64, 150, 42)); out.push(fu(k % 3 === 1 ? 'side_pass' : 'side_kamikaze', CANVAS_W + 36, 100 + k * 64, -150, 42)); } return out; } },
      ]},
      // 额外级：诗篇经「额外波次」独立门控注入、不占前/后波名额（特殊波次已并入该池，2026-10-12 用户定稿）；
      // 非诗篇按「波次权重」表随常规刷新穿插——细则见「刷怪机制」子页（真额外三项 h*1/h*2/2R 走独立概率，不入权重池）
      { title: '额外级（每等级可触发 · 不占两波名额）', color: '#ff8ad8', items: [
        { id: '2R', name: '增益无人舰', comp: '1×2R类', role: '特殊', tag: '定稿待实装', desc: '从侧翼横穿一架 2R 无人舰（现行行为：余弦上下浮动）——斗志昂扬10 / 赞助无人舰8 / 豪华赞助无人舰2',
          dots: [[0.5, 0.42, 'r']], arrows: [[0.02, 0.42, 0.14, 0.42]],
          period: 6, sim: () => [fu('douzhi', -60, CANVAS_H * 0.4, 150, 0)] },
        { id: 'h*1', name: '单导弹', comp: '1×3类攻击后位', role: '特殊', tag: '定稿待实装', desc: '召唤 1 个「3类攻击后位」池敌人（现池仅炮火先兆者——顶部水平位置随机浮现，定点召唤导弹雨；后位池扩员后自动跟进）',
          dots: [[0.5, 0.2, 'h']], arrows: [[0.5, -0.15, 0.5, 0.12]],
          period: 6, sim: () => [S_fade('harbinger', CANVAS_W * 0.5, 110)] },
        { id: 'h*2', name: '双导弹', comp: '2×3类攻击后位', role: '特殊', tag: '定稿待实装', desc: '召唤 2 个「3类攻击后位」池敌人（现池仅炮火先兆者——顶部左右各浮现一个，定点召唤导弹雨）',
          dots: [[0.2, 0.2, 'h'], [0.8, 0.2, 'h']],
          arrows: [[0.2, -0.15, 0.2, 0.12], [0.8, -0.15, 0.8, 0.12]],
          period: 6, sim: () => [S_fade('harbinger', CANVAS_W * 0.2, 110), S_fade('harbinger', CANVAS_W * 0.8, 110)] },
        // ---- 单类散点刷新概念稿 ×14（2026-10-10 用户定稿，编号对应用户口述 1~13 含 3.5；「随机位置」演示取代表性固定位）----
        { id: '特1', name: '单点1类', comp: '1×1类', role: '特殊', desc: '顶部随机位置生成 1 个 1类战机',
          dots: [[0.62, 0.22, '1']], arrows: [[0.62, -0.15, 0.62, 0.15]],
          period: 6, sim: () => [fu('side_pass', CANVAS_W * 0.62, -46, 0, 95)] },
        { id: '特2', name: '双点1类', comp: '2×1类', role: '特殊', desc: '顶部随机两个位置各生成 1 个 1类战机',
          dots: [[0.28, 0.22, '1'], [0.72, 0.22, '1']], arrows: [[0.28, -0.15, 0.28, 0.15], [0.72, -0.15, 0.72, 0.15]],
          period: 6, sim: () => [fu('side_pass', CANVAS_W * 0.28, -46, 0, 95), fu('side_pass', CANVAS_W * 0.72, -46, 0, 95)] },
        { id: '特3', name: '五点均分', comp: '5×1类', role: '特殊', desc: '顶部五个位置各生成 1 个 1类战机，五个位置均分',
          dots: [[0.1, 0.22, '1'], [0.3, 0.22, '1'], [0.5, 0.22, '1'], [0.7, 0.22, '1'], [0.9, 0.22, '1']], arrows: [[0.5, -0.15, 0.5, 0.15]],
          period: 6.5, sim: () => [0.1, 0.3, 0.5, 0.7, 0.9].map(k => fu('side_pass', k * CANVAS_W, -46, 0, 95)) },
        { id: '特3.5', name: '鱼贯长队', comp: '7×1类', role: '特殊', desc: '顶部随机一个位置接连生成 7 个 1类战机排成长队',
          dots: [[0.5, 0.08, '1'], [0.5, 0.2, '1'], [0.5, 0.32, '1'], [0.5, 0.44, '1'], [0.5, 0.56, '1'], [0.5, 0.68, '1'], [0.5, 0.8, '1']], arrows: [[0.5, -0.15, 0.5, 0.05]],
          period: 8, sim: () => { const x = CANVAS_W * 0.5, out = []; for (let k = 0; k < 7; k++) out.push(fu('side_pass', x, -46 - k * 40, 0, 95, { t0: k * 0.25 })); return out; } },
        { id: '特4', name: '单点2类', comp: '1×2类', role: '特殊', desc: '顶部随机位置生成 1 个 2类战机（停留后冲锋）',
          dots: [[0.62, 0.25, '2']], arrows: [[0.62, -0.15, 0.62, 0.15]],
          period: 6.5, sim: () => [S_dive('striker_crimson', CANVAS_W * 0.62, 0, 105, 1.2)] },
        { id: '特5', name: '双点2类', comp: '2×2类', role: '特殊', desc: '顶部随机两个位置各生成 1 个 2类战机（停留后冲锋）',
          dots: [[0.28, 0.25, '2'], [0.72, 0.25, '2']], arrows: [[0.28, -0.15, 0.28, 0.15], [0.72, -0.15, 0.72, 0.15]],
          period: 6.5, sim: () => [S_dive('striker_crimson', CANVAS_W * 0.28, 0, 105, 1.2), S_dive('striker_crimson', CANVAS_W * 0.72, 0, 105, 1.2)] },
        { id: '特6', name: '相邻双2', comp: '2×2类', role: '特殊', desc: '顶部随机两个挨着的位置各生成 1 个 2类战机（停留后冲锋）',
          dots: [[0.425, 0.25, '2'], [0.575, 0.25, '2']], arrows: [[0.5, -0.15, 0.5, 0.15]],
          period: 6.5, sim: () => [S_dive('striker_crimson', CANVAS_W / 2 - 36, 0, 105, 1.2), S_dive('striker_crimson', CANVAS_W / 2 + 36, 0, 105, 1.2)] },
        { id: '特7', name: '2类直落', comp: '1×2类', role: '特殊', desc: '顶部随机位置生成 1 个 2类战机，不停留直接走',
          dots: [[0.62, 0.25, '2']], arrows: [[0.62, -0.15, 0.62, 0.35]],
          period: 6, sim: () => [fu('striker_crimson', CANVAS_W * 0.62, -50, 0, 120)] },
        { id: '特8', name: '双2直落', comp: '2×2类', role: '特殊', desc: '顶部随机两个位置各生成 1 个 2类战机，不停留直接走',
          dots: [[0.28, 0.25, '2'], [0.72, 0.25, '2']], arrows: [[0.28, -0.15, 0.28, 0.35], [0.72, -0.15, 0.72, 0.35]],
          period: 6, sim: () => [fu('striker_crimson', CANVAS_W * 0.28, -50, 0, 120), fu('striker_crimson', CANVAS_W * 0.72, -50, 0, 120)] },
        { id: '特9', name: '连发双2直落', comp: '2×2类', role: '特殊', desc: '顶部随机位置接连生成 2 个 2类战机，不停留直接走',
          dots: [[0.5, 0.12, '2'], [0.5, 0.3, '2']], arrows: [[0.5, -0.15, 0.5, 0.35]],
          period: 6, sim: () => [fu('striker_crimson', CANVAS_W / 2, -50, 0, 120), fu('striker_crimson', CANVAS_W / 2, -90, 0, 120, { t0: 0.25 })] },
        { id: '特10', name: '连发三2直落', comp: '3×2类', role: '特殊', desc: '顶部随机位置接连生成 3 个 2类战机，不停留直接走',
          dots: [[0.5, 0.08, '2'], [0.5, 0.26, '2'], [0.5, 0.44, '2']], arrows: [[0.5, -0.15, 0.5, 0.35]],
          period: 6.5, sim: () => [0, 1, 2].map(k => fu('striker_crimson', CANVAS_W / 2, -50 - k * 40, 0, 120, { t0: k * 0.25 })) },
        { id: '特11', name: '单点3类', comp: '1×3类', role: '特殊', desc: '顶部随机位置生成 1 个 3类炮艇（悬停）',
          dots: [[0.62, 0.28, '3']], arrows: [],
          period: 6, sim: () => [S_hover('gunship_violet', CANVAS_W * 0.62)] },
        { id: '特12', name: '双点3类', comp: '2×3类', role: '特殊', desc: '顶部随机两个位置各生成 1 个 3类炮艇（悬停）',
          dots: [[0.28, 0.28, '3'], [0.72, 0.28, '3']], arrows: [],
          period: 6, sim: () => [S_hover('gunship_violet', CANVAS_W * 0.28), S_hover('gunship_violet', CANVAS_W * 0.72)] },
        { id: '特13', name: '相邻双3', comp: '2×3类', role: '特殊', desc: '顶部随机两个挨着的位置各生成 1 个 3类炮艇（悬停）',
          dots: [[0.43, 0.28, '3'], [0.57, 0.28, '3']], arrows: [],
          period: 6, sim: () => [S_hover('gunship_violet', CANVAS_W / 2 - 35), S_hover('gunship_violet', CANVAS_W / 2 + 35)] },
      ]},,
    ];
    return _t3GroupsCache;
  }
  // 按卡 id 取设计卡（WAVE_SPAWN_LIST 元数据与 T3_GROUPS 同 id 配对；找不到返回 null）
  function t3SpawnCardById(id) {
    for (const g of t3GroupsAll()) {
      const f = g.items.find(x => x.id === id);
      if (f) return f;
    }
    return null;
  }

  function renderInfoTest3() {
    infoBody.innerHTML = '';

    // 类别注册表：图例色 + 示意圆点半径（1类=4 / 2类=5 / 3类=7 / 4类=9 / 特殊=5）
    const T3_CLS = {
      '1': { name: '1类',   color: '#e8eef8', r: 4 },
      '2': { name: '2类',   color: '#ff5a5a', r: 5 },
      '3': { name: '3类',   color: '#c084fc', r: 7 },
      '4': { name: '4类',   color: '#ff4d6d', r: 9 },
      'z': { name: '紫电',   color: '#b06cff', r: 5 },
      's': { name: '增生',   color: '#7fe8c9', r: 5 },
      'y': { name: '幽暮',   color: '#9aa7ff', r: 5 },
      'h': { name: '先兆者', color: '#ffb04a', r: 5 },
      'f': { name: '寒霜',   color: '#6fd8ff', r: 5 },
      'w': { name: '战争幽灵', color: '#c9d2e8', r: 7 },
      'r': { name: '2R无人舰', color: '#ffd166', r: 5 },
    };
    const T3_ROLE_COLOR = { '前波': '#ff9a4d', '后波': '#6fb4ff', '前后均可': '#9fe8a0', '侧翼': '#ffd166', '特殊': '#ff8ad8' };
    const CW = 168, CH = 120;   // 示意图画布 CSS 尺寸


    // 编队数据（五个分组）：虚象 8 + 具象 13 + 真我 9 + 诗篇 6 = 36 式候选/沿用；特殊 18 式（4 定稿 + 14 单类散点概念稿）
    //   sim 为悬停演示的代表性回放（实际入场侧 / 精确配比 / 概率待实装定）；period 演示循环时长 s
    const T3_GROUPS = t3GroupsAll();   // 模块级单例（sim 演示闭包引用模块级 S_* 构造，行为不变）
    // 组内排序（2026-10-10 用户定稿）：同等级内卡片自上而下按 前波→后波→前后均可→侧翼→特殊 排列
    // （sort 为稳定排序，同定位内保持定义顺序）
    const T3_ROLE_ORDER = { '前波': 0, '后波': 1, '前后均可': 2, '侧翼': 3, '特殊': 4 };
    T3_GROUPS.forEach(g => g.items.sort((a, b) => (T3_ROLE_ORDER[a.role] ?? 9) - (T3_ROLE_ORDER[b.role] ?? 9)));

    // 图例行：小色点 + 名称
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;margin:2px 0 6px;';
    ['1', '2', '3', '4', 'z', 's', 'y', 'h', 'f', 'w', 'r'].forEach(k => {
      const item = document.createElement('span');
      item.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#9fb4d8;';
      const dot = document.createElement('span');
      dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${T3_CLS[k].color};box-shadow:0 0 5px ${T3_CLS[k].color};`;
      item.append(dot, document.createTextNode(T3_CLS[k].name));
      legend.appendChild(item);
    });
    infoBody.appendChild(legend);

    // 示意图绘制：深底 + 细网格 + 白色渐隐入场箭头（带箭头头）+ 类别色圆点（微辉光）
    function t3DrawScene(cv, f) {
      const c = cv.getContext('2d');
      const S = DPR * 2;   // devicePixelRatio×2 缩放，小尺寸示意图保证清晰
      c.setTransform(S, 0, 0, S, 0, 0);
      c.fillStyle = '#0d0f16';
      c.fillRect(0, 0, CW, CH);
      c.strokeStyle = 'rgba(255,255,255,0.05)';
      c.lineWidth = 1;
      c.beginPath();
      for (let gx = CW / 8; gx < CW - 0.5; gx += CW / 8) { c.moveTo(gx, 0); c.lineTo(gx, CH); }
      for (let gy = CH / 5; gy < CH - 0.5; gy += CH / 5) { c.moveTo(0, gy); c.lineTo(CW, gy); }
      c.stroke();
      f.arrows.forEach(a => {
        const x1 = a[0] * CW, y1 = a[1] * CH, x2 = a[2] * CW, y2 = a[3] * CH;   // 负值起点=画布外，自然裁掉
        const grd = c.createLinearGradient(x1, y1, x2, y2);
        grd.addColorStop(0, 'rgba(255,255,255,0)');
        grd.addColorStop(0.6, 'rgba(255,255,255,0.35)');
        grd.addColorStop(1, 'rgba(255,255,255,0.95)');
        c.strokeStyle = grd; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
        const ang = Math.atan2(y2 - y1, x2 - x1);   // 箭头头
        c.beginPath();
        c.moveTo(x2, y2); c.lineTo(x2 - 6 * Math.cos(ang - 0.45), y2 - 6 * Math.sin(ang - 0.45));
        c.moveTo(x2, y2); c.lineTo(x2 - 6 * Math.cos(ang + 0.45), y2 - 6 * Math.sin(ang + 0.45));
        c.stroke();
      });
      f.dots.forEach(d => {
        const cls = T3_CLS[d[2]];
        c.save();
        c.shadowColor = cls.color; c.shadowBlur = Math.max(4, cls.r * 1.5);   // 微辉光
        c.fillStyle = cls.color;
        c.beginPath(); c.arc(d[0] * CW, d[1] * CH, cls.r, 0, Math.PI * 2); c.fill();
        c.restore();
      });
    }

    // 卡片悬停 → mini 战场演示浮层（复用权重-波次页 showFormationPreview / moveFormationPopup / hideFormationPreview）
    const t3Hover = f => ({
      enter: ev => showFormationPreview({
        name: `${f.id}${f.name ? ' · ' + f.name : ''}`,
        note: `${f.comp} ｜ ${f.role}${f.tag ? ' ｜ ✓' + f.tag : ''} —— ${f.desc}`,
        period: f.period || 6.5,
        sim: f.sim,
      }, ev),
      move: ev => moveFormationPopup(ev),
      leave: () => hideFormationPreview(),
    });

    // 分组标题 + 每式一张卡（h4 定位徽记色 / meta 组成+定位 / 行为描述 / 示意图 / 悬停演示）
    T3_GROUPS.forEach(g => {
      const head = document.createElement('h3');
      head.className = 'info-achv-tier-head';
      head.textContent = g.title;
      head.style.color = g.color;
      infoBody.appendChild(head);
      // grid 固定轨道（2026-10-12 用户定稿）：flex:1 会让独占一行的卡（y*4 幽暮四角等）grow 撑满整行变宽，
      // 改 auto-fill 固定 205px 轨道——单卡独行时宽度与多卡同行完全一致
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,205px);gap:10px;';
      g.items.forEach(f => {
        const card = document.createElement('div');
        card.className = 'info-wave-card';
        card.style.cssText = 'min-width:0;';
        const h = document.createElement('h4');
        h.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
        h.style.color = T3_ROLE_COLOR[f.role];
        h.append(document.createTextNode(`${f.id}${f.name ? ' · ' + f.name : ''}`));
        if (f.tag) {   // 徽记（「定稿待实装」/「当前实装」）
          const badge = document.createElement('span');
          badge.textContent = '✓ ' + f.tag;
          badge.style.cssText = 'font-size:10px;font-weight:normal;color:#9fe8a0;border:1px solid rgba(159,232,160,0.55);border-radius:8px;padding:0 6px;white-space:nowrap;';
          h.appendChild(badge);
        }
        const meta = document.createElement('p');
        meta.textContent = `${f.comp} ｜ ${f.role}`;
        meta.style.cssText = 'font-size:11px;color:#9fb4d8;';
        const p = document.createElement('p');
        p.textContent = f.desc;
        const cv = document.createElement('canvas');
        cv.width = CW * DPR * 2;
        cv.height = CH * DPR * 2;
        cv.style.cssText = 'width:168px;height:120px;display:block;margin:8px auto 0;background:#0d0f16;border:1px solid rgba(124,231,255,0.18);border-radius:8px;';
        t3DrawScene(cv, f);
        const hv = t3Hover(f);
        card.addEventListener('mouseenter', hv.enter);
        card.addEventListener('mousemove', hv.move);
        card.addEventListener('mouseleave', hv.leave);
        // 右上角「▶ 测试」按钮：整波实测（怪物血量同图鉴测试环境 20000；按 = 立刻清场重刷，见 14-main）
        const testBtn = document.createElement('button');
        testBtn.className = 'ency-challenge-btn t3-test-btn';
        testBtn.textContent = '▶ 测试';
        testBtn.title = '整波实测：按本卡编队生成整波（血量同图鉴测试环境）；战斗中按 = 立刻清场并重新刷新';
        testBtn.addEventListener('click', ev => { ev.stopPropagation(); startT3WaveTest(f); });
        testBtn.addEventListener('mouseenter', ev => ev.stopPropagation());
        card.style.position = 'relative';
        // 覆盖 .ency-challenge-btn 的全宽块级默认（width:100% + 9px 纵向内边距），缩小为卡片右上角紧凑按钮
        testBtn.style.cssText = 'position:absolute;top:6px;right:6px;width:auto;margin:0;padding:2px 8px;font-size:10px;line-height:1.4;';
        card.append(h, meta, p, cv, testBtn);
        row.appendChild(card);
      });
      infoBody.appendChild(row);
    });
  }

  // ---------- 测试4：战争矩阵 设计工作区（2026-10-03 改版）----------
  // 旧内容（黑暗之手 + 四连携随从技能方案，2026-09-29 批次）已全部实装定稿，按用户指令清空。
  // 战争矩阵（warMatrix，诗篇级 4B）：法术矩阵类敌人的强大上位单位。本页：一、外观候选 A~D；二、技能候选 S1~S4（动画演示）；三、纯文字候选。
  // 动画为循环轻量模拟（188x246 竖版小场，蓝三角＝玩家，位置按 sin 规律横移）；每帧自检 isConnected，脱链自动停帧。
  function renderInfoTest4() {
    infoBody.innerHTML = '';

    // ── 一、外观候选（四选一）──
    infoBody.appendChild(t4Head('一、外观候选（四选一）'));
    t4DemoGrid([
      { title: 'A · 王冠矩阵', sub: '巨型竖菱主舰 + 顶部三小菱排成王冠弧', period: 6, draw: t4DrawWmA },
      { title: 'B · 五芒战阵', sub: '五座矩阵菱形拼五角星顶点 + 中央战争核心', period: 6, draw: t4DrawWmB },
      { title: 'C · 十字卫阵', sub: '四座菱十字环绕 + 中央方核整体缓旋', period: 6, draw: t4DrawWmC },
      { title: 'D · 双子矩阵', sub: '两座巨菱镜像绕转 + 中央能量连线脉动', period: 6, draw: t4DrawWmD },
    ]);
    [
      ['A · 王冠矩阵', '中央巨型竖菹形主体自旋，顶部三座小菹形沿弧形排列如王冠；主菱血红、小菱暗金。读作「矩阵族群之王」，体型最大、压迫感最强。'],
      ['B · 五芒战阵', '五座法术矩阵样式菹形分居五角星顶点、径向朝外，中央嵌旋转方块核心；整体缓慢旋转。读作「战术阵法」，与脉冲矩阵（三角拼合）形成进阶感。'],
      ['C · 十字卫阵', '四座菹形十字方向环绕中央大方核，整体缓旋、四菱反向自旋；方核随呼吸明暗。读作「移动要塞」，防御感/重装感最强。'],
      ['D · 双子矩阵', '两座巨型菹形互为镜像绕中心对转，两者之间能量连线脉动；中心虚空。读作「双生守卫」，可配合双生/共享机制（击毁一半另一半暴走）。'],
    ].forEach(([n, d]) => infoBody.appendChild(t4TextCard(n, d, '#e0a05a')));

    // ── 二、技能候选（动画演示，暂用 B 外观）──
    infoBody.appendChild(t4Head('二、技能候选（动画演示，可多选）'));
    t4DemoGrid([
      { title: 'S1 矩阵齐射', sub: '五菱依次充能亮起 → 朝玩家扇形齐射发光正方体', period: 4.2, draw: t4DrawWmVolley },
      { title: 'S2 棱镜分裂弹', sub: '大正方体飞行中段 → 预警圈收缩 → 分裂四枚 X 形小正方体', period: 4.4, draw: t4DrawWmSplit },
      { title: 'S3 封印方界', sub: '玩家周围四点成结界 → 方形收缩挤压', period: 4.6, draw: t4DrawWmSeal },
      { title: 'S4 矩阵坠落', sub: '落点预警圈 → 大正方体依次砸落 + 冲击波', period: 4.8, draw: t4DrawWmRain },
    ]);
    [
      ['S1 矩阵齐射（文字补充）', '各菹形依次充能（每座 0.24s 间隔亮起），齐亮后 0.3s 齐射：每座朝玩家方向发射 1 枚正方体（总 5 枚、扇形散布 ±20°）；正方体速度/伤害与法术阵列大号正方体同档。齐射后 1.2s 全体熄灭进兠装填（输出窗口）。'],
      ['S2 棱镜分裂弹（文字补充）', '中央核心发射一枚特大正方体（伤害高、速度慢），飞行至射程 55% 处分裂为 4 枚小正方体沿 X 形四向扩散；与法术阵列的「1 同向 + 2 垂直」分裂形成差异化。'],
      ['S3 封印方界（文字补充）', '在玩家周围生成四个光点（方形四角，距离 46px）→ 光点连线成结界（虚线渐实）→ 整体以渐加速收缩至 16px，收缩完成瞬间结界内闪光伤害；及时离开结界范围可破。'],
      ['S4 矩阵坠落（文字补充）', '屏幕上方出现 5 个落点预警圈（水平随机、不重叠），0.9s 后大正方体依次砸落（间隔 0.18s），落地瞬间产生小范围冲击波环（半径 40）。'],
    ].forEach(([n, d]) => infoBody.appendChild(t4TextCard(n, d, '#d8b060')));

    // ── 三、纯文字候选（备选游离机制）──
    infoBody.appendChild(t4Head('三、纯文字候选（备选）'));
    [
      ['S5 召唤矩阵群', '每隔一段时间在周身召唤 2 座普通法术矩阵（残亡不加分不掉水晶），最多同屏 4 座；与法术阵列的召唤形成上位对应。'],
      ['S6 战争光环', '在场时全场法术矩阵类敌人（法术矩阵/脉冲矩阵/法术阵列）攻击间隔 -20%、正方体速度 +15%；死亡时全场矩阵类瞬间暂停 1.5s（阵法崩解）。'],
      ['S7 核心暴走（残血狂怒）', '血量 ≤30% 时核心过载：全体通红、攻击间隔减半，但自身每秒受到固定伤害（双向加速）。'],
    ].forEach(([n, d]) => infoBody.appendChild(t4TextCard(n, d, '#c8a048')));

    infoAppendNote('<b>怎么用本页</b>：告诉我外观选哪个 + 技能勾哪几个（例如：「外观 B；技能 S1 + S3 + S6」），'
      + '我据此实装到 01-config（参数）/ 04-spawn（spawnWarMatrix）/ 06-enemy（状态机）/ 09-draw-ships（专属外观）。'
      + '实装后从 WIP_PLACEHOLDER_TYPES 移除、图鉴条目去掉 wip。');
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
  // ── 测试4 战争矩阵小件：单座法术矩阵菹形（竖菹形外体 + 内核心；s=半高，rot=自旋角，col=主色）──
  function t4Shard(c, x, y, s, rot, col, glow) {
    c.save();
    c.translate(x, y); c.rotate(rot || 0);
    if (glow) { c.shadowColor = col; c.shadowBlur = glow; }
    c.fillStyle = '#1a1420';
    c.strokeStyle = col; c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(0, -s); c.lineTo(s * 0.56, 0); c.lineTo(0, s); c.lineTo(-s * 0.56, 0);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = col;
    c.beginPath(); c.arc(0, 0, s * 0.22, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  // 中央旋转方核（外观 B/C 与技能演示共用）
  function t4Core(c, x, y, s, rot, col) {
    c.save();
    c.translate(x, y); c.rotate(rot || 0);
    c.shadowColor = col; c.shadowBlur = 10;
    c.fillStyle = '#241722'; c.strokeStyle = col; c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(-s, -s); c.lineTo(s, -s); c.lineTo(s, s); c.lineTo(-s, s);
    c.closePath(); c.fill(); c.stroke();
    c.rotate(Math.PI / 4);
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.8;
    const s2 = s * 0.55;
    c.beginPath();
    c.moveTo(-s2, -s2); c.lineTo(s2, -s2); c.lineTo(s2, s2); c.lineTo(-s2, s2);
    c.closePath(); c.stroke();
    c.restore();
  }
  // B 外观简形（技能演示的机体，缩小版五芒战阵）
  function t4WmShipB(c, x, y, s, t, charge) {
    const R = 30 * s;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 5 + t * 0.25;
      const gl = charge != null ? Math.max(0, Math.min(1, (charge - i * 0.24) / 0.3)) * 8 : 0;
      t4Shard(c, x + Math.cos(a) * R, y + Math.sin(a) * R, 8 * s, a + Math.PI / 2, gl > 0.5 ? '#ffd28a' : '#c86a4a', gl);
    }
    t4Core(c, x, y, 7 * s, t * 0.8, '#e86a3a');
  }

  // ── 外观候选演示（循环微动画：呼吸浮动 + 自旋）──
  function t4DrawWmA(c, t, dt, W, H, st) {
    const cx = W / 2, cy = H * 0.42 + Math.sin(t * 1.2) * 3;
    for (let i = -1; i <= 1; i++) {
      const a = -Math.PI / 2 + i * 0.7;
      t4Shard(c, cx + Math.cos(a) * 34, cy + Math.sin(a) * 34, 9, -t * 1.2, '#c8a04a', 4);
    }
    t4Shard(c, cx, cy, 26, t * 0.5, '#c22b3d', 10);
  }
  function t4DrawWmB(c, t, dt, W, H, st) {
    const cx = W / 2, cy = H * 0.42 + Math.sin(t * 1.2) * 3;
    t4WmShipB(c, cx, cy, 1.35, t, null);
  }
  function t4DrawWmC(c, t, dt, W, H, st) {
    const cx = W / 2, cy = H * 0.42 + Math.sin(t * 1.2) * 3;
    const R = 32;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + t * 0.4;
      t4Shard(c, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 12, -t * 0.9, '#b85a3a', 5);
    }
    const pl = 0.75 + Math.sin(t * 2.4) * 0.25;
    t4Core(c, cx, cy, 12 * pl, t * 0.8, '#ff8a4a');
  }
  function t4DrawWmD(c, t, dt, W, H, st) {
    const cx = W / 2, cy = H * 0.42 + Math.sin(t * 1.2) * 3;
    const R = 24;
    const a1 = t * 0.7, a2 = a1 + Math.PI;
    const x1 = cx + Math.cos(a1) * R, y1 = cy + Math.sin(a1) * R;
    const x2 = cx + Math.cos(a2) * R, y2 = cy + Math.sin(a2) * R;
    const pl = 0.5 + Math.sin(t * 4) * 0.3;
    t4Line(c, x1, y1, x2, y2, 1.5, 'rgba(255,140,70,' + pl.toFixed(3) + ')', 8);
    t4Shard(c, x1, y1, 17, t * 0.9, '#d86a3a', 6);
    t4Shard(c, x2, y2, 17, -t * 0.9, '#d86a3a', 6);
  }

  // ── 技能候选演示（机体统一用 B 外观简形）──
  // S1 矩阵齐射：五菱依次充能 → 齐射 5 枚正方体（扇形 ±20°）
  function t4DrawWmVolley(c, t, dt, W, H, st) {
    if (t < (st.misc.pt || 0)) { st.bullets.length = 0; st.misc.fired = 0; }
    st.misc.pt = t;
    const cx = W / 2, cy = 52;
    const charge = Math.max(0, Math.min(1.6, t / 1.2 * 1.6));
    t4WmShipB(c, cx, cy, 0.9, t, t < 1.2 ? charge : 1.6);
    const pp = t4PlayerPos(t, W, H);
    if (t >= 1.5 && !st.misc.fired) {
      st.misc.fired = 1;
      const base = Math.atan2(pp[1] - cy, pp[0] - cx);
      for (let i = 0; i < 5; i++) {
        const a = base + (-20 + i * 10) * Math.PI / 180;
        st.bullets.push({ x: cx, y: cy, vx: Math.cos(a) * 95, vy: Math.sin(a) * 95, r: t * 3 });
      }
    }
    if (t >= 1.5 && t < 1.5 + 0.3) {
      c.fillStyle = 'rgba(255,200,120,' + (0.5 * (1 - (t - 1.5) / 0.3)).toFixed(3) + ')';
      c.beginPath(); c.arc(cx, cy, 26, 0, Math.PI * 2); c.fill();
    }
    for (let i = st.bullets.length - 1; i >= 0; i--) {
      const b = st.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.r += dt * 3;
      if (b.y > H + 8 || b.x < -8 || b.x > W + 8) { st.bullets.splice(i, 1); continue; }
      c.save();
      c.translate(b.x, b.y); c.rotate(b.r);
      c.shadowColor = '#ffb060'; c.shadowBlur = 6;
      c.fillStyle = '#fff2e0'; c.strokeStyle = '#e86a3a'; c.lineWidth = 1;
      c.beginPath();
      c.moveTo(-4, -4); c.lineTo(4, -4); c.lineTo(4, 4); c.lineTo(-4, 4);
      c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
  }
  // S2 棱镜分裂弹：特大正方体 55% 射程处分裂 X 形四枚
  function t4DrawWmSplit(c, t, dt, W, H, st) {
    if (t < (st.misc.pt || 0)) { st.bullets.length = 0; st.misc.big = null; st.misc.warnT = -1; }
    st.misc.pt = t;
    const cx = W / 2, cy = 52;
    t4WmShipB(c, cx, cy, 0.9, t, null);
    const pp = t4PlayerPos(t, W, H);
    if (t >= 0.4 && !st.misc.big && !st.misc.done) {
      const a = Math.atan2(pp[1] - cy, pp[0] - cx);
      st.misc.big = { x: cx, y: cy, vx: Math.cos(a) * 78, vy: Math.sin(a) * 78, r: 0, fly: 0 };
    }
    if (st.misc.big) {
      const b = st.misc.big;
      b.fly += dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.r += dt * 2.2;
      if (b.fly >= 0.82 && st.misc.warnT < 0) st.misc.warnT = t;   // 分裂前 0.4s 预警
      if (b.fly >= 1.22) {
        for (let i = 0; i < 4; i++) {
          const a = Math.PI / 4 + i * Math.PI / 2;
          st.bullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 88, vy: Math.sin(a) * 88, r: i });
        }
        st.flashes.push({ x: b.x, y: b.y, r: 4, max: 30, a: 0.7 });
        st.misc.big = null; st.misc.done = 1;
      }
    }
    if (st.misc.big) {
      const b = st.misc.big;
      if (st.misc.warnT >= 0) {
        const k = 1 - Math.min(1, (t - st.misc.warnT) / 0.4);
        c.strokeStyle = 'rgba(255,120,80,' + (0.3 + k * 0.5).toFixed(3) + ')'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(b.x, b.y, 8 + k * 22, 0, Math.PI * 2); c.stroke();
      }
      c.save();
      c.translate(b.x, b.y); c.rotate(b.r);
      c.shadowColor = '#ff9a50'; c.shadowBlur = 10;
      c.fillStyle = '#ffe8d0'; c.strokeStyle = '#e05a2a'; c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(-8, -8); c.lineTo(8, -8); c.lineTo(8, 8); c.lineTo(-8, 8);
      c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
    t4WmFx(c, dt, W, H, st, 3.4);
  }
  // S3 封印方界：四点结界 → 收缩挤压
  function t4DrawWmSeal(c, t, dt, W, H, st) {
    const cx = W / 2, cy = 52;
    t4WmShipB(c, cx, cy, 0.9, t, t < 1.6 ? t / 1.6 : 0);
    const pp = t4PlayerPos(t, W, H);
    let R = 46, lineA = 0, coreA = 0;
    if (t < 0.8) { R = 46; lineA = 0; }
    else if (t < 1.6) { R = 46; lineA = (t - 0.8) / 0.8; }
    else if (t < 2.8) { const k = (t - 1.6) / 1.2; R = 46 + (16 - 46) * k * k; lineA = 1; }
    else if (t < 3.1) { R = 16; lineA = 1; coreA = 1 - (t - 2.8) / 0.3; }
    else { R = 16; lineA = Math.max(0, 1 - (t - 3.1) / 0.5); }
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [pp[0] + sx * R, pp[1] + sy * R]);
    for (const [x, y] of pts) {
      c.fillStyle = '#ffb060'; c.shadowColor = '#ff8a40'; c.shadowBlur = 6;
      c.beginPath(); c.arc(x, y, 2.6, 0, Math.PI * 2); c.fill();
      c.shadowBlur = 0;
    }
    if (lineA > 0) {
      c.save();
      c.globalAlpha = Math.min(1, lineA);
      if (t < 1.6) c.setLineDash([5, 4]);
      c.strokeStyle = '#ff9a50'; c.lineWidth = 1.6;
      c.shadowColor = '#ff8a40'; c.shadowBlur = 6;
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 4; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.closePath(); c.stroke();
      c.restore();
    }
    if (coreA > 0) {
      c.fillStyle = 'rgba(255,220,180,' + (coreA * 0.85).toFixed(3) + ')';
      c.beginPath(); c.arc(pp[0], pp[1], R * 1.2, 0, Math.PI * 2); c.fill();
    }
  }
  // S4 矩阵坠落：落点预警 → 依次砸落 + 冲击波
  function t4DrawWmRain(c, t, dt, W, H, st) {
    if (t < (st.misc.pt || 0)) {
      st.bullets.length = 0; st.flashes.length = 0; st.misc.spots = null;
      st.misc.seed = (st.misc.seed || 0) + 1;
    }
    st.misc.pt = t;
    const cx = W / 2, cy = 52;
    t4WmShipB(c, cx, cy, 0.9, t, null);
    if (!st.misc.spots) {
      const rnd = (i) => { const v = Math.sin(st.misc.seed * 37.7 + i * 91.3) * 43758.5453; return v - Math.floor(v); };
      st.misc.spots = [];
      for (let i = 0; i < 5; i++) st.misc.spots.push({ x: W * (0.12 + 0.76 * rnd(i)), y: H * (0.55 + 0.3 * rnd(i + 9)) });
    }
    const T0 = 0.9;
    for (let i = 0; i < st.misc.spots.length; i++) {
      const sp = st.misc.spots[i], tDrop = T0 + i * 0.18;
      if (t < tDrop) {
        const k = Math.max(0, Math.min(1, t / T0));
        c.strokeStyle = 'rgba(255,110,70,' + (0.25 + k * 0.55).toFixed(3) + ')'; c.lineWidth = 1.4;
        c.beginPath(); c.arc(sp.x, sp.y, 14 * (1 - k * 0.35), 0, Math.PI * 2); c.stroke();
      } else if (!sp.done) {
        sp.done = 1;
        st.bullets.push({ x: sp.x, y: -10, vy: 340, ty: sp.y, r: 0 });
      }
    }
    t4WmFx(c, dt, W, H, st, 0);
    for (let i = st.bullets.length - 1; i >= 0; i--) {
      const b = st.bullets[i];
      b.y += b.vy * dt; b.r += dt * 5;
      if (b.y >= b.ty) {
        st.flashes.push({ x: b.x, y: b.ty, r: 6, max: 40, a: 0.8 });
        st.bullets.splice(i, 1); continue;
      }
      c.save();
      c.translate(b.x, b.y); c.rotate(b.r);
      c.shadowColor = '#ff9a50'; c.shadowBlur = 8;
      c.fillStyle = '#ffe0c0'; c.strokeStyle = '#d0502a'; c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(-6, -6); c.lineTo(6, -6); c.lineTo(6, 6); c.lineTo(-6, 6);
      c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
  }
  // 共用：小正方体更新 + 冲击波环（S2/S4 复用）
  function t4WmFx(c, dt, W, H, st, fadeAt) {
    for (let i = st.bullets.length - 1; i >= 0; i--) {
      const b = st.bullets[i];
      if (b.ty != null) continue;   // 坠落弹由 S4 自行更新
      b.x += b.vx * dt; b.y += b.vy * dt; b.r += dt * 3;
      if (b.y > H + 8 || b.x < -8 || b.x > W + 8 || b.y < -8) { st.bullets.splice(i, 1); continue; }
      c.save();
      c.translate(b.x, b.y); c.rotate(b.r);
      c.shadowColor = '#ffb060'; c.shadowBlur = 5;
      c.fillStyle = '#fff0dc'; c.strokeStyle = '#e06a3a'; c.lineWidth = 1;
      c.beginPath();
      c.moveTo(-3.4, -3.4); c.lineTo(3.4, -3.4); c.lineTo(3.4, 3.4); c.lineTo(-3.4, 3.4);
      c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
    for (let i = st.flashes.length - 1; i >= 0; i--) {
      const f = st.flashes[i];
      f.r += dt * 90; f.a -= dt * 1.8;
      if (f.r >= f.max || f.a <= 0) { st.flashes.splice(i, 1); continue; }
      c.strokeStyle = 'rgba(255,150,90,' + Math.max(0, f.a).toFixed(3) + ')'; c.lineWidth = 2;
      c.beginPath(); c.arc(f.x, f.y, f.r, 0, Math.PI * 2); c.stroke();
    }
  }

  // ---------- 测试2：（空，待新内容）----------
  // 2026-10-13 用户要求清空：原「装甲触发效果 预览工作区」八稿四卡演示（最终壁垒免死全程 /
  // 天枢圣卫圣守窗口全程 / 触发图标放大对比 / 澄月暴走护盾全程，2026-10-09 建，wg2 帧驱动）
  // 整页清空——页签保留、点击显示空白，后续填充新内容（同 test3 空页先例）。
  function renderInfoTest2() {
    infoBody.innerHTML = '';
  }

  function openInfoModal() {
    infoModal.classList.remove('hidden');
    buildInfoTabs();
  }

  // 是否存在可返回的图鉴来源（暂停面板「返回上一步」显示条件之一）
  function encyReturnAvailable() {
    return encReturn != null;
  }

  // 「返回上一步」跳转（14-main pauseBackBtn 调用，2026-10-11 修复：原先固定 openInfoModal，
  // 怪物图鉴发起的测试错误回到数值与机制图鉴）：按来源弹窗分流——
  // 'ency' → openEncyclopedia 后经 jumpToEncyEntry 恢复原分页与原条目详情（衍生级条目亦可正确展示）；
  // 'info' → 直接重开数值与机制图鉴（infoTab 状态保留，buildInfoTabs 自会按页签重渲染）
  function reopenEncySource() {
    if (!encReturn) return;
    if (encReturn.from === 'ency') {
      openEncyclopedia();
      if (encReturn.entry) jumpToEncyEntry(encReturn.entry);
    } else {
      openInfoModal();
    }
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
    buildInfoTabs, openInfoModal, closeInfoModal, renderInfoPilots, encyReturnAvailable, reopenEncySource,
    buildT3SpawnPlan, t3SpawnCardById,
  };