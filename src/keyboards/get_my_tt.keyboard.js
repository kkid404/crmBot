const taskService = require('../services/task.service');
const { Markup } = require('telegraf');

// Функция для создания inline клавиатуры на основе данных задач
const myTasks = async (id, role = '', state) => {
    const tasks = await taskService.getUserTasks(id, role, state); // Получаем активные задачи


    // Создаем массив кнопок для задач
    const inlineKeyboard = tasks.map(task => {
        return [Markup.button.callback(task.name, task._id.toString())]; // Оборачиваем каждую кнопку в массив
    });


    inlineKeyboard.push([Markup.button.callback('Выйти', 'quit')]);

    // Возвращаем inline-клавиатуру
    return Markup.inlineKeyboard(inlineKeyboard);
};

// Функция для создания inline клавиатуры для креативщиков с подписями в зависимости от статуса
const creatorTasks = async (id) => {
    const tasks = await taskService.getUserTasks(id, 'creator');

    // Статусы с соответствующими подписями
    const stateLabels = {
        'progress': '🔄 В работе',
        'wait': '⏳ На модерации',
        'done': '✅ Выполнено',
        'failed': '❌ Провалено',
        'canceled': '🚫 Отменено'
    };

    // Создаем массив кнопок для задач с подписями в зависимости от статуса
    const inlineKeyboard = tasks.map(task => {
        // Получаем подпись для статуса или используем сам статус, если нет соответствия
        const stateLabel = stateLabels[task.state] || task.state;
        const buttonText = `${task.name} (${stateLabel})`;
        return [Markup.button.callback(buttonText, task._id.toString())];
    });

    inlineKeyboard.push([Markup.button.callback('Выйти', 'quit')]);

    // Возвращаем inline-клавиатуру
    return Markup.inlineKeyboard(inlineKeyboard);
};

module.exports = { myTasks, creatorTasks };