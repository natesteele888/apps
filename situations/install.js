/* One-tap install banner. Shows only when the page is opened with ?install (the Toolbox's "Add to phone" button does that). */
(function(){
  var want = /[?&]install\b/.test(location.search) || location.hash === "#install";
  var standalone = matchMedia("(display-mode: standalone)").matches;
  var ev = null, bar = null;
  function show(html, btn){
    if(!bar){
      bar = document.createElement("div");
      bar.setAttribute("role","dialog");
      bar.style.cssText = "position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:99999;background:#132420;color:#f2f5f1;border:1px solid #28453c;border-radius:14px;padding:14px;display:flex;gap:12px;align-items:center;font:15px/1.35 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4)";
      document.body.appendChild(bar);
    }
    bar.innerHTML = '<img src="icons/icon-192.png" alt="" style="width:44px;height:44px;border-radius:10px;flex:none"><div style="flex:1;min-width:0">'+html+'</div>' +
      (btn ? '<button id="__inst" style="font:inherit;font-weight:700;background:#ffc53d;color:#0c1512;border:0;border-radius:9px;padding:10px 14px">Install</button>' : '') +
      '<button id="__x" aria-label="Close" style="font:inherit;background:none;border:0;color:#8fa89e;padding:6px">✕</button>';
    bar.querySelector("#__x").onclick = hide;
    var b = bar.querySelector("#__inst");
    if(b) b.onclick = function(){ ev.prompt(); ev.userChoice.then(function(c){ if(c.outcome === "accepted") hide(); ev = null; }); };
  }
  function hide(){ if(bar){ bar.remove(); bar = null; } }
  function name(){ var m = document.querySelector('meta[name="apple-mobile-web-app-title"]'); return m ? m.content : document.title; }
  if(!want || standalone) return;
  addEventListener("beforeinstallprompt", function(e){ e.preventDefault(); ev = e; show("<b>Add "+name()+" to your home screen</b><br><span style='color:#8fa89e;font-size:13px'>Opens full screen, like an app.</span>", true); });
  addEventListener("appinstalled", function(){ show("<b>Installed.</b> Find it in your app drawer, then drag it into a folder.", false); setTimeout(hide, 5000); });
  addEventListener("load", function(){ setTimeout(function(){ if(!ev && !bar) show("<b>Already on your phone?</b><br><span style='color:#8fa89e;font-size:13px'>If not, tap ⋮ in Chrome → <b>Install app</b>.</span>", false); }, 3500); });
})();
