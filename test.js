const Code2Prompt = require('./index');
const { z } = require('zod');
require('dotenv').config();

!async function(){
    // Example usage
    const options = {
        path: ".",
        extensions: ["js"], // Specify the extensions to filter for
        //template: 'templates/default.hbs',
        template: 'templates/write-readme.hbs',
        ignore: ["**/node_modules/**"], // Specify patterns to ignore
        OPENAI_KEY: process.env.OPENAI_KEY // Optional OpenAI API key; needed for 'request' method
    };
    const code2Prompt = new Code2Prompt(options);
    const prompt = await code2Prompt.generateContextPrompt();
    // view generated codebase prompt
    console.log(prompt);
    // calling test
    const test = await code2Prompt.request("Generate a readme markdown file from the given codebase",z.object({
        readme: z.string().describe('The generated contents of the readme file'),
    }));
    // test.data = { readme: 'The generated contents of the readme file' }
    console.log('test:',test);
}();