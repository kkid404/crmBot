const mongoose = require('mongoose');
const { Schema } = mongoose;

const buyerCreatorSchema = new Schema({
    buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    creators: [{ type: Schema.Types.ObjectId, ref: 'User' }], // массив ObjectId креативщиков
}, {
    timestamps: true,
});

const BuyerCreator = mongoose.model('BuyerCreator', buyerCreatorSchema);
module.exports = BuyerCreator; 