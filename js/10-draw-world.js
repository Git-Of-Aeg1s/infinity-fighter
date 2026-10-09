// 10-draw-world：敌机绘制分发 / 双 BOSS 绘制与血条 / 警报演出 / render()

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：13-encyclopedia(2 名) 14-main(1 名)
  //
  import { CANVAS_H, CANVAS_W, DEMO_BOTTOM, DEMO_TOP, puxuefengImg, hanxixianImg, xiayongImg, xinguodongImg, scytheImg, tartImg, tartStripImg } from './01-config-core.js';
  import { PILOTS, PRINCE_STORM, currentArmor } from './01-config-loadout.js';
  import { ANVIL, CAPITAL_PALETTE, ELITES, ENEMY_TYPES, GUNSHIP_PALETTE, WIP_PLACEHOLDER_TYPES } from './01-config-enemies.js';
  import { DARKHAND, currentDifficulty, isPoem, isRealme } from './01-config.js';
  import { blastRings, bossFlow, bulwarkBurst, clamp, crystalBurst, crystals, ctx, dashKillFx, ddjMissiles, drawNebulae, drawStars, eBullets, enemies, feijianWaves, friendStorms, pBullets, particles, phaseFx, player, playerHitFx, powerups, rand, state, trailGhosts, watchClearFx, xinRings, meiScythes } from './02-core.js';
  import { berserkBurst, bombBurst, shieldBurst } from './08-entities.js';
  import { drawAnvilBody, drawBaolingBody, drawBaolingBombs, drawBaolingGBody, drawCubeHitFx, drawDagouMissiles, drawDouzhiBody, drawDouzhiFx, drawDuskStrikerBody, drawFashiA1Body, drawFashiA2Body, drawFashiArrayBody, drawFashiMatrixBody, drawFortressStrikerBody, drawFrostZones, drawHanshuangBody, drawHarbingerBody, drawItemPickFx, drawJiaoxiangBody, drawMissileWarns, drawMissiles, drawPlayer, drawPlayerHitFx, drawPopianBody, drawPopianFx, drawPopianUBody, drawPulseMatrixBody, drawSlashFx, drawSpellCubes, drawStarslayerBeam, drawUnrealBody, drawWarGhostBody, drawWarGhostSlashes, drawWarGhostWarns, drawWeilongBody, drawWingmen, drawYu4Body, getCrystal3DSprite } from './09-draw-ships.js';
  import { drawBoss, drawBossBars, drawBossWarning, drawStormVortex, drawTornado, drawZoneMarks } from './11-draw-boss.js';



  // 渐变缓存：渐变对象仅取决于颜色/半径等关键参数、与坐标无关，按 key 复用，
  // 绘制时配合 translate 平移到目标位置（坐标随弹移动、渐变不变），消除每帧海量 Gradient 对象。
  // 注意：缓存值绑定主画布 ctx；图鉴预览走 withPreviewCtx 的独立上下文、不经过此缓存。
  const gradCache = new Map();
  function cachedGrad(key, make) {
    let g = gradCache.get(key);
    if (!g) {
      if (gradCache.size > 128) gradCache.clear();   // 防御性上限（避免任何意外 key 无限增长）
      g = make();
      gradCache.set(key, g);
    }
    return g;
  }

  // 巨大蛋挞黑色剪影（2026-10-03 性能修复）：生长动画原用 ctx.filter='brightness(gp²)' 逐帧滤镜，
  // 与黑暗之手本体滤镜叠加造成战斗段卡顿。改为一次性烘焙纯黑剪影（source-in 保留原 alpha），
  // 生长时黑剪影打底 + 真色按 gp² 做 globalAlpha 叠加——亮度缩放与 filter 在数学上等价
  //（黑底上叠加系数 a：输出 rgb = a×rgb，即 brightness(a)），逐帧零滤镜。未加载时返回 null 回退平涂。
  let tartDarkImg = null, tartDarkTried = false;
  function ensureTartDark() {
    if (tartDarkTried) return tartDarkImg;
    tartDarkTried = true;
    if (!tartImg) return null;
    try {
      const c = document.createElement('canvas');
      c.width = tartImg.width; c.height = tartImg.height;
      const g = c.getContext('2d');
      g.drawImage(tartImg, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#000000';
      g.fillRect(0, 0, c.width, c.height);
      tartDarkImg = c;
    } catch (err) { tartDarkImg = null; }
    return tartDarkImg;
  }

  // 诗篇占位敌人（wip）：统一白色方块占位造型（碰撞盒同尺寸，清单见 01-config WIP_PLACEHOLDER_TYPES；
  // 专属外观待逐个实装后从清单移除）
  function drawWipPlaceholderBody(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.fillRect(-e.w / 2, -e.h / 2, e.w, e.h);
    ctx.strokeRect(-e.w / 2, -e.h / 2, e.w, e.h);
    ctx.restore();
  }

  function drawEnemy(e) {
    // 诗篇占位敌人（wip）：统一白色方块占位造型
    if (WIP_PLACEHOLDER_TYPES.includes(e.type)) { drawWipPlaceholderBody(e); return; }
    if (e.type === 'tornado') { drawTornado(e); return; }   // 龙卷专用绘制（自身处理 translate）
    // 战争幽灵：世界坐标层预警（入场/离场风波 + 技能1扇形 / 技能2双线），先于本体绘制（图层在机体之下）
    if (e.type === 'warGhost') drawWarGhostWarns(e);
    // 4S 精英：世界坐标层预警（朴学峰穿刺线 / 夏勇坠击落点影子），先于本体绘制（图层在机体之下）
    if (e.elPhase != null) drawEliteWarns(e);
    ctx.save();
    ctx.translate(e.x, e.y);
    // 虚化（护盾期）：机身半透明闪烁
    if (e.phase > 0) ctx.globalAlpha = 0.45 + Math.sin(state.time * 9) * 0.12;
    ctx.scale(ENEMY_TYPES[e.type].drawScale, ENEMY_TYPES[e.type].drawScale);   // 体型放大
    ctx.fillStyle = e.color;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1.2;

    if (e.type === 'harbinger') {
      drawHarbingerBody(e);   // 自带填充与描边（圆环 + 横杠 + 红/灰充能核心）
    } else if (e.type === 'weilong') {
      drawWeilongBody(e);     // 自带填充与描边（四角环状旋翼 + 磨角矩形机身 + 指向炮管 + 橙黄渐变）
    } else if (e.type === 'baoling') {
      drawBaolingBody(e);     // 自带填充与描边（白灰磨角方形机体 + 黑横杠风扇 + 前挂红道黑炸弹）
    } else if (e.type === 'baolingG') {
      drawBaolingGBody(e);    // 暴鸰·G：同暴鸰机体 ×1.05 + 前挂胶囊形炸弹（半圆+矩形+半圆，矩形多道横杠）
    } else if (e.type === 'unreal') {
      drawUnrealBody(e);      // 虚幻：同暴鸰机体 + 冰青桨心 + 机身雪花标识 + 前挂青蓝渐变圆柱炸弹（椭圆顶面 + 两道半圆弧线）
    } else if (e.type === 'douzhi' || e.type === 'sponsor' || e.type === 'sponsorDeluxe') {
      drawDouzhiBody(e);      // 奖励无人机（斗志昂扬/赞助/豪华赞助）：类暴鸰灰黑方形机体 + 四轮红色间歇闪光 + 上扬双箭头标志 + 下挂盒子（盒色/高度按类型）
    } else if (e.type === 'hanshuang') {
      drawHanshuangBody(e);   // 自带填充与描边（四角圆角矩形旋翼舱 + 灰黑渐变机身 + 天蓝霜纹边缘 + 冰蓝光圈）
    } else if (e.type === 'yu4') {
      drawYu4Body(e);         // 自带填充与描边（介于圆与方之间的超椭圆暖灰渐变机身 + 金色X形条纹 + 中央淡黄反应核 + 四角风扇圆 + 金色六边力场）
    } else if (e.type === 'anvil') {
      // 治疗标识：治疗光环（力场）完全展开后，机身下层浮现绿色"+"（先于 drawAnvilBody 绘制 → 图层低于飞机；
      // 图鉴预览无 auraT 不绘制；出现时 0.6s smoothstep 渐显；臂长/臂宽 2026-09 批次：宽度增宽、长度稍增）
      if ((e.auraT || 0) >= ANVIL.auraDelay + ANVIL.auraFadeIn) {
        const fp0 = clamp((e.auraT - (ANVIL.auraDelay + ANVIL.auraFadeIn)) / 0.6, 0, 1);
        const fp = fp0 * fp0 * (3 - 2 * fp0);   // 渐显 smoothstep
        const ga = (0.5 + Math.sin(state.time * 3 + (e.wobble || 0)) * 0.15) * fp;
        ctx.globalAlpha = ga;
        ctx.fillStyle = '#3ecf6e';
        const pl = 34, pw = 9;   // 臂半长/臂宽（局部坐标，drawScale 1.44 放大）
        ctx.fillRect(-pw / 2, -pl, pw, pl * 2);
        ctx.fillRect(-pl, -pw / 2, pl * 2, pw);
        ctx.globalAlpha = 1;
      }
      drawAnvilBody(e);       // 自带填充与描边（菱形黑灰框架 + 中央灰黑正方形 + 上下左右横杠 + 中心朝下凸出白杠 + 正方形青绿治疗光环）
    } else if (e.type === 'fashiA1') {
      drawFashiA1Body(e);     // 自带填充与描边（四角风扇圆 + 灰黑矩形1:3:1紫光条 + 底部深紫炮管）
    } else if (e.type === 'fashiA2') {
      drawFashiA2Body(e);     // 自带填充与描边（A1 强化版：炫紫更白亮 + 紫心风扇圆 + 更粗更长炮管）
    } else if (e.type === 'popian') {
      drawPopianBody(e);      // 自带填充与描边（灰白金属菱形边框 + 中心黑杠红头 + 底部双黑炮管）
    } else if (e.type === 'popianU') {
      drawPopianUBody(e);     // 破片U型：同破片机体（菱形四角/核心描边改红，双杠黑底红能流动，炮口改红，尾焰随移动方向）
    } else if (e.type === 'fashiMatrix') {
      drawFashiMatrixBody(e); // 自带填充与描边（竖菱形白红渐变外体 + 细黑菱形环 + 白红核心）
    } else if (e.type === 'fashiArray') {
      drawFashiArrayBody(e);  // 自带填充与描边（三座法术矩阵样式菱形 + 灰黑底座；中央血红色带流动特效）
    } else if (e.type === 'pulseMatrix') {
      drawPulseMatrixBody(e); // 自带填充与描边（三座法术矩阵顶点相连 + 暗红核心；含脉冲预警收缩圈/冲击波/放大动效）
    } else if (e.type === 'warGhost') {
      drawWarGhostBody(e);    // 自带填充与描边（金黄渐变流动机体 + 晶格流光 + B2 移植件（白银边框/四帆/五边形核/巨镰双刃）；抵达刃转演出/三态尾焰内含）
    } else if (e.elPhase != null) {
      drawEliteBody(e);       // 4S 精英：素材立绘本体（自带适配缩放与回退造型；技能特效在世界层 drawEliteFx）
    } else if (e.type === 'jiaoxiang') {
      drawJiaoxiangBody(e);   // 自带填充与描边（橙火红渐变环 + 火焰光环 + 三根旋转横杠 + 白圆；见 09-draw-ships）
    } else if (e.type === 'striker' && e.skill === 'dusk') {
      drawDuskStrikerBody(e); // 自带填充与描边（暗黑渐变菱形 + 微亮描边 + 中央白色发光核心；渐显/渐隐透明度内含）
    } else if (e.type === 'striker' && e.skill === 'fortress') {
      drawFortressStrikerBody(e); // 自带填充与描边（黄色倒置菱形 + 前置能量盾：盾沿增粗外移 + 流光；见 09-draw-ships）
    } else {
    if (e.type === 'side' && e.behavior === 'moon') {
      // 赤月侧翼艇：红色箭镖，造型与其他 1类完全一致，仅将顶角精确旋转到当前航向（= 子弹发射方向）
      // 自带填充与描边（分支内完整绘制），末尾清空路径让尾部公共 fill/stroke 空跑
      const v = e._sideVel || { vx: 0, vy: 60 };
      ctx.rotate(Math.atan2(v.vy, v.vx) - Math.PI / 2);   // 造型默认顶角朝下（+y），旋转到航向
      ctx.beginPath();
      ctx.moveTo(0, 12.1);
      ctx.lineTo(9.35, -7.7);
      ctx.lineTo(0, -3.3);
      ctx.lineTo(-9.35, -7.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // 赤色月核：中央淡红圆核 + 内嵌偏移红点（构成月牙观感；红点完全收入浅核内，无外溢小块）
      ctx.fillStyle = 'rgba(255, 224, 224, 0.9)';
      ctx.beginPath();
      ctx.arc(0, 1.3, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(-0.55, 1.05, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();   // 清空路径：尾部公共 fill/stroke 空跑（本体已在分支内绘制完毕）
    } else if (e.type === 'side' || e.type === 'prolifera') {
      // 1类/增生侧翼艇：小型三角箭镖（宽 ±9.35 / 长 19.8），顶角精确指向移动方向——
      // 侧翼/顶部斜插的航向随编队基值变化，固定 ±0.35 倾角会出现朝向与实际航向不符（2026-09 批次改为按 _sideVel 精确旋转）；
      // 青时炮艇召唤体（_velTilt）速度曲线逐帧缓动 → 朝向自然平滑过渡；无 _sideVel（图鉴预览等）竖直朝下
      const v = e._sideVel || { vx: 0, vy: 60 };
      ctx.rotate(Math.atan2(v.vy, v.vx) - Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, 12.1);
      ctx.lineTo(9.35, -7.7);
      ctx.lineTo(0, -3.3);
      ctx.lineTo(-9.35, -7.7);
      ctx.closePath();
    } else if (e.type === 'escort') {
      // 卫护飞船：深蓝紫渐变等腰三角（顶角精确指向飞行方向）+ 紫色边缘光芒（与浅蓝水晶明确区分）
      const v = e._sideVel || { vx: 0, vy: 60 };
      ctx.rotate(Math.atan2(v.vy, v.vx) - Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, 5.5);
      ctx.lineTo(3.75, -5.5);
      ctx.lineTo(-3.75, -5.5);
      ctx.closePath();
      const escG = ctx.createLinearGradient(0, 5.5, 0, -5.5);   // 尾深顶亮的蓝紫渐变
      escG.addColorStop(0, '#2b2f77');    // 深蓝紫（尾部）
      escG.addColorStop(0.55, '#4a49b8'); // 蓝紫
      escG.addColorStop(1, '#8a63ff');    // 亮紫（顶角）
      ctx.fillStyle = escG;
      ctx.shadowColor = '#9a6bff';        // 边缘紫色光芒
      ctx.shadowBlur = 7;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(196, 160, 255, 0.95)';   // 紫色发光描边
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.beginPath();   // 清空路径：尾部公共 fill/stroke 空跑
    } else if (e.type === 'striker') {
      // 2类：菱形战机
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.lineTo(15, -4);
      ctx.lineTo(0, -13);
      ctx.lineTo(-15, -4);
      ctx.closePath();
    } else if (e.type === 'gunship') {
      // 3类：宽体炮艇，双引擎短翼
      ctx.beginPath();
      ctx.moveTo(0, 20);
      ctx.lineTo(16, 10);
      ctx.lineTo(23, -2);
      ctx.lineTo(12, -6);
      ctx.lineTo(8, -17);
      ctx.lineTo(-8, -17);
      ctx.lineTo(-12, -6);
      ctx.lineTo(-23, -2);
      ctx.lineTo(-16, 10);
      ctx.closePath();
      // 舰体渐变（后/上暗 → 前/下亮）取代纯色平涂，增强装甲立体感
      const gpal = GUNSHIP_PALETTE[e.variant] || GUNSHIP_PALETTE.violet;
      const ghull = ctx.createLinearGradient(0, -17, 0, 20);
      ghull.addColorStop(0, gpal.dark);
      ghull.addColorStop(0.5, gpal.base);
      ghull.addColorStop(1, gpal.light);
      ctx.fillStyle = ghull;
    } else {
      // 4类：主力舰中央舰体（两侧机翼为独立部件，见下方折翼绘制，从中心横向滑出）
      ctx.beginPath();
      ctx.moveTo(0, 34);
      ctx.lineTo(19, 25);
      ctx.lineTo(19, -21);
      ctx.lineTo(10, -34);
      ctx.lineTo(-10, -34);
      ctx.lineTo(-19, -21);
      ctx.lineTo(-19, 25);
      ctx.closePath();
      // 舰体渐变（后/上暗 → 前/下亮）取代纯色平涂，增强装甲立体感
      const cpal = CAPITAL_PALETTE[e.variant] || CAPITAL_PALETTE.crimson;
      const hullGrd = ctx.createLinearGradient(0, -34, 0, 34);
      hullGrd.addColorStop(0, cpal.dark);
      hullGrd.addColorStop(0.5, cpal.base);
      hullGrd.addColorStop(1, cpal.light);
      ctx.fillStyle = hullGrd;
    }
    ctx.fill();
    ctx.stroke();

    // 4类折翼：两翼独立部件，刚体横向位移（下降途中收拢于中心，就位后从中间向两侧滑出拼接，不缩放）
    if (e.type === 'capital') {
      const wpal = CAPITAL_PALETTE[e.variant] || CAPITAL_PALETTE.crimson;
      // 展开进度 wingT：0=收拢（贴于中心、翼尖露出一角）→ 1=完全展开（就位）；缓入缓出、无过冲
      let wingT = 1;
      if (e.unfoldT > 0) {
        const p = clamp(1 - e.unfoldT / 0.55, 0, 1);
        wingT = p * p * (3 - 2 * p);   // smoothstep 缓入缓出：速度 0→最大→0，起步/到位都柔和
      } else if (!e.arrived && e.unfoldT == null) {
        wingT = 0;   // 下降途中（展开未开始）机翼收拢于中心；展开完成后缓冲滑行期间保持展开
      }
      const retract = 20;   // 收拢时两翼向中心内移距离（翼尖收到 ±27，露出舰体边缘 ±19 一角）
      for (const sx of [-1, 1]) {
        ctx.save();
        // 刚体平移：从中心滑出至两侧（取代原横向缩放，翼形不变形）
        ctx.translate(-sx * (1 - wingT) * retract, 0);
        // 翼面（五边形，翼根竖边贴合舰体切割线）
        ctx.beginPath();
        ctx.moveTo(sx * 19, 25);
        ctx.lineTo(sx * 30, 8);
        ctx.lineTo(sx * 47, 2);
        ctx.lineTo(sx * 40, -16);
        ctx.lineTo(sx * 19, -21);
        ctx.closePath();
        const wGrd = ctx.createLinearGradient(0, -34, 0, 34);
        wGrd.addColorStop(0, wpal.dark);
        wGrd.addColorStop(0.5, wpal.base);
        wGrd.addColorStop(1, wpal.light);
        ctx.fillStyle = wGrd;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // 翼面斜向装甲分块（仅保留后侧一道；靠近机头的前侧斜线已按用户要求移除）
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.30)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(sx * 15, -20); ctx.lineTo(sx * 38, -8); ctx.stroke();
        ctx.restore();
      }
    }

    // 座舱（体型越大座舱越大；卫护飞船为纯三角形，无核心；4S 精英为素材立绘，无座舱）
    if (e.type !== 'escort' && e.elPhase == null) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.beginPath();
      ctx.arc(0, 0, e.type === 'capital' ? 7 : e.type === 'gunship' ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3类炮艇精细化：装甲分块 + 变体涂装 + 能量核心 + 双引擎辉光 + 受光边缘
    if (e.type === 'gunship') {
      const pal = GUNSHIP_PALETTE[e.variant] || GUNSHIP_PALETTE.violet;
      const pulse = 0.6 + Math.sin(state.time * 3.2 + (e.wobble || 0)) * 0.4;   // 涂装/引擎呼吸

      // (1) 装甲分块线（暗色，勾勒炮艇结构：中央龙骨 + 翼根/前翼缝）
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.30)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, 17); ctx.stroke();          // 中央龙骨
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(sx * 10, -5); ctx.lineTo(sx * 21, -1); ctx.stroke();  // 翼根缝
        ctx.beginPath(); ctx.moveTo(sx * 8, 8); ctx.lineTo(sx * 15, 9); ctx.stroke();      // 前翼缝
      }

      // (2) 变体涂装：紫=双侧斜向能量纹(脉动变亮) / 红=环绕核心的正六边形(脉动变亮、不旋转) / 金=环绕旋转光环（呼应环形弹幕）
      //     橙焰=机体前部边框高光条（机头前缘+前侧翼缘） / 青时=核心援护环+双侧援护舱（呼应支援弹/屏障）
      ctx.shadowColor = pal.glow;
      ctx.shadowBlur = 8;
      ctx.globalAlpha = 0.55 + pulse * 0.4;
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 2;
      if (e.variant === 'amber') {
        const ringRot = state.time * 1.8 + (e.wobble || 0);
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.ellipse(0, 2, 17, 13, ringRot + i * Math.PI / 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (e.variant === 'crimson') {
        // 赤红：环绕能量核心的正六边形——固定朝向(不旋转)、随 pulse 定期脉动变亮（取代原橙色 <> 光带）
        ctx.globalAlpha = 0.30 + pulse * 0.65;   // 脉动亮度
        ctx.shadowBlur = 3 + pulse * 15;         // 脉动辉光
        ctx.lineWidth = 1.5 + pulse * 1.5;       // 脉动线宽
        const R = 11;                            // 外接圆半径：环绕 r4.5 的能量核心
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 3 * k;             // 固定角度（不含 state.time → 不旋转）
          const hx = Math.cos(a) * R, hy = Math.sin(a) * R;
          if (k === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.stroke();
      } else if (e.variant === 'orange') {
        // 橙焰：机体前部边框高光条——沿机头两条前缘 + 前侧翼缘的余烬描边（脉动变亮，无圈/斜线高光）
        ctx.globalAlpha = 0.35 + pulse * 0.6;
        ctx.shadowBlur = 3 + pulse * 12;
        ctx.lineWidth = 1.6 + pulse * 1.1;
        ctx.beginPath();
        ctx.moveTo(-16, 10); ctx.lineTo(0, 20); ctx.lineTo(16, 10);   // 机头前缘
        ctx.moveTo(-17, 8); ctx.lineTo(-22, -1);                       // 前侧翼缘（左）
        ctx.moveTo(17, 8); ctx.lineTo(22, -1);                         // 前侧翼缘（右）
        ctx.stroke();
      } else if (e.variant === 'cyan') {
        // 青时：核心援护环 + 双侧援护舱 + 四向支援刻痕（青白脉动，呼应支援弹与屏障机制）
        ctx.globalAlpha = 0.30 + pulse * 0.65;
        ctx.shadowBlur = 3 + pulse * 15;
        ctx.lineWidth = 1.5 + pulse * 1.2;
        ctx.beginPath(); ctx.arc(0, 2, 9, 0, Math.PI * 2); ctx.stroke();      // 核心援护环
        for (const sx of [-1, 1]) {
          ctx.beginPath(); ctx.arc(sx * 14, 5, 3.2, 0, Math.PI * 2); ctx.stroke();            // 援护舱
          ctx.beginPath(); ctx.moveTo(sx * 14, 0.2); ctx.lineTo(sx * 14, 1.8); ctx.stroke();  // 舱挂杆
        }
        ctx.beginPath();                                                        // 四向支援刻痕
        ctx.moveTo(0, -13); ctx.lineTo(0, -9.5);
        ctx.moveTo(0, 13.5); ctx.lineTo(0, 10);
        ctx.moveTo(-13, 2); ctx.lineTo(-9.5, 2);
        ctx.moveTo(13, 2); ctx.lineTo(9.5, 2);
        ctx.stroke();
      } else {
        // 紫晶：双侧斜向能量纹（条纹）——与赤红同样的定期脉动变亮
        ctx.globalAlpha = 0.30 + pulse * 0.65;
        ctx.shadowBlur = 3 + pulse * 15;
        ctx.lineWidth = 1.5 + pulse * 1.5;
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx * 11, -4); ctx.lineTo(sx * 19, 0);
          ctx.moveTo(sx * 9, 4); ctx.lineTo(sx * 16, 7);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // (3) 能量核心（座舱位置径向发光核 + 强调色描边，取代纯白平涂）
      const coreGrd = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 5.5);
      coreGrd.addColorStop(0, '#ffffff');
      coreGrd.addColorStop(0.45, pal.light);
      coreGrd.addColorStop(0.8, pal.base);
      coreGrd.addColorStop(1, pal.dark);
      ctx.fillStyle = coreGrd;
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1;
      ctx.shadowColor = pal.glow; ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // (4) 尾部单引擎辉光（后部/上方居中一个喷口，呼吸明灭）
      {
        const engGrd = ctx.createRadialGradient(0, -16, 0.4, 0, -16, 6);
        engGrd.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        engGrd.addColorStop(0.4, pal.accent);
        engGrd.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.globalAlpha = 0.45 + pulse * 0.5;
        ctx.fillStyle = engGrd;
        ctx.beginPath(); ctx.ellipse(0, -16, 4.5, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      // (5) 舰体受光边缘高光（后缘 + 机头前缘，增强立体感）
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-8, -17); ctx.lineTo(8, -17); ctx.stroke();                    // 后缘
      ctx.beginPath(); ctx.moveTo(-16, 10); ctx.lineTo(0, 20); ctx.lineTo(16, 10); ctx.stroke();   // 机头前缘
    }

    // 4类主力舰精细化：装甲分块 + 变体涂装光带 + 舰桥指挥塔 + 引擎辉光 + 受光边缘
    if (e.type === 'capital') {
      const pal = CAPITAL_PALETTE[e.variant] || CAPITAL_PALETTE.crimson;
      const pulse = 0.6 + Math.sin(state.time * 3 + (e.wobble || 0)) * 0.4;   // 光带/引擎呼吸

      // (1) 装甲分块线（暗色，勾勒厚重舰体结构；横向缝限制在舰体宽度 ±17 内，避免折翼未展开时线条悬空于机翼区）
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.30)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, 30); ctx.stroke();          // 中央龙骨
      // 横向装甲缝：去掉穿过核心的 y=2；蓝4 去掉 y=-14（仅留 y=18）；赤金去掉靠近核心的上下两条（-14/18 全去）
      const seams = e.variant === 'azure' ? [18] : e.variant === 'crgold' ? [] : [-14, 18];
      for (const yy of seams) {
        ctx.beginPath(); ctx.moveTo(-17, yy); ctx.lineTo(17, yy); ctx.stroke();
      }
      // 舰体-机翼接缝竖线（±19）：显式重描——机翼填充会盖掉舰体描边的外半侧，且离屏缩放贴图中
      // 1.2px 细线易被降采样吞掉（左右相位不同可能只吞一侧）；显式绘制保证左右两条都清晰可见
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const sx of [-1, 1]) {
        ctx.moveTo(sx * 19, -21);
        ctx.lineTo(sx * 19, 25);
      }
      ctx.stroke();
      // 两侧斜向分块已移入翼面绘制（随折翼变形）

      // (2) 变体涂装光带：赤红 = 两侧 V 形光带；苍蓝 = 横向甲板灯带；赤金 = 旋转双环（金曜炮艇风格放大版）
      ctx.shadowColor = pal.glow;
      ctx.shadowBlur = 9;
      ctx.globalAlpha = 0.5 + pulse * 0.4;
      if (e.variant === 'azure') {
        ctx.strokeStyle = pal.accent;                     // 横向甲板灯带（限制在舰体宽度 ±17 内）
        ctx.lineWidth = 2.2;
        for (const yy of [-20, 14]) {
          ctx.beginPath(); ctx.moveTo(-17, yy); ctx.lineTo(17, yy); ctx.stroke();
        }
      } else if (e.variant === 'crgold') {
        // 赤金：环绕舰体的旋转双环（金曜炮艇的双环放大版）——施放「金环扩散」消耗一枚，环数随剩余递减；
        // 机翼展开完成后才逐渐显现（ringT 渐入）
        const reveal = clamp((e.ringT || 0) / 0.8, 0, 1);
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 2.4;
        ctx.globalAlpha *= reveal;
        const ringRot = state.time * 1.5 + (e.wobble || 0);
        for (let i = 0; i < (e.ringsLeft || 0); i++) {
          ctx.beginPath();
          ctx.ellipse(0, 0, 30 - i * 3, 22 - i * 2.5, ringRot + i * Math.PI / 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 2.2;
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx * 7, -26); ctx.lineTo(sx * 18, -6); ctx.lineTo(sx * 11, 22);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // 赤金「金环扩散」：扩大中的金色圆环（世界半径 → 局部坐标）——本体随进度逐渐变淡，带旋转虚线外环；
      // 到达最大范围即刻消散（无停顿阶段）；被斩断（broken）后分裂为两段弧、断口张开 + 外飘快速淡出
      if (e.ringWave) {
        const w = e.ringWave;
        const lwR = w.r / (ENEMY_TYPES.capital.drawScale || 1);
        if (w.broken) {
          const k = clamp(w.fadeT / w.fadeDur, 0, 1);
          const gap = 0.3 + k * 1.1;   // 断口随消散张开（敌机绘制无旋转，doSlash 记录的世界角可直接使用）
          const rr = lwR + k * 16;
          ctx.save();
          ctx.strokeStyle = pal.accent;
          ctx.shadowColor = pal.glow;
          ctx.shadowBlur = 14 * (1 - k);
          ctx.lineWidth = Math.max(0.5, 3.2 * (1 - k));
          ctx.globalAlpha = (0.55 + pulse * 0.45) * (1 - k);
          const span1 = w.span - gap * 2, span2 = Math.PI * 2 - w.span - gap * 2;
          if (span1 > 0.05) { ctx.beginPath(); ctx.arc(0, 0, rr, w.angA + gap, w.angA + gap + span1); ctx.stroke(); }
          if (span2 > 0.05) { ctx.beginPath(); ctx.arc(0, 0, rr, w.angA + w.span + gap, w.angA + w.span + gap + span2); ctx.stroke(); }
          ctx.restore();
        } else {
          const prog = clamp(w.t / w.dur, 0, 1);
          const fade = 1 - prog * 0.55;   // 扩环期间本体逐渐变淡（结束时已淡至 45%，随即消散）
          ctx.save();
          ctx.globalAlpha = (0.55 + pulse * 0.45) * fade;
          ctx.strokeStyle = pal.accent;
          ctx.shadowColor = pal.glow;
          ctx.shadowBlur = 16;
          ctx.lineWidth = 3.2;
          ctx.beginPath(); ctx.arc(0, 0, lwR, 0, Math.PI * 2); ctx.stroke();
          // 旋转虚线外环（扩散动感）
          ctx.globalAlpha = 0.5 * fade;
          ctx.lineWidth = 1.6;
          ctx.setLineDash([10, 14]);
          ctx.lineDashOffset = -state.time * 40;
          ctx.beginPath(); ctx.arc(0, 0, lwR + 9, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
          // 内侧淡金衬环
          ctx.globalAlpha = 0.22 * fade;
          ctx.lineWidth = 7;
          ctx.beginPath(); ctx.arc(0, 0, lwR, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
      }

      // (3) 舰桥指挥塔（暗座 + 径向发光核心 + 强调色描边）
      ctx.fillStyle = 'rgba(12, 9, 18, 0.88)';
      ctx.beginPath(); ctx.ellipse(0, -2, 13, 15, 0, 0, Math.PI * 2); ctx.fill();   // 舰桥底座
      const bridgeGrd = ctx.createRadialGradient(0, -3, 1, 0, -3, 8);
      bridgeGrd.addColorStop(0, '#ffffff');
      bridgeGrd.addColorStop(0.4, pal.light);
      bridgeGrd.addColorStop(0.75, pal.base);
      bridgeGrd.addColorStop(1, pal.dark);
      ctx.fillStyle = bridgeGrd;
      ctx.beginPath(); ctx.arc(0, -3, 7.5, 0, Math.PI * 2); ctx.fill();             // 发光核心
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 1.3;
      ctx.shadowColor = pal.glow; ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 红4：舰桥核心外圈六边形框（accent 发光，圈住核心）
      if (e.variant === 'crimson') {
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 1.6;
        ctx.shadowColor = pal.glow; ctx.shadowBlur = 10;
        ctx.globalAlpha = 0.65 + pulse * 0.35;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + i * Math.PI / 3;   // 尖顶六边形
          const hx = Math.cos(a) * 12.5, hy = -3 + Math.sin(a) * 12.5;
          i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }

      // (4) 引擎辉光（后部/上方 3 个喷口，呼吸明灭）
      for (const ex of [-12, 0, 12]) {
        const engGrd = ctx.createRadialGradient(ex, -30, 0.5, ex, -30, 7);
        engGrd.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        engGrd.addColorStop(0.35, pal.accent);
        engGrd.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.globalAlpha = 0.45 + pulse * 0.55;
        ctx.fillStyle = engGrd;
        ctx.beginPath(); ctx.ellipse(ex, -30, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      // (5) 舰体受光边缘高光（后缘 + 前缘，增强立体感）
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(-10, -34); ctx.lineTo(10, -34); ctx.stroke();                  // 后缘
      ctx.beginPath(); ctx.moveTo(-18, 24); ctx.lineTo(0, 33); ctx.lineTo(18, 24); ctx.stroke();  // 前缘
    }
    }   // 结束 else（非 harbinger）

    // 切换到未缩放坐标系（血条 / 护盾气泡不随体型变粗）
    ctx.restore();
    ctx.save();
    ctx.translate(e.x, e.y);

    // 蓝色4类护盾：虚化期间显示能量护盾气泡（炮弹穿过、可打到后面的敌人）
    if (e.phase > 0) {
      const rr = Math.max(e.w, e.h) * 0.6;
      const a = 0.4 + Math.sin(state.time * 6) * 0.15;
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#6fe3ff';
      ctx.shadowColor = '#4d9fff';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, rr, rr * 0.82, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = a * 0.22;
      ctx.fillStyle = '#6fe3ff';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // 青时炮艇召唤体次数盾：白色浅盾气泡（小于量子护盾；剩余层数呼吸明灭，耗尽不绘制）
    if ((e.chargeShield || 0) > 0) {
      const cr = Math.max(e.w, e.h) * 0.42;
      const ca = 0.55 + Math.sin(state.time * 5 + (e.wobble || 0)) * 0.15;
      ctx.globalAlpha = ca;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, cr, cr * 0.85, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 血条：受伤后 0.15s 渐显、回满后渐隐（barT 由 updateEnemies 推进）；
    // 白色残量为受击追踪余像（hpTrail 缓慢追赶 hp，同 BOSS 血条实现）；BOSS 血条在 drawBoss 中单独绘制
    if ((e.barT || 0) > 0.01) {
      const w = e.w;
      const hpR = clamp(e.hp / e.maxHp, 0, 1);
      const trailR = clamp((e.hpTrail != null ? e.hpTrail : e.hp) / e.maxHp, 0, 1);
      ctx.globalAlpha = e.barT;
      if (e.elPhase != null) {
        // 4F 精英专属血条（2026-10-03 用户定稿）：更粗（7px）+ 黑红渐变流动——渐变以一个血条宽为周期
        // 黑→红循环、相位随 state.time 平移（≈2.8s 流动一周期，ph=1 与 ph=0 图案重合 → 无缝循环）
        const bh = 7, by = -e.h / 2 - 12;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.fillRect(-w / 2 - 1.5, by - 1.5, w + 3, bh + 3);
        if (trailR > hpR) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-w / 2 + w * hpR, by, w * (trailR - hpR), bh);
        }
        const ph = (state.time / 2.8) % 1;
        const grad = ctx.createLinearGradient(-w / 2 - ph * w, 0, -w / 2 + (2 - ph) * w, 0);
        grad.addColorStop(0, '#180407');
        grad.addColorStop(0.25, '#e02424');
        grad.addColorStop(0.5, '#180407');
        grad.addColorStop(0.75, '#e02424');
        grad.addColorStop(1, '#180407');
        ctx.fillStyle = grad;
        ctx.fillRect(-w / 2, by, w * hpR, bh);
      } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(-w / 2, -e.h / 2 - 8, w, 3);
        if (trailR > hpR) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-w / 2 + w * hpR, -e.h / 2 - 8, w * (trailR - hpR), 3);
        }
        ctx.fillStyle = '#ff9500';
        ctx.fillRect(-w / 2, -e.h / 2 - 8, w * hpR, 3);
      }
      // 青时炮艇支援弹屏障（白蓝覆盖条）：画在血量之上；宽度 = 血条宽 × barrier / max(barrierMax, maxHp)，
      // 锚定右缘——屏障被打时覆盖区自左向右缩短（规格：maxHp 1000 → 覆盖 20%；maxHp < 200 → 全覆盖；
      // 4F 精英无屏障，恒走上面黑红流动分支）
      if ((e.barrier || 0) > 0 && e.barrierMax) {
        const barW = w * clamp(e.barrier / Math.max(e.barrierMax, e.maxHp), 0, 1);
        ctx.fillStyle = '#9ff0e0';
        ctx.fillRect(-w / 2 + w - barW, -e.h / 2 - 8, barW, 3);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // 4F 精英：技能特效（世界坐标层，绘制在机体/血条之上）：韩希先凝视锁定线/激光/炮塔、
    // 夏勇回旋刃/能量球、朴学峰残像、辛国栋落点预警圈
    if (e.elPhase != null) drawEliteFx(e);
  }

  /* ---------- 4F 精英：预警 / 立绘本体 / 技能特效 ---------- */
  // 世界坐标层预警（drawEnemy 内、本体之前调用）：图层在机体之下
  function drawEliteWarns(e) {
    const c = ELITES[e.type];
    const s = e.elSkill;
    // 狞笑朴学峰·流星穿刺/残像换影预警（三连冲）：预警链首尾相接——预警①（竖直，自上而下展开）完成瞬间
    // 冲①出发 + 预警②（横向）立刻出现；预警②展开完成 → 预警③（斜向）立刻出现；预警不再按时间消失，
    // 而是展开完成后保持显示、被本体冲刺实时擦除（冲到哪、哪段消失），对应冲刺走完（出屏）后该段整体消失。
    // 预警线（静态虚线）+ 预警区域（带状，纵向渐变收浓至前缘 + 前缘光晕亮线 + 双侧约束边线）——无闪烁
    if (e.type === 'puxuefeng' && s && (s.kind === 1 || s.kind === 3)) {
      // cut = 本体沿带轴已冲过的距离（带自起点前 26px 处开始）：擦除前沿 = max(26, cut)，冲过整条带
      //（cut ≥ 26+len）后本段预警完全消失；渐变/虚线仍锚定原带坐标（26 → 26+len），色彩与图案不跳变
      const drawPxWarn = (p, sx, sy, ang, cut) => {
        const ease = 1 - (1 - p) * (1 - p);   // easeOut 二次：展开先快后缓
        const bw = c.pierceBandHalfW;
        const len = 900 * ease;
        const from = Math.max(26, cut || 0);
        if (from >= 26 + len) return;   // 本段已被完全冲过 → 不再绘制
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(ang);
        // 区域填充：沿冲刺方向由淡到浓的纵向渐变（威胁向前缘收束）——黑红色系加深加浓（2026-10-04 用户定稿：更红更明显；
        // 2026-10-04 二次定稿：前缘头部（最前方）再加浓一段红色渐变 + 亮线加宽提亮——头部威胁感更强）
        const grad = ctx.createLinearGradient(26, 0, 26 + len, 0);
        grad.addColorStop(0, 'rgba(120,6,12,0.10)');
        grad.addColorStop(0.6, 'rgba(180,10,20,0.22)');
        grad.addColorStop(0.85, 'rgba(255,36,32,0.42)');
        grad.addColorStop(1, 'rgba(255,46,32,0.62)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = grad;
        ctx.fillRect(from, -bw, 26 + len - from, bw * 2);
        // 双侧约束边线（「带」的轮廓感）
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#b01624';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(from, -bw); ctx.lineTo(26 + len, -bw);
        ctx.moveTo(from, bw); ctx.lineTo(26 + len, bw);
        ctx.stroke();
        // 前缘亮线 + 光晕（推进沿指示）——加宽提亮（2026-10-04 二次定稿：头部更红）
        ctx.globalAlpha = 0.95;
        ctx.shadowColor = '#ff2418';
        ctx.shadowBlur = 24;
        ctx.fillStyle = '#ff3226';
        ctx.fillRect(26 + len - 6, -bw, 6, bw * 2);
        ctx.shadowBlur = 0;
        // 预警线：区域中线静态虚线（恒定透明度、无流动无闪烁，终点随区域前缘不超前；虚线相位锚定整带坐标，擦除时图案不流动）
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#e02838';
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 10]);
        ctx.lineDashOffset = -from;
        ctx.beginPath();
        ctx.moveTo(from, 0);
        ctx.lineTo(26 + len, 0);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      };
      if (e.elPhase === 10) {
        // 预警①展开（本体静驻，无擦除）；展开时长按难度取 fw（与 06-enemy 推进端同一公式——首次冲刺间隔难度加成）
        const fw = c.pierceWarn + (isPoem() ? 0 : isRealme() ? c.realmeFirstWarnAdd : currentDifficulty.id === 'form' ? c.formFirstWarnAdd : c.firstWarnAdd);
        drawPxWarn(Math.min(1, e.elT / fw), e.x, e.y, Math.PI / 2, 0);
      } else if (e.elPhase >= 11 && e.elPhase <= 15) {
        // 预警①：冲①期间保持显示、被本体实时擦除（cut = 冲①已行距离）；冲①出屏后不再绘制
        if (e.elPhase === 11 && s.w1o) drawPxWarn(1, s.w1o.x, s.w1o.y, Math.PI / 2, s.dist);
        // 预警②：冲①出发起显示（展开后保持）；冲②期间被实时擦除；冲②完毕后不再绘制
        if (s.w2 && e.elPhase <= 13) drawPxWarn(Math.min(1, s.warn2T / c.pierceReWarn), s.w2.x, s.w2.y, s.w2.ang, e.elPhase === 13 ? s.dist : 0);
        // 预警③：几何锁定起显示（展开后保持，窗口可早至冲①/②并行期）；冲③期间被实时擦除；冲③出屏重入后不再绘制
        if (s.w3 && e.elPhase <= 15) drawPxWarn(Math.min(1, s.warn3T / c.pierceReWarn), s.w3.x, s.w3.y, s.w3.ang, e.elPhase === 15 ? s.dist : 0);
      }
    }
    // 狞笑朴学峰·冲刺拖尾：暗红→黑渐变锥形残迹（世界层、机体之下；沿冲刺方向反向拉出，
    // 长度随当前冲刺速度平滑生长/收束——elSpd 门控保证冲间间隔与出发瞬间无突现）
    if (e.type === 'puxuefeng' && s && (e.elPhase === 11 || e.elPhase === 13 || e.elPhase === 15) && e.elSpd > 40) {
      const spdK = Math.min(1, e.elSpd / c.pierceSpeed);
      const len = 140 + 190 * spdK;   // 拖尾长度（px）：0→1476 速对应 140→330 平滑生长
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(s.ang);   // 旋转后 +x = 冲刺方向，拖尾向 -x 延伸
      // 外层锥形残迹：近机身暗红 → 中段压暗 → 尾端黑色渐隐
      const grad = ctx.createLinearGradient(0, 0, -len, 0);
      grad.addColorStop(0, 'rgba(196,26,30,0.50)');
      grad.addColorStop(0.45, 'rgba(96,10,14,0.38)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-6, -30);
      ctx.lineTo(-len, 0);
      ctx.lineTo(-6, 30);
      ctx.closePath();
      ctx.fill();
      // 内芯亮暗红细条（增强高速密度感，长度约 70%）
      const grad2 = ctx.createLinearGradient(0, 0, -len * 0.7, 0);
      grad2.addColorStop(0, 'rgba(255,90,70,0.35)');
      grad2.addColorStop(1, 'rgba(40,4,6,0)');
      ctx.fillStyle = grad2;
      ctx.beginPath();
      ctx.moveTo(-6, -10);
      ctx.lineTo(-len * 0.7, 0);
      ctx.lineTo(-6, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // 4F 精英尾焰配色（drawEliteBody 用）：四机统一黑红——焰根主色 → 中段暗色 → 焰尖黑渐透明 +
  // 内芯亮色提亮（均为 r,g,b 通道串）
  const ELITE_FLAME = {
    root: '255, 64, 64',  mid: '178, 24, 32',  core: '255, 140, 130', coreHi: '255, 40, 40',
  };
  // 焰根顶部留白偏移（×edh）：素材机尾距图像顶端的比例——韩希先机尾横梁上缘距图像顶端约 6%
  //（其余三机机体基本贴图像顶端，无偏移）；不加此项尾焰画在立绘矩形顶端、与机尾喷口脱节「飞出去」
  const ELITE_FLAME_ROOT_INSET = { hanxixian: 0.065 };

  // 立绘本体（drawEnemy 缩放段内调用）：素材按碰撞盒适配；素材未加载回退类型色圆角方机体
  function drawEliteBody(e) {
    // 朴学峰冲刺相位（12~15）：屏外冲刺起点等待/启动机段不绘制本体——立绘大于碰撞盒，本体中心
    // 在屏外时旋转/启动的机身会探入屏内露出边缘（用户反馈）；预警区域已指示冲刺走向，本体自屏边飞入
    if (e.type === 'puxuefeng' && e.elPhase >= 12 && e.elPhase <= 15 &&
        (e.x < 0 || e.x > CANVAS_W || e.y < 0 || e.y > CANVAS_H)) return;
    const img = e.type === 'puxuefeng' ? puxuefengImg
      : e.type === 'hanxixian' ? hanxixianImg
      : e.type === 'xiayong' ? xiayongImg
      : xinguodongImg;
    ctx.save();
    if (e.elRot) ctx.rotate(e.elRot);   // 朴学峰冲刺时机头转向移动方向（elRot 由 06-enemy 移动骨架低通推进）
    // 实际绘制高度：立绘等比适配后的 dh（素材未加载回退碰撞盒 e.h）——辛国栋尾焰焰根以此衔接机尾
    //（按碰撞盒取值会悬空：宽适配时立绘 dh < e.h，机尾实际端点更高）
    let edw = e.w * 1.15, edh = e.h;
    if (img && img.complete && img.naturalWidth > 0) {
      let dh = edw * img.naturalHeight / img.naturalWidth;
      if (dh > e.h * 1.35) { dh = e.h * 1.35; edw = dh * img.naturalWidth / img.naturalHeight; }
      edh = dh;
    }
    // 4F 精英专属尾焰（统一黑红，配色见 ELITE_FLAME）：机尾向上喷射——焰体沿轴向平滑渐变（焰根红 →
    // 中段暗红 → 焰尖黑渐透明），长度随 e.elT 高频抖动 ±8%（实体自身相位：gameover 后 update 停 →
    // 冻结不抖，同大狗导弹尾焰处理）；绘制在机体之下（焰根被机身压住），内芯亮红细焰叠加提亮；
    // 朴学峰焰体缩至 75%、韩希先长度 95%（更长）/宽度 75%（2026-10-02）；朴学峰冲刺时随机头方向（elRot 旋转坐标系内）；
    // 图鉴预览（encyPreview）不绘制
    if (!e.encyPreview) {
      const lenScale = e.type === 'puxuefeng' ? 0.75 : e.type === 'hanxixian' ? 0.95 : 1;
      const widScale = (e.type === 'puxuefeng' || e.type === 'hanxixian') ? 0.75 : 1;
      const flick = 1 + 0.08 * Math.sin((e.elT || 0) * 42);
      const L = edh * 0.18 * lenScale * flick, W = e.w * 0.14 * widScale;
      const rootY = -edh / 2 + edh * (ELITE_FLAME_ROOT_INSET[e.type] || 0);   // 焰根：机尾实际端点（含素材留白偏移）
      const grd = ctx.createLinearGradient(0, rootY, 0, rootY - L);
      grd.addColorStop(0, `rgba(${ELITE_FLAME.root}, 0.95)`);
      grd.addColorStop(0.35, `rgba(${ELITE_FLAME.mid}, 0.85)`);
      grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(-W / 2, rootY + 4);
      ctx.quadraticCurveTo(-W * 0.18, rootY - L * 0.55, 0, rootY - L);
      ctx.quadraticCurveTo(W * 0.18, rootY - L * 0.55, W / 2, rootY + 4);
      ctx.closePath();
      ctx.fill();
      const cw = W * 0.4, cl = L * 0.62;
      const cg = ctx.createLinearGradient(0, rootY, 0, rootY - cl);
      cg.addColorStop(0, `rgba(${ELITE_FLAME.core}, 0.9)`);
      cg.addColorStop(1, `rgba(${ELITE_FLAME.coreHi}, 0)`);
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(-cw / 2, rootY + 3);
      ctx.quadraticCurveTo(-cw * 0.15, rootY - cl * 0.6, 0, rootY - cl);
      ctx.quadraticCurveTo(cw * 0.15, rootY - cl * 0.6, cw / 2, rootY + 3);
      ctx.closePath();
      ctx.fill();
    }
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, -edw / 2, -edh / 2, edw, edh);
    } else {
      // 回退：类型色圆角方 + 暗描边（与占位白块区分）
      ctx.fillStyle = e.color;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-e.w / 2, -e.h / 2, e.w, e.h, 10);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 技能特效（drawEnemy 末尾、世界坐标层调用）：全部随技能状态绘制，技能结束自动消失
  function drawEliteFx(e) {
    const c = ELITES[e.type];
    const s = e.elSkill;
    ctx.save();
    // 狞笑朴学峰·残像：半透明残影（朝向随冲刺；上下左右微微闪动 + 透明度忽大忽小——双频 sin 叠加
    // 确定性波动、无随机跳变，afterT=0.7s 后自爆清除）
    if (e.elRemnant) {
      const img = puxuefengImg;
      if (img && img.complete && img.naturalWidth > 0) {
        const rt = e.elRemnant.t;
        // 位置微抖：±3px 内双频交叉（11/9 rad/s 主频 ≈1.7Hz + 低频慢漂），t=0 偏移 0 与出现瞬间连续
        const jx = Math.sin(rt * 11) * 2.2 + Math.sin(rt * 4.3) * 0.8;
        const jy = Math.cos(rt * 9) * 2.2 + Math.sin(rt * 5.1) * 0.8;
        // 残像朝向 = 留影瞬间冲刺朝向（rot = 冲刺角 - π/2，与本体机头一致）；透明度 0.24~0.66 忽大忽小
        ctx.save();
        ctx.translate(e.elRemnant.x + jx, e.elRemnant.y + jy);
        ctx.rotate(e.elRemnant.rot || 0);
        ctx.globalAlpha = 0.45 + 0.15 * Math.sin(rt * 13) + 0.06 * Math.sin(rt * 27);
        const dw = e.w * 1.15, dh = dw * img.naturalHeight / img.naturalWidth;
        // 周身红色边光（2026-10-03 用户定稿）：先以红色 shadowBlur 画一遍立绘——红色辉光沿机体轮廓渗出，
        // 亮度双频闪动（16 rad/s 主频 ≈2.5Hz + 27 rad/s 微颤，与残像透明度闪动同语言）；再叠画本体残影
        ctx.shadowColor = 'rgba(255, 42, 42, 0.9)';
        ctx.shadowBlur = 16 + 7 * Math.sin(rt * 16) + 3 * Math.sin(rt * 27);
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        ctx.shadowBlur = 0;
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }
    if (e.type === 'hanxixian' && s) {
      const eyeY = e.y - e.h * 0.18;
      if (s.kind === 1) {
        // 凝视锁定：追踪期红细线（持续跟随）→ 锁定静止期红细线保持指向（不开火、提亮示意）→
        // 激光期双层粗激光（外辉光 + 白热内芯，方向固定）；时序 0.5s / 0.5s / 0.9s 见 06-enemy advanceEliteSkill
        if (!s.fired) {
          ctx.globalAlpha = (s.locked ? 0.95 : 0.62) + 0.25 * Math.sin(state.time * 18);
          ctx.strokeStyle = '#e83444';   // 提亮红（2026-10-04 二次定稿：预警线略微加粗提亮，原 #c22030）
          ctx.lineWidth = 3.5;   // 预警线增粗（2026-10-02 原 1.4 → 2.5；2026-10-04 二次定稿 → 3.5）
          ctx.shadowColor = '#ff2430'; ctx.shadowBlur = 8;   // 红色辉光提亮（2026-10-04 二次定稿）
          ctx.beginPath();
          ctx.moveTo(e.x, eyeY);
          ctx.lineTo(e.x + Math.cos(s.ang) * 1000, eyeY + Math.sin(s.ang) * 1000);
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else {
          const bp = clamp(s.t / 0.1, 0, 1);
          const fade = clamp(1 - (s.t - c.laserDur + 0.12) / 0.12, 0, 1);
          ctx.globalAlpha = 0.9 * bp * fade;
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#c22030';   // 激光外层黑红（2026-10-03 用户定稿，原橘粉 #ff8069）
          ctx.lineWidth = c.laserHalfW * 2 * bp;
          ctx.shadowColor = '#8a1420'; ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.moveTo(e.x, eyeY);
          ctx.lineTo(e.x + Math.cos(s.ang) * 1100, eyeY + Math.sin(s.ang) * 1100);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#ffd9d4';   // 内芯红调白（原暖白 #fff1e8，随黑红主色同步）
          ctx.lineWidth = c.laserHalfW * 0.7 * bp;
          ctx.beginPath();
          ctx.moveTo(e.x, eyeY);
          ctx.lineTo(e.x + Math.cos(s.ang) * 1100, eyeY + Math.sin(s.ang) * 1100);
          ctx.stroke();
          ctx.lineCap = 'butt';
        }
        ctx.globalAlpha = 1;
      } else {
        // 旋眼火螺：三炮塔光点绕本体公转（公转角/反转由 06-enemy 技能状态推进）——
        // 与旋眼长条弹同款观感（白热主体 → 深红黑头端/边缘 + 红辉光，弹体渐变见本文件长条弹段）：
        // 球心白热 → 暗红 → 边缘黑红径向渐变 + 同款暖白描边（2026-10-03 随弹色同步压暗）
        for (let i = 0; i < c.turretN; i++) {
          const ta = s.ang + i * Math.PI * 2 / c.turretN;
          const tx = e.x + Math.cos(ta) * c.orbitR, ty = e.y + Math.sin(ta) * c.orbitR;
          const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, 5);
          g.addColorStop(0, '#fff3ec');
          g.addColorStop(0.55, '#d85050');
          g.addColorStop(1, '#8a1018');
          ctx.fillStyle = g;
          ctx.shadowColor = '#8a1018'; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(255, 220, 215, 0.9)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    if (e.type === 'xiayong') {
      // 屏障护盾（技能3，2026-10-03 五轮修正）：红色椭圆护罩（更透明）+ 罩面黑色光芒流动
      //（clip 罩体椭圆内 2 道暗黑波带循环下移，仅罩面上可见）；屏障余量 <30% 时闪烁加快提示将破
      if (e.xyBarOn) {
        // 展开动画（2026-10-03 用户定稿）：施放后 0.35s 罩体自 0.35 倍 easeOutCubic 放大到 1 倍，
        // 展开期描边增亮增粗 + 罩体微亮（施放处另有红色冲击环 spawnBlastRing）；重复释放重播
        const grow = e.xyBarBorn != null ? Math.min(1, (state.time - e.xyBarBorn) / 0.35) : 1;
        const gs = 0.35 + 0.65 * (1 - Math.pow(1 - grow, 3));
        const flash = grow < 1 ? 1 - grow : 0;
        const rw = e.w * 0.98 * gs, rh = e.h * 0.92 * gs;
        const lowHp = e.xyBarHp < e.xyBarMax * 0.3;
        const flick = lowHp ? 0.55 + 0.45 * Math.sin(state.time * 18) : 0.85 + 0.15 * Math.sin(state.time * 3);
        ctx.globalAlpha = (0.07 + 0.1 * flash) * flick;
        ctx.fillStyle = '#a11226';
        ctx.beginPath(); ctx.ellipse(e.x, e.y, rw, rh, 0, 0, Math.PI * 2); ctx.fill();
        // 黑色光芒流动——仅出现在屏障护罩面上（2026-10-03 五轮修正：用户澄清黑芒只在屏障上，
        // 全屏波带已删；clip 到罩体椭圆内，2 道暗黑波带沿罩面循环下移，罩外不可见）
        ctx.save();
        ctx.beginPath(); ctx.ellipse(e.x, e.y, rw, rh, 0, 0, Math.PI * 2); ctx.clip();
        const bandH = rh * 0.7, span = rh * 2 + bandH;
        for (let i = 0; i < 2; i++) {
          const cy = e.y - rh - bandH / 2 + ((state.time * 55 + i * span / 2) % span);
          const g = ctx.createLinearGradient(0, cy - bandH / 2, 0, cy + bandH / 2);
          g.addColorStop(0, 'rgba(4, 0, 2, 0)');
          g.addColorStop(0.5, 'rgba(4, 0, 2, 0.5)');
          g.addColorStop(1, 'rgba(4, 0, 2, 0)');
          ctx.globalAlpha = flick;
          ctx.fillStyle = g;
          ctx.fillRect(e.x - rw, cy - bandH / 2, rw * 2, bandH);
        }
        ctx.restore();
        ctx.globalAlpha = Math.min(1, 0.7 * flick + 0.35 * flash);
        ctx.strokeStyle = '#ff2a3c'; ctx.lineWidth = 2.5 + 2.5 * flash;
        ctx.shadowColor = '#ff2030'; ctx.shadowBlur = 12 + 18 * flash;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, rw, rh, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
      // 碎翼回旋刃·预警曲线（施放后 bladeWarn 内）= 预定轨迹（2026-10-03 二轮定稿）：
      // 轨道椭圆虚线 + 本体当前位置→两锚点的迸出线（红，明暗脉动 + 虚线流动）；预警期无双刃
      if (e.elSkill && e.elSkill.kind === 1 && e.elSkill.t < c.bladeWarn && !e.xyBlades) {
        const wp = e.elSkill.t / c.bladeWarn;
        ctx.save();
        ctx.globalAlpha = Math.min(0.9, 0.3 + 0.45 * wp + 0.12 * Math.sin(state.time * 12));
        ctx.strokeStyle = '#ff3a30'; ctx.lineWidth = 2;
        ctx.setLineDash([12, 9]); ctx.lineDashOffset = -state.time * 60;
        ctx.shadowColor = '#ff2020'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.ellipse(e.elSkill.cx, e.elSkill.cy, c.bladeRx, e.elSkill.ry, 0, 0, Math.PI * 2); ctx.stroke();
        for (const a0 of [-Math.PI / 4, Math.PI + Math.PI / 4]) {   // 迸出线：本体 → 轨道锚点
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.elSkill.cx + Math.cos(a0) * c.bladeRx, e.elSkill.cy + Math.sin(a0) * e.elSkill.ry);
          ctx.stroke();
        }
        ctx.setLineDash([]); ctx.shadowBlur = 0;
        ctx.restore();
      }
      // 碎翼回旋刃（kind 1）：黑红月牙刃（黑刃体 + 红辉光 + 白热内芯）+ 暗黑拖尾（trail 由 06-enemy
      // 逐帧采样，渐隐圆点串）；迸出段/绕行段统一显示，湮灭由 06-enemy 推进（迸出暗黑粒子）
      if (e.xyBlades) {
        for (const b of e.xyBlades) {
          if (b.done) continue;
          for (let i = 0; i < b.trail.length; i++) {
            const tp = b.trail[i], k = (i + 1) / b.trail.length;
            ctx.globalAlpha = k * 0.3;
            ctx.fillStyle = '#2a060c';
            ctx.beginPath(); ctx.arc(tp.x, tp.y, 3 + 11 * k, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(b.ang + b.dir * Math.PI / 2);
          ctx.strokeStyle = '#1a0508'; ctx.shadowColor = '#ff2020'; ctx.shadowBlur = 13;
          ctx.lineWidth = 6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(0, 0, 18, -0.9, 0.9); ctx.stroke();
          ctx.strokeStyle = '#e02424'; ctx.lineWidth = 2.4; ctx.shadowBlur = 6;
          ctx.beginPath(); ctx.arc(0, 0, 18, -0.85, 0.85); ctx.stroke();
          ctx.strokeStyle = '#ffd9c8'; ctx.lineWidth = 1.6; ctx.shadowBlur = 2;
          ctx.beginPath(); ctx.arc(0, 0, 18, -0.6, 0.6); ctx.stroke();
          ctx.restore();
        }
      }
      // 核心膨胀能量球 ×3：黑红径向渐变（黑芯 → 暗红 → 透明，红描边；2026-10-03 用户定稿由白红改黑红；
      // 半径由 06-enemy 推进膨胀；爆散后 o.t 达标即不再绘制）
      if (e.xyOrbs) {
        for (const o of e.xyOrbs) {
          if (o.t >= c.orbDur) continue;
          const og = ctx.createRadialGradient(o.x, o.y, 1, o.x, o.y, Math.max(1, o.r));
          og.addColorStop(0, '#20050a');
          og.addColorStop(0.45, '#8a1220');
          og.addColorStop(1, 'rgba(40, 6, 12, 0.05)');
          ctx.fillStyle = og;
          ctx.beginPath(); ctx.arc(o.x, o.y, Math.max(1, o.r), 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(224, 36, 60, 0.55)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }
    // 暴怒辛国栋·地毯轰炸落点预警圈（在场弹 + 击毁残留弹共用绘制，见 drawXgWarnCircles）
    drawXgWarnCircles(e.xgBombs);
    ctx.restore();
  }

  // 暴怒辛国栋·地毯轰炸落点预警圈绘制（drawEliteFx 传在场弹 e.xgBombs / 顶层传击毁残留弹
  // state.xgLooseBombs）：渐进收缩 + 波浪外环（沿圆周 6 波起伏、相位随 b.t 流动）+ 旋转虚线中环
  //（径向流动）；内部红罩填充波浪路径（爆炸结算见 06-enemy advanceEliteMinions / updateXgLooseBombs，
  // 半径诗篇取 poemBombR 与结算同源；预警时长诗篇同值——2026-10-01 取消诗篇预警减少）
  function drawXgWarnCircles(bombs) {
    const c = ELITES.xinguodong;
    const xgR = isPoem() ? c.poemBombR : c.bombR;
    const xgWarn = c.bombWarn;
    if (!bombs || !bombs.length) return;
    for (const b of bombs) {
      const p = clamp(b.t / xgWarn, 0, 1);
      const curR = xgR * (1 - 0.25 * p);
      // 首投强调圈（仅每轮第一枚弹 b.first）：大范围收缩圆圈——从 2.6× 爆炸半径随预警进度线性
      // 收缩到预警圈尺寸、透明度渐隐，双圈叠加提示轰炸起点（转存残留弹保留 first 标记，共用绘制）
      if (b.first) {
        const rr = xgR * (2.6 - 1.6 * p);
        ctx.globalAlpha = 0.12 + 0.5 * (1 - p);
        ctx.strokeStyle = '#c22030';   // 黑红（2026-10-03 用户定稿，原橘红 #ff5533）
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha *= 0.6;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, rr * 0.85, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // 波浪外环路径（填充 + 描边共用）：半径沿圆周 6 波正弦起伏，相位随 b.t 流动
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.001; a += Math.PI / 24) {
        const rr = curR * (1 + 0.055 * Math.sin(a * 6 + b.t * 9));
        const px = b.x + Math.cos(a) * rr, py = b.y + Math.sin(a) * rr;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = '#8c1018';   // 黑红罩体（原橘 #ff8a4c）
      ctx.fill();
      ctx.globalAlpha = 0.55 + 0.15 * Math.sin(state.time * 16);
      ctx.strokeStyle = '#c22030';
      ctx.lineWidth = 2;
      ctx.stroke();
      // 旋转虚线中环：虚线段沿圆周流动（lineDashOffset 随 b.t 推进）
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([9, 13]);
      ctx.lineDashOffset = -b.t * 150;
      ctx.beginPath(); ctx.arc(b.x, b.y, curR * 0.82, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  // 暗紫轨迹残影：两边紫色 + 中心黑色 + 随机星芒闪耀，随 life 渐隐
  function drawTrailGhosts() {
    for (const g of trailGhosts) {
      const a = clamp(g.life / g.max, 0, 1);
      if (a <= 0) continue;
      // 锥形尾迹：源头最宽（平方衰减，锥形明显），越老的残影段越细；同时随 life 渐隐
      const w = 0.1 + 0.9 * a * a;
      if (g.col) {
        // 自定义色拖尾（风暴编织者雷电子弹白蓝短拖尾等）：主色宽线 + 白热内芯
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(${g.col}, ${(0.5 * a).toFixed(3)})`;
        ctx.lineWidth = g.r * 2.4 * w;
        ctx.beginPath();
        ctx.moveTo(g.x1, g.y1);
        ctx.lineTo(g.x2, g.y2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.75 * a).toFixed(3)})`;
        ctx.lineWidth = g.r * 0.9 * w;
        ctx.beginPath();
        ctx.moveTo(g.x1, g.y1);
        ctx.lineTo(g.x2, g.y2);
        ctx.stroke();
        continue;
      }
      // 两边紫色（宽线）
      ctx.strokeStyle = `rgba(109, 40, 217, ${(0.55 * a).toFixed(3)})`;
      ctx.lineWidth = g.r * 3.0 * w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(g.x1, g.y1);
      ctx.lineTo(g.x2, g.y2);
      ctx.stroke();
      // 中心黑色（窄线叠加）
      ctx.strokeStyle = `rgba(12, 6, 24, ${(0.9 * a).toFixed(3)})`;
      ctx.lineWidth = g.r * 1.1 * w;
      ctx.beginPath();
      ctx.moveTo(g.x1, g.y1);
      ctx.lineTo(g.x2, g.y2);
      ctx.stroke();
      // 紫色星芒闪耀（部分线段中点，随时间明灭）
      if (g.spark) {
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(state.time * 9 + g.seed * 7));
        const mx = (g.x1 + g.x2) / 2, my = (g.y1 + g.y2) / 2;
        const s = g.r * 1.8 * tw * (0.4 + 0.6 * a);
        ctx.strokeStyle = `rgba(196, 141, 255, ${(0.9 * tw * a).toFixed(3)})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(mx - s, my); ctx.lineTo(mx + s, my);
        ctx.moveTo(mx, my - s); ctx.lineTo(mx, my + s);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
  }

  // 椭圆风条画笔（暴风之眼风条 = 天秀忧郁王子友方大风暴风弹共用，样式完全一致）：
  // 渐变胶囊底盘 + 上下边缘波动椭圆轮廓 + 内部两条流动正弦流线。
  // 调用方需已完成 translate(b.x,b.y) / rotate(atan2(vy,vx))；整体透明度也由调用方控制
  function paintWindStreakBody(b) {
    const g = ctx.createLinearGradient(-b.len / 2, 0, b.len / 2, 0);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    g.addColorStop(0.5, '#ffffff');
    g.addColorStop(1, b.color);
    ctx.fillStyle = g;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 9;
    // 椭圆风条：整体呈风的波动感——上下边缘沿椭圆轮廓叠加流动正弦波，内部两条流线
    const half = b.len / 2;
    const edgeY = (px, sgn) => {
      const u = clamp(px / half, -1, 1);
      const base = Math.sqrt(Math.max(0, 1 - u * u)) * b.r;                       // 椭圆轮廓
      const wave = Math.sin(u * 7 + state.time * 14 + (sgn > 0 ? 0 : 2.2)) * b.r * 0.24;   // 风的波动（上下相位错开）
      return sgn * (base + wave);
    };
    ctx.beginPath();
    const SEG = 12;
    for (let k = 0; k <= SEG; k++) {
      const px = -half + (k / SEG) * b.len;
      k === 0 ? ctx.moveTo(px, edgeY(px, -1)) : ctx.lineTo(px, edgeY(px, -1));
    }
    for (let k = SEG; k >= 0; k--) {
      const px = -half + (k / SEG) * b.len;
      ctx.lineTo(px, edgeY(px, 1));
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // 内部流线：两条沿长度方向的正弦流线，相位随时间流动（强化“风”的动感）
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1;
    for (const off of [-0.45, 0.45]) {
      ctx.beginPath();
      for (let k = 0; k <= SEG; k++) {
        const px = -half + (k / SEG) * b.len;
        const u = px / half;
        const y = u * b.r * off + Math.sin(u * 5 + state.time * 15 + off * 5) * b.r * 0.28 * Math.sqrt(Math.max(0, 1 - u * u));
        k === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
      }
      ctx.stroke();
    }
  }

  // 飞剑单剑绘制（待发射悬浮 / 飞行弹体共用）：剑身尖锥（冰蓝→白渐变，尾部略短）+ 短小十字护手
  // + 等宽短剑柄；三段填充在连接处精确对接（无重叠无缝隙），暴走（Lv5）剑身不变色，
  // 以**单一连续路径**描出剑身 + 护手 + 剑柄的一体金红流动边框（连接处不出现断开 / 叠亮的边框特效）。
  // 整体透明度 0.7、BOSS 战期间 0.6；拖尾暴走金红且更长。
  // trail 为拖尾长度（px，0 = 无——悬浮待发射的剑不拖尾）；rot 为剑尖朝向（局部 -y 为剑尖，弹速向上时 rot=0）
  function paintFeijianSword(x, y, rot, len, hw, alpha, berserk, trail) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalCompositeOperation = 'lighter';
    const bossFight = state.mode === 'playing' && enemies.some(e => e.type === 'boss');
    ctx.globalAlpha = (bossFight ? 0.6 : 0.7) * clamp(alpha, 0, 1);
    const L = len || 30, h = hw || 2.4;
    const baseY = L * 0.28;            // 剑身基部（尾部略短）
    const gHalf = h * 0.25;            // 护手半厚
    const guardX = h * 1.1;            // 护手半长（短十字）
    const hiltTop = baseY + gHalf;     // 剑柄顶部（护手下缘，精确对接）
    const hiltTopX = h * 0.33;         // 剑柄顶部半宽（与护手下缘对接）
    const hiltLen = h * 2.2;           // 剑柄长（+50%：1.47h → 2.2h）
    const tailY = baseY + hiltLen;     // 剑柄末端
    // 拖尾：自剑柄末端沿飞行反方向延伸的渐隐光带（暴走更长更亮）
    if (trail > 0) {
      const tg = ctx.createLinearGradient(0, tailY, 0, tailY + trail);
      if (berserk) {
        tg.addColorStop(0, 'rgba(255,175,90,0.55)');
        tg.addColorStop(1, 'rgba(255,140,60,0)');
      } else {
        tg.addColorStop(0, 'rgba(150,200,255,0.45)');
        tg.addColorStop(1, 'rgba(120,170,255,0)');
      }
      ctx.strokeStyle = tg;
      ctx.lineWidth = h * 0.9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, tailY);
      ctx.lineTo(0, tailY + trail);
      ctx.stroke();
    }
    ctx.shadowBlur = 5;
    // ---- 三段填充（连接处精确对接）----
    // 剑身：冰蓝→白渐变（暴走不变色）
    const g = ctx.createLinearGradient(0, hiltTop, 0, -L / 2);
    g.addColorStop(0, 'rgba(120,170,255,0.15)');
    g.addColorStop(0.55, 'rgba(160,210,255,0.75)');
    g.addColorStop(1, 'rgba(240,250,255,1)');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(150,200,255,0.9)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -L / 2);
    ctx.lineTo(h, -L * 0.1);
    ctx.lineTo(h * 0.55, baseY - gHalf);
    ctx.lineTo(-h * 0.55, baseY - gHalf);
    ctx.lineTo(-h, -L * 0.1);
    ctx.closePath();
    ctx.fill();
    // 护手：横杆（半透明淡蓝，两态同色——暴走不变色）
    ctx.shadowBlur = 5;
    ctx.fillStyle = 'rgba(150,195,255,0.6)';
    ctx.fillRect(-guardX, baseY - gHalf, guardX * 2, gHalf * 2);
    // 剑柄：自护手下缘延伸的等宽半透明短柄（尾端不再收窄；尾部仅按渐变更淡）
    const hg = ctx.createLinearGradient(0, hiltTop, 0, tailY);
    hg.addColorStop(0, 'rgba(150,195,255,0.6)');
    hg.addColorStop(1, 'rgba(120,170,255,0.22)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(-hiltTopX, hiltTop);
    ctx.lineTo(hiltTopX, hiltTop);
    ctx.lineTo(hiltTopX, tailY);
    ctx.lineTo(-hiltTopX, tailY);
    ctx.closePath();
    ctx.fill();
    // ---- 暴走：单一连续路径的一体金红流动边框（剑身 + 护手 + 剑柄轮廓，连接处无断开 / 叠亮）----
    if (berserk) {
      ctx.strokeStyle = `hsla(${(28 + 14 * Math.sin(state.time * 6.5)).toFixed(1)}, 100%, 62%, ${(0.65 + 0.25 * Math.sin(state.time * 9)).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(255,150,60,0.9)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(0, -L / 2);                       // 剑尖
      ctx.lineTo(h, -L * 0.1);                     // 剑身右缘
      ctx.lineTo(h * 0.55, baseY - gHalf);
      ctx.lineTo(guardX, baseY - gHalf);           // 护手上缘
      ctx.lineTo(guardX, baseY + gHalf);           // 护手右端
      ctx.lineTo(hiltTopX, hiltTop);               // 护手下缘 → 剑柄右缘
      ctx.lineTo(hiltTopX, tailY);                 // 剑柄右缘（等宽）
      ctx.lineTo(-hiltTopX, tailY);                // 柄尾
      ctx.lineTo(-hiltTopX, hiltTop);              // 剑柄左缘
      ctx.lineTo(-guardX, baseY + gHalf);          // 护手下缘
      ctx.lineTo(-guardX, baseY - gHalf);          // 护手左端
      ctx.lineTo(-h * 0.55, baseY - gHalf);        // 护手上缘 → 剑身左缘
      ctx.lineTo(-h, -L * 0.1);
      ctx.closePath();                             // 回到剑尖
      ctx.stroke();
    }
    ctx.restore();
  }

  // 副武器·无界飞剑：单剑自机尾后方飞出（凝聚渐显 + 微微后移下沉）→ 迅速左右分裂渐显、
  // 各剑滑入全屏均分槽位（splitT 内 easeOut 插值）→ 就位等待，按发射序依次射出（转弹体渲染）
  function drawFeijianWaves() {
    for (const w of feijianWaves) {
      const f = w.f;
      const fade = w.dieT != null ? clamp(w.dieT / 0.3, 0, 1) : 1;   // 警报 / BOSS 登场：快速消散渐隐
      if (w.t < f.sinkT) {
        // 段1：单剑凝聚于机尾后方并后移（下沉）
        paintFeijianSword(w.x, w.y, 0, f.len, f.r, clamp(w.t / f.sinkT, 0, 1) * fade, w.berserk, 0);
      } else {
        // 段2：已分裂——各剑自波次中心向各自槽位移动（渐显），就位后等待发射序
        const p = clamp((w.t - f.sinkT) / f.splitT, 0, 1);
        const ease = 1 - Math.pow(1 - p, 3);   // easeOutCubic：迅速滑出、平滑就位
        for (const s of w.swords) {
          if (s.fired) continue;
          paintFeijianSword(w.x + (s.ax - w.x) * ease, w.y, 0, f.len, f.r, p * fade, w.berserk, 0);
        }
      }
    }
  }

  // 副武器·辛国栋之怒：空间系穿透灼烧火环——焦香螺旋桨火环同款结构
  // （辉光 + 三层波形火舌 + 上升火星 + 稳定边界环，见 drawPlayerFireRing 同构实现），
  // 配色为玫红→粉流动渐变（按用户参考图），整体透明度 0.8；
  // 入场较快渐显 0.25s；警报 / BOSS 登场动画期间按 dieT 快速消散（渐隐）
  function drawXinRings() {
    for (const g of xinRings) {
      const fade = g.dieT != null ? clamp(g.dieT / 0.3, 0, 1) : 1;
      const a = 0.8 * clamp(g.t / 0.25, 0, 1) * fade;
      const r = g.r;
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.globalAlpha = a;
      // 玫红辉光（从中心向外淡出的径向渐变）
      const glow = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r);
      glow.addColorStop(0, 'rgba(255, 45, 110, 0.13)');
      glow.addColorStop(0.5, 'rgba(255, 30, 90, 0.08)');
      glow.addColorStop(0.85, 'rgba(230, 20, 80, 0.05)');
      glow.addColorStop(1, 'rgba(230, 20, 80, 0)');
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = glow; ctx.fill();
      // 三层波形火舌（焦香同款：各层不同半径/振幅/速度/相位，玫红→粉流动跳动）
      const tongues = 40;
      const layers = [
        { lr: r * 0.92, amp: 4.0, spd: 2.2, ph: 0,    color: 'rgba(255, 45, 110, 0.55)', lw: 2.4 },
        { lr: r * 0.96, amp: 3.0, spd: -1.6, ph: 1.3, color: 'rgba(255, 105, 160, 0.4)', lw: 1.8 },
        { lr: r * 0.88, amp: 5.0, spd: 3.0, ph: 2.7,  color: 'rgba(255, 175, 205, 0.28)', lw: 1.2 },
      ];
      for (const L of layers) {
        ctx.beginPath();
        for (let k = 0; k <= tongues; k++) {
          const an = (k / tongues) * Math.PI * 2;
          const wave = Math.sin(an * 6 + state.time * L.spd + L.ph) * L.amp
                     + Math.sin(an * 11 - state.time * L.spd * 0.7 + L.ph * 2) * L.amp * 0.5;
          const rr = L.lr + wave;
          if (k === 0) ctx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr);
          else ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
        }
        ctx.closePath();
        ctx.strokeStyle = L.color;
        ctx.lineWidth = L.lw;
        ctx.stroke();
      }
      // 上升火星（12 颗粉白亮点沿光环内随机位置缓慢上飘，循环重置）
      ctx.fillStyle = 'rgba(255, 160, 200, 0.85)';
      for (let k = 0; k < 12; k++) {
        const seed = k * 137.508;   // 黄金角分布
        const sa = (seed % (Math.PI * 2));
        const sr = r * (0.4 + 0.5 * ((seed * 0.618) % 1));
        const rise = ((state.time * 28 + seed * 3) % 50) - 25;   // 循环上升偏移
        const sx = Math.cos(sa) * sr + Math.sin(state.time * 1.2 + k) * 2;
        const sy = Math.sin(sa) * sr - rise;
        const sparkR = 1.0 + Math.sin(state.time * 4 + k * 2) * 0.4;
        if (Math.hypot(sx, sy) < r) {
          ctx.beginPath(); ctx.arc(sx, sy, sparkR, 0, Math.PI * 2); ctx.fill();
        }
      }
      // 稳定边界环（最外层玫红描边，标识光环范围）
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 80, 140, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
  }

  // 奖励道具·辛国栋大怒：固定位置的扩散火环（不移动，半径随时间扩张）。
  // 复用辛国栋之怒同款视觉（玫红→粉流动火舌 + 火星 + 边界环），整体透明度由 state.xinFuryRing.alpha 驱动
  function drawXinFuryRing() {
    const g = state.xinFuryRing;
    if (!g) return;
    const a = 0.85 * g.alpha;
    const r = g.r;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.globalAlpha = a;
    const glow = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r);
    glow.addColorStop(0, 'rgba(255, 45, 110, 0.13)');
    glow.addColorStop(0.5, 'rgba(255, 30, 90, 0.08)');
    glow.addColorStop(0.85, 'rgba(230, 20, 80, 0.05)');
    glow.addColorStop(1, 'rgba(230, 20, 80, 0)');
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = glow; ctx.fill();
    const tongues = 40;
    const layers = [
      { lr: r * 0.92, amp: 4.0, spd: 2.2, ph: 0,    color: 'rgba(255, 45, 110, 0.55)', lw: 2.4 },
      { lr: r * 0.96, amp: 3.0, spd: -1.6, ph: 1.3, color: 'rgba(255, 105, 160, 0.4)', lw: 1.8 },
      { lr: r * 0.88, amp: 5.0, spd: 3.0, ph: 2.7,  color: 'rgba(255, 175, 205, 0.28)', lw: 1.2 },
    ];
    for (const L of layers) {
      ctx.beginPath();
      for (let k = 0; k <= tongues; k++) {
        const an = (k / tongues) * Math.PI * 2;
        const wave = Math.sin(an * 6 + state.time * L.spd + L.ph) * L.amp
                   + Math.sin(an * 11 - state.time * L.spd * 0.7 + L.ph * 2) * L.amp * 0.5;
        const rr = L.lr + wave;
        if (k === 0) ctx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr);
        else ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
      }
      ctx.closePath();
      ctx.strokeStyle = L.color;
      ctx.lineWidth = L.lw;
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 160, 200, 0.85)';
    for (let k = 0; k < 12; k++) {
      const seed = k * 137.508;
      const sa = (seed % (Math.PI * 2));
      const sr = r * (0.4 + 0.5 * ((seed * 0.618) % 1));
      const rise = ((state.time * 28 + seed * 3) % 50) - 25;
      const sx = Math.cos(sa) * sr + Math.sin(state.time * 1.2 + k) * 2;
      const sy = Math.sin(sa) * sr - rise;
      const sparkR = 1.0 + Math.sin(state.time * 4 + k * 2) * 0.4;
      if (Math.hypot(sx, sy) < r) {
        ctx.beginPath(); ctx.arc(sx, sy, sparkR, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 80, 140, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  // 圆角弹体路径（手工 arc 实现，不依赖 roundRect——旧浏览器内核无此 API 会静默回退直角）：
  // 标准圆角矩形：四角各自 90° 圆弧 + 四条直边。此前实现误用"单个半圆 arc"拼形，
  // 圆角 < 半宽时右侧被斜线拉出凸块（非对称）——该 bug 下 0.4/0.65 的观感均失真
  function bulletPath(x, y, w, ph, rad) {
    const rr = Math.min(rad, w / 2, ph / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);                                 // 顶边
    ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);          // 右上角
    ctx.lineTo(x + w, y + ph - rr);                            // 右边
    ctx.arc(x + w - rr, y + ph - rr, rr, 0, Math.PI / 2);      // 右下角
    ctx.lineTo(x + rr, y + ph);                                // 底边
    ctx.arc(x + rr, y + ph - rr, rr, Math.PI / 2, Math.PI);    // 左下角
    ctx.lineTo(x, y + rr);                                     // 左边
    ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);       // 左上角
    ctx.closePath();
  }

  // 敌方长条弹体路径（2026-10-09 用户反馈：弯角幅度增大偏椭圆 + 长边中段外弓——整体更接近椭圆的胶囊形）：
  // 端帽圆弧（调用方传 rad ≈ 0.88×半宽，接近半圆端）+ 上下长边二次曲线中段外弓（幅度 0.22×半宽，端点处归零衔接端帽）。
  // 仅敌方长条弹使用（普通长条 / 黑暗之手暗核导弹）；玩家主炮弹仍用 bulletPath 直边圆角，不受影响
  function eLongBulletPath(x, y, w, ph, rad) {
    const rh = ph / 2;
    const r = Math.min(rad, w / 2, rh);
    const cy = y + rh;
    const x0 = x + r, x1 = x + w - r;                          // 两端帽圆心
    const bow = rh * 0.22, k = bow * 2;                        // 外弓幅度（二次曲线控制点 = 2× 中点弓高）
    const mid = (x0 + x1) / 2;
    ctx.beginPath();
    ctx.moveTo(x0, cy - rh);
    ctx.quadraticCurveTo(mid, cy - rh - k, x1, cy - rh);       // 上长边：中段外弓
    ctx.arc(x1, cy, r, -Math.PI / 2, Math.PI / 2);             // 头端帽（近半圆）
    ctx.quadraticCurveTo(mid, cy + rh + k, x0, cy + rh);       // 下长边：中段外弓
    ctx.arc(x0, cy, r, Math.PI / 2, Math.PI * 1.5);            // 尾端帽
    ctx.closePath();
  }

  function drawBullets() {
    for (const b of pBullets) {
      // 副武器·无界飞剑（飞行弹体）：与待发射悬浮剑同画法（paintFeijianSword，含护手 / 剑柄 / 拖尾），
      // 朝向取弹速方向；暴走拖尾略微增长（26 → 38）；装备陵落时带微弱追踪（转向由 08-entities homing 完成）；
      // 警报 / BOSS 登场动画期间按 dieT 快速消散渐隐
      if (b.sword) {
        const fade = b.dieT != null ? clamp(b.dieT / 0.3, 0, 1) : 1;
        paintFeijianSword(b.x, b.y, Math.atan2(b.vy, b.vx) + Math.PI / 2, b.len, b.r, fade, b.berserk, b.berserk ? 38 : 26);
        continue;
      }
      // 副武器·极夜流光：淡蓝→蓝渐变的粗直射激光（头部蓝最深、尾部渐隐，内芯亮带峰值偏上、不贴头部）；
      // 视觉宽度 ≈ 风暴编织者雷电长条弹 × 1.25（r 5.75 → 宽 11.5）；
      // 外形：头部半圆圆帽、两侧直线、尾部以贝塞尔曲线圆滑收束成尖（宽度与透明度同步收窄，无生硬截断）；
      // 出手时以初始光束长 40 现身，长度以二次缓动（大加速度）长到全长；
      // 暴走（Lv5）内部完全不变（蓝体白芯），仅最外圈边框描边换为金红渐变
      if (b.laserBolt) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.globalCompositeOperation = 'lighter';
        const A = 0.8;   // 激光统一透明度
        const L = b.len || 0;
        if (L > 2) {
          const hw = 5.75;              // 半宽（与判定 r 一致）
          const headC = L / 2 - hw;     // 头部圆帽圆心（圆帽顶点恰在 L/2）
          const tailX = -L / 2;         // 尾尖
          const bodyX = tailX + hw * 2.4;   // 尾锥结束、直线段起点
          // 光束外形路径：尾尖 → 贝塞尔上缘 → 上直线 → 头部半圆 → 下直线 → 贝塞尔下缘 → 闭合
          const beam = () => {
            ctx.beginPath();
            ctx.moveTo(tailX, 0);
            ctx.quadraticCurveTo(tailX + hw * 0.9, -hw * 0.62, bodyX, -hw);
            ctx.lineTo(headC, -hw);
            ctx.arc(headC, 0, hw, -Math.PI / 2, Math.PI / 2);
            ctx.lineTo(bodyX, hw);
            ctx.quadraticCurveTo(tailX + hw * 0.9, hw * 0.62, tailX, 0);
            ctx.closePath();
          };
          const g = ctx.createLinearGradient(tailX, 0, L / 2, 0);   // 本体渐变（两态各自配色：内部与边框同风格）
          if (b.berserk) {
            // 暴走内部：淡淡的渐变金红（微白），头部更亮金红
            g.addColorStop(0, 'rgba(255,210,165,0)');
            g.addColorStop(0.4, 'rgba(255,195,145,0.25)');
            g.addColorStop(0.75, 'rgba(252,155,100,0.42)');
            g.addColorStop(1, 'rgba(255,175,110,0.5)');
          } else {
            // 常态内部：蓝色渐变，头部渐白（不纯白）——与边框同风格
            g.addColorStop(0, 'rgba(140,190,255,0)');
            g.addColorStop(0.4, 'rgba(110,165,250,0.5)');
            g.addColorStop(0.75, 'rgba(75,130,238,0.9)');
            g.addColorStop(1, 'rgba(150,190,252,0.95)');
          }
          ctx.shadowColor = b.berserk ? 'rgba(255,150,60,0.8)' : 'rgba(110,170,255,0.7)';
          ctx.shadowBlur = 12;
          // 边框描边：常态为蓝 → 头端渐白（偏白蓝、不纯白）的描边；暴走仅边框换金红（尾浅金 → 头红），内部蓝体白芯不变
          // （颜色整体调淡：alpha 降低 + 暴走金红提亮）
          beam();
          let edgeG;
          if (b.berserk) {
            edgeG = ctx.createLinearGradient(tailX, 0, L / 2, 0);
            edgeG.addColorStop(0, 'rgba(255,205,140,0)');
            edgeG.addColorStop(0.4, 'rgba(255,185,115,0.5)');
            edgeG.addColorStop(1, 'rgba(255,165,100,0.9)');
          } else {
            edgeG = ctx.createLinearGradient(tailX, 0, L / 2, 0);
            edgeG.addColorStop(0, 'rgba(140,190,255,0)');
            edgeG.addColorStop(0.4, 'rgba(115,170,252,0.55)');
            edgeG.addColorStop(0.75, 'rgba(170,205,253,0.8)');
            edgeG.addColorStop(1, 'rgba(225,240,255,0.9)');
          }
          ctx.strokeStyle = edgeG;
          ctx.lineWidth = b.berserk ? 3 : 2.5;
          ctx.globalAlpha = A * 0.55;
          ctx.stroke();
          // 本体填充（常态蓝头渐白 / 暴走淡金红头更亮）
          beam();
          ctx.fillStyle = g;
          ctx.globalAlpha = A * 0.95;
          ctx.fill();
          // 内芯亮带：已按需求整体移除（观察无白芯效果；恢复时还原三层渐变描线 6/3/1.3px）
        }
        ctx.restore();
        continue;
      }
      // 天秀忧郁王子：友方大风暴风弹——暴风之眼技能6 同款椭圆风条（paintWindStreakBody，与敌方风条绘制完全一致）；
      // 暴风之眼 BOSS 战中敌我风弹样式相同，我方风弹整体压至 bulletAlphaStormFight（0.35）透明度区分
      if (b.princeStorm) {
        const stormFight = enemies.some(e => e.type === 'boss' && e.bossId === 'storm' && !e.dying);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.globalAlpha = stormFight ? PRINCE_STORM.bulletAlphaStormFight : 0.95;
        paintWindStreakBody(b);
        ctx.restore();
        continue;
      }
      if (b.wing || b.sub) {
        // 僚机 / 副武器长条弹幕：沿飞行方向，尾→头渐变；尾焰长度/亮度随 flameMul（0~1）增长，暴走（=1）最强
        //   群星允诺：旋转胶囊体（常规蓝紫尾焰 / 暴走金橙尾焰）；守愿者(oval)：椭圆体（冷色尾焰；暴走弹金红尾焰）；
        //   副武器弹（b.sub，见 01-config SUB_WEAPONS.fire 与 07-player fireSubWeapon）复用同一胶囊体画法
        const ang = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(ang);
        const wg = ctx.createLinearGradient(-b.len / 2, 0, b.len / 2, 0);
        wg.addColorStop(0, b.colorTail);
        wg.addColorStop(b.midAt != null ? b.midAt : 0.5, b.colorMid);   // 中段停靠点可调（缺省 0.5，原行为不变）
        wg.addColorStop(1, b.colorHead);
        const fm0 = b.flameMul != null ? b.flameMul : (b.glow ? 1 : 0);   // 未标 flameMul 的弹沿用 glow 语义（暴走=1 / 常规=0）
        // 出膛渐入：尾焰/辉光随离舱距离展开（前 60px 线性）——避免新射出的弹把金红尾焰扫在僚机盾面与本体上
        const fm = b.sy != null ? fm0 * clamp(Math.hypot(b.x - b.sx, b.y - b.sy) / 60, 0, 1) : fm0;
        ctx.fillStyle = wg;
        ctx.shadowColor = b.colorHead;
        ctx.shadowBlur = 8 + 8 * fm;
        const rr = b.r, hl = b.len / 2;
        if (fm > 0) {
          // 尾焰：弹尾（-x）延伸的渐变火舌，长度与根部亮度随 flameMul 增长（Lv5 暴走 1.0 = 原暴走尾焰）
          //   flameLenMul：仅长度的额外系数（群星允诺 Lv1~4 收短 35%，暴走弹为 1）
          const L = (b.len * 0.85 + 16) * fm * (b.flameLenMul || 1);
          const fa = 0.4 + 0.6 * fm;
          const fg = ctx.createLinearGradient(-hl, 0, -hl - L, 0);
          if (b.oval) {   // 守愿者：冷蓝尾焰（暴走金红弹随配色金红化）
            if (b.berserkFire) {
              fg.addColorStop(0, `rgba(255, 214, 130, ${(0.8 * fa).toFixed(3)})`);
              fg.addColorStop(1, 'rgba(230, 57, 42, 0)');
            } else {
              fg.addColorStop(0, `rgba(190, 230, 255, ${(0.75 * fa).toFixed(3)})`);
              fg.addColorStop(1, 'rgba(60, 150, 255, 0)');
            }
          } else if (b.glow) {   // 群星允诺暴走（Lv5）：金橙尾焰（维持原配色）
            fg.addColorStop(0, `rgba(255, 205, 120, ${(0.7 * fa).toFixed(3)})`);
            fg.addColorStop(1, 'rgba(255, 110, 199, 0)');
          } else {               // 群星允诺常规：浅蓝尾焰（与机体蓝紫星焰同族，非暴走不再走金黄）
            fg.addColorStop(0, `rgba(195, 230, 255, ${(0.7 * fa).toFixed(3)})`);
            fg.addColorStop(1, 'rgba(130, 140, 255, 0)');
          }
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.moveTo(-hl + rr * 0.6, -rr * 0.75);
          ctx.quadraticCurveTo(-hl - L * 0.45, -rr * 0.9, -hl - L, 0);
          ctx.quadraticCurveTo(-hl - L * 0.45, rr * 0.9, -hl + rr * 0.6, rr * 0.75);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = wg;   // 恢复胶囊体填充色
        }
        ctx.beginPath();
        if (b.oval) {
          // 椭圆体（守愿者）：沿飞行方向的椭圆轮廓
          ctx.ellipse(0, 0, hl, rr, 0, 0, Math.PI * 2);
        } else {
          // 旋转胶囊体（群星允诺）
          ctx.moveTo(-hl + rr, -rr);
          ctx.lineTo(hl - rr, -rr);
          ctx.arc(hl - rr, 0, rr, -Math.PI / 2, Math.PI / 2);
          ctx.lineTo(-hl + rr, rr);
          ctx.arc(-hl + rr, 0, rr, Math.PI / 2, -Math.PI / 2);
          ctx.closePath();
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.5 + 0.4 * fm).toFixed(3)})`;
        ctx.lineWidth = 0.8 + 0.6 * fm;
        ctx.stroke();
        ctx.restore();
        continue;
      }
      // 弹体渐变与坐标无关（仅颜色/半径），缓存复用；平移到弹位置后按局部坐标绘制
      // 弹体长度：非暴走 ×1.3（6r → 7.8r）、暴走 ×1.2（6r → 7.2r）；
      // 四角磨平：圆角 0.5×半宽（常规弹约 1.5px 倒角）
      const isBer = !!b.berserk;
      const h = b.r * (isBer ? 7.2 : 7.8);
      const top = b.y - h / 2;   // 弹体中心对准弹位（判定点保持居中）
      ctx.globalAlpha = 1;
      { // 子弹尾焰：金橙火舌 + 暖光晕，长度随发射时武器等级增长（Lv1~5，暴走弹最长）
        // 暴走尾焰：弹体后方（飞行反方向）的金橙渐变火舌 + 外围暖光晕（仅暴走期发射的弹携带）
        const lv = b.lv || (b.berserk ? 5 : 1);
      const L = b.r * (2.6 + lv * 2.1) * (lv >= 5 ? 1 : 0.85);
        const fg = ctx.createLinearGradient(b.x, b.y + b.r, b.x, b.y + b.r + L);
        fg.addColorStop(0, 'rgba(255, 236, 175, 0.85)');   // 根部暖白金
        fg.addColorStop(0.4, 'rgba(255, 172, 84, 0.5)');   // 中段金橙
        fg.addColorStop(1, 'rgba(255, 110, 199, 0)');      // 梢部粉光渐隐（呼应暴走主题色）
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(b.x - b.r * 0.85, b.y + b.r * 0.4);
        ctx.quadraticCurveTo(b.x - b.r * 0.5, b.y + b.r + L * 0.55, b.x, b.y + b.r + L);
        ctx.quadraticCurveTo(b.x + b.r * 0.5, b.y + b.r + L * 0.55, b.x + b.r * 0.85, b.y + b.r * 0.4);
        ctx.closePath();
        ctx.fill();
        const halo = ctx.createRadialGradient(b.x, b.y, b.r * 0.5, b.x, b.y, b.r * 3);
        halo.addColorStop(0, 'rgba(255, 214, 130, 0.38)');
        halo.addColorStop(1, 'rgba(255, 150, 80, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(b.x, top);
      ctx.fillStyle = cachedGrad(`p|${b.color}|${b.r}|n${isBer ? 'b' : ''}`, () => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#ff6ec7');   // 上：粉色
        g.addColorStop(1, b.color);     // 下：本体色
        return g;
      });
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 8;
      bulletPath(-b.r, 0, b.r * 2, h, b.r * 0.5);
      ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';   // 描边
      ctx.lineWidth = 1;
      bulletPath(b.x - b.r, top, b.r * 2, h, b.r * 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const b of eBullets) drawOneEBullet(b);
    ctx.globalAlpha = 1;   // 清除消散期子弹的渐隐透明度
    ctx.shadowBlur = 0;
  }

  // 单发敌方子弹渲染（drawBullets 的 eBullets 循环体原样抽取成函数，热路径逐弹调用）：
  // 图鉴「测试1 · 敌方子弹样式图鉴」经 withPreviewCtx + mock 弹体复用同一份绘制——样式与实机永远一致。
  // fadeT 消散透明度在函数内自管（原循环开头逻辑）；bolt 闪频 / 风条波动等读 state.time 的动效照常生效
  // 长条弹头端增红映射（2026-10-09 用户反馈「最头部更加红」）：家族色 → 更红变体；未登记色原样使用
  const LONG_HEAD_RED = { '#ff4d2e': '#ff2512', '#ff7a45': '#ff4b1c', '#8a1018': '#a80f16' };
  // 弧线弹出生色漂移（2026-10-09 用户定稿）：出生黑紫（取旧日之歌紫弹系 #c9a0ff 同色相压暗 → #3f1464），
  // 随存活时间 1.5s 线性漂移至弧线绿 #a5ffd6
  const ARC_TINT_FROM = [63, 20, 100];
  const ARC_TINT_TO = [165, 255, 214];
  const ARC_TINT_T = 1.5;
  function arcTintColor(age) {
    const t = clamp(age / ARC_TINT_T, 0, 1);
    const c = ARC_TINT_FROM.map((v, i) => Math.round(v + (ARC_TINT_TO[i] - v) * t));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }
  function drawOneEBullet(b) {
      // 消散期子弹（寿命到期的旋转弧线弹）：按剩余消散时间整体渐隐（分支内部 save/restore 会保留该透明度）
      if (b.fadeT != null) ctx.globalAlpha = clamp(b.fadeT / (b.lifeFade || 0.28), 0, 1);
      else ctx.globalAlpha = 1;
      if (b.trail) {
        // 暗紫光芒包裹：弹体外围径向辉光（源头与轨迹衔接处最亮）
        const halo = ctx.createRadialGradient(b.x, b.y, b.r * 0.3, b.x, b.y, b.r * 2.8);
        halo.addColorStop(0, 'rgba(168, 108, 255, 0.55)');
        halo.addColorStop(0.5, 'rgba(109, 40, 217, 0.30)');
        halo.addColorStop(1, 'rgba(109, 40, 217, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (b.bolt) {
        if (b.path && b.path.length > 1) {
          // 折线光束（技能3）：渲染与技能6 电弧光束同款——外辉光 + 蓝体淡白芯 + 锯齿电弧双 pass + 头端热斑；
          // 光束随轨迹从 0 增长，转折处沿折线自然弯折（非整体转向）
          let sd = ((Math.floor(state.time * 12) * 7 + (b.seed || 1) * 131) * 9973 + 479) % 233280;
          const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
          const strokePath = () => {
            ctx.beginPath();
            ctx.moveTo(b.path[0].x, b.path[0].y);
            for (let k = 1; k < b.path.length; k++) ctx.lineTo(b.path[k].x, b.path[k].y);
            ctx.stroke();
          };
          ctx.save();
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          // 外辉光（宽而淡的蓝晕）
          ctx.shadowColor = '#6fb8ff';
          ctx.shadowBlur = 12;
          ctx.strokeStyle = 'rgba(111, 184, 255, 0.4)';
          ctx.lineWidth = b.r * 2.4;
          strokePath();
          ctx.shadowBlur = 0;
          // 蓝体 + 淡白芯（不再纯白，电弧感由锯齿内芯承担）
          ctx.strokeStyle = 'rgba(120, 190, 255, 0.85)';
          ctx.lineWidth = b.r * 1.5;
          strokePath();
          ctx.strokeStyle = '#d8ecff';
          ctx.lineWidth = b.r * 0.8;
          strokePath();
          // 锯齿电弧：各顶点沿法向随机抖动（1/12s 步进换形），蓝辉外弧 + 白热细芯双 pass
          for (const [w2, col] of [[2.2, 'rgba(143, 212, 255, 0.55)'], [1.0, 'rgba(255, 255, 255, 0.9)']]) {
            ctx.strokeStyle = col;
            ctx.lineWidth = w2;
            ctx.beginPath();
            for (let k = 0; k < b.path.length; k++) {
              const px2 = b.path[k].x, py2 = b.path[k].y;
              let nx = 0, ny = 0;
              if (k > 0 && k < b.path.length - 1) {
                const tx2 = b.path[k + 1].x - b.path[k - 1].x, ty2 = b.path[k + 1].y - b.path[k - 1].y;
                const tl = Math.hypot(tx2, ty2) || 1;
                const off = (rnd() - 0.5) * b.r * 1.1;
                nx = -ty2 / tl * off;
                ny = tx2 / tl * off;
              }
              k === 0 ? ctx.moveTo(px2 + nx, py2 + ny) : ctx.lineTo(px2 + nx, py2 + ny);
            }
            ctx.stroke();
          }
          // 头端圆帽热斑（白蓝径向光斑，同技能6 光束头端处理）
          const hg = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r * 1.7);
          hg.addColorStop(0, 'rgba(235, 249, 255, 0.95)');
          hg.addColorStop(0.45, 'rgba(170, 220, 255, 0.5)');
          hg.addColorStop(1, 'rgba(120, 190, 255, 0)');
          ctx.fillStyle = hg;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r * 1.7, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          return;
        }
        // 直线雷电光束弹：粗短胶囊体（蓝辉光）+ 锯齿电弧内芯（1/12s 步进闪频，seed 稳定伪随机）
        const ang = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(ang);
        const half = (b.len || 40) / 2;
        // 外辉光胶囊：尾淡 → 头白蓝（头部不再纯白，电弧感由锯齿内芯承担）
        ctx.shadowColor = '#6fb8ff';
        ctx.shadowBlur = 14;
        const bg = ctx.createLinearGradient(-half, 0, half, 0);
        bg.addColorStop(0, 'rgba(143, 212, 255, 0.20)');
        bg.addColorStop(0.55, '#9fd4ff');
        bg.addColorStop(1, '#e8f5ff');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(-half, 0, b.r, Math.PI / 2, -Math.PI / 2);
        ctx.lineTo(half, -b.r);
        ctx.arc(half, 0, b.r, -Math.PI / 2, Math.PI / 2);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        // 锯齿电弧内芯：蓝晕宽线 + 白热内芯双层描线
        let sd = ((Math.floor(state.time * 12) * 7 + (b.seed || 1) * 131) * 9973 + 479) % 233280;
        const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const [w, col] of [[3, 'rgba(90, 160, 255, 0.8)'], [1.2, 'rgba(255, 255, 255, 0.95)']]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(-half, 0);
          const SEG = 6;
          for (let k = 1; k <= SEG; k++) {
            const px = -half + (k / SEG) * (half * 2);
            const py = (rnd() - 0.5) * b.r * 1.5 * (k === SEG ? 0.3 : 1);
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        ctx.restore();
        return;
      }
      if (b.laser) {
        // 法术大师A1/A2 紫色激光：尾端锢定于 (b.x, b.y)，头端圆形；
        // 横向渐变（垂直于长度方向）：两边炫紫 → 中间白，无边框描边；A2（laserBright）更亮更醒目
        const bright = !!b.laserBright;
        const ang = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);   // 尾端位置
        ctx.rotate(ang);
        const L = b.clipLen != null ? Math.min(b.len, b.clipLen) : b.len, lr = b.r;   // 守愿者白盾截断：只画尾端→盾交点
        ctx.shadowColor = bright ? '#d8b4fe' : '#a855f7';
        ctx.shadowBlur = bright ? 22 : 14;
        // 横向渐变（y 轴垂直于飞行方向）：上边绚紫 → 中心白亮 → 下边绚紫（A2 边缘更浅更亮）
        const lg = ctx.createLinearGradient(0, -lr, 0, lr);
        lg.addColorStop(0, bright ? '#c084fc' : '#a855f7');
        lg.addColorStop(0.28, bright ? '#e9d5ff' : '#c084fc');
        lg.addColorStop(0.5, '#ffffff');
        lg.addColorStop(0.72, bright ? '#e9d5ff' : '#c084fc');
        lg.addColorStop(1, bright ? '#c084fc' : '#a855f7');
        ctx.fillStyle = lg;
        ctx.beginPath();
        // 尾端半圆（左侧）
        ctx.arc(0, 0, lr, Math.PI / 2, -Math.PI / 2);
        // 上边线到头端
        ctx.lineTo(L, -lr);
        // 头端半圆（右侧，圆形处理）
        ctx.arc(L, 0, lr, -Math.PI / 2, Math.PI / 2);
        // 下边线回尾端
        ctx.lineTo(0, lr);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        return;
      }
      if (b.len) {
        // 长条弹：沿飞行方向的渐变圆角长条体（b.oval 时为椭圆体风条——与友方大风暴风弹共用 paintWindStreakBody）；
        // 四角磨平：圆角 0.65×半宽（比玩家主炮弹的 0.5 略圆）；
        // 黑暗之手抛物导弹（dhMissile，2026-10-03 用户定稿）：本体始终竖直朝下不随飞行方向旋转
        //（水平漂移只是位移，不改朝向；普通直落弹 atan2 本就恒为 π/2、视觉不变）
        const ang = b.dhMissile ? Math.PI / 2 : Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(ang);
        if (b.fadeIn > 0 && b.fadeIn0) ctx.globalAlpha *= clamp(1 - b.fadeIn / b.fadeIn0, 0, 1);   // 渐显（技能5 暗影导弹：出现完全透明快速线性渐入，拖尾/弹体统一受控）
        if (b.streak && (b.vx || b.vy)) {
          // 长条弹简化拖尾（同圆弹 streak 口径：速度反向同色渐隐线段，alpha 0.75，弹体压在上面）
          const sg = ctx.createLinearGradient(0, 0, -b.streak, 0);
          sg.addColorStop(0, b.color);
          sg.addColorStop(1, b.color + '00');
          const ga = ctx.globalAlpha;
          ctx.globalAlpha = ga * 0.75;
          ctx.strokeStyle = sg;
          ctx.lineWidth = b.r * 1.1;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-b.streak, 0);
          ctx.stroke();
          ctx.globalAlpha = ga;
        }
        if (b.tart && tartStripImg) {
          // 长条蛋挞弹（黑暗之手登场蛋挞扇，tart_strip 贴图烘焙见 01-config）：贴图长边沿飞行方向
          // 拉伸到 len×2r 铺满判定胶囊；未加载/烘焙失败回退常规渐变长条
          ctx.drawImage(tartStripImg, -b.len / 2, -b.r, b.len, b.r * 2);
          ctx.restore();
          return;
        }
        if (b.dhDark) {
          // 黑暗之手暗核长条弹（技能5 暗影导弹雨，2026-10-02）：黑主体沿弹身铺开、头端一圈 accent 红
          //（观感对齐圆弹 dhDark：暗黑体 + 边缘红圈，小型导弹风；2026-10-03 三轮定稿黑紫弹全面改黑红）
          const g = ctx.createLinearGradient(-b.len / 2, 0, b.len / 2, 0);
          g.addColorStop(0, '#0b0b11');      // 尾端：黑主体
          g.addColorStop(0.55, '#0b0b11');
          g.addColorStop(0.82, '#14141c');   // 黑体向头部过渡
          g.addColorStop(1, b.color);        // 头端：accent 红（导弹头部亮光）
          ctx.fillStyle = g;
          ctx.shadowColor = b.color;
          ctx.shadowBlur = 8;
          eLongBulletPath(-b.len / 2, -b.r, b.len, b.r * 2, b.r * 0.88);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = b.color;         // 红细描边收口
          ctx.lineWidth = 1;
          eLongBulletPath(-b.len / 2, -b.r, b.len, b.r * 2, b.r * 0.88);
          ctx.stroke();
        } else if (b.oval) {
          paintWindStreakBody(b);
        } else {
          // 长条弹渐变：头端红（b.color——炮艇/主力舰 #ff4d2e、旧日之歌 #ff7a45）→ 中段近白 → 尾端略带红光的暖白
          // （半透明收尾柔化入背景，不再像旧版 0.15 透明度那样发黑）；描边同款略带红光的白
          //（2026-10-09 用户反馈：头端经 LONG_HEAD_RED 映射增红；外圈描边统一变红一些）
          const g = ctx.createLinearGradient(-b.len / 2, 0, b.len / 2, 0);
          g.addColorStop(0, 'rgba(255, 231, 219, 0.6)');   // 尾端：略带红光的暖白
          g.addColorStop(0.5, '#fff3ec');                  // 中段：红光白
          g.addColorStop(1, LONG_HEAD_RED[b.color] || b.color);   // 头端：红（增红映射）
          ctx.fillStyle = g;
          ctx.shadowColor = b.color;
          ctx.shadowBlur = 9;
          eLongBulletPath(-b.len / 2, -b.r, b.len, b.r * 2, b.r * 0.88);
          ctx.fill();
          // 包围状增红（2026-10-09 用户反馈：前半段侧边也更红——红色包住头部而非仅沿长度渐变）：
          // 以头端为圆心的径向红光，clip 在弹体路径内——头部整体裹红、向尾部平滑衰减（无接缝）
          eLongBulletPath(-b.len / 2, -b.r, b.len, b.r * 2, b.r * 0.88);
          ctx.save();
          ctx.clip();
          const wrap = ctx.createRadialGradient(b.len / 2, 0, b.r * 0.2, b.len / 2, 0, b.len * 0.65);
          wrap.addColorStop(0, 'rgba(255, 55, 22, 0.5)');
          wrap.addColorStop(1, 'rgba(255, 55, 22, 0)');
          ctx.fillStyle = wrap;
          ctx.fillRect(-b.len / 2, -b.r, b.len, b.r * 2);
          ctx.restore();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(255, 185, 165, 0.92)';   // 描边：带红光的白（2026-10-09 统一变红一些）
          ctx.lineWidth = 1;
          eLongBulletPath(-b.len / 2, -b.r, b.len, b.r * 2, b.r * 0.88);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        // 圆弹：大子弹用径向渐变（白核 → 主色 → 暗边）；低级小怪黄弹改为外圈红+内部黄；其余小子弹平涂
        // 径向渐变以弹心为圆心、与坐标无关 → 平移到弹位置后用缓存渐变绘制
        ctx.save();
        ctx.translate(b.x, b.y);
        if (b.tart && tartImg) {
          // 蛋挞弹（水彩贴图，01-config 烘焙 tartImg）：小蛋挞沿速度方向旋转、直径 ≈ r×3.2；
          // 巨大蛋挞（黑暗之手技能3，tartSpin 相位由 08-entities 推进）判定半径即视觉半径、持续自旋；
          // 出生生长（2026-10-03 用户定稿）：生长期间纯黑剪影 + 暗红辉光（#ff4632，2026-10-03 三轮定稿辉光
          // 紫改红、与黑暗之手黑红弹幕同系），后半段平方渐显真色（黑剪影保持更久、无跳变；剪影/真色均预烘焙，
          // 逐帧零 filter——2026-10-03 性能修复）；未加载/烘焙失败回退常规渐变圆弹；
          // 被依的镰刀斩中（2026-10-04 用户定稿）：颤动期高频抖动（抖幅线性衰减，位置冻结见 08-entities）→
          // 碎裂迸散粒子（08-entities 一次性）→ 迅速渐隐消失
          let shX = 0, shY = 0, tartAlpha = 1;
          if (b.tartHitT != null) {
            if (b.tartHitT < DARKHAND.s3.hitShudderT) {
              const k = 1 - b.tartHitT / DARKHAND.s3.hitShudderT;
              shX = Math.sin(b.tartHitT * 90) * 3 * k;
              shY = Math.cos(b.tartHitT * 74) * 3 * k;
            } else {
              tartAlpha = clamp(1 - (b.tartHitT - DARKHAND.s3.hitShudderT) / DARKHAND.s3.hitFadeT, 0, 1);
            }
          }
          ctx.translate(shX, shY);
          ctx.globalAlpha = tartAlpha;
          ctx.rotate(b.tartSpin != null ? b.tartSpin : Math.atan2(b.vy, b.vx) + Math.PI / 2);
          const gp = b.tartGrowDur ? clamp((b.tartGrow || 0) / b.tartGrowDur, 0, 1) : 1;
          const d = b.tartSpin != null ? b.r * 2 : b.r * 3.2;
          if (gp < 1) {
            // 生长期：黑剪影（带暗红辉光）打底 + 真色 gp² alpha 叠加，替代逐帧 ctx.filter
            //（数学等价 brightness(gp²)，2026-10-03 性能修复）；剪影烘焙失败回退真色直接渐显
            const dark = ensureTartDark();
            if (dark) {
              ctx.shadowColor = '#ff4632';
              ctx.shadowBlur = 16 * (1 - gp);
              ctx.drawImage(dark, -d / 2, -d / 2, d, d);
              ctx.shadowBlur = 0;
              ctx.globalAlpha = gp * gp * tartAlpha;
              ctx.drawImage(tartImg, -d / 2, -d / 2, d, d);
              ctx.globalAlpha = tartAlpha;
              ctx.restore();
              return;
            }
          }
          ctx.drawImage(tartImg, -d / 2, -d / 2, d, d);
          ctx.restore();
          return;
        }
        if (b.streak && (b.vx || b.vy)) {
          // 大子弹简化拖尾（streak：沿速度反向的同色渐隐圆帽线段，长度 ≈1.5× 直径，
          // 值见 05-boss 大子弹散射两处赋值点；过短会被弹体辉光完全盖住）
          ctx.shadowBlur = 0;
          const sp = Math.hypot(b.vx, b.vy) || 1;
          const tx = -b.vx / sp * b.streak, ty = -b.vy / sp * b.streak;
          const sg = ctx.createLinearGradient(0, 0, tx, ty);
          sg.addColorStop(0, b.color);
          sg.addColorStop(1, b.color + '00');
          const ga = ctx.globalAlpha;
          ctx.globalAlpha = ga * 0.75;   // 拖尾亮度（叠加消散期 alpha），弹体压在上面
          ctx.strokeStyle = sg;
          ctx.lineWidth = b.r * 1.1;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.globalAlpha = ga;
        }
        if (b.dhDark) {
          // 黑暗之手暗核弹（2026-10-01 用户定稿）：黑色主体、边缘一小圈红（accent = b.color；2026-10-03 三轮定稿黑紫改黑红）径向渐变
          ctx.fillStyle = cachedGrad(`dhdark|${b.color}|${b.r}`, () => {
            const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r);
            bg.addColorStop(0, '#43434e');      // 微亮暗芯（保留体积感）
            bg.addColorStop(0.45, '#0b0b11');   // 黑主体
            bg.addColorStop(0.82, '#14141c');   // 黑体向边缘过渡
            bg.addColorStop(1, b.color);        // 边缘红一小圈
            return bg;
          });
          ctx.shadowColor = b.color;
        } else if (b.bossRound) {
          // BOSS 圆形弹幕（真我·旧日之歌技能4 扇形弹）：白核 → 主色径向渐变，
          // 与长条弹的"白热中段 → 主色头端"同色系，避免平涂主色 + 红辉光造成的偏红观感
          ctx.fillStyle = cachedGrad(`bround|${b.color}|${b.r}`, () => {
            const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r);
            bg.addColorStop(0, '#ffffff');
            bg.addColorStop(0.45, '#ffffff');
            bg.addColorStop(1, b.color);
            return bg;
          });
          ctx.shadowColor = b.color;
        } else if (b.r >= 10) {
          ctx.fillStyle = cachedGrad(`big|${b.color}|${b.r}`, () => {
            const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r);
            bg.addColorStop(0, '#ffffff');
            bg.addColorStop(0.42, b.color);
            bg.addColorStop(0.8, 'rgba(205, 50, 0, 0.92)');   // 内圈红区加宽（2026-10-09 用户反馈：红色部分略微更宽）
            bg.addColorStop(1, 'rgba(180, 40, 0, 0.9)');
            return bg;
          });
          ctx.shadowColor = b.color;
        } else if (b.grad === 'hr') {
          // 黑红渐变弹（夏勇核心膨胀分裂弹，2026-10-03 用户定稿由白红改黑红）：黑芯 → 暗红 → 亮红边径向渐变
          ctx.fillStyle = cachedGrad(`gradHR|${b.color}|${b.r}`, () => {
            const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r);
            bg.addColorStop(0, '#1c0408');
            bg.addColorStop(0.45, '#701018');
            bg.addColorStop(1, 'rgba(224, 36, 36, 0.95)');
            return bg;
          });
          ctx.shadowColor = b.color;
        } else if (b.grad === 'yr') {
          // 黄红渐变弹（战争幽灵技能3 弹幕，2026-10-02 用户定稿）：白核 → 黄(#ffd24a) → 红边径向渐变
          //（2026-10-09 用户反馈：外圈更红）
          ctx.fillStyle = cachedGrad(`gradYR|${b.color}|${b.r}`, () => {
            const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r);
            bg.addColorStop(0, '#ffffff');
            bg.addColorStop(0.4, b.color);
            bg.addColorStop(1, 'rgba(198, 20, 8, 0.96)');
            return bg;
          });
          ctx.shadowColor = b.color;
        } else if (b.grad) {
          // 渐变圆弹（橙焰巨型弹分裂子弹等）：白核 → 主色 → 暗橙红边径向渐变（非平涂）
          ctx.fillStyle = cachedGrad(`grad|${b.color}|${b.r}`, () => {
            const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r);
            bg.addColorStop(0, '#ffffff');
            bg.addColorStop(0.4, b.color);
            bg.addColorStop(1, 'rgba(205, 60, 10, 0.92)');
            return bg;
          });
          ctx.shadowColor = b.color;
        } else if (b.color === '#ffd166') {
          // 低级小怪（1/2类）圆弹：外圈红 + 内部黄，更醒目
          ctx.fillStyle = cachedGrad(`d166|${b.r}`, () => {
            const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r);
            bg.addColorStop(0, '#fff6b0');      // 中心亮黄
            bg.addColorStop(0.5, '#ffd166');    // 黄
            bg.addColorStop(0.78, '#ff5a3c');   // 橙红过渡
            bg.addColorStop(1, '#e01b1b');      // 外圈红
            return bg;
          });
          ctx.shadowColor = '#ff3b30';        // 红色辉光，增强辨识度
        } else if (b.arcTint) {
          // 旧日之歌旋转弧线弹（2026-10-09 用户定稿）：出生深紫，随存活时间 1.5s 漂移至弧线绿（见 arcTintColor）
          const col = arcTintColor(b.age || 0);
          ctx.fillStyle = col;
          ctx.shadowColor = col;
        } else {
          ctx.fillStyle = b.color;
          ctx.shadowColor = b.color;
        }
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, b.r, 0, Math.PI * 2);
        ctx.fill();
        if (b.r >= 10) {
          // 大子弹外圈发光描边
          ctx.strokeStyle = 'rgba(255, 200, 160, 0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, b.r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
  }

  // 碎盾特效（群星之杀斩碎虚化护盾）：白热闪核 + 三角碎片自机体中心加速迸射（带自旋）
  // hue 'red' = 夏勇赤色屏障破盾变体（2026-10-03 用户定稿）：配色换红系，结构/运动完全一致
  function drawPhaseFx() {
    for (const f of phaseFx) {
      const p = 1 - f.t / f.max;
      const a = 1 - p;
      const age = f.max - f.t;   // 特效已播时长（供位移/自旋积分）
      const red = f.hue === 'red';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // 起始白热闪核（前 40% 快速衰减）
      if (p < 0.4) {
        const q = p / 0.4;
        const fr = f.r * (1.4 + 1.1 * q);
        const cg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, fr);
        if (red) {
          cg.addColorStop(0, `rgba(255, 240, 236, ${(0.95 * (1 - q)).toFixed(3)})`);
          cg.addColorStop(0.5, `rgba(255, 130, 110, ${(0.55 * (1 - q)).toFixed(3)})`);
          cg.addColorStop(1, 'rgba(255, 90, 70, 0)');
        } else {
          cg.addColorStop(0, `rgba(240, 250, 255, ${(0.95 * (1 - q)).toFixed(3)})`);
          cg.addColorStop(0.5, `rgba(170, 220, 255, ${(0.55 * (1 - q)).toFixed(3)})`);
          cg.addColorStop(1, 'rgba(140, 200, 255, 0)');
        }
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(f.x, f.y, fr, 0, Math.PI * 2); ctx.fill();
      }
      // 三角碎片：v0·age + ½·acc·age² 加速外飞，尖端朝外、随机方向自旋
      //（red 变体 2026-10-03 五轮加深：暗红主体贴合屏障深红色系，避免亮粉与罩体脱节）
      const tl = 4 + f.r * 0.22, tw = 1.8 + f.r * 0.09;   // 碎片长 / 半宽（随目标体型）
      ctx.fillStyle = red ? 'rgba(158, 16, 26, 0.72)' : 'rgba(210, 238, 255, 0.6)';
      ctx.strokeStyle = red ? 'rgba(224, 52, 48, 0.7)' : 'rgba(240, 250, 255, 0.72)';
      ctx.shadowColor = red ? 'rgba(140, 8, 16, 1)' : 'rgba(140, 205, 255, 1)';
      ctx.shadowBlur = 8 * a;
      ctx.lineWidth = Math.max(0.6, 1.4 * a);
      for (const s of f.shards) {
        const dist = s.v0 * age + 0.5 * s.acc * age * age;
        const sx = f.x + Math.cos(s.a) * dist, sy = f.y + Math.sin(s.a) * dist;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(s.a + s.w * age);
        ctx.globalAlpha = a * 0.82;
        ctx.beginPath();
        ctx.moveTo(tl, 0);
        ctx.lineTo(-tl * 0.45, tw);
        ctx.lineTo(-tl * 0.45, -tw);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const t = 1 - p.age / p.life;
      ctx.globalAlpha = clamp(t, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // 群星守望消弹特效（低图层——位于各子弹之下，刻意很淡）：
  // 淡黄微光粒沿"机体核心 → 被消子弹"连线铺开 + 原位迸散的小光粒，随寿命渐隐
  function drawWatchClearFx() {
    for (const p of watchClearFx) {
      const t = 1 - p.age / p.life;
      ctx.globalAlpha = clamp(t, 0, 1) * 0.55;   // 整体压暗：微微特效
      ctx.fillStyle = '#ffe9a8';
      ctx.shadowColor = '#ffe9a8';
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // ---------- 掉落道具形象（矢量图标版）----------
  // kit=粉色徽章·双箭头 / berserk=透明徽章·红橙流动渐变边框+大"S" / shield=青色六边护徽·◇ / hp=绿色圆徽·医疗十字 / bomb=橙色圆球·引信火花
  // 共通：呼吸扩散光环 + 个体相位（按位置区分，免加字段）；道具本体静止不晃
  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function powerupColors(kind) {
    switch (kind) {
      case 'berserk': return { base: '#ff4d1a', hi: '#ff9a3d', dark: '#d41d0f', glow: '#ff4d1a' };
      case 'shield':  return { base: '#6fe3ff', hi: '#d6f7ff', dark: '#2bb5dd', glow: '#6fe3ff' };
      case 'crystalShield': return { base: '#f7a8c6', hi: '#ffd9e8', dark: '#d4709d', glow: '#ff9cc4' };   // 结晶护盾：澜心粉晶系
      case 'hp':      return { base: '#66e39a', hi: '#d2ffe6', dark: '#2ea86a', glow: '#66e39a' };
      case 'bomb':    return { base: '#ffb545', hi: '#ffe3ad', dark: '#e07800', glow: '#ff9a2e' };
      default:        return { base: '#ff5ea8', hi: '#ffc0dd', dark: '#e0256f', glow: '#ff5ea8' };   // kit
    }
  }

  function drawPowerups() {
    for (const p of powerups) {
      const t = state.time;
      const ph = p.x * 0.07 + p.y * 0.11;
      const col = powerupColors(p.kind);
      const isBerserk = p.kind === 'berserk';
      ctx.save();
      ctx.translate(p.x, p.y);   // 本体静止：不做浮沉/摆动

      // ① 呼吸扩散光环：每 1.4s 一圈自 r+2 扩至 r+10 淡出
      const rp = (t * 0.7 + ph * 0.31) % 1;
      ctx.strokeStyle = col.glow;
      ctx.globalAlpha = (1 - rp) * (isBerserk ? 0.5 : 0.32);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 2 + rp * 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.shadowColor = col.glow;
      ctx.shadowBlur = isBerserk ? 14 + Math.sin(t * 10) * 6 : 11;

      if (p.kind === 'kit') {
        // 升级套件：粉色圆角徽章 + 白色双上箭头
        const g = ctx.createLinearGradient(0, -p.r, 0, p.r);
        g.addColorStop(0, col.hi);
        g.addColorStop(0.55, col.base);
        g.addColorStop(1, col.dark);
        ctx.fillStyle = g;
        roundRectPath(ctx, -p.r, -p.r, p.r * 2, p.r * 2, p.r * 0.38);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        roundRectPath(ctx, -p.r + 1.5, -p.r + 1.5, p.r * 2 - 3, p.r * 2 - 3, p.r * 0.3);
        ctx.stroke();
        // 双箭头（上小下大，向上的动势）
        ctx.strokeStyle = '#ffffff';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = p.r * 0.26;
        for (let i = 0; i < 2; i++) {
          const cy = i === 0 ? -p.r * 0.34 : p.r * 0.26;
          const w = i === 0 ? p.r * 0.4 : p.r * 0.52;
          ctx.beginPath();
          ctx.moveTo(-w, cy + p.r * 0.26);
          ctx.lineTo(0, cy - p.r * 0.26);
          ctx.lineTo(w, cy + p.r * 0.26);
          ctx.stroke();
        }
      } else if (isBerserk) {
        // 暴走：透明圆角徽章——红橙流动渐变细边框 + 同色大 "S"（内部透明、本体静止）
        const ang = t * 0.6 + ph;
        const L = p.r * 1.6;
        const g = ctx.createLinearGradient(-Math.cos(ang) * L, -Math.sin(ang) * L, Math.cos(ang) * L, Math.sin(ang) * L);
        g.addColorStop(0, '#ff3b2d');
        g.addColorStop(0.5, '#ff7a1a');
        g.addColorStop(1, '#ffb340');
        // 边框：同款流动渐变细描边，颜色更淡（半透明）
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#ff4d1a';
        ctx.shadowBlur = 8;
        roundRectPath(ctx, -p.r, -p.r, p.r * 2, p.r * 2, p.r * 0.38);
        ctx.stroke();
        ctx.globalAlpha = 1;
        // 大 "S"：同款流动渐变填充，按实际字形包围盒精确居中
        ctx.fillStyle = g;
        ctx.font = `bold ${Math.round(p.r * 1.5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const m = ctx.measureText('S');
        const dx = (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2;
        const dy = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
        ctx.fillText('S', dx, dy);
      } else if (p.kind === 'shield') {
        // 量子护盾：青色六边护徽 + 白色◇核心 + 旋转虚线环（科技感）
        const g = ctx.createLinearGradient(0, -p.r * 1.15, 0, p.r * 1.15);
        g.addColorStop(0, col.hi);
        g.addColorStop(0.55, col.base);
        g.addColorStop(1, col.dark);
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = Math.PI / 3 * i - Math.PI / 2;
          const px = Math.cos(ang) * p.r * 1.15, py = Math.sin(ang) * p.r * 1.15;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        const d = p.r * 0.48;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, -d);
        ctx.lineTo(d * 0.7, 0);
        ctx.lineTo(0, d);
        ctx.lineTo(-d * 0.7, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(111,227,255,0.6)';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 5]);
        ctx.lineDashOffset = -t * 22;
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (p.kind === 'crystalShield') {
        // 结晶护盾（2026-10-09 用户定稿 图鉴测试2 候选 C3「六边护晶」）：六边护徽（量子护盾同构、
        // 澜心粉晶配色——扫一眼即知护盾类道具、粉色 = 结晶变体）+ 白◇芯 + 旋转虚线环（科技感语言延续）
        const R = p.r * 1.15;
        const g = ctx.createLinearGradient(0, -R * 1.15, 0, R * 1.15);
        g.addColorStop(0, col.hi);
        g.addColorStop(0.55, col.base);
        g.addColorStop(1, col.dark);
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = Math.PI / 3 * i - Math.PI / 2;
          const px = Math.cos(ang) * R, py = Math.sin(ang) * R;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        const d = R * 0.5;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, -d);
        ctx.lineTo(d * 0.7, 0);
        ctx.lineTo(0, d);
        ctx.lineTo(-d * 0.7, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 156, 196, 0.7)';
        ctx.lineWidth = R * 0.07;
        ctx.setLineDash([R * 0.22, R * 0.26]);
        ctx.lineDashOffset = -state.time * R * 0.9;
        ctx.beginPath();
        ctx.arc(0, 0, R * 1.32, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (p.kind === 'hp') {
        // 加血：绿色光泽圆徽 + 白色医疗十字
        const g = ctx.createRadialGradient(-p.r * 0.35, -p.r * 0.35, p.r * 0.2, 0, 0, p.r * 1.1);
        g.addColorStop(0, col.hi);
        g.addColorStop(0.6, col.base);
        g.addColorStop(1, col.dark);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 1.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 0.86, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        const cw = p.r * 0.34, cl = p.r * 0.62;
        roundRectPath(ctx, -cw / 2, -cl, cw, cl * 2, cw * 0.4);
        ctx.fill();
        roundRectPath(ctx, -cl, -cw / 2, cl * 2, cw, cw * 0.4);
        ctx.fill();
      } else {
        // 高能爆弹：橙色圆角徽章 + 白色描边 + 中央大 "B"（与套件/暴走徽章同风格，去掉旧炸弹造型）
        const g = ctx.createLinearGradient(0, -p.r, 0, p.r);
        g.addColorStop(0, col.hi);
        g.addColorStop(0.55, col.base);
        g.addColorStop(1, col.dark);
        ctx.fillStyle = g;
        roundRectPath(ctx, -p.r, -p.r, p.r * 2, p.r * 2, p.r * 0.38);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        roundRectPath(ctx, -p.r + 1.5, -p.r + 1.5, p.r * 2 - 3, p.r * 2 - 3, p.r * 0.3);
        ctx.stroke();
        // 大 "B"：白色，按实际字形包围盒精确居中，带轻微呼吸缩放
        const pulse = 1 + Math.sin(t * 4 + ph) * 0.05;
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(p.r * 1.45 * pulse)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const m = ctx.measureText('B');
        const dx = (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2;
        const dy = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
        ctx.fillText('B', dx, dy);
      }

      ctx.restore();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // 掉落水晶绘制（水晶系统改版）：每颗按档位 / 颜色取 3D 烘焙精灵逐帧 1:1 贴图，
  // 呼吸缩放保留（轻微），自转 1s/圈、24 帧步进（c.t 为 4×dt 计时 → c.t/16 = 转相进度）
  // 巨型（原石）：烘焙帧为静态，运行时在贴图【下方】垫一层环形脉动光晕（alpha 随全局时间双频波动）——
  // 环形渐变内圈透明（不盖晶体本体，脉动只在晶体周围），光晕先画、贴图后画
  function drawCrystals() {
    for (const c of crystals) {
      const spr = getCrystal3DSprite(c.tier, c.colorKey, (c.t / 4 + (c.phase || 0)) % 1);   // c.t = 4×dt → 1s/圈，24 帧步进
      const s = 1 + Math.sin(c.t) * 0.1;
      const w = spr.width * s;
      if (c.tier === 'giant') {
        const twk = Math.sin(state.time * 5.2 + (c.phase || 0) * 6.283) * 0.5 + Math.sin(state.time * 9.1 + (c.phase || 0) * 6.283) * 0.5;
        const ar = w * 0.85;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.2 + twk * 0.1;   // ≈0.1~0.3 波动（与 09 crystal3DStarDraw 底光闪动同频口径）
        const gr2 = ctx.createRadialGradient(c.x, c.y, w * 0.3, c.x, c.y, ar);
        gr2.addColorStop(0, 'rgba(255,225,242,0)');      // 内圈透明：光效不压在晶体上
        gr2.addColorStop(0.55, 'rgba(255,215,240,0.5)'); // 环带峰值（贴着晶体外缘）
        gr2.addColorStop(1, 'rgba(120,160,255,0)');
        ctx.fillStyle = gr2;
        ctx.fillRect(c.x - ar, c.y - ar, ar * 2, ar * 2);
        ctx.restore();
      }
      ctx.drawImage(spr, c.x - w / 2, c.y - w / 2, w, w);
    }
  }

  // 测试模式（图鉴挑战·敌人测试）顶部血条：仅当场上恰好 1 个测试目标时显示（多目标时渐隐），
  // 出现/消失各 0.15s 渐显渐隐；白色残量为受击追踪余像（同 BOSS 血条 hpTrail 实现）。
  // 测试目标按 challenge 目标（类型 + 变体 + 行为）匹配：法术阵列召唤的法术矩阵等衍生体不计入，
  // 避免召唤后误判"多目标"导致大血条消失。标题显示当前测试目标的图鉴名称。
  // BOSS 测试不画此条（BOSS 在 drawBoss 中已有专属顶部血条）
  let cbLastT = null, cbAlpha = 0, cbTrail = null, cbRef = null;
  function drawChallengeBar() {
    // 匹配规则同 04-spawn challengeTargets（类型 + 变体 + 行为，召唤物不计）；此处不引 04-spawn（避免 10-draw → 04-spawn 模块环）。
    // 仅敌人测试（kind 'enemy'）显示；波次测试（kind 'wave'）无顶部血条（targets 恒空 → 渐隐不绘制）
    const ch = state.challenge;
    const targets = (ch && ch.kind === 'enemy') ? enemies.filter(e =>
      e.type === ch.type &&
      (ch.variant == null || e.variant === ch.variant) &&
      (ch.behavior == null || e.behavior === ch.behavior)) : [];
    const active = targets.length === 1;
    const now = state.time;
    const dt = cbLastT == null ? 0 : Math.max(0, Math.min(0.1, now - cbLastT));
    cbLastT = now;
    cbAlpha = clamp(cbAlpha + (active ? dt : -dt) / 0.15, 0, 1);
    if (cbAlpha <= 0.01) { cbTrail = null; cbRef = null; return; }
    const e = targets[0];
    if (!e) return;
    if (e !== cbRef) { cbRef = e; cbTrail = e.hp; }   // 目标更替（被击杀后重生/按 = 召唤）：残量重置
    cbTrail += (e.hp - cbTrail) * Math.min(1, dt * 2.2);
    const w = 300, h = 9, x = (CANVAS_W - w) / 2, y = 10;
    const hpR = clamp(e.hp / e.maxHp, 0, 1);
    const trailR = clamp(cbTrail / e.maxHp, 0, 1);
    ctx.save();
    ctx.globalAlpha = cbAlpha;
    // 圆角胶囊形血条：底板 / 底槽 / 余像 / 血量 / 描边全部走圆角路径（两头平滑）；分段宽度极窄时收缩半径防 arcTo 走样
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    roundRectPath(ctx, x - 4, y - 4, w + 8, h + 8, 6.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    roundRectPath(ctx, x, y, w, h, h / 2);
    ctx.fill();
    if (trailR > hpR) {
      ctx.fillStyle = '#ffffff';
      roundRectPath(ctx, x + w * hpR, y, w * (trailR - hpR), h, Math.max(1, Math.min(h / 2, w * (trailR - hpR) / 2)));
      ctx.fill();
    }
    ctx.fillStyle = '#ff9500';
    roundRectPath(ctx, x, y, w * hpR, h, Math.max(1, Math.min(h / 2, w * hpR / 2)));
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, x - 0.5, y - 0.5, w + 1, h + 1, h / 2 + 0.5);
    ctx.stroke();
    ctx.fillStyle = '#eaf2ff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((ch && ch.name) ? ch.name + ' ' + Math.ceil(e.hp) + ' / ' + e.maxHp
                                 : '测试目标 ' + Math.ceil(e.hp) + ' / ' + e.maxHp, CANVAS_W / 2, y + h + 12);
    ctx.restore();
  }

  // 炽心：自身火环——焦香螺旋桨同款（三层波形火舌 + 暖光辉光 + 上升火星 + 边界环），整体减淡（约 45%）。
  // 绘制于低图层（实体与子弹之下，见 render 调用位），不遮挡我方 / 敌方子弹与任何单位；
  // 主菜单攻击演示（state.demo）同样绘制，随演示屏裁剪呈现"屏幕"边框感
  function drawPlayerFireRing() {
    if (currentArmor.id !== 'chixin' || !player.alive || (state.mode !== 'playing' && !state.demo)) return;
    const ar = currentArmor.burnR || 100;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.globalAlpha *= 0.45;   // 整体减淡（焦香本体的火环更浓）

    // 暖光辉光（从中心向外淡出的径向渐变）
    const glow = ctx.createRadialGradient(0, 0, ar * 0.15, 0, 0, ar);
    glow.addColorStop(0, 'rgba(255, 100, 20, 0.10)');
    glow.addColorStop(0.5, 'rgba(255, 60, 10, 0.07)');
    glow.addColorStop(0.85, 'rgba(255, 40, 0, 0.04)');
    glow.addColorStop(1, 'rgba(255, 30, 0, 0)');
    ctx.beginPath(); ctx.arc(0, 0, ar, 0, Math.PI * 2);
    ctx.fillStyle = glow; ctx.fill();

    // 三层波形火舌（各层不同半径/振幅/速度/相位，产生火焰跳动感）
    const tongues = 40;
    const layers = [
      { lr: ar * 0.92, amp: 4.0, spd: 2.2, ph: 0,    color: 'rgba(255, 60, 10, 0.42)', lw: 2.4 },
      { lr: ar * 0.96, amp: 3.0, spd: -1.6, ph: 1.3, color: 'rgba(255, 140, 30, 0.32)', lw: 1.8 },
      { lr: ar * 0.88, amp: 5.0, spd: 3.0, ph: 2.7,  color: 'rgba(255, 200, 60, 0.20)', lw: 1.2 },
    ];
    for (const L of layers) {
      ctx.beginPath();
      for (let k = 0; k <= tongues; k++) {
        const a = (k / tongues) * Math.PI * 2;
        const wave = Math.sin(a * 6 + state.time * L.spd + L.ph) * L.amp
                   + Math.sin(a * 11 - state.time * L.spd * 0.7 + L.ph * 2) * L.amp * 0.5;
        const r = L.lr + wave;
        if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.strokeStyle = L.color;
      ctx.lineWidth = L.lw;
      ctx.stroke();
    }

    // 上升火星（12 颗小亮点沿光环内随机位置缓慢上飘，循环重置）
    ctx.fillStyle = 'rgba(255, 220, 80, 0.7)';
    for (let k = 0; k < 12; k++) {
      const seed = k * 137.508;   // 黄金角分布
      const sa = (seed % (Math.PI * 2));
      const sr = ar * (0.4 + 0.5 * ((seed * 0.618) % 1));
      const rise = ((state.time * 28 + seed * 3) % 50) - 25;   // 循环上升偏移
      const sx = Math.cos(sa) * sr + Math.sin(state.time * 1.2 + k) * 2;
      const sy = Math.sin(sa) * sr - rise;
      const sparkR = 1.0 + Math.sin(state.time * 4 + k * 2) * 0.4;
      if (Math.hypot(sx, sy) < ar) {
        ctx.beginPath(); ctx.arc(sx, sy, sparkR, 0, Math.PI * 2); ctx.fill();
      }
    }

    // 稳定边界环（最外层淡橙描边，标识光环范围）
    ctx.beginPath(); ctx.arc(0, 0, ar, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 120, 30, 0.34)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.restore();
  }

  // 爆炸冲击圈（大狗导弹雨 / 捣蛋来袭）：蓝色扩散环自爆点扩张至波及半径后渐隐，
  // 直观指示溅射范围（生成见 07-player dagouMissileBlast / 02-core spawnBlastRing，推进见 14-main）
  function drawBlastRings() {
    for (const r of blastRings) {
      const p = clamp(r.t / r.dur, 0, 1);
      const rad = r.r * (0.35 + 0.65 * p);
      const a = 0.8 * (1 - p);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = r.color;
      ctx.shadowColor = r.color;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = a * 0.25;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.restore();
    }
  }

  // 天秀忧郁王子：友方大风暴——暴风之眼同款俯视旋涡的我方版（三层旋臂 + 风暴眼 + 外虚线环），
  // 白蓝色调；存留末段渐隐。绘制于僚机之后、子弹之前（不遮挡我方弹幕）
  // 大狗导弹雨预警：发射前 warnLead 秒屏幕下方自下而上渐显淡蓝光带（峰值 warnPeak，克制可见），
  // 发射瞬间起 warnFade 秒内快速渐隐（透明度按剩余时间回落）
  function drawDagouWarn() {
    const cfg = PILOTS.dagou;
    let a = 0;
    if (state.dagouMissT > 0 && state.dagouMissT <= cfg.warnLead) a = (1 - state.dagouMissT / cfg.warnLead) * cfg.warnPeak;
    if (state.dagouWarnFadeT > 0) a = Math.max(a, (state.dagouWarnFadeT / cfg.warnFade) * cfg.warnPeak);
    if (a <= 0) return;
    const grad = ctx.createLinearGradient(0, CANVAS_H, 0, CANVAS_H - cfg.warnH);
    grad.addColorStop(0, `rgba(96, 158, 255, ${a.toFixed(3)})`);
    grad.addColorStop(0.55, `rgba(70, 128, 255, ${(a * 0.45).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(70, 128, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, CANVAS_H - cfg.warnH, CANVAS_W, cfg.warnH);
  }

  function drawFriendStorms() {
    for (const s of friendStorms) {
      const fadeIn = clamp(s.t / 0.4, 0, 1);
      const fadeOut = clamp((s.dur - s.t) / 0.5, 0, 1);
      const a = Math.min(fadeIn, fadeOut);
      if (a <= 0) continue;
      ctx.save();
      ctx.globalAlpha *= a;
      // 风暴本体直接复用大型龙卷（暴风之眼召唤物）绘制 drawTornado：白色实体底盘 + 台风云盘纹理 +
      // 矢量旋臂 + 外缘柔光 + 风暴眼微光，样式完全一致（自转为该绘制内置的时间驱动，无需实体 rot）
      drawTornado({ x: s.x, y: s.y, w: s.r * 2 }, 2);   // 自转 ×2（友方大风暴专属转速）
      ctx.restore();
    }
  }

  // 许凯狗冲刺：被击杀敌机身上的白光冲击——扩散白环（加法混合）+ 中心渐隐白闪核
  function drawDashKillFx() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of dashKillFx) {
      const p = clamp(f.t / f.max, 0, 1);
      const a = (1 - p) * (1 - p);
      // 扩散白环：半径由机体尺寸快速外扩，线宽随扩散变细
      const rr = f.r * (0.5 + p * 2.2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.85 * a).toFixed(3)})`;
      ctx.lineWidth = 3 * (1 - p) + 0.6;
      ctx.beginPath();
      ctx.arc(f.x, f.y, rr, 0, Math.PI * 2);
      ctx.stroke();
      // 内环辉光（稍慢半拍）
      ctx.strokeStyle = `rgba(214, 238, 255, ${(0.5 * a).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.3 + p * 1.4), 0, Math.PI * 2);
      ctx.stroke();
      // 中心白闪核：快速渐隐的光团
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (0.9 + p * 0.8));
      g.addColorStop(0, `rgba(255, 255, 255, ${(0.75 * a).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.9 + p * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 许凯狗冲刺：全场流动特效——纵贯全屏的白色疾驰光带自上而下奔涌（星海向身后飞逝的相对运动感）；
  // 收尾段（dashTail 0.8s）光带流速与亮度同步衰减，冲刺结束前已完全淡出
  function drawDashWorldFlow() {
    if (state.pilotDashT <= 0) return;
    const t = state.time;
    const tail = PILOTS.xukaigou.dashTail;
    const fade = Math.min(1, state.pilotDashT / tail);          // 收尾亮度系数 1→0
    const slow = 0.25 + 0.75 * fade;                             // 收尾流速系数（衰减至 25% 时已不可见）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // 26 条全屏长光带：横向位置/速度/长度/亮度错落，自顶部流向底部（世界向身后掠过）
    for (let i = 0; i < 26; i++) {
      const seed = i * 131.7;
      const spd = (1.6 + ((seed * 2.7) % 1) * 2.2) * slow;
      const cyc = (t * spd + seed * 0.011) % 1;
      const lx = ((seed * 7.9) % CANVAS_W);
      const ln = CANVAS_H * (0.16 + ((seed * 3.7) % 1) * 0.3);
      const ly = cyc * (CANVAS_H + ln) - ln;   // 自 -ln 流动至 CANVAS_H
      const a = Math.sin(cyc * Math.PI) * (0.05 + ((seed * 5.3) % 1) * 0.1) * fade;
      const grd = ctx.createLinearGradient(lx, ly, lx, ly + ln);
      grd.addColorStop(0, 'rgba(210, 235, 255, 0)');
      grd.addColorStop(0.5, `rgba(210, 235, 255, ${a.toFixed(3)})`);
      grd.addColorStop(1, 'rgba(210, 235, 255, 0)');
      ctx.strokeStyle = grd;
      ctx.lineWidth = 1.4 + ((seed * 4.1) % 1) * 1.8;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx, ly + ln);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 埃逸自爆演出：蓄力期收缩波（一道/三道能流环自远处向死亡地点加速汇聚）+
  // 爆炸后扩散波（一道/数道极宽冲击环自死亡地点快速扫过全场；实体与结算见 07-player updateAiyiWaves）
  function drawAiyiFx() {
    // 蓄力收缩波：进度 p = 1 − 剩余蓄力（0→1），环半径自起始半径收缩至 0（二次缓动加速收拢）；
    // 初始较浅、随进度渐显（前 30% 进度完成淡入）
    if (player.aiyiChargeT > 0 && player.aiyiChargeT < 10) {
      const final = state.aiyiFinalDeath;
      const dur = final ? PILOTS.aiyi.chargeDurFinal : PILOTS.aiyi.chargeDur;
      const R0 = final ? PILOTS.aiyi.contractRFinal : PILOTS.aiyi.contractR;
      const p = clamp(1 - player.aiyiChargeT / dur, 0, 1);
      const born = clamp(p / 0.30, 0, 1);   // 渐显系数
      const rings = final ? 3 : 1;
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.lineCap = 'round';
      for (let k = 0; k < rings; k++) {
        const pk = clamp((p - k * 0.18) / 0.82, 0, 1);   // 三道错峰（最后一条命），末段同时抵达
        if (pk <= 0) continue;
        const r = R0 * (1 - pk) * (1 - pk);
        const a = (0.2 + 0.6 * pk) * born;   // 越接近引爆越亮 × 开场渐显
        ctx.strokeStyle = `rgba(255, 77, 109, ${(0.55 * a).toFixed(3)})`;
        ctx.lineWidth = 2.5 + 7 * pk;
        ctx.shadowColor = '#ff4d6d';
        ctx.shadowBlur = 10 + 14 * pk;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255, 181, 69, ${(0.4 * a).toFixed(3)})`;
        ctx.lineWidth = 1.2 + 3 * pk;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.shadowBlur = 0;
    }
    // 爆炸扩散波：极宽冲击环自爆心外扩，随半径增大逐渐变淡消散（最终自爆波体更宽）
    for (const w of state.aiyiWaves) {
      if (w.delay > 0) continue;
      const a = clamp(1 - w.r / w.maxR, 0, 1);
      if (a <= 0) continue;
      ctx.save();
      ctx.translate(w.x, w.y);
      // 外层宽辉光带（很宽的波体）+ 白热内芯（最终自爆三道波：波宽 ×1.7 → 再 +30% = ×2.21）
      const widen = w.final ? 2.21 : 1;
      ctx.strokeStyle = `rgba(255, 77, 109, ${(0.4 * a).toFixed(3)})`;
      ctx.lineWidth = (w.final ? 46 : 26) * widen;
      ctx.shadowColor = '#ff4d6d';
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(0, 0, w.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 181, 69, ${(0.5 * a).toFixed(3)})`;
      ctx.lineWidth = (w.final ? 26 : 13) * widen;
      ctx.beginPath();
      ctx.arc(0, 0, w.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.75 * a).toFixed(3)})`;
      ctx.lineWidth = (w.final ? 8 : 4.5) * widen;
      ctx.beginPath();
      ctx.arc(0, 0, w.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.shadowBlur = 0;
    }
  }

  // 叮咚鸡：Q 导弹视觉——黄白小导弹沿飞行方向取向（主体白 + 黄头 + 淡黄尾焰粒子由更新侧撒布）
  function drawDdjMissiles() {
    if (!ddjMissiles.length) return;
    const cfg = PILOTS.dingdongji;
    for (const m of ddjMissiles) {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(Math.atan2(m.vy, m.vx) + Math.PI / 2);   // 弹体纵向沿飞行方向
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -m.r * 1.6);
      ctx.lineTo(m.r * 0.8, m.r);
      ctx.lineTo(-m.r * 0.8, m.r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = cfg.color;
      ctx.beginPath(); ctx.arc(0, -m.r * 0.9, m.r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // 依：镰刀清扫视觉——素材按「握把→刃尖」两点锚定绘制（握把挂机体周围绕转：刀柄轨迹半径 scytheGripR、
  // 起扫时刀柄位于正左，刃尖达 250px 外圈，统一缩放不拉伸），
  // 自正左（scytheStart = π）起：先慢速倒转蓄力（scytheWind 后拉，刃尖聚气辉光渐强）→ 顺时针斩击一圈回正左；
  // 斩击中前段刀刃空间颤动（微角抖 + 两侧错位残影），并参照群星之杀在刀刃处周期爆发空间涟漪
  // （发光双线环自发射点大幅荡开、沿斩扫轨迹形成一串涟漪）；刀刃后方粉紫白三色锥形渐变拖尾（越落后越淡，
  // 前沿全收、矩形端面不可见），斩击头部 = 平滑圆形径向渐变光斑（参照群星之杀刀锋头）+ 白热内芯 + 外圈光晕
  // + 超宽柔光，刀柄经过处另留两道淡紫弧痕；持续洒落的粉紫火花粒子见 07-player updateMeiScythes；
  // 外围范围指示双环（实线外环 + 旋转虚线内环）；首尾快速淡入淡出；素材未加载回退粉白渐变长条
  function drawMeiScythes() {
    if (!meiScythes.length) return;
    const cfg = PILOTS.mei;
    const TWO_PI = Math.PI * 2;
    // 素材锚点（scythe_transparent.png 1199×1754，解 alpha 实测）：刃尖 = 最右不透明像素 / 握把 = 最下不透明像素 /
    // 杆顶 = 杆身（行宽≈30px）上端与弯钩刃（行宽骤增）的转折点（逐行宽度扫描实测）；
    // 绘制：先对素材做原始坐标系缩放（SCX 左右/弯钩横向、SCY 上下/杆向），再旋转使「握把→杆顶（变形后）」对齐径向
    // （刀柄杆水平朝外、起扫 π = 水平朝左），握把落到刀柄公转位（距机体 gripR），整体 s 使刃尖达 scytheR 外圈
    const TIP = { x: 1197, y: 169 }, GRIP = { x: 790, y: 1745 }, ROD = { x: 477, y: 545 };
    const SCX = 1.4, SCY = 0.8;   // 素材系缩放：左右（弯钩横向）= 原基准×2 的 70% = ×1.4；上下（杆向）×0.8 → 刀柄更短
    const startAng = cfg.scytheStart;   // 起扫姿态角（π = 刀柄杆水平朝左；sc.ang 为相对它的进度角）
    const tipAng = cfg.scytheTilt;      // 刃尖弯钩偏角：刃尖绝对方位 = 姿态角 + 进度角 + tilt（判定/拖尾/光斑跟随，杆姿态不变）
    for (const sc of meiScythes) {
      const alpha = Math.min(clamp(sc.t / 0.08, 0, 1), clamp((cfg.scytheWind + cfg.scytheDur - sc.t) / 0.15, 0, 1));
      // 斩击前半程「空间颤动」强度：随行程快升缓降，2/3 行程（减速点）归零（蓄力段/后程无颤动）
      const travel = (sc.ang + cfg.scytheWindAng) / (TWO_PI + cfg.scytheWindAng);   // 斩击行程进度 0→1（蓄力段 <0）
      const SHU_RISE = 0.15, SHU_HALF = 2 / 3;
      const shudder = travel <= 0 || travel >= SHU_HALF ? 0
        : travel < SHU_RISE ? travel / SHU_RISE : (SHU_HALF - travel) / (SHU_HALF - SHU_RISE);
      ctx.save();
      ctx.translate(player.x, player.y);
      // 范围指示：淡粉实线外环 + 半透明旋转虚线内环（虚线顺时针缓转，与刀刃同向）
      ctx.globalAlpha = alpha * 0.35;
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, cfg.scytheR, 0, TWO_PI); ctx.stroke();
      ctx.globalAlpha = alpha * 0.16;
      ctx.setLineDash([9, 15]);
      ctx.lineDashOffset = -state.time * 46;
      ctx.beginPath(); ctx.arc(0, 0, cfg.scytheR * 0.985, 0, TWO_PI); ctx.stroke();
      ctx.setLineDash([]);
      // 拖尾（已扫过弧 [startAng, startAng+ang]）：锥形渐变——刃口白热 → 粉 → 紫 → 透明（越落后越淡；
      // 梯度起点 = 刀刃绝对方位，最老扫过边位于 tb = 1 - ang/2π）；createConicGradient 缺失时回退短残影弧
      if (sc.ang > 0.02 && typeof ctx.createConicGradient === 'function') {
        const tb = 1 - sc.ang / TWO_PI;
        const addStops = (g, whiteA, pinkA, purpleA) => {
          g.addColorStop(0, 'rgba(190,120,255,0)');
          g.addColorStop(tb, 'rgba(190,120,255,0)');
          g.addColorStop(Math.min(1, tb + (1 - tb) * 0.38), `rgba(190,120,255,${purpleA})`);
          g.addColorStop(Math.min(1, tb + (1 - tb) * 0.55), `rgba(225,145,235,${((purpleA + pinkA) / 2).toFixed(2)})`);   // 中段过渡（更平滑）
          g.addColorStop(Math.min(1, tb + (1 - tb) * 0.72), `rgba(255,140,215,${pinkA})`);
          g.addColorStop(0.95, `rgba(255,224,248,${whiteA})`);
          g.addColorStop(1, 'rgba(255,200,240,0)');   // 刀刃前沿全收：矩形端面不再可见，头部光效由平滑圆形光斑承担
        };
        const gMain = ctx.createConicGradient(startAng + tipAng + sc.ang, 0, 0);
        addStops(gMain, 0.9, 0.62, 0.4);
        const gCore = ctx.createConicGradient(startAng + tipAng + sc.ang, 0, 0);
        addStops(gCore, 0.85, 0.4, 0);
        // 四层叠加：超宽柔光 / 外圈光晕 / 主拖尾 / 白热内芯（明暗沿弧由梯度控制；圆头端点消除矩形硬边）
        ctx.lineCap = 'round';
        ctx.globalAlpha = alpha * 0.13;
        ctx.strokeStyle = gMain; ctx.lineWidth = 92;
        ctx.beginPath(); ctx.arc(0, 0, cfg.scytheR * 0.94, startAng + tipAng, startAng + tipAng + sc.ang); ctx.stroke();
        ctx.globalAlpha = alpha * 0.28;
        ctx.strokeStyle = gMain; ctx.lineWidth = 58;
        ctx.beginPath(); ctx.arc(0, 0, cfg.scytheR * 0.94, startAng + tipAng, startAng + tipAng + sc.ang); ctx.stroke();
        ctx.globalAlpha = alpha * 0.6;
        ctx.strokeStyle = gMain; ctx.lineWidth = 26;
        ctx.beginPath(); ctx.arc(0, 0, cfg.scytheR * 0.94, startAng + tipAng, startAng + tipAng + sc.ang); ctx.stroke();
        ctx.globalAlpha = alpha * 0.85;
        ctx.strokeStyle = gCore; ctx.lineWidth = 9;
        ctx.beginPath(); ctx.arc(0, 0, cfg.scytheR * 0.94, startAng + tipAng, startAng + tipAng + sc.ang); ctx.stroke();
        // 刀柄经过处的弧痕：两道细弧（刀身 45% / 68% 处，自刀柄轨迹圈向刃尖），沿用主梯度、压低透明度
        // 角度域跟「杆的扫过域」[start, start+ang]（不带刃尖偏角 tipAng）——刀柄特效须在刀柄划过之后才出现
        ctx.globalAlpha = alpha * 0.3;
        ctx.strokeStyle = gMain; ctx.lineWidth = 14;
        ctx.beginPath(); ctx.arc(0, 0, cfg.scytheGripR + (cfg.scytheR - cfg.scytheGripR) * 0.45, startAng, startAng + sc.ang); ctx.stroke();
        ctx.globalAlpha = alpha * 0.22;
        ctx.strokeStyle = gMain; ctx.lineWidth = 10;
        ctx.beginPath(); ctx.arc(0, 0, cfg.scytheGripR + (cfg.scytheR - cfg.scytheGripR) * 0.68, startAng, startAng + sc.ang); ctx.stroke();
      } else if (sc.ang > 0.02) {
        ctx.globalAlpha = alpha * 0.45;
        ctx.strokeStyle = cfg.color;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(0, 0, cfg.scytheR * 0.94, startAng + tipAng + sc.ang - 1.1, startAng + tipAng + sc.ang);
        ctx.stroke();
      }
      // 斩击头部光斑（平滑圆形，参照群星之杀刀锋头）：白核 → 粉 → 紫 → 透明径向渐变，
      // 跟随刃尖绝对方位（姿态角 + 进度角 + tilt）、辉光加持——拖尾前沿的亮度全部由此承担（弧端面已全收）
      const tipX = Math.cos(startAng + tipAng + sc.ang) * cfg.scytheR * 0.94, tipY = Math.sin(startAng + tipAng + sc.ang) * cfg.scytheR * 0.94;
      const fg = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 34);
      fg.addColorStop(0, `rgba(255,255,255,${0.8 * alpha})`);
      fg.addColorStop(0.35, `rgba(255,200,240,${0.55 * alpha})`);
      fg.addColorStop(0.65, `rgba(255,160,225,${0.28 * alpha})`);
      fg.addColorStop(1, 'rgba(190,120,255,0)');
      ctx.globalAlpha = 1;
      ctx.shadowColor = 'rgba(255,170,230,0.9)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(tipX, tipY, 34, 0, TWO_PI); ctx.fill();
      ctx.shadowBlur = 0;
      // 蓄力段（后拉）：刃尖聚气辉光随蓄力进度增强（慢速倒转蓄势感）
      if (sc.ang < 0) {
        const cp = -sc.ang / cfg.scytheWindAng;   // 蓄力进度 0→1
        const cRad = 24 + 20 * cp;
        const cg = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, cRad);
        cg.addColorStop(0, `rgba(255,255,255,${(0.4 + 0.4 * cp) * alpha})`);
        cg.addColorStop(0.5, `rgba(255,160,225,${0.45 * cp * alpha})`);
        cg.addColorStop(1, 'rgba(190,120,255,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(tipX, tipY, cRad, 0, TWO_PI); ctx.fill();
      }
      // 空间涟漪（参照群星之杀斩击空间波动）：发射于刀刃位置的发光双线环依次大幅荡开
      // （波心冻结在发射点、沿斩扫轨迹形成一串涟漪；lighter 发光叠加 + 辉光，强度随颤动曲线）
      if (sc.rips && sc.rips.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const rp of sc.rips) {
          const tt = rp.t / 0.5;                     // 涟漪进度 0→1（0.5s 生命）
          const rr = 10 + tt * 120;                  // 半径大幅扩散 10 → 130
          const ripA = (1 - tt) * alpha * (0.3 + 0.7 * shudder);
          if (ripA < 0.02) continue;
          ctx.strokeStyle = 'rgba(255,185,238,1)';
          ctx.shadowColor = '#ffb3e6'; ctx.shadowBlur = 12;
          ctx.globalAlpha = ripA * 0.68;
          ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.arc(rp.x, rp.y, rr, 0, TWO_PI); ctx.stroke();
          ctx.globalAlpha = ripA * 0.4;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(rp.x, rp.y, Math.max(0.5, rr - 18), 0, TWO_PI); ctx.stroke();
        }
        ctx.restore();
      }
      // 镰刀本体：素材「握把→刃尖」两点锚定——握把挂到刀柄公转位（距机体 gripR，刀柄贴身绕转、
      // 起扫时位于正左）、刃尖达 scytheR 外圈；先转公转角、平移 gripR 到刀柄点，再转 -phi 把素材内
      // 握把→刃尖方向摆到 +x 径向、统一缩放（不拉伸）、平移 -GRIP 让握把落点 = 公转位；刃口粉白辉光
      ctx.globalAlpha = alpha;
      ctx.rotate(startAng + sc.ang + rand(-0.018, 0.018) * shudder);   // 绝对方位 = 起扫正左 + 进度角；颤动段叠加微幅角抖动
      ctx.translate(cfg.scytheGripR, 0);   // 刀柄公转位：机体 + gripR × 方位方向（残影绕此点摆动）
      const len = cfg.scytheR - cfg.scytheGripR, h = cfg.scytheWidth;   // 刀身长度 = 斩击半径 − 刀柄轨迹半径
      ctx.shadowColor = 'rgba(255,170,230,0.9)';
      ctx.shadowBlur = 22;
      if (scytheImg) {
        // phi 把「S 变形后的杆向量」对齐 +x（素材系缩放会改变杆向，须按变形后的方向对齐）：
        // 刀柄杆水平朝外（起扫 π = 水平朝左）；s 使刃尖达 scytheR 外圈（len = R − gripR）
        const phi = -Math.atan2((ROD.y - GRIP.y) * SCY, (ROD.x - GRIP.x) * SCX);
        const s = len / Math.hypot((TIP.x - GRIP.x) * SCX, (TIP.y - GRIP.y) * SCY);
        // 空间颤动残影：主刃两侧各一道错位虚影（仅颤动段出现，随强度增强）
        for (const off of (shudder > 0.02 ? [-0.055, 0, 0.055] : [0])) {
          ctx.save();
          if (off !== 0) ctx.rotate(off * shudder);
          ctx.rotate(phi);
          ctx.scale(s * SCX, s * SCY);
          ctx.globalAlpha = off === 0 ? alpha : alpha * 0.26;
          ctx.drawImage(scytheImg, -GRIP.x, -GRIP.y);
          ctx.restore();
        }
      } else {
        // 素材未加载回退：粉白渐变长条（白热刃口 → 淡粉 → 淡紫，高度用 scytheWidth）
        const bg = ctx.createLinearGradient(0, 0, len, 0);
        bg.addColorStop(0, 'rgba(255,255,255,0.95)');
        bg.addColorStop(0.55, 'rgba(255,160,225,0.85)');
        bg.addColorStop(1, 'rgba(190,120,255,0.55)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, -h / 2, len, h);
      }
      ctx.restore();
    }
  }

  // 奖励道具·寒霜发生器：我方寒霜力场（160px）——青白色半透明双环 + 极淡径向内衬，
  // 刻意压低存在感（与敌方冰蓝寒霜区域区分：色偏青白、透明度更低、无雪花粒子）；
  // 发射离场态（launched）随 y 上移照常绘制，出屏后由推进端移除
  function drawFrostField() {
    const ff = state.frostField;
    if (!ff) return;
    ctx.save();
    const pulse = 1 + Math.sin(state.time * 2.2) * 0.02;
    const r = ff.r * pulse;
    // 内衬：极淡青白径向渐变（不干扰弹幕判断）
    const g = ctx.createRadialGradient(ff.x, ff.y, r * 0.2, ff.x, ff.y, r);
    g.addColorStop(0, 'rgba(210, 245, 255, 0)');
    g.addColorStop(0.75, 'rgba(205, 242, 255, 0.045)');
    g.addColorStop(1, 'rgba(225, 250, 255, 0.075)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ff.x, ff.y, r, 0, Math.PI * 2);
    ctx.fill();
    // 外环：青白细线（虚线旋转让"力场"可读但不抢眼）
    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = '#cdeeff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 14]);
    ctx.lineDashOffset = -state.time * 22;
    ctx.beginPath();
    ctx.arc(ff.x, ff.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // 内环：更淡的实线（层次）
    ctx.globalAlpha = 0.16;
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ff.x, ff.y, r * 0.97, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 奖励道具·哦哦！抽卡！全套演出（gather→flash→shadow→meteor→shock，状态机见 07-player updateGachaFx）：
  //   gather  原石自四面八方随机先后飞向机体（越靠近越加速，命中即微光收束；纯演出不掉分）
  //   flash   彩光自机体爆发（按抽中颜色染色）+ 周身 300px 清弹（结算在推进端）
  //   shadow  场心巨影压境（暗色椭圆 + 内圈漩涡感，由淡转深）
  //   meteor  同色陨石自屏幕上方加速砸向场心（拖尾 + 火蚀边；金色附加彩色流光环绕）
  //   shock   巨型多层冲击波扩散 + 闪核（结算在推进端 gachaMeteorImpact）
  const GACHA_COLORS = {
    blue:   { main: '#4da3ff', light: '#9cc8ff', deep: '#1c5fd6', glow: 'rgba(77,163,255,' },
    purple: { main: '#b06cff', light: '#d9b3ff', deep: '#6d2fd0', glow: 'rgba(176,108,255,' },
    gold:   { main: '#ffd24a', light: '#ffe9a8', deep: '#d69a1c', glow: 'rgba(255,210,74,' },
  };

  function drawGachaFx() {
    const g = state.gachaFx;
    if (!g) return;
    const cx = CANVAS_W / 2, cy = CANVAS_H * 0.45;
    ctx.save();
    if (g.phase === 'gather') {
      // 原石：白核 + 微彩光晕，自起点向机体当前实时位置飞行（ease-in 加速逼近）
      for (const s of g.stones) {
        const p = clamp((s.t - s.delay) / 0.5, 0, 1);
        if (p <= 0 || p >= 1) continue;
        const ease = p * p * (0.4 + 0.6 * p);   // 轻微 ease-in：越近越快
        const x = s.sx + (player.x - s.sx) * ease;
        const y = s.sy + (player.y - s.sy) * ease;
        const a = Math.min(1, p * 3) * (0.65 + 0.35 * Math.sin(state.time * 18 + s.delay * 40));
        // 飞行拖线
        const tx = s.sx + (player.x - s.sx) * Math.max(0, ease - 0.16);
        const ty = s.sy + (player.y - s.sy) * Math.max(0, ease - 0.16);
        ctx.globalAlpha = a * 0.4;
        ctx.strokeStyle = '#cfe6ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
        // 石体：白核 + 青白光晕
        ctx.globalAlpha = a;
        const gg = ctx.createRadialGradient(x, y, 0, x, y, 9);
        gg.addColorStop(0, 'rgba(255,255,255,0.95)');
        gg.addColorStop(0.45, 'rgba(190,225,255,0.55)');
        gg.addColorStop(1, 'rgba(160,210,255,0)');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (g.phase === 'flash') {
      const p = g.t / 0.35;
      const a = 1 - p;
      const c = GACHA_COLORS[g.color] || GACHA_COLORS.blue;
      // 全彩光斑：自机体急速扩张的多层光环
      const r = 20 + (1 - Math.pow(1 - p, 3)) * 300;
      ctx.globalAlpha = a * 0.75;
      const rg = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, r);
      rg.addColorStop(0, '#ffffff');
      rg.addColorStop(0.35, `${c.glow}${(0.7 * a).toFixed(3)})`);
      rg.addColorStop(1, `${c.glow}0)`);
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(player.x, player.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = c.light;
      ctx.lineWidth = 5 * (1 - p) + 1;
      ctx.shadowColor = c.main;
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.arc(player.x, player.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (g.phase === 'shadow' || g.phase === 'meteor' || g.phase === 'shock') {
      const c = GACHA_COLORS[g.color] || GACHA_COLORS.blue;
      // 巨影：shadow 期由淡转深压入场心，meteor/shock 期维持（被陨石与冲击波覆盖）
      const shP = g.phase === 'shadow' ? clamp(g.t / 0.7, 0, 1) : 1;
      const shA = 0.5 * shP;
      ctx.globalAlpha = shA;
      ctx.fillStyle = '#04060f';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 150 * (0.4 + 0.6 * shP), 60 * (0.4 + 0.6 * shP), 0, 0, Math.PI * 2);
      ctx.fill();
      // 影缘微光（预示陨石颜色）
      ctx.globalAlpha = shA * 0.5;
      ctx.strokeStyle = c.main;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 150 * (0.4 + 0.6 * shP), 60 * (0.4 + 0.6 * shP), 0, 0, Math.PI * 2);
      ctx.stroke();

      if (g.phase === 'meteor') {
        // 陨石：自屏幕上方加速砸向场心（与推进端 0.55s 同步），二次 ease-in
        const p = clamp(g.t / 0.55, 0, 1);
        const y = -80 + (cy + 80) * p * p;
        const R = 46;
        // 拖尾：自陨石尾部向上的渐变光带（长度随速度增长）
        const tail = 120 + 260 * p;
        const tg = ctx.createLinearGradient(cx, y - tail, cx, y);
        tg.addColorStop(0, `${c.glow}0)`);
        tg.addColorStop(0.7, `${c.glow}${(0.35).toFixed(3)})`);
        tg.addColorStop(1, `${c.glow}0.8)`);
        ctx.globalAlpha = 1;
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.moveTo(cx - R * 0.85, y - 6);
        ctx.quadraticCurveTo(cx, y - tail, cx + R * 0.85, y - 6);
        ctx.lineTo(cx + R * 0.5, y);
        ctx.lineTo(cx - R * 0.5, y);
        ctx.closePath();
        ctx.fill();
        // 石体：深色内核 + 同色火蚀边 + 外发光
        ctx.shadowColor = c.main;
        ctx.shadowBlur = 34;
        ctx.fillStyle = c.deep;
        ctx.beginPath();
        ctx.arc(cx, y, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        const bg = ctx.createRadialGradient(cx - R * 0.3, y - R * 0.3, R * 0.1, cx, y, R);
        bg.addColorStop(0, c.light);
        bg.addColorStop(0.55, c.main);
        bg.addColorStop(1, c.deep);
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(cx, y, R * 0.88, 0, Math.PI * 2);
        ctx.fill();
        // 金色限定：周身彩色流光（三色小光点环绕流动）
        if (g.color === 'gold') {
          const hues = ['#4da3ff', '#b06cff', '#5cffc0', '#ff8a5c'];
          for (let k = 0; k < hues.length; k++) {
            const ang = state.time * 5 + k * Math.PI / 2;
            const ox = Math.cos(ang) * (R + 14), oy = Math.sin(ang) * (R + 14) * 0.6;
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = hues[k];
            ctx.shadowColor = hues[k];
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(cx + ox, y + oy, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }

      if (g.phase === 'shock') {
        // 巨型冲击波：三层环（同色主环 + 白热内环 + 淡色外环）急速扩张至全屏
        const p = clamp(g.t / 0.9, 0, 1);
        const ease = 1 - Math.pow(1 - p, 2.4);
        const maxR = Math.hypot(CANVAS_W, CANVAS_H) / 2 + 60;
        const r = 30 + ease * maxR;
        const a = 1 - p;
        ctx.globalAlpha = a * 0.9;
        ctx.strokeStyle = c.main;
        ctx.shadowColor = c.light;
        ctx.shadowBlur = 40 * a;
        ctx.lineWidth = 30 * (1 - ease) + 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = a * 0.75;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowBlur = 0;
        ctx.lineWidth = 10 * (1 - ease) + 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = a * 0.5;
        ctx.strokeStyle = c.light;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
        ctx.stroke();
        // 闪核：冲击瞬间白热径向光斑快速衰减
        if (p < 0.3) {
          ctx.globalAlpha = (1 - p / 0.3) * 0.9;
          const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 220);
          fg.addColorStop(0, '#ffffff');
          fg.addColorStop(0.4, `${c.glow}0.8)`);
          fg.addColorStop(1, `${c.glow}0)`);
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.arc(cx, cy, 220, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  function render() {
    // 抖动
    ctx.save();
    if (state.shakeTime > 0) {
      // 震屏幅度随剩余时长线性衰减（初始最大 → 平滑归零，不再恒定到戛然而止）
      const decay = state.shakeDur > 0 ? state.shakeTime / state.shakeDur : 0;
      const m = state.shakeMag * decay;
      ctx.translate(rand(-m, m), rand(-m, m));
    }

    // 背景
    // 背景（静态渐变，缓存复用）
    ctx.fillStyle = cachedGrad('bg', () => {
      const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      bg.addColorStop(0, '#0a1230');
      bg.addColorStop(1, '#050814');
      return bg;
    });
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    drawStars();
    drawNebulae();
    drawDashWorldFlow();   // 许凯狗冲刺：全场流动特效（疾驰光带自上而下奔涌）
    drawDagouWarn();   // 大狗：导弹雨发射前屏幕下方蓝光预警（渐显 → 发射后快速渐隐）
    // 主菜单攻击演示：实体层（机体/僚机/弹道/粒子/冲击波等）统一裁剪到演示屏矩形——
    // 弹道与冲击波到达边框即被截断，呈现"屏幕"边界；背景星空不裁剪，保持画面通透
    if (state.demo) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(10, DEMO_TOP, CANVAS_W - 20, DEMO_BOTTOM - DEMO_TOP);
      ctx.clip();
    }
    drawMissileWarns();
        drawZoneMarks();   // 暴风之眼：区域标记 / 风流 / 风柱
            drawStormVortex();   // 暴风之眼：涡流风旋（技能7）
    drawCrystals();
    drawPowerups();
    drawPlayerFireRing();   // 炽心：自身火环（低图层——位于实体与子弹之下，不遮挡任何单位）
    for (const e of enemies) {
      if (e.type === 'boss') drawBoss(e);
      else drawEnemy(e);
    }
    drawStarslayerBeam();   // 群星之杀：机头淡白锁定光束（敌机之上、玩家之下）
    drawPlayer();
    drawWingmen();
    drawFriendStorms();   // 天秀忧郁王子：友方大风暴（僚机之上、子弹之下）
    drawAiyiFx();         // 埃逸：自爆收缩波（蓄力期）与扩散波（爆炸后）
    drawTrailGhosts();
    drawWatchClearFx();   // 群星守望消弹特效（低图层：位于各子弹之下）
    drawXinRings();       // 副武器·辛国栋之怒：灼烧火环（子弹之下）
    drawXinFuryRing();    // 奖励道具·辛国栋大怒：固定位置扩散火环（子弹之下）
    drawFeijianWaves();   // 副武器·无界飞剑：待发射飞剑（凝聚下沉 → 分裂悬浮）
    drawBullets();
    drawMissiles();
    drawDagouMissiles();   // 大狗：白蓝导弹雨（自下而上，命中溅射）
    drawDdjMissiles();   // 叮咚鸡：黄白导弹（前向扇形直线飞行，直击）
    drawFrostZones();   // 虚幻：寒冷区域（寒霜光圈同款冰圈雾气，位于预警圈/炸弹之下）
    drawFrostField();   // 奖励道具·寒霜发生器：我方青白力场（低图层地面效果，存在感刻意压低）
    drawBlastRings();   // 爆炸冲击圈：大狗导弹爆炸的蓝色扩散环（指示波及范围）
    drawBaolingBombs();   // 暴鸰：红色预警圈 + 飞行中的炸弹（虚幻：深蓝预警圈 + 冰青圆柱弹，冲刺段朝向锁定方向）
    drawXgWarnCircles(state.xgLooseBombs);   // 辛国栋击毁残留的地毯轰炸落点预警（继续倒计时爆炸，结算见 06-enemy updateXgLooseBombs）
    drawPopianFx();       // 破片 / 破片U型：红圈预警 + 三连发不可击毁导弹
    drawWarGhostSlashes();   // 战争幽灵：技能1/2双刃斩击流（白身金芒高速斩击）
    drawSpellCubes();     // 法术矩阵：发光正方体（白光体 + 红光棱边，限程后黯淡渐隐）
    drawCubeHitFx();      // 法术矩阵：正方体命中玩家的击中特效（白热闪核 + 红色冲击波环）
    drawPhaseFx();        // 碎盾特效（群星之杀斩碎虚化护盾）：白热闪核 + 冰蓝冲击环 + 飞散弧形碎片
    drawPlayerHitFx();    // 命中玩家特效（白热闪核 + 红橙冲击环 + 迸溅火花线）
    drawDouzhiFx();       // 斗志昂扬死亡演出：脱离渐隐蓝盒 + 淡黄扩大光环 + 渐隐本体
    drawSlashFx();        // 群星之杀：空间斩击特效（交叉斩痕 + 冲击环，渐隐）
    drawDashKillFx();     // 许凯狗冲刺：被击杀敌机白光冲击（扩散白环 + 渐隐闪核）
    drawParticles();
    drawBossBars();       // BOSS 顶部血条：顶层绘制（实体/弹幕/粒子之上）——BOSS 靠上时机体不再遮挡血条
    drawChallengeBar();   // 测试模式：顶部测试目标血条（图鉴挑战·敌人测试）
    drawGachaFx();        // 奖励道具·哦哦！抽卡！：原石汇集/彩光/巨影/陨石/冲击波（顶层演出）
    drawItemPickFx();   // 奖励道具·获得特效：机体前方道具图标 + 扩散波渐隐（顶层）

    // BOSS 警报演出（全屏覆盖层）
    if (bossFlow.stage === 'warn') drawBossWarning(bossFlow.warnT);

    // 炸弹白闪
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${clamp(state.flash, 0, 1) * 0.7})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // 受击红晕：屏幕四周泛红（命中玩家时叠加，14-main 随时间衰减）
    if (state.hurt > 0) {
      const k = clamp(state.hurt, 0, 1);
      const hg = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.34, CANVAS_W / 2, CANVAS_H / 2, Math.max(CANVAS_W, CANVAS_H) * 0.62);
      hg.addColorStop(0, 'rgba(255, 36, 58, 0)');
      hg.addColorStop(0.75, `rgba(255, 30, 52, ${(0.16 * k).toFixed(3)})`);
      hg.addColorStop(1, `rgba(255, 26, 48, ${(0.45 * k).toFixed(3)})`);
      ctx.fillStyle = hg;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // 护盾解除冲击波：从玩家位置迅速扩大到全屏，渐隐消失
    if (shieldBurst.active) {
      const p = shieldBurst.t / shieldBurst.duration;   // 0→1
      const ease = 1 - Math.pow(1 - p, 3);              // easeOutCubic：初始快、末尾慢
      const maxR = 750;                                  // 覆盖全屏对角线
      const r = 36 + ease * maxR;
      const alpha = 1 - p;                               // 线性渐隐
      const lw = 12 * (1 - ease) + 2;                    // 环宽随扩张变细
      ctx.save();
      // 外环：青色发光扩散环
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = '#6fe3ff';
      ctx.shadowColor = '#6fe3ff';
      ctx.shadowBlur = 20 * alpha;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(shieldBurst.x, shieldBurst.y, r, 0, Math.PI * 2);
      ctx.stroke();
      // 内层白色细环（紧跟外环内侧，增加层次）
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, lw * 0.3);
      ctx.beginPath();
      ctx.arc(shieldBurst.x, shieldBurst.y, r * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      // 起始阶段：内部淡青色填充（快速衰减）
      if (p < 0.3) {
        ctx.globalAlpha = (1 - p / 0.3) * 0.25;
        ctx.fillStyle = '#6fe3ff';
        ctx.beginPath();
        ctx.arc(shieldBurst.x, shieldBurst.y, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    drawMeiScythes();   // 依：镰刀清扫（绕机旋转，淡入淡出 + 淡粉范围圈）

    // 结晶护盾解除冲击波：样式同量子护盾冲击波（淡粉色），但扩散范围有限——对应其 250px 消弹半径
    if (crystalBurst.active) {      const p = crystalBurst.t / crystalBurst.duration;   // 0→1
      const ease = 1 - Math.pow(1 - p, 3);                // easeOutCubic：初始快、末尾慢
      const maxR = 265;                                   // 略大于 250px 消弹半径
      const r = 36 + ease * (maxR - 36);
      const alpha = 1 - p;
      const lw = 9 * (1 - ease) + 2;
      ctx.save();
      // 外环：淡粉发光扩散环
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = '#FFC0CB';
      ctx.shadowColor = '#FFC0CB';
      ctx.shadowBlur = 18 * alpha;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(crystalBurst.x, crystalBurst.y, r, 0, Math.PI * 2);
      ctx.stroke();
      // 内层白色细环（层次）
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, lw * 0.3);
      ctx.beginPath();
      ctx.arc(crystalBurst.x, crystalBurst.y, r * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      // 起始阶段：内部淡粉填充（快速衰减）
      if (p < 0.3) {
        ctx.globalAlpha = (1 - p / 0.3) * 0.22;
        ctx.fillStyle = '#FFC0CB';
        ctx.beginPath();
        ctx.arc(crystalBurst.x, crystalBurst.y, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 最终壁垒免死金色光环：金环自机体扩散，范围有限（对应其 120px 清弹范围），样式同量子护盾冲击波
    if (bulwarkBurst.active) {
      const p = bulwarkBurst.t / bulwarkBurst.duration;   // 0→1
      const ease = 1 - Math.pow(1 - p, 3);
      const maxR = 132;
      const r = 30 + ease * (maxR - 30);
      const alpha = 1 - p;
      const lw = 10 * (1 - ease) + 2;
      ctx.save();
      // 主环：金色发光扩散环
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = '#ffb545';
      ctx.shadowColor = '#ffd98a';
      ctx.shadowBlur = 20 * alpha;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(bulwarkBurst.x, bulwarkBurst.y, r, 0, Math.PI * 2);
      ctx.stroke();
      // 内层白色细环（层次）
      ctx.globalAlpha = alpha * 0.55;
      ctx.strokeStyle = '#fff3d6';
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, lw * 0.28);
      ctx.beginPath();
      ctx.arc(bulwarkBurst.x, bulwarkBurst.y, r * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      // 起始阶段：内部淡金填充（快速衰减）
      if (p < 0.3) {
        ctx.globalAlpha = (1 - p / 0.3) * 0.2;
        ctx.fillStyle = '#ffb545';
        ctx.beginPath();
        ctx.arc(bulwarkBurst.x, bulwarkBurst.y, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 暴走冲击波：粉橙双环自机体扩散（暴走触发特效，比护盾环更小更亮、聚焦机体）
    if (berserkBurst.active) {
      const p = berserkBurst.t / berserkBurst.duration;
      const ease = 1 - Math.pow(1 - p, 3);
      const maxR = berserkBurst.big ? 190 : 130;
      const r = 12 + ease * maxR;
      const alpha = 1 - p;
      ctx.save();
      // 主环：猩红发光
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = '#ff4d6d';
      ctx.shadowColor = '#ff8a5c';
      ctx.shadowBlur = 24 * alpha;
      ctx.lineWidth = 6 * (1 - ease) + 1.5;
      ctx.beginPath();
      ctx.arc(berserkBurst.x, berserkBurst.y, r, 0, Math.PI * 2);
      ctx.stroke();
      // 外圈金橙细环（层次）
      ctx.globalAlpha = alpha * 0.6;
      ctx.strokeStyle = '#ffb545';
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, 3 * (1 - ease));
      ctx.beginPath();
      ctx.arc(berserkBurst.x, berserkBurst.y, r * 1.18, 0, Math.PI * 2);
      ctx.stroke();
      // 起始闪核：暖白径向光斑快速衰减
      if (p < 0.25) {
        ctx.globalAlpha = (1 - p / 0.25) * 0.8;
        const cg = ctx.createRadialGradient(berserkBurst.x, berserkBurst.y, 0, berserkBurst.x, berserkBurst.y, 46);
        cg.addColorStop(0, 'rgba(255, 245, 230, 0.95)');
        cg.addColorStop(1, 'rgba(255, 90, 60, 0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(berserkBurst.x, berserkBurst.y, 46, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 高能爆弹火圈：橙黄火环自场地中心急速扩大至全场，同时渐隐（全部模式统一表现）
    if (bombBurst.active) {
      const p = bombBurst.t / bombBurst.duration;   // 0→1
      const ease = 1 - Math.pow(1 - p, 2.2);        // easeOut：急速扩张、末段减速
      const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
      const maxR = Math.hypot(CANVAS_W, CANVAS_H) / 2 + 40;   // 覆盖全屏对角线
      const r = 16 + ease * maxR;
      const alpha = 1 - p;
      ctx.save();
      // 火浪内衬：紧贴火环内侧的橙黄径向渐变（跟随火圈推进，火焰余晖感）；绷绷炸弹（big）内衬更强
      const fg = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
      fg.addColorStop(0, 'rgba(255,150,40,0)');
      fg.addColorStop(0.72, `rgba(255,140,40,${((bombBurst.big ? 0.16 : 0.10) * alpha).toFixed(3)})`);
      fg.addColorStop(1, `rgba(255,200,80,${((bombBurst.big ? 0.34 : 0.22) * alpha).toFixed(3)})`);
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // 主火环：橙黄发光粗环（宽度随扩张收窄）；绷绷炸弹（big）环带大幅加宽
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = '#ffb340';
      ctx.shadowColor = '#ff9a2e';
      ctx.shadowBlur = (bombBurst.big ? 34 : 26) * alpha;
      ctx.lineWidth = bombBurst.big ? 54 * (1 - ease) + 12 : 20 * (1 - ease) + 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      // 内侧亮黄细环（层次）
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = '#ffe680';
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, (bombBurst.big ? 14 : 6) * (1 - ease) + 1);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // “暴走”字样：置顶图层（最后绘制，位于所有游戏实体之上）
    if (player.alive && player.berserkBanner > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(player.berserkBanner, 0, 1);
      ctx.fillStyle = '#ff4d6d';
      ctx.shadowColor = '#ffb545';
      ctx.shadowBlur = 14;
      ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暴走', player.x, player.y - 42 - (1.5 - Math.min(player.berserkBanner, 1.5)) * 14);
      ctx.restore();
    }

    if (state.demo) ctx.restore();   // 解除演示屏裁剪

    ctx.restore();

    // 暂停遮罩（由 HTML overlay 接管）
  }

  export {
    gradCache, cachedGrad, drawEnemy, drawTrailGhosts, drawBullets, drawOneEBullet, drawParticles,
    drawPowerups, drawCrystals, render,
  };