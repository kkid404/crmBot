const ruMessage = require('../lang/ru.json');
const { isAdmin } = require('../middlewares/isAdmin.middleware')
const { admin } = require('../keyboards/admin.keyboard');

module.exports = {
    command: 'admin',
    description: 'Admin command',
    action: async (ctx) => {
        await ctx.telegram.sendMessage(ctx.from.id, ruMessage.messages.start.replace("{name}", ctx.from.first_name), await admin())
    },
    middleware: isAdmin
};