'use strict'

// Common modules
const os = require('os')
const path = require('path')
const util = require('util')
const EventEmitter = require('events').EventEmitter

// Browser/Node instance related modules
const BaseIpc = process.type === 'browser' ? require('easy-ipc') : null

// Constants
const TR_IPC_TOPIC_SUBSCRIBE = 'tr/ipc/subscribe'
const TR_IPC_TOPIC_SEND = 'tr/ipc/send'
const TR_IPC_TOPIC_UNSUBSCRIBE = 'tr/ipc/unsubscribe'

module.exports = IpcBus

// Helpers

function _subscribeTopic(ipcbus, topic, handler) {

    EventEmitter.prototype.addListener.call(ipcbus, topic, handler)
    
    if (process.type === 'renderer') {
        // In the renderer, we have to let the bridge subscribe for us
        ipcbus._ipcRenderer.send("IPC_BUS_RENDERER_SUBSCRIBE", topic)
    } else {
        // In the main/Node instance, we send the subscribe to the broker
        ipcbus.send(TR_IPC_TOPIC_SUBSCRIBE, topic)
    }

    console.log("[IPCBus:Client] Subscribed to '" + topic + "'")
}

function _unsubscribeTopic(ipcbus, topic, handler) {

    EventEmitter.prototype.removeListener.call(ipcbus, topic, handler)
    
    if (process.type === 'renderer') {
        // In the renderer, we have to let the bridge unsubscribe for us
        ipcbus._ipcRenderer.send("IPC_BUS_RENDERER_UNSUBSCRIBE", topic)
    } else {
        // In the main/Node instance, we send the unsubscribe to the broker
        ipcbus.send(TR_IPC_TOPIC_UNSUBSCRIBE, topic)
    }

    console.log("[IPCBus:Client] Unsubscribed from '" + topic + "'")
}

function _brokerListeningProc(ipcbus, server, callback) {

    console.log("[IPCBus:Broker] Listening for incoming connections ...")
    
    ipcbus._baseIpc.on('connection', function (conn, server) {

        console.log("[IPCBus:Broker] Incoming connection !")
    })

    ipcbus._baseIpc.on('data', function (data, conn, server) {

        console.log("[IPCBus:Broker] Incoming data !")

        switch (data.target) {
            case TR_IPC_TOPIC_SUBSCRIBE:
                console.log("[IPCBus:Broker] Client subscribed to '" + data.content + "'")
                break;
        }
    })
}

function _clientConnectProc(ipcbus, conn, callback) {

    console.log("[IPCBus:Client] Connected to broker")

    ipcbus._connection = conn;

    callback('connect')
}

// IPC bus API

function IpcBus(ipcProcess, processType) {
    //if (!(this instanceof IpcBus)) return new IpcBus(ipcProcess, processType);

    EventEmitter.call(this)

    this._baseIpc = null
    this._ipcRenderer = processType === 'renderer' ? ipcProcess : null
    this._ipcMain = processType === 'browser' ? ipcProcess : null

    IpcBus.prototype.on = function (topic, handler) {

        _subscribeTopic(this, topic, handler)
    }

    IpcBus.prototype.subscribe = function (topic, handler) {

        _subscribeTopic(this, topic, handler)
    }

    IpcBus.prototype.send = function (topic, data) {

        if (process.type === 'browser') {
            // Send over base IPC
            this._connection.write({ target: topic, content: data})
        } else {
            // Send over Electron IPC (and bridge)
            this._ipcRenderer.send("IPC_BUS_RENDERER_SEND", topic, data)
        }
    }

    IpcBus.prototype.unsubscribe = function (topic, handler) {

        _unsubscribeTopic(this, topic, handler)
    }

    IpcBus.prototype.startRendererBridge = function () {
    
        const self = this;

        self._ipcMain.addListener("IPC_BUS_RENDERER_SUBSCRIBE", function (event, topic) {

            console.log("[IPCBus] Renderer ID=" + event.sender.id + " susbcribed to '" + topic + "'")

            self.subscribe(topic, function(data) {
                
                console.log("[IPCBus] Forward message received on '" + topic + "' to renderer")

                event.sender.send("IPC_BUS_RENDERER_MESSAGE", topic, data)
            }) 
        })

        self._ipcMain.addListener("IPC_BUS_RENDERER_SEND", function (event, topic, data) { 

            console.log("[IPCBus] Received Send from renderer")
        })

        self._ipcMain.addListener("IPC_BUS_RENDERER_UNSUBSCRIBE", function (event, topic) {

            console.log("[IPCBus] Renderer ID=" + event.sender.id + " unsusbcribed from '" + topic + "'")


            self.unsubscribe(topic, function (data) {

                console.log("[IPCBus] Forward message received on '" + topic + "' to renderer")

                event.sender.send("IPC_BUS_RENDERER_MESSAGE", topic, data)
            })
        })

    }

    IpcBus.prototype.stopRendererBridge = function () {

        self._ipcMain.removeListener("IPC_BUS_RENDERER_SUBSCRIBE")
        self._ipcMain.removeListener("IPC_BUS_RENDERER_SEND")
        self._ipcMain.removeListener("IPC_BUS_RENDERER_UNSUBSCRIBE")

        this._rendererListeners = null
    }

    IpcBus.prototype.startBroker = function (brokerPath, callback) {

        this._baseIpc = new BaseIpc() //({ socketPath: brokerPath })

        const self = this

        this._subscriptions = new Map()

        this._baseIpc.on('listening', (server) => _brokerListeningProc(self, server, callback))

        this._baseIpc.listen(brokerPath)
    }

    IpcBus.prototype.stopBroker = function () {

    }

    IpcBus.prototype.startClient = function (brokerPath, callback) {

        this._baseIpc = new BaseIpc() //{ socketPath: brokerPath })

        const self = this

        this._baseIpc.on('connect', (conn) => _clientConnectProc(self, conn, callback))

        this._baseIpc.connect(brokerPath)
    }

    IpcBus.prototype.stopClient = function () {

    }
}

util.inherits(IpcBus, EventEmitter)