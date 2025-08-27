const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const { tzBuyers } = require('../keyboards/tzBuyers.keyboard');
const taskService = require('../services/task.service');
const userService = require('../services/user.service');
const { myTasks } = require('../keyboards/get_my_tt.keyboard');
const { replyCreative } = require('../keyboards/replyCreative.keyboard');
const { doneTask } = require('../keyboards/doneTask.keyboard');
const { back_to_task } = require('../keyboards/back_to_task.keyboard');
const { Markup } = require('telegraf');
const { setExpectedTimeKeyboard } = require('../keyboards/setExpectedTime.keyboard');




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
    let taskInfo = `🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${task.description}
${exampleLine}
📅 Дата создания: ${task.createdAt.toLocaleDateString()}
📅 Дата выполнения: ${task.completionDate.toLocaleDateString()}`;

    // Добавляем информацию о CTR, если она задана
    if (task.CTR !== null && task.CTR !== undefined) {
        taskInfo += `\n📊 CTR: ${task.CTR}`;
    }  

    // Добавляем информацию о бонусе, если она задана
    if (task.bonus !== null && task.bonus !== undefined) {
        taskInfo += `\n💰 Бонус для креативщика: ${task.bonus}`;
    }  

    return taskInfo;
}

const watchReadyTzScene = new BaseScene('watchReadyTzScene');

// Вход в сцену
watchReadyTzScene.enter(async (ctx) => {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    // Initialize page in session if not exists
    ctx.session.currentPage = 0;
    await ctx.reply(ruMessage.messages.getTT.select_tt, await myTasks(user._id, user.position, "done", ctx.session.currentPage));
});

// Обработчик для кнопки "show_example"
watchReadyTzScene.action('show_example', async (ctx) => {
    try {
        const taskId = ctx.session.selectedTask; // Получаем ID выбранной задачи
        const task = await taskService.findTaskById(taskId); // Находим задачу по ID
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

            ctx.session.exampleMediaMessageIds = [];
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

        // Определяем, какие примеры являются медиа, а какие текстом
        if (task.example_creative && task.example_creative.length > 0) {
            task.example_creative.forEach(example => {
                // Проверяем форматы file_id для Telegram
                if (typeof example === 'string' && 
                   (example.startsWith('AgAC') || example.startsWith('BAA') || example.startsWith('BQA') || 
                    example.startsWith('CQA') || example.startsWith('DQA'))) {
                    mediaExamples.push(example);
                } else if (typeof example === 'string') {
                    textExamples.push(example);
                }
            });
        }

        // Сначала отправляем текстовые примеры, если они есть
        if (textExamples.length > 0) {
            const textMessage = await ctx.reply(`📝 Текстовые примеры креативов:\n\n${textExamples.join('\n\n')}`);
            ctx.session.exampleMediaMessageIds.push(textMessage.message_id);
        }

        // Если есть медиафайлы, отправляем их в одном сообщении как медиагруппу
        if (mediaExamples.length > 0) {
            try {
                // Готовим массив медиафайлов для отправки в группе
                const mediaGroup = mediaExamples.map(fileId => {
                    // Определяем тип медиа по первым символам file_id
                    const isVideo = typeof fileId === 'string' && fileId.startsWith('BAA');
                    const isDocument = typeof fileId === 'string' && fileId.startsWith('BQA');
                    const isAudio = typeof fileId === 'string' && fileId.startsWith('CQA');
                    const isAnimation = typeof fileId === 'string' && fileId.startsWith('DQA');
                    
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
watchReadyTzScene.action('back_to_task', async (ctx) => {
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

            }
            ctx.session.exampleMediaMessageIds = [];
        }

        // Удаляем предыдущие медиа результатов
        if (ctx.session.mediaMessageIds && ctx.session.mediaMessageIds.length > 0) {
            ctx.session.mediaMessageIds = [];
        }
        
        if (ctx.session.mediaMessageId) {
            ctx.session.mediaMessageId = null;
        }

        // Редактируем сообщение с описанием задания
        if (task.result) {
            try {
                // Обрабатываем случай, когда result является массивом (новый формат)
                if (Array.isArray(task.result) && task.result.length > 0) {
                    // Разделяем медиафайлы по типам
                    const mediaGroup = task.result.map(fileId => {
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
                                
                                // Сохраняем ID всех отправленных сообщений для возможного удаления позже
                                if (sentMessages && sentMessages.length > 0) {
                                    if (!ctx.session.mediaMessageIds) {
                                        ctx.session.mediaMessageIds = [];
                                    }
                                    sentMessages.forEach(msg => {
                                        ctx.session.mediaMessageIds.push(msg.message_id);
                                    });
                                }
                            }
                        }
                    }
                } 
                // Обрабатываем случай, когда result является строкой (старый формат)
                else if (typeof task.result === 'string') {
                    // Если тип медиа сохранён, используем его
                    let mediaResponse;
                    if (task.mediaType === 'photo' || task.result.startsWith('AgAC')) {
                        mediaResponse = await ctx.replyWithPhoto(task.result);
                    } else if (task.mediaType === 'video' || task.result.startsWith('BAA')) {
                        mediaResponse = await ctx.replyWithVideo(task.result);
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
            } catch (error) {
                console.error("Не удалось отправить медиа:", error);
                await ctx.reply("Ошибка отправки медиафайла.");
            }
        }
    
        await ctx.reply(taskInfo, doneTask(task));

        // Подтверждаем callback
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in back_to_task action:', error);
        await ctx.answerCbQuery(ruMessage.messages.errorOccurred);
    }
});


// Кнопка назад
watchReadyTzScene.action('back', async (ctx) => {
    try {
        const tgId = String(ctx.from.id);
        const user = await userService.findUserByTelegramId(tgId);
        if (!user) {
            await ctx.answerCbQuery('Пользователь не найден');
            return;
        }

        // Удаляем все медиа-примеры, если они есть
        ctx.session.exampleMediaMessageIds = [];
        ctx.session.mediaMessageId = null;
        ctx.session.exampleMediaMessageId = null;
        
        // Добавляем очистку массива сообщений медиагруппы
        if (ctx.session.mediaMessageIds && ctx.session.mediaMessageIds.length > 0) {
            ctx.session.mediaMessageIds = [];
        }

        // Сбрасываем страницу при возврате к списку задач
        ctx.session.currentPage = 0;
        
        await ctx.editMessageText(ruMessage.messages.getTT.select_tt, await myTasks(user._id, user.position, "done", ctx.session.currentPage));
        
        // Очищаем выбранную задачу
        ctx.session.selectedTask = null;
        
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in "back" action:', error);
        await ctx.answerCbQuery('Произошла ошибка при возврате к списку задач');
    }
});

// Кнопка выйти (quit)
watchReadyTzScene.action('quit', async (ctx) => {
    // Очищаем все медиа-сообщения
    ctx.session.exampleMediaMessageIds = [];
    ctx.session.mediaMessageId = null;
    ctx.session.exampleMediaMessageId = null;
    
    // Добавляем очистку массива сообщений медиагруппы
    if (ctx.session.mediaMessageIds && ctx.session.mediaMessageIds.length > 0) {
        ctx.session.mediaMessageIds = [];
    }

    await ctx.reply(
        ruMessage.messages.start.replace('{name}', ctx.from.first_name),
        await start(ctx.from.id)
    );
    ctx.session = {};
    ctx.scene.leave();
});

// Обработчик для кнопок пагинации
watchReadyTzScene.action(/^page_\d+$/, async (ctx) => {
    try {
        // Извлекаем номер страницы из callback_data
        const pageNumber = parseInt(ctx.callbackQuery.data.split('_')[1]);
        
        // Сохраняем текущую страницу в сессии
        ctx.session.currentPage = pageNumber;
        
        const tgId = String(ctx.from.id);
        const user = await userService.findUserByTelegramId(tgId);
        if (!user) {
            await ctx.answerCbQuery('Пользователь не найден');
            return;
        }
        
        // Получаем обновленную клавиатуру с новой страницей
        const keyboard = await myTasks(user._id, user.position, "done", pageNumber);
        
        // Обновляем сообщение с новой клавиатурой
        await ctx.editMessageText(ruMessage.messages.getTT.select_tt, keyboard);
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in pagination action:', error);
        await ctx.answerCbQuery('Произошла ошибка при переключении страницы');
    }
});

// Обработчик для кнопки текущей страницы (чтобы не выдавать ошибку при нажатии)
watchReadyTzScene.action('current_page', async (ctx) => {
    await ctx.answerCbQuery('Текущая страница');
});


// Обработчик выбора задачи (regex ObjectId)
watchReadyTzScene.action(/^[a-f0-9]{24}$/, async (ctx) => {
    try {
        const taskId = ctx.callbackQuery.data;
        const task = await taskService.findTaskById(taskId);

        if (!task) {
            await ctx.answerCbQuery(ruMessage.messages.taskNotFound);
            return;
        }

        // Сохраняем ID задачи в сессии
        ctx.session.selectedTask = taskId;

        // Определяем, есть ли медиафайлы и преобразуем в массив, если нужно
        const hasMedia = Array.isArray(task.example_creative) 
            ? task.example_creative.length > 0 
            : typeof task.example_creative === 'string' && task.example_creative.trim() !== '';
        
        if (typeof task.example_creative === 'string' && task.example_creative.trim() !== '') {
            task.example_creative = [task.example_creative];
        } else if (!Array.isArray(task.example_creative)) {
            task.example_creative = [];
        }

        const taskInfo = buildTaskInfo(task);

        // Инициализируем массив для хранения ID отправленных медиасообщений
        ctx.session.exampleMediaMessageIds = [];
        
        // Очищаем старые ID сообщений с медиа
        if (ctx.session.mediaMessageIds && ctx.session.mediaMessageIds.length > 0) {
            ctx.session.mediaMessageIds = [];
        }
        
        if (ctx.session.mediaMessageId) {
            ctx.session.mediaMessageId = null;
        }

        if (task.result) {
            try {
                // Обрабатываем случай, когда result является массивом (новый формат)
                if (Array.isArray(task.result) && task.result.length > 0) {
                    // Разделяем медиафайлы по типам
                    const mediaGroup = task.result.map(fileId => {
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
                                
                                // Сохраняем ID всех отправленных сообщений для возможного удаления позже
                                if (sentMessages && sentMessages.length > 0) {
                                    if (!ctx.session.mediaMessageIds) {
                                        ctx.session.mediaMessageIds = [];
                                    }
                                    sentMessages.forEach(msg => {
                                        ctx.session.mediaMessageIds.push(msg.message_id);
                                    });
                                }
                            }
                        }
                    }
                } 
                // Обрабатываем случай, когда result является строкой (старый формат)
                else if (typeof task.result === 'string') {
                    // Если тип медиа сохранён, используем его
                    let mediaResponse;
                    if (task.mediaType === 'photo' || task.result.startsWith('AgAC')) {
                        mediaResponse = await ctx.replyWithPhoto(task.result);
                    } else if (task.mediaType === 'video' || task.result.startsWith('BAA')) {
                        mediaResponse = await ctx.replyWithVideo(task.result);
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
            } catch (error) {
                console.error("Не удалось отправить медиа:", error);
                await ctx.reply("Ошибка отправки медиафайла.");
            }
        }

        await ctx.reply(taskInfo, doneTask(task));

        // Сохраняем информацию в сессии
        ctx.session.taskInfo = taskInfo;
        ctx.session.taskname = task.name;

        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Ошибка в обработчике выбора задачи:', error);
        await ctx.answerCbQuery('Произошла ошибка при загрузке задачи');
    }
});

watchReadyTzScene.action('edit_ctr', async (ctx) => {
    try {

        const taskId = ctx.session.selectedTask;
        const task = await taskService.findTaskById(taskId);

        if (!task) {
            await ctx.answerCbQuery('Задача не найдена');
            return;
        }

        // Устанавливаем шаг для редактирования
        ctx.session.step = 1;

        // Запрашиваем у пользователя CTR
        await ctx.editMessageText('Введите новый CTR:\nНапример: 0.3');
    } catch (error) {
        console.error('Ошибка при обработке edit_ctr:', error);
        await ctx.answerCbQuery('Произошла ошибка');
    }
});

watchReadyTzScene.action('reply', async (ctx) => {
    await ctx.editMessageText(
        'Выберите тип креатива:',
        replyCreative() 
    );
    await ctx.answerCbQuery();
});

watchReadyTzScene.action(/^reply_/, async (ctx) => {
    // Получаем данные кнопки
    const actionData = ctx.callbackQuery.data; // например, "reply_uniq"

    // Отделяем префикс "reply_" от оставшейся части
    const replyType = actionData.replace('reply_', '');

    // Сохраняем тип креатива в сессии для последующего использования
    ctx.session.replyType = replyType;
    
    // Запрашиваем у пользователя новую ссылку на приложение
    await ctx.editMessageText('Введите новую ссылку на приложение:');
    
    // Устанавливаем флаг ожидания ссылки
    ctx.session.awaitingAppLink = true;
    
    await ctx.answerCbQuery();
});

// Обработчик для кнопки "❌ Отклонить" (reject_task)
watchReadyTzScene.action('reject_task', async (ctx) => {
    try {
        const taskId = ctx.session.selectedTask;
        if (!taskId) {
            await ctx.answerCbQuery('Задание не выбрано');
            return;
        }
        
        const task = await taskService.findTaskById(taskId);
        if (!task) {
            await ctx.answerCbQuery(ruMessage.messages.taskNotFound);
            return;
        }
        
        if (task.state !== 'done') {
            await ctx.answerCbQuery('Это задание не находится в статусе "Выполнено"');
            return;
        }
        
        // Запрашиваем у пользователя сообщение с правками
        ctx.session.waitingForRejectionMessage = true;
        await ctx.reply("❌ Введите сообщение с правками для креативщика:");
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in "reject_task" action:', error);
        await ctx.answerCbQuery('Произошла ошибка при отклонении задания');
    }
});

// Модифицируем обработчик текстовых сообщений, чтобы добавить обработку сообщений с правками
watchReadyTzScene.on('text', async (ctx) => {
    // Проверяем, ожидаем ли мы сообщение с правками для отклонения задания
    if (ctx.session.waitingForRejectionMessage) {
        try {
            const taskId = ctx.session.selectedTask;
            const task = await taskService.findTaskById(taskId);
            
            if (!task) {
                await ctx.reply('Задание не найдено');
                ctx.session.waitingForRejectionMessage = false;
                return;
            }
            
            const rejectionMessage = ctx.message.text;
            const creator = await userService.findById(task.creator);
            
            if (!creator) {
                await ctx.reply('Креативщик не найден');
                ctx.session.waitingForRejectionMessage = false;
                return;
            }
            
            // Обновляем задание: возвращаем в статус "progress" и увеличиваем версию
            await taskService.updateTask(taskId, { 
                state: 'progress', 
                version: (task.version || 1) + 1 
            });
            
            // Формируем сообщение для креативщика
            const taskInfo = buildTaskInfo(task);
            const creativeMessage = `
❌ Задание "${task.name}" отклонено заказчиком и требует доработки:

${taskInfo}

🔴 Правки от заказчика:
${rejectionMessage}
            `;
            
            // Отправляем сообщение креативщику
            await ctx.telegram.sendMessage(creator.tg_id, creativeMessage);
            
            // Сообщаем пользователю об успешном отклонении
            await ctx.reply(`✅ Задание "${task.name}" отклонено и возвращено креативщику на доработку.`);
            
            // Возвращаемся к списку заданий
            const tgId = String(ctx.from.id);
            const user = await userService.findUserByTelegramId(tgId);
            await ctx.reply(ruMessage.messages.getTT.select_tt, await myTasks(user._id, user.position, "done"));
            
            // Сбрасываем флаг ожидания
            ctx.session.waitingForRejectionMessage = false;
            
            // Очищаем сохраненные ID медиафайлов
            ctx.session.exampleMediaMessageIds = [];
            ctx.session.mediaMessageId = null;
            ctx.session.mediaMessageIds = [];
            
            return;
        } catch (error) {
            console.error('Error processing rejection message:', error);
            await ctx.reply('Произошла ошибка при обработке отклонения задания. Попробуйте позже.');
            ctx.session.waitingForRejectionMessage = false;
            return;
        }
    }
    
    // Проверяем, ожидаем ли мы ссылку на приложение
    if (ctx.session.awaitingAppLink) {
        // Получаем новую ссылку из сообщения пользователя
        const newAppLink = ctx.message.text;
        
        // Сохраняем ссылку в сессии
        ctx.session.newAppLink = newAppLink;
        
        // Сбрасываем флаг ожидания ссылки
        ctx.session.awaitingAppLink = false;
        
        // Получаем данные из сессии
        const { replyType, selectedTask } = ctx.session;
        const taskId = selectedTask;
        const task = await taskService.findTaskById(taskId);

        if (!task) {
            await ctx.reply("Задача не найдена.");
            return;
        }

        // Получаем данные пользователя
        const tgId = String(ctx.from.id);
        let user;
        try {
            user = await userService.findUserByTelegramId(tgId);
        } catch (error) {
            console.error("Ошибка получения пользователя:", error);
            await ctx.reply("Ошибка при получении данных пользователя.");
            return;
        }

        const creator = await userService.findById(task.creator);
        if (!creator) {
            await ctx.reply("Создатель задания не найден.");
            return;
        }

        // Переменная для создания нового имени креатива (номер уникального креатива по счету)
        let newName;

        // В зависимости от типа креатива, формируем имя и сохраняем данные
        switch (replyType) {
            case 'uniq':
                // Логика для "Уник"
                const uniqCount = await taskService.getTaskSpecificUniqCount(task.name); // Функция для подсчета количества уникальных креативов для этого конкретного задания
                newName = `${task.name}_U_${uniqCount + 1}`;

                const data = {
                    name: newName,
                    link_app: newAppLink, // Используем новую ссылку
                    description: task.description,
                    example_creative: task.example_creative,
                    buyer: user._id,
                    creator: creator._id, 
                    state: 'progress',
                    points: null,
                    completionDate: null,
                    CTR: null,
                    bonus: null,
                    result: null,
                    version: 1,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                try {
                    const createdTask = await taskService.createTask(data);
                    console.log(`[Reply->UNIQ] Created task: _id=${createdTask?._id}, name=${createdTask?.name}, creatorTG=${creator.tg_id}`);
                    await ctx.reply(ruMessage.messages.writeTT.queued.replace("{name}", newName), await start(ctx.from.id));
                    // Prompt creator to set expected time for the new task
                    console.log(`[Reply->UNIQ] Sending expected time prompt to creator for task ${createdTask?._id}`);
                    await ctx.telegram.sendMessage(
                        creator.tg_id,
                        `🔔 Для задачи "${createdTask?.name}" укажите дату и время сдачи:`,
                        setExpectedTimeKeyboard(createdTask?._id)
                    );
                    // Inform creator about new task as before
                    await ctx.telegram.sendMessage(creator.tg_id, `⏱️ Поступило новое задание ${newName}`);
                } catch (error) {
                    console.log(error);
                    await ctx.reply(ruMessage.messages.errors.writeTT, await start(ctx.from.id));
                }
                await ctx.reply(`Вы выбрали креатив: Уник. Новый креатив создан с именем ${newName}`);
                ctx.session = {};
                ctx.scene.leave();
                break;

            case 'adaptiv':
               // Логика для "Адаптив"
                // Задаем вопрос "Что адаптировать?", но только после получения новой ссылки
                await ctx.reply("Что адаптировать?");

                // Ожидаем ответа от пользователя, но сохраняем информацию, что после этого шага мы в режиме адаптива
                ctx.session.step = 'adaptiv_what'; // Устанавливаем текущий шаг для адаптива
                break;

            case 'deep_uniq':
                // Логика для "Глубокий уник"
                const deepUniqCount = await taskService.getTaskSpecificDeepUniqCount(task.name); // Функция для подсчета количества глубоких уникальных креативов для этого конкретного задания
                newName = `DU_${task.name}_${deepUniqCount + 1}`;

                const dataDU = {
                    name: newName,
                    link_app: newAppLink,
                    description: task.description,
                    example_creative: task.example_creative,
                    buyer: user._id,
                    creator: creator._id, 
                    state: 'progress',
                    points: null,
                    completionDate: null,
                    CTR: null,
                    bonus: null,
                    result: null,
                    version: 1,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                try {
                    const createdTaskDU = await taskService.createTask(dataDU);
                    console.log(`[Reply->DEEP_UNIQ] Created task: _id=${createdTaskDU?._id}, name=${createdTaskDU?.name}, creatorTG=${creator.tg_id}`);
                    await ctx.reply(ruMessage.messages.writeTT.queued.replace("{name}", newName), await start(ctx.from.id));
                    // Prompt creator to set expected time for the new task
                    console.log(`[Reply->DEEP_UNIQ] Sending expected time prompt to creator for task ${createdTaskDU?._id}`);
                    await ctx.telegram.sendMessage(
                        creator.tg_id,
                        `🔔 Для задачи "${createdTaskDU?.name}" укажите дату и время сдачи:`,
                        setExpectedTimeKeyboard(createdTaskDU?._id)
                    );
                    // Inform creator about new task as before
                    await ctx.telegram.sendMessage(creator.tg_id, `⏱️ Поступило новое задание ${newName}`);
                } catch (error) {
                    console.log(error);
                    await ctx.reply(ruMessage.messages.errors.writeTT, await start(ctx.from.id));
                }
                ctx.session = {};
                ctx.scene.leave();
                break;

            default:
                await ctx.reply("Неверный выбор.");
        }
        return; // Важно выйти из обработчика
    }

    // Получаем данные из сессии
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

    if (ctx.session.step === 'adaptiv_what') {
        const adaptivText = ctx.message.text;

        // Получаем данные задания
        const taskId = ctx.session.selectedTask;
        const task = await taskService.findTaskById(taskId);

        if (!task) {
            await ctx.reply("Задача не найдена.");
            return;
        }

        // Формируем новое описание, добавляя текст адаптации в начало
        const newDescription = `${adaptivText} ${task.description}`;

        // Генерируем новое имя с префиксом "A_" и увеличением номера креатива
        const adaptivCount = await taskService.getTaskSpecificAdaptivCount(task.name); // Функция для подсчета количества адаптивных креативов для этого конкретного задания
        const newName = `${task.name}_A_${adaptivCount + 1}`;
        const creator = await userService.findById(task.creator);
        // Создание нового задания с обновленным описанием
        const newTaskAdaptiv = {
            name: newName,
            link_app: ctx.session.newAppLink, // Используем новую ссылку на приложение
            description: newDescription,
            example_creative: task.example_creative,
            buyer: user._id,
            creator: creator._id, 
            state: 'progress',
            points: null,
            completionDate: null,
            CTR: null,
            bonus: null,
            result: null,
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        try {
            const createdAdaptiv = await taskService.createTask(newTaskAdaptiv);
            console.log(`[Reply->ADAPTIV] Created task: _id=${createdAdaptiv?._id}, name=${createdAdaptiv?.name}, creatorTG=${creator.tg_id}`);
            // Prompt creator to set expected time for the new task
            console.log(`[Reply->ADAPTIV] Sending expected time prompt to creator for task ${createdAdaptiv?._id}`);
            await ctx.telegram.sendMessage(
                creator.tg_id,
                `🔔 Для задачи "${createdAdaptiv?.name}" укажите дату и время сдачи:`,
                setExpectedTimeKeyboard(createdAdaptiv?._id)
            );
            await ctx.telegram.sendMessage(creator.tg_id, `⏱️ Поступило новое задание ${newName}`);
            await ctx.reply(`Вы выбрали креатив: Адаптив. Новый креатив создан с именем ${newName}`);
            ctx.session = {};
            ctx.scene.leave();
        } catch (error) {
            console.log(error);
            await ctx.reply("Ошибка при создании нового задания.");
            ctx.session = {};
            ctx.scene.leave();
        }

        // Завершаем шаг
        ctx.session.step = null; // Сбрасываем шаг
        return;
    }

    // Если нет выбранной задачи или нет "шага" редактирования — выходим
    if (!selectedTask || !step) {
        // Проверяем текущее состояние сцены и возвращаем пользователю информацию
        let currentState = "Просмотр задач";
        
        if (ctx.session.awaitingAppLink) {
            currentState = "Ожидание ввода новой ссылки на приложение";
            await ctx.reply("Пожалуйста, введите новую ссылку на приложение.");
        } else if (ctx.session.step === 'adaptiv_what') {
            currentState = "Ожидание ввода текста для адаптации";
            await ctx.reply("Пожалуйста, введите текст для адаптации.");
        } else if (ctx.session.step === 1) {
            currentState = "Ожидание ввода CTR";
            await ctx.reply("Пожалуйста, введите CTR для креатива.");
        } else if (ctx.session.step === 2) {
            currentState = "Ожидание ввода бонуса";
            await ctx.reply("Пожалуйста, введите бонус для креативщика.");
        } else if (selectedTask) {
            currentState = "Просмотр выбранной задачи";
            const task = await taskService.findTaskById(selectedTask);
            if (task) {
                // Вместо простого сообщения с именем задачи отправляем полную информацию
                const taskInfo = buildTaskInfo(task);
                
                // Отправляем результат задачи, если он есть
                if (task.result) {
                    try {
                        // Обрабатываем случай, когда result является массивом (новый формат)
                        if (Array.isArray(task.result) && task.result.length > 0) {
                            // Разделяем медиафайлы по типам
                            const mediaGroup = task.result.map(fileId => {
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
                                        
                                        // Сохраняем ID всех отправленных сообщений для возможного удаления позже
                                        if (sentMessages && sentMessages.length > 0) {
                                            if (!ctx.session.mediaMessageIds) {
                                                ctx.session.mediaMessageIds = [];
                                            }
                                            sentMessages.forEach(msg => {
                                                ctx.session.mediaMessageIds.push(msg.message_id);
                                            });
                                        }
                                    }
                                }
                            }
                        } 
                        // Обрабатываем случай, когда result является строкой (старый формат)
                        else if (typeof task.result === 'string') {
                            // Если тип медиа сохранён, используем его
                            let mediaResponse;
                            if (task.mediaType === 'photo' || task.result.startsWith('AgAC')) {
                                mediaResponse = await ctx.replyWithPhoto(task.result);
                            } else if (task.mediaType === 'video' || task.result.startsWith('BAA')) {
                                mediaResponse = await ctx.replyWithVideo(task.result);
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
                    } catch (error) {
                        console.error("Не удалось отправить медиа:", error);
                        await ctx.reply("Ошибка отправки медиафайла.");
                    }
                }
                
                // Отправляем информацию о задаче с кнопками
                await ctx.reply(taskInfo, doneTask(task));
            }
        } else {
            // Если не удалось определить состояние, возвращаем список задач
            const tgId = String(ctx.from.id);
            const user = await userService.findUserByTelegramId(tgId);
            if (user) {
                await ctx.reply("Выберите задачу из списка:", await myTasks(user._id, user.position, "done", ctx.session.currentPage || 0));
            } else {
                await ctx.reply("Не удалось определить текущий шаг. Пожалуйста, вернитесь в главное меню.", await start(ctx.from.id));
            }
        }
        
        return;
    }

    // Добавляем обработку шагов для ввода CTR и бонуса
    if (step === 1) {
        // Пользователь ввел CTR
        ctx.session.CTR = ctx.message.text;

        // Переходим ко второму вопросу — запрос бонуса
        ctx.session.step = 2;
        await ctx.reply('Введите бонус для креативщика:\nНапример: 1000');
    } else if (step === 2) {
        // Пользователь ввел бонус
        const bonus = ctx.message.text;

        // Сохраняем значения в задаче
        const taskId = ctx.session.selectedTask;
        const task = await taskService.findTaskById(taskId);

        if (task) {
            task.CTR = ctx.session.CTR;  // Обновляем CTR
            task.bonus = bonus;  // Обновляем бонус

            // Сохраняем обновленную задачу в базе данных
            await taskService.updateTask(taskId, { CTR: task.CTR, bonus: task.bonus });

            // Отправляем подтверждение пользователю
            ctx.session.step = 0; // Сбрасываем шаг

            await ctx.reply(ruMessage.messages.getTT.select_tt, await myTasks(user._id, user.position, "done"));
        } else {
            await ctx.reply('Задача не найдена.');
        }
    } else {
        // Если мы здесь, значит пользователь отправил текст, который не обрабатывается ни одним из обработчиков
        // Возвращаем информацию о текущем шаге
        await ctx.reply(`Не удалось обработать ваше сообщение. Текущий шаг: ${step}. Пожалуйста, следуйте инструкциям.`);
    }
});

module.exports = watchReadyTzScene;
