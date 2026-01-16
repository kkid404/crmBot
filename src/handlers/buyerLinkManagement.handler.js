const { isAdmin } = require('../middlewares/isAdmin.middleware');

module.exports = {
    handler: (bot) => {
        bot.hears('🔗 Связать баеров', async (ctx) => {
            await ctx.scene.enter('buyerLinkManagementScene');
        });
    },
    middleware: isAdmin
};
