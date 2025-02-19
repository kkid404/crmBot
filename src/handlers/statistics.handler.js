const ruMessage = require('../lang/ru.json');
const { isAdmin } = require('../middlewares/isAdmin.middleware')

module.exports = {
    handler: (bot) => {
        // Объединяем все обработчики в один объект
        const handlers = {
            [ruMessage.keyboards.statistics.progressCsv]: 'progressCsvScene',
            [ruMessage.keyboards.statistics.doneCsv]: 'doneCsvScene',
            [ruMessage.keyboards.statistics.allCsv]: 'allCsvScene',
            [ruMessage.keyboards.statistics.sendCsv]: 'sendCsvScene'
        };

        // Регистрируем обработчики
        Object.entries(handlers).forEach(([command, scene]) => {
            bot.hears(command, async (ctx) => {
                try {
                    // Удаляем предыдущее сообщение, если оно есть
                    if (ctx.message) {
                        await ctx.deleteMessage();
                    }
                    await ctx.scene.enter(scene);
                } catch (error) {
                    console.error(`Error in statistics handler: ${error.message}`);
                    await ctx.reply(ruMessage.messages.error);
                }
            });
        });
    },
    middleware: isAdmin
};