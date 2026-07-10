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
const splitLongMessage = require('../utils/splitMessage.util');
const { formatDateMSK, formatDateTimeMSK } = require('../utils/formatDate.util');

const WEB_BASE_URL = process.env.WEB_BASE_URL || 'http://localhost:3001';
const https = require('https');
const http = require('http');
const path = require('path');

// Определяет является ли строка веб-путём (/uploads/...) а не Telegram file_id
function isWebPath(str) {
    return typeof str === 'string' && (str.startsWith('/uploads/') || str.startsWith('http'));
}

// Внешняя ссылка (Google Drive и т.п.) — не наш файл, отправляем текстом, а не медиа,
// иначе Telegram скачивает HTML-страницу и присылает document.dat
function isExternalUrl(str) {
    return typeof str === 'string' && str.startsWith('http') && !str.includes('/uploads/');
}

// Возвращает полный URL для веб-файла
function toFullUrl(str) {
    if (str.startsWith('http')) return str;
    return `${WEB_BASE_URL}${str}`;
}

// Определяет тип медиа по расширению (для веб-файлов) или по file_id (для Telegram)
function getMediaType(str) {
    if (isWebPath(str)) {
        const ext = str.split('.').pop().toLowerCase().split('?')[0];
        if (['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'].includes(ext)) return 'video';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'photo';
        return 'document';
    }
    if (str.startsWith('BAA') || str.startsWith('BAQ')) return 'video';
    if (str.startsWith('BQA') || str.startsWith('CQA') || str.startsWith('DQA')) return 'document';
    return 'photo';
}

// Отправляет массив файлов результата (веб-пути или Telegram file_id) пользователю
async function sendResultMedia(ctx, resultFiles, taskName) {
    if (!resultFiles || resultFiles.length === 0) return;

    // Внешние ссылки (Google Drive и т.п.) — текстом
    const externalUrls = resultFiles.filter(isExternalUrl);
    if (externalUrls.length) {
        const text = `🔗 Результат работы${taskName ? ` «${taskName}»` : ''}:\n\n` +
            externalUrls.map((u, i) => (externalUrls.length > 1 ? `${i + 1}. ${u}` : u)).join('\n');
        try {
            await ctx.reply(text, { disable_web_page_preview: false });
        } catch (e) {
            console.error('[sendResultMedia] Failed to send external links:', e?.description || e?.message);
        }
    }

    const mediaFiles = resultFiles.filter(f => !isExternalUrl(f));
    const webFiles = mediaFiles.filter(isWebPath);
    const tgFiles = mediaFiles.filter(f => !isWebPath(f));

    // Веб-файлы: пробуем отправить через URL, при ошибке даём кнопку скачивания
    for (const file of webFiles) {
        const url = toFullUrl(file);
        const type = getMediaType(file);
        const ext = file.split('.').pop().toLowerCase().split('?')[0];
        const filename = taskName ? `${taskName}.${ext}` : path.basename(file);
        try {
            if (type === 'video') await ctx.replyWithVideo({ url });
            else if (type === 'photo') await ctx.replyWithPhoto({ url });
            else await ctx.replyWithDocument({ url });
        } catch (e) {
            console.error('[sendResultMedia] Failed to send web file:', url, e?.description || e?.message);
            await ctx.reply(`🎬 <b>${filename}</b>\n\nСкачайте файл напрямую:`, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: '⬇️ Скачать', url }]]
                }
            });
        }
    }

    // Telegram file_id: одиночный файл через replyWith*, группу через sendMediaGroup
    if (tgFiles.length === 1) {
        const fileId = tgFiles[0];
        const type = getMediaType(fileId);
        try {
            if (type === 'video') await ctx.replyWithVideo(fileId);
            else if (type === 'document') await ctx.replyWithDocument(fileId);
            else await ctx.replyWithPhoto(fileId);
        } catch (e) {
            console.error('[sendResultMedia] Failed to send single tg file:', e?.description || e?.message);
        }
    } else if (tgFiles.length > 1) {
        const chunks = [];
        for (let i = 0; i < tgFiles.length; i += 10) chunks.push(tgFiles.slice(i, i + 10));
        for (const chunk of chunks) {
            const mediaGroup = chunk.map(fileId => ({ type: getMediaType(fileId), media: fileId }));
            try {
                await ctx.telegram.sendMediaGroup(ctx.chat.id, mediaGroup);
            } catch (e) {
                console.error('[sendResultMedia] Failed to send tg media group:', e?.description || e?.message);
            }
        }
    }
}




// Функция для сборки текста задачи
const MAX_DESCRIPTION_LENGTH = 600;

function buildTaskInfo(task, state) {
    // Определяем, есть ли медиафайлы
    const hasMedia = Array.isArray(task.example_creative) 
        ? task.example_creative.length > 0 
        : typeof task.example_creative === 'string' && task.example_creative.trim() !== '';
    
    // Формируем строку для отображения информации о примерах креатива
    const exampleLine = hasMedia
        ? `🎨 Примеры креатива: ${Array.isArray(task.example_creative) ? task.example_creative.length : 1}`
        : "🎨 Примеры креатива: отсутствуют";

    // Проверяем, создан ли заказ от лица другого баера
    let createdByInfo = '';
    if (task.createdBy && task.buyer && 
        task.createdBy._id && task.buyer._id &&
        task.createdBy._id.toString() !== task.buyer._id.toString()) {
        const createdByName = task.createdBy.username || 'неизвестно';
        const buyerName = task.buyer.username || 'неизвестно';
        createdByInfo = `👤 Создал: @${createdByName} от лица @${buyerName}\n`;
    }

    // Полное описание - будет разбито на части функцией splitLongMessage
    const fullDescription = task.description || '';
    const description = fullDescription;
    const hasFullDescription = false; // Не нужна кнопка, т.к. показываем полностью

    // Базовый текст
    let taskInfo = `🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${description}
${exampleLine}
${createdByInfo}📅 Дата создания: ${formatDateMSK(task.createdAt)}
📅 Дата выполнения: ${formatDateMSK(task.completionDate)}`;

    // Добавляем информацию о CTR, если она задана
    if (task.CTR !== null && task.CTR !== undefined) {
        taskInfo += `\n📊 CTR: ${task.CTR}`;
    }

    return { taskInfo, fullDescription, hasFullDescription };
}

const watchReadyTzScene = new BaseScene('watchReadyTzScene');

// Вход в сцену
watchReadyTzScene.enter(async (ctx) => {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    // Initialize page in session if not exists
    ctx.session.currentPage = 0;
    
    // Если задача уже выбрана (переход по кнопке из уведомления), показываем её сразу
    if (ctx.session.selectedTask) {
        const taskId = ctx.session.selectedTask;
        const task = await taskService.findTaskById(taskId);
        
        if (!task) {
            await ctx.reply(ruMessage.messages.taskNotFound);
            await ctx.reply(ruMessage.messages.getTT.select_tt, await myTasks(user._id, user.position, "done", ctx.session.currentPage));
            return;
        }
        
        // Определяем, есть ли медиафайлы и преобразуем в массив, если нужно
        const hasMedia = Array.isArray(task.example_creative) 
            ? task.example_creative.length > 0 
            : typeof task.example_creative === 'string' && task.example_creative.trim() !== '';
        
        if (typeof task.example_creative === 'string' && task.example_creative.trim() !== '') {
            task.example_creative = [task.example_creative];
        } else if (!Array.isArray(task.example_creative)) {
            task.example_creative = [];
        }

        const { taskInfo, fullDescription, hasFullDescription } = buildTaskInfo(task);
        
        // Сохраняем в сессии для использования позже
        ctx.session.fullDescription = fullDescription;
        ctx.session.hasFullDescription = hasFullDescription;

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
            const files = Array.isArray(task.result) ? task.result : [task.result];
            await sendResultMedia(ctx, files, task.name);
        }

        // Разбиваем длинное сообщение на части
        const messageParts = splitLongMessage(taskInfo);
        
        // Первая часть с клавиатурой
        await ctx.reply(messageParts[0], doneTask(task));
        
        // Остальные части без клавиатуры
        for (let i = 1; i < messageParts.length; i++) {
            await ctx.reply(messageParts[i]);
        }

        // Сохраняем информацию в сессии
        ctx.session.taskInfo = taskInfo;
        ctx.session.taskname = task.name;
        
        return;
    }
    
    // Если задача не выбрана, показываем список
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
        const { taskInfo, fullDescription, hasFullDescription } = buildTaskInfo(task);
        
        ctx.session.fullDescription = fullDescription;
        ctx.session.hasFullDescription = hasFullDescription;

        // Если медиа (креативы) были отправлены ранее, удаляем их
        if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {

            ctx.session.exampleMediaMessageIds = [];
        }

        // Разбиваем длинное сообщение на части
        const messageParts = splitLongMessage(taskInfo);
        
        // Первая часть с клавиатурой
        await ctx.editMessageText(messageParts[0], back_to_task());
        
        // Остальные части без клавиатуры
        for (let i = 1; i < messageParts.length; i++) {
            await ctx.reply(messageParts[i], replyCreative({ hasFullDescription: ctx.session.hasFullDescription }));
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

        const { taskInfo, fullDescription, hasFullDescription } = buildTaskInfo(task);
        
        ctx.session.fullDescription = fullDescription;
        ctx.session.hasFullDescription = hasFullDescription;

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
            const files = Array.isArray(task.result) ? task.result : [task.result];
            await sendResultMedia(ctx, files, task.name);
        }
    
        // Разбиваем длинное сообщение на части
        const messageParts = splitLongMessage(taskInfo);
        
        // Первая часть с клавиатурой
        await ctx.reply(messageParts[0], doneTask(task));
        
        // Остальные части без клавиатуры
        for (let i = 1; i < messageParts.length; i++) {
            await ctx.reply(messageParts[i]);
        }

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

        const { taskInfo, fullDescription, hasFullDescription } = buildTaskInfo(task);
        
        // Сохраняем в сессии для использования позже
        ctx.session.fullDescription = fullDescription;
        ctx.session.hasFullDescription = hasFullDescription;

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
            const files = Array.isArray(task.result) ? task.result : [task.result];
            await sendResultMedia(ctx, files, task.name);
        }

        // Разбиваем длинное сообщение на части
        const messageParts = splitLongMessage(taskInfo);
        
        // Первая часть с клавиатурой
        await ctx.reply(messageParts[0], doneTask(task));
        
        // Остальные части без клавиатуры
        for (let i = 1; i < messageParts.length; i++) {
            await ctx.reply(messageParts[i]);
        }

        // Сохраняем информацию в сессии
        ctx.session.taskInfo = taskInfo;
        ctx.session.taskname = task.name;

        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Ошибка в обработчике выбора задачи:', error);
        await ctx.answerCbQuery('Произошла ошибка при загрузке задачи');
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

    // Для уников и глубоких уников запрашиваем количество
    if (replyType === 'uniq' || replyType === 'deep_uniq') {
        await ctx.editMessageText('🔢 Введите количество креативов (например: 3):');
        ctx.session.awaitingQuantity = true;
    } else {
        // Для остальных типов сразу запрашиваем комментарий
        await ctx.editMessageText('✍️ Опишите, что нужно сделать по этому креативу:');
        ctx.session.awaitingComment = true;
    }
    
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

// Обработчик для кнопки "✅ Завершить ввод" комментария
watchReadyTzScene.action('finish_comment_input', async (ctx) => {
    try {
        if (!ctx.session.commentParts || ctx.session.commentParts.length === 0) {
            await ctx.answerCbQuery('Нет накопленного текста');
            return;
        }
        
        // Объединяем все части сообщения
        const fullCommentText = ctx.session.commentParts.join('\n');
        
        // Сбрасываем флаги
        ctx.session.awaitingComment = false;
        ctx.session.commentParts = [];
        
        await ctx.answerCbQuery('Обработка комментария...');
        await ctx.reply(`📝 Обрабатываю комментарий (${fullCommentText.length} символов)...`);
        
        // Получаем данные из сессии
        const { replyType, selectedTask } = ctx.session;
        const taskId = selectedTask;
        const task = await taskService.findTaskById(taskId);

        if (!task) {
            await ctx.reply("Задача не найдена.");
            return;
        }

        console.log(`[REPLY_HANDLER] Task loaded: ${task.name}`);
        console.log(`[REPLY_HANDLER] task.result:`, task.result);
        console.log(`[REPLY_HANDLER] task.example_creative:`, task.example_creative);

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
            await ctx.reply("Креативщик не найден.");
            return;
        }

        // Переменная для создания нового имени креатива (номер по счету)
        let newName;
        // Базовое описание с учетом комментария заказчика
        const commentBlock = `\n\n📝 Комментарий заказчика:\n${fullCommentText}`;
        // Дата и время запроса (для однозначной привязки комментария)
        const commentDate = formatDateTimeMSK(new Date());
        // Базовое описание без предыдущих комментариев заказчика
        let baseDescription = String(task.description || '');
        // Отсекаем всё после первого маркера комментария (если он был)
        baseDescription = baseDescription.split('\n📝 Комментарий заказчика:')[0];
        // Удаляем возможную висящую строку даты запроса в конце
        baseDescription = baseDescription.replace(/\n📅 Дата запроса:.*$/, '');

        try {
            if (replyType === 'uniq') {
                const uniqCount = await taskService.getTaskSpecificUniqCount(task.name);
                newName = `${task.name}_U_${uniqCount + 1}`;
                
                const quantity = ctx.session.creativeQuantity || 1;
                const quantityText = quantity > 1 ? `\n🔢 Количество: ${quantity} шт.` : '';

                // Для уникализации берем result из исходной задачи как примеры
                const examplesForUniq = (Array.isArray(task.result) && task.result.length > 0) 
                    ? task.result 
                    : (Array.isArray(task.example_creative) && task.example_creative.length > 0)
                        ? task.example_creative
                        : [];

                const data = {
                    name: newName,
                    link_app: task.link_app,
                    description: `${baseDescription}\n📅 Дата запроса: ${commentDate}${quantityText}${commentBlock}`,
                    example_creative: examplesForUniq,
                    buyer: user._id,
                    createdBy: task.createdBy || user._id,
                    creator: creator._id,
                    state: 'time',
                    points: null,
                    completionDate: null,
                    CTR: null,
                    bonus: null,
                    result: null,
                    version: 1,
                    quantity: quantity,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                const createdTask = await taskService.createTask(data);
                console.log(`[Reply->UNIQ] Created task: _id=${createdTask?._id}, name=${createdTask?.name}, creatorTG=${creator.tg_id}`);

                // Compose detailed message for creator: first new task, then original
                const quantityInfo = quantity > 1 ? `\n🔢 Количество креативов: ${quantity} шт.` : '';
                const newTaskInfo = `🆕 Новая задача (UNIQ)\n\n` +
                    `📌 Название: ${createdTask?.name}\n` +
                    `📝 Комментарий заказчика:\n${fullCommentText}${quantityInfo}\n` +
                    `📅 Создано: ${formatDateTimeMSK(createdTask?.createdAt || new Date())}`;

                const hasMediaOld = Array.isArray(task.example_creative)
                  ? task.example_creative.length
                  : (typeof task.example_creative === 'string' && task.example_creative.trim() !== '' ? 1 : 0);

                const oldTaskInfo = `ℹ️ Исходная задача\n\n` +
                    `📌 Название: ${task.name}\n` +
                    `🔗 Приложение: ${task.link_app}\n` +
                    `📝 Описание: ${task.description}\n` +
                    `🎨 Примеры креатива: ${hasMediaOld || 0}\n` +
                    `📅 Создано: ${formatDateTimeMSK(task.createdAt)}`;

                const composed = `${newTaskInfo}\n\n— — —\n\n${oldTaskInfo}`;

                // Разбиваем сообщение на части, если оно слишком длинное
                const messageParts = splitLongMessage(composed);
                for (const part of messageParts) {
                    await ctx.telegram.sendMessage(creator.tg_id, part);
                }

                // Prompt to set expected time
                await ctx.telegram.sendMessage(
                    creator.tg_id,
                    `🔔 Для задачи "${createdTask?.name}" укажите дату и время сдачи:`,
                    setExpectedTimeKeyboard(createdTask?._id)
                );
                
                // Уведомляем баера о создании задачи
                await ctx.reply(
                    `✅ Задача создана!\n\n` +
                    `📌 Название: ${newName}\n` +
                    `📤 Задача отправлена креативщику на установку времени выполнения.`,
                    await start(ctx.from.id)
                );
                
                ctx.session = {};
                ctx.scene.leave();
                return;
            }

            if (replyType === 'adaptiv') {
                const adaptivCount = await taskService.getTaskSpecificAdaptivCount(task.name);
                newName = `${task.name}_A_${adaptivCount + 1}`;

                // Для адаптива берем result из исходной задачи как примеры
                const examplesForAdaptiv = (Array.isArray(task.result) && task.result.length > 0) 
                    ? task.result 
                    : (Array.isArray(task.example_creative) && task.example_creative.length > 0)
                        ? task.example_creative
                        : [];

                const newTaskAdaptiv = {
                    name: newName,
                    link_app: task.link_app,
                    description: `${baseDescription}\n📅 Дата запроса: ${commentDate}${commentBlock}`,
                    example_creative: examplesForAdaptiv,
                    buyer: user._id,
                    createdBy: task.createdBy || user._id,
                    creator: creator._id,
                    state: 'time',
                    points: null,
                    completionDate: null,
                    CTR: null,
                    bonus: null,
                    result: null,
                    version: 1,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                const createdAdaptiv = await taskService.createTask(newTaskAdaptiv);
                console.log(`[Reply->ADAPTIV] Created task: _id=${createdAdaptiv?._id}, name=${createdAdaptiv?.name}, creatorTG=${creator.tg_id}`);

                // Compose detailed message for creator: first new task, then original
                const newTaskInfoA = `🆕 Новая задача (ADAPTIV)\n\n` +
                    `📌 Название: ${createdAdaptiv?.name}\n` +
                    `📝 Комментарий заказчика:\n${fullCommentText}\n` +
                    `📅 Создано: ${formatDateTimeMSK(createdAdaptiv?.createdAt || new Date())}`;

                const hasMediaOldA = Array.isArray(task.example_creative)
                  ? task.example_creative.length
                  : (typeof task.example_creative === 'string' && task.example_creative.trim() !== '' ? 1 : 0);

                const oldTaskInfoA = `ℹ️ Исходная задача\n\n` +
                    `📌 Название: ${task.name}\n` +
                    `🔗 Приложение: ${task.link_app}\n` +
                    `📝 Описание: ${task.description}\n` +
                    `🎨 Примеры креатива: ${hasMediaOldA || 0}\n` +
                    `📅 Создано: ${formatDateTimeMSK(task.createdAt)}`;

                const composedA = `${newTaskInfoA}\n\n— — —\n\n${oldTaskInfoA}`;
                
                // Разбиваем сообщение на части, если оно слишком длинное
                const messagePartsA = splitLongMessage(composedA);
                for (const part of messagePartsA) {
                    await ctx.telegram.sendMessage(creator.tg_id, part);
                }

                // Prompt to set expected time
                await ctx.telegram.sendMessage(
                    creator.tg_id,
                    `🔔 Для задачи "${createdAdaptiv?.name}" укажите дату и время сдачи:`,
                    setExpectedTimeKeyboard(createdAdaptiv?._id)
                );
                
                // Уведомляем баера о создании задачи
                await ctx.reply(
                    `✅ Задача создана!\n\n` +
                    `📌 Название: ${newName}\n` +
                    `📤 Задача отправлена креативщику на установку времени выполнения.`,
                    await start(ctx.from.id)
                );
                
                ctx.session = {};
                ctx.scene.leave();
                return;
            }

            if (replyType === 'deep_uniq') {
                const deepUniqCount = await taskService.getTaskSpecificDeepUniqCount(task.name);
                newName = `DU_${task.name}_${deepUniqCount + 1}`;
                
                const quantity = ctx.session.creativeQuantity || 1;
                const quantityText = quantity > 1 ? `\n🔢 Количество: ${quantity} шт.` : '';

                // Для глубокой уникализации берем result из промежуточной задачи как примеры
                // Проверяем, что массив не пустой
                const examplesForDU = (Array.isArray(task.result) && task.result.length > 0) 
                    ? task.result 
                    : (Array.isArray(task.example_creative) && task.example_creative.length > 0)
                        ? task.example_creative
                        : [];
                
                console.log(`[DEEP_UNIQ] Creating task from ${task.name}`);
                console.log(`[DEEP_UNIQ] task.result:`, task.result);
                console.log(`[DEEP_UNIQ] task.example_creative:`, task.example_creative);
                console.log(`[DEEP_UNIQ] examplesForDU:`, examplesForDU);

                const dataDU = {
                    name: newName,
                    link_app: task.link_app,
                    description: `${baseDescription}\n📅 Дата запроса: ${commentDate}${quantityText}${commentBlock}`,
                    example_creative: examplesForDU,
                    buyer: user._id,
                    createdBy: task.createdBy || user._id,
                    creator: creator._id,
                    state: 'time',
                    points: null,
                    completionDate: null,
                    CTR: null,
                    bonus: null,
                    result: null,
                    version: 1,
                    quantity: quantity,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                const createdTaskDU = await taskService.createTask(dataDU);
                console.log(`[Reply->DEEP_UNIQ] Created task: _id=${createdTaskDU?._id}, name=${createdTaskDU?.name}, creatorTG=${creator.tg_id}`);

                // Compose detailed message for creator: first new task, then original
                const quantityInfoDU = quantity > 1 ? `\n🔢 Количество креативов: ${quantity} шт.` : '';
                const newTaskInfoDU = `🆕 Новая задача (DEEP_UNIQ)\n\n` +
                    `📌 Название: ${createdTaskDU?.name}\n` +
                    `📝 Комментарий заказчика:\n${fullCommentText}${quantityInfoDU}\n` +
                    `📅 Создано: ${formatDateTimeMSK(createdTaskDU?.createdAt || new Date())}`;

                const hasMediaOldDU = Array.isArray(task.example_creative)
                  ? task.example_creative.length
                  : (typeof task.example_creative === 'string' && task.example_creative.trim() !== '' ? 1 : 0);

                const oldTaskInfoDU = `ℹ️ Исходная задача\n\n` +
                    `📌 Название: ${task.name}\n` +
                    `🔗 Приложение: ${task.link_app}\n` +
                    `📝 Описание: ${task.description}\n` +
                    `🎨 Примеры креатива: ${hasMediaOldDU || 0}\n` +
                    `📅 Создано: ${formatDateTimeMSK(task.createdAt)}`;

                const composedDU = `${newTaskInfoDU}\n\n— — —\n\n${oldTaskInfoDU}`;
                
                // Разбиваем сообщение на части, если оно слишком длинное
                const messagePartsDU = splitLongMessage(composedDU);
                for (const part of messagePartsDU) {
                    await ctx.telegram.sendMessage(creator.tg_id, part);
                }

                // Prompt to set expected time
                await ctx.telegram.sendMessage(
                    creator.tg_id,
                    `🔔 Для задачи "${createdTaskDU?.name}" укажите дату и время сдачи:`,
                    setExpectedTimeKeyboard(createdTaskDU?._id)
                );
                
                // Уведомляем баера о создании задачи
                await ctx.reply(
                    `✅ Задача создана!\n\n` +
                    `📌 Название: ${newName}\n` +
                    `📤 Задача отправлена креативщику на установку времени выполнения.`,
                    await start(ctx.from.id)
                );
                
                ctx.session = {};
                ctx.scene.leave();
                return;
            }

            await ctx.reply('Неверный выбор.');
            return;
        } catch (error) {
            console.error('Ошибка при создании нового задания:', error);
            await ctx.reply(ruMessage.messages.errors?.writeTT || 'Ошибка при создании нового задания.');
            ctx.session = {};
            ctx.scene.leave();
            return;
        }
    } catch (error) {
        console.error('Error in finish_comment_input action:', error);
        await ctx.answerCbQuery('Произошла ошибка при обработке комментария');
    }
});

// Модифицируем обработчик текстовых сообщений, чтобы добавить обработку сообщений с правками
watchReadyTzScene.on('text', async (ctx) => {
    // Проверяем, ожидаем ли мы ввод количества креативов
    if (ctx.session.awaitingQuantity) {
        const quantityInput = ctx.message.text.trim();
        const quantity = parseInt(quantityInput);
        
        // Проверяем корректность ввода
        if (isNaN(quantity) || quantity < 1 || quantity > 20) {
            await ctx.reply('⚠️ Некорректное значение. Введите число от 1 до 20:');
            return;
        }
        
        // Сохраняем количество и переходим к запросу комментария
        ctx.session.creativeQuantity = quantity;
        ctx.session.awaitingQuantity = false;
        ctx.session.awaitingComment = true;
        
        await ctx.reply('✍️ Опишите, что нужно сделать по этому креативу:');
        return;
    }
    
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
            
            const buyerMessage = ctx.message.text;
            const tgId = String(ctx.from.id);
            const buyer = await userService.findUserByTelegramId(tgId);
            const creator = await userService.findById(task.creator);
            
            if (!creator) {
                await ctx.reply('Креативщик не найден');
                ctx.session.waitingForRejectionMessage = false;
                return;
            }
            
            // Создаем запрос на доработку для модерации
            const RevisionRequest = require('../databases/revisionRequest.model');
            const revisionRequest = await RevisionRequest.create({
                task: taskId,
                buyer: buyer._id,
                creator: creator._id,
                buyerMessage: buyerMessage,
                status: 'pending'
            });
            
            // Находим всех чекеров и админов-креативщиков для уведомления
            const checkers = await userService.findAllCheckers();
            
            // Формируем сообщение для модераторов
            const { taskInfo } = buildTaskInfo(task);
            const moderationMessage = `
🔔 Новый запрос на доработку от баера @${buyer.username || buyer.tg_id}

📋 Задание: ${task.name}
👨‍💻 Креативщик: @${creator.username || creator.tg_id}

${taskInfo}

📝 Правки от баера:
${buyerMessage}
            `;
            
            // Отправляем уведомления всем чекерам с кнопками
            const { Markup } = require('telegraf');
            const moderationKeyboard = Markup.inlineKeyboard([
                [
                    Markup.button.callback('✅ Одобрить', `revision_approve_${revisionRequest._id}`),
                    Markup.button.callback('❌ Отклонить', `revision_reject_${revisionRequest._id}`)
                ]
            ]);
            
            for (const checker of checkers) {
                try {
                    const messageParts = splitLongMessage(moderationMessage);
                    for (let i = 0; i < messageParts.length; i++) {
                        if (i === messageParts.length - 1) {
                            // Последняя часть с клавиатурой
                            await ctx.telegram.sendMessage(checker.tg_id, messageParts[i], moderationKeyboard);
                        } else {
                            await ctx.telegram.sendMessage(checker.tg_id, messageParts[i]);
                        }
                    }
                } catch (error) {
                    console.error(`Failed to send revision request to checker ${checker.username}:`, error);
                }
            }
            
            // Сообщаем баеру об успешной отправке на модерацию
            await ctx.reply(`✅ Ваш запрос на доработку задания "${task.name}" отправлен на рассмотрение модератору.`);
            
            // Возвращаемся к списку заданий
            await ctx.reply(ruMessage.messages.getTT.select_tt, await myTasks(buyer._id, buyer.position, "done"));
            
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
    
    // Проверяем, ожидаем ли мы комментарий от пользователя для нового ответа
    if (ctx.session.awaitingComment) {
        const commentText = ctx.message.text;

        // Инициализируем массив для накопления частей сообщения
        if (!ctx.session.commentParts) {
            ctx.session.commentParts = [];
        }
        
        // Добавляем текущую часть
        ctx.session.commentParts.push(commentText);
        
        // Отправляем подтверждение и инструкцию
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ Завершить ввод', 'finish_comment_input')]
        ]);
        
        if (ctx.session.commentParts.length === 1) {
            await ctx.reply(
                `✅ Текст получен (часть ${ctx.session.commentParts.length}).\n\n` +
                `Если Telegram разбил ваше сообщение на несколько частей, дождитесь получения всех частей, затем нажмите кнопку ниже.`,
                keyboard
            );
        } else {
            await ctx.reply(
                `✅ Получена часть ${ctx.session.commentParts.length}.\n\n` +
                `Когда все части будут получены, нажмите кнопку "Завершить ввод".`,
                keyboard
            );
        }
        
        return;
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

    // Шаг адаптива через отдельный вопрос больше не используется, т.к. комментарий запрашивается единообразно выше

    // Если нет выбранной задачи или нет "шага" редактирования — выходим
    if (!selectedTask || !step) {
        // Проверяем текущее состояние сцены и возвращаем пользователю информацию
        let currentState = "Просмотр задач";
        
        if (ctx.session.step === 1) {
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
                const { taskInfo, fullDescription, hasFullDescription } = buildTaskInfo(task);
                
                ctx.session.fullDescription = fullDescription;
                ctx.session.hasFullDescription = hasFullDescription;
                
                // Отправляем результат задачи, если он есть
                if (task.result) {
                    try {
                        // Обрабатываем случай, когда result является массивом (новый формат)
                        if (Array.isArray(task.result) && task.result.length > 0) {
                            // Внешние ссылки (Google Drive и т.п.) — текстом, иначе Telegram пришлёт document.dat
                            const externalUrls = task.result.filter(isExternalUrl);
                            if (externalUrls.length) {
                                const linksText = `🔗 Результат работы:\n\n` +
                                    externalUrls.map((u, i) => (externalUrls.length > 1 ? `${i + 1}. ${u}` : u)).join('\n');
                                const linksMsg = await ctx.reply(linksText);
                                if (!ctx.session.mediaMessageIds) ctx.session.mediaMessageIds = [];
                                ctx.session.mediaMessageIds.push(linksMsg.message_id);
                            }

                            // Разделяем медиафайлы по типам
                            const mediaGroup = task.result.filter(f => !isExternalUrl(f)).map(fileId => {
                                // Наши файлы с веба — отправляем по полному URL
                                if (isWebPath(fileId)) {
                                    return { type: getMediaType(fileId), media: toFullUrl(fileId) };
                                }
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
                
                // Разбиваем длинное сообщение на части
                const messageParts = splitLongMessage(taskInfo);
                
                // Первая часть с клавиатурой
                await ctx.reply(messageParts[0], doneTask(task));
                
                // Остальные части без клавиатуры
                for (let i = 1; i < messageParts.length; i++) {
                    await ctx.reply(messageParts[i]);
                }
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

    if (false) {
    } else {
        // Если мы здесь, значит пользователь отправил текст, который не обрабатывается ни одним из обработчиков
        // Возвращаем информацию о текущем шаге
        await ctx.reply(`Не удалось обработать ваше сообщение. Текущий шаг: ${step}. Пожалуйста, следуйте инструкциям.`);
    }
});

// Обработчик для показа полного описания
watchReadyTzScene.action('show_full_description', async (ctx) => {
    try {
        const fullDescription = ctx.session.fullDescription;
        if (!fullDescription) {
            await ctx.answerCbQuery('Описание недоступно');
            return;
        }
        
        const parts = splitLongMessage(fullDescription);
        for (const part of parts) {
            await ctx.reply(`📝 Полное описание:\n\n${part}`);
        }
        
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Ошибка при показе полного описания:', error);
        await ctx.answerCbQuery('Произошла ошибка');
    }
});

module.exports = watchReadyTzScene;
