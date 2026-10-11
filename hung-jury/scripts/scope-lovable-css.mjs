// One-off: scope Lovable's styles.css under .lj so it cannot leak into other pages.
import fs from 'node:fs';
import postcss from 'postcss';
const src = fs.readFileSync(process.argv[2], 'utf8');
const root = postcss.parse(src);
root.walkAtRules((r) => {
  if (['import', 'source', 'custom-variant', 'theme'].includes(r.name)) r.remove();
});
const scope = (sel) =>
  sel.split(',').map((s) => {
    s = s.trim();
    if (s === ':root') return s;
    if (s === 'body' || s === 'html') return '.lj';
    if (s === '*') return '.lj, .lj *';
    if (s.startsWith('body ')) return '.lj ' + s.slice(5);
    return '.lj ' + s;
  }).join(', ');
root.walkRules((rule) => {
  let p = rule.parent, inKey = false;
  while (p && p.type !== 'root') { if (p.type === 'atrule' && /keyframes/.test(p.name)) inKey = true; p = p.parent; }
  if (inKey) return;
  rule.selector = scope(rule.selector);
});
fs.writeFileSync(process.argv[3], root.toString());
