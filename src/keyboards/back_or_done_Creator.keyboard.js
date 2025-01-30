const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function back_or_done_Creator() {
  const inlineKeyboard = Object.entries(ruMessage.keyboards.back_or_done_Creator).map(([callbackData, buttonText]) => {
    return [Markup.button.callback(buttonText, callbackData)]; // Оборачиваем каждую кнопку в массив
  });
  return Markup.inlineKeyboard(inlineKeyboard);
}

module.exports = { back_or_done_Creator };