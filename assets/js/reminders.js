import {
  deleteReminder,
  initRuntime,
  openAddReminderModal,
  renderReminders,
  saveReminder,
  toggleReminder
} from "./storage.js";

export function initReminders() {
  void initRuntime();
}

export {
  deleteReminder,
  openAddReminderModal,
  renderReminders,
  saveReminder,
  toggleReminder
};
