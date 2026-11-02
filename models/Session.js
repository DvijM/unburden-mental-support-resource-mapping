'use strict';

const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    csrfToken: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: ['user', 'responder', 'analyst', 'content_editor', 'super_admin', 'admin'],
      required: true,
    },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'sessions' }
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ user: 1 });

module.exports = mongoose.model('Session', sessionSchema);
