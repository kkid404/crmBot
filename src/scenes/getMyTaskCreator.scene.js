const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { back_to_task } = require('../keyboards/back_to_task.keyboard');
const { back_or_done_Creator } = require('../keyboards/back_or_done_Creator.keyboard');
const { formatDateMSK } = require('../utils/formatDate.util');
const userService = require('../services/user.service');
const taskChekerService = require('../services/taskCheker.service');
const taskService = require('../services/task.service');
const { backInline } = require('../keyboards/backInline.keyboard');
const { creatorTasks } = require('../keyboards/get_my_tt.keyboard');
const { start } = require('../keyboards/start.keyboard');


const getMyTtCreatorScene = new BaseScene('getMyTtCreatorScene');

// Максимальная длина текста для одного сообщения Telegram (запас от лимита 4096)
const MAX_TG_TEXT = 3000; // Уменьшаем лимит для большей безопасности

// Универсальная функция разбиения длинного текста на части, стараясь резать по пустым строкам или строкам
function splitLongText(text, maxLen = MAX_TG_TEXT) {
    const chunks = [];
    if (!text) return [''];
    let remaining = text;
    while (remaining.length > maxLen) {
        // Ищем ближайший удобный разрез до maxLen: двойной перенос, затем один перенос, затем пробел
        let cut = remaining.lastIndexOf('\n\n', maxLen);
        if (cut === -1) cut = remaining.lastIndexOf('\n', maxLen);
        if (cut === -1) cut = remaining.lastIndexOf(' ', maxLen);
        if (cut <= 0) cut = maxLen; // если ничего не нашли, режем жестко
        chunks.push(remaining.slice(0, cut).trim());
        remaining = remaining.slice(cut).trim();
    }
    if (remaining.length > 0) chunks.push(remaining);
    return chunks;
}

// Редактирует исходное сообщение первым куском и досылает остальные куски отдельными сообщениями
async function editLongWithKeyboard(ctx, text, keyboard) {
    const parts = splitLongText(text);
    // первый кусок — редактирование исходного сообщения с клавиатурой
    await ctx.editMessageText(parts[0], keyboard);
    // остальные — отдельными сообщениями без клавиатуры
    for (let i = 1; i < parts.length; i++) {
        await ctx.reply(parts[i]);
    }
}

// Отправляет первое сообщение с клавиатурой и остальные куски без клавиатуры
async function replyLongWithKeyboard(ctx, text, keyboard) {
    const parts = splitLongText(text);
    await ctx.reply(parts[0], keyboard);
    for (let i = 1; i < parts.length; i++) {
        await ctx.reply(parts[i]);
    }
}

getMyTtCreatorScene.enter(async (ctx) => {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    ctx.session.user = user;
    // Initialize page in session if not exists
    ctx.session.currentPage = 0;
    const keyboard = await creatorTasks(user._id, "progress", ctx.session.currentPage);
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

    // Сбрасываем страницу при возврате к списку задач
    ctx.session.currentPage = 0;
    
    // Возвращаем информацию о задаче и обновляем клавиатуру
    const keyboard = await creatorTasks(ctx.session.user._id, "progress", ctx.session.currentPage);
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

// Обработчик для кнопок пагинации
getMyTtCreatorScene.action(/^page_\d+$/, async (ctx) => {
    // Извлекаем номер страницы из callback_data
    const pageNumber = parseInt(ctx.callbackQuery.data.split('_')[1]);
    
    // Сохраняем текущую страницу в сессии
    ctx.session.currentPage = pageNumber;
    
    // Получаем обновленную клавиатуру с новой страницей
    const keyboard = await creatorTasks(ctx.session.user._id, "progress", pageNumber);
    
    // Обновляем сообщение с новой клавиатурой
    await ctx.editMessageText(ruMessage.messages.getTT.select_tt, keyboard);
});

// Обработчик для кнопки текущей страницы (чтобы не выдавать ошибку при нажатии)
getMyTtCreatorScene.action('current_page', async (ctx) => {
    await ctx.answerCbQuery('Текущая страница');
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
    const exampleLine = task.example_creative && task.example_creative.length ? 
        `🎨 Примеры креатива: ${task.example_creative.length}` : 
        "🎨 Примеры креатива: отсутствуют";

    // Получаем правки, если они есть
    const checkerRecords = await taskChekerService.findAllCheckersByTaskId(taskId);
    // Формируем массив строк вида: "дата\nсообщение" для каждой неуспешной проверки
    const failedCorrections = checkerRecords
        .filter(r => r.status === 'failed' && r.message)
        .map(r => {
            // Предпочтительно используем updatedAt, если он есть, иначе createdAt
            const dateSource = r.updatedAt || r.createdAt || Date.now();
            const dateStr = formatDateMSK(dateSource);
            return `${dateStr}\n${r.message}`;
        });

    // Если есть правки, добавляем заголовок и разделяем их пустой строкой
    const correctionsText = failedCorrections.length ? `Правки:\n${failedCorrections.join('\n\n')}\n` : '';

    // Формируем текст сообщения с информацией о задаче
    const formatTaskInfo = (task, exampleLine, correctionsText) => {
        // Ограничиваем длину только описания и правок
        const MAX_DESCRIPTION_LENGTH = 600;
        const MAX_CORRECTIONS_LENGTH = 400;
        
        let description = task.description || '';
        let hasFullDescription = description.length > MAX_DESCRIPTION_LENGTH;
        if (hasFullDescription) {
            description = description.substring(0, MAX_DESCRIPTION_LENGTH) + '...';
        }
        
        let limitedCorrections = correctionsText;
        let hasFullCorrections = correctionsText.length > MAX_CORRECTIONS_LENGTH;
        if (hasFullCorrections) {
            limitedCorrections = correctionsText.substring(0, MAX_CORRECTIONS_LENGTH) + '\n...';
        }
        
        // Форматируем ожидаемую дату выполнения
        const expectedDateStr = task.expectedDate ? 
            formatDateMSK(task.expectedDate) : 
            'не указана';
        
        // Добавляем время выполнения, если оно указано
        const expectedTimeStr = task.expectedTime ? 
            ` к ${task.expectedTime}` : 
            '';
            
        // Добавляем бонус, если он указан
        const bonusStr = task.bonus !== null && task.bonus !== undefined ? 
            `💰 Бонус: ${task.bonus}\n` : 
            '';
            
        // Добавляем CTR, если он указан
        const ctrStr = task.CTR !== null && task.CTR !== undefined ? 
            `📊 CTR: ${task.CTR}\n` : 
            '';
        
        return `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${description}
${exampleLine}
📅 Дата создания: ${formatDateMSK(task.createdAt)}
⏱️ Ожидаемая дата выполнения: ${expectedDateStr}${expectedTimeStr}
${limitedCorrections}${bonusStr}${ctrStr}`;
    }

    const taskInfo = formatTaskInfo(task, exampleLine, correctionsText);

    // Сохраняем полные данные в сессии для кнопок
    ctx.session.fullDescription = task.description;
    ctx.session.fullCorrections = correctionsText;
    ctx.session.hasFullDescription = (task.description || '').length > 600;
    ctx.session.hasFullCorrections = correctionsText.length > 400;

    // Редактируем сообщение с информацией о задаче (с разбиением длинного текста)
    await editLongWithKeyboard(ctx, taskInfo, backInline(task, {
        hasFullDescription: ctx.session.hasFullDescription,
        hasFullCorrections: ctx.session.hasFullCorrections
    }));

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
            // Всегда используем разбиение на части для безопасности
            const infoToSend = ctx.session.taskInfo || "Информация о задаче недоступна";
            await replyLongWithKeyboard(ctx, infoToSend, backInline(task));
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

// Обработчик для кнопки "Установить время"
getMyTtCreatorScene.action('set_expected_time', async (ctx) => {
    try {
        const taskId = ctx.session.selectedTask;
        if (!taskId) {
            await ctx.answerCbQuery('Задача не выбрана');
            return;
        }
        
        const task = await taskService.findTaskById(taskId);
        if (!task) {
            await ctx.answerCbQuery('Задача не найдена');
            return;
        }
        
        if (task.state !== 'time') {
            await ctx.answerCbQuery('Эта задача не ожидает установки времени');
            return;
        }
        
        // Сохраняем ID задачи для сцены установки времени
        ctx.session.taskIdForTimeSetting = taskId;
        
        // Переходим в сцену установки времени
        await ctx.scene.enter('setExpectedTimeScene');
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Ошибка в обработчике set_expected_time:', error);
        await ctx.answerCbQuery('Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
});

// Обработчик для показа полного описания
getMyTtCreatorScene.action('show_full_description', async (ctx) => {
    try {
        const fullDescription = ctx.session.fullDescription;
        if (!fullDescription) {
            await ctx.answerCbQuery('Описание недоступно');
            return;
        }
        
        // Разбиваем на части и отправляем
        const parts = splitLongText(fullDescription);
        for (const part of parts) {
            await ctx.reply(`📝 Полное описание:\n\n${part}`);
        }
        
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Ошибка при показе полного описания:', error);
        await ctx.answerCbQuery('Произошла ошибка');
    }
});

// Обработчик для показа полных правок
getMyTtCreatorScene.action('show_full_corrections', async (ctx) => {
    try {
        const fullCorrections = ctx.session.fullCorrections;
        if (!fullCorrections) {
            await ctx.answerCbQuery('Правки отсутствуют');
            return;
        }
        
        // Разбиваем на части и отправляем
        const parts = splitLongText(fullCorrections);
        for (const part of parts) {
            await ctx.reply(`✏️ Полные правки:\n\n${part}`);
        }
        
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Ошибка при показе полных правок:', error);
        await ctx.answerCbQuery('Произошла ошибка');
    }
});

module.exports = getMyTtCreatorScene;
