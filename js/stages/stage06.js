function shuffleOptions(options) {
  const shuffled = [...options];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

export const stage06 = {
  id: "stage-06",
  number: 6,
  title: "Міська вулиця — покинутий рюкзак із телефоном",
  shortTitle: "Покинутий рюкзак",
  instruction: "Огляньте міську вулицю, розпізнайте підозрілий предмет і дійте безпечно.",

  build(world) {
    world.setBounds({ minX: -7.8, maxX: 7.8, minZ: -22, maxZ: 20 });
    world.addGround(0x566153);
    world.addRoad(0, -1, 8.2, 40, 0x777872);

    world.addBuilding(-11.1, 4.4, -2, 6, 8.8, 38, 0x6d6d68);
    world.addBuilding(11.1, 5, -2, 6, 10, 38, 0x73706a);

    world.addTree(-5.6, 13);
    world.addTree(5.7, 10);
    world.addTree(-5.5, 2);
    world.addTree(5.6, -6);
    world.addTree(-5.4, -15);
    world.addTree(5.5, -17);

    world.addBench(-4.2, 6.5, Math.PI / 2);
    world.addBench(4.2, -8, -Math.PI / 2);

    this.backpack = world.addBackpack(0.55, 1.3, 0.18);
    world.addGoal(0, 18.2, 6.4);
  },

  reset(world) {
    world.setPlayerPosition(0, 12.5);
    world.clearAction();
    world.clearDialogue();
    world.stageState = {
      detected: false,
      detectedAtMs: null,
      detectionPosition: null,
      stableStopSeconds: 0,
      stoppedAtMs: null,
      movementAfterDetection: 0,
      minDistance: Number.POSITIVE_INFINITY,
      maxDistanceAfterStop: 0,
      safeDistanceReached: false,
      safeReachedAtMs: null,
      safeStopSeconds: 0,
      phoneActionShown: false,
      callStartedAtMs: null,
      callCompletedAtMs: null,
      callStep: 0,
      callSequenceCorrect: false,
      calledNumber: null,
      lastRingAtMs: -2000,
      ringPulseUntilMs: 0,
      trajectory: [],
      lastTrajectorySample: 0
    };
  },

  getMetrics(world) {
    const state = world.stageState;
    return {
      reactionSeconds: state.stoppedAtMs === null || state.detectedAtMs === null
        ? null
        : Number(((state.stoppedAtMs - state.detectedAtMs) / 1000).toFixed(1)),
      safeDistanceSeconds: state.safeReachedAtMs === null || state.detectedAtMs === null
        ? null
        : Number(((state.safeReachedAtMs - state.detectedAtMs) / 1000).toFixed(1)),
      callSeconds: state.callCompletedAtMs === null || state.callStartedAtMs === null
        ? null
        : Number(((state.callCompletedAtMs - state.callStartedAtMs) / 1000).toFixed(1)),
      minDistance: Number.isFinite(state.minDistance)
        ? Number(state.minDistance.toFixed(1))
        : null,
      safeDistanceReached: state.safeDistanceReached,
      callSequenceCorrect: state.callSequenceCorrect,
      calledNumber: state.calledNumber,
      trajectoryPoints: state.trajectory.length
    };
  },

  startCallSequence(world, stepIndex = 0) {
    const state = world.stageState;
    const steps = [
      {
        prompt: "Що необхідно повідомити насамперед?",
        correct: "location",
        options: [
          ["Точне місце виявлення предмета", "location"],
          ["Лише колір рюкзака", "color"],
          ["Своє припущення про власника", "owner"]
        ]
      },
      {
        prompt: "Як правильно описати побачене?",
        correct: "danger",
        options: [
          ["Залишений без нагляду рюкзак, з якого чути телефон", "danger"],
          ["Звичайна загублена річ без ознак небезпеки", "lost"],
          ["Рюкзак, який я вже відкрив і перевірив", "opened"]
        ]
      },
      {
        prompt: "Що потрібно повідомити про своє місцеперебування?",
        correct: "safe",
        options: [
          ["Я перебуваю на безпечній відстані від предмета", "safe"],
          ["Я стою поруч і можу оглянути рюкзак", "near"],
          ["Я повертаюся до предмета для уточнення", "return"]
        ]
      },
      {
        prompt: "Як діяти після завершення повідомлення?",
        correct: "wait",
        options: [
          ["Не повертатися та виконувати отримані вказівки", "wait"],
          ["Повернутися і забрати рюкзак з дороги", "move"],
          ["Попросити перехожого перевірити предмет", "ask"]
        ]
      }
    ];

    const step = steps[stepIndex];
    state.callStep = stepIndex;

    world.setDialogue(
      {
        variant: "questions",
        title: `Умовний виклик ${state.calledNumber}`,
        prompt: step.prompt,
        correctValue: step.correct,
        options: shuffleOptions(step.options).map(([label, value]) => ({ label, value }))
      },
      (value) => {
        if (value !== step.correct) {
          world.fail(
            `Під час повідомлення ${state.calledNumber} обрано небезпечну або неправильну дію.`,
            this.getMetrics(world)
          );
          return;
        }

        if (stepIndex < steps.length - 1) {
          this.startCallSequence(world, stepIndex + 1);
          return;
        }

        state.callCompletedAtMs = world.elapsedMs;
        state.callSequenceCorrect = true;
        world.clearDialogue();
        world.complete(this.getMetrics(world));
      }
    );
  },

  update(world, delta) {
    const state = world.stageState;
    const { x, z } = world.camera.position;
    const now = performance.now();
    const distance = world.distanceToObject2D(this.backpack);

    if (world.elapsedMs < state.ringPulseUntilMs) {
      const pulse = Math.sin(world.elapsedMs * 0.09) * 0.018;
      this.backpack.rotation.z = pulse;
      this.backpack.rotation.y = this.backpack.userData.restRotationY + pulse * 0.7;
    } else {
      this.backpack.rotation.z = 0;
      this.backpack.rotation.y = this.backpack.userData.restRotationY;
    }

    state.minDistance = Math.min(state.minDistance, distance);

    if (now - state.lastTrajectorySample >= 250) {
      state.lastTrajectorySample = now;
      state.trajectory.push({
        x: Number(x.toFixed(2)),
        z: Number(z.toFixed(2)),
        timeMs: Math.round(world.elapsedMs)
      });
    }

    if (
      distance < 17 &&
      !state.safeDistanceReached &&
      world.elapsedMs - state.lastRingAtMs >= 1800
    ) {
      state.lastRingAtMs = world.elapsedMs;
      state.ringPulseUntilMs = world.elapsedMs + 1100;
      world.playPhoneRingtone();
    }

    if (distance < 1.6) {
      world.fail(
        "Ви наблизилися до підозрілого рюкзака на критично небезпечну відстань.",
        this.getMetrics(world)
      );
      return;
    }

    if (!state.detected && world.isObjectVisible(this.backpack, 14, 0.5)) {
      state.detected = true;
      state.detectedAtMs = world.elapsedMs;
      state.detectionPosition = { x, z };
    }

    if (!state.detected) return;

    const movedFromDetection = Math.hypot(
      x - state.detectionPosition.x,
      z - state.detectionPosition.z
    );
    state.movementAfterDetection = Math.max(
      state.movementAfterDetection,
      movedFromDetection
    );

    if (state.stoppedAtMs === null) {
      if (world.lastInputMagnitude < 0.04) {
        state.stableStopSeconds += delta;

        if (state.stableStopSeconds >= 0.65) {
          state.stoppedAtMs = world.elapsedMs;
          state.maxDistanceAfterStop = distance;
        }
      } else {
        state.stableStopSeconds = 0;
      }

      if (world.elapsedMs - state.detectedAtMs > 10000) {
        world.fail(
          "Після виявлення підозрілого предмета рух не було припинено вчасно.",
          this.getMetrics(world)
        );
        return;
      }

      if (state.movementAfterDetection > 1.6) {
        world.fail(
          "Після виявлення підозрілого рюкзака ви продовжили рух у його напрямку.",
          this.getMetrics(world)
        );
      }
      return;
    }

    state.maxDistanceAfterStop = Math.max(state.maxDistanceAfterStop, distance);

    if (distance < state.maxDistanceAfterStop - 0.55) {
      world.fail(
        "Після початку відходу не можна повертатися до підозрілого предмета.",
        this.getMetrics(world)
      );
      return;
    }

    if (!state.safeDistanceReached && distance >= 16) {
      state.safeDistanceReached = true;
      state.safeReachedAtMs = world.elapsedMs;
    }

    if (!state.safeDistanceReached) return;

    if (distance < 15.3) {
      world.fail(
        "Після досягнення безпечнішої дистанції ви почали повертатися до рюкзака.",
        this.getMetrics(world)
      );
      return;
    }

    if (world.lastInputMagnitude < 0.04) {
      state.safeStopSeconds += delta;
    } else {
      state.safeStopSeconds = 0;
    }

    if (state.safeStopSeconds >= 0.55 && !state.phoneActionShown) {
      state.phoneActionShown = true;
      world.setAction("Зателефонувати до екстреної служби", () => {
        state.callStartedAtMs = world.elapsedMs;
        world.clearAction();
        world.openEmergencyDialer({
          acceptedNumbers: ["101", "102", "112"],
          onComplete: (number) => {
            state.calledNumber = number;
            this.startCallSequence(world, 0);
          }
        });
      });
    }
  }
};
