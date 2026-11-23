/* COBALT HEAT — living streets.
   Lane traffic, sidewalk pedestrians, panic behaviour and parked cars. */
(function () {
  'use strict';

  var CH = window.CH = window.CH || {};
  var U = CH.Util;
  var C = CH.CONFIG;
  var W = C.WORLD;

  function Traffic(game) {
    this.game = game;
    this.cars = [];
    this.peds = [];
    this.parked = [];
    this.rng = U.mulberry32(57391);
    this.hornTimer = 0;
    this.pedTimer = 0;
    this.initialised = false;
  }

  Traffic.prototype.init = function () {
    if (this.initialised) return;
    this.initialised = true;
    for (var i = 0; i < W.maxTraffic; i++) this.spawnTrafficCar(true);
    for (var j = 0; j < W.maxPeds; j++) this.spawnPed(true);
    this.addParkedCars();
  };

  Traffic.prototype.addParkedCars = function () {
    var specs = [
      [-356, 158, 'paloma', '#e8e1ce', 0.02],
      [-356, 122, 'tucan', '#f2c843', 0.0],
      [-344, 32, 'marea', '#d8cfb8', Math.PI],
      [-334, 210, 'paloma', '#9e3941', Math.PI * 0.98],
      [-380, 248, 'gull', '#59c8bb', Math.PI / 2],
      [-334, 286, 'avocet', '#f05a4f', Math.PI * 0.03],
      [-248, 166, 'paloma', '#356172', Math.PI / 2],
      [-214, 158, 'marea', '#7d8f70', Math.PI / 2],
      [52, 126, 'tucan', '#f2c843', 0.02],
      [58, 96, 'paloma', '#b9a66f', Math.PI],
      [14, -14, 'gull', '#59c8bb', Math.PI / 2],
      [-176, 54, 'paloma', '#343b40', 0.0],
      [194, 206, 'paloma', '#e8e1ce', Math.PI / 2],
      [252, -114, 'marea', '#d8cfb8', Math.PI],
      [304, 118, 'tucan', '#f2c843', 0.03]
    ];
    for (var i = 0; i < specs.length; i++) {
      var s = specs[i];
      var car = new CH.Vehicle(this.game, s[2], { x: s[0], z: s[1], heading: s[4], color: s[3], owner: 'parked' });
      car.parked = true;
      car.stationary = true;
      car.owner = 'parked';
      this.parked.push(car);
      this.game.vehicles.push(car);
      car.updateVisual(0);
    }
  };

  Traffic.prototype.spawnTrafficCar = function (initial) {
    var rng = this.rng;
    var axis = rng() < 0.5 ? 'x' : 'z';
    var dir = rng() < 0.5 ? 1 : -1;
    var road = axis === 'x' ? U.pick(rng, W.roadsZ) : U.pick(rng, W.roadsX);
    var along = -430 + rng() * 860;
    var player = this.game.player;
    if (player && initial) {
      var dx = axis === 'z' ? road - player.pos.x : along - player.pos.x;
      var dz = axis === 'x' ? road - player.pos.z : along - player.pos.z;
      if (dx * dx + dz * dz < 900) along += 80;
    }
    var types = ['paloma', 'paloma', 'paloma', 'tucan', 'marea', 'avocet', 'gull'];
    var type = types[Math.floor(rng() * types.length)];
    var spec = C.VEHICLES[type];
    var color = type === 'avocet' ? U.pick(rng, ['#f05a4f', '#1f6170', '#e5c45a', '#f0e4cd']) : U.pick(rng, spec.colors || [spec.color]);
    var x = axis === 'z' ? road + dir * 2.6 : along;
    var z = axis === 'x' ? road - dir * 2.6 : along;
    var heading = axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    if (axis === 'x' && dir < 0) z = road + 2.6;
    if (axis === 'z' && dir < 0) x = road - 2.6;
    var car = new CH.Vehicle(this.game, type, { x: x, z: z, heading: heading, color: color, owner: 'traffic' });
    car.traffic = {
      axis: axis, dir: dir, road: road,
      cruise: 10 + rng() * 9,
      panic: 0,
      active: true,
      lane: 2.6,
      avoid: 0
    };
    car.owner = 'traffic';
    car.speed = car.traffic.cruise * 0.6;
    this.cars.push(car);
    this.game.vehicles.push(car);
    return car;
  };

  Traffic.prototype.repositionCar = function (car, player) {
    var t = car.traffic;
    if (!t) return;
    t.axis = this.rng() < 0.5 ? 'x' : 'z';
    t.dir = this.rng() < 0.5 ? 1 : -1;
    t.road = t.axis === 'x' ? U.pick(this.rng, W.roadsZ) : U.pick(this.rng, W.roadsX);
    t.cruise = 10 + this.rng() * 9;
    var along;
    if (player) {
      var ahead = this.rng() < 0.5;
      along = t.axis === 'z' ? player.pos.z + (ahead ? 150 : -150) + (this.rng() - 0.5) * 60
        : player.pos.x + (ahead ? 150 : -150) + (this.rng() - 0.5) * 60;
    } else along = -430 + this.rng() * 860;
    if (t.axis === 'z') car.setPosition(t.road + t.dir * t.lane, along, t.dir > 0 ? 0 : Math.PI);
    else car.setPosition(along, t.road - t.dir * t.lane, t.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.speed = t.cruise;
    car.mesh.visible = true;
  };

  Traffic.prototype.spawnPed = function (initial) {
    var rng = this.rng;
    var bx = U.pick(rng, this.game.world.blockCentersX || [-225, 0, 180]);
    var bz = U.pick(rng, this.game.world.blockCentersZ || [-180, 90, 270]);
    var player = this.game.player;
    if (player && initial) {
      if (U.dist2(bx, bz, player.pos.x, player.pos.z) < 900) {
        bx += (rng() < 0.5 ? -1 : 1) * 120;
        bz += (rng() < 0.5 ? -1 : 1) * 120;
      }
    }
    var kind = rng() < 0.12 ? 'beach' : rng() < 0.06 ? 'worker' : 'ped';
    var male = rng() < 0.5;
    var speed = 1.15 + rng() * 0.9;
    var route = this.makeRoute(bx, bz);
    var start = route[Math.floor(rng() * route.length)];
    var ch = new CH.Character({
      game: this.game, kind: kind, seed: 'ped-' + Math.floor(rng() * 100000),
      x: start.x, y: 0.22, z: start.z, yaw: rng() * Math.PI * 2,
      scale: male ? 1.0 : 0.94
    });
    ch.root.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    this.game.scene.add(ch.root);
    var ped = {
      char: ch, route: route, index: Math.floor(rng() * route.length),
      speed: speed, dir: rng() < 0.5 ? 1 : -1, panic: 0,
      panicX: 0, panicZ: 0, wait: 0, baseSpeed: speed,
      active: true, y: 0.22
    };
    this.peds.push(ped);
    return ped;
  };

  Traffic.prototype.makeRoute = function (bx, bz) {
    var r = 29.5;
    return [
      { x: bx - r, z: bz - r }, { x: bx + r, z: bz - r },
      { x: bx + r, z: bz + r }, { x: bx - r, z: bz + r }
    ];
  };

  Traffic.prototype.update = function (dt, player) {
    var i;
    this.hornTimer -= dt;
    for (i = this.cars.length - 1; i >= 0; i--) {
      var car = this.cars[i];
      if (!car || !car.traffic) continue;
      if (car.owner !== 'traffic' || car.traffic.active === false) {
        car.traffic.active = false;
        continue;
      }
      if (!car.mesh.visible) car.setVisible(true);
      this.updateTrafficCar(dt, car, player);
    }
    for (i = 0; i < this.peds.length; i++) {
      this.updatePed(dt, this.peds[i], player);
    }
    this.pedTimer -= dt;
    if (this.pedTimer <= 0) {
      this.pedTimer = 2.4;
      if (player) this.keepPopulation(player);
    }
  };

  Traffic.prototype.updateTrafficCar = function (dt, car, player) {
    var t = car.traffic;
    var targetSpeed = t.cruise;
    if (t.panic > 0) {
      t.panic -= dt;
      targetSpeed = t.panic > 1.5 ? 0 : t.cruise * 0.55;
    }
    var fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    var lookX = car.pos.x + fx * 8, lookZ = car.pos.z + fz * 8;
    if (player) {
      var pd = U.dist2(lookX, lookZ, player.pos.x, player.pos.z);
      if (pd < 24) targetSpeed = Math.min(targetSpeed, 3);
      var pv = player.currentVehicle;
      if (pv && pv !== car && U.dist2(lookX, lookZ, pv.pos.x, pv.pos.z) < 70) targetSpeed = Math.min(targetSpeed, 2);
    }
    /* don't rear-end another car in the same lane */
    for (var j = 0; j < this.cars.length; j++) {
      var other = this.cars[j];
      if (other === car || !other.mesh.visible) continue;
      var along = (other.pos.x - car.pos.x) * fx + (other.pos.z - car.pos.z) * fz;
      var lateral = Math.abs((other.pos.x - car.pos.x) * fz - (other.pos.z - car.pos.z) * fx);
      if (along > 0 && along < 12 && lateral < 2.2) { targetSpeed = Math.min(targetSpeed, Math.max(0, along - 4) * 0.55); break; }
    }
    car.speed = U.damp(car.speed, targetSpeed, 2.5, dt);
    var move = car.speed * dt;
    if (t.axis === 'z') {
      car.pos.z += t.dir * move;
      car.pos.x = U.damp(car.pos.x, t.road + t.dir * t.lane, 4, dt);
      car.heading = t.dir > 0 ? 0 : Math.PI;
    } else {
      car.pos.x += t.dir * move;
      car.pos.z = U.damp(car.pos.z, t.road - t.dir * t.lane, 4, dt);
      car.heading = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    if (Math.abs(car.pos.x) > 448 || Math.abs(car.pos.z) > 448) this.repositionCar(car, player);
    else if (player && U.dist2(car.pos.x, car.pos.z, player.pos.x, player.pos.z) > 430 * 430) this.repositionCar(car, player);
    car.updateVisual(dt);
    if (this.hornTimer <= 0 && car.speed < 2 && Math.random() < 0.08) {
      this.hornTimer = 8;
      if (player && U.dist(car.pos.x, car.pos.z, player.pos.x, player.pos.z) < 30) this.game.audio.horn();
    }
  };

  Traffic.prototype.updatePed = function (dt, ped, player) {
    if (!ped.active) return;
    var ch = ped.char;
    var target = ped.route[ped.index];
    var px = ch.root.position.x, pz = ch.root.position.z;
    var dx = target.x - px, dz = target.z - pz;
    var d = Math.hypot(dx, dz);
    var moving = 0;
    if (ped.panic > 0) {
      ped.panic -= dt;
      var ax = px - ped.panicX, az = pz - ped.panicZ;
      var al = Math.hypot(ax, az) || 1;
      var runX = ax / al, runZ = az / al;
      var runSpeed = 4.8;
      var nx = px + runX * runSpeed * dt, nz = pz + runZ * runSpeed * dt;
      if (!this.hitsWorld(nx, nz)) { ch.root.position.x = nx; ch.root.position.z = nz; }
      ch.root.rotation.y = Math.atan2(runX, runZ);
      moving = runSpeed;
      ch.update(dt, moving, false);
      return;
    }
    if (d < 1.1) {
      ped.index = (ped.index + ped.dir + ped.route.length) % ped.route.length;
      ped.wait = Math.random() * 0.55;
      target = ped.route[ped.index];
      dx = target.x - px; dz = target.z - pz;
      d = Math.hypot(dx, dz) || 1;
    }
    if (ped.wait > 0) {
      ped.wait -= dt;
      ch.update(dt, 0, false);
      return;
    }
    var nx2 = px + dx / d * ped.speed * dt;
    var nz2 = pz + dz / d * ped.speed * dt;
    if (!this.hitsWorld(nx2, nz2)) {
      ch.root.position.x = nx2;
      ch.root.position.z = nz2;
      moving = ped.speed;
    } else {
      ped.index = (ped.index + 1) % ped.route.length;
    }
    ch.root.rotation.y = Math.atan2(dx, dz);
    var ground = this.game.world.groundHeight(ch.root.position.x, ch.root.position.z);
    ch.root.position.y = ground;
    ch.update(dt, moving, false);
    if (player) {
      var pd = U.dist2(px, pz, player.pos.x, player.pos.z);
      if (pd > 420 * 420) {
        var route = this.makeRoute(player.pos.x + (this.rng() < 0.5 ? -110 : 110), player.pos.z + (this.rng() < 0.5 ? -110 : 110));
        ped.route = route; ped.index = 0;
      }
    }
  };

  Traffic.prototype.hitsWorld = function (x, z) {
    if (Math.abs(x) > 465 || Math.abs(z) > 465) return true;
    var rect = { minX: x - 0.35, maxX: x + 0.35, minZ: z - 0.35, maxZ: z + 0.35 };
    var cols = this.game.world.colliders;
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      if (z > c.minZ && z < c.maxZ && x > c.minX && x < c.maxX && c.height > 0.4) return true;
    }
    return false;
  };

  Traffic.prototype.keepPopulation = function (player) {
    for (var i = 0; i < this.cars.length; i++) {
      var car = this.cars[i];
      if (car.owner === 'traffic' && car.traffic && car.traffic.active && U.dist2(car.pos.x, car.pos.z, player.pos.x, player.pos.z) > 350 * 350) this.repositionCar(car, player);
    }
  };

  Traffic.prototype.panic = function (x, z, radius, driverPanic) {
    var r2 = radius * radius;
    for (var i = 0; i < this.peds.length; i++) {
      var p = this.peds[i];
      if (U.dist2(p.char.root.position.x, p.char.root.position.z, x, z) < r2) {
        p.panic = 4 + Math.random() * 4;
        p.panicX = x; p.panicZ = z;
      }
    }
    if (driverPanic) {
      for (i = 0; i < this.cars.length; i++) {
        var c = this.cars[i];
        if (c.traffic && U.dist2(c.pos.x, c.pos.z, x, z) < r2) c.traffic.panic = 3;
      }
    }
  };

  Traffic.prototype.nearestPed = function (x, z, radius) {
    var best = null, bd = (radius || 3) * (radius || 3);
    for (var i = 0; i < this.peds.length; i++) {
      var p = this.peds[i];
      if (!p.active) continue;
      var d = U.dist2(x, z, p.char.root.position.x, p.char.root.position.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };

  Traffic.prototype.stageCar = function (type, x, z, heading, color) {
    var car = new CH.Vehicle(this.game, type, { x: x, z: z, heading: heading, color: color, owner: 'stage' });
    car.traffic = { axis: 'x', dir: 1, road: z, lane: 0, cruise: 0, panic: 0, active: false };
    car.owner = 'stage';
    this.cars.push(car);
    this.game.vehicles.push(car);
    return car;
  };

  Traffic.prototype.stagePed = function (x, z, yaw, kind, seed, speed) {
    var ch = new CH.Character({ game: this.game, kind: kind || 'ped', seed: seed || ('stage-' + Math.floor(Math.random() * 9999)), x: x, y: this.game.world.groundHeight(x, z), z: z, yaw: yaw });
    this.game.scene.add(ch.root);
    var ped = { char: ch, route: [{ x: x, z: z }, { x: x, z: z }], index: 0, speed: speed || 1.3, dir: 1, panic: 0, panicX: 0, panicZ: 0, wait: 0, baseSpeed: speed || 1.3, active: false, y: 0.22 };
    this.peds.push(ped);
    return ped;
  };

  Traffic.prototype.clearAround = function (x, z, radius) {
    var r2 = radius * radius;
    for (var i = 0; i < this.cars.length; i++) {
      var c = this.cars[i];
      if (!c || !c.traffic || c.owner !== 'traffic') continue;
      if (U.dist2(c.pos.x, c.pos.z, x, z) < r2) {
        c.mesh.visible = false;
        c.traffic.active = false;
      }
    }
    for (i = 0; i < this.peds.length; i++) {
      var p = this.peds[i];
      if (U.dist2(p.char.root.position.x, p.char.root.position.z, x, z) < r2) {
        p.char.root.visible = false;
        p.active = false;
      }
    }
  };

  CH.Traffic = Traffic;
}());
