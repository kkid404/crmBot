const taskService = require('../services/task.service');
const { Markup } = require('telegraf');

// Константы для пагинации
const TASKS_PER_PAGE = 5; // Максимальное количество задач на странице

// Функция для создания inline клавиатуры на основе данных задач с пагинацией
const myTasks = async (id, role = '', state, page = 0) => {
    let tasks = await taskService.getUserTasks(id, role, state); // Получаем активные задачи
    
    // Сортируем задачи по дате создания (сначала новые)
    tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Вычисляем общее количество страниц
    const totalPages = Math.ceil(tasks.length / TASKS_PER_PAGE);
    // Получаем задачи для текущей страницы
    const startIndex = page * TASKS_PER_PAGE;
    const tasksForPage = tasks.slice(startIndex, startIndex + TASKS_PER_PAGE);

    // Создаем массив кнопок для задач текущей страницы
    const inlineKeyboard = tasksForPage.map(task => {
        // Add 💰 emoji for tasks with bonus
        const bonusIndicator = task.bonus ? '💰 ' : '';
        // Ограничиваем длину названия задачи
        const taskName = task.name.length > 30 ? task.name.substring(0, 27) + '...' : task.name;
        return [Markup.button.callback(`${bonusIndicator}${taskName}`, task._id.toString())];
    });

    // Добавляем кнопки навигации, если есть несколько страниц
    if (totalPages > 1) {
        const navigationButtons = [];
        
        if (page > 0) {
            navigationButtons.push(Markup.button.callback('⬅️ Назад', `page_${page-1}`));
        }
        
        navigationButtons.push(Markup.button.callback(`${page+1}/${totalPages}`, 'current_page'));
        
        if (page < totalPages - 1) {
            navigationButtons.push(Markup.button.callback('Вперед ➡️', `page_${page+1}`));
        }
        
        inlineKeyboard.push(navigationButtons);
    }

    // Добавляем кнопку выхода
    inlineKeyboard.push([Markup.button.callback('Выйти', 'quit')]);

    // Возвращаем inline-клавиатуру
    return Markup.inlineKeyboard(inlineKeyboard);
};

// Функция для создания inline клавиатуры для креативщиков с подписями в зависимости от статуса
const creatorTasks = async (id, state = '', page = 0) => {
    let tasks = await taskService.getUserTasks(id, 'creator');
    
    // Сортируем задачи так, чтобы сначала шли задачи в работе (progress),
    // затем остальные, причём внутри каждой группы задачи упорядочены по дате создания (сначала новые)
    const progressTasks = tasks
        .filter(t => t.state === 'progress')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const otherTasks = tasks
        .filter(t => t.state !== 'progress')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    tasks = [...progressTasks, ...otherTasks];

    // Статусы с соответствующими подписями
    const stateLabels = {
        'progress': '🔄 В работе',
        'time': '⏰ Ожидает времени',
        'wait': '⏳ На модерации',
        'done': '✅ Выполнено',
        'failed': '❌ Провалено',
        'canceled': '🚫 Отменено'
    };

    // Вычисляем общее количество страниц
    const totalPages = Math.ceil(tasks.length / TASKS_PER_PAGE);
    // Получаем задачи для текущей страницы
    const startIndex = page * TASKS_PER_PAGE;
    const tasksForPage = tasks.slice(startIndex, startIndex + TASKS_PER_PAGE);

    // Создаем массив кнопок для задач текущей страницы с подписями в зависимости от статуса
    const inlineKeyboard = tasksForPage.map(task => {
        // Получаем подпись для статуса или используем сам статус, если нет соответствия
        const stateLabel = stateLabels[task.state] || task.state;
        
        // Add 💰 emoji for tasks with bonus
        const bonusIndicator = task.bonus ? '💰 ' : '';
        
        // Ограничиваем длину названия задачи
        const taskName = task.name.length > 25 ? task.name.substring(0, 22) + '...' : task.name;
        const buttonText = `${bonusIndicator}${taskName} (${stateLabel})`;
        return [Markup.button.callback(buttonText, task._id.toString())];
    });

    // Добавляем кнопки навигации, если есть несколько страниц
    if (totalPages > 1) {
        const navigationButtons = [];
        
        if (page > 0) {
            navigationButtons.push(Markup.button.callback('⬅️ Назад', `page_${page-1}`));
        }
        
        navigationButtons.push(Markup.button.callback(`${page+1}/${totalPages}`, 'current_page'));
        
        if (page < totalPages - 1) {
            navigationButtons.push(Markup.button.callback('Вперед ➡️', `page_${page+1}`));
        }
        
        inlineKeyboard.push(navigationButtons);
    }

    // Добавляем кнопку выхода
    inlineKeyboard.push([Markup.button.callback('Выйти', 'quit')]);

    // Возвращаем inline-клавиатуру
    return Markup.inlineKeyboard(inlineKeyboard);
};

module.exports = { myTasks, creatorTasks };