import { fileURLToPath } from 'node:url';

export default {
  entry: './src/script-tag.js',
  output: {
    path: fileURLToPath(new URL('./dist', import.meta.url)),
    filename: 'beacon-tracker.min.js',
    clean: true,
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: 'babel-loader',
      },
    ],
  },
  // fail the build if it gets big
  performance: {
    hints: 'error',
    maxAssetSize: 10 * 1024,
    maxEntrypointSize: 10 * 1024,
  },
};
