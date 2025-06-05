// roundState.model.js
const mongoose = require('mongoose');

const RoundStateSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true // чтобы всегда был один документ на всю очередь
    },
    processedBuyers: {
        type: [String], // массив ID покупателей
        default: []
    }
});

module.exports = mongoose.model('RoundState', RoundStateSchema);