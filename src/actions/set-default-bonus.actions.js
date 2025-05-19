const taskService = require('../services/task.service');
const { Markup } = require('telegraf');

/**
 * Action handlers for setting default bonus
 */
const actions = (bot) => {
    // Handler for "Set default bonus" button
    bot.action('set_default_bonus', async (ctx) => {
        try {
            await ctx.answerCbQuery('Устанавливаем бонус...');
            
            // Calculate the cutoff date based on the period
            const timeFrame = ctx.session.bonusPeriod || 30;
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - timeFrame);
            
            // Format the date as DD.MM.YYYY
            const formattedDate = cutoffDate.toLocaleDateString('ru-RU');
            
            // Show processing message with the specific date
            const message = await ctx.reply(`🔄 Устанавливаем бонус 500 для всех заданий без бонуса до ${formattedDate} и далее...`);
            
            // Default values
            const defaultBonus = 500;
            
            // Call the service to set default bonus
            const result = await taskService.setDefaultBonus(defaultBonus, timeFrame);
            
            if (result.success) {
                await ctx.telegram.editMessageText(
                    ctx.chat.id, 
                    message.message_id, 
                    null, 
                    `✅ ${result.message}\n\nНайдено заданий: ${result.matchedCount}\nОбновлено заданий: ${result.modifiedCount}`
                );
            } else {
                await ctx.telegram.editMessageText(
                    ctx.chat.id, 
                    message.message_id, 
                    null, 
                    `❌ Ошибка при установке бонуса: ${result.message}`
                );
            }
        } catch (error) {
            console.error('Error setting default bonus:', error);
            await ctx.reply('❌ Произошла ошибка при установке бонуса.');
        }
    });

    // Handler for "Change period" button
    bot.action('change_period', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            
            // Ask for new period
            await ctx.reply('Введите количество дней для поиска заданий без бонуса (например, 30):');
            
            // Set state to wait for period input
            ctx.session.waitingForBonusPeriod = true;
            
        } catch (error) {
            console.error('Error in change_period action:', error);
            await ctx.reply('❌ Произошла ошибка при изменении периода.');
        }
    });

    // Handler for "Cancel" button
    bot.action('cancel_bonus', async (ctx) => {
        try {
            await ctx.answerCbQuery('Операция отменена');
            await ctx.deleteMessage();
            await ctx.reply('❌ Операция установки бонуса отменена.');
        } catch (error) {
            console.error('Error in cancel_bonus action:', error);
        }
    });

    // Handler for text input when waiting for period
    bot.on('text', async (ctx, next) => {
        // Check if we're waiting for period input
        if (ctx.session.waitingForBonusPeriod) {
            const text = ctx.message.text;
            const period = parseInt(text);
            
            if (isNaN(period) || period <= 0) {
                await ctx.reply('❌ Пожалуйста, введите корректное число дней (положительное целое число).');
                return;
            }
            
            // Save the period to session
            ctx.session.bonusPeriod = period;
            ctx.session.waitingForBonusPeriod = false;
            
            // Calculate the cutoff date based on the new period
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - period);
            
            // Format the date as DD.MM.YYYY
            const formattedDate = cutoffDate.toLocaleDateString('ru-RU');
            
            // Show confirmation with the specific date
            await ctx.reply(`Установить бонус 500 для всех выполненных заданий без бонуса до ${formattedDate} и далее?`, 
                Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Да, установить бонус', 'set_default_bonus')],
                    [Markup.button.callback('⏱️ Изменить период (дней)', 'change_period')],
                    [Markup.button.callback('❌ Отмена', 'cancel_bonus')]
                ])
            );
            
            return;
        }
        
        // If we're not waiting for period input, pass to next middleware
        return next();
    }, (ctx, next) => next());
};

module.exports = { actions };
