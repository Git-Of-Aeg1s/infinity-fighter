// 13-encyclopedia：怪物图鉴数据 / UI / 形态预览绘制
'use strict';


  // ---------- 怪物图鉴 ----------
  const ENCY_GRADES = [
    { name: '虚像级', entries: ['side_pass', 'side_shoot', 'side_kamikaze', 'prolifera'] },
    { name: '具象级', entries: ['striker_crimson', 'striker_amber', 'striker_azure', 'striker_white', 'striker_dusk', 'douzhi', 'fashiA1', 'popian'] },
    { name: '真我级', entries: ['gunship_violet', 'gunship_crimson', 'gunship_amber', 'harbinger', 'weilong', 'hanshuang', 'yu4', 'anvil', 'baoling', 'jiaoxiang'] },
    { name: '诗篇级', entries: ['capital_crimson', 'capital_azure'] },
    { name: '长歌级', entries: ['boss', 'boss_storm'] },
  ];
  
  // 每种颜色变体独立成条目；type 用于绘制/生成，variant/behavior 用于强制指定变体/行为
  const ENCY_DATA = {
    side_pass: {
      name: '白影侧翼艇', type: 'side', behavior: 'pass', color: '#f0f0f5', hp: 1, score: 60,
      desc: '侧上方斜插穿越战场（整体速度约为基准的 78%，入场瞬间带短暂冲刺加速、约 0.7s 内衰减至巡航），血量极低，一碰就碎。<b>无攻击行为</b>，以纯粋的障碍形式穿越。出现概率：<b>70%</b>。',
    },
    side_shoot: {
      name: '黄芒侧翼艇', type: 'side', behavior: 'shoot', color: '#ffd166', hp: 1, score: 60,
      desc: '侧上方斜插穿越战场（整体速度约为基准的 78%，入场瞬间带短暂冲刺加速），血量极低。<b>会追踪玩家方向射击，但整场只攻击一次</b>，且首次攻击间隔扩大为常规的 <b>180%~280%</b>（每架随机）；弹速 230、伤害 6。出现概率：<b>10%</b>。',
    },
    side_kamikaze: {
      name: '紫电侧翼艇', type: 'side', behavior: 'kamikaze', color: '#c084fc', hp: 1, score: 60,
      desc: '侧上方斜插穿越战场（整体速度约为基准的 78%，入场瞬间带短暂冲刺加速），血量极低。<b>亡语：阵亡时向下垂直射击一发</b>（弹速 ×1.1）。出现概率：<b>20%</b>。',
    },
    prolifera: {
      name: '增生侧翼艇', type: 'prolifera', color: '#7fe8c9', hp: 1, score: 60,
      // 衍生敌人无独立条目：卫护飞船连同图像一并在本条目中展示（详情大图右侧）
      child: { type: 'escort', color: '#9cd6ff' },
      desc: '1类侧翼艇的<b>淡青绿色变体</b>，侧上方斜插穿越战场，血量极低，生命与碰撞伤害和白影侧翼艇一致（碰撞 12）。<b>无攻击行为</b>。<b>击毁后分裂出 2~3 个“卫护飞船”</b>（图中右侧淡天蓝色小三角），沿原航向大致继续漂移；<b>加血套件掉率固定为 10%</b>（其他敌人为 1.8%）。出现方式：混入 1 类编队，每架 <b>10%</b>。<hr /><b>衍生 · 卫护飞船</b>：通体淡天蓝色、单纯的等腰三角形飞船（无核心），<b>无攻击</b>，沿母舰原航向大致继续飞行；碰撞伤害仅为增生侧翼艇的 <b>40%</b>（4.8），造成的无敌时间同样为 <b>40%</b>（0.48s）。<b>出厂必带虚化护盾：75% 概率 0.1s / 22% 概率 0.16s / 2% 概率 0.2s / 1% 概率 0.4s</b>（虚化期间不受伤害、我方炮弹会穿过护盾）。击毁后 <b>80% 掉落 1 个水晶、20% 掉落 2 个</b>。',
    },
    striker_crimson: {
      name: '赤红突击艇', type: 'striker', variant: 'crimson', color: '#ff3b30', hp: 48, score: 150,
      desc: '上方入场，在前锋停留线短暂停顿后向下冲锋（速度已降低 30%）。<b>垂直向前直射、带 ±10° 随机偏差、不会追踪玩家</b>。<b>初次发射间隔额外 +1s</b>（首发更慢，后续按常规间隔）。出现概率：<b>约 29%</b>。',
    },
    striker_amber: {
      name: '烈橙突击艇', type: 'striker', variant: 'amber', color: '#ff8a5c', hp: 48, score: 150,
      desc: '上方入场，在前锋停留线短暂停顿后向下冲锋（速度已降低 30%）。<b>朝向前方对称射两发</b>，两枚子弹射线夹角在 <b>50°/60°/70° 间随机</b>（不追踪、不直射）；无赤红那样的初次发射 +1s 修正。出现概率：<b>约 29%</b>。',
    },
    striker_azure: {
      name: '幽蓝突击艇', type: 'striker', variant: 'azure', color: '#4d9fff', hp: 48, score: 150,
      desc: '上方入场，在前锋停留线短暂停顿后向下冲锋（速度已降低 30%）。移动逻辑与赤红相近，但<b>发射追踪玩家方向的子弹</b>；同样有 <b>初次发射间隔 +1s</b>。登场时 <b>10% 概率获得 1s 虚化护盾、10% 概率获得 2s 虚化护盾</b>（虚化期间不受伤害、我方炮弹会穿过护盾）。出现概率：<b>约 24%</b>。',
    },
    striker_white: {
      name: '霜白突击艇', type: 'striker', variant: 'white', color: '#eaf1f8', hp: 48, score: 150,
      desc: '上方入场，下降到前锋停留线后<b>停留 2s 再向下冲锋</b>（速度已降低 30%）。<b>不会发射任何子弹</b>，纯粹以机身作为压迫性障碍冲撞玩家。出现概率：<b>约 17%</b>。',
    },
    striker_dusk: {
      name: '幽暮突击艇', type: 'striker', variant: 'dusk', color: '#8f97ab', hp: 64, score: 150,
      desc: '突击艇的<b>黑色变体</b>，暗黑渐变菱形机体中央嵌有<b>白色发光核心</b>。不沿前锋线入场：在场地 30%~80% 高度的随机位置<b>正上方悄然浮现（渐显）</b>，随后下移至该位置<b>平滑停驻</b>，停顿 <b>0.2s</b> —— 期间<b>白环从核心散发、快速掠过机体至边缘消失</b>（预警动画，环被裁剪在机体内）—— <b>白环散尽的同时</b>以随机方向为基准，向四周<b>正六边形或正八边形（随机）</b>的均匀方向各射出 1 发子弹，<b>发射一轮后随即</b>向下移动与浮现时相同的距离并<b>渐隐消失</b>。<b>无法碰撞</b>：不撞伤玩家、也不受撞机反伤，与玩家互相穿过。<b>击毁时必定掉落 2~3 个水晶</b>。出现概率：Lv10 前 <b>1.2%</b>、Lv10 起 <b>4.8%</b>（基础权重 12%，缩减概率摊给其余变体）。',
    },
    gunship_violet: {
      name: '紫晶炮艇', type: 'gunship', variant: 'violet', color: '#c084fc', hp: 300, score: 400,
      desc: '炮艇紫色变体。技能循环：<b>正下方同向双连射</b>（同一方向快速射出 2 发、间隔较小不连在一起，不锁定玩家）→ <b>8 发环形爆发</b> → <b>追踪±5°双弹</b>（朝玩家方向左右各 5° 一次性同时射出 2 发，仅一次） → <b>瞄准单发高速狙击</b>。常规子弹为<b>橙红色长条弹</b>。',
    },
    gunship_crimson: {
      name: '赤红炮艇', type: 'gunship', variant: 'crimson', color: '#ff5a5a', hp: 300, score: 400,
      desc: '炮艇红色变体，火力最猛。技能循环：<b>瞄准三连射 + 双曲线弹流</b>（锁定玩家连续三发，与左右同时各连射 6 发、弹道呈 1/4 双曲线向两侧大幅外扩的两段弹幕<b>同时发射</b>）→ <b>反向双曲线弹流</b>（左右各 6 发，右侧弹往左扫、左侧弹往右扫、向内交叉）→ <b>三方向三段齐射</b>（垂直向下与下±20° 三方向，每方向快速射 2 发，连发 3 段、段间有间隔；第三段发射完才重新计算攻击间隔）。常规子弹为<b>橙红色长条弹</b>。',
    },
    gunship_amber: {
      name: '金曜炮艇', type: 'gunship', variant: 'amber', color: '#ffbf47', hp: 300, score: 400,
      desc: '炮艇金色变体。技能交替：<b>“八”字形斜弹幕</b>（左右两侧各射一组对称斜弹、与竖直方向夹角 10°；快速连发两次、短暂间隔后再快速连发两次）→ <b>瞄准单发巨型弹</b>（改用常规橙红配色、半径较原来缩小 30%、伤害更高，每次仅发射 1 发）。子弹均为<b>橙红色长条弹</b>。<b>初次开火前的准备时长 +0.4s</b>（入场后首次攻击更慢）。',
    },
    harbinger: {
      name: '炮火先兆者', type: 'harbinger', color: '#3a3f4a', hp: 777, score: 450,
      desc: '灰黑体+红核，上方较慢入场（约为常规炮艇进场速度的 56%），悬停位置更靠上（后排）。不直接开火：核心红色从中心扩展 3s 充满后召唤垂直导弹（最多导引 4 次），随后 2s 灰黑覆盖循环；<b>就位约 18s 后停火开走</b>。<br />导弹命中：<b>HP&lt;60 直接击杀</b>；HP≥60 失去 80% 当前血量 + 武器等级 -1。碰撞伤害仅为突击艇的 50%，且装甲对<b>僚机弹幕有 25% 减伤</b>（僚机输出打在其身上大打折扣）。',
    },
    weilong: {
      name: '威龙', type: 'weilong', color: '#ff9a1a', hp: 4567, score: 1200,
      desc: '俯视四旋翼无人机，橙黄渐变；四角环状护圈内旋翼高速旋转，中央为磨平棱角的矩形机身 + 一门指向玩家的炮管。<b>血量极高（约为主力舰的 116%）</b>。从偏左/偏右半场出场，沿<b>蛇形路径</b>巡航（先下降到先兆者高度 → 横向靠边 → 下移一段 → 反向靠边 → 再下移一段 → 走到对侧距墙 1/3 处<b>停顿 2s</b> → 向下离场），方向随出场侧镜像。每隔一段时间朝玩家射 <b>5 枚无偏转快弹</b>（弹速较普通弹 <b>+60%</b>），<b>攻击时停止移动</b>。<b>Lv10 起作为特殊 3 类槽位出场</b>。<b>血量 &lt;60% 后不计入场面压力</b>（不再拖慢敌方刷新，≥60% 时会计入拖慢刷新）。',
    },
    hanshuang: {
      name: '寒霜', type: 'hanshuang', color: '#8fd8ff', hp: 555, score: 450,
      desc: '俯视四旋翼无人机，通体灰黑渐变，边缘透出天蓝寒霜纹路，四角为<b>平滑圆角矩形旋翼舱</b>（无外露旋翼）。<b>血量略低于炮火先兆者</b>，速度与其等同。<b>不攻击</b>：登场后直线下移到场地 60%~80% 的随机高度<b>停留 20s</b>，随后向下离场。登场 1s 后周身显现<b>大范围冰蓝寒霜光圈</b>（冰晶质感、霜环缓慢流转），以我方战机<b>核心位置</b>判定，<b>圈内射速降低 35%、移动速度降低 25%</b>。<b>出厂随机携带虚化护盾</b>：30% 概率 1.5s / 20% 概率 2s / 10% 概率 2.5s / 5% 概率 5s，其余不带盾（虚化期间不受伤害、我方炮弹会穿过护盾）。<b>Lv10 起作为特殊 3 类槽位出场</b>。优先击毁或撤离其光圈再输出。',
    },
    yu4: {
      name: '御4', type: 'yu4', color: '#d6c078', hp: 500, score: 450,
      desc: '俯视四旋翼防御无人机：介于圆形与正方形之间的<b>超椭圆（方圆形）机体</b>（暖灰渐变），中央为<b>小片淡黄色反应核</b>，一道 <b>“X”形金色条纹</b> 指向四角的风扇圆（中心淡青、边缘暖灰渐变）。<b>不攻击</b>：登场 <b>0.5s</b> 后展开<b>金色六边力场</b>，力场内<b>所有敌人受到的非真实伤害降低 30%</b>（<b>高能爆弹为真实伤害</b>，无视力场）。下降速度较常规 3 类炮艇 <b>低 20%</b>，悬停位置与炮艇一致，停留 <b>25s</b> 后离场；碰撞伤害仅为炮艇的 <b>50%</b>。<b>Lv10 前不出场</b>。优先击毁以免其庇护友军。',
    },
    anvil: {
      name: '铁砧', type: 'anvil', color: '#8ce36b', hp: 600, score: 450,
      desc: '菱形黑灰框架 + 中央灰黑正方形，上下左右横杠连接框架；中心朝下两条<b>竖直白杠凸出框架</b>，框架带白色条纹。<b>不攻击</b>：登场 <b>0.5s</b> 后展开<b>正方形淡青绿治疗光环</b>，光环内<b>所有敌人（含自身）每秒回复 1% 最大生命 + 60 生命</b>。悬停于炮火先兆者<b>前方</b>，停留 <b>25s</b>（同御4）后离场；碰撞伤害等同常规 3 类炮艇。<b>Lv10 前不出场</b>。优先击毁以免其持续治疗敌军。',
    },
    baoling: {
      name: '暴鸰', type: 'baoling', color: '#e3e6ec', hp: 500, score: 400,
      desc: '俯视四旋翼自爆无人机：白灰色磨角方形机体（较威龙小 20%），<b>灰黑渐变横杠</b>连接四角风扇（淡黄桨心、外环灰白渐变越靠边越白），中央灰黑渐变（较御4 更黑）+ 中心偏上<b>白色骷髅标识</b>；前方搭载<b>黑色圆形炸弹</b>（45%~60% 高度一道红道、上部白色骷髅图标）。<b>不悬停</b>：以炮艇 <b>40%</b> 速度径直下压，登场 0.8s 后进入<b>索敌半径（1/3 屏幕长度）</b>即<b>停车锁定</b>——玩家位置浮现红色预警区，随即炸弹<b>向下脱离</b>（火星四溅、本体不再显示炸弹），经 0.8s 低速下坠后<b>极速加速</b>冲向预警区中心爆炸：<b>玩家 40 伤害</b>（不伤敌人）。<b>投弹前被击毁则炸弹原地爆炸</b>，对圈内<b>所有单位</b>造成伤害（玩家 40 / 敌人 600 + 20% 最大生命、封顶 2600，可连锁殉爆）。投弹后<b>原地停留 1.2s</b>，再以炮艇 <b>70%</b> 速度俯冲离场；碰撞伤害为炮艇的 <b>40%</b>。<b>玩家处于爆圈内时对暴鸰增伤 35%</b>（无论是否已投弹）。普通炮艇有 <b>1.5%</b> 概率被替换为暴鸰（"232232" 编队中一架被替换则两架均为暴鸰）；<b>Lv10 起也会作为特殊 3 类槽位出场</b>。',
    },

    jiaoxiang: {
      name: '焦香螺旋桨', type: 'jiaoxiang', color: '#ff7a18', hp: 900, score: 600,
      desc: '橙火红渐变<b>圆环</b>（环宽度不大）+ 中心<b>小圆形黑色核心</b> + 核上<b>白色圆形</b>（半径小于核心）；核心延伸出<b>一根很窄的白色横杠（直径）</b>与环相连，白色圆形延伸出<b>两根很窄的白色横杠（半径方向、长短不一、末端各有白色小圆）</b>，三根横杠<b>异速旋转</b>（白圆上两根同向、直径杠独立）。<b>无碰撞伤害、不攻击</b>：登场后以 <b>180%</b> 最大移速（<b>0.5s</b> 内衰减至正常）移动到场地 <b>40%</b> 以下位置，随后<b>绕大圈巡航</b>（大致圆形轨迹、含轻微漂移）持续在场威胁玩家。<b>20%</b> 概率从<b>侧翼</b>出现（无登场加速，稍微往中间移动后即开始转圈）。登场 <b>0.8s</b>（侧翼 <b>1.2s</b>）后展开<b>火焰光环</b>：光环内我方战机<b>每秒 -15 血量</b>，几乎接近本体时<b>伤害翻倍（-30/s）</b>；火焰光环有明显<b>动效</b>（波形火舌 + 上升火星）。<b>Lv10 前不出场</b>。血量 <b>900</b>，击毁后掉落大量水晶。',
    },

    douzhi: {
      name: '斗志昂扬', type: 'douzhi', color: '#c9d8ea', hp: 250, score: 300,
      desc: '增益无人机（<b>2 类·具象级</b>）：造型类暴鸰的灰黑磨角方形机体 + <b>灰黑渐变横杠</b>连接四角风扇（淡黄桨心、外环灰白渐变），<b>四轮中心间歇发出微弱的红色闪光</b>；中心为<b>上扬双箭头标志</b>（非骷髅）；下方<b>不再搭载炸弹，而是一个较大的蓝色盒子</b>（盒子上方为<b>淡黄色空心正方形图案</b>）。<b>无碰撞伤害、不攻击</b>（与玩家互相穿过）。<b>每次关卡提升时有 5% 概率</b>从屏幕<b>左侧或右侧</b>出现，朝另一方向横穿（速度为<b>威龙的 1.5 倍</b>），同时沿<b>余弦曲线小幅上下浮动</b>。<b>生命归零时</b>：蓝色盒子<b>脱离本体并迅速渐隐</b> → 显示<b>扩大的淡黄色光环特效</b> → <b>我方战机与僚机的攻击速度、弹道飞行速度翻倍，持续 8s</b> → 盒子渐隐结束后本体<b>快速渐隐消失</b>。',
    },

    fashiA1: {
      name: '法术大师A1', type: 'fashiA1', color: '#a855f7', hp: 99, score: 180,
      desc: '紫光激光无人机（<b>2 类·具象级</b>）：四角<b>白灰渐变风扇圆</b>（黑色小圆心，无转动特效）+ 中心<b>灰黑磨角矩形机身</b>（左中右 <b>1:3:1</b> 分割，左右两侧为<b>炫紫发光长条</b>，中心为<b>炫紫光芒圆点</b>）+ 下方<b>深紫色较细炮管</b>（图层最底）。<b>不停留</b>：以白色突击艇 <b>140%</b> 速度匀速下降，出场 <b>1s</b> 后开始攻击周期——<b>停移</b>（加速度极大，平滑速度曲线）→ 朝玩家方向发射<b>紫色激光</b>（看起来逐渐增长、中心白色边缘绚紫的射弹，宽度适中）→ 攻击后 <b>50%</b> 概率向<b>左或右横移</b>一段随机距离（不飞出屏幕）→ 恢复下降。<b>激光命中受 16 伤害</b>；碰撞伤害为普通 2 类的 <b>80%</b>。<b>Lv10 前出现权重低，Lv10 后较多出现</b>。',
    },
    
    popian: {
      name: '破片', type: 'popian', color: '#cfd6e0', hp: 200, score: 200,
      desc: '三连发导弹无人机（<b>2 类·具象级</b>）：造型类<b>铁砧</b>但更小（<b>宽度 -15%</b>），<b>灰白金属质感主导</b>的菱形边框 + 同色中心核心；中心<b>两条黑杠</b>（<b>远离中心的下端为红色</b>、其余为黑色）；图层最底从下方伸出<b>两根黑色炮管</b>（前部加粗、位于横杠下方靠外）。<b>只沿直线飞行</b>：出场选定一个随机点（<b>停留在从上往下 30%~80% 屏高区间</b>，<b>离自身近的高度概率更高</b>），直飞到点后<b>快速急停锁停</b>，除非被击毁否则不再移动；停稳后才能攻击。<b>20%</b> 概率从<b>侧翼</b>入场。<b>索敌范围为 30% 屏高，每秒 +5%</b>（体现为攻击范围增大）；玩家进入范围后在<b>玩家位置（含少量偏移）红圈预警 0.5s</b>，随后<b>快速三连发高速导弹</b>（<b>不可被击毁</b>）。<b>首发 8 伤害</b>、后两发各 <b>5 伤害</b>；若<b>首发命中造成伤害</b>，后两发命中则<b>无视玩家无敌时间</b>；若首发未命中/玩家仍无敌而后两发命中，则该次受击<b>无敌时间 -30%</b>。<b>碰撞伤害分段</b>：入场 <b>0.5s</b> 内无伤害、<b>0.5~2s</b> 为普通 2 类的 <b>80%</b>、<b>2s</b> 后为 <b>150%</b>。血量 <b>200</b>，速度为白色 2 类的 <b>112%</b>。<b>Lv10 前出现权重极低，Lv10 后正常出现</b>。',
    },

    capital_crimson: {
      name: '赤红主力舰', type: 'capital', variant: 'crimson', color: '#ff4d6d', hp: 3939, score: 1500,
      desc: '主力舰红色变体。技能循环：<b>双翼交叉矛</b>（发射点上移，左右翼各 3 发向内交叉成 X、飞抵下方时更分散）→ <b>双曲线宽扇</b>（从一侧机翼朝斜下方射出 6 枚弹、横向加速度递增弯成覆盖面极广的双曲线，最内侧近乎直射正下、最外侧弯到与水平约成 20°；一侧射完短暂间隔后另一侧再射，先左先右随机）→ <b>“/||\\”→“/|\\” 加速弹幕</b>（每笔画 4 发橙红长条弹、间距更大，初速极低但加速到常规弹速 2 倍、加速时间更长；先 30° 的 “/||\\”、随后 45° 的 “/|\\”）。常规子弹均为<b>橙红色长条弹</b>。<b>对玩家 Lv4 / 暴走(Lv5) 火力有 15% 减伤</b>。居中快速入场，出场及在场期间由 1/2 类护航。',
    },
    capital_azure: {
      name: '苍蓝主力舰', type: 'capital', variant: 'azure', color: '#4d9fff', hp: 3939, score: 1500,
      desc: '主力舰蓝色变体，更聚焦玩家。技能循环：<b>瞄准六连齐射</b>（每发带 ±20° 随机偏差）→ <b>分裂橙红弹</b>（向前方发射大号淡橙红弹，飞行较短一段后在极短时间内平滑减速到 0、再分裂成 6 个小子弹、互相 60° 散开）→ <b>双臂螺旋 12 发</b>。出现时 <b>20% 概率带护盾</b>：前 6s 虚化不受伤害、我方炮弹会穿过护盾打到它后面的敌人。常规子弹为<b>橙红色长条弹</b>。<b>对玩家 Lv4 / 暴走(Lv5) 火力有 15% 减伤</b>。',
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
        '<b>技能1</b> 屏幕右侧射出 3~4 道曲线风流（仅下方 60% 区域），标记约 1.1s 后呼啸而至，<b>30 伤害 + 击退</b><br />' +
        '<b>技能2</b> 蓄力后向正前方推出<b>大型龙卷</b>（约占屏宽 30%，可击毁、缓慢下移，随机 360° 快速射出 16 伤害风弹，碰撞 32 伤害；<b>对主机弹幕减伤 50%、受僚机伤害 +150%</b>——僚机是其弱点）<br />' +
        '<b>技能3</b> 连续随机选定 5 处召唤<b>垂直风柱</b>（约 14% 屏宽，标记 1.3s 后落下，18 伤害 + 击退）<br />' +
        '<b>技能4</b> 漩涡状弹幕（4 条臂），前半程逆时针旋转、后半程顺时针旋转<br />' +
        '<b>技能5</b> 两轮乱射风条（首轮 12 处、次轮 9 处，下方 120° 区域）+ 每轮一枚中心瞄准玩家；部分风弹随机强化（尺寸 / 伤害提升）<br />' +
        '<b>技能6</b> 三旋臂漩涡弹幕：3 条旋臂风弹，随机顺 / 逆时针且全程不变，转速随时间越来越快，持续 5s<br />' +
        '<b>技能7</b> 涡流风旋：落点预警后自机体飞抵屏幕下方 80% 高度处，悬停自转 5s、双旋臂喷出密集风条后快速消散；风旋机体碰撞 12 伤害。<br />' +
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
        // 单敌绘制
        const drawOne = (spec, cx, cy, sc) => {
          const t = ENEMY_TYPES[spec.type];
          pctx.save();
          pctx.translate(cx, cy);
          pctx.scale(sc, sc);
          drawEnemy({
            type: spec.type, x: 0, y: 0, w: t.w, h: t.h,
            color: spec.color, variant: spec.variant || null, behavior: spec.behavior || null, skill: sk(spec),
            hp: t.hp, maxHp: t.hp, phase: 0, shielded: false,
            arrived: true, chargeT: HARBINGER.chargeFirst * 0.75, _sideVel: null,
          });
          pctx.restore();
        };
        if (d.child && !small) {
          // 含衍生敌人（详情大图）：主敌居左，衍生体居右下一同展示（衍生体无独立图鉴条目）
          // 衍生体沿用主敌的缩放并按游戏内 drawScale 比值折算，保证图中体型比例与实战一致
          const s1 = clamp(fit, 0.4, 1.7) * 0.78;
          const s2 = s1 * (ENEMY_TYPES[d.child.type].drawScale / et.drawScale);
          drawOne(d, LW * 0.35, LH * 0.46, s1);
          drawOne(d.child, LW * 0.75, LH * 0.60, s2);
        } else {
          const scale = small ? fit : clamp(fit, 0.4, 1.7);   // 缩略图不设缩放上下限，保证 4 类等大体型完整入图
          drawOne(d, LW / 2, LH / 2, scale);
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

