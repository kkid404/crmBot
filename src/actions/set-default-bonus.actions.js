const taskService = require('../services/task.service');
const { Markup } = require('telegraf');

/**
 * Action handlers for setting default bonus
 */
const actions = (bot) => {
    // Функция для отображения меню установки бонуса
    const showBonusMenu = async (ctx) => {
        // Расчет даты отсечения на основе периода
        const timeFrame = ctx.session.bonusPeriod || 30;
        const defaultBonus = ctx.session.defaultBonus || 500;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - timeFrame);
        
        // Форматирование даты как ДД.ММ.ГГГГ
        const formattedDate = cutoffDate.toLocaleDateString('ru-RU');
        
        // Показываем подтверждение с указанной датой и суммой бонуса
        await ctx.reply(`Установить штрафной бонус ${defaultBonus} для всех выполненных заданий без бонуса до ${formattedDate} и далее?`, 
            Markup.inlineKeyboard([
                [Markup.button.callback(`✅ Да, установить штрафной бонус ${defaultBonus}`, 'set_default_bonus')],
                [Markup.button.callback('💰 Изменить сумму бонуса', 'change_bonus_amount')],
                [Markup.button.callback('⏱️ Изменить период (дней)', 'change_period')],
                [Markup.button.callback('❌ Отмена', 'cancel_bonus')]
            ])
        );
    };

    // Handler for "Set default bonus" button
    bot.action('set_default_bonus', async (ctx) => {
        try {
            await ctx.answerCbQuery('Устанавливаем бонус...');
            
            // Calculate the cutoff date based on the period
            const timeFrame = ctx.session.bonusPeriod || 30;
            const defaultBonus = ctx.session.defaultBonus || 500;
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - timeFrame);
            
            // Format the date as DD.MM.YYYY
            const formattedDate = cutoffDate.toLocaleDateString('ru-RU');
            
            // Show processing message with the specific date
            const message = await ctx.reply(`🔄 Устанавливаем штрафной бонус ${defaultBonus} для всех заданий без бонуса до ${formattedDate} и далее...`);
            
            // Call the service to set default bonus
            const result = await taskService.setDefaultBonus(defaultBonus, timeFrame);
            
            if (result.success) {
                await ctx.telegram.editMessageText(
                    ctx.chat.id, 
                    message.message_id, 
                    null, 
                    `✅ ${result.message}\n\nНайдено заданий: ${result.matchedCount}\nОбновлено заданий со штрафным бонусом: ${result.modifiedCount}`
                );
            } else {
                await ctx.telegram.editMessageText(
                    ctx.chat.id, 
                    message.message_id, 
                    null, 
                    `❌ Ошибка при установке бонуса: ${result.message}`
                );
            }
        } catch (error) {
            console.error('Error setting default bonus:', error);
            await ctx.reply('❌ Произошла ошибка при установке бонуса.');
        }
    });

    // Handler for "Change period" button
    bot.action('change_period', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            
            // Ask for new period
            await ctx.reply('Введите количество дней для поиска заданий без бонуса (например, 30):');
            
            // Set state to wait for period input
            ctx.session.waitingForBonusPeriod = true;
            ctx.session.waitingForBonusAmount = false;
            
        } catch (error) {
            console.error('Error in change_period action:', error);
            await ctx.reply('❌ Произошла ошибка при изменении периода.');
        }
    });

    // Handler for "Change bonus amount" button
    bot.action('change_bonus_amount', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            
            // Ask for new bonus amount
            await ctx.reply('Введите сумму штрафного бонуса (например, 500):');
            
            // Set state to wait for bonus amount input
            ctx.session.waitingForBonusAmount = true;
            ctx.session.waitingForBonusPeriod = false;
            
        } catch (error) {
            console.error('Error in change_bonus_amount action:', error);
            await ctx.reply('❌ Произошла ошибка при изменении суммы бонуса.');
        }
    });

    // Handler for "Cancel" button
    bot.action('cancel_bonus', async (ctx) => {
        try {
            await ctx.answerCbQuery('Операция отменена');
            await ctx.deleteMessage();
            await ctx.reply('❌ Операция установки бонуса отменена.');
        } catch (error) {
            console.error('Error in cancel_bonus action:', error);
        }
    });

    // Инициализация команды setbonus
    bot.command('setbonus', async (ctx) => {
        // Показываем меню бонуса
        await showBonusMenu(ctx);
    });

    // Обработчик для текстовых сообщений - с более высоким приоритетом
    bot.on('text', async (ctx, next) => {
        console.log('[BONUS HANDLER] Received text message:', ctx.message.text);
        console.log('[BONUS HANDLER] Session state:', {
            waitingForBonusPeriod: ctx.session?.waitingForBonusPeriod,
            waitingForBonusAmount: ctx.session?.waitingForBonusAmount,
            bonusPeriod: ctx.session?.bonusPeriod,
            defaultBonus: ctx.session?.defaultBonus
        });
        
        // Проверяем, ожидаем ли мы ввод периода
        if (ctx.session?.waitingForBonusPeriod === true) {
            console.log('[BONUS HANDLER] Processing period input');
            const text = (ctx.message.text || '').trim();

            // 1) Попытка распарсить как DD.MM.YYYY
            const dateMatch = text.match(/^([0-3]?\d)\.([0-1]?\d)\.(\d{4})$/);
            if (dateMatch) {
                const d = parseInt(dateMatch[1], 10);
                const m = parseInt(dateMatch[2], 10) - 1; // 0-based month
                const y = parseInt(dateMatch[3], 10);
                const cutoffDate = new Date(y, m, d, 0, 0, 0, 0);

                if (isNaN(cutoffDate.getTime())) {
                    await ctx.reply('❌ Некорректная дата. Введите в формате ДД.MM.ГГГГ или количество дней.');
                    return;
                }

                const now = new Date();
                // Разница в днях: сколько дней назад была введённая дата
                const diffMs = now.setHours(0,0,0,0) - cutoffDate.getTime();
                const periodDays = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));

                ctx.session.bonusPeriod = periodDays;
                ctx.session.waitingForBonusPeriod = false;

                await ctx.reply(`✅ Дата отсечения установлена: ${text} (период: ${periodDays} дн.)`);
                await showBonusMenu(ctx);
                return;
            }

            // 2) Иначе пробуем как число дней
            const period = parseInt(text, 10);
            if (isNaN(period) || period <= 0) {
                await ctx.reply('❌ Пожалуйста, введите корректное число дней (положительное целое число) или дату в формате ДД.MM.ГГГГ.');
                return;
            }

            // Сохраняем период в сессии
            ctx.session.bonusPeriod = period;
            ctx.session.waitingForBonusPeriod = false;

            await ctx.reply(`✅ Период установлен: ${period} дней`);
            // Показываем меню бонуса с обновленным периодом
            await showBonusMenu(ctx);
            return;
        }
        
        // Проверяем, ожидаем ли мы ввод суммы бонуса
        if (ctx.session?.waitingForBonusAmount === true) {
            console.log('[BONUS HANDLER] Processing bonus amount input');
            const text = ctx.message.text;
            const bonusAmount = parseInt(text);
            
            if (isNaN(bonusAmount) || bonusAmount <= 0) {
                await ctx.reply('❌ Пожалуйста, введите корректную сумму бонуса (положительное целое число).');
                return;
            }
            
            // Сохраняем сумму бонуса в сессии
            ctx.session.defaultBonus = bonusAmount;
            ctx.session.waitingForBonusAmount = false;
            
            await ctx.reply(`✅ Сумма бонуса установлена: ${bonusAmount}`);
            
            // Показываем меню бонуса с обновленной суммой бонуса
            await showBonusMenu(ctx);
            return;
        }
        
        // Если мы не ожидаем никакого ввода, передаем управление следующему обработчику
        console.log('[BONUS HANDLER] Not handling this message, passing to next handler');
        return next();
    });
};

module.exports = { actions };
