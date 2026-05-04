import { initAuth } from "./auth.js";
import { initTheme } from "./theme.js";
import { initProfile } from "./profile.js";
import { initTasks } from "./tasks.js";
import { initSchedule } from "./schedule.js";
import { initReminders } from "./reminders.js";
import { initAlarms } from "./alarms.js";
import { initPWA } from "./pwa.js";
import { initUI } from "./ui.js";

document.addEventListener("DOMContentLoaded", async () => {
  await initAuth();
  initTheme();
  initProfile();
  initTasks();
  initSchedule();
  initReminders();
  initAlarms();
  initPWA();
  initUI();
});
