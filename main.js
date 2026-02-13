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

