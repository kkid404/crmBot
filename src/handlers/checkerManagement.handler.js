const ruMessage = require('../lang/ru.json');

module.exports = {
  handler: (bot) => {
    bot.hears('🛡 Управление чекерами', async (ctx) => {
      await ctx.scene.enter('checkerManagementScene');
    });
  }
};
