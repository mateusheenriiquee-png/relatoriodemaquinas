const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
process.chdir(projectRoot);

function stripAssetsFromJsonc(filePath) {
  if (!fs.existsSync(filePath)) return;
  let raw = fs.readFileSync(filePath, "utf8");
  raw = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const config = JSON.parse(raw);
  delete config.assets;
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
}

function stripAssetsFromToml(filePath) {
  if (!fs.existsSync(filePath)) return;
  const toml = fs.readFileSync(filePath, "utf8");
  const cleaned = toml.replace(/\r?\n\[assets\][\s\S]*?(?=\r?\n\[|\r?\n*$)/g, "\n");
  if (cleaned !== toml) {
    fs.writeFileSync(filePath, cleaned);
  }
}

// O painel Cloudflare (fluxo Worker+Git) pode gerar wrangler.jsonc com "assets".
stripAssetsFromJsonc(path.join(projectRoot, "wrangler.jsonc"));
stripAssetsFromToml(path.join(projectRoot, "wrangler.toml"));

execSync("wrangler pages deploy public --project-name=suportetecnico-api", {
  stdio: "inherit",
  env: process.env
});
