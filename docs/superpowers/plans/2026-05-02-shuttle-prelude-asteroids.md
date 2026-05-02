# Shuttle Prelude — Asteroids Homage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static shuttle SVG render in the `/level` prelude with a playable Asteroids-homage mini-game (vertical scroller, WASD strafe, SPACE shoot, splitting asteroids, blink-respawn on collision, cinematic finale on `ready()`).

**Architecture:** All work is in `index.html` inside the existing `ShuttleGame extends PreludeGame` class. The class already exists and renders the shuttle — we extend its state, add subsystems (asteroids, bullets, parallax stars, finale state machine), and update its `_update` / `_draw` methods. No source files outside `index.html` are touched.

**Tech Stack:** Vanilla JS (no module / no bundler — runs before Vue boots), Canvas 2D, Path2D for the shuttle art.

**Spec:** [`docs/superpowers/specs/2026-05-02-shuttle-prelude-asteroids-design.md`](../specs/2026-05-02-shuttle-prelude-asteroids-design.md)

**Testing strategy:** No automated tests — `CLAUDE.md` explicitly excludes Vue/Three/UI layers from the test suite, and this is inline browser code in `index.html`. Each task ends with manual browser verification on `http://localhost:9988/level` (or whatever port `bun dev` picks). Acceptance is "the described behavior is visible and feels right."

**Per-task workflow:**
1. Make the edit(s) shown in the task.
2. Run `bun dev` (if not already running).
3. Open `http://<host>/level` in a browser. Hard-refresh.
4. Verify the "Verify" criteria for the task.
5. Commit with the message shown.

---

## File Structure

Single file touched throughout this plan:

- **Modify:** `D:\Developer\asteroids\index.html`
  - All changes are inside the `ShuttleGame` class (constructor, `_onCanvasInit`, `_attachInput`, `_detachInput`, `_update`, `_draw`, plus new private methods).
  - All new tunables added as `static` fields on `ShuttleGame` (next to existing `STAR_COUNT`, `SHUTTLE_FIT_DIVISOR`, etc.).
  - **No** edits to `LanderGame`, `PreludeGame`, or anything outside the `ShuttleGame` block.

---

## Task 1: Interactive Shuttle (WASD + Thruster Particles)

**Files:**
- Modify: `D:\Developer\asteroids\index.html` — `ShuttleGame` class

**Goal:** Shuttle stops being a static centered drawing. It accepts WASD input, accelerates with momentum, drag pulls it to a stop when no key is held, and emits exhaust particles in the direction opposite to active thrust.

**State to add to constructor:**

```js
this.state = 'cruising'; // 'cruising' | 'finale' | 'exit'

// Shuttle position (canvas-space, CSS pixels). Initialised in _onCanvasInit.
this.shipX = 0;
this.shipY = 0;
this.shipVX = 0;
this.shipVY = 0;

// Input
this.keys = { up: false, down: false, left: false, right: false, fire: false };

// Particle exhaust
this.particles = [];

// Bound listeners (so detach can remove them)
this._boundKeyDown = this._handleKeyDown.bind(this);
this._boundKeyUp = this._handleKeyUp.bind(this);
```

**Replace existing `_onCanvasInit`** (currently just seeds stars) with:

```js
_onCanvasInit() {
  this.shipX = this.width / 2;
  this.shipY = this.height * ShuttleGame.SHIP_SPAWN_Y_RATIO;
  this.shipVX = 0;
  this.shipVY = 0;

  this.stars = [];
  for (let i = 0; i < ShuttleGame.STAR_COUNT; i++) {
    this.stars.push({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      brightness: Math.random() * 0.8 + 0.2,
    });
  }
}
```

**Add `_attachInput` / `_detachInput` overrides:**

```js
_attachInput() {
  window.addEventListener('keydown', this._boundKeyDown);
  window.addEventListener('keyup', this._boundKeyUp);
}

_detachInput() {
  window.removeEventListener('keydown', this._boundKeyDown);
  window.removeEventListener('keyup', this._boundKeyUp);
}

_handleKeyDown(e) {
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.keys.up = true;
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.keys.down = true;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.keys.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.keys.right = true;
  if (e.key === ' ' || e.code === 'Space') {
    this.keys.fire = true;
    e.preventDefault();
  }
}

_handleKeyUp(e) {
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.keys.up = false;
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.keys.down = false;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.keys.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.keys.right = false;
  if (e.key === ' ' || e.code === 'Space') this.keys.fire = false;
}
```

**Add `_updateShuttle(deltaSec)` private method:**

```js
_updateShuttle(deltaSec) {
  // X axis
  if (this.keys.left) {
    this.shipVX -= ShuttleGame.SHUTTLE_ACCEL * deltaSec;
  } else if (this.keys.right) {
    this.shipVX += ShuttleGame.SHUTTLE_ACCEL * deltaSec;
  } else if (this.shipVX > 0) {
    this.shipVX = Math.max(0, this.shipVX - ShuttleGame.SHUTTLE_DRAG * deltaSec);
  } else if (this.shipVX < 0) {
    this.shipVX = Math.min(0, this.shipVX + ShuttleGame.SHUTTLE_DRAG * deltaSec);
  }
  // Y axis
  if (this.keys.up) {
    this.shipVY -= ShuttleGame.SHUTTLE_ACCEL * deltaSec;
  } else if (this.keys.down) {
    this.shipVY += ShuttleGame.SHUTTLE_ACCEL * deltaSec;
  } else if (this.shipVY > 0) {
    this.shipVY = Math.max(0, this.shipVY - ShuttleGame.SHUTTLE_DRAG * deltaSec);
  } else if (this.shipVY < 0) {
    this.shipVY = Math.min(0, this.shipVY + ShuttleGame.SHUTTLE_DRAG * deltaSec);
  }

  this.shipVX = Math.max(-ShuttleGame.SHUTTLE_MAX_SPEED, Math.min(ShuttleGame.SHUTTLE_MAX_SPEED, this.shipVX));
  this.shipVY = Math.max(-ShuttleGame.SHUTTLE_MAX_SPEED, Math.min(ShuttleGame.SHUTTLE_MAX_SPEED, this.shipVY));

  this.shipX += this.shipVX * deltaSec;
  this.shipY += this.shipVY * deltaSec;

  // Clamp to canvas with a small inset.
  const inset = ShuttleGame.SHIP_EDGE_INSET;
  if (this.shipX < inset) { this.shipX = inset; this.shipVX = 0; }
  if (this.shipX > this.width - inset) { this.shipX = this.width - inset; this.shipVX = 0; }
  if (this.shipY < inset) { this.shipY = inset; this.shipVY = 0; }
  if (this.shipY > this.height - inset) { this.shipY = this.height - inset; this.shipVY = 0; }

  // Exhaust particle whenever a thrust key is held. Spawn opposite to thrust.
  const thrusting = this.keys.up || this.keys.down || this.keys.left || this.keys.right;
  if (thrusting && Math.random() < ShuttleGame.PARTICLE_SPAWN_CHANCE) {
    let px = 0, py = 0;
    if (this.keys.up)    { py =  ShuttleGame.PARTICLE_OFFSET; }
    if (this.keys.down)  { py = -ShuttleGame.PARTICLE_OFFSET; }
    if (this.keys.left)  { px =  ShuttleGame.PARTICLE_OFFSET; }
    if (this.keys.right) { px = -ShuttleGame.PARTICLE_OFFSET; }
    this.particles.push({
      x: this.shipX + px + (Math.random() - 0.5) * 6,
      y: this.shipY + py + (Math.random() - 0.5) * 6,
      vx: -this.shipVX * 0.3 + (Math.random() - 0.5) * 40,
      vy: -this.shipVY * 0.3 + (Math.random() - 0.5) * 40,
      life: ShuttleGame.PARTICLE_LIFE_S,
    });
  }

  // Tick particles
  for (let i = this.particles.length - 1; i >= 0; i--) {
    const p = this.particles[i];
    p.x += p.vx * deltaSec;
    p.y += p.vy * deltaSec;
    p.life -= deltaSec;
    if (p.life <= 0) this.particles.splice(i, 1);
  }
}
```

**Replace existing `_update(dt)`:**

```js
_update(dt) {
  this.elapsed += dt;
  const deltaSec = dt / 1000;
  this._updateShuttle(deltaSec);
}
```

**Replace existing `_draw()` shuttle-render block** so the shuttle renders at `(this.shipX, this.shipY)` instead of canvas center, and **remove the bob** (the shuttle now moves under player control, the bob is gone). Particles also draw here:

```js
_draw() {
  const ctx = this.ctx;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, this.width, this.height);

  for (const star of this.stars) {
    ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
    ctx.fillRect(star.x, star.y, 1, 1);
  }

  // Header
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('TRAVELLING TO MISSION DESTINATION', 20, 30);

  // Particles (drawn under the ship)
  ctx.fillStyle = '#ffffff';
  for (const p of this.particles) {
    ctx.globalAlpha = Math.max(0, p.life / ShuttleGame.PARTICLE_LIFE_S);
    ctx.fillRect(p.x, p.y, 2, 2);
  }
  ctx.globalAlpha = 1.0;

  // Shuttle — same per-part transform-origin handling, just translated to ship pos.
  const scale = Math.min(this.width, this.height) / ShuttleGame.SHUTTLE_FIT_DIVISOR;
  const sourceCenterX = (ShuttleGame.SOURCE_BBOX_MIN_X + ShuttleGame.SOURCE_BBOX_MAX_X) / 2;
  const sourceCenterY = (ShuttleGame.SOURCE_BBOX_MIN_Y + ShuttleGame.SOURCE_BBOX_MAX_Y) / 2;

  ctx.save();
  ctx.translate(this.shipX, this.shipY);
  ctx.scale(scale, scale);
  ctx.translate(-sourceCenterX, -sourceCenterY);
  ctx.fillStyle = '#ffffff';
  for (const part of this.shuttleParts) {
    const [ox, oy] = part.origin;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.transform(0.669131, 0.743145, -0.743145, 0.669131, 0, 0);
    ctx.translate(-ox, -oy);
    ctx.fill(part.path);
    ctx.restore();
  }
  ctx.restore();
}
```

**Add tunables block under the existing `ShuttleGame.SHUTTLE_FIT_DIVISOR = 1400;` line:**

```js
ShuttleGame.SHIP_SPAWN_Y_RATIO = 0.7;       // initial Y as fraction of canvas height
ShuttleGame.SHIP_EDGE_INSET = 40;           // px of margin from canvas edge
ShuttleGame.SHUTTLE_ACCEL = 900;            // px/s² per axis when key held
ShuttleGame.SHUTTLE_MAX_SPEED = 320;        // px/s clamp per axis
ShuttleGame.SHUTTLE_DRAG = 600;             // px/s² when no key on that axis
ShuttleGame.PARTICLE_SPAWN_CHANCE = 0.7;    // per frame while thrusting
ShuttleGame.PARTICLE_OFFSET = 24;           // px from ship center toward exhaust direction
ShuttleGame.PARTICLE_LIFE_S = 0.6;          // seconds
```

**Steps:**

- [ ] **Step 1: Add the new state fields and bound handlers to the constructor.** Make sure `this.shuttleParts` and the existing `this.stars` / `this.elapsed` / `this.readyPending` stay intact.

- [ ] **Step 2: Add `_attachInput`, `_detachInput`, `_handleKeyDown`, `_handleKeyUp` methods.** Replace the empty base-class versions inherited from `PreludeGame`.

- [ ] **Step 3: Replace `_onCanvasInit` to seed shuttle position.** Stars seeding stays.

- [ ] **Step 4: Add `_updateShuttle` method.** Pure motion + particles, no asteroids yet.

- [ ] **Step 5: Replace `_update(dt)` to call `_updateShuttle`.** Keep the `this.elapsed += dt` line.

- [ ] **Step 6: Replace `_draw` to render shuttle at `(shipX, shipY)` and draw particles.** Remove the `bob` calculation entirely.

- [ ] **Step 7: Add the new tunable constants to the `ShuttleGame.*` block.**

- [ ] **Step 8: Verify in browser.**
  - `bun dev` → open `http://localhost:<port>/level`.
  - Shuttle starts in the lower-third of the canvas.
  - WASD moves it with momentum; release keys → drag stops it.
  - Hitting an edge clamps without bounce.
  - White exhaust particles spawn behind whichever direction you're thrusting.
  - The "TRAVELLING TO MISSION DESTINATION" header is visible top-left.

- [ ] **Step 9: Commit.**

```bash
git add index.html docs/superpowers/specs/2026-05-02-shuttle-prelude-asteroids-design.md docs/superpowers/plans/2026-05-02-shuttle-prelude-asteroids.md
git commit -m "$(cat <<'EOF'
feat(prelude): shuttle accepts WASD with momentum and exhaust particles

First slice of the shuttle prelude gameplay. Spec + plan committed
alongside the implementation.
EOF
)"
```

---

## Task 2: Parallax Starfield (sells "we're moving")

**Files:**
- Modify: `D:\Developer\asteroids\index.html` — `ShuttleGame` class

**Goal:** Replace the single static star layer with 3 parallax layers that scroll downward at different speeds. Stars that fall off the bottom respawn at the top with a fresh X.

**Replace the `this.stars` initialisation logic.** In the constructor, replace `this.stars = [];` with:

```js
this.starLayers = []; // [{ stars: [{x,y,size,brightness}], speed }]
```

**Replace the `_onCanvasInit` star-seeding block** with:

```js
this.starLayers = [];
for (let layer = 0; layer < ShuttleGame.STAR_LAYERS; layer++) {
  const stars = [];
  for (let i = 0; i < ShuttleGame.STAR_COUNT_PER_LAYER[layer]; i++) {
    stars.push({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      size: ShuttleGame.STAR_LAYER_SIZES[layer],
      brightness: Math.random() * 0.7 + 0.3,
    });
  }
  this.starLayers.push({
    stars,
    speed: ShuttleGame.STAR_LAYER_SPEEDS[layer],
  });
}
```

**Add `_updateStarfield(deltaSec)`:**

```js
_updateStarfield(deltaSec) {
  for (const layer of this.starLayers) {
    for (const s of layer.stars) {
      s.y += layer.speed * deltaSec;
      if (s.y > this.height) {
        s.y -= this.height + Math.random() * 20;
        s.x = Math.random() * this.width;
        s.brightness = Math.random() * 0.7 + 0.3;
      }
    }
  }
}
```

**Update `_update(dt)` to call it:**

```js
_update(dt) {
  this.elapsed += dt;
  const deltaSec = dt / 1000;
  this._updateStarfield(deltaSec);
  this._updateShuttle(deltaSec);
}
```

**Replace the star-draw block in `_draw()`** (currently `for (const star of this.stars) { ... fillRect(star.x, star.y, 1, 1) }`) with:

```js
for (const layer of this.starLayers) {
  for (const s of layer.stars) {
    ctx.fillStyle = `rgba(255, 255, 255, ${s.brightness})`;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
}
```

**Add tunables:**

```js
ShuttleGame.STAR_LAYERS = 3;
ShuttleGame.STAR_COUNT_PER_LAYER = [60, 40, 25];
ShuttleGame.STAR_LAYER_SPEEDS = [180, 90, 35];   // px/s, near → far
ShuttleGame.STAR_LAYER_SIZES = [2, 1, 1];        // px, near → far
```

You can leave the old `ShuttleGame.STAR_COUNT = 80;` line in place but it is now unused — remove it to keep things clean.

**Steps:**

- [ ] **Step 1: Replace `this.stars = []` with `this.starLayers = []` in constructor.**
- [ ] **Step 2: Replace the single-layer star seeding in `_onCanvasInit` with the per-layer loop.**
- [ ] **Step 3: Add `_updateStarfield(deltaSec)`.**
- [ ] **Step 4: Call `_updateStarfield` from `_update` (before `_updateShuttle`).**
- [ ] **Step 5: Replace the star-draw loop in `_draw`.**
- [ ] **Step 6: Add `STAR_LAYERS`, `STAR_COUNT_PER_LAYER`, `STAR_LAYER_SPEEDS`, `STAR_LAYER_SIZES` constants. Remove the now-unused `STAR_COUNT`.**
- [ ] **Step 7: Verify in browser.**
  - Stars stream downward at three distinct speeds — fast big stars near, slow small stars far.
  - Stars wrap from bottom back to top.
  - Shuttle still steers normally on top.

- [ ] **Step 8: Commit.**

```bash
git add index.html
git commit -m "feat(prelude): three-layer parallax starfield for shuttle prelude"
```

---

## Task 3: Asteroids — Spawn, Drift, Render (no interactions yet)

**Files:**
- Modify: `D:\Developer\asteroids\index.html` — `ShuttleGame` class

**Goal:** Procedural irregular asteroid polygons spawn off the top edge, drift downward + lateral wobble, rotate visually, despawn off-bottom. No collisions yet — just visual presence.

**Add to constructor:**

```js
this.asteroids = [];
this.lastAsteroidSpawn = 0;
```

**Add helper methods:**

```js
_makeAsteroidVertices(radius) {
  const count = ShuttleGame.ASTEROID_VERTEX_MIN
    + Math.floor(Math.random() * (ShuttleGame.ASTEROID_VERTEX_MAX - ShuttleGame.ASTEROID_VERTEX_MIN + 1));
  const verts = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const jitter = 1 + (Math.random() * 2 - 1) * ShuttleGame.ASTEROID_VERTEX_JITTER;
    verts.push({ angle, distance: radius * jitter });
  }
  return verts;
}

_spawnAsteroid(size) {
  const radius = ShuttleGame.ASTEROID_RADII[size];
  const x = Math.random() * (this.width - radius * 2) + radius;
  const y = -radius - 10;
  const vy = ShuttleGame.ASTEROID_VY_MIN + Math.random() * (ShuttleGame.ASTEROID_VY_MAX - ShuttleGame.ASTEROID_VY_MIN);
  const vx = (Math.random() * 2 - 1) * ShuttleGame.ASTEROID_VX_RANGE;
  this.asteroids.push({
    x, y, vx, vy,
    size,
    radius,
    vertices: this._makeAsteroidVertices(radius),
    rotation: Math.random() * Math.PI * 2,
    rotationVel: (Math.random() * 2 - 1) * ShuttleGame.ASTEROID_ROT_VEL_RANGE,
  });
}

_currentSpawnInterval() {
  // Linear ramp from BASE → MIN over RAMP_MS, then floor.
  const t = Math.min(1, this.elapsed / ShuttleGame.ASTEROID_RAMP_MS);
  return ShuttleGame.ASTEROID_BASE_SPAWN_MS
    + (ShuttleGame.ASTEROID_MIN_SPAWN_MS - ShuttleGame.ASTEROID_BASE_SPAWN_MS) * t;
}

_pickSpawnSize() {
  const r = Math.random();
  if (r < ShuttleGame.ASTEROID_SPAWN_BIG_PROB) return 'big';
  if (r < ShuttleGame.ASTEROID_SPAWN_BIG_PROB + ShuttleGame.ASTEROID_SPAWN_MED_PROB) return 'med';
  return 'small';
}

_updateAsteroids(deltaSec) {
  if (this.state === 'cruising' && this.elapsed - this.lastAsteroidSpawn >= this._currentSpawnInterval()) {
    this._spawnAsteroid(this._pickSpawnSize());
    this.lastAsteroidSpawn = this.elapsed;
  }
  for (let i = this.asteroids.length - 1; i >= 0; i--) {
    const a = this.asteroids[i];
    a.x += a.vx * deltaSec;
    a.y += a.vy * deltaSec;
    a.rotation += a.rotationVel * deltaSec;
    // Wrap horizontally so lateral drift doesn't lose them off the side.
    if (a.x < -a.radius) a.x = this.width + a.radius;
    if (a.x > this.width + a.radius) a.x = -a.radius;
    // Despawn once fully past the bottom edge.
    if (a.y > this.height + a.radius) this.asteroids.splice(i, 1);
  }
}

_drawAsteroids() {
  const ctx = this.ctx;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  for (const a of this.asteroids) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rotation);
    ctx.beginPath();
    for (let i = 0; i < a.vertices.length; i++) {
      const v = a.vertices[i];
      const px = Math.cos(v.angle) * v.distance;
      const py = Math.sin(v.angle) * v.distance;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}
```

**Update `_update`:**

```js
_update(dt) {
  this.elapsed += dt;
  const deltaSec = dt / 1000;
  this._updateStarfield(deltaSec);
  this._updateShuttle(deltaSec);
  this._updateAsteroids(deltaSec);
}
```

**Update `_draw`** — call `_drawAsteroids()` after particles, before the shuttle (so the shuttle reads on top):

```js
// ... particles draw block ...
ctx.globalAlpha = 1.0;

this._drawAsteroids();

// ... shuttle draw block ...
```

**Add tunables:**

```js
ShuttleGame.ASTEROID_RADII = { big: 38, med: 24, small: 14 };
ShuttleGame.ASTEROID_VERTEX_MIN = 8;
ShuttleGame.ASTEROID_VERTEX_MAX = 12;
ShuttleGame.ASTEROID_VERTEX_JITTER = 0.25;     // ±25% of radius
ShuttleGame.ASTEROID_VY_MIN = 60;
ShuttleGame.ASTEROID_VY_MAX = 130;
ShuttleGame.ASTEROID_VX_RANGE = 40;            // ±px/s
ShuttleGame.ASTEROID_ROT_VEL_RANGE = 1.2;      // ±rad/s visual
ShuttleGame.ASTEROID_BASE_SPAWN_MS = 1400;
ShuttleGame.ASTEROID_MIN_SPAWN_MS = 450;
ShuttleGame.ASTEROID_RAMP_MS = 25000;
ShuttleGame.ASTEROID_SPAWN_BIG_PROB = 0.35;
ShuttleGame.ASTEROID_SPAWN_MED_PROB = 0.40;
// Small = 1 - big - med = 0.25
```

**Steps:**

- [ ] **Step 1: Add `this.asteroids = []` and `this.lastAsteroidSpawn = 0` to constructor.**
- [ ] **Step 2: Add helper methods `_makeAsteroidVertices`, `_spawnAsteroid`, `_currentSpawnInterval`, `_pickSpawnSize`, `_updateAsteroids`, `_drawAsteroids`.**
- [ ] **Step 3: Wire `_updateAsteroids` into `_update`.**
- [ ] **Step 4: Wire `_drawAsteroids` into `_draw` between particles and shuttle.**
- [ ] **Step 5: Add the asteroid tunables.**
- [ ] **Step 6: Verify in browser.**
  - White outlined irregular polygons drift down from the top.
  - Three visible sizes; rotation is visible.
  - Lateral drift wraps around screen edges instead of disappearing.
  - Asteroids despawn cleanly past the bottom (count doesn't grow forever — peek `this.asteroids.length` in console if uncertain).
  - Shuttle still flies normally; asteroids pass through it harmlessly (no collision yet).

- [ ] **Step 7: Commit.**

```bash
git add index.html
git commit -m "feat(prelude): asteroids spawn from the top and drift down with rotation"
```

---

## Task 4: Bullets + Bullet↔Asteroid Collisions + Splits + Score

**Files:**
- Modify: `D:\Developer\asteroids\index.html` — `ShuttleGame` class

**Goal:** SPACE fires upward bullets (capped, cooldown). Bullets that hit an asteroid pop it: bigs split into 2 mediums, mediums into 2 smalls, smalls vanish. Score accumulates and displays.

**Add to constructor:**

```js
this.bullets = [];
this.lastFireTime = -Infinity;
this.score = 0;
```

**Add bullet/collision methods:**

```js
_tryFire() {
  if (this.state !== 'cruising' && this.state !== 'finale') return;
  if (!this.keys.fire) return;
  if (this.bullets.length >= ShuttleGame.MAX_BULLETS) return;
  if (this.elapsed - this.lastFireTime < ShuttleGame.BULLET_COOLDOWN_MS) return;
  this.bullets.push({
    x: this.shipX,
    y: this.shipY - ShuttleGame.BULLET_NOSE_OFFSET,
    vy: -ShuttleGame.BULLET_SPEED,
    life: ShuttleGame.BULLET_LIFETIME_S,
  });
  this.lastFireTime = this.elapsed;
}

_updateBullets(deltaSec) {
  this._tryFire();
  for (let i = this.bullets.length - 1; i >= 0; i--) {
    const b = this.bullets[i];
    b.y += b.vy * deltaSec;
    b.life -= deltaSec;
    if (b.life <= 0 || b.y < -10) this.bullets.splice(i, 1);
  }
}

_splitAsteroid(parent) {
  const childSize = parent.size === 'big' ? 'med' : parent.size === 'med' ? 'small' : null;
  if (childSize === null) return; // small → vanish
  const radius = ShuttleGame.ASTEROID_RADII[childSize];
  for (let i = 0; i < 2; i++) {
    const angle = (i === 0 ? -1 : 1) * (Math.PI / 4) + (Math.random() - 0.5) * 0.4;
    const speed = ShuttleGame.SPLIT_SPEED;
    this.asteroids.push({
      x: parent.x,
      y: parent.y,
      vx: parent.vx + Math.sin(angle) * speed,
      vy: Math.max(ShuttleGame.ASTEROID_VY_MIN, parent.vy + Math.cos(angle) * speed * 0.3),
      size: childSize,
      radius,
      vertices: this._makeAsteroidVertices(radius),
      rotation: Math.random() * Math.PI * 2,
      rotationVel: (Math.random() * 2 - 1) * ShuttleGame.ASTEROID_ROT_VEL_RANGE,
    });
  }
}

_updateBulletAsteroidCollisions() {
  for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
    const b = this.bullets[bi];
    for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
      const a = this.asteroids[ai];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy <= a.radius * a.radius) {
        this.score += ShuttleGame.SCORE[a.size];
        this._splitAsteroid(a);
        this.asteroids.splice(ai, 1);
        this.bullets.splice(bi, 1);
        break; // bullet consumed
      }
    }
  }
}
```

**Update `_update`:**

```js
_update(dt) {
  this.elapsed += dt;
  const deltaSec = dt / 1000;
  this._updateStarfield(deltaSec);
  this._updateShuttle(deltaSec);
  this._updateAsteroids(deltaSec);
  this._updateBullets(deltaSec);
  this._updateBulletAsteroidCollisions();
}
```

**In `_draw`**, add a bullet-render block between asteroids and shuttle:

```js
this._drawAsteroids();

ctx.fillStyle = '#ffffff';
for (const b of this.bullets) {
  ctx.fillRect(b.x - 1, b.y - 5, 2, 6);
}

// ... shuttle draw block ...
```

**Add a score readout to the HUD** (next to the existing header, top-right):

```js
ctx.fillStyle = '#ffffff';
ctx.font = '16px monospace';
ctx.textAlign = 'left';
ctx.fillText('TRAVELLING TO MISSION DESTINATION', 20, 30);
ctx.textAlign = 'right';
ctx.fillText(`SCORE ${this.score.toString().padStart(5, '0')}`, this.width - 20, 30);
```

**Add tunables:**

```js
ShuttleGame.BULLET_SPEED = 700;
ShuttleGame.BULLET_LIFETIME_S = 0.9;
ShuttleGame.BULLET_COOLDOWN_MS = 180;
ShuttleGame.MAX_BULLETS = 4;
ShuttleGame.BULLET_NOSE_OFFSET = 22;       // px from ship center to nose
ShuttleGame.SPLIT_SPEED = 80;              // px/s outward divergence
ShuttleGame.SCORE = { big: 20, med: 50, small: 100 };
```

**Steps:**

- [ ] **Step 1: Add `bullets`, `lastFireTime`, `score` to constructor.**
- [ ] **Step 2: Add `_tryFire`, `_updateBullets`, `_splitAsteroid`, `_updateBulletAsteroidCollisions`.**
- [ ] **Step 3: Call them from `_update`.**
- [ ] **Step 4: Add bullet-render block to `_draw` (between asteroids and shuttle).**
- [ ] **Step 5: Add the score readout to the HUD draw.**
- [ ] **Step 6: Add the bullet / score / split tunables.**
- [ ] **Step 7: Verify in browser.**
  - SPACE fires a small white line upward; rate-limited (you can't spam-spew).
  - Cap of 4 simultaneous bullets — fire 5 times fast, only 4 visible.
  - Bullets hit asteroids: bigs split into 2 mediums, mediums into 2 smalls, smalls disappear.
  - Score climbs (small = 100, medium = 50, big = 20 — small > big intentionally).
  - Score readout appears in the HUD top-right.

- [ ] **Step 8: Commit.**

```bash
git add index.html
git commit -m "feat(prelude): bullets, asteroid splits, and score tracking"
```

---

## Task 5: Shuttle↔Asteroid Collision (blink + respawn)

**Files:**
- Modify: `D:\Developer\asteroids\index.html` — `ShuttleGame` class

**Goal:** When the shuttle touches an asteroid (and isn't invulnerable), it blinks for ~1.5s, respawns at the spawn position, and any asteroid within `RESPAWN_CLEAR_RADIUS` of the respawn point is removed so the player isn't immediately hit again.

**Add to constructor:**

```js
this.invulnerableUntil = 0; // elapsed ms
```

**Add methods:**

```js
_isInvulnerable() {
  return this.elapsed < this.invulnerableUntil;
}

_respawnShuttle() {
  this.shipX = this.width / 2;
  this.shipY = this.height * ShuttleGame.SHIP_SPAWN_Y_RATIO;
  this.shipVX = 0;
  this.shipVY = 0;
  this.invulnerableUntil = this.elapsed + ShuttleGame.RESPAWN_BLINK_MS;

  // Clear nearby asteroids so respawn isn't a death trap.
  const r2 = ShuttleGame.RESPAWN_CLEAR_RADIUS * ShuttleGame.RESPAWN_CLEAR_RADIUS;
  for (let i = this.asteroids.length - 1; i >= 0; i--) {
    const a = this.asteroids[i];
    const dx = a.x - this.shipX;
    const dy = a.y - this.shipY;
    if (dx * dx + dy * dy <= r2) this.asteroids.splice(i, 1);
  }
}

_updateShuttleAsteroidCollisions() {
  if (this._isInvulnerable()) return;
  for (const a of this.asteroids) {
    const dx = a.x - this.shipX;
    const dy = a.y - this.shipY;
    const hitR = a.radius + ShuttleGame.SHIP_COLLIDER_RADIUS;
    if (dx * dx + dy * dy <= hitR * hitR) {
      this._respawnShuttle();
      return;
    }
  }
}
```

**Add to `_update` (after bullet/asteroid collisions):**

```js
this._updateBulletAsteroidCollisions();
this._updateShuttleAsteroidCollisions();
```

**Modify the shuttle-render block in `_draw`** to apply a blink alpha when invulnerable. Wrap the shuttle draw in:

```js
const blinkAlpha = this._isInvulnerable()
  ? (Math.floor(this.elapsed / ShuttleGame.BLINK_PERIOD_MS) % 2 === 0 ? 0.3 : 0.8)
  : 1.0;
ctx.globalAlpha = blinkAlpha;
ctx.save();
ctx.translate(this.shipX, this.shipY);
// ... existing scale + per-part transform + fill loop ...
ctx.restore();
ctx.globalAlpha = 1.0;
```

**Add tunables:**

```js
ShuttleGame.SHIP_COLLIDER_RADIUS = 18;     // px — generous-ish to forgive grazes? No, fair.
ShuttleGame.RESPAWN_BLINK_MS = 1500;
ShuttleGame.RESPAWN_CLEAR_RADIUS = 110;
ShuttleGame.BLINK_PERIOD_MS = 120;         // alternate transparency every N ms
```

**Steps:**

- [ ] **Step 1: Add `this.invulnerableUntil = 0` to constructor.**
- [ ] **Step 2: Add `_isInvulnerable`, `_respawnShuttle`, `_updateShuttleAsteroidCollisions`.**
- [ ] **Step 3: Call `_updateShuttleAsteroidCollisions` from `_update`.**
- [ ] **Step 4: Wrap the shuttle render block with blink alpha.**
- [ ] **Step 5: Add `SHIP_COLLIDER_RADIUS`, `RESPAWN_BLINK_MS`, `RESPAWN_CLEAR_RADIUS`, `BLINK_PERIOD_MS` constants.**
- [ ] **Step 6: Verify in browser.**
  - Fly into an asteroid: shuttle teleports back to start position with zero velocity, blinks rapidly for ~1.5s.
  - Asteroids near the spawn point are gone (you don't immediately re-die).
  - During blink, shuttle is fully passable through asteroids.
  - After blink ends, normal collisions resume.

- [ ] **Step 7: Commit.**

```bash
git add index.html
git commit -m "feat(prelude): shuttle blinks and respawns on asteroid collision"
```

---

## Task 6: Finale (destination asteroid, takeover, fade exit)

**Files:**
- Modify: `D:\Developer\asteroids\index.html` — `ShuttleGame` class

**Goal:** When `Prelude.ready()` is called and `MIN_RUN_MS` has elapsed, transition `cruising → finale`. Spawn the destination asteroid, change header text. After `DESTINATION_LINGER_MS` post-arrival, transition `finale → exit`: take input away, auto-fly the shuttle upward toward the rock, fade out, hide the prelude container, and dispatch `prelude-play`.

**Add to constructor:**

```js
this.destination = null; // { x, y, vy, radius, settledAt }
this.exitStartTime = 0;
this.shipAlpha = 1;
this.fallingStartTime = performance.now(); // matches lander pattern
```

**Replace `ready()`:**

```js
ready() {
  // Mirror lander discipline — defer the actual transition until MIN_RUN_MS
  // elapsed AND we have a clear moment to drop the destination rock in.
  this.readyPending = true;
  this.playBtn.style.display = 'block';
}
```

**Add finale methods:**

```js
_tryEnterFinale() {
  if (this.state !== 'cruising') return;
  if (!this.readyPending) return;
  if (performance.now() - this.fallingStartTime < ShuttleGame.MIN_RUN_MS) return;
  this.state = 'finale';
  // Spawn destination asteroid off the top, centered horizontally.
  const radius = ShuttleGame.DESTINATION_RADIUS;
  this.destination = {
    x: this.width / 2,
    y: -radius - 20,
    vy: ShuttleGame.DESTINATION_DRIFT_SPEED,
    radius,
    settledAt: 0,
  };
}

_updateFinale(deltaSec) {
  if (this.state !== 'finale') return;
  const targetY = this.height * ShuttleGame.DESTINATION_TARGET_Y_RATIO;
  if (this.destination.y < targetY) {
    this.destination.y += this.destination.vy * deltaSec;
    if (this.destination.y >= targetY) {
      this.destination.y = targetY;
      this.destination.settledAt = this.elapsed;
    }
  } else if (
    this.destination.settledAt > 0 &&
    this.elapsed - this.destination.settledAt >= ShuttleGame.DESTINATION_LINGER_MS
  ) {
    this.state = 'exit';
    this.exitStartTime = this.elapsed;
    // Zero current velocity — takeover handles motion.
    this.shipVX = 0;
    this.shipVY = 0;
  }
}

_updateExit(deltaSec) {
  if (this.state !== 'exit') return;
  // Auto-pilot upward toward the destination, accelerating.
  this.shipVY -= ShuttleGame.EXIT_ACCEL * deltaSec;
  this.shipVY = Math.max(-ShuttleGame.EXIT_MAX_SPEED, this.shipVY);
  this.shipY += this.shipVY * deltaSec;
  // Drift toward the destination X so we visually arrive at the rock.
  if (this.destination) {
    const dx = this.destination.x - this.shipX;
    this.shipX += Math.sign(dx) * Math.min(Math.abs(dx), ShuttleGame.EXIT_MAX_SPEED * deltaSec * 0.5);
  }
  // Fade.
  const t = Math.min(1, (this.elapsed - this.exitStartTime) / ShuttleGame.EXIT_FADE_MS);
  this.shipAlpha = 1 - t;
  // Done?
  if (this.shipAlpha <= 0 || this.shipY < -ShuttleGame.SHIP_EDGE_INSET) {
    this.stop();
    window.dispatchEvent(new Event('prelude-play'));
  }
}
```

**Update `_update` to drive the state machine** and to skip player input during exit:

```js
_update(dt) {
  this.elapsed += dt;
  const deltaSec = dt / 1000;
  this._updateStarfield(deltaSec);
  if (this.state !== 'exit') this._updateShuttle(deltaSec);
  this._updateAsteroids(deltaSec);
  this._updateBullets(deltaSec);
  this._updateBulletAsteroidCollisions();
  this._updateShuttleAsteroidCollisions();
  this._tryEnterFinale();
  this._updateFinale(deltaSec);
  this._updateExit(deltaSec);
}
```

**Update `_updateAsteroids`** so normal asteroids stop spawning once we leave `'cruising'`. The existing guard `if (this.state === 'cruising' && ...)` already does this — confirm it's in place.

**Update `_updateShuttleAsteroidCollisions`** so the destination rock is harmless during the finale (it doesn't damage the player, even though it's huge). Keep the loop as-is — the destination is stored separately on `this.destination`, not in `this.asteroids`, so it can't trigger this collision check by accident.

**Bullet vs destination rock:** spawn a small spark when a bullet hits it, but don't damage / destroy. Add to `_updateBulletAsteroidCollisions` AFTER the asteroids loop, BEFORE the bullet-removal `break`:

```js
_updateBulletAsteroidCollisions() {
  for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
    const b = this.bullets[bi];
    let consumed = false;
    for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
      const a = this.asteroids[ai];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy <= a.radius * a.radius) {
        this.score += ShuttleGame.SCORE[a.size];
        this._splitAsteroid(a);
        this.asteroids.splice(ai, 1);
        consumed = true;
        break;
      }
    }
    if (!consumed && this.destination) {
      const dx = this.destination.x - b.x;
      const dy = this.destination.y - b.y;
      if (dx * dx + dy * dy <= this.destination.radius * this.destination.radius) {
        // Spark — reuse particle list.
        for (let k = 0; k < 4; k++) {
          this.particles.push({
            x: b.x, y: b.y,
            vx: (Math.random() - 0.5) * 120,
            vy: (Math.random() - 0.5) * 120,
            life: ShuttleGame.PARTICLE_LIFE_S * 0.5,
          });
        }
        consumed = true;
      }
    }
    if (consumed) this.bullets.splice(bi, 1);
  }
}
```

**Add `_drawDestination` and call it before normal asteroid draw** (so normal asteroids draw on top — though there shouldn't be many at finale time):

```js
_drawDestination() {
  if (!this.destination) return;
  const ctx = this.ctx;
  // Pulse the outline alpha so it reads as "the special one."
  const pulse = 0.6 + 0.4 * Math.sin(this.elapsed / 250);
  ctx.save();
  ctx.translate(this.destination.x, this.destination.y);
  ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  // Use a coarser, wobblier polygon for the destination — feels weighty.
  const verts = 16;
  for (let i = 0; i < verts; i++) {
    const angle = (i / verts) * Math.PI * 2;
    const r = this.destination.radius * (0.92 + 0.08 * Math.sin(angle * 3));
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}
```

**Update `_draw` ordering and HUD text:**

```js
// (after particles, before normal asteroids)
this._drawDestination();
this._drawAsteroids();
// ... bullet draw ...
// ... shuttle draw with blink AND shipAlpha ...
```

When applying alpha to the shuttle draw, multiply `blinkAlpha` and `this.shipAlpha`:

```js
const blinkAlpha = this._isInvulnerable() ? (...) : 1.0;
ctx.globalAlpha = blinkAlpha * this.shipAlpha;
```

**Update HUD header** to swap text in finale/exit states:

```js
const headerText = (this.state === 'finale' || this.state === 'exit')
  ? 'DESTINATION REACHED'
  : 'TRAVELLING TO MISSION DESTINATION';
ctx.fillText(headerText, 20, 30);
```

**Add tunables:**

```js
ShuttleGame.MIN_RUN_MS = 4500;
ShuttleGame.DESTINATION_RADIUS = 110;
ShuttleGame.DESTINATION_TARGET_Y_RATIO = 0.45;
ShuttleGame.DESTINATION_DRIFT_SPEED = 50;
ShuttleGame.DESTINATION_LINGER_MS = 2000;
ShuttleGame.EXIT_ACCEL = 800;
ShuttleGame.EXIT_MAX_SPEED = 900;
ShuttleGame.EXIT_FADE_MS = 900;
```

**PLAY button click already calls `game.stop()` and dispatches `prelude-play`** in the IIFE bottom. Confirm that the existing button handler still works and short-circuits cleanly (it should, because `stop()` is the same exit path the auto-flow uses minus the fade).

**Steps:**

- [ ] **Step 1: Add `destination`, `exitStartTime`, `shipAlpha`, `fallingStartTime` to constructor.**
- [ ] **Step 2: Replace `ready()` so it sets `readyPending` AND shows the PLAY button immediately.**
- [ ] **Step 3: Add `_tryEnterFinale`, `_updateFinale`, `_updateExit`.**
- [ ] **Step 4: Wire all three into `_update`. Skip `_updateShuttle` when state === 'exit'.**
- [ ] **Step 5: Update `_updateBulletAsteroidCollisions` to handle destination spark hits.**
- [ ] **Step 6: Add `_drawDestination`. Call it from `_draw` before `_drawAsteroids`.**
- [ ] **Step 7: Multiply shuttle alpha by `this.shipAlpha`. Update HUD header text per state.**
- [ ] **Step 8: Add the finale tunables.**
- [ ] **Step 9: Verify in browser — happy path.**
  - On `/level`, play normally for ~5s. Vue boots and signals `ready()` (the PLAY button shows up).
  - The destination rock drifts down from the top; header changes to "DESTINATION REACHED."
  - After ~2s of dwell, the shuttle stops responding to keys; it auto-accelerates upward, fading.
  - When fully faded, the prelude vanishes and Vue takes over — same effect as clicking PLAY.
- [ ] **Step 10: Verify — PLAY-button skip.**
  - Reload `/level`. As soon as PLAY shows up (after `ready()`), click it. Prelude ends immediately with no cinematic — Vue takes over.
- [ ] **Step 11: Verify — bullet vs destination.**
  - During the finale dwell, fire SPACE at the big rock. Small white sparks appear at the impact point. The rock does NOT shrink or split.
- [ ] **Step 12: Commit.**

```bash
git add index.html
git commit -m "feat(prelude): finale — destination asteroid, takeover, fade exit"
```

---

## Self-Review Notes

**Spec coverage:** Walked the spec section by section.

- Player Experience → Controls: Task 1.
- Player Experience → Loop: Tasks 2 (parallax), 3 (asteroids), 4 (bullets/splits/score), 5 (collision/respawn).
- Player Experience → Finale: Task 6 (covers `MIN_RUN_MS` gate, dwell, takeover, fade, PLAY-button short-circuit, bullet sparks on destination).
- Architecture → Class structure subsystems (`_updateShuttle`, `_updateBullets`, `_updateAsteroids`, `_updateCollisions`, `_updateStarfield`, `_updateFinale`): all present across Tasks 1–6.
- Architecture → State machine: implemented in Task 6 (`'cruising' | 'finale' | 'exit'`).
- Architecture → Tuning constants: every constant from the spec table is added in the corresponding task. No magic numbers in update/draw bodies.
- Acceptance criteria: covered by the verify steps in Tasks 1, 4, 5, 6.

**Placeholder scan:** No TBDs, TODOs, "fill in details," or "similar to Task N" hand-waves — every step has either concrete code or a concrete browser check.

**Type/name consistency:** Method names used across tasks (`_updateShuttle`, `_updateAsteroids`, `_updateBullets`, `_updateBulletAsteroidCollisions`, `_updateShuttleAsteroidCollisions`, `_isInvulnerable`, `_respawnShuttle`, `_tryEnterFinale`, `_updateFinale`, `_updateExit`, `_drawAsteroids`, `_drawDestination`) are spelled identically everywhere they appear. Field names (`shipX/Y/VX/VY`, `bullets`, `asteroids`, `destination`, `shipAlpha`, `invulnerableUntil`, `state`, `score`, `elapsed`, `lastFireTime`, `lastAsteroidSpawn`, `fallingStartTime`, `exitStartTime`, `readyPending`) are consistent across the constructor, helpers, and verify steps.

**Open follow-ups (not in this plan, intentionally out-of-scope per spec):** mobile gestures, audio, leaderboard, animated nebula. If we want any of these, they get their own spec.
