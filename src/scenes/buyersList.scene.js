const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { buyersList } = require('../keyboards/buyersList.keyboard');
const userService = require('../services/user.service');
const { start } = require('../keyboards/start.keyboard');

const BuyersListScene = new BaseScene('buyersListScene');

BuyersListScene.enter(async (ctx) => {
  try {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    if (!user || user.role !== 'admin') {
      await ctx.reply(ruMessage.messages.errors.error_protected, await start(ctx.from.id));
      return ctx.scene.leave();
    }
    await ctx.reply(ruMessage.messages.buyersList.title, await buyersList());
    ctx.session.buyersListState = 'main';
  } catch (e) {
    console.error('buyersListScene.enter error:', e);
    await ctx.reply('Произошла ошибка. Попробуйте позже.', await start(ctx.from.id));
    return ctx.scene.leave();
  }
});

BuyersListScene.on('text', async (ctx) => {
  const text = ctx.message.text;
  const kb = ruMessage.keyboards.buyersList;
  if (text === kb.back) {
    await ctx.reply('Возврат в главное меню администратора.', await start(ctx.from.id));
    return ctx.scene.leave();
  }

  try {
    let filter = {};
    if (text === kb.ours) filter = { isOur: true };
    else if (text === kb.externals) filter = { isOur: false };
    else if (text === kb.banned) filter = { isBan: true };
    else {
      await ctx.reply(ruMessage.messages.buyersList.title, await buyersList());
      return;
    }

    const buyers = await userService.findBuyers(filter);
    if (!buyers || buyers.length === 0) {
      await ctx.reply(ruMessage.messages.buyersList.empty);
      return;
    }

    const lines = buyers.map(b => {
      const username = b.username ? b.username : b.tg_id;
      return ruMessage.messages.buyersList.item
        .replace('{username}', username)
        .replace('{tg}', b.tg_id);
    });

    await ctx.reply(lines.join('\n'));
  } catch (e) {
    console.error('buyersListScene text handler error:', e);
    await ctx.reply('Ошибка получения списка. Попробуйте позже.');
  }
});

module.exports = BuyersListScene;
