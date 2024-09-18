const { Client } = require("kubernetes-client");
const yaml = require("js-yaml");
const fs = require("fs");
module.exports = function (RED) {
    const fs = require('fs');
    const yaml = require("js-yaml");
    const Client = require('kubernetes-client').Client;
    const namespace = process.env.NAMESPACE || "default";

    function sleep(time) {
        return new Promise((resolve) => setTimeout(resolve, time));
    }

    function configureDevice(node, device, namespace, config) {
        const newItems = JSON.parse(JSON.stringify(config));

        // Determine the API version of the device
        const apiVersion = device.apiVersion.split('/')[0];

        // Process the configuration based on the API version
        if (apiVersion === 'teknoir.org') {
            // Handle teknoir.org devices
            processTeknoirDevice(node, device, namespace, newItems);
        } else if (apiVersion === 'kubeflow.org') {
            // Handle kubeflow.org devices
            processKubeflowDevice(node, device, namespace, newItems);
        } else {
            node.error("Unsupported API version: " + apiVersion);
            node.status({
                fill: "red",
                shape: "dot",
                text: "Unsupported API version"
            });
            return;
        }

        // Update the device in Kubernetes
        return node.client.apis[apiVersion].v1.namespaces(namespace).devices(device.metadata.name).put({ body: device });
    }

    function processTeknoirDevice(node, device, namespace, newItems) {

        if (!device.spec.manifest.hasOwnProperty('apps')) {
            device.spec.manifest['apps'] = {};
        }

        device.spec.manifest.apps = Object.keys(device.spec.manifest.apps)
            .filter(appName => {
                const app = device.spec.manifest.apps[appName];
                return app.metadata && app.metadata.annotations && (
                    !app.metadata.annotations.hasOwnProperty('teknoir.org/managed-by') ||
                    app.metadata.annotations['teknoir.org/managed-by'] !== 'devstudio'
                );
            })
            .reduce((result, appName) => {
                result[appName] = device.spec.manifest.apps[appName];
                return result;
            }, {});

        newItems.forEach(newItem => {
            let appName = newItem.metadata.name;

            if (!newItem.metadata.hasOwnProperty('annotations')) {
                newItem.metadata['annotations'] = {};
            }

            newItem.metadata.annotations['teknoir.org/managed-by'] = 'devstudio';
            if (device.spec.manifest.apps.hasOwnProperty(appName)) {
                node.error(`Duplicate app name detected: ${appName}`);
                return;
            }

            device.spec.manifest.apps[appName] = newItem;
        });

    }

    function processKubeflowDevice(node, device, namespace, newItems) {

        newItems.filter(manifest => manifest.hasOwnProperty('kind') && manifest.kind === 'Deployment').map(manifest => {
            try {

                if (!manifest.metadata.hasOwnProperty('annotations')) {
                    manifest.metadata['annotations'] = {};
                }

                manifest.metadata.annotations['teknoir.org/managed-by'] = 'devstudio';

                manifest.spec.template.spec.containers.forEach(container => {
                    if (!container.hasOwnProperty('env')) {
                        container['env'] = [];
                    }
                    container.env.push({
                        name: 'LABEL_DEVICE_ID',
                        value: device.metadata.name
                    });
                    container.env.push({
                        name: 'LABEL_NAMESPACE',
                        value: namespace
                    });
                    Object.keys(device.metadata.labels).forEach(key => {
                        container.env.push({
                            name: 'LABEL_' + key.toLocaleUpperCase(),
                            value: device.metadata.labels[key]
                        });
                    });
                });
            } catch (err) {
                node.error("Malformed configuration: " + err.message);
                node.status({
                    fill: "red",
                    shape: "dot",
                    text: "Malformed configuration"
                });
            }
        });


        if (!device.spec.manifest.hasOwnProperty('apps')) {
            device.spec.manifest['apps'] = { items: [] };
        }

        device.spec.manifest.apps.items = device.spec.manifest.apps.items.filter(item => {
            return item.metadata.annotations && (
                !item.metadata.annotations.hasOwnProperty('teknoir.org/managed-by') ||
                item.metadata.annotations['teknoir.org/managed-by'] !== 'devstudio');
        });

        device.spec.manifest.apps.items = device.spec.manifest.apps.items.filter(item => {
            return !newItems.some(newItem => newItem.metadata.name === item.metadata.name)
        });

        device.spec.manifest.apps.items.push(...newItems);
    }

    function sendDebug(node, msg, debuglength) {
        const debug = RED.util.encodeObject({
            id: node.id,
            z: node.z,
            _alias: node._alias,
            path: node._flow.path,
            name: node.name,
            msg: msg
        }, {
            maxLength: debuglength
        });
        RED.comms.publish("debug", debug);
    }

    function ConfigureDevice(config) {
        RED.nodes.createNode(this, config);
        this.devices = config.devices.map(device => JSON.parse(device));
        this.metadatalabels = config.metadatalabels.map(label => {
            return { [label.key]: label.value };
        });
        const mode = config.mode || "select";
        this.onceDelay = 1.50 * 1000;
        this.namespace = namespace;
        let client = new Client({ version: '1.13' });

        // List of CRD files to load
        const crdFiles = [
            './kubeflow.org_devices.yaml',
            './teknoir.org_devices.yaml'
        ];

        // Load and add each CRD to the client
        crdFiles.forEach(crdFile => {
            let crd = yaml.safeLoad(fs.readFileSync(require.resolve(crdFile), {
                encoding: 'utf8',
                flag: 'r'
            }));
            client.addCustomResourceDefinition(crd);
        });

        this.client = client;
        const node = this;
        var debuglength = RED.settings.debugMaxLength || 1000;

        this.onceTimeout = setTimeout(function () {
            node.emit("input", { deploy_configuration: true });
        }, this.onceDelay);

        node.on('input', function (msg) {
            try {
                var context = RED.util.parseContextStore(node.id);
                var target = node.context()["global"];

                if (msg.hasOwnProperty("add_resource") && msg.hasOwnProperty("payload")) {
                    target.get(context.key, context.store, (err, current) => {
                        if (err) {
                            node.error(err, msg);
                            node.status({ fill: "red", shape: "dot", text: err });
                        } else {
                            if (!current) {
                                current = [];
                            }
                            if (Array.isArray(msg.payload)) {
                                current = current.concat(msg.payload);
                            } else {
                                current.push(msg.payload);
                            }
                            target.set(context.key, current, context.store, function (err) {
                                if (err) {
                                    node.error(err, msg);
                                    node.status({ fill: "red", shape: "dot", text: err });
                                }
                            });
                        }
                    });
                } else if (msg.hasOwnProperty("deploy_configuration")) {
                    target.get(context.key, context.store, (err, config) => {
                        if (err) {
                            node.error(err, msg);
                            node.status({ fill: "red", shape: "dot", text: err });
                        } else {
                            if (!config) {
                                node.error("There is no config to deploy, please connect some configuration nodes");
                                node.status({
                                    fill: "red",
                                    shape: "dot",
                                    text: "No configuration nodes wired up"
                                });
                            } else {
                                // sendDebug(node, yaml.safeDump(config), debuglength);
                                if (mode === "select") {
                                    if (!node.devices || node.devices.length < 1) {
                                        node.error("No devices selected");
                                        node.status({
                                            fill: "red",
                                            shape: "dot",
                                            text: "No devices selected",
                                        });
                                    } else {
                                        node.status({
                                            fill: "green",
                                            shape: "dot",
                                            text: "Successfully updated devices.",
                                        });
                                    }
                                    node.devices.forEach((device, idx) => {
                                        
                                        const deviceName = device.name;
                                        // Global API rate limit 3000 requests per min (50/sec)
                                        // Here we do 2 requests per device, so we can configure 25 devices per second
                                        // I think this is single threaded, so we can just add a delay here... times 2 as this is not the only client

                                        let apiVersion = null;
                                        if (device.source === 'kubeflow.org') {
                                            apiVersion = 'kubeflow.org';
                                        } else if (device.source === 'teknoir.org') {
                                            apiVersion = 'teknoir.org';
                                        }

                                        if (!apiVersion) {
                                            console.error('Error: apiVersion is null for device:', deviceName);
                                            return;
                                        }

                                        sleep((idx * 2 * 1000) / 25).then(() => {

                                            node.client.apis[apiVersion].v1.namespaces(node.namespace).devices(deviceName).get()
                                                .catch(() => {
                                                    sendDebug(node, deviceName + ": failed to update (could not get device)", debuglength);
                                                    node.status({
                                                        fill: "yellow",
                                                        shape: "dot",
                                                        text: "Warning! One or more devices failed to update. See debug log for details.",
                                                    });
                                                })
                                                .then(device => {
                                                    if (!device) {
                                                        sendDebug(node, deviceName + ": failed to update (device undefined or null)", debuglength);
                                                        node.status({
                                                            fill: "yellow",
                                                            shape: "dot",
                                                            text: "Warning! One or more devices failed to update. See debug log for details.",
                                                        });
                                                    } else {
                                                        configureDevice(node, device.body, node.namespace, config)
                                                            .then(() => {
                                                                sendDebug(node, deviceName + ": successfully updated", debuglength);
                                                            })
                                                            .catch(err => {
                                                                sendDebug(node, deviceName + ": failed to update (" + err.message + ")", debuglength);
                                                                node.status({
                                                                    fill: "yellow",
                                                                    shape: "dot",
                                                                    text: "Warning! One or more devices failed to update. See debug log for details.",
                                                                });
                                                            });
                                                    }
                                                })
                                        });
                                    });
                                } else if (mode === "labels") {
                                    const labelSelector = node.metadatalabels.map(label => {
                                        return Object.keys(label).map(key => key + "=" + label[key]);
                                    }).join(",");

                                    const apiVersions = ['kubeflow.org', 'teknoir.org'];

                                    apiVersions.forEach(apiVersion => {
                                        node.client.apis[apiVersion].v1.namespaces(namespace).devices().get({
                                            qs: {
                                                labelSelector: labelSelector ? labelSelector : ''
                                            }
                                        }).then(devices => {
                                            if (!devices.body.items || devices.body.items.length < 1) {
                                                node.error("No devices found for label selector: " + labelSelector);
                                                node.status({
                                                    fill: "red",
                                                    shape: "dot",
                                                    text: "No devices found for label selector: " + labelSelector,
                                                });
                                            } else {
                                                node.status({
                                                    fill: "green",
                                                    shape: "dot",
                                                    text: "Successfully updated devices.",
                                                });
                                            }
                                            devices.body.items.forEach((device, idx) => {
                                                // Global API rate limit 3000 requests per min (50/sec)
                                                // Here we do 1 requests per device, so we can configure 50 devices per second
                                                // I think this is single threaded, so we can just add a delay here... times 2 as this is not the only client
                                                sleep((idx * 2 * 1000) / 50).then(() => {
                                                    configureDevice(node, device, node.namespace, config)
                                                        .then(() => {
                                                            sendDebug(node, device.metadata.name + ": successfully updated", debuglength);
                                                        })
                                                        .catch(err => {
                                                            sendDebug(node, device.metadata.name + ": failed to update (" + err.message + ")", debuglength);
                                                            node.status({
                                                                fill: "yellow",
                                                                shape: "dot",
                                                                text: "Warning! One or more devices failed to update. See debug log for details.",
                                                            });
                                                        });
                                                });
                                            });
                                        }).catch(err => {
                                            node.error(err.message, msg);
                                            node.status({ fill: "red", shape: "dot", text: err.message });
                                        })
                                    });
                                }
                            }
                        }
                    });
                }
            } catch (err) {
                node.error(err.message, msg);
                node.status({ fill: "red", shape: "dot", text: err.message });
            }
        });
    }

    RED.nodes.registerType("configure-device", ConfigureDevice);

    ConfigureDevice.prototype.close = function () {
        if (this.onceTimeout) {
            clearTimeout(this.onceTimeout);
        }

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
    };



    RED.httpAdmin.get('/node-red-teknoir-configure-devices', async function (req, res) {
        try {
            let client = new Client({ version: '1.13' });

            let kubeflowDeviceList = [];
            let teknoirDeviceList = [];

            let kubeflowData = fs.readFileSync(require.resolve('./kubeflow.org_devices.yaml'), { encoding: 'utf8', flag: 'r' });
            let kubeflowCrd = yaml.load(kubeflowData);
            client.addCustomResourceDefinition(kubeflowCrd);

            let teknoirData = fs.readFileSync(require.resolve('./teknoir.org_devices.yaml'), { encoding: 'utf8', flag: 'r' });
            let teknoirCrd = yaml.load(teknoirData);
            client.addCustomResourceDefinition(teknoirCrd);
            try {
                let kubeflowDevices = await client.apis['kubeflow.org'].v1.namespaces(namespace).devices().get();
                kubeflowDeviceList = kubeflowDevices.body.items.map(device => ({
                    name: device.metadata.name,
                    namespace: device.metadata.namespace,
                    labels: device.metadata.labels,
                    source: 'kubeflow.org'
                }));
            } catch (error) {
                console.error("Failed to load or fetch kubeflow.org devices:", error.message);
            }

            try {
                let teknoirData = fs.readFileSync(require.resolve('./teknoir.org_devices.yaml'), { encoding: 'utf8', flag: 'r' });
                let teknoirCrd = yaml.load(teknoirData);
                client.addCustomResourceDefinition(teknoirCrd);

                let teknoirDevices = await client.apis['teknoir.org'].v1.namespaces(namespace).devices().get();
                teknoirDeviceList = teknoirDevices.body.items.map(device => ({
                    name: device.metadata.name,
                    namespace: device.metadata.namespace,
                    labels: device.metadata.labels,
                    source: 'teknoir.org'
                }));
            } catch (error) {
                console.error("Failed to load or fetch teknoir.org devices:", error.message);
            }

            // Combine both device lists
            let combinedDeviceList = [...kubeflowDeviceList, ...teknoirDeviceList];

            // Send the combined list as the response
            res.status(200).json(combinedDeviceList);
        } catch (error) {
            res.status(500).send(error);
        }
    });

    return configureDevice;
}
