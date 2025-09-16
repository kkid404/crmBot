const mongoose = require('mongoose');

const RoundStateSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true
    },
    roundStartTime: {
        type: Date,
        default: null
    },
    roundTasks: {
        type: Map, // ключ: buyerId, значение: массив taskId
        of: [String],
        default: {}
    },
    processedTaskIds: {
        type: [String], // массив уже выданных задач текущего круга
        default: []
    }
});

module.exports = mongoose.model('RoundState', RoundStateSchema);

