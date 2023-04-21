const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const {Timestamp} = require('firebase-admin/firestore');
const tokenCounter = require('openai-gpt-token-counter')
const {Configuration, OpenAIApi} = require("openai");
const {sendTelegramMessage} = require("./sendTelegramMessage");

admin.initializeApp();
const app = express();
const stopSequence = "<END>";
const meToken = "Me:";
const theyToken = "They:";
const newConvoElapsedTime = 3600;
const promptMaxChar = 1800;
let model = "curie:ft-personal-2023-04-21-02-30-57";
let temp = 0.5;
let frequency_penalty = 0.83;
let presence_penalty = 0.85;

app.post("/telegram", async (req, res) => {
    const db = admin.firestore();
    let webhookRef = db.collection("webhook_events").doc(`${req.body.update_id}`);
    let webhookSnap = await webhookRef.get();
    if (webhookSnap.exists) {
        console.log(`Webhook event ${req.body.update_id} already exists, ignoring`);
        res.sendStatus(200);
        return;
    }
    await webhookRef.set({
        update_id: req.body.update_id
    });

    if (
        req.body &&
        req.body.message &&
        req.body.message.from &&
        req.body.message.from.id &&
        req.body.message.chat.id &&
        req.body.message.chat.type
    ) {
        const message = req.body.message;
        const userId = message.from.id;
        const userFirstname = message.from.first_name;
        const chatType = message.chat.type;
        const chatTitle = message.chat?.title;
        let chatId = message.chat.id;
        console.log(`message: ${message} | userId: ${userId} | userFirstname: ${userFirstname} | chatId: ${chatId} | chatType: ${chatType} | chatTitle: ${chatTitle}`)

        let name = chatTitle;
        if (chatType === "private") {
            chatId = userId;
            name = userFirstname;
        }

        const text = message.text;
        if (!text) {
            console.log(`No text in message, ignoring`)
            res.sendStatus(200);
            return;
        }

        const chatRef = db.collection("chats").doc(`${chatId}`);
        let chatSnap = await chatRef.get();

        if (!chatSnap.exists) {
            await chatRef.set({name: name, isEnabled: true}, {merge: true});
        }

        if (text.toLowerCase() === '/off' || text.toLowerCase() === '/off@cardonotabot') {
            await chatRef.set({name: name, isEnabled: false}, {merge: true});
            await sendTelegramMessage("Bot shutting the fuck up now in this chat", chatId, message?.message_id);
            return;
        }
        if (text.toLowerCase() === '/on' || text.toLowerCase() === '/on@cardonotabot') {
            await chatRef.set({name: name, isEnabled: true}, {merge: true});
            await sendTelegramMessage("ayoo we bacccc online", chatId, message?.message_id);
            return;
        }

        chatSnap = await chatRef.get();
        if (chatSnap.get("isEnabled") === false) {
            res.sendStatus(200);
            return;
        }
        await chatRef.set({newConversationRequested: true}, {merge: true});
        chatSnap = await chatRef.get()

        switch (text.toLowerCase()) {
            case "/reset":
            case "/reset@cardonotabot":
                await chatRef.update({
                    newConversationRequested: true
                });
                await sendTelegramMessage("Conversation history has been reset", chatId, message?.message_id);
                break;
            case "/model":
            case "/model@cardonotabot":
                if (model === "curie:ft-personal-2023-04-20-20-43-28") {
                    model = "curie:ft-personal-2023-04-21-02-30-57"
                } else {
                    model = "curie:ft-personal-2023-04-20-20-43-28"
                }
                await sendTelegramMessage(`Using model ${model} for future requests`, chatId, message?.message_id);
                break;
            case "/temp0_1":
            case "/temp0_1@cardonotabot":
                temp = 0.1
                await sendTelegramMessage(`Using temperature ${temp} for future requests`, chatId, message?.message_id);
                break;
            case "/temp0_2":
            case "/temp0_2@cardonotabot":
                temp = 0.2
                await sendTelegramMessage(`Using temperature ${temp} for future requests`, chatId, message?.message_id);
                break;
            case "/temp0_3":
            case "/temp0_3@cardonotabot":
                temp = 0.3
                await sendTelegramMessage(`Using temperature ${temp} for future requests`, chatId, message?.message_id);
                break;
            case "/temp0_4":
            case "/temp0_4@cardonotabot":
                temp = 0.4
                await sendTelegramMessage(`Using temperature ${temp} for future requests`, chatId, message?.message_id);
                break;
            case "/temp0_5":
            case "/temp0_5@cardonotabot":
                temp = 0.5
                await sendTelegramMessage(`Using temperature ${temp} for future requests`, chatId, message?.message_id);
                break;
            case "/temp0_6":
            case "/temp0_6@cardonotabot":
                temp = 0.6
                await sendTelegramMessage(`Using temperature ${temp} for future requests`, chatId, message?.message_id);
                break;
            case "/temp0_7":
            case "/temp0_7@cardonotabot":
                temp = 0.7
                await sendTelegramMessage(`Using temperature ${temp} for future requests`, chatId, message?.message_id);
                break;
            case "/temp0_8":
            case "/temp0_8@cardonotabot":
                temp = 0.8
                await sendTelegramMessage(`Using temperature ${temp} for future requests`, chatId, message?.message_id);
                break;
            case "/temp0_9":
            case "/temp0_9@cardonotabot":
                temp = 0.9
                await sendTelegramMessage(`Using temperature ${temp} for future requests`, chatId, message?.message_id);
                break;
            case "/temp1_0":
            case "/temp1_0@cardonotabot":
                temp = 1.0
                await sendTelegramMessage(`Using temperature ${temp} for future requests`, chatId, message?.message_id);
                break;
            case "/getparams":
            case "/getparams@cardonotabot":
                await sendTelegramMessage(
                    `Model: ${model}\nTemp: ${temp}\nFrequency penalty: ${frequency_penalty}\nPresence penalty: ${presence_penalty}\nEnabled for chat ${name}: ${chatSnap.get("isEnabled")}`,
                    chatId, message?.message_id
                );
                break;
            default:
                const messageTimestamp = new Timestamp(parseInt(message.date), 0);
                const messagesRef = chatRef.collection("messages");
                const latestSnap = await messagesRef.where("from", "==", "me").orderBy("timestamp", "desc").limit(1).get();
                const newConversationRequested = chatSnap.get('newConversationRequested');
                let convStart = newConversationRequested;
                if (!latestSnap.empty) {
                    const latestDoc = latestSnap.docs[0];
                    const timestamp = latestDoc.get("timestamp").seconds;
                    convStart = convStart || (messageTimestamp.seconds - timestamp) > newConvoElapsedTime;
                }

                await messagesRef.doc(`${message.message_id}`).set({
                    timestamp: messageTimestamp,
                    from: "them",
                    text: text,
                    convStart: convStart,
                });
                await chatRef.update({
                    newConversationRequested: false
                });

                await sleep(3200)
                const latestConvStartSnap = await messagesRef.where("convStart", "==", true).orderBy("timestamp", "desc").limit(1).get();
                if (latestConvStartSnap.empty) {
                    console.log("No conversation start found");
                    return;
                }
                const convoStartTime = await latestConvStartSnap.docs[0].get("timestamp");
                const convoQuerySnap = await messagesRef.where("timestamp", ">=", convoStartTime).orderBy("timestamp").get();

                let prompt = "";
                convoQuerySnap.forEach(doc => {
                    const message = doc.data();
                    const prefix = message.from === "me" ? meToken : theyToken
                    prompt += `${prefix}${message.text}\n`
                })
                prompt += `${meToken}`;
                prompt = truncatePrompt(prompt);

                const gptResponse = await callGpt(prompt, stopSequence);
                await handleResponse(gptResponse, messagesRef, chatId);
                break;
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

function truncatePrompt(prompt) {
    let truncatedPrompt = prompt;
    if (truncatedPrompt.length > promptMaxChar) {
        truncatedPrompt = truncatedPrompt.slice(-promptMaxChar);
    }
    const indexOfFirstMeToken = truncatedPrompt.indexOf(meToken);
    const indexOfFirstTheyToken = truncatedPrompt.indexOf(theyToken);
    const newStartIndex = Math.min(indexOfFirstMeToken, indexOfFirstTheyToken);
    return truncatedPrompt.slice(newStartIndex);
}

async function handleResponse(gptResponse, messagesRef, chatId) {
    if (!!gptResponse) {
        let truncatedResponse = gptResponse.split(theyToken)[0];
        let replies = truncatedResponse.split(`${meToken}`);
        console.log(replies);
        let reply;
        for (reply of replies) {
            const res = await sendTelegramMessage(reply, chatId);
            const messageTimestamp = new Timestamp(parseInt(res.data.result.date), 0);
            const messageId = res.data.result.message_id;
            await messagesRef.doc(`${messageId}`).set({
                timestamp: messageTimestamp,
                from: "me",
                text: reply.trim(),
                convStart: false,
            })
            await sleep(1300);
        }
    }
}

async function callGpt(prompt, stopSequence) {
    console.log(`Making request to GPT with model ${model} and temp ${temp}`)
    const configuration = new Configuration({
        apiKey: process.env.OPENAI_API_KEY,
    });
    const openai = new OpenAIApi(configuration);
    let completionRequest = {
        // model: "curie:ft-personal-2023-04-20-20-43-28",
        // model: "curie:ft-personal-2023-04-21-02-30-57",
        model: model,
        prompt: prompt,
        temperature: temp,
        max_tokens: 100,
        frequency_penalty: frequency_penalty,
        presence_penalty: presence_penalty,
        stop: stopSequence,
    };

    try {
        const completion = await openai.createCompletion(completionRequest);
        let responseText = completion.data.choices[0].text;

        const promptTokenCount = tokenCounter(prompt);
        const responseTokenCount = tokenCounter(responseText);
        console.log(`Prompt token count: ${promptTokenCount} | price: $${promptTokenCount / 1000 * 0.0120}`)
        console.log(`Response token count: ${responseTokenCount} | price: $${responseTokenCount / 1000 * 0.0120}`)
        return responseText
    } catch (error) {
        if (error.response) {
            console.log(error.response.status);
            console.log(error.response.data);
        } else {
            console.log(error.message);
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

exports.handler = functions
    .region("europe-west1")
    .runWith({secrets: ["OPENAI_API_KEY", "TELEGRAM_BOT_TOKEN", "MODEL_NAME"]})
    .https.onRequest(app);