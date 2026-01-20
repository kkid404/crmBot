const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const { back } = require('../keyboards/back.keyboard');
const userService = require('../services/user.service');
const BuyerLinkService = require('../services/buyerLink.service');

const BuyerUnlinkManagementScene = new BaseScene('buyerUnlinkManagementScene');

BuyerUnlinkManagementScene.enter(async (ctx) => {
    try {
        ctx.session.buyerUnlinkStep = 'main_buyer';
        await ctx.reply('👨‍💼 Введите username главного баера (от которого нужно отвязать):', back());
    } catch (error) {
        console.error('Ошибка при входе в сцену удаления связи баеров:', error);
        await ctx.reply(ruMessage.messages.error, await start(ctx.from.id));
        ctx.session = {};
        ctx.scene.leave();
    }
});

BuyerUnlinkManagementScene.on('text', async (ctx) => {
    try {
        const userInput = ctx.message.text.trim();
        const step = ctx.session.buyerUnlinkStep;

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
            await ctx.reply('⚠️ Неверный формат username. Username должен содержать от 3 до 32 символов (буквы, цифры, подчеркивание).');
            return;
        }

        if (step === 'main_buyer') {
            // Ищем главного баера
            const mainBuyer = await userService.findUserByUsername(userInput);
            
            if (!mainBuyer) {
                await ctx.reply('⚠️ Баер с таким username не найден.');
                return;
            }

            if (mainBuyer.position !== 'buyer') {
                await ctx.reply('⚠️ Этот пользователь не является баером.');
                return;
            }

            // Проверяем, есть ли у этого баера связанные баеры
            const buyerLinks = await BuyerLinkService.getLinkedBuyersByMainBuyer(mainBuyer._id);
            if (!buyerLinks || !buyerLinks.linkedBuyers || buyerLinks.linkedBuyers.length === 0) {
                await ctx.reply('⚠️ У этого баера нет привязанных баеров.', await start(ctx.from.id));
                ctx.session = {};
                ctx.scene.leave();
                return;
            }

            // Сохраняем главного баера в сессии
            ctx.session.mainBuyerId = mainBuyer._id;
            ctx.session.mainBuyerUsername = mainBuyer.username;
            ctx.session.buyerUnlinkStep = 'linked_buyer';

            // Показываем список привязанных баеров
            const linkedBuyersList = buyerLinks.linkedBuyers
                .map(buyer => `@${buyer.username}`)
                .join('\n');

            await ctx.reply(
                `👨‍💼 Привязанные баеры к @${mainBuyer.username}:\n\n${linkedBuyersList}\n\n` +
                `Введите username баера, которого нужно отвязать:`,
                back()
            );

        } else if (step === 'linked_buyer') {
            // Ищем баера для отвязки
            const linkedBuyer = await userService.findUserByUsername(userInput);
            
            if (!linkedBuyer) {
                await ctx.reply('⚠️ Баер с таким username не найден.');
                return;
            }

            if (linkedBuyer.position !== 'buyer') {
                await ctx.reply('⚠️ Этот пользователь не является баером.');
                return;
            }

            // Проверяем, существует ли такая связь
            const existingLink = await BuyerLinkService.getLinkedBuyersByMainBuyer(ctx.session.mainBuyerId);
            if (!existingLink || !existingLink.linkedBuyers.some(buyer => buyer._id.toString() === linkedBuyer._id.toString())) {
                await ctx.reply('⚠️ Этот баер не привязан к главному баеру.');
                return;
            }

            // Удаляем связь
            await BuyerLinkService.removeLinkedBuyer(ctx.session.mainBuyerId, linkedBuyer._id);

            await ctx.reply(
                `✅ Связь успешно удалена!\n\n` +
                `Главный баер: @${ctx.session.mainBuyerUsername}\n` +
                `Отвязанный баер: @${linkedBuyer.username}`,
                await start(ctx.from.id)
            );

            ctx.session = {};
            ctx.scene.leave();
        }

    } catch (error) {
        console.error('Ошибка в сцене удаления связи баеров:', error);
        await ctx.reply(ruMessage.messages.error, await start(ctx.from.id));
        ctx.session = {};
        ctx.scene.leave();
    }
});

module.exports = BuyerUnlinkManagementScene;
