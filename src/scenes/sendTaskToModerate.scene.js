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

async function handleEnter(ctx) {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId).catch(handleError);
    ctx.session.user = user;
    await ctx.reply(ruMessage.messages.getTT.select_tt, await myTasks(user._id, "creator", "progress"));
}

async function handleBack(ctx) {
    try {
        // Проверка, что сообщение ещё не было удалено
        if (ctx.update.message && ctx.update.message.message_id) {
            await ctx.editMessageText(ruMessage.messages.getTT.select_tt, await myTasks(ctx.session.user._id, "creator", "progress"));
        } else {
            console.error("Message already deleted or doesn't exist.");
        }
    } catch (error) {
        console.error("Failed to edit message:", error);
    }
    ctx.session.selectedTask = '';
}

async function handleQuit(ctx) {
    await ctx.deleteMessage();
    await ctx.reply(ruMessage.messages.start.replace("{name}", ctx.from.first_name), await start(ctx.from.id));
    ctx.session = {};
    ctx.scene.leave();
}

async function handleDone(ctx) {
    await ctx.editMessageText("Пожалуйста, отправьте ваш креатив (фото или видео).");


    // Ожидаем медиафайл и сохраняем его в сессии
    ctx.session.awaitingMedia = true; // Устанавливаем флаг ожидания медиафайла
}

async function handlePoints(ctx) {
    const points = ctx.callbackQuery.data.replace('count_', '');
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId).catch(handleError);
    if (!user) throw new Error("User not found");
    const today = new Date();
    const taskInfo = {
        state: "wait",
        completionDate: today,
        points: Number(points),
        result: ctx.session.mediaFileId
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

async function handleTaskSelect(ctx) {
    const taskId = ctx.callbackQuery.data; 
    const task = await taskService.findTaskById(taskId).catch(handleError); 
    ctx.session.selectedTask = taskId; 
    if (!task) {
        await ctx.answerCbQuery(ruMessage.messages.taskNotFound); 
        return;
    }
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
    await ctx.editMessageText(taskInfo, back_or_done_Creator());
    ctx.session.taskInfo = taskInfo;
    ctx.session.taskname = task.name;
    ctx.session.selectedTask = taskId;
    await ctx.answerCbQuery(); 

}

async function handleMedia(ctx) {
    // Проверяем, ожидаем ли мы медиафайл
    if (!ctx.session.awaitingMedia) {
        return; // Если не ожидаем медиафайл, ничего не делаем
    }

    const fileId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : ctx.message.video.file_id;
    if (!fileId) return; // Если нет файла, пропускаем

    // Сохраняем ID медиафайла в сессии
    ctx.session.mediaFileId = fileId;

    // Обновляем задание с ID файла
    const taskId = ctx.session.selectedTask;
    const task = await taskService.findTaskById(taskId).catch(handleError);

    if (task) {
        task.mediaFileId = fileId; // Добавляем ID медиафайла в задание
        await ctx.reply(ruMessage.messages.ttToModerate.select_points, points_for_creatives());
        
        // await taskService.updateTask(taskId, {result: task, state: "wait"}).catch(handleError);
        // await ctx.reply("Ваш креатив успешно получен.");

        // Завершаем сценарий, так как креатив был отправлен
        ctx.session.awaitingMedia = false; // Сбрасываем флаг ожидания медиафайла
    } else {
        await ctx.reply(ruMessage.messages.ttToModerate.taskNotFound);
    }
}

function handleError(error) {
    console.error(`Error occurred: ${error.message}`);
    // Вы можете также отправить сообщение пользователю или записать ошибку более детально
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
