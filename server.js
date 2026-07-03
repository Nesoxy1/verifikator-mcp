#!/usr/bin/env node
/* ============================================================
   VERIFIKATOR-MCP — deterministička kapija za AI agent harnesse
   MCP stdio server, Node 18+, BEZ zavisnosti.

   Alati:
     validate_html / validate_smd  — pravi Zig/WASM validator
     heal                          — MAS prsten: popravi pa dokaži merenjem
     sign_artifact / verify_artifact — SHA-256 + ECDSA P-256 poreklo
     remember_lesson / recall_lessons — memorija koja prima lekciju
                                        SAMO uz priložen dokaz (before/after)
     audit_url                     — agent-readiness provera sajta

   Priključivanje (Claude Desktop / bilo koji MCP klijent):
     { "mcpServers": { "verifikator": { "command": "node", "args": ["putanja/do/server.js"] } } }
============================================================ */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(os.homedir(), ".verifikator-mcp");
fs.mkdirSync(DIR, { recursive: true });

/* ---------- PRAVI WASM VALIDATOR ---------- */
const { instance } = await WebAssembly.instantiate(fs.readFileSync(path.join(HERE, "validator.wasm")), {});
const W = instance.exports;
function wasmRun(text, fn){
  const b = new TextEncoder().encode(text);
  if (b.length > W.getMaxInput()) throw new Error("Ulaz veći od WASM bafera (256 KB)");
  new Uint8Array(W.memory.buffer).set(b, W.getInputPtr());
  const c = W[fn](b.length);
  const out = [];
  for (let i = 0; i < c; i++) out.push({ code: W.getErrorCode(i), line: W.getErrorLine(i) });
  return out;
}
const vHtml = t => wasmRun(t, "validate");
const vSmd  = t => wasmRun(t, "validateSmd");
const vfnFor = mode => mode === "smd" ? vSmd : vHtml;

const TAGS = ["div","section","nav","header","footer","main","h1","h2","h3","p","a","ul","li","span","form","style","title","body","html","head"];
function opis(code, line){
  const L = line ? ` (linija ${line})` : "";
  if (code >= 200 && code < 200 + TAGS.length) return `tag </${TAGS[code-200]}> zatvoren više puta nego otvoren`;
  if (code >= 100 && code < 100 + TAGS.length) return `tag <${TAGS[code-100]}> otvoren a nije zatvoren`;
  const M = { 3:`<img> bez alt atributa${L}`, 4:`nesiguran http:// link${L}`, 5:`Markdown slika ![]()${L} — zabranjen obrazac`,
              6:`prazan href=""${L}`, 7:`<script> tag${L}`, 8:`nezatvoren HTML komentar${L}`,
              20:`YAML dvotačka umesto Ziggy '='${L}`, 21:`string bez navodnika u front-matteru${L}`,
              22:`datum mora biti YYYY-MM-DD bez navodnika${L}`, 23:`front-matter nije ograničen sa ---`,
              24:`$image/$video bez .asset('/.url('${L}` };
  return M[code] || `nepoznat nalaz #${code}${L}`;
}
const describe = errs => errs.map(e => ({ code: e.code, line: e.line, opis: opis(e.code, e.line) }));

/* ---------- MAS PRSTEN (deterministički, Critic meri kroz WASM) ---------- */
function masPropose(text, errs, mode){
  const P = [];
  for (const e of errs){
    let p = null;
    if (e.code === 3){ const m = text.match(/<img(?![^>]*\salt=)([^>]*)>/i); if (m) p = { find:m[0], replace:`<img${m[1]} alt="Slika">`, opis:"dodat alt" }; }
    else if (e.code === 4){ p = { find:"http://", replace:"https://", opis:"http → https" }; }
    else if (e.code === 5 && mode === "smd"){ const m = text.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      if (m) p = { find:m[0], replace: m[2].startsWith("http") ? `[${m[1]||"Slika"}]($image.url('${m[2]}'))` : `[${m[1]||"Slika"}]($image.asset('${m[2].split("/").pop()}'))`, opis:"md slika → Scripty" }; }
    else if (e.code === 5){ const m = text.match(/!\[([^\]]*)\]\(([^)]+)\)/); if (m) p = { find:m[0], replace:`<img src="${m[2]}" alt="${m[1]||"Slika"}">`, opis:"md slika → <img>" }; }
    else if (e.code === 6){ p = { find:'href=""', replace:'href="#"', opis:"popunjen prazan href" }; }
    else if (e.code === 7){ const m = text.match(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>/i); if (m) p = { find:m[0], replace:"", opis:"uklonjen <script>" }; }
    else if (e.code === 8){ p = { append:true, replace:"\n-->", opis:"zatvoren komentar" }; }
    else if (e.code === 20){ p = { custom:h=>h.replace(/^([ \t]*[A-Za-z_][\w]*)[ \t]*:[ \t]*(.+)$/m, (mm,k,v)=>{ v=v.trim(); const nq=/^(true|false|-?\d+(\.\d+)?|\d{4}-\d{2}-\d{2})$/.test(v)||(v.startsWith('"')&&v.endsWith('"')); return `${k} = ${nq?v:'"'+v+'"'}`; }), opis:"dvotačka → =" }; }
    else if (e.code === 21){ p = { custom:h=>h.replace(/^([ \t]*[A-Za-z_][\w]*)[ \t]*=[ \t]*([^"\n][^\n]*)$/m, (mm,k,v)=>{ v=v.trim(); const nq=/^(true|false|-?\d+(\.\d+)?|\d{4}-\d{2}-\d{2})$/.test(v); return `${k} = ${nq?v:'"'+v+'"'}`; }), opis:"navodnici oko stringa" }; }
    else if (e.code === 22){ p = { custom:h=>h.replace(/^([ \t]*date[ \t]*=[ \t]*)"?(\d{4}-\d{2}-\d{2})"?[ \t]*$/m, "$1$2").replace(/^([ \t]*date[ \t]*=[ \t]*)"[^"\n]*"[ \t]*$/m, `$1${new Date().toISOString().slice(0,10)}`), opis:"datum bez navodnika" }; }
    else if (e.code === 24){ p = { custom:h=>h.replace(/\$(image|video)\((')/g, "$$$1.asset($2"), opis:"$image → .asset(" }; }
    else if (e.code >= 100 && e.code < 100 + TAGS.length){ const t = TAGS[e.code-100];
      p = text.includes("</body>") ? { find:"</body>", replace:`</${t}>\n</body>`, opis:`zatvoren <${t}>` } : { append:true, replace:`</${t}>`, opis:`zatvoren <${t}>` }; }
    else if (e.code >= 200 && e.code < 200 + TAGS.length){ const t = TAGS[e.code-200];
      p = { custom:h=>{ const i = h.lastIndexOf(`</${t}>`); return i < 0 ? h : h.slice(0,i) + h.slice(i + t.length + 3); }, opis:`uklonjen višak </${t}>` }; }
    if (p) P.push({ err:e, ...p });
  }
  return P;
}
const masApply = (t,p)=> p.custom ? p.custom(t) : (p.append ? t + p.replace : t.replace(p.find, p.replace));

function heal(content, mode){
  const vfn = vfnFor(mode);
  let current = content, applied = [], fromMemory = 0;
  let remaining = vfn(current);
  const knownCodes = new Set(Object.keys((MEM.lessons[mode] || {})).map(Number));
  for (let round = 1; round <= 3 && remaining.length; round++){
    let progress = false;
    for (const p of masPropose(current, remaining, mode)){
      const before = vfn(current).length;
      const cand = masApply(current, p);
      const after = vfn(cand).length;
      if (after < before && cand !== current){
        const mem = knownCodes.has(p.err.code);
        if (mem){ fromMemory++; MEM.stats.hits++; }
        applied.push({ code: p.err.code, popravka: p.opis, mereno: `${before} → ${after}`, iz_memorije: mem });
        current = cand;
        progress = true;
      }
    }
    remaining = vfn(current);
    if (!progress) break;
  }
  /* verifikovane lekcije se automatski beleže */
  for (const a of applied){
    MEM.lessons[mode] = MEM.lessons[mode] || {};
    const l = MEM.lessons[mode][a.code];
    if (l) l.uses++; else { MEM.lessons[mode][a.code] = { uses:1, learned:new Date().toISOString() }; MEM.stats.stored++; }
  }
  memSave();
  return { healed: current, popravki: applied.length, iz_memorije: fromMemory, primenjeno: applied, preostalo: describe(remaining), zero_error: remaining.length === 0 };
}

/* ---------- VERIFIKOVANA MEMORIJA ---------- */
const MEMFILE = path.join(DIR, "memory.json");
let MEM = { lessons: {}, stats: { stored:0, hits:0, rejected:0 } };
try{ MEM = JSON.parse(fs.readFileSync(MEMFILE, "utf8")); }catch{}
const memSave = ()=> { try{ fs.writeFileSync(MEMFILE, JSON.stringify(MEM, null, 2)); }catch{} };

/* ---------- KRIPTOGRAFIJA (poreklo artefakata) ---------- */
const KEYFILE = path.join(DIR, "keys.json");
async function getKeys(){
  try{
    const j = JSON.parse(fs.readFileSync(KEYFILE, "utf8"));
    const priv = await crypto.subtle.importKey("jwk", j.priv, { name:"ECDSA", namedCurve:"P-256" }, true, ["sign"]);
    return { priv, pubJwk: j.pub };
  }catch{}
  const kp = await crypto.subtle.generateKey({ name:"ECDSA", namedCurve:"P-256" }, true, ["sign","verify"]);
  const pub = await crypto.subtle.exportKey("jwk", kp.publicKey);
  const priv = await crypto.subtle.exportKey("jwk", kp.privateKey);
  try{ fs.writeFileSync(KEYFILE, JSON.stringify({ pub, priv })); }catch{}
  return { priv: kp.privateKey, pubJwk: pub };
}
async function sha256hex(s){
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

/* ---------- AUDIT (pojednostavljene provere, bez DOM parsera) ---------- */
async function fetchText(url){
  try{
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), 10000);
    const r = await fetch(url, { signal: ctrl.signal, redirect:"follow", headers:{ "User-Agent":"Mozilla/5.0 (compatible; VerifikatorMCP/1.0)" } });
    clearTimeout(t);
    return { status: r.status, finalUrl: r.url, body: (await r.text()).slice(0, 500000) };
  }catch(e){ return { status: 0, finalUrl: url, body: "", error: String(e.message || e) }; }
}
async function auditUrl(url){
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const page = await fetchText(url);
  if (!page.status || page.status >= 400) return { greska: page.error || ("HTTP " + page.status) };
  const origin = new URL(page.finalUrl).origin;
  const [robots, llms] = await Promise.all([fetchText(origin + "/robots.txt"), fetchText(origin + "/llms.txt")]);
  const b = page.body;
  const text = b.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
  const aiBots = ["GPTBot","ClaudeBot","PerplexityBot","Google-Extended","CCBot"];
  const blocked = robots.status === 200 ? aiBots.filter(bot => new RegExp("User-agent:\\s*" + bot + "[\\s\\S]{0,200}?Disallow:\\s*/\\s*$", "im").test(robots.body)) : [];
  const nalazi = {
    https: page.finalUrl.startsWith("https://"),
    sadrzaj_bez_js_znakova: text.length,
    spa_rizik: text.length < 400,
    json_ld: /application\/ld\+json/i.test(b),
    llms_txt: llms.status === 200 && llms.body.trim().length > 20 && !llms.body.trim().startsWith("<"),
    meta_description: /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{30,}/i.test(b),
    tel_link: /href=["']tel:/i.test(b),
    mailto_link: /href=["']mailto:/i.test(b),
    ai_botovi_blokirani: blocked
  };
  let score = 0;
  if (nalazi.https) score += 10;
  if (!nalazi.spa_rizik) score += 25;
  if (nalazi.json_ld) score += 20;
  if (nalazi.llms_txt) score += 15;
  if (nalazi.meta_description) score += 10;
  if (nalazi.tel_link) score += 5;
  if (nalazi.mailto_link) score += 5;
  if (!blocked.length) score += 10;
  return { url: page.finalUrl, ocena: score, maksimum: 100, nalazi, napomena: "Pojednostavljena serverska provera; puni audit sa 11 provera radi Agent Audit alat." };
}

/* ---------- ALATI ---------- */
const S_OBJ = (props, req) => ({ type:"object", properties: props, required: req });
const TOOLS = {
  validate_html: {
    description: "Deterministička provera HTML-a u pravom Zig/WASM validatoru: neupareni tagovi, img bez alt, http:// linkovi, markdown slike, <script> (JSON-LD dozvoljen), prazan href, nezatvoren komentar. Vraća nalaze sa linijama.",
    inputSchema: S_OBJ({ html:{ type:"string", description:"HTML sadržaj za proveru" } }, ["html"]),
    handler: a => ({ nalaza: vHtml(a.html).length, nalazi: describe(vHtml(a.html)), zero_error: vHtml(a.html).length === 0 })
  },
  validate_smd: {
    description: "Provera SuperMD (.smd) dokumenta za Zine SSG: Ziggy front-matter pravila (= umesto :, navodnici, datumi), zabranjene markdown slike, Scripty direktive.",
    inputSchema: S_OBJ({ smd:{ type:"string", description:"SuperMD sadržaj" } }, ["smd"]),
    handler: a => ({ nalaza: vSmd(a.smd).length, nalazi: describe(vSmd(a.smd)), zero_error: vSmd(a.smd).length === 0 })
  },
  heal: {
    description: "Self-healing MAS prsten: validira sadržaj, predlaže minimalne patch-eve, svaki patch MERI kroz WASM (broj nalaza pre/posle) i primenjuje samo ono što dokazano smanjuje kvar. Verifikovane popravke automatski postaju lekcije u memoriji.",
    inputSchema: S_OBJ({ content:{ type:"string" }, mode:{ type:"string", enum:["html","smd"], description:"vrsta sadržaja (podrazumevano html)" } }, ["content"]),
    handler: a => heal(a.content, a.mode === "smd" ? "smd" : "html")
  },
  sign_artifact: {
    description: "Kriptografsko poreklo artefakta: SHA-256 heš + ECDSA P-256 potpis (ključ nastaje lokalno u ~/.verifikator-mcp i ne napušta mašinu). Vraća manifest za kasniju verifikaciju.",
    inputSchema: S_OBJ({ content:{ type:"string" }, signed_by:{ type:"string", description:"ime agenta/autora" } }, ["content"]),
    handler: async a => {
      const { priv, pubJwk } = await getKeys();
      const hash = await sha256hex(a.content);
      const sig = await crypto.subtle.sign({ name:"ECDSA", hash:"SHA-256" }, priv, new TextEncoder().encode(hash));
      return { manifest: { signed_by: a.signed_by || "nepoznat", generated: new Date().toISOString(),
               algorithm: "SHA-256 + ECDSA P-256", sha256: hash, public_key_jwk: pubJwk,
               signature: Buffer.from(sig).toString("base64") } };
    }
  },
  verify_artifact: {
    description: "Provera porekla: da li sadržaj odgovara manifestu (heš) i da li je potpis validan (javni ključ iz manifesta). Detektuje svaku izmenu posle potpisivanja.",
    inputSchema: S_OBJ({ content:{ type:"string" }, manifest:{ type:"object" } }, ["content","manifest"]),
    handler: async a => {
      const m = a.manifest;
      const hash = await sha256hex(a.content);
      if (hash !== m.sha256) return { ok:false, razlog:"SHA-256 se ne poklapa — sadržaj je menjan posle potpisivanja" };
      try{
        const pub = await crypto.subtle.importKey("jwk", m.public_key_jwk, { name:"ECDSA", namedCurve:"P-256" }, false, ["verify"]);
        const ok = await crypto.subtle.verify({ name:"ECDSA", hash:"SHA-256" }, pub, Buffer.from(m.signature, "base64"), new TextEncoder().encode(hash));
        return ok ? { ok:true, signed_by: m.signed_by, generated: m.generated } : { ok:false, razlog:"ECDSA potpis nevalidan — manifest je falsifikovan" };
      }catch(e){ return { ok:false, razlog:"greška pri proveri: " + e.message }; }
    }
  },
  remember_lesson: {
    description: "Verifikovana memorija — brana protiv trovanja: lekcija se prima SAMO uz dokaz. Pošalji sadržaj pre i posle popravke; server sam validira oba i pamti isključivo kodove koji su dokazano nestali. Bez dokaza — odbijeno.",
    inputSchema: S_OBJ({ mode:{ type:"string", enum:["html","smd"] }, before:{ type:"string", description:"sadržaj PRE popravke" }, after:{ type:"string", description:"sadržaj POSLE popravke" } }, ["mode","before","after"]),
    handler: a => {
      const vfn = vfnFor(a.mode);
      const eb = new Set(vfn(a.before).map(e=>e.code));
      const ea = new Set(vfn(a.after).map(e=>e.code));
      const dokazano = [...eb].filter(c => !ea.has(c));
      if (!dokazano.length){ MEM.stats.rejected++; memSave(); return { primljeno:false, razlog:"Nema dokaza: nijedan nalaz iz 'before' nije nestao u 'after'. Lekcija odbijena." }; }
      MEM.lessons[a.mode] = MEM.lessons[a.mode] || {};
      for (const c of dokazano){
        const l = MEM.lessons[a.mode][c];
        if (l) l.uses++; else { MEM.lessons[a.mode][c] = { uses:1, learned:new Date().toISOString() }; MEM.stats.stored++; }
      }
      memSave();
      return { primljeno:true, nauceni_kodovi: dokazano, opisi: dokazano.map(c=>opis(c, 0)) };
    }
  },
  recall_lessons: {
    description: "Pregled verifikovane memorije: koje lekcije postoje, koliko puta su korišćene, statistika (uskladišteno/pogodaka/odbijeno).",
    inputSchema: S_OBJ({ mode:{ type:"string", enum:["html","smd"], description:"opciono filtriranje" } }, []),
    handler: a => ({ lekcije: a.mode ? (MEM.lessons[a.mode] || {}) : MEM.lessons, statistika: MEM.stats })
  },
  audit_url: {
    description: "Agent-readiness provera sajta: dohvata URL i meri vidljivost za AI agente (sadržaj bez JS, JSON-LD, llms.txt, robots.txt blokade AI botova, kontakt linkovi). Vraća ocenu 0-100.",
    inputSchema: S_OBJ({ url:{ type:"string" } }, ["url"]),
    handler: a => auditUrl(a.url)
  }
};

/* ---------- MCP STDIO PETLJA ---------- */
const toolList = Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema }));
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) !== -1){
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg; try{ msg = JSON.parse(line); }catch{ continue; }
    if (msg.id === undefined) continue; // notifikacije
    handle(msg).then(result => {
      process.stdout.write(JSON.stringify({ jsonrpc:"2.0", id: msg.id, result }) + "\n");
    }).catch(e => {
      process.stdout.write(JSON.stringify({ jsonrpc:"2.0", id: msg.id, error:{ code: e.rpcCode || -32603, message: String(e.message || e) } }) + "\n");
    });
  }
});

async function handle(msg){
  if (msg.method === "initialize"){
    return { protocolVersion:"2024-11-05", capabilities:{ tools:{} }, serverInfo:{ name:"verifikator-mcp", version:"1.0.0" } };
  }
  if (msg.method === "tools/list") return { tools: toolList };
  if (msg.method === "tools/call"){
    const t = TOOLS[msg.params && msg.params.name];
    if (!t){ const e = new Error("Nepoznat alat: " + (msg.params && msg.params.name)); e.rpcCode = -32602; throw e; }
    const out = await t.handler((msg.params && msg.params.arguments) || {});
    return { content: [{ type:"text", text: JSON.stringify(out, null, 2) }] };
  }
  const e = new Error("Nepoznata metoda: " + msg.method); e.rpcCode = -32601; throw e;
}

process.stderr.write("verifikator-mcp spreman (WASM validator aktivan, " + toolList.length + " alata)\n");
