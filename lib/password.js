const crypto = require('node:crypto');
const scrypt = (pw, salt) => new Promise((resolve, reject) => crypto.scrypt(pw, salt, 64,
  { N: 16384, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key)));
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return `s1$${salt.toString('base64')}$${(await scrypt(password, salt)).toString('base64')}`;
}
async function checkPassword(password, stored) {
  const [version, salt, key] = String(stored).split('$');
  if (version !== 's1' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
module.exports = { hashPassword, checkPassword };
