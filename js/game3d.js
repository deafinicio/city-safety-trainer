import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js";

export class TrainingWorld {
  constructor({
    canvas,
    joystick,
    joystickKnob,
    lookZone,
    onSuccess,
    onFailure
  }) {
    this.canvas = canvas;
    this.joystick = joystick;
    this.joystickKnob = joystickKnob;
    this.lookZone = lookZone;
    this.onSuccess = onSuccess;
    this.onFailure = onFailure;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa4aaa4);
    this.scene.fog = new THREE.Fog(0xa4aaa4, 34, 82);

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 130);
    this.camera.rotation.order = "YXZ";

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.clock = new THREE.Clock();
    this.keys = new Set();
    this.joystickVector = new THREE.Vector2();
    this.yaw = 0;
    this.pitch = 0;
    this.active = false;
    this.completed = false;
    this.colliders = [];
    this.rocketPosition = new THREE.Vector2(-3.7, -9.7);

    this.createEnvironment();
    this.bindControls();
    this.resize();
    this.reset();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  createEnvironment() {
    this.scene.add(new THREE.HemisphereLight(0xe7ece8, 0x424942, 2.5));

    const sun = new THREE.DirectionalLight(0xffedcf, 2.1);
    sun.position.set(-14, 22, 10);
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: 0x596158, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    this.scene.add(ground);

    this.addRoad(0, 9, 12, 18, 0x363a38);
    this.addRoad(-3.8, -8.5, 4.2, 21, 0x323634);
    this.addRoad(4.2, -9.5, 5.1, 27, 0x474b47);
    this.addRoad(0, -23.2, 12, 8, 0x393d3a);

    this.addBuilding(-11.2, 4.5, -8, 6, 9, 32, 0x686965);
    this.addBuilding(11.2, 5, -8, 6, 10, 32, 0x716d67);
    this.addBuilding(-10.8, 3.2, -29, 7, 6.4, 9, 0x5b5a56);
    this.addBuilding(10.9, 4, -29, 7, 8, 9, 0x66615b);

    this.addBrokenWall(-0.2, -7.6, 3.5, 0.75, 3.6, 0.12);
    this.addBrokenWall(0.4, -13, 4.2, 0.8, 2.4, -0.08);
    this.addRubble(-0.2, -3.9, 3.2, 2.6, 1.2, 0x797268);
    this.addRubble(0.3, -9.8, 3.3, 4.4, 1.55, 0x68635d);
    this.addRubble(-0.1, -15.3, 3.7, 3.2, 1.25, 0x756f65);

    this.addRubble(5.1, -3.2, 1.2, 1.3, 0.55, 0x777269);
    this.addRubble(2.8, -17.2, 1, 1.1, 0.45, 0x777269);

    this.addTree(-7.1, 7);
    this.addTree(7.2, 5);
    this.addTree(7.1, -17);
    this.addTree(-7.2, -21);

    this.addRocket();
    this.createGoal();
  }

  addRoad(x, z, width, depth, color) {
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color, roughness: 1 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0, z);
    this.scene.add(road);
  }

  addBuilding(x, y, z, width, height, depth, color) {
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color, roughness: 0.95 })
    );
    building.position.set(x, y, z);
    this.scene.add(building);

    const windowMaterial = new THREE.MeshBasicMaterial({ color: 0x202827 });
    const facadeX = x > 0 ? x - width / 2 - 0.012 : x + width / 2 + 0.012;

    for (let floor = 1.8; floor < height - 0.7; floor += 2.1) {
      for (let offset = -depth / 2 + 2; offset < depth / 2 - 1; offset += 3.2) {
        const windowMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(0.8, 0.95),
          windowMaterial
        );
        windowMesh.position.set(facadeX, floor, z + offset);
        windowMesh.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
        this.scene.add(windowMesh);
      }
    }
  }

  addBrokenWall(x, z, width, depth, height, rotation) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color: 0x77736d, roughness: 1 })
    );
    wall.position.set(x, height / 2, z);
    wall.rotation.y = rotation;
    this.scene.add(wall);

    this.colliders.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth,
      maxZ: z + depth
    });
  }

  addRubble(x, z, width, depth, height, color) {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color, roughness: 1 })
    );
    base.position.set(x, height / 2, z);
    base.rotation.y = 0.08;
    this.scene.add(base);

    for (let index = 0; index < 4; index += 1) {
      const chunk = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.35 + index * 0.07, 0),
        new THREE.MeshStandardMaterial({ color: index % 2 ? 0x655f58 : 0x817a70 })
      );
      chunk.position.set(
        x - width * 0.35 + index * width * 0.23,
        height + 0.2,
        z + (index % 2 ? depth * 0.22 : -depth * 0.2)
      );
      chunk.rotation.set(index * 0.2, index * 0.45, 0.2);
      this.scene.add(chunk);
    }

    this.colliders.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2
    });
  }

  addTree(x, z) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.25, 2.7, 8),
      new THREE.MeshStandardMaterial({ color: 0x514535 })
    );
    trunk.position.set(x, 1.35, z);

    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.18, 1),
      new THREE.MeshStandardMaterial({ color: 0x384c39, roughness: 1 })
    );
    crown.position.set(x, 3.25, z);
    this.scene.add(trunk, crown);
  }

  addRocket() {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x596050,
      roughness: 0.72,
      metalness: 0.18
    });

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.33, 2.8, 14),
      bodyMaterial
    );
    body.rotation.x = Math.PI / 2;

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.8, 14),
      new THREE.MeshStandardMaterial({ color: 0x444a3e, roughness: 0.8 })
    );
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -1.75;

    const finMaterial = new THREE.MeshStandardMaterial({ color: 0x464b40 });
    for (const x of [-0.42, 0.42]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.72), finMaterial);
      fin.position.set(x, 0, 1.12);
      group.add(fin);
    }

    group.add(body, nose);
    group.position.set(this.rocketPosition.x, 0.42, this.rocketPosition.y);
    group.rotation.z = 0.12;
    this.scene.add(group);
  }

  createGoal() {
    const material = new THREE.MeshStandardMaterial({
      color: 0xefc84a,
      emissive: 0x4a3600,
      roughness: 0.55
    });

    const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 0.18), material);
    const rightPost = leftPost.clone();
    const top = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.18, 0.18), material);

    leftPost.position.set(-3.15, 1.6, -26.2);
    rightPost.position.set(3.15, 1.6, -26.2);
    top.position.set(0, 3.12, -26.2);

    const marker = new THREE.Mesh(
      new THREE.PlaneGeometry(6.1, 3),
      new THREE.MeshBasicMaterial({
        color: 0xefc84a,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide
      })
    );
    marker.position.set(0, 1.5, -26.2);
    this.scene.add(leftPost, rightPost, top, marker);
  }

  bindControls() {
    window.addEventListener("resize", () => this.resize());

    const movementCodes = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight"
    ]);

    window.addEventListener("keydown", (event) => {
      if (movementCodes.has(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
      }
    });

    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.code);
    });

    window.addEventListener("blur", () => {
      this.keys.clear();
    });

    this.canvas.addEventListener("click", () => {
      if (this.active && window.matchMedia("(pointer: fine)").matches) {
        this.canvas.requestPointerLock?.();
      }
    });

    document.addEventListener("mousemove", (event) => {
      if (!this.active || document.pointerLockElement !== this.canvas) return;
      this.rotateView(event.movementX, event.movementY, 0.0022);
    });

    this.bindJoystick();
    this.bindTouchLook();
  }

  bindJoystick() {
    let pointerId = null;

    const update = (event) => {
      const bounds = this.joystick.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const radius = bounds.width * 0.34;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const length = Math.hypot(dx, dy) || 1;
      const scale = Math.min(1, radius / length);
      const x = dx * scale;
      const y = dy * scale;

      this.joystickVector.set(x / radius, y / radius);
      this.joystickKnob.style.transform = "translate(" + x + "px, " + y + "px)";
    };

    const release = (event) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      this.joystickVector.set(0, 0);
      this.joystickKnob.style.transform = "translate(0, 0)";
    };

    this.joystick.addEventListener("pointerdown", (event) => {
      pointerId = event.pointerId;
      this.joystick.setPointerCapture(pointerId);
      update(event);
    });
    this.joystick.addEventListener("pointermove", (event) => {
      if (event.pointerId === pointerId) update(event);
    });
    this.joystick.addEventListener("pointerup", release);
    this.joystick.addEventListener("pointercancel", release);
  }

  bindTouchLook() {
    let pointerId = null;
    let previousX = 0;
    let previousY = 0;

    this.lookZone.addEventListener("pointerdown", (event) => {
      pointerId = event.pointerId;
      previousX = event.clientX;
      previousY = event.clientY;
      this.lookZone.setPointerCapture(pointerId);
    });

    this.lookZone.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId || !this.active) return;
      const dx = event.clientX - previousX;
      const dy = event.clientY - previousY;
      previousX = event.clientX;
      previousY = event.clientY;
      this.rotateView(dx, dy, 0.004);
    });

    const release = (event) => {
      if (event.pointerId === pointerId) pointerId = null;
    };

    this.lookZone.addEventListener("pointerup", release);
    this.lookZone.addEventListener("pointercancel", release);
  }

  rotateView(dx, dy, sensitivity) {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.25, 1.25);
  }

  resize() {
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  reset() {
    this.completed = false;
    this.routeChoice = null;
    this.correctedRoute = false;
    this.routeDecisionMs = null;
    this.minRocketDistance = Number.POSITIVE_INFINITY;
    this.trajectory = [];
    this.lastTrajectorySample = 0;
    this.startTime = performance.now();
    this.yaw = 0;
    this.pitch = 0;
    this.camera.position.set(0, 1.7, 16);
    this.camera.rotation.set(0, 0, 0);
    this.keys.clear();
    this.joystickVector.set(0, 0);
    this.joystickKnob.style.transform = "translate(0, 0)";
    this.resize();
  }

  start() {
    this.reset();
    this.active = true;
    this.clock.getDelta();
  }

  stop() {
    this.active = false;
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }
  }

  isBlocked(x, z) {
    if (x < -7.6 || x > 7.6 || z < -29 || z > 18) return true;

    return this.colliders.some((box) =>
      x > box.minX - 0.3 &&
      x < box.maxX + 0.3 &&
      z > box.minZ - 0.3 &&
      z < box.maxZ + 0.3
    );
  }

  getMetrics() {
    return {
      route: this.routeChoice || "не визначено",
      decisionSeconds: this.routeDecisionMs === null
        ? null
        : Number((this.routeDecisionMs / 1000).toFixed(1)),
      minRocketDistance: Number.isFinite(this.minRocketDistance)
        ? Number(this.minRocketDistance.toFixed(1))
        : null,
      correctedRoute: this.correctedRoute,
      trajectoryPoints: this.trajectory.length
    };
  }

  registerRouteChoice() {
    const { x, z } = this.camera.position;
    if (z > 1) return;

    if (x < -1.7 && this.routeChoice === null) {
      this.routeChoice = "короткий небезпечний";
      this.routeDecisionMs = performance.now() - this.startTime;
    }

    if (x > 1.7) {
      if (this.routeChoice === null) {
        this.routeChoice = "довший безпечніший";
        this.routeDecisionMs = performance.now() - this.startTime;
      } else if (this.routeChoice === "короткий небезпечний") {
        this.correctedRoute = true;
        this.routeChoice = "довший безпечніший";
      }
    }
  }

  trackTelemetry() {
    const now = performance.now();
    const dx = this.camera.position.x - this.rocketPosition.x;
    const dz = this.camera.position.z - this.rocketPosition.y;
    this.minRocketDistance = Math.min(this.minRocketDistance, Math.hypot(dx, dz));

    if (now - this.lastTrajectorySample >= 250) {
      this.lastTrajectorySample = now;
      this.trajectory.push({
        x: Number(this.camera.position.x.toFixed(2)),
        z: Number(this.camera.position.z.toFixed(2)),
        timeMs: Math.round(now - this.startTime)
      });
    }
  }

  fail(reason) {
    if (this.completed) return;
    this.completed = true;
    this.stop();
    this.onFailure({
      reason,
      metrics: this.getMetrics()
    });
  }

  succeed() {
    if (this.completed) return;
    this.completed = true;
    this.stop();
    this.onSuccess({
      metrics: this.getMetrics()
    });
  }

  update(delta) {
    if (!this.active) return;

    let forwardInput = 0;
    let rightInput = 0;

    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) forwardInput += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) forwardInput -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) rightInput += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) rightInput -= 1;

    forwardInput += -this.joystickVector.y;
    rightInput += this.joystickVector.x;

    const inputLength = Math.hypot(forwardInput, rightInput);
    if (inputLength > 1) {
      forwardInput /= inputLength;
      rightInput /= inputLength;
    }

    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    const speed = 4.4;
    const dx = (forwardX * forwardInput + rightX * rightInput) * speed * delta;
    const dz = (forwardZ * forwardInput + rightZ * rightInput) * speed * delta;

    const nextX = this.camera.position.x + dx;
    const nextZ = this.camera.position.z + dz;

    if (!this.isBlocked(nextX, this.camera.position.z)) this.camera.position.x = nextX;
    if (!this.isBlocked(this.camera.position.x, nextZ)) this.camera.position.z = nextZ;

    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    this.registerRouteChoice();
    this.trackTelemetry();

    if (this.minRocketDistance < 2.7) {
      this.fail("Ви наблизилися до нерозірваного боєприпасу на небезпечну відстань.");
      return;
    }

    if (this.camera.position.z <= -25.2 && Math.abs(this.camera.position.x) < 3.4) {
      if (this.routeChoice === "довший безпечніший") {
        this.succeed();
      } else {
        this.fail("До контрольної точки обрано небезпечний маршрут через завали.");
      }
    }
  }

  animate() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.update(delta);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.animate);
  }
}
