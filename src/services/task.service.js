const mongoose = require('mongoose');
const Task = require('../databases/task.model');
const RoundState = require('../databases/roundState.model');

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
            return await Task.findById(taskId).populate('buyer').populate('creator');
        } catch (error) {
            throw new Error(`Ошибка поиска задачи: ${error.message}`);
        }
    }

    // Обновление задачи
    static async updateTask(taskId, updates) {
        const session = await mongoose.startSession();
        session.startTransaction();
        
        try {
            // Get the current task to check state changes
            const currentTask = await Task.findById(taskId).session(session);
            const isStateChanging = updates.state && updates.state !== currentTask.state;
            
            // Update the task
            const updatedTask = await Task.findByIdAndUpdate(
                taskId, 
                updates, 
                { new: true, session }
            ).populate('buyer').populate('creator');
            
            // If state changed to 'progress' or 'done', mark as processed in round state
            if (isStateChanging && (updates.state === 'progress' || updates.state === 'done')) {
                const roundState = await RoundState.findOne({ key: 'taskPoolRounds' }).session(session);
                if (roundState) {
                    const taskIdStr = taskId.toString();
                    
                    // Mark task as processed if not already
                    if (!roundState.processedTaskIds.includes(taskIdStr)) {
                        roundState.processedTaskIds.push(taskIdStr);
                        await roundState.save({ session });
                        console.log(`[TaskService] Task ${taskId} marked as processed in round state`);
                    }
                    
                    // Clean up roundTasks by removing the processed task
                    let modified = false;
                    for (const [buyerId, taskIds] of Object.entries(roundState.roundTasks || {})) {
                        if (Array.isArray(taskIds)) {
                            const filteredTasks = taskIds.filter(id => id !== taskIdStr);
                            if (filteredTasks.length !== taskIds.length) {
                                if (filteredTasks.length === 0) {
                                    delete roundState.roundTasks[buyerId];
                                } else {
                                    roundState.roundTasks[buyerId] = filteredTasks;
                                }
                                modified = true;
                            }
                        }
                    }
                    
                    if (modified) {
                        await roundState.save({ session });
                    }
                }
            }
            
            await session.commitTransaction();
            return updatedTask;
        } catch (error) {
            await session.abortTransaction();
            throw new Error(`Ошибка обновления задачи: ${error.message}`);
        } finally {
            session.endSession();
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
                query.state = state;
            }

            // Фильтруем по роли, если она указана
            if (role) {
                if (role === 'buyer') {
                    query.buyer = userId;
                } else if (role === 'creator') {
                    query.creator = userId;
                } else {
                    throw new Error('Указана неверная роль. Допустимые значения: "creator", "buyer".');
                }
            }

            // Выполняем поиск задач
            return await Task.find(query).populate('buyer').populate('creator').lean();
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
            const pattern = `${baseName}_U_`;
            const count = await Task.countDocuments({ name: { $regex: pattern } });
            return count;
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
            const pattern = `DU_${baseName}_`;
            const count = await Task.countDocuments({ name: { $regex: pattern } });
            return count;
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
            const pattern = `${baseName}_A_`;
            const count = await Task.countDocuments({ name: { $regex: pattern } });
            return count;
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
            if (!activeTasks || activeTasks.length === 0) {
                // Нет задач для нового круга
                roundState.roundTasks = {};
                roundState.processedTaskIds = [];
                await roundState.save({ session });
                await session.commitTransaction();
                return null;
            }

            // Группируем задачи по баерам
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
            await roundState.save({ session });
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
    static async setDefaultBonus(defaultBonus = 500, timeFrame = 30) {
        try {
            // Вычисляем дату, раньше которой будем искать задачи (например, старше 30 дней)
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - timeFrame);

            // Находим все задачи со статусом "done", у которых нет бонуса (bonus === null)
            // и которые были выполнены раньше указанной даты (т.е. старше чем timeFrame дней)
            const result = await Task.updateMany(
                {
                    state: 'done',
                    bonus: null,
                    completionDate: { $lt: cutoffDate }
                },
                {
                    $set: {
                        bonus: defaultBonus,
                        isPenaltyBonus: true
                    }
                }
            );

            return {
                success: true,
                message: `Штрафной бонус ${defaultBonus} установлен для ${result.modifiedCount} задач`,
                modifiedCount: result.modifiedCount,
                matchedCount: result.matchedCount
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
                        { key: 'taskPoolRows', _id: roundState._id },
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
}

module.exports = TaskService;

