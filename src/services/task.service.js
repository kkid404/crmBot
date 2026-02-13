const mongoose = require('mongoose');
const Task = require('../databases/task.model');
const RoundState = require('../databases/roundState.model');
const notificationService = require('./notification.service');

class TaskService {
    static processedBuyersInCurrentRound = new Set();
    // Создание новой задачи
    static async createTask(data) {
        try {
            const task = new Task(data);
            return await task.save();
        } catch (error) {
            throw new Error(`Ошибка создания задачи: ${error.message}`);
        }
    }

    // Поиск задачи по ID
    static async findTaskById(taskId) {
        try {
            return await Task.findById(taskId)
                .populate('buyer')
                .populate('creator')
                .populate('createdBy')
                .populate('moderationLockedBy');
        } catch (error) {
            throw new Error(`Ошибка поиска задачи: ${error.message}`);
        }
    }

    // Обновление задачи
    static async updateTask(taskId, updates) {
        try {
            // Get the current task to check state changes
            const currentTask = await Task.findById(taskId);
            const isStateChanging = updates.state && currentTask && updates.state !== currentTask.state;
            
            // Update the task
            const updatedTask = await Task.findByIdAndUpdate(
                taskId, 
                updates, 
                { new: true }
            ).populate('buyer').populate('creator').populate('createdBy');
            
            // If state changed to 'progress', 'done', or 'canceled', update round state
            if (isStateChanging && (updates.state === 'progress' || updates.state === 'done' || updates.state === 'canceled')) {
                const roundState = await RoundState.findOne({ key: 'taskPoolRounds' });
                if (roundState) {
                    const taskIdStr = taskId.toString();
                    
                    // Use atomic operations to update the round state
                    const updateOps = {};
                    
                    // Add task to processedTaskIds if not already there
                    if (!roundState.processedTaskIds.includes(taskIdStr)) {
                        updateOps.$addToSet = { processedTaskIds: taskIdStr };
                    }
                    
                    // Remove task from roundTasks
                    for (const [buyerId, taskIds] of Object.entries(roundState.roundTasks || {})) {
                        if (Array.isArray(taskIds) && taskIds.includes(taskIdStr)) {
                            // Initialize $pull if not exists
                            if (!updateOps.$pull) updateOps.$pull = {};
                            
                            // Add pull operation for this task
                            updateOps.$pull[`roundTasks.${buyerId}`] = taskIdStr;
                            
                            // If this was the last task for this buyer, add unset operation
                            if (taskIds.length === 1) {
                                if (!updateOps.$unset) updateOps.$unset = {};
                                updateOps.$unset[`roundTasks.${buyerId}`] = "";
                                
                                // Also remove from processedTaskIds for this buyer
                                updateOps.$pull[`roundTasks.${buyerId}`] = { $exists: true };
                            }
                        }
                    }
                    
                    // Only update if there are operations to perform
                    if (Object.keys(updateOps).length > 0) {
                        await RoundState.updateOne(
                            { key: 'taskPoolRounds', _id: roundState._id },
                            updateOps
                        );
                        console.log(`[TaskService] Task ${taskId} marked as processed in round state`);
                        
                        // If task was canceled, try to add a new task from the same buyer
                        if (updates.state === 'canceled' && currentTask && currentTask.buyer) {
                            await this.addNewTaskFromSameBuyer(currentTask.buyer, roundState);
                        }
                    }
                }
            }
            
            return updatedTask;
        } catch (error) {
            console.error('Error in updateTask:', error);
            throw new Error(`Ошибка обновления задачи: ${error.message}`);
        }
    }

    // Удаление задачи
    static async deleteTask(taskId) {
        try {
            return await Task.findByIdAndDelete(taskId);
        } catch (error) {
            throw new Error(`Ошибка удаления задачи: ${error.message}`);
        }
    }

    // Получение всех задач с фильтрацией по статусу
    static async getTasksByState(state) {
        try {
            return await Task.find(state ? { state } : {}).populate('buyer').populate('creator');
        } catch (error) {
            throw new Error(`Ошибка получения задач: ${error.message}`);
        }
    }

    // Получение задач, связанных с пользователем
    static async getUserTasks(userId, role = '', state) {
        try {
            const query = {};

            // Добавляем фильтр по статусу, если он указан
            if (state) {
                // Для креативщиков включаем задачи со state=time вместе с другими статусами
                if (role === 'creator' && state === 'progress') {
                    query.state = { $in: ['progress', 'time'] };
                } else if (role === 'buyer' && state === 'progress') {
                    // Для баеров в разделе "В работе" показываем также задачи на проверке
                    // чтобы ТЗ не исчезало из списка при сдаче на модерацию
                    query.state = { $in: ['progress', 'wait'] };
                } else {
                    query.state = state;
                }
            }

            // Фильтруем по роли, если она указана
            if (role) {
                if (role === 'buyer') {
                    // Для баеров показываем задачи где они являются buyer ИЛИ createdBy
                    query.$or = [
                        { buyer: userId },
                        { createdBy: userId }
                    ];
                } else if (role === 'creator') {
                    query.creator = userId;
                } else {
                    throw new Error('Указана неверная роль. Допустимые значения: "creator", "buyer".');
                }
            }

            // Выполняем поиск задач
            return await Task.find(query).populate('buyer').populate('createdBy').populate('creator').lean();
        } catch (error) {
            throw new Error(`Ошибка получения задач для пользователя: ${error.message}`);
        }
    }


    static async getAll() {
        return Task.find({})
    }

    // Метод для поиска записей за сегодняшний день
    static async getTaskToday() {
        const now = new Date();

        const startOfDay = new Date(now.setHours(0, 0, 0, 0));

        const endOfDay = new Date(now.setHours(23, 59, 59, 999));

        return Task.find({
            createdAt: {
                $gte: startOfDay,
                $lte: endOfDay,
            }
        });
    }

    static async getTasksActive() {
        try {
            // Находим все задачи со статусом "active" в интервале от 4 дней назад до сегодняшнего дня
            return await Task.find({
                state: 'active'  // Статус "active"
            }).populate('buyer').populate('creator');
        } catch (error) {
            throw new Error(`Ошибка получения задач: ${error.message}`);
        }
    }

    static async updateTaskVersion(taskId) {
        const task = await Task.findById(taskId);
        if (task) {
            task.version = 1;
            await task.save();
        }
    }

    // Метод для подсчета уникальных креативов (с префиксом U_)
    static async getUniqCount() {
        try {
            const count = await Task.countDocuments({ name: { $regex: "^U_" } });
            return count;
        } catch (error) {
            throw new Error(`Ошибка при подсчете уникальных креативов: ${error.message}`);
        }
    }

    // Метод для подсчета количества уникальных креативов для конкретного базового имени задачи
    static async getTaskSpecificUniqCount(baseName) {
        try {
            const pattern = `^${baseName}_U_`;
            const tasks = await Task.find({ name: { $regex: pattern } }, { name: 1 });
            
            // Находим максимальный номер среди существующих задач
            let maxNumber = 0;
            tasks.forEach(task => {
                // Извлекаем номер из имени (после _U_)
                const match = task.name.match(/_U_([0-9]+)$/);
                if (match) {
                    const number = parseInt(match[1], 10);
                    if (number > maxNumber) {
                        maxNumber = number;
                    }
                }
            });
            
            return maxNumber;
        } catch (error) {
            throw new Error(`Ошибка при подсчете уникальных креативов для задачи ${baseName}: ${error.message}`);
        }
    }

    // Метод для подсчета глубоких уникальных креативов (с префиксом DU_)
    static async getDeepUniqCount() {
        try {
            const count = await Task.countDocuments({ name: { $regex: "^DU_" } });
            return count;
        } catch (error) {
            throw new Error(`Ошибка при подсчете глубоких уникальных креативов: ${error.message}`);
        }
    }

    // Метод для подсчета количества глубоких уникальных креативов для конкретного базового имени задачи
    static async getTaskSpecificDeepUniqCount(baseName) {
        try {
            const pattern = `^DU_${baseName}_`;
            const tasks = await Task.find({ name: { $regex: pattern } }, { name: 1 });
            
            // Находим максимальный номер среди существующих задач
            let maxNumber = 0;
            tasks.forEach(task => {
                // Извлекаем номер из имени (последнее число после последнего подчеркивания)
                const match = task.name.match(/_([0-9]+)$/);
                if (match) {
                    const number = parseInt(match[1], 10);
                    if (number > maxNumber) {
                        maxNumber = number;
                    }
                }
            });
            
            return maxNumber;
        } catch (error) {
            throw new Error(`Ошибка при подсчете глубоких уникальных креативов для задачи ${baseName}: ${error.message}`);
        }
    }

    static async getAdaptivCount() {
        try {
            const count = await Task.countDocuments({ name: { $regex: "^A_" } });
            return count;
        } catch (error) {
            throw new Error(`Ошибка при подсчете адаптивных креативов: ${error.message}`);
        }
    }

    // Метод для подсчета количества адаптивных креативов для конкретного базового имени задачи
    static async getTaskSpecificAdaptivCount(baseName) {
        try {
            const pattern = `^${baseName}_A_`;
            const tasks = await Task.find({ name: { $regex: pattern } }, { name: 1 });
            
            // Находим максимальный номер среди существующих задач
            let maxNumber = 0;
            tasks.forEach(task => {
                // Извлекаем номер из имени (после _A_)
                const match = task.name.match(/_A_([0-9]+)$/);
                if (match) {
                    const number = parseInt(match[1], 10);
                    if (number > maxNumber) {
                        maxNumber = number;
                    }
                }
            });
            
            return maxNumber;
        } catch (error) {
            throw new Error(`Ошибка при подсчете адаптивных креативов для задачи ${baseName}: ${error.message}`);
        }
    }

   /**
 * Метод для автоматического выбора задачи с чередованием баеров по круговой системе.
 * Каждый круг формируется по актуальным задачам на момент начала круга.
 * Новый круг начинается только когда все задачи текущего круга выданы.
 * @param {string} creatorId - ID креативщика (не используется, оставлено для совместимости)
 * @returns {Promise<Object|null>} Выбранная задача или null, если нет задач
 */
static async getAutoAssignedTask(creatorId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        let roundState = await RoundState.findOne({ key: 'autoAssignQueue' }).session(session);

        if (!roundState) {
            // Создаём новый документ, если его нет
            roundState = new RoundState({
                key: 'autoAssignQueue',
                roundStartTime: new Date(),
                roundTasks: {},
                processedTaskIds: []
            });
            await roundState.save();
        }

        // Если нет текущего круга или все задачи текущего круга выданы — формируем новый круг
        let needNewRound = false;
        if (!roundState.roundTasks || Object.keys(roundState.roundTasks).length === 0) {
            needNewRound = true;
        } else {
            const allTaskIds = Object.values(roundState.roundTasks).flat();
            const remaining = allTaskIds.filter(id => !roundState.processedTaskIds.includes(id));
            if (remaining.length === 0) needNewRound = true;
        }

        if (needNewRound) {
            // Берём все активные задачи
            const activeTasks = await Task.find({ state: 'active' }).populate('buyer').session(session);
            console.log(`[TaskService] Found ${activeTasks?.length || 0} active tasks for new round`);
            
            if (!activeTasks || activeTasks.length === 0) {
                // Нет задач для нового круга
                console.log('[TaskService] No active tasks found, clearing round state');
                roundState.roundTasks = {};
                roundState.processedTaskIds = [];
                await roundState.save({ session });
                await session.commitTransaction();
                return null;
            }

            // Группируем задачи по баерам
            const tasksByBuyer = {};
            for (const task of activeTasks) {
                console.log(`[TaskService] Task ${task._id}: buyer=${task.buyer?._id || 'NULL'}, name=${task.name}`);
                if (task?.buyer?._id) {
                    const buyerId = task.buyer._id.toString();
                    if (!tasksByBuyer[buyerId]) tasksByBuyer[buyerId] = [];
                    tasksByBuyer[buyerId].push(task._id.toString());
                } else {
                    console.log(`[TaskService] WARNING: Task ${task._id} (${task.name}) has no buyer or buyer._id!`);
                }
            }

            console.log(`[TaskService] Grouped tasks by buyer:`, JSON.stringify(tasksByBuyer, null, 2));
            console.log(`[TaskService] Total buyers in round: ${Object.keys(tasksByBuyer).length}`);
            
            roundState.roundTasks = tasksByBuyer;
            roundState.processedTaskIds = [];
            roundState.roundStartTime = new Date();
            await roundState.save({ session });

            // Оповестить креативщиков о новых заданиях в пуле
            try {
                // Вызов вне транзакции: сначала зафиксируем текущие изменения
                await session.commitTransaction();
                await notificationService.notifyCreatorsNewRound();
                // Начать новую транзакцию для дальнейшей логики выбора (если потребуется)
                session.startTransaction();
                // Перечитать roundState под новой транзакцией
                roundState = await RoundState.findOne({ key: 'autoAssignQueue' }).session(session);
            } catch (notifyErr) {
                console.error('[TaskService] Failed to notify creators about new round:', notifyErr);
            }
        }

        // Выбираем задачу для выдачи
        const allBuyerIds = Object.keys(roundState.roundTasks).sort();

        for (const buyerId of allBuyerIds) {
            const taskIds = roundState.roundTasks[buyerId];
            // Находим первую задачу, которая ещё не была выдана
            const nextTaskId = taskIds.find(id => !roundState.processedTaskIds.includes(id));
            if (nextTaskId) {
                // Получаем сам объект задачи
                const task = await Task.findById(nextTaskId).populate('buyer').session(session).lean();
                if (!task) continue; // на всякий случай, если задача удалена

                // Добавляем в processedTaskIds
                roundState.processedTaskIds.push(nextTaskId);
                await roundState.save({ session });
                await session.commitTransaction();
                return task;
            }
        }

        // Если дошли сюда — все задачи круга уже выданы, нужно будет новый круг на следующем вызове
        await session.commitTransaction();
        return null;

    } catch (error) {
        await session.abortTransaction();
        console.error('Ошибка при автоматическом выборе задачи:', error);
        return null;
    } finally {
        session.endSession();
    }
}

// ...

    // Метод для установки бонуса по умолчанию для задач без бонуса
    // Дополнительно: каждая 3-я задача на креативщика получает 3x defaultBonus (пример: 500, 500, 1500, 500, 500, 1500 ...)
    static async setDefaultBonus(defaultBonus = 500, timeFrame = 30) {
        try {
            // 1) Дата отсечения
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - timeFrame);

            // 2) Находим все подходящие задачи (старые, выполненные, без бонуса)
            const matchedTasks = await Task.find({
                state: 'done',
                bonus: null,
                completionDate: { $lt: cutoffDate }
            }, {
                _id: 1,
                creator: 1,
                completionDate: 1,
                createdAt: 1
            }).lean();

            if (!matchedTasks || matchedTasks.length === 0) {
                return {
                    success: true,
                    message: 'Подходящих задач без бонуса не найдено',
                    modifiedCount: 0,
                    matchedCount: 0
                };
            }

            // 3) Группируем по креативщику и сортируем по дате выполнения
            const byCreator = new Map(); // creatorId -> tasks[]
            for (const t of matchedTasks) {
                const creatorId = (t.creator && t.creator.toString) ? t.creator.toString() : String(t.creator);
                if (!byCreator.has(creatorId)) byCreator.set(creatorId, []);
                byCreator.get(creatorId).push(t);
            }
            for (const [creatorId, list] of byCreator) {
                list.sort((a, b) => {
                    const da = a.completionDate ? new Date(a.completionDate).getTime() : 0;
                    const db = b.completionDate ? new Date(b.completionDate).getTime() : 0;
                    if (da !== db) return da - db;
                    // стабильная сортировка по _id как запасной вариант
                    return String(a._id).localeCompare(String(b._id));
                });
            }

            // 4) Подсчитываем смещение (offset) для каждого креативщика, чтобы продолжить цикл
            //    Считаем количество уже "забонусенных" задач ДО даты отсечения
            const offsets = new Map(); // creatorId -> number
            const creatorIds = Array.from(byCreator.keys());
            if (creatorIds.length > 0) {
                const priorAgg = await Task.aggregate([
                    { $match: {
                        state: 'done',
                        bonus: { $ne: null },
                        completionDate: { $lt: cutoffDate },
                        creator: { $in: creatorIds.map(id => new mongoose.Types.ObjectId(id)) }
                    }},
                    { $group: { _id: '$creator', cnt: { $sum: 1 } } }
                ]);
                for (const row of priorAgg) {
                    offsets.set(String(row._id), row.cnt);
                }
                // для тех, кого нет в priorAgg — offset = 0
                for (const id of creatorIds) if (!offsets.has(id)) offsets.set(id, 0);
            }

            // 5) Формируем bulkWrite: каждый 3-й в последовательности получает 3x defaultBonus
            const ops = [];
            let totalModified = 0;
            for (const [creatorId, list] of byCreator) {
                let offset = offsets.get(creatorId) || 0;
                for (let i = 0; i < list.length; i++) {
                    const seqIndex = offset + (i + 1); // 1-based позиция в общей последовательности
                    const isThird = seqIndex % 3 === 0;
                    const amount = isThird ? defaultBonus * 3 : defaultBonus;
                    ops.push({
                        updateOne: {
                            filter: { _id: list[i]._id, bonus: null },
                            update: { $set: { bonus: amount, isPenaltyBonus: true } }
                        }
                    });
                    totalModified += 1;
                }
            }

            if (ops.length === 0) {
                return {
                    success: true,
                    message: 'Подходящих задач без бонуса не найдено',
                    modifiedCount: 0,
                    matchedCount: matchedTasks.length
                };
            }

            const bulkRes = await Task.bulkWrite(ops);
            const modifiedCount = bulkRes.modifiedCount || 0;

            return {
                success: true,
                message: `Штрафной бонус по умолчанию применён. Каждый 3-й = ${defaultBonus * 3}.`,
                modifiedCount,
                matchedCount: matchedTasks.length
            };
        } catch (error) {
            console.error('Ошибка при установке бонуса по умолчанию:', error);
            return {
                success: false,
                message: `Ошибка при установке бонуса: ${error.message}`,
                error: error
            };
        }
    }

    /**
     * Adds a new task from the same buyer when a task is canceled
     * @param {string|Object} buyer - The buyer ID or object
     * @param {Object} roundState - The current round state
     */
    static async addNewTaskFromSameBuyer(buyer, roundState) {
        try {
            const buyerId = buyer._id ? buyer._id.toString() : buyer.toString();
            
            // Check if buyer already has a task in the current round
            const buyerHasTask = roundState.roundTasks && 
                               roundState.roundTasks[buyerId] && 
                               roundState.roundTasks[buyerId].length > 0;
            
            if (buyerHasTask) {
                console.log(`[TaskService] Buyer ${buyerId} already has tasks in current round`);
                return;
            }
            
            // Find the oldest active task for this buyer that's not in processedTaskIds
            const newTask = await Task.findOne({
                'buyer': buyerId,
                'state': 'active',
                '_id': { $nin: roundState.processedTaskIds || [] }
            }).sort({ createdAt: 1 });
            
            if (newTask) {
                const newTaskId = newTask._id.toString();
                
                // Add the new task to roundTasks
                await RoundState.updateOne(
                    { key: 'taskPoolRounds', _id: roundState._id },
                    { 
                        $push: { 
                            [`roundTasks.${buyerId}`]: newTaskId 
                        } 
                    }
                );
                
                console.log(`[TaskService] Added new task ${newTaskId} from buyer ${buyerId} to round`);
            } else {
                console.log(`[TaskService] No active tasks found for buyer ${buyerId}`);
            }
        } catch (error) {
            console.error(`[TaskService] Error adding new task from buyer:`, error);
        }
    }

    static async assignTask(taskId, creatorId, expectedDate, expectedTime) {
        try {
            // First, find and update the task
            const updatedTask = await Task.findOneAndUpdate(
                {
                    _id: taskId,
                    // задача считается свободной, если ещё НЕ в progress
                    state: { $ne: 'progress' },
                    // а поле creator либо отсутствует, либо равно null
                    $or: [
                        { creator: null },
                        { creator: { $exists: false } }
                    ]
                },
                {
                    $set: {
                        state: 'progress',
                        creator: creatorId,
                        expectedDate: expectedDate,
                        expectedTime: expectedTime
                    }
                },
                { new: true }
            ).populate('buyer').populate('creator');

            if (!updatedTask) {
                return null;
            }

            // Mark the task as processed in the round state
            const roundState = await RoundState.findOne({ key: 'taskPoolRounds' });
            if (roundState) {
                const taskIdStr = taskId.toString();
                
                // Only update if not already processed
                if (!roundState.processedTaskIds.includes(taskIdStr)) {
                    // Use $addToSet to avoid duplicates
                    await RoundState.updateOne(
                        { key: 'taskPoolRounds', _id: roundState._id },
                        { 
                            $addToSet: { processedTaskIds: taskIdStr },
                            $unset: { 
                                [`roundTasks.${updatedTask.buyer?._id || 'unknown'}`]: "" 
                            }
                        }
                    );
                    console.log(`[TaskService] Task ${taskId} marked as processed in round state after assignment`);
                }
            }

            return updatedTask;
        } catch (error) {
            console.error('Error in assignTask:', error);
            throw new Error(`Ошибка назначения задачи: ${error.message}`);
        }
    }

    /**
     * Acquire moderation lock for a task.
     * Succeeds if task is not locked, lock expired, or already locked by same user.
     * @returns {Promise<Object|null>} updated task (with populated moderationLockedBy) or null if failed
     */
    static async acquireModerationLock(taskId, userId, ttlMinutes = 30) {
        try {
            const expireBefore = new Date(Date.now() - ttlMinutes * 60 * 1000);
            const updated = await Task.findOneAndUpdate(
                {
                    _id: taskId,
                    $or: [
                        { moderationLockedBy: null },
                        { moderationLockedAt: null },
                        { moderationLockedAt: { $lt: expireBefore } },
                        { moderationLockedBy: userId }
                    ]
                },
                {
                    $set: {
                        moderationLockedBy: userId,
                        moderationLockedAt: new Date()
                    }
                },
                { new: true }
            ).populate('buyer').populate('creator').populate('createdBy').populate('moderationLockedBy');
            return updated;
        } catch (error) {
            console.error('Error in acquireModerationLock:', error);
            return null;
        }
    }

    /**
     * Release moderation lock if held by the given user.
     */
    static async releaseModerationLock(taskId, userId) {
        try {
            const updated = await Task.findOneAndUpdate(
                { _id: taskId, moderationLockedBy: userId },
                { $set: { moderationLockedBy: null, moderationLockedAt: null } },
                { new: true }
            );
            return updated;
        } catch (error) {
            console.error('Error in releaseModerationLock:', error);
            return null;
        }
    }
}

module.exports = TaskService;

