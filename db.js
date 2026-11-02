'use strict';

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/unburden';

let cached = global.__unburdenMongoCache;
if (!cached) {
  cached = global.__unburdenMongoCache = { conn: null, promise: null, seeded: false };
}

async function connectDB(uriOverride) {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }
  const uri = uriOverride || process.env.MONGODB_URI || MONGODB_URI;
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10,
      })
      .then((m) => m.connection)
      .catch((err) => {
        cached.promise = null;
        throw err;
      });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

function resetCache() {
  cached.conn = null;
  cached.promise = null;
  cached.seeded = false;
}

module.exports = { connectDB, MONGODB_URI, cached, resetCache };
