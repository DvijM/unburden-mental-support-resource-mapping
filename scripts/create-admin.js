'use strict';

require('dotenv').config();
const readline = require('readline');
const mongoose = require('mongoose');
const User = require('../models/User');
const Consent = require('../models/Consent');
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
  const email = (process.env.INITIAL_ADMIN_EMAIL || process.env.ADMIN_EMAIL || arg('email') || '').trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || arg('password') || '';
  const forceReset = process.argv.includes('--force-reset');

  if (!email || !EMAIL_RE.test(email)) {
    console.error('Error: INITIAL_ADMIN_EMAIL must be a valid email set in .env or passed via --email.');
    process.exit(1);
  }

  if (!password || password.length < 12) {
    console.error('Error: INITIAL_ADMIN_PASSWORD must be at least 12 characters long (set in .env or via --password).');
    process.exit(1);
  }

  let name = (arg('name') || process.env.INITIAL_ADMIN_NAME || process.env.ADMIN_NAME || '').trim();
  if (!name) {
    if (process.stdin.isTTY) {
      name = await prompt('Super Admin name [Super Administrator]: ');
    }
    if (!name) name = 'Super Administrator';
  }

  await connectDB();

  const existing = await User.findOne({ email }).select('+salt +hash');

  if (existing) {
    if (existing.role === 'super_admin' && !forceReset) {
      console.log(`Super administrator "${email}" already exists. Skipping credential overwrite (idempotent).`);
    } else {
      existing.role = 'super_admin';
      if (forceReset) {
        const { salt, hash } = await hashPassword(password);
        existing.salt = salt;
        existing.hash = hash;
      }
      await existing.save();
      console.log(`Ensured user "${email}" holds role "super_admin".`);
    }
  } else {
    const { salt, hash } = await hashPassword(password);
    const adminUser = await User.create({
      name,
      email,
      role: 'super_admin',
      accountStatus: 'active',
      emailVerified: true,
      salt,
      hash,
      consentAt: new Date(),
    });
    await Consent.create({
      user: adminUser._id,
      category: 'account',
      status: 'granted',
      policyVersion: '2.0',
      disclosureText: 'Initial super_admin account provisioning via CLI script.',
    });
    console.log(`Successfully provisioned initial super administrator "${email}" (role: super_admin).`);
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error('Failed to provision administrator:', err.message);
  process.exit(1);
});
