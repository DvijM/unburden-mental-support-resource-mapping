'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
const { connectDB } = require('../db');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

(async () => {
  if (!fs.existsSync(USERS_FILE)) {
    console.log('No data/users.json file found. Nothing to import.');
    process.exit(0);
  }

  let raw = '';
  try {
    raw = fs.readFileSync(USERS_FILE, 'utf8');
  } catch (err) {
    console.error('Could not read data/users.json:', err.message);
    process.exit(1);
  }

  let legacyUsers = [];
  try {
    legacyUsers = JSON.parse(raw);
    if (!Array.isArray(legacyUsers)) {
      throw new Error('users.json must contain an array of user objects.');
    }
  } catch (err) {
    console.error('Failed to parse data/users.json:', err.message);
    process.exit(1);
  }

  await connectDB();

  let imported = 0;
  let skipped = 0;
  let updated = 0;

  for (const u of legacyUsers) {
    const email = typeof u.email === 'string' ? u.email.trim().toLowerCase() : '';
    const name = typeof u.name === 'string' ? u.name.trim() : '';
    const salt = u.salt || u.passwordSalt;
    const hash = u.hash || u.passwordHash;

    if (!email || !name || !salt || !hash) {
      console.warn(`Skipping incomplete record: ${JSON.stringify(u)}`);
      skipped += 1;
      continue;
    }

    try {
      const existing = await User.findOne({ email });
      if (existing) {
        // Already exists in MongoDB
        updated += 1;
      } else {
        await User.create({
          name,
          email,
          phone: null,
          age: null,
          country: null,
          role: u.role === 'admin' ? 'admin' : 'user',
          salt,
          hash,
          screeningScore: typeof u.screeningScore === 'number' ? u.screeningScore : null,
          consentAt: u.consentAt ? new Date(u.consentAt) : null,
          createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
        });
        imported += 1;
      }
    } catch (err) {
      console.warn(`Failed to import user "${email}": ${err.message}`);
      skipped += 1;
    }
  }

  console.log(`\nImport Summary:`);
  console.log(`- Total records in users.json: ${legacyUsers.length}`);
  console.log(`- Newly imported: ${imported}`);
  console.log(`- Already existed: ${updated}`);
  console.log(`- Skipped/failed: ${skipped}`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error('Import script failed:', err);
  process.exit(1);
});
