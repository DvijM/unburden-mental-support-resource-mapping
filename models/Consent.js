'use strict';

const mongoose = require('mongoose');

const CONSENT_CATEGORIES = [
  'account',
  'assessment_storage',
  'mood_tracking',
  'activity_history',
  'responder_sharing',
  'research_analytics',
];

const consentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: {
      type: String,
      enum: CONSENT_CATEGORIES,
      required: true,
    },
    status: {
      type: String,
      enum: ['granted', 'revoked'],
      required: true,
    },
    policyVersion: {
      type: String,
      default: '2.0',
      required: true,
    },
    disclosureText: {
      type: String,
      required: true,
      trim: true,
    },
    grantedAt: {
      type: Date,
      default: Date.now,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { timestamps: true, collection: 'consents' }
);

consentSchema.index({ user: 1, category: 1, timestamp: -1 });

module.exports = mongoose.model('Consent', consentSchema);

