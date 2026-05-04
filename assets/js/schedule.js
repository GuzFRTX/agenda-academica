import {
  addTimeRow,
  initRuntime,
  openAddSubjectModal,
  removeSubjectFromCell,
  removeTimeRow,
  renderScheduleGrid,
  saveSubject
} from "./storage.js";

export function initSchedule() {
  void initRuntime();
}

export {
  addTimeRow,
  openAddSubjectModal,
  removeSubjectFromCell,
  removeTimeRow,
  renderScheduleGrid,
  saveSubject
};
