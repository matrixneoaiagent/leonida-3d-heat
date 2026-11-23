/* COBALT HEAT — third-person camera.
   Over-the-shoulder on foot, a wider chase camera in a car, and fixed cinematic shots. */
(function () {
  'use strict';

  var CH = window.CH = window.CH || {};
  var U = CH.Util;

  function CameraRig(game, camera) {
    this.game = game;
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = -0.11;
    this.distance = 5.4;
    this.shoulder = 0.55;
    this.mode = 'foot';
    this.smoothPos = new THREE.Vector3(0, 4, 10);
    this.smoothLook = new THREE.Vector3(0, 1.5, 0);
    this.fov = 58;
    this.shake = 0;
    this.shotPos = null;
    this.shotLook = null;
    this.initialised = false;
    this.camTarget = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
  }

  CameraRig.prototype.applyLook = function (dt) {
    if (this.shotPos) return;
    var input = this.game.input;
    if (!input.enabled) return;
    var mouse = input.consumeMouse();
    var sens = 0.0024;
    if (input.locked || input.dragging) {
      this.yaw -= mouse.x * sens;
      this.pitch -= mouse.y * sens;
      this.pitch = U.clamp(this.pitch, -0.68, 0.55);
      this.yaw = U.wrapAngle(this.yaw);
    }
    if (!this.game.player || this.game.player.inVehicle) return;
    if (this.mode === 'foot' && !this.game.player.aiming && !this.game.combat.aimHeld) {
      if (input.isDown('ArrowLeft') && !input.locked) this.yaw += dt * 1.7;
      if (input.isDown('ArrowRight') && !input.locked) this.yaw -= dt * 1.7;
    }
  };

  CameraRig.prototype.setMode = function (mode) {
    this.mode = mode;
    if (mode === 'vehicle' && this.game.player && this.game.player.currentVehicle) {
      this.yaw = this.game.player.currentVehicle.heading;
      this.pitch = -0.08;
    }
    if (mode === 'foot') this.pitch = -0.11;
  };

  CameraRig.prototype.follow = function (dt, player) {
    if (this.shotPos) {
      this.applyShot();
      return;
    }
    var car = player.currentVehicle;
    if (this.mode === 'vehicle' && car) {
      this.updateVehicleCamera(dt, player, car);
    } else {
      this.updateFootCamera(dt, player);
    }
  };

  CameraRig.prototype.updateFootCamera = function (dt, player) {
    var aiming = player.aiming || this.game.combat.aimHeld;
    var target = this.camTarget.set(player.pos.x, player.pos.y + (aiming ? 1.5 : 1.44), player.pos.z);
    var dist = aiming ? 2.6 : 5.0;
    var heightPitch = aiming ? -0.02 : -0.11;
    if (!aiming) this.pitch = U.damp(this.pitch, -0.11, 3.2, dt);
    else this.pitch = U.damp(this.pitch, -0.015, 8, dt);
    var fw = this.forward.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    var right = this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    var shoulder = aiming ? 0.76 : 0.46;
    this.desired.copy(target).addScaledVector(fw, -dist).addScaledVector(right, shoulder);
    this.desired.y += aiming ? 0.2 : 0.32;
    this.collide(target, this.desired);
    this.smoothPos.lerp(this.desired, 1 - Math.exp(-(aiming ? 15 : 10) * dt));
    this.smoothLook.lerp(target, 1 - Math.exp(-18 * dt));
    if (!this.initialised) { this.smoothPos.copy(this.desired); this.smoothLook.copy(target); this.initialised = true; }
    this.applyCamera(dt, aiming ? 49 : 58);
  };

  CameraRig.prototype.updateVehicleCamera = function (dt, player, car) {
    var speed = Math.abs(car.speed);
    var factor = U.clamp(speed / car.spec.maxSpeed, 0, 1);
    var target = this.camTarget.set(car.pos.x, 1.2, car.pos.z);
    var dist = 7.1 + factor * 2.3;
    this.pitch = U.damp(this.pitch, -0.085 - factor * 0.025, 5, dt);
    var fw = this.forward.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    this.desired.copy(target).addScaledVector(fw, -dist);
    this.desired.y += 1.55;
    this.collide(target, this.desired);
    var rate = this.game.shotName ? 20 : 7.2;
    this.smoothPos.lerp(this.desired, 1 - Math.exp(-rate * dt));
    this.smoothLook.lerp(target, 1 - Math.exp(-10 * dt));
    if (!this.initialised) { this.smoothPos.copy(this.desired); this.smoothLook.copy(target); this.initialised = true; }
    var targetFov = 61 + factor * 13;
    this.applyCamera(dt, targetFov);
  };

  CameraRig.prototype.collide = function (target, desired) {
    var world = this.game.world;
    var steps = 14;
    var dx = desired.x - target.x, dz = desired.z - target.z;
    var dy = desired.y - target.y;
    for (var i = 2; i <= steps; i++) {
      var t = i / steps;
      var x = target.x + dx * t, y = target.y + dy * t, z = target.z + dz * t;
      var blocked = false;
      for (var j = 0; j < world.colliders.length; j++) {
        var b = world.colliders[j];
        if (b.minY != null && y < b.minY) continue;
        if (y < b.height && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) { blocked = true; break; }
      }
      if (blocked) {
        var back = Math.max(0.055, t - 0.07);
        desired.set(target.x + dx * back, target.y + dy * back, target.z + dz * back);
        return;
      }
    }
  };

  CameraRig.prototype.applyCamera = function (dt, targetFov) {
    var shake = this.shake + (this.game.combat ? this.game.combat.screenShake : 0);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    var sx = 0, sy = 0, sz = 0;
    if (shake > 0.001) {
      var t = this.game.time * 47;
      sx = Math.sin(t * 1.7) * shake * 0.15;
      sy = Math.cos(t * 2.1) * shake * 0.12;
      sz = Math.sin(t * 1.3) * shake * 0.1;
    }
    var speedShake = 0;
    var p = this.game.player;
    if (p && p.currentVehicle) speedShake = U.clamp(Math.abs(p.currentVehicle.speed) / p.currentVehicle.spec.maxSpeed, 0, 1) * 0.035;
    this.camera.position.set(this.smoothPos.x + sx, this.smoothPos.y + sy + Math.sin(this.game.time * 23) * speedShake, this.smoothPos.z + sz);
    var lx = this.smoothLook.x, ly = this.smoothLook.y, lz = this.smoothLook.z;
    this.camera.lookAt(lx, ly, lz);
    this.camera.fov = U.damp(this.camera.fov, targetFov, 5, dt);
    this.camera.updateProjectionMatrix();
  };

  CameraRig.prototype.setShot = function (pos, look) {
    this.shotPos = new THREE.Vector3(pos[0], pos[1], pos[2]);
    this.shotLook = new THREE.Vector3(look[0], look[1], look[2]);
    this.smoothPos.copy(this.shotPos);
    this.smoothLook.copy(this.shotLook);
    this.initialised = true;
    this.applyShot();
  };

  CameraRig.prototype.applyShot = function () {
    if (!this.shotPos) return;
    this.camera.position.copy(this.shotPos);
    this.camera.lookAt(this.shotLook.x, this.shotLook.y, this.shotLook.z);
    this.camera.updateMatrixWorld();
  };

  CameraRig.prototype.clearShot = function () {
    this.shotPos = null;
    this.shotLook = null;
    this.initialised = false;
  };

  CameraRig.prototype.setFov = function (fov) {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  };

  CameraRig.prototype.shakeCamera = function (amount) {
    this.shake = Math.max(this.shake, amount);
  };

  CH.CameraRig = CameraRig;
}());

// Recording check: camera module reviewed for the live capture.
