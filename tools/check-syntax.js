// 全量 ESM 语法校验：逐个以 ES module 模式解析 js/ 下全部脚本（并行窗口保存竞态的坏文件当场暴露）
// 用法：npm run check-syntax
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';

const dir = join(process.cwd(), 'js');
const files = readdirSync(dir).filter(f => f.endsWith('.js')).sort();
let bad = 0;
for (const f of files) {
  const tmp = join(tmpdir(), `check-syntax_${f}.mjs`);   // .mjs 强制按 ESM 解析（与浏览器 <script type="module"> 一致）
  writeFileSync(tmp, readFileSync(join(dir, f), 'utf8'));
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    console.log(`  ✓ ${f}`);
  } catch (e) {
    bad++;
    console.error(`  ✗ ${f}\n${e.stderr}`);
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}
if (bad) { console.error(`check-syntax 失败：${bad} 个文件语法错误`); process.exit(1); }
console.log(`✓ check-syntax 通过：${files.length} 个文件 ESM 语法全部合法`);
