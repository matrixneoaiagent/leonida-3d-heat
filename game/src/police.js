/* COBALT HEAT — police and wanted level.
   Cruiser pursuit, foot officers, roadblocks, stars, decay and the BUSTED meter. */
(function () {
  'use strict';

  var CH = window.CH = window.CH || {};
  var U = CH.Util;
  var C = CH.CONFIG;
  var W = C.WORLD;

  function Police(game) {
    this.game = game;
    this.wanted = 0;
    this.units = [];
    this.officers = [];
    this.roadblock = null;
    this.bustedMeter = 0;
    this.hiddenTimer = 0;
    this.seen = false;
    this.spawnTimer = 0;
    this.unitSeq = 0;
    this.roadblockCooldown = 0;
    this.lastCrime = null;
    this.callout = '';
    this.calloutTimer = 0;
    this._tmp = new THREE.Vector3();
  }

  Police.prototype.setWanted = function (level, reason, silent) {
    level = U.clamp(level, 0, 5);
    var old = this.wanted;
    this.wanted = level;
    this.hiddenTimer = 0;
    if (level > old) {
      this.lastCrime = reason || 'DISTURBING THE PEACE';
      this.hiddenTimer = 0;
      if (!silent && this.game.hud) {
        this.game.hud.toast('WANTED LEVEL ' + Math.ceil(level), this.lastCrime);
        this.game.audio.stinger(false);
      }
    } else if (level <= 0.01 && old > 0) {
      this.clearUnits();
      if (!silent && this.game.hud) this.game.hud.toast('HEAT CLEARED', 'The coast is quiet again.');
      this.game.audio.setSiren(false);
    }
    if (this.game.hud) this.game.hud.setWanted(this.wanted);
    this.game.audio.setSiren(level >= 1);
  };

  Police.prototype.addWanted = function (n, reason) {
    if (this.wanted >= 5) return;
    this.setWanted(Math.min(5, this.wanted + n), reason);
  };

  Police.prototype.onGunshot = function (x, z) {
    if (this.wanted <= 0) this.addWanted(1, 'DISCHARGING A FIREARM');
    this.callout = 'SHOTS FIRED · ' + this.game.world.districtLabel(x, z);
    this.calloutTimer = 5;
  };

  Police.prototype.update = function (dt, player) {
    var i;
    this.spawnTimer -= dt;
    this.roadblockCooldown -= dt;
    this.calloutTimer -= dt;
    this.seen = false;
    if (!player) return;

    if (this.wanted > 0) {
      var seeUnit = false;
      for (i = 0; i < this.units.length; i++) {
        var unit = this.units[i];
        if (unit.mesh.visible && U.dist(unit.pos.x, unit.pos.z, player.pos.x, player.pos.z) < 58 && this.game.combat.hasLineOfSight(unit.pos.x, unit.pos.z, player.pos.x, player.pos.z)) {
          seeUnit = true;
          break;
        }
      }
      this.seen = seeUnit;
      if (!seeUnit) {
        this.hiddenTimer += dt;
        if (this.hiddenTimer > 6) {
          this.wanted = Math.max(0, this.wanted - dt * 0.045);
          if (this.wanted <= 0.02) this.setWanted(0, '', true);
          else if (this.game.hud) this.game.hud.setWanted(this.wanted);
        }
      } else {
        this.hiddenTimer = 0;
      }

      var targetUnits = Math.min(7, 1 + Math.ceil(this.wanted) * 1.35);
      if (this.units.length < targetUnits && this.spawnTimer <= 0) {
        this.spawnTimer = Math.max(2.2, 5.2 - this.wanted * 0.45);
        this.spawnUnit(player);
      }
      if (this.wanted >= 3 && !this.roadblock && this.roadblockCooldown <= 0) {
        this.roadblockCooldown = 38;
        this.buildRoadblock(player);
      }
    } else {
      this.bustedMeter = Math.max(0, this.bustedMeter - dt * 0.9);
    }

    this.updateUnits(dt, player);
    this.updateBusted(dt, player);
    this.updateRoadblock(dt);
    this.pruneUnits();
    if (this.game.hud) this.game.hud.setPursuit(this.units.length, this.roadblock ? true : false, this.calloutTimer > 0 ? this.callout : '');
  };

  Police.prototype.updateUnits = function (dt, player) {
    var target = player.currentVehicle ? player.currentVehicle.pos : player.pos;
    for (var i = 0; i < this.units.length; i++) {
      var unit = this.units[i];
      if (!unit || !unit.ai) continue;
      if (unit.ai.state === 'roadblock') { unit.updateVisual(dt); continue; }
      var dx = target.x - unit.pos.x;
      var dz = target.z - unit.pos.z;
      var dist = Math.hypot(dx, dz);
      var desired = Math.atan2(dx, dz);
      var angleDiff = U.angleTo(unit.heading, desired);
      var maxSpeed = Math.min(unit.spec.maxSpeed + 5, 25 + this.wanted * 3.5);
      if (dist < 10) maxSpeed = player.currentVehicle ? 18 : 5;
      if (player.currentVehicle) maxSpeed = Math.min(unit.spec.maxSpeed + 8, 27 + this.wanted * 4);
      var speedTarget = dist > 3 ? maxSpeed : 0;
      if (Math.abs(angleDiff) > 1.2) speedTarget *= 0.32;
      unit.speed = U.damp(unit.speed, speedTarget, 1.7, dt);
      unit.heading = U.dampAngle(unit.heading, desired, 2.4 + this.wanted * 0.4, dt);
      if (player.currentVehicle) {
        /* lead the player's car slightly for a more convincing pursuit */
        var pv = player.currentVehicle;
        var leadX = pv.pos.x + Math.sin(pv.heading) * pv.speed * 0.45;
        var leadZ = pv.pos.z + Math.cos(pv.heading) * pv.speed * 0.45;
        var leadAngle = Math.atan2(leadX - unit.pos.x, leadZ - unit.pos.z);
        unit.heading = U.dampAngle(unit.heading, leadAngle, 1.7, dt);
      }
      var fx = Math.sin(unit.heading), fz = Math.cos(unit.heading);
      var nx = unit.pos.x + fx * unit.speed * dt;
      var nz = unit.pos.z + fz * unit.speed * dt;
      var blocked = false;
      for (var s = -1; s <= 1; s += 2) {
        var sx = nx + fx * s * unit.spec.length * 0.3;
        var sz = nz + fz * s * unit.spec.length * 0.3;
        for (var c = 0; c < this.game.world.colliders.length; c++) {
          var b = this.game.world.colliders[c];
          if (U.circleRect(sx, sz, unit.spec.width * 0.52, b)) { blocked = true; break; }
        }
        if (blocked) break;
      }
      if (!blocked) {
        unit.pos.x = U.clamp(nx, -465, 465);
        unit.pos.z = U.clamp(nz, -465, 465);
        unit.ai.stuck = 0;
      } else {
        unit.speed *= 0.35;
        unit.ai.stuck += dt;
        unit.heading += Math.sin(this.game.time * 2 + i) * dt * 1.8;
      }
      if (unit.ai.stuck > 2.5) {
        this.repositionUnit(unit, player);
        unit.ai.stuck = 0;
      }
      if (player.currentVehicle && dist < 4.2) {
        var pv2 = player.currentVehicle;
        var response = U.clamp(unit.speed / 20, 0.2, 1);
        pv2.speed *= 1 - response * 0.45;
        pv2.damageBy(response * 5);
        this.game.effects.impact(unit.pos.x, 0.8, unit.pos.z);
        this.game.cameraRig.shakeCamera(response * 0.35);
        unit.speed *= -0.2;
      }
      unit.pos.y = 0;
      unit.mesh.position.copy(unit.pos);
      unit.mesh.rotation.y = unit.heading;
      unit.siren = true;
      unit.updateVisual(dt);
      if (!unit.ai.deployed && !player.currentVehicle && dist < 13) {
        unit.ai.deployed = true;
        this.deployOfficer(unit, player);
      }
    }
  };

  Police.prototype.repositionUnit = function (unit, player) {
    var xRoad = U.nearestRoad(player.pos.x, W.roadsX);
    var zRoad = U.nearestRoad(player.pos.z, W.roadsZ);
    var useVertical = Math.abs(player.pos.x - xRoad) < Math.abs(player.pos.z - zRoad);
    var along = useVertical ? player.pos.z + (unit.pos.z > player.pos.z ? 115 : -115) : player.pos.x + (unit.pos.x > player.pos.x ? 115 : -115);
    if (useVertical) unit.setPosition(xRoad + (unit.pos.x > xRoad ? 2.8 : -2.8), U.clamp(along, -430, 430), unit.pos.z > player.pos.z ? Math.PI : 0);
    else unit.setPosition(U.clamp(along, -430, 430), zRoad + (unit.pos.z > zRoad ? 2.8 : -2.8), unit.pos.x > player.pos.x ? -Math.PI / 2 : Math.PI / 2);
    unit.speed = 22;
  };

  Police.prototype.spawnUnit = function (player) {
    var xRoad = U.nearestRoad(player.pos.x, W.roadsX);
    var zRoad = U.nearestRoad(player.pos.z, W.roadsZ);
    var useVertical = Math.abs(player.pos.x - xRoad) < Math.abs(player.pos.z - zRoad);
    var side = Math.random() < 0.5 ? -1 : 1;
    var along = useVertical ? player.pos.z + side * 145 : player.pos.x + side * 145;
    var x, z, heading;
    if (useVertical) {
      x = xRoad + (Math.random() < 0.5 ? 2.8 : -2.8);
      z = U.clamp(along, -435, 435);
      heading = side > 0 ? Math.PI : 0;
    } else {
      x = U.clamp(along, -435, 435);
      z = zRoad + (Math.random() < 0.5 ? 2.8 : -2.8);
      heading = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    var car = new CH.Vehicle(this.game, 'corsair', { x: x, z: z, heading: heading, color: '#f4f0df', owner: 'police' });
    car.ai = { state: 'pursue', stuck: 0, deployed: false, id: ++this.unitSeq };
    car.owner = 'police';
    car.siren = true;
    car.speed = 18;
    this.units.push(car);
    this.game.vehicles.push(car);
    car.updateVisual(0);
    return car;
  };

  Police.prototype.deployOfficer = function (unit, player) {
    var side = Math.random() < 0.5 ? -1 : 1;
    var ox = unit.pos.x + Math.cos(unit.heading) * 2.5 * side;
    var oz = unit.pos.z - Math.sin(unit.heading) * 2.5 * side;
    var officer = this.game.combat.spawnEnemy({
      kind: 'cop', faction: 'police', officer: true, health: 62, weapon: 'pistol',
      x: ox, z: oz, yaw: Math.atan2(player.pos.x - ox, player.pos.z - oz),
      accuracy: 0.58, name: 'MARISOL P.D.', role: 'cop'
    });
    officer.char.root.scale.setScalar(1.0);
    var bar = officer.barSprite;
    if (bar) bar.visible = false;
    this.officers.push(officer);
    this.game.hud.toast('OFFICER DEPLOYED', 'You are being boxed in.');
  };

  Police.prototype.updateBusted = function (dt, player) {
    if (player.currentVehicle || player.dead) {
      this.bustedMeter = Math.max(0, this.bustedMeter - dt * 0.8);
      if (this.game.hud) this.game.hud.setBusted(0);
      return;
    }
    var near = false;
    for (var i = 0; i < this.officers.length; i++) {
      var o = this.officers[i];
      if (!o.alive) continue;
      if (U.dist(o.pos.x, o.pos.z, player.pos.x, player.pos.z) < 8 && this.game.combat.hasLineOfSight(o.pos.x, o.pos.z, player.pos.x, player.pos.z)) { near = true; break; }
    }
    if (near) this.bustedMeter += dt * 0.28;
    else this.bustedMeter = Math.max(0, this.bustedMeter - dt * 0.7);
    if (this.game.hud) this.game.hud.setBusted(this.bustedMeter);
    if (this.bustedMeter >= 1) {
      this.bustedMeter = 0;
      if (this.game.hud) this.game.hud.setBusted(0);
      this.game.onBusted();
    }
  };

  Police.prototype.buildRoadblock = function (player) {
    if (this.roadblock) this.clearRoadblock();
    var heading = player.currentVehicle ? player.currentVehicle.heading : player.heading;
    var fx = Math.sin(heading), fz = Math.cos(heading);
    var x = player.pos.x + fx * 92;
    var z = player.pos.z + fz * 92;
    var xRoad = U.nearestRoad(x, W.roadsX);
    var zRoad = U.nearestRoad(z, W.roadsZ);
    var onX = Math.abs(x - xRoad) < 22;
    var onZ = Math.abs(z - zRoad) < 22;
    if (!onX && !onZ) { x = xRoad; z = player.pos.z + fz * 92; }
    else if (onZ) { z = zRoad; }
    else if (onX) { x = xRoad; }
    var group = new THREE.Group();
    var units = [];
    var angle = heading + Math.PI;
    for (var i = 0; i < 2; i++) {
      var off = (i === 0 ? -1 : 1) * 4.4;
      var ux = x + Math.cos(heading) * off;
      var uz = z - Math.sin(heading) * off;
      var car = new CH.Vehicle(this.game, 'corsair', { x: ux, z: uz, heading: angle + (i ? -0.34 : 0.34), color: '#f4f0df', owner: 'police' });
      car.ai = { state: 'roadblock', stuck: 0, deployed: true, id: ++this.unitSeq };
      car.owner = 'police';
      car.siren = true;
      car.speed = 0;
      this.units.push(car);
      this.game.vehicles.push(car);
      units.push(car);
      group.add(car.mesh);
      this.game.scene.remove(car.mesh);
      group.add(car.mesh);
    }
    var coneMat = new THREE.MeshLambertMaterial({ color: 0xe76b3d });
    var whiteMat = new THREE.MeshLambertMaterial({ color: 0xf3e4c2 });
    var cones = [];
    for (i = 0; i < 7; i++) {
      var cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 7), coneMat);
      cone.position.set(x - 6 + i * 2, 0.46, z + (i % 2 ? 1.2 : -1.2));
      cone.castShadow = true;
      var band = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.18, 7), whiteMat);
      band.position.y = 0.12; cone.add(band);
      group.add(cone);
      cones.push(cone);
    }
    var barMat = new THREE.MeshLambertMaterial({ color: 0xe8dcc0 });
    for (i = 0; i < 3; i++) {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.0, 0.35), barMat);
      bar.position.set(x - 5 + i * 5, 0.9, z - 2.7);
      bar.rotation.y = 0.05;
      bar.castShadow = true;
      group.add(bar);
      for (var k = 0; k < 4; k++) {
        var strip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.02, 0.37), new THREE.MeshLambertMaterial({ color: 0xd05540 }));
        strip.position.set(-1.7 + k * 1.1, 0.9, 0);
        bar.add(strip);
      }
    }
    this.game.scene.add(group);
    var officers = [];
    for (i = 0; i < 2; i++) {
      var ox = x + (i ? 5 : -5), oz = z - 5;
      var off2 = this.game.combat.spawnEnemy({
        kind: 'cop', faction: 'police', officer: true, health: 60, weapon: 'pistol',
        x: ox, z: oz, yaw: angle, accuracy: 0.54, name: 'ROADBLOCK UNIT'
      });
      if (off2.barSprite) off2.barSprite.visible = false;
      this.officers.push(off2);
      officers.push(off2);
    }
    this.roadblock = { group: group, units: units, officers: officers, cones: cones, x: x, z: z, timer: 55 };
    this.callout = 'ROADBLOCK SET · AHEAD';
    this.calloutTimer = 10;
    this.game.hud.toast('ROADBLOCK', 'Marisol P.D. has closed the avenue.');
  };

  Police.prototype.updateRoadblock = function (dt) {
    if (!this.roadblock) return;
    this.roadblock.timer -= dt;
    if (this.roadblock.timer <= 0) this.clearRoadblock();
  };

  Police.prototype.clearRoadblock = function () {
    if (!this.roadblock) return;
    if (this.roadblock.group && this.roadblock.group.parent) this.game.scene.remove(this.roadblock.group);
    for (var i = 0; i < this.roadblock.units.length; i++) {
      var u = this.roadblock.units[i];
      var idx = this.units.indexOf(u);
      if (idx >= 0) this.units.splice(idx, 1);
      var vi = this.game.vehicles.indexOf(u);
      if (vi >= 0) this.game.vehicles.splice(vi, 1);
    }
    for (i = 0; i < this.roadblock.officers.length; i++) {
      var o = this.roadblock.officers[i];
      if (!o.alive) continue;
      o.alive = false;
      if (o.char.root.parent) this.game.scene.remove(o.char.root);
      if (o.barSprite && o.barSprite.parent) this.game.scene.remove(o.barSprite);
    }
    this.roadblock = null;
  };

  Police.prototype.updateOfficers = function () {
    for (var i = this.officers.length - 1; i >= 0; i--) {
      if (!this.officers[i].alive) {
        this.officers.splice(i, 1);
      }
    }
  };

  Police.prototype.officerDown = function () {
    this.addWanted(1, 'OFFICER DOWN');
  };

  Police.prototype.pruneUnits = function () {
    this.updateOfficers();
    for (var i = this.units.length - 1; i >= 0; i--) {
      var u = this.units[i];
      if (u.ai && u.ai.state === 'roadblock') continue;
      if (this.wanted <= 0.02 || u.health <= 0) {
        if (u.mesh.parent) this.game.scene.remove(u.mesh);
        var vi = this.game.vehicles.indexOf(u);
        if (vi >= 0) this.game.vehicles.splice(vi, 1);
        this.units.splice(i, 1);
      }
    }
  };

  Police.prototype.clearUnits = function () {
    for (var i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (u.mesh.parent) this.game.scene.remove(u.mesh);
      var vi = this.game.vehicles.indexOf(u);
      if (vi >= 0) this.game.vehicles.splice(vi, 1);
    }
    this.units.length = 0;
    for (i = 0; i < this.officers.length; i++) {
      var o = this.officers[i];
      if (!o.alive) continue;
      o.alive = false;
      if (o.char.root.parent) this.game.scene.remove(o.char.root);
      if (o.barSprite && o.barSprite.parent) this.game.scene.remove(o.barSprite);
    }
    this.officers.length = 0;
    this.clearRoadblock();
    this.bustedMeter = 0;
    if (this.game.hud) this.game.hud.setBusted(0);
    this.game.audio.setSiren(false);
  };

  Police.prototype.clear = function () {
    this.setWanted(0, '', true);
    this.clearUnits();
  };

  Police.prototype.stageUnit = function (x, z, heading, speed, deployed) {
    var car = new CH.Vehicle(this.game, 'corsair', { x: x, z: z, heading: heading, color: '#f4f0df', owner: 'police' });
    car.ai = { state: 'pursue', stuck: 0, deployed: !!deployed, id: ++this.unitSeq };
    car.owner = 'police';
    car.siren = true;
    car.speed = speed || 0;
    car.updateVisual(0);
    this.units.push(car);
    this.game.vehicles.push(car);
    return car;
  };

  Police.prototype.stageOfficer = function (x, z, yaw, name, health) {
    var o = this.game.combat.spawnEnemy({
      kind: 'cop', faction: 'police', officer: true, health: health || 62, weapon: 'pistol',
      x: x, z: z, yaw: yaw, accuracy: 0.52, name: name || 'MARISOL P.D.'
    });
    if (o.barSprite) o.barSprite.visible = false;
    this.officers.push(o);
    return o;
  };

  CH.Police = Police;
}());

// Recording check: police module reviewed for the live capture.
