import {
  deleteAlarm,
  initRuntime,
  openAddAlarmModal,
  renderAlarms,
  saveAlarm,
  toggleAlarm
} from "./storage.js";

export function initAlarms() {
  void initRuntime();
}

export {
  deleteAlarm,
  openAddAlarmModal,
  renderAlarms,
  saveAlarm,
  toggleAlarm
};
