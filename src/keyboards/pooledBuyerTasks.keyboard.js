const { Markup } = require('telegraf');
const taskService = require('../services/task.service');

// In-module state for the task pool
let currentPool = []; // Stores task objects { _id, name, buyer: { username, _id }, ... }
let tasksProcessedFromPool = new Set(); // Stores task._id of tasks taken from currentPool

/**
 * Refreshes the task pool.
 * Fetches active buyers and their oldest active task.
 */
async function refreshPool() {
    console.log('[pooledBuyerTasks.keyboard] Refreshing task pool (new logic)...');
    currentPool = [];
    tasksProcessedFromPool.clear();

    try {
        // Step 1: Get all active tasks.
        // This assumes taskService.getTasksActive() returns tasks with populated 'buyer' field
        // (including buyer._id, buyer.username, and task.createdAt for logic and display).
        const allActiveTasks = await taskService.getTasksActive();

        if (!allActiveTasks || allActiveTasks.length === 0) {
            console.log('[pooledBuyerTasks.keyboard] No active tasks found in the system.');
            return;
        }

        const oldestTaskByBuyer = new Map(); // To store the oldest task for each buyer

        for (const task of allActiveTasks) {
            // Ensure task, buyer, and buyer._id are present, and task has a createdAt timestamp
            if (task && task.buyer && task.buyer._id && task.createdAt) { 
                const buyerId = task.buyer._id.toString();

                // If this buyer is not in the map, or if the current task is older than the one stored for this buyer
                if (!oldestTaskByBuyer.has(buyerId) || new Date(task.createdAt) < new Date(oldestTaskByBuyer.get(buyerId).createdAt)) {
                    oldestTaskByBuyer.set(buyerId, task);
                }
            }
        }

        currentPool = Array.from(oldestTaskByBuyer.values());

        console.log(`[pooledBuyerTasks.keyboard] Pool refreshed. Found ${currentPool.length} tasks for pooling.`);
    } catch (error) {
        console.error('[pooledBuyerTasks.keyboard] Error refreshing pool with new logic:', error);
        currentPool = []; // Reset pool on error
    }
}

/**
 * Generates the inline keyboard with pooled tasks.
 * Refreshes the pool if it's empty or exhausted.
 */
const getKeyboard = async (isRetry = false) => {
    // Refresh conditions:
    // 1. Initial state (currentPool is empty).
    // 2. Pool is exhausted (all tasks from currentPool have been processed and currentPool had tasks).
    if (currentPool.length === 0 || (currentPool.length > 0 && tasksProcessedFromPool.size === currentPool.length)) {
        await refreshPool();
    }

       /* 2.  Отбрасываем из кеша задачи,
           которые к этому моменту уже не active
           (берём свежее состояние из базы) */
    const availableTasks = [];
    for (const cachedTask of currentPool) {
        if (tasksProcessedFromPool.has(cachedTask._id.toString())) continue;

        const freshTask = await taskService.findTaskById(cachedTask._id);
        if (freshTask && freshTask.state === 'active') {
            availableTasks.push(freshTask);          // всё ок – показываем
        } else {
            /* Задача сменила статус – помечаем, чтобы больше не светилась */
            tasksProcessedFromPool.add(cachedTask._id.toString());
        }
    }

    /* 3.  Если после фильтрации задач не осталось – обновляем пул
           и строим клавиатуру заново */
    if (availableTasks.length === 0) {
        if (isRetry) {
            // Если мы уже пробовали обновить и задач всё равно нет, возвращаем пустую клавиатуру
            return Markup.inlineKeyboard([
                [Markup.button.callback('Выйти', 'back')]
            ]);
        }
        await refreshPool();
        return getKeyboard(true);   // один рекурсивный вызов с флагом, что это повтор
    }
    
    // Этот блок стал недостижимым из-за логики выше, но оставляем на всякий случай
    if (availableTasks.length === 0) {
        // No tasks available even after a potential refresh
        return Markup.inlineKeyboard([
            // [Markup.button.callback('Обновить', 'pool_refresh_manual')],
            [Markup.button.callback('Выйти', 'back')]
        ]);
    }

    const buttons = availableTasks.map(task => {
        const taskDisplayName = task.name && task.name.length > 25 ? task.name.substring(0, 22) + "..." : (task.name || 'Без имени');
        return [Markup.button.callback(`${taskDisplayName}`, `${task._id.toString()}`)];
    });

    // buttons.push([Markup.button.callback('Обновить', 'pool_refresh_manual')]);
    buttons.push([Markup.button.callback('Выйти', 'back')]);

    return Markup.inlineKeyboard(buttons);
};

/**
 * Marks a task as selected from the current pool.
 * To be called by the scene after a user selects a task.
 * @param {string} taskId - The ID of the task selected.
 */
const markTaskAsSelectedFromPool = (taskId) => {
    if (currentPool.find(task => task._id.toString() === taskId)) {
        tasksProcessedFromPool.add(taskId);
        console.log(`[pooledBuyerTasks.keyboard] Task ${taskId} marked as processed from pool.`);
    }
};

/**
 * Action to manually refresh the pool.
 * To be called by the scene when user clicks the 'Refresh' button.
 */
const manualRefreshAction = async () => {
    await refreshPool();
};

module.exports = {
    getPooledBuyerTasksKeyboard: getKeyboard,
    markTaskAsSelectedFromPool,
    manualRefreshPooledTasksAction: manualRefreshAction
};
