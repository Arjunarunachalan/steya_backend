import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import BugReport from '../models/BugReport.js';

const router = express.Router();

// Submit a bug report
router.post('/submit', authMiddleware, async (req, res) => {
  try {
    const { description } = req.body;

    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, message: 'Bug description is required' });
    }

    const bug = new BugReport({
      userId: req.user?._id,
      description,
    });

    await bug.save();

    res.json({ success: true, message: 'Bug report submitted successfully', bug });
  } catch (error) {
    console.error('Bug report error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit bug report' });
  }
});

export default router;
