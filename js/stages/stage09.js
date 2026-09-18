function shuffleOptions(options) {
  const shuffled = [...options];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

export const stage09 = {
  id: "stage-09",
  number: 9,
  title: "Скляна зупинка та загроза БПЛА",
  shortTitle: "Загроза БПЛА біля зупинки",
  instruction: "Огляньте міську вулицю та реагуйте на звук наближення БПЛА.",

  build(world) {
    world.setBounds({ minX: -9, maxX: 9, minZ: -21, maxZ: 22 });
    world.addGround(0x606a5a);
    world.addRoad(0, 0, 7.2, 46, 0x555b5a);
    world.addRoad(-5.1, 0, 2.5, 46, 0x8a8a81);
    world.addRoad(5.1, 0, 2.5, 46, 0x8a8a81);

    world.addBuilding(-12.2, 5.4, 0, 7, 10.8, 46, 0x706d68);
    world.addBuilding(12.3, 5.8, 0, 7, 11.6, 46, 0x6b706e);

    this.busStop = world.addGlassBusStop(-5.0, 8.2, 0);
    this.shelter = world.addMobileShelter(4.7, -12.7, 0);
    this.drone = world.addAttackDrone(-1.5, 8.5, 31);

    world.addBench(4.9, 7.4, -Math.PI / 2);
    world.addParkedCar(2.3, 2.8, 0.02, 0x556c78);
    world.addParkedCar(-1.9, -5.2, -0.05, 0x76554d);
    world.addTree(-7.4, 16.5);
    world.addTree(7.3, 14.2);
    world.addTree(-7.4, -4.2);
    world.addTree(7.5, -18.2);
  },

  reset(world) {
    world.setPlayerPosition(-4.8, 10.0);
    world.clearAction();
    world.clearDialogue();
    world.stageState = {
      threatStarted: false,
      threatStartedAtMs: null,
      startPosition: null,
      startShelterDistance: null,
      lastBuzzAtMs: -5000,
      decisionShown: false,
      decisionAtMs: null,
      headingToShelter: false,
      stayedByGlass: false,
      groundByGlass: false,
      movedTowardThreat: false,
      shelterReachedAtMs: null,
      glassExitAtMs: null,
      minShelterDistance: Number.POSITIVE_INFINITY,
      maxGlassDistance: 0
    };
    this.drone.position.set(-1.5, 8.5, 31);
  },

  getMetrics(world) {
    const state = world.stageState;
    return {
      decisionSeconds: state.decisionAtMs === null || state.threatStartedAtMs === null
        ? null
        : Number(((state.decisionAtMs - state.threatStartedAtMs) / 1000).toFixed(1)),
      glassExitSeconds: state.glassExitAtMs === null || state.threatStartedAtMs === null
        ? null
        : Number(((state.glassExitAtMs - state.threatStartedAtMs) / 1000).toFixed(1)),
      shelterSeconds: state.shelterReachedAtMs === null || state.threatStartedAtMs === null
        ? null
        : Number(((state.shelterReachedAtMs - state.threatStartedAtMs) / 1000).toFixed(1)),
      reachedShelter: state.shelterReachedAtMs !== null,
      stayedByGlass: state.stayedByGlass,
      groundByGlass: state.groundByGlass,
      movedTowardThreat: state.movedTowardThreat,
      minShelterDistance: Number(state.minShelterDistance.toFixed(1))
    };
  },

  showDecision(world) {
    const state = world.stageState;
    const options = shuffleOptions([
      ["Відійти від скла та перейти до мобільного укриття", "shelter"],
      ["Залишитися всередині скляної зупинки", "glass"],
      ["Лягти на землю поруч зі скляними панелями", "ground"],
      ["Рухатися дорогою назустріч звуку", "threat"]
    ]);

    world.setDialogue(
      {
        title: "Наближається БПЛА",
        prompt: "Який алгоритм дій є безпечнішим?",
        options: options.map(([label, value]) => ({ label, value }))
      },
      (value) => {
        state.decisionAtMs = world.elapsedMs;

        if (value === "glass") {
          state.stayedByGlass = true;
          world.fail(
            "Скляна зупинка не захищає від вибухової хвилі та уламків скла.",
            this.getMetrics(world)
          );
          return;
        }

        if (value === "ground") {
          state.groundByGlass = true;
          world.fail(
            "Не можна займати позицію на землі поруч зі скляною конструкцією, коли доступне мобільне укриття.",
            this.getMetrics(world)
          );
          return;
        }

        if (value === "threat") {
          state.movedTowardThreat = true;
          world.fail(
            "Заборонено рухатися назустріч звуку повітряної загрози.",
            this.getMetrics(world)
          );
          return;
        }

        state.headingToShelter = true;
        world.clearDialogue();
      }
    );
  },

  update(world) {
    const state = world.stageState;
    const { x, z } = world.camera.position;
    const glassDistance = Math.hypot(x + 5.0, z - 8.2);
    const shelterDistance = Math.hypot(x - 4.7, z + 11.1);
    state.minShelterDistance = Math.min(state.minShelterDistance, shelterDistance);
    state.maxGlassDistance = Math.max(state.maxGlassDistance, glassDistance);

    if (!state.threatStarted && world.elapsedMs >= 1200) {
      state.threatStarted = true;
      state.threatStartedAtMs = world.elapsedMs;
      state.startPosition = { x, z };
      state.startShelterDistance = shelterDistance;
      state.lastBuzzAtMs = world.elapsedMs;
      world.playDroneBuzz(0.055);
    }

    if (!state.threatStarted) return;

    const threatProgress = Math.min(1, (world.elapsedMs - state.threatStartedAtMs) / 60000);
    this.drone.position.z = 31 - threatProgress * 26;
    this.drone.position.y = 8.5 - threatProgress * 3.5;

    if (world.elapsedMs - state.lastBuzzAtMs >= 2700 && !state.shelterReachedAtMs) {
      state.lastBuzzAtMs = world.elapsedMs;
      world.playDroneBuzz(0.055 + threatProgress * 0.09);
    }

    if (!state.decisionShown && world.elapsedMs - state.threatStartedAtMs >= 600) {
      state.decisionShown = true;
      world.setAction("Обрати безпечнішу дію", () => {
        world.clearAction();
        this.showDecision(world);
      });
    }

    if (state.glassExitAtMs === null && glassDistance >= 4.1) {
      state.glassExitAtMs = world.elapsedMs;
    }

    if (!state.headingToShelter) {
      if (z > state.startPosition.z + 1.4 && !world.controlsLocked) {
        state.movedTowardThreat = true;
        world.fail(
          "Ви почали рухатися назустріч звуку БПЛА замість виходу із небезпечної зони.",
          this.getMetrics(world)
        );
        return;
      }

      if (glassDistance < 3.5 && world.elapsedMs - state.threatStartedAtMs > 10000) {
        state.stayedByGlass = true;
        world.fail(
          "Ви надто довго залишалися біля скляної конструкції після появи загрози.",
          this.getMetrics(world)
        );
        return;
      }
    }

    if (state.headingToShelter) {
      if (shelterDistance > state.startShelterDistance + 2.0) {
        state.movedTowardThreat = true;
        world.fail(
          "Обраний напрямок віддаляє вас від мобільного укриття.",
          this.getMetrics(world)
        );
        return;
      }

      if (Math.abs(x - 4.7) <= 1.3 && z <= -11.15 && z >= -15.1) {
        state.shelterReachedAtMs = world.elapsedMs;
        world.complete(this.getMetrics(world));
        return;
      }
    }

    if (world.elapsedMs - state.threatStartedAtMs > 60000) {
      world.fail(
        "Мобільного укриття не було досягнуто в межах часу реагування.",
        this.getMetrics(world)
      );
    }
  }
};
