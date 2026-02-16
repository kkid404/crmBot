const { isAdmin } = require('../middlewares/isAdmin.middleware');

module.exports = {
  handler: (bot) => {
    bot.hears('📋 Список баеров', async (ctx) => {
      await ctx.scene.enter('buyersListScene');
    });
  },
  middleware: isAdmin
};
