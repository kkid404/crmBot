const userService = require('../services/user.service');
const ruMessage = require('../lang/ru.json');

function actions(bot) {
  // Классификация баера: наш / не наш
  bot.action(/^classify_buyer:([0-9a-fA-F]{24}):(our|not_our)$/, async (ctx) => {
    try {
      const buyerId = ctx.match[1];
      const flag = ctx.match[2];
      const isOur = flag === 'our';

      // Разрешим только админам-креативщикам
      const actor = await userService.findUserByTelegramId(String(ctx.from.id));
      if (!actor || actor.role !== 'admin' || actor.position !== 'creator') {
        try { await ctx.answerCbQuery('Недостаточно прав'); } catch {}
        return;
      }

      const updated = await userService.setBuyerOurStatusById(buyerId, isOur);
      if (!updated) {
        try { await ctx.answerCbQuery('Пользователь не найден'); } catch {}
        return;
      }

      const statusText = isOur ? ruMessage.messages.classify_buyer.our : ruMessage.messages.classify_buyer.not_our;
      const newText = `${ruMessage.messages.classify_buyer.new_buyer.replace('{username}', updated.username || updated.tg_id)}\n${ruMessage.messages.classify_buyer.updated.replace('{status}', statusText)}`;

      try {
        await ctx.editMessageText(newText);
        await ctx.answerCbQuery('Обновлено');
      } catch (e) {
        // Fallback если редактирование не удалось (например, уже изменено)
        try { await ctx.answerCbQuery('Статус обновлён'); } catch {}
      }
    } catch (e) {
      console.error('classify_buyer action error:', e);
      try { await ctx.answerCbQuery('Ошибка'); } catch {}
    }
  });
}

module.exports = { actions };
