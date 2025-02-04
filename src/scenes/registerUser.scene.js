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
    await ctx.reply(ruMessage.messages.send_token);
    const tgId = String(ctx.from.id);

    try {
        // Получаем всех пользователей
        // const allUsers = await userService.getAll();

        // if (allUsers.length === 0) {
        //     // Если пользователей нет, создаем первого
        //     await userService.createUser({
        //         tg_id: tgId,
        //         role: 'admin', // Первый пользователь назначается админом
        //         created_at: new Date(),
        //     });
        // }
    } catch (error) {
        console.error(ruMessage.messages.registration_error, error);
        await ctx.reply(ruMessage.messages.registration_error);
    }
});

RegisterUserScene.on('text', async (ctx) => {
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
        await ctx.reply(ruMessage.messages.error_token);
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

        await ctx.reply(`Вы успешно зарегистрированы как ${tokenData.position} с ролью ${tokenData.role}.`, await start(ctx.from.id));
    } catch (error) {
        console.error("Error during user creation:", error);
        await ctx.reply("Произошла ошибка при регистрации.");
    }

    // Очистка сессии и выход из сцены
    ctx.session = {};
    ctx.scene.leave();
});

module.exports = RegisterUserScene;
