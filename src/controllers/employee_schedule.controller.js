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

        // Создаем новую таблицу
        const spreadsheetId = await googleSheets.createSpreadsheet('Расписание сотрудников');
        
        // Получаем информацию о первом листе
        const spreadsheet = await googleSheets.sheets.spreadsheets.get({
            spreadsheetId
        });
        const firstSheetId = spreadsheet.data.sheets[0].properties.sheetId;
        
        // Заголовки для таблицы
        const headers = [
            'Дата',
            'Первый вход',
            'Последний выход',
            'Общее время работы',
            'Все входы и выходы'
        ];

        // Для каждого пользователя создаем отдельный лист
        for (const user of users) {
            // Получаем все записи о сменах для данного пользователя
            const shifts = await EmployeeSchedule.find({ creativeId: user._id }).sort({ shiftStart: 1 });
            
            if (!shifts || shifts.length === 0) {
                console.log(`Для пользователя ${user.username || user.tg_id} не найдены записи о сменах`);
                continue;
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

            // Создаем новый лист для пользователя
            const sheetTitle = user.username || `User_${user.tg_id}`;
            await googleSheets.addSheet(spreadsheetId, sheetTitle);

            // Подготавливаем данные для листа
            const values = [headers];
            
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
        console.error('Ошибка при экспорте расписания сотрудников:', error);
        throw new Error(`Ошибка при экспорте расписания сотрудников: ${error.message}`);
    }
};

module.exports = {
    exportEmployeeScheduleToGoogleSheets
}; 