module.exports = function (RED) {
    var yaml = require("js-yaml");

    function AddApp(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.template = config.template;
        this.onceDelay = 0.01 * 1000;

        node.status({});

        this.onceTimeout = setTimeout( function() {
            node.emit("input",{});
        }, this.onceDelay);

        function output(msg, value) {
            value = yaml.safeLoadAll(value);
            RED.util.setMessageProperty(msg, "add_resource", true);
            RED.util.setMessageProperty(msg, "payload", value);
            node.send(msg);
        }

        node.on('input', function (msg) {
            try {
                var template = node.template;
                output(msg, template);
            }
            catch(err) {
                node.error(err.message, msg);
                node.status({fill: "red", shape: "dot", text: err});
            }
        });
    }

    RED.nodes.registerType("add-app", AddApp);

    AddApp.prototype.close = function() {
        if (this.onceTimeout) {
            clearTimeout(this.onceTimeout);
        }
    };

}
