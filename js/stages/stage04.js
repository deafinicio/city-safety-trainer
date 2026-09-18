export const stage04 = {
  id: "stage-04",
  number: 4,
  title: "Парк — неофіційне попередження про мінну небезпеку",
  shortTitle: "Неофіційне попередження",
  instruction: "Огляньте зелену зону, розпізнайте непрямі ознаки небезпеки та дійте безпечно.",

  build(world) {
    world.setBounds({ minX: -7.7, maxX: 7.7, minZ: -21, maxZ: 19 });
    world.addGround(0x4b6148);
    world.addRoad(0, -1, 5.3, 38, 0x777a70);

    world.addTree(-4.6, 14);
    world.addTree(5.1, 12);
    world.addTree(-5.5, 7);
    world.addTree(4.8, 5);
    world.addTree(-5.4, -3);
    world.addTree(5.6, -5);
    world.addTree(-4.8, -14);
    world.addTree(4.5, -16);

    world.addBench(-3.6, 9.2, Math.PI / 2);
    world.addBench(3.7, -11.5, -Math.PI / 2);

    this.warningClues = world.addUnofficialWarning(0, 2.2);
    world.addTireTracks(0, -5.5, 13);
    world.addShellCasings(-0.6, -2.2, 9);

    this.uxo = world.addRocket(0.9, -7.2);
    world.addGoal(0, 17.2, 6.2);
  },

  reset(world) {
    world.setPlayerPosition(0, 13);
    world.clearAction();
    world.stageState = {
      detected: false,
      detectedAtMs: null,
      stableStopSeconds: 0,
      stoppedAtMs: null,
      warnedOthers: false,
      crossedBoundary: false,
      minUxoDistance: Number.POSITIVE_INFINITY,
      trajectory: [],
      lastTrajectorySample: 0
    };
  },

  getMetrics(world) {
    const state = world.stageState;
    return {
      cluesDetected: state.detected,
      reactionSeconds: state.stoppedAtMs === null || state.detectedAtMs === null
        ? null
        : Number(((state.stoppedAtMs - state.detectedAtMs) / 1000).toFixed(1)),
      warnedOthers: state.warnedOthers,
      crossedBoundary: state.crossedBoundary,
      minDistance: Number.isFinite(state.minUxoDistance)
        ? Number(state.minUxoDistance.toFixed(1))
        : null,
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

    state.minUxoDistance = Math.min(
      state.minUxoDistance,
      world.distanceToObject2D(this.uxo)
    );

    if (state.minUxoDistance < 2.8) {
      world.fail(
        "Ви наблизилися до нерозірваного боєприпасу на небезпечну відстань.",
        this.getMetrics(world)
      );
      return;
    }

    if (!state.detected && world.isObjectVisible(this.warningClues, 15, 0.5)) {
      state.detected = true;
      state.detectedAtMs = world.elapsedMs;
    }

    if (state.detected && state.stoppedAtMs === null) {
      if (world.lastInputMagnitude < 0.04) {
        state.stableStopSeconds += delta;

        if (state.stableStopSeconds >= 0.65) {
          state.stoppedAtMs = world.elapsedMs;
          world.setAction("Попередити інших", () => {
            state.warnedOthers = true;
            world.clearAction();
          });
        }
      } else {
        state.stableStopSeconds = 0;
      }

      if (world.elapsedMs - state.detectedAtMs > 10000) {
        world.fail(
          "Після виявлення неофіційних ознак небезпеки рух не було припинено вчасно.",
          this.getMetrics(world)
        );
        return;
      }
    }

    if (z < 0.2) {
      state.crossedBoundary = true;
      world.fail(
        "Ви пройшли за неофіційне попередження та увійшли в потенційно небезпечну зону.",
        this.getMetrics(world)
      );
      return;
    }

    if (z >= 16.5 && Math.abs(x) < 3.2) {
      if (!state.detected) {
        world.fail(
          "Система не зафіксувала розпізнавання непрямих ознак мінної небезпеки.",
          this.getMetrics(world)
        );
      } else if (state.stoppedAtMs === null) {
        world.fail(
          "Після виявлення ознак небезпеки потрібно було спочатку зупинитися.",
          this.getMetrics(world)
        );
      } else if (!state.warnedOthers) {
        world.fail(
          "Перед поверненням потрібно було умовно попередити інших про небезпеку.",
          this.getMetrics(world)
        );
      } else {
        world.complete(this.getMetrics(world));
      }
    }
  }
};
