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
        // Формируем строку для отображения примера креатива.
        const isMedia = task.example_creative.startsWith("AgAC") || task.example_creative.startsWith("BAAC");
        const exampleLine = isMedia
        ? "Медиа"
        : `🎨 Пример креатива: ${task.example_creative}`;
    // Базовый текст
    let taskInfo = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${task.description}
🎨 Пример креатива: ${exampleLine}
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
        
        // Удаляем медиа, если оно было отправлено
        if (ctx.session.mediaMessageId) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.mediaMessageId);
            } catch (err) {
                console.error("Ошибка при удалении медиа:", err);
            }
            ctx.session.mediaMessageId = null;
        }
        
        // Важно: используем "progress" как состояние для фильтрации задач в работе
        await ctx.editMessageText(
            ruMessage.messages.getTT.select_tt, 
            await myTasks(user._id, 'buyer', 'progress')
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

        // Формируем строку с информацией о задаче
        const taskInfo = buildTaskInfo(task);

        // Если медиа (креатив) был отправлен ранее, удаляем его
        if (ctx.session.exampleMediaMessageId) {
            try {
                await ctx.deleteMessage(ctx.session.exampleMediaMessageId);
            } catch (deleteError) {
                console.error("Ошибка при удалении старого креатива:", deleteError);
            }
        }

        // Отправляем информацию о задаче
        await ctx.editMessageText(taskInfo, back_to_task());

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
        await ctx.deleteMessage();
        const taskId = ctx.session.selectedTask; // Получаем ID выбранной задачи
        const task = await taskService.findTaskById(taskId); // Находим задачу по ID

        if (!task) {
            await ctx.answerCbQuery(ruMessage.messages.taskNotFound); // Если задача не найдена
            return;
        }

        const taskInfo = buildTaskInfo(task);

        // Возвращаем к информации о задании и удаляем креатив
        if (ctx.session.exampleMediaMessageId) {
            try {
                await ctx.deleteMessage(ctx.session.exampleMediaMessageId);
                delete ctx.session.exampleMediaMessageId; // Очистить идентификатор медиа после удаления
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

    // Проверяем, является ли example_creative file_id (медиа) или текстом.
    const isMedia = task.example_creative.startsWith("AgAC") || task.example_creative.startsWith("BAAC");
    const currentState = ctx.session.stateGetTask;
    // Формируем строку для отображения примера креатива.
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

    let keyboard;
    if (currentState === 'progress') {
      keyboard = backInline();
    } else {
      keyboard = managementBuyerTasks();
    }
  
    // Отправляем/редактируем сообщение с инфой о задаче и нужной клавиатурой
    await ctx.reply(taskInfo, keyboard);
    // Редактируем сообщение с информацией о задаче

    ctx.session.taskInfo = taskInfo;
    ctx.session.taskname = task.name;

    // Если example_creative содержит file_id, отправляем медиа и сохраняем id сообщения
    if (isMedia) {
        let mediaResponse;
        try {
            // Пробуем отправить как фото
            mediaResponse = await ctx.replyWithPhoto(task.example_creative);
        } catch (photoError) {
            try {
                // Если не удалось отправить как фото, пробуем отправить как видео
                mediaResponse = await ctx.replyWithVideo(task.example_creative);
            } catch (videoError) {
                console.error("Ошибка отправки медиа примера:", videoError);
                await ctx.reply("Ошибка отправки медиа примера");
            }
        }

        // Сохраняем идентификатор отправленного сообщения с медиа для последующего удаления
        if (mediaResponse && mediaResponse.message_id) {
            ctx.session.exampleMediaMessageId = mediaResponse.message_id;
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
        if (user) {
            await ctx.reply(
                ruMessage.messages.getTT.select_tt,
                await myTasks(user._id, 'buyer', ctx.session.stateGetTask)
            );
        }
        return;
    }
    if (userInput === ruMessage.keyboards.tzBuyers.tz_in_line) {
        ctx.session.stateGetTask = 'active';
        if (user) {
            await ctx.reply(
                ruMessage.messages.getTT.select_tt,
                await myTasks(user._id, 'buyer', ctx.session.stateGetTask)
            );
        }
        return;
    }

    // Если нет выбранной задачи или нет "шага" редактирования — выходим
    if (!selectedTask || !step) {
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
            return; // Неожиданное значение step
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
