function shuffleOptions(options) {
  const shuffled = [...options];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

export const stage10 = {
  id: "stage-10",
  number: 10,
  title: "Відкрите перехрестя — звуки стрілянини",
  shortTitle: "Стрілянина на перехресті",
  instruction: "Перетніть відкриту ділянку та негайно реагуйте на звукову загрозу.",

  build(world) {
    world.setBounds({ minX: -10, maxX: 10, minZ: -19, maxZ: 20 });
    world.addGround(0x626a5b);
    world.addRoad(0, 0, 9.5, 40, 0x606563);
    world.addRoad(0, -1.5, 20, 9.5, 0x606563);

    world.addBuilding(-14, 5.2, -12, 8, 10.4, 12, 0x706d68);
    world.addBuilding(14, 5.6, -12, 8, 11.2, 12, 0x686d6b);
    world.addBuilding(-14, 5.5, 12, 8, 11, 12, 0x6d706b);
    world.addBuilding(14, 5.0, 12, 8, 10, 12, 0x747069);

    this.curb = world.addCurbCover(-6.8, -5.2, 9.5, 0);
    world.addTree(-8.5, 11.5);
    world.addTree(8.4, 10.8);
    world.addParkedCar(5.8, -9.5, Math.PI / 2, 0x596f7a);
  },

  reset(world) {
    world.setPlayerPosition(0, 14.5);
    world.movementSpeedMultiplier = 1;
    world.clearAction();
    world.clearDialogue();
    world.stageState = {
      threatStarted: false,
      threatStartedAtMs: null,
      threatPosition: null,
      lastBurstAtMs: -5000,
      stableStopSeconds: 0,
      stoppedAtMs: null,
      movementBeforeStop: 0,
      postureDecisionShown: false,
      proneAtMs: null,
      prone: false,
      movedUpright: false,
      curbReachedAtMs: null,
      safeWaitSeconds: 0,
      completedAtMs: null
    };
  },

  getMetrics(world) {
    const state = world.stageState;
    return {
      reactionSeconds: state.stoppedAtMs === null || state.threatStartedAtMs === null
        ? null
        : Number(((state.stoppedAtMs - state.threatStartedAtMs) / 1000).toFixed(1)),
      proneSeconds: state.proneAtMs === null || state.threatStartedAtMs === null
        ? null
        : Number(((state.proneAtMs - state.threatStartedAtMs) / 1000).toFixed(1)),
      curbSeconds: state.curbReachedAtMs === null || state.threatStartedAtMs === null
        ? null
        : Number(((state.curbReachedAtMs - state.threatStartedAtMs) / 1000).toFixed(1)),
      prone: state.prone,
      movedUpright: state.movedUpright,
      movementBeforeStop: Number(state.movementBeforeStop.toFixed(1))
    };
  },

  showPostureDecision(world) {
    const state = world.stageState;
    const options = shuffleOptions([
      ["Впасти на землю та притиснутися до поверхні", "prone"],
      ["Продовжити біг через відкрите перехрестя", "run"],
      ["Залишитися стояти й визначати напрямок звуку", "stand"]
    ]);

    world.setDialogue(
      {
        title: "Звуки стрілянини наближаються",
        prompt: "Яку дію потрібно виконати негайно?",
        options: options.map(([label, value]) => ({ label, value }))
      },
      (value) => {
        if (value !== "prone") {
          state.movedUpright = value === "run";
          world.fail(
            value === "run"
              ? "Не можна продовжувати рух відкритою ділянкою у вертикальному положенні."
              : "Під час наближення стрілянини не можна залишатися у вертикальному положенні для спостереження.",
            this.getMetrics(world)
          );
          return;
        }

        state.prone = true;
        state.proneAtMs = world.elapsedMs;
        world.movementSpeedMultiplier = 0.32;
        world.clearDialogue();
      }
    );
  },

  update(world, delta) {
    const state = world.stageState;
    const { x, z } = world.camera.position;

    world.camera.position.y = state.prone ? 0.48 : 1.7;

    if (!state.threatStarted && world.elapsedMs >= 1200) {
      state.threatStarted = true;
      state.threatStartedAtMs = world.elapsedMs;
      state.threatPosition = { x, z };
      state.lastBurstAtMs = world.elapsedMs;
      world.playGunfireBurst(0.065);
    }

    if (!state.threatStarted) return;

    const threatAge = world.elapsedMs - state.threatStartedAtMs;
    if (world.elapsedMs - state.lastBurstAtMs >= Math.max(1800, 3600 - threatAge * 0.025)) {
      state.lastBurstAtMs = world.elapsedMs;
      world.playGunfireBurst(Math.min(0.16, 0.065 + threatAge / 180000));
    }

    if (state.stoppedAtMs === null) {
      state.movementBeforeStop = Math.max(
        state.movementBeforeStop,
        Math.hypot(x - state.threatPosition.x, z - state.threatPosition.z)
      );

      if (world.lastInputMagnitude < 0.04) {
        state.stableStopSeconds += delta;
        if (state.stableStopSeconds >= 0.5) {
          state.stoppedAtMs = world.elapsedMs;
          state.postureDecisionShown = true;
          world.setAction("Зайняти безпечнішу позицію", () => {
            world.clearAction();
            this.showPostureDecision(world);
          });
        }
      } else {
        state.stableStopSeconds = 0;
      }

      if (state.movementBeforeStop > 3.0 || threatAge > 5000) {
        state.movedUpright = true;
        world.fail(
          "Ви не припинили рух відкритою ділянкою в межах критичних п’яти секунд.",
          this.getMetrics(world)
        );
      }
      return;
    }

    if (!state.prone) {
      if (world.lastInputMagnitude > 0.08 && !world.controlsLocked) {
        state.movedUpright = true;
        world.fail(
          "Після зупинки не можна знову рухатися у вертикальному положенні.",
          this.getMetrics(world)
        );
        return;
      }

      if (threatAge > 9000) {
        world.fail(
          "Після зупинки ви не зайняли положення лежачи вчасно.",
          this.getMetrics(world)
        );
      }
      return;
    }

    if (threatAge > 40000 && state.curbReachedAtMs === null) {
      world.fail(
        "Після переходу в положення лежачи ви не дісталися доступної захисної позиції.",
        this.getMetrics(world)
      );
      return;
    }

    const inCurbZone = x <= -7.0 && z >= -9.4 && z <= -0.8;
    if (!inCurbZone) return;

    if (state.curbReachedAtMs === null) state.curbReachedAtMs = world.elapsedMs;

    if (world.lastInputMagnitude < 0.04) {
      state.safeWaitSeconds += delta;
    } else {
      state.safeWaitSeconds = 0;
    }

    if (state.safeWaitSeconds >= 1.5) {
      state.completedAtMs = world.elapsedMs;
      world.complete(this.getMetrics(world));
    }
  }
};
