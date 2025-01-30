const mongoose = require('mongoose');
const { Schema } = mongoose;

const taskChekerSchema = new Schema({
    taskId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    chekerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status : { 
        type: String, 
        enum: ['done', 'failed'],
    },
    version: { type: Number, required: true }, 
    message: { type: String, default: null }
}, {
    timestamps: true, 
});

const TaskCheker = mongoose.model('TaskCheker', taskChekerSchema);
module.exports = TaskCheker;
