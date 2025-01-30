const ruMessage = require('../lang/ru.json');
const userService = require('../services/user.service');
const { start } = require('../keyboards/start.keyboard');

async function isAdmin(ctx, next) {
    try {
        const userId = ctx.from.id;

        const isUserAdmin = await userService.isAdmin(userId);
        if (isUserAdmin) {
            await next();
        } else {
            await ctx.reply(ruMessage.messages.errors.error_protected, await start(ctx.from.id));
        }
    } catch (error) {
        console.error('Error in isAdmin middleware:', error);
        await ctx.reply('Произошла ошибка');
    }
}

module.exports = { isAdmin };