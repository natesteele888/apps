"""Point registry.json at the curated App Store screenshots made by tools/shots/<id>.cjs.

For every tools/shots/<id>.caps.json: listing.shots = the store/shots/<id>-<n>.webp files that exist, listing.caps = the
captions, and listing.autoShots = [] so the 3-hourly sync (tools/sync.py) no longer replaces them with live screens
(those are sign-in and empty screens for most apps). Run it after the shot scripts:  python3 tools/apply_shots.py
"""
import json, os, glob
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
reg = json.load(open(os.path.join(ROOT, "registry.json")))
apps = {a["id"]: a for a in reg["apps"]}
for f in sorted(glob.glob(os.path.join(ROOT, "tools", "shots", "*.caps.json"))):
    d = json.load(open(f)); id_ = d["id"]
    if id_ not in apps or "listing" not in apps[id_]:
        print("skip", id_); continue
    files = [f"store/shots/{id_}-{n}.webp" for n in range(1, len(d["caps"]) + 1)]
    files = [x for x in files if os.path.exists(os.path.join(ROOT, x))]
    L = apps[id_]["listing"]
    L["shots"] = files; L["caps"] = d["caps"][:len(files)]; L["autoShots"] = []
    print(id_, len(files))
open(os.path.join(ROOT, "registry.json"), "w").write(json.dumps(reg, indent=2, ensure_ascii=False) + "\n")
