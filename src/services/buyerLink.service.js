const BuyerLink = require('./../databases/buyerLink.model');

class BuyerLinkService {
    static async create(mainBuyerId, linkedBuyerIds = []) {
        const doc = new BuyerLink({ mainBuyer: mainBuyerId, linkedBuyers: linkedBuyerIds });
        return doc.save();
    }

    static async addLinkedBuyer(mainBuyerId, linkedBuyerId) {
        return BuyerLink.findOneAndUpdate(
            { mainBuyer: mainBuyerId },
            { $addToSet: { linkedBuyers: linkedBuyerId } },
            { new: true, upsert: true }
        ).populate('linkedBuyers');
    }

    static async removeLinkedBuyer(mainBuyerId, linkedBuyerId) {
        return BuyerLink.findOneAndUpdate(
            { mainBuyer: mainBuyerId },
            { $pull: { linkedBuyers: linkedBuyerId } },
            { new: true }
        ).populate('linkedBuyers');
    }

    static async getLinkedBuyersByMainBuyer(mainBuyerId) {
        return BuyerLink.findOne({ mainBuyer: mainBuyerId }).populate('linkedBuyers');
    }

    static async getAllLinkedBuyersForBuyer(buyerId) {
        // Возвращает всех баеров, связанных с данным баером (включая самого баера)
        const result = await BuyerLink.findOne({ mainBuyer: buyerId }).populate('linkedBuyers');
        return result;
    }

    static async deleteByMainBuyer(mainBuyerId) {
        return BuyerLink.findOneAndDelete({ mainBuyer: mainBuyerId });
    }
}

module.exports = BuyerLinkService;
