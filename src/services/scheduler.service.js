const cron = require('node-cron');
const tableUpdaterService = require('./tableUpdater.service');
// Keep these imports for backward compatibility
const taskController = require('../controllers/task.controller');
const employeeScheduleController = require('../controllers/employee_schedule.controller');

class SchedulerService {
    constructor() {
        this.jobs = [];
        this._isUpdating = false;
    }

    /**
     * Initialize all scheduled jobs
     */
    init() {
        console.log('Initializing scheduler service...');
        this.setupGoogleSheetsUpdater();
    }

    /**
     * Set up the job that updates all Google Sheets every 30 minutes
     */
    setupGoogleSheetsUpdater() {
        // Schedule to run every 30 minutes
        // Cron format: minute hour day month weekday
        // '*/30 * * * *' means every 30 minutes
        const job = cron.schedule('*/30 * * * *', async () => {
            if (this._isUpdating) {
                console.warn('Previous Google Sheets update still running – skipping this schedule tick.');
                return;
            }
            this._isUpdating = true;
            console.log('Running scheduled Google Sheets update...');
            try {
                await this.updateAllSheetsNow();
            } finally {
                this._isUpdating = false;
            }
        });

        this.jobs.push(job);
        console.log('Google Sheets updater scheduled to run every 30 minutes');
    }

    /**
     * Update all Google Sheets now
     * @returns {Promise<Object>} Object containing success status and links to all updated sheets
     */
    async updateAllSheetsNow() {
        console.log('Starting update of all Google Sheets...');
        
        try {
            // Use the new tableUpdater service that ensures proper clearing before updating
            console.log('Using tableUpdater service to ensure tables are properly cleared before updating...');
            const result = await tableUpdaterService.updateAllTables();
            
            if (result.success) {
                console.log('All Google Sheets updated successfully with proper clearing');
            } else {
                console.error('Error occurred during table updates:', result.error);
            }
            
            return result;
        } catch (error) {
            console.error('Error updating Google Sheets:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Stop all scheduled jobs
     */
    stopAllJobs() {
        console.log('Stopping all scheduled jobs...');
        this.jobs.forEach(job => job.stop());
        this.jobs = [];
        console.log('All scheduled jobs stopped');
    }
}

module.exports = new SchedulerService(); 