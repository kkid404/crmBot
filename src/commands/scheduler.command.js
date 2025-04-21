const { Markup } = require('telegraf');
const schedulerService = require('../services/scheduler.service');
const { isAdmin } = require('../middlewares/isAdmin.middleware');

/**
 * Handle the scheduler command to manage Google Sheets auto-updates
 * Only accessible to admin users
 */
const action = async (ctx) => {
    try {
        await ctx.reply('Панель управления планировщиком Google Sheets', 
            Markup.inlineKeyboard([
                [Markup.button.callback('Обновить все таблицы сейчас', 'update_sheets')],
                [Markup.button.callback('Статус планировщика', 'scheduler_status')]
            ])
        );
    } catch (error) {
        console.error('Error in scheduler command:', error);
        await ctx.reply('Произошла ошибка при открытии панели управления планировщиком.');
    }
};

/**
 * Initialize the scheduler service when the bot starts
 */
const initScheduler = () => {
    try {
        schedulerService.init();
        console.log('Scheduler service initialized');
    } catch (error) {
        console.error('Error initializing scheduler service:', error);
    }
};

// Initialize the scheduler service
initScheduler();

module.exports = {
    command: 'scheduler',
    description: 'Управление планировщиком Google Sheets',
    action,
    middleware: isAdmin
}; 