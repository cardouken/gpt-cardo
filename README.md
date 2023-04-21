# Get Going
1. Create a Telegram bot on [@Botfather](https://telegram.me/BotFather)
2. Install firebase CLI
   ```
   npm install -g firebase-tools
   ```
3. CD into the functions folder
   ```
   cd functions
   npm install firebase-functions@latest firebase-admin@latest --save
   ```
 
4. Remember to add secrets (OPENAI_API_KEY, TELEGRAM_BOT_TOKEN, MODEL_NAME) in a secrets.local file for local deployment, and on Google Cloud secret manager before production deployment.
  
5. Follow the instructions at https://firebase.google.com/docs/functions/get-started#emulate-execution-of-your-functions to run a local emulator or https://firebase.google.com/docs/functions/get-started#deploy-functions-to-a-production-environment to deploy in prod.
   
6. The firebase CLI should output the URL for the HTTP function endpoints, e.g. https://europe-west1-MY_PROJECT.cloudfunctions.net/handler. Take note of this. Append /telegram behind - this is your URL to add to the telegram webhook, e.g. https://europe-west1-MY_PROJECT.cloudfunctions.net/handler/telegram

7. Set your telegram webhook to the above url (https://core.telegram.org/bots/api#setwebhook)
    
8. Message the bot