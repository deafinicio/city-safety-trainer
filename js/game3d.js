import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js";
import { stage01 } from "./stages/stage01.js";
import { stage02 } from "./stages/stage02.js";
import { stage03 } from "./stages/stage03.js";
import { stage04 } from "./stages/stage04.js";
import { stage05 } from "./stages/stage05.js";
import { stage06 } from "./stages/stage06.js";
import { stage07 } from "./stages/stage07.js";
import { stage08 } from "./stages/stage08.js";
import { stage09 } from "./stages/stage09.js";
import { stage10 } from "./stages/stage10.js";
import { stage11 } from "./stages/stage11.js";

const STAGES = new Map([
  [stage01.id, stage01],
  [stage02.id, stage02],
  [stage03.id, stage03],
  [stage04.id, stage04],
  [stage05.id, stage05],
  [stage06.id, stage06],
  [stage07.id, stage07],
  [stage08.id, stage08],
  [stage09.id, stage09],
  [stage10.id, stage10],
  [stage11.id, stage11]
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
    onDialogueChange,
    onInstructionChange,
    onStageChange
  }) {
    this.canvas = canvas;
    this.joystick = joystick;
    this.joystickKnob = joystickKnob;
    this.lookZone = lookZone;
    this.onSuccess = onSuccess;
    this.onFailure = onFailure;
    this.onActionChange = onActionChange;
    this.onDialogueChange = onDialogueChange;
    this.onInstructionChange = onInstructionChange;
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
    this.activeDialogue = null;
    this.dialogueHandler = null;
    this.controlsLocked = false;
    this.movementLocked = false;
    this.movementSpeedMultiplier = 1;
    this.audioContext = null;
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
    this.clearDialogue();
    this.movementLocked = false;
    this.movementSpeedMultiplier = 1;
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
    this.setMissionInstruction(this.currentStage.instruction);
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
    this.clearDialogue();
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
    this.clearDialogue();
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

  setDialogue(dialogue, handler) {
    this.activeDialogue = dialogue;
    this.dialogueHandler = handler;
    this.controlsLocked = true;
    this.keys.clear();
    this.lastInputMagnitude = 0;

    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }

    this.onDialogueChange?.({
      visible: true,
      variant: dialogue.variant || "questions",
      title: dialogue.title,
      prompt: dialogue.prompt,
      options: dialogue.options
    });
  }

  chooseDialogue(value) {
    if (this.activeDialogue && this.dialogueHandler) {
      this.dialogueHandler(value);
    }
  }

  clearDialogue() {
    this.activeDialogue = null;
    this.dialogueHandler = null;
    this.controlsLocked = false;
    this.onDialogueChange?.({
      visible: false,
      variant: "questions",
      title: "",
      prompt: "",
      options: []
    });
  }

  setMissionInstruction(text) {
    this.onInstructionChange?.(text);
  }

  openEmergencyDialer({ acceptedNumbers, onComplete, title = "Телефон екстреного виклику" }) {
    const allowedNumbers = new Set(acceptedNumbers);
    let dialedNumber = "";
    let errorText = "";

    const renderDialer = () => {
      const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
      const options = digits.map((digit) => ({
        label: digit,
        value: `digit:${digit}`,
        kind: "digit"
      }));

      options.push(
        { label: "⌫", value: "backspace", kind: "utility", ariaLabel: "Видалити останню цифру" },
        { label: "0", value: "digit:0", kind: "digit" },
        { label: "Виклик", value: "call", kind: "call" }
      );

      const numberDisplay = dialedNumber || "—";
      const error = errorText ? ` ${errorText}` : "";

      this.setDialogue(
        {
          variant: "dialer",
          title,
          prompt: `Наберіть номер служби: ${numberDisplay}.${error}`,
          options
        },
        (value) => {
          if (value.startsWith("digit:")) {
            if (dialedNumber.length < 3) dialedNumber += value.slice(-1);
            errorText = "";
            renderDialer();
            return;
          }

          if (value === "backspace") {
            dialedNumber = dialedNumber.slice(0, -1);
            errorText = "";
            renderDialer();
            return;
          }

          if (value === "call" && allowedNumbers.has(dialedNumber)) {
            onComplete(dialedNumber);
            return;
          }

          if (value === "call") {
            dialedNumber = "";
            errorText = `Правильний номер: ${acceptedNumbers.join(", ")}.`;
            renderDialer();
          }
        }
      );
    };

    renderDialer();
  }

  playAlertTone() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!this.audioContext) {
      this.audioContext = new AudioContextClass();
    }

    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }

    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const startAt = this.audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(720, startAt);
    oscillator.frequency.setValueAtTime(880, startAt + 0.12);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.13, startAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.32);

    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.34);
  }

  playVehicleStopSound() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!this.audioContext) this.audioContext = new AudioContextClass();
    if (this.audioContext.state === "suspended") this.audioContext.resume();

    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const startAt = this.audioContext.currentTime;

    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(105, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(38, startAt + 0.75);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.82);

    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.85);
  }

  playAirRaidSiren() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!this.audioContext) this.audioContext = new AudioContextClass();
    if (this.audioContext.state === "suspended") this.audioContext.resume();

    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const startAt = this.audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(430, startAt);
    oscillator.frequency.linearRampToValueAtTime(610, startAt + 0.7);
    oscillator.frequency.linearRampToValueAtTime(430, startAt + 1.4);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(0.12, startAt + 0.12);
    gain.gain.setValueAtTime(0.12, startAt + 1.22);
    gain.gain.linearRampToValueAtTime(0.0001, startAt + 1.48);

    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 1.5);
  }

  playApproachRumble() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!this.audioContext) this.audioContext = new AudioContextClass();
    if (this.audioContext.state === "suspended") this.audioContext.resume();

    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const startAt = this.audioContext.currentTime;

    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(62, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(112, startAt + 1.7);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.1, startAt + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.9);

    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 2);
  }

  playDroneBuzz(intensity = 0.08) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!this.audioContext) this.audioContext = new AudioContextClass();
    if (this.audioContext.state === "suspended") this.audioContext.resume();

    const oscillator = this.audioContext.createOscillator();
    const modulation = this.audioContext.createOscillator();
    const modulationGain = this.audioContext.createGain();
    const gain = this.audioContext.createGain();
    const startAt = this.audioContext.currentTime;

    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(96, startAt);
    modulation.type = "sine";
    modulation.frequency.setValueAtTime(17, startAt);
    modulationGain.gain.setValueAtTime(11, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.025, intensity), startAt + 0.08);
    gain.gain.setValueAtTime(Math.max(0.025, intensity), startAt + 1.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.25);

    modulation.connect(modulationGain);
    modulationGain.connect(oscillator.frequency);
    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start(startAt);
    modulation.start(startAt);
    oscillator.stop(startAt + 1.3);
    modulation.stop(startAt + 1.3);
  }

  playGunfireBurst(intensity = 0.2) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!this.audioContext) this.audioContext = new AudioContextClass();
    if (this.audioContext.state === "suspended") this.audioContext.resume();

    const startAt = this.audioContext.currentTime;
    for (const [index, offset] of [0, 0.2, 0.48, 0.76].entries()) {
      const duration = 0.13 + index * 0.008;
      const frameCount = Math.ceil(this.audioContext.sampleRate * duration);
      const buffer = this.audioContext.createBuffer(1, frameCount, this.audioContext.sampleRate);
      const data = buffer.getChannelData(0);

      for (let frame = 0; frame < frameCount; frame += 1) {
        const decay = 1 - frame / frameCount;
        data[frame] = (Math.random() * 2 - 1) * decay * decay;
      }

      const source = this.audioContext.createBufferSource();
      const filter = this.audioContext.createBiquadFilter();
      const gain = this.audioContext.createGain();
      filter.type = "bandpass";
      filter.frequency.value = 620 + index * 110;
      filter.Q.value = 0.55;
      gain.gain.setValueAtTime(Math.max(0.12, intensity), startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + duration);
      source.buffer = buffer;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.audioContext.destination);
      const thump = this.audioContext.createOscillator();
      const thumpGain = this.audioContext.createGain();
      thump.type = "square";
      thump.frequency.setValueAtTime(145, startAt + offset);
      thump.frequency.exponentialRampToValueAtTime(48, startAt + offset + 0.16);
      thumpGain.gain.setValueAtTime(Math.max(0.08, intensity * 0.75), startAt + offset);
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.18);
      thump.connect(thumpGain);
      thumpGain.connect(this.audioContext.destination);
      thump.start(startAt + offset);
      thump.stop(startAt + offset + 0.19);

      const delay = this.audioContext.createDelay(0.5);
      const echo = this.audioContext.createGain();
      delay.delayTime.setValueAtTime(0.16 + index * 0.012, startAt + offset);
      echo.gain.setValueAtTime(Math.max(0.035, intensity * 0.28), startAt + offset);
      echo.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.34);
      source.connect(delay);
      delay.connect(echo);
      echo.connect(this.audioContext.destination);
      source.start(startAt + offset);
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

  addUnofficialWarning(x, z) {
    const group = new THREE.Group();
    const branchMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a4732,
      roughness: 1
    });

    for (const angle of [-0.62, 0.62]) {
      const warningBranch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.09, 2.8, 7),
        branchMaterial
      );
      warningBranch.rotation.z = Math.PI / 2;
      warningBranch.rotation.y = angle;
      warningBranch.position.y = 0.11;
      group.add(warningBranch);
    }

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.2, 3.4, 9),
      branchMaterial
    );
    trunk.position.set(2.15, 1.7, 0.35);
    trunk.rotation.z = -0.04;
    group.add(trunk);

    const sideBranch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.1, 1.7, 8),
      branchMaterial
    );
    sideBranch.rotation.z = Math.PI / 2;
    sideBranch.rotation.y = -0.08;
    sideBranch.position.set(1.36, 2.25, 0.35);
    group.add(sideBranch);

    const twig = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.045, 0.72, 7),
      branchMaterial
    );
    twig.position.set(0.58, 1.95, 0.35);
    twig.rotation.z = 0.18;
    group.add(twig);

    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.68, 6),
      new THREE.MeshBasicMaterial({ color: 0x29251f })
    );
    cord.position.set(0.64, 1.62, 0.35);
    group.add(cord);

    const bottleMaterial = new THREE.MeshStandardMaterial({
      color: 0x4f8b78,
      transparent: true,
      opacity: 0.82,
      roughness: 0.35
    });

    const bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.16, 0.58, 12),
      bottleMaterial
    );
    bottle.position.set(0.64, 1.08, 0.35);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.075, 0.22, 10),
      bottleMaterial
    );
    neck.position.set(0.64, 1.48, 0.35);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.062, 0.062, 0.06, 10),
      new THREE.MeshStandardMaterial({ color: 0x2d4e43, roughness: 0.7 })
    );
    cap.position.set(0.64, 1.62, 0.35);

    group.add(bottle, neck, cap);
    group.position.set(x, 0, z);
    return this.add(group);
  }

  addTireTracks(x, z, length) {
    const soilMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a5145,
      roughness: 1
    });
    const treadMaterial = new THREE.MeshStandardMaterial({
      color: 0x30372e,
      roughness: 1
    });

    for (const side of [-1, 1]) {
      const trackX = x + side * 0.86;
      const compressedSoil = new THREE.Mesh(
        new THREE.PlaneGeometry(0.78, length),
        soilMaterial
      );
      compressedSoil.rotation.x = -Math.PI / 2;
      compressedSoil.position.set(trackX, 0.006, z);
      this.add(compressedSoil);

      const treadSpacing = 0.46;
      const treadCount = Math.floor(length / treadSpacing);
      for (let index = 0; index <= treadCount; index += 1) {
        const tread = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.025, 0.25),
          treadMaterial
        );
        tread.position.set(
          trackX,
          0.018,
          z - length / 2 + index * treadSpacing
        );
        tread.rotation.y = side * (index % 2 === 0 ? 0.13 : -0.13);
        this.add(tread);
      }
    }
  }

  addShellCasings(x, z, count = 8) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xa9822d,
      metalness: 0.55,
      roughness: 0.45
    });

    for (let index = 0; index < count; index += 1) {
      const casing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.03, 0.16, 8),
        material
      );
      const offsetX = Math.sin(index * 2.17) * 0.85;
      const offsetZ = Math.cos(index * 1.61) * 1.05;
      casing.position.set(x + offsetX, 0.05, z + offsetZ);
      casing.rotation.set(Math.PI / 2, index * 0.83, 0.15);
      this.add(casing);
    }
  }

  addBackpack(x, z, rotation = 0) {
    const group = new THREE.Group();
    const fabric = new THREE.MeshStandardMaterial({
      color: 0x263f52,
      roughness: 0.92
    });
    const trim = new THREE.MeshStandardMaterial({
      color: 0x17242e,
      roughness: 0.84
    });

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 0.95, 0.38),
      fabric
    );
    body.position.y = 0.53;
    group.add(body);

    const flap = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.38, 0.08),
      trim
    );
    flap.position.set(0, 0.72, 0.23);
    flap.rotation.x = -0.12;
    group.add(flap);

    const pocket = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.3, 0.14),
      fabric
    );
    pocket.position.set(0, 0.35, 0.27);
    group.add(pocket);

    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.035, 8, 18, Math.PI),
      trim
    );
    handle.position.set(0, 1.04, 0);
    handle.rotation.z = Math.PI;
    group.add(handle);

    for (const strapX of [-0.27, 0.27]) {
      const strap = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.78, 0.06),
        trim
      );
      strap.position.set(strapX, 0.5, -0.23);
      group.add(strap);
    }

    const phone = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.035, 0.46),
      new THREE.MeshStandardMaterial({
        color: 0x111619,
        metalness: 0.3,
        roughness: 0.35
      })
    );
    phone.position.set(0.52, 0.04, 0.08);
    phone.rotation.y = -0.35;
    group.add(phone);

    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    return this.add(group);
  }

  addAntiVehicleMine(x, z, rotation = 0) {
    const group = new THREE.Group();
    const casingMaterial = new THREE.MeshStandardMaterial({
      color: 0x4b543d,
      roughness: 0.84,
      metalness: 0.18
    });
    const detailMaterial = new THREE.MeshStandardMaterial({
      color: 0x30372d,
      roughness: 0.72,
      metalness: 0.28
    });

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.68, 0.24, 20),
      casingMaterial
    );
    body.position.y = 0.13;
    group.add(body);

    const pressurePlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.43, 0.1, 18),
      detailMaterial
    );
    pressurePlate.position.y = 0.3;
    group.add(pressurePlate);

    for (let index = 0; index < 8; index += 1) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.06, 0.52),
        casingMaterial
      );
      rib.position.y = 0.34;
      rib.rotation.y = (Math.PI * index) / 4;
      group.add(rib);
    }

    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    return this.add(group);
  }

  addCarInterior(x, z, rotation = 0) {
    const group = new THREE.Group();
    const interior = new THREE.MeshStandardMaterial({ color: 0x232826, roughness: 0.86 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x111514, roughness: 0.72 });
    const body = new THREE.MeshStandardMaterial({ color: 0x344c58, roughness: 0.62, metalness: 0.2 });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x8ca5aa,
      transparent: true,
      opacity: 0.16,
      roughness: 0.12
    });

    const dashboard = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.34, 0.72), interior);
    dashboard.position.set(0, 1.12, -1.02);
    dashboard.rotation.x = -0.12;
    group.add(dashboard);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.18, 1.75), body);
    hood.position.set(0, 0.9, -2.08);
    hood.rotation.x = -0.04;
    group.add(hood);

    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.0), glass);
    windshield.position.set(0, 1.76, -1.25);
    windshield.rotation.x = -0.16;
    group.add(windshield);

    const topFrame = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.13, 0.15), trim);
    topFrame.position.set(0, 2.28, -1.12);
    group.add(topFrame);

    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 0.16), trim);
      pillar.position.set(side * 1.03, 1.69, -1.02);
      pillar.rotation.z = side * -0.14;
      group.add(pillar);

      const door = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.95, 2.2), interior);
      door.position.set(side * 1.08, 1.08, 0.05);
      group.add(door);

      const sideWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.72), glass);
      sideWindow.position.set(side * 1.075, 1.78, 0.0);
      sideWindow.rotation.y = side * Math.PI / 2;
      group.add(sideWindow);
    }

    const steeringWheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.045, 10, 24),
      trim
    );
    steeringWheel.position.set(-0.38, 1.43, -0.74);
    steeringWheel.rotation.x = -0.18;
    group.add(steeringWheel);

    const steeringHub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 12), trim);
    steeringHub.position.set(-0.38, 1.43, -0.75);
    steeringHub.rotation.x = Math.PI / 2;
    group.add(steeringHub);

    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    return this.add(group);
  }

  addParkedCar(x, z, rotation = 0, color = 0x4b6170) {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 });
    const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x26383e, roughness: 0.28 });
    const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x171a19, roughness: 0.9 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.52, 3.5), bodyMaterial);
    body.position.y = 0.62;
    group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.7, 1.75), glassMaterial);
    cabin.position.set(0, 1.18, -0.15);
    group.add(cabin);

    for (const wheelX of [-0.92, 0.92]) {
      for (const wheelZ of [-1.15, 1.15]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 14), tireMaterial);
        wheel.position.set(wheelX, 0.34, wheelZ);
        wheel.rotation.z = Math.PI / 2;
        group.add(wheel);
      }
    }

    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    return this.add(group);
  }

  addPlayground(x, z) {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xe1ad2f, roughness: 0.7 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xc84b42, roughness: 0.72 });
    const sand = new THREE.MeshStandardMaterial({ color: 0xb99b68, roughness: 1 });

    const sandbox = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.12, 4.2), sand);
    sandbox.position.y = 0.04;
    group.add(sandbox);

    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.4, 8), metal);
      leg.position.set(side * 1.2, 1.2, 0.35);
      leg.rotation.z = side * 0.18;
      group.add(leg);
    }

    const swingTop = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.13, 0.13), metal);
    swingTop.position.set(0, 2.32, 0.35);
    group.add(swingTop);

    for (const chainX of [-0.35, 0.35]) {
      const chain = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 1.35, 6),
        new THREE.MeshStandardMaterial({ color: 0x5d625f, metalness: 0.5 })
      );
      chain.position.set(chainX, 1.61, 0.35);
      group.add(chain);
    }

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.09, 0.36), accent);
    seat.position.set(0, 0.94, 0.35);
    group.add(seat);

    const slide = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 2.7), accent);
    slide.position.set(1.45, 0.82, -0.75);
    slide.rotation.x = -0.52;
    group.add(slide);

    group.position.set(x, 0, z);
    return this.add(group);
  }

  addApartmentEntrance(x, z) {
    const group = new THREE.Group();
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xb7b3a8, roughness: 0.9 });
    const doorMaterial = new THREE.MeshBasicMaterial({ color: 0x111817 });
    const lightMaterial = new THREE.MeshStandardMaterial({
      color: 0xb7e0a5,
      emissive: 0x315c2a,
      emissiveIntensity: 1.5
    });

    const doorway = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.1), doorMaterial);
    doorway.position.y = 1.55;
    group.add(doorway);

    for (const side of [-1, 1]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.25, 0.28), frameMaterial);
      jamb.position.set(side * 1.18, 1.62, 0.03);
      group.add(jamb);
    }

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.2, 0.3), frameMaterial);
    lintel.position.set(0, 3.18, 0.03);
    group.add(lintel);

    const awning = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.16, 1.15), frameMaterial);
    awning.position.set(0, 3.52, 0.42);
    awning.rotation.x = -0.08;
    group.add(awning);

    const light = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.12), lightMaterial);
    light.position.set(0, 3.05, 0.19);
    group.add(light);

    group.position.set(x, 0, z);
    return this.add(group);
  }

  addGlassBusStop(x, z, rotation = 0) {
    const group = new THREE.Group();
    const frame = new THREE.MeshStandardMaterial({ color: 0x39413f, roughness: 0.55, metalness: 0.35 });
    const glass = new THREE.MeshStandardMaterial({
      color: 0xa9c7cb,
      transparent: true,
      opacity: 0.28,
      roughness: 0.12,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x505a57, roughness: 0.65 });

    const backGlass = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.55), glass);
    backGlass.position.set(0, 1.4, -0.72);
    group.add(backGlass);

    for (const side of [-1, 1]) {
      const sideGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.55), glass);
      sideGlass.position.set(side * 2.38, 1.4, -0.02);
      sideGlass.rotation.y = Math.PI / 2;
      group.add(sideGlass);

      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.8, 0.1), frame);
      post.position.set(side * 2.4, 1.4, -0.72);
      group.add(post);
    }

    const centerPost = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.8, 0.1), frame);
    centerPost.position.set(0, 1.4, -0.72);
    group.add(centerPost);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.16, 1.65), roofMaterial);
    roof.position.set(0, 2.78, -0.05);
    group.add(roof);

    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.14, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x6f543b, roughness: 0.88 })
    );
    bench.position.set(0, 0.58, -0.38);
    group.add(bench);

    for (const legX of [-1.2, 1.2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.58, 0.1), frame);
      leg.position.set(legX, 0.29, -0.38);
      group.add(leg);
    }

    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    return this.add(group);
  }

  addMobileShelter(x, z, rotation = 0) {
    const group = new THREE.Group();
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8a8c87, roughness: 0.98 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x111514 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf0eee7, roughness: 0.8 });
    const red = new THREE.MeshStandardMaterial({ color: 0xc9232b, roughness: 0.65 });

    const floor = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 4.4), concrete);
    floor.position.set(0, 0.05, 0);
    group.add(floor);

    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.9, 4.4), concrete);
      wall.position.set(side * 1.55, 1.5, 0);
      group.add(wall);
    }

    const back = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.9, 0.32), concrete);
    back.position.set(0, 1.5, -2.05);
    group.add(back);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.28, 4.65), concrete);
    roof.position.set(0, 3.0, -0.02);
    group.add(roof);

    const interior = new THREE.Mesh(new THREE.PlaneGeometry(2.75, 2.7), dark);
    interior.position.set(0, 1.43, 2.08);
    group.add(interior);

    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.92, 0.08), white);
    sign.position.set(0, 2.28, 2.22);
    group.add(sign);

    const crossVertical = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.64, 0.09), red);
    crossVertical.position.set(0, 2.28, 2.27);
    const crossHorizontal = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.22, 0.09), red);
    crossHorizontal.position.set(0, 2.28, 2.28);
    group.add(crossVertical, crossHorizontal);

    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    return this.add(group);
  }

  addAttackDrone(x, y, z) {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x343936, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 2.4, 10), bodyMaterial);
    body.rotation.x = Math.PI / 2;
    group.add(body);

    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, -0.75);
    wingShape.lineTo(2.15, 0.78);
    wingShape.lineTo(0.28, 0.35);
    wingShape.lineTo(-0.28, 0.35);
    wingShape.lineTo(-2.15, 0.78);
    wingShape.closePath();
    const wing = new THREE.Mesh(
      new THREE.ShapeGeometry(wingShape),
      new THREE.MeshStandardMaterial({ color: 0x414743, side: THREE.DoubleSide, roughness: 0.76 })
    );
    wing.rotation.x = -Math.PI / 2;
    wing.position.y = 0.05;
    group.add(wing);

    group.position.set(x, y, z);
    return this.add(group);
  }

  addCurbCover(x, z, length = 9, rotation = 0) {
    const group = new THREE.Group();
    const concrete = new THREE.MeshStandardMaterial({ color: 0xa09e93, roughness: 1 });
    const lowGround = new THREE.MeshStandardMaterial({ color: 0x454b42, roughness: 1 });

    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, length), concrete);
    curb.position.y = 0.19;
    group.add(curb);

    const depression = new THREE.Mesh(new THREE.PlaneGeometry(2.3, length), lowGround);
    depression.rotation.x = -Math.PI / 2;
    depression.position.set(-1.32, -0.012, 0);
    group.add(depression);

    for (let offset = -length / 2 + 0.6; offset < length / 2; offset += 1.2) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.015, 0.035), lowGround);
      seam.position.set(0, 0.39, offset);
      group.add(seam);
    }

    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    return this.add(group);
  }

  addFloorGuide(x, z, color = 0x80d99a) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.48,
      transparent: true,
      opacity: 0.78,
      roughness: 0.55
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 8, 24), material);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.035;
    group.add(ring);
    group.position.set(x, 0, z);
    return this.add(group);
  }

  addSafeZoneMarker(x, z, color = 0x80d99a) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.35, 32), material);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.025;
    group.add(disc);

    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.35, 2.6, 24, 1, true),
      material
    );
    column.position.y = 1.3;
    group.add(column);
    group.position.set(x, 0, z);
    return this.add(group);
  }

  addTextSign(text, x, y, z, rotation = 0, color = "#356b46") {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#f3f7f4";
    context.lineWidth = 16;
    context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    let fontSize = 92;
    do {
      context.font = `900 ${fontSize}px Arial, sans-serif`;
      fontSize -= 3;
    } while (context.measureText(text).width > 930 && fontSize > 36);
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 1.15),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
    );
    sign.position.set(x, y, z);
    sign.rotation.y = rotation;
    return this.add(sign);
  }

  addInteriorFloor(width, depth, color = 0x77766f) {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color, roughness: 0.96 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    return this.add(floor);
  }

  addInteriorCeiling(width, depth) {
    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.2, depth),
      new THREE.MeshStandardMaterial({ color: 0x8f8e87, roughness: 0.96 })
    );
    ceiling.position.y = 4.2;
    this.add(ceiling);

    const lightMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8e3cd,
      emissive: 0x6c684f,
      emissiveIntensity: 0.9
    });
    for (const z of [-6, 2, 9]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.42), lightMaterial);
      light.position.set(0, 4.08, z);
      this.add(light);
    }
    return ceiling;
  }

  addInteriorWall(x, z, width, depth, height, color = 0xaaa79d) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({ color, roughness: 0.94 })
    );
    wall.position.set(x, height / 2, z);
    this.add(wall);
    this.colliders.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2
    });
    return wall;
  }

  addWindowedWall(z, width = 15.5) {
    const group = new THREE.Group();
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xaaa79d, roughness: 0.95 });
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xe2e0d7, roughness: 0.75 });
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x7794a0,
      emissive: 0x0b1114,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0.48,
      roughness: 0.18,
      side: THREE.DoubleSide
    });

    const lowerWall = new THREE.Mesh(new THREE.BoxGeometry(width, 1.0, 0.3), wallMaterial);
    lowerWall.position.set(0, 0.5, 0);
    const upperWall = new THREE.Mesh(new THREE.BoxGeometry(width, 1.1, 0.3), wallMaterial);
    upperWall.position.set(0, 3.35, 0);
    group.add(lowerWall, upperWall);

    const windowCenters = [-4.8, 0, 4.8];
    for (const centerX of windowCenters) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.25), glassMaterial);
      pane.position.set(centerX, 2.08, 0.17);
      group.add(pane);

      for (const frameX of [-1.78, 1.78]) {
        const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.34), frameMaterial);
        vertical.position.set(centerX + frameX, 2.1, 0);
        group.add(vertical);
      }
      const middle = new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.1, 0.34), frameMaterial);
      middle.position.set(centerX, 2.08, 0);
      group.add(middle);
    }

    group.position.set(0, 0, z);
    group.userData.glassMaterial = glassMaterial;
    this.colliders.push({ minX: -width / 2, maxX: width / 2, minZ: z - 0.15, maxZ: z + 0.15 });
    return this.add(group);
  }

  addStairwell(x, z) {
    const group = new THREE.Group();
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8e908b, roughness: 1 });
    const rail = new THREE.MeshStandardMaterial({ color: 0x343a38, roughness: 0.7, metalness: 0.25 });

    const back = new THREE.Mesh(new THREE.BoxGeometry(5.5, 4.2, 0.28), concrete);
    back.position.set(0, 2.1, -2.15);
    group.add(back);

    for (let index = 0; index < 6; index += 1) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.22, 0.55), concrete);
      step.position.set(0.75, 0.11 + index * 0.22, -1.55 + index * 0.43);
      group.add(step);
    }

    const handrail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 2.8), rail);
    handrail.position.set(-1.0, 1.25, -0.35);
    handrail.rotation.x = -0.48;
    group.add(handrail);

    const landing = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.16, 3.5), concrete);
    landing.position.set(0, 0.06, 1.05);
    group.add(landing);

    group.position.set(x, 0, z);
    return this.add(group);
  }

  addMineSignBack(x, z, rotation = 0) {
    const group = new THREE.Group();
    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0x4b4034,
      roughness: 1
    });
    const backMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b908d,
      metalness: 0.2,
      roughness: 0.76
    });
    const hardwareMaterial = new THREE.MeshStandardMaterial({
      color: 0x515653,
      metalness: 0.48,
      roughness: 0.5
    });

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.09, 2.7, 10),
      postMaterial
    );
    post.position.set(0, 1.35, -0.12);
    group.add(post);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(2.25, 1.55, 0.11),
      backMaterial
    );
    board.position.set(0, 1.95, 0);
    group.add(board);

    for (const railY of [1.58, 2.32]) {
      const mountingRail = new THREE.Mesh(
        new THREE.BoxGeometry(1.82, 0.09, 0.075),
        hardwareMaterial
      );
      mountingRail.position.set(0, railY, 0.095);
      group.add(mountingRail);
    }

    for (const boltX of [-0.78, 0.78]) {
      for (const boltY of [1.58, 2.32]) {
        const bolt = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.045, 0.035, 12),
          hardwareMaterial
        );
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(boltX, boltY, 0.145);
        group.add(bolt);
      }
    }

    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    return this.add(group);
  }

  addMineWarningSign(x, z, rotation = 0) {
    const group = new THREE.Group();
    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0x4b4034,
      roughness: 1
    });
    const boardMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8e4d8,
      roughness: 0.9
    });

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.09, 2.7, 10),
      postMaterial
    );
    // The support sits behind the opaque board, so it cannot bleed through the sign face.
    post.position.set(0, 1.35, -0.12);
    group.add(post);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(2.25, 1.55, 0.11),
      boardMaterial
    );
    board.position.set(0, 1.95, 0);
    group.add(board);

    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 512;
    const context = canvas.getContext("2d");

    context.fillStyle = "#f4f0e5";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#d02027";
    context.lineWidth = 34;
    context.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

    const drawFittedText = (text, y, maxWidth, initialSize) => {
      let fontSize = initialSize;
      do {
        context.font = "900 " + fontSize + "px Arial, sans-serif";
        fontSize -= 2;
      } while (context.measureText(text).width > maxWidth && fontSize > 30);

      context.fillStyle = "#111";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, canvas.width / 2, y);
    };

    drawFittedText("НЕБЕЗПЕЧНО!", 82, 660, 72);

    context.save();
    context.strokeStyle = "#111";
    context.lineWidth = 28;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(270, 190);
    context.lineTo(498, 354);
    context.moveTo(498, 190);
    context.lineTo(270, 354);
    context.stroke();

    for (const [boneX, boneY] of [
      [270, 190], [498, 354], [498, 190], [270, 354]
    ]) {
      context.fillStyle = "#111";
      context.beginPath();
      context.arc(boneX, boneY, 18, 0, Math.PI * 2);
      context.fill();
    }

    context.fillStyle = "#111";
    context.beginPath();
    context.ellipse(384, 250, 92, 100, 0, 0, Math.PI * 2);
    context.fill();
    context.fillRect(320, 290, 128, 70);

    context.fillStyle = "#f4f0e5";
    context.beginPath();
    context.ellipse(350, 245, 24, 31, -0.15, 0, Math.PI * 2);
    context.ellipse(418, 245, 24, 31, 0.15, 0, Math.PI * 2);
    context.fill();

    context.beginPath();
    context.moveTo(384, 270);
    context.lineTo(365, 300);
    context.lineTo(403, 300);
    context.closePath();
    context.fill();

    context.strokeStyle = "#f4f0e5";
    context.lineWidth = 8;
    for (let toothX = 338; toothX <= 430; toothX += 23) {
      context.beginPath();
      context.moveTo(toothX, 315);
      context.lineTo(toothX, 353);
      context.stroke();
    }
    context.beginPath();
    context.moveTo(322, 332);
    context.lineTo(446, 332);
    context.stroke();
    context.restore();

    drawFittedText("МІНИ!", 432, 650, 98);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(2.12, 1.43),
      new THREE.MeshBasicMaterial({ map: texture })
    );
    face.position.set(0, 1.95, 0.058);
    group.add(face);

    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    return this.add(group);
  }

  addWarningFence(x, z, length, rotation = 0) {
    const group = new THREE.Group();
    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0x655646,
      roughness: 1
    });
    const redMaterial = new THREE.MeshStandardMaterial({
      color: 0xd3222a,
      emissive: 0x2a0203,
      roughness: 0.7
    });
    const whiteMaterial = new THREE.MeshStandardMaterial({
      color: 0xf0eee6,
      roughness: 0.75
    });

    const postCount = Math.max(3, Math.ceil(length / 2.1) + 1);
    for (let index = 0; index < postCount; index += 1) {
      const localX = -length / 2 + (length * index) / (postCount - 1);
      const fencePost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.06, 1.35, 8),
        postMaterial
      );
      fencePost.position.set(localX, 0.675, 0);
      group.add(fencePost);
    }

    const segmentCount = Math.max(2, Math.ceil(length / 0.55));
    const segmentLength = length / segmentCount;
    for (let index = 0; index < segmentCount; index += 1) {
      const tape = new THREE.Mesh(
        new THREE.BoxGeometry(segmentLength + 0.012, 0.13, 0.045),
        index % 2 === 0 ? redMaterial : whiteMaterial
      );
      tape.position.set(
        -length / 2 + segmentLength / 2 + index * segmentLength,
        0.96,
        0
      );
      group.add(tape);
    }

    group.position.set(x, 0, z);
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
    if (this.controlsLocked) {
      this.lastInputMagnitude = 0;
      return;
    }

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

    if (this.movementLocked) {
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      return;
    }

    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    const speed = 4.4 * this.movementSpeedMultiplier;
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
