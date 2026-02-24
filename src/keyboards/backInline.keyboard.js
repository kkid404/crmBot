const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function backInline(task = null, options = {}) {
  const inlineKeyboard = Object.entries(ruMessage.keyboards.backInline).map(([callbackData, buttonText]) => {
    return [Markup.button.callback(buttonText, callbackData)]; // Оборачиваем каждую кнопку в массив
  });
  
  // Если задача в состоянии 'time', добавляем кнопку для установки времени
  if (task && task.state === 'time') {
    inlineKeyboard.unshift([Markup.button.callback('⏰ Установить время', 'set_expected_time')]);
  }
  
  // Если задача в состоянии 'progress', добавляем кнопку для переноса дедлайна
  if (task && task.state === 'progress' && task._id) {
    inlineKeyboard.unshift([Markup.button.callback('📅 Перенести ТЗ', `postpone_deadline_${task._id}`)]);
  }
  
  // Добавляем кнопки для полного описания и правок
  if (options.hasFullDescription) {
    inlineKeyboard.unshift([Markup.button.callback('📝 Полное описание', 'show_full_description')]);
  }
  if (options.hasFullCorrections) {
    inlineKeyboard.unshift([Markup.button.callback('✏️ Полные правки', 'show_full_corrections')]);
  }
  
  return Markup.inlineKeyboard(inlineKeyboard);
}

module.exports = { backInline };