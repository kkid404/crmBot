const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const taskService = require('../services/task.service');

const setExpectedTimeScene = new BaseScene('setExpectedTimeScene');

// Helper function to validate time format (HH:MM)
function isValidTimeFormat(timeStr) {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return timeRegex.test(timeStr);
}

// Helper function to validate date format (DD.MM.YYYY)
function isValidDateFormat(dateStr) {
    const dateRegex = /^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.\d{4}$/;
    if (!dateRegex.test(dateStr)) return false;
    
    const [day, month, year] = dateStr.split('.').map(Number);
    const date = new Date(year, month - 1, day);
    
    return date.getDate() === day && 
           date.getMonth() === month - 1 && 
           date.getFullYear() === year;
}

// Format date to DD.MM.YYYY
function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

// Enter the scene
setExpectedTimeScene.enter(async (ctx) => {
    try {
        // First, ask for the date
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const formattedDate = formatDate(tomorrow);
        
        await ctx.reply(`📅 Пожалуйста, введите дату сдачи в формате ДД.ММ.ГГГГ (например, ${formattedDate}):`);
        ctx.session.expectedDate = null; // Reset any previous date
    } catch (error) {
        console.error('Error in setExpectedTimeScene.enter:', error);
        await ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.', await start(ctx.from.id));
        ctx.scene.leave();
    }
});

// Handle text input for date and time
setExpectedTimeScene.on('text', async (ctx) => {
    try {
        const userInput = ctx.message.text.trim();
        
        if (!ctx.session.expectedDate) {
            // First step: validate and save date
            if (!isValidDateFormat(userInput)) {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const formattedDate = formatDate(tomorrow);
                
                await ctx.reply(`❌ Неверный формат даты.\nПожалуйста, введите дату в формате ДД.ММ.ГГГГ (например, ${formattedDate}):`);
                return;
            }
            
            // Save the date and ask for time
            ctx.session.expectedDate = userInput;
            await ctx.reply('⏰ Теперь введите время сдачи в формате ЧЧ:ММ (например, 18:30):');
        } else {
            // Second step: validate and save time
            if (!isValidTimeFormat(userInput)) {
                await ctx.reply('❌ Неверный формат времени. Пожалуйста, введите время в формате ЧЧ:ММ (например, 18:30):');
                return;
            }
            
            // Get the task ID from session
            const taskId = ctx.session.taskIdForTimeSetting;
            if (!taskId) {
                throw new Error('Task ID not found in session');
            }
            
            // Parse date and time
            const [day, month, year] = ctx.session.expectedDate.split('.').map(Number);
            const [hours, minutes] = userInput.split(':').map(Number);
            
            // Create date object in local timezone
            const expectedDateTime = new Date(year, month - 1, day, hours, minutes);
            
            // Get the task to check its current state
            const task = await taskService.findTaskById(taskId);
            
            if (!task) {
                await ctx.reply('❌ Задача не найдена.', await start(ctx.from.id));
                ctx.session.taskIdForTimeSetting = null;
                ctx.session.expectedDate = null;
                ctx.scene.leave();
                return;
            }
            
            // Update the task with expected date and time
            const updateData = { 
                expectedDate: expectedDateTime,
                expectedTime: userInput
            };
            
            // If task is in 'time' state, move it to 'progress'
            if (task.state === 'time') {
                updateData.state = 'progress';
            }
            
            await taskService.updateTask(taskId, updateData);
            
            // If task was in 'time' state, notify the creator
            if (task.state === 'time' && task.creator) {
                try {
                    const userService = require('../services/user.service');
                    const creator = await userService.findById(task.creator);
                    
                    if (creator && creator.tg_id) {
                        const notificationText = `🔔 Вам назначена новая задача: "${task.name}"

📅 Ожидаемая дата сдачи: ${ctx.session.expectedDate} к ${userInput}
📝 Описание: ${task.description}`;
                        
                        await ctx.telegram.sendMessage(creator.tg_id, notificationText);
                        console.log(`Уведомление о задаче отправлено креативщику ${creator.username} (${creator.tg_id})`);
                    }
                } catch (err) {
                    console.error('Ошибка отправки уведомления креативщику:', err);
                }
            }
            
            // Notify the admin/user
            await ctx.reply(
                `✅ Время сдачи успешно установлено:\n📅 Дата: ${ctx.session.expectedDate}\n⏰ Время: ${userInput}${task.state === 'time' ? '\n\n✅ Задача переведена в работу и креативщик уведомлен.' : ''}`,
                await start(ctx.from.id)
            );
            
            // Clear session and leave scene
            ctx.session.taskIdForTimeSetting = null;
            ctx.session.expectedDate = null;
            ctx.scene.leave();
        }
    } catch (error) {
        console.error('Error in setExpectedTimeScene text handler:', error);
        await ctx.reply('Произошла ошибка при установке даты/времени. Пожалуйста, попробуйте позже.', await start(ctx.from.id));
        ctx.scene.leave();
    }
});

// Handle any other content types
setExpectedTimeScene.on('message', async (ctx) => {
    if (!ctx.session.expectedDate) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const formattedDate = formatDate(tomorrow);
        await ctx.reply(`Пожалуйста, введите дату в формате ДД.ММ.ГГГГ (например, ${formattedDate}):`);
    } else {
        await ctx.reply('Пожалуйста, введите время в формате ЧЧ:ММ (например, 18:30):');
    }
});

module.exports = setExpectedTimeScene;
