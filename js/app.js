import { TrainingWorld } from "./game3d.js";

const screens = {
  start: document.querySelector("#start-screen"),
  scene: document.querySelector("#scene-screen"),
  result: document.querySelector("#result-screen")
};

const elements = {
  stage01Button: document.querySelector("#stage-01-button"),
  stage02Button: document.querySelector("#stage-02-button"),
  stage03Button: document.querySelector("#stage-03-button"),
  stage04Button: document.querySelector("#stage-04-button"),
  stage05Button: document.querySelector("#stage-05-button"),
  stage06Button: document.querySelector("#stage-06-button"),
  stage07Button: document.querySelector("#stage-07-button"),
  stage08Button: document.querySelector("#stage-08-button"),
  stage09Button: document.querySelector("#stage-09-button"),
  stage10Button: document.querySelector("#stage-10-button"),
  stage11Button: document.querySelector("#stage-11-button"),
  restartButton: document.querySelector("#restart-button"),
  retryButton: document.querySelector("#retry-button"),
  nextButton: document.querySelector("#next-button"),
  menuButton: document.querySelector("#menu-button"),
  exitButton: document.querySelector("#exit-button"),
  actionButton: document.querySelector("#action-button"),
  dialoguePanel: document.querySelector("#dialogue-panel"),
  dialogueTitle: document.querySelector("#dialogue-title"),
  dialoguePrompt: document.querySelector("#dialogue-prompt"),
  dialogueOptions: document.querySelector("#dialogue-options"),
  desktopHint: document.querySelector("#desktop-hint"),
  mobileHint: document.querySelector("#mobile-hint"),
  canvas: document.querySelector("#game-canvas"),
  joystick: document.querySelector("#joystick"),
  joystickKnob: document.querySelector("#joystick-knob"),
  lookZone: document.querySelector("#look-zone"),
  missionLabel: document.querySelector("#mission-label"),
  missionInstruction: document.querySelector("#mission-instruction"),
  failurePanel: document.querySelector("#failure-panel"),
  failureReason: document.querySelector("#failure-reason"),
  failureGuidance: document.querySelector("#failure-guidance"),
  resultLabel: document.querySelector("#result-label"),
  resultTitle: document.querySelector("#result-title"),
  resultMessage: document.querySelector("#result-message"),
  resultMetrics: document.querySelector("#result-metrics")
};

let world;
let currentStageId = "stage-01";

const resultContent = {
  "stage-01": {
    title: "Обрано безпечніший маршрут",
    message:
      "Ви не стали скорочувати шлях через небезпечну ділянку й успішно дісталися контрольної точки.",
    guidance:
      "Не заходьте глибше в небезпечну зону, не наближайтеся до боєприпасу та оберіть безпечніший маршрут.",
    metrics(metrics) {
      return [
        ["Час вибору маршруту", formatSeconds(metrics.decisionSeconds)],
        ["Мінімальна дистанція", formatDistance(metrics.minDistance)],
        ["Коригування рішення", metrics.correctedRoute ? "маршрут виправлено" : "не знадобилося"]
      ];
    }
  },
  "stage-02": {
    title: "Небезпеку розпізнано правильно",
    message:
      "Ви припинили рух, не наблизилися до міни та умовно повідомили про небезпеку за номером 101/112.",
    guidance:
      "Після виявлення міни потрібно зупинитися, не рухати ногами, не наближатися, не торкатися предмета та повідомити 101/112.",
    metrics(metrics) {
      return [
        ["Час до зупинки", formatSeconds(metrics.reactionSeconds)],
        ["Час до повідомлення", formatSeconds(metrics.callSeconds)],
        ["Мінімальна дистанція", formatDistance(metrics.minDistance)],
        ["Рух після виявлення", metrics.movementAfterDetection + " м"]
      ];
    }
  },
  "stage-03": {
    title: "Обрано безпечніший обхід",
    message:
      "Ви розпізнали офіційний знак мінної небезпеки, зупинилися та обійшли позначену територію.",
    guidance:
      "Офіційний знак не можна ігнорувати: зупиніться, не перетинайте позначену межу та оберіть безпечніший альтернативний маршрут.",
    metrics(metrics) {
      return [
        ["Виявлення знака", metrics.signDetected ? "зафіксовано" : "не зафіксовано"],
        ["Час до зупинки", formatSeconds(metrics.reactionSeconds)],
        ["Обраний маршрут", metrics.route],
        ["Перетин межі", metrics.crossedBoundary ? "так" : "ні"]
      ];
    }
  },
  "stage-04": {
    title: "Небезпечну ділянку залишено правильно",
    message:
      "Ви розпізнали непрямі ознаки мінної небезпеки, зупинилися, попередили інших і повернулися своїм шляхом.",
    guidance:
      "Неофіційні позначки та сукупність підозрілих ознак потрібно сприймати як можливу небезпеку: зупиніться, попередьте інших і повертайтеся своїм шляхом.",
    metrics(metrics) {
      return [
        ["Ознаки розпізнано", metrics.cluesDetected ? "так" : "ні"],
        ["Час до зупинки", formatSeconds(metrics.reactionSeconds)],
        ["Попередження інших", metrics.warnedOthers ? "виконано" : "не виконано"],
        ["Перетин межі", metrics.crossedBoundary ? "так" : "ні"],
        ["Мінімальна дистанція", formatDistance(metrics.minDistance)]
      ];
    }
  },
  "stage-05": {
    title: "Рух припинено правильно",
    message:
      "Ви розпізнали зворотну сторону можливого знака мінної небезпеки, залишилися на місці та умовно повідомили 101/112.",
    guidance:
      "Якщо видно зворотну сторону знака й існує ризик перебування на замінованій території, потрібно зупинитися, не рухати ногами, не шукати вихід навмання та повідомити 101/112.",
    metrics(metrics) {
      return [
        ["Ознаку розпізнано", metrics.signBackDetected ? "так" : "ні"],
        ["Час до зупинки", formatSeconds(metrics.reactionSeconds)],
        ["Час до повідомлення", formatSeconds(metrics.callSeconds)],
        ["Рух після виявлення", metrics.movementAfterDetection + " м"],
        ["Послідовність дій", metrics.correctSequence ? "правильна" : "порушена"]
      ];
    }
  },
  "stage-06": {
    title: "Підозрілий предмет залишено безпечно",
    message:
      "Ви не торкалися рюкзака, відійшли на умовно змодельовану безпечну дистанцію та правильно передали повідомлення екстреній службі.",
    guidance:
      "Не наближайтеся, не торкайтеся й не відкривайте підозрілий предмет. Відійдіть у протилежному напрямку, повідомте точне місце та опис небезпеки й не повертайтеся.",
    metrics(metrics) {
      return [
        ["Час до зупинки", formatSeconds(metrics.reactionSeconds)],
        ["Досягнення дистанції", metrics.safeDistanceReached ? "≥300 м, умовно" : "не досягнуто"],
        ["Час до дистанції", formatSeconds(metrics.safeDistanceSeconds)],
        ["Набраний номер", metrics.calledNumber || "не набрано"],
        ["Послідовність дзвінка", metrics.callSequenceCorrect ? "правильна" : "порушена"],
        ["Тривалість повідомлення", formatSeconds(metrics.callSeconds)]
      ];
    }
  },
  "stage-07": {
    title: "Безпечний алгоритм у автомобілі обрано",
    message:
      "Ви залишилися в автомобілі, не намагалися самостійно виїхати з поля та правильно повідомили 101.",
    guidance:
      "Якщо автомобіль опинився на потенційно замінованій території, залишайтеся всередині, не відкривайте двері, не виходьте та не намагайтеся самостійно продовжити рух. Повідомте 101 і виконуйте отримані вказівки.",
    metrics(metrics) {
      return [
        ["Час розпізнавання", formatSeconds(metrics.recognitionSeconds)],
        ["Час вибору дії", formatSeconds(metrics.decisionSeconds)],
        ["Залишився в автомобілі", metrics.stayedInVehicle ? "так" : "ні"],
        ["Спроба продовжити рух", metrics.attemptedDrive ? "так" : "ні"],
        ["Набраний номер", metrics.calledNumber || "не набрано"],
        ["Тривалість повідомлення", formatSeconds(metrics.callSeconds)]
      ];
    }
  },
  "stage-08": {
    title: "Доступнішого безпечного місця досягнуто",
    message:
      "Ви зупинилися після сигналу тривоги, оцінили оточення та перейшли з відкритого двору до під’їзду.",
    guidance:
      "Після однозначного сигналу повітряної загрози припиніть небезпечний рух, оцініть оточення та перейдіть до доступнішого безпечного місця. Позиція на землі використовується, коли такого місця поруч немає.",
    metrics(metrics) {
      return [
        ["Час до зупинки", formatSeconds(metrics.reactionSeconds)],
        ["Час вибору дії", formatSeconds(metrics.decisionSeconds)],
        ["Час до під’їзду", formatSeconds(metrics.shelterSeconds)],
        ["Під’їзду досягнуто", metrics.reachedEntrance ? "так" : "ні"],
        ["Рух до зупинки", formatDistance(metrics.movementBeforeStop)],
        ["Запасна позиція на землі", metrics.groundPositionChosen ? "обрана" : "не знадобилася"]
      ];
    }
  },
  "stage-09": {
    title: "Мобільного укриття досягнуто",
    message:
      "Ви залишили зону скляної зупинки, не рухалися назустріч загрозі та дісталися мобільного укриття.",
    guidance:
      "Почувши наближення БПЛА, відійдіть від скла, не рухайтеся назустріч звуку та прямуйте до доступного безпечнішого укриття. Не лягайте поруч зі скляними конструкціями.",
    metrics(metrics) {
      return [
        ["Час вибору дії", formatSeconds(metrics.decisionSeconds)],
        ["Вихід із зони скла", formatSeconds(metrics.glassExitSeconds)],
        ["Час до укриття", formatSeconds(metrics.shelterSeconds)],
        ["Укриття досягнуто", metrics.reachedShelter ? "так" : "ні"],
        ["Рух назустріч загрозі", metrics.movedTowardThreat ? "так" : "ні"],
        ["Залишення біля скла", metrics.stayedByGlass ? "так" : "ні"]
      ];
    }
  },
  "stage-10": {
    title: "Безпечнішої позиції біля бордюру досягнуто",
    message:
      "Ви вчасно припинили рух, зайняли положення лежачи та доповзли до нижчої захисної позиції.",
    guidance:
      "Почувши наближення стрілянини на відкритій ділянці, негайно припиніть рух, ляжте, а після оцінки напрямку загрози повзіть до доступного заглиблення або іншої безпечнішої позиції.",
    metrics(metrics) {
      return [
        ["Час до зупинки", formatSeconds(metrics.reactionSeconds)],
        ["Перехід у положення лежачи", formatSeconds(metrics.proneSeconds)],
        ["Час до бордюру", formatSeconds(metrics.curbSeconds)],
        ["Положення лежачи", metrics.prone ? "виконано" : "не виконано"],
        ["Рух у повний зріст", metrics.movedUpright ? "так" : "ні"],
        ["Рух до зупинки", formatDistance(metrics.movementBeforeStop)]
      ];
    }
  },
  "stage-11": {
    title: "Правило двох стін застосовано",
    message:
      "Ви відійшли від вікон, не здійснювали зйомку та перейшли до внутрішньої частини будівлі.",
    guidance:
      "Під час стрілянини або роботи ППО відійдіть від вікон і зовнішніх стін, перейдіть у внутрішню частину будівлі або на сходову клітину та не знімайте події назовні.",
    metrics(metrics) {
      return [
        ["Час вибору дії", formatSeconds(metrics.reactionSeconds)],
        ["Час до зони двох стін", formatSeconds(metrics.safeZoneSeconds)],
        ["Зони досягнуто", metrics.reachedTwoWalls ? "так" : "ні"],
        ["Наближення до вікна", metrics.approachedWindow ? "так" : "ні"],
        ["Фото або відеозйомка", metrics.filmed ? "так" : "ні"],
        ["Мінімальна відстань до вікна", formatDistance(metrics.minWindowDistance)]
      ];
    }
  }
};

function formatSeconds(value) {
  return value === null ? "не зафіксовано" : value + " с";
}

function formatDistance(value) {
  return value === null ? "не зафіксовано" : value + " м";
}

function showScreen(name) {
  Object.values(screens).forEach((screen) => {
    screen.classList.remove("screen--active");
  });
  screens[name].classList.add("screen--active");
}

function renderMetrics(items) {
  elements.resultMetrics.replaceChildren();

  for (const [label, value] of items) {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");

    term.textContent = label;
    description.textContent = value;
    wrapper.append(term, description);
    elements.resultMetrics.append(wrapper);
  }
}

function renderResult({ stage, metrics }) {
  const copy = resultContent[stage.id];

  elements.resultLabel.textContent = "Етап " + stage.number + " завершено";
  elements.resultTitle.textContent = copy.title;
  elements.resultMessage.textContent = copy.message;
  renderMetrics(copy.metrics(metrics));

  elements.nextButton.hidden = stage.id === "stage-11";
  showScreen("result");
}

function showFailure({ stage, reason }) {
  const copy = resultContent[stage.id];
  elements.failureReason.textContent = reason;
  elements.failureGuidance.textContent = copy.guidance;
  elements.failurePanel.hidden = false;
}

function updateAction({ visible, label }) {
  elements.actionButton.hidden = !visible;
  elements.actionButton.textContent = visible ? label + "  [E]" : "";
}

function updateDialogue({ visible, variant = "questions", title, prompt, options }) {
  elements.dialoguePanel.hidden = !visible;
  elements.dialoguePanel.classList.toggle("dialogue-panel--dialer", variant === "dialer");
  elements.dialogueOptions.classList.toggle("dialogue-options--dialer", variant === "dialer");
  elements.dialogueTitle.textContent = title;
  elements.dialoguePrompt.textContent = prompt;
  elements.dialogueOptions.replaceChildren();

  if (!visible) return;

  for (const option of options) {
    const button = document.createElement("button");
    button.className = "dialogue-option";
    if (option.kind) button.classList.add(`dialogue-option--${option.kind}`);
    button.type = "button";
    button.textContent = option.label;
    if (option.ariaLabel) button.setAttribute("aria-label", option.ariaLabel);
    button.addEventListener("click", () => world?.chooseDialogue(option.value));
    elements.dialogueOptions.append(button);
  }
}

function updateStageHeader(stage) {
  elements.missionLabel.textContent = "Етап " + stage.number + " · " + stage.shortTitle;
  elements.missionInstruction.textContent = stage.instruction;
  const isVehicleStage = stage.id === "stage-07";
  elements.desktopHint.innerHTML = isVehicleStage
    ? "<strong>миша</strong> — огляд із салону · <strong>E</strong> — дія"
    : "<strong>WASD</strong> — рух · <strong>миша</strong> — огляд · <strong>E</strong> — дія";
  elements.mobileHint.textContent = isVehicleStage
    ? "Праворуч — огляд · кнопка — дія"
    : "Ліворуч — рух · праворуч — огляд";
  elements.joystick.hidden = isVehicleStage;
}

function ensureWorld() {
  if (world) return;

  world = new TrainingWorld({
    canvas: elements.canvas,
    joystick: elements.joystick,
    joystickKnob: elements.joystickKnob,
    lookZone: elements.lookZone,
    onSuccess: renderResult,
    onFailure: showFailure,
    onActionChange: updateAction,
    onDialogueChange: updateDialogue,
    onStageChange: updateStageHeader
  });
}

function startTraining(stageId) {
  currentStageId = stageId;
  elements.failurePanel.hidden = true;
  elements.dialoguePanel.hidden = true;
  elements.actionButton.hidden = true;
  showScreen("scene");
  ensureWorld();
  requestAnimationFrame(() => world.start(stageId));
}

function returnToMenu() {
  world?.stop();
  world?.clearAction();
  elements.failurePanel.hidden = true;
  elements.dialoguePanel.hidden = true;
  showScreen("start");
}

elements.stage01Button.addEventListener("click", () => startTraining("stage-01"));
elements.stage02Button.addEventListener("click", () => startTraining("stage-02"));
elements.stage03Button.addEventListener("click", () => startTraining("stage-03"));
elements.stage04Button.addEventListener("click", () => startTraining("stage-04"));
elements.stage05Button.addEventListener("click", () => startTraining("stage-05"));
elements.stage06Button.addEventListener("click", () => startTraining("stage-06"));
elements.stage07Button.addEventListener("click", () => startTraining("stage-07"));
elements.stage08Button.addEventListener("click", () => startTraining("stage-08"));
elements.stage09Button.addEventListener("click", () => startTraining("stage-09"));
elements.stage10Button.addEventListener("click", () => startTraining("stage-10"));
elements.stage11Button.addEventListener("click", () => startTraining("stage-11"));
elements.restartButton.addEventListener("click", () => startTraining(currentStageId));
elements.retryButton.addEventListener("click", () => startTraining(currentStageId));
elements.nextButton.addEventListener("click", () => {
  const nextStage = {
    "stage-01": "stage-02",
    "stage-02": "stage-03",
    "stage-03": "stage-04",
    "stage-04": "stage-05",
    "stage-05": "stage-06",
    "stage-06": "stage-07",
    "stage-07": "stage-08",
    "stage-08": "stage-09",
    "stage-09": "stage-10",
    "stage-10": "stage-11"
  }[currentStageId];

  if (nextStage) startTraining(nextStage);
});
elements.menuButton.addEventListener("click", returnToMenu);
elements.exitButton.addEventListener("click", returnToMenu);
elements.actionButton.addEventListener("click", () => world?.performAction());
