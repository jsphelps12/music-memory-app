// Which components the React Compiler optimizes and which it skips (and why).
// Usage: NODE_PATH=node_modules node scripts/react-compiler-check.js .
// Skipped components run exactly as before, just without auto-memoization.
const babel = require("@babel/core");
const fs = require("fs"); const path = require("path");
const root = process.argv[2];
const files = [];
(function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name); if (e.isDirectory()) { if (!["__tests__","node_modules"].includes(e.name)) walk(p);} else if (/\.tsx$/.test(e.name)) files.push(p);} })(path.join(root,"app")); (function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name); if (e.isDirectory()) walk(p); else if (/\.tsx$/.test(e.name)) files.push(p);} })(path.join(root,"components"));
let ok=0, fail=0; const reasons={};
for (const f of files) {
  const events=[];
  try {
    babel.transformSync(fs.readFileSync(f,"utf8"), { filename:f, babelrc:false, configFile:false,
      presets:[[require.resolve("@babel/preset-typescript"),{isTSX:true,allExtensions:true}]],
      plugins:[require.resolve("@babel/plugin-syntax-jsx"), [require.resolve("babel-plugin-react-compiler"), { logger:{ logEvent:(fn,e)=>events.push(e) } }]] });
  } catch(e) { events.push({kind:"CompileError", detail:{reason:String(e.message).split("\n")[0]}}); }
  for (const e of events) {
    if (e.kind==="CompileSuccess") ok++;
    if (e.kind==="CompileError"||e.kind==="CompileDiagnostic"||e.kind==="PipelineError") { fail++; const r=(e.detail?.reason||e.detail?.options?.reason||e.data||e.kind)+""; const k=r.slice(0,90); (reasons[k]=reasons[k]||[]).push(path.relative(root,f)); }
  }
}
console.log(`compiled functions: ${ok}, skipped: ${fail}`);
for (const [r,fs_] of Object.entries(reasons).sort((a,b)=>b[1].length-a[1].length)) console.log(`${fs_.length}× ${r}\n    ${[...new Set(fs_)].slice(0,6).join(", ")}`);
