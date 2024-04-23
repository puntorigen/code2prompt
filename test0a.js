const Code2Prompt = require('./index');
const { z } = require('zod');
require('dotenv').config();

!async function(){
    // Example usage
    const options = {
        path: ".",
        extensions: ["js","json"], // Specify the extensions to filter for
        //template: 'templates/default.hbs',
        template: 'templates/write-readme2.md',
        ignore: ["**/node_modules/**","*-lock.json"], // Specify patterns to ignore
        OPENAI_KEY: process.env.OPENAI_KEY // Optional OpenAI API key; needed for 'request' method
    };
    const code2Prompt = new Code2Prompt(options);
    console.log('executing readme AI template ..');
    const test = await code2Prompt.runTemplate(`Generate a detailed readme markdown file from the given codebase. Add a 'request' method call example as well. Consider this project is consumed as a library.`,{
        require,
    });
    // outpout generated readme
    console.log('readne:',test.schema.readme);
}();