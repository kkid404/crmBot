const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

async function banManagement() {
    return Markup.keyboard([
        [ruMessage.keyboards.banManagement.ban_user],
        [ruMessage.keyboards.banManagement.unban_user],
        [ruMessage.keyboards.banManagement.back]
    ]).resize().oneTime();
}

module.exports = { banManagement };
