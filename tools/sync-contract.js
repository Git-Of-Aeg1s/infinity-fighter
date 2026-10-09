#!/usr/bin/env node
/**
 * sync-contract —— 模块头部契约注释自动同步（《并行开发改造设计.md》§5.3，批次 1d）
 *
 * 重写每个 js 模块文件头的 `  // 被依赖：XX(N 名) ...` 行：
 *   - 名单与计数 = 全部其他模块的 import 语句实况（按名字计数、按 index.html 加载序排序）
 *   - 只重写这一行注释，绝不触碰逻辑；未命中该行时插到文件标题行（第 1 行）之后
 *   - 说明：现行契约头部没有「导出：」清单行（导出清单由 export 块本身承载、check-names 校验），
 *     故本工具仅维护「被依赖」行；未来若引入导出清单行再扩展
 *
 * 流程约定：check-names（校验）→ sync-contract（重写）→ check-names（复验）
 * 用法：node tools/sync-contract.js          重写并保存
 *       node tools/sync-contract.js --check  只报差异不写盘（有差异退出码 1）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'js');
const CHECK = process.argv.includes('--check');

const files = [...readFileSync(join(root, 'index.html'), 'utf8').matchAll(
  /<script\b[^>]*type="module"[^>]*src="[^"]*?js\/([^"\/]+\.js)"[^>]*>\s*<\/script>/g
)].map(m => m[1]);
if (!files.length) throw new Error('sync-contract: index.html 中未找到 module script 列表');
const modOrder = Object.fromEntries(files.map((f, i) => [f.replace(/\.js$/, ''), i]));

const IMPORT_RE = /^ {2}import\s*\{([^}]*)\}\s*from\s*'([^']+)'\s*;/gm;
const deps = {};   // 源模块名 -> { 导入方模块名: 名字数 }
for (const f of files) {
  const mod = f.replace(/\.js$/, '');
  const src = readFileSync(join(jsDir, f), 'utf8');
  // 格式兜底：import 若未命中规范形态（两空格缩进 + 花括号 + 单引号 + 分号），IMPORT_RE 会静默漏算被依赖名单——在此显式告警
  const looseCnt = [...src.matchAll(/^\s*import[\s{'"*]/gm)].length;
  const strictCnt = [...src.matchAll(IMPORT_RE)].length;
  if (looseCnt > strictCnt) console.warn(`sync-contract 警告: ${f} 存在未命中规范形态的 import（缩进/引号/分号），被依赖计数可能漏算`);
  for (const m of src.matchAll(IMPORT_RE)) {
    const srcMod = m[2].replace(/^\.\//, '').replace(/\.js$/, '');
    if (!modOrder.hasOwnProperty(srcMod)) continue;   // 跨目录/外部导入不在契约范围
    const cnt = m[1].split(',').filter(s => s.trim()).length;
    if (!deps[srcMod]) deps[srcMod] = {};
    deps[srcMod][mod] = (deps[srcMod][mod] || 0) + cnt;
  }
}

function depLine(mod) {
  const parts = Object.entries(deps[mod] || {})
    .filter(([, c]) => c > 0)
    .sort((a, b) => modOrder[a[0]] - modOrder[b[0]])
    .map(([m, c]) => `${m}(${c} 名)`);
  return '  // 被依赖：' + (parts.length ? parts.join(' ') : '（暂无）');
}

const changed = [];
for (const f of files) {
  const mod = f.replace(/\.js$/, '');
  const p = join(jsDir, f);
  const src = readFileSync(p, 'utf8');
  const want = depLine(mod);
  const re = /^ {2}\/\/ 被依赖：.*$/m;
  const has = re.test(src);
  let out;
  if (has) out = src.replace(re, want.replace(/\$/g, '$$$$'));
  else {
    const lines = src.split('\n');
    lines.splice(1, 0, '', want);   // 标题行后插入
    out = lines.join('\n');
  }
  if (out !== src) {
    changed.push(f);
    if (!CHECK) writeFileSync(p, out);
  }
}

if (CHECK) {
  if (changed.length) {
    console.log(`sync-contract --check: ${changed.length} 个文件头部契约过期 ->\n  ` + changed.join('\n  '));
    process.exit(1);
  }
  console.log(`sync-contract --check: 全部 ${files.length} 个模块头部契约与 import 实况一致`);
} else {
  console.log(`sync-contract: 重写 ${changed.length} 个文件头部契约（共 ${files.length} 个模块）` + (changed.length ? ' ->\n  ' + changed.join('\n  ') : ''));
}
