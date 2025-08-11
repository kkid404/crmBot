const taskService = require('./task.service');
const userService = require('./user.service');

/**
 * Запускает проверку дедлайнов задач раз в час.
 * @param {import('telegraf').Telegraf} bot Экземпляр Telegraf для отправки уведомлений.
 * @param {number} [intervalMs=60*60*1000] Интервал проверки в миллисекундах.
 */
function startDeadlineChecker(bot, intervalMs = 60 * 60 * 1000) {
    if (!bot) {
        throw new Error('startDeadlineChecker: bot instance is required');
    }

    // Функция-проверка
    const checkDeadlines = async () => {
        try {
            // Получаем все задачи со статусом «progress»
            const tasks = await taskService.getTasksByState('progress');
            if (!tasks || tasks.length === 0) return;

            const now = new Date();
            const ONE_HOUR_MS = 60 * 60 * 1000;

            for (const task of tasks) {
                if (!task.expectedDate) continue;

                // Формируем объект даты дедлайна
                const deadline = new Date(task.expectedDate);
                if (task.expectedTime) {
                    const [hStr, mStr] = task.expectedTime.split(':');
                    const h = parseInt(hStr, 10);
                    const m = parseInt(mStr, 10);
                    if (!Number.isNaN(h) && !Number.isNaN(m)) {
                        deadline.setHours(h, m, 0, 0);
                    }
                }

                const diff = deadline - now;

                // Если до дедлайна остался ровно 1 час (±5 мин для надёжности)
                if (diff > 0 && diff <= ONE_HOUR_MS) {
                    await notifyAdminsAndCreator(bot, task, diff);
                }
            }
        } catch (err) {
            console.error('Deadline checker error:', err);
        }
    };

    // Запускаем сразу и далее каждые intervalMs
    checkDeadlines();
    setInterval(checkDeadlines, intervalMs);
}

/**
 * Уведомляет админов-креативщиков и назначенного креативщика о скором дедлайне.
 * @param {import('telegraf').Telegraf} bot
 * @param {Object} task
 * @param {number} diffMs
 */
async function notifyAdminsAndCreator(bot, task, diffMs) {
    // Ищем админов с position "creator"
    const admins = await userService.findUsers({ role: 'admin', position: 'creator' });

    // Собираем уникальные telegram id получателей
    const recipients = new Set();
    if (admins && admins.length) {
        admins.forEach(u => u.tg_id && recipients.add(String(u.tg_id)));
    }

    if (task.creator && task.creator.tg_id) {
        recipients.add(String(task.creator.tg_id));
    }

    if (recipients.size === 0) return;

    const minutesLeft = Math.round(diffMs / 1000 / 60);
    const msg = `⏰ До дедлайна задачи "${task.name}" осталось ${minutesLeft} минут. Пожалуйста, завершите работу вовремя.`;

    for (const tgId of recipients) {
        try {
            await bot.telegram.sendMessage(tgId, msg);
        } catch (err) {
            console.error(`Не удалось отправить уведомление пользователю ${tgId}:`, err.message);
        }
    }
}

module.exports = { startDeadlineChecker };
