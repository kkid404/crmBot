const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');

async function buyersList() {
  const kb = ruMessage.keyboards.buyersList;
  return Markup.keyboard([
    [kb.ours],
    [kb.externals],
    [kb.banned],
    [kb.back]
  ]).resize().oneTime();
}

module.exports = { buyersList };
