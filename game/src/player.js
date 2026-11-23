/* COBALT HEAT — player controller.
   On-foot movement, vehicle handling, carjacking, inventory and vitals. */
(function () {
  'use strict';

  var CH = window.CH = window.CH || {};
  var U = CH.Util;
  var C = CH.CONFIG;
  var P = C.PLAYER;

  function Player(game) {
    this.game = game;
    this.world = game.world;
    this.pos = new THREE.Vector3(WX(), 0.22, WZ());
    this.vel = new THREE.Vector3();
    this.heading = Math.PI;
    this.targetHeading = Math.PI;
    this.speed = 0;
    this.vertical = 0;
    this.grounded = true;
    this.aiming = false;
    this.firing = false;
    this.dead = false;
    this.deathTimer = 0;
    this.health = P.health;
    this.maxHealth = 100;
    this.armor = P.armor;
    this.money = P.money;
    this.wanted = 0;
    this.currentVehicle = null;
    this.inVehicle = false;
    this.weapons = {
      fists: { owned: true, mag: 0, reserve: 0 },
      pistol: { owned: true, mag: 12, reserve: 96 },
      smg: { owned: false, mag: 0, reserve: 0 },
      shotgun: { owned: false, mag: 0, reserve: 0 }
    };
    this.weapon = 'pistol';
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.footstepTimer = 0;
    this.lastSafe = new THREE.Vector3(this.pos.x, this.pos.y, this.pos.z);
    this.climbY = 0;
    this.carEnterCooldown = 0;
    this.damageFlash = 0;

    this.character = new CH.Character({
      game: game, kind: 'player', seed: 'teo-vela',
      x: this.pos.x, z: this.pos.z, yaw: this.heading
    });
    this.character.root.position.y = this.pos.y;
    game.scene.add(this.character.root);
    this.applyWeaponVisual();
  }

  function WX() { return C.WORLD.spawn.x; }
  function WZ() { return C.WORLD.spawn.z; }

  Player.prototype.reset = function (x, z, yaw) {
    if (this.currentVehicle) this.exitVehicle(true);
    this.pos.set(x != null ? x : WX(), 0, z != null ? z : WZ());
    this.pos.y = this.world.groundHeight(this.pos.x, this.pos.z);
    this.heading = yaw == null ? Math.PI : yaw;
    this.targetHeading = this.heading;
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.vertical = 0;
    this.grounded = true;
    this.dead = false;
    this.deathTimer = 0;
    this.health = 100;
    this.armor = 25;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.character.setVisible(true);
    this.character.root.rotation.set(0, this.heading, 0);
    this.character.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.character.alive = true;
    this.character.setMode('idle');
    this.lastSafe.copy(this.pos);
  };

  Player.prototype.enterVehicle = function (vehicle, silent) {
    if (!vehicle || this.dead || this.inVehicle) return false;
    var wasTraffic = vehicle.owner === 'traffic' || vehicle.owner === 'police';
    this.currentVehicle = vehicle;
    this.inVehicle = true;
    this.pos.copy(vehicle.pos);
    this.speed = 0;
    this.character.setVisible(false);
    vehicle.occupied = true;
    vehicle.owner = 'player';
    vehicle.stop();
    if (vehicle.traffic) vehicle.traffic.active = false;
    if (vehicle.parked) vehicle.parked = false;
    this.game.cameraRig.setMode('vehicle');
    if (!silent && wasTraffic) this.game.police.addWanted(1, 'GRAND THEFT AUTO');
    this.game.hud.toast(vehicle.spec.label + ' ACQUIRED', wasTraffic ? 'The owner is calling the police.' : 'Keys were already in it.');
    this.game.audio.setEngine(true, 0);
    if (vehicle.siren) vehicle.siren = false;
    return true;
  };

  Player.prototype.exitVehicle = function (force) {
    if (!this.currentVehicle) return false;
    var car = this.currentVehicle;
    var leftX = -Math.cos(car.heading);
    var leftZ = Math.sin(car.heading);
    var x = car.pos.x + leftX * (car.spec.width / 2 + 0.7);
    var z = car.pos.z + leftZ * (car.spec.width / 2 + 0.7);
    this.pos.set(x, this.world.groundHeight(x, z), z);
    this.world.resolveCircle(this.pos, 0.48);
    this.pos.y = this.world.groundHeight(this.pos.x, this.pos.z);
    this.heading = car.heading;
    this.targetHeading = this.heading;
    this.character.root.rotation.set(0, this.heading, 0);
    this.character.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.character.setVisible(true);
    this.character.setMode('idle');
    car.stop();
    car.occupied = false;
    car.owner = 'abandoned';
    this.currentVehicle = null;
    this.inVehicle = false;
    this.speed = 0;
    this.carEnterCooldown = 0.6;
    this.game.cameraRig.setMode('foot');
    this.game.audio.setEngine(false, 0);
    if (!force) this.game.hud.toast('ON FOOT', 'The city is louder down here.');
    return true;
  };

  Player.prototype.nearestVehicle = function (maxDistance) {
    var best = null, bd = (maxDistance || P.enterRange) * (maxDistance || P.enterRange);
    var list = this.game.vehicles;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (!v || !v.mesh.visible) continue;
      if (v.occupied && v !== this.currentVehicle) continue;
      var d = U.dist2(this.pos.x, this.pos.z, v.pos.x, v.pos.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  };

  Player.prototype.toggleVehicle = function () {
    if (this.inVehicle) return this.exitVehicle();
    if (this.carEnterCooldown > 0) return false;
    var v = this.nearestVehicle();
    if (!v) return false;
    return this.enterVehicle(v);
  };

  Player.prototype.update = function (dt) {
    var input = this.game.input;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.reloadTimer = Math.max(0, this.reloadTimer - dt);
    this.carEnterCooldown = Math.max(0, this.carEnterCooldown - dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2);

    if (this.dead) {
      this.deathTimer += dt;
      this.character.update(dt, 0, false);
      return;
    }

    if (this.inVehicle && this.currentVehicle) {
      this.updateVehicle(dt, input);
    } else {
      this.updateFoot(dt, input);
    }
    this.character.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    if (!this.inVehicle) this.character.root.rotation.y = this.heading;
    this.character.update(dt, this.inVehicle ? 0 : Math.abs(this.speed), this.aiming && !this.inVehicle);
    if (this.inVehicle) this.character.setVisible(false);

    if (this.health < 30 && !this.dead) this.game.hud.setCritical(true);
    else this.game.hud.setCritical(false);
  };

  Player.prototype.updateFoot = function (dt, input) {
    var ax = input.axisX();
    var ay = input.axisY();
    var move = new THREE.Vector2(ax, ay);
    if (move.lengthSq() > 1) move.normalize();
    var yaw = this.game.cameraRig.yaw;
    var fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
    var rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
    var wishX = fwdX * move.y + rightX * move.x;
    var wishZ = fwdZ * move.y + rightZ * move.x;
    var wishLen = Math.hypot(wishX, wishZ);
    this.aiming = input.rightDown || this.game.combat.aimHeld;
    var maxSpeed = this.aiming ? P.aimSpeed : (input.sprint() ? P.runSpeed : P.walkSpeed);
    if (this.game.combat && this.game.combat.isFiring) maxSpeed = P.walkSpeed * 0.9;

    if (wishLen > 0.01) {
      wishX /= wishLen; wishZ /= wishLen;
      var target = maxSpeed;
      this.speed = U.damp(this.speed, target, 12, dt);
      this.vel.x = U.damp(this.vel.x, wishX * this.speed, 14, dt);
      this.vel.z = U.damp(this.vel.z, wishZ * this.speed, 14, dt);
      if (!this.aiming) {
        this.targetHeading = Math.atan2(wishX, wishZ);
      }
    } else {
      this.speed = U.damp(this.speed, 0, 14, dt);
      this.vel.x = U.damp(this.vel.x, 0, 16, dt);
      this.vel.z = U.damp(this.vel.z, 0, 16, dt);
    }
    if (this.aiming) {
      this.targetHeading = this.game.cameraRig.yaw;
    }
    this.heading = U.dampAngle(this.heading, this.targetHeading, 15, dt);

    var nx = this.pos.x + this.vel.x * dt;
    this.pos.x = nx;
    this.world.resolveCircle(this.pos, C.WORLD.playerRadius, this.pos.y);
    var nz = this.pos.z + this.vel.z * dt;
    this.pos.z = nz;
    this.world.resolveCircle(this.pos, C.WORLD.playerRadius, this.pos.y);
    this.world.clampToWorld(this.pos);
    if (this.pos.x < -480) { this.pos.x = -480; this.vel.x = 0; }

    var ground = this.world.groundHeight(this.pos.x, this.pos.z);
    if (input.wasPressed('Space') && this.grounded && !this.aiming) {
      this.vertical = P.jumpSpeed;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.vertical -= P.gravity * dt;
      this.pos.y += this.vertical * dt;
      if (this.pos.y <= ground) { this.pos.y = ground; this.vertical = 0; this.grounded = true; }
    } else {
      this.pos.y = ground;
    }

    if (Math.abs(this.speed) > 0.4) {
      this.footstepTimer += dt * Math.abs(this.speed);
      if (this.footstepTimer > 2.4) {
        this.footstepTimer = 0;
        this.game.audio.noise(0.035, 0.012, 900);
      }
      if (this.grounded && !this.aiming) {
        var safeDist = U.dist2(this.pos.x, this.pos.z, this.lastSafe.x, this.lastSafe.z);
        if (safeDist > 4) this.lastSafe.set(this.pos.x, this.pos.y, this.pos.z);
      }
    }
    if (!this.world.isRoad(this.pos.x, this.pos.z)) this.lastSafe.set(this.pos.x, this.pos.y, this.pos.z);
  };

  Player.prototype.updateVehicle = function (dt, input) {
    var car = this.currentVehicle;
    if (!car) return;
    var throttle = input.axisY();
    var steerInput = input.axisX();
    var handbrake = input.isDown('Space');
    var spec = car.spec;
    var maxSpeed = spec.maxSpeed;
    var target;
    if (throttle > 0) target = maxSpeed;
    else if (throttle < 0) target = -maxSpeed * 0.34;
    else target = 0;
    var accel = throttle !== 0 ? spec.accel : spec.brake * 0.7;
    if (handbrake) accel = spec.brake * 1.4;
    if (car.health <= 0) accel *= 0.25;
    car.speed = U.approach(car.speed, target, accel * dt);
    car.speed *= 1 - dt * (throttle === 0 ? 0.9 : 0.16);
    if (handbrake) car.speed *= 1 - dt * 1.8;
    if (Math.abs(car.speed) < 0.08 && throttle === 0) car.speed = 0;
    var onRoad = this.world.isRoad(car.pos.x, car.pos.z);
    if (!onRoad) car.speed *= 1 - dt * 1.2;
    if (car.pos.x < -475) car.speed *= 0.7;

    var steerRate = spec.steer * (handbrake ? 1.35 : 1);
    var speedFactor = U.clamp(Math.abs(car.speed) / 8, 0, 1);
    if (Math.abs(car.speed) > 0.3) {
      var direction = car.speed >= 0 ? 1 : -1;
      car.heading = U.wrapAngle(car.heading + steerInput * direction * steerRate * speedFactor * dt);
    }
    car.steer = U.damp(car.steer, steerInput, 8, dt);
    var fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    var newX = car.pos.x + fx * car.speed * dt;
    var newZ = car.pos.z + fz * car.speed * dt;

    /* multi-point collision against buildings, walls and other props */
    var samples = [-spec.length * 0.31, 0, spec.length * 0.31];
    var hit = false;
    for (var s = 0; s < samples.length; s++) {
      var sx = newX + fx * samples[s];
      var sz = newZ + fz * samples[s];
      for (var i = 0; i < this.world.colliders.length; i++) {
        if (U.circleRect(sx, sz, spec.width * 0.52, this.world.colliders[i])) { hit = true; break; }
      }
      if (hit) break;
    }
    if (hit) {
      if (Math.abs(car.speed) > 18) {
        this.game.effects.impact(car.pos.x + fx * spec.length * 0.4, 0.8, car.pos.z + fz * spec.length * 0.4);
        this.game.audio.impact(false);
        car.damageBy(Math.abs(car.speed) * 0.6);
        if (this.game.combat) this.game.combat.screenShake = Math.max(this.game.combat.screenShake, 0.25);
      }
      car.speed = -car.speed * 0.18;
      newX = car.pos.x + fx * car.speed * dt;
      newZ = car.pos.z + fz * car.speed * dt;
    }
    car.pos.x = U.clamp(newX, -472, C.WORLD.half - 16);
    car.pos.z = U.clamp(newZ, -C.WORLD.half + 16, C.WORLD.half - 16);
    car.pos.y = 0;
    this.pos.copy(car.pos);
    this.heading = car.heading;
    this.speed = car.speed;

    /* traffic contact */
    var list = this.game.vehicles;
    for (i = 0; i < list.length; i++) {
      var v = list[i];
      if (v === car || !v.mesh.visible) continue;
      var d = U.dist(car.pos.x, car.pos.z, v.pos.x, v.pos.z);
      var minD = (spec.length + v.spec.length) * 0.35;
      if (d < minD && d > 0.01) {
        var dx = car.pos.x - v.pos.x, dz = car.pos.z - v.pos.z;
        car.pos.x += dx / d * (minD - d) * 0.55;
        car.pos.z += dz / d * (minD - d) * 0.55;
        if (Math.abs(car.speed) > 7) {
          car.speed *= 0.55;
          v.damageBy(4);
          this.game.effects.impact(v.pos.x, 0.8, v.pos.z);
          this.game.audio.impact(true);
        } else car.speed *= 0.9;
        if (v.owner === 'traffic' && v.traffic) v.traffic.panic = 3;
      }
    }

    if (input.consume('KeyH')) this.game.audio.horn();
    if (input.consume('KeyR') && input.isDown('ShiftLeft')) {
      this.game.audio.nextStation();
      this.game.hud.updateRadio();
      var station = C.RADIO[this.game.audio.station % C.RADIO.length];
      this.game.hud.toast('RADIO ' + station.name, station.tag);
    }
    car.updateVisual(dt);
    this.game.audio.setEngine(true, car.speed);
  };

  Player.prototype.getAimDirection = function () {
    var dir = new THREE.Vector3();
    if (this.game.camera) this.game.camera.getWorldDirection(dir);
    else dir.set(Math.sin(this.game.cameraRig.yaw), Math.sin(this.game.cameraRig.pitch), Math.cos(this.game.cameraRig.yaw));
    return dir.normalize();
  };

  Player.prototype.getMuzzle = function () {
    var dir = this.getAimDirection();
    return new THREE.Vector3(
      this.pos.x + dir.x * 1.0 + Math.cos(this.game.cameraRig.yaw) * 0.32,
      this.pos.y + 1.45 + dir.y * 0.4,
      this.pos.z + dir.z * 1.0 - Math.sin(this.game.cameraRig.yaw) * 0.32
    );
  };

  Player.prototype.takeDamage = function (amount, sourceX, sourceZ) {
    if (this.dead) return;
    var armored = Math.min(this.armor, amount * 0.55);
    this.armor -= armored;
    this.health -= amount - armored;
    this.damageFlash = 1;
    this.game.hud.flashDamage();
    this.game.combat.screenShake = Math.max(this.game.combat.screenShake, 0.32);
    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }
    if (sourceX != null) {
      var a = Math.atan2(this.pos.x - sourceX, this.pos.z - sourceZ);
      this.game.hud.showDamageDirection(a);
    }
  };

  Player.prototype.die = function () {
    if (this.dead) return;
    this.dead = true;
    this.deathTimer = 0;
    this.character.die();
    this.character.setVisible(true);
    if (this.inVehicle) this.exitVehicle(true);
    this.game.onPlayerDeath();
  };

  Player.prototype.respawn = function () {
    var fee = Math.min(this.money, P.respawnFee);
    this.money -= fee;
    this.pos.set(P.hospital.x, 0.22, P.hospital.z);
    this.heading = Math.PI;
    this.health = 65;
    this.armor = 0;
    this.dead = false;
    this.deathTimer = 0;
    this.character.root.rotation.set(0, this.heading, 0);
    this.character.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.character.mode = 'idle';
    this.character.alive = true;
    this.character.setVisible(true);
    this.game.police.clear();
    this.game.hud.setCritical(false);
    this.game.hud.toast('CLARA VISTA HOSPITAL', 'Patched up. $' + U.formatMoney(fee) + ' lighter.');
  };

  Player.prototype.addMoney = function (amount) {
    this.money = Math.max(0, this.money + amount);
    this.game.hud.cashPop(amount);
    if (amount > 0) this.game.audio.cash();
  };

  Player.prototype.addWanted = function (n, reason) {
    this.game.police.addWanted(n, reason);
  };

  Player.prototype.giveWeapon = function (id, mag, reserve) {
    var w = this.weapons[id];
    if (!w) return;
    w.owned = true;
    if (mag != null) w.mag = mag;
    else if (w.mag === 0) w.mag = C.WEAPONS[id].mag;
    if (reserve != null) w.reserve = reserve;
    if (id !== 'fists') this.switchWeapon(id);
  };

  Player.prototype.switchWeapon = function (id) {
    if (!this.weapons[id] || !this.weapons[id].owned) return false;
    this.weapon = id;
    this.applyWeaponVisual();
    this.game.hud.setWeapon(id);
    this.game.audio.ui();
    return true;
  };

  Player.prototype.purchaseWeapon = function (id) {
    var spec = C.WEAPONS[id];
    var w = this.weapons[id];
    if (!spec || !w) return false;
    if (w.owned) return this.switchWeapon(id);
    var price = spec.price || 0;
    if (price > 0 && this.money < price) {
      this.game.hud.toast('NOT ENOUGH CASH', spec.name + ' costs $' + U.formatMoney(price) + '.');
      this.game.audio.ui();
      return false;
    }
    if (price > 0) this.addMoney(-price);
    this.giveWeapon(id, spec.mag, spec.starterReserve || spec.reserve || 90);
    this.game.hud.toast(spec.name + ' ACQUIRED', '$' + U.formatMoney(price) + ' spent at Teo\'s armory.', 'money');
    this.game.hud.setWeapon(id);
    return true;
  };

  Player.prototype.applyWeaponVisual = function () {
    if (!this.character) return;
    this.character.gun.visible = this.weapon !== 'fists' && !this.inVehicle;
    if (this.weapon === 'fists') this.character.gun.visible = false;
  };

  Player.prototype.reload = function () {
    var w = this.weapons[this.weapon];
    var spec = C.WEAPONS[this.weapon];
    if (!w || !spec || spec.kind === 'melee' || this.reloadTimer > 0) return false;
    var need = spec.mag - w.mag;
    if (need <= 0 || w.reserve <= 0) return false;
    var load = Math.min(need, w.reserve);
    w.reserve -= load;
    w.mag += load;
    this.reloadTimer = 1.15;
    this.game.audio.reload();
    this.game.hud.reloadFlash();
    return true;
  };

  Player.prototype.cycleWeapon = function (dir) {
    var order = ['fists', 'pistol', 'smg', 'shotgun'];
    var idx = order.indexOf(this.weapon);
    for (var i = 0; i < 4; i++) {
      idx = (idx + dir + 4) % 4;
      if (this.weapons[order[idx]].owned) { this.switchWeapon(order[idx]); return; }
    }
  };

  Player.prototype.giveAmmo = function (id, amount) {
    var w = this.weapons[id];
    if (!w) return;
    w.owned = true;
    w.reserve += amount;
  };

  Player.prototype.heal = function (amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  };

  CH.Player = Player;
}());
