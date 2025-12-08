const { isAdmin } = require('../middlewares/isAdmin.middleware');
const ruMessage = require('../lang/ru.json');

module.exports = {
    handler: (bot) => {
        bot.hears('🚫 Управление банами', async (ctx) => {
            await ctx.scene.enter('BanManagement');
        });
    },
    middleware: isAdmin
};
