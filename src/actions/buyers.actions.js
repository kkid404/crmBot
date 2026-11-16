const userService = require('../services/user.service');
const ruMessage = require('../lang/ru.json');

function actions(bot) {
  // Классификация баера: наш / не наш
  bot.action(/^classify_buyer:([0-9a-fA-F]{24}):(our|not_our)$/, async (ctx) => {
    try {
      const buyerId = ctx.match[1];
      const flag = ctx.match[2];
      const isOur = flag === 'our';

      // Разрешим только админам (кнопки приходят админам-креативщикам при регистрации
      // и доступны админам в «Список баеров» → «Неотмеченные»)
      const actor = await userService.findUserByTelegramId(String(ctx.from.id));
      if (!actor || actor.role !== 'admin') {
        try { await ctx.answerCbQuery('Недостаточно прав'); } catch {}
        return;
      }

      const updated = await userService.setBuyerOurStatusById(buyerId, isOur);
      if (!updated) {
        try { await ctx.answerCbQuery('Пользователь не найден'); } catch {}
        return;
      }

      // Сообщаем баеру об открытии/закрытии доступа к боту
      try {
        if (isOur) {
          const { start } = require('../keyboards/start.keyboard');
          await ctx.telegram.sendMessage(updated.tg_id, ruMessage.messages.buyer_access_granted, await start(updated.tg_id));
        } else {
          await ctx.telegram.sendMessage(updated.tg_id, ruMessage.messages.buyer_access_denied, { reply_markup: { remove_keyboard: true } });
        }
      } catch (e) {
        console.error('classify_buyer: failed to notify buyer:', e?.description || e?.message || e);
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
