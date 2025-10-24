const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function selected_or_back(options = {}) {
  const buttons = [];
  
  if (options.hasFullDescription) {
    buttons.push([Markup.button.callback('📝 Полное описание', 'show_full_description')]);
  }
  
  Object.entries(ruMessage.keyboards.selected_or_back).forEach(([callbackData, buttonText]) => {
    buttons.push([Markup.button.callback(buttonText, callbackData)]);
  });
  
  return Markup.inlineKeyboard(buttons);
}

module.exports = { selected_or_back };