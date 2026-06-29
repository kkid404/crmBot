const userService = require('../services/user.service');
const ruMessage = require('../lang/ru.json');

module.exports = async (ctx, next) => {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);

    if (!user) {
        await ctx.scene.enter('RegisterUser');
        return; // Останавливаем выполнение следующих middleware
    }

    // Проверка на бан пользователя
    if (user.isBan === true) {
        try {
            await ctx.reply(ruMessage.messages.user_banned);
        } catch (error) {
            console.error('Ошибка при отправке сообщения о бане:', error);
        }
        return; // Останавливаем выполнение, если пользователь забанен
    }

    ctx.state.user = user;

    // Креативщики работают через веб-интерфейс — в боте только уведомления
    if (user.position === 'creator') {
        const text = ctx.message?.text || ctx.callbackQuery?.data || '';
        const isStart = text === '/start' || text.startsWith('/start ');
        if (!isStart) {
            const { Markup } = require('telegraf');
            await ctx.reply(
                '🌐 Работа ведётся через сайт.',
                Markup.inlineKeyboard([[Markup.button.url('Перейти на сайт', 'http://wmacreoweb.shop/')]])
            );
            return;
        }
    }

    await next();
};