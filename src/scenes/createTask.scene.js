const { Scenes } = require('telegraf');
const { BaseScene } = Scenes;
const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');
const { back } = require('../keyboards/back.keyboard');
const { dont_example } = require('../keyboards/dont_example.keyboard');
const userService = require('../services/user.service');

const taskService = require('../services/task.service');

function handleError(error) {
    console.error(`Error occurred: ${error.message}`);
    // Вы можете также отправить сообщение пользователю или записать ошибку более детально
}

async function handleMedia(ctx) {
    const tgId = String(ctx.from.id);
    // Проверяем, ожидаем ли мы медиафайл
    if (!ctx.session.awaitingMedia) {
        return; // Если не ожидаем медиафайл, ничего не делаем
    }

    const fileId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : ctx.message.video.file_id;
    if (!fileId) return; // Если нет файла, пропускаем


    ctx.session.example = fileId
    let user = await userService.findUserByTelegramId(tgId);
    const data = {
        name: ctx.session.name,
        link_app: ctx.session.app,
        description: ctx.session.description,
        example_creative: ctx.session.example,
        buyer: user._id
    }
    try{
        let taskData = {
            name: ctx.session.name,
            link_app: ctx.session.app,
            description: ctx.session.description,
            example_creative: ctx.session.example,
            buyer: user._id
        };
        
        let maxRetries = 5; // Максимальное количество попыток
        let retryCount = 0;
        let success = false;
        
        while (!success && retryCount < maxRetries) {
            try {
                await taskService.createTask(taskData);
                success = true;
                await ctx.reply(ruMessage.messages.writeTT.queued.replace("{name}", taskData.name), await start(ctx.from.id));
            } catch (error) {
                // Если ошибка связана с дублированием ключа, увеличиваем счетчик и пробуем снова
                if (error.message.includes('duplicate key error') && error.message.includes('name')) {
                    retryCount++;
                    // Извлекаем части имени
                    const nameParts = taskData.name.split('_');
                    // Увеличиваем счетчик в имени
                    const currentCounter = parseInt(nameParts[nameParts.length - 1]);
                    nameParts[nameParts.length - 1] = (currentCounter + retryCount).toString();
                    // Формируем новое имя
                    taskData.name = nameParts.join('_');
                } else {
                    // Если ошибка не связана с дублированием, выходим из цикла
                    throw error;
                }
            }
        }
        
        // Если после всех попыток не удалось создать задачу
        if (!success) {
            console.error("Не удалось создать задачу после нескольких попыток");
            await ctx.reply(ruMessage.messages.errors.writeTT, await start(ctx.from.id));
        }
    } catch(error) {
        console.error("Ошибка создания задачи:", error);
        await ctx.reply(ruMessage.messages.errors.writeTT, await start(ctx.from.id));
    }
    ctx.session = {};
    ctx.scene.leave();
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


const writeTTScene = new BaseScene('writeTTScene');

writeTTScene.enter(async (ctx) => {
    ctx.session.step = 1;
    await ctx.reply(ruMessage.messages.writeTT.send_geo, back());
});

writeTTScene.on('text', async (ctx) => {
    const step = ctx.session.step;
    const tgId = String(ctx.from.id);
    const userInput = ctx.message.text;

    // обработка кнопки назад
    if (userInput == ruMessage.keyboards.back[0]) {
        
        await ctx.scene.enter('backScene')
        ctx.session = {};
        ctx.scene.leave();
        return
    }

    switch (step) {
        case 1:
            ctx.session.geo = ctx.message.text
            const name = await createName(ctx.session.geo)
            ctx.session.name = name
            await ctx.reply(ruMessage.messages.writeTT.send_app, back())
            break;
        case 2:
            ctx.session.app = ctx.message.text
            await ctx.reply(ruMessage.messages.writeTT.send_description, back())
            break;
        case 3:
            ctx.session.description = ctx.message.text
            await ctx.reply(ruMessage.messages.writeTT.send_example, await dont_example())
            // Ожидаем медиафайл и сохраняем его в сессии
            ctx.session.awaitingMedia = true; // Устанавливаем флаг ожидания медиафайла
            break;
        case 4:
            ctx.session.example = ctx.message.text
            let user = await userService.findUserByTelegramId(tgId);
            let taskData = {
                name: ctx.session.name,
                link_app: ctx.session.app,
                description: ctx.session.description,
                example_creative: ctx.session.example,
                buyer: user._id
            }
            
            try {
                let maxRetries = 5; // Максимальное количество попыток
                let retryCount = 0;
                let success = false;
                
                while (!success && retryCount < maxRetries) {
                    try {
                        await taskService.createTask(taskData);
                        success = true;
                        await ctx.reply(ruMessage.messages.writeTT.queued.replace("{name}", taskData.name), await start(ctx.from.id));
                    } catch (error) {
                        // Если ошибка связана с дублированием ключа, увеличиваем счетчик и пробуем снова
                        if (error.message.includes('duplicate key error') && error.message.includes('name')) {
                            retryCount++;
                            // Извлекаем части имени
                            const nameParts = taskData.name.split('_');
                            // Увеличиваем счетчик в имени
                            const currentCounter = parseInt(nameParts[nameParts.length - 1]);
                            nameParts[nameParts.length - 1] = (currentCounter + retryCount).toString();
                            // Формируем новое имя
                            taskData.name = nameParts.join('_');
                        } else {
                            // Если ошибка не связана с дублированием, выходим из цикла
                            throw error;
                        }
                    }
                }
                
                // Если после всех попыток не удалось создать задачу
                if (!success) {
                    console.error("Не удалось создать задачу после нескольких попыток");
                    await ctx.reply(ruMessage.messages.errors.writeTT, await start(ctx.from.id));
                }
            } catch (error) {
                console.error("Ошибка создания задачи:", error);
                await ctx.reply(ruMessage.messages.errors.writeTT, await start(ctx.from.id));
            }
            
            ctx.session = {};
            ctx.scene.leave();
            break;
        default:
            await ctx.reply(ruMessage.messages.errors.writeTT, await start(ctx.from.id));
            ctx.session = {};
            ctx.scene.leave();
            break;
    }
    ctx.session.step++;
    })


writeTTScene.on('photo', handleMedia);
writeTTScene.on('video', handleMedia);

module.exports = writeTTScene;

