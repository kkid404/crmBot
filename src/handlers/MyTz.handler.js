const ruMessage = require('../lang/ru.json');

module.exports = {
    handler: (bot) => {
        bot.hears(ruMessage.keyboards.startBuyer.MyTz, 
            async (ctx) => {
                await ctx.scene.enter('MyTzBuyerScene');
            }
        );
    }
};