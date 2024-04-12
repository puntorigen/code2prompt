const fs = require("fs-extra");
const path = require("path");
const handlebars = require("handlebars");
const { glob } = require("glob");
const codeBlocks = require('code-blocks')
const { z } = require('zod');

class Code2Prompt {
  constructor(options) {
    this.options = options;
    this.extensions = options.extensions ? [].concat(options.extensions) : [];
    this.ignorePatterns = options.ignore ? [].concat(options.ignore) : [];
    // if specified, enforces a return schema (use zod)
    this.schema = options.schema ? (options.schema) : null;
    this.code_blocks = [];
    // if OPENAI_KEY is specified, it will be used to call the OpenAI API
    this.OPENAI_KEY = options.OPENAI_KEY ? (options.OPENAI_KEY) : null;
    this.loadAndRegisterTemplate(this.options.template);
  }

  async loadAndRegisterTemplate(templatePath) {
    let templateContent;
    this.code_blocks = [];
    if (templatePath) {
      templateContent = await fs.readFile(templatePath, 'utf-8');
    } else {
      // Fallback to a default template if not provided
      templateContent = `Project Path: {{absolute_code_path}}
      
Source Tree:

\`\`\`
{{source_tree}}
\`\`\`

{{#each files}}
{{#if code}}
\`{{path}}\`:

{{{code}}}

{{/if}}
{{/each}}
`;
    }
    this.template = handlebars.compile(templateContent);
    // extract return schema from template
    if (this.template) {
      //const schema = codedown(templateContent,"schema");
      const code_blocks = await codeBlocks.fromString(templateContent)
      if (code_blocks.length > 0) {
        // extract 'lang' defined code blocks into 'this.code_blocks' and remove them from template
        // if lang is 'schema' assign to schema
        for (let i=0; i<code_blocks.length; i++) {
            const block = code_blocks[i];
            // remove code block statement from template
            if (block.lang) {
                const original = '```'+block.lang+'\n' + block.value + '\n```'; 
                templateContent = templateContent.replace(original,"");
            }
            //
            if (block.lang === 'schema') {
                // build zod schema from template schema
                const json_parsed = JSON.parse(block.value);
                const zod_schema = z.object({ schema:this.createZodSchema(json_parsed) });
                if (!this.schema) this.schema = zod_schema;
            } else if (block.lang) {
                this.code_blocks.push({ lang:block.lang, code:block.value });
            }
        }
        this.template = handlebars.compile(templateContent);
        //console.log('code_blocks:',this.code_blocks);
      }
    }    

  }

  async traverseDirectory(dirPath) {
    const absolutePath = path.resolve(dirPath);
    const files = await glob("**", {  cwd: absolutePath, nodir: true, absolute: true, ignore: this.ignorePatterns });
    let tree = {};
    let filesArray = [];

    for (let file of files) {
      const extension = path.extname(file).toLowerCase();
      if (this.extensions.length === 0 || this.extensions.includes(extension.substring(1))) {
        const relativePath = path.relative(absolutePath, file);
        const parts = relativePath.split(path.sep);
        let current = tree;

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (i === parts.length - 1) {
            current[part] = relativePath;
            const content = await fs.readFile(file, 'utf-8');
            filesArray.push({ path: relativePath, code: content });
          } else {
            current[part] = current[part] || {};
            current = current[part];
          }
        }
      }
    }
    // Convert the tree object to a string representation similar to the source tree in the template
    const sourceTree = this.stringifyTree(tree);
    return { absolutePath, sourceTree, filesArray };
  }

  stringifyTree(tree, prefix = '') {
    let result = '';
    Object.keys(tree).forEach((key, index, array) => {
      const isLast = index === array.length - 1;
      result += `${prefix}${isLast ? '└── ' : '├── '}${key}\n`;
      if (typeof tree[key] === 'object') {
        result += this.stringifyTree(tree[key], `${prefix}${isLast ? '    ' : '|   '}`);
      }
    });
    return result;
  }

  async generateContextPrompt(template=null,object=false) {
    if (template) {
        await this.loadAndRegisterTemplate(template);
    }
    const { absolutePath, sourceTree, filesArray } = await this.traverseDirectory(this.options.path);
    const rendered = this.template({
      absolute_code_path: absolutePath,
      source_tree: sourceTree,
      files: filesArray,
    });
    //console.log(rendered);
    if (object) {
        return {
            context: {
                absolutePath,
                sourceTree,
                filesArray,
            },
            rendered: rendered
        };
    }
    return rendered;
  }

  getCodeBlocks() {
    return this.code_blocks;
  }

  //
  // calling prompt helper methods
  //

  async setupFetchPolyfill() {
    if (!globalThis.fetch) {
      const fetch = (await import('node-fetch')).default;
      globalThis.fetch = fetch;
      globalThis.Request = fetch.Request;
      globalThis.Response = fetch.Response;
      globalThis.Headers = fetch.Headers;
    }
  }

  async queryLLM(prompt='',schema=null) {
    // query the LLM without context
    await this.setupFetchPolyfill();
    const { OpenAIChatApi } = require('llm-api');
    const { completion } = require('zod-gpt');
    if (this.OPENAI_KEY) {
        const openai = new OpenAIChatApi({ apiKey:this.OPENAI_KEY, timeout:20000 }, { model: 'gpt-4' });
        let response = {};
        let return_ = { data:{}, usage:{} };
        if (schema) {
            response = await completion(openai, prompt, { schema: z.object({ schema }) });
        } else {
            response = await completion(openai, prompt);
        }
        if (response && response.data && response.data.schema) {
            return_.data = response.data.schema;
            return_.usage = response.usage;
        } else if (response && response.data) {
            return_.data = response.data;
        }
        return return_;
    }
  }

  async request(prompt='',schema=null,custom_context=null,meta=false) {
    await this.setupFetchPolyfill();
    const { OpenAIChatApi } = require('llm-api');
    const { completion } = require('zod-gpt');
    if (schema) {
        this.schema = z.object({ schema });
    }
    // calls the LLM with the context and enforced schema, with optional instruction prompt
    let context_ = null;
    let context = custom_context;
    if (!custom_context) {
        context_ = await this.generateContextPrompt(null,true);
        context = context_.rendered;
    } else {
        context_ = { context:custom_context, rendered:'' };
        context = '';
    }
    if (this.OPENAI_KEY) {
        const openai = new OpenAIChatApi({ apiKey:this.OPENAI_KEY, timeout:20000 }, { model: 'gpt-4', contextSize:context.length });
        let response = {};
        let return_ = { data:{}, usage:{} };
        if (prompt) {
            response = await completion(openai, context + '\n\n# ' + prompt, { schema: this.schema });
        } else {
            response = await completion(openai, context, { schema: this.schema });
        }
        if (response && response.data && response.data.schema) {
            return_.data = response.data.schema;
            return_.usage = response.usage;
        } else if (response && response.data) {
            return_.data = response.data;
        }
        if (meta) {
            return_.context = context_.context;
            return_.code_blocks = this.code_blocks;
        }
        return return_;
    }
    //
    console.log('No LLM key specified, returning empty response')
    return null;
  }

  createZodSchema(input) {
    if (Array.isArray(input)) {
        // Handle arrays; assumes first element structure for all elements
        if (input.length === 0) {
            return z.array(z.unknown());
        } else {
            return z.array(this.createZodSchema(input[0]));
        }
    } else if (typeof input === 'object' && input !== null) {
        // Handle objects
        const schemaFields = Object.keys(input).reduce((acc, key) => {
            // Use the value as description for nested fields if it's a string
            const fieldValue = input[key];
            acc[key] = typeof fieldValue === 'string' ? this.createZodSchema(fieldValue, key) : createZodSchema(fieldValue);
            return acc;
        }, {});
        return z.object(schemaFields);
    } else if (typeof input === 'string') {
        // Use the string value as the description
        return z.string().describe(input);
    } else {
        // For all other types, default to using z.string() without description
        // Adjust this part as necessary to handle more types explicitly
        return z.string();
    }
  }
}

module.exports = Code2Prompt;
//

