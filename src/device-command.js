module.exports = async function (RED) {
    const fs = require('fs')
    const yaml = require("js-yaml");
    const Client = require('kubernetes-client').Client;
    const k8sClient = new Client({version: '1.13'});
    const DeviceManagerClient = require('@google-cloud/iot').v1.DeviceManagerClient;
    const iotClient = new DeviceManagerClient();
    const namespace = process.env.NAMESPACE || "default";
    const project_id = process.env.PROJECT_ID || "default";

    const readYaml = (path, cb) => {
        fs.readFile(require.resolve(path), 'utf8', (err, data) => {
            if (err)
                cb(err);
            else
                cb(null, yaml.load(data));
        })
    }
    readYaml('./kubeflow.org_devices.yaml', (err, crd) => {
        if (err) {
            console.log(err);
        } else {
            k8sClient.addCustomResourceDefinition(crd);
        }
    });

    function DeviceCommand(config) {
        RED.nodes.createNode(this, config);
        this.devices = config.devices.map(device => JSON.parse(device).name);
        this.metadatalabels = config.metadatalabels.map(label => {
            return {[label.key]: label.value};
        });
        const mode = config.mode || "select";
        const app = config.app;
        const node = this;

        const sendCommand = function sendCommandFunc(deviceName, payload) {
            const name = `projects/${project_id}/locations/us-central1/registries/${namespace}/devices/${deviceName}`;
            const binaryData = Buffer.from(JSON.stringify(payload));
            const subfolder = app;
            const request = {
                name,
                binaryData,
                subfolder,
            };

            // Run request
            iotClient.sendCommandToDevice(request).catch(err => {
                node.error(err.message, err.details);
            });
        };

        node.on('input', function (msg) {
            try {
                if (msg.hasOwnProperty("payload")) {
                    if (app && app !== '') {
                        if (mode === "select") {
                            node.devices.forEach(deviceName => sendCommand(deviceName, msg.payload));
                            node.status({
                                fill: "green",
                                shape: "dot",
                                text: "Command sent to " + app + " on: \n" + node.devices.map(deviceName => deviceName + " \n")
                            });
                        } else if (mode === "labels") {
                            k8sClient.apis['kubeflow.org'].v1.namespaces(namespace).devices().get().then(devices => {
                                var filtered = devices.body.items.filter(device => {
                                    return node.metadatalabels.reduce((matchingAllLabels, label1) => {
                                        return matchingAllLabels && Object.keys(label1).reduce((matchingAll, key1) => {
                                            return matchingAll && Object.keys(device.metadata.labels).reduce((matching, key2) => {
                                                return matching || (key1 === key2 && label1[key1] === device.metadata.labels[key2]);
                                            }, false);
                                        }, true);
                                    }, true);
                                });

                                filtered.forEach((device) => sendCommand(device.metadata.name, msg.payload));
                                node.status({
                                    fill: "green",
                                    shape: "dot",
                                    text: "Command sent to" + app + " on: \n" + filtered.map(device => device.metadata.name + " \n")
                                });
                            });
                        }
                    } else {
                        node.status({fill: "red", shape: "dot", text: "App not defined!"});
                    }
                } else {
                    node.status({fill: "red", shape: "dot", text: "No payload in message!"});
                }
            } catch (err) {
                node.error(err.message, err.details);
                node.status({fill: "red", shape: "dot", text: err});
            }
        });
    }

    RED.nodes.registerType("device-command", DeviceCommand);

    DeviceCommand.prototype.close = function () {
        try {
            var context = RED.util.parseContextStore(this.id);
            var target = this.context()["global"];
            target.set(context.key, [], context.store, function (err) {
                if (err) {
                    this.error(err);
                }
            });
        } catch (err) {
            this.error(err.message);
        }
    }
}
