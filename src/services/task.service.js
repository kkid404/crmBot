const Task = require('../databases/task.model');

class TaskService {
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
            task.version += 1; 
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
     * Метод для автоматического выбора задачи с чередованием баеров
     * @param {string} creatorId - ID креативщика, который берет задачу
     * @returns {Promise<Object|null>} Выбранная задача или null, если нет подходящих задач
     */
    static async getAutoAssignedTask(creatorId) {
        try {
            // Получаем все активные задачи
            const activeTasks = await Task.find({ state: 'active' })
                .populate('buyer')
                .populate('creator');
            
            if (!activeTasks.length) {
                return null; // Нет активных задач
            }
            
            // Группируем задачи по баерам
            const tasksByBuyer = {};
            
            activeTasks.forEach(task => {
                const buyerId = task.buyer._id.toString();
                if (!tasksByBuyer[buyerId]) {
                    tasksByBuyer[buyerId] = [];
                }
                tasksByBuyer[buyerId].push(task);
            });
            
            // Получаем список баеров с активными задачами
            const buyerIds = Object.keys(tasksByBuyer);
            
            if (!buyerIds.length) {
                return null; // Нет баеров с активными задачами
            }
            
            // Получаем последние взятые задачи этого креативщика в статусе 'progress'
            const recentTasks = await Task.find({
                creator: creatorId,
                state: 'progress'
            })
            .populate('buyer')
            .sort({ updatedAt: -1 }) // Сортируем по дате обновления (сначала самые новые)
            .limit(5); // Берем последние 5 задач
            
            // Создаем массив с ID последних баеров
            const recentBuyerIds = recentTasks.map(task => task.buyer._id.toString());
            
            // Находим баеров, задачи которых не брались в последнее время
            const priorityBuyerIds = buyerIds.filter(buyerId => !recentBuyerIds.includes(buyerId));
            
            // Если есть баеры, задачи которых давно не брались, выбираем их в первую очередь
            const selectedBuyerId = priorityBuyerIds.length > 0 
                ? priorityBuyerIds[0] // Берем первого баера из приоритетных
                : buyerIds.find(id => !recentBuyerIds[0] === id) || buyerIds[0]; // Или берем баера, отличного от последнего, или первого из списка
            
            // Выбираем самую старую задачу выбранного баера
            const buyerTasks = tasksByBuyer[selectedBuyerId];
            buyerTasks.sort((a, b) => a.createdAt - b.createdAt); // Сортируем по дате создания (сначала самые старые)
            
            // Возвращаем выбранную задачу
            return buyerTasks[0];
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
                { $set: { bonus: defaultBonus } }
            );
            
            return {
                success: true,
                message: `Бонус ${defaultBonus} установлен для ${result.modifiedCount} задач`,
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
}

module.exports = TaskService;

