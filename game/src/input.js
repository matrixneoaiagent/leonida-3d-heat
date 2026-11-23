/* COBALT HEAT — keyboard and mouse input.
   Keeps held keys, one-shot presses, pointer-lock mouse deltas and drag-look fallback. */
(function () {
  'use strict';

  var CH = window.CH = window.CH || {};

  var BLOCK_DEFAULT = {
    KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1,
    Space: 1, ShiftLeft: 1, ShiftRight: 1, Tab: 1, Escape: 1, KeyE: 1, KeyR: 1, KeyQ: 1,
    KeyF: 1, KeyH: 1, KeyM: 1, Digit1: 1, Digit2: 1, Digit3: 1, Digit4: 1, KeyN: 1
  };

  function Input(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.pressed = {};
    this.released = {};
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.leftDown = false;
    this.rightDown = false;
    this.leftPressed = false;
    this.leftReleased = false;
    this.locked = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.enabled = true;
    this._bind();
  }

  Input.prototype._bind = function () {
    var self = this;
    window.addEventListener('keydown', function (e) {
      if (!self.enabled) return;
      if (BLOCK_DEFAULT[e.code]) e.preventDefault();
      if (!self.keys[e.code]) self.pressed[e.code] = true;
      self.keys[e.code] = true;
    }, { passive: false });

    window.addEventListener('keyup', function (e) {
      self.keys[e.code] = false;
      self.released[e.code] = true;
      if (BLOCK_DEFAULT[e.code]) e.preventDefault();
    }, { passive: false });

    window.addEventListener('blur', function () {
      self.clear();
    });

    this.canvas.addEventListener('mousedown', function (e) {
      if (!self.enabled) return;
      if (e.button === 0) { self.leftDown = true; self.leftPressed = true; }
      if (e.button === 2) { self.rightDown = true; }
      self.dragging = true;
      self.lastX = e.clientX; self.lastY = e.clientY;
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) { self.leftDown = false; self.leftReleased = true; self.dragging = false; }
      if (e.button === 2) self.rightDown = false;
    });
    window.addEventListener('mousemove', function (e) {
      if (!self.enabled) return;
      if (self.locked) {
        self.mouseDX += e.movementX || 0;
        self.mouseDY += e.movementY || 0;
      } else if (self.dragging) {
        self.mouseDX += e.clientX - self.lastX;
        self.mouseDY += e.clientY - self.lastY;
        self.lastX = e.clientX; self.lastY = e.clientY;
      }
    });
    this.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    this.canvas.addEventListener('wheel', function (e) {
      self.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('pointerlockchange', function () {
      self.locked = document.pointerLockElement === self.canvas;
      if (document.body) document.body.classList.toggle('pointer-locked', self.locked);
    });
  };

  Input.prototype.requestLock = function () {
    if (!this.canvas || this.locked) return;
    try {
      var p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* drag-look still works */ }
  };

  Input.prototype.exitLock = function () {
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch (e) { /* no-op */ }
    }
  };

  Input.prototype.isDown = function (code) {
    return !!this.keys[code];
  };

  Input.prototype.wasPressed = function (code) {
    return !!this.pressed[code];
  };

  Input.prototype.consume = function (code) {
    var v = !!this.pressed[code];
    this.pressed[code] = false;
    return v;
  };

  Input.prototype.consumeMouse = function () {
    var d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0; this.mouseDY = 0;
    return d;
  };

  Input.prototype.axisX = function () {
    return (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
  };

  Input.prototype.axisY = function () {
    return (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0) - (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0);
  };

  Input.prototype.sprint = function () {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  };

  Input.prototype.postUpdate = function () {
    this.pressed = {};
    this.released = {};
    this.leftPressed = false;
    this.leftReleased = false;
    this.wheel = 0;
  };

  Input.prototype.clear = function () {
    this.keys = {};
    this.pressed = {};
    this.released = {};
    this.mouseDX = 0; this.mouseDY = 0;
    this.leftDown = false; this.rightDown = false;
    this.leftPressed = false; this.leftReleased = false;
    this.wheel = 0;
  };

  CH.Input = Input;
}());

// Recording check: input module reviewed for the live capture.
