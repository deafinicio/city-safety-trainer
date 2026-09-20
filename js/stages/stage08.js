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
    world.addBuilding(0, 6, -23, 20, 12, 8, 0x74736f, { collidable: false });
    world.addCollisionBox(-5.65, -23, 8.7, 8);
    world.addCollisionBox(5.65, -23, 8.7, 8);
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
    world.movementLocked = false;
    world.stageState = {
      alarmStarted: false,
      alarmStartedAtMs: null,
      evacuationStartedAtMs: null,
      lastSirenAtMs: -5000,
      approachStartedAtMs: null,
      lastApproachSoundAtMs: null,
      approachPosition: null,
      proneAtMs: null,
      prone: false,
      shelterReachedAtMs: null,
      minEntranceDistance: Number.POSITIVE_INFINITY
    };
  },

  getMetrics(world) {
    const state = world.stageState;
    return {
      reactionSeconds: state.evacuationStartedAtMs === null || state.alarmStartedAtMs === null
        ? null
        : Number(((state.evacuationStartedAtMs - state.alarmStartedAtMs) / 1000).toFixed(1)),
      proneSeconds: state.proneAtMs === null || state.approachStartedAtMs === null
        ? null
        : Number(((state.proneAtMs - state.approachStartedAtMs) / 1000).toFixed(1)),
      shelterSeconds: state.shelterReachedAtMs === null || state.alarmStartedAtMs === null
        ? null
        : Number(((state.shelterReachedAtMs - state.alarmStartedAtMs) / 1000).toFixed(1)),
      reachedEntrance: state.shelterReachedAtMs !== null,
      groundPositionChosen: state.prone,
      minEntranceDistance: Number(state.minEntranceDistance.toFixed(1))
    };
  },

  beginApproachPhase(world) {
    const state = world.stageState;
    if (state.approachStartedAtMs !== null) return;
    state.approachStartedAtMs = world.elapsedMs;
    state.lastApproachSoundAtMs = world.elapsedMs;
    state.approachPosition = { x: world.camera.position.x, z: world.camera.position.z };
    world.playApproachRumble();
    world.setMissionInstruction(
      "⚠️ ЧУТНО ШВИДКЕ НАБЛИЖЕННЯ КАБу. Під’їзд уже недосяжний: негайно зупиніться та натисніть E, щоб лягти на землю."
    );
    world.setAction("Негайно лягти на землю", () => {
      state.prone = true;
      state.proneAtMs = world.elapsedMs;
      world.movementLocked = true;
      world.clearAction();
      world.setMissionInstruction(
        "Ви лежите, притиснувшись до землі. Закрийте голову руками та залишайтеся в нижчому положенні."
      );
    });
  },

  update(world) {
    const state = world.stageState;
    const { x, z } = world.camera.position;
    const entranceDistance = Math.hypot(x, z + 19.2);
    state.minEntranceDistance = Math.min(state.minEntranceDistance, entranceDistance);
    world.camera.position.y = state.prone ? 0.48 : 1.7;

    if (!state.alarmStarted && world.elapsedMs >= 1400) {
      state.alarmStarted = true;
      state.alarmStartedAtMs = world.elapsedMs;
      state.lastSirenAtMs = world.elapsedMs;
      world.playAirRaidSiren();
      world.setMissionInstruction(
        "⚠️ ПОВІТРЯНА ТРИВОГА. Відкритий під’їзд попереду — негайно біжіть до нього."
      );
    }
    if (!state.alarmStarted) return;

    if (state.evacuationStartedAtMs === null && world.lastInputMagnitude > 0.08) {
      state.evacuationStartedAtMs = world.elapsedMs;
    }
    if (world.elapsedMs - state.lastSirenAtMs >= 4800 && state.approachStartedAtMs === null) {
      state.lastSirenAtMs = world.elapsedMs;
      world.playAirRaidSiren();
    }
    if (Math.abs(x) <= 1.25 && z <= -18.45 && state.approachStartedAtMs === null) {
      state.shelterReachedAtMs = world.elapsedMs;
      world.complete(this.getMetrics(world));
      return;
    }

    const alarmAge = world.elapsedMs - state.alarmStartedAtMs;
    if (state.approachStartedAtMs === null) {
      const secondsLeft = Math.max(0, Math.ceil((14000 - alarmAge) / 1000));
      world.setMissionInstruction(
        `⚠️ ПОВІТРЯНА ТРИВОГА. Біжіть до відкритого під’їзду попереду — орієнтовно ${Math.ceil(entranceDistance)} м, до наближення загрози ${secondsLeft} с.`
      );
      if (alarmAge >= 14000) this.beginApproachPhase(world);
      return;
    }

    const approachAge = world.elapsedMs - state.approachStartedAtMs;
    if (!state.prone) {
      const movedAfterWarning = Math.hypot(
        x - state.approachPosition.x,
        z - state.approachPosition.z
      );
      if (movedAfterWarning > 0.9) {
        world.fail(
          "Після звуку швидкого наближення КАБу потрібно негайно припинити біг і лягти на землю.",
          this.getMetrics(world)
        );
        return;
      }
      if (world.elapsedMs - state.lastApproachSoundAtMs >= 2200) {
        state.lastApproachSoundAtMs = world.elapsedMs;
        world.playApproachRumble();
      }
      if (approachAge > 7000) {
        world.fail(
          "Після наближення повітряної загрози положення лежачи не було зайнято вчасно.",
          this.getMetrics(world)
        );
      }
      return;
    }

    if (world.elapsedMs - state.proneAtMs >= 1800) {
      world.complete(this.getMetrics(world));
    }
  }
};
