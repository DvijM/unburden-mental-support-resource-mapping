'use strict';

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, default: 'VIEW_USER_DETAILS', required: true },
    timestamp: { type: Date, default: Date.now, required: true },
  },
  { collection: 'audit_logs' }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
