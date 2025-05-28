const { start } = require('../keyboards/start.keyboard');
const { exportFinanceReport } = require('../controllers/finance.controller');
const ru = require('../lang/ru.json');

/**
 * Единый обработчик генерации отчётов – используется для callback‑кнопки и для reply‑клавиатуры.
 */
async function handleGenerateAll(ctx) {
  const loading = await ctx.reply(ru.messages.finance.generating);
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
    await ctx.telegram.editMessageText(ctx.chat.id, loading.message_id, undefined, 'Ошибка генерации');
  }
}

const actions = bot => {
  // --- определяем, какие триггеры есть в ru.keyboards.startFinance
  const financeTriggers = Array.isArray(ru.keyboards.startFinance)
    ? ru.keyboards.startFinance                    // ['📊 Собрать отчёты'] вариант‑старый
    : Object.values(ru.keyboards.startFinance);    // { generateAll:"📊 Собрать отчёты" } вариант‑новый

  // reply‑кнопка «📊 Собрать отчёты»
  bot.hears(financeTriggers, handleGenerateAll);

  // /finance – покажет inline‑кнопку (если нужна)
  bot.command('finance', async ctx => {
    await ctx.reply(ru.messages.finance.select_report, start(ctx.chat.id));
  });

  // inline‑callback «📊 Собрать отчёты»
  bot.action('fin_generateAll', handleGenerateAll);
};

module.exports = { actions };