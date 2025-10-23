import cron from 'node-cron';
import AutoCleanupService from '../services/autoCleanupService.js';

export function startCleanupJob() {
  // Run daily at 3 AM
  cron.schedule('0 3 * * *', async () => {
    console.log('🕒 Starting scheduled auto-cleanup job...');
    try {
      // Get stats before cleanup
      const statsBefore = await AutoCleanupService.getCleanupStats();
      console.log('📊 Cleanup stats before:', statsBefore);

      // Perform cleanup
      const result = await AutoCleanupService.cleanupExpiredData();
      console.log('✅ Scheduled cleanup completed:', result);

      // Get stats after cleanup
      const statsAfter = await AutoCleanupService.getCleanupStats();
      console.log('📊 Cleanup stats after:', statsAfter);

    } catch (error) {
      console.error('❌ Scheduled cleanup failed:', error);
    }
  });


}