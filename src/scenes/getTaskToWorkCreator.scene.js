const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { tasks } = require('../keyboards/tasks.keyboard');
const { selected_or_back } = require('../keyboards/selected_or_back.keyboard');
const { date } = require('../keyboards/date.keyboard');
const { done_or_cancel } = require('../keyboards/done_or_cancel.keyboard');
const { start } = require('../keyboards/start.keyboard');
const userService = require('../services/user.service');


const taskService = require('../services/task.service');

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

getTTScene.enter(async (ctx) => {
    await ctx.reply(ruMessage.messages.getTT.select_tt, await tasks());
});

getTTScene.action("back", async (ctx) => {
    // Удаляем все отправленные медиасообщения
    if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
        ctx.session.exampleMediaMessageIds = [];
    }

    await ctx.editMessageText(ruMessage.messages.getTT.select_tt, await tasks());
    ctx.session.selectedTask = '';
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
    
    // Сначала подтверждаем выбор даты
    await ctx.editMessageText(ctx.session.taskInfo, { disable_web_page_preview: true });
    
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
        
        // Отображаем информацию о задаче с кнопками подтверждения/отмены
        await ctx.reply(taskInfo, done_or_cancel());
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

getTTScene.action("done", async (ctx) => {
    try {
        const tgId = String(ctx.from.id);
        const user = await userService.findUserByTelegramId(tgId);
        if (!user) throw new Error("User not found");

        const taskInfo = {
            state: "progress",
            creator: user._id,
            expectedDate: ctx.session.readyDate,
            expectedTime: ctx.session.expectedTime // Добавляем время выполнения
        };
        
        await taskService.updateTask(ctx.session.selectedTask, taskInfo);
        
        // Удаляем медиа пример, если он есть
        if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
            ctx.session.exampleMediaMessageIds = [];
        }
        
        // Включаем время в сообщение об успешном выборе задачи
        const dateFormatted = ctx.session.completionDate;
        const timeInfo = ctx.session.expectedTime ? ` к ${ctx.session.expectedTime}` : '';
        const fullDateInfo = `${dateFormatted}${timeInfo}`;
        
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

    // Формируем текст сообщения с информацией о задаче
    const taskInfo = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${task.description}
${exampleLine}
📅 Дата создания: ${task.createdAt.toLocaleDateString()}
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
    // Отправляем сообщение с информацией о задаче
    await ctx.reply(taskInfo, selected_or_back());

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

module.exports = getTTScene
