const ruMessage = require('../lang/ru.json');

module.exports = {
    handler: (bot) => {
        bot.hears(ruMessage.keyboards.startAdmin[0], 
            async (ctx) => {
                await ctx.scene.enter('getTaskToModerateScene');
            }
        );
    }
};