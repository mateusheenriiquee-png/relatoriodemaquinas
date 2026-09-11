const { execSync } = require("child_process");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
process.chdir(repoRoot);

// O wrangler.toml vive em config/, não na raiz. Antes o caminho estava
// como "wrangler.toml" e o deploy falhava sem nunca chegar a subir nada.
const configPath = path.join("config", "wrangler.toml");

execSync(`npx wrangler deploy --config ${configPath} --env="" --keep-vars`, {
  stdio: "inherit",
  env: process.env
});
