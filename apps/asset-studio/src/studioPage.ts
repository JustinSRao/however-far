/**
 * The Studio's single-page UI, served inline by studio.ts. Plain HTML/JS on
 * purpose — the gate logic all lives server-side in packages/art + checks.ts;
 * this page only uploads, previews, and reports.
 */
export const STUDIO_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>However Far — Asset Studio</title>
<style>
  :root {
    --bg: #0b0c12; --panel: #14161f; --edge: #2c2f3f;
    --text: #e8e6df; --dim: #9a97a8; --accent: #ffcd75;
    --ok: #a7f070; --warn: #ffcd75; --err: #b13e53;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--bg); color: var(--text);
    font-family: ui-monospace, Consolas, monospace;
    padding: 24px; max-width: 1100px; margin: 0 auto;
  }
  h1 { font-size: 18px; letter-spacing: 0.04em; margin-bottom: 4px; }
  h1 span { color: var(--accent); }
  .sub { color: var(--dim); font-size: 12px; margin-bottom: 20px; }
  .controls {
    display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end;
    background: var(--panel); border: 1px solid var(--edge); border-radius: 8px;
    padding: 16px; margin-bottom: 16px;
  }
  label { display: block; font-size: 11px; color: var(--dim); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.08em; }
  select, .check {
    background: var(--bg); color: var(--text); border: 1px solid var(--edge);
    border-radius: 4px; padding: 8px 10px; font: inherit; font-size: 13px;
  }
  .palette { display: flex; gap: 2px; margin-top: 8px; }
  .palette i { width: 16px; height: 16px; border-radius: 2px; display: inline-block; }
  .checkline { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); }
  #drop {
    border: 2px dashed var(--edge); border-radius: 8px; padding: 40px;
    text-align: center; color: var(--dim); cursor: pointer; margin-bottom: 20px;
    transition: border-color 0.15s, color 0.15s;
  }
  #drop.hover, #drop:hover { border-color: var(--accent); color: var(--accent); }
  #results { display: flex; flex-direction: column; gap: 16px; }
  .card {
    background: var(--panel); border: 1px solid var(--edge); border-radius: 8px;
    padding: 16px; display: flex; gap: 20px; flex-wrap: wrap;
  }
  .card .imgs { display: flex; gap: 20px; }
  .imgbox { text-align: center; }
  .imgbox .cap { font-size: 11px; color: var(--dim); margin-top: 6px; }
  .pix {
    image-rendering: pixelated; border: 1px solid var(--edge); border-radius: 4px;
    background:
      repeating-conic-gradient(#1c1e2a 0% 25%, #22242f 0% 50%) 0 0 / 16px 16px;
  }
  .meta { flex: 1; min-width: 260px; }
  .meta .name { font-size: 14px; margin-bottom: 8px; }
  .status { font-weight: bold; margin-bottom: 8px; }
  .status.pass { color: var(--ok); }
  .status.warn { color: var(--warn); }
  .status.fail { color: var(--err); }
  .finding { font-size: 12px; margin: 3px 0; color: var(--dim); }
  .finding b.error { color: var(--err); } .finding b.warn { color: var(--warn); }
  .dl {
    display: inline-block; margin-top: 10px; color: var(--accent);
    text-decoration: none; border: 1px solid var(--edge); border-radius: 4px;
    padding: 6px 12px; font-size: 12px;
  }
  .dl:hover { border-color: var(--accent); }
  .err-banner { color: var(--err); font-size: 13px; }
  .keep {
    margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--edge);
    display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  }
  .keep input, .keep select {
    background: #0e0f16; color: var(--text); border: 1px solid var(--edge);
    border-radius: 4px; padding: 5px 7px; font-size: 12px; font-family: inherit;
  }
  .keep input.name { width: 150px; }
  .keep input.tags { width: 120px; }
  .keep input.attrib { width: 110px; }
  .keep button {
    background: var(--accent); color: #14161f; border: 0; border-radius: 4px;
    padding: 6px 12px; font-size: 12px; font-weight: bold; cursor: pointer;
  }
  .keep button:disabled { opacity: 0.5; cursor: default; }
  .keep .note { font-size: 12px; color: var(--dim); width: 100%; }
  .keep .note.ok { color: var(--ok); }
  .keep .note.bad { color: var(--err); }
  h2 { font-size: 15px; font-weight: normal; letter-spacing: 0.1em;
       text-transform: uppercase; color: var(--dim); margin: 34px 0 10px; }
  .catalog { display: flex; flex-wrap: wrap; gap: 10px; }
  .cat {
    border: 1px solid var(--edge); border-radius: 6px; padding: 8px;
    width: 118px; text-align: center; background: #14161f;
  }
  .cat img { width: 72px; height: 72px; object-fit: contain; image-rendering: pixelated;
             background: repeating-conic-gradient(#2a2d3a 0% 25%, #1b1e29 0% 50%) 50% / 12px 12px; }
  .cat .n { font-size: 12px; margin-top: 6px; overflow-wrap: anywhere; }
  .cat .d { font-size: 11px; color: var(--dim); margin-top: 2px; }
  .empty { font-size: 13px; color: var(--dim); }
</style>
</head>
<body>
  <h1>HOWEVER FAR — <span>Asset Studio</span></h1>
  <div class="sub">drop PNGs → they run the gate (normalize → palette lock → validate) — same pipeline the game and the agents use</div>

  <div class="controls">
    <div>
      <label>style bible</label>
      <select id="style"></select>
      <div class="palette" id="palette"></div>
    </div>
    <div>
      <label>asset kind</label>
      <select id="kind">
        <option value="sprite">sprite (character)</option>
        <option value="tile">tile</option>
        <option value="portrait">portrait</option>
        <option value="item">item</option>
      </select>
    </div>
    <div>
      <label>world (for the database)</label>
      <select id="path">
        <option value="her">her — the fantasy world</option>
        <option value="his">his — the real world</option>
        <option value="shared">shared — both</option>
      </select>
    </div>
    <div>
      <label>mode</label>
      <div class="checkline check">
        <input type="checkbox" id="validateOnly" />
        <span>validate only (skip normalization)</span>
      </div>
    </div>
  </div>

  <div id="drop">drop PNG files here, or click to choose</div>
  <input type="file" id="file" accept="image/png" multiple hidden />
  <div id="results"></div>

  <h2>Asset database</h2>
  <div class="catalog" id="catalog"></div>

<script>
const styleSel = document.getElementById("style");
const paletteEl = document.getElementById("palette");
const kindSel = document.getElementById("kind");
const validateOnly = document.getElementById("validateOnly");
const pathSel = document.getElementById("path");
const drop = document.getElementById("drop");
const fileInput = document.getElementById("file");
const results = document.getElementById("results");
const catalogEl = document.getElementById("catalog");
let styles = [];

async function loadStyles() {
  styles = await (await fetch("/api/styles")).json();
  styleSel.innerHTML = "";
  for (const s of styles) {
    const opt = document.createElement("option");
    opt.value = s.file;
    opt.textContent = s.paletteName + " (" + s.gridSize + "px, " + s.outline + ")";
    styleSel.appendChild(opt);
  }
  renderPalette();
}
function renderPalette() {
  const s = styles.find((x) => x.file === styleSel.value);
  paletteEl.innerHTML = "";
  for (const c of s?.colors ?? []) {
    const i = document.createElement("i");
    i.style.background = c;
    i.title = c;
    paletteEl.appendChild(i);
  }
}
styleSel.addEventListener("change", renderPalette);

drop.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => handleFiles(fileInput.files));
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("hover"); });
drop.addEventListener("dragleave", () => drop.classList.remove("hover"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("hover");
  handleFiles(e.dataTransfer.files);
});

function handleFiles(files) {
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith(".png")) continue;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      processOne(f.name, base64, reader.result);
    };
    reader.readAsDataURL(f);
  }
}

async function processOne(name, base64, beforeDataUrl) {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = '<div class="meta"><div class="name">' + name + '</div><div class="status">running the gate…</div></div>';
  results.prepend(card);

  let body;
  try {
    const res = await fetch("/api/process", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pngBase64: base64,
        styleFile: styleSel.value,
        kind: kindSel.value,
        validateOnly: validateOnly.checked,
      }),
    });
    body = await res.json();
    if (!res.ok) throw new Error(body.error || res.status);
  } catch (err) {
    card.querySelector(".meta").innerHTML =
      '<div class="name">' + name + '</div><div class="err-banner">error: ' + err.message + "</div>";
    return;
  }

  const afterDataUrl = "data:image/png;base64," + body.processedBase64;
  const errors = body.findings.filter((f) => f.level === "error");
  const warns = body.findings.filter((f) => f.level === "warn");
  const status = errors.length ? "FAIL" : warns.length ? "PASS (with warnings)" : "PASS";
  const cls = errors.length ? "fail" : warns.length ? "warn" : "pass";
  const scale = (w) => Math.max(64, Math.min(256, w * 8));
  const safe = name.replace(/[^a-zA-Z0-9-_.]/g, "_");

  card.innerHTML =
    '<div class="imgs">' +
      '<div class="imgbox"><img class="pix" src="' + beforeDataUrl + '" style="width:' + scale(body.before.width) + 'px" /><div class="cap">before · ' + body.before.width + "×" + body.before.height + "</div></div>" +
      '<div class="imgbox"><img class="pix" src="' + afterDataUrl + '" style="width:' + scale(body.after.width) + 'px" /><div class="cap">after gate · ' + body.after.width + "×" + body.after.height + "</div></div>" +
    "</div>" +
    '<div class="meta">' +
      '<div class="name">' + name + " · " + kindSel.value + "</div>" +
      '<div class="status ' + cls + '">' + status + "</div>" +
      body.findings.map((f) => '<div class="finding"><b class="' + f.level + '">[' + f.level + "] " + f.check + ":</b> " + f.message + "</div>").join("") +
      '<a class="dl" download="' + safe.replace(/\\.png$/i, "") + '.gate.png" href="' + afterDataUrl + '">download normalized PNG</a>' +
      (errors.length ? "" : keepFormHtml(slugify(name))) +
    "</div>";

  if (!errors.length) wireKeepForm(card, base64);
}

function slugify(fileName) {
  return fileName.replace(/\\.[^.]+$/, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** The "keep this" row: what turns a gated PNG into a catalog entry. */
function keepFormHtml(suggested) {
  return '<div class="keep">' +
    '<input class="name" placeholder="catalog name" value="' + suggested + '" />' +
    '<input class="tags" placeholder="tags, comma-sep" />' +
    '<select class="src">' +
      '<option value="hand">hand-drawn</option>' +
      '<option value="cc0">CC0 pack</option>' +
      '<option value="sprite-data">sprite-as-data</option>' +
      '<option value="generated">AI generated</option>' +
    "</select>" +
    '<input class="attrib pack" placeholder="pack" hidden />' +
    '<input class="attrib author" placeholder="author" hidden />' +
    '<input class="attrib url" placeholder="url" hidden />' +
    "<button>add to database</button>" +
    '<div class="note">the database is what the game reads — CC0 art needs its pack, author and url recorded.</div>' +
  "</div>";
}

function wireKeepForm(card, base64) {
  const keep = card.querySelector(".keep");
  const srcSel = keep.querySelector(".src");
  const attribs = [...keep.querySelectorAll(".attrib")];
  const note = keep.querySelector(".note");
  const button = keep.querySelector("button");

  srcSel.addEventListener("change", () => {
    for (const el of attribs) el.hidden = srcSel.value !== "cc0";
  });

  button.addEventListener("click", async () => {
    button.disabled = true;
    note.className = "note";
    note.textContent = "saving…";
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pngBase64: base64,
          styleFile: styleSel.value,
          kind: kindSel.value,
          path: pathSel.value,
          name: keep.querySelector(".name").value.trim(),
          tags: keep.querySelector(".tags").value,
          source: {
            type: srcSel.value,
            pack: keep.querySelector(".pack").value.trim(),
            author: keep.querySelector(".author").value.trim(),
            url: keep.querySelector(".url").value.trim(),
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || res.status);
      note.className = "note ok";
      note.textContent = "in the database as " + body.record.name + " (" + body.record.path + ")";
      loadCatalog();
    } catch (err) {
      note.className = "note bad";
      note.textContent = err.message;
      button.disabled = false;
    }
  });
}

async function loadCatalog() {
  const assets = await (await fetch("/api/catalog")).json();
  catalogEl.innerHTML = "";
  if (assets.length === 0) {
    catalogEl.innerHTML = '<div class="empty">nothing in the database yet — gate an asset above and press "add to database".</div>';
    return;
  }
  for (const a of assets) {
    const el = document.createElement("div");
    el.className = "cat";
    const frames = a.frames.length > 1 ? " · " + a.frames.length + "f" : "";
    el.innerHTML =
      '<img src="/api/asset/' + a.id + '/0.png" alt="' + a.name + '" />' +
      '<div class="n">' + a.name + "</div>" +
      '<div class="d">' + a.kind + " · " + a.path + " · " + a.width + "×" + a.height + frames + "</div>";
    catalogEl.appendChild(el);
  }
}

loadStyles();
loadCatalog();
</script>
</body>
</html>`;
