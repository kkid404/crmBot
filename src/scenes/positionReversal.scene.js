const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const userService = require('../services/user.service');


const positionReversalScene = new BaseScene('positionReversalScene');

positionReversalScene.enter(async (ctx) => {
    const userId = ctx.from.id;
    const user = await userService.findUserByTelegramId(userId);
    // Определяем противоположное значение для position
    const newPosition = user.position === 'buyer' ? 'creator' : 'buyer';

    // Обновляем position пользователя
    await userService.updateUser(userId, { position: newPosition });

    await ctx.reply(ruMessage.messages.positionChangedSuccessfully.replace("{position}", newPosition), await start(userId));
    return ctx.scene.leave();
});

module.exports = positionReversalScene;
