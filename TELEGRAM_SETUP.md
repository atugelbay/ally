# Telegram Bot Setup для тестирования

## 1. Создание бота

1. Открой [@BotFather](https://t.me/botfather) в Telegram
2. Отправь команду `/newbot`
3. Введи имя бота (например: "Ally Test Bot")
4. Введи username бота (например: "ally_test_bot")
5. Сохрани **Bot Token** (формат: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

## 2. Настройка webhook

Замени `YOUR_BOT_TOKEN` на токен из шага 1:

```bash
# Установить webhook (замени на свой домен)
curl -X POST "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com:9090/tg/abc/webhook",
    "secret_token": "abc"
  }'

# Проверить webhook
curl "https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo"
```

## 3. Локальное тестирование (через ngrok)

Если тестируешь локально:

```bash
# Установи ngrok: https://ngrok.com/download
ngrok http 9090

# Используй HTTPS URL от ngrok в webhook:
curl -X POST "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://abc123.ngrok.io/tg/abc/webhook",
    "secret_token": "abc"
  }'
```

## 4. Проверка

1. Отправь сообщение боту в Telegram
2. Проверь в Inbox UI: http://localhost:3000
3. Сообщение должно появиться в списке тредов

## 5. Переменные окружения

Добавь в `.env.example`:
```
TG_BOT_TOKEN=YOUR_BOT_TOKEN
TG_WEBHOOK_SECRET=abc
```

## Troubleshooting

- **Webhook не работает**: проверь, что сервисы запущены (`:9090`, `:8081`)
- **Сообщения не появляются**: проверь логи воркера
- **CORS ошибки**: добавь `http://localhost:3000` в CORS настройки API
