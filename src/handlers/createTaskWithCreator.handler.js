const { isUser } = require('../middlewares/isUser.middleware');

module.exports = {
    handler: (bot) => {
        bot.hears('📝 Быстрое ТЗ', async (ctx) => {
            await ctx.scene.enter('createTaskWithCreatorScene');
        });
    },
    middleware: isUser
}; 