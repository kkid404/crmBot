const cron = require('node-cron');
const taskController = require('../controllers/task.controller');
const employeeScheduleController = require('../controllers/employee_schedule.controller');

class SchedulerService {
    constructor() {
        this.jobs = [];
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
            console.log('Running scheduled Google Sheets update...');
            await this.updateAllSheetsNow();
        });

        this.jobs.push(job);
        console.log('Google Sheets updater scheduled to run every 30 minutes');
    }

    /**
     * Update all Google Sheets now
     * @returns {Promise<Object>} Object containing success status and links to all updated sheets
     */
    async updateAllSheetsNow() {
        try {
            console.log('Starting update of all Google Sheets...');
            
            const links = {
                taskSheets: [],
                schedule: null
            };

            // Update task sheets
            try {
                console.log('Updating tasks in progress spreadsheet...');
                const tasksInProgressUrl = await taskController.exportTasksInProgressCsv();
                links.taskSheets.push({
                    name: 'Креативы в работе',
                    url: tasksInProgressUrl
                });
                console.log('Tasks in progress spreadsheet updated');
            } catch (error) {
                console.error('Error updating tasks in progress spreadsheet:', error.message);
            }

            try {
                console.log('Updating completed tasks spreadsheet...');
                const completedTasksUrl = await taskController.exportTasksDoneCsv();
                links.taskSheets.push({
                    name: 'Выполненные креативы',
                    url: completedTasksUrl
                });
                console.log('Completed tasks spreadsheet updated');
            } catch (error) {
                console.error('Error updating completed tasks spreadsheet:', error.message);
            }

            try {
                console.log('Updating all tasks spreadsheet...');
                const allTasksUrl = await taskController.exportAllTasksCsv();
                links.taskSheets.push({
                    name: 'Все креативы',
                    url: allTasksUrl
                });
                console.log('All tasks spreadsheet updated');
            } catch (error) {
                console.error('Error updating all tasks spreadsheet:', error.message);
            }

            // Update employee schedule
            try {
                console.log('Updating employee schedule spreadsheet...');
                const scheduleUrl = await employeeScheduleController.exportEmployeeScheduleToGoogleSheets();
                links.schedule = {
                    name: 'Расписание сотрудников',
                    url: scheduleUrl
                };
                console.log('Employee schedule spreadsheet updated');
            } catch (error) {
                console.error('Error updating employee schedule spreadsheet:', error.message);
            }

            console.log('All Google Sheets updated successfully');
            return {
                success: true,
                links
            };
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