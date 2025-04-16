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

        while (!success && retryCount < maxRetries) {
            try {
                await taskService.createTask(taskData);
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
        }
    } catch (error) {
        console.error("Ошибка создания задачи:", error);
        await ctx.reply(ruMessage.messages.errors.writeTT, await start(ctx.from.id));
    } finally {
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
        const tgId = String(ctx.from.id);
        const user = await userService.findUserByTelegramId(tgId);
        
        // Устанавливаем пустой массив примеров
        ctx.session.mediaFiles = [];
        
        const taskData = {
            name: ctx.session.name,
            link_app: ctx.session.app,
            description: ctx.session.description,
            example_creative: [],
            buyer: user._id
        };

        await taskService.createTask(taskData);
        await ctx.reply(
            ruMessage.messages.writeTT.queued.replace("{name}", taskData.name),
            await start(tgId)
        );
    } catch (error) {
        console.error("Ошибка создания задачи:", error);
        await ctx.reply(ruMessage.messages.errors.writeTT, await start(tgId));
    } finally {
        ctx.session = {};
        ctx.scene.leave();
    }
});

module.exports = writeTTScene;

