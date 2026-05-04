import { getCurrentUser, initRuntime, logout, requireAuth } from "./storage.js";

export async function initAuth() {
  await initRuntime();
}

export { getCurrentUser, logout, requireAuth };
