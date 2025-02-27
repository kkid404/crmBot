const { Markup } = require('telegraf');

function createKeyboard(buttons, options = {}) {
    const keyboard = Markup.keyboard(buttons).resize();
    
    // Добавляем функцию удаления клавиатуры
    return {
        ...keyboard,
        reply_markup: {
            ...keyboard.reply_markup,
            remove_keyboard: true
        }
    };
}

// Функция для удаления клавиатуры
function removeKeyboard() {
    return Markup.removeKeyboard();
}

module.exports = { createKeyboard, removeKeyboard }; 