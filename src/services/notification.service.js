const { Markup } = require('telegraf');
const userService = require('./user.service');

let botInstance = null;

module.exports = {
  init(bot) {
    botInstance = bot;
  },

  async notifyCreatorsNewRound() {
    try {
      if (!botInstance) {
        console.warn('[NotificationService] Bot instance is not initialized; skip notifyCreatorsNewRound');
        return;
      }

      const allUsers = await userService.getAll();
      const creators = allUsers.filter(u => u.position === 'creator' && u.tg_id);

      if (!creators.length) return;

      const text = '🎯 Доступны новые задания!';
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('получить тз', 'open_task_pool')]
      ]);

      for (const u of creators) {
        try {
          await botInstance.telegram.sendMessage(u.tg_id, text, keyboard);
        } catch (err) {
          console.error(`[NotificationService] Failed to notify creator ${u.tg_id}:`, err?.description || err?.message || err);
        }
      }
    } catch (e) {
      console.error('[NotificationService] notifyCreatorsNewRound error:', e);
    }
  }
};
