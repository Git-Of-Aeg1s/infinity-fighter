// 13-encyclopedia：怪物图鉴数据 / UI / 形态预览绘制
'use strict';


  // ---------- 怪物图鉴 ----------
  const ENCY_GRADES = [
    { name: '虚象级', entries: ['side_pass', 'side_shoot', 'side_kamikaze', 'side_moon', 'prolifera'] },
    { name: '具象级', entries: ['striker_crimson', 'striker_amber', 'striker_azure', 'striker_white', 'striker_dusk', 'douzhi', 'fashiA1', 'popian'] },
    { name: '真我级', entries: ['gunship_violet', 'gunship_crimson', 'gunship_amber', 'harbinger', 'weilong', 'hanshuang', 'yu4', 'anvil', 'baoling', 'jiaoxiang', 'fashiA2'] },
    { name: '诗篇级', entries: ['capital_crimson', 'capital_azure', 'capital_crgold'] },
    { name: '长歌级', entries: ['boss', 'boss_storm'] },
  ];
  
  // 每种颜色变体独立成条目；type 用于绘制/生成，variant/behavior 用于强制指定变体/行为
  const ENCY_DATA = {
    side_pass: {
      name: '白影侧翼艇', type: 'side', behavior: 'pass', color: '#f0f0f5', hp: 1, score: 60,
      desc: '从侧上方斜插穿越战场，血量极低、一碰即碎。<b>无攻击</b>。1类编队权重 <b>65</b>（约 70%）。',
    },
    side_shoot: {
      name: '黄芒侧翼艇', type: 'side', behavior: 'shoot', color: '#ffd166', hp: 1, score: 60,
      desc: '从侧上方斜插穿越战场。<b>整场仅攻击一次</b>：追踪玩家方向射出一发子弹（弹速 230、伤害 6），首次攻击间隔较长。1类编队权重 <b>10</b>（约 10.8%）。',
    },
    side_kamikaze: {
      name: '紫电侧翼艇', type: 'side', behavior: 'kamikaze', color: '#c084fc', hp: 1, score: 60,
      desc: '从侧上方斜插穿越战场。<b>亡语：阵亡时向下垂直射出一发子弹</b>（弹速 ×1.1）。1类编队权重 <b>5</b>（约 5.4%）。',
    },
    side_moon: {
      name: '赤月侧翼艇', type: 'side', behavior: 'moon', color: '#ff3b30', hp: 1, score: 60,
      desc: '从侧上方斜插穿越战场。入场 <b>1.8~2.8s</b> 后的随机时刻朝航向正前方发射一枚子弹（仅此一次，弹速 230、伤害 6）；<b>到死未发射则有 12% 概率在阵亡时补射</b>。1类编队权重 <b>5</b>（约 5.4%）；掉落按红色标记结算（升级套件 ×1.5）。',
    },
    prolifera: {
      name: '增生侧翼艇', type: 'prolifera', color: '#7fe8c9', hp: 1, score: 60,
      // 衍生敌人无独立条目：卫护飞船连同图像一并在本条目中展示（详情大图右侧）
      child: { type: 'escort', color: '#6a5ce0' },
      desc: '从侧上方斜插穿越战场，<b>无攻击</b>。<b>击毁后分裂出 2~3 个卫护飞船</b>沿原航向漂移；<b>加血套件掉率固定 10%</b>。1类编队权重 <b>8</b>（约 8.6%）。<hr /><b>衍生 · 卫护飞船</b>：<b>深蓝紫渐变机体、边缘泛紫色光芒</b>（与水晶的浅蓝明显区分）；<b>无攻击</b>，随母舰航向漂移；碰撞 4.8、造成无敌时间 0.48s。<b>出厂必带虚化护盾：75% 概率 0.1s / 22% 概率 0.16s / 2% 概率 0.2s / 1% 概率 0.4s</b>（虚化期间不受伤害、我方炮弹穿过）。击毁后 <b>80% 掉 1 个水晶、20% 掉 2 个</b>。',
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
      desc: '在场地 30%~80% 高度的随机位置上方<b>渐显浮现</b>，下移停驻 <b>0.2s</b>（白环从核心掠过机体至边缘消失作预警），<b>白环散尽的同时</b>以随机方向为基准向四周<b>正六边形或正八边形（随机）</b>的均匀方向各射 1 发，随即下移同距<b>渐隐离场</b>。<b>无法碰撞</b>：与玩家互相穿过、不受撞机反伤。<b>击毁必定掉落 2~3 个水晶</b>。出现概率：Lv10 前 <b>1.2%</b>、Lv10 起 <b>4.8%</b>。',
    },
    gunship_violet: {
      name: '紫晶炮艇', type: 'gunship', variant: 'violet', color: '#c084fc', hp: 300, score: 400,
      desc: '技能循环：<b>正下方同向双连射</b>（不锁定玩家）→ <b>8 发环形爆发</b> → <b>追踪±5°双弹</b>（一次同时两发）→ <b>瞄准单发高速狙击</b>。',
    },
    gunship_crimson: {
      name: '赤红炮艇', type: 'gunship', variant: 'crimson', color: '#ff5a5a', hp: 300, score: 400,
      desc: '火力最猛的炮艇。技能循环：<b>瞄准三连射 + 左右双曲线弹流</b>（同时发射，弹流向两侧大幅外扩）→ <b>反向双曲线弹流</b>（右侧弹往左扫、左侧弹往右扫、向内交叉）→ <b>三方向三段齐射</b>（垂直向下与下±20°，每方向 2 发 ×3 段，第三段射完才重计攻击间隔）。',
    },
    gunship_amber: {
      name: '金曜炮艇', type: 'gunship', variant: 'amber', color: '#ffbf47', hp: 300, score: 400,
      desc: '技能交替：<b>“八”字形斜弹幕</b>（左右各一组对称斜弹、与竖直夹角 10°，快速连发两次、短暂间隔后再两次）→ <b>瞄准单发巨型弹</b>（伤害更高）。',
    },
    harbinger: {
      name: '炮火先兆者', type: 'harbinger', color: '#3a3f4a', hp: 777, score: 450,
      desc: '较慢入场，悬停于后排。<b>不直接开火</b>：核心充能 <b>3s</b> 后召唤垂直落下的导弹（<b>最多导引 4 次</b>），随后循环；就位约 <b>18s</b> 后停火开走。<br />导弹命中：<b>HP&lt;60 直接击杀</b>；HP≥60 损失 80% 当前血量且武器等级 -1。装甲对<b>僚机弹幕减伤 25%</b>，碰撞 12.5。',
    },
    weilong: {
      name: '威龙', type: 'weilong', color: '#ff9a1a', hp: 4567, score: 1200,
      desc: '从偏左/偏右半场出场，沿<b>蛇形路径</b>巡航（下降与横向靠边交替，途中停顿 2s 后向下离场），方向随出场侧镜像。每隔一段时间朝玩家射 <b>5 枚无偏转快弹</b>，<b>攻击时停止移动</b>。<b>血量 &lt;60% 后不计入场面压力</b>（≥60% 时拖慢敌方刷新）。<b>Lv10 起作为特殊 3 类槽位出场</b>。',
    },
    hanshuang: {
      name: '寒霜', type: 'hanshuang', color: '#8fd8ff', hp: 555, score: 450,
      desc: '<b>不攻击</b>：下移到场地 <b>72%~82%</b> 随机高度停留 <b>20s</b> 后离场。登场 1s 后展开<b>大范围冰蓝寒霜光圈</b>：圈内我方战机<b>射速 -35%、移速 -35%</b>（以核心位置判定）。<b>出厂随机携带虚化护盾</b>：30% 概率 1.5s / 20% 概率 2s / 10% 概率 2.5s / 5% 概率 5s。<b>Lv10 起作为特殊 3 类槽位出场</b>。优先击毁或撤离其光圈再输出。',
    },
    yu4: {
      name: '御4', type: 'yu4', color: '#d6c078', hp: 500, score: 450,
      desc: '<b>不攻击</b>：登场 <b>0.5s</b> 后展开<b>金色六边力场</b>，力场内<b>所有敌人受到的非真实伤害降低 30%</b>（<b>高能爆弹为真实伤害</b>，无视力场）。下降较慢，停留 <b>25s</b> 后离场；碰撞 15。<b>Lv10 前不出场</b>。优先击毁以免其庇护友军。',
    },
    anvil: {
      name: '铁砧', type: 'anvil', color: '#8ce36b', hp: 600, score: 450,
      desc: '<b>不攻击</b>：登场 <b>0.5s</b> 后展开<b>正方形治疗光环</b>，光环内<b>所有敌人（含自身）每秒回复 1% 最大生命 + 60 生命</b>。悬停于炮火先兆者前方，停留 <b>25s</b> 后离场。<b>Lv10 前不出场</b>。优先击毁以免其持续治疗敌军。',
    },
    baoling: {
      name: '暴鸰', type: 'baoling', color: '#e3e6ec', hp: 500, score: 400,
      desc: '自爆无人机：<b>不悬停</b>、径直下压，进入<b>索敌半径（1/3 屏幕长度）</b>即<b>停车锁定</b>——玩家位置浮现红色预警区，炸弹脱离后经 0.8s 低速下坠再<b>极速加速</b>冲向预警区中心爆炸：<b>玩家 40 伤害</b>（不伤敌人）。<b>预警区形成前被击毁则炸弹原地爆炸</b>，对圈内<b>所有单位</b>造成伤害（玩家 40 / 敌人 600 + 20% 最大生命、封顶 2600，可连锁殉爆）；<b>预警区一旦形成，炸弹即视为脱离——击毁暴鸰也无法终止，炸弹仍将抵达目标位置并爆炸</b>。投弹后<b>停留 1.2s</b> 再俯冲离场；碰撞 12。<b>玩家处于爆圈内时对暴鸰增伤 35%</b>（无论是否已投弹）。普通炮艇 <b>1.5%</b> 概率替换出现（成对编队则两架均为暴鸰）；<b>Lv10 起也占特殊 3 类槽位权重</b>。',
    },

    jiaoxiang: {
      name: '焦香螺旋桨', type: 'jiaoxiang', color: '#ff7a18', hp: 900, score: 600,
      desc: '<b>无碰撞伤害、不攻击</b>：登场后<b>绕大圈巡航</b>——<b>圆心与半径逐次随机</b>（半径 150~200、圈底位于场地 <b>84%~94%</b> 高度、圆心 X 屏中心附近随机），轨迹含轻微漂移且<b>不出场边</b>；圈底最低时光环<b>可灼烧到屏幕最下方</b>。<b>20%</b> 概率从<b>侧翼</b>出现。登场 <b>0.8s</b>（侧翼 <b>1.2s</b>）后展开<b>火焰光环</b>：光环内我方战机<b>每秒 -15 血量</b>，接近本体（半径 55 内）<b>伤害翻倍（-30/s）</b>。<b>Lv10 前不出场</b>，击毁后掉落大量水晶。',
    },

    fashiA2: {
      name: '法术大师A2', type: 'fashiA2', color: '#c084fc', hp: 900, score: 450,
      desc: 'A1 的<b>强化版</b>：不停留、直接下压（可左右斜移），登场 <b>1.8~2.3s</b> 后进入攻击周期——<b>停移</b> → 朝玩家发射<b>紫色激光</b>（伤害 <b>32</b>，持续生长至出界）→ 攻击后 <b>50%</b> 概率朝<b>斜下方（45°）</b>移动（攻击间隔 <b>1.22~1.83s</b>）。斜移常在下一次攻击前未走完——照常刹停射击后<b>放弃剩余斜移、径直下降</b>。碰撞 35。<b>替换权重：Lv10 前 0% / Lv10 起 3 类槽位 20</b>。',
    },

    douzhi: {
      name: '斗志昂扬', type: 'douzhi', color: '#c9d8ea', hp: 250, score: 300,
      desc: '增益无人机：<b>无碰撞伤害、不攻击</b>（与玩家互相穿过）。<b>每次关卡提升时有 5% 概率</b>从屏幕<b>左侧或右侧</b>出现，朝另一侧横穿（沿余弦曲线小幅上下浮动）。<b>击毁时</b>：我方战机与僚机的<b>攻击速度、弹道飞行速度翻倍，持续 8s</b>（伴随蓝盒脱离、光环演出后本体渐隐）。',
    },

    fashiA1: {
      name: '法术大师A1', type: 'fashiA1', color: '#a855f7', hp: 99, score: 180,
      desc: '紫光激光无人机：<b>不停留</b>、匀速下降，出场 <b>1s</b> 后进入攻击周期——<b>停移</b> → 朝玩家发射<b>紫色激光</b>（伤害 16，逐渐生长）→ 攻击后 <b>50%</b> 概率<b>左右横移</b>一段随机距离（不飞出屏幕）→ 恢复下降。碰撞为普通 2 类的 80%。<b>Lv10 前出现权重低，Lv10 后较多出现</b>（2 类替换 30%）。',
    },
    
    popian: {
      name: '破片', type: 'popian', color: '#cfd6e0', hp: 200, score: 200,
      desc: '三连发炮弹无人机：<b>只沿直线飞行</b>——出场选定一个随机点（停留于 <b>30%~80%</b> 屏高、<b>不进入两侧 15% 边缘区</b>，离自身近的高度概率更高），直飞到点后<b>急停锁停</b>，除非被击毁不再移动；停稳后才能攻击。<b>20%</b> 概率从<b>侧翼</b>入场。<b>索敌范围 30% 屏高、每秒 +5%</b>；玩家进入范围后在其位置<b>红圈预警 0.8s</b>，随后<b>快速三连发高速炮弹</b>（<b>不可被击毁</b>）：<b>首发 8 伤害</b>、后两发各 <b>5</b>；<b>若首发命中，则后两发炮弹无视玩家的无敌效果</b>，首发未命中而后两发命中则该次无敌时间 <b>-30%</b>。<b>碰撞伤害分段</b>：入场 0.5s 内无伤害、0.5~2s 为 20、2s 后为 37.5。<b>火力 Lv1 / Lv2 时受到 30% / 10% 易伤</b>。<b>Lv10 前出现权重极低，Lv10 后正常出现</b>。',
    },

    capital_crimson: {
      name: '赤红主力舰', type: 'capital', variant: 'crimson', color: '#ff4d6d', hp: 3939, score: 1500,
      desc: '技能循环：<b>双翼交叉矛</b>（左右翼各 3 发向内交叉成 X）→ <b>双曲线宽扇</b>（一侧 6 发弯向斜下、覆盖面极广，左右交替）→ <b>加速弹幕</b>（“/||\\”→“/|\\”，初速极低、加速到常规弹速 2 倍）。<b>对玩家 Lv4 / 暴走(Lv5) 火力减伤 15%</b>。居中快速入场，由 1/2 类护航。',
    },
    capital_azure: {
      name: '苍蓝主力舰', type: 'capital', variant: 'azure', color: '#4d9fff', hp: 3939, score: 1500,
      desc: '技能循环：<b>瞄准六连齐射</b>（±20° 偏差）→ <b>分裂橙红弹</b>（大弹减速到 0 后裂成 6 个小子弹、60° 散开）→ <b>双臂螺旋 12 发</b>。出场时 <b>20% 概率带护盾</b>：前 5s 虚化不受伤害、我方炮弹穿过。<b>对玩家 Lv4 / 暴走(Lv5) 火力减伤 15%</b>。',
    },
    capital_crgold: {
      name: '赤金主力舰', type: 'capital', variant: 'crgold', color: '#ff9a1a', hp: 3939, score: 1500,
      desc: '自带<b>两枚旋转环</b>。技能循环：<b>锁定玩家坐标的扇形连射</b>（首轮 5 发、随后 2/2 两轮，每次均为紧凑两连发）→ <b>金环扩散</b>：消耗一枚旋转环，<b>环带上所有子弹（敌我）瞬间消散</b>，<b>最多两次</b>（耗尽后退化为瞄准双发）→ <b>停移</b>发射四组「左3右3」加速长条弹（夹角依次 <b>75°/55°/35°/15°</b> 收窄）。<b>对玩家 Lv4 / 暴走(Lv5) 火力减伤 15%</b>。',
    },
    boss: {
      name: '旧日之歌', type: 'boss', color: '#e6d5ff', hp: 32200, score: 5000, bossId: 'song',
      quote: '自往昔中浮现的梦魇',   // 图鉴引言（颜色与标题一致）
      desc: '宽约 60% 屏宽，小幅左右巡航。拥有 4 种技能乱序释放：<br />' +
        '<b>技能1</b> 双管极快连发长条弹 + 双曲线弹流（血量≤50% 时双管同时向内 / 向外双向发射）<br />' +
        '<b>技能2</b> 散射大子弹（3 轮，每轮随机缺失 20%~35%）<br />' +
        '<b>技能3</b> 四部位标记三连发（标记释放时锁定，不追踪）<br />' +
        '<b>技能4</b> 双管乱射长条弹（血量＞50% 为 270° 大范围散射、≤50% 收敛到下半球）<br />' +
        '血量 70%：在最侧边召唤一位炮火先兆者并掉落暴走道具（各一次）；&lt;50% 技能间隔减半。<br />' +
        '<b>击败掉落</b>：48 颗水晶 + 20% 高能爆弹 + 必掉暴走道具，并参与通用道具掉落池（黑色标记：套件 / 护盾按基础值；加血独立判定 40% 掉 1 个 / 另有 10% 一次掉 2 个）。',
    },
boss_storm: {
      name: '暴风之眼 · I', type: 'boss', color: '#dff3ff', hp: 45678, score: 8000, bossId: 'storm',
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
        '<b>击败掉落</b>：48 颗水晶 + 20% 高能爆弹 + 必掉暴走道具 + 通用道具掉落池（蓝标记：护盾 6%；加血独立判定 40% 掉 1 个 / 另有 10% 一次掉 2 个）。',
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
    // BOSS 页面：试炼（正常战斗、双方不无敌）+ 测试该敌人（双方无敌、爆弹无限）
    // 普通敌人页面：仅测试该敌人（双方无敌）
    const actionHtml = isBoss
      ? `<button class="ency-challenge-btn boss" id="encyTrialBtn">⚔ BOSS 试炼</button>
         <button class="ency-challenge-btn" id="encyChallengeBtn">🔬 测试该敌人</button>
         <div class="ency-challenge-hint">BOSS 试炼：正常战斗，敌我均会受损、可被击坠<br />测试该敌人：双方无敌 · 高能爆弹无限 · 每枚爆弹削减 BOSS 20% 最大生命</div>`
      : `<button class="ency-challenge-btn" id="encyChallengeBtn">🔬 测试该敌人</button>
         <div class="ency-challenge-hint">测试模式：我方血量无限 · 敌方血量无限 · 仅单个敌人</div>`;
    encyDetail.innerHTML = `
      <div class="ency-detail-name" style="color:${d.color}">${d.name}</div>
      ${d.quote ? `<div class="ency-detail-quote" style="color:${d.color}">${d.quote}</div>` : ''}
      <div class="ency-detail-grade">${gradeName}</div>
      <canvas class="ency-detail-canvas" id="encyPreview" width="220" height="140"></canvas>
      <div class="ency-stats">
        <div class="ency-stat">HP<b>${d.hp}</b></div>
        <div class="ency-stat">分数<b>${d.score}</b></div>
      </div>
      <div class="ency-detail-desc">${d.desc}</div>
      ${actionHtml}
    `;
    // 绘制预览（220×140 大图）
    drawEncyPreview(d, document.getElementById('encyPreview'));
    if (isBoss) {
      document.getElementById('encyTrialBtn').addEventListener('click', () => startBossTrial(entryId));
    }
    document.getElementById('encyChallengeBtn').addEventListener('click', () => startChallenge(entryId));
  }

  // 从图鉴发起测试：敌我血量无限，仅生成单个目标敌人（BOSS 测试附带爆弹无限）
  function startChallenge(entryId) {
    const d = ENCY_DATA[entryId];
    const challenge = d.type === 'boss'
      ? { kind: 'boss', type: 'boss', bossId: d.bossId || 'song' }
      : { kind: 'enemy', type: d.type, variant: d.variant || null, behavior: d.behavior || null };
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

  // 全局 ctx 临时切换：游戏内绘制函数均直接读写模块级 ctx，预览渲染时将其短暂重指到目标画布，
  // 结束后必定还原。仅限同步的绘制调用（渲染主循环不会在切换期间插入执行）。
  function withPreviewCtx(pctx, fn) {
    const realCtx = ctx;
    ctx = pctx;
    try {
      fn();
    } finally {
      ctx = realCtx;
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
        const isStorm = d.bossId === 'storm';
        const bw = isStorm ? STORM.w : BOSS.w;
        const bh = isStorm ? STORM.h : BOSS.h;
        const bhp = isStorm ? STORM.hp : BOSS.hp;
        const scale = Math.min(LW * 0.72 / bw, LH * 0.72 / (bh * 1.15));
        pctx.save();
        pctx.translate(LW / 2, LH / 2 + 6);
        pctx.scale(scale, scale);
        // phase:'preview' 跳过血条和黑洞特效，直接展示完整机体
        drawBoss({ type: 'boss', bossId: d.bossId || 'song', x: 0, y: 0, w: bw, h: bh, hp: bhp, maxHp: bhp, phase: 'preview', scale: 1, skill: null, unfoldT: 1, parts: [], rot: 0, ency: true });
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
          const scale = small ? fit : clamp(fit, 0.4, 1.7);   // 缩略图不设缩放上下限，保证 4 类等大体型完整入图
          blit(drawOffscreen(d), LW / 2, LH / 2, scale);
        }
      }
    });
  }

  function openEncyclopedia() {
    encyclopedia.classList.remove('hidden');
    overlay.classList.add('hidden');
    buildEncyclopedia();
  }

  function closeEncyclopedia() {
    encyclopedia.classList.add('hidden');
    overlay.classList.remove('hidden');
  }

  // ---------- 数值与机制图鉴 ----------
  // 开始界面卡片右下角 ⓘ 按钮进入：数值与机制的介绍图鉴
  let infoTab = 'weights';            // weights 怪物权重 | waves 特殊怪物波次 | mods 特殊修正
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
  const INFO_FORMATIONS = [
    { fn: spawnSideGroup,          name: '1类小组',            ency: 'side_pass' },
    { fn: spawnStrikerGroup,       name: '2类小组',            ency: 'striker_crimson' },
    { fn: spawnSideColumn,         name: '1类长队',            ency: 'side_pass' },
    { fn: spawnMirrorRow,          name: '回文对称横排',       ency: 'striker_crimson' },
    { fn: spawnSideSweep,          name: '双侧对称斜扫',       ency: 'side_pass' },
    { fn: spawnStrikerVee,         name: '2类V字俯冲',         ency: 'striker_crimson' },
    { fn: spawnSideKamikazeStream, name: '紫自爆流',           ency: 'side_kamikaze' },
    { fn: spawnDiagonalRaid,       name: '对角奇袭（含炮艇）', ency: 'gunship_violet' },
    { fn: spawnGunshipWings,       name: '双炮艇压阵',         ency: 'gunship_violet' },
  ];

  // 虚象级（1类）展示配置（SIDE_SPAWN_W 权重恒定，不随等级变化）
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

  // 概率（0~1）转百分比字符串：29.2% / 30%（末位 .0 去掉）
  function fmtInfoPct(p) {
    const v = Math.round(p * 1000) / 10;
    return (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)) + '%';
  }

  // 行首小预览图（复用怪物图鉴绘制，small 模式按比例完整显示）
  function infoShipCanvas(encyId) {
    const cvs = document.createElement('canvas');
    cvs.width = 40 * DPR; cvs.height = 28 * DPR;
    drawEncyPreview(ENCY_DATA[encyId], cvs, 40, 28, true);
    return cvs;
  }

  // 权重表构建：rows = [{ canvas, label, vals, fmt? }]，vals 为数值数组（null = 未解锁/未生效，显示「—」）
  // fmt 为该行数值格式化函数（默认 fmtInfoW，概率类可传 fmtInfoPct）；
  // 数值高于上一档时在数字后标注天蓝色向上箭头（表示权重在此区间变大）
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
          td.textContent = fmt(v);
          if (i > 0 && r.vals[i - 1] != null && v > r.vals[i - 1]) {
            const up = document.createElement('span');
            up.className = 'info-up';
            up.textContent = '↑';
            up.title = '该档权重较上一档增大';
            td.appendChild(up);
          }
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

  // 档位脚注公共段：列含义 + 箭头图例
  const INFO_TIER_NOTE = '各档代表 10 级区间（表头 Lv11 即 Lv11~20，取档首等级计算）；天蓝色 <span class="info-up">↑</span> 表示该档权重较上一档增大。';

  // 虚象级（1类）行：权重恒定，各档同值
  function infoSideRows() {
    return INFO_SIDE_KINDS.map(k => ({
      canvas: infoShipCanvas(k.ency),
      label: k.name,
      vals: tierMask(INFO_TIERS.map(() => SIDE_SPAWN_W[k.kind])),
    }));
  }

  // 具象级（2类）行：变体权重（幽暮按档起始等级经 strikerVariantWeights 调整，权重和恒为 100）
  // + 法术大师A1 / 破片（2类突击艇的出场替换概率，0 = 不替换）+ 斗志昂扬（升级触发的横穿概率）——此三行为概率
  function infoStrikerRows() {
    const rows = [];
    const nameOf = { crimson: '赤红突击艇', amber: '烈橙突击艇', azure: '幽蓝突击艇', white: '霜白突击艇', dusk: '幽暮突击艇' };
    const encyOf = { crimson: 'striker_crimson', amber: 'striker_amber', azure: 'striker_azure', white: 'striker_white', dusk: 'striker_dusk' };
    const weights = INFO_TIERS.map(t => strikerVariantWeights(t.lv));
    for (const v of VARIANTS.striker) {
      rows.push({
        canvas: infoShipCanvas(encyOf[v.id]),
        label: nameOf[v.id],
        vals: tierMask(weights.map(ws => Math.round(ws.find(x => x.id === v.id).w * 1000) / 10)),
      });
    }
    const pctFmt = p => fmtInfoPct(p);
    rows.push({
      canvas: infoShipCanvas('fashiA1'),
      label: '法术大师A1（替换2类）',
      vals: tierMask(INFO_TIERS.map(t => t.lv < 10 ? 0 : FASHI_A1.spawnHighLv)),
      fmt: pctFmt,
    });
    rows.push({
      canvas: infoShipCanvas('popian'),
      label: '破片（替换2类）',
      vals: tierMask(INFO_TIERS.map(t => t.lv < 10 ? POPIAN.spawnLowLv : POPIAN.spawnHighLv)),
      fmt: pctFmt,
    });
    rows.push({
      canvas: infoShipCanvas('douzhi'),
      label: '斗志昂扬（升级触发）',
      vals: tierMask(INFO_TIERS.map(() => DOUZHI.spawnChance)),
      fmt: pctFmt,
    });
    return rows;
  }

  // 真我级（3类）行：槽位权重（普通炮艇三色变体共享权重拆行展示）；0 = 该阶段不出场
  function infoSpecial3Rows() {
    const rows = [];
    for (const it of SPECIAL3_POOL) {
      if (it.fn === spawnGunship) {
        // 普通炮艇拆分：三色变体共享同一槽位权重（†），出场时随机选取涂装
        for (const g of [
          { ency: 'gunship_violet', name: '紫晶炮艇' },
          { ency: 'gunship_crimson', name: '赤红炮艇' },
          { ency: 'gunship_amber', name: '金曜炮艇' },
        ]) {
          rows.push({
            canvas: infoShipCanvas(g.ency),
            label: g.name + ' †',
            vals: tierMask(INFO_TIERS.map(t => t.lv < 10 ? it.wLow : it.wHigh)),
          });
        }
      } else {
        rows.push({
          canvas: infoShipCanvas(it.ency),
          label: it.name,
          vals: tierMask(INFO_TIERS.map(t => t.lv < 10 ? it.wLow : it.wHigh)),
        });
      }
    }
    return rows;
  }

  // 诗篇级（4类）行：出场时的变体选取概率（恒定）
  function infoCapitalRows() {
    return INFO_CAPITAL_KINDS.map(k => {
      const v = VARIANTS.capital.find(x => x.id === k.id);
      return {
        canvas: infoShipCanvas(k.ency),
        label: k.name,
        vals: tierMask(INFO_TIERS.map(() => Math.round(v.weight * 100))),
        fmt: fmtInfoPct,
      };
    });
  }

  // 波次编队行：weight = min(cap, w0 + growth ×（等级 − 解锁等级）)，按各档起始等级计算，未解锁显示「—」
  function infoFormationRows() {
    return INFO_FORMATIONS.map(f => {
      const cfg = WAVE_FORMATIONS.find(w => w.fn === f.fn);
      const vals = tierMask(INFO_TIERS.map(t => {
        if (t.lv < cfg.unlockLv) return null;
        return Math.min(cfg.cap, cfg.w0 + cfg.growth * (t.lv - cfg.unlockLv));
      }));
      return { canvas: infoShipCanvas(f.ency), label: f.name + (cfg.slotGunship ? ' *' : ''), vals };
    });
  }

  function renderInfoWeights() {
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
      infoAppendNote(INFO_TIER_NOTE + '常规 1类编队（小组 / 长队 / 斜扫 / 对角奇袭等）中每架按此相对权重抽取构成（总和 93）；权重恒定不随等级变化。<b>紫自爆流不混入增生</b>；BOSS 后固定首波不含紫电，其余按权重混入。');
    } else if (infoWeightKind === 'striker') {
      infoBody.appendChild(buildWeightTable(headers, infoStrikerRows()));
      infoAppendNote(INFO_TIER_NOTE + '2类突击艇出场时按变体权重选取涂装，其中幽暮与等级挂钩：<b>幽暮 = 12 × 0.1（Lv10 前）/ 12 × 0.4（Lv10 起）</b>；<b>其余变体 = 基础权重 ×（100 − 幽暮权重）÷ 88</b>（等比缩放补足，权重和恒为 100）。法术大师A1 / 破片为 2类突击艇的<b>出场替换概率</b>（0 = 不替换；A1 优先于破片判定）；斗志昂扬为<b>每次关卡提升</b>时的出现概率（非波次权重，击败 BOSS 的跳变升级不触发）。');
    } else if (infoWeightKind === 'special3') {
      infoBody.appendChild(buildWeightTable(headers, infoSpecial3Rows()));
      infoAppendNote(INFO_TIER_NOTE + '特殊3类同屏限 1，仅槽位出场者占用槽位（编队自带的炮艇不占）。<b>0 表示该阶段不出场</b>；Lv10 以下仅炮艇 / 先兆者出场，Lv10 起按高权重列抽取（实际仅第二轮达到）。<b>本局首次槽位出场（仅第一轮）必定为炮火先兆者</b>。带 † 的紫晶 / 赤红 / 金曜炮艇<b>共享同一槽位权重</b>，出场时随机选取涂装。');
    } else if (infoWeightKind === 'capital') {
      infoBody.appendChild(buildWeightTable(headers, infoCapitalRows()));
      infoAppendNote(INFO_TIER_NOTE + '4类主力舰<b>同屏限 1</b>，由场面压力系统驱动出场（无权重列差异），表中为出场时的<b>变体选取权重</b>。苍蓝主力舰 20% 概率带护盾（前 5s 虚化不受伤害、炮弹穿过）。');
    } else {
      infoBody.appendChild(buildWeightTable(['编队', ...INFO_TIERS.map(t => t.label)], infoFormationRows()));
      infoAppendNote(INFO_TIER_NOTE + '权重随等级线性增长的编队按公式计算：<b>权重 = min(上限, 基础值 + 增量 ×（等级 − 解锁等级）)</b>（各档取起始等级代入）；未解锁显示 —。带 * 的编队（对角奇袭 / 双炮艇压阵）占用 3 类槽位，<b>第二轮权重 ×0.5</b>。Lv3 起每波有概率追加一个编队（组合波，追加位不占槽），详见「特殊怪物波次」。');
    }
  }

  function renderInfoWaves() {
    infoBody.innerHTML = '';
    const cards = [
      { h: '双编队组合波', p: '<b>Lv3 起</b>有概率在同一波内追加一个编队（追加位不占用 3 类槽），基础概率 15%、每级 +4%，<b>Lv7+ 封顶 30%</b>。' },
      { h: 'BOSS 击败后固定首波', p: '击败 BOSS 后先缓冲 <b>2s</b>，随后固定刷出一波 <b>1类长队</b>——自左或右入场、横穿战场自另一侧离场，本波不含紫电；自首波刷新起 <b>4s</b> 观察期后恢复正常刷怪。2s 与 4s 均不计入关卡推进。' },
      { h: '紫自爆流', p: '左右两侧各 7 架纵列斜扫穿越，以紫电（亡语向下垂直射一发）为主，<b>每波 30%~60% 替换为白影</b>（无攻击）。' },
      { h: '暴鸰替换', p: '所有<b>普通炮艇</b>每架 1.5% 概率被替换为暴鸰（自爆无人机）——Lv10 前暴鸰的唯一出场途径，Lv10 起另占 3 类槽权重。' },
      { h: '法术大师A1 替换', p: '2类突击艇按关卡替换为法术大师A1（紫光激光无人机）：Lv10 前 0%（仅图鉴挑战可生成）、<b>Lv10 起 30%</b>。' },
      { h: '3类槽位首出', p: '本局首次 3 类槽位出场（仅第一轮）必定为<b>炮火先兆者</b>；第二轮起删除强制，按「怪物权重 → 真我级」权重抽取。' },
      { h: '斗志昂扬横穿', p: '每次<b>关卡提升</b>时 5% 概率自屏幕左/右侧横穿一架斗志昂扬（增益无人机，余弦上下浮动）；击毁后我方攻速/弹速翻倍 8s。击败 BOSS 引发的跳变升级不触发。' },
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
      { h: '破片', p: '玩家火力 <b>Lv1 / Lv2 时受到 30% / 10% 易伤</b>（受到伤害 ×1.30 / ×1.10，低火力补偿）；主武器与僚机弹均生效，<b>高能爆弹为真实伤害不加成</b>。' },
      { h: '4类主力舰', p: '玩家火力 <b>Lv4 / 暴走(Lv5)</b> 时受到伤害 <b>-15%</b>；俯冲阶段（距悬停高度 ≥90px、速度未明显衰减）额外 <b>-20%</b>。' },
      { h: 'BOSS', p: '玩家火力 <b>Lv1</b> 时对 BOSS 的武器伤害 <b>+20%</b>（逆境补偿）。' },
      { h: '炮火先兆者', p: '装甲对<b>僚机弹幕 -25%</b>（僚机输出打在其身上大打折扣）。' },
      { h: '暴鸰', p: '玩家处于其<b>爆圈预警范围内</b>时，对暴鸰伤害 <b>+35%</b>（无论是否已投弹）。' },
      { h: '御4 金色六边力场', p: '力场内所有敌人受到的<b>非真实伤害 -30%</b>；高能爆弹为真实伤害，无视力场。' },
      { h: '寒霜 冰蓝光圈', p: '圈内玩家<b>射速 -35%、移动速度 -35%</b>（以战机核心位置判定）。' },
      { h: '破片 炮弹', p: '<b>若首发命中，则后两发炮弹无视玩家的无敌效果</b>；若首发未命中而后两发命中，该次无敌时间 -30%。' },
      { h: '导弹', p: '命中判定：<b>玩家 HP &lt; 60 直接击杀</b>；HP ≥ 60 失去 80% 当前血量 + 武器等级 -1。量子护盾可消解导弹。' },
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

  function buildInfoTabs() {
    infoTabs.innerHTML = '';
    const defs = [
      { id: 'weights', name: '怪物权重' },
      { id: 'waves',   name: '特殊怪物波次' },
      { id: 'mods',    name: '特殊修正' },
    ];
    for (const d of defs) {
      const b = document.createElement('button');
      b.className = 'info-tab' + (infoTab === d.id ? ' active' : '');
      b.textContent = d.name;
      b.addEventListener('click', () => { infoTab = d.id; buildInfoTabs(); });
      infoTabs.appendChild(b);
    }
    if (infoTab === 'weights') renderInfoWeights();
    else if (infoTab === 'waves') renderInfoWaves();
    else renderInfoMods();
  }

  function openInfoModal() {
    infoModal.classList.remove('hidden');
    buildInfoTabs();
  }

  function closeInfoModal() {
    infoModal.classList.add('hidden');
  }

  infoEntryBtn.addEventListener('click', openInfoModal);
  infoClose.addEventListener('click', closeInfoModal);

