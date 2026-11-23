/* COBALT HEAT — vehicles.
   Low-poly car construction, movement state and visual animation. */
(function () {
  'use strict';

  var CH = window.CH = window.CH || {};
  var U = CH.Util;
  var C = CH.CONFIG;

  function box(w, h, d, color, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: color }));
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function makeCabin(width, length, y0, y1, frontInset, backInset, glassColor) {
    var hw = width / 2;
    var topW = hw * 0.82;
    var zf = length / 2 - frontInset, zb = -length / 2 + backInset;
    var ztf = zf - length * 0.10, ztb = zb + length * 0.14;
    var v = [
      [-hw, y0, zb], [hw, y0, zb], [hw, y0, zf], [-hw, y0, zf],
      [-topW, y1, ztb], [topW, y1, ztb], [topW, y1, ztf], [-topW, y1, ztf]
    ];
    var idx = [
      0, 2, 3, 0, 1, 2,
      4, 7, 6, 4, 6, 5,
      0, 3, 7, 0, 7, 4,
      1, 5, 6, 1, 6, 2,
      3, 2, 6, 3, 6, 7,
      0, 4, 5, 0, 5, 1
    ];
    var pos = [];
    for (var i = 0; i < idx.length; i++) {
      var p = v[idx[i]];
      pos.push(p[0], p[1], p[2]);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    var m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: glassColor || 0x173a42, side: THREE.DoubleSide }));
    m.castShadow = true;
    return m;
  }

  function makeWheel(radius, width) {
    var group = new THREE.Group();
    var tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 12), new THREE.MeshLambertMaterial({ color: 0x151717 }));
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    group.add(tire);
    var rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, width + 0.025, 10), new THREE.MeshStandardMaterial({ color: 0xb9b9ae, metalness: 0.6, roughness: 0.3 }));
    rim.rotation.z = Math.PI / 2;
    group.add(rim);
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, width + 0.04, 8), new THREE.MeshBasicMaterial({ color: 0x77786f }));
    cap.rotation.z = Math.PI / 2;
    group.add(cap);
    return group;
  }

  function plateTexture(text) {
    return U.signTexture([text], { width: 256, height: 96, bg: '#f3e3bd', color: '#23434a', size: 44, borderColor: '#566b64' });
  }

  function decalTexture(text, sub) {
    var c = U.makeCanvas(512, 192), x = c.getContext('2d');
    x.clearRect(0, 0, 512, 192);
    x.fillStyle = '#e9e2cf'; x.fillRect(0, 0, 512, 192);
    x.fillStyle = '#1d3d52'; x.fillRect(0, 0, 512, 26); x.fillRect(0, 166, 512, 26);
    x.strokeStyle = '#1d3d52'; x.lineWidth = 5; x.strokeRect(8, 8, 496, 176);
    x.fillStyle = '#1d3d52'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '900 74px "Arial Narrow", Impact, sans-serif';
    x.fillText(text, 256, 86);
    x.font = '700 28px "Arial Narrow", sans-serif';
    x.fillStyle = '#a2493e';
    x.fillText(sub || 'MARISOL P.D.', 256, 136);
    return U.textureFromCanvas(c, 1, 1);
  }

  function buildCarMesh(type, color, accent) {
    var spec = C.VEHICLES[type] || C.VEHICLES.paloma;
    var g = new THREE.Group();
    var len = spec.length, wid = spec.width;
    var wheels = [];
    var bodyColor = color || U.pick(Math.random, spec.colors || [spec.color || '#a67c52']);
    var accentColor = accent || spec.accent || '#f0e4ce';
    var bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    var accentMat = new THREE.MeshLambertMaterial({ color: accentColor });
    var darkMat = new THREE.MeshLambertMaterial({ color: 0x202729 });
    var glassColor = spec.police ? 0x102b3a : 0x163d44;
    var glassMat = new THREE.MeshLambertMaterial({ color: glassColor, side: THREE.DoubleSide });

    function add(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; }

    if (type === 'gull') {
      var deck = add(box(0.68, 0.14, 1.65, bodyColor, 0, 0.62, 0));
      deck.castShadow = true;
      var shield = add(box(0.68, 0.82, 0.12, glassColor, 0, 1.02, 0.62));
      shield.rotation.x = -0.16;
      add(box(0.5, 0.2, 0.7, darkMat.color.getHex(), 0, 0.48, -0.05));
      var wheelF = makeWheel(0.27, 0.14); wheelF.position.set(0, 0.28, 0.78); g.add(wheelF); wheels.push(wheelF);
      var wheelB = makeWheel(0.27, 0.14); wheelB.position.set(0, 0.28, -0.78); g.add(wheelB); wheels.push(wheelB);
      add(box(0.36, 0.12, 0.28, '#ffe6a2', 0, 0.8, 0.85));
      add(box(0.22, 0.5, 0.22, accentColor, 0, 1.05, -0.66));
    } else if (type === 'marea') {
      add(box(wid, 0.48, len * 0.98, bodyColor, 0, 0.68, 0));
      add(box(wid * 0.98, 0.82, len * 0.66, bodyColor, 0, 1.26, -len * 0.08));
      add(box(wid * 0.93, 0.64, len * 0.56, glassColor, 0, 1.42, -len * 0.11));
      add(box(wid * 0.94, 0.12, len * 0.58, bodyColor, 0, 1.77, -len * 0.11));
      add(box(wid * 0.94, 0.55, 0.18, glassColor, 0, 1.38, len * 0.27));
      add(box(wid * 1.01, 0.18, 0.3, 0xb9b8a8, 0, 0.5, len * 0.5));
      add(box(wid * 0.94, 0.16, 0.18, 0x8f3030, 0, 0.82, len * 0.5));
      add(box(wid * 0.9, 0.14, 0.12, 0x2d3335, 0, 0.54, -len * 0.51));
      add(box(wid * 0.4, 0.26, 0.04, 0xf7e5b1, 0, 0.76, len * 0.505));
      for (var vh = 0; vh < 2; vh++) {
        var vw = makeWheel(0.39, 0.24); vw.position.set((vh ? 1 : -1) * (wid / 2 - 0.02), 0.4, len * 0.28); g.add(vw); wheels.push(vw);
        var vw2 = makeWheel(0.39, 0.24); vw2.position.set((vh ? 1 : -1) * (wid / 2 - 0.02), 0.4, -len * 0.3); g.add(vw2); wheels.push(vw2);
      }
      var roofSign = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.8), new THREE.MeshBasicMaterial({ map: decalTexture('MAREA', 'COASTAL MOVING CO.'), side: THREE.DoubleSide }));
      roofSign.position.set(0, 1.94, -len * 0.11); roofSign.rotation.x = -Math.PI / 2; g.add(roofSign);
    } else {
      var isSports = type === 'avocet';
      var isArmor = type === 'balandra';
      var chassisH = isSports ? 0.32 : isArmor ? 0.72 : 0.38;
      var chassisY = isSports ? 0.51 : isArmor ? 0.7 : 0.55;
      add(box(wid, chassisH, len * 0.97, bodyColor, 0, chassisY, 0));
      add(box(wid * 0.93, 0.18, len * 0.76, bodyColor, 0, chassisY + chassisH * 0.36, 0));
      var hoodLen = len * (isSports ? 0.32 : 0.24);
      add(box(wid * 0.9, isSports ? 0.16 : 0.2, hoodLen, bodyColor, 0, chassisY + chassisH * 0.5, len * 0.36));
      var trunkLen = len * (isSports ? 0.2 : 0.22);
      add(box(wid * 0.9, isSports ? 0.16 : 0.2, trunkLen, bodyColor, 0, chassisY + chassisH * 0.48, -len * 0.4));
      var cabLen = len * (isSports ? 0.38 : isArmor ? 0.3 : 0.4);
      var cabY0 = chassisY + chassisH * 0.5;
      var cabY1 = isSports ? 1.08 : isArmor ? 2.2 : 1.43;
      var cabin = makeCabin(wid * (isArmor ? 0.98 : 0.86), cabLen, cabY0, cabY1, len * (isSports ? 0.18 : 0.16), len * (isSports ? 0.34 : 0.22), glassColor);
      cabin.position.z = isSports ? -len * 0.08 : -len * 0.03;
      add(cabin);
      var roofW = isArmor ? wid * 0.9 : wid * 0.72;
      var roofY = cabY1 + 0.07;
      add(box(roofW, 0.12, cabLen * 0.62, bodyColor, 0, roofY, cabin.position.z + (isSports ? 0.05 : 0.02)));
      /* pillars */
      var pillar = new THREE.MeshLambertMaterial({ color: bodyColor });
      var pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.09, cabY1 - cabY0, 0.14), pillar);
      pillarL.position.set(-wid * 0.42, (cabY0 + cabY1) / 2, cabin.position.z + cabLen * 0.28);
      g.add(pillarL);
      var pillarR = pillarL.clone(); pillarR.position.x = wid * 0.42; g.add(pillarR);
      var pillarB = pillarL.clone(); pillarB.position.z = cabin.position.z - cabLen * 0.32; g.add(pillarB);
      var pillarBR = pillarB.clone(); pillarBR.position.x = wid * 0.42; g.add(pillarBR);
      /* bumpers and grille */
      add(box(wid * 1.02, 0.18, 0.24, '#c7c3b3', 0, 0.37, len * 0.48));
      add(box(wid * 0.92, 0.16, 0.18, '#24282a', 0, 0.72, len * 0.49));
      add(box(wid * 0.98, 0.16, 0.18, '#9f3e37', 0, 0.7, -len * 0.49));
      add(box(wid * 0.4, 0.22, 0.05, '#f3dca3', 0, 0.67, len * 0.505));
      add(box(wid * 0.15, 0.12, 0.04, '#f0bf5d', -wid * 0.3, 0.84, len * 0.505));
      add(box(wid * 0.15, 0.12, 0.04, '#f0bf5d', wid * 0.3, 0.84, len * 0.505));
      add(box(wid * 0.15, 0.1, 0.04, '#b73f39', -wid * 0.3, 0.8, -len * 0.505));
      add(box(wid * 0.15, 0.1, 0.04, '#b73f39', wid * 0.3, 0.8, -len * 0.505));
      add(box(0.22, 0.34, 0.08, '#d9c99f', 0, 0.57, len * 0.505));
      /* mirrors */
      add(box(0.24, 0.12, 0.34, bodyColor, -wid * 0.54, 1.03, cabLen * 0.1));
      add(box(0.24, 0.12, 0.34, bodyColor, wid * 0.54, 1.03, cabLen * 0.1));
      /* wheels */
      var wheelR = isArmor ? 0.48 : spec.wheelRadius;
      var wheelW = isArmor ? 0.32 : 0.23;
      var positions = [
        [-(wid / 2 + 0.02), wheelR, spec.wheelBase / 2],
        [wid / 2 + 0.02, wheelR, spec.wheelBase / 2],
        [-(wid / 2 + 0.02), wheelR, -spec.wheelBase / 2],
        [wid / 2 + 0.02, wheelR, -spec.wheelBase / 2]
      ];
      for (var wi = 0; wi < 4; wi++) {
        var wh = makeWheel(wheelR, wheelW);
        wh.position.set(positions[wi][0], positions[wi][1], positions[wi][2]);
        g.add(wh); wheels.push(wh);
      }
      if (isSports) {
        add(box(wid * 0.96, 0.12, 0.3, '#20282a', 0, 0.9, -len * 0.44));
        add(box(0.16, 0.35, 0.2, '#20282a', -wid * 0.34, 1.05, -len * 0.43));
        add(box(0.16, 0.35, 0.2, '#20282a', wid * 0.34, 1.05, -len * 0.43));
        add(box(wid * 0.7, 0.05, 0.3, '#e85649', 0, 1.01, -len * 0.435));
      }
      if (isArmor) {
        add(box(wid * 0.98, 0.16, len * 0.5, '#59645d', 0, 1.35, 0));
        add(box(wid * 0.76, 0.3, 0.6, '#414d46', 0, 1.8, -len * 0.34));
        add(box(0.7, 0.18, 0.3, '#d5b858', 0, 1.01, len * 0.43));
      }
      if (spec.police) {
        var lightbar = new THREE.Group();
        var barBase = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.66, 0.15, 0.32), new THREE.MeshLambertMaterial({ color: 0x222c31 }));
        lightbar.add(barBase);
        var redMat = new THREE.MeshBasicMaterial({ color: 0xff322f });
        var blueMat = new THREE.MeshBasicMaterial({ color: 0x309dff });
        var red = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.25, 0.16, 0.26), redMat);
        red.position.x = -wid * 0.18; lightbar.add(red);
        var blue = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.25, 0.16, 0.26), blueMat);
        blue.position.x = wid * 0.18; lightbar.add(blue);
        lightbar.position.y = roofY + 0.17;
        g.add(lightbar);
        g.userData.lightbar = lightbar;
        g.userData.redMat = redMat; g.userData.blueMat = blueMat;
        var decalTex = decalTexture('MARISOL P.D.', 'COASTAL PATROL · 12');
        var decalMat = new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, side: THREE.DoubleSide });
        var dl = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.85), decalMat);
        dl.position.set(-wid / 2 - 0.012, 0.95, 0); dl.rotation.y = -Math.PI / 2; g.add(dl);
        var dr = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.85), decalMat);
        dr.position.set(wid / 2 + 0.012, 0.95, 0); dr.rotation.y = Math.PI / 2; g.add(dr);
        var number = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: decalTexture('12', 'MARISOL P.D.'), transparent: true }));
        number.position.set(0, 0.8, -len / 2 - 0.012); number.rotation.y = Math.PI; g.add(number);
      }
      if (type === 'tucan') {
        var tsign = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.32, 0.45), new THREE.MeshLambertMaterial({ color: 0x1f3a40 }));
        tsign.position.set(0, roofY + 0.22, 0.1); g.add(tsign);
        var ttext = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.28), new THREE.MeshBasicMaterial({ map: decalTexture('TAXI', 'TUCÁN · MARISOL') }));
        ttext.position.set(0, roofY + 0.22, 0.34); g.add(ttext);
      }
    }

    var plate = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.24), new THREE.MeshBasicMaterial({ map: plateTexture(type === 'avocet' ? 'TEO 01' : 'MRSL 82') }));
    plate.position.set(0, 0.42, len / 2 + 0.018);
    g.add(plate);
    var plate2 = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.24), new THREE.MeshBasicMaterial({ map: plateTexture('MRSL 82') }));
    plate2.position.set(0, 0.42, -len / 2 - 0.018);
    plate2.rotation.y = Math.PI;
    g.add(plate2);

    return { group: g, wheels: wheels, spec: spec, bodyColor: bodyColor };
  }

  function Vehicle(game, type, opts) {
    opts = opts || {};
    this.game = game;
    this.type = type || 'paloma';
    this.spec = C.VEHICLES[this.type] || C.VEHICLES.paloma;
    this.pos = new THREE.Vector3(opts.x || 0, opts.y || 0, opts.z || 0);
    this.heading = opts.heading || 0;
    this.speed = opts.speed || 0;
    this.vx = 0; this.vz = 0;
    this.steer = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.occupied = false;
    this.isPolice = !!this.spec.police;
    this.owner = opts.owner || 'traffic';
    this.ai = null;
    this.damage = 0;
    this.wheelSpin = 0;
    this.siren = false;
    this.stationary = false;

    var built = buildCarMesh(this.type, opts.color, opts.accent);
    this.mesh = built.group;
    this.wheels = built.wheels;
    this.bodyColor = built.bodyColor;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    this.mesh.userData.vehicle = this;
    this.game.scene.add(this.mesh);
    this.radius = Math.max(this.spec.width, 1.4) * 0.58;
  }

  Vehicle.prototype.setPosition = function (x, z, heading) {
    this.pos.x = x; this.pos.z = z;
    if (heading != null) this.heading = heading;
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.rotation.y = this.heading;
  };

  Vehicle.prototype.setVisible = function (v) {
    this.mesh.visible = v;
  };

  Vehicle.prototype.updateVisual = function (dt) {
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.rotation.y = this.heading;
    this.wheelSpin += (this.speed || 0) * dt / (this.spec.wheelRadius || 0.35);
    for (var i = 0; i < this.wheels.length; i++) this.wheels[i].rotation.x = this.wheelSpin;
    if (this.mesh.userData.lightbar) {
      var phase = (this.game.time * 7.5 + (this.siren ? 0 : 1.3)) % 2;
      var on = this.siren ? phase < 1 : false;
      var flip = phase > 1;
      if (this.mesh.userData.redMat) this.mesh.userData.redMat.color.setHex(on && !flip ? 0xff2f2f : 0x551618);
      if (this.mesh.userData.blueMat) this.mesh.userData.blueMat.color.setHex(on && flip ? 0x2e8fff : 0x14274a);
    }
  };

  Vehicle.prototype.damageBy = function (amount) {
    this.health = Math.max(0, this.health - amount);
    return this.health <= 0;
  };

  Vehicle.prototype.repair = function () {
    this.health = 100;
    this.mesh.visible = true;
  };

  Vehicle.prototype.distanceTo = function (p) {
    return U.dist(this.pos.x, this.pos.z, p.x, p.z);
  };

  Vehicle.prototype.stop = function () {
    this.speed = 0;
    this.vx = 0; this.vz = 0;
  };

  Vehicle.prototype.park = function (x, z, heading) {
    this.setPosition(x, z, heading);
    this.speed = 0; this.vx = 0; this.vz = 0;
  };

  CH.Vehicle = Vehicle;
  CH.VehicleFactory = {
    create: function (game, type, opts) { return new Vehicle(game, type, opts); },
    buildMesh: buildCarMesh
  };
}());
