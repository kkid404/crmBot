const { Scenes, Markup } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const { admin } = require('../keyboards/admin.keyboard');
const PostponeRequest = require('../databases/postponeRequest.model');

const postponeRequestsListScene = new BaseScene('postponeRequestsListScene');

postponeRequestsListScene.enter(async (ctx) => {
    try {
        // Get all pending postpone requests from database
        const requests = await PostponeRequest.find({ status: 'pending' })
            .populate('task')
            .populate('creator')
            .sort({ createdAt: -1 });

        if (!requests || requests.length === 0) {
            await ctx.reply('📋 Нет активных запросов на перенос дедлайна', await admin());
            ctx.scene.leave();
            return;
        }

        // Store requests in session for pagination
        ctx.session.postponeRequests = requests;
        ctx.session.currentRequestIndex = 0;

        // Show first request
        await showRequest(ctx, 0);
    } catch (error) {
        console.error('Error in postponeRequestsListScene.enter:', error);
        await ctx.reply('Произошла ошибка при загрузке запросов', await admin());
        ctx.scene.leave();
    }
});

async function showRequest(ctx, index) {
    const requests = ctx.session.postponeRequests;
    
    if (!requests || requests.length === 0) {
        await ctx.reply('📋 Нет активных запросов на перенос дедлайна', await admin());
        ctx.scene.leave();
        return;
    }

    if (index < 0 || index >= requests.length) {
        await ctx.reply('Запрос не найден');
        return;
    }

    const request = requests[index];
    
    const taskName = request.task ? request.task.name : 'Задача не найдена';
    const creatorUsername = request.creator ? `@${request.creator.username || request.creator.tg_id}` : 'Неизвестен';
    const createdDate = new Date(request.createdAt).toLocaleString('ru-RU');
    
    // Format old deadline
    let oldDeadline = 'не указана';
    if (request.task && request.task.expectedDate) {
        const oldDate = new Date(request.task.expectedDate);
        const day = String(oldDate.getDate()).padStart(2, '0');
        const month = String(oldDate.getMonth() + 1).padStart(2, '0');
        const year = oldDate.getFullYear();
        oldDeadline = `${day}.${month}.${year}`;
        if (request.task.expectedTime) {
            oldDeadline += ` в ${request.task.expectedTime}`;
        }
    }

    const message = `📋 Запрос на перенос дедлайна (${index + 1}/${requests.length})\n\n` +
        `📌 Задача: ${taskName}\n` +
        `📝 Причина переноса: ${request.reason}\n` +
        `📅 Новая дата: ${request.newDate} в ${request.newTime}\n` +
        `📆 Старая дата: ${oldDeadline}\n` +
        `👤 От: ${creatorUsername}\n` +
        `🕐 Создан: ${createdDate}`;

    const keyboard = [];
    
    // Action buttons
    keyboard.push([
        Markup.button.callback('✅ Одобрить', `approve_req_${index}`),
        Markup.button.callback('❌ Отклонить', `reject_req_${index}`)
    ]);

    // Navigation buttons
    const navButtons = [];
    if (index > 0) {
        navButtons.push(Markup.button.callback('⬅️ Предыдущий', `nav_req_${index - 1}`));
    }
    if (index < requests.length - 1) {
        navButtons.push(Markup.button.callback('➡️ Следующий', `nav_req_${index + 1}`));
    }
    if (navButtons.length > 0) {
        keyboard.push(navButtons);
    }

    // Back button
    keyboard.push([Markup.button.callback('🔙 Назад в меню', 'back_to_admin')]);

    await ctx.reply(message, Markup.inlineKeyboard(keyboard));
}

// Navigation handlers
postponeRequestsListScene.action(/^nav_req_(\d+)$/, async (ctx) => {
    try {
        const index = parseInt(ctx.match[1]);
        ctx.session.currentRequestIndex = index;
        
        await ctx.deleteMessage();
        await showRequest(ctx, index);
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Error in nav_req handler:', error);
        await ctx.answerCbQuery('Ошибка навигации');
    }
});

// Approve handler
postponeRequestsListScene.action(/^approve_req_(\d+)$/, async (ctx) => {
    try {
        const index = parseInt(ctx.match[1]);
        const requests = ctx.session.postponeRequests;
        
        if (!requests || index >= requests.length) {
            await ctx.answerCbQuery('Запрос не найден');
            return;
        }

        const request = requests[index];

        // Store data in session for comment request
        ctx.session.postponeApprovalData = {
            requestId: request._id.toString(),
            taskId: request.task._id.toString(),
            creatorTgId: request.creator.tg_id,
            reason: request.reason,
            newDate: request.newDate,
            newTime: request.newTime
        };

        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        await ctx.reply('✅ Вы одобрили перенос дедлайна.\n\n📝 Напишите комментарий для баера:');
        ctx.session.waitingForPostponeComment = true;
        
        await ctx.answerCbQuery('Запрос одобрен');
        ctx.scene.leave();
    } catch (error) {
        console.error('Error in approve_req handler:', error);
        await ctx.answerCbQuery('Ошибка при одобрении');
    }
});

// Reject handler
postponeRequestsListScene.action(/^reject_req_(\d+)$/, async (ctx) => {
    try {
        const index = parseInt(ctx.match[1]);
        const requests = ctx.session.postponeRequests;
        
        if (!requests || index >= requests.length) {
            await ctx.answerCbQuery('Запрос не найден');
            return;
        }

        const request = requests[index];

        // Update request status in database
        await PostponeRequest.findByIdAndUpdate(request._id, {
            status: 'rejected',
            processedBy: ctx.from.id,
            processedAt: new Date()
        });

        if (request.task && request.creator) {
            // Notify creator that postpone was rejected
            await ctx.telegram.sendMessage(
                request.creator.tg_id,
                `❌ Ваш запрос на перенос дедлайна для задачи "${request.task.name}" был отклонен модератором.`
            );
        }

        // Remove from session array
        requests.splice(index, 1);
        ctx.session.postponeRequests = requests;

        await ctx.editMessageText('❌ Запрос отклонен');
        await ctx.answerCbQuery('Запрос отклонен');

        // Show next request or exit
        if (requests.length > 0) {
            const newIndex = Math.min(index, requests.length - 1);
            ctx.session.currentRequestIndex = newIndex;
            await showRequest(ctx, newIndex);
        } else {
            await ctx.reply('📋 Больше нет активных запросов на перенос', await admin());
            ctx.scene.leave();
        }
    } catch (error) {
        console.error('Error in reject_req handler:', error);
        await ctx.answerCbQuery('Ошибка при отклонении');
    }
});

// Back to admin menu
postponeRequestsListScene.action('back_to_admin', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        await ctx.reply(ruMessage.messages.start.replace("{name}", ctx.from.first_name), await admin());
        ctx.scene.leave();
    } catch (error) {
        console.error('Error in back_to_admin handler:', error);
        await ctx.answerCbQuery('Ошибка');
    }
});

module.exports = postponeRequestsListScene;
