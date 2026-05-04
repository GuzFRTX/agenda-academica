const { isAuthenticated } = require("./_auth");

exports.handler = async (event) => ({
  statusCode: 200,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  },
  body: JSON.stringify({ authenticated: isAuthenticated(event) })
});
