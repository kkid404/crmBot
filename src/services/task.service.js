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

}

module.exports = TaskService;
