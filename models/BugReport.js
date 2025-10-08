import mongoose from 'mongoose';

const bugReportSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // optional if user not logged in
  },
  description: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  resolved: {
    type: Boolean,
    default: false,
  }
});

const BugReport = mongoose.model('BugReport', bugReportSchema);
export default BugReport;
