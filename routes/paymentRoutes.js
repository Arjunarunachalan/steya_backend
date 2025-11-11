import express from 'express';
import Razorpay from 'razorpay';

const router = express.Router();


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID ,
  key_secret: process.env.RAZORPAY_KEY_SECRET ,
});

// ✅ Create Razorpay Order
router.post('/create-order', async (req, res) => {
  try {
    const { amount } = req.body;

    // Basic validation
    if (!amount || amount < 10 || amount > 50000) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount. Must be between ₹10 and ₹50,000',
      });
    }

    const orderOptions = {
      amount: amount * 100, // Convert to paise
      currency: 'INR',
      receipt: `steya_${Date.now()}`,
      notes: {
        purpose: 'Steya Donation',
      },
    };

    const order = await razorpay.orders.create(orderOptions);

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID || 'rzp_live_Re0Y2zBv6tY6f1',
    });

  } catch (error) {
    console.error('Order creation failed:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
    });
  }
});

// ✅ Verify Payment Status
router.post('/verify', async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required',
      });
    }

    // Fetch payment details
    const payments = await razorpay.orders.fetchPayments(orderId);

    if (payments.items && payments.items.length > 0) {
      const payment = payments.items[0];
      
      const isSuccess = payment.status === 'captured' || payment.status === 'authorized';
      const isFailed = payment.status === 'failed';
      
      return res.json({
        success: true,
        status: payment.status,
        isSuccess,
        isFailed,
        isPending: !isSuccess && !isFailed,
        paymentId: payment.id,
        orderId: payment.order_id,
        amount: payment.amount / 100,
        method: payment.method,
      });
    }

    // No payment found yet - still pending
    res.json({
      success: true,
      status: 'pending',
      isSuccess: false,
      isFailed: false,
      isPending: true,
    });

  } catch (error) {
    console.error('Verification error:', error.message);
    
    // Return pending status instead of error to allow retries
    res.json({
      success: true,
      status: 'pending',
      isSuccess: false,
      isFailed: false,
      isPending: true,
    });
  }
});

export default router;