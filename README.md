# Get Going
1. Create a Telegram bot on [@Botfather](https://telegram.me/BotFather)
2. Install Google Cloud SDK
   ```
3. Secrets (OPENAI_API_KEY, TELEGRAM_BOT_TOKEN, MODEL_NAME) are on Google Cloud secret manager.
  
4. Append `/telegram` to the url of the deployed model. For example, if the model is deployed at `https://us-central1-<project-id>.cloudfunctions.net/<model-name>`, then the webhook url is `https://us-central1-<project-id>.cloudfunctions.net/<model-name>/telegram`
5. Set your telegram webhook to the above url (https://core.telegram.org/bots/api#setwebhook)
6. Message the bot