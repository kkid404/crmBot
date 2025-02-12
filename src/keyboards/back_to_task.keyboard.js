const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function back_to_task() {
  const inlineKeyboard = Object.entries(ruMessage.keyboards.back_to_task).map(([callbackData, buttonText]) => {
    return [Markup.button.callback(buttonText, callbackData)]; // Оборачиваем каждую кнопку в массив
  });
  return Markup.inlineKeyboard(inlineKeyboard);
}

module.exports = { back_to_task };