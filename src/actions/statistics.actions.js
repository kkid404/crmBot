const ruMessage = require('../lang/ru.json');
const Task = require('../databases/task.model');
const { 
    exportTasksInProgressCsv, 
    exportTasksDoneCsv, 
    exportAllTasksCsv 
} = require('../controllers/task.controller');
const { exportEmployeeScheduleToGoogleSheets } = require('../controllers/employee_schedule.controller');
const { start } = require('../keyboards/start.keyboard');
const { statistics } = require('../keyboards/statistics.keyboard');
const fetch = require('node-fetch');

// Проверяем, что функции импортировались корректно
if (!exportTasksInProgressCsv || !exportTasksDoneCsv || !exportAllTasksCsv || !exportEmployeeScheduleToGoogleSheets) {
    console.error('Ошибка: функции экспорта не импортировались корректно');
}

const actions = (bot) => {
    // Добавляем новый обработчик для возврата в меню статистики
    bot.action('backToStatMenu', async (ctx) => {
        try {
            // Удаляем предыдущее сообщение
            await ctx.deleteMessage();
            
            // Отправляем сообщение с меню статистики
            await ctx.reply(ruMessage.messages.statistics.select_do, statistics());
        } catch (error) {
            await ctx.reply(ruMessage.messages.error);
        }
    });

    // Обработка кнопки "Креативы в работе" (в фоне)
    bot.action('progressCsv', async (ctx) => {
        try {
            await ctx.deleteMessage();
            const loadingMessage = await ctx.reply('⏳ Генерация отчета...');
            // Запускаем экспорт в фоне, чтобы не блокировать обработчик
            setImmediate(async () => {
                try {
                    const spreadsheetUrl = await exportTasksInProgressCsv();
                    try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id); } catch {}
                    await ctx.reply(
                        `📊 Отчет по креативам в работе готов!\n${spreadsheetUrl}`,
                        { 
                            reply_markup: {
                                inline_keyboard: [[{ 
                                    text: ruMessage.keyboards.statistics.backToStatMenu, 
                                    callback_data: 'backToStatMenu' 
                                }]]
                            },
                            disable_web_page_preview: true
                        }
                    );
                } catch (error) {
                    console.error('Ошибка при создании отчета (progressCsv):', error);
                    try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id); } catch {}
                    await ctx.reply(
                        '❌ Произошла ошибка при создании отчета. Пожалуйста, попробуйте позже.',
                        { 
                            reply_markup: {
                                inline_keyboard: [[{ 
                                    text: ruMessage.keyboards.statistics.backToStatMenu, 
                                    callback_data: 'backToStatMenu' 
                                }]]
                            }
                        }
                    );
                }
            });
        } catch (error) {
            console.error('Ошибка в обработчике progressCsv:', error);
            await ctx.reply(ruMessage.messages.error);
        }
    });

    // Обработка кнопки "Выполненные креативы" (в фоне)
    bot.action('doneCsv', async (ctx) => {
        try {
            await ctx.deleteMessage();
            const loadingMessage = await ctx.reply('⏳ Генерация отчета...');
            setImmediate(async () => {
                try {
                    const spreadsheetUrl = await exportTasksDoneCsv();
                    try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id); } catch {}
                    await ctx.reply(
                        `📊 Отчет по выполненным креативам готов!\n${spreadsheetUrl}`,
                        { 
                            reply_markup: {
                                inline_keyboard: [[{ 
                                    text: ruMessage.keyboards.statistics.backToStatMenu, 
                                    callback_data: 'backToStatMenu' 
                                }]]
                            },
                            disable_web_page_preview: true
                        }
                    );
                } catch (error) {
                    console.error('Ошибка при создании отчета (doneCsv):', error);
                    try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id); } catch {}
                    await ctx.reply(
                        '❌ Произошла ошибка при создании отчета. Пожалуйста, попробуйте позже.',
                        { 
                            reply_markup: {
                                inline_keyboard: [[{ 
                                    text: ruMessage.keyboards.statistics.backToStatMenu, 
                                    callback_data: 'backToStatMenu' 
                                }]]
                            }
                        }
                    );
                }
            });
        } catch (error) {
            console.error('Ошибка в обработчике doneCsv:', error);
            await ctx.reply(ruMessage.messages.error);
        }
    });

    // Обработка кнопки "Все креативы" (в фоне)
    bot.action('allCsv', async (ctx) => {
        try {
            await ctx.deleteMessage();
            const loadingMessage = await ctx.reply('⏳ Генерация отчета...');
            setImmediate(async () => {
                try {
                    const spreadsheetUrl = await exportAllTasksCsv();
                    try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id); } catch {}
                    await ctx.reply(
                        `📊 Полный отчет по креативам готов!\n${spreadsheetUrl}`,
                        { 
                            reply_markup: {
                                inline_keyboard: [[{ 
                                    text: ruMessage.keyboards.statistics.backToStatMenu, 
                                    callback_data: 'backToStatMenu' 
                                }]]
                            },
                            disable_web_page_preview: true
                        }
                    );
                } catch (error) {
                    console.error('Ошибка при создании отчета (allCsv):', error);
                    try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id); } catch {}
                    await ctx.reply(
                        '❌ Произошла ошибка при создании отчета. Пожалуйста, попробуйте позже.',
                        { 
                            reply_markup: {
                                inline_keyboard: [[{ 
                                    text: ruMessage.keyboards.statistics.backToStatMenu, 
                                    callback_data: 'backToStatMenu' 
                                }]]
                            }
                        }
                    );
                }
            });
        } catch (error) {
            console.error('Ошибка в обработчике allCsv:', error);
            await ctx.reply(ruMessage.messages.error);
        }
    });

    // Обработка кнопки "Отправить CSV"
    bot.action('sendCsv', async (ctx) => {
        try {
            // Удаляем предыдущее сообщение
            await ctx.deleteMessage();
            
            await ctx.reply('📤 Пожалуйста, отправьте CSV файл для обновления статусов задач', {
                reply_markup: {
                    inline_keyboard: [[{ text: ruMessage.keyboards.statistics.backToStatMenu, callback_data: 'backToStatMenu' }]]
                }
            });
            // Устанавливаем флаг ожидания файла
            ctx.session.awaitingCsvFile = true;
        } catch (error) {
            await ctx.reply(ruMessage.messages.error);
        }
    });

    // Обработка кнопки "Главное меню"
    bot.action('backToMainMenu', async (ctx) => {
        try {
            // Удаляем предыдущее сообщение
            await ctx.deleteMessage();
            
            await ctx.reply('📋 Вы вернулись в главное меню', await start(ctx.from.id));
        } catch (error) {
            await ctx.reply(ruMessage.messages.error);
        }
    });

    // Добавляем обработчик для CSV файлов
    bot.on('document', async (ctx) => {
        try {
            // Проверяем, ожидаем ли мы CSV файл
            if (!ctx.session.awaitingCsvFile) {
                console.log('CSV файл не ожидается');
                return;
            }

            const file = ctx.message.document;
            console.log('Получен файл:', file.file_name);
            
            // Проверяем, что это CSV файл
            if (!file.file_name.toLowerCase().endsWith('.csv')) {
                await ctx.reply('❌ Пожалуйста, отправьте файл в формате CSV');
                return;
            }

            // Отправляем сообщение о начале обработки
            const loadingMessage = await ctx.reply('⏳ Обработка CSV файла...');

            try {
                // Получаем файл
                const fileLink = await ctx.telegram.getFile(file.file_id);
                const filePath = fileLink.file_path;
                
                // Используем ctx.telegram.token вместо process.env.BOT_TOKEN
                const fileUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${filePath}`;
                console.log('URL файла:', fileUrl);

                // Скачиваем и обрабатываем файл
                const response = await fetch(fileUrl);
                if (!response.ok) {
                    throw new Error(`Ошибка получения файла: ${response.status} ${response.statusText}`);
                }

                const csvText = await response.text();
                console.log('Содержимое CSV:', csvText);

                // Парсим CSV (добавляем обработку кавычек и экранирование)
                const rows = csvText
                    .split('\n')
                    .map(line => line
                        .split(',')
                        .map(cell => cell.trim().replace(/^["']|["']$/g, '')) // Удаляем кавычки и пробелы
                    );

                console.log('Распарсенные строки:', rows);
                
                // Пропускаем заголовок
                const dataRows = rows.slice(1).filter(row => row.length >= 7 && row.some(cell => cell)); // Фильтруем пустые строки
                console.log('Строки с данными:', dataRows);
                
                let updatedCount = 0;
                let errorCount = 0;

                // Обновляем статусы в базе данных
                for (const row of dataRows) {
                    console.log('Обработка строки:', row);
                    
                    if (row.length < 7) {
                        console.log('Пропущена строка - недостаточно колонок:', row);
                        continue;
                    }

                    const taskName = row[1].trim(); // Название во второй колонке
                    const newStatus = row[6].trim(); // Статус в седьмой колонке
                    console.log(`Попытка обновления: задача=${taskName}, новый статус=${newStatus}`);

                    try {
                        // Проверяем, что у нас есть название задачи
                        if (!taskName) {
                            console.log('Пропущена строка с пустым названием задачи');
                            continue;
                        }

                        // Сначала найдем задачу
                        const task = await Task.findOne({ name: taskName });
                        if (!task) {
                            console.log(`Задача не найдена: ${taskName}`);
                            continue;
                        }

                        console.log(`Текущий статус задачи ${taskName}: ${task.state}`);

                        const result = await Task.updateOne(
                            { name: taskName },
                            { $set: { state: newStatus } }
                        );

                        if (result.modifiedCount > 0) {
                            updatedCount++;
                            console.log(`Обновлена задача ${taskName}: новый статус = ${newStatus}`);
                        } else {
                            console.log(`Задача ${taskName} не обновлена: modifiedCount = 0`);
                        }
                    } catch (err) {
                        console.error(`Ошибка обновления задачи ${taskName}:`, err);
                        errorCount++;
                    }
                }

                console.log(`Итоги обработки: обновлено=${updatedCount}, ошибок=${errorCount}`);

                // Удаляем сообщение о загрузке
                await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);

                // Отправляем результат
                await ctx.reply(
                    `✅ Обработка CSV завершена\n\n` +
                    `📊 Статистика:\n` +
                    `• Обновлено задач: ${updatedCount}\n` +
                    `• Ошибок: ${errorCount}`,
                    { 
                        reply_markup: {
                            inline_keyboard: [[{ 
                                text: ruMessage.keyboards.statistics.backToStatMenu, 
                                callback_data: 'backToStatMenu' 
                            }]]
                        }
                    }
                );

            } catch (error) {
                console.error('Ошибка обработки CSV:', error);
                
                // Удаляем сообщение о загрузке
                await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
                
                await ctx.reply(
                    '❌ Произошла ошибка при обработке файла. Пожалуйста, проверьте формат CSV и попробуйте снова.',
                    { 
                        reply_markup: {
                            inline_keyboard: [[{ 
                                text: ruMessage.keyboards.statistics.backToStatMenu, 
                                callback_data: 'backToStatMenu' 
                            }]]
                        }
                    }
                );
            }

            // Сбрасываем флаг ожидания файла
            ctx.session.awaitingCsvFile = false;

        } catch (error) {
            console.error('Ошибка в обработчике document:', error);
            await ctx.reply(ruMessage.messages.error);
        }
    });

    // Обработка кнопки "Отчет по рабочему времени" (в фоне)
    bot.action('scheduleReport', async (ctx) => {
        try {
            await ctx.deleteMessage();
            const loadingMessage = await ctx.reply('⏳ Генерация отчета по рабочему времени...');
            setImmediate(async () => {
                try {
                    const spreadsheetUrl = await exportEmployeeScheduleToGoogleSheets();
                    try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id); } catch {}
                    await ctx.reply(
                        `📊 Отчет по рабочему времени сотрудников готов!\n${spreadsheetUrl}`,
                        { 
                            reply_markup: {
                                inline_keyboard: [[{ 
                                    text: ruMessage.keyboards.statistics.backToStatMenu, 
                                    callback_data: 'backToStatMenu' 
                                }]]
                            },
                            disable_web_page_preview: true
                        }
                    );
                } catch (error) {
                    console.error('Ошибка при создании отчета по рабочему времени (scheduleReport):', error);
                    try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id); } catch {}
                    await ctx.reply(
                        '❌ Произошла ошибка при создании отчета. Пожалуйста, попробуйте позже.',
                        { 
                            reply_markup: {
                                inline_keyboard: [[{ 
                                    text: ruMessage.keyboards.statistics.backToStatMenu, 
                                    callback_data: 'backToStatMenu' 
                                }]]
                            }
                        }
                    );
                }
            });
        } catch (error) {
            console.error('Ошибка в обработчике scheduleReport:', error);
            await ctx.reply(ruMessage.messages.error);
        }
    });
};

module.exports = { actions }; 