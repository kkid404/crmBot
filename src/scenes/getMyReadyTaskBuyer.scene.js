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
const { doneTask } = require('../keyboards/doneTask.keyboard');

// Функция для сборки текста задачи
function buildTaskInfo(task, state) {
    // Базовый текст
    let taskInfo = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${task.description}
🎨 Пример креатива: ${task.example_creative}
📅 Дата создания: ${task.createdAt.toLocaleDateString()}
📅 Дата выполнения: ${task.completionDate.toLocaleDateString()}
    `;

    // Добавляем информацию о CTR, если она задана
    if (task.CTR !== null && task.CTR !== undefined) {
        taskInfo += `📊 CTR: ${task.CTR}\n`;
    }  

    // Добавляем информацию о бонусе, если она задана
    if (task.bonus !== null && task.bonus !== undefined) {
        taskInfo += `💰 Бонус для креативщика: ${task.bonus}\n`;
    }  

    return taskInfo;
}

const watchReadyTzScene = new BaseScene('watchReadyTzScene');

// Вход в сцену
watchReadyTzScene.enter(async (ctx) => {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    await ctx.reply(ruMessage.messages.getTT.select_tt, await myTasks(user._id, user.position, "done"));
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

        // Редактируем сообщение, чтобы показать список заданий
        await ctx.editMessageText(ruMessage.messages.getTT.select_tt, await myTasks(user._id, user.position, "done"));

        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in moderate "back" action:', error);
        await ctx.answerCbQuery('Произошла ошибка при переходе назад');
    }
});

// Кнопка выйти (quit)
watchReadyTzScene.action('quit', async (ctx) => {
    await ctx.deleteMessage();
    await ctx.reply(
        ruMessage.messages.start.replace('{name}', ctx.from.first_name),
        await start(ctx.from.id)
    );
    ctx.session = {};
    ctx.scene.leave();
});


// Обработчик выбора задачи (regex ObjectId)
watchReadyTzScene.action(/^[a-f0-9]{24}$/, async (ctx) => {
    await ctx.deleteMessage();
    const taskId = ctx.callbackQuery.data;
    const task = await taskService.findTaskById(taskId);

    if (!task) {
        await ctx.answerCbQuery(ruMessage.messages.taskNotFound);
        return;
    }

    // Сохраняем ID задачи в сессии
    ctx.session.selectedTask = taskId;

    const taskInfo = buildTaskInfo(task);

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

    await ctx.reply(taskInfo, doneTask());

    // Сохраняем информацию в сессии
    ctx.session.taskInfo = taskInfo;
    ctx.session.taskname = task.name;

    await ctx.answerCbQuery();
});

watchReadyTzScene.action('edit_ctr', async (ctx) => {
    try {
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.mediaMessageId);

        const taskId = ctx.session.selectedTask;
        const task = await taskService.findTaskById(taskId);

        if (!task) {
            await ctx.answerCbQuery('Задача не найдена');
            return;
        }

        // Устанавливаем шаг для редактирования
        ctx.session.step = 1;

        // Запрашиваем у пользователя CTR
        await ctx.editMessageText('Введите новый CTR:');
    } catch (error) {
        console.error('Ошибка при обработке edit_ctr:', error);
        await ctx.answerCbQuery('Произошла ошибка');
    }
});


watchReadyTzScene.on('text', async (ctx) => {
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

    // Если нет выбранной задачи или нет "шага" редактирования — выходим
    if (!selectedTask || !step) {
        return;
    }

    if (step === 1) {
        // Пользователь ввел CTR
        ctx.session.CTR = ctx.message.text;

        // Переходим ко второму вопросу — запрос бонуса
        ctx.session.step = 2;
        await ctx.reply('Введите бонус для креативщика:');
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
    }

});

module.exports = watchReadyTzScene;
