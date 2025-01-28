const json = require("@eslint/json").default;

module.exports = [{
    plugins: {
        json,
    },
}, {
    files: ["**/*.json"],
    language: "json/json",
    rules: {
        "json/no-duplicate-keys": "error",
    },
}];
