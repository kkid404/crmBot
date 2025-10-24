const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { tasks } = require('../keyboards/tasks.keyboard');
const { selected_or_back } = require('../keyboards/selected_or_back.keyboard');
const { date } = require('../keyboards/date.keyboard');
const { done_or_cancel } = require('../keyboards/done_or_cancel.keyboard');
const { start } = require('../keyboards/start.keyboard');
const { setExpectedTimeKeyboard } = require('../keyboards/setExpectedTime.keyboard');
const { formatDateMSK } = require('../utils/formatDate.util');
const userService = require('../services/user.service');

const { getPooledBuyerTasksKeyboard, markTaskAsSelectedFromPool, manualRefreshPooledTasksAction } = require('../keyboards/pooledBuyerTasks.keyboard');

const taskService = require('../services/task.service');
const { Markup } = require('telegraf');

// ===== Helpers for long Telegram texts =====
const MAX_TG_TEXT = 4000; // safety margin below 4096
function splitLongText(text, maxLen = MAX_TG_TEXT) {
    const chunks = [];
    if (!text) return [''];
    let remaining = text;
    while (remaining.length > maxLen) {
        let cut = remaining.lastIndexOf('\n\n', maxLen);
        if (cut === -1) cut = remaining.lastIndexOf('\n', maxLen);
        if (cut === -1) cut = remaining.lastIndexOf(' ', maxLen);
        if (cut <= 0) cut = maxLen;
        chunks.push(remaining.slice(0, cut).trim());
        remaining = remaining.slice(cut).trim();
    }
    if (remaining.length > 0) chunks.push(remaining);
    return chunks;
}

async function editOrReplyLongWithKeyboard(ctx, text, keyboard) {
    const parts = splitLongText(text);
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
        await ctx.editMessageText(parts[0], await keyboard);
    } else {
        await ctx.reply(parts[0], await keyboard);
    }
    for (let i = 1; i < parts.length; i++) {
        await ctx.reply(parts[i]);
    }
}

async function editLongPlain(ctx, text, options = {}) {
    const parts = splitLongText(text);
    await ctx.editMessageText(parts[0], options);
    for (let i = 1; i < parts.length; i++) {
        await ctx.reply(parts[i]);
    }
}

function parseCustomDate(dateStr) {
    const [day, month] = dateStr.split('.'); // Разделяем на день и месяц
    const year = new Date().getFullYear(); // Используем текущий год
    return new Date(year, month - 1, day); // Создаем объект Date (месяцы начинаются с 0)
}

// Валидация формата времени HH:MM
function isValidTimeFormat(timeStr) {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    return timeRegex.test(timeStr);
}

const getTTScene = new BaseScene('getTTScene');

// Helper function to process a selected task
async function processSelectedTask(ctx, taskId) {
    try {
        const task = await taskService.findTaskById(taskId); // Находим задачу по ID
        if (!task) {
            await ctx.answerCbQuery('Задача не найдена.');
            // Optionally, refresh the keyboard if the task disappeared
            // await ctx.editMessageText(ruMessage.messages.getTT.select_tt, await getPooledBuyerTasksKeyboard());
            return;
        }
        ctx.session.selectedTask = taskId; // Сохраняем выбранную задачу в сессии

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

        const exampleLine = task.example_creative && task.example_creative.length
            ? `🎨 Примеры креатива: ${task.example_creative.length}`
            : "🎨 Примеры креатива: отсутствуют";

        // Ограничиваем длину описания чтобы избежать слишком длинных сообщений
        const MAX_DESCRIPTION_LENGTH = 600;
        const fullDescription = task.description || '';
        let description = fullDescription;
        const hasFullDescription = description.length > MAX_DESCRIPTION_LENGTH;
        if (hasFullDescription) {
            description = description.substring(0, MAX_DESCRIPTION_LENGTH) + '...';
        }
        
        // Сохраняем в сессии
        ctx.session.fullDescription = fullDescription;
        ctx.session.hasFullDescription = hasFullDescription;

        const taskInfo = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${description}
${exampleLine}
📅 Дата создания: ${formatDateMSK(task.createdAt)}
        `;

        ctx.session.taskInfo = taskInfo;
        ctx.session.taskname = task.name;

        // Отображаем информацию о задаче и предлагаем выбрать дату или вернуться (с разбиением длинного текста)
        await editOrReplyLongWithKeyboard(ctx, taskInfo, selected_or_back({
            hasFullDescription: ctx.session.hasFullDescription
        }));

        ctx.session.exampleMediaMessageIds = [];

        if (hasMedia) {
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

            if (textExamples.length > 0) {
                const textMessage = await ctx.reply(`📝 Текстовые примеры креативов:\n\n${textExamples.join('\n\n')}`);
                ctx.session.exampleMediaMessageIds.push(textMessage.message_id);
            }

            if (mediaExamples.length > 0) {
                try {
                    const mediaGroup = mediaExamples.map(fileId => {
                        const isVideo = fileId.startsWith('BAA');
                        const isDocument = fileId.startsWith('BQA');
                        const isAudio = fileId.startsWith('CQA');
                        const isPhoto = fileId.startsWith('AgAC'); // Common prefix for photos

                        let type = 'photo'; // Default to photo
                        if (isVideo) type = 'video';
                        else if (isDocument) type = 'document';
                        else if (isAudio) type = 'audio';
                        // else if (isPhoto) type = 'photo'; // Explicitly photo

                        return { type, media: fileId };
                    });

                    if (mediaGroup.length > 0) {
                        const sentMediaMessages = await ctx.replyWithMediaGroup(mediaGroup);
                        sentMediaMessages.forEach(msg => ctx.session.exampleMediaMessageIds.push(msg.message_id));
                    }
                } catch (mediaError) {
                    console.error('Ошибка при отправке медиагруппы:', mediaError);
                    const errorMessage = await ctx.reply('Не удалось отправить некоторые примеры креативов как медиагруппу. Отправляю по одному...');
                    ctx.session.exampleMediaMessageIds.push(errorMessage.message_id);
                    for (const fileId of mediaExamples) {
                        try {
                            const singleMediaMessage = await ctx.sendPhoto(fileId); // Defaulting to sendPhoto, adjust if types are diverse and known
                            ctx.session.exampleMediaMessageIds.push(singleMediaMessage.message_id);
                        } catch (singleMediaError) {
                            console.error(`Ошибка при отправке отдельного медиафайла ${fileId}:`, singleMediaError);
                            const singleErrorMessage = await ctx.reply(`Не удалось отправить пример: ${fileId.slice(0,10)}...`);
                            ctx.session.exampleMediaMessageIds.push(singleErrorMessage.message_id);
                        }
                    }
                }
            }
        }
        if(ctx.callbackQuery) await ctx.answerCbQuery();
    } catch (error) {
        console.error('Ошибка в processSelectedTask:', error);
        if(ctx.callbackQuery) await ctx.answerCbQuery('Произошла ошибка при обработке задачи.');
        // Optionally, return to the task selection
        // await ctx.editMessageText(ruMessage.messages.getTT.select_tt, await getPooledBuyerTasksKeyboard());
    }
}

getTTScene.enter(async (ctx) => {
    const keyboard = await getPooledBuyerTasksKeyboard();
    // Проверяем, есть ли кроме кнопки "Выйти" другие кнопки
    if (
        keyboard.reply_markup &&
        keyboard.reply_markup.inline_keyboard.length === 1 &&
        keyboard.reply_markup.inline_keyboard[0][0].text === 'Выйти'
    ) {
        await ctx.reply('Нет доступных задач. Попробуйте позже.', keyboard);
    } else {
        await ctx.reply(ruMessage.messages.getTT.select_tt, keyboard);
    }
});

getTTScene.action("back", async (ctx) => {
    if (ctx.callbackQuery) { // Ensure it's a callback query before trying to answer it
        try { await ctx.answerCbQuery(); } catch (e) { console.warn('[getTTScene.back] Failed to answer CB query:', e.message); }
    }

    // Delete any media example messages
    if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
        for (const messageId of ctx.session.exampleMediaMessageIds) {
            try {
                await ctx.deleteMessage(messageId);
            } catch (e) {
                // Log quietly, as message might have been deleted by user or other means
                console.warn(`[getTTScene.back] Non-critical: Failed to delete media message ${messageId}: ${e.message}`);
            }
        }
        ctx.session.exampleMediaMessageIds = [];
    }

    // If a task was in progress of selection (details viewed, date/time being picked)
    if (ctx.session.selectedTask) {
        ctx.session.selectedTask = '';
        ctx.session.taskInfo = '';
        ctx.session.taskname = ''; // Also clear taskname if set
        ctx.session.readyDate = null;
        ctx.session.expectedTime = '';
        ctx.session.waitingForTime = false;

        try {
            // Attempt to edit the message to go back to the task selection list
            const keyboard = await getPooledBuyerTasksKeyboard();
            if (
                keyboard.reply_markup &&
                keyboard.reply_markup.inline_keyboard.length === 1 &&
                keyboard.reply_markup.inline_keyboard[0][0].text === 'Выйти'
            ) {
                await ctx.editMessageText('Нет доступных задач. Попробуйте позже.', keyboard);
            } else {
                await ctx.editMessageText(ruMessage.messages.getTT.select_tt, keyboard);
            }
        } catch (e) {
            console.warn(`[getTTScene.back] Failed to edit message (possibly 'not modified' or deleted): ${e.message}. Replying with new message.`);
            try {
                const keyboard = await getPooledBuyerTasksKeyboard();
                if (
                    keyboard.reply_markup &&
                    keyboard.reply_markup.inline_keyboard.length === 1 &&
                    keyboard.reply_markup.inline_keyboard[0][0].text === 'Выйти'
                ) {
                    await ctx.reply('Нет доступных задач. Попробуйте позже.', keyboard);
                } else {
                    await ctx.reply(ruMessage.messages.getTT.select_tt, keyboard);
                }
            } catch (replyError) {
                console.error('[getTTScene.back] Critical: Failed to send reply message for task list:', replyError.message);
            }
        }
    } else {
        // If no task was selected, "back" means we are on the main task list, so leave the scene.
        try {
            // Try to edit the current message to the main menu text before leaving
            await ctx.editMessageText(ruMessage.messages.start.replace("{name}", ctx.from.first_name), await start(ctx.from.id));
        } catch (e) {
            // If editing fails, reply with a new message for the main menu
            console.warn(`[getTTScene.back] Failed to edit message to main menu: ${e.message}. Replying with new message.`);
            try {
                await ctx.reply(ruMessage.messages.start.replace("{name}", ctx.from.first_name), await start(ctx.from.id));
            } catch (replyError) {
                console.error('[getTTScene.back] Critical: Failed to send reply message for start menu:', replyError.message);
            }
        }
        ctx.scene.leave();
    }
})

getTTScene.action("select", async (ctx) => {
    await ctx.editMessageText(ruMessage.messages.getTT.select_date, await date());
})

getTTScene.action(/^date_.+$/, async (ctx) => { // Регулярное выражение для date_*

    // Извлекаем динамическую часть (например, "4.12" из "date_4.12")
    const date = ctx.callbackQuery.data.replace('date_', '');

    ctx.session.completionDate = date;
    const readyDate = parseCustomDate(date);
    ctx.session.readyDate = readyDate;
    
    // Сохраняем дату и информацию о задаче
    ctx.session.taskInfo = ctx.session.taskInfo + "\n📅Дата выполнения: " + date;
    
    // Сначала подтверждаем выбор даты (с разбиением длинного текста)
    await editLongPlain(ctx, ctx.session.taskInfo, { disable_web_page_preview: true });
    
    // Затем отправляем отдельное сообщение с запросом времени
    await ctx.reply("⏰ Пожалуйста, введите время выполнения в формате ЧЧ:ММ (например, 12:30):");
    
    // Устанавливаем флаг, что ждем ввода времени
    ctx.session.waitingForTime = true;

    await ctx.answerCbQuery(); // Подтверждаем обработку callback
});

// Обработчик для ввода времени
getTTScene.on('text', async (ctx) => {
    // Проверяем, ожидаем ли мы ввод времени
    if (ctx.session.waitingForTime) {
        const timeStr = ctx.message.text.trim();
        
        // Проверяем формат времени
        if (!isValidTimeFormat(timeStr)) {
            await ctx.reply("⚠️ Неверный формат времени. Пожалуйста, введите время в формате ЧЧ:ММ (например, 12:30):");
            return;
        }
        
        // Сохраняем время в сессии
        ctx.session.expectedTime = timeStr;
        ctx.session.waitingForTime = false;
        
        // Обновляем информацию о задаче
        const taskInfo = ctx.session.taskInfo + "\n⏰ Время выполнения: " + timeStr;
        ctx.session.taskInfo = taskInfo;
        
        // Отправляем подтверждение выбора времени
        await ctx.reply(`✅ Время выполнения установлено: ${timeStr}`);
        
        // Отображаем информацию о задаче с кнопками подтверждения/отмены (с разбиением длинного текста)
        await editOrReplyLongWithKeyboard(ctx, taskInfo, done_or_cancel());
    }
});

getTTScene.action("cancel", async (ctx) => {

    await ctx.reply(ruMessage.messages.start.replace("{name}", ctx.from.first_name), await start(ctx.from.id));

    ctx.session = {};
    ctx.scene.leave();

})

getTTScene.action("quit", async (ctx) => {
    await ctx.reply(ruMessage.messages.start.replace("{name}", ctx.from.first_name), await start(ctx.from.id));
    ctx.session = {};
    ctx.scene.leave();
})

// Обработчик для автоматического выбора ТЗ
getTTScene.action("auto_assign", async (ctx) => {
    try {
        // Получаем ID креативщика
        const tgId = String(ctx.from.id);
        const user = await userService.findUserByTelegramId(tgId);
        
        if (!user) {
            await ctx.answerCbQuery(ruMessage.messages.user_not_found);
            return;
        }
        
        // Автоматически выбираем задачу с чередованием баеров
        const task = await taskService.getAutoAssignedTask(user._id);
        
        if (!task) {
            await ctx.answerCbQuery('Нет доступных задач для автоматического выбора');
            return;
        }
        
        // Имитируем выбор задачи как если бы пользователь нажал на неё
        ctx.session.selectedTask = task._id.toString();
        
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
        const exampleLine = task.example_creative && task.example_creative.length ? 
            `🎨 Примеры креатива: ${task.example_creative.length}` : 
            "🎨 Примеры креатива: отсутствуют";

        // Ограничиваем длину описания
        const MAX_DESCRIPTION_LENGTH = 600;
        const fullDescription = task.description || '';
        let description = fullDescription;
        const hasFullDescription = description.length > MAX_DESCRIPTION_LENGTH;
        if (hasFullDescription) {
            description = description.substring(0, MAX_DESCRIPTION_LENGTH) + '...';
        }
        
        // Сохраняем в сессии
        ctx.session.fullDescription = fullDescription;
        ctx.session.hasFullDescription = hasFullDescription;

        // Формируем текст сообщения с информацией о задаче
        const taskInfo = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${description}
${exampleLine}
📅 Дата создания: ${formatDateMSK(task.createdAt)}
        `;

        ctx.session.taskInfo = taskInfo;
        ctx.session.taskname = task.name;
        
        // Отображаем информацию о задаче и предлагаем выбрать дату (с разбиением длинного текста)
        await editOrReplyLongWithKeyboard(ctx, taskInfo, selected_or_back({
            hasFullDescription: ctx.session.hasFullDescription
        }));
        
        // Инициализируем массив для хранения ID отправленных медиасообщений
        ctx.session.exampleMediaMessageIds = [];
        
        // Если есть примеры креативов, отправляем их
        if (hasMedia) {
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
        
        await ctx.answerCbQuery('Задача выбрана автоматически');
    } catch (error) {
        console.error('Ошибка при автоматическом выборе задачи:', error);
        await ctx.answerCbQuery('Произошла ошибка при автоматическом выборе задачи');
    }
})

// Generic handler for MongoDB ObjectId (task selection from pooled keyboard)
getTTScene.action(/^[0-9a-fA-F]{24}$/, async (ctx) => {
    const taskId = ctx.match[0];
    try {
        // Mark the task as selected from the pool to update keyboard's internal state
        await markTaskAsSelectedFromPool(ctx, taskId);
        
        // Process the selected task (fetch details, show media, ask for date/time)
        await processSelectedTask(ctx, taskId);
    } catch (error) {
        console.error(`Ошибка при обработке задачи ${taskId} из пула:`, error);
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery('Произошла ошибка при выборе задачи из пула.');
        }
        // Optionally, re-display the keyboard or send an error message
        // await ctx.editMessageText(ruMessage.messages.getTT.select_tt, await getPooledBuyerTasksKeyboard());
    }
});

getTTScene.action("set_expected_time", async (ctx) => {
    try {
        // Save task ID to session for the setExpectedTimeScene
        ctx.session.taskIdForTimeSetting = ctx.session.selectedTask;
        
        // Enter the setExpectedTimeScene
        await ctx.scene.enter('setExpectedTimeScene');
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in set_expected_time handler:', error);
        await ctx.answerCbQuery('Произошла ошибка. Пожалуйста, попробуйте позже.');
    }
});

getTTScene.action("done", async (ctx) => {
    try {
        const tgId = String(ctx.from.id);
        const user = await userService.findUserByTelegramId(tgId);
        if (!user) throw new Error("User not found");

        const taken = await taskService.assignTask(
            ctx.session.selectedTask,
            user._id,
            ctx.session.readyDate,
            ctx.session.expectedTime
            );
        
            if (!taken) {
                await ctx.reply("⚠️ Это задание уже успел взять другой креативщик. Выберите, пожалуйста, другое.", await start(tgId));
                return;
            }
        
        // Удаляем медиа пример, если он есть
        if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
            ctx.session.exampleMediaMessageIds = [];
        }
        
        // Включаем время в сообщение об успешном выборе задачи
        const dateFormatted = ctx.session.completionDate;
        const timeInfo = ctx.session.expectedTime ? ` к ${ctx.session.expectedTime}` : '';
        const fullDateInfo = `${dateFormatted}${timeInfo}`;
        
        // Отправляем уведомления админам
        try {
            // Находим всех пользователей с cheker: true
            const checkers = await userService.findAllCheckers();
            console.log(`Найдено чекеров: ${checkers.length}`);
            
            // Выводим информацию о каждом чекере для отладки
            checkers.forEach((checker, index) => {
                console.log(`Чекер ${index + 1}: ID=${checker._id}, TG_ID=${checker.tg_id}, Username=${checker.username}`);
            });
            
            // Получаем имя пользователя
            const username = ctx.from.username 
                ? `@${ctx.from.username}` 
                : `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim();
            
            // Формируем текст уведомления
            const notificationText = `🔔 Креативщик ${username} взял задание "${ctx.session.taskname}"`;
            
            // Отправляем уведомление каждому чекеру
            for (const checker of checkers) {
                try {
                    console.log(`Отправка уведомления чекеру: ${checker.tg_id}`);
                    const sent = await ctx.telegram.sendMessage(checker.tg_id, notificationText);
                    console.log(`Уведомление успешно отправлено чекеру: ${checker.tg_id}, message_id: ${sent.message_id}`);
                } catch (err) {
                    console.error(`Ошибка отправки уведомления чекеру ${checker.tg_id}:`, err);
                }
            }
        } catch (err) {
            console.error("Ошибка при отправке уведомлений чекерам:", err);
            // Не прерываем выполнение основного кода, если с уведомлениями возникла проблема
        }
        
        await ctx.reply(
            ruMessage.messages.getTT.success_selected
                .replace("{name}", ctx.session.taskname)
                .replace("{date}", fullDateInfo), 
            await start(tgId)
        );
    } catch (error) {
        console.error("Ошибка в действии 'done':", error);
        await ctx.reply(ruMessage.messages.errors.general);
    } finally {
        ctx.session = {};
        ctx.scene.leave();
    }
})


// Обработчик callback-запросов
getTTScene.action(/^[a-f0-9]{24}$/, async (ctx) => { // Регулярное выражение для ObjectId
    const taskId = ctx.callbackQuery.data; // Получаем ID задачи из callback_data
    const task = await taskService.findTaskById(taskId); // Находим задачу по ID
    ctx.session.selectedTask = taskId; // Сохраняем выбранную задачу в сессии

    if (!task) {
        await ctx.answerCbQuery(ruMessage.messages.taskNotFound); // Если задача не найдена
        return;
    }

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

    // Ограничиваем длину описания
    const MAX_DESCRIPTION_LENGTH = 600;
    const fullDescription = task.description || '';
    let description = fullDescription;
    const hasFullDescription = description.length > MAX_DESCRIPTION_LENGTH;
    if (hasFullDescription) {
        description = description.substring(0, MAX_DESCRIPTION_LENGTH) + '...';
    }
    
    // Сохраняем в сессии
    ctx.session.fullDescription = fullDescription;
    ctx.session.hasFullDescription = hasFullDescription;

    // Формируем текст сообщения с информацией о задаче
    const taskInfo = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${description}
${exampleLine}
📅 Дата создания: ${formatDateMSK(task.createdAt)}
    `;

    ctx.session.taskInfo = taskInfo;
    ctx.session.taskname = task.name;

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
    // Отправляем сообщение с информацией о задаче (с разбиением длинного текста)
    await editOrReplyLongWithKeyboard(ctx, taskInfo, selected_or_back({
        hasFullDescription: ctx.session.hasFullDescription
    }));

    await ctx.answerCbQuery(); // Подтверждаем обработку callback
});

// Обновляем обработчик leave
getTTScene.leave(async (ctx) => {
    // Удаляем все отправленные медиасообщения при выходе из сцены
    if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
        ctx.session.exampleMediaMessageIds = [];
    }
    
    // Очищаем данные сессии
    ctx.session.selectedTask = null;
    ctx.session.taskname = null;
    ctx.session.taskInfo = null;
    ctx.session.expectedTime = null;
    ctx.session.waitingForTime = false;
});

// Обработчик для показа полного описания
getTTScene.action('show_full_description', async (ctx) => {
    try {
        const fullDescription = ctx.session.fullDescription;
        if (!fullDescription) {
            await ctx.answerCbQuery('Описание недоступно');
            return;
        }
        
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

module.exports = getTTScene;