const fs = require("fs-extra");
const path = require("path");
const handlebars = require("handlebars");
const { promisify } = require("util");
const globLib = require("glob");
const codedown = require('codedown');
const globPromise = globLib.glob;
const { z } = require('zod');
const { zodToJsonSchema } = require('zod-to-json-schema');

class Code2Prompt {
  constructor(options) {
    this.options = options;
    this.extensions = options.extensions ? [].concat(options.extensions) : [];
    this.ignorePatterns = options.ignore ? [].concat(options.ignore) : [];
    // if specified, enforces a return schema (use zod)
    this.schema = options.schema ? (options.schema) : null;
    // if OPENAI_KEY is specified, it will be used to call the OpenAI API
    this.OPENAI_KEY = options.OPENAI_KEY ? (options.OPENAI_KEY) : null;
  }

  async loadAndRegisterTemplate(templatePath) {
    let templateContent;
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
      const schema = codedown(templateContent,"schema");
      if (schema) {
        // remove return schema statement from template
        const original = '```schema\n' + schema + '\n```'; 
        templateContent = templateContent.replace(original,"");
        this.template = handlebars.compile(templateContent);
        // debug
        //console.log('return schema:',schema);
        // build zod schema from template schema
        const json_parsed = JSON.parse(schema);
        const zod_schema = z.object({ schema:this.createZodSchema(json_parsed) });
        if (!this.schema) this.schema = zod_schema;
        const debug_ = zodToJsonSchema(this.schema, "mySchema");
        console.log('return ZOD schema:',JSON.stringify(debug_));
      }
    }    

  }

  async traverseDirectory(dirPath) {
    const absolutePath = path.resolve(dirPath);
    const files = await globPromise("**", {  cwd: absolutePath, nodir: true, absolute: true, ignore: this.ignorePatterns });
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

  async generateContextPrompt() {
    await this.loadAndRegisterTemplate(this.options.template);
    const { absolutePath, sourceTree, filesArray } = await this.traverseDirectory(this.options.path);
    const rendered = this.template({
      absolute_code_path: absolutePath,
      source_tree: sourceTree,
      files: filesArray,
    });
    //console.log(rendered);
    return rendered;
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
  

  async request(prompt='',schema=null) {
    await this.setupFetchPolyfill();
    const { OpenAIChatApi } = require('llm-api');
    const { completion } = require('zod-gpt');
    if (schema) {
        this.schema = z.object({ schema });
    }
    // calls the LLM with the context and enforced schema, with optional instruction prompt
    const context = await this.generateContextPrompt();
    if (this.OPENAI_KEY) {
        const openai = new OpenAIChatApi({ apiKey:this.OPENAI_KEY }, { model: 'gpt-4-0125-preview', minimumResponseTokens: 8192 });
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
            return_.usage = response.data;
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

