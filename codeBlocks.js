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

    
    async spawnBash(context = {}, code=null) {
        const { spawn } = require('child_process');
        if (!code) {
            throw new Error("Command must not be empty");
        }

        return new Promise((resolve, reject) => {
            // simplify context to only string, number, boolean
            const simpleContext = Object.keys(context).reduce((acc, key) => {
                const value = context[key];
                if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                    acc[key] = value;
                }
                return acc;
            }, {});

            // Handle command with arguments that might include spaces
            const shell = process.platform === 'win32' ? { cmd: 'cmd', arg: '/C' } : { cmd: 'sh', arg: '-c' };
            const shellOptions = {
                env: {
                    ...process.env,
                    ...simpleContext,
                    CI: 'true',
                    npm_config_yes: 'yes',
                    CONTINUOUS_INTEGRATION: 'true'
                },
                shell: true,
                cwd: this.currentFolder
            };

            //console.log("Executing command:", shell.cmd, shell.arg, code);
            //console.log("Environment PATH:", shellOptions.env.PATH);
            const proc = spawn(shell.cmd, [shell.arg, code], shellOptions);

            let output = ''; // To capture the output
            proc.stdout.on('data', (data) => {
                output += data.toString(); // Append real-time output
            });

            proc.stderr.on('data', (data) => {
                output += data.toString(); // Capture stderr in the output
            });

            proc.on('error', (err) => {
                reject(err);
            });

            proc.on('close', (code_) => {
                if (code_ === 0) {
                    resolve(output);
                } else {
                    reject(new Error(`Process exited with code ${code_}: ${output}`));
                }
            });
        });
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
                //console.error('Error executing bash:', stderr);
                return { output: stdout, error: stderr };
            }
            return { output: stdout };
        } catch (error) {
            //console.error('Execution error:', error);
            throw error;
        }
    }
}

module.exports = codeBlocks;