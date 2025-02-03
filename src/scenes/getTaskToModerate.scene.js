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

        // Получаем всех чекеров через userService.findAllCheckers() и определяем их количество
        const checkers = await userService.findAllCheckers();
        const totalCheckers = checkers.length;

        // Обновляем список записей проверки после добавления нового
        const updatedCheckerRecords = await taskChekerService.findAllCheckersByTaskId(taskId);

        // Если хотя бы один чекер отклонил задание, считаем задание отклоненным
        const hasFailed = updatedCheckerRecords.some(record => record.status === 'failed' && record.version === version);
        if (hasFailed) {
            await taskService.updateTask(taskId, { state: 'failed' });
            await ctx.editMessageText(`❌ Задание отклонено одним из чекеров.\n\n${ctx.session.taskInfo}`);
            await ctx.answerCbQuery();
            return;
        }

        // Считаем число уникальных одобрений для текущей версии
        const approvedSet = new Set();
        updatedCheckerRecords.forEach(record => {
            if (record.status === 'done' && record.version === version) {
                approvedSet.add(record.chekerId.toString());
            }
        });
        const approvedCount = approvedSet.size;

        if (approvedCount >= totalCheckers) {
            // Если подтверждений от всех чекеров, обновляем состояние задания на 'done'
            await taskService.updateTask(taskId, { state: 'done' });
            await ctx.editMessageText(`✅ Задание одобрено всеми чекерами и выполнено!\n\n${ctx.session.taskInfo}`);
        } else {
            await ctx.editMessageText(`✅ Ваше одобрение зафиксировано.\nОсталось одобрить ${totalCheckers - approvedCount} чекерам.\n\n${ctx.session.taskInfo}`);
        }
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in moderate "done" action:', error);
        await ctx.answerCbQuery('Произошла ошибка при принятии задания');
    }
});

// Обработчик нажатия кнопки "❌ Отклонить" (cancel)
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
        
        // Создаем новую запись проверки с отклонением
        await taskChekerService.createTaskChecker({
            taskId: taskId,
            chekerId: user._id,
            status: 'failed',
            version: version,
            message: 'Задание отклонено'
        });

        // После отклонения обновляем состояние задания на 'failed'
        await taskService.updateTask(taskId, { state: 'failed' });
        await ctx.editMessageText(`❌ Задание отклонено.\n\n${ctx.session.taskInfo}`);
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in moderate "cancel" action:', error);
        await ctx.answerCbQuery('Произошла ошибка при отклонении задания');
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
