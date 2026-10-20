'use strict';

require('dotenv').config();
const readline = require('readline');
const mongoose = require('mongoose');
const User = require('../models/User');
const { hashPassword } = require('../lib/password');
const { connectDB } = require('../db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

(async () => {
  const email = (process.env.ADMIN_EMAIL || arg('email') || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || arg('password') || '';

  if (!email || !EMAIL_RE.test(email)) {
    console.error('Error: ADMIN_EMAIL must be a valid email set in .env or passed via --email.');
    process.exit(1);
  }

  if (!password || password.length < 12) {
    console.error('Error: ADMIN_PASSWORD must be at least 12 characters long (set in .env or via --password).');
    process.exit(1);
  }

  let name = (arg('name') || process.env.ADMIN_NAME || '').trim();
  if (!name) {
    if (process.stdin.isTTY) {
      name = await prompt('Admin name [Administrator]: ');
    }
    if (!name) name = 'Administrator';
  }

  await connectDB();

  const { salt, hash } = await hashPassword(password);
  const existing = await User.findOne({ email }).select('+salt +hash');

  if (existing) {
    existing.name = name || existing.name;
    existing.role = 'admin';
    existing.salt = salt;
    existing.hash = hash;
    await existing.save();
    console.log(`Successfully promoted existing user "${email}" to administrator (role: admin).`);
  } else {
    await User.create({
      name,
      email,
      role: 'admin',
      salt,
      hash,
      consentAt: new Date(),
    });
    console.log(`Successfully created new administrator "${email}" (role: admin).`);
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error('Failed to create or promote administrator:', err.message);
  process.exit(1);
});