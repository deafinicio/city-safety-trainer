import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js";
import { stage01 } from "./stages/stage01.js";
import { stage02 } from "./stages/stage02.js";

const STAGES = new Map([
  [stage01.id, stage01],
  [stage02.id, stage02]
]);

export class TrainingWorld {
  constructor({
    canvas,
    joystick,
    joystickKnob,
    lookZone,
    onSuccess,
    onFailure,
    onActionChange,
    onStageChange
  }) {
    this.canvas = canvas;
    this.joystick = joystick;
    this.joystickKnob = joystickKnob;
    this.lookZone = lookZone;
    this.onSuccess = onSuccess;
    this.onFailure = onFailure;
    this.onActionChange = onActionChange;
    this.onStageChange = onStageChange;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa4aaa4);
    this.scene.fog = new THREE.Fog(0xa4aaa4, 34, 86);

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 140);
    this.camera.rotation.order = "YXZ";

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.add(new THREE.HemisphereLight(0xe7ece8, 0x424942, 2.5));
    const sun = new THREE.DirectionalLight(0xffedcf, 2.1);
    sun.position.set(-14, 22, 10);
    this.scene.add(sun);

    this.stageRoot = new THREE.Group();
    this.scene.add(this.stageRoot);

    this.clock = new THREE.Clock();
    this.keys = new Set();
    this.joystickVector = new THREE.Vector2();
    this.yaw = 0;
    this.pitch = 0;
    this.active = false;
    this.completed = false;
    this.colliders = [];
    this.bounds = { minX: -8, maxX: 8, minZ: -30, maxZ: 20 };
    this.currentStage = null;
    this.currentStageId = null;
    this.stageState = {};
    this.activeAction = null;
    this.elapsedMs = 0;
    this.startTime = 0;
    this.lastInputMagnitude = 0;

    this.bindControls();
    this.resize();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  getAvailableStages() {
    return Array.from(STAGES.values()).map(({ id, number, title, shortTitle, instruction }) => ({
      id,
      number,
      title,
      shortTitle,
      instruction
    }));
  }

  clearStage() {
    this.stageRoot.traverse((object) => {
      object.geometry?.dispose();

      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose());
      } else {
        object.material?.dispose();
      }
    });

    this.scene.remove(this.stageRoot);
    this.stageRoot = new THREE.Group();
    this.scene.add(this.stageRoot);
    this.colliders = [];
  }

  loadStage(stageId) {
    const stage = STAGES.get(stageId);
    if (!stage) throw new Error("Невідомий етап: " + stageId);

    this.stop();
    this.clearStage();
    this.currentStage = stage;
    this.currentStageId = stageId;
    stage.build(this);
    this.onStageChange?.({
      id: stage.id,
      number: stage.number,
      title: stage.title,
      shortTitle: stage.shortTitle,
      instruction: stage.instruction
    });
  }

  start(stageId) {
    if (this.currentStageId !== stageId) {
      this.loadStage(stageId);
    }

    this.completed = false;
    this.clearAction();
    this.yaw = 0;
    this.pitch = 0;
    this.keys.clear();
    this.joystickVector.set(0, 0);
    this.joystickKnob.style.transform = "translate(0, 0)";
    this.camera.rotation.set(0, 0, 0);
    this.startTime = performance.now();
    this.elapsedMs = 0;
    this.lastInputMagnitude = 0;
    this.currentStage.reset(this);
    this.resize();
    this.active = true;
    this.clock.getDelta();
  }

  stop() {
    this.active = false;
    this.keys.clear();
    this.lastInputMagnitude = 0;

    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }
  }

  complete(metrics) {
    if (this.completed) return;
    this.completed = true;
    this.stop();
    this.clearAction();
    this.onSuccess?.({
      stage: this.currentStage,
      metrics
    });
  }

  fail(reason, metrics) {
    if (this.completed) return;
    this.completed = true;
    this.stop();
    this.clearAction();
    this.onFailure?.({
      stage: this.currentStage,
      reason,
      metrics
    });
  }

  setAction(label, handler) {
    this.activeAction = { label, handler };
    this.onActionChange?.({ visible: true, label });
  }

  clearAction() {
    this.activeAction = null;
    this.onActionChange?.({ visible: false, label: "" });
  }

  performAction() {
    if (this.active && this.activeAction) {
      this.activeAction.handler();
    }
  }

  add(object) {
    this.stageRoot.add(object);
    return object;
  }

  setBounds(bounds) {
    this.bounds = bounds;
  }

  setPlayerPosition(x, z) {
    this.camera.position.set(x, 1.7, z);
  }

  addGround(color) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 110),
      new THREE.MeshStandardMaterial({ color, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    return this.add(ground);
  }

  addRoad(x, z, width, depth, color) {
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color, roughness: 1 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0, z);
    return this.add(road);
  }

  addBuilding(x, y, z, width, height, depth, color) {
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color, roughness: 0.95 })
    );
    building.position.set(x, y, z);
    this.add(building);

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
        this.add(windowMesh);
      }
    }

    return building;
  }

  addBrokenWall(x, z, width, depth, height, rotation) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color: 0x77736d, roughness: 1 })
    );
    wall.position.set(x, height / 2, z);
    wall.rotation.y = rotation;
    this.add(wall);

    this.colliders.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth,
      maxZ: z + depth
    });

    return wall;
  }

  addRubble(x, z, width, depth, height, color) {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color, roughness: 1 })
    );
    base.position.set(x, height / 2, z);
    base.rotation.y = 0.08;
    this.add(base);

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
      this.add(chunk);
    }

    this.colliders.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2
    });

    return base;
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
    this.add(trunk);
    this.add(crown);
  }

  addBench(x, z, rotation = 0) {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x68513c, roughness: 0.9 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x303532, roughness: 0.7 });

    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.48), wood);
    seat.position.y = 0.55;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.1), wood);
    back.position.set(0, 0.9, 0.2);

    for (const legX of [-0.65, 0.65]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), metal);
      leg.position.set(legX, 0.28, 0);
      group.add(leg);
    }

    group.add(seat, back);
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    return this.add(group);
  }

  addRocket(x, z) {
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
    for (const finX of [-0.42, 0.42]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.72), finMaterial);
      fin.position.set(finX, 0, 1.12);
      group.add(fin);
    }

    group.add(body, nose);
    group.position.set(x, 0.42, z);
    group.rotation.z = 0.12;
    return this.add(group);
  }

  addMine(x, z, { rotation = 0, color = 0x596448, partiallyHidden = false } = {}) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.92 });

    const leftLobe = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 8), material);
    leftLobe.scale.set(1, 0.17, 0.62);
    leftLobe.position.x = -0.25;

    const rightLobe = leftLobe.clone();
    rightLobe.position.x = 0.25;

    const center = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.14, 0.12, 12),
      new THREE.MeshStandardMaterial({ color: 0x3f4937, roughness: 0.85 })
    );
    center.position.y = 0.07;

    group.add(leftLobe, rightLobe, center);
    group.position.set(x, partiallyHidden ? -0.035 : 0.055, z);
    group.rotation.y = rotation;
    return this.add(group);
  }

  addGoal(x, z, width = 6.5) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xefc84a,
      emissive: 0x4a3600,
      roughness: 0.55
    });

    const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 0.18), material);
    const rightPost = leftPost.clone();
    const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.18, 0.18), material);

    leftPost.position.set(x - width / 2, 1.6, z);
    rightPost.position.set(x + width / 2, 1.6, z);
    top.position.set(x, 3.12, z);

    const marker = new THREE.Mesh(
      new THREE.PlaneGeometry(width - 0.4, 3),
      new THREE.MeshBasicMaterial({
        color: 0xefc84a,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide
      })
    );
    marker.position.set(x, 1.5, z);

    this.add(leftPost);
    this.add(rightPost);
    this.add(top);
    return this.add(marker);
  }

  distanceToObject2D(object) {
    const position = new THREE.Vector3();
    object.getWorldPosition(position);
    return Math.hypot(
      this.camera.position.x - position.x,
      this.camera.position.z - position.z
    );
  }

  isObjectVisible(object, maxDistance, maxAngle) {
    const objectPosition = new THREE.Vector3();
    const cameraDirection = new THREE.Vector3();
    const toObject = new THREE.Vector3();

    object.getWorldPosition(objectPosition);
    this.camera.getWorldDirection(cameraDirection);
    toObject.subVectors(objectPosition, this.camera.position);

    if (toObject.length() > maxDistance) return false;

    return cameraDirection.angleTo(toObject.normalize()) <= maxAngle;
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

      if (event.code === "KeyE") {
        event.preventDefault();
        this.performAction();
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

  isBlocked(x, z) {
    if (
      x < this.bounds.minX ||
      x > this.bounds.maxX ||
      z < this.bounds.minZ ||
      z > this.bounds.maxZ
    ) {
      return true;
    }

    return this.colliders.some((box) =>
      x > box.minX - 0.3 &&
      x < box.maxX + 0.3 &&
      z > box.minZ - 0.3 &&
      z < box.maxZ + 0.3
    );
  }

  updateMovement(delta) {
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

    this.lastInputMagnitude = Math.hypot(forwardInput, rightInput);

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
  }

  update(delta) {
    if (!this.active || !this.currentStage) return;

    this.elapsedMs = performance.now() - this.startTime;
    this.updateMovement(delta);
    this.currentStage.update(this, delta);
  }

  animate() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.update(delta);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.animate);
  }
}
