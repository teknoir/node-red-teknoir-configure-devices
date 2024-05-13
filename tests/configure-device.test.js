const { Client } = require('kubernetes-client');
const yaml = require('js-yaml');
const fs = require('fs');

const RED = {
  nodes: {
    registerType: jest.fn(),
  },
  httpAdmin: {
    get: jest.fn(),
  },
};

const REDModule = require('../src/configure-device')(RED);
let sandbox;

describe('configureDevice', () => {
  let node, device, namespace, config= [], putMock;

  function configureDeviceWrapper(node, device, namespace, config) {
    // Call the configureDevice function from the RED module
    return REDModule(node, device, namespace, config);
  }

  beforeEach(async () => {
    node = { client: new Client({ version: '1.13' }), error: jest.fn(), status: jest.fn() };
    let crd = yaml.safeLoad(fs.readFileSync(require.resolve('../src/kubeflow.org_devices.yaml'), {
      encoding: 'utf8',
      flag: 'r'
    }));
    node.client.addCustomResourceDefinition(crd);
    device = {
      kind: 'Device',
      apiVersion: 'kubeflow.org/v1',
      metadata: {
        name: 'test-device',
        labels: {
          key: 'value'
        },
        resourceVersion: '1'
      },
      spec: {
        keys: {},
        manifest: {
          apps: {
            items: []
          }
        }
      }
    };
    namespace = 'default';
    config = [{ kind: "Deployment", metadata: { name: "record-measurements" }, spec: { template: { spec: { containers: [{}] } } } }];
    putMock = jest.fn().mockResolvedValue({ body: { status: 'Success' } });

    node.client.apis['kubeflow.org'].v1.namespaces = jest.fn().mockReturnValue({
      devices: jest.fn().mockReturnValue({
        post: jest.fn(),
        put: putMock
      })
    });
  });

  it('should successfully configure device', async () => {
    configureDeviceWrapper(node, device, namespace, config);

    // Check that the mock was called once
    expect(putMock).toHaveBeenCalledTimes(1);
  });

  it('should handle additional manifest with ConfigMap', async () => {
    config.push({ kind: "ConfigMap", metadata: { name: "sensors-config" }})

    configureDeviceWrapper(node, device, namespace, config);

    // error/status should not have been called
    expect(node.error).toHaveBeenCalledTimes(0);
    expect(node.status).toHaveBeenCalledTimes(0);
    expect(putMock).toHaveBeenCalledTimes(1);
  });

  it('should handle error when configuring device due to incorrect manifest', async () => {
    config.push({ kind: "ConfigMap", metadata: { name: "sensors-config" }})
    config.push({ kind: "Deployment", metadata: { name: "record-video" }})

    configureDeviceWrapper(node, device, namespace, config);

    // error/status should have been called
    expect(node.error).toHaveBeenCalledTimes(1);
    expect(node.status).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledTimes(1);
  });
});