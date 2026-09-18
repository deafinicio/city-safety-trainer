export const stage05 = {
  id: "stage-05",
  number: 5,
  title: "Зворотна сторона знака мінної небезпеки",
  shortTitle: "Зворотна сторона знака",
  instruction: "Огляньте маршрут, розпізнайте ознаки можливого маркування та оберіть безпечний алгоритм дій.",

  build(world) {
    world.setBounds({ minX: -7.5, maxX: 7.5, minZ: -21, maxZ: 19 });
    world.addGround(0x4c6049);
    world.addRoad(0, -1, 5.6, 38, 0x7a7b72);

    world.addTree(-5.1, 14);
    world.addTree(5.3, 12);
    world.addTree(-5.6, 5);
    world.addTree(5.2, 1);
    world.addTree(-5.2, -9);
    world.addTree(5.5, -13);

    world.addBench(-3.9, 8.5, Math.PI / 2);
    world.addBench(4, -7, -Math.PI / 2);

    this.signBack = world.addMineSignBack(0.7, 2.5, -0.08);

    this.hiddenMines = [
      world.addMine(-2.1, 0.4, {
        rotation: 0.4,
        color: 0x48563d,
        partiallyHidden: true
      }),
      world.addMine(2.7, -2.8, {
        rotation: -0.45,
        color: 0x435239,
        partiallyHidden: true
      }),
      world.addMine(-1.2, -7.5, {
        rotation: 0.8,
        color: 0x4a573e,
        partiallyHidden: true
      })
    ];

    world.addWarningFence(-4.9, -3.5, 13, Math.PI / 2);
    world.addWarningFence(5.1, -3.5, 13, Math.PI / 2);
  },

  reset(world) {
    world.setPlayerPosition(0, 14);
    world.clearAction();
    world.stageState = {
      detected: false,
      detectedAtMs: null,
      detectionPosition: null,
      stableStopSeconds: 0,
      stoppedAtMs: null,
      stopPosition: null,
      movementAfterDetection: 0,
      callAtMs: null,
      minMineDistance: Number.POSITIVE_INFINITY,
      trajectory: [],
      lastTrajectorySample: 0
    };
  },

  getMetrics(world) {
    const state = world.stageState;
    return {
      signBackDetected: state.detected,
      reactionSeconds: state.stoppedAtMs === null || state.detectedAtMs === null
        ? null
        : Number(((state.stoppedAtMs - state.detectedAtMs) / 1000).toFixed(1)),
      callSeconds: state.callAtMs === null || state.detectedAtMs === null
        ? null
        : Number(((state.callAtMs - state.detectedAtMs) / 1000).toFixed(1)),
      movementAfterDetection: Number(state.movementAfterDetection.toFixed(2)),
      minDistance: Number.isFinite(state.minMineDistance)
        ? Number(state.minMineDistance.toFixed(1))
        : null,
      correctSequence: state.stoppedAtMs !== null && state.callAtMs !== null,
      trajectoryPoints: state.trajectory.length
    };
  },

  update(world, delta) {
    const state = world.stageState;
    const { x, z } = world.camera.position;
    const now = performance.now();

    if (now - state.lastTrajectorySample >= 250) {
      state.lastTrajectorySample = now;
      state.trajectory.push({
        x: Number(x.toFixed(2)),
        z: Number(z.toFixed(2)),
        timeMs: Math.round(world.elapsedMs)
      });
    }

    for (const mine of this.hiddenMines) {
      state.minMineDistance = Math.min(
        state.minMineDistance,
        world.distanceToObject2D(mine)
      );
    }

    if (state.minMineDistance < 1.45) {
      world.fail(
        "Ви продовжили рух і наблизилися до міни на критично небезпечну відстань.",
        this.getMetrics(world)
      );
      return;
    }

    if (!state.detected && world.isObjectVisible(this.signBack, 15, 0.5)) {
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
          world.setAction("Повідомити 101/112", () => {
            state.callAtMs = world.elapsedMs;
            world.clearAction();
            world.complete(this.getMetrics(world));
          });
        }
      } else {
        state.stableStopSeconds = 0;
      }

      if (world.elapsedMs - state.detectedAtMs > 10000) {
        world.fail(
          "Після виявлення зворотної сторони знака рух не було припинено вчасно.",
          this.getMetrics(world)
        );
        return;
      }

      if (state.movementAfterDetection > 0.85) {
        world.fail(
          "Після усвідомлення можливої мінної небезпеки не можна продовжувати рух або намагатися виходити навмання.",
          this.getMetrics(world)
        );
      }
      return;
    }

    const movementAfterStop = Math.hypot(
      x - state.stopPosition.x,
      z - state.stopPosition.z
    );

    if (movementAfterStop > 0.28) {
      world.fail(
        "Після зупинки заборонено рухати ногами або самостійно шукати вихід із потенційно замінованої території.",
        this.getMetrics(world)
      );
    }
  }
};
