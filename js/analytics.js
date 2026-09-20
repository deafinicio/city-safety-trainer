import { APP_VERSION, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";
import { getStoredParticipantId } from "./registration.js";

const SESSION_KEY = "city-safety-training-session-v1";
const ATTEMPT_COUNTS_KEY = "city-safety-attempt-counts-v1";
let activeAttempt = null;

function createId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function getSessionId() {
  try {
    let sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = createId();
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
  } catch {
    return createId();
  }
}

function nextAttemptNumber(stageId) {
  try {
    const counts = JSON.parse(sessionStorage.getItem(ATTEMPT_COUNTS_KEY) || "{}");
    counts[stageId] = Math.min(100, Number(counts[stageId] || 0) + 1);
    sessionStorage.setItem(ATTEMPT_COUNTS_KEY, JSON.stringify(counts));
    return counts[stageId];
  } catch {
    return 1;
  }
}

function stageNumber(stageId) {
  const value = Number(String(stageId).match(/\d+/)?.[0]);
  return Number.isInteger(value) && value >= 1 && value <= 11 ? value : null;
}

function safeMetrics(metrics) {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return {};

  try {
    return JSON.parse(JSON.stringify(metrics, (_key, value) => {
      if (typeof value === "number" && !Number.isFinite(value)) return null;
      if (typeof value === "string") return value.slice(0, 500);
      return value;
    }));
  } catch {
    return {};
  }
}

function submitAttempt(payload, keepalive = false) {
  return fetch(`${SUPABASE_URL}/rest/v1/stage_attempts`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload),
    keepalive
  }).then((response) => {
    if (!response.ok) throw new Error(`Analytics request failed with status ${response.status}`);
  }).catch((error) => {
    console.warn("Не вдалося зберегти статистику проходження", error);
  });
}

export function startAttempt(stageId) {
  if (activeAttempt) finishAttempt("abandoned", { failureReason: "Розпочато інший етап" });

  const participantId = getStoredParticipantId();
  const number = stageNumber(stageId);
  if (!participantId || !number) return;

  activeAttempt = {
    id: createId(),
    participantId,
    sessionId: getSessionId(),
    stageId: number,
    attemptNumber: nextAttemptNumber(stageId),
    startedAt: new Date(),
    startedPerformance: performance.now()
  };
}

export function finishAttempt(outcome, { metrics = {}, failureReason = null, keepalive = false } = {}) {
  if (!activeAttempt || !["success", "failure", "abandoned"].includes(outcome)) return Promise.resolve();

  const attempt = activeAttempt;
  activeAttempt = null;
  const finishedAt = new Date();
  const durationMs = Math.max(0, Math.min(86400000, Math.round(performance.now() - attempt.startedPerformance)));

  return submitAttempt({
    id: attempt.id,
    participant_id: attempt.participantId,
    session_id: attempt.sessionId,
    stage_id: attempt.stageId,
    attempt_number: attempt.attemptNumber,
    outcome,
    failure_reason: failureReason ? String(failureReason).slice(0, 1000) : null,
    started_at: attempt.startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: durationMs,
    metrics: safeMetrics(metrics),
    app_version: APP_VERSION
  }, keepalive);
}

export function abandonAttempt(reason = "Користувач вийшов з етапу") {
  return finishAttempt("abandoned", { failureReason: reason });
}

window.addEventListener("pagehide", () => {
  finishAttempt("abandoned", {
    failureReason: "Сторінку закрито під час проходження",
    keepalive: true
  });
});
