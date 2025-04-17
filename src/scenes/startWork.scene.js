const { Scenes, Markup } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const EmployeeScheduleService = require('../services/employee_schedule.service');
const userService = require('../services/user.service');
const { start } = require('../keyboards/start.keyboard');

// Вспомогательная функция для отправки уведомлений чекерам
async function notifyCheckers(ctx, message) {
    try {
        // Находим всех пользователей с cheker: true
        const checkers = await userService.findAllCheckers();
        console.log(`Найдено чекеров: ${checkers.length}`);
        
        // Выводим информацию о каждом чекере для отладки
        checkers.forEach((checker, index) => {
            console.log(`Чекер ${index + 1}: ID=${checker._id}, TG_ID=${checker.tg_id}, Username=${checker.username}`);
        });
        
        // Отправляем уведомление каждому чекеру
        for (const checker of checkers) {
            try {
                console.log(`Отправка уведомления чекеру: ${checker.tg_id}`);
                const sent = await ctx.telegram.sendMessage(checker.tg_id, message);
                console.log(`Уведомление успешно отправлено чекеру: ${checker.tg_id}, message_id: ${sent.message_id}`);
            } catch (err) {
                console.error(`Ошибка отправки уведомления чекеру ${checker.tg_id}:`, err);
            }
        }
    } catch (err) {
        console.error("Ошибка при отправке уведомлений чекерам:", err);
        // Не прерываем выполнение основного кода, если с уведомлениями возникла проблема
    }
}

const startWorkScene = new BaseScene('startWorkScene');

startWorkScene.enter(async (ctx) => {
    const tgId = String(ctx.from.id);
    let user = await userService.findUserByTelegramId(tgId);
    const hasActiveShift = await EmployeeScheduleService.findActiveShiftByCreativeId(user._id);
    
    // Получаем имя пользователя
    const username = ctx.from.username 
        ? `@${ctx.from.username}` 
        : `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim();
    
    if(hasActiveShift !== null) {
        await EmployeeScheduleService.updateShift(hasActiveShift._id, {shiftEnd: Date()})
        await ctx.telegram.sendMessage(ctx.from.id, ruMessage.messages.shift_ended, await start(ctx.from.id))
        
        // Отправляем уведомление чекерам об окончании смены
        const notificationText = `🔴 ${username} закончил(а) рабочий день`;
        await notifyCheckers(ctx, notificationText);
    } else {
        await EmployeeScheduleService.createShift({
            shiftStart: Date(),
            creativeId: user._id
        })
        await ctx.telegram.sendMessage(ctx.from.id, ruMessage.messages.shift_started, await start(ctx.from.id))
        
        // Отправляем уведомление чекерам о начале смены
        const notificationText = `🟢 ${username} начал(а) рабочий день`;
        await notifyCheckers(ctx, notificationText);
    }
    ctx.session = {};
    ctx.scene.leave();
    
});


module.exports = startWorkScene;