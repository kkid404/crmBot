const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function done_or_cancel() {
  const inlineKeyboard = Object.entries(ruMessage.keyboards.done_or_cancel).map(([callbackData, buttonText]) => {
    return [Markup.button.callback(buttonText, callbackData)]; // Оборачиваем каждую кнопку в массив
  });
  return Markup.inlineKeyboard(inlineKeyboard);
}

module.exports = { done_or_cancel };