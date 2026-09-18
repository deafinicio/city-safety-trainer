function shuffleOptions(options) {
  const shuffled = [...options];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

export const stage08 = {
  id: "stage-08",
  number: 8,
  title: "Житловий двір — повітряна загроза",
  shortTitle: "Повітряна загроза у дворі",
  instruction: "Рухайтеся житловим двором і реагуйте на зміну безпекової ситуації.",

  build(world) {
    world.setBounds({ minX: -9, maxX: 9, minZ: -20.5, maxZ: 20 });
    world.addGround(0x596750);
    world.addRoad(0, 0, 9.5, 38, 0x73756f);

    world.addBuilding(0, 6, -23, 20, 12, 8, 0x74736f);
    world.addBuilding(-12.5, 5.2, 0, 7, 10.4, 42, 0x716c65);
    world.addBuilding(12.5, 5.6, 0, 7, 11.2, 42, 0x6c706e);

    this.entrance = world.addApartmentEntrance(0, -18.92);
    world.addPlayground(-4.9, 2.2);
    world.addParkedCar(5.8, 7.3, 0.06, 0x526a7a);
    world.addParkedCar(5.7, 1.8, -0.08, 0x7c5a4f);
    world.addParkedCar(5.9, -4.1, 0.04, 0x555a5e);

    world.addBench(-3.7, 8.7, Math.PI / 2);
    world.addBench(3.8, -10.2, -Math.PI / 2);
    world.addTree(-7.2, 13.4);
    world.addTree(7.1, 14.8);
    world.addTree(-7.2, -7.5);
    world.addTree(7.3, -12.2);
  },

  reset(world) {
    world.setPlayerPosition(0, 15.5);
    world.clearAction();
    world.clearDialogue();
    world.stageState = {
      alarmStarted: false,
      alarmStartedAtMs: null,
      alarmPosition: null,
      lastSirenAtMs: -5000,
      approachSoundPlayed: false,
      stableStopSeconds: 0,
      stoppedAtMs: null,
      stopPosition: null,
      movementBeforeStop: 0,
      decisionAtMs: null,
      headingToEntrance: false,
      groundPositionChosen: false,
      shelterReachedAtMs: null,
      minEntranceDistance: Number.POSITIVE_INFINITY
    };
  },

  getMetrics(world) {
    const state = world.stageState;
    return {
      reactionSeconds: state.stoppedAtMs === null || state.alarmStartedAtMs === null
        ? null
        : Number(((state.stoppedAtMs - state.alarmStartedAtMs) / 1000).toFixed(1)),
      decisionSeconds: state.decisionAtMs === null || state.alarmStartedAtMs === null
        ? null
        : Number(((state.decisionAtMs - state.alarmStartedAtMs) / 1000).toFixed(1)),
      shelterSeconds: state.shelterReachedAtMs === null || state.alarmStartedAtMs === null
        ? null
        : Number(((state.shelterReachedAtMs - state.alarmStartedAtMs) / 1000).toFixed(1)),
      reachedEntrance: state.shelterReachedAtMs !== null,
      groundPositionChosen: state.groundPositionChosen,
      movementBeforeStop: Number(state.movementBeforeStop.toFixed(1)),
      minEntranceDistance: Number(state.minEntranceDistance.toFixed(1))
    };
  },

  showDecision(world) {
    const state = world.stageState;
    const options = shuffleOptions([
      ["Перейти до відкритого під’їзду", "entrance"],
      ["Залишитися посеред двору й чекати", "stay"],
      ["Лягти біля дитячого майданчика, хоча під’їзд доступний", "ground"]
    ]);

    world.setDialogue(
      {
        title: "Повітряна тривога",
        prompt: "Яке доступніше безпечніше місце потрібно обрати?",
        options: options.map(([label, value]) => ({ label, value }))
      },
      (value) => {
        state.decisionAtMs = world.elapsedMs;

        if (value === "stay") {
          world.fail(
            "Не можна залишатися у відкритій частині двору під час повітряної загрози.",
            this.getMetrics(world)
          );
          return;
        }

        if (value === "ground") {
          state.groundPositionChosen = true;
          world.fail(
            "Позиція на землі є запасним варіантом, коли доступнішого безпечного місця немає. У цій сцені поруч відкритий під’їзд.",
            this.getMetrics(world)
          );
          return;
        }

        state.headingToEntrance = true;
        world.clearDialogue();
      }
    );
  },

  update(world, delta) {
    const state = world.stageState;
    const { x, z } = world.camera.position;
    const entranceDistance = Math.hypot(x, z + 19.2);
    state.minEntranceDistance = Math.min(state.minEntranceDistance, entranceDistance);

    if (!state.alarmStarted && world.elapsedMs >= 1400) {
      state.alarmStarted = true;
      state.alarmStartedAtMs = world.elapsedMs;
      state.alarmPosition = { x, z };
      state.lastSirenAtMs = world.elapsedMs;
      world.playAirRaidSiren();
    }

    if (!state.alarmStarted) return;

    if (world.elapsedMs - state.lastSirenAtMs >= 4800 && !state.shelterReachedAtMs) {
      state.lastSirenAtMs = world.elapsedMs;
      world.playAirRaidSiren();
    }

    if (!state.approachSoundPlayed && world.elapsedMs - state.alarmStartedAtMs >= 60000) {
      state.approachSoundPlayed = true;
      world.playApproachRumble();
    }

    if (state.stoppedAtMs === null) {
      state.movementBeforeStop = Math.max(
        state.movementBeforeStop,
        Math.hypot(x - state.alarmPosition.x, z - state.alarmPosition.z)
      );

      if (world.lastInputMagnitude < 0.04) {
        state.stableStopSeconds += delta;
        if (state.stableStopSeconds >= 0.65) {
          state.stoppedAtMs = world.elapsedMs;
          state.stopPosition = { x, z };
          world.setAction("Оцінити безпечніші варіанти", () => {
            world.clearAction();
            this.showDecision(world);
          });
        }
      } else {
        state.stableStopSeconds = 0;
      }

      if (state.movementBeforeStop > 2.2) {
        world.fail(
          "Після сигналу тривоги ви продовжили рух відкритим двором, не зупинившись для оцінки ситуації.",
          this.getMetrics(world)
        );
        return;
      }

      if (world.elapsedMs - state.alarmStartedAtMs > 60000) {
        world.fail(
          "Правильну реакцію на однозначний сигнал повітряної загрози не розпочато вчасно.",
          this.getMetrics(world)
        );
      }
      return;
    }

    if (!state.headingToEntrance) {
      const movedAfterStop = Math.hypot(x - state.stopPosition.x, z - state.stopPosition.z);
      if (movedAfterStop > 0.45 && !world.controlsLocked) {
        world.fail(
          "Після оцінки ситуації потрібно спочатку обрати доступніше безпечне місце.",
          this.getMetrics(world)
        );
      }
      return;
    }

    if (Math.abs(x) <= 1.25 && z <= -18.45) {
      state.shelterReachedAtMs = world.elapsedMs;
      world.complete(this.getMetrics(world));
      return;
    }

    if (world.elapsedMs - state.alarmStartedAtMs > 60000) {
      world.fail(
        "До наближення повітряної загрози відкритого під’їзду не було досягнуто.",
        this.getMetrics(world)
      );
    }
  }
};
