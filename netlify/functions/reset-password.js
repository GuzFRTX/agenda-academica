const { Pool } = require("pg");
const { hashPassword, verifyPasswordResetToken } = require("./_auth");

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

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if (!process.env.DATABASE_URL) return json(500, { error: "DATABASE_URL is not configured." });

  const { token = "", newPassword = "" } = JSON.parse(event.body || "{}");
  if (!verifyPasswordResetToken(String(token))) {
    return json(401, { error: "Invalid reset token." });
  }
  if (String(newPassword).length < 10) {
    return json(400, { error: "Password must have at least 10 characters." });
  }

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO public.app_auth_settings (key, value, updated_at)
       VALUES ('password_hash', $1, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [hashPassword(String(newPassword))]
    );
    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: "Password reset failed." });
  } finally {
    client.release();
  }
};
