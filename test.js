const Code2Prompt = require('./index');

!async function(){
    // Example usage
    const options = {
        path: ".",
        extensions: ["js", "hbs"], // Specify the extensions to filter for
        //template: 'templates/default.hbs',
        template: 'templates/write-readme.hbs',
        ignore: ["**/node_modules/**"], // Specify patterns to ignore
    };
    const code2Prompt = new Code2Prompt(options);
    const prompt = await code2Prompt.generatePrompt();
    // add your prompt after 'prompt' or a template
    console.log(prompt);
}();