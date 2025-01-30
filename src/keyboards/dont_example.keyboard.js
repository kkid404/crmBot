const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

async function dont_example() {
    return Markup.keyboard(ruMessage.keyboards.dont_example).resize().oneTime();
}

module.exports = { dont_example };