const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function selected_or_back() {
  const inlineKeyboard = Object.entries(ruMessage.keyboards.selected_or_back).map(([callbackData, buttonText]) => {
    return [Markup.button.callback(buttonText, callbackData)]; // Оборачиваем каждую кнопку в массив
  });
  return Markup.inlineKeyboard(inlineKeyboard);
}

module.exports = { selected_or_back };