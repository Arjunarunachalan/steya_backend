import cron from 'node-cron';
import AutoCleanupService from '../services/autoCleanupService.js';
import { startNotificationJobs } from './notificationCronJob.js';

export function startCleanupJob() {
  // Start notification jobs
  startNotificationJobs();

  // Run daily cleanup at 3 AM
  cron.schedule('0 3 * * *', async () => {
    console.log('🕒 Starting scheduled auto-cleanup job...');
    try {
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

  console.log('✅ All cron jobs initialized!');
}