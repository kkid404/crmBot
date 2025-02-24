const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function doneTask(task) {
  const buttons = [];
  
  const isMediaExample = task && task.example_creative && 
    (task.example_creative.startsWith('AgAC') || task.example_creative.startsWith('BAAC')) &&
    task.example_creative.length > 10;
  
  Object.entries(ruMessage.keyboards.doneTask).forEach(([callbackData, buttonText]) => {
    if (callbackData === 'show_example' && !isMediaExample) {
      return;
    }
    
    buttons.push([Markup.button.callback(buttonText, callbackData)]);
  });
  
  return Markup.inlineKeyboard(buttons);
}

module.exports = { doneTask };