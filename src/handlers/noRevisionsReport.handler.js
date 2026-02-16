const ruMessage = require('../lang/ru.json');
const { isAdmin } = require('../middlewares/isAdmin.middleware');
const Task = require('../databases/task.model');

/**
 * Handler for admin button "Отчет тз без проверок"
 * Collects stats for tasks submitted without revisions (version === 1) within a period.
 */
const handler = (bot) => {
  const buttonText = 'Отчет тз без проверок';

  // 1) Entry point from admin menu
  bot.hears(buttonText, isAdmin, async (ctx) => {
    try {
      await ctx.reply('Укажите период для отчёта ТЗ без проверок\nФорматы:\n- DD.MM.YYYY-DD.MM.YYYY\n- DD.MM-DD.MM (текущий год)');
      ctx.session.waitingNoRevPeriod = true;
    } catch (e) {
      console.error('Error prompting no-revisions report period:', e);
      await ctx.reply('Произошла ошибка при открытии отчёта.');
    }
  });

  // 2) Period input processor
  bot.on('text', async (ctx, next) => {
    try {
      if (!ctx.session?.waitingNoRevPeriod) return next();

      const text = (ctx.message?.text || '').trim();
      const dateWithYearRegex = /^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.(\d{4})\s*-\s*(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.(\d{4})$/;
      const dateRangeNoYearRegex = /^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\s*-\s*(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])$/;

      let periodStart = null, periodEnd = null, title = '';

      if (dateWithYearRegex.test(text)) {
        const [left, right] = text.split('-').map(s => s.trim());
        const [sD, sM, sY] = left.split('.').map(Number);
        const [eD, eM, eY] = right.split('.').map(Number);
        periodStart = new Date(sY, sM - 1, sD, 0, 0, 0);
        periodEnd   = new Date(eY, eM - 1, eD, 23, 59, 59);
        title = `${left}-${right}`;
      } else if (dateRangeNoYearRegex.test(text)) {
        const currentYear = new Date().getFullYear();
        const [left, right] = text.split('-').map(s => s.trim());
        const [sD, sM] = left.split('.').map(Number);
        const [eD, eM] = right.split('.').map(Number);
        periodStart = new Date(currentYear, sM - 1, sD, 0, 0, 0);
        periodEnd   = new Date(currentYear, eM - 1, eD, 23, 59, 59);
        title = `${left}-${right}.${currentYear}`;
      } else {
        await ctx.reply('❌ Формат периода не распознан. Используйте один из форматов:\n- DD.MM.YYYY-DD.MM.YYYY\n- DD.MM-DD.MM');
        return;
      }

      // Reset flag before heavy work to avoid double handling
      ctx.session.waitingNoRevPeriod = false;

      // Fetch tasks in period that are done and without revisions (version === 1)
      const tasks = await Task.find({
        completionDate: { $gte: periodStart, $lte: periodEnd },
        state: 'done',
        version: 1
      }).populate('creator');

      if (!tasks || tasks.length === 0) {
        await ctx.reply(`За период ${title} нет задач, сданных без правок.`);
        return;
      }

      // Aggregate by creator
      const byCreator = new Map();
      const safeName = (u) => u?.username ? `@${u.username}` : (u?.tg_id ? `id_${u.tg_id}` : 'unknown');

      for (const t of tasks) {
        const key = safeName(t.creator);
        const cur = byCreator.get(key) || 0;
        byCreator.set(key, cur + 1);
      }

      // Sort by count desc
      const rows = Array.from(byCreator.entries()).sort((a, b) => b[1] - a[1]);

      let msg = `📊 Отчёт: ТЗ без проверок (версия=1)\nПериод: ${title}\nВсего задач: ${tasks.length}\n\n`;
      msg += 'Креативщик — Кол-во без правок\n';
      for (const [name, cnt] of rows) {
        msg += `${name} — ${cnt}\n`;
      }

      await ctx.reply(msg);
    } catch (error) {
      console.error('Error generating no-revisions report:', error);
      try { await ctx.reply('❌ Ошибка при формировании отчёта.'); } catch {}
    }
  });
};

module.exports = { handler };
