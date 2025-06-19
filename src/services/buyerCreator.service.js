const BuyerCreator = require('./../databases/buyerCreator.model');

class BuyerCreatorService {
    static async create(buyerId, creatorIds = []) {
        const doc = new BuyerCreator({ buyer: buyerId, creators: creatorIds });
        return doc.save();
    }

    static async addCreator(buyerId, creatorId) {
        return BuyerCreator.findOneAndUpdate(
            { buyer: buyerId },
            { $addToSet: { creators: creatorId } },
            { new: true, upsert: true }
        );
    }

    static async removeCreator(buyerId, creatorId) {
        return BuyerCreator.findOneAndUpdate(
            { buyer: buyerId },
            { $pull: { creators: creatorId } },
            { new: true }
        );
    }

    static async getCreatorsByBuyer(buyerId) {
        return BuyerCreator.findOne({ buyer: buyerId }).populate('creators');
    }

    static async getBuyersByCreator(creatorId) {
        return BuyerCreator.find({ creators: creatorId }).populate('buyer');
    }

    static async deleteByBuyer(buyerId) {
        return BuyerCreator.findOneAndDelete({ buyer: buyerId });
    }
}

module.exports = BuyerCreatorService; 