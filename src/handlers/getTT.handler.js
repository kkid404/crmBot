const ruMessage = require('../lang/ru.json');

module.exports = {
    handler: (bot) => {
        bot.hears(ruMessage.keyboards.startCreo[0], 
            async (ctx) => {
                await ctx.scene.enter('getTTScene');
            }
        );
    }
};