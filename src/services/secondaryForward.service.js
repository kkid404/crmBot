// src/services/secondaryForward.service.js
const dayjs         = require('dayjs');
const ruLocale      = require('dayjs/locale/ru.js');
const TopicService  = require('./topic.service');
const extractRegion = require('../utils/region.util');
dayjs.locale(ruLocale);

module.exports = async function forwardToSecondChat(ctx, task) {
  try {
    const chatId = process.env.SECONDARY_CHAT_ID;
    console.log('chatId', chatId);
    if (!chatId) {
      console.log('SECONDARY_CHAT_ID not set, skipping forward');
      return;
    }

    console.log(`Starting forward to secondary chat ${chatId} for task ${task.name}`);

    /* 1. получаем / создаём топик «по гео» */
    const region  = extractRegion(task.name);
    const topicId = await TopicService.getOrCreate(ctx, chatId, region);
    console.log(`Got topic ID ${topicId} for region ${region}`);

    /* 2. формируем такое же «карточное» сообщение, но без buyer */
    const fmt = iso =>
      iso ? dayjs(iso).format('DD.MM.YYYY HH:mm') : '—';

    const labels = {
      name:            '📌 Задача',
      description:     '📝 Описание',
      link_app:        '🔗 Приложение',
      workType:        '💼 Тип работы',
      expectedDate:    '⏰ Предполагаемая дата сдачи',
      completionDate:  '✅ Завершено',
      /* buyer опускаем */
      creator:         '👨‍💻 Креативщик',
    };

    const flat = {
      name:            task.name,
      description:     task.description,
      link_app:        task.link_app,
      workType:        task.workType,
      expectedDate:    fmt(task.expectedDate),
      completionDate:  fmt(task.completionDate),
      creator:         `@${task.creator.username}`,
    };

    const messageHtml = Object.entries(flat)
      .map(([k, v]) => `<b>${labels[k]}:</b> ${v}`)
      .join('\n\n');

    await ctx.telegram.sendMessage(chatId, messageHtml, {
      parse_mode: 'HTML',
      message_thread_id: topicId,
    });
    console.log('Sent task info message');

    /* 3. готовый креатив */
    if (task.result?.length) {
      const media = Array.isArray(task.result) ? task.result : [task.result];
      const caption = `Готовый – ${task.name}`;

      // Проверяем, является ли контент медиафайлом
      const isValidMedia = media.every(fileId => 
        fileId.startsWith('AgAC') || // фото
        fileId.startsWith('BAA') || // видео
        fileId.startsWith('BQA') || // документ
        fileId.startsWith('CQA') || // аудио
        fileId.startsWith('DQA')    // анимация
      );

      if (isValidMedia) {
        if (media.length > 1) {
          await ctx.telegram.sendMediaGroup(
            chatId,
            media.map((f, i) => ({
              type:  f.startsWith('BA') ? 'video' : 'photo',
              media: f,
              caption: i ? undefined : caption,
            })),
            { message_thread_id: topicId },
          );
        } else {
          const fileId = media[0];
          const method = fileId.startsWith('BA') ? 'sendVideo' : 'sendPhoto';
          await ctx.telegram[method](chatId, fileId, {
            caption,
            message_thread_id: topicId,
          });
        }
        console.log('Sent result media');
      } else {
        // Если это не медиафайл, отправляем как текстовое сообщение
        await ctx.telegram.sendMessage(
          chatId,
          `${caption}\n\n${media.join('\n')}`,
          { message_thread_id: topicId }
        );
        console.log('Sent result as text');
      }
    }

    /* 4. пример креатива */
    if (task.example_creative?.length) {
      const media = Array.isArray(task.example_creative)
        ? task.example_creative
        : [task.example_creative];
      const caption = `Пример – ${task.name}`;

      // Проверяем, является ли контент медиафайлом
      const isValidMedia = media.every(fileId => 
        fileId.startsWith('AgAC') || // фото
        fileId.startsWith('BAA') || // видео
        fileId.startsWith('BQA') || // документ
        fileId.startsWith('CQA') || // аудио
        fileId.startsWith('DQA')    // анимация
      );

      if (isValidMedia) {
        if (media.length > 1) {
          await ctx.telegram.sendMediaGroup(
            chatId,
            media.map((f, i) => ({
              type:  f.startsWith('BA') ? 'video' : 'photo',
              media: f,
              caption: i ? undefined : caption,
            })),
            { message_thread_id: topicId },
          );
        } else {
          const fileId = media[0];
          const method = fileId.startsWith('BA') ? 'sendVideo' : 'sendPhoto';
          await ctx.telegram[method](chatId, fileId, {
            caption,
            message_thread_id: topicId,
          });
        }
        console.log('Sent example media');
      } else {
        // Если это не медиафайл, отправляем как текстовое сообщение
        await ctx.telegram.sendMessage(
          chatId,
          `${caption}\n\n${media.join('\n')}`,
          { message_thread_id: topicId }
        );
        console.log('Sent example as text');
      }
    }

    console.log(`Successfully forwarded task ${task.name} to secondary chat`);
  } catch (error) {
    console.error('Error in forwardToSecondChat:', error);
    throw error; // Пробрасываем ошибку дальше для обработки в вызывающем коде
  }
};
