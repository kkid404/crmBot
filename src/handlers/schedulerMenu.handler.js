const ruMessage = require('../lang/ru.json');
const { isAdmin } = require('../middlewares/isAdmin.middleware');

/**
 * Handler to open the /scheduler panel from the admin start menu button.
 */
const handler = (bot) => {
  // Listen to the literal '/scheduler' button in admin menu
  bot.hears('/scheduler', isAdmin, async (ctx) => {
    try {
      const schedulerCommand = require('../commands/scheduler.command');
      await schedulerCommand.action(ctx);
    } catch (error) {
      console.error('Error in schedulerMenu handler:', error);
      await ctx.reply('Произошла ошибка при открытии панели планировщика.');
    }
  });
};

module.exports = { handler };
