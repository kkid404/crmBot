const { Markup } = require('telegraf');

/**
 * Клавиатура для выбора даты сдачи креатива
 * @returns {Object} Inline клавиатура с кнопками "Сегодня" и "Завтра"
 */
function selectDateKeyboard() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('📅 Сегодня', 'date_today')],
        [Markup.button.callback('📅 Завтра', 'date_tomorrow')]
    ]);
}

module.exports = { selectDateKeyboard };
