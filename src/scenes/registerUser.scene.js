const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const userService = require('../services/user.service');
const { start } = require('../keyboards/start.keyboard');

const tokenRolesMap = {
    "ee2433259b0fe399b40e81d2c98a38b6": { role: 'admin', position: 'creator', checker: true },
    "794aad24cbd58461011ed9094b7fa212": { role: 'admin', position: 'buyer', checker: true },
    "9473e947b07c43539e9a759c6161b55e": { role: 'user', position: 'creator', checker: false },
    "41d5d26dfcaf933381b64e708acea053": { role: 'user', position: 'buyer', checker: false },
};

const RegisterUserScene = new BaseScene('RegisterUser');

RegisterUserScene.enter(async (ctx) => {
    const tgId = String(ctx.from.id);
    await ctx.reply(ruMessage.messages.send_token);

    // Получаем всех пользователей
    const allUsers = await userService.getAll();

    if (allUsers.length === 0) {
        // Если пользователей нет, создаем первого
        await userService.createUser({
            tg_id: tgId,
            role: 'admin',
            created_at: new Date(),
        });
    }
});

RegisterUserScene.on('text', async (ctx) => {
    try {
        const tgId = String(ctx.from.id);
        let user = await userService.findUserByTelegramId(tgId);

        if (user) {
            // Если пользователь уже существует, очищаем сессию и выходим из сцены
            ctx.session = {};
            ctx.scene.leave();
            return;
        }

        const userInput = ctx.message.text.trim();

        // Проверяем, существует ли токен в маппинге
        const tokenData = tokenRolesMap[userInput];

        if (!tokenData) {
            // Если токен не найден
            try {
                await ctx.reply(ruMessage.messages.error_token);
            } catch (error) {
                if (error.response?.error_code === 403) {
                    console.log(`Пользователь ${tgId} заблокировал бота`);
                } else {
                    console.error('Ошибка при отправке сообщения:', error);
                }
            }
            ctx.session = {};
            ctx.scene.leave();
            return;
        }

        try {
            // Создаем пользователя с ролью, позицией и флагом checker из маппинга
            await userService.createUser({
                tg_id: tgId,
                role: tokenData.role,
                position: tokenData.position,
                username: ctx.from.username,
                checker: tokenData.checker, // Устанавливаем значение checker
                created_at: new Date(),
            });

            try {
                await ctx.reply(
                    `Вы успешно зарегистрированы как ${tokenData.position} с ролью ${tokenData.role}.`,
                    await start(ctx.from.id)
                );
            } catch (error) {
                if (error.response?.error_code === 403) {
                    console.log(`Пользователь ${tgId} заблокировал бота`);
                } else {
                    console.error('Ошибка при отправке сообщения:', error);
                }
            }
        } catch (error) {
            console.error("Ошибка при создании пользователя:", error);
            try {
                await ctx.reply("Произошла ошибка при регистрации.");
            } catch (replyError) {
                if (replyError.response?.error_code === 403) {
                    console.log(`Пользователь ${ctx.from.id} заблокировал бота`);
                } else {
                    console.error('Ошибка при отправке сообщения об ошибке:', replyError);
                }
            }
        }

    } catch (error) {
        console.error("Ошибка при создании пользователя:", error);
        try {
            await ctx.reply("Произошла ошибка при регистрации.");
        } catch (replyError) {
            if (replyError.response?.error_code === 403) {
                console.log(`Пользователь ${ctx.from.id} заблокировал бота`);
            } else {
                console.error('Ошибка при отправке сообщения об ошибке:', replyError);
            }
        }
    }

    ctx.session = {};
    ctx.scene.leave();
});

module.exports = RegisterUserScene;
