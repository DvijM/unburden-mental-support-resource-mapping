'use strict';

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, default: 'system' },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dataCategory: {
      type: String,
      enum: [
        'profile',
        'assessment_results',
        'assessment_history',
        'mood_checkins',
        'activity_history',
        'admin_application',
        'account_status',
        'consent',
        'share_grant',
        'helpline',
        'content',
        'system',
      ],
      default: 'profile',
    },
    action: { type: String, required: true, trim: true },
    grantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShareGrant', default: null },
    details: { type: String, trim: true, default: '', maxlength: 500 },
    anonymized: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now, required: true },
  },
  { collection: 'audit_logs' }
);

auditLogSchema.index({ targetUserId: 1, timestamp: -1 });
auditLogSchema.index({ actorId: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
