const { isAdmin } = require('../middlewares/isAdmin.middleware')
const ruMessage = require('../lang/ru.json');

module.exports = {
    handler: (bot) => {
        bot.hears(ruMessage.keyboards.startAdmin[1], 
            async (ctx) => {
                await ctx.scene.enter('adminTasksInProgressScene');
            }
        );
    },
    middleware: isAdmin
};