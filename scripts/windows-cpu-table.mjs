// Merges the cpu-study.json files of a windows-cpu run into one Markdown report.
//
//   node scripts/windows-cpu-table.mjs <dir>
//
// Releases come first in version order, then the test builds. Numbers are % of one core,
// summed over Daybloom and its WebView2 processes; renderers are in start order (the
// planner's first, then the widget's).

import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? 'studies');
const files = [];
(function walk(d) {
  for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'cpu-study.json') files.push(p);
  }
})(dir);

const STATES = { a: 'planner + widget', b: 'planner in tray + widget', c: 'planner minimised + widget', d: 'planner in tray, no widget' };
const version = (l) => (l.match(/^v(\d+)\.(\d+)\.(\d+)$/) ?? []).slice(1).map(Number);
const rank = (l) => {
  const v = version(l);
  return v.length ? v[0] * 1e6 + v[1] * 1e3 + v[2] : 1e9;
};
const studies = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))).sort((x, y) => rank(x.label) - rank(y.label) || x.label.localeCompare(y.label));

let md = '## Idle CPU by build\n\n% of one core (100 = one core), Daybloom plus its WebView2 processes, on a 2-vCPU GitHub runner with no GPU (WebView2 draws in software, so absolute numbers run high; compare rows).\n\n';
md += `| Build | ${Object.values(STATES).join(' | ')} |\n|---|${Object.keys(STATES).map(() => '---:').join('|')}|\n`;
for (const s of studies) {
  const cells = Object.keys(STATES).map((k) => {
    const r = s.study.find((x) => x.state === k);
    return r ? `**${r.total}**` : '–';
  });
  md += `| ${s.label} | ${cells.join(' | ')} |\n`;
}

md += '\n### By process\n\n| Build | State | Total | daybloom.exe | WebView2 browser | GPU | Renderers (planner / widget / …) | Other | Private MB |\n|---|---|---:|---:|---:|---:|---|---:|---:|\n';
for (const s of studies) {
  for (const r of s.study) md += `| ${s.label} | (${r.state}) ${STATES[r.state]} | ${r.total} | ${r.app} | ${r.browser} | ${r.gpu} | ${r.renderers.join(' / ') || '–'} | ${r.other} | ${r.privateMB} |\n`;
}

const anim = studies.filter((s) => s.animations && Object.keys(s.animations).length);
if (anim.length) {
  md += '\n### Running animations in state (a)\n\n';
  for (const s of anim) {
    for (const [page, list] of Object.entries(s.animations)) {
      const items = Object.entries(list).map(([k, n]) => `${n}× ${k}`);
      md += `- **${s.label}**, ${page === 'main' ? 'planner' : page}: ${items.join('; ') || 'none'}\n`;
    }
  }
}

if (!studies.length) md += '\nNo cpu-study.json files found.\n';
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
fs.writeFileSync(path.join(dir, 'cpu-table.md'), md);
