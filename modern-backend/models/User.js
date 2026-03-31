const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  ID: { type: String, unique: true, required: true },
  Username: { type: String, unique: true, required: true },
  Password: { type: String, required: true }, // Base64 encoded as per current system
  Role: { type: String, default: 'Staff' },
  Department: { type: String },
  Name: { type: String },
  ProfileImage: { type: String },
  Position: { type: String }, // ID of Position
  Permissions: { type: Object, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
