/* COBALT HEAT — HUD, minimap and menus.
   DOM interface, canvas minimap, mission presentation and all menu flows. */
(function () {
  'use strict';

  var CH = window.CH = window.CH || {};
  var U = CH.Util;
  var C = CH.CONFIG;

  function el(id) { return document.getElementById(id); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function HUD(game) {
    this.game = game;
    this.el = {};
    var ids = ['hud', 'vitals-panel', 'player-district', 'wanted-mini', 'health-fill', 'health-value', 'armor-fill', 'armor-value', 'money-value', 'cash-delta',
      'wanted-stars', 'pursuit-state', 'heat-label', 'clock-value', 'day-value', 'weather-value', 'radio-name', 'radio-tag', 'dispatch-line',
      'mission-card', 'mission-giver', 'mission-timer', 'mission-title', 'mission-objective', 'mission-progress-fill', 'mission-number', 'mission-area', 'mission-reward', 'dispatch-rows',
      'minimap', 'map-district', 'map-coords', 'map-shells', 'weapon-panel', 'weapon-slot', 'weapon-name', 'weapon-ammo', 'weapon-reserve', 'weapon-icon',
      'speedo', 'speed-value', 'speed-fill', 'gear-value', 'car-name', 'crosshair', 'prompt', 'prompt-text', 'objective-arrow', 'objective-distance',
      'toast-feed', 'kill-feed', 'dialogue', 'dialogue-portrait', 'dialogue-speaker', 'dialogue-text', 'busted-meter', 'busted-pct', 'busted-fill',
      'boss-bar', 'boss-name', 'boss-role', 'boss-fill',
      'mission-banner', 'banner-kicker', 'banner-title', 'banner-sub', 'autosave', 'look-hint', 'damage-flash', 'damage-direction',
      'title-screen', 'title-wanted', 'help-screen', 'credits-screen', 'pause-screen', 'pause-sub', 'briefing', 'briefing-kicker', 'briefing-title',
      'briefing-giver', 'briefing-role', 'briefing-lines', 'briefing-reward', 'briefing-time', 'briefing-objectives', 'briefing-portrait',
      'result-screen', 'result-kicker', 'result-title', 'result-rank', 'result-payout', 'result-time', 'result-bonus', 'result-message', 'btn-result-retry',
      'weapon-wheel', 'wheel-money', 'wheel-pistol', 'wheel-smg', 'wheel-shotgun', 'wheel-slot-fists'];
    for (var i = 0; i < ids.length; i++) this.el[ids[i]] = el(ids[i]);
    this.ctx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.moneyShown = C.PLAYER.money;
    this.moneyTarget = C.PLAYER.money;
    this.mapTimer = 0;
    this.dialogueTimer = 0;
    this.dialogueDuration = 0;
    this.damageTimer = 0;
    this.critical = false;
    this.wheelOpen = false;
    this.resultData = null;
    this.lastWanted = -1;
    this.lastWeapon = '';
    this.lastPrompt = '';
    this.toastSeq = 0;
    this._tmp = new THREE.Vector3();
    this._bind();
  }

  HUD.prototype._bind = function () {
    var g = this.game;
    var self = this;
    function on(id, fn) {
      var node = el(id);
      if (node) node.addEventListener('click', function (e) { e.preventDefault(); g.audio.ui(); fn(); });
    }
    on('btn-new-game', function () { g.startNewGame(); });
    on('btn-continue', function () { g.continueGame(); });
    on('btn-how-to-play', function () { self.showHelp(true); });
    on('btn-credits', function () { self.showCredits(true); });
    on('btn-help-close', function () { self.showHelp(false); });
    on('btn-credits-close', function () { self.showCredits(false); });
    on('btn-resume', function () { g.togglePause(false); });
    on('btn-save', function () { g.saveGame(); });
    on('btn-restart', function () { g.restartMission(); });
    on('btn-mute', function () { self.updateMuteButton(); });
    on('btn-quit', function () { g.quitToTitle(); });
    on('btn-briefing-start', function () { g.beginBriefing(); });
    on('btn-result-continue', function () { g.closeResult(); });
    on('btn-result-retry', function () { g.retryMission(); });
    on('radio-next', function () { g.audio.nextStation(); self.updateRadio(); });

    all('.wheel-slot').forEach(function (slot) {
      slot.addEventListener('click', function () {
        var id = slot.getAttribute('data-weapon');
        if (id) {
          if (g.player.weapons[id] && g.player.weapons[id].owned) g.player.switchWeapon(id);
          else g.player.purchaseWeapon(id);
          self.el['wheel-money'].textContent = '$' + U.formatMoney(g.player.money);
          self.updateWheelAmmo();
          self.toggleWeaponWheel(false);
        }
      });
    });

    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space' || e.code === 'Enter') {
        if (self.el.briefing && self.el.briefing.classList.contains('active') && !el('help-screen').classList.contains('active')) {
          e.preventDefault();
          g.beginBriefing();
        } else if (self.el['result-screen'] && self.el['result-screen'].classList.contains('active')) {
          e.preventDefault();
          if (self.resultData && self.resultData.success) g.closeResult();
        }
      }
      if (e.code === 'Escape') {
        if (self.el['help-screen'].classList.contains('active')) { self.showHelp(false); return; }
        if (self.el['credits-screen'].classList.contains('active')) { self.showCredits(false); return; }
        if (self.el['weapon-wheel'].classList.contains('active')) { self.toggleWeaponWheel(false); return; }
      }
    });
  };

  HUD.prototype.setScreen = function (name) {
    document.body.classList.remove('is-title', 'is-playing', 'is-paused', 'is-shot');
    if (name === 'title') document.body.classList.add('is-title');
    else if (name === 'play') document.body.classList.add('is-playing');
    else if (name === 'paused') document.body.classList.add('is-paused', 'is-playing');
    else if (name === 'shot') document.body.classList.add('is-shot');
    this.showTitle(name === 'title');
    this.showPauseScreen(name === 'paused');
  };

  HUD.prototype.showTitle = function (visible) {
    if (!this.el['title-screen']) return;
    this.el['title-screen'].classList.toggle('active', !!visible);
    this.el['title-screen'].setAttribute('aria-hidden', visible ? 'false' : 'true');
  };

  HUD.prototype.showPauseScreen = function (visible) {
    this.el['pause-screen'].classList.toggle('active', !!visible);
    if (visible) {
      var p = this.game.player;
      if (p) {
        this.el['pause-sub'].textContent = this.game.world.districtLabel(p.pos.x, p.pos.z) + ' · ' + U.formatClock(this.game.clock.minutes) + ' · SUNNY';
      }
      this.updateMuteButton();
    }
  };

  HUD.prototype.showHelp = function (visible) { this.el['help-screen'].classList.toggle('active', !!visible); };
  HUD.prototype.showCredits = function (visible) { this.el['credits-screen'].classList.toggle('active', !!visible); };

  HUD.prototype.startPrompt = function () {
    this.el['look-hint'].classList.remove('hide');
  };

  HUD.prototype.update = function (dt) {
    var game = this.game;
    var player = game.player;
    if (!player) return;
    this.moneyTarget = player.money;
    this.moneyShown += (this.moneyTarget - this.moneyShown) * Math.min(1, dt * 7);
    if (Math.abs(this.moneyTarget - this.moneyShown) < 1) this.moneyShown = this.moneyTarget;
    this.el['money-value'].textContent = U.formatMoney(this.moneyShown);
    this.el['health-fill'].style.width = U.clamp(player.health / player.maxHealth, 0, 1) * 100 + '%';
    this.el['health-value'].textContent = Math.ceil(player.health);
    this.el['armor-fill'].style.width = U.clamp(player.armor / 100, 0, 1) * 100 + '%';
    this.el['armor-value'].textContent = Math.ceil(player.armor);
    this.el['player-district'].textContent = game.world.districtLabel(player.pos.x, player.pos.z);
    this.el['clock-value'].textContent = U.formatClock(game.clock.minutes);
    this.el['day-value'].textContent = 'DAY ' + U.pad(game.clock.day || 1);
    this.el['title-wanted'].textContent = Math.ceil(game.police.wanted) + ' / 5 STARS';
    this.el['heat-label'].textContent = game.police.wanted > 0 ? 'HEAT ' + Math.ceil(game.police.wanted) + '/5' : 'CLEAN';
    this.el['pursuit-state'].textContent = game.police.wanted > 0 ? game.police.units.length + ' UNITS PURSUING' : 'NO UNITS';
    this.el['pursuit-state'].classList.toggle('hot', game.police.wanted > 0);
    this.el['dispatch-line'].classList.toggle('hot', !!game.police.calloutTimer && game.police.calloutTimer > 0);
    if (game.police.calloutTimer > 0) this.el['dispatch-line'].textContent = 'DISPATCH · ' + game.police.callout;
    else this.el['dispatch-line'].textContent = 'DISPATCH · ' + (game.police.roadblock ? 'ROADBLOCK ACTIVE' : game.police.wanted > 0 ? 'SEARCHING THE COAST' : 'QUIET');

    var car = player.currentVehicle;
    document.body.classList.toggle('is-driving', !!car);
    document.body.classList.toggle('is-talking', !this.el.dialogue.hidden);
    if (car) {
      this.el.speedo.hidden = false;
      this.el['speed-value'].textContent = String(Math.round(Math.abs(car.speed) * 3.6)).padStart(3, '0');
      this.el['speed-fill'].style.width = U.clamp(Math.abs(car.speed) / car.spec.maxSpeed, 0, 1) * 100 + '%';
      this.el['gear-value'].textContent = car.speed < -0.2 ? 'R' : car.speed > 1 ? 'D' : 'N';
      this.el['car-name'].textContent = car.spec.label;
    } else {
      this.el.speedo.hidden = true;
    }

    var spec = C.WEAPONS[player.weapon];
    var w = player.weapons[player.weapon];
    this.el['weapon-name'].textContent = spec.name;
    this.el['weapon-ammo'].textContent = spec.kind === 'melee' ? '∞' : w.mag;
    this.el['weapon-reserve'].textContent = spec.kind === 'melee' ? '—' : w.reserve;
    this.el['weapon-slot'].textContent = spec.slot + ' / 4';
    if (this.lastWeapon !== player.weapon) {
      this.lastWeapon = player.weapon;
      this.drawWeaponIcon(player.weapon);
    }

    this.updateStars(game.police.wanted);
    this.updateBoss();
    this.updatePrompt(player, game);
    this.updateCrosshair(player);

    var cam = game.cameraRig;
    var wantCrosshair = !player.inVehicle && player.weapon !== 'fists' && (player.aiming || game.combat.aimHeld);
    this.el.crosshair.classList.toggle('on', wantCrosshair);

    if (this.el.dialogue.hidden === false) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.hideDialogue();
    }
    if (this.damageTimer > 0) {
      this.damageTimer -= dt;
      if (this.damageTimer <= 0) {
        this.el['damage-flash'].classList.remove('on');
        this.el['damage-direction'].style.opacity = '0';
      }
    }
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 0.075;
      this.drawMinimap();
      this.updateObjectiveArrow();
      this.updateDispatch();
    }
    if (!player.inVehicle && document.pointerLockElement) this.el['look-hint'].classList.add('hide');
    if (game.state === 'play' && !game.shotName && game.time > 18) this.el['look-hint'].classList.add('hide');
  };

  HUD.prototype.updateStars = function (wanted) {
    var n = Math.ceil(wanted);
    if (n === this.lastWanted) return;
    this.lastWanted = n;
    var stars = this.el['wanted-stars'].children;
    for (var i = 0; i < stars.length; i++) stars[i].classList.toggle('on', i < n);
    var mini = this.el['wanted-mini'].children;
    for (i = 0; i < mini.length; i++) mini[i].classList.toggle('on', i < n);
  };

  HUD.prototype.setWanted = function (wanted) {
    this.lastWanted = -1;
    this.updateStars(wanted);
    this.el['title-wanted'].textContent = Math.ceil(wanted) + ' / 5 STARS';
  };

  HUD.prototype.updatePrompt = function (player, game) {
    var text = '';
    if (!player.inVehicle) {
      var mission = game.missions.availableMission();
      if (mission) {
        var s = CH.MissionStarts[mission.id];
        if (U.dist(player.pos.x, player.pos.z, s.x, s.z) < 4.6) text = 'START MISSION · ' + mission.title;
      }
      if (!text) {
        var side = C.SIDE_JOBS[0];
        if (U.dist(player.pos.x, player.pos.z, side.x, side.z) < 4.4) text = 'START SIDE JOB · ' + side.title;
      }
      if (!text) {
        var car = player.nearestVehicle(4.4);
        if (car) text = car.owner === 'traffic' ? 'CARJACK ' + car.spec.label : (car.owner === 'police' ? 'STEAL POLICE CRUISER' : 'ENTER ' + car.spec.label);
      }
    } else {
      text = 'EXIT VEHICLE';
    }
    if (this.el.prompt.hidden || this.lastPrompt !== text) {
      this.lastPrompt = text;
      this.el.prompt.hidden = text === '';
      if (text) this.el['prompt-text'].textContent = text;
    }
  };

  HUD.prototype.updateCrosshair = function (player) {
    var on = !player.inVehicle && player.weapon !== 'fists' && (player.aiming || this.game.combat.aimHeld);
    this.el.crosshair.classList.toggle('on', on);
  };

  HUD.prototype.updateObjectiveArrow = function () {
    var pos = this.game.missions.getObjectivePosition();
    if (!pos) {
      this.el['objective-arrow'].classList.remove('on');
      return;
    }
    var player = this.game.player;
    var dx = pos.x - player.pos.x, dz = pos.z - player.pos.z;
    var dist = Math.hypot(dx, dz);
    if (dist < 10) {
      this.el['objective-arrow'].classList.remove('on');
      return;
    }
    var yaw = this.game.cameraRig.yaw;
    var rel = U.wrapAngle(Math.atan2(dx, dz) - yaw);
    if (Math.abs(rel) < 0.42 && dist < 80) {
      this.el['objective-arrow'].classList.remove('on');
      return;
    }
    this.el['objective-arrow'].classList.add('on');
    var cx = 640, cy = 360;
    var x = cx + Math.sin(rel) * 315;
    var y = cy - Math.cos(rel) * 240;
    x = U.clamp(x, 35, 1245);
    y = U.clamp(y, 80, 660);
    this.el['objective-arrow'].style.left = x + 'px';
    this.el['objective-arrow'].style.top = y + 'px';
    this.el['objective-arrow'].style.transform = 'translate(-50%,-50%)';
    var arrow = this.el['objective-arrow'].querySelector('span');
    if (arrow) arrow.style.transform = 'rotate(' + (rel - Math.PI / 2) + 'rad)';
    this.el['objective-distance'].textContent = Math.round(dist) + 'M';
  };

  HUD.prototype.setPursuit = function (units, roadblock, callout) {
    this.el['pursuit-state'].textContent = units > 0 ? units + ' UNIT' + (units === 1 ? '' : 'S') + ' PURSUING' : (roadblock ? 'ROADBLOCK SET' : 'NO UNITS');
    this.el['pursuit-state'].classList.toggle('hot', units > 0 || roadblock);
  };

  HUD.prototype.setMission = function (data, objective, time) {
    if (!data) {
      this.el['mission-card'].hidden = true;
      return;
    }
    this.el['mission-card'].hidden = false;
    var contact = C.CONTACTS[data.giver] || { name: 'MARISOL' };
    this.el['mission-giver'].textContent = contact.name;
    this.el['mission-title'].textContent = data.title;
    this.el['mission-objective'].textContent = objective || (data.objectives[0] ? data.objectives[0].label : '');
    this.el['mission-number'].textContent = data.number ? 'MISSION ' + U.pad(data.number) : 'SIDE JOB';
    this.el['mission-area'].textContent = data.area || 'MARISOL';
    this.el['mission-reward'].textContent = '$' + U.formatMoney(data.reward || 0);
    this.el['mission-progress-fill'].style.width = '0%';
    if (time != null) this.setTimer(U.formatTime(time), 1);
    this.el['dispatch-rows'].innerHTML = '<tr><td>PATROL 12</td><td>--</td><td>STANDBY</td></tr>';
  };

  HUD.prototype.setObjective = function (text, progress) {
    this.el['mission-objective'].textContent = text || '';
    this.el['mission-progress-fill'].style.width = U.clamp(progress || 0, 0, 1) * 100 + '%';
  };

  HUD.prototype.setTimer = function (text, ratio) {
    this.el['mission-timer'].textContent = text;
    this.el['mission-timer'].style.color = ratio != null && ratio < 0.22 ? 'var(--red)' : '';
  };

  HUD.prototype.clearTimer = function () {
    this.el['mission-timer'].textContent = '';
  };

  HUD.prototype.updateDispatch = function () {
    if (this.el['mission-card'].hidden) return;
    var p = this.game.player;
    var rows = [];
    var units = this.game.police.units.slice(0, 2);
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      var d = Math.round(U.dist(p.pos.x, p.pos.z, u.pos.x, u.pos.z));
      rows.push('<tr><td>PATROL ' + U.pad(10 + i) + '</td><td>' + d + ' M</td><td>' + (u.ai && u.ai.state === 'roadblock' ? 'BLOCKING' : 'PURSUIT') + '</td></tr>');
    }
    if (this.game.police.roadblock) rows.push('<tr><td>ROADBLOCK</td><td>SET</td><td class="st-hot">AHEAD</td></tr>');
    var officers = this.game.police.officers.filter(function (o) { return o.alive; });
    if (officers.length) {
      var od = Math.round(U.dist(p.pos.x, p.pos.z, officers[0].pos.x, officers[0].pos.z));
      rows.push('<tr><td>FOOT UNIT</td><td>' + od + ' M</td><td>DEPLOYED</td></tr>');
    }
    if (!rows.length) rows.push('<tr><td>DISPATCH</td><td>--</td><td>' + (this.game.missions.active ? 'LISTENING' : 'QUIET') + '</td></tr>');
    this.el['dispatch-rows'].innerHTML = rows.join('');
  };

  HUD.prototype.setWeapon = function (id) {
    var spec = C.WEAPONS[id];
    if (!spec) return;
    this.el['weapon-name'].textContent = spec.name;
    this.lastWeapon = id;
    this.drawWeaponIcon(id);
    var slots = all('.wheel-slot');
    for (var i = 0; i < slots.length; i++) slots[i].classList.toggle('active', slots[i].getAttribute('data-weapon') === id);
  };

  HUD.prototype.setAmmo = function () {
    if (!this.game.player) return;
    var w = this.game.player.weapons[this.game.player.weapon];
    var spec = C.WEAPONS[this.game.player.weapon];
    if (!w || !spec) return;
    this.el['weapon-ammo'].textContent = spec.kind === 'melee' ? '∞' : w.mag;
    this.el['weapon-reserve'].textContent = spec.kind === 'melee' ? '—' : w.reserve;
  };

  HUD.prototype.drawWeaponIcon = function (id) {
    var c = this.el['weapon-icon'];
    if (!c) return;
    var x = c.getContext('2d');
    x.clearRect(0, 0, 150, 62);
    x.save();
    x.translate(18, 12);
    x.fillStyle = '#e8dcc1';
    x.strokeStyle = '#0a1b1e'; x.lineWidth = 2;
    if (id === 'pistol') {
      x.fillRect(32, 6, 64, 12);
      x.fillRect(44, 18, 16, 25);
      x.fillStyle = '#ff6f5e'; x.fillRect(85, 8, 14, 4);
      x.fillStyle = '#8a9189'; x.fillRect(32, 8, 60, 3);
      x.fillStyle = '#e8dcc1'; x.fillRect(90, 3, 8, 6);
    } else if (id === 'smg') {
      x.fillRect(18, 9, 88, 11);
      x.fillRect(34, 20, 12, 24);
      x.fillRect(84, 20, 10, 17);
      x.fillRect(10, 11, 12, 6);
      x.fillStyle = '#ff6f5e'; x.fillRect(74, 12, 24, 3);
      x.fillStyle = '#c8bca0'; x.fillRect(42, 4, 28, 3);
    } else if (id === 'shotgun') {
      x.fillRect(8, 9, 118, 7);
      x.fillRect(96, 15, 28, 5);
      x.fillStyle = '#8c6a48'; x.fillRect(20, 16, 42, 8);
      x.fillStyle = '#ff6f5e'; x.fillRect(58, 11, 10, 2);
      x.fillStyle = '#e8dcc1'; x.fillRect(34, 24, 10, 12);
    } else {
      x.strokeStyle = '#e8dcc1'; x.lineWidth = 3;
      x.beginPath(); x.roundRect ? x.roundRect(36, 6, 38, 28, 5) : x.rect(36, 6, 38, 28); x.stroke();
      for (var i = 0; i < 4; i++) { x.beginPath(); x.arc(43 + i * 8, 18, 3.2, 0, Math.PI * 2); x.fillStyle = '#8f958b'; x.fill(); }
      x.fillStyle = '#f0c469'; x.fillRect(33, 33, 42, 3);
    }
    x.restore();
    x.fillStyle = 'rgba(248,236,210,.16)';
    x.fillRect(0, 56, 150, 1);
  };

  HUD.prototype.toast = function (title, message, type) {
    if (this.game.shotName) return;
    var feed = this.el['toast-feed'];
    if (!feed) return;
    while (feed.children.length >= 4) feed.removeChild(feed.firstChild);
    var node = document.createElement('div');
    node.className = 'toast' + (type ? ' ' + type : '');
    var b = document.createElement('b'); b.textContent = title || '';
    var s = document.createElement('span'); s.textContent = message || '';
    node.appendChild(b); node.appendChild(s);
    feed.appendChild(node);
    var self = this;
    var seq = ++this.toastSeq;
    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 4200);
  };

  HUD.prototype.cashPop = function (amount) {
    if (this.game.shotName) return;
    var node = this.el['cash-delta'];
    if (!node) return;
    node.textContent = (amount >= 0 ? '+$' : '-$') + U.formatMoney(Math.abs(amount));
    node.style.color = amount >= 0 ? 'var(--teal)' : 'var(--red)';
    node.classList.add('show');
    clearTimeout(this.cashTimer);
    var self = this;
    this.cashTimer = setTimeout(function () { node.classList.remove('show'); }, 1400);
  };

  HUD.prototype.killFeed = function (name, weapon) {
    if (this.game.shotName) return;
    var feed = this.el['kill-feed'];
    if (!feed) return;
    var node = document.createElement('div');
    node.className = 'kill-item';
    node.innerHTML = '<b>' + (weapon || 'HIT') + '</b> · ' + (name || 'TARGET');
    feed.appendChild(node);
    while (feed.children.length > 4) feed.removeChild(feed.firstChild);
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 3600);
  };

  HUD.prototype.dialogue = function (speaker, text, duration) {
    if (!this.el.dialogue) return;
    var contact = null;
    for (var k in C.CONTACTS) if (C.CONTACTS[k].name === speaker) contact = C.CONTACTS[k];
    this.el['dialogue-speaker'].textContent = speaker;
    this.el['dialogue-text'].textContent = text;
    this.el['dialogue-portrait'].innerHTML = '<span>' + (contact ? contact.initials : speaker.substring(0, 2)) + '</span>';
    if (contact) this.el['dialogue-portrait'].style.color = contact.color;
    this.el.dialogue.hidden = false;
    this.dialogueTimer = duration || 6;
    this.dialogueDuration = this.dialogueTimer;
  };

  HUD.prototype.hideDialogue = function () {
    if (this.el.dialogue) this.el.dialogue.hidden = true;
  };

  HUD.prototype.flashDamage = function () {
    if (!this.el['damage-flash']) return;
    this.el['damage-flash'].classList.add('on');
    this.damageTimer = 0.22;
  };

  HUD.prototype.showDamageDirection = function (angle) {
    var node = this.el['damage-direction'];
    if (!node) return;
    node.style.opacity = '1';
    node.style.transform = 'rotate(' + (angle + Math.PI) + 'rad)';
  };

  HUD.prototype.hitMarker = function () {
    var ch = this.el.crosshair;
    if (!ch) return;
    ch.classList.add('hit');
    setTimeout(function () { ch.classList.remove('hit'); }, 110);
    this.crosshairPulse();
  };

  HUD.prototype.crosshairPulse = function () {
    var ch = this.el.crosshair;
    if (!ch) return;
    ch.classList.remove('pulse');
    void ch.offsetWidth;
    ch.classList.add('pulse');
  };

  HUD.prototype.reloadFlash = function () {
    this.toast('RELOADING', 'Keep your head down.');
  };

  HUD.prototype.setBusted = function (value) {
    var node = this.el['busted-meter'];
    if (!node) return;
    var v = U.clamp(value, 0, 1);
    node.hidden = v <= 0.01;
    this.el['busted-pct'].textContent = Math.round(v * 100) + '%';
    this.el['busted-fill'].style.width = v * 100 + '%';
  };

  HUD.prototype.updateBoss = function () {
    var player = this.game.player;
    var boss = null;
    for (var i = 0; i < this.game.combat.enemies.length; i++) {
      var e = this.game.combat.enemies[i];
      if (e.boss && e.alive) {
        if (!player || U.dist(e.pos.x, e.pos.z, player.pos.x, player.pos.z) < 110) { boss = e; break; }
      }
    }
    if (!boss) {
      if (this.el['boss-bar']) this.el['boss-bar'].hidden = true;
      return;
    }
    this.el['boss-bar'].hidden = false;
    this.el['boss-name'].textContent = boss.name || 'ENFORCER';
    this.el['boss-role'].textContent = boss.faction === 'police' ? 'MARISOL P.D.' : 'LIEUTENANT · ' + (this.game.missions.active ? this.game.missions.active.data.area : 'MARISOL');
    this.el['boss-fill'].style.width = U.clamp(boss.health / boss.maxHealth, 0, 1) * 100 + '%';
  };

  HUD.prototype.setCritical = function (yes) {
    if (this.critical === yes) return;
    this.critical = yes;
    document.body.classList.toggle('critical', yes);
  };

  HUD.prototype.updateMuteButton = function () {
    var muted = this.game.audio.toggleMute();
    var btn = el('btn-mute');
    if (btn) btn.innerHTML = '<span class="menu-num">04</span>AUDIO: ' + (muted ? 'OFF' : 'ON');
  };

  HUD.prototype.updateRadio = function () {
    var station = C.RADIO[this.game.audio.station % C.RADIO.length];
    if (!station) return;
    this.el['radio-name'].textContent = station.name;
    this.el['radio-tag'].textContent = station.tag;
    this.el['radio-name'].style.color = station.color;
  };

  HUD.prototype.showSave = function () {
    if (this.game.shotName) return;
    var node = this.el.autosave;
    node.hidden = false;
    clearTimeout(this.saveTimer);
    var self = this;
    this.saveTimer = setTimeout(function () { node.hidden = true; }, 1800);
  };

  HUD.prototype.showBriefing = function (mission) {
    var contact = C.CONTACTS[mission.giver] || { name: 'MARISOL', role: 'CONTACT', initials: 'MR', color: '#ffcf68' };
    this.el['briefing-kicker'].textContent = 'MISSION ' + U.pad(mission.number) + ' · ' + mission.area;
    this.el['briefing-title'].textContent = mission.title;
    this.el['briefing-giver'].textContent = contact.name;
    this.el['briefing-role'].textContent = contact.role;
    this.el['briefing-reward'].textContent = '$' + U.formatMoney(mission.reward);
    this.el['briefing-time'].textContent = U.formatTime(mission.time);
    this.el['briefing-lines'].innerHTML = mission.brief.map(function (p) { return '<p>' + escapeHtml(p) + '</p>'; }).join('');
    this.el['briefing-objectives'].innerHTML = mission.objectives.map(function (o) { return '<div>' + escapeHtml(o.label) + '</div>'; }).join('');
    this.drawPortrait(mission);
    this.el.briefing.classList.add('active');
  };

  HUD.prototype.hideBriefing = function () {
    this.el.briefing.classList.remove('active');
  };

  HUD.prototype.drawPortrait = function (mission) {
    var c = this.el['briefing-portrait'];
    if (!c) return;
    var x = c.getContext('2d');
    var contact = C.CONTACTS[mission.giver] || { color: '#ffcf68', initials: 'MR', name: 'MARISOL' };
    var rng = U.mulberry32(U.hashString(mission.id + mission.giver));
    var w = 220, h = 260;
    x.clearRect(0, 0, w, h);
    var bg = x.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#123e43'); bg.addColorStop(1, '#081d21');
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.save();
    x.translate(w / 2, h * 0.42);
    x.fillStyle = contact.color;
    x.globalAlpha = 0.1;
    for (var i = 0; i < 9; i++) {
      x.rotate(Math.PI / 9);
      x.fillRect(4, 0, 140, 18);
    }
    x.globalAlpha = 1;
    x.restore();
    x.fillStyle = 'rgba(255,255,255,.06)';
    x.beginPath(); x.arc(110, 102, 68, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#a97652';
    x.fillRect(104, 132, 22, 22);
    x.beginPath(); x.ellipse(115, 101, 34, 42, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#2b2521';
    x.beginPath(); x.ellipse(115, 78, 36, 23, 0, Math.PI, Math.PI * 2); x.fill();
    x.fillStyle = '#e9d7b9'; x.fillRect(92, 94, 46, 8);
    x.fillStyle = 'rgba(8,25,28,.88)'; x.fillRect(94, 96, 42, 5);
    x.fillStyle = contact.color;
    x.beginPath(); x.moveTo(50, 260); x.quadraticCurveTo(58, 164, 110, 150); x.quadraticCurveTo(162, 164, 170, 260); x.fill();
    x.fillStyle = 'rgba(8,25,28,.65)';
    x.fillRect(0, 228, w, 32);
    x.fillStyle = '#f8ecd2'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 15px "Arial Narrow", sans-serif';
    x.fillText(contact.name, 110, 245);
    x.fillStyle = 'rgba(255,255,255,.12)';
    for (i = 0; i < h; i += 4) x.fillRect(0, i, w, 1);
    x.fillStyle = 'rgba(8,25,28,.35)';
    x.fillRect(12, 16, 46, 18);
    x.fillStyle = contact.color; x.font = '800 9px "Arial Narrow", sans-serif';
    x.fillText(contact.initials, 35, 25);
  };

  HUD.prototype.showResult = function (data) {
    this.resultData = data;
    this.el['result-kicker'].textContent = data.success ? 'MISSION COMPLETE' : 'MISSION FAILED';
    this.el['result-title'].textContent = data.title;
    this.el['result-rank'].textContent = data.rank;
    this.el['result-payout'].textContent = '$' + U.formatMoney(data.payout || 0);
    this.el['result-time'].textContent = data.time || '00:00';
    this.el['result-bonus'].textContent = data.success ? '+$' + U.formatMoney(data.bonus || 0) : '—';
    this.el['result-message'].textContent = data.message || '';
    var modal = this.el['result-screen'].querySelector('.result-modal');
    if (modal) modal.classList.toggle('fail', !data.success);
    this.el['btn-result-retry'].hidden = data.success || data.retry === false;
    this.el['result-screen'].classList.add('active');
    document.body.classList.add('is-paused');
  };

  HUD.prototype.hideResult = function () {
    this.el['result-screen'].classList.remove('active');
    document.body.classList.remove('is-paused');
    this.resultData = null;
  };

  HUD.prototype.toggleWeaponWheel = function (force) {
    var open = force == null ? !this.wheelOpen : !!force;
    this.wheelOpen = open;
    this.el['weapon-wheel'].classList.toggle('active', open);
    if (open) {
      this.el['wheel-money'].textContent = '$' + U.formatMoney(this.game.player.money);
      this.updateWheelAmmo();
      this.game.input.exitLock();
    }
  };

  HUD.prototype.updateWheelAmmo = function () {
    var p = this.game.player;
    function label(id) {
      var w = p.weapons[id];
      var spec = C.WEAPONS[id];
      if (!w.owned) return 'BUY · $' + U.formatMoney(spec.price || 0);
      return w.mag + ' / ' + w.reserve;
    }
    this.el['wheel-pistol'].textContent = label('pistol');
    this.el['wheel-smg'].textContent = label('smg');
    this.el['wheel-shotgun'].textContent = label('shotgun');
  };

  /* -------------------------------------------------------------- minimap */

  HUD.prototype.drawMinimap = function () {
    var ctx = this.ctx;
    if (!ctx || !this.game.player) return;
    var player = this.game.player;
    var W = C.WORLD;
    var cx = 110, cy = 110;
    var scale = 0.68;
    var px = player.pos.x, pz = player.pos.z;
    ctx.save();
    ctx.clearRect(0, 0, 220, 220);
    ctx.beginPath(); ctx.arc(cx, cy, 109, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#1c3437'; ctx.fillRect(0, 0, 220, 220);

    function mx(x) { return cx + (x - px) * scale; }
    function my(z) { return cy + (z - pz) * scale; }

    /* water and sand along the west edge */
    var beachMapX = mx(W.beachStart);
    var waterMapX = mx(-478);
    if (beachMapX > -150) {
      ctx.fillStyle = '#19606a';
      ctx.fillRect(-10, -10, Math.max(0, waterMapX + 10), 240);
      ctx.fillStyle = '#d9c28d';
      ctx.fillRect(Math.max(0, waterMapX), -10, Math.max(0, beachMapX - waterMapX), 240);
      ctx.strokeStyle = 'rgba(214,246,228,.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(Math.max(0, waterMapX), 0); ctx.lineTo(Math.max(0, waterMapX), 220); ctx.stroke();
    }

    /* block pads */
    var bx = this.game.world.blockCentersX || [];
    var bz = this.game.world.blockCentersZ || [];
    for (var i = 0; i < bx.length; i++) {
      for (var j = 0; j < bz.length; j++) {
        var x0 = mx(bx[i] - 35), y0 = my(bz[j] - 35);
        ctx.fillStyle = 'rgba(216,199,166,.22)';
        ctx.fillRect(x0, y0, 70 * scale, 70 * scale);
      }
    }
    /* building footprints */
    var blds = this.game.world.mapBuildings;
    for (i = 0; i < blds.length; i++) {
      var b = blds[i];
      var bx0 = mx(b.x - b.w / 2), bz0 = my(b.z - b.d / 2);
      ctx.fillStyle = b.h < 2 ? 'rgba(102,155,103,.55)' : 'rgba(154,165,151,.52)';
      ctx.fillRect(bx0, bz0, b.w * scale, b.d * scale);
      if (b.h > 30) {
        ctx.strokeStyle = 'rgba(230,220,194,.16)'; ctx.lineWidth = 1;
        ctx.strokeRect(bx0, bz0, b.w * scale, b.d * scale);
      }
    }
    /* roads drawn as grid lines */
    ctx.strokeStyle = 'rgba(11,27,29,.85)';
    ctx.lineWidth = W.roadHalf * 2 * scale;
    for (i = 0; i < W.roadsX.length; i++) {
      var rx = mx(W.roadsX[i]);
      ctx.beginPath(); ctx.moveTo(rx, -10); ctx.lineTo(rx, 230); ctx.stroke();
    }
    for (i = 0; i < W.roadsZ.length; i++) {
      var rz = my(W.roadsZ[i]);
      ctx.beginPath(); ctx.moveTo(-10, rz); ctx.lineTo(230, rz); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(221,204,168,.13)'; ctx.lineWidth = 1;
    for (i = 0; i < W.roadsX.length; i++) { ctx.beginPath(); ctx.moveTo(mx(W.roadsX[i]), 0); ctx.lineTo(mx(W.roadsX[i]), 220); ctx.stroke(); }
    for (i = 0; i < W.roadsZ.length; i++) { ctx.beginPath(); ctx.moveTo(0, my(W.roadsZ[i])); ctx.lineTo(220, my(W.roadsZ[i])); ctx.stroke(); }

    /* mission route */
    var obj = this.game.missions.getObjectivePosition();
    if (obj) {
      var ox = mx(obj.x), oz = my(obj.z);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(255,203,100,.72)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ox, oz); ctx.stroke();
      ctx.setLineDash([]);
      var pulse = 4 + Math.sin(this.game.time * 4) * 1.4;
      ctx.fillStyle = '#ffca61';
      ctx.beginPath(); ctx.arc(ox, oz, pulse + 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a2428';
      ctx.beginPath(); ctx.arc(ox, oz, pulse, 0, Math.PI * 2); ctx.fill();
    } else {
      var mission = this.game.missions.availableMission();
      if (mission) {
        var s = CH.MissionStarts[mission.id];
        var sx = mx(s.x), sy = my(s.z);
        ctx.fillStyle = '#ffca61';
        ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    /* police units */
    for (i = 0; i < this.game.police.units.length; i++) {
      var u = this.game.police.units[i];
      if (!u.mesh.visible) continue;
      var ux = mx(u.pos.x), uz = my(u.pos.z);
      ctx.fillStyle = Math.floor(this.game.time * 5) % 2 ? '#ff554f' : '#67a8ff';
      ctx.beginPath(); ctx.arc(ux, uz, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.38)'; ctx.lineWidth = 1; ctx.stroke();
    }
    /* traffic */
    for (i = 0; i < this.game.traffic.cars.length; i++) {
      var c = this.game.traffic.cars[i];
      if (!c.mesh.visible || c.owner !== 'traffic') continue;
      var d = U.dist2(c.pos.x, c.pos.z, px, pz);
      if (d > 150 * 150) continue;
      ctx.fillStyle = 'rgba(234,219,186,.45)';
      ctx.fillRect(mx(c.pos.x) - 1.2, my(c.pos.z) - 1.2, 2.4, 2.4);
    }
    /* coastline shells */
    for (i = 0; i < this.game.collectibles.length; i++) {
      var shell = this.game.collectibles[i];
      if (!shell.visible) continue;
      var sd = U.dist2(shell.position.x, shell.position.z, px, pz);
      if (sd > 180 * 180) continue;
      ctx.fillStyle = '#5fe5d1';
      ctx.beginPath(); ctx.arc(mx(shell.position.x), my(shell.position.z), 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 0.8; ctx.stroke();
    }
    /* player */
    var heading = player.heading;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(heading - Math.PI);
    ctx.fillStyle = '#fff3d6';
    ctx.strokeStyle = '#0b2428'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 7); ctx.lineTo(0, 4); ctx.lineTo(-6.5, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(248,236,210,.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, 78, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    this.el['map-district'].textContent = this.game.world.districtLabel(px, pz);
    this.el['map-coords'].textContent = 'X ' + Math.round(px) + ' · Z ' + Math.round(pz);
  };

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  HUD.prototype.setShellCount = function (n, total) {
    this.el['map-shells'].textContent = 'SHELLS ' + n + '/' + total;
  };

  CH.HUD = HUD;
}());
