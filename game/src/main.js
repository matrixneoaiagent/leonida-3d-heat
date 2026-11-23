/* COBALT HEAT — boot. */
(function () {
  'use strict';

  function fatal(message, detail) {
    var box = document.createElement('div');
    box.id = 'fatal-error';
    box.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:40px;background:#07191d;color:#f8ecd2;font-family:Arial Narrow,Arial,sans-serif;text-align:center';
    var inner = document.createElement('div');
    inner.style.cssText = 'max-width:620px;border:1px solid rgba(255,111,94,.5);padding:30px;background:rgba(9,30,34,.94)';
    inner.innerHTML = '<div style="font-size:10px;letter-spacing:.3em;color:#ff6f5e">COBALT HEAT · MARISOL</div>' +
      '<h1 style="font-family:Impact,Arial Black,sans-serif;font-weight:400;letter-spacing:.05em;font-size:42px;margin:8px 0 12px">UNABLE TO START</h1>' +
      '<p style="font-size:13px;line-height:1.6;color:#b9c9c4;margin:0 0 14px"></p>' +
      '<p style="font-family:Consolas,monospace;font-size:10px;color:#88a39e;margin:0"></p>';
    inner.querySelectorAll('p')[0].textContent = message;
    inner.querySelectorAll('p')[1].textContent = detail || '';
    box.appendChild(inner);
    document.body.appendChild(box);
  }

  function boot() {
    var canvas = document.getElementById('gameCanvas');
    if (!canvas) { fatal('The game canvas is missing from the page.'); return; }
    if (!window.THREE) { fatal('Three.js did not load.', 'Expected vendor/three.min.js to define the global THREE.'); return; }
    if (!window.CH || !CH.Game) { fatal('The game modules did not load.', 'Check every classic script in index.html.'); return; }

    var game;
    try {
      game = new CH.Game(canvas);
    } catch (err) {
      console.error('[Cobalt Heat] boot failed', err);
      fatal('The city could not be built.', String(err && err.stack ? err.stack : err));
      return;
    }

    window.__game = game;
    window.__game.shotReady = false;
    window.__game.started = true;

    var params = new URLSearchParams(window.location.search);
    var shot = params.get('shot');
    if (shot) {
      document.body.classList.add('is-shot');
      game.shotName = shot;
      try {
        game.setupShot(shot, params.get('seed'));
      } catch (err) {
        console.error('[Cobalt Heat] shot staging failed', err);
        game.shotReady = false;
        fatal('The screenshot scene could not be staged.', String(err && err.stack ? err.stack : err));
        return;
      }
    }

    game.start();

    var unlocked = false;
    function unlockAudio() {
      if (unlocked) return;
      unlocked = true;
      try { game.audio.unlock(); } catch (e) { /* audio is optional */ }
      window.removeEventListener('pointerdown', unlockAudio, true);
      window.removeEventListener('keydown', unlockAudio, true);
    }
    window.addEventListener('pointerdown', unlockAudio, true);
    window.addEventListener('keydown', unlockAudio, true);

    window.addEventListener('error', function (event) {
      if (event && event.message) console.warn('[Cobalt Heat] runtime error:', event.message);
    });

    if (!shot) {
      var saved = game.hasSave();
      var cont = document.getElementById('btn-continue');
      if (cont) cont.style.opacity = saved ? '' : '.45';
      game.hud.setScreen('title');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}());
