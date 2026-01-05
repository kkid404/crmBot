// src/controllers/points.controller.js
const Task         = require('../databases/task.model');
const googleSheets = require('../services/googleSheets.service');

const monthNames = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
];

/**
 * Формирует Google-таблицу с тремя листами:
 *  • Бонусы-креативщикам
 *  • Бонусы-баеры
 *  • Креативы-по-креативщикам
 *
 * Поддерживает вызовы:
 *  • exportPointsReport('05','2025')           → май 2025
 *  • exportPointsReport('18.03')               → 18 марта текущего года
 *  • exportPointsReport('18.03.2025')          → 18 марта 2025
 *  • exportPointsReport('18.03','25.03')       → диапазон 18–25 марта текущего года
 *  • exportPointsReport('18.03.2025','25.03.2025') → диапазон 18–25 марта 2025
 */
async function exportPointsReport (fromArg, toArg) {
  /* ---------- 1. определяем начальную/конечную даты ---------- */
  const isDM = s => typeof s === 'string' && /^\d{1,2}\.\d{1,2}$/.test(s);
  const isDMY = s => typeof s === 'string' && /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s);
  
  const parseDM = dm => {
    const [d, m] = dm.split('.').map(Number);
    const y      = new Date().getFullYear();
    return new Date(y, m - 1, d);
  };
  
  const parseDMY = dmy => {
    const [d, m, y] = dmy.split('.').map(Number);
    return new Date(y, m - 1, d);
  };

  let start, end, title;

  // Проверяем формат DD.MM.YYYY для обоих аргументов
  if (isDMY(fromArg) && isDMY(toArg)) {             // DD.MM.YYYY-DD.MM.YYYY
    start = parseDMY(fromArg);
    end   = parseDMY(toArg);
    end.setHours(23,59,59,999);
    title = `Рейтинг ${fromArg}-${toArg}`;
  } else if (isDMY(fromArg)) {                      // одиночная DD.MM.YYYY
    start = parseDMY(fromArg);
    end   = new Date(start);
    end.setHours(23,59,59,999);
    title = `Рейтинг ${fromArg}`;
  } else if (isDM(fromArg) && isDM(toArg)) {        // DD.MM-DD.MM
    start = parseDM(fromArg);
    end   = parseDM(toArg);
    end.setHours(23,59,59,999);
    title = `Рейтинг ${fromArg}-${toArg}`;
  } else if (isDM(fromArg)) {                       // одиночная DD.MM
    start = parseDM(fromArg);
    end   = new Date(start);
    end.setHours(23,59,59,999);
    title = `Рейтинг ${fromArg}`;
  } else {                                          // месяц + год
    const m = Number(fromArg);
    const y = Number(toArg);
    start = new Date(y, m - 1, 1);
    end   = new Date(y, m,   0, 23,59,59,999);
    title = `Рейтинг – ${monthNames[m - 1]} ${y}`;
  }

  /* ---------- 2. вытаскиваем задачи периода ---------- */
  const tasks = await Task.find({
    completionDate : { $gte: start, $lte: end },
    state          : 'done'
  }).populate('creator buyer');

  /* ---------- 3. агрегируем по креативщикам ---------- */
  const byCreator = new Map();
  const byBuyer   = new Map();

  for (const t of tasks) {
    /* ---- креативщик ---- */
    if (t.creator) {
      const key = String(t.creator._id);
      const o   = byCreator.get(key) ?? {
        username: t.creator.username || '(no @username)',
        count   : 0,
        bonus   : 0,
        points  : 0,
      };
      o.count  += 1;
      o.bonus  += t.bonus  ?? 0;
      o.points += t.points ?? 0;
      byCreator.set(key, o);
    }
    /* ---- баер ---- */
    if (t.buyer) {
      const key = String(t.buyer._id);
      const o   = byBuyer.get(key) ?? {
        username: t.buyer.username || '(no @username)',
        count   : 0,
        bonus   : 0,
      };
      o.count += 1;
      o.bonus += t.bonus ?? 0;
      byBuyer.set(key, o);
    }
  }

  /* ---------- 4. формируем массивы для трёх листов ---------- */
  const sheet1 = [
    ['Креативщик', 'К-во креативов', 'Сумма бонусов', 'Баллы'],
    ...[...byCreator.values()]
        .sort((a,b)=>b.points-a.points)
        .map(o=>[o.username, o.count, o.bonus, o.points]),
  ];

  const sheet2 = [
    ['Баер', 'К-во креативов', 'Сумма бонусов'],
    ...[...byBuyer.values()]
        .sort((a,b)=>b.bonus-a.bonus)
        .map(o=>[o.username, o.count, o.bonus]),
  ];

  const sheet3 = [
    ['Название ТЗ','Бонус','Балл','Креативщик','Баер','Дата выдачи'],
    ...tasks
      .sort((a,b)=>b.completionDate-a.completionDate)
      .map(t=>[
        t.name                      ?? '(без названия)',
        t.bonus                      ?? 0,
        t.points                     ?? 0,
        t.creator?.username          ?? '(no @username)',
        t.buyer  ?.username          ?? '(no @username)',
        t.completionDate.toLocaleDateString('ru-RU')
      ]),
  ];

  /* ---------- 5. выгружаем в Google Sheets ---------- */
  const spreadsheetId = await googleSheets.getOrCreateSpreadsheet(title);

  // лист 1
  await googleSheets.prepareSheet(spreadsheetId,'Бонусы-креативщикам');
  await googleSheets.writeData(
    spreadsheetId,'Бонусы-креативщикам!A1', sheet1);

  // лист 2
  await googleSheets.prepareSheet(spreadsheetId,'Бонусы-баеры');
  await googleSheets.writeData(
    spreadsheetId,'Бонусы-баеры!A1', sheet2);

  // лист 3
  await googleSheets.prepareSheet(spreadsheetId,'Креативы-по-креативщикам');
  await googleSheets.writeData(
    spreadsheetId,'Креативы-по-креативщикам!A1', sheet3);

  // удаляем стандартный «Лист 1», если он ещё остался
  await googleSheets.deleteSheetByTitle(spreadsheetId,'Лист 1');

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

module.exports = { exportPointsReport };
