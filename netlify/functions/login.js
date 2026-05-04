const { getSessionCookieHeader, verifyPasswordHash } = require("./_auth");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  try {
    const { password = "" } = JSON.parse(event.body || "{}");
    await new Promise((resolve) => setTimeout(resolve, 250));

    const hash = await getPasswordHash();

    if (!verifyPasswordHash(String(password), hash)) {
      return json(401, { error: "Invalid password." });
    }

    return json(200, { authenticated: true }, {
      "Set-Cookie": getSessionCookieHeader(event)
    });
  } catch (error) {
    return json(500, { error: "Login failed." });
  }
};

async function getPasswordHash() {
  if (!process.env.DATABASE_URL) return process.env.APP_LOGIN_PASSWORD_HASH || "";

  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT value FROM public.app_auth_settings WHERE key = 'password_hash'"
    );
    return result.rows[0]?.value || process.env.APP_LOGIN_PASSWORD_HASH || "";
  } catch (error) {
    return process.env.APP_LOGIN_PASSWORD_HASH || "";
  } finally {
    client.release();
  }
}
