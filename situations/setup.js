/* Copyright (c) 2026 Nate Steele. All rights reserved. Not licensed for copying, hosting or resale. See LICENSE. */
/* Where Do I Go? — league setup screen. Opens with ?setup.
   A league types its name, colors, logo link and teams, sees them on the page
   right away, then either uses them on this phone, copies a share link with
   the settings packed in, or downloads a settings file for situations/orgs/.
   Nothing here is sent anywhere: it all stays on this phone until someone
   shares the link or the file themselves. */
(function () {
  'use strict';
  var Org = window.WDIGOrg, Page = window.WDIGPage;
  var box = document.getElementById('setup');
  if (!Org || !Page || !box) return;
  var cur = Page.current();
  var start = cur.org || Org.defaultOrg();

  function esc(s) { return window.escapeHtml(s == null ? '' : s); }
  function teamsText(teams) { return teams.map(function (t) { return t.name + (t.color ? ', ' + t.color : ''); }).join('\n'); }

  box.innerHTML =
    '<div class="sheet">' +
    '<h2><span id="setupTitle">Set up your league</span><button id="setupClose" type="button" aria-label="Close">×</button></h2>' +
    '<p class="setupHelp">Your league\'s name, colors, logo and teams. Changes show on the page as you type. Nothing leaves this phone until you share the link or the file.</p>' +
    '<label class="setupF">League name<input id="sName" maxlength="80" autocomplete="off"></label>' +
    '<label class="setupF">Short name<input id="sAbbr" maxlength="8" autocomplete="off" placeholder="e.g. SVYB"></label>' +
    '<label class="setupF">Logo link<input id="sLogo" inputmode="url" autocomplete="off" placeholder="https://… (a PNG or SVG)"></label>' +
    '<div class="setupRow">' +
      '<label class="setupF">Main color<span class="setupColor"><input type="color" id="sAccentPick"><input id="sAccent" maxlength="7" placeholder="none"></span></label>' +
      '<label class="setupF">Background<span class="setupColor"><input type="color" id="sBgPick"><input id="sBg" maxlength="7" placeholder="none"></span></label>' +
    '</div>' +
    '<label class="setupF">Teams, one per line (add a color after a comma if you like)<textarea id="sTeams" rows="5" placeholder="Hawks, #c8102e&#10;Owls"></textarea></label>' +
    '<details class="setupMore"><summary>Your own plays (optional)</summary>' +
      '<p class="setupHelp">Links to your own copies of the two play files, with the same columns as the LYBS ones. A Google Sheet published as CSV works. Leave both empty to use the LYBS plays.</p>' +
      '<label class="setupF">Situations file<input id="sSit" inputmode="url" autocomplete="off" placeholder="https://…/situations.csv"></label>' +
      '<label class="setupF">Jobs file<input id="sResp" inputmode="url" autocomplete="off" placeholder="https://…/responsibilities.csv"></label>' +
    '</details>' +
    '<div class="setupBtns">' +
      '<button class="btn setupGo" type="button" id="sSave">Use on this phone</button>' +
      '<button class="btn" type="button" id="sShare">Copy share link</button>' +
      '<button class="btn" type="button" id="sFile">Download settings file</button>' +
      '<button class="btn" type="button" id="sReset">Back to LYBS</button>' +
    '</div>' +
    '<div id="sMsg" class="setupMsg" role="status"></div>' +
    '<input id="sLink" class="setupLink" readonly hidden aria-label="Share link">' +
    '</div>';

  var css = document.createElement('style');
  css.textContent =
    '#setup .sheet{max-height:92vh}' +
    '.setupHelp{margin:0 0 10px;color:var(--org-mute,#8fa89e);font-size:14px;line-height:1.4}' +
    '.setupF{display:block;margin:0 0 10px;font-size:13px;color:var(--org-mute,#8fa89e);font-weight:600;flex:1;min-width:0}' +
    '.setupF input:not([type=color]),.setupF textarea,.setupLink{display:block;width:100%;margin-top:4px;min-height:44px;padding:9px 11px;border-radius:10px;' +
      'border:1px solid var(--org-line,#28453c);background:var(--org-bg,#0c1512);color:var(--org-ink,#f2f5f1);font:16px Barlow,sans-serif}' +
    '.setupF textarea{resize:vertical}' +
    '.setupRow{display:flex;gap:10px}' +
    '.setupColor{display:flex;gap:6px;align-items:center;margin-top:4px}.setupColor input{margin-top:0!important}' +
    '.setupColor input[type=color]{width:44px;height:44px;flex:none;padding:0;border:1px solid var(--org-line,#28453c);border-radius:10px;background:none}' +
    '.setupMore{margin:0 0 12px}.setupMore summary{cursor:pointer;min-height:36px;color:var(--org-ink,#f2f5f1);font-weight:600}' +
    '.setupBtns{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '.setupBtns .setupGo{grid-column:1/-1;background:var(--org-accent,#ffc53d);border-color:var(--org-accent,#ffc53d);color:var(--org-on-accent,#111)}' +
    '.setupMsg{min-height:20px;margin:10px 0 0;font-size:14px}';
  document.head.appendChild(css);

  function $(id) { return document.getElementById(id); }
  $('sName').value = start.isDefault ? '' : start.name;
  $('sAbbr').value = start.isDefault ? '' : (start.abbreviation || '');
  $('sLogo').value = start.branding.logoUrl || '';
  $('sAccent').value = start.branding.primaryColor || '';
  $('sBg').value = start.branding.secondaryColor || '';
  $('sAccentPick').value = start.branding.primaryColor && start.branding.primaryColor.length === 7 ? start.branding.primaryColor : '#ffc53d';
  $('sBgPick').value = start.branding.secondaryColor && start.branding.secondaryColor.length === 7 ? start.branding.secondaryColor : '#0c1512';
  $('sTeams').value = teamsText(start.teams);
  $('sSit').value = start.plays ? start.plays.situations : '';
  $('sResp').value = start.plays ? start.plays.responsibilities : '';

  function read() {
    var teams = $('sTeams').value.split('\n').map(function (line) {
      var m = /^(.*?)(?:\s*,\s*(#[0-9a-fA-F]{3,6}))?\s*$/.exec(line);
      return { name: m ? m[1] : line, color: m && m[2] ? m[2] : null };
    });
    var raw = {
      name: $('sName').value || 'My League',
      abbreviation: $('sAbbr').value,
      branding: { logoUrl: $('sLogo').value, primaryColor: $('sAccent').value, secondaryColor: $('sBg').value },
      teams: teams,
      plays: { situations: $('sSit').value, responsibilities: $('sResp').value },
    };
    if (!start.isDefault && start.slug) raw.slug = start.slug;
    return Org.clean(raw);
  }
  function say(t) { $('sMsg').textContent = t; }
  function preview() { var o = read(); Page.apply(o, null); return o; }

  ['sName', 'sAbbr', 'sLogo', 'sAccent', 'sBg', 'sTeams'].forEach(function (id) { $(id).addEventListener('input', preview); });
  $('sAccentPick').addEventListener('input', function () { $('sAccent').value = this.value; preview(); });
  $('sBgPick').addEventListener('input', function () { $('sBg').value = this.value; preview(); });

  $('sSave').onclick = function () {
    var o = preview();
    try { Page.store.set(Org.STORE_KEY, JSON.stringify({ source: 'saved', org: o })); } catch (e) { return say('This phone won\'t save settings (private browsing?). Use the share link instead.'); }
    say('Saved on this phone. Opening it now…');
    location.href = location.pathname;
  };
  $('sShare').onclick = function () {
    var o = preview();
    var url = location.origin + location.pathname + '#org=' + Org.encode(o);
    var field = $('sLink');
    field.value = url; field.hidden = false;
    var done = function () { say('Share link copied. Anyone who opens it gets your league\'s setup.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { field.select(); say('Copy the link below.'); });
    else { field.select(); say('Copy the link below.'); }
  };
  $('sFile').onclick = function () {
    var o = preview();
    var out = { name: o.name, abbreviation: o.abbreviation, branding: o.branding, teams: o.teams };
    if (o.plays) out.plays = o.plays;
    var blob = new Blob([JSON.stringify(out, null, 2) + '\n'], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (o.slug || 'my-league') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    say('Saved ' + a.download + '. Put it in situations/orgs/ and open ?org=' + (o.slug || 'my-league') + '.');
  };
  $('sReset').onclick = function () { location.href = location.pathname + '?org=lybs'; };

  function close() { box.classList.remove('on'); }
  $('setupClose').onclick = close;
  box.addEventListener('click', function (e) { if (e.target === box) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  box.classList.add('on');
  $('sName').focus();
})();
