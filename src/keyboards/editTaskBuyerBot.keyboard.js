const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function editTaskBuyerBot() {
  const inlineKeyboard = Object.entries(ruMessage.keyboards.editTaskBuyerBot).map(([callbackData, buttonText]) => {
    return [Markup.button.callback(buttonText, callbackData)]; // Оборачиваем каждую кнопку в массив
  });
  return Markup.inlineKeyboard(inlineKeyboard);
}

module.exports = { editTaskBuyerBot };