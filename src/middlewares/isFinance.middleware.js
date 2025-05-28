const ruMessage  = require('../lang/ru.json');
const userService = require('../services/user.service');
const { start }  = require('../keyboards/start.keyboard');

async function isFinance(ctx, next) {
  try {
    const user = await userService.findUserByTelegramId(ctx.from.id);
    if (!user) throw new Error('User not found');

    if (user.position === 'finance') {
      return next();
    }

    await ctx.reply(ruMessage.messages.errors.error_protected, await start(ctx.from.id));
  } catch (err) {
    console.error('[isFinance] ', err);
    await ctx.reply('Произошла ошибка');
  }
}
module.exports = { isFinance };