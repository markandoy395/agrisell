const { createInterface } = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
const { hashPassword } = require('../services/passwordService');

const run = async () => {
  const readline = createInterface({ input, output });
  const password = await readline.question('Admin password to hash: ');

  readline.close();

  if (!password) {
    throw new Error('Password is required.');
  }

  const hash = await hashPassword(password);

  console.log('\nADMIN_PASSWORD_HASH=');
  console.log(hash);
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
