const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(crypto.scrypt);
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_PREFIX = 'scrypt';

const safeCompare = (leftValue, rightValue) => {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);

  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }

  return crypto.timingSafeEqual(left, right);
};

const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH);

  return [
    SCRYPT_PREFIX,
    salt.toString('base64url'),
    Buffer.from(key).toString('base64url'),
  ].join(':');
};

const verifyPasswordHash = async (password, storedHash) => {
  const [prefix, saltValue, keyValue] = storedHash.split(':');

  if (prefix !== SCRYPT_PREFIX || !saltValue || !keyValue) {
    return false;
  }

  const salt = Buffer.from(saltValue, 'base64url');
  const storedKey = Buffer.from(keyValue, 'base64url');
  const derivedKey = await scryptAsync(password, salt, storedKey.length);

  return crypto.timingSafeEqual(Buffer.from(derivedKey), storedKey);
};

module.exports = { hashPassword, safeCompare, verifyPasswordHash };
