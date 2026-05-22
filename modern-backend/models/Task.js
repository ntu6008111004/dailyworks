const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  ID: { type: String, unique: true, required: true },
  Detail: { type: String },
  Status: { type: String, index: true },
  Priority: { type: String },
  StartDate: { type: String },
  DueDate: { type: String },
  UserID: { type: String, index: true },
  StaffName: { type: String },
  Department: { type: String, index: true },
  Note: { type: String },
  CustomFields: { type: Object, default: {} },
  Image1: { type: String },
  Image2: { type: String },
  Image3: { type: String },
  Image4: { type: String },
  CompletedAt: { type: Date },
}, { timestamps: true });

// Compound indexes for common query patterns
taskSchema.index({ UserID: 1, Status: 1, Department: 1 }); // Filtered task queries
taskSchema.index({ createdAt: -1 });                        // Sort by newest first
taskSchema.index({ Department: 1, Status: 1 });             // Department + status filter

module.exports = mongoose.model('Task', taskSchema);
