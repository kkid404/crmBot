const { Markup } = require('telegraf');

/**
 * Генерация inline-клавиатуры с ближайшими 4 днями
 * @returns {Object} Inline-клавиатура с датами
 */
function date() {
    const today = new Date(); // Получаем текущую дату
    const keyboard = []; // Массив для хранения кнопок

    // Генерируем 4 даты, начиная с сегодняшнего дня
    for (let i = 0; i < 4; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i); // Добавляем i дней к текущей дате

        // Форматируем дату в формат "день.месяц" (например, "4.12")
        const formattedDate = `${date.getDate()}.${date.getMonth() + 1}`;

        // Создаем кнопку с датой
        keyboard.push([Markup.button.callback(formattedDate, `date_${formattedDate}`)]);
    }

    // Возвращаем inline-клавиатуру
    return Markup.inlineKeyboard(keyboard);
}

module.exports = { date };