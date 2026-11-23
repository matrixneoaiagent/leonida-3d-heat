/* COBALT HEAT — deterministic screenshot scenes.
   Each scene stages the real city, vehicles, people, police, combat and HUD,
   then freezes a composed frame for scripts/capture.mjs. */
(function () {
  'use strict';

  var CH = window.CH = window.CH || {};
  var U = CH.Util;
  var C = CH.CONFIG;

  function Shots(game) {
    this.game = game;
    this.name = 'hero';
    this.ready = false;
    this.staged = [];
    this.cameraTarget = new THREE.Vector3();
  }

  Shots.prototype.setup = function (name, seed) {
    var g = this.game;
    this.name = ['hero', 'city', 'chase', 'mission'].indexOf(name) >= 0 ? name : 'hero';
    g.shotName = this.name;
    g.shotReady = false;
    g.shotFrozen = false;
    this.base();
    if (this.name === 'hero') this.hero();
    else if (this.name === 'city') this.city();
    else if (this.name === 'chase') this.chase();
    else this.mission();
    this.finish();
  };

  Shots.prototype.base = function () {
    var g = this.game;
    g.state = 'play';
    g.input.clear();
    g.input.enabled = false;
    document.body.classList.remove('is-title', 'is-paused', 'is-playing');
    document.body.classList.add('is-shot');
    document.body.classList.remove('critical');
    g.hud.setScreen('shot');
    g.hud.showTitle(false);
    g.hud.hideBriefing();
    g.hud.hideResult();
    g.hud.showPauseScreen(false);
    g.hud.hideDialogue();
    g.hud.setMission(null);
    g.hud.clearTimer();
    g.hud.setBusted(0);
    g.hud.setWanted(0);
    g.hud.toggleWeaponWheel(false);
    g.police.clear();
    g.combat.clearEnemies();
    g.missions.active = null;
    g.missions.state = 'idle';
    g.missions.marker.visible = false;
    g.missions.sideMarker.visible = false;
    g.missions.actors = [];
    if (g.player.currentVehicle) g.player.exitVehicle(true);
    g.player.reset(-347, 116, Math.PI);
    g.player.character.setVisible(true);
    g.player.character.mode = 'idle';
    g.player.character.root.rotation.z = 0;
    g.player.dead = false;
    g.player.health = 100;
    g.player.armor = 65;
    g.player.money = 7420;
    g.player.wanted = 0;
    g.player.weapon = 'pistol';
    g.player.weapons.pistol.mag = 12;
    g.player.weapons.pistol.reserve = 96;
    g.player.applyWeaponVisual();
    g.hud.moneyShown = g.player.money;
    g.hud.moneyTarget = g.player.money;
    g.hud.setWeapon('pistol');
    g.hud.setAmmo();
    g.hud.updateRadio();
    g.hud.el['toast-feed'].innerHTML = '';
    g.hud.el['kill-feed'].innerHTML = '';
    g.hud.el['dialogue'].hidden = true;
    g.hud.el['prompt'].hidden = true;
    g.hud.el['objective-arrow'].classList.remove('on');
    g.hud.el['mission-banner'].hidden = true;
    g.hud.el['autosave'].hidden = true;
    g.hud.el['look-hint'].classList.add('hide');
    g.hud.el['damage-flash'].classList.remove('on');
    g.hud.el['damage-direction'].style.opacity = '0';
    g.hud.el['crosshair'].classList.remove('on');
    g.hud.el['busted-meter'].hidden = true;
    g.combat.aimHeld = false;
    g.player.aiming = false;
    g.traffic.clearAround(-347, 116, 26);
  };

  Shots.prototype.setClock = function (minutes, weather) {
    this.game.clock.minutes = minutes;
    this.game.clock.weather = weather || 'clear';
    this.game.world.setTime(minutes);
    var hud = this.game.hud;
    hud.el['clock-value'].textContent = U.formatClock(minutes);
    hud.el['weather-value'].innerHTML = '<i></i>' + (weather === 'haze' ? 'HAZE' : 'SUNNY');
  };

  Shots.prototype.placePlayer = function (x, z, yaw, y) {
    var p = this.game.player;
    p.pos.set(x, y != null ? y : this.game.world.groundHeight(x, z), z);
    p.heading = yaw == null ? p.heading : yaw;
    p.targetHeading = p.heading;
    p.vel.set(0, 0, 0);
    p.speed = 0;
    p.vertical = 0;
    p.grounded = true;
    p.character.root.position.set(p.pos.x, p.pos.y, p.pos.z);
    p.character.root.rotation.set(0, p.heading, 0);
    p.character.setVisible(true);
    p.character.setMode('idle');
    p.character.alive = true;
    p.character.root.rotation.z = 0;
  };

  Shots.prototype.setPose = function (character, aiming, steps) {
    for (var i = 0; i < (steps || 20); i++) character.update(0.05, 0, !!aiming);
  };

  Shots.prototype.stageCar = function (type, x, z, heading, color, speed) {
    var car = this.game.traffic.stageCar(type, x, z, heading, color);
    car.owner = 'stage';
    car.parked = true;
    car.speed = speed || 0;
    car.pos.set(x, 0, z);
    car.heading = heading;
    car.updateVisual(0);
    this.staged.push(car);
    return car;
  };

  Shots.prototype.stageMovingCar = function (type, x, z, heading, color, speed, owner) {
    var car = this.stageCar(type, x, z, heading, color, speed);
    car.owner = owner || 'stage';
    car.parked = false;
    return car;
  };

  Shots.prototype.stagePed = function (x, z, yaw, kind, seed, speed) {
    var p = this.game.traffic.stagePed(x, z, yaw, kind || 'ped', seed || ('shot-ped-' + this.staged.length), speed || 1.3);
    var ch = p.char;
    ch.root.position.y = this.game.world.groundHeight(x, z);
    this.setPose(ch, false, 6);
    return p;
  };

  Shots.prototype.enterCar = function (car) {
    var p = this.game.player;
    p.enterVehicle(car, true);
    car.owner = 'stage';
    car.occupied = true;
    car.mesh.visible = true;
    return car;
  };

  Shots.prototype.stageUnit = function (x, z, heading, speed, state) {
    var u = this.game.police.stageUnit(x, z, heading, speed || 0);
    if (state) u.ai.state = state;
    u.siren = true;
    u.updateVisual(0.08);
    return u;
  };

  Shots.prototype.carLights = function (car, color, size) {
    var g = this.game;
    var spec = car.spec;
    var h = car.heading;
    var c = Math.cos(h), s = Math.sin(h);
    for (var i = 0; i < 2; i++) {
      var localX = (i === 0 ? -1 : 1) * spec.width * 0.34;
      var localZ = -spec.length / 2 - 0.04;
      var wx = car.pos.x + localX * c + localZ * s;
      var wz = car.pos.z - localX * s + localZ * c;
      var spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: U.glowTexture('rgba(255,238,200,.95)', 'rgba(255,90,60,.4)'),
        color: color || 0xff4b3c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      spr.position.set(wx, 0.72, wz);
      spr.scale.setScalar(size || 1.25);
      g.scene.add(spr);
    }
  };

  Shots.prototype.hide = function (id) {
    var node = document.getElementById(id);
    if (node) { node.hidden = true; node.style.display = 'none'; }
  };

  Shots.prototype.clearHudExtras = function () {
    var g = this.game;
    this.hide('prompt');
    this.hide('look-hint');
    this.hide('objective-arrow');
    this.hide('kill-feed');
    this.hide('autosave');
    this.hide('busted-meter');
    this.hide('mission-banner');
    this.hide('damage-flash');
    this.hide('fps-meter');
    g.hud.el['toast-feed'].innerHTML = '';
  };

  Shots.prototype.camera = function (pos, look, fov) {
    this.game.cameraRig.clearShot();
    this.game.cameraRig.setFov(fov || 55);
    this.game.cameraRig.setShot(pos, look);
    this.game.camera.fov = fov || 55;
    this.game.camera.updateProjectionMatrix();
    this.cameraTarget.set(look[0], look[1], look[2]);
    this.game.world.updateSun(new THREE.Vector3(look[0], 0, look[2]));
  };

  Shots.prototype.renderHud = function () {
    var g = this.game;
    g.hud.moneyShown = g.player.money;
    g.hud.moneyTarget = g.player.money;
    g.hud.update(0.016);
    g.hud.setAmmo();
    this.clearHudExtras();
  };

  Shots.prototype.customMission = function (id, stepIndex, objectiveLabel, timeLeft, progress) {
    var g = this.game;
    var data = C.MISSIONS[id];
    g.missions.active = {
      id: id, data: data, stepIndex: stepIndex, timeLeft: timeLeft, maxTime: data.time,
      kills: 0, boss: null, completed: false, failed: false, startedAt: 0, vehicle: null
    };
    g.missions.state = 'active';
    g.hud.setMission(data, objectiveLabel, timeLeft);
    g.hud.setObjective(objectiveLabel, progress || 0);
    g.hud.setTimer(U.formatTime(timeLeft), timeLeft / data.time);
    g.missions.marker.visible = false;
    g.missions.sideMarker.visible = false;
    return g.missions.active;
  };

  /* ------------------------------------------------------------------ hero */

  Shots.prototype.hero = function () {
    var g = this.game;
    this.setClock(17 * 60 + 12, 'clear');
    this.placePlayer(-359.5, 84.5, 2.62);
    g.player.money = 7420;
    g.player.armor = 65;
    g.hud.setWanted(2);
    g.police.wanted = 2;
    var car = this.stageCar('avocet', -356.5, 82.5, Math.PI * 0.88, '#f05a4f');
    car.owner = 'mission';
    car.parked = true;
    this.carLights(car, 0xff4b3c, 1.3);
    var taxi = this.stageMovingCar('tucan', -362, 54, 0.02, '#f2c843', 9, 'traffic');
    var sedan = this.stageMovingCar('paloma', -369, 28, 0, '#e8e1ce', 8, 'traffic');
    var unit = this.stageUnit(-342, 34, Math.PI, 0);
    unit.siren = true;
    this.stagePed(-389, 102, 0.4, 'beach', 'hero-ped-1', 1.2);
    this.stagePed(-333, 68, Math.PI + 0.2, 'ped', 'hero-ped-2', 1.3);
    this.stagePed(-332, 142, -0.3, 'worker', 'hero-ped-3', 1.1);
    this.stagePed(-340, 96, 2.8, 'ped', 'hero-ped-4', 1.2);
    this.stagePed(-336, 110, 0.2, 'beach', 'hero-ped-5', 1.15);
    this.stagePed(-386, 78, 2.2, 'beach', 'hero-ped-6', 1.1);
    this.stageMovingCar('paloma', -354, 166, Math.PI, '#356172', 10, 'traffic');

    var active = this.customMission('firstTide', 1, 'DRIVE THE AVOCET HOME', 198, 0.28);
    active.vehicle = car;
    g.hud.setMission(C.MISSIONS.firstTide, 'DRIVE THE AVOCET HOME', 198);
    g.hud.setObjective('DRIVE THE AVOCET HOME', 0.28);
    g.hud.setTimer(U.formatTime(198), 198 / 240);
    g.hud.setPursuit(1, false, '');
    this.setPose(g.player.character, false, 10);
    this.renderHud();
    this.camera([-348.5, 2.08, 91.5], [-356.8, 1.05, 81.5], 52);
    this.renderHud();
  };

  /* ------------------------------------------------------------------ city */

  Shots.prototype.city = function () {
    var g = this.game;
    this.setClock(15 * 60 + 54, 'clear');
    this.placePlayer(257.5, 68.5, Math.PI + 0.08);
    g.player.money = 6120;
    g.player.armor = 30;
    g.police.wanted = 0;
    g.hud.setWanted(0);
    g.hud.setMission(null);
    g.hud.setPursuit(0, false, '');

    var p = g.player;
    p.character.root.rotation.y = Math.PI - 0.06;
    this.stageMovingCar('tucan', 270, 58, Math.PI, '#f2c843', 10, 'traffic');
    this.stageMovingCar('paloma', 263, 50, Math.PI, '#e05b4d', 9, 'traffic');
    this.stageMovingCar('avocet', 279, 42, 0, '#1f6170', 11, 'traffic');
    this.stageMovingCar('marea', 270, 32, Math.PI, '#d8cfb8', 7, 'traffic');
    this.stageMovingCar('tucan', 262, 20, 0, '#f2c843', 9, 'traffic');
    this.stageMovingCar('paloma', 279, 2, Math.PI, '#343b40', 8, 'traffic');
    this.stageMovingCar('avocet', 270, -20, 0, '#e5c45a', 11, 'traffic');
    this.stageMovingCar('paloma', 261, -48, Math.PI, '#356172', 9, 'traffic');
    this.stageCar('gull', 247.5, 59, Math.PI * 0.5, '#59c8bb');
    this.stagePed(265, 65, 0.4, 'ped', 'city-ped-1', 1.2);
    this.stagePed(251, 57, 2.1, 'beach', 'city-ped-2', 1.1);
    this.stagePed(269, 34, 2.7, 'ped', 'city-ped-3', 1.35);
    this.stagePed(283, 44, 1.2, 'worker', 'city-ped-4', 1.25);
    this.stagePed(268, 8, 0.5, 'ped', 'city-ped-5', 1.0);
    this.stagePed(247, 34, -0.2, 'ped', 'city-ped-6', 1.15);
    this.stagePed(253, 86, 0.8, 'beach', 'city-ped-7', 1.2);
    this.stagePed(263, 92, 2.4, 'ped', 'city-ped-8', 1.3);
    this.stagePed(266, 57, 1.8, 'worker', 'city-ped-9', 1.2);
    this.stagePed(274, 30, 3.0, 'beach', 'city-ped-10', 1.15);
    this.stagePed(242, 50, 0.3, 'ped', 'city-ped-11', 1.3);

    function prop(x, y, z, sx, sy, sz, color, ry) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshLambertMaterial({ color: color }));
      m.position.set(x, y, z);
      m.rotation.y = ry || 0;
      m.castShadow = true; m.receiveShadow = true;
      g.scene.add(m);
      return m;
    }
    /* bus shelter, food cart and street clutter on the near sidewalk */
    prop(251, 1.55, 55, 3.8, 0.16, 1.7, '#ddc48f');
    prop(249.4, 0.95, 55, 0.16, 1.9, 1.7, '#315a5c');
    prop(252.6, 0.95, 55, 0.16, 1.9, 1.7, '#315a5c');
    prop(251, 1.0, 56.1, 3.4, 1.2, 0.08, '#8dbfc0');
    prop(251, 0.72, 55.1, 2.4, 0.18, 0.5, '#6d5139');
    prop(252, 0.66, 70.8, 0.7, 1.3, 0.7, '#8f4e3d');
    prop(251.4, 0.55, 45, 1.4, 1.1, 1.0, '#e4d3aa', 0.12);
    var umbrella = new THREE.Mesh(new THREE.ConeGeometry(2.0, 0.7, 10), new THREE.MeshLambertMaterial({ color: '#e66a51' }));
    umbrella.position.set(251.4, 2.3, 45); umbrella.castShadow = true; g.scene.add(umbrella);
    prop(251.4, 1.35, 45, 0.1, 2.0, 0.1, '#5e4a35');
    prop(283, 0.72, 62, 0.55, 1.2, 0.55, '#3c5b58');
    prop(283, 1.35, 62, 0.7, 0.06, 0.7, '#2c4140');
    var stopSign = prop(252, 1.9, 62, 0.1, 3.8, 0.1, '#394e4d');
    prop(252, 3.4, 62, 0.7, 0.7, 0.06, '#ff715f');

    this.setPose(p.character, false, 14);
    g.hud.setWeapon('pistol');
    this.renderHud();
    this.camera([257.5, 2.75, 76.5], [262.5, 3.1, 10], 63);
    this.renderHud();
  };

  /* ----------------------------------------------------------------- chase */

  Shots.prototype.chase = function () {
    var g = this.game;
    this.setClock(16 * 60 + 48, 'clear');
    var car = this.stageCar('avocet', 270, 23, Math.PI, '#f05a4f');
    this.enterCar(car);
    car.owner = 'stage';
    car.speed = 31;
    car.vx = 0; car.vz = -31;
    car.pos.set(270, 0, 23);
    car.heading = Math.PI;
    car.updateVisual(0.012);
    g.player.pos.copy(car.pos);
    g.player.speed = 31;
    g.player.heading = Math.PI;
    this.carLights(car, 0xff4438, 1.1);

    var p1 = this.stageUnit(262.5, 32, Math.PI + 0.05, 26);
    var p2 = this.stageUnit(277.5, 29, Math.PI - 0.04, 26);
    p1.siren = true; p2.siren = true;
    p1.updateVisual(0.14); p2.updateVisual(0.14);
    var rb1 = this.stageUnit(263, -22, Math.PI / 2 + 0.32, 0, 'roadblock');
    var rb2 = this.stageUnit(279, -22, Math.PI / 2 - 0.32, 0, 'roadblock');
    rb1.siren = true; rb2.siren = true;
    rb1.updateVisual(0.2); rb2.updateVisual(0.2);

    function glow(x, y, z, color, size) {
      var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: U.glowTexture('rgba(255,255,255,.95)', 'rgba(255,255,255,.25)'), color: color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true }));
      spr.position.set(x, y, z);
      spr.scale.setScalar(size || 2.4);
      g.scene.add(spr);
      return spr;
    }
    glow(261.8, 1.82, 32.8, 0xff4038, 2.6);
    glow(263.2, 1.82, 32.2, 0x2f9dff, 2.6);
    glow(276.8, 1.82, 29.7, 0xff4038, 2.6);
    glow(278.3, 1.82, 29.2, 0x2f9dff, 2.6);
    glow(263, 0.22, -22, 0xff3a32, 5.5);
    glow(279, 0.22, -22, 0x339dff, 5.5);

    /* street traffic caught in the pursuit */
    this.stageMovingCar('paloma', 262, -4, Math.PI, '#e8e1ce', 7, 'traffic');
    this.stageMovingCar('tucan', 279, -12, Math.PI, '#f2c843', 4, 'traffic');
    this.stageMovingCar('paloma', 258, 11, 0, '#356172', 7, 'traffic');
    this.stageMovingCar('marea', 283, 7, 0, '#d8cfb8', 6, 'traffic');

    /* police helicopter with a searchlight */
    var heli = new THREE.Group();
    var heliBody = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.4, 1.8), new THREE.MeshLambertMaterial({ color: 0x263f51 }));
    heli.add(heliBody);
    var heliGlass = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 1.75), new THREE.MeshLambertMaterial({ color: 0x173946 }));
    heliGlass.position.set(2.0, 0.28, 0);
    heli.add(heliGlass);
    var tail = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.34, 0.3), new THREE.MeshLambertMaterial({ color: 0x263f51 }));
    tail.position.set(-5.2, 0.3, 0);
    heli.add(tail);
    var fin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.6, 0.2), new THREE.MeshLambertMaterial({ color: 0xe9e2d2 }));
    fin.position.set(-7.4, 0.9, 0);
    heli.add(fin);
    var rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.28), new THREE.MeshLambertMaterial({ color: 0x252b2a }));
    rotor.position.y = 1.05; heli.add(rotor);
    var rotor2 = rotor.clone(); rotor2.rotation.y = Math.PI / 2; heli.add(rotor2);
    var tailRotor = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 10), new THREE.MeshLambertMaterial({ color: 0x202625 }));
    tailRotor.rotation.x = Math.PI / 2; tailRotor.position.set(-7.4, 0.9, 0.2); heli.add(tailRotor);
    heli.position.set(261, 20, 3);
    heli.rotation.y = -0.5;
    heli.scale.setScalar(1.35);
    heli.name = 'police-helicopter';
    heli.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    g.scene.add(heli);
    var beam = new THREE.Mesh(new THREE.ConeGeometry(9, 20, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0b4, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.set(261, 10, 3);
    g.scene.add(beam);
    var pool = new THREE.Mesh(new THREE.CircleGeometry(8, 24), new THREE.MeshBasicMaterial({ color: 0xffe4a0, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(261, 0.06, 3); g.scene.add(pool);
    glow(261, 20.4, 3, 0xff3f37, 3.2);

    /* cones and lit barriers ahead */
    var coneMat = new THREE.MeshLambertMaterial({ color: 0xe76b3d });
    var whiteMat = new THREE.MeshLambertMaterial({ color: 0xf4e7c9 });
    var group = new THREE.Group();
    for (var i = 0; i < 7; i++) {
      var cone = new THREE.Mesh(new THREE.ConeGeometry(0.31, 0.92, 7), coneMat);
      cone.position.set(258 + i * 3.9, 0.47, -16.5 + (i % 2 ? 0.9 : -0.9));
      cone.castShadow = true;
      var band = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.26, 0.17, 7), whiteMat);
      band.position.y = 0.12; cone.add(band);
      group.add(cone);
    }
    for (i = 0; i < 2; i++) {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(11, 0.9, 0.36), whiteMat);
      bar.position.set(262 + i * 16, 0.95, -18.8);
      bar.castShadow = true;
      group.add(bar);
      for (var k = 0; k < 7; k++) {
        var stripe = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.92, 0.38), new THREE.MeshLambertMaterial({ color: 0xd65743 }));
        stripe.position.set(-4.6 + k * 1.55, 0, 0);
        bar.add(stripe);
      }
    }
    g.scene.add(group);
    var off1 = g.police.stageOfficer(254, -11, Math.PI * 0.84, 'ROADBLOCK UNIT');
    var off2 = g.police.stageOfficer(286, -11, -Math.PI * 0.84, 'ROADBLOCK UNIT');
    off1.char.update(0.05, 0, true);
    off2.char.update(0.05, 0, true);
    g.police.roadblock = { group: group, units: [rb1, rb2], officers: [off1, off2], x: 270, z: -22, timer: 55 };
    g.police.wanted = 4;
    g.hud.setWanted(4);
    this.customMission('shoreLeave', 4, 'LOSE THE POLICE', 72, 0);
    g.hud.setMission(C.MISSIONS.shoreLeave, 'LOSE THE POLICE', 72);
    g.hud.setObjective('LOSE THE POLICE', 0);
    g.hud.setPursuit(4, true, '');
    g.hud.setWeapon('pistol');
    g.hud.setAmmo();
    g.hud.el['speedo'].hidden = false;
    for (i = 0; i < 4; i++) g.effects.spawn(263 + i * 2.4, 0.18, 27 + i * 0.4, 0.2, 0.18 + Math.random() * 0.2, 0.8, '#9b8d72', 0.25 + Math.random() * 0.2, 0.5 + Math.random() * 0.5, 0.7, 1.8);
    g.effects.skid(263, 35, Math.PI);
    g.effects.skid(278, 33, Math.PI);
    this.renderHud();
    g.hud.el['speed-value'].textContent = String(Math.round(31 * 3.6)).padStart(3, '0');
    g.hud.el['speed-fill'].style.width = '64%';
    g.hud.el['gear-value'].textContent = 'D';
    g.hud.el['car-name'].textContent = 'AVOCET GT';
    var dispatch = g.hud.el['dispatch-rows'];
    if (dispatch) dispatch.innerHTML = '<tr><td>PATROL 10</td><td>09 M</td><td>PURSUIT</td></tr><tr><td>PATROL 11</td><td>12 M</td><td>PURSUIT</td></tr><tr><td>ROADBLOCK</td><td>SET</td><td>AHEAD</td></tr><tr><td>AIR 5</td><td>ORBIT</td><td>OVERWATCH</td></tr>';
    this.camera([270, 3.0, 39], [270, 1.18, -4], 58);
    this.renderHud();
    if (dispatch) dispatch.innerHTML = '<tr><td>PATROL 10</td><td>09 M</td><td>PURSUIT</td></tr><tr><td>PATROL 11</td><td>12 M</td><td>PURSUIT</td></tr><tr><td>ROADBLOCK</td><td>SET</td><td>AHEAD</td></tr><tr><td>AIR 5</td><td>ORBIT</td><td>OVERWATCH</td></tr>';
  };

  /* --------------------------------------------------------------- mission */

  Shots.prototype.mission = function () {
    var g = this.game;
    this.setClock(17 * 60 + 16, 'clear');
    this.placePlayer(-421, 306, -Math.PI / 2, 0.74);
    g.player.health = 94;
    g.player.armor = 72;
    g.player.money = 12840;
    g.player.weapons.pistol.mag = 9;
    g.player.weapons.pistol.reserve = 96;
    g.player.weapon = 'pistol';
    g.player.aiming = true;
    g.combat.aimHeld = true;
    g.player.applyWeaponVisual();
    g.hud.setWanted(3);
    g.police.wanted = 3;
    g.hud.setWeapon('pistol');
    g.hud.setAmmo();
    g.hud.moneyShown = 12840;
    g.hud.moneyTarget = 12840;

    var active = this.customMission('longPier', 1, 'CLEAR THE CORMORANT CREW', 146, 0.4);
    g.hud.setMission(C.MISSIONS.longPier, 'CLEAR THE CORMORANT CREW', 146);
    g.hud.setObjective('CLEAR THE CORMORANT CREW', 0.4);
    g.hud.setTimer('02:26', 0.4);
    active.kills = 2;
    g.police.roadblock = null;

    var guards = [
      { x: -439, z: 302, yaw: Math.PI / 2, hp: 38, name: 'CORMORANT CREW', seed: 'shot-guard-a' },
      { x: -448, z: 312, yaw: Math.PI / 2 + 0.15, hp: 22, name: 'CORMORANT CREW', seed: 'shot-guard-b' },
      { x: -434, z: 314, yaw: Math.PI / 2 - 0.2, hp: 44, name: 'CORMORANT ENFORCER', seed: 'shot-guard-c', weapon: 'smg', boss: true }
    ];
    for (var i = 0; i < guards.length; i++) {
      var info = guards[i];
      var e = g.combat.spawnEnemy({
        kind: i === 2 ? 'boss' : 'guard', boss: !!info.boss, faction: 'guard', health: info.hp, weapon: info.weapon || 'pistol',
        x: info.x, z: info.z, yaw: info.yaw, name: info.name, seed: info.seed, accuracy: 0.5
      });
      e.pos.y = 0.74;
      if (i === 2) { e.maxHealth = 44; e.health = 30; }
      e.char.root.position.set(info.x, 0.74, info.z);
      e.char.root.rotation.y = info.yaw;
      e.char.update(0.05, 0, true);
      e.barSprite.position.set(info.x, 0.74 + (i === 2 ? 2.55 : 2.35), info.z);
      e.barSprite.visible = i !== 2;
      e.barSprite.scale.set(i === 2 ? 3.5 : 3.0, i === 2 ? 0.56 : 0.46, 1);
      g.combat.drawHealthBar(e);
      active.collectibles = active.collectibles || [];
      g.missions.actors.push(e);
    }
    /* a floating objective diamond marks the enforcer */
    var targetDiamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), new THREE.MeshBasicMaterial({ color: 0xffcb64 }));
    targetDiamond.position.set(-434, 3.2, 314);
    g.scene.add(targetDiamond);

    /* pier cover and cargo set dressing */
    function crate(x, y, z, sx, sy, sz, color, ry) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshLambertMaterial({ color: color }));
      m.position.set(x, y, z);
      m.rotation.y = ry || 0;
      m.castShadow = true; m.receiveShadow = true;
      g.scene.add(m);
      return m;
    }
    crate(-430, 1.14, 299, 2.2, 1.5, 1.7, '#7e6b51');
    crate(-434, 0.94, 313, 1.6, 1.1, 1.3, '#6f715c', 0.2);
    crate(-426, 0.78, 317, 2.5, 0.8, 1.2, '#94745a', -0.15);
    crate(-439, 2.0, 305, 1.4, 1.1, 1.1, '#566f6b', 0.4);
    crate(-432, 1.9, 296, 2.0, 0.9, 1.1, '#78624c', 0.12);
    crate(-445, 1.2, 320, 2.8, 1.4, 1.3, '#536b68', -0.08);
    for (i = 0; i < 3; i++) {
      var barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 1.1, 10), new THREE.MeshLambertMaterial({ color: i === 1 ? '#c05e45' : '#486b68' }));
      barrel.position.set(-423 + i * 1.2, 1.27, 299 - i * 0.9);
      barrel.castShadow = true;
      g.scene.add(barrel);
    }
    /* the manifest and a downed crewman give the firefight a story */
    var briefcase = new THREE.Group();
    var caseBody = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.46, 0.18), new THREE.MeshLambertMaterial({ color: 0x3e4c48, emissive: 0x1c2b28, emissiveIntensity: 0.4 }));
    briefcase.add(caseBody);
    var caseHandle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 12, Math.PI), new THREE.MeshLambertMaterial({ color: 0x8c7652 }));
    caseHandle.position.y = 0.27; briefcase.add(caseHandle);
    var caseGold = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.03), new THREE.MeshBasicMaterial({ color: 0xffcb64 }));
    caseGold.position.set(0.23, 0, 0.1); briefcase.add(caseGold);
    briefcase.position.set(-442.2, 1.25, 315.4);
    briefcase.rotation.y = -0.4;
    g.scene.add(briefcase);
    var caseGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: U.glowTexture('rgba(255,225,150,.9)', 'rgba(255,180,70,.3)'), color: 0xffcb64, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    caseGlow.position.set(-442.2, 1.35, 315.4);
    caseGlow.scale.setScalar(2.2);
    g.scene.add(caseGlow);
    var fallen = new CH.Character({ game: g, kind: 'guard', seed: 'fallen-cormorant', x: -437, z: 310.5, yaw: 1.1 });
    fallen.root.position.set(-437, 0.77, 310.5);
    fallen.root.rotation.set(0, 1.1, Math.PI / 2);
    fallen.mode = 'dead';
    fallen.alive = false;
    fallen.gun.visible = false;
    g.scene.add(fallen.root);
    var holeMat = new THREE.MeshBasicMaterial({ color: 0x171a18 });
    for (i = 0; i < 4; i++) {
      var hole = new THREE.Mesh(new THREE.CircleGeometry(0.09 + (i % 2) * 0.04, 8), holeMat);
      hole.position.set(-429.2 + (i % 2) * 0.6, 1.35 + (i % 3) * 0.25, 300.02);
      g.scene.add(hole);
    }
    /* a police launch and a distant freighter frame the water */
    var boat = new THREE.Group();
    var hull = new THREE.Mesh(new THREE.BoxGeometry(12, 2.2, 4.4), new THREE.MeshLambertMaterial({ color: 0xece4d2 }));
    hull.position.y = 0.8; boat.add(hull);
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.5, 3.2), new THREE.MeshLambertMaterial({ color: 0x263f51 }));
    cabin.position.set(1.2, 2.7, 0); boat.add(cabin);
    var blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0x2e9dff }));
    blue.position.set(1.2, 4.2, 0); boat.add(blue);
    boat.position.set(-513, 0, 333);
    boat.rotation.y = Math.PI / 2;
    g.scene.add(boat);
    var ship = new THREE.Group();
    var sHull = new THREE.Mesh(new THREE.BoxGeometry(150, 12, 30), new THREE.MeshLambertMaterial({ color: 0x2c4146 }));
    sHull.position.y = 4; ship.add(sHull);
    for (i = 0; i < 8; i++) {
      var box = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 9), new THREE.MeshLambertMaterial({ color: i % 2 ? 0x984c3f : 0x3f7776 }));
      box.position.set(-58 + i * 15, 14, (i % 3 - 1) * 8); ship.add(box);
    }
    var bridge = new THREE.Mesh(new THREE.BoxGeometry(16, 14, 16), new THREE.MeshLambertMaterial({ color: 0xd3cbb7 }));
    bridge.position.set(-80, 15, 0); ship.add(bridge);
    ship.position.set(-650, 0, 330);
    g.scene.add(ship);

    var muzzle = new THREE.Vector3(-427.6, 1.58, 306.4);
    var dir = new THREE.Vector3(-0.98, 0.03, 0.08).normalize();
    function tracerBeam(from, to, color, radius) {
      var delta = to.clone().sub(from);
      var len = delta.length();
      var geo = new THREE.CylinderGeometry(radius || 0.055, radius || 0.055, len, 6, 1, true);
      var mat = new THREE.MeshBasicMaterial({ color: color || 0xffd77a, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
      g.scene.add(mesh);
      return mesh;
    }
    tracerBeam(muzzle, new THREE.Vector3(-439, 1.55, 302.2), 0xffe09a, 0.06);
    tracerBeam(new THREE.Vector3(-437.8, 1.6, 302.7), new THREE.Vector3(-424.5, 1.35, 304.5), 0xffa050, 0.045);
    var muzzleGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: U.glowTexture('rgba(255,249,215,.95)', 'rgba(255,170,55,.45)'), color: 0xffd36a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    muzzleGlow.position.copy(muzzle);
    muzzleGlow.scale.setScalar(3.0);
    g.scene.add(muzzleGlow);
    var hitGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: U.glowTexture('rgba(255,218,146,.9)', 'rgba(255,96,55,.3)'), color: 0xffba60, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    hitGlow.position.set(-439, 1.55, 302.2);
    hitGlow.scale.setScalar(2.0);
    g.scene.add(hitGlow);
    g.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, dir, 1.6);
    g.effects.tracer(muzzle, new THREE.Vector3(-439, 1.55, 302.2), '#ffe09a');
    g.effects.spawn(-438.5, 1.6, 302.2, -0.3, 0.9, 0.2, '#7f2730', 0.12, 0.5, 8, 0.5);
    g.effects.spawn(-439, 1.4, 302, -0.6, 1.2, 0.4, '#ffb65d', 0.09, 0.25, 8, 0.3);
    g.effects.muzzle(-437.8, 1.6, 302.7, new THREE.Vector3(0.95, 0.02, 0.08), 1.1);
    g.effects.tracer(new THREE.Vector3(-437.8, 1.6, 302.7), new THREE.Vector3(-424.5, 1.35, 304.5), '#ffae64');
    g.effects.impact(-428.5, 1.2, 304.4);
    g.effects.spawn(-448, 1.55, 312.3, 0.8, 0.2, -0.4, '#ffbe62', 0.1, 0.3, 1, 0.4);
    g.hud.setPursuit(3, false, 'SHOTS FIRED · PUERTO LUME');
    g.hud.dialogue('JUNO PARK', 'Cameras are blind for four minutes. The manifest is on the pier. Make them count.', 9);
    this.setPose(g.player.character, true, 26);
    this.setPose(g.combat.enemies[0].char, true, 12);
    this.renderHud();
    this.camera([-409.6, 2.25, 302.4], [-440.5, 1.35, 308], 53);
    g.hud.el['objective-arrow'].classList.remove('on');
    document.getElementById('objective-arrow').style.display = 'none';
    this.renderHud();
    g.hud.setPursuit(2, false, 'SHOTS FIRED · PUERTO LUME');
    var dispatch = g.hud.el['dispatch-rows'];
    if (dispatch) dispatch.innerHTML = '<tr><td>MARINA 3</td><td>EN ROUTE</td><td>CODE 2</td></tr><tr><td>AIR 5</td><td>ORBIT</td><td>WATCHING</td></tr><tr><td>JUNO</td><td>READY</td><td class="st-crew">CAMERAS</td></tr>';
    g.hud.dialogue('JUNO PARK', 'Cameras are blind for four minutes. The manifest is on the pier. Make them count.', 9);
  };

  /* --------------------------------------------------------------- finish */

  Shots.prototype.finish = function () {
    var g = this.game;
    g.shotFrozen = true;
    g.shotReady = true;
    g.state = 'play';
    window.__shot = this.name;
    if (g.render) {
      g.render();
      g.render();
    }
    var self = this;
    window.setTimeout(function () {
      g.shotReady = true;
      window.__game = g;
      if (g.render) g.render();
    }, 0);
  };

  CH.Shots = Shots;
}());
