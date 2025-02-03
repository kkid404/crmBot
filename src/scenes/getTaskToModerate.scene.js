const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const { myTasks } = require('../keyboards/get_my_tt.keyboard');
const userService = require('../services/user.service');
const taskService = require('../services/task.service');
const { moderate } = require('../keyboards/moderate.keyboard');
const taskChekerService = require('../services/taskCheker.service');

const getTaskToModerateScene = new BaseScene('getTaskToModerateScene');

const formatTaskInfo = (task) => {
    return `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${task.description}
🎨 Пример креатива: ${task.example_creative}
📅 Дата создания: ${task.createdAt.toLocaleDateString()}
    `;
};

const safeEditMessageText = async (ctx, text, extra) => {
    try {
        await ctx.editMessageText(text, extra);
    } catch (error) {
        // Если редактирование не удалось, отправляем новое сообщение
        if (error.response &&
            error.response.error_code === 400 &&
            error.response.description.includes("message can't be edited")) {
            await ctx.reply(text, extra);
        } else {
            throw error;
        }
    }
};


// Функция для проверки, проголосовали ли все чекеры, и финализации задания
const checkAndFinalizeTask = async (ctx) => {
    try {
        const taskId = ctx.session.selectedTask;
        const task = await taskService.findTaskById(taskId);
        if (!task) return;
        const version = task.version;

        // Получаем записи голосования для текущей версии
        const allRecords = await taskChekerService.findAllCheckersByTaskId(taskId);
        const versionRecords = allRecords.filter(record => record.version === version);
        
        // Получаем всех чекеров (предполагается, что голосовать должны все чекеры системы)
        const checkers = await userService.findAllCheckers();
        const totalCheckers = checkers.length;
        
        if (versionRecords.length < totalCheckers) {
            // Не все голосовали – обновляем сообщение о статусе
            const approvedSet = new Set();
            versionRecords.forEach(record => {
                if (record.status === 'done') {
                    approvedSet.add(record.chekerId.toString());
                }
            });
            const pending = totalCheckers - versionRecords.length;
            await safeEditMessageText(ctx,
                `✅ Ваш голос зафиксирован.\nОжидается голосов: ${pending} чекеров.\n\n${ctx.session.taskInfo}`,
                moderate()
            );            return false; // финализация не проведена
        } else {
            // Все чекеры проголосовали
            const hasFailed = versionRecords.some(record => record.status === 'failed');
            if (hasFailed) {
                // Агрегируем правки из всех записей с failed
                const corrections = versionRecords
                    .filter(record => record.status === 'failed')
                    .map(record => record.message)
                    .join('\n');

                // Формируем сообщение для креатива в заданном формате
                const creativeMessage = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${task.description}
🎨 Пример креатива: ${task.example_creative}
📅 Дата создания: ${task.createdAt.toLocaleDateString()}

правки:
${corrections}
                `;
                // Обновляем состояние задания и отправляем сообщение креативищику
                await taskService.updateTask(taskId, { state: 'progress', version:  task.version + 1});
                // Предполагается, что у задания есть свойство creatorId – telegramId креатива
                const creator = await userService.findById(task.creator);
                console.log(`Креативщик ${creator}`)
                await ctx.telegram.sendMessage(creator.tg_id, creativeMessage);
                await ctx.editMessageText(`❌ Задание отклонено чекерами.\n\n${ctx.session.taskInfo}`, moderate());
            } else {
                // Все одобрили задание – обновляем состояние и уведомляем
                await taskService.updateTask(taskId, { state: 'done' });
                await ctx.editMessageText(`✅ Задание одобрено всеми чекерами и выполнено!\n\n${ctx.session.taskInfo}`, moderate());
            }
            return true;
        }
    } catch (error) {
        console.error('Error in checkAndFinalizeTask:', error);
        return false;
    }
};

getTaskToModerateScene.enter(async (ctx) => {
    try {
        const tgId = String(ctx.from.id);
        const user = await userService.findUserByTelegramId(tgId);
        if (!user) {
            console.error(`User with telegram id ${tgId} not found`);
            await ctx.reply(ruMessage.messages.userNotFound);
            return;
        }
        ctx.session.user = user;
        await ctx.reply(ruMessage.messages.getTT.select_tt, await myTasks(user._id, '', "wait"));
    } catch (error) {
        console.error('Error in getTaskToModerateScene.enter:', error);
        await ctx.reply(ruMessage.messages.errorOccurred);
    }
});

// Обработчик выбора задания (ID задания)
getTaskToModerateScene.action(/^[a-f0-9]{24}$/, async (ctx) => {
    try {
        const taskId = ctx.callbackQuery.data;
        const task = await taskService.findTaskById(taskId);
        if (!task) {
            console.error(`Task with id ${taskId} not found`);
            await ctx.answerCbQuery(ruMessage.messages.taskNotFound);
            return;
        }

        ctx.session.selectedTask = taskId;
        const taskInfo = formatTaskInfo(task);
        await ctx.editMessageText(taskInfo, moderate());

        ctx.session.taskInfo = taskInfo;
        ctx.session.taskname = task.name;

        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in getTaskToModerateScene.action:', error);
        await ctx.answerCbQuery(ruMessage.messages.errorOccurred);
    }
});

// Обработчик нажатия кнопки "✅ Принять" (done)
getTaskToModerateScene.action('done', async (ctx) => {
    try {
        const taskId = ctx.session.selectedTask;
        if (!taskId) {
            await ctx.answerCbQuery('Задание не выбрано');
            return;
        }
        const task = await taskService.findTaskById(taskId);
        if (!task) {
            await ctx.answerCbQuery(ruMessage.messages.taskNotFound);
            return;
        }
        const tgId = String(ctx.from.id);
        const user = await userService.findUserByTelegramId(tgId);
        if (!user) {
            await ctx.answerCbQuery('Пользователь не найден');
            return;
        }
        const version = task.version;

        // Проверяем, голосовал ли уже этот чекер (независимо от статуса)
        const checkersRecords = await taskChekerService.findAllCheckersByTaskId(taskId);
        const existingRecord = checkersRecords.find(record =>
            record.chekerId.toString() === user._id.toString() &&
            record.version === version
        );
        if (existingRecord) {
            await ctx.answerCbQuery('Вы уже проголосовали');
            return;
        }

        // Создаем новую запись проверки с одобрением
        await taskChekerService.createTaskChecker({
            taskId: taskId,
            chekerId: user._id,
            status: 'done',
            version: version,
            message: 'Задание принято'
        });

        // Проверяем, проголосовали ли все чекеры, и, если да – финализируем задание
        await checkAndFinalizeTask(ctx);

        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in moderate "done" action:', error);
        await ctx.answerCbQuery('Произошла ошибка при принятии задания');
    }
});

// Обработчик нажатия кнопки "❌ Отклонить" (cancel)
// Вместо непосредственного создания записи, бот запрашивает правки
getTaskToModerateScene.action('cancel', async (ctx) => {
    try {
        const taskId = ctx.session.selectedTask;
        if (!taskId) {
            await ctx.answerCbQuery('Задание не выбрано');
            return;
        }
        const task = await taskService.findTaskById(taskId);
        if (!task) {
            await ctx.answerCbQuery(ruMessage.messages.taskNotFound);
            return;
        }
        const tgId = String(ctx.from.id);
        const user = await userService.findUserByTelegramId(tgId);
        if (!user) {
            await ctx.answerCbQuery('Пользователь не найден');
            return;
        }
        const version = task.version;
        
        // Проверяем, голосовал ли уже этот чекер (независимо от статуса)
        const checkersRecords = await taskChekerService.findAllCheckersByTaskId(taskId);
        const existingRecord = checkersRecords.find(record =>
            record.chekerId.toString() === user._id.toString() &&
            record.version === version
        );
        if (existingRecord) {
            await ctx.answerCbQuery('Вы уже проголосовали');
            return;
        }
        
        // Сохраняем в сессии данные, чтобы дождаться сообщения с правкой
        ctx.session.waitingForCorrection = true;
        ctx.session.pendingCancelVote = {
            taskId,
            version,
            userId: user._id
        };

        await ctx.reply("❌ Задание отклонено. Пожалуйста, введите сообщение с правкой:");
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in moderate "cancel" action:', error);
        await ctx.answerCbQuery('Произошла ошибка при отклонении задания');
    }
});

// Обработчик текстовых сообщений – ждём ввод правок, если ожидается
getTaskToModerateScene.on('text', async (ctx) => {
    if (ctx.session.waitingForCorrection && ctx.session.pendingCancelVote) {
        try {
            const correction = ctx.message.text;
            const { taskId, version, userId } = ctx.session.pendingCancelVote;
            
            // Создаем запись проверки с отклонением и переданными правками
            await taskChekerService.createTaskChecker({
                taskId,
                chekerId: userId,
                status: 'failed',
                version: version,
                message: correction
            });
            
            // Сбрасываем флаги ожидания
            delete ctx.session.waitingForCorrection;
            delete ctx.session.pendingCancelVote;
            
            // Проверяем, проголосовали ли уже все чекеры, и, если да – финализируем задание
            await checkAndFinalizeTask(ctx);
        } catch (error) {
            console.error('Error processing correction text:', error);
            await ctx.reply('Ошибка при обработке вашего сообщения с правкой');
        }
    }
});

getTaskToModerateScene.action("quit", async (ctx) => {
    await ctx.deleteMessage();
    await ctx.reply(ruMessage.messages.start.replace("{name}", ctx.from.first_name), await start(ctx.from.id));
    ctx.session = {};
    ctx.scene.leave();
});

// Обработчик нажатия кнопки "📋 К заданиям" (back)
getTaskToModerateScene.action('back', async (ctx) => {
    try {
        const user = ctx.session.user;
        if (!user) {
            await ctx.answerCbQuery('Пользователь не найден');
            return;
        }
        await ctx.editMessageText(ruMessage.messages.getTT.select_tt, await myTasks(user._id, '', "wait"));
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in moderate "back" action:', error);
        await ctx.answerCbQuery('Произошла ошибка при переходе назад');
    }
});

module.exports = getTaskToModerateScene;
