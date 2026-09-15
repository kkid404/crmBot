const mongoose = require('mongoose');
const { Schema } = mongoose;

// Команды баеров. Заводятся на сайте (Связи → Команды баеров), бот только читает.
const buyerTeamSchema = new Schema({
    name: { type: String, required: true, trim: true },
    buyers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    teamLead: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, {
    timestamps: true,
});

const BuyerTeam = mongoose.models.BuyerTeam || mongoose.model('BuyerTeam', buyerTeamSchema);
module.exports = BuyerTeam;
