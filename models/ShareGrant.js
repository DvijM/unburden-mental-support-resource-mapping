'use strict';

const mongoose = require('mongoose');

const shareGrantSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    responder: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['active', 'revoked', 'expired', 'pending'],
      default: 'active',
      required: true,
    },
    categories: {
      basic_profile: { type: Boolean, default: true },
      assessment_results: { type: Boolean, default: false },
      assessment_history: { type: Boolean, default: false },
      mood_checkins: { type: Boolean, default: false },
      activity_history: { type: Boolean, default: false },
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    lastAccessedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 300,
    },
  },
  { timestamps: true, collection: 'share_grants' }
);

shareGrantSchema.index({ user: 1, responder: 1 });
shareGrantSchema.index({ responder: 1, status: 1 });

module.exports = mongoose.model('ShareGrant', shareGrantSchema);

