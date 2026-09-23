import * as THREE from "three";

const CHECKPOINTS = {
  1: { x: 0, z: 54 },
  2: { x: 0, z: 43 },
  3: { x: 8.5, z: 34 },
  4: { x: -10, z: 21 },
  5: { x: -3.5, z: 13.5 },
  6: { x: 8, z: 3 },
  7: { x: 3, z: 1 },
  8: { x: -7.5, z: -13 },
  9: { x: -10, z: -23 },
  10: { x: 8, z: -36 },
  11: { x: 0, z: -55 }
};

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function createBox(world, {
  x, y, z, width, height, depth, color, surface = "wall", collidable = false,
  metalness = 0, roughness = 0.92
}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    world.createSurfaceMaterial(color, surface, {
      repeatX: Math.max(1, width / 2.4),
      repeatY: Math.max(1, Math.max(height, depth) / 2.4),
      roughness,
      metalness,
      bumpScale: surface === "wall" ? 0.018 : 0.035
    })
  );
  mesh.position.set(x, y, z);
  world.add(mesh);
  if (collidable) world.addElevatedCollisionBox(x, y, z, width, height, depth);
  return mesh;
}

function createBus(world) {
  const group = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: 0x2f6579, roughness: 0.48, metalness: 0.22 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x7698a7,
    roughness: 0.12,
    metalness: 0.08,
    transparent: true,
    opacity: 0.78,
    clearcoat: 0.8
  });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111413, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.3, 2.7, 9.5), blue);
  body.position.y = 1.75;
  group.add(body);
  for (const side of [-1, 1]) {
    for (let z = -3.2; z <= 3.2; z += 1.6) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.9), glass);
      pane.position.set(side * 1.655, 2.25, z);
      pane.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(pane);
    }
    for (const z of [-3.2, 3.1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.34, 18), rubber);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.65, 0.62, z);
      group.add(wheel);
    }
  }
  group.position.set(22.5, 0, 51);
  world.add(group);
  world.addCollisionBox(22.5, 51, 3.3, 9.5, 0, 0, 3.2);
  return group;
}

function createCafe(world) {
  const wall = 0x80796b;
  createBox(world, { x: -10, y: 2.2, z: 18, width: 10, height: 4.4, depth: 0.35, color: wall, collidable: true });
  createBox(world, { x: -14.8, y: 2.2, z: 22.5, width: 0.35, height: 4.4, depth: 9, color: wall, collidable: true });
  createBox(world, { x: -5.2, y: 2.2, z: 22.5, width: 0.35, height: 4.4, depth: 9, color: wall, collidable: true });
  createBox(world, { x: -13.4, y: 2.2, z: 27, width: 2.8, height: 4.4, depth: 0.35, color: wall, collidable: true });
  createBox(world, { x: -6.6, y: 2.2, z: 27, width: 2.8, height: 4.4, depth: 0.35, color: wall, collidable: true });
  createBox(world, { x: -10, y: 4.45, z: 22.5, width: 10.2, height: 0.28, depth: 9.2, color: 0x4e4b44, collidable: false });
  world.addTextSign("КАФЕ · ВІДЧИНЕНО", -10, 3.4, 27.2, Math.PI, "#5f3f28");
}

function createGlassFacade(world) {
  const frame = new THREE.MeshStandardMaterial({ color: 0x3e4747, roughness: 0.38, metalness: 0.65 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x7293a1,
    roughness: 0.08,
    metalness: 0.04,
    transparent: true,
    opacity: 0.58,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    side: THREE.DoubleSide
  });
  const group = new THREE.Group();
  for (let z = 25; z <= 45; z += 4) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 4.5), glass);
    pane.position.set(-22.9, 2.35, z);
    pane.rotation.y = Math.PI / 2;
    group.add(pane);
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.16, 5, 0.16), frame);
    mullion.position.set(-22.75, 2.5, z - 1.9);
    group.add(mullion);
  }
  world.add(group);
  world.addCollisionBox(-23.1, 35, 0.45, 24, 0, 0, 5);
  return group;
}

function createParticles(world, color, count, origin, spread = 1.5) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.08 });
  for (let index = 0; index < count; index += 1) {
    const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.07 + Math.random() * 0.13), material);
    shard.position.set(
      origin.x + (Math.random() - 0.5) * spread,
      origin.y + Math.random() * spread,
      origin.z + (Math.random() - 0.5) * spread
    );
    shard.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      1.5 + Math.random() * 4,
      (Math.random() - 0.5) * 4
    );
    group.add(shard);
  }
  group.visible = false;
  group.userData.age = 0;
  world.add(group);
  return group;
}

function activateParticles(group) {
  group.visible = true;
  group.userData.age = 0;
}

function updateParticles(group, delta) {
  if (!group?.visible) return;
  group.userData.age += delta;
  for (const shard of group.children) {
    shard.userData.velocity.y -= 7.5 * delta;
    shard.position.addScaledVector(shard.userData.velocity, delta);
    shard.rotation.x += delta * 5;
    shard.rotation.z += delta * 3;
  }
  if (group.userData.age > 3.2) group.visible = false;
}

function createMilitaryCrate(world, x, z) {
  const group = new THREE.Group();
  const wood = world.createSurfaceMaterial(0x5b6245, "wood", { roughness: 0.95, repeatX: 2, repeatY: 1 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.1), wood);
  box.position.y = 0.45;
  group.add(box);
  for (const offset of [-0.62, 0.62]) {
    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.94, 1.14),
      new THREE.MeshStandardMaterial({ color: 0x30352e, roughness: 0.65, metalness: 0.3 })
    );
    strap.position.set(offset, 0.45, 0);
    group.add(strap);
  }
  group.position.set(x, 0, z);
  world.addCollisionBox(x, z, 1.8, 1.1, 0, 0, 0.9);
  return world.add(group);
}

function createFallenPole(world, x, z) {
  const group = new THREE.Group();
  const concrete = world.createSurfaceMaterial(0x777970, "concrete", { roughness: 1, repeatX: 5, repeatY: 1 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 9, 12), concrete);
  pole.rotation.z = Math.PI / 2;
  pole.position.y = 0.34;
  group.add(pole);
  const wireMaterial = new THREE.MeshStandardMaterial({ color: 0x171a18, roughness: 0.7, metalness: 0.55 });
  for (const dz of [-0.35, 0.35]) {
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 8.5, 8), wireMaterial);
    wire.rotation.z = Math.PI / 2;
    wire.position.set(0, 0.12, dz);
    group.add(wire);
  }
  group.position.set(x, 0, z);
  world.addCollisionBox(x, z, 9, 0.62, 0, 0, 0.7);
  return world.add(group);
}

function createStairsAndProtectedLanding(world) {
  const concrete = world.createSurfaceMaterial(0x898b86, "concrete", {
    roughness: 1,
    repeatX: 4,
    repeatY: 2,
    bumpScale: 0.04
  });
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x303635, roughness: 0.52, metalness: 0.55 });
  const stepCount = 14;
  for (let index = 0; index < stepCount; index += 1) {
    const height = 0.2 * (index + 1);
    const x = 4.45 + index * 0.88;
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.92, height, 3.4), concrete);
    step.position.set(x, height / 2, -57.2);
    world.add(step);
    world.addElevatedCollisionBox(x, height / 2, -57.2, 0.92, height, 3.4);
  }
  createBox(world, {
    x: 24.2, y: 1.4, z: -57.2, width: 15.1, height: 2.8, depth: 12.5,
    color: 0x858780, surface: "concrete", collidable: true
  });
  for (const z of [-55.45, -58.95]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(12.3, 0.09, 0.09), railMaterial);
    rail.position.set(10.1, 2.0, z);
    rail.rotation.z = -0.22;
    world.add(rail);
  }

  createBox(world, { x: 16.65, y: 3.1, z: -63.25, width: 1.3, height: 6.2, depth: 0.35, color: 0x9a9b94 });
  createBox(world, { x: 26.8, y: 3.1, z: -63.25, width: 11, height: 6.2, depth: 0.35, color: 0x9a9b94 });
  createBox(world, { x: 19.3, y: 1.5, z: -63.25, width: 4.2, height: 3, depth: 0.35, color: 0x9a9b94 });
  createBox(world, { x: 19.3, y: 5.9, z: -63.25, width: 4.2, height: 0.6, depth: 0.35, color: 0x9a9b94 });
  world.addCollisionBox(24.8, -63.25, 17.6, 0.35, 0, 0, 6.2);
  createBox(world, { x: 26.5, y: 3.1, z: -59.45, width: 10.5, height: 6.2, depth: 0.38, color: 0x999a94, collidable: true });
  createBox(world, { x: 22.1, y: 3.1, z: -56.1, width: 0.42, height: 6.2, depth: 6.4, color: 0x92948e, collidable: true });
  createBox(world, { x: 31.8, y: 3.1, z: -56.7, width: 0.35, height: 6.2, depth: 12.7, color: 0x999a94, collidable: true });

  const windowMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x6f8e9c,
    transparent: true,
    opacity: 0.56,
    roughness: 0.1,
    metalness: 0.05,
    clearcoat: 1
  });
  const window = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.3), windowMaterial);
  window.position.set(19.3, 4.25, -63.05);
  world.add(window);

  const markerMaterial = new THREE.MeshStandardMaterial({
    color: 0x77e29c,
    emissive: 0x2a7b46,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide
  });
  const marker = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), markerMaterial);
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(28.2, 2.825, -54.3);
  marker.visible = false;
  world.add(marker);
  return { marker, window };
}

function buildEnvironment(world, stage) {
  world.setBounds({ minX: -38, maxX: 38, minZ: -65, maxZ: 59 });
  world.addGround(0x596457, 80, 132);

  world.addRoad(0, 34, 17, 50, 0x666a67);
  world.addPavedWalkway(-14.2, 35, 10.5, 48, 0x96958e);
  world.addPavedWalkway(13.8, 35, 10, 48, 0x99978f);
  world.addRoad(0, 10.5, 54, 12, 0x636764);
  world.addPavedWalkway(0, -14, 8, 42, 0x97968d);
  world.addRoad(9.5, -11, 5.2, 42, 0x6e695b);
  world.addRoad(-9, -15, 4.8, 36, 0x736d5e);
  world.addRoad(0, -45, 24, 20, 0x70736e);

  world.addBuilding(-31, 6.5, 34, 15, 13, 52, 0x686d6c);
  world.addBuilding(31, 7, 34, 15, 14, 52, 0x74736c);
  world.addBuilding(-25, 7, -13, 16, 14, 42, 0x77726a);
  world.addBuilding(27, 7, -18, 14, 14, 34, 0x686c68);

  stage.bus = createBus(world);
  world.addGlassBusStop(-10, 49, 0);
  stage.backpack = world.addBackpack(-7.2, 48.4, -0.18);
  stage.glassFacade = createGlassFacade(world);
  world.addMobileShelter(8.5, 34, Math.PI);
  world.addParkedCar(4.2, 13.3, Math.PI / 2, 0x465a65);
  world.addCurbCover(-3.4, 12.8, 9, Math.PI / 2);
  createCafe(world);
  stage.shahed = world.addAttackDrone(-24, 8, 42);
  stage.fpv = world.addAttackDrone(24, 5.5, 27);
  stage.fpv.scale.setScalar(0.38);

  for (const [x, z] of [[-18, 51], [17, 46], [-17, 20], [18, 18], [-20, -2], [20, -5], [-18, -27], [19, -31], [-13, -43], [13, -44]]) {
    world.addTree(x, z);
  }
  world.addBench(-15, 44, Math.PI / 2);
  world.addBench(15, 22, -Math.PI / 2);

  stage.officialSign = world.addMineWarningSign(0, 6.5, Math.PI);
  stage.officialGuides = [world.addFloorGuide(7, 6), world.addFloorGuide(9.3, 1.5)];
  stage.unofficial = world.addUnofficialWarning(9.2, -4.2);
  createMilitaryCrate(world, 11.3, -5.3);
  world.addShellCasings?.(8.3, -4.8);
  stage.reverseSign = world.addMineSignBack(-7.8, -10.2, 0.12);
  createFallenPole(world, -9.7, -20.2);
  stage.pfmMines = [
    world.addMine(-11.2, -18.4),
    world.addMine(-9.1, -20.6),
    world.addMine(-7.8, -22.1)
  ];

  world.addBrokenWall(0, -30.5, 8.5, 0.7, 3.2, 0);
  world.addRubble(0, -30.8, 9, 7, 2.5, 0x74726b);
  stage.rocket = world.addRocket(0.2, -30.2);
  world.addRoad(9.5, -30.2, 6, 13, 0x625a49);
  stage.rubbleGuides = [
    world.addFloorGuide(7.5, -25.5),
    world.addFloorGuide(10, -30),
    world.addFloorGuide(8, -35.5)
  ];

  createBox(world, { x: -10, y: 5.5, z: -61.5, width: 16, height: 11, depth: 12, color: 0x6f716d, collidable: true });
  createBox(world, { x: 14.5, y: 5.5, z: -66.5, width: 16, height: 11, depth: 10, color: 0x777873, collidable: false });
  createBox(world, { x: -5, y: 3, z: -54.6, width: 8, height: 6, depth: 0.45, color: 0x747671, collidable: true });
  createBox(world, { x: 5.2, y: 3, z: -54.6, width: 6.5, height: 6, depth: 0.45, color: 0x747671, collidable: true });
  world.addTextSign("ПІД'ЇЗД", 0, 4.35, -54.35, 0, "#355c45");
  const landing = createStairsAndProtectedLanding(world);
  stage.safeMarker = landing.marker;
  stage.landingWindow = landing.window;
  stage.stairGuides = [
    world.addFloorGuide(2.8, -57.2),
    world.addFloorGuide(9, -57.2),
    world.addFloorGuide(16.8, -57.2),
    world.addFloorGuide(19.8, -53.1)
  ];
  stage.stairGuides.forEach((guide, index) => {
    if (index > 0) guide.position.y = 0.2 + index * 0.72;
  });

  stage.glassBurst = createParticles(world, 0xb9d8e1, 32, { x: -20.5, y: 1.2, z: 34 }, 6);
  stage.curbBurst = createParticles(world, 0xa9a79c, 20, { x: -3.4, y: 0.3, z: 12.8 }, 2.4);
  stage.rubbleBurst = createParticles(world, 0x77736a, 30, { x: 0, y: 2.2, z: -31 }, 4);
  stage.entryBurst = createParticles(world, 0xa69b84, 38, { x: 0, y: 1, z: -48 }, 6);

  [...stage.officialGuides, ...stage.rubbleGuides, ...stage.stairGuides].forEach((guide) => {
    guide.visible = false;
  });
}

export const testCityWalk = {
  id: "test-city-walk",
  number: "ТЕСТ",
  title: "Прогулянка містом — єдиний сценарний маршрут",
  shortTitle: "Прогулянка містом",
  instruction: "Вийдіть з автобуса та дістаньтеся захищеної зони цільового будинку.",

  build(world) {
    buildEnvironment(world, this);
  },

  reset(world) {
    this.safeMarker.visible = false;
    [...this.officialGuides, ...this.rubbleGuides, ...this.stairGuides].forEach((guide) => {
      guide.visible = false;
    });
    world.setPlayerPosition(CHECKPOINTS[1].x, CHECKPOINTS[1].z);
    world.yaw = 0;
    world.camera.rotation.set(0, 0, 0);
    world.stageState = {
      phase: 1,
      checkpointPhase: 1,
      phaseStartedAt: world.elapsedMs,
      routeStartedAt: world.elapsedMs,
      instructionBase: "Відійдіть від автобуса. Не наближайтеся до рюкзака, з якого чути дзвінок.",
      lastInstructionSecond: -1,
      eventsCompleted: 0,
      emergencyCalls: 0,
      markedHazards: 0,
      lastRingAt: -5000,
      waitUntil: null,
      warned: false,
      phoneDecisionShown: false,
      finalDecisionMade: false,
      crouched: false,
      threatPlayed: false,
      curbThreatAt: null,
      markHazardAfterWait: false,
      busStartZ: this.bus.position.z
    };
    world.playVehicleStopSound();
    world.setDialogue(
      {
        title: "Оперативне сповіщення",
        prompt: "Повітряна тривога. Орієнтовний підліт ворожих засобів ураження — до 10 хвилин. Ваше завдання: взяти ліки в цільовому будинку та перейти у захищену зону за двома стінами.",
        correctValue: "start",
        options: [{ label: "Розпочати маршрут", value: "start" }]
      },
      () => {
        world.clearDialogue();
        world.stageState.lastInstructionSecond = -1;
        this.refreshInstruction(world);
      }
    );
  },

  restartCheckpoint(world) {
    const state = world.stageState;
    const phase = state.checkpointPhase || state.phase || 1;
    const checkpoint = CHECKPOINTS[phase] || CHECKPOINTS[1];
    world.setPlayerPosition(checkpoint.x, checkpoint.z);
    world.yaw = phase >= 11 ? -Math.PI / 2 : 0;
    world.camera.rotation.set(0, world.yaw, 0);
    state.phase = phase;
    state.phaseStartedAt = world.elapsedMs;
    state.waitUntil = null;
    state.warned = false;
    state.phoneDecisionShown = false;
    state.finalDecisionMade = false;
    state.crouched = false;
    state.curbThreatAt = null;
    state.markHazardAfterWait = false;
    world.movementLocked = false;
    this.configurePhase(world, phase, true);
  },

  setInstruction(world, text) {
    if (world.stageState.instructionBase === text) return;
    world.stageState.instructionBase = text;
    world.stageState.lastInstructionSecond = -1;
    this.refreshInstruction(world);
  },

  refreshInstruction(world) {
    const state = world.stageState;
    const remaining = Math.max(0, 600 - Math.floor((world.elapsedMs - state.routeStartedAt) / 1000));
    if (remaining === state.lastInstructionSecond) return;
    state.lastInstructionSecond = remaining;
    const minutes = Math.floor(remaining / 60);
    const seconds = String(remaining % 60).padStart(2, "0");
    world.setMissionInstruction(`⏱ ${minutes}:${seconds} · ${state.instructionBase}`);
  },

  getMetrics(world) {
    const state = world.stageState;
    return {
      eventsCompleted: state.eventsCompleted,
      totalEvents: 11,
      emergencyCalls: state.emergencyCalls,
      markedHazards: state.markedHazards,
      routeSeconds: Number(((world.elapsedMs - state.routeStartedAt) / 1000).toFixed(1)),
      reachedTwoWalls: state.phase === 11 && state.crouched,
      checkpoint: state.checkpointPhase
    };
  },

  fail(world, reason) {
    world.fail(reason, this.getMetrics(world));
  },

  advance(world, phase, instruction) {
    const state = world.stageState;
    state.eventsCompleted = Math.max(state.eventsCompleted, phase - 1);
    state.phase = phase;
    state.checkpointPhase = phase;
    state.phaseStartedAt = world.elapsedMs;
    state.waitUntil = null;
    state.warned = false;
    world.clearAction();
    world.clearDialogue();
    world.movementLocked = false;
    this.setInstruction(world, instruction);
    this.configurePhase(world, phase, false);
  },

  configurePhase(world, phase, isRetry) {
    const state = world.stageState;
    const instructions = {
      1: "Не наближайтеся до рюкзака. Відійдіть та зафіксуйте географічну мітку.",
      2: "Чутно ударний БПЛА. Безперервно рухайтеся до бетонного модульного укриття праворуч.",
      3: "FPV-дрон наближається. Зайдіть у відчинене кафе та відійдіть від входу.",
      4: "Стрілянина та робота ППО. За 5 секунд займіть низьку позицію за високим бордюром.",
      5: "Офіційний знак «МІНИ» перекрив коротку алею. Розверніться на довший ґрунтовий обхід праворуч.",
      6: "Попереду непрямі ознаки небезпеки. Не досліджуйте їх — попередьте інших і поверніться власними слідами.",
      7: "Видно зворотний бік мінного знака. Зупиніться на твердій поверхні та викличте 101.",
      8: "Біля поваленої опори помітні міни ПФМ-1. Не сходьте у траву, зупиніться та викличте 101.",
      9: "Сухий прохід під плитою коротший, але небезпечний. Оберіть довгий відкритий маршрут праворуч.",
      10: "⚠️ КАБ НА МІСТО. Не зупиняйтеся у дворі — негайно біжіть у відчинений під’їзд.",
      11: "Підніміться сходами. На майданчику не наближайтеся до вікна; знайдіть зону за двома стінами."
    };
    this.setInstruction(world, instructions[phase]);

    if (phase === 2) {
      world.playDroneBuzz(0.16);
      state.threatPlayed = true;
    }
    if (phase === 3) world.playDroneBuzz(0.2);
    if (phase === 5) this.officialGuides.forEach((guide) => { guide.visible = true; });
    if (phase === 9) this.rubbleGuides.forEach((guide) => { guide.visible = true; });
    if (phase === 10) {
      world.playAirRaidSiren();
      world.playApproachRumble();
    }
    if (phase === 11) this.stairGuides.forEach((guide) => { guide.visible = true; });

    if (isRetry && phase === 1) {
      state.lastRingAt = -5000;
    }
  },

  openCallAndWait(world, nextPhase, nextInstruction) {
    const state = world.stageState;
    world.clearAction();
    world.openEmergencyDialer({
      acceptedNumbers: ["101"],
      title: "Екстрений виклик на замінованій території",
      onComplete: () => {
        state.emergencyCalls += 1;
        world.clearDialogue();
        world.movementLocked = true;
        state.waitUntil = world.elapsedMs + 5000;
        state.markHazardAfterWait = true;
        this.setInstruction(world, "Не рухайтеся 5 секунд. Служба визначає безпечний напрямок виходу.");
        state.nextPhaseAfterWait = nextPhase;
        state.nextInstructionAfterWait = nextInstruction;
      }
    });
  },

  update(world, delta) {
    const state = world.stageState;
    const player = world.camera.position;
    const phaseAge = (world.elapsedMs - state.phaseStartedAt) / 1000;
    this.refreshInstruction(world);
    updateParticles(this.glassBurst, delta);
    updateParticles(this.curbBurst, delta);
    updateParticles(this.rubbleBurst, delta);
    updateParticles(this.entryBurst, delta);

    if (state.phase > 1 && this.bus.position.z < state.busStartZ + 24) {
      this.bus.position.z += delta * 5.5;
    }

    if (state.waitUntil !== null) {
      const seconds = Math.max(0, Math.ceil((state.waitUntil - world.elapsedMs) / 1000));
      this.setInstruction(world, `Не рухайтеся. Безпечний напрямок буде показано через ${seconds} с.`);
      if (world.elapsedMs >= state.waitUntil) {
        const nextPhase = state.nextPhaseAfterWait;
        const instruction = state.nextInstructionAfterWait;
        state.waitUntil = null;
        if (state.markHazardAfterWait) state.markedHazards += 1;
        state.markHazardAfterWait = false;
        this.advance(world, nextPhase, instruction);
      }
      return;
    }

    if (state.phase === 1) {
      const backpackDistance = world.distanceToObject2D(this.backpack);
      if (world.elapsedMs - state.lastRingAt > 1800) {
        state.lastRingAt = world.elapsedMs;
        world.playPhoneRingtone();
        this.backpack.rotation.z = Math.sin(world.elapsedMs * 0.05) * 0.03;
      }
      if (backpackDistance < 1.7) {
        this.fail(world, "Ви наблизилися до підозрілого рюкзака на критичну відстань. Не торкайтеся і не оглядайте його зблизька.");
        return;
      }
      if (player.z < 44 && backpackDistance > 8.5 && !world.activeAction) {
        world.setAction("Зафіксувати географічну мітку небезпеки", () => {
          state.markedHazards += 1;
          this.advance(world, 2, "Чутно ударний БПЛА. Рухайтеся до бетонного модульного укриття праворуч.");
        });
      }
      return;
    }

    if (state.phase === 2) {
      this.shahed.position.lerp(new THREE.Vector3(player.x - 10, 6.5, player.z + 8), Math.min(1, delta * 0.22));
      if (player.x < -16 && player.z > 24 && player.z < 46) {
        this.fail(world, "Зупинка біля панорамного скла створює небезпеку від ударної хвилі та уламків.");
        return;
      }
      if (distance2D(player, { x: 8.5, z: 34 }) < 2.1) {
        activateParticles(this.glassBurst);
        world.playGunfireBurst(0.3);
        this.advance(world, 3, "Близький вибух розбив вітрини. Тепер наближається FPV-дрон — прямуйте у відчинене кафе.");
        return;
      }
      if (phaseAge > 15) this.fail(world, "Ви не дісталися бетонного укриття до наближення ударного БПЛА.");
      return;
    }

    if (state.phase === 3) {
      this.fpv.position.lerp(new THREE.Vector3(player.x + 5, 3.5, player.z + 4), Math.min(1, delta * 0.18));
      if (player.x > -13.8 && player.x < -6.2 && player.z > 18.5 && player.z < 24.8) {
        world.playGunfireBurst(0.27);
        this.advance(world, 4, "FPV вибухнув зовні. На перехресті чути стрілянину й роботу ППО — шукайте низьке тверде укриття.");
        return;
      }
      if (phaseAge > 16) this.fail(world, "Ви залишилися на відкритій ділянці під час наближення FPV-дрона.");
      return;
    }

    if (state.phase === 4) {
      const curbDistance = distance2D(player, { x: -3.4, z: 12.8 });
      const carDistance = distance2D(player, { x: 4.2, z: 13.3 });
      if (state.curbThreatAt === null) {
        if (curbDistance < 6) {
          state.curbThreatAt = world.elapsedMs;
          world.playGunfireBurst(0.23);
          this.setInstruction(world, "⚠️ СТРІЛЯНИНА / РОБОТА ППО. За 5 секунд займіть низьку позицію за високим бордюром.");
        } else {
          this.setInstruction(world, "Вийдіть із кафе до перехрестя та шукайте низьке тверде укриття.");
          return;
        }
      }
      if (carDistance < 2.2) {
        this.fail(world, "Дверцята легкового автомобіля не є надійним укриттям від куль та уламків.");
        return;
      }
      if (curbDistance < 2.7 && !world.activeAction) {
        world.setAction("Пригнутися за високим бордюром", () => {
          state.crouched = true;
          world.clearAction();
          world.movementLocked = true;
          state.markHazardAfterWait = false;
          activateParticles(this.curbBurst);
          world.playGunfireBurst(0.3);
          state.waitUntil = world.elapsedMs + 1600;
          state.nextPhaseAfterWait = 5;
          state.nextInstructionAfterWait = "Офіційний знак «МІНИ» перекрив алею. Не обходьте його краєм — оберіть довший шлях праворуч.";
        });
      }
      if ((world.elapsedMs - state.curbThreatAt) / 1000 > 6.5) {
        this.fail(world, "Низьку позицію за гранітним бордюром не зайнято в межах часу реагування.");
      }
      return;
    }

    if (state.phase === 5) {
      if (player.z < 5 && player.x < 5) {
        this.fail(world, "Ви спробували обійти офіційний знак узбіччям. Межа замінованої ділянки може виходити за видиму позначку.");
        return;
      }
      if (player.x > 6.5 && player.z < 3.8) {
        this.advance(world, 6, "На бічній стежці видно пляшку на гілці, гільзи та військовий ящик. Не наближайтеся.");
      }
      return;
    }

    if (state.phase === 6) {
      const clueDistance = distance2D(player, { x: 9.2, z: -4.2 });
      if (clueDistance < 1.6 || player.z < -6.2) {
        this.fail(world, "Ви продовжили рух за неофіційні попереджувальні ознаки замість повернення власними слідами.");
        return;
      }
      if (clueDistance < 5 && !state.warned && !world.activeAction) {
        world.setAction("Попередити інших про небезпеку", () => {
          state.warned = true;
          world.clearAction();
          this.setInstruction(world, "Повертайтеся точно власними слідами до перехрестя стежок.");
        });
      }
      if (state.warned && player.z > 0.5 && player.x < 6) {
        this.advance(world, 7, "Перейдіть твердою поверхнею до зворотного боку мінного знака. Не заходьте в траву.");
      }
      return;
    }

    if (state.phase === 7) {
      const signDistance = world.distanceToObject2D(this.reverseSign);
      if (player.x < -12 || (player.z < -7 && Math.abs(player.x + 7.8) > 4.5)) {
        this.fail(world, "Ви зійшли з твердої поверхні, щоб роздивитися знак. На потенційно замінованій ділянці це небезпечно.");
        return;
      }
      if (signDistance < 4.2 && world.lastInputMagnitude < 0.04 && !world.activeAction) {
        world.setAction("Зателефонувати 101 і залишатися нерухомо", () => {
          this.openCallAndWait(world, 8, "Безпечний напрямок показано. Рухайтеся лише твердою поверхнею до поваленої опори.");
        });
      }
      return;
    }

    if (state.phase === 8) {
      const nearestMine = Math.min(...this.pfmMines.map((mine) => world.distanceToObject2D(mine)));
      if (nearestMine < 1.25) {
        this.fail(world, "Ви наблизилися до міни ПФМ-1. Не сходьте з твердого маршруту та не торкайтеся предметів.");
        return;
      }
      if (player.z < -16 && !world.activeAction) {
        world.setAction("Передати мітку і викликати 101", () => {
          this.openCallAndWait(world, 9, "Безпечний обхід визначено. Прямуйте праворуч навколо будівлі до зони завалів.");
        });
      }
      return;
    }

    if (state.phase === 9) {
      if (player.z < -27 && Math.abs(player.x) < 4.3) {
        this.fail(world, "Ви обрали короткий прохід під нестійкою плитою поруч із нерозірваною ракетою.");
        return;
      }
      if (player.x > 6.2 && player.z < -35) {
        activateParticles(this.rubbleBurst);
        world.playGunfireBurst(0.25);
        this.advance(world, 10, "⚠️ КАБ НА МІСТО. Негайно біжіть через двір до відчиненого під’їзду.");
      }
      return;
    }

    if (state.phase === 10) {
      if (player.z < -53.7 && Math.abs(player.x) < 2.2) {
        activateParticles(this.entryBurst);
        world.playGunfireBurst(0.34);
        this.advance(world, 11, "Вибух стався після входу. Підніміться сходами та перейдіть у внутрішній коридор за двома стінами.");
        return;
      }
      if (phaseAge > 16) this.fail(world, "Ви зупинилися на відкритій ділянці й не дісталися під’їзду до наближення КАБу.");
      return;
    }

    if (state.phase === 11) {
      if (player.x > 17.5 && !state.phoneDecisionShown) {
        state.phoneDecisionShown = true;
        world.setDialogue(
          {
            title: "Повторні вибухи біля вікна",
            prompt: "На телефоні відкрилася камера. Як діяти на сходовому майданчику?",
            correctValue: "safe",
            options: [
              { label: "Прибрати телефон і перейти за дві суцільні стіни", value: "safe" },
              { label: "Підійти до вікна та почати зйомку", value: "film" },
              { label: "Залишитися біля вікна й спостерігати", value: "watch" }
            ]
          },
          (value) => {
            if (value !== "safe") {
              this.fail(world, "Не можна наближатися до вікна або знімати роботу ППО та вибухи. Скло й уламки становлять пряму загрозу.");
              return;
            }
            state.finalDecisionMade = true;
            this.safeMarker.visible = true;
            world.clearDialogue();
            this.setInstruction(world, "Обійдіть внутрішню несучу стіну та зайдіть у зелену зону без прямої видимості на вікно.");
          }
        );
      }

      if (!state.finalDecisionMade) return;
      const inSafeZone = player.x > 26.2 && player.z > -57.2 && player.z < -52.2 && player.y > 3.6;
      if (inSafeZone && !world.activeAction) {
        world.setAction("Присісти спиною до несучої стіни", () => {
          state.crouched = true;
          state.eventsCompleted = 11;
          world.movementLocked = true;
          world.clearAction();
          this.setInstruction(world, "Маршрут завершено. Ви перебуваєте за двома стінами, нижче рівня вікон.");
          window.setTimeout(() => {
            if (world.currentStageId === this.id && !world.completed) {
              world.complete(this.getMetrics(world));
            }
          }, 1200);
        });
      }
    }
  }
};
