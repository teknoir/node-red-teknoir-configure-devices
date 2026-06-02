const https = require('https');
const yaml = require("js-yaml");

module.exports = function (RED) {
    function AddHelmGitOps(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.url = config.url;
        this.githubConfig = RED.nodes.getNode(config.githubConfig);
        this.branch = config.branch || "main";
        this.path = config.path;
        this.onceDelay = 0.01 * 1000;

        node.status({});

        this.onceTimeout = setTimeout(function () {
            node.emit("input", {});
        }, this.onceDelay);

        function fetchAndOutput(msg) {
            if (!node.url || !node.path) {
                node.status({ fill: "red", shape: "ring", text: "missing configuration" });
                return;
            }

            let org, repo;
            try {
                let urlString = node.url;
                if (!urlString.startsWith('http')) {
                    urlString = 'https://github.com/' + urlString;
                }
                const parsedUrl = new URL(urlString);
                const pathParts = parsedUrl.pathname.split('/').filter(p => p);
                if (pathParts.length >= 2) {
                    org = encodeURIComponent(pathParts[0]);
                    repo = encodeURIComponent(pathParts[1].replace(/\.git$/, ''));
                }
            } catch (e) {
                node.error("Invalid Repository URL", msg);
                node.status({ fill: "red", shape: "dot", text: "Invalid URL" });
                return;
            }

            if (!org || !repo) {
                node.error("Could not extract Org and Repo from URL", msg);
                node.status({ fill: "red", shape: "dot", text: "Invalid URL" });
                return;
            }

            const branch = encodeURIComponent(node.branch);
            const path = node.path.split('/').map(encodeURIComponent).join('/');

            const url = `https://raw.githubusercontent.com/${org}/${repo}/${branch}/${path}`;
            node.status({ fill: "blue", shape: "dot", text: "fetching..." });

            const options = {
                headers: {
                    'User-Agent': 'Node-RED'
                }
            };

            if (node.githubConfig && node.githubConfig.credentials) {
                const creds = node.githubConfig.credentials;
                if (creds.token) {
                    options.headers['Authorization'] = `token ${creds.token}`;
                }
            }

            https.get(url, options, (res) => {
                if (res.statusCode !== 200) {
                    const err = new Error(`Failed to fetch: ${res.statusCode} ${res.statusMessage}`);
                    node.error(err.message, msg);
                    node.status({ fill: "red", shape: "dot", text: `Error ${res.statusCode}` });
                    res.resume();
                    return;
                }

                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        let value = yaml.safeLoadAll(data);
                        value = value.filter(item => item !== null);

                        const hasNonHelmChart = value.some(item => item.kind !== 'HelmChart');
                        if (hasNonHelmChart) {
                            node.error("Only HelmChart resource type is supported", msg);
                            node.status({ fill: "red", shape: "dot", text: "Unsupported resource type" });
                            return;
                        }

                        RED.util.setMessageProperty(msg, "add_resource", true);
                        RED.util.setMessageProperty(msg, "payload", value);
                        node.send(msg);
                        node.status({ fill: "green", shape: "dot", text: "fetched" });
                    } catch (err) {
                        node.error(err.message, msg);
                        node.status({ fill: "red", shape: "dot", text: "YAML Error" });
                    }
                });
            }).on('error', (err) => {
                node.error(err.message, msg);
                node.status({ fill: "red", shape: "dot", text: err.message });
            });
        }

        node.on('input', function (msg) {
            fetchAndOutput(msg);
        });
    }

    RED.nodes.registerType("add-helm-gitops", AddHelmGitOps);

    AddHelmGitOps.prototype.close = function () {
        if (this.onceTimeout) {
            clearTimeout(this.onceTimeout);
        }
    };
}
