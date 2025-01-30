const TaskCheker = require('./../databases/taskCheker.model');

class TaskChekerService {
    // Найти проверку по ID задачи и версии
    static async findTaskCheckerByTaskIdAndVersion(taskId, version) {
        return TaskCheker.findOne({ taskId, version });
    }

    // Создать новую запись о проверке
    static async createTaskChecker(data) {
        const taskChecker = new TaskCheker(data);
        return taskChecker.save();
    }

    // Обновить статус проверки
    static async updateTaskCheckerStatus(taskId, version, status, message = '') {
        return TaskCheker.findOneAndUpdate(
            { taskId, version },
            { status, message },
            { new: true }
        );
    }

    // Найти все проверки для определенной задачи
    static async findAllCheckersByTaskId(taskId) {
        return TaskCheker.find({ taskId });
    }

    // Найти все проверки для определенного проверяющего
    static async findAllCheckersByCheckerId(chekerId) {
        return TaskCheker.find({ chekerId });
    }

    // Найти все проверки с определенным статусом
    static async findAllCheckersByStatus(status) {
        return TaskCheker.find({ status });
    }

    // Проверить, была ли уже проверка с данным статусом для задачи и версии
    static async isTaskChecked(taskId, version, status) {
        const taskChecker = await TaskCheker.findOne({ taskId, version, status });
        return taskChecker !== null;
    }

    // Удалить запись о проверке
    static async deleteTaskChecker(taskId, version) {
        return TaskCheker.findOneAndDelete({ taskId, version });
    }

    // Получить все проверки
    static async getAllTaskCheckers() {
        return TaskCheker.find({});
    }
}

module.exports = TaskChekerService;
