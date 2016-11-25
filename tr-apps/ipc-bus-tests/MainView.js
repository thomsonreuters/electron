function doNewHtmlView() {

    ipcBus.send("ipc-tests/new-htmlview-instance")
}

function doNewNodeInstance() {

    ipcBus.send("ipc-tests/new-node-instance")
}

function doSubscribeToTopic() {
    console.log("doSubscribeToTopic");

    var mainTopicElt = document.getElementById("mainTopic");

    var topicName = mainTopicElt.value;
    var topicTemplateElt = document.getElementById("topicNameItem_template");
    var topicElt = topicTemplateElt.cloneNode(true);
    topicElt.id = "";
    topicElt.setAttribute("topic-name", topicName);

    var topicNameElt = topicElt.querySelector(".topicName");
    topicNameElt.textContent = topicName;

    var mainTopicsListElt = document.getElementById("mainTopicsList");
    mainTopicsListElt.appendChild(topicElt);
    topicElt.style.display = "block";

    ipcBus.subscribe(topicName, function(msgTopic, msgContent) {});
    ipcBus.send("ipc-tests/subscribe-main-topic", topicName);
    console.log("topicName : " + topicName + " - subscribe");
}

function doSendMessageToTopic(event){
    console.log("doSendMessageToTopic:" + event);

    var target = event.target;
    var topicTemplateElt = target.parentElement;
    var topicName = topicTemplateElt.getAttribute("topic-name");

    ipcBus.send(target.value);
    console.log("topicName : " + topicName + " - send:" + target.value);
}

function doUnsubscribeFromTopic(event){
    console.log("doUnsubscribeFromTopic:" + event);

    var target = event.target;
    var topicTemplateElt = target.parentElement;
    var topicName = topicTemplateElt.getAttribute("topic-name");
    var mainTopicsListElt = document.getElementById("mainTopicsList");
    mainTopicsListElt.removeChild(topicTemplateElt);

    ipcBus.send("ipc-tests/unsubscribe-main-topic", topicName);
    ipcBus.unsubscribe(topicName);
    console.log("topicName : " + topicName + " - unsubscribe");
}

function doQueryBrokerState() {
    ipcBus.queryBrokerState();
}

ipcBus.subscribe('IPC_BUS_BROKER_STATUS_TOPIC', function(msgTopic, msgContent) {
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
});


ipcBus.subscribe("ipc-tests/main", function(msgTopic, msgContent) {
    console.log("msgTopic:" + msgTopic + " msgContent:" + msgContent)
})

ipcBus.subscribe("ipc-tests/node-instance/created", function () {
})

