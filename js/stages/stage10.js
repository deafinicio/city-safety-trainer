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
    this.safeMarker = world.addSafeZoneMarker(-8.0, -5.2, 0x80d99a);
    this.pathGuides = [
      world.addFloorGuide(-1.8, 9.3, 0x80d99a),
      world.addFloorGuide(-3.5, 4.2, 0x80d99a),
      world.addFloorGuide(-5.4, -0.2, 0x80d99a)
    ];
    this.safeMarker.visible = false;
    this.pathGuides.forEach((guide) => { guide.visible = false; });
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
    this.safeMarker.visible = false;
    this.pathGuides.forEach((guide) => { guide.visible = false; });
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
        state.initialCurbDistance = Math.hypot(
          world.camera.position.x + 8.0,
          world.camera.position.z + 5.2
        );
        world.movementSpeedMultiplier = 0.32;
        this.safeMarker.visible = true;
        this.pathGuides.forEach((guide) => { guide.visible = true; });
        world.setMissionInstruction(
          "Ви лежите. Повзіть за зеленими позначками до заглиблення за бетонним бордюром ліворуч попереду."
        );
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
      world.playGunfireBurst(0.19);
      world.setMissionInstruction(
        "⚠️ ЧУТНО СТРІЛЯНИНУ / РОБОТУ ППО. Негайно зупиніться та не залишайтеся у повний зріст."
      );
    }

    if (!state.threatStarted) return;

    const threatAge = world.elapsedMs - state.threatStartedAtMs;
    if (world.elapsedMs - state.lastBurstAtMs >= Math.max(1800, 3600 - threatAge * 0.025)) {
      state.lastBurstAtMs = world.elapsedMs;
      world.playGunfireBurst(Math.min(0.3, 0.19 + threatAge / 120000));
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

    const curbDistance = Math.hypot(x + 8.0, z + 5.2);
    if (state.curbReachedAtMs === null) {
      world.setMissionInstruction(
        `Повзіть за зеленими позначками до бордюру ліворуч попереду — ${Math.max(0, Math.round(curbDistance))} м.`
      );
    } else {
      world.setMissionInstruction("Захисної позиції досягнуто. Залишайтеся лежати й не рухайтеся.");
    }

    if (curbDistance > state.initialCurbDistance + 1.8) {
      world.fail(
        "Ви повзете у протилежному напрямку від доступної захисної позиції.",
        this.getMetrics(world)
      );
      return;
    }

    if (threatAge > 25000 && state.curbReachedAtMs === null) {
      world.fail(
        "Після переходу в положення лежачи ви не дісталися доступної захисної позиції.",
        this.getMetrics(world)
      );
      return;
    }

    const inCurbZone = x <= -6.3 && z >= -10.0 && z <= 0.2;
    if (!inCurbZone) return;

    if (state.curbReachedAtMs === null) {
      state.curbReachedAtMs = world.elapsedMs;
      world.setMissionInstruction("Захисної позиції досягнуто. Залишайтеся лежати й не рухайтеся.");
    }

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
