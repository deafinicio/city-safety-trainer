export const stage03 = {
  id: "stage-03",
  number: 3,
  title: "Парк — офіційне маркування «МІНИ»",
  shortTitle: "Офіційний знак «МІНИ»",
  instruction: "Огляньте парк і дістаньтеся контрольної точки безпечнішим маршрутом.",

  build(world) {
    world.setBounds({ minX: -8.2, maxX: 8.2, minZ: -29, maxZ: 18 });
    world.addGround(0x4e654c);

    world.addRoad(0, 9, 6.5, 18, 0x88877e);
    world.addRoad(3.3, -9, 4.5, 21, 0x85847b);
    world.addRoad(-4.4, -9.5, 3.2, 29, 0x797b73);
    world.addRoad(0, -23.5, 11.5, 7, 0x818078);

    world.addTree(-6.5, 12);
    world.addTree(6.1, 10);
    world.addTree(-6.7, 2);
    world.addTree(6.5, -1);
    world.addTree(-6.8, -11);
    world.addTree(-2.1, -6);
    world.addTree(-6.2, -22);
    world.addTree(6.4, -20);

    world.addBench(-3.7, 5.8, Math.PI / 2);
    world.addBench(-5.9, -15.5, 0);
    world.addBench(5.6, -18, Math.PI / 2);

    this.sign = world.addMineWarningSign(1.2, 0.7, -0.08);
    world.addWarningFence(0.1, -2, 7.4, 0);
    world.addWarningFence(4.1, -10.5, 17, Math.PI / 2);
    world.addWarningFence(0.2, -19, 7.7, 0);

    world.addMine(2.2, -6.2, {
      rotation: 0.35,
      color: 0x596448,
      partiallyHidden: true
    });
    world.addMine(4.7, -12.8, {
      rotation: -0.5,
      color: 0x48563c,
      partiallyHidden: true
    });

    world.addGoal(0, -26.2, 6.5);
  },

  reset(world) {
    world.setPlayerPosition(0, 16);
    world.clearAction();
    world.stageState = {
      detected: false,
      detectedAtMs: null,
      stableStopSeconds: 0,
      stoppedAtMs: null,
      routeChoice: null,
      crossedBoundary: false,
      trajectory: [],
      lastTrajectorySample: 0
    };
  },

  getMetrics(world) {
    const state = world.stageState;
    return {
      signDetected: state.detected,
      reactionSeconds: state.stoppedAtMs === null || state.detectedAtMs === null
        ? null
        : Number(((state.stoppedAtMs - state.detectedAtMs) / 1000).toFixed(1)),
      route: state.routeChoice || "не визначено",
      crossedBoundary: state.crossedBoundary,
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

    if (!state.detected && world.isObjectVisible(this.sign, 18, 0.48)) {
      state.detected = true;
      state.detectedAtMs = world.elapsedMs;
    }

    if (state.detected && state.stoppedAtMs === null) {
      if (world.lastInputMagnitude < 0.04) {
        state.stableStopSeconds += delta;

        if (state.stableStopSeconds >= 0.65) {
          state.stoppedAtMs = world.elapsedMs;
        }
      } else {
        state.stableStopSeconds = 0;
      }

      if (world.elapsedMs - state.detectedAtMs > 10000) {
        world.fail(
          "Офіційний знак мінної небезпеки було проігноровано: рух не припинено вчасно.",
          this.getMetrics(world)
        );
        return;
      }
    }

    const insideMarkedArea = x > 0.15 && z < -2 && z > -19;
    if (insideMarkedArea) {
      state.crossedBoundary = true;
      state.routeChoice = "короткий через позначену територію";
      world.fail(
        "Ви перетнули межу території, позначеної офіційним знаком мінної небезпеки.",
        this.getMetrics(world)
      );
      return;
    }

    if (x < -1.8 && z < 1.5 && state.routeChoice === null) {
      state.routeChoice = "довший безпечніший обхід";
    }

    if (z <= -25.2 && Math.abs(x) < 3.4) {
      if (state.detected && state.stoppedAtMs !== null && state.routeChoice === "довший безпечніший обхід") {
        world.complete(this.getMetrics(world));
      } else if (!state.detected) {
        world.fail(
          "Система не зафіксувала виявлення офіційного попереджувального знака.",
          this.getMetrics(world)
        );
      } else if (state.stoppedAtMs === null) {
        world.fail(
          "Після виявлення знака рух не було належним чином припинено.",
          this.getMetrics(world)
        );
      } else {
        world.fail(
          "Для проходження потрібно обрати довший маршрут поза позначеною небезпечною територією.",
          this.getMetrics(world)
        );
      }
    }
  }
};
