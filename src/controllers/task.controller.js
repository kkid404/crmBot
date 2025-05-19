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
        console.log('Начало экспорта задач в работе...');
        
        // Получаем задачи из базы данных
        const tasks = await Task.find({ 
            state: { $in: ['progress', 'active'] } 
        })
            .populate('buyer')
            .populate('creator')
            .sort({ createdAt: 1 });
            
        console.log(`Найдено ${tasks.length} задач в работе`);

        // Получаем или создаем таблицу
        const { spreadsheetId, spreadsheet } = await prepareTasksSpreadsheet();
        
        // Проверяем и создаем лист, если нужно
        const sheetName = "Креативы в работе";
        await googleSheets.addSheet(spreadsheetId, sheetName);
        
        // Получаем обновленную информацию о таблице, чтобы получить ID листа
        const updatedSpreadsheet = await googleSheets.sheets.spreadsheets.get({
            spreadsheetId,
            fields: 'sheets(properties(sheetId,title))',
        });
        
        const sheet = updatedSpreadsheet.data.sheets.find(s => s.properties.title === sheetName);
        if (!sheet) {
            throw new Error(`Не удалось создать или найти лист "${sheetName}"`);
        }
        
        const sheetId = sheet.properties.sheetId;
        console.log(`Используем лист: ${sheetName} (ID: ${sheetId})`);
        
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

        // Подготавливаем данные с валидацией
        const values = [
            headers,
            ...tasks.map(task => {
                try {
                    return [
                        formatDate(task.createdAt) || '',
                        task.name?.toString() || 'Без названия',
                        task.workType?.toString() || 'Не указан',
                        task.buyer?.username?.toString() || 'Не указан',
                        formatDate(task.expectedDate) || '',
                        task.creator?.username?.toString() || 'Не указан',
                        task.state === 'progress' ? 'В работе' : 'Активно'
                    ];
                } catch (error) {
                    console.error('Ошибка при обработке задачи:', task._id, error);
                    return [];
                }
            }).filter(row => row.length > 0) // Удаляем пустые строки
        ];

        console.log(`Подготовлено ${values.length - 1} строк для записи`);

        // Очищаем лист перед записью новых данных
        await googleSheets.sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `${sheetName}!A:Z`,
        });

        // Записываем данные
        await googleSheets.writeData(spreadsheetId, `${sheetName}!A1`, values);
        console.log('Данные успешно записаны');

        // Форматируем заголовки (жирный шрифт)
        try {
            await googleSheets.sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{
                        repeatCell: {
                            range: {
                                sheetId,
                                startRowIndex: 0,
                                endRowIndex: 1
                            },
                            cell: {
                                userEnteredFormat: {
                                    textFormat: {
                                        bold: true
                                    }
                                }
                            },
                            fields: 'userEnteredFormat.textFormat.bold'
                        }
                    }]
                }
            });
        } catch (formatError) {
            console.warn('Не удалось применить форматирование к заголовкам:', formatError);
        }

        return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
    } catch (error) {
        throw new Error(`Ошибка при экспорте задач в работе: ${error.message}`);
    }
};

const exportTasksDoneCsv = async () => {
    try {
        console.log('Начало экспорта выполненных задач...');
        
        // Получаем выполненные задачи
        const tasks = await Task.find({ state: 'done' })
            .populate('buyer')
            .populate('creator')
            .sort({ creator: 1, createdAt: 1 });
            
        console.log(`Найдено ${tasks.length} выполненных задач`);

        // Получаем или создаем таблицу
        const { spreadsheetId, spreadsheet } = await prepareTasksSpreadsheet();
        
        // Создаем или получаем основной лист
        const mainSheetName = "Выполненные креативы";
        await googleSheets.addSheet(spreadsheetId, mainSheetName);
        
        // Получаем обновленную информацию о таблице, чтобы получить ID листа
        const updatedSpreadsheet = await googleSheets.sheets.spreadsheets.get({
            spreadsheetId,
            fields: 'sheets(properties(sheetId,title))',
        });
        
        const mainSheet = updatedSpreadsheet.data.sheets.find(s => s.properties.title === mainSheetName);
        if (!mainSheet) {
            throw new Error(`Не удалось создать или найти лист "${mainSheetName}"`);
        }
        
        const mainSheetId = mainSheet.properties.sheetId;
        console.log(`Используем лист: ${mainSheetName} (ID: ${mainSheetId})`);
        
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

        // Подготавливаем данные для основного листа с валидацией
        const allTasksValues = [
            headers,
            ...tasks.map(task => {
                try {
                    return [
                        formatDate(task.createdAt) || '',
                        task.name?.toString() || 'Без названия',
                        task.workType?.toString() || 'Не указан',
                        task.points || 0,
                        task.bonus || 0,
                        task.CTR || 0,
                        formatDate(task.expectedDate) || '',
                        formatDate(task.completionDate) || '',
                        task.buyer?.username?.toString() || 'Не указан',
                        task.creator?.username?.toString() || 'Не указан'
                    ];
                } catch (error) {
                    console.error('Ошибка при обработке задачи:', task._id, error);
                    return [];
                }
            }).filter(row => row.length > 0) // Удаляем пустые строки
        ];

        console.log(`Подготовлено ${allTasksValues.length - 1} строк для основного листа`);

        // Очищаем основной лист перед записью новых данных
        await googleSheets.sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `${mainSheetName}!A:Z`,
        });

        // Записываем данные в основной лист
        await googleSheets.writeData(spreadsheetId, `${mainSheetName}!A1`, allTasksValues);
        console.log(`Данные успешно записаны в лист "${mainSheetName}"`);

        // Форматируем заголовки (жирный шрифт) в основном листе
        try {
            await googleSheets.sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{
                        repeatCell: {
                            range: {
                                sheetId: mainSheetId,
                                startRowIndex: 0,
                                endRowIndex: 1
                            },
                            cell: {
                                userEnteredFormat: {
                                    textFormat: {
                                        bold: true
                                    }
                                }
                            },
                            fields: 'userEnteredFormat.textFormat.bold'
                        }
                    }]
                }
            });
        } catch (formatError) {
            console.warn('Не удалось применить форматирование к заголовкам:', formatError);
        }

        // Для каждого креативщика создаем или обновляем отдельный лист
        for (const [creatorName, creatorTasks] of Object.entries(tasksByCreator)) {
            // Создаем имя листа с префиксом (убираем недопустимые символы)
            const safeCreatorName = creatorName.replace(/[\[\]\/\?]/g, '_');
            const creatorSheetName = `${mainSheetName} - ${safeCreatorName}`;
            
            try {
                // Создаем лист для креативщика
                await googleSheets.addSheet(spreadsheetId, creatorSheetName);
                
                // Получаем ID созданного листа
                const creatorSpreadsheet = await googleSheets.sheets.spreadsheets.get({
                    spreadsheetId,
                    fields: 'sheets(properties(sheetId,title))',
                });
                
                const creatorSheet = creatorSpreadsheet.data.sheets.find(s => s.properties.title === creatorSheetName);
                if (!creatorSheet) {
                    console.warn(`Не удалось получить ID листа для ${creatorName}, пропускаем`);
                    continue;
                }
                
                const creatorSheetId = creatorSheet.properties.sheetId;
                
                // Подготавливаем данные для листа креативщика с валидацией
                const creatorValues = [
                    headers,
                    ...creatorTasks.map(task => {
                        try {
                            return [
                                formatDate(task.createdAt) || '',
                                task.name?.toString() || 'Без названия',
                                task.workType?.toString() || 'Не указан',
                                task.points || 0,
                                task.bonus || 0,
                                task.CTR || 0,
                                formatDate(task.expectedDate) || '',
                                formatDate(task.completionDate) || '',
                                task.buyer?.username?.toString() || 'Не указан',
                                task.creator?.username?.toString() || 'Не указан'
                            ];
                        } catch (error) {
                            console.error('Ошибка при обработке задачи:', task._id, error);
                            return [];
                        }
                    }).filter(row => row.length > 0)
                ];
                
                // Записываем данные в лист креативщика
                await googleSheets.writeData(spreadsheetId, `${creatorSheetName}!A1`, creatorValues);
                
                // Форматируем заголовки (жирный шрифт) в листе креативщика
                await googleSheets.sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    requestBody: {
                        requests: [{
                            repeatCell: {
                                range: {
                                    sheetId: creatorSheetId,
                                    startRowIndex: 0,
                                    endRowIndex: 1
                                },
                                cell: {
                                    userEnteredFormat: {
                                        textFormat: {
                                            bold: true
                                        }
                                    }
                                },
                                fields: 'userEnteredFormat.textFormat.bold'
                            }
                        }]
                    }
                });
                
                console.log(`Данные успешно записаны в лист "${creatorSheetName}"`);
                
            } catch (creatorError) {
                console.error(`Ошибка при обработке креативщика ${creatorName}:`, creatorError);
                continue; // Продолжаем с другим креативщиком в случае ошибки
            }
        }
    } catch (error) {
        throw new Error(`Ошибка при экспорте выполненных задач: ${error.message}`);
    }
};

const exportAllTasksCsv = async () => {
    try {
        console.log('Начало экспорта всех задач...');
        
        // Получаем все задачи
        const tasks = await Task.find({})
            .populate('buyer')
            .populate('creator')
            .sort({ state: 1, creator: 1, createdAt: 1 });
            
        console.log(`Найдено ${tasks.length} задач`);

        // Получаем или создаем таблицу
        const { spreadsheetId } = await prepareTasksSpreadsheet();
        
        // Создаем или получаем лист
        const sheetName = "Все креативы";
        await googleSheets.addSheet(spreadsheetId, sheetName);
        
        // Получаем обновленную информацию о таблице, чтобы получить ID листа
        const updatedSpreadsheet = await googleSheets.sheets.spreadsheets.get({
            spreadsheetId,
            fields: 'sheets(properties(sheetId,title))',
        });
        
        const sheet = updatedSpreadsheet.data.sheets.find(s => s.properties.title === sheetName);
        if (!sheet) {
            throw new Error(`Не удалось создать или найти лист "${sheetName}"`);
        }
        
        const sheetId = sheet.properties.sheetId;
        console.log(`Используем лист: ${sheetName} (ID: ${sheetId})`);
        
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

        // Функция для получения читаемого статуса
        const getStatusText = (state) => {
            switch (state) {
                case 'active': return 'Активно';
                case 'progress': return 'В работе';
                case 'wait': return 'На проверке';
                case 'done': return 'Выполнено';
                case 'failed': return 'Отклонено';
                case 'canceled': return 'Отменено';
                default: return state || 'Неизвестно';
            }
        };

        // Подготавливаем данные с валидацией
        const values = [
            headers,
            ...tasks.map(task => {
                try {
                    return [
                        getStatusText(task.state),
                        formatDate(task.createdAt) || '',
                        task.name?.toString() || 'Без названия',
                        task.workType?.toString() || 'Не указан',
                        task.points || 0,
                        task.bonus || 0,
                        task.CTR || 0,
                        formatDate(task.expectedDate) || '',
                        formatDate(task.completionDate) || '',
                        task.buyer?.username?.toString() || 'Не указан',
                        task.creator?.username?.toString() || 'Не указан'
                    ];
                } catch (error) {
                    console.error('Ошибка при обработке задачи:', task._id, error);
                    return [];
                }
            }).filter(row => row.length > 0) // Удаляем пустые строки
        ];

        console.log(`Подготовлено ${values.length - 1} строк для записи`);

        // Очищаем лист перед записью новых данных
        await googleSheets.sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `${sheetName}!A:Z`,
        });

        // Записываем данные
        await googleSheets.writeData(spreadsheetId, `${sheetName}!A1`, values);
        console.log('Данные успешно записаны');

        // Форматируем заголовки (жирный шрифт)
        try {
            // Автоматическое выравнивание ширины столбцов
            await googleSheets.sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [
                        // Жирные заголовки
                        {
                            repeatCell: {
                                range: {
                                    sheetId,
                                    startRowIndex: 0,
                                    endRowIndex: 1
                                },
                                cell: {
                                    userEnteredFormat: {
                                        textFormat: { bold: true },
                                        horizontalAlignment: 'CENTER',
                                        backgroundColor: {
                                            red: 0.85,
                                            green: 0.92,
                                            blue: 0.83
                                        }
                                    }
                                },
                                fields: 'userEnteredFormat(textFormat,horizontalAlignment,backgroundColor)'
                            }
                        },
                        // Заморозка первой строки
                        {
                            updateSheetProperties: {
                                properties: {
                                    sheetId,
                                    gridProperties: {
                                        frozenRowCount: 1
                                    }
                                },
                                fields: 'gridProperties.frozenRowCount'
                            }
                        },
                        // Автоматическое выравнивание ширины столбцов
                        {
                            autoResizeDimensions: {
                                dimensions: {
                                    sheetId,
                                    dimension: 'COLUMNS',
                                    startIndex: 0,
                                    endIndex: headers.length
                                }
                            }
                        }
                    ]
                }
            });
        } catch (formatError) {
            console.warn('Не удалось применить форматирование к таблице:', formatError);
        }

        return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
    } catch (error) {
        throw new Error(`Ошибка при экспорте всех задач: ${error.message}`);
    }
};

module.exports = {
    exportTasksInProgressCsv,
    exportTasksDoneCsv,
    exportAllTasksCsv
}; 