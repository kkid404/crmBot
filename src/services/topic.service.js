/**
 * TopicService
 * ------------
 * Для каждой пары (chatId, region) хранит/создаёт отдельную тему форума
 * и кэширует ID на время жизни процесса.
 */
const RegionTopic = require('../databases/regionTopic.model');

// Простейший in-memory-кэш:  "chatId:REGION"  →  topic_id
const CACHE = new Map();

class TopicService {
  /**
   * Вернуть `message_thread_id` темы форума или создать новую.
   * @param {import('telegraf').Context} ctx — контекст из обработчика
   * @param {string|number}              chatId
   * @param {string}                     region — код («DE», «ZA»…)
   * @returns {Promise<number>}          topic_id
   */
  static async getOrCreate(ctx, chatId, region) {
    const key = `${chatId}:${region.toUpperCase()}`;

    // 1) быстрый ответ из памяти
    if (CACHE.has(key)) return CACHE.get(key);

    // 2) ищем сохранённую запись в БД
    let rec = await RegionTopic.findOne({ chat_id: chatId, region });

    // 3) если такой темы ещё нет — создаём её в ЭТОМ чате
    if (!rec) {
      const { message_thread_id } = await ctx.telegram.callApi('createForumTopic', {
        chat_id: chatId,
        name: region.toUpperCase(),
        ...(process.env.TOPIC_ICON_COLOR && {
          icon_color: +process.env.TOPIC_ICON_COLOR,
        }),
      });

      rec = await RegionTopic.create({
        chat_id: chatId,
        region,
        topic_id: message_thread_id,
      });
    }

    // 4) кладём в кэш и возвращаем
    CACHE.set(key, rec.topic_id);
    return rec.topic_id;
  }

  /** По желанию: очистка кэша (например, по расписанию) */
  static clearCache() {
    CACHE.clear();
  }
}

module.exports = TopicService;
