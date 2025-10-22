const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const taskService = require('../services/task.service');
const userService = require('../services/user.service');
const { Markup } = require('telegraf');
const { back_to_task } = require('../keyboards/back_to_task.keyboard');

// Функция для сборки текста задачи
function buildTaskInfo(task) {
    // Определяем, есть ли медиафайлы
    const hasMedia = Array.isArray(task.example_creative) 
        ? task.example_creative.length > 0 
        : typeof task.example_creative === 'string' && task.example_creative.trim() !== '';
    
    // Формируем строку для отображения информации о примерах креатива
    const exampleLine = hasMedia
        ? `🎨 Примеры креатива: ${Array.isArray(task.example_creative) ? task.example_creative.length : 1}`
        : "🎨 Примеры креатива: отсутствуют";

    // Получаем информацию о пользователях
    const buyerName = task.buyer?.username || 'Не указан';
    const creatorName = task.creator?.username || 'Не назначен';
    
    // Обрезаем описание если оно слишком длинное
    let description = task.description || '';
    if (description.length > MAX_DESCRIPTION_LENGTH) {
        description = description.substring(0, MAX_DESCRIPTION_LENGTH) + '...';
    }
    
    // Формируем информацию о статусе задачи
    const stateLabels = {
        'progress': '🔄 В работе',
        'time': '⏰ Ожидает времени',
        'wait': '⏳ На модерации',
        'done': '✅ Выполнено',
        'failed': '❌ Провалено',
        'canceled': '🚫 Отменено',
        'active': '🟢 Активно'
    };
    const stateLabel = stateLabels[task.state] || task.state;
    
    // Формируем информацию о ожидаемой дате выполнения
    let expectedDateInfo = "Не указана";
    if (task.expectedDate) {
        expectedDateInfo = task.expectedDate.toLocaleDateString();
        if (task.expectedTime) {
            expectedDateInfo += ` к ${task.expectedTime}`;
        }
    }

    // Формируем текст с информацией о задании
    const taskInfo = `
🎯 Название: ${task.name}
📊 Статус: ${stateLabel}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${description}
${exampleLine}
👨‍💼 Заказчик: ${buyerName}
👨‍🎨 Креативщик: ${creatorName}
📅 Дата создания: ${task.createdAt.toLocaleDateString()}
⏱️ Ожидаемая дата выполнения: ${expectedDateInfo}
    `;
    
    return taskInfo;
}

// Максимальная длина текста для одного сообщения Telegram (запас от лимита 4096)
const MAX_TG_TEXT = 3500; // Уменьшено для безопасности при редактировании
const MAX_DESCRIPTION_LENGTH = 2000; // Максимальная длина описания

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
    try {
        // первый кусок — редактирование исходного сообщения с клавиатурой
        await ctx.editMessageText(parts[0], keyboard);
    } catch (error) {
        // Если редактирование не удалось (например, сообщение слишком длинное), отправляем новое
        console.error('Ошибка редактирования сообщения:', error.message);
        await ctx.reply(parts[0], keyboard);
    }
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

// Создаем клавиатуру для задач
function createTasksKeyboard(tasks) {
    // Сортируем задачи по ожидаемой дате (datePart) и времени (timePart)
    const sortedTasks = tasks.slice().sort((a, b) => {
        // Вспомогательная функция для получения метки времени задачи
        const getDateTime = (task) => {
            if (!task.expectedDate) {
                // Если дата не указана, поместим задачу в конец списка
                return Number.MAX_VALUE;
            }
            const dateObj = new Date(task.expectedDate);

            // Если указано ожидаемое время, добавляем его к дате
            if (task.expectedTime) {
                try {
                    const [hoursStr, minutesStr] = task.expectedTime.split(":");
                    const hours = parseInt(hoursStr, 10);
                    const minutes = parseInt(minutesStr, 10);
                    if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
                        dateObj.setHours(hours, minutes, 0, 0);
                    }
                } catch (_) {
                    // В случае ошибки парсинга оставляем время без изменений
                }
            }

            return dateObj.getTime();
        };

        return getDateTime(a) - getDateTime(b);
    });

    // Создаем кнопки для каждой задачи
    const buttons = sortedTasks.map(task => {
        // Создаем текст для кнопки: название задачи + имя креативщика
        const creatorName = task.creator?.username || 'Не назначен';
        let expectedDateInfo = '—';
        if (task.expectedDate) {
            const dateObj = new Date(task.expectedDate);
            const datePart = dateObj.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
            const timePart = task.expectedTime ? task.expectedTime : dateObj.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", hour12: false });
            expectedDateInfo = `${datePart} ${timePart}`;
        }
        return [Markup.button.callback(`${expectedDateInfo} | ${task.name} (${creatorName})`, task._id.toString())];
    });
    
    // Добавляем кнопку "Выход"
    buttons.push([Markup.button.callback('🚪 Выйти', 'quit')]);
    
    return Markup.inlineKeyboard(buttons);
}

// Клавиатура для просмотра деталей задачи
function createTaskDetailsKeyboard(task) {
    const keyboard = [
        [Markup.button.callback('📸 Показать пример', 'show_example')],
        [Markup.button.callback('⬅️ Назад к списку', 'back')],
        [Markup.button.callback('🚪 Выйти', 'quit')]
    ];
    
    return Markup.inlineKeyboard(keyboard);
}

const adminTasksInProgressScene = new BaseScene('adminTasksInProgressScene');

// Функция для удаления всех медиа сообщений
async function cleanupMedia(ctx) {
    // Очищаем все медиасообщения
    if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
        ctx.session.exampleMediaMessageIds = [];
    }
    
    if (ctx.session.mediaMessageId) {
        ctx.session.mediaMessageId = null;
    }
    
    if (ctx.session.mediaMessageIds && ctx.session.mediaMessageIds.length > 0) {
        ctx.session.mediaMessageIds = [];
    }
}

// Вход в сцену
adminTasksInProgressScene.enter(async (ctx) => {
    try {
        const tgId = String(ctx.from.id);
        const user = await userService.findUserByTelegramId(tgId);
        
        // Проверяем, что у пользователя есть доступ (админ или тимлид)
        if (!user || !['admin', 'teamlead'].includes(user.role)) {
            await ctx.reply(ruMessage.messages.errors.error_protected, await start(ctx.from.id));
            ctx.scene.leave();
            return;
        }
        
        // Получаем все задачи в работе (status = progress и time)
        const progressTasks = await taskService.getTasksByState('progress');
        const timeTasks = await taskService.getTasksByState('time');
        const tasks = [...progressTasks, ...timeTasks];
        
        if (!tasks || tasks.length === 0) {
            await ctx.reply("📋 В данный момент нет задач в работе.", await start(ctx.from.id));
            ctx.scene.leave();
            return;
        }
        
        // Отправляем список задач
        await ctx.reply(
            "📋 Задачи в работе:\nВыберите задачу для просмотра подробной информации:", 
            createTasksKeyboard(tasks)
        );
        
        // Инициализируем сессию
        ctx.session.selectedTask = null;
        ctx.session.mediaMessageId = null;
        ctx.session.exampleMediaMessageIds = [];
        ctx.session.mediaMessageIds = [];
        
    } catch (error) {
        console.error('Ошибка при входе в сцену просмотра задач в работе:', error);
        await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте позже.", await start(ctx.from.id));
        ctx.scene.leave();
    }
});

// Обработчик выбора задачи
adminTasksInProgressScene.action(/^[a-f0-9]{24}$/, async (ctx) => {
    try {
        const taskId = ctx.callbackQuery.data;
        const task = await taskService.findTaskById(taskId);
        
        if (!task) {
            await ctx.answerCbQuery(ruMessage.messages.taskNotFound);
            return;
        }
        
        // Сохраняем ID задачи в сессии
        ctx.session.selectedTask = taskId;
        
        // Очищаем все медиа перед показом новой задачи
        await cleanupMedia(ctx);
        
        // Формируем информацию о задаче
        const taskInfo = buildTaskInfo(task);
        
        // Отправляем информацию о задаче (с разбиением длинного текста)
        await editLongWithKeyboard(ctx, taskInfo, createTaskDetailsKeyboard(task));
        
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Ошибка при выборе задачи:', error);
        await ctx.answerCbQuery('Произошла ошибка при загрузке задачи');
    }
});

// Обработчик показа примера
adminTasksInProgressScene.action('show_example', async (ctx) => {
    try {
        const taskId = ctx.session.selectedTask;
        const task = await taskService.findTaskById(taskId);
        
        if (!task) {
            await ctx.answerCbQuery(ruMessage.messages.taskNotFound);
            return;
        }
        
        // Очищаем все медиа перед показом новых
        await cleanupMedia(ctx);
        
        // Инициализируем массив для хранения ID отправленных медиасообщений
        ctx.session.exampleMediaMessageIds = [];
        
        // Формируем информацию о задаче
        const taskInfo = buildTaskInfo(task);
        
        // Редактируем сообщение с информацией о задаче (с разбиением длинного текста)
        await editLongWithKeyboard(ctx, taskInfo, back_to_task());
        
        // Обеспечиваем обратную совместимость с примерами креативов
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
        
        // Если есть медиафайлы, отправляем их как медиагруппу
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
        
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Ошибка при показе примера:', error);
        await ctx.answerCbQuery('Произошла ошибка при загрузке примера');
    }
});

// Обработчик кнопки "Назад к заданию"
adminTasksInProgressScene.action('back_to_task', async (ctx) => {
    try {
        const taskId = ctx.session.selectedTask;
        const task = await taskService.findTaskById(taskId);
        
        if (!task) {
            await ctx.answerCbQuery(ruMessage.messages.taskNotFound);
            return;
        }
        
        // Очищаем все медиа
        await cleanupMedia(ctx);
        
        // Формируем информацию о задаче
        const taskInfo = buildTaskInfo(task);
        
        // Отправляем информацию о задаче (с разбиением длинного текста)
        await editLongWithKeyboard(ctx, taskInfo, createTaskDetailsKeyboard(task));
        
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Ошибка при возврате к заданию:', error);
        await ctx.answerCbQuery('Произошла ошибка');
    }
});

// Обработчик кнопки "Назад к списку"
adminTasksInProgressScene.action('back', async (ctx) => {
    try {
        // Очищаем все медиа
        await cleanupMedia(ctx);
        
        // Сбрасываем выбранную задачу
        ctx.session.selectedTask = null;
        
        // Получаем все задачи в работе (status = progress и time)
        const progressTasks = await taskService.getTasksByState('progress');
        const timeTasks = await taskService.getTasksByState('time');
        const tasks = [...progressTasks, ...timeTasks];
        
        if (!tasks || tasks.length === 0) {
            await ctx.editMessageText("📋 В данный момент нет задач в работе.");
            await ctx.reply("Выход из просмотра задач", await start(ctx.from.id));
            ctx.scene.leave();
            return;
        }
        
        // Отправляем список задач
        await ctx.editMessageText(
            "📋 Задачи в работе:\nВыберите задачу для просмотра подробной информации:", 
            createTasksKeyboard(tasks)
        );
        
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Ошибка при возврате к списку задач:', error);
        await ctx.answerCbQuery('Произошла ошибка');
    }
});

// Обработчик кнопки "Выйти"
adminTasksInProgressScene.action('quit', async (ctx) => {
    // Очищаем все медиа
    await cleanupMedia(ctx);
    
    // Выходим из сцены
    await ctx.reply(
        ruMessage.messages.start.replace('{name}', ctx.from.first_name),
        await start(ctx.from.id)
    );
    ctx.session = {};
    ctx.scene.leave();
    
    await ctx.answerCbQuery();
});

// Обработчик текстовых сообщений
adminTasksInProgressScene.on('text', async (ctx) => {
    const userInput = ctx.message.text;
    
    // Если пользователь ввёл "назад" текстом
    if (userInput === ruMessage.keyboards.back[0]) {
        await ctx.scene.enter('backScene');
        ctx.session = {};
        ctx.scene.leave();
        return;
    }
    
    // В остальных случаях информируем пользователя о текущем состоянии
    if (ctx.session.selectedTask) {
        const task = await taskService.findTaskById(ctx.session.selectedTask);
        if (task) {
            const taskInfo = buildTaskInfo(task);
            await replyLongWithKeyboard(ctx, taskInfo, createTaskDetailsKeyboard(task));
        } else {
            await ctx.reply("Выбранная задача не найдена. Выберите другую задачу.");
        }
    } else {
        await ctx.reply("Вы находитесь в режиме просмотра задач в работе. Используйте кнопки для навигации.");
    }
});

module.exports = adminTasksInProgressScene; 