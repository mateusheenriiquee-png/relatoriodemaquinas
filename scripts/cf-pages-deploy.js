const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
process.chdir(projectRoot);

const workerConfig = {
  name: "suportetecnico-api",
  main: "worker/index.js",
  compatibility_date: "2024-11-12",
  compatibility_flags: ["nodejs_compat"],
  keep_vars: true,
  assets: {
    directory: "./public",
    binding: "ASSETS"
  }
};

// Projeto no painel e Worker (workers/services), nao Pages — usar wrangler deploy.
fs.writeFileSync(
  path.join(projectRoot, "wrangler.jsonc"),
  `${JSON.stringify(workerConfig, null, 2)}\n`
);

execSync("wrangler deploy --yes --keep-vars", {
  stdio: "inherit",
  env: process.env
});
