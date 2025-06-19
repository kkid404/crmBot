const { isAdmin } = require('../middlewares/isAdmin.middleware');
const ruMessage = require('../lang/ru.json');

module.exports = {
    handler: (bot) => {
        bot.hears('🔗 Управление связями', async (ctx) => {
            await ctx.scene.enter('BuyerCreatorManagement');
        });
    },
    middleware: isAdmin
};
