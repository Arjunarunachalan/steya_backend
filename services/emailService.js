import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

// Use your existing backend API URL
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://your-api.com';
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.ameen007.Steya';



const createAppButton = (text, btnColor = '#7A5AF8') => {
  const link = `${API_URL}/app`;  // Just opens app, no path
  
  return `
    <center>
      <table border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center" style="border-radius: 8px; background: ${btnColor};">
            <a href="${link}" style="display:inline-block;padding:14px 35px;background:${btnColor};color:white;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;" target="_blank">
              ${text}
            </a>
          </td>
        </tr>
      </table>
    </center>
  `;
};

export const sendExpiryWarningEmail = async (user, post, daysLeft) => {
  const mailOptions = {
    from: `"Steya" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: `⚠️ Your property listing expires in ${daysLeft} days!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;">
        <div style="max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:linear-gradient(135deg,#7A5AF8,#9B7DF7);padding:30px;text-align:center;border-radius:10px 10px 0 0;">
            <h1 style="color:white;margin:0;font-size:24px;">🏠 Property Expiry Notice</h1>
          </div>
          <div style="background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px;">
            <p>Hi ${user.name},</p>
            
            <div style="background:#FFF3CD;border-left:4px solid #FFC107;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;">
              <strong>⚠️ Action Required!</strong><br>
              Your property listing will expire in <strong>${daysLeft} days</strong> on ${new Date(post.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.
            </div>

            <div style="background:white;padding:20px;border-radius:8px;margin:20px 0;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
              <div style="font-size:18px;font-weight:bold;color:#7A5AF8;margin-bottom:12px;">${post.title}</div>
              <p style="margin:8px 0;"><strong>📍 Location:</strong> ${post.location?.fullAddress || 'N/A'}</p>
              <p style="margin:8px 0;"><strong>💰 Rent:</strong> ₹${post.monthlyRent || post.priceRange?.min || 'Contact'}/month</p>
              <p style="margin:8px 0;"><strong>👁️ Views:</strong> ${post.views || 0} | <strong>❤️ Favorites:</strong> ${post.favorites?.length || 0}</p>
            </div>

            <p><strong>What happens next?</strong></p>
            <ul>
              <li>If you don't renew, your listing will expire and become hidden</li>
              <li>After expiry, you'll have 30 days to renew before permanent deletion</li>
              <li>Renewing extends your listing for another 30 days - completely free!</li>
            </ul>

            ${createAppButton('🔄 Renew Your Listing Now', post._id)}

            <p style="margin-top:20px;font-size:14px;color:#666;">Need help? Reply to this email.</p>
          </div>
          <div style="text-align:center;padding:20px;color:#666;font-size:12px;">
            <p>© ${new Date().getFullYear()} Steya</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Expiry warning email sent to ${user.email}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error sending expiry warning email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send post expired email
 */
export const sendPostExpiredEmail = async (user, post) => {
  const mailOptions = {
    from: `"Steya" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: `🚨 Your property listing has expired`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;">
        <div style="max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:linear-gradient(135deg,#FF6B6B,#FF8E8E);padding:30px;text-align:center;border-radius:10px 10px 0 0;">
            <h1 style="color:white;margin:0;font-size:24px;">🚨 Listing Expired</h1>
          </div>
          <div style="background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px;">
            <p>Hi ${user.name},</p>
            
            <div style="background:#FFE8E8;border-left:4px solid #FF6B6B;padding:15px;margin:20px 0;border-radius:0 8px 8px 0;">
              <strong>Your property listing has expired!</strong><br>
              Expired on: ${new Date(post.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>

            <div style="background:white;padding:20px;border-radius:8px;margin:20px 0;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
              <div style="font-size:18px;font-weight:bold;color:#FF6B6B;margin-bottom:12px;">${post.title}</div>
              <p style="margin:8px 0;"><strong>📍 Location:</strong> ${post.location?.fullAddress || 'N/A'}</p>
              <p style="margin:8px 0;"><strong>💰 Rent:</strong> ₹${post.monthlyRent || post.priceRange?.min || 'Contact'}/month</p>
            </div>

            <p><strong>⏰ You have 30 days to renew!</strong></p>
            <p>Your listing is currently hidden. Renew anytime within 30 days to restore visibility.</p>
            
            <p><strong>After 30 days:</strong></p>
            <ul>
              <li>Your listing will be permanently deleted</li>
              <li>All images and data will be removed</li>
              <li>Associated chats will be deleted</li>
            </ul>

            ${createAppButton('🔄 Renew Now (FREE)', post._id)}
          </div>
          <div style="text-align:center;padding:20px;color:#666;font-size:12px;">
            <p>© ${new Date().getFullYear()} Steya</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Post expired email sent to ${user.email}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error sending post expired email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send final deletion warning
 */
export const sendFinalDeletionWarningEmail = async (user, post, daysLeft) => {
  const mailOptions = {
    from: `"Steya" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: `🚨 URGENT: Your listing will be deleted in ${daysLeft} days!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;">
        <div style="max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:linear-gradient(135deg,#DC3545,#FF6B6B);padding:30px;text-align:center;border-radius:10px 10px 0 0;">
            <h1 style="color:white;margin:0;font-size:24px;">⚠️ FINAL WARNING</h1>
          </div>
          <div style="background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px;">
            <p>Hi ${user.name},</p>
            
            <div style="background:#FFE8E8;border:2px solid #DC3545;padding:20px;margin:20px 0;border-radius:8px;">
              <h2 style="color:#DC3545;margin-top:0;">⚠️ URGENT ACTION REQUIRED!</h2>
              <p style="font-size:16px;margin:10px 0;">
                Your property listing will be <strong>permanently deleted</strong> in 
                <strong style="color:#DC3545;font-size:24px;">${daysLeft} DAYS</strong>
              </p>
              <p>Deletion date: <strong>${new Date(Date.now() + daysLeft * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></p>
            </div>

            <div style="background:white;padding:20px;border-radius:8px;margin:20px 0;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
              <div style="font-size:18px;font-weight:bold;color:#DC3545;margin-bottom:12px;">${post.title}</div>
              <p style="margin:8px 0;"><strong>📍 Location:</strong> ${post.location?.fullAddress || 'N/A'}</p>
              <p style="margin:8px 0;"><strong>💰 Rent:</strong> ₹${post.monthlyRent || post.priceRange?.min || 'Contact'}/month</p>
            </div>

            <p><strong>🔥 This is your LAST CHANCE!</strong></p>
            <ul style="color:#DC3545;">
              <li><strong>All data will be permanently deleted</strong></li>
              <li><strong>All images will be removed</strong></li>
              <li><strong>This action CANNOT be undone!</strong></li>
            </ul>

            ${createAppButton("🔄 RENEW NOW - IT'S FREE!", post._id, '#DC3545')}

            <p style="margin-top:30px;font-size:14px;color:#666;">
              Don't want to renew? Mark it as "Sold" in the app.
            </p>
          </div>
          <div style="text-align:center;padding:20px;color:#666;font-size:12px;">
            <p>© ${new Date().getFullYear()} Steya</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Final deletion warning email sent to ${user.email}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error sending final deletion email:', error);
    return { success: false, error: error.message };
  }
};

export default {
  sendExpiryWarningEmail,
  sendPostExpiredEmail,
  sendFinalDeletionWarningEmail,
};