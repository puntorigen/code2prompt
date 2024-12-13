# Code2Prompt

Code2Prompt is a NodeJS library that transforms a given codebase directory into a language learning model (LLM) prompt.

## Features

- Parse a given directory into a formatted output suitable for language learning model prompts
- Can ignore specific patterns in the directory
- Ability to use OpenAI's API for 'request' method
- Replace `fs.readFile` method with custom method for specific file extensions.

## Installation

Install the library via npm:

```
npm install code2prompt
```

Then, require it in your file:

```
const Code2Prompt = require('code2prompt');
```

You will also need to install the required dependencies listed in the `package.json` file.

## Usage Examples

Here is a basic usage example:

```javascript
const Code2Prompt = require('code2prompt');
const { z } = require('zod');
const options = {
  path: '.',
  extensions: ['js'],
  ignore: ['**/node_modules/**'],
  OPENAI_KEY: process.env.OPENAI_KEY
};
const code2Prompt = new Code2Prompt(options);
const prompt = await code2Prompt.generateContextPrompt();
```

This example will traverse the current directory (`.`), consider javascript files (`js`), ignore `node_modules` directory and use the OpenAI key from the environment variables. The `generateContextPrompt` method will return the generated prompt.

## Configuration Options

When creating a new instance of `Code2Prompt`, you can specify the following options:

- **path**: The directory path to parse.
- **extensions**: Array of extensions to filter for.
- **ignore**: An array of glob patterns to ignore.
- **OPENAI_KEY**: The OpenAI API Key for the 'request' method.
- **custom_viewers**: custom file reader methods for specific extensions.

## Contribution Guidelines

This is an open source project and contributions are welcome. Check the issues on this repository for any outstanding issues or to check the project requirements.

## Testing Instructions

To run the test script, use the following in your command line:

```
npm run test
```

The `test.js` is a good starting point for testing your own implementations.

## License

This project is under MIT License.

## Acknowledgements

This project is developed by Pablo Schaffner. Check the [repository](https://github.com/puntorigen/code2prompt) for more details.