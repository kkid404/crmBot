const { Telegraf, Scenes } = require('telegraf');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const ruMessage = require('./src/lang/ru.json');
const { connectToMongo } = require('./src/databases/connect.database');
const LocalSession = require('telegraf-session-local');
const checkUser = require('./src/middlewares/isUser.middleware')
const { statisticsActions } = require('./src/actions/statistics.actions'); // Добавляем импорт
const { pointsActions } = require('./src/actions/points.actions');
const errorHandler = require('./src/middlewares/errorHandler.middleware');
const { startDeadlineChecker } = require('./src/services/deadlineChecker.service');
const usernameUpdater = require('./src/services/usernameUpdater.service');
const notificationService = require('./src/services/notification.service');

const botToken = process.env.TELEGRAM_TOKEN;

if (!botToken) {
  console.error(ruMessage.global.error_token);
  process.exit(1);
}

connectToMongo();
const bot = new Telegraf(botToken);

// Подключаем обработчик ошибок первым
bot.use(errorHandler);

// Запуск дедлайн чекера
startDeadlineChecker(bot);
// Запуск ежедневного обновления username из Telegram (03:00 по серверному времени)
usernameUpdater.init(bot);
// Инициализация сервиса уведомлений
notificationService.init(bot);

const { Stage } = Scenes;

// Использование локальной сессии
const localSession = new LocalSession({ database: 'session_db.json' });

// Глобальная кнопка для быстрого перехода к пулу ТЗ
bot.action('open_task_pool', async (ctx) => {
  try {
    await ctx.scene.enter('getTTScene');
    await ctx.answerCbQuery();
  } catch (e) {
    console.error('Error handling open_task_pool:', e);
    try { await ctx.answerCbQuery('Ошибка открытия пула заданий'); } catch {}
  }
});

bot.use(localSession.middleware());

// Подготовка Stage для сцен
const stage = new Stage();
bot.use(stage.middleware());

// Глобальное middleware проверки пользователя
bot.use(checkUser);


// Global handler for setting expected time from any context (must be AFTER session/stage/checkUser)
bot.action(/^set_expected_time(?::([0-9a-fA-F]{24}))?$/, async (ctx) => {
  try {
    // Ensure session exists
    if (!ctx.session) ctx.session = {};

    const taskIdFromCb = ctx.match && ctx.match[1] ? ctx.match[1] : null;
    console.log('[set_expected_time] callback_data match:', ctx.match);
    console.log('[set_expected_time] session before resolve:', {
      selectedTask: ctx.session?.selectedTask,
      taskIdForTimeSetting: ctx.session?.taskIdForTimeSetting,
    });
    const taskId = taskIdFromCb || ctx.session.selectedTask || ctx.session.taskIdForTimeSetting;
    console.log('[set_expected_time] resolved taskId:', taskId);

    if (!taskId) {
      await ctx.answerCbQuery('Не удалось определить задачу для установки срока.');
      return;
    }

    ctx.session.taskIdForTimeSetting = taskId;
    console.log('[set_expected_time] entering setExpectedTimeScene with taskId:', taskId);
    await ctx.scene.enter('setExpectedTimeScene');
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error handling set_expected_time action:', error);
    try { await ctx.answerCbQuery('Ошибка при переходе к установке сроков.'); } catch {}
  }
});

// Global handler for postponing deadline
bot.action(/^postpone_deadline_([0-9a-fA-F]{24})$/, async (ctx) => {
  try {
    if (!ctx.session) ctx.session = {};
    
    const taskId = ctx.match[1];
    ctx.session.postponeTaskId = taskId;
    
    await ctx.scene.enter('postponeDeadlineScene');
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error handling postpone_deadline action:', error);
    try { await ctx.answerCbQuery('Ошибка при переходе к переносу дедлайна.'); } catch {}
  }
});

// Global handler for approving postpone request
bot.action(/^postpone_ok_(.+)$/, async (ctx) => {
  try {
    const requestKey = ctx.match[1];
    
    // Get postpone data from global map
    if (!global.postponeRequests || !global.postponeRequests.has(requestKey)) {
      await ctx.answerCbQuery('❌ Запрос устарел или не найден');
      return;
    }
    
    const postponeData = global.postponeRequests.get(requestKey);
    const { taskId, creatorTgId, reason, newDate, newTime } = postponeData;
    
    // Store data in session for comment request
    ctx.session.postponeApprovalData = {
      taskId,
      creatorTgId,
      reason,
      newDate,
      newTime,
      requestKey
    };
    
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply('✅ Вы одобрили перенос дедлайна.\n\n📝 Напишите комментарий для баера:');
    ctx.session.waitingForPostponeComment = true;
    
    await ctx.answerCbQuery('Запрос одобрен');
  } catch (error) {
    console.error('Error handling postpone_ok action:', error);
    try { await ctx.answerCbQuery('Ошибка при одобрении запроса.'); } catch {}
  }
});

// Global handler for rejecting postpone request
bot.action(/^postpone_no_(.+)$/, async (ctx) => {
  try {
    const requestKey = ctx.match[1];
    
    // Get postpone data from global map
    if (!global.postponeRequests || !global.postponeRequests.has(requestKey)) {
      await ctx.answerCbQuery('❌ Запрос устарел или не найден');
      return;
    }
    
    const postponeData = global.postponeRequests.get(requestKey);
    const { taskId, creatorTgId } = postponeData;
    
    const taskService = require('./src/services/task.service');
    const task = await taskService.findTaskById(taskId);
    
    if (task) {
      // Notify creator that postpone was rejected
      await ctx.telegram.sendMessage(
        creatorTgId,
        `❌ Ваш запрос на перенос дедлайна для задачи "${task.name}" был отклонен модератором.`
      );
    }
    
    // Remove from global map
    global.postponeRequests.delete(requestKey);
    
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n❌ Отклонено');
    await ctx.answerCbQuery('Запрос отклонен');
  } catch (error) {
    console.error('Error handling postpone_no action:', error);
    try { await ctx.answerCbQuery('Ошибка при отклонении запроса.'); } catch {}
  }
});


// Регистрация сцен
const scenesPath = path.join(__dirname, 'src/scenes');
fs.readdirSync(scenesPath).forEach(file => {
  if (file.endsWith('.js')) {
    const scene = require(`./src/scenes/${file}`);
    stage.register(scene);
  }
});

// Регистрация команд
const commandsFiles = fs.readdirSync(path.join(__dirname, 'src/commands')).filter(file => file.endsWith('.js'));
commandsFiles.forEach(file => {
  const command = require(`./src/commands/${file}`);
  if (command.middleware) {
    bot.command(command.command, command.middleware, command.action);
  } else {
    bot.command(command.command, command.action);
  }
});

// Team lead menu button handler
bot.hears('👨\u200d💼 Меню teamlead', (ctx) => {
    return ctx.scene.enter('TEAMLEAD_SCENE');
});

// Global text handler for postpone comment (must be before other handlers)
bot.on('text', async (ctx, next) => {
  if (ctx.session?.waitingForPostponeComment && ctx.session?.postponeApprovalData) {
    try {
      const { taskId, creatorTgId, reason, newDate, newTime, requestKey } = ctx.session.postponeApprovalData;
      const moderatorComment = ctx.message.text;
      
      const taskService = require('./src/services/task.service');
      
      // Get task
      const task = await taskService.findTaskById(taskId);
      
      if (!task) {
        await ctx.reply('❌ Задача не найдена');
        delete ctx.session.waitingForPostponeComment;
        delete ctx.session.postponeApprovalData;
        return;
      }
      
      // Parse new date (DD.MM.YYYY)
      const [day, month, year] = newDate.split('.').map(Number);
      const newExpectedDate = new Date(year, month - 1, day);
      
      // Update task with new deadline
      await taskService.updateTask(taskId, {
        expectedDate: newExpectedDate,
        expectedTime: newTime
      });
      
      // Notify buyer
      if (task.buyer && task.buyer.tg_id) {
        await ctx.telegram.sendMessage(
          task.buyer.tg_id,
          `📅 Задача "${task.name}" перенесена на ${newDate} к ${newTime}\n\n` +
          `📝 Причина: ${reason}\n` +
          `💬 Комментарий модератора: ${moderatorComment}`
        );
      }
      
      // Notify createdBy if different from buyer
      if (task.createdBy && typeof task.createdBy === 'object' && task.createdBy.tg_id) {
        const createdById = task.createdBy._id ? task.createdBy._id.toString() : null;
        const buyerId = task.buyer && task.buyer._id ? task.buyer._id.toString() : null;
        
        if (createdById && buyerId && createdById !== buyerId) {
          await ctx.telegram.sendMessage(
            task.createdBy.tg_id,
            `📅 Задача "${task.name}" перенесена на ${newDate} к ${newTime}\n\n` +
            `📝 Причина: ${reason}\n` +
            `💬 Комментарий модератора: ${moderatorComment}\n` +
            `(создано от лица @${task.buyer.username || 'баера'})`
          );
        }
      }
      
      // Notify creator
      await ctx.telegram.sendMessage(
        creatorTgId,
        `✅ Ваш запрос на перенос дедлайна для задачи "${task.name}" одобрен!\n\n` +
        `📅 Новый дедлайн: ${newDate} к ${newTime}`
      );
      
      // Remove from global map
      if (requestKey && global.postponeRequests) {
        global.postponeRequests.delete(requestKey);
      }
      
      await ctx.reply('✅ Дедлайн обновлен, комментарий отправлен баеру, креативщик уведомлен об одобрении.');
      
      delete ctx.session.waitingForPostponeComment;
      delete ctx.session.postponeApprovalData;
      return;
    } catch (error) {
      console.error('Error processing postpone comment:', error);
      await ctx.reply('Произошла ошибка при обработке комментария');
      delete ctx.session.waitingForPostponeComment;
      delete ctx.session.postponeApprovalData;
      return;
    }
  }
  
  // Continue to next handler
  return next();
});

// Регистрация обработчиков
const handlersPath = path.join(__dirname, 'src/handlers');
fs.readdirSync(handlersPath).forEach(file => {
  if (file.endsWith('.js')) {
    const { handler } = require(`./src/handlers/${file}`);
    handler(bot);
  }
});

// Регистрация actions
const actionsPath = path.join(__dirname, 'src/actions');
fs.readdirSync(actionsPath).forEach(file => {
  if (file.endsWith('.js')) {
    const { actions } = require(`./src/actions/${file}`);
    actions(bot);
  }
});

// Add handler for moderate_task callback
bot.action(/^moderate_task:(.+)$/, async (ctx) => {
  try {
    // Extract task ID from callback data
    const taskId = ctx.match[1];
    
    // Store the task ID in session
    ctx.session.selectedTask = taskId;
    
    // Enter the moderation scene
    await ctx.scene.enter('getTaskToModerateScene');
  } catch (error) {
    console.error('Error handling moderate_task action:', error);
    await ctx.reply(ruMessage.messages.errors.general);
  }
});

// Add handler for view_ready_task callback (buyer viewing completed creative)
bot.action(/^view_ready_task_(.+)$/, async (ctx) => {
  try {
    // Extract task ID from callback data
    const taskId = ctx.match[1];
    
    // Store the task ID in session
    ctx.session.selectedTask = taskId;
    
    // Enter the ready tasks scene for buyers
    await ctx.scene.enter('watchReadyTzScene');
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error handling view_ready_task action:', error);
    await ctx.answerCbQuery('Произошла ошибка при открытии задания');
  }
});

// Initialize scheduler services
const schedulerCommand = require('./src/commands/scheduler.command');
// The command module initializes the scheduler automatically

// Глобальные ловушки ошибок процесса и Telegraf
process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});
bot.catch((err, ctx) => {
  console.error('Telegraf caught error:', err, 'on update:', ctx.update);
});

// Запуск бота
bot.launch().then(() => {
  console.log(ruMessage.global.start);
}).catch((err) => {
  console.error('Bot launch failed:', err);
});

