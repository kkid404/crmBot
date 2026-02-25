const mongoose = require('mongoose');
const { Schema } = mongoose;

const postponeRequestSchema = new Schema({
    task: { 
        type: Schema.Types.ObjectId, 
        ref: 'Task', 
        required: true,
        index: true
    },
    creator: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    reason: { 
        type: String, 
        required: true 
    },
    newDate: { 
        type: String, 
        required: true 
    }, // Format: DD.MM.YYYY
    newTime: { 
        type: String, 
        required: true 
    }, // Format: HH:MM
    status: { 
        type: String, 
        default: 'pending',
        enum: ['pending', 'approved', 'rejected'],
        index: true
    },
    processedBy: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        default: null 
    }, // Кто обработал запрос (админ/чекер)
    moderatorComment: { 
        type: String, 
        default: null 
    }, // Комментарий модератора для баера
    processedAt: { 
        type: Date, 
        default: null 
    }
}, {
    timestamps: true // Добавляет createdAt и updatedAt
});

// Составной индекс для быстрого поиска активных запросов по задаче
postponeRequestSchema.index({ task: 1, status: 1 });

const PostponeRequest = mongoose.model('PostponeRequest', postponeRequestSchema);
module.exports = PostponeRequest;
