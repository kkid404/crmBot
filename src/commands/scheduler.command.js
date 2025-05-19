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
 * Handle the update_sheets callback - manually update all Google Sheets
 */
const handleUpdateSheets = async (ctx) => {
    try {
        await ctx.answerCbQuery('Запуск обновления таблиц...');
        await ctx.editMessageText('🔄 Обновление таблиц запущено. Пожалуйста, подождите...');
        
        // Call the service to update all sheets
        const result = await schedulerService.updateAllSheetsNow();
        
        if (result.success) {
            // Prepare links to all updated sheets
            let message = '✅ Все таблицы успешно обновлены!\n\n';
            
            if (result.links.taskSheets && result.links.taskSheets.length > 0) {
                message += '📊 Таблицы задач:\n';
                result.links.taskSheets.forEach(sheet => {
                    message += `• [${sheet.name}](${sheet.url})\n`;
                });
                message += '\n';
            }
            
            if (result.links.schedule) {
                message += `📅 [${result.links.schedule.name}](${result.links.schedule.url})`;
            }
            
            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
        } else {
            await ctx.editMessageText(`❌ Ошибка при обновлении таблиц: ${result.error || 'Неизвестная ошибка'}`);
        }
    } catch (error) {
        console.error('Error updating sheets:', error);
        await ctx.editMessageText(`❌ Произошла ошибка при обновлении таблиц: ${error.message}`);
    }
};

/**
 * Handle the scheduler_status callback - show current scheduler status
 */
const handleSchedulerStatus = async (ctx) => {
    try {
        await ctx.answerCbQuery('Получение статуса планировщика...');
        
        // Get the next scheduled update time (30 minutes from the last one)
        const message = '📊 Статус планировщика Google Sheets:\n\n' +
                       '✅ Планировщик активен\n' +
                       '🔄 Интервал обновления: каждые 30 минут\n\n' +
                       'Для ручного обновления всех таблиц используйте команду /scheduler и нажмите кнопку "Обновить все таблицы сейчас".';
        
        await ctx.editMessageText(message);
    } catch (error) {
        console.error('Error getting scheduler status:', error);
        await ctx.editMessageText('❌ Произошла ошибка при получении статуса планировщика.');
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
    middleware: isAdmin,
    // Export callback handlers
    callbacks: {
        'update_sheets': handleUpdateSheets,
        'scheduler_status': handleSchedulerStatus
    }
};