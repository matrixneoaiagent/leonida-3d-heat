/* COBALT HEAT — small shared utilities: math, deterministic random, merged meshes,
   procedural canvas textures and collision helpers. */
(function () {
  'use strict';

  var CH = window.CH = window.CH || {};
  var TAU = Math.PI * 2;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function invLerp(a, b, v) { return clamp((v - a) / (b - a), 0, 1); }
  function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function damp(current, target, lambda, dt) { return lerp(current, target, 1 - Math.exp(-lambda * dt)); }
  function approach(current, target, amount) {
    if (current < target) return Math.min(current + amount, target);
    return Math.max(current - amount, target);
  }
  function dist2(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
  function dist(ax, az, bx, bz) { return Math.sqrt(dist2(ax, az, bx, bz)); }
  function wrapAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }
  function angleTo(from, to) { return wrapAngle(to - from); }
  function dampAngle(current, target, lambda, dt) { return current + angleTo(current, target) * (1 - Math.exp(-lambda * dt)); }
  function pointAngle(ax, az, bx, bz) { return Math.atan2(bx - ax, bz - az); }
  function randRange(rng, a, b) { return a + (b - a) * rng(); }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function colorHex(c) {
    return typeof c === 'number' ? c : new THREE.Color(c).getHex();
  }

  function shade(color, mul) {
    var col = new THREE.Color(color);
    col.multiplyScalar(mul);
    return col;
  }

  /* ------------------------------------------------------------ merged meshes */

  function MeshBuilder() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.uvs = [];
    this.vertexCount = 0;
  }

  MeshBuilder.prototype.quad = function (a, b, c, d, normal, color) {
    var n = normal;
    var pts = [a, b, c, a, c, d];
    var col = color instanceof THREE.Color ? color : new THREE.Color(color);
    for (var i = 0; i < 6; i++) {
      var p = pts[i];
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.colors.push(col.r, col.g, col.b);
      this.uvs.push(i === 1 || i === 2 || i === 4 ? 1 : 0, i === 2 || i === 4 || i === 5 ? 1 : 0);
    }
    this.vertexCount += 6;
  };

  MeshBuilder.prototype.box = function (x, y, z, sx, sy, sz, color, ry, faceShade) {
    var hx = sx / 2, hy = sy / 2, hz = sz / 2;
    var c = Math.cos(ry || 0), s = Math.sin(ry || 0);
    var self = this;
    function P(px, py, pz) { return [x + px * c + pz * s, y + py, z - px * s + pz * c]; }
    var base = new THREE.Color(color);
    function C(f) {
      if (faceShade === false) return base;
      var k = f === 0 ? 1.1 : f === 1 ? 0.7 : f === 2 ? 1.0 : f === 3 ? 0.82 : 0.94;
      return base.clone().multiplyScalar(k);
    }
    var p000 = P(-hx, -hy, -hz), p100 = P(hx, -hy, -hz), p110 = P(hx, hy, -hz), p010 = P(-hx, hy, -hz);
    var p001 = P(-hx, -hy, hz), p101 = P(hx, -hy, hz), p111 = P(hx, hy, hz), p011 = P(-hx, hy, hz);
    var N = {
      top: P(0, hy, 0), bottom: P(0, -hy, 0),
      front: P(0, 0, hz), back: P(0, 0, -hz), left: P(-hx, 0, 0), right: P(hx, 0, 0)
    };
    function nrm(p, center) { return [p[0] - center[0], p[1] - center[1], p[2] - center[2]]; }
    var center = [x, y, z];
    this.quad(p011, p111, p110, p010, nrm(N.top, center), C(0));
    this.quad(p000, p100, p101, p001, nrm(N.bottom, center), C(5));
    this.quad(p001, p101, p111, p011, nrm(N.front, center), C(2));
    this.quad(p100, p000, p010, p110, nrm(N.back, center), C(3));
    this.quad(p000, p001, p011, p010, nrm(N.left, center), C(4));
    this.quad(p101, p100, p110, p111, nrm(N.right, center), C(5));
    return this;
  };

  MeshBuilder.prototype.plane = function (x, y, z, sx, sz, color, ry) {
    var hx = sx / 2, hz = sz / 2;
    var c = Math.cos(ry || 0), s = Math.sin(ry || 0);
    function P(px, pz) { return [x + px * c + pz * s, y, z - px * s + pz * c]; }
    this.quad(P(-hx, hz), P(hx, hz), P(hx, -hz), P(-hx, -hz), [0, 1, 0], color);
    return this;
  };

  MeshBuilder.prototype.build = function (material) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  };

  /* -------------------------------------------------------------- 2D canvas */

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function textureFromCanvas(canvas, repeatX, repeatY, nearest) {
    var t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX || 1, repeatY || 1);
    t.anisotropy = 4;
    if (nearest) t.magFilter = THREE.NearestFilter;
    if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
    t.needsUpdate = true;
    return t;
  }

  function asphaltTexture() {
    var c = makeCanvas(256, 256), x = c.getContext('2d');
    x.fillStyle = '#393b3b'; x.fillRect(0, 0, 256, 256);
    var rng = mulberry32(8821);
    for (var i = 0; i < 6200; i++) {
      var v = 48 + Math.floor(rng() * 32);
      x.fillStyle = 'rgba(' + v + ',' + v + ',' + (v - 2) + ',' + (0.15 + rng() * 0.3) + ')';
      var s = rng() < 0.94 ? 1 : 2;
      x.fillRect(rng() * 256, rng() * 256, s, s);
    }
    x.strokeStyle = 'rgba(20,20,19,.28)'; x.lineWidth = 1;
    for (var k = 0; k < 14; k++) {
      x.beginPath();
      var x0 = rng() * 256, y0 = rng() * 256;
      x.moveTo(x0, y0);
      for (var j = 0; j < 5; j++) { x0 += (rng() - 0.5) * 26; y0 += rng() * 18; x.lineTo(x0, y0); }
      x.stroke();
    }
    return textureFromCanvas(c, 4, 22);
  }

  function sidewalkTexture() {
    var c = makeCanvas(256, 256), x = c.getContext('2d');
    x.fillStyle = '#c9b99e'; x.fillRect(0, 0, 256, 256);
    var rng = mulberry32(411);
    for (var i = 0; i < 1800; i++) {
      x.fillStyle = 'rgba(255,246,220,' + (rng() * 0.09) + ')';
      x.fillRect(rng() * 256, rng() * 256, 1 + rng() * 2, 1 + rng() * 2);
    }
    x.strokeStyle = 'rgba(105,92,73,.28)'; x.lineWidth = 2;
    for (var p = 0; p <= 256; p += 64) {
      x.beginPath(); x.moveTo(p, 0); x.lineTo(p, 256); x.stroke();
      x.beginPath(); x.moveTo(0, p); x.lineTo(256, p); x.stroke();
    }
    return textureFromCanvas(c, 2, 2);
  }

  function sandTexture() {
    var c = makeCanvas(256, 256), x = c.getContext('2d');
    x.fillStyle = '#eed8a9'; x.fillRect(0, 0, 256, 256);
    var rng = mulberry32(923);
    for (var i = 0; i < 4000; i++) {
      var v = rng() > 0.5 ? 255 : 120;
      x.fillStyle = 'rgba(' + v + ',' + (v - 20) + ',' + (v - 70) + ',' + (rng() * 0.12) + ')';
      x.fillRect(rng() * 256, rng() * 256, 1 + rng() * 2, 1 + rng() * 2);
    }
    x.strokeStyle = 'rgba(170,137,92,.16)'; x.lineWidth = 2;
    for (var y = 0; y < 256; y += 18) {
      x.beginPath();
      for (var xx = 0; xx <= 256; xx += 8) x.lineTo(xx, y + Math.sin(xx * 0.08 + y) * 3);
      x.stroke();
    }
    return textureFromCanvas(c, 6, 7);
  }

  function glowTexture(inner, outer) {
    var c = makeCanvas(128, 128), x = c.getContext('2d');
    var g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, inner || 'rgba(255,250,220,1)');
    g.addColorStop(0.35, outer || 'rgba(255,190,90,.55)');
    g.addColorStop(1, 'rgba(255,150,70,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return textureFromCanvas(c, 1, 1);
  }

  function signTexture(lines, opts) {
    opts = opts || {};
    var w = opts.width || 512, h = opts.height || 256;
    var c = makeCanvas(w, h), x = c.getContext('2d');
    if (opts.transparent) x.clearRect(0, 0, w, h);
    else {
      x.fillStyle = opts.bg || '#f8e9c7'; x.fillRect(0, 0, w, h);
      if (opts.border !== false) {
        x.strokeStyle = opts.borderColor || '#17353a';
        x.lineWidth = Math.max(5, w * 0.012);
        x.strokeRect(8, 8, w - 16, h - 16);
      }
    }
    var arr = Array.isArray(lines) ? lines : [lines];
    var family = opts.font || '"Arial Narrow", Impact, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    var start = h * (arr.length === 1 ? 0.53 : 0.34);
    var gap = h * (arr.length === 1 ? 0 : 0.34);
    for (var i = 0; i < arr.length; i++) {
      var line = arr[i];
      var size = opts.size || (i === 0 ? h * 0.36 : h * 0.16);
      if (i === 0 && arr.length > 1) size = opts.size || h * 0.3;
      x.font = (opts.weight || '900') + ' ' + size + 'px ' + family;
      x.fillStyle = opts.color || '#123238';
      if (opts.glow) { x.shadowColor = opts.glow; x.shadowBlur = 18; }
      x.fillText(line, w / 2, start + gap * i);
      x.shadowBlur = 0;
    }
    if (opts.caption) {
      x.font = '700 ' + (h * 0.095) + 'px ' + family;
      x.fillStyle = opts.captionColor || opts.color || '#123238';
      x.fillText(opts.caption, w / 2, h * 0.84);
    }
    return textureFromCanvas(c, 1, 1);
  }

  function radialTexture(stops) {
    var c = makeCanvas(64, 64), x = c.getContext('2d');
    var g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    (stops || [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]).forEach(function (s) { g.addColorStop(s[0], s[1]); });
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return textureFromCanvas(c, 1, 1);
  }

  function cloudTexture(seed) {
    var c = makeCanvas(512, 256), x = c.getContext('2d');
    var rng = mulberry32(seed || 4731);
    x.clearRect(0, 0, 512, 256);
    for (var i = 0; i < 32; i++) {
      var cx = 70 + rng() * 372;
      var cy = 110 + (rng() - 0.5) * 74;
      var rx = 34 + rng() * 78;
      var ry = 18 + rng() * 38;
      var g = x.createRadialGradient(cx, cy, 2, cx, cy, rx);
      g.addColorStop(0, 'rgba(255,247,230,' + (0.16 + rng() * 0.14) + ')');
      g.addColorStop(0.55, 'rgba(255,236,215,' + (0.06 + rng() * 0.06) + ')');
      g.addColorStop(1, 'rgba(255,230,210,0)');
      x.save();
      x.translate(cx, cy); x.scale(1, ry / rx); x.translate(-cx, -cy);
      x.fillStyle = g;
      x.beginPath(); x.arc(cx, cy, rx, 0, Math.PI * 2); x.fill();
      x.restore();
    }
    return textureFromCanvas(c, 1, 1);
  }

  function starTexture() {
    var c = makeCanvas(128, 128), x = c.getContext('2d');
    x.translate(64, 64);
    x.fillStyle = '#ffd06a';
    x.strokeStyle = '#fff5d0'; x.lineWidth = 4;
    x.beginPath();
    for (var i = 0; i < 10; i++) {
      var r = i % 2 === 0 ? 52 : 21;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      if (i === 0) x.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    x.closePath(); x.fill(); x.stroke();
    return textureFromCanvas(c, 1, 1);
  }

  /* --------------------------------------------------------------- collision */

  function boxContains(b, x, z, margin) {
    var m = margin || 0;
    return x > b.minX - m && x < b.maxX + m && z > b.minZ - m && z < b.maxZ + m;
  }

  function circleRect(px, pz, radius, b) {
    var cx = clamp(px, b.minX, b.maxX);
    var cz = clamp(pz, b.minZ, b.maxZ);
    var dx = px - cx, dz = pz - cz;
    return dx * dx + dz * dz < radius * radius;
  }

  function pushOutOfBox(pos, radius, b) {
    if (!pos || !b || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
    if (!Number.isFinite(radius) || radius <= 0) return false;
    if (!Number.isFinite(b.minX) || !Number.isFinite(b.maxX) || !Number.isFinite(b.minZ) || !Number.isFinite(b.maxZ)) return false;
    var cx = clamp(pos.x, b.minX, b.maxX);
    var cz = clamp(pos.z, b.minZ, b.maxZ);
    var dx = pos.x - cx, dz = pos.z - cz;
    var d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) return false;
    if (d2 > 0.00001) {
      var d = Math.sqrt(d2), push = radius - d;
      pos.x += dx / d * push; pos.z += dz / d * push;
    } else {
      var left = pos.x - b.minX, right = b.maxX - pos.x;
      var north = pos.z - b.minZ, south = b.maxZ - pos.z;
      var m = Math.min(left, right, north, south);
      if (m === left) pos.x = b.minX - radius;
      else if (m === right) pos.x = b.maxX + radius;
      else if (m === north) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    }
    return true;
  }

  function nearestRoad(value, roads) {
    if (!roads || !roads.length || !Number.isFinite(value)) return 0;
    var best = roads[0], bd = Infinity;
    for (var i = 0; i < roads.length; i++) {
      var d = Math.abs(value - roads[i]);
      if (d < bd) { bd = d; best = roads[i]; }
    }
    return best;
  }

  function laneHeading(axis) { return axis === 'z' ? 0 : Math.PI / 2; }

  function formatMoney(v) {
    var n = Math.max(0, Math.floor(v));
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatTime(seconds) {
    seconds = Math.max(0, Math.ceil(seconds));
    return pad(Math.floor(seconds / 60)) + ':' + pad(seconds % 60);
  }

  function formatClock(minutes) {
    minutes = ((minutes % 1440) + 1440) % 1440;
    return pad(Math.floor(minutes / 60)) + ':' + pad(Math.floor(minutes % 60));
  }

  CH.Util = {
    TAU: TAU, clamp: clamp, lerp: lerp, invLerp: invLerp, smoothstep: smoothstep, damp: damp,
    approach: approach, dist: dist, dist2: dist2, wrapAngle: wrapAngle, angleTo: angleTo,
    dampAngle: dampAngle, pointAngle: pointAngle, randRange: randRange, pick: pick, pad: pad,
    mulberry32: mulberry32, hashString: hashString, colorHex: colorHex, shade: shade,
    MeshBuilder: MeshBuilder, makeCanvas: makeCanvas, textureFromCanvas: textureFromCanvas,
    asphaltTexture: asphaltTexture, sidewalkTexture: sidewalkTexture, sandTexture: sandTexture,
    glowTexture: glowTexture, signTexture: signTexture, radialTexture: radialTexture,
    cloudTexture: cloudTexture,
    starTexture: starTexture, boxContains: boxContains, circleRect: circleRect,
    pushOutOfBox: pushOutOfBox, nearestRoad: nearestRoad, laneHeading: laneHeading,
    formatMoney: formatMoney, formatTime: formatTime, formatClock: formatClock
  };
}());

// Recording check: util module reviewed for the live capture.
