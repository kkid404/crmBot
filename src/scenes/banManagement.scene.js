const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const { banManagement } = require('../keyboards/banManagement.keyboard');
const userService = require('../services/user.service');
const { admin } = require('../keyboards/admin.keyboard');

const keyboardLabels = ruMessage.keyboards.banManagement;

const BanManagementScene = new BaseScene('BanManagement');

// Вход в сцену
BanManagementScene.enter(async (ctx) => {
    try {
        const tgId = String(ctx.from.id);
        const user = await userService.findUserByTelegramId(tgId);
        
        // Проверяем, является ли пользователь админом
        if (!user || user.role !== 'admin') {
            await ctx.reply(ruMessage.messages.errors.error_protected, await start(ctx.from.id));
            ctx.scene.leave();
            return;
        }
        
        await ctx.reply(
            ruMessage.messages.banManagement.select_action,
            await banManagement()
        );
        
        // Инициализируем состояние сцены
        ctx.session.banManagementState = 'main';
        
    } catch (error) {
        console.error('Ошибка при входе в сцену управления банами:', error);
        await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте позже.", await start(ctx.from.id));
        ctx.scene.leave();
    }
});

// Обработчик текстовых сообщений
BanManagementScene.on('text', async (ctx) => {
    try {
        const text = ctx.message.text;
        
        switch (ctx.session.banManagementState) {
            case 'main':
                await handleMainMenu(ctx, text);
                break;
            case 'waiting_ban_username':
                await handleBanUsername(ctx, text);
                break;
            case 'waiting_unban_username':
                await handleUnbanUsername(ctx, text);
                break;
        }
    } catch (error) {
        console.error('Ошибка в обработке текста:', error);
        await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте позже.");
        ctx.session.banManagementState = 'main';
        await ctx.reply(
            ruMessage.messages.banManagement.select_action,
            await banManagement()
        );
    }
});

// Обработчик главного меню
async function handleMainMenu(ctx, text) {
    const keyboardLabels = ruMessage.keyboards.banManagement;
    
    if (text === keyboardLabels.ban_user) {
        ctx.session.banManagementState = 'waiting_ban_username';
        await ctx.reply(ruMessage.messages.banManagement.enter_username);
    } else if (text === keyboardLabels.unban_user) {
        ctx.session.banManagementState = 'waiting_unban_username';
        await ctx.reply(ruMessage.messages.banManagement.enter_username);
    } else if (text === keyboardLabels.back) {
        await ctx.reply('Вы вышли из управления банами.', await admin(ctx.from.id));
        ctx.scene.leave();
    } else {
        await ctx.reply(
            ruMessage.messages.banManagement.select_action,
            await banManagement()
        );
    }
}

// Обработчик ввода username для бана
async function handleBanUsername(ctx, text) {
    // Убираем @ если пользователь его ввёл
    const username = text.startsWith('@') ? text.slice(1) : text;
    
    // Проверяем, что username содержит только буквы, цифры и подчёркивания
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
        await ctx.reply(ruMessage.messages.banManagement.invalid_username);
        return;
    }
    
    const user = await userService.findUserByUsername(username);
    if (!user) {
        await ctx.reply(ruMessage.messages.banManagement.user_not_found);
        ctx.session.banManagementState = 'main';
        await ctx.reply(
            ruMessage.messages.banManagement.select_action,
            await banManagement()
        );
        return;
    }
    
    // Проверяем, не забанен ли уже пользователь
    if (user.isBan === true) {
        await ctx.reply(ruMessage.messages.banManagement.user_already_banned);
        ctx.session.banManagementState = 'main';
        await ctx.reply(
            ruMessage.messages.banManagement.select_action,
            await banManagement()
        );
        return;
    }
    
    try {
        await userService.banUser(user.tg_id);
        await ctx.reply(ruMessage.messages.banManagement.user_banned_success);
    } catch (error) {
        console.error('Ошибка при бане пользователя:', error);
        await ctx.reply("Произошла ошибка при блокировке пользователя.");
    }
    
    // Возвращаемся в главное меню
    ctx.session.banManagementState = 'main';
    await ctx.reply(
        ruMessage.messages.banManagement.select_action,
        await banManagement()
    );
}

// Обработчик ввода username для разбана
async function handleUnbanUsername(ctx, text) {
    // Убираем @ если пользователь его ввёл
    const username = text.startsWith('@') ? text.slice(1) : text;
    
    // Проверяем, что username содержит только буквы, цифры и подчёркивания
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
        await ctx.reply(ruMessage.messages.banManagement.invalid_username);
        return;
    }
    
    const user = await userService.findUserByUsername(username);
    if (!user) {
        await ctx.reply(ruMessage.messages.banManagement.user_not_found);
        ctx.session.banManagementState = 'main';
        await ctx.reply(
            ruMessage.messages.banManagement.select_action,
            await banManagement()
        );
        return;
    }
    
    // Проверяем, забанен ли пользователь
    if (user.isBan !== true) {
        await ctx.reply(ruMessage.messages.banManagement.user_not_banned);
        ctx.session.banManagementState = 'main';
        await ctx.reply(
            ruMessage.messages.banManagement.select_action,
            await banManagement()
        );
        return;
    }
    
    try {
        await userService.unbanUser(user.tg_id);
        await ctx.reply(ruMessage.messages.banManagement.user_unbanned_success);
    } catch (error) {
        console.error('Ошибка при разбане пользователя:', error);
        await ctx.reply("Произошла ошибка при разблокировке пользователя.");
    }
    
    // Возвращаемся в главное меню
    ctx.session.banManagementState = 'main';
    await ctx.reply(
        ruMessage.messages.banManagement.select_action,
        await banManagement()
    );
}

module.exports = BanManagementScene;
