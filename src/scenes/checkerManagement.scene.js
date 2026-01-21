const { Scenes, Markup } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const { back } = require('../keyboards/back.keyboard');
const userService = require('../services/user.service');

const CheckerManagementScene = new BaseScene('checkerManagementScene');

CheckerManagementScene.enter(async (ctx) => {
  try {
    const tgId = String(ctx.from.id);
    const me = await userService.findUserByTelegramId(tgId);
    // Только админ-креативщик (role: admin, position: creator)
    if (!(me && me.role === 'admin' && me.position === 'creator')) {
      await ctx.reply(ruMessage.keyboards.checkerManagement.not_creator_admin, await start(ctx.from.id));
      ctx.scene.leave();
      return;
    }
    await ctx.reply(ruMessage.keyboards.checkerManagement.enter_username, back());
    ctx.session.checkerStep = 'username';
  } catch (e) {
    await ctx.reply(ruMessage.messages.error, await start(ctx.from.id));
    ctx.scene.leave();
  }
});

CheckerManagementScene.on('text', async (ctx) => {
  try {
    const text = ctx.message.text.trim();

    // Назад
    if (text === ruMessage.keyboards.back[0]) {
      await ctx.reply(ruMessage.messages.start.replace('{name}', ctx.from.first_name), await start(ctx.from.id));
      ctx.scene.leave();
      return;
    }

    // /start
    if (text === '/start') {
      await ctx.reply(ruMessage.messages.start.replace('{name}', ctx.from.first_name), await start(ctx.from.id));
      ctx.scene.leave();
      return;
    }

    // Валидация username
    const usernameRegex = /^[a-zA-Z0-9_]{3,32}$/;
    if (!usernameRegex.test(text)) {
      await ctx.reply(ruMessage.keyboards.checkerManagement.invalid_username);
      return;
    }

    const target = await userService.findUserByUsername(text);
    if (!target) {
      await ctx.reply(ruMessage.keyboards.checkerManagement.user_not_found);
      return;
    }

    const isChecker = !!target.cheker;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(isChecker ? '❌ Снять чекера' : '✅ Назначить чекером', isChecker ? 'unset_checker' : 'set_checker')],
      [Markup.button.callback('⬅️ Назад', 'back_to_input')]
    ]);

    ctx.session.targetCheckerUserId = target._id;
    ctx.session.targetCheckerUsername = target.username;

    await ctx.reply(
      ruMessage.keyboards.checkerManagement.select_action.replace('{username}', target.username),
      keyboard
    );
  } catch (e) {
    console.error('checkerManagementScene error:', e);
    await ctx.reply(ruMessage.keyboards.checkerManagement.error);
  }
});

CheckerManagementScene.action('set_checker', async (ctx) => {
  try {
    const userId = ctx.session.targetCheckerUserId;
    const username = ctx.session.targetCheckerUsername;
    if (!userId) return await ctx.answerCbQuery('Нет выбранного пользователя');

    const updated = await userService.updateUserById(userId, { cheker: true });
    if (!updated) {
      await ctx.answerCbQuery('Ошибка обновления');
      return;
    }
    await ctx.editMessageText(ruMessage.keyboards.checkerManagement.set_success.replace('{username}', username));
  } catch (e) {
    console.error('set_checker error:', e);
    await ctx.answerCbQuery('Ошибка');
  }
});

CheckerManagementScene.action('unset_checker', async (ctx) => {
  try {
    const userId = ctx.session.targetCheckerUserId;
    const username = ctx.session.targetCheckerUsername;
    if (!userId) return await ctx.answerCbQuery('Нет выбранного пользователя');

    const updated = await userService.updateUserById(userId, { cheker: false });
    if (!updated) {
      await ctx.answerCbQuery('Ошибка обновления');
      return;
    }
    await ctx.editMessageText(ruMessage.keyboards.checkerManagement.unset_success.replace('{username}', username));
  } catch (e) {
    console.error('unset_checker error:', e);
    await ctx.answerCbQuery('Ошибка');
  }
});

CheckerManagementScene.action('back_to_input', async (ctx) => {
  await ctx.editMessageText(ruMessage.keyboards.checkerManagement.enter_username);
});

module.exports = CheckerManagementScene;
