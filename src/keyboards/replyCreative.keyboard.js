const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function replyCreative() {
  const inlineKeyboard = Object.entries(ruMessage.keyboards.replyCreative).map(([callbackData, buttonText]) => {
    return [Markup.button.callback(buttonText, callbackData)]; // Оборачиваем каждую кнопку в массив
  });
  return Markup.inlineKeyboard(inlineKeyboard);
}

module.exports = { replyCreative };

