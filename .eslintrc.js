const json = require('eslint-plugin-json').default;

module.exports = [{
    files: ["**/*.json"],
        ...json.configs["recommended"]
    }
];
