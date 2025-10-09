const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const { back } = require('../keyboards/back.keyboard');
const { dont_example } = require('../keyboards/dont_example.keyboard');
const userService = require('../services/user.service');
const { Markup } = require('telegraf');
const { Mutex } = require('async-mutex');
const mediaMutex = new Mutex();
const taskService = require('../services/task.service');
const { isValidAlpha2CountryCode } = require('../utils/countryValidation');

function handleError(error) {
    console.error(`Error occurred: ${error.message}`);
    // Вы можете также отправить сообщение пользователю или записать ошибку более детально
}

const createName = async (geo) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    let counTaskToday = await taskService.getTaskToday()
    counTaskToday = counTaskToday.length + 1
    return `${geo}_${day}_${month}_${year}_${counTaskToday}`
}

async function handleText(ctx) {
    const step = ctx.session.step;
    const tgId = String(ctx.from.id);
    const userInput = ctx.message.text;

    if (userInput === ruMessage.keyboards.back[0]) {
        await ctx.scene.enter('backScene');
        ctx.session = {};
        ctx.scene.leave();
        return;
    }

    // Обработка ввода имени креативщика
    if (ctx.session.awaitingCreatorUsername) {
        try {
            const id = userInput.trim();

            // Простая валидация ObjectId (24-х значное hex)
            const isObjectId = /^[a-fA-F0-9]{24}$/.test(id);
            if (!isObjectId) {
                await ctx.reply("❌ Неверный формат _id. Ожидается 24-символьная hex-строка. Попробуйте снова.");
                return;
            }

            // Ищем пользователя по _id
            const creator = await userService.findById(id);

            if (!creator || creator.position !== 'creator') {
                await ctx.reply("⚠️ Пользователь с таким _id не найден или это не креативщик. Пожалуйста, проверьте _id и попробуйте снова.");
                return;
            }
            
            // Создаем задачу с указанным креативщиком
            const user = await userService.findUserByTelegramId(tgId);
            
            const taskData = {
                name: ctx.session.name,
                link_app: ctx.session.app,
                description: ctx.session.description,
                example_creative: ctx.session.mediaFiles || [],
                buyer: user._id,
                creator: creator._id,
                state: 'time' // Задача ожидает установки времени креативщиком
            };
            
            let createdTask;
            let maxRetries = 5;
            let retryCount = 0;
            let success = false;
            
            while (!success && retryCount < maxRetries) {
                try {
                    createdTask = await taskService.createTask(taskData);
                    success = true;
                    
                    // Отправляем уведомление креативщику с кнопкой установки времени
                    const { setExpectedTimeKeyboard } = require('../keyboards/setExpectedTime.keyboard');
                    const buyerName = user?.username || 'неизвестно';
                    
                    const notificationText = `⏳ Новая задача требует установки времени:

🎯 Задача: "${taskData.name}"
👨‍💼 Баер: @${buyerName}
📝 Описание: ${taskData.description}

Пожалуйста, установите ожидаемое время выполнения:`;
                    
                    console.log('🔍 Попытка отправки уведомления:', {
                        creatorUsername: creator.username,
                        creatorTgId: creator.tg_id,
                        tgIdType: typeof creator.tg_id,
                        taskId: createdTask._id,
                        taskName: taskData.name
                    });
                    
                    try {
                        const sentMessage = await ctx.telegram.sendMessage(
                            creator.tg_id,
                            notificationText,
                            setExpectedTimeKeyboard(createdTask._id)
                        );
                        console.log(`✅ Уведомление успешно отправлено креативщику ${creator.username} (${creator.tg_id})`);
                        console.log('📨 Ответ от Telegram API:', {
                            messageId: sentMessage.message_id,
                            date: sentMessage.date,
                            chat: sentMessage.chat?.id
                        });
                    } catch (sendErr) {
                        console.error(`❌ ОШИБКА отправки уведомления креативщику ${creator.username} (${creator.tg_id}):`);
                        console.error('Детали ошибки:', sendErr);
                        console.error('Код ошибки:', sendErr.code);
                        console.error('Описание:', sendErr.description || sendErr.message);
                        
                        if (sendErr.code === 403 || sendErr.description?.includes('bot was blocked')) {
                            await ctx.reply(
                                `⚠️ Задача создана, но креативщик заблокировал бота или не начал с ним диалог.\nСвяжитесь с ${creator.username} напрямую.`,
                                await start(ctx.from.id)
                            );
                            ctx.session = {};
                            ctx.scene.leave();
                            return;
                        } else if (sendErr.description?.includes('chat not found')) {
                            await ctx.reply(
                                `⚠️ Задача создана, но креативщик еще не начал диалог с ботом.\nПопросите ${creator.username} написать боту /start`,
                                await start(ctx.from.id)
                            );
                            ctx.session = {};
                            ctx.scene.leave();
                            return;
                        }
                    }
                    
                    await ctx.reply(
                        `✅ Задача "${taskData.name}" успешно создана и отправлена креативщику для установки времени.`,
                        await start(ctx.from.id)
                    );
                } catch (error) {
                    if (error.message.includes('duplicate key error') && error.message.includes('name')) {
                        retryCount++;
                        const nameParts = taskData.name.split('_');
                        const currentCounter = parseInt(nameParts.pop()) || 0;
                        nameParts.push((currentCounter + retryCount).toString());
                        taskData.name = nameParts.join('_');
                    } else {
                        throw error;
                    }
                }
            }
            
            if (!success) {
                console.error("Не удалось создать задачу после нескольких попыток");
                await ctx.reply(ruMessage.messages.errors.writeTT, await start(ctx.from.id));
            }
            
            // Очищаем сессию и выходим из сцены
            ctx.session = {};
            ctx.scene.leave();
            return;
        } catch (error) {
            console.error("Ошибка при назначении креативщика:", error);
            await ctx.reply("⚠️ Произошла ошибка при назначении креативщика. Пожалуйста, попробуйте позже.");
            ctx.session = {};
            ctx.scene.leave();
            return;
        }
    }

    // Обработка текстового примера, когда ждем медиа
    if (ctx.session.awaitingMedia && step === 3) {
        // Инициализация массива медиафайлов
        if (!ctx.session.mediaFiles) {
            ctx.session.mediaFiles = [];
        }

        // Добавляем текст как пример
        ctx.session.mediaFiles.push(userInput);

        // Отправляем сообщение с кнопкой завершения
        const sentMessage = await ctx.reply(
            `Текстовый пример получен! Всего добавлено: ${ctx.session.mediaFiles.length}`,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ Сохранить и завершить', 'save_task')
            ])
        );

        // Сохраняем ID нового сообщения
        ctx.session.lastMediaMessageId = sentMessage.message_id;
        return;
    }

    let shouldIncrementStep = true; // Flag to track if we should increment the step

    switch (step) {
        case 1:
            // Validate if the input is a valid alpha-2 country code
            if (!isValidAlpha2CountryCode(userInput)) {
                await ctx.reply("❌ Неверный формат ГЕО кода. Пожалуйста, введите корректный двузначный код страны (например: US, RU, GB).", back());
                shouldIncrementStep = false; // Don't increment step
                return;
            }
            
            ctx.session.geo = userInput.trim().toUpperCase(); // Normalize the geo code
            const name = await createName(ctx.session.geo);
            ctx.session.name = name;
            await ctx.reply(ruMessage.messages.writeTT.send_app, back());
            break;
        case 2:
            ctx.session.app = userInput;
            await ctx.reply(ruMessage.messages.writeTT.send_description, back());
            break;
        case 3:
            ctx.session.description = userInput;
            await ctx.reply(ruMessage.messages.writeTT.send_example, await dont_example());
            ctx.session.awaitingMedia = true;
            break;
        default:
            await ctx.reply(ruMessage.messages.errors.writeTT, await start(ctx.from.id));
            ctx.session = {};
            ctx.scene.leave();
            return;
    }
    
    // Only increment the step if we should
    if (step < 3 && shouldIncrementStep) {
        ctx.session.step++;
    }
}

async function handleMedia(ctx) {
    const release = await mediaMutex.acquire(); // Блокируем выполнение до завершения предыдущей операции
    try {
        const tgId = String(ctx.from.id);

        if (!ctx.session.awaitingMedia) return;

        // Инициализация массива медиафайлов
        if (!ctx.session.mediaFiles) {
            ctx.session.mediaFiles = [];
        }

        // Получаем fileId
        let fileId;
        if (ctx.message.photo) {
            fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        } else if (ctx.message.video) {
            fileId = ctx.message.video.file_id;
        }

        if (!fileId) return;

        // Добавляем fileId в массив
        ctx.session.mediaFiles.push(fileId);

        // Текст сообщения с количеством файлов
        const messageText = `Медиафайл получен! Всего добавлено: ${ctx.session.mediaFiles.length}`;

        // Отправляем новое сообщение с кнопкой
        const sentMessage = await ctx.reply(
            messageText,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ Сохранить и завершить', 'save_task')
            ])
        );

        // Сохраняем ID нового сообщения
        ctx.session.lastMediaMessageId = sentMessage.message_id;

    } catch (error) {
        console.error("Ошибка при обработке медиафайла:", error);
        await ctx.reply("Произошла ошибка. Попробуйте еще раз.");
    } finally {
        release(); // Освобождаем мьютекс после завершения
    }
}

// Обработчик сохранения задачи
async function handleSaveTask(ctx) {
    if (!ctx.callbackQuery || !ctx.session.awaitingMedia) return;

    try {
        // Спрашиваем, хочет ли пользователь назначить задание креативщику
        await ctx.reply("Хотите назначить задание креативщику?", 
            Markup.inlineKeyboard([
                Markup.button.callback('Да', 'assign_yes'),
                Markup.button.callback('Нет', 'assign_no')
            ])
        );
    } catch (error) {
        console.error("Ошибка:", error);
        await ctx.reply(ruMessage.messages.errors.writeTT, await start(ctx.from.id));
        ctx.session = {};
        ctx.scene.leave();
    }
}

const writeTTScene = new BaseScene('writeTTScene');

writeTTScene.enter(async (ctx) => {
    ctx.session.step = 1;
    ctx.session.mediaFiles = ctx.session.mediaFiles || []; // Убедитесь, что массив существует
    await ctx.reply(ruMessage.messages.writeTT.send_geo, back());
});

writeTTScene.on('text', handleText)
writeTTScene.on('photo', handleMedia);
writeTTScene.on('video', handleMedia);
writeTTScene.action('save_task', handleSaveTask);

// Обработчик нажатия на кнопку "Нет примера"
writeTTScene.action('no_example', async (ctx) => {
    try {
        ctx.session.mediaFiles = [];
        // Спрашиваем, хочет ли пользователь назначить задание креативщику
        await ctx.reply("Хотите назначить задание креативщику?", 
            Markup.inlineKeyboard([
                Markup.button.callback('Да', 'assign_yes'),
                Markup.button.callback('Нет', 'assign_no')
            ])
        );
    } catch (error) {
        console.error("Ошибка:", error);
        await ctx.reply(ruMessage.messages.errors.writeTT, await start(ctx.from.id));
        ctx.session = {};
        ctx.scene.leave();
    }
});

// Обработчик для ответа "Да" на вопрос о назначении креативщика
writeTTScene.action('assign_yes', async (ctx) => {
    try {
        ctx.session.awaitingCreatorUsername = true;
        await ctx.reply("Введите _id креативщика:");
    } catch (error) {
        console.error("Ошибка:", error);
        await ctx.reply(ruMessage.messages.errors.writeTT, await start(ctx.from.id));
        ctx.session = {};
        ctx.scene.leave();
    }
});

// Обработчик для ответа "Нет" на вопрос о назначении креативщика
writeTTScene.action('assign_no', async (ctx) => {
    try {
        await createTaskWithoutCreator(ctx);
    } catch (error) {
        console.error("Ошибка создания задачи:", error);
        await ctx.reply(ruMessage.messages.errors.writeTT, await start(ctx.from.id));
        ctx.session = {};
        ctx.scene.leave();
    }
});

// Функция для создания задачи без креативщика
async function createTaskWithoutCreator(ctx) {
    const tgId = String(ctx.from.id);
    const user = await userService.findUserByTelegramId(tgId);
    
    const taskData = {
        name: ctx.session.name,
        link_app: ctx.session.app,
        description: ctx.session.description,
        example_creative: ctx.session.mediaFiles || [],
        buyer: user._id
    };

    let maxRetries = 5;
    let retryCount = 0;
    let success = false;
    let createdTask;

    while (!success && retryCount < maxRetries) {
        try {
            createdTask = await taskService.createTask(taskData);
            success = true;
            await ctx.reply(
                ruMessage.messages.writeTT.queued.replace("{name}", taskData.name),
                await start(ctx.from.id)
            );
        } catch (error) {
            if (error.message.includes('duplicate key error') && error.message.includes('name')) {
                retryCount++;
                const nameParts = taskData.name.split('_');
                const currentCounter = parseInt(nameParts.pop()) || 0;
                nameParts.push((currentCounter + retryCount).toString());
                taskData.name = nameParts.join('_');
            } else {
                throw error;
            }
        }
    }

    if (!success) {
        console.error("Не удалось создать задачу после нескольких попыток");
        await ctx.reply(ruMessage.messages.errors.writeTT, await start(ctx.from.id));
    } else {
        // Отправляем уведомления всем креативщикам о новом задании
        try {
            // Находим всех пользователей с ролью creator
            const allUsers = await userService.getAll();
            const creators = allUsers.filter(user => user.position === 'creator');
            console.log(`Найдено креативщиков: ${creators.length}`);
            
            if (creators.length > 0) {
                // Формируем текст уведомления
                const notificationText = `🎯 Новое задание доступно: "${taskData.name}"`;
                
                // Отправляем уведомление каждому креативщику
                for (const creator of creators) {
                    try {
                        console.log(`Отправка уведомления креативщику: ${creator.tg_id}`);
                        const sent = await ctx.telegram.sendMessage(creator.tg_id, notificationText);
                        console.log(`Уведомление успешно отправлено креативщику: ${creator.tg_id}, message_id: ${sent.message_id}`);
                    } catch (err) {
                        console.error(`Ошибка отправки уведомления креативщику ${creator.tg_id}:`, err);
                    }
                }
            }
        } catch (err) {
            console.error("Ошибка при отправке уведомлений креативщикам:", err);
        }
    }
    
    // Очищаем сессию и выходим из сцены
    ctx.session = {};
    ctx.scene.leave();
}

module.exports = writeTTScene;

