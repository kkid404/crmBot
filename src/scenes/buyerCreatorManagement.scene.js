const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const { buyerCreatorManagement } = require('../keyboards/buyerCreatorManagement.keyboard');
const userService = require('../services/user.service');
const BuyerCreatorService = require('../services/buyerCreator.service');
const { admin } = require('../keyboards/admin.keyboard');

const keyboardLabels = ruMessage.keyboards.buyerCreatorManagement;

const BuyerCreatorManagementScene = new BaseScene('BuyerCreatorManagement');

// Вход в сцену
BuyerCreatorManagementScene.enter(async (ctx) => {
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
            ruMessage.messages.buyerCreatorManagement.select_action,
            await buyerCreatorManagement()
        );
        
        // Инициализируем состояние сцены
        ctx.session.buyerCreatorState = 'main';
        
    } catch (error) {
        console.error('Ошибка при входе в сцену управления связями:', error);
        await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте позже.", await start(ctx.from.id));
        ctx.scene.leave();
    }
});

// Обработчик текстовых сообщений
BuyerCreatorManagementScene.on('text', async (ctx) => {
    try {
        const text = ctx.message.text;
        
        switch (ctx.session.buyerCreatorState) {
            case 'main':
                await handleMainMenu(ctx, text);
                break;
            case 'waiting_buyer_id':
                await handleBuyerIdInput(ctx, text);
                break;
            case 'waiting_creator_id':
                await handleCreatorIdInput(ctx, text);
                break;
            case 'waiting_remove_buyer_id':
                await handleRemoveBuyerIdInput(ctx, text);
                break;
            case 'waiting_remove_creator_id':
                await handleRemoveCreatorIdInput(ctx, text);
                break;
            case 'waiting_view_buyer_id':
                await handleViewBuyerIdInput(ctx, text);
                break;
        }
    } catch (error) {
        console.error('Ошибка в обработке текста:', error);
        await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте позже.");
        ctx.session.buyerCreatorState = 'main';
        await ctx.reply(
            ruMessage.messages.buyerCreatorManagement.select_action,
            await buyerCreatorManagement()
        );
    }
});

// Обработчик главного меню
async function handleMainMenu(ctx, text) {
    const keyboardLabels = ruMessage.keyboards.buyerCreatorManagement;
    
    if (text === keyboardLabels.add_link) {
        ctx.session.buyerCreatorState = 'waiting_buyer_id';
        ctx.session.action = 'add';
        await ctx.reply(ruMessage.messages.buyerCreatorManagement.enter_buyer_id);
    } else if (text === keyboardLabels.remove_link) {
        ctx.session.buyerCreatorState = 'waiting_remove_buyer_id';
        ctx.session.action = 'remove';
        await ctx.reply(ruMessage.messages.buyerCreatorManagement.enter_buyer_id);
    } else if (text === keyboardLabels.view_links) {
        ctx.session.buyerCreatorState = 'waiting_view_buyer_id';
        ctx.session.action = 'view';
        await ctx.reply(ruMessage.messages.buyerCreatorManagement.enter_buyer_id);
    } else if (text === keyboardLabels.back) {
        await ctx.reply('Вы вышли из управления связями.', await admin(ctx.from.id));
        ctx.scene.leave();
    } else {
        await ctx.reply(
            ruMessage.messages.buyerCreatorManagement.select_action,
            await buyerCreatorManagement()
        );
    }
}

// Обработчик ввода username баера для добавления
async function handleBuyerIdInput(ctx, text) {
    // Убираем @ если пользователь его ввёл
    const username = text.startsWith('@') ? text.slice(1) : text;
    
    // Проверяем, что username содержит только буквы, цифры и подчёркивания
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
        await ctx.reply(ruMessage.messages.buyerCreatorManagement.invalid_username);
        return;
    }
    
    const buyer = await userService.findUserByUsername(username);
    if (!buyer || buyer.position !== 'buyer') {
        await ctx.reply(ruMessage.messages.buyerCreatorManagement.buyer_not_found);
        return;
    }
    
    ctx.session.buyerId = buyer.tg_id;
    ctx.session.buyerCreatorState = 'waiting_creator_id';
    await ctx.reply(ruMessage.messages.buyerCreatorManagement.enter_creator_id);
}

// Обработчик ввода username креативщика для добавления
async function handleCreatorIdInput(ctx, text) {
    // Убираем @ если пользователь его ввёл
    const username = text.startsWith('@') ? text.slice(1) : text;
    
    // Проверяем, что username содержит только буквы, цифры и подчёркивания
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
        await ctx.reply(ruMessage.messages.buyerCreatorManagement.invalid_username);
        return;
    }
    
    const creator = await userService.findUserByUsername(username);
    if (!creator || creator.position !== 'creator') {
        await ctx.reply(ruMessage.messages.buyerCreatorManagement.creator_not_found);
        return;
    }
    
    try {
        // Получаем баера по tg_id, который сохранили в сессии
        const buyer = await userService.findUserByTelegramId(ctx.session.buyerId);
        await BuyerCreatorService.addCreator(buyer._id, creator._id);
        await ctx.reply(ruMessage.messages.buyerCreatorManagement.link_created);
    } catch (error) {
        console.error('Ошибка при создании связи:', error);
        await ctx.reply("Произошла ошибка при создании связи.");
    }
    
    // Возвращаемся в главное меню
    ctx.session.buyerCreatorState = 'main';
    await ctx.reply(
        ruMessage.messages.buyerCreatorManagement.select_action,
        await buyerCreatorManagement()
    );
}

// Обработчик ввода username баера для удаления
async function handleRemoveBuyerIdInput(ctx, text) {
    // Убираем @ если пользователь его ввёл
    const username = text.startsWith('@') ? text.slice(1) : text;
    
    // Проверяем, что username содержит только буквы, цифры и подчёркивания
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
        await ctx.reply(ruMessage.messages.buyerCreatorManagement.invalid_username);
        return;
    }
    
    const buyer = await userService.findUserByUsername(username);
    if (!buyer || buyer.position !== 'buyer') {
        await ctx.reply(ruMessage.messages.buyerCreatorManagement.buyer_not_found);
        return;
    }
    
    ctx.session.buyerId = buyer.tg_id;
    ctx.session.buyerCreatorState = 'waiting_remove_creator_id';
    await ctx.reply(ruMessage.messages.buyerCreatorManagement.enter_creator_id);
}

// Обработчик ввода username креативщика для удаления
async function handleRemoveCreatorIdInput(ctx, text) {
    // Убираем @ если пользователь его ввёл
    const username = text.startsWith('@') ? text.slice(1) : text;
    
    // Проверяем, что username содержит только буквы, цифры и подчёркивания
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
        await ctx.reply(ruMessage.messages.buyerCreatorManagement.invalid_username);
        return;
    }
    
    const creator = await userService.findUserByUsername(username);
    if (!creator || creator.position !== 'creator') {
        await ctx.reply(ruMessage.messages.buyerCreatorManagement.creator_not_found);
        return;
    }
    
    try {
        // Получаем баера по tg_id, который сохранили в сессии
        const buyer = await userService.findUserByTelegramId(ctx.session.buyerId);
        await BuyerCreatorService.removeCreator(buyer._id, creator._id);
        await ctx.reply(ruMessage.messages.buyerCreatorManagement.link_removed);
    } catch (error) {
        console.error('Ошибка при удалении связи:', error);
        await ctx.reply("Произошла ошибка при удалении связи.");
    }
    
    // Возвращаемся в главное меню
    ctx.session.buyerCreatorState = 'main';
    await ctx.reply(
        ruMessage.messages.buyerCreatorManagement.select_action,
        await buyerCreatorManagement()
    );
}

// Обработчик ввода username баера для просмотра
async function handleViewBuyerIdInput(ctx, text) {
    // Убираем @ если пользователь его ввёл
    const username = text.startsWith('@') ? text.slice(1) : text;
    
    // Проверяем, что username содержит только буквы, цифры и подчёркивания
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
        await ctx.reply(ruMessage.messages.buyerCreatorManagement.invalid_username);
        return;
    }
    
    const buyer = await userService.findUserByUsername(username);
    if (!buyer || buyer.position !== 'buyer') {
        await ctx.reply(ruMessage.messages.buyerCreatorManagement.buyer_not_found);
        return;
    }
    
    try {
        const buyerCreator = await BuyerCreatorService.getCreatorsByBuyer(buyer._id);
        
        if (!buyerCreator || !buyerCreator.creators || buyerCreator.creators.length === 0) {
            await ctx.reply(ruMessage.messages.buyerCreatorManagement.no_creators);
        } else {
            const creatorList = buyerCreator.creators.map(creator => 
                `• @${creator.username || 'без_username'} (ID: ${creator.tg_id})`
            ).join('\n');
            
            await ctx.reply(
                `${ruMessage.messages.buyerCreatorManagement.current_creators}\n\n${creatorList}`
            );
        }
    } catch (error) {
        console.error('Ошибка при получении связей:', error);
        await ctx.reply("Произошла ошибка при получении связей.");
    }
    
    // Возвращаемся в главное меню
    ctx.session.buyerCreatorState = 'main';
    await ctx.reply(
        ruMessage.messages.buyerCreatorManagement.select_action,
        await buyerCreatorManagement()
    );
}

module.exports = BuyerCreatorManagementScene; 