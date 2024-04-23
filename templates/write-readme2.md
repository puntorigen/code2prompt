Project Path: {{ absolute_code_path }}

I'd like you to generate a high-quality README file for this project, suitable for hosting on GitHub. Analyze the codebase to understand the purpose, functionality, and structure of the project. 

Source Tree:
```
{{ source_tree }}
```

{{#each files}}
{{#if code}}
`{{path}}`:

{{{code}}}

{{/if}}
{{/each}}

The README should include the following sections:

1. Project Title
2. Brief description (1-2 sentences)
3. Features
4. Installation instructions
5. Usage examples
6. Configuration options (if applicable) 
7. Contribution guidelines
8. Testing instructions
9. License
10. Acknowledgements/Credits

Write the content in Markdown format. Use your analysis of the code to generate accurate and helpful content, but also explain things clearly for users who may not be familiar with the implementation details.

Feel free to infer reasonable details if needed, but try to stick to what can be determined from the codebase itself.

```json:schema
{
    "readme": "content of the README file"
}
```

```js
// these code blocks are returned to 'request' if meta arg is true, in order, and removed from the template
// think this is good so if other libraries want to perform further processing on the results, they can define them within the templates
// nodejs code to run after getting results (runs within an isolated async function block)
// context vars: schema.readme, absolute_code_path, files, source_tree, etc (all the template vars)
const fs = require('fs').promises;
// save 'readme' schema.readme contents to disk (abs)
await fs.writeFile(`${absolute_code_path}/README-generated-test0a.md`, schema.readme, 'utf8');
```

```bash
# commands to run after the previous nodejs code block
```
