const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const { tzBuyers } = require('../keyboards/tzBuyers.keyboard');
const taskService = require('../services/task.service');
const userService = require('../services/user.service');
const { myTasks } = require('../keyboards/get_my_tt.keyboard');
const { editTaskBuyerBot } = require('../keyboards/editTaskBuyerBot.keyboard');
const { managementBuyerTasks } = require('../keyboards/managementBuyerTasks.keyboard');
const { backInline } = require('../keyboards/backInline.keyboard');
const { back_to_task } = require('../keyboards/back_to_task.keyboard');




// Функция для сборки текста задачи
function buildTaskInfo(task, state) {
    // Определяем, есть ли медиафайлы
    const hasMedia = Array.isArray(task.example_creative) 
        ? task.example_creative.length > 0 
        : typeof task.example_creative === 'string' && task.example_creative.trim() !== '';
    
    // Формируем строку для отображения информации о примерах креатива
    const exampleLine = hasMedia
        ? `🎨 Примеры креатива: ${Array.isArray(task.example_creative) ? task.example_creative.length : 1}`
        : "🎨 Примеры креатива: отсутствуют";

    // Базовый текст
    let taskInfo = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${task.description}
${exampleLine}
📅 Дата создания: ${task.createdAt.toLocaleDateString()}
    `;

    // Если состояние "progress" — добавляем дату выполнения
    // (если она есть в задаче)
    if (state === 'progress' && task.completionDate) {
        taskInfo += `\n🗓 Дата выполнения: ${task.completionDate.toLocaleDateString()}`;
    }

    return taskInfo;
}

// Чтобы не использовать "магические строки", заведём константы под шаги редактирования
const EDIT_STEPS = {
    DESCRIPTION: 'EDIT_DESCRIPTION',
    APP_LINK: 'EDIT_APP_LINK',
    EXAMPLE: 'EDIT_EXAMPLE_CREATIVE'
};

const MyTzBuyerScene = new BaseScene('MyTzBuyerScene');

// Вход в сцену
MyTzBuyerScene.enter(async (ctx) => {
    await ctx.reply(ruMessage.messages.ok, tzBuyers());
});

MyTzBuyerScene.action('canceled_task', async (ctx) => {
    const updatedTask = await taskService.updateTask(ctx.session.selectedTask, {state: "canceled"});
    await ctx.deleteMessage();
    // Удаляем медиа, если оно было отправлено
    if (ctx.session.exampleMediaMessageId) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.exampleMediaMessageId);
        } catch (err) {
            console.error("Ошибка при удалении медиа:", err);
        }
        ctx.session.exampleMediaMessageId = null;
    }
    await ctx.reply(
        ruMessage.messages.start.replace('{name}', ctx.from.first_name),
        await start(ctx.from.id)
    );
    ctx.session = {};
    ctx.scene.leave();
});

// Обработчик для кнопки "back"
MyTzBuyerScene.action('back', async (ctx) => {
    try {
        const tgId = String(ctx.from.id);
        const user = await userService.findUserByTelegramId(tgId);
        
        if (!user) {
            await ctx.answerCbQuery('Пользователь не найден');
            return;
        }
        
        // Удаляем все медиа-примеры, если они есть
        if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
            for (const messageId of ctx.session.exampleMediaMessageIds) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
                } catch (error) {
                    console.error(`Ошибка при удалении сообщения: ${error.message}`);
                }
            }
            ctx.session.exampleMediaMessageIds = [];
        }
        
        // Удаляем обычное медиа, если оно было отправлено
        if (ctx.session.mediaMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.mediaMessageId);
                ctx.session.mediaMessageId = null;
            } catch (err) {
                console.error("Ошибка при удалении медиа:", err);
            }
        }
        
        // Удаляем пример креатива (одиночный медиа), если он был отправлен
        if (ctx.session.exampleMediaMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.exampleMediaMessageId);
                ctx.session.exampleMediaMessageId = null;
            } catch (err) {
                console.error("Ошибка при удалении медиа примера:", err);
            }
        }
        
        // Используем состояние из сессии (progress или wait)
        // По умолчанию используем progress, если состояние не указано
        const state = ctx.session.stateGetTask || 'progress';
        
        await ctx.editMessageText(
            ruMessage.messages.getTT.select_tt, 
            await myTasks(user._id, 'buyer', state)
        );
        
        // Очищаем выбранную задачу
        ctx.session.selectedTask = null;
        
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in "back" action:', error);
        await ctx.answerCbQuery('Произошла ошибка при возврате к списку задач');
    }
});

// Кнопка выйти (quit)
MyTzBuyerScene.action('quit', async (ctx) => {
    await ctx.deleteMessage();

    // Удаляем все медиа-примеры, если они есть
    if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
        for (const messageId of ctx.session.exampleMediaMessageIds) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
            } catch (error) {
                console.error(`Ошибка при удалении сообщения: ${error.message}`);
            }
        }
        ctx.session.exampleMediaMessageIds = [];
    }

    // Удаляем медиа, если оно было отправлено
    if (ctx.session.mediaMessageId) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.mediaMessageId);
            ctx.session.mediaMessageId = null;
        } catch (err) {
            console.error("Ошибка при удалении медиа:", err);
        }
    }
    
    // Удаляем пример креатива (одиночный медиа), если он был отправлен
    if (ctx.session.exampleMediaMessageId) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.exampleMediaMessageId);
            ctx.session.exampleMediaMessageId = null;
        } catch (err) {
            console.error("Ошибка при удалении медиа примера:", err);
        }
    }

    await ctx.reply(
        ruMessage.messages.start.replace('{name}', ctx.from.first_name),
        await start(ctx.from.id)
    );
    ctx.session = {};
    ctx.scene.leave();
});

// Обработчик для кнопки "show_example"
MyTzBuyerScene.action('show_example', async (ctx) => {
    try {
        const taskId = ctx.session.selectedTask; // Получаем ID выбранной задачи
        const task = await taskService.findTaskById(taskId); // Находим задачу по ID
        // Удаляем медиа, если оно было отправлено
        if (ctx.session.mediaMessageId) {
            try {
                // Удаляем медиа сообщение
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.mediaMessageId);

            } catch (err) {
                console.error("Ошибка при удалении медиа:", err);
            }
            ctx.session.mediaMessageId = null; // Сбрасываем message_id медиа
        }
        if (!task) {
            await ctx.answerCbQuery(ruMessage.messages.taskNotFound); // Если задача не найдена
            return;
        }

        // Инициализируем массив для хранения ID отправленных медиасообщений
        ctx.session.exampleMediaMessageIds = [];

        // Формируем строку с информацией о задаче
        const taskInfo = buildTaskInfo(task);

        // Если медиа (креативы) были отправлены ранее, удаляем их
        if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
            for (const messageId of ctx.session.exampleMediaMessageIds) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
                } catch (error) {
                    console.error(`Ошибка при удалении сообщения: ${error.message}`);
                }
            }
            ctx.session.exampleMediaMessageIds = [];
        }

        // Для обратной совместимости
        if (ctx.session.exampleMediaMessageId) {
            try {
                await ctx.deleteMessage(ctx.session.exampleMediaMessageId);
            } catch (deleteError) {
                console.error("Ошибка при удалении старого креатива:", deleteError);
            }
            ctx.session.exampleMediaMessageId = null;
        }

        // Отправляем информацию о задаче
        await ctx.editMessageText(taskInfo, back_to_task());

        // Обеспечиваем обратную совместимость, преобразуя строку в массив
        if (typeof task.example_creative === 'string' && task.example_creative.trim() !== '') {
            task.example_creative = [task.example_creative];
        } else if (!Array.isArray(task.example_creative)) {
            task.example_creative = [];
        }

        // Разделяем примеры на медиа и текст
        const mediaExamples = [];
        const textExamples = [];

        // Если есть примеры креативов, определяем их типы
        if (task.example_creative && task.example_creative.length > 0) {
            task.example_creative.forEach(example => {
                if (example.startsWith('AgAC') || example.startsWith('BAA') || example.startsWith('BQA') || 
                    example.startsWith('CQA') || example.startsWith('DQA')) {
                    mediaExamples.push(example);
                } else {
                    textExamples.push(example);
                }
            });
        }

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

        // Добавляем кнопку "К заданию", которая вернёт к описанию задания
        await ctx.answerCbQuery(); // Подтверждаем обработку callback
    } catch (error) {
        console.error('Error in show_example action:', error);
        await ctx.answerCbQuery(ruMessage.messages.errorOccurred);
    }
});

// Обработчик для кнопки "К заданию"
MyTzBuyerScene.action('back_to_task', async (ctx) => {
    try {
        const taskId = ctx.session.selectedTask; // Получаем ID выбранной задачи
        const task = await taskService.findTaskById(taskId); // Находим задачу по ID

        if (!task) {
            await ctx.answerCbQuery(ruMessage.messages.taskNotFound); // Если задача не найдена
            return;
        }

        const taskInfo = buildTaskInfo(task);

        // Удаляем все медиа-примеры, если они есть
        if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
            for (const messageId of ctx.session.exampleMediaMessageIds) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
                } catch (error) {
                    console.error(`Ошибка при удалении сообщения: ${error.message}`);
                }
            }
            ctx.session.exampleMediaMessageIds = [];
        }

        // Для обратной совместимости
        if (ctx.session.exampleMediaMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.exampleMediaMessageId);
                ctx.session.exampleMediaMessageId = null;
            } catch (deleteError) {
                console.error("Ошибка при удалении старого креатива:", deleteError);
            }
        }

        // Редактируем сообщение с описанием задания
        if (task.result) {
            // Если тип медиа сохранён, используем его
            let mediaResponse;
            if (task.mediaType) {
                if (task.mediaType === 'photo') {
                    mediaResponse = await ctx.replyWithPhoto(task.result);
                } else if (task.mediaType === 'video') {
                    mediaResponse = await ctx.replyWithVideo(task.result);
                }
            } else {
                // Если тип не сохранён, пробуем отправить как фото, а при ошибке – как видео
                try {
                    mediaResponse = await ctx.replyWithPhoto(task.result);
                } catch (photoError) {
                    try {
                        mediaResponse = await ctx.replyWithVideo(task.result);
                    } catch (videoError) {
                        console.error("Не удалось отправить медиа:", videoError);
                        await ctx.reply("Ошибка отправки медиафайла.");
                    }
                }
            }
    
            // Если медиа было отправлено, сохраняем его message_id для удаления
            if (mediaResponse && mediaResponse.message_id) {
                ctx.session.mediaMessageId = mediaResponse.message_id;
            }
        }
        const currentState = ctx.session.stateGetTask;

        let keyboard;
        if (currentState === 'progress') {
          keyboard = backInline();
        } else {
          keyboard = managementBuyerTasks();
        }
      
    
        await ctx.reply(taskInfo, keyboard);

        // Подтверждаем callback
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in back_to_task action:', error);
        await ctx.answerCbQuery(ruMessage.messages.errorOccurred);
    }
});


// Возврат к редактированию задачи (возврат к кнопкам редактирования)
MyTzBuyerScene.action('edited_task', async (ctx) => {
    // Здесь отображаем клавиатуру с кнопками edit_text, edit_app, edit_example
    await ctx.editMessageText(ctx.session.taskInfo, editTaskBuyerBot());
});

// Обработчик выбора задачи (regex ObjectId)
MyTzBuyerScene.action(/^[a-f0-9]{24}$/, async (ctx) => {
    const taskId = ctx.callbackQuery.data; // Получаем ID задачи из callback_data
    const task = await taskService.findTaskById(taskId); // Находим задачу по ID
    await ctx.deleteMessage();
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

    let keyboard;
    const currentState = ctx.session.stateGetTask;
    if (currentState === 'progress') {
      keyboard = backInline();
    } else {
      keyboard = managementBuyerTasks();
    }
  
    // Удаляем обычную клавиатуру перед отправкой inline клавиатуры
    await ctx.reply(taskInfo, {
        ...keyboard,
        reply_markup: {
            ...keyboard.reply_markup,
            remove_keyboard: true
        }
    });

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

    ctx.session.taskInfo = taskInfo;
    ctx.session.taskname = task.name;

    await ctx.answerCbQuery(); // Подтверждаем обработку callback
});

/**
 * Обработчики кнопок редактирования
 */
MyTzBuyerScene.action('edit_text', async (ctx) => {
    ctx.session.step = EDIT_STEPS.DESCRIPTION;
    await ctx.editMessageText('Введите новое описание (текст):');
});


MyTzBuyerScene.action('edit_app', async (ctx) => {
    ctx.session.step = EDIT_STEPS.APP_LINK;
    await ctx.editMessageText('Введите новую ссылку на приложение:');
});

MyTzBuyerScene.action('edit_example', async (ctx) => {
    ctx.session.step = EDIT_STEPS.EXAMPLE;
    await ctx.editMessageText('Введите новый пример креатива:');
});

/**
 * Обработка сообщений (on('text'))
 */
MyTzBuyerScene.on('text', async (ctx) => {
    const { step, selectedTask } = ctx.session;
    const tgId = String(ctx.from.id);
    const userInput = ctx.message.text;
    const user = await userService.findUserByTelegramId(tgId);

    // Если пользователь зачем-то ввёл "назад" текстом
    if (userInput === ruMessage.keyboards.back[0]) {
        await ctx.scene.enter('backScene');
        ctx.session = {};
        ctx.scene.leave();
        return;
    }

    // Обработка выбора статуса (active/progress)
    if (userInput === ruMessage.keyboards.tzBuyers.tz_in_progress) {
        ctx.session.stateGetTask = 'progress';
        
        // Удаляем все медиа-примеры, если они есть
        if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
            for (const messageId of ctx.session.exampleMediaMessageIds) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
                } catch (error) {
                    console.error(`Ошибка при удалении сообщения: ${error.message}`);
                }
            }
            ctx.session.exampleMediaMessageIds = [];
        }
        
        // Удаляем медиа, если оно было отправлено
        if (ctx.session.mediaMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.mediaMessageId);
                ctx.session.mediaMessageId = null;
            } catch (err) {
                console.error("Ошибка при удалении медиа:", err);
            }
        }
        
        // Удаляем пример креатива (одиночный медиа), если он был отправлен
        if (ctx.session.exampleMediaMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.exampleMediaMessageId);
                ctx.session.exampleMediaMessageId = null;
            } catch (err) {
                console.error("Ошибка при удалении медиа примера:", err);
            }
        }
        
        if (user) {
            const keyboard = await myTasks(user._id, 'buyer', ctx.session.stateGetTask);
            await ctx.reply(
                ruMessage.messages.getTT.select_tt,
                {
                    ...keyboard,
                    reply_markup: {
                        ...keyboard.reply_markup,
                        remove_keyboard: true
                    }
                }
            );
        }
        return;
    }
    if (userInput === ruMessage.keyboards.tzBuyers.tz_in_line) {
        ctx.session.stateGetTask = 'active';
        
        // Удаляем все медиа-примеры, если они есть
        if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
            for (const messageId of ctx.session.exampleMediaMessageIds) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
                } catch (error) {
                    console.error(`Ошибка при удалении сообщения: ${error.message}`);
                }
            }
            ctx.session.exampleMediaMessageIds = [];
        }
        
        // Удаляем медиа, если оно было отправлено
        if (ctx.session.mediaMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.mediaMessageId);
                ctx.session.mediaMessageId = null;
            } catch (err) {
                console.error("Ошибка при удалении медиа:", err);
            }
        }
        
        // Удаляем пример креатива (одиночный медиа), если он был отправлен
        if (ctx.session.exampleMediaMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.exampleMediaMessageId);
                ctx.session.exampleMediaMessageId = null;
            } catch (err) {
                console.error("Ошибка при удалении медиа примера:", err);
            }
        }
        
        if (user) {
            const keyboard = await myTasks(user._id, 'buyer', ctx.session.stateGetTask);
            await ctx.reply(
                ruMessage.messages.getTT.select_tt,
                {
                    ...keyboard,
                    reply_markup: {
                        ...keyboard.reply_markup,
                        remove_keyboard: true
                    }
                }
            );
        }
        return;
    }

    // Если нет выбранной задачи или нет "шага" редактирования — выходим
    if (!selectedTask || !step) {
        // Проверяем текущее состояние сцены и возвращаем пользователю информацию
        let currentState = "Просмотр задач";
        
        if (ctx.session.stateGetTask) {
            currentState = `Просмотр задач в состоянии: ${ctx.session.stateGetTask}`;
            await ctx.reply(`Вы находитесь в режиме просмотра задач. Текущий статус: ${ctx.session.stateGetTask}`);
            
            // Удаляем медиа, если оно было отправлено
            if (ctx.session.mediaMessageId) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.mediaMessageId);
                } catch (err) {
                    console.error("Ошибка при удалении медиа:", err);
                }
                ctx.session.mediaMessageId = null;
            }
            
            // Удаляем пример креатива (медиа), если он был отправлен
            if (ctx.session.exampleMediaMessageId) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.exampleMediaMessageId);
                } catch (err) {
                    console.error("Ошибка при удалении медиа примера:", err);
                }
                ctx.session.exampleMediaMessageId = null;
            }
            
            // Показываем список задач снова
            if (user) {
                const keyboard = await myTasks(user._id, 'buyer', ctx.session.stateGetTask);
                await ctx.reply(
                    ruMessage.messages.getTT.select_tt,
                    {
                        ...keyboard,
                        reply_markup: {
                            ...keyboard.reply_markup,
                            remove_keyboard: true
                        }
                    }
                );
            }
        } else if (selectedTask) {
            currentState = "Просмотр выбранной задачи";
            const task = await taskService.findTaskById(selectedTask);
            if (task) {
                await ctx.reply(`Вы просматриваете задачу: ${task.name}`);
            }
        } else {
            // Если не удалось определить состояние, возвращаем к начальному экрану
            await ctx.reply("Не удалось определить текущий шаг. Пожалуйста, выберите действие:", tzBuyers());
        }
        
        return;
    }

    const updatedField = {};

    // В зависимости от шага наполняем updatedField
    switch (step) {
        case EDIT_STEPS.DESCRIPTION:
            updatedField.description = userInput;
            break;
        case EDIT_STEPS.APP_LINK:
            updatedField.link_app = userInput;
            break;
        case EDIT_STEPS.EXAMPLE:
            updatedField.example_creative = userInput;
            break;
        default:
            // Неожиданное значение step
            await ctx.reply(`Не удалось обработать ваше сообщение. Текущий шаг: ${step}. Пожалуйста, следуйте инструкциям.`);
            return;
    }

    try {
        // Обновляем задачу, если есть, что обновить
        if (Object.keys(updatedField).length > 0) {
            const updatedTask = await taskService.updateTask(selectedTask, updatedField);

            if (!updatedTask) {
                await ctx.reply('Задача не найдена при обновлении.');
                return;
            }

            const updatedTaskInfo = buildTaskInfo(updatedTask);

            // Сохраняем новую информацию в session
            ctx.session.taskInfo = updatedTaskInfo;
            // Сбрасываем шаг, чтобы выйти из режима редактирования
            ctx.session.step = null;

            // Отправим новое сообщение с обновлённой информацией и клавиатурой
            await ctx.reply('Задача успешно обновлена:');
            await ctx.reply(updatedTaskInfo, editTaskBuyerBot());
        }
    } catch (error) {
        console.error('Ошибка при обновлении задачи:', error);
        await ctx.reply('Произошла ошибка при обновлении задачи. Попробуйте снова.');
    }
});

module.exports = MyTzBuyerScene;
