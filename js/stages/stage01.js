export const stage01 = {
  id: "stage-01",
  number: 1,
  title: "Зруйнований сектор і завали",
  shortTitle: "Зруйнований сектор",
  instruction: "Огляньте місцевість і дістаньтеся жовтої контрольної точки.",

  build(world) {
    world.setBounds({ minX: -7.6, maxX: 7.6, minZ: -29, maxZ: 18 });
    world.addGround(0x596158);
    world.addRoad(0, 9, 12, 18, 0x363a38);
    world.addRoad(-3.8, -8.5, 4.2, 21, 0x323634);
    world.addRoad(4.2, -9.5, 5.1, 27, 0x474b47);
    world.addRoad(0, -23.2, 12, 8, 0x393d3a);

    world.addBuilding(-11.2, 4.5, -8, 6, 9, 32, 0x686965);
    world.addBuilding(11.2, 5, -8, 6, 10, 32, 0x716d67);
    world.addBuilding(-10.8, 3.2, -29, 7, 6.4, 9, 0x5b5a56);
    world.addBuilding(10.9, 4, -29, 7, 8, 9, 0x66615b);

    world.addBrokenWall(-0.2, -7.6, 3.5, 0.75, 3.6, 0.12);
    world.addBrokenWall(0.4, -13, 4.2, 0.8, 2.4, -0.08);
    world.addRubble(-0.2, -3.9, 3.2, 2.6, 1.2, 0x797268);
    world.addRubble(0.3, -9.8, 3.3, 4.4, 1.55, 0x68635d);
    world.addRubble(-0.1, -15.3, 3.7, 3.2, 1.25, 0x756f65);
    world.addRubble(5.1, -3.2, 1.2, 1.3, 0.55, 0x777269);
    world.addRubble(2.8, -17.2, 1, 1.1, 0.45, 0x777269);

    world.addTree(-7.1, 7);
    world.addTree(7.2, 5);
    world.addTree(7.1, -17);
    world.addTree(-7.2, -21);

    this.rocketPosition = { x: -3.7, z: -9.7 };
    world.addRocket(this.rocketPosition.x, this.rocketPosition.z);
    world.addGoal(0, -26.2, 6.5);
  },

  reset(world) {
    world.setPlayerPosition(0, 16);
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

    if (z <= -25.2 && Math.abs(x) < 3.4) {
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
