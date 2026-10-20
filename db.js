'use strict';

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/unburden';

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`Connected to MongoDB at ${MONGODB_URI}`);
  } catch (err) {
    console.error('Failed to connect to MongoDB. Please ensure the mongod service is running (e.g. run "net start MongoDB" or "mongod").');
    console.error('Connection error:', err.message);
    process.exit(1);
  }
}

module.exports = { connectDB, MONGODB_URI };
