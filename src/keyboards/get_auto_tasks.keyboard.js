const taskService = require('../services/task.service');
const { Markup } = require('telegraf');
const RoundState = require('../databases/roundState.model');

// Функция для создания inline клавиатуры на основе данных задач с автоматическим выбором
const autoTasks = async () => {
    try {
        // Получаем все активные задачи
        const activeTasks = await taskService.getTasksActive();
        if (!activeTasks || activeTasks.length === 0) {
            return Markup.inlineKeyboard([
                [Markup.button.callback('Нет доступных задач', 'no_tasks')],
                [Markup.button.callback('Выйти', 'quit')]
            ]);
        }

        // Получаем состояние очереди из БД
        let roundState = await RoundState.findOne({ key: 'autoAssignQueue' });
        if (!roundState) {
            roundState = new RoundState({
                key: 'autoAssignQueue',
                roundStartTime: new Date(),
                roundTasks: {},
                processedTaskIds: []
            });
        }

        // Проверяем, нужен ли новый круг
        let needNewRound = false;
        if (!roundState.roundTasks || Object.keys(roundState.roundTasks).length === 0) {
            needNewRound = true;
        } else {
            const allTaskIds = Object.values(roundState.roundTasks).flat();
            const remaining = allTaskIds.filter(id => !roundState.processedTaskIds.includes(id));
            if (remaining.length === 0) needNewRound = true;
        }

        if (needNewRound) {
            // Формируем новый круг из всех активных задач
            const tasksByBuyer = {};
            for (const task of activeTasks) {
                if (task?.buyer?._id) {
                    const buyerId = task.buyer._id.toString();
                    if (!tasksByBuyer[buyerId]) tasksByBuyer[buyerId] = [];
                    tasksByBuyer[buyerId].push(task._id.toString());
                }
            }
            roundState.roundTasks = tasksByBuyer;
            roundState.processedTaskIds = [];
            roundState.roundStartTime = new Date();
            await roundState.save();
        }

        // Получаем все задачи текущего круга одним запросом
        const allTaskIds = Object.values(roundState.roundTasks).flat();
        const tasksMap = {};
        const tasks = await Task.find({ _id: { $in: allTaskIds } }).populate('buyer');
        tasks.forEach(task => {
            tasksMap[task._id.toString()] = task;
        });

        // Выбираем по одной задаче на баера (самая старая) среди тех, что ещё не выданы
        const selectedTasks = [];
        const buyerIds = Object.keys(roundState.roundTasks).sort(); // фиксированный порядок баеров

        for (const buyerId of buyerIds) {
            const taskIds = roundState.roundTasks[buyerId];
            const nextTaskId = taskIds
                .filter(id => !roundState.processedTaskIds.includes(id))
                .sort((a, b) => new Date(tasksMap[a].createdAt) - new Date(tasksMap[b].createdAt))[0];

            if (nextTaskId) {
                selectedTasks.push(tasksMap[nextTaskId]);
                roundState.processedTaskIds.push(nextTaskId);
            }
        }

        await roundState.save();

        // Формируем кнопки для Telegram
        const inlineKeyboard = selectedTasks.map(task => {
            const bonusIndicator = task.bonus ? '💰 ' : '';
            const taskName = task.name.length > 30 ? task.name.substring(0, 27) + '...' : task.name;
            return [Markup.button.callback(`${bonusIndicator}${taskName}`, task._id.toString())];
        });

        inlineKeyboard.push([Markup.button.callback('🔄 Обновить список', 'refresh_tasks')]);
        inlineKeyboard.push([Markup.button.callback('Выйти', 'quit')]);

        return Markup.inlineKeyboard(inlineKeyboard);

    } catch (error) {
        console.error('Ошибка при создании клавиатуры:', error);
        return Markup.inlineKeyboard([
            [Markup.button.callback('Ошибка при загрузке задач', 'error')],
            [Markup.button.callback('Выйти', 'quit')]
        ]);
    }
};


module.exports = { autoTasks }; 