const { Markup } = require('telegraf');
const ruMessage = require('../lang/ru.json');
const userService = require('../services/user.service');
const EmployeeScheduleService = require('../services/employee_schedule.service');

async function start(tgId) {
    try {
        const user = await userService.findUserByTelegramId(tgId);
        if (!user) throw new Error('User not found');

        let keyboardLayout;

        // Универсальная buyer-клавиатура
        const buyerButtons = [...Object.values(ruMessage.keyboards.startBuyer), "📝 Быстрое ТЗ"];

        if (user.position === "buyer" && user.role === "teamlead") {
            // For buyers who are also team leads
            keyboardLayout = [...buyerButtons, "👨‍💼 Меню teamlead"];
        } else if (user.position === "buyer") {
            keyboardLayout = buyerButtons;
        } else if (user.position === "owner") {
            // owner получает buyer-кнопки + owner-кнопки
            keyboardLayout = [...buyerButtons, ...ruMessage.keyboards.ownerKeyboard];
        } else if (user.position === "creator") {
            // Креативщики работают через веб-интерфейс
            return Markup.inlineKeyboard([
                [Markup.button.url('🌐 Перейти на сайт', 'http://wmacreoweb.shop/')]
            ]);
        } else if (user.position === "finance") {
            keyboardLayout = [Object.values(ruMessage.keyboards.startFinance)];

            // Создаем клавиатуру
            return Markup.keyboard(keyboardLayout).resize().oneTime();
        }

        // Фильтруем оставшиеся undefined (на всякий случай)
        keyboardLayout = keyboardLayout.filter(btn => btn != null);

        return Markup.keyboard(keyboardLayout)
            .resize()
            .oneTime();
            
    } catch (error) {
        console.error('Error generating keyboard:', error);
        // Возвращаем клавиатуру по умолчанию, предварительно проверив её
        const defaultLayout = ruMessage.keyboards.startCreo ? [...ruMessage.keyboards.startCreo].filter(btn => btn != null) : [['Произошла ошибка']];
        return Markup.keyboard(defaultLayout).resize().oneTime();
    }
}

module.exports = { start };