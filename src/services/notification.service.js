const { Markup } = require('telegraf');
const userService = require('./user.service');
const ruMessage = require('../lang/ru.json');

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
  ,

  /** Уведомить админов-креативщиков о новом баере с кнопками классификации */
  async notifyCreatorAdminsNewBuyer(user) {
    try {
      if (!botInstance) {
        console.warn('[NotificationService] Bot instance is not initialized; skip notifyCreatorAdminsNewBuyer');
        return;
      }
      if (!user || user.position !== 'buyer') return;

      const creatorAdmins = await userService.findCreatorAdmins();
      if (!creatorAdmins?.length) return;

      const text = ruMessage.messages.classify_buyer.new_buyer
        .replace('{username}', user.username || user.tg_id);

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback(ruMessage.messages.classify_buyer.our, `classify_buyer:${user._id}:our`),
          Markup.button.callback(ruMessage.messages.classify_buyer.not_our, `classify_buyer:${user._id}:not_our`)
        ]
      ]);

      for (const admin of creatorAdmins) {
        if (!admin.tg_id) continue;
        try {
          await botInstance.telegram.sendMessage(admin.tg_id, text, keyboard);
        } catch (err) {
          console.error(`[NotificationService] Failed to notify creator admin ${admin.tg_id}:`, err?.description || err?.message || err);
        }
      }
    } catch (e) {
      console.error('[NotificationService] notifyCreatorAdminsNewBuyer error:', e);
    }
  }
};
