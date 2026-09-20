function shuffleOptions(options) {
  const shuffled = [...options];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

export const stage07 = {
  id: "stage-07",
  number: 7,
  title: "Автомобіль на замінованій території",
  shortTitle: "Автомобіль у мінному полі",
  instruction: "Огляньте ситуацію із салону автомобіля та оберіть безпечний алгоритм дій.",

  build(world) {
    world.setBounds({ minX: -16, maxX: 16, minZ: -28, maxZ: 24 });
    world.addGround(0x69704d);
    world.addRoad(-4.6, -2, 5.4, 52, 0x75664f);
    world.addTireTracks(-4.6, -2, 43);

    for (const z of [-19, -11, -3, 5, 13, 21]) {
      world.addTree(-9.3, z);
    }

    this.mine = world.addAntiVehicleMine(4.15, -4.4, 0.22);
    world.addAntiVehicleMine(8.4, -13.5, -0.35);
    world.addAntiVehicleMine(10.8, 8.5, 0.5);
    world.addCarInterior(3.55, 2.4, -0.08);
  },

  reset(world) {
    world.setPlayerPosition(3.55, 2.4);
    world.movementLocked = true;
    world.clearAction();
    world.clearDialogue();
    world.playVehicleStopSound();
    world.stageState = {
      detected: false,
      detectedAtMs: null,
      decisionShown: false,
      decisionAtMs: null,
      stayedInVehicle: false,
      attemptedDrive: false,
      openedDoor: false,
      callStartedAtMs: null,
      callCompletedAtMs: null,
      calledNumber: null,
      reportStep: 0,
      correctSequence: false
    };
  },

  getMetrics(world) {
    const state = world.stageState;
    return {
      recognitionSeconds: state.detectedAtMs === null
        ? null
        : Number((state.detectedAtMs / 1000).toFixed(1)),
      decisionSeconds: state.decisionAtMs === null || state.detectedAtMs === null
        ? null
        : Number(((state.decisionAtMs - state.detectedAtMs) / 1000).toFixed(1)),
      callSeconds: state.callCompletedAtMs === null || state.callStartedAtMs === null
        ? null
        : Number(((state.callCompletedAtMs - state.callStartedAtMs) / 1000).toFixed(1)),
      stayedInVehicle: state.stayedInVehicle,
      attemptedDrive: state.attemptedDrive,
      openedDoor: state.openedDoor,
      calledNumber: state.calledNumber,
      correctSequence: state.correctSequence
    };
  },

  showDecision(world) {
    const state = world.stageState;
    const options = shuffleOptions([
      ["Залишитися в автомобілі й не намагатися рушити", "stay"],
      ["Відкрити двері та оглянути землю біля автомобіля", "door"],
      ["Спробувати заднім ходом повернутися на дорогу", "drive"]
    ]);

    world.setDialogue(
      {
        title: "Автомобіль зупинився в полі",
        prompt: "Яку дію потрібно виконати першою?",
        correctValue: "stay",
        options: options.map(([label, value]) => ({ label, value }))
      },
      (value) => {
        state.decisionAtMs = world.elapsedMs;

        if (value === "door") {
          state.openedDoor = true;
          world.fail(
            "Не можна відкривати двері або виходити з автомобіля на потенційно замінованій території.",
            this.getMetrics(world)
          );
          return;
        }

        if (value === "drive") {
          state.attemptedDrive = true;
          world.fail(
            "Самостійна спроба виїхати полем може привести автомобіль до іншої міни.",
            this.getMetrics(world)
          );
          return;
        }

        state.stayedInVehicle = true;
        world.clearDialogue();
        world.setAction("Зателефонувати до екстреної служби", () => {
          state.callStartedAtMs = world.elapsedMs;
          world.clearAction();
          world.openEmergencyDialer({
            acceptedNumbers: ["101", "102", "112"],
            onComplete: (number) => {
              state.calledNumber = number;
              this.startReportSequence(world, 0);
            }
          });
        });
      }
    );
  },

  startReportSequence(world, stepIndex) {
    const state = world.stageState;
    const steps = [
      {
        prompt: "Що потрібно повідомити оператору?",
        correct: "situation",
        options: [
          ["Точне місце та те, що автомобіль опинився біля міни в полі", "situation"],
          ["Лише марку й колір автомобіля", "car"],
          ["Що я зараз вийду й перевірю дорогу", "inspect"]
        ]
      },
      {
        prompt: "Як діяти після повідомлення?",
        correct: "wait",
        options: [
          ["Залишатися в автомобілі та виконувати отримані вказівки", "wait"],
          ["Вийти через двері й чекати поруч", "exit"],
          ["Повільно продовжити рух полем", "move"]
        ]
      }
    ];
    const step = steps[stepIndex];
    state.reportStep = stepIndex;

    world.setDialogue(
      {
        title: `Умовний виклик ${state.calledNumber}`,
        prompt: step.prompt,
        correctValue: step.correct,
        options: shuffleOptions(step.options).map(([label, value]) => ({ label, value }))
      },
      (value) => {
        if (value !== step.correct) {
          world.fail(
            "Під час виклику обрано дію, яка може призвести до виходу на заміновану територію.",
            this.getMetrics(world)
          );
          return;
        }

        if (stepIndex < steps.length - 1) {
          this.startReportSequence(world, stepIndex + 1);
          return;
        }

        state.callCompletedAtMs = world.elapsedMs;
        state.correctSequence = true;
        world.clearDialogue();
        world.complete(this.getMetrics(world));
      }
    );
  },

  update(world, delta) {
    const state = world.stageState;

    if (world.elapsedMs < 850) {
      const strength = 1 - world.elapsedMs / 850;
      world.camera.position.y = 1.7 + Math.sin(world.elapsedMs * 0.055) * 0.025 * strength;
    } else {
      world.camera.position.y = 1.7;
    }

    if (!state.detected && world.isObjectVisible(this.mine, 12, 0.62)) {
      state.detected = true;
      state.detectedAtMs = world.elapsedMs;
      world.setMissionInstruction(
        "Автомобіль зупинився біля ознак мінної небезпеки. Не виходьте й не намагайтеся рушити. Натисніть E, коли будете готові обрати дію."
      );
    }

    if (!state.detected) return;

    if (!state.decisionShown && world.elapsedMs - state.detectedAtMs >= 700) {
      state.decisionShown = true;
      world.setAction("Обрати подальші дії", () => {
        world.clearAction();
        this.showDecision(world);
      });
    }

  }
};
