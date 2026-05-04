const STORAGE_KEY = "duda_agenda_v2";

function getItem(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function setItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Ignore storage errors to keep the UI usable.
  }
}

function removeItem(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    // Ignore storage errors to keep the UI usable.
  }
}
const SYNC_ENDPOINT = "/api/sync";
const AUTH_SESSION_ENDPOINT = "/api/session";
const AUTH_LOGIN_ENDPOINT = "/api/login";
const AUTH_LOGOUT_ENDPOINT = "/api/logout";
const AUTH_CHANGE_PASSWORD_ENDPOINT = "/api/change-password";
const AUTH_REQUEST_RESET_ENDPOINT = "/api/request-password-reset";
const AUTH_RESET_PASSWORD_ENDPOINT = "/api/reset-password";
const MAX_DATE = 8640000000000000;
const DEFAULT_COLOR = "#1d6fc4";
const APP_TIME_ZONE = "America/Sao_Paulo";
const DEFAULT_THEME = "ocean";
const AVAILABLE_THEMES = new Set(["ocean", "pandora"]);
const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_PROFILE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const PARALLAX_INPUT_INTERVAL = 48;
const PARALLAX_DRIFT_INTERVAL = 96;
const PARALLAX_STYLE_EPSILON = 0.04;
const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const PRIORITY_COLORS = { alta: "#ff6b8a", media: "#ffca6b", baixa: "#4adbb8" };
const PRIORITY_LABELS = { alta: "Alta", media: "Média", baixa: "Baixa" };

function iconMarkup(name, className = "") {
  const classes = ["app-icon", className].filter(Boolean).join(" ");
  return `<svg class="${classes}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function createSvgIcon(name, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", ["app-icon", className].filter(Boolean).join(" "));
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

function setTextWithIcon(elementId, text, iconName, iconClassName = "") {
  const element = document.getElementById(elementId);
  element.replaceChildren(document.createTextNode(text), createSvgIcon(iconName, iconClassName));
}

let state = createDefaultState();
let selectedColor = DEFAULT_COLOR;
let reminderFilter = "all";
let toastTimeout;
let deferredInstallPrompt = null;
let syncTimer = 0;
let syncInFlight = false;
let isAuthenticated = false;
let passwordResetToken = "";
const lastAlarmRing = {};
const lastFlipDigits = {};
const parallaxState = {
  currentX: 0,
  currentY: 0,
  targetX: 0,
  targetY: 0,
  frame: 0,
  driftFrame: 0,
  lastInputAt: 0,
  lastDriftAt: 0,
  lastBackX: null,
  lastBackY: null,
  lastMidX: null,
  lastMidY: null,
  lastFrontX: null,
  lastFrontY: null
};
const pandoraMusicState = {
  audio: null,
  panel: null,
  button: null,
  label: null,
  volumeRange: null,
  volumeValue: null,
  unlockBound: false,
  unlockHandler: null
};

function createDefaultState() {
  return {
    timeRows: [
      "07:00–08:00",
      "08:00–09:00",
      "09:00–10:00",
      "10:00–11:00",
      "11:00–12:00",
      "13:00–14:00",
      "14:00–15:00",
      "15:00–16:00",
      "16:00–17:00",
      "18:00–19:00",
      "19:00–20:00",
      "20:00–21:00"
    ],
    schedule: {},
    reminders: [],
    alarms: [],
    profile: {
      photo: ""
    },
    preferences: {
      theme: DEFAULT_THEME,
      animations: true,
      alarmSound: true,
      pandoraMusicPaused: false,
      pandoraMusicVolume: 0.42
    }
  };
}

function normalizeTheme(theme) {
  if (theme === "light") {
    return "pandora";
  }

  return AVAILABLE_THEMES.has(theme) ? theme : DEFAULT_THEME;
}

function normalizePandoraVolume(value, fallback = 0.42) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
}

function normalizeState(saved) {
  const defaults = createDefaultState();
  const safe = saved && typeof saved === "object" ? saved : {};

  return {
    timeRows: Array.isArray(safe.timeRows) && safe.timeRows.length ? safe.timeRows : defaults.timeRows,
    schedule: safe.schedule && typeof safe.schedule === "object" && !Array.isArray(safe.schedule) ? safe.schedule : defaults.schedule,
    reminders: Array.isArray(safe.reminders) ? safe.reminders : defaults.reminders,
    alarms: Array.isArray(safe.alarms) ? safe.alarms : defaults.alarms,
    profile: {
      photo: typeof safe.profile?.photo === "string" ? safe.profile.photo : defaults.profile.photo
    },
    preferences: {
      theme: normalizeTheme(typeof safe.preferences?.theme === "string" ? safe.preferences.theme : defaults.preferences.theme),
      animations: typeof safe.preferences?.animations === "boolean" ? safe.preferences.animations : defaults.preferences.animations,
      alarmSound: typeof safe.preferences?.alarmSound === "boolean" ? safe.preferences.alarmSound : defaults.preferences.alarmSound,
      pandoraMusicPaused:
        typeof safe.preferences?.pandoraMusicPaused === "boolean"
          ? safe.preferences.pandoraMusicPaused
          : defaults.preferences.pandoraMusicPaused,
      pandoraMusicVolume: normalizePandoraVolume(
        safe.preferences?.pandoraMusicVolume,
        defaults.preferences.pandoraMusicVolume
      )
    }
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      state = normalizeState(JSON.parse(saved));
    }
  } catch (error) {
    state = createDefaultState();
  }
}

function saveState(options = {}) {
  const shouldSync = options.sync !== false;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    // Ignore storage errors to keep the UI usable.
  }

  if (shouldSync) {
    scheduleStateSync();
  }
}

function renderAllState() {
  syncPreferencesUI();
  refreshDashboard();
  renderScheduleGrid();
  renderReminders();
  renderAlarms();
  renderProfileAvatar();
}

function hasUserData(targetState) {
  return (
    Object.values(targetState.schedule || {}).some((items) => Array.isArray(items) && items.length > 0) ||
    (Array.isArray(targetState.reminders) && targetState.reminders.length > 0) ||
    (Array.isArray(targetState.alarms) && targetState.alarms.length > 0) ||
    Boolean(targetState.profile?.photo)
  );
}

function scheduleStateSync() {
  if (!isAuthenticated || !navigator.onLine) return;

  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(syncStateToServer, 900);
}

async function syncStateFromServer() {
  if (!isAuthenticated || !navigator.onLine) return;

  try {
    const response = await fetch(SYNC_ENDPOINT, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "include"
    });

    if (response.status === 401) {
      lockApp();
      return;
    }

    if (!response.ok) return;

    const remoteState = normalizeState(await response.json());
    if (hasUserData(state) && !hasUserData(remoteState)) {
      await syncStateToServer();
      return;
    }

    state = remoteState;
    saveState({ sync: false });
    renderAllState();
  } catch (error) {
    // Local storage remains the source of truth while offline or before the API is deployed.
  }
}

async function syncStateToServer() {
  if (syncInFlight || !isAuthenticated || !navigator.onLine) return;

  syncInFlight = true;

  try {
    const response = await fetch(SYNC_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      credentials: "include",
      body: JSON.stringify(state)
    });

    if (response.status === 401) {
      lockApp();
      return;
    }

    if (!response.ok) return;

    state = normalizeState(await response.json());
    saveState({ sync: false });
    renderAllState();
  } catch (error) {
    // Keep the local copy; the next successful save/online event will retry.
  } finally {
    syncInFlight = false;
  }
}

function setAuthMessage(message = "") {
  const target = document.getElementById("auth-message");
  if (target) target.textContent = message;
}

function setMessage(id, message = "", isSuccess = false) {
  const target = document.getElementById(id);
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("success", isSuccess);
}

function unlockApp() {
  isAuthenticated = true;
  document.body.classList.remove("auth-pending", "auth-locked");
  setAuthMessage("");
}

function lockApp(message = "") {
  isAuthenticated = false;
  document.body.classList.remove("auth-pending");
  document.body.classList.add("auth-locked");
  setAuthMessage(message);
  document.getElementById("login-password")?.focus();
}

async function refreshAuthSession() {
  try {
    const response = await fetch(AUTH_SESSION_ENDPOINT, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "include"
    });

    if (!response.ok) {
      lockApp();
      return false;
    }

    const result = await response.json();
    if (!result.authenticated) {
      lockApp();
      return false;
    }

    unlockApp();
    return true;
  } catch (error) {
    lockApp("Não foi possível verificar a sessão.");
    return false;
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const passwordInput = document.getElementById("login-password");
  const submitButton = document.getElementById("login-submit");
  const password = passwordInput.value;

  if (!password) return;

  submitButton.disabled = true;
  setAuthMessage("");

  try {
    const response = await fetch(AUTH_LOGIN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ password })
    });

    if (!response.ok) {
      lockApp("Senha incorreta.");
      return;
    }

    passwordInput.value = "";
    unlockApp();
    await syncStateFromServer();
  } catch (error) {
    lockApp("Não foi possível entrar agora.");
  } finally {
    submitButton.disabled = false;
  }
}

async function requestPasswordReset() {
  const button = document.getElementById("forgot-password-btn");
  button.disabled = true;
  setAuthMessage("");

  try {
    const response = await fetch(AUTH_REQUEST_RESET_ENDPOINT, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" }
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setAuthMessage(result.error || "Não foi possível enviar o email agora.");
      return;
    }

    setMessage(
      "auth-message",
      result.emailConfigured
        ? "Link enviado para o email configurado."
        : "Email ainda não configurado no servidor.",
      result.emailConfigured
    );
  } catch (error) {
    setAuthMessage("Não foi possível enviar o email agora.");
  } finally {
    button.disabled = false;
  }
}

async function handleChangePasswordSubmit(event) {
  event.preventDefault();

  const currentPassword = document.getElementById("current-password").value;
  const newPassword = document.getElementById("new-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;
  const submitButton = document.getElementById("change-password-submit");

  if (newPassword.length < 10) {
    setMessage("change-password-message", "Use pelo menos 10 caracteres.");
    return;
  }

  if (newPassword !== confirmPassword) {
    setMessage("change-password-message", "As senhas não conferem.");
    return;
  }

  submitButton.disabled = true;
  setMessage("change-password-message", "");

  try {
    const response = await fetch(AUTH_CHANGE_PASSWORD_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ currentPassword, newPassword })
    });

    if (response.status === 401) {
      setMessage("change-password-message", "Senha atual incorreta.");
      return;
    }

    if (!response.ok) {
      setMessage("change-password-message", "Não foi possível trocar a senha.");
      return;
    }

    document.getElementById("change-password-form").reset();
    setMessage("change-password-message", "Senha atualizada.", true);
    window.setTimeout(() => closeModal("modal-password"), 700);
  } catch (error) {
    setMessage("change-password-message", "Não foi possível trocar a senha.");
  } finally {
    submitButton.disabled = false;
  }
}

async function handleResetPasswordSubmit(event) {
  event.preventDefault();

  const newPassword = document.getElementById("reset-new-password").value;
  const confirmPassword = document.getElementById("reset-confirm-password").value;
  const submitButton = document.getElementById("reset-password-submit");

  if (newPassword.length < 10) {
    setMessage("reset-auth-message", "Use pelo menos 10 caracteres.");
    return;
  }

  if (newPassword !== confirmPassword) {
    setMessage("reset-auth-message", "As senhas não conferem.");
    return;
  }

  submitButton.disabled = true;
  setMessage("reset-auth-message", "");

  try {
    const response = await fetch(AUTH_RESET_PASSWORD_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ token: passwordResetToken, newPassword })
    });

    if (!response.ok) {
      setMessage("reset-auth-message", "Link inválido ou expirado.");
      return;
    }

    passwordResetToken = "";
    document.getElementById("reset-password-form").reset();
    document.getElementById("reset-password-form").classList.add("hidden");
    document.getElementById("login-form").classList.remove("hidden");
    window.history.replaceState({}, "", window.location.pathname);
    setMessage("auth-message", "Senha redefinida. Entre com a nova senha.", true);
  } catch (error) {
    setMessage("reset-auth-message", "Não foi possível redefinir a senha.");
  } finally {
    submitButton.disabled = false;
  }
}

async function logout() {
  try {
    await fetch(AUTH_LOGOUT_ENDPOINT, {
      method: "POST",
      credentials: "include"
    });
  } catch (error) {
    // Lock locally even if the network request fails.
  }

  lockApp();
  closeMobileSidebar();
}

function setupPasswordResetMode() {
  const params = new URLSearchParams(window.location.search);
  passwordResetToken = params.get("reset_token") || "";
  if (!passwordResetToken) return;

  document.getElementById("login-form").classList.add("hidden");
  document.getElementById("reset-password-form").classList.remove("hidden");
  lockApp();
}

function bindNavigation() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      openPage(item.dataset.page);
    });
  });
}

function getAppNowContext() {
  const now = new Date();

  const timeParts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);

  const dateParts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "short"
  }).formatToParts(now);

  const hour = Number.parseInt(timeParts.find((part) => part.type === "hour")?.value || "0", 10);
  const minute = Number.parseInt(timeParts.find((part) => part.type === "minute")?.value || "0", 10);
  const day = Number.parseInt(dateParts.find((part) => part.type === "day")?.value || "1", 10);
  const month = Number.parseInt(dateParts.find((part) => part.type === "month")?.value || "1", 10);
  const year = Number.parseInt(dateParts.find((part) => part.type === "year")?.value || "1970", 10);
  const weekday = (dateParts.find((part) => part.type === "weekday")?.value || "").toLowerCase().replace(".", "");

  const weekdayMap = {
    dom: 0,
    domingo: 0,
    seg: 1,
    segunda: 1,
    ter: 2,
    terça: 2,
    terca: 2,
    qua: 3,
    quarta: 3,
    qui: 4,
    quinta: 4,
    sex: 5,
    sexta: 5,
    sáb: 6,
    sab: 6,
    sábado: 6,
    sabado: 6
  };

  return {
    now,
    hour,
    minute,
    day,
    monthIndex: month - 1,
    year,
    dayIndex: weekdayMap[weekday] ?? now.getDay()
  };
}

function bindStaticEvents() {
  document.getElementById("login-form").addEventListener("submit", handleLoginSubmit);
  document.getElementById("forgot-password-btn").addEventListener("click", requestPasswordReset);
  document.getElementById("reset-password-form").addEventListener("submit", handleResetPasswordSubmit);
  document.getElementById("change-password-btn").addEventListener("click", () => openModal("modal-password"));
  document.getElementById("change-password-form").addEventListener("submit", handleChangePasswordSubmit);
  document.getElementById("logout-app-btn").addEventListener("click", logout);
  document.getElementById("mobile-nav-toggle").addEventListener("click", toggleMobileSidebar);
  document.getElementById("sidebar-backdrop").addEventListener("click", closeMobileSidebar);
  document.getElementById("add-subject-btn").addEventListener("click", () => openAddSubjectModal());
  document.getElementById("add-time-row-btn").addEventListener("click", addTimeRow);
  document.getElementById("legend-toggle").addEventListener("click", toggleLegend);
  document.getElementById("add-reminder-btn").addEventListener("click", openAddReminderModal);
  document.getElementById("add-alarm-btn").addEventListener("click", openAddAlarmModal);
  document.getElementById("save-subject-btn").addEventListener("click", saveSubject);
  document.getElementById("save-reminder-btn").addEventListener("click", saveReminder);
  document.getElementById("save-alarm-btn").addEventListener("click", saveAlarm);
  document.getElementById("profile-avatar-btn").addEventListener("click", () => {
    document.getElementById("profile-photo-input").click();
  });
  document.getElementById("profile-photo-input").addEventListener("change", handleProfilePhotoChange);

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });

  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        overlay.classList.remove("open");
      }
    });
  });

  document.querySelectorAll("#page-reminders .filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#page-reminders .filter-chip").forEach((item) => item.classList.remove("active"));
      chip.classList.add("active");
      renderReminders(chip.dataset.filter);
    });
  });

  document.querySelectorAll(".color-opt").forEach((option) => {
    option.addEventListener("click", () => {
      document.querySelectorAll(".color-opt").forEach((item) => item.classList.remove("selected"));
      option.classList.add("selected");
      selectedColor = option.dataset.color;
    });
  });

  document.querySelectorAll("#alm-days-picker label").forEach((label) => {
    const checkbox = label.querySelector("input");
    checkbox.addEventListener("change", () => {
      label.classList.toggle("active", checkbox.checked);
    });
  });

  const installButton = document.getElementById("install-app-btn");
  installButton.addEventListener("click", installApp);
  document.getElementById("options-install-btn").addEventListener("click", installApp);

  document.getElementById("theme-select").addEventListener("change", (event) => {
    state.preferences.theme = event.target.value;
    saveState();
    syncPreferencesUI();
    showToast("palette", `Tema ${state.preferences.theme} aplicado.`);
  });

  document.getElementById("option-animations").addEventListener("change", (event) => {
    state.preferences.animations = event.target.checked;
    saveState();
    syncPreferencesUI();
  });

  document.getElementById("option-sound").addEventListener("change", (event) => {
    state.preferences.alarmSound = event.target.checked;
    saveState();
    syncPreferencesUI();
  });

  document.getElementById("pandora-music-toggle").addEventListener("click", togglePandoraMusic);
  document.getElementById("pandora-volume-range").addEventListener("input", handlePandoraVolumeInput);
  window.addEventListener("online", scheduleStateSync);
}

function bindPwaEvents() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    syncInstallButtons(true);
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    syncInstallButtons(false);
    updateInstallStatus(true);
    showToast("install", "App instalado com sucesso!");
  });
}

async function installApp() {
  if (!deferredInstallPrompt) {
    showToast("info", "A instalação não está disponível neste navegador agora.");
    return;
  }

  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  if (choice?.outcome !== "accepted") {
    showToast("info", "Você pode instalar o app depois quando quiser.");
  }
  deferredInstallPrompt = null;
  syncInstallButtons(false);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register("./sw.js");
    registration.update();

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  } catch (error) {
    // Keep the app usable even if service worker registration fails.
  }
}

function openPage(page) {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.page === page);
  });

  document.querySelectorAll(".page").forEach((section) => {
    section.classList.toggle("active", section.id === `page-${page}`);
  });

  closeMobileSidebar();

  if (page === "dashboard") refreshDashboard();
  if (page === "schedule") renderScheduleGrid();
  if (page === "reminders") renderReminders();
  if (page === "alarms") renderAlarms();
}

function toggleMobileSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const isOpen = !sidebar.classList.contains("is-open");
  sidebar.classList.toggle("is-open", isOpen);
  backdrop.classList.toggle("is-visible", isOpen);
  document.body.classList.toggle("mobile-sidebar-open", isOpen);
}

function closeMobileSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  sidebar.classList.remove("is-open");
  backdrop.classList.remove("is-visible");
  document.body.classList.remove("mobile-sidebar-open");
}

function getGreetingForHour(hour) {
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

function setFlipDigit(key, value) {
  const digit = document.querySelector(`.flip-digit[data-digit="${key}"]`);
  if (!digit) return;

  const inner = digit.querySelector(".flip-digit-inner");
  const previous = lastFlipDigits[key];
  if (previous === value && inner.textContent === value) return;

  inner.textContent = value;
  digit.setAttribute("data-value", value);

  if (previous !== undefined && state.preferences.animations) {
    digit.classList.remove("is-flipping");
    void digit.offsetWidth;
    digit.classList.add("is-flipping");
  } else {
    digit.classList.remove("is-flipping");
  }

  lastFlipDigits[key] = value;
}

function updateFlipClock(hours, minutes) {
  const valueMap = {
    h1: hours[0],
    h2: hours[1],
    m1: minutes[0],
    m2: minutes[1]
  };

  Object.entries(valueMap).forEach(([key, value]) => {
    setFlipDigit(key, value);
  });
}

function updateClock() {
  const context = getAppNowContext();
  const hours = String(context.hour).padStart(2, "0");
  const minutes = String(context.minute).padStart(2, "0");
  document.getElementById("dash-clock").textContent = `${hours}:${minutes}`;
  updateFlipClock(hours, minutes);
  document.getElementById("sidebar-day").textContent = context.day;
  document.getElementById("sidebar-date").textContent = `${DAY_NAMES[context.dayIndex]}, ${MONTH_NAMES[context.monthIndex]} ${context.year}`;

  const greeting = getGreetingForHour(context.hour);
  window.__AGENDA_GREETING__ = greeting;

  setTextWithIcon("dash-greeting", `${greeting}, Duda!`, "spark", "greeting-inline-icon");
  setTextWithIcon("sidebar-greeting", `${greeting}!`, "spark", "sidebar-greeting-icon");

  const motivation = [
    "Que ótimo dia para aprender algo novo.",
    "Você está construindo o seu futuro, continue.",
    "Cada minuto de estudo é um investimento em si mesma.",
    "Foco, dedicação e muita energia para seguir.",
    "A jornada de mil milhas começa com um único passo."
  ];
  document.getElementById("dash-motivation").textContent = motivation[context.day % motivation.length];

  checkAlarms(context);
}

function parseLocalDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = (timeStr || "00:00").split(":").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, hours || 0, minutes || 0, 0, 0));
}

function getContextDateKey(context) {
  return `${context.year}-${String(context.monthIndex + 1).padStart(2, "0")}-${String(context.day).padStart(2, "0")}`;
}

function buildIconMarkup(name, className = "") {
  const span = document.createElement("span");
  span.className = "inline-icon-wrap";
  span.innerHTML = iconMarkup(name, className);
  return span.firstElementChild;
}

function createEmptyState(iconName, message) {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";

  const icon = document.createElement("div");
  icon.className = "empty-icon";
  icon.append(buildIconMarkup(iconName, "empty-icon-svg"));

  wrapper.append(icon, document.createTextNode(message));
  return wrapper;
}

function splitTimeLabel(label) {
  return String(label).split(/[–-]/)[0].trim();
}

function getReminderMomentKey(dateStr, timeStr, useEndOfDay = false) {
  if (!dateStr) return "";
  return `${dateStr}T${timeStr || (useEndOfDay ? "23:59" : "00:00")}`;
}

function pruneAlarmHistory(activeDateKey) {
  Object.keys(lastAlarmRing).forEach((key) => {
    if (!key.includes(`_${activeDateKey}_`)) {
      delete lastAlarmRing[key];
    }
  });
}

function checkAlarms(context) {
  const current = `${String(context.hour).padStart(2, "0")}:${String(context.minute).padStart(2, "0")}`;
  const dayIndex = context.dayIndex;
  const dateKey = getContextDateKey(context);
  pruneAlarmHistory(dateKey);

  state.alarms.forEach((alarm) => {
    if (!alarm.active || !Array.isArray(alarm.days)) return;
    if (!alarm.days.includes(dayIndex) || alarm.time !== current) return;

    const key = `${alarm.id}_${dateKey}_${current}`;
    if (lastAlarmRing[key]) return;

    lastAlarmRing[key] = true;
    ringAlarm(alarm);
  });
}

function ringAlarm(alarm) {
  showToast("alarm", `Alarme: ${alarm.label}`, true);
  if (!state.preferences.alarmSound) return;

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const closeDelay = 2600;
    for (let index = 0; index < 3; index += 1) {
      setTimeout(() => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.frequency.value = 880;
        oscillator.type = "sine";
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.5);
      }, index * 700);
    }

    setTimeout(() => {
      if (ctx.state !== "closed") {
        void ctx.close().catch(() => {});
      }
    }, closeDelay);
  } catch (error) {
    // Ignore sound errors and keep the visual toast.
  }
}

function refreshDashboard() {
  const allSubjects = Object.values(state.schedule).flat();
  const uniqueSubjects = [...new Set(allSubjects.map((subject) => subject.name))];

  document.getElementById("stat-subjects").textContent = uniqueSubjects.length;
  document.getElementById("stat-reminders").textContent = state.reminders.filter((reminder) => !reminder.done).length;
  document.getElementById("stat-alarms").textContent = state.alarms.filter((alarm) => alarm.active).length;

  renderTodaySchedule();
  renderUpcomingReminders();
}

function renderTodaySchedule() {
  const { dayIndex: todayIndex } = getAppNowContext();
  document.getElementById("today-dayname").textContent = DAY_NAMES[todayIndex];

  const items = [];
  state.timeRows.forEach((timeRow, rowIndex) => {
    const key = `${rowIndex}_${todayIndex}`;
    (state.schedule[key] || []).forEach((subject) => {
      items.push({ time: timeRow, name: subject.name, color: subject.color });
    });
  });

  const target = document.getElementById("today-list");
  if (!items.length) {
    target.replaceChildren(createEmptyState("calendar", "Nenhuma aula hoje."));
    return;
  }

  target.replaceChildren(...items.map((item) => {
    const row = document.createElement("div");
    row.className = "schedule-item";

    const time = document.createElement("span");
    time.className = "si-time";
    time.textContent = splitTimeLabel(item.time);

    const bar = document.createElement("div");
    bar.className = "si-bar";
    bar.style.background = item.color;

    const info = document.createElement("div");
    const name = document.createElement("div");
    name.className = "si-name";
    name.textContent = item.name;
    const detail = document.createElement("div");
    detail.className = "si-detail";
    detail.textContent = item.time;

    info.append(name, detail);
    row.append(time, bar, info);
    return row;
  }));
}

function renderUpcomingReminders() {
  const target = document.getElementById("upcoming-reminders");
  const context = getAppNowContext();
  const nowKey = `${getContextDateKey(context)}T${String(context.hour).padStart(2, "0")}:${String(context.minute).padStart(2, "0")}`;
  const upcoming = state.reminders
    .filter((reminder) => !reminder.done && reminder.date)
    .filter((reminder) => getReminderMomentKey(reminder.date, reminder.time, true) >= nowKey)
    .sort((first, second) =>
      getReminderMomentKey(first.date, first.time, true).localeCompare(
        getReminderMomentKey(second.date, second.time, true)
      )
    )
    .slice(0, 5);

  if (!upcoming.length) {
    target.replaceChildren(createEmptyState("bell", "Nenhum lembrete."));
    return;
  }

  target.replaceChildren(...upcoming.map((reminder) => {
    const row = document.createElement("div");
    row.className = "reminder-item";

    const dot = document.createElement("div");
    dot.className = "ri-dot";
    dot.style.background = PRIORITY_COLORS[reminder.priority];

    const info = document.createElement("div");
    const title = document.createElement("div");
    title.className = "ri-title";
    title.textContent = reminder.title;
    const time = document.createElement("div");
    time.className = "ri-time";
    time.textContent = `${formatDate(reminder.date)}${reminder.time ? ` às ${reminder.time}` : ""}`;

    info.append(title, time);
    row.append(dot, info);
    return row;
  }));
}

function renderScheduleGrid() {
  const tbody = document.getElementById("week-tbody");
  tbody.innerHTML = "";

  state.timeRows.forEach((timeRow, rowIndex) => {
    const row = document.createElement("tr");
    const timeCell = document.createElement("td");
    const removeButton = document.createElement("button");

    removeButton.className = "time-remove-btn";
    removeButton.type = "button";
    removeButton.title = "Remover";
    removeButton.innerHTML = iconMarkup("close");
    removeButton.addEventListener("click", () => removeTimeRow(rowIndex));

    timeCell.append(document.createElement("span"));
    timeCell.firstChild.textContent = timeRow;
    timeCell.append(document.createElement("br"));
    timeCell.append(removeButton);
    row.append(timeCell);

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const cell = document.createElement("td");
      const container = document.createElement("div");
      container.className = "cell-content";

      const key = `${rowIndex}_${dayIndex}`;
      (state.schedule[key] || []).forEach((subject, subjectIndex) => {
        const chip = document.createElement("div");
        const name = document.createElement("span");
        const remove = document.createElement("button");

        chip.className = "cell-subject";
        chip.style.background = `${subject.color}22`;
        chip.style.borderLeft = `3px solid ${subject.color}`;
        chip.style.color = subject.color;

        name.className = "subj-name";
        name.textContent = subject.name;

        remove.className = "subj-remove";
        remove.type = "button";
        remove.innerHTML = iconMarkup("close");
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          removeSubjectFromCell(rowIndex, dayIndex, subjectIndex);
        });

        chip.append(name, remove);
        container.append(chip);
      });

      const addButton = document.createElement("button");
      addButton.className = "add-slot-btn";
      addButton.type = "button";
      addButton.textContent = "+ add";
      addButton.addEventListener("click", () => openAddSubjectModal(rowIndex, dayIndex));
      container.append(addButton);

      cell.append(container);
      row.append(cell);
    }

    tbody.append(row);
  });
}

function openAddSubjectModal(row, day) {
  const slotSelect = document.getElementById("subj-slot");
  slotSelect.replaceChildren(...state.timeRows.map((timeRow, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.selected = row === index;
    option.textContent = timeRow;
    return option;
  }));

  if (row !== undefined) slotSelect.value = String(row);
  if (day !== undefined) document.getElementById("subj-day").value = String(day);

  document.getElementById("subj-name").value = "";
  selectedColor = DEFAULT_COLOR;
  document.querySelectorAll(".color-opt").forEach((item) => {
    item.classList.toggle("selected", item.dataset.color === DEFAULT_COLOR);
  });

  openModal("modal-subject");
}

function saveSubject() {
  const name = document.getElementById("subj-name").value.trim();
  if (!name) {
    showToast("warning", "Insira o nome da matéria.");
    return;
  }

  const row = Number.parseInt(document.getElementById("subj-slot").value, 10);
  const day = Number.parseInt(document.getElementById("subj-day").value, 10);
  const key = `${row}_${day}`;

  if (!state.schedule[key]) state.schedule[key] = [];
  state.schedule[key].push({ name, color: selectedColor });

  saveState();
  closeModal("modal-subject");
  renderScheduleGrid();
  refreshDashboard();
  showToast("check", "Matéria adicionada!");
}

function removeSubjectFromCell(row, day, subjectIndex) {
  const key = `${row}_${day}`;
  if (!state.schedule[key]) return;

  state.schedule[key].splice(subjectIndex, 1);
  if (!state.schedule[key].length) delete state.schedule[key];

  saveState();
  renderScheduleGrid();
  refreshDashboard();
}

function addTimeRow() {
  const time = window.prompt("Insira o horário (ex: 21:00–22:00):");
  if (!time) return;

  state.timeRows.push(time);
  saveState();
  renderScheduleGrid();
  showToast("check", "Horário adicionado!");
}

function removeTimeRow(rowIndex) {
  if (!window.confirm("Remover este horário? As matérias associadas serão perdidas.")) return;

  state.timeRows.splice(rowIndex, 1);
  const nextSchedule = {};

  Object.entries(state.schedule).forEach(([key, subjects]) => {
    const [row, day] = key.split("_").map(Number);
    if (row === rowIndex) return;
    const nextRow = row > rowIndex ? row - 1 : row;
    nextSchedule[`${nextRow}_${day}`] = subjects;
  });

  state.schedule = nextSchedule;
  saveState();
  renderScheduleGrid();
  refreshDashboard();
}

function openAddReminderModal() {
  document.getElementById("rem-title").value = "";
  document.getElementById("rem-desc").value = "";
  document.getElementById("rem-date").value = "";
  document.getElementById("rem-time").value = "";
  document.getElementById("rem-priority").value = "media";
  openModal("modal-reminder");
}

function saveReminder() {
  const title = document.getElementById("rem-title").value.trim();
  if (!title) {
    showToast("warning", "Insira um título.");
    return;
  }

  state.reminders.push({
    id: Date.now(),
    title,
    desc: document.getElementById("rem-desc").value.trim(),
    date: document.getElementById("rem-date").value,
    time: document.getElementById("rem-time").value,
    priority: document.getElementById("rem-priority").value,
    done: false
  });

  saveState();
  closeModal("modal-reminder");
  renderReminders();
  refreshDashboard();
  showToast("bell", "Lembrete salvo!");
}

function renderReminders(filter) {
  if (filter) reminderFilter = filter;

  const list = document.getElementById("reminders-list");
  let items = [...state.reminders];

  if (reminderFilter === "done") items = items.filter((reminder) => reminder.done);
  else if (reminderFilter !== "all") items = items.filter((reminder) => reminder.priority === reminderFilter && !reminder.done);

  items.sort((first, second) => {
    if (first.done !== second.done) return first.done ? 1 : -1;
    const firstDate = parseLocalDateTime(first.date, first.time) || new Date(MAX_DATE);
    const secondDate = parseLocalDateTime(second.date, second.time) || new Date(MAX_DATE);
    return firstDate - secondDate;
  });

  if (!items.length) {
    list.innerHTML = `<div class="no-items"><div class="ni-icon">${iconMarkup("bell")}</div><div class="ni-title">Nenhum lembrete aqui</div><p style="font-size:13px">Crie um novo usando o botão acima!</p></div>`;
    return;
  }

  list.innerHTML = "";
  items.forEach((reminder) => {
    const card = document.createElement("div");
    card.className = `reminder-card ${reminder.done ? "done" : ""}`;
    card.id = `rc-${reminder.id}`;

    const priority = document.createElement("div");
    priority.className = "rc-priority";
    priority.style.background = PRIORITY_COLORS[reminder.priority];

    const info = document.createElement("div");
    info.className = "rc-info";

    const title = document.createElement("div");
    title.className = `rc-title ${reminder.done ? "done-text" : ""}`;
    title.textContent = reminder.title;
    info.append(title);

    if (reminder.desc) {
      const desc = document.createElement("div");
      desc.style.fontSize = "12px";
      desc.style.color = "var(--text-muted)";
      desc.style.marginTop = "3px";
      desc.textContent = reminder.desc;
      info.append(desc);
    }

    const meta = document.createElement("div");
    meta.className = "rc-meta";

    if (reminder.date) {
      const date = document.createElement("span");
      date.className = "rc-date";
      date.append(buildIconMarkup("calendar", "meta-icon"));
      date.append(document.createTextNode(` ${formatDate(reminder.date)}${reminder.time ? ` às ${reminder.time}` : ""}`));
      meta.append(date);
    }

    const badge = document.createElement("span");
    badge.className = "rc-badge";
    badge.style.background = `${PRIORITY_COLORS[reminder.priority]}22`;
    badge.style.color = PRIORITY_COLORS[reminder.priority];
    badge.style.border = `1px solid ${PRIORITY_COLORS[reminder.priority]}44`;
    badge.textContent = PRIORITY_LABELS[reminder.priority];
    meta.append(badge);
    info.append(meta);

    const actions = document.createElement("div");
    actions.className = "rc-actions";

    if (!reminder.done) {
      const doneButton = document.createElement("button");
      doneButton.className = "rc-btn done-btn";
      doneButton.type = "button";
      doneButton.title = "Marcar como feito";
      doneButton.innerHTML = iconMarkup("check");
      doneButton.addEventListener("click", () => toggleReminder(reminder.id));
      actions.append(doneButton);
    }

    const deleteButton = document.createElement("button");
    deleteButton.className = "rc-btn del-btn";
    deleteButton.type = "button";
    deleteButton.title = "Excluir";
    deleteButton.innerHTML = iconMarkup("trash");
    deleteButton.addEventListener("click", () => deleteReminder(reminder.id));
    actions.append(deleteButton);

    card.append(priority, info, actions);
    list.append(card);
  });
}

function toggleReminder(id) {
  const reminder = state.reminders.find((item) => item.id === id);
  if (!reminder) return;

  reminder.done = !reminder.done;
  saveState();
  renderReminders();
  refreshDashboard();
}

function deleteReminder(id) {
  state.reminders = state.reminders.filter((item) => item.id !== id);
  saveState();
  renderReminders();
  refreshDashboard();
  showToast("trash", "Lembrete removido.");
}

function openAddAlarmModal() {
  document.getElementById("alm-time").value = "08:00";
  document.getElementById("alm-label").value = "";
  document.querySelectorAll("#alm-days-picker input").forEach((checkbox) => {
    checkbox.checked = false;
    checkbox.closest("label").classList.remove("active");
  });
  openModal("modal-alarm");
}

function saveAlarm() {
  const time = document.getElementById("alm-time").value;
  const label = document.getElementById("alm-label").value.trim() || "Alarme";
  const days = [...document.querySelectorAll("#alm-days-picker input:checked")].map((checkbox) => Number.parseInt(checkbox.value, 10));

  if (!days.length) {
    showToast("warning", "Selecione ao menos um dia.");
    return;
  }

  state.alarms.push({ id: Date.now(), time, label, days, active: true });
  saveState();
  closeModal("modal-alarm");
  renderAlarms();
  refreshDashboard();
  showToast("alarm", "Alarme criado!");
}

function renderAlarms() {
  const list = document.getElementById("alarms-list");
  if (!state.alarms.length) {
    list.innerHTML = `<div class="no-items"><div class="ni-icon">${iconMarkup("alarm")}</div><div class="ni-title">Nenhum alarme</div><p style="font-size:13px">Adicione alertas para suas aulas!</p></div>`;
    return;
  }

  list.innerHTML = "";
  state.alarms.forEach((alarm) => {
    const card = document.createElement("div");
    card.className = `alarm-card ${alarm.active ? "" : "inactive"}`;

    const time = document.createElement("div");
    time.className = "alarm-time";
    time.textContent = alarm.time;

    const info = document.createElement("div");
    info.className = "alarm-info";

    const label = document.createElement("div");
    label.className = "alarm-label";
    label.textContent = alarm.label;

    const days = document.createElement("div");
    days.className = "alarm-days";
    alarm.days.forEach((day) => {
      const dayChip = document.createElement("span");
      dayChip.className = "alarm-day";
      dayChip.textContent = DAY_NAMES[day];
      days.append(dayChip);
    });

    info.append(label, days);

    const toggleButton = document.createElement("button");
    toggleButton.className = `toggle ${alarm.active ? "on" : "off"}`;
    toggleButton.type = "button";
    toggleButton.addEventListener("click", () => toggleAlarm(alarm.id));

    const actions = document.createElement("div");
    actions.className = "alarm-actions";
    const deleteButton = document.createElement("button");
    deleteButton.className = "rc-btn del-btn";
    deleteButton.type = "button";
    deleteButton.innerHTML = iconMarkup("trash");
    deleteButton.addEventListener("click", () => deleteAlarm(alarm.id));
    actions.append(deleteButton);

    card.append(time, info, toggleButton, actions);
    list.append(card);
  });
}

function toggleAlarm(id) {
  const alarm = state.alarms.find((item) => item.id === id);
  if (!alarm) return;

  alarm.active = !alarm.active;
  saveState();
  renderAlarms();
  refreshDashboard();
}

function deleteAlarm(id) {
  state.alarms = state.alarms.filter((item) => item.id !== id);
  saveState();
  renderAlarms();
  refreshDashboard();
  showToast("trash", "Alarme removido.");
}

function toggleLegend() {
  const panel = document.getElementById("legend-panel");
  const button = document.getElementById("legend-toggle");
  const isOpen = panel.classList.toggle("open");
  button.classList.toggle("active", isOpen);
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

function formatDate(dateString) {
  if (!dateString) return "";
  const [year, month, day] = dateString.split("-");
  return `${day}/${month}/${year}`;
}

function showToast(icon, message, persistent = false) {
  document.querySelector(".toast")?.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  const iconWrap = document.createElement("span");
  iconWrap.className = "toast-icon";
  iconWrap.append(buildIconMarkup(icon, "toast-icon-svg"));
  const text = document.createElement("span");
  text.textContent = message;
  toast.append(iconWrap, text);
  document.body.append(toast);

  clearTimeout(toastTimeout);
  const duration = persistent ? 6000 : 3500;
  toastTimeout = setTimeout(() => toast.remove(), duration);
}

function handleProfilePhotoChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!ALLOWED_PROFILE_PHOTO_TYPES.has(file.type)) {
    showToast("warning", "Escolha uma imagem válida para a foto de perfil.");
    event.target.value = "";
    return;
  }

  if (file.size > MAX_PROFILE_PHOTO_BYTES) {
    showToast("warning", "Escolha uma imagem de até 2 MB.");
    event.target.value = "";
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.profile.photo = typeof reader.result === "string" ? reader.result : "";
    saveState();
    renderProfileAvatar();
    showToast("check", "Foto de perfil atualizada.");
  });
  reader.readAsDataURL(file);
  event.target.value = "";
}

function renderProfileAvatar() {
  const image = document.getElementById("profile-avatar-image");
  const initials = document.getElementById("profile-avatar-initials");
  const hasPhoto = Boolean(state.profile.photo);

  image.src = hasPhoto ? state.profile.photo : "";
  image.classList.toggle("hidden", !hasPhoto);
  initials.classList.toggle("hidden", hasPhoto);
}

function syncInstallButtons(isAvailable) {
  ["install-app-btn", "options-install-btn"].forEach((id) => {
    document.getElementById(id).classList.toggle("hidden", !isAvailable);
  });
}

function updateInstallStatus(isInstalled = false) {
  const status = document.getElementById("install-status-text");
  if (isInstalled) {
    status.textContent = "App instalado. Você pode abrir a agenda como aplicativo independente neste dispositivo.";
    return;
  }

  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
    status.textContent = "App em modo instalado. A agenda está rodando fora da aba do navegador.";
    return;
  }

  status.textContent = deferredInstallPrompt
    ? "Instalação disponível neste navegador. Use o botão abaixo para adicionar o app ao dispositivo."
    : "Pronto para uso no navegador e preparado para instalação quando disponível.";
}

function applyTheme(themeName) {
  document.body.dataset.theme = normalizeTheme(themeName);
}

function isPandoraThemeActive() {
  return normalizeTheme(state.preferences.theme) === "pandora";
}

function unbindPandoraMusicUnlock() {
  if (!pandoraMusicState.unlockBound || !pandoraMusicState.unlockHandler) return;

  ["pointerdown", "touchstart", "keydown"].forEach((eventName) => {
    document.removeEventListener(eventName, pandoraMusicState.unlockHandler);
  });

  pandoraMusicState.unlockHandler = null;
  pandoraMusicState.unlockBound = false;
}

async function playPandoraMusic() {
  const { audio } = pandoraMusicState;
  if (!audio || !isPandoraThemeActive() || state.preferences.pandoraMusicPaused) {
    return;
  }

  try {
    await audio.play();
    unbindPandoraMusicUnlock();
  } catch (error) {
    // Browsers may block autoplay until a user gesture unlocks media playback.
  }
}

function pausePandoraMusic() {
  pandoraMusicState.audio?.pause();
}

function syncPandoraMusicUI() {
  const { audio, panel, button, label, volumeRange, volumeValue } = pandoraMusicState;
  if (!audio || !panel || !button || !label || !volumeRange || !volumeValue) return;

  const isPandora = isPandoraThemeActive();
  const isPlaying = isPandora && !audio.paused && !audio.ended;
  const volumePercent = Math.round(normalizePandoraVolume(state.preferences.pandoraMusicVolume) * 100);

  panel.classList.toggle("is-visible", isPandora);
  panel.setAttribute("aria-hidden", String(!isPandora));
  document.body.classList.toggle("pandora-music-visible", isPandora);
  button.setAttribute("aria-pressed", String(isPlaying));
  button.setAttribute("aria-label", isPlaying ? "Pausar trilha de Pandora" : "Tocar trilha de Pandora");
  label.textContent = isPlaying ? "Pausar trilha de Pandora" : "Tocar trilha de Pandora";
  volumeRange.value = String(volumePercent);
  volumeValue.textContent = `${volumePercent}%`;
}

function syncPandoraMusicThemeState() {
  if (!pandoraMusicState.audio) return;

  if (!isPandoraThemeActive()) {
    pausePandoraMusic();
    syncPandoraMusicUI();
    return;
  }

  if (state.preferences.pandoraMusicPaused) {
    pausePandoraMusic();
    syncPandoraMusicUI();
    return;
  }

  void playPandoraMusic().finally(syncPandoraMusicUI);
}

function togglePandoraMusic() {
  if (!pandoraMusicState.audio || !isPandoraThemeActive()) return;

  if (!pandoraMusicState.audio.paused) {
    state.preferences.pandoraMusicPaused = true;
    pausePandoraMusic();
  } else {
    state.preferences.pandoraMusicPaused = false;
    void playPandoraMusic();
  }

  saveState();
  syncPandoraMusicUI();
}

function bindPandoraMusicUnlock() {
  if (pandoraMusicState.unlockBound) return;

  const unlock = () => {
    if (!pandoraMusicState.audio) return;
    if (!isPandoraThemeActive() || state.preferences.pandoraMusicPaused) return;
    void playPandoraMusic();
  };

  ["pointerdown", "touchstart", "keydown"].forEach((eventName) => {
    document.addEventListener(eventName, unlock);
  });

  pandoraMusicState.unlockHandler = unlock;
  pandoraMusicState.unlockBound = true;
}

function handlePandoraVolumeInput(event) {
  if (!pandoraMusicState.audio) return;

  state.preferences.pandoraMusicVolume = normalizePandoraVolume(Number(event.target.value) / 100);
  pandoraMusicState.audio.volume = state.preferences.pandoraMusicVolume;
  saveState();
  syncPandoraMusicUI();
}

function setupPandoraMusic() {
  pandoraMusicState.audio = document.getElementById("pandora-theme-audio");
  pandoraMusicState.panel = document.getElementById("pandora-music-panel");
  pandoraMusicState.button = document.getElementById("pandora-music-toggle");
  pandoraMusicState.label = document.getElementById("pandora-music-toggle-label");
  pandoraMusicState.volumeRange = document.getElementById("pandora-volume-range");
  pandoraMusicState.volumeValue = document.getElementById("pandora-volume-value");

  if (!pandoraMusicState.audio) return;

  pandoraMusicState.audio.volume = normalizePandoraVolume(state.preferences.pandoraMusicVolume);

  ["play", "pause", "ended"].forEach((eventName) => {
    pandoraMusicState.audio.addEventListener(eventName, syncPandoraMusicUI);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pausePandoraMusic();
      syncPandoraMusicUI();
      return;
    }

    syncPandoraMusicThemeState();
  });

  bindPandoraMusicUnlock();
  syncPandoraMusicUI();
}

function setParallaxVars(backX = 0, backY = 0, midX = 0, midY = 0, frontX = 0, frontY = 0) {
  const hasMeaningfulChange =
    parallaxState.lastBackX === null ||
    Math.abs(parallaxState.lastBackX - backX) > PARALLAX_STYLE_EPSILON ||
    Math.abs(parallaxState.lastBackY - backY) > PARALLAX_STYLE_EPSILON ||
    Math.abs(parallaxState.lastMidX - midX) > PARALLAX_STYLE_EPSILON ||
    Math.abs(parallaxState.lastMidY - midY) > PARALLAX_STYLE_EPSILON ||
    Math.abs(parallaxState.lastFrontX - frontX) > PARALLAX_STYLE_EPSILON ||
    Math.abs(parallaxState.lastFrontY - frontY) > PARALLAX_STYLE_EPSILON;

  if (!hasMeaningfulChange) return;

  document.documentElement.style.setProperty("--parallax-back-x", `${backX}px`);
  document.documentElement.style.setProperty("--parallax-back-y", `${backY}px`);
  document.documentElement.style.setProperty("--parallax-mid-x", `${midX}px`);
  document.documentElement.style.setProperty("--parallax-mid-y", `${midY}px`);
  document.documentElement.style.setProperty("--parallax-front-x", `${frontX}px`);
  document.documentElement.style.setProperty("--parallax-front-y", `${frontY}px`);

  parallaxState.lastBackX = backX;
  parallaxState.lastBackY = backY;
  parallaxState.lastMidX = midX;
  parallaxState.lastMidY = midY;
  parallaxState.lastFrontX = frontX;
  parallaxState.lastFrontY = frontY;
}

function shouldRunParallax() {
  return state.preferences.animations && isPandoraThemeActive();
}

function updateParallaxFrame() {
  parallaxState.currentX += (parallaxState.targetX - parallaxState.currentX) * 0.08;
  parallaxState.currentY += (parallaxState.targetY - parallaxState.currentY) * 0.08;

  const backX = parallaxState.currentX * 0.35;
  const backY = parallaxState.currentY * 0.35;
  const midX = parallaxState.currentX * 0.7;
  const midY = parallaxState.currentY * 0.7;
  const frontX = parallaxState.currentX * 1.15;
  const frontY = parallaxState.currentY * 1.15;

  setParallaxVars(backX, backY, midX, midY, frontX, frontY);

  const isSettled =
    Math.abs(parallaxState.targetX - parallaxState.currentX) < 0.08 &&
    Math.abs(parallaxState.targetY - parallaxState.currentY) < 0.08;

  if (isSettled) {
    parallaxState.frame = 0;
    parallaxState.currentX = parallaxState.targetX;
    parallaxState.currentY = parallaxState.targetY;
    setParallaxVars(backX, backY, midX, midY, frontX, frontY);
    return;
  }

  parallaxState.frame = window.requestAnimationFrame(updateParallaxFrame);
}

function requestParallaxFrame() {
  if (parallaxState.frame || !shouldRunParallax()) return;
  parallaxState.frame = window.requestAnimationFrame(updateParallaxFrame);
}

function bindBackgroundParallax() {
  const hasFinePointer = window.matchMedia("(pointer: fine)");
  let driftAngle = 0;

  const applyParallaxTarget = (clientX, clientY, intensity = 10, force = false) => {
    if (!shouldRunParallax()) return;

    const now = window.performance.now();
    if (!force && now - parallaxState.lastInputAt < PARALLAX_INPUT_INTERVAL) return;
    parallaxState.lastInputAt = now;

    const x = (clientX / window.innerWidth - 0.5) * 2;
    const y = (clientY / window.innerHeight - 0.5) * 2;

    parallaxState.targetX = x * intensity;
    parallaxState.targetY = y * intensity;
    requestParallaxFrame();
  };

  const stopDrift = () => {
    if (!parallaxState.driftFrame) return;
    window.cancelAnimationFrame(parallaxState.driftFrame);
    parallaxState.driftFrame = 0;
  };

  const runTouchDrift = () => {
    if (hasFinePointer.matches || parallaxState.driftFrame || !shouldRunParallax()) return;

    const step = (timestamp) => {
      if (hasFinePointer.matches || !shouldRunParallax()) {
        stopDrift();
        return;
      }

      if (timestamp - parallaxState.lastDriftAt >= PARALLAX_DRIFT_INTERVAL) {
        driftAngle += 0.018;
        parallaxState.targetX = Math.sin(driftAngle) * 3.2;
        parallaxState.targetY = Math.cos(driftAngle * 0.8) * 2.6;
        parallaxState.lastDriftAt = timestamp;
        requestParallaxFrame();
      }

      parallaxState.driftFrame = window.requestAnimationFrame(step);
    };

    parallaxState.driftFrame = window.requestAnimationFrame(step);
  };

  const resetParallax = () => {
    parallaxState.targetX = 0;
    parallaxState.targetY = 0;
    requestParallaxFrame();
  };

  window.addEventListener("pointermove", (event) => {
    stopDrift();
    applyParallaxTarget(event.clientX, event.clientY);
  });

  window.addEventListener("touchmove", (event) => {
    if (!shouldRunParallax()) return;

    const touch = event.touches[0];
    if (!touch) return;

    stopDrift();
    applyParallaxTarget(touch.clientX, touch.clientY, 7);
  }, { passive: true });

  window.addEventListener("deviceorientation", (event) => {
    if (!shouldRunParallax() || hasFinePointer.matches) return;
    if (typeof event.gamma !== "number" || typeof event.beta !== "number") return;

    stopDrift();
    parallaxState.targetX = Math.max(-6, Math.min(6, event.gamma / 3));
    parallaxState.targetY = Math.max(-5, Math.min(5, (event.beta - 45) / 6));
    requestParallaxFrame();
  });

  window.addEventListener("pointerleave", resetParallax);
  window.addEventListener("blur", resetParallax);
  hasFinePointer.addEventListener("change", () => {
    if (hasFinePointer.matches) {
      stopDrift();
      resetParallax();
      return;
    }

    runTouchDrift();
  });

  runTouchDrift();
  resetParallax();
}

function syncPreferencesUI() {
  state.preferences.theme = normalizeTheme(state.preferences.theme);
  document.getElementById("theme-select").value = state.preferences.theme;
  document.getElementById("option-animations").checked = state.preferences.animations;
  document.getElementById("option-sound").checked = state.preferences.alarmSound;
  applyTheme(state.preferences.theme);
  document.body.classList.toggle("reduced-motion", !state.preferences.animations);
  if (!shouldRunParallax()) {
    parallaxState.targetX = 0;
    parallaxState.targetY = 0;
    parallaxState.currentX = 0;
    parallaxState.currentY = 0;
    setParallaxVars();
  }
  requestParallaxFrame();
  updateInstallStatus();
  syncPandoraMusicThemeState();
}

function syncStandaloneModeClass() {
  const standaloneMedia = window.matchMedia("(display-mode: standalone)");
  const isStandalone =
    standaloneMedia.matches ||
    window.navigator.standalone === true;

  document.documentElement.classList.toggle("pwa-installed", isStandalone);
  document.body.classList.toggle("pwa-installed", isStandalone);
}

function bindStandaloneOverscrollGuard() {
  let touchStartY = 0;

  function findScrollableElement(target) {
    const path = typeof target.composedPath === "function" ? target.composedPath() : [];
    const nodes = path.length ? path : [target.target];

    return nodes.find((node) => {
      if (!(node instanceof Element)) return false;
      const style = window.getComputedStyle(node);
      return /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    }) || document.scrollingElement;
  }

  document.addEventListener(
    "touchstart",
    (event) => {
      touchStartY = event.touches[0]?.clientY || 0;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchmove",
    (event) => {
      if (!document.documentElement.classList.contains("pwa-installed")) return;

      const scrollable = findScrollableElement(event);
      if (!scrollable) return;

      const deltaY = (event.touches[0]?.clientY || 0) - touchStartY;
      const atTop = scrollable.scrollTop <= 0;
      const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;

      if ((deltaY > 0 && atTop) || (deltaY < 0 && atBottom)) {
        event.preventDefault();
      }
    },
    { passive: false }
  );
}

async function init() {
  syncStandaloneModeClass();
  bindStandaloneOverscrollGuard();
  loadState();
  setupPandoraMusic();
  bindNavigation();
  bindStaticEvents();
  bindPwaEvents();
  bindBackgroundParallax();
  syncPreferencesUI();
  updateClock();
  setInterval(updateClock, 1000);
  refreshDashboard();
  renderScheduleGrid();
  renderReminders();
  renderAlarms();
  renderProfileAvatar();
  registerServiceWorker();
  setupPasswordResetMode();
  if (!passwordResetToken && await refreshAuthSession()) {
    await syncStateFromServer();
  }
}


let runtimeReady = null;

export async function initRuntime() {
if (!runtimeReady) {
  runtimeReady = init();
}

return runtimeReady;
}

export function getCurrentUser() {
return isAuthenticated ? { name: "Duda" } : null;
}

export function requireAuth() {
if (!isAuthenticated) {
  lockApp();
  return false;
}

return true;
}

export {
addTimeRow,
closeModal,
deleteAlarm,
deleteReminder,
getItem,
handleProfilePhotoChange,
initRuntime as initStorage,
loadState as loadAppState,
logout,
openAddAlarmModal,
openAddReminderModal,
openAddSubjectModal,
openModal,
removeItem,
removeSubjectFromCell,
removeTimeRow,
renderAlarms,
renderProfileAvatar,
renderReminders,
renderScheduleGrid,
saveAlarm,
saveReminder,
saveState as saveAppState,
saveSubject,
setItem,
showToast,
syncPreferencesUI,
toggleAlarm,
toggleReminder
};
