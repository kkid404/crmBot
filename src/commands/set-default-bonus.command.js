const { Markup } = require('telegraf');
const taskService = require('../services/task.service');
const { isAdmin } = require('../middlewares/isAdmin.middleware');

/**
 * Command to set default bonus for tasks without a bonus
 * Only accessible to admin users
 */
const action = async (ctx) => {
    try {
        // Initialize defaults in session
        if (typeof ctx.session.defaultBonus !== 'number') ctx.session.defaultBonus = 500;
        if (typeof ctx.session.bonusPeriod !== 'number') ctx.session.bonusPeriod = 30;

        // Ask user to provide a cutoff: either a date or number of days
        await ctx.reply('Введите дату в формате ДД.MM.ГГГГ до которой проставить штрафные бонусы ИЛИ введите количество дней (например, 30):');

        // Set state to wait for period input
        ctx.session.waitingForBonusPeriod = true;
        ctx.session.waitingForBonusAmount = false;
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
