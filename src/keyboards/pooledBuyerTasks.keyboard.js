const { Markup } = require('telegraf');
const taskService = require('../services/task.service');
const RoundState = require('../databases/roundState.model');
const Task = require('../databases/task.model');

// Global variable to store the current pool of tasks
let currentPool = []; // Current task pool (not cached between requests)
const ROUND_STATE_KEY = 'taskPoolRounds'; // Key for storing round state in DB

/**
 * Refreshes the task pool using RoundState for managing rounds.
 * Fetches active buyers and their oldest active task, maintaining rounds in the database.
 */
async function refreshPool() {
    console.log('[pooledBuyerTasks.keyboard] Refreshing task pool with RoundState...');
    
    try {
        // Get or create round state
        let roundState = await RoundState.findOne({ key: ROUND_STATE_KEY });
        const now = new Date();

        if (!roundState) {
            // Create new round state if it doesn't exist
            roundState = new RoundState({
                key: ROUND_STATE_KEY,
                roundStartTime: now,
                roundTasks: {},
                processedTaskIds: []
            });
            await roundState.save();
        }
        
        // Early cleanup: if there are tasks with state 'canceled' or 'wait' in the current round,
        // remove them from the current round and add their IDs to processedTaskIds
        try {
            // Ensure structures are valid types
            if (!roundState.roundTasks || typeof roundState.roundTasks !== 'object') {
                roundState.roundTasks = {};
            } else if (typeof roundState.roundTasks === 'string') {
                try {
                    roundState.roundTasks = JSON.parse(roundState.roundTasks);
                } catch (e) {
                    console.error('[pooledBuyerTasks.keyboard] Error parsing roundTasks during early cleanup:', e);
                    roundState.roundTasks = {};
                }
            }

            roundState.processedTaskIds = Array.isArray(roundState.processedTaskIds) ? roundState.processedTaskIds : [];

            // Collect all unprocessed task IDs from the current round
            const unprocessedIds = [];
            for (const [buyerId, taskIds] of Object.entries(roundState.roundTasks)) {
                if (!Array.isArray(taskIds)) continue;
                for (const tId of taskIds) {
                    const idStr = String(tId);
                    if (!roundState.processedTaskIds.includes(idStr)) {
                        unprocessedIds.push(idStr);
                    }
                }
            }

            if (unprocessedIds.length > 0) {
                const tasksNeedingCleanup = await Task.find({
                    _id: { $in: unprocessedIds },
                    state: { $in: ['canceled', 'wait'] }
                }, { _id: 1 }).lean();

                if (tasksNeedingCleanup && tasksNeedingCleanup.length > 0) {
                    const cleanupIdSet = new Set(tasksNeedingCleanup.map(t => String(t._id)));

                    // Add to processedTaskIds (avoid duplicates)
                    const processedSet = new Set(roundState.processedTaskIds);
                    for (const id of cleanupIdSet) processedSet.add(id);
                    roundState.processedTaskIds = Array.from(processedSet);

                    // Remove from roundTasks
                    let modifiedRoundTasks = false;
                    for (const [buyerId, taskIds] of Object.entries(roundState.roundTasks)) {
                        if (!Array.isArray(taskIds)) continue;
                        const filtered = taskIds.filter(id => !cleanupIdSet.has(String(id)));
                        if (filtered.length !== taskIds.length) {
                            modifiedRoundTasks = true;
                            if (filtered.length === 0) {
                                delete roundState.roundTasks[buyerId];
                            } else {
                                roundState.roundTasks[buyerId] = filtered.map(String);
                            }
                        }
                    }

                    await roundState.save();
                    if (cleanupIdSet.size > 0) {
                        console.log(`[pooledBuyerTasks.keyboard] Early cleanup: removed ${cleanupIdSet.size} tasks with state canceled/wait from current round`);
                    }
                }
            }
        } catch (cleanupErr) {
            console.error('[pooledBuyerTasks.keyboard] Error during early cleanup for canceled/wait tasks:', cleanupErr);
        }
        
        // Always clear the current pool to force refresh
        currentPool = [];

        // Get all active tasks
        const allActiveTasks = await taskService.getTasksActive();
        if (!allActiveTasks || allActiveTasks.length === 0) {
            console.log('[pooledBuyerTasks.keyboard] No active tasks found in the system.');
            return;
        }

        // Find oldest task per buyer, but only if they don't have active tasks already
        const oldestTaskByBuyer = new Map();
        const buyersWithActiveTasks = new Set();
        
        // First, identify buyers who already have active tasks in the current round
        for (const [buyerId, taskIds] of Object.entries(roundState.roundTasks || {})) {
            const hasActiveTask = taskIds.some(taskId => 
                !roundState.processedTaskIds.includes(taskId)
            );
            if (hasActiveTask) {
                buyersWithActiveTasks.add(buyerId);
            }
        }

        // Then find the oldest unprocessed task for each buyer who doesn't have active tasks
        for (const task of allActiveTasks) {
            if (task?.buyer?._id) {
                const buyerId = task.buyer._id.toString();
                const taskId = task._id.toString();
                
                // Skip if this task is already processed in the current round
                // or if buyer already has active tasks
                if (roundState.processedTaskIds.includes(taskId) || 
                    buyersWithActiveTasks.has(buyerId)) {
                    continue;
                }

                // Track oldest task per buyer
                if (!oldestTaskByBuyer.has(buyerId) || 
                    new Date(task.createdAt) < new Date(oldestTaskByBuyer.get(buyerId).createdAt)) {
                    oldestTaskByBuyer.set(buyerId, task);
                }
            }
        }

        // Check if we have any unprocessed tasks in the current round
        const hasUnprocessedTasks = Object.entries(roundState.roundTasks || {})
            .some(([buyerId, taskIds]) => 
                taskIds.some(taskId => !roundState.processedTaskIds.includes(taskId))
            );

        // If there are unprocessed tasks, don't start a new round
        if (hasUnprocessedTasks) {
            console.log('[pooledBuyerTasks.keyboard] Unprocessed tasks found in current round, not starting new round');
            
            // Check if any of the unprocessed tasks are still active
            const unprocessedTasks = [];
            for (const [buyerId, taskIds] of Object.entries(roundState.roundTasks || {})) {
                for (const taskId of taskIds) {
                    const taskIdStr = String(taskId);
                    if (!roundState.processedTaskIds.includes(taskIdStr)) {
                        unprocessedTasks.push(taskIdStr);
                    }
                }
            }
            
            // Check if any unprocessed tasks are still active
            const activeUnprocessedTasks = await taskService.getTasksActive({
                _id: { $in: unprocessedTasks },
                state: 'active'
            });
            
            // If there are still active unprocessed tasks, don't start a new round
            if (activeUnprocessedTasks && activeUnprocessedTasks.length > 0) {
                console.log(`[pooledBuyerTasks.keyboard] Found ${activeUnprocessedTasks.length} active unprocessed tasks, not starting new round`);
                // Update current pool with active unprocessed tasks
                currentPool = activeUnprocessedTasks;
                return;
            } else {
                console.log('[pooledBuyerTasks.keyboard] ✨ No active unprocessed tasks found, STARTING NEW ROUND');
                
                // Clear round state to start fresh
                roundState.processedTaskIds = [];
                roundState.roundTasks = {};
                roundState.roundStartTime = now;
                await roundState.save();
                
                // Notify creators about new round
                try {
                    console.log('[pooledBuyerTasks.keyboard] 📢 Sending notifications to creators...');
                    const notificationService = require('../services/notification.service');
                    await notificationService.notifyCreatorsNewRound();
                    console.log('[pooledBuyerTasks.keyboard] ✅ Notifications sent successfully');
                } catch (notifyErr) {
                    console.error('[pooledBuyerTasks.keyboard] ❌ Failed to notify about new round:', notifyErr);
                }
            }
        }

        // If we have no new tasks, check if we should start a new round
        if (oldestTaskByBuyer.size === 0) {
            // Get all unprocessed task IDs from current round
            const unprocessedTaskIds = [];
            for (const [buyerId, taskIds] of Object.entries(roundState.roundTasks || {})) {
                for (const taskId of taskIds) {
                    const taskIdStr = String(taskId);
                    if (!roundState.processedTaskIds.includes(taskIdStr)) {
                        unprocessedTaskIds.push(taskIdStr);
                    }
                }
            }

            // Check if any unprocessed tasks are still active
            const activeUnprocessedTasks = unprocessedTaskIds.length > 0 ? 
                await taskService.getTasksActive({
                    _id: { $in: unprocessedTaskIds },
                    state: 'active'
                }) : [];

            // Only start a new round if there are no active unprocessed tasks
            if (activeUnprocessedTasks.length === 0) {
                console.log('[pooledBuyerTasks.keyboard] ✨ No active unprocessed tasks, STARTING NEW ROUND');
                roundState.processedTaskIds = [];
                roundState.roundTasks = {};
                roundState.roundStartTime = now;
                await roundState.save();
                
                // Notify creators about new round
                try {
                    console.log('[pooledBuyerTasks.keyboard] 📢 Sending notifications to creators...');
                    const notificationService = require('../services/notification.service');
                    await notificationService.notifyCreatorsNewRound();
                    console.log('[pooledBuyerTasks.keyboard] ✅ Notifications sent successfully');
                } catch (notifyErr) {
                    console.error('[pooledBuyerTasks.keyboard] ❌ Failed to notify about new round:', notifyErr);
                }
                
                return refreshPool();
            } else {
                console.log(`[pooledBuyerTasks.keyboard] Found ${activeUnprocessedTasks.length} active unprocessed tasks, not starting new round`);
                // Update current pool with active unprocessed tasks
                currentPool = activeUnprocessedTasks;
                return;
            }
        } else {
            // Update round state with new tasks
            const newRoundTasks = { ...roundState.roundTasks };
            const tasksToAdd = [];

            for (const [buyerId, task] of oldestTaskByBuyer.entries()) {
                const taskId = task._id.toString();
                
                // Add task to buyer's task list if not already there
                if (!newRoundTasks[buyerId]) {
                    newRoundTasks[buyerId] = [];
                }
                
                if (!newRoundTasks[buyerId].includes(taskId)) {
                    newRoundTasks[buyerId].push(taskId);
                    tasksToAdd.push(task);
                }
            }

            // Only update if we have new tasks and no active tasks in current round
            if (tasksToAdd.length > 0) {
                // Convert object back to plain object for storage
                roundState.roundTasks = newRoundTasks;
                await roundState.save();
            }
        }

        // Ensure roundTasks is an object
        if (!roundState.roundTasks || typeof roundState.roundTasks !== 'object') {
            roundState.roundTasks = {};
        } else if (typeof roundState.roundTasks === 'string') {
            try {
                // If it's a string, try to parse it
                roundState.roundTasks = JSON.parse(roundState.roundTasks);
            } catch (e) {
                console.error('[pooledBuyerTasks.keyboard] Error parsing roundTasks:', e);
                roundState.roundTasks = {};
            }
        }

        // Ensure all values in the object are arrays of strings
        const validRoundTasks = {};
        for (const [key, value] of Object.entries(roundState.roundTasks)) {
            if (Array.isArray(value)) {
                validRoundTasks[key] = value.map(String);
            } else if (value) {
                // If it's a single value, wrap it in an array
                validRoundTasks[key] = [String(value)];
            }
        }
        roundState.roundTasks = validRoundTasks;

        // Build current pool from unprocessed tasks in round state
        const poolTasks = [];
        const processedTaskIdsSet = new Set(roundState.processedTaskIds || []);
        
        // First, collect all unprocessed task IDs from round state
        const unprocessedTaskIds = [];
        for (const [buyerId, taskIds] of Object.entries(roundState.roundTasks || {})) {
            for (const taskId of taskIds) {
                const taskIdStr = String(taskId);
                if (!processedTaskIdsSet.has(taskIdStr)) {
                    unprocessedTaskIds.push(taskIdStr);
                }
            }
        }
        
        // If we have unprocessed tasks, verify they are still active
        if (unprocessedTaskIds.length > 0) {
            const activeTasks = await taskService.getTasksActive({
                _id: { $in: unprocessedTaskIds },
                state: 'active'
            });
            
            // Create a map of active task IDs for quick lookup
            const activeTaskIds = new Set(activeTasks.map(t => t._id.toString()));
            
            // Update processed tasks - mark any unprocessed but inactive tasks as processed
            const tasksToMarkAsProcessed = unprocessedTaskIds.filter(
                taskId => !activeTaskIds.has(taskId)
            );
            
            if (tasksToMarkAsProcessed.length > 0) {
                console.log(`[pooledBuyerTasks.keyboard] Marking ${tasksToMarkAsProcessed.length} inactive tasks as processed`);
                roundState.processedTaskIds = [
                    ...(roundState.processedTaskIds || []),
                    ...tasksToMarkAsProcessed
                ];
                await roundState.save();
            }
            
            // Add active tasks to the pool
            poolTasks.push(...activeTasks);
        }

        currentPool = poolTasks;
        console.log(`[pooledBuyerTasks.keyboard] Pool refreshed. Found ${currentPool.length} tasks in current round.`);

        // Save any changes to processed tasks and round state
        if (roundState.isModified()) {
            try {
                await roundState.save();
            } catch (saveError) {
                console.error('[pooledBuyerTasks.keyboard] Error saving round state:', saveError);
                // If save fails, try to reset the round state
                roundState.roundTasks = new Map();
                await roundState.save();
            }
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
    // Get current round state first
    let roundState = await RoundState.findOne({ key: ROUND_STATE_KEY });
    
    // If no round state, create a new one
    if (!roundState) {
        roundState = new RoundState({
            key: ROUND_STATE_KEY,
            roundStartTime: new Date(),
            roundTasks: {},
            processedTaskIds: []
        });
        await roundState.save();
    }
    
    // Always refresh the pool to get the latest tasks
    await refreshPool();
    
    // Get fresh list of active tasks
    const allActiveTasks = await taskService.getTasksActive();
    if (!allActiveTasks || allActiveTasks.length === 0) {
        return Markup.inlineKeyboard([
            [Markup.button.callback('Нет доступных задач. Нажмите для обновления', 'refresh_tasks')],
            [Markup.button.callback('Выйти', 'back')]
        ]);
    }
    
    // Build current pool from unprocessed tasks in round state
    const availableTasks = [];
    const tasksToMarkAsProcessed = []; // Задачи, которые не найдены и нужно пометить как обработанные
    
    if (roundState.roundTasks) {
        for (const [buyerId, taskIds] of Object.entries(roundState.roundTasks)) {
            for (const taskId of taskIds) {
                const taskIdStr = String(taskId);
                if (!roundState.processedTaskIds?.includes(taskIdStr)) {
                    const task = allActiveTasks.find(t => t._id && t._id.toString() === taskIdStr);
                    if (task) {
                        availableTasks.push(task);
                    } else {
                        // Задача не найдена в активных - помечаем как обработанную
                        console.log(`[pooledBuyerTasks.keyboard] Task ${taskIdStr} not found in active tasks, marking as processed`);
                        tasksToMarkAsProcessed.push(taskIdStr);
                    }
                }
            }
        }
    }
    
    // Помечаем ненайденные задачи как обработанные
    if (tasksToMarkAsProcessed.length > 0) {
        console.log(`[pooledBuyerTasks.keyboard] Marking ${tasksToMarkAsProcessed.length} missing tasks as processed`);
        await markTasksAsProcessed(tasksToMarkAsProcessed);
    }
    
    // Update current pool
    currentPool = availableTasks;
    
    // If no tasks available, show message
    if (availableTasks.length === 0) {
        return Markup.inlineKeyboard([
            [Markup.button.callback('Нет доступных задач. Нажмите для обновления', 'refresh_tasks')],
            [Markup.button.callback('Выйти', 'back')]
        ]);
    }

    // Verify tasks are still active
    const tasksToRemove = [];
    
    // Process tasks in parallel for better performance
    await Promise.all(availableTasks.map(async (task) => {
        try {
            const freshTask = await taskService.findTaskById(task._id);
            if (!freshTask || freshTask.state !== 'active') {
                tasksToRemove.push(task._id.toString());
            }
        } catch (error) {
            console.error(`[pooledBuyerTasks.keyboard] Error checking task ${task._id}:`, error);
            tasksToRemove.push(task._id.toString());
        }
    }));

    // Remove tasks that are no longer active
    if (tasksToRemove.length > 0) {
        currentPool = availableTasks.filter(task => !tasksToRemove.includes(task._id.toString()));
        // Mark these tasks as processed in the database
        await markTasksAsProcessed(tasksToRemove);
    }

    // If no tasks available after refresh, show message
    if (currentPool.length === 0) {
        if (isRetry) {
            return Markup.inlineKeyboard([
                [Markup.button.callback('Нет доступных задач. Нажмите для обновления', 'refresh_tasks')],
                [Markup.button.callback('Выйти', 'back')]
            ]);
        }
        await refreshPool();
        return getKeyboard(true);
    }

    const buttons = currentPool.map(task => {
        const taskDisplayName = task.name && task.name.length > 25 ? task.name.substring(0, 22) + "..." : (task.name || 'Без имени');
        return [Markup.button.callback(`${taskDisplayName}`, `${task._id.toString()}`)];
    });

    // Add refresh and exit buttons
    buttons.push([Markup.button.callback('Обновить', 'refresh_tasks')]);
    buttons.push([Markup.button.callback('Выйти', 'back')]);

    return Markup.inlineKeyboard(buttons);
};

/**
 * Marks a task as selected from the current pool.
 * Note: Tasks are no longer automatically marked as processed here.
 * They will be marked as processed when their state changes (e.g., to 'progress' or 'done').
 * @param {string|object} taskIdOrCtx - The ID of the task selected or the context object
 * @param {string} [taskIdParam] - Optional task ID if first param is context
 * @returns {Promise<string>} The task ID that was selected
 */
const markTaskAsSelectedFromPool = async (taskIdOrCtx, taskIdParam) => {
    let taskId;
    
    // Handle both direct taskId call and context object call
    if (typeof taskIdOrCtx === 'string' || taskIdOrCtx instanceof String) {
        taskId = taskIdOrCtx;
    } else if (taskIdOrCtx && taskIdParam) {
        // If first param is context and second is taskId
        taskId = taskIdParam;
    } else if (taskIdOrCtx && taskIdOrCtx.match && typeof taskIdOrCtx.match === 'function') {
        // If first param is context with match array (from regex handler)
        taskId = taskIdOrCtx.match[0];
    } else {
        console.error('[pooledBuyerTasks.keyboard] Invalid parameters passed to markTaskAsSelectedFromPool');
        return null;
    }

    // No longer marking tasks as processed here
    console.log(`[pooledBuyerTasks.keyboard] Task ${taskId} selected but not marked as processed`);
    return taskId;
};

/**
 * Marks multiple tasks as processed in the current round
 * @param {string[]} taskIds - Array of task IDs to mark as processed
 */
async function markTasksAsProcessed(taskIds) {
    if (!Array.isArray(taskIds) || taskIds.length === 0) return;

    try {
        const roundState = await RoundState.findOne({ key: ROUND_STATE_KEY });
        if (!roundState) return;

        // Ensure roundTasks is an object
        if (typeof roundState.roundTasks === 'string') {
            try {
                roundState.roundTasks = JSON.parse(roundState.roundTasks);
            } catch (e) {
                console.error('[pooledBuyerTasks.keyboard] Error parsing roundTasks:', e);
                roundState.roundTasks = {};
            }
        } else if (!roundState.roundTasks || typeof roundState.roundTasks !== 'object') {
            roundState.roundTasks = {};
        }

        // Convert taskIds to strings for comparison
        const taskIdStrs = taskIds.map(String);
        let modified = false;

        // Mark tasks as processed
        for (const taskId of taskIdStrs) {
            if (!roundState.processedTaskIds.includes(taskId)) {
                roundState.processedTaskIds.push(taskId);
                modified = true;
            }
        }

        // Clean up roundTasks by removing processed tasks
        for (const [buyerId, buyerTaskIds] of Object.entries(roundState.roundTasks)) {
            if (Array.isArray(buyerTaskIds)) {
                const filteredTasks = buyerTaskIds.filter(id => !taskIdStrs.includes(id));
                if (filteredTasks.length !== buyerTaskIds.length) {
                    if (filteredTasks.length === 0) {
                        delete roundState.roundTasks[buyerId];
                    } else {
                        roundState.roundTasks[buyerId] = filteredTasks;
                    }
                    modified = true;
                }
            }
        }

        // Save only if there were changes
        if (modified) {
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
