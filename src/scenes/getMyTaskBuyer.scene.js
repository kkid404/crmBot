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

// Функция для сборки текста задачи
function buildTaskInfo(task, state) {
    // Базовый текст
    let taskInfo = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${task.description}
🎨 Пример креатива: ${task.example_creative}
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

// Кнопка назад
MyTzBuyerScene.action('back', async (ctx) => {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);

    // Если пользователя нет, имеет смысл отреагировать (в зависимости от вашей логики)
    if (!user) {
        await ctx.answerCbQuery('Пользователь не найден!');
        return;
    }

    await ctx.editMessageText(
        ruMessage.messages.getTT.select_tt,
        await myTasks(user._id, 'buyer', ctx.session.stateGetTask)
    );
    ctx.session.selectedTask = '';
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

// Возврат к редактированию задачи (возврат к кнопкам редактирования)
MyTzBuyerScene.action('edited_task', async (ctx) => {
    // Здесь отображаем клавиатуру с кнопками edit_text, edit_app, edit_example
    await ctx.editMessageText(ctx.session.taskInfo, editTaskBuyerBot());
});

// Обработчик выбора задачи (regex ObjectId)
MyTzBuyerScene.action(/^[a-f0-9]{24}$/, async (ctx) => {
    const taskId = ctx.callbackQuery.data;
    const task = await taskService.findTaskById(taskId);
  
    if (!task) {
      await ctx.answerCbQuery(ruMessage.messages.taskNotFound);
      return;
    }
  
    // Сохраняем ID задачи в сессии
    ctx.session.selectedTask = taskId;
  
    // Определяем текущее состояние (например, "progress" или "active")
    const currentState = ctx.session.stateGetTask;
  
    // Формируем текст задачи
    const taskInfo = buildTaskInfo(task, currentState);
  
    // Выбираем клавиатуру:
    // Если задача в "progress", используем backInline, иначе — managementBuyerTasks
    let keyboard;
    if (currentState === 'progress') {
      keyboard = backInline();
    } else {
      keyboard = managementBuyerTasks();
    }
  
    // Отправляем/редактируем сообщение с инфой о задаче и нужной клавиатурой
    await ctx.editMessageText(taskInfo, keyboard);
  
    // Сохраняем информацию в сессии
    ctx.session.taskInfo = taskInfo;
    ctx.session.taskname = task.name;
  
    await ctx.answerCbQuery();
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
