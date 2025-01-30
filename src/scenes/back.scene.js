const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');


const BackScene = new BaseScene('backScene');

BackScene.enter(async (ctx) => {
    const kb = await start(ctx.from.id)
    await ctx.reply(ruMessage.messages.ok, kb);
    ctx.session = {};
    ctx.scene.leave();
});

module.exports = BackScene;
