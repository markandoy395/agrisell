const fs = require('node:fs');
const path = require('node:path');

const unquoteValue = (value) => {
  const trimmedValue = value.trim();
  const firstCharacter = trimmedValue.at(0);
  const lastCharacter = trimmedValue.at(-1);

  if (
    trimmedValue.length >= 2 &&
    ((firstCharacter === '"' && lastCharacter === '"') ||
      (firstCharacter === "'" && lastCharacter === "'"))
  ) {
    return trimmedValue.slice(1, -1);
  }

  return trimmedValue;
};

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;

  const fileContent = fs.readFileSync(filePath, 'utf8');

  fileContent.split(/\r?\n/).forEach((line) => {
    const trimmedLine = line.replace(/^\uFEFF/, '').trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) return;

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex === -1) return;

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = unquoteValue(trimmedLine.slice(separatorIndex + 1));

    if (!key || process.env[key] !== undefined) return;

    process.env[key] = value;
  });
};

const loadBackendLocalEnv = () => {
  loadEnvFile(path.resolve(__dirname, '../../.env.local'));
};

module.exports = { loadBackendLocalEnv, loadEnvFile };
