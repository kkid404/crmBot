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

const getTTScene = new BaseScene('getTTScene');

getTTScene.enter(async (ctx) => {
    await ctx.reply(ruMessage.messages.getTT.select_tt, await tasks());
});

getTTScene.action("back", async (ctx) => {
    // Удаляем все отправленные медиасообщения
    if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
        for (const messageId of ctx.session.exampleMediaMessageIds) {
            try {
                await ctx.deleteMessage(messageId);
            } catch (error) {
                console.error(`Ошибка при удалении сообщения: ${error.message}`);
            }
        }
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

    ctx.session.completionDate = date

    const readyDate = parseCustomDate(date)


    ctx.session.readyDate = readyDate
    
    const taskInfo = ctx.session.taskInfo + "\n📅Дата выполнения: " + date

    // Редактируем сообщение с новой информацией
    await ctx.editMessageText(taskInfo, done_or_cancel());

    await ctx.answerCbQuery(); // Подтверждаем обработку callback
});

getTTScene.action("cancel", async (ctx) => {
    await ctx.deleteMessage();

    await ctx.reply(ruMessage.messages.start.replace("{name}", ctx.from.first_name), await start(ctx.from.id));

    ctx.session = {};
    ctx.scene.leave();

})

getTTScene.action("quit", async (ctx) => {
    await ctx.deleteMessage();
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
            expectedDate: ctx.session.readyDate 
        };
        
        await taskService.updateTask(ctx.session.selectedTask, taskInfo);
        
        // Удаляем медиа пример, если он есть
        if (ctx.session.exampleMediaMessageIds && ctx.session.exampleMediaMessageIds.length > 0) {
            for (const messageId of ctx.session.exampleMediaMessageIds) {
                try {
                    await ctx.deleteMessage(messageId);
                } catch (error) {
                    console.error(`Ошибка при удалении сообщения: ${error.message}`);
                }
            }
            ctx.session.exampleMediaMessageIds = [];
        }
        
        await ctx.deleteMessage();
        await ctx.reply(
            ruMessage.messages.getTT.success_selected
                .replace("{name}", ctx.session.taskname)
                .replace("{date}", ctx.session.completionDate), 
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

    await ctx.deleteMessage();
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
        for (const messageId of ctx.session.exampleMediaMessageIds) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
            } catch (error) {
                console.error(`Ошибка при удалении сообщения: ${error.message}`);
            }
        }
        ctx.session.exampleMediaMessageIds = [];
    }
    
    // Очищаем данные сессии
    ctx.session.selectedTask = null;
    ctx.session.taskname = null;
    ctx.session.taskInfo = null;
});

module.exports = getTTScene
