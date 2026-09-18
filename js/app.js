import { TrainingWorld } from "./game3d.js";

const screens = {
  start: document.querySelector("#start-screen"),
  scene: document.querySelector("#scene-screen"),
  result: document.querySelector("#result-screen")
};

const elements = {
  startButton: document.querySelector("#start-button"),
  restartButton: document.querySelector("#restart-button"),
  exitButton: document.querySelector("#exit-button"),
  canvas: document.querySelector("#game-canvas"),
  joystick: document.querySelector("#joystick"),
  joystickKnob: document.querySelector("#joystick-knob"),
  lookZone: document.querySelector("#look-zone")
};

let world;

function showScreen(name) {
  Object.values(screens).forEach((screen) => {
    screen.classList.remove("screen--active");
  });
  screens[name].classList.add("screen--active");
}

function ensureWorld() {
  if (world) return;

  world = new TrainingWorld({
    canvas: elements.canvas,
    joystick: elements.joystick,
    joystickKnob: elements.joystickKnob,
    lookZone: elements.lookZone,
    onComplete: () => {
      window.setTimeout(() => showScreen("result"), 350);
    }
  });
}

function startTraining() {
  showScreen("scene");
  ensureWorld();
  requestAnimationFrame(() => world.start());
}

function exitTraining() {
  world?.stop();
  showScreen("start");
}

elements.startButton.addEventListener("click", startTraining);
elements.restartButton.addEventListener("click", startTraining);
elements.exitButton.addEventListener("click", exitTraining);
