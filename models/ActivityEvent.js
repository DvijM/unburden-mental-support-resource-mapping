'use strict';

const mongoose = require('mongoose');

const activityEventSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    sessionHash: {
      type: String,
      default: null,
    },
    eventType: {
      type: String,
      enum: ['sound_play', 'resource_view', 'assessment_completed', 'mood_checkin', 'helpline_lookup'],
      required: true,
    },
    itemId: {
      type: String,
      required: true,
      trim: true,
    },
    itemTitle: {
      type: String,
      default: '',
      trim: true,
    },
    consentRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consent',
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { timestamps: true, collection: 'activity_events' }
);

activityEventSchema.index({ user: 1, timestamp: -1 });
activityEventSchema.index({ eventType: 1, timestamp: -1 });

module.exports = mongoose.model('ActivityEvent', activityEventSchema);

