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

bot.use(localSession.middleware());

// Подготовка Stage для сцен
const stage = new Stage();

// Global text handler for postpone comment and revision comment (must be BEFORE stage middleware)
bot.use(async (ctx, next) => {
  // Handle revision comment
  if (ctx.message?.text && ctx.session?.waitingForRevisionComment && ctx.session?.revisionApprovalData) {
    try {
      console.log('Processing revision comment from:', ctx.from.id);
      const { requestId, taskId, creatorTgId, buyerMessage, buyerUsername, taskName } = ctx.session.revisionApprovalData;
      const moderatorComment = ctx.message.text;
      
      const taskService = require('./src/services/task.service');
      const userService = require('./src/services/user.service');
      const RevisionRequest = require('./src/databases/revisionRequest.model');
      const splitLongMessage = require('./src/utils/splitMessage.util');
      
      // Get task
      const task = await taskService.findTaskById(taskId);
      
      if (!task) {
        await ctx.reply('❌ Задача не найдена');
        delete ctx.session.waitingForRevisionComment;
        delete ctx.session.revisionApprovalData;
        return;
      }
      
      // Find the moderator user by Telegram ID
      const moderatorUser = await userService.findUserByTelegramId(ctx.from.id);
      if (!moderatorUser) {
        await ctx.reply('❌ Ошибка: пользователь не найден в системе.');
        delete ctx.session.waitingForRevisionComment;
        delete ctx.session.revisionApprovalData;
        return;
      }
      
      // Update task: return to progress and increment version
      await taskService.updateTask(taskId, { 
        state: 'progress', 
        version: (task.version || 1) + 1 
      });
      
      // Update revision request status
      await RevisionRequest.findByIdAndUpdate(requestId, {
        status: 'approved',
        processedBy: moderatorUser._id,
        moderatorComment: moderatorComment,
        processedAt: new Date()
      });
      
      // Send message to creator with moderator's comment only
      const creativeMessage = `
❌ Задание "${taskName}" отклонено заказчиком и требует доработки:

💬 Комментарий модератора:
${moderatorComment}
      `;
      
      const messageParts = splitLongMessage(creativeMessage);
      for (const part of messageParts) {
        await ctx.telegram.sendMessage(creatorTgId, part);
      }
      
      await ctx.reply('✅ Запрос одобрен. Креативщик получил доработку с вашим комментарием.');
      
      delete ctx.session.waitingForRevisionComment;
      delete ctx.session.revisionApprovalData;
      return; // Don't call next() - stop processing
    } catch (error) {
      console.error('Error processing revision comment:', error);
      await ctx.reply('Произошла ошибка при обработке комментария');
      delete ctx.session.waitingForRevisionComment;
      delete ctx.session.revisionApprovalData;
      return; // Don't call next() - stop processing
    }
  }
  
  // Handle postpone comment
  if (ctx.message?.text && ctx.session?.waitingForPostponeComment && ctx.session?.postponeApprovalData) {
    try {
      console.log('Processing postpone comment from:', ctx.from.id);
      const { requestId, taskId, creatorTgId, reason, newDate, newTime } = ctx.session.postponeApprovalData;
      const moderatorComment = ctx.message.text;
      
      console.log('Postpone data:', { requestId, taskId, creatorTgId, reason, newDate, newTime });
      
      const taskService = require('./src/services/task.service');
      const userService = require('./src/services/user.service');
      const PostponeRequest = require('./src/databases/postponeRequest.model');
      
      // Get task
      const task = await taskService.findTaskById(taskId);
      console.log('Task found:', task ? task.name : 'not found');
      
      if (!task) {
        await ctx.reply('❌ Задача не найдена');
        delete ctx.session.waitingForPostponeComment;
        delete ctx.session.postponeApprovalData;
        return;
      }
      
      // Find the moderator user by Telegram ID
      const moderatorUser = await userService.findUserByTelegramId(ctx.from.id);
      if (!moderatorUser) {
        await ctx.reply('❌ Ошибка: пользователь не найден в системе.');
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
      
      // Update postpone request status
      await PostponeRequest.findByIdAndUpdate(requestId, {
        status: 'approved',
        processedBy: moderatorUser._id,
        moderatorComment: moderatorComment,
        processedAt: new Date()
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
      
      await ctx.reply('✅ Дедлайн обновлен, комментарий отправлен баеру, креативщик уведомлен об одобрении.');
      
      delete ctx.session.waitingForPostponeComment;
      delete ctx.session.postponeApprovalData;
      return; // Don't call next() - stop processing
    } catch (error) {
      console.error('Error processing postpone comment:', error);
      await ctx.reply('Произошла ошибка при обработке комментария');
      delete ctx.session.waitingForPostponeComment;
      delete ctx.session.postponeApprovalData;
      return; // Don't call next() - stop processing
    }
  }
  
  // Continue to next handler
  return next();
});

bot.use(stage.middleware());

// Глобальное middleware проверки пользователя
bot.use(checkUser);

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
    const requestId = ctx.match[1];
    const PostponeRequest = require('./src/databases/postponeRequest.model');
    
    // Get postpone request from database
    const postponeRequest = await PostponeRequest.findById(requestId).populate('task').populate('creator');
    
    if (!postponeRequest || postponeRequest.status !== 'pending') {
      await ctx.answerCbQuery('❌ Запрос не найден или уже обработан');
      return;
    }
    
    const { task, creator, reason, newDate, newTime } = postponeRequest;
    
    // Store data in session for comment request
    ctx.session.postponeApprovalData = {
      requestId: postponeRequest._id.toString(),
      taskId: task._id.toString(),
      creatorTgId: creator.tg_id,
      reason,
      newDate,
      newTime
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
    const requestId = ctx.match[1];
    const PostponeRequest = require('./src/databases/postponeRequest.model');
    const userService = require('./src/services/user.service');
    
    // Get postpone request from database
    const postponeRequest = await PostponeRequest.findById(requestId).populate('task').populate('creator');
    
    if (!postponeRequest || postponeRequest.status !== 'pending') {
      await ctx.answerCbQuery('❌ Запрос не найден или уже обработан');
      return;
    }
    
    const { task, creator } = postponeRequest;
    
    // Find the moderator user by Telegram ID
    const moderatorUser = await userService.findUserByTelegramId(ctx.from.id);
    if (!moderatorUser) {
      await ctx.answerCbQuery('❌ Ошибка: пользователь не найден');
      return;
    }
    
    // Update request status
    postponeRequest.status = 'rejected';
    postponeRequest.processedBy = moderatorUser._id;
    postponeRequest.processedAt = new Date();
    await postponeRequest.save();
    
    if (task && creator) {
      // Notify creator that postpone was rejected
      await ctx.telegram.sendMessage(
        creator.tg_id,
        `❌ Ваш запрос на перенос дедлайна для задачи "${task.name}" был отклонен модератором.`
      );
    }
    
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n❌ Отклонено');
    await ctx.answerCbQuery('Запрос отклонен');
  } catch (error) {
    console.error('Error handling postpone_no action:', error);
    try { await ctx.answerCbQuery('Ошибка при отклонении запроса.'); } catch {}
  }
});

// Global handler for approving revision request
bot.action(/^revision_approve_(.+)$/, async (ctx) => {
  try {
    const requestId = ctx.match[1];
    const RevisionRequest = require('./src/databases/revisionRequest.model');
    
    // Get revision request from database
    const revisionRequest = await RevisionRequest.findById(requestId)
      .populate('task')
      .populate('buyer')
      .populate('creator');
    
    if (!revisionRequest || revisionRequest.status !== 'pending') {
      await ctx.answerCbQuery('❌ Запрос не найден или уже обработан');
      return;
    }
    
    const { task, buyer, creator, buyerMessage } = revisionRequest;
    
    // Store data in session for comment request
    ctx.session.revisionApprovalData = {
      requestId: revisionRequest._id.toString(),
      taskId: task._id.toString(),
      creatorTgId: creator.tg_id,
      buyerMessage: buyerMessage,
      buyerUsername: buyer.username || buyer.tg_id,
      taskName: task.name
    };
    
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply('✅ Вы одобрили запрос на доработку.\n\n📝 Напишите комментарий для креативщика:');
    ctx.session.waitingForRevisionComment = true;
    
    await ctx.answerCbQuery('Запрос одобрен');
  } catch (error) {
    console.error('Error handling revision_approve action:', error);
    try { await ctx.answerCbQuery('Ошибка при одобрении запроса.'); } catch {}
  }
});

// Global handler for rejecting revision request
bot.action(/^revision_reject_(.+)$/, async (ctx) => {
  try {
    const requestId = ctx.match[1];
    const RevisionRequest = require('./src/databases/revisionRequest.model');
    const userService = require('./src/services/user.service');
    
    // Get revision request from database
    const revisionRequest = await RevisionRequest.findById(requestId)
      .populate('task')
      .populate('buyer');
    
    if (!revisionRequest || revisionRequest.status !== 'pending') {
      await ctx.answerCbQuery('❌ Запрос не найден или уже обработан');
      return;
    }
    
    const { task, buyer } = revisionRequest;
    
    // Find the moderator user by Telegram ID
    const moderatorUser = await userService.findUserByTelegramId(ctx.from.id);
    if (!moderatorUser) {
      await ctx.answerCbQuery('❌ Ошибка: пользователь не найден');
      return;
    }
    
    // Update request status
    revisionRequest.status = 'rejected';
    revisionRequest.processedBy = moderatorUser._id;
    revisionRequest.processedAt = new Date();
    await revisionRequest.save();
    
    if (task && buyer) {
      // Notify buyer that revision request was rejected
      await ctx.telegram.sendMessage(
        buyer.tg_id,
        `❌ Ваш запрос на доработку задачи "${task.name}" был отклонен модератором. Задание остается в статусе "Готово".`
      );
    }
    
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n❌ Отклонено');
    await ctx.answerCbQuery('Запрос отклонен');
  } catch (error) {
    console.error('Error handling revision_reject action:', error);
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

// Postpone requests list handler
bot.hears('📅 ТЗ на перенос', async (ctx) => {
    return ctx.scene.enter('postponeRequestsListScene');
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

