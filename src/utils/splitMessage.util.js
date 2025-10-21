/**
 * Функция для разбивки длинных сообщений на части (лимит Telegram - 4096 символов)
 * @param {string} text - Текст для разбивки
 * @param {number} maxLength - Максимальная длина одного сообщения (по умолчанию 4096)
 * @returns {string[]} - Массив частей сообщения
 */
const splitLongMessage = (text, maxLength = 4096) => {
    const messages = [];
    let currentMessage = '';
    
    // Разбиваем текст по строкам
    const lines = text.split('\n');
    
    for (const line of lines) {
        // Если добавление строки превысит лимит, сохраняем текущее сообщение
        if (currentMessage.length + line.length + 1 > maxLength) {
            if (currentMessage) {
                messages.push(currentMessage.trim());
                currentMessage = '';
            }
            // Если одна строка слишком длинная, разбиваем её
            if (line.length > maxLength) {
                for (let i = 0; i < line.length; i += maxLength) {
                    messages.push(line.substring(i, i + maxLength));
                }
            } else {
                currentMessage = line;
            }
        } else {
            currentMessage += (currentMessage ? '\n' : '') + line;
        }
    }
    
    // Добавляем последнее сообщение
    if (currentMessage) {
        messages.push(currentMessage.trim());
    }
    
    return messages.length > 0 ? messages : [text];
};

module.exports = splitLongMessage;
