import type { TsrpcConfig } from "tsrpc-cli";

export default <TsrpcConfig>{
  proto: [
    {
      ptlDir: "src/apps/mandis/protocols",
      output: "src/apps/mandis/protocols/serviceProto.ts",
      apiDir: "src/apps/mandis/api",
      docDir: "docs/app1",
    },
  ],
  sync: [],
  dev: {
    autoProto: true,
    autoSync: true,
    autoApi: false,
    watch: "src",
    entry: "src/apps/mandis/front.ts",
  },
  build: {
    autoProto: true,
    autoSync: true,
    autoApi: false,
    outDir: "dist",
  },
};
