const BuyerTeam = require('../databases/buyerTeam.model');

const idOf = (v) => (v && v._id ? v._id.toString() : v ? v.toString() : null);

/**
 * Правила видимости крео внутри команды баеров:
 *  - участник видит свои крео и крео тимлида своей команды;
 *  - тимлид видит крео всех участников;
 *  - крео других участников друг другу не показываются.
 */
class TeamService {
    // Тимлиды команд, где пользователь — рядовой участник
    static async leadsOf(userId) {
        const teams = await BuyerTeam.find({ buyers: userId, teamLead: { $ne: null } }).select('teamLead').lean();
        const me = idOf(userId);
        return [...new Set(teams.map((t) => idOf(t.teamLead)).filter((id) => id && id !== me))];
    }

    // Может ли пользователь открыть готовое крео задачи
    static async canViewTask(user, task) {
        if (!user || !task) return false;
        if (user.role === 'admin') return true;

        const me = idOf(user._id);
        const buyerId = idOf(task.buyer);
        if (buyerId === me || idOf(task.createdBy) === me) return true;
        if (!buyerId) return false;

        // Крео тимлида моей команды
        const asMember = await BuyerTeam.exists({ buyers: user._id, teamLead: buyerId });
        if (asMember) return true;

        // Я тимлид команды, где состоит баер задачи
        const asLead = await BuyerTeam.exists({ teamLead: user._id, buyers: buyerId });
        return Boolean(asLead);
    }
}

module.exports = TeamService;
