'use strict'

// Common modules
const os = require('os')
const path = require('path')
const util = require('util')
const EventEmitter = require('events').EventEmitter

// Browser/Node instance related modules
const ipcMain = process.type === 'browser' ? require('electron').ipcMain : null
const baseIpc = process.type === 'browser' ? require('easy-ipc') : null

// Renderer related modules
const ipcRenderer = process.type === 'renderer' ? require('electron').ipcRenderer : null

// Helpers

function _subscribeTopic(ipcbus, topic, handler) {

    EventEmitter.prototype.addListener.call(ipcbus, topic, handler)

    // In the renderer, we have to let the bridge subscribe for us
    if (process.type === 'renderer') {
        ipcRenderer.send("IPC_BUS_RENDERER_SUBSCRIBE", topic)
    }

    console.log("[IPCBus] Subscribed to '" + topic + "'")
}

function _unsubscribeTopic(ipcbus, topic, handler) {

    EventEmitter.prototype.removeListener.call(ipcbus, topic, handler)

    // In the renderer, we have to let the bridge unsubscribe for us
    if (process.type === 'renderer') {
        ipcRenderer.send("IPC_BUS_RENDERER_UNSUBSCRIBE", topic)
    }

    console.log("[IPCBus] Unsubscribed from '" + topic + "'")
}

// IPC bus API
function IpcBus() {

    EventEmitter.call(this)

    if (process.type === 'browser') {
        // Setup IPC in Browser/Node instance
    }
}

IpcBus.prototype.on = function (topic, handler) {

    _subscribeTopic(this, topic, handler)
}

IpcBus.prototype.subscribe = function (topic, handler) {

    _subscribeTopic(this, topic, handler)
}

IpcBus.prototype.send = function (topic, data) {

    if (process.type === 'browser') {
        // Send over base IPC
    } else {
        // Send over Electron IPC (and bridge)
        ipcRenderer.send("IPC_BUS_RENDERER_SEND", topic, data)
    }
}

IpcBus.prototype.unsubscribe = function (topic, handler) {

    _unsubscribeTopic(this, topic, handler)
}

IpcBus.prototype.startRendererBridge = function () {
    
    const self = this;

    ipcMain.addListener("IPC_BUS_RENDERER_SUBSCRIBE", function (event, topic) {

        console.log("[IPCBus] Renderer ID=" + event.sender.id + " susbcribed to '" + topic + "'")

        self.subscribe(topic, function(data) {
            
            console.log("[IPCBus] Forward message received on '" + topic + "' to renderer")

            event.sender.send("IPC_BUS_RENDERER_MESSAGE", topic, data)
        }) 
    })

    ipcMain.addListener("IPC_BUS_RENDERER_SEND", function (event, topic, data) { 

        console.log("[IPCBus] Received Send from renderer")
    })

    ipcMain.addListener("IPC_BUS_RENDERER_UNSUBSCRIBE", function (event, topic) {

        console.log("[IPCBus] Renderer ID=" + event.sender.id + " unsusbcribed from '" + topic + "'")


        self.unsubscribe(topic, function (data) {

            console.log("[IPCBus] Forward message received on '" + topic + "' to renderer")

            event.sender.send("IPC_BUS_RENDERER_MESSAGE", topic, data)
        })
    })

}

IpcBus.prototype.stopRendererBridge = function () {

    ipcMain.removeListener("IPC_BUS_RENDERER_SUBSCRIBE")
    ipcMain.removeListener("IPC_BUS_RENDERER_SEND")
    ipcMain.removeListener("IPC_BUS_RENDERER_UNSUBSCRIBE")

    this._rendererListeners = null

}

IpcBus.prototype.startBroker = function (brokerPath) {

}

IpcBus.prototype.stopBroker = function () {

}

util.inherits(IpcBus, EventEmitter)

module.exports = new IpcBus()
