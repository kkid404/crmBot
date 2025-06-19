const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

async function buyerCreatorManagement() {
    return Markup.keyboard([
        [ruMessage.keyboards.buyerCreatorManagement.add_link],
        [ruMessage.keyboards.buyerCreatorManagement.remove_link],
        [ruMessage.keyboards.buyerCreatorManagement.view_links],
        [ruMessage.keyboards.buyerCreatorManagement.back]
    ]).resize().oneTime();
}

module.exports = { buyerCreatorManagement }; 