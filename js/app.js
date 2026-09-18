const screens = {
  start: document.querySelector("#start-screen"),
  scene: document.querySelector("#scene-screen"),
  result: document.querySelector("#result-screen")
};

const elements = {
  startButton: document.querySelector("#start-button"),
  restartButton: document.querySelector("#restart-button"),
  sceneCounter: document.querySelector("#scene-counter"),
  score: document.querySelector("#score"),
  sceneVisual: document.querySelector("#scene-visual"),
  sceneLocation: document.querySelector("#scene-location"),
  sceneTitle: document.querySelector("#scene-title"),
  sceneDescription: document.querySelector("#scene-description"),
  sceneActions: document.querySelector("#scene-actions"),
  feedback: document.querySelector("#feedback"),
  finalScore: document.querySelector("#final-score"),
  resultMessage: document.querySelector("#result-message")
};

const state = {
  scenes: [],
  currentSceneIndex: 0,
  score: 0,
  mistakes: 0,
  sceneStartedAt: 0
};

function showScreen(name) {
  Object.values(screens).forEach((screen) => {
    screen.classList.remove("screen--active");
  });

  screens[name].classList.add("screen--active");
}

async function loadScenarios() {
  const response = await fetch("data/scenarios.json");

  if (!response.ok) {
    throw new Error("Не вдалося завантажити сценарії.");
  }

  const data = await response.json();
  state.scenes = data.scenes;
}

function resetGame() {
  state.currentSceneIndex = 0;
  state.score = 0;
  state.mistakes = 0;
  elements.score.textContent = "0";
  elements.feedback.hidden = true;
  showScreen("scene");
  renderScene();
}

function renderScene() {
  const scene = state.scenes[state.currentSceneIndex];

  elements.sceneCounter.textContent =
    `Сцена ${state.currentSceneIndex + 1} з ${state.scenes.length}`;
  elements.sceneLocation.textContent = scene.location;
  elements.sceneTitle.textContent = scene.title;
  elements.sceneDescription.textContent = scene.description;
  elements.sceneVisual.setAttribute("aria-label", scene.visualLabel);
  elements.sceneActions.replaceChildren();
  elements.feedback.hidden = true;
  elements.feedback.className = "feedback";

  scene.actions.forEach((action) => {
    const button = document.createElement("button");
    button.className = "action-button";
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", () => evaluateAction(action));
    elements.sceneActions.append(button);
  });

  state.sceneStartedAt = performance.now();
}

function evaluateAction(action) {
  const reactionTime = Math.round(performance.now() - state.sceneStartedAt);

  elements.sceneActions.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });

  elements.feedback.hidden = false;

  if (action.correct) {
    state.score += action.points ?? 0;
    elements.score.textContent = String(state.score);
    elements.feedback.classList.add("feedback--success");
    elements.feedback.innerHTML = `
      <strong>Безпечне рішення</strong>
      <p>${action.feedback}</p>
      <p>Час рішення: ${(reactionTime / 1000).toFixed(1)} с</p>
      <button class="button button--primary" id="continue-button" type="button">
        Продовжити
      </button>
    `;

    document.querySelector("#continue-button").addEventListener("click", nextScene);
    return;
  }

  state.mistakes += 1;
  elements.feedback.classList.add("feedback--error");
  elements.feedback.innerHTML = `
    <strong>Небезпечний алгоритм дій</strong>
    <p>${action.feedback}</p>
    <button class="button button--primary" id="retry-button" type="button">
      Спробувати ще раз
    </button>
  `;

  document.querySelector("#retry-button").addEventListener("click", renderScene);
}

function nextScene() {
  state.currentSceneIndex += 1;

  if (state.currentSceneIndex < state.scenes.length) {
    renderScene();
    return;
  }

  elements.finalScore.textContent = String(state.score);
  elements.resultMessage.textContent =
    state.mistakes === 0
      ? "Сцену пройдено без помилок."
      : `Сцену завершено. Кількість помилкових рішень: ${state.mistakes}.`;

  showScreen("result");
}

async function startApplication() {
  try {
    await loadScenarios();
    elements.startButton.disabled = false;
  } catch (error) {
    elements.startButton.disabled = true;
    elements.startButton.textContent = "Помилка завантаження";
    console.error(error);
  }
}

elements.startButton.addEventListener("click", resetGame);
elements.restartButton.addEventListener("click", resetGame);
elements.startButton.disabled = true;

startApplication();
