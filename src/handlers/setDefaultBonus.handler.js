const ruMessage = require('../lang/ru.json');
const { isAdmin } = require('../middlewares/isAdmin.middleware');

/**
 * Handler for the "Установить бонус" button in the admin keyboard
 */
const handler = (bot) => {
    // Handler for the "Установить бонус" button
    bot.hears(ruMessage.keyboards.startAdmin[3], 
        isAdmin,
        async (ctx) => {
            try {
                // Execute the setbonus command
                const setDefaultBonusCommand = require('../commands/set-default-bonus.command');
                await setDefaultBonusCommand.action(ctx);
            } catch (error) {
                console.error('Error in setDefaultBonus handler:', error);
                await ctx.reply('Произошла ошибка при открытии панели установки бонуса.');
            }
        }
    );
};

module.exports = { handler };
