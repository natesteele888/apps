"""Keep the App Store, icons and app catalog in sync. Runs from .github/workflows/sync.yml.

One run does four things, and commits only what really changed:
  1. Icons      Toolbox icon changes (Firestore public_icons)   -> icons/<id>-192/512/maskable.png
  2. Listings   Toolbox store-listing edits (public_listings)    -> registry.json apps[].listing
  3. Latest     newest commit for each app on GitHub             -> registry.json apps[].listing.latest
  4. Shots      fresh screenshots of each app's vetted public screens -> store/shots/<id>-<n>.webp

registry.json is the app catalog: the App Store, the Toolbox and the install page all read it.
"""
import base64, io, json, os, re, sys, datetime, urllib.request, urllib.error
from PIL import Image, ImageChops, ImageStat

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REG_PATH = os.path.join(ROOT, "registry.json")
FS = "https://firestore.googleapis.com/v1/projects/nates-toolbox/databases/(default)/documents/"
TOKEN = os.environ.get("GITHUB_TOKEN", "")
changed = []

reg = json.load(open(REG_PATH))
before = json.dumps(reg, sort_keys=True)
apps = {a["id"]: a for a in reg["apps"]}


def get_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def fs_docs(collection):
    try:
        return get_json(FS + collection + "?pageSize=100").get("documents", [])
    except Exception as e:
        print(f"could not read {collection}: {e}")
        return []


def fs_value(v):
    """Turn a Firestore REST value into plain Python."""
    if v is None:
        return None
    if "stringValue" in v: return v["stringValue"]
    if "booleanValue" in v: return v["booleanValue"]
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return v["doubleValue"]
    if "nullValue" in v: return None
    if "arrayValue" in v: return [fs_value(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v: return {k: fs_value(x) for k, x in v["mapValue"].get("fields", {}).items()}
    return None


def decode_image(data_url):
    m = re.match(r"^data:image/(?:png|jpeg|webp);base64,(.+)$", data_url or "")
    if not m:
        return None
    im = Image.open(io.BytesIO(base64.b64decode(m.group(1)))).convert("RGBA")
    if im.size[0] < 192 or im.size[0] != im.size[1]:
        return None
    return im.resize((512, 512), Image.LANCZOS)


def save_png(im, path):
    buf = io.BytesIO(); im.save(buf, "PNG", optimize=True); new = buf.getvalue()
    if os.path.exists(path) and open(path, "rb").read() == new:
        return False
    open(path, "wb").write(new); return True


# 1. Icons ------------------------------------------------------------------
for d in fs_docs("public_icons"):
    id_ = d["name"].rsplit("/", 1)[-1]
    if id_ not in apps:
        continue
    f = d.get("fields", {})
    any_ = decode_image(fs_value(f.get("any")))
    mask = decode_image(fs_value(f.get("maskable"))) or any_
    if not any_:
        continue
    out = os.path.join(ROOT, "icons", id_)
    c = save_png(any_, out + "-512.png")
    c |= save_png(any_.resize((192, 192), Image.LANCZOS), out + "-192.png")
    c |= save_png(mask, out + "-maskable.png")
    if c:
        changed.append(f"icon:{id_}")

# 2. Listings edited in the Toolbox -----------------------------------------
LISTING_FIELDS = {"sub", "desc", "feats", "facts", "tie", "for", "access"}
for d in fs_docs("public_listings"):
    id_ = d["name"].rsplit("/", 1)[-1]
    if id_ not in apps:
        continue
    data = {k: fs_value(v) for k, v in d.get("fields", {}).items()}
    L = apps[id_].setdefault("listing", {})
    for k in LISTING_FIELDS:
        if k in data and data[k] not in (None, "", []):
            L[k] = data[k]
    if isinstance(data.get("store"), bool):
        if data["store"]:
            apps[id_].pop("store", None)
        else:
            apps[id_]["store"] = False

# 3. Latest change per app, straight from GitHub -----------------------------
hdr = {"Accept": "application/vnd.github+json", "User-Agent": "app-catalog-sync"}
if TOKEN:
    hdr["Authorization"] = f"Bearer {TOKEN}"
for a in reg["apps"]:
    if not a.get("repo") or a.get("retired") or "listing" not in a:
        continue
    path = a.get("path", "")
    url = f"https://api.github.com/repos/{a['repo']}/commits?per_page=8" + (f"&path={path}" if path else "")
    try:
        commits = get_json(url, hdr)
    except urllib.error.HTTPError as e:
        print(f"latest: {a['id']} {e.code}")  # private repos without access are skipped
        continue
    except Exception as e:
        print(f"latest: {a['id']} {e}"); continue
    for c in commits:
        msg = c["commit"]["message"].split("\n")[0].strip()
        if re.match(r"^(Merge|Icons from the Toolbox|Sync the App Store|Update .* app icon|CLAUDE\.md)", msg) or re.search(r"shared app icon|app directory|registry\.json", msg, re.I):
            continue
        when = datetime.datetime.fromisoformat(c["commit"]["author"]["date"].replace("Z", "+00:00"))
        msg = re.sub(r"\s*\(#\d+\)$", "", msg)[:180]
        a["listing"]["latest"] = {"d": when.strftime("%b %-d, %Y"), "t": msg, "url": c["html_url"]}
        break

# 4. Screenshots of each app's vetted public screens -------------------------
def shots():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed; skipping screenshots"); return
    os.makedirs(os.path.join(ROOT, "store", "shots"), exist_ok=True)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for a in reg["apps"]:
            plan = (a.get("listing") or {}).get("autoShots") or []
            if not plan or a.get("retired"):
                continue
            paths = []
            for n, s in enumerate(plan, 1):
                ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
                p = ctx.new_page()
                try:
                    p.goto(s.get("url") or a["live"], wait_until="load", timeout=30000)
                    p.wait_for_timeout(3000)
                    if s.get("click"):
                        try: p.get_by_text(s["click"], exact=False).first.click(timeout=3000)
                        except Exception: pass
                        p.wait_for_timeout(s.get("wait", 1500))
                    if s.get("hideText"):
                        p.evaluate("""t=>{[...document.querySelectorAll('*')].filter(e=>e.children.length<4&&e.textContent.includes(t)&&e.textContent.length<120).slice(-1).forEach(e=>e.style.visibility='hidden')}""", s["hideText"])
                    if s.get("scrollY"):
                        p.evaluate(f"window.scrollTo(0,{int(s['scrollY'])})"); p.wait_for_timeout(800)
                    png = p.screenshot()
                except Exception as e:
                    print(f"shot failed {a['id']} {n}: {e}"); ctx.close(); continue
                ctx.close()
                im = Image.open(io.BytesIO(png)).convert("RGB").resize((540, 1169), Image.LANCZOS)
                rel = f"store/shots/{a['id']}-{n}.webp"; full = os.path.join(ROOT, rel)
                if os.path.exists(full):
                    old = Image.open(full).convert("RGB")
                    small = (135, 292)  # compare thumbnails so animations and clocks don't count as changes
                    diff = sum(ImageStat.Stat(ImageChops.difference(old.resize(small), im.resize(small))).mean) / 3
                    if diff < 6.0:
                        paths.append(rel); continue
                im.save(full, "WEBP", quality=78); paths.append(rel); changed.append(f"shot:{a['id']}-{n}")
            if paths:
                manual = [x for x in a["listing"].get("shots", []) if not x.startswith("store/shots/")]
                a["listing"]["shots"] = paths + [x for x in manual if x == "mock"]
        b.close()


if "--no-shots" not in sys.argv:
    shots()

if json.dumps(reg, sort_keys=True) != before:
    reg["updated"] = datetime.date.today().isoformat()
    open(REG_PATH, "w").write(json.dumps(reg, indent=2, ensure_ascii=False) + "\n")
    changed.append("catalog")

print("changed:", ",".join(changed) or "none")
with open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a") as f:
    f.write(f"changed={','.join(changed)}\n")
