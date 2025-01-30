const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

async function admin() {
    return Markup.keyboard(ruMessage.keyboards.startAdmin).resize().oneTime();
}

module.exports = { admin };