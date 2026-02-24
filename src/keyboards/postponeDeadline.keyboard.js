const { Markup } = require('telegraf');

/**
 * Клавиатура с кнопкой для переноса дедлайна задачи
 * @param {string} taskId - ID задачи
 * @returns {Object} Inline клавиатура
 */
const postponeDeadlineKeyboard = (taskId) => {
    return Markup.inlineKeyboard([
        [Markup.button.callback('📅 Перенести ТЗ', `postpone_deadline_${taskId}`)]
    ]);
};

module.exports = { postponeDeadlineKeyboard };
