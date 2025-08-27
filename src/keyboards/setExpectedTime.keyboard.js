const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

// Accept taskId and include it in callback data for global routing
function setExpectedTimeKeyboard(taskId) {
    const callbackData = taskId ? `set_expected_time:${taskId}` : 'set_expected_time';
    return Markup.inlineKeyboard([
        [Markup.button.callback('⏰ Установить время сдачи', callbackData)]
    ]);
}

module.exports = { setExpectedTimeKeyboard };
