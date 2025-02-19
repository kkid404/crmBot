const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function statistics() {
  const inlineKeyboard = Object.entries(ruMessage.keyboards.statistics)
    // Фильтруем, исключая кнопку backToStatMenu
    .filter(([key]) => key !== 'backToStatMenu')
    .map(([callbackData, buttonText]) => {
      return [Markup.button.callback(buttonText, callbackData)]; // Оборачиваем каждую кнопку в массив
    });
  return Markup.inlineKeyboard(inlineKeyboard);
}

module.exports = { statistics };