const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function tzBuyers() {
    const buttons = Object.values(ruMessage.keyboards.tzBuyers);

    // Создаем клавиатуру
    return Markup.keyboard([buttons]).resize().oneTime();
}

module.exports = { tzBuyers };