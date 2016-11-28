//////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Electron Test App

"use strict";

console.log("Starting Node instance ...")

// Node
const util = require("util");
const path = require("path");
const child_process = require("child_process");
const Module = require("module")

// Override module loading
const originalResolveFilename = Module._resolveFilename
const newResolveFilename = function (request, parent, isMain) {

    switch (request) {
        case 'ipc-bus':
            return originalResolveFilename(path.join(path.dirname(process.argv0), "resources", "electron.asar", "common", "api", "ipc-bus.js"), parent, isMain)
        default:
            return originalResolveFilename(request, parent, isMain)
    }
}

Module._resolveFilename = newResolveFilename;

function onTopicMessage(topic, data) {
    console.log("topic:" + topic + " data:" + data);
    ipcBus.send("ipc-tests/node-received-topic", { "topic" : topic, "msg" : data});
}

function doSubscribeTopic(topic) {
    console.log("doSubscribeTopic:" + topic);
    ipcBus.subscribe(topic, onTopicMessage);
}

function doUnsubscribeTopic(topic) {
    console.log("doUnsubscribeMainTopic:" + topic);
    ipcBus.unsubscribe(topic, onTopicMessage);
}

function doSendOnTopic(args) {
    console.log("doSendOnTopic: topic:" + args["topic"] + " msg:" + args["msg"]);
    ipcBus.send(args["topic"], args["msg"]);
}


const ipcBus = require("ipc-bus")()

ipcBus.connect(function () {

    // Command hanlers
    ipcBus.subscribe("ipc-tests/node-subscribe-topic", (event, topic) => doSubscribeTopic(topic));
    ipcBus.subscribe("ipc-tests/node-unsubscribe-topic", (event, topic) => doUnsubscribeTopic(topic));
    ipcBus.subscribe("ipc-tests/node-send-topic", (event, args) => doSendMainOnTopic(args));
})