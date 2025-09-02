const taskService = require('./task.service');
const UserService = require('./user.service');
const User = require('../databases/user.model');
const { retryOperation } = require('../utils/retry.util');

// Объект для хранения информации об отправленных уведомлениях
// Формат: { taskId: timestamp }
const notifications = {};

// Функция для очистки старых уведомлений (старше 48 часов)
function cleanupOldNotifications() {
    const now = Date.now();
    const twoDaysMs = 48 * 60 * 60 * 1000; // 48 часов в миллисекундах
    
    Object.keys(notifications).forEach(taskId => {
        if (now - notifications[taskId] > twoDaysMs) {
            delete notifications[taskId];
            log(`Удалена старая запись о задаче ${taskId}`);
        }
    });
    
    log(`Текущее количество отслеживаемых задач: ${Object.keys(notifications).length}`);
}

// Логирование с временной меткой
function log(message, data = '') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`, data || '');
}

/**
 * Запускает проверку дедлайнов задач.
 * @param {import('telegraf').Telegraf} bot Экземпляр Telegraf для отправки уведомлений.
 * @param {number} [intervalMs=15*60*1000] Интервал проверки в миллисекундах (по умолчанию 15 минут).
 */
function startDeadlineChecker(bot, intervalMs = 15 * 60 * 1000) {
    if (!bot) {
        throw new Error('startDeadlineChecker: bot instance is required');
    }

    // Функция-проверка
    const checkDeadlines = async () => {
        log('Запуск проверки дедлайнов');
        try {
            // Получаем все задачи со статусом «progress»
            const tasks = await taskService.getTasksByState('progress');
            log(`Найдено задач в статусе progress: ${tasks?.length || 0}`);
            if (!tasks || tasks.length === 0) return;

            const now = new Date();
            const ONE_HOUR_MS = 60 * 60 * 1000;

            for (const task of tasks) {
                if (!task.expectedDate) {
                    log(`Задача ${task._id} пропущена: не указан expectedDate`);
                    continue;
                }

                // Формируем объект даты дедлайна
                const deadline = new Date(task.expectedDate);
                if (task.expectedTime) {
                    const [hStr, mStr] = task.expectedTime.split(':');
                    const h = parseInt(hStr, 10);
                    const m = parseInt(mStr, 10);
                    if (!Number.isNaN(h) && !Number.isNaN(m)) {
                        deadline.setHours(h, m, 0, 0);
                    }
                } else {
                    log(`Для задачи ${task._id} не указано expectedTime, будет использовано 23:59`);
                    deadline.setHours(23, 59, 0, 0);
                }

                const diff = deadline - now;
                log(`Задача ${task._id} '${task.name}': до дедлайна ${Math.round(diff/1000/60)} минут`);

                // Если до дедлайна остался ровно 1 час (±5 мин для надёжности)
                if (diff > 0 && diff <= ONE_HOUR_MS) {
                    // Проверяем, не отправляли ли уже уведомление по этой задаче
                    const taskId = task._id.toString();
                    if (!notifications[taskId]) {
                        log(`Отправка уведомления по задаче ${taskId} (осталось ${Math.round(diff/1000/60)} мин)`);
                        await notifyAdminsAndCreator(bot, task, diff);
                        // Записываем время отправки уведомления
                        notifications[taskId] = Date.now();
                        log(`Задача ${taskId} добавлена в журнал уведомлений`);
                    } else {
                        log(`Уведомление по задаче ${taskId} уже было отправлено ранее`);
                    }
                } else if (diff > ONE_HOUR_MS) {
                    log(`До дедлайна задачи ${task._id} больше часа: ${Math.round(diff/1000/60/60)} часов`);
                } else {
                    log(`Дедлайн задачи ${task._id} уже прошел: ${Math.abs(Math.round(diff/1000/60))} минут назад`);
                }
            }
        } catch (err) {
            console.error('Deadline checker error:', err);
        }
    };

    // Запускаем сразу и далее каждые intervalMs
    checkDeadlines();
    setInterval(checkDeadlines, intervalMs);
    
    // Запускаем очистку старых уведомлений раз в сутки
    cleanupOldNotifications();
    setInterval(cleanupOldNotifications, 24 * 60 * 60 * 1000); // Раз в сутки
}

/**
 * Уведомляет админов-креативщиков и назначенного креативщика о скором дедлайне.
 * @param {import('telegraf').Telegraf} bot
 * @param {Object} task
 * @param {number} diffMs
 */
async function notifyAdminsAndCreator(bot, task, diffMs) {
    // Ищем админов с position "creator"
    const admins = await User.find({ role: 'admin', position: 'creator' });
    log(`Найдено админов-креативщиков: ${admins?.length || 0}`);

    // Собираем уникальные telegram id получателей
    const recipients = new Set();
    if (admins && admins.length) {
        admins.forEach(u => {
            if (u.tg_id) {
                recipients.add(String(u.tg_id));
                log(`Добавлен получатель (админ): ${u.tg_id}`);
            } else {
                log(`У админа ${u._id} не указан tg_id`);
            }
        });
    }

    if (task.creator) {
        if (task.creator.tg_id) {
            recipients.add(String(task.creator.tg_id));
            log(`Добавлен получатель (создатель): ${task.creator.tg_id}`);
        } else {
            log(`У создателя задачи ${task.creator._id || 'unknown'} не указан tg_id`);
        }
    } else {
        log('У задачи не указан создатель');
    }

    if (recipients.size === 0) {
        log('Нет получателей для уведомления');
        return;
    }

    const minutesLeft = Math.round(diffMs / 1000 / 60);
    const msg = `⏰ До дедлайна задачи "${task.name}" осталось ${minutesLeft} минут. Пожалуйста, завершите работу вовремя.`;

    for (const tgId of recipients) {
        try {
            log(`Отправка сообщения пользователю ${tgId}: ${msg}`);
            await retryOperation(async () => await bot.telegram.sendMessage(tgId, msg));
            log(`Сообщение успешно отправлено пользователю ${tgId}`);
        } catch (err) {
            console.error(`Не удалось отправить уведомление пользователю ${tgId}:`, err.message);
            log(`Ошибка отправки пользователю ${tgId}: ${err.message}`, { stack: err.stack });
        }
    }
}

module.exports = { startDeadlineChecker };
