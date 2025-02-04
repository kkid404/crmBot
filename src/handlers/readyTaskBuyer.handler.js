const ruMessage = require('../lang/ru.json');
const { isAdmin } = require('../middlewares/isAdmin.middleware')

module.exports = {
    handler: (bot) => {
        bot.hears(ruMessage.keyboards.startBuyer.ReadyTz, 
            async (ctx) => {
                await ctx.scene.enter('watchReadyTzScene');
            }
        );
    },
    middleware: isAdmin
};