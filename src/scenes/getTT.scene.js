const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { tasks } = require('../keyboards/tasks.keyboard');
const { selected_or_back } = require('../keyboards/selected_or_back.keyboard');
const { date } = require('../keyboards/date.keyboard');
const { done_or_cancel } = require('../keyboards/done_or_cancel.keyboard');
const { start } = require('../keyboards/start.keyboard');
const userService = require('../services/user.service');


const taskService = require('../services/task.service');

function parseCustomDate(dateStr) {
    const [day, month] = dateStr.split('.'); // Разделяем на день и месяц
    const year = new Date().getFullYear(); // Используем текущий год
    return new Date(year, month - 1, day); // Создаем объект Date (месяцы начинаются с 0)
}

const getTTScene = new BaseScene('getTTScene');

getTTScene.enter(async (ctx) => {
    await ctx.reply(ruMessage.messages.getTT.select_tt, await tasks());
});

getTTScene.action("back", async (ctx) => {
    await ctx.editMessageText(ruMessage.messages.getTT.select_tt, await tasks());
    ctx.session.selectedTask = ''
})

getTTScene.action("select", async (ctx) => {
    await ctx.editMessageText(ruMessage.messages.getTT.select_date, await date());
})

getTTScene.action(/^date_.+$/, async (ctx) => { // Регулярное выражение для date_*

    // Извлекаем динамическую часть (например, "4.12" из "date_4.12")
    const date = ctx.callbackQuery.data.replace('date_', '');

    ctx.session.completionDate = date

    const readyDate = parseCustomDate(date)


    ctx.session.readyDate = readyDate
    
    const taskInfo = ctx.session.taskInfo + "\n📅Дата выполнения: " + date

    // Редактируем сообщение с новой информацией
    await ctx.editMessageText(taskInfo, done_or_cancel());

    await ctx.answerCbQuery(); // Подтверждаем обработку callback
});

getTTScene.action("cancel", async (ctx) => {
    await ctx.deleteMessage();

    await ctx.reply(ruMessage.messages.start.replace("{name}", ctx.from.first_name), await start(ctx.from.id));

    ctx.session = {};
    ctx.scene.leave();

})

getTTScene.action("quit", async (ctx) => {
    await ctx.deleteMessage();
    await ctx.reply(ruMessage.messages.start.replace("{name}", ctx.from.first_name), await start(ctx.from.id));
    ctx.session = {};
    ctx.scene.leave();
})

getTTScene.action("done", async (ctx) => {
    try {
        const tgId = String(ctx.from.id);
        const user = await userService.findUserByTelegramId(tgId);
        if (!user) throw new Error("User not found");

        const taskInfo = {
            state: "progress",
            creator: user._id,
            completionDate: ctx.session.readyDate 
        };
        
        await taskService.updateTask(ctx.session.selectedTask, taskInfo);
        await ctx.deleteMessage();
        await ctx.reply(
            ruMessage.messages.getTT.success_selected
                .replace("{name}", ctx.session.taskname)
                .replace("{date}", ctx.session.completionDate), 
            await start(tgId)
        );
    } catch (error) {
        console.error("Error in done action:", error);
        await ctx.reply(ruMessage.messages.errors.general);
    } finally {
        ctx.session = {};
        ctx.scene.leave();
    }

})


// Обработчик callback-запросов
getTTScene.action(/^[a-f0-9]{24}$/, async (ctx) => { // Регулярное выражение для ObjectId

    const taskId = ctx.callbackQuery.data; // Получаем ID задачи из callback_data
    const task = await taskService.findTaskById(taskId); // Находим задачу по ID

    ctx.session.selectedTask = taskId; // Сохраняем выбранную задачу в сессии

    if (!task) {
        await ctx.answerCbQuery(ruMessage.messages.taskNotFound); // Если задача не найдена
        return;
    }

    // Формируем текст сообщения с информацией о задаче
    const taskInfo = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${task.description}
🎨 Пример креатива: ${task.example_creative}
📅 Дата создания: ${task.createdAt.toLocaleDateString()}
    `;

    // Редактируем сообщение с новой информацией
    await ctx.editMessageText(taskInfo, selected_or_back());

    ctx.session.taskInfo = taskInfo
    ctx.session.taskname = task.name

    await ctx.answerCbQuery(); // Подтверждаем обработку callback
});


module.exports = getTTScene
