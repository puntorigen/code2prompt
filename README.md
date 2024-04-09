# code2prompt

Generate LLM prompts from your codebase easily with `code2prompt`, a Node.js package designed to help you create structured documentation or coding challenge prompts directly from your project's source code.

## Features

- Recursively traverse your codebase directory.
- Filter files by extension to include only relevant code files.
- Automatically ignore specified directories or files using glob patterns.
- Generate structured data including a source tree and file contents.
- Utilize Handlebars templates for flexible output formatting.

## Installation

Install `code2prompt` using npm:

```bash
npm install code2prompt
```

Or using yarn:
```bash
yarn add code2prompt
```

## Usage
Here's a simple example on how to use code2prompt to generate a prompt from your codebase:

```javascript
const Code2Prompt = require('code2prompt');

!async function(){
    const options = {
        path: "/path/to/your/codebase",
        extensions: ["js", "ts"], // Specify the extensions to filter for
        //template: 'templates/default.hbs',
        template: 'templates/write-readme.hbs',
        ignore: ["**/node_modules/**"], // Specify patterns to ignore
        OPENAI_KEY: 'YOUR_OPENAI API KEY' // needed for calling 'request', if not it's optional
    };
    const code2Prompt = new Code2Prompt(options);
    const prompt = await code2Prompt.generateContextPrompt();
    console.log(prompt);
    // make request to openAI
    const generateReadme = await code2Prompt.request("Generate a readme file from the given codebase",z.object({
        readme: z.string().describe('The generated contents of the readme file'),
    }));
    // generatedReadme = { data: { readme: 'Generated readme.md content' }, usage:{ totalTokens, promptTokens, completionTokens } }
    console.log('Generated readme.md',generateReadme.data.readme);
    // some templates (like write-readme) contain a 'schema' md code block with the return schema for the prompt, so you can call it as is and it'll work
    const generateReadme2 = await code2Prompt.request();
}();
```

## Custom Templates
code2prompt uses Handlebars templates to format the output. You can specify a custom template path in the options to use your own Handlebars template. Here's a basic template example:

```handlebars
Project Path: {{absolute_code_path}}

Source Tree:
{{source_tree}}


{{#each files}}
{{#if code}}
`{{path}}`:

{{code}}

{{/if}}
{{/each}}
```

## Contributing
Contributions to code2prompt are welcome! Please feel free to submit issues, pull requests, or suggest features.

## License
This project is licensed under the MIT License - see the LICENSE file for details.