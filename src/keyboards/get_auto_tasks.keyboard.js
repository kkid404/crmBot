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

        // Группируем задачи по buyer._id
        const tasksByBuyer = {};
        activeTasks.forEach(task => {
            if (task.buyer && task.buyer._id) {
                const buyerId = task.buyer._id.toString();
                if (!tasksByBuyer[buyerId]) tasksByBuyer[buyerId] = [];
                tasksByBuyer[buyerId].push(task);
            }
        });

        // Получаем состояние очереди из БД
        let roundState = await RoundState.findOne({ key: 'autoAssignQueue' });
        if (!roundState) {
            roundState = new RoundState({ key: 'autoAssignQueue', processedBuyers: [] });
        }

        const processedBuyers = new Set(roundState.processedBuyers);
        const allBuyerIds = Object.keys(tasksByBuyer).sort();

        // Если все покупатели обработаны, начинаем новый раунд
        if (processedBuyers.size >= allBuyerIds.length) {
            processedBuyers.clear();
            roundState.processedBuyers = [];
            await roundState.save();
        }

        // Выбираем по одной самой старой задаче для каждого необработанного покупателя
        const selectedTasks = [];
        for (const buyerId of allBuyerIds) {
            if (!processedBuyers.has(buyerId)) {
                const buyerTasks = tasksByBuyer[buyerId];
                if (buyerTasks && buyerTasks.length > 0) {
                    // Сортируем задачи по дате создания (сначала старые)
                    buyerTasks.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                    selectedTasks.push(buyerTasks[0]);
                    processedBuyers.add(buyerId);
                }
            }
        }

        // Обновляем состояние очереди
        roundState.processedBuyers = Array.from(processedBuyers);
        await roundState.save();

        // Создаем массив кнопок для выбранных задач
        const inlineKeyboard = selectedTasks.map(task => {
            const bonusIndicator = task.bonus ? '💰 ' : '';
            const taskName = task.name.length > 30 ? task.name.substring(0, 27) + '...' : task.name;
            return [Markup.button.callback(`${bonusIndicator}${taskName}`, task._id.toString())];
        });

        // Добавляем кнопку для обновления списка задач
        inlineKeyboard.push([Markup.button.callback('🔄 Обновить список', 'refresh_tasks')]);
        
        // Добавляем кнопку выхода
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