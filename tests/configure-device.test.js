const sinon = require('sinon');
const { Client } = require('kubernetes-client');
const yaml = require('js-yaml');
const fs = require('fs');

const RED = {
  nodes: {
    registerType: sinon.stub(),
  },
  httpAdmin: {
    get: sinon.stub(),
  },
};

const REDModule = require('../src/configure-device')(RED);
let sandbox;

describe('configureDevice', () => {
  let node, device, namespace, config, clientStub;

  function configureDeviceWrapper(node, device, namespace, config) {
    // Call the configureDevice function from the RED module
    return REDModule(node, device, namespace, config);
  }

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    node = { client: new Client({ version: '1.13' }) };
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
    config = [{ metadata: { annotations: {} }, spec: { template: { spec: { containers: [{}] } } } }];

    // Use sandbox to create stubs
    sandbox.stub(node.client.apis['kubeflow.org'].v1.namespaces(namespace).devices, 'post');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should successfully configure device', async () => {
    const putStub = sandbox.stub(node.client.apis['kubeflow.org'].v1.namespaces(namespace).devices(device.metadata.name), 'put');
    putStub.resolves({ body: { status: 'Success' } });

    await configureDeviceWrapper(node, device, namespace, config);
    sinon.assert.calledOnce(putStub);
  });

  // it('should handle error when configuring device', async () => {
  //   clientStub.rejects(new Error('Failed to configure device'));
  //
  //   try {
  //     await configureDeviceWrapper(node, device, namespace, config);
  //   } catch (error) {
  //     expect(error.message).toBe('Failed to configure device');
  //   }
  //
  //   expect(clientStub.calledOnce).toBe(true);
  // });
  //
  // it('should handle undefined containers', async () => {
  //   config[0].spec.template.spec.containers = undefined;
  //   clientStub.resolves({ status: 'Success' });
  //
  //   await configureDeviceWrapper(node, device, namespace, config);
  //
  //   expect(clientStub.calledOnce).toBe(true);
  // });
});