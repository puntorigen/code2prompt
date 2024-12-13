const Code2Prompt = require('../index');
const { z } = require('zod');
require('dotenv').config();

!async function(){
    // Example usage
    const options = {
        path: "../",
        extensions: ["js","hbs"], // Specify the extensions to filter for
        template: 'templates/default.hbs',
        //template: 'templates/write-readme.hbs',
        ignore: ["**/node_modules/**"], // Specify patterns to ignore
        OPENAI_KEY: process.env.OPENAI_KEY // Optional OpenAI API key; needed for 'request' method
    };
    const code2Prompt = new Code2Prompt(options);
    const prompt = await code2Prompt.generateContextPrompt();
    // view generated codebase prompt
    //console.log(prompt);
    // calling test
    console.log('generating call ..');
    const test = await code2Prompt.request("Analyze the codebase and determine the information asked by the schema",
        z.object({
            variables: z.number().describe('The number of variables in the codebase'),
            functions: z.number().describe('The number of functions in the codebase'),
            class: z.string().describe('Type of codebase: library, CLI, web app, etc.'),
            lines: z.number().describe('The number of lines of code in the codebase'),
            about: z.string().describe('A brief description of the purpose of this codebase')
        }
    ));
    // test.data = { global, lines, about } 
    console.log('info:',test);
}();