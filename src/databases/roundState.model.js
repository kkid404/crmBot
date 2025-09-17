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
        type: Object, // Changed from Map to Object
        of: [String],
        default: {}
    },
    processedTaskIds: {
        type: [String], // массив уже выданных задач текущего круга
        default: []
    }
});

// Add a pre-save hook to ensure roundTasks is always an object
RoundStateSchema.pre('save', function(next) {
    if (this.roundTasks && this.roundTasks instanceof Map) {
        // Convert Map to plain object
        const plainObject = {};
        for (const [key, value] of this.roundTasks.entries()) {
            plainObject[key] = Array.isArray(value) ? value : [String(value)];
        }
        this.roundTasks = plainObject;
    } else if (typeof this.roundTasks === 'string') {
        try {
            // If it's a string, try to parse it
            this.roundTasks = JSON.parse(this.roundTasks);
        } catch (e) {
            console.error('Error parsing roundTasks:', e);
            this.roundTasks = {};
        }
    } else if (!this.roundTasks || typeof this.roundTasks !== 'object') {
        this.roundTasks = {};
    }
    next();
});

module.exports = mongoose.model('RoundState', RoundStateSchema);

