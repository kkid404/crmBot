const mongoose = require('mongoose');
const { Schema } = mongoose;

const regionTopicSchema = new Schema({
  region:   { type: String, required: true, unique: true },
  topic_id: { type: Number, required: true },
}, { timestamps: true });

module.exports = mongoose.model('RegionTopic', regionTopicSchema);
