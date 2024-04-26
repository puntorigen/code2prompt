// helper for executing HBS action code blocks and giving them context
const safeEval = require('safe-eval');
const { z } = require('zod');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class codeBlocks {
    constructor() {
        this.code_blocks = [];
        this.currentFolder = process.cwd();
        this.x_console = new (require('@concepto/console'))();
        this.lastEval = '';
    }

    async executeNode(context=null,code=null) {
        // context=object with variables returned by previous code blocks
        const prompts = require('prompts');
        let wAsync = `(async function() {
            ${code}
        })();\n`;
        const self = this;
        // returns methods,vars available within the code blocks contexts
        let context_ = {
            process,
            z,
            console: {
                log: function(message,data) {
                    self.x_console.setColorTokens({
                        '*':'yellow',
                        '#':'cyan',
                        '@':'green'
                    });
                    self.x_console.out({ color:'cyan', message:self.x_console.colorize(message), data });
                },
            },
            prompt: async(question='',validation=null)=>{
                const resp = (
                    await prompts({
                        type: 'text',
                        name: 'value',
                        message: this.x_console.colorize(question),
                        validate: (value) => {
                            if (validation) return validation(value);
                            return true
                        }
                    })
                ).value;
                return resp;
            }
        };
        if (context) {
            context_ = {...context_,...context};
        }
        // execute code block on an isolated async context
        this.lastEval = wAsync;
        let tmp = await safeEval(wAsync, context_);
        return tmp;
        //
    }

    async spawnBash(context=null,code=null) {
        // TODO
    }

    async executeBash(context = {}, code = null) {
        if (!code) {
            throw new Error("No code provided for execution");
        }

        // Replace placeholders in the code with context values
        const processedCode = typeof code === 'string' ? code.replace(/\{(.*?)\}/g, (match, key) => {
            if (context[key] !== undefined) {
                return context[key];
            }
            //throw new Error(`Key ${key} not found in context`);
        }) : '';

        // Append command to output all exported variables (you need to ensure this doesn't break your script)
        //let exportCmd = "\nexport -p"; // This line outputs all exported variables in the format 'declare -x KEY="value"'
        let exportCmd = ""; // This line outputs all exported variables in the format 'declare -x KEY="value"'
        let fullScript = processedCode + exportCmd;

        // Set up the environment for non-interactive execution
        const simpleContext = Object.keys(context).reduce((acc, key) => {
            const value = context[key];
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                acc[key] = value;
            }
            return acc;
        }, {});

        const environment = {
            ...process.env,
            ...simpleContext,
            npm_config_yes: 'yes', // Set npm to non-interactive mode
            npx_config_yes: 'yes', // Set npm to non-interactive mode
            CI: 'true', // Adding the CI environment variable
            CONTINUOUS_INTEGRATION: 'true' // Adding another common CI environment variable
        };

        try {
            const { stdout, stderr } = await execAsync(fullScript, {
                shell: '/bin/bash',
                env: environment,
                cwd: this.currentFolder // Set the current working directory to this.currentFolder
            });
            if (stderr) {
                console.error('Error executing bash:', stderr);
                return stderr;
            }
            // Process stdout to extract variables
            /*
            echo "KEY1=$VALUE1"
            echo "KEY2=$VALUE2"
            -> vars = { KEY1: 'VALUE1', KEY2: 'VALUE2' }
            */
            const vars = {};
            /*stdout.split('\n').forEach(line => {
                const match = line.match(/^declare -x (\w+)="(.*)"$/);
                if (match) {
                    vars[match[1]] = match[2];
                }
            });*/
            //console.log('Captured environment variables:', vars);
            console.log('Bash execution output:', stdout);
            return { vars, output: stdout };
        } catch (error) {
            console.error('Execution error:', error);
            throw error;
        }
    }
}

module.exports = codeBlocks;