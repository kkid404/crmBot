// finance.controller.js
const Task         = require('../databases/task.model');
const User         = require('../databases/user.model');
const googleSheets = require('../services/googleSheets.service');

const monthNames = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
];

/**
 * Экспортирует финансовый отчёт в Google Sheets.
 * @param {number|string} monthOrStartDate  1-based номер месяца **или** дата 'DD.MM'
 * @param {number|string} yearOrEndDate     год **или** дата 'DD.MM'
 * @param {number}        [year]            год (если указан диапазон дат)
 * @returns {Promise<string>} публичный URL таблицы
 */
async function exportFinanceReport(monthOrStartDate, yearOrEndDate, year) {
  /* ---------------- 0. вычисляем период ---------------- */
  const dateRegex = /^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])$/;
  let periodStart, periodEnd, title;

  if (dateRegex.test(monthOrStartDate) && dateRegex.test(yearOrEndDate)) {
    /* Диапазон DD.MM-DD.MM */
    const currentYear = year || new Date().getFullYear();
    const [sD, sM] = monthOrStartDate.split('.').map(Number);
    const [eD, eM] = yearOrEndDate.split('.').map(Number);

    periodStart = new Date(currentYear, sM - 1, sD, 0, 0, 0);
    periodEnd   = new Date(currentYear, eM - 1, eD, 23, 59, 59);

    title = `Финансы – ${monthOrStartDate}-${yearOrEndDate}`;
  } else {
    /* Календарный месяц */
    const m = Number(monthOrStartDate);
    const y = Number(yearOrEndDate);
    if (Number.isNaN(m) || m < 1 || m > 12 || Number.isNaN(y)) {
      throw new Error(`Неверные параметры периода: ${monthOrStartDate}, ${yearOrEndDate}`);
    }

    periodStart = new Date(y, m - 1, 1, 0, 0, 0);
    periodEnd   = new Date(y, m,     0, 23, 59, 59);

    title = `Финансы – ${monthNames[m - 1]} ${y}`;
  }

  /* ---------------- 1. получаем задачи ---------------- */
  const tasks = await Task.find({
    completionDate: { $gte: periodStart, $lte: periodEnd },
    state: { $nin: ['canceled', 'draft'] }
  })
    .populate('buyer')
    .populate('creator');

  /* ---------------- 2. агрегируем суммы ---------------- */
  const byCreator          = new Map();  // сводная (+/-)
  const byBuyer            = new Map();
  const penaltyByCreator   = new Map();  // только штрафы
  const penaltyByBuyer     = new Map();

  const add = (map, key, bonus) => {
    const cur = map.get(key) || { count: 0, sum: 0 };
    map.set(key, { count: cur.count + 1, sum: cur.sum + bonus });
  };

  const safeUsername = u => u?.username || `id_${u?.tg_id}`;

  tasks.forEach(t => {
    const rawBonus   = Number(t.bonus) || 0;
    const signed     = t.isPenaltyBonus ? Math.abs(rawBonus) : rawBonus;
    const creatorKey = safeUsername(t.creator);
    const buyerKey   = safeUsername(t.buyer);

    /* сводная (штрафы уже со знаком «–») */
    add(byCreator, creatorKey, signed);
    add(byBuyer,   buyerKey,   signed);

    /* отдельные листы со штрафами */
    if (t.isPenaltyBonus) {
      add(penaltyByCreator, creatorKey, rawBonus); // положительное число
      add(penaltyByBuyer,   buyerKey,   rawBonus);
    }
  });

  /* ---------------- 3. формируем данные для листов ---------------- */
  const makeRows = (header, map) => {
    const rows = [header];
    for (const [name, {count, sum}] of map) rows.push([name, count, sum]);
    return rows;
  };

  const creatorRows         = makeRows(['Креативщик','К-во','Сумма'],           byCreator);
  const buyerRows           = makeRows(['Баер','К-во','Сумма'],                 byBuyer);
  const penaltyCreatorRows  = makeRows(['Креативщик','К-во штрафных','Сумма'],  penaltyByCreator);
  const penaltyBuyerRows    = makeRows(['Баер','К-во штрафных','Сумма'],        penaltyByBuyer);

  /* детальные листы */
  const creativesByBuyerRows = [['Баер','ТЗ','Бонус','Штрафной','Дата']];
  const creativesByCreatorRows = [['Креативщик','ТЗ','Бонус','Штрафной','Дата']];

  tasks.forEach(t => {
    const row = [
      t.name,
      Number(t.bonus) || 0,
      t.isPenaltyBonus ? 'Да' : '',
      new Date(t.completionDate).toLocaleDateString('ru-RU')
    ];
    creativesByBuyerRows.push([safeUsername(t.buyer),   ...row]);
    creativesByCreatorRows.push([safeUsername(t.creator), ...row]);
  });

  /* ---------------- 4. пишем в Google Sheets ---------------- */
  const spreadsheetId = await googleSheets.getOrCreateSpreadsheet(title);

  const sheetsPayload = [
    { title: 'Бонусы-креативщикам',          data: creatorRows },
    { title: 'Бонусы-баеры',                 data: buyerRows },
    { title: 'Штрафные-бонусы-баеры',        data: penaltyBuyerRows },
    { title: 'Креативы-по-баерам',           data: creativesByBuyerRows },
    { title: 'Креативы-по-креативщикам',     data: creativesByCreatorRows },
  ];

  for (const {title: t, data} of sheetsPayload) {
    await googleSheets.prepareSheet(spreadsheetId, t);
    await googleSheets.writeData(spreadsheetId, `${t}!A1`, data);
  }
  await googleSheets.deleteSheetByTitle(spreadsheetId, 'Лист 1');

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

module.exports = { exportFinanceReport };
