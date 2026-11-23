/* COBALT HEAT — visual effects.
   One pooled particle buffer for dust, sparks, blood and smoke, plus a line tracer pool. */
(function () {
  'use strict';

  var CH = window.CH = window.CH || {};
  var U = CH.Util;

  var VERT = [
    'attribute float size;',
    'attribute float alpha;',
    'attribute vec3 color;',
    'varying float vAlpha;',
    'varying vec3 vColor;',
    'void main() {',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = size * (340.0 / max(1.0, -mv.z));',
    '  gl_Position = projectionMatrix * mv;',
    '  vAlpha = alpha;',
    '  vColor = color;',
    '}'
  ].join('\n');
  var FRAG = [
    'uniform sampler2D map;',
    'varying float vAlpha;',
    'varying vec3 vColor;',
    'void main() {',
    '  vec4 t = texture2D(map, gl_PointCoord);',
    '  gl_FragColor = vec4(vColor, t.a * vAlpha);',
    '}'
  ].join('\n');

  function Effects(game) {
    this.game = game;
    this.max = 460;
    this.pos = new Float32Array(this.max * 3);
    this.color = new Float32Array(this.max * 3);
    this.size = new Float32Array(this.max);
    this.alpha = new Float32Array(this.max);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.maxLife = new Float32Array(this.max);
    this.drag = new Float32Array(this.max);
    this.gravity = new Float32Array(this.max);
    this.cursor = 0;

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.color, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geometry = geo;
    var map = U.radialTexture([[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]);
    var mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.game.scene.add(this.points);

    this.tracerMax = 48;
    this.tracerPos = new Float32Array(this.tracerMax * 6);
    this.tracerCol = new Float32Array(this.tracerMax * 6);
    this.tracerLife = new Float32Array(this.tracerMax);
    this.tracerCursor = 0;
    var tgeo = new THREE.BufferGeometry();
    tgeo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    tgeo.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3));
    this.tracers = new THREE.LineSegments(tgeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
    this.tracers.frustumCulled = false;
    this.tracers.renderOrder = 9;
    this.game.scene.add(this.tracers);

    this.flashes = [];
    this.flashTexture = U.glowTexture('rgba(255,252,220,1)', 'rgba(255,175,72,0.55)');
    this.skidMarks = [];
  }

  Effects.prototype.spawn = function (x, y, z, vx, vy, vz, color, size, life, gravity, drag) {
    var i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    var i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    var c = new THREE.Color(color);
    this.color[i3] = c.r; this.color[i3 + 1] = c.g; this.color[i3 + 2] = c.b;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.gravity[i] = gravity == null ? 9.8 : gravity;
    this.drag[i] = drag == null ? 1.2 : drag;
  };

  Effects.prototype.muzzle = function (x, y, z, dir, scale) {
    var i;
    for (i = 0; i < 7; i++) {
      this.spawn(x, y, z,
        dir.x * (2 + Math.random() * 4) + (Math.random() - 0.5) * 2,
        dir.y * 2 + (Math.random() - 0.5) * 1.5,
        dir.z * (2 + Math.random() * 4) + (Math.random() - 0.5) * 2,
        i < 4 ? '#ffe7a1' : '#ff9d4f', 0.18 + Math.random() * 0.22, 0.12 + Math.random() * 0.1, 0.2, 4);
    }
    var mat = new THREE.SpriteMaterial({ map: this.flashTexture, color: 0xffd68a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    var spr = new THREE.Sprite(mat);
    spr.position.set(x, y, z);
    spr.scale.setScalar((scale || 1) * (0.7 + Math.random() * 0.6));
    this.game.scene.add(spr);
    this.flashes.push({ sprite: spr, life: 0.07, maxLife: 0.07 });
  };

  Effects.prototype.tracer = function (from, to, color) {
    var i = this.tracerCursor;
    this.tracerCursor = (this.tracerCursor + 1) % this.tracerMax;
    var i6 = i * 6;
    this.tracerPos[i6] = from.x; this.tracerPos[i6 + 1] = from.y; this.tracerPos[i6 + 2] = from.z;
    this.tracerPos[i6 + 3] = to.x; this.tracerPos[i6 + 4] = to.y; this.tracerPos[i6 + 5] = to.z;
    var c = new THREE.Color(color || '#ffe4a0');
    this.tracerCol[i6] = c.r; this.tracerCol[i6 + 1] = c.g; this.tracerCol[i6 + 2] = c.b;
    this.tracerCol[i6 + 3] = c.r; this.tracerCol[i6 + 4] = c.g; this.tracerCol[i6 + 5] = c.b;
    this.tracerLife[i] = 0.09;
    this.tracers.geometry.attributes.position.needsUpdate = true;
    this.tracers.geometry.attributes.color.needsUpdate = true;
  };

  Effects.prototype.impact = function (x, y, z) {
    for (var i = 0; i < 8; i++) {
      this.spawn(x, y, z,
        (Math.random() - 0.5) * 5, 1 + Math.random() * 4, (Math.random() - 0.5) * 5,
        i < 3 ? '#ffe5a0' : '#b9a98b', 0.08 + Math.random() * 0.12, 0.3 + Math.random() * 0.3, 9.8, 0.7);
    }
    for (i = 0; i < 3; i++) {
      this.spawn(x, y, z, (Math.random() - 0.5) * 1.5, 0.8 + Math.random(), (Math.random() - 0.5) * 1.5,
        '#8f8a75', 0.3 + Math.random() * 0.3, 0.5 + Math.random() * 0.6, -0.4, 1.8);
    }
  };

  Effects.prototype.blood = function (x, y, z) {
    for (var i = 0; i < 7; i++) {
      this.spawn(x, y, z,
        (Math.random() - 0.5) * 3.2, 0.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3.2,
        i < 3 ? '#8f2430' : '#cc4b43', 0.08 + Math.random() * 0.12, 0.35 + Math.random() * 0.25, 8, 0.8);
    }
  };

  Effects.prototype.dust = function (x, y, z, amount) {
    for (var i = 0; i < (amount || 4); i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 1.4, 0.5 + Math.random() * 0.9, (Math.random() - 0.5) * 1.4,
        '#d7c8a8', 0.16 + Math.random() * 0.2, 0.35 + Math.random() * 0.3, 1.2, 2.1);
    }
  };

  Effects.prototype.smoke = function (x, y, z) {
    this.spawn(x + (Math.random() - 0.5) * 0.7, y, z + (Math.random() - 0.5) * 0.7,
      (Math.random() - 0.5) * 0.5, 1.2 + Math.random() * 1.2, (Math.random() - 0.5) * 0.5,
      '#3c3d38', 0.4 + Math.random() * 0.5, 0.8 + Math.random() * 0.8, -0.5, 0.8);
  };

  Effects.prototype.explosion = function (x, y, z) {
    for (var i = 0; i < 28; i++) {
      this.spawn(x, y, z,
        (Math.random() - 0.5) * 12, 2 + Math.random() * 8, (Math.random() - 0.5) * 12,
        i < 12 ? '#ffb24f' : i < 20 ? '#ff6a3a' : '#383632', 0.3 + Math.random() * 0.55, 0.7 + Math.random() * 0.9, 2.4, 0.9);
    }
    this.muzzle(x, y, z, new THREE.Vector3(0, 1, 0), 5);
  };

  Effects.prototype.skid = function (x, z, heading) {
    if (this.skidMarks.length > 40) {
      var old = this.skidMarks.shift();
      this.game.scene.remove(old);
      old.geometry.dispose();
      old.material.dispose();
    }
    var m = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 1.5), new THREE.MeshBasicMaterial({ color: 0x181a18, transparent: true, opacity: 0.35, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -heading;
    m.position.set(x, 0.04, z);
    this.game.scene.add(m);
    this.skidMarks.push(m);
    m.userData.life = 4;
  };

  Effects.prototype.update = function (dt) {
    var i;
    for (i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      var i3 = i * 3;
      this.vel[i3 + 1] -= this.gravity[i] * dt;
      var drag = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= drag; this.vel[i3 + 2] *= drag;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.alpha[i] = this.life[i] > 0 ? U.clamp(this.life[i] / this.maxLife[i], 0, 1) : 0;
      if (this.pos[i3 + 1] < 0.03) {
        this.pos[i3 + 1] = 0.03;
        this.vel[i3 + 1] *= -0.25;
        this.vel[i3] *= 0.6; this.vel[i3 + 2] *= 0.6;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;

    for (i = 0; i < this.tracerMax; i++) {
      if (this.tracerLife[i] > 0) {
        this.tracerLife[i] -= dt;
        if (this.tracerLife[i] <= 0) {
          var i6 = i * 6;
          this.tracerPos[i6 + 3] = this.tracerPos[i6];
          this.tracerPos[i6 + 4] = this.tracerPos[i6 + 1];
          this.tracerPos[i6 + 5] = this.tracerPos[i6 + 2];
        }
      }
    }
    this.tracers.geometry.attributes.position.needsUpdate = true;

    for (i = this.flashes.length - 1; i >= 0; i--) {
      var f = this.flashes[i];
      f.life -= dt;
      f.sprite.scale.multiplyScalar(1 + dt * 8);
      f.sprite.material.opacity = Math.max(0, f.life / f.maxLife);
      if (f.life <= 0) {
        this.game.scene.remove(f.sprite);
        f.sprite.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
    for (i = this.skidMarks.length - 1; i >= 0; i--) {
      var sk = this.skidMarks[i];
      sk.userData.life -= dt;
      sk.material.opacity = Math.max(0, sk.userData.life / 8) * 0.35;
      if (sk.userData.life <= 0) {
        this.game.scene.remove(sk);
        sk.geometry.dispose(); sk.material.dispose();
        this.skidMarks.splice(i, 1);
      }
    }
  };

  CH.Effects = Effects;
}());
