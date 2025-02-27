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
    ctx.session.user = user;
    const keyboard = await myTasks(user._id, user.position, "progress");
    await ctx.reply(ruMessage.messages.getTT.select_tt, keyboard);
});

getMyTtCreatorScene.action("back", async (ctx) => {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    
    // Если сообщение с медиа было отправлено, удаляем его
    if (ctx.session.exampleMediaMessageId) {
        try {
            await ctx.deleteMessage(ctx.session.exampleMediaMessageId);
        } catch (deleteError) {
            console.error("Ошибка при удалении сообщения с медиа:", deleteError);
        }
    }

    // Возвращаем информацию о задаче и обновляем клавиатуру
    const keyboard = await myTasks(ctx.session.user._id, user.position, "progress");
    await ctx.editMessageText(ruMessage.messages.getTT.select_tt, keyboard);
    
    // Очищаем выбранную задачу
    ctx.session.selectedTask = '';
});


getMyTtCreatorScene.action("quit", async (ctx) => {
    await ctx.deleteMessage();
    const keyboard = await start(ctx.from.id);
    await ctx.reply(ruMessage.messages.start.replace("{name}", ctx.from.first_name), {
        ...keyboard,
        reply_markup: {
            ...keyboard.reply_markup,
            remove_keyboard: false // Здесь оставляем клавиатуру, так как выходим из inline сценария
        }
    });
    ctx.session = {};
    ctx.scene.leave();
});


// Обработчик callback-запросов
getMyTtCreatorScene.action(/^[a-f0-9]{24}$/, async (ctx) => { // Регулярное выражение для ObjectId

    const taskId = ctx.callbackQuery.data; // Получаем ID задачи из callback_data
    const task = await taskService.findTaskById(taskId); // Находим задачу по ID

    ctx.session.selectedTask = taskId; // Сохраняем выбранную задачу в сессии

    if (!task) {
        await ctx.answerCbQuery(ruMessage.messages.taskNotFound); // Если задача не найдена
        return;
    }

    // Проверяем, является ли example_creative file_id (медиа) или текстом.
    const isMedia = task.example_creative.startsWith("AgAC") || task.example_creative.startsWith("BAAC");

    // Формируем строку для отображения примера креатива.
    const exampleLine = isMedia
        ? "🎨 Пример креатива: Медиа"
        : `🎨 Пример креатива: ${task.example_creative}`;

    // Формируем текст сообщения с информацией о задаче
    const taskInfo = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${task.description}
${exampleLine}
📅 Дата создания: ${task.createdAt.toLocaleDateString()}
    `;

    // Редактируем сообщение с информацией о задаче
    await ctx.editMessageText(taskInfo, backInline());

    ctx.session.taskInfo = taskInfo;
    ctx.session.taskname = task.name;

    // Если example_creative содержит file_id, отправляем медиа и сохраняем id сообщения
    if (isMedia) {
        let mediaResponse;
        try {
            // Пробуем отправить как фото
            mediaResponse = await ctx.replyWithPhoto(task.example_creative);
        } catch (photoError) {
            try {
                // Если не удалось отправить как фото, пробуем отправить как видео
                mediaResponse = await ctx.replyWithVideo(task.example_creative);
            } catch (videoError) {
                console.error("Ошибка отправки медиа примера:", videoError);
                await ctx.reply("Ошибка отправки медиа примера");
            }
        }

        // Сохраняем идентификатор отправленного сообщения с медиа для последующего удаления
        if (mediaResponse && mediaResponse.message_id) {
            ctx.session.exampleMediaMessageId = mediaResponse.message_id;
        }
    }

    ctx.session.taskInfo = taskInfo;
    ctx.session.taskname = task.name;

    await ctx.answerCbQuery(); // Подтверждаем обработку callback
});



module.exports = getMyTtCreatorScene;
