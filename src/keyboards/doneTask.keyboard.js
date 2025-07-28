const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function doneTask(task) {
  const buttons = [];
  
  // Проверяем, есть ли пример креатива и в каком он формате
  let isMediaExample = false;
  
  // Проверяем, имеется ли пример креатива и в каком он формате
  if (task && task.example_creative) {
    // Если example_creative - строка
    if (typeof task.example_creative === 'string') {
      isMediaExample = task.example_creative.startsWith('AgAC') || 
                       task.example_creative.startsWith('BAAC') ||
                       task.example_creative.startsWith('BAA') ||
                       task.example_creative.startsWith('BQA') ||
                       task.example_creative.startsWith('CQA') ||
                       task.example_creative.startsWith('DQA');
    } 
    // Если example_creative - массив
    else if (Array.isArray(task.example_creative) && task.example_creative.length > 0) {
      // Проверяем, есть ли в массиве хотя бы один медиафайл
      isMediaExample = task.example_creative.some(example => 
        typeof example === 'string' && (
          example.startsWith('AgAC') || 
          example.startsWith('BAAC') ||
          example.startsWith('BAA') ||
          example.startsWith('BQA') ||
          example.startsWith('CQA') ||
          example.startsWith('DQA')
        )
      );
    }
  }
  
  // Create a flat array of button objects first
  const buttonsList = [];
  
  Object.entries(ruMessage.keyboards.doneTask).forEach(([callbackData, buttonText]) => {
    if (callbackData === 'show_example' && !isMediaExample) {
      return;
    }
    
    buttonsList.push(Markup.button.callback(buttonText, callbackData));
  });
  
  // В зависимости от роли и статуса задачи будем показывать разные кнопки
  // if (task.state === 'done') {
  //   // Add reject button for buyers to send tasks back to creators
  //   buttonsList.push(Markup.button.callback('❌ Отклонить', 'reject_task'));
  // }
  
  // Добавляем кнопки назад и выйти
  buttonsList.push(Markup.button.callback('◀️ Назад', 'back'));
  buttonsList.push(Markup.button.callback('🚪 Выйти', 'quit'));
  
  // Группируем кнопки по 2 в ряд, кроме последней строки
  const keyboard = [];
  for (let i = 0; i < buttonsList.length; i += 2) {
    if (i + 1 < buttonsList.length) {
      keyboard.push([buttonsList[i], buttonsList[i + 1]]);
    } else {
      keyboard.push([buttonsList[i]]);
    }
  }
  
  return Markup.inlineKeyboard(keyboard);
}

module.exports = { doneTask };