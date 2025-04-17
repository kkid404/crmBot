const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

async function dont_example() {
    return Markup.inlineKeyboard([
        Markup.button.callback(ruMessage.keyboards.dont_example[0], 'no_example')
    ]);
}

module.exports = { dont_example };