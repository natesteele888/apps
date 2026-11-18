/* Snack Shack Screen: the Google Drive feed.
   Copyright (c) 2026 Nate Steele. All rights reserved. See LICENSE.

   What this does: the TV screen asks this little web app "what's in the folder?" and then asks for each
   picture, video or Google Slides deck in it. It only ever hands out files that sit inside the one
   "Snack Shack Screen" folder (and the folders inside it). Nothing in your Drive gets its sharing changed.

   One-time setup (about 3 minutes, on a computer):
     1. Go to script.google.com, click New project, delete what's there, and paste all of this in.
     2. Pick "setup" in the function box at the top and click Run. Allow it when Google asks.
        It finds or makes the "Snack Shack Screen" folder (with starter folders inside) in your Drive.
     3. Click Deploy > New deployment > the gear > Web app.
        Execute as: Me.  Who has access: Anyone.  Click Deploy and copy the Web app URL.
     4. Paste that URL into the Snack Shack Screen setup page (natesteele888.github.io/apps/snackshack/).

   Anyone who has the web app URL can see what's in that one folder, the same as anyone standing at the
   Snack Shack. So only put things in it that you'd show on a public screen: no rosters, no kids' names
   or photos without OK, no phone numbers or addresses of people. */

var FOLDER_NAME = 'Snack Shack Screen';
var FOLDER_ID = '';        // leave blank: setup() finds or makes the folder and remembers it
var CALENDAR_ID = '';      // optional: a league Google Calendar id, so "Game Day" folders and "Today at the field" know the games
var CALENDAR_MATCH = '';   // optional: only events whose title or place has one of these words, e.g. 'Marshall'
var MAX_MB = 25;           // bigger files are skipped (keep videos short: about a minute of 1080p)
var STARTER_FOLDERS = ['Always', 'Menu', 'Sponsors', 'Game Day', 'Morning', 'Afternoon', 'Evening', '_Drafts'];

function setup() {
  var f = folder_();
  Logger.log('Snack Shack Screen folder: ' + f.getName() + ' (' + f.getUrl() + ')');
  if (CALENDAR_ID) Logger.log('Calendar: ' + (CalendarApp.getCalendarById(CALENDAR_ID) ? 'found' : 'NOT found, check CALENDAR_ID'));
  Logger.log('Next: Deploy > New deployment > Web app (Execute as Me, Anyone), then paste the URL into the setup page.');
}

function folder_() {
  var props = PropertiesService.getScriptProperties();
  var id = FOLDER_ID || props.getProperty('folderId');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var it = DriveApp.getFoldersByName(FOLDER_NAME), f;
  if (it.hasNext()) f = it.next();
  else {
    f = DriveApp.createFolder(FOLDER_NAME);
    STARTER_FOLDERS.forEach(function (n) { f.createFolder(n); });
  }
  props.setProperty('folderId', f.getId());
  return f;
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    var a = p.a || 'list';
    if (a === 'ping') return json_({ ok: true, folder: folder_().getName() });
    if (a === 'list') return json_(list_());
    if (a === 'file') return json_(file_(p.id));
    if (a === 'slide') return json_(slide_(p.id, p.page));
    return json_({ ok: false, error: 'unknown request' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function list_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('list');
  if (hit) return JSON.parse(hit);
  var root = folder_(), items = [];
  walk_(root, [], items, 0);
  var out = { ok: true, folder: root.getName(), updated: new Date().toISOString(), tz: Session.getScriptTimeZone(), items: items };
  if (CALENDAR_ID) { out.schedule = true; out.events = events_(); }
  var s = JSON.stringify(out);
  if (s.length < 90000) cache.put('list', s, 60);
  return out;
}

function walk_(folder, path, items, depth) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next(), mime = f.getMimeType(), type = '';
    if (/^image\//.test(mime)) type = 'image';
    else if (/^video\//.test(mime)) type = 'video';
    else if (mime === 'application/vnd.google-apps.presentation') type = 'slides';
    if (!type) continue;
    var it = { id: f.getId(), name: f.getName(), type: type, mime: mime, size: f.getSize(), modified: f.getLastUpdated().toISOString(), path: path };
    if (type !== 'slides' && it.size > MAX_MB * 1048576) it.tooBig = true;
    if (type === 'slides') {
      try { it.pages = SlidesApp.openById(it.id).getSlides().filter(function (s) { return !s.isSkipped || !s.isSkipped(); }).map(function (s) { return s.getObjectId(); }); }
      catch (e) { it.pages = []; }
    }
    items.push(it);
  }
  if (depth >= 4) return;
  var subs = folder.getFolders();
  while (subs.hasNext()) { var sub = subs.next(); walk_(sub, path.concat([sub.getName()]), items, depth + 1); }
}

/* True only when the file sits somewhere inside the Snack Shack Screen folder. */
function inside_(file) {
  var rootId = folder_().getId(), seen = {}, queue = [], parents = file.getParents();
  while (parents.hasNext()) queue.push({ f: parents.next(), d: 0 });
  while (queue.length) {
    var q = queue.shift(), id = q.f.getId();
    if (id === rootId) return true;
    if (seen[id] || q.d > 5) continue;
    seen[id] = true;
    var up = q.f.getParents();
    while (up.hasNext()) queue.push({ f: up.next(), d: q.d + 1 });
  }
  return false;
}

function file_(id) {
  var f = DriveApp.getFileById(String(id || ''));
  if (!inside_(f)) return { ok: false, error: 'not in the Snack Shack Screen folder' };
  if (f.getSize() > MAX_MB * 1048576) return { ok: false, error: 'too big' };
  var b = f.getBlob();
  return { ok: true, mime: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) };
}

function slide_(id, page) {
  var f = DriveApp.getFileById(String(id || ''));
  if (!inside_(f)) return { ok: false, error: 'not in the Snack Shack Screen folder' };
  var url = 'https://docs.google.com/presentation/d/' + encodeURIComponent(f.getId()) + '/export/png?pageid=' + encodeURIComponent(String(page || ''));
  var r = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return { ok: false, error: 'slide export ' + r.getResponseCode() };
  return { ok: true, mime: 'image/png', data: Utilities.base64Encode(r.getBlob().getBytes()) };
}

function events_() {
  var cal = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!cal) return [];
  var tz = Session.getScriptTimeZone(), start = new Date(); start.setHours(0, 0, 0, 0);
  var end = new Date(start.getTime() + 8 * 86400000);
  var words = String(CALENDAR_MATCH || '').toLowerCase().split(/[,\s]+/).filter(String);
  return cal.getEvents(start, end).filter(function (ev) {
    if (!words.length) return true;
    var hay = (ev.getTitle() + ' ' + ev.getLocation()).toLowerCase();
    return words.some(function (w) { return hay.indexOf(w) >= 0; });
  }).slice(0, 60).map(function (ev) {
    var all = ev.isAllDayEvent(), s = all ? ev.getAllDayStartDate() : ev.getStartTime();
    var en = all ? new Date(ev.getAllDayEndDate().getTime() - 86400000) : ev.getEndTime();
    var fmt = all ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm";
    return { title: ev.getTitle().replace(/^\s*LYBS\s*:\s*/i, ''), start: Utilities.formatDate(s, tz, fmt), end: Utilities.formatDate(en, tz, fmt), allDay: all, where: ev.getLocation() };
  });
}
