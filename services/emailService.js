import nodemailer from 'nodemailer';

// Create transporter (you'll need to set these in .env)
const transporter = nodemailer.createTransport({
  service: 'gmail', // or 'smtp.gmail.com'
  auth: {
    user: process.env.EMAIL_USER, // your email
    pass: process.env.EMAIL_APP_PASSWORD, // Gmail App Password (NOT regular password)
  },
});

/**
 * Generate deep link that opens app if installed, otherwise Play Store
 * @param {string} path - Path in the app (e.g., '/myads', '/property/123')
 * @returns {string} - Deep link URL
 */
const generateDeepLink = (path = '') => {
  // Your app's custom scheme (you'll set this up in app.json)
  const scheme = 'steya://';
  const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.ameen007.Steya';
  
  // Create a smart link that tries app first, then Play Store
  // Use a redirect service or your own landing page
  const deepLink = `${scheme}${path}`;
  
  // For emails, use a format that mobile OS understands
  // This is a fallback pattern
  return `intent://${path}#Intent;scheme=steya;package=com.ameen007.Steya;end`;
};

/**
 * Generate universal link (works on both Android and iOS)
 */
const getAppLink = (postId = null) => {
  // Option 1: Use Firebase Dynamic Links (recommended)
  // Example: https://steya.page.link/myads
  
  // Option 2: Use your own domain with Universal Links
  // Example: https://steya.app/myads (this needs server-side setup)
  
  // Option 3: Simple fallback approach (what we'll use now)
  const playStore = 'https://play.google.com/store/apps/details?id=com.ameen007.Steya';
  
  if (postId) {
    // Deep link to specific post
    return `steya://property/${postId}`;
  }
  
  // Deep link to My Ads screen
  return `steya://myads`;
};

/**
 * Create HTML button with smart linking
 */
const createAppButton = (text, postId = null) => {
  const deepLink = postId ? `steya://property/${postId}` : `steya://myads`;
  const playStore = 'https://play.google.com/store/apps/details?id=com.ameen007.Steya';
  
  // Create a button that tries deep link first
  return `
    <center>
      <table border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center" style="border-radius: 8px; background: #7A5AF8;">
            <a href="${deepLink}" 
               style="display: inline-block; padding: 12px 30px; background: #7A5AF8; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;"
               target="_blank">
              ${text}
            </a>
          </td>
        </tr>
      </table>
      <p style="font-size: 11px; color: #999; margin-top: 10px;">
        <a href="${playStore}" style="color: #7A5AF8; text-decoration: none;">Don't have the app? Download from Play Store</a>
      </p>
    </center>
  `;
};

/**
 * Send expiry warning email (3 days before expiry)
 */
export const sendExpiryWarningEmail = async (user, post, daysLeft) => {
  const mailOptions = {
    from: `"Steya " <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: `⚠️ Your property listing expires in ${daysLeft} days!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #7A5AF8, #9B7DF7); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: white; margin: 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .warning-box { background: #FFF3CD; border-left: 4px solid #FFC107; padding: 15px; margin: 20px 0; }
          .property-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .property-title { font-size: 18px; font-weight: bold; color: #7A5AF8; }
          .btn { display: inline-block; padding: 12px 30px; background: #7A5AF8; color: white; text-decoration: none; border-radius: 8px; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏠 Property Expiry Notice</h1>
          </div>
          <div class="content">
            <p>Hi ${user.name},</p>
            
            <div class="warning-box">
              <strong>⚠️ Action Required!</strong><br>
              Your property listing will expire in <strong>${daysLeft} days</strong> on ${new Date(post.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.
            </div>

            <div class="property-card">
              <div class="property-title">${post.title}</div>
              <p><strong>📍 Location:</strong> ${post.location.fullAddress}</p>
              <p><strong>💰 Rent:</strong> ₹${post.monthlyRent || post.priceRange?.min || 'Contact'}/month</p>
              <p><strong>👁️ Views:</strong> ${post.views || 0} | <strong>❤️ Favorites:</strong> ${post.favorites?.length || 0}</p>
            </div>

            <p><strong>What happens next?</strong></p>
            <ul>
              <li>If you don't renew, your listing will expire on ${new Date(post.expiryDate).toLocaleDateString()}</li>
              <li>After expiry, you'll have 30 days to renew before permanent deletion</li>
              <li>Renewing extends your listing for another 30 days - completely free!</li>
            </ul>

            ${createAppButton('🔄 Renew Your Listing Now', post._id)}

            <p style="margin-top: 20px;">Need help? Reply to this email or contact our support team.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Steya </p>
            <p>This is an automated notification. Please do not reply to this email.</p>
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
    from: `"Steya " <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: `🚨 Your property listing has expired`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #FF6B6B, #FF8E8E); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: white; margin: 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .danger-box { background: #FFE8E8; border-left: 4px solid #FF6B6B; padding: 15px; margin: 20px 0; }
          .property-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .property-title { font-size: 18px; font-weight: bold; color: #FF6B6B; }
          .btn { display: inline-block; padding: 12px 30px; background: #7A5AF8; color: white; text-decoration: none; border-radius: 8px; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚨 Listing Expired</h1>
          </div>
          <div class="content">
            <p>Hi ${user.name},</p>
            
            <div class="danger-box">
              <strong>Your property listing has expired!</strong><br>
              Expired on: ${new Date(post.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>

            <div class="property-card">
              <div class="property-title">${post.title}</div>
              <p><strong>📍 Location:</strong> ${post.location.fullAddress}</p>
              <p><strong>💰 Rent:</strong> ₹${post.monthlyRent || post.priceRange?.min || 'Contact'}/month</p>
            </div>

            <p><strong>⏰ You have 30 days to renew!</strong></p>
            <p>Your listing is currently hidden from search results. You can renew it anytime within the next 30 days to restore visibility.</p>
            
            <p><strong>After 30 days:</strong></p>
            <ul>
              <li>Your listing will be permanently deleted</li>
              <li>All images and data will be removed</li>
              <li>Associated chats will be deleted</li>
            </ul>

            ${createAppButton('🔄 Renew Now (FREE)', post._id)}
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Steya </p>
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
 * Send final deletion warning (3 days before permanent deletion)
 */
export const sendFinalDeletionWarningEmail = async (user, post, daysLeft) => {
  const mailOptions = {
    from: `"Steya " <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: `🚨 URGENT: Your listing will be deleted in ${daysLeft} days!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #DC3545, #FF6B6B); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: white; margin: 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .urgent-box { background: #FFE8E8; border: 2px solid #DC3545; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .property-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .property-title { font-size: 18px; font-weight: bold; color: #DC3545; }
          .btn { display: inline-block; padding: 15px 40px; background: #DC3545; color: white; text-decoration: none; border-radius: 8px; margin: 10px 0; font-weight: bold; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ RENEW NOW </h1>
          </div>
          <div class="content">
            <p>Hi ${user.name},</p>
            
            <div class="urgent-box">
              <h2 style="color: #DC3545; margin-top: 0;">⚠️ URGENT ACTION REQUIRED!</h2>
              <p style="font-size: 16px; margin: 10px 0;">
                Your property listing will be <strong>permanently deleted</strong> in <strong style="color: #DC3545; font-size: 20px;">${daysLeft} DAYS</strong>
              </p>
              <p>Deletion date: <strong>${new Date(Date.now() + daysLeft * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></p>
            </div>

            <div class="property-card">
              <div class="property-title">${post.title}</div>
              <p><strong>📍 Location:</strong> ${post.location.fullAddress}</p>
              <p><strong>💰 Rent:</strong> ₹${post.monthlyRent || post.priceRange?.min || 'Contact'}/month</p>
            </div>

            <p><strong>🔥 This is your LAST CHANCE to renew!</strong></p>
            <p>After ${daysLeft} days:</p>
            <ul style="color: #DC3545;">
              <li><strong>All data will be permanently deleted</strong></li>
              <li><strong>All images will be removed from our servers</strong></li>
              <li><strong>All associated chats will be deleted</strong></li>
              <li><strong>This action CANNOT be undone!</strong></li>
            </ul>

            ${createAppButton('🔄 RENEW NOW - IT\'S FREE!', post._id)}

            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              Don't want to renew? You can mark it as "Sold" in the app to remove this listing immediately.
            </p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Steya </p>
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