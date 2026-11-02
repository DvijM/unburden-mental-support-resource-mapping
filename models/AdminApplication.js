'use strict';

const mongoose = require('mongoose');

const adminApplicationSchema = new mongoose.Schema(
  {
    fullName: {
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
    organisation: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    designation: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    requestedRole: {
      type: String,
      enum: ['responder', 'analyst', 'content_editor'],
      required: true,
    },
    requestedPermissions: {
      type: [String],
      default: [],
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 1000,
    },
    qualifications: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 1000,
    },
    policyAccepted: {
      type: Boolean,
      required: true,
      validate: {
        validator: (v) => v === true,
        message: 'Applicant must accept platform data-access policies.',
      },
    },
    status: {
      type: String,
      enum: ['submitted', 'pending_review', 'approved', 'rejected', 'completed'],
      default: 'pending_review',
      required: true,
    },
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewNotes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
    },
    inviteTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    inviteExpiresAt: {
      type: Date,
      default: null,
    },
    inviteUsedAt: {
      type: Date,
      default: null,
    },
    createdUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { timestamps: true, collection: 'admin_applications' }
);

adminApplicationSchema.index({ email: 1, status: 1 });
adminApplicationSchema.index({ status: 1, submittedAt: -1 });
adminApplicationSchema.index({ inviteTokenHash: 1 });

module.exports = mongoose.model('AdminApplication', adminApplicationSchema);

