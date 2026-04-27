declare module 'onnxruntime-react-native/dist/commonjs/backend' {
  import type { Backend } from 'onnxruntime-common';

  export const onnxruntimeBackend: Backend;
  export const listSupportedBackends: () => { name: string }[];
}
