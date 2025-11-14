import express from 'express';
import crypto from 'crypto';
import Donation from '../models/Donation.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import Razorpay from 'razorpay';
import { log } from 'console';
import  Contact  from '../models/Contact.js';

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


// routes/appVersion.js
router.get('/app-version', (req, res) => {
   const { currentVersion } = req.query;
  
  console.log(`📱 App checking version: ${currentVersion}`);
  
  // ✅ UPDATE THIS when you release new version!
  const LATEST_VERSION = '1.0.2'; // ← Change to 1.0.2 when releasing
  
  const needsUpdate = currentVersion < LATEST_VERSION;
  
  res.json({
    success: true,
    hasUpdate: needsUpdate,
    latestVersion: LATEST_VERSION,
    updateType: 'flexible', // or 'immediate' for mandatory
    features: [
      '🎨 Beautiful new UI design',
      '🚀 Faster performance',
      '🐛 Bug fixes and improvements',
      '✨ New features you\'ll love',
    ]
  });
});

// Contact Us Route
router.post('/contact/submit', async (req, res) => {
  try {
    const { subject, message, userEmail, userName } = req.body;
    
    // Validate input
    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Subject and message are required'
      });
    }
    
    // Save to database (create Contact model)
    const contact = new Contact({
      subject: subject.trim(),
      message: message.trim(),
      userEmail: userEmail || 'anonymous@steya.com',
      userName: userName || 'Anonymous User',
      status: 'pending', // pending, replied, resolved
      createdAt: new Date()
    });
    
    await contact.save();
    
    // Optional: Send email notification to admin
    // await sendEmailToAdmin(contact);
    
    console.log('📧 New contact message received:', {
      subject,
      from: userEmail
    });
    
    res.json({
      success: true,
      message: 'Contact message received successfully'
    });
    
  } catch (error) {
    console.error('❌ Contact submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit contact message'
    });
  }
});

router.get('/contact/all', async (req, res) => {
  try {
    const contacts = await Contact.find()
      .sort({ createdAt: -1 })
      .limit(100);
    
    res.json({
      success: true,
      contacts: contacts
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contacts'
    });
  }
});


export default router;