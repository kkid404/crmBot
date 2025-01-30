const ruMessage = require('../lang/ru.json');
const { isAdmin } = require('../middlewares/isAdmin.middleware')

module.exports = {
    handler: (bot) => {
        bot.hears(ruMessage.keyboards.startAdmin[0], 
            async (ctx) => {
                await ctx.scene.enter('positionReversalScene');
            }
        );
    },
    middleware: isAdmin
};