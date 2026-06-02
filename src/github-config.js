module.exports = function(RED) {
    function GitHubConfigNode(n) {
        RED.nodes.createNode(this, n);
        this.name = n.name;
    }
    RED.nodes.registerType("github-config", GitHubConfigNode, {
        credentials: {
            token: {type:"password"}
        }
    });
}
