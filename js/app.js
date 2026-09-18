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
  restartButton: document.querySelector("#restart-button"),
  retryButton: document.querySelector("#retry-button"),
  nextButton: document.querySelector("#next-button"),
  menuButton: document.querySelector("#menu-button"),
  exitButton: document.querySelector("#exit-button"),
  actionButton: document.querySelector("#action-button"),
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

  elements.nextButton.hidden = stage.id === "stage-03";
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

function updateStageHeader(stage) {
  elements.missionLabel.textContent = "Етап " + stage.number + " · " + stage.shortTitle;
  elements.missionInstruction.textContent = stage.instruction;
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
    onStageChange: updateStageHeader
  });
}

function startTraining(stageId) {
  currentStageId = stageId;
  elements.failurePanel.hidden = true;
  elements.actionButton.hidden = true;
  showScreen("scene");
  ensureWorld();
  requestAnimationFrame(() => world.start(stageId));
}

function returnToMenu() {
  world?.stop();
  world?.clearAction();
  elements.failurePanel.hidden = true;
  showScreen("start");
}

elements.stage01Button.addEventListener("click", () => startTraining("stage-01"));
elements.stage02Button.addEventListener("click", () => startTraining("stage-02"));
elements.stage03Button.addEventListener("click", () => startTraining("stage-03"));
elements.restartButton.addEventListener("click", () => startTraining(currentStageId));
elements.retryButton.addEventListener("click", () => startTraining(currentStageId));
elements.nextButton.addEventListener("click", () => {
  startTraining(currentStageId === "stage-01" ? "stage-02" : "stage-03");
});
elements.menuButton.addEventListener("click", returnToMenu);
elements.exitButton.addEventListener("click", returnToMenu);
elements.actionButton.addEventListener("click", () => world?.performAction());
