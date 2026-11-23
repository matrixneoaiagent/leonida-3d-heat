/* COBALT HEAT — weapons and combat.
   Player firearms, melee, hitscan, enemies with line of sight, health bars and return fire. */
(function () {
  'use strict';

  var CH = window.CH = window.CH || {};
  var U = CH.Util;
  var C = CH.CONFIG;

  function Combat(game) {
    this.game = game;
    this.enemies = [];
    this.aimHeld = false;
    this.isFiring = false;
    this.screenShake = 0;
    this.crimeCooldown = 0;
    this.stats = { shots: 0, hits: 0, kills: 0 };
    this.lastKill = null;
    this.nextFire = 0;
    this.raySteps = 90;
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
  }

  Combat.prototype.update = function (dt) {
    var input = this.game.input;
    var player = this.game.player;
    this.aimHeld = input.rightDown;
    this.crimeCooldown = Math.max(0, this.crimeCooldown - dt);
    this.screenShake = Math.max(0, this.screenShake - dt * 1.7);
    this.isFiring = false;
    if (!player || player.dead) {
      this.updateEnemies(dt);
      return;
    }

    if (player.reloadTimer > 0) {
      this.updateEnemies(dt);
      return;
    }

    if (!player.inVehicle && input.wasPressed('KeyR')) player.reload();
    if (input.wasPressed('Digit1')) player.switchWeapon('fists');
    if (input.wasPressed('Digit2')) player.switchWeapon('pistol');
    if (input.wasPressed('Digit3')) player.switchWeapon('smg');
    if (input.wasPressed('Digit4')) player.switchWeapon('shotgun');

    var spec = C.WEAPONS[player.weapon];
    if (input.leftDown && player.fireCooldown <= 0 && !this.game.statePaused) {
      if (player.inVehicle) {
        if (spec.kind !== 'melee') this.fireFromVehicle();
      } else {
        this.fire();
      }
    }
    this.updateEnemies(dt);
    if (player.weapon !== 'fists') {
      var w = player.weapons[player.weapon];
      if (w.mag <= 0 && w.reserve > 0 && player.reloadTimer <= 0) player.reload();
    }
  };

  Combat.prototype.fire = function () {
    var player = this.game.player;
    var spec = C.WEAPONS[player.weapon];
    var weapon = player.weapons[player.weapon];
    if (!spec || !weapon) return;
    if (spec.kind === 'melee') {
      this.melee();
      player.fireCooldown = 1 / spec.rate;
      player.fireCooldown = 1 / spec.rate;
      return;
    }
    if (weapon.mag <= 0) {
      if (weapon.reserve > 0) player.reload();
      else this.game.hud.toast('OUT OF AMMO', 'Find a supply crate or a police cruiser.');
      player.fireCooldown = 0.25;
      return;
    }
    weapon.mag--;
    player.fireCooldown = 1 / spec.rate;
    this.isFiring = true;
    this.stats.shots++;
    var origin = player.getMuzzle();
    var dir = player.getAimDirection();
    this.shootRay(origin, dir, spec, 'player');
    this.game.effects.muzzle(origin.x, origin.y, origin.z, dir, spec.kind === 'shotgun' ? 1.4 : 1);
    this.game.audio.shot(spec.kind);
    player.fireCooldown = 1 / spec.rate;
    this.screenShake = Math.max(this.screenShake, spec.shake * 0.55);
    this.game.cameraRig.pitch = U.clamp(this.game.cameraRig.pitch + spec.recoil * 0.24, -0.68, 0.55);
    this.game.hud.crosshairPulse();
    this.game.hud.setAmmo();
    if (this.crimeCooldown <= 0) {
      this.crimeCooldown = 3.5;
      this.game.police.onGunshot(player.pos.x, player.pos.z);
    }
    this.game.traffic.panic(player.pos.x, player.pos.z, 34, true);
  };

  Combat.prototype.fireFromVehicle = function () {
    var player = this.game.player;
    var car = player.currentVehicle;
    var spec = C.WEAPONS[player.weapon];
    var weapon = player.weapons[player.weapon];
    if (!car || wEmpty(weapon)) { player.reload(); return; }
    weapon.mag--;
    player.fireCooldown = 1 / spec.rate;
    this.isFiring = true;
    this.stats.shots++;
    var rig = this.game.cameraRig;
    var dir = new THREE.Vector3(Math.sin(rig.yaw) * Math.cos(rig.pitch), Math.sin(rig.pitch), Math.cos(rig.yaw) * Math.cos(rig.pitch)).normalize();
    var origin = new THREE.Vector3(car.pos.x + Math.cos(car.heading) * 0.8, 1.15, car.pos.z - Math.sin(car.heading) * 0.8);
    this.shootRay(origin, dir, spec, 'player');
    this.game.effects.muzzle(origin.x, origin.y, origin.z, dir, 1);
    this.game.audio.shot(spec.kind);
    this.screenShake = Math.max(this.screenShake, 0.18);
    this.game.hud.setAmmo();
    if (this.crimeCooldown <= 0) {
      this.crimeCooldown = 4;
      this.game.police.onGunshot(player.pos.x, player.pos.z);
    }
  };

  function wEmpty(w) { return !w || w.mag <= 0; }

  Combat.prototype.melee = function () {
    var player = this.game.player;
    var origin = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
    var dir = player.getAimDirection();
    var best = null, bd = 2.7;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.alive) continue;
      var d = U.dist(origin.x, origin.z, e.pos.x, e.pos.z);
      var facing = (e.pos.x - origin.x) * dir.x + (e.pos.z - origin.z) * dir.z;
      if (d < bd && facing > -0.2) { bd = d; best = e; }
    }
    this.game.audio.noise(0.07, 0.08, 900);
    this.game.effects.muzzle(origin.x + dir.x * 1.3, 1.4, origin.z + dir.z * 1.3, dir, 0.25);
    this.screenShake = Math.max(this.screenShake, 0.12);
    if (best) {
      this.damageEnemy(best, 28, 'fists');
      this.game.effects.blood(best.pos.x, 1.2, best.pos.z);
      this.game.hud.hitMarker();
    } else {
      var ped = this.game.traffic.nearestPed(player.pos.x, player.pos.z, 2.5);
      if (ped) {
        this.game.traffic.panic(player.pos.x, player.pos.z, 28, true);
        this.game.police.addWanted(1, 'ASSAULT');
      }
    }
  };

  Combat.prototype.shootRay = function (origin, dir, spec, shooter) {
    var self = this;
    var pellets = spec.pellets || 1;
    var anyHit = false;
    for (var p = 0; p < pellets; p++) {
      var spread = spec.spread || 0;
      var d = dir.clone();
      if (spread > 0) {
        d.x += (Math.random() - 0.5) * spread;
        d.y += (Math.random() - 0.5) * spread * 0.7;
        d.z += (Math.random() - 0.5) * spread;
        d.normalize();
      }
      var hit = this.traceRay(origin, d, spec.range);
      var end = hit ? hit.point : origin.clone().addScaledVector(d, spec.range);
      this.game.effects.tracer(origin, end, spec.color);
      if (hit) {
        anyHit = true;
        if (hit.type === 'enemy') {
          var damage = spec.damage;
          var distFade = 1 - U.clamp(hit.t / (spec.range * 1.4), 0, 0.45);
          this.damageEnemy(hit.obj, damage * distFade, spec.id);
          this.game.effects.blood(hit.point.x, hit.point.y, hit.point.z);
          this.game.hud.hitMarker();
        } else if (hit.type === 'ped') {
          this.game.traffic.panic(hit.point.x, hit.point.z, 30, true);
          this.game.effects.blood(hit.point.x, hit.point.y, hit.point.z);
          this.game.police.addWanted(1, 'ASSAULT WITH A DEADLY WEAPON');
        } else if (hit.type === 'vehicle') {
          hit.obj.damageBy(spec.damage * 0.55);
          this.game.effects.impact(hit.point.x, hit.point.y, hit.point.z);
          this.game.audio.impact(true);
          if (hit.obj.traffic) hit.obj.traffic.panic = 4;
          if (hit.obj.isPolice) this.game.police.addWanted(1, 'ATTACKING AN OFFICER');
        } else {
          this.game.effects.impact(hit.point.x, hit.point.y, hit.point.z);
        }
      }
      if (anyHit) this.stats.hits++;
    }
    this.game.traffic.panic(origin.x, origin.z, 45, true);
  };

  Combat.prototype.traceRay = function (origin, dir, maxDist) {
    var best = null;
    var i;
    for (i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.alive) continue;
      var h = this.raySphere(origin, dir, new THREE.Vector3(e.pos.x, e.pos.y + 1.15, e.pos.z), e.boss ? 0.65 : 0.52);
      if (h != null && h < maxDist && (!best || h < best.t)) best = { t: h, type: 'enemy', obj: e };
    }
    for (i = 0; i < this.game.traffic.peds.length; i++) {
      var ped = this.game.traffic.peds[i];
      if (!ped.active || ped.char.mode === 'dead') continue;
      var pp = ped.char.root.position;
      var ph = this.raySphere(origin, dir, new THREE.Vector3(pp.x, pp.y + 1.15, pp.z), 0.48);
      if (ph != null && ph < maxDist && (!best || ph < best.t)) best = { t: ph, type: 'ped', obj: ped };
    }
    for (i = 0; i < this.game.vehicles.length; i++) {
      var v = this.game.vehicles[i];
      if (!v.mesh.visible || v === this.game.player.currentVehicle) continue;
      var center = new THREE.Vector3(v.pos.x, 0.9, v.pos.z);
      var vh = this.raySphere(origin, dir, center, Math.max(v.spec.length * 0.38, 1.1));
      if (vh != null && vh < maxDist && (!best || vh < best.t)) best = { t: vh, type: 'vehicle', obj: v };
    }
    var worldT = this.worldRay(origin, dir, maxDist);
    if (worldT != null && (!best || worldT < best.t)) best = { t: worldT, type: 'world', obj: null };
    if (best) best.point = origin.clone().addScaledVector(dir, best.t);
    return best;
  };

  Combat.prototype.raySphere = function (origin, dir, center, radius) {
    var ox = origin.x - center.x, oy = origin.y - center.y, oz = origin.z - center.z;
    var b = ox * dir.x + oy * dir.y + oz * dir.z;
    var c = ox * ox + oy * oy + oz * oz - radius * radius;
    var h = b * b - c;
    if (h < 0) return null;
    var t = -b - Math.sqrt(h);
    if (t < 0) t = -b + Math.sqrt(h);
    return t >= 0 ? t : null;
  };

  Combat.prototype.worldRay = function (origin, dir, maxDist) {
    var step = 0.55;
    var world = this.game.world;
    var x, y, z;
    for (var t = 0.2; t < maxDist; t += step) {
      x = origin.x + dir.x * t;
      y = origin.y + dir.y * t;
      z = origin.z + dir.z * t;
      if (y < 0.03) return t;
      for (var i = 0; i < world.colliders.length; i++) {
        var b = world.colliders[i];
        if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && y < b.height + (b.minY || 0)) return t;
      }
    }
    return null;
  };

  Combat.prototype.spawnEnemy = function (opts) {
    opts = opts || {};
    var kind = opts.kind || (opts.boss ? 'boss' : 'guard');
    var ch = new CH.Character({
      game: this.game, kind: kind, seed: opts.seed || ('enemy-' + this.enemies.length),
      x: opts.x, z: opts.z, yaw: opts.yaw || 0, y: this.game.world.groundHeight(opts.x, opts.z)
    });
    ch.gun.visible = true;
    this.game.scene.add(ch.root);
    var enemy = {
      id: 'enemy-' + this.enemies.length,
      char: ch, pos: new THREE.Vector3(opts.x, this.game.world.groundHeight(opts.x, opts.z), opts.z),
      yaw: opts.yaw || 0, health: opts.health || 60, maxHealth: opts.health || 60,
      weapon: opts.weapon || 'pistol', boss: !!opts.boss, faction: opts.faction || 'guard',
      alive: true, hostile: opts.hostile !== false, fireTimer: 1 + Math.random() * 1.8,
      moveTimer: 0, targetX: opts.x, targetZ: opts.z, name: opts.name || (opts.boss ? 'ENFORCER' : 'CORMORANT CREW'),
      role: opts.role || 'enemy', accuracy: opts.accuracy || 0.52, strafe: Math.random() < 0.5 ? 1 : -1,
      officer: !!opts.officer, bar: null
    };
    enemy.bar = this.makeHealthBar(enemy);
    ch.root.position.copy(enemy.pos);
    this.enemies.push(enemy);
    return enemy;
  };

  Combat.prototype.makeHealthBar = function (enemy) {
    var canvas = U.makeCanvas(384, 64);
    var texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    var mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    var sprite = new THREE.Sprite(mat);
    sprite.scale.set(enemy.boss ? 3.4 : 2.7, enemy.boss ? 0.55 : 0.42, 1);
    sprite.renderOrder = 30;
    sprite.visible = !!(enemy.boss || enemy.faction === 'guard');
    this.game.scene.add(sprite);
    enemy.barCanvas = canvas;
    enemy.barTexture = texture;
    enemy.barSprite = sprite;
    this.drawHealthBar(enemy);
    return sprite;
  };

  Combat.prototype.drawHealthBar = function (enemy) {
    var c = enemy.barCanvas;
    if (!c) return;
    var x = c.getContext('2d');
    x.clearRect(0, 0, 384, 64);
    x.fillStyle = 'rgba(7,22,26,0.82)'; x.fillRect(4, 4, 376, 56);
    x.fillStyle = enemy.boss ? '#ff7a5c' : '#ffcf68';
    x.fillRect(8, 38, 368, 16);
    x.fillStyle = '#ff5e4d';
    x.fillRect(8, 38, 368 * U.clamp(enemy.health / enemy.maxHealth, 0, 1), 16);
    x.fillStyle = 'rgba(255,255,255,0.32)';
    x.fillRect(8, 38, 368 * U.clamp(enemy.health / enemy.maxHealth, 0, 1), 5);
    x.fillStyle = '#f7ead1'; x.textAlign = 'left'; x.textBaseline = 'middle';
    x.font = '700 19px "Arial Narrow", sans-serif';
    x.fillText(enemy.name, 10, 22);
    x.textAlign = 'right'; x.fillStyle = '#c3d1c9'; x.font = '600 13px "Arial Narrow", sans-serif';
    x.fillText(enemy.boss ? 'BOSS' : enemy.faction.toUpperCase(), 374, 22);
    enemy.barTexture.needsUpdate = true;
  };

  Combat.prototype.updateEnemies = function (dt) {
    var player = this.game.player;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.alive) {
        if (e.barSprite) e.barSprite.visible = false;
        e.char.update(dt, 0, false);
        continue;
      }
      var dx = player.pos.x - e.pos.x;
      var dz = player.pos.z - e.pos.z;
      var d = Math.hypot(dx, dz);
      var canSee = d < 55 && this.hasLineOfSight(e.pos.x, e.pos.z, player.pos.x, player.pos.z);
      var moving = 0;
      if (e.hostile && !player.dead) {
        e.char.root.rotation.y = Math.atan2(dx, dz);
        if (d > 12) {
          var mx = dx / (d || 1) * 2.0 * dt;
          var mz = dz / (d || 1) * 2.0 * dt;
          var nx = e.pos.x + mx, nz = e.pos.z + mz;
          if (!this.game.traffic.hitsWorld(nx, nz)) { e.pos.x = nx; e.pos.z = nz; moving = 2; }
        } else if (d < 4.5) {
          e.pos.x -= dx / (d || 1) * 0.8 * dt;
          e.pos.z -= dz / (d || 1) * 0.8 * dt;
          moving = 0.8;
        }
        e.pos.y = this.game.world.groundHeight(e.pos.x, e.pos.z);
        this.game.world.resolveCircle(e.pos, 0.42);
        e.char.root.position.copy(e.pos);
        e.fireTimer -= dt;
        if (canSee && e.fireTimer <= 0) {
          e.fireTimer = e.weapon === 'smg' ? 0.42 + Math.random() * 0.5 : 1.15 + Math.random() * 1.2;
          this.enemyFire(e, player, d);
        }
        moving = moving || 0;
      }
      e.char.update(dt, moving, canSee && e.fireTimer < 0.7);
      if (e.barSprite) {
        e.barSprite.position.set(e.pos.x, e.pos.y + (e.boss ? 2.55 : 2.35), e.pos.z);
        var show = !e.boss && (e.faction === 'guard' || e.officer);
        e.barSprite.visible = show && (e.health < e.maxHealth || d < 24);
        e.barSprite.material.opacity = U.clamp(1.25 - d / 45, 0.2, 1);
      }
    }
  };

  Combat.prototype.enemyFire = function (e, player, dist) {
    var origin = new THREE.Vector3(e.pos.x, e.pos.y + 1.35, e.pos.z);
    var target = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
    var accuracy = e.accuracy * U.clamp(1.35 - dist / 70, 0.32, 1);
    var hit = Math.random() < accuracy;
    var dir = target.clone().sub(origin).normalize();
    if (!hit) {
      dir.x += (Math.random() - 0.5) * 0.11;
      dir.y += (Math.random() - 0.5) * 0.07;
      dir.z += (Math.random() - 0.5) * 0.11;
      dir.normalize();
    }
    this.game.effects.muzzle(origin.x + dir.x * 0.7, origin.y, origin.z + dir.z * 0.7, dir, 0.7);
    this.game.effects.tracer(origin, origin.clone().addScaledVector(dir, 40), '#ffb563');
    this.game.audio.shot(e.weapon === 'smg' ? 'smg' : 'pistol');
    if (hit) {
      var dmg = e.weapon === 'smg' ? 6.5 : 9 + Math.random() * 3;
      player.takeDamage(dmg, e.pos.x, e.pos.z);
      this.game.effects.blood(player.pos.x, player.pos.y + 1.25, player.pos.z);
    } else {
      this.game.effects.impact(player.pos.x + dir.x * 2, 1.3, player.pos.z + dir.z * 2);
    }
  };

  Combat.prototype.hasLineOfSight = function (ax, az, bx, bz) {
    var dist = Math.hypot(bx - ax, bz - az);
    var steps = Math.ceil(dist / 1.4);
    var cols = this.game.world.colliders;
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      var x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (var j = 0; j < cols.length; j++) {
        var b = cols[j];
        if (b.height > 1.2 && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return false;
      }
    }
    return true;
  };

  Combat.prototype.damageEnemy = function (enemy, amount, source) {
    if (!enemy.alive) return;
    enemy.health -= amount;
    this.drawHealthBar(enemy);
    if (enemy.barSprite) enemy.barSprite.visible = true;
    if (enemy.officer && this.game.police) this.game.police.addWanted(1, 'ATTACKING AN OFFICER');
    if (enemy.health <= 0) {
      enemy.alive = false;
      enemy.char.die();
      this.stats.kills++;
      this.lastKill = enemy;
      if (enemy.barSprite) enemy.barSprite.visible = false;
      if (enemy.officer && this.game.police) this.game.police.officerDown(enemy);
      if (this.game.missions) this.game.missions.onEnemyKilled(enemy);
      this.game.hud.killFeed(enemy.name, source);
      this.game.effects.blood(enemy.pos.x, 1.2, enemy.pos.z);
      if (enemy.boss) {
        this.game.police.addWanted(1, 'MAJOR INCIDENT');
        this.game.hud.toast('TARGET DOWN', enemy.name + ' is out of the picture.');
      }
      if (!enemy.officer && Math.random() < 0.65) {
        enemy.char.root.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffcf68 })));
        enemy.char.root.children[enemy.char.root.children.length - 1].position.set(0, 0.2, 0);
      }
    }
  };

  Combat.prototype.clearEnemies = function () {
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e.char && e.char.root.parent) this.game.scene.remove(e.char.root);
      if (e.barSprite && e.barSprite.parent) this.game.scene.remove(e.barSprite);
    }
    this.enemies.length = 0;
    this.stats.kills = 0;
  };

  Combat.prototype.aliveEnemies = function () {
    var out = [];
    for (var i = 0; i < this.enemies.length; i++) if (this.enemies[i].alive) out.push(this.enemies[i]);
    return out;
  };

  Combat.prototype.enemyCount = function () {
    var n = 0;
    for (var i = 0; i < this.enemies.length; i++) if (this.enemies[i].alive) n++;
    return n;
  };

  CH.Combat = Combat;
}());
