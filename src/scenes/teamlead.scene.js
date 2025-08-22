const { Scenes, Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');
const taskService = require('../services/task.service');
const pointsActions = require('../actions/points.actions');
const { start } = require('../keyboards/start.keyboard');

const teamleadScene = new Scenes.BaseScene('TEAMLEAD_SCENE');

// Handler for the team lead menu
teamleadScene.enter(async (ctx) => {
    const keyboard = [
        [Markup.button.text('🏆 Собрать отчёт')],
        [Markup.button.text('📋 Задачи в работе')],
        [Markup.button.text('◀️ Назад в меню баера')]
    ];

    await ctx.reply('Меню тимлида', Markup.keyboard(keyboard).resize());
});

// Handle report generation
teamleadScene.hears('🏆 Собрать отчёт', async (ctx) => {
    await pointsActions.showPeriodSelector(ctx);
    return ctx.scene.leave();
});

// Handle tasks in progress
teamleadScene.hears('📋 Задачи в работе', async (ctx) => {
    try {
        // Get tasks with 'active' or 'progress' state
        const [activeTasks, progressTasks] = await Promise.all([
            taskService.getTasksByState('active'),
            taskService.getTasksByState('progress')
        ]);

        const allTasks = [...(activeTasks || []), ...(progressTasks || [])];
        
        if (allTasks.length === 0) {
            await ctx.reply('Нет задач в работе (ни активных, ни в процессе)');
            return ctx.scene.reenter();
        }

        const taskList = allTasks.map((task, index) => 
            `${index + 1}. ${task.name} - ${task.state === 'progress' ? 'В процессе' : 'Активна'} (${task.buyer?.name || 'Без баера'})`
        ).join('\n');

        await ctx.reply(`Задачи в работе (всего: ${allTasks.length}):\n\n${taskList}`);
        return ctx.scene.reenter();
    } catch (error) {
        console.error('Error getting tasks in progress:', error);
        await ctx.reply('Произошла ошибка при получении задач');
        return ctx.scene.reenter();
    }
});

// Handle back to buyer menu
teamleadScene.hears('◀️ Назад в меню баера', async (ctx) => {
    try {
        // Get the start keyboard for the user
        const keyboard = await start(ctx.from.id);
        await ctx.reply('Возвращаемся в меню баера', keyboard);
        return ctx.scene.leave();
    } catch (error) {
        console.error('Error returning to buyer menu:', error);
        await ctx.reply('Произошла ошибка при возврате в меню');
        return ctx.scene.leave();
    }
});

// Handle any other text input
teamleadScene.on('text', (ctx) => {
    return ctx.reply('Пожалуйста, используйте кнопки меню');
});

module.exports = teamleadScene;
