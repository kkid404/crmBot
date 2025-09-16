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
        try {
            return await Task.findByIdAndUpdate(taskId, updates, { new: true }).populate('buyer').populate('creator');
        } catch (error) {
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
   * Выбирает по одной задаче для каждого баера, у которого есть активные задачи,
   * прежде чем начать новый круг.
   * @param {string} creatorId - ID креативщика (сохранено для совместимости, но не используется в логике выбора).
   * @returns {Promise<Object|null>} Выбранная задача или null, если нет подходящих задач.
   */
    static async getAutoAssignedTask(creatorId) {
        try {
            let roundState = await RoundState.findOne({ key: 'autoAssignQueue' });
            if (!roundState) {
                roundState = new RoundState({
                    key: 'autoAssignQueue',
                    processedBuyers: [],
                    roundStartTime: new Date()
                });
                await roundState.save();
            }

            // 🛠 Восстанавливаем roundStartTime, если он отсутствует (например, в старых документах)
            if (!roundState.roundStartTime) {
                const oldestTask = await Task.findOne({ state: 'active' }).sort({ createdAt: 1 });
                roundState.roundStartTime = oldestTask ? oldestTask.createdAt : new Date();
                await roundState.save();
            }

            while (true) {
                // Загружаем все активные задачи
                const activeTasks = await Task.find({ state: 'active' }).populate('buyer');
                if (!activeTasks || activeTasks.length === 0) {
                    return null; // Нет задач вообще
                }

                // Группируем задачи по buyer._id
                const tasksByBuyer = {};
                for (const task of activeTasks) {
                    if (task?.buyer?._id) {
                        const buyerId = task.buyer._id.toString();
                        if (!tasksByBuyer[buyerId]) tasksByBuyer[buyerId] = [];
                        tasksByBuyer[buyerId].push(task);
                    }
                }

                let allBuyerIdsWithActiveTasks = Object.keys(tasksByBuyer).sort();
                if (allBuyerIdsWithActiveTasks.length === 0) {
                    return null; // Задачи есть, но без валидных баеров
                }

                const processedBuyers = new Set(roundState.processedBuyers);

                // Находим баеров, которые ещё не получили задачу в этом круге
                let eligibleBuyerIds = allBuyerIdsWithActiveTasks.filter(
                    buyerId => !processedBuyers.has(buyerId)
                );

                // Если все баеры уже обработаны — начинаем новый раунд
                if (eligibleBuyerIds.length === 0) {
                    roundState.processedBuyers = [];
                    roundState.roundStartTime = new Date();
                    await roundState.save();
                    continue; // начинаем новый круг
                }

                // Берём первого доступного баера
                const selectedBuyerId = eligibleBuyerIds[0];
                const buyerTasks = tasksByBuyer[selectedBuyerId];

                if (!buyerTasks || buyerTasks.length === 0) {
                    // Баер без задач — помечаем его как обработанного и пробуем снова
                    processedBuyers.add(selectedBuyerId);
                    roundState.processedBuyers = Array.from(processedBuyers);
                    await roundState.save();
                    continue;
                }

                // Сортируем задачи баера по дате создания и берём самую старую
                buyerTasks.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                const selectedTask = buyerTasks[0];

                // Обновляем состояние раунда
                processedBuyers.add(selectedBuyerId);
                roundState.processedBuyers = Array.from(processedBuyers);
                await roundState.save();

                return selectedTask;
            }
        } catch (error) {
            console.error('Ошибка при автоматическом выборе задачи:', error);
            return null;
        }
    }


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
            return await Task.findOneAndUpdate(
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
        } catch (error) {
            throw new Error(`Ошибка назначения задачи: ${error.message}`);
        }
    }
}

module.exports = TaskService;

