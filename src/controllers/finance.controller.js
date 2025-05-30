const Task         = require('../databases/task.model');
const User         = require('../databases/user.model');
const googleSheets = require('../services/googleSheets.service');

const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

/**
 * Создаёт (или перезаписывает) финансовый отчёт в Google Sheets.
 * @param {number|string} monthOrStartDate – 1‑based (1 = Jan) месяц или начальная дата в формате 'DD.MM'
 * @param {number|string} yearOrEndDate – год или конечная дата в формате 'DD.MM'
 * @param {number} [year] – год (опционально, если используются даты в формате 'DD.MM')
 * @returns {Promise<string>} public URL
 */
async function exportFinanceReport(monthOrStartDate, yearOrEndDate, year) {
  let periodStart, periodEnd, isDateRange = false;
  let title;
  
  // Проверка формата даты (DD.MM)
  const dateFormatRegex = /^(0[1-9]|[12][0-9]|3[01])\.(0[1-9]|1[0-2])$/;
  
  if (typeof monthOrStartDate === 'string' && dateFormatRegex.test(monthOrStartDate) && 
      typeof yearOrEndDate === 'string' && dateFormatRegex.test(yearOrEndDate)) {
    // Используем диапазон дат
    isDateRange = true;
    const currentYear = year || new Date().getFullYear();
    
    console.log(`[FINANCE] Processing date range with year: ${currentYear}`);
    
    // Парсинг начальной даты
    const [startDay, startMonth] = monthOrStartDate.split('.').map(Number);
    // Создаем дату в локальном времени, а не в UTC
    periodStart = new Date(currentYear, startMonth-1, startDay, 0, 0, 0);
    
    // Парсинг конечной даты
    const [endDay, endMonth] = yearOrEndDate.split('.').map(Number);
    periodEnd = new Date(currentYear, endMonth-1, endDay, 23, 59, 59);
    
    console.log('[FINANCE] Date range:', {
      startDate: monthOrStartDate,
      endDate: yearOrEndDate,
      parsedStartDate: periodStart.toISOString(),
      parsedEndDate: periodEnd.toISOString()
    });
  } else {
    // Используем месяц и год (стандартный формат)
    const month = parseInt(monthOrStartDate);
    const yearValue = parseInt(yearOrEndDate);
    
    // Проверяем, что параметры корректны
    if (isNaN(month) || isNaN(yearValue) || month < 1 || month > 12) {
      throw new Error(`Неверный формат месяца/года: ${monthOrStartDate}/${yearOrEndDate}`);
    }
    
    // Создаем даты в локальном времени, а не в UTC
    periodStart = new Date(yearValue, month-1, 1, 0, 0, 0);
    periodEnd = new Date(yearValue, month, 0, 23, 59, 59);
    
    console.log('[FINANCE] Month period:', {
      month: month,
      year: yearValue,
      start: periodStart.toISOString(),
      end: periodEnd.toISOString()
    });
  }

  // --------------- 1. pull tasks for the month
  console.log('[FINANCE] Query period:', {
    start: periodStart.toISOString(),
    end: periodEnd.toISOString()
  });
  
  const tasks = await Task.find({
    state: 'done',
    completionDate: { $gte: periodStart, $lte: periodEnd },
  }).populate('buyer').populate('creator');
  
  console.log(`[FINANCE] Found ${tasks.length} tasks in the date range`);

  // helpers
  const safeUsername = u => u?.username || `id_${u?.tg_id}`;

  // --------------- 2. aggregate bonuses
  const byCreator = new Map();
  const byBuyer   = new Map();
  
  // Новые агрегаторы для штрафных бонусов
  const penaltyByCreator = new Map();
  const penaltyByBuyer = new Map();
  
  tasks.forEach(t => {
    const bonus = t.bonus ?? 0;
    const buyerKey   = safeUsername(t.buyer);
    const creatorKey = safeUsername(t.creator);
    
    // Разделяем обычные и штрафные бонусы
    if (t.isPenaltyBonus) {
      // Штрафные бонусы
      penaltyByCreator.set(creatorKey, { 
        count: (penaltyByCreator.get(creatorKey)?.count || 0) + 1, 
        sum: (penaltyByCreator.get(creatorKey)?.sum || 0) + bonus 
      });
      penaltyByBuyer.set(buyerKey, { 
        count: (penaltyByBuyer.get(buyerKey)?.count || 0) + 1, 
        sum: (penaltyByBuyer.get(buyerKey)?.sum || 0) + bonus 
      });
    } else {
      // Обычные бонусы
      byCreator.set(creatorKey, { 
        count: (byCreator.get(creatorKey)?.count || 0) + 1, 
        sum: (byCreator.get(creatorKey)?.sum || 0) + bonus 
      });
      byBuyer.set(buyerKey, { 
        count: (byBuyer.get(buyerKey)?.count || 0) + 1, 
        sum: (byBuyer.get(buyerKey)?.sum || 0) + bonus 
      });
    }
  });

  // --------------- 3. build sheet‑data arrays
  // Обычные бонусы
  const creatorBonusRows = [['Креативщик', 'К‑во креативов', 'Сумма бонусов']];
  for (const [name, {count, sum}] of byCreator) {
    creatorBonusRows.push([name, count, sum]);
  }

  const buyerBonusRows = [['Баер', 'К‑во креативов', 'Сумма бонусов']];
  for (const [name, {count, sum}] of byBuyer) {
    buyerBonusRows.push([name, count, sum]);
  }
  
  // Штрафные бонусы
  const penaltyCreatorBonusRows = [['Креативщик', 'К‑во креативов со штрафным бонусом', 'Сумма штрафных бонусов']];
  for (const [name, {count, sum}] of penaltyByCreator) {
    penaltyCreatorBonusRows.push([name, count, sum]);
  }

  const penaltyBuyerBonusRows = [['Баер', 'К‑во креативов со штрафным бонусом', 'Сумма штрафных бонусов']];
  for (const [name, {count, sum}] of penaltyByBuyer) {
    penaltyBuyerBonusRows.push([name, count, sum]);
  }

  // Детализация по креативам
  const creativesByBuyerRows = [['Баер', 'Название ТЗ', 'Бонус', 'Штрафной', 'Дата']];
  tasks.forEach(t => {
    creativesByBuyerRows.push([
      safeUsername(t.buyer),
      t.name,
      t.bonus ?? 0,
      t.isPenaltyBonus ? 'Да' : 'Нет',  // Добавляем пометку о штрафном бонусе
      t.completionDate ? new Date(t.completionDate).toLocaleDateString('ru-RU') : ''
    ]);
  });

  const creativesByCreatorRows = [['Креативщик', 'Название ТЗ', 'Бонус', 'Штрафной', 'Дата']];
  tasks.forEach(t => {
    creativesByCreatorRows.push([
      safeUsername(t.creator),
      t.name,
      t.bonus ?? 0,
      t.isPenaltyBonus ? 'Да' : 'Нет',  // Добавляем пометку о штрафном бонусе
      t.completionDate ? new Date(t.completionDate).toLocaleDateString('ru-RU') : ''
    ]);
  });

  // --------------- 4. push to Google Sheets
  if (isDateRange) {
    const formatDate = (date) => {
      return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    };
    title = `Финансы – ${formatDate(periodStart)} - ${formatDate(periodEnd)}`;
  } else {
    // В этом случае monthOrStartDate - это месяц, а yearOrEndDate - это год
    title = `Финансы – ${monthNames[monthOrStartDate-1]} ${yearOrEndDate}`;
  }
  const spreadsheetId = await googleSheets.getOrCreateSpreadsheet(title);
  
  const sheetsPayload = [
    { title: 'Бонусы‑креативщикам', data: creatorBonusRows },
    { title: 'Бонусы‑баеры', data: buyerBonusRows },
    { title: 'Штрафные‑бонусы‑баеры', data: penaltyBuyerBonusRows },
    { title: 'Креативы‑по‑баерам', data: creativesByBuyerRows },
    { title: 'Креативы‑по‑креативщикам', data: creativesByCreatorRows },
  ];

  for (const {title: sheetTitle, data} of sheetsPayload) {
    await googleSheets.prepareSheet(spreadsheetId, sheetTitle); // small util inside service – clears/creates sheet
    await googleSheets.writeData(spreadsheetId, `${sheetTitle}!A1`, data);
  }
  await googleSheets.deleteSheetByTitle(spreadsheetId, 'Лист 1');

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

module.exports = { exportFinanceReport };