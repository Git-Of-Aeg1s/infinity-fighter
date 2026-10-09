// 01-config（拆分过渡壳）：《并行开发改造设计.md》批次 1c 逐域迁出后的剩余域；批次 1d 删除本壳（暂保留【临时】构建标记行）







  console.log('[InfinityFighter] JS build: 20260925-v035-1');   // 【临时】构建标记：验证浏览器缓存是否已刷新，确认后删除





  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：02-achievements(4 名)


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
    ACHIEVEMENTS, ACHIEVEMENT_TIERS, ACHIEVEMENT_TIER_ORDER, ACHIEVEMENT_INFINITY_ENABLED,
  };
