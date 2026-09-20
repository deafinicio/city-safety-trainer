import * as THREE from "three";

function addRoadDamage(world, x, z, scale = 1, rotation = 0) {
  const stain = new THREE.Mesh(
    new THREE.CircleGeometry(0.9 * scale, 20),
    new THREE.MeshStandardMaterial({
      color: 0x232725,
      roughness: 1,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    })
  );
  stain.rotation.x = -Math.PI / 2;
  stain.rotation.z = rotation;
  stain.scale.set(1, 0.42, 1);
  stain.position.set(x, 0.092, z);
  stain.userData.noShadow = true;
  world.add(stain);

  const crackMaterial = new THREE.MeshBasicMaterial({
    color: 0x1b1d1c,
    transparent: true,
    opacity: 0.78,
    depthWrite: false
  });
  for (let index = 0; index < 5; index += 1) {
    const angle = rotation + index * 1.17 + world.visualRandom(x, z, index) * 0.42;
    const length = scale * (0.5 + world.visualRandom(x, z, index + 8) * 1.15);
    const crack = new THREE.Mesh(
      new THREE.PlaneGeometry(0.025 * scale, length),
      crackMaterial
    );
    crack.rotation.set(-Math.PI / 2, 0, angle);
    crack.position.set(
      x + Math.cos(angle) * length * 0.34,
      0.096,
      z + Math.sin(angle) * length * 0.34
    );
    crack.userData.noShadow = true;
    world.add(crack);
  }
}

function addUtilityPole(world, x, z, rotation = 0) {
  const group = new THREE.Group();
  const concrete = world.createSurfaceMaterial(0x777b77, "concrete", {
    repeatX: 2,
    repeatY: 8,
    roughness: 1,
    bumpScale: 0.035
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x3f4645,
    roughness: 0.58,
    metalness: 0.66
  });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 6.8, 12), concrete);
  pole.position.y = 3.4;
  group.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.1), metal);
  arm.position.y = 6.25;
  group.add(arm);
  for (const side of [-1, 1]) {
    const insulator = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.32, 10),
      new THREE.MeshStandardMaterial({ color: 0x4f554f, roughness: 0.42, metalness: 0.18 })
    );
    insulator.position.set(side * 0.82, 6.46, 0);
    group.add(insulator);
  }
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  world.add(group);
  world.addCollisionCircle(x, z, 0.24);
  return group;
}

function addDestroyedCorner(world, x, z) {
  const concrete = world.createSurfaceMaterial(0x77736b, "concrete", {
    repeatX: 4,
    repeatY: 4,
    roughness: 1,
    bumpScale: 0.06
  });
  const soot = new THREE.MeshStandardMaterial({ color: 0x262827, roughness: 1 });
  const brick = new THREE.MeshStandardMaterial({ color: 0x754f3d, roughness: 0.96 });
  const rebar = new THREE.MeshStandardMaterial({
    color: 0x3b302a,
    roughness: 0.66,
    metalness: 0.62
  });

  const group = new THREE.Group();
  const rearWall = new THREE.Mesh(new THREE.BoxGeometry(5.6, 5.8, 0.34), concrete);
  rearWall.position.set(0, 2.9, -1.7);
  group.add(rearWall);
  const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.34, 4.1, 4.2), concrete);
  sideWall.position.set(-2.62, 2.05, 0.2);
  group.add(sideWall);

  for (const [floorY, width, offset] of [
    [1.8, 5.25, 0],
    [3.75, 4.25, -0.45]
  ]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.22, 3.8), concrete);
    slab.position.set(offset, floorY, 0.08);
    slab.rotation.z = floorY > 3 ? -0.065 : 0.025;
    group.add(slab);
  }

  for (const [wx, wy] of [[-1.55, 1.05], [0.15, 1.05], [1.72, 1.05], [-1.35, 3.02], [0.4, 3.02]]) {
    const recess = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.18, 0.045), soot);
    recess.position.set(wx, wy, -1.885);
    group.add(recess);
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.16, 0.07, 0.075),
      new THREE.MeshStandardMaterial({ color: 0x9b9b93, roughness: 0.8 })
    );
    frame.position.set(wx, wy - 0.6, -1.92);
    group.add(frame);
  }

  for (let index = 0; index < 18; index += 1) {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.28 + world.visualRandom(x, z, index) * 0.48,
        0.16 + world.visualRandom(x, z, index + 20) * 0.22,
        0.22 + world.visualRandom(x, z, index + 40) * 0.52
      ),
      index % 3 === 0 ? brick : concrete
    );
    block.position.set(
      -2.2 + world.visualRandom(x, z, index + 60) * 4.7,
      0.12 + world.visualRandom(x, z, index + 80) * 0.65,
      -0.75 + world.visualRandom(x, z, index + 100) * 3.7
    );
    block.rotation.set(index * 0.31, index * 0.73, index * 0.19);
    group.add(block);
  }

  for (let index = 0; index < 11; index += 1) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.1, 6), rebar);
    rod.position.set(-2.1 + index * 0.42, 4.62 + (index % 3) * 0.08, -0.1);
    rod.rotation.z = -0.16 + (index % 4) * 0.1;
    group.add(rod);
  }

  const scorch = new THREE.Mesh(
    new THREE.CircleGeometry(1.42, 26),
    new THREE.MeshBasicMaterial({ color: 0x181a19, transparent: true, opacity: 0.54, depthWrite: false })
  );
  scorch.position.set(0.62, 2.4, -1.89);
  group.add(scorch);

  group.position.set(x, 0, z);
  world.add(group);
  world.addLocalCollisionBox(x, z, 0, -1.7, 5.6, 0.34, 0, 5.8);
  world.addLocalCollisionBox(x, z, -2.62, 0.2, 0.34, 4.2, 0, 4.1);
  world.addLocalCollisionBox(x, z, 0, 0.1, 5.1, 3.75, 0, 1.1);
  return group;
}

function addDustCloud(world, x, z) {
  const count = world.graphicsProfile.name === "performance" ? 75 : 160;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = x + (world.visualRandom(x, z, index) - 0.5) * 8;
    positions[index * 3 + 1] = 0.15 + world.visualRandom(x, z, index + 200) * 5.8;
    positions[index * 3 + 2] = z + (world.visualRandom(x, z, index + 400) - 0.5) * 7;
    phases[index] = world.visualRandom(x, z, index + 600) * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xb7aa96,
      size: 0.055,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      sizeAttenuation: true
    })
  );
  points.userData.phases = phases;
  points.userData.baseY = Float32Array.from({ length: count }, (_, index) => positions[index * 3 + 1]);
  points.userData.noShadow = true;
  world.add(points);
  return points;
}

function addOverheadWires(world, firstPole, secondPole) {
  const material = new THREE.LineBasicMaterial({ color: 0x242827, transparent: true, opacity: 0.9 });
  for (const offset of [-0.82, 0.82]) {
    const start = new THREE.Vector3(firstPole.x + offset, 6.46, firstPole.z);
    const end = new THREE.Vector3(secondPole.x + offset, 6.46, secondPole.z);
    const middle = start.clone().lerp(end, 0.5);
    middle.y -= 0.62;
    const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));
    const wire = new THREE.Line(geometry, material);
    wire.userData.noShadow = true;
    world.add(wire);
  }
}

export const stage01Hd = {
  id: "stage-01-hd",
  number: "1 · HD TEST",
  title: "Зруйнований сектор — тест реалістичної графіки",
  shortTitle: "HD-тест зруйнованого сектору",
  instruction: "Тестова сцена: дістаньтеся контрольної точки, не наближаючись до нерозірваного боєприпасу.",

  build(world) {
    world.setBounds({ minX: -8.1, maxX: 8.1, minZ: -30, maxZ: 19 });
    world.scene.background = new THREE.Color(0x8799a0);
    world.scene.fog = new THREE.Fog(0xa3aba7, 28, 76);
    world.renderer.toneMappingExposure = 0.93;

    const coldFill = new THREE.DirectionalLight(0x9fc2d3, 0.52);
    coldFill.position.set(10, 12, 8);
    world.add(coldFill);
    const ruinBounce = new THREE.PointLight(0xd7a26d, 1.25, 17, 1.7);
    ruinBounce.position.set(-2.5, 3.2, -9.5);
    world.add(ruinBounce);

    world.addGround(0x4a514a);
    world.addRoad(0, -5.5, 11.5, 48, 0x383d3c);
    world.addPavedWalkway(-6.75, -5.5, 2.0, 48, 0x89877f);
    world.addPavedWalkway(6.75, -5.5, 2.0, 48, 0x85837b);

    world.addBuilding(-11.15, 5.2, -5, 6, 10.4, 43, 0x5d6260);
    world.addBuilding(11.15, 5.8, -5, 6, 11.6, 43, 0x66645f);
    world.addPhotorealApartmentFacades();

    addDestroyedCorner(world, -1.05, -10.4);
    world.addBrokenWall(-4.15, -4.9, 4.1, 0.38, 2.25, -0.14);
    world.addBrokenWall(2.35, -14.1, 3.2, 0.36, 1.5, 0.2);
    world.addRubble(-2.65, -5.6, 3.5, 2.6, 0.72, 0x6b6760);
    world.addRubble(-0.6, -14.7, 4.4, 3.0, 0.9, 0x706b63);
    world.addRubble(5.6, -18.2, 1.45, 1.65, 0.5, 0x716c64);

    for (const damage of [
      [-2.8, 5.8, 1.1, 0.2],
      [2.9, -0.8, 0.82, -0.5],
      [-4.1, -12.5, 1.3, 0.7],
      [3.3, -20.6, 1.05, -0.2]
    ]) addRoadDamage(world, ...damage);

    world.addParkedCar(5.1, 2.4, -0.08, 0x33434a);
    world.addParkedCar(-5.25, -20.9, Math.PI + 0.06, 0x553c36);
    world.addBench(-6.35, 7.2, Math.PI / 2);
    world.addBench(6.25, -16.1, -Math.PI / 2);

    const firstPole = { x: -6.55, z: 10.8 };
    const secondPole = { x: -6.55, z: -16.8 };
    addUtilityPole(world, firstPole.x, firstPole.z);
    addUtilityPole(world, secondPole.x, secondPole.z);
    addOverheadWires(world, firstPole, secondPole);

    world.addStageAssetInstances(
      "assets/models/polyhaven/street_lamp_02/street_lamp_02_1k.glb",
      [
        { position: [6.72, 0, 10.7], rotation: [0, Math.PI + 0.2, 0], scale: 2.65 },
        { position: [6.72, 0, -8.4], rotation: [0, Math.PI + 0.2, 0], scale: 2.65 },
        { position: [-6.72, 0, -24.0], rotation: [0, 0.2, 0], scale: 2.65 }
      ],
      { collidable: true }
    );
    world.addStageAssetInstances(
      "assets/models/polyhaven/shrub_03/shrub_03_1k.glb",
      [
        { position: [-7.15, 0.02, 5.5], rotation: [0, 1.4, 0], scale: 2.1 },
        { position: [7.05, 0.02, -3.6], rotation: [0, -1.2, 0], scale: 2.0 },
        { position: [-7.08, 0.02, -20.2], rotation: [0, 0.7, 0], scale: 2.35 }
      ]
    );
    world.addStageAssetInstances(
      "assets/models/polyhaven/water_manhole_cover/water_manhole_cover_1k.glb",
      [
        { position: [2.65, 0.09, 6.2], rotation: [0, 0.18, 0], scale: 1 },
        { position: [4.2, 0.09, -19.3], rotation: [0, -0.32, 0], scale: 0.92 }
      ]
    );

    world.addPhysicsCrate(4.7, -4.4, { rotation: 0.18, size: 0.68, height: 0.7 });
    world.addPhysicsCrate(5.45, -5.05, { rotation: -0.14, size: 0.62, height: 0.62, color: 0x655039 });
    world.addPhysicsBarrel(5.65, -3.9, { color: 0x4d5c57 });
    world.addPhysicsBarrel(-5.7, -23.0, { color: 0x69483d });

    this.rocketPosition = { x: -3.72, z: -9.65 };
    this.rocket = world.addRocket(this.rocketPosition.x, this.rocketPosition.z);
    this.dust = addDustCloud(world, -1.2, -10.2);
    world.addGoal(0, -27.2, 6.5);
  },

  reset(world) {
    world.setPlayerPosition(0, 16.4);
    world.stageState = {
      routeChoice: null,
      correctedRoute: false,
      routeDecisionMs: null,
      minRocketDistance: Number.POSITIVE_INFINITY,
      trajectory: [],
      lastTrajectorySample: 0
    };
  },

  getMetrics(world) {
    const state = world.stageState;
    return {
      route: state.routeChoice || "не визначено",
      decisionSeconds: state.routeDecisionMs === null
        ? null
        : Number((state.routeDecisionMs / 1000).toFixed(1)),
      minDistance: Number.isFinite(state.minRocketDistance)
        ? Number(state.minRocketDistance.toFixed(1))
        : null,
      correctedRoute: state.correctedRoute,
      trajectoryPoints: state.trajectory.length
    };
  },

  update(world) {
    const state = world.stageState;
    const { x, z } = world.camera.position;
    const now = performance.now();

    if (this.dust) {
      const positions = this.dust.geometry.attributes.position;
      const phases = this.dust.userData.phases;
      const baseY = this.dust.userData.baseY;
      for (let index = 0; index < positions.count; index += 1) {
        positions.setY(index, baseY[index] + Math.sin(world.elapsedMs * 0.0007 + phases[index]) * 0.14);
      }
      positions.needsUpdate = true;
      this.dust.rotation.y = Math.sin(world.elapsedMs * 0.00008) * 0.025;
    }

    if (z <= 1) {
      if (x < -1.7 && state.routeChoice === null) {
        state.routeChoice = "короткий небезпечний";
        state.routeDecisionMs = world.elapsedMs;
      }

      if (x > 1.7) {
        if (state.routeChoice === null) {
          state.routeChoice = "довший безпечніший";
          state.routeDecisionMs = world.elapsedMs;
        } else if (state.routeChoice === "короткий небезпечний") {
          state.correctedRoute = true;
          state.routeChoice = "довший безпечніший";
        }
      }
    }

    const distance = Math.hypot(x - this.rocketPosition.x, z - this.rocketPosition.z);
    state.minRocketDistance = Math.min(state.minRocketDistance, distance);

    if (now - state.lastTrajectorySample >= 250) {
      state.lastTrajectorySample = now;
      state.trajectory.push({
        x: Number(x.toFixed(2)),
        z: Number(z.toFixed(2)),
        timeMs: Math.round(world.elapsedMs)
      });
    }

    if (state.minRocketDistance < 2.7) {
      world.fail(
        "Ви наблизилися до нерозірваного боєприпасу на небезпечну відстань.",
        this.getMetrics(world)
      );
      return;
    }

    if (z <= -26.2 && Math.abs(x) < 3.4) {
      if (state.routeChoice === "довший безпечніший") {
        world.complete(this.getMetrics(world));
      } else {
        world.fail(
          "До контрольної точки обрано небезпечний маршрут через завали.",
          this.getMetrics(world)
        );
      }
    }
  }
};
