'use strict';

const mongoose = require('mongoose');

const helplineSchema = new mongoose.Schema(
  {
    helplineId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    organisationName: {
      type: String,
      required: true,
      trim: true,
    },
    countryName: {
      type: String,
      required: true,
      trim: true,
    },
    countryCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    regions: {
      type: [String],
      default: ['global'],
    },
    categories: {
      type: [String],
      default: ['crisis'],
    },
    badge: {
      type: String,
      default: '24/7 Free & Confidential',
    },
    designation: {
      type: String,
      default: '',
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    smsAvailable: {
      type: Boolean,
      default: false,
    },
    smsDetails: {
      type: String,
      default: '',
    },
    website: {
      type: String,
      default: '',
      trim: true,
    },
    channels: [
      {
        icon: { type: String, default: 'phone' },
        label: { type: String, required: true },
      },
    ],
    primaryAction: {
      label: { type: String, default: 'Contact Helpline' },
      icon: { type: String, default: 'phone' },
      href: { type: String, default: '' },
    },
    secondaryAction: {
      label: { type: String, default: 'Official Website' },
      href: { type: String, default: '' },
      external: { type: Boolean, default: true },
    },
    languages: {
      type: [String],
      default: ['English'],
    },
    operatingHours: {
      type: String,
      default: '24/7',
    },
    eligibility: {
      type: String,
      default: 'General public',
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    sourceUrl: {
      type: String,
      required: true,
      trim: true,
    },
    lastVerifiedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    verificationStatus: {
      type: String,
      enum: ['verified', 'review_pending', 'reported_issue'],
      default: 'verified',
    },
    issueReports: [
      {
        reason: String,
        details: String,
        reportedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true, collection: 'helplines' }
);

helplineSchema.index({ countryCode: 1 });
helplineSchema.index({ verificationStatus: 1 });

module.exports = mongoose.model('Helpline', helplineSchema);

