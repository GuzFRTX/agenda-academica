const nodemailer = require("nodemailer");
const { createPasswordResetToken } = require("./_auth");

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

function getOrigin(event) {
  const host = event.headers["x-forwarded-host"] || event.headers.host;
  const protocol = event.headers["x-forwarded-proto"] || "https";
  return `${protocol}://${host}`;
}

async function sendResetEmail(to, resetUrl) {
  const user = process.env.GMAIL_SMTP_USER;
  const pass = process.env.GMAIL_SMTP_APP_PASSWORD;
  const from = process.env.PASSWORD_RESET_EMAIL_FROM || `Duda Agenda <${user}>`;

  if (!user || !pass || !to) {
    return {
      ok: false,
      configured: false,
      error: "Gmail SMTP não configurado no servidor."
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass }
    });

    await transporter.sendMail({
      from,
      to,
      subject: "Redefinir senha da Duda's Agenda",
      text: `Use este link para redefinir a senha da agenda: ${resetUrl}\n\nO link expira em 20 minutos.`,
      html: `<p>Use este link para redefinir a senha da agenda:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>O link expira em 20 minutos.</p>`
    });

    return { ok: true, configured: true };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: getMailErrorMessage(error)
    };
  }
}

function getMailErrorMessage(error) {
  if (error?.code === "EAUTH" || error?.responseCode === 535) {
    return "Gmail recusou o login SMTP. Confira o email e a senha de app.";
  }

  if (error?.code === "ECONNECTION" || error?.code === "ETIMEDOUT") {
    return "Não foi possível conectar ao Gmail SMTP.";
  }

  return "Gmail SMTP rejeitou o envio do email.";
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  const token = createPasswordResetToken();
  const resetUrl = `${getOrigin(event)}/?reset_token=${encodeURIComponent(token)}`;
  const result = await sendResetEmail(process.env.PASSWORD_RESET_EMAIL_TO, resetUrl);

  if (!result.configured) {
    return json(200, {
      ok: true,
      emailConfigured: false,
      error: result.error
    });
  }

  if (!result.ok) {
    return json(502, {
      ok: false,
      emailConfigured: true,
      error: result.error
    });
  }

  return json(200, {
    ok: true,
    emailConfigured: true
  });
};
