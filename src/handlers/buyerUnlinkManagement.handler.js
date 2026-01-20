const ruMessage = require('../lang/ru.json');

module.exports = {
    handler: (bot) => {
        bot.hears('🔓 Удалить связь баеров', async (ctx) => {
            await ctx.scene.enter('buyerUnlinkManagementScene');
        });
    },
};
