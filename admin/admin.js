import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../js/config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const STAGES = [
  "Зруйнований сектор", "Дистанційне мінування", "Знак «МІНИ»",
  "Неофіційне попередження", "Зворотна сторона знака", "Покинутий рюкзак",
  "Автомобіль у мінному полі", "Повітряна загроза", "Зупинка та БПЛА",
  "Стрілянина на перехресті", "Правило двох стін"
];
const GENDERS = { female: "Жіноча", male: "Чоловіча", other: "Інша", prefer_not_to_say: "Не вказано" };
const OUTCOMES = { success: "Успішно", failure: "Помилка", abandoned: "Не завершено" };
const COLORS = { female: "#6fd594", male: "#77a9ff", other: "#efa95e", prefer_not_to_say: "#708078" };

const elements = Object.fromEntries([...document.querySelectorAll("[id]")].map((item) => [item.id, item]));
const state = { participants: [], attempts: [], filteredAttempts: [] };

function setAuthStatus(message, type = "") {
  elements["auth-status"].textContent = message;
  elements["auth-status"].className = `status${type ? ` status--${type}` : ""}`;
}

function setDashboardError(message = "") {
  elements["dashboard-error"].textContent = message;
  elements["dashboard-error"].hidden = !message;
}

async function verifyAdmin() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return false;

  const { data, error } = await supabase.from("admin_users").select("email, display_name").eq("email", user.email.toLowerCase()).maybeSingle();
  return !error && Boolean(data);
}

async function signIn(event) {
  event.preventDefault();
  setAuthStatus("Перевіряємо дані…");
  const email = elements["auth-email"].value.trim().toLowerCase();
  const password = elements["auth-password"].value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return setAuthStatus("Не вдалося увійти. Перевірте email, пароль і підтвердження пошти.", "error");
  if (!await verifyAdmin()) {
    await supabase.auth.signOut();
    return setAuthStatus("Цей обліковий запис не має адміністративного доступу.", "error");
  }
  await showDashboard();
}

async function signUp() {
  const email = elements["auth-email"].value.trim().toLowerCase();
  const password = elements["auth-password"].value;
  if (!email || password.length < 8) return setAuthStatus("Вкажіть коректний email і пароль щонайменше з 8 символів.", "error");

  setAuthStatus("Створюємо обліковий запис…");
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return setAuthStatus(error.message, "error");
  setAuthStatus(data.session ? "Обліковий запис створено. Перевіряємо доступ…" : "Перевірте пошту та підтвердьте email, після чого увійдіть.", "success");
  if (data.session && await verifyAdmin()) await showDashboard();
}

async function fetchAll(table, columns, orderColumn) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (orderColumn) query = query.order(orderColumn, { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

async function loadData() {
  setDashboardError();
  elements["sync-status"].textContent = "Оновлюємо…";
  elements["refresh-button"].disabled = true;
  try {
    const [participants, attempts] = await Promise.all([
      fetchAll("participants", "id,surname,first_name,age,gender,created_at", "created_at"),
      fetchAll("stage_attempts", "id,participant_id,session_id,stage_id,attempt_number,outcome,failure_reason,started_at,finished_at,duration_ms,metrics,app_version", "finished_at")
    ]);
    state.participants = participants;
    state.attempts = attempts;
    applyFilters();
    elements["sync-status"].textContent = `Оновлено ${new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
  } catch (error) {
    console.error(error);
    setDashboardError("Не вдалося завантажити дані. Перевірте доступ адміністратора та з’єднання.");
    elements["sync-status"].textContent = "Помилка оновлення";
  } finally {
    elements["refresh-button"].disabled = false;
  }
}

function applyFilters() {
  const period = elements["period-filter"].value;
  const stage = elements["stage-filter"].value;
  const outcome = elements["outcome-filter"].value;
  const cutoff = period === "all" ? null : Date.now() - Number(period) * 86400000;

  state.filteredAttempts = state.attempts.filter((attempt) => {
    if (cutoff && new Date(attempt.finished_at).getTime() < cutoff) return false;
    if (stage !== "all" && attempt.stage_id !== Number(stage)) return false;
    return outcome === "all" || attempt.outcome === outcome;
  });
  renderAll();
}

function percent(part, total) {
  return total ? Math.round(part / total * 100) : 0;
}

function duration(ms) {
  if (!Number.isFinite(ms)) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} с`;
  return `${Math.floor(seconds / 60)} хв ${seconds % 60} с`;
}

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function renderAll() {
  renderMetrics();
  renderActivity();
  renderStageBars();
  renderDemographics();
  renderStagesTable();
  renderParticipantsTable();
  renderAttemptsTable();
}

function renderMetrics() {
  const attempts = state.filteredAttempts;
  const assessed = attempts.filter((item) => item.outcome !== "abandoned");
  const successes = attempts.filter((item) => item.outcome === "success");
  const activePlayers = new Set(attempts.map((item) => item.participant_id)).size;
  const sessions = new Set(attempts.map((item) => item.session_id)).size;
  const average = assessed.length ? assessed.reduce((sum, item) => sum + item.duration_ms, 0) / assessed.length : 0;
  const cards = [
    ["Зареєстровано", state.participants.length, "усі учасники"],
    ["Активні учасники", activePlayers, "за обраний період"],
    ["Навчальні сесії", sessions, "унікальні запуски"],
    ["Успішні етапи", successes.length, "завершені правильно"],
    ["Успішність", `${percent(successes.length, assessed.length)}%`, "без незавершених"],
    ["Середній час", duration(average), "на завершену спробу"]
  ];
  elements["metric-grid"].replaceChildren(...cards.map(([label, value, note]) => {
    const card = document.createElement("article");
    card.className = "metric-card";
    const labelNode = document.createElement("span"); labelNode.className = "metric-card__label"; labelNode.textContent = label;
    const valueNode = document.createElement("strong"); valueNode.className = "metric-card__value"; valueNode.textContent = value;
    const noteNode = document.createElement("span"); noteNode.className = "metric-card__note"; noteNode.textContent = note;
    card.append(labelNode, valueNode, noteNode);
    return card;
  }));
}

function renderActivity() {
  const byDay = new Map();
  for (const attempt of state.filteredAttempts) {
    const key = attempt.finished_at.slice(0, 10);
    byDay.set(key, (byDay.get(key) || 0) + 1);
  }
  const entries = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-31);
  const max = Math.max(1, ...entries.map(([, count]) => count));
  elements["activity-chart"].replaceChildren(...entries.map(([day, count]) => {
    const column = document.createElement("div"); column.className = "activity-column";
    const bar = document.createElement("div"); bar.className = "activity-column__bar";
    bar.style.height = `${Math.max(2, count / max * 100)}%`;
    bar.dataset.tip = `${new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short" }).format(new Date(`${day}T12:00:00`))}: ${count}`;
    column.append(bar);
    return column;
  }));
  if (!entries.length) elements["activity-chart"].textContent = "За обраний період спроб немає.";
}

function stageStats(stageId) {
  const rows = state.filteredAttempts.filter((item) => item.stage_id === stageId);
  const success = rows.filter((item) => item.outcome === "success").length;
  const failure = rows.filter((item) => item.outcome === "failure").length;
  const abandoned = rows.filter((item) => item.outcome === "abandoned").length;
  const assessed = success + failure;
  const average = assessed ? rows.filter((item) => item.outcome !== "abandoned").reduce((sum, item) => sum + item.duration_ms, 0) / assessed : 0;
  return { rows, success, failure, abandoned, rate: percent(success, assessed), average };
}

function createBarRow(label, value, suffix = "%", color = "") {
  const row = document.createElement("div"); row.className = "bar-row";
  const name = document.createElement("span"); name.textContent = label;
  const track = document.createElement("div"); track.className = "bar-row__track";
  const fill = document.createElement("div"); fill.className = "bar-row__fill"; fill.style.width = `${Math.max(0, Math.min(100, value))}%`; if (color) fill.style.background = color;
  const number = document.createElement("span"); number.className = "bar-row__value"; number.textContent = `${value}${suffix}`;
  track.append(fill); row.append(name, track, number); return row;
}

function renderStageBars() {
  elements["overview-stage-bars"].replaceChildren(...STAGES.map((_name, index) => createBarRow(`Етап ${index + 1}`, stageStats(index + 1).rate)));
}

function renderDemographics() {
  const genderCounts = Object.fromEntries(Object.keys(GENDERS).map((key) => [key, 0]));
  state.participants.forEach((item) => { if (item.gender in genderCounts) genderCounts[item.gender] += 1; });
  const total = state.participants.length;
  let cursor = 0;
  const stops = [];
  for (const key of Object.keys(GENDERS)) {
    const start = cursor; cursor += percent(genderCounts[key], total);
    stops.push(`${COLORS[key]} ${start}% ${cursor}%`);
  }
  elements["gender-donut"].style.background = total ? `conic-gradient(${stops.join(",")})` : "#26352d";
  elements["gender-total"].textContent = total;
  elements["gender-legend"].replaceChildren(...Object.keys(GENDERS).map((key) => {
    const row = document.createElement("div"); row.className = "legend-row";
    const dot = document.createElement("i"); dot.style.background = COLORS[key];
    const label = document.createElement("span"); label.textContent = GENDERS[key];
    const value = document.createElement("strong"); value.textContent = genderCounts[key];
    row.append(dot, label, value); return row;
  }));

  const groups = [["1–5",1,5],["6–10",6,10],["11–15",11,15],["16–17",16,17],["18–35",18,35],["36–59",36,59],["60+",60,120]];
  const values = groups.map(([, min, max]) => state.participants.filter((item) => item.age >= min && item.age <= max).length);
  const max = Math.max(1, ...values);
  elements["age-bars"].replaceChildren(...groups.map(([label], index) => createBarRow(label, Math.round(values[index] / max * 100), "", "#77a9ff")).map((row, index) => {
    row.lastElementChild.textContent = values[index]; return row;
  }));
}

function cell(text) { const node = document.createElement("td"); node.textContent = text ?? "—"; return node; }
function emptyRow(columns, message) { const row = document.createElement("tr"); row.className = "empty-row"; const item = cell(message); item.colSpan = columns; row.append(item); return row; }

function renderStagesTable() {
  const rows = STAGES.map((name, index) => {
    const stat = stageStats(index + 1);
    const row = document.createElement("tr");
    row.append(cell(`${index + 1}. ${name}`), cell(stat.rows.length), cell(stat.success), cell(stat.failure), cell(stat.abandoned), cell(`${stat.rate}%`), cell(duration(stat.average)));
    return row;
  });
  elements["stages-table"].replaceChildren(...rows);
}

function participantSummary(participant) {
  const rows = state.filteredAttempts.filter((item) => item.participant_id === participant.id);
  const success = rows.filter((item) => item.outcome === "success");
  const assessed = rows.filter((item) => item.outcome !== "abandoned");
  return { rows, completedStages: new Set(success.map((item) => item.stage_id)).size, rate: percent(success.length, assessed.length), last: rows[0]?.finished_at };
}

function renderParticipantsTable() {
  const query = elements["participant-search"].value.trim().toLocaleLowerCase("uk");
  const participants = state.participants.filter((item) => `${item.surname} ${item.first_name}`.toLocaleLowerCase("uk").includes(query));
  const rows = participants.map((participant) => {
    const summary = participantSummary(participant);
    const row = document.createElement("tr");
    const name = cell(`${participant.surname} ${participant.first_name}`); const id = document.createElement("small"); id.textContent = participant.id.slice(0, 8); name.append(id);
    row.append(name, cell(participant.age), cell(GENDERS[participant.gender]), cell(dateTime(participant.created_at)), cell(summary.rows.length), cell(`${summary.completedStages} / 11`), cell(`${summary.rate}%`), cell(dateTime(summary.last)));
    return row;
  });
  elements["participants-table"].replaceChildren(...(rows.length ? rows : [emptyRow(8, "Учасників не знайдено.")]));
}

function renderAttemptsTable() {
  const participants = new Map(state.participants.map((item) => [item.id, item]));
  const rows = state.filteredAttempts.slice(0, 250).map((attempt) => {
    const participant = participants.get(attempt.participant_id);
    const row = document.createElement("tr");
    const outcome = document.createElement("td"); const badge = document.createElement("span"); badge.className = `badge badge--${attempt.outcome}`; badge.textContent = OUTCOMES[attempt.outcome]; outcome.append(badge);
    row.append(cell(dateTime(attempt.finished_at)), cell(participant ? `${participant.surname} ${participant.first_name}` : attempt.participant_id.slice(0, 8)), cell(`Етап ${attempt.stage_id}`), cell(attempt.attempt_number), outcome, cell(duration(attempt.duration_ms)), cell(attempt.failure_reason));
    return row;
  });
  elements["attempts-table"].replaceChildren(...(rows.length ? rows : [emptyRow(7, "За обраними фільтрами спроб немає.")]));
}

function csvValue(value) {
  let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows].map((row) => row.map(csvValue).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

function exportParticipants() {
  downloadCsv(`participants-${new Date().toISOString().slice(0,10)}.csv`, ["id","Прізвище","Ім'я","Вік","Стать","Дата реєстрації"], state.participants.map((item) => [item.id,item.surname,item.first_name,item.age,GENDERS[item.gender],item.created_at]));
}

function exportAnalytics() {
  downloadCsv(`stage-results-${new Date().toISOString().slice(0,10)}.csv`, ["id","participant_id","session_id","Етап","Номер спроби","Результат","Початок","Завершення","Тривалість, мс","Причина","Метрики","Версія"], state.filteredAttempts.map((item) => [item.id,item.participant_id,item.session_id,item.stage_id,item.attempt_number,OUTCOMES[item.outcome],item.started_at,item.finished_at,item.duration_ms,item.failure_reason,item.metrics,item.app_version]));
}

function switchView(name) {
  const titles = { overview: "Огляд навчання", stages: "Аналітика етапів", participants: "Учасники", attempts: "Журнал спроб" };
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("view--active", view.id === `view-${name}`));
  document.querySelectorAll(".nav__item").forEach((button) => button.classList.toggle("nav__item--active", button.dataset.view === name));
  elements["view-title"].textContent = titles[name];
}

async function showDashboard() {
  elements["auth-view"].hidden = true;
  elements["dashboard-view"].hidden = false;
  await loadData();
}

async function initialize() {
  STAGES.forEach((name, index) => {
    const option = document.createElement("option"); option.value = String(index + 1); option.textContent = `${index + 1}. ${name}`; elements["stage-filter"].append(option);
  });
  const { data: { session } } = await supabase.auth.getSession();
  if (session && await verifyAdmin()) await showDashboard();
}

elements["auth-form"].addEventListener("submit", signIn);
elements["signup-button"].addEventListener("click", signUp);
elements["signout-button"].addEventListener("click", async () => { await supabase.auth.signOut(); location.reload(); });
elements["refresh-button"].addEventListener("click", loadData);
elements["period-filter"].addEventListener("change", applyFilters);
elements["stage-filter"].addEventListener("change", applyFilters);
elements["outcome-filter"].addEventListener("change", applyFilters);
elements["participant-search"].addEventListener("input", renderParticipantsTable);
elements["export-participants"].addEventListener("click", exportParticipants);
elements["export-analytics"].addEventListener("click", exportAnalytics);
document.querySelectorAll(".nav__item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));

initialize();
