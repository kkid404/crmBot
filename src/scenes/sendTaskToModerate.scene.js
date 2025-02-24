const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const { myTasks } = require('../keyboards/get_my_tt.keyboard');
const userService = require('../services/user.service');
const taskService = require('../services/task.service');
const { backInline } = require('../keyboards/backInline.keyboard');
const { back_or_done_Creator } = require('../keyboards/back_or_done_Creator.keyboard');
const { points_for_creatives } = require('../keyboards/points_for_creatives.keyboard');

const ttToModerateScene = new BaseScene('ttToModerateScene');

async function handlePoints(ctx) {
    const points = ctx.callbackQuery.data.replace('count_', '');
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId).catch(handleError);
    if (!user) throw new Error("User not found");
    
    // Получаем описание типа работы из ru.json
    const workType = ruMessage.keyboards.points_for_creatives[points];
    
    const today = new Date();
    const taskInfo = {
        state: "wait",
        completionDate: today,
        points: Number(points),
        result: ctx.session.mediaFileId,
        workType: workType // Добавляем тип работы
    };
    
    await taskService.updateTask(ctx.session.selectedTask, taskInfo).catch(handleError);
    const checkers = await userService.findAllCheckers().catch(handleError);
    for (const checker of checkers) {
        await ctx.telegram.sendMessage(
            checker.tg_id, 
            `Креатив ${ctx.session.taskname} поступил на проверку`
        ).catch(handleError);
    }
  
    await ctx.deleteMessage();
    await ctx.reply(ruMessage.messages.ttToModerate.creative_success_send, await start(ctx.from.id));
    ctx.session = {};
    ctx.scene.leave();
    await ctx.answerCbQuery(); 
}

// Функция для обработки входа в сцену
async function handleEnter(ctx) {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId).catch(handleError);
    ctx.session.user = user;
    await ctx.reply(ruMessage.messages.getTT.select_tt, await myTasks(user._id, "creator", "progress"));
}

// Обработчик кнопки "back"
async function handleBack(ctx) {
    try {
        // Если сообщение с медиа отправлялось, удаляем его
        if (ctx.session.exampleMediaMessageId) {
            await ctx.deleteMessage(ctx.session.exampleMediaMessageId);
            delete ctx.session.exampleMediaMessageId; // Очистить идентификатор медиа после удаления
        }
        await ctx.editMessageText(ruMessage.messages.getTT.select_tt, await myTasks(ctx.session.user._id, "creator", "progress"));
    } catch (error) {
        console.error("Ошибка при удалении сообщения с медиа:", error);
    }
    ctx.session.selectedTask = '';
}

// Обработчик кнопки "quit"
async function handleQuit(ctx) {
    // Если медиа было отправлено, удаляем его
    if (ctx.session.exampleMediaMessageId) {
        await ctx.deleteMessage(ctx.session.exampleMediaMessageId);
        delete ctx.session.exampleMediaMessageId;
    }
    await ctx.deleteMessage();
    await ctx.reply(ruMessage.messages.start.replace("{name}", ctx.from.first_name), await start(ctx.from.id));
    ctx.session = {};
    ctx.scene.leave();
}

// Обработчик кнопки "done"
async function handleDone(ctx) {
    try {
        // Удаляем предыдущее медиа, если оно есть
        if (ctx.session.exampleMediaMessageId) {
            try {
                await ctx.deleteMessage(ctx.session.exampleMediaMessageId);
                delete ctx.session.exampleMediaMessageId;
            } catch (err) {
                console.error("Ошибка при удалении медиа:", err);
            }
        }

        // Отправляем новое сообщение вместо редактирования
        await ctx.deleteMessage();
        await ctx.reply("Пожалуйста, отправьте ваш креатив (фото или видео).\nМаксимальный размер медиа файла 50 МБ.");
        ctx.session.awaitingMedia = true;
    } catch (error) {
        console.error("Ошибка в handleDone:", error);
        // Если произошла ошибка, все равно устанавливаем флаг ожидания медиа
        ctx.session.awaitingMedia = true;
        try {
            await ctx.reply("Пожалуйста, отправьте ваш креатив (фото или видео).\nМаксимальный размер медиа файла 50 МБ.");
        } catch (err) {
            console.error("Ошибка при отправке сообщения:", err);
        }
    }
}

// Обработчик для выбора задачи
async function handleTaskSelect(ctx) {
    const taskId = ctx.callbackQuery.data;
    const task = await taskService.findTaskById(taskId).catch(handleError);
    ctx.session.selectedTask = taskId;
    if (!task) {
        await ctx.answerCbQuery(ruMessage.messages.taskNotFound);
        return;
    }
    const isMedia = task.example_creative.startsWith("AgAC") || task.example_creative.startsWith("BAAC");

    const exampleLine = isMedia
        ? "🎨Медиа"
        : `🎨 ${task.example_creative}`;

    let taskInfo = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${task.description}
🎨 Пример креатива: ${exampleLine}
📅 Дата создания: ${task.createdAt.toLocaleDateString()}
    `;

    if (task.completionDate !== null) {
        taskInfo += `\n📅Дата выполнения: ${task.completionDate.toLocaleDateString()}`;
    }

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

    await ctx.editMessageText(taskInfo, back_or_done_Creator());
    ctx.session.taskInfo = taskInfo;
    ctx.session.taskname = task.name;
    ctx.session.selectedTask = taskId;
    await ctx.answerCbQuery();
}

// Обработчик медиа
async function handleMedia(ctx) {
    if (!ctx.session.awaitingMedia) {
        return; // Если не ожидаем медиафайл, ничего не делаем
    }

    const fileId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : ctx.message.video.file_id;
    if (!fileId) return;

    ctx.session.mediaFileId = fileId;

    const taskId = ctx.session.selectedTask;
    const task = await taskService.findTaskById(taskId).catch(handleError);

    if (task) {
        task.mediaFileId = fileId; // Добавляем ID медиафайла в задание
        await ctx.reply(ruMessage.messages.ttToModerate.select_points, points_for_creatives());
        ctx.session.awaitingMedia = false; // Сбрасываем флаг ожидания медиафайла
    } else {
        await ctx.reply(ruMessage.messages.ttToModerate.taskNotFound);
    }
}

function handleError(error) {
    console.error(`Error occurred: ${error.message}`);
}

// Основные действия сцены
ttToModerateScene.enter(handleEnter);
ttToModerateScene.action("back", handleBack);
ttToModerateScene.action("quit", handleQuit);
ttToModerateScene.action("done", handleDone);
ttToModerateScene.action(/^count_.+$/, handlePoints);
ttToModerateScene.action(/^[a-f0-9]{24}$/, handleTaskSelect);

// Добавляем обработку медиафайлов
ttToModerateScene.on('photo', handleMedia);
ttToModerateScene.on('video', handleMedia);

module.exports = ttToModerateScene;
