const mongoose = require('mongoose');
const { Schema } = mongoose;

const revisionRequestSchema = new Schema({
    task: { 
        type: Schema.Types.ObjectId, 
        ref: 'Task', 
        required: true,
        index: true
    },
    buyer: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    creator: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    buyerMessage: { 
        type: String, 
        required: true 
    }, // Сообщение с правками от баера
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
    }, // Комментарий модератора для креативщика
    processedAt: { 
        type: Date, 
        default: null 
    }
}, {
    timestamps: true // Добавляет createdAt и updatedAt
});

// Составной индекс для быстрого поиска активных запросов по задаче
revisionRequestSchema.index({ task: 1, status: 1 });
revisionRequestSchema.index({ status: 1, createdAt: -1 });

const RevisionRequest = mongoose.model('RevisionRequest', revisionRequestSchema);
module.exports = RevisionRequest;
