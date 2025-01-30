const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function moderate() {
  const inlineKeyboard = Object.entries(ruMessage.keyboards.moderate).map(([callbackData, buttonText]) => {
    return [Markup.button.callback(buttonText, callbackData)]; // Оборачиваем каждую кнопку в массив
  });
  return Markup.inlineKeyboard(inlineKeyboard);
}

module.exports = { moderate };