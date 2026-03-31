const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  ID: { type: String, unique: true, required: true },
  Detail: { type: String },
  Status: { type: String },
  Priority: { type: String },
  StartDate: { type: String },
  DueDate: { type: String },
  UserID: { type: String },
  StaffName: { type: String },
  Department: { type: String },
  Note: { type: String },
  CustomFields: { type: Object, default: {} },
  Image1: { type: String },
  Image2: { type: String },
  Image3: { type: String },
  Image4: { type: String },
  CompletedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
