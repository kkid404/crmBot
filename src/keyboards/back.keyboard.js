const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function back() {
    return Markup.keyboard(ruMessage.keyboards.back).resize().oneTime();
}

module.exports = { back };