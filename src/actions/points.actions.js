// src/actions/points.actions.js
const { exportPointsReport } = require('../controllers/points.controller');
const ru   = require('../lang/ru.json');
const { Markup } = require('telegraf');

function buildPeriodKeyboard () {
  const today = new Date();
  const buttons = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    buttons.push(
      Markup.button.callback(`${m < 10 ? '0'+m : m}.${y}`, `points_${m}_${y}`)
    );
  }
  return Markup.inlineKeyboard(buttons, { columns: 3 });
}

async function showPeriodSelector (ctx) {
  await ctx.reply(ru.messages.points.choosePeriod, buildPeriodKeyboard());
}

async function handleGenerate (ctx) {
  const [, month, year] = ctx.callbackQuery.data.split('_');
  const loading = await ctx.reply(ru.messages.points.generating);
  try {
    const url = await exportPointsReport(Number(month), Number(year));
    await ctx.reply(`${ru.messages.points.done}\n${url}`);
  } finally {
    await ctx.deleteMessage(loading.message_id).catch(()=>{});
  }
}

/* -------- новые обработчики свободного ввода -------- */
const reSingle = /^\d{1,2}\.\d{1,2}$/;                     // 18.03
const reRange  = /^\d{1,2}\.\d{1,2}\s*[-–]\s*\d{1,2}\.\d{1,2}$/; // 18.03-25.03

async function handleSingleDate (ctx) {
  const date = ctx.message.text.trim();                    // "18.03"
  const loading = await ctx.reply(ru.messages.points.generating);
  try {
    const url = await exportPointsReport(date);            // один аргумент
    await ctx.reply(`${ru.messages.points.done}\n${url}`);
  } catch (err) {
    await ctx.reply(`❌ ${err.message}`);
  } finally {
    await ctx.deleteMessage(loading.message_id).catch(()=>{});
  }
}

async function handleRange (ctx) {
  const [from, to] = ctx.message.text.split(/[-–]/).map(s => s.trim());
  const loading = await ctx.reply(ru.messages.points.generating);
  try {
    const url = await exportPointsReport(from, to);        // два аргумента
    await ctx.reply(`${ru.messages.points.done}\n${url}`);
  } catch (err) {
    await ctx.reply(`❌ ${err.message}`);
  } finally {
    await ctx.deleteMessage(loading.message_id).catch(()=>{});
  }
}

const actions = bot => {
  /* кнопка «🏆 Собрать рейтинг» */
  const pointsTriggers = ru.keyboards.ownerKeyboard
    ? (Array.isArray(ru.keyboards.ownerKeyboard)
        ? ru.keyboards.ownerKeyboard
        : Object.values(ru.keyboards.ownerKeyboard))
    : ['🏆 Собрать рейтинг'];

  bot.hears(pointsTriggers, showPeriodSelector);
  bot.command('points',  showPeriodSelector);
  bot.action(/points_\d+_\d+/, handleGenerate);

  /* свободный ввод */
  bot.hears(reRange,  handleRange);     // сначала диапазон
  bot.hears(reSingle, handleSingleDate);
};

module.exports = { actions };
