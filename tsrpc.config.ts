import type { TsrpcConfig } from "tsrpc-cli";

export default <TsrpcConfig>{
  proto: [
    {
      ptlDir: "src/apps/drawing/protocols",
      output: "src/apps/drawing/protocols/serviceProto.ts",
      apiDir: "src/apps/drawing/api",
      docDir: "docs/app1",
    },
  ],
  sync: [],
  dev: {
    autoProto: true,
    autoSync: true,
    autoApi: false,
    watch: "src",
    entry: "src/apps/drawing/front.ts",
  },
  build: {
    autoProto: true,
    autoSync: true,
    autoApi: false,
    outDir: "dist",
  },
};
