const { getClearSessionCookieHeader } = require("./_auth");

exports.handler = async (event) => ({
  statusCode: 200,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Set-Cookie": getClearSessionCookieHeader(event)
  },
  body: JSON.stringify({ authenticated: false })
});
