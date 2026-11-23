/* COBALT HEAT — story missions and side work.
   Mission state, objective phases, markers, actors, timers, dialogue, rewards and progression. */
(function () {
  'use strict';

  var CH = window.CH = window.CH || {};
  var U = CH.Util;
  var C = CH.CONFIG;

  var STARTS = {
    firstTide: { x: -252, z: 188 },
    shoreLeave: { x: -240, z: 84 },
    redline: { x: 24, z: 194 },
    longPier: { x: -420, z: 296 },
    heavyCargo: { x: -118, z: -352 },
    kingTide: { x: 286, z: 286 }
  };

  function createBeam(color, height) {
    var group = new THREE.Group();
    var beamMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    var beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.1, height || 12, 16, 1, true), beamMat);
    beam.position.y = (height || 12) / 2;
    group.add(beam);
    var ringMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    var ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.09, 6, 28), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.18;
    group.add(ring);
    var diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), new THREE.MeshBasicMaterial({ color: color }));
    diamond.position.y = 3.1;
    group.add(diamond);
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: U.glowTexture('rgba(255,245,206,.95)', 'rgba(255,190,75,.4)'), color: color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(4.5);
    glow.position.y = 2.6;
    group.add(glow);
    group.userData = { beam: beam, ring: ring, diamond: diamond, glow: glow, label: null };
    return group;
  }

  function markerLabel(text, sub, color) {
    var canvas = U.makeCanvas(640, 160);
    var x = canvas.getContext('2d');
    x.clearRect(0, 0, 640, 160);
    x.fillStyle = 'rgba(7,25,28,0.82)';
    x.fillRect(10, 24, 620, 110);
    x.strokeStyle = color || '#ffcf68'; x.lineWidth = 4; x.strokeRect(10, 24, 620, 110);
    x.fillStyle = color || '#ffcf68'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 42px "Arial Narrow", Impact, sans-serif';
    x.fillText(text.toUpperCase(), 320, 68);
    x.font = '700 22px "Arial Narrow", sans-serif';
    x.fillStyle = '#f5e7cb';
    x.fillText(sub || 'PRESS E', 320, 108);
    var tex = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    var spr = new THREE.Sprite(mat);
    spr.scale.set(8.6, 2.15, 1);
    spr.position.y = 5.6;
    return spr;
  }

  function MissionSystem(game) {
    this.game = game;
    this.progress = {};
    this.active = null;
    this.state = 'idle';
    this.pending = null;
    this.marker = createBeam('#ffd166', 13);
    this.marker.visible = false;
    this.marker.userData.label = markerLabel('FIRST TIDE', 'PRESS E', '#ffd166');
    this.marker.add(this.marker.userData.label);
    this.game.scene.add(this.marker);
    this.sideMarker = createBeam('#55d9c6', 10);
    this.sideMarker.visible = false;
    this.sideMarker.userData.label = markerLabel('COVE COURIER', 'SIDE JOB · PRESS E', '#55d9c6');
    this.sideMarker.add(this.sideMarker.userData.label);
    this.game.scene.add(this.sideMarker);
    this.markerTarget = null;
    this.time = 0;
    this.storyComplete = false;
    this.actors = [];
    this.phaseSpawned = {};
    this.checkpoint = 0;
    this.courierIndex = 0;
    this._tmp = new THREE.Vector3();
  }

  MissionSystem.prototype.availableMission = function () {
    for (var i = 0; i < C.MISSION_ORDER.length; i++) {
      var id = C.MISSION_ORDER[i];
      if (this.progress[id]) continue;
      var m = C.MISSIONS[id];
      if (m.requires && !this.progress[m.requires]) continue;
      return m;
    }
    return null;
  };

  MissionSystem.prototype.nextMissionNumber = function () {
    var m = this.availableMission();
    return m ? m.number : C.MISSION_ORDER.length + 1;
  };

  MissionSystem.prototype.setProgress = function (progress) {
    this.progress = progress || {};
    this.storyComplete = !this.availableMission();
    this.updateIdleMarkers();
  };

  MissionSystem.prototype.updateIdleMarkers = function () {
    if (this.active) {
      this.marker.visible = false;
      this.sideMarker.visible = false;
      return;
    }
    var m = this.availableMission();
    if (m) {
      var s = STARTS[m.id];
      this.marker.position.set(s.x, 0.2, s.z);
      this.marker.visible = true;
      this.updateMarkerLabel(this.marker, m.title, 'MISSION ' + U.pad(m.number) + ' · PRESS E', '#ffd166');
    } else {
      this.marker.visible = false;
      this.storyComplete = true;
    }
    var side = C.SIDE_JOBS[0];
    this.sideMarker.position.set(side.x, 0.24, side.z);
    this.sideMarker.visible = true;
  };

  MissionSystem.prototype.updateMarkerLabel = function (marker, title, sub, color) {
    if (marker.userData.labelText === title + sub) return;
    marker.userData.labelText = title + sub;
    var old = marker.userData.label;
    if (old) {
      marker.remove(old);
      if (old.material.map) old.material.map.dispose();
      old.material.dispose();
    }
    var label = markerLabel(title, sub, color);
    marker.userData.label = label;
    marker.add(label);
  };

  MissionSystem.prototype.openBriefing = function (id) {
    var mission = C.MISSIONS[id];
    if (!mission) return false;
    this.pending = id;
    this.state = 'briefing';
    this.game.state = 'briefing';
    this.game.input.exitLock();
    this.game.hud.showBriefing(mission);
    return true;
  };

  MissionSystem.prototype.begin = function () {
    if (!this.pending) return;
    var id = this.pending;
    this.pending = null;
    this.start(id);
    this.game.state = 'play';
    this.game.hud.hideBriefing();
  };

  MissionSystem.prototype.start = function (id) {
    var data = C.MISSIONS[id];
    if (!data) return;
    this.game.lastMissionId = id;
    this.clearActors();
    this.active = {
      id: id,
      data: data,
      stepIndex: 0,
      timeLeft: data.time,
      maxTime: data.time,
      kills: 0,
      boss: null,
      completed: false,
      failed: false,
      startedAt: this.game.time,
      vehicle: null
    };
    this.phaseSpawned = {};
    this.checkpoint = 0;
    this.state = 'active';
    this.game.state = 'play';
    this.marker.visible = true;
    this.sideMarker.visible = false;
    this.game.hud.setMission(data, data.objectives[0].label, data.time);
    this.game.hud.dialogue(C.CONTACTS[data.giver].name, data.brief[0], 7);
    this.game.audio.stinger(true);
    this.spawnPhaseActors(0);
    this.setObjectiveMarker(0);
    this.game.saveProgress();
  };

  MissionSystem.prototype.startDirect = function (id, stepIndex) {
    this.start(id);
    if (stepIndex) this.setStep(stepIndex, true);
  };

  MissionSystem.prototype.currentObjective = function () {
    if (!this.active) return null;
    return this.active.data.objectives[this.active.stepIndex] || null;
  };

  MissionSystem.prototype.setStep = function (index, silent) {
    if (!this.active) return;
    var objs = this.active.data.objectives;
    if (index >= objs.length) return this.complete();
    this.active.stepIndex = index;
    this.active.kills = 0;
    this.checkpoint = 0;
    this.spawnPhaseActors(index);
    this.setObjectiveMarker(index);
    var obj = objs[index];
    if (!silent) {
      this.game.hud.setObjective(obj.label, 0);
      this.game.hud.setMission(this.active.data, obj.label, this.active.timeLeft);
    }
    if (obj.type === 'evade') this.game.police.addWanted(2, 'MISSION SUSPECT');
    if (obj.type === 'kill' || obj.type === 'killBoss') {
      this.game.audio.stinger(false);
    }
  };

  MissionSystem.prototype.setObjectiveMarker = function (index) {
    var obj = this.active.data.objectives[index];
    if (!obj) return;
    var pos = this.objectivePosition(obj);
    if (pos) {
      this.marker.position.set(pos.x, 0.2, pos.z);
      this.marker.visible = true;
      var sub = obj.type === 'kill' ? 'HOSTILES · CLEAR THE AREA' : obj.type === 'evade' ? 'BREAK LINE OF SIGHT' : 'OBJECTIVE';
      this.updateMarkerLabel(this.marker, obj.label, sub, '#ffd166');
    }
  };

  MissionSystem.prototype.objectivePosition = function (obj) {
    if (!this.active) return null;
    if (obj.type === 'goto' || obj.type === 'drive' || obj.type === 'driveTo') return { x: obj.x, z: obj.z };
    if (obj.type === 'vehicle' || obj.type === 'steal') {
      var car = this.findMissionVehicle(obj.vehicle);
      if (car) return { x: car.pos.x, z: car.pos.z };
      return null;
    }
    if (obj.type === 'checkpoints') {
      var pts = obj.points;
      return pts ? { x: pts[this.checkpoint][0], z: pts[this.checkpoint][1] } : null;
    }
    if (obj.type === 'kill' || obj.type === 'killBoss') {
      var alive = this.aliveActors();
      if (alive.length) return { x: alive[0].pos.x, z: alive[0].pos.z };
      return null;
    }
    if (obj.type === 'evade') {
      return null;
    }
    return null;
  };

  MissionSystem.prototype.findMissionVehicle = function (type) {
    if (this.active && this.active.vehicle && this.active.vehicle.type === type && this.active.vehicle.mesh.visible) return this.active.vehicle;
    for (var i = 0; i < this.game.vehicles.length; i++) {
      var v = this.game.vehicles[i];
      if (v.type === type && v.mesh.visible && v.owner !== 'police') return v;
    }
    return null;
  };

  MissionSystem.prototype.spawnVehicle = function (type, x, z, heading, color) {
    var car = new CH.Vehicle(this.game, type, { x: x, z: z, heading: heading, color: color, owner: 'mission' });
    car.parked = true;
    car.owner = 'mission';
    this.game.vehicles.push(car);
    this.active.vehicle = car;
    return car;
  };

  MissionSystem.prototype.spawnPhaseActors = function (index) {
    if (!this.active) return;
    var mission = this.active.data;
    var obj = mission.objectives[index];
    if (!obj) return;
    var key = mission.id + ':' + index;
    if (this.phaseSpawned[key]) return;
    var game = this.game;

    if (mission.id === 'firstTide' && index === 1) {
      this.phaseSpawned[key] = true;
      this.spawnVehicle('avocet', -380, 340, Math.PI * 0.08, '#f05a4f');
    }
    if (mission.id === 'shoreLeave' && index === 3) {
      this.phaseSpawned[key] = true;
      var spots = [[-292, 218, 1.1], [-268, 236, -1.4], [-300, 248, 2.4]];
      for (var i = 0; i < spots.length; i++) {
        var e = game.combat.spawnEnemy({ kind: 'guard', faction: 'guard', health: 58, weapon: i === 1 ? 'smg' : 'pistol', x: spots[i][0], z: spots[i][1], yaw: spots[i][2], name: 'SABLE COLLECTOR', accuracy: 0.46 });
        e._missionRole = 'guard';
        e.char.root.rotation.y = spots[i][2];
        this.actors.push(e);
      }
    }
    if (mission.id === 'longPier' && index === 1) {
      this.phaseSpawned[key] = true;
      var pierSpots = [[-430, 294, 0.4], [-420, 314, -0.6], [-450, 316, -0.5], [-442, 330, 1.2], [-464, 302, 0.9]];
      for (i = 0; i < pierSpots.length; i++) {
        var pe = game.combat.spawnEnemy({ kind: i === 2 ? 'boss' : 'guard', faction: 'guard', health: i === 2 ? 105 : 60, weapon: i === 3 ? 'smg' : 'pistol', x: pierSpots[i][0], z: pierSpots[i][1], yaw: pierSpots[i][2], name: i === 2 ? 'CORMORANT ENFORCER' : 'CORMORANT CREW', accuracy: 0.48 });
        pe._missionRole = 'guard';
        this.actors.push(pe);
      }
    }
    if (mission.id === 'kingTide' && index === 1) {
      this.phaseSpawned[key] = true;
      var estateSpots = [[286, 278, 0.3], [310, 282, -0.4], [334, 284, 2.9], [350, 308, 2.4], [342, 334, 2.0], [300, 332, 0.7]];
      for (i = 0; i < estateSpots.length; i++) {
        var ge = game.combat.spawnEnemy({ kind: 'guard', faction: 'guard', health: 66, weapon: i % 2 ? 'pistol' : 'smg', x: estateSpots[i][0], z: estateSpots[i][1], yaw: estateSpots[i][2], name: 'MIRAMAR SECURITY', accuracy: 0.5 });
        ge._missionRole = 'guard';
        this.actors.push(ge);
      }
      game.police.addWanted(2, 'ESTATE ALARM');
    }
    if (mission.id === 'kingTide' && index === 3) {
      this.phaseSpawned[key] = true;
      var boss = game.combat.spawnEnemy({ kind: 'boss', faction: 'guard', boss: true, health: 240, weapon: 'smg', x: 334, z: 336, yaw: Math.PI, name: 'MARCUS BISHOP', accuracy: 0.63, seed: 'bishop' });
      boss._missionRole = 'boss';
      this.actors.push(boss);
      this.active.boss = boss;
      game.police.addWanted(3, 'MAJOR INCIDENT');
      game.hud.dialogue('MARCUS BISHOP', 'You should have taken the money, Teo. You always were a romantic.', 8);
    }
    if (mission.id === 'heavyCargo' && index === 1) {
      this.phaseSpawned[key] = true;
      this.spawnVehicle('balandra', -118, -352, 0, '#7e897b');
    }
    if (mission.id === 'redline' && index === 0) {
      this.phaseSpawned[key] = true;
      if (!game.player.currentVehicle) this.spawnVehicle('avocet', 14, 194, 0, '#f05a4f');
    }
    this.markActorsSpawned = true;
  };

  MissionSystem.prototype.update = function (dt, player) {
    this.time += dt;
    this.animateMarkers(dt);
    if (this.state !== 'active' || !this.active) {
      if (this.state === 'idle' && player && !this.availableMission()) {
        this.storyComplete = true;
      }
      return;
    }
    var active = this.active;
    active.timeLeft -= dt;
    if (active.timeLeft <= 0) {
      active.timeLeft = 0;
      this.fail('The clock ran out.');
      return;
    }
    var obj = this.currentObjective();
    if (!obj) return this.complete();
    var pos = this.objectivePosition(obj);
    var dist = pos ? U.dist(player.pos.x, player.pos.z, pos.x, pos.z) : 999;
    var inCar = !!player.currentVehicle;

    switch (obj.type) {
      case 'goto':
        if (dist < (obj.radius || 8)) this.advance();
        break;
      case 'drive':
      case 'driveTo':
        if (inCar && dist < (obj.radius || 9)) this.advance();
        break;
      case 'vehicle':
      case 'steal':
        if (inCar && player.currentVehicle.type === obj.vehicle) this.advance();
        break;
      case 'checkpoints':
        if (inCar && dist < (obj.radius || 10)) {
          this.checkpoint++;
          if (this.checkpoint >= obj.points.length) this.advance();
          else {
            this.game.hud.setObjective(obj.label, this.checkpoint / obj.points.length);
            this.setObjectiveMarker(active.stepIndex);
            this.game.hud.toast('CHECKPOINT ' + this.checkpoint + ' / ' + obj.points.length, 'Keep the car moving.');
            this.game.audio.pickup();
          }
        }
        break;
      case 'kill':
        if (active.kills >= obj.count) this.advance();
        break;
      case 'killBoss':
        if (active.boss && !active.boss.alive) this.advance();
        break;
      case 'evade':
        if (this.game.police.wanted <= 0.06) this.advance();
        break;
      default:
        if (dist < (obj.radius || 8)) this.advance();
    }

    if (this.active) {
      var timer = U.formatTime(active.timeLeft);
      this.game.hud.setTimer(timer, active.timeLeft / active.maxTime);
      if (obj.type === 'kill') this.game.hud.setObjective(obj.label, active.kills / obj.count);
      else if (obj.type === 'killBoss' && active.boss) this.game.hud.setObjective(obj.label, 1 - active.boss.health / active.boss.maxHealth);
      var p = this.objectivePosition(obj);
      this.markerTarget = p;
      if (p && (obj.type === 'vehicle' || obj.type === 'steal')) {
        this.marker.position.set(p.x, 0.2, p.z);
      }
    }
  };

  MissionSystem.prototype.animateMarkers = function (dt) {
    var t = this.time;
    var list = [this.marker, this.sideMarker];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m.visible) continue;
      m.userData.diamond.rotation.y += dt * 1.4;
      m.userData.diamond.position.y = 3.05 + Math.sin(t * 2.2 + i) * 0.18;
      var pulse = 1 + Math.sin(t * 2.6 + i) * 0.06;
      m.userData.ring.scale.set(pulse, pulse, pulse);
      m.userData.ring.rotation.z += dt * 0.6;
      m.userData.beam.material.opacity = 0.1 + Math.sin(t * 2.2 + i) * 0.035;
    }
  };

  MissionSystem.prototype.advance = function () {
    if (!this.active) return;
    var next = this.active.stepIndex + 1;
    if (next >= this.active.data.objectives.length) return this.complete();
    this.game.audio.pickup();
    var line = this.nextLine(this.active.data, next);
    if (line) this.game.hud.dialogue(C.CONTACTS[this.active.data.giver].name, line, 6);
    this.setStep(next);
  };

  MissionSystem.prototype.nextLine = function (mission, index) {
    var lines = {
      firstTide: ['Now bring it home before the harbor patrol notices.'],
      shoreLeave: ['That ledger is worth more than the car. Do not lose it.', 'Good. Now lose the police before they write your name down.'],
      redline: ['The start line is yours. Make the city remember it.', 'Clean run. Dez is waiting at the garage.'],
      longPier: ['The crew is on the pier. Make it loud.', 'The manifest is in the office at the end of the dock.', 'Juno is wiping the cameras. Go.'],
      heavyCargo: ['The Balandra is in the yard. Take it whole.', 'Get it to the docks. The buyer is already counting.', 'Now lose the tail.'],
      kingTide: ['The gate is open. Bishop is inside.', 'The captain is in the courtyard. Put him down.', 'This is the last one, Teo. Make it count.', 'It is done. Come home.']
    };
    var arr = lines[mission.id];
    return arr ? arr[Math.min(index - 1, arr.length - 1)] : null;
  };

  MissionSystem.prototype.complete = function () {
    if (!this.active) return;
    var active = this.active;
    active.completed = true;
    this.state = 'complete';
    this.marker.visible = false;
    var bonus = Math.round(active.timeLeft * 7);
    var payout = active.data.reward + bonus;
    var rank = active.timeLeft > active.maxTime * 0.5 ? 'A' : active.timeLeft > active.maxTime * 0.22 ? 'B' : 'C';
    this.progress[active.id] = true;
    this.game.player.addMoney(payout);
    this.game.hud.setMission(null);
    this.game.hud.clearTimer();
    this.game.hud.showResult({
      success: true,
      title: active.data.title,
      subtitle: active.data.tagline,
      payout: payout,
      bonus: bonus,
      rank: rank,
      time: this.formatElapsed(active.maxTime - active.timeLeft),
      message: this.endingLine(active.id)
    });
    this.game.audio.stinger(true);
    this.game.saveProgress();
    this.clearActors();
    this.active = null;
    this.state = 'idle';
    this.game.state = 'result';
    this.storyComplete = !this.availableMission();
    this.updateIdleMarkers();
  };

  MissionSystem.prototype.endingLine = function (id) {
    var lines = {
      firstTide: 'The Avocet is home. Rosa leaves the keys on the counter and does not ask about the scratch.',
      shoreLeave: 'Sable is out of the hotel business. Juno has the ledger, and half of Calle Rosa owes you a drink.',
      redline: 'The city saw the run. Dez says the buyer wants a meeting, which is either very good or very bad.',
      longPier: 'The manifest names every ship Bishop owns. Rosa calls it leverage. Juno calls it a countdown.',
      heavyCargo: 'The truck is unloaded. Whatever is inside is worth more than the whole South Tide yard.',
      kingTide: 'The tide comes in over Casa Miramar. For the first time, Marisol feels like it might be yours.'
    };
    return lines[id] || 'Another day, another debt settled.';
  };

  MissionSystem.prototype.fail = function (reason) {
    if (!this.active) return;
    var active = this.active;
    this.state = 'failed';
    this.marker.visible = false;
    this.game.hud.setMission(null);
    this.game.hud.clearTimer();
    this.game.hud.showResult({
      success: false,
      title: active.data.title,
      subtitle: reason,
      payout: 0,
      rank: 'F',
      time: this.formatElapsed(active.maxTime - active.timeLeft),
      message: 'The city does not hand out second chances. It does hand out retries.'
    });
    this.game.audio.stinger(false);
    this.clearActors();
    this.active = null;
    this.game.state = 'result';
    this.updateIdleMarkers();
  };

  MissionSystem.prototype.formatElapsed = function (sec) {
    return U.formatTime(sec);
  };

  MissionSystem.prototype.onEnemyKilled = function (enemy) {
    if (!this.active) return;
    var obj = this.currentObjective();
    if (!obj) return;
    if (obj.type === 'kill' && enemy.faction === 'guard') {
      this.active.kills++;
      this.game.hud.setObjective(obj.label, this.active.kills / obj.count);
      this.game.hud.toast('TARGET DOWN', enemy.name + ' · ' + this.active.kills + ' / ' + obj.count);
    }
    if (obj.type === 'killBoss' && enemy.boss) {
      this.game.hud.toast('KING TIDE', 'Bishop is finished.');
    }
  };

  MissionSystem.prototype.aliveActors = function () {
    var out = [];
    for (var i = 0; i < this.actors.length; i++) if (this.actors[i].alive) out.push(this.actors[i]);
    return out;
  };

  MissionSystem.prototype.clearActors = function () {
    for (var i = 0; i < this.actors.length; i++) {
      var e = this.actors[i];
      if (e.char && e.char.root.parent) e.char.root.parent.remove(e.char.root);
      if (e.barSprite && e.barSprite.parent) e.barSprite.parent.remove(e.barSprite);
      var idx = this.game.combat.enemies.indexOf(e);
      if (idx >= 0) this.game.combat.enemies.splice(idx, 1);
    }
    this.actors.length = 0;
  };

  MissionSystem.prototype.interact = function (player) {
    if (this.state !== 'idle' || this.active) return false;
    var m = this.availableMission();
    if (m) {
      var s = STARTS[m.id];
      if (U.dist(player.pos.x, player.pos.z, s.x, s.z) < 4.6) {
        this.openBriefing(m.id);
        return true;
      }
    }
    var side = C.SIDE_JOBS[0];
    if (U.dist(player.pos.x, player.pos.z, side.x, side.z) < 4.4) {
      this.startCourier();
      return true;
    }
    return false;
  };

  MissionSystem.prototype.startCourier = function () {
    if (this.active) return;
    var data = {
      id: 'courier', number: 0, title: 'COVE COURIER', giver: 'juno', area: 'CENTRO SOL',
      reward: 650, time: 105, tagline: 'Get it across town before it melts.',
      brief: ['Three drops, one scooter, no questions. Juno will mark the doors.'],
      objectives: [
        { type: 'driveTo', x: -90, z: 180, radius: 10, label: 'DELIVER TO MERCADO VIEJO' },
        { type: 'driveTo', x: 180, z: 0, radius: 10, label: 'DELIVER TO ALTO MAR' },
        { type: 'driveTo', x: -360, z: 270, radius: 10, label: 'DELIVER TO THE PIER' }
      ]
    };
    this.active = { id: 'courier', data: data, stepIndex: 0, timeLeft: data.time, maxTime: data.time, kills: 0, boss: null, completed: false, failed: false, startedAt: this.game.time, vehicle: null };
    this.state = 'active';
    this.marker.visible = true;
    this.sideMarker.visible = false;
    this.game.hud.setMission(data, data.objectives[0].label, data.time);
    this.game.hud.dialogue('JUNO PARK', 'Three drops. Do not stop for the police, the radio, or anybody selling anything.', 7);
    this.setObjectiveMarker(0);
    if (!this.game.player.currentVehicle) {
      this.spawnVehicle('gull', 72, 164, Math.PI, '#59c8bb');
    }
  };

  MissionSystem.prototype.getHudState = function () {
    if (!this.active) return null;
    var obj = this.currentObjective();
    var pos = obj ? this.objectivePosition(obj) : null;
    return {
      title: this.active.data.title,
      giver: this.active.data.giver,
      objective: obj ? obj.label : '',
      progress: this.active.kills || this.checkpoint || 0,
      timeLeft: this.active.timeLeft,
      pos: pos
    };
  };

  MissionSystem.prototype.getObjectivePosition = function () {
    var obj = this.currentObjective();
    if (!obj) return null;
    return this.objectivePosition(obj);
  };

  MissionSystem.prototype.save = function () {
    return { progress: Object.assign({}, this.progress) };
  };

  MissionSystem.prototype.load = function (save) {
    if (!save) return;
    this.progress = Object.assign({}, save.progress || {});
    this.active = null;
    this.state = 'idle';
    this.updateIdleMarkers();
  };

  MissionSystem.prototype.reset = function () {
    this.progress = {};
    this.active = null;
    this.state = 'idle';
    this.clearActors();
    this.marker.visible = false;
    this.sideMarker.visible = false;
    this.updateIdleMarkers();
  };

  CH.MissionSystem = MissionSystem;
  CH.MissionStarts = STARTS;
}());

// Recording check: missions module reviewed for the live capture.
