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
    // Если ранее отправлялось медиа, удаляем его
    if (ctx.session.exampleMediaMessageId) {
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.exampleMediaMessageId);
        } catch (err) {
            console.error("Ошибка при удалении медиа примера:", err);
        }
        ctx.session.exampleMediaMessageId = null;
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
        await ctx.deleteMessage();
        await ctx.reply(
            ruMessage.messages.getTT.success_selected
                .replace("{name}", ctx.session.taskname)
                .replace("{date}", ctx.session.completionDate), 
            await start(tgId)
        );
    } catch (error) {
        console.error("Error in done action:", error);
        await ctx.reply(ruMessage.messages.errors.general);
    } finally {
        ctx.session = {};
        ctx.scene.leave();
    }

})


// Обработчик callback-запросов
getTTScene.action(/^[a-f0-9]{24}$/, async (ctx) => { // Регулярное выражение для ObjectId
    try {
        const taskId = ctx.callbackQuery.data; // Получаем ID задачи из callback_data
        const task = await taskService.findTaskById(taskId); // Находим задачу по ID
        ctx.session.selectedTask = taskId; // Сохраняем выбранную задачу в сессии

        if (!task) {
            await ctx.answerCbQuery(ruMessage.messages.taskNotFound); // Если задача не найдена
            return;
        }

        // Логируем идентификатор медиа
        console.log('Отправка медиа с идентификатором:', task.example_creative);

        // Проверяем, является ли example_creative file_id (медиа) или текстом.
        // Здесь проверяем, начинается ли строка с "AgAC" или "BAAC"
        const isMedia = task.example_creative.startsWith("AgAC") || task.example_creative.startsWith("BAAC");

        // Формируем строку для отображения примера креатива.
        // Если это медиа, выводим подсказку, если текст — выводим его.
        const exampleLine = isMedia
            ? "🎨 Пример креатива: Пример креатива ниже"
            : `🎨 Пример креатива: ${task.example_creative}`;

        // Формируем текст сообщения с информацией о задаче
        const taskInfo = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${task.description}
${exampleLine}
📅 Дата создания: ${task.createdAt.toLocaleDateString()}
        `;

        // Если медиа (креатив) был отправлен ранее, удаляем его
        if (ctx.session.exampleMediaMessageId) {
            try {
                await ctx.deleteMessage(ctx.session.exampleMediaMessageId);
            } catch (deleteError) {
                console.error("Ошибка при удалении старого креатива:", deleteError);
            }
        }

        // Редактируем сообщение с информацией о задаче
        await ctx.editMessageText(taskInfo, selected_or_back());

        ctx.session.taskInfo = taskInfo;
        ctx.session.taskname = task.name;

        // Отправляем креатив (фото или видео)
        let mediaResponse;
        if (task.example_creative) {
            // Если тип медиа сохранён, используем его
            if (task.mediaType === 'photo') {
                mediaResponse = await ctx.replyWithPhoto(task.example_creative);
            } else if (task.mediaType === 'video') {
                mediaResponse = await ctx.replyWithVideo(task.example_creative);
            } else {
                // Если тип не сохранён, пробуем отправить как фото, а при ошибке – как видео
                try {
                    mediaResponse = await ctx.replyWithPhoto(task.example_creative);
                } catch (photoError) {
                    try {
                        mediaResponse = await ctx.replyWithVideo(task.example_creative);
                    } catch (videoError) {
                        console.error("Не удалось отправить медиа:", videoError);
                        await ctx.reply("Ошибка отправки медиафайла.");
                    }
                }
            }

            // Сохраняем идентификатор отправленного сообщения с медиа для последующего удаления
            if (mediaResponse && mediaResponse.message_id) {
                ctx.session.exampleMediaMessageId = mediaResponse.message_id;
            }
        }

        await ctx.answerCbQuery(); // Подтверждаем обработку callback
    } catch (error) {
        console.error('Error in show_example action:', error);
        await ctx.answerCbQuery(ruMessage.messages.errorOccurred);
    }
});

module.exports = getTTScene
