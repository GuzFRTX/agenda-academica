const { Pool } = require("pg");
const { hashPassword, isAuthenticated, verifyPasswordHash } = require("./_auth");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(body)
  };
}

function validateNewPassword(password) {
  return typeof password === "string" && password.length >= 10;
}

async function getPasswordHash(client) {
  const result = await client.query(
    "SELECT value FROM public.app_auth_settings WHERE key = 'password_hash'"
  );
  return result.rows[0]?.value || process.env.APP_LOGIN_PASSWORD_HASH || "";
}

async function setPasswordHash(client, passwordHash) {
  await client.query(
    `INSERT INTO public.app_auth_settings (key, value, updated_at)
     VALUES ('password_hash', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [passwordHash]
  );
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if (!isAuthenticated(event)) return json(401, { error: "Unauthorized." });
  if (!process.env.DATABASE_URL) return json(500, { error: "DATABASE_URL is not configured." });

  const { currentPassword = "", newPassword = "" } = JSON.parse(event.body || "{}");
  if (!validateNewPassword(newPassword)) {
    return json(400, { error: "Password must have at least 10 characters." });
  }

  const client = await pool.connect();
  try {
    const currentHash = await getPasswordHash(client);
    if (!verifyPasswordHash(String(currentPassword), currentHash)) {
      return json(401, { error: "Invalid current password." });
    }

    await setPasswordHash(client, hashPassword(String(newPassword)));
    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: "Password change failed." });
  } finally {
    client.release();
  }
};
