// 03b-affix：BOSS 击坠三选一词条系统（2026-11-09 实装）

  // 模块契约（并行修改请先读；node tools/check-names.js 静态强制校验 import/export）
  // 被依赖：04-spawn(4 名) 05-boss(9 名) 06-enemy(13 名) 07-player(19 名) 08-entities(7 名) 10-draw-world(1 名) 12-ui(11 名) 13-encyclopedia(6 名) 14-main(7 名)
  // 依赖：01-config-core 01-config-difficulty 01-config-loadout 02-core
  // 本文件写共享状态：state.paused（词条选择期间暂停主循环，12-ui togglePause 受 affixModalOpen 门控）
  // 加载序：本文件在 03-audio 之后、04-spawn 之前——下游 04/05/06/07/08/12/13/14 单向引用本模块；
  // 本模块严禁 import 下游模块（防循环依赖）——需要下游能力的词条（如生成道具）由 14-main 等下游侧消费 affixHas 实现

  import { CANVAS_H, CANVAS_W } from './01-config-core.js';
  import { diffMods, isPoem } from './01-config-difficulty.js';
  import { SUB_WEAPONS, PLANES, WINGMEN_CFG, ARMORS, MAX_BOMBS, berserkDuration, crystalShieldDur, currentPlane, currentWingman, currentArmor, currentSubWeapon } from './01-config-loadout.js';
  import { player, rand, spawnBlastRing, spawnParticles, state, xinRings, bossFlow, TOUCH_DEVICE } from './02-core.js';


  // ---------- 词条数据（2026-11-09 自 13-encyclopedia 迁入为运行时单一来源，文案逐字保留） ----------
  // 体系：每击败一个 BOSS 出现三个选项、每个选项一对词条，每对必定一好一坏、二者稀有度相同；必须选择且只能
  // 选择一个选项，选择后在本局游戏此后生效。稀有度＝难度五档（虚象/具象/真我/诗篇/长歌）。
  // 2026-11-06 改版（口径=合并追加，用户确认）：①诗篇难度每个选项内含两对词条（两对稀有度相同），选中即得两对；
  // ②所有难度下每个选项可单独至多刷新一次；③各档词条池合并追加（11-05 旧条目全部保留）+ 三处定点操作：
  //   · 「战机的火力等级不会再因为受击而减少」自具象级正面移至虚象级正面（「（改到虚象级）」为操作括注不入文案）；
  //   · 诗篇级负面「炮火先兆者替换」词条替换为「75% 概率替换 + 变体攻击间隔-20%」组合版（同上）；
  //   · 长歌级正面「升级道具」词条替换为「15~35s 掉落暴走道具」（同上）；
  //   · 新增特殊类绑定词条（AFFIX_SPECIAL，见数组后注释）。
  // 2026-11-09：诗篇级负面三处替换词条概率 75%→65%（用户改稿）；词条页版式改为逐词条独立条目卡。
  // 2026-11-17 改版（用户定稿）：诗篇难度不再每选项内嵌两对词条——改为分两次选择（每次一对），
  //   第一次选择后**仅被选选项位**换新的一对（另两个选项不动），再选一次；刷新次数不重置。
  // 2026-11-23 改版（用户定稿）：①刷新改为仅诗篇难度可用（每选项至多一次不变；其他难度不渲染刷新按钮）；
  //   ②选择动画——被选选项卡边框发亮 + 略微缩小（≈0.27s）后再结算（pickOptionAnimated）；
  //   ③杭方衍（0:good:5）改版见 07-player：特殊暴走被击中不再 +1s 延长，改「无敌时间内暴走不结束」（tick 冻结）；
  //   ④词条池新增真我级正面 3 条 / 具象级正面 13 条（占位批次，全部登记 AFFIX_UNIMPLEMENTED 不参与抽取、
  //   效果后续版本实装；绑定条件见 affixIdOfferable）+ 新增结局类词条 AFFIX_ENDING（无垠赠礼 end0，同上不实装）；
  //   ⑤affixText 扩展 textEncy（图鉴版文案出口 affixEncyText，13-encyclopedia 消费）。
  // 配套设计：删除驾驶员 东坤蝰 / 龚粥，其技能移入词条池（见 13-encyclopedia 页尾注）。
  // 文案纪律：以下正负面条目为用户逐字口述定稿，照录不得改写措辞（同图鉴 desc/lore 纪律）。
  // 2026-11-09 二轮改版：词条加 name 字段（**当前全部为占位名，待用户逐条定稿**，定稿后直接改 name 即可，
  // 图鉴/选择界面自动跟随）；good/bad 由字符串数组改为 {name, text} 对象数组（text = 用户逐字定稿文案，照录禁改）。
  const AFFIX_DESIGN = [
    { grade: '虚象级', color: '#7fe8c9',
      good: [
        { name: '萧杨杨', icon: '🎲', text: '每次升级波次等级时，均有1%概率触发一次抽卡。', textEncy: '每次升级波次等级时，均有1%概率触发一次抽卡。（萧杨技能）' },
        { name: '又春花', icon: '❤️', text: '战机血量增加25。' },
        { name: '恒则成', icon: '🔥', text: '每次升级波次等级时，有10%概率从场地下方朝上射出5个辛国栋之怒Lv4的火环。这几个火环之间均匀分布，中间的首先出现。' },
        { name: '侯琏琵', icon: '⚖️', text: '战机单次受到的伤害不会再超过50。' },
        { name: '苏沐哲', icon: '🔒', text: '战机的火力等级不会再因为受击而减少。' },   // 2026-11-06 自具象级正面移入（原括注「（改到虚象级）」为操作指示不入文案）
        { name: '杭方衍', icon: '😤', text: '战机处于无敌时间时启动暴走状态。', textEncy: '战机处于无敌时间时启动暴走状态。（处于护盾时不启动，另外这个特殊的暴走状态结束后仍回到原来的火力等级+这段时间拾取的升级套件等级，暴走期间被击中不会延长暴走时长，但无敌时间内暴走不会结束）' },   // 图鉴括注 2026-11-23 用户定稿：末句止于「不会结束」（机制细节「倒计时在无敌期间走完时持续至无敌时间结束」不写入文案——实现在 07-player tick 钳 0 门控）
        { name: '张黄昏', icon: '💥', text: '战机受到伤害时，立刻对周围250px内所有敌人造成40倍等同伤害。', textPoem: '战机受到伤害时，立刻对周围250px内所有敌人造成80倍等同伤害。', textEncy: '战机受到伤害时，立刻对周围250px内所有敌人造成40倍等同伤害。（诗篇难度提高至80倍）' },   // 实机：text/textPoem 按难度动态显示（affixText）；图鉴：textEncy 固定原带括号详细版（2026-11-23 用户定稿双版分开）
        { name: '予临翎', icon: '⭐', text: '时空允诺的每轮射弹有0.5%全部转化为捣蛋来袭的导弹。', textEncy: '时空允诺的每轮射弹有0.5%全部转化为捣蛋来袭的导弹。（仅在选择时空允诺时会出现这个词条）' },
        { name: '夏郢陵', icon: '🚀', text: '混乱将至的每轮射弹有0.5%全部转化为捣蛋来袭的导弹。', textEncy: '混乱将至的每轮射弹有0.5%全部转化为捣蛋来袭的导弹。（仅在选择混乱将至时会出现这个词条）' },
      ],
      bad: [
        { name: '完濠壕', icon: '🧱', text: '坚垒护卫艇受到的所有伤害降低25%。' },
        { name: '祝天罡', icon: '⚔️', text: '幽暮突击艇改为连续攻击两次。' },
        { name: '李耀', icon: '🐲', text: '威龙的射弹改为有随机的10度偏移。' },
        { name: '侯訾', icon: '🔮', text: '法术阵列和脉冲矩阵被击坠时，额外召唤一个法术矩阵。' },
        { name: '玛灵鼠', icon: '⚠️', text: '每次波次等级升级时，均有5%召唤一个先导炮火先兆者。' },
        { name: '陈振躯', icon: '🫥', text: '所有BOSS登场时，有20%概率获得2s虚化护盾，有20%概率获得5s虚化护盾。' },
        { name: '方苟辟', icon: '🏃', text: '所有敌人的入场速度和入场速度的对应加速度均提高20%。' },   // 2026-11-10 新增（原虚象末位「张丈天」+40% 移至具象级 bad；本条占其索引位 id 0:bad:6，强度 ×1.2）
      ] },
    { grade: '具象级', color: '#ffd166',
      good: [
        { name: '龚粥', icon: '❤️‍🩹', text: '所有量子护盾道具变为血量增加道具，但所有血量增加道具回复量改为25%血量。', textEncy: '所有量子护盾道具变为血量增加道具（不受掉落限制），但所有血量增加道具回复量改为25%血量。' },
        { name: '封夜', icon: '🛸', text: '所有增生侧翼艇不再召唤卫护飞船。' },
        { name: '布药莲', icon: '📦', text: '拾取任意道具时，均有10%概率在顶部生成一个同类道具。', textEncy: '拾取任意道具时，均有10%概率在顶部生成一个同类道具。（额外生成的爆弹不受掉落限制）' },
        { name: '金木木', icon: '💎', text: '所有BOSS血量降至40%时必定掉落一个结晶护盾，但结晶护盾的持续时长减少0.5s。' },
        { name: '俊隽', icon: '👁️', text: '战机有20%概率闪避攻击。' },
        { name: '离螱', icon: '🛡️', text: '战机每次击坠BOSS时获得5层伤害减免，每层减少12%受到的伤害。（至多5层）' },
        { name: '墨璃', icon: '⏳', text: '拾取水晶能够延长结晶护盾的持续时长，至多通过此种方式延长2s。', textEncy: '拾取水晶能够延长结晶护盾的持续时长，至多通过此种方式延长2s。（仅在有途径召唤结晶护盾时出现本词条）' },
        // ↓ 2026-11-23 用户批次新增十三条绑定词条（同日实装，口径同真我级三条：占位名=绑定装备名待定稿、
        //   icon emoji 占位、括注不入 text；绑定判定见 affixIdOfferable——1:good:7~10 副武器 / 1:good:11~19 装甲）；
        //   实装落点：1:good:7 击坠加穿透=08-entities 通用命中区 / 1:good:8 烧弹=07-player updateXinRings /
        //   1:good:9 飞剑掷点=08-entities 通用命中区 / 1:good:10 捣蛋瞄准=07-player launchDaodanMissile /
        //   1:good:11 铜皮减伤与 1:good:13 祈星=07-player damagePlayer / 1:good:12 随机消弹=06-enemy killEnemy /
        //   1:good:14 时流之洄恢复=damagePlayer 累计 + killEnemy 结算 / 1:good:15 澜心满格=updatePilotStatus /
        //   1:good:16 免死暴走=affixBulwarkOnTrigger / 1:good:17 无敌+0.3s=各授予点 affixInvulnAdd /
        //   1:good:18 澄月概率=tryChengyueShield / 1:good:19 炽心半径=灼烧判定与绘制
        { name: '极夜流光', icon: '🔆', text: '极夜流光发射的光束如果直接击坠敌人，则可以额外造成一次无衰减的穿透。' },   // 1:good:7 绑定副武器极夜流光
        { name: '辛国栋之怒', icon: '🌋', text: '辛国栋之怒的火环有5%概率烧毁非BOSS敌机的射弹。' },   // 1:good:8 绑定副武器辛国栋之怒；实装注意：每个敌机射弹仅能被所有火环判定一次
        { name: '无界飞剑', icon: '🗡️', text: '无界飞剑有10%概率造成200%伤害，对黑色敌人的概率提高到30%。' },   // 1:good:9 绑定副武器无界飞剑
        { name: '捣蛋来袭', icon: '🎯', text: '捣蛋来袭发射的导弹不再直射，而是瞄准场上生命值最高的敌人发射。' },   // 1:good:10 绑定副武器捣蛋来袭
        { name: '铁皮夏勇', icon: '🦾', text: '受到的伤害降低10%，有50%概率改为降低20%。' },   // 1:good:11 绑定装甲铜皮夏勇（词条名照录用户原稿「铁皮夏勇」，占位待定稿）
        { name: '群星之歌', icon: '✨', text: '群星之歌消除子弹时，额外随机消除一颗敌方射弹。' },   // 1:good:12 绑定装甲群星之歌
        { name: '祈星', icon: '🍀', text: '祈星触发时使伤害减少60%。' },   // 1:good:13 绑定装甲祈星
        { name: '时流之洄', icon: '⏪', text: '时流之洄击坠曾对自身造成过伤害的敌人时，有10%概率恢复其对自身造成的所有伤害。' },   // 1:good:14 绑定装甲时流之洄
        { name: '七日澜心', icon: '🌸', text: '七日澜心在充能满时，立刻清除周围250px的敌方射弹。' },   // 1:good:15 绑定装甲七日澜心；实装注意：清除演出为粉色冲击波形式
        { name: '最终壁垒', icon: '🔺', text: '最终壁垒触发时立刻进入暴走。' },   // 1:good:16 绑定装甲最终壁垒
        { name: '天枢圣卫', icon: '🕐', text: '战机无敌时长增加0.3s。' },   // 1:good:17 绑定装甲天枢圣卫
        { name: '澄月', icon: '🌙', text: '澄月触发的概率增加5%。' },   // 1:good:18 绑定装甲澄月
        { name: '炽心', icon: '♨️', text: '炽心的火环半径增大35%。' },   // 1:good:19 绑定装甲炽心
      ],
      bad: [
        { name: '穆毅', icon: '🟠', text: '橙旋侧翼艇的子弹环绕半径扩大至1.5~2.2倍。' },
        { name: '龙凌', icon: '🌕', text: '赤月侧翼艇的逻辑改为登场后每1s发射一枚子弹，每次射击后射击间隔-0.1s，最多减少到0.2s。' },
        { name: '玄浩航', icon: '⚡', text: '紫电侧翼艇现在同时拥有黄芒侧翼艇的能力，即入场 1.2~2.8s 后追踪玩家方向射出一发子弹。' },
        { name: '黎宇', icon: '🌟', text: '黄芒侧翼艇现在发射三发散弹，子弹间的夹角为随机20~30度。' },
        { name: '时少凯风', icon: '⬆️', text: '下一个BOSS得到小幅增强。' },
        { name: '王妍', icon: '🏹', text: '赤红突击艇等1A级突击艇的首次攻击间隔减少50%。' },
        { name: '霸彪', icon: '🔵', text: '矩阵类敌人的射弹尺寸增大20%。', textEncy: '矩阵类敌人（法术矩阵、法术阵列、战争矩阵，还有脉冲矩阵的扩散半径）的射弹尺寸增大20%。' },
        { name: '雷偷煦旭', icon: '↔️', text: '法术大师A1、法术大师A2在横移期间受到的所有伤害降低60%，且横向移动速度增大50%。', textEncy: '法术大师A1、法术大师A2在横移期间受到的所有伤害降低60%，且横向移动速度增大50%（不会导致出界）。' },
        { name: '朱蠕', icon: '⭕', text: '御4和铁砧同时能释放双方的光环。' },
        { name: '孙垚', icon: '❄️', text: '寒霜和焦香螺旋桨同时能释放双方的光环。' },
        { name: '百演螂', icon: '🪖', text: '所有炮火先兆者及其变体受到的伤害降低10%；导弹的预警时长减少0.5s。' },
        { name: '随世', icon: '🌊', text: '浮海飘航者、破片、破片U型登场时获得1.5s虚化护盾。' },
        { name: '逢殇', icon: '🩹', text: '战机受到的所有伤害提高20%。' },
        { name: '马大笑', icon: '🔁', text: '法术大师A2被击坠时召唤一个法术大师A1。', textEncy: '法术大师A2被击坠时召唤一个法术大师A1。（逻辑类似法术阵列召唤法术矩阵，旋转着出场）' },
        { name: '黎龘', icon: '🏆', text: '愧悔魂灵圣杯的血量增加60%。' },
        { name: '张丈天', icon: '🏃', text: '所有敌人的入场速度和入场速度的对应加速度均提高40%。' },   // 2026-11-10 自虚象级 bad 移入（追加末位 → id 1:bad:15；强度 ×1.4；同持方苟辟时取强）
      ] },
    { grade: '真我级', color: '#ff5a5a',
      good: [
        { name: '东坤蝰', icon: '⏱️', text: '暴走时长增加0.5s，每触发过一次暴走，这个时长就增加0.01s。' },
        { name: '段虓', icon: '🎖️', text: '每次升级波次等级时或BOSS血量每减少10%，都有4%生成一架斗志昂扬无人机；拥有斗志昂扬效果时，击坠敌人会立刻清除其发射的场上的所有弹幕；但斗志昂扬期间敌人的攻击间隔减少40%。' },   // 2026-11-23 用户定稿：删「其场发射的场上的」中误打的「场」字
        { name: '贾苏读', icon: '🔫', text: '副武器的射击间隔减少40%。' },
        { name: '规浩云', icon: '✈️', text: '僚机的射击间隔减少30%。' },
        { name: '李扶摇', icon: '🎯', text: '战机的攻击间隔减少20%。' },
        // ↓ 2026-11-23 用户批次新增三条绑定词条（同日实装）：占位名=绑定装备名（待用户定稿）、icon 为语义相近
        //   emoji 占位；文案括注「仅选择XX时出现」不入 text，绑定判定见 affixIdOfferable；
        //   实装落点：2:good:5 连锁=07-player 斩击击坠结算（affixStarsChainKill）/ 2:good:6 吸伤=08-entities
        //   白盾吸收点累计 affixBulwarkAbsorbDmg + 07-player fan 轮启动 affixBulwarkTakeBonus 消费 /
        //   2:good:7 黑洞时长=07-player 群星之扉免伤分支 +0.5s
        { name: '群星之杀', icon: '💫',
          text: '群星之杀击坠敌机时，10%概率对周围200px内随机一个敌人造成相当于被击坠敌人100%最大生命值的连锁伤害，该伤害同样可进行连锁。',
          textEncy: '群星之杀击坠敌机时，10%概率对周围200px内随机一个敌人造成相当于被击坠敌人100%最大生命值的连锁伤害。这个连锁伤害同样可以触发这个10%判定。' },   // 2:good:5 绑定机型群星之杀；双文案分工（2026-11-23 用户纠正）：text=游戏实机（简版）/ textEncy=数值与机制图鉴（详细版）；已实装（07-player 斩击击坠结算——仅最后一击为群星之杀本体所为才判定，连锁击坠递归再判）
        { name: '群星守愿', icon: '🧲', text: '群星守愿能够吸收敌方射弹（包括光束等）的伤害，在下一次发射时将该伤害加到每颗群星守愿射弹的基础伤害上。' },   // 2:good:6 绑定僚机群星守愿
        { name: '群星之扉', icon: '🕳️', text: '群星之扉的黑洞持续时长增加0.5s。' },   // 2:good:7 绑定装甲群星之扉
      ],
      bad: [
        { name: '东方落雪', icon: '🦠', text: '所有白影侧翼艇替换为增生侧翼艇。' },
        { name: '贾德茗', icon: '⏫', text: '下一个BOSS得到大幅增强。' },
        { name: '桀煌', icon: '🔴', text: '所有红色敌人的攻击间隔减少30%（对BOSS效果减半）。' },
        { name: '郑宣沐', icon: '🟡', text: '所有黄色敌人登场时均获得200屏障（对BOSS效果减半）。' },
        { name: '於樾', icon: '💭', text: '虚幻的攻击范围和爆炸范围扩大30%，持续时长增加8s；虚幻和寒霜的减速区域范围扩大30%。' },
        { name: '義灏玺', icon: '🐦', text: '暴鸰和暴鸰·G的血量和攻击力翻倍。', textEncy: '暴鸰和暴鸰·G的血量和攻击力（对敌我双方的攻击力均）翻倍。' },
        { name: '凌涟翌', icon: '💢', text: '所有赤红战舰等3A类战舰，释放技能后有10%概率使得下一次攻击间隔减少80%。', textEncy: '所有赤红战舰等3A类战舰，释放技能后有10%概率使得下一次攻击间隔减少80%。（跟其他乘区为乘算关系，也即乘0.2）' },
        { name: '刘重天', icon: '🔄', text: '所有赤红主力舰等4A类主力舰，释放技能完毕后均会立刻再释放一轮同种技能。', textEncy: '所有赤红主力舰等4A类主力舰，释放技能完毕后均会立刻再释放一轮同种技能（技能间隔按照后面那一轮技能结束再开始算）。' },
        { name: '逢离歌', icon: '📉', text: '战机血量上限减少35。' },
        { name: '应堕', icon: '💣', text: '高能爆弹和绷绷炸弹的伤害降低80%。' },
        { name: '王东阳', icon: '🎒', text: '高能爆弹和绷绷炸弹的携带上限减少1（不会低于1）。' },
        { name: '陈斯羽', icon: '⬇️', text: '所有赤红突击艇等2A级突击艇和护卫艇的停留位置下移随机20%~30%屏幕高度。' },
        { name: '奕巽', icon: '👑', text: '所有4S敌人的攻击间隔减少20%，且技能获得增强。' },
      ] },
    { grade: '诗篇级', color: '#c084fc',
      good: [
        { name: '天爵', icon: '🗡️', text: '所有自侧翼出现的敌人受到的伤害提高150%。' },
        { name: '慕容爵', icon: '🪃', text: '战机碰到敌方导弹时不受伤，并且将之弹反，可以对敌人造成大量伤害。' },
        { name: '逢淞', icon: '🧊', text: '累计命中敌人20次或者累计造成2500伤害后，立刻使敌人冻结随机1.5~2s。', textEncy: '累计命中敌人20次或者累计造成2500伤害后，立刻使敌人冻结随机1.5~2s。（冻结：颜色变深蓝，立刻停止移动、攻击和技能，失去虚化护盾和所有减伤。焦香螺旋桨、御4等力场型敌人在被冻结后光环暂时消失且失去效果；焦香螺旋桨冻结复原后永久失去自身所有光环效果；寒霜和虚幻无法被冻结）' },
        { name: '王宇都', icon: '🥧', text: '击坠敌人时，有概率朝上发射一个大蛋挞，对接触到的敌人造成大量伤害。' },
      ],
      bad: [
        { name: '帝千邪', icon: '🟣', text: '所有紫色敌人被击坠时，朝下释放一颗子弹。', textEncy: '所有紫色敌人被击坠时，朝下释放一颗子弹。（逻辑同紫电侧翼艇；紫色敌人包括卫护飞船，不包括任何长歌级敌人；紫电侧翼艇这种已经有一颗子弹亡语的不再有这个词条）' },
        { name: '翔太初', icon: '⬆️', text: '所有BOSS均得到小幅增强。' },
        { name: '祝陨穹', icon: '🔀', text: '炮火先兆者、先导炮火先兆者生成时，均有75%概率随机替换为中枢炮火先兆者和极夜炮火先兆者。所有中枢炮火先兆者和极夜炮火先兆者的攻击间隔减少20%。' },   // 2026-11-06 替换旧「随机替换」词条（原括注为操作指示不入文案）；2026-11-09 概率 75%→65%；2026-11-23 用户定稿 65%→75%（实现同步 04-spawn）
        { name: '孤落', icon: '👻', text: '每次波次等级提升时均有7%概率召唤一个战争幽灵，且所有战争幽灵的技能释放间隔改为固定0.4s。' },   // 2026-11-23 用户定稿概率 5%→7%（实现同步 14-main）
        { name: '西门诩', icon: '🎭', text: '战争矩阵现在每次攻击时同时释放两个技能，但攻击间隔增大0.5s。' },
        { name: '叶星凡', icon: '🦋', text: '浮海飘航者、破片、破片U型生成时，均有75%概率替换为破茧之梦。所有破茧之梦的移动速度提升30%。' },   // 2026-11-23 用户定稿概率 65%→75%（实现同步 04-spawn）
        { name: '杉蔚硙', icon: '⏸️', text: '暴鸰、暴鸰·G、虚幻生成时，均有75%概率替换为静滞虚幻。所有静滞虚幻的移动速度提升30%。' },   // 2026-11-23 用户定稿概率 65%→75%（实现同步 04-spawn）
      ] },
    { grade: '长歌级', color: '#ff9d3c',
      good: [
        { name: '归海泷烽', icon: '🎁', text: '场上每随机15~35s掉落一个暴走道具。' },   // 2026-11-06 替换旧「升级道具 50% 变暴走」词条（原括注为操作指示不入文案）
        { name: '沐景', icon: '💠', text: '每次受到伤害后立刻触发结晶护盾。' },
        { name: '陈幻世', icon: '🧹', text: '击坠敌人时，40%概率立刻消除其残留在场上的所有弹幕。' },
        { name: '令雨汐', icon: '🚫', text: '禁用所有敌人的亡语效果，禁用所有虚象级、真我级、长歌级的负面词条，所有S类敌人的血量减少95%。', textEncy: '禁用所有敌人的亡语效果，禁用所有虚象级、真我级、长歌级的负面词条，所有S类敌人（包括4S和5S等）的血量减少95%。拥有这个词条时，后续选择词条页面的对应不生效的负面词条会被划掉。' },   // 2026-11-23 用户定稿：实机去尾句；图鉴 textEncy 回退原带括号详细版
      ],
      bad: [
        { name: '朱天', icon: '⏫', text: '所有BOSS均得到大幅增强。' },
        { name: '鸠', icon: '⏩', text: '所有敌人的提前3s进入暴怒。' },   // 2026-11-23 用户定稿照录：「停留降低攻击间隔」设定新称「暴怒」（仅本条文案改称，机制语义不变）；「的」字疑多待用户确认
        { name: '罗弋', icon: '🩸', text: '战机受到的所有伤害提高70%。' },
        { name: '嬴乾', icon: '🚨', text: '高危波次的刷新概率大幅增加。' },
        { name: '翙', icon: '🤖', text: '每次波次等级提升时均有8%概率召唤一个随机的强化4S敌人。' },
        { name: '王未焚', icon: '💀', text: '所有敌人被击坠时，向其朝向方向释放一颗子弹。', textEncy: '所有敌人被击坠时，向其朝向方向释放一颗子弹。（子弹逻辑同紫电侧翼艇的亡语）' },
        { name: '郗若', icon: '🆘', text: '所有BOSS敌人血量首次低于50%时，召唤一名随机的4S敌人协同作战。' },
      ] },
  ];

  // 特殊类绑定词条（2026-11-06 新增）：好/坏效果绑定成对出现（不参与好/坏独立抽取，整对绑定登场）；
  // 即使诗篇难度（每选项两对词条）下，每个选项也仅会出现一对特殊词条（对名 2026-11-10 用户定稿；
  // 正负面不设独立名字——用户定稿，仅显示对名 + 正面/负面文案）
  const AFFIX_SPECIAL = [
    { name: '纵逭灭',
      good: { icon: '♾️', text: '战机可以永久保持暴走状态。', textEncy: '战机可以永久保持暴走状态（此时右下角不再显示读条）。' },
      bad: { icon: '🌀', text: '所有敌人的攻击间隔减少75%。' } },
    { name: '澪叶',
      good: { icon: '🏎️', text: '战机的移动速度提高50%。' },
      bad: { icon: '🐌', text: '所有敌方子弹的弹速降低50%。' } },
  ];

  // 结局类绑定词条（2026-11-23 用户定稿登记，后续版本实装）：同特殊类——每个是一对（正/负面成对出现），
  // 对结局词条的选择将直接影响游戏结局；仅在特殊情况出现、不进词条池（不参与抽取与刷新）。
  // 出场设定（仅登记、未实装）：无垠赠礼仅在第三轮 BOSS 被击坠时出现——替换掉第三个选项，且无法被刷新。
  // 负面括注效果（实战中不出现，仅登记未来实装说明）：击坠第五轮 BOSS 后不通关，新增第六轮 BOSS 无垠月海
  // 及其前置等级，击坠无垠月海后通关；除此之外，立刻随机获得一个长歌级负面词条。
  const AFFIX_ENDING = [
    { name: '无垠赠礼',
      good: { icon: '🌙', text: '战机生命值、造成的伤害、移动速度增加3%。' },
      bad: { icon: '🌑', text: '无垠的彼方有群月升起...' } },   // 省略号为文案一部分照录；括注效果不入文案
  ];

  // ---------- 暂缓放出词条登记（2026-11-09 首批实装） ----------
  // id 规则：`档位序号:good|bad:条目序号`（档位 0虚象 1具象 2真我 3诗篇 4长歌）；特殊对用 `sp0` / `sp1`。
  // 登记语义：①不参与抽取（rollPair 已过滤）；②图鉴词条页标题加 * 标记（13-encyclopedia renderInfoAffix 消费）。
  // 登记情形：B=已实装但设计未定稿（实现代码保留，用户确定后移出即放出）。
  // 1:bad:14 愧悔魂灵圣杯（具象级，+60%）已于 2026-11-10 随占位敌人圣杯实装移出（见 04-spawn makeEnemy 血量钩子）；
  // 3:bad:5 叶星凡（破茧替换）/ 3:bad:6 杉蔚硙（静滞替换）已于 2026-11-11 随占位敌人破茧之梦 / 静滞虚幻实装移出
  //（65% 生成替换见 04-spawn spawnPopian/spawnVoyager/spawnBaoling 系入口，移速 +30% 见 spawnCocoonDream/spawnStasisUnreal speedMul）；
  // 4:bad:3 嬴乾（高危频发）已于 2026-11-11 效果定稿实装移出（波次 tier 权重修正见 01-config-spawn waveAffixTierW，
  // 侧翼触发概率与额外波次追加见 pickPoemFlankCard / 14-main affixExtraWaveBurst；原 affixDangerWaveMul ×5 占位退役）；
  // 敌人颜色类三条（2:bad:2 红色狂潮 / 2:bad:3 黄金壁垒 / 3:bad:0 帝千邪紫色亡语）已于 2026-11-17 随
  // enemyColorTags 九色体系定稿实装移出（实现早已就位：enemyFireIvMul ×10/7 / updateEnemies 懒施加 200 屏障 +
  // 通用护罩渲染 / killEnemy 紫色亡语钩子，移出即恢复入池；战争矩阵裸 dt 与 4S 精英 eliteSkillGap 两处
  // 红色覆盖缺口同日补接，见 06-enemy；S 类/长歌级敌人颜色修正减半见 06-enemy affixColorHalf）；
  // BOSS 增强类四条（1:bad:4 / 2:bad:1 / 3:bad:1 / 4:bad:0）已于 2026-11-17 随用户数值定稿
  //（小幅 HP+20%/伤害+20%/间隔-20%，大幅 HP+40%/伤害+50%/间隔-40%）实装移出——见上方 affixNextBoss 快照体系。
  // 此后暂缓表常空（新暂缓项随批次在此登记）。
  // 2026-11-23 用户批次登记：真我级正面 3 条（2:good:5~7）+ 具象级正面 13 条（1:good:7~19）已于同日
  // 随用户「全部实装」指令实装移出（各效果消费点见各条目旁注释与 02/04/05/06/07/08 模块挂点）——
  // 仅结局词条 end0（无垠赠礼）保持登记：结局类不进词条池、后续版本随结局系统实装。
  const AFFIX_UNIMPLEMENTED = new Set(['end0']);

  // 词条文案按难度动态显示（2026-11-23 用户定稿，张黄昏 0:good:6 首个使用者）：
  // 条目可携带可选 textPoem 字段（诗篇难度文案）；affixText 统一出口——诗篇且有 textPoem 时返回诗篇版，
  // 否则返回基础 text。消费点：03b 选择界面/温酒客与九克之王开局模态/暂停页快照 + 13-encyclopedia 词条页
  function affixText(t) {
    return isPoem() && t && t.textPoem ? t.textPoem : (t ? t.text : '');
  }

  // 图鉴版文案出口（2026-11-23 新增）：条目可携带可选 textEncy 字段（数值与机制图鉴展示用，优先于基础 text）；
  // 游戏内选择界面 / 温酒客与九克之王开局模态 / 暂停页快照仍走 affixText——仅 13-encyclopedia 词条页消费本函数。
  // 2026-11-23 二轮（用户定稿「实机/图鉴两版分开」）：19 条去括号文案条目（含纵逭灭特殊对 good）逐条回填
  // textEncy = 原带括号详细版（照录 fdc8c6f 基线原稿）——实机 text 保持去括号版不变，图鉴回退显示详细版
  function affixEncyText(t) {
    return t && t.textEncy ? t.textEncy : affixText(t);
  }

  // 绑定词条出场条件（0:good:7/8 文案括注定稿「仅在选择时空允诺/混乱将至时会出现这个词条」——
  // 2026-11-11 僚机「群星允诺」更名「时空允诺」，括注装备名随更名同步；绑定判定按 id 不变）：
  // 仅当当前僚机为时空允诺（stars）/ 当前机型为混乱将至时才入抽取池
  function affixIdOfferable(id) {
    if (id === '0:good:7') return currentWingman === WINGMEN_CFG.stars;
    if (id === '0:good:8') return currentPlane === PLANES.chaos;
    // ↓ 2026-11-23 批次绑定条件（这些词条当前为占位批次未实装、不参与抽取——条件先行登记，
    //   移出 AFFIX_UNIMPLEMENTED 放出时即按此生效）
    if (id === '2:good:5') return currentPlane === PLANES.starslayer;   // 群星之杀连锁：仅机型群星之杀
    if (id === '2:good:6') return currentWingman === WINGMEN_CFG.bulwark;   // 群星守愿吸伤：仅僚机群星守愿
    if (id === '2:good:7') return currentArmor === ARMORS.starsGate;   // 群星之扉黑洞：仅装甲群星之扉
    if (id === '1:good:7') return currentSubWeapon === SUB_WEAPONS.jixing;   // 极夜流光
    if (id === '1:good:8') return currentSubWeapon === SUB_WEAPONS.xinring;   // 辛国栋之怒
    if (id === '1:good:9') return currentSubWeapon === SUB_WEAPONS.feijian;   // 无界飞剑
    if (id === '1:good:10') return currentSubWeapon === SUB_WEAPONS.daodan;   // 捣蛋来袭
    if (id === '1:good:11') return currentArmor === ARMORS.tongpi;   // 铜皮夏勇
    if (id === '1:good:12') return currentArmor === ARMORS.watch;   // 群星之歌
    if (id === '1:good:13') return currentArmor === ARMORS.qixing;   // 祈星
    if (id === '1:good:14') return currentArmor === ARMORS.hui;   // 时流之洄
    if (id === '1:good:15') return currentArmor === ARMORS.lanxin;   // 七日澜心
    if (id === '1:good:16') return currentArmor === ARMORS.bulwark;   // 最终壁垒
    if (id === '1:good:17') return currentArmor === ARMORS.tianshu;   // 天枢圣卫
    if (id === '1:good:18') return currentArmor === ARMORS.chengyue;   // 澄月
    if (id === '1:good:19') return currentArmor === ARMORS.chixin;   // 炽心
    return true;
  }

  // ---------- 2026-11-23 批次词条运行时（16 条同日实装，消费点见各函数注释） ----------
  // 词条（具象级 1:good:17）天枢圣卫：无敌时长 +0.3s 加算——各无敌授予点表达式追加消费
  //（07-player 受击/闪避/重生、06-enemy 接触与受击、05-boss BOSS 接触；最终壁垒免死 5s 经
  // affixBulwarkOnTrigger 补加——02-core 不能反向 import 03b）
  function affixInvulnAdd() { return affixHas('1:good:17') ? 0.3 : 0; }

  // 词条（真我级 2:good:6）群星守愿吸伤：白盾吸收的敌方射弹伤害累计（08-entities 各吸收点调用）；
  // 群星守愿下一轮扇形发射时定格加到本轮每颗射弹的基础伤害上（07-player 轮启动消费取走清零）
  let bulwarkAbsorbAcc = 0;
  function affixBulwarkAbsorbDmg(dmg) {
    if (affixHas('2:good:6') && dmg > 0) bulwarkAbsorbAcc += dmg;
  }
  function affixBulwarkTakeBonus() {
    const v = bulwarkAbsorbAcc;
    bulwarkAbsorbAcc = 0;
    return v;
  }

  // 词条（具象级 1:good:16 + 1:good:17）最终壁垒免死触发钩子（07-player damagePlayer / 06-enemy 各致死路径的
  // tryBulwarkCheatDeath()===true 分支调用）：①免死 5s 无敌 +0.3s（bulwarkFxT 菱形演出同步）；②立刻进入暴走
  //（weapon=5 + 满时长统一入口 affixBerserkDur）。返回 true = 本次触发了暴走——07-player 侧调用点据此补判
  // 澄月 tryChengyueShield()（06-enemy 无法反向 import 07-player，该侧容缺不判澄月——口径登记于此）
  function affixBulwarkOnTrigger() {
    if (affixHas('1:good:17')) {
      player.invuln += 0.3;
      if (player.bulwarkFxT != null) player.bulwarkFxT = player.invuln;   // 菱形演出与实际无敌时长同步（02-core tryBulwarkCheatDeath 同约定）
    }
    if (!affixHas('1:good:16') || player.weapon >= 5) return false;
    player.weapon = 5;
    player.hitCount = 0;   // 升满重置受击计数（口径同 pickupBerserk）
    player.berserk = affixBerserkDur();
    player.berserkBanner = 1.5;
    spawnParticles(player.x, player.y, '#ffb545', 26, 260);
    spawnBlastRing(player.x, player.y, 96, '#ffb545', 0.45);   // 暴走触发扩散环（berserkBursts 在 08-entities——03b 禁止反向 import 下游，演出改走 02-core 同款扩散环）
    return true;
  }

  // 档位名（抽取结果显示用；与 13-encyclopedia ENCY_GRADES 档位名一致）
  // 稀有度抽取：按 AFFIX_DRAW_WEIGHTS 档位/特殊加权（2026-11-10 用户定稿「先定」22/34/16/12/3/3，可调）
  const AFFIX_DRAW_WEIGHTS = [22, 34, 16, 12, 3, 3];   // 索引 0~4 = 档位（虚象/具象/真我/诗篇/长歌），5 = 特殊对
  // 词条内权重均为 1（rollPair 内 good/bad 实装池各自等权均匀抽取；后续调词条权重时在此结构上加权即可）


  // 词条（诗篇级 3:good:2）冰封：玩家侧命中/伤害计数（伤害结算处调用）。
  // 累计命中敌人 20 次或累计造成 2500 伤害后，立刻使该敌人冻结随机 1.5~2s 并清零双计数；
  // 寒霜/虚幻无法被冻结（文案口径）；BOSS 不冻结（「敌人」口径同 3:bad:0——不含长歌级，待定稿）；
  // 冻结行为（停移停攻停技 / 失去虚化减伤）见 06-enemy updateEnemies / 08-entities enemyDamageMul，
  // 渲染深蓝叠加见 09b-draw-enemies；御4/焦香光环暂消在 yu4AuraMul / playerFrost* / jiaoxiangBurn 消费点
  function affixFreezeNote(e, dmg) {
    if (!affixHas('3:good:2') || !e || e.dying || e.type === 'boss') return;
    state.affixFreezeHits += 1;
    state.affixFreezeDmg += dmg;
    if (state.affixFreezeHits < 20 && state.affixFreezeDmg < 2500) return;
    state.affixFreezeHits = 0;
    state.affixFreezeDmg = 0;
    if ((e.frozenT || 0) > 0) return;   // 已冻结不重复触发
    if (e.type === 'hanshuang' || e.type === 'unreal') return;   // 寒霜/虚幻免疫冻结
    if (e.phase > 0) e.phase = 0;   // 立刻失去虚化护盾
    e.frozenT = rand(1.5, 2);
    spawnParticles(e.x, e.y, '#4f7dd9', 16, 240);
  }

  // ---------- 运行时状态（本模块私有，注释标注归属域=词条域；跨域只读经导出函数） ----------
  const affixFlow = {
    pendingT: 0,        // >0：BOSS 击坠后延迟开选项的倒计时（06-enemy queueAffixSelection 置位，14-main tickAffixPending 消费）
    open: false,        // 选项界面是否开启（12-ui togglePause / 14-main 按键门控读）
    options: null,      // 当前三个选项 [{ pairs: [{gi, good, bad}], refreshed: false }]
    refreshed: [false, false, false],   // 每选项刷新次数（每选项至多 1 次）
    // 击坠 BOSS 伤害减免叠层（id 1:good:5）：击坠 +1 层（至多 5），每次实际受伤 -1 层
    bossShieldStacks: 0,
    // 暴走时长累积（id 2:good:0）：每次触发暴走 +0.01s（affixBerserkDur 内计数）
    berserkCount: 0,
    // 结晶护盾延长累计（id 1:good:6）：拾取水晶每次 +0.1s，总延长至多 2s（重获结晶护盾时清零）
    shieldExtAcc: 0,
    // 长歌级 15~35s 暴走道具掉落（id 4:good:0）：计时器 + 生成回调（14-main 注册，避免反向依赖 08-entities）
    berserkDropT: 0,
    berserkDropFn: null,
    // 档位权重门控判定源（2026-11-11）：最近击坠的 BOSS 身份 + 击坠时轮次（0-based，affixNoteBossKill
    // 调用点在 bossFlow.phase++ 之前）——击坠「第三轮的第二个（storm2 风暴编织者）」/「第五轮 BOSS」
    // 后的抽取中虚象/具象权重归零（见 affixTierWOverride）；openAffixSelection 时换算为会话级覆盖
    lastBossKillId: null,
    lastBossKillPhase: -1,
    // 本次抽取会话的档位权重覆盖（null = 用默认 AFFIX_DRAW_WEIGHTS；open 时算一次，close 时清空——
    // 会话内刷新沿用同一覆盖，同一次抽取规则一致）
    sessionTierW: null,
    // 诗篇两段式选择计数（2026-11-17）：本会话已选择次数——第 1 次选择后仅重建被选选项位（poemPickCount<2），
    // 第 2 次选择后关闭界面；open/close/reset 三处归零
    poemPickCount: 0,
    // 选择动画进行中标记（2026-11-23：边框发亮+缩小 ≈0.27s 后才结算；期间忽略重复点击）
    pickAnim: false,
  };

  // 本局已选词条 id 列表（affixHas 全局查询的唯一真源）
  const affixIds = [];

  // ---------- 一次性占用制 + 保底词条池（2026-11-26 用户定稿重构） ----------
  // affixUsedIds：全场占用表——词条页选过 / 温酒客开局抽走的词条 id 都算占用，不再出现在后续任何选项。
  // 特殊对按 'sp0'/'sp1' 同规则占用（rollSpecial 过滤）。保底项无限供应、不占池、不进占用表。
  const affixUsedIds = new Set();
  // 等级全占用 → 该等级抽取权重 ×0.4（用户定稿「当一个等级的词条（不管正面还是负面）抽完后」）
  const FALLBACK_TIER_W = 0.4;
  // ── 保底词条池（原「本体伤害阶梯 + 受伤阶梯」重构为随机池，原保底负面词条删除）──
  // 正面 8 条 / 负面 10 条：槽空时等权随机抽一条，效果值按抽取时所属等级 gi（0~4 = 虚象/具象/真我/诗篇/长歌）
  // 取档位 steps[gi]（用户纠正：档位由等级决定，非触发次数递进）。同一词条可重复抽中、效果累积；
  // 「增加百分之几」为加算叠加（两个+10% = +20%，消费侧统一 1+sum 乘区；间隔类为乘算累积 mul *= step）。
  // 移除阈值：来自本词条的累计效果达标（cap）后从池中移除不再被抽到——正常流程几乎抽不满，为无尽模式铺路。
  // 消费点总表：
  //   pos_mainGun   → affixMainGunDamageMul（08-entities 主炮弹结算，原保底正面保留入池）
  //   pos_maxHp     → pick 立即生效 + affixMaxHpDelta（重生补差）
  //   pos_wingCrit  → 07-player 僚机各模型轮启动掷点 + fire 函数本轮伤害 ×10
  //   pos_subIv     → affixSubIv（07-player 副武器开火）
  //   pos_dmgReduce → 07-player damagePlayer 统一入口平减
  //   pos_dropRate  → 06-enemy rollItemDrops 各掉率 ×(1+sum)
  //   pos_negReduce → buildOption 掷点（bad='skip'——本对负面词条数-1）
  //   pos_bomb      → pick（state.bombCapAdd +1 + bombs +1；仅正面池——2026-11-26 用户定稿）
  //   neg_negAdd    → buildOption 掷点（追加 bad2——本对负面词条数+1）
  //   neg_dmg       → 07-player damagePlayer 敌方伤害乘区 (1+sum)
  //   neg_firstIv   → 04-spawn makeEnemy initFire 生成侧 ×mul（仅新生成敌机）
  //   neg_iv        → 06-enemy enemyFireIvMul 流速 ×(1/mul)（间隔×mul 等效）+ 05-boss bossSkillIv 间隔 ×mul
  //   neg_hp        → 04-spawn makeEnemy hpMul ×(1+sum) + 05-boss 各 spawn hp
  //   neg_bulletSpd → 06-enemy pushEBullet + 05-boss pushBossBullet 弹速 ×(1+sum)
  //   neg_rushCd    → 06-enemy resetEnemyFireTimer 掷点（e.rushCd 每敌机 2 轮 CD，见该函数注释）
  //   neg_speed     → 04-spawn makeEnemy speedMul 初值 ×(1+sum)（加速度为各移动分支内部逼近率、无统一乘区，
  //                    仅实装速度；已生成敌机不追溯——生成层乘区杜绝中途速度瞬跳，速度曲线铁律）
  //   neg_undying   → 06-enemy killEnemy 开头掷点（hp=1 + e.ivHalved 永久间隔减半 + e.phase=3 复用虚化通道；
  //                    多形态/返场实体为新对象自然重掷，天然满足「无法影响下一形态」）
  //   neg_deathAttack → 06-enemy killEnemy 消弹后掷点（pushEBullet 朝玩家立刻攻击一发——同超越艇织夜亡语通道）
  const fbState = {
    pos_mainGunMul: 1,      // 本体伤害乘算累积
    pos_maxHpSum: 0,        // 生命值加算
    pos_wingCritSum: 0,     // 僚机 10 倍伤害概率（≥80% 移除）
    pos_subIvMul: 1,        // 副武器间隔乘算（≤0.4 移除）
    pos_dmgReduceSum: 0,    // 受伤平减（≥15 移除）
    pos_dropRateSum: 0,     // 道具掉落概率加算
    pos_negReduceSum: 0,    // 负面数-1 概率（≥80% 移除）
    neg_negAddSum: 0,       // 负面数+1 概率（≥80% 移除）
    neg_dmgSum: 0,          // 敌方伤害加算
    neg_firstIvMul: 1,      // 敌首次间隔乘算（≤0.4 移除）
    neg_ivMul: 1,           // 敌攻击间隔乘算（≤0.4 移除）
    neg_hpSum: 0,           // 敌血量加算
    neg_bulletSpdSum: 0,    // 敌弹速加算
    neg_rushCdSum: 0,       // 敌攻击后冲刺概率（≥80% 移除）
    neg_speedSum: 0,        // 敌速度加算
    neg_undyingSum: 0,      // 敌免死概率（≥80% 移除）
    neg_deathAttackSum: 0,  // 敌死前攻击概率（≥80% 移除）
  };
  const fbRemoved = new Set();   // 移除阈值达标的词条 key
  // 池条目：key / text(v) 展示文案（v=档位值）/ steps[gi] 档位 / pick(v) 落地累积 / cap() 阈值达标判定（缺省不移除）
  const FB_GOOD_POOL = [
    { key: 'mainGun', text: (v) => '我方战机本体伤害增加 ' + v + '%', steps: [8, 16, 24, 32, 40],
      pick: (v) => { fbState.pos_mainGunMul *= 1 + v / 100; } },   // 原保底正面保留入池（乘算叠加不封顶）
    { key: 'maxHp', text: (v) => '战机生命值增加 ' + v, steps: [8, 16, 24, 32, 40],
      pick: (v) => { fbState.pos_maxHpSum += v; player.maxHp += v; player.hp += v; } },   // 立即生效（同 0:good:1 口径）；重生经 affixMaxHpDelta 补差
    { key: 'wingCrit', text: (v) => '僚机每轮发射时，有 ' + v + ' 概率使本轮造成10倍伤害', steps: ['2%', '4%', '6%', '8%', '10%'],
      pick: () => { fbState.pos_wingCritSum += 0.02; }, cap: () => fbState.pos_wingCritSum >= 0.8 },
    { key: 'subIv', text: (v) => '副武器的发射间隔*' + v, steps: [0.93, 0.86, 0.79, 0.72, 0.65],
      pick: (v) => { fbState.pos_subIvMul *= v; }, cap: () => fbState.pos_subIvMul <= 0.4 },
    { key: 'dmgReduce', text: (v) => '战机受到的所有伤害减少 ' + v, steps: [1, 2, 3, 4, 5],
      pick: (v) => { fbState.pos_dmgReduceSum += v; }, cap: () => fbState.pos_dmgReduceSum >= 15 },
    { key: 'dropRate', text: (v) => '所有道具的掉落概率增加 ' + v, steps: ['5%', '10%', '15%', '20%', '25%'],
      pick: () => { fbState.pos_dropRateSum += 0.05; } },
    { key: 'negReduce', text: (v) => '选择词条时，有 ' + v + ' 使得选择词条对时的负面词条数减少1', steps: ['5%', '10%', '15%', '20%', '25%'],
      pick: () => { fbState.pos_negReduceSum += 0.05; }, cap: () => fbState.pos_negReduceSum >= 0.8 },
    { key: 'bomb', text: () => '立刻获得1个高能爆弹，并使得高能爆弹的上限增加1', steps: [null, null, null, null, null],
      pick: () => {
        state.bombCapAdd = (state.bombCapAdd || 0) + 1;   // 上限永久 +1（与绷绷背包同通道，02-core 归域）
        player.bombs = Math.min((player.bombs || 0) + 1, Math.max(1, (diffMods().bombCap ?? MAX_BOMBS) + (state.bombCapAdd || 0) - (affixHas('2:bad:10') ? 1 : 0)));
      } },   // 无累积效果值（一次性获得）；仅正面池——2026-11-26 用户定稿
  ];
  const FB_BAD_POOL = [
    { key: 'negAdd', text: (v) => '选择词条时，有 ' + v + ' 使得选择词条对的负面词条数增加1', steps: ['8%', '16%', '24%', '32%', '40%'],
      pick: () => { fbState.neg_negAddSum += 0.08; }, cap: () => fbState.neg_negAddSum >= 0.8 },
    { key: 'dmg', text: (v) => '敌方造成的伤害增加 ' + v, steps: ['10%', '20%', '30%', '40%', '50%'],
      pick: () => { fbState.neg_dmgSum += 0.10; } },   // 加算叠加（两个+10%=+20%，消费侧 1+sum）
    { key: 'firstIv', text: (v) => '敌方首次攻击间隔*' + v, steps: [0.9, 0.8, 0.7, 0.6, 0.5],
      pick: (v) => { fbState.neg_firstIvMul *= v; }, cap: () => fbState.neg_firstIvMul <= 0.4 },
    { key: 'iv', text: (v) => '敌方攻击间隔* ' + v, steps: [0.94, 0.88, 0.82, 0.76, 0.7],
      pick: (v) => { fbState.neg_ivMul *= v; }, cap: () => fbState.neg_ivMul <= 0.4 },
    { key: 'hp', text: (v) => '敌方生命值增加 ' + v, steps: ['6%', '12%', '18%', '24%', '30%'],
      pick: () => { fbState.neg_hpSum += 0.06; } },   // 加算叠加
    { key: 'bulletSpd', text: (v) => '敌方弹速增加 ' + v, steps: ['8%', '16%', '24%', '32%', '40%'],
      pick: () => { fbState.neg_bulletSpdSum += 0.08; } },
    { key: 'rushCd', text: (v) => '敌方攻击后，有 ' + v + ' 使得下一次攻击间隔*0.2（无法连续触发，每次触发后有2轮cd）', steps: ['6%', '12%', '18%', '24%', '30%'],
      pick: () => { fbState.neg_rushCdSum += 0.06; }, cap: () => fbState.neg_rushCdSum >= 0.8 },
    { key: 'speed', text: (v) => '敌方速度和加速度增加 ' + v, steps: ['10%', '20%', '30%', '40%', '50%'],
      pick: () => { fbState.neg_speedSum += 0.10; } },
    { key: 'undying', text: (v) => '敌方首次受到致命伤时有 ' + v + ' 不被击坠，攻击间隔永久减半（多形态敌人无法影响下一形态），并获得3s虚化护盾', steps: ['2%', '4%', '6%', '8%', '10%'],
      pick: () => { fbState.neg_undyingSum += 0.02; }, cap: () => fbState.neg_undyingSum >= 0.8 },
    { key: 'deathAttack', text: (v) => '敌方被击坠前有 ' + v + ' 立刻进行一次攻击', steps: ['5%', '10%', '15%', '20%', '25%'],
      pick: () => { fbState.neg_deathAttackSum += 0.05; }, cap: () => fbState.neg_deathAttackSum >= 0.8 },
  ];
  // 从池随机抽一条（阈值移除过滤；全池移除 → null——正常流程不可能，负面池 dmg/hp/bulletSpd/speed 无阈值兜底）
  function rollFallbackEntry(pool) {
    const avail = pool.filter(d => !fbRemoved.has(d.key));
    return avail.length ? avail[(Math.random() * avail.length) | 0] : null;
  }
  // 保底词条落地：按抽取时等级 gi 取档位累积 + 阈值判定移除（2026-11-26 用户纠正：档位由等级决定）
  function applyFallbackEntry(def, gi) {
    const v = def.steps[Math.min(gi, 4)];
    def.pick(v);
    if (def.cap && def.cap()) fbRemoved.add(def.key);
  }
  // 任意等级负面加权抽（bad2 追加用）：占用过滤 + 等级全占用降权 ×0.4（同 rollWenjiukeDebuffs 口径）；
  // 全等级 bad 槽耗尽 → 负面保底池顶上；再空（全移除）→ null
  function rollAnyBad() {
    const cands = [];
    for (let gi = 0; gi < AFFIX_DESIGN.length; gi++) {
      if (badGradeExhausted(gi)) continue;
      const w = gradeExhausted(gi) ? FALLBACK_TIER_W : 1;
      for (const bi of offerableBad(gi)) cands.push({ gi, bi, w });
    }
    if (!cands.length) {
      const def = rollFallbackEntry(FB_BAD_POOL);
      return def ? { fbKey: def } : null;
    }
    let r = Math.random() * cands.reduce((a, c) => a + c.w, 0);
    let pick = cands[cands.length - 1];
    for (const c of cands) { r -= c.w; if (r < 0) { pick = c; break; } }
    return { gi: pick.gi, bi: pick.bi };
  }

  // ---------- 温酒客开局 DEBUFF（2026-11-11 用户定稿效果重做；2026-11-26 保底池重构改道） ----------
  // 开局立刻获得 5 个随机负面：复用负面词条池 id 存独立数组（不进 affixIds，不污染词条页/图鉴快照）；
  // 结算全部经 affixHas 收口（含本数组）→ 失效 = 移除 id 即自动卸载全部效果。
  // 受令雨汐影响：抽取时跳过被禁等级（0/2/4 级，affixBadDisabled 判定），与词条页负面同口径。
  // 池空改走负面保底词条池（2026-11-26：预抽定词条按随机等级取档落地，原受伤阶梯退役）
  const wenjiukeAffixIds = [];
  // 双生 BOSS 轮次标记（暴风之眼 + 风暴编织者都击坠 = 一轮；旧日之歌不计）——失效引擎在 wenjiukeBossRoundKill
  const wjkTwinKilled = { storm: false, storm2: false };
  // 5 次抽签展示记录（与生效数组分离：被令雨汐禁用的占坑不生效、池空槽走保底——开局模态按此渲染不错位）
  const wjkDraws = [];


  // ---------- 查询接口 ----------
  // 词条（长歌级 4:good:3）词条禁用：虚象级/真我级/长歌级负面一律失效——affixHas 全局收口，
  // 已选的此类负面同样回溯失效（全部实装点均经 affixHas 查询，无需逐点加门）；选择瞬间的
  // 一次性结算（applyInstant，如血量上限）在 chooseOption 处直接跳过不登记，不做回溯冲账
  function affixBadDisabled(id) {
    return affixIds.includes('4:good:3') && /^[024]:bad:/.test(id);
  }
  // affixHas 全局收口：已选词条 + 温酒客开局 DEBUFF 两个真源（后者失效 = 数组移除即自动卸载全部结算）
  function affixHas(id) {
    if (id !== '4:good:3' && affixBadDisabled(id)) return false;
    return affixIds.includes(id) || wenjiukeAffixIds.includes(id);
  }

  // 玩家受到伤害乘区（负面：1:bad:12 受伤 +20% / 4:bad:2 受伤 +70%——乘算叠加；
  // 原保底负面受伤阶梯已删（2026-11-26 保底池重构））
  function affixPlayerDamageMul() {
    let mul = 1;
    if (affixHas('1:bad:12')) mul *= 1.2;
    if (affixHas('4:bad:2')) mul *= 1.7;
    return mul;
  }

  // 保底正面乘区（仅战机本体/主炮弹消费——08-entities 主炮结算处挂 b.mainGun 判定；僚机/副武器不乘）
  function affixMainGunDamageMul() {
    return fbState.pos_mainGunMul;
  }

  // ---------- 保底词条池查询接口（2026-11-26 新增，消费点见 fbState 定义处总表） ----------
  // 战机受到的所有伤害平减（pos_dmgReduce：乘区结算后固定减量，下限 0——07-player damagePlayer 消费）
  function affixPlayerFlatReduce() { return fbState.pos_dmgReduceSum; }
  // 敌方造成的伤害加算乘区（neg_dmg：07-player damagePlayer 统一入口消费——敌方伤害全走该入口）
  function affixEnemyDmgAdd() { return fbState.neg_dmgSum; }
  // 敌方首次攻击间隔乘算（neg_firstIv：04-spawn makeEnemy 生成侧消费——仅新生成敌机）
  function affixEnemyFirstIvMul() { return fbState.neg_firstIvMul; }
  // 敌方攻击间隔乘算（neg_iv：06-enemy enemyFireIvMul 流速 ×1/mul + 05-boss bossSkillIv 间隔 ×mul）
  function affixEnemyIvMul() { return fbState.neg_ivMul; }
  // 敌方生命值加算乘区（neg_hp：04-spawn makeEnemy hpMul + 05-boss 各 spawn hp）
  function affixEnemyHpAdd() { return fbState.neg_hpSum; }
  // 敌方弹速加算乘区（neg_bulletSpd：06-enemy pushEBullet + 05-boss pushBossBullet）
  function affixEnemyBulletSpdAdd() { return fbState.neg_bulletSpdSum; }
  // 敌方速度加算乘区（neg_speed：04-spawn makeEnemy speedMul 初值——加速度无统一乘区仅实装速度）
  function affixEnemySpeedAdd() { return fbState.neg_speedSum; }
  // 僚机每轮 10 倍伤害概率（pos_wingCrit：07-player 僚机各模型轮启动掷点）
  function affixWingCritChance() { return fbState.pos_wingCritSum; }
  // 道具掉落概率加算乘区（pos_dropRate：06-enemy rollItemDrops）
  function affixDropRateAdd() { return fbState.pos_dropRateSum; }
  // 敌方攻击后冲刺概率（neg_rushCd：06-enemy resetEnemyFireTimer 掷点）
  function affixEnemyRushChance() { return fbState.neg_rushCdSum; }
  // 敌方首次致命伤免死概率（neg_undying：06-enemy killEnemy 开头掷点）
  function affixEnemyUndyingChance() { return fbState.neg_undyingSum; }
  // 敌方被击坠前立刻攻击概率（neg_deathAttack：06-enemy killEnemy 消弹后掷点）
  function affixEnemyDeathAttackChance() { return fbState.neg_deathAttackSum; }
  // 词条对负面数增减概率（buildOption 掷点：pos_negReduce → bad='skip' / neg_negAdd → 追加 bad2）
  function affixNegReduceChance() { return fbState.pos_negReduceSum; }
  function affixNegAddChance() { return fbState.neg_negAddSum; }

  // 单次伤害上限（虚象级 0:good:3：单次不超过 50）
  function affixDamageClamp(amount) {
    if (affixHas('0:good:3') && amount > 50) return 50;
    return amount;
  }

  // 闪避掷骰（具象级 1:good:4：20% 概率闪避）
  function affixDodgeRoll() { return affixHas('1:good:4') && Math.random() < 0.2; }

  // 血量上限修正（0:good:1 +25 / 2:bad:8 -35 / 保底池 pos_maxHp 加算累积；选择瞬间一次性生效，重生时经 armorMaxHp 后补差）
  function affixMaxHpDelta() {
    let d = 0;
    if (affixHas('0:good:1')) d += 25;
    if (affixHas('2:bad:8')) d -= 35;
    d += fbState.pos_maxHpSum;
    return d;
  }

  // BOSS 击坠登记（06-enemy killEnemy BOSS 分支调用）：叠层 +1（至多 5）；
  // bossId / 击坠时轮次（bossFlow.phase，0-based）供档位权重门控判定（affixTierWOverride）——
  // 记录在叠甲门之前（无条件登记，不受 1:good:5 是否持有影响）
  function affixNoteBossKill(bossId) {
    affixFlow.lastBossKillId = bossId != null ? bossId : null;
    affixFlow.lastBossKillPhase = bossFlow.phase;
    if (!affixHas('1:good:5')) return;
    affixFlow.bossShieldStacks = Math.min(5, affixFlow.bossShieldStacks + 1);
  }

  // 档位权重门控（2026-11-11 用户定稿）：击坠「第三轮的第二个 BOSS」（风暴编织者 storm2——暴风之眼的
  // 连续二阶段、不单独占轮）与「第五轮 BOSS」后的词条抽取，虚象/具象档位权重归零（该两次必不抽出
  // 虚象/具象词条；其余档位与特殊对权重不变）。
  // 判定：①bossId === 'storm2'（精确，第三轮两阶段结构见 01-config-boss BOSS_SEQUENCE 注释）；
  //      ②击坠时 bossFlow.phase === 4（0-based 第五轮）——当前 BOSS_SEQUENCE 仅 3 轮接线，
  //        storm2 击坠（最终 BOSS）走胜利结算不弹选项（13-encyclopedia 页尾注口径），
  //        本门控随 5 轮轮次制接线自动生效（判定已内聚于本函数，新触发点无须接线）
  function affixTierWOverride() {
    if (affixFlow.lastBossKillId === 'storm2') return true;
    if (affixFlow.lastBossKillPhase === 4) return true;
    return false;
  }

  // BOSS 击坠减伤乘区（07-player damagePlayer 实际扣血前调用；每次实际受伤 -1 层）
  function affixBossShieldMul() {
    if (!affixHas('1:good:5') || affixFlow.bossShieldStacks <= 0) return 1;
    const mul = 1 - 0.12 * affixFlow.bossShieldStacks;
    affixFlow.bossShieldStacks--;
    return mul;
  }

  // BOSS 增强乘区（2026-11-17 用户数值定稿：小幅 = HP+20% / 伤害+20% / 攻击间隔-20%；大幅 = HP+40% / 伤害+50% / 攻击间隔-40%）：
  //   「下一个 BOSS 小幅/大幅增强」（1:bad:4 / 2:bad:1）= 一次性——05-boss 每个 BOSS 登场块开头调
  //   takeAffixNextBossMods() 快照三通道乘数并移除词条，本次登场的 BOSS 生效至其离场（下一次 spawn
  //   重新快照：无一次性词条在身 → 自动回 1，上一个 BOSS 的加成自然失效）；「所有 BOSS 小幅/大幅增强」
  //  （3:bad:1 / 4:bad:0）= 常驻 affixHas 实时判定。
  //   三通道消费：affixBossHpMul（血量，spawn 块 hp 行）/ affixBossDmgMul（伤害，bossDmgMul() 全部
  //   消费点旁乘——弹幕走 pushBossBullet 统一乘区、接触/区域走各 damagePlayer 挂点）/ affixBossIvMul
  //  （技能间隔，05-boss bossSkillIv 统一入口——覆盖四 BOSS 全部 skillCd）。
  const affixNextBoss = { hp: 1, dmg: 1, iv: 1 };
  function takeAffixNextBossMods() {
    affixNextBoss.hp = 1; affixNextBoss.dmg = 1; affixNextBoss.iv = 1;
    if (affixHas('1:bad:4')) {
      affixNextBoss.hp *= 1.2; affixNextBoss.dmg *= 1.2; affixNextBoss.iv *= 0.8;
      affixIds.splice(affixIds.indexOf('1:bad:4'), 1);   // 一次性：消费即移除（下一次 spawn 不再生效）
    }
    if (affixHas('2:bad:1')) {
      affixNextBoss.hp *= 1.4; affixNextBoss.dmg *= 1.5; affixNextBoss.iv *= 0.6;
      affixIds.splice(affixIds.indexOf('2:bad:1'), 1);
    }
    return affixNextBoss;
  }
  function affixBossHpMul() {
    let mul = affixNextBoss.hp;
    if (affixHas('3:bad:1')) mul *= 1.2;
    if (affixHas('4:bad:0')) mul *= 1.4;
    return mul;
  }
  function affixBossDmgMul() {
    let mul = affixNextBoss.dmg;
    if (affixHas('3:bad:1')) mul *= 1.2;
    if (affixHas('4:bad:0')) mul *= 1.5;
    return mul;
  }
  function affixBossIvMul() {
    let mul = affixNextBoss.iv;
    if (affixHas('3:bad:1')) mul *= 0.8;
    if (affixHas('4:bad:0')) mul *= 0.6;
    return mul;
  }

  // 攻击间隔乘区（真我级 2:good:4 主炮 / 2:good:2 副武器 / 2:good:3 僚机——间隔越乘越小；
  // 副武器并入保底池 pos_subIv 乘算累积——总乘区 ≤0.4 后该保底词条移除）
  function affixFireIv() { return affixHas('2:good:4') ? 0.8 : 1; }
  function affixSubIv() { return (affixHas('2:good:2') ? 0.6 : 1) * fbState.pos_subIvMul; }
  function affixWingIv() { return affixHas('2:good:3') ? 0.7 : 1; }

  // 暴走时长（真我级 2:good:0：+0.5s，每触发一次 +0.01s）——统一入口包装 01-config berserkDuration：
  // 07-player 各暴走授予点改调本函数；12-ui 读条分母用 View 版（不计数）
  function affixBerserkDur() {
    affixFlow.berserkCount++;
    return berserkDuration() + (affixHas('2:good:0') ? 0.5 + 0.01 * (affixFlow.berserkCount - 1) : 0);
  }
  function affixBerserkDurView() {
    return berserkDuration() + (affixHas('2:good:0') ? 0.5 + 0.01 * affixFlow.berserkCount : 0);
  }

  // 结晶护盾时长（具象级 1:good:3：-0.5s，下限 0.5s）——统一入口包装 01-config crystalShieldDur
  function affixCrystalShieldDur() {
    return Math.max(0.5, crystalShieldDur() - (affixHas('1:good:3') ? 0.5 : 0));
  }

  // 拾取水晶延长结晶护盾（具象级 1:good:6）：每次 +0.1s，总延长至多 2s（08-entities 三个水晶拾取点调用）
  function affixCrystalExtend() {
    if (!affixHas('1:good:6') || !(player.crystalShield > 0)) return;
    const ext = Math.min(2 - affixFlow.shieldExtAcc, 0.1);
    if (ext <= 0) return;
    affixFlow.shieldExtAcc += ext;
    player.crystalShield += ext;
  }
  // 重获结晶护盾时清零延长累计（08-entities / 07-player 结晶护盾拾取点调用）
  function affixResetShieldExt() { affixFlow.shieldExtAcc = 0; }

  // 词条（虚象级 0:good:2）：升级波次等级时 10% 概率——从场地下方朝上射出 5 个辛国栋之怒 Lv4 的火环（14-main 升级窗口调用）。
  // 均匀分布：x 取屏宽 (k+1)/6；「中间的首先出现」→ 按距中心的距离给屏外下方不同的额外出发深度（同速上飞，出发点在屏外、
  // 速度恒定 → 位置/速度均无突变，视觉上中环先入场、两侧对称随后）。参数取副武器辛国栋之怒 Lv4（dps 200 / r 64 / 巡航 180）。
  function affixXinguodongRings() {
    const f = SUB_WEAPONS.xinring.fire;
    const lv = f.levels[4];
    for (let k = 0; k < 5; k++) {
      const depth = Math.abs(k - 2);   // 0/1/2 → 中间最先、两侧对称次之
      xinRings.push({
        x: CANVAS_W * (k + 1) / 6,
        y: CANVAS_H + lv.r + 20 + depth * 70,
        dx: 0, dy: -1,
        spd: f.speed, r: lv.r, dps: lv.dps,
        tick: f.tick, tickT: 0, t: 0,
      });
    }
  }

  // 4:bad:3 嬴乾旧占位 affixDangerWaveMul（高危波次概率 ×5）已于 2026-11-11 效果定稿时退役：
  // 新效果改为波次 tier 权重修正（01-config-spawn waveAffixTierW）+ 侧翼触发概率 +0.1 + 额外波次追加
  //（14-main affixExtraWaveBurst），低概率整波替换掷点还原基础概率（04-spawn L553/L567 区域）


  // ---------- 抽取与选择 UI ----------
  // 抽一对（档位 gi 内 good/bad 实装池各自均匀；任一侧空池 → null）
  // 等级 good/bad 槽可出列表（未实装 + 占用 + 绑定条件过滤后仍可抽的索引）
  function offerableGood(gi) {
    const g = AFFIX_DESIGN[gi], gs = [];
    g.good.forEach((_, i) => {
      const id = gi + ':good:' + i;
      if (!AFFIX_UNIMPLEMENTED.has(id) && !affixUsedIds.has(id) && affixIdOfferable(id)) gs.push(i);
    });
    return gs;
  }
  function offerableBad(gi) {
    const g = AFFIX_DESIGN[gi], bs = [];
    g.bad.forEach((_, i) => {
      const id = gi + ':bad:' + i;
      if (!AFFIX_UNIMPLEMENTED.has(id) && !affixUsedIds.has(id)) bs.push(i);
    });
    return bs;
  }
  // 等级全占用判定（good+bad 可出词条全部被占用；权重降权 ×0.4 判定——用户定稿「不管正面还是负面」按等级整体算）
  function gradeExhausted(gi) {
    return !offerableGood(gi).length && !offerableBad(gi).length;
  }
  // 等级 bad 槽全占用（温酒客 5 连抽的池空判定——负面保底阶梯触发条件）
  function badGradeExhausted(gi) { return !offerableBad(gi).length; }

  function rollPair(gi) {
    const g = AFFIX_DESIGN[gi];
    const gs = offerableGood(gi), bs = offerableBad(gi);
    // 一次性占用制：槽位池空 → 保底词条顶上（good 空出保底正面 / bad 空出保底负面；null 表示该槽走保底）
    if (!gs.length && !bs.length) return null;   // 双槽皆空：该等级整个走保底由 buildOption 决定
    return {
      gi,
      good: gs.length ? gs[(Math.random() * gs.length) | 0] : null,   // null = 保底正面
      bad: bs.length ? bs[(Math.random() * bs.length) | 0] : null,    // null = 保底负面
      // 保底槽预抽定（2026-11-26 保底池重构）：槽空时即从池抽定词条——渲染与选择共用同一条，选择时不二次随机；
      // 全池移除 → null（渲染显示「保底池暂空」，选择落地跳过）
      fbGood: gs.length ? null : rollFallbackEntry(FB_GOOD_POOL),
      fbBad: bs.length ? null : rollFallbackEntry(FB_BAD_POOL),
    };
  }

  // 特殊对抽取：从已实装特殊对中等权选一（是否出特殊对由 drawAffixCategory 的权重通道决定）；
  // 澪叶（sp1 疾速航行）手机模式不出现（2026-11-17 用户定稿）：触屏相对拖动 1:1 跟手、无速度上限概念，
  // 移速加成无意义——同牢大特饮平台门控口径（docs/手机模式设计.md §7.1）；掷中特殊对但池空自动回退常规档位（buildOption）
  function rollSpecial() {
    const sp = [];
    AFFIX_SPECIAL.forEach((_, i) => {
      if (TOUCH_DEVICE && i === 1) return;
      const key = 'sp' + i;
      if (!AFFIX_UNIMPLEMENTED.has(key) && !affixUsedIds.has(key)) sp.push(i);   // 一次性占用制：选过的特殊对不再出现
    });
    return sp.length ? sp[(Math.random() * sp.length) | 0] : null;
  }

  // 加权抽类别：返回 0~4（档位序）或 AFFIX_DESIGN.length（=5，特殊对）；
  // 等级全占用 → 该等级权重 ×0.4（用户定稿；特殊对通道不受降权影响）；
  // sessionTierW 覆盖（storm2 / 第五轮击坠后的会话）：虚象/具象权重归零，其余沿用默认
  function drawAffixCategory() {
    const base = affixFlow.sessionTierW || AFFIX_DRAW_WEIGHTS;
    const ws = base.map((w, i) => (i < AFFIX_DESIGN.length && gradeExhausted(i) ? w * FALLBACK_TIER_W : w));
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r < 0) return i; }
    return ws.length - 1;
  }

  // 构建一个选项：类别加权抽取（档位 22/34/16/12/3 + 特殊对 3，等级全占用 ×0.4）；
  // 槽位池空 → 保底项顶上（rollPair 返回 null 槽；双槽皆空 = 双保底选项）——保底无限供应，
  // 不再需要池空顺延。诗篇难度不再内嵌两对（2026-11-17 用户定稿：分两次选择，每次一对——
  // 见 chooseOption 两段式）；特殊对为附加行（不替换常规对）
  function buildOption() {
    let cat = drawAffixCategory();
    let sp = null;
    if (cat === AFFIX_DESIGN.length) {
      sp = rollSpecial();
      if (sp == null) cat = 0;   // 特殊对占用完 → 回退常规档位通道
    }
    const gi = cat === AFFIX_DESIGN.length ? 0 : cat;
    const pair = rollPair(gi) || {   // 双槽皆空 → 双保底选项
      gi, good: null, bad: null,
      fbGood: rollFallbackEntry(FB_GOOD_POOL),
      fbBad: rollFallbackEntry(FB_BAD_POOL),
    };
    // 保底联动词条（buildOption 掷点预抽定，2026-11-26 用户定稿——渲染可见、选择时不二次随机）：
    // pos_negReduce 掷中 → 本对负面词条数-1（bad='skip' / fbBad 清空，渲染标注）；
    // neg_negAdd 掷中 → 追加一条任意等级负面 bad2（负面词条数+1；占用/禁用同常规负面）。
    // 两掷点互斥（先减后加无意义）；仅本对存在负面（正常或保底）时判定
    if ((pair.bad != null || pair.fbBad != null) && affixNegReduceChance() > 0 && Math.random() < affixNegReduceChance()) {
      if (pair.bad != null) pair.bad = 'skip'; else pair.fbBad = null;
      pair.badSkipped = true;
    } else if ((pair.bad != null || pair.fbBad != null) && affixNegAddChance() > 0 && Math.random() < affixNegAddChance()) {
      pair.bad2 = rollAnyBad();   // { gi, bi } 任意等级负面 / { fbKey } 负面保底池 / null 全空
    }
    return { pairs: [pair], sp, refreshed: false };
  }

  // BOSS 击坠后延迟开选项（06-enemy killEnemy BOSS 分支调用；延迟给击坠演出/道具吸收留窗口）
  function queueAffixSelection(delay) {
    affixFlow.pendingT = delay;
  }

  // 每帧推进（14-main 战斗块调用）：倒计时归零即暂停并弹选项
  function tickAffixPending(dt) {
    if (affixFlow.pendingT <= 0) return;
    affixFlow.pendingT -= dt;
    if (affixFlow.pendingT <= 0) openAffixSelection();
  }

  function affixModalOpen() { return affixFlow.open; }

  // 长歌级 15~35s 暴走道具掉落计时（4:good:0）——14-main 战斗块每帧调用
  function tickAffixBerserkDrop(dt) {
    if (!affixHas('4:good:0') || !affixFlow.berserkDropFn) return;
    affixFlow.berserkDropT -= dt;
    if (affixFlow.berserkDropT <= 0) {
      affixFlow.berserkDropT = 15 + Math.random() * 20;
      affixFlow.berserkDropFn();
    }
  }
  // 14-main 启动时注入道具生成回调（本模块禁止 import 08-entities，防循环依赖）
  function registerAffixBerserkDrop(fn) { affixFlow.berserkDropFn = fn; }

  // 本局已获词条快照（12-ui 暂停页「当前词条」显示消费，2026-11-10 用户需求）：affixIds 实时解析，
  // 调用即快照（暂停页每次打开重渲染）。普通 id → { kind:'entry', grade, side, name, icon, text }；
  // 特殊对 'sp0'/'sp1' → { kind:'special', name, good:{icon,text}, bad:{icon,text} }（对名 + 正/负文案，无独立名）。
  // 登记语义见 chooseOption：被 4:good:3 回溯禁用的负面不在 affixIds（登记时已跳过），快照天然不含
  function affixOwnedEntries() {
    return affixIds.map((id) => {
      if (id.startsWith('sp')) {
        const sp = AFFIX_SPECIAL[Number(id.slice(2))];
        return sp ? { kind: 'special', name: sp.name, good: sp.good, bad: sp.bad } : null;
      }
      const parts = id.split(':');
      const g = AFFIX_DESIGN[Number(parts[0])];
      const t = g && g[parts[1]] && g[parts[1]][Number(parts[2])];
      return t ? { kind: 'entry', grade: g.grade, side: parts[1], name: t.name, icon: t.icon, text: affixText(t) } : null;
    }).filter(Boolean);
  }

  // 选择并应用一个选项：登记词条 id + 占用标记 + 立即生效类词条结算 + 关闭界面恢复游戏。
  // 保底槽（pr.good/pr.bad 为 null）：不登记不占池，仅推进保底阶梯档位（无限叠加不封顶，2026-11-11 用户定稿）
  function chooseOption(oi) {
    const opt = affixFlow.options && affixFlow.options[oi];
    if (!opt || opt.chosen) return;
    opt.chosen = true;
    if (opt.sp != null) {
      affixIds.push('sp' + opt.sp);
      affixUsedIds.add('sp' + opt.sp);   // 一次性占用制：特殊对选过即占
      applyInstant('sp' + opt.sp);
    }
    for (const pr of opt.pairs) {
      if (pr.good == null) {   // 保底正面：预抽定词条按抽取时等级 gi 取档落地（applyFallbackEntry 累积+阈值移除）
        if (pr.fbGood) applyFallbackEntry(pr.fbGood, pr.gi);
      } else {
        const gid = pr.gi + ':good:' + pr.good;
        affixIds.push(gid);
        affixUsedIds.add(gid);   // 一次性占用制：选过即占，不再出现在后续选项
        applyInstant(gid);
      }
      if (pr.bad == null) {   // 保底负面：预抽定词条落地（池全移除 → fbBad 为 null，跳过）
        if (pr.fbBad) applyFallbackEntry(pr.fbBad, pr.gi);
      } else if (pr.bad !== 'skip') {   // 'skip' = pos_negReduce 掷中（负面词条数-1）——本对无负面不登记
        const bid = pr.gi + ':bad:' + pr.bad;
        affixUsedIds.add(bid);   // 占用先于禁用判定——被令雨汐禁用的负面同样算占用（选了只得不到）
        // 词条（长歌级 4:good:3 = 令雨汐）负面禁用：被禁负面不登记不结算（选项页中划掉显示，见 renderAffixModal）
        if (!affixBadDisabled(bid)) {
          affixIds.push(bid);
          applyInstant(bid);
        }
      }
      if (pr.bad2) {   // neg_negAdd 掷中追加的额外负面（负面词条数+1，2026-11-26 用户定稿）
        if (pr.bad2.fbKey) {
          applyFallbackEntry(pr.bad2.fbKey, pr.gi);
        } else {
          const bid2 = pr.bad2.gi + ':bad:' + pr.bad2.bi;
          affixUsedIds.add(bid2);
          if (!affixBadDisabled(bid2)) {
            affixIds.push(bid2);
            applyInstant(bid2);
          }
        }
      }
    }
    // 诗篇难度两段式选择（2026-11-17 用户定稿+纠正）：不再每选项内嵌两对——第一次选择登记后该对消失，
    // **仅重建被选择的选项位**（buildOption 重新独立抽取：稀有度各自掷、已选词条被占用表自动排除、
    // 特殊对池延续一次性占用制），**另外两个选项原样保留**（仍可刷新/选择）；保底阶梯、会话门控
    // sessionTierW、refreshed 刷新状态均延续（不经过 close）——再选一次后关闭界面
    affixFlow.poemPickCount++;
    if (isPoem() && affixFlow.poemPickCount < 2) {
      affixFlow.options[oi] = buildOption();   // 仅被选位换新一对（refreshed[oi] 原位继承，不重置）
      renderAffixModal();
      return;
    }
    closeAffixSelection();
  }

  // 立即生效类词条结算（选择瞬间一次性生效；持续类由下游模块 affixHas 查询消费）
  function applyInstant(id) {
    if (id === '0:good:1') {   // 战机血量增加25
      player.maxHp += 25;
      player.hp += 25;
    } else if (id === '2:bad:8') {   // 战机血量上限减少35（不低于1）
      player.maxHp = Math.max(1, player.maxHp - 35);
      player.hp = Math.min(player.hp, player.maxHp);
    }
  }

  // 刷新一个选项（2026-11-23 用户定稿：仅诗篇难度可刷新；每选项至多 1 次；整选项重掷——稀有度与词条均重抽）。
  // 非诗篇难度刷新按钮不渲染（renderAffixModal），此处 isPoem 兜底直接拒绝
  function refreshOption(oi) {
    if (!isPoem()) return;
    const opt = affixFlow.options && affixFlow.options[oi];
    if (!opt || opt.chosen || affixFlow.refreshed[oi]) return;
    affixFlow.refreshed[oi] = true;
    affixFlow.options[oi] = buildOption();
    renderAffixModal();
  }

  // ---------- 选择界面 DOM（懒创建，避开 smoke 无头环境顶层 DOM 依赖） ----------
  let affixModal = null, affixOptionBox = null;

  function ensureAffixModal() {
    if (affixModal) return;
    affixModal = document.createElement('div');
    affixModal.id = 'affixModal';
    Object.assign(affixModal.style, {
      position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
      zIndex: 900, display: 'none', flexDirection: 'column', alignItems: 'center',
      background: 'rgba(6, 10, 18, 0.94)', border: '1px solid rgba(140, 170, 255, 0.35)',
      borderRadius: '14px', padding: '22px 26px', maxWidth: '720px', width: '92%',
      color: '#dfe6f5', fontFamily: 'inherit', boxShadow: '0 10px 44px rgba(0,0,0,0.55)',
      maxHeight: '86vh', overflowY: 'auto',
    });
    const title = document.createElement('div');
    title.textContent = '击败 BOSS · 选择词条';
    Object.assign(title.style, { fontSize: '20px', fontWeight: '700', letterSpacing: '2px', marginBottom: '6px' });
    const sub = document.createElement('div');
    sub.textContent = '必须且只能选择一个选项 · 选择后本局生效（诗篇难度需连续选择两次，选过的选项位换新）';
    Object.assign(sub.style, { fontSize: '12px', color: '#93a4c6', marginBottom: '14px' });
    affixOptionBox = document.createElement('div');
    Object.assign(affixOptionBox.style, { display: 'flex', gap: '12px', alignItems: 'stretch', flexWrap: 'wrap', justifyContent: 'center' });
    affixModal.append(title, sub, affixOptionBox);
    document.body.appendChild(affixModal);
  }

  function renderAffixModal() {
    ensureAffixModal();
    affixOptionBox.innerHTML = '';
    affixFlow.options.forEach((opt, oi) => {
      const g = AFFIX_DESIGN[opt.pairs[0].gi];
      const card = document.createElement('div');
      Object.assign(card.style, {
        flex: '1 1 200px', maxWidth: '216px', background: 'rgba(20, 28, 46, 0.92)',
        border: '1px solid ' + (g.color || '#8899bb'), borderRadius: '10px',
        padding: '12px 14px', cursor: 'pointer', position: 'relative',
      });
      const head = document.createElement('div');
      head.textContent = '选项 ' + (oi + 1) + ' · ' + g.grade;
      Object.assign(head.style, { color: g.color, fontWeight: '700', fontSize: '14px', marginBottom: '8px' });
      card.appendChild(head);
      if (opt.sp != null) {
        const sp = AFFIX_SPECIAL[opt.sp];
        appendLine(card, '特殊对 · ' + sp.name, '#ffffff', 700);
        appendLine(card, sp.good.icon + ' 正面 · ' + affixText(sp.good), '#4ade80', 400);
        appendLine(card, sp.bad.icon + ' 负面 · ' + affixText(sp.bad), '#ff5a5a', 400);
      }
      for (const pr of opt.pairs) {
        // 保底槽（pr.good/pr.bad 为 null，2026-11-26 保底池重构）：展示预抽定词条按本档等级取档的文案
        if (pr.good == null) {
          appendLine(card, pr.fbGood ? '⬆️ 保底正面 · ' + pr.fbGood.text(pr.fbGood.steps[pr.gi]) : '⬆️ 保底正面 · 保底池暂空', '#4ade80', 400);
        } else {
          const gd = AFFIX_DESIGN[pr.gi].good[pr.good];
          appendLine(card, gd.icon + ' 正面 · ' + gd.name + '：' + affixText(gd), '#4ade80', 400);
        }
        if (pr.bad == 'skip') {   // pos_negReduce 掷中：负面词条数-1（本对无负面）
          appendLine(card, '⬇️ 负面 · 负面词条数减少1生效：本选项无负面', '#7fd1a8', 400);
        } else if (pr.bad == null) {
          appendLine(card, pr.fbBad ? '⬇️ 保底负面 · ' + pr.fbBad.text(pr.fbBad.steps[pr.gi]) : '⬇️ 保底负面 · 保底池暂空', '#ff5a5a', 400);
        } else {
          const bd = AFFIX_DESIGN[pr.gi].bad[pr.bad];
          // 词条（长歌级 4:good:3 = 令雨汐）负面禁用：被禁负面划掉显示（仍可选——选中只得到正面，负面不登记不结算）
          const badOff = affixBadDisabled(pr.gi + ':bad:' + pr.bad);
          appendLine(card, bd.icon + ' 负面 · ' + bd.name + '：' + affixText(bd), badOff ? '#9c6b74' : '#ff5a5a', 400, badOff);
        }
        if (pr.bad2) {   // neg_negAdd 掷中追加的额外负面（负面词条数+1）
          if (pr.bad2.fbKey) {
            appendLine(card, '⬇️ 额外负面(+1) · ' + pr.bad2.fbKey.text(pr.bad2.fbKey.steps[pr.gi]), '#ff5a5a', 400);
          } else {
            const bd2 = AFFIX_DESIGN[pr.bad2.gi].bad[pr.bad2.bi];
            const bad2Off = affixBadDisabled(pr.bad2.gi + ':bad:' + pr.bad2.bi);
            appendLine(card, bd2.icon + ' 额外负面(+1) · ' + bd2.name + '：' + affixText(bd2), bad2Off ? '#9c6b74' : '#ff5a5a', 400, bad2Off);
          }
        }
      }
      if (isPoem()) {   // 刷新仅诗篇难度可用（2026-11-23 用户定稿；其他难度不渲染刷新按钮）
        const rbtn = document.createElement('button');
        rbtn.textContent = affixFlow.refreshed[oi] ? '已刷新' : '刷新此选项';
        Object.assign(rbtn.style, {
          marginTop: '10px', fontSize: '12px', padding: '4px 10px', cursor: affixFlow.refreshed[oi] ? 'default' : 'pointer',
          background: 'rgba(255,255,255,0.08)', color: affixFlow.refreshed[oi] ? '#77809a' : '#dfe6f5',
          border: '1px solid rgba(160,180,220,0.4)', borderRadius: '6px',
        });
        rbtn.addEventListener('click', (ev) => { ev.stopPropagation(); refreshOption(oi); });
        card.appendChild(rbtn);
      }
      card.addEventListener('click', () => pickOptionAnimated(oi, card, g));
      affixOptionBox.appendChild(card);
    });
  }

  function appendLine(parent, text, color, weight, strike) {
    const p = document.createElement('p');
    p.textContent = text;
    Object.assign(p.style, { margin: '5px 0', fontSize: '12.5px', lineHeight: '1.6', color, fontWeight: String(weight) });
    if (strike) { p.style.textDecoration = 'line-through'; p.style.opacity = '0.55'; }
    parent.appendChild(p);
  }

  // 选择动画（2026-11-23 用户需求）：被选选项卡边框发亮 + 略微缩小，≈0.27s 后再走 chooseOption 结算
  //（诗篇第一选重建被选选项位 / 否则关闭界面恢复游戏）。实现用 style.transition + setTimeout——
  // 不引 element.animate（兼容 smoke 无头 DOM 桩）；pickAnim 门控动画期间的重复点击；
  // 动画期间界面被关闭（重开 / 结算 / 重置）则丢弃本次选择
  function pickOptionAnimated(oi, card, g) {
    if (affixFlow.pickAnim) return;
    const opt = affixFlow.options && affixFlow.options[oi];
    if (!opt || opt.chosen) return;
    affixFlow.pickAnim = true;
    const glow = g && g.color ? g.color : '#8caaff';
    card.style.transition = 'transform 0.26s ease, box-shadow 0.26s ease, border-color 0.26s ease';
    card.style.transform = 'scale(0.94)';
    card.style.borderColor = '#ffffff';
    card.style.boxShadow = '0 0 16px ' + glow + ', 0 0 6px rgba(255,255,255,0.9)';
    setTimeout(() => {
      affixFlow.pickAnim = false;
      if (!affixFlow.open) return;   // 动画期间界面已关闭 → 丢弃本次选择
      chooseOption(oi);
    }, 270);
  }

  function openAffixSelection() {
    affixFlow.pendingT = 0;
    affixFlow.open = true;
    // 档位权重门控（affixTierWOverride）：命中 storm2 / 第五轮击坠 → 虚象/具象权重归零的会话覆盖
    //（含本会话内的选项刷新，同一次抽取规则一致；close 时清空）
    affixFlow.sessionTierW = affixTierWOverride() ? [0, 0, ...AFFIX_DRAW_WEIGHTS.slice(2)] : null;
    affixFlow.poemPickCount = 0;   // 诗篇两段式：新会话选择计数归零（两次选择：1→重建选项 / 2→关闭）
    affixFlow.pickAnim = false;
    affixFlow.options = [buildOption(), buildOption(), buildOption()];
    affixFlow.refreshed = [false, false, false];
    state.paused = true;   // 选择期间冻结主循环（14-main 战斗块停走、渲染保留最后一帧）
    renderAffixModal();
    affixModal.style.display = 'flex';
  }

  function closeAffixSelection() {
    affixFlow.open = false;
    affixFlow.sessionTierW = null;   // 会话级档位门控覆盖用毕即清（下次抽取按最近击坠重新判定）
    affixFlow.poemPickCount = 0;     // 诗篇两段式计数归零（保险，open 时也重置）
    if (affixModal) affixModal.style.display = 'none';
    state.paused = false;
  }

  // 跨局重置（12-ui resetGame 调用）：清空已选词条 / 占用表 / 保底阶梯 / 温酒客 DEBUFF / 界面 / 计数器 / 倒计时
  function resetAffixRunState() {
    affixIds.length = 0;
    affixUsedIds.clear();
    fbState.pos_mainGunMul = 1; fbState.pos_maxHpSum = 0; fbState.pos_wingCritSum = 0; fbState.pos_subIvMul = 1;
    fbState.pos_dmgReduceSum = 0; fbState.pos_dropRateSum = 0; fbState.pos_negReduceSum = 0;
    fbState.neg_negAddSum = 0; fbState.neg_dmgSum = 0; fbState.neg_firstIvMul = 1; fbState.neg_ivMul = 1;
    fbState.neg_hpSum = 0; fbState.neg_bulletSpdSum = 0; fbState.neg_rushCdSum = 0; fbState.neg_speedSum = 0;
    fbState.neg_undyingSum = 0; fbState.neg_deathAttackSum = 0;
    fbRemoved.clear();
    wenjiukeAffixIds.length = 0;
    wjkDraws.length = 0;
    wjkTwinKilled.storm = false;
    wjkTwinKilled.storm2 = false;
    jiukeDraws.length = 0;   // 九克之王开局抽签记录（2026-11-17 新增；2026-11-23 用户定稿更名「酒客之王」→「九克之王」）
    affixFlow.pendingT = 0;
    affixFlow.open = false;
    affixFlow.options = null;
    affixFlow.refreshed = [false, false, false];
    affixFlow.bossShieldStacks = 0;
    affixFlow.berserkCount = 0;
    affixFlow.shieldExtAcc = 0;
    affixFlow.berserkDropT = 15 + Math.random() * 20;
    affixFlow.lastBossKillId = null;
    affixFlow.lastBossKillPhase = -1;
    affixFlow.sessionTierW = null;
    affixFlow.poemPickCount = 0;
    affixFlow.pickAnim = false;
    if (affixModal) affixModal.style.display = 'none';
    if (wjkModal) wjkModal.style.display = 'none';
    if (jkModal) jkModal.style.display = 'none';
    // 注意：不动 state.paused——resetGame 自身会重置暂停态，且本函数可能在其前后被调
  }

  // ---------- 温酒客开局 DEBUFF（2026-11-11 用户定稿效果重做） ----------
  // 温酒客 5 连抽：全等级负面池加权抽取（未实装 + 令雨汐禁用 + 已占用过滤；等级 bad 槽全占用该等级权重 ×0.4）；
  // 全部等级 bad 槽耗尽 → 负面保底阶梯顶上（与词条页共用同一条阶梯计数，无限叠加不封顶）。
  // 抽中即占用（占用先于禁用判定同 chooseOption——被令雨汐禁用的负面同样算占用），
  // 但被禁用的负面不进 wenjiukeAffixIds（登记语义同词条页被禁负面：不登记不结算）。
  function rollWenjiukeDebuffs() {
    wenjiukeAffixIds.length = 0;
    wjkDraws.length = 0;
    for (let n = 0; n < 5; n++) {
      const cands = [];
      for (let gi = 0; gi < AFFIX_DESIGN.length; gi++) {
        if (badGradeExhausted(gi)) continue;   // bad 槽全占用：走保底，不参与抽取
        const w = gradeExhausted(gi) ? FALLBACK_TIER_W : 1;   // 等级全占用 → 权重 ×0.4
        for (const bi of offerableBad(gi)) cands.push({ id: gi + ':bad:' + bi, w });
      }
      if (!cands.length) {   // 全部等级 bad 槽耗尽 → 负面保底词条池随机抽（按随机等级取档，2026-11-26 改道）
        const def = rollFallbackEntry(FB_BAD_POOL);
        const fgi = (Math.random() * 5) | 0;   // 池空槽无等级概念：随机 gi 取档（落地与渲染共用同值）
        if (def) applyFallbackEntry(def, fgi);
        wjkDraws.push({ kind: 'fallback', def, gi: fgi });
        continue;
      }
      let r = Math.random() * cands.reduce((a, c) => a + c.w, 0);
      let pick = cands[cands.length - 1];
      for (const c of cands) { r -= c.w; if (r < 0) { pick = c; break; } }
      affixUsedIds.add(pick.id);
      const off = affixBadDisabled(pick.id);   // 令雨汐禁用：占坑不生效（展示划掉），生效数组不登记
      if (!off) wenjiukeAffixIds.push(pick.id);
      wjkDraws.push({ kind: 'id', id: pick.id, off });
    }
  }

  // 双生 BOSS 计轮（06-enemy BOSS 击败结算处调用，bossId = 'storm' / 'storm2'）：
  // 暴风之眼 + 风暴编织者都击坠 = 一轮（旧日之歌不计）→ 失效一个 DEBUFF 并重置标记。
  // 失效顺序：温酒客 5 个 DEBUFF 中第一个未失效的 → 全失效后，其他来源负面（affixIds 按获得顺序第一个未失效的负面）。
  // 保底负面阶梯不参与失效（无限供应的补偿机制，不是单个 DEBUFF）。
  function wenjiukeBossRoundKill(bossId) {
    if (bossId !== 'storm' && bossId !== 'storm2') return false;
    wjkTwinKilled[bossId] = true;
    if (!wjkTwinKilled.storm || !wjkTwinKilled.storm2) return false;
    wjkTwinKilled.storm = false;
    wjkTwinKilled.storm2 = false;
    let removed = null, source = '';
    if (wenjiukeAffixIds.length) {
      removed = wenjiukeAffixIds.shift();
      source = '温酒客';
    } else {
      const bi = affixIds.findIndex((id) => /:bad:/.test(id));
      if (bi >= 0) { removed = affixIds.splice(bi, 1)[0]; source = '词条'; }
    }
    if (removed && wjkOnRemoved) wjkOnRemoved(removed, source);   // 横幅提示回调（14-main 注入，防循环依赖）
    return !!removed;
  }

  // 温酒客开局确认模态（懒创建，同 affixModal 套路避开无头环境顶层 DOM 依赖）：
  // 开局展示 5 张负面卡，玩家点击确认后关闭并恢复游戏（确认回调经 state.paused 冻结主循环）
  let wjkModal = null, wjkOnRemoved = null;
  function registerWenjiukeRemoved(fn) { wjkOnRemoved = fn; }

  function ensureWjkModal() {
    if (wjkModal) return;
    wjkModal = document.createElement('div');
    wjkModal.id = 'wenjiukeModal';
    Object.assign(wjkModal.style, {
      position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
      zIndex: 900, display: 'none', flexDirection: 'column', alignItems: 'center',
      background: 'rgba(6, 10, 18, 0.94)', border: '1px solid rgba(201, 160, 255, 0.45)',
      borderRadius: '14px', padding: '22px 26px', maxWidth: '640px', width: '92%',
      color: '#dfe6f5', fontFamily: 'inherit', boxShadow: '0 10px 44px rgba(0,0,0,0.55)',
      maxHeight: '86vh', overflowY: 'auto',
    });
    const title = document.createElement('div');
    title.textContent = '温酒客 · 深藏不露';
    Object.assign(title.style, { fontSize: '20px', fontWeight: '700', letterSpacing: '2px', marginBottom: '6px', color: '#c9a0ff' });
    wjkModal.appendChild(title);
    const sub = document.createElement('div');
    sub.textContent = '开局获得 5 个随机负面效果 · 每击坠一轮 BOSS（暴风之眼与风暴编织者合计一轮）失效一个';
    Object.assign(sub.style, { fontSize: '12px', color: '#93a4c6', marginBottom: '14px' });
    wjkModal.appendChild(sub);
    const list = document.createElement('div');
    list.id = 'wenjiukeModalList';
    Object.assign(list.style, { width: '100%' });
    wjkModal.appendChild(list);
    const ok = document.createElement('button');
    ok.textContent = '确认出发';
    Object.assign(ok.style, {
      marginTop: '16px', fontSize: '14px', padding: '8px 28px', cursor: 'pointer',
      background: 'linear-gradient(180deg, rgba(201,160,255,0.25), rgba(201,160,255,0.08))',
      color: '#dfe6f5', border: '1px solid rgba(201,160,255,0.55)', borderRadius: '6px', letterSpacing: '4px',
    });
    ok.addEventListener('click', closeWenjiukeOpening);
    wjkModal.appendChild(ok);
    document.body.appendChild(wjkModal);
  }

  // 开局流程（14-main startGame 末尾调用）：非温酒客直接放行；温酒客先抽 5 个 DEBUFF 并弹确认模态
  function openWenjiukeOpening(hasPilotWjk) {
    if (!hasPilotWjk) return false;
    rollWenjiukeDebuffs();
    ensureWjkModal();
    const list = document.getElementById('wenjiukeModalList');
    list.innerHTML = '';
    // 展示语义：按 5 次抽签结果全列（wjkDraws 与生效数组分离，被令雨汐禁用/保底槽不错位）——
    // 被禁负面显示划掉（不生效）；保底槽显示保底负面当前档位
    for (const d of wjkDraws) {
      const p = document.createElement('p');
      Object.assign(p.style, { margin: '5px 0', fontSize: '12.5px', lineHeight: '1.6' });
      if (d.kind === 'id') {
        const parts = d.id.split(':');
        const t = AFFIX_DESIGN[Number(parts[0])].bad[Number(parts[2])];
        p.textContent = t.icon + ' ' + t.name + '：' + affixText(t);
        p.style.color = d.off ? '#9c6b74' : '#ff5a5a';
        if (d.off) p.style.textDecoration = 'line-through';
      } else {
        p.textContent = d.def ? '⬇️ 保底负面 · ' + d.def.text(d.def.steps[d.gi]) : '⬇️ 保底负面 · 保底池暂空';
        p.style.color = '#ff5a5a';
      }
      list.appendChild(p);
    }
    wjkModal.style.display = 'flex';
    state.paused = true;   // 确认前冻结主循环
    return true;
  }

  function closeWenjiukeOpening() {
    if (wjkModal) wjkModal.style.display = 'none';
    state.paused = false;
  }

  function wenjiukeOpeningOpen() { return !!wjkModal && wjkModal.style.display === 'flex'; }

  // 温酒客 DEBUFF 快照（12-ui 暂停页/图鉴展示用）：实时解析为条目
  function wenjiukeDebuffEntries() {
    return wenjiukeAffixIds.map((id) => {
      const parts = id.split(':');
      const g = AFFIX_DESIGN[Number(parts[0])];
      const t = g && g.bad[Number(parts[2])];
      return t ? { grade: g.grade, name: t.name, icon: t.icon, text: t.text } : null;
    }).filter(Boolean);
  }

  // ---------- 九克之王开局词条（2026-11-17 用户定稿：特殊主驾驶员 01-config-loadout PILOTS.jiukewang；2026-11-23 用户定稿更名「酒客之王」→「九克之王」） ----------
  // 开局立刻获得六对词条：虚象/具象/真我/诗篇/长歌五档各随机一对（该档正面1+负面1）
  // + 第六对=特殊词条一对（2026-11-23 用户定稿：复用 rollSpecial 从纵逭灭 sp0 / 澪叶 sp1 中随机抽一对——
  //   含手机模式澪叶过滤与一次性占用制；特殊对池空时该对缺省，仅五档各一对）。与温酒客的差异：
  //   ①抽「对」（正负各一）而非只抽负面，抽取顺序=档位序 0→4（若诗篇对抽中令雨汐 4:good:3，
  //     其后长歌负面经 affixBadDisabled 过滤不登记，先前已登记的虚象/真我负面由 affixHas 回溯失效——全局收口语义自然覆盖）；
  //   ②词条永久生效（无失效引擎）：直接登记进 affixIds（affixHas / 暂停页「当前词条」/ 图鉴快照自动跟随），
  //     同时进占用表（后续三选一不再出现同 id，同 chooseOption 口径）。
  // 抽签口径同 rollWenjiukeDebuffs：占用过滤（offerableGood/Bad）+ 等级全占用降权不适用（此处逐档必抽一对，
  // 槽空直接走保底阶梯——与 rollPair 保底语义一致：good 空出保底正面 / bad 空出保底负面，无限叠加不封顶）。
  const jiukeDraws = [];   // 六对抽签展示记录（与 affixIds 分离：保底槽/被禁负面不错位，开局模态按此渲染）

  function rollJiukePairs() {
    jiukeDraws.length = 0;
    for (let gi = 0; gi < AFFIX_DESIGN.length; gi++) {
      const gs = offerableGood(gi), bs = offerableBad(gi);
      jiukeDraws.push({
        gi,
        good: gs.length ? gs[(Math.random() * gs.length) | 0] : null,   // null = 保底正面
        bad: bs.length ? bs[(Math.random() * bs.length) | 0] : null,    // null = 保底负面
        // 保底槽预抽定（2026-11-26 保底池重构：渲染与落地共用同一条，按本档 gi 取档）
        fbGood: gs.length ? null : rollFallbackEntry(FB_GOOD_POOL),
        fbBad: bs.length ? null : rollFallbackEntry(FB_BAD_POOL),
      });
    }
    jiukeDraws.push({ sp: rollSpecial() });   // 第六对：特殊词条一对（rollSpecial 随机抽取——sp0/sp1 二选一，含手机模式过滤；null = 池空缺省，2026-11-23 用户定稿）
  }

  // 抽签 + 登记 + 立即生效（12-ui resetGame 开局钩子 openJiukeOpening 调用）。
  // 登记完成后统一回填每对负面的 off 划掉标记——按最终状态判定（令雨汐已入 affixIds 后，
  // 虚象/真我/长歌负面无论登记先后均真实失效，展示与 affixHas 一致）
  function grantJiukePairs() {
    rollJiukePairs();
    for (const d of jiukeDraws) {
      if (d.sp != null) {   // 第六对：特殊词条一对（2026-11-23 改一对授予）——仅登记抽中的一个（d.sp = 0|1）
        const key = 'sp' + d.sp;
        affixIds.push(key);
        affixUsedIds.add(key);   // 一次性占用制：特殊对选过即占（同 chooseOption；未抽中的另一个特殊对后续三选一仍可出现）
        applyInstant(key);
        continue;
      }
      if (d.good == null) {   // 保底正面：预抽定词条按本档 gi 取档落地（2026-11-26 保底池重构）
        if (d.fbGood) applyFallbackEntry(d.fbGood, d.gi);
      } else {
        const gid = d.gi + ':good:' + d.good;
        affixIds.push(gid);
        affixUsedIds.add(gid);
        applyInstant(gid);
      }
      if (d.bad == null) {   // 保底负面：预抽定词条落地（池全移除 → fbBad 为 null，跳过）
        if (d.fbBad) applyFallbackEntry(d.fbBad, d.gi);
      } else {
        const bid = d.gi + ':bad:' + d.bad;
        affixUsedIds.add(bid);   // 占用先于禁用判定（同 chooseOption——被令雨汐禁用的负面同样算占用）
        if (!affixBadDisabled(bid)) {   // 令雨汐已登记（诗篇对先于长歌对抽取）：被禁负面不登记不结算
          affixIds.push(bid);
          applyInstant(bid);
        }
      }
    }
    for (const d of jiukeDraws) {
      if (!d.sp && d.bad != null) d.off = affixBadDisabled(d.gi + ':bad:' + d.bad);   // 最终状态回填（含令雨汐回溯失效）
    }
  }

  // 九克之王开局确认模态（懒创建，同 affixModal / wenjiukeModal 套路避开无头环境顶层 DOM 依赖）：
  // 开局展示六对词条（正绿负红同暂停菜单当前词条配色、被禁负面划掉），确认后关闭并恢复游戏
  let jkModal = null;
  const JK_COLOR = '#e0b060';   // 模态边框/标题色 = PILOTS.jiukewang.color 琥珀酒金（01-config 注释待定稿可改，此处同步改）

  function ensureJkModal() {
    if (jkModal) return;
    jkModal = document.createElement('div');
    jkModal.id = 'jiukeModal';
    Object.assign(jkModal.style, {
      position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
      zIndex: 900, display: 'none', flexDirection: 'column', alignItems: 'center',
      background: 'rgba(6, 10, 18, 0.94)', border: '1px solid rgba(224, 176, 96, 0.45)',
      borderRadius: '14px', padding: '22px 26px', maxWidth: '640px', width: '92%',
      color: '#dfe6f5', fontFamily: 'inherit', boxShadow: '0 10px 44px rgba(0,0,0,0.55)',
      maxHeight: '86vh', overflowY: 'auto',
    });
    const title = document.createElement('div');
    title.textContent = '九克之王 · 开局赠礼';
    Object.assign(title.style, { fontSize: '20px', fontWeight: '700', letterSpacing: '2px', marginBottom: '6px', color: JK_COLOR });
    jkModal.appendChild(title);
    const sub = document.createElement('div');
    sub.textContent = '开局获得六对词条 · 五个等级各一对 + 一对特殊词条 · 全部本局永久生效';
    Object.assign(sub.style, { fontSize: '12px', color: '#93a4c6', marginBottom: '14px' });
    jkModal.appendChild(sub);
    const list = document.createElement('div');
    list.id = 'jiukeModalList';
    Object.assign(list.style, { width: '100%' });
    jkModal.appendChild(list);
    const ok = document.createElement('button');
    ok.textContent = '确认出发';
    Object.assign(ok.style, {
      marginTop: '16px', fontSize: '14px', padding: '8px 28px', cursor: 'pointer',
      background: 'linear-gradient(180deg, rgba(224,176,96,0.25), rgba(224,176,96,0.08))',
      color: '#dfe6f5', border: '1px solid rgba(224,176,96,0.55)', borderRadius: '6px', letterSpacing: '4px',
    });
    ok.addEventListener('click', closeJiukeOpening);
    jkModal.appendChild(ok);
    document.body.appendChild(jkModal);
  }

  function appendJkLine(parent, text, color, strike) {
    const p = document.createElement('p');
    p.textContent = text;
    Object.assign(p.style, { margin: '4px 0', fontSize: '12.5px', lineHeight: '1.6', color });
    if (strike) { p.style.textDecoration = 'line-through'; p.style.opacity = '0.55'; }
    parent.appendChild(p);
  }

  // 开局流程（12-ui resetGame 末尾调用，同温酒客 openWenjiukeOpening 口径）：非九克之王直接放行；
  // 九克之王先抽六对（grantJiukePairs 登记生效）并弹确认模态。BOSS 试炼 / 图鉴挑战不豁免（同温酒客无难度口径）
  function openJiukeOpening(hasPilotJk) {
    if (!hasPilotJk) return false;
    grantJiukePairs();
    ensureJkModal();
    const list = document.getElementById('jiukeModalList');
    list.innerHTML = '';
    for (const d of jiukeDraws) {
      if (d.sp != null) {   // 第六对：特殊词条一对（2026-11-23 用户定稿改一对）——对名 + 正/负文案；池空时缺省跳过
        const sp = AFFIX_SPECIAL[d.sp];
        if (sp) {
          appendJkHead(list, '特殊对 · ' + sp.name, JK_COLOR);
          appendJkLine(list, sp.good.icon + ' 正面 · ' + affixText(sp.good), '#4ade80');
          appendJkLine(list, sp.bad.icon + ' 负面 · ' + affixText(sp.bad), '#ff5a5a');
        }
        continue;
      }
      const g = AFFIX_DESIGN[d.gi];
      appendJkHead(list, g.grade, g.color);
      if (d.good == null) {
        appendJkLine(list, d.fbGood ? '⬆️ 保底正面 · ' + d.fbGood.text(d.fbGood.steps[d.gi]) : '⬆️ 保底正面 · 保底池暂空', '#4ade80');
      } else {
        const gd = g.good[d.good];
        appendJkLine(list, gd.icon + ' 正面 · ' + gd.name + '：' + affixText(gd), '#4ade80');
      }
      if (d.bad == null) {
        appendJkLine(list, d.fbBad ? '⬇️ 保底负面 · ' + d.fbBad.text(d.fbBad.steps[d.gi]) : '⬇️ 保底负面 · 保底池暂空', '#ff5a5a');
      } else {
        const bd = g.bad[d.bad];
        appendJkLine(list, bd.icon + ' 负面 · ' + bd.name + '：' + affixText(bd), d.off ? '#9c6b74' : '#ff5a5a', d.off);
      }
    }
    jkModal.style.display = 'flex';
    state.paused = true;   // 确认前冻结主循环
    return true;
  }

  function appendJkHead(parent, text, color) {
    const h = document.createElement('div');
    h.textContent = text;
    Object.assign(h.style, { margin: '8px 0 2px', fontSize: '13px', fontWeight: '700', color });
    parent.appendChild(h);
    return h;
  }

  function closeJiukeOpening() {
    if (jkModal) jkModal.style.display = 'none';
    state.paused = false;
  }

  function jiukeOpeningOpen() { return !!jkModal && jkModal.style.display === 'flex'; }


  export {
    AFFIX_DESIGN, AFFIX_SPECIAL, AFFIX_ENDING, AFFIX_UNIMPLEMENTED,
    affixHas, affixModalOpen, affixPlayerDamageMul, affixDamageClamp, affixDodgeRoll, affixMaxHpDelta,
    affixMainGunDamageMul,
    affixPlayerFlatReduce, affixEnemyDmgAdd, affixEnemyFirstIvMul, affixEnemyIvMul, affixEnemyHpAdd,
    affixEnemyBulletSpdAdd, affixEnemySpeedAdd, affixWingCritChance, affixDropRateAdd,
    affixEnemyRushChance, affixEnemyUndyingChance, affixEnemyDeathAttackChance,
    affixNegReduceChance, affixNegAddChance,
    affixNoteBossKill, affixBossShieldMul, affixBossHpMul, affixBossDmgMul, affixBossIvMul, takeAffixNextBossMods,
    affixFireIv, affixSubIv, affixWingIv, affixBerserkDur, affixBerserkDurView,
    affixCrystalShieldDur, affixCrystalExtend, affixResetShieldExt,
    affixXinguodongRings,
    affixFreezeNote,
    queueAffixSelection, tickAffixPending, tickAffixBerserkDrop, registerAffixBerserkDrop, resetAffixRunState,
    affixOwnedEntries,
    affixText, affixEncyText,
    affixInvulnAdd, affixBulwarkAbsorbDmg, affixBulwarkTakeBonus, affixBulwarkOnTrigger,
    openWenjiukeOpening, closeWenjiukeOpening, wenjiukeOpeningOpen, wenjiukeBossRoundKill,
    registerWenjiukeRemoved, wenjiukeDebuffEntries,
    openJiukeOpening, closeJiukeOpening, jiukeOpeningOpen,
  };
