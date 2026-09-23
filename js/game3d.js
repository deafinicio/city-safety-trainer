import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import RAPIER from "https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.20.0/+esm";
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
import { testCityWalk } from "./stages/testCityWalk.js";

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
  [stage11.id, stage11],
  [testCityWalk.id, testCityWalk]
]);

const PLAYER_RADIUS = 0.32;
const PLAYER_HALF_HEIGHT = 0.52;
const PLAYER_CENTER_HEIGHT = PLAYER_RADIUS + PLAYER_HALF_HEIGHT;
const CAMERA_EYE_OFFSET = 1.7 - PLAYER_CENTER_HEIGHT;

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

    this.graphicsProfile = this.resolveGraphicsProfile();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fa39f);
    this.scene.fog = new THREE.Fog(0xaebbb5, 38, 104);

    this.camera = new THREE.PerspectiveCamera(64, 1, 0.1, 160);
    this.camera.rotation.order = "YXZ";

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.graphicsProfile.name !== "performance",
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.graphicsProfile.maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.add(new THREE.HemisphereLight(0xdcecff, 0x364438, 1.7));
    const sun = new THREE.DirectionalLight(0xffe2ad, 3.15);
    sun.position.set(-22, 34, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(
      this.graphicsProfile.shadowMapSize,
      this.graphicsProfile.shadowMapSize
    );
    sun.shadow.camera.left = -34;
    sun.shadow.camera.right = 34;
    sun.shadow.camera.top = 38;
    sun.shadow.camera.bottom = -38;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 95;
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);

    const fillLight = new THREE.DirectionalLight(0xaecbdf, 0.62);
    fillLight.position.set(18, 12, -24);
    this.scene.add(fillLight);

    this.addAtmosphere();
    this.setupEnvironmentLighting();
    this.setupPostProcessing();
    this.setupAssetPipeline();

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
    this.surfaceMaterialCache = new Map();
    this.bounds = { minX: -8, maxX: 8, minZ: -30, maxZ: 20 };
    this.currentStage = null;
    this.currentStageId = null;
    this.stageState = {};
    this.activeAction = null;
    this.activeDialogue = null;
    this.dialogueHandler = null;
    this.lastCorrectOptionIndex = null;
    this.controlsLocked = false;
    this.movementLocked = false;
    this.movementSpeedMultiplier = 1;
    this.audioContext = null;
    this.elapsedMs = 0;
    this.startTime = 0;
    this.lastInputMagnitude = 0;
    this.startRequestId = 0;
    this.physicsInitialized = false;
    this.physicsWorld = null;
    this.characterController = null;
    this.playerCollider = null;
    this.verticalVelocity = 0;
    this.physicsReady = RAPIER.init().then(() => {
      this.physicsInitialized = true;
      this.resetPhysicsWorld();
    });

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

  resolveGraphicsProfile() {
    const requested = new URLSearchParams(window.location.search).get("quality");
    const profiles = {
      performance: {
        name: "performance",
        maxPixelRatio: 1.25,
        shadowMapSize: 1024,
        ambientOcclusion: false,
        bloom: false
      },
      balanced: {
        name: "balanced",
        maxPixelRatio: 1.6,
        shadowMapSize: 1024,
        ambientOcclusion: false,
        bloom: true
      },
      high: {
        name: "high",
        maxPixelRatio: 2,
        shadowMapSize: 2048,
        ambientOcclusion: true,
        bloom: true
      }
    };

    if (requested && profiles[requested]) return profiles[requested];

    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const memory = navigator.deviceMemory || 4;
    const cores = navigator.hardwareConcurrency || 4;

    if (coarsePointer || reducedMotion || memory <= 4) return profiles.performance;
    if (memory >= 8 && cores >= 8) return profiles.high;
    return profiles.balanced;
  }

  setupEnvironmentLighting() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileCubemapShader();
    this.environmentTarget = pmrem.fromScene(this.scene, 0.04);
    this.scene.environment = this.environmentTarget.texture;
    this.scene.environmentIntensity = 0.72;
    pmrem.dispose();
  }

  setupPostProcessing() {
    if (!this.graphicsProfile.ambientOcclusion && !this.graphicsProfile.bloom) {
      this.composer = null;
      return;
    }

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    if (this.graphicsProfile.ambientOcclusion) {
      this.gtaoPass = new GTAOPass(this.scene, this.camera, 1, 1);
      this.gtaoPass.blendIntensity = 0.72;
      this.gtaoPass.updateGtaoMaterial({
        radius: 0.28,
        distanceExponent: 1.7,
        thickness: 1.4,
        distanceFallOff: 0.82,
        scale: 1
      });
      this.gtaoPass.updatePdMaterial({
        lumaPhi: 10,
        depthPhi: 2,
        normalPhi: 3,
        radius: 4,
        radiusExponent: 1,
        rings: 2,
        samples: 12
      });
      this.composer.addPass(this.gtaoPass);
    }

    if (this.graphicsProfile.bloom) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.1, 0.22, 0.94);
      this.composer.addPass(this.bloomPass);
    }

    this.composer.addPass(new OutputPass());
  }

  setupAssetPipeline() {
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath(
      "https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/libs/draco/"
    );

    this.ktx2Loader = new KTX2Loader();
    this.ktx2Loader.setTranscoderPath(
      "https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/libs/basis/"
    );
    this.ktx2Loader.detectSupport(this.renderer);

    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.gltfLoader.setKTX2Loader(this.ktx2Loader);
  }

  async loadModel(url, {
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = 1,
    collidable = false
  } = {}) {
    const gltf = await this.gltfLoader.loadAsync(url);
    const model = gltf.scene;
    model.position.set(...position);
    model.rotation.set(...rotation);
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    this.add(model);

    if (collidable) {
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      this.addCollisionBox(center.x, center.z, size.x, size.z, rotation[1], 0, size.y);
    }

    return { model, animations: gltf.animations };
  }

  async addStageAssetInstances(url, instances, { collidable = false } = {}) {
    const targetRoot = this.stageRoot;

    try {
      const gltf = await this.gltfLoader.loadAsync(url);
      if (targetRoot !== this.stageRoot) return [];

      const models = instances.map((instance) => {
        const model = gltf.scene.clone(true);
        const position = instance.position || [0, 0, 0];
        const rotation = instance.rotation || [0, 0, 0];
        const scale = instance.scale ?? 1;

        model.position.set(...position);
        model.rotation.set(...rotation);
        if (Array.isArray(scale)) model.scale.set(...scale);
        else model.scale.setScalar(scale);
        model.updateMatrixWorld(true);
        this.add(model);

        if (collidable || instance.collidable) {
          const bounds = new THREE.Box3().setFromObject(model);
          const size = bounds.getSize(new THREE.Vector3());
          const center = bounds.getCenter(new THREE.Vector3());
          this.addCollisionBox(center.x, center.z, size.x, size.z, rotation[1], 0, size.y);
        }

        return model;
      });

      return models;
    } catch (error) {
      console.warn(`Не вдалося завантажити 3D-ресурс: ${url}`, error);
      return [];
    }
  }

  async addPhotorealApartmentFacades() {
    const targetRoot = this.stageRoot;
    const url = "assets/models/polyhaven/modular_urban_apartments_facade/modular_urban_apartments_facade_1k.glb";

    try {
      const { scene: library } = await this.gltfLoader.loadAsync(url);
      if (targetRoot !== this.stageRoot) return;

      const materialCopies = new Map();
      const getMaterial = (material) => {
        if (!materialCopies.has(material.uuid)) {
          const copy = material.clone();
          copy.side = THREE.DoubleSide;
          copy.envMapIntensity = 0.62;
          materialCopies.set(material.uuid, copy);
        }
        return materialCopies.get(material.uuid);
      };

      const clonePiece = (name, panelX, panelY, parent) => {
        const source = library.getObjectByName(name);
        if (!source) return;
        const piece = source.clone(false);
        piece.material = Array.isArray(source.material)
          ? source.material.map(getMaterial)
          : getMaterial(source.material);
        piece.position.set(panelX, panelY, 0);
        piece.rotation.set(0, 0, 0);
        piece.scale.set(1, 1, 1);
        piece.castShadow = true;
        piece.receiveShadow = true;
        parent.add(piece);
      };

      const createFacade = ({ x, z, rotation, doorPanels }) => {
        const facade = new THREE.Group();
        const panelCount = 13;
        const facadeLength = panelCount * 3;

        for (let panel = 0; panel < panelCount; panel += 1) {
          const panelX = -facadeLength / 2 + (panel + 1) * 3;
          const hasDoor = doorPanels.includes(panel);
          const groundWall = hasDoor
            ? "wall_door_centered_large_01"
            : "wall_window_centered_large_01";
          const groundInsert = hasDoor
            ? "door_centered_large_01"
            : "window_centered_large_01";

          clonePiece(groundWall, panelX, 0, facade);
          clonePiece(groundInsert, panelX, 0, facade);
          clonePiece("base_standard_01", panelX, 0, facade);
          clonePiece("dado_standard_standard_01", panelX, 0.72, facade);

          for (const floorY of [3, 6]) {
            clonePiece("wall_window_centered_large_01", panelX, floorY, facade);
            clonePiece("window_centered_large_01", panelX, floorY, facade);
          }

          clonePiece("cornice_standard_standard_01", panelX, 8.92, facade);
          clonePiece("crown_standard_standard_01", panelX, 9.08, facade);
        }

        facade.position.set(x, 0.03, z);
        facade.rotation.y = rotation;
        targetRoot.add(facade);
      };

      createFacade({ x: -7.98, z: -5, rotation: Math.PI / 2, doorPanels: [2, 8] });
      createFacade({ x: 8.08, z: -5, rotation: -Math.PI / 2, doorPanels: [4, 10] });
    } catch (error) {
      console.warn("Не вдалося завантажити PBR-фасади етапу 2", error);
    }
  }

  resetPhysicsWorld() {
    this.physicsWorld?.free();
    this.physicsWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.characterController = this.physicsWorld.createCharacterController(0.025);
    this.characterController.enableAutostep(0.32, 0.18, false);
    this.characterController.enableSnapToGround(0.3);
    this.characterController.setMaxSlopeClimbAngle(48 * Math.PI / 180);
    this.characterController.setMinSlopeSlideAngle(38 * Math.PI / 180);

    const ground = RAPIER.ColliderDesc.cuboid(80, 0.05, 80)
      .setTranslation(0, -0.05, 0)
      .setFriction(0.9);
    this.physicsWorld.createCollider(ground);

    const player = RAPIER.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS)
      .setTranslation(0, PLAYER_CENTER_HEIGHT, 0)
      .setFriction(0);
    this.playerCollider = this.physicsWorld.createCollider(player);
    this.verticalVelocity = 0;
  }

  clearStage() {
    const textures = new Set();
    this.stageRoot.traverse((object) => {
      object.geometry?.dispose();

      if (Array.isArray(object.material)) {
        object.material.forEach((material) => {
          [material.map, material.bumpMap, material.normalMap, material.roughnessMap]
            .filter(Boolean)
            .forEach((texture) => textures.add(texture));
          material.dispose();
        });
      } else {
        if (object.material) {
          [
            object.material.map,
            object.material.bumpMap,
            object.material.normalMap,
            object.material.roughnessMap
          ]
            .filter(Boolean)
            .forEach((texture) => textures.add(texture));
        }
        object.material?.dispose();
      }
    });
    textures.forEach((texture) => texture.dispose());

    this.scene.remove(this.stageRoot);
    this.stageRoot = new THREE.Group();
    this.scene.add(this.stageRoot);
    this.colliders = [];
    this.surfaceMaterialCache = new Map();
    if (this.physicsInitialized) this.resetPhysicsWorld();
  }

  loadStage(stageId) {
    const stage = STAGES.get(stageId);
    if (!stage) throw new Error("Невідомий етап: " + stageId);

    this.stop();
    this.clearStage();
    this.currentStage = stage;
    this.currentStageId = stageId;
    stage.build(this);
    this.physicsWorld?.step();
    this.onStageChange?.({
      id: stage.id,
      number: stage.number,
      title: stage.title,
      shortTitle: stage.shortTitle,
      instruction: stage.instruction
    });
  }

  async start(stageId) {
    const requestId = ++this.startRequestId;
    await this.physicsReady;
    if (requestId !== this.startRequestId) return;

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
    this.lastCorrectOptionIndex = null;
    this.lastInputMagnitude = 0;
    this.currentStage.reset(this);
    this.setMissionInstruction(this.currentStage.instruction);
    this.resize();
    this.active = true;
    this.clock.getDelta();
  }

  stop() {
    this.active = false;
    this.startRequestId += 1;
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

  retryCheckpoint() {
    if (!this.currentStage?.restartCheckpoint) return false;

    this.completed = false;
    this.clearAction();
    this.clearDialogue();
    this.movementLocked = false;
    this.movementSpeedMultiplier = 1;
    this.keys.clear();
    this.joystickVector.set(0, 0);
    this.joystickKnob.style.transform = "translate(0, 0)";
    this.lastInputMagnitude = 0;
    this.currentStage.restartCheckpoint(this);
    this.active = true;
    this.clock.getDelta();
    return true;
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
    const preparedDialogue = { ...dialogue };
    if ((dialogue.variant || "questions") === "questions") {
      const options = [...dialogue.options];
      for (let index = options.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [options[index], options[randomIndex]] = [options[randomIndex], options[index]];
      }

      if (dialogue.correctValue !== undefined && options.length > 1) {
        let correctIndex = options.findIndex((option) => option.value === dialogue.correctValue);
        if (correctIndex === this.lastCorrectOptionIndex) {
          const alternatives = options
            .map((_, index) => index)
            .filter((index) => index !== correctIndex && index !== this.lastCorrectOptionIndex);
          const targetIndex = alternatives[Math.floor(Math.random() * alternatives.length)];
          [options[correctIndex], options[targetIndex]] = [options[targetIndex], options[correctIndex]];
          correctIndex = targetIndex;
        }
        this.lastCorrectOptionIndex = correctIndex;
      }

      preparedDialogue.options = options;
    }

    this.activeDialogue = preparedDialogue;
    this.dialogueHandler = handler;
    this.controlsLocked = true;
    this.keys.clear();
    this.lastInputMagnitude = 0;

    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }

    this.onDialogueChange?.({
      visible: true,
      variant: preparedDialogue.variant || "questions",
      title: preparedDialogue.title,
      prompt: preparedDialogue.prompt,
      options: preparedDialogue.options
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

  playPhoneRingtone() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!this.audioContext) this.audioContext = new AudioContextClass();
    if (this.audioContext.state === "suspended") this.audioContext.resume();

    const startAt = this.audioContext.currentTime;
    for (const offset of [0, 0.22, 0.62, 0.84]) {
      const oscillator = this.audioContext.createOscillator();
      const overtone = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      oscillator.type = "sine";
      overtone.type = "triangle";
      oscillator.frequency.setValueAtTime(760, startAt + offset);
      overtone.frequency.setValueAtTime(1140, startAt + offset);
      gain.gain.setValueAtTime(0.0001, startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.085, startAt + offset + 0.025);
      gain.gain.setValueAtTime(0.085, startAt + offset + 0.13);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.2);
      oscillator.connect(gain);
      overtone.connect(gain);
      gain.connect(this.audioContext.destination);
      oscillator.start(startAt + offset);
      overtone.start(startAt + offset);
      oscillator.stop(startAt + offset + 0.21);
      overtone.stop(startAt + offset + 0.21);
    }
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

  addAtmosphere() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(118, 32, 18),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          topColor: { value: new THREE.Color(0x6f91a6) },
          horizonColor: { value: new THREE.Color(0xc8d2ce) },
          lowColor: { value: new THREE.Color(0x87958d) }
        },
        vertexShader: `
          varying vec3 vWorldPosition;
          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 topColor;
          uniform vec3 horizonColor;
          uniform vec3 lowColor;
          varying vec3 vWorldPosition;
          void main() {
            float height = normalize(vWorldPosition + vec3(0.0, 18.0, 0.0)).y;
            float upperMix = smoothstep(0.0, 0.78, max(height, 0.0));
            float lowerMix = smoothstep(-0.35, 0.04, height);
            vec3 lowerSky = mix(lowColor, horizonColor, lowerMix);
            gl_FragColor = vec4(mix(lowerSky, topColor, upperMix), 1.0);
          }
        `
      })
    );
    sky.frustumCulled = false;
    this.scene.add(sky);

    const sunCanvas = document.createElement("canvas");
    sunCanvas.width = 128;
    sunCanvas.height = 128;
    const sunContext = sunCanvas.getContext("2d");
    const gradient = sunContext.createRadialGradient(64, 64, 2, 64, 64, 62);
    gradient.addColorStop(0, "rgba(255, 247, 210, 1)");
    gradient.addColorStop(0.18, "rgba(255, 224, 156, 0.92)");
    gradient.addColorStop(0.55, "rgba(255, 210, 135, 0.22)");
    gradient.addColorStop(1, "rgba(255, 205, 125, 0)");
    sunContext.fillStyle = gradient;
    sunContext.fillRect(0, 0, 128, 128);
    const sunTexture = new THREE.CanvasTexture(sunCanvas);
    sunTexture.colorSpace = THREE.SRGBColorSpace;
    const sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sunTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    sunSprite.position.set(-58, 54, -74);
    sunSprite.scale.set(18, 18, 1);
    this.scene.add(sunSprite);
  }

  visualRandom(x, z, salt = 0) {
    const value = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
    return value - Math.floor(value);
  }

  createSurfaceTexture(surface, repeatX = 1, repeatY = 1) {
    const canvas = document.createElement("canvas");
    const textureSize = this.graphicsProfile.name === "high" ? 512 : 256;
    canvas.width = textureSize;
    canvas.height = textureSize;
    const context = canvas.getContext("2d");
    const image = context.createImageData(textureSize, textureSize);
    const contrast = {
      ground: 34,
      asphalt: 20,
      concrete: 24,
      wall: 16,
      wood: 26
    }[surface] ?? 18;
    let seed = Array.from(surface).reduce((total, char) => total + char.charCodeAt(0), 2166136261);
    const random = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967295;
    };

    for (let index = 0; index < image.data.length; index += 4) {
      const broadNoise = (random() - 0.5) * contrast;
      const fineNoise = (random() - 0.5) * contrast * 0.4;
      const value = Math.max(112, Math.min(250, 214 + broadNoise + fineNoise));
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);

    if (surface === "ground") {
      context.strokeStyle = "rgba(42, 55, 38, 0.22)";
      context.lineWidth = 1;
      const grassBladeCount = textureSize * 1.4;
      for (let index = 0; index < grassBladeCount; index += 1) {
        const x = random() * textureSize;
        const y = random() * textureSize;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + (random() - 0.5) * 6, y - 2 - random() * 7);
        context.stroke();
      }

      for (let index = 0; index < 34; index += 1) {
        context.fillStyle = `rgba(38, 53, 34, ${0.03 + random() * 0.055})`;
        context.beginPath();
        context.ellipse(
          random() * textureSize,
          random() * textureSize,
          8 + random() * 34,
          5 + random() * 18,
          random() * Math.PI,
          0,
          Math.PI * 2
        );
        context.fill();
      }
    }

    if (surface === "asphalt" || surface === "concrete") {
      context.strokeStyle = surface === "asphalt"
        ? "rgba(45, 48, 48, 0.2)"
        : "rgba(95, 92, 85, 0.16)";
      context.lineWidth = 1;
      for (let index = 0; index < 14; index += 1) {
        let x = random() * textureSize;
        let y = random() * textureSize;
        context.beginPath();
        context.moveTo(x, y);
        for (let segment = 0; segment < 4; segment += 1) {
          x += (random() - 0.5) * 24;
          y += 5 + random() * 15;
          context.lineTo(x, y);
        }
        context.stroke();
      }

      const aggregateCount = Math.floor(textureSize * 1.15);
      for (let index = 0; index < aggregateCount; index += 1) {
        const alpha = 0.035 + random() * 0.1;
        context.fillStyle = random() > 0.5
          ? `rgba(245, 242, 230, ${alpha})`
          : `rgba(30, 32, 31, ${alpha})`;
        const radius = 0.35 + random() * 1.35;
        context.beginPath();
        context.arc(random() * textureSize, random() * textureSize, radius, 0, Math.PI * 2);
        context.fill();
      }
    }

    if (surface === "wall") {
      const stain = context.createLinearGradient(0, 0, 0, textureSize);
      stain.addColorStop(0, "rgba(255,255,255,0.1)");
      stain.addColorStop(0.7, "rgba(255,255,255,0)");
      stain.addColorStop(1, "rgba(54,46,38,0.16)");
      context.fillStyle = stain;
      context.fillRect(0, 0, textureSize, textureSize);

      context.strokeStyle = "rgba(58, 49, 40, 0.075)";
      context.lineWidth = 1;
      for (let index = 0; index < 24; index += 1) {
        const x = random() * textureSize;
        const width = 1 + random() * 5;
        context.beginPath();
        context.moveTo(x, 0);
        context.bezierCurveTo(
          x - width,
          textureSize * 0.3,
          x + width,
          textureSize * 0.68,
          x + (random() - 0.5) * 5,
          textureSize
        );
        context.stroke();
      }
    }

    if (surface === "wood") {
      for (let y = 8; y < textureSize; y += 13) {
        context.strokeStyle = `rgba(68, 43, 25, ${0.08 + random() * 0.08})`;
        context.beginPath();
        context.moveTo(0, y + random() * 4);
        context.bezierCurveTo(
          textureSize * 0.27,
          y - 4,
          textureSize * 0.66,
          y + 5,
          textureSize,
          y + random() * 3
        );
        context.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(Math.max(1, repeatX), Math.max(1, repeatY));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  createSurfaceMaterial(
    color,
    surface,
    { roughness = 0.92, metalness = 0, repeatX = 1, repeatY = 1, bumpScale = 0.025 } = {}
  ) {
    const cacheKey = [
      color,
      surface,
      roughness,
      metalness,
      Number(repeatX).toFixed(2),
      Number(repeatY).toFixed(2),
      bumpScale
    ].join(":");
    const cached = this.surfaceMaterialCache.get(cacheKey);
    if (cached) return cached;

    const texture = this.createSurfaceTexture(surface, repeatX, repeatY);
    const material = new THREE.MeshStandardMaterial({
      color,
      map: texture,
      bumpMap: texture,
      bumpScale,
      roughness,
      metalness
    });
    this.surfaceMaterialCache.set(cacheKey, material);
    return material;
  }

  add(object) {
    object.traverse?.((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const transparent = materials.some((material) => material?.transparent && material.opacity < 0.95);
      child.castShadow = !transparent && !child.userData.noShadow;
      child.receiveShadow = !child.userData.noReceiveShadow;
    });
    this.stageRoot.add(object);
    return object;
  }

  setBounds(bounds) {
    this.bounds = bounds;
    if (!this.physicsInitialized) return;

    const thickness = 0.5;
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;

    this.addCollisionBox(bounds.minX - thickness / 2, centerZ, thickness, depth + 1);
    this.addCollisionBox(bounds.maxX + thickness / 2, centerZ, thickness, depth + 1);
    this.addCollisionBox(centerX, bounds.minZ - thickness / 2, width + 1, thickness);
    this.addCollisionBox(centerX, bounds.maxZ + thickness / 2, width + 1, thickness);
  }

  setPlayerPosition(x, z, groundY = 0) {
    this.camera.position.set(x, groundY + 1.7, z);
    this.verticalVelocity = 0;
    this.playerCollider?.setTranslation({ x, y: groundY + PLAYER_CENTER_HEIGHT, z }, true);
  }

  addGround(color, width = 110, depth = 110) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      this.createSurfaceMaterial(color, "ground", {
        repeatX: Math.max(4, width / 4),
        repeatY: Math.max(4, depth / 4),
        roughness: 1,
        bumpScale: 0.055
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    ground.userData.noShadow = true;
    return this.add(ground);
  }

  addRoad(x, z, width, depth, color) {
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.075, depth, Math.max(1, Math.round(width / 2)), 1, Math.max(1, Math.round(depth / 3))),
      this.createSurfaceMaterial(color, "asphalt", {
        repeatX: Math.max(1, width / 2.4),
        repeatY: Math.max(1, depth / 2.4),
        roughness: 0.97,
        bumpScale: 0.035
      })
    );
    road.position.set(x, 0.008, z);
    road.userData.noShadow = true;
    this.add(road);

    const roadColor = new THREE.Color(color);
    const hsl = {};
    roadColor.getHSL(hsl);
    const isHardSurface = hsl.s < 0.18;
    if (isHardSurface && Math.max(width, depth) >= 8) {
      const curbMaterial = this.createSurfaceMaterial(0xaaa79d, "concrete", {
        repeatX: Math.max(1, Math.max(width, depth) / 2),
        repeatY: 1,
        roughness: 0.97,
        bumpScale: 0.025
      });
      const vertical = depth >= width;
      const curbLength = vertical ? depth : width;
      for (const side of [-1, 1]) {
        const curb = new THREE.Mesh(
          new THREE.BoxGeometry(vertical ? 0.18 : curbLength, 0.16, vertical ? curbLength : 0.18),
          curbMaterial
        );
        curb.position.set(
          vertical ? x + side * (width / 2 + 0.08) : x,
          0.08,
          vertical ? z : z + side * (depth / 2 + 0.08)
        );
        this.add(curb);
      }

      if (this.graphicsProfile.name === "high") {
        const cover = new THREE.Mesh(
          new THREE.BoxGeometry(vertical ? 0.42 : 0.72, 0.025, vertical ? 0.72 : 0.42),
          new THREE.MeshStandardMaterial({ color: 0x343936, roughness: 0.52, metalness: 0.62 })
        );
        cover.position.set(
          vertical ? x + width * 0.33 : x - width * 0.25,
          0.058,
          vertical ? z - depth * 0.28 : z + depth * 0.3
        );
        this.add(cover);
      }
    }

    return road;
  }

  addPavedWalkway(x, z, width, depth, color = 0xa39f94) {
    const walkway = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.085, depth),
      this.createSurfaceMaterial(color, "concrete", {
        repeatX: Math.max(1, width / 1.6),
        repeatY: Math.max(1, depth / 1.6),
        roughness: 0.98,
        bumpScale: 0.032
      })
    );
    walkway.position.set(x, 0.035, z);
    walkway.receiveShadow = true;
    walkway.userData.noShadow = true;
    this.add(walkway);

    const seamMaterial = new THREE.MeshStandardMaterial({
      color: 0x5f605b,
      roughness: 1,
      transparent: true,
      opacity: 0.34
    });
    for (let offset = -depth / 2 + 1.5; offset < depth / 2; offset += 2) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(width - 0.1, 0.004, 0.018), seamMaterial);
      seam.position.set(x, 0.081, z + offset);
      seam.userData.noShadow = true;
      this.add(seam);
    }

    const centerSeam = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.004, depth - 0.12),
      seamMaterial
    );
    centerSeam.position.set(x, 0.081, z);
    centerSeam.userData.noShadow = true;
    this.add(centerSeam);
    return walkway;
  }

  addCollisionBox(x, z, width, depth, rotation = 0, padding = 0, height = 2.4) {
    const cos = Math.abs(Math.cos(rotation));
    const sin = Math.abs(Math.sin(rotation));
    const halfX = (width * cos + depth * sin) / 2 + padding;
    const halfZ = (width * sin + depth * cos) / 2 + padding;
    const collider = {
      minX: x - halfX,
      maxX: x + halfX,
      minZ: z - halfZ,
      maxZ: z + halfZ,
      physicsCollider: null
    };

    if (this.physicsWorld) {
      const halfAngle = rotation / 2;
      const descriptor = RAPIER.ColliderDesc.cuboid(
        width / 2 + padding,
        Math.max(0.05, height / 2),
        depth / 2 + padding
      )
        .setTranslation(x, Math.max(0.05, height / 2), z)
        .setRotation({ x: 0, y: Math.sin(halfAngle), z: 0, w: Math.cos(halfAngle) })
        .setFriction(0.8);
      collider.physicsCollider = this.physicsWorld.createCollider(descriptor);
    }

    this.colliders.push(collider);
    return collider;
  }

  addElevatedCollisionBox(x, y, z, width, height, depth, rotation = 0) {
    const cos = Math.abs(Math.cos(rotation));
    const sin = Math.abs(Math.sin(rotation));
    const halfX = (width * cos + depth * sin) / 2;
    const halfZ = (width * sin + depth * cos) / 2;
    const collider = {
      minX: x - halfX,
      maxX: x + halfX,
      minZ: z - halfZ,
      maxZ: z + halfZ,
      physicsCollider: null
    };

    if (this.physicsWorld) {
      const halfAngle = rotation / 2;
      const descriptor = RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2)
        .setTranslation(x, y, z)
        .setRotation({ x: 0, y: Math.sin(halfAngle), z: 0, w: Math.cos(halfAngle) })
        .setFriction(0.9);
      collider.physicsCollider = this.physicsWorld.createCollider(descriptor);
    }

    this.colliders.push(collider);
    return collider;
  }

  addCollisionCircle(x, z, radius) {
    const collider = {
      minX: x - radius,
      maxX: x + radius,
      minZ: z - radius,
      maxZ: z + radius,
      physicsCollider: null
    };

    if (this.physicsWorld) {
      const descriptor = RAPIER.ColliderDesc.cylinder(1.2, radius)
        .setTranslation(x, 1.2, z)
        .setFriction(0.8);
      collider.physicsCollider = this.physicsWorld.createCollider(descriptor);
    }

    this.colliders.push(collider);
    return collider;
  }

  addLocalCollisionBox(
    originX,
    originZ,
    localX,
    localZ,
    width,
    depth,
    rotation = 0,
    height = 2.4
  ) {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const worldX = originX + localX * cos + localZ * sin;
    const worldZ = originZ - localX * sin + localZ * cos;
    return this.addCollisionBox(worldX, worldZ, width, depth, rotation, 0, height);
  }

  addBuilding(x, y, z, width, height, depth, color, { collidable = true } = {}) {
    const building = new THREE.Mesh(
      new RoundedBoxGeometry(width, height, depth, 2, 0.055),
      this.createSurfaceMaterial(color, "wall", {
        repeatX: Math.max(1, width / 2.8),
        repeatY: Math.max(1, height / 2.8),
        roughness: 0.94,
        bumpScale: 0.018
      })
    );
    building.position.set(x, y, z);
    this.add(building);

    const baseY = y - height / 2;
    const plinth = new THREE.Mesh(
      new RoundedBoxGeometry(width + 0.08, 0.58, depth + 0.08, 2, 0.035),
      this.createSurfaceMaterial(0x555a57, "concrete", {
        repeatX: Math.max(1, width / 2),
        repeatY: Math.max(1, depth / 2),
        roughness: 0.98,
        bumpScale: 0.035
      })
    );
    plinth.position.set(x, baseY + 0.29, z);
    this.add(plinth);

    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xd9d8d1, roughness: 0.58, metalness: 0.08 });
    const sillMaterial = new THREE.MeshStandardMaterial({ color: 0x8c8b85, roughness: 0.88 });
    const revealMaterial = new THREE.MeshStandardMaterial({ color: 0x3f4544, roughness: 0.96 });
    const pipeMaterial = new THREE.MeshStandardMaterial({ color: 0x777d7a, roughness: 0.6, metalness: 0.34 });
    const faceOnX = Math.abs(x) >= Math.abs(z);
    const faceDirection = faceOnX ? (x > 0 ? -1 : 1) : (z > 0 ? -1 : 1);
    const faceLength = faceOnX ? depth : width;

    const placeOnFacade = (object, offset, objectY, outset = 0.02) => {
      if (faceOnX) {
        object.position.set(x + faceDirection * (width / 2 + outset), objectY, z + offset);
        object.rotation.y = faceDirection < 0 ? -Math.PI / 2 : Math.PI / 2;
      } else {
        object.position.set(x + offset, objectY, z + faceDirection * (depth / 2 + outset));
        object.rotation.y = faceDirection < 0 ? Math.PI : 0;
      }
      return object;
    };

    for (let floor = 2.82; floor < height - 0.4; floor += 2.1) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(faceLength + 0.06, 0.055, 0.075),
        new THREE.MeshStandardMaterial({ color: 0xaaa9a3, roughness: 0.86 })
      );
      placeOnFacade(band, 0, baseY + floor, 0.052);
      this.add(band);
    }

    for (let floor = 1.8; floor < height - 0.7; floor += 2.1) {
      for (let offset = -faceLength / 2 + 2; offset < faceLength / 2 - 1; offset += 3.2) {
        const lit = this.visualRandom(x + floor, z + offset, 4) > 0.77;
        const windowMaterial = new THREE.MeshPhysicalMaterial({
          color: lit ? 0xc5ad72 : 0x24363c,
          emissive: lit ? 0x5d431d : 0x071014,
          emissiveIntensity: lit ? 0.58 : 0.1,
          roughness: 0.1,
          metalness: 0.05,
          clearcoat: 0.72,
          clearcoatRoughness: 0.16
        });

        const reveal = new THREE.Mesh(new THREE.BoxGeometry(1.12, 1.3, 0.09), revealMaterial);
        placeOnFacade(reveal, offset, baseY + floor, 0.018);
        this.add(reveal);

        const windowMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(0.9, 1.06),
          windowMaterial
        );
        placeOnFacade(windowMesh, offset, baseY + floor, 0.071);
        this.add(windowMesh);

        const frame = new THREE.Group();
        const frameDepth = 0.075;
        for (const side of [-1, 1]) {
          const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.065, 1.17, frameDepth), frameMaterial);
          vertical.position.x = side * 0.49;
          frame.add(vertical);
        }
        for (const side of [-1, 1]) {
          const horizontal = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.065, frameDepth), frameMaterial);
          horizontal.position.y = side * 0.585;
          frame.add(horizontal);
        }
        const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.08, frameDepth), frameMaterial);
        frame.add(crossbar);
        const sill = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.08, 0.16), sillMaterial);
        sill.position.set(0, -0.65, 0.035);
        frame.add(sill);
        placeOnFacade(frame, offset, baseY + floor, 0.082);
        this.add(frame);

        if (
          this.graphicsProfile.name === "high" &&
          this.visualRandom(x + offset, z + floor, 9) > 0.82
        ) {
          const unit = new THREE.Group();
          const caseMesh = new THREE.Mesh(
            new RoundedBoxGeometry(0.62, 0.34, 0.24, 2, 0.035),
            new THREE.MeshStandardMaterial({ color: 0xc7c8c2, roughness: 0.66, metalness: 0.08 })
          );
          const fan = new THREE.Mesh(
            new THREE.CylinderGeometry(0.11, 0.11, 0.015, 18),
            new THREE.MeshStandardMaterial({ color: 0x505654, roughness: 0.72 })
          );
          fan.rotation.x = Math.PI / 2;
          fan.position.set(0.13, 0, 0.126);
          unit.add(caseMesh, fan);
          placeOnFacade(unit, offset + 0.78, baseY + floor - 0.34, 0.16);
          this.add(unit);
        }
      }
    }

    for (const pipeOffset of [-faceLength / 2 + 0.34, faceLength / 2 - 0.34]) {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.052, 0.058, Math.max(1, height - 0.3), 12),
        pipeMaterial
      );
      placeOnFacade(pipe, pipeOffset, baseY + height / 2, 0.105);
      this.add(pipe);

      const collarCount = Math.max(2, Math.floor(height / 2.2));
      for (let index = 0; index < collarCount; index += 1) {
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12), pipeMaterial);
        collar.rotation.x = Math.PI / 2;
        placeOnFacade(collar, pipeOffset, baseY + 0.7 + index * 2.1, 0.105);
        this.add(collar);
      }
    }

    const roofCap = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.22, 0.18, depth + 0.22),
      this.createSurfaceMaterial(0x6d706d, "concrete", {
        repeatX: Math.max(1, width / 3),
        repeatY: Math.max(1, depth / 3),
        roughness: 0.98,
        bumpScale: 0.025
      })
    );
    roofCap.position.set(x, y + height / 2 + 0.09, z);
    this.add(roofCap);

    const utilityBox = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(2.4, width * 0.34), 0.75, Math.min(2.2, depth * 0.18)),
      new THREE.MeshStandardMaterial({ color: 0x747a77, roughness: 0.82, metalness: 0.12 })
    );
    utilityBox.position.set(x + width * 0.14, y + height / 2 + 0.55, z - depth * 0.12);
    this.add(utilityBox);

    if (collidable) this.addCollisionBox(x, z, width, depth);
    return building;
  }

  addBrokenWall(x, z, width, depth, height, rotation) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth, Math.max(1, Math.round(width)), 1, 1),
      this.createSurfaceMaterial(0x77736d, "concrete", {
        repeatX: Math.max(1, width / 1.4),
        repeatY: Math.max(1, height / 1.4),
        roughness: 1,
        bumpScale: 0.045
      })
    );
    wall.position.set(x, height / 2, z);
    wall.rotation.y = rotation;
    this.add(wall);

    const rebarMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3b32,
      roughness: 0.72,
      metalness: 0.55
    });
    for (const side of [-0.32, 0.1, 0.38]) {
      const rebar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.75, 6), rebarMaterial);
      rebar.position.set(x + side * width, height + 0.24, z);
      rebar.rotation.z = 0.08 + side * 0.18;
      rebar.rotation.y = rotation;
      this.add(rebar);
    }

    this.addCollisionBox(x, z, width, depth, rotation);

    return wall;
  }

  addRubble(x, z, width, depth, height, color) {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      this.createSurfaceMaterial(color, "concrete", {
        repeatX: Math.max(1, width / 1.4),
        repeatY: Math.max(1, depth / 1.4),
        roughness: 1,
        bumpScale: 0.055
      })
    );
    base.position.set(x, height / 2, z);
    base.rotation.y = 0.08;
    this.add(base);

    for (let index = 0; index < 9; index += 1) {
      const chunk = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.22 + this.visualRandom(x, z, index) * 0.48, 0),
        new THREE.MeshStandardMaterial({ color: index % 2 ? 0x655f58 : 0x817a70 })
      );
      chunk.position.set(
        x + (this.visualRandom(x, z, index + 10) - 0.5) * width * 0.85,
        height + 0.12 + this.visualRandom(x, z, index + 20) * 0.34,
        z + (this.visualRandom(x, z, index + 30) - 0.5) * depth * 0.78
      );
      chunk.rotation.set(index * 0.31, index * 0.47, index * 0.17);
      this.add(chunk);
    }

    this.addCollisionBox(x, z, width, depth, base.rotation.y);

    return base;
  }

  addTree(x, z) {
    const group = new THREE.Group();
    const heightVariation = 0.88 + this.visualRandom(x, z, 1) * 0.3;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.3, 2.95 * heightVariation, 18, 5),
      this.createSurfaceMaterial(0x5a4632, "wood", {
        repeatX: 3,
        repeatY: 7,
        roughness: 1,
        bumpScale: 0.085
      })
    );
    trunk.position.y = 1.47 * heightVariation;
    trunk.rotation.z = (this.visualRandom(x, z, 2) - 0.5) * 0.055;
    group.add(trunk);

    const branchMaterial = new THREE.MeshStandardMaterial({ color: 0x4b3929, roughness: 1 });
    for (const [offsetX, offsetZ, tilt, branchY] of [
      [-0.34, 0.05, -0.58, 2.3],
      [0.31, -0.13, 0.54, 2.42],
      [-0.08, 0.24, -0.22, 2.65],
      [0.16, -0.22, 0.27, 2.76]
    ]) {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.105, 1.35, 10), branchMaterial);
      branch.position.set(offsetX * 0.7, branchY * heightVariation, offsetZ);
      branch.rotation.z = tilt;
      branch.rotation.x = offsetZ * 1.35;
      group.add(branch);
    }

    const rootMaterial = new THREE.MeshStandardMaterial({ color: 0x4b392a, roughness: 1 });
    for (let index = 0; index < 5; index += 1) {
      const root = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.1, 0.72, 8), rootMaterial);
      const angle = index * Math.PI * 0.4 + this.visualRandom(x, z, index + 30) * 0.45;
      root.position.set(Math.cos(angle) * 0.25, 0.075, Math.sin(angle) * 0.25);
      root.rotation.z = Math.PI / 2 - 0.12;
      root.rotation.y = -angle;
      group.add(root);
    }

    const foliageColors = [0x27452f, 0x31563a, 0x3e6843, 0x496f49];
    const foliageLayout = [
      [0, 3.42, 0, 1.16, 0.94, 1.08],
      [-0.72, 3.2, 0.1, 0.84, 0.82, 0.78],
      [0.68, 3.24, -0.1, 0.9, 0.82, 0.82],
      [0.05, 3.92, 0.14, 0.83, 0.74, 0.76],
      [-0.45, 3.72, -0.52, 0.72, 0.67, 0.7],
      [0.48, 3.63, 0.5, 0.76, 0.71, 0.72],
      [0.02, 3.1, 0.67, 0.7, 0.64, 0.68],
      [-0.08, 3.15, -0.7, 0.68, 0.62, 0.66]
    ];
    const clusterLimit = this.graphicsProfile.name === "performance" ? 5 : foliageLayout.length;
    foliageLayout.slice(0, clusterLimit).forEach(([
      offsetX,
      offsetY,
      offsetZ,
      radius,
      scaleY,
      scaleZ
    ], index) => {
      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(radius * heightVariation, 16, 12),
        new THREE.MeshStandardMaterial({
          color: foliageColors[(index + Math.floor(this.visualRandom(x, z, 5) * 3)) % foliageColors.length],
          roughness: 0.88,
          metalness: 0,
          envMapIntensity: 0.35
        })
      );
      crown.position.set(offsetX, offsetY * heightVariation, offsetZ);
      crown.scale.set(1, scaleY, scaleZ);
      crown.rotation.set(index * 0.24, index * 0.71, index * 0.16);
      group.add(crown);
    });

    group.position.set(x, 0, z);
    this.add(group);
    this.addCollisionCircle(x, z, 0.34);
  }

  addBench(x, z, rotation = 0) {
    const group = new THREE.Group();
    const wood = this.createSurfaceMaterial(0x76553a, "wood", {
      repeatX: 4,
      repeatY: 1,
      roughness: 0.88,
      bumpScale: 0.028
    });
    const metal = new THREE.MeshStandardMaterial({ color: 0x2e3432, roughness: 0.54, metalness: 0.42 });

    for (let slat = 0; slat < 4; slat += 1) {
      const seatSlat = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.1, 0.105), wood);
      seatSlat.position.set(0, 0.58, -0.19 + slat * 0.13);
      group.add(seatSlat);
    }

    for (let slat = 0; slat < 3; slat += 1) {
      const backSlat = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.16, 0.08), wood);
      backSlat.position.set(0, 0.79 + slat * 0.22, 0.25);
      backSlat.rotation.x = -0.08;
      group.add(backSlat);
    }

    for (const legX of [-0.65, 0.65]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.58, 0.1), metal);
      leg.position.set(legX, 0.29, -0.02);
      group.add(leg);

      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.58), metal);
      brace.position.set(legX, 0.42, 0.03);
      group.add(brace);

      const backSupport = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.74, 0.08), metal);
      backSupport.position.set(legX, 0.84, 0.22);
      backSupport.rotation.x = -0.08;
      group.add(backSupport);
    }

    const crossBrace = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.07, 0.07), metal);
    crossBrace.position.set(0, 0.31, 0);
    group.add(crossBrace);
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    this.addCollisionBox(x, z, 1.9, 0.62, rotation);
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
    this.addCollisionBox(x, z, 1.1, 3.5);
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
    this.addCollisionCircle(x, z, 0.58);
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
    this.addCollisionBox(x + 0.45, z, 3.8, 0.75);
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

    const body = new THREE.Mesh(new RoundedBoxGeometry(0.9, 1.05, 0.46, 5, 0.12), fabric);
    body.position.y = 0.53;
    group.add(body);

    const flap = new THREE.Mesh(
      new RoundedBoxGeometry(0.74, 0.4, 0.1, 4, 0.05),
      trim
    );
    flap.position.set(0, 0.72, 0.23);
    flap.rotation.x = -0.12;
    group.add(flap);

    const pocket = new THREE.Mesh(
      new RoundedBoxGeometry(0.62, 0.34, 0.17, 4, 0.06),
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

    for (const side of [-1, 1]) {
      const sidePocket = new THREE.Mesh(
        new RoundedBoxGeometry(0.16, 0.38, 0.3, 4, 0.05),
        trim
      );
      sidePocket.position.set(side * 0.49, 0.35, 0.01);
      group.add(sidePocket);
    }

    const zipper = new THREE.Mesh(
      new THREE.TorusGeometry(0.37, 0.012, 6, 24, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xb8bdba, metalness: 0.72, roughness: 0.3 })
    );
    zipper.position.set(0, 0.84, 0.255);
    zipper.rotation.z = Math.PI;
    group.add(zipper);

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
    phone.position.set(0.33, 0.88, 0.2);
    phone.rotation.set(-0.35, -0.18, 0.08);
    group.add(phone);

    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    group.userData.restRotationY = rotation;
    this.addCollisionBox(x, z, 0.95, 0.68, rotation);
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
    this.addCollisionCircle(x, z, 0.7);
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
    this.addCollisionBox(x, z, 2.15, 3.6, rotation);
    return this.add(group);
  }

  addParkedCar(x, z, rotation = 0, color = 0x4b6170) {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.24,
      metalness: 0.58,
      clearcoat: 0.88,
      clearcoatRoughness: 0.16
    });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x26383e,
      roughness: 0.08,
      metalness: 0.08,
      transparent: true,
      opacity: 0.86,
      clearcoat: 0.94,
      clearcoatRoughness: 0.1
    });
    const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x171a19, roughness: 0.9 });
    const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x232725, roughness: 0.5, metalness: 0.5 });
    const lightMaterial = new THREE.MeshStandardMaterial({
      color: 0xf2e8c8,
      emissive: 0x8f7743,
      emissiveIntensity: 0.35,
      roughness: 0.2
    });
    const rearLightMaterial = new THREE.MeshStandardMaterial({
      color: 0xa81f24,
      emissive: 0x4c080b,
      emissiveIntensity: 0.28,
      roughness: 0.24
    });

    const body = new THREE.Mesh(new RoundedBoxGeometry(1.82, 0.5, 3.48, 4, 0.16), bodyMaterial);
    body.position.y = 0.62;
    group.add(body);

    const hood = new THREE.Mesh(new RoundedBoxGeometry(1.72, 0.18, 1.02, 3, 0.065), bodyMaterial);
    hood.position.set(0, 0.91, -1.2);
    hood.rotation.x = -0.035;
    group.add(hood);

    const trunk = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.2, 0.72, 3, 0.06), bodyMaterial);
    trunk.position.set(0, 0.88, 1.39);
    group.add(trunk);

    const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.68, 1.65, 4, 0.2), glassMaterial);
    cabin.position.set(0, 1.18, -0.15);
    cabin.scale.set(0.96, 1, 0.94);
    group.add(cabin);

    const roof = new THREE.Mesh(new RoundedBoxGeometry(1.48, 0.09, 1.58, 3, 0.035), bodyMaterial);
    roof.position.set(0, 1.55, -0.14);
    group.add(roof);

    for (const wheelX of [-0.92, 0.92]) {
      for (const wheelZ of [-1.15, 1.15]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 28), tireMaterial);
        wheel.position.set(wheelX, 0.34, wheelZ);
        wheel.rotation.z = Math.PI / 2;
        group.add(wheel);

        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.15, 0.212, 20),
          new THREE.MeshStandardMaterial({ color: 0x8a8e8d, roughness: 0.34, metalness: 0.72 })
        );
        hub.position.copy(wheel.position);
        hub.rotation.z = Math.PI / 2;
        group.add(hub);
      }
    }

    for (const side of [-1, 1]) {
      const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.07), lightMaterial);
      headlight.position.set(side * 0.56, 0.72, -1.77);
      group.add(headlight);

      const tailLight = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.07), rearLightMaterial);
      tailLight.position.set(side * 0.58, 0.73, 1.77);
      group.add(tailLight);

      const mirror = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.14, 0.16, 2, 0.04), trimMaterial);
      mirror.position.set(side * 0.91, 1.25, -0.66);
      group.add(mirror);
    }

    for (const end of [-1, 1]) {
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.12, 0.11), trimMaterial);
      bumper.position.set(0, 0.42, end * 1.79);
      group.add(bumper);
    }

    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    this.addCollisionBox(x, z, 2.15, 3.65, rotation);
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
    this.addCollisionBox(x, z + 0.35, 2.8, 0.5);
    this.addCollisionBox(x + 1.45, z - 0.75, 1.1, 2.8);
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
    this.addCollisionBox(x - 1.18, z, 0.24, 0.55);
    this.addCollisionBox(x + 1.18, z, 0.24, 0.55);
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
    this.addLocalCollisionBox(x, z, 0, -0.72, 4.8, 0.18, rotation);
    this.addLocalCollisionBox(x, z, -2.38, -0.02, 0.18, 1.4, rotation);
    this.addLocalCollisionBox(x, z, 2.38, -0.02, 0.18, 1.4, rotation);
    this.addLocalCollisionBox(x, z, 0, -0.38, 3.2, 0.58, rotation);
    return this.add(group);
  }

  addMobileShelter(x, z, rotation = 0) {
    const group = new THREE.Group();
    const concrete = this.createSurfaceMaterial(0x8a8c87, "concrete", {
      repeatX: 3,
      repeatY: 4,
      roughness: 0.99,
      bumpScale: 0.055
    });
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
    this.addLocalCollisionBox(x, z, -1.55, 0, 0.32, 4.4, rotation);
    this.addLocalCollisionBox(x, z, 1.55, 0, 0.32, 4.4, rotation);
    this.addLocalCollisionBox(x, z, 0, -2.05, 3.4, 0.32, rotation);
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
    const concrete = this.createSurfaceMaterial(0xa09e93, "concrete", {
      repeatX: 1,
      repeatY: Math.max(2, length / 1.4),
      roughness: 1,
      bumpScale: 0.045
    });
    const lowGround = this.createSurfaceMaterial(0x454b42, "ground", {
      repeatX: 3,
      repeatY: Math.max(2, length / 1.8),
      roughness: 1,
      bumpScale: 0.05
    });

    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, length), concrete);
    curb.position.y = 0.19;
    group.add(curb);

    const depression = new THREE.Mesh(new THREE.PlaneGeometry(2.3, length), lowGround);
    depression.rotation.x = -Math.PI / 2;
    depression.position.set(1.32, -0.012, 0);
    group.add(depression);

    for (let offset = -length / 2 + 0.6; offset < length / 2; offset += 1.2) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.015, 0.035), lowGround);
      seam.position.set(0, 0.39, offset);
      group.add(seam);
    }

    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    this.addCollisionBox(x, z, 0.42, length, rotation);
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
      new THREE.PlaneGeometry(width, depth, Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(depth / 2))),
      this.createSurfaceMaterial(color, "concrete", {
        repeatX: Math.max(2, width / 2.5),
        repeatY: Math.max(2, depth / 2.5),
        roughness: 0.96,
        bumpScale: 0.025
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    return this.add(floor);
  }

  addInteriorCeiling(width, depth) {
    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.2, depth),
      this.createSurfaceMaterial(0x8f8e87, "wall", {
        repeatX: Math.max(2, width / 3),
        repeatY: Math.max(2, depth / 3),
        roughness: 0.96,
        bumpScale: 0.012
      })
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

      const pointLight = new THREE.PointLight(0xfff0c8, 1.2, 7.5, 2);
      pointLight.position.set(0, 3.82, z);
      this.add(pointLight);
    }
    return ceiling;
  }

  addInteriorWall(x, z, width, depth, height, color = 0xaaa79d) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      this.createSurfaceMaterial(color, "wall", {
        repeatX: Math.max(1, width / 2.4),
        repeatY: Math.max(1, height / 2.2),
        roughness: 0.94,
        bumpScale: 0.015
      })
    );
    wall.position.set(x, height / 2, z);
    this.add(wall);
    this.addCollisionBox(x, z, width, depth, 0, 0, height);
    return wall;
  }

  addWindowedWall(z, width = 15.5) {
    const group = new THREE.Group();
    const wallMaterial = this.createSurfaceMaterial(0xaaa79d, "wall", {
      repeatX: Math.max(2, width / 2.5),
      repeatY: 2,
      roughness: 0.95,
      bumpScale: 0.014
    });
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
    this.addCollisionBox(0, z, width, 0.3, 0, 0, 3.9);
    return this.add(group);
  }

  addStairwell(x, z) {
    const group = new THREE.Group();
    const concrete = this.createSurfaceMaterial(0x8e908b, "concrete", {
      repeatX: 3,
      repeatY: 3,
      roughness: 1,
      bumpScale: 0.042
    });
    const rail = new THREE.MeshStandardMaterial({ color: 0x343a38, roughness: 0.7, metalness: 0.25 });

    const back = new THREE.Mesh(new THREE.BoxGeometry(5.5, 4.2, 0.28), concrete);
    back.position.set(0, 2.1, -2.15);
    group.add(back);

    for (let index = 0; index < 6; index += 1) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.22, 0.55), concrete);
      step.position.set(1.15, 0.11 + index * 0.22, -1.55 + index * 0.43);
      group.add(step);
    }

    for (const railX of [-0.18, 2.48]) {
      const handrail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 2.8), rail);
      handrail.position.set(railX, 1.25, -0.35);
      handrail.rotation.x = -0.48;
      group.add(handrail);
    }

    const landing = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.16, 3.5), concrete);
    landing.position.set(0, 0.06, 1.05);
    group.add(landing);

    group.position.set(x, 0, z);
    this.addCollisionBox(x, z - 2.15, 5.5, 0.28);
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
    this.addCollisionBox(x, z, 2.3, 0.34, rotation);
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
    this.addCollisionBox(x, z, 2.3, 0.34, rotation);
    return this.add(group);
  }

  addWarningFence(x, z, length, rotation = 0, { collidable = true } = {}) {
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
    if (collidable) this.addCollisionBox(x, z, length, 0.18, rotation);
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
    this.addCollisionBox(x - width / 2, z, 0.18, 0.18);
    this.addCollisionBox(x + width / 2, z, 0.18, 0.18);
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
    if (this.active && !this.controlsLocked) {
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
    }
  }

  resize() {
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
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

    if (this.characterController && this.playerCollider) {
      const current = this.playerCollider.translation();
      this.verticalVelocity = Math.max(-12, this.verticalVelocity - 9.81 * delta);
      this.characterController.computeColliderMovement(this.playerCollider, {
        x: dx,
        y: this.verticalVelocity * delta,
        z: dz
      });

      const movement = this.characterController.computedMovement();
      const next = {
        x: current.x + movement.x,
        y: current.y + movement.y,
        z: current.z + movement.z
      };
      this.playerCollider.setTranslation(next, true);
      this.camera.position.set(next.x, next.y + CAMERA_EYE_OFFSET, next.z);

      if (this.characterController.computedGrounded() && this.verticalVelocity < 0) {
        this.verticalVelocity = -0.2;
      }
    } else {
      const nextX = this.camera.position.x + dx;
      const nextZ = this.camera.position.z + dz;

      if (!this.isBlocked(nextX, this.camera.position.z)) this.camera.position.x = nextX;
      if (!this.isBlocked(this.camera.position.x, nextZ)) this.camera.position.z = nextZ;
    }

    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  update(delta) {
    if (!this.active || !this.currentStage) return;

    const scenarioDelta = this.controlsLocked ? 0 : delta;
    this.elapsedMs += scenarioDelta * 1000;
    if (this.physicsWorld) {
      this.physicsWorld.timestep = delta;
      this.physicsWorld.step();
    }
    this.updateMovement(scenarioDelta);
    this.currentStage.update(this, scenarioDelta);
  }

  animate() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.update(delta);
    if (this.composer) {
      this.composer.render(delta);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    requestAnimationFrame(this.animate);
  }
}
