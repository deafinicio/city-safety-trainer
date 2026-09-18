import { TrainingWorld } from "./game3d.js";

const screens = {
  start: document.querySelector("#start-screen"),
  scene: document.querySelector("#scene-screen"),
  result: document.querySelector("#result-screen")
};

const elements = {
  startButton: document.querySelector("#start-button"),
  restartButton: document.querySelector("#restart-button"),
  retryButton: document.querySelector("#retry-button"),
  exitButton: document.querySelector("#exit-button"),
  canvas: document.querySelector("#game-canvas"),
  joystick: document.querySelector("#joystick"),
  joystickKnob: document.querySelector("#joystick-knob"),
  lookZone: document.querySelector("#look-zone"),
  failurePanel: document.querySelector("#failure-panel"),
  failureReason: document.querySelector("#failure-reason"),
  resultMessage: document.querySelector("#result-message"),
  metricTime: document.querySelector("#metric-time"),
  metricDistance: document.querySelector("#metric-distance"),
  metricCorrection: document.querySelector("#metric-correction")
};

let world;

function showScreen(name) {
  Object.values(screens).forEach((screen) => {
    screen.classList.remove("screen--active");
  });
  screens[name].classList.add("screen--active");
}

function renderResult(metrics) {
  elements.resultMessage.textContent =
    "Ви не стали скорочувати шлях через небезпечну ділянку й успішно дісталися контрольної точки.";

  elements.metricTime.textContent =
    metrics.decisionSeconds === null ? "не зафіксовано" : metrics.decisionSeconds + " с";

  elements.metricDistance.textContent =
    metrics.minRocketDistance === null ? "не зафіксовано" : metrics.minRocketDistance + " м";

  elements.metricCorrection.textContent =
    metrics.correctedRoute ? "маршрут виправлено" : "не знадобилося";

  showScreen("result");
}

function showFailure({ reason }) {
  elements.failureReason.textContent = reason;
  elements.failurePanel.hidden = false;
}

function ensureWorld() {
  if (world) return;

  world = new TrainingWorld({
    canvas: elements.canvas,
    joystick: elements.joystick,
    joystickKnob: elements.joystickKnob,
    lookZone: elements.lookZone,
    onSuccess: ({ metrics }) => renderResult(metrics),
    onFailure: showFailure
  });
}

function startTraining() {
  elements.failurePanel.hidden = true;
  showScreen("scene");
  ensureWorld();
  requestAnimationFrame(() => world.start());
}

function exitTraining() {
  world?.stop();
  elements.failurePanel.hidden = true;
  showScreen("start");
}

elements.startButton.addEventListener("click", startTraining);
elements.restartButton.addEventListener("click", startTraining);
elements.retryButton.addEventListener("click", startTraining);
elements.exitButton.addEventListener("click", exitTraining);
