const ruMessage = require('../lang/ru.json');
const Task = require('../databases/task.model');
const { exportTasksInProgressToCsv, exportTasksDoneCsv, exportAllTasksCsv } = require('../controllers/task.controller');
const { start } = require('../keyboards/start.keyboard');
const { statistics } = require('../keyboards/statistics.keyboard');

const actions = (bot) => {
    // Добавляем новый обработчик для возврата в меню статистики
    bot.action('backToStatMenu', async (ctx) => {
        try {
            // Удаляем предыдущее сообщение
            await ctx.deleteMessage();
            
            // Отправляем сообщение с меню статистики
            await ctx.reply(ruMessage.messages.statistics.select_do, statistics());
        } catch (error) {
            await ctx.reply(ruMessage.messages.error);
        }
    });

    // Обработка кнопки "Креативы в работе"
    bot.action('progressCsv', async (ctx) => {
        try {
            // Удаляем предыдущее сообщение
            await ctx.deleteMessage();
            
            const csvBuffer = await exportTasksInProgressToCsv();
            await ctx.replyWithDocument(
                { source: csvBuffer, filename: 'tasks_in_progress.csv' },
                { 
                    caption: '📊 Отчет по креативам в работе',
                    reply_markup: {
                        inline_keyboard: [[{ text: ruMessage.keyboards.statistics.backToStatMenu, callback_data: 'backToStatMenu' }]]
                    }
                }
            );
        } catch (error) {
            await ctx.reply(ruMessage.messages.error);
        }
    });

    // Обработка кнопки "Выполненные креативы"
    bot.action('doneCsv', async (ctx) => {
        try {
            // Удаляем предыдущее сообщение
            await ctx.deleteMessage();
            
            const csvBuffer = await exportTasksDoneCsv();
            await ctx.replyWithDocument(
                { source: csvBuffer, filename: 'completed_tasks.csv' },
                { 
                    caption: '📊 Отчет по выполненным креативам',
                    reply_markup: {
                        inline_keyboard: [[{ text: ruMessage.keyboards.statistics.backToStatMenu, callback_data: 'backToStatMenu' }]]
                    }
                }
            );
        } catch (error) {
            await ctx.reply(ruMessage.messages.error);
        }
    });

    // Обработка кнопки "Все креативы"
    bot.action('allCsv', async (ctx) => {
        try {
            // Удаляем предыдущее сообщение
            await ctx.deleteMessage();
            
            const csvBuffer = await exportAllTasksCsv();
            await ctx.replyWithDocument(
                { source: csvBuffer, filename: 'all_tasks.csv' },
                { 
                    caption: '📊 Полный отчет по креативам',
                    reply_markup: {
                        inline_keyboard: [[{ text: ruMessage.keyboards.statistics.backToStatMenu, callback_data: 'backToStatMenu' }]]
                    }
                }
            );
        } catch (error) {
            await ctx.reply(ruMessage.messages.error);
        }
    });

    // Обработка кнопки "Отправить CSV"
    bot.action('sendCsv', async (ctx) => {
        try {
            // Удаляем предыдущее сообщение
            await ctx.deleteMessage();
            
            await ctx.reply('📤 Пожалуйста, отправьте CSV файл для обновления статусов задач', {
                reply_markup: {
                    inline_keyboard: [[{ text: ruMessage.keyboards.statistics.backToStatMenu, callback_data: 'backToStatMenu' }]]
                }
            });
            // Устанавливаем флаг ожидания файла
            ctx.session.awaitingCsvFile = true;
        } catch (error) {
            await ctx.reply(ruMessage.messages.error);
        }
    });

    // Обработка кнопки "Главное меню"
    bot.action('backToMainMenu', async (ctx) => {
        try {
            // Удаляем предыдущее сообщение
            await ctx.deleteMessage();
            
            await ctx.reply('📋 Вы вернулись в главное меню', await start(ctx.from.id));
        } catch (error) {
            await ctx.reply(ruMessage.messages.error);
        }
    });
};

module.exports = { actions }; 