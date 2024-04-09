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
        OPENAI_KEY: process.env.OPENAI_KEY,
        /*schema: z.object({
            modification: z.string().describe('The modification to be made to the code.'),
            reason: z.string().describe('Reason for the modification.'),
        }),*/
    };
    const code2Prompt = new Code2Prompt(options);
    const prompt = await code2Prompt.generateContextPrompt();
    // add your prompt after 'prompt' or a template
    console.log(prompt);
    // calling test
    const test = await code2Prompt.request();
    console.log('test:',test);
}();