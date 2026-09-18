import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js";

export class TrainingWorld {
  constructor({ canvas, joystick, joystickKnob, lookZone, onComplete }) {
    this.canvas = canvas;
    this.joystick = joystick;
    this.joystickKnob = joystickKnob;
    this.lookZone = lookZone;
    this.onComplete = onComplete;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9ca99f);
    this.scene.fog = new THREE.Fog(0x9ca99f, 28, 70);

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 120);
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

    this.createEnvironment();
    this.bindControls();
    this.resize();
    this.reset();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  createEnvironment() {
    const ambient = new THREE.HemisphereLight(0xdce7df, 0x465047, 2.4);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff1d0, 2.2);
    sun.position.set(-12, 20, 8);
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ color: 0x536052, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.scene.add(ground);

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 52),
      new THREE.MeshStandardMaterial({ color: 0x303634, roughness: 1 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -11);
    this.scene.add(road);

    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xc8b96c });
    for (let z = 11; z > -35; z -= 6) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 2.8), lineMaterial);
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.012, z);
      this.scene.add(line);
    }

    this.addBox(-6.7, 3.5, -8, 5, 7, 15, 0x6f7068);
    this.addBox(6.9, 4.5, -7, 5.5, 9, 17, 0x777168);
    this.addBox(-7.2, 4, -25, 6, 8, 14, 0x635f59);
    this.addBox(7.1, 3, -25, 5.7, 6, 14, 0x716d62);

    this.addSidewalk(-4.7);
    this.addSidewalk(4.7);

    this.addTree(-5.3, 5);
    this.addTree(5.4, 2);
    this.addTree(-5.2, -18);
    this.addTree(5.1, -20);

    this.addDebris(-2.5, -6, 1.1);
    this.addDebris(2.35, -11, 0.85);
    this.addDebris(-1.7, -15.5, 0.7);

    this.createGoal();
  }

  addBox(x, y, z, width, height, depth, color) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color, roughness: 0.92 })
    );
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
  }

  addSidewalk(x) {
    const sidewalk = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.16, 52),
      new THREE.MeshStandardMaterial({ color: 0x89877f, roughness: 1 })
    );
    sidewalk.position.set(x, 0.08, -11);
    this.scene.add(sidewalk);
  }

  addTree(x, z) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.24, 2.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x514535 })
    );
    trunk.position.set(x, 1.3, z);

    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.15, 1),
      new THREE.MeshStandardMaterial({ color: 0x354d38, roughness: 1 })
    );
    crown.position.set(x, 3.2, z);

    this.scene.add(trunk, crown);
  }

  addDebris(x, z, size) {
    const debris = new THREE.Mesh(
      new THREE.DodecahedronGeometry(size, 0),
      new THREE.MeshStandardMaterial({ color: 0x736c62, roughness: 1 })
    );
    debris.position.set(x, size * 0.55, z);
    debris.rotation.set(0.3, 0.6, 0.2);
    this.scene.add(debris);

    this.colliders.push({
      minX: x - size * 0.85,
      maxX: x + size * 0.85,
      minZ: z - size * 0.85,
      maxZ: z + size * 0.85
    });
  }

  createGoal() {
    const material = new THREE.MeshStandardMaterial({
      color: 0xefc84a,
      emissive: 0x4a3600,
      roughness: 0.55
    });

    const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 0.18), material);
    const rightPost = leftPost.clone();
    const top = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.18, 0.18), material);

    leftPost.position.set(-3, 1.6, -22);
    rightPost.position.set(3, 1.6, -22);
    top.position.set(0, 3.12, -22);

    const marker = new THREE.Mesh(
      new THREE.PlaneGeometry(5.8, 3),
      new THREE.MeshBasicMaterial({
        color: 0xefc84a,
        transparent: true,
        opacity: 0.09,
        side: THREE.DoubleSide
      })
    );
    marker.position.set(0, 1.5, -22);

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
      this.joystickKnob.style.transform = `translate(${x}px, ${y}px)`;
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
    this.yaw = 0;
    this.pitch = 0;
    this.camera.position.set(0, 1.7, 11);
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
    if (x < -3.75 || x > 3.75 || z < -24 || z > 13) return true;

    return this.colliders.some((box) =>
      x > box.minX - 0.28 &&
      x < box.maxX + 0.28 &&
      z > box.minZ - 0.28 &&
      z < box.maxZ + 0.28
    );
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

    // Camera forward/right vectors for Three.js' -Z viewing direction.
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

    if (!this.completed && this.camera.position.z <= -21.3 && Math.abs(this.camera.position.x) < 3.2) {
      this.completed = true;
      this.stop();
      this.onComplete();
    }
  }

  animate() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.update(delta);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.animate);
  }
}
