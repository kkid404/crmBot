const mongoose = require('mongoose');
const { Schema } = mongoose;

const taskSchema = new Schema({
    name: { type: String, required: true, unique: true },
    link_app: { type: String, default: null },
    description: { type: String, required: true },
    example_creative: { type: [String], default: [] },
    state: { 
        type: String, 
        default: 'active',
        enum: ['active', 'progress', 'time', 'wait', 'done', 'failed', 'canceled'],
        index: true, // Индекс для оптимизации запросов по статусу
    },
    buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // От лица какого баера создан заказ
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // Кто физически создал заказ
    creator: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    points: { type: Number, default: null }, 
    expectedDate: { type: Date, default: null },
    expectedTime: { type: String, default: null }, // Format: "HH:MM" (e.g. "21:12")
    reminderTime: { type: Date, default: null }, // For future reminder functionality
    completionDate: { type: Date, default: null },
    CTR: { type: Number, default: null }, 
    bonus: { type: Number, default: null },
    isPenaltyBonus: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
    result: { type: [String], default: [] },
    workType: { type: String, default: null },
    quantity: { type: Number, default: 1 }, // Количество креативов (для уников/глубоких уников)
    // Поля блокировки модерации, чтобы один чекер не мешал другому
    moderationLockedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    moderationLockedAt: { type: Date, default: null },
}, {
    timestamps: true, // Добавляет createdAt и updatedAt
});

const Task = mongoose.model('Task', taskSchema);
module.exports = Task;
