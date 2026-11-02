'use strict';

const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema(
  {
    itemId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    kind: {
      type: String,
      enum: ['resource', 'soundtrack'],
      required: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    categoryLabel: {
      type: String,
      default: '',
    },
    badge: {
      type: String,
      default: '',
    },
    format: {
      type: String,
      default: 'Full Publication',
    },
    readTime: {
      type: String,
      default: '',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    author: {
      type: String,
      default: '',
    },
    institution: {
      type: String,
      default: '',
    },
    citation: {
      type: String,
      default: '',
    },
    summary: {
      type: String,
      default: '',
    },
    takeaways: {
      type: [String],
      default: [],
    },
    sections: {
      type: [
        {
          heading: String,
          content: String,
        },
      ],
      default: [],
    },
    file: {
      type: String,
      default: '',
    },
    defaultVolume: {
      type: Number,
      default: 0.7,
    },
    palette: {
      type: String,
      default: '',
    },
    accent: {
      type: String,
      default: '',
    },
    published: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true, collection: 'content' }
);

contentSchema.index({ kind: 1, category: 1 });

module.exports = mongoose.model('Content', contentSchema);

