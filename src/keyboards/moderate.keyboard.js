const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function moderate(task, options = {}) {
  const buttons = [];
  
  // Добавляем кнопку полного описания если нужно
  if (options.hasFullDescription) {
    buttons.push([Markup.button.callback('📝 Полное описание', 'show_full_description')]);
  }
  
  // Проверяем, есть ли медиа-примеры
  let hasMediaExample = false;
  
  if (task && task.example_creative) {
    if (Array.isArray(task.example_creative) && task.example_creative.length > 0) {
      // Если пример - это массив, проверяем, есть ли в нём медиафайлы
      hasMediaExample = task.example_creative.some(example => 
        example.startsWith('AgAC') || example.startsWith('BAA') || 
        example.startsWith('BQA') || example.startsWith('CQA') || 
        example.startsWith('DQA')
      );
    } else if (typeof task.example_creative === 'string' && task.example_creative.trim() !== '') {
      // Если пример - это строка, проверяем, является ли она медиафайлом
      hasMediaExample = task.example_creative.startsWith('AgAC') || 
                        task.example_creative.startsWith('BAA') || 
                        task.example_creative.startsWith('BQA');
    }
  }
  
  Object.entries(ruMessage.keyboards.moderate).forEach(([callbackData, buttonText]) => {
    // Показываем кнопку "Показать пример" только если есть медиафайлы или текстовые примеры
    if (callbackData === 'show_example' && !task.example_creative) {
      return;
    }
    
    buttons.push([Markup.button.callback(buttonText, callbackData)]);
  });
  
  return Markup.inlineKeyboard(buttons);
}

module.exports = { moderate };