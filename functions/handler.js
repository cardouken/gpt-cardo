const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const {Timestamp} = require('firebase-admin/firestore');
const tokenCounter = require('openai-gpt-token-counter')
const {Configuration, OpenAIApi} = require("openai");
const {sendTelegramMessage} = require("./sendTelegramMessage");

const CONSTANTS = {
    meToken: "Me:",
    theyToken: "They:",
    stopSequence: "<END>",
    newConversationRequested: 'newConversationRequested',
    convStart: 'convStart',
    from: 'from',
    promptMaxChar: 1800,
    newConvoElapsedTime: 3600
};

admin.initializeApp();
const app = express();

app.post("/telegram", async (req, res) => {
    const db = admin.firestore();
    if (
        req.body &&
        req.body.message &&
        req.body.message.from &&
        req.body.message.from.id
    ) {
        const message = req.body.message
        const userId = message.from.id;
        const personName = message.from.first_name
        if (!message.text) {
            res.sendStatus(200);
            return;
        }
        const text = message.text;
        const personRef = db.collection("people").doc(`${userId}`);
        let personSnap = await personRef.get();

        if (!personSnap.exists) {
            await personRef.set({
                name: personName,
                newConversationRequested: true,
            })
        }

        switch (text.toLowerCase()) {
            case "/reset":
                await handleResetCase(text, personRef, message, userId);
                break;
            default:
                await handleDefaultCase(personRef, message, userId, personSnap, text);
                break;
        }
        res.sendStatus(200);
    } else if (req.body && req.body.edited_message) {
        try {
            await handleEditedMessage(req, res, db);
        } catch (error) {
            functions.logger.log(error);
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

async function handleResetCase(personRef, message, userId) {
    await personRef.update({
        newConversationRequested: true
    });
    await sendTelegramMessage("Conversation history has been reset", userId, message?.message_id);

}

async function handleDefaultCase(personRef, message, userId, personSnap, text) {
    const messageTimestamp = new Timestamp(parseInt(message.date), 0);
    const messagesRef = personRef.collection("messages");
    const latestSnap = await messagesRef.where(CONSTANTS.from, "==", "me").orderBy("timestamp", "desc").limit(1).get();
    const newConversationRequested = personSnap.get(CONSTANTS.newConversationRequested);
    let convStart
    if (!latestSnap.empty) {
        convStart = newConversationRequested || (messageTimestamp.seconds - latestSnap.docs[0].get("timestamp").seconds) > CONSTANTS.newConvoElapsedTime;
    } else {
        convStart = newConversationRequested;
    }
    await messagesRef.doc(`${message.message_id}`).set({
        timestamp: messageTimestamp,
        from: "them",
        text: text,
        convStart: convStart,
    });

    await personRef.update({
        newConversationRequested: false
    });
    await sleep(3000)
    const latestConvStartSnap = await messagesRef.where(CONSTANTS.convStart, "==", true).orderBy("timestamp", "desc").limit(1).get();
    if (latestConvStartSnap.empty) {
        console.log("No conversation start found");
        return;
    }
    const convoStartTime = await latestConvStartSnap.docs[0].get("timestamp");

    const convoQuerySnap = await messagesRef.where("timestamp", ">=", convoStartTime).orderBy("timestamp").get();
    let prompt = "";
    convoQuerySnap.forEach(doc => {
        const message = doc.data();
        const prefix = message.from === "me" ? CONSTANTS.meToken : CONSTANTS.theyToken
        prompt += `${prefix}${message.text}\n`
    })
    prompt += `${CONSTANTS.meToken}`;

    prompt = truncatePrompt(prompt);
    const gptResponse = await callGpt(prompt, CONSTANTS.stopSequence);
    await handleResponse(gptResponse, messagesRef, userId);

}

async function handleEditedMessage(req, res, db) {
    const editedMessage = req.body.edited_message;
    const userId = editedMessage.from.id;
    const updateMessageRef = db.collection("people").doc(`${userId}`).collection("messages").doc(`${editedMessage.message_id}`);
    await updateMessageRef.update({
        text: editedMessage.text
    });

}

function truncatePrompt(prompt) {
    let truncatedPrompt = prompt;
    if (truncatedPrompt.length > CONSTANTS.promptMaxChar) {
        truncatedPrompt = truncatedPrompt.slice(-CONSTANTS.promptMaxChar);
    }
    const indexOfFirstMeToken = truncatedPrompt.indexOf(CONSTANTS.meToken);
    const indexOfFirstTheyToken = truncatedPrompt.indexOf(CONSTANTS.theyToken);
    const newStartIndex = Math.min(indexOfFirstMeToken, indexOfFirstTheyToken);
    return truncatedPrompt.slice(newStartIndex);
}

async function handleResponse(gptResponse, messagesRef, number) {
    if (!!gptResponse) {
        let truncatedResponse = gptResponse.split(CONSTANTS.theyToken)[0];
        let replies = truncatedResponse.split(`${CONSTANTS.meToken}`);
        console.log(replies);
        let reply;
        for (reply of replies) {
            const res = await sendTelegramMessage(reply, number);
            const messageTimestamp = new Timestamp(parseInt(res.data.result.date), 0);
            const messageId = res.data.result.message_id;
            await messagesRef.doc(`${messageId}`).set({
                timestamp: messageTimestamp,
                from: "me",
                text: reply.trim(),
                convStart: false,
            })
            await sleep(1750);
        }
    }
}

async function callGpt(prompt, stopSequence) {
    console.log("Making request to GPT")
    const configuration = new Configuration({
        apiKey: process.env.OPENAI_API_KEY,
    });
    const openai = new OpenAIApi(configuration);
    let completionRequest = {
        model: "curie:ft-personal-2023-04-21-02-30-57",
        prompt: prompt,
        temperature: 0.5,
        max_tokens: 100,
        frequency_penalty: 0.8,
        presence_penalty: 0.8,
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
