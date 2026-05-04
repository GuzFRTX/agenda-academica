const crypto = require("crypto");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.stdoutMuted = false;
rl._writeToOutput = function writeToOutput(stringToWrite) {
  this.output.write(this.stdoutMuted ? "*" : stringToWrite);
};

rl.question("Senha do app: ", (password) => {
  rl.stdoutMuted = false;
  rl.output.write("\n");
  const salt = crypto.randomBytes(16).toString("base64url");
  const iterations = 210000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url");
  console.log(`APP_LOGIN_PASSWORD_HASH=\"pbkdf2_sha256$${iterations}$${salt}$${hash}\"`);
  rl.close();
});

rl.stdoutMuted = true;
