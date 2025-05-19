const { Markup } = require('telegraf');
const taskService = require('../services/task.service');
const { isAdmin } = require('../middlewares/isAdmin.middleware');

/**
 * Command to set default bonus for tasks without a bonus
 * Only accessible to admin users
 */
const action = async (ctx) => {
    try {
        // Calculate the cutoff date (30 days ago by default)
        const period = 30;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - period);
        
        // Format the date as DD.MM.YYYY
        const formattedDate = cutoffDate.toLocaleDateString('ru-RU');
        
        // Show confirmation keyboard with the specific date
        await ctx.reply(`Установить бонус 500 для всех выполненных заданий без бонуса до ${formattedDate} и далее?`, 
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Да, установить бонус', 'set_default_bonus')],
                [Markup.button.callback('⏱️ Изменить период (дней)', 'change_period')],
                [Markup.button.callback('❌ Отмена', 'cancel_bonus')]
            ])
        );
    } catch (error) {
        console.error('Error in set-default-bonus command:', error);
        await ctx.reply('Произошла ошибка при открытии панели установки бонуса.');
    }
};

module.exports = {
    command: 'setbonus',
    description: 'Установить бонус по умолчанию для заданий без бонуса',
    action,
    middleware: isAdmin
};
