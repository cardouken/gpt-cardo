const functions = require("@google-cloud/functions-framework");
const app = require("./handler");

functions.http("handler", app);