/* COBALT HEAT — game loop and orchestration.
   Owns the renderer and ties the world, player, traffic, combat, police, missions and HUD together. */
(function () {
  'use strict';

  var CH = window.CH = window.CH || {};
  var U = CH.Util;
  var C = CH.CONFIG;
  var W = C.WORLD;
  var SAVE_KEY = 'cobalt-heat-marisol-v1';

  function Game(canvas) {
    this.canvas = canvas;
    this.time = 0;
    this.lastTime = 0;
    this.state = 'title';
    this.statePaused = false;
    this.vehicles = [];
    this.collectibles = [];
    this.shellCount = 0;
    this.shellTotal = 12;
    this.foundShells = {};
    this.clock = { minutes: W.startMinutes, day: 1, weather: 'clear' };
    this.worldTimer = 0;
    this.clockAccum = 0;
    this.autoSaveTimer = 0;
    this.lastMissionId = null;
    this.pendingRespawn = false;
    this.pendingBusted = false;
    this.titleTime = 0;
    this.shotName = null;
    this.shotFrozen = false;
    this.shotReady = false;
    this._lastHudState = '';
    this._tmp = new THREE.Vector3();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1600);
    this.camera.position.set(-150, 48, 235);
    this.camera.lookAt(-300, 8, 30);

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.sRGBEncoding !== undefined) this.renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping !== undefined) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
    }
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('shaderdebug')) {
      this.renderer.debug.checkShaderErrors = true;
      this.renderer.debug.onShaderError = function (gl, program, vs, fs) {
        console.log('[SHADER FAIL]', gl.getShaderInfoLog(vs) || '(vertex log empty)', gl.getShaderInfoLog(fs) || '(fragment log empty)', gl.getProgramInfoLog(program) || '(program log empty)');
      };
    } else {
      this.renderer.debug.checkShaderErrors = false;
    }

    this.input = new CH.Input(canvas);
    this.audio = new CH.Audio();
    this.world = new CH.World(this);
    this.cameraRig = new CH.CameraRig(this, this.camera);
    this.player = new CH.Player(this);
    this.effects = new CH.Effects(this);
    this.traffic = new CH.Traffic(this);
    this.combat = new CH.Combat(this);
    this.police = new CH.Police(this);
    this.missions = new CH.MissionSystem(this);
    this.hud = new CH.HUD(this);
    this.traffic.init();
    this.buildCollectibles();
    this.player.character.setVisible(false);
    this.hud.setScreen('title');
    this.hud.updateRadio();
    this.world.setTime(this.clock.minutes);
    this.traffic.update(0.016, this.player);
    this.resize();
    this._bindEvents();
    this.saveExists = this.hasSave();
    this._updateContinueButton();
  }

  Game.prototype._bindEvents = function () {
    var self = this;
    window.addEventListener('resize', function () { self.resize(); }, { passive: true });
    window.addEventListener('orientationchange', function () { setTimeout(function () { self.resize(); }, 120); }, { passive: true });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && self.state === 'play') self.togglePause(true);
    });
    this.canvas.addEventListener('click', function () {
      if (self.state === 'play' && !self.shotName) self.input.requestLock();
    });
  };

  Game.prototype.resize = function () {
    var w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  };

  Game.prototype.hasSave = function () {
    try { return !!window.localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  };

  Game.prototype._updateContinueButton = function () {
    var btn = document.getElementById('btn-continue');
    if (!btn) return;
    var has = this.hasSave();
    this.saveExists = has;
    btn.style.opacity = has ? '' : '.45';
    btn.title = has ? 'Continue your Marisol save' : 'No save data yet';
  };

  Game.prototype.start = function () {
    var self = this;
    this.lastTime = performance.now();
    function frame(now) {
      requestAnimationFrame(frame);
      self.frame(now);
    }
    requestAnimationFrame(frame);
  };

  Game.prototype.frame = function (now) {
    var dt = Math.min(0.05, (now - this.lastTime) / 1000 || 0.016);
    this.lastTime = now;
    if (dt <= 0) dt = 0.016;
    this.update(dt);
    this.render();
  };

  Game.prototype.update = function (dt) {
    this.time += dt;
    if (this.shotFrozen) return;
    if (this.state === 'paused') {
      if (this.input.consume('Escape')) {
        this.togglePause(false);
        return;
      }
      this.world.update(dt, this.player);
      this.effects.update(dt);
      this.audio.update(dt);
      return;
    }
    if (this.state === 'briefing') {
      if (this.input.consume('Escape')) {
        this.missions.pending = null;
        this.missions.state = 'idle';
        this.hud.hideBriefing();
        this.state = 'play';
        this.input.clear();
        this.hud.setScreen('play');
        return;
      }
      this.world.update(dt, this.player);
      this.effects.update(dt);
      this.audio.update(dt);
      return;
    }
    if (this.state === 'result') {
      if (this.input.consume('Escape')) this.closeResult();
      this.world.update(dt, this.player);
      this.effects.update(dt);
      this.audio.update(dt);
      return;
    }
    if (this.state === 'title') {
      this.updateTitle(dt);
      this.world.update(dt, this.player);
      this.effects.update(dt);
      this.audio.update(dt);
      return;
    }
    if (this.state !== 'play') return;

    this._handleActions();
    this.cameraRig.applyLook(dt);
    this.player.update(dt);
    this.combat.update(dt);
    this.traffic.update(dt, this.player);
    this.police.update(dt, this.player);
    this.missions.update(dt, this.player);
    this.updateCollectibles(dt);
    this.world.update(dt, this.player);
    this.cameraRig.follow(dt, this.player);
    this.effects.update(dt);
    this.hud.update(dt);
    this.audio.update(dt);
    this.audio.setEngine(this.player.inVehicle, this.player.currentVehicle ? this.player.currentVehicle.speed : 0);
    this.input.postUpdate();

    this.worldTimer += dt;
    this.clockAccum += dt;
    if (this.worldTimer > 0.5) {
      this.worldTimer = 0;
      this.clock.minutes += this.clockAccum * (1440 / W.dayLength);
      this.clockAccum = 0;
      if (this.clock.minutes >= 1440) {
        this.clock.minutes -= 1440;
        this.clock.day += 1;
      }
      this.world.setTime(this.clock.minutes);
    }
    this.autoSaveTimer += dt;
    if (this.autoSaveTimer > 55) {
      this.autoSaveTimer = 0;
      this.saveGame(true);
    }
    if (this.player.dead) { /* the result screen handles respawn */ }
  };

  Game.prototype._handleActions = function () {
    var input = this.input;
    if (input.consume('Escape')) {
      if (this.state === 'play') this.togglePause(true);
      return;
    }
    if (input.consume('KeyM')) {
      this.audio.toggleMute();
      this.hud.toast('AUDIO', this.audio.muted ? 'Muted.' : 'Sound on.');
    }
    if (input.consume('KeyF')) this.toggleFullscreen();
    if (this.state !== 'play') return;
    if (input.consume('KeyE')) {
      if (this.missions.interact(this.player)) return;
      if (this.player.toggleVehicle()) return;
    }
    if (input.consume('KeyQ')) this.hud.toggleWeaponWheel();
    if (input.consume('Tab') && this.missions.active) {
      this.hud.toast(this.missions.active.data.title, this.currentObjectiveLabel());
    }
  };

  Game.prototype.currentObjectiveLabel = function () {
    if (!this.missions.active) return '';
    var obj = this.missions.currentObjective();
    return obj ? obj.label : '';
  };

  Game.prototype.render = function () {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.renderer.render(this.scene, this.camera);
  };

  /* --------------------------------------------------------------- title */

  Game.prototype.updateTitle = function (dt) {
    this.titleTime += dt;
    var t = this.titleTime;
    var a = 0.36 + Math.sin(t * 0.035) * 0.07;
    var x = -238 + Math.cos(a) * 125 + Math.sin(t * 0.05) * 10;
    var z = 104 + Math.sin(a) * 125 + Math.cos(t * 0.042) * 8;
    this.camera.position.set(x, 44 + Math.sin(t * 0.22) * 3, z);
    this.camera.lookAt(-292, 9, 26);
    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();
    if (this.player) this.player.character.setVisible(false);
    this.clock.minutes = W.startMinutes + ((t * 0.035) % 45);
    if (Math.floor(t * 2) % 2 === 0) this.world.setTime(this.clock.minutes);
    this.traffic.update(dt, this.player);
    this.audio.update(dt);
    var titleWanted = document.getElementById('title-wanted');
    if (titleWanted) titleWanted.textContent = Math.ceil(this.police.wanted) + ' / 5 STARS';
  };

  /* ------------------------------------------------------------- new game */

  Game.prototype.startNewGame = function () {
    this.audio.unlock();
    this.missions.reset();
    this.combat.clearEnemies();
    this.police.clear();
    this.player.reset(W.spawn.x, W.spawn.z, Math.PI);
    this.player.character.setVisible(true);
    this.player.money = C.PLAYER.money;
    this.player.health = C.PLAYER.health;
    this.player.armor = C.PLAYER.armor;
    this.player.weapons = {
      fists: { owned: true, mag: 0, reserve: 0 },
      pistol: { owned: true, mag: 12, reserve: 96 },
      smg: { owned: false, mag: 0, reserve: 0 },
      shotgun: { owned: false, mag: 0, reserve: 0 }
    };
    this.player.weapon = 'pistol';
    this.player.applyWeaponVisual();
    this.player.speed = 0;
    this.foundShells = {};
    this.shellCount = 0;
    this.resetCollectibles();
    this.hud.setShellCount(0, this.shellTotal);
    this.clock.minutes = W.startMinutes;
    this.clock.day = 1;
    this.world.setTime(this.clock.minutes);
    this.cameraRig.clearShot();
    this.cameraRig.setMode('foot');
    this.cameraRig.yaw = Math.PI;
    this.cameraRig.pitch = -0.11;
    this.cameraRig.initialised = false;
    this.state = 'play';
    this.statePaused = false;
    this.input.clear();
    this.input.enabled = true;
    this.hud.setScreen('play');
    this.hud.setWanted(0);
    this.hud.setMission(null);
    this.hud.setBusted(0);
    this.hud.updateRadio();
    this.hud.toast('WELCOME TO MARISOL', 'Rosa is waiting at the garage. Follow the yellow beam.', 'money');
    var self = this;
    setTimeout(function () {
      if (self.state === 'play') self.hud.dialogue('ROSA VELA', 'Teo. The marina called. There is a red Avocet with your name on it. Bring it home.', 8);
    }, 900);
    this.hud.startPrompt();
    this.saveExists = true;
    this._updateContinueButton();
    this.saveGame(true);
  };

  Game.prototype.continueGame = function () {
    this.audio.unlock();
    var loaded = this.loadGame();
    if (!loaded) this.startNewGame();
  };

  Game.prototype.quitToTitle = function () {
    this.state = 'title';
    this.statePaused = false;
    this.togglePause(false, true);
    this.input.exitLock();
    this.player.character.setVisible(false);
    this.hud.setScreen('title');
    this.hud.hideResult();
    this.hud.hideBriefing();
    this.hud.showPauseScreen(false);
    this.hud.setMission(null);
    this.titleTime = 0;
    this._updateContinueButton();
    this.audio.setEngine(false, 0);
    this.audio.setSiren(false);
  };

  Game.prototype.togglePause = function (force, silent) {
    var on = force == null ? this.state !== 'paused' : force;
    if (on && this.state === 'play') {
      this.state = 'paused';
      this.statePaused = true;
      this.input.exitLock();
      this.hud.setScreen('paused');
      this.audio.setEngine(false, 0);
    } else if (!on && (this.state === 'paused' || this.statePaused)) {
      this.state = 'play';
      this.statePaused = false;
      this.input.enabled = true;
      this.input.clear();
      this.hud.setScreen('play');
      this.hud.showPauseScreen(false);
      if (!silent) this.hud.startPrompt();
    }
  };

  Game.prototype.beginBriefing = function () {
    if (this.state !== 'briefing') return;
    this.missions.begin();
    this.hud.hideBriefing();
    this.state = 'play';
    this.input.clear();
    this.input.enabled = true;
    this.lastMissionId = this.missions.active ? this.missions.active.id : this.lastMissionId;
    this.hud.setScreen('play');
  };

  Game.prototype.closeResult = function () {
    this.hud.hideResult();
    if (this.pendingRespawn) {
      this.pendingRespawn = false;
      this.pendingBusted = false;
      this.player.respawn();
      this.player.dead = false;
      this.player.character.alive = true;
      this.player.character.setVisible(true);
      this.player.character.mode = 'idle';
      this.player.character.root.rotation.z = 0;
    }
    this.state = 'play';
    this.statePaused = false;
    this.input.enabled = true;
    this.input.clear();
    this.hud.setScreen('play');
    this.hud.setMission(null);
    this.cameraRig.initialised = false;
  };

  Game.prototype.retryMission = function () {
    this.hud.hideResult();
    this.pendingRespawn = false;
    this.pendingBusted = false;
    if (this.player.dead) {
      this.player.dead = false;
      this.player.health = 100;
      this.player.character.alive = true;
      this.player.character.setVisible(true);
      this.player.character.mode = 'idle';
      this.player.character.root.rotation.z = 0;
    }
    this.state = 'play';
    this.hud.setScreen('play');
    this.input.enabled = true;
    this.input.clear();
    if (this.lastMissionId) {
      this.missions.start(this.lastMissionId);
    } else {
      this.missions.reset();
    }
  };

  Game.prototype.restartMission = function () {
    this.togglePause(false);
    if (this.missions.active) this.missions.start(this.missions.active.id);
    else if (this.lastMissionId) this.missions.start(this.lastMissionId);
    else this.hud.toast('NO ACTIVE JOB', 'Find a yellow beam to start a mission.');
  };

  Game.prototype.onPlayerDeath = function () {
    this.pendingRespawn = true;
    this.pendingBusted = false;
    this.input.exitLock();
    this.audio.setEngine(false, 0);
    if (this.missions.active) {
      this.lastMissionId = this.missions.active.id;
      this.missions.fail('Teo was wasted. The job is blown.');
      this.state = 'result';
    } else {
      this.state = 'result';
      this.hud.showResult({
        success: false, title: 'WASTED', subtitle: 'The coast wins this round.',
        payout: 0, rank: 'F', time: '--', retry: false,
        message: 'Clara Vista Hospital will patch you up for a fee. The city will still be here.'
      });
    }
  };

  Game.prototype.onBusted = function () {
    if (this.player.dead) return;
    this.pendingRespawn = true;
    this.pendingBusted = true;
    this.police.clear();
    this.input.exitLock();
    this.state = 'result';
    this.player.dead = true;
    this.hud.showResult({
      success: false, title: 'BUSTED', subtitle: 'Marisol P.D. got the cuffs on you.',
      payout: 0, rank: 'F', time: '--', retry: false,
      message: 'A night in the cells, a fine, and a ride back to the hospital. The city keeps score.'
    });
    this.hud.setBusted(0);
  };

  Game.prototype.toggleFullscreen = function () {
    try {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    } catch (e) { /* optional */ }
  };

  /* -------------------------------------------------------------- saving */

  Game.prototype.saveGame = function (silent) {
    if (this.shotName) return;
    try {
      var data = {
        version: 1,
        savedAt: Date.now(),
        player: {
          x: this.player.pos.x, z: this.player.pos.z, heading: this.player.heading,
          money: this.player.money, health: this.player.health, armor: this.player.armor,
          weapon: this.player.weapon, weapons: this.player.weapons
        },
        clock: { minutes: this.clock.minutes, day: this.clock.day },
        progress: this.missions.progress,
        shells: this.foundShells
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      this.saveExists = true;
      this.hud.showSave();
      if (!silent) this.hud.toast('GAME SAVED', 'Marisol remembers where you left off.');
      this._updateContinueButton();
    } catch (e) {
      if (!silent) this.hud.toast('SAVE FAILED', 'Local storage is unavailable.');
    }
  };

  Game.prototype.saveProgress = function () {
    if (!this.shotName) this.saveGame(true);
  };

  Game.prototype.loadGame = function () {
    var raw = null;
    try { raw = window.localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    try {
      var data = JSON.parse(raw);
      if (!data || data.version !== 1) return false;
      this.missions.load({ progress: data.progress || {} });
      this.combat.clearEnemies();
      this.police.clear();
      var p = data.player || {};
      this.player.reset(p.x != null ? p.x : W.spawn.x, p.z != null ? p.z : W.spawn.z, p.heading != null ? p.heading : Math.PI);
      this.player.money = p.money != null ? p.money : C.PLAYER.money;
      this.player.health = p.health != null ? p.health : 100;
      this.player.armor = p.armor != null ? p.armor : 0;
      if (p.weapons) this.player.weapons = p.weapons;
      if (p.weapon) this.player.weapon = p.weapon;
      this.player.applyWeaponVisual();
      this.clock.minutes = data.clock && data.clock.minutes != null ? data.clock.minutes : W.startMinutes;
      this.clock.day = data.clock && data.clock.day ? data.clock.day : 1;
      this.foundShells = data.shells || {};
      this.shellCount = Object.keys(this.foundShells).length;
      this.resetCollectibles(true);
      this.world.setTime(this.clock.minutes);
      this.hud.setShellCount(this.shellCount, this.shellTotal);
      this.hud.setWeapon(this.player.weapon);
      this.hud.setMission(null);
      this.hud.setBusted(0);
      this.cameraRig.clearShot();
      this.cameraRig.setMode('foot');
      this.cameraRig.yaw = Math.PI;
      this.cameraRig.pitch = -0.11;
      this.cameraRig.initialised = false;
      this.player.character.setVisible(true);
      this.state = 'play';
      this.input.clear();
      this.input.enabled = true;
      this.hud.setScreen('play');
      this.hud.updateRadio();
      var self = this;
      setTimeout(function () { self.hud.toast('WELCOME BACK', 'Marisol kept your parking spot.'); }, 500);
      this.saveExists = true;
      this._updateContinueButton();
      return true;
    } catch (e) {
      return false;
    }
  };

  /* ---------------------------------------------------------- collectibles */

  Game.prototype.buildCollectibles = function () {
    var pts = [
      [-411, 132], [-398, -44], [-396, 262], [34, 23], [-108, 138],
      [278, -218], [298, 284], [143, 294], [-447, 301], [89, 89], [-4, -273], [-96, 356]
    ];
    for (var i = 0; i < pts.length; i++) {
      var g = new THREE.Group();
      var mat = new THREE.MeshStandardMaterial({ color: 0x65e6d4, emissive: 0x1a8b83, emissiveIntensity: 0.75, metalness: 0.3, roughness: 0.24 });
      var shell = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      shell.rotation.x = Math.PI;
      shell.scale.set(1.3, 1, 1.1);
      shell.castShadow = true;
      g.add(shell);
      var ridgeMat = new THREE.MeshBasicMaterial({ color: 0xc6fff3 });
      for (var r = 0; r < 5; r++) {
        var ridge = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.13, 0.55), ridgeMat);
        ridge.rotation.y = r / 5 * Math.PI * 2;
        ridge.position.set(Math.sin(ridge.rotation.y) * 0.18, 0.04, Math.cos(ridge.rotation.y) * 0.18);
        g.add(ridge);
      }
      var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: U.glowTexture('rgba(120,255,235,.9)', 'rgba(40,210,190,.3)'), color: 0x65e6d4, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.setScalar(2.4);
      g.add(glow);
      var pos = new THREE.Vector3(pts[i][0], this.world.groundHeight(pts[i][0], pts[i][1]) + 0.95, pts[i][1]);
      g.position.copy(pos);
      g.userData = { id: i, baseY: pos.y, found: !!this.foundShells[i] };
      g.visible = !g.userData.found;
      this.scene.add(g);
      this.collectibles.push(g);
    }
    this.hud.setShellCount(this.shellCount, this.shellTotal);
  };

  Game.prototype.updateCollectibles = function (dt) {
    for (var i = 0; i < this.collectibles.length; i++) {
      var g = this.collectibles[i];
      if (!g.visible) continue;
      g.rotation.y += dt * 1.8;
      g.position.y = g.userData.baseY + Math.sin(this.time * 2.2 + i) * 0.14;
      var d = U.dist2(g.position.x, g.position.z, this.player.pos.x, this.player.pos.z);
      if (d < 2.4 * 2.4) this.collectShell(g);
    }
  };

  Game.prototype.collectShell = function (g) {
    if (!g.visible) return;
    g.visible = false;
    g.userData.found = true;
    this.foundShells[g.userData.id] = true;
    this.shellCount++;
    this.hud.setShellCount(this.shellCount, this.shellTotal);
    this.player.addMoney(150);
    this.effects.muzzle(g.position.x, g.position.y, g.position.z, new THREE.Vector3(0, 1, 0), 1.2);
    this.audio.pickup();
    if (this.shellCount >= this.shellTotal) {
      this.player.addMoney(1500);
      this.hud.toast('COAST COLLECTOR', 'All 12 shells found. Rosa adds a $1,500 stash bonus.', 'money');
    } else {
      this.hud.toast('SHELL FOUND ' + this.shellCount + ' / ' + this.shellTotal, '$150 added to your stash.', 'money');
    }
    this.saveProgress();
  };

  Game.prototype.resetCollectibles = function (keepFound) {
    for (var i = 0; i < this.collectibles.length; i++) {
      var g = this.collectibles[i];
      g.visible = !this.foundShells[i];
      g.userData.found = !!this.foundShells[i];
    }
    this.hud.setShellCount(this.shellCount, this.shellTotal);
  };

  /* --------------------------------------------------------------- shots */

  Game.prototype.setupShot = function (name, seed) {
    this.shotName = name;
    this.shotReady = false;
    this.shotFrozen = false;
    this.state = 'play';
    this.input.clear();
    this.input.enabled = false;
    this.hud.setScreen('shot');
    var shots = new CH.Shots(this);
    shots.setup(name || 'hero', seed);
    this.shotFrozen = true;
    this.shotReady = true;
    document.body.classList.add('is-shot');
    return shots;
  };

  CH.Game = Game;
  CH.SAVE_KEY = SAVE_KEY;
}());

// Recording check: game module reviewed for the live capture.
