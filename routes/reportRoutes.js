import express from 'express';
import Report from '../models/report.js';
import Room from '../models/RoomSchema.js'; // Your room model
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

// ✅ REPORT A ROOM
router.post('/report-room', authMiddleware, async (req, res) => {
  try {
    const { roomId, reason, description } = req.body;
    const userId = req.user._id;

    console.log(`🚨 REPORT ROOM: User ${userId} → Room ${roomId} - Reason: ${reason}`);

    // Validation
    if (!roomId || !reason) {
      return res.status(400).json({ 
        success: false,
        message: 'Room ID and reason are required' 
      });
    }

    const validReasons = [
      'spam', 'inappropriate', 'misinformation', 
      'fake_listing', 'already_rented', 'wrong_info', 'other'
    ];

    if (!validReasons.includes(reason)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid reason provided' 
      });
    }

    // Check if room exists
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ 
        success: false,
        message: 'Room not found' 
      });
    }

    // Check if user already reported this room (pending reports only)
    const existingReport = await Report.findOne({
      reporter: userId,
      reportedRoom: roomId,
      status: 'pending'
    });

    if (existingReport) {
      return res.status(400).json({ 
        success: false,
        message: 'You have already reported this room. Please wait for review.' 
      });
    }

    // Create new report
    const report = new Report({
      reporter: userId,
      reportedRoom: roomId,
      reason,
      description: description || ''
    });

    await report.save();

    // Populate room details for response
    await report.populate('reportedRoom', 'title thumbnail monthlyRent');

    console.log(`✅ REPORT CREATED: ${report._id}`);

    res.status(201).json({
      success: true,
      message: 'Room reported successfully. Our team will review it shortly.',
      report: report
    });

  } catch (error) {
    console.error('❌ Error reporting room:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to report room', 
      error: error.message 
    });
  }
});

// ✅ GET USER'S REPORTS
router.get('/my-reports', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    console.log(`📋 GET USER REPORTS: User ${userId}`);

    const reports = await Report.find({ reporter: userId })
      .populate('reportedRoom', 'title thumbnail monthlyRent')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Report.countDocuments({ reporter: userId });

    console.log(`✅ REPORTS FETCHED: ${reports.length} items`);

    res.json({
      success: true,
      reports,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error fetching reports:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch reports', 
      error: error.message 
    });
  }
});

// ✅ GET REPORT BY ID
router.get('/:reportId', authMiddleware, async (req, res) => {
  try {
    const { reportId } = req.params;
    const userId = req.user._id;

    const report = await Report.findOne({
      _id: reportId,
      reporter: userId
    }).populate('reportedRoom', 'title thumbnail monthlyRent');

    if (!report) {
      return res.status(404).json({ 
        success: false,
        message: 'Report not found' 
      });
    }

    res.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('❌ Error fetching report:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch report', 
      error: error.message 
    });
  }
});

// ✅ GET ALL REPORTS (ADMIN ONLY)
router.get('/admin/all-reports', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin (you need to implement this check based on your user model)
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied. Admin only.' 
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const status = req.query.status; // Optional filter by status

    let query = {};
    if (status) {
      query.status = status;
    }

    const reports = await Report.find(query)
      .populate('reporter', 'name email')
      .populate('reportedRoom', 'title thumbnail monthlyRent')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Report.countDocuments(query);

    res.json({
      success: true,
      reports,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error fetching admin reports:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch reports', 
      error: error.message 
    });
  }
});

// ✅ UPDATE REPORT STATUS (ADMIN ONLY)
router.patch('/admin/update-status/:reportId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied. Admin only.' 
      });
    }

    const { reportId } = req.params;
    const { status, adminNotes } = req.body;

    const validStatuses = ['pending', 'reviewed', 'resolved', 'dismissed'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid status' 
      });
    }

    const report = await Report.findByIdAndUpdate(
      reportId,
      { 
        status,
        adminNotes: adminNotes || '',
        reviewedAt: new Date()
      },
      { new: true }
    ).populate('reporter', 'name email')
     .populate('reportedRoom', 'title thumbnail');

    if (!report) {
      return res.status(404).json({ 
        success: false,
        message: 'Report not found' 
      });
    }

    res.json({
      success: true,
      message: 'Report status updated successfully',
      report
    });

  } catch (error) {
    console.error('❌ Error updating report status:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to update report status', 
      error: error.message 
    });
  }
});

export default router;