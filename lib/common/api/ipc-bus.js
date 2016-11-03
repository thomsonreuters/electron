'use strict'

// Common modules
const os = require('os')
const path = require('path')
const util = require('util')
const EventEmitter = require('events').EventEmitter
const Module = require('module')

// Constants
const IPC_BUS_TOPIC_SUBSCRIBE = 'IPC_BUS_TOPIC_SUBSCRIBE'
const IPC_BUS_TOPIC_SEND = 'IPC_BUS_TOPIC_SEND'
const IPC_BUS_TOPIC_UNSUBSCRIBE = 'IPC_BUS_TOPIC_UNSUBSCRIBE'

const IPC_BUS_RENDERER_SUBSCRIBE = 'IPC_BUS_RENDERER_SUBSCRIBE'
const IPC_BUS_RENDERER_SEND = 'IPC_BUS_RENDERER_SEND'
const IPC_BUS_RENDERER_RECEIVE = 'IPC_BUS_RENDERER_RECEIVE'
const IPC_BUS_RENDERER_UNSUBSCRIBE = 'IPC_BUS_RENDERER_UNSUBSCRIBE'

// Implementation helpers
function _subscribeTopic(processType, ipcbus, ipcObj, topic, handler) {

    EventEmitter.prototype.addListener.call(ipcbus, topic, handler)
    
    if (processType !== undefined && processType === 'renderer') {
        // In the renderer, we have to let the bridge subscribe for us
        ipcObj.send(IPC_BUS_RENDERER_SUBSCRIBE, topic)
    } else {
        // In the main/Node instance, we send the subscribe to the broker
        ipcbus.send(IPC_BUS_TOPIC_SUBSCRIBE, topic)
    }

    console.log("[IPCBus:Client] Subscribed to '" + topic + "'")
}

function _unsubscribeTopic(processType, ipcbus, ipcObj, topic, handler) {

    EventEmitter.prototype.removeListener.call(processType, ipcObj, topic, handler)
    
    if (processType !== undefined && processType === 'renderer') {
        // In the renderer, we have to let the bridge unsubscribe for us
        ipcObj.send(IPC_BUS_RENDERER_UNSUBSCRIBE, topic)
    } else {
        // In the main/Node instance, we send the unsubscribe to the broker
        ipcbus.send(IPC_BUS_TOPIC_UNSUBSCRIBE, topic)
    }

    console.log("[IPCBus:Client] Unsubscribed from '" + topic + "'")
}

function _sendSubscribedData(data, connections) {

    connections.forEach(function(conn) {
        conn.write(data)
        console.log("[IPCBus:Broker] Forward '" + JSON.stringify(data) + "' on '" + data.target + "' to #" + conn.id)
    });
}

function _require(modulePath) {

    return require(modulePath)
}

function _brokerListeningProc(ipcbus, baseIpc, busPath, server) {

    console.log("[IPCBus:Broker] Listening for incoming connections on '" + busPath + "' ...")
    
    baseIpc.on('connection', function (conn, server) {

        console.log("[IPCBus:Broker] Incoming connection !")

        ipcbus._connReferences.set(conn, 0)
    })

    baseIpc.on('data', function (data, conn, server) {

        switch (data.target) {
            case IPC_BUS_TOPIC_SUBSCRIBE:
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
                
            case IPC_BUS_TOPIC_UNSUBSCRIBE:
                break

            default:
                console.log("[IPCBus:Broker] Incoming data on '" + data.target + "' !")
                if (ipcbus._subscriptions.has(data.target) === true) {
                    // Send data to subscribed connections
                    _sendSubscribedData(data, ipcbus._subscriptions.get(data.target));
                } else {
                    console.log("[IPCBus:Broker] No subscription on '" + data.target + "' !")
                }
                break
        }
    })
}

function _clientConnectProc(ipcbus, busPath, conn, callback) {

    console.log("[IPCBus:Client] Connected to broker on '" + busPath + "'")

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

function _startRendererBridge(ipcbus, ipcMain) {
    
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

            event.sender.send(IPC_BUS_RENDERER_MESSAGE, topic, data)
        })
    })

    console.log("[IPCBus:Bridge] Installed")
}

function _sendViaConnection(conn, topic, data) {

    conn.write({ target: topic, content: data})
}

function _overrideModuleResolveFilename() {

    const originalResolveFilename = Module._resolveFilename
    const newResolveFilename = function (request, parent, isMain) {

        switch (request) {
            case 'easy-ipc':
                return originalResolveFilename(path.join(path.dirname(process.argv0), "resources", "electron.asar", "3rdparty", "easy-ipc", "lib", "ipc.js"), parent, isMain)
            case 'lazy':
                return originalResolveFilename(path.join(path.dirname(process.argv0), "resources", "electron.asar", "3rdparty", "lazy", "lazy.js"), parent, isMain)
            default:
                return originalResolveFilename(request, parent, isMain)
        }
    }

    Module._resolveFilename = newResolveFilename
}

function _getCmdLineArgValue(argName) {
    
    for(let i = 0; i < process.argv.length; i++) {
            
        if(process.argv[i].startsWith("--" + argName))
        {
            const argValue = process.argv[i].split("=")[1];
            return argValue;
        }
    }
    return null;
}

// Implementation for Renderer process
function IpcBusRenderer(ipcObj) {

    EventEmitter.call(this)

    if(ipcObj === undefined || ipcObj === null) {

        ipcObj = _require('electron').ipcRenderer
    }

    this.send = function(topic, data) {

        // Send over Electron IPC (and bridge)
        ipcObj.send(IPC_BUS_RENDERER_SEND, topic, data)
    }

    this.subscribe = function(topic, handler) {

        _subscribeTopic('renderer', this, ipcObj, topic, handler)
    }

    this.unsubscribe = function(topic, handler) {

        _unsubscribeTopic('renderer', this, ipcObj, topic, handler)
    }
}

util.inherits(IpcBusRenderer, EventEmitter)

// Implementation for Browser (Main) process
function IpcBusBrowser(ipcObj, busPath) {
    
    EventEmitter.call(this)
    
    if(ipcObj === undefined || busPath === null) {

        ipcObj = _require('electron').ipcMain
    }

    if(busPath === undefined || busPath === null) {

        busPath = _getCmdLineArgValue('bus-path')
    }

    // Setup
    const self = this
    const baseIpc = new require('easy-ipc')()
    let busConn = null

    // Set API
    this.connect = function(callback) {
        baseIpc.on('connect', function(conn) {

            busConn = conn                
            _clientConnectProc(self, busPath, conn, callback)
            _startRendererBridge(self, ipcObj)
        })
        baseIpc.connect(busPath)
    }

    this.send = function(topic, data) {
        
        _sendViaConnection(busConn, topic, data)
    }

    this.subscribe = function(topic, handler) {

        _subscribeTopic('browser', this, ipcObj, topic, handler)
    }

    this.unsubscribe = function(topic, handler) {

        _unsubscribeTopic('browser', this, ipcObj, topic, handler)
    }
}

util.inherits(IpcBusBrowser, EventEmitter)

// Implementation for Node instance
function IpcBusClient(busPath) {
    
    EventEmitter.call(this)

    _overrideModuleResolveFilename()

     // Setup
    const self = this
    if(busPath === undefined || busPath === null) {

        busPath = _getCmdLineArgValue('bus-path')
    }
    const baseIpc = new require('easy-ipc')()
    let busConn = null

    // Set API
    this.connect = function(callback) {
        baseIpc.on('connect', function(conn) {

            busConn = conn                
            _clientConnectProc(self, busPath, conn, callback)
        })
        baseIpc.connect(busPath)
    }
    
    this.send = function(topic, data) {
        
        _sendViaConnection(busConn, topic, data)
    }

    this.subscribe = function(topic, handler) {

        _subscribeTopic('client', this, null, topic, handler)
    }

    this.unsubscribe = function(topic, handler) {

        _unsubscribeTopic('client', this, null, topic, handler)
    }
}

util.inherits(IpcBusClient, EventEmitter)

// Implementation for Broker instance
function IpcBusBroker(busPath) {
    
    EventEmitter.call(this)

    _overrideModuleResolveFilename()

    if(busPath === undefined || busPath === null) {

        busPath = _getCmdLineArgValue('bus-path')
    }
    const baseIpc = new require('easy-ipc')()
    const self = this

    this._subscriptions = new Map()
    this._connReferences = new Map()

    // Set API
    this.start = function() {

        baseIpc.on('listening', (server) => _brokerListeningProc(self, baseIpc, busPath, server))
        baseIpc.listen(busPath)
    }
}

// Export instance depending current process type
module.exports = function(processType, busPath, ipcObj) {
  switch(processType) {
      case 'renderer':
        return new IpcBusRenderer(ipcObj)

      case 'browser':
        return new IpcBusBrowser(ipcObj, busPath)

      case 'broker':
        return new IpcBusBroker(busPath)

      default:
        return new IpcBusClient(busPath)
  }
}