// Fail (exit 1) if src/app.html is not byte-identical to a fresh concatenation of src/app/* (manifest.json order).
// src/app.html is a GENERATED artifact: edit src/app/**, then `python3 tools/build_app.py`.
import fs from 'fs';
const root = new URL('../src/app/', import.meta.url);
const man = JSON.parse(fs.readFileSync(new URL('manifest.json', root), 'utf8')).modules;
const built = Buffer.concat(man.map(m => fs.readFileSync(new URL(m.file, root))));
const page = fs.readFileSync(new URL('../src/app.html', import.meta.url));
if (!built.equals(page)) {
  let i = 0; while (i < built.length && built[i] === page[i]) i++;
  const line = page.subarray(0, i).toString('utf8').split('\n').length;
  console.error(`src/app.html differs from build(src/app/*) at byte ${i} (line ${line}). Edit the modules and run python3 tools/build_app.py; if a legacy tool patched app.html, run python3 tools/build_app.py --absorb.`);
  process.exit(1);
}
console.log('ok generated', man.length, 'modules', page.length, 'bytes');
