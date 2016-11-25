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

const ipcBus = require("ipc-bus")()

function doSubscribeTopic(data) {

    ipcBus.subscribe(data.topic)
}

ipcBus.connect(function() {

    ipcBus.subscribe("ipc-tests/node-instance/" + process.pid + "/subscribe-topic", function(data) {

        ipcBus.subscribe(data.topic)
    })
})