'use strict';

const mongoose = require('mongoose');

const assessmentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['phq9', 'gad7', 'who5'],
      default: 'phq9',
      required: true,
    },
    responses: {
      type: [Number],
      required: true,
    },
    functionalImpairment: {
      type: String,
      enum: ['not_difficult', 'somewhat_difficult', 'very_difficult', 'extremely_difficult', 'not_applicable'],
      default: 'not_applicable',
    },
    totalScore: {
      type: Number,
      required: true,
      min: 0,
      max: 27,
    },
    severityCategory: {
      type: String,
      required: true,
      trim: true,
    },
    item9Positive: {
      type: Boolean,
      default: false,
    },
    assessmentVersion: {
      type: String,
      default: 'PHQ9-Kroenke2001-v2.0',
    },
    consentRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consent',
      default: null,
    },
    completedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { timestamps: true, collection: 'assessments' }
);

assessmentSchema.index({ user: 1, completedAt: -1 });
assessmentSchema.index({ type: 1, completedAt: -1 });
assessmentSchema.index({ severityCategory: 1 });

module.exports = mongoose.model('Assessment', assessmentSchema);

