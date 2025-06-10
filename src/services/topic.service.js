const RegionTopic = require('../databases/regionTopic.model');

class TopicService {
  static cache = new Map();            // ускоряем повторные вызовы

  /** Вернём id существующего топика или создадим новый */
  static async getOrCreate(ctx, region) {
    if (this.cache.has(region)) return this.cache.get(region);

    let topic = await RegionTopic.findOne({ region });
    if (!topic) {
      const { message_thread_id } = await ctx.telegram.createForumTopic(
        process.env.FORUM_CHAT_ID,
        region.toUpperCase(),         // название темы
        { icon_color: +process.env.TOPIC_ICON_COLOR || undefined },
      );
      topic = await RegionTopic.create({ region, topic_id: message_thread_id });
    }

    this.cache.set(region, topic.topic_id);
    return topic.topic_id;
  }
}

module.exports = TopicService;
