// 03b-affix：BOSS 击坠三选一词条系统（2026-11-09 实装）

  // 模块契约（并行修改请先读；node tools/check-names.js 静态强制校验 import/export）
  // 被依赖：04-spawn(1 名) 05-boss(2 名) 06-enemy(4 名) 07-player(13 名) 08-entities(6 名) 12-ui(9 名) 13-encyclopedia(3 名) 14-main(7 名)
  // 依赖：01-config-core 01-config-difficulty 01-config-loadout 02-core
  // 本文件写共享状态：state.paused（词条选择期间暂停主循环，12-ui togglePause 受 affixModalOpen 门控）
  // 加载序：本文件在 03-audio 之后、04-spawn 之前——下游 04/05/06/07/08/12/13/14 单向引用本模块；
  // 本模块严禁 import 下游模块（防循环依赖）——需要下游能力的词条（如生成道具）由 14-main 等下游侧消费 affixHas 实现

  import { CANVAS_H, CANVAS_W } from './01-config-core.js';
  import { isPoem } from './01-config-difficulty.js';
  import { SUB_WEAPONS, PLANES, WINGMEN_CFG, berserkDuration, crystalShieldDur, currentPlane, currentWingman } from './01-config-loadout.js';
  import { player, rand, spawnParticles, state, xinRings, bossFlow } from './02-core.js';


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
  // 配套设计：删除驾驶员 东坤蝰 / 龚粥，其技能移入词条池（见 13-encyclopedia 页尾注）。
  // 文案纪律：以下正负面条目为用户逐字口述定稿，照录不得改写措辞（同图鉴 desc/lore 纪律）。
  // 2026-11-09 二轮改版：词条加 name 字段（**当前全部为占位名，待用户逐条定稿**，定稿后直接改 name 即可，
  // 图鉴/选择界面自动跟随）；good/bad 由字符串数组改为 {name, text} 对象数组（text = 用户逐字定稿文案，照录禁改）。
  const AFFIX_DESIGN = [
    { grade: '虚象级', color: '#7fe8c9',
      good: [
        { name: '萧杨杨', icon: '🎲', text: '每次升级波次等级时，均有1%概率触发一次抽卡。（萧杨技能）' },
        { name: '又春花', icon: '❤️', text: '战机血量增加25。' },
        { name: '恒则成', icon: '🔥', text: '每次升级波次等级时，有10%概率从场地下方朝上射出5个辛国栋之怒Lv4的火环。这几个火环之间均匀分布，中间的首先出现。' },
        { name: '侯琏琵', icon: '⚖️', text: '战机单次受到的伤害不会再超过50。' },
        { name: '苏沐哲', icon: '🔒', text: '战机的火力等级不会再因为受击而减少。' },   // 2026-11-06 自具象级正面移入（原括注「（改到虚象级）」为操作指示不入文案）
        { name: '杭方衍', icon: '😤', text: '战机处于无敌时间时启动暴走状态。（处于护盾时不启动，另外这个特殊的暴走状态结束后仍回到原来的火力等级+这段时间拾取的升级套件等级，如果暴走时被击中，则延长1s暴走时长，可以突破上限）' },
        { name: '张黄昏', icon: '💥', text: '战机受到伤害时，立刻对周围250px内所有敌人造成40倍等同伤害。（诗篇难度提高至80倍）' },
        { name: '予临翎', icon: '⭐', text: '时空允诺的每轮射弹有0.5%全部转化为捣蛋来袭的导弹。（仅在选择时空允诺时会出现这个词条）' },
        { name: '夏郢陵', icon: '🚀', text: '混乱将至的每轮射弹有0.5%全部转化为捣蛋来袭的导弹。（仅在选择混乱将至时会出现这个词条）' },
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
        { name: '龚粥', icon: '❤️‍🩹', text: '所有量子护盾道具变为血量增加道具（不受掉落限制），但所有血量增加道具回复量改为25%血量。' },
        { name: '封夜', icon: '🛸', text: '所有增生侧翼艇不再召唤卫护飞船。' },
        { name: '布药莲', icon: '📦', text: '拾取任意道具时，均有10%概率在顶部生成一个同类道具。（额外生成的爆弹不受掉落限制）' },
        { name: '金木木', icon: '💎', text: '所有BOSS血量降至40%时必定掉落一个结晶护盾，但结晶护盾的持续时长减少0.5s。' },
        { name: '俊隽', icon: '👁️', text: '战机有20%概率闪避攻击。' },
        { name: '离螱', icon: '🛡️', text: '战机每次击坠BOSS时获得5层伤害减免，每层减少12%受到的伤害。（至多5层）' },
        { name: '墨璃', icon: '⏳', text: '拾取水晶能够延长结晶护盾的持续时长，至多通过此种方式延长2s。（仅在有途径召唤结晶护盾时出现本词条）' },
      ],
      bad: [
        { name: '穆毅', icon: '🟠', text: '橙旋侧翼艇的子弹环绕半径扩大至1.5~2.2倍。' },
        { name: '龙凌', icon: '🌕', text: '赤月侧翼艇的逻辑改为登场后每1s发射一枚子弹，每次射击后射击间隔-0.1s，最多减少到0.2s。' },
        { name: '玄浩航', icon: '⚡', text: '紫电侧翼艇现在同时拥有黄芒侧翼艇的能力，即入场 1.2~2.8s 后追踪玩家方向射出一发子弹。' },
        { name: '黎宇', icon: '🌟', text: '黄芒侧翼艇现在发射三发散弹，子弹间的夹角为随机20~30度。' },
        { name: '时少凯风', icon: '⬆️', text: '下一个BOSS得到小幅增强。' },
        { name: '王妍', icon: '🏹', text: '赤红突击艇等1A级突击艇的首次攻击间隔减少50%。' },
        { name: '霸彪', icon: '🔵', text: '矩阵类敌人（法术矩阵、法术阵列、战争矩阵，还有脉冲矩阵的扩散半径）的射弹尺寸增大20%。' },
        { name: '雷偷煦旭', icon: '↔️', text: '法术大师A1、法术大师A2在横移期间受到的所有伤害降低60%，且横向移动速度增大50%（不会导致出界）。' },
        { name: '朱蠕', icon: '⭕', text: '御4和铁砧同时能释放双方的光环。' },
        { name: '孙垚', icon: '❄️', text: '寒霜和焦香螺旋桨同时能释放双方的光环。' },
        { name: '百演螂', icon: '🪖', text: '所有炮火先兆者及其变体受到的伤害降低10%；导弹的预警时长减少0.5s。' },
        { name: '随世', icon: '🌊', text: '浮海飘航者、破片、破片U型登场时获得1.5s虚化护盾。' },
        { name: '逢殇', icon: '🩹', text: '战机受到的所有伤害提高20%。' },
        { name: '马大笑', icon: '🔁', text: '法术大师A2被击坠时召唤一个法术大师A1。（逻辑类似法术阵列召唤法术矩阵，旋转着出场）' },
        { name: '黎龘', icon: '🏆', text: '愧悔魂灵圣杯的血量增加60%。' },
        { name: '张丈天', icon: '🏃', text: '所有敌人的入场速度和入场速度的对应加速度均提高40%。' },   // 2026-11-10 自虚象级 bad 移入（追加末位 → id 1:bad:15；强度 ×1.4；同持方苟辟时取强）
      ] },
    { grade: '真我级', color: '#ff5a5a',
      good: [
        { name: '东坤蝰', icon: '⏱️', text: '暴走时长增加0.5s，每触发过一次暴走，这个时长就增加0.01s。' },
        { name: '段虓', icon: '🎖️', text: '斗志昂扬无人机现在在每次升级波次等级时均有额外的4%生成概率，且BOSS的血量每减少10%也会触发一次这个判定；斗志昂扬期间击杀敌人时，会立刻清除其发射的场上的所有弹幕；但斗志昂扬期间敌人的攻击间隔减少40%。' },
        { name: '贾苏读', icon: '🔫', text: '副武器的射击间隔减少40%。' },
        { name: '规浩云', icon: '✈️', text: '僚机的射击间隔减少30%。' },
        { name: '李扶摇', icon: '🎯', text: '战机的攻击间隔减少20%。' },
      ],
      bad: [
        { name: '东方落雪', icon: '🦠', text: '所有白影侧翼艇替换为增生侧翼艇。' },
        { name: '贾德茗', icon: '⏫', text: '下一个BOSS得到大幅增强。' },
        { name: '桀煌', icon: '🔴', text: '所有红色敌人的攻击间隔减少30%（不含BOSS）。' },
        { name: '郑宣沐', icon: '🟡', text: '所有黄色敌人登场时均获得200屏障（不含BOSS）。' },
        { name: '於樾', icon: '💭', text: '虚幻的攻击范围和爆炸范围扩大30%，持续时长增加8s；虚幻和寒霜的减速区域范围扩大30%。' },
        { name: '義灏玺', icon: '🐦', text: '暴鸰和暴鸰·G的血量和攻击力（对敌我双方的攻击力均）翻倍。' },
        { name: '凌涟翌', icon: '💢', text: '所有赤红战舰等3A类战舰，释放技能后有10%概率使得下一次攻击间隔减少80%。（跟其他乘区为乘算关系，也即乘0.2）' },
        { name: '刘重天', icon: '🔄', text: '所有赤红主力舰等4A类主力舰，释放技能完毕后均会立刻再释放一轮同种技能（技能间隔按照后面那一轮技能结束再开始算）。' },
        { name: '逢离歌', icon: '📉', text: '战机血量上限减少35。' },
        { name: '应堕', icon: '💣', text: '高能爆弹和绷绷炸弹的伤害降低80%。' },
        { name: '王东阳', icon: '🎒', text: '高能爆弹和绷绷炸弹的携带上限减少1（不会低于1）。' },
        { name: '陈斯羽', icon: '⬇️', text: '所有赤红突击艇等2A级突击艇和护卫艇的停留位置下移随机20%~30%屏幕高度。' },
        { name: '奕巽', icon: '👑', text: '所有4S敌人的攻击间隔减少20%，且技能获得增强。' },
      ] },
    { grade: '诗篇级', color: '#c084fc',
      good: [
        { name: '天爵', icon: '🗡️', text: '所有自侧翼出现的敌人受到的伤害提高150%。' },
        { name: '慕容爵', icon: '🪃', text: '战机不再受到敌方导弹的伤害，且机身任意位置碰到敌方导弹时将之朝射来的相反方向反弹。反弹的导弹能够贯穿非4类和非BOSS敌人，穿透造成3000+5%最大生命值（不超过1500）伤害，且击中4类敌人或BOSS敌人时爆炸，对周围所有敌人造成3000+5%最大生命值（不超过1500）伤害。一个敌人能够同时受到爆炸伤害和贯穿伤害。爆炸范围同副武器捣蛋来袭的导弹。反弹时出现特殊音效和特效，且反弹后立刻进入无敌状态（持续时长同受击）。持有这个词条时，所有敌方导弹的预警线将会变为蓝色。' },
        { name: '逢淞', icon: '🧊', text: '累计命中敌人20次或者累计造成2500伤害后，立刻使敌人冻结随机1.5~2s。（冻结：颜色变深蓝，立刻停止移动、攻击和技能，失去虚化护盾和所有减伤。焦香螺旋桨、御4等力场型敌人在被冻结后光环暂时消失且失去效果；焦香螺旋桨冻结复原后永久失去自身所有光环效果；寒霜和虚幻无法被冻结）' },
        { name: '王宇都', icon: '🥧', text: '击坠1/2/3/4/5类敌人时，有0.5%/2%/5%/10%/100%概率朝上发射一个黑暗之手同款的旋转大蛋挞，大蛋挞能够消除自身碰到的敌方子弹，且对首次碰到的敌人造成3000点伤害，随后每0.1s对接触的敌人造成200点伤害。召唤大蛋挞有15s冷却时间。' },
      ],
      bad: [
        { name: '帝千邪', icon: '🟣', text: '所有紫色敌人被击坠时，朝下释放一颗子弹。（逻辑同紫电侧翼艇；紫色敌人包括卫护飞船，不包括任何长歌级敌人；紫电侧翼艇这种已经有一颗子弹亡语的不再有这个词条）' },
        { name: '翔太初', icon: '⬆️', text: '所有BOSS均得到小幅增强。' },
        { name: '祝陨穹', icon: '🔀', text: '炮火先兆者、先导炮火先兆者生成时，均有65%概率随机替换为中枢炮火先兆者和极夜炮火先兆者。所有中枢炮火先兆者和极夜炮火先兆者的攻击间隔减少20%。' },   // 2026-11-06 替换旧「随机替换」词条（原括注为操作指示不入文案）；2026-11-09 概率 75%→65%
        { name: '孤落', icon: '👻', text: '每次波次等级提升时均有5%概率召唤一个战争幽灵，且所有战争幽灵的技能释放间隔改为固定0.4s。' },
        { name: '西门诩', icon: '🎭', text: '战争矩阵现在每次攻击时同时释放两个技能，但攻击间隔增大0.5s。' },
        { name: '叶星凡', icon: '🦋', text: '浮海飘航者、破片、破片U型生成时，均有65%概率替换为破茧之梦。所有破茧之梦的移动速度提升30%。' },
        { name: '杉蔚硙', icon: '⏸️', text: '暴鸰、暴鸰·G、虚幻生成时，均有65%概率替换为静滞虚幻。所有静滞虚幻的移动速度提升30%。' },
      ] },
    { grade: '长歌级', color: '#ff9d3c',
      good: [
        { name: '归海泷烽', icon: '🎁', text: '场上每随机15~35s掉落一个暴走道具。' },   // 2026-11-06 替换旧「升级道具 50% 变暴走」词条（原括注为操作指示不入文案）
        { name: '沐景', icon: '💠', text: '每次受到伤害后立刻触发结晶护盾。' },
        { name: '陈幻世', icon: '🧹', text: '击坠敌人时，40%概率立刻消除其残留在场上的所有弹幕。' },
        { name: '令雨汐', icon: '🚫', text: '禁用所有敌人的亡语效果，禁用所有虚象级、真我级、长歌级的负面词条，所有S类敌人（包括4S和5S等）的血量减少95%。拥有这个词条时，后续选择词条页面的对应不生效的负面词条会被划掉。' },
      ],
      bad: [
        { name: '朱天', icon: '⏫', text: '所有BOSS均得到大幅增强。' },
        { name: '鸠', icon: '⏩', text: '所有敌人因停留而降低攻击间隔的这个时间点提前3s。' },
        { name: '罗弋', icon: '🩸', text: '战机受到的所有伤害提高70%。' },
        { name: '嬴乾', icon: '🚨', text: '高危波次的刷新概率大幅增加。' },
        { name: '翙', icon: '🤖', text: '每次波次等级提升时均有8%概率召唤一个随机的强化4S敌人。' },
        { name: '王未焚', icon: '💀', text: '所有敌人被击坠时，向其朝向方向释放一颗子弹。（子弹逻辑同紫电侧翼艇的亡语）' },
        { name: '郗若', icon: '🆘', text: '所有BOSS敌人血量首次低于50%时，召唤一名随机的4S敌人协同作战。' },
      ] },
  ];

  // 特殊类绑定词条（2026-11-06 新增）：好/坏效果绑定成对出现（不参与好/坏独立抽取，整对绑定登场）；
  // 即使诗篇难度（每选项两对词条）下，每个选项也仅会出现一对特殊词条（对名 2026-11-10 用户定稿；
  // 正负面不设独立名字——用户定稿，仅显示对名 + 正面/负面文案）
  const AFFIX_SPECIAL = [
    { name: '纵逭灭',
      good: { icon: '♾️', text: '战机可以永久保持暴走状态（此时右下角不再显示读条）。' },
      bad: { icon: '🌀', text: '所有敌人的攻击间隔减少50%。' } },
    { name: '澪叶',
      good: { icon: '🏎️', text: '战机的移动速度提高50%。' },
      bad: { icon: '🐌', text: '所有敌方子弹的弹速降低50%。' } },
  ];

  // ---------- 暂缓放出词条登记（2026-11-09 首批实装） ----------
  // id 规则：`档位序号:good|bad:条目序号`（档位 0虚象 1具象 2真我 3诗篇 4长歌）；特殊对用 `sp0` / `sp1`。
  // 登记语义：①不参与抽取（rollPair 已过滤）；②图鉴词条页标题加 * 标记（13-encyclopedia renderInfoAffix 消费）。
  // 登记情形：B=已实装但设计未定稿（实现代码保留，用户确定后移出即放出）。
  // 1:bad:14 愧悔魂灵圣杯（具象级，+60%）已于 2026-11-10 随占位敌人圣杯实装移出（见 04-spawn makeEnemy 血量钩子）；
  // 3:bad:5 叶星凡（破茧替换）/ 3:bad:6 杉蔚硙（静滞替换）已于 2026-11-11 随占位敌人破茧之梦 / 静滞虚幻实装移出
  //（65% 生成替换见 04-spawn spawnPopian/spawnVoyager/spawnBaoling 系入口，移速 +30% 见 spawnCocoonDream/spawnStasisUnreal speedMul）；
  // 4:bad:3 嬴乾（高危频发）已于 2026-11-11 效果定稿实装移出（波次 tier 权重修正见 01-config-spawn waveAffixTierW，
  // 侧翼触发概率与额外波次追加见 pickPoemFlankCard / 14-main affixExtraWaveBurst；原 affixDangerWaveMul ×5 占位退役）
  const AFFIX_UNIMPLEMENTED = new Set([
    // —— B：已实装、设计未定稿（2026-11-09 用户定稿暂缓放出；实现保留，移出即恢复入池）——
    // BOSS 增强类
    '1:bad:4',    // 下一个BOSS小幅增强（affixBossHpMul ×1.25 一次性）
    '2:bad:1',    // 下一个BOSS大幅增强（affixBossHpMul ×1.5 一次性）
    '3:bad:1',    // 所有BOSS小幅增强（affixBossHpMul ×1.25 持续）
    '4:bad:0',    // 所有BOSS大幅增强（affixBossHpMul ×1.5 持续）
    // 敌人颜色类（enemyColorTags 域）
    '2:bad:2',    // 红色狂潮：红色敌人攻击间隔 -30%（enemyFireIvMul ×10/7）
    '2:bad:3',    // 黄金壁垒：黄色敌人登场 200 屏障（updateEnemies 懒施加 + 黄色护罩渲染）
    '3:bad:0',    // 紫色亡语：紫色敌人击坠朝下放弹（killEnemy 钩子）
  ]);

  // 绑定词条出场条件（0:good:7/8 文案括注定稿「仅在选择时空允诺/混乱将至时会出现这个词条」——
  // 2026-11-11 僚机「群星允诺」更名「时空允诺」，括注装备名随更名同步；绑定判定按 id 不变）：
  // 仅当当前僚机为时空允诺（stars）/ 当前机型为混乱将至时才入抽取池
  function affixIdOfferable(id) {
    if (id === '0:good:7') return currentWingman === WINGMEN_CFG.stars;
    if (id === '0:good:8') return currentPlane === PLANES.chaos;
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
  };

  // 本局已选词条 id 列表（affixHas 全局查询的唯一真源）
  const affixIds = [];

  // ---------- 一次性占用制 + 保底阶梯（2026-11-11 用户定稿） ----------
  // affixUsedIds：全场占用表——词条页选过 / 温酒客开局抽走的词条 id 都算占用，不再出现在后续任何选项。
  // 特殊对按 'sp0'/'sp1' 同规则占用（rollSpecial 过滤）。保底项无限供应、不占池、不进占用表。
  const affixUsedIds = new Set();
  // 等级全占用 → 该等级抽取权重 ×0.4（用户定稿「当一个等级的词条（不管正面还是负面）抽完后」）
  const FALLBACK_TIER_W = 0.4;
  // 保底正面阶梯（仅词条页触发；仅加战机本体/主炮伤害，不含副武器与僚机——消费见 08-entities 主炮弹结算）：
  // 档位 [8%,16%,24%,32%,40%] 逐档递进，无限叠加不封顶（第 6 条起每条仍按 40% 档乘算）
  //（前三档 2026-11-11 用户定稿 v0.5.0 后微调：+10%/18%/26% → +8%/16%/24%）
  const FALLBACK_POS_STEPS = [0.08, 0.16, 0.24, 0.32, 0.40];
  let affixFallbackPosCount = 0, affixFallbackPosMul = 1;
  // 保底负面阶梯（词条页负面槽耗尽 / 温酒客开局 5 连抽池空共用同一条阶梯）：
  // 档位 [20%,30%,40%,50%,60%] 逐档递进，无限叠加不封顶——消费并入 affixPlayerDamageMul
  const FALLBACK_NEG_STEPS = [0.20, 0.30, 0.40, 0.50, 0.60];
  let affixFallbackNegCount = 0, affixFallbackNegMul = 1;
  function fallbackStepMul(steps, count) { return 1 + steps[Math.min(count, steps.length - 1)]; }

  // ---------- 温酒客开局 DEBUFF（2026-11-11 用户定稿效果重做） ----------
  // 开局立刻获得 5 个随机负面：复用负面词条池 id 存独立数组（不进 affixIds，不污染词条页/图鉴快照）；
  // 结算全部经 affixHas 收口（含本数组）→ 失效 = 移除 id 即自动卸载全部效果。
  // 受令雨汐影响：抽取时跳过被禁等级（0/2/4 级，affixBadDisabled 判定），与词条页负面同口径。
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
  // 负面保底阶梯档位值并入——温酒客 5 连抽池空 / 词条页负面槽耗尽共用，无限叠加不封顶）
  function affixPlayerDamageMul() {
    let mul = 1;
    if (affixHas('1:bad:12')) mul *= 1.2;
    if (affixHas('4:bad:2')) mul *= 1.7;
    mul *= affixFallbackNegMul;
    return mul;
  }

  // 保底正面乘区（仅战机本体/主炮弹消费——08-entities 主炮结算处挂 b.mainGun 判定；僚机/副武器不乘）
  function affixMainGunDamageMul() {
    return affixFallbackPosMul;
  }

  // 单次伤害上限（虚象级 0:good:3：单次不超过 50）
  function affixDamageClamp(amount) {
    if (affixHas('0:good:3') && amount > 50) return 50;
    return amount;
  }

  // 闪避掷骰（具象级 1:good:4：20% 概率闪避）
  function affixDodgeRoll() { return affixHas('1:good:4') && Math.random() < 0.2; }

  // 血量上限修正（0:good:1 +25 / 2:bad:8 -35；选择瞬间一次性生效，重生时经 armorMaxHp 后补差）
  function affixMaxHpDelta() {
    let d = 0;
    if (affixHas('0:good:1')) d += 25;
    if (affixHas('2:bad:8')) d -= 35;
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

  // BOSS 血量乘区（05-boss spawnBoss 四处 hp 计算调用）：
  //   「下一个 BOSS 小幅/大幅增强」= 一次性乘区（1:bad:4 ×1.25 / 2:bad:1 ×1.50，消费即耗尽）
  //   「所有 BOSS 小幅/大幅增强」= 常驻乘区（3:bad:1 ×1.25 / 4:bad:0 ×1.50）
  //   数值口径：小幅 +25%、大幅 +50%（设计稿未给定值，实装定档；调整只改本处）
  function affixBossHpMul() {
    let mul = 1;
    if (affixHas('3:bad:1')) mul *= 1.25;
    if (affixHas('4:bad:0')) mul *= 1.5;
    if (affixHas('1:bad:4')) { mul *= 1.25; affixIds.splice(affixIds.indexOf('1:bad:4'), 1); }   // 一次性：消费即移除
    if (affixHas('2:bad:1')) { mul *= 1.5; affixIds.splice(affixIds.indexOf('2:bad:1'), 1); }
    return mul;
  }

  // 攻击间隔乘区（真我级 2:good:4 主炮 / 2:good:2 副武器 / 2:good:3 僚机——间隔越乘越小）
  function affixFireIv() { return affixHas('2:good:4') ? 0.8 : 1; }
  function affixSubIv() { return affixHas('2:good:2') ? 0.6 : 1; }
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
    // 一次性占用制：槽位池空 → 保底项顶上（good 空出保底正面 / bad 空出保底负面；null 表示该槽走保底）
    if (!gs.length && !bs.length) return null;   // 双槽皆空：该等级整个走保底由 buildOption 决定
    return {
      gi,
      good: gs.length ? gs[(Math.random() * gs.length) | 0] : null,   // null = 保底正面
      bad: bs.length ? bs[(Math.random() * bs.length) | 0] : null,    // null = 保底负面
    };
  }

  // 特殊对抽取：从已实装特殊对中等权选一（是否出特殊对由 drawAffixCategory 的权重通道决定）
  function rollSpecial() {
    const sp = [];
    AFFIX_SPECIAL.forEach((_, i) => {
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
  // 不再需要池空顺延。诗篇难度每选项两对（同档位）；特殊对为附加行（不替换常规对，诗篇下同样至多一对）
  function buildOption() {
    let cat = drawAffixCategory();
    let sp = null;
    if (cat === AFFIX_DESIGN.length) {
      sp = rollSpecial();
      if (sp == null) cat = 0;   // 特殊对占用完 → 回退常规档位通道
    }
    const gi = cat === AFFIX_DESIGN.length ? 0 : cat;
    const pair = rollPair(gi) || { gi, good: null, bad: null };   // 双槽皆空 → 双保底选项
    const pairs = isPoem() ? [pair, rollPair(pair.gi) || { gi: pair.gi, good: null, bad: null }] : [pair];
    return { pairs, sp, refreshed: false };
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
      return t ? { kind: 'entry', grade: g.grade, side: parts[1], name: t.name, icon: t.icon, text: t.text } : null;
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
      if (pr.good == null) {   // 保底正面：仅战机本体伤害阶梯（档位按触发次数递进）
        affixFallbackPosMul *= fallbackStepMul(FALLBACK_POS_STEPS, affixFallbackPosCount);
        affixFallbackPosCount++;
      } else {
        const gid = pr.gi + ':good:' + pr.good;
        affixIds.push(gid);
        affixUsedIds.add(gid);   // 一次性占用制：选过即占，不再出现在后续选项
        applyInstant(gid);
      }
      if (pr.bad == null) {   // 保底负面：受伤阶梯（与温酒客 5 连抽池空共用同一条阶梯）
        affixFallbackNegMul *= fallbackStepMul(FALLBACK_NEG_STEPS, affixFallbackNegCount);
        affixFallbackNegCount++;
      } else {
        const bid = pr.gi + ':bad:' + pr.bad;
        affixUsedIds.add(bid);   // 占用先于禁用判定——被令雨汐禁用的负面同样算占用（选了只得不到）
        // 词条（长歌级 4:good:3 = 令雨汐）负面禁用：被禁负面不登记不结算（选项页中划掉显示，见 renderAffixModal）
        if (!affixBadDisabled(bid)) {
          affixIds.push(bid);
          applyInstant(bid);
        }
      }
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

  // 刷新一个选项（每选项至多 1 次；整选项重掷——稀有度与词条均重抽）
  function refreshOption(oi) {
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
    sub.textContent = '必须且只能选择一个选项（诗篇难度每选项两对词条）· 选择后本局生效';
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
        appendLine(card, sp.good.icon + ' 正面 · ' + sp.good.text, '#4ade80', 400);
        appendLine(card, sp.bad.icon + ' 负面 · ' + sp.bad.text, '#ff5a5a', 400);
      }
      for (const pr of opt.pairs) {
        // 保底槽（pr.good/pr.bad 为 null，2026-11-11 用户定稿）：展示当前档位值（触发后档位递进、无限叠加）
        if (pr.good == null) {
          const pct = Math.round((fallbackStepMul(FALLBACK_POS_STEPS, affixFallbackPosCount) - 1) * 100);
          appendLine(card, '⬆️ 正面 · 保底强化：我方战机本体伤害增加 ' + pct + '%', '#4ade80', 400);
        } else {
          const gd = AFFIX_DESIGN[pr.gi].good[pr.good];
          appendLine(card, gd.icon + ' 正面 · ' + gd.name + '：' + gd.text, '#4ade80', 400);
        }
        if (pr.bad == null) {
          const pct = Math.round((fallbackStepMul(FALLBACK_NEG_STEPS, affixFallbackNegCount) - 1) * 100);
          appendLine(card, '⬇️ 负面 · 保底代价：我方战机受到的伤害增加 ' + pct + '%', '#ff5a5a', 400);
        } else {
          const bd = AFFIX_DESIGN[pr.gi].bad[pr.bad];
          // 词条（长歌级 4:good:3 = 令雨汐）负面禁用：被禁负面划掉显示（仍可选——选中只得到正面，负面不登记不结算）
          const badOff = affixBadDisabled(pr.gi + ':bad:' + pr.bad);
          appendLine(card, bd.icon + ' 负面 · ' + bd.name + '：' + bd.text, badOff ? '#9c6b74' : '#ff5a5a', 400, badOff);
        }
      }
      const rbtn = document.createElement('button');
      rbtn.textContent = affixFlow.refreshed[oi] ? '已刷新' : '刷新此选项';
      Object.assign(rbtn.style, {
        marginTop: '10px', fontSize: '12px', padding: '4px 10px', cursor: affixFlow.refreshed[oi] ? 'default' : 'pointer',
        background: 'rgba(255,255,255,0.08)', color: affixFlow.refreshed[oi] ? '#77809a' : '#dfe6f5',
        border: '1px solid rgba(160,180,220,0.4)', borderRadius: '6px',
      });
      rbtn.addEventListener('click', (ev) => { ev.stopPropagation(); refreshOption(oi); });
      card.appendChild(rbtn);
      card.addEventListener('click', () => chooseOption(oi));
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

  function openAffixSelection() {
    affixFlow.pendingT = 0;
    affixFlow.open = true;
    // 档位权重门控（affixTierWOverride）：命中 storm2 / 第五轮击坠 → 虚象/具象权重归零的会话覆盖
    //（含本会话内的选项刷新，同一次抽取规则一致；close 时清空）
    affixFlow.sessionTierW = affixTierWOverride() ? [0, 0, ...AFFIX_DRAW_WEIGHTS.slice(2)] : null;
    affixFlow.options = [buildOption(), buildOption(), buildOption()];
    affixFlow.refreshed = [false, false, false];
    state.paused = true;   // 选择期间冻结主循环（14-main 战斗块停走、渲染保留最后一帧）
    renderAffixModal();
    affixModal.style.display = 'flex';
  }

  function closeAffixSelection() {
    affixFlow.open = false;
    affixFlow.sessionTierW = null;   // 会话级档位门控覆盖用毕即清（下次抽取按最近击坠重新判定）
    if (affixModal) affixModal.style.display = 'none';
    state.paused = false;
  }

  // 跨局重置（12-ui resetGame 调用）：清空已选词条 / 占用表 / 保底阶梯 / 温酒客 DEBUFF / 界面 / 计数器 / 倒计时
  function resetAffixRunState() {
    affixIds.length = 0;
    affixUsedIds.clear();
    affixFallbackPosCount = 0; affixFallbackPosMul = 1;
    affixFallbackNegCount = 0; affixFallbackNegMul = 1;
    wenjiukeAffixIds.length = 0;
    wjkDraws.length = 0;
    wjkTwinKilled.storm = false;
    wjkTwinKilled.storm2 = false;
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
    if (affixModal) affixModal.style.display = 'none';
    if (wjkModal) wjkModal.style.display = 'none';
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
      if (!cands.length) {   // 全部等级 bad 槽耗尽 → 负面保底阶梯（档位递进、无限叠加）
        affixFallbackNegMul *= fallbackStepMul(FALLBACK_NEG_STEPS, affixFallbackNegCount);
        affixFallbackNegCount++;
        wjkDraws.push({ kind: 'fallback' });
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
        p.textContent = t.icon + ' ' + t.name + '：' + t.text;
        p.style.color = d.off ? '#9c6b74' : '#ff5a5a';
        if (d.off) p.style.textDecoration = 'line-through';
      } else {
        const pct = Math.round((fallbackStepMul(FALLBACK_NEG_STEPS, affixFallbackNegCount) - 1) * 100);
        p.textContent = '⬇️ 保底代价：我方战机受到的伤害增加 ' + pct + '%';
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


  export {
    AFFIX_DESIGN, AFFIX_SPECIAL, AFFIX_UNIMPLEMENTED,
    affixHas, affixModalOpen, affixPlayerDamageMul, affixDamageClamp, affixDodgeRoll, affixMaxHpDelta,
    affixMainGunDamageMul,
    affixNoteBossKill, affixBossShieldMul, affixBossHpMul,
    affixFireIv, affixSubIv, affixWingIv, affixBerserkDur, affixBerserkDurView,
    affixCrystalShieldDur, affixCrystalExtend, affixResetShieldExt,
    affixXinguodongRings,
    affixFreezeNote,
    queueAffixSelection, tickAffixPending, tickAffixBerserkDrop, registerAffixBerserkDrop, resetAffixRunState,
    affixOwnedEntries,
    openWenjiukeOpening, closeWenjiukeOpening, wenjiukeOpeningOpen, wenjiukeBossRoundKill,
    registerWenjiukeRemoved, wenjiukeDebuffEntries,
  };
