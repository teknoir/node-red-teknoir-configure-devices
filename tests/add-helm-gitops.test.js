const AddHelmGitOpsModule = require('../src/add-helm-gitops');
const https = require('https');

jest.mock('https');

describe('AddHelmGitOps Node', () => {
    let RED;
    let node;
    let config;

    beforeEach(() => {
        node = {
            on: jest.fn(),
            emit: jest.fn(),
            send: jest.fn(),
            error: jest.fn(),
            status: jest.fn(),
            id: 'node-id'
        };
        RED = {
            nodes: {
                createNode: jest.fn((instance, cfg) => {
                    Object.assign(instance, node, cfg);
                }),
                registerType: jest.fn()
            },
            util: {
                setMessageProperty: jest.fn((msg, prop, val) => {
                    msg[prop] = val;
                })
            }
        };
        config = {
            url: 'https://github.com/test-org/test-repo',
            branch: 'main',
            path: 'manifest.yaml'
        };
    });

    it('should register the node type', () => {
        AddHelmGitOpsModule(RED);
        expect(RED.nodes.registerType).toHaveBeenCalledWith('add-helm-gitops', expect.any(Function));
    });

    it('should fetch and send manifest on input', (done) => {
        AddHelmGitOpsModule(RED);
        const NodeConstructor = RED.nodes.registerType.mock.calls[0][1];
        const instance = new NodeConstructor(config);

        const mockResponse = {
            statusCode: 200,
            on: jest.fn((event, cb) => {
                if (event === 'data') cb('apiVersion: helm.cattle.io/v1\nkind: HelmChart\nmetadata:\n  name: test');
                if (event === 'end') cb();
            }),
            resume: jest.fn()
        };

        https.get.mockImplementation((url, cb) => {
            cb(mockResponse);
            return { on: jest.fn() };
        });

        // Find the input callback
        const inputCallback = node.on.mock.calls.find(call => call[0] === 'input')[1];
        const msg = {};
        inputCallback(msg);

        // We need to wait for the async part
        setImmediate(() => {
            try {
                expect(https.get).toHaveBeenCalledWith(
                    'https://raw.githubusercontent.com/test-org/test-repo/main/manifest.yaml',
                    expect.any(Function)
                );
                expect(msg.add_resource).toBe(true);
                expect(msg.payload).toBeDefined();
                expect(msg.payload[0].kind).toBe('HelmChart');
                expect(node.send).toHaveBeenCalledWith(msg);
                expect(node.status).toHaveBeenCalledWith(expect.objectContaining({ text: 'fetched' }));
                done();
            } catch (error) {
                done(error);
            }
        });
    });

    it('should error if manifest contains non-HelmChart resources', (done) => {
        AddHelmGitOpsModule(RED);
        const NodeConstructor = RED.nodes.registerType.mock.calls[0][1];
        const instance = new NodeConstructor(config);

        const mockResponse = {
            statusCode: 200,
            on: jest.fn((event, cb) => {
                if (event === 'data') cb('apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: test');
                if (event === 'end') cb();
            }),
            resume: jest.fn()
        };

        https.get.mockImplementation((url, cb) => {
            cb(mockResponse);
            return { on: jest.fn() };
        });

        const inputCallback = node.on.mock.calls.find(call => call[0] === 'input')[1];
        inputCallback({});

        setImmediate(() => {
            try {
                expect(node.error).toHaveBeenCalledWith("Only HelmChart resource type is supported", expect.any(Object));
                expect(node.status).toHaveBeenCalledWith(expect.objectContaining({ text: 'Unsupported resource type' }));
                done();
            } catch (error) {
                done(error);
            }
        });
    });

    it('should handle fetch error (non-200 status)', (done) => {
        AddHelmGitOpsModule(RED);
        const NodeConstructor = RED.nodes.registerType.mock.calls[0][1];
        const instance = new NodeConstructor(config);

        const mockResponse = {
            statusCode: 404,
            statusMessage: 'Not Found',
            on: jest.fn(),
            resume: jest.fn()
        };

        https.get.mockImplementation((url, cb) => {
            cb(mockResponse);
            return { on: jest.fn() };
        });

        const inputCallback = node.on.mock.calls.find(call => call[0] === 'input')[1];
        inputCallback({});

        setImmediate(() => {
            try {
                expect(node.error).toHaveBeenCalledWith(expect.stringContaining('404'), expect.any(Object));
                expect(node.status).toHaveBeenCalledWith(expect.objectContaining({ fill: 'red' }));
                done();
            } catch (error) {
                done(error);
            }
        });
    });

    it('should handle shorthand URL (org/repo)', (done) => {
        AddHelmGitOpsModule(RED);
        const NodeConstructor = RED.nodes.registerType.mock.calls[0][1];
        config.url = 'test-org/test-repo';
        const instance = new NodeConstructor(config);

        const mockResponse = {
            statusCode: 200,
            on: jest.fn((event, cb) => {
                if (event === 'data') cb('apiVersion: helm.cattle.io/v1\nkind: HelmChart\nmetadata:\n  name: test');
                if (event === 'end') cb();
            }),
            resume: jest.fn()
        };

        https.get.mockImplementation((url, cb) => {
            cb(mockResponse);
            return { on: jest.fn() };
        });

        const inputCallback = node.on.mock.calls.find(call => call[0] === 'input')[1];
        inputCallback({});

        setImmediate(() => {
            try {
                expect(https.get).toHaveBeenCalledWith(
                    'https://raw.githubusercontent.com/test-org/test-repo/main/manifest.yaml',
                    expect.any(Function)
                );
                done();
            } catch (error) {
                done(error);
            }
        });
    });

    it('should handle URL with .git suffix', (done) => {
        AddHelmGitOpsModule(RED);
        const NodeConstructor = RED.nodes.registerType.mock.calls[0][1];
        config.url = 'https://github.com/test-org/test-repo.git';
        const instance = new NodeConstructor(config);

        const mockResponse = {
            statusCode: 200,
            on: jest.fn((event, cb) => {
                if (event === 'data') cb('apiVersion: helm.cattle.io/v1\nkind: HelmChart\nmetadata:\n  name: test');
                if (event === 'end') cb();
            }),
            resume: jest.fn()
        };

        https.get.mockImplementation((url, cb) => {
            cb(mockResponse);
            return { on: jest.fn() };
        });

        const inputCallback = node.on.mock.calls.find(call => call[0] === 'input')[1];
        inputCallback({});

        setImmediate(() => {
            try {
                expect(https.get).toHaveBeenCalledWith(
                    'https://raw.githubusercontent.com/test-org/test-repo/main/manifest.yaml',
                    expect.any(Function)
                );
                done();
            } catch (error) {
                done(error);
            }
        });
    });

    it('should handle network error', (done) => {
        AddHelmGitOpsModule(RED);
        const NodeConstructor = RED.nodes.registerType.mock.calls[0][1];
        const instance = new NodeConstructor(config);

        const mockRequest = {
            on: jest.fn((event, cb) => {
                if (event === 'error') cb(new Error('Network Error'));
            })
        };

        https.get.mockReturnValue(mockRequest);

        const inputCallback = node.on.mock.calls.find(call => call[0] === 'input')[1];
        inputCallback({});

        setImmediate(() => {
            try {
                expect(node.error).toHaveBeenCalledWith('Network Error', expect.any(Object));
                expect(node.status).toHaveBeenCalledWith(expect.objectContaining({ text: 'Network Error' }));
                done();
            } catch (error) {
                done(error);
            }
        });
    });
});
