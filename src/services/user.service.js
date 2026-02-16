const User = require('./../databases/user.model');

class UserService {
    static async findUserByTelegramId(tg_id) {
        return User.findOne({ tg_id });
    }

    static async findUserByUsername(username) {
        return User.findOne({ username });
    }

    static async createUser(data) {
        const user = new User(data);
        return user.save();
    }

    static async updateUser(tg_id, updates) {
        return User.findOneAndUpdate({ tg_id }, updates, { new: true });
    }

    // Обновить пользователя по ID
    static async updateUserById(id, updates) {
        try {
            return await User.findOneAndUpdate({ _id: id }, updates, { new: true });
        } catch (error) {
            throw new Error(`Ошибка обновления пользователя: ${error.message}`);
        }
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

      static async findById(id) {
        try {
            return User.findOne({ _id: id });
        } catch (error) {
            throw new Error(`Ошибка поиска пользователя: ${error.message}`);
        }
    }

      /** Проверка – финдиректор? */
    static async isFinance(tg_id) {
        const user = await User.findOne({ tg_id });
        return user && user.position === 'finance';
    }

    /** Получить всех админов креативщиков (role: admin, position: creator) */
    static async findCreatorAdmins() {
        return User.find({ 
            role: 'admin',
            position: 'creator'
        });
    }

    /** Забанить пользователя */
    static async banUser(tg_id) {
        return User.findOneAndUpdate(
            { tg_id },
            { isBan: true },
            { new: true }
        );
    }

    /** Разбанить пользователя */
    static async unbanUser(tg_id) {
        return User.findOneAndUpdate(
            { tg_id },
            { isBan: false },
            { new: true }
        );
    }

    /** Проверить, забанен ли пользователь */
    static async isBanned(tg_id) {
        const user = await User.findOne({ tg_id });
        return user && user.isBan === true;
    }

    /** Найти баеров по фильтрам принадлежности и бану */
    static async findBuyers({ isOur = null, isBan = null } = {}) {
        const query = { position: 'buyer' };
        if (isOur !== null) query.isOur = isOur;
        if (isBan !== null) query.isBan = isBan;
        return User.find(query).sort({ createdAt: -1 });
    }

    /** Установить принадлежность баера (наш/не наш) */
    static async setBuyerOurStatusById(id, isOur) {
        return User.findOneAndUpdate({ _id: id }, { isOur }, { new: true });
    }
}

module.exports = UserService;
