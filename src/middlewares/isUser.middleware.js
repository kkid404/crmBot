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

    ctx.state.user = user; // Сохраняем информацию о пользователе в ctx.state
    await next(); // Переход к следующему middleware или обработчику
};