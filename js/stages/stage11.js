function shuffleOptions(options) {
  const shuffled = [...options];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

export const stage11 = {
  id: "stage-11",
  number: 11,
  title: "Будівля — правило двох стін",
  shortTitle: "Правило двох стін",
  instruction: "Огляньте приміщення та реагуйте на звуки стрілянини й роботу ППО.",

  build(world) {
    world.setBounds({ minX: -7.7, maxX: 7.7, minZ: -12.6, maxZ: 14 });
    world.addInteriorFloor(16, 28, 0x77766f);
    world.addInteriorCeiling(16, 28);
    world.addWindowedWall(-12.8, 15.6);
    world.addInteriorWall(-7.9, 0.5, 0.3, 27, 4.2, 0xaaa79d);
    world.addInteriorWall(7.9, 0.5, 0.3, 27, 4.2, 0xaaa79d);

    world.addInteriorWall(-2.55, 0.8, 10.7, 0.32, 3.8, 0xa4a197);
    world.addInteriorWall(6.35, 0.8, 2.7, 0.32, 3.8, 0xa4a197);
    world.addInteriorWall(-0.7, 7.2, 0.32, 8.0, 3.8, 0x9d9b93);
    this.stairwell = world.addStairwell(4.1, 9.5);
    world.addTextSign("СХОДОВА КЛІТИНА →", 3.85, 3.25, 0.58, Math.PI, "#356b46");
    this.safeMarker = world.addSafeZoneMarker(4.1, 8.4, 0x80d99a);
    this.pathGuides = [
      world.addFloorGuide(1.5, -2.2, 0x80d99a),
      world.addFloorGuide(3.8, 2.5, 0x80d99a),
      world.addFloorGuide(4.1, 5.7, 0x80d99a)
    ];
    this.safeMarker.visible = false;
    this.pathGuides.forEach((guide) => { guide.visible = false; });

    world.addBench(-3.8, -5.3, 0);
    world.addBench(2.7, -5.1, 0);
    this.windowWall = world.stageRoot.children.find((object) => object.userData?.glassMaterial);
  },

  reset(world) {
    world.setPlayerPosition(0, -5.8);
    world.clearAction();
    world.clearDialogue();
    if (this.windowWall?.userData.glassMaterial) {
      this.windowWall.userData.glassMaterial.emissive.setHex(0x0b1114);
      this.windowWall.userData.glassMaterial.emissiveIntensity = 0;
    }
    this.safeMarker.visible = false;
    this.pathGuides.forEach((guide) => { guide.visible = false; });
    world.stageState = {
      threatStarted: false,
      threatStartedAtMs: null,
      lastBurstAtMs: -5000,
      decisionShown: false,
      decisionAtMs: null,
      headingToSafeZone: false,
      approachedWindow: false,
      filmed: false,
      stayedNearWindow: false,
      safeZoneReachedAtMs: null,
      safeWaitSeconds: 0,
      minWindowDistance: Number.POSITIVE_INFINITY
    };
  },

  getMetrics(world) {
    const state = world.stageState;
    return {
      reactionSeconds: state.decisionAtMs === null || state.threatStartedAtMs === null
        ? null
        : Number(((state.decisionAtMs - state.threatStartedAtMs) / 1000).toFixed(1)),
      safeZoneSeconds: state.safeZoneReachedAtMs === null || state.threatStartedAtMs === null
        ? null
        : Number(((state.safeZoneReachedAtMs - state.threatStartedAtMs) / 1000).toFixed(1)),
      minWindowDistance: Number(state.minWindowDistance.toFixed(1)),
      approachedWindow: state.approachedWindow,
      filmed: state.filmed,
      reachedTwoWalls: state.safeZoneReachedAtMs !== null
    };
  },

  showDecision(world) {
    const state = world.stageState;
    const options = shuffleOptions([
      ["Відійти від вікон до внутрішньої частини будівлі", "safe"],
      ["Підійти до вікна та подивитися назовні", "window"],
      ["Зняти події за вікном на телефон", "film"],
      ["Залишитися біля зовнішньої стіни", "stay"]
    ]);

    world.setDialogue(
      {
        title: "Стрілянина та робота ППО",
        prompt: "Яку дію потрібно виконати?",
        options: options.map(([label, value]) => ({ label, value }))
      },
      (value) => {
        state.decisionAtMs = world.elapsedMs;

        if (value === "window") {
          state.approachedWindow = true;
          world.fail(
            "Не можна наближатися до вікна або спостерігати за подіями назовні.",
            this.getMetrics(world)
          );
          return;
        }

        if (value === "film") {
          state.filmed = true;
          world.fail(
            "Фото- та відеозйомка біля вікна збільшує ризик і не є безпечною дією.",
            this.getMetrics(world)
          );
          return;
        }

        if (value === "stay") {
          state.stayedNearWindow = true;
          world.fail(
            "Не можна залишатися біля вікон і зовнішньої стіни під час загрози.",
            this.getMetrics(world)
          );
          return;
        }

        state.headingToSafeZone = true;
        this.safeMarker.visible = true;
        this.pathGuides.forEach((guide) => { guide.visible = true; });
        world.setMissionInstruction(
          "Розверніться від вікон. Ідіть за зеленими позначками через прохід «Сходова клітина» праворуч."
        );
        world.clearDialogue();
      }
    );
  },

  update(world, delta) {
    const state = world.stageState;
    const { x, z } = world.camera.position;
    const windowDistance = z + 12.8;
    state.minWindowDistance = Math.min(state.minWindowDistance, windowDistance);

    if (!state.threatStarted && world.elapsedMs >= 1200) {
      state.threatStarted = true;
      state.threatStartedAtMs = world.elapsedMs;
      state.lastBurstAtMs = world.elapsedMs;
      world.playGunfireBurst(0.17);
      world.setMissionInstruction(
        "⚠️ ЧУТНО СТРІЛЯНИНУ / РОБОТУ ППО. Відійдіть від вікон і зовнішньої стіни."
      );
    }

    if (!state.threatStarted) return;

    const threatAge = world.elapsedMs - state.threatStartedAtMs;
    if (world.elapsedMs - state.lastBurstAtMs >= Math.max(1900, 3800 - threatAge * 0.02)) {
      state.lastBurstAtMs = world.elapsedMs;
      world.playGunfireBurst(Math.min(0.28, 0.17 + threatAge / 130000));
    }

    if (this.windowWall?.userData.glassMaterial) {
      const flash = Math.sin(world.elapsedMs * 0.018) > 0.88 ? 1.8 : 0;
      this.windowWall.userData.glassMaterial.emissive.setHex(flash ? 0xffd59a : 0x0b1114);
      this.windowWall.userData.glassMaterial.emissiveIntensity = flash;
    }

    if (!state.decisionShown && threatAge >= 500) {
      state.decisionShown = true;
      world.setAction("Обрати безпечнішу дію", () => {
        world.clearAction();
        this.showDecision(world);
      });
    }

    if (z < -8.5 && !world.controlsLocked) {
      state.approachedWindow = true;
      world.fail(
        "Ви наблизилися до вікна після появи звукової загрози.",
        this.getMetrics(world)
      );
      return;
    }

    if (!state.headingToSafeZone && threatAge > 10000) {
      state.stayedNearWindow = true;
      world.fail(
        "Ви не почали перехід від вікон до внутрішньої частини будівлі.",
        this.getMetrics(world)
      );
      return;
    }

    if (!state.headingToSafeZone) return;

    const safeDistance = Math.hypot(x - 4.1, z - 8.4);
    if (state.safeZoneReachedAtMs === null) {
      world.setMissionInstruction(
        `Ідіть за зеленими позначками до сходової клітини праворуч — ${Math.max(0, Math.round(safeDistance))} м.`
      );
    } else {
      world.setMissionInstruction("Зони за двома стінами досягнуто. Залишайтеся тут до припинення загрози.");
    }

    if (z >= 3.5 && x < 1.6) {
      world.setMissionInstruction(
        "Ви у внутрішній частині, але потрібна сходова клітина праворуч. Пройдіть через позначений зелений маршрут."
      );
    }

    if (threatAge > 28000 && state.safeZoneReachedAtMs === null) {
      world.fail(
        "Ви не дісталися внутрішньої частини будівлі в межах часу реагування.",
        this.getMetrics(world)
      );
      return;
    }

    const inSafeZone = x >= 2.0 && z >= 6.6;
    if (!inSafeZone) return;

    if (state.safeZoneReachedAtMs === null) {
      state.safeZoneReachedAtMs = world.elapsedMs;
      world.setMissionInstruction("Зони за двома стінами досягнуто. Залишайтеся тут до припинення загрози.");
    }
    if (world.lastInputMagnitude < 0.04) {
      state.safeWaitSeconds += delta;
    } else {
      state.safeWaitSeconds = 0;
    }

    if (state.safeWaitSeconds >= 1.8) {
      world.complete(this.getMetrics(world));
    }
  }
};
