const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function backInline(task = null) {
  const inlineKeyboard = Object.entries(ruMessage.keyboards.backInline).map(([callbackData, buttonText]) => {
    return [Markup.button.callback(buttonText, callbackData)]; // Оборачиваем каждую кнопку в массив
  });
  
  // Если задача в состоянии 'time', добавляем кнопку для установки времени
  if (task && task.state === 'time') {
    inlineKeyboard.unshift([Markup.button.callback('⏰ Установить время', 'set_expected_time')]);
  }
  
  return Markup.inlineKeyboard(inlineKeyboard);
}

module.exports = { backInline };