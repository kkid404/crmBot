const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const { myTasks } = require('../keyboards/get_my_tt.keyboard');
const userService = require('../services/user.service');
const taskService = require('../services/task.service');
const { moderate } = require('../keyboards/moderate.keyboard');

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

module.exports = getTaskToModerateScene;