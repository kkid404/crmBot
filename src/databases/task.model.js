const mongoose = require('mongoose');
const { Schema } = mongoose;

const taskSchema = new Schema({
    name: { type: String, required: true, unique: true },
    link_app: { type: String, required: true },
    description: { type: String, required: true },
    example_creative: { type: String, default: null },
    state: { 
        type: String, 
        default: 'active',
        enum: ['active', 'progress', 'wait', 'done', 'failed', 'canceled'],
    },
    buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    creator: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    points: { type: Number, default: null }, 
    expectedDate: { type: Date, default: null },
    completionDate: { type: Date, default: null },
    CTR: { type: Number, default: null }, 
    bonus: { type: Number, default: null },
    version: { type: Number, default: 1 },
    result : { type: String, default: null },
}, {
    timestamps: true, // Добавляет createdAt и updatedAt
});

const Task = mongoose.model('Task', taskSchema);
module.exports = Task;
