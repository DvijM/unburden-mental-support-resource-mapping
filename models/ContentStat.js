'use strict';

const mongoose = require('mongoose');

const contentStatSchema = new mongoose.Schema(
  {
    itemType: {
      type: String,
      enum: ['soundtrack', 'resource'],
      required: true,
    },
    itemId: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    totalCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    dailyCounts: [
      {
        date: { type: String, required: true }, // YYYY-MM-DD
        count: { type: Number, default: 0 },
      },
    ],
    recentSessionHashes: [
      {
        hash: String,
        at: Date,
      },
    ],
    lastEventAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true, collection: 'content_stats' }
);

contentStatSchema.index({ itemType: 1, itemId: 1 }, { unique: true });
contentStatSchema.index({ itemType: 1, totalCount: -1 });

module.exports = mongoose.model('ContentStat', contentStatSchema);

