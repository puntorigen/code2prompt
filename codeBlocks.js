// helper for executing HBS action code blocks and giving them context
const safeEval = require('safe-eval');
const { z } = require('zod');

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

    async executeBash(context={},code=null) {
        console.log('TODO executeBash');
    }
}

module.exports = codeBlocks;