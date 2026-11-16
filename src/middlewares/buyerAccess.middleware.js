const userService = require('../services/user.service');
const ruMessage = require('../lang/ru.json');

/**
 * Пускает в бота только баеров, отмеченных как «Наш».
 * Подключается ДО stage-middleware, чтобы нельзя было продолжить работу внутри сцены.
 * Незарегистрированных пропускает дальше — их обработает регистрация.
 */
module.exports = async (ctx, next) => {
    if (!ctx.from) return next();

    const user = await userService.findUserByTelegramId(String(ctx.from.id));
    if (!userService.isBuyerWithoutAccess(user)) return next();

    // Выкидываем из текущей сцены, чтобы после открытия доступа не попасть в старый шаг
    if (ctx.session?.__scenes) delete ctx.session.__scenes;

    const text = user.isOur === false
        ? ruMessage.messages.buyer_access_denied
        : ruMessage.messages.buyer_access_pending;

    try {
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery(text, { show_alert: true });
        } else if (ctx.message && ctx.chat?.type === 'private') {
            await ctx.reply(text, { reply_markup: { remove_keyboard: true } });
        }
    } catch (error) {
        console.error('[buyerAccess] Failed to notify buyer:', error?.description || error?.message || error);
    }
};
