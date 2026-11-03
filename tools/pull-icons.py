"""Copy app icons set in the Toolbox (Firestore public_icons) into icons/.

Every app's manifest points at icons/<id>-*.png on this site, so a change here
updates the app icon everywhere: installed apps, the App Store and the Toolbox.
Runs from .github/workflows/icons.yml. Writes nothing when nothing changed.
"""
import base64, io, json, os, re, sys, urllib.request
from PIL import Image

PROJECT = "nates-toolbox"
URL = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/public_icons?pageSize=100"
ROOT = os.path.join(os.path.dirname(__file__), "..")
REG = json.load(open(os.path.join(ROOT, "registry.json")))
IDS = {a["id"] for a in REG["apps"]}

def png(data_url):
    m = re.match(r"^data:image/(?:png|jpeg|webp);base64,(.+)$", data_url or "")
    if not m:
        return None
    im = Image.open(io.BytesIO(base64.b64decode(m.group(1)))).convert("RGBA")
    if im.size[0] < 192 or im.size[0] != im.size[1]:
        return None
    return im.resize((512, 512), Image.LANCZOS)

def save(im, path):
    buf = io.BytesIO(); im.save(buf, "PNG", optimize=True); new = buf.getvalue()
    old = open(path, "rb").read() if os.path.exists(path) else b""
    if old == new:
        return False
    open(path, "wb").write(new); return True

try:
    docs = json.load(urllib.request.urlopen(URL, timeout=30)).get("documents", [])
except Exception as e:
    print("Could not read public_icons:", e); sys.exit(0)

changed = []
for d in docs:
    id_ = d["name"].rsplit("/", 1)[-1]
    if id_ not in IDS:
        print("skip unknown id", id_); continue
    f = d.get("fields", {})
    any_ = png(f.get("any", {}).get("stringValue"))
    mask = png(f.get("maskable", {}).get("stringValue")) or any_
    if not any_:
        continue
    out = os.path.join(ROOT, "icons", id_)
    c = save(any_, out + "-512.png")
    c |= save(any_.resize((192, 192), Image.LANCZOS), out + "-192.png")
    c |= save(mask, out + "-maskable.png")
    if c:
        changed.append(id_)
print("changed:", ",".join(changed) or "none")
open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a").write(f"changed={','.join(changed)}\n")
