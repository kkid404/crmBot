const ruMessage = require('../lang/ru.json');
const { start } = require('../keyboards/start.keyboard');

module.exports = {
    command: 'start',
    description: 'Start command',
    action: async (ctx) => {
        try {
            // Проверяем, что все необходимые данные доступны
            if (!ctx.from || !ctx.from.id || !ctx.from.first_name) {
                console.error('Отсутствуют необходимые данные пользователя:', ctx.from);
                await ctx.reply('Произошла ошибка при получении данных пользователя. Пожалуйста, попробуйте позже.');
                return;
            }

            // Пытаемся получить клавиатуру
            let keyboard;
            try {
                keyboard = await start(ctx.from.id);
            } catch (keyboardError) {
                console.error('Ошибка при создании клавиатуры:', keyboardError);
                keyboard = {}; // Используем пустую клавиатуру в случае ошибки
            }

            // Отправляем сообщение
            await ctx.telegram.sendMessage(
                ctx.from.id, 
                ruMessage.messages.start.replace("{name}", ctx.from.first_name), 
                keyboard
            );
        } catch (error) {
            console.error('Ошибка при обработке команды start:', error);
            
            // Пытаемся отправить сообщение об ошибке
            try {
                await ctx.reply('Произошла ошибка при запуске бота. Пожалуйста, попробуйте позже или обратитесь к администратору.');
            } catch (replyError) {
                console.error('Не удалось отправить сообщение об ошибке:', replyError);
            }
        }
    }
};