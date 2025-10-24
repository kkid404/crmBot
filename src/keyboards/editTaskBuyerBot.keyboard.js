const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

function editTaskBuyerBot(options = {}) {
  const buttons = [];
  
  if (options.hasFullDescription) {
    buttons.push([Markup.button.callback('📝 Полное описание', 'show_full_description')]);
  }
  
  Object.entries(ruMessage.keyboards.editTaskBuyerBot).forEach(([callbackData, buttonText]) => {
    buttons.push([Markup.button.callback(buttonText, callbackData)]);
  });
  
  return Markup.inlineKeyboard(buttons);
}

module.exports = { editTaskBuyerBot };