const { Scenes, Markup } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const taskService = require('../services/task.service');
const userService = require('../services/user.service');
const { formatDateMSK } = require('../utils/formatDate.util');
const { selectDateKeyboard } = require('../keyboards/selectDate.keyboard');

const postponeDeadlineScene = new BaseScene('postponeDeadlineScene');

// Helper function to validate time format (HH:MM)
function isValidTimeFormat(timeStr) {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return timeRegex.test(timeStr);
}

// Format date to DD.MM.YYYY
function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

// Enter the scene
postponeDeadlineScene.enter(async (ctx) => {
    try {
        const taskId = ctx.session.postponeTaskId;
        if (!taskId) {
            await ctx.reply('Ошибка: задача не найдена', await start(ctx.from.id));
            ctx.scene.leave();
            return;
        }

        const task = await taskService.findTaskById(taskId);
        if (!task) {
            await ctx.reply('Задача не найдена', await start(ctx.from.id));
            ctx.scene.leave();
            return;
        }

        ctx.session.postponeTask = task;
        await ctx.reply(`📝 Укажите причину переноса задачи "${task.name}":`);
        ctx.session.waitingForReason = true;
    } catch (error) {
        console.error('Error in postponeDeadlineScene.enter:', error);
        await ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.', await start(ctx.from.id));
        ctx.scene.leave();
    }
});

// Handle date selection buttons
postponeDeadlineScene.action('date_today', async (ctx) => {
    try {
        const today = new Date();
        const formattedDate = formatDate(today);
        
        ctx.session.newExpectedDate = formattedDate;
        ctx.session.waitingForDateSelection = false;
        
        await ctx.editMessageText('⏰ Введите новое время сдачи в формате ЧЧ:ММ (например, 18:30):');
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in date_today handler:', error);
        await ctx.answerCbQuery('Произошла ошибка');
    }
});

postponeDeadlineScene.action('date_tomorrow', async (ctx) => {
    try {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const formattedDate = formatDate(tomorrow);
        
        ctx.session.newExpectedDate = formattedDate;
        ctx.session.waitingForDateSelection = false;
        
        await ctx.editMessageText('⏰ Введите новое время сдачи в формате ЧЧ:ММ (например, 18:30):');
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in date_tomorrow handler:', error);
        await ctx.answerCbQuery('Произошла ошибка');
    }
});

postponeDeadlineScene.action('date_custom', async (ctx) => {
    try {
        ctx.session.waitingForCustomDate = true;
        ctx.session.waitingForDateSelection = false;
        
        await ctx.editMessageText('📅 Введите дату в формате ДД.ММ.ГГГГ (например, 25.02.2026):');
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in date_custom handler:', error);
        await ctx.answerCbQuery('Произошла ошибка');
    }
});

// Handle text input
postponeDeadlineScene.on('text', async (ctx) => {
    try {
        const userInput = ctx.message.text.trim();
        
        // Step 1: Waiting for reason
        if (ctx.session.waitingForReason) {
            ctx.session.postponeReason = userInput;
            ctx.session.waitingForReason = false;
            ctx.session.waitingForDateSelection = true;
            
            await ctx.reply('📅 Выберите новую дату сдачи креатива:', selectDateKeyboard());
            return;
        }
        
        // Step 2: Waiting for custom date
        if (ctx.session.waitingForCustomDate) {
            const dateRegex = /^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.\d{4}$/;
            if (!dateRegex.test(userInput)) {
                await ctx.reply('❌ Неверный формат даты. Пожалуйста, введите дату в формате ДД.ММ.ГГГГ (например, 25.02.2026):');
                return;
            }
            
            const [day, month, year] = userInput.split('.').map(Number);
            const date = new Date(year, month - 1, day);
            
            if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
                await ctx.reply('❌ Некорректная дата. Пожалуйста, введите существующую дату:');
                return;
            }
            
            ctx.session.newExpectedDate = userInput;
            ctx.session.waitingForCustomDate = false;
            
            await ctx.reply('⏰ Введите новое время сдачи в формате ЧЧ:ММ (например, 18:30):');
            return;
        }
        
        // Step 3: Waiting for time
        if (ctx.session.newExpectedDate && !ctx.session.waitingForDateSelection) {
            if (!isValidTimeFormat(userInput)) {
                await ctx.reply('❌ Неверный формат времени. Пожалуйста, введите время в формате ЧЧ:ММ (например, 18:30):');
                return;
            }
            
            ctx.session.newExpectedTime = userInput;
            
            // Send request to admins/moderators
            await sendPostponeRequest(ctx);
            return;
        }
        
        // If we're waiting for date selection, ignore text input
        if (ctx.session.waitingForDateSelection) {
            await ctx.reply('Пожалуйста, выберите дату с помощью кнопок выше.');
            return;
        }
        
    } catch (error) {
        console.error('Error in postponeDeadlineScene text handler:', error);
        await ctx.reply('Произошла ошибка при обработке вашего сообщения.');
    }
});

// Function to send postpone request to admins/moderators
async function sendPostponeRequest(ctx) {
    try {
        const task = ctx.session.postponeTask;
        const reason = ctx.session.postponeReason;
        const newDate = ctx.session.newExpectedDate;
        const newTime = ctx.session.newExpectedTime;
        const creatorTgId = ctx.from.id;
        
        // Find all admins and checkers
        const admins = await userService.findAllAdmins();
        const checkers = await userService.findAllCheckers();
        
        // Combine and get unique recipients
        const recipients = new Set();
        [...admins, ...checkers].forEach(user => {
            if (user.tg_id) {
                recipients.add(String(user.tg_id));
            }
        });
        
        if (recipients.size === 0) {
            await ctx.reply('❌ Не найдено ни одного модератора или администратора для отправки запроса.');
            ctx.scene.leave();
            return;
        }
        
        const message = `📋 Запрос на перенос дедлайна\n\n` +
            `📌 Задача: ${task.name}\n` +
            `📝 Причина переноса: ${reason}\n` +
            `📅 Новая дата: ${newDate} в ${newTime}\n` +
            `👤 От: @${ctx.from.username || ctx.from.first_name}`;
        
        // Encode postpone data in callback
        const postponeData = Buffer.from(JSON.stringify({
            taskId: task._id.toString(),
            creatorTgId,
            reason,
            newDate,
            newTime
        })).toString('base64');
        
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ ОК', `postpone_approve_${postponeData}`),
                Markup.button.callback('❌ Отмена', `postpone_reject_${task._id}_${creatorTgId}`)
            ]
        ]);
        
        // Send to all admins/moderators
        for (const tgId of recipients) {
            try {
                await ctx.telegram.sendMessage(tgId, message, keyboard);
            } catch (err) {
                console.error(`Failed to send postpone request to ${tgId}:`, err.message);
            }
        }
        
        await ctx.reply('✅ Запрос на перенос дедлайна отправлен модераторам. Ожидайте ответа.');
        
        // Clear session and leave scene
        delete ctx.session.postponeTaskId;
        delete ctx.session.postponeTask;
        delete ctx.session.postponeReason;
        delete ctx.session.newExpectedDate;
        delete ctx.session.newExpectedTime;
        delete ctx.session.waitingForReason;
        delete ctx.session.waitingForDateSelection;
        delete ctx.session.waitingForCustomDate;
        
        ctx.scene.leave();
    } catch (error) {
        console.error('Error in sendPostponeRequest:', error);
        await ctx.reply('Произошла ошибка при отправке запроса.');
        ctx.scene.leave();
    }
}

module.exports = postponeDeadlineScene;
