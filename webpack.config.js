const path = require('path');

module.exports = {
  mode: "production",
  entry: './src/boenbot.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'boenbot.js',
    path: path.resolve(__dirname, 'build'),
  },
};