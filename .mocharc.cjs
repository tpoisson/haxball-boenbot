"use strict";

// This is a JavaScript-based config file containing every Mocha option plus others.
// If you need conditional logic, you might want to use this type of config,
// e.g. set options via environment variables 'process.env'.
// Otherwise, JSON or YAML is recommended.

process.env.TS_NODE_PROJECT="tsconfig.test.json";

// https://github.com/mochajs/mocha/blob/master/example/config/.mocharc.js
module.exports = {
  color: true,
  extension: ["ts"],

  require: ["ts-node/register"],

  spec: ["test/**/*.test.ts"],

  timeout: 2000, // same as "timeout: '2s'",
};
