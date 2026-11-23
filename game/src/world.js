/* COBALT HEAT — Marisol world builder.
   Builds the city, coast, landmarks, props, lighting and static collision in one pass. */
(function () {
  'use strict';

  var CH = window.CH = window.CH || {};
  var U = CH.Util;
  var C = CH.CONFIG;
  var COL = C.COLORS;
  var W = C.WORLD;

  var SKY_VERT = [
    'varying vec3 vWorld;',
    'void main() {',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vWorld = wp.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  var SKY_FRAG = [
    'uniform vec3 topColor;',
    'uniform vec3 horizonColor;',
    'uniform vec3 sunColor;',
    'uniform vec3 sunDir;',
    'uniform float haze;',
    'varying vec3 vWorld;',
    'void main() {',
    '  vec3 d = normalize(vWorld);',
    '  float h = clamp(d.y, -0.08, 1.0);',
    '  vec3 col = mix(horizonColor, topColor, smoothstep(0.0, 0.62, h));',
    '  float sunDot = max(dot(d, normalize(sunDir)), 0.0);',
    '  float disc = smoothstep(0.9986, 0.9996, sunDot);',
    '  float halo = pow(sunDot, 42.0) * 0.55 + pow(sunDot, 7.0) * 0.16;',
    '  col += sunColor * halo;',
    '  col = mix(col, sunColor * 1.35 + vec3(0.18, 0.10, 0.04), disc * 0.92);',
    '  float band = sin(d.x * 9.0 + d.z * 4.0 + h * 22.0) * 0.5 + 0.5;',
    '  float cloud = smoothstep(0.63, 0.92, band) * smoothstep(0.03, 0.28, h) * (1.0 - smoothstep(0.36, 0.62, h));',
    '  col = mix(col, vec3(1.0, 0.93, 0.84), cloud * 0.16 * (1.0 - haze * 0.4));',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var OCEAN_VERT = [
    'uniform float time;',
    'varying vec3 vWorld;',
    'varying vec3 vNormalW;',
    'void main() {',
    '  vec3 p = position;',
    '  vec4 wp = modelMatrix * vec4(p, 1.0);',
    '  vWorld = wp.xyz;',
    '  vNormalW = normalize(mat3(modelMatrix) * normal);',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  var OCEAN_FRAG = [
    'uniform float time;',
    'uniform vec3 deepColor;',
    'uniform vec3 shallowColor;',
    'uniform vec3 sunDir;',
    'uniform vec3 sunColor;',
    'varying vec3 vWorld;',
    'varying vec3 vNormalW;',
    'float wave(vec2 p) {',
    '  return sin(p.x * 0.18 + time * 0.7) * 0.5 + sin(p.y * 0.31 - time * 0.5) * 0.35 + sin((p.x + p.y) * 0.09 + time * 0.3) * 0.4;',
    '}',
    'void main() {',
    '  float w = wave(vWorld.xz);',
    '  vec3 n = normalize(vec3(w * 0.10, 1.0, w * 0.07));',
    '  vec3 V = normalize(cameraPosition - vWorld);',
    '  float fres = pow(1.0 - max(dot(n, V), 0.0), 2.4);',
    '  float shore = smoothstep(-1450.0, -460.0, vWorld.x);',
    '  vec3 col = mix(deepColor, shallowColor, shore * 0.78);',
    '  col = mix(col, vec3(0.10, 0.62, 0.66), shore * 0.18);',
    '  float glint = pow(max(dot(reflect(-V, n), normalize(sunDir)), 0.0), 96.0);',
    '  float sparkle = pow(max(dot(reflect(-V, n), normalize(sunDir)), 0.0), 500.0);',
    '  col += sunColor * (glint * 0.25 + sparkle * 1.1);',
    '  vec3 R = reflect(-V, n);',
    '  col = mix(col, vec3(0.58, 0.85, 0.90), fres * 0.42);',
    '  float bands = smoothstep(0.78, 0.92, sin((vWorld.z + w * 9.0) * 0.26) * 0.5 + 0.5);',
    '  col += vec3(0.85, 0.96, 0.96) * bands * 0.055;',
    '  float foam = smoothstep(-515.0, -485.0, vWorld.x) * smoothstep(-455.0, -490.0, vWorld.x);',
    '  col = mix(col, vec3(0.94, 0.98, 0.96), foam * (0.22 + 0.18 * sin(vWorld.z * 0.3 + time)));',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function World(game) {
    this.game = game;
    this.scene = game.scene;
    this.colliders = [];
    this.buildings = [];
    this.mapBuildings = [];
    this.palms = [];
    this.signs = [];
    this.lampLights = [];
    this.ferris = null;
    this.birds = [];
    this.time = 0;
    this.minutes = W.startMinutes;
    this.sunDir = new THREE.Vector3(-0.7, 0.38, 0.2).normalize();
    this.shadowTarget = new THREE.Vector3();
    this.roadMatV = new THREE.MeshLambertMaterial({ color: 0xffffff, map: U.asphaltTexture() });
    this.roadMatH = new THREE.MeshLambertMaterial({ color: 0xffffff, map: U.asphaltTexture() });
    this.roadMatH.map = this.roadMatH.map.clone();
    this.roadMatH.map.needsUpdate = true;
    this.roadMatH.map.repeat.set(22, 4);
    this.sidewalkMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: U.sidewalkTexture() });
    this.sandMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: U.sandTexture() });
    this.woodMat = new THREE.MeshLambertMaterial({ color: 0xb98d63 });
    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
    this.build();
  }

  World.prototype.build = function () {
    var scene = this.scene;
    scene.fog = new THREE.Fog(0xdfc9a7, W.fogNear, W.fogFar);
    scene.background = new THREE.Color(0x97c7ca);

    this.buildSky();
    this.buildLights();
    this.buildGround();
    this.buildRoads();
    this.buildBlocks();
    this.buildBeach();
    this.buildPalmSet();
    this.buildStreetFurniture();
    this.buildPier();
    this.buildMarina();
    this.buildTrafficLights();
    this.buildBirds();
    this.setTime(W.startMinutes);
  };

  /* ------------------------------------------------------------------- sky */

  World.prototype.buildSky = function () {
    var geo = new THREE.SphereGeometry(1200, 32, 18);
    this.skyUniforms = {
      topColor: { value: new THREE.Color(0x3b87b1) },
      horizonColor: { value: new THREE.Color(0xf4d4a4) },
      sunColor: { value: new THREE.Color(0xffd087) },
      sunDir: { value: this.sunDir.clone() },
      haze: { value: 0.15 }
    };
    var mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    this.sunSpriteMat = new THREE.SpriteMaterial({
      map: U.glowTexture('rgba(255,250,226,0.95)', 'rgba(255,187,100,0.34)'),
      color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true
    });
    this.sunSprite = new THREE.Sprite(this.sunSpriteMat);
    this.sunSprite.scale.set(190, 190, 1);
    this.scene.add(this.sunSprite);

    /* soft coastal cloud banks */
    this.clouds = [];
    var cloudDefs = [
      [-250, 160, -360, 210, 72], [80, 190, -430, 260, 86], [390, 160, -180, 190, 64],
      [-520, 175, 80, 230, 78], [160, 145, 300, 180, 58], [440, 185, 330, 250, 82],
      [-80, 205, 40, 300, 92], [-420, 145, -120, 170, 56]
    ];
    for (var ci = 0; ci < cloudDefs.length; ci++) {
      var def = cloudDefs[ci];
      var mat = new THREE.SpriteMaterial({
        map: U.cloudTexture(1200 + ci * 17), color: 0xfff0d4, transparent: true,
        opacity: 0.55, depthWrite: false, fog: false
      });
      var cloud = new THREE.Sprite(mat);
      cloud.position.set(def[0], def[1], def[2]);
      cloud.scale.set(def[3], def[4], 1);
      cloud.renderOrder = -2;
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  };

  World.prototype.buildLights = function () {
    var hemi = new THREE.HemisphereLight(0xcde8ef, 0xd9b482, 0.78);
    this.scene.add(hemi);
    this.hemi = hemi;

    var sun = new THREE.DirectionalLight(0xffe4bc, 2.1);
    sun.position.set(-160, 180, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 420;
    sun.shadow.camera.left = -160;
    sun.shadow.camera.right = 160;
    sun.shadow.camera.top = 160;
    sun.shadow.camera.bottom = -160;
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    var fill = new THREE.DirectionalLight(0xa8d7df, 0.34);
    fill.position.set(160, 70, -120);
    this.scene.add(fill);
    this.fill = fill;
  };

  /* ----------------------------------------------------------------- ground */

  World.prototype.buildGround = function () {
    var city = new THREE.Mesh(
      new THREE.PlaneGeometry(W.groundSize, W.groundSize),
      new THREE.MeshLambertMaterial({ color: 0xcab996 })
    );
    city.rotation.x = -Math.PI / 2;
    city.position.y = -0.06;
    city.receiveShadow = true;
    this.scene.add(city);

    var inner = new THREE.Mesh(
      new THREE.PlaneGeometry(860, 860),
      new THREE.MeshLambertMaterial({ color: 0x8d8a78 })
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = -0.04;
    inner.receiveShadow = true;
    this.scene.add(inner);
  };

  World.prototype.buildRoads = function () {
    var scene = this.scene;
    var i;
    for (i = 0; i < W.roadsX.length; i++) {
      var x = W.roadsX[i];
      var road = new THREE.Mesh(new THREE.PlaneGeometry(W.roadHalf * 2, 900), this.roadMatV);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.012, 0);
      road.receiveShadow = true;
      scene.add(road);
      this.mapRoads = this.mapRoads || [];
    }
    for (i = 0; i < W.roadsZ.length; i++) {
      var z = W.roadsZ[i];
      var roadH = new THREE.Mesh(new THREE.PlaneGeometry(900, W.roadHalf * 2), this.roadMatH);
      roadH.rotation.x = -Math.PI / 2;
      roadH.position.set(0, 0.014, z);
      roadH.receiveShadow = true;
      scene.add(roadH);
    }
    this.buildRoadMarkings();
  };

  World.prototype.buildRoadMarkings = function () {
    var b = new U.MeshBuilder();
    var i, j;
    var white = '#ece3cc';
    var yellow = '#e8b84d';
    for (i = 0; i < W.roadsX.length; i++) {
      var x = W.roadsX[i];
      for (j = 0; j < W.roadsZ.length - 1; j++) {
        var z0 = W.roadsZ[j] + W.roadHalf + 4;
        var z1 = W.roadsZ[j + 1] - W.roadHalf - 4;
        for (var z = z0; z < z1; z += 7.5) {
          b.plane(x - 2.6, 0.03, z + 1.9, 0.22, 3.4, white);
          b.plane(x + 2.6, 0.03, z + 1.9, 0.22, 3.4, white);
        }
        b.plane(x - 8.8, 0.03, (z0 + z1) / 2, 0.16, z1 - z0, '#d7cdb9');
        b.plane(x + 8.8, 0.03, (z0 + z1) / 2, 0.16, z1 - z0, '#d7cdb9');
      }
    }
    for (i = 0; i < W.roadsZ.length; i++) {
      var zc = W.roadsZ[i];
      for (j = 0; j < W.roadsX.length - 1; j++) {
        var x0 = W.roadsX[j] + W.roadHalf + 4;
        var x1 = W.roadsX[j + 1] - W.roadHalf - 4;
        for (var xc = x0; xc < x1; xc += 7.5) {
          b.plane(xc + 1.9, 0.031, zc - 2.6, 3.4, 0.22, white);
          b.plane(xc + 1.9, 0.031, zc + 2.6, 3.4, 0.22, white);
        }
        b.plane((x0 + x1) / 2, 0.031, zc - 8.8, x1 - x0, 0.16, '#d7cdb9');
        b.plane((x0 + x1) / 2, 0.031, zc + 8.8, x1 - x0, 0.16, '#d7cdb9');
      }
    }
    /* Crosswalks at every city intersection. */
    for (i = 0; i < W.roadsX.length; i++) {
      for (j = 0; j < W.roadsZ.length; j++) {
        var cx = W.roadsX[i], cz = W.roadsZ[j];
        for (var k = -3; k <= 3; k++) {
          b.plane(cx + k * 2.5, 0.035, cz - 12.2, 1.4, 2.4, '#eee7d5');
          b.plane(cx + k * 2.5, 0.035, cz + 12.2, 1.4, 2.4, '#eee7d5');
          b.plane(cx - 12.2, 0.035, cz + k * 2.5, 2.4, 1.4, '#eee7d5');
          b.plane(cx + 12.2, 0.035, cz + k * 2.5, 2.4, 1.4, '#eee7d5');
        }
        b.plane(cx, 0.036, cz, 15, 15, '#444542');
      }
    }
    var mesh = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  };

  /* ----------------------------------------------------------------- blocks */

  World.prototype.districtAt = function (x, z) {
    for (var i = 0; i < C.DISTRICTS.length; i++) {
      var d = C.DISTRICTS[i];
      if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) return d;
    }
    return { id: 'centro', name: 'CENTRO SOL', color: '#5ed7c5' };
  };

  World.prototype.blockKey = function (bx, bz) {
    return bx + ',' + bz;
  };

  World.prototype.buildBlocks = function () {
    var centersX = [];
    var centersZ = [];
    var i, j;
    for (i = 0; i < W.roadsX.length - 1; i++) centersX.push((W.roadsX[i] + W.roadsX[i + 1]) / 2);
    for (j = 0; j < W.roadsZ.length - 1; j++) centersZ.push((W.roadsZ[j] + W.roadsZ[j + 1]) / 2);
    this.blockCentersX = centersX;
    this.blockCentersZ = centersZ;

    for (i = 0; i < centersX.length; i++) {
      for (j = 0; j < centersZ.length; j++) {
        var bx = centersX[i], bz = centersZ[j];
        var key = this.blockKey(bx, bz);
        var size = 90 - W.roadHalf * 2;
        var slab = new THREE.Mesh(new THREE.BoxGeometry(size, W.sidewalkHeight, size), this.sidewalkMat);
        slab.position.set(bx, W.sidewalkHeight / 2, bz);
        slab.receiveShadow = true;
        this.scene.add(slab);
        this.addBlockCurb(bx, bz, size);
        this.buildBlock(key, bx, bz, i, j);
      }
    }
  };

  World.prototype.addBlockCurb = function (bx, bz, size) {
    var b = new U.MeshBuilder();
    var half = size / 2;
    var c = '#d9c8a9';
    b.box(bx, 0.16, bz - half + 0.15, size, 0.32, 0.3, c);
    b.box(bx, 0.16, bz + half - 0.15, size, 0.32, 0.3, c);
    b.box(bx - half + 0.15, 0.16, bz, 0.3, 0.32, size, c);
    b.box(bx + half - 0.15, 0.16, bz, 0.3, 0.32, size, c);
    var m = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = true;
    this.scene.add(m);
  };

  World.prototype.buildBlock = function (key, bx, bz, ix, iz) {
    if (key === '45,45') return this.buildPlaza(bx, bz);
    if (key === '-225,45') return this.buildHotelAzul(bx, bz);
    if (key === '315,-225') return this.buildCobaltTower(bx, bz);
    if (key === '315,315') return this.buildEstate(bx, bz);
    if (key === '-315,315') return this.buildMarinaBlock(bx, bz);
    if (key === '-225,225') return this.buildGarage(bx, bz);
    if (key === '-135,-315') return this.buildContainerYard(bx, bz);
    if (key === '315,45') return this.buildPark(bx, bz);
    if (key === '135,315') return this.buildPoliceBlock(bx, bz);
    if (key === '-135,135') return this.buildMarketBlock(bx, bz);
    this.buildGenericBlock(key, bx, bz, ix, iz);
  };

  World.prototype.blockRng = function (key) {
    return U.mulberry32(U.hashString(key + '-marisol'));
  };

  World.prototype.buildGenericBlock = function (key, bx, bz, ix, iz) {
    var rng = this.blockRng(key);
    var district = this.districtAt(bx, bz);
    var palettes = C.BUILDING_PALETTES[district.id] || C.BUILDING_PALETTES.centro;
    var style = district.id;
    var isAlto = style === 'alto';
    var isSouth = style === 'south';
    var isBeach = style === 'playa' || style === 'coral';
    var lot = 55;
    var count = isAlto && rng() < 0.72 ? 1 : isSouth ? 1 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2);
    if (!isAlto && !isSouth && rng() < 0.18) count = 1;

    for (var n = 0; n < count; n++) {
      var w, d, px, pz;
      if (count === 1) {
        w = 30 + rng() * 20; d = 32 + rng() * 18;
        px = bx + (rng() - 0.5) * 4; pz = bz + (rng() - 0.5) * 4;
      } else if (count === 2) {
        var horizontal = rng() < 0.5;
        if (horizontal) { w = lot * 0.44; d = 38 + rng() * 10; px = bx + (n === 0 ? -lot * 0.25 : lot * 0.25); pz = bz + (rng() - 0.5) * 6; }
        else { w = 38 + rng() * 10; d = lot * 0.44; px = bx + (rng() - 0.5) * 6; pz = bz + (n === 0 ? -lot * 0.25 : lot * 0.25); }
      } else {
        var col = n % 2, row = n < 2 ? -1 : 1;
        w = 24 + rng() * 8; d = 22 + rng() * 8;
        px = bx + (col ? 15 : -15) + (rng() - 0.5) * 4;
        pz = bz + row * 15 + (rng() - 0.5) * 4;
      }
      var h;
      if (isAlto) h = 34 + rng() * 58;
      else if (isBeach) h = 14 + rng() * 19;
      else if (isSouth) h = 6 + rng() * 9;
      else if (district.id === 'vista') h = 9 + rng() * 16;
      else h = 9 + rng() * 20;
      var color = U.pick(rng, palettes);
      this.addBuilding(px, pz, w, d, h, color, district, rng, n);
      if (isBeach && rng() < 0.45) this.addAwning(px, pz, w, d, U.pick(rng, C.ROAD_COLORS), district, rng);
      if (rng() < 0.22) this.addRooftopSign(px, pz, w, d, h, district, rng, bx, bz);
    }

    /* small back-lot details */
    var pb = new U.MeshBuilder();
    for (var p = 0; p < 3; p++) {
      var sx = bx + (rng() - 0.5) * 36, sz = bz + (rng() - 0.5) * 36;
      pb.box(sx, 0.52, sz, 1.2, 0.6, 1.2, '#6f6f63');
      pb.box(sx, 0.88, sz, 0.9, 0.14, 0.9, '#4e5b50');
    }
    var props = pb.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    props.castShadow = true; props.receiveShadow = true;
    this.scene.add(props);

    if (rng() < 0.5 && !isAlto) {
      var top = 0.22;
      var palmX = bx + (rng() < 0.5 ? -25 : 25), palmZ = bz + (rng() < 0.5 ? -25 : 25);
      this.addPalm(palmX, top, palmZ, 0.8 + rng() * 0.4);
    }
  };

  World.prototype.addBuilding = function (px, pz, w, d, h, color, district, rng, index) {
    var shell = new U.MeshBuilder();
    var base = 0.22;
    var bodyColor = color;
    shell.box(px, base + h / 2, pz, w, h, d, bodyColor, 0, false);
    shell.box(px, base + h + 0.2, pz, w + 0.6, 0.5, d + 0.6, '#c8b89c');
    if (h > 34) {
      var tierH = h * 0.18;
      shell.box(px, base + h + tierH / 2 + 0.4, pz, w * 0.78, tierH, d * 0.78, bodyColor, 0, false);
      shell.box(px, base + h + tierH + 0.7, pz, w * 0.78 + 0.5, 0.35, d * 0.78 + 0.5, '#d7c6a8');
    }
    if ((district.id === 'alto' || district.id === 'vista') && h > 26) {
      var accent = U.pick(rng, ['#f6c05f', '#48c9bd', '#ff7862', '#d6e8dc']);
      shell.box(px + w / 2 + 0.18, base + h * 0.53, pz + (rng() - 0.5) * d * 0.55, 0.34, h * 0.72, 1.15, accent, 0, false);
      shell.box(px - w / 2 - 0.18, base + h * 0.44, pz + (rng() - 0.5) * d * 0.5, 0.34, h * 0.58, 0.9, accent, 0, false);
      shell.box(px + (rng() - 0.5) * w * 0.5, base + h * 0.82, pz + d / 2 + 0.12, w * 0.2, h * 0.14, 0.2, accent, 0, false);
    }

    var b = this.buildings[this.buildings.length - 1];
    var win = new U.MeshBuilder();
    var frame = new U.MeshBuilder();
    var floors = Math.max(2, Math.floor((h - 2.5) / 3.1));
    var faceStyles = [
      { nx: 0, nz: 1, x: px, z: pz + d / 2 + 0.025, rot: 0, span: w },
      { nx: 0, nz: -1, x: px, z: pz - d / 2 - 0.025, rot: Math.PI, span: w },
      { nx: 1, nz: 0, x: px + w / 2 + 0.025, z: pz, rot: Math.PI / 2, span: d },
      { nx: -1, nz: 0, x: px - w / 2 - 0.025, z: pz, rot: -Math.PI / 2, span: d }
    ];
    var glassColors = ['#264a51', '#315b62', '#4e838a', '#e5b565', '#243d44', '#6b9ba0'];
    var glass = new THREE.Color(U.pick(rng, glassColors));
    for (var f = 0; f < 4; f++) {
      var face = faceStyles[f];
      var cols = Math.max(1, Math.floor((face.span - 2) / 2.4));
      var step = (face.span - 2) / cols;
      for (var c = 0; c < cols; c++) {
        var along = -face.span / 2 + 1 + step * (c + 0.5);
        for (var fl = 0; fl < floors; fl++) {
          var yy = base + 2.2 + fl * 3.1;
          if (yy + 1.15 > base + h - 0.6) continue;
          var ww = Math.min(1.4, step * 0.58), wh = 1.55;
          var lit = rng() < 0.07;
          var col = lit ? new THREE.Color('#f4c46b') : glass.clone().multiplyScalar(0.82 + rng() * 0.22);
          this.addWindowQuad(win, face, along, yy, ww, wh, col);
          if (district.id === 'coral' && f === 0 && fl % 2 === 0) {
            frame.box(face.x + face.nx * 0.35, yy - 0.05, face.z + face.nz * 0.35, face.nx !== 0 ? 0.7 : ww + 0.6, 0.12, face.nz !== 0 ? 0.7 : wh + 0.6, '#f4e5c8', 0, false);
          }
        }
      }
    }
    /* shopfront glass and doorway */
    for (var sf = 0; sf < 4; sf++) {
      var sface = faceStyles[sf];
      if (rng() < 0.4) continue;
      var sAlong = (rng() - 0.5) * (sface.span - 6);
      this.addWindowQuad(win, sface, sAlong, base + 1.15, 3.2, 1.8, new THREE.Color('#17363c'));
    }

    var shellMesh = shell.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    shellMesh.castShadow = true; shellMesh.receiveShadow = true;
    this.scene.add(shellMesh);

    var winMesh = win.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.scene.add(winMesh);

    var frameMesh = frame.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    frameMesh.castShadow = true; frameMesh.receiveShadow = true;
    this.scene.add(frameMesh);

    var bld = {
      x: px, z: pz, w: w, d: d, h: h, color: bodyColor, district: district.id,
      minX: px - w / 2, maxX: px + w / 2, minZ: pz - d / 2, maxZ: pz + d / 2
    };
    this.buildings.push(bld);
    this.mapBuildings.push(bld);
    this.colliders.push({ minX: bld.minX, maxX: bld.maxX, minZ: bld.minZ, maxZ: bld.maxZ, height: h + 0.3, kind: 'building' });

    /* rooftop clutter */
    if (h > 8 && rng() < 0.7) {
      var rb = new U.MeshBuilder();
      var rx = px + (rng() - 0.5) * (w - 7), rz = pz + (rng() - 0.5) * (d - 7);
      rb.box(rx, base + h + 1.15, rz, 2.2, 1.4, 1.6, '#a7a499');
      rb.box(rx, base + h + 1.95, rz, 1.2, 0.3, 1.0, '#6c726b');
      rb.box(px - w * 0.24, base + h + 0.95, pz + d * 0.2, 1.4, 0.9, 1.2, '#8b8f84');
      var rm = rb.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
      rm.castShadow = true; rm.receiveShadow = true;
      this.scene.add(rm);
      this.colliders.push({ minX: rx - 1.1, maxX: rx + 1.1, minZ: rz - 0.8, maxZ: rz + 0.8, height: h + 2, kind: 'roof', minY: h });
    }
    return bld;
  };

  World.prototype.addWindowQuad = function (builder, face, along, y, ww, wh, color) {
    var x = face.x + face.nx * 0.001;
    var z = face.z + face.nz * 0.001;
    if (face.nz !== 0) {
      var dir = face.nz > 0 ? 1 : -1;
      var nx = x + along;
      var n = [0, 0, dir];
      var p1 = [nx - ww / 2, y - wh / 2, z], p2 = [nx + ww / 2, y - wh / 2, z];
      var p3 = [nx + ww / 2, y + wh / 2, z], p4 = [nx - ww / 2, y + wh / 2, z];
      if (dir > 0) builder.quad(p1, p2, p3, p4, n, color);
      else builder.quad(p2, p1, p4, p3, n, color);
    } else {
      var dirx = face.nx > 0 ? 1 : -1;
      var nz = z + along;
      var nx2 = [dirx, 0, 0];
      var q1 = [x, y - wh / 2, nz - ww / 2], q2 = [x, y - wh / 2, nz + ww / 2];
      var q3 = [x, y + wh / 2, nz + ww / 2], q4 = [x, y + wh / 2, nz - ww / 2];
      if (dirx > 0) builder.quad(q2, q1, q4, q3, nx2, color);
      else builder.quad(q1, q2, q3, q4, nx2, color);
    }
  };

  World.prototype.addAwning = function (px, pz, w, d, color, district, rng) {
    var b = new U.MeshBuilder();
    var side = Math.floor(rng() * 4);
    var x = px, z = pz, sx = w * 0.8, sz = d * 0.8;
    if (side === 0) { z += d / 2 + 0.7; sx = w * 0.75; sz = 1.4; }
    if (side === 1) { z -= d / 2 + 0.7; sx = w * 0.75; sz = 1.4; }
    if (side === 2) { x += w / 2 + 0.7; sx = 1.4; sz = d * 0.75; }
    if (side === 3) { x -= w / 2 + 0.7; sx = 1.4; sz = d * 0.75; }
    b.box(x, 3.3, z, sx, 0.22, sz, color, 0, false);
    b.box(x, 2.8, z, sx * 0.92, 0.22, sz * 0.92, '#eee2c9', 0, false);
    var m = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = true;
    this.scene.add(m);
  };

  World.prototype.addRooftopSign = function (px, pz, w, d, h, district, rng, bx, bz) {
    var labels = {
      playa: ['CASA SOL', 'LUNA', 'PLAYA', 'TIDE'],
      coral: ['HOTEL AZUL', 'MIRAMAR', 'CAFÉ ROSA', 'PALMAS'],
      centro: ['MERCADO', 'SOL 98.3', 'LA ISLA', 'COBALT'],
      alto: ['ALTO MAR', 'VELA', 'NORTHSTAR', 'KITE'],
      vista: ['VISTA', 'CASA MIRAMAR', 'HILLSIDE', 'AZUL'],
      south: ['CARGO', 'PUERTO', 'TIDE WORKS', 'LUME'],
      marina: ['MARINA', 'DOCK 9', 'LUME', 'TIDE']
    };
    var arr = labels[district.id] || labels.centro;
    var text = U.pick(rng, arr);
    var side = rng() < 0.5 ? 1 : -1;
    var z = pz + side * (d / 2 + 0.35);
    var tv = new THREE.Color(U.pick(rng, ['#17383b', '#5d2430', '#143b4a', '#3e4930']));
    var tex = U.signTexture([text], {
      width: 512, height: 128, bg: '#f7e7c7', color: '#19383c', size: 48,
      borderColor: '#19383c', caption: district.name
    });
    this.addSignMesh(tex, px, h + 2.4, z, Math.min(w * 0.9, 10), 2.7, side > 0 ? 0 : Math.PI);
    var b = new U.MeshBuilder();
    b.box(px, h + 0.4, z, 10.2, 0.3, 0.3, '#18383c');
    b.box(px - 4.5, h + 1.3, z, 0.2, 2.1, 0.2, '#18383c');
    b.box(px + 4.5, h + 1.3, z, 0.2, 2.1, 0.2, '#18383c');
    var m = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(m);
  };

  World.prototype.addSignMesh = function (texture, x, y, z, w, h, ry, glow) {
    var mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    if (glow) { mat.color = new THREE.Color(glow); }
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry || 0;
    this.scene.add(mesh);
    this.signs.push(mesh);
    return mesh;
  };

  World.prototype.addPalm = function (x, y, z, scale) {
    this.palms.push({ x: x, y: y || 0.22, z: z, s: scale || 1, rot: Math.random() * Math.PI * 2 });
  };

  /* --------------------------------------------------------------- landmarks */

  World.prototype.buildPlaza = function (bx, bz) {
    var b = new U.MeshBuilder();
    b.plane(bx, 0.26, bz, 48, 48, '#d8c7a8');
    for (var i = -2; i <= 2; i++) b.plane(bx, 0.265, bz + i * 9, 48, 0.18, '#9c8c73');
    for (i = -2; i <= 2; i++) b.plane(bx + i * 9, 0.265, bz, 0.18, 48, '#9c8c73');
    var stone = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    stone.receiveShadow = true;
    this.scene.add(stone);

    var fountain = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9.4, 0.9, 28),
      new THREE.MeshLambertMaterial({ color: 0xc9b693 })
    );
    fountain.position.set(bx, 0.65, bz);
    fountain.castShadow = true; fountain.receiveShadow = true;
    this.scene.add(fountain);
    var water = new THREE.Mesh(
      new THREE.CylinderGeometry(8.2, 8.2, 0.12, 28),
      new THREE.MeshBasicMaterial({ color: 0x59c9cc, transparent: true, opacity: 0.82 })
    );
    water.position.set(bx, 1.11, bz);
    this.scene.add(water);
    var plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 5.6, 8), new THREE.MeshLambertMaterial({ color: 0xd9c8a8 }));
    plinth.position.set(bx, 3.2, bz);
    plinth.castShadow = true;
    this.scene.add(plinth);
    var pearl = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 8), new THREE.MeshLambertMaterial({ color: 0xffd46e, emissive: 0x7a4e0c, emissiveIntensity: 0.3 }));
    pearl.position.set(bx, 6.35, bz);
    pearl.castShadow = true;
    this.scene.add(pearl);
    var arch = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.16, 6, 20, Math.PI), new THREE.MeshLambertMaterial({ color: 0x3b8b86 }));
    arch.position.set(bx, 6.2, bz);
    arch.rotation.z = 0;
    this.scene.add(arch);
    this.colliders.push({ minX: bx - 9.5, maxX: bx + 9.5, minZ: bz - 9.5, maxZ: bz + 9.5, height: 7, kind: 'fountain' });

    this.addPalm(bx - 17, 0.26, bz - 14, 1.1);
    this.addPalm(bx + 17, 0.26, bz - 14, 1.1);
    this.addPalm(bx - 17, 0.26, bz + 15, 1.0);
    this.addPalm(bx + 17, 0.26, bz + 15, 1.0);

    var bench = new U.MeshBuilder();
    for (i = 0; i < 12; i++) {
      var a = i / 12 * Math.PI * 2;
      bench.box(bx + Math.cos(a) * 14, 0.75, bz + Math.sin(a) * 14, 2.2, 0.35, 0.8, '#6f5441', -a + Math.PI / 2);
    }
    var bm = bench.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    bm.castShadow = true; bm.receiveShadow = true;
    this.scene.add(bm);

    this.addSignMesh(U.signTexture(['PLAZA SOL'], { width: 512, height: 128, bg: '#f2dfb9', color: '#20545a', size: 54, caption: 'CENTRO · MARISOL' }), bx, 4.8, bz + 27, 11, 2.7, Math.PI);
    this.mapBuildings.push({ x: bx, z: bz, w: 30, d: 30, h: 4, color: '#8bcf92' });
  };

  World.prototype.buildHotelAzul = function (bx, bz) {
    var bld = this.addBuilding(bx, bz, 42, 30, 31, '#f0d4b0', { id: 'coral', name: 'CALLE ROSA' }, this.blockRng(bx + ',' + bz), 0);
    var b = new U.MeshBuilder();
    for (var f = 0; f < 7; f++) {
      b.box(bx, 4 + f * 4.1, bz + 16, 41, 0.28, 1.5, '#efe5d0');
    }
    b.box(bx, 34.5, bz, 34, 1.8, 24, '#e8cfaa');
    b.box(bx, 36.2, bz, 18, 3.2, 10, '#d2b58b');
    var m = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
    this.addSignMesh(U.signTexture(['HOTEL', 'AZUL'], { width: 512, height: 512, bg: '#1e5960', color: '#ffe8b8', size: 108, borderColor: '#d9b774', caption: 'CALLE ROSA · 1958' }), bx, 39.6, bz + 5.1, 8.4, 10.4, 0);
    var blade = this.addSignMesh(U.signTexture(['AZUL'], { width: 160, height: 512, bg: '#f6e4c2', color: '#1e5960', size: 76, borderColor: '#d77a58' }), bx - 21.5, 24, bz + 16, 2.6, 9.5, -Math.PI / 2);
    blade.material.color = new THREE.Color(0xd6f3e5);

    var pool = new THREE.Mesh(new THREE.PlaneGeometry(24, 11), new THREE.MeshBasicMaterial({ color: 0x51c8c8, transparent: true, opacity: 0.88 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(bx + 6, 0.34, bz - 20);
    this.scene.add(pool);
    for (var i = 0; i < 6; i++) this.addPalm(bx - 18 + i * 7, 0.26, bz - 22, 0.8 + (i % 3) * 0.12);
    this.mapBuildings.push({ x: bx, z: bz, w: 44, d: 34, h: 32, color: '#e8c9a0' });
  };

  World.prototype.buildCobaltTower = function (bx, bz) {
    var district = { id: 'alto', name: 'ALTO MAR' };
    var shell = new U.MeshBuilder();
    var h = 112;
    shell.box(bx, 0.5 + h / 2, bz, 44, h, 44, '#87b7bf', 0, false);
    shell.box(bx, 0.5 + h + 10, bz, 32, 20, 32, '#9fcbd0', 0, false);
    shell.box(bx, 0.5 + h + 23, bz, 20, 6, 20, '#b7d7d6', 0, false);
    shell.box(bx, 0.5 + h + 29, bz, 3, 14, 3, '#d8e9e3', 0, false);
    var sm = shell.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    sm.castShadow = true; sm.receiveShadow = true;
    this.scene.add(sm);

    var win = new U.MeshBuilder();
    var glass = new THREE.Color('#2e6671');
    var glass2 = new THREE.Color('#d7c178');
    for (var f = 0; f < 32; f++) {
      for (var c = 0; c < 12; c++) {
        var y = 5 + f * 3.2;
        var xx = bx - 18 + c * 3.2;
        var col = (f + c) % 11 === 0 ? glass2 : glass;
        var face = { nx: 0, nz: 1, x: bx, z: bz + 22.02, span: 44, rot: 0 };
        this.addWindowQuad(win, face, xx - bx, y, 1.8, 1.7, col);
        var face2 = { nx: 1, nz: 0, x: bx + 22.02, z: bz, span: 44, rot: Math.PI / 2 };
        this.addWindowQuad(win, face2, xx - bx, y, 1.8, 1.7, col);
      }
      var y2 = 5 + f * 3.2;
      if (f < 6) {
        var face3 = { nx: 0, nz: -1, x: bx, z: bz - 22.02, span: 44 };
        this.addWindowQuad(win, face3, (f * 5) % 30 - 15, y2, 4, 1.7, glass);
      }
    }
    var wm = win.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.scene.add(wm);
    var roof = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 3, 8), new THREE.MeshLambertMaterial({ color: 0xd7e3dc }));
    roof.position.set(bx, 118, bz); roof.castShadow = true; this.scene.add(roof);
    this.addSignMesh(U.signTexture(['COBALT'], { width: 768, height: 192, bg: '#e9f2e8', color: '#28545d', size: 90, caption: 'ALTO MAR' }), bx, 110, bz + 22.3, 24, 6.5, 0, '#ffffff');

    var lobby = new U.MeshBuilder();
    lobby.box(bx, 3.2, bz + 23, 28, 6, 2.5, '#1a3e45');
    lobby.box(bx - 15, 4.7, bz + 24, 1.2, 9, 1.2, '#d5e0d6');
    lobby.box(bx + 15, 4.7, bz + 24, 1.2, 9, 1.2, '#d5e0d6');
    lobby.box(bx, 9.2, bz + 24, 32, 0.7, 1.4, '#d5e0d6');
    var lm = lobby.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    lm.castShadow = true; this.scene.add(lm);
    this.colliders.push({ minX: bx - 22, maxX: bx + 22, minZ: bz - 22, maxZ: bz + 22, height: 140, kind: 'tower' });
    this.addPalm(bx - 28, 0.26, bz + 25, 1.1);
    this.addPalm(bx + 28, 0.26, bz + 25, 1.1);
    this.mapBuildings.push({ x: bx, z: bz, w: 46, d: 46, h: 112, color: '#7eb4bd' });
  };

  World.prototype.buildEstate = function (bx, bz) {
    var villa = this.addBuilding(bx + 6, bz - 4, 34, 24, 10, '#f0ddba', { id: 'vista', name: 'VISTA HILLS' }, this.blockRng('estate'), 0);
    var b = new U.MeshBuilder();
    b.box(bx + 6, 11.5, bz - 4, 35, 1.4, 25, '#d9bd91');
    b.box(bx + 6, 13, bz - 4, 18, 3.2, 13, '#dcbf92');
    b.box(bx - 22, 2.3, bz + 20, 1.2, 4.2, 34, '#e9d7b2');
    b.box(bx + 6, 2.3, bz + 34, 40, 4.2, 1.2, '#e9d7b2');
    b.box(bx + 32, 2.3, bz + 20, 1.2, 4.2, 34, '#e9d7b2');
    var m = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    var gate = new U.MeshBuilder();
    gate.box(bx + 6, 3.4, bz + 34, 12, 6.8, 1.3, '#274d4c');
    gate.box(bx + 6, 7.2, bz + 34, 14, 0.8, 1.8, '#d4bd8b');
    var gm = gate.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    gm.castShadow = true; this.scene.add(gm);
    this.colliders.push({ minX: bx - 22.6, maxX: bx + 32.6, minZ: bz + 19.4, maxZ: bz + 20.6, height: 4, kind: 'wall' });
    this.colliders.push({ minX: bx - 22.6, maxX: bx - 21.4, minZ: bz + 3, maxZ: bz + 35, height: 4, kind: 'wall' });
    this.colliders.push({ minX: bx + 31.4, maxX: bx + 32.6, minZ: bz + 3, maxZ: bz + 35, height: 4, kind: 'wall' });
    var pool = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshBasicMaterial({ color: 0x4fbfc3 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(bx - 10, 0.35, bz + 4); this.scene.add(pool);
    for (var i = 0; i < 6; i++) this.addPalm(bx - 22 + i * 9, 0.26, bz + 25, 1.0 + (i % 2) * 0.18);
    this.addPalm(bx + 30, 0.26, bz - 12, 1.2);
    this.addSignMesh(U.signTexture(['CASA', 'MIRAMAR'], { width: 512, height: 256, bg: '#e8d8b6', color: '#264c4b', size: 72, caption: 'PRIVATE ESTATE' }), bx + 6, 6.9, bz + 34.8, 6.2, 3.1, 0);
    this.mapBuildings.push({ x: bx + 6, z: bz - 4, w: 36, d: 26, h: 12, color: '#e4cfaa' });
  };

  World.prototype.buildMarinaBlock = function (bx, bz) {
    var b = new U.MeshBuilder();
    b.box(bx - 10, 4, bz - 4, 34, 8, 28, '#d8c7a1');
    b.box(bx - 10, 8.5, bz - 4, 26, 1.1, 22, '#9dbfb3');
    b.box(bx - 10, 11, bz - 12, 12, 4, 8, '#f0d7ab');
    b.box(bx + 21, 2.5, bz + 12, 18, 5, 18, '#b8a880');
    var m = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    this.colliders.push({ minX: bx - 27, maxX: bx + 7, minZ: bz - 18, maxZ: bz + 10, height: 13, kind: 'building' });
    this.colliders.push({ minX: bx + 12, maxX: bx + 30, minZ: bz + 3, maxZ: bz + 21, height: 6, kind: 'building' });
    this.addSignMesh(U.signTexture(['MARINA', 'NUEVA'], { width: 512, height: 256, bg: '#f2e3c4', color: '#2a6667', size: 62, caption: 'DOCKS · FUEL · ICE' }), bx - 10, 9.2, bz + 10.2, 12, 4.2, 0);
    for (var i = 0; i < 5; i++) this.addPalm(bx - 22 + i * 12, 0.26, bz + 24, 0.8 + 0.05 * i);
    var dock = new THREE.Mesh(new THREE.BoxGeometry(64, 0.5, 9), this.woodMat);
    dock.position.set(bx, 0.31, bz + 33); dock.receiveShadow = true; this.scene.add(dock);
    this.mapBuildings.push({ x: bx - 10, z: bz - 4, w: 36, d: 30, h: 12, color: '#d8c6a0' });
  };

  World.prototype.buildGarage = function (bx, bz) {
    var b = new U.MeshBuilder();
    b.box(bx - 13, 4.5, bz - 8, 34, 9, 26, '#b65f4f');
    b.box(bx - 13, 9.4, bz - 8, 36, 1.2, 28, '#e8d5ae');
    b.box(bx + 19, 3.8, bz + 10, 20, 7.6, 20, '#3d706c');
    b.box(bx - 13, 3, bz + 7.2, 18, 6, 0.5, '#193c3d');
    var m = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    this.colliders.push({ minX: bx - 30, maxX: bx + 4, minZ: bz - 21, maxZ: bz + 5, height: 10, kind: 'garage' });
    this.colliders.push({ minX: bx + 9, maxX: bx + 29, minZ: bz, maxZ: bz + 20, height: 8, kind: 'garage' });
    this.addSignMesh(U.signTexture(['VELA', 'MOTORS'], { width: 512, height: 256, bg: '#f0dfbc', color: '#9c3c31', size: 72, caption: "ROSA'S GARAGE · EST. 1989" }), bx - 13, 9.5, bz + 5.2, 12, 4.6, 0);
    var stripes = new U.MeshBuilder();
    for (var i = 0; i < 6; i++) stripes.plane(bx + 2 + i * 4, 0.04, bz + 20, 2, 24, i % 2 ? '#e9c45b' : '#2f3b3b');
    var sm = stripes.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    sm.receiveShadow = true; this.scene.add(sm);
    for (i = 0; i < 3; i++) this.addPalm(bx + 22 + i * 4, 0.26, bz - 21, 0.8);
    this.mapBuildings.push({ x: bx - 13, z: bz - 8, w: 36, d: 28, h: 10, color: '#b65f4f' });
  };

  World.prototype.buildContainerYard = function (bx, bz) {
    var colors = ['#b95c49', '#3e7f80', '#d5b15c', '#668b70', '#b9b0a0'];
    var b = new U.MeshBuilder();
    for (var i = 0; i < 13; i++) {
      var x = bx - 20 + (i % 5) * 10;
      var z = bz - 18 + Math.floor(i / 5) * 15;
      var y = 1.8 + (i % 3) * 0.4;
      b.box(x, y, z, 9.2, 3.1, 5.2, colors[i % colors.length], (i % 2) * 0.08);
      if (i % 4 === 0) b.box(x, y + 1.7, z, 9.2, 0.18, 5.2, '#e0d6bd');
      this.colliders.push({ minX: x - 4.6, maxX: x + 4.6, minZ: z - 2.6, maxZ: z + 2.6, height: 4, kind: 'container' });
    }
    var m = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    var crane = new U.MeshBuilder();
    crane.box(bx + 24, 13, bz - 8, 1.2, 26, 1.2, '#d2a94e');
    crane.box(bx + 15, 25.5, bz - 8, 19, 1.1, 1.1, '#d2a94e');
    crane.box(bx + 6, 24, bz - 8, 0.5, 8, 0.5, '#343b38');
    var cm = crane.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    cm.castShadow = true; this.scene.add(cm);
    this.addSignMesh(U.signTexture(['PUERTO', 'LUME'], { width: 512, height: 256, bg: '#e6d4ae', color: '#1e4b4d', size: 66, caption: 'CARGO · 24 HRS' }), bx, 7.5, bz + 25, 9, 4.2, 0);
    this.mapBuildings.push({ x: bx, z: bz, w: 50, d: 44, h: 12, color: '#7a8c82' });
  };

  World.prototype.buildPark = function (bx, bz) {
    var grass = new THREE.Mesh(new THREE.PlaneGeometry(58, 58), new THREE.MeshLambertMaterial({ color: 0x6e9b5c }));
    grass.rotation.x = -Math.PI / 2; grass.position.set(bx, 0.27, bz);
    grass.receiveShadow = true; this.scene.add(grass);
    var path = new THREE.Mesh(new THREE.PlaneGeometry(58, 6), new THREE.MeshLambertMaterial({ color: 0xd2bd95 }));
    path.rotation.x = -Math.PI / 2; path.position.set(bx, 0.285, bz);
    this.scene.add(path);
    var path2 = new THREE.Mesh(new THREE.PlaneGeometry(6, 58), new THREE.MeshLambertMaterial({ color: 0xd2bd95 }));
    path2.rotation.x = -Math.PI / 2; path2.position.set(bx, 0.286, bz);
    this.scene.add(path2);
    var b = new U.MeshBuilder();
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * Math.PI * 2;
      b.box(bx + Math.cos(a) * 16, 0.75, bz + Math.sin(a) * 16, 2.4, 0.35, 0.8, '#7d5b40', -a);
    }
    var bm = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    bm.castShadow = true; bm.receiveShadow = true; this.scene.add(bm);
    for (i = 0; i < 9; i++) this.addPalm(bx - 23 + (i % 3) * 23, 0.27, bz - 23 + Math.floor(i / 3) * 23, 0.75 + (i % 3) * 0.08);
    this.mapBuildings.push({ x: bx, z: bz, w: 58, d: 58, h: 0.3, color: '#6e9b5c' });
  };

  World.prototype.buildPoliceBlock = function (bx, bz) {
    var bld = this.addBuilding(bx, bz, 36, 26, 17, '#d9d5c3', { id: 'vista', name: 'VISTA HILLS' }, this.blockRng('pd'), 0);
    var b = new U.MeshBuilder();
    b.box(bx, 18.5, bz, 40, 1.2, 30, '#b7b4a4');
    b.box(bx - 14, 2.7, bz + 15, 6, 5.4, 4, '#213b48');
    b.box(bx + 14, 2.7, bz + 15, 6, 5.4, 4, '#213b48');
    var m = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = true; this.scene.add(m);
    this.addSignMesh(U.signTexture(['MARISOL', 'POLICE'], { width: 512, height: 256, bg: '#e8e2d2', color: '#1c3f54', size: 58, caption: 'PROTECT · SERVE · COLLECT' }), bx, 11, bz + 13.2, 13, 4.8, 0);
    for (var i = 0; i < 4; i++) this.addPalm(bx - 18 + i * 12, 0.26, bz - 20, 0.9);
    this.mapBuildings.push({ x: bx, z: bz, w: 38, d: 28, h: 18, color: '#cfcaba' });
  };

  World.prototype.buildMarketBlock = function (bx, bz) {
    var b = new U.MeshBuilder();
    var colors = ['#d85444', '#e4b249', '#438c83', '#b86b3c'];
    for (var i = 0; i < 4; i++) {
      var x = bx - 20 + (i % 2) * 32, z = bz - 18 + Math.floor(i / 2) * 30;
      b.box(x, 3.5, z, 20, 6, 18, '#e5cfaa');
      b.box(x, 7.2, z, 22, 1.4, 20, colors[i]);
      b.box(x, 8.3, z, 17, 0.8, 15, colors[(i + 2) % 4]);
      this.colliders.push({ minX: x - 10, maxX: x + 10, minZ: z - 9, maxZ: z + 9, height: 9, kind: 'market' });
    }
    var m = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    var stalls = new U.MeshBuilder();
    for (i = 0; i < 6; i++) {
      var sx = bx - 20 + (i % 3) * 20, sz = bz + 3 + Math.floor(i / 3) * 14;
      stalls.box(sx, 1.7, sz, 7, 0.3, 4.5, colors[i % 4]);
      stalls.box(sx, 0.9, sz, 6.8, 0.3, 0.45, '#5d4633');
      stalls.box(sx - 3.2, 0.8, sz, 0.16, 1.6, 3.8, '#5d4633');
      stalls.box(sx + 3.2, 0.8, sz, 0.16, 1.6, 3.8, '#5d4633');
    }
    var stm = stalls.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    stm.castShadow = true; stm.receiveShadow = true; this.scene.add(stm);
    this.addSignMesh(U.signTexture(['MERCADO', 'VIEJO'], { width: 512, height: 256, bg: '#f3d7a2', color: '#77392e', size: 64, caption: 'FRUIT · FISH · FAVORS' }), bx, 9.5, bz + 22, 11, 4.5, -Math.PI);
    for (i = 0; i < 5; i++) this.addPalm(bx - 24 + i * 12, 0.26, bz + 25, 0.8);
    this.mapBuildings.push({ x: bx, z: bz, w: 50, d: 50, h: 9, color: '#d7b27a' });
  };

  /* ------------------------------------------------------------- beach etc. */

  World.prototype.buildBeach = function () {
    var beach = new THREE.Mesh(new THREE.PlaneGeometry(W.beachEnd - W.beachStart, 1000, 1, 1), this.sandMat);
    beach.rotation.x = -Math.PI / 2;
    beach.position.set((W.beachStart + W.beachEnd) / 2, 0.01, 0);
    beach.receiveShadow = true;
    this.scene.add(beach);

    var board = new THREE.Mesh(new THREE.BoxGeometry(8, 0.24, 1000), this.woodMat);
    board.position.set(-396, 0.12, 0);
    board.receiveShadow = true;
    this.scene.add(board);

    var oceanGeo = new THREE.PlaneGeometry(1000, 1500, 40, 40);
    var oceanMat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        deepColor: { value: new THREE.Color(0x0b5363) },
        shallowColor: { value: new THREE.Color(0x2bb7b2) },
        sunDir: { value: this.sunDir.clone() },
        sunColor: { value: new THREE.Color(0xffd28b) }
      },
      vertexShader: OCEAN_VERT,
      fragmentShader: OCEAN_FRAG,
      side: THREE.DoubleSide,
      fog: false
    });
    var ocean = new THREE.Mesh(oceanGeo, oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(-970, W.seaLevel, 0);
    this.scene.add(ocean);
    this.oceanMat = oceanMat;

    var foam = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 1000),
      new THREE.MeshBasicMaterial({ color: 0xd7f1e9, transparent: true, opacity: 0.46 })
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(-474, W.seaLevel + 0.03, 0);
    this.scene.add(foam);

    this.addLifeguard(-428, 154);
    this.addLifeguard(-428, -212);
    this.buildBeachProps();
    this.buildLighthouse(-438, -350);
    this.addSignMesh(U.signTexture(['PLAYA', 'CLARA'], { width: 512, height: 256, bg: '#f2ddb5', color: '#1f5f64', size: 72, borderColor: '#d97a5a', caption: 'PUBLIC BEACH · MARISOL' }), -408, 5.6, 68, 9.5, 4.2, Math.PI / 2);
    this.addSignMesh(U.signTexture(['MARISOL'], { width: 768, height: 192, bg: 'rgba(8,30,32,0.86)', color: '#f5d48d', size: 96, borderColor: '#f5d48d', border: true }), -405, 6.5, 286, 17, 4.2, Math.PI / 2);
    var beachPosts = new U.MeshBuilder();
    beachPosts.box(-408, 3.35, 63.3, 0.22, 6.7, 0.22, '#4e5b55');
    beachPosts.box(-408, 3.35, 72.7, 0.22, 6.7, 0.22, '#4e5b55');
    beachPosts.box(-405, 4.2, 282.2, 0.22, 8.4, 0.22, '#254c50');
    beachPosts.box(-405, 4.2, 289.8, 0.22, 8.4, 0.22, '#254c50');
    var bpm = beachPosts.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    bpm.castShadow = true;
    this.scene.add(bpm);
  };

  World.prototype.buildBeachProps = function () {
    var rng = U.mulberry32(7123);
    var umbrellaColors = ['#ff6f5e', '#39c7ba', '#f4c653', '#f1e5cf'];
    for (var i = 0; i < 18; i++) {
      var x = -420 - rng() * 46, z = -430 + rng() * 840;
      var color = umbrellaColors[i % umbrellaColors.length];
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3, 5), new THREE.MeshLambertMaterial({ color: 0x765c41 }));
      pole.position.set(x, 1.5, z);
      this.scene.add(pole);
      var top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 0.9, 10), new THREE.MeshLambertMaterial({ color: color }));
      top.position.set(x, 3.1, z);
      top.castShadow = true;
      this.scene.add(top);
      var towel = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.4), new THREE.MeshLambertMaterial({ color: color }));
      towel.rotation.x = -Math.PI / 2;
      towel.position.set(x + 2.2, 0.045, z + 0.5);
      this.scene.add(towel);
    }
    var b = new U.MeshBuilder();
    for (i = 0; i < 8; i++) {
      var bx = -421 - (i % 4) * 12, bz = -320 + Math.floor(i / 4) * 34;
      b.box(bx, 0.8, bz, 4, 0.25, 2.4, '#e4c38d');
    }
    var m = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = true; this.scene.add(m);
  };

  World.prototype.addLifeguard = function (x, z) {
    var g = new THREE.Group();
    var legMat = new THREE.MeshLambertMaterial({ color: 0xcfb58b });
    for (var i = 0; i < 4; i++) {
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.2, 0.3), legMat);
      leg.position.set((i % 2 ? 1 : -1) * 2.4, 2.1, (i < 2 ? 1 : -1) * 1.9);
      leg.castShadow = true;
      g.add(leg);
    }
    var hut = new THREE.Mesh(new THREE.BoxGeometry(6.5, 3.4, 5), new THREE.MeshLambertMaterial({ color: 0xeed3a1 }));
    hut.position.y = 5.9; hut.castShadow = true; g.add(hut);
    var roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 1.4, 4), new THREE.MeshLambertMaterial({ color: 0xd85849 }));
    roof.rotation.y = Math.PI / 4; roof.position.y = 8.3; roof.castShadow = true; g.add(roof);
    var ramp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 8), new THREE.MeshLambertMaterial({ color: 0xb6a17b }));
    ramp.position.set(3.2, 2.1, 0); ramp.rotation.z = -0.3; g.add(ramp);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.colliders.push({ minX: x - 4, maxX: x + 4, minZ: z - 3.5, maxZ: z + 3.5, height: 3, kind: 'lifeguard', minY: 4.2 });
  };

  World.prototype.buildLighthouse = function (x, z) {
    var g = new THREE.Group();
    for (var i = 0; i < 6; i++) {
      var r = 3.4 - i * 0.35;
      var seg = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.25, 3.2, 12), new THREE.MeshLambertMaterial({ color: i % 2 ? 0xf1e2c4 : 0xc95243 }));
      seg.position.y = 1.7 + i * 3.1; seg.castShadow = true; g.add(seg);
    }
    var lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.8, 8), new THREE.MeshLambertMaterial({ color: 0xffe4a1, emissive: 0xffb238, emissiveIntensity: 0.8 }));
    lamp.position.y = 20; g.add(lamp);
    var cap = new THREE.Mesh(new THREE.ConeGeometry(2, 2, 8), new THREE.MeshLambertMaterial({ color: 0x214848 }));
    cap.position.y = 22.2; g.add(cap);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.colliders.push({ minX: x - 4, maxX: x + 4, minZ: z - 4, maxZ: z + 4, height: 24, kind: 'lighthouse' });
  };

  World.prototype.buildPier = function () {
    var deck = new THREE.Mesh(new THREE.BoxGeometry(112, 0.8, 34), this.woodMat);
    deck.position.set(-458, 0.32, 304);
    deck.receiveShadow = true;
    this.scene.add(deck);
    var rails = new U.MeshBuilder();
    for (var i = 0; i < 24; i++) {
      rails.box(-514 + i * 4.8, 1.4, 288, 0.18, 2, 0.18, '#e6d3ad');
      rails.box(-514 + i * 4.8, 1.4, 320, 0.18, 2, 0.18, '#e6d3ad');
    }
    rails.box(-458, 2.35, 288, 112, 0.18, 0.18, '#e6d3ad');
    rails.box(-458, 2.35, 320, 112, 0.18, 0.18, '#e6d3ad');
    var rm = rails.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    rm.castShadow = true; this.scene.add(rm);

    var wheel = new THREE.Group();
    var rim = new THREE.Mesh(new THREE.TorusGeometry(17, 0.45, 7, 44), new THREE.MeshLambertMaterial({ color: 0xfff0c8 }));
    rim.castShadow = true; wheel.add(rim);
    var spokes = new U.MeshBuilder();
    for (i = 0; i < 12; i++) {
      var a = i / 12 * Math.PI * 2;
      spokes.box(Math.cos(a) * 8.5, Math.sin(a) * 8.5, 0, 0.22, 17, 0.22, '#f0dfb9', 0);
    }
    var hub = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.4, 10), new THREE.MeshLambertMaterial({ color: 0xffd36d }));
    hub.rotation.x = Math.PI / 2; wheel.add(hub);
    var sm = spokes.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    sm.rotation.z = 0; wheel.add(sm);
    var gondolaColors = ['#ff6f5e', '#37c9bb', '#f6c654', '#f4e6cd', '#457a94'];
    for (i = 0; i < 12; i++) {
      var ga = i / 12 * Math.PI * 2;
      var gond = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.7, 1.8), new THREE.MeshLambertMaterial({ color: gondolaColors[i % gondolaColors.length] }));
      gond.position.set(Math.cos(ga) * 17, Math.sin(ga) * 17, 0);
      gond.castShadow = true;
      wheel.add(gond);
    }
    wheel.position.set(-466, 19, 305);
    this.scene.add(wheel);
    this.ferris = wheel;
    var support = new U.MeshBuilder();
    support.box(-466, 9.5, 289.5, 0.8, 19, 0.8, '#e5d2a9');
    support.box(-466, 9.5, 320.5, 0.8, 19, 0.8, '#e5d2a9');
    support.box(-466, 18.5, 305, 0.5, 0.5, 32, '#e5d2a9');
    support.box(-466, 1.2, 305, 4, 1.5, 34, '#c69b67');
    var sp = support.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    sp.castShadow = true; this.scene.add(sp);

    var stalls = new U.MeshBuilder();
    var sc = ['#e75f4d', '#3abeb1', '#f1c145'];
    for (i = 0; i < 5; i++) {
      stalls.box(-430 + i * 8, 1.6, 318, 5.4, 0.3, 3, sc[i % sc.length]);
      stalls.box(-430 + i * 8, 0.8, 318, 0.2, 1.5, 2.7, '#5d4734');
    }
    var stm = stalls.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    stm.castShadow = true; this.scene.add(stm);

    /* string lights along the pier */
    var wirePositions = [];
    var bulbs = new U.MeshBuilder();
    var lightZ = [291.5, 318.5];
    for (var li = 0; li < lightZ.length; li++) {
      var wz = lightZ[li];
      var prev = null;
      for (var lx = -506; lx <= -404; lx += 4) {
        var sag = 0.45 + Math.sin((lx + 506) / 102 * Math.PI) * 0.55;
        var ly = 5.2 - sag;
        if (prev) {
          wirePositions.push(prev.x, prev.y, prev.z, lx, ly, wz);
        }
        prev = { x: lx, y: ly, z: wz };
        bulbs.box(lx, ly - 0.14, wz, 0.14, 0.22, 0.14, '#ffd890');
      }
      for (var px = -506; px <= -404; px += 51) {
        rails.box(px, 2.6, wz, 0.15, 5.2, 0.15, '#5a5145');
      }
    }
    var wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wirePositions, 3));
    var wire = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2b2a25, transparent: true, opacity: 0.7 }));
    this.scene.add(wire);
    var bulbMesh = bulbs.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.scene.add(bulbMesh);
    var stringGlow = new THREE.PointLight(0xffb95c, 0.55, 34, 2);
    stringGlow.position.set(-452, 4.8, 304);
    this.scene.add(stringGlow);

    this.addSignMesh(U.signTexture(['MUELLE', 'LUME'], { width: 512, height: 256, bg: '#f3dfb8', color: '#1e5960', size: 72, caption: 'THE OLD PIER · SINCE 1931' }), -414, 6.2, 304, 10, 4.2, Math.PI / 2);
    this.mapBuildings.push({ x: -458, z: 304, w: 112, d: 34, h: 0.8, color: '#a77f54' });
  };

  World.prototype.buildMarina = function () {
    var rng = U.mulberry32(5281);
    var colors = ['#f3e4c8', '#4c9a9d', '#e9795f', '#f3c659', '#46718a'];
    for (var i = 0; i < 10; i++) {
      var x = -456 - (i % 2) * 24, z = 372 + Math.floor(i / 2) * 23;
      var hull = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.4, 12), new THREE.MeshLambertMaterial({ color: colors[i % colors.length] }));
      hull.position.set(x, 0.9, z);
      hull.castShadow = true;
      this.scene.add(hull);
      var cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 4), new THREE.MeshLambertMaterial({ color: 0xf2e7cd }));
      cabin.position.set(x, 2.1, z - 1.2); cabin.castShadow = true; this.scene.add(cabin);
      var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7, 5), new THREE.MeshLambertMaterial({ color: 0xd9c79e }));
      mast.position.set(x, 5.2, z + 2); this.scene.add(mast);
    }
    var b = new U.MeshBuilder();
    for (i = 0; i < 10; i++) {
      var dz = 366 + i * 11;
      b.box(-448, 0.2, dz, 26, 0.35, 0.7, '#d0b481');
    }
    var m = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = true; this.scene.add(m);
  };

  /* --------------------------------------------------------------- furniture */

  World.prototype.buildPalmSet = function () {
    var baseX = -388;
    for (var i = 0; i < 21; i++) {
      this.addPalm(baseX, 0.24, -380 + i * 38, 0.9 + (i % 4) * 0.08);
      this.addPalm(-342, 0.26, -362 + i * 36, 0.8 + (i % 3) * 0.1);
    }
    for (i = 0; i < 12; i++) {
      this.addPalm(-344 + i * 62, 0.26, 22, 0.75 + (i % 3) * 0.08);
      this.addPalm(-344 + i * 62, 0.26, 74, 0.85 + (i % 2) * 0.1);
    }
    var b = new U.MeshBuilder();
    var rng = U.mulberry32(9941);
    for (i = 0; i < this.palms.length; i++) {
      var p = this.palms[i];
      var trunkH = (5.6 + rng() * 3.4) * p.s;
      this.addPalmInstance(i, p, trunkH);
      var top = p.y + trunkH;
      for (var l = 0; l < 7; l++) {
        var ang = (l / 7) * Math.PI * 2 + rng() * 0.3;
        this.addPalmLeaf(p.x, top, p.z, ang, 3.4 * p.s + rng() * 0.9, 0.55 + rng() * 0.35);
      }
      b.box(p.x, p.y + trunkH * 0.5, p.z, 0.34 * p.s, trunkH, 0.34 * p.s, '#8b6747', rng() * 0.2);
      this.colliders.push({ minX: p.x - 0.25, maxX: p.x + 0.25, minZ: p.z - 0.25, maxZ: p.z + 0.25, height: trunkH, kind: 'palm' });
    }
    this.palmTrunks = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.palmTrunks.castShadow = true;
    this.scene.add(this.palmTrunks);

    var leafGeo = this.makeLeafGeometry();
    var leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, vertexColors: false });
    var leaves = new THREE.InstancedMesh(leafGeo, leafMat, this.leafTransforms.length);
    leaves.castShadow = true;
    for (i = 0; i < this.leafTransforms.length; i++) {
      var t = this.leafTransforms[i];
      this._dummy.position.set(t.x, t.y, t.z);
      this._dummy.rotation.set(0, t.ry, t.tilt);
      this._dummy.scale.set(t.s, t.s, t.s);
      this._dummy.updateMatrix();
      leaves.setMatrixAt(i, this._dummy.matrix);
      this._color.set(i % 3 === 0 ? '#3f7f4b' : i % 3 === 1 ? '#326d43' : '#4c8e52');
      leaves.setColorAt(i, this._color);
    }
    leaves.instanceColor.needsUpdate = true;
    this.scene.add(leaves);
    this.palmLeaves = leaves;
  };

  World.prototype.addPalmInstance = function (i, p, trunkH) {
    p.trunkH = trunkH;
  };

  World.prototype.addPalmLeaf = function (x, y, z, ry, length, tilt) {
    if (!this.leafTransforms) this.leafTransforms = [];
    this.leafTransforms.push({ x: x, y: y, z: z, ry: ry, tilt: tilt, s: length / 4.2 });
  };

  World.prototype.makeLeafGeometry = function () {
    var pos = [];
    var segs = 5;
    var length = 4.2;
    for (var i = 0; i < segs; i++) {
      var t0 = i / segs, t1 = (i + 1) / segs;
      var z0 = t0 * length, z1 = t1 * length;
      var y0 = -t0 * t0 * 1.25, y1 = -t1 * t1 * 1.25;
      var w0 = Math.sin(t0 * Math.PI) * 0.55 + 0.04;
      var w1 = Math.sin(t1 * Math.PI) * 0.55 + 0.04;
      var a = [-w0, y0, z0], b = [w0, y0, z0], c = [-w1, y1, z1], d = [w1, y1, z1];
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      pos.push(b[0], b[1], b[2], d[0], d[1], d[2], c[0], c[1], c[2]);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };

  World.prototype.buildStreetFurniture = function () {
    var b = new U.MeshBuilder();
    var lamp = new U.MeshBuilder();
    var rng = U.mulberry32(12031);
    var positions = [];
    for (var i = 0; i < W.roadsZ.length; i++) {
      for (var j = -4; j <= 4; j++) {
        positions.push([-351, W.roadsZ[i] + 23 + j * 11]);
        positions.push([-369, W.roadsZ[i] - 23 + j * 11]);
        positions.push([-9, W.roadsZ[i] + 23 + j * 11]);
        positions.push([9, W.roadsZ[i] - 23 + j * 11]);
      }
    }
    for (i = 0; i < positions.length; i++) {
      var x = positions[i][0], z = positions[i][1];
      b.box(x, 2.8, z, 0.22, 5.6, 0.22, '#375a59');
      b.box(x, 5.55, z, 1.5, 0.16, 0.2, '#375a59');
      lamp.box(x, 5.38, z, 1.1, 0.18, 0.42, '#ffe4a5');
      if (i % 3 === 0) {
        b.box(x + (x < 0 ? 2 : -2), 1.7, z, 0.35, 3.4, 0.35, '#375a59');
      }
    }
    var m = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    var lm = lamp.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.scene.add(lm);

    var bench = new U.MeshBuilder();
    for (i = 0; i < 36; i++) {
      var bx = -380 + rng() * 760, bz = -380 + rng() * 760;
      if (Math.abs(bx) < 20 || Math.abs(bz) < 20) continue;
      bench.box(bx, 0.78, bz, 2.2, 0.18, 0.7, '#7c5a3c');
      bench.box(bx, 1.35, bz - 0.28, 2.2, 1.2, 0.12, '#7c5a3c');
      bench.box(bx - 0.8, 0.38, bz, 0.12, 0.7, 0.6, '#354443');
      bench.box(bx + 0.8, 0.38, bz, 0.12, 0.7, 0.6, '#354443');
    }
    var bm = bench.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    bm.castShadow = true; bm.receiveShadow = true; this.scene.add(bm);

    var planters = new U.MeshBuilder();
    for (i = 0; i < 18; i++) {
      var px = -320 + i * 38, pz = 32;
      planters.box(px, 0.7, pz, 2.8, 0.8, 1.2, '#b0624e');
      planters.box(px, 1.25, pz, 2.4, 0.3, 0.9, '#4e7b3a');
    }
    var pm = planters.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    pm.castShadow = true; this.scene.add(pm);
  };

  World.prototype.buildTrafficLights = function () {
    var b = new U.MeshBuilder();
    var lights = new U.MeshBuilder();
    var spots = [[-90, 0], [0, 90], [180, 0], [0, 180], [-180, -90], [90, -180], [270, 90], [-270, 270]];
    for (var i = 0; i < spots.length; i++) {
      var cx = spots[i][0], cz = spots[i][1];
      for (var k = 0; k < 4; k++) {
        var x = cx + (k === 0 ? -13 : k === 1 ? 13 : 0);
        var z = cz + (k === 2 ? -13 : k === 3 ? 13 : 0);
        b.box(x, 2.5, z, 0.2, 5, 0.2, '#315656');
        b.box(x, 4.9, z, 0.7, 1.7, 0.5, '#1c363a');
        lights.box(x, 5.25, z, 0.3, 0.3, 0.18, k % 2 ? '#ff5c4a' : '#58d06d');
      }
    }
    var m = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = true; this.scene.add(m);
    var lm = lights.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.scene.add(lm);
  };

  World.prototype.buildBirds = function () {
    var mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    for (var i = 0; i < 12; i++) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([-1.3, 0, 0, 0, 0.35, 0.4, 1.3, 0, 0], 3));
      var line = new THREE.Line(geo, mat);
      var a = i / 12 * Math.PI * 2;
      line.position.set(-300 + Math.cos(a) * 130, 38 + i % 4 * 5, 100 + Math.sin(a) * 120);
      line.userData = { a: a, speed: 0.08 + (i % 3) * 0.02, radius: 110 + (i % 5) * 14, y: line.position.y };
      this.scene.add(line);
      this.birds.push(line);
    }
  };

  /* ---------------------------------------------------------------- sky/time */

  World.prototype.setTime = function (minutes) {
    this.minutes = minutes;
    var dayT = ((minutes % 1440) + 1440) % 1440;
    var alt = Math.sin((dayT - 360) / 720 * Math.PI);
    var az = (dayT - 360) / 720 * Math.PI;
    var dir = new THREE.Vector3(Math.cos(az) * 0.92, Math.max(0.08, alt), Math.sin(az) * 0.28).normalize();
    this.sunDir.copy(dir);
    this.skyUniforms.sunDir.value.copy(dir);
    if (this.oceanMat) this.oceanMat.uniforms.sunDir.value.copy(dir);

    var daylight = U.clamp(alt * 1.8 + 0.16, 0.08, 1);
    var golden = U.clamp(1 - Math.abs(alt - 0.2) * 2.6, 0, 1);
    var night = U.clamp(-alt * 2.4, 0, 1);

    var horizon = new THREE.Color(0xf0c58e).lerp(new THREE.Color(0xff996d), golden * 0.6);
    horizon.lerp(new THREE.Color(0x182b47), night * 0.82);
    var top = new THREE.Color(0x2f83ad).lerp(new THREE.Color(0x295f91), golden * 0.28);
    top.lerp(new THREE.Color(0x071323), night * 0.88);
    this.skyUniforms.horizonColor.value.copy(horizon);
    this.skyUniforms.topColor.value.copy(top);
    this.skyUniforms.sunColor.value.set(0xffd391).lerp(new THREE.Color(0xff7e55), golden * 0.55);
    this.skyUniforms.haze.value = 0.12 + golden * 0.16;

    this.scene.fog.color.copy(horizon);
    this.scene.fog.near = 150;
    this.scene.fog.far = 740 - night * 190;

    var sunColor = new THREE.Color(0xfff2d5).lerp(new THREE.Color(0xffa065), golden * 0.64);
    sunColor.lerp(new THREE.Color(0x7f9dc7), night * 0.7);
    if (this.sun) {
      this.sun.color.copy(sunColor);
      this.sun.intensity = 0.12 + daylight * 2.7;
    }
    if (this.hemi) {
      this.hemi.intensity = 0.12 + daylight * 0.56;
      this.hemi.color.set(0xcde8ef).lerp(new THREE.Color(0x364e76), night * 0.7);
      this.hemi.groundColor.set(0xd9b482).lerp(new THREE.Color(0x1c2433), night * 0.75);
    }
    if (this.fill) this.fill.intensity = 0.16 + daylight * 0.3;
    if (this.clouds) {
      for (var ci = 0; ci < this.clouds.length; ci++) {
        this.clouds[ci].material.opacity = 0.18 + daylight * 0.38;
        this.clouds[ci].material.color.set(0xffe6c4).lerp(new THREE.Color(0x243a58), night * 0.8);
      }
    }
    if (this.sunSprite) {
      this.sunSprite.position.copy(dir).multiplyScalar(880);
      this.sunSprite.scale.setScalar(34 + golden * 62);
      this.sunSprite.material.opacity = 0.22 + daylight * 0.65;
    }
    this.daylight = daylight;
    this.updateSun(this.shadowTarget);
  };

  World.prototype.updateSun = function (target) {
    if (!this.sun) return;
    this.shadowTarget.copy(target || this.shadowTarget);
    this.sun.position.copy(this.shadowTarget).addScaledVector(this.sunDir, 230);
    this.sun.target.position.copy(this.shadowTarget);
    this.sun.target.updateMatrixWorld();
    var s = this.sun.shadow.camera;
    s.left = -W.shadowSize; s.right = W.shadowSize;
    s.top = W.shadowSize; s.bottom = -W.shadowSize;
    s.updateProjectionMatrix();
  };

  /* ---------------------------------------------------------------- helpers */

  World.prototype.groundHeight = function (x, z) {
    if (x < W.beachStart) return 0.03;
    if (x < -480) return -0.2;
    var onRoadX = false, onRoadZ = false;
    for (var i = 0; i < W.roadsX.length; i++) if (Math.abs(x - W.roadsX[i]) <= W.roadHalf) onRoadX = true;
    for (var j = 0; j < W.roadsZ.length; j++) if (Math.abs(z - W.roadsZ[j]) <= W.roadHalf) onRoadZ = true;
    if (onRoadX || onRoadZ) return 0;
    return W.sidewalkHeight;
  };

  World.prototype.isRoad = function (x, z) {
    for (var i = 0; i < W.roadsX.length; i++) if (Math.abs(x - W.roadsX[i]) <= W.roadHalf) return true;
    for (var j = 0; j < W.roadsZ.length; j++) if (Math.abs(z - W.roadsZ[j]) <= W.roadHalf) return true;
    return false;
  };

  World.prototype.onBeach = function (x, z) {
    return x < W.beachStart && x > -500;
  };

  World.prototype.districtLabel = function (x, z) {
    return this.districtAt(x, z).name;
  };

  World.prototype.resolveCircle = function (pos, radius, minY) {
    var hit = false;
    if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
    for (var i = 0; i < this.colliders.length; i++) {
      var b = this.colliders[i];
      if (!Number.isFinite(b.minX) || !Number.isFinite(b.minZ)) continue;
      if (minY != null && b.minY != null && minY > b.minY + b.height) continue;
      if (U.pushOutOfBox(pos, radius, b)) hit = true;
    }
    return hit;
  };

  World.prototype.clampToWorld = function (pos) {
    var limit = W.half - 14;
    pos.x = U.clamp(pos.x, -limit, limit);
    pos.z = U.clamp(pos.z, -limit, limit);
  };

  World.prototype.nearestPoint = function (x, z, radius) {
    var best = null, bd = radius * radius;
    for (var k in C.POINTS) {
      var p = C.POINTS[k];
      var d = U.dist2(x, z, p.x, p.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };

  World.prototype.update = function (dt, player) {
    this.time += dt;
    if (this.oceanMat) this.oceanMat.uniforms.time.value = this.time;
    if (this.ferris) this.ferris.rotation.z += dt * 0.075;
    for (var i = 0; i < this.birds.length; i++) {
      var b = this.birds[i];
      b.userData.a += dt * b.userData.speed;
      b.position.x = -300 + Math.cos(b.userData.a) * b.userData.radius;
      b.position.z = 100 + Math.sin(b.userData.a) * b.userData.radius;
      b.position.y = b.userData.y + Math.sin(this.time * 0.8 + i) * 1.6;
      b.rotation.y = -b.userData.a;
    }
    var target = player && player.pos ? player.pos : new THREE.Vector3(0, 0, 0);
    this.shadowTarget.set(target.x, 0, target.z);
    this.updateSun(this.shadowTarget);
  };

  World.prototype.cameraCollision = function (from, to, radius) {
    var pos = to.clone();
    var dir = pos.clone().sub(from);
    var len = dir.length();
    if (len < 0.001) return pos;
    dir.normalize();
    var steps = Math.ceil(len / 0.5);
    for (var i = 1; i <= steps; i++) {
      var t = i / steps;
      var x = from.x + dir.x * len * t;
      var z = from.z + dir.z * len * t;
      for (var j = 0; j < this.colliders.length; j++) {
        var b = this.colliders[j];
        if (U.circleRect(x, z, radius || 0.3, b) && from.y < b.height + (b.minY || 0)) {
          return new THREE.Vector3(from.x + dir.x * Math.max(0.5, len * (t - 0.08)), from.y + dir.y * Math.max(0.5, len * (t - 0.08)), from.z + dir.z * Math.max(0.5, len * (t - 0.08)));
        }
      }
    }
    return pos;
  };

  CH.World = World;
}());
