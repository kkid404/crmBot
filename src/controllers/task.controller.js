const Task = require('../databases/task.model');
const { Parser } = require('json2csv');

const exportTasksInProgressToCsv = async () => {
    try {
        // Получаем задачи в работе (state: 'progress') и активные (state: 'active')
        const tasks = await Task.find({ 
            state: { $in: ['progress', 'active'] } 
        })
            .populate('buyer')
            .populate('creator')
            .sort({ createdAt: 1 }); // Сортировка по дате создания

        const fields = [
            { label: 'Дата создания', value: row => new Date(row.createdAt).toLocaleDateString('ru-RU') },
            { label: 'Название', value: 'name' },
            { 
                label: 'Вид работы', 
                value: (row) => {
                    if (row.name.startsWith('U_')) return 'Уникальный';
                    if (row.name.startsWith('DU_')) return 'Глубоко уникальный';
                    if (row.name.startsWith('A_')) return 'Адаптивный';
                    return 'Стандартный';
                }
            },
            { label: 'Заказчик', value: row => row.buyer?.username || 'Не указан' },
            { 
                label: 'Дата план выдачи', 
                value: row => row.expectedDate ? new Date(row.expectedDate).toLocaleDateString('ru-RU') : ''
            },
            { label: 'Исполнитель', value: row => row.creator?.username || 'Не указан' },
            { 
                label: 'Статус', 
                value: row => row.state === 'progress' ? 'В работе' : 'Активно'
            }
        ];

        const parser = new Parser({ fields });
        const csv = parser.parse(tasks);
        return Buffer.from('\uFEFF' + csv, 'utf-8'); // Добавляем BOM для корректной работы с кириллицей в Excel
    } catch (error) {
        throw new Error(`Ошибка при экспорте задач в работе: ${error.message}`);
    }
};

const exportTasksDoneCsv = async () => {
    try {
        // Получаем выполненные задачи (state: 'done')
        const tasks = await Task.find({ state: 'done' })
            .populate('buyer')
            .populate('creator')
            .sort({ creator: 1, createdAt: 1 }); // Сортировка сначала по исполнителю, потом по дате

        const fields = [
            { label: 'Дата создания', value: 'createdAt' },
            { label: 'Название', value: 'name' },
            { 
                label: 'Вид работы', 
                value: (row) => {
                    if (row.name.startsWith('U_')) return 'Уникальный';
                    if (row.name.startsWith('DU_')) return 'Глубоко уникальный';
                    if (row.name.startsWith('A_')) return 'Адаптивный';
                    return 'Стандартный';
                }
            },
            { label: 'Баллы', value: 'points' },
            { label: 'Бонус', value: 'bonus' },
            { label: 'CTR', value: 'CTR' },
            { label: 'Дата план выдачи', value: 'expectedDate' },
            { label: 'Дата факт выдачи', value: 'completionDate' },
            { label: 'Заказчик', value: row => row.buyer?.username || 'Не указан' },
            { label: 'Исполнитель', value: row => row.creator?.username || 'Не указан' }
        ];

        const parser = new Parser({ 
            fields,
            // Группировка по исполнителям
            transforms: [(row) => {
                return {
                    ...row,
                    createdAt: new Date(row.createdAt).toLocaleDateString('ru-RU'),
                    expectedDate: row.expectedDate ? new Date(row.expectedDate).toLocaleDateString('ru-RU') : '',
                    completionDate: row.completionDate ? new Date(row.completionDate).toLocaleDateString('ru-RU') : ''
                };
            }]
        });

        const csv = parser.parse(tasks);
        return Buffer.from(csv, 'utf-8');

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

        const fields = [
            { label: 'Статус', value: 'state' },
            { label: 'Дата создания', value: 'createdAt' },
            { label: 'Название', value: 'name' },
            { 
                label: 'Вид работы', 
                value: (row) => {
                    if (row.name.startsWith('U_')) return 'Уникальный';
                    if (row.name.startsWith('DU_')) return 'Глубоко уникальный';
                    if (row.name.startsWith('A_')) return 'Адаптивный';
                    return 'Стандартный';
                }
            },
            { label: 'Баллы', value: 'points' },
            { label: 'Бонус', value: 'bonus' },
            { label: 'CTR', value: 'CTR' },
            { label: 'Дата план выдачи', value: 'expectedDate' },
            { label: 'Дата факт выдачи', value: 'completionDate' },
            { label: 'Заказчик', value: row => row.buyer?.username || 'Не указан' },
            { label: 'Исполнитель', value: row => row.creator?.username || 'Не указан' }
        ];

        const parser = new Parser({ 
            fields,
            transforms: [(row) => {
                return {
                    ...row,
                    createdAt: new Date(row.createdAt).toLocaleDateString('ru-RU'),
                    expectedDate: row.expectedDate ? new Date(row.expectedDate).toLocaleDateString('ru-RU') : '',
                    completionDate: row.completionDate ? new Date(row.completionDate).toLocaleDateString('ru-RU') : ''
                };
            }]
        });

        const csv = parser.parse(tasks);
        return Buffer.from(csv, 'utf-8');

    } catch (error) {
        throw new Error(`Ошибка при экспорте всех задач: ${error.message}`);
    }
};

module.exports = {
    exportTasksInProgressToCsv,
    exportTasksDoneCsv,
    exportAllTasksCsv
}; 