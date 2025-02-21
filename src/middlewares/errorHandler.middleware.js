const errorHandler = async (ctx, next) => {
    try {
        return await next();
    } catch (error) {
        // Проверяем, заблокировал ли пользователь бота
        if (error.response?.error_code === 403 && error.response?.description.includes('bot was blocked by the user')) {
            console.log(`Пользователь ${ctx.from?.id} заблокировал бота`);
            return;
        }

        // Логируем остальные ошибки
        console.error('Ошибка в боте:', {
            error: error.message,
            update: ctx.update,
            user: ctx.from,
            chat: ctx.chat
        });

        // Пытаемся отправить сообщение об ошибке пользователю
        try {
            await ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
        } catch (replyError) {
            if (replyError.response?.error_code === 403) {
                console.log(`Не удалось отправить сообщение об ошибке пользователю ${ctx.from?.id} (бот заблокирован)`);
            } else {
                console.error('Ошибка при отправке сообщения об ошибке:', replyError);
            }
        }
    }
};

module.exports = errorHandler; 