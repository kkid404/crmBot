const { Markup } = require('telegraf');

/**
 * Генерация inline-клавиатуры для выбора даты (Сегодня/Завтра)
 * @returns {Object} Inline-клавиатура с датами
 */
function date() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Форматируем даты в формат "день.месяц" (например, "20.1")
    const todayFormatted = `${today.getDate()}.${today.getMonth() + 1}`;
    const tomorrowFormatted = `${tomorrow.getDate()}.${tomorrow.getMonth() + 1}`;

    const keyboard = [
        [Markup.button.callback(`📅 Сегодня (${todayFormatted})`, `date_${todayFormatted}`)],
        [Markup.button.callback(`📅 Завтра (${tomorrowFormatted})`, `date_${tomorrowFormatted}`)],
        [Markup.button.callback('⬅️ Назад', 'back_to_task')]
    ];

    return Markup.inlineKeyboard(keyboard);
}

module.exports = { date };