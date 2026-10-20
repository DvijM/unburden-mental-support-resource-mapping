'use strict';
 
const crypto = require('crypto');
const { promisify } = require('util');
 
const scrypt = promisify(crypto.scrypt);
 
async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = (await scrypt(password, salt, 64)).toString('hex');
  return { salt, hash };
}
 
async function verifyPassword(password, salt, expectedHex) {
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
 
module.exports = { hashPassword, verifyPassword };