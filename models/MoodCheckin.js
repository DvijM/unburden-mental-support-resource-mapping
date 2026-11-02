'use strict';

const mongoose = require('mongoose');

const moodCheckinSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: 'Mood rating must be an integer between 1 and 5.',
      },
    },
    label: {
      type: String,
      enum: ['Very low', 'Low', 'Neutral', 'Good', 'Very good'],
      required: true,
    },
    note: {
      type: String,
      trim: true,
      default: '',
      maxlength: 300,
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
  { timestamps: true, collection: 'mood_checkins' }
);

moodCheckinSchema.index({ user: 1, timestamp: -1 });
moodCheckinSchema.index({ timestamp: -1 });

module.exports = mongoose.model('MoodCheckin', moodCheckinSchema);

