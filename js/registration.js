import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";

const STORAGE_KEY = "city-safety-registration-v1";
const NAME_PATTERN = /^[\p{L}\p{M}](?:[\p{L}\p{M}'’ʼ -]{0,78}[\p{L}\p{M}])?$/u;
const ALLOWED_GENDERS = new Set(["female", "male", "other", "prefer_not_to_say"]);

function normalizeName(value) {
  return value.trim().replace(/\s+/g, " ");
}

function createParticipantId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function validateRegistration(values) {
  const data = {
    surname: normalizeName(values.surname || ""),
    firstName: normalizeName(values.firstName || ""),
    age: (values.age || "").trim(),
    gender: values.gender || "",
    consent: values.consent === true
  };
  const errors = {};

  if (data.surname.length < 2 || data.surname.length > 80 || !NAME_PATTERN.test(data.surname)) {
    errors.surname = "Введіть коректне прізвище літерами (2–80 символів).";
  }
  if (data.firstName.length < 2 || data.firstName.length > 80 || !NAME_PATTERN.test(data.firstName)) {
    errors.firstName = "Введіть коректне ім’я літерами (2–80 символів).";
  }
  if (!/^\d{1,3}$/.test(data.age) || Number(data.age) < 1 || Number(data.age) > 120) {
    errors.age = "Вкажіть вік цілим числом від 1 до 120.";
  }
  if (!ALLOWED_GENDERS.has(data.gender)) {
    errors.gender = "Оберіть один із варіантів.";
  }
  if (!data.consent) {
    errors.consent = "Потрібна згода на збереження даних.";
  }

  return {
    data: { ...data, age: Number(data.age) },
    errors,
    valid: Object.keys(errors).length === 0
  };
}

export function hasStoredRegistration() {
  try {
    const registration = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Boolean(registration?.participantId && registration?.analyticsConsent === true);
  } catch {
    return false;
  }
}

export function getStoredParticipantId() {
  try {
    const registration = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return typeof registration?.participantId === "string" ? registration.participantId : null;
  } catch {
    return null;
  }
}

export function clearStoredRegistration() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The registration screen still works when local storage is unavailable.
  }
}

export async function submitRegistration(data) {
  const participantId = createParticipantId();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/participants`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        id: participantId,
        surname: data.surname,
        first_name: data.firstName,
        age: data.age,
        gender: data.gender
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Registration request failed with status ${response.status}`);
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ participantId, analyticsConsent: true }));
    } catch {
      // A successful remote registration should not be blocked by local storage settings.
    }

    return participantId;
  } finally {
    clearTimeout(timeout);
  }
}
