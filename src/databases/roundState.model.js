const mongoose = require('mongoose');

const RoundStateSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true // всегда один документ на всю очередь
    },
    processedBuyers: {
        type: [String], // массив ID покупателей
        default: []
    },
    roundStartTime: {
        type: Date,
        default: null // чтобы можно было проверить и восстановить при первом запуске
    }
});

module.exports = mongoose.model('RoundState', RoundStateSchema);
