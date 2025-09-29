const { start } = require('../keyboards/start.keyboard');
const { exportFinanceReport } = require('../controllers/finance.controller');
const ru = require('../lang/ru.json');
const { Markup } = require('telegraf');

/**
 * Обработчик генерации отчётов за текущий месяц – используется для callback‑кнопки и для reply‑клавиатуры.
 */
async function handleGenerateAll(ctx) {
  const loading = await ctx.reply(ru.messages.finance.generating);
  // Run in background to avoid blocking Telegraf update pipeline
  setImmediate(async () => {
    try {
      const today = new Date();
      const url = await exportFinanceReport(today.getMonth() + 1, today.getFullYear());
      await ctx.reply(
        `${ru.messages.finance.done}
${url}`,
        start(ctx.chat.id)
      );
    } catch (e) {
      console.error(e);
      try { await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, undefined, 'Ошибка генерации'); } catch {}
    }
  });
}

/**
 * Показывает меню выбора периода для отчёта
 */
async function showPeriodSelector(ctx) {
  // Получаем текущую дату
  const today = new Date();
  const currentMonth = today.getMonth(); // 0-based (0 = Jan)
  const currentYear = today.getFullYear();
  
  // Создаем кнопки для последних 6 месяцев
  const buttons = [];
  const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  
  for (let i = 0; i < 6; i++) {
    let month = currentMonth - i;
    let year = currentYear;
    
    // Корректируем месяц и год, если нужно
    if (month < 0) {
      month += 12;
      year -= 1;
    }
    
    // Создаем кнопку с названием месяца и года
    buttons.push(Markup.button.callback(
      `${monthNames[month]} ${year}`, 
      `fin_generate_${month + 1}_${year}`
    ));
  }
  
  // Добавляем кнопки для выбора произвольного периода и диапазона дат
  buttons.push(Markup.button.callback('Другой месяц', 'fin_custom_period'));
  buttons.push(Markup.button.callback('Диапазон дат', 'fin_date_range'));
  
  // Формируем клавиатуру из кнопок (по 2 в ряду)
  const keyboard = [];
  for (let i = 0; i < buttons.length; i += 2) {
    const row = [buttons[i]];
    if (i + 1 < buttons.length) {
      row.push(buttons[i + 1]);
    }
    keyboard.push(row);
  }
  
  await ctx.reply(
    ru.messages.finance.select_period || 'Выберите период для отчёта:',
    Markup.inlineKeyboard(keyboard)
  );
}

/**
 * Обработчик генерации отчёта за выбранный период
 */
async function handleGenerateForPeriod(ctx, month, year) {
  const loading = await ctx.reply(ru.messages.finance.generating);
  setImmediate(async () => {
    try {
      const url = await exportFinanceReport(month, year);
      await ctx.reply(
        `${ru.messages.finance.done}
${url}`,
        start(ctx.chat.id)
      );
    } catch (e) {
      console.error(e);
      try { await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, undefined, 'Ошибка генерации'); } catch {}
    }
  });
}

/**
 * Обработчик для ввода произвольного периода (месяц/год)
 */
async function handleCustomPeriod(ctx) {
  // Сохраняем в сессии, что ожидаем ввод месяца
  ctx.session = ctx.session || {};
  ctx.session.financeState = 'waiting_month';
  
  await ctx.reply(
    'Введите номер месяца (1-12):',
    Markup.forceReply()
  );
}

/**
 * Обработчик для ввода диапазона дат
 */
async function handleDateRange(ctx) {
  // Сохраняем в сессии, что ожидаем ввод начальной даты
  ctx.session = ctx.session || {};
  ctx.session.financeState = 'waiting_start_date';
  
  await ctx.reply(
    'Введите начальную дату в формате ДД.ММ (например, 12.05):',
    Markup.forceReply()
  );
}

const actions = bot => {
  // --- определяем, какие триггеры есть в ru.keyboards.startFinance
  const financeTriggers = Array.isArray(ru.keyboards.startFinance)
    ? ru.keyboards.startFinance                    // ['📊 Собрать отчёты'] вариант‑старый
    : Object.values(ru.keyboards.startFinance);    // { generateAll:"📊 Собрать отчёты" } вариант‑новый

  // reply‑кнопка «📊 Собрать отчёты»
  bot.hears(financeTriggers, showPeriodSelector);

  // /finance – покажет меню выбора периода
  bot.command('finance', showPeriodSelector);

  // inline‑callback «📊 Собрать отчёты»
  bot.action('fin_generateAll', handleGenerateAll);
  
  // Обработчики для выбора периода
  bot.action(/fin_generate_(\d+)_(\d+)/, async (ctx) => {
    const match = ctx.match;
    const month = parseInt(match[1]);
    const year = parseInt(match[2]);
    await handleGenerateForPeriod(ctx, month, year);
  });
  
  // Обработчики для выбора произвольных периодов
  bot.action('fin_custom_period', handleCustomPeriod);
  bot.action('fin_date_range', handleDateRange);
  
  // Обработчик ввода месяца, года и диапазона дат
  bot.on('text', async (ctx, next) => {
    console.log('[FINANCE HANDLER] Received text message:', ctx.message.text);
    console.log('[FINANCE HANDLER] Finance state:', {
      financeState: ctx.session?.financeState,
      financeMonth: ctx.session?.financeMonth,
      financeStartDate: ctx.session?.financeStartDate
    });
    
    // Функция проверки формата даты ДД.ММ
    const isValidDateFormat = (dateStr) => {
      // Проверка на формат даты ДД.ММ
      const regex = /^(0[1-9]|[12][0-9]|3[01])\.(0[1-9]|1[0-2])$/;
      if (!regex.test(dateStr)) {
        console.log(`[FINANCE HANDLER] Invalid date format: ${dateStr}`);
        return false;
      }
      
      // Дополнительная проверка корректности даты
      const [day, month] = dateStr.split('.').map(Number);
      const currentYear = new Date().getFullYear();
      const date = new Date(currentYear, month - 1, day);
      const isValid = date.getDate() === day && date.getMonth() === month - 1;
      
      if (!isValid) {
        console.log(`[FINANCE HANDLER] Invalid date: ${dateStr}, parsed as ${date.toISOString()}`);
      }
      
      return isValid;
    };
    
    // Проверяем, ожидаем ли ввод начальной даты диапазона
    if (ctx.session?.financeState === 'waiting_start_date') {
      console.log('[FINANCE HANDLER] Processing start date input');
      const startDate = ctx.message.text.trim();
      
      if (!isValidDateFormat(startDate)) {
        await ctx.reply('Пожалуйста, введите корректную дату в формате ДД.ММ (например, 12.05):');
        return;
      }
      
      // Сохраняем начальную дату и ждём ввода конечной даты
      ctx.session.financeStartDate = startDate;
      ctx.session.financeState = 'waiting_end_date';
      
      await ctx.reply('Теперь введите конечную дату в формате ДД.ММ (например, 22.05):');
      return;
    }
    
    // Проверяем, ожидаем ли ввод конечной даты диапазона
    if (ctx.session?.financeState === 'waiting_end_date') {
      console.log('[FINANCE HANDLER] Processing end date input');
      const endDate = ctx.message.text.trim();
      
      if (!isValidDateFormat(endDate)) {
        await ctx.reply('Пожалуйста, введите корректную дату в формате ДД.ММ (например, 22.05):');
        return;
      }
      
      // Получаем сохраненную начальную дату
      const startDate = ctx.session.financeStartDate;
      
      // Сбрасываем состояние
      delete ctx.session.financeState;
      delete ctx.session.financeStartDate;
      
      // Генерируем отчёт за диапазон дат
      const loading = await ctx.reply(ru.messages.finance.generating);
      try {
        // Явно передаём текущий год для корректной обработки дат
        const currentYear = new Date().getFullYear();
        console.log(`[FINANCE HANDLER] Generating report for date range: ${startDate} - ${endDate}, year: ${currentYear}`);
        const url = await exportFinanceReport(startDate, endDate, currentYear);
        await ctx.reply(
          `${ru.messages.finance.done}\n${url}`,
          start(ctx.chat.id)
        );
      } catch (e) {
        console.error(e);
        await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, undefined, 'Ошибка генерации');
      }
      return;
    }
    
    // Проверяем, находимся ли в режиме ожидания ввода месяца
    if (ctx.session?.financeState === 'waiting_month') {
      console.log('[FINANCE HANDLER] Processing month input');
      const month = parseInt(ctx.message.text);
      
      if (isNaN(month) || month < 1 || month > 12) {
        await ctx.reply('Пожалуйста, введите корректный номер месяца (1-12):');
        return;
      }
      
      // Сохраняем месяц и ждём ввода года
      ctx.session.financeMonth = month;
      ctx.session.financeState = 'waiting_year';
      
      await ctx.reply('Теперь введите год (например, 2025):');
      return;
    }
    
    if (ctx.session?.financeState === 'waiting_year') {
      console.log('[FINANCE HANDLER] Processing year input');
      const year = parseInt(ctx.message.text);
      const currentYear = new Date().getFullYear();
      
      if (isNaN(year) || year < 2020 || year > currentYear + 1) {
        await ctx.reply(`Пожалуйста, введите корректный год (2020-${currentYear + 1}):`);
        return;
      }
      
      // Получаем сохраненный месяц
      const month = ctx.session.financeMonth;
      
      // Сбрасываем состояние
      delete ctx.session.financeState;
      delete ctx.session.financeMonth;
      
      // Генерируем отчёт
      await handleGenerateForPeriod(ctx, month, year);
      return;
    }
    
    // Если мы не обрабатываем сообщение, передаем управление следующему обработчику
    console.log('[FINANCE HANDLER] Not handling this message, passing to next handler');
    return next();
  });
};

module.exports = { actions };