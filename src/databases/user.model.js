const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
    tg_id: { type: String, required: true, unique: true },
    username: { type: String, default: null },
    role: { 
        type: String, 
        default: 'user',
        enum: ['user', 'admin', 'cheker'],
    },
    position: { 
        type: String, 
        enum: ['buyer', 'creator', 'finance', 'owner'],
        default: null 
    },
    cheker: { type: Boolean, default: false }
}, {
    timestamps: true, 
});

const User = mongoose.model('User', userSchema);
module.exports = User;
