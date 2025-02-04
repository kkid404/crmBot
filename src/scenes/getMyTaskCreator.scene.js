const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const { myTasks } = require('../keyboards/get_my_tt.keyboard');
const userService = require('../services/user.service');
const taskService = require('../services/task.service');
const { backInline } = require('../keyboards/backInline.keyboard');


const getMyTtCreatorScene = new BaseScene('getMyTtCreatorScene');

getMyTtCreatorScene.enter(async (ctx) => {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    ctx.session.user = user
    await ctx.reply(ruMessage.messages.getTT.select_tt, await myTasks(user._id, user.position, "progress"));
});

getMyTtCreatorScene.action("back", async (ctx) => {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    await ctx.editMessageText(ruMessage.messages.getTT.select_tt, await myTasks(ctx.session.user._id, user.position, "progress"));
    ctx.session.selectedTask = ''
})

getMyTtCreatorScene.action("quit", async (ctx) => {
    await ctx.deleteMessage();
    await ctx.reply(ruMessage.messages.start.replace("{name}", ctx.from.first_name), await start(ctx.from.id));
    ctx.session = {};
    ctx.scene.leave();
})


// Обработчик callback-запросов
getMyTtCreatorScene.action(/^[a-f0-9]{24}$/, async (ctx) => { // Регулярное выражение для ObjectId

    const taskId = ctx.callbackQuery.data; // Получаем ID задачи из callback_data
    const task = await taskService.findTaskById(taskId); // Находим задачу по ID

    ctx.session.selectedTask = taskId; // Сохраняем выбранную задачу в сессии

    if (!task) {
        await ctx.answerCbQuery(ruMessage.messages.taskNotFound); // Если задача не найдена
        return;
    }

    // Формируем текст сообщения с информацией о задаче
    let  taskInfo = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${task.description}
🎨 Пример креатива: ${task.example_creative}
📅 Дата создания: ${task.createdAt.toLocaleDateString()}
    `;
    if(task.completionDate !== null) {
        taskInfo += `\n📅Дата выполнения: ${task.completionDate.toLocaleDateString()}`
    }

    // Редактируем сообщение с новой информацией
    await ctx.editMessageText(taskInfo, backInline());

    ctx.session.taskInfo = taskInfo
    ctx.session.taskname = task.name

    await ctx.answerCbQuery(); // Подтверждаем обработку callback
});


module.exports = getMyTtCreatorScene;
