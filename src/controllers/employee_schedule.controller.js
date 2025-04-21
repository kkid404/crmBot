const EmployeeSchedule = require('../databases/employee_schedule.model');
const User = require('../databases/user.model');
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

// Вспомогательная функция для форматирования времени
const formatTime = (date) => {
    if (!date) return '';
    try {
        return new Date(date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        console.error('Ошибка форматирования времени:', error);
        return '';
    }
};

// Функция для форматирования продолжительности в формате часы:минуты:секунды
const formatDuration = (durationInHours) => {
    try {
        const totalSeconds = Math.round(durationInHours * 3600); // Переводим часы в секунды
        
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } catch (error) {
        console.error('Ошибка форматирования продолжительности:', error);
        return '00:00:00';
    }
};

// Функция для расчета продолжительности между двумя датами в часах
const calculateDuration = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        // Проверяем, что даты валидны
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new Error('Невалидные даты');
        }
        
        // Рассчитываем разницу в миллисекундах
        let durationMs = end - start;
        
        // Если получилось отрицательное значение (конец раньше начала), 
        // это может быть из-за перехода через полночь
        if (durationMs < 0) {
            console.warn('Отрицательная продолжительность между', start, 'и', end);
            // Возвращаем 0, так как отрицательная продолжительность не имеет смысла
            return 0;
        }
        
        // Переводим миллисекунды в часы и округляем до 2 знаков после запятой
        return Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100;
    } catch (error) {
        console.error('Ошибка расчета продолжительности:', error);
        return 0;
    }
};

/**
 * Экспортирует данные о расписании сотрудников в Google таблицу
 * Создает отдельный лист для каждого пользователя
 * Фиксирует самый ранний вход, самый поздний выход и общую сумму рабочих часов за день
 */
const exportEmployeeScheduleToGoogleSheets = async () => {
    try {
        // Получаем всех пользователей с ролью creator
        const users = await User.find({ position: 'creator' });
        
        if (!users || users.length === 0) {
            throw new Error('Не найдены пользователи с ролью creator');
        }

        // Use environment variable if exists or create a new spreadsheet
        const spreadsheetId = await googleSheets.getOrCreateSpreadsheet(
            'Расписание сотрудников', 
            process.env.EMPLOYEE_SCHEDULE_SPREADSHEET_ID
        );
        
        // Получаем информацию о листах
        const spreadsheet = await googleSheets.sheets.spreadsheets.get({
            spreadsheetId
        });
        
        // Get list of sheet titles
        const existingSheetTitles = spreadsheet.data.sheets.map(sheet => sheet.properties.title);
        console.log(`Все листы в таблице: ${JSON.stringify(existingSheetTitles)}`);
        
        // Create or update summary sheet
        const summarySheetName = "Сводная таблица";
        let summarySheetId = 0;
        
        if (!existingSheetTitles.includes(summarySheetName)) {
            console.log(`Создание сводного листа "${summarySheetName}"...`);
            await googleSheets.addSheet(spreadsheetId, summarySheetName);
            
            // Get updated spreadsheet for sheet ID
            const updatedSpreadsheet = await googleSheets.sheets.spreadsheets.get({
                spreadsheetId
            });
            
            const summarySheet = updatedSpreadsheet.data.sheets.find(s => s.properties.title === summarySheetName);
            if (summarySheet) {
                summarySheetId = summarySheet.properties.sheetId;
            }
        } else {
            // Find existing summary sheet ID
            const summarySheet = spreadsheet.data.sheets.find(s => s.properties.title === summarySheetName);
            if (summarySheet) {
                summarySheetId = summarySheet.properties.sheetId;
            }
            console.log(`Сводный лист "${summarySheetName}" уже существует, обновляем данные`);
        }
        
        // Prepare summary data
        const summaryHeaders = [
            'Сотрудник',
            'Общее время работы (часы)',
            'Количество смен',
            'Средняя продолжительность смены'
        ];
        
        const summaryData = [summaryHeaders];
        
        // Заголовки для таблицы пользователей
        const headers = [
            'Дата',
            'Первый вход',
            'Последний выход',
            'Общее время работы',
            'Все входы и выходы'
        ];

        // Для каждого пользователя создаем или обновляем отдельный лист
        for (const user of users) {
            // Получаем все записи о сменах для данного пользователя
            const shifts = await EmployeeSchedule.find({ creativeId: user._id }).sort({ shiftStart: 1 });
            
            // Определяем имя листа для пользователя
            const sheetTitle = user.username || `User_${user.tg_id}`;
            
            if (!shifts || shifts.length === 0) {
                console.log(`Для пользователя ${sheetTitle} не найдены записи о сменах`);
                // Add to summary with zeros
                summaryData.push([
                    sheetTitle,
                    '0',
                    '0',
                    '0'
                ]);
                continue;
            }

            // Проверяем, существует ли лист для пользователя
            if (!existingSheetTitles.includes(sheetTitle)) {
                console.log(`Создание листа для пользователя "${sheetTitle}"...`);
                await googleSheets.addSheet(spreadsheetId, sheetTitle);
            } else {
                console.log(`Лист "${sheetTitle}" уже существует, обновляем данные`);
            }
            
            // Группируем смены по дням
            const shiftsByDay = {};
            
            for (const shift of shifts) {
                const shiftStartDate = new Date(shift.shiftStart);
                const dateKey = shiftStartDate.toISOString().split('T')[0]; // Формат YYYY-MM-DD
                
                if (!shiftsByDay[dateKey]) {
                    shiftsByDay[dateKey] = [];
                }
                
                shiftsByDay[dateKey].push(shift);
            }

            // Подготавливаем данные для листа
            const values = [headers];
            
            // Calculate total work hours for summary
            let totalWorkHoursForUser = 0;
            let totalCompletedShifts = 0;
            
            for (const [dateKey, dayShifts] of Object.entries(shiftsByDay)) {
                // Находим самый ранний вход
                const earliestEntry = dayShifts.reduce((earliest, shift) => {
                    return new Date(shift.shiftStart) < new Date(earliest.shiftStart) ? shift : earliest;
                }, dayShifts[0]);
                
                // Находим самый поздний выход
                const latestExit = dayShifts.reduce((latest, shift) => {
                    // Если у смены нет времени окончания, пропускаем ее
                    if (!shift.shiftEnd) return latest;
                    // Если у latest еще нет времени окончания, берем текущую смену
                    if (!latest.shiftEnd) return shift;
                    return new Date(shift.shiftEnd) > new Date(latest.shiftEnd) ? shift : latest;
                }, { shiftEnd: null });
                
                // Рассчитываем общее время работы за день
                let totalWorkHours = 0;
                let allShiftsInfo = '';
                
                for (const shift of dayShifts) {
                    if (shift.shiftEnd) {
                        const shiftDuration = calculateDuration(shift.shiftStart, shift.shiftEnd);
                        totalWorkHours += shiftDuration;
                        totalWorkHoursForUser += shiftDuration;
                        totalCompletedShifts++;
                        
                        // Формируем строку с информацией о входе и выходе
                        allShiftsInfo += `${formatTime(shift.shiftStart)} - ${formatTime(shift.shiftEnd)} (${formatDuration(shiftDuration)})\n`;
                    } else {
                        allShiftsInfo += `${formatTime(shift.shiftStart)} - не завершено\n`;
                    }
                }
                
                // Форматируем дату для отображения
                const displayDate = new Date(dateKey).toLocaleDateString('ru-RU');
                
                // Добавляем строку с данными за день
                values.push([
                    displayDate,
                    formatTime(earliestEntry.shiftStart),
                    latestExit.shiftEnd ? formatTime(latestExit.shiftEnd) : 'Не завершено',
                    formatDuration(totalWorkHours),
                    allShiftsInfo.trim()
                ]);
            }

            // Записываем данные на лист
            await googleSheets.writeData(spreadsheetId, `${sheetTitle}!A1:E${values.length}`, values);
            console.log(`Данные обновлены в листе "${sheetTitle}"`);
            
            // Add to summary
            const avgShiftDuration = totalCompletedShifts > 0 
                ? totalWorkHoursForUser / totalCompletedShifts 
                : 0;
                
            summaryData.push([
                sheetTitle,
                totalWorkHoursForUser.toFixed(2),
                totalCompletedShifts.toString(),
                avgShiftDuration.toFixed(2)
            ]);
        }
        
        // Write summary data
        await googleSheets.writeData(spreadsheetId, `${summarySheetName}!A1:D${summaryData.length}`, summaryData);
        console.log(`Данные обновлены в сводном листе "${summarySheetName}"`);

        return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${summarySheetId}`;
    } catch (error) {
        console.error('Ошибка при экспорте расписания сотрудников:', error);
        throw new Error(`Ошибка при экспорте расписания сотрудников: ${error.message}`);
    }
};

module.exports = {
    exportEmployeeScheduleToGoogleSheets
}; 