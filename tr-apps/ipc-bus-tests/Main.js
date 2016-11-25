//////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Electron Test App

"use strict";

// Node
const util = require("util");
const path = require("path");
const child_process = require("child_process");

// Electron 
const electronApp = require("electron").app;
const ipcMain = require("electron").ipcMain;
const BrowserWindow = require("electron").BrowserWindow;

// Debug rules
electronApp.commandLine.appendSwitch('remote-debugging-port', '55555');
electronApp.commandLine.appendSwitch('host-rules', 'MAP * 127.0.0.1');

// Misc
const uuid = require("uuid");
const busPath = '/tr-ipc-bus/' + uuid.v4();
console.log("IPC Bus Path : " + busPath);

// IPC Bus
const ipcBus = require("ipc-bus")("browser", busPath, ipcMain);

// Helpers

function getCmdLineArgValue(argName) {
    
    for(let i = 0; i < process.argv.length; i++) {
            
        if(process.argv[i].startsWith("--" + argName))
        {
            const argValue = process.argv[i].split("=")[1];
            return argValue;
        }
    }
    return null;
}

function startNodeInstance(scriptPath) {

    const args = [ path.join(__dirname, scriptPath), '--parent-pid=' + process.pid, '--bus-path=' + busPath]

    let options = { env: {} };
    for (let key of Object.keys(process.env)) {
        options.env[key] = process.env[key];
    }

    options.env['ELECTRON_RUN_AS_NODE'] = '1';
    options.stdio = ['pipe', 'pipe', 'pipe', 'ipc'];
    return child_process.spawn(process.argv[0], args, options);
}

// Classes

const nodeInstances = []

function NodeInstance() {

    this.process = startNodeInstance("NodeInstance.js");
    this.process.stdout.addListener("data", data => { console.log('<NODE> ' + data.toString()); });
    this.process.stderr.addListener("data", data => { console.log('<NODE> ' + data.toString()); });
    console.log("<MAIN> Node instance #" + this.process.pid + " started !")

    this.window = new BrowserWindow({ width: 800, height: 600, webPreferences: { sandbox: true }, instancePid: this.process.pid })
    this.window.loadURL("file://" + __dirname + "/NodeInstanceView.html");

    nodeInstances.push(this);

    this.term = function() {

        this.process.kill();
        this.window.close();
    }
}

// Commands

function doNewNodeInstance() {

    console.log("<MAIN> Starting new Node instance ...")
    const instance = new NodeInstance();
}

function doTermInstance(pid) {

    console.log("<MAIN> Killing instance #" + pid + " ...");
    const nodeInstance = nodeInstances.find((e) => e.process.pid == pid);
    const instanceIdx = nodeInstances.indexOf(nodeInstance);
    nodeInstances.splice(instanceIdx, 1);
    nodeInstance.term();
}

function onMainTopicMessage(topic, data) {
    console.log("topic:" + topic + " data:" + data);
}

function doSubscribeMainTopic(topic) {
    console.log("doSubscribeMainTopic:" + topic);
    ipcBus.subscribe(topic, onMainTopicMessage);
}

function doUnsubscribeMainTopic(topic) {
    console.log("doUnsubscribeMainTopic:" + topic);
    ipcBus.unsubscribe(topic, onMainTopicMessage);
}
function doSendMainTopic(args) {
    console.log("doSendMainTopic: topic:" + args["topic"] + " msg:" + args["msg"]);
    ipcBus.send(args["topic"], args["msg"]);
}


function doNewHtmlViewInstance() {
    var childWindow = new BrowserWindow({ width: 800, height: 600, webPreferences: { sandbox: true } })
    childWindow.loadURL("file://" + path.join(__dirname, "HtmlView.html"));
}

// Startup

let ipcBrokerInstance = null

electronApp.on("ready", function () {

    ipcMain.on("ipc-tests/ipc-master-unsubscribe", (event, topic) => doUnsubscribeMainTopic(topic));
    ipcMain.on("ipc-tests/ipc-master-subscribe", (event, topic) => doSubscribeMainTopic(topic));
    ipcMain.on("ipc-tests/ipc-master-send", (event, args) => doSendMainTopic(args));

    // Setup IPC Broker
    console.log("<MAIN> Starting IPC broker ...");
    ipcBrokerInstance = startNodeInstance("BrokerNodeInstance.js");
    ipcBrokerInstance.on("message", function (msg) {

        console.log("<MAIN> IPC broker is ready !");
        // Setup IPC Client (and renderer bridge)
        ipcBus.connect(function () {

            // Command hanlers
            ipcBus.subscribe("ipc-tests/new-node-instance", () => doNewNodeInstance());
            ipcBus.subscribe("ipc-tests/new-htmlview-instance", (event, pid) => doNewHtmlViewInstance());
            ipcBus.subscribe("ipc-tests/kill-node-instance", (event, pid) => doKillNodeInstance(pid));
            ipcBus.subscribe("ipc-tests/subscribe-main-topic", (event, topic) => doSubscribeMainTopic(topic));
            ipcBus.subscribe("ipc-tests/unsubscribe-main-topic", (event, topic) => doUnsubscribeMainTopic(topic));
            ipcBus.subscribe("ipc-tests/ipc-master-send", (event, args) => doSendMainTopic(args));

            setInterval(function()
            {
                ipcBus.send("ipc-tests/main", "Master is here");
            }, 300);

            // Open main window
            const mainWindow = new BrowserWindow({ width: 800, height: 600, webPreferences: { sandbox: true } })
            mainWindow.loadURL("file://" + path.join(__dirname, "RendererView.html"));
        })
    })
    ipcBrokerInstance.stdout.addListener("data", data => { console.log('<BROKER> ' + data.toString()); });
    ipcBrokerInstance.stderr.addListener("data", data => { console.log('<BROKER> ' + data.toString()); });
});

