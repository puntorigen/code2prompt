const fs = require("fs-extra");
const path = require("path");
const handlebars = require("handlebars");
const { glob } = require("glob");
const codeBlocks = require('code-blocks')
const { z } = require('zod');
const { get_encoding, encoding_for_model } = require('tiktoken');
const gpt_tokenizer = encoding_for_model('gpt-4');

class Code2Prompt {
  constructor(options) {
    this.options = options;
    this.extensions = options.extensions ? [].concat(options.extensions) : [];
    this.ignorePatterns = options.ignore ? [].concat(options.ignore) : [];
    // if specified, enforces a return schema (use zod)
    this.schema = options.schema ? (options.schema) : null;
    this.code_blocks = {};
    this.QArecordings = {};
    this.last_QAsession = null;
    this.full_source_tree = false; //false=source_tree equals to files shown on prompt, true=source_tree contains all files ignoring exclusions
    this.binary = false; // false=skips binary files
    this.custom_viewers = {}; // registered custom file viewers (ex. docx, xlsx, pdf, etc)
    // if OPENAI_KEY is specified, it will be used to call the OpenAI API
    this.OPENAI_KEY = options.OPENAI_KEY ? (options.OPENAI_KEY) : null;
    this.loadAndRegisterTemplate(this.options.template);
  }

  registerFileViewer(ext,method) {
    this.custom_viewers[ext] = method;
  }

  recordQA(session='') {
    this.last_QAsession = session;
    if (!this.QArecordings[session]) this.QArecordings[session]=[];
  }

  getQArecordings(session) {
    return this.QArecordings[session];
  }

  async extractCodeBlocks(text) {
    // extract code blocks from a given text (maybe from an LLM response)
    return (await codeBlocks.fromString(text)).map((i)=>({
      lang: i.lang,
      code: i.value
    }));
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
            if (block.lang === 'schema' || block.lang === 'json:schema') {
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

  adjustIgnorePatterns(ignorePatterns, extensionsNotIgnored) {
    // Ensure all extensions in extensionsNotIgnored start with a dot
    const normalizedExtensions = extensionsNotIgnored.map(ext => ext.startsWith('.') ? ext : `.${ext}`);

    return ignorePatterns.reduce((acc, pattern) => {
        // Check if the pattern directly relates to a file extension
        if (pattern.startsWith('**/*.')) {
            // Extract the extension from the pattern
            const extPattern = path.extname(pattern);
            // Check if this extension is in the normalized list of extensions not to ignore
            if (normalizedExtensions.includes(extPattern)) {
                // If it is, do not add this pattern to the final list of ignore patterns
                return acc;
            }
        }
        // Otherwise, add the pattern to the final list
        acc.push(pattern);
        return acc;
    }, []);
  }

  async traverseDirectory(dirPath) {
    const absolutePath = path.resolve(dirPath);
    const ignorePatternsWithoutViewers = this.adjustIgnorePatterns(this.ignorePatterns,Object.keys(this.custom_viewers));
    const files = await glob("**", {  cwd: absolutePath, nodir: true, absolute: true, ignore: ignorePatternsWithoutViewers });
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
            let content = '';
            if (extension in this.custom_viewers) {
              content = await this.custom_viewers[extension](file);
            } else {
              content = await fs.readFile(file, 'utf-8');
            }
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

  async executeBlocks(pre=true,context_={}) {
    const code_helper = new (require('./codeBlocks'));
    const code_blocks = await this.getCodeBlocks();
    for (const block of code_blocks) {
      // test if block.lang ends with ':pre' or not
      if (block.lang.endsWith(':pre')===pre) {
          // if block.lang contains 'js'
          if (block.lang.includes('js')) {
              const code_executed = await code_helper.executeNode(context_,block.code);
              // if code_executed is an object
              if (typeof code_executed === 'object') {
                  //console.log('adding context from pre:js code block',code_executed);
                  context_ = {...context_,...code_executed};
              }
          }
      }
    }
    // TODO: check param context update safety (not dup context_ param because it may contain functions)
    return context_;
  }

  async runTemplate(prompt='', methods={}, context={}) {
    const code_helper = new (require('./codeBlocks'));
    const base_methods = {
      queryLLM:async(question,schema)=>{
        return await this.queryLLM(question,schema); 
      },
      queryContext:async(question,schema)=>{
        return await this.request(question,schema); 
      },
      extractCodeBlocks:this.extractCodeBlocks,
      require
    };
    const methods_ = {...base_methods, ...methods, ...{
      executeScript: async(code)=>{
        const code_executed = await code_helper.executeNode({...base_methods, ...methods, ...context},code);
        return code_executed;
      }
    }};
    //build handlebar template prompt first (to also get initial context vars)
    const context_prompt = await this.generateContextPrompt(null, true, context);
    let context_ = { ...methods_, ...context_prompt.context};
    //search x:pre codeblocks and execute
    context_ = await this.executeBlocks(true, context_);
    //execute prompt template if template contains a handlebar besides scripts
    //TODO 22-abr-24
    if (context_prompt.rendered.trim()!='') {
      const template_res = await this.request(prompt, null, {
        custom_variables: {...context_}
      });
      context_ = {...context_, ...{
        schema:template_res.data
      }};
    }
    //search x codeblocks and execute
    context_ = await this.executeBlocks(false, context_);

    return context_;
  }
  
  async generateContextPrompt(template=null,object=false,variables={}) {
    if (template) {
        await this.loadAndRegisterTemplate(template);
    }
    // TODO: optimize the following block
    let variables_ = {...variables}; // clone param
    let { absolutePath, sourceTree, filesArray } = await this.traverseDirectory(this.options.path);    
    if (Object.keys(variables_).length > 0) {
      if (!variables_.absolute_code_path) variables_.absolute_code_path=absolutePath;
      if (!variables_.source_tree) variables_.source_tree=sourceTree;
      if (!variables_.files) variables_.files=filesArray;
    } else {
      variables_ = {
        absolute_code_path: absolutePath,
        source_tree: sourceTree,
        files: filesArray
      };
    }
    let rendered = this.template(variables_);
    //console.log(rendered);
    if (object) {
        return {
            context: variables_,
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

  getLLM(content) {
    const { OpenAIChatApi } = require('llm-api');
    let llm = null;
    const context_tokens = gpt_tokenizer.encode(content).length;
    if (context_tokens<8100) {
      llm = new OpenAIChatApi({ apiKey:this.OPENAI_KEY, timeout:20000 }, { model: 'gpt-4', contextSize:8100 });
    } else {
      llm = new OpenAIChatApi({ apiKey:this.OPENAI_KEY, timeout:20000 }, { model: 'gpt-3.5-turbo-16k', contextSize:16200 });
    }
    return llm;
  }

  async queryLLM(prompt='',schema=null) {
    // query the LLM without context
    await this.setupFetchPolyfill();
    const { completion } = require('zod-gpt');
    if (this.OPENAI_KEY) {
        let openai = this.getLLM(prompt);
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

  async request(prompt='',schema=null,options={
    custom_context:null,
    meta:false,
    custom_variables:{}
  }) {
    await this.setupFetchPolyfill();
    const { completion } = require('zod-gpt');
    if (schema) {
        this.schema = z.object({ schema });
    }
    // calls the LLM with the context and enforced schema, with optional instruction prompt
    let context_ = null;
    let context = options.custom_context;
    if (!options.custom_context) {
        context_ = await this.generateContextPrompt(null,true,options.custom_variables);
        context = context_.rendered;
    } else {
        context_ = { context:options.custom_context, rendered:'' };
        context = '';
    }
    if (this.OPENAI_KEY) {
        const openai = this.getLLM(context);
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
        if (options.meta) {
            return_.context = context_.context;
            return_.code_blocks = this.code_blocks;
        }
        // add to this.QArecordings[this.last_QAsession]
        if (this.last_QAsession) {
          this.QArecordings[this.last_QAsession] = {
            question:prompt,
            answer:return_.data
          }
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
            // TODO add support for string values as z.enum 
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

