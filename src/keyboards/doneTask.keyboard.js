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
  
  Object.entries(ruMessage.keyboards.doneTask).forEach(([callbackData, buttonText]) => {
    if (callbackData === 'show_example' && !isMediaExample) {
      return;
    }
    
    buttons.push([Markup.button.callback(buttonText, callbackData)]);
  });
  
  return Markup.inlineKeyboard(buttons);
}

module.exports = { doneTask };