const { Markup } = require('telegraf');
const taskService = require('../services/task.service');

// Функция для создания inline клавиатуры на основе данных задач
const tasks = async () => {
    const tasks = await taskService.getTasksActive(); // Получаем активные задачи

    // Создаем массив кнопок
    const inlineKeyboard = tasks.map(task => {
        return [Markup.button.callback(task.name, task._id.toString())]; // Оборачиваем каждую кнопку в массив
    });
    
    // Добавляем кнопку для автоматического выбора ТЗ
    inlineKeyboard.push([Markup.button.callback('🔄 Автоматически выбрать ТЗ', 'auto_assign')]);
    
    // Добавляем кнопку выхода
    inlineKeyboard.push([Markup.button.callback('Выйти', 'quit')]);
    
    // Возвращаем inline-клавиатуру
    return Markup.inlineKeyboard(inlineKeyboard);
};

module.exports = { tasks };