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
    if (!user) throw new Error("User not found");
    
    const keyboard = await myTasks(user._id, user.position, "progress");
    await ctx.reply(ruMessage.messages.getTT.select_tt, keyboard);
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
    if (!task) throw new Error("Task not found");
    
    ctx.session.selectedTask = taskId;
    ctx.session.taskname = task.name;
    
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
    const keyboard = back_or_done_Creator();
    await ctx.editMessageText(taskInfo, {
        ...keyboard,
        reply_markup: {
            ...keyboard.reply_markup,
            remove_keyboard: true
        }
    });
    
    ctx.session.taskInfo = taskInfo;
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

// Добавляем обработчик текстовых сообщений
ttToModerateScene.on('text', async (ctx) => {
    const { selectedTask, awaitingMedia } = ctx.session;
    const tgId = String(ctx.from.id);
    const userInput = ctx.message.text;
    const user = await userService.findUserByTelegramId(tgId).catch(handleError);

    // Если пользователь ввёл "назад" текстом
    if (userInput === ruMessage.keyboards.back[0]) {
        await ctx.scene.enter('backScene');
        ctx.session = {};
        ctx.scene.leave();
        return;
    }

    // Если ожидаем медиафайл, но получили текст
    if (awaitingMedia) {
        await ctx.reply("Ожидается отправка медиафайла (фото или видео). Пожалуйста, отправьте ваш креатив.");
        return;
    }

    // Проверяем текущее состояние сцены и возвращаем пользователю информацию
    if (selectedTask) {
        const task = await taskService.findTaskById(selectedTask).catch(handleError);
        if (task) {
            await ctx.reply(`Вы работаете с задачей: ${task.name}`);
            if (ctx.session.taskInfo) {
                await ctx.reply(ctx.session.taskInfo, back_or_done_Creator());
            } else {
                // Формируем информацию о задаче
                const isMedia = task.example_creative.startsWith("AgAC") || task.example_creative.startsWith("BAAC");
                const exampleLine = isMedia
                    ? "🎨 Пример креатива: Медиа"
                    : `🎨 Пример креатива: ${task.example_creative}`;
                
                const taskInfo = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${task.description}
${exampleLine}
📅 Дата создания: ${task.createdAt.toLocaleDateString()}
                `;
                
                await ctx.reply(taskInfo, back_or_done_Creator());
            }
        } else {
            await ctx.reply("Выбранная задача не найдена. Пожалуйста, выберите задачу из списка:");
            const keyboard = await myTasks(user._id, user.position, "progress");
            await ctx.reply(ruMessage.messages.getTT.select_tt, keyboard);
        }
    } else {
        await ctx.reply("Вы находитесь в режиме отправки задачи на модерацию. Пожалуйста, выберите задачу из списка:");
        const keyboard = await myTasks(user._id, user.position, "progress");
        await ctx.reply(ruMessage.messages.getTT.select_tt, keyboard);
    }
});

module.exports = ttToModerateScene;