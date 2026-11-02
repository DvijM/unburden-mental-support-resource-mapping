'use strict';

const mongoose = require('mongoose');
const countries = require('../data/countries.json');

const COUNTRY_CODES = new Set(countries.map((c) => c.code));
const PHONE_RE = /^\+[0-9]{8,15}$/;
const ROLES = ['user', 'responder', 'analyst', 'content_editor', 'super_admin', 'admin'];

const userSchema = new mongoose.Schema(
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
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: function (v) {
          if (v === null || v === undefined || v === '') return true;
          return PHONE_RE.test(v);
        },
        message: 'Phone number must begin with "+" followed by 8 to 15 digits.',
      },
    },
    age: {
      type: Number,
      default: null,
      validate: {
        validator: function (v) {
          if (v === null || v === undefined) return true;
          return Number.isInteger(v) && v >= 13 && v <= 120;
        },
        message: 'Age must be an integer between 13 and 120.',
      },
    },
    country: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      validate: {
        validator: function (v) {
          if (v === null || v === undefined || v === '') return true;
          return COUNTRY_CODES.has(v);
        },
        message: 'Country must be a valid ISO 3166-1 alpha-2 code.',
      },
    },
    preferredLanguage: {
      type: String,
      trim: true,
      default: 'en',
      maxlength: 10,
    },
    role: {
      type: String,
      enum: ROLES,
      default: 'user',
      required: true,
    },
    organisation: {
      type: String,
      trim: true,
      default: '',
      maxlength: 150,
    },
    designation: {
      type: String,
      trim: true,
      default: '',
      maxlength: 150,
    },
    accountStatus: {
      type: String,
      enum: ['active', 'suspended', 'pending_verification', 'deleted'],
      default: 'active',
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    profileCompleted: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    consentSummary: {
      account: { type: Boolean, default: true },
      assessment_storage: { type: Boolean, default: false },
      mood_tracking: { type: Boolean, default: false },
      activity_history: { type: Boolean, default: false },
      responder_sharing: { type: Boolean, default: false },
      research_analytics: { type: Boolean, default: false },
    },
    consentPolicyVersion: {
      type: String,
      default: '2.0',
    },
    salt: {
      type: String,
      required: true,
      select: false,
    },
    hash: {
      type: String,
      required: true,
      select: false,
    },
    resetTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    resetTokenExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    screeningScore: {
      type: Number,
      default: null,
      min: 0,
      max: 27,
    },
    gad7Score: {
      type: Number,
      default: null,
      min: 0,
      max: 21,
    },
    who5Score: {
      type: Number,
      default: null,
      min: 0,
      max: 25,
    },
    consentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true, collection: 'users' }
);

userSchema.index({ role: 1 });
userSchema.index({ country: 1 });

module.exports = mongoose.model('User', userSchema);
