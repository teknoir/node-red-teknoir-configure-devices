# node-red-teknoir-configure-devices
A set of nodes that configures Teknoir devices.

# Install
```
RUN npm install --no-audit --no-update-notifier --no-fund --save --save-prefix=~ --production --engine-strict node-red-teknoir-configure-devices@teknoir/node-red-teknoir-configure-devices#main
```

# Documentation
The nodes are properly documented in `Node-RED` itself.

# Develop / debug
Make sure you use the correct K8s context.
Example; run for the `demonstrations` namespace:
```
./debug.sh demonstrations
```

# TODO:
- [ ] Add full user documentation in node
- [ ] Use the catalog to get App deployments
- [ ] Device command still use GCP IoT Core API, should use EMQX API