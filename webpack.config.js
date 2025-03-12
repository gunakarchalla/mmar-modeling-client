/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const Dotenv = require('dotenv-webpack');
const DuplicatePackageCheckerPlugin = require('duplicate-package-checker-webpack-plugin');
const { ProvidePlugin } = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');

const cssLoader = 'css-loader';

const sassLoader = {
  loader: 'sass-loader',
  options: {
    sassOptions: {
      includePaths: ['node_modules'],
      quietDeps: true
    }
  }
};

const postcssLoader = {
  loader: 'postcss-loader',
  options: {
    postcssOptions: {
      plugins: ['autoprefixer']
    }
  }
};

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const shouldAnalyze = process.env.ANALYZE === 'true';
  let dotenvPath = isProduction ? path.resolve(__dirname, '.env') : path.resolve(__dirname, '.env.development');

  require('dotenv').config({ path: dotenvPath });

  console.log(dotenvPath);

  return {
    target: 'web',
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? 'source-map' : 'inline-source-map',
    entry: {
      entry: './src/main.ts'
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProduction ? '[name].[contenthash].bundle.js' : '[name].bundle.js'
    },
    resolve: {
      extensions: ['.ts', '.js'],
      modules: [path.resolve(__dirname, 'src'), path.resolve(__dirname, 'dev-app'), 'node_modules'],
      fallback: {
        buffer: require.resolve('buffer/'),
        crypto: require.resolve('crypto-browserify'),
        util: require.resolve('util/'),
        stream: require.resolve('stream-browserify'),
        process: require.resolve('process/browser'),
        vm: false,
        'readable-stream': require.resolve('readable-stream'),
        'safe-buffer': require.resolve('safe-buffer'),
      },
      alias: {
        ...getAureliaDevAliases(),
        'aurelia-binding': path.resolve(__dirname, 'node_modules/aurelia-binding'),
        'bn.js': path.resolve(__dirname, 'node_modules/bn.js'),
        'process': path.resolve(__dirname, 'node_modules/process'),
        'tslib': path.resolve(__dirname, 'node_modules/tslib'),
        '@transloadit/prettier-bytes': path.resolve(__dirname, 'node_modules/@transloadit/prettier-bytes'),
        // alias for readable-stream
        'readable-stream': path.resolve(__dirname, 'node_modules/readable-stream'),
        // alias for safe-buffer
        'safe-buffer': path.resolve(__dirname, 'node_modules/safe-buffer'),
        // If using stream-browserify, resolve its dependencies too
        'stream-browserify': path.resolve(__dirname, 'node_modules/stream-browserify')
      }
    },
    devServer: {
      historyApiFallback: true,
      open: !process.env.CI,
      port: process.env.PORT,
      https: process.env.HTTPS === 'true',
      compress: process.env.COMPRESS === 'true',
      hot: process.env.HOT === 'true',
      liveReload: process.env.LIVE_RELOAD === 'true',
      allowedHosts: [
        process.env.ALLOWED_HOSTS, 'localhost'
      ],
      client: {
        overlay: {
          errors: process.env.ERRORS === 'true',
          warnings: process.env.WARNINGS === 'true',
          runtimeErrors: process.env.RUNTIME_ERRORS === 'true'
        }
      }
    },
    module: {
      rules: [
        { test: /\.(png|svg|jpg|jpeg|gif)$/i, type: 'asset' },
        { test: /\.(woff|woff2|ttf|eot|svg|otf)(\?v=[0-9]\.[0-9]\.[0-9])?$/i, type: 'asset' },
        { test: /\.css$/i, use: ['style-loader', cssLoader, postcssLoader, sassLoader] },
        { test: /\.scss$/i, use: ['style-loader', cssLoader, postcssLoader, sassLoader] },
        { test: /\.ts$/i, use: ['ts-loader', '@aurelia/webpack-loader'], exclude: /node_modules/ },
        {
          test: /[/\\]src[/\\].+\.html$/i,
          use: '@aurelia/webpack-loader',
          exclude: /node_modules/
        },
        {
          test: /\.js$/,
          enforce: 'pre',
          use: ['source-map-loader'],
          exclude: /node_modules/,
        }
      ]
    },
    optimization: {
      minimize: isProduction,
      minimizer: [new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
          },
          output: {
            comments: false,
          },
        },
        extractComments: false,
      })],
    },
    plugins: [
      new HtmlWebpackPlugin({ template: 'index.html', favicon: 'favicon.ico' }),
      new Dotenv({ path: dotenvPath }),
      new DuplicatePackageCheckerPlugin(),
      new ProvidePlugin({
        process: 'process/browser'
      }),
      new ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
      }),
      shouldAnalyze && new BundleAnalyzerPlugin(),
    ].filter(Boolean)
  };
};

function getAureliaDevAliases() {
  return [
    'aurelia',
    'fetch-client',
    'kernel',
    'metadata',
    'platform',
    'platform-browser',
    'route-recognizer',
    'router',
    'router-lite',
    'runtime',
    'runtime-html',
    'testing',
    'state',
    'ui-virtualization'
  ].reduce((map, pkg) => {
    const name = pkg === 'aurelia' ? pkg : `@aurelia/${pkg}`;
    try {
      const packageLocation = require.resolve(name);
      map[name] = path.resolve(packageLocation, `../../esm/index.dev.mjs`);
    } catch {/**/ }
    return map;
  }, {});
}
