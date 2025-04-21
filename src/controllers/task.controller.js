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

// Helper function to prepare the tasks spreadsheet
const prepareTasksSpreadsheet = async () => {
    // Use a single spreadsheet for all task-related data
    const spreadsheetId = await googleSheets.getOrCreateSpreadsheet(
        'Таблица задач', 
        process.env.TASKS_SPREADSHEET_ID
    );
    
    // Get information about existing sheets
    const spreadsheet = await googleSheets.sheets.spreadsheets.get({
        spreadsheetId
    });
    
    return { spreadsheetId, spreadsheet };
};

const exportTasksInProgressCsv = async () => {
    try {
        const tasks = await Task.find({ 
            state: { $in: ['progress', 'active'] } 
        })
            .populate('buyer')
            .populate('creator')
            .sort({ createdAt: 1 });

        // Get or create the spreadsheet
        const { spreadsheetId, spreadsheet } = await prepareTasksSpreadsheet();
        
        // Check if "Креативы в работе" sheet exists, otherwise add it
        const sheetName = "Креативы в работе";
        const existingSheet = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
        
        if (!existingSheet) {
            await googleSheets.addSheet(spreadsheetId, sheetName);
        }
        
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
        await googleSheets.writeData(spreadsheetId, `${sheetName}!A1:G${values.length}`, values);

        return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${existingSheet?.properties?.sheetId || '0'}`;
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

        // Get or create the spreadsheet
        const { spreadsheetId, spreadsheet } = await prepareTasksSpreadsheet();
        
        // Группируем задачи по креативщикам
        const tasksByCreator = tasks.reduce((acc, task) => {
            const creatorName = task.creator?.username || 'Без исполнителя';
            if (!acc[creatorName]) {
                acc[creatorName] = [];
            }
            acc[creatorName].push(task);
            return acc;
        }, {});
        
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

        // Check if "Выполненные креативы" section exists
        const mainSheetName = "Выполненные креативы";

        // Get list of all current sheets
        const allSheetTitles = spreadsheet.data.sheets.map(s => s.properties.title);
        console.log(`Все листы в таблице: ${JSON.stringify(allSheetTitles)}`);
        
        // Check if main sheet exists
        let mainSheetId = 0;
        const mainSheetExists = allSheetTitles.includes(mainSheetName);
        
        if (!mainSheetExists) {
            // Create main sheet for completed tasks if it doesn't exist
            console.log(`Создание основного листа "${mainSheetName}"...`);
            await googleSheets.addSheet(spreadsheetId, mainSheetName);
            
            // Get updated spreadsheet to get the sheet ID
            const updatedSpreadsheet = await googleSheets.sheets.spreadsheets.get({
                spreadsheetId
            });
            
            const mainSheet = updatedSpreadsheet.data.sheets.find(s => s.properties.title === mainSheetName);
            if (mainSheet) {
                mainSheetId = mainSheet.properties.sheetId;
            }
        } else {
            // Find existing main sheet ID
            const mainSheet = spreadsheet.data.sheets.find(s => s.properties.title === mainSheetName);
            if (mainSheet) {
                mainSheetId = mainSheet.properties.sheetId;
            }
            console.log(`Лист "${mainSheetName}" уже существует, обновляем данные`);
        }

        // Write all tasks to the main sheet
        const allTasksValues = [
            headers,
            ...tasks.map(task => [
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

        // Write data to the main sheet
        await googleSheets.writeData(spreadsheetId, `${mainSheetName}!A1:J${allTasksValues.length}`, allTasksValues);
        console.log(`Данные обновлены в листе "${mainSheetName}"`);

        // Для каждого креативщика обновляем или создаем отдельный лист
        for (const [creatorName, creatorTasks] of Object.entries(tasksByCreator)) {
            // Создаем имя листа с префиксом
            const creatorSheetName = `${mainSheetName} - ${creatorName}`;
            
            // Check if sheet already exists
            const creatorSheetExists = allSheetTitles.includes(creatorSheetName);
            
            if (!creatorSheetExists) {
                console.log(`Создание листа для креативщика "${creatorSheetName}"...`);
                await googleSheets.addSheet(spreadsheetId, creatorSheetName);
            } else {
                console.log(`Лист "${creatorSheetName}" уже существует, обновляем данные`);
            }

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
            await googleSheets.writeData(spreadsheetId, `${creatorSheetName}!A1:J${values.length}`, values);
            console.log(`Данные обновлены в листе "${creatorSheetName}"`);
        }

        return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${mainSheetId}`;
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

        // Get or create the spreadsheet
        const { spreadsheetId, spreadsheet } = await prepareTasksSpreadsheet();
        
        // Check if "Все креативы" sheet exists, otherwise add it
        const sheetName = "Все креативы";
        const existingSheet = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
        
        if (!existingSheet) {
            await googleSheets.addSheet(spreadsheetId, sheetName);
        }
        
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
        await googleSheets.writeData(spreadsheetId, `${sheetName}!A1:K${values.length}`, values);

        return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${existingSheet?.properties?.sheetId || '0'}`;
    } catch (error) {
        throw new Error(`Ошибка при экспорте всех задач: ${error.message}`);
    }
};

module.exports = {
    exportTasksInProgressCsv,
    exportTasksDoneCsv,
    exportAllTasksCsv
}; 