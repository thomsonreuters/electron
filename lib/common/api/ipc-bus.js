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

const IPC_BUS_RENDERER_SUBSCRIBE = 'IPC_BUS_RENDERER_SUBSCRIBE'
const IPC_BUS_RENDERER_SEND = 'IPC_BUS_RENDERER_SEND'
const IPC_BUS_RENDERER_RECEIVE = 'IPC_BUS_RENDERER_RECEIVE'
const IPC_BUS_RENDERER_UNSUBSCRIBE = 'IPC_BUS_RENDERER_UNSUBSCRIBE'

// Helpers

function _subscribeTopic(ipcbus, topic, handler) {

    EventEmitter.prototype.addListener.call(ipcbus, topic, handler)
    
    if (process.type !== undefined && process.type === 'renderer') {
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
    
    if (process.type !== undefined && process.type === 'renderer') {
        // In the renderer, we have to let the bridge unsubscribe for us
        ipcbus._ipcRenderer.send("IPC_BUS_RENDERER_UNSUBSCRIBE", topic)
    } else {
        // In the main/Node instance, we send the unsubscribe to the broker
        ipcbus.send(TR_IPC_TOPIC_UNSUBSCRIBE, topic)
    }

    console.log("[IPCBus:Client] Unsubscribed from '" + topic + "'")
}

function _sendSubscribedData(data, connections) {

    connections.forEach(function(conn) {
        conn.write(data)
        console.log("[IPCBus:Broker] Forward '" + JSON.stringify(data) + "' on '" + data.target + "' to #" + conn.id)
    });
}

function _brokerListeningProc(ipcbus, brokerPath, server, callback) {

    console.log("[IPCBus:Broker] Listening for incoming connections on '" + brokerPath + "' ...")
    
    ipcbus._baseIpc.on('connection', function (conn, server) {

        console.log("[IPCBus:Broker] Incoming connection !")

        ipcbus._connReferences.set(conn, 0)
    })

    ipcbus._baseIpc.on('data', function (data, conn, server) {

        switch (data.target) {
            case TR_IPC_TOPIC_SUBSCRIBE:
                if (ipcbus._subscriptions.has(data.content) === false) {
                    // This topic has NOT been subscribed yet, add it to the map
                    ipcbus._subscriptions.set(data.content, [])
                    console.log("[IPCBus:Broker] Added subscription to '" + data.content + "'")
                }
                if (ipcbus._subscriptions.get(data.content).indexOf(conn) == -1) {
                    // This topic has NOT been already subcribed by this connection
                    ipcbus._subscriptions.get(data.content).push(conn)
                }
                ipcbus._connReferences.set(conn, ipcbus._connReferences.get(conn) + 1)
                console.log("[IPCBus:Broker] Client #" + conn.id + " subscribed to '" + data.content + "'")
                break

            default:
                console.log("[IPCBus:Broker] Incoming data on '" + data.target + "' !")
                if (ipcbus._subscriptions.has(data.target) === true) {
                    // Send data to subscribed connections
                    _sendSubscribedData(data, ipcbus._subscriptions.get(data.target));
                } else {
                    console.log("[IPCBus:Broker] No subscription on '" + data.target + "' !")
                }
                break;
        }
    })
}

function _clientConnectProc(ipcbus, brokerPath, conn, callback) {

    console.log("[IPCBus:Client] Connected to broker on '" + brokerPath + "'")

    ipcbus._connection = conn

    callback('connect', ipcbus._connection)

    ipcbus._connection.on('data', function (buffer) {

        const chunks = buffer.toString().split('\n')

        chunks.forEach(function (chunk) {

            if (chunk.length > 0) {
                const data = JSON.parse(chunk)
                console.log("[IPCBus:Client] Received data on '" + data.target + "' (" + ipcbus.listenerCount(data.target) + " listeners)")
                ipcbus.emit(data.target, data.content)
            }
        })
    })
}

function _startRendererBridge(ipcbus) {
    
    ipcMain.addListener(IPC_BUS_RENDERER_SUBSCRIBE, function (event, topic) {

        console.log("[IPCBus] Renderer ID=" + event.sender.id + " susbcribed to '" + topic + "'")

        ipcbus.subscribe(topic, function(data) {
            
            console.log("[IPCBus] Forward message received on '" + topic + "' to renderer")

            event.sender.send(IPC_BUS_RENDERER_RECEIVE, topic, data)
        }) 
    })

    ipcMain.addListener(IPC_BUS_RENDERER_SEND, function (event, topic, data) { 

        console.log("[IPCBus] Received message on '" + topic + "' from renderer")

        ipcbus.send(topic, data)
    })

    ipcMain.addListener(IPC_BUS_RENDERER_UNSUBSCRIBE, function (event, topic) {

        console.log("[IPCBus] Renderer ID=" + event.sender.id + " unsusbcribed from '" + topic + "'")


        ipcbus.unsubscribe(topic, function (data) {

            console.log("[IPCBus] Forward message received on '" + topic + "' to renderer")

            event.sender.send("IPC_BUS_RENDERER_MESSAGE", topic, data)
        })
    })

    console.log("[IPCBus:Bridge] Installed")
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

        if (process.type !== undefined && process.type === 'renderer') {
            // Send over Electron IPC (and bridge)
            this._ipcRenderer.send("IPC_BUS_RENDERER_SEND", topic, data)
        } else {
            // Send over base IPC
            this._connection.write({ target: topic, content: data})
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

        this._ipcMain.removeListener("IPC_BUS_RENDERER_SUBSCRIBE")
        this._ipcMain.removeListener("IPC_BUS_RENDERER_SEND")
        this._ipcMain.removeListener("IPC_BUS_RENDERER_UNSUBSCRIBE")

        this._rendererListeners = null
    }

    IpcBus.prototype.startBroker = function (brokerPath, callback) {

    this._baseIpc = new BaseIpc()

        const self = this

    this._subscriptions = new Map()
    this._connReferences = new Map()

    this._baseIpc.on('listening', (server) => _brokerListeningProc(self, brokerPath, server, callback))

        this._baseIpc.listen(brokerPath)
    }

    IpcBus.prototype.stopBroker = function () {

    }

    IpcBus.prototype.startClient = function (brokerPath, callback) {

    const self = this

    if (process.type === 'renderer') {

        this._ipcRenderer.on(IPC_BUS_RENDERER_RECEIVE, function (event, topic, data) {

            console.log("[IPC:Client] Received message on '" + topic + "'")

            self.emit(topic, data)
        })
    } else {

        this._baseIpc = new BaseIpc()
        this._baseIpc.on('connect', function(conn) {
                    
            _clientConnectProc(self, brokerPath, conn, callback)

            if (process.type !== undefined && process.type === "browser") {

                _startRendererBridge(self)
            }
        })
        this._baseIpc.connect(brokerPath)
    }
}

    IpcBus.prototype.stopClient = function () {

    }
}

util.inherits(IpcBus, EventEmitter)

module.exports = IpcBus