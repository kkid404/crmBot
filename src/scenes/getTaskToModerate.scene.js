const { Scenes } = require("telegraf");
const { BaseScene } = Scenes;
const ruMessage = require("../lang/ru.json");
const { start } = require("../keyboards/start.keyboard");
const { myTasks } = require("../keyboards/get_my_tt.keyboard");
const userService = require("../services/user.service");
const taskService = require("../services/task.service");
const { moderate } = require("../keyboards/moderate.keyboard");
const taskChekerService = require("../services/taskCheker.service");
const { backInline } = require("../keyboards/backInline.keyboard");
const { back_to_task } = require("../keyboards/back_to_task.keyboard");
const extractRegion = require("../utils/region.util");
const TopicService = require("../services/topic.service");
const splitLongMessage = require('../utils/splitMessage.util');
const { formatDateMSK } = require('../utils/formatDate.util');
const dayjs = require("dayjs");
const ruLocale = require("dayjs/locale/ru.js");
dayjs.locale(ruLocale);
const forwardToSecondChat = require("../services/secondaryForward.service");
const { setExpectedTimeKeyboard } = require("../keyboards/setExpectedTime.keyboard");

const getTaskToModerateScene = new BaseScene("getTaskToModerateScene");

const MAX_DESCRIPTION_LENGTH = 600; // Максимальная длина описания

const formatTaskInfo = (task) => {
  // Определяем, есть ли медиафайлы
  const hasMedia = Array.isArray(task.example_creative)
    ? task.example_creative.length > 0
    : typeof task.example_creative === "string" &&
      task.example_creative.trim() !== "";

  // Формируем строку для отображения информации о примерах креатива
  const exampleLine = hasMedia
    ? `🎨 Примеры креатива: ${
        Array.isArray(task.example_creative) ? task.example_creative.length : 1
      }`
    : "🎨 Примеры креатива: отсутствуют";

  // Получаем имя заказчика (buyer)
  let buyerName = "Не указан";
  if (task.buyer) {
    if (typeof task.buyer === "object" && task.buyer.username) {
      buyerName = task.buyer.username;
    }
  }

  // Проверяем, создан ли заказ от лица другого баера
  let createdByInfo = "";
  if (task.createdBy && task.buyer && 
      task.createdBy._id && task.buyer._id &&
      task.createdBy._id.toString() !== task.buyer._id.toString()) {
    const createdByName = task.createdBy.username || "неизвестно";
    createdByInfo = `\n👤 Создал: @${createdByName}`;
  }

  // Формируем информацию о ожидаемой дате выполнения
  let expectedDateInfo = "Не указана";
  if (task.expectedDate) {
    expectedDateInfo = formatDateMSK(task.expectedDate);
    if (task.expectedTime) {
      expectedDateInfo += ` к ${task.expectedTime}`;
    }
  }

  // Подсчитываем количество результатов для отображения
  let resultCount = 0;
  if (Array.isArray(task.result)) {
    resultCount = task.result.length;
  } else if (task.result) {
    resultCount = 1;
  }

  // Получаем информацию о типе работы и баллах
  const workTypeInfo = task.workType || "Не указан";
  const pointsInfo = task.points ? task.points : "Не указано";

  // Ограничиваем описание
  const fullDescription = task.description || '';
  let description = fullDescription;
  const hasFullDescription = description.length > MAX_DESCRIPTION_LENGTH;
  if (hasFullDescription) {
    description = description.substring(0, MAX_DESCRIPTION_LENGTH) + '...';
  }

  // Формируем текст с информацией о задании
  const taskInfo = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${description}
${exampleLine}
👨‍💻 Креатор: ${task.creator?.username || "Не назначен"}
👨‍💼 Заказчик: @${buyerName}${createdByInfo}
📝 Результат: ${
  resultCount > 0 ? `✅ Загружен (${resultCount} файлов)` : "❌ Отсутствует"
}

━━━━━━━━━━━━━━━━━━━━━━
💎 Тип работы: ${workTypeInfo}
⭐ Стандартные баллы: ${pointsInfo}
━━━━━━━━━━━━━━━━━━━━━━

📅 Дата создания: ${formatDateMSK(task.createdAt)}
⏱️ Ожидаемая дата выполнения: ${expectedDateInfo}
👨‍💼 Заказчик: ${buyerName}
    `;

  return { taskInfo, fullDescription, hasFullDescription };
};

// Функция для безопасного редактирования сообщения (если потребуется где‑то ещё)
const safeEditMessageText = async (ctx, text, extra) => {
  try {
    await ctx.editMessageText(text, extra);
  } catch (error) {
    if (
      error.response &&
      error.response.error_code === 400 &&
      error.response.description.includes("message can't be edited")
    ) {
      await ctx.reply(text, extra);
    } else {
      throw error;
    }
  }
};

// Функция для проверки голосов и финализации задания (UI для чекера больше не обновляем)
const checkAndFinalizeTask = async (ctx) => {
  try {
    const taskId = ctx.session.selectedTask;
    const task = await taskService.findTaskById(taskId);
    if (!task) return false;
    const version = task.version;

    // Получаем записи голосования для текущей версии
    const allRecords = await taskChekerService.findAllCheckersByTaskId(taskId);
    const versionRecords = allRecords.filter(
      (record) => record.version === version
    );

    // Получаем всех чекеров (предполагается, что голосовать должны все чекеры системы)
    const checkers = await userService.findAllCheckers();
    const totalCheckers = checkers.length;

    if (versionRecords.length < totalCheckers) {
      // Не все голосовали – можно просто завершить обработку без обновления интерфейса для чекера
      return false;
    } else {
      // Все чекеры проголосовали
      const hasFailed = versionRecords.some(
        (record) => record.status === "failed"
      );
      if (hasFailed) {
        // Агрегируем правки из всех записей с failed
        const corrections = versionRecords
          .filter((record) => record.status === "failed")
          .map((record) => record.message)
          .join("\n");

        // Обеспечиваем обратную совместимость с массивом example_creative
        let exampleLine = "🎨 Пример креатива: отсутствует";

        if (
          Array.isArray(task.example_creative) &&
          task.example_creative.length > 0
        ) {
          // Определяем, сколько примеров креатива есть
          exampleLine = `🎨 Примеры креатива: ${task.example_creative.length}`;
        } else if (
          typeof task.example_creative === "string" &&
          task.example_creative.trim() !== ""
        ) {
          // Обрабатываем случай, когда example_creative - это строка
          const isMedia =
            task.example_creative.startsWith("AgAC") ||
            task.example_creative.startsWith("BAA");
          exampleLine = isMedia
            ? "🎨 Пример креатива ниже"
            : `🎨 Пример креатива: ${task.example_creative}`;
        }

        const creativeMessage = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${task.description}
${exampleLine}
📅 Дата создания: ${formatDateMSK(task.createdAt)}

правки:
${corrections}
                `;
        // Обновляем состояние задания и увеличиваем версию
        await taskService.updateTask(taskId, {
          state: "progress",
          version: task.version + 1,
        });
        // Отправляем сообщение креативщику (учтите, что findById теперь возвращает объект, а не массив)
        const creator = await userService.findById(task.creator);
        const buyer = await userService.findById(task.buyer);
        
        // Разбиваем сообщение на части, если оно слишком длинное
        const messageParts = splitLongMessage(creativeMessage);
        for (const part of messageParts) {
            await ctx.telegram.sendMessage(creator.tg_id, part);
        }
      } else {
        // Все одобрили задание – обновляем состояние и получаем свежую версию задачи
        // Баллы устанавливаются модератором вручную, но добавляем +0.125 при первом одобрении
        const currentPoints = task.points || 0;
        const isExcludedType = task.workType && (
          task.workType.includes('Уникализация') || 
          task.workType.includes('Глубокая уникализация') || 
          task.workType.includes('Адаптация')
        );
        // Добавляем бонус 0.125 только при первом одобрении (version === 1) и для не-исключенных типов
        const updatedPoints = (version === 1 && !isExcludedType) ? currentPoints + 0.125 : currentPoints;
        
        const finalizedTask = await taskService.updateTask(taskId, {
          state: "done",
          points: updatedPoints,
        });
        if (!finalizedTask) {
          console.error(`Failed to update and retrieve task ${taskId}`);
          return false; // Выходим, если не удалось обновить задачу
        }

        const { creator, buyer } = finalizedTask;

        // --- Логика отправки в форум --- //
        try {
          const topicIdMain = await TopicService.getOrCreate(
            ctx,
            process.env.FORUM_CHAT_ID,
            extractRegion(finalizedTask.name)
          );

          const fmt = (iso) =>
            iso ? dayjs(iso).locale("ru").format("DD.MM.YYYY HH:mm") : "—";

          // эмодзи-подписи по ключам, чтобы не плодить if'ы
          const labels = {
            name: "📌 Задача",
            description: "📝 Описание",
            link_app: "🔗 Приложение",
            workType: "💼 Тип работы",
            expectedDate: "⏰ Предполагаемая дата сдачи",
            completionDate: "✅ Завершено",
            buyer: "👤 Баер",
            creator: "👨‍💻 Креативщик",
          };

          // основной код ----------------------------------------------------
          const task = finalizedTask.toObject();

          // удаляем лишнее сразу
          delete task.points;
          delete task.state;
          delete task.ctr;
          delete task.bonus;
          delete task.result;
          delete task.example_creative;
          delete task.__v;

          // готовим плоские поля
          const flat = {
            name: task.name,
            description: task.description,
            link_app: task.link_app,
            workType: task.workType,
            expectedDate: fmt(task.expectedDate),
            completionDate: fmt(task.completionDate),
            buyer: `@${task.buyer.username}`,
            creator: `@${task.creator.username}`,
          };

          // собираем текст
          const message = Object.entries(flat)
            .map(([k, v]) => `<b>${labels[k]}:</b> ${v}`)
            .join("\n\n"); // пустая строка между блоками

          await ctx.telegram.sendMessage(process.env.FORUM_CHAT_ID, message, {
            parse_mode: "HTML",
            message_thread_id: topicIdMain,
          });

          // 2. Отправка готового креатива
          if (finalizedTask.result && finalizedTask.result.length > 0) {
            const resultMedia = Array.isArray(finalizedTask.result)
              ? finalizedTask.result
              : [finalizedTask.result];
            const resultCaption = `Готовый - ${finalizedTask.name}`;
            if (resultMedia.length > 1) {
              await ctx.telegram.sendMediaGroup(
                process.env.FORUM_CHAT_ID,
                resultMedia.map((fileId, i) => ({
                  type: fileId.startsWith("BA") ? "video" : "photo",
                  media: fileId,
                  caption: i === 0 ? resultCaption : undefined,
                })),
                { message_thread_id: topicIdMain }
              );
            } else if (resultMedia.length === 1) {
              const fileId = resultMedia[0];
              const method = fileId.startsWith("BA")
                ? "sendVideo"
                : "sendPhoto";
              await ctx.telegram[method](process.env.FORUM_CHAT_ID, fileId, {
                caption: resultCaption,
                message_thread_id: topicIdMain,
              });
            }
          }

          // 3. Отправка примера креатива
          if (
            finalizedTask.example_creative &&
            finalizedTask.example_creative.length > 0
          ) {
            const exampleMedia = Array.isArray(finalizedTask.example_creative)
              ? finalizedTask.example_creative
              : [finalizedTask.example_creative];
            const exampleCaption = `Пример для - ${finalizedTask.name}`;

            // Проверяем, является ли контент медиафайлом
            const isValidMedia = exampleMedia.every(
              (fileId) =>
                fileId.startsWith("AgAC") || // фото
                fileId.startsWith("BAA") || // видео
                fileId.startsWith("BQA") || // документ
                fileId.startsWith("CQA") || // аудио
                fileId.startsWith("DQA") // анимация
            );

            if (isValidMedia) {
              if (exampleMedia.length > 1) {
                await ctx.telegram.sendMediaGroup(
                  process.env.FORUM_CHAT_ID,
                  exampleMedia.map((fileId, i) => ({
                    type: fileId.startsWith("BA") ? "video" : "photo",
                    media: fileId,
                    caption: i === 0 ? exampleCaption : undefined,
                  })),
                  { message_thread_id: topicIdMain }
                );
              } else if (exampleMedia.length === 1) {
                const fileId = exampleMedia[0];
                const method = fileId.startsWith("BA")
                  ? "sendVideo"
                  : "sendPhoto";
                await ctx.telegram[method](process.env.FORUM_CHAT_ID, fileId, {
                  caption: exampleCaption,
                  message_thread_id: topicIdMain,
                });
              }
            } else {
              // Если это не медиафайл, отправляем как текстовое сообщение
              await ctx.telegram.sendMessage(
                process.env.FORUM_CHAT_ID,
                `${exampleCaption}\n\n${exampleMedia.join("\n")}`,
                { message_thread_id: topicIdMain }
              );
            }
          }
          await forwardToSecondChat(
            ctx,
            finalizedTask,
            extractRegion(finalizedTask.name)
          );
        } catch (e) {
          console.error("Ошибка при пересылке данных в форум:", e);
        }
        // ---------- Конец логики форума --- //

        // --- Уведомления пользователям ---
        try {
          if (creator && creator.tg_id) {
            // Send expected time prompt ONLY if deadline not set and task not done
            if (!finalizedTask.expectedDate && finalizedTask.state !== 'done') {
              console.log(
                `[Moderation->Creator] Sending expected time prompt: taskId=${finalizedTask._id}, taskName=${finalizedTask.name}, creatorId=${creator._id}, creatorTG=${creator.tg_id}`
              );
              const timeMsg = await ctx.telegram.sendMessage(
                creator.tg_id,
                `🔔 Для задачи "${finalizedTask.name}" укажите дату и время сдачи:`,
                setExpectedTimeKeyboard(finalizedTask._id)
              );
              console.log(
                `[Moderation->Creator] Expected time prompt sent. message_id=${timeMsg?.message_id}`
              );
            } else {
              console.log(
                `[Moderation->Creator] Skipping expected time prompt (already set or task done). taskId=${finalizedTask._id}, state=${finalizedTask.state}`
              );
            }

            console.log(
              `[Moderation->Creator] Sending approval message for task ${finalizedTask._id}`
            );
            
            // Формируем уведомление с информацией о баллах и типе работы
            const workTypeText = finalizedTask.workType || 'Не указан';
            const pointsText = finalizedTask.points || 0;
            const approvalMessage = `✅ ${finalizedTask.name} Одобрено!\n\n⭐ Начислено баллов: ${pointsText}\n💎 Тип работы: ${workTypeText}`;
            
            const approveMsg = await ctx.telegram.sendMessage(
              creator.tg_id,
              approvalMessage
            );
            console.log(
              `[Moderation->Creator] Approval message sent. message_id=${approveMsg?.message_id}`
            );
          } else {
            console.error(
              `Could not find creator or creator.tg_id for task ${finalizedTask._id}`
            );
          }
        } catch (error) {
          console.error(
            `Failed to send messages to creator for task ${finalizedTask.name}:`,
            error
          );
        }

        try {
          if (buyer && buyer.tg_id) {
            await ctx.telegram.sendMessage(
              buyer.tg_id,
              `✅ ${finalizedTask.name} готово!`
            );
          } else {
            console.error(
              `Could not find buyer or buyer.tg_id for task ${finalizedTask._id}`
            );
          }
        } catch (error) {
          console.error(
            `Failed to send completion message to buyer for task ${finalizedTask.name}:`,
            error.message
          );
        }
      }
      return true;
    }
  } catch (error) {
    console.error("Error in checkAndFinalizeTask:", error);
    return false;
  }
};

// В начале файла добавим функцию для удаления медиа
const deleteMediaMessages = async (ctx) => {
  // Удаляем сданное изображение (одиночное сообщение)
  if (ctx.session.mediaMessageId) {
    try {
      ctx.session.mediaMessageId = null;
    } catch (err) {
      console.error("Ошибка при удалении одиночного медиа:", err);
    }
  }

  // Удаляем массив медиа сообщений результата работы
  if (ctx.session.mediaMessageIds && ctx.session.mediaMessageIds.length > 0) {
    ctx.session.mediaMessageIds = [];
  }

  // Удаляем примеры креативов (массив сообщений)
  if (
    ctx.session.exampleMediaMessageIds &&
    ctx.session.exampleMediaMessageIds.length > 0
  ) {
    ctx.session.exampleMediaMessageIds = [];
  }

  // Для обратной совместимости проверяем и старое одиночное сообщение
  if (ctx.session.exampleMediaMessageId) {
    try {
      ctx.session.exampleMediaMessageId = null;
    } catch (err) {
      console.error("Ошибка при удалении примера:", err);
    }
  }
};

getTaskToModerateScene.enter(async (ctx) => {
  try {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    if (!user) {
      await ctx.reply(ruMessage.messages.userNotFound);
      return;
    }

    // Доступ только для чекеров
    if (!user.cheker) {
      await ctx.reply(ruMessage.messages.errors.error_protected, await start(ctx.from.id));
      ctx.scene.leave();
      return;
    }

    // Initialize page in session if not exists
    ctx.session.currentPage = 0;

    // Save previous task ID if it exists
    const preselectedTaskId = ctx.session.selectedTask;

    // Очищаем сессию при входе в сцену, но сохраняем ID задачи если он был
    ctx.session.mediaMessageId = null;
    ctx.session.exampleMediaMessageId = null;
    ctx.session.exampleMediaMessageIds = [];
    ctx.session.taskMessageId = null;

    // If we have a task ID from a direct link (like moderate_task:xxx), load it immediately
    if (preselectedTaskId) {
      ctx.session.selectedTask = preselectedTaskId;
      // Пытаемся захватить блокировку модерации
      const lockedTask = await taskService.acquireModerationLock(preselectedTaskId, user._id);
      if (!lockedTask) {
        const current = await taskService.findTaskById(preselectedTaskId);
        const lockerName = current?.moderationLockedBy?.username ? `@${current.moderationLockedBy.username}` : 'другой модератор';
        await ctx.reply(`⚠️ Это ТЗ уже проверяет ${lockerName}. Выберите другое.`);
      } else {
        ctx.session.lockedTaskId = preselectedTaskId;
      }
      const task = lockedTask || await taskService.findTaskById(preselectedTaskId);

      if (task) {
        // Directly use the task information to display it
        const { taskInfo, fullDescription, hasFullDescription } = formatTaskInfo(task);
        
        // Сохраняем в сессии
        ctx.session.fullDescription = fullDescription;
        ctx.session.hasFullDescription = hasFullDescription;

        // Display the task results (media)
        if (task.result) {
          try {
            // Handle result display (media files)
            if (Array.isArray(task.result) && task.result.length > 0) {
              // Code to display media group here (similar to the action handler)
              const mediaGroup = task.result.map((fileId) => {
                const isVideo = fileId.startsWith("BAA");
                const isDocument = fileId.startsWith("BQA");
                const isAudio = fileId.startsWith("CQA");
                const isAnimation = fileId.startsWith("DQA");

                let type = "photo";
                if (isVideo) type = "video";
                else if (isDocument) type = "document";
                else if (isAudio) type = "audio";
                else if (isAnimation) type = "animation";

                return { type, media: fileId };
              });

              if (mediaGroup.length > 0) {
                const chunks = [];
                for (let i = 0; i < mediaGroup.length; i += 10) {
                  chunks.push(mediaGroup.slice(i, i + 10));
                }

                for (const chunk of chunks) {
                  if (chunk.length > 0) {
                    const sentMessages = await ctx.telegram.sendMediaGroup(
                      ctx.chat.id,
                      chunk
                    );

                    if (sentMessages && sentMessages.length > 0) {
                      if (!ctx.session.mediaMessageIds) {
                        ctx.session.mediaMessageIds = [];
                      }
                      sentMessages.forEach((msg) => {
                        ctx.session.mediaMessageIds.push(msg.message_id);
                      });
                    }
                  }
                }
              }
            } else if (typeof task.result === "string") {
              // Handle single media file
              let mediaResponse;
              if (
                task.mediaType === "photo" ||
                task.result.startsWith("AgAC")
              ) {
                mediaResponse = await ctx.replyWithPhoto(task.result);
              } else if (
                task.mediaType === "video" ||
                task.result.startsWith("BAA")
              ) {
                mediaResponse = await ctx.replyWithVideo(task.result);
              } else {
                try {
                  mediaResponse = await ctx.replyWithPhoto(task.result);
                } catch {
                  try {
                    mediaResponse = await ctx.replyWithVideo(task.result);
                  } catch (innerError) {
                    console.error(
                      "Не удалось определить тип медиа:",
                      innerError
                    );
                    await ctx.reply(
                      "Не удалось отобразить результат работы. Неизвестный формат медиа."
                    );
                  }
                }
              }

              if (mediaResponse?.message_id) {
                ctx.session.mediaMessageId = mediaResponse.message_id;
              }
            }
          } catch (error) {
            console.error("Ошибка при отправке результата:", error);
            await ctx.reply(
              "Не удалось отобразить результат работы. Ошибка при обработке медиа."
            );
          }
        }

        // Display task info and moderation controls
        const moderateKeyboard = moderate(task, {
          hasFullDescription: ctx.session.hasFullDescription
        });
        
        // Разбиваем длинное сообщение на части
        const messageParts = splitLongMessage(taskInfo);
        
        // Первая часть с клавиатурой
        const taskMessage = await ctx.reply(messageParts[0], {
          ...moderateKeyboard,
          reply_markup: {
            ...moderateKeyboard.reply_markup,
            remove_keyboard: true,
          },
        });
        ctx.session.taskMessageId = taskMessage.message_id;
        
        // Остальные части без клавиатуры
        for (let i = 1; i < messageParts.length; i++) {
          await ctx.reply(messageParts[i]);
        }

        return;
      }
    }

    // If no preselected task or task not found, show the task selection menu
    const keyboard = await myTasks(
      user._id,
      "",
      "wait",
      ctx.session.currentPage
    );
    await ctx.reply(ruMessage.messages.getTT.select_tt, keyboard);
  } catch (error) {
    console.error("Error in getTaskToModerateScene.enter:", error);
    await ctx.reply(ruMessage.messages.errorOccurred);
  }
});

// Модифицируем обработчик выбора задачи
getTaskToModerateScene.action(/^[a-f0-9]{24}$/, async (ctx) => {
  try {
    const taskId = ctx.callbackQuery.data;
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    // Освобождаем предыдущую блокировку, если была другая задача
    if (ctx.session.lockedTaskId && ctx.session.lockedTaskId !== taskId) {
      await taskService.releaseModerationLock(ctx.session.lockedTaskId, user?._id);
      ctx.session.lockedTaskId = null;
    }
    // Пытаемся захватить блокировку
    const locked = await taskService.acquireModerationLock(taskId, user._id);
    if (!locked) {
      const current = await taskService.findTaskById(taskId);
      const lockerName = current?.moderationLockedBy?.username ? `@${current.moderationLockedBy.username}` : 'другой модератор';
      await ctx.answerCbQuery(`ТЗ уже проверяет ${lockerName}`);
      return;
    }
    ctx.session.lockedTaskId = taskId;
    const task = locked;
    if (!task) {
      await ctx.answerCbQuery(ruMessage.messages.taskNotFound);
      return;
    }

    ctx.session.selectedTask = taskId;
    const { taskInfo, fullDescription, hasFullDescription } = formatTaskInfo(task);
    
    // Сохраняем в сессии
    ctx.session.fullDescription = fullDescription;
    ctx.session.hasFullDescription = hasFullDescription;

    // Отправляем результат креатива
    if (task.result) {
      try {
        // Обрабатываем случай, когда result является массивом (новый формат)
        if (Array.isArray(task.result) && task.result.length > 0) {
          // Разделяем медиафайлы по типам
          const mediaGroup = task.result.map((fileId) => {
            // Определяем тип медиа по первым символам file_id
            const isVideo = fileId.startsWith("BAA");
            const isDocument = fileId.startsWith("BQA");
            const isAudio = fileId.startsWith("CQA");
            const isAnimation = fileId.startsWith("DQA");

            // Определяем тип медиа
            let type = "photo"; // По умолчанию фото
            if (isVideo) type = "video";
            else if (isDocument) type = "document";
            else if (isAudio) type = "audio";
            else if (isAnimation) type = "animation";

            return {
              type: type,
              media: fileId,
            };
          });

          // Отправляем медиагруппу (максимум 10 файлов в одной группе)
          if (mediaGroup.length > 0) {
            // Telegram поддерживает до 10 файлов в одной группе
            const chunks = [];
            for (let i = 0; i < mediaGroup.length; i += 10) {
              chunks.push(mediaGroup.slice(i, i + 10));
            }

            // Отправляем каждую группу отдельно
            for (const chunk of chunks) {
              if (chunk.length > 0) {
                const sentMessages = await ctx.telegram.sendMediaGroup(
                  ctx.chat.id,
                  chunk
                );

                // Сохраняем ID всех отправленных сообщений для возможного удаления позже
                if (sentMessages && sentMessages.length > 0) {
                  if (!ctx.session.mediaMessageIds) {
                    ctx.session.mediaMessageIds = [];
                  }
                  sentMessages.forEach((msg) => {
                    ctx.session.mediaMessageIds.push(msg.message_id);
                  });
                }
              }
            }
          }
        }
        // Обрабатываем случай, когда result является строкой (старый формат)
        else if (typeof task.result === "string") {
          let mediaResponse;
          if (task.mediaType === "photo" || task.result.startsWith("AgAC")) {
            mediaResponse = await ctx.replyWithPhoto(task.result);
          } else if (
            task.mediaType === "video" ||
            task.result.startsWith("BAA")
          ) {
            mediaResponse = await ctx.replyWithVideo(task.result);
          } else {
            try {
              mediaResponse = await ctx.replyWithPhoto(task.result);
            } catch {
              try {
                mediaResponse = await ctx.replyWithVideo(task.result);
              } catch (innerError) {
                console.error("Не удалось определить тип медиа:", innerError);
                await ctx.reply(
                  "Не удалось отобразить результат работы. Неизвестный формат медиа."
                );
              }
            }
          }

          if (mediaResponse?.message_id) {
            ctx.session.mediaMessageId = mediaResponse.message_id;
          }
        }
      } catch (error) {
        console.error("Ошибка при отправке результата:", error);
        await ctx.reply(
          "Не удалось отобразить результат работы. Ошибка при обработке медиа."
        );
      }
    }

    // Отправляем описание задачи с удалением обычной клавиатуры
    // Разбиваем длинное сообщение на части, если необходимо
    const messageParts = splitLongMessage(taskInfo);
    const moderateKeyboard = moderate(task, {
      hasFullDescription: ctx.session.hasFullDescription
    });
    
    // Первая часть с клавиатурой
    const taskMessage = await ctx.reply(messageParts[0], {
      ...moderateKeyboard,
      reply_markup: {
        ...moderateKeyboard.reply_markup,
        remove_keyboard: true,
      },
    });
    ctx.session.taskMessageId = taskMessage.message_id;
    
    // Остальные части без клавиатуры
    for (let i = 1; i < messageParts.length; i++) {
      await ctx.reply(messageParts[i]);
    }

    await ctx.answerCbQuery();
  } catch (error) {
    console.error("Error in task selection:", error);
    await ctx.answerCbQuery(ruMessage.messages.errorOccurred);
  }
});

// Обработчик для кнопок пагинации
getTaskToModerateScene.action(/^page_\d+$/, async (ctx) => {
  try {
    // Извлекаем номер страницы из callback_data
    const pageNumber = parseInt(ctx.callbackQuery.data.split("_")[1]);

    // Сохраняем текущую страницу в сессии
    ctx.session.currentPage = pageNumber;

    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    if (!user) {
      await ctx.answerCbQuery("Пользователь не найден");
      return;
    }

    // Получаем обновленную клавиатуру с новой страницей
    const keyboard = await myTasks(user._id, "", "wait", pageNumber);

    // Обновляем сообщение с новой клавиатурой
    await ctx.editMessageText(ruMessage.messages.getTT.select_tt, keyboard);
    await ctx.answerCbQuery();
  } catch (error) {
    console.error("Error in pagination action:", error);
    await ctx.answerCbQuery("Произошла ошибка при переключении страницы");
  }
});

// Обработчик для кнопки текущей страницы (чтобы не выдавать ошибку при нажатии)
getTaskToModerateScene.action("current_page", async (ctx) => {
  await ctx.answerCbQuery("Текущая страница");
});

// Обработчик нажатия кнопки "✅ Принять" (done)
getTaskToModerateScene.action("done", async (ctx) => {
  try {
    const taskId = ctx.session.selectedTask;
    if (!taskId) {
      await ctx.answerCbQuery("Задание не выбрано");
      return;
    }
    const task = await taskService.findTaskById(taskId);
    if (!task) {
      await ctx.answerCbQuery(ruMessage.messages.taskNotFound);
      return;
    }
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    if (!user) {
      await ctx.answerCbQuery("Пользователь не найден");
      return;
    }
    const version = task.version;

    // Проверяем, голосовал ли уже этот чекер (независимо от статуса)
    const checkersRecords = await taskChekerService.findAllCheckersByTaskId(
      taskId
    );
    const existingRecord = checkersRecords.find(
      (record) =>
        record.chekerId.toString() === user._id.toString() &&
        record.version === version
    );
    if (existingRecord) {
      await ctx.answerCbQuery("Вы уже проголосовали");
      return;
    }

    // Сохраняем в сессии данные для ожидания ввода баллов
    ctx.session.waitingForPoints = true;
    ctx.session.pendingApproval = {
      taskId,
      version,
      userId: user._id,
    };

    // Получаем информацию о типе работы и стандартных баллах
    const workTypeInfo = task.workType || "Не указан";
    const standardPoints = task.points || 0;

    await ctx.reply(
      `✅ Задание одобрено!\n\n💎 Тип работы: ${workTypeInfo}\n⭐ Стандартные баллы за этот тип: ${standardPoints}\n\nПожалуйста, введите общее количество баллов для начисления креативщику:`
    );
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error in moderate "done" action:', error);
    await ctx.answerCbQuery("Произошла ошибка при принятии задания");
  }
});

// Обработчик нажатия кнопки "❌ Отклонить" (cancel)
getTaskToModerateScene.action("cancel", async (ctx) => {
  try {
    const taskId = ctx.session.selectedTask;
    if (!taskId) {
      await ctx.answerCbQuery("Задание не выбрано");
      return;
    }
    const task = await taskService.findTaskById(taskId);
    if (!task) {
      await ctx.answerCbQuery(ruMessage.messages.taskNotFound);
      return;
    }
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    if (!user) {
      await ctx.answerCbQuery("Пользователь не найден");
      return;
    }
    const version = task.version;

    // Проверяем, голосовал ли уже этот чекер
    const checkersRecords = await taskChekerService.findAllCheckersByTaskId(
      taskId
    );
    const existingRecord = checkersRecords.find(
      (record) =>
        record.chekerId.toString() === user._id.toString() &&
        record.version === version
    );
    if (existingRecord) {
      await ctx.answerCbQuery("Вы уже проголосовали");
      return;
    }

    // Сохраняем в сессии данные для ожидания сообщения с правкой
    ctx.session.waitingForCorrection = true;
    ctx.session.pendingCancelVote = {
      taskId,
      version,
      userId: user._id,
    };

    // Уведомляем креативщика о том, что правки отклонены
    try {
      const creator = await userService.findById(task.creator);
      if (creator?.tg_id) {
        await ctx.telegram.sendMessage(
          creator.tg_id,
          "❌ Ваши правки по заданию были отклонены модератором. Пожалуйста, внесите новые правки."
        );
      }
    } catch (e) {
      console.error("Failed to send rejection message to creator", e);
    }

    await ctx.reply(
      "❌ Задание отклонено. Пожалуйста, введите сообщение с правкой:"
    );
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error in moderate "cancel" action:', error);
    await ctx.answerCbQuery("Произошла ошибка при отклонении задания");
  }
});

// Обработчик текстовых сообщений для ввода правок
getTaskToModerateScene.on("text", async (ctx) => {
  // Обработка ввода баллов при одобрении задачи
  if (ctx.session.waitingForPoints && ctx.session.pendingApproval) {
    try {
      const pointsInput = ctx.message.text.trim();
      const points = parseFloat(pointsInput);
      
      // Проверяем корректность ввода
      if (isNaN(points) || points < 0) {
        await ctx.reply(
          "⚠️ Некорректное значение. Пожалуйста, введите положительное число (например: 1 или 0.5)"
        );
        return;
      }

      const { taskId, version, userId } = ctx.session.pendingApproval;
      const task = await taskService.findTaskById(taskId);
      
      if (!task) {
        await ctx.reply("Задача не найдена");
        return;
      }

      // Обновляем баллы в задаче
      await taskService.updateTask(taskId, { points });

      // Создаем запись проверки с одобрением
      await taskChekerService.createTaskChecker({
        taskId,
        chekerId: userId,
        status: "done",
        version,
        message: `Задание принято с ${points} баллами`,
      });

      // Сбрасываем флаги ожидания
      delete ctx.session.waitingForPoints;
      delete ctx.session.pendingApproval;

      // Один голос достаточно: финализируем сразу как done
      // Добавляем бонус +0.125 при первом одобрении (version === 1) для не-исключенных типов
      const isExcludedType = task.workType && (
        task.workType.includes('Уникализация') || 
        task.workType.includes('Глубокая уникализация') || 
        task.workType.includes('Адаптация')
      );
      const finalPoints = (version === 1 && !isExcludedType) ? points + 0.125 : points;
      
      const finalizedTask = await taskService.updateTask(taskId, {
        state: "done",
        points: finalPoints
      });

      if (!finalizedTask) {
        await ctx.reply("Ошибка при финализации задачи");
        return;
      }

      const { creator, buyer } = finalizedTask;

      // --- Отправка в форум/архив --- //
      try {
        const topicIdMain = await TopicService.getOrCreate(
          ctx,
          process.env.FORUM_CHAT_ID,
          extractRegion(finalizedTask.name)
        );

        const fmt = (iso) => iso ? dayjs(iso).locale("ru").format("DD.MM.YYYY HH:mm") : "—";

        const labels = {
          name: "📌 Задача",
          description: "📝 Описание",
          link_app: "🔗 Приложение",
          workType: "💼 Тип работы",
          expectedDate: "⏰ Предполагаемая дата сдачи",
          completionDate: "✅ Завершено",
          buyer: "👤 Баер",
          creator: "👨‍💻 Креативщик",
        };

        const taskObj = finalizedTask.toObject();
        delete taskObj.points;
        delete taskObj.state;
        delete taskObj.ctr;
        delete taskObj.bonus;
        delete taskObj.result;
        delete taskObj.example_creative;
        delete taskObj.__v;

        const flat = {
          name: taskObj.name,
          description: taskObj.description,
          link_app: taskObj.link_app,
          workType: taskObj.workType,
          expectedDate: fmt(taskObj.expectedDate),
          completionDate: fmt(taskObj.completionDate),
          buyer: `@${taskObj.buyer.username}`,
          creator: `@${taskObj.creator.username}`,
        };

        const message = Object.entries(flat)
          .map(([k, v]) => `<b>${labels[k]}:</b> ${v}`)
          .join("\n\n");

        await ctx.telegram.sendMessage(process.env.FORUM_CHAT_ID, message, {
          parse_mode: "HTML",
          message_thread_id: topicIdMain,
        });

        // Отправка готового креатива
        if (finalizedTask.result && finalizedTask.result.length > 0) {
          const resultMedia = Array.isArray(finalizedTask.result)
            ? finalizedTask.result
            : [finalizedTask.result];
          const resultCaption = `Готовый - ${finalizedTask.name}`;
          if (resultMedia.length > 1) {
            await ctx.telegram.sendMediaGroup(
              process.env.FORUM_CHAT_ID,
              resultMedia.map((fileId, i) => ({
                type: fileId.startsWith("BA") ? "video" : "photo",
                media: fileId,
                caption: i === 0 ? resultCaption : undefined,
              })),
              { message_thread_id: topicIdMain }
            );
          } else if (resultMedia.length === 1) {
            const fileId = resultMedia[0];
            const method = fileId.startsWith("BA") ? "sendVideo" : "sendPhoto";
            await ctx.telegram[method](process.env.FORUM_CHAT_ID, fileId, {
              caption: resultCaption,
              message_thread_id: topicIdMain,
            });
          }
        }

        // Отправка примера креатива
        if (finalizedTask.example_creative && finalizedTask.example_creative.length > 0) {
          const exampleMedia = Array.isArray(finalizedTask.example_creative)
            ? finalizedTask.example_creative
            : [finalizedTask.example_creative];
          const exampleCaption = `Пример для - ${finalizedTask.name}`;

          const isValidMedia = exampleMedia.every(
            (fileId) =>
              fileId.startsWith("AgAC") ||
              fileId.startsWith("BAA") ||
              fileId.startsWith("BQA") ||
              fileId.startsWith("CQA") ||
              fileId.startsWith("DQA")
          );

          if (isValidMedia) {
            if (exampleMedia.length > 1) {
              await ctx.telegram.sendMediaGroup(
                process.env.FORUM_CHAT_ID,
                exampleMedia.map((fileId, i) => ({
                  type: fileId.startsWith("BA") ? "video" : "photo",
                  media: fileId,
                  caption: i === 0 ? exampleCaption : undefined,
                })),
                { message_thread_id: topicIdMain }
              );
            } else if (exampleMedia.length === 1) {
              const fileId = exampleMedia[0];
              const method = fileId.startsWith("BA") ? "sendVideo" : "sendPhoto";
              await ctx.telegram[method](process.env.FORUM_CHAT_ID, fileId, {
                caption: exampleCaption,
                message_thread_id: topicIdMain,
              });
            }
          } else {
            await ctx.telegram.sendMessage(
              process.env.FORUM_CHAT_ID,
              `${exampleCaption}\n\n${exampleMedia.join("\n")}`,
              { message_thread_id: topicIdMain }
            );
          }
        }
        await forwardToSecondChat(ctx, finalizedTask, extractRegion(finalizedTask.name));
      } catch (e) {
        console.error("Ошибка при пересылке данных в форум:", e);
      }

      // --- Уведомления пользователям ---
      try {
        if (creator && creator.tg_id) {
          if (!finalizedTask.expectedDate && finalizedTask.state !== 'done') {
            await ctx.telegram.sendMessage(
              creator.tg_id,
              `🔔 Для задачи "${finalizedTask.name}" укажите дату и время сдачи:`,
              setExpectedTimeKeyboard(finalizedTask._id)
            );
          }

          const workTypeText = finalizedTask.workType || 'Не указан';
          const pointsText = finalizedTask.points || 0;
          const approvalMessage = `✅ ${finalizedTask.name} Одобрено!\n\n⭐ Начислено баллов: ${pointsText}\n💎 Тип работы: ${workTypeText}`;
          
          await ctx.telegram.sendMessage(creator.tg_id, approvalMessage);
        }
      } catch (error) {
        console.error(`Failed to send messages to creator for task ${finalizedTask.name}:`, error);
      }

      try {
        if (buyer && buyer.tg_id) {
          await ctx.telegram.sendMessage(buyer.tg_id, `✅ ${finalizedTask.name} готово!`);
        }
      } catch (error) {
        console.error(`Failed to send completion message to buyer for task ${finalizedTask.name}:`, error.message);
      }

      // Освобождаем блокировку
      try {
        if (ctx.session.lockedTaskId) {
          await taskService.releaseModerationLock(ctx.session.lockedTaskId, userId);
          ctx.session.lockedTaskId = null;
        }
      } catch (_) {}

      // Отправляем стартовое меню с сообщением об успешном ответе
      await ctx.reply(`✅ Ответ принят. Креативщику начислено ${finalPoints} баллов.`, await start(ctx.from.id));
      ctx.scene.leave();
    } catch (error) {
      console.error("Error processing points input:", error);
      await ctx.reply("Ошибка при обработке баллов");
    }
    return;
  }

  if (ctx.session.waitingForCorrection && ctx.session.pendingCancelVote) {
    try {
      const correction = ctx.message.text;
      const { taskId, version, userId } = ctx.session.pendingCancelVote;

      // Создаем запись проверки с отклонением и переданными правками
      await taskChekerService.createTaskChecker({
        taskId,
        chekerId: userId,
        status: "failed",
        version,
        message: correction,
      });

      // Сбрасываем флаги ожидания
      delete ctx.session.waitingForCorrection;
      delete ctx.session.pendingCancelVote;

      // Один голос достаточно: переводим в progress, увеличиваем версию и уведомляем
      const task = await taskService.findTaskById(taskId);
      await taskService.updateTask(taskId, {
        state: "progress",
        version: (task?.version || 1) + 1
      });

      // Уведомляем креативщика о правках
      try {
        const creator = await userService.findById(task.creator);
        if (creator && creator.tg_id) {
          let exampleLine = "🎨 Пример креатива: отсутствует";
          if (Array.isArray(task.example_creative) && task.example_creative.length > 0) {
            exampleLine = `🎨 Примеры креатива: ${task.example_creative.length}`;
          } else if (typeof task.example_creative === "string" && task.example_creative.trim() !== "") {
            const isMedia = task.example_creative.startsWith("AgAC") || task.example_creative.startsWith("BAA");
            exampleLine = isMedia ? "🎨 Пример креатива ниже" : `🎨 Пример креатива: ${task.example_creative}`;
          }

          const creativeMessage = `
🎯 Название: ${task.name}
🔗 Ссылка на приложение: ${task.link_app}
📝 Описание: ${task.description}
${exampleLine}
📅 Дата создания: ${formatDateMSK(task.createdAt)}

правки:
${correction}
          `;
          const messageParts = splitLongMessage(creativeMessage);
          for (const part of messageParts) {
            await ctx.telegram.sendMessage(creator.tg_id, part);
          }
        }
      } catch (error) {
        console.error('Failed to send correction to creator:', error);
      }

      // Освобождаем блокировку
      try {
        if (ctx.session.lockedTaskId) {
          await taskService.releaseModerationLock(ctx.session.lockedTaskId, userId);
          ctx.session.lockedTaskId = null;
        }
      } catch (_) {}

      // Удаляем inline-сообщение с заданием и отправляем стартовое меню с сообщением об успешном ответе
      try {
      } catch (e) {}
      await ctx.reply("Ответ принят", await start(ctx.from.id));
      ctx.scene.leave();
    } catch (error) {
      console.error("Error processing correction text:", error);
      await ctx.reply("Ошибка при обработке вашего сообщения с правкой");
    }
    return;
  }

  // Если мы не ожидаем правки, но получили текстовое сообщение
  const { selectedTask } = ctx.session;
  const tgId = String(ctx.from.id);
  const userInput = ctx.message.text;
  const user = await userService.findUserByTelegramId(tgId);

  // Если пользователь ввёл "назад" текстом
  if (userInput === ruMessage.keyboards.back[0]) {
    await ctx.scene.enter("backScene");
    ctx.session = {};
    ctx.scene.leave();
    return;
  }

  // Проверяем текущее состояние сцены и возвращаем пользователю информацию
  if (ctx.session.waitingForCorrection) {
    await ctx.reply(
      "Ожидается ввод правки для отклонения задачи. Пожалуйста, введите текст правки."
    );
  } else if (selectedTask) {
    const task = await taskService.findTaskById(selectedTask);
    if (task) {
      await ctx.reply(`Вы просматриваете задачу: ${task.name}`);
      const { taskInfo, fullDescription, hasFullDescription } = formatTaskInfo(task);
      
      // Сохраняем в сессии
      ctx.session.fullDescription = fullDescription;
      ctx.session.hasFullDescription = hasFullDescription;
      
      // Разбиваем длинное сообщение на части
      const messageParts = splitLongMessage(taskInfo);
      
      // Первая часть с клавиатурой
      await ctx.reply(messageParts[0], moderate(task, {
        hasFullDescription: ctx.session.hasFullDescription
      }));
      
      // Остальные части без клавиатуры
      for (let i = 1; i < messageParts.length; i++) {
        await ctx.reply(messageParts[i]);
      }
    } else {
      await ctx.reply(
        "Выбранная задача не найдена. Пожалуйста, выберите задачу из списка:"
      );
      const keyboard = await myTasks(
        user._id,
        "",
        "wait",
        ctx.session.currentPage || 0
      );
      await ctx.reply(ruMessage.messages.getTT.select_tt, keyboard);
    }
  } else {
    await ctx.reply(
      "Вы находитесь в режиме модерации задач. Пожалуйста, выберите задачу из списка:"
    );
    const keyboard = await myTasks(
      user._id,
      "",
      "wait",
      ctx.session.currentPage || 0
    );
    await ctx.reply(ruMessage.messages.getTT.select_tt, keyboard);
  }
});

getTaskToModerateScene.action("quit", async (ctx) => {
  await ctx.reply(
    ruMessage.messages.start.replace("{name}", ctx.from.first_name),
    await start(ctx.from.id)
  );
  // Освобождаем блокировку при выходе
  try {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    if (ctx.session?.lockedTaskId && user?._id) {
      await taskService.releaseModerationLock(ctx.session.lockedTaskId, user._id);
    }
  } catch (_) {}
  ctx.session = {};
  ctx.scene.leave();
});

// Освобождаем блокировку при покидании сцены другим способом
getTaskToModerateScene.leave(async (ctx) => {
  try {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    if (ctx.session?.lockedTaskId && user?._id) {
      await taskService.releaseModerationLock(ctx.session.lockedTaskId, user._id);
      ctx.session.lockedTaskId = null;
    }
  } catch (e) {
    console.error('Ошибка при освобождении блокировки модерации:', e.message);
  }
});

// Обработчик для показа примера задания
getTaskToModerateScene.action("show_example", async (ctx) => {
  try {
    // Удаляем все предыдущие медиа
    await deleteMediaMessages(ctx);

    const taskId = ctx.session.selectedTask;
    const task = await taskService.findTaskById(taskId);

    if (!task) {
      await ctx.answerCbQuery(ruMessage.messages.taskNotFound);
      return;
    }

    // Инициализируем массив для ID сообщений
    ctx.session.exampleMediaMessageIds = [];

    const { taskInfo, fullDescription, hasFullDescription } = formatTaskInfo(task);
    
    // Сохраняем в сессии
    ctx.session.fullDescription = fullDescription;
    ctx.session.hasFullDescription = hasFullDescription;
    
    // Разбиваем длинное сообщение на части
    const messageParts = splitLongMessage(taskInfo);
    
    // Первая часть с клавиатурой
    await ctx.editMessageText(messageParts[0], back_to_task());
    
    // Остальные части без клавиатуры
    for (let i = 1; i < messageParts.length; i++) {
      await ctx.reply(messageParts[i]);
    }

    // Обеспечиваем обратную совместимость, преобразуя строку в массив
    if (
      typeof task.example_creative === "string" &&
      task.example_creative.trim() !== ""
    ) {
      task.example_creative = [task.example_creative];
    } else if (!Array.isArray(task.example_creative)) {
      task.example_creative = [];
    }

    // Разделяем примеры на медиа и текст
    const mediaExamples = [];
    const textExamples = [];

    // Определяем, какие примеры являются медиа, а какие текстом
    task.example_creative.forEach((example) => {
      // Проверяем форматы file_id для Telegram
      if (
        example.startsWith("AgAC") ||
        example.startsWith("BAA") ||
        example.startsWith("BQA") ||
        example.startsWith("CQA") ||
        example.startsWith("DQA")
      ) {
        mediaExamples.push(example);
      } else {
        textExamples.push(example);
      }
    });

    // Сначала отправляем текстовые примеры, если они есть
    if (textExamples.length > 0) {
      const textMessage = await ctx.reply(
        `📝 Текстовые примеры креативов (${
          textExamples.length
        }):\n\n${textExamples.join("\n\n")}`
      );
      ctx.session.exampleMediaMessageIds.push(textMessage.message_id);
    }

    // Если есть медиафайлы, отправляем их в группе
    if (mediaExamples.length > 0) {
      try {
        // Готовим массив медиафайлов для отправки в группе
        const mediaGroup = mediaExamples.map((fileId) => {
          // Определяем тип медиа по первым символам file_id
          const isVideo = fileId.startsWith("BAA");
          const isDocument = fileId.startsWith("BQA");
          const isAudio = fileId.startsWith("CQA");
          const isAnimation = fileId.startsWith("DQA");

          // Определяем тип медиа
          let type = "photo"; // По умолчанию фото
          if (isVideo) type = "video";
          else if (isDocument) type = "document";
          else if (isAudio) type = "audio";
          else if (isAnimation) type = "animation";

          return {
            type: type,
            media: fileId,
          };
        });

        // Отправляем медиагруппу (максимум 10 файлов в одной группе)
        if (mediaGroup.length > 0) {
          // Telegram поддерживает до 10 файлов в одной группе
          const chunks = [];
          for (let i = 0; i < mediaGroup.length; i += 10) {
            chunks.push(mediaGroup.slice(i, i + 10));
          }

          // Отправляем каждую группу отдельно
          for (const chunk of chunks) {
            if (chunk.length > 0) {
              const sentMessages = await ctx.telegram.sendMediaGroup(
                ctx.chat.id,
                chunk
              );

              // Сохраняем ID всех отправленных сообщений
              if (sentMessages && sentMessages.length > 0) {
                sentMessages.forEach((msg) => {
                  ctx.session.exampleMediaMessageIds.push(msg.message_id);
                });
              }
            }
          }
        }
      } catch (error) {
        console.error(`Ошибка отправки медиафайлов: ${error.message}`);
        await ctx.reply(`Не удалось отправить медиафайлы: ${error.message}`);
      }
    }

    await ctx.answerCbQuery();
  } catch (error) {
    console.error("Error in show_example:", error);
    await ctx.answerCbQuery(ruMessage.messages.errorOccurred);
  }
});

// Модифицируем обработчик возврата к заданию
getTaskToModerateScene.action("back_to_task", async (ctx) => {
  try {
    // Удаляем все предыдущие медиа
    await deleteMediaMessages(ctx);

    const taskId = ctx.session.selectedTask;
    const task = await taskService.findTaskById(taskId);

    if (!task) {
      await ctx.answerCbQuery(ruMessage.messages.taskNotFound);
      return;
    }

    const { taskInfo, fullDescription, hasFullDescription } = formatTaskInfo(task);
    
    // Сохраняем в сессии
    ctx.session.fullDescription = fullDescription;
    ctx.session.hasFullDescription = hasFullDescription;
    
    // Разбиваем длинное сообщение на части
    const messageParts = splitLongMessage(taskInfo);
    
    // Первая часть с клавиатурой
    await ctx.editMessageText(messageParts[0], moderate(task, {
      hasFullDescription: ctx.session.hasFullDescription
    }));
    
    // Остальные части без клавиатуры
    for (let i = 1; i < messageParts.length; i++) {
      await ctx.reply(messageParts[i]);
    }

    // Отправляем результат креатива
    if (task.result) {
      try {
        // Обрабатываем случай, когда result является массивом (новый формат)
        if (Array.isArray(task.result) && task.result.length > 0) {
          // Разделяем медиафайлы по типам
          const mediaGroup = task.result.map((fileId) => {
            // Определяем тип медиа по первым символам file_id
            const isVideo = fileId.startsWith("BAA");
            const isDocument = fileId.startsWith("BQA");
            const isAudio = fileId.startsWith("CQA");
            const isAnimation = fileId.startsWith("DQA");

            // Определяем тип медиа
            let type = "photo"; // По умолчанию фото
            if (isVideo) type = "video";
            else if (isDocument) type = "document";
            else if (isAudio) type = "audio";
            else if (isAnimation) type = "animation";

            return {
              type: type,
              media: fileId,
            };
          });

          // Отправляем медиагруппу (максимум 10 файлов в одной группе)
          if (mediaGroup.length > 0) {
            // Telegram поддерживает до 10 файлов в одной группе
            const chunks = [];
            for (let i = 0; i < mediaGroup.length; i += 10) {
              chunks.push(mediaGroup.slice(i, i + 10));
            }

            // Отправляем каждую группу отдельно
            for (const chunk of chunks) {
              if (chunk.length > 0) {
                const sentMessages = await ctx.telegram.sendMediaGroup(
                  ctx.chat.id,
                  chunk
                );

                // Сохраняем ID всех отправленных сообщений для возможного удаления позже
                if (sentMessages && sentMessages.length > 0) {
                  if (!ctx.session.mediaMessageIds) {
                    ctx.session.mediaMessageIds = [];
                  }
                  sentMessages.forEach((msg) => {
                    ctx.session.mediaMessageIds.push(msg.message_id);
                  });
                }
              }
            }
          }
        }
        // Обрабатываем случай, когда result является строкой (старый формат)
        else if (typeof task.result === "string") {
          let mediaResponse;
          if (task.mediaType === "photo" || task.result.startsWith("AgAC")) {
            mediaResponse = await ctx.replyWithPhoto(task.result);
          } else if (
            task.mediaType === "video" ||
            task.result.startsWith("BAA")
          ) {
            mediaResponse = await ctx.replyWithVideo(task.result);
          } else {
            try {
              mediaResponse = await ctx.replyWithPhoto(task.result);
            } catch {
              try {
                mediaResponse = await ctx.replyWithVideo(task.result);
              } catch (innerError) {
                console.error("Не удалось определить тип медиа:", innerError);
                await ctx.reply(
                  "Не удалось отобразить результат работы. Неизвестный формат медиа."
                );
              }
            }
          }

          if (mediaResponse?.message_id) {
            ctx.session.mediaMessageId = mediaResponse.message_id;
          }
        }
      } catch (error) {
        console.error("Ошибка при отправке результата:", error);
        await ctx.reply(
          "Не удалось отобразить результат работы. Ошибка при обработке медиа."
        );
      }
    }

    await ctx.answerCbQuery();
  } catch (error) {
    console.error("Error in back_to_task:", error);
    await ctx.answerCbQuery(ruMessage.messages.errorOccurred);
  }
});

// Обработчик для кнопки "back"
getTaskToModerateScene.action("back", async (ctx) => {
  try {
    // Получаем пользователя по Telegram ID напрямую
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);

    if (!user) {
      await ctx.answerCbQuery("Пользователь не найден");
      return;
    }

    // Удаляем все медиа-сообщения, если есть
    await deleteMediaMessages(ctx);

    // Если сообщение с описанием задачи было отправлено, редактируем его
    if (ctx.session.taskMessageId) {
      try {
        await ctx.editMessageText(
          ruMessage.messages.getTT.select_tt,
          await myTasks(user._id, "", "wait", ctx.session.currentPage || 0)
        );
        delete ctx.session.taskMessageId; // Очистить идентификатор сообщения после редактирования
      } catch (error) {
        console.error("Ошибка при редактировании сообщения:", error);
        // Если не удалось отредактировать, отправляем новое сообщение
        await ctx.reply(
          ruMessage.messages.getTT.select_tt,
          await myTasks(user._id, "", "wait", ctx.session.currentPage || 0)
        );
      }
    } else {
      // Если нет сохраненного ID сообщения, просто отправляем новое
      await ctx.reply(
        ruMessage.messages.getTT.select_tt,
        await myTasks(user._id, "", "wait")
      );
    }

    // Сбрасываем выбранную задачу
    ctx.session.selectedTask = null;

    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error in moderate "back" action:', error);
    await ctx.answerCbQuery("Произошла ошибка при переходе назад");
  }
});

// Обработчик для показа полного описания
getTaskToModerateScene.action('show_full_description', async (ctx) => {
  try {
    const fullDescription = ctx.session.fullDescription;
    if (!fullDescription) {
      await ctx.answerCbQuery('Описание недоступно');
      return;
    }
    
    // Разбиваем на части (учитываем заголовок "📝 Полное описание:\n\n")
    const headerLength = '📝 Полное описание:\n\n'.length;
    const maxLength = 4096 - headerLength; // Оставляем место для заголовка
    const parts = splitLongMessage(fullDescription, maxLength);
    
    // Отправляем первую часть с заголовком
    await ctx.reply(`📝 Полное описание:\n\n${parts[0]}`);
    
    // Остальные части без заголовка
    for (let i = 1; i < parts.length; i++) {
      await ctx.reply(parts[i]);
    }
    
    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Ошибка при показе полного описания:', error);
    await ctx.answerCbQuery('Произошла ошибка');
  }
});

module.exports = getTaskToModerateScene;
