import { closeModal, initRuntime, openModal, showToast } from "./storage.js";

export function initUI() {
  void initRuntime();
}

export { closeModal, openModal, showToast };
