'use strict';

const mongoose = require('mongoose');
const countries = require('../data/countries.json');

const COUNTRY_CODES = new Set(countries.map((c) => c.code));
const PHONE_RE = /^\+[0-9]{8,15}$/;

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
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
      required: true,
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
    screeningScore: {
      type: Number,
      default: null,
      min: 0,
      max: 27,
      validate: {
        validator: function (v) {
          if (v === null || v === undefined) return true;
          return Number.isInteger(v) && v >= 0 && v <= 27;
        },
        message: 'Screening score must be an integer between 0 and 27.',
      },
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
      default: null,
    },
  },
  { timestamps: true, collection: 'users' }
);

module.exports = mongoose.model('User', userSchema);