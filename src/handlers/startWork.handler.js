const ruMessage = require('../lang/ru.json');

module.exports = {
    handler: (bot) => {
        bot.hears([
            ruMessage.keyboards.shiftControl.start_shift,
            ruMessage.keyboards.shiftControl.end_shift
        ], 
            async (ctx) => {
                await ctx.scene.enter('startWorkScene');
            }
        );
    }
};
