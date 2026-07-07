const mongoose = require('mongoose');
const { Schema } = mongoose;

// Маппинг Telegram file_id → исходное имя файла (для скачивания с веба под нормальным именем)
const fileNameSchema = new Schema({
  file_id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('FileName', fileNameSchema);
