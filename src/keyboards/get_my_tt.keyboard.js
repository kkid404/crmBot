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

module.exports = { myTasks };