'use strict';

const mongoose = require('mongoose');
const countries = require('../data/countries.json');

const COUNTRY_CODES = new Set(countries.map((c) => c.code));

const supportRequestSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    age: {
      type: Number,
      required: true,
      min: 13,
      max: 120,
    },
    country: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    helplineName: {
      type: String,
      required: true,
      trim: true,
    },
    helplineContact: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true, collection: 'support_requests' }
);

module.exports = mongoose.model('SupportRequest', supportRequestSchema);
