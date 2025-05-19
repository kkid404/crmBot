/**
 * Table Updater Service
 * Handles the complete process of updating Google Sheets tables
 * Ensures proper clearing of data before filling
 */
const taskController = require('../controllers/task.controller');
const employeeScheduleController = require('../controllers/employee_schedule.controller');
const googleSheets = require('./googleSheets.service');

class TableUpdaterService {
    /**
     * Update all tables with fresh data
     * Ensures tables are properly cleared before filling
     */
    async updateAllTables() {
        console.log('Starting complete table update process...');
        
        const links = {
            taskSheets: [],
            schedule: null
        };

        try {
            // 1. Export tasks in progress with proper clearing
            console.log('Updating tasks in progress table...');
            const progressResult = await this.updateTasksInProgress();
            if (progressResult.success) {
                links.taskSheets.push({
                    name: 'Креативы в работе',
                    url: progressResult.url
                });
            }

            // 2. Export completed tasks with proper clearing
            await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay between exports
            console.log('Updating completed tasks table...');
            const completedResult = await this.updateTasksDone();
            if (completedResult.success) {
                links.taskSheets.push({
                    name: 'Выполненные креативы',
                    url: completedResult.url
                });
            }

            // 3. Export all tasks with proper clearing
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log('Updating all tasks table...');
            const allTasksResult = await this.updateAllTasks();
            if (allTasksResult.success) {
                links.taskSheets.push({
                    name: 'Все креативы',
                    url: allTasksResult.url
                });
            }

            // 4. Export employee schedule with proper clearing
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log('Updating employee schedule table...');
            const scheduleResult = await this.updateEmployeeSchedule();
            if (scheduleResult.success) {
                links.schedule = {
                    name: 'Расписание сотрудников',
                    url: scheduleResult.url
                };
            }

            console.log('All tables updated successfully');
            return {
                success: true,
                links
            };
        } catch (error) {
            console.error('Error updating tables:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update tasks in progress table with proper clearing
     */
    async updateTasksInProgress() {
        try {
            // Get spreadsheet info from the controller
            const { spreadsheetId, sheetName } = await this.getSpreadsheetInfo('Креативы в работе');
            
            // Clear the sheet completely before updating
            console.log(`Clearing sheet "${sheetName}" before updating...`);
            await googleSheets.clearSheet(spreadsheetId, sheetName);
            
            // Now call the controller to export data
            const url = await taskController.exportTasksInProgressCsv();
            return { success: true, url };
        } catch (error) {
            console.error('Error updating tasks in progress table:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update completed tasks table with proper clearing
     */
    async updateTasksDone() {
        try {
            // Get spreadsheet info from the controller
            const { spreadsheetId, sheetName } = await this.getSpreadsheetInfo('Выполненные креативы');
            
            // Clear the sheet completely before updating
            console.log(`Clearing sheet "${sheetName}" before updating...`);
            await googleSheets.clearSheet(spreadsheetId, sheetName);
            
            // Now call the controller to export data
            const url = await taskController.exportTasksDoneCsv();
            return { success: true, url };
        } catch (error) {
            console.error('Error updating completed tasks table:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update all tasks table with proper clearing
     */
    async updateAllTasks() {
        try {
            // Get spreadsheet info from the controller
            const { spreadsheetId, sheetName } = await this.getSpreadsheetInfo('Все креативы');
            
            // Clear the sheet completely before updating
            console.log(`Clearing sheet "${sheetName}" before updating...`);
            await googleSheets.clearSheet(spreadsheetId, sheetName);
            
            // Now call the controller to export data
            const url = await taskController.exportAllTasksCsv();
            return { success: true, url };
        } catch (error) {
            console.error('Error updating all tasks table:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update employee schedule table with proper clearing
     */
    async updateEmployeeSchedule() {
        try {
            // We don't have direct access to the sheet info here, so we'll just call the controller
            // The controller should be updated to use clearSheet internally
            const url = await employeeScheduleController.exportEmployeeScheduleToGoogleSheets();
            return { success: true, url };
        } catch (error) {
            console.error('Error updating employee schedule table:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Helper to get spreadsheet info for a specific sheet
     */
    async getSpreadsheetInfo(sheetTitle) {
        // Use a single spreadsheet for all task-related data
        const spreadsheetId = await googleSheets.getOrCreateSpreadsheet(
            'Таблица задач', 
            process.env.TASKS_SPREADSHEET_ID
        );
        
        return { spreadsheetId, sheetName: sheetTitle };
    }
}

module.exports = new TableUpdaterService();
