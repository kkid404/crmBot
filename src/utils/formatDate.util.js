/**
 * Утилиты для форматирования дат по московскому времени (МСК, UTC+3)
 */

const TIMEZONE = 'Europe/Moscow';
const LOCALE = 'ru-RU';

/**
 * Форматирует дату в формате "ДД.ММ.ГГГГ" по московскому времени
 * @param {Date|string|number} date - Дата для форматирования
 * @returns {string} - Отформатированная дата
 */
const formatDateMSK = (date) => {
    if (!date) return '';
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleDateString(LOCALE, { timeZone: TIMEZONE });
};

/**
 * Форматирует дату и время в формате "ДД.ММ.ГГГГ, ЧЧ:ММ:СС" по московскому времени
 * @param {Date|string|number} date - Дата для форматирования
 * @returns {string} - Отформатированная дата и время
 */
const formatDateTimeMSK = (date) => {
    if (!date) return '';
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleString(LOCALE, { timeZone: TIMEZONE });
};

/**
 * Форматирует только время в формате "ЧЧ:ММ:СС" по московскому времени
 * @param {Date|string|number} date - Дата для форматирования
 * @returns {string} - Отформатированное время
 */
const formatTimeMSK = (date) => {
    if (!date) return '';
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleTimeString(LOCALE, { timeZone: TIMEZONE });
};

module.exports = {
    formatDateMSK,
    formatDateTimeMSK,
    formatTimeMSK,
    TIMEZONE,
    LOCALE
};
