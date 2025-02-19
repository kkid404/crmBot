const ruMessage = require('../lang/ru.json');
const { isAdmin } = require('../middlewares/isAdmin.middleware')
const { statistics } = require('../keyboards/statistics.keyboard');

module.exports = {
    command: 'statistics',
    description: 'Statistic command',
    action: async (ctx) => {
        await ctx.telegram.sendMessage(ctx.from.id, ruMessage.messages.statistics.select_do, statistics())
    },
    middleware: isAdmin
};