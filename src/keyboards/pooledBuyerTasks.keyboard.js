const { Markup } = require('telegraf');
const taskService = require('../services/task.service');
const RoundState = require('../databases/roundState.model');

// In-memory cache for the current pool and processed tasks
let currentPool = []; // Cached task objects for the current round
const ROUND_STATE_KEY = 'taskPoolRounds'; // Key for storing round state in DB

/**
 * Refreshes the task pool using RoundState for managing rounds.
 * Fetches active buyers and their oldest active task, maintaining rounds in the database.
 */
async function refreshPool() {
    console.log('[pooledBuyerTasks.keyboard] Refreshing task pool with RoundState...');
    currentPool = [];

    try {
        // Get or create round state
        let roundState = await RoundState.findOne({ key: ROUND_STATE_KEY });
        const now = new Date();

        if (!roundState) {
            // Create new round state if it doesn't exist
            roundState = new RoundState({
                key: ROUND_STATE_KEY,
                roundStartTime: now,
                roundTasks: new Map(),
                processedTaskIds: []
            });
            await roundState.save();
        }

        // Get all active tasks
        const allActiveTasks = await taskService.getTasksActive();
        if (!allActiveTasks || allActiveTasks.length === 0) {
            console.log('[pooledBuyerTasks.keyboard] No active tasks found in the system.');
            return;
        }

        // Find oldest task per buyer
        const oldestTaskByBuyer = new Map();
        for (const task of allActiveTasks) {
            if (task?.buyer?._id) {
                const buyerId = task.buyer._id.toString();
                const taskId = task._id.toString();
                
                // Skip if this task is already processed in the current round
                if (roundState.processedTaskIds.includes(taskId)) {
                    continue;
                }

                // Track oldest task per buyer
                if (!oldestTaskByBuyer.has(buyerId) || 
                    new Date(task.createdAt) < new Date(oldestTaskByBuyer.get(buyerId).createdAt)) {
                    oldestTaskByBuyer.set(buyerId, task);
                }
            }
        }

        // If we have no new tasks, check if we should start a new round
        if (oldestTaskByBuyer.size === 0) {
            // Check if we have any unprocessed tasks in the current round
            const hasUnprocessedTasks = Array.from(roundState.roundTasks.entries())
                .some(([buyerId, taskIds]) => 
                    taskIds.some(taskId => !roundState.processedTaskIds.includes(taskId))
                );

            if (!hasUnprocessedTasks) {
                // Start a new round
                roundState.processedTaskIds = [];
                roundState.roundTasks = new Map();
                roundState.roundStartTime = now;
                await roundState.save();
                console.log('[pooledBuyerTasks.keyboard] Started a new round.');
                // Recursively call to process the new round
                return refreshPool();
            }
            
            // If we have unprocessed tasks, continue with the current round
            console.log('[pooledBuyerTasks.keyboard] No new tasks found, continuing with current round.');
        } else {
            // Update round state with new tasks
            const newRoundTasks = new Map(roundState.roundTasks);
            const tasksToAdd = [];

            for (const [buyerId, task] of oldestTaskByBuyer.entries()) {
                const taskId = task._id.toString();
                
                // Add task to buyer's task list if not already there
                if (!newRoundTasks.has(buyerId)) {
                    newRoundTasks.set(buyerId, []);
                }
                
                if (!newRoundTasks.get(buyerId).includes(taskId)) {
                    newRoundTasks.get(buyerId).push(taskId);
                    tasksToAdd.push(task);
                }
            }

            // Only update if we have new tasks
            if (tasksToAdd.length > 0) {
                roundState.roundTasks = newRoundTasks;
                await roundState.save();
            }
        }

        // Build current pool from unprocessed tasks in round state
        const poolTasks = [];
        for (const [buyerId, taskIds] of roundState.roundTasks.entries()) {
            for (const taskId of taskIds) {
                if (!roundState.processedTaskIds.includes(taskId)) {
                    const task = allActiveTasks.find(t => t._id.toString() === taskId);
                    if (task) {
                        poolTasks.push(task);
                    } else {
                        // If task is not active anymore, mark it as processed
                        roundState.processedTaskIds.push(taskId);
                    }
                }
            }
        }

        currentPool = poolTasks;
        console.log(`[pooledBuyerTasks.keyboard] Pool refreshed. Found ${currentPool.length} tasks in current round.`);

        // Save any changes to processed tasks
        if (roundState.isModified()) {
            await roundState.save();
        }
    } catch (error) {
        console.error('[pooledBuyerTasks.keyboard] Error refreshing pool with RoundState:', error);
        currentPool = [];
    }
}

/**
 * Generates the inline keyboard with pooled tasks.
 * Refreshes the pool if it's empty.
 */
const getKeyboard = async (isRetry = false) => {
    // If pool is empty, try to refresh it
    if (currentPool.length === 0) {
        await refreshPool();
        // If still no tasks, show exit button
        if (currentPool.length === 0) {
            return Markup.inlineKeyboard([
                [Markup.button.callback('Выйти', 'back')]
            ]);
        }
    }

    // Get fresh task states from database
    const availableTasks = [];
    const tasksToRemove = [];
    
    // Process tasks in parallel for better performance
    await Promise.all(currentPool.map(async (task) => {
        try {
            const freshTask = await taskService.findTaskById(task._id);
            if (freshTask && freshTask.state === 'active') {
                availableTasks.push(freshTask);
            } else {
                tasksToRemove.push(task._id.toString());
            }
        } catch (error) {
            console.error(`[pooledBuyerTasks.keyboard] Error checking task ${task._id}:`, error);
            tasksToRemove.push(task._id.toString());
        }
    }));

    // Remove tasks that are no longer active
    if (tasksToRemove.length > 0) {
        currentPool = currentPool.filter(task => !tasksToRemove.includes(task._id.toString()));
        // Mark these tasks as processed in the database
        await markTasksAsProcessed(tasksToRemove);
    }

    // If no tasks available after refresh, try once more or show exit
    if (availableTasks.length === 0) {
        if (isRetry) {
            return Markup.inlineKeyboard([
                [Markup.button.callback('Выйти', 'back')]
            ]);
        }
        await refreshPool();
        return getKeyboard(true);
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
 * Updates the RoundState to mark the task as processed.
 * @param {string} taskId - The ID of the task selected.
 */
const markTaskAsSelectedFromPool = async (taskId) => {
    try {
        const roundState = await RoundState.findOne({ key: ROUND_STATE_KEY });
        if (!roundState) {
            console.error('[pooledBuyerTasks.keyboard] No round state found when marking task as processed');
            return;
        }

        // Add to processed tasks if not already there
        if (!roundState.processedTaskIds.includes(taskId)) {
            roundState.processedTaskIds.push(taskId);
            await roundState.save();
            console.log(`[pooledBuyerTasks.keyboard] Task ${taskId} marked as processed in RoundState.`);
        }

        // Also remove from current pool to prevent double processing
        currentPool = currentPool.filter(task => task._id.toString() !== taskId);
    } catch (error) {
        console.error(`[pooledBuyerTasks.keyboard] Error marking task ${taskId} as processed:`, error);
    }
};

/**
 * Marks multiple tasks as processed in the current round
 * @param {string[]} taskIds - Array of task IDs to mark as processed
 */
async function markTasksAsProcessed(taskIds) {
    try {
        const roundState = await RoundState.findOne({ key: ROUND_STATE_KEY });
        if (!roundState) return;

        // Add new task IDs to processed list, avoiding duplicates
        const newProcessed = [...new Set([...roundState.processedTaskIds, ...taskIds])];
        
        // Only update if there are new tasks to add
        if (newProcessed.length > roundState.processedTaskIds.length) {
            roundState.processedTaskIds = newProcessed;
            await roundState.save();
            console.log(`[pooledBuyerTasks.keyboard] Marked ${taskIds.length} tasks as processed`);
        }
    } catch (error) {
        console.error('[pooledBuyerTasks.keyboard] Error marking tasks as processed:', error);
    }
}

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
