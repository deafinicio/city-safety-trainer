export const stage02 = {
  id: "stage-02",
  number: 2,
  title: "Звичайне міське середовище — дистанційне мінування",
  shortTitle: "Дистанційне мінування",
  instruction: "Рухайтеся маршрутом і уважно оглядайте міське середовище.",

  build(world) {
    world.setBounds({ minX: -7.7, maxX: 7.7, minZ: -27, maxZ: 18 });
    world.addGround(0x435542);
    world.addRoad(0, -4.5, 7.2, 45, 0x454a49);
    world.addPavedWalkway(-5.4, -4.5, 2.2, 45, 0x9b978c);
    world.addPavedWalkway(5.4, -4.5, 2.2, 45, 0x969388);

    world.addBuilding(-11.2, 4.55, -5, 6, 9.1, 40, 0x625a53);
    world.addBuilding(11.3, 4.55, -5, 6, 9.1, 40, 0x5d5751);
    world.addPhotorealApartmentFacades();

    world.addTree(-5.6, 10);
    world.addTree(5.5, 7);
    world.addTree(-5.5, -4);
    world.addTree(5.6, -9);
    world.addTree(-5.4, -20);
    world.addTree(5.4, -22);

    world.addBench(-4.3, 4, Math.PI / 2);
    world.addBench(4.3, -13, -Math.PI / 2);

    world.addStageAssetInstances(
      "assets/models/polyhaven/street_lamp_02/street_lamp_02_1k.glb",
      [
        { position: [-6.65, 0, 12.2], rotation: [0, 0.25, 0], scale: 2.7 },
        { position: [6.65, 0, 4.2], rotation: [0, Math.PI + 0.25, 0], scale: 2.7 },
        { position: [-6.65, 0, -9.8], rotation: [0, 0.25, 0], scale: 2.7 },
        { position: [6.65, 0, -19.2], rotation: [0, Math.PI + 0.25, 0], scale: 2.7 }
      ]
    );

    world.addStageAssetInstances(
      "assets/models/polyhaven/shrub_03/shrub_03_1k.glb",
      [
        { position: [-7.05, 0.02, 7.5], rotation: [0, Math.PI / 2, 0], scale: 2.35 },
        { position: [7.05, 0.02, -4.5], rotation: [0, -Math.PI / 2, 0], scale: 2.2 },
        { position: [-7.05, 0.02, -17.8], rotation: [0, Math.PI / 2, 0], scale: 2.45 }
      ]
    );

    world.addStageAssetInstances(
      "assets/models/polyhaven/water_manhole_cover/water_manhole_cover_1k.glb",
      [
        { position: [-1.65, 0.07, 9.1], rotation: [0, 0.2, 0], scale: 1 },
        { position: [2.1, 0.07, -15.1], rotation: [0, -0.35, 0], scale: 0.92 }
      ]
    );

    this.mainMine = world.addMine(0.65, -4.8, {
      rotation: 0.35,
      color: 0x65714a,
      partiallyHidden: false
    });

    this.allMines = [
      this.mainMine,
      world.addMine(-4.7, -7.1, {
        rotation: -0.6,
        color: 0x455538,
        partiallyHidden: true
      }),
      world.addMine(4.9, -2.7, {
        rotation: 0.8,
        color: 0x4c593d,
        partiallyHidden: true
      }),
      world.addMine(-5.2, -15.4, {
        rotation: 0.15,
        color: 0x3f5136,
        partiallyHidden: true
      }),
      world.addMine(4.6, -18.2, {
        rotation: -0.25,
        color: 0x49563b,
        partiallyHidden: true
      })
    ];
  },

  reset(world) {
    world.setPlayerPosition(0, 16);
    world.clearAction();
    world.stageState = {
      detected: false,
      detectedAtMs: null,
      detectionPosition: null,
      stoppedAtMs: null,
      stopPosition: null,
      stableStopSeconds: 0,
      movementAfterDetection: 0,
      minDistance: Number.POSITIVE_INFINITY,
      callAtMs: null,
      calledNumber: null,
      trajectory: [],
      lastTrajectorySample: 0
    };
  },

  getMetrics(world) {
    const state = world.stageState;
    return {
      reactionSeconds: state.stoppedAtMs === null || state.detectedAtMs === null
        ? null
        : Number(((state.stoppedAtMs - state.detectedAtMs) / 1000).toFixed(1)),
      callSeconds: state.callAtMs === null || state.detectedAtMs === null
        ? null
        : Number(((state.callAtMs - state.detectedAtMs) / 1000).toFixed(1)),
      minDistance: Number.isFinite(state.minDistance)
        ? Number(state.minDistance.toFixed(1))
        : null,
      movementAfterDetection: Number(state.movementAfterDetection.toFixed(2)),
      calledNumber: state.calledNumber,
      trajectoryPoints: state.trajectory.length
    };
  },

  update(world, delta) {
    const state = world.stageState;
    const { x, z } = world.camera.position;
    const now = performance.now();

    for (const mine of this.allMines) {
      state.minDistance = Math.min(state.minDistance, world.distanceToObject2D(mine));
    }

    if (now - state.lastTrajectorySample >= 250) {
      state.lastTrajectorySample = now;
      state.trajectory.push({
        x: Number(x.toFixed(2)),
        z: Number(z.toFixed(2)),
        timeMs: Math.round(world.elapsedMs)
      });
    }

    if (state.minDistance < 1.45) {
      world.fail(
        "Ви наблизилися до міни на критично небезпечну відстань.",
        this.getMetrics(world)
      );
      return;
    }

    if (!state.detected && world.isObjectVisible(this.mainMine, 15, 0.42)) {
      state.detected = true;
      state.detectedAtMs = world.elapsedMs;
      state.detectionPosition = { x, z };
    }

    if (!state.detected) return;

    const movedFromDetection = Math.hypot(
      x - state.detectionPosition.x,
      z - state.detectionPosition.z
    );
    state.movementAfterDetection = Math.max(
      state.movementAfterDetection,
      movedFromDetection
    );

    if (state.stoppedAtMs === null) {
      if (world.lastInputMagnitude < 0.04) {
        state.stableStopSeconds += delta;

        if (state.stableStopSeconds >= 0.65) {
          state.stoppedAtMs = world.elapsedMs;
          state.stopPosition = { x, z };
          world.setAction("Повідомити екстрену службу", () => {
            world.clearAction();
            world.openEmergencyDialer({
              acceptedNumbers: ["101", "102", "112"],
              onComplete: (number) => {
                state.calledNumber = number;
                state.callAtMs = world.elapsedMs;
                world.clearDialogue();
                world.complete(this.getMetrics(world));
              }
            });
          });
        }
      } else {
        state.stableStopSeconds = 0;
      }

      if (world.elapsedMs - state.detectedAtMs > 10000) {
        world.fail(
          "Після виявлення небезпеки рух не було припинено протягом рекомендованого часу.",
          this.getMetrics(world)
        );
        return;
      }

      if (state.movementAfterDetection > 1.6) {
        world.fail(
          "Після виявлення міни ви продовжили рух у небезпечному напрямку.",
          this.getMetrics(world)
        );
      }
      return;
    }

    const movementAfterStop = Math.hypot(
      x - state.stopPosition.x,
      z - state.stopPosition.z
    );

    if (movementAfterStop > 0.35) {
      world.fail(
        "Після зупинки не можна продовжувати рух ногами в потенційно замінованій зоні.",
        this.getMetrics(world)
      );
    }
  }
};
