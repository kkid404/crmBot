const mongoose = require('mongoose');
const { Schema } = mongoose;

const buyerLinkSchema = new Schema({
    mainBuyer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    linkedBuyers: [{ type: Schema.Types.ObjectId, ref: 'User' }], // массив ObjectId связанных баеров
}, {
    timestamps: true,
});

const BuyerLink = mongoose.model('BuyerLink', buyerLinkSchema);
module.exports = BuyerLink;
