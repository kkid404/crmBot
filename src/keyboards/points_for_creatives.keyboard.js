const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function points_for_creatives() {
  const inlineKeyboard = Object.entries(ruMessage.keyboards.points_for_creatives).map(([callbackData, buttonText]) => {
    return [Markup.button.callback(buttonText, `count_${callbackData}`)]; // Оборачиваем каждую кнопку в массив
  });
  return Markup.inlineKeyboard(inlineKeyboard);
}

module.exports = { points_for_creatives };