const Task = require('../databases/task.model');
const googleSheets = require('../services/googleSheets.service');

// Вспомогательная функция для форматирования даты
const formatDate = (date) => {
    if (!date) return '';
    try {
        return new Date(date).toLocaleDateString('ru-RU');
    } catch (error) {
        console.error('Ошибка форматирования даты:', error);
        return '';
    }
};

const exportTasksInProgressCsv = async () => {
    try {
        const tasks = await Task.find({ 
            state: { $in: ['progress', 'active'] } 
        })
            .populate('buyer')
            .populate('creator')
            .sort({ createdAt: 1 });

        // Создаем новую таблицу
        const spreadsheetId = await googleSheets.createSpreadsheet('Задачи в работе');
        
        // Заголовки для таблицы
        const headers = [
            'Дата создания',
            'Название',
            'Вид работы',
            'Заказчик',
            'Дата план выдачи',
            'Исполнитель',
            'Статус'
        ];

        // Подготавливаем данные
        const values = [
            headers,
            ...tasks.map(task => [
                formatDate(task.createdAt),
                task.name,
                task.workType || 'Не указан',
                task.buyer?.username || 'Не указан',
                formatDate(task.expectedDate),
                task.creator?.username || 'Не указан',
                task.state === 'progress' ? 'В работе' : 'Активно'
            ])
        ];

        // Записываем данные
        await googleSheets.writeData(spreadsheetId, `A1:G${values.length}`, values);

        // Проверяем доступность таблицы
        try {
            await googleSheets.sheets.spreadsheets.get({
                spreadsheetId,
                fields: 'spreadsheetUrl'
            });
        } catch (error) {
            throw new Error('Не удалось получить доступ к созданной таблице');
        }

        return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/view`;
    } catch (error) {
        throw new Error(`Ошибка при экспорте задач в работе: ${error.message}`);
    }
};

const exportTasksDoneCsv = async () => {
    try {
        const tasks = await Task.find({ state: 'done' })
            .populate('buyer')
            .populate('creator')
            .sort({ creator: 1, createdAt: 1 });

        // Группируем задачи по креативщикам
        const tasksByCreator = tasks.reduce((acc, task) => {
            const creatorName = task.creator?.username || 'Без исполнителя';
            if (!acc[creatorName]) {
                acc[creatorName] = [];
            }
            acc[creatorName].push(task);
            return acc;
        }, {});

        // Создаем новую таблицу
        const spreadsheetId = await googleSheets.createSpreadsheet('Выполненные задачи');
        
        // Получаем информацию о первом листе
        const spreadsheet = await googleSheets.sheets.spreadsheets.get({
            spreadsheetId
        });
        const firstSheetId = spreadsheet.data.sheets[0].properties.sheetId;
        
        // Заголовки для таблицы
        const headers = [
            'Дата создания',
            'Название',
            'Вид работы',
            'Баллы',
            'Бонус',
            'CTR',
            'Дата план выдачи',
            'Дата факт выдачи',
            'Заказчик',
            'Исполнитель'
        ];

        // Для каждого креативщика создаем отдельный лист
        for (const [creatorName, creatorTasks] of Object.entries(tasksByCreator)) {
            // Создаем новый лист
            await googleSheets.addSheet(spreadsheetId, creatorName);

            // Подготавливаем данные
            const values = [
                headers,
                ...creatorTasks.map(task => [
                    formatDate(task.createdAt),
                    task.name,
                    task.workType || 'Не указан',
                    task.points,
                    task.bonus,
                    task.CTR,
                    formatDate(task.expectedDate),
                    formatDate(task.completionDate),
                    task.buyer?.username || 'Не указан',
                    task.creator?.username || 'Не указан'
                ])
            ];

            // Записываем данные
            await googleSheets.writeData(spreadsheetId, `${creatorName}!A1:J${values.length}`, values);
        }

        // Удаляем первый пустой лист
        await googleSheets.deleteSheet(spreadsheetId, firstSheetId);

        // Проверяем доступность таблицы
        try {
            await googleSheets.sheets.spreadsheets.get({
                spreadsheetId,
                fields: 'spreadsheetUrl'
            });
        } catch (error) {
            throw new Error('Не удалось получить доступ к созданной таблице');
        }

        return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/view`;
    } catch (error) {
        throw new Error(`Ошибка при экспорте выполненных задач: ${error.message}`);
    }
};

const exportAllTasksCsv = async () => {
    try {
        const tasks = await Task.find({})
            .populate('buyer')
            .populate('creator')
            .sort({ state: 1, creator: 1, createdAt: 1 });

        // Создаем новую таблицу
        const spreadsheetId = await googleSheets.createSpreadsheet('Все задачи');
        
        // Заголовки для таблицы
        const headers = [
            'Статус',
            'Дата создания',
            'Название',
            'Вид работы',
            'Баллы',
            'Бонус',
            'CTR',
            'Дата план выдачи',
            'Дата факт выдачи',
            'Заказчик',
            'Исполнитель'
        ];

        // Подготавливаем данные
        const values = [
            headers,
            ...tasks.map(task => [
                task.state === 'active' ? 'Активно' : 
                task.state === 'progress' ? 'В работе' : 
                task.state === 'wait' ? 'На проверке' : 
                task.state === 'done' ? 'Выполнено' : 
                task.state === 'failed' ? 'Отклонено' : 
                task.state === 'canceled' ? 'Отменено' : task.state,
                formatDate(task.createdAt),
                task.name,
                task.workType || 'Не указан',
                task.points,
                task.bonus,
                task.CTR,
                formatDate(task.expectedDate),
                formatDate(task.completionDate),
                task.buyer?.username || 'Не указан',
                task.creator?.username || 'Не указан'
            ])
        ];

        // Записываем данные
        await googleSheets.writeData(spreadsheetId, `A1:K${values.length}`, values);

        // Проверяем доступность таблицы
        try {
            await googleSheets.sheets.spreadsheets.get({
                spreadsheetId,
                fields: 'spreadsheetUrl'
            });
        } catch (error) {
            throw new Error('Не удалось получить доступ к созданной таблице');
        }

        return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/view`;
    } catch (error) {
        throw new Error(`Ошибка при экспорте всех задач: ${error.message}`);
    }
};

module.exports = {
    exportTasksInProgressCsv,
    exportTasksDoneCsv,
    exportAllTasksCsv
}; 