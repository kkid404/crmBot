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
        // Удаляем все отправленные медиасообщения при выходе из сцены
        if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
            ctx.session.exampleMediaMessageIds = [];
        }
        
        // Получаем пользователя по Telegram ID напрямую, не используя сессию
        const tgId = String(ctx.from.id);
        const user = await userService.findUserByTelegramId(tgId);
        if (!user) {
            console.error("Пользователь не найден");
            await ctx.reply(ruMessage.messages.errors.user_not_found);
            return;
        }
        
        await ctx.editMessageText(ruMessage.messages.getTT.select_tt, await myTasks(user._id, "creator", "progress"));
    } catch (error) {
        console.error("Ошибка при возврате к списку задач:", error);
        // Если не получилось редактировать сообщение, отправляем новое
        try {
            const tgId = String(ctx.from.id);
            const user = await userService.findUserByTelegramId(tgId);
            if (user) {
                await ctx.reply(ruMessage.messages.getTT.select_tt, await myTasks(user._id, "creator", "progress"));
            }
        } catch (innerError) {
            console.error("Не удалось отправить новое сообщение:", innerError);
        }
    }
    ctx.session.selectedTask = '';
}

// Обработчик кнопки "quit"
async function handleQuit(ctx) {
    // Если медиа было отправлено, удаляем его
    if (ctx.session.exampleMediaMessageId) {
        delete ctx.session.exampleMediaMessageId;
    }
    await ctx.reply(ruMessage.messages.start.replace("{name}", ctx.from.first_name), await start(ctx.from.id));
    ctx.session = {};
    ctx.scene.leave();
}

// Обработчик кнопки "done"
async function handleDone(ctx) {
    try {
    // Удаляем все отправленные медиасообщения при выходе из сцены
    if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
        ctx.session.exampleMediaMessageIds = [];
    }

        // Отправляем новое сообщение вместо редактирования
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
    
     // Проверяем, содержит ли example_creative медиафайлы
     const hasMedia = Array.isArray(task.example_creative) 
     ? task.example_creative.length > 0 
     : typeof task.example_creative === 'string' && task.example_creative.trim() !== '';
 
 // Обеспечиваем обратную совместимость, преобразуя строку в массив
 if (typeof task.example_creative === 'string' && task.example_creative.trim() !== '') {
     task.example_creative = [task.example_creative];
 } else if (!Array.isArray(task.example_creative)) {
     task.example_creative = [];
 }
 
 // Формируем строку для отображения информации о примерах креатива
 const exampleLine = hasMedia
     ? `🎨 Примеры креатива: ${task.example_creative.length}`
     : "🎨 Примеры креатива: отсутствуют";

 // Формируем текст сообщения с информацией о задаче
 const taskInfo = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${task.description}
${exampleLine}
📅 Дата создания: ${task.createdAt.toLocaleDateString()}
 `;


     // Инициализируем массив для хранения ID отправленных медиасообщений
     ctx.session.exampleMediaMessageIds = [];

     // Разделяем примеры на медиа и текст
     const mediaExamples = [];
     const textExamples = [];
 
     // Определяем, какие примеры являются медиа, а какие текстом
     task.example_creative.forEach(example => {
         // Проверяем форматы file_id для Telegram
         // Фото обычно начинаются с "AgAC", видео с "BAA", файлы с "BQA" и т.д.
         if (example.startsWith('AgAC') || example.startsWith('BAA') || example.startsWith('BQA') || 
             example.startsWith('CQA') || example.startsWith('DQA')) {
             mediaExamples.push(example);
         } else {
             textExamples.push(example);
         }
     });
 
     // Сначала отправляем текстовые примеры, если они есть
     if (textExamples.length > 0) {
         const textMessage = await ctx.reply(`(${textExamples.length}):\n\n${textExamples.join('\n\n')}`);
         ctx.session.exampleMediaMessageIds.push(textMessage.message_id);
     }
 
     // Если есть медиафайлы, отправляем их в одном сообщении как медиагруппу
     if (mediaExamples.length > 0) {
         try {
             // Готовим массив медиафайлов для отправки в группе
             const mediaGroup = mediaExamples.map(fileId => {
                 // Определяем тип медиа по первым символам file_id
                 const isVideo = fileId.startsWith('BAA');
                 const isDocument = fileId.startsWith('BQA');
                 const isAudio = fileId.startsWith('CQA');
                 const isAnimation = fileId.startsWith('DQA');
                 
                 // Определяем тип медиа
                 let type = 'photo'; // По умолчанию фото
                 if (isVideo) type = 'video';
                 else if (isDocument) type = 'document';
                 else if (isAudio) type = 'audio';
                 else if (isAnimation) type = 'animation';
                 
                 return {
                     type: type,
                     media: fileId
                 };
             });
             
             // Отправляем медиагруппу (максимум 10 файлов в одной группе)
             if (mediaGroup.length > 0) {
                 // Telegram поддерживает до 10 файлов в одной группе
                 const chunks = [];
                 for (let i = 0; i < mediaGroup.length; i += 10) {
                     chunks.push(mediaGroup.slice(i, i + 10));
                 }
                 
                 // Отправляем каждую группу отдельно
                 for (const chunk of chunks) {
                     if (chunk.length > 0) {
                         const sentMessages = await ctx.telegram.sendMediaGroup(ctx.chat.id, chunk);
                         
                         // Сохраняем ID всех отправленных сообщений
                         if (sentMessages && sentMessages.length > 0) {
                             sentMessages.forEach(msg => {
                                 ctx.session.exampleMediaMessageIds.push(msg.message_id);
                             });
                         }
                     }
                 }
             }
         } catch (error) {
             console.error(`Ошибка отправки медиафайлов: ${error.message}`);
             await ctx.reply(`Не удалось отправить медиафайлы: ${error.message}`);
         }
     }
    
    // Редактируем сообщение с информацией о задаче
    const keyboard = back_or_done_Creator();
    await ctx.reply(taskInfo, {
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

// Обновляем обработчик leave
ttToModerateScene.leave(async (ctx) => {
    // Удаляем все отправленные медиасообщения при выходе из сцены
    if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
        ctx.session.exampleMediaMessageIds = [];
    }
    
    // Очищаем данные сессии
    ctx.session.selectedTask = null;
    ctx.session.taskname = null;
    ctx.session.taskInfo = null;
});


module.exports = ttToModerateScene;