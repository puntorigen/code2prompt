const fs = require("fs-extra");
const path = require("path");
const handlebars = require("handlebars");
const { promisify } = require("util");
const globLib = require("glob");
const globPromise = globLib.glob;

class Code2Prompt {
  constructor(options) {
    this.options = options;
    this.extensions = options.extensions ? [].concat(options.extensions) : [];
    this.ignorePatterns = options.ignore ? [].concat(options.ignore) : [];
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

  async generatePrompt(templatePath) {
    await this.loadAndRegisterTemplate(templatePath || this.options.template);
    const { absolutePath, sourceTree, filesArray } = await this.traverseDirectory(this.options.path);
    const rendered = this.template({
      absolute_code_path: absolutePath,
      source_tree: sourceTree,
      files: filesArray,
    });
    //console.log(rendered);
    return rendered;
  }
}

!async function(){
    // Example usage
    const options = {
        path: ".",
        extensions: ["js", "hbs"], // Specify the extensions to filter for
        template: 'templates/default.hbs',
        ignore: ["**/node_modules/**"], // Specify patterns to ignore
    };
    const code2Prompt = new Code2Prompt(options);
    const prompt = await code2Prompt.generatePrompt();
    // add your prompt after 'prompt' or a template
    console.log(prompt);
}();