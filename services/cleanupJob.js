import cron from 'node-cron';
import AutoCleanupService from '../services/autoCleanupService.js';
import { startNotificationJobs } from './notificationCronJob.js';

export function startCleanupJob() {
  // Start notification jobs
  startNotificationJobs();

  // Run daily cleanup at 3 AM
  cron.schedule('0 3 * * *', async () => {
    console.log('🕒 Starting scheduled jobs at 3 AM...');

    try {
      // ⚠️ TEMPORARY: Auto-renew posts with 10 days left (for platform growth)
      // TODO: Remove this after platform has enough active users
      console.log('🔄 Running auto-renewal job...');
      const renewalResult = await AutoCleanupService.autoRenewExpiredPosts();
      console.log('✅ Auto-renewal completed:', renewalResult);
    } catch (error) {
      console.error('❌ Auto-renewal failed:', error);
    }

    try {
      // Run cleanup job
      console.log('🧹 Running cleanup job...');
      const statsBefore = await AutoCleanupService.getCleanupStats();
      console.log('📊 Cleanup stats before:', statsBefore);

      const result = await AutoCleanupService.cleanupExpiredData();
      console.log('✅ Scheduled cleanup completed:', result);

      const statsAfter = await AutoCleanupService.getCleanupStats();
      console.log('📊 Cleanup stats after:', statsAfter);
    } catch (error) {
      console.error('❌ Scheduled cleanup failed:', error);
    }
  });

  console.log('✅ All cron jobs initialized (cleanup + auto-renewal)!');
}