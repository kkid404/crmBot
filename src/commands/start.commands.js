const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');

module.exports = {
    command: 'start',
    description: 'Start command',
    action: async (ctx) => {
        await ctx.telegram.sendMessage(ctx.from.id, ruMessage.messages.start.replace("{name}", ctx.from.first_name), await start(ctx.from.id))
    }
};