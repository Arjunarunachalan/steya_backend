import express from 'express';
import crypto from 'crypto';
import Donation from '../models/Donation.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import Razorpay from 'razorpay';
import { log } from 'console';

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});


console.log('Key ID:', process.env.RAZORPAY_KEY_ID);
console.log('Key Secret:', process.env.RAZORPAY_KEY_SECRET);

// ✅ Create Razorpay Order
router.post('/create-order', authMiddleware, async (req, res) => {
  try {
    const { amount, currency = 'INR' } = req.body;
    
    if (!amount || amount < 100) { // Minimum ₹1
      return res.status(400).json({
        success: false,
        message: 'Amount must be at least ₹1'
      });
    }

    const options = {
      amount: parseInt(amount), // Amount in paise
      currency: currency,
      receipt: `receipt_${Date.now()}`,
      notes: {
        userId: req.user.id,
        platform: 'steya-app'
      }
    };
console.log('Creating Razorpay order with:',process.env.RAZORPAY_KEY_ID, process.env.RAZORPAY_KEY_SECRET);


    const order = await razorpay.orders.create(options);

    // Save order details temporarily (optional)
    const donation = new Donation({
      orderId: order.id,
      amount: amount / 100, // Convert back to rupees
      currency: currency,
      status: 'created',
      userId: req.user.id,
      createdAt: new Date()
    });

    await donation.save();

    res.json({
      success: true,
      order: order,
      donation: donation
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order'
    });
  }
});

// ✅ Verify Payment
router.post('/verify-payment', authMiddleware, async (req, res) => {
  try {
    const { paymentId, orderId, signature } = req.body; // ✅ include signature

    if (!paymentId || !orderId || !signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment ID, Order ID, and Signature are required'
      });
    }

    // Generate signature on server side
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    // Compare signatures
    if (generatedSignature !== signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment signature verification failed'
      });
    }

    // Fetch payment details (optional, for records)
    const payment = await razorpay.payments.fetch(paymentId);

    // Update donation record
    const donation = await Donation.findOne({ orderId });
    if (donation) {
      donation.paymentId = paymentId;
      donation.status = payment.status === 'captured' ? 'completed' : 'failed';
      donation.paymentMethod = payment.method;
      donation.updatedAt = new Date();

      await donation.save();
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      payment,
      donation
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed'
    });
  }
});


// ✅ Get Donation History
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const donations = await Donation.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);

    const totalDonated = await Donation.aggregate([
      { 
        $match: { 
          userId: req.user.id,
          status: 'completed'
        } 
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    res.json({
      success: true,
      donations: donations,
      totalDonated: totalDonated[0]?.totalAmount || 0
    });

  } catch (error) {
    console.error('Error fetching donations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch donation history'
    });
  }
});

export default router;