const crypto = require("crypto");

const SESSION_COOKIE = "dudas_agenda_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const RESET_TTL_SECONDS = 60 * 20;
const APP_USER_ID = "11111111-1111-4111-8111-111111111111";

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(value) {
  return crypto
    .createHmac("sha256", getAuthSecret())
    .update(value)
    .digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getAuthSecret() {
  const secret = process.env.APP_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("APP_AUTH_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function createSessionToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    sub: APP_USER_ID,
    iat: now,
    exp: now + SESSION_TTL_SECONDS
  }));
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  const expected = sign(payload);

  if (!safeEqual(signature, expected)) {
    return false;
  }

  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return data.sub === APP_USER_ID && data.exp > Math.floor(Date.now() / 1000);
}

function createPasswordResetToken() {
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString("base64url");
  const payload = base64url(JSON.stringify({
    sub: APP_USER_ID,
    purpose: "password-reset",
    nonce,
    iat: now,
    exp: now + RESET_TTL_SECONDS
  }));
  return `${payload}.${sign(payload)}`;
}

function verifyPasswordResetToken(token) {
  if (!token || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  const expected = sign(payload);

  if (!safeEqual(signature, expected)) return false;

  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return (
    data.sub === APP_USER_ID &&
    data.purpose === "password-reset" &&
    data.exp > Math.floor(Date.now() / 1000)
  );
}

function getCookieSecurityAttribute(event) {
  const headers = event?.headers || {};
  const protocol = String(headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "").toLowerCase();
  const host = String(headers.host || headers.Host || "").toLowerCase();
  const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");

  if (protocol === "http" && isLocalhost) return "";
  return "; Secure";
}

function getSessionCookieHeader(event) {
  return `${SESSION_COOKIE}=${createSessionToken()}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly${getCookieSecurityAttribute(event)}; SameSite=Strict`;
}

function getClearSessionCookieHeader(event) {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly${getCookieSecurityAttribute(event)}; SameSite=Strict`;
}

function isAuthenticated(event) {
  const cookies = parseCookies(event.headers.cookie || event.headers.Cookie || "");
  try {
    return verifySessionToken(cookies[SESSION_COOKIE]);
  } catch (error) {
    return false;
  }
}

function verifyPassword(password) {
  return verifyPasswordHash(password, process.env.APP_LOGIN_PASSWORD_HASH || "");
}

function verifyPasswordHash(password, encoded) {
  const [algorithm, iterations, salt, expectedHash] = encoded.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterations || !salt || !expectedHash) {
    throw new Error("APP_LOGIN_PASSWORD_HASH is not configured.");
  }

  const actualHash = crypto
    .pbkdf2Sync(password, salt, Number(iterations), 32, "sha256")
    .toString("base64url");

  return safeEqual(actualHash, expectedHash);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const iterations = 210000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

module.exports = {
  APP_USER_ID,
  createPasswordResetToken,
  getSessionCookieHeader,
  getClearSessionCookieHeader,
  hashPassword,
  isAuthenticated,
  verifyPassword,
  verifyPasswordHash,
  verifyPasswordResetToken
};
