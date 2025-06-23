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

        if (user.position === "buyer") {
            keyboardLayout = buyerButtons;
        } else if (user.position === "owner") {
            // owner получает buyer-кнопки + owner-кнопки
            keyboardLayout = [...buyerButtons, ...ruMessage.keyboards.ownerKeyboard];
        } else if (user.position === "creator") {
            // Создаем копию массива и фильтруем undefined
            keyboardLayout = [...ruMessage.keyboards.startCreo].filter(btn => btn != null);

            // Проверяем наличие элементов для замены
            const shiftControl = ruMessage.keyboards.shiftControl;
            if (!shiftControl) throw new Error('Shift control buttons not defined');

            const hasActiveShift = await EmployeeScheduleService.findActiveShiftByCreativeId(user._id);
            const shiftButton = hasActiveShift === null ? shiftControl.start_shift : shiftControl.end_shift;
            // Убедимся, что индекс существует, или добавляем кнопку в конец
            if (keyboardLayout.length >= 4) {
                keyboardLayout[3] = shiftButton;
            } else {
                keyboardLayout.push(shiftButton);
            }
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