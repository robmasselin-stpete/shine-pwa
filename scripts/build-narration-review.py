#!/usr/bin/env python3
"""
build-narration-review.py — regenerate tools/narration-review.html.

A local review page for the 84 tour narrations: play each clip (streams from the
CDN), read/edit its script inline, mark clips reviewed, and export just the edits
as JSON to hand back for regeneration.

Features:
  - Auto-save: every keystroke is stashed in the browser's localStorage and
    restored on reload (a reload/regenerate/closed tab can't lose edits).
  - Reviewed checkbox per clip (persisted) + "hide reviewed" filter + "N/84
    reviewed" counter — so you can show only the clips you haven't checked yet.
  - Revision badges: reads data/narration/_revisions.json and badges revised clips
    ("✎ revised <date>"), with a "show only revised" filter.
  - Audio cache-bust: each build stamps the audio URLs so the browser fetches the
    latest CDN audio (e.g. after re-rendering in a new voice).

Run:  python3 scripts/build-narration-review.py
Open: http://127.0.0.1:8000/tools/narration-review.html   (via the local server)
"""
import glob, os, re, json, time, yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def main():
    narr = {}
    for f in glob.glob(os.path.join(ROOT, "data/narration/*.txt")):
        m = re.match(r"(\d+)-", os.path.basename(f))
        if m:
            narr[int(m.group(1))] = open(f).read().strip()

    rev_path = os.path.join(ROOT, "data/narration/_revisions.json")
    revisions = {}
    if os.path.exists(rev_path):
        try:
            revisions = json.load(open(rev_path))
        except Exception:
            revisions = {}

    rows = []
    for f in sorted(glob.glob(os.path.join(ROOT, "data/murals/*.yaml"))):
        if os.path.basename(f).startswith("_"):
            continue
        d = yaml.safe_load(open(f))
        if not d or not d.get("audio"):
            continue
        rid = d.get("id")
        rows.append({
            "id": rid,
            "artist": d.get("artist", ""),
            "title": d.get("title", "") or "",
            "year": d.get("year", ""),
            "aud": d.get("audio", ""),
            "text": narr.get(rid, "(no narration script file found)"),
            "rev": revisions.get(str(rid)),
        })
    rows.sort(key=lambda r: (r["id"] if isinstance(r["id"], int) else 9999))

    page = (TEMPLATE
            .replace("__DATA__", json.dumps(rows))
            .replace("__CB__", str(int(time.time()))))
    open(os.path.join(ROOT, "tools/narration-review.html"), "w").write(page)
    n_rev = sum(1 for r in rows if r["rev"])
    print(f"wrote tools/narration-review.html — {len(rows)} clips, {n_rev} marked revised")


TEMPLATE = r"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mural Quest — Narration Review</title>
<style>
 body{font:15px/1.5 -apple-system,Helvetica,Arial,sans-serif;max-width:820px;margin:0 auto;padding:16px;background:#faf7f4;color:#1a1a1a}
 h1{font-size:20px;border-bottom:3px solid #e8663a;padding-bottom:.2em}
 .bar{position:sticky;top:0;background:#faf7f4;padding:10px 0;border-bottom:1px solid #ddd;z-index:5}
 .card{background:#fff;border:1px solid #e3ddd6;border-radius:10px;padding:14px;margin:14px 0}
 .card.changed{border-color:#e8663a;box-shadow:0 0 0 2px rgba(232,102,58,.15)}
 .card.reviewed{opacity:.5}
 .hdr{font-weight:700}.sub{color:#777;font-size:13px;margin-bottom:8px}
 .rev{display:inline-block;background:#2e7d32;color:#fff;font-size:11px;font-weight:600;border-radius:10px;padding:1px 8px;margin-left:8px}
 audio{width:100%;margin:6px 0}
 textarea{width:100%;min-height:120px;font:14px/1.5 ui-monospace,Menlo,monospace;padding:8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box}
 button{font:14px inherit;padding:7px 14px;border-radius:7px;border:1px solid #e8663a;background:#e8663a;color:#fff;cursor:pointer}
 #out{width:100%;min-height:160px;margin-top:8px;font:12px ui-monospace,monospace}
 .count{font-size:13px;color:#777;margin-left:8px}
 .filter{font-size:13px;margin-left:10px;white-space:nowrap}
 .chk{float:right;font-weight:400;font-size:13px;color:#555;cursor:pointer}
</style></head><body>
<h1>Narration Review — <span id="n"></span> clips</h1>
<div class="bar">
  <input id="search" placeholder="Search artist / title / #id…" oninput="applyFilter()"
    style="font:14px inherit;padding:6px 10px;border:1px solid #ccc;border-radius:7px;min-width:220px;margin-right:8px">
  <button onclick="exportEdits()">Export my edits</button>
  <button onclick="clearSaved()" style="background:#fff;color:#777;border-color:#ccc">Clear saved</button>
  <span class="count" id="chg">0 edited</span>
  <span class="filter" style="color:#2e7d32" title="Every edit is saved in this browser and restored on reload">● auto-saves</span>
  <label class="filter"><input type="checkbox" id="hide-checked" onchange="applyFilter()"> hide reviewed</label>
  <label class="filter"><input type="checkbox" id="only-rev" onchange="applyFilter()"> only revised</label>
  <span class="count" id="revcount"></span>
  <div><textarea id="out" placeholder="Edited clips appear here as JSON — copy this and send it to Claude to regenerate the audio." hidden></textarea></div>
</div>
<div id="list"></div>
<script>
const DATA = __DATA__;
const CB = "__CB__";
const orig = {}; DATA.forEach(r=>orig[r.id]=r.text);
document.getElementById('n').textContent = DATA.length;
const list = document.getElementById('list');
DATA.forEach(r=>{
  const c=document.createElement('div'); c.className='card'; c.dataset.id=r.id; c.dataset.rev = r.rev?'1':'0';
  c.dataset.search = ('#'+r.id+' '+r.artist+' '+(r.title||'')).toLowerCase();
  const badge = r.rev ? `<span class="rev" title="${(r.rev.note||'').replace(/"/g,'&quot;')}">✎ revised ${r.rev.date}</span>` : '';
  const cb = r.aud.includes('?')?'&':'?';
  c.innerHTML = `<div class="hdr"><label class="chk"><input type="checkbox" class="check"> reviewed</label>#${r.id} — ${r.artist}${r.title?' · "'+r.title+'"':''}${badge}</div>
    <div class="sub">${r.year||''}</div>
    <audio controls preload="none" src="${r.aud}${cb}cb=${CB}"></audio>
    <textarea>${r.text.replace(/</g,'&lt;')}</textarea>`;
  const ta=c.querySelector('textarea');
  const LS='mq_narr_'+r.id;
  const saved=localStorage.getItem(LS);
  if(saved!==null){ ta.value=saved; c.classList.toggle('changed', saved!==orig[r.id]); }
  ta.addEventListener('input',()=>{ localStorage.setItem(LS, ta.value); c.classList.toggle('changed', ta.value!==orig[r.id]); updateCount(); });
  const chk=c.querySelector('.check');
  chk.checked = localStorage.getItem('mq_narr_chk_'+r.id)==='1';
  c.classList.toggle('reviewed', chk.checked);
  chk.addEventListener('change',()=>{ localStorage.setItem('mq_narr_chk_'+r.id, chk.checked?'1':'0'); c.classList.toggle('reviewed', chk.checked); updateRevCount(); applyFilter(); });
  list.appendChild(c);
});
function updateCount(){ document.getElementById('chg').textContent = document.querySelectorAll('.card.changed').length + ' edited'; }
function updateRevCount(){ const n=document.querySelectorAll('.card .check:checked').length; document.getElementById('revcount').textContent = n+'/'+DATA.length+' reviewed'; }
function applyFilter(){
  const only=document.getElementById('only-rev').checked;
  const hide=document.getElementById('hide-checked').checked;
  const q=(document.getElementById('search').value||'').trim().toLowerCase();
  document.querySelectorAll('.card').forEach(c=>{
    const isRev=c.dataset.rev==='1'; const isChk=c.querySelector('.check').checked;
    let show=true;
    if(only&&!isRev)show=false;
    if(hide&&isChk)show=false;
    if(q&&!c.dataset.search.includes(q))show=false;
    c.style.display=show?'':'none';
  });
}
function exportEdits(){
  const out={}; document.querySelectorAll('.card.changed').forEach(c=>{ out[c.dataset.id]=c.querySelector('textarea').value.trim(); });
  const o=document.getElementById('out'); o.hidden=false; o.value=JSON.stringify(out,null,2); o.select();
}
function clearSaved(){ if(!confirm('Clear all locally-saved edits in this browser and reload? (Reviewed checkmarks are kept.)'))return; Object.keys(localStorage).filter(k=>k.startsWith('mq_narr_')&&!k.startsWith('mq_narr_chk_')).forEach(k=>localStorage.removeItem(k)); location.reload(); }
updateCount(); updateRevCount(); applyFilter();
</script></body></html>"""

if __name__ == "__main__":
    main()
