const { google } = require('googleapis');
const path = require('path');
const credentials = require(path.join(process.cwd(), 'credentials.json')); // Используем абсолютный путь

class GoogleSheetsService {
    constructor() {
        try {
            this.auth = new google.auth.GoogleAuth({
                credentials,
                scopes: [
                    'https://www.googleapis.com/auth/spreadsheets',
                    'https://www.googleapis.com/auth/drive'
                ]
            });
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            this.drive = google.drive({ version: 'v3', auth: this.auth });
        } catch (error) {
            console.error('Ошибка инициализации Google API:', error);
            throw error;
        }
    }

    async createSpreadsheet(title) {
        try {
            console.log('Создание новой таблицы...');
            const response = await this.sheets.spreadsheets.create({
                requestBody: {
                    properties: { 
                        title,
                        locale: 'ru_RU'
                    },
                    sheets: [
                        {
                            properties: {
                                title: 'Лист 1',
                                gridProperties: {
                                    rowCount: 1000,
                                    columnCount: 26
                                }
                            }
                        }
                    ]
                }
            });

            const spreadsheetId = response.data.spreadsheetId;
            console.log('Таблица создана, ID:', spreadsheetId);

            // Устанавливаем права доступа на редактирование для всех
            await this.drive.permissions.create({
                fileId: spreadsheetId,
                requestBody: {
                    role: 'writer',
                    type: 'anyone'
                },
                supportsAllDrives: true,
                sendNotificationEmail: false
            });

            // Проверяем, что права установлены
            const permission = await this.drive.permissions.list({
                fileId: spreadsheetId,
                supportsAllDrives: true
            });

            if (!permission.data.permissions.some(p => p.type === 'anyone' && p.role === 'writer')) {
                throw new Error('Не удалось установить права на редактирование');
            }

            console.log('Права доступа на редактирование установлены');
            return spreadsheetId;
        } catch (error) {
            console.error('Ошибка при создании таблицы:', error);
            throw new Error(`Ошибка при создании таблицы: ${error.message}`);
        }
    }

    async getOrCreateSpreadsheet(title, envSpreadsheetId) {
        try {
            // Check if we have a spreadsheet ID in environment variables
            if (envSpreadsheetId) {
                console.log(`Использование существующей таблицы с ID: ${envSpreadsheetId}`);
                try {
                    // Verify that the spreadsheet exists and is accessible
                    await this.sheets.spreadsheets.get({
                        spreadsheetId: envSpreadsheetId
                    });
                    
                    // Optional: Update title if it's different
                    await this.sheets.spreadsheets.batchUpdate({
                        spreadsheetId: envSpreadsheetId,
                        requestBody: {
                            requests: [{
                                updateSpreadsheetProperties: {
                                    properties: {
                                        title: title
                                    },
                                    fields: 'title'
                                }
                            }]
                        }
                    });
                    
                    return envSpreadsheetId;
                } catch (error) {
                    console.warn(`Не удалось получить доступ к существующей таблице: ${error.message}. Создание новой таблицы...`);
                    // If we can't access the spreadsheet, create a new one
                    return await this.createSpreadsheet(title);
                }
            } else {
                // If no spreadsheet ID is provided, create a new one
                return await this.createSpreadsheet(title);
            }
        } catch (error) {
            console.error('Ошибка при получении/создании таблицы:', error);
            throw new Error(`Ошибка при получении/создании таблицы: ${error.message}`);
        }
    }

    async addSheet(spreadsheetId, title) {
        try {
            console.log(`Добавление листа "${title}"...`);
            
            // First check if sheet already exists
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId
            });
            
            // Debug: List all existing sheets
            const existingSheets = spreadsheet.data.sheets.map(sheet => sheet.properties.title);
            console.log(`Существующие листы: ${JSON.stringify(existingSheets)}`);
            
            // If sheet with this name already exists, skip creation
            const sheetExists = spreadsheet.data.sheets.some(sheet => 
                sheet.properties.title === title
            );
            
            if (sheetExists) {
                console.log(`Лист "${title}" уже существует, пропускаем создание`);
                return;
            } else {
                console.log(`Лист "${title}" не найден, создаем новый`);
            }
            
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title,
                                gridProperties: {
                                    rowCount: 1000,
                                    columnCount: 26
                                }
                            }
                        }
                    }]
                }
            });
            console.log(`Лист "${title}" успешно добавлен`);
        } catch (error) {
            if (error.message && error.message.includes('already exists')) {
                // Handle the case where the sheet exists even though our check didn't catch it
                console.log(`Лист "${title}" уже существует (обнаружено через ошибку API), пропускаем создание`);
                return;
            }
            console.error(`Ошибка при добавлении листа "${title}":`, error);
            throw new Error(`Ошибка при добавлении листа: ${error.message}`);
        }
    }

    async writeData(spreadsheetId, range, values) {
        try {
            console.log(`Запись данных в диапазон ${range}...`);
            await this.sheets.spreadsheets.values.update({
                spreadsheetId,
                range,
                valueInputOption: 'RAW',
                requestBody: { values }
            });
            console.log('Данные записаны');
        } catch (error) {
            console.error('Ошибка при записи данных:', error);
            throw new Error(`Ошибка при записи данных: ${error.message}`);
        }
    }

    async deleteSheet(spreadsheetId, sheetId) {
        try {
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{
                        deleteSheet: {
                            sheetId
                        }
                    }]
                }
            });
        } catch (error) {
            console.error('Ошибка при удалении листа:', error);
        }
    }
}

module.exports = new GoogleSheetsService(); 