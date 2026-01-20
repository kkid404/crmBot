const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const { back } = require('../keyboards/back.keyboard');
const userService = require('../services/user.service');
const BuyerLinkService = require('../services/buyerLink.service');

const BuyerLinkManagementScene = new BaseScene('buyerLinkManagementScene');

BuyerLinkManagementScene.enter(async (ctx) => {
    try {
        ctx.session.buyerLinkStep = 'main_buyer';
        await ctx.reply(ruMessage.messages.buyerLinkManagement.enter_main_buyer, back());
    } catch (error) {
        console.error('Ошибка при входе в сцену связывания баеров:', error);
        await ctx.reply(ruMessage.messages.error, await start(ctx.from.id));
        ctx.session = {};
        ctx.scene.leave();
    }
});

BuyerLinkManagementScene.on('text', async (ctx) => {
    try {
        const userInput = ctx.message.text.trim();
        const step = ctx.session.buyerLinkStep;

        // Обработка команды /start
        if (userInput === '/start') {
            await ctx.reply(
                ruMessage.messages.start.replace('{name}', ctx.from.first_name),
                await start(ctx.from.id)
            );
            ctx.session = {};
            ctx.scene.leave();
            return;
        }

        // Обработка кнопки "Назад"
        if (userInput === ruMessage.keyboards.back[0]) {
            await ctx.reply(
                ruMessage.messages.start.replace('{name}', ctx.from.first_name),
                await start(ctx.from.id)
            );
            ctx.session = {};
            ctx.scene.leave();
            return;
        }

        // Валидация username
        const usernameRegex = /^[a-zA-Z0-9_]{3,32}$/;
        if (!usernameRegex.test(userInput)) {
            await ctx.reply(ruMessage.messages.buyerLinkManagement.invalid_username);
            return;
        }

        if (step === 'main_buyer') {
            // Ищем главного баера
            const mainBuyer = await userService.findUserByUsername(userInput);
            
            if (!mainBuyer) {
                await ctx.reply(ruMessage.messages.buyerLinkManagement.main_buyer_not_found);
                return;
            }

            if (mainBuyer.position !== 'buyer') {
                await ctx.reply(ruMessage.messages.buyerLinkManagement.not_buyer);
                return;
            }

            // Сохраняем главного баера в сессии
            ctx.session.mainBuyerId = mainBuyer._id;
            ctx.session.mainBuyerUsername = mainBuyer.username;
            ctx.session.buyerLinkStep = 'linked_buyer';

            await ctx.reply(ruMessage.messages.buyerLinkManagement.enter_linked_buyer, back());

        } else if (step === 'linked_buyer') {
            // Ищем баера для привязки
            const linkedBuyer = await userService.findUserByUsername(userInput);
            
            if (!linkedBuyer) {
                await ctx.reply(ruMessage.messages.buyerLinkManagement.linked_buyer_not_found);
                return;
            }

            if (linkedBuyer.position !== 'buyer') {
                await ctx.reply(ruMessage.messages.buyerLinkManagement.not_buyer);
                return;
            }

            // Проверяем, не пытается ли пользователь связать баера с самим собой
            if (linkedBuyer._id.toString() === ctx.session.mainBuyerId.toString()) {
                await ctx.reply("⚠️ Нельзя привязать баера к самому себе!");
                return;
            }

            // Проверяем, существует ли уже такая связь
            const existingLink = await BuyerLinkService.getLinkedBuyersByMainBuyer(ctx.session.mainBuyerId);
            if (existingLink && existingLink.linkedBuyers.some(buyer => buyer._id.toString() === linkedBuyer._id.toString())) {
                await ctx.reply(ruMessage.messages.buyerLinkManagement.link_exists);
                return;
            }

            // Создаем связь
            await BuyerLinkService.addLinkedBuyer(ctx.session.mainBuyerId, linkedBuyer._id);

            await ctx.reply(
                `${ruMessage.messages.buyerLinkManagement.link_created}\n\n` +
                `Главный баер: @${ctx.session.mainBuyerUsername}\n` +
                `Привязанный баер: @${linkedBuyer.username}`,
                await start(ctx.from.id)
            );

            ctx.session = {};
            ctx.scene.leave();
        }

    } catch (error) {
        console.error('Ошибка в сцене связывания баеров:', error);
        await ctx.reply(ruMessage.messages.error, await start(ctx.from.id));
        ctx.session = {};
        ctx.scene.leave();
    }
});

module.exports = BuyerLinkManagementScene;
