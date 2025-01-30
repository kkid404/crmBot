const userService = require('../services/user.service');

module.exports = async (ctx, next) => {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);

    if (!user) {
        await ctx.scene.enter('RegisterUser');
        return; // Останавливаем выполнение следующих middleware
    }

    ctx.state.user = user; // Сохраняем информацию о пользователе в ctx.state
    await next(); // Переход к следующему middleware или обработчику
};