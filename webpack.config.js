// webpack.config.js

const fs = require("fs");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const { minify } = require("terser");

const LOGS_ENABLED = process.env.STAGE === "dev" || false;
const INIT_SCRIPT_PATH = "./static/js/theme/init.js";
const ERROR_PAGES_FOLDER = "./static/errors";
const CSS_STYLES_FOLDER = "./static/css";
const JS_SCRIPTS_FOLDER = "./static/js";
const IMG_ASSET_FOLDER = "./static/img";
const FAVICON_PATH = "static/favicon.ico";
const DRAW_FOLDER = "./static/draw";

// Helper function to minify inline JS
async function minifyInlineJs(code) {
    const result = await minify(code, {
        compress: {
            drop_console: !LOGS_ENABLED,
        },
    });
    return result.code;
}

// Create minified init code synchronously
const initScript = fs.readFileSync(INIT_SCRIPT_PATH, "utf-8");
let minifiedInitScript = "";
(async () => {
    minifiedInitScript = await minifyInlineJs(initScript);
})();

// Template helpers
const templateHelpers = {
    getInitScript: () =>
        `<script type="text/javascript">${minifiedInitScript}</script>`,
};

// Get all error pages
const errorPages = fs
    .readdirSync(`${ERROR_PAGES_FOLDER}`)
    .filter((filename) => filename.endsWith(".html"))
    .map((filename) => ({
        name: filename.replace(".html", ""),
        path: `${ERROR_PAGES_FOLDER}/${filename}`,
    }));

const errorHtmlPlugins = errorPages.map(
    (page) =>
        new HtmlWebpackPlugin({
            template: page.path,
            filename: `errors/${page.name}.html`,
            chunks: [],
            minify: {
                removeAttributeQuotes: true,
                collapseWhitespace: true,
                removeComments: true,
                minifyJS: true,
                minifyCSS: true,
            },
            inject: true,
        })
);

module.exports = {
    mode: "production",
    entry: {
        main: [`${JS_SCRIPTS_FOLDER}/main.js`],
        styles: `${CSS_STYLES_FOLDER}/styles.css`,
        draw_main: [`${JS_SCRIPTS_FOLDER}/draw/main.js`],
        draw_styles: [`${CSS_STYLES_FOLDER}/draw/styles.css`],
    },
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "js/[name].[contenthash].js",
        assetModuleFilename: "assets/[hash][ext][query]",
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules|static\/js\/generated-sdk/,
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: ["@babel/preset-env"],
                    },
                },
            },
            {
                test: /\.css$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    "css-loader",
                    "postcss-loader",
                ],
            },
            {
                test: /\.(png|svg|jpg|jpeg|gif)$/i,
                type: "asset",
                parser: {
                    dataUrlCondition: {
                        maxSize: 8 * 1024,
                    },
                },
            },
            {
                test: /\.ico$/,
                type: "asset/resource",
                generator: {
                    filename: "[name][ext]",
                },
            },
        ],
    },
    optimization: {
        minimize: true, // Keep general minimization enabled
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: !LOGS_ENABLED,
                    },
                },
                exclude: /js\/generated-sdk/,
            }),
            new CssMinimizerPlugin(),
        ],
    },
    plugins: [
        new CleanWebpackPlugin(),
        new HtmlWebpackPlugin({
            template: "./static/index.html",
            filename: "index.html",
            chunks: ["main", "styles"],
            templateParameters: templateHelpers, // Use template helpers here
            minify: {
                removeAttributeQuotes: true,
                collapseWhitespace: true,
                removeComments: true,
                minifyJS: true,
                minifyCSS: true,
            },
            inject: true,
        }),
        new HtmlWebpackPlugin({
            template: `${DRAW_FOLDER}/index.html`,
            filename: "draw/index.html",
            chunks: ["draw_main", "draw_styles"],
            templateParameters: templateHelpers,
            minify: {
                removeAttributeQuotes: true,
                collapseWhitespace: true,
                removeComments: true,
                minifyJS: true,
                minifyCSS: true,
            },
            inject: true,
        }),
        ...errorHtmlPlugins,
        new MiniCssExtractPlugin({
            filename: "css/[name].[contenthash].css",
        }),
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: `${IMG_ASSET_FOLDER}`, // Copy all images
                    to: "img",
                },
                {
                    from: `${FAVICON_PATH}`, // Copy favicon
                    to: "favicon.ico",
                },
                {
                    from: `${DRAW_FOLDER}`,
                    to: "draw",
                    globOptions: {
                        ignore: ["**/index.html"], // Don't copy index.html as it will be processed by HtmlWebpackPlugin
                    },
                    noErrorOnMissing: true,
                },
            ],
        }),
    ],
    devServer: {
        static: "./dist",
        hot: true,
        port: 8080,
        open: true,
    },
};
