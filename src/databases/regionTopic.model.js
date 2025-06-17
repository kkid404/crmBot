const mongoose = require('mongoose');
const { Schema } = mongoose;

const regionTopicSchema = new Schema({
  chat_id: { type: String, required: true },
  region: { type: String, required: true },
  topic_id: { type: Number, required: true },
}, { timestamps: true });

// Создаем составной уникальный индекс по chat_id и region
regionTopicSchema.index({ chat_id: 1, region: 1 }, { unique: true });

module.exports = mongoose.model('RegionTopic', regionTopicSchema);
