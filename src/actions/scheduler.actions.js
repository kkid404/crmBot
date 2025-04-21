const schedulerService = require('../services/scheduler.service');

/**
 * Action handlers for scheduler-related actions
 */
const actions = (bot) => {
    // Handler for "Update all sheets now" button
    bot.action('update_sheets', async (ctx) => {
        try {
            await ctx.answerCbQuery('Начинаем обновление...');
            
            // Show "updating" message
            const message = await ctx.reply('🔄 Обновление Google Sheets...\nЭто может занять некоторое время.');
            
            // Run the update
            const result = await schedulerService.updateAllSheetsNow();
            
            if (result.success) {
                // Prepare message with links to all sheets
                let linksMessage = '✅ Обновление завершено успешно!\n\n';
                linksMessage += 'Ссылки на обновленные таблицы:\n';
                
                // Add task sheet links
                if (result.links.taskSheets && result.links.taskSheets.length > 0) {
                    linksMessage += '\n📊 Таблицы задач:\n';
                    result.links.taskSheets.forEach(sheet => {
                        linksMessage += `• [${sheet.name}](${sheet.url})\n`;
                    });
                }
                
                // Add schedule link
                if (result.links.schedule) {
                    linksMessage += '\n⏱️ Расписание сотрудников:\n';
                    linksMessage += `• [${result.links.schedule.name}](${result.links.schedule.url})\n`;
                }
                
                // Update the message with results
                await ctx.telegram.editMessageText(
                    ctx.chat.id, 
                    message.message_id, 
                    null, 
                    linksMessage,
                    { parse_mode: 'Markdown' }
                );
            } else {
                await ctx.telegram.editMessageText(
                    ctx.chat.id, 
                    message.message_id, 
                    null, 
                    `❌ Ошибка при обновлении: ${result.error || 'Неизвестная ошибка'}`
                );
            }
        } catch (error) {
            console.error('Error in update_sheets action:', error);
            await ctx.reply('Произошла ошибка при обновлении Google Sheets.');
        }
    });

    // Handler for "Scheduler status" button
    bot.action('scheduler_status', async (ctx) => {
        try {
            // Get next update time (30 minutes from now)
            const now = new Date();
            const nextUpdate = new Date(now);
            // Set to next 30 minute mark
            nextUpdate.setMinutes(Math.ceil(nextUpdate.getMinutes() / 30) * 30);
            nextUpdate.setSeconds(0);
            nextUpdate.setMilliseconds(0);
            
            // If we're exactly at a 30 minute mark, add 30 minutes
            if (nextUpdate.getTime() === now.getTime()) {
                nextUpdate.setMinutes(nextUpdate.getMinutes() + 30);
            }
            
            // Format the next update time
            const nextUpdateStr = nextUpdate.toLocaleTimeString('ru-RU', { 
                hour: '2-digit', 
                minute: '2-digit'
            });
            
            const statusMessage = 
                '📊 Статус планировщика Google Sheets\n\n' +
                '✅ Планировщик активен\n' +
                `🕒 Частота обновления: каждые 30 минут\n` +
                `⏰ Следующее обновление: ${nextUpdateStr}\n\n` +
                'ℹ️ Обновляются следующие таблицы:\n' +
                '• Креативы в работе\n' +
                '• Выполненные креативы\n' +
                '• Все креативы\n' +
                '• Расписание сотрудников';
            
            await ctx.answerCbQuery();
            await ctx.reply(statusMessage);
        } catch (error) {
            console.error('Error in scheduler_status action:', error);
            await ctx.reply('Произошла ошибка при получении статуса планировщика.');
        }
    });
};

module.exports = { actions }; 