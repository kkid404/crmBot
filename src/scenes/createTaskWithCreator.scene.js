const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const { back } = require('../keyboards/back.keyboard');
const userService = require('../services/user.service');
const BuyerCreatorService = require('../services/buyerCreator.service');
const taskService = require('../services/task.service');
const { isValidAlpha2CountryCode } = require('../utils/countryValidation');
const { Markup } = require('telegraf');

// Функция для создания имени задачи
const createName = async (geo) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    let countTaskToday = await taskService.getTaskToday();
    countTaskToday = countTaskToday.length + 1;
    return `${geo}_${day}_${month}_${year}_${countTaskToday}`;
};

// Функция для создания клавиатуры с креативщиками
async function createCreatorsKeyboard(buyerId) {
    try {
        const buyer = await userService.findUserByTelegramId(buyerId);
        const buyerCreator = await BuyerCreatorService.getCreatorsByBuyer(buyer._id);
        
        if (!buyerCreator || !buyerCreator.creators || buyerCreator.creators.length === 0) {
            return null; // Нет связанных креативщиков
        }
        
        const buttons = buyerCreator.creators.map(creator => [
            Markup.button.callback(
                `@${creator.username || 'без_username'}`,
                `creator_${creator._id}`
            )
        ]);
        
        // Добавляем кнопку "Назад"
        buttons.push([Markup.button.callback('⬅️ Назад', 'back_to_main')]);
        
        return Markup.inlineKeyboard(buttons);
    } catch (error) {
        console.error('Ошибка при создании клавиатуры креативщиков:', error);
        return null;
    }
}

// Функция для создания задачи и назначения креативщику
async function createTaskForCreator(ctx, creatorId, creatorUsername) {
    try {
        const tgId = String(ctx.from.id);
        const user = await userService.findUserByTelegramId(tgId);
        
        const taskData = {
            name: ctx.session.name,
            description: ctx.session.description,
            buyer: user._id,
            creator: creatorId,
            state: 'time' // Задача ожидает установки времени админом
        };
        
        // Add optional fields if they exist in session
        if (ctx.session.link_app) taskData.link_app = ctx.session.link_app;
        if (ctx.session.example_creative) taskData.example_creative = ctx.session.example_creative;
        if (ctx.session.workType) taskData.workType = ctx.session.workType;
        if (ctx.session.points) taskData.points = ctx.session.points;
        if (ctx.session.bonus) taskData.bonus = ctx.session.bonus;
        
        let retryCount = 0;
        const maxRetries = 3;
        let success = false;
        let task;
        
        // Try to create task with retry logic for duplicate names
        while (retryCount < maxRetries && !success) {
            try {
                task = await taskService.createTask(taskData);
                success = true;
            } catch (error) {
                if (error.message.includes('duplicate key error') && error.message.includes('name')) {
                    retryCount++;
                    const nameParts = taskData.name.split('_');
                    const currentCounter = parseInt(nameParts.pop()) || 0;
                    nameParts.push((currentCounter + 1).toString());
                    taskData.name = nameParts.join('_');
                } else {
                    throw error;
                }
            }
        }
        
        if (!success) {
            console.error("Не удалось создать задачу после нескольких попыток");
            await ctx.reply("Произошла ошибка при создании задачи.", await start(ctx.from.id));
            return;
        }
        
        // Send notification to creator to set time
        const creator = await userService.findById(creatorId);
        
        if (creator && creator.tg_id) {
            try {
                const { setExpectedTimeKeyboard } = require('../keyboards/setExpectedTime.keyboard');
                const buyerName = user?.username || 'неизвестно';
                
                const notificationText = `⏳ Новая задача требует установки времени:

🎯 Задача: "${taskData.name}"
👨‍💼 Баер: @${buyerName}
📝 Описание: ${taskData.description}

Пожалуйста, установите ожидаемое время выполнения:`;
                
                // Send notification to creator
                console.log('🔍 Попытка отправки уведомления:', {
                    creatorUsername: creator.username,
                    creatorTgId: creator.tg_id,
                    tgIdType: typeof creator.tg_id,
                    taskId: task._id,
                    taskName: taskData.name
                });
                
                try {
                    const sentMessage = await ctx.telegram.sendMessage(
                        creator.tg_id,
                        notificationText,
                        setExpectedTimeKeyboard(task._id)
                    );
                    console.log(`✅ Уведомление успешно отправлено креативщику ${creator.username} (${creator.tg_id})`);
                    console.log('📨 Ответ от Telegram API:', {
                        messageId: sentMessage.message_id,
                        date: sentMessage.date,
                        chat: sentMessage.chat?.id
                    });
                    
                    await ctx.reply(
                        `✅ Задача "${taskData.name}" успешно создана и отправлена креативщику для установки времени.`,
                        await start(ctx.from.id)
                    );
                } catch (sendErr) {
                    console.error(`❌ ОШИБКА отправки уведомления креативщику ${creator.username} (${creator.tg_id}):`);
                    console.error('Детали ошибки:', sendErr);
                    console.error('Код ошибки:', sendErr.code);
                    console.error('Описание:', sendErr.description || sendErr.message);
                    
                    // Проверяем типичные ошибки
                    if (sendErr.code === 403 || sendErr.description?.includes('bot was blocked')) {
                        await ctx.reply(
                            `⚠️ Задача "${taskData.name}" создана, но креативщик заблокировал бота или не начал с ним диалог.\nСвяжитесь с ${creator.username} напрямую.`,
                            await start(ctx.from.id)
                        );
                    } else if (sendErr.description?.includes('chat not found')) {
                        await ctx.reply(
                            `⚠️ Задача "${taskData.name}" создана, но креативщик еще не начал диалог с ботом.\nПопросите ${creator.username} написать боту /start`,
                            await start(ctx.from.id)
                        );
                    } else {
                        await ctx.reply(
                            `⚠️ Задача "${taskData.name}" создана, но не удалось отправить уведомление креативщику: ${sendErr.message}`,
                            await start(ctx.from.id)
                        );
                    }
                }
            } catch (err) {
                console.error(`Общая ошибка в блоке создания задачи:`, err);
                await ctx.reply(
                    `✅ задача "${taskData.name}" успешно создана, но не удалось отправить уведомление креативщику`,
                    await start(ctx.from.id)
                );
            }
        } else {
            await ctx.reply(
                `⚠️ Задача "${taskData.name}" создана, но креативщик не найден`,
                await start(ctx.from.id)
            );
        }
        
        // Clear session and leave scene
        ctx.session = {};
        ctx.scene.leave();
        
    } catch (error) {
        console.error('Ошибка при создании задачи:', error);
        await ctx.reply("Произошла ошибка при создании задачи.", await start(ctx.from.id));
        ctx.session = {};
        ctx.scene.leave();
    }
}

const createTaskWithCreatorScene = new BaseScene('createTaskWithCreatorScene');

// Вход в сцену
createTaskWithCreatorScene.enter(async (ctx) => {
    try {
        const tgId = String(ctx.from.id);
        const user = await userService.findUserByTelegramId(tgId);
        
        // Проверяем, что пользователь является баером
        if (!user || user.position !== 'buyer') {
            await ctx.reply("⚠️ Только баеры могут создавать задачи.", await start(ctx.from.id));
            ctx.scene.leave();
            return;
        }
        
        // Проверяем, есть ли у баера связанные креативщики
        const buyerCreator = await BuyerCreatorService.getCreatorsByBuyer(user._id);
        if (!buyerCreator || !buyerCreator.creators || buyerCreator.creators.length === 0) {
            await ctx.reply(
                "⚠️ У вас нет связанных креативщиков.",
                await start(ctx.from.id)
            );
            ctx.scene.leave();
            return;
        }
        
        // Инициализируем сессию
        ctx.session.step = 1;
        ctx.session.buyerId = tgId;
        
        await ctx.reply(ruMessage.messages.writeTT.send_geo, back());
        
    } catch (error) {
        console.error('Ошибка при входе в сцену создания задачи:', error);
        await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте позже.", await start(ctx.from.id));
        ctx.scene.leave();
    }
});

// Обработчик текстовых сообщений
createTaskWithCreatorScene.on('text', async (ctx) => {
    try {
        const step = ctx.session.step;
        const userInput = ctx.message.text;

        // Обработка кнопки "Назад"
        if (userInput === ruMessage.keyboards.back[0]) {
            await ctx.reply(
                ruMessage.messages.start.replace('{name}', ctx.from.first_name),
                await start(ctx.from.id)
            );
            ctx.session = {};
            ctx.scene.leave();
            return;
        }

        switch (step) {
            case 1:
                // Валидация ГЕО кода
                if (!isValidAlpha2CountryCode(userInput)) {
                    await ctx.reply(
                        "❌ Неверный формат ГЕО кода. Пожалуйста, введите корректный двузначный код страны (например: US, RU, GB).",
                        back()
                    );
                    return;
                }
                
                ctx.session.geo = userInput.trim().toUpperCase();
                const name = await createName(ctx.session.geo);
                ctx.session.name = name;
                ctx.session.step = 2;
                await ctx.reply(ruMessage.messages.writeTT.send_description, back());
                break;
                
            case 2:
                ctx.session.description = userInput;
                ctx.session.step = 3;
                
                // Проверяем количество связанных креативщиков
                const buyer = await userService.findUserByTelegramId(ctx.session.buyerId);
                const buyerCreator = await BuyerCreatorService.getCreatorsByBuyer(buyer._id);
                
                if (!buyerCreator || !buyerCreator.creators || buyerCreator.creators.length === 0) {
                    await ctx.reply(
                        "⚠️ Ошибка при получении списка креативщиков.",
                        await start(ctx.from.id)
                    );
                    ctx.session = {};
                    ctx.scene.leave();
                    return;
                }
                
                // Если только один креативщик, автоматически назначаем задание
                if (buyerCreator.creators.length === 1) {
                    const creator = buyerCreator.creators[0];
                    await createTaskForCreator(ctx, creator._id, creator.username);
                    return;
                }
                
                // Если несколько креативщиков, показываем выбор
                const keyboard = await createCreatorsKeyboard(ctx.session.buyerId);
                if (keyboard) {
                    await ctx.reply("👨‍🎨 Выберите креативщика для назначения задачи:", keyboard);
                } else {
                    await ctx.reply(
                        "⚠️ Ошибка при получении списка креативщиков.",
                        await start(ctx.from.id)
                    );
                    ctx.session = {};
                    ctx.scene.leave();
                }
                break;
                
            default:
                await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте позже.", await start(ctx.from.id));
                ctx.session = {};
                ctx.scene.leave();
                break;
        }
    } catch (error) {
        console.error('Ошибка в обработке текста:', error);
        await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте позже.", await start(ctx.from.id));
        ctx.session = {};
        ctx.scene.leave();
    }
});

// Обработчик выбора креативщика
createTaskWithCreatorScene.action(/^creator_(.+)$/, async (ctx) => {
    try {
        const creatorId = ctx.match[1];
        const creator = await userService.findById(creatorId);
        await createTaskForCreator(ctx, creatorId, creator?.username);
    } catch (error) {
        console.error('Ошибка при создании задачи:', error);
        await ctx.reply("Произошла ошибка при создании задачи.", await start(ctx.from.id));
        ctx.session = {};
        ctx.scene.leave();
    }
});

// Обработчик кнопки "Назад"
createTaskWithCreatorScene.action('back_to_main', async (ctx) => {
    await ctx.reply(
        ruMessage.messages.start.replace('{name}', ctx.from.first_name),
        await start(ctx.from.id)
    );
    ctx.session = {};
    ctx.scene.leave();
});

module.exports = createTaskWithCreatorScene; 