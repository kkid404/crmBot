const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function setExpectedTimeKeyboard() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('⏰ Установить время сдачи', 'set_expected_time')]
    ]);
}

module.exports = { setExpectedTimeKeyboard };
