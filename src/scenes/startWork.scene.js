const { Scenes, Markup } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const EmployeeScheduleService = require('../services/employee_schedule.service');
const userService = require('../services/user.service');
const { start } = require('../keyboards/start.keyboard');

const startWorkScene = new BaseScene('startWorkScene');

startWorkScene.enter(async (ctx) => {
    const tgId = String(ctx.from.id);
    let user = await userService.findUserByTelegramId(tgId);
    const hasActiveShift = await EmployeeScheduleService.findActiveShiftByCreativeId(user._id);
    if(hasActiveShift !== null) {
        await EmployeeScheduleService.updateShift(hasActiveShift._id, {shiftEnd: Date()})
        await ctx.telegram.sendMessage(ctx.from.id, ruMessage.messages.shift_ended, await start(ctx.from.id))

    } else {
        await EmployeeScheduleService.createShift({
            shiftStart: Date(),
            creativeId: user._id
        })
        await ctx.telegram.sendMessage(ctx.from.id, ruMessage.messages.shift_started, await start(ctx.from.id))

    }
    ctx.session = {};
    ctx.scene.leave();
    
});


module.exports = startWorkScene;