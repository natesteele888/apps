/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* ==================================================================
   Where Do I Go? — org settings ("baseball org in a box").

   Another league sets its own name, colors, logo, teams (and, if it
   wants, its own play files) with settings, never by editing code:

     1. A settings file:  situations/orgs/<slug>.json, opened with
        ?org=<slug>  (see orgs/README.md for every field).
     2. A share link:     the setup screen (?setup) builds a link with
        the settings packed into it (#org=...). No file needed.
     3. This phone only:  the setup screen's "Use on this phone".

   The org a phone opened last is remembered, so an installed app keeps
   it. ?org=lybs (or ?org=default) goes back to LYBS.

   LYBS is the built-in default below. With no org chosen, nothing here
   changes the page: same title, same colors, same footer, same plays.

   Field names follow League Ops in a Box's Organization type
   (packages/shared-types/src/org.ts): name, slug, abbreviation,
   branding.logoUrl / primaryColor / secondaryColor.
   Pure helpers (clean, encode, decode, resolve) run in Node too, so
   they can be checked without a browser.
   ================================================================== */
(function (root) {
  'use strict';

  var DEFAULT_ORG = {
    slug: 'lybs',
    name: 'Lunenburg Youth Baseball & Softball',
    abbreviation: 'LYBS',
    title: 'Where Do I Go? — Baseball Situations',
    footer: 'Same plays as the Situations tab in LYBS Ballclub.',
    branding: { logoUrl: null, primaryColor: null, secondaryColor: null },
    teams: [],
    plays: null,
  };
  var STORE_KEY = 'wdig_org_v1';
  var TEAM_KEY = 'wdig_team_v1';
  var SLUG_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
  var COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
  var MAX_TEAMS = 60;

  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function text(v, max) {
    if (v == null) return '';
    // eslint-disable-next-line no-control-regex
    return String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 80);
  }
  function color(v) { v = text(v, 9); return COLOR_RE.test(v) ? v.toLowerCase() : null; }
  function slugify(v) {
    return text(v, 60).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }
  /* A link may be https://..., or a plain path inside the site (no "..", no scheme),
     which is read from the orgs/ folder, e.g. "sample/logo.svg". Anything else is dropped. */
  function link(v) {
    v = text(v, 500);
    if (!v) return null;
    if (/^https:\/\/[^\s"'<>\\]+$/i.test(v)) {
      try { var u = new URL(v); return u.protocol === 'https:' && u.hostname ? u.href : null; } catch (e) { return null; }
    }
    if (/^[\w][\w./-]*$/.test(v) && v.split('/').indexOf('..') < 0 && !/^[a-z][a-z0-9+.-]*:/i.test(v)) return v;
    return null;
  }

  /* Cleans any settings object (from a file, a share link or the setup screen) into a
     full org, filling gaps from the default. Unknown fields are ignored. */
  function clean(raw) {
    raw = isObj(raw) ? raw : {};
    var b = isObj(raw.branding) ? raw.branding : {};
    var name = text(raw.name, 80);
    var org = {
      slug: SLUG_RE.test(String(raw.slug || '')) ? raw.slug : (slugify(name) || 'my-league'),
      name: name || 'My League',
      abbreviation: text(raw.abbreviation, 8) || null,
      title: text(raw.title, 80) || null,
      footer: raw.footer == null ? null : text(raw.footer, 140),
      branding: {
        logoUrl: link(b.logoUrl),
        primaryColor: color(b.primaryColor),
        secondaryColor: color(b.secondaryColor),
      },
      teams: [],
      plays: null,
    };
    var seen = {};
    (Array.isArray(raw.teams) ? raw.teams : []).slice(0, MAX_TEAMS).forEach(function (t) {
      if (typeof t === 'string') t = { name: t };
      if (!isObj(t)) return;
      var tn = text(t.name, 40);
      if (!tn) return;
      var id = slugify(t.id || tn) || 'team';
      while (seen[id]) id += '-2';
      seen[id] = 1;
      org.teams.push({ id: id, name: tn, color: color(t.color) });
    });
    if (isObj(raw.plays)) {
      var s = link(raw.plays.situations), r = link(raw.plays.responsibilities);
      if (s && r) org.plays = { situations: s, responsibilities: r };
    }
    return org;
  }

  function defaultOrg() {
    var o = JSON.parse(JSON.stringify(DEFAULT_ORG));
    o.isDefault = true;
    return o;
  }

  /* Share links carry the settings as base64url JSON after #org= */
  function b64e(str) {
    var bin = typeof TextEncoder !== 'undefined'
      ? Array.prototype.map.call(new TextEncoder().encode(str), function (c) { return String.fromCharCode(c); }).join('')
      : unescape(encodeURIComponent(str));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64d(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    if (typeof TextDecoder !== 'undefined') {
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(escape(bin));
  }
  function forShare(org) {
    var o = { name: org.name, abbreviation: org.abbreviation, branding: org.branding, teams: org.teams };
    if (org.title) o.title = org.title;
    if (org.footer != null) o.footer = org.footer;
    if (org.plays) o.plays = org.plays;
    if (org.slug) o.slug = org.slug;
    return o;
  }
  function encode(org) { return b64e(JSON.stringify(forShare(org))); }
  function decode(s) {
    if (!s || String(s).length > 20000) return null;
    try { return clean(JSON.parse(b64d(s))); } catch (e) { return null; }
  }

  function param(search, key) {
    var m = new RegExp('[?&]' + key + '=([^&#]*)').exec(search || '');
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }
  function hashOrg(hash) {
    var m = /(?:^#|&)org=([A-Za-z0-9_-]+)/.exec(hash || '');
    return m ? m[1] : null;
  }

  /* Works out which org to show.
     env: { search, hash, store (get/set/remove), fetchJson(url) -> Promise<obj> }
     Resolves { org, source, note } where source is default | file | link | saved. */
  function resolve(env) {
    var store = env.store;
    function save(rec) { try { store.set(STORE_KEY, JSON.stringify(rec)); } catch (e) { /* private window */ } }
    function saved() { try { var v = store.get(STORE_KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } }

    var fromHash = hashOrg(env.hash);
    if (fromHash) {
      var o = decode(fromHash);
      if (o) { save({ source: 'link', org: o }); return Promise.resolve({ org: o, source: 'link' }); }
    }
    var want = param(env.search, 'org');
    if (want != null) {
      want = want.trim().toLowerCase();
      if (want === '' || want === 'default' || want === DEFAULT_ORG.slug) {
        try { store.remove(STORE_KEY); } catch (e) { /* ignore */ }
        return Promise.resolve({ org: defaultOrg(), source: 'default' });
      }
      if (SLUG_RE.test(want)) {
        var last = saved();
        return env.fetchJson('orgs/' + want + '.json').then(function (raw) {
          if (!isObj(raw)) throw new Error('not an object');
          raw.slug = want;
          var org = clean(raw);
          save({ source: 'file', slug: want, org: org });
          return { org: org, source: 'file' };
        }).catch(function () {
          // Offline with this org saved from an earlier visit: keep using that copy.
          if (last && last.source === 'file' && last.slug === want && last.org) return { org: clean(last.org), source: 'file' };
          return { org: defaultOrg(), source: 'default', note: 'missing' };
        });
      }
      return Promise.resolve({ org: defaultOrg(), source: 'default', note: 'missing' });
    }
    var rec = saved();
    if (rec && isObj(rec.org)) {
      var org = clean(rec.org);
      if (rec.source === 'file' && rec.slug && SLUG_RE.test(rec.slug)) {
        // Refresh the saved copy in the background-ish: use the file if it answers, else the saved copy.
        return env.fetchJson('orgs/' + rec.slug + '.json').then(function (raw) {
          if (!isObj(raw)) throw new Error('not an object');
          raw.slug = rec.slug;
          var fresh = clean(raw);
          save({ source: 'file', slug: rec.slug, org: fresh });
          return { org: fresh, source: 'file' };
        }).catch(function () { return { org: org, source: 'file' }; });
      }
      return Promise.resolve({ org: org, source: 'saved' });
    }
    return Promise.resolve({ org: defaultOrg(), source: 'default' });
  }

  function pickTeam(org, search, store) {
    if (!org.teams.length) return null;
    var want = param(search, 'team');
    var key = TEAM_KEY + ':' + org.slug;
    if (want) want = slugify(want);
    if (!want) { try { want = store.get(key); } catch (e) { want = null; } }
    var t = null;
    org.teams.forEach(function (x) { if (x.id === want) t = x; });
    if (t) { try { store.set(key, t.id); } catch (e) { /* ignore */ } }
    return t;
  }

  /* ---------------- colors ---------------- */
  function rgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    return [0, 2, 4].map(function (i) { return parseInt(hex.substr(i, 2), 16); });
  }
  function lum(hex) {
    var c = rgb(hex).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function onColor(hex) { return contrast(hex, '#111111') >= contrast(hex, '#ffffff') ? '#111111' : '#ffffff'; }
  function mix(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return '#' + x.map(function (v, i) { return ('0' + Math.round(v + (y[i] - v) * t).toString(16)).slice(-2); }).join('');
  }

  /* The CSS an org's colors add on top of the page. Empty for the default org,
     so LYBS's look stays exactly as it is. Role colors on the field (who fields,
     who covers, who cuts) are teaching colors and never change. */
  function themeCss(org, team) {
    var css = '';
    var bg = org.branding.secondaryColor;
    var accent = (team && team.color) || org.branding.primaryColor;
    if (bg) {
      var light = lum(bg) > 0.4;
      var ink = light ? '#10201a' : '#f2f5f1';
      var toward = light ? '#000000' : '#ffffff';
      var vars = {
        '--org-bg': bg, '--org-panel': mix(bg, toward, 0.06), '--org-line': mix(bg, toward, 0.2),
        '--org-ink': ink, '--org-mute': mix(ink, bg, 0.4),
      };
      css += ':root{' + Object.keys(vars).map(function (k) { return k + ':' + vars[k]; }).join(';') + '}\n';
      css += 'html body .situationsRoot{--sit-night:' + bg + ';--sit-panel:' + mix(bg, toward, 0.06) + ';--sit-panel2:' + mix(bg, toward, 0.1) +
        ';--sit-line:' + mix(bg, toward, 0.2) + ';--sit-chalk:' + ink + ';--sit-mute:' + mix(ink, bg, 0.4) + '}\n';
      css += 'html body .situationsRoot .sitJob .sitCue{color:' + ink + '}\n';
      if (light) css += ':root{color-scheme:light}\n';
    }
    if (accent) {
      var on = onColor(accent);
      css += ':root{--org-accent:' + accent + ';--org-on-accent:' + on + '}\n';
      var fill = ['.sitPill.on', '.sitChip.on', '.sitPlaybar button.sitPrimary', '.sitViewToggle button.on'];
      css += fill.map(function (s) { return 'html body .situationsRoot ' + s; }).join(',') +
        '{background:' + accent + ';border-color:' + accent + ';color:' + on + '}\n';
      css += 'html body .situationsRoot .sitDiamond button[aria-pressed="true"]{background:' + accent + ';border-color:' + accent + ';box-shadow:0 0 9px ' + accent + '99}\n';
      css += 'html body .situationsRoot .sitTransport #sitScrub{accent-color:' + accent + '}\n';
      css += 'html body .situationsRoot .sitBigjob{border-left-color:' + accent + '}\n';
      css += 'html body .situationsRoot .sitJob.sitJobMe{background:linear-gradient(90deg,' + accent + '26,transparent)}\n';
    }
    return css;
  }

  function title(org, team) {
    if (org.isDefault) return org.title;
    var base = org.title || ('Where Do I Go? — ' + (org.abbreviation || org.name));
    return team ? base + ' · ' + team.name : base;
  }
  function footer(org) {
    if (org.footer != null) return org.footer;
    return (org.abbreviation || org.name) + ' · Where Do I Go?';
  }
  function showsBar(org) { return !org.isDefault || !!org.branding.logoUrl || org.teams.length > 0; }

  var api = {
    DEFAULT_ORG: DEFAULT_ORG, STORE_KEY: STORE_KEY, TEAM_KEY: TEAM_KEY,
    clean: clean, defaultOrg: defaultOrg, encode: encode, decode: decode, resolve: resolve,
    pickTeam: pickTeam, themeCss: themeCss, title: title, footer: footer, showsBar: showsBar,
    onColor: onColor, contrast: contrast, slugify: slugify, link: link,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WDIGOrg = api;
})(typeof window !== 'undefined' ? window : this);
