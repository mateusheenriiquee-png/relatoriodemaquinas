const { execSync } = require("child_process");
const path = require("path");

process.chdir(path.resolve(__dirname, ".."));

execSync("npx wrangler deploy --config wrangler.toml --keep-vars", {
  stdio: "inherit",
  env: process.env
});
