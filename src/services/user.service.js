const User = require('./../databases/user.model');

class UserService {
    static async findUserByTelegramId(tg_id) {
        return User.findOne({ tg_id });
    }

    static async createUser(data) {
        const user = new User(data);
        return user.save();
    }

    static async updateUser(tg_id, updates) {
        return User.findOneAndUpdate({ tg_id }, updates, { new: true });
    }

    static async deleteUser(tg_id) {
        return User.findOneAndDelete({ tg_id });
    }

    static async getAll() {
        return User.find({})
    }

    static async isAdmin(tg_id){
        const user = await User.findOne({ tg_id: tg_id })
        return user && user.role == 'admin'
    }

    static async findAllCheckers() {
        return User.find({ cheker: true });
      }
}

module.exports = UserService;
