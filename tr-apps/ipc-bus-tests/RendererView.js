
function doNewHtmlView() {

    ipcBus.send("ipc-tests/new-htmlview-instance")
}

function doNewNodeInstance() {

    ipcBus.send("ipc-tests/new-node-instance")
}

function doRendererSubscribeToTopic() {
    console.log("doRendererSubscribeToTopic");
    doSubscribeToTopic("renderer");
}

function doMasterSubscribeToTopic() {
    console.log("doMasterSubscribeToTopic");
    doSubscribeToTopic("master");
}

function doSubscribeToTopic(processTarget) {
    var mainTopicElt = document.getElementById(processTarget + "Topic");

    var topicName = mainTopicElt.value;
    var topicItemElt = document.getElementById("topicNameItem_template");
    var topicItemElt = topicItemElt.cloneNode(true);
    topicItemElt.id = "";
    topicItemElt.setAttribute("topic-name", topicName);
    topicItemElt.setAttribute("topic-process", processTarget);

    var topicNameElt = topicItemElt.querySelector(".topicName");
    topicNameElt.textContent = topicName;

    var topicsListElt = document.getElementById(processTarget + "TopicsList");
    topicsListElt.appendChild(topicItemElt);
    topicItemElt.style.display = "block";

    if (processTarget == "renderer")
    {
        ipcBus.subscribe(topicName, onIPC_renderer);
    }
    if (processTarget == "master")
    {
        ipcBus.send("ipc-tests/subscribe-main-topic", topicName);
//        ipcRenderer.send("ipc-tests/ipc-master-subscribe", topicName);
    }
    console.log(processTarget + " topicName : " + topicName + " - subscribe");
}

function doUnsubscribeFromTopic(event){
    console.log("doUnsubscribeFromTopic:" + event);

    var target = event.target;
    var topicItemElt = target.parentElement;
    var topicName = topicItemElt.getAttribute("topic-name");
    var processTarget = topicItemElt.getAttribute("topic-process");
    var topicsListElt = document.getElementById(processTarget + "TopicsList");
    topicsListElt.removeChild(topicItemElt);

    if (processTarget == "renderer")
    {
        ipcBus.unsubscribe(topicName, onIPC_renderer);
    }
    if (processTarget == "master")
    {
        ipcBus.send("ipc-tests/unsubscribe-main-topic", topicName);
//        ipcRenderer.send("ipc-tests/ipc-master-unsubscribe", topicName);
    }
    console.log(processTarget + " topicName : " + topicName + " - unsubscribe");
}

function doSendMessageToTopic(event){
    console.log("doSendMessageToTopic:" + event);

    var target = event.target;
    var topicItemElt = target.parentElement;
    var topicName = topicItemElt.getAttribute("topic-name");
    var processTarget = topicItemElt.getAttribute("topic-process");

    if (processTarget == "renderer")
    {
        ipcBus.send(target.value);
    }
    if (processTarget == "master")
    {
        ipcBus.send("ipc-tests/ipc-master-send", { "topic" : topicName, "msg" : target.value});
//        ipcRenderer.send("ipc-tests/ipc-master-send", { "topic" : topicName, "msg" : target.value} );
    }
    console.log("topicName : " + topicName + " - send:" + target.value);
}

function doQueryBrokerState() {
    ipcBus.queryBrokerState();
}

function onIPC_BrokerStatusTopic(msgTopic, msgContent) {
    console.log("queryBrokerState - msgTopic:" + msgTopic + " msgContent:" + msgContent)

    var brokerStatesListElt = document.getElementById("brokerStatesList");
    while (brokerStatesListElt.rows.length > 1) {
        brokerStatesListElt.deleteRow(1);
    }   
    for(var i = 0; i < msgContent.length; ++i)
    {
        var row = brokerStatesListElt.insertRow(-1);
        var cell = row.insertCell(0);
        cell.innerHTML = msgContent[i]["topic"];

        var cell = row.insertCell(1);
        cell.innerHTML = msgContent[i]["connCount"];

        var cell = row.insertCell(2);
        cell.innerHTML = msgContent[i]["subCount"];
    }
}

function onIPC_renderer(msgTopic, msgContent) {
    console.log("renderer msgTopic:" + msgTopic + " msgContent:" + msgContent)
}

function onIPC_master(msgTopic, msgContent) {
    console.log("master msgTopic:" + msgTopic + " msgContent:" + msgContent)
}

//var ipcRenderer = require('electron').ipcRenderer;

ipcBus.subscribe('IPC_BUS_BROKER_STATUS_TOPIC', onIPC_BrokerStatusTopic);

ipcBus.subscribe("ipc-tests/main", onIPC_master);

//ipcBus.subscribe("ipc-tests/node-instance/created", function () {})

