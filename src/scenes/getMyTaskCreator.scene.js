const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const { creatorTasks } = require('../keyboards/get_my_tt.keyboard');
const userService = require('../services/user.service');
const taskService = require('../services/task.service');
const { backInline } = require('../keyboards/backInline.keyboard');


const getMyTtCreatorScene = new BaseScene('getMyTtCreatorScene');

getMyTtCreatorScene.enter(async (ctx) => {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    ctx.session.user = user;
    const keyboard = await creatorTasks(user._id,  "progress");
    await ctx.reply(ruMessage.messages.getTT.select_tt, keyboard);
});

getMyTtCreatorScene.action("back", async (ctx) => {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    
    // Удаляем все медиа-примеры, если они есть
    if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
        ctx.session.exampleMediaMessageIds = [];
    }
    
    // Для обратной совместимости проверяем и старое одиночное сообщение
    if (ctx.session.exampleMediaMessageId) {
        try {
            ctx.session.exampleMediaMessageId = null;
        } catch (deleteError) {
            console.error("Ошибка при удалении сообщения с медиа:", deleteError);
        }
    }

    // Возвращаем информацию о задаче и обновляем клавиатуру
    const keyboard = await creatorTasks(ctx.session.user._id,  "progress");
    await ctx.editMessageText(ruMessage.messages.getTT.select_tt, keyboard);
    
    // Очищаем выбранную задачу
    ctx.session.selectedTask = '';
});


getMyTtCreatorScene.action("quit", async (ctx) => {
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

    // Определяем, есть ли медиафайлы
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

    // Редактируем сообщение с информацией о задаче
    await ctx.editMessageText(taskInfo, backInline());

    ctx.session.taskInfo = taskInfo;
    ctx.session.taskname = task.name;

    // Инициализируем массив для хранения ID отправленных медиасообщений
    ctx.session.exampleMediaMessageIds = [];

    // Разделяем примеры на медиа и текст
    const mediaExamples = [];
    const textExamples = [];
    
    // Если есть примеры креативов, определяем их типы
    if (hasMedia) {
        task.example_creative.forEach(example => {
            if (example.startsWith('AgAC') || example.startsWith('BAA') || example.startsWith('BQA') || 
                example.startsWith('CQA') || example.startsWith('DQA')) {
                mediaExamples.push(example);
            } else {
                textExamples.push(example);
            }
        });
        
        // Сначала отправляем текстовые примеры, если они есть
        if (textExamples.length > 0) {
            const textMessage = await ctx.reply(`📝 Текстовые примеры креативов:\n\n${textExamples.join('\n\n')}`);
            ctx.session.exampleMediaMessageIds.push(textMessage.message_id);
        }
        
        // Отправляем все медиафайлы в одном сообщении как медиагруппу
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
    }

    await ctx.answerCbQuery(); // Подтверждаем обработку callback
});

// Добавляем обработчик текстовых сообщений
getMyTtCreatorScene.on('text', async (ctx) => {
    const { selectedTask } = ctx.session;
    const tgId = String(ctx.from.id);
    const userInput = ctx.message.text;
    const user = await userService.findUserByTelegramId(tgId);

    // Если пользователь ввёл "назад" текстом
    if (userInput === ruMessage.keyboards.back[0]) {
        await ctx.scene.enter('backScene');
        ctx.session = {};
        ctx.scene.leave();
        return;
    }

    // Проверяем текущее состояние сцены и возвращаем пользователю информацию
    if (selectedTask) {
        const task = await taskService.findTaskById(selectedTask);
        if (task) {
            await ctx.reply(`Вы просматриваете задачу: ${task.name}`);
            await ctx.reply(ctx.session.taskInfo || "Информация о задаче недоступна", backInline());
        } else {
            await ctx.reply("Выбранная задача не найдена. Пожалуйста, выберите задачу из списка:");
            const keyboard = await creatorTasks(user._id,  "progress");
            await ctx.reply(ruMessage.messages.getTT.select_tt, keyboard);
        }
    } else {
        await ctx.reply("Вы находитесь в режиме просмотра задач. Пожалуйста, выберите задачу из списка:");
        const keyboard = await creatorTasks(user._id,  "progress");
        await ctx.reply(ruMessage.messages.getTT.select_tt, keyboard);
    }
});

// Добавляем функцию для просмотра всех примеров
getMyTtCreatorScene.action('show_examples', async (ctx) => {
    try {
        const taskId = ctx.session.selectedTask;
        if (!taskId) {
            await ctx.answerCbQuery("Задача не выбрана");
            return;
        }
        
        const task = await taskService.findTaskById(taskId);
        if (!task) {
            await ctx.answerCbQuery(ruMessage.messages.taskNotFound);
            return;
        }
        
        // Удаляем предыдущие медиа
        if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
            ctx.session.exampleMediaMessageIds = [];
        }
        
        // Обеспечиваем обратную совместимость, преобразуя строку в массив
        if (typeof task.example_creative === 'string' && task.example_creative.trim() !== '') {
            task.example_creative = [task.example_creative];
        } else if (!Array.isArray(task.example_creative)) {
            task.example_creative = [];
        }
        
        // Разделяем примеры на медиа и текст
        const mediaExamples = [];
        const textExamples = [];
        
        task.example_creative.forEach(example => {
            if (example.startsWith('AgAC') || example.startsWith('BAA') || example.startsWith('BQA') || 
                example.startsWith('CQA') || example.startsWith('DQA')) {
                mediaExamples.push(example);
            } else {
                textExamples.push(example);
            }
        });
        
        // Сначала отправляем текстовые примеры, если они есть
        if (textExamples.length > 0) {
            const textMessage = await ctx.reply(`📝 Текстовые примеры креативов (${textExamples.length}):\n\n${textExamples.join('\n\n')}`);
            ctx.session.exampleMediaMessageIds.push(textMessage.message_id);
        }
        
        // Если есть медиафайлы, отправляем их в группе
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
        
        await ctx.answerCbQuery();
    } catch (error) {
        console.error("Ошибка при показе примеров:", error);
        await ctx.answerCbQuery("Ошибка при показе примеров");
    }
});

module.exports = getMyTtCreatorScene;
