const cron = require('node-cron');
const User = require('../databases/user.model');

/**
 * Service that updates usernames from Telegram by tg_id once per day.
 * We need bot.telegram to call getChat for each user.
 */
class UsernameUpdaterService {
  constructor() {
    this._job = null;
    this._bot = null;
  }

  init(bot) {
    this._bot = bot;
    if (this._job) {
      this._job.stop();
      this._job = null;
    }

    // Run daily at 03:00 server time
    this._job = cron.schedule('0 3 * * *', async () => {
      try {
        await this.updateAllUsernames();
      } catch (e) {
        console.error('[UsernameUpdater] Scheduled run failed:', e);
      }
    });

    console.log('[UsernameUpdater] Daily username updater scheduled at 03:00');
  }

  async updateAllUsernames() {
    if (!this._bot) {
      console.warn('[UsernameUpdater] Bot instance not set, skipping run');
      return { success: false, error: 'NO_BOT' };
    }

    const telegram = this._bot.telegram;
    const users = await User.find({}, { _id: 1, tg_id: 1, username: 1 }).lean();
    console.log(`[UsernameUpdater] Checking ${users.length} users...`);

    let updated = 0;
    for (const u of users) {
      const tgId = u.tg_id;
      if (!tgId) continue;

      try {
        // getChat returns chat info including username if public; for private users, it often still has username
        const chat = await telegram.getChat(tgId);
        const newUsername = chat?.username || null;
        if (newUsername && newUsername !== u.username) {
          await User.updateOne({ _id: u._id }, { $set: { username: newUsername } });
          updated += 1;
        }
      } catch (err) {
        // Commonly occurs if the bot has no access to user chat; ignore but continue.
        console.warn(`[UsernameUpdater] Failed to get chat for tg_id=${tgId}: ${err?.message}`);
      }

      // Be gentle to Telegram API
      await new Promise(res => setTimeout(res, 100));
    }

    console.log(`[UsernameUpdater] Updated usernames for ${updated} users`);
    return { success: true, updated, total: users.length };
  }
}

module.exports = new UsernameUpdaterService();
