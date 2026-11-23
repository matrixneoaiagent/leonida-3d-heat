/* COBALT HEAT — character models.
   One articulated, low-poly person used by the player, pedestrians, police and enemies. */
(function () {
  'use strict';

  var CH = window.CH = window.CH || {};
  var U = CH.Util;

  var SKIN = ['#8d5a3b', '#b97b52', '#d9a173', '#e7bd94', '#6f4531', '#c58b62'];
  var SHIRTS = ['#e4d5b6', '#3f8b86', '#d15f4e', '#e3b64f', '#53708e', '#d7a58c', '#4e6a48', '#ebdfc9'];
  var PANTS = ['#364b54', '#d3c3a4', '#61715d', '#2e424c', '#a86c53', '#44484f', '#c7b18b'];
  var SHOES = ['#222a2c', '#ece2cd', '#5d3e30', '#315c62'];
  var HAIR = ['#2c241f', '#5b3c27', '#171a1a', '#8b643e', '#d1b17a', '#3c2d25'];

  function makeMesh(geo, color, x, y, z, mat) {
    var m = new THREE.Mesh(geo, mat || new THREE.MeshLambertMaterial({ color: color }));
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function Character(opts) {
    opts = opts || {};
    this.kind = opts.kind || 'ped';
    this.game = opts.game || null;
    this.seed = opts.seed || 'ped';
    var rng = U.mulberry32(U.hashString(this.seed));
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.time = rng() * 10;
    this.phase = rng() * Math.PI * 2;
    this.mode = 'idle';
    this.alive = true;

    var skin = opts.skin || U.pick(rng, SKIN);
    var shirt = opts.shirt || U.pick(rng, SHIRTS);
    var pants = opts.pants || U.pick(rng, PANTS);
    var shoes = opts.shoes || U.pick(rng, SHOES);
    var hair = opts.hair || U.pick(rng, HAIR);
    this.skin = skin;

    if (this.kind === 'player') {
      skin = '#9c6a48'; shirt = '#e35f50'; pants = '#e9ddc3'; shoes = '#243639'; hair = '#1d1a17';
    }
    if (this.kind === 'cop') {
      shirt = '#273f56'; pants = '#1e3247'; shoes = '#171c1e'; hair = '#2e2925';
    }
    if (this.kind === 'guard') {
      shirt = '#2d3434'; pants = '#262d2c'; shoes = '#161717'; hair = '#1d1b18';
    }
    if (this.kind === 'boss') {
      shirt = '#b7a7e0'; pants = '#34313e'; shoes = '#1b1b22'; hair = '#d7d3c8'; skin = '#c58b62';
    }
    if (this.kind === 'beach') {
      shirt = '#f3e0b4'; pants = '#e6a78f';
    }
    if (this.kind === 'worker') {
      shirt = '#e4b54c'; pants = '#596f72'; shoes = '#3d342b';
    }

    this.materials = {
      skin: new THREE.MeshLambertMaterial({ color: skin }),
      shirt: new THREE.MeshLambertMaterial({ color: shirt }),
      pants: new THREE.MeshLambertMaterial({ color: pants }),
      shoe: new THREE.MeshLambertMaterial({ color: shoes }),
      hair: new THREE.MeshLambertMaterial({ color: hair }),
      dark: new THREE.MeshLambertMaterial({ color: 0x172225 }),
      gold: new THREE.MeshLambertMaterial({ color: 0xffcc66 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x2b3133, metalness: 0.7, roughness: 0.28 })
    };

    /* legs are pivoted at the hips so the walk cycle can swing them. */
    this.legL = new THREE.Group(); this.legL.position.set(-0.17, 0.96, 0);
    this.legR = new THREE.Group(); this.legR.position.set(0.17, 0.96, 0);
    var legGeo = new THREE.BoxGeometry(0.23, 0.84, 0.25);
    var pantL = makeMesh(legGeo, 0, 0, -0.42, 0, this.materials.pants);
    var pantR = makeMesh(legGeo.clone(), 0, 0, -0.42, 0, this.materials.pants);
    this.legL.add(pantL); this.legR.add(pantR);
    var shoeGeo = new THREE.BoxGeometry(0.26, 0.18, 0.4);
    var shoeL = makeMesh(shoeGeo, 0, 0, -0.86, 0.07, this.materials.shoe);
    var shoeR = makeMesh(shoeGeo.clone(), 0, 0, -0.86, 0.07, this.materials.shoe);
    this.legL.add(shoeL); this.legR.add(shoeR);
    this.body.add(this.legL); this.body.add(this.legR);

    var hips = makeMesh(new THREE.BoxGeometry(0.5, 0.24, 0.31), 0, 0, 1.03, 0, this.materials.pants);
    this.body.add(hips);
    var torso = makeMesh(new THREE.BoxGeometry(0.57, 0.6, 0.32), 0, 0, 1.38, 0, this.materials.shirt);
    this.body.add(torso);
    var chest = makeMesh(new THREE.BoxGeometry(0.5, 0.25, 0.34), 0, 0, 1.55, 0.01, this.materials.shirt);
    this.body.add(chest);

    if (this.kind === 'player') {
      var jacket = makeMesh(new THREE.BoxGeometry(0.64, 0.34, 0.36), 0, 0, 1.55, 0, this.materials.shirt);
      this.body.add(jacket);
      var tee = makeMesh(new THREE.BoxGeometry(0.28, 0.45, 0.34), 0, 0, 1.36, 0.012, new THREE.MeshLambertMaterial({ color: 0xf7ead2 }));
      this.body.add(tee);
      var chain = makeMesh(new THREE.BoxGeometry(0.2, 0.035, 0.02), 0, 0, 1.58, 0.19, this.materials.gold);
      this.body.add(chain);
    }
    if (this.kind === 'cop') {
      var vest = makeMesh(new THREE.BoxGeometry(0.6, 0.45, 0.35), 0, 0, 1.39, 0.01, new THREE.MeshLambertMaterial({ color: 0x1b2d3c }));
      this.body.add(vest);
      var badge = makeMesh(new THREE.BoxGeometry(0.1, 0.12, 0.02), 0, -0.16, 1.56, 0.19, this.materials.gold);
      this.body.add(badge);
      var cap = makeMesh(new THREE.BoxGeometry(0.4, 0.16, 0.34), 0, 0, 1.94, 0, new THREE.MeshLambertMaterial({ color: 0x25394b }));
      this.body.add(cap);
      var brim = makeMesh(new THREE.BoxGeometry(0.32, 0.04, 0.16), 0, 0, 1.89, 0.17, new THREE.MeshLambertMaterial({ color: 0x152636 }));
      this.body.add(brim);
    }
    if (this.kind === 'guard') {
      var vest2 = makeMesh(new THREE.BoxGeometry(0.61, 0.43, 0.35), 0, 0, 1.4, 0.01, new THREE.MeshLambertMaterial({ color: 0x3c4743 }));
      this.body.add(vest2);
    }

    var neck = makeMesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 6), 0, 0, 1.69, 0, this.materials.skin);
    this.body.add(neck);
    this.head = makeMesh(new THREE.SphereGeometry(0.17, 10, 8), 0, 0, 1.82, 0, this.materials.skin);
    this.head.scale.set(0.93, 1.06, 0.95);
    this.body.add(this.head);
    var hairCap = makeMesh(new THREE.SphereGeometry(0.176, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.56), 0, 0, 1.85, -0.01, this.materials.hair);
    hairCap.scale.set(1.0, 0.9, 1.0);
    this.body.add(hairCap);
    if (this.kind === 'player') {
      var shades = makeMesh(new THREE.BoxGeometry(0.24, 0.055, 0.035), 0, 0, 1.85, 0.156, this.materials.dark);
      this.body.add(shades);
    }
    if (this.kind === 'boss') {
      var suit = makeMesh(new THREE.BoxGeometry(0.64, 0.36, 0.38), 0, 0, 1.43, 0, new THREE.MeshLambertMaterial({ color: 0x2c2a35 }));
      this.body.add(suit);
    }

    this.armL = new THREE.Group(); this.armL.position.set(-0.37, 1.52, 0);
    this.armR = new THREE.Group(); this.armR.position.set(0.37, 1.52, 0);
    var armGeo = new THREE.BoxGeometry(0.16, 0.64, 0.19);
    var armLm = makeMesh(armGeo, 0, 0, -0.3, 0, this.materials.shirt);
    var armRm = makeMesh(armGeo.clone(), 0, 0, -0.3, 0, this.materials.shirt);
    this.armL.add(armLm); this.armR.add(armRm);
    var handL = makeMesh(new THREE.SphereGeometry(0.075, 7, 5), 0, 0, -0.65, 0, this.materials.skin);
    var handR = makeMesh(new THREE.SphereGeometry(0.075, 7, 5), 0, 0, -0.65, 0, this.materials.skin);
    this.armL.add(handL); this.armR.add(handR);
    this.body.add(this.armL); this.body.add(this.armR);

    /* small sidearm in the right hand */
    this.gun = new THREE.Group();
    var gunBody = makeMesh(new THREE.BoxGeometry(0.08, 0.16, 0.3), 0, 0, 0, 0, this.materials.metal);
    var grip = makeMesh(new THREE.BoxGeometry(0.075, 0.2, 0.1), 0, -0.12, 0.03, 0, new THREE.MeshLambertMaterial({ color: 0x1c2526 }));
    this.gun.add(gunBody); this.gun.add(grip);
    this.gun.position.set(0, -0.69, 0.1);
    this.gun.visible = false;
    this.armR.add(this.gun);

    if (this.kind === 'ped' || this.kind === 'beach') {
      if (rng() < 0.4) {
        var bag = makeMesh(new THREE.BoxGeometry(0.33, 0.34, 0.16), 0, 0, 1.22, -0.24, new THREE.MeshLambertMaterial({ color: U.pick(rng, ['#d5b477', '#8b4c42', '#425c58', '#e8dcc2']) }));
        this.body.add(bag);
      }
      if (rng() < 0.35) {
        var hat = makeMesh(new THREE.CylinderGeometry(0.34, 0.36, 0.045, 10), 0, 0, 1.99, 0, new THREE.MeshLambertMaterial({ color: U.pick(rng, ['#e9d9b8', '#d4644f', '#385b5d']) }));
        this.body.add(hat);
      }
    }

    this.root.position.set(opts.x || 0, opts.y || 0, opts.z || 0);
    this.root.rotation.y = opts.yaw || 0;
    this.root.scale.setScalar(opts.scale || 1);
    this.shadow = true;
    this.walkTime = 0;
  }

  Character.prototype.setMode = function (mode) {
    this.mode = mode;
  };

  Character.prototype.setVisible = function (v) {
    this.root.visible = v;
  };

  Character.prototype.setPosition = function (x, y, z) {
    this.root.position.set(x, y, z);
  };

  Character.prototype.update = function (dt, moveSpeed, aiming) {
    this.time += dt;
    var walking = moveSpeed > 0.12 && this.mode !== 'dead';
    var rate = U.clamp(moveSpeed / 4.6, 0, 2.2);
    if (walking) this.walkTime += dt * (4.2 + rate * 4.2);
    var swing = walking ? Math.sin(this.walkTime) * (0.42 + rate * 0.34) : Math.sin(this.time * 1.7) * 0.025;
    var bob = walking ? Math.abs(Math.sin(this.walkTime * 2)) * 0.035 * rate : Math.sin(this.time * 1.8) * 0.008;

    if (aiming) {
      this.armR.rotation.x = U.damp(this.armR.rotation.x, -1.47, 14, dt);
      this.armR.rotation.z = U.damp(this.armR.rotation.z, -0.06, 12, dt);
      this.armL.rotation.x = U.damp(this.armL.rotation.x, -1.26, 12, dt);
      this.armL.rotation.z = U.damp(this.armL.rotation.z, 0.26, 12, dt);
      this.legL.rotation.x = U.damp(this.legL.rotation.x, 0.04, 10, dt);
      this.legR.rotation.x = U.damp(this.legR.rotation.x, -0.08, 10, dt);
      this.body.position.y = 0;
      this.gun.visible = true;
    } else {
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.86;
      this.armR.rotation.x = swing * 0.86;
      this.armL.rotation.z = 0.03;
      this.armR.rotation.z = -0.03;
      this.body.position.y = bob;
      this.gun.visible = this.kind === 'guard' || this.kind === 'boss' || this.kind === 'cop';
    }
    if (this.mode === 'dead') {
      this.root.rotation.z = U.damp(this.root.rotation.z, Math.PI / 2, 6, dt);
      this.body.position.y = 0.1;
    }
    if (this.head) this.head.rotation.y = Math.sin(this.time * 0.8 + this.phase) * (walking ? 0.03 : 0.12);
  };

  Character.prototype.face = function (heading) {
    this.root.rotation.y = heading;
  };

  Character.prototype.die = function () {
    this.mode = 'dead';
    this.alive = false;
    this.gun.visible = false;
  };

  Character.prototype.setVisible = function (v) {
    this.root.visible = v;
  };

  CH.Character = Character;
}());
