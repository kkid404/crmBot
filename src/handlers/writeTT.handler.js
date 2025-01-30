const ruMessage = require('../lang/ru.json');

module.exports = {
    handler: (bot) => {
        bot.hears(ruMessage.keyboards.startBuyer.createTz, 
            async (ctx) => {
                await ctx.scene.enter('writeTTScene');
            }
        );
    }
};