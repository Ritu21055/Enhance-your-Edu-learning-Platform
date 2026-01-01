const webpack = require('webpack');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Add fallbacks for Node.js modules
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        "process": require.resolve("process/browser"),
        "process/browser": require.resolve("process/browser.js"),
        "buffer": require.resolve("buffer"),
        "stream": require.resolve("stream-browserify"),
        "util": require.resolve("util"),
        "crypto": require.resolve("crypto-browserify"),
        "path": require.resolve("path-browserify"),
        "assert": require.resolve("assert"),
        "http": require.resolve("stream-http"),
        "https": require.resolve("https-browserify"),
        "os": require.resolve("os-browserify"),
        "url": require.resolve("url"),
        "fs": false,
        "net": false,
        "tls": false,
        "child_process": false
      };
      
      // Add alias for process/browser to handle canvg dependency (ESM module)
      webpackConfig.resolve.alias = {
        ...webpackConfig.resolve.alias,
        "process/browser": require.resolve("process/browser.js")
      };
      
      // Use NormalModuleReplacementPlugin to replace process/browser imports
      webpackConfig.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^process\/browser$/,
          require.resolve("process/browser.js")
        )
      );

      // Add plugins to provide global variables
      webpackConfig.plugins = [
        ...webpackConfig.plugins,
        new webpack.ProvidePlugin({
          process: 'process/browser',
          Buffer: ['buffer', 'Buffer'],
        }),
      ];
      
      // Configure module rules to handle ESM modules (canvg) - allow imports without extensions
      webpackConfig.module = webpackConfig.module || {};
      webpackConfig.module.rules = webpackConfig.module.rules || [];
      
      // Add rule to handle canvg ESM module - disable fullySpecified requirement
      // This must be added BEFORE other rules that might process .js files
      webpackConfig.module.rules.unshift({
        test: /\.m?js$/,
        include: /node_modules[\\/]canvg/,
        type: 'javascript/auto',
        resolve: {
          fullySpecified: false
        }
      });
      
      // Also add a more specific rule for process/browser imports in canvg
      webpackConfig.module.rules.unshift({
        test: /node_modules[\\/]canvg[\\/].*\.js$/,
        resolve: {
          fullySpecified: false,
          alias: {
            'process/browser': require.resolve('process/browser.js')
          }
        }
      });

      // Suppress source map warnings for face-api.js
      webpackConfig.ignoreWarnings = [
        /Failed to parse source map/,
        /ENOENT: no such file or directory.*\.ts/
      ];

      return webpackConfig;
    },
  },
};
