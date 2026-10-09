// 01-config-core：画布 / 演示屏坐标 / 星空 / 全部图片素材、加载器与贴图处理（配置域群叶子）（《并行开发改造设计.md》批次 1c 自 01-config.js 拆出）

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：01-config-loadout(6 名) 01-config-enemies(1 名) 01-config-difficulty(1 名) 02-core(3 名) 04-spawn(2 名) 05-boss(3 名) 06-enemy(2 名) 07-player(4 名) 08-entities(2 名) 09-draw-ships(3 名) 10-draw-world(11 名) 11-draw-boss(16 名) 12-ui(2 名) 13-encyclopedia(6 名) 14-main(2 名)
  // 配置域群（01x）内部单向依赖：加载序见 index.html（core→loadout→enemies→boss→difficulty→spawn→achievements），对外只出不进




/**
 * 大无垠战机 · Big Infinity Fighter
 * 一个纯 Canvas 2D 实现的雷霆战机风格 Demo。
 *
 * 操作：
 *   W/A/S/D  移动战机
 *   Space/右Ctrl 释放高能爆弹（清空全部敌弹 + 全场敌人受 4000 + 最大血量10% 伤害）
 *   P        暂停 / 继续
 */

  // ---------- 常量 ----------
  const CANVAS_W = 480;
  const CANVAS_H = 792;   // 战场高度（原 720 增长 10%：上边界不动、下边界下移）
  // 主菜单攻击演示屏（画布逻辑坐标）：与主菜单 .demo-screen DOM 边框（top calc(15% - 10.4px) /
  // height calc(51% + 10.4px)，高度补回上移量、底边恒为 66%）严格对齐；演示实体层以此为裁剪矩形（10-draw-world render），
  // 弹道/特效不越出演示屏。上移量 10.4px = 左上角 ? 按钮（.help-entry-btn，26px 高）高度的 40%；改 CSS top 时必须同步此值
  const DEMO_TOP = Math.round(CANVAS_H * 0.15 - 10.4);
  const DEMO_BOTTOM = Math.round(CANVAS_H * 0.66);

  // 暴风之眼本体图（透明底台风云盘）：异步预加载，加载完成前矢量风暴照常绘制
  let stormEyeImg = null;
  const stormEyeLoader = new Image();
  stormEyeLoader.onload = () => { stormEyeImg = stormEyeLoader; };
  stormEyeLoader.src = 'assets/storm-eye.webp';

  // 电弧闪电素材组（透明底）：风暴编织者专用——
  //   lightning-1 主电弧（白热蓝辉纤细大闪电）：能量球表面电弧 / 球外放电
  //   lightning-2 细流光弧（纤细蓝弧）：周身闪电风暴的小闪电
  //   lightning-bolt 备用电弧（粗壮闪电）：与主电弧交替出现，避免重复感
  //   lightning-ring 雷电环（黑底蓝色环形雷电）：技能5 周身雷电环 / 雷击预警聚能 / 打击爆闪演出
  // 异步预加载，未加载时能量球 / 风暴回退为程序化弧线
  let lightningImg = null;
  const lightningLoader = new Image();
  lightningLoader.onload = () => { lightningImg = lightningLoader; };
  lightningLoader.src = 'assets/lightning-1.png';
  let lightningImgAlt = null;
  const lightningLoaderAlt = new Image();
  lightningLoaderAlt.onload = () => { lightningImgAlt = lightningLoaderAlt; };
  lightningLoaderAlt.src = 'assets/lightning-bolt.png';
  let lightningImgThin = null;
  const lightningLoaderThin = new Image();
  lightningLoaderThin.onload = () => { lightningImgThin = lightningLoaderThin; };
  lightningLoaderThin.src = 'assets/lightning-2.png';
  let lightningImgBig = null;
  const lightningLoaderBig = new Image();
  lightningLoaderBig.onload = () => { lightningImgBig = lightningLoaderBig; };
  lightningLoaderBig.src = 'assets/lightning-4.png';
  let lightningImgSmall = null;
  const lightningLoaderSmall = new Image();
  lightningLoaderSmall.onload = () => { lightningImgSmall = lightningLoaderSmall; };
  lightningLoaderSmall.src = 'assets/lightning-5.png';
  let lightningImgRing = null;
  const lightningLoaderRing = new Image();
  lightningLoaderRing.onload = () => { lightningImgRing = lightningLoaderRing; };
  lightningLoaderRing.src = 'assets/lightning-ring.webp';

  // 电球序列帧（黑底蓝色雷电球）：风暴编织者登场动画专用——
  //   energy-orb-sheet.webp 为 10×6 网格共 60 帧，运行时按图片实际宽高切分（无需物理拆分文件）；
  //   黑底经 lighter 混合融入画面，未加载完成时登场动画跳过电球层（其余演出照常）
  let energyOrbSheet = null;
  const energyOrbSheetLoader = new Image();
  energyOrbSheetLoader.onload = () => { energyOrbSheet = energyOrbSheetLoader; };
  energyOrbSheetLoader.src = 'assets/energy-orb-sheet.webp';
  const ENERGY_ORB = { cols: 10, rows: 6, frames: 60, fps: 24, baseD: 260, offX: -12, offY: 3 };   // 网格 / 帧率 / 基准直径 / 对齐偏移（素材球在帧内偏右，左移使其对准机体核心 RX=0,RY=3）

  // 依：镰刀清扫素材（透明底大镰刀）：计数充满自动召唤，绕机体旋转（绘制见 10-draw-world drawMeiScythes）；
  // 异步预加载，未加载完成时回退程序化长条镰刀形
  let scytheImg = null;
  const scytheLoader = new Image();
  scytheLoader.onload = () => { scytheImg = scytheLoader; };
  scytheLoader.src = 'assets/scythe_transparent.png';

  // 黑暗之手 BOSS 与四精英形象（透明底人物图）：图鉴预览专用（13-encyclopedia drawEncyPreview wip 分支）；
  // 实体技能未实装，游戏内仍为白色方块占位（WIP_PLACEHOLDER_TYPES）；异步预加载，未加载时图鉴回退白色方块
  let darkhandImg = null;
  const darkhandLoader = new Image();
  // 黑暗之手实心掩码（技能5 暗影导弹雨采样用，2026-10-02 用户定稿「子弹必须严格在贴图上」）：
  // 素材加载后降采样烘焙 alpha 实心网格（56×56，格内 α 均值近似），dhSampleSolid() 据此 rejection 采样
  const DH_SOLID_GRID = 56;
  let dhSolidMask = null;   // { grid, data: Uint8Array }——data[gy*grid+gx]=1 表示该格落在贴图不透明像素上
  darkhandLoader.onload = () => {
    darkhandImg = darkhandLoader;
    try {
      const N = DH_SOLID_GRID;
      const c = document.createElement('canvas');
      c.width = N; c.height = N;
      const g = c.getContext('2d');
      g.drawImage(darkhandLoader, 0, 0, N, N);   // 降采样：格内像素均值近似 α
      const d = g.getImageData(0, 0, N, N).data;
      const data = new Uint8Array(N * N);
      for (let i = 0; i < N * N; i++) data[i] = d[i * 4 + 3] > 110 ? 1 : 0;
      dhSolidMask = { grid: N, data };
    } catch (err) { dhSolidMask = null; }   // 烘焙失败：dhSampleSolid 回退中央躯干带
  };
  // 技能5 导弹生成点采样（返回机体比例位 x/y ∈ -0.5~0.5）：实心格 rejection 采样（≤10 次），
  // 掩码未就绪/连续失败回退中央躯干带（x ±14%、y ±36%，素材实心核心区）——保证技能始终可用
  function dhSampleSolid() {
    if (dhSolidMask) {
      const g = dhSolidMask.grid, d = dhSolidMask.data;
      for (let k = 0; k < 10; k++) {
        const gx = Math.floor(Math.random() * g), gy = Math.floor(Math.random() * g);
        if (d[gy * g + gx]) return { x: (gx + 0.5) / g - 0.5, y: (gy + 0.5) / g - 0.5 };
      }
    }
    return { x: (Math.random() * 2 - 1) * 0.14, y: (Math.random() * 2 - 1) * 0.36 };
  }
  darkhandLoader.src = 'assets/darkhand_transparent.png';
  let puxuefengImg = null;
  const puxuefengLoader = new Image();
  puxuefengLoader.onload = () => { puxuefengImg = puxuefengLoader; };
  puxuefengLoader.src = 'assets/piaoxuefeng_transparent.png';   // 素材文件名为 piaoxuefeng（朴姓读 Piáo），代码键名为 puxuefeng
  let hanxixianImg = null;
  const hanxixianLoader = new Image();
  hanxixianLoader.onload = () => { hanxixianImg = hanxixianLoader; };
  hanxixianLoader.src = 'assets/hanxixian_transparent.png';
  let xiayongImg = null;
  const xiayongLoader = new Image();
  xiayongLoader.onload = () => { xiayongImg = xiayongLoader; };
  xiayongLoader.src = 'assets/xiayong_transparent.png';
  let xinguodongImg = null;
  const xinguodongLoader = new Image();
  xinguodongLoader.onload = () => { xinguodongImg = xinguodongLoader; };
  xinguodongLoader.src = 'assets/xinguodong_transparent.png';

  // 黑暗之手弹幕贴图：素材库水彩风格蛋挞（tart_round_transparent.png 1024×1024 / tart_strip_transparent.png
  // 长条版 / tart_ultra_long_transparent.png 1964×200 超长版）——加载完成后绘制到离屏 canvas 做「绿幕抠绿」烘焙
  //（绿色占优度 → alpha 软阈值渐变，边缘不生硬），产出透明底 tartImg / tartStripImg / tartUltraImg
  // 供 10-draw-world / 11-draw-boss 蛋挞弹分支贴图；未加载/烘焙失败时回退常规渐变弹渲染。
  // （仅游戏运行域内 getImageData：本作经本地服务器运行，file:// 直开会因 ES modules 先行失败，无污染风险）
  function bakeGreenTart(src, onDone) {
    const loader = new Image();
    loader.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = loader.naturalWidth; c.height = loader.naturalHeight;
        const g2 = c.getContext('2d');
        g2.drawImage(loader, 0, 0);
        const im = g2.getImageData(0, 0, c.width, c.height);
        const d = im.data;
        for (let i = 0; i < d.length; i += 4) {
          const greenness = d[i + 1] - Math.max(d[i], d[i + 2]);   // 绿色占优度：>0 表示偏绿（绿幕）
          if (greenness > 42) d[i + 3] = 0;                        // 纯绿幕：全透明
          else if (greenness > 10) d[i + 3] = Math.round(d[i + 3] * (1 - (greenness - 10) / 32));   // 边缘过渡带：按占优度线性降 alpha（软边）
        }
        g2.putImageData(im, 0, 0);
        onDone(c);
      } catch (err) { onDone(null); }   // 烘焙失败回退常规弹渲染，不影响战斗
    };
    loader.src = src;
  }
  let tartImg = null;
  bakeGreenTart('assets/tart_round_transparent.png', img => { tartImg = img; });
  let tartStripImg = null;
  bakeGreenTart('assets/tart_strip_transparent.png', img => { tartStripImg = img; });
  let tartUltraImg = null;
  bakeGreenTart('assets/tart_ultra_long_transparent.png', img => { tartUltraImg = img; });   // 超长蛋挞（1964×200，黑暗之手技能4 爪翼毁灭蛋挞，2026-10-08）

  // ---------- 副武器系统：注册表与参数 ----------
  // 副武器是主机体直接挂载的第二种武器（区别于僚机的独立机体）：主菜单选择、整场战斗生效，
  // 与主炮各自独立冷却、同时自动开火（BOSS 警报 / 入场演出等停火期一并锁住，见 07-player updateSubWeapon）。
  // 注册表键序 = 主菜单卡片展示顺序。brief = 主菜单卡片简短文案；desc = 数值与机制图鉴「副武器」页详细文案。
  // 数值定位：主炮 Lv4 裸 DPS ≈ 800~880、僚机双机合计 ≈ 140~230；副武器取 50~110 区间，
  // 以"弹道形状 / 发射方式"提供差异化手感，而非单纯堆数值。
  // fire.kind：jixing=极夜流光（标记直射激光）/ daodan=捣蛋来袭（大狗同款导弹）/ feijian=无界飞剑（全屏均分分裂连射）/ xinring=辛国栋之怒（恒速穿透灼烧火环）
  // 副武器矢量图标（iconSvg，同 PILOTS.higanbanaSvg 路线）：内联 SVG 字符串——
  // 渐变/配色在 SVG 内部固化（贴合弹体涂装），外层 span 的 currentColor（注册色）仅承担 .glyph-svg 辉光。
  let subGradSeq = 0;   // 渐变 id 计数：同一页面多处渲染图标时保证 defs id 唯一
  function flameRingSvg() {   // 辛国栋之怒「焰环」：环身焰舌，玫红→粉渐变贴合弹体涂装（用户 2026-09-27 定稿）
    const id = 'xrGrad' + (++subGradSeq);
    return '<svg viewBox="-20 -20 40 40" xmlns="http://www.w3.org/2000/svg">'
      + '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0" stop-color="#ff9ecf"/><stop offset="1" stop-color="#e63cbe"/></linearGradient></defs>'
      + '<circle cx="0" cy="3" r="10.5" fill="none" stroke="url(#' + id + ')" stroke-width="3.5"/>'
      + '<g fill="url(#' + id + ')">'
      + '<path d="M0,-7.5 C2.6,-10.5 2,-14 0,-17 C-2,-14 -2.6,-10.5 0,-7.5 Z"/>'
      + '<path d="M-6.5,-5.8 C-5.2,-9 -6.4,-11.6 -8.2,-13.2 C-9.3,-10.4 -8.8,-7.4 -6.5,-5.8 Z"/>'
      + '<path d="M6.5,-5.8 C5.2,-9 6.4,-11.6 8.2,-13.2 C9.3,-10.4 8.8,-7.4 6.5,-5.8 Z"/>'
      + '</g></svg>';
  }
  function dogMissileSvg() {   // 捣蛋来袭「狗耳导弹」：大狗同款导弹 + 折角狗耳（「捣蛋/导弹」谐音，用户 2026-09-27 定稿）；白蓝 #9fd0ff 同先兆者导弹涂装。
    // 整体 translate(0,-4.5)：弹体墨迹（耳 -8.4 ~ 焰尾 +17.5）视觉重心偏下 +4.5，上移后墨迹居中于 em 框（装备框 30px 对位校正）
    return '<svg viewBox="-20 -20 40 40" xmlns="http://www.w3.org/2000/svg">'
      + '<g transform="translate(0,-4.5)">'
      + '<g fill="currentColor">'
      + '<path d="M-3.2,-8.4 L-8,-6.4 L-4.4,-2.8 Z"/>'
      + '<path d="M3.2,-8.4 L8,-6.4 L4.4,-2.8 Z"/>'
      + '<rect x="-3.4" y="-6" width="6.8" height="13"/>'
      + '<circle cx="0" cy="-6" r="3.4"/>'
      + '<path d="M-3.4,4 L-8.2,11.5 L-3.4,9.4 Z"/>'
      + '<path d="M3.4,4 L8.2,11.5 L3.4,9.4 Z"/>'
      + '</g>'
      + '<path d="M0,12.5 L0,17.5" stroke="currentColor" stroke-width="2" opacity=".75" stroke-linecap="round" fill="none"/>'
      + '<circle cx="0" cy="-1.5" r="1.6" fill="#ffffff" opacity=".6"/>'
      + '</g></svg>';
  }

  function polarStarSvg() {   // 极夜流光「北极星」：四芒极星 + 地平弧——「极」之指向星，呼应标记锁定（用户 2026-09-27 选定 C）
    return '<svg viewBox="-20 -20 40 40" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M-13,11 A15,15 0 0,1 13,11" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".5" stroke-linecap="round"/>'
      + '<g fill="currentColor">'
      + '<path d="M0,-16 L1.7,-1.7 L16,0 L1.7,1.7 L0,16 L-1.7,1.7 L-16,0 L-1.7,-1.7 Z"/>'
      + '<path d="M0,-16 L1.7,-1.7 L16,0 L1.7,1.7 L0,16 L-1.7,1.7 L-16,0 L-1.7,-1.7 Z" transform="rotate(45) scale(.48)"/>'
      + '</g></svg>';
  }
  function swordSvg() {   // 无界飞剑「单剑」：按已定稿字形 † 转绘矢量（剑尖朝上 + 剑格 + 剑柄圆镡），统一四副武器矢量渲染口径（尺寸/对齐一致）
    return '<svg viewBox="-20 -20 40 40" xmlns="http://www.w3.org/2000/svg">'
      + '<g fill="currentColor">'
      + '<path d="M0,-18 C1.1,-13 1.6,-8 1.6,-2 L1.6,2 L-1.6,2 L-1.6,-2 C-1.6,-8 -1.1,-13 0,-18 Z"/>'
      + '<rect x="-6.5" y="2" width="13" height="2.2" rx="1.1"/>'
      + '<rect x="-1.2" y="4.4" width="2.4" height="7.6"/>'
      + '<circle cx="0" cy="14.4" r="2.4"/>'
      + '</g>'
      + '<path d="M0,-13.5 L0,0" stroke="#ffffff" stroke-width=".8" opacity=".45" fill="none"/>'
      + '</svg>';
  }

  // ---------- 驾驶员系统 ----------
  // 主界面选择、整场战斗生效的驾驶员（战斗修正 + 装备连携）。注册表键序 = 主菜单卡片展示顺序。
  // brief = 主菜单卡片简短文案；desc = 数值与机制图鉴「驾驶员」页的详细机制文案。
  // 效果键（缺省安全回退，与 diffMods 同约定）：
  //   bombDmgMul    可莉：高能爆弹（绷绷炸弹）伤害倍率
  //   bombStartAdd  可莉：初始爆弹额外数量
  //   dashDur/dashLv 许凯狗：开场冲刺时长（s）/ 结束时跳到的关卡等级
//   speedFast/speedSlow 马兴犬：Shift 加速 / CapsLock 减速的移速倍率（同键再按恢复原速）
  //   chargeDur/scoreMul 埃逸：死亡蓄力自爆时长（s）/ 自爆击杀的得分倍率
  //   chargeBonus/secondCostMul 炼金璃：连携七日澜心的充能次数加成 / 持有第 1 个充能时第 2 次充能的水晶分数倍率
  //   layerMax/layerCap 叮咚鸡：计数表单层上限 / 最多持有层数
  //   missileCount/missileArc/missileSpeed/missileR/missileDmg 叮咚鸡：Q 导弹参数（发数 / 前向扇形角 / 弹速 / 弹体半径 / 直击伤害）
  //   berserkUpsMax 叮咚鸡：升级至暴走（4→5 级）的全局次数上限（4/5 级按技能均消耗机会）
  //   counterMax/killGain/bossKillMul/eliteKillMul/elites/bossTickGain 依：击杀计数上限 / 各类别击杀增量（1~5 类）/
  //     BOSS 战计数倍率 / 击败四精英的倍率与其类型清单 / BOSS 战每秒自然计数
  //   scytheR/scytheGripR/scytheTilt/scytheDur/scytheWidth/scytheBaseDmg/scytheHpPct/scytheHpPctCap 依：镰刀清扫参数
  //     （斩击半径=刀刃外圈 / 刀柄轨迹半径 / 刃尖弯钩偏角 / 斩击一圈时长 / 素材绘制高度 / 基础伤害 / 最大生命百分比 / 百分比部分封顶）
  //   gaugeFull/bossCharge/stormChargeMin~Max 天秀忧郁王子：量表所需非水晶分数（基准；真我/诗篇 mods.princeGaugeFull 覆盖）/
  //     BOSS 战每秒充能 / 暴风之眼战每秒充能（10%~16% 随机）
  //   stormDmgCut/stormCrashCut 天秀：来自暴风之眼的伤害削减（普通/碰撞）
  //   （原 otherDmgCut 暴风之眼战其余我方伤害削减已取消——2026-10-02 用户定稿：非风暴伤害不再削减，改为携带天秀时暴风之眼血量 ×2，见 05-boss spawnBoss）
  // 注册表键序 = 主菜单卡片展示顺序（none 除外，不展示）：
  //   主槽：大狗 / 许凯狗 / 埃逸 / 可莉 / 哈基米大王 / 马兴犬 / 温酒客 / 胡笛客
  //   副槽：小艺 / 大无垠之王 / 陵落 / 天秀忧郁王子 / 炼金璃 / 依 / 叮咚鸡 / 萧杨
  // 陵落「彼岸花」矢量图标（iconSvg）：内联 SVG 字符串——currentColor 继承注册色，
  // 辉光由 .glyph-svg 的 drop-shadow 提供（渲染点：主菜单驾驶员卡片 / 数值图鉴「驾驶员」页标题）。
  function higanbanaSvg() {
    let petals = '';
    for (let i = 0; i < 6; i++) {
      petals += '<path d="M0 -2.6 C3.2 -5.2 3.8 -10.5 1.4 -17.5 C0.5 -13.2 -0.5 -13.2 -1.4 -17.5 C-3.8 -10.5 -3.2 -5.2 0 -2.6 Z"'
        + (i ? ' transform="rotate(' + i * 60 + ')"' : '') + '/>';
    }
    return '<svg viewBox="-20 -20 40 40" xmlns="http://www.w3.org/2000/svg">'
      + '<g fill="currentColor" stroke="rgba(216,180,254,.5)" stroke-width=".8">' + petals + '</g>'
      + '<circle r="5.5" fill="none" stroke="rgba(233,213,254,.55)" stroke-width=".7"/>'
      + '<circle r="2.7" fill="#e9d5ff"/></svg>';
  }

  // 依「四瓣花」矢量图标（iconSvg）：内联 SVG 字符串——#FFC0CB → 白色线性渐变填充（注册色即渐变本体）
  function meiGlyphSvg() {
    let petals = '';
    for (let i = 0; i < 4; i++) {
      petals += '<path d="M0 -2.4 C2.8 -4.8 3.4 -9.6 1.2 -16 C0.4 -12 -0.4 -12 -1.2 -16 C-3.4 -9.6 -2.8 -4.8 0 -2.4 Z"'
        + (i ? ' transform="rotate(' + i * 90 + ')"' : '') + '/>';
    }
    return '<svg viewBox="-20 -20 40 40" xmlns="http://www.w3.org/2000/svg">'
      + '<defs><linearGradient id="yiGlyphGrad" x1="0" y1="1" x2="1" y2="0">'
      + '<stop offset="0" stop-color="#FFC0CB"/><stop offset="1" stop-color="#FFFFFF"/></linearGradient></defs>'
      + '<g fill="url(#yiGlyphGrad)" stroke="rgba(255,192,203,.55)" stroke-width=".8">' + petals + '</g>'
      + '<circle r="5" fill="none" stroke="rgba(255,192,203,.6)" stroke-width=".7"/>'
      + '<circle r="2.4" fill="#fff"/></svg>';
  }

  /* ---------- 伤害类型 ----------
   * 普通伤害：我方主炮 / 僚机弹 / 撞机反伤等，可被御4防御光环、4类高火减伤、先兆者僚机减伤等乘区削减
   * 真实伤害：无视一切减伤乘区——目前仅高能爆弹，在 useBomb 中直接结算（不经过 updateBullets 的减伤链）
   */
  const STAR_COUNT = 90;

  export {
    CANVAS_W, CANVAS_H, DEMO_TOP, DEMO_BOTTOM,
    stormEyeImg, stormEyeLoader, lightningImg, lightningLoader,
    lightningImgAlt, lightningLoaderAlt, lightningImgThin, lightningLoaderThin,
    lightningImgBig, lightningLoaderBig, lightningImgSmall, lightningLoaderSmall,
    lightningImgRing, lightningLoaderRing, energyOrbSheet, energyOrbSheetLoader,
    ENERGY_ORB, scytheImg, scytheLoader, darkhandImg,
    darkhandLoader, DH_SOLID_GRID, dhSolidMask, dhSampleSolid,
    puxuefengImg, puxuefengLoader, hanxixianImg, hanxixianLoader,
    xiayongImg, xiayongLoader, xinguodongImg, xinguodongLoader,
    bakeGreenTart, tartImg, tartStripImg, tartUltraImg,
    subGradSeq, flameRingSvg, dogMissileSvg, polarStarSvg,
    swordSvg, higanbanaSvg, meiGlyphSvg, STAR_COUNT,
  };
