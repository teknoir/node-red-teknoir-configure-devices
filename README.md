# node-red-teknoir-configure-devices
A set of nodes that configures Teknoir devices.

# Install
```
RUN npm install --no-audit --no-update-notifier --no-fund --save --save-prefix=~ --production --engine-strict node-red-teknoir-configure-devices@teknoir/node-red-teknoir-configure-devices#main
```

# Documentation
The nodes are properly documented in `Node-RED` itself.

# Develop / debug
Go to `./debug` and run:
```
npm install
npm start
```

# TODO:
- [ ] Add full user documentation in node
- [ ] Use the catalog to get App deployments
- [ ] Device command still use GCP IoT Core API, should use EMQX API