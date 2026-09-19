#!/usr/bin/env node
/**
 * check-names —— 顶层命名一致性检查（并行修改安全闸门）
 *
 * 本项目为 ES modules 多脚本结构，并行修改最典型的事故：
 *   - 两个窗口各自新增顶层名字导致重名 / 大小写碰撞
 *   - A 文件改名/删除导出，B 文件的 import 或调用点漏改（运行时才炸）
 *   - 新增名字忘了 export，使用方 ReferenceError
 *   - 使用了外部名字忘了写 import（经典全局时代的遗留习惯）
 *   - 顶层声明缩进漂移（本工具按 2 空格缩进识别顶层声明，漂移 = 名字对工具链隐形）
 *
 * 静态扫描全部 js/NN-*.js：
 *   1. 精确重名（同名词出现在多个文件）                —— ERROR
 *   2. 大小写碰撞（如 PLAYER / player）                —— ERROR
 *   3. 顶层声明缩进漂移（深度 0 但缩进 ≠ 2 空格）      —— ERROR
 *   4. import/export 契约（迁移后自动启用）：
 *      - 每个 import 的名字必须被来源文件 export        —— ERROR
 *      - export 块中不得出现未在本文件声明的名字        —— ERROR
 *   5. 完整性（迁移后自动启用）：
 *      - 代码中使用的每个外部顶层名必须被 import        —— ERROR
 *      - 被其他文件使用的顶层名必须被 export            —— ERROR
 *
 * 用法：node tools/check-names.js    （npm run check）
 * 退出码：0 = 通过；1 = 存在问题
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'js');

// 顶层声明：2 空格缩进（项目约定），允许行首 JSDoc 注释前缀（/** @type {Array} */ let x = ...）
const DECL_RE = /^ {2}(?:\/\*\*.*?\*\/\s*)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;
// 顶层声明缩进漂移：0 列或 3+ 空格起头的声明（深度 0 处）——会让名字对本工具链隐形
const DECL_DRIFT_RE = /^(?: {0}| {3,})(?:\/\*\*.*?\*\/\s*)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;
const IMPORT_RE = /^ {2}import\s*\{([^}]*)\}\s*from\s*'([^']+)'\s*;/;
const EXPORT_START_RE = /^ {2}export\s*\{$/;
const EXPORT_INLINE_RE = /^ {2}export\s*\{([^}]*)\}\s*;/;
const EXPORT_END_RE = /^ {2}\};$/;

function listScriptFiles() {
  return readdirSync(jsDir)
    .filter(f => /^\d{2}-.*\.js$/.test(f))
    .sort();
}

// 字符/模板感知的注释与字符串内容剥离（模板字面量保留：${} 内有真实引用）
function scrub(text) {
  let out = '', inBlock = false, q = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inBlock) {
      if (c === '*' && n === '/') { inBlock = false; i++; out += ' '; }
      else if (c === '\n') out += '\n';
      continue;
    }
    if (q === "'" || q === '"') {
      if (c === '\\') { i++; continue; }
      if (c === q) { q = null; out += c; }
      continue;
    }
    if (q === '`') {
      if (c === '\\') { out += c + n; i++; continue; }
      if (c === '`') q = null;
      out += c;
      continue;
    }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; out += c; continue; }
    out += c;
  }
  return out;
}

// 逐行行首括号深度（与 scrub 同状态机：忽略注释/字符串中的括号）
function lineDepths(text) {
  const depths = [];
  let depth = 0, inBlock = false, q = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inBlock) {
      if (c === '*' && n === '/') { inBlock = false; i++; }
      else if (c === '\n') depths.push(depth);
      continue;
    }
    if (q === "'" || q === '"') {
      if (c === '\\') { i++; continue; }
      if (c === q) q = null;
      if (c === '\n') depths.push(depth);
      continue;
    }
    if (q === '`') {
      if (c === '\\') { i++; continue; }
      if (c === '`') q = null;
      if (c === '\n') depths.push(depth);
      continue;
    }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; depths.push(depth); continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (c === '\n') depths.push(depth);
  }
  depths.push(depth);
  return depths;
}

function parseFile(name) {
  const raw = readFileSync(join(jsDir, name), 'utf8');
  const lines = raw.split(/\r?\n/);
  const depths = lineDepths(raw);
  const decls = [];    // { name, line }
  const drifts = [];   // { name, line }
  const imports = [];  // { names: [], from, line }
  const exports = [];  // names
  let inExportBlock = false;
  lines.forEach((text, i) => {
    const lineNo = i + 1;
    const line = text.replace(/\r$/, '');
    const startDepth = i === 0 ? 0 : depths[i - 1];   // 行首深度 = 上一行末深度
    let m = line.match(DECL_RE);
    if (m) decls.push({ name: m[1], line: lineNo });
    m = line.match(DECL_DRIFT_RE);
    if (m && startDepth === 0) drifts.push({ name: m[1], line: lineNo });
    m = line.match(IMPORT_RE);
    if (m) imports.push({ names: m[1].split(',').map(s => s.trim()).filter(Boolean), from: m[2], line: lineNo });
    if (inExportBlock) {
      if (EXPORT_END_RE.test(line)) inExportBlock = false;
      else exports.push(...line.replace(/,/g, ' ').split(/\s+/).filter(Boolean));
      return;
    }
    m = line.match(EXPORT_INLINE_RE);
    if (m) { exports.push(...m[1].split(',').map(s => s.trim()).filter(Boolean)); return; }
    if (EXPORT_START_RE.test(line)) inExportBlock = true;
  });
  return { name, lines, code: scrub(raw), decls, drifts, imports, exports };
}

const problems = [];
function err(msg) { problems.push(msg); }

const files = listScriptFiles().map(parseFile);

// ---- 1. 精确重名 ----
const owner = new Map(); // name -> { file, line }
for (const f of files) {
  for (const d of f.decls) {
    if (owner.has(d.name)) {
      const prev = owner.get(d.name);
      err(`[精确重名] "${d.name}" 同时声明于 ${prev.file}:${prev.line} 与 ${f.name}:${d.line}`);
    } else {
      owner.set(d.name, { file: f.name, line: d.line });
    }
  }
}

// ---- 2. 大小写碰撞 ----
const byLower = new Map();
for (const name of owner.keys()) {
  const lower = name.toLowerCase();
  if (!byLower.has(lower)) byLower.set(lower, new Set());
  byLower.get(lower).add(name);
}
for (const [, names] of byLower) {
  if (names.size > 1) {
    const detail = [...names].map(n => `"${n}" @${owner.get(n).file}:${owner.get(n).line}`).join('  ');
    err(`[大小写碰撞] 以下顶层名仅大小写不同，极易混淆：${detail}`);
  }
}

// ---- 3. 顶层声明缩进漂移 ----
for (const f of files) {
  for (const d of f.drifts) {
    if (owner.get(d.name)?.file === f.name) continue;   // 正常声明（已在 2 空格处登记）
    err(`[缩进漂移] ${f.name}:${d.line} 顶层声明 "${d.name}" 未使用 2 空格缩进——本工具链按 2 空格识别顶层，漂移名字会逃过 export/import 检查`);
  }
}

// ---- 4/5. import/export 契约 + 完整性（迁移后自动启用） ----
const migrated = files.some(f => f.imports.length > 0);
if (migrated || process.argv.includes('--imports')) {
  const fileByName = new Map(files.map(f => [f.name, f]));
  const imported = new Map();   // file -> Set(name)

  for (const f of files) {
    const mine = new Set(f.imports.flatMap(imp => imp.names));
    imported.set(f.name, mine);
    for (const imp of f.imports) {
      const targetName = imp.from.replace(/^\.?\//, '');
      const target = fileByName.get(targetName);
      if (!target) { err(`[import 失配] ${f.name}:${imp.line} 引用了不存在的脚本 "${imp.from}"`); continue; }
      const exported = new Set(target.exports);
      for (const n of imp.names) {
        if (!exported.has(n)) {
          err(`[import 失配] ${f.name}:${imp.line} 从 ${targetName} 导入的 "${n}" 未被其 export（对方改名/删除了？）`);
        }
      }
    }
    const declared = new Set(f.decls.map(d => d.name));
    for (const n of f.exports) {
      if (!declared.has(n)) {
        err(`[export 失配] ${f.name} export 的 "${n}" 未在本文件声明`);
      }
    }
  }

  // 完整性：每个被使用的外部顶层名必须被 import；被外部使用的名字必须被 export
  const keyLineRe = /^ {2,}[A-Za-z_$][\w$]*\s*:/;   // 行首 `name:` 视为对象字面量键而非绑定引用
  for (const f of files) {
    const codeLines = f.code.split('\n');
    const have = imported.get(f.name);
    const usedExternally = new Set();   // 本文件用到的、属于其他文件的名字
    for (const [name, o] of owner) {
      if (o.file === f.name) continue;
      const re = new RegExp(`(?<![A-Za-z0-9_$.])${name}(?![A-Za-z0-9_$])`);
      let used = false;
      for (let i = 0; i < codeLines.length; i++) {
        if (!re.test(codeLines[i])) continue;
        const keyM = codeLines[i].match(keyLineRe);
        if (keyM && keyM[0].trim().replace(/\s*:$/, '') === name) continue;   // 对象键位
        used = true;
        break;
      }
      if (!used) continue;
      usedExternally.add(name);
      if (!have.has(name)) {
        err(`[缺少 import] ${f.name} 使用了 ${o.file} 的 "${name}" 但未 import（运行时 ReferenceError）`);
      }
      const exported = new Set(fileByName.get(o.file).exports);
      if (!exported.has(name)) {
        err(`[缺少 export] ${f.name} 使用了 ${o.file} 的 "${name}"，但对方未 export`);
      }
    }
  }
}

// ---- 报告 ----
if (problems.length) {
  console.error(`✗ check-names 发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
} else {
  const mode = migrated ? 'modules（契约 + 完整性校验）' : 'classic（重名 + 大小写碰撞）';
  console.log(`✓ check-names 通过：${files.length} 个文件，${owner.size} 个顶层名，模式：${mode}`);
}
